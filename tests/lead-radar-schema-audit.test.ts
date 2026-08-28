import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  assertLeadRadarAuditQueryIsReadOnly,
  auditLeadRadarD1Schema,
  auditLeadRadarSchema,
  LEAD_RADAR_MIGRATIONS,
  type LeadRadarSchemaReader,
} from '../functions/platform/lead-radar/schema-contract';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIGRATIONS = path.join(ROOT, 'migrations');

test('optional Firecrawl migration preserves the base runtime fingerprint and existing schema', async () => {
  const fixture = new SqliteD1();
  fixture.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  for (const filename of LEAD_RADAR_MIGRATIONS) {
    fixture.exec(migrationSql(filename));
    await fixture.prepare('INSERT INTO d1_migrations(name) VALUES (?)').bind(filename).run();
  }
  fixture.exec(migrationSql('0049_lead_radar_firecrawl.sql'));
  await fixture.prepare('INSERT INTO d1_migrations(name) VALUES (?)').bind('0049_lead_radar_firecrawl.sql').run();
  const report = await auditLeadRadarD1Schema(fixture.asD1(), 'target');
  assert.equal(report.status, 'pass', JSON.stringify(report.issues));
});

type SqlTransform = (sql: string) => string;

function migrationSql(filename: string): string {
  return readFileSync(path.join(MIGRATIONS, filename), 'utf8');
}

function createDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  return database;
}

function applyMigration(
  database: DatabaseSync,
  filename: string,
  ledger = true,
  transform?: SqlTransform,
): void {
  const source = migrationSql(filename);
  const sql = transform ? transform(source) : source;
  assert.notEqual(sql.length, 0);
  database.exec(sql);
  if (ledger) {
    database.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(filename);
  }
}

function canonicalDatabase(
  transformFilename?: string,
  transform?: SqlTransform,
): DatabaseSync {
  const database = createDatabase();
  for (const filename of LEAD_RADAR_MIGRATIONS) {
    applyMigration(
      database,
      filename,
      true,
      filename === transformFilename ? transform : undefined,
    );
  }
  return database;
}

function productionLikeDatabase(): DatabaseSync {
  const database = createDatabase();
  applyMigration(database, '0036_lead_radar.sql');
  applyMigration(database, '0041_lead_radar_search_leases.sql', false);
  return database;
}

function reader(database: DatabaseSync): LeadRadarSchemaReader {
  return {
    async query(sql) {
      return database.prepare(sql).all() as Array<Record<string, unknown>>;
    },
  };
}

function replaceExactly(before: string, after: string): SqlTransform {
  return (sql) => {
    assert.equal(sql.includes(before), true, `migration fixture must contain: ${before}`);
    const result = sql.replace(before, after);
    assert.notEqual(result, sql);
    return result;
  };
}

test('canonical pristine migration chain passes the exact target contract', async (t) => {
  const database = canonicalDatabase();
  t.after(() => database.close());
  const report = await auditLeadRadarSchema(reader(database), 'target');
  assert.equal(report.status, 'pass', JSON.stringify(report.issues, null, 2));
  assert.equal(report.matchedProfile, 'target');
  assert.equal(report.integrity.ok, true);
  assert.equal(report.migrationLedger.migration0041, 'ledgered');
  assert.deepEqual(report.migrationLedger.leadRadarEntries, [...LEAD_RADAR_MIGRATIONS].sort());
});

test('additive Telegram campaign extension does not take the research contract offline', async (t) => {
  const database = canonicalDatabase();
  t.after(() => database.close());
  applyMigration(database, '0045_lead_radar_telegram_campaigns.sql');
  const report = await auditLeadRadarSchema(reader(database), 'target');
  assert.equal(report.status, 'pass', JSON.stringify(report.issues, null, 2));
  assert.equal(report.matchedProfile, 'target');
  // The independently gated campaign contract owns 0045. The v2 research
  // ledger intentionally remains stable during a rolling migration.
  assert.deepEqual(report.migrationLedger.leadRadarEntries, [...LEAD_RADAR_MIGRATIONS].sort());
});

