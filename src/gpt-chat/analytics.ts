// Safe analytics helper for the chat island — pushes to dataLayer + gtag
// if present, never throws when analytics is absent.
type Payload = Record<string, unknown>;

const SAFE_KEYS = new Set([
  'route', 'lang', 'locale', 'tool', 'templateId', 'roleId', 'status', 'source',
  'from', 'where', 'mode', 'channel', 'presetId', 'plan', 'reason', 'code',
  'model', 'surface', 'messageNumber', 'anonymous', 'chipId', 'method',
  // Funnel metadata only: which staged offer, which intent slug, and whether
  // the Telegram link carried the web session. Never anything a visitor typed.
  'stage', 'intent', 'withSession',
]);
const onceKeys = new Set<string>();

function safePayload(data: Payload): Payload {
  const route = typeof location !== 'undefined' ? location.pathname : undefined;
  const lang = typeof document !== 'undefined' ? document.documentElement.lang?.slice(0, 2) : undefined;
  const clean: Payload = { route, lang };
  for (const [key, value] of Object.entries(data)) {
    if (!SAFE_KEYS.has(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') clean[key] = value;
  }
  return clean;
}

export function track(event: string, data: Payload = {}): void {
  try {
    const w = window as unknown as {
      dataLayer?: Array<Record<string, unknown>>;
      gtag?: (...args: unknown[]) => void;
    };
    const payload = safePayload(data);
    // gtag already writes into dataLayer. Using both paths duplicates events.
    if (typeof w.gtag === 'function') w.gtag('event', event, payload);
    else {
      if (!w.dataLayer) w.dataLayer = [];
      w.dataLayer.push({ event, ...payload });
    }
  } catch {
    /* noop */
  }
}

export function trackOnce(event: string, data: Payload = {}): void {
  const payload = safePayload(data);
  const key = `${event}:${String(payload.route || '')}:${String(payload.lang || '')}`;
  if (onceKeys.has(key)) return;
  onceKeys.add(key);
  track(event, data);
}

// Canonical event names (see brief §8).
export const EV = {
  pageView: 'GPTChatPageView',
  sessionStarted: 'GPTChatSessionStarted',
  messageSent: 'GPTChatMessageSent',
  answerReceived: 'GPTChatAnswerReceived',
  limitReached: 'GPTChatLimitReached',
  leadIntent: 'GPTChatLeadIntent',
  leadSubmitted: 'GPTChatLeadSubmitted',
  pricingViewed: 'GPTChatPricingViewed',
  subscribeIntent: 'GPTChatSubscribeIntent',
  providerError: 'GPTChatProviderError',
  // Product-cabinet funnel. Payloads contain only UI metadata — never prompts
  // or generated answers.
  visitChat: 'VisitChat',
  startChat: 'StartChat',
  sendPrompt: 'SendPrompt',
  useTemplate: 'UseTemplate',
  selectRole: 'SelectRole',
  generateImagePrompt: 'GenerateImagePrompt',
  viewPricing: 'ViewPricing',
  limitReachedProduct: 'LimitReached',
  upgradeClick: 'UpgradeClick',
  businessDemoStarted: 'BusinessDemoStarted',
  businessLeadSubmitted: 'BusinessLeadSubmitted',
  telegramClick: 'TelegramClick',
  copyAnswer: 'CopyAnswer',
  newChat: 'NewChat',
  // Normalized product-funnel events (2026-07 UX sprint). Snake_case set used
  // for cross-product dashboards; legacy PascalCase events above stay for GA
  // continuity. message_sent carries messageNumber instead of _1/_2/_3 names.
  chatOpened: 'chat_opened',
  promptChipClicked: 'prompt_chip_clicked',
  messageSentN: 'message_sent',
  aiResponseSuccess: 'ai_response_success',
  aiResponseError: 'ai_response_error',
  messageCopied: 'message_copied',
  responseRegenerated: 'response_regenerated',
  generationStopped: 'generation_stopped',
  pricingClicked: 'pricing_clicked',
  b2bCtaClicked: 'b2b_cta_clicked',
  businessClicked: 'business_clicked',
  telegramClicked: 'telegram_clicked',
  telegramCtaClicked: 'telegram_cta_clicked',
  websiteTelegramClicked: 'website_telegram_clicked',
  // Lead funnel of the free chat (2026-09). Until now the only measured thing
  // between "answer received" and "enquiry" was nothing at all.
  generateLead: 'generate_lead',
  paywallViewed: 'paywall_viewed',
  leadFormOpened: 'lead_form_opened',
  leadFormFailed: 'lead_form_failed',
  // The staged offer (stages 2-4 of the funnel). `stage` is 'b2b' | 'hourly'
  // | 'daily'; offerViewed fires once per stage per page view, so a re-render
  // or a scroll never inflates the denominator of the two routes out.
  offerViewed: 'offer_viewed',
  offerDismissed: 'offer_dismissed',
  /** The Telegram route actually taken, with `withSession` telling us whether
   *  the minted link carried the web conversation or fell back to the handle. */
  telegramHandoffClicked: 'telegram_handoff_clicked',
} as const;

/**
 * GA4 `generate_lead`, plus the legacy PascalCase twin for dashboard
 * continuity.
 *
 * Call it ONLY after the backend acknowledged the lead — a submit click is not
 * a lead (tests/seo-analytics-privacy.test.ts holds the site's analytics to
 * that rule). `method` says which surface produced the lead; nothing the
 * visitor typed is ever passed in.
 */
export function trackLeadSubmitted(method: string, data: Payload = {}): void {
  track(EV.generateLead, { ...data, method });
  track(EV.leadSubmitted, { ...data, method });
}
