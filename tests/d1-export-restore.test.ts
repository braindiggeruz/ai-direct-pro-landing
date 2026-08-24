import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  prepareRestoreStatements,
  restoreD1Export,
  splitSqlStatements,
} from '../scripts/release/d1-export-restore';

test('D1 restore: the splitter preserves quoted and commented semicolons', () => {
  const statements = splitSqlStatements(`
    -- a comment; is not a statement
    CREATE TABLE sample (value TEXT);
    INSERT INTO sample VALUES ('one;two');
    /* another; comment */ INSERT INTO sample VALUES ("three;four");
  `);

  assert.equal(statements.length, 3);
  assert.match(statements[1], /'one;two'/);
  assert.match(statements[2], /"three;four"/);
});

test('D1 restore: the splitter keeps a complete trigger body together', () => {
  const statements = splitSqlStatements(`
    CREATE TABLE sample (value TEXT);
    CREATE TRIGGER sample_no_delete
    BEFORE DELETE ON sample
    BEGIN
      SELECT RAISE(ABORT, 'sample; is append-only');
    END;
    CREATE INDEX idx_sample_value ON sample (value);
  `);

  assert.equal(statements.length, 3);
  assert.match(statements[1], /^CREATE TRIGGER[\s\S]*RAISE[\s\S]*END;$/);
  assert.match(statements[2], /^CREATE INDEX/);
});

test('D1 restore: only the existing store parent index changes position', () => {
  const statements = [
    'BEGIN TRANSACTION;',
    'CREATE TABLE sotuvchi_stores (id TEXT PRIMARY KEY, org_id TEXT NOT NULL);',
    'CREATE TABLE child (org_id TEXT, store_id TEXT, FOREIGN KEY (org_id, store_id) REFERENCES sotuvchi_stores (org_id, id));',
    "INSERT INTO sotuvchi_stores VALUES ('store-1', 'org-1');",
    "INSERT INTO child VALUES ('org-1', 'store-1');",
    'CREATE UNIQUE INDEX idx_sotuvchi_stores_org_id ON sotuvchi_stores (org_id, id);',
    'COMMIT;',
  ];

  const prepared = prepareRestoreStatements(statements);
  assert.equal(prepared.reorderedStatements, 1);
  assert.equal(prepared.statements.length, statements.length);
  assert.match(prepared.statements[2], /idx_sotuvchi_stores_org_id/);
  assert.deepEqual(
    [...prepared.statements].sort(),
    [...statements].sort(),
  );
});

test('D1 restore: an isolated import proves integrity, foreign keys and safe aggregates', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'bormi-d1-restore-test-'));
  const dumpPath = path.join(temp, 'export.sql');
  const databasePath = path.join(temp, 'restored.sqlite');
  const dump = `
    PRAGMA foreign_keys=OFF;
    BEGIN TRANSACTION;
    CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
    CREATE TABLE identities (id TEXT PRIMARY KEY);
    CREATE TABLE organizations (id TEXT PRIMARY KEY);
    CREATE TABLE sotuvchi_stores (id TEXT PRIMARY KEY, org_id TEXT NOT NULL);
    CREATE TABLE memberships (id TEXT PRIMARY KEY);
    CREATE TABLE sotuvchi_products (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      FOREIGN KEY (org_id, store_id) REFERENCES sotuvchi_stores (org_id, id)
    );
    CREATE TABLE sotuvchi_orders (id TEXT PRIMARY KEY);
    CREATE TABLE sotuvchi_handoffs (id TEXT PRIMARY KEY);
    CREATE TABLE owner_audit_events (event_id TEXT PRIMARY KEY);
    CREATE TABLE seller_identity_binding_challenges (challenge_hash TEXT PRIMARY KEY);
    INSERT INTO d1_migrations VALUES (33, '0033_owner_audit_listing_actions.sql');
    INSERT INTO identities VALUES ('identity-1');
    INSERT INTO organizations VALUES ('org-1');
    INSERT INTO sotuvchi_stores VALUES ('store-1', 'org-1');
    INSERT INTO memberships VALUES ('membership-1');
    INSERT INTO sotuvchi_products VALUES ('product-1', 'org-1', 'store-1');
    INSERT INTO sotuvchi_orders VALUES ('order-1');
    INSERT INTO sotuvchi_handoffs VALUES ('handoff-1');
    INSERT INTO owner_audit_events VALUES ('event-1');
    CREATE UNIQUE INDEX idx_sotuvchi_stores_org_id ON sotuvchi_stores (org_id, id);
    COMMIT;
  `;

  try {
    await writeFile(dumpPath, dump, 'utf8');
    const report = await restoreD1Export({ dumpPath, databasePath });
    assert.equal(report.status, 'pass');
    assert.equal(report.reorderedStatements, 1);
    assert.equal(report.quickCheck, 'ok');
    assert.equal(report.integrityCheck, 'ok');
    assert.equal(report.foreignKeyViolations, 0);
    assert.equal(report.ledgerRows, 1);
    assert.equal(report.ledgerLast, '0033_owner_audit_listing_actions.sql');
    assert.deepEqual(report.aggregates, {
      identities: 1,
      organizations: 1,
      stores: 1,
      memberships: 1,
      products: 1,
      orders: 1,
      handoffs: 1,
      auditEvents: 1,
      bindingChallenges: 0,
    });

    const restored = await readFile(databasePath);
    assert.ok(restored.byteLength > 0);
    assert.doesNotMatch(JSON.stringify(report), /identity-1|org-1|store-1/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
