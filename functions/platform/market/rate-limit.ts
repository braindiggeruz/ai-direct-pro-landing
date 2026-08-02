import { MarketHttpError } from './http';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 1_024;

async function digest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  ));
  return [...bytes.slice(0, 12)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value as string | undefined;
    if (!oldest) break;
    buckets.delete(oldest);
  }
}

/** Best-effort isolate-local cap; domain idempotency remains the write guard. */
export async function enforceMarketRateLimit(
  scope: 'exchange' | 'read' | 'command' | 'sensitive',
  rawKey: string,
): Promise<void> {
  const policy = scope === 'exchange'
    ? { limit: 12, windowMs: 5 * 60_000 }
    : scope === 'read'
      ? { limit: 120, windowMs: 60_000 }
      : scope === 'sensitive'
        ? { limit: 20, windowMs: 60_000 }
        : { limit: 30, windowMs: 60_000 };
  const now = Date.now();
  prune(now);
  const key = `${scope}:${await digest(rawKey)}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + policy.windowMs });
    return;
  }
  if (current.count >= policy.limit) {
    throw new MarketHttpError('rate_limited', 429);
  }
  current.count += 1;
}
