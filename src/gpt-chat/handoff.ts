// The Telegram handoff: how a web conversation is carried into the studio's
// Telegram assistant so the bot can greet with context and the operator can
// see which conversation an enquiry came from.
//
// The link is MINTED BY THE SERVER — POST /api/gpt/handoff returns a finished
// deep link carrying an opaque single-use token. This module never assembles a
// link out of a raw session id: the id is a bearer handle to a stored
// conversation, and a /start payload is public text Telegram echoes back.
//
// The endpoint degrades in steps and so does this client:
//   configured:false → no bot at all      → the studio contact from contact.ts
//   linked:false     → a bot, no context  → the returned contextless deep link
//   linked:true      → the session travels with the person
// and if the request itself fails, the studio contact stands. The button is
// never dead and never claims context it does not have.
import { useEffect, useRef, useState } from 'react';
import type { Locale } from './types';
import { studioTelegramLink, type TelegramTarget } from './contact';

/** Which surface asked for the link. Sent as the handoff `intent`. */
export type HandoffSource = 'offer' | 'hourly_limit' | 'daily_limit';

/** Give up quickly: a dead endpoint must not hold a CTA hostage on 3G. */
const MINT_TIMEOUT_MS = 4000;

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

export interface MintedHandoff {
  href: string;
  linked: boolean;
  /** Opaque reference for the minted conversation, e.g. w_<32 hex>. */
  payload: string | null;
}

/**
 * Ask the backend for a deep link to the assistant bot.
 * Resolves to null whenever anything at all is off — an unconfigured bot, a
 * transport failure, a link that is not a Telegram URL. The caller then keeps
 * the fallback it already has rather than surfacing an error to a visitor.
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
 * Minting starts as soon as the surface is rendered rather than on the click:
 * an `href` that is already correct survives a middle-click, "open in new
 * tab", a popup blocker and a slow network, where a click that has to await a
 * request does not.
 */
export function useTelegramHandoff(
  apiBase: string,
  sessionId: string | null,
  locale: Locale,
  source: HandoffSource,
): HandoffLink {
  const [link, setLink] = useState<HandoffLink>(() => ({
    href: studioTelegramLink(locale),
    channel: 'studio',
    withSession: false,
  }));
  const requested = useRef('');

  useEffect(() => {
    const key = `${apiBase}|${sessionId ?? ''}|${locale}|${source}`;
    if (requested.current === key) return;
    requested.current = key;
    let cancelled = false;
    const pageUrl = typeof location === 'undefined' ? undefined : location.pathname;
    void mintTelegramLink(apiBase, { sessionId, locale, source, pageUrl }).then((minted) => {
      if (cancelled) return;
      // The mint is used for its reference code, not its bot deep link: these
      // CTAs go to the owner's own Telegram, because the person clicking wants
      // a human who can quote a price. Without a code the plain contact stands.
      if (!minted || !minted.payload) return;
      setLink({
        href: studioTelegramLink(locale, minted.payload),
        channel: 'studio',
        withSession: minted.linked,
      });
    });
    return () => { cancelled = true; };
  }, [apiBase, sessionId, locale, source]);

  return link;
}
