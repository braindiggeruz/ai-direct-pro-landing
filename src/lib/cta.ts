// Calls to action of the homepage landing and their tracking.
//
// Every "demo" button on the homepage leads to its contact section
// (#contact, src/components/FinalCTA.tsx): the studio Telegram (the owner's
// account, the public contact since the owner's order of 26.10.2026,
// superseding paid-chat decision L14) and the e-mail; the phone only while
// content/global/site.json phonePublic is true (src/shared/studio-contact.ts).
export const CONTACT_HREF = '#contact';

// Map our custom events to standard Meta Pixel events where applicable. A
// click on a homepage button only scrolls to the contact section now, so it is
// not a Lead; a click on the phone, the e-mail or the Telegram there
// (click_contact) is Meta's standard Contact event, "a person initiates
// contact with your business via telephone, email or chat". No lead is
// claimed from the browser: the page cannot see whether the call happened.
const PIXEL_STD_MAP: Record<string, string> = {
  click_contact: 'Contact',
  view_section: 'ViewContent',
};

// gtag already queues into dataLayer. Use exactly one Google route and keep
// Meta independent so an unavailable Google tag cannot suppress its events.
export function track(event: string, data: Record<string, unknown> = {}): void {
  try {
    const w = window as unknown as {
      dataLayer?: Array<Record<string, unknown>>;
      gtag?: (...args: unknown[]) => void;
      fbq?: (...args: unknown[]) => void;
    };
    try {
      // UI origin is not campaign attribution. Keep caller/Meta fields intact.
      const googleData = { ...data };
      if ('source' in googleData) {
        if (!('ui_source' in googleData)) googleData.ui_source = googleData.source;
        delete googleData.source;
      }
      if (typeof w.gtag === 'function') w.gtag('event', event, googleData);
      else {
        if (!w.dataLayer) w.dataLayer = [];
        w.dataLayer.push({ event, ...googleData });
      }
    } catch {
      /* Google analytics must not block the independent Meta route. */
    }
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

export type ContactMethod = 'phone' | 'email' | 'telegram';

/**
 * One event per click on a way to reach the studio. The parameters name the
 * channel and where the link sat, never the number or the address.
 */
export function trackContact(method: ContactMethod, zone: string, locale: string): void {
  track('click_contact', { contact_method: method, contact_kind: 'contact', cta_zone: zone, locale, page_kind: 'homepage' });
}