test('production-like 0041 physical/unledgered chain passes only its preflight profile', async (t) => {
  const database = productionLikeDatabase();
  t.after(() => database.close());
  const auto = await auditLeadRadarSchema(reader(database), 'auto');
  assert.equal(auto.status, 'pass', JSON.stringify(auto.issues, null, 2));
  assert.equal(auto.matchedProfile, 'production-preflight');
  assert.equal(auto.migrationLedger.migration0041, 'eligible_for_metadata_reconciliation');

  const target = await auditLeadRadarSchema(reader(database), 'target');
  assert.equal(target.status, 'blocked');
  assert.equal(target.matchedProfile, 'none');
});

test('0042 preserves historical telegram_count business data', (t) => {
  const database = createDatabase();
  t.after(() => database.close());
  applyMigration(database, '0036_lead_radar.sql');
  database.prepare(`INSERT INTO lead_radar_searches (
    id, org_id, input_json, status, telegram_count, created_at
  ) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('search_preserve_counter', 'org_a', '{}', 'ready', 7, '2026-08-25T00:00:00.000Z');
  applyMigration(database, '0041_lead_radar_search_leases.sql');
  applyMigration(database, '0042_lead_radar_decision_makers.sql');
  const row = database.prepare(
    'SELECT telegram_count FROM lead_radar_searches WHERE id = ?',
  ).get('search_preserve_counter') as { telegram_count: number };
  assert.equal(row.telegram_count, 7);
  assert.doesNotMatch(migrationSql('0042_lead_radar_decision_makers.sql'), /UPDATE\s+lead_radar_searches/i);
});

const migrationMutations: Array<{
  name: string;
  transform: SqlTransform;
  expectedCode: string;
}> = [
  {
    name: 'column type',
    transform: replaceExactly(
      'ADD COLUMN state_version INTEGER NOT NULL DEFAULT 0',
      'ADD COLUMN state_version TEXT NOT NULL DEFAULT 0',
    ),
    expectedCode: 'column_type_mismatch',
  },
  {
    name: 'column nullability',
    transform: replaceExactly(
      'ADD COLUMN state_version INTEGER NOT NULL DEFAULT 0',
      'ADD COLUMN state_version INTEGER DEFAULT 0',
    ),
    expectedCode: 'column_not_null_mismatch',
  },
  {
    name: 'column default',
    transform: replaceExactly(
      'ADD COLUMN state_version INTEGER NOT NULL DEFAULT 0',
      'ADD COLUMN state_version INTEGER NOT NULL DEFAULT 1',
    ),
    expectedCode: 'column_default_mismatch',
  },
  {
    name: 'quoted column default case',
    transform: replaceExactly(
      "ADD COLUMN phase TEXT NOT NULL DEFAULT 'completed'",
      "ADD COLUMN phase TEXT NOT NULL DEFAULT 'COMPLETED'",
    ),
    expectedCode: 'column_default_mismatch',
  },
  {
    name: 'primary key order',
    transform: replaceExactly(
      'PRIMARY KEY (org_id, job_id, effect_key)',
      'PRIMARY KEY (job_id, org_id, effect_key)',
    ),
    expectedCode: 'column_primary_key_mismatch',
  },
  {
    name: 'CHECK enum',
    transform: replaceExactly(
      "stage IN ('discovery', 'enrichment')",
      "stage IN ('discovery', 'enrichment', 'poisoned')",
    ),
    expectedCode: 'check_missing',
  },
  {
    name: 'quoted CHECK literal case',
    transform: replaceExactly(
      "phase IN ('queued', 'discovering', 'enriching', 'finalizing', 'completed')",
      "phase IN ('QUEUED', 'discovering', 'enriching', 'finalizing', 'completed')",
    ),
    expectedCode: 'check_missing',
  },
  {
    name: 'table UNIQUE constraint',
    transform: replaceExactly(
      'UNIQUE (org_id, idempotency_key)',
      'UNIQUE (idempotency_key, org_id)',
    ),
    expectedCode: 'unique_constraint_missing',
  },
  {
    name: 'index uniqueness',
    transform: replaceExactly(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_radar_searches_org_request_key',
      'CREATE INDEX IF NOT EXISTS idx_lead_radar_searches_org_request_key',
    ),
    expectedCode: 'index_uniqueness_mismatch',
  },
  {
    name: 'index columns',
    transform: replaceExactly(
      'ON lead_radar_jobs (status, stage, available_at, org_id, id)',
      'ON lead_radar_jobs (stage, status, available_at, org_id, id)',
    ),
    expectedCode: 'index_columns_mismatch',
  },
  {
    name: 'partial index SQL predicate',
    transform: replaceExactly(
      'WHERE request_key IS NOT NULL;',
      'WHERE length(request_key) > 0;',
    ),
    expectedCode: 'index_sql_mismatch',
  },
  {
    name: 'foreign key action',
    transform: replaceExactly(
      'REFERENCES lead_radar_jobs(org_id, id) ON DELETE CASCADE',
      'REFERENCES lead_radar_jobs(org_id, id) ON DELETE NO ACTION',
    ),
    expectedCode: 'foreign_key_mismatch',
  },
];

for (const mutation of migrationMutations) {
  test(`auditor rejects one-at-a-time ${mutation.name} drift`, async (t) => {
    const database = canonicalDatabase('0043_lead_radar_async_funnel.sql', mutation.transform);
    t.after(() => database.close());
    const report = await auditLeadRadarSchema(reader(database), 'target');
    assert.equal(report.status, 'blocked');
    assert.equal(
      report.issues.some((item) => item.code === mutation.expectedCode),
      true,
      JSON.stringify(report.issues, null, 2),
    );
  });
}

test('auditor rejects a missing Lead Radar object', async (t) => {
  const database = canonicalDatabase();
  t.after(() => database.close());
  database.exec('DROP INDEX idx_lead_radar_jobs_dispatch_lease');
  const report = await auditLeadRadarSchema(reader(database), 'target');
  assert.equal(report.status, 'blocked');
  assert.equal(report.issues.some((item) => item.code === 'missing_object'), true);
});

test('auditor rejects an extra Lead Radar object', async (t) => {
  const database = canonicalDatabase();
  t.after(() => database.close());
  database.exec('CREATE TABLE lead_radar_shadow (id TEXT)');
  const report = await auditLeadRadarSchema(reader(database), 'target');
  assert.equal(report.status, 'blocked');
  assert.equal(report.issues.some((item) => item.code === 'extra_object'), true);
});

test('auditor rejects a persisted foreign-key violation', async (t) => {
  const database = canonicalDatabase();
  t.after(() => database.close());
  database.exec('PRAGMA foreign_keys = OFF');
  database.prepare(`INSERT INTO lead_radar_job_effects (
    org_id, job_id, effect_key, payload_digest, applied_at
  ) VALUES (?, ?, ?, ?, ?)`)
    .run('org_missing', `lrjob_${'a'.repeat(32)}`, 'effect', 'b'.repeat(64), '2026-08-25T00:00:00.000Z');
  database.exec('PRAGMA foreign_keys = ON');
  const report = await auditLeadRadarSchema(reader(database), 'target');
  assert.equal(report.status, 'blocked');
  assert.equal(report.issues.some((item) => item.code === 'foreign_key_check_failed'), true);
});

test('auditor fails closed when integrity_check is not exactly ok', async (t) => {
  const database = canonicalDatabase();
  t.after(() => database.close());
  const base = reader(database);
  const report = await auditLeadRadarSchema({
    async query(sql) {
      if (/^PRAGMA integrity_check$/i.test(sql)) return [{ integrity_check: 'synthetic_failure' }];
      return base.query(sql);
    },
  }, 'target');
  assert.equal(report.status, 'blocked');
  assert.equal(report.issues.some((item) => item.code === 'integrity_check_failed'), true);
});

test('remote-compatible quick_check is explicit, strict, and read-only', async (t) => {
  const database = canonicalDatabase();
  t.after(() => database.close());
  const observed: string[] = [];
  const base = reader(database);
  const passing = await auditLeadRadarSchema({
    async query(sql) {
      assertLeadRadarAuditQueryIsReadOnly(sql);
      observed.push(sql);
      return base.query(sql);
    },
  }, 'target', 'quick_check');
  assert.equal(passing.status, 'pass', JSON.stringify(passing.issues, null, 2));
  assert.equal(observed.includes('PRAGMA quick_check'), true);
  assert.equal(observed.includes('PRAGMA integrity_check'), false);

  const blocked = await auditLeadRadarSchema({
    async query(sql) {
      if (/^PRAGMA quick_check$/i.test(sql)) return [{ quick_check: 'synthetic_failure' }];
      return base.query(sql);
    },
  }, 'target', 'quick_check');
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.issues.some((item) => item.code === 'integrity_check_failed'), true);
});

test('runtime target fingerprint is exact and costs four D1 statements', async () => {
  const fixture = new SqliteD1();
  fixture.exec(`CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  for (const filename of LEAD_RADAR_MIGRATIONS) {
    fixture.exec(migrationSql(filename));
    fixture.sqlite.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(filename);
  }
  let statements = 0;
  const compact = {
    prepare(sql: string) {
      statements += 1;
      return fixture.prepare(sql);
    },
  } as unknown as D1Database;
  const passing = await auditLeadRadarD1Schema(compact, 'target');
  assert.equal(passing.status, 'pass', JSON.stringify(passing.issues, null, 2));
  assert.equal(statements, 4);

  fixture.exec('DROP INDEX idx_lead_radar_tg_send_status');
  const blocked = await auditLeadRadarD1Schema(fixture.asD1(), 'target');
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.issues.some((item) => item.code === 'schema_fingerprint_mismatch'), true);
});

