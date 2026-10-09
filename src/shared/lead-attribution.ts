const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const CLICK_ID_KEYS = ['gclid', 'yclid', 'fbclid'] as const;

/** Reads only the site's existing first-touch record; never a conversation. */
export function readFirstTouch(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem('gptbot_ft_v1');
    const parsed: unknown = raw && JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value) result[key] = value.slice(0, 200);
    }
    return result;
  } catch { return {}; }
}

/** Current campaign when present, otherwise the first-touch campaign. */
export function leadUtm(firstTouch: Record<string, string>): Record<string, string> {
  const current: Record<string, string> = {};
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of UTM_KEYS) {
      const value = params.get(key);
      if (value) current[key] = value.slice(0, 120);
    }
  } catch { /* No location in a server render. */ }
  if (Object.keys(current).length) return current;
  for (const key of UTM_KEYS) {
    if (firstTouch[key]) current[key] = firstTouch[key].slice(0, 120);
  }
  return current;
}

/** The endpoint re-validates these identifiers; none belong in GA4 payloads. */
export function leadAttribution(firstTouch: Record<string, string>): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  if (firstTouch.landing) {
    for (const key of ['landing', 'referrerHost', ...CLICK_ID_KEYS, 'firstSeenAt']) {
      if (firstTouch[key]) result[key] = firstTouch[key];
    }
  } else {
    try {
      result.landing = window.location.pathname;
      const params = new URLSearchParams(window.location.search);
      for (const key of CLICK_ID_KEYS) {
        const value = params.get(key);
        if (value) result[key] = value.slice(0, 200);
      }
      const host = document.referrer ? new URL(document.referrer).hostname : '';
      if (host && host !== window.location.hostname) result.referrerHost = host;
    } catch { /* A malformed referrer is simply absent. */ }
  }
  return Object.keys(result).length ? result : undefined;
}
