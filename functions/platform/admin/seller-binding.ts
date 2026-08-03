/**
 * Owner-assisted binding of a Telegram identity to an existing store.
 *
 * The problem this solves: the one owner membership in production belongs to an
 * `api`-provider identity, and a person opening the Mini App is always a
 * `telegram` identity. The owner of a real store therefore has no seller
 * authority inside the app they own. `memberships.identity_id` points straight
 * at `identities.id` — there is no actor or account to attach a second provider
 * to — so the only thing the schema and the access resolver already understand
 * is a second membership row.
 *
 * The hard part is not writing the row. It is proving that the Telegram account
 * asking for it belongs to the owner. A username is not proof: it is mutable,
 * re-assignable and trivially claimed. A Telegram id typed in by hand is worse,
 * because the person typing it is asserting exactly the thing under question.
 *
 * So possession is proved by making the two authorities meet:
 *
 *   the owner, holding a signed platform_owner token, mints one challenge;
 *   the Telegram account, holding a session Telegram itself signed, spends it.
 *
 * Neither side can complete a binding alone, and the identity that gets bound is
 * the one that authenticated the redeeming request — never one named in a body,
 * a query string or a header.
 */
import type { Env } from '../../_types';
import { prepareOwnerAuditInsert } from './audit';
import { OwnerValidationError } from './validation';

/** Ten minutes. Long enough to switch apps, short enough that a leak expires. */
export const BINDING_CHALLENGE_TTL_MS = 10 * 60 * 1000;
/** 32 bytes of CSPRNG, base32-ish hex. Not guessable, not derived from anything. */
const CHALLENGE_BYTES = 32;

export type SellerBindingFailure =
  | 'binding_disabled'
  // Canary failures are told apart from each other, and from the flag being
  // off, because the only caller that can ever see them is already an
  // authenticated platform_owner running a ceremony they were handed a key
  // for. An anonymous caller never gets this far: the route answers 401 first.
  | 'canary_invalid'
  | 'canary_expired'
  | 'canary_consumed'
  | 'store_unavailable'
  | 'store_ambiguous'
  | 'challenge_exists'
  | 'challenge_invalid'
  | 'challenge_expired'
  | 'challenge_spent'
  | 'membership_disabled'
  | 'membership_conflict'
  | 'identity_unsupported'
  | 'rate_limited'
  | 'persistence_failed';

export class SellerBindingError extends Error {
  constructor(public readonly code: SellerBindingFailure) {
    super(code);
    this.name = 'SellerBindingError';
  }
}

/**
 * Attempt cap, owned here rather than by the callers.
 *
 * Both entry points already sit behind something — an admin token, a market
 * rate limiter — but a security core that relies on its callers to bound it is
 * one refactor away from being unbounded. Isolate-local and therefore
 * best-effort; the single-use challenge is what actually stops a replay.
 *
 * The bucket key is a fold of the caller, not the caller: this map outlives a
 * request, and there is no reason for an owner email or an identity id to sit
 * in it.
 */
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const ATTEMPT_LIMIT = 5;
const ATTEMPT_BUCKETS = 512;
const attempts = new Map<string, { count: number; resetAt: number }>();

