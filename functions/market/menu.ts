import type { Env } from '../_types';
import { TelegramClient } from '../channels/telegram';
import { TELEGRAM_AGENT_METADATA } from '../channels/telegram/metadata';
import { marketFlag, normalizeMarketWebAppUrl } from '../platform/market';

const MENU_SYNC_INTERVAL_MS = 60 * 60 * 1_000;
const WEB_APP_RELEASE = 'bormi-20260802-4';
let nextMenuSyncAt = 0;

export function resolveMarketWebAppUrl(env: Env): string | null {
  const normalized = marketFlag(env.MARKET_MINI_APP_ENABLED)
    ? normalizeMarketWebAppUrl(env.MARKET_MINI_APP_URL)
    : null;
  if (!normalized) return null;
  const url = new URL(normalized);
  // Telegram may resume a cached WebView for an unchanged menu/button URL.
  // A bounded public release marker forces a fresh navigation after a launch
  // repair without carrying any credential or user data.
  url.searchParams.set('v', WEB_APP_RELEASE);
  return url.toString();
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
  const client = new TelegramClient(token);
  const entrySync = [
    client.setChatMenuButton(url, 'Bormi'),
    ...TELEGRAM_AGENT_METADATA.flatMap((metadata) => [
      client.setMyName(metadata.name, metadata.languageCode),
      client.setMyCommands(metadata.commands, metadata.languageCode),
      client.setMyDescription(metadata.description, metadata.languageCode),
      client.setMyShortDescription(
        metadata.shortDescription,
        metadata.languageCode,
      ),
    ]),
  ];
  waitUntil(
    Promise.all(entrySync)
      .then((results) => {
        if (results.some((result) => !result.ok)) {
          nextMenuSyncAt = 0;
          console.error('market.entry:sync_failed');
          return;
        }
        console.log('market.entry:configured');
      })
      .catch(() => {
        nextMenuSyncAt = 0;
        console.error('market.entry:sync_failed');
      }),
  );
  return true;
}

export const MARKET_MENU_SYNC_INTERVAL_MS = MENU_SYNC_INTERVAL_MS;
export const MARKET_WEB_APP_RELEASE = WEB_APP_RELEASE;
