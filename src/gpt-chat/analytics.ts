// Safe analytics helper for the chat island — pushes to dataLayer + gtag
// if present, never throws when analytics is absent.
type Payload = Record<string, unknown>;

// GA4 parameters, snake_case (map 03 §8.1). Funnel metadata only: which
// surface, which slug, which outcome — never anything a visitor typed.
export const GA4_PARAMS: ReadonlySet<string> = new Set([
  'route', 'lang', 'locale', 'tool', 'template_id', 'role_id', 'status', 'source',
  'from', 'mode', 'channel', 'preset_id', 'reason', 'code', 'model', 'surface',
  'message_number', 'anonymous', 'chip_id', 'method', 'intent',
  'with_session', 'provider', 'finish', 'resume', 'entry', 'topic', 'in_app',
]);
const onceKeys = new Set<string>();

/**
 * The in-app browser the chat runs in, for `in_app` on chat_opened and
 * message_sent: a fixed word, never the user agent. Telegram on Android names
 * itself in the user agent or exposes TelegramWebviewProxy; Telegram on iOS
 * looks like Safari to both, so it counts as 'other'.
 */
export function inAppOf(ua: string, w: object): 'telegram' | 'instagram' | 'other' {
  if (ua.includes('Telegram-Android') || 'TelegramWebviewProxy' in w) return 'telegram';
  return ua.includes('Instagram') ? 'instagram' : 'other';
}

export function inApp(): string {
  try {
    return inAppOf(navigator.userAgent, window);
  } catch {
    return 'other';
  }
}

function safePayload(data: Payload): Payload {
  const route = typeof location !== 'undefined' ? location.pathname : undefined;
  const lang = typeof document !== 'undefined' ? document.documentElement.lang?.slice(0, 2) : undefined;
  const clean: Payload = { route, lang };
  for (const [key, value] of Object.entries(data)) {
    if (!GA4_PARAMS.has(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') clean[key] = value;
  }
  return clean;
}

export function track(event: ChatEvent, data: Payload = {}): void {
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

/**
 * GA4's ecommerce `purchase` for a pack the server confirmed (plan WP-17,
 * map 03 §8.1). Not through track(): its `items` are a list, which the
 * catalogue's flat parameters drop. The order id is not personal data; the
 * caller sends each one once (checkout.ts firstReport).
 */
export function trackPurchase(order: { transactionId: string; value: number; itemId: string; itemName: string; provider: string }): void {
  try {
    const w = window as unknown as {
      dataLayer?: Array<Record<string, unknown>>;
      gtag?: (...args: unknown[]) => void;
    };
    const ecommerce = {
      transaction_id: order.transactionId,
      value: order.value,
      currency: 'UZS',
      items: [{ item_id: order.itemId, item_name: order.itemName, price: order.value, quantity: 1 }],
    };
    const payload = safePayload({ provider: order.provider });
    if (typeof w.gtag === 'function') w.gtag('event', EV.purchase, { ...payload, ...ecommerce });
    else {
      if (!w.dataLayer) w.dataLayer = [];
      // GTM reads ecommerce from its own key; clear the previous one first.
      w.dataLayer.push({ ecommerce: null });
      w.dataLayer.push({ event: EV.purchase, ...payload, ecommerce });
    }
  } catch {
    /* noop */
  }
}

export function trackOnce(event: ChatEvent, data: Payload = {}): void {
  const payload = safePayload(data);
  const key = `${event}:${String(payload.route || '')}:${String(payload.lang || '')}`;
  if (onceKeys.has(key)) return;
  onceKeys.add(key);
  track(event, data);
}

/**
 * The chat's closed GA4 catalogue: one event per thing that happened (map 03
 * §8.1, plan WP-09). The PascalCase twins that used to fire next to these
 * (GPTChatMessageSent, SendPrompt, LimitReached, UpgradeClick and the rest)
 * are gone, so a dashboard can count any of them without dividing by three.
 * The page view is GA4's own `page_view`, sent by the loader in the head.
 */
export const EV = {
  /** On mount, once per page view, whether or not the account view answers. */
  chatOpened: 'chat_opened',
  /** One per message: `source` composer | template | answer_action | retry
   *  (a regenerated answer is a message sent again, not an event of its own). */
  messageSent: 'message_sent',
  /** Exactly one of these three per answer. `finish` stop | length. */
  aiResponseSuccess: 'ai_response_success',
  aiResponseError: 'ai_response_error',
  generationStopped: 'generation_stopped',
  /** The server refused a turn (429); `reason` as the server gave it. */
  limitHit: 'limit_hit',
  /** The account / pack window opened; `from` says which button opened it. */
  packViewed: 'pack_viewed',
  loginStarted: 'login_started',
  loginResult: 'login_result',
  /** `resume` true when an existing invoice is reopened, not a new purchase. */
  checkoutStarted: 'checkout_started',
  /** How the payment the browser waited for ended: `status` paid | pending | cancelled. */
  checkoutResult: 'checkout_result',
  /** GA4 ecommerce, once per order the server confirmed; sent by trackPurchase() only. */
  purchase: 'purchase',
  accountActionFailed: 'account_action_failed',
  accountLogout: 'account_logout',
  /** Every Telegram button: `from`, `channel` bot | studio, `with_session`. */
  telegramCtaClicked: 'telegram_cta_clicked',
  leadFormOpened: 'lead_form_opened',
  /** Only after the server acknowledged the lead — a submit click is not a lead. */
  generateLead: 'generate_lead',
  leadFormFailed: 'lead_form_failed',
  pricingClicked: 'pricing_clicked',
  businessClicked: 'business_clicked',
  /** The B2B offer card: once per page view, and its close button. */
  offerViewed: 'offer_viewed',
  offerDismissed: 'offer_dismissed',
  /** The business line under a first answer (business-intent.ts): once per browser session, and its close button. `topic` bot | site | ads | crm. */
  b2bLineShown: 'b2b_line_shown',
  b2bLineDismissed: 'b2b_line_dismissed',
  promptChipClicked: 'prompt_chip_clicked',
  templateUsed: 'template_used',
  messageCopied: 'message_copied',
  newChat: 'new_chat',
  roleSelected: 'role_selected',
  toolOpened: 'tool_opened',
  imagePromptGenerated: 'image_prompt_generated',
  /** The chatgpt.com link on the resting screen. */
  officialLinkClicked: 'official_link_clicked',
  /** From the Russian chat to the Uzbek one; `surface` header | empty. */
  localeSwitched: 'locale_switched',
} as const;

export type ChatEvent = (typeof EV)[keyof typeof EV];
