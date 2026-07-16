// Telegram assistant bot setup / status / webhook management.
//
// Usage (token is read from env, NEVER passed on the CLI, NEVER printed):
//   TELEGRAM_ASSISTANT_BOT_TOKEN=... TELEGRAM_ASSISTANT_WEBHOOK_SECRET=... \
//     npx tsx scripts/telegram-setup.ts setup
//   npx tsx scripts/telegram-setup.ts status
//   npx tsx scripts/telegram-setup.ts identity
//   npx tsx scripts/telegram-setup.ts remove-webhook [--drop]
//
// `setup` configures commands + descriptions (RU default + UZ language_code),
// sets the webhook with secret_token and allowed_updates=[message,callback_query],
// then verifies via getWebhookInfo. Pending updates are preserved unless --drop.

import { isProtectedBotUsername } from '../functions/lib/telegram/config';

const TOKEN = process.env.TELEGRAM_ASSISTANT_BOT_TOKEN || '';
const SECRET = process.env.TELEGRAM_ASSISTANT_WEBHOOK_SECRET || '';
const SITE_URL = (process.env.SITE_URL || 'https://gptbot.uz').replace(/\/+$/, '');
const WEBHOOK_URL = `${SITE_URL}/api/telegram/assistant`;

if (!TOKEN) {
  console.error('✗ TELEGRAM_ASSISTANT_BOT_TOKEN is not set in the environment. Aborting (token is never taken from argv).');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;

async function tg<T = unknown>(method: string, body?: Record<string, unknown>): Promise<{ ok: boolean; result?: T; description?: string }> {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) console.error(`  ✗ ${method}: ${data.description || res.status}`);
  return data;
}

const COMMANDS_RU = [
  { command: 'start', description: 'начать' },
  { command: 'new', description: 'новый запрос' },
  { command: 'lang', description: 'язык' },
  { command: 'plans', description: 'тарифы' },
  { command: 'help', description: 'помощь' },
  { command: 'privacy', description: 'конфиденциальность' },
  { command: 'delete_me', description: 'удалить мои данные' },
];
const COMMANDS_UZ = [
  { command: 'start', description: 'boshlash' },
  { command: 'new', description: 'yangi so‘rov' },
  { command: 'lang', description: 'til' },
  { command: 'plans', description: 'tariflar' },
  { command: 'help', description: 'yordam' },
  { command: 'privacy', description: 'maxfiylik' },
  { command: 'delete_me', description: 'ma’lumotlarimni o‘chirish' },
];

const SHORT_RU = 'Перешлите текст или голосовое — получите готовый ответ на русском или Uzbek Latin.';
const SHORT_UZ = 'Matn yoki ovozli xabar yuboring — ruscha yoki Uzbek Latin tilida tayyor javob oling.';
const DESC_RU = `GPTBot Javob — помощник для текста и голосовых в Telegram.

Перешлите текст или голосовое от клиента, коллеги или руководителя — бот распознает смысл и подготовит ответ в нужном тоне и на нужном языке.

Поддерживает русский, Uzbek Latin и смешанную речь. Аудио не хранится.`;
const DESC_UZ = `GPTBot Javob — Telegram matn va ovozli xabarlari uchun yordamchi.

Mijoz, hamkasb yoki rahbardan kelgan matn yoki ovozli xabarni yuboring — bot mazmunini aniqlab, kerakli ohang va tilda javob tayyorlaydi.

Rus tili, Uzbek Latin va aralash nutqni qo‘llab-quvvatlaydi. Audio saqlanmaydi.`;

interface BotIdentity {
  id: number;
  first_name: string;
  username?: string;
  can_join_groups?: boolean;
  supports_inline_queries?: boolean;
}

async function getBotIdentity(): Promise<BotIdentity | null> {
  const me = await tg<BotIdentity>('getMe');
  return me.ok && me.result ? me.result : null;
}

function printBotIdentity(bot: BotIdentity | null): void {
  console.log(`  bot id:                  ${bot?.id ?? '(unknown)'}`);
  console.log(`  first name:              ${bot?.first_name ?? '(unknown)'}`);
  console.log(`  username:                @${bot?.username ?? '(unknown)'}`);
  console.log(`  can join groups:         ${bot?.can_join_groups ?? '(unknown)'}`);
  console.log(`  supports inline queries: ${bot?.supports_inline_queries ?? '(unknown)'}`);
}

async function printStatus(expectedUrl?: string): Promise<boolean> {
  const bot = await getBotIdentity();
  printBotIdentity(bot);
  const info = await tg<{ url?: string; pending_update_count?: number; last_error_message?: string; last_error_date?: number; max_connections?: number; allowed_updates?: string[] }>('getWebhookInfo');
  if (info.ok && info.result) {
    const r = info.result;
    console.log(`  webhook url:      ${r.url || '(none)'}`);
    console.log(`  pending updates:  ${r.pending_update_count ?? 0}`);
    console.log(`  max connections:  ${r.max_connections ?? '(unset)'}`);
    console.log(`  allowed updates:  ${(r.allowed_updates || []).join(', ') || '(default)'}`);
    console.log(`  last error:       ${r.last_error_message || 'none'}`);
    console.log(`  last error date:  ${r.last_error_date ? new Date(r.last_error_date * 1000).toISOString() : 'none'}`);
    if (expectedUrl === undefined) return true;
    const allowed = new Set(r.allowed_updates || []);
    const urlOk = r.url === expectedUrl;
    const updatesOk = expectedUrl === '' || (allowed.has('message') && allowed.has('callback_query'));
    const errorOk = !r.last_error_message;
    if (!urlOk) console.error(`  ✗ expected webhook URL: ${expectedUrl || '(none)'}`);
    if (!updatesOk) console.error('  ✗ allowed_updates must include message and callback_query');
    if (!errorOk) console.error('  ✗ Telegram reports a webhook error');
    return urlOk && updatesOk && errorOk;
  }
  return false;
}

