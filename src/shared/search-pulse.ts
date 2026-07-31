import type { BoosterItem } from './booster';

export const SEARCH_PULSE_QUALITY_THRESHOLD = 80;
export const SEARCH_PULSE_FRESH_DAYS = 45;
export const SEARCH_PULSE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const SEARCH_PULSE_HARD_CAP = 200;

export interface SearchPulseSubmission {
  submittedAt: string;
}

export interface SearchPulseCandidate {
  url: string;
  relativeUrl: string;
  title: string;
  locale: BoosterItem['locale'];
  pageType: BoosterItem['pageType'];
  quality: number;
  priority: number;
  lastModifiedAt: string;
}

export interface SearchPulseSelection {
  scanned: number;
  ready: SearchPulseCandidate[];
  coolingDown: SearchPulseCandidate[];
  alreadyCurrent: number;
  qualityBlocked: number;
  unsafeBlocked: number;
  staleBlocked: number;
  deferredCount: number;
}

export type SearchPulseServiceStatus =
  | 'success'
  | 'partial'
  | 'not_configured'
  | 'not_run'
  | 'failed';

export interface SearchPulsePreview {
  generatedAt: string;
  qualityThreshold: number;
  freshDays: number;
  hardCap: number;
  gscConfigured: boolean;
  selection: SearchPulseSelection;
  manualGoogleQueue: string[];
}

export interface SearchPulseRunResult {
  ok: boolean;
  generatedAt: string;
  selection: SearchPulseSelection;
  indexNow: {
    status: SearchPulseServiceStatus;
    attempted: number;
    succeeded: number;
    skipped: number;
    failed: number;
    deferred: number;
    message: string;
  };
  google: {
    status: SearchPulseServiceStatus;
    sitemapUrl: string;
    message: string;
  };
  manualGoogleQueue: string[];
}

function modifiedMs(item: BoosterItem): number {
  if (!item.lastModifiedAt) return Number.NaN;
  return Date.parse(item.lastModifiedAt);
}

function toCandidate(item: BoosterItem): SearchPulseCandidate {
  return {
    url: `https://gptbot.uz${item.url}`,
    relativeUrl: item.url,
    title: item.title,
    locale: item.locale,
    pageType: item.pageType,
    quality: item.scores.quality,
    priority: item.scores.indexationPriority,
    lastModifiedAt: item.lastModifiedAt!,
  };
}

/**
 * Selects URLs for one safe discovery pulse.
 *
 * A URL is ready only when its current content version has never been
 * submitted successfully, or it changed after the last successful submit.
 * A changed URL submitted less than 24 hours ago waits for the next pulse.
 */
export function selectSearchPulseCandidates(
  items: BoosterItem[],
  latestSuccessful: Map<string, SearchPulseSubmission>,
  nowMs = Date.now(),
): SearchPulseSelection {
  const eligible: SearchPulseCandidate[] = [];
  const coolingDown: SearchPulseCandidate[] = [];
  let alreadyCurrent = 0;
  let qualityBlocked = 0;
  let unsafeBlocked = 0;
  let staleBlocked = 0;

  for (const item of items) {
    if (!item.flags.pushable) {
      unsafeBlocked++;
      continue;
    }
    if (item.scores.quality < SEARCH_PULSE_QUALITY_THRESHOLD) {
      qualityBlocked++;
      continue;
    }
    const modified = modifiedMs(item);
    if (
      item.daysSinceUpdate > SEARCH_PULSE_FRESH_DAYS
      || !Number.isFinite(modified)
      || modified > nowMs + 5 * 60 * 1000
    ) {
      staleBlocked++;
      continue;
    }

    const candidate = toCandidate(item);
    const previous = latestSuccessful.get(candidate.url);
    if (!previous) {
      eligible.push(candidate);
      continue;
    }
    const submitted = Date.parse(previous.submittedAt);
    if (!Number.isFinite(submitted)) {
      eligible.push(candidate);
      continue;
    }
    if (submitted >= modified) {
      alreadyCurrent++;
      continue;
    }
    if (nowMs - submitted < SEARCH_PULSE_COOLDOWN_MS) {
      coolingDown.push(candidate);
      continue;
    }
    eligible.push(candidate);
  }

  eligible.sort((a, b) =>
    b.priority - a.priority
    || Date.parse(b.lastModifiedAt) - Date.parse(a.lastModifiedAt)
    || a.url.localeCompare(b.url),
  );
  coolingDown.sort((a, b) => b.priority - a.priority || a.url.localeCompare(b.url));

  return {
    scanned: items.length,
    ready: eligible.slice(0, SEARCH_PULSE_HARD_CAP),
    coolingDown,
    alreadyCurrent,
    qualityBlocked,
    unsafeBlocked,
    staleBlocked,
    deferredCount: Math.max(0, eligible.length - SEARCH_PULSE_HARD_CAP),
  };
}