test('runtime target fingerprint treats D1-stripped DDL comments as non-semantic', async () => {
  const fixture = new SqliteD1();
  fixture.exec(`CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  for (const filename of LEAD_RADAR_MIGRATIONS) {
    const d1SerializedSql = migrationSql(filename).replace(/(^|\r?\n)[ \t]*--[^\r\n]*/g, '$1');
    fixture.exec(d1SerializedSql);
    fixture.sqlite.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(filename);
  }
  const report = await auditLeadRadarD1Schema(fixture.asD1(), 'target');
  assert.equal(report.status, 'pass', JSON.stringify(report.issues, null, 2));
});

test('runtime target fingerprint preserves exact quoted SQL values', async () => {
  for (const changedStatus of ['/*changed*/reserved', '--reserved', 'RESERVED', 're"served']) {
    const fixture = new SqliteD1();
    fixture.exec(`CREATE TABLE d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    for (const filename of LEAD_RADAR_MIGRATIONS) {
      const source = migrationSql(filename);
      const sql = filename === '0044_lead_radar_telegram_business.sql'
        ? source.replace("status IN ('reserved',", `status IN ('${changedStatus}',`)
        : source;
      fixture.exec(sql);
      fixture.sqlite.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(filename);
    }
    const report = await auditLeadRadarD1Schema(fixture.asD1(), 'target');
    assert.equal(report.status, 'blocked');
    assert.equal(report.issues.some((item) => item.code === 'schema_fingerprint_mismatch'), true);
  }
});

