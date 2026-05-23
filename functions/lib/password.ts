// PBKDF2-SHA256 password hashing — works in Cloudflare Workers (Web Crypto API)
// AND in Python (hashlib.pbkdf2_hmac) so admin can be verified in both runtimes.
//
// Hash format (PHC-style):
//   pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>
//
// Default: 210000 iterations, 16-byte salt, 32-byte derived key.

const ALG = 'pbkdf2_sha256';
const DEFAULT_ITER = 210000;
const KEY_LEN = 32;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number, keyLen: number): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    keyLen * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations: number = DEFAULT_ITER): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2(password, salt, iterations, KEY_LEN);
  return `${ALG}$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(derived)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== ALG) return false;
  const iter = parseInt(parts[1], 10);
  if (!Number.isFinite(iter) || iter < 1000) return false;
  const salt = base64ToBytes(parts[2]);
  const expected = base64ToBytes(parts[3]);
  const derived = await pbkdf2(password, salt, iter, expected.length);
  if (derived.length !== expected.length) return false;
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ expected[i];
  return diff === 0;
}
