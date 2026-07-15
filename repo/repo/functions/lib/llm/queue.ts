// Global heavy-task queue.
//
// Eliminates the burst that triggers Gemini 429: when a batch (10 topics ×
// 2 locales × 2 optimiser passes = up to 40 concurrent calls) lands in
// less than a second, even a generous free tier rejects.
//
// Implementation choices:
//   * Per-isolate Promise chain — concurrency 1, FIFO.
//   * One CF Pages Function isolate per request, but the Topic Plan batch
//     fires N items inline in the SAME request, so all items share the
//     same isolate. That's exactly what we want — the queue is per-batch.
//   * For cross-request serialisation we rely on the existing `overlap`
//     guard in seo_autopilot_jobs (active job → 409). The queue solves
//     the WITHIN-request burst that the overlap guard cannot catch.
//
// Light tasks (judge, json_repair) bypass the queue and run on their own
// short timeout — they don't contribute to Gemini 429.

import type { LlmFeature } from './types';

const HEAVY_FEATURES: ReadonlySet<LlmFeature> = new Set([
  'ru_article', 'uz_article', 'translate', 'optimizer', 'retarget',
]);

export function isHeavyFeature(feature: LlmFeature): boolean {
  return HEAVY_FEATURES.has(feature);
}

// Per-isolate queue. Each Promise is awaited before the next starts.
let chain: Promise<unknown> = Promise.resolve();
let depth = 0;
let peakDepth = 0;

/**
 * Enqueue a heavy task. Concurrency = 1 across the current isolate.
 * Light tasks should NOT call this — call them directly.
 */
export async function enqueueHeavy<T>(task: () => Promise<T>): Promise<T> {
  depth++;
  if (depth > peakDepth) peakDepth = depth;
  const ticket = chain.then(() => task(), () => task());
  // Replace the chain with a continuation that ignores the result so that
  // a single rejected task does NOT poison the rest of the chain.
  chain = ticket.then(() => undefined, () => undefined);
  try {
    return await ticket;
  } finally {
    depth--;
  }
}

export function queueStats(): { depth: number; peak_depth: number } {
  return { depth, peak_depth: peakDepth };
}

export function resetQueueStats(): void { peakDepth = depth; }
