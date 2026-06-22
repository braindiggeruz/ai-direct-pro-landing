// Optional SERP overlap probe for shortlisted conflict pairs.
//
// Reuses functions/lib/serper/client.ts. Skipped entirely when
// SERPER_API_KEY is not configured. Caller decides whether to invoke
// this — for the "10 topics" bulk planner we usually skip SERP to stay
// inside the wallclock budget; for an individual /analyze call from the
// AI Draft Detail we may opt in.

import type { Env } from '../../_types';
import { callSerper } from '../serper/client';
import type { Locale } from '../../../src/shared/types';

const SERPER_HL_BY_LOCALE: Record<Locale, string> = { ru: 'ru', uz: 'uz' };

export interface SerperShortlistOptions {
  locale: Locale;
  primaryKeyword: string;       // keyword for the candidate
  conflictKeywords: string[];   // shortlisted unique keywords
  maxQueries?: number;          // default 2 (candidate + worst conflict)
}

export interface SerperShortlistResult {
  used: boolean;
  queries_run: number;
  overlap_score: number;        // 0..1 max Jaccard over top-10 urls
  details: Array<{ a: string; b: string; overlap: number }>;
}

/** Returns 0 if SERPER_API_KEY is missing, otherwise runs ≤ maxQueries+1 calls. */
export async function probeSerpOverlap(env: Env, opts: SerperShortlistOptions): Promise<SerperShortlistResult> {
  if (!env.SERPER_API_KEY) return { used: false, queries_run: 0, overlap_score: 0, details: [] };
  const max = Math.max(1, Math.min(opts.maxQueries ?? 2, 4));
  const candidateKeyword = opts.primaryKeyword.trim();
  if (!candidateKeyword) return { used: false, queries_run: 0, overlap_score: 0, details: [] };
  const conflicts = (opts.conflictKeywords || []).filter((k) => k && k !== candidateKeyword).slice(0, max);
  if (conflicts.length === 0) return { used: false, queries_run: 0, overlap_score: 0, details: [] };
  let queriesRun = 0;
  let candidateUrls: string[] = [];
  try {
    const r = await callSerper(env, {
      q: candidateKeyword, locale: opts.locale, gl: 'uz', hl: SERPER_HL_BY_LOCALE[opts.locale],
      num: 10, location: 'Uzbekistan',
    });
    candidateUrls = (r.snapshot.organic || []).map((o) => o.domain).filter(Boolean);
    queriesRun += 1;
  } catch {
    return { used: true, queries_run: queriesRun, overlap_score: 0, details: [] };
  }

  const details: SerperShortlistResult['details'] = [];
  let maxOverlap = 0;
  for (const ck of conflicts) {
    try {
      const r = await callSerper(env, {
        q: ck, locale: opts.locale, gl: 'uz', hl: SERPER_HL_BY_LOCALE[opts.locale],
        num: 10, location: 'Uzbekistan',
      });
      queriesRun += 1;
      const conflictUrls = (r.snapshot.organic || []).map((o) => o.domain).filter(Boolean);
      const overlap = jaccardUrls(candidateUrls, conflictUrls);
      details.push({ a: candidateKeyword, b: ck, overlap });
      if (overlap > maxOverlap) maxOverlap = overlap;
    } catch {
      // skip silently — single SERP failure should not poison the analysis
    }
  }

  return { used: true, queries_run: queriesRun, overlap_score: round(maxOverlap), details };
}

function jaccardUrls(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const t of sa) if (sb.has(t)) intersection++;
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function round(n: number): number { return Math.round(n * 100) / 100; }
