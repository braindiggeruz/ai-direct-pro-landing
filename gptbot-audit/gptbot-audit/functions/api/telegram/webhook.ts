// Minimal lead-capture Telegram bot for Telegram Ads landing.
// Flow: /start <payload> → menu → (lead | site | manager) → 5-step lead form → admin notification.
// State: in-memory Map per Workers isolate. If recycled, the user just /start over.
// Anti-spam: ≤3 submissions per user / 1h.
//
// Required envs (set in Cloudflare Pages → Settings → Environment variables → Production):
//   TELEGRAM_BOT_TOKEN       (secret_text)  Bot token from @BotFather
// Optional envs:
//   TELEGRAM_ADMIN_CHAT_ID   (plain_text)   Chat ID to receive lead notifications
//   TELEGRAM_MANAGER_URL     (plain_text)   e.g. https://t.me/XGame_changerx
//   GPTBOT_SITE_URL          (plain_text)   Defaults to https://gptbot.uz
//   TELEGRAM_WEBHOOK_SECRET  (secret_text)  Optional shared secret with Telegram (X-Telegram-Bot-Api-Secret-Token)
interface TgEnv {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_ADMIN_CHAT_ID?: string;
  TELEGRAM_MANAGER_URL?: string;
  GPTBOT_SITE_URL?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
}

type Step = 'menu' | 'name' | 'phone' | 'business' | 'channel' | 'task' | 'done';

interface LeadState {
  source: string;
  name?: string;
  phone?: string;
  business?: string;
  channel?: string;
  task?: string;
  step: Step;
  startedAt: number;
}

// In-memory per-isolate state (best-effort; not durable across cold starts).
const state = new Map<number, LeadState>();
const submissions = new Map<number, number[]>();

const SITE_URL_DEFAULT = 'https://gptbot.uz';
const SUBMIT_LIMIT = 3;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

interface Btn { text: string; url?: string; callback_data?: string; request_contact?: boolean }

function siteUrl(env: TgEnv, payload: string | undefined): string {
  const base = (env.GPTBOT_SITE_URL || SITE_URL_DEFAULT).replace(/\/$/, '');
  const camp = (payload || 'tgads_default').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32) || 'tgads_default';
  return `${base}/?utm_source=telegram_ads&utm_medium=bot&utm_campaign=${encodeURIComponent(camp)}`;
}

