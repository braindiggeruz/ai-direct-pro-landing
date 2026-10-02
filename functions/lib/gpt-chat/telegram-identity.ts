// The web account's key for a Telegram user (plan decision L11): the same
// person signing in through the bot @gptbotuz_bot (bot-login-store.ts) or
// through Telegram's OIDC (functions/api/gpt/auth/callback.ts) lands in one
// gpt_accounts row. Only this keyed hash is stored, never the Telegram id:
//
//   identity_hash = HMAC-SHA256(GPT_IDENTITY_SECRET, "tg:" + <Telegram user id>)
//
// Still personal data (whoever holds the secret can test an id), not a claim
// of legal anonymisation. A secret change re-keys every account, so the
// secret is set once and never rotated while accounts exist.

/** A Telegram user id as Telegram sends it: a positive integer below 2^53. */
export function telegramUserId(value: unknown): string | null {
  const text =
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? String(value)
      : typeof value === "string"
        ? value
        : "";
  return /^[1-9]\d{0,15}$/.test(text) && Number.isSafeInteger(Number(text))
    ? text
    : null;
}

/** The identity hash of a Telegram user id (64 hex), or null for anything else. */
export async function telegramIdentityHash(
  secret: string,
  userId: unknown,
): Promise<string | null> {
  const id = telegramUserId(userId);
  if (!id || !secret) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`tg:${id}`));
  return Array.from(new Uint8Array(mac), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
