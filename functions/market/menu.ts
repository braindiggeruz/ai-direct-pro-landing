import type { Env } from '../_types';
import { TelegramClient } from '../channels/telegram';
import { TELEGRAM_AGENT_METADATA } from '../channels/telegram/metadata';
import { marketFlag, normalizeMarketWebAppUrl } from '../platform/market';

const MENU_SYNC_INTERVAL_MS = 60 * 60 * 1_000;
const WEB_APP_RELEASE = 'bormi-20260802-3';
const PROFILE_PHOTO_URL =
  'https://32d3811a.gptbot-market-mini-app.pages.dev/assets/brand/bormi-bot-avatar.jpg';
let nextMenuSyncAt = 0;
let profilePhotoSyncStarted = false;

async function syncBormiProfilePhoto(client: TelegramClient) {
  try {
    const response = await fetch(PROFILE_PHOTO_URL, {
      headers: { Accept: 'image/jpeg' },
    });
    if (
      !response.ok
      || response.headers.get('Content-Type')?.split(';')[0] !== 'image/jpeg'
    ) throw new Error('invalid_profile_photo_response');
    const result = await client.setMyProfilePhoto(await response.blob());
    if (result.ok) console.log('market.entry:photo_configured');
    else console.error('market.entry:photo_sync_failed');
    return result;
  } catch {
    profilePhotoSyncStarted = false;
    console.error('market.entry:photo_sync_failed');
    return { ok: false } as const;
  }
}

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
      client.setMyDescription(metadata.description, metadata.languageCode),
      client.setMyShortDescription(
        metadata.shortDescription,
        metadata.languageCode,
      ),
    ]),
  ];
  if (!profilePhotoSyncStarted) {
    profilePhotoSyncStarted = true;
    entrySync.push(syncBormiProfilePhoto(client));
  }
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