test('runtime target fingerprint follows SQLite LF-only line-comment termination', async () => {
  const fixture = new SqliteD1();
  fixture.exec(`CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  for (const filename of LEAD_RADAR_MIGRATIONS) {
    const source = migrationSql(filename);
    const sql = filename === '0044_lead_radar_telegram_business.sql'
      ? source.replace(
        '  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),',
        '  -- comment with a lone CR\rstill comment until LF\n  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),',
      )
      : source;
    fixture.exec(sql);
    fixture.sqlite.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(filename);
  }
  const report = await auditLeadRadarD1Schema(fixture.asD1(), 'target');
  assert.equal(report.status, 'pass', JSON.stringify(report.issues, null, 2));
});

test('auditor fails closed without leaking query errors', async () => {
  const report = await auditLeadRadarSchema({
    async query() {
      throw new Error('raw account and SQL details must not escape');
    },
  }, 'target');
  assert.equal(report.status, 'blocked');
  assert.deepEqual(report.issues, [{ code: 'audit_query_failed', object: 'lead_radar_schema' }]);
  assert.doesNotMatch(JSON.stringify(report), /raw account|SQL details/);
});

test('every canonical auditor query is independently guarded as read-only', async (t) => {
  const database = canonicalDatabase();
  t.after(() => database.close());
  const observed: string[] = [];
  const base = reader(database);
  const report = await auditLeadRadarSchema({
    async query(sql) {
      assertLeadRadarAuditQueryIsReadOnly(sql);
      observed.push(sql);
      return base.query(sql);
    },
  }, 'target');
  assert.equal(report.status, 'pass', JSON.stringify(report.issues, null, 2));
  assert.equal(observed.length >= 8, true);
  assert.equal(observed.every((sql) => sql.split(/\bUNION ALL\b/i).length <= 4), true);
  assert.throws(
    () => assertLeadRadarAuditQueryIsReadOnly('UPDATE lead_radar_searches SET status = status'),
    /non_read_only/,
  );
  assert.throws(
    () => assertLeadRadarAuditQueryIsReadOnly('SELECT 1; DELETE FROM lead_radar_searches'),
    /non_read_only/,
  );
  assert.throws(
    () => assertLeadRadarAuditQueryIsReadOnly('PRAGMA foreign_keys = OFF'),
    /non_read_only/,
  );
});

test('0043 state constraints reject invalid enum, counter, and effect digest values', (t) => {
  const database = canonicalDatabase();
  t.after(() => database.close());
  database.prepare(`INSERT INTO lead_radar_searches (
    id, org_id, input_json, status, created_at
  ) VALUES (?, ?, ?, ?, ?)`)
    .run('search_constraint_test', 'org_a', '{}', 'running', '2026-08-25T00:00:00.000Z');
  assert.throws(
    () => database.prepare('UPDATE lead_radar_searches SET phase = ? WHERE id = ?')
      .run('poisoned', 'search_constraint_test'),
    /constraint/i,
  );
  assert.throws(
    () => database.prepare('UPDATE lead_radar_searches SET pending_count = -1 WHERE id = ?')
      .run('search_constraint_test'),
    /constraint/i,
  );
  assert.throws(
    () => database.prepare(`INSERT INTO lead_radar_jobs (
      id, org_id, search_id, idempotency_key, stage, status,
      available_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)`)
      .run(`lrjob_${'c'.repeat(32)}`, 'org_a', 'search_constraint_test', 'bad-stage', 'poisoned',
        '2026-08-25T00:00:00.000Z', '2026-08-25T00:00:00.000Z', '2026-08-25T00:00:00.000Z'),
    /constraint/i,
  );

  database.prepare(`INSERT INTO lead_radar_jobs (
    id, org_id, search_id, idempotency_key, stage, status,
    available_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'discovery', 'queued', ?, ?, ?)`)
    .run(`lrjob_${'d'.repeat(32)}`, 'org_a', 'search_constraint_test', 'valid-job',
      '2026-08-25T00:00:00.000Z', '2026-08-25T00:00:00.000Z', '2026-08-25T00:00:00.000Z');
  assert.throws(
    () => database.prepare(`INSERT INTO lead_radar_job_effects (
      org_id, job_id, effect_key, payload_digest, applied_at
    ) VALUES (?, ?, ?, ?, ?)`)
      .run('org_a', `lrjob_${'d'.repeat(32)}`, 'effect', 'not-a-sha256', '2026-08-25T00:00:00.000Z'),
    /constraint/i,
  );
});