function foldKey(scope: string, value: string): string {
  let hash = 0x811c9dc5;
  for (const char of `${scope}:${value}`) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${scope}:${hash.toString(16)}`;
}

export function spendBindingAttempt(
  scope: 'mint' | 'redeem' | 'inspect',
  caller: string,
  now: Date,
): void {
  const stamp = now.getTime();
  for (const [key, bucket] of attempts) {
    if (bucket.resetAt <= stamp) attempts.delete(key);
  }
  while (attempts.size >= ATTEMPT_BUCKETS) {
    const oldest = attempts.keys().next().value;
    if (typeof oldest !== 'string') break;
    attempts.delete(oldest);
  }
  const key = foldKey(scope, caller);
  const current = attempts.get(key);
  if (!current || current.resetAt <= stamp) {
    attempts.set(key, { count: 1, resetAt: stamp + ATTEMPT_WINDOW_MS });
    return;
  }
  if (current.count >= ATTEMPT_LIMIT) throw new SellerBindingError('rate_limited');
  current.count += 1;
}

/** Test seam. Buckets are isolate-local, so a suite must be able to clear them. */
export function resetBindingAttempts(): void {
  attempts.clear();
}

export function bindingEnabled(env: Env): boolean {
  return (env.MARKET_OWNER_TELEGRAM_BINDING_ENABLED ?? '').trim().toLowerCase() === 'true';
}

/**
 * The owner-only canary.
 *
 * The switch above is one boolean for everybody: on, every authenticated owner
 * may mint and every verified Telegram session may redeem. There is a narrower
 * thing an owner can legitimately want — to run the ceremony once, themselves,
 * while the feature stays shut for everyone else — and a boolean cannot express
 * it.
 *
 * So this expresses it instead, and it deliberately is not a second boolean:
 *
 *   MARKET_OWNER_TELEGRAM_BINDING_CANARY = v1|<digest>|<from>|<until>|<expected>
 *
 * `<digest>` is SHA-256 over a key that exists only in the hands of the owner
 * running the ceremony, the organization this may target, the window, and how
 * many challenges the store is allowed to have already. Deployment carries the
 * digest; the key is never committed, never stored, never logged and never
 * travels to the Mini App. Editing any plaintext part of the string invalidates
 * it, because every part is inside the digest.
 *
 * What that buys, compared with flipping the flag: minting still needs a signed
 * platform_owner token *and* possession of the key, the window cannot be longer
 * than fifteen minutes because a longer one fails to parse, and the single-use
 * property is a row count in a table rather than a promise in a comment.
 */
export const CANARY_MAX_TTL_MS = 15 * 60 * 1000;
const CANARY_VERSION = 'v1';
const CANARY_DOMAIN = 'bormi-auth1f-canary';

export interface CanaryWindow {
  digest: string;
  issuedAt: string;
  expiresAt: string;
  /**
   * How many challenge rows the target organization may already have for this
   * grant to be spendable. Zero for a first ceremony. It is what makes the
   * grant single-use across isolates, restarts and retries: the first mint
   * moves the count past it permanently, and only a new deployment carrying a
   * new expectation can move it back into range.
   */
  expectedChallenges: number;
}

/**
 * Parse and structurally validate the canary. Anything malformed is absent:
 * there is no partial credit and no default that opens something.
 */
export function parseCanaryWindow(env: Env): CanaryWindow | null {
  const raw = (env.MARKET_OWNER_TELEGRAM_BINDING_CANARY ?? '').trim();
  if (!raw) return null;
  const parts = raw.split('|');
  if (parts.length !== 5) return null;
  const [version, digest, issuedAt, expiresAt, expected] = parts;
  if (version !== CANARY_VERSION) return null;
  if (!/^[0-9a-f]{64}$/.test(digest)) return null;
  if (!/^\d{1,3}$/.test(expected)) return null;
  const from = Date.parse(issuedAt);
  const until = Date.parse(expiresAt);
  if (!Number.isFinite(from) || !Number.isFinite(until)) return null;
  // The TTL cap is enforced here rather than trusted from an operator: a window
  // wider than the cap is not clamped, it is refused, so a stale grant left in
  // a configuration file cannot quietly stay open for a day.
  if (until <= from || until - from > CANARY_MAX_TTL_MS) return null;
  return { digest, issuedAt, expiresAt, expectedChallenges: Number(expected) };
}

/**
 * Whether the ceremony may be reached at all right now.
 *
 * Used by the two Telegram-side routes and by the flag the Mini App reads to
 * decide whether to offer the screen. Redemption gets a grace period of one
 * challenge TTL past the window, because a challenge minted in the last minute
 * of the window is legitimately alive after it; without that, a code the owner
 * is holding would stop working while its own timer still showed time left.
 *
 * No key is involved. The Telegram half does not have one, and requiring one
 * would mean shipping it into the Mini App — which is the opposite of the
 * point. What guards redemption is the challenge itself: 32 random bytes, one
 * use, ten minutes, re-checked against the store inside the transaction.
 */
export function bindingCeremonyOpen(env: Env, now: Date): boolean {
  if (bindingEnabled(env)) return true;
  const window = parseCanaryWindow(env);
  if (!window) return false;
  const stamp = now.getTime();
  return stamp >= Date.parse(window.issuedAt)
    && stamp < Date.parse(window.expiresAt) + BINDING_CHALLENGE_TTL_MS;
}

/** The mint window proper: no grace, because minting is what is being bounded. */
function canaryMintWindow(env: Env, now: Date): CanaryWindow | null {
  const window = parseCanaryWindow(env);
  if (!window) return null;
  const stamp = now.getTime();
  if (stamp < Date.parse(window.issuedAt)) return null;
  if (stamp >= Date.parse(window.expiresAt)) return null;
  return window;
}

export async function canaryDigest(
  key: string,
  orgId: string,
  window: Pick<CanaryWindow, 'issuedAt' | 'expiresAt' | 'expectedChallenges'>,
): Promise<string> {
  const material = [
    CANARY_DOMAIN,
    CANARY_VERSION,
    key,
    orgId,
    window.issuedAt,
    window.expiresAt,
    String(window.expectedChallenges),
  ].join('|');
  return hashChallenge(material);
}

/** Equal-length hex compare that does not return early on the first mismatch. */
function sameDigest(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

/** Hex SHA-256. The table stores this; the raw value is shown once and dropped. */
export async function hashChallenge(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newChallenge(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CHALLENGE_BYTES));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS seller_identity_binding_challenges (
    challenge_hash TEXT PRIMARY KEY CHECK (length(challenge_hash) = 64),
    org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 120)
      REFERENCES organizations(id) ON DELETE RESTRICT,
    store_id TEXT NOT NULL CHECK (length(store_id) BETWEEN 1 AND 120)
      REFERENCES sotuvchi_stores(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('seller.bind')),
    created_by TEXT NOT NULL CHECK (length(created_by) BETWEEN 1 AND 200),
    created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
    expires_at TEXT NOT NULL CHECK (length(expires_at) BETWEEN 1 AND 64),
    redeemed_at TEXT CHECK (redeemed_at IS NULL OR length(redeemed_at) BETWEEN 1 AND 64)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_seller_binding_challenge_open
     ON seller_identity_binding_challenges (org_id, redeemed_at, expires_at)`,
] as const;

