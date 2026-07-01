// Shared in-flight lock utility.
//
// Prevents duplicate concurrent long-running requests (e.g. LLM calls)
// for the same resource. Previously duplicated in optimize.ts,
// optimize-both.ts, translate-locale.ts, and retarget.ts.

export function createInflightLock(ttlMs = 120_000) {
  const map = new Map<string, number>();

  return {
    take(key: string): boolean {
      const now = Date.now();
      const prev = map.get(key);
      if (prev && now - prev < ttlMs) return false;
      map.set(key, now);
      return true;
    },
    release(key: string): void {
      map.delete(key);
    },
  };
}
