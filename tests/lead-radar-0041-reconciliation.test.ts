import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  LEAD_RADAR_0041_LEDGER_INSERT_SQL,
  LEAD_RADAR_0041_MIGRATION,
  parseLeadRadar0041Arguments,
  reconcileLeadRadar0041Ledger,
  type LeadRadar0041ReconciliationStore,
} from '../scripts/d1/reconcile-lead-radar-0041';

const ROOT = path.resolve(import.meta.dirname, '..');

function migrationSql(filename: string): string {
  return readFileSync(path.join(ROOT, 'migrations', filename), 'utf8');
}

function eligibleDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  database.prepare('INSERT INTO d1_migrations(id, name) VALUES (?, ?)')
    .run(40, '0040_classifieds_seller_lifecycle.sql');
  database.prepare('INSERT INTO d1_migrations(id, name) VALUES (?, ?)')
    .run(41, '0036_lead_radar.sql');
  database.exec(migrationSql('0036_lead_radar.sql'));
  database.exec(migrationSql('0041_lead_radar_search_leases.sql'));
  return database;
}

function sqliteStore(database: DatabaseSync): {
  store: LeadRadar0041ReconciliationStore;
  writes: string[];
} {
  const writes: string[] = [];
  return {
    writes,
    store: {
      async query(sql) {
        return database.prepare(sql).all() as Array<Record<string, unknown>>;
      },
      async execute(sql) {
        writes.push(sql);
        const result = database.prepare(sql).run();
        return { changes: Number(result.changes) };
      },
    },
  };
}

function ledgerTail(database: DatabaseSync): Array<{ id: number; name: string }> {
  const rows = database.prepare('SELECT id, name FROM d1_migrations WHERE id >= 40 ORDER BY id')
    .all() as Array<{ id: number; name: string }>;
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

test('dry-run is deterministic, proves eligibility, and writes nothing', async (t) => {
  const database = eligibleDatabase();
  t.after(() => database.close());
  const { store, writes } = sqliteStore(database);
  const first = await reconcileLeadRadar0041Ledger(store);
  const second = await reconcileLeadRadar0041Ledger(store);

  assert.deepEqual(second, first);
  assert.equal(first.status, 'eligible');
  assert.equal(first.mode, 'dry-run');
  assert.equal(first.localOnly, true);
  assert.equal(first.validation.audit, 'pass');
  assert.equal(first.validation.integrityOk, true);
  assert.equal(first.validation.foreignKeyViolations, 0);
  assert.equal(first.validation.ledgerState, 'eligible');
  assert.match(first.validation.schemaFingerprint ?? '', /^[0-9a-f]{64}$/);
  assert.equal(first.validation.preflightUnchanged, null);
  assert.equal(first.mutation.attempted, false);
  assert.equal(first.mutation.rowsInserted, 0);
  assert.deepEqual(writes, []);
  assert.deepEqual(ledgerTail(database), [
    { id: 40, name: '0040_classifieds_seller_lifecycle.sql' },
    { id: 41, name: '0036_lead_radar.sql' },
  ]);
});

test('execute writes the one exact row and a rerun is safely already reconciled', async (t) => {
  const database = eligibleDatabase();
  t.after(() => database.close());
  const { store, writes } = sqliteStore(database);

  const applied = await reconcileLeadRadar0041Ledger(store, { execute: true });
  assert.equal(applied.status, 'reconciled');
  assert.equal(applied.mode, 'execute');
  assert.equal(applied.validation.preflightUnchanged, true);
  assert.equal(applied.validation.ledgerState, 'reconciled');
  assert.equal(applied.mutation.attempted, true);
  assert.equal(applied.mutation.rowsInserted, 1);
  assert.deepEqual(writes, [LEAD_RADAR_0041_LEDGER_INSERT_SQL]);
  assert.deepEqual(ledgerTail(database), [
    { id: 40, name: '0040_classifieds_seller_lifecycle.sql' },
    { id: 41, name: '0036_lead_radar.sql' },
    { id: 42, name: LEAD_RADAR_0041_MIGRATION },
  ]);

  const rerun = await reconcileLeadRadar0041Ledger(store, { execute: true });
  assert.equal(rerun.status, 'already_reconciled');
  assert.equal(rerun.validation.ledgerState, 'reconciled');
  assert.equal(rerun.mutation.attempted, false);
  assert.equal(rerun.mutation.rowsInserted, 0);
  assert.equal(writes.length, 1);
  assert.equal(ledgerTail(database).length, 3);
});

test('wrong predecessor or any later ledger row blocks with zero writes', async (t) => {
  const wrongPredecessor = eligibleDatabase();
  const laterRow = eligibleDatabase();
  t.after(() => wrongPredecessor.close());
  t.after(() => laterRow.close());
  wrongPredecessor.prepare('UPDATE d1_migrations SET name = ? WHERE id = 40')
    .run('0040_unexpected.sql');
  laterRow.prepare('INSERT INTO d1_migrations(id, name) VALUES (?, ?)')
    .run(42, '0042_conflicting.sql');

  for (const database of [wrongPredecessor, laterRow]) {
    const { store, writes } = sqliteStore(database);
    const before = ledgerTail(database);
    const result = await reconcileLeadRadar0041Ledger(store, { execute: true });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(result.blockers, ['ledger_tail_mismatch']);
    assert.equal(result.mutation.attempted, false);
    assert.deepEqual(writes, []);
    assert.deepEqual(ledgerTail(database), before);
  }
});

test('physical 0041 drift blocks with zero writes', async (t) => {
  const database = eligibleDatabase();
  t.after(() => database.close());
  database.exec('DROP INDEX idx_lead_radar_suppressions_phone');
  const { store, writes } = sqliteStore(database);

  const result = await reconcileLeadRadar0041Ledger(store, { execute: true });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blockers, ['physical_schema_mismatch']);
  assert.equal(result.validation.audit, 'blocked');
  assert.equal(result.mutation.attempted, false);
  assert.deepEqual(writes, []);
  assert.equal(
    database.prepare('SELECT COUNT(*) AS count FROM d1_migrations WHERE name = ?')
      .get(LEAD_RADAR_0041_MIGRATION)?.count,
    0,
  );
});

