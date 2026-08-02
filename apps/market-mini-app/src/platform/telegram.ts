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

function setColor(name: string, value: string | undefined): void {
  if (value && SAFE_COLOR.test(value)) {
    document.documentElement.style.setProperty(name, value);
  }
}

function applyTheme(webApp: TelegramWebApp): void {
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
  const themeColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--surface-canvas').trim();
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', themeColor || '#fff8ec');
}

export function initializeTelegram(): () => void {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) return () => undefined;
  applyTheme(webApp);
  const listener = () => applyTheme(webApp);
  webApp.onEvent?.('themeChanged', listener);
  webApp.ready();
  webApp.expand();
  webApp.disableVerticalSwipes?.();
  return () => webApp.offEvent?.('themeChanged', listener);
}

export function telegramInitData(): string {
  const live = window.Telegram?.WebApp?.initData ?? '';
  if (live) return live;
  if (import.meta.env.DEV && import.meta.env.VITE_MARKET_DEV_INIT_DATA) {
    return import.meta.env.VITE_MARKET_DEV_INIT_DATA;
  }
  return '';
}

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
