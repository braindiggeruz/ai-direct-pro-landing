// Web chat -> Telegram handoff.
//
// A person who hits the hourly cap in the browser is offered a real
// continuation: the studio's Telegram assistant, which carries its own,
// separate daily allowance. For that to feel like a continuation rather than
// a restart, the bot has to know which web conversation just arrived.
//
// Telegram gives us exactly one channel for that — the /start deep-link
// payload — and it is a hostile one: it is public, it lands in the person's
// message history, anyone can type it, and Telegram allows only
// [A-Za-z0-9_-] and at most 64 characters in it.
//
// So the payload is NOT the session id. A session id is a bearer handle to a
// stored conversation; putting it in a link that Telegram echoes back as
// plain text, and that a stranger could guess or replay, would hand the
// conversation to whoever typed it. Instead each handoff mints a fresh
// 128-bit random token, stores only its SHA-256, and dies on first claim or
// at expiry — whichever comes first.
//
//   payload   = "w_" + 32 lowercase hex  -> 34 chars, inside Telegram's 64
//   deep link = https://t.me/<bot>?start=<payload>
//
// The browser never assembles that link itself; it asks POST /api/gpt/handoff
// for one, so the id it holds is never the thing that unlocks anything.
import { sha256Hex } from './hash';
import { boundedNum, type BridgeEnv } from './bridge-env';

/** Telegram's own rule for a /start payload. Nothing else may be sent. */
export const START_PAYLOAD_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Our slice of that space: `w_` marks a payload minted by the website. */
export const HANDOFF_PAYLOAD_RE = /^w_[0-9a-f]{32}$/;
const HANDOFF_PREFIX = 'w_';

const DEFAULT_TTL_MINUTES = 1440; // 24h — long enough to go install Telegram.
const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 7 * 24 * 60;

export type HandoffLocale = 'ru' | 'uz';

export interface HandoffConfig {
  botUsername: string;
  ttlMs: number;
  /** False when no usable bot @username is set; the caller must degrade. */
  configured: boolean;
}

export function resolveHandoffConfig(env: BridgeEnv): HandoffConfig {
  const raw = env.GPT_HANDOFF_BOT_USERNAME || env.TELEGRAM_ASSISTANT_BOT_USERNAME || '';
  const botUsername = raw.replace(/^@/, '').trim();
  return {
    botUsername,
    ttlMs: boundedNum(env.GPT_HANDOFF_TTL_MINUTES, DEFAULT_TTL_MINUTES, MIN_TTL_MINUTES, MAX_TTL_MINUTES) * 60_000,
    // A username Telegram would reject is the same as no username: better a
    // visibly missing button than a link to a bot that does not exist.
    configured: /^[A-Za-z0-9_]{5,32}$/.test(botUsername),
  };
}

/** True when Telegram would accept this string as a /start payload. */
export function isValidStartPayload(payload: unknown): payload is string {
  return typeof payload === 'string' && START_PAYLOAD_RE.test(payload);
}

/** The token inside a website-minted payload, or null for anything else. */
export function parseHandoffPayload(payload: unknown): string | null {
  if (!isValidStartPayload(payload)) return null;
  if (!HANDOFF_PAYLOAD_RE.test(payload)) return null;
  return payload.slice(HANDOFF_PREFIX.length);
}

/** 128 bits of CSPRNG as hex. Not derived from the session id in any way. */
export function mintToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function payloadFor(token: string): string {
  return `${HANDOFF_PREFIX}${token}`;
}

export function deepLinkFor(botUsername: string, payload: string): string {
  return `https://t.me/${botUsername}?start=${payload}`;
}

export interface HandoffInput {
  sessionId: string | null;
  locale: HandoffLocale;
  /** Path only. The endpoint strips the query string before this is called. */
  pageUrl: string | null;
  intent: string | null;
}

export interface MintedHandoff {
  payload: string;
  deepLink: string;
  expiresAt: string;
}

