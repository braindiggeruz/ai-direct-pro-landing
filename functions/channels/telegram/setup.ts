import {
  normalizeTelegramBotUsername,
} from './deep-link';

export const TELEGRAM_AGENTS_WEBHOOK_PATH = '/api/telegram/agents';

const PROTECTED_BOT_USERNAMES = new Set([
  'aidirectprobot',
  'gptbot_javob_bot',
]);

export type TelegramAgentsSetupCode =
  | 'protected_username'
  | 'username_mismatch'
  | 'missing_expected_username'
  | 'missing_webhook_secret'
  | 'invalid_site_url';

export class TelegramAgentsSetupError extends Error {
  constructor(public readonly code: TelegramAgentsSetupCode) {
    super(`telegram agents setup rejected: ${code}`);
    this.name = 'TelegramAgentsSetupError';
  }
}

export function isProtectedAgentBotUsername(username: string): boolean {
  try {
    return PROTECTED_BOT_USERNAMES.has(
      normalizeTelegramBotUsername(username),
    );
  } catch {
    return false;
  }
}

export function assertTelegramAgentsBotIdentity(
  actualUsername: string,
  expectedUsername: string,
): string {
  let actual: string;
  let expected: string;
  try {
    actual = normalizeTelegramBotUsername(actualUsername);
  } catch {
    throw new TelegramAgentsSetupError('username_mismatch');
  }
  if (!expectedUsername) {
    throw new TelegramAgentsSetupError('missing_expected_username');
  }
  try {
    expected = normalizeTelegramBotUsername(expectedUsername);
  } catch {
    throw new TelegramAgentsSetupError('missing_expected_username');
  }
  if (PROTECTED_BOT_USERNAMES.has(actual)) {
    throw new TelegramAgentsSetupError('protected_username');
  }
  if (actual !== expected) {
    throw new TelegramAgentsSetupError('username_mismatch');
  }
  return actual;
}

export function requireTelegramAgentsWebhookSecret(
  secret: string | undefined,
): string {
  if (!secret) {
    throw new TelegramAgentsSetupError('missing_webhook_secret');
  }
  return secret;
}

export function buildTelegramAgentsWebhookUrl(siteUrl: string): string {
  try {
    const url = new URL(siteUrl);
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.search
      || url.hash
      || (url.pathname !== '/' && url.pathname !== '')
    ) {
      throw new Error('invalid');
    }
    return `${url.origin}${TELEGRAM_AGENTS_WEBHOOK_PATH}`;
  } catch {
    throw new TelegramAgentsSetupError('invalid_site_url');
  }
}