// The legacy lead-capture bot (Telegram Ads → /api/telegram/webhook) must
// NEVER be repointed to the assistant route: a bot has exactly one webhook,
// so that would silently kill the Ads lead flow. Overriding requires an
// explicit, deliberately scary flag.
const DANGEROUS_OVERRIDE = process.argv.includes('--i-know-this-kills-the-lead-bot');

function guardProtectedBot(username: string): void {
  if (isProtectedBotUsername(username) && !DANGEROUS_OVERRIDE) {
    console.error(`
✗ ОСТАНОВЛЕНО: токен принадлежит @${username} — это рабочий lead-capture бот
  Telegram Ads (/api/telegram/webhook). Перенастройка его webhook на assistant
  route УНИЧТОЖИТ приём заявок из рекламы.

  Для GPTBot Javob создайте ОТДЕЛЬНОГО бота в @BotFather и используйте его токен.
  Webhook @${username} не изменён.
`);
    process.exit(1);
  }
}

async function identity(): Promise<BotIdentity> {
  const bot = await getBotIdentity();
  if (!bot || !bot.username) {
    console.error('✗ getMe failed or returned no username — check the token.');
    process.exit(1);
  }
  const username = bot.username;
  guardProtectedBot(username);
  printBotIdentity(bot);
  return bot;
}

async function setup(): Promise<void> {
  if (!SECRET) {
    console.error('✗ TELEGRAM_ASSISTANT_WEBHOOK_SECRET is not set. It must match the Cloudflare secret, or Telegram calls will be rejected. Aborting.');
    process.exit(1);
  }
  console.log('→ Verifying bot…');
  const bot = await identity();
  const username = bot.username!;

  console.log('→ Checking production endpoint…');
  try {
    const probe = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (probe.status !== 401) {
      console.error(`✗ ${WEBHOOK_URL} responded ${probe.status} without a secret header; expected 401. Deploy/configure the endpoint before setting the webhook.`);
      process.exit(1);
    }
    console.log('  ✓ endpoint is reachable and requires the Telegram secret header');
  } catch {
    console.error(`✗ ${WEBHOOK_URL} is unreachable — deploy first, then set the webhook.`);
    process.exit(1);
  }

  console.log('→ Setting commands (RU default + UZ)…');
  const commandResults = await Promise.all([
    tg('setMyCommands', { commands: COMMANDS_RU }),
    tg('setMyCommands', { commands: COMMANDS_UZ, language_code: 'uz' }),
  ]);
  if (commandResults.some((r) => !r.ok)) { console.error('✗ Command setup failed. Webhook was not changed.'); process.exit(1); }

  console.log('→ Setting descriptions…');
  const descriptionResults = await Promise.all([
    tg('setMyShortDescription', { short_description: SHORT_RU }),
    tg('setMyShortDescription', { short_description: SHORT_UZ, language_code: 'uz' }),
    tg('setMyDescription', { description: DESC_RU }),
    tg('setMyDescription', { description: DESC_UZ, language_code: 'uz' }),
  ]);
  if (descriptionResults.some((r) => !r.ok)) { console.error('✗ Description setup failed. Webhook was not changed.'); process.exit(1); }

  console.log(`→ Setting webhook → ${WEBHOOK_URL}`);
  const set = await tg('setWebhook', {
    url: WEBHOOK_URL,
    secret_token: SECRET,
    allowed_updates: ['message', 'callback_query'],
    max_connections: 40,
    // Pending updates preserved by default.
  });
  if (!set.ok) { console.error('✗ setWebhook failed.'); process.exit(1); }
  console.log('  ✓ webhook set');

  console.log('→ Verifying…');
  if (!await printStatus(WEBHOOK_URL)) { console.error('✗ Webhook verification failed.'); process.exit(1); }
  console.log('\n✓ Setup complete. Bot username:', `@${username}`);
  console.log('  Site CTA: set VITE_TELEGRAM_BOT_USERNAME =', username, '(no @) and rebuild.');
}

async function removeWebhook(): Promise<void> {
  const drop = process.argv.includes('--drop');
  console.log(`→ Deleting webhook${drop ? ' (dropping pending updates)' : ''}…`);
  const r = await tg('deleteWebhook', { drop_pending_updates: drop });
  console.log(r.ok ? '  ✓ webhook removed' : '  ✗ failed');
  if (r.ok && !await printStatus('')) process.exit(1);
}

const cmd = process.argv[2] || 'status';
(async () => {
  console.log(`Telegram assistant — ${cmd}\n`);
  if (cmd === 'setup') await setup();
  else if (cmd === 'identity') await identity();
  else if (cmd === 'status') { if (!await printStatus(WEBHOOK_URL)) process.exit(1); }
  else if (cmd === 'remove-webhook') await removeWebhook();
  else { console.error(`Unknown command "${cmd}". Use: setup | identity | status | remove-webhook`); process.exit(1); }
})().catch((e) => { console.error('Fatal:', (e as Error).message); process.exit(1); });
