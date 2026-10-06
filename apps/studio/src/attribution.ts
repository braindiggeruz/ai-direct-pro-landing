/**
 * Where a studio buyer came from (STUDIO-SPEC §10.1).
 *
 * Two records live in this browser's localStorage and never leave it on
 * their own; checkout (T3.2) sends them with an order the person chose to
 * place, and the server cleans them again by the lead rules
 * (functions/lib/gpt-chat/validate.ts sanitizeLeadAttribution: click ids
 * ^[A-Za-z0-9._-]{1,200}$, UTM values ≤ 100 characters):
 *
 *   gptbot_ft_v1           the first touch, written by the site's
 *                          FIRST_TOUCH_SCRIPT in every page's <head>
 *                          (scripts/attribution-snippet.ts). Read only.
 *   gptbot_studio_lt_v1    the last PAID touch, written here when a studio
 *                          page is opened from an ad: gclid, gbraid, wbraid,
 *                          yclid, utm_*, the landing path without its query,
 *                          and the time. Kept 90 days. fbclid is not kept:
 *                          Meta is not used before decision R-B12.
 *
 * A visit counts as a paid touch when it carries a click id, or a utm_medium
 * that names paid traffic (cpc, ppc, cpm, cpa, paid…, ads, display, banner,
 * retargeting). Any other visit leaves the stored touch as it was.
 *
 * Analytics ids come from cookies the site's tags already set: `_ga`
 * (GA4 client id), `_ga_V87YFL96C7` (the session id, GS1 and GS2 formats)
 * and `_ym_uid` (Metrika). These are pseudonymous data, named in the privacy
 * policy and wiped from an order after 93 days.
 *
 * Writing the last touch happens on load and touches only localStorage: the
 * island still makes no network request on load. Every storage access is in
 * try/catch: private mode or blocked storage simply means no record.
 */

export const FIRST_TOUCH_KEY = 'gptbot_ft_v1';
export const LAST_TOUCH_KEY = 'gptbot_studio_lt_v1';
export const LAST_TOUCH_DAYS = 90;
const DAY_MS = 86_400_000;

/** GA4 property of the site (scripts/analytics-snippet.ts: G-V87YFL96C7). */
export const GA4_MEASUREMENT_SUFFIX = 'V87YFL96C7';

export const CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid', 'yclid'] as const;
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
const CLICK_ID = /^[A-Za-z0-9._-]{1,200}$/;
const UTM_MAX = 100;
const PAID_MEDIUM = /(?:^|[^a-z])(?:cpc|ppc|cpm|cpa|cpv|paid[a-z_-]*|ads?|display|banner|retargeting)(?:$|[^a-z])/i;

export type ClickIdKey = (typeof CLICK_ID_KEYS)[number];
export type UtmKey = (typeof UTM_KEYS)[number];

export interface LastTouch extends Partial<Record<ClickIdKey | UtmKey, string>> {
  /** The landing page's path, no query, ≤ 200 characters. */
  readonly landing: string;
  /** ISO time of the visit. */
  readonly at: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The paid touch in a page address, or null when the visit is not one. */
export function paidTouchOf(location: Pick<Location, 'pathname' | 'search'>, now: number): LastTouch | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(location.search || '');
  } catch {
    return null;
  }
  const touch: Record<string, string> = {};
  for (const key of CLICK_ID_KEYS) {
    const value = params.get(key)?.trim();
    if (value && CLICK_ID.test(value)) touch[key] = value;
  }
  for (const key of UTM_KEYS) {
    const value = params.get(key)?.trim();
    if (value) touch[key] = value.slice(0, UTM_MAX);
  }
  const hasClickId = CLICK_ID_KEYS.some((key) => key in touch);
  if (!hasClickId && !PAID_MEDIUM.test(touch.utm_medium ?? '')) return null;
  return { ...touch, landing: (location.pathname || '/').slice(0, 200), at: new Date(now).toISOString() };
}

