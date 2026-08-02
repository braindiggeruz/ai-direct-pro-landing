import type { Env } from '../_types';
import { TelegramClient } from '../channels/telegram';
import { marketFlag, normalizeMarketWebAppUrl } from '../platform/market';

const MENU_SYNC_INTERVAL_MS = 60 * 60 * 1_000;
let nextMenuSyncAt = 0;

export function resolveMarketWebAppUrl(env: Env): string | null {
  return marketFlag(env.MARKET_MINI_APP_ENABLED)
    ? normalizeMarketWebAppUrl(env.MARKET_MINI_APP_URL)
    : null;
}

export function scheduleMarketMenuSync(
  env: Env,
  waitUntil: (promise: Promise<unknown>) => void,
  now = Date.now(),
): boolean {
  const url = resolveMarketWebAppUrl(env);
  const token = env.TELEGRAM_AGENTS_BOT_TOKEN;
  if (!url || !token || now < nextMenuSyncAt) return false;
  nextMenuSyncAt = now + MENU_SYNC_INTERVAL_MS;
  waitUntil(
    new TelegramClient(token).setChatMenuButton(url, 'GPTBot Market')
      .then((result) => {
        if (!result.ok) {
          nextMenuSyncAt = 0;
          console.error('market.menu:sync_failed');
          return;
        }
        console.log('market.menu:configured');
      })
      .catch(() => {
        nextMenuSyncAt = 0;
        console.error('market.menu:sync_failed');
      }),
  );
  return true;
}

export const MARKET_MENU_SYNC_INTERVAL_MS = MENU_SYNC_INTERVAL_MS;
