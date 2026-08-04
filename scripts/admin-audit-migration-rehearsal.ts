/**
 * Rehearse `0033_owner_audit_listing_actions.sql` against a restored copy of
 * production, before it is applied to production.
 *
 * The migration rebuilds `owner_audit_events` to widen two CHECK lists. SQLite
 * cannot alter a CHECK in place, so the table is copied — and a table copy is
 * exactly the kind of change that silently loses a row, a constraint or an
 * index. This proves it does not.
 *
 * It never touches production. It reads a backup file and works on a local
 * database it creates itself, and it prints counts, fingerprints and schema —
 * never a row, never an address, never a name.
 *
 *   npm run admin:audit-rehearsal -- <path-to-backup.sql>
 */

import { DatabaseSync } from 'node:sqlite';
import { readFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const MIGRATION = 'migrations/0033_owner_audit_listing_actions.sql';
const WORK_DIR = process.env.REHEARSAL_DIR
  ?? path.join(process.env.TEMP ?? '.', 'bormi-audit-rehearsal');

type Row = Record<string, unknown>;

/** Statements, split on the semicolons that end them rather than on every one. */
function statements(sql: string): string[] {
  const out: string[] = [];
  let buffer = '';
  let inString = false;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (character === "'") inString = !inString;
    buffer += character;
    if (character === ';' && !inString) {
      const trimmed = buffer.trim();
      if (trimmed && trimmed !== ';') out.push(trimmed);
      buffer = '';
    }
  }
  if (buffer.trim()) out.push(buffer.trim());
  return out;
}

/**
 * A fingerprint over every audit row, ordered deterministically.
 *
 * If the copy changes any value in any row, this changes. It hashes the values
 * rather than printing them, so the check is exact and the output is safe.
 */
function auditFingerprint(db: DatabaseSync): string {
  const rows = db.prepare(
    `SELECT event_id, actor_email, actor_role, action, target_type, target_id,
            org_id, reason_code, request_id, idempotency_key,
            before_json, after_json, created_at
       FROM owner_audit_events
      ORDER BY event_id`,
  ).all() as Row[];
  const hash = createHash('sha256');
  for (const row of rows) hash.update(JSON.stringify(row));
  return hash.digest('hex');
}

function schemaOf(db: DatabaseSync, name: string): string {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE name = ?",
  ).get(name) as Row | undefined;
  return String(row?.sql ?? '');
}

function indexesOf(db: DatabaseSync, table: string): string[] {
  return (db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=? ORDER BY name",
  ).all(table) as Row[]).map((row) => String(row.name));
}

function check(label: string, ok: boolean, detail = ''): boolean {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  return ok;
}

