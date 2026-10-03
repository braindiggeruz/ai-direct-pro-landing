// The chat's steps counted on the server (POST /api/gpt/event): the pack
// window's funnel (plan WP-17) and the business line (plan WP-20), each sent
// next to the GA4 event of the same step: GA4 misses everyone who blocks it,
// this counter does not. Fire and forget — a lost event costs a count, never
// a sign-in, a purchase or a lead. The body is a fresh id per event (a resend
// counts once), the step, one qualifier from a closed list and this tab's
// random id: nothing a visitor typed, no order and no account. The server
// answers 404 to a pack-window step while the window is out of reach (billing
// off) and counts the business line whatever billing does.
import type { BusinessTopic } from './business-intent';

/** Which button opened the pack window: GA4's `from` of pack_viewed and the counter's qualifier. */
export const PACK_FROM = [
  'header', 'limit_card', 'low_limit', 'after_10', 'account_check', 'login_failed', 'login_resume', 'pay_return',
] as const;
export type PackFrom = (typeof PACK_FROM)[number];

/** The steps, with the qualifiers functions/lib/gpt-chat/ui-event-store.ts accepts. */
export interface UiEventDetails {
  pack_viewed: PackFrom;
  login_started: 'bot' | 'oidc';
  login_result: 'done' | 'rejected' | 'expired' | 'failed';
  checkout_started: 'click' | 'uzum' | 'payme';
  checkout_result: 'paid' | 'pending' | 'cancelled';
  b2b_line_shown: BusinessTopic;
  b2b_line_dismissed: BusinessTopic;
}

const VIEW_KEY = 'gptchat_view';

/** A random id for this tab, so the counter can tell visitors apart without knowing them. */
function viewId(): string | null {
  try {
    let id = sessionStorage.getItem(VIEW_KEY);
    if (!id) sessionStorage.setItem(VIEW_KEY, (id = crypto.randomUUID()));
    return id;
  } catch {
    return null;
  }
}

export function recordUiEvent<T extends keyof UiEventDetails>(apiBase: string, type: T, detail: UiEventDetails[T]): void {
  try {
    void fetch(`${apiBase}/api/gpt/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: crypto.randomUUID(), type, detail, view: viewId() }),
      // Survives a navigation to the payment page that follows at once.
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* no fetch or no crypto.randomUUID: nothing is counted */
  }
}
