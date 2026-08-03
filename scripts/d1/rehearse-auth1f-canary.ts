/**
 * AUTH-1F owner-only canary rehearsal, offline.
 *
 * The migration rehearsal next door answers "what will these statements do to
 * those rows". This one answers the question the canary raises instead: with
 * MARKET_OWNER_TELEGRAM_BINDING_ENABLED left false, can exactly one approved
 * owner complete exactly one binding — and can nobody else obtain anything at
 * all while that window is open.
 *
 * It walks the production sequence end to end: two distinct owner sessions, one
 * grant, one challenge, one redemption by a verified Telegram session, a replay,
 * a second mint attempt, the window closing, and the rollback.
 *
 * Nothing remote. No Cloudflare binding, no account id, no token, no network
 * call, and no wrangler. The key used here is a literal in this file and has
 * never been anywhere near a deployment.
 *
 *   npx tsx scripts/d1/rehearse-auth1f-canary.ts
 *
 * Exit code 0 means every assertion below held.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BINDING_CHALLENGE_TTL_MS,
  bindingCeremonyOpen,
  bindingEnabled,
  canaryDigest,
  createSellerBindingChallenge,
  inspectSellerBindingChallenge,
  redeemSellerBindingChallenge,
  resetBindingAttempts,
  SellerBindingError,
} from '../../functions/platform/admin/seller-binding';
import type { Env } from '../../functions/_types';
import { SqliteD1 } from '../../tests/helpers/sqlite-d1';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const MIGRATIONS = path.join(ROOT, 'migrations');

const ORG = 'org_rehearsal';
const STORE = 'store_rehearsal';
/** Synthetic on both sides. No real account takes part in a rehearsal. */
const OWNER_TELEGRAM = 'identity_tg_synthetic';
const BYSTANDER_TELEGRAM = 'identity_tg_bystander';
const API_IDENTITY = 'identity_api_owner';
const APPROVED_OWNER = 'approved@rehearsal.invalid';
const SECOND_OWNER = 'second@rehearsal.invalid';
/** A throwaway. The production key is generated at ceremony time and never committed. */
const KEY = '5ea1ed'.repeat(10) + 'abcd';
const FROM = '2026-08-03T11:55:00.000Z';
const UNTIL = '2026-08-03T12:10:00.000Z';
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

function count(db: SqliteD1, sql: string, ...binds: string[]): number {
  return Number(db.value(sql, ...binds) ?? 0);
}

/** The code a failure carried, or the string 'no failure' if it succeeded. */
async function refusal(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'no failure';
  } catch (error) {
    return error instanceof SellerBindingError ? error.code : `unexpected: ${String(error)}`;
  }
}

function productionShapedDb(): SqliteD1 {
  const db = new SqliteD1();
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort()) {
    db.exec(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }
  const now = '2026-08-03T00:00:00.000Z';
  db.exec(`
    INSERT INTO identities (id, provider, external_id, created_at, updated_at)
    VALUES
      ('${OWNER_TELEGRAM}', 'telegram', '700100200', '${now}', '${now}'),
      ('${BYSTANDER_TELEGRAM}', 'telegram', '700100201', '${now}', '${now}'),
      ('${API_IDENTITY}', 'api', 'owner-api-key', '${now}', '${now}');
    INSERT INTO organizations (id, name, slug, status, default_locale, created_at, updated_at)
    VALUES ('${ORG}', 'Bormi', 'bormi', 'active', 'uz', '${now}', '${now}');
    INSERT INTO sotuvchi_stores (
      id, org_id, name, locale, delivery_mode, payment_methods_json,
      storefront_code, status, created_at, updated_at
    )
    VALUES ('${STORE}', '${ORG}', 'Bormi Demo', 'uz', 'both', '["cash"]',
            'bormi', 'active', '${now}', '${now}');
    INSERT INTO memberships (id, org_id, identity_id, role, status, created_at, updated_at)
    VALUES ('membership_api', '${ORG}', '${API_IDENTITY}', 'owner', 'active', '${now}', '${now}');
  `);
  return db;
}

async function canaryEnv(overrides: {
  key?: string;
  org?: string;
  from?: string;
  until?: string;
  expected?: number;
} = {}): Promise<Env> {
  const from = overrides.from ?? FROM;
  const until = overrides.until ?? UNTIL;
  const expected = overrides.expected ?? 0;
  const digest = await canaryDigest(overrides.key ?? KEY, overrides.org ?? ORG, {
    issuedAt: from,
    expiresAt: until,
    expectedChallenges: expected,
  });
  return {
    // The whole point: this stays false for every single call below.
    MARKET_OWNER_TELEGRAM_BINDING_ENABLED: 'false',
    MARKET_OWNER_TELEGRAM_BINDING_CANARY: `v1|${digest}|${from}|${until}|${expected}`,
    MARKET_MINI_APP_SELLER_READS_ENABLED: 'true',
    MARKET_MINI_APP_SELLER_COMMANDS_ENABLED: 'true',
  } as unknown as Env;
}

