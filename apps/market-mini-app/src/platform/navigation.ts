import { useEffect, useRef } from 'react';

/**
 * One back gesture, three places it can come from.
 *
 * A Telegram Mini App has no address bar, so until now every way of going back
 * — the Android hardware key, Telegram's own back chevron, a browser swipe —
 * did the same thing: it closed the whole app. A person three screens deep in
 * the cabinet lost the screen, the scroll and anything half-typed on it.
 *
 * This is the smallest spine that fixes that, and deliberately nothing more.
 * It is not a router: there are no paths, no URLs and no screen registry. It is
 * a stack of "things that are currently open", newest last, and one rule — a
 * back gesture closes the newest one and only closes the app when the stack is
 * empty.
 *
 * Three sources are joined into that one rule:
 *
 *   Telegram BackButton  shown while the stack is not empty, hidden when it is;
 *   history.pushState    a single sentinel entry, which is what the Android
 *                        hardware key actually consumes;
 *   the app's own chrome the visible «Назад» controls, which pop the same stack
 *                        so the two never disagree.
 *
 * A stop may refuse to close (unsaved work). It says so by returning false, and
 * nothing else happens — the app stays where it is and the sentinel is put back.
 */

interface TelegramBackButton {
  show?(): void;
  hide?(): void;
  onClick?(listener: () => void): void;
  offClick?(listener: () => void): void;
}

interface BackButtonHost {
  BackButton?: TelegramBackButton;
}

/**
 * One open thing. `onBack` returns false to refuse — used by a composer that
 * has unsaved work and wants to ask before it disappears.
 */
export interface BackStop {
  id: string;
  onBack: () => boolean | void;
}

const stack: BackStop[] = [];
let listeners: Array<() => void> = [];
/** Set while we ourselves call history.back(), so the popstate it causes is not treated as a gesture. */
let ignoreNextPop = false;
/** True while our one history entry is on the stack. */
let sentinel = false;
let started = false;
let enabled = false;
let componentSyncScheduled = false;

function telegramBack(): TelegramBackButton | undefined {
  const host = (window as unknown as { Telegram?: { WebApp?: BackButtonHost } })
    .Telegram?.WebApp;
  return host?.BackButton;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Brings the three surfaces in line with the stack.
 *
 * Exactly one sentinel entry exists while anything is open, never two: a second
 * one would need a second back press to get through and the app would feel
 * stuck.
 */
function sync(): void {
  const open = stack.length > 0;
  const button = telegramBack();
  if (open) button?.show?.();
  else button?.hide?.();

  if (open && !sentinel) {
    sentinel = true;
    try {
      window.history.pushState({ bormiBack: true }, '');
    } catch {
      // A sandboxed frame can refuse pushState. Telegram's own button and the
      // app's chrome still work; only the hardware key falls through.
      sentinel = false;
    }
    return;
  }
  if (!open && sentinel) {
    sentinel = false;
    ignoreNextPop = true;
    try {
      window.history.back();
    } catch {
      ignoreNextPop = false;
    }
  }
}

/**
 * React cleans up the closing screen's effect before it mounts the next
 * screen's effect. During a detail → inquiry transition that creates a
 * momentary empty stack even though navigation never actually became empty.
 * Coalescing cleanup to the microtask boundary lets the replacement stop join
 * first, so we do not consume the browser history sentinel and race the page
 * back to the document that opened the Mini App.
 */
function scheduleComponentSync(): void {
  if (componentSyncScheduled) return;
  componentSyncScheduled = true;
  queueMicrotask(() => {
    componentSyncScheduled = false;
    sync();
    notify();
  });
}

/** Closes the newest open thing. Returns false when it refused. */
export function goBack(): boolean {
  const top = stack.at(-1);
  if (!top) return false;
  if (top.onBack() === false) return false;
  // The stop is expected to remove itself by re-rendering without its
  // `useBackStop`. Dropping it here as well keeps a stop that forgets from
  // wedging the stack.
  const at = stack.lastIndexOf(top);
  if (at >= 0) stack.splice(at, 1);
  sync();
  notify();
  return true;
}

function onPopState(): void {
  if (ignoreNextPop) {
    ignoreNextPop = false;
    return;
  }
  if (!stack.length) return;
  // The entry the gesture consumed was ours, so it is gone either way.
  sentinel = false;
  const top = stack.at(-1)!;
  if (top.onBack() === false) {
    // Refused: put the entry back so the next press is still ours to answer.
    sync();
    return;
  }
  const at = stack.lastIndexOf(top);
  if (at >= 0) stack.splice(at, 1);
  sync();
  notify();
}

/**
 * Turns the spine on. Off by default and off when the server says so, in which
 * case every gesture behaves exactly as it shipped.
 */
export function startNavigation(active: boolean): () => void {
  enabled = active;
  if (!active || started) return () => undefined;
  started = true;
  const button = telegramBack();
  window.addEventListener('popstate', onPopState);
  button?.onClick?.(goBack);
  return () => {
    started = false;
    enabled = false;
    window.removeEventListener('popstate', onPopState);
    button?.offClick?.(goBack);
    stack.length = 0;
    listeners = [];
    sync();
  };
}

export function pushBackStop(stop: BackStop): () => void {
  if (!enabled) return () => undefined;
  stack.push(stop);
  sync();
  notify();
  return () => {
    const at = stack.lastIndexOf(stop);
    if (at < 0) return;
    stack.splice(at, 1);
    scheduleComponentSync();
  };
}

/** How many things are open. Exposed for tests and for the shell's own chrome. */
export function backDepth(): number {
  return stack.length;
}

export function subscribeBackDepth(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

/**
 * Declares "while this is on screen, back closes me".
 *
 * The handler is held in a ref rather than in the effect's dependencies: a
 * screen that rebuilds its closure on every keystroke would otherwise pop and
 * re-push itself constantly, and each re-push would spend a history entry.
 */
export function useBackStop(
  active: boolean,
  id: string,
  onBack: () => boolean | void,
): void {
  const handler = useRef(onBack);
  useEffect(() => {
    handler.current = onBack;
  });
  useEffect(() => {
    if (!active) return undefined;
    return pushBackStop({ id, onBack: () => handler.current() });
  }, [active, id]);
}
