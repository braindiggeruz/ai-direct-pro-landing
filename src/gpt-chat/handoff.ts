// The Telegram handoff: how a web conversation is carried into the studio's
// Telegram assistant (@gptbotuz_bot) so the bot can greet with context and
// the operator can see which conversation an enquiry came from.
//
// The link is MINTED BY THE SERVER — POST /api/gpt/handoff returns a finished
// deep link carrying an opaque single-use token. This module never assembles a
// link out of a raw session id: the id is a bearer handle to a stored
// conversation, and a /start payload is public text Telegram echoes back.
//
// The ladder, from best to worst, and the only three outcomes there are:
//   minted + linked:true + payload  → the minted link; the session travels
//   minted + linked:false           → the minted contextless link to the bot
//   anything else (no answer yet, a timeout, a transport error, a non-2xx,
//   configured:false, a link to some other bot or account)
//                                   → the PUBLIC bot deep link
//                                     t.me/<bot>?start=site_ru|site_uz
// No person's Telegram account is ever produced here. A consumer who asked
// the chat for "ChatGPT" belongs in the bot, which has its own allowance and
// answers at once; the studio's work Telegram, when one is configured, is
// reserved for the explicit B2B card (studioBusinessLink in contact.ts), where
// a human sale is the right outcome. The button is never dead and never claims
// context it does not have.
//
// Why it is written this way — the defects this replaced, verified in code on
// 2026-09-30 (every one of them sent consumers to the owner's DMs):
//   1. resolveHandoffLink() returned the owner link (?text=…) whenever the
//      mint was null, linked:false or had no payload. That DISCARDED the valid
//      contextless bot link the server already returns with linked:false
//      (functions/api/gpt/handoff/index.ts fallbackLink) for the reasons
//      storage_unavailable, rate_limit_unavailable, rate_limited
//      (GPT_HANDOFF_MAX_PER_HOUR=20 per hashed IP — and 85% of the traffic is
//      mobile, behind carrier NAT that shares one IP between many people),
//      global_rate_limited (100/h) and mint_failed.
//   2. The hook's initial state — what the anchor holds until the mint answers
//      (up to MINT_TIMEOUT_MS) — was the owner link, so a fast tap went there.
//   3. Any transport error, timeout, non-2xx or non-t.me answer became null →
//      owner; so did configured:false (no GPT_HANDOFF_BOT_USERNAME at runtime,
//      e.g. a packed runtime JSON that failed to parse and made
//      hydrateRuntimeConfig fail closed).
//   4. The B2B card minted a D1 row on every render and re-minted whenever the
//      session id changed, spending the per-IP budget for nothing. It now links
//      to the studio directly and mints nothing (AiOfferCard.tsx).
//   5. The limit card AiChatConsole actually renders had no Telegram route at
//      all and told a blocked visitor "payments are not connected yet, the free
//      chat is available"; the offer card's 'hourly'/'daily' stages were coded
//      but never rendered, so paywall_viewed never fired (AiLimitTelegram.tsx).
//   6. capTelegramCta / capTelegramNote said "write to us / a person from the
//      studio answers" exactly when the link went to the BOT (i18n.ts).
//   7. Claim side: the bot is dormant unless BOTH TELEGRAM_ASSISTANT_BOT_TOKEN
//      and TELEGRAM_ASSISTANT_WEBHOOK_SECRET are set (functions/api/telegram/
//      assistant.ts answers 200 without processing otherwise); expired (24 h),
//      replayed and unknown w_ tokens correctly fall through to the ordinary
//      greeting; and /start site_ru|site_uz used to greet with Javob's generic
//      START in the Telegram client's language instead of the site's.
//   8. notifyOwnerOfArrival shared the 'lead_notify'/'owner' hourly ceiling
//      (GPT_OWNER_NOTIFY_MAX_PER_HOUR=30) with lead alerts, so once limit
//      cards send consumers to the bot their arrivals could mute real leads.
//      Limit-intent arrivals are now recorded but never pushed.
import { useEffect, useRef, useState } from 'react';
import type { Locale } from './types';
import type { TelegramTarget } from './contact';
import { TELEGRAM_BOT_USERNAME, telegramDeepLink } from '../lib/telegram';

/** Which surface asked for the link. Sent as the handoff `intent`. */
export type HandoffSource = 'offer' | 'hourly_limit' | 'daily_limit' | 'monthly_limit';

/** Give up quickly: a dead endpoint must not hold a CTA hostage on 3G. */
const MINT_TIMEOUT_MS = 4000;

/** What Telegram accepts as a deep-link start parameter. */
const START_PARAM = /^[A-Za-z0-9_-]{1,64}$/;

export interface HandoffLink extends TelegramTarget {
  /** true only when the server confirmed the link carries this conversation. */
  withSession: boolean;
}

function isTelegramUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 't.me' || url.hostname === 'telegram.me');
  } catch {
    return false;
  }
}

/**
 * True only for a deep link to OUR assistant bot: https, t.me or telegram.me,
 * the path exactly `/<TELEGRAM_BOT_USERNAME>` (case-insensitive, as Telegram
 * treats usernames), at most one `start` parameter of the shape Telegram
 * allows, and nothing else — no fragment, no credentials, no port, no other
 * parameter. A link for a different bot or a personal account is never
 * followed, whoever returned it.
 */
export function isConfiguredBotUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.hostname !== 't.me' && url.hostname !== 'telegram.me') return false;
  if (url.username || url.password || url.port || url.hash) return false;
  if (url.pathname.toLowerCase() !== `/${TELEGRAM_BOT_USERNAME.toLowerCase()}`) return false;
  const keys = [...url.searchParams.keys()];
  if (keys.length === 0) return true;
  if (keys.length !== 1 || keys[0] !== 'start') return false;
  return START_PARAM.test(url.searchParams.get('start') ?? '');
}

/**
 * The public, contextless entry to the assistant bot — the same
 * `?start=site_ru|site_uz` link the server's own fallback returns, and a
 * payload the bot greets in the site's language. src/lib/telegram.ts always
 * has a bot username, so this link always exists.
 */
export function publicBotLink(locale: Locale): HandoffLink {
  return { href: telegramDeepLink(locale), channel: 'bot', withSession: false };
}

export interface MintedHandoff {
  href: string;
  linked: boolean;
  /** Opaque reference for the minted conversation, e.g. w_<32 hex>. */
  payload: string | null;
}

/** The start parameter a deep link carries, or null. */
function startParam(href: string): string | null {
  try {
    return new URL(href).searchParams.get('start');
  } catch {
    return null;
  }
}

/**
 * Only a server-minted deep link to our bot that actually carries the minted
 * payload can transfer the conversation. A contextless link to the bot is
 * still followed — it is a working continuation — but never labelled as
 * carrying the session. Everything else is the public bot link.
 */
export function resolveHandoffLink(locale: Locale, minted: MintedHandoff | null): HandoffLink {
  if (minted && isConfiguredBotUrl(minted.href)) {
    const carriesSession = minted.linked && !!minted.payload && startParam(minted.href) === minted.payload;
    return { href: minted.href, channel: 'bot', withSession: carriesSession };
  }
  return publicBotLink(locale);
}

/**
 * Ask the backend for a deep link to the assistant bot.
 * Resolves to null whenever anything at all is off — an unconfigured bot, a
 * transport failure, a link that is not a Telegram URL. The caller then keeps
 * the public bot link it already has rather than surfacing an error to a
 * visitor.
 */
export async function mintTelegramLink(
  apiBase: string,
  params: { sessionId: string | null; locale: Locale; source: HandoffSource; pageUrl?: string },
): Promise<MintedHandoff | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MINT_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase}/api/gpt/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: params.sessionId,
        locale: params.locale,
        intent: params.source,
        // Path only — a query string can carry personal data into the record.
        pageUrl: params.pageUrl,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: unknown; linked?: unknown; deepLink?: unknown; payload?: unknown };
    if (data.ok !== true) return null;
    if (typeof data.deepLink !== 'string' || !isTelegramUrl(data.deepLink)) return null;
    const payload = typeof data.payload === 'string' && /^w_[0-9a-f]{8,64}$/.test(data.payload) ? data.payload : null;
    return { href: data.deepLink, linked: data.linked === true, payload };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the Telegram route for one surface.
 *
 * The anchor holds the public bot link from the first render, so a tap made
 * before the mint answers still reaches the bot. Minting starts as soon as the
 * surface is rendered rather than on the click: an `href` that is already
 * correct survives a middle-click, "open in new tab", a popup blocker and a
 * slow network, where a click that has to await a request does not. Mount a
 * surface that uses this hook only when its link can actually be shown — each
 * mount writes a row.
 */
export function useTelegramHandoff(
  apiBase: string,
  sessionId: string | null,
  locale: Locale,
  source: HandoffSource,
): HandoffLink {
  const [link, setLink] = useState<HandoffLink>(() => publicBotLink(locale));
  const requested = useRef('');

  useEffect(() => {
    const key = `${apiBase}|${sessionId ?? ''}|${locale}|${source}`;
    if (requested.current === key) return;
    requested.current = key;
    let cancelled = false;
    const pageUrl = typeof location === 'undefined' ? undefined : location.pathname;
    void mintTelegramLink(apiBase, { sessionId, locale, source, pageUrl }).then((minted) => {
      if (cancelled) return;
      setLink(resolveHandoffLink(locale, minted));
    });
    return () => { cancelled = true; };
  }, [apiBase, sessionId, locale, source]);

  return link;
}