async function main(): Promise<void> {
  say('AUTH-1F owner-only canary rehearsal — offline, no remote writes');
  say('');

  const db = productionShapedDb();
  resetBindingAttempts();
  const env = await canaryEnv();
  const closed = { MARKET_OWNER_TELEGRAM_BINDING_ENABLED: 'false' } as unknown as Env;

  // ── Step 1 · before the grant ────────────────────────────────────────────────
  check('the global switch is false', bindingEnabled(env) === false);
  check('with no canary at all the ceremony is shut', bindingCeremonyOpen(closed, AT) === false);
  check('an owner with no grant cannot mint',
    await refusal(() => createSellerBindingChallenge(closed, db.asD1(), APPROVED_OWNER, AT, KEY)) === 'binding_disabled');
  check('and a Telegram session cannot redeem anything',
    await refusal(() => redeemSellerBindingChallenge(
      closed, db.asD1(), OWNER_TELEGRAM, 'a'.repeat(64), 'rehearsal', AT,
    )) === 'binding_disabled');

  // ── Step 2 · the grant, and who it is not for ────────────────────────────────
  check('the window is open with the grant deployed', bindingCeremonyOpen(env, AT) === true);
  check('a second owner session without the key is refused',
    await refusal(() => createSellerBindingChallenge(
      env, db.asD1(), SECOND_OWNER, AT, 'f'.repeat(64),
    )) === 'canary_invalid');
  check('an owner sending no key at all is refused',
    await refusal(() => createSellerBindingChallenge(env, db.asD1(), SECOND_OWNER, AT)) === 'canary_invalid');
  check('a grant cut for another organization is refused',
    await refusal(async () => createSellerBindingChallenge(
      await canaryEnv({ org: 'org_elsewhere' }), db.asD1(), APPROVED_OWNER, AT, KEY,
    )) === 'canary_invalid');
  check('nothing was written by any of those attempts',
    count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges') === 0);

  // ── Step 3 · one challenge ───────────────────────────────────────────────────
  const issued = await createSellerBindingChallenge(env, db.asD1(), APPROVED_OWNER, AT, KEY);
  check('the approved owner mints one challenge', /^[0-9a-f]{64}$/.test(issued.challenge));
  check('it names the store the owner is looking at', issued.storeName === 'Bormi Demo');
  check('exactly one challenge row exists',
    count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges') === 1);
  check('the row keeps a digest and not the code',
    count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges WHERE challenge_hash = ?', issued.challenge) === 0);

  // ── Step 4 · the mint path shuts ─────────────────────────────────────────────
  // Spent, not merely occupied. The grant is measured against every challenge
  // the store has ever had, so the refusal arrives before the older
  // one-outstanding-challenge rule is even consulted.
  check('a second mint in the same window is refused as consumed',
    await refusal(() => createSellerBindingChallenge(
      env, db.asD1(), APPROVED_OWNER, new Date(AT.getTime() + 60_000), KEY,
    )) === 'canary_consumed');
  check('still only one challenge row',
    count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges') === 1);

  // ── Step 5 · the wrong Telegram session ──────────────────────────────────────
  check('a bystander with a guess gets the closed vocabulary',
    await refusal(() => redeemSellerBindingChallenge(
      env, db.asD1(), BYSTANDER_TELEGRAM, 'b'.repeat(64), 'rehearsal', AT,
    )) === 'challenge_invalid');
  check('and cannot select an identity or a target — there is no argument for either',
    redeemSellerBindingChallenge.length === 6);
  check('the bystander gained nothing',
    count(db, 'SELECT COUNT(*) FROM memberships WHERE identity_id = ?', BYSTANDER_TELEGRAM) === 0);

  // ── Step 6 · the look-up, which spends nothing ───────────────────────────────
  const inspected = await inspectSellerBindingChallenge(env, db.asD1(), OWNER_TELEGRAM, issued.challenge, AT);
  check('the confirmation can name the store before anyone answers', inspected.storeName === 'Bormi Demo');
  check('and the challenge is still unspent after the look-up',
    count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges WHERE redeemed_at IS NULL') === 1);

  // ── Step 7 · the redemption ──────────────────────────────────────────────────
  const result = await redeemSellerBindingChallenge(
    env, db.asD1(), OWNER_TELEGRAM, issued.challenge, 'rehearsal', AT,
  );
  check('sellerRead is true', result.sellerRead === true);
  check('sellerCommands is true', result.sellerCommands === true);
  check('one membership, owner and active',
    count(db, `SELECT COUNT(*) FROM memberships
                WHERE identity_id = ? AND org_id = ? AND role = 'owner' AND status = 'active'`,
      OWNER_TELEGRAM, ORG) === 1);
  check('one audit row', count(db, "SELECT COUNT(*) FROM owner_audit_events WHERE action = 'seller.bind'") === 1);
  check('one consumed challenge',
    count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges WHERE redeemed_at IS NOT NULL') === 1);
  check('no organization, store or onboarding moved',
    count(db, 'SELECT COUNT(*) FROM organizations') === 1
    && count(db, 'SELECT COUNT(*) FROM sotuvchi_stores') === 1
    && count(db, 'SELECT COUNT(*) FROM sotuvchi_onboardings') === 0);
  check('no second membership for anybody',
    count(db, 'SELECT COUNT(*) FROM memberships') === 2, 'the api owner plus this one');
  check('the global switch is still false', bindingEnabled(env) === false);

  // ── Step 8 · replay, and a second ceremony ───────────────────────────────────
  check('the same code cannot be spent again',
    await refusal(() => redeemSellerBindingChallenge(
      env, db.asD1(), BYSTANDER_TELEGRAM, issued.challenge, 'rehearsal', AT,
    )) === 'challenge_spent');
  check('the replay granted nothing',
    count(db, 'SELECT COUNT(*) FROM memberships WHERE identity_id = ?', BYSTANDER_TELEGRAM) === 0);
  check('the grant cannot mint a second challenge, spent code or not',
    await refusal(() => createSellerBindingChallenge(
      env, db.asD1(), APPROVED_OWNER, new Date(AT.getTime() + 120_000), KEY,
    )) === 'canary_consumed');
  check('nor can the identical grant redeployed',
    await refusal(async () => createSellerBindingChallenge(
      await canaryEnv(), db.asD1(), APPROVED_OWNER, new Date(AT.getTime() + 180_000), KEY,
    )) === 'canary_consumed');

  // ── Step 9 · the window closes on its own ────────────────────────────────────
  const after = new Date(Date.parse(UNTIL) + BINDING_CHALLENGE_TTL_MS);
  check('the ceremony closes by the clock without anyone acting',
    bindingCeremonyOpen(env, after) === false);
  check('and closes at once when the variable is removed',
    bindingCeremonyOpen(closed, AT) === false);
  check('with it removed the authority still stands',
    count(db, `SELECT COUNT(*) FROM memberships
                WHERE identity_id = ? AND role = 'owner' AND status = 'active'`, OWNER_TELEGRAM) === 1);
  check('no unspent challenge is left behind',
    count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges WHERE redeemed_at IS NULL') === 0);

  // ── Step 10 · rollback ───────────────────────────────────────────────────────
  const owned = () => count(
    db,
    `SELECT COUNT(*) FROM sotuvchi_stores AS store
       JOIN memberships AS membership
         ON membership.org_id = store.org_id
        AND membership.identity_id = ?
        AND membership.role = 'owner'
        AND membership.status = 'active'
      WHERE store.status = 'active'`,
    OWNER_TELEGRAM,
  );
  check('before rollback the identity owns the store', owned() === 1);
  db.exec(`UPDATE memberships SET status = 'disabled' WHERE identity_id = '${OWNER_TELEGRAM}'`);
  check('one UPDATE takes the authority straight back', owned() === 0);
  check('the audit record of the grant survives the rollback',
    count(db, "SELECT COUNT(*) FROM owner_audit_events WHERE action = 'seller.bind'") === 1);

  // ── Close ────────────────────────────────────────────────────────────────────
  check('final foreign_key_check', db.rows('PRAGMA foreign_key_check').length === 0);
  check('final integrity_check', db.value('PRAGMA integrity_check') === 'ok');

  say('');
  say('What one production canary is expected to write:');
  say('  seller_identity_binding_challenges   +1 row, then 1 UPDATE setting redeemed_at');
  say('  memberships                          +1 row, role=owner, status=active');
  say('  owner_audit_events                   +1 row, action=seller.bind');
  say('  d1_migrations                        0 rows — no migration is added');
  say('  organizations / sotuvchi_stores / sotuvchi_onboardings / identities   0 rows');
  say('');
  say(`${step - failures}/${step} checks passed. Remote D1 rows written by this script: 0.`);
  if (failures > 0) process.exitCode = 1;
}

await main();
