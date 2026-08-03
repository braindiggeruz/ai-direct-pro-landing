import type { Locale } from '../types';

interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

interface TelegramWebApp {
  initData: string;
  colorScheme?: 'light' | 'dark';
  themeParams?: TelegramThemeParams;
  isExpanded?: boolean;
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  onEvent?(name: string, listener: () => void): void;
  offEvent?(name: string, listener: () => void): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const SAFE_COLOR = /^#[0-9a-f]{6}$/i;
const TELEGRAM_BRIDGE_WAIT_MS = 1_200;
const TELEGRAM_INIT_DATA_MAX_BYTES = 8_192;

function setColor(name: string, value: string | undefined): void {
  if (value && SAFE_COLOR.test(value)) {
    document.documentElement.style.setProperty(name, value);
  }
}

export type ThemePreference = 'auto' | 'light' | 'dark';

const THEME_KEY = 'bormi.theme';
const TELEGRAM_COLORS = [
  '--tg-bg', '--tg-text', '--tg-hint', '--tg-link', '--tg-button',
  '--tg-button-text', '--tg-secondary-bg', '--tg-header-bg',
  '--tg-accent-text', '--tg-section-bg', '--tg-subtitle', '--tg-destructive',
] as const;

/** The bridge, kept so "Авто" can go back to whatever Telegram is wearing. */
let bridge: TelegramWebApp | undefined;

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'auto';
  } catch {
    // Private mode or a WebView with storage disabled: follow Telegram.
    return 'auto';
  }
}

function paintThemeColor(): void {
  const themeColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--surface-canvas').trim();
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', themeColor || '#f7f6fb');
}

function applyTelegramTheme(webApp: TelegramWebApp): void {
  const theme = webApp.themeParams ?? {};
  document.documentElement.dataset.theme = webApp.colorScheme ?? 'light';
  setColor('--tg-bg', theme.bg_color);
  setColor('--tg-text', theme.text_color);
  setColor('--tg-hint', theme.hint_color);
  setColor('--tg-link', theme.link_color);
  setColor('--tg-button', theme.button_color);
  setColor('--tg-button-text', theme.button_text_color);
  setColor('--tg-secondary-bg', theme.secondary_bg_color);
  setColor('--tg-header-bg', theme.header_bg_color);
  setColor('--tg-accent-text', theme.accent_text_color);
  setColor('--tg-section-bg', theme.section_bg_color);
  setColor('--tg-subtitle', theme.subtitle_text_color);
  setColor('--tg-destructive', theme.destructive_text_color);
  paintThemeColor();
}

/**
 * Paint the app in the chosen theme.
 *
 * "Авто" means Telegram decides, which is the behaviour that shipped. Choosing
 * light or dark has to drop Telegram's colour variables as well as flip the
 * attribute: those variables are what the surfaces actually read, so leaving a
 * light `--tg-bg` in place while asking for dark would produce a half-dark
 * screen instead of a dark one.
 */
function applyTheme(preference: ThemePreference = readThemePreference()): void {
  if (preference === 'auto') {
    if (bridge) {
      applyTelegramTheme(bridge);
      return;
    }
    document.documentElement.dataset.theme = window.matchMedia?.(
      '(prefers-color-scheme: dark)',
    ).matches ? 'dark' : 'light';
    paintThemeColor();
    return;
  }
  for (const name of TELEGRAM_COLORS) {
    document.documentElement.style.removeProperty(name);
  }
  document.documentElement.dataset.theme = preference;
  paintThemeColor();
}

/**
 * Apply a remembered choice immediately, before the bridge is known.
 *
 * "Авто" is left alone here: Telegram's own colours are the right answer and
 * they arrive with the bridge, so guessing first would only cause a flicker.
 */
export function applyStoredTheme(): void {
  const preference = readThemePreference();
  if (preference !== 'auto') applyTheme(preference);
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'auto') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, preference);
  } catch {
    // The choice still applies to this session; it just will not be remembered.
  }
  applyTheme(preference);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitForTelegramBridge(): Promise<TelegramWebApp | undefined> {
  let webApp = window.Telegram?.WebApp;
  if (webApp || (import.meta.env.DEV
    && import.meta.env.VITE_MARKET_DEV_MODE === 'fixture')) {
    return webApp;
  }
  const deadline = performance.now() + TELEGRAM_BRIDGE_WAIT_MS;
  while (!webApp && performance.now() < deadline) {
    await delay(25);
    webApp = window.Telegram?.WebApp;
  }
  return webApp;
}

export async function initializeTelegram(): Promise<() => void> {
  const webApp = await waitForTelegramBridge();
  if (!webApp) {
    // Outside Telegram a stored choice still has to be honoured, and without
    // one the system preference is the only honest default.
    applyTheme();
    return () => undefined;
  }
  bridge = webApp;
  applyTheme();
  const listener = () => applyTheme();
  webApp.onEvent?.('themeChanged', listener);
  webApp.ready();
  webApp.expand();
  webApp.disableVerticalSwipes?.();
  return () => webApp.offEvent?.('themeChanged', listener);
}

/**
 * Telegram puts the signed launch query into tgWebAppData in the URL fragment.
 * The official bridge normally exposes the same value as WebApp.initData. This
 * bounded fallback closes a race on slower Android WebViews; authority still
 * comes only from the server-side HMAC and auth_date validation.
 */
export function telegramInitDataFromUrl(value: string): string {
  try {
    const url = new URL(value);
    const raw = new URLSearchParams(url.hash.replace(/^#/, ''))
      .get('tgWebAppData') ?? '';
    if (
      !raw
      || new TextEncoder().encode(raw).byteLength > TELEGRAM_INIT_DATA_MAX_BYTES
    ) {
      return '';
    }
    return raw;
  } catch {
    return '';
  }
}

export function telegramInitData(): string {
  const live = window.Telegram?.WebApp?.initData ?? '';
  if (live) return live;
  const launch = telegramInitDataFromUrl(window.location.href);
  if (launch) return launch;
  if (import.meta.env.DEV && import.meta.env.VITE_MARKET_DEV_INIT_DATA) {
    return import.meta.env.VITE_MARKET_DEV_INIT_DATA;
  }
  return '';
}

export const TELEGRAM_LAUNCH_LIMITS = {
  bridgeWaitMs: TELEGRAM_BRIDGE_WAIT_MS,
  maxInitDataBytes: TELEGRAM_INIT_DATA_MAX_BYTES,
} as const;

export function haptic(
  result: 'tap' | 'success' | 'warning' | 'error',
): void {
  const feedback = window.Telegram?.WebApp?.HapticFeedback;
  if (!feedback) return;
  if (result === 'tap') feedback.impactOccurred('light');
  else feedback.notificationOccurred(result);
}

export function preferredLocale(): Locale {
  const language = navigator.language.toLowerCase();
  return language.startsWith('uz') ? 'uz' : 'ru';
}
