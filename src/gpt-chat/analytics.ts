// Safe analytics helper for the chat island — pushes to dataLayer + gtag
// if present, never throws when analytics is absent.
type Payload = Record<string, unknown>;

export function track(event: string, data: Payload = {}): void {
  try {
    const w = window as unknown as {
      dataLayer?: Array<Record<string, unknown>>;
      gtag?: (...args: unknown[]) => void;
    };
    if (!w.dataLayer) w.dataLayer = [];
    w.dataLayer.push({ event, ...data });
    if (typeof w.gtag === 'function') w.gtag('event', event, data);
  } catch {
    /* noop */
  }
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
} as const;