const bootstrapped = new WeakMap<D1Database, Promise<void>>();

/** Migration 0032 owns production; this keeps tests and local runs in parity. */
export function ensureSellerBindingSchema(db: D1Database): Promise<void> {
  let pending = bootstrapped.get(db);
  if (!pending) {
    pending = (async () => {
      for (const statement of DDL) await db.prepare(statement).run();
    })().catch((error) => {
      bootstrapped.delete(db);
      throw error;
    });
    bootstrapped.set(db, pending);
  }
  return pending;
}

export interface CreatedChallenge {
  /** Shown to the owner once. Never persisted, never logged, never returned again. */
  challenge: string;
  expiresAt: string;
  storeName: string;
}

/**
 * Mints the one outstanding challenge for a store.
 *
 * The caller must already have been resolved as `platform_owner`; this function
 * does not check roles, because a function that both authenticates and mutates
 * is a function where one refactor removes the authentication.
 */
export async function createSellerBindingChallenge(
  env: Env,
  db: D1Database,
  actorEmail: string,
  now: Date,
  canaryKey?: unknown,
): Promise<CreatedChallenge> {
  // Two ways in, and the narrow one is checked in two halves: everything that
  // does not need the database first, so a closed canary costs one string parse
  // and no query, and the key itself once the target is known — a digest over
  // an organization the caller did not choose is a digest they cannot forge.
  const canary = bindingEnabled(env) ? null : canaryMintWindow(env, now);
  if (!bindingEnabled(env)) {
    // Nothing configured at all is the ordinary off state, and it answers the
    // way it always has. A configured window that has closed says so, because
    // the owner reading it is the one who asked for the window.
    if (!parseCanaryWindow(env)) throw new SellerBindingError('binding_disabled');
    if (!canary) throw new SellerBindingError('canary_expired');
    if (typeof canaryKey !== 'string' || !/^[0-9a-f]{64}$/.test(canaryKey)) {
      throw new SellerBindingError('canary_invalid');
    }
  }
  spendBindingAttempt('mint', actorEmail, now);
  await ensureSellerBindingSchema(db);

  // The target is resolved from the database, never from the request. There is
  // exactly one active store; naming it in a body would add a way to get it
  // wrong without adding a way to get it right.
  //
  // Two rows is not "pick the first". It means the assumption this rests on has
  // stopped being true, and guessing which store an owner meant is exactly the
  // cross-tenant mistake a binding must never make, so it stops instead.
  const candidates = await db.prepare(
    `SELECT store.id AS store_id, store.org_id AS org_id, store.name AS name
       FROM sotuvchi_stores AS store
       JOIN organizations AS org ON org.id = store.org_id AND org.status = 'active'
      WHERE store.status = 'active'
      ORDER BY store.id ASC
      LIMIT 2`,
  ).all<{ store_id: string; org_id: string; name: string }>();
  const stores = candidates.results ?? [];
  if (stores.length === 0) throw new SellerBindingError('store_unavailable');
  if (stores.length > 1) throw new SellerBindingError('store_ambiguous');
  const store = stores[0];

  if (canary) {
    // The organization goes into the digest, and it is the one the database
    // just named — not one the caller could steer towards. A key minted for
    // this ceremony therefore cannot be spent against a store that appears
    // later, and a grant cannot be re-pointed by editing the deployment.
    const key = typeof canaryKey === 'string' ? canaryKey : '';
    if (!sameDigest(await canaryDigest(key, store.org_id, canary), canary.digest)) {
      throw new SellerBindingError('canary_invalid');
    }
    // Single-use, and durable enough to survive the isolate that served the
    // first attempt. Every challenge ever minted for this organization counts,
    // redeemed or expired alike, so a ceremony cannot be repeated by waiting
    // for its own code to lapse.
    const minted = await db.prepare(
      `SELECT COUNT(*) AS n FROM seller_identity_binding_challenges WHERE org_id = ?`,
    ).bind(store.org_id).first<{ n: number }>();
    if (Number(minted?.n ?? 0) !== canary.expectedChallenges) {
      throw new SellerBindingError('canary_consumed');
    }
  }

  const nowIso = now.toISOString();
  // At most one live challenge per organization: two outstanding secrets means
  // two chances for the wrong one to be spent, and no way to tell them apart.
  const open = await db.prepare(
    `SELECT COUNT(*) AS n FROM seller_identity_binding_challenges
      WHERE org_id = ? AND redeemed_at IS NULL AND expires_at > ?`,
  ).bind(store.org_id, nowIso).first<{ n: number }>();
  if (Number(open?.n ?? 0) > 0) throw new SellerBindingError('challenge_exists');

  const challenge = newChallenge();
  const expiresAt = new Date(now.getTime() + BINDING_CHALLENGE_TTL_MS).toISOString();
  await db.prepare(
    `INSERT INTO seller_identity_binding_challenges
       (challenge_hash, org_id, store_id, action, created_by, created_at, expires_at, redeemed_at)
     VALUES (?, ?, ?, 'seller.bind', ?, ?, ?, NULL)`,
  ).bind(
    await hashChallenge(challenge),
    store.org_id,
    store.store_id,
    actorEmail,
    nowIso,
    expiresAt,
  ).run();

  return { challenge, expiresAt, storeName: store.name };
}

