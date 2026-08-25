const encoder = new TextEncoder();
const ACCOUNT_REF_PREFIX = 'lracct_';
const SNAPSHOT_MAGIC = encoder.encode('LRTGS1');
const IV_BYTES = 12;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

export interface WrappedAccountSeed {
  version: 1;
  keyVersion: string;
  iv: string;
  ciphertext: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/u.test(value)) return null;
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export function parseMasterKey(value: string | undefined): Uint8Array | null {
  if (!value) return null;
  const decoded = base64UrlToBytes(value.trim());
  return decoded?.byteLength === 32 ? decoded : null;
}

async function hkdf(
  master: Uint8Array,
  salt: string,
  info: string,
  usage: KeyUsage[],
  algorithm: 'AES-GCM' | 'HMAC',
): Promise<CryptoKey> {
  const source = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(master),
    'HKDF',
    false,
    ['deriveKey'],
  );
  if (algorithm === 'AES-GCM') {
    return crypto.subtle.deriveKey({
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(salt),
      info: encoder.encode(info),
    }, source, { name: 'AES-GCM', length: 256 }, false, usage);
  }
  return crypto.subtle.deriveKey({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: encoder.encode(salt),
    info: encoder.encode(info),
  }, source, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, usage);
}

export async function accountRefForOrg(master: Uint8Array, orgId: string): Promise<string> {
  const routingKey = await hkdf(
    master,
    'gptbot-lead-radar-routing-v1',
    'telegram-account-ref',
    ['sign'],
    'HMAC',
  );
  const digest = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    routingKey,
    encoder.encode(`org:${orgId}:slot:primary`),
  ));
  return `${ACCOUNT_REF_PREFIX}${bytesToBase64Url(digest)}`;
}

export async function sha256Hex(parts: readonly string[]): Promise<string> {
  const framed = parts.map((part) => `${encoder.encode(part).byteLength}:${part}`).join('|');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(framed)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createWrappedAccountSeed(input: {
  master: Uint8Array;
  accountRef: string;
  keyVersion: string;
}): Promise<{ seed: Uint8Array; wrapped: WrappedAccountSeed }> {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  return {
    seed,
    wrapped: await wrapAccountSeed({ ...input, seed }),
  };
}

export async function wrapAccountSeed(input: {
  master: Uint8Array;
  accountRef: string;
  keyVersion: string;
  seed: Uint8Array;
}): Promise<WrappedAccountSeed> {
  if (input.seed.byteLength !== 32) throw new Error('snapshot_seed_invalid');
  const wrappingKey = await hkdf(
    input.master,
    input.accountRef,
    `telegram-session-wrap:${input.keyVersion}`,
    ['encrypt'],
    'AES-GCM',
  );
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: encoder.encode(`seed:${input.accountRef}:${input.keyVersion}`),
    tagLength: 128,
  }, wrappingKey, toArrayBuffer(input.seed)));
  return {
    version: 1,
    keyVersion: input.keyVersion,
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(ciphertext),
  };
}

export async function unwrapAccountSeed(input: {
  master: Uint8Array;
  accountRef: string;
  wrapped: WrappedAccountSeed;
}): Promise<Uint8Array> {
  if (input.wrapped.version !== 1) throw new Error('snapshot_key_version_invalid');
  const iv = base64UrlToBytes(input.wrapped.iv);
  const ciphertext = base64UrlToBytes(input.wrapped.ciphertext);
  if (iv?.byteLength !== IV_BYTES || !ciphertext || ciphertext.byteLength < 17) {
    throw new Error('snapshot_key_envelope_invalid');
  }
  const wrappingKey = await hkdf(
    input.master,
    input.accountRef,
    `telegram-session-wrap:${input.wrapped.keyVersion}`,
    ['decrypt'],
    'AES-GCM',
  );
  try {
    return new Uint8Array(await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: encoder.encode(
        `seed:${input.accountRef}:${input.wrapped.keyVersion}`,
      ),
      tagLength: 128,
    }, wrappingKey, toArrayBuffer(ciphertext)));
  } catch {
    throw new Error('snapshot_key_unwrap_failed');
  }
}

async function accountSubkey(
  seed: Uint8Array,
  accountRef: string,
  purpose: string,
  usage: KeyUsage[],
): Promise<CryptoKey> {
  return hkdf(seed, accountRef, purpose, usage, 'AES-GCM');
}

export async function tdlibDatabaseKey(seed: Uint8Array, accountRef: string): Promise<string> {
  const source = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(seed),
    'HKDF',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: encoder.encode(accountRef),
    info: encoder.encode('tdlib-local-database-v1'),
  }, source, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

export async function encryptSnapshot(input: {
  seed: Uint8Array;
  accountRef: string;
  generation: string;
  keyVersion: string;
  plaintext: ArrayBuffer;
}): Promise<ArrayBuffer> {
  const key = await accountSubkey(
    input.seed,
    input.accountRef,
    `telegram-session-snapshot:${input.keyVersion}`,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: encoder.encode(
      `snapshot:${input.accountRef}:${input.generation}:${input.keyVersion}`,
    ),
    tagLength: 128,
  }, key, input.plaintext));
  const output = new Uint8Array(SNAPSHOT_MAGIC.byteLength + IV_BYTES + ciphertext.byteLength);
  output.set(SNAPSHOT_MAGIC, 0);
  output.set(iv, SNAPSHOT_MAGIC.byteLength);
  output.set(ciphertext, SNAPSHOT_MAGIC.byteLength + IV_BYTES);
  return output.buffer;
}

export async function decryptSnapshot(input: {
  seed: Uint8Array;
  accountRef: string;
  generation: string;
  keyVersion: string;
  ciphertext: ArrayBuffer;
}): Promise<ArrayBuffer> {
  const encoded = new Uint8Array(input.ciphertext);
  const minimum = SNAPSHOT_MAGIC.byteLength + IV_BYTES + 17;
  if (encoded.byteLength < minimum
    || !SNAPSHOT_MAGIC.every((byte, index) => encoded[index] === byte)) {
    throw new Error('snapshot_ciphertext_invalid');
  }
  const iv = encoded.slice(SNAPSHOT_MAGIC.byteLength, SNAPSHOT_MAGIC.byteLength + IV_BYTES);
  const ciphertext = encoded.slice(SNAPSHOT_MAGIC.byteLength + IV_BYTES);
  const key = await accountSubkey(
    input.seed,
    input.accountRef,
    `telegram-session-snapshot:${input.keyVersion}`,
    ['decrypt'],
  );
  try {
    return await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv,
      additionalData: encoder.encode(
        `snapshot:${input.accountRef}:${input.generation}:${input.keyVersion}`,
      ),
      tagLength: 128,
    }, key, ciphertext);
  } catch {
    throw new Error('snapshot_decrypt_failed');
  }
}

export function randomOpaqueId(prefix: string, bytes = 18): string {
  return `${prefix}${bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)))}`;
}