/** Records this visit as the last paid touch when it is one. Returns what was written, or null. */
export function captureLastTouch(
  location: Pick<Location, 'pathname' | 'search'> = typeof window !== 'undefined' ? window.location : { pathname: '/', search: '' },
  store: StorageLike | null = storage(),
  now: number = Date.now(),
): LastTouch | null {
  const touch = paidTouchOf(location, now);
  if (!touch || !store) return null;
  try {
    store.setItem(LAST_TOUCH_KEY, JSON.stringify(touch));
    return touch;
  } catch {
    return null;
  }
}

function readJson(store: StorageLike | null, key: string): Record<string, unknown> | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The stored last paid touch, cleaned; null when absent, malformed or older than 90 days (then it is removed). */
export function readLastTouch(store: StorageLike | null = storage(), now: number = Date.now()): LastTouch | null {
  const raw = readJson(store, LAST_TOUCH_KEY);
  if (!raw) return null;
  const at = typeof raw.at === 'string' ? Date.parse(raw.at) : Number.NaN;
  if (!Number.isFinite(at) || at > now + DAY_MS || now - at > LAST_TOUCH_DAYS * DAY_MS) {
    try {
      store?.removeItem(LAST_TOUCH_KEY);
    } catch {
      // Nothing to clean then.
    }
    return null;
  }
  const touch: Record<string, string> = {};
  for (const key of CLICK_ID_KEYS) {
    const value = raw[key];
    if (typeof value === 'string' && CLICK_ID.test(value)) touch[key] = value;
  }
  for (const key of UTM_KEYS) {
    const value = raw[key];
    if (typeof value === 'string' && value && value.length <= UTM_MAX) touch[key] = value;
  }
  const landing = typeof raw.landing === 'string' && raw.landing.startsWith('/') ? raw.landing.slice(0, 200) : '/';
  return { ...touch, landing, at: new Date(at).toISOString() };
}

/** The site's first touch as FIRST_TOUCH_SCRIPT stored it; the server cleans it again. */
export function readFirstTouch(store: StorageLike | null = storage()): Record<string, unknown> | null {
  return readJson(store, FIRST_TOUCH_KEY);
}

export interface AnalyticsIds {
  /** "<random>.<timestamp>" from _ga = GA1.<n>.<random>.<timestamp>. */
  readonly gaClientId?: string;
  /** The session id from _ga_<measurement id>: GS1.1.<id>.… or GS2.1.s<id>$o…. */
  readonly gaSessionId?: string;
  /** _ym_uid, digits only. */
  readonly ymClientId?: string;
}

function cookieValue(cookies: string, name: string): string | null {
  for (const part of cookies.split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    if (part.slice(0, at).trim() === name) {
      try {
        return decodeURIComponent(part.slice(at + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function readAnalyticsIds(cookies: string = typeof document !== 'undefined' ? document.cookie : ''): AnalyticsIds {
  const ids: { gaClientId?: string; gaSessionId?: string; ymClientId?: string } = {};
  const ga = cookieValue(cookies, '_ga');
  const client = ga ? /^GA\d+\.\d+\.(\d{1,20}\.\d{1,20})$/.exec(ga) : null;
  if (client) ids.gaClientId = client[1];
  const session = cookieValue(cookies, `_ga_${GA4_MEASUREMENT_SUFFIX}`);
  const gs1 = session ? /^GS1\.\d+\.(\d{1,20})\./.exec(session) : null;
  const gs2 = session ? /^GS2\.\d+\.s(\d{1,20})(?:\$|$)/.exec(session) : null;
  if (gs1 || gs2) ids.gaSessionId = (gs1 ?? gs2)![1];
  const ym = cookieValue(cookies, '_ym_uid');
  if (ym && /^\d{1,30}$/.test(ym)) ids.ymClientId = ym;
  return ids;
}