async function tg(env: TgEnv, method: string, body: Record<string, unknown>): Promise<void> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      // Never log token-bearing URL; only method + status.
      console.error(`tg.${method} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }
  } catch (e) {
    console.error(`tg.${method} network error: ${(e as Error).message}`);
  }
}

function mainMenu(env: TgEnv, chatId: number) {
  const payload = state.get(chatId)?.source || 'tgads_default';
  const rows: Btn[][] = [
    [{ text: '📝 Оставить заявку', callback_data: 'lead_start' }],
    [{ text: '🌐 Открыть сайт', url: siteUrl(env, payload) }],
  ];
  if (env.TELEGRAM_MANAGER_URL) {
    rows.push([{ text: '💬 Написать менеджеру', url: env.TELEGRAM_MANAGER_URL }]);
  }
  return { inline_keyboard: rows };
}

const WELCOME = `Здравствуйте! Я GPTBot — AI-бот для бизнеса.

GPTBot отвечает клиентам в Telegram и Instagram 24/7, собирает контакты и передаёт заявки менеджеру.

Что хотите сделать?`;

const BIZ_OPTS: [string, string][] = [
  ['Салон / клиника', 'salon'],
  ['Учебный центр', 'edu'],
  ['Магазин / e-commerce', 'shop'],
  ['HoReCa', 'horeca'],
  ['Недвижимость', 'realestate'],
  ['Другое', 'other'],
];
const BIZ_LABEL: Record<string, string> = Object.fromEntries(BIZ_OPTS.map(([l, v]) => [v, l]));

const CHAN_OPTS: [string, string][] = [
  ['Telegram', 'tg'],
  ['Instagram', 'ig'],
  ['Сайт', 'web'],
  ['Везде', 'all'],
];
const CHAN_LABEL: Record<string, string> = Object.fromEntries(CHAN_OPTS.map(([l, v]) => [v, l]));

function bizKeyboard() {
  const rows: Btn[][] = [];
  for (let i = 0; i < BIZ_OPTS.length; i += 2) {
    rows.push(BIZ_OPTS.slice(i, i + 2).map(([l, v]) => ({ text: l, callback_data: `biz_${v}` })));
  }
  return { inline_keyboard: rows };
}

function chanKeyboard() {
  return {
    inline_keyboard: [
      CHAN_OPTS.slice(0, 2).map(([l, v]) => ({ text: l, callback_data: `chan_${v}` })),
      CHAN_OPTS.slice(2).map(([l, v]) => ({ text: l, callback_data: `chan_${v}` })),
    ],
  };
}

async function sendWelcome(env: TgEnv, chatId: number, payload: string): Promise<void> {
  state.set(chatId, { source: payload, step: 'menu', startedAt: Date.now() });
  await tg(env, 'sendMessage', { chat_id: chatId, text: WELCOME, reply_markup: mainMenu(env, chatId) });
}

async function askName(env: TgEnv, chatId: number): Promise<void> {
  const s = state.get(chatId) || { source: 'tgads_default', step: 'menu', startedAt: Date.now() };
  s.step = 'name';
  state.set(chatId, s);
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: 'Как вас зовут?',
    reply_markup: { force_reply: true, selective: true },
  });
}

async function askPhone(env: TgEnv, chatId: number): Promise<void> {
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: 'Ваш номер телефона? Можно отправить контактом или написать вручную.',
    reply_markup: {
      keyboard: [[{ text: '📱 Отправить номер', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

async function askBusiness(env: TgEnv, chatId: number): Promise<void> {
  await tg(env, 'sendMessage', { chat_id: chatId, text: '✓', reply_markup: { remove_keyboard: true } });
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: 'Для какого бизнеса нужен GPTBot?',
    reply_markup: bizKeyboard(),
  });
}

async function askChannel(env: TgEnv, chatId: number): Promise<void> {
  await tg(env, 'sendMessage', { chat_id: chatId, text: 'Где чаще всего пишут клиенты?', reply_markup: chanKeyboard() });
}

async function askTask(env: TgEnv, chatId: number): Promise<void> {
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: 'Кратко опишите задачу или боль: например, «клиенты пишут, но менеджер отвечает поздно».',
    reply_markup: { force_reply: true, selective: true },
  });
}

function alreadySubmittedThisHour(userId: number): boolean {
  const now = Date.now();
  const arr = (submissions.get(userId) || []).filter((t) => now - t < SUBMIT_WINDOW_MS);
  submissions.set(userId, arr);
  return arr.length >= SUBMIT_LIMIT;
}

function recordSubmission(userId: number): void {
  const now = Date.now();
  const arr = (submissions.get(userId) || []).filter((t) => now - t < SUBMIT_WINDOW_MS);
  arr.push(now);
  submissions.set(userId, arr);
}

interface TgUser { id: number; username?: string; first_name?: string; last_name?: string }

async function finishLead(env: TgEnv, chatId: number, user: TgUser | undefined): Promise<void> {
  const s = state.get(chatId);
  if (!s) return;
  if (user) recordSubmission(user.id);

  const userTag = user?.username ? `@${user.username}` : user?.id ? `id ${user.id}` : 'unknown';
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || '—';
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const text =
    `🆕 Новая заявка GPTBot\n\n` +
    `Источник: ${s.source}\n` +
    `Имя: ${s.name || '—'}\n` +
    `Телефон: ${s.phone || '—'}\n` +
    `Бизнес: ${BIZ_LABEL[s.business || ''] || s.business || '—'}\n` +
    `Канал заявок: ${CHAN_LABEL[s.channel || ''] || s.channel || '—'}\n` +
    `Задача: ${s.task || '—'}\n\n` +
    `Telegram user: ${userTag} (${fullName})\n` +
    `Дата/время: ${ts}`;

  if (env.TELEGRAM_ADMIN_CHAT_ID) {
    await tg(env, 'sendMessage', { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text });
  } else {
    console.warn('TELEGRAM_ADMIN_CHAT_ID missing — admin notification skipped');
  }

  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: `Спасибо! Заявка принята. Менеджер скоро свяжется с вами.\n\nМожете также сразу открыть сайт:\n${(env.GPTBOT_SITE_URL || SITE_URL_DEFAULT).replace(/\/$/, '')}`,
    reply_markup: mainMenu(env, chatId),
  });

  // Reset for any next interaction; keep source for UTM continuity.
  state.set(chatId, { source: s.source, step: 'menu', startedAt: Date.now() });
}

interface TgUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    from?: TgUser;
    text?: string;
    contact?: { phone_number?: string };
  };
  callback_query?: {
    id: string;
    from: TgUser;
    data?: string;
    message?: { chat: { id: number } };
  };
}

export const onRequestPost: PagesFunction<TgEnv> = async ({ request, env }) => {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN missing');
    return new Response('ok', { status: 200 });
  }
  // Validate optional shared secret.
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const got = request.headers.get('x-telegram-bot-api-secret-token');
    if (got !== env.TELEGRAM_WEBHOOK_SECRET) {
      console.warn('Invalid X-Telegram-Bot-Api-Secret-Token');
      return new Response('forbidden', { status: 401 });
    }
  }

  let upd: TgUpdate;
  try { upd = await request.json() as TgUpdate; } catch { return new Response('ok', { status: 200 }); }

  try {
    // Callback (inline buttons)
    if (upd.callback_query) {
      const cq = upd.callback_query;
      const chatId = cq.message?.chat?.id;
      const data = cq.data || '';
      await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
      if (!chatId) return new Response('ok');

      if (data === 'lead_start') {
        if (alreadySubmittedThisHour(cq.from.id)) {
          await tg(env, 'sendMessage', {
            chat_id: chatId,
            text: 'Мы уже получили вашу заявку 🙏 Менеджер скоро свяжется. Если очень срочно — нажмите «Написать менеджеру».',
            reply_markup: mainMenu(env, chatId),
          });
          return new Response('ok');
        }
        await askName(env, chatId);
      } else if (data.startsWith('biz_')) {
        const s = state.get(chatId);
        if (s) { s.business = data.slice(4); s.step = 'channel'; state.set(chatId, s); }
        await askChannel(env, chatId);
      } else if (data.startsWith('chan_')) {
        const s = state.get(chatId);
        if (s) { s.channel = data.slice(5); s.step = 'task'; state.set(chatId, s); }
        await askTask(env, chatId);
      }
      return new Response('ok');
    }

    const msg = upd.message;
    if (!msg) return new Response('ok');
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    // Commands
    if (text.startsWith('/start')) {
      const raw = text.slice(6).trim();
      const payload = raw.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32) || 'tgads_default';
      await sendWelcome(env, chatId, payload);
      return new Response('ok');
    }
    if (text === '/help') {
      await tg(env, 'sendMessage', {
        chat_id: chatId,
        text:
          'GPTBot — AI-бот для бизнеса.\n\n' +
          'Я помогаю оставить заявку, открыть сайт или связаться с менеджером.\n\n' +
          'Команды:\n' +
          '/start — главное меню\n' +
          '/site — открыть сайт\n' +
          '/manager — написать менеджеру',
        reply_markup: mainMenu(env, chatId),
      });
      return new Response('ok');
    }
    if (text === '/site') {
      const s = state.get(chatId);
      await tg(env, 'sendMessage', { chat_id: chatId, text: siteUrl(env, s?.source) });
      return new Response('ok');
    }
    if (text === '/manager') {
      if (env.TELEGRAM_MANAGER_URL) {
        await tg(env, 'sendMessage', { chat_id: chatId, text: `Напишите менеджеру: ${env.TELEGRAM_MANAGER_URL}` });
      } else {
        await tg(env, 'sendMessage', {
          chat_id: chatId,
          text: 'Менеджер сейчас недоступен. Оставьте заявку — мы свяжемся.',
          reply_markup: mainMenu(env, chatId),
        });
      }
      return new Response('ok');
    }

    // State machine
    const s = state.get(chatId);
    if (!s || s.step === 'menu' || s.step === 'done') {
      await sendWelcome(env, chatId, s?.source || 'tgads_default');
      return new Response('ok');
    }

    if (s.step === 'name') {
      const name = text.slice(0, 60);
      if (!name) return new Response('ok');
      s.name = name; s.step = 'phone'; state.set(chatId, s);
      await askPhone(env, chatId);
      return new Response('ok');
    }

    if (s.step === 'phone') {
      let phone = '';
      if (msg.contact?.phone_number) phone = msg.contact.phone_number;
      else if (text) phone = text.slice(0, 32);
      if (!phone) {
        await tg(env, 'sendMessage', { chat_id: chatId, text: 'Не понял номер. Отправьте контактом или текстом.' });
        return new Response('ok');
      }
      s.phone = phone; s.step = 'business'; state.set(chatId, s);
      await askBusiness(env, chatId);
      return new Response('ok');
    }

    if (s.step === 'task') {
      const task = text.slice(0, 500);
      if (!task) return new Response('ok');
      s.task = task; state.set(chatId, s);
      await finishLead(env, chatId, msg.from);
      return new Response('ok');
    }

    // Unknown state → main menu
    await sendWelcome(env, chatId, s.source);
    return new Response('ok');
  } catch (e) {
    console.error('webhook handler error:', (e as Error).message);
    return new Response('ok', { status: 200 });
  }
};

// Lightweight health check for setWebhook verification / manual probes.
export const onRequestGet: PagesFunction<TgEnv> = async () => {
  return new Response('GPTBot Telegram webhook OK', { status: 200 });
};
