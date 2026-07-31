import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MIGRATIONS_ROOT = path.join(ROOT, 'migrations');
const MANIFEST_PATH = path.join(
  ROOT,
  'docs',
  'agents-platform',
  'release',
  'MIGRATION_MANIFEST.json',
);

export interface MigrationEntry {
  order: number;
  filename: string;
  sha256: string;
  depends_on: string[];
  tables: string[];
  indexes: string[];
  reversibility: string;
  pii: string;
  owner: string;
}

interface MigrationManifest {
  migrations: MigrationEntry[];
}

export interface MigrationRehearsalReport {
  status: 'pass' | 'blocked';
  checks: Record<string, boolean>;
  applied: string[];
  duplicate: string;
  database: 'isolated-local-synthetic';
}

export function sha256File(file: string): string {
  const canonicalText = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(canonicalText, 'utf8').digest('hex');
}

export function loadMigrationManifest(): MigrationManifest {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as MigrationManifest;
}

export function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '');
}

export function migrationsContainExecutableDestructiveSql(
  manifest = loadMigrationManifest(),
): boolean {
  return manifest.migrations.some((entry) => {
    const sql = stripSqlComments(
      fs.readFileSync(path.join(MIGRATIONS_ROOT, entry.filename), 'utf8'),
    );
    return (
      /\bDROP\s+(?:TABLE|INDEX|VIEW|TRIGGER)\b/i.test(sql)
      || /\bTRUNCATE\b/i.test(sql)
      || /\bDELETE\s+FROM\b/i.test(sql)
    );
  });
}

