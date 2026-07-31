// Guarded setup for the isolated GPTBot Agents Telegram bot.
//
// Required environment:
//   TELEGRAM_AGENTS_BOT_TOKEN
//   TELEGRAM_AGENTS_WEBHOOK_SECRET
//   TELEGRAM_AGENTS_BOT_USERNAME
//   SITE_URL (defaults to https://gptbot.uz)
//
// Usage:
//   npx tsx scripts/telegram-agents-setup.ts identity
//   npx tsx scripts/telegram-agents-setup.ts status
//   npx tsx scripts/telegram-agents-setup.ts setup
//   npx tsx scripts/telegram-agents-setup.ts setup --apply
//
// This script is never invoked by build/deploy and never prints secret values.
import { pathToFileURL } from 'node:url';

import { TelegramClient } from '../functions/channels/telegram/api';
import {
  assertTelegramAgentsBotIdentity,
  buildTelegramAgentsWebhookUrl,
  requireTelegramAgentsWebhookSecret,
} from '../functions/channels/telegram/setup';

interface SetupEnvironment {
  TELEGRAM_AGENTS_BOT_TOKEN?: string;
  TELEGRAM_AGENTS_WEBHOOK_SECRET?: string;
  TELEGRAM_AGENTS_BOT_USERNAME?: string;
  SITE_URL?: string;
}

const COMMANDS_RU = [
  { command: 'start', description: 'главное меню' },
  { command: 'catalog', description: 'открыть каталог' },
  { command: 'orders', description: 'мои заказы' },
  { command: 'help', description: 'помощь' },
  { command: 'language', description: 'выбрать язык' },
];
const COMMANDS_UZ = [
  { command: 'start', description: 'bosh menyu' },
  { command: 'catalog', description: 'katalogni ochish' },
  { command: 'orders', description: 'buyurtmalarim' },
  { command: 'help', description: 'yordam' },
  { command: 'language', description: 'tilni tanlash' },
];

function requireToken(environment: SetupEnvironment): string {
  if (!environment.TELEGRAM_AGENTS_BOT_TOKEN) {
    throw new Error('telegram agents setup rejected: missing_bot_token');
  }
  return environment.TELEGRAM_AGENTS_BOT_TOKEN;
}

async function verifiedIdentity(
  client: TelegramClient,
  expectedUsername: string | undefined,
): Promise<string> {
  const identity = await client.getMe();
  if (
    !identity.ok
    || !identity.result?.username
    || !Number.isSafeInteger(identity.result.id)
    || identity.result.id <= 0
    || identity.result.is_bot !== true
  ) {
    throw new Error('telegram agents setup rejected: identity_unavailable');
  }
  return assertTelegramAgentsBotIdentity(
    identity.result.username,
    expectedUsername ?? '',
  );
}

async function printStatus(
  client: TelegramClient,
  expectedWebhookUrl: string,
): Promise<void> {
  const info = await client.getWebhookInfo();
  if (!info.ok || !info.result) {
    throw new Error('telegram agents setup rejected: status_unavailable');
  }
  console.log('Telegram Agents webhook status:');
  console.log('  configured:', Boolean(info.result.url));
  console.log('  expected URL matches:', info.result.url === expectedWebhookUrl);
  console.log('  pending updates:', info.result.pending_update_count ?? 0);
  console.log('  last error:', info.result.last_error_message ? 'present' : 'none');
}

export async function runTelegramAgentsSetup(
  environment: SetupEnvironment,
  argv: readonly string[],
): Promise<void> {
  const token = requireToken(environment);
  const client = new TelegramClient(token);
  const command = argv[0] ?? 'status';
  const apply = argv.includes('--apply');
  if (apply && argv.includes('--dry-run')) {
    throw new Error('telegram agents setup rejected: conflicting_modes');
  }

  // getMe and exact username/protected-bot guards always happen before any
  // command or webhook mutation.
  const username = await verifiedIdentity(
    client,
    environment.TELEGRAM_AGENTS_BOT_USERNAME,
  );

  if (command === 'identity') {
    console.log('Telegram Agents identity verified:', `@${username}`);
    return;
  }
  const webhookUrl = buildTelegramAgentsWebhookUrl(
    environment.SITE_URL ?? 'https://gptbot.uz',
  );
  if (command === 'status') {
    await printStatus(client, webhookUrl);
    return;
  }
  if (command !== 'setup') {
    throw new Error('telegram agents setup rejected: unknown_command');
  }
  const secret = requireTelegramAgentsWebhookSecret(
    environment.TELEGRAM_AGENTS_WEBHOOK_SECRET,
  );
  if (!apply) {
    console.log('Telegram Agents setup dry-run: identity and guards passed.');
    console.log('  webhook:', webhookUrl);
    return;
  }

  const commands = await Promise.all([
    client.setMyCommands(COMMANDS_RU),
    client.setMyCommands(COMMANDS_UZ, 'uz'),
  ]);
  if (commands.some((result) => !result.ok)) {
    throw new Error('telegram agents setup rejected: commands_failed');
  }
  const webhook = await client.setWebhook(
    webhookUrl,
    secret,
    ['message', 'callback_query'],
  );
  if (!webhook.ok) {
    throw new Error('telegram agents setup rejected: webhook_failed');
  }
  await printStatus(client, webhookUrl);
  console.log('Telegram Agents setup complete for:', `@${username}`);
}

const direct = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (direct) {
  runTelegramAgentsSetup(process.env, process.argv.slice(2)).catch(() => {
    console.error('Telegram Agents setup failed with a safe error.');
    process.exit(1);
  });
}
