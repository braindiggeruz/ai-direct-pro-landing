// Pure helpers for the SERP → AI Autopilot handoff via sessionStorage.
//
// Lives in its own file so the React-refresh fast-refresh rule allows
// SerpIntelligenceTab.tsx to export the component only.

import type { SerpDigest } from '../../../shared/serp';

export const SERP_DIGEST_SESSION_KEY = 'serpDigest:lastByUrl';

export function readDigestFromSession(url: string): SerpDigest | null {
  try {
    const raw = sessionStorage.getItem(SERP_DIGEST_SESSION_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, SerpDigest>;
    return map[url] || null;
  } catch { return null; }
}

export function writeDigestToSession(url: string, digest: SerpDigest): void {
  try {
    const raw = sessionStorage.getItem(SERP_DIGEST_SESSION_KEY);
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, SerpDigest>;
    map[url] = digest;
    sessionStorage.setItem(SERP_DIGEST_SESSION_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}
