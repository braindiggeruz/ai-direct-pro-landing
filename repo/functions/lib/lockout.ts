// Brute-force lockout for /api/auth/login.
//
// Storage strategy:
//   1) If env.LOGIN_ATTEMPTS (Cloudflare KV namespace) is bound → durable lockout.
//   2) Otherwise fall back to in-isolate Map (best-effort, resets on cold start).
//
// Rules: 5 failures within 15 min from same IP+email → lock for 15 min.
import type { Env } from '../_types';

const MAX_FAILS = 5;
const WINDOW_S = 15 * 60; // 15 min

type Entry = { count: number; first: number; until: number };

const mem: Map<string, Entry> = new Map();

function now(): number { return Math.floor(Date.now() / 1000); }

function getKv(env: Env): KVNamespace | null {
  return (env as unknown as { LOGIN_ATTEMPTS?: KVNamespace }).LOGIN_ATTEMPTS || null;
}

async function readEntry(env: Env, key: string): Promise<Entry | null> {
  const kv = getKv(env);
  if (kv) {
    const raw = await kv.get(key);
    return raw ? JSON.parse(raw) as Entry : null;
  }
  return mem.get(key) || null;
}

async function writeEntry(env: Env, key: string, entry: Entry): Promise<void> {
  const kv = getKv(env);
  if (kv) {
    await kv.put(key, JSON.stringify(entry), { expirationTtl: WINDOW_S });
    return;
  }
  mem.set(key, entry);
}

async function deleteEntry(env: Env, key: string): Promise<void> {
  const kv = getKv(env);
  if (kv) { await kv.delete(key); return; }
  mem.delete(key);
}

export function attemptKey(ip: string, email: string): string {
  return `login:${ip.toLowerCase()}:${email.toLowerCase()}`;
}

export async function isLocked(env: Env, key: string): Promise<number> {
  const e = await readEntry(env, key);
  if (!e) return 0;
  if (e.until && e.until > now()) return e.until - now();
  return 0;
}

export async function registerFailure(env: Env, key: string): Promise<{ count: number; lockedFor: number }> {
  const t = now();
  const existing = await readEntry(env, key);
  let entry: Entry;
  if (!existing || (t - existing.first) > WINDOW_S) {
    entry = { count: 1, first: t, until: 0 };
  } else {
    entry = { ...existing, count: existing.count + 1 };
    if (entry.count >= MAX_FAILS) entry.until = t + WINDOW_S;
  }
  await writeEntry(env, key, entry);
  return { count: entry.count, lockedFor: entry.until ? entry.until - t : 0 };
}

export async function clearFailures(env: Env, key: string): Promise<void> {
  await deleteEntry(env, key);
}
