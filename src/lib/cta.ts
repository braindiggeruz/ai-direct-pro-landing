// Centralized CTA URL with UTM passthrough into Telegram start parameter.
export const CTA_URL_BASE = 'https://t.me/XGame_changerx';

// Map our custom events to standard Meta Pixel events where applicable.
const PIXEL_STD_MAP: Record<string, string> = {
  click_hero_cta: 'Lead',
  click_sticky_cta: 'Lead',
  click_demo_cta: 'Lead',
  click_final_cta: 'Lead',
  click_header_cta: 'Lead',
  click_offer_cta: 'Lead',
  view_section: 'ViewContent',
};

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
      const std = PIXEL_STD_MAP[event];
      if (std) {
        w.fbq('track', std, { content_name: event, ...data });
      } else {
        w.fbq('trackCustom', event, data);
      }
    }
  } catch {
    /* noop */
  }
}


export function buildCtaUrl(): string {
  // Personal Telegram account (https://t.me/XGame_changerx) does NOT honour the
  // `?start=` parameter (that is bot-only). UTM attribution is still preserved
  // via the `track()` calls on each click (dataLayer + Meta Pixel Lead events).
  return CTA_URL_BASE;
}
