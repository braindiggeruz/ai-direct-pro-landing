// Dark test mode (decision L7). A provider in test (GPT_BILLING_MODE_<P> =
// "test") is offered and payable only in a rehearsal session: a browser that
// holds the cookie __Host-gpt_rehearsal, which only the Bearer endpoint
// /api/internal/gpt-rehearsal-session issues. A rehearsal session is a test
// context: it is offered the test providers, sees the test orders and draws
// the chat from test packs. Every other visitor is in the live context and
// never sees a test provider, a test order or a test pack.
//
// The cookie is v1.<expiresAt>.<nonce>.<HMAC-SHA256(GPT_IDENTITY_SECRET,
// "gpt_rehearsal:v1:<expiresAt>:<nonce>")>, valid for REHEARSAL_TTL_MS. It
// names nobody and is stored nowhere; it stops working when it expires, when
// the secret changes, or when no provider is in test any more.
//
// A rehearsal may sign in as a synthetic account (acct_rh_…, no Telegram
// identity behind it). Such an account never gets a live order
// (BillingStore.createOrder).
import {
  BILLING_ORG,
  loginMethods,
  offeredProviders,
  providersInMode,
  type BillingEnv,
  type BillingMode,
  type LocalProvider,
  type LoginMethod,
} from "./billing-config";
import { ensureBillingSchema } from "./billing-schema";
import { authCookie, cookieValue, IdentityStore } from "./identity-store";

export const REHEARSAL_COOKIE = "__Host-gpt_rehearsal";
export const REHEARSAL_TTL_MS = 2 * 3600_000;
/** Account ids of synthetic rehearsal accounts. */
export const REHEARSAL_ACCOUNT_PREFIX = "acct_rh_";
const MIN_SECRET_LENGTH = 32;
const TOKEN = /^v1\.(\d{13})\.([0-9a-f]{32})\.([0-9a-f]{64})$/;

export function isRehearsalAccount(user: string): boolean {
  return user.startsWith(REHEARSAL_ACCOUNT_PREFIX);
}

function secret(env: BillingEnv): string | null {
  const value = env.GPT_IDENTITY_SECRET || "";
  return value.length >= MIN_SECRET_LENGTH ? value : null;
}

function hmacKey(value: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(value),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function signed(expiresAt: number, nonce: string) {
  return new TextEncoder().encode(`gpt_rehearsal:v1:${expiresAt}:${nonce}`);
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A fresh rehearsal token, or null without a usable GPT_IDENTITY_SECRET. */
export async function mintRehearsal(
  env: BillingEnv,
  now = Date.now(),
): Promise<{ token: string; expiresAt: number } | null> {
  const value = secret(env);
  if (!value) return null;
  const expiresAt = now + REHEARSAL_TTL_MS;
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(value), signed(expiresAt, nonce));
  return { token: `v1.${expiresAt}.${nonce}.${hex(signature)}`, expiresAt };
}

/** The Set-Cookie value that carries a rehearsal token. */
export function rehearsalCookie(token: string): string {
  return authCookie(REHEARSAL_COOKIE, token, REHEARSAL_TTL_MS / 1000);
}

export type RehearsalOpening =
  | {
      ok: true;
      expiresAt: number;
      /** What the session is offered: the ready test providers. */
      providers: LocalProvider[];
      /** The synthetic account it is signed in as, or null. */
      account: string | null;
      /** Set-Cookie values: the rehearsal cookie, then the account's. */
      cookies: string[];
    }
  | { ok: false; code: "no_test_provider" | "identity_secret_missing" | "unavailable" };

/**
 * Open a rehearsal session: the rehearsal cookie and, with `account`, a fresh
 * synthetic account acct_rh_… signed in for the same two hours, without
 * Telegram. Only while some provider is in test. The Bearer endpoint
 * internal/gpt-rehearsal-session and the admin (api/admin/ai-chat) open it
 * the same way; the cookie values travel only in Set-Cookie.
 */
export async function openRehearsal(
  env: BillingEnv,
  options: { account: boolean },
  now = Date.now(),
): Promise<RehearsalOpening> {
  if (!providersInMode(env, "test").length) return { ok: false, code: "no_test_provider" };
  const rehearsal = await mintRehearsal(env, now);
  if (!rehearsal) return { ok: false, code: "identity_secret_missing" };
  let account: { id: string; token: string } | null = null;
  if (options.account) {
    if (!env.GPTBOT_DRAFTS_DB) return { ok: false, code: "unavailable" };
    try {
      await ensureBillingSchema(env.GPTBOT_DRAFTS_DB);
      account = await new IdentityStore(env.GPTBOT_DRAFTS_DB, BILLING_ORG).syntheticLogin(
        REHEARSAL_ACCOUNT_PREFIX,
        REHEARSAL_TTL_MS,
        now,
      );
    } catch {
      return { ok: false, code: "unavailable" };
    }
  }
  return {
    ok: true,
    expiresAt: rehearsal.expiresAt,
    providers: offeredProviders(env, "test"),
    account: account?.id ?? null,
    cookies: [
      rehearsalCookie(rehearsal.token),
      ...(account
        ? [authCookie("__Host-gpt_account", account.token, REHEARSAL_TTL_MS / 1000)]
        : []),
    ],
  };
}

/**
 * The request belongs to a rehearsal session: a valid, unexpired cookie
 * while some provider is in test. Never touches D1.
 */
export async function rehearsalActive(
  request: Request,
  env: BillingEnv,
  now = Date.now(),
): Promise<boolean> {
  const match = TOKEN.exec(cookieValue(request, REHEARSAL_COOKIE));
  const value = secret(env);
  if (!match || !value || !providersInMode(env, "test").length) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt <= now || expiresAt > now + REHEARSAL_TTL_MS) return false;
  const signature = Uint8Array.from(match[3].match(/../g)!, (pair) => parseInt(pair, 16));
  // WebCrypto compares the MAC in constant time.
  return crypto.subtle.verify("HMAC", await hmacKey(value), signature, signed(expiresAt, match[2]));
}

/** The billing context of a request: "test" in a rehearsal session, else "live". */
export async function viewerMode(
  request: Request,
  env: BillingEnv,
  now = Date.now(),
): Promise<BillingMode> {
  return (await rehearsalActive(request, env, now)) ? "test" : "live";
}

/**
 * The sign-in methods this visitor is offered: none while no provider is
 * offered to them. An account exists to pay, so with billing off (or in test
 * outside a rehearsal) sign-in is unreachable and its start routes are 404.
 * Never touches D1.
 */
export async function offeredLoginMethods(
  request: Request,
  env: BillingEnv,
  now = Date.now(),
): Promise<LoginMethod[]> {
  return offeredProviders(env, await viewerMode(request, env, now)).length
    ? loginMethods(env)
    : [];
}
