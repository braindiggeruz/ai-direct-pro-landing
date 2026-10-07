// The studio account, __Host-studio_account (spec §5.3, DECISIONS §8).
//
// A buyer's tariffs belong to an account of their own, made at the first
// order by the chat's IdentityStore.syntheticLogin("acct_studio_", a year)
// (identity-store.ts, unchanged): a random token, stored hashed in
// gpt_auth_sessions, carried by its own httpOnly cookie. The chat reads only
// __Host-gpt_account, so the studio and the chat never see each other's
// account, and signing in to the chat through Telegram (adoptGuest, which
// moves only chat orders) can never take a studio purchase away.
//
// Before an account is made (checkout.ts, POST /api/studio/checkout):
//   - a valid browser identity (__Host-studio_bid), else 401;
//   - a fresh Turnstile token of the action studio_checkout, else 403;
//   - the studio's own pace, never the chat's guest_account buckets (a
//     script from 12 addresses would close the chat's guest checkout for the
//     whole site): studio_account, 5 an hour per address, and
//     studio_account_global, 60 an hour on the site. A D1 failure of either
//     counter (degraded) is a refusal.
//
// The session never ends before the tariff: /me, while an entitlement runs,
// moves the session's end to the latest end + 30 days and sends the cookie
// again (a primary-key UPDATE of the current session, by its token hash;
// gpt_auth_sessions has no index by account). A lost cookie comes back only
// through support (restore.ts).
import { sha256Hex } from "../gpt-chat/hash";
import { authCookie, cookieValue, IdentityStore } from "../gpt-chat/identity-store";
import { consumeRateLimit, HOUR_MS, type RateLimitResult } from "../gpt-chat/rate-limit";
import type { LimitVerdict } from "./limits";
import { STUDIO_ORG } from "./schema";

export const STUDIO_ACCOUNT_COOKIE = "__Host-studio_account";
export const STUDIO_ACCOUNT_PREFIX = "acct_studio_";
/** A new account's session: a year. */
export const STUDIO_ACCOUNT_MS = 365 * 86_400_000;
/** The session lasts at least this long past the latest end of a tariff. */
export const SESSION_AFTER_TARIFF_MS = 30 * 86_400_000;

/** The gpt_rate_limits buckets of new studio accounts (spec §5.4). */
export const STUDIO_ACCOUNT_RATE = {
  address: { action: "studio_account", limit: 5, windowMs: HOUR_MS },
  site: { action: "studio_account_global", limit: 60, windowMs: HOUR_MS },
  checkout: { action: "studio_checkout", limit: 10, windowMs: HOUR_MS },
} as const;

/** Seconds a refusal caused by a D1 failure asks the browser to wait. */
const DEGRADED_RETRY_SECONDS = 60;
const TOKEN = /^[a-f0-9]{64}$/;

export interface StudioAccount {
  /** gpt_accounts.id, 'acct_studio_…'. */
  readonly userId: string;
  /** The cookie's token: only to send the same cookie again with a longer life. Never stored or logged. */
  readonly token: string;
  readonly tokenHash: string;
  /** When the session ends (ms). */
  readonly expiresAt: number;
}

/** The Set-Cookie value of a studio account session living `seconds`. */
export function accountCookie(token: string, seconds: number): string {
  return authCookie(STUDIO_ACCOUNT_COOKIE, token, Math.max(0, Math.floor(seconds)));
}

/**
 * The studio account of the request's __Host-studio_account, or null: no
 * cookie, a malformed one, a session that ended or was removed, or a
 * session of an account that is not a studio account.
 */
export async function readStudioAccount(request: Request, db: D1Database, now = Date.now()): Promise<StudioAccount | null> {
  const token = cookieValue(request, STUDIO_ACCOUNT_COOKIE);
  if (!TOKEN.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare("SELECT user_id, expires_at FROM gpt_auth_sessions WHERE org_id=? AND token_hash=? AND expires_at>?")
    .bind(STUDIO_ORG, tokenHash, now)
    .first<{ user_id: string; expires_at: number }>();
  if (!row || !row.user_id.startsWith(STUDIO_ACCOUNT_PREFIX)) return null;
  return { userId: row.user_id, token, tokenHash, expiresAt: Number(row.expires_at) };
}

/** The request carries a studio account cookie at all (no D1). */
export function hasAccountCookie(request: Request): boolean {
  return TOKEN.test(cookieValue(request, STUDIO_ACCOUNT_COOKIE));
}

function verdict(result: RateLimitResult): LimitVerdict {
  if (result.degraded) return { ok: false, code: "studio_busy", retryAfterSeconds: DEGRADED_RETRY_SECONDS };
  return result.allowed ? { ok: true } : { ok: false, code: "rate_limited", retryAfterSeconds: result.retryAfterSeconds };
}

/**
 * One more new account from `address` (limits.ts studioAddress): 429 past 5
 * an hour per address or 60 an hour on the site; a D1 failure refuses
 * (studio_busy). The site's bucket counts only what the address's let through.
 */
export async function paceStudioAccount(db: D1Database, address: string, now = Date.now()): Promise<LimitVerdict> {
  const { address: own, site } = STUDIO_ACCOUNT_RATE;
  const one = verdict(await consumeRateLimit(db, own.action, address, { limit: own.limit, windowMs: own.windowMs }, new Date(now)));
  if (!one.ok) return one;
  return verdict(await consumeRateLimit(db, site.action, "all", { limit: site.limit, windowMs: site.windowMs }, new Date(now)));
}

/** One more checkout of `userId`: 10 an hour; a D1 failure refuses. */
export async function paceCheckout(db: D1Database, userId: string, now = Date.now()): Promise<LimitVerdict> {
  const { action, limit, windowMs } = STUDIO_ACCOUNT_RATE.checkout;
  return verdict(await consumeRateLimit(db, action, userId, { limit, windowMs }, new Date(now)));
}

/** A new studio account signed in for a year, and the cookie that carries it. */
export async function createStudioAccount(
  db: D1Database,
  now = Date.now(),
): Promise<{ readonly account: StudioAccount; readonly cookie: string }> {
  const minted = await new IdentityStore(db, STUDIO_ORG).syntheticLogin(STUDIO_ACCOUNT_PREFIX, STUDIO_ACCOUNT_MS, now);
  return {
    account: { userId: minted.id, token: minted.token, tokenHash: await sha256Hex(minted.token), expiresAt: now + STUDIO_ACCOUNT_MS },
    cookie: accountCookie(minted.token, STUDIO_ACCOUNT_MS / 1000),
  };
}

/**
 * The session lives at least until `tariffEndsAt` + 30 days: when it would
 * end earlier, its end moves there and the cookie is sent again (the
 * Set-Cookie value is returned); otherwise null and nothing is written.
 */
export async function extendStudioSession(
  db: D1Database,
  account: StudioAccount,
  tariffEndsAt: number,
  now = Date.now(),
): Promise<string | null> {
  const until = tariffEndsAt + SESSION_AFTER_TARIFF_MS;
  if (account.expiresAt >= until) return null;
  await db
    .prepare("UPDATE gpt_auth_sessions SET expires_at=? WHERE org_id=? AND token_hash=? AND expires_at<?")
    .bind(until, STUDIO_ORG, account.tokenHash, until)
    .run();
  return accountCookie(account.token, (until - now) / 1000);
}
