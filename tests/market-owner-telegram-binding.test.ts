import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BINDING_CHALLENGE_TTL_MS,
  SellerBindingError,
  bindingEnabled,
  createSellerBindingChallenge,
  ensureSellerBindingSchema,
  hashChallenge,
  redeemSellerBindingChallenge,
  resetBindingAttempts,
} from '../functions/platform/admin/seller-binding';
import { OWNER_AUDIT_ACTIONS } from '../functions/platform/admin/validation';
import type { Env } from '../functions/_types';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = new URL('../', import.meta.url);
const MIGRATIONS = path.join(fileURLToPath(ROOT), 'migrations');

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

/** Source with prose removed, for asserting about code rather than comments. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * The same, for SQL. `--` is the comment marker there, and these files carry
 * long rationales that name the very words the assertions look for — asserting
 * against unstripped SQL tests the prose, not the schema.
 */
function sql(text: string): string {
  return text.replace(/--.*$/gm, '');
}

/** Pull a named region out of a source file, failing loudly if it moved. */
function region(text: string, pattern: RegExp, what: string): string {
  const found = pattern.exec(text)?.[0];
  assert.ok(found, `${what} not found`);
  return found;
}

const SERVICE = 'functions/platform/admin/seller-binding.ts';
const ADMIN_ROUTE = 'functions/api/admin/seller-binding/challenge.ts';
const ROUTER = 'functions/market/router.ts';
const RECONCILE = 'scripts/d1/reconcile-ledger-0026-0030.sql';
const AUDIT_MIGRATION = 'migrations/0031_owner_audit_seller_binding.sql';
const CHALLENGE_MIGRATION = 'migrations/0032_seller_identity_binding_challenge.sql';

const REDEEM = /export async function redeemSellerBindingChallenge\([\s\S]*?\r?\n\}/;
const CREATE = /export async function createSellerBindingChallenge\([\s\S]*?\r?\n\}/;
const HANDLER = /async function bindingCommands\([\s\S]*?\r?\n\}/;

// ── AUTH-1 · owner-assisted Telegram seller binding ───────────────────────────
//
// One membership row, granted only when two independent authorities meet: an
// owner holding a signed admin token, and a Telegram account holding a session
// Telegram itself signed. Neither can complete a binding alone.
//
// The first half of this file asserts the shape of the code — the things that
// are true because of how it is written, and that no test can observe from
// outside. The second half runs the real service against a real SQLite database
// built from the real migrations, and asserts what actually lands in it.

// ── The switch ────────────────────────────────────────────────────────────────

test('the binding is a declared switch that ships off and fails closed', async () => {
  const wrangler = await source('wrangler.toml');
  assert.match(wrangler, /MARKET_OWNER_TELEGRAM_BINDING_ENABLED = "false"/);
  const env = await source('functions/_types.ts');
  assert.match(env, /MARKET_OWNER_TELEGRAM_BINDING_ENABLED\?: string;/);
  // Only the exact string enables it. Anything else — including the shapes a
  // careless edit produces — leaves both endpoints closed.
  for (const value of ['1', 'yes', 'on', 'false', 'TRUE ', '', undefined]) {
    const expected = value?.trim().toLowerCase() === 'true';
    assert.equal(
      bindingEnabled({ MARKET_OWNER_TELEGRAM_BINDING_ENABLED: value } as never),
      expected,
      `${String(value)} must not silently enable binding`,
    );
  }
  assert.equal(bindingEnabled({} as never), false, 'absent means off');
});

test('off, neither endpoint admits to existing', async () => {
  const admin = await source(ADMIN_ROUTE);
  // 404 rather than 403: a 403 confirms the route is real and worth returning to.
  assert.match(admin, /if \(!bindingEnabled\(env\)\) return ownerError\('not_found', requestId, 404\);/);
  const router = code(await source(ROUTER));
  const handler = region(router, HANDLER, 'binding handler');
  assert.match(handler, /if \(!bindingEnabled\(env\)\) return null;/);
  // Returning null puts it back in the dispatch chain, which ends in the same
  // resource_not_found every unknown path gets.
  assert.match(router, /return marketError\('resource_not_found', requestId, 404\);/);
});

test('the flag opens a door and never walks through it', async () => {
  const service = code(await source(SERVICE));
  // It gates the two entry points and appears nowhere near a grant.
  const grants = service.split(/\r?\n/).filter((line) => /role|status|memberships/i.test(line));
  for (const line of grants) {
    assert.doesNotMatch(line, /MARKET_OWNER_TELEGRAM_BINDING_ENABLED|bindingEnabled/);
  }
  // And it is not a bootstrap capability: the Mini App is never told about it,
  // so no client can branch on it or come to believe it means authority.
  const router = await source(ROUTER);
  assert.doesNotMatch(
    /flags: \{[\s\S]*?\r?\n {4}\},/.exec(router)?.[0] ?? '',
    /binding/i,
  );
  const types = await source('apps/market-mini-app/src/types.ts');
  assert.doesNotMatch(types, /binding/i);
});

// ── Owner half ────────────────────────────────────────────────────────────────

