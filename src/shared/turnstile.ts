/// <reference lib="dom" />

export interface TurnstileWidgetOptions {
  sitekey: string;
  action?: string;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'flexible' | 'compact';
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
}

export interface TurnstileApi {
  render: (element: HTMLElement, options: TurnstileWidgetOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SELECTOR = 'script[data-turnstile]';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loader: Promise<TurnstileApi> | null = null;

export function responsiveTurnstileSize(viewportWidth = window.innerWidth): 'flexible' | 'compact' {
  return viewportWidth < 400 ? 'compact' : 'flexible';
}

export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loader) return loader;

  loader = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    const script = existing || document.createElement('script');

    const onLoad = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile API unavailable'));
    };
    const onError = () => reject(new Error('Turnstile script failed to load'));

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!existing) {
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-turnstile', '1');
      document.head.appendChild(script);
    }
  }).catch((error) => {
    loader = null;
    throw error;
  });

  return loader;
}
