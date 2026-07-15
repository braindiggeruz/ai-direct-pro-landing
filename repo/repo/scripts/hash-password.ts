#!/usr/bin/env tsx
// One-time CLI to generate ADMIN_PASSWORD_HASH for Cloudflare Pages env vars.
//
// Usage:
//   yarn hash-password '<my-strong-password>'
//
// Output:
//   pbkdf2_sha256$100000$<salt_b64>$<hash_b64>
//
// Copy that value into:
//   Cloudflare Pages → Settings → Environment variables → ADMIN_PASSWORD_HASH
// and DELETE ADMIN_PASSWORD.
import { webcrypto } from 'node:crypto';

if (typeof globalThis.crypto === 'undefined') {
  // @ts-expect-error attach Web Crypto in Node
  globalThis.crypto = webcrypto;
}

// Cloudflare Workers runtime caps PBKDF2 at 100000 iterations.
// Keep this aligned with functions/lib/password.ts DEFAULT_ITER, otherwise
// /api/auth/login throws "Pbkdf2 failed: iteration counts above 100000 are not supported".
const ITER = 100000;
const KEY_LEN = 32;

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

async function pbkdf2(password: string, salt: Uint8Array, iter: number, len: number): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter },
    key,
    len * 8,
  );
  return new Uint8Array(bits);
}

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('Usage: yarn hash-password "<password>"');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('Password must be at least 10 characters.');
    process.exit(1);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2(password, salt, ITER, KEY_LEN);
  const hash = `pbkdf2_sha256$${ITER}$${bytesToBase64(salt)}$${bytesToBase64(derived)}`;
  console.log('\n# Paste this into Cloudflare Pages → Environment variables\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log('\n# Remember to DELETE ADMIN_PASSWORD from production env after setting the hash.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