/**
 * What a challenge is for, told to the person about to spend it — and nothing
 * else. A store's display name is already in their hands: the owner read it in
 * the Owner Control Center when they minted the code.
 */
export interface InspectedChallenge {
  storeName: string;
}

/**
 * Read a live challenge without spending it.
 *
 * A confirmation that names nothing is not a confirmation. Redeeming is a
 * single irreversible act, so the screen that asks "bind this Telegram?" has to
 * be able to say *to what* before the person answers, and the redeem endpoint
 * cannot be used for that — it would consume the challenge to draw a dialog.
 *
 * This reads. It never writes, never marks anything used, and returns exactly
 * one string. It is deliberately not an oracle worth having: the caller must
 * already hold a verified Telegram session, the flag must be on, the guess
 * space is 2^256, and every failure — unknown, expired, spent, suspended —
 * leaves through the same door as the redeem failures do.
 */
export async function inspectSellerBindingChallenge(
  env: Env,
  db: D1Database,
  identityId: string,
  rawChallenge: unknown,
  now: Date,
): Promise<InspectedChallenge> {
  if (!bindingCeremonyOpen(env, now)) throw new SellerBindingError('binding_disabled');
  // Its own budget. Sharing one with redeem would let a look-up spend the
  // attempts the actual binding needs.
  spendBindingAttempt('inspect', identityId, now);
  if (typeof rawChallenge !== 'string' || !/^[0-9a-f]{64}$/.test(rawChallenge)) {
    throw new SellerBindingError('challenge_invalid');
  }
  await ensureSellerBindingSchema(db);

  const nowIso = now.toISOString();
  const row = await db.prepare(
    `SELECT org_id, store_id, expires_at, redeemed_at
       FROM seller_identity_binding_challenges
      WHERE challenge_hash = ? AND action = 'seller.bind'`,
  ).bind(await hashChallenge(rawChallenge)).first<{
    org_id: string; store_id: string; expires_at: string; redeemed_at: string | null;
  }>();
  if (!row) throw new SellerBindingError('challenge_invalid');
  if (row.redeemed_at) throw new SellerBindingError('challenge_spent');
  if (row.expires_at <= nowIso) throw new SellerBindingError('challenge_expired');

  // The same store and organization checks redemption makes, so a preview never
  // promises access that the redemption would then refuse.
  const store = await db.prepare(
    `SELECT store.name AS name
       FROM sotuvchi_stores AS store
       JOIN organizations AS org ON org.id = store.org_id AND org.status = 'active'
      WHERE store.id = ? AND store.org_id = ? AND store.status = 'active'`,
  ).bind(row.store_id, row.org_id).first<{ name: string }>();
  if (!store) throw new SellerBindingError('store_unavailable');

  return { storeName: store.name };
}

