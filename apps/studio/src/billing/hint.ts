/**
 * Whether «Mening paketim» has anything to show in this browser, without
 * loading any billing code: main.tsx imports this file statically, and the
 * pack panel (MyPack.tsx) arrives through import() only when it may.
 *
 *   - localStorage `gptbot_studio_pack_v1`: this browser bought a tariff
 *     here (a per-viewer convenience; blocked storage simply means no hint);
 *   - the window event `gptbot-studio-pack`: a billing part of this page
 *     view saw a studio account (/me) or an order was just placed.
 *
 * Nothing here reaches the network.
 */

export const PACK_HINT_KEY = 'gptbot_studio_pack_v1';
export const PACK_EVENT = 'gptbot-studio-pack';

/** The bits of `window` the hint uses (tests pass their own). */
export interface HintTarget {
  readonly localStorage: Pick<Storage, 'getItem' | 'setItem'>;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  dispatchEvent(event: Event): boolean;
}

function browser(): HintTarget | null {
  return typeof window === 'undefined' ? null : (window as unknown as HintTarget);
}

/** Tells the page a studio account is known now (no storage). */
export function announcePack(target: HintTarget | null = browser()): void {
  try {
    target?.dispatchEvent(new Event(PACK_EVENT));
  } catch {
    // No event: the panel shows on the next visit.
  }
}

/** This browser placed an order here: remembered, and announced to the page. */
export function rememberPack(target: HintTarget | null = browser()): void {
  try {
    target?.localStorage.setItem(PACK_HINT_KEY, '1');
  } catch {
    // Private mode or blocked storage: the button appears after the next result instead.
  }
  announcePack(target);
}

export function packRemembered(target: HintTarget | null = browser()): boolean {
  try {
    return target?.localStorage.getItem(PACK_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Calls `listener` on every announcement; returns the unsubscribe. */
export function onPack(listener: () => void, target: HintTarget | null = browser()): () => void {
  if (!target) return () => undefined;
  target.addEventListener(PACK_EVENT, listener);
  return () => target.removeEventListener(PACK_EVENT, listener);
}
