/**
 * AUTH-1 migration rehearsal, offline.
 *
 * Builds a local SQLite database in the state production is actually in — every
 * migration through 0030 physically applied, but a `d1_migrations` ledger that
 * stops at 0025 — then walks the exact sequence an owner would authorise:
 * reconcile the ledger, rebuild the audit table, add the challenge table, mint,
 * redeem, replay, roll back.
 *
 * It touches nothing remote. There is no Cloudflare binding in this file, no
 * account id, no token, and no network call; `wrangler` is never invoked. The
 * point is to answer "what will those statements do to those rows" before any
 * of it is allowed near production.
 *
 *   npx tsx scripts/d1/rehearse-auth1.ts
 *
 * Exit code 0 means every assertion below held.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createSellerBindingChallenge,
  redeemSellerBindingChallenge,
  resetBindingAttempts,
  SellerBindingError,
} from '../../functions/platform/admin/seller-binding';
import type { Env } from '../../functions/_types';
import { SqliteD1 } from '../../tests/helpers/sqlite-d1';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const MIGRATIONS = path.join(ROOT, 'migrations');
const RECONCILE = path.join(ROOT, 'scripts/d1/reconcile-ledger-0026-0030.sql');

const ORG = 'org_rehearsal';
const STORE = 'store_rehearsal';
/** Synthetic. The owner's real Telegram account takes no part in a rehearsal. */
const TELEGRAM = 'identity_tg_synthetic';
const OWNER_EMAIL = 'owner@rehearsal.invalid';
const AT = new Date('2026-08-03T12:00:00.000Z');

let step = 0;
let failures = 0;

function say(message: string): void {
  process.stdout.write(`${message}\n`);
}

function check(label: string, condition: boolean, detail = ''): void {
  step += 1;
  if (!condition) failures += 1;
  say(`${condition ? 'PASS' : 'FAIL'}  ${String(step).padStart(2, '0')}. ${label}${detail ? ` — ${detail}` : ''}`);
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
}