export interface BindingResult {
  /** What the person can do now. Deliberately not an id of anything. */
  sellerRead: boolean;
  sellerCommands: boolean;
  storeName: string;
  /** True when this exact binding already existed — a replay, not a new grant. */
  alreadyBound: boolean;
}

/**
 * Spends a challenge on behalf of the identity that authenticated this request.
 *
 * `identityId` must come from the verified session claims of the caller. Passing
 * anything a client could choose would defeat the entire mechanism.
 */
export async function redeemSellerBindingChallenge(
  env: Env,
  db: D1Database,
  identityId: string,
  rawChallenge: unknown,
  requestId: string,
  now: Date,
): Promise<BindingResult> {
  if (!bindingCeremonyOpen(env, now)) throw new SellerBindingError('binding_disabled');
  spendBindingAttempt('redeem', identityId, now);
  if (typeof rawChallenge !== 'string' || !/^[0-9a-f]{64}$/.test(rawChallenge)) {
    throw new SellerBindingError('challenge_invalid');
  }
  await ensureSellerBindingSchema(db);

  const nowIso = now.toISOString();
  const hash = await hashChallenge(rawChallenge);
  const row = await db.prepare(
    `SELECT challenge_hash, org_id, store_id, created_by, expires_at, redeemed_at
       FROM seller_identity_binding_challenges
      WHERE challenge_hash = ? AND action = 'seller.bind'`,
  ).bind(hash).first<{
    challenge_hash: string; org_id: string; store_id: string;
    created_by: string; expires_at: string; redeemed_at: string | null;
  }>();
  // Unknown, spent and expired are distinguished for the operator but all fail.
  if (!row) throw new SellerBindingError('challenge_invalid');
  if (row.redeemed_at) throw new SellerBindingError('challenge_spent');
  if (row.expires_at <= nowIso) throw new SellerBindingError('challenge_expired');

  // The store and org are re-read and re-checked at redemption. A challenge
  // minted while the store was active must not still work after it was
  // suspended.
  const store = await db.prepare(
    `SELECT store.name AS name
       FROM sotuvchi_stores AS store
       JOIN organizations AS org ON org.id = store.org_id AND org.status = 'active'
      WHERE store.id = ? AND store.org_id = ? AND store.status = 'active'`,
  ).bind(row.store_id, row.org_id).first<{ name: string }>();
  if (!store) throw new SellerBindingError('store_unavailable');

  // The caller of this function is supposed to hand over a subject taken from a
  // verified Telegram session, so a non-telegram identity here means a wiring
  // mistake rather than an attack. It still stops, and it stops by saying what
  // is wrong instead of failing later inside a guard where the answer would be
  // an opaque 500.
  const identity = await db.prepare(
    `SELECT provider FROM identities WHERE id = ?`,
  ).bind(identityId).first<{ provider: string }>();
  if (identity?.provider !== 'telegram') {
    throw new SellerBindingError('identity_unsupported');
  }

  const existing = await db.prepare(
    `SELECT role, status FROM memberships WHERE org_id = ? AND identity_id = ?`,
  ).bind(row.org_id, identityId).first<{ role: string; status: string }>();

  // A membership that somebody disabled is a decision, not an obstacle. Silently
  // turning it back on would let a revoked seller restore themselves with a
  // challenge, so this stops and asks for an explicit owner action instead.
  if (existing && existing.status !== 'active') {
    throw new SellerBindingError('membership_disabled');
  }
  // An active membership in another role is also a decision. `UNIQUE (org_id,
  // identity_id)` means there is no room for a second row, so silently
  // continuing would end in a write that does nothing and a 500 that explains
  // nothing. Say what is actually in the way.
  if (existing && existing.role !== 'owner') {
    throw new SellerBindingError('membership_conflict');
  }

  const alreadyBound = Boolean(existing && existing.role === 'owner' && existing.status === 'active');

  const membershipId = `membership_${crypto.randomUUID().replaceAll('-', '')}`;
  const audit = prepareOwnerAuditInsert(
    db,
    {
      actorEmail: row.created_by,
      actorRole: 'platform_owner',
      action: 'seller.bind',
      targetType: 'store',
      targetId: row.store_id,
      orgId: row.org_id,
      reasonCode: 'seller_request',
      requestId,
      // The challenge hash keys the audit row, so a replayed redemption cannot
      // produce a second audit event for the same grant.
      idempotencyKey: `seller_bind_${row.challenge_hash}`,
      // Allowlisted metadata only. No Telegram id, no username, no raw challenge.
      before: { membership: existing ? existing.status : 'absent' },
      after: { membership: 'active', role: 'owner', identityProvider: 'telegram' },
    },
    nowIso,
    // Every precondition of a legitimate grant, re-asserted inside the
    // transaction rather than trusted from the reads above.
    //
    // The last clause is the one that decides a race. Two requests can both read
    // an unspent challenge; only one of them can evaluate this guard against a
    // row that is *still* unspent, because the winner's UPDATE lands first and
    // the loser's whole batch then writes nothing. Without it, one leaked
    // challenge binds two different Telegram accounts.
    `EXISTS (SELECT 1 FROM organizations WHERE id = ? AND status = 'active')
       AND EXISTS (SELECT 1 FROM sotuvchi_stores WHERE id = ? AND org_id = ? AND status = 'active')
       AND EXISTS (SELECT 1 FROM identities WHERE id = ? AND provider = 'telegram')
       AND NOT EXISTS (SELECT 1 FROM memberships WHERE org_id = ? AND identity_id = ?
                         AND NOT (role = 'owner' AND status = 'active'))
       AND EXISTS (SELECT 1 FROM seller_identity_binding_challenges
                    WHERE challenge_hash = ? AND action = 'seller.bind'
                      AND redeemed_at IS NULL AND expires_at > ?)`,
    [
      row.org_id,
      row.store_id, row.org_id,
      identityId,
      row.org_id, identityId,
      row.challenge_hash, nowIso,
    ],
  );

  // One transaction, and the audit row goes first.
  //
  // The order is the safety property. `prepareOwnerAuditInsert` emits an
  // `INSERT OR IGNORE`, and SQLite's IGNORE skips a row that violates *any*
  // constraint — including the CHECK on `action`. So on a database that has not
  // taken migration 0031 yet, an audit row for 'seller.bind' vanishes without
  // raising anything. Written the other way round — membership first, audit
  // guarded on it — that produces a committed grant of seller authority with no
  // audit event at all, silently, on exactly the database this ships against.
  //
  // Making the membership depend on the audit event id inverts that: if the
  // event cannot be written, the membership is not written either, the
  // challenge is not spent, and the caller gets an error. This is the same
  // shape `transitionPilotStateWithAudit` uses, for the same reason.
  const statements = [
    audit.statement,
    db.prepare(
      `INSERT OR IGNORE INTO memberships
         (id, org_id, identity_id, role, status, created_at, updated_at)
       SELECT ?, ?, ?, 'owner', 'active', ?, ?
        WHERE EXISTS (SELECT 1 FROM owner_audit_events WHERE event_id = ?)
          AND EXISTS (SELECT 1 FROM organizations WHERE id = ? AND status = 'active')
          AND EXISTS (SELECT 1 FROM sotuvchi_stores WHERE id = ? AND org_id = ? AND status = 'active')
          AND EXISTS (SELECT 1 FROM identities WHERE id = ? AND provider = 'telegram')`,
    ).bind(
      membershipId, row.org_id, identityId, nowIso, nowIso,
      audit.eventId,
      row.org_id, row.store_id, row.org_id, identityId,
    ),
    db.prepare(
      `UPDATE seller_identity_binding_challenges
          SET redeemed_at = ?
        WHERE challenge_hash = ?
          AND redeemed_at IS NULL
          AND EXISTS (SELECT 1 FROM owner_audit_events WHERE event_id = ?)
          AND EXISTS (SELECT 1 FROM memberships WHERE org_id = ? AND identity_id = ?
                        AND role = 'owner' AND status = 'active')`,
    ).bind(nowIso, row.challenge_hash, audit.eventId, row.org_id, identityId),
  ];
  // Nothing compensates in the other direction, and nothing needs to: the audit
  // table is append-only, and an audit row here cannot outlive its grant. If the
  // event was written, every guard on the membership insert has already been
  // evaluated true in this same transaction, and the only constraint that can
  // still skip the insert is `UNIQUE (org_id, identity_id)` — which means the
  // membership was already there, owner and active, because the audit guard
  // refused any other kind. Either way the grant holds when the batch commits.
  await db.batch(statements);

  // Report what is true now, read back rather than assumed. All three have to
  // hold together: the authority exists, it is recorded, and the challenge that
  // bought it is spent.
  const verified = await db.prepare(
    `SELECT
       (SELECT COUNT(*)
          FROM sotuvchi_stores AS store
          JOIN memberships AS membership
            ON membership.org_id = store.org_id
           AND membership.identity_id = ?
           AND membership.role = 'owner'
           AND membership.status = 'active'
          JOIN organizations AS org ON org.id = store.org_id AND org.status = 'active'
         WHERE store.id = ? AND store.status = 'active') AS granted,
       (SELECT COUNT(*) FROM owner_audit_events
         WHERE idempotency_key = ? AND action = 'seller.bind') AS audited,
       (SELECT COUNT(*) FROM seller_identity_binding_challenges
         WHERE challenge_hash = ? AND redeemed_at IS NOT NULL) AS spent`,
  ).bind(
    identityId,
    row.store_id,
    audit.input.idempotencyKey,
    row.challenge_hash,
  ).first<{ granted: number; audited: number; spent: number }>();
  if (
    Number(verified?.granted ?? 0) !== 1
    || Number(verified?.audited ?? 0) !== 1
    || Number(verified?.spent ?? 0) !== 1
  ) {
    throw new SellerBindingError('persistence_failed');
  }

  return {
    // Both come from the same membership the resolver reads, gated by the same
    // env switches every other seller entry point is gated by.
    sellerRead: (env.MARKET_MINI_APP_SELLER_READS_ENABLED ?? '').trim().toLowerCase() === 'true',
    sellerCommands: (env.MARKET_MINI_APP_SELLER_COMMANDS_ENABLED ?? '').trim().toLowerCase() === 'true',
    storeName: store.name,
    alreadyBound,
  };
}

export { OwnerValidationError };
