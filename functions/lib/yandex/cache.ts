// D1 cache for Yandex SERP snapshots.
//
// Yandex Cloud Search API has tight pricing — caching the result for 24
// hours per (query, locale, search_type, region) keeps cost low and
// makes the UI snappy. The cache is best-effort: any read/write error
// degrades gracefully to a fresh API call.
//
// Schema lives in migrations/0006_yandex.sql. The router defensively
// CREATE TABLE IF NOT EXISTS so a deploy without a migration run still
// works.

import type { Env } from '../../_types';
import type { YandexSerpSnapshot } from './types';

const TTL_MS = 24 * 60 * 60_000; // 24 h

async function ensureTable(db: D1Database): Promise<void> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS yandex_serp_cache (
       cache_key      TEXT PRIMARY KEY,
       query          TEXT NOT NULL,
       locale         TEXT NOT NULL,
       search_type    TEXT NOT NULL,
       region         INTEGER,
       snapshot_json  TEXT NOT NULL,
       cached_at_ms   INTEGER NOT NULL,
       expires_at_ms  INTEGER NOT NULL
     )`.replace(/\s+/g, ' '),
  ).catch((e) => console.warn('[yandex-cache] ensureTable CREATE TABLE failed:', (e as Error).message));
  await db.exec('CREATE INDEX IF NOT EXISTS idx_yandex_serp_expires ON yandex_serp_cache(expires_at_ms)').catch((e) => console.warn('[yandex-cache] ensureTable CREATE INDEX failed:', (e as Error).message));
}

export function makeCacheKey(input: { query: string; locale: 'ru' | 'uz'; search_type: string; region?: number | null }): string {
  const q = input.query.trim().toLowerCase();
  const r = typeof input.region === 'number' ? String(input.region) : 'auto';
  return `${input.search_type}|${input.locale}|${r}|${q}`;
}

export async function readCached(env: Env, cacheKey: string): Promise<YandexSerpSnapshot | null> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return null;
  await ensureTable(db);
  const row = await db
    .prepare('SELECT snapshot_json, expires_at_ms FROM yandex_serp_cache WHERE cache_key = ?')
    .bind(cacheKey)
    .first<{ snapshot_json: string; expires_at_ms: number }>();
  if (!row) return null;
  if (Number(row.expires_at_ms || 0) < Date.now()) return null;
  try {
    return JSON.parse(row.snapshot_json) as YandexSerpSnapshot;
  } catch (parseErr) {
    console.warn(`[yandex-cache] corrupt JSON in cache for key ${cacheKey}:`, (parseErr as Error).message);
    return null;
  }
}

export async function writeCached(env: Env, cacheKey: string, snapshot: YandexSerpSnapshot): Promise<void> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return;
  await ensureTable(db);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO yandex_serp_cache
         (cache_key, query, locale, search_type, region, snapshot_json, cached_at_ms, expires_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         snapshot_json = excluded.snapshot_json,
         cached_at_ms = excluded.cached_at_ms,
         expires_at_ms = excluded.expires_at_ms`,
    )
    .bind(
      cacheKey,
      snapshot.query,
      snapshot.locale,
      snapshot.search_type,
      snapshot.region ?? null,
      JSON.stringify(snapshot).slice(0, 96_000),
      now,
      now + TTL_MS,
    )
    .run()
    .catch((e) => console.warn(`[yandex-cache] writeCached failed for key ${cacheKey}:`, (e as Error).message));
}

export async function lastCallAt(env: Env): Promise<string | null> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return null;
  await ensureTable(db);
  const row = await db
    .prepare('SELECT cached_at_ms FROM yandex_serp_cache ORDER BY cached_at_ms DESC LIMIT 1')
    .first<{ cached_at_ms: number }>();
  if (!row) return null;
  return new Date(Number(row.cached_at_ms)).toISOString();
}

export async function cacheRowCount(env: Env): Promise<number> {
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return 0;
  await ensureTable(db);
  const row = await db.prepare('SELECT COUNT(*) AS c FROM yandex_serp_cache').first<{ c: number }>();
  return Number(row?.c || 0);
}