/**
 * Store a fresh single-use link between a web session and a future /start.
 * Throws on a D1 failure so the endpoint can answer honestly rather than hand
 * out a link that will never be recognised.
 */
export async function mintHandoff(
  db: D1Database,
  cfg: HandoffConfig,
  input: HandoffInput,
  now = new Date(),
): Promise<MintedHandoff> {
  const token = mintToken();
  const payload = payloadFor(token);
  const expiresAt = new Date(now.getTime() + cfg.ttlMs).toISOString();
  await db
    .prepare(
      `INSERT INTO gpt_handoffs (token_hash, session_id, locale, page_url, intent, created_at, expires_at, claimed_at, claimed_by)
       VALUES (?,?,?,?,?,?,?,NULL,NULL)`,
    )
    .bind(
      await sha256Hex(token),
      input.sessionId,
      input.locale,
      input.pageUrl,
      input.intent,
      now.toISOString(),
      expiresAt,
    )
    .run();
  return { payload, deepLink: deepLinkFor(cfg.botUsername, payload), expiresAt };
}

export type HandoffClaimFailure = 'invalid' | 'not_found' | 'expired' | 'already_claimed';

export type HandoffClaim =
  | {
      ok: true;
      sessionId: string | null;
      locale: HandoffLocale;
      pageUrl: string | null;
      intent: string | null;
      createdAt: string;
      claimedAt: string;
    }
  | { ok: false; reason: HandoffClaimFailure };

interface HandoffRow {
  session_id: string | null;
  locale: string | null;
  page_url: string | null;
  intent: string | null;
  created_at: string;
  expires_at: string;
  claimed_at: string | null;
}

/**
 * Redeem a /start payload. Single use: the UPDATE is conditional on
 * `claimed_at IS NULL`, so two updates racing on the same token produce one
 * winner and one `already_claimed` — the check and the write are one
 * statement, not a read followed by a hopeful write.
 *
 * `claimedBy` is an opaque reference the Telegram side chooses (its own
 * pseudonymous user key). Do not pass a phone number or any other identifier
 * the person never gave the website.
 */
export async function claimHandoff(
  db: D1Database,
  payload: unknown,
  opts: { claimedBy?: string | null; now?: Date } = {},
): Promise<HandoffClaim> {
  const token = parseHandoffPayload(payload);
  if (!token) return { ok: false, reason: 'invalid' };
  const now = opts.now ?? new Date();
  const tokenHash = await sha256Hex(token);

  const row = await db
    .prepare(
      `SELECT session_id, locale, page_url, intent, created_at, expires_at, claimed_at
       FROM gpt_handoffs WHERE token_hash = ?`,
    )
    .bind(tokenHash)
    .first<HandoffRow>();
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.claimed_at) return { ok: false, reason: 'already_claimed' };
  if (row.expires_at <= now.toISOString()) return { ok: false, reason: 'expired' };

  const claimedAt = now.toISOString();
  const claimedBy = typeof opts.claimedBy === 'string' ? opts.claimedBy.slice(0, 64) : null;
  const update = await db
    .prepare('UPDATE gpt_handoffs SET claimed_at = ?, claimed_by = ? WHERE token_hash = ? AND claimed_at IS NULL')
    .bind(claimedAt, claimedBy, tokenHash)
    .run();
  if ((update.meta?.changes ?? 0) < 1) return { ok: false, reason: 'already_claimed' };

  return {
    ok: true,
    sessionId: row.session_id,
    locale: row.locale === 'uz' ? 'uz' : 'ru',
    pageUrl: row.page_url,
    intent: row.intent,
    createdAt: row.created_at,
    claimedAt,
  };
}

/**
 * Drop handoffs whose window closed. An expired token is already refused by
 * claimHandoff; this only stops the table growing. Best-effort.
 */
export async function pruneHandoffs(db: D1Database, now = new Date()): Promise<void> {
  try {
    await db.prepare('DELETE FROM gpt_handoffs WHERE expires_at < ?').bind(now.toISOString()).run();
  } catch {
    /* best-effort */
  }
}