test('minting a challenge requires a signed platform_owner token', async () => {
  const admin = await source(ADMIN_ROUTE);
  assert.match(admin, /withOwnerRole\(\s*\r?\n?\s*'platform_owner',/);
  // Every other verb is refused outright rather than falling through.
  for (const verb of ['Get', 'Put', 'Delete']) {
    assert.match(admin, new RegExp(`onRequest${verb} = methodNotAllowed\\('POST'\\)`));
  }
  const roles = await source('functions/platform/admin/roles.ts');
  // The role comes from the token and nowhere else, so a buyer — who has no
  // admin token at all — cannot reach this even with the flag on.
  assert.match(roles, /const MUTATING_ROLES: ReadonlySet<PlatformRole> = new Set<PlatformRole>\(\['platform_owner'\]\);/);
  assert.match(roles, /if \(minimum === 'platform_owner' && !MUTATING_ROLES\.has\(role\)\) \{/);
});

test('the target is read from the database, never from the request', async () => {
  const service = code(await source(SERVICE));
  const create = region(service, CREATE, 'create');
  // No body is read at all, so there is no field to point somewhere else.
  assert.doesNotMatch(create, /readOwnerBody|request\.json|body\./);
  assert.match(create, /FROM sotuvchi_stores AS store[\s\S]*?org\.status = 'active'[\s\S]*?store\.status = 'active'/);
  const admin = code(await source(ADMIN_ROUTE));
  assert.doesNotMatch(admin, /orgId|storeId|identityId/);
});

test('a challenge is unguessable, hashed at rest and never shown twice', async () => {
  const service = code(await source(SERVICE));
  assert.match(service, /crypto\.getRandomValues\(new Uint8Array\(CHALLENGE_BYTES\)\)/);
  assert.match(service, /const CHALLENGE_BYTES = 32;/);
  // Stored as a digest. A reader of the table cannot redeem anything.
  assert.match(service, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(service, /await hashChallenge\(challenge\)/);
  // The raw value is bound into no INSERT.
  const insert = region(
    service,
    /INSERT INTO seller_identity_binding_challenges[\s\S]*?\.run\(\);/,
    'challenge insert',
  );
  assert.doesNotMatch(insert, /\.bind\(\s*\r?\n?\s*challenge,/);
  // The digest is real and stable.
  const digest = await hashChallenge('abc');
  assert.equal(digest, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.notEqual(await hashChallenge('abd'), digest);
});

// ── Telegram half ─────────────────────────────────────────────────────────────

test('redemption binds the identity that authenticated, not one that was named', async () => {
  const router = code(await source(ROUTER));
  const handler = region(router, HANDLER, 'handler');
  // claims.sub is the verified session subject. The body contributes exactly
  // one thing — the challenge — and nothing that identifies a person.
  assert.match(handler, /redeemSellerBindingChallenge\(\s*\r?\n\s*env,\s*\r?\n\s*env\.GPTBOT_DRAFTS_DB,\s*\r?\n\s*claims\.sub,\s*\r?\n\s*body\.challenge,/);
  assert.doesNotMatch(handler, /body\.(identityId|telegramId|username|userId|orgId|storeId)/);
  // A username or a hand-typed Telegram id has no route into this at all.
  const service = code(await source(SERVICE));
  assert.doesNotMatch(service, /username|telegram_id|telegramId|first_name|phone/i);
  // The session it trusts is the one the launch already verified from initData.
  assert.match(await source(ROUTER), /verifyTelegramInitData/);
});

test('the store is re-checked at redemption, not trusted from minting time', async () => {
  const service = code(await source(SERVICE));
  const redeem = region(service, REDEEM, 'redeem');
  // A challenge minted while the store was active must not still work after it
  // was suspended, so org and store status are read again here.
  assert.match(redeem, /JOIN organizations AS org ON org\.id = store\.org_id AND org\.status = 'active'[\s\S]*?store\.status = 'active'/);
  assert.match(redeem, /if \(!store\) throw new SellerBindingError\('store_unavailable'\);/);
  // And again inside the write itself, so the guard cannot be outrun — once in
  // the audit guard and once in the membership insert.
  assert.equal(
    [...redeem.matchAll(/EXISTS \(SELECT 1 FROM organizations WHERE id = \? AND status = 'active'\)/g)].length,
    2,
  );
  assert.equal(
    [...redeem.matchAll(/EXISTS \(SELECT 1 FROM sotuvchi_stores WHERE id = \? AND org_id = \? AND status = 'active'\)/g)].length,
    2,
  );
});

test('a disabled membership is never silently reactivated', async () => {
  const service = code(await source(SERVICE));
  const redeem = region(service, REDEEM, 'redeem');
  // Somebody disabled it on purpose. Turning it back on with a challenge would
  // let a revoked seller restore themselves, so this stops and asks.
  assert.match(redeem, /if \(existing && existing\.status !== 'active'\) \{\s*\r?\n\s*throw new SellerBindingError\('membership_disabled'\);/);
  // Nothing anywhere flips a membership back to active.
  assert.doesNotMatch(service, /UPDATE memberships[\s\S]{0,120}status = 'active'/);
});

// ── The write ─────────────────────────────────────────────────────────────────

test('exactly one membership row, owner and active, and never a second', async () => {
  const service = code(await source(SERVICE));
  // INSERT OR IGNORE over UNIQUE(org_id, identity_id): a duplicate redemption
  // writes nothing rather than racing to write twice.
  assert.match(service, /INSERT OR IGNORE INTO memberships/);
  assert.equal([...service.matchAll(/INSERT OR IGNORE INTO memberships/g)].length, 1);
  assert.match(service, /SELECT \?, \?, \?, 'owner', 'active', \?, \?/);
  // Only a telegram identity can be bound this way.
  assert.match(service, /AND EXISTS \(SELECT 1 FROM identities WHERE id = \? AND provider = 'telegram'\)/);
  // Nothing else is created. Not an org, not a store, not an onboarding.
  assert.doesNotMatch(service, /INSERT[\s\S]{0,60}(organizations|sotuvchi_stores|sotuvchi_onboardings|identities)/);
});

test('the audit row goes first, and the grant depends on it', async () => {
  const service = code(await source(SERVICE));
  const redeem = region(service, REDEEM, 'redeem');
  // The order is the whole safety property. `prepareOwnerAuditInsert` emits an
  // INSERT OR IGNORE, and SQLite's IGNORE swallows a CHECK violation silently —
  // so on a database that has not taken 0031 yet, an audit row for
  // 'seller.bind' disappears without raising. Membership-first would commit an
  // unaudited grant of seller authority. Audit-first cannot.
  const statements = region(redeem, /const statements = \[[\s\S]*?\r?\n {2}\];/, 'batch');
  const auditAt = statements.indexOf('audit.statement');
  const membershipAt = statements.indexOf('INSERT OR IGNORE INTO memberships');
  const consumeAt = statements.indexOf('UPDATE seller_identity_binding_challenges');
  assert.ok(auditAt >= 0 && membershipAt >= 0 && consumeAt >= 0);
  assert.ok(auditAt < membershipAt, 'the audit insert must precede the membership insert');
  assert.ok(membershipAt < consumeAt, 'the challenge is spent only after the grant');
  // And the dependency is real, not merely positional.
  assert.match(
    statements,
    /INSERT OR IGNORE INTO memberships[\s\S]*?WHERE EXISTS \(SELECT 1 FROM owner_audit_events WHERE event_id = \?\)/,
  );
  assert.match(statements, /await db\.batch\(statements\);|/);
  assert.match(service, /await db\.batch\(statements\);/);
});

test('one challenge cannot be spent twice, even by two callers at once', async () => {
  const service = code(await source(SERVICE));
  const redeem = region(service, REDEEM, 'redeem');
  // The guard re-reads the challenge inside the transaction. Two requests can
  // both see it unspent; only one can still see it unspent when its own batch
  // evaluates this.
  assert.match(
    redeem,
    /EXISTS \(SELECT 1 FROM seller_identity_binding_challenges\s*\r?\n\s*WHERE challenge_hash = \? AND action = 'seller\.bind'\s*\r?\n\s*AND redeemed_at IS NULL AND expires_at > \?\)/,
  );
  // The consume is itself conditional on the row still being unspent.
  assert.match(redeem, /SET redeemed_at = \?\s*\r?\n\s*WHERE challenge_hash = \?\s*\r?\n\s*AND redeemed_at IS NULL/);
  // And the result is read back from the database rather than assumed.
  assert.match(redeem, /Number\(verified\?\.granted \?\? 0\) !== 1/);
  assert.match(redeem, /Number\(verified\?\.audited \?\? 0\) !== 1/);
  assert.match(redeem, /Number\(verified\?\.spent \?\? 0\) !== 1/);
  assert.match(redeem, /throw new SellerBindingError\('persistence_failed'\);/);
});

test('a replayed redemption produces one grant and one audit row', async () => {
  const service = code(await source(SERVICE));
  // The audit key is the challenge hash, so the second attempt collides on
  // UNIQUE(idempotency_key) instead of adding a second event.
  assert.match(service, /idempotencyKey: `seller_bind_\$\{row\.challenge_hash\}`/);
  const audit = await source('functions/platform/admin/audit.ts');
  assert.match(audit, /INSERT OR IGNORE INTO owner_audit_events/);
  assert.match(audit, /UNIQUE \(idempotency_key\)/);
  // A replay is reported honestly rather than dressed up as a fresh grant.
  assert.match(service, /alreadyBound/);
});

// ── What comes back ───────────────────────────────────────────────────────────

test('the response carries capabilities and no identifiers', async () => {
  const router = code(await source(ROUTER));
  const handler = region(router, HANDLER, 'handler');
  const payload = region(handler, /return marketJson\(\{[\s\S]*?\}, requestId\);/, 'response payload');
  assert.match(payload, /sellerRead: result\.sellerRead/);
  assert.match(payload, /sellerCommands: result\.sellerCommands/);
  assert.doesNotMatch(payload, /identityId|orgId|storeId|challenge/);
  // Capabilities are reported from the same env switches every other seller
  // entry point is gated by, not invented by the binding.
  const service = code(await source(SERVICE));
  assert.match(service, /sellerRead: \(env\.MARKET_MINI_APP_SELLER_READS_ENABLED/);
  assert.match(service, /sellerCommands: \(env\.MARKET_MINI_APP_SELLER_COMMANDS_ENABLED/);
});

test('every challenge failure answers the redeemer identically', async () => {
  const router = code(await source(ROUTER));
  const mapping = region(router, /function redeemFailure\([\s\S]*?\r?\n\}/, 'failure mapping');
  // Unknown, expired and spent are distinguished for the operator in the log
  // and collapsed into one answer for the caller, who would otherwise learn
  // which codes ever existed by grinding.
  for (const code of ['challenge_invalid', 'challenge_expired', 'challenge_spent']) {
    assert.doesNotMatch(mapping, new RegExp(`case '${code}'`), `${code} must not get its own answer`);
  }
  assert.match(mapping, /default:\s*\r?\n\s*return new MarketHttpError\('validation_failed', 400\);/);
  assert.match(mapping, /case 'rate_limited':\s*\r?\n\s*return new MarketHttpError\('rate_limited', 429\);/);
  assert.match(mapping, /case 'persistence_failed':\s*\r?\n\s*return new MarketHttpError\('internal_error', 500\);/);
});

test('nothing logs a challenge, initData or anything about the person', async () => {
  const service = code(await source(SERVICE));
  const admin = code(await source(ADMIN_ROUTE));
  for (const text of [service, admin]) {
    assert.doesNotMatch(text, /console\.(log|info|warn|debug)/);
    assert.doesNotMatch(text, /initData/);
  }
  // The audit metadata is an allowlist of shapes, never a request body.
  assert.match(service, /before: \{ membership: existing \? existing\.status : 'absent' \}/);
  assert.match(service, /after: \{ membership: 'active', role: 'owner', identityProvider: 'telegram' \}/);
  assert.doesNotMatch(service, /before: body|after: body|JSON\.stringify\(body\)/);
});

test('grinding either half costs something', async () => {
  const router = code(await source(ROUTER));
  const handler = region(router, HANDLER, 'handler');
  assert.match(handler, /await enforceMarketRateLimit\('command', `\$\{claims\.sub\}:seller-binding`\);/);
  // And the service caps itself rather than trusting a caller to have done it.
  const service = code(await source(SERVICE));
  assert.match(service, /spendBindingAttempt\('mint', actorEmail, now\);/);
  assert.match(service, /spendBindingAttempt\('redeem', identityId, now\);/);
  // The bucket key is a fold of the caller, not the caller: this map outlives
  // the request that filled it.
  assert.match(service, /const key = foldKey\(scope, caller\);/);
});

// ── Audit vocabulary ──────────────────────────────────────────────────────────

test('the audit log learns exactly two verbs and keeps its old ones', async () => {
  for (const existing of ['store.suspend', 'store.restore', 'pilot.activate', 'pilot.pause', 'automation.replay']) {
    assert.ok(OWNER_AUDIT_ACTIONS.includes(existing as never), `${existing} must survive`);
  }
  assert.ok(OWNER_AUDIT_ACTIONS.includes('seller.bind' as never));
  assert.ok(OWNER_AUDIT_ACTIONS.includes('seller.unbind' as never));
  assert.equal(OWNER_AUDIT_ACTIONS.length, 7);
  // The runtime DDL used by tests and local runs moves in lockstep with the
  // migration, or a fresh database rejects the very row this exists to write.
  const audit = await source('functions/platform/admin/audit.ts');
  assert.match(audit, /'seller\.bind', 'seller\.unbind'/);
  const migration = await source(AUDIT_MIGRATION);
  assert.match(migration, /'seller\.bind',\s*\r?\n\s*'seller\.unbind'/);
});

test('the audit rebuild preserves every column, index and row', async () => {
  const migration = await source(AUDIT_MIGRATION);
  // Same shape, one longer list.
  for (const column of [
    'event_id', 'actor_email', 'actor_role', 'action', 'target_type', 'target_id',
    'org_id', 'reason_code', 'request_id', 'idempotency_key', 'before_json',
    'after_json', 'created_at',
  ]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`), `${column} must survive the rebuild`);
  }
  assert.match(migration, /UNIQUE \(idempotency_key\)/);
  // Every row is copied by explicit column list, not SELECT *.
  assert.match(migration, /INSERT INTO owner_audit_events_new \([\s\S]*?\)\s*\r?\nSELECT/);
  assert.doesNotMatch(migration, /SELECT \* FROM owner_audit_events/);
  // All three indexes are recreated after the rename.
  for (const index of ['idx_owner_audit_actor', 'idx_owner_audit_created', 'idx_owner_audit_target']) {
    assert.match(migration, new RegExp(`CREATE INDEX ${index}`), `${index} must be recreated`);
  }
  // target_type and reason_code are untouched: a binding is recorded against
  // the store, and 'seller_request' already described it.
  assert.match(migration, /CHECK \(target_type IN \('store', 'automation_job'\)\)/);
  assert.doesNotMatch(migration, /reason_code IN \([^)]*seller_bind/);
});

// ── Ledger ────────────────────────────────────────────────────────────────────

test('the ledger repair records history and replays none of it', async () => {
  const reconcile = sql(await source(RECONCILE));
  // Not a numbered migration: the runner would try 0026-0030 first, and three
  // of those are bare ADD COLUMN, which SQLite cannot make conditional.
  const migrations = await readdir(new URL('migrations/', ROOT));
  assert.ok(!migrations.some((name) => /reconcile/i.test(name)), 'reconciliation must stay out of the runner');
  // It writes ledger rows and executes no schema change whatsoever.
  assert.doesNotMatch(reconcile, /ALTER TABLE|CREATE TABLE|DROP TABLE|CREATE INDEX/);
  assert.equal([...reconcile.matchAll(/INSERT INTO d1_migrations/g)].length, 5);
  // Fail closed: each row is written only if this database physically proves it
  // already has that migration's artifacts.
  assert.match(reconcile, /pragma_table_info\('sotuvchi_storefront_sessions'\)/);
  assert.match(reconcile, /pragma_table_info\('sotuvchi_products'\)/);
  assert.match(reconcile, /pragma_table_info\('sotuvchi_orders'\)/);
  assert.match(reconcile, /'sotuvchi_buyer_presentations', 'sotuvchi_buyer_comparisons'/);
  assert.match(reconcile, /'telegram_agent_rate_limit_notices'/);
  // Idempotent: a second run writes nothing.
  assert.equal([...reconcile.matchAll(/NOT EXISTS \(\s*\r?\n\s*SELECT 1 FROM d1_migrations WHERE name =/g)].length, 5);
  // The names must match the files the runner will compare against.
  for (const name of [
    '0026_market_buyer_experience.sql', '0027_market_catalog_quality.sql',
    '0028_market_product_comparison.sql', '0029_market_checkout_comment.sql',
    '0030_market_telegram_reliability.sql',
  ]) {
    assert.match(reconcile, new RegExp(name.replace(/\./g, '\\.')));
    assert.ok(migrations.includes(name), `${name} must exist on disk`);
  }
});

test('the challenge table is additive and carries nothing about a person', async () => {
  const migration = await source(CHALLENGE_MIGRATION);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS seller_identity_binding_challenges/);
  assert.match(migration, /challenge_hash {2}TEXT PRIMARY KEY CHECK \(length\(challenge_hash\) = 64\)/);
  // A hash, never the secret; and no identity is recorded here at all.
  assert.doesNotMatch(sql(migration), /identity_id|telegram|username|challenge_raw|phone/i);
  // Scoped to one action.
  assert.match(migration, /action {10}TEXT NOT NULL CHECK \(action IN \('seller\.bind'\)\)/);
  // Spent challenges are kept, because "was this used, and when" is the
  // question asked when a binding is later questioned.
  assert.match(migration, /redeemed_at/);
  assert.doesNotMatch(sql(migration), /DELETE FROM seller_identity_binding_challenges/);
});

// ── Boundaries ────────────────────────────────────────────────────────────────

test('AUTH-1 changes no seller authority rule and enables no QuickPost', async () => {
  const wrangler = await source('wrangler.toml');
  // The binding grants the membership the resolver already required; it does
  // not touch what the resolver asks for.
  const access = await source('functions/market/access.ts');
  assert.doesNotMatch(access, /binding|challenge/i);
  const catalogStore = await source('functions/agents/sotuvchi/catalog/store.ts');
  assert.match(catalogStore, /AND membership\.role = 'owner'\s*\r?\n\s*AND membership\.status = 'active'/);
  // QuickPost stays off, and so does its AI lane.
  assert.match(wrangler, /MARKET_QUICKPOST_ENABLED = "false"/);
  assert.match(wrangler, /MARKET_QUICKPOST_AI_ENABLED = "false"/);
  // No provisioning or vision switch was invented along the way.
  assert.doesNotMatch(wrangler, /MARKET_PRIVATE_SELLER_PROVISIONING_ENABLED|MARKET_QUICKPOST_VISION_ENABLED/);
  // And no onboarding is created anywhere on this path.
  const service = code(await source(SERVICE));
  assert.doesNotMatch(service, /onboarding/i);
});

test('the binding adds exactly two migrations and no third', async () => {
  const migrations = await readdir(new URL('migrations/', ROOT));
  assert.equal(migrations.length, 32, 'AUTH-1 adds 0031 and 0032 only');
  assert.ok(migrations.includes('0031_owner_audit_seller_binding.sql'));
  assert.ok(migrations.includes('0032_seller_identity_binding_challenge.sql'));
});

// ══ Behaviour ═════════════════════════════════════════════════════════════════
//
// Everything below runs the real service against a real SQLite database built
// by executing the real migration files in order. Nothing here asserts about
// source text; these are the properties an operator is actually relying on.

const ORG = 'org_bormi';
const STORE = 'store_bormi';
const OWNER_TELEGRAM = 'identity_tg_owner';
const OTHER_TELEGRAM = 'identity_tg_other';
const API_IDENTITY = 'identity_api_owner';
const OWNER_EMAIL = 'owner@example.test';
const REQUEST_ID = 'market_test_request';

function bindingEnv(overrides: Record<string, string> = {}): Env {
  return {
    MARKET_OWNER_TELEGRAM_BINDING_ENABLED: 'true',
    MARKET_MINI_APP_SELLER_READS_ENABLED: 'true',
    MARKET_MINI_APP_SELLER_COMMANDS_ENABLED: 'true',
    ...overrides,
  } as unknown as Env;
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
}

/** Apply migrations in ledger order, optionally stopping short of some of them. */
function applyMigrations(db: SqliteD1, skip: readonly string[] = []): void {
  for (const file of migrationFiles()) {
    if (skip.some((prefix) => file.startsWith(prefix))) continue;
    db.exec(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }
}

function seed(db: SqliteD1, options: {
  orgStatus?: string;
  storeStatus?: string;
  membership?: { role: string; status: string } | null;
} = {}): void {
  const now = '2026-08-03T00:00:00.000Z';
  db.exec(`
    INSERT INTO identities (id, provider, external_id, created_at, updated_at)
    VALUES
      ('${OWNER_TELEGRAM}', 'telegram', '600100200', '${now}', '${now}'),
      ('${OTHER_TELEGRAM}', 'telegram', '600100201', '${now}', '${now}'),
      ('${API_IDENTITY}', 'api', 'owner-api-key', '${now}', '${now}');
    INSERT INTO organizations (id, name, slug, status, default_locale, created_at, updated_at)
    VALUES ('${ORG}', 'Bormi', 'bormi', '${options.orgStatus ?? 'active'}', 'uz', '${now}', '${now}');
    INSERT INTO sotuvchi_stores (
      id, org_id, name, locale, delivery_mode, payment_methods_json,
      storefront_code, status, created_at, updated_at
    )
    VALUES ('${STORE}', '${ORG}', 'Bormi Shop', 'uz', 'both', '["cash"]',
            'bormi', '${options.storeStatus ?? 'active'}', '${now}', '${now}');
    INSERT INTO memberships (id, org_id, identity_id, role, status, created_at, updated_at)
    VALUES ('membership_api', '${ORG}', '${API_IDENTITY}', 'owner', 'active', '${now}', '${now}');
  `);
  if (options.membership) {
    db.exec(`
      INSERT INTO memberships (id, org_id, identity_id, role, status, created_at, updated_at)
      VALUES ('membership_existing', '${ORG}', '${OWNER_TELEGRAM}',
              '${options.membership.role}', '${options.membership.status}', '${now}', '${now}');
    `);
  }
}

function freshDb(options: Parameters<typeof seed>[1] & { skip?: readonly string[] } = {}): SqliteD1 {
  resetBindingAttempts();
  const db = new SqliteD1();
  applyMigrations(db, options.skip ?? []);
  seed(db, options);
  return db;
}

function count(db: SqliteD1, sqlText: string, ...binds: string[]): number {
  return Number(db.value(sqlText, ...binds) ?? 0);
}

function telegramMemberships(db: SqliteD1, identityId = OWNER_TELEGRAM): number {
  return count(
    db,
    'SELECT COUNT(*) FROM memberships WHERE org_id = ? AND identity_id = ?',
    ORG,
    identityId,
  );
}

async function mint(db: SqliteD1, env = bindingEnv(), now = new Date('2026-08-03T10:00:00.000Z')) {
  return createSellerBindingChallenge(env, db.asD1(), OWNER_EMAIL, now);
}

async function failure(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof SellerBindingError, `expected SellerBindingError, got ${String(error)}`);
    return error.code;
  }
  assert.fail('expected a SellerBindingError');
}

test('behaviour: the flag closes both halves before anything is read', async () => {
  const db = freshDb();
  const off = bindingEnv({ MARKET_OWNER_TELEGRAM_BINDING_ENABLED: 'false' });
  assert.equal(await failure(() => mint(db, off)), 'binding_disabled');
  assert.equal(
    await failure(() => redeemSellerBindingChallenge(
      off, db.asD1(), OWNER_TELEGRAM, 'a'.repeat(64), REQUEST_ID, new Date(),
    )),
    'binding_disabled',
  );
  // Not even the table was created, so a flag-off deployment leaves no trace.
  assert.equal(
    count(db, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'seller_identity_binding_challenges'"),
    1,
    'the migration creates it; the disabled code path does not have to',
  );
  assert.equal(count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges'), 0);
});

test('behaviour: minting stores a digest and never the secret', async () => {
  const db = freshDb();
  const created = await mint(db);
  assert.match(created.challenge, /^[0-9a-f]{64}$/);
  assert.equal(created.storeName, 'Bormi Shop');
  const rows = db.rows<{ challenge_hash: string; org_id: string; store_id: string; action: string; created_by: string; expires_at: string; redeemed_at: string | null }>(
    'SELECT * FROM seller_identity_binding_challenges',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].challenge_hash, await hashChallenge(created.challenge));
  assert.notEqual(rows[0].challenge_hash, created.challenge);
  assert.equal(rows[0].org_id, ORG);
  assert.equal(rows[0].store_id, STORE);
  assert.equal(rows[0].action, 'seller.bind');
  assert.equal(rows[0].created_by, OWNER_EMAIL);
  assert.equal(rows[0].redeemed_at, null);
  // The raw value appears in no column of the row that records it.
  for (const value of Object.values(rows[0])) {
    assert.notEqual(value, created.challenge);
  }
  // Two mints never collide.
  db.exec('DELETE FROM seller_identity_binding_challenges');
  const second = await mint(db);
  assert.notEqual(second.challenge, created.challenge);
});

test('behaviour: a challenge lives ten minutes and no longer', async () => {
  const db = freshDb();
  const now = new Date('2026-08-03T10:00:00.000Z');
  const created = await mint(db, bindingEnv(), now);
  assert.equal(
    new Date(created.expiresAt).getTime() - now.getTime(),
    BINDING_CHALLENGE_TTL_MS,
  );
  assert.ok(BINDING_CHALLENGE_TTL_MS <= 10 * 60 * 1000);
  // One second past the expiry it is refused, and nothing is written.
  const late = new Date(now.getTime() + BINDING_CHALLENGE_TTL_MS + 1_000);
  assert.equal(
    await failure(() => redeemSellerBindingChallenge(
      bindingEnv(), db.asD1(), OWNER_TELEGRAM, created.challenge, REQUEST_ID, late,
    )),
    'challenge_expired',
  );
  assert.equal(telegramMemberships(db), 0);
  assert.equal(count(db, "SELECT COUNT(*) FROM owner_audit_events WHERE action = 'seller.bind'"), 0);
  assert.equal(count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges WHERE redeemed_at IS NOT NULL'), 0);
});

test('behaviour: only one challenge is live at a time', async () => {
  const db = freshDb();
  await mint(db);
  assert.equal(await failure(() => mint(db)), 'challenge_exists');
  assert.equal(count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges'), 1);
  // Once it has expired, the owner is not locked out.
  const later = new Date('2026-08-03T10:30:00.000Z');
  await mint(db, bindingEnv(), later);
  assert.equal(count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges'), 2);
});

test('behaviour: minting refuses to guess which store was meant', async () => {
  const none = freshDb({ storeStatus: 'suspended' });
  assert.equal(await failure(() => mint(none)), 'store_unavailable');

  const many = freshDb();
  many.exec(`
    INSERT INTO organizations (id, name, slug, status, default_locale, created_at, updated_at)
    VALUES ('org_second', 'Second', 'second', 'active', 'uz', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z');
    INSERT INTO sotuvchi_stores (
      id, org_id, name, locale, delivery_mode, payment_methods_json,
      storefront_code, status, created_at, updated_at
    )
    VALUES ('store_second', 'org_second', 'Second Shop', 'uz', 'both', '["cash"]',
            'second', 'active', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z');
  `);
  // Picking the lowest id is exactly the cross-tenant mistake a binding must
  // never make, so it stops rather than choosing.
  assert.equal(await failure(() => mint(many)), 'store_ambiguous');
  assert.equal(count(many, 'SELECT COUNT(*) FROM seller_identity_binding_challenges'), 0);
});

test('behaviour: a redemption grants one membership, one audit row, one spent challenge', async () => {
  const db = freshDb();
  const before = {
    orgs: count(db, 'SELECT COUNT(*) FROM organizations'),
    stores: count(db, 'SELECT COUNT(*) FROM sotuvchi_stores'),
    onboardings: count(db, 'SELECT COUNT(*) FROM sotuvchi_onboardings'),
    identities: count(db, 'SELECT COUNT(*) FROM identities'),
    memberships: count(db, 'SELECT COUNT(*) FROM memberships'),
  };
  const created = await mint(db);
  const result = await redeemSellerBindingChallenge(
    bindingEnv(), db.asD1(), OWNER_TELEGRAM, created.challenge, REQUEST_ID,
    new Date('2026-08-03T10:01:00.000Z'),
  );
  assert.equal(result.sellerRead, true);
  assert.equal(result.sellerCommands, true);
  assert.equal(result.alreadyBound, false);
  assert.equal(result.storeName, 'Bormi Shop');

  const membership = db.rows<{ role: string; status: string; org_id: string; identity_id: string }>(
    'SELECT * FROM memberships WHERE identity_id = ?', OWNER_TELEGRAM,
  );
  assert.equal(membership.length, 1, 'exactly one membership row');
  assert.equal(membership[0].role, 'owner');
  assert.equal(membership[0].status, 'active');
  assert.equal(membership[0].org_id, ORG);

  const audit = db.rows<Record<string, string | null>>(
    "SELECT * FROM owner_audit_events WHERE action = 'seller.bind'",
  );
  assert.equal(audit.length, 1, 'exactly one audit row');
  assert.equal(audit[0].actor_email, OWNER_EMAIL);
  assert.equal(audit[0].actor_role, 'platform_owner');
  assert.equal(audit[0].target_type, 'store');
  assert.equal(audit[0].target_id, STORE);
  assert.equal(audit[0].org_id, ORG);
  assert.equal(audit[0].reason_code, 'seller_request');
  assert.equal(audit[0].request_id, REQUEST_ID);
  // Nothing in the audit row identifies the person who redeemed.
  const serialised = JSON.stringify(audit[0]);
  assert.doesNotMatch(serialised, /600100200/, 'no Telegram id');
  assert.doesNotMatch(serialised, new RegExp(OWNER_TELEGRAM), 'no identity id');
  assert.equal(audit[0].before_json, JSON.stringify({ membership: 'absent' }));
  assert.equal(
    audit[0].after_json,
    JSON.stringify({ membership: 'active', role: 'owner', identityProvider: 'telegram' }),
  );

  assert.equal(count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges WHERE redeemed_at IS NOT NULL'), 1);
  // And nothing else moved: no org, no store, no onboarding, no identity.
  assert.equal(count(db, 'SELECT COUNT(*) FROM organizations'), before.orgs);
  assert.equal(count(db, 'SELECT COUNT(*) FROM sotuvchi_stores'), before.stores);
  assert.equal(count(db, 'SELECT COUNT(*) FROM sotuvchi_onboardings'), before.onboardings);
  assert.equal(count(db, 'SELECT COUNT(*) FROM identities'), before.identities);
  assert.equal(count(db, 'SELECT COUNT(*) FROM memberships'), before.memberships + 1);
  // The database is still internally consistent.
  assert.deepEqual(db.rows('PRAGMA foreign_key_check'), []);
  assert.equal(db.value('PRAGMA integrity_check'), 'ok');
});

test('behaviour: the same challenge cannot be spent a second time', async () => {
  const db = freshDb();
  const created = await mint(db);
  await redeemSellerBindingChallenge(
    bindingEnv(), db.asD1(), OWNER_TELEGRAM, created.challenge, REQUEST_ID, new Date('2026-08-03T10:01:00.000Z'),
  );
  assert.equal(
    await failure(() => redeemSellerBindingChallenge(
      bindingEnv(), db.asD1(), OTHER_TELEGRAM, created.challenge, REQUEST_ID, new Date('2026-08-03T10:02:00.000Z'),
    )),
    'challenge_spent',
  );
  assert.equal(telegramMemberships(db, OTHER_TELEGRAM), 0, 'a spent challenge grants nobody');
  assert.equal(telegramMemberships(db), 1);
  assert.equal(count(db, "SELECT COUNT(*) FROM owner_audit_events WHERE action = 'seller.bind'"), 1);
});

test('behaviour: two callers racing one challenge produce exactly one winner', async () => {
  const db = freshDb();
  const created = await mint(db);
  const at = new Date('2026-08-03T10:01:00.000Z');
  // Both reach their reads before either writes, which is the window a leaked
  // challenge would be spent in.
  const outcomes = await Promise.allSettled([
    redeemSellerBindingChallenge(bindingEnv(), db.asD1(), OWNER_TELEGRAM, created.challenge, REQUEST_ID, at),
    redeemSellerBindingChallenge(bindingEnv(), db.asD1(), OTHER_TELEGRAM, created.challenge, REQUEST_ID, at),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1, 'one winner');
  assert.equal(
    count(db, "SELECT COUNT(*) FROM memberships WHERE org_id = ? AND role = 'owner' AND status = 'active' AND identity_id LIKE 'identity_tg_%'", ORG),
    1,
    'one leaked challenge must not bind two accounts',
  );
  assert.equal(count(db, "SELECT COUNT(*) FROM owner_audit_events WHERE action = 'seller.bind'"), 1);
  assert.equal(count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges WHERE redeemed_at IS NOT NULL'), 1);
});

test('behaviour: an already-bound identity redeems idempotently', async () => {
  const db = freshDb({ membership: { role: 'owner', status: 'active' } });
  const created = await mint(db);
  const result = await redeemSellerBindingChallenge(
    bindingEnv(), db.asD1(), OWNER_TELEGRAM, created.challenge, REQUEST_ID, new Date('2026-08-03T10:01:00.000Z'),
  );
  assert.equal(result.alreadyBound, true);
  assert.equal(telegramMemberships(db), 1, 'no second membership row');
  const audit = db.rows<Record<string, string>>("SELECT * FROM owner_audit_events WHERE action = 'seller.bind'");
  assert.equal(audit.length, 1);
  // The audit says honestly that the membership was already there.
  assert.equal(audit[0].before_json, JSON.stringify({ membership: 'active' }));
});

test('behaviour: a disabled membership is refused, not revived', async () => {
  const db = freshDb({ membership: { role: 'owner', status: 'disabled' } });
  const created = await mint(db);
  assert.equal(
    await failure(() => redeemSellerBindingChallenge(
      bindingEnv(), db.asD1(), OWNER_TELEGRAM, created.challenge, REQUEST_ID, new Date('2026-08-03T10:01:00.000Z'),
    )),
    'membership_disabled',
  );
  assert.equal(
    db.value('SELECT status FROM memberships WHERE identity_id = ?', OWNER_TELEGRAM),
    'disabled',
    'a revoked seller must not restore themselves with a challenge',
  );
  assert.equal(count(db, "SELECT COUNT(*) FROM owner_audit_events WHERE action = 'seller.bind'"), 0);
  // The challenge survives, so the owner has not lost their one attempt.
  assert.equal(count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges WHERE redeemed_at IS NULL'), 1);
});

test('behaviour: an existing membership in another role is a conflict, not a 500', async () => {
  const db = freshDb({ membership: { role: 'staff', status: 'active' } });
  const created = await mint(db);
  assert.equal(
    await failure(() => redeemSellerBindingChallenge(
      bindingEnv(), db.asD1(), OWNER_TELEGRAM, created.challenge, REQUEST_ID, new Date('2026-08-03T10:01:00.000Z'),
    )),
    'membership_conflict',
  );
  assert.equal(db.value('SELECT role FROM memberships WHERE identity_id = ?', OWNER_TELEGRAM), 'staff');
  assert.equal(count(db, "SELECT COUNT(*) FROM owner_audit_events WHERE action = 'seller.bind'"), 0);
  assert.equal(count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges WHERE redeemed_at IS NULL'), 1);
});

test('behaviour: a store or org suspended after minting kills the challenge', async () => {
  for (const [column, table] of [['status', 'sotuvchi_stores'], ['status', 'organizations']] as const) {
    const db = freshDb();
    const created = await mint(db);
    db.exec(`UPDATE ${table} SET ${column} = 'suspended' WHERE id = '${table === 'organizations' ? ORG : STORE}'`);
    assert.equal(
      await failure(() => redeemSellerBindingChallenge(
        bindingEnv(), db.asD1(), OWNER_TELEGRAM, created.challenge, REQUEST_ID, new Date('2026-08-03T10:01:00.000Z'),
      )),
      'store_unavailable',
      `${table} suspension must stop a redemption`,
    );
    assert.equal(telegramMemberships(db), 0);
    assert.equal(count(db, "SELECT COUNT(*) FROM owner_audit_events WHERE action = 'seller.bind'"), 0);
    assert.equal(count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges WHERE redeemed_at IS NOT NULL'), 0);
  }
});

test('behaviour: only a telegram identity can be bound this way', async () => {
  const db = freshDb();
  const created = await mint(db);
  // The api-provider identity is the one that already owns the store. Redeeming
  // as it would be a binding for something that never opens the Mini App, so it
  // is refused by provider before any write is prepared.
  assert.equal(
    await failure(() => redeemSellerBindingChallenge(
      bindingEnv(), db.asD1(), API_IDENTITY, created.challenge, REQUEST_ID, new Date('2026-08-03T10:01:00.000Z'),
    )),
    'identity_unsupported',
  );
  // An identity that does not exist at all is refused the same way, and neither
  // attempt is allowed to surface as an internal error.
  assert.equal(
    await failure(() => redeemSellerBindingChallenge(
      bindingEnv(), db.asD1(), 'identity_that_does_not_exist', created.challenge, REQUEST_ID,
      new Date('2026-08-03T10:01:00.000Z'),
    )),
    'identity_unsupported',
  );
  assert.equal(count(db, "SELECT COUNT(*) FROM owner_audit_events WHERE action = 'seller.bind'"), 0);
  assert.equal(count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges WHERE redeemed_at IS NOT NULL'), 0);
});

test('behaviour: malformed and unknown challenges are refused before any read', async () => {
  const db = freshDb();
  await mint(db);
  for (const value of ['', 'not-a-challenge', 'A'.repeat(64), 'f'.repeat(63), 'f'.repeat(65), 42, null, undefined]) {
    resetBindingAttempts();
    assert.equal(
      await failure(() => redeemSellerBindingChallenge(
        bindingEnv(), db.asD1(), OWNER_TELEGRAM, value, REQUEST_ID, new Date('2026-08-03T10:01:00.000Z'),
      )),
      'challenge_invalid',
      `${String(value)} must be refused`,
    );
  }
  // A well-formed value that was never minted is refused the same way.
  resetBindingAttempts();
  assert.equal(
    await failure(() => redeemSellerBindingChallenge(
      bindingEnv(), db.asD1(), OWNER_TELEGRAM, 'a'.repeat(64), REQUEST_ID, new Date('2026-08-03T10:01:00.000Z'),
    )),
    'challenge_invalid',
  );
  assert.equal(telegramMemberships(db), 0);
});

test('behaviour: without migration 0031 nothing is granted at all', async () => {
  // The exact state production is in on the day the flag is first turned on if
  // the migration were skipped: `owner_audit_events` still carries the five-verb
  // CHECK, and INSERT OR IGNORE swallows the violation without a word.
  const db = freshDb({ skip: ['0031_'] });
  assert.doesNotMatch(
    String(db.value("SELECT sql FROM sqlite_master WHERE name = 'owner_audit_events'")),
    /seller\.bind/,
    'this fixture must genuinely lack the new verb',
  );
  const created = await mint(db);
  assert.equal(
    await failure(() => redeemSellerBindingChallenge(
      bindingEnv(), db.asD1(), OWNER_TELEGRAM, created.challenge, REQUEST_ID, new Date('2026-08-03T10:01:00.000Z'),
    )),
    'persistence_failed',
  );
  // The point of the ordering: no membership, because no audit row was possible.
  assert.equal(telegramMemberships(db), 0, 'seller authority must never be granted unaudited');
  assert.equal(count(db, 'SELECT COUNT(*) FROM owner_audit_events'), 0);
  assert.equal(count(db, 'SELECT COUNT(*) FROM seller_identity_binding_challenges WHERE redeemed_at IS NOT NULL'), 0);
});

test('behaviour: both halves stop grinding after five attempts', async () => {
  const db = freshDb();
  resetBindingAttempts();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(
      await failure(() => redeemSellerBindingChallenge(
        bindingEnv(), db.asD1(), OWNER_TELEGRAM, 'a'.repeat(64), REQUEST_ID, new Date('2026-08-03T10:01:00.000Z'),
      )),
      'challenge_invalid',
    );
  }
  assert.equal(
    await failure(() => redeemSellerBindingChallenge(
      bindingEnv(), db.asD1(), OWNER_TELEGRAM, 'a'.repeat(64), REQUEST_ID, new Date('2026-08-03T10:01:00.000Z'),
    )),
    'rate_limited',
  );
  // A different caller still has their own budget.
  assert.equal(
    await failure(() => redeemSellerBindingChallenge(
      bindingEnv(), db.asD1(), OTHER_TELEGRAM, 'a'.repeat(64), REQUEST_ID, new Date('2026-08-03T10:01:00.000Z'),
    )),
    'challenge_invalid',
  );
  // And the mint half caps independently.
  resetBindingAttempts();
  const at = new Date('2026-08-03T10:00:00.000Z');
  await mint(db, bindingEnv(), at);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal(await failure(() => mint(db, bindingEnv(), at)), 'challenge_exists');
  }
  assert.equal(await failure(() => mint(db, bindingEnv(), at)), 'rate_limited');
});

test('behaviour: disabling the membership takes the authority straight back', async () => {
  const db = freshDb();
  const created = await mint(db);
  await redeemSellerBindingChallenge(
    bindingEnv(), db.asD1(), OWNER_TELEGRAM, created.challenge, REQUEST_ID, new Date('2026-08-03T10:01:00.000Z'),
  );
  // The query the catalog uses to decide who owns a store.
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
  assert.equal(owned(), 1);
  db.exec(`UPDATE memberships SET status = 'disabled' WHERE identity_id = '${OWNER_TELEGRAM}'`);
  assert.equal(owned(), 0, 'the rollback is one UPDATE and it is immediate');
  // The audit history of the grant survives the rollback.
  assert.equal(count(db, "SELECT COUNT(*) FROM owner_audit_events WHERE action = 'seller.bind'"), 1);
});

test('behaviour: the runtime DDL and migration 0032 build the same table', async () => {
  const migrated = new SqliteD1();
  applyMigrations(migrated);
  const bootstrapped = new SqliteD1();
  applyMigrations(bootstrapped, ['0032_']);
  await ensureSellerBindingSchema(bootstrapped.asD1());

  const shape = (db: SqliteD1) => ({
    // `notnull` is an operator in SQLite, so the pragma column has to be quoted.
    columns: db.rows<{ name: string; type: string; notnull: number; pk: number }>(
      'SELECT name, type, "notnull", pk FROM pragma_table_info(\'seller_identity_binding_challenges\')',
    ),
    keys: db.rows<{ table: string; from: string; to: string }>(
      "SELECT \"table\", \"from\", \"to\" FROM pragma_foreign_key_list('seller_identity_binding_challenges')",
    ),
    indexes: db.rows<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'seller_identity_binding_challenges' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ),
  });
  assert.deepEqual(shape(bootstrapped), shape(migrated), 'a divergent mirror means tests prove nothing');
});

test('behaviour: the audit rebuild carries existing rows and indexes across', async () => {
  const db = new SqliteD1();
  applyMigrations(db, ['0031_', '0032_']);
  // Six rows, the number production actually holds, using the old vocabulary.
  for (let index = 0; index < 6; index += 1) {
    db.exec(`
      INSERT INTO owner_audit_events (
        event_id, actor_email, actor_role, action, target_type, target_id, org_id,
        reason_code, request_id, idempotency_key, before_json, after_json, created_at
      ) VALUES (
        'oaudit_${index}', 'owner@example.test', 'platform_owner', 'store.suspend',
        'store', 'store_${index}', 'org_${index}', 'policy_violation', 'req_${index}',
        'key_${index}', '{"a":1}', '{"b":2}', '2026-07-0${index + 1}T00:00:00.000Z'
      );
    `);
  }
  const before = db.rows<Record<string, unknown>>('SELECT * FROM owner_audit_events ORDER BY event_id');
  const indexesBefore = db.rows<{ name: string; sql: string }>(
    "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'owner_audit_events' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  assert.equal(before.length, 6);
  assert.equal(indexesBefore.length, 3);

  db.exec(readFileSync(path.join(MIGRATIONS, '0031_owner_audit_seller_binding.sql'), 'utf8'));

  const after = db.rows<Record<string, unknown>>('SELECT * FROM owner_audit_events ORDER BY event_id');
  assert.deepEqual(after, before, 'every existing audit row must survive byte for byte');
  const indexesAfter = db.rows<{ name: string; sql: string }>(
    "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'owner_audit_events' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  assert.deepEqual(
    indexesAfter.map((row) => row.name),
    indexesBefore.map((row) => row.name),
    'all three indexes must come back',
  );
  for (const index of indexesAfter) {
    const original = indexesBefore.find((row) => row.name === index.name);
    assert.equal(
      index.sql.replace(/\s+/g, ' ').replace(/IF NOT EXISTS /, ''),
      original?.sql.replace(/\s+/g, ' ').replace(/IF NOT EXISTS /, ''),
      `${index.name} must be recreated with the same definition`,
    );
  }
  // The new verb is accepted and the old ones still are.
  for (const action of ['store.suspend', 'seller.bind', 'seller.unbind']) {
    db.exec(`
      INSERT INTO owner_audit_events (
        event_id, actor_email, actor_role, action, target_type, target_id, org_id,
        reason_code, request_id, idempotency_key, before_json, after_json, created_at
      ) VALUES (
        'oaudit_${action}', 'owner@example.test', 'platform_owner', '${action}',
        'store', 'store_x', 'org_x', 'seller_request', 'req_x', 'key_${action}',
        NULL, NULL, '2026-08-03T00:00:00.000Z'
      );
    `);
  }
  assert.throws(() => db.exec(`
    INSERT INTO owner_audit_events (
      event_id, actor_email, actor_role, action, target_type, target_id, org_id,
      reason_code, request_id, idempotency_key, before_json, after_json, created_at
    ) VALUES (
      'oaudit_bad', 'owner@example.test', 'platform_owner', 'seller.invent',
      'store', 'store_x', 'org_x', 'seller_request', 'req_x', 'key_bad',
      NULL, NULL, '2026-08-03T00:00:00.000Z'
    );
  `), /CHECK constraint failed/, 'the list stays closed');
  assert.deepEqual(db.rows('PRAGMA foreign_key_check'), []);
  assert.equal(db.value('PRAGMA integrity_check'), 'ok');
});

// ── Ledger reconciliation, executed ───────────────────────────────────────────

function ledgerDb(skip: readonly string[]): SqliteD1 {
  const db = new SqliteD1();
  applyMigrations(db, skip);
  db.exec(`
    CREATE TABLE d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  for (const name of migrationFiles().filter((file) => file < '0026')) {
    db.exec(`INSERT INTO d1_migrations (name) VALUES ('${name}');`);
  }
  return db;
}

function runReconcile(db: SqliteD1): void {
  db.exec(readFileSync(path.join(fileURLToPath(ROOT), 'scripts/d1/reconcile-ledger-0026-0030.sql'), 'utf8'));
}

test('behaviour: the ledger repair writes five rows and is safe to run twice', async () => {
  const db = ledgerDb(['0031_', '0032_']);
  assert.equal(count(db, 'SELECT COUNT(*) FROM d1_migrations'), 25);
  runReconcile(db);
  const names = db.rows<{ name: string }>('SELECT name FROM d1_migrations ORDER BY id').map((row) => row.name);
  assert.equal(names.length, 30);
  assert.deepEqual(names.slice(25), [
    '0026_market_buyer_experience.sql',
    '0027_market_catalog_quality.sql',
    '0028_market_product_comparison.sql',
    '0029_market_checkout_comment.sql',
    '0030_market_telegram_reliability.sql',
  ]);
  // Second run writes nothing.
  runReconcile(db);
  assert.equal(count(db, 'SELECT COUNT(*) FROM d1_migrations'), 30);
  // And the numbering the runner compares against is contiguous.
  assert.equal(count(db, 'SELECT MAX(id) FROM d1_migrations'), 30);
});

test('behaviour: the ledger repair refuses to claim a migration that did not land', async () => {
  // 0029 is the one absent from the schema, so its ledger row must not appear
  // even though the four around it do.
  const db = ledgerDb(['0029_', '0031_', '0032_']);
  assert.equal(
    count(db, "SELECT COUNT(*) FROM pragma_table_info('sotuvchi_orders') WHERE name = 'buyer_comment'"),
    0,
    'this fixture must genuinely lack 0029',
  );
  runReconcile(db);
  const names = db.rows<{ name: string }>('SELECT name FROM d1_migrations').map((row) => row.name);
  assert.equal(names.length, 29);
  assert.ok(!names.includes('0029_market_checkout_comment.sql'), 'a missing artifact must leave the ledger behind');
  assert.ok(names.includes('0030_market_telegram_reliability.sql'));
  // Leaving the ledger short blocks the runner, which is the safe direction.
});

test('behaviour: the ledger repair changes no schema and no business data', async () => {
  const db = ledgerDb(['0031_', '0032_']);
  const schemaBefore = db.rows<{ sql: string }>("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name");
  runReconcile(db);
  const schemaAfter = db.rows<{ sql: string }>("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name");
  assert.deepEqual(schemaAfter, schemaBefore, 'the repair executes none of the DDL it records');
  assert.deepEqual(db.rows('PRAGMA foreign_key_check'), []);
  assert.equal(db.value('PRAGMA integrity_check'), 'ok');
});
