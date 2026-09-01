import type { SourceCandidate } from './types';

/**
 * Per-source yield telemetry (roadmap Phase 0).
 *
 * Without this we are blind: neither the operator nor the code can tell which
 * source actually produces contacts, so every "improve the parser" discussion
 * is guesswork. The counters are deliberately tiny — one row per source with
 * the four numbers that decide whether a source is worth its subrequests.
 *
 * `requested` is the denominator: rows a source returned before any crawl was
 * spent. `withPhone` / `withWebsite` / `withTelegram` count rows where that
 * field was already present as a *field*, not guessed out of page HTML. A
 * source with high `requested` and near-zero `withPhone` is a source that costs
 * subrequests and returns nothing — that is the signal we act on.
 */

export interface SourceYieldCounters {
  requested: number;
  withPhone: number;
  withWebsite: number;
  withTelegram: number;
}

export type SourceYieldKey = keyof SourceYieldCounters;

export type SourceYieldMap = Record<string, SourceYieldCounters>;

export function emptySourceYield(): SourceYieldCounters {
  return { requested: 0, withPhone: 0, withWebsite: 0, withTelegram: 0 };
}

export type YieldCandidate = Pick<SourceCandidate,
  'phone' | 'website' | 'telegramUrl' | 'telegramContact'>;

/** What a single discovered row contributed. `requested` is always 1. */
export function candidateYield(candidate: YieldCandidate): SourceYieldCounters {
  const telegram = Boolean(candidate.telegramUrl || candidate.telegramContact);
  return {
    requested: 1,
    withPhone: candidate.phone ? 1 : 0,
    withWebsite: candidate.website ? 1 : 0,
    withTelegram: telegram ? 1 : 0,
  };
}

export function accumulateSourceYield(
  target: SourceYieldCounters,
  patch: SourceYieldCounters,
): SourceYieldCounters {
  target.requested += patch.requested;
  target.withPhone += patch.withPhone;
  target.withWebsite += patch.withWebsite;
  target.withTelegram += patch.withTelegram;
  return target;
}

/** Merge many maps (one per source run) into a single view. */
export function mergeSourceYield(...maps: readonly SourceYieldMap[]): SourceYieldMap {
  const merged: SourceYieldMap = {};
  for (const map of maps) {
    for (const [sourceId, counters] of Object.entries(map)) {
      merged[sourceId] = accumulateSourceYield(merged[sourceId] ?? emptySourceYield(), counters);
    }
  }
  return merged;
}

/** 0..1, or null when nothing was requested. Never divides by zero. */
export function sourceYieldRate(
  counters: SourceYieldCounters,
  key: Exclude<SourceYieldKey, 'requested'>,
): number | null {
  if (counters.requested <= 0) return null;
  return counters[key] / counters.requested;
}

export interface SourceYieldContext {
  searchId?: string;
  orgId?: string;
  city?: string;
  niche?: string;
}

/**
 * Collector for one discovery pass. Call `record()` per row, then `log()`
 * once. Logging is best-effort: telemetry must never fail a search.
 */
export class SourceYieldRecorder {
  private readonly counters = new Map<string, SourceYieldCounters>();

  constructor(private readonly context: SourceYieldContext = {}) {}

  record(sourceId: string, patch: SourceYieldCounters): void {
    accumulateSourceYield(this.entry(sourceId), patch);
  }

  recordCandidate(sourceId: string, candidate: YieldCandidate): void {
    this.record(sourceId, candidateYield(candidate));
  }

  /** Count rows that a source produced but that were dropped before use. */
  recordRequested(sourceId: string, requested: number): void {
    if (!Number.isFinite(requested) || requested <= 0) return;
    this.entry(sourceId).requested += Math.floor(requested);
  }

  snapshot(): SourceYieldMap {
    return Object.fromEntries(
      [...this.counters.entries()].map(([sourceId, value]) => [sourceId, { ...value }]),
    );
  }

  /** Structured single-line log: grep-able, and cheap on the Workers free tier. */
  log(extra: Record<string, unknown> = {}): SourceYieldMap {
    const snapshot = this.snapshot();
    const rates = Object.fromEntries(
      Object.entries(snapshot).map(([sourceId, counters]) => [
        sourceId,
        {
          requested: counters.requested,
          phoneRate: sourceYieldRate(counters, 'withPhone'),
          websiteRate: sourceYieldRate(counters, 'withWebsite'),
          telegramRate: sourceYieldRate(counters, 'withTelegram'),
        },
      ]),
    );
    console.log('lead_radar.source_yield', JSON.stringify({ ...this.context, ...extra, rates }));
    return snapshot;
  }

  private entry(sourceId: string): SourceYieldCounters {
    const existing = this.counters.get(sourceId);
    if (existing) return existing;
    const created = emptySourceYield();
    this.counters.set(sourceId, created);
    return created;
  }
}

export const SOURCE_YIELD_LOG_EVENT = 'lead_radar.source_yield';
