// The chat's steps counted on the server (POST /api/gpt/event): the pack
// window's funnel (plan WP-17), the business line (plan WP-20) and the
// trial's paywall (roadmap 2026-10-25 §5.2: its page role and the exit survey), each sent
// next to the GA4 event of the same step: GA4 misses everyone who blocks it,
// this counter does not. Fire and forget — a lost event costs a count, never
// a sign-in, a purchase or a lead. The body is a fresh id per event (a resend
// counts once), the step, one qualifier from a closed list and this tab's
// random id: nothing a visitor typed, no order and no account. The server
// answers 404 to a pack-window step while the window is out of reach (billing
// off) and counts the business line whatever billing does.
import type { BusinessTopic } from './business-intent';
import type { ExitReason, PaywallRole } from './trial-copy';
import type { AbortReason, CheckoutBucket, CheckoutApp, CheckoutOs, CheckoutProvider, ReturnOutcome } from '../shared/checkout-events';

/** provider.time.app.os: the checkout steps' qualifier (src/shared/checkout-events.ts), built in the lazy part chat-pay. */
type CheckoutTail<P extends string = CheckoutProvider> = `${P}.${CheckoutBucket}.${CheckoutApp}.${CheckoutOs}`;

/** Which button opened the pack window: GA4's `from` of pack_viewed and the counter's qualifier. */
export const PACK_FROM = [
  'header', 'limit_card', 'low_limit', 'after_10', 'after_value', 'account_check', 'login_failed', 'login_resume', 'pay_return', 'wall',
] as const;
export type PackFrom = (typeof PACK_FROM)[number];

/** The steps, with the qualifiers functions/lib/gpt-chat/ui-event-store.ts accepts. */
export interface UiEventDetails {
  pack_viewed: PackFrom;
  pack_prompt_viewed: 'after_answer'|'near_limit'|'trial_exhausted'|'trial_last';
  pack_prompt_dismissed: 'after_answer'|'near_limit'|'trial_exhausted'|'trial_last';
  /** The trial's paywall showed on a page with this role ('general' on the main chats). */
  trial_paywall_role: PaywallRole;
  /** «Nega hozir emas?» under the closed paywall: one answer from a closed list. */
  trial_exit_reason: ExitReason;
  /** The spent trial's limit card stood on a page view: how long ago this browser first met it. */
  trial_wall_seen: 'first' | 'same_day' | 'd1_2' | 'd3_7' | 'd8_plus';
  login_started: 'bot' | 'oidc';
  login_result: 'done' | 'rejected' | 'expired' | 'failed';
  checkout_started: 'click' | 'uzum' | 'payme';
  checkout_result: 'paid' | 'pending' | 'cancelled';
  /** The checkout steps between the tap and the provider's page (chat CRO 2026-11-17): closed lists only, no order, no text, no user agent. */
  checkout_created: CheckoutTail;
  checkout_probe_failed: CheckoutTail;
  checkout_aborted: `${AbortReason}.${CheckoutTail}`;
  checkout_redirect: CheckoutTail;
  checkout_return_unpaid: `${ReturnOutcome}.${CheckoutTail<CheckoutProvider | 'unknown'>}`;
  b2b_line_shown: BusinessTopic;
  b2b_line_dismissed: BusinessTopic;
  /** An answer rated «helpful» (up) or «not helpful» (down) on a page with this role ('general' on the main chats): the verdict and the role, no text. */
  answer_rating: `${'up' | 'down'}_${PaywallRole}`;
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
