import type { Env } from '../_types';
import {
  assertTelegramAgentsBotIdentity,
  buildTelegramAgentsWebhookUrl,
  requireTelegramAgentsWebhookSecret,
  TelegramClient,
} from '../channels/telegram';
import { TELEGRAM_AGENT_METADATA } from '../channels/telegram/metadata';
import { marketFlag, normalizeMarketWebAppUrl } from '../platform/market';

const MENU_SYNC_INTERVAL_MS = 60 * 60 * 1_000;
const WEB_APP_RELEASE = 'bormi-20260802-4';
const BORMI_AVATAR_URL =
  'https://gptbot-market-mini-app.pages.dev/assets/brand/bormi-bot-avatar.jpg?v=exact';
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
  waitUntil(
    (async () => {
      const identity = await client.getMe();
      if (!identity.ok || !identity.result?.username) {
        throw new Error('identity_unavailable');
      }
      assertTelegramAgentsBotIdentity(
        identity.result.username,
        env.TELEGRAM_AGENTS_BOT_USERNAME ?? '',
      );
      const avatarResponse = await fetch(BORMI_AVATAR_URL);
      if (!avatarResponse.ok) throw new Error('avatar_unavailable');
      const webhookSecret = requireTelegramAgentsWebhookSecret(
        env.TELEGRAM_AGENTS_WEBHOOK_SECRET,
      );
      const webhookUrl = buildTelegramAgentsWebhookUrl('https://gptbot.uz');
      const results = await Promise.all([
        client.setWebhook(
          webhookUrl,
          webhookSecret,
          ['message', 'callback_query'],
        ),
        client.setChatMenuButton(url, 'Bormi'),
        client.setMyProfilePhoto(
          await avatarResponse.blob(),
          'bormi-bot-avatar.jpg',
        ),
        ...TELEGRAM_AGENT_METADATA.flatMap((metadata) => [
          client.setMyName(metadata.name, metadata.languageCode),
          client.setMyCommands(metadata.commands, metadata.languageCode),
          client.setMyDescription(metadata.description, metadata.languageCode),
          client.setMyShortDescription(
            metadata.shortDescription,
            metadata.languageCode,
          ),
        ]),
      ]);
      if (results.some((result) => !result.ok)) {
        throw new Error('configuration_failed');
      }
      const webhook = await client.getWebhookInfo();
      if (
        !webhook.ok
        || webhook.result?.url !== webhookUrl
        || webhook.result?.last_error_message
      ) {
        throw new Error('webhook_verification_failed');
      }
      return results;
    })()
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