function apply(db: SqliteD1, file: string): void {
  db.exec(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
}

function count(db: SqliteD1, sql: string, ...binds: string[]): number {
  return Number(db.value(sql, ...binds) ?? 0);
}

function indexes(db: SqliteD1, table: string): { name: string; sql: string }[] {
  return db.rows<{ name: string; sql: string }>(
    `SELECT name, sql FROM sqlite_master
      WHERE type = 'index' AND tbl_name = '${table}' AND name NOT LIKE 'sqlite_%'
      ORDER BY name`,
  );
}

function normalise(sql: string): string {
  return sql.replace(/\s+/g, ' ').replace(/IF NOT EXISTS /, '').trim();
}

/** The database as production stands today: schema at 0030, ledger at 0025. */
function productionShapedDb(options: { withLedgerDrift?: boolean } = {}): SqliteD1 {
  const db = new SqliteD1();
  for (const file of migrationFiles().filter((name) => name < '0031')) apply(db, file);
  db.exec(`
    CREATE TABLE d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const recorded = options.withLedgerDrift === false ? migrationFiles() : migrationFiles().filter((n) => n < '0026');
  for (const name of recorded.filter((name) => name < '0031')) {
    db.exec(`INSERT INTO d1_migrations (name) VALUES ('${name}');`);
  }
  return db;
}

function seed(db: SqliteD1, membership?: { role: string; status: string }): void {
  const now = '2026-08-01T00:00:00.000Z';
  db.exec(`
    INSERT INTO identities (id, provider, external_id, created_at, updated_at)
    VALUES ('${TELEGRAM}', 'telegram', '999000111', '${now}', '${now}'),
           ('identity_api_rehearsal', 'api', 'rehearsal-key', '${now}', '${now}');
    INSERT INTO organizations (id, name, slug, status, default_locale, created_at, updated_at)
    VALUES ('${ORG}', 'Rehearsal', 'rehearsal', 'active', 'uz', '${now}', '${now}');
    INSERT INTO sotuvchi_stores (
      id, org_id, name, locale, delivery_mode, payment_methods_json,
      storefront_code, status, created_at, updated_at
    ) VALUES ('${STORE}', '${ORG}', 'Rehearsal Shop', 'uz', 'both', '["cash"]',
              'rehearsal', 'active', '${now}', '${now}');
    INSERT INTO memberships (id, org_id, identity_id, role, status, created_at, updated_at)
    VALUES ('membership_api', '${ORG}', 'identity_api_rehearsal', 'owner', 'active', '${now}', '${now}');
  `);
  if (membership) {
    db.exec(`
      INSERT INTO memberships (id, org_id, identity_id, role, status, created_at, updated_at)
      VALUES ('membership_tg', '${ORG}', '${TELEGRAM}', '${membership.role}', '${membership.status}', '${now}', '${now}');
    `);
  }
  // The six owner audit events production already holds, in the old vocabulary.
  for (let index = 0; index < 6; index += 1) {
    db.exec(`
      INSERT INTO owner_audit_events (
        event_id, actor_email, actor_role, action, target_type, target_id, org_id,
        reason_code, request_id, idempotency_key, before_json, after_json, created_at
      ) VALUES (
        'oaudit_seed_${index}', '${OWNER_EMAIL}', 'platform_owner',
        '${index % 2 === 0 ? 'store.suspend' : 'store.restore'}', 'store', '${STORE}',
        '${ORG}', 'policy_violation', 'req_seed_${index}', 'key_seed_${index}',
        '{"status":"active"}', '{"status":"suspended"}', '2026-07-0${index + 1}T00:00:00.000Z'
      );
    `);
  }
}

const env = {
  MARKET_OWNER_TELEGRAM_BINDING_ENABLED: 'true',
  MARKET_MINI_APP_SELLER_READS_ENABLED: 'true',
  MARKET_MINI_APP_SELLER_COMMANDS_ENABLED: 'true',
} as unknown as Env;

async function code(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'ok';
  } catch (error) {
    return error instanceof SellerBindingError ? error.code : `unexpected:${String(error)}`;
  }
}

async function main(): Promise<void> {
  say('AUTH-1 rehearsal — local SQLite only, nothing remote is contacted.\n');
  resetBindingAttempts();

  // ── Baseline ────────────────────────────────────────────────────────────────
  const db = productionShapedDb();
  seed(db);
  check('baseline integrity_check', db.value('PRAGMA integrity_check') === 'ok');
  check('baseline foreign_key_check', db.rows('PRAGMA foreign_key_check').length === 0);
  check('baseline owner_audit_events row count is 6', count(db, 'SELECT COUNT(*) FROM owner_audit_events') === 6);
  const auditBefore = db.rows<Record<string, unknown>>('SELECT * FROM owner_audit_events ORDER BY event_id');
  const indexesBefore = indexes(db, 'owner_audit_events');
  check('baseline owner_audit_events carries 3 indexes', indexesBefore.length === 3,
    indexesBefore.map((row) => row.name).join(', '));
  check('baseline ledger stops at 0025', count(db, 'SELECT COUNT(*) FROM d1_migrations') === 25);

  // ── Step 1 · ledger metadata reconciliation ────────────────────────────────
  db.exec(readFileSync(RECONCILE, 'utf8'));
  const ledger = db.rows<{ name: string }>('SELECT name FROM d1_migrations ORDER BY id').map((row) => row.name);
  check('ledger reconciliation writes exactly 5 rows', ledger.length === 30);
  check('ledger now names 0026-0030 in order', ledger.slice(25).join(',') === [
    '0026_market_buyer_experience.sql',
    '0027_market_catalog_quality.sql',
    '0028_market_product_comparison.sql',
    '0029_market_checkout_comment.sql',
    '0030_market_telegram_reliability.sql',
  ].join(','), ledger.slice(25).join(' '));
  db.exec(readFileSync(RECONCILE, 'utf8'));
  check('ledger reconciliation is idempotent', count(db, 'SELECT COUNT(*) FROM d1_migrations') === 30);
  check('ledger reconciliation left the audit rows alone', count(db, 'SELECT COUNT(*) FROM owner_audit_events') === 6);

  // ── Step 2 · migration 0031, the audit rebuild ─────────────────────────────
  apply(db, '0031_owner_audit_seller_binding.sql');
  const auditAfter = db.rows<Record<string, unknown>>('SELECT * FROM owner_audit_events ORDER BY event_id');
  check('0031 preserves all 6 audit rows', auditAfter.length === 6);
  check('0031 preserves every audit row byte for byte',
    JSON.stringify(auditAfter) === JSON.stringify(auditBefore));
  const indexesAfter = indexes(db, 'owner_audit_events');
  check('0031 restores all 3 indexes', indexesAfter.length === 3,
    indexesAfter.map((row) => row.name).join(', '));
  check('0031 restores them with identical definitions',
    indexesAfter.every((index) => {
      const original = indexesBefore.find((row) => row.name === index.name);
      return original !== undefined && normalise(index.sql) === normalise(original.sql);
    }));
  check('0031 leaves owner_audit_events_new behind as nothing',
    count(db, "SELECT COUNT(*) FROM sqlite_master WHERE name = 'owner_audit_events_new'") === 0);
  check('0031 foreign_key_check', db.rows('PRAGMA foreign_key_check').length === 0);
  check('0031 integrity_check', db.value('PRAGMA integrity_check') === 'ok');

  // ── Step 3 · migration 0032, the challenge table ───────────────────────────
  apply(db, '0032_seller_identity_binding_challenge.sql');
  check('0032 creates the challenge table',
    count(db, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'seller_identity_binding_challenges'") === 1);
  check('0032 adds no row to it', count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges') === 0);

  // ── Step 4 · mint ──────────────────────────────────────────────────────────
  const created = await createSellerBindingChallenge(env, db.asD1(), OWNER_EMAIL, AT);
  check('minting writes exactly one challenge row',
    count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges') === 1);
  check('the raw challenge is nowhere in the table',
    count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges WHERE challenge_hash = ?', created.challenge) === 0);
  check('a second mint while one is live is refused',
    await code(() => createSellerBindingChallenge(env, db.asD1(), OWNER_EMAIL, AT)) === 'challenge_exists');

  // ── Step 5 · redeem ────────────────────────────────────────────────────────
  const membershipsBefore = count(db, 'SELECT COUNT(*) FROM memberships');
  const result = await redeemSellerBindingChallenge(
    env, db.asD1(), TELEGRAM, created.challenge, 'rehearsal_request', new Date(AT.getTime() + 60_000),
  );
  check('redeeming writes exactly one membership row',
    count(db, 'SELECT COUNT(*) FROM memberships') === membershipsBefore + 1);
  check('the membership is owner and active',
    count(db, "SELECT COUNT(*) FROM memberships WHERE identity_id = ? AND role = 'owner' AND status = 'active'", TELEGRAM) === 1);
  check('redeeming writes exactly one audit row',
    count(db, "SELECT COUNT(*) FROM owner_audit_events WHERE action = 'seller.bind'") === 1);
  check('the audit row names no person',
    !JSON.stringify(db.rows("SELECT * FROM owner_audit_events WHERE action = 'seller.bind'")).match(/999000111|identity_tg_synthetic/));
  check('the challenge is consumed',
    count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges WHERE redeemed_at IS NOT NULL') === 1);
  check('no organization, store or onboarding was created',
    count(db, 'SELECT COUNT(*) FROM organizations') === 1
    && count(db, 'SELECT COUNT(*) FROM sotuvchi_stores') === 1
    && count(db, 'SELECT COUNT(*) FROM sotuvchi_onboardings') === 0);
  check('the caller is told capabilities and nothing else',
    result.sellerRead === true && result.sellerCommands === true && result.alreadyBound === false);

  // ── Step 6 · replay ────────────────────────────────────────────────────────
  resetBindingAttempts();
  check('replaying the spent challenge is refused',
    await code(() => redeemSellerBindingChallenge(
      env, db.asD1(), TELEGRAM, created.challenge, 'rehearsal_request', new Date(AT.getTime() + 120_000),
    )) === 'challenge_spent');
  check('replay adds no second membership',
    count(db, 'SELECT COUNT(*) FROM memberships') === membershipsBefore + 1);
  check('replay adds no second audit row',
    count(db, "SELECT COUNT(*) FROM owner_audit_events WHERE action = 'seller.bind'") === 1);

  // ── Step 7 · the audit failure case ────────────────────────────────────────
  // The same redemption against a database that never took 0031. The CHECK on
  // `action` rejects 'seller.bind', INSERT OR IGNORE swallows it, and the whole
  // grant has to fall over rather than commit unaudited.
  resetBindingAttempts();
  const stale = productionShapedDb();
  seed(stale);
  apply(stale, '0032_seller_identity_binding_challenge.sql');
  const staleChallenge = await createSellerBindingChallenge(env, stale.asD1(), OWNER_EMAIL, AT);
  const staleOutcome = await code(() => redeemSellerBindingChallenge(
    env, stale.asD1(), TELEGRAM, staleChallenge.challenge, 'rehearsal_request', new Date(AT.getTime() + 60_000),
  ));
  check('without 0031 the redemption fails', staleOutcome === 'persistence_failed', staleOutcome);
  check('without 0031 no membership is granted',
    count(stale, 'SELECT COUNT(*) FROM memberships WHERE identity_id = ?', TELEGRAM) === 0);
  check('without 0031 the audit table is untouched',
    count(stale, 'SELECT COUNT(*) FROM owner_audit_events') === 6);
  check('without 0031 the challenge stays spendable',
    count(stale, 'SELECT COUNT(*) FROM seller_identity_binding_challenges WHERE redeemed_at IS NULL') === 1);

  // ── Step 8 · a disabled membership ─────────────────────────────────────────
  resetBindingAttempts();
  const revoked = productionShapedDb();
  seed(revoked, { role: 'owner', status: 'disabled' });
  apply(revoked, '0031_owner_audit_seller_binding.sql');
  apply(revoked, '0032_seller_identity_binding_challenge.sql');
  const revokedChallenge = await createSellerBindingChallenge(env, revoked.asD1(), OWNER_EMAIL, AT);
  check('a disabled membership refuses the redemption',
    await code(() => redeemSellerBindingChallenge(
      env, revoked.asD1(), TELEGRAM, revokedChallenge.challenge, 'rehearsal_request', new Date(AT.getTime() + 60_000),
    )) === 'membership_disabled');
  check('a disabled membership is not reactivated',
    revoked.value('SELECT status FROM memberships WHERE identity_id = ?', TELEGRAM) === 'disabled');

  // ── Step 9 · rollback ──────────────────────────────────────────────────────
  const owned = () => count(
    db,
    `SELECT COUNT(*) FROM sotuvchi_stores AS store
       JOIN memberships AS membership
         ON membership.org_id = store.org_id
        AND membership.identity_id = ?
        AND membership.role = 'owner'
        AND membership.status = 'active'
      WHERE store.status = 'active'`,
    TELEGRAM,
  );
  check('before rollback the identity owns the store', owned() === 1);
  db.exec(`UPDATE memberships SET status = 'disabled' WHERE identity_id = '${TELEGRAM}'`);
  check('one UPDATE takes the authority straight back', owned() === 0);
  check('the audit record of the grant survives the rollback',
    count(db, "SELECT COUNT(*) FROM owner_audit_events WHERE action = 'seller.bind'") === 1);

  // ── Close ──────────────────────────────────────────────────────────────────
  check('final foreign_key_check', db.rows('PRAGMA foreign_key_check').length === 0);
  check('final integrity_check', db.value('PRAGMA integrity_check') === 'ok');

  say('');
  say('Proposed production writes, counted from this rehearsal:');
  say('  d1_migrations                        +5 rows (0026-0030 metadata only)');
  say('  owner_audit_events                   rebuilt, 6 rows preserved, 3 indexes restored');
  say('  seller_identity_binding_challenges   table created, +1 row per mint, 1 UPDATE per redemption');
  say('  memberships                          +1 row, role=owner, status=active');
  say('  owner_audit_events                   +1 row, action=seller.bind');
  say('  organizations / sotuvchi_stores / sotuvchi_onboardings / identities   0 rows');
  say('');
  say(`${step - failures}/${step} checks passed. Remote D1 rows written by this script: 0.`);
  if (failures > 0) process.exitCode = 1;
}

await main();
