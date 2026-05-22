// Centralized CTA URL with UTM passthrough into Telegram start parameter.
export const CTA_URL_BASE = 'https://t.me/aidirectprobot';
export const CTA_START_DEFAULT = 'tgads_landing';

// Push to dataLayer (and Meta Pixel if available) safely.
export function track(event: string, data: Record<string, unknown> = {}): void {
  try {
    const w = window as unknown as {
      dataLayer?: Array<Record<string, unknown>>;
      fbq?: (...args: unknown[]) => void;
    };
    if (!w.dataLayer) w.dataLayer = [];
    w.dataLayer.push({ event, ...data });
    if (typeof w.fbq === 'function') {
      w.fbq('trackCustom', event, data);
    }
  } catch {
    /* noop */
  }
}

// Build a CTA URL that preserves UTM tags by encoding them into the Telegram
// `start` parameter. Telegram start params must be <=64 chars and safe
// alphanumerics + `_`. We use a compact encoding: tgads_landing__u_<src>_m_<med>_c_<camp>
function sanitizeToken(v: string): string {
  return v.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
}

export function buildCtaUrl(): string {
  if (typeof window === 'undefined') {
    return `${CTA_URL_BASE}?start=${CTA_START_DEFAULT}`;
  }
  const params = new URLSearchParams(window.location.search);
  const src = params.get('utm_source');
  const med = params.get('utm_medium');
  const cmp = params.get('utm_campaign');

  let start = CTA_START_DEFAULT;
  const parts: string[] = [];
  if (src) parts.push(`u_${sanitizeToken(src)}`);
  if (med) parts.push(`m_${sanitizeToken(med)}`);
  if (cmp) parts.push(`c_${sanitizeToken(cmp)}`);
  if (parts.length) {
    const extra = parts.join('_');
    const combined = `${CTA_START_DEFAULT}__${extra}`;
    start = combined.length <= 64 ? combined : combined.slice(0, 64);
  }
  return `${CTA_URL_BASE}?start=${start}`;
}
