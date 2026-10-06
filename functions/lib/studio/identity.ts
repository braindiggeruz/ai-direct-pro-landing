// The studio's signed browser identity, __Host-studio_bid (spec §5.1).
//
//   v1.<id>.<mintedHour>.<sig>
//   id          16 random bytes, base64url (22 characters)
//   mintedHour  whole hours since the epoch when it was issued
//   sig         the first 16 bytes of HMAC-SHA256(GPT_IDENTITY_SECRET,
//               "studio-bid-v1:" + id + "." + mintedHour), base64url
//
// The existing GPT_IDENTITY_SECRET signs it under its own domain prefix, so no
// new secret is needed and no chat token can pass for a studio one. Checking
// it needs no D1. Only POST /api/studio/identity issues it, after Turnstile.
//
// The id never reaches D1: the free-usage subject is
// "b:" + HMAC(GPT_IDENTITY_SECRET, "studio-subject-v1:" + id), 32 hex.
// An identity younger than a day is "young": only young identities count
// against the IP ceiling (spec §5.4), so a school's Wi-Fi or a mobile
// operator's NAT does not lock out people who have been here before.
//
// The cookie lives a year (Max-Age=31536000), as the privacy policy says.
// After that the browser drops it and the visitor passes Turnstile again; a
// value older than that is refused here as well.
import type { BillingEnv } from "../gpt-chat/billing-config";
import { cookieValue } from "../gpt-chat/identity-store";

/** GPT_IDENTITY_SECRET is declared with the chat's billing env (billing-config.ts). */
export type IdentityEnv = Pick<BillingEnv, "GPT_IDENTITY_SECRET">;

export const STUDIO_BID_COOKIE = "__Host-studio_bid";
/** One year, in seconds. */
export const STUDIO_BID_MAX_AGE = 31_536_000;
/** An identity minted less than this long ago is young. */
export const IDENTITY_YOUNG_MS = 86_400_000;

const HOUR_MS = 3_600_000;
/** A shorter GPT_IDENTITY_SECRET counts as unset, as everywhere else in the code. */
const MIN_SECRET_LENGTH = 32;
const ID_BYTES = 16;
const SIG_BYTES = 16;
const BID = /^v1\.([A-Za-z0-9_-]{22})\.(\d{1,9})\.([A-Za-z0-9_-]{22})$/;

export interface StudioIdentity {
  /** "b:" + 32 hex: the free-usage subject. It cannot be turned back into the cookie. */
  readonly subject: string;
  /** Whole hours since the epoch when the identity was issued. */
  readonly mintedHour: number;
  /** Minted less than a day ago: the IP ceiling applies to it. */
  readonly young: boolean;
}

function secretOf(env: IdentityEnv): string | null {
  const value = env.GPT_IDENTITY_SECRET || "";
  return value.length >= MIN_SECRET_LENGTH ? value : null;
}

/** GPT_IDENTITY_SECRET is long enough to sign identities. */
export function identityConfigured(env: IdentityEnv): boolean {
  return secretOf(env) !== null;
}

// One secret per deployment: keep its imported key for the isolate.
let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  if (cachedKey?.secret !== secret) {
    cachedKey = {
      secret,
      key: crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    };
  }
  return new Uint8Array(await crypto.subtle.sign("HMAC", await cachedKey.key, new TextEncoder().encode(message)));
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Equal strings, compared in time that does not depend on where they differ. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function signature(secret: string, id: string, mintedHour: number): Promise<string> {
  return base64url((await hmac(secret, `studio-bid-v1:${id}.${mintedHour}`)).slice(0, SIG_BYTES));
}

async function subjectOf(secret: string, id: string): Promise<string> {
  return `b:${hex(await hmac(secret, `studio-subject-v1:${id}`)).slice(0, 32)}`;
}

/** Young until a day after the start of the hour it was minted in. */
export function isYoung(mintedHour: number, now: number): boolean {
  return now - mintedHour * HOUR_MS < IDENTITY_YOUNG_MS;
}

/** The Set-Cookie value that carries an identity. __Host-: Secure, Path=/, no Domain. */
export function identityCookie(value: string): string {
  return `${STUDIO_BID_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${STUDIO_BID_MAX_AGE}`;
}

export interface MintedIdentity {
  /** The cookie value, v1.<id>.<mintedHour>.<sig>. */
  readonly value: string;
  /** The whole Set-Cookie header value. */
  readonly cookie: string;
  readonly identity: StudioIdentity;
}

/** A fresh identity, or null without a usable GPT_IDENTITY_SECRET. Call it only after Turnstile. */
export async function mintIdentity(env: IdentityEnv, now = Date.now()): Promise<MintedIdentity | null> {
  const secret = secretOf(env);
  if (!secret) return null;
  const id = base64url(crypto.getRandomValues(new Uint8Array(ID_BYTES)));
  const mintedHour = Math.floor(now / HOUR_MS);
  const value = `v1.${id}.${mintedHour}.${await signature(secret, id, mintedHour)}`;
  return {
    value,
    cookie: identityCookie(value),
    identity: Object.freeze({ subject: await subjectOf(secret, id), mintedHour, young: isYoung(mintedHour, now) }),
  };
}

/**
 * The identity a cookie value proves, or null: a malformed, truncated or
 * forged value, one signed with another secret, one from the future or older
 * than the cookie's year, or no usable secret at all.
 */
export async function verifyIdentityValue(value: string, env: IdentityEnv, now = Date.now()): Promise<StudioIdentity | null> {
  const secret = secretOf(env);
  const match = BID.exec(value);
  if (!secret || !match) return null;
  const [, id, hourText, sig] = match;
  const mintedHour = Number(hourText);
  const nowHour = Math.floor(now / HOUR_MS);
  // One hour of slack for clocks; nothing older than the cookie may live.
  if (mintedHour > nowHour + 1 || (nowHour - mintedHour) * HOUR_MS > STUDIO_BID_MAX_AGE * 1000 + HOUR_MS) return null;
  if (!sameText(await signature(secret, id, mintedHour), sig)) return null;
  return Object.freeze({ subject: await subjectOf(secret, id), mintedHour, young: isYoung(mintedHour, now) });
}

/** The identity of the request's __Host-studio_bid cookie, or null. No D1. */
export function readIdentity(request: Request, env: IdentityEnv, now = Date.now()): Promise<StudioIdentity | null> {
  return verifyIdentityValue(cookieValue(request, STUDIO_BID_COOKIE), env, now);
}