async function main(): Promise<void> {
  const backup = process.argv[2];
  if (!backup || !existsSync(backup)) {
    throw new Error('usage: admin-audit-migration-rehearsal.ts <path-to-backup.sql>');
  }

  await mkdir(WORK_DIR, { recursive: true });
  const dbPath = path.join(WORK_DIR, 'restored.sqlite');
  await rm(dbPath, { force: true });

  console.log('restoring the backup into a local database…');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = OFF');

  const dump = await readFile(backup, 'utf8');
  let applied = 0;
  let skipped = 0;
  for (const statement of statements(dump)) {
    try {
      db.exec(statement);
      applied += 1;
    } catch {
      // A D1 export can carry statements a plain SQLite build rejects. They are
      // counted rather than ignored silently, and the audit table is verified
      // to exist regardless.
      skipped += 1;
    }
  }
  console.log(`restored: ${applied} statements applied, ${skipped} skipped\n`);

  let ok = true;

  // ── Baseline ───────────────────────────────────────────────────────────────
  ok = check('backup restores and the audit table exists',
    schemaOf(db, 'owner_audit_events').includes('owner_audit_events')) && ok;

  const rowsBefore = Number(
    (db.prepare('SELECT COUNT(*) AS n FROM owner_audit_events').get() as Row).n,
  );
  const fingerprintBefore = auditFingerprint(db);
  const indexesBefore = indexesOf(db, 'owner_audit_events');
  const productsBefore = Number(
    (db.prepare('SELECT COUNT(*) AS n FROM sotuvchi_products').get() as Row).n,
  );

  console.log(`AUDIT_ROWS_BEFORE=${rowsBefore}`);
  console.log(`AUDIT_FINGERPRINT_BEFORE=${fingerprintBefore.slice(0, 16)}…`);
  console.log(`AUDIT_INDEXES_BEFORE=${indexesBefore.join(', ')}`);
  console.log(`PRODUCTS_BEFORE=${productsBefore}\n`);

  const integrityBefore = String(
    (db.prepare('PRAGMA integrity_check').get() as Row).integrity_check,
  );
  ok = check('integrity_check before', integrityBefore === 'ok', integrityBefore) && ok;
  ok = check('foreign_key_check before',
    (db.prepare('PRAGMA foreign_key_check').all() as Row[]).length === 0) && ok;

  // The old constraint must actually reject a listing action, or the migration
  // would be unnecessary and this rehearsal would prove nothing.
  let rejectedBefore = false;
  try {
    db.exec(`INSERT INTO owner_audit_events VALUES
      ('probe-old','a@b.c','platform_owner','listing.publish','product','p1','o1',
       'data_quality','r1','k-probe-old',NULL,NULL,'2026-08-04T00:00:00.000Z')`);
  } catch {
    rejectedBefore = true;
  }
  ok = check('the current CHECK rejects listing.publish (migration is needed)',
    rejectedBefore) && ok;

  // ── Apply ──────────────────────────────────────────────────────────────────
  console.log('\napplying 0033…');
  const migration = await readFile(MIGRATION, 'utf8');
  for (const statement of statements(migration)) db.exec(statement);
  console.log('applied\n');

  // ── Verify ─────────────────────────────────────────────────────────────────
  const rowsAfter = Number(
    (db.prepare('SELECT COUNT(*) AS n FROM owner_audit_events').get() as Row).n,
  );
  const fingerprintAfter = auditFingerprint(db);
  const indexesAfter = indexesOf(db, 'owner_audit_events');
  const productsAfter = Number(
    (db.prepare('SELECT COUNT(*) AS n FROM sotuvchi_products').get() as Row).n,
  );

  ok = check('every audit row survived', rowsAfter === rowsBefore,
    `${rowsBefore} -> ${rowsAfter}`) && ok;
  ok = check('every surviving row is byte-identical',
    fingerprintAfter === fingerprintBefore) && ok;
  ok = check('every index survived',
    indexesAfter.join(',') === indexesBefore.join(','),
    indexesAfter.join(', ')) && ok;
  ok = check('business tables untouched', productsAfter === productsBefore,
    `products ${productsBefore} -> ${productsAfter}`) && ok;

  const schema = schemaOf(db, 'owner_audit_events');
  for (const kept of [
    "actor_role IN ('platform_owner', 'support_readonly')",
    'UNIQUE (idempotency_key)',
    'event_id          TEXT PRIMARY KEY',
    "reason_code       TEXT NOT NULL",
  ]) {
    ok = check(`constraint preserved: ${kept.slice(0, 44)}`, schema.includes(kept)) && ok;
  }
  for (const verb of ['store.suspend', 'seller.bind', 'automation.replay']) {
    ok = check(`existing action still allowed: ${verb}`, schema.includes(verb)) && ok;
  }

  // The three new verbs are accepted, and each one is written against a product.
  let inserted = 0;
  for (const action of ['listing.publish', 'listing.unpublish', 'listing.archive']) {
    try {
      db.prepare(
        `INSERT INTO owner_audit_events VALUES
          (?,'owner@example.invalid','platform_owner',?,'product','probe-product',
           'probe-org','data_quality','probe-request',?,NULL,NULL,?)`,
      ).run(`probe-${action}`, action, `probe-key-${action}`, '2026-08-04T00:00:00.000Z');
      inserted += 1;
    } catch {
      // counted below
    }
  }
  ok = check('all three listing actions are accepted', inserted === 3, `${inserted}/3`) && ok;

  // And an invented verb is still refused: the list widened, it did not open.
  let refused = false;
  try {
    db.exec(`INSERT INTO owner_audit_events VALUES
      ('probe-bad','a@b.c','platform_owner','listing.delete','product','p','o',
       'data_quality','r','k-bad',NULL,NULL,'2026-08-04T00:00:00.000Z')`);
  } catch {
    refused = true;
  }
  ok = check('an action outside the list is still refused', refused) && ok;

  let badTarget = false;
  try {
    db.exec(`INSERT INTO owner_audit_events VALUES
      ('probe-bt','a@b.c','platform_owner','listing.publish','invented','p','o',
       'data_quality','r','k-bt',NULL,NULL,'2026-08-04T00:00:00.000Z')`);
  } catch {
    badTarget = true;
  }
  ok = check('a target type outside the list is still refused', badTarget) && ok;

  // Idempotency is still enforced by the UNIQUE constraint after the rebuild.
  let duplicate = false;
  try {
    db.exec(`INSERT INTO owner_audit_events VALUES
      ('probe-dup','a@b.c','platform_owner','listing.publish','product','p','o',
       'data_quality','r','probe-key-listing.publish',NULL,NULL,'2026-08-04T00:00:00.000Z')`);
  } catch {
    duplicate = true;
  }
  ok = check('a duplicate idempotency key is still refused', duplicate) && ok;

  const integrityAfter = String(
    (db.prepare('PRAGMA integrity_check').get() as Row).integrity_check,
  );
  ok = check('integrity_check after', integrityAfter === 'ok', integrityAfter) && ok;
  ok = check('foreign_key_check after',
    (db.prepare('PRAGMA foreign_key_check').all() as Row[]).length === 0) && ok;

  db.close();
  console.log(`\nADMIN_AUDIT_MIGRATION_REHEARSAL=${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
