// Persistent storage for the SERP Intelligence layer.
//
// Two files in the GitHub content repo:
//   - content/seo/serp-cache.json  → { entries: SerpCacheEntry[] }
//       cached snapshots, capped at 200 newest entries, indexed by
//       cacheKey = `${locale}|${gl}|${hl}|${location||''}|${query}`
//   - content/seo/serp-runs.json   → { runs: SerpRunLog[] }
//       audit ledger of every SERP check, capped at 200 newest entries.
//
// The ledger never holds the raw upstream payload — only summary fields.
// The cache holds the SerpSnapshot we persist (which is already trimmed
// to ~2 KB per entry).

import type { Env } from '../../_types';
import { getFile, putFile } from '../github';
import type { Locale } from '../../../src/shared/types';
import type {
  SerpRunLog,
  SerpSnapshot,
  SerperRunStatus,
} from '../../../src/shared/serp';
import { SERPER_LIMITS } from '../../../src/shared/serp';

const CACHE_PATH = 'content/seo/serp-cache.json';
const RUNS_PATH = 'content/seo/serp-runs.json';
const MAX_ENTRIES = 200;

export interface SerpCacheEntry {
  key: string;
  snapshot: SerpSnapshot;
  expiresAt: string;
}

export interface SerpCacheFile { version: 1; entries: SerpCacheEntry[] }
export interface SerpRunsFile  { version: 1; runs: SerpRunLog[] }

export function cacheKey(parts: { locale: Locale; gl: string; hl: string; location?: string; query: string }): string {
  return `${parts.locale}|${parts.gl}|${parts.hl}|${parts.location || ''}|${parts.query}`;
}

async function readJson<T>(env: Env, path: string, empty: T): Promise<T> {
  try {
    const file = await getFile(env, path);
    if (!file) return empty;
    const parsed = JSON.parse(file.content) as T;
    return parsed || empty;
  } catch { return empty; }
}

export async function readCache(env: Env): Promise<SerpCacheFile> {
  const f = await readJson<SerpCacheFile>(env, CACHE_PATH, { version: 1, entries: [] });
  if (!Array.isArray(f.entries)) return { version: 1, entries: [] };
  return f;
}

export async function readRuns(env: Env): Promise<SerpRunsFile> {
  const f = await readJson<SerpRunsFile>(env, RUNS_PATH, { version: 1, runs: [] });
  if (!Array.isArray(f.runs)) return { version: 1, runs: [] };
  return f;
}

/** Returns the cached snapshot if it exists AND is still within TTL. */
export async function getCached(env: Env, key: string, now = Date.now()): Promise<SerpSnapshot | null> {
  const cache = await readCache(env);
  const hit = cache.entries.find((e) => e.key === key);
  if (!hit) return null;
  if (new Date(hit.expiresAt).getTime() < now) return null;
  return hit.snapshot;
}

export async function putCached(env: Env, key: string, snapshot: SerpSnapshot): Promise<void> {
  const cache = await readCache(env);
  const expiresAt = new Date(Date.now() + SERPER_LIMITS.cacheTtlMs).toISOString();
  const next: SerpCacheEntry = { key, snapshot, expiresAt };
  const without = cache.entries.filter((e) => e.key !== key);
  const entries = [next, ...without].slice(0, MAX_ENTRIES);
  await putFile(env, CACHE_PATH, JSON.stringify({ version: 1, entries }, null, 2) + '\n',
    `chore(serp): cache ${snapshot.locale} "${snapshot.query.slice(0, 64)}"`);
}

export async function appendRun(env: Env, run: SerpRunLog): Promise<void> {
  const ledger = await readRuns(env);
  const runs = [run, ...ledger.runs].slice(0, MAX_ENTRIES);
  await putFile(env, RUNS_PATH, JSON.stringify({ version: 1, runs }, null, 2) + '\n',
    `chore(serp): ${run.status} ${run.cached ? 'cached' : 'fresh'} "${run.query.slice(0, 64)}"`);
}

export function makeRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Build a SerpRunLog from inputs. */
export function buildRunLog(args: {
  query: string; locale: Locale; gl: string; hl: string; location?: string;
  forUrl: string | null; status: SerperRunStatus; cached: boolean;
  snapshot: SerpSnapshot | null; rankFound: boolean; rankPosition?: number;
  error?: string;
}): SerpRunLog {
  return {
    runId: makeRunId(),
    query: args.query,
    locale: args.locale,
    gl: args.gl,
    hl: args.hl,
    location: args.location,
    forUrl: args.forUrl,
    status: args.status,
    cached: args.cached,
    resultPositions: args.snapshot ? args.snapshot.organic.length : 0,
    rankFound: args.rankFound,
    rankPosition: args.rankPosition,
    createdAt: new Date().toISOString(),
    credits: args.cached ? 0 : 1,
    error: args.error,
  };
}

/** Count of runs whose createdAt is within today (UTC). */
export function countQueriesToday(runs: SerpRunLog[], now = new Date()): number {
  const day = now.toISOString().slice(0, 10);
  return runs.filter((r) => r.createdAt.startsWith(day) && !r.cached).length;
}
