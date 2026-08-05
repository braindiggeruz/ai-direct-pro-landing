// Typed access to Yandex Metrika counter 111312750 from the React islands.
//
// The tag itself is installed by the inline block in the document head (see
// scripts/analytics-metrika.ts) — that is the only place the counter is
// created, and it is what covers the prerendered pages that never load React.
// This module exists for the one thing markup cannot express: a goal that may
// only fire after the server confirmed the action.
//
// Rules this module enforces:
//   - only names from the closed catalogue are ever sent;
//   - a goal carries a name and nothing else, so no user value can leak;
//   - a missing or blocked `ym` is a no-op, never an exception.

export const YANDEX_METRIKA_COUNTER_ID = 111312750;

export const YANDEX_GOALS = {
  /** A click on any Telegram CTA (t.me / tg:) — fired from the head block. */
  telegramCtaClick: 'telegram_cta_click',
  /** A click into the free AI chat — fired from the head block. */
  gptChatOpen: 'gpt_chat_open',
  /** A click onto a pricing page — fired from the head block. */
  pricingCtaClick: 'pricing_cta_click',
  /** A lead the server accepted. Never fired from a submit handler alone. */
  leadFormSubmitSuccess: 'lead_form_submit_success',
} as const;

export type YandexGoal = (typeof YANDEX_GOALS)[keyof typeof YANDEX_GOALS];

const ALLOWED_GOALS: ReadonlySet<string> = new Set(Object.values(YANDEX_GOALS));

/**
 * Report a goal. No parameters are accepted by design — the goal name is the
 * whole payload, which is what keeps user input out of Metrika.
 */
export function reachYandexGoal(goal: YandexGoal): void {
  if (!ALLOWED_GOALS.has(goal)) return;
  try {
    if (typeof window === 'undefined' || typeof window.ym !== 'function') return;
    window.ym(YANDEX_METRIKA_COUNTER_ID, 'reachGoal', goal);
  } catch {
    /* blocked, absent or throwing — analytics must never break the page */
  }
}
