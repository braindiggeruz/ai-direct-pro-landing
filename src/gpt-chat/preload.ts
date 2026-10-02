// When to fetch a lazy part before anyone asks for it (plan WP-10). A part is
// worth fetching ahead only where people are about to open it, and only if
// they can open it at all: nobody downloads a window they cannot reach.
import type { AiToolId } from './templates';

export interface AccountWindowSignals {
  /** The window can be opened: a pack can be bought, an account or an active pack (showsAccountPill). */
  reachable: boolean;
  /** Free messages or pack answers left; -1 while unknown. */
  remaining: number;
  /** A 429 stands: the limit card offers the pack. */
  limited: boolean;
  /** Back from a payment page, or waiting for one this browser started (checkout.ts). */
  payReturn: boolean;
  /** A payment waits for its provider: the visitor is coming back to it. */
  paymentPending: boolean;
}

/** The pack window (chat-account) opens at once at the moments people open it. */
export function preloadsAccountWindow(signals: AccountWindowSignals): boolean {
  if (!signals.reachable) return false;
  return signals.limited
    || (signals.remaining >= 0 && signals.remaining <= 2)
    || signals.payReturn
    || signals.paymentPending;
}

/**
 * The business card (chat-lead) shows only in the business tool, after a few
 * answers, and not again the day it was closed: fetched while the visitor is
 * in that tool and the card can still come.
 */
export function preloadsBusinessCard(signals: { tool: AiToolId; dismissed: boolean }): boolean {
  return signals.tool === 'business' && !signals.dismissed;
}