test('foreign-key violations block reconciliation with zero writes', async (t) => {
  const database = eligibleDatabase();
  t.after(() => database.close());
  database.exec('PRAGMA foreign_keys = OFF');
  database.prepare(`INSERT INTO lead_radar_evidence (
    id, org_id, company_id, field_path, value, source_url,
    source_type, observed_at, confidence, classification
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      'evidence_orphan',
      'org_a',
      'missing_company',
      'website',
      'value',
      'https://example.test',
      'company_website',
      '2026-08-25T00:00:00.000Z',
      1,
      'fact',
    );
  database.exec('PRAGMA foreign_keys = ON');
  const { store, writes } = sqliteStore(database);

  const result = await reconcileLeadRadar0041Ledger(store, { execute: true });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blockers, ['physical_schema_mismatch']);
  assert.equal(result.validation.integrityOk, false);
  assert.equal(result.validation.foreignKeyViolations, 1);
  assert.equal(result.mutation.attempted, false);
  assert.deepEqual(writes, []);
});

test('a non-ok integrity check blocks reconciliation with zero writes', async (t) => {
  const database = eligibleDatabase();
  t.after(() => database.close());
  const base = sqliteStore(database);
  const store: LeadRadar0041ReconciliationStore = {
    async query(sql) {
      if (/^PRAGMA integrity_check$/i.test(sql.trim())) {
        return [{ integrity_check: 'synthetic_failure' }];
      }
      return base.store.query(sql);
    },
    execute: base.store.execute,
  };

  const result = await reconcileLeadRadar0041Ledger(store, { execute: true });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blockers, ['physical_schema_mismatch']);
  assert.equal(result.validation.integrityOk, false);
  assert.equal(result.mutation.attempted, false);
  assert.deepEqual(base.writes, []);
});

test('a changed schema fingerprint between preflights blocks before the INSERT', async (t) => {
  const database = eligibleDatabase();
  t.after(() => database.close());
  const base = sqliteStore(database);
  let fingerprintReads = 0;
  const store: LeadRadar0041ReconciliationStore = {
    async query(sql) {
      const rows = await base.store.query(sql);
      if (/^SELECT type, name, tbl_name, COALESCE\(sql, ''\) AS sql/i.test(sql.trim())) {
        fingerprintReads += 1;
        if (fingerprintReads === 1) {
          database.exec(`CREATE INDEX idx_lead_radar_test_drift
            ON lead_radar_searches (org_id)`);
        }
      }
      return rows;
    },
    execute: base.store.execute,
  };

  const result = await reconcileLeadRadar0041Ledger(store, { execute: true });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blockers, ['preflight_changed']);
  assert.equal(result.validation.preflightUnchanged, false);
  assert.equal(result.mutation.attempted, false);
  assert.deepEqual(base.writes, []);
  assert.equal(
    database.prepare('SELECT COUNT(*) AS count FROM d1_migrations WHERE name = ?')
      .get(LEAD_RADAR_0041_MIGRATION)?.count,
    0,
  );
});

test('the artifact exposes one bounded INSERT and no DDL or destructive statement', () => {
  assert.equal((LEAD_RADAR_0041_LEDGER_INSERT_SQL.match(/\bINSERT\b/gi) ?? []).length, 1);
  assert.match(LEAD_RADAR_0041_LEDGER_INSERT_SQL, /^INSERT INTO d1_migrations \(name\)/);
  assert.match(LEAD_RADAR_0041_LEDGER_INSERT_SQL, /SELECT '0041_lead_radar_search_leases\.sql'/);
  assert.doesNotMatch(
    LEAD_RADAR_0041_LEDGER_INSERT_SQL,
    /\b(?:CREATE|ALTER|DROP|UPDATE|DELETE|REPLACE|ATTACH|VACUUM)\b/i,
  );
});

test('CLI is dry-run by default, requires an explicit binding, and rejects remote mode', () => {
  assert.deepEqual(parseLeadRadar0041Arguments(['--database', 'gptbot-ai-drafts']), {
    database: 'gptbot-ai-drafts',
    config: null,
    execute: false,
  });
  assert.deepEqual(parseLeadRadar0041Arguments([
    '--database',
    'gptbot-ai-drafts',
    '--config',
    'wrangler.automation.toml',
    '--execute',
  ]), {
    database: 'gptbot-ai-drafts',
    config: 'wrangler.automation.toml',
    execute: true,
  });
  assert.throws(() => parseLeadRadar0041Arguments([]), /invalid_arguments/);
  assert.throws(
    () => parseLeadRadar0041Arguments(['--database', 'gptbot-ai-drafts', '--remote']),
    /invalid_arguments/,
  );
});
