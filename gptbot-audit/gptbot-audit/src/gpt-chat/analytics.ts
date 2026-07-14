// Safe analytics helper for the chat island — pushes to dataLayer + gtag
// if present, never throws when analytics is absent.
type Payload = Record<string, unknown>;

const SAFE_KEYS = new Set([
  'route', 'lang', 'locale', 'tool', 'templateId', 'roleId', 'status', 'source',
  'from', 'where', 'mode', 'channel', 'presetId', 'plan', 'reason', 'code',
  'model', 'surface',
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
} as const;
