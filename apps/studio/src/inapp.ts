/**
 * In-app browsers (STUDIO-SPEC §7.7).
 *
 * The browsers inside Instagram, Facebook and Telegram often cannot save a
 * file: the .pptx (and with it the day's free unit) is lost, or the page
 * reloads when the person switches to a real browser. They are recognised
 * when the page loads, before anything is generated, and the form shows
 * «Brauzerda oching» with a «Havolani nusxalash» button above its submit
 * button. Generating is still allowed.
 *
 *   Instagram   "Instagram" in the user agent
 *   Facebook    "FBAN" or "FBAV" in the user agent (Facebook, Messenger)
 *   Telegram    window.TelegramWebviewProxy (its in-app browser on Android
 *               and iOS), or "Telegram" in the user agent
 */

export type InAppBrowser = 'instagram' | 'facebook' | 'telegram';

export interface InAppWindow {
  readonly TelegramWebviewProxy?: unknown;
  readonly TelegramWebviewProxyProto?: unknown;
}

export function detectInApp(userAgent: string, win: InAppWindow | null = null): InAppBrowser | null {
  const ua = userAgent || '';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV/.test(ua)) return 'facebook';
  if ((win && (win.TelegramWebviewProxy !== undefined || win.TelegramWebviewProxyProto !== undefined)) || /\bTelegram\b/i.test(ua)) {
    return 'telegram';
  }
  return null;
}

/** This page's browser, read once at load; null outside a browser. */
export function currentInApp(): InAppBrowser | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  try {
    return detectInApp(navigator.userAgent, window as unknown as InAppWindow);
  } catch {
    return null;
  }
}

/**
 * Copies `text` (the page's address) to the clipboard. The Clipboard API
 * first; in-app browsers often lack it, so then a selected, off-screen
 * textarea and execCommand('copy'). Resolves false when neither worked.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the old way.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

/**
 * The address to copy: this page with its query (so campaign tags and click
 * ids come along to the real browser, where attribution.ts records them
 * again) and without its fragment.
 */
export function pageLink(location: Pick<Location, 'origin' | 'pathname' | 'search'>): string {
  return location.origin + location.pathname + location.search;
}
