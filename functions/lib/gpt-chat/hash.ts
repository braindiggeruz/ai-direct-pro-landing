// Privacy: we NEVER store raw IPs or Telegram ids, only their hashes. Two
// generations live side by side (plan decision L8):
//
//   legacy  sha256(ip), hex (64)                    everything written before
//           sha256("tg:" + id)[0:32]                GPT_HASH_SALT_SINCE
//   v2      "h2_" + HMAC-SHA256(salt, legacy)       from GPT_HASH_SALT_SINCE on
//           "h2_" + HMAC-SHA256(salt, legacy)[0:29] (32 chars, like legacy)
//
// v2 is a function of the legacy value, so salt-rekey-store.ts converts the
// rows written before SINCE without the address, and the prefix makes that
// conversion idempotent and countable. Before SINCE nothing changes, so the
// switch is one instant and a key is never half legacy, half v2.
//
// Session tokens (gpt_sessions.anon_token) are random 128-bit secrets, not
// addresses: hashToken() is plain sha256 whatever the salt, byte for byte
// what production has stored so far, so sessions and history survive the salt.

/** SHA-256 of a string as lowercase hex. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return hex(digest);
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Prefix of every salted (v2) hash; legacy hashes are bare hex. */
export const HASH_V2_PREFIX = 'h2_';
/** A shorter GPT_HASH_SALT counts as unset: it would not stop a brute force. */
export const MIN_SALT_BYTES = 32;

/** GPT_HASH_SALT and GPT_HASH_SALT_SINCE, validated once per config. */
export interface HashSalt {
  /** The salt (trimmed) when it has at least MIN_SALT_BYTES bytes, else ''. */
  hashSalt: string;
  /** GPT_HASH_SALT_SINCE in epoch ms, or null when unset or not a UTC ISO time. */
  hashSaltSince: number | null;
}

// '2026-10-03T00:00:00Z' or '2026-10-03T00:00:00.000Z': an explicit UTC
// instant. A local time or a bare date is a typo, and a typo keeps legacy.
const SINCE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function resolveHashSalt(env: {
  GPT_HASH_SALT?: string;
  GPT_HASH_SALT_SINCE?: string;
}): HashSalt {
  const salt = (env.GPT_HASH_SALT || '').trim();
  const since = (env.GPT_HASH_SALT_SINCE || '').trim();
  const at = SINCE_RE.test(since) ? Date.parse(since) : NaN;
  return {
    hashSalt: new TextEncoder().encode(salt).length >= MIN_SALT_BYTES ? salt : '',
    hashSaltSince: Number.isFinite(at) ? at : null,
  };
}

const warned = new Set<string>();
function warnOnce(event: string): void {
  if (warned.has(event)) return;
  warned.add(event);
  console.warn(JSON.stringify({ event }));
}

/**
 * The salt in force at `now`, or null while hashes stay legacy: no salt, a
 * salt without GPT_HASH_SALT_SINCE (logged once per isolate), or before SINCE.
 */
export function activeSalt(cfg: HashSalt, now: number): string | null {
  if (!cfg.hashSalt) return null;
  if (cfg.hashSaltSince === null) {
    warnOnce('gpt_hash_salt_since_missing');
    return null;
  }
  return now >= cfg.hashSaltSince ? cfg.hashSalt : null;
}

// One salt per deployment: keep its imported HMAC key for the isolate.
let hmacKey: { salt: string; key: Promise<CryptoKey> } | null = null;
async function hmacHex(salt: string, value: string): Promise<string> {
  if (hmacKey?.salt !== salt) {
    hmacKey = {
      salt,
      key: crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(salt),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      ),
    };
  }
  const signature = await crypto.subtle.sign('HMAC', await hmacKey.key, new TextEncoder().encode(value));
  return hex(signature);
}

/** v2 of a legacy IP hash (67 chars). */
export async function saltedIpHash(salt: string, legacy: string): Promise<string> {
  return `${HASH_V2_PREFIX}${await hmacHex(salt, legacy)}`;
}

/** v2 of a legacy 32-char Telegram pseudonym; still 32 chars. */
export async function saltedPseudo(salt: string, legacy: string): Promise<string> {
  return `${HASH_V2_PREFIX}${(await hmacHex(salt, legacy)).slice(0, 32 - HASH_V2_PREFIX.length)}`;
}

/** The stored key of a client IP: legacy before GPT_HASH_SALT_SINCE, v2 after. */
export async function hashIp(ip: string | undefined, cfg: HashSalt, now = Date.now()): Promise<string> {
  const legacy = await sha256Hex(ip || 'unknown');
  const salt = activeSalt(cfg, now);
  return salt ? saltedIpHash(salt, legacy) : legacy;
}

/** The stored key of a random session token: sha256, never salted (L8). */
export function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

/** Cloudflare-provided real client IP; falls back to X-Forwarded-For head. */
export function getClientIp(request: Request): string | undefined {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    undefined
  );
}