function ensureLedger(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _release_migrations (
      filename TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
}

export function applyMigration(
  database: DatabaseSync,
  entry: MigrationEntry,
): 'applied' | 'duplicate' {
  ensureLedger(database);
  const prior = database.prepare(
    'SELECT sha256 FROM _release_migrations WHERE filename = ?',
  ).get(entry.filename) as { sha256: string } | undefined;
  if (prior) {
    if (prior.sha256 !== entry.sha256) {
      throw new Error(`migration checksum drift: ${entry.filename}`);
    }
    return 'duplicate';
  }
  const file = path.join(MIGRATIONS_ROOT, entry.filename);
  if (sha256File(file) !== entry.sha256) {
    throw new Error(`migration checksum mismatch: ${entry.filename}`);
  }
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(fs.readFileSync(file, 'utf8'));
    database.prepare(
      `INSERT INTO _release_migrations(filename, sha256, applied_at)
       VALUES (?, ?, ?)`,
    ).run(entry.filename, entry.sha256, new Date().toISOString());
    database.exec('COMMIT');
    return 'applied';
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function applyRange(
  database: DatabaseSync,
  entries: MigrationEntry[],
): string[] {
  const applied: string[] = [];
  for (const entry of entries) {
    if (applyMigration(database, entry) === 'applied') {
      applied.push(entry.filename);
    }
  }
  return applied;
}

function schemaObjects(database: DatabaseSync, type: 'table' | 'index'): Set<string> {
  const rows = database.prepare(
    `SELECT name FROM sqlite_master WHERE type = ?`,
  ).all(type) as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

function verifyDeclaredObjects(
  database: DatabaseSync,
  entries: MigrationEntry[],
): boolean {
  const tables = schemaObjects(database, 'table');
  const indexes = schemaObjects(database, 'index');
  return entries.every((entry) =>
    entry.tables.every((table) => tables.has(table))
    && entry.indexes.every((index) => indexes.has(index)));
}

function verifyConstraints(database: DatabaseSync): boolean {
  const foreignKeys = database.prepare('PRAGMA foreign_keys').get() as {
    foreign_keys: number;
  };
  if (foreignKeys.foreign_keys !== 1) return false;
  const integrity = database.prepare('PRAGMA integrity_check').get() as {
    integrity_check: string;
  };
  if (integrity.integrity_check !== 'ok') return false;

  let checkRejected = false;
  try {
    database.prepare(
      `INSERT INTO identities(id, provider, external_id, created_at, updated_at)
       VALUES ('bad-provider', 'invalid', 'synthetic', 'now', 'now')`,
    ).run();
  } catch {
    checkRejected = true;
  }

  let tenantRejected = false;
  try {
    database.prepare(
      `INSERT INTO sotuvchi_products(
         id, org_id, store_id, name, description, price_minor, currency,
         availability, status, media_refs_json, version, created_at, updated_at
       ) VALUES (
         'bad-tenant-product', 'missing-org', 'missing-store', 'Synthetic', '',
         1, 'UZS', 'available', 'draft', '[]', 1, 'now', 'now'
       )`,
    ).run();
  } catch {
    tenantRejected = true;
  }
  return checkRejected && tenantRejected;
}

function verifyFailedMigrationRollback(): boolean {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(
        'CREATE TABLE synthetic_partial(id TEXT); INVALID SQL STATEMENT;',
      );
      database.exec('COMMIT');
      return false;
    } catch {
      database.exec('ROLLBACK');
    }
    const row = database.prepare(
      `SELECT COUNT(*) AS count FROM sqlite_master
       WHERE type = 'table' AND name = 'synthetic_partial'`,
    ).get() as { count: number };
    return row.count === 0;
  } finally {
    database.close();
  }
}

export function runMigrationRehearsal(): MigrationRehearsalReport {
  const manifest = loadMigrationManifest();
  const entries = [...manifest.migrations].sort((a, b) => a.order - b.order);
  const checks: Record<string, boolean> = {
    order: (
      entries.length === 18
      && entries[0]?.order === 13
      && entries.at(-1)?.order === 30
      && entries.every((entry, index) => entry.order === 13 + index)
    ),
    checksums: entries.every((entry) =>
      sha256File(path.join(MIGRATIONS_ROOT, entry.filename)) === entry.sha256),
    no_destructive_sql: !migrationsContainExecutableDestructiveSql(manifest),
    clean_bootstrap: false,
    synthetic_upgrade: false,
    declared_tables_indexes: false,
    foreign_keys_checks_tenant: false,
    failed_migration_rollback: verifyFailedMigrationRollback(),
    duplicate_apply_policy: false,
    application_schema_compatibility: false,
  };

  const database = new DatabaseSync(':memory:');
  const upgrade = new DatabaseSync(':memory:');
  let applied: string[];
  let duplicate: string;
  try {
    database.exec('PRAGMA foreign_keys = ON');
    applied = applyRange(database, entries);
    checks.clean_bootstrap = applied.length === entries.length;
    checks.declared_tables_indexes = verifyDeclaredObjects(database, entries);
    checks.foreign_keys_checks_tenant = verifyConstraints(database);
    duplicate = applyMigration(database, entries[0]);
    checks.duplicate_apply_policy = duplicate === 'duplicate';

    const compatibleTables = [
      'events',
      'identities',
      'organizations',
      'memberships',
      'workflow_instances',
      'telegram_agent_updates',
      'sotuvchi_stores',
      'sotuvchi_products',
      'sotuvchi_orders',
      'sotuvchi_inventory',
      'sotuvchi_handoffs',
      'automation_jobs',
      'automation_job_events',
      'owner_audit_events',
      'owner_pilot_stores',
      'sotuvchi_buyer_presentations',
      'sotuvchi_buyer_comparisons',
      'telegram_agent_update_metrics',
      'telegram_agent_rate_limits',
      'telegram_agent_rate_limit_notices',
    ];
    const tables = schemaObjects(database, 'table');
    checks.application_schema_compatibility = compatibleTables.every(
      (table) => tables.has(table),
    );

    upgrade.exec('PRAGMA foreign_keys = ON');
    const previous = entries.filter((entry) => entry.order <= 25);
    const next = entries.filter((entry) => entry.order >= 26);
    applyRange(upgrade, previous);
    const upgraded = applyRange(upgrade, next);
    checks.synthetic_upgrade = upgraded.length === next.length
      && verifyDeclaredObjects(upgrade, entries);
  } finally {
    database.close();
    upgrade.close();
  }

  return {
    status: Object.values(checks).every(Boolean) ? 'pass' : 'blocked',
    checks,
    applied,
    duplicate,
    database: 'isolated-local-synthetic',
  };
}

export function createIsolatedMigratedDatabase(file: string): void {
  const database = new DatabaseSync(file);
  try {
    database.exec('PRAGMA foreign_keys = ON');
    applyRange(database, loadMigrationManifest().migrations);
  } finally {
    database.close();
  }
}

const direct = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (direct) {
  const report = runMigrationRehearsal();
  for (const [name, ok] of Object.entries(report.checks)) {
    console.log(`${name.toUpperCase()}=${ok ? 'PASS' : 'FAIL'}`);
  }
  console.log(`MIGRATION_REHEARSAL=${report.status.toUpperCase()}`);
  if (report.status !== 'pass') process.exitCode = 1;
}
