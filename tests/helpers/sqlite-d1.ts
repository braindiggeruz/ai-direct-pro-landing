import {
  DatabaseSync,
  type SQLInputValue,
} from 'node:sqlite';

function safeInspect(value: unknown): string {
  try {
    return JSON.stringify(value)?.slice(0, 200) ?? String(value);
  } catch {
    return String(value);
  }
}

function sqliteValue(value: unknown, index: number): SQLInputValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'bigint'
    || value instanceof Uint8Array
  ) {
    return value;
  }
  // D1 accepts only null, number, string and ArrayBuffer. Naming the offending
  // value turns "unsupported sqlite fixture value" from a hunt through the
  // call site into a one-line answer.
  throw new Error(`unsupported sqlite fixture value at ?${index + 1}: ${typeof value} ${safeInspect(value)}`);
}

export class SqliteD1Statement {
  private bindings: SQLInputValue[] = [];

  constructor(
    private readonly sqlite: DatabaseSync,
    readonly sql: string,
  ) {}

  bind(...values: unknown[]): SqliteD1Statement {
    this.bindings = values.map((value, index) => sqliteValue(value, index));
    return this;
  }

  async run(): Promise<D1Result<unknown>> {
    return this.runSync();
  }

  runSync(): D1Result<unknown> {
    const result = this.sqlite.prepare(this.sql).run(...this.bindings);
    return {
      success: true,
      results: [],
      meta: { changes: Number(result.changes) },
    } as unknown as D1Result<unknown>;
  }

  async first<T>(): Promise<T | null> {
    const row = this.sqlite.prepare(this.sql).get(...this.bindings);
    return (row ?? null) as T | null;
  }

  async all<T>(): Promise<D1Result<T>> {
    const rows = this.sqlite.prepare(this.sql).all(...this.bindings);
    return {
      success: true,
      results: rows as T[],
      meta: { changes: 0 },
    } as unknown as D1Result<T>;
  }
}

export class SqliteD1 {
  readonly sqlite = new DatabaseSync(':memory:');

  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys = ON');
  }

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this.sqlite, sql);
  }

  async batch(
    statements: readonly D1PreparedStatement[],
  ): Promise<D1Result<unknown>[]> {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof SqliteD1Statement)) {
          throw new Error('foreign statement in sqlite fixture');
        }
        return statement.runSync();
      });
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  rows<T>(sql: string, ...values: SQLInputValue[]): T[] {
    return this.sqlite.prepare(sql).all(...values) as T[];
  }

  value(sql: string, ...values: SQLInputValue[]): unknown {
    const row = this.sqlite.prepare(sql).get(...values);
    return row ? Object.values(row)[0] : null;
  }

  exec(sql: string): void {
    this.sqlite.exec(sql);
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}
