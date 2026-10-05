// The Telegram end of the web → Telegram handoff: `/start w_<token>`.
//
// Run: node --import tsx --test tests/telegram-web-handoff.test.ts
//
// This path is reached by strangers typing text into a live product, so the
// properties worth pinning are the ones that either lose the person or leak
// something:
//   - a real token greets as a continuation, in the language of the WEB
//     session, and tells the owner somebody arrived;
//   - a replayed, expired, invented or absent token still greets normally —
//     the shipped `/start` behaviour is untouched;
//   - a payload that is not ours never reaches the database at all;
//   - nothing stored against the token is ever echoed back into the chat, so
//     a guessed token buys the guesser nothing;
//   - the transcript is not forwarded on this route, and the owner's alert
//     says so rather than looking broken.
//
// No network: global fetch is stubbed for the Bot API. D1 is real SQLite with
// the production DDL of both schemas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { SqliteD1 } from './helpers/sqlite-d1';
import { ensureTelegramSchema } from '../functions/lib/telegram/schema';
import { ensureSchema } from '../functions/lib/gpt-chat/schema';
import { ensureBillingSchema } from '../functions/lib/gpt-chat/billing-schema';
import { freeChain, resolveConfig } from '../functions/lib/gpt-chat/config';
import { handleUpdate } from '../functions/lib/telegram/handler';
import { pseudoUser } from '../functions/lib/telegram/store';
import { resolveTelegramConfig } from '../functions/lib/telegram/config';
import { TelegramClient } from '../functions/lib/telegram/client';
import { CHOOSE_LANG, ERR_PROVIDER, HANDOFF_WELCOME, SITE_WELCOME, START } from '../functions/lib/telegram/i18n';
import {
  buildArrivalAlert,
  claimWebHandoff,
  countSessionMessages,
  describeIdentity,
  isWebHandoffPayload,
  type ArrivalIdentity,
  type WebArrival,
} from '../functions/lib/telegram/web-handoff';
import { mintHandoff, resolveHandoffConfig } from '../functions/lib/gpt-chat/handoff';
import { strings } from '../src/gpt-chat/i18n';
import { _resetNotifyWarning } from '../functions/lib/gpt-chat/notify';
import { consumeRateLimit, HOUR_MS } from '../functions/lib/gpt-chat/rate-limit';

// ── harness ─────────────────────────────────────────────────────────────────

const USER_CHAT = 555_001;
const OWNER_CHAT = '-100777';

async function database(): Promise<SqliteD1> {
  const db = new SqliteD1();
  await ensureTelegramSchema(db.asD1());
  await ensureSchema(db.asD1());
  return db;
}

interface TgCall {
  method: string;
  body: Record<string, unknown>;
}

/** Records every Bot API call; nothing leaves the process. */
function installFetch(calls: TgCall[]): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = url.split('/').pop() || '';
    calls.push({ method, body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
    return new Response(JSON.stringify({ ok: true, result: { message_id: calls.length } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  return () => { globalThis.fetch = original; };
}

const NOTIFY_ENV = {
  OPENROUTER_API_KEY: 'test',
  TELEGRAM_ASSISTANT_BOT_TOKEN: 'assistant-token',
  // A 32-byte salt whose SINCE has passed: pseudonyms are the salted v2.
  GPT_HASH_SALT: randomBytes(32).toString('hex'),
  GPT_HASH_SALT_SINCE: '2026-01-01T00:00:00Z',
  GPT_NOTIFY_BOT_TOKEN: 'notify-token',
  GPT_NOTIFY_CHAT_ID: OWNER_CHAT,
};

function deps(db: SqliteD1, envOver: Record<string, unknown> = {}) {
  const env = { ...NOTIFY_ENV, ...envOver } as never;
  return { env, db: db.asD1(), cfg: resolveTelegramConfig(env), tg: new TelegramClient('assistant-token') };
}

/** Mint a real handoff the way POST /api/gpt/handoff does. */
async function mint(
  db: SqliteD1,
  over: { locale?: 'ru' | 'uz'; sessionId?: string | null; pageUrl?: string | null; intent?: string | null; ttlMinutes?: string; now?: Date } = {},
): Promise<string> {
  const cfg = resolveHandoffConfig({
    GPT_HANDOFF_BOT_USERNAME: 'gptbotuz_bot',
    ...(over.ttlMinutes ? { GPT_HANDOFF_TTL_MINUTES: over.ttlMinutes } : {}),
  } as never);
  const minted = await mintHandoff(
    db.asD1(),
    cfg,
    {
      sessionId: over.sessionId === undefined ? 'sess_web_1' : over.sessionId,
      locale: over.locale ?? 'uz',
      pageUrl: over.pageUrl === undefined ? '/uz/gpt-uzbek-tilida/' : over.pageUrl,
      intent: over.intent ?? null,
    },
    over.now ?? new Date(),
  );
  return minted.payload;
}

function seedConversation(db: SqliteD1, sessionId: string, turns: Array<['user' | 'assistant', string]>): void {
  turns.forEach(([role, content], i) => {
    db.sqlite
      .prepare('INSERT INTO gpt_messages (id, session_id, role, content, created_at) VALUES (?,?,?,?,?)')
      .run(`m${i}`, sessionId, role, content, new Date(Date.UTC(2026, 8, 4, 10, i)).toISOString());
  });
}

function startUpdate(payload: string, over: Record<string, unknown> = {}) {
  return {
    update_id: Math.floor(Math.random() * 1e9),
    message: {
      chat: { id: USER_CHAT, type: 'private' },
      from: { id: USER_CHAT, language_code: 'ru', username: 'azizbek', first_name: 'Aziz', ...over },
      text: payload ? `/start ${payload}` : '/start',
    },
  } as never;
}

const sends = (calls: TgCall[]) => calls.filter((c) => c.method === 'sendMessage');
const toUser = (calls: TgCall[]) => sends(calls).filter((c) => c.body.chat_id === USER_CHAT);
const toOwner = (calls: TgCall[]) => sends(calls).filter((c) => String(c.body.chat_id) === OWNER_CHAT);

const IDENTITY: ArrivalIdentity = { userId: 42, username: 'azizbek', firstName: 'Aziz', pseudo: 'pseudo-key' };

// ── The shape gate ──────────────────────────────────────────────────────────

test('only a website-minted payload is treated as a handoff', () => {
  assert.equal(isWebHandoffPayload(`w_${'a'.repeat(32)}`), true);
  for (const bad of [
    'site_ru', 'site_uz', 'share', 'direct', '',
    `W_${'a'.repeat(32)}`,            // wrong case on the prefix
    `w_${'A'.repeat(32)}`,            // uppercase hex is not what we mint
    `w_${'a'.repeat(31)}`,            // short
    `w_${'a'.repeat(33)}`,            // long
    `w_${'a'.repeat(32)} OR 1=1`,     // classic probe
    "w_'; DROP TABLE gpt_handoffs;--",
    `w_${'a'.repeat(32)}\n/start`,
  ]) {
    assert.equal(isWebHandoffPayload(bad), false, `must reject: ${JSON.stringify(bad)}`);
  }
});

test('a payload that is not ours never reaches the database', async () => {
  const db = await database();
  let prepared = 0;
  const spy = { prepare: (sql: string) => { prepared += 1; return db.prepare(sql); } } as unknown as D1Database;
  for (const bad of ['site_uz', 'share', 'w_nothex', `w_${'a'.repeat(31)}`]) {
    assert.equal(await claimWebHandoff(spy, bad, IDENTITY), null);
  }
  assert.equal(prepared, 0, 'the shape gate runs before any lookup');
});

// ── The happy path ──────────────────────────────────────────────────────────

test('a valid token continues the conversation in the web session language', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    seedConversation(db, 'sess_web_1', [
      ['user', 'Salom, bot qancha turadi?'],
      ['assistant', 'Narxlar sahifasida bor.'],
      ['user', 'Do‘kon uchun kerak.'],
    ]);
    const payload = await mint(db, { locale: 'uz' });

    // The Telegram client says ru; the WEB session said uz and must win.
    await handleUpdate(deps(db), startUpdate(payload, { language_code: 'ru' }));

    const user = toUser(calls);
    assert.equal(user.length, 2, 'continuation greeting + the usual language keyboard');
    assert.equal(user[0].body.text, HANDOFF_WELCOME.uz);
    assert.notEqual(user[0].body.text, START.uz, 'not the cold-start greeting');
    assert.ok(user[1].body.reply_markup, 'language choice still offered');

    assert.equal(db.value('SELECT locale FROM telegram_users WHERE telegram_user_id = ?', USER_CHAT), 'uz');
    const events = db.rows<{ event: string; meta_json: string }>('SELECT event, meta_json FROM telegram_events');
    assert.ok(events.some((e) => e.event === 'javob_bot_start' && e.meta_json.includes('web_handoff')));
    assert.ok(events.some((e) => e.event === 'javob_handoff_claimed'));
    assert.ok(!events.some((e) => e.meta_json.includes(String(USER_CHAT))), 'no raw Telegram id in analytics');

    // Every stored key of this person is the salted pseudonym (h2_, 32 chars).
    const pseudo = await pseudoUser(USER_CHAT, deps(db).cfg);
    assert.match(pseudo, /^h2_[0-9a-f]{29}$/);
    assert.equal(db.value('SELECT claimed_by FROM gpt_handoffs'), pseudo);
    assert.deepEqual(
      [...new Set(db.rows<{ pseudo_user: string }>('SELECT pseudo_user FROM telegram_events').map((e) => e.pseudo_user))],
      [pseudo],
    );
    const claimed = db.rows<{ payload_json: string }>("SELECT payload_json FROM gpt_events WHERE event_name='GPTChatHandoffClaimed'");
    assert.equal(JSON.parse(claimed[0].payload_json).claimedBy, pseudo);
  } finally { restore(); }
});

test('the greeting never echoes anything stored against the token', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    seedConversation(db, 'sess_secret', [['user', 'Мой номер 998901234567']]);
    const payload = await mint(db, { locale: 'ru', sessionId: 'sess_secret', pageUrl: '/ru/gpt-chat/' });
    await handleUpdate(deps(db), startUpdate(payload));
    const shown = toUser(calls).map((c) => String(c.body.text)).join('\n');
    for (const leak of ['sess_secret', '/ru/gpt-chat/', '998901234567']) {
      assert.ok(!shown.includes(leak), `greeting must not contain ${leak}`);
    }
  } finally { restore(); }
});

test('the owner is told once, with context and a way to reply', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    seedConversation(db, 'sess_web_1', [
      ['user', 'Salom'], ['assistant', 'Assalomu alaykum'], ['user', 'Narx?'], ['assistant', 'Sahifada'],
    ]);
    await handleUpdate(deps(db), startUpdate(await mint(db, { locale: 'uz' })));

    const owner = toOwner(calls);
    assert.equal(owner.length, 1);
    const text = String(owner[0].body.text);
    assert.match(text, /узбекский/);
    assert.match(text, /\/uz\/gpt-uzbek-tilida\//);
    assert.match(text, /4 \(из них от человека: 2\)/);
    assert.match(text, /@azizbek/);
    assert.match(text, /id 555001/);
    assert.match(text, /sess_web_1/);
    assert.equal(owner[0].body.parse_mode, 'HTML');
    assert.ok(!text.includes('Salom'), 'the transcript is not forwarded on this route');

    const rows = db.rows<{ event_name: string }>('SELECT event_name FROM gpt_events');
    assert.deepEqual(rows.map((r) => r.event_name), ['GPTChatHandoffClaimed', 'GPTChatHandoffNotified']);
  } finally { restore(); }
});

// ── Every unhappy path still greets ─────────────────────────────────────────

test('a replayed token greets normally and does not ping the owner twice', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    const payload = await mint(db, { locale: 'uz' });
    await handleUpdate(deps(db), startUpdate(payload));
    calls.length = 0;

    await handleUpdate(deps(db), startUpdate(payload));
    const user = toUser(calls);
    assert.equal(user[0].body.text, START.uz, 'the ordinary cold start');
    assert.equal(toOwner(calls).length, 0, 'a replay is worth nothing');
    assert.equal(db.value('SELECT COUNT(*) FROM gpt_events WHERE event_name = ?', 'GPTChatHandoffClaimed'), 1);
  } finally { restore(); }
});

test('an expired token greets normally', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    const payload = await mint(db, {
      locale: 'uz',
      ttlMinutes: '5',
      now: new Date(Date.now() - 60 * 60 * 1000),
    });
    await handleUpdate(deps(db), startUpdate(payload));
    assert.equal(toUser(calls)[0].body.text, START.ru, 'falls back to the Telegram client language');
    assert.equal(toOwner(calls).length, 0);
    assert.equal(db.value('SELECT claimed_at FROM gpt_handoffs'), null, 'an expired row is not consumed');
  } finally { restore(); }
});

test('an unknown token gains nothing and is indistinguishable from no token', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    await handleUpdate(deps(db), startUpdate(`w_${'b'.repeat(32)}`));
    const guessed = toUser(calls).map((c) => c.body.text);
    calls.length = 0;
    await handleUpdate(deps(db), startUpdate(''));
    assert.deepEqual(guessed, toUser(calls).map((c) => c.body.text));
    assert.equal(toOwner(calls).length, 0);
  } finally { restore(); }
});

test('plain /start and a malformed payload keep the shipped behaviour', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    await handleUpdate(deps(db), startUpdate(''));
    await handleUpdate(deps(db), startUpdate('site_uz'));
    await handleUpdate(deps(db), startUpdate('w_not-a-token'));

    const user = toUser(calls);
    assert.equal(user.length, 6, 'two messages per /start, as before');
    // '' and an invalid w_ payload are the shipped cold start, byte for byte.
    // 'site_uz' is the website's public bot link — the one every consumer
    // "continue in Telegram" fallback now uses — so it greets as an arrival
    // from the site, in the site's language, and then offers the language
    // keyboard like every /start does.
    assert.equal(user[0].body.text, START.ru);
    assert.equal(user[1].body.text, CHOOSE_LANG.ru);
    assert.equal(user[2].body.text, SITE_WELCOME.uz);
    assert.equal(user[3].body.text, CHOOSE_LANG.uz);
    assert.ok(user[3].body.reply_markup, 'language choice still offered');
    // The malformed payload takes the unchanged cold-start path, which has
    // always greeted in the STORED locale — and the site_uz arrival just
    // stored uz for this person, exactly as a claimed w_ handoff does. For a
    // person whose stored locale is ru it is START.ru, as before (below).
    assert.equal(user[4].body.text, START.uz);
    assert.equal(user[5].body.text, CHOOSE_LANG.uz);
    assert.equal(toOwner(calls).length, 0);

    const sources = db
      .rows<{ meta_json: string }>("SELECT meta_json FROM telegram_events WHERE event = 'javob_bot_start'")
      .map((r) => JSON.parse(r.meta_json).source);
    assert.deepEqual(sources, ['direct', 'site_uz', 'direct']);

    // A different person, stored locale ru: '' and an invalid w_ payload are
    // still exactly START.ru + the language keyboard.
    calls.length = 0;
    const other = { id: 555_002, language_code: 'ru' };
    const plain = startUpdate('', other) as unknown as { message: { chat: { id: number } } };
    plain.message.chat.id = 555_002;
    const junk = startUpdate('w_not-a-token', other) as unknown as { message: { chat: { id: number } } };
    junk.message.chat.id = 555_002;
    await handleUpdate(deps(db), plain as never);
    await handleUpdate(deps(db), junk as never);
    const texts = sends(calls).filter((c) => c.body.chat_id === 555_002).map((c) => c.body.text);
    assert.deepEqual(texts, [START.ru, CHOOSE_LANG.ru, START.ru, CHOOSE_LANG.ru]);
  } finally { restore(); }
});

test('/start site_ru greets in the site language, not the Telegram client language', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    await handleUpdate(deps(db), startUpdate('site_ru', { language_code: 'uz' }));

    const user = toUser(calls);
    assert.equal(user.length, 2);
    assert.equal(user[0].body.text, SITE_WELCOME.ru);
    assert.equal(user[1].body.text, CHOOSE_LANG.ru);
    assert.ok(user[1].body.reply_markup, 'language choice still offered');
    assert.equal(db.value('SELECT locale FROM telegram_users WHERE telegram_user_id = ?', USER_CHAT), 'ru');
    assert.equal(toOwner(calls).length, 0, 'a contextless arrival pings nobody');

    const events = db.rows<{ event: string; meta_json: string }>("SELECT event, meta_json FROM telegram_events WHERE event = 'javob_bot_start'");
    assert.equal(events.length, 1);
    assert.deepEqual(JSON.parse(events[0].meta_json), { locale: 'ru', source: 'site_ru' });
  } finally { restore(); }
});

test('the site welcome never claims the web conversation was carried over', () => {
  for (const locale of ['ru', 'uz'] as const) {
    const text = SITE_WELCOME[locale];
    assert.notEqual(text, HANDOFF_WELCOME[locale]);
    assert.match(text, /gptbot\.uz/);
    assert.doesNotMatch(text, /продолжаем разговор|davom ettiramiz|перенес|ko‘chir/i);
    assert.doesNotMatch(text, /ChatGPT|OpenAI/);
    assert.doesNotMatch(text, /\d/, 'no quota number the owner has not decided');
  }
  assert.ok(!SITE_WELCOME.uz.includes("'"), 'Uzbek copy uses letter apostrophes');
});

test('both welcomes say what the bot really does and where ordinary questions go', () => {
  // Every text goes to the Javob prompt, which writes a reply to the other
  // side of a forwarded message: a welcome that invites questions misleads.
  assert.match(SITE_WELCOME.ru, /На обычные вопросы отвечает AI-чат на сайте gptbot\.uz\./);
  assert.match(SITE_WELCOME.uz, /Oddiy savollarga gptbot\.uz saytidagi AI-chat javob beradi\./);
  // Only the chat's limit card leads to HANDOFF_WELCOME: it does not send the
  // person straight back to the chat that just refused them.
  assert.match(HANDOFF_WELCOME.ru, /На обычные вопросы этот бот не отвечает: их можно задать AI-чату на сайте gptbot\.uz, когда там вернутся бесплатные сообщения\./);
  assert.match(HANDOFF_WELCOME.uz, /Bu bot oddiy savollarga javob bermaydi: ularni bepul xabarlar qaytgach gptbot\.uz saytidagi AI-chatga berishingiz mumkin\./);
  for (const welcome of [SITE_WELCOME, HANDOFF_WELCOME]) {
    assert.match(welcome.ru, /перешлите сюда сообщение или голосовое, на которое нужно ответить/);
    assert.match(welcome.uz, /javob berish kerak bo‘lgan xabar yoki ovozli xabarni shu yerga yuboring/);
    for (const text of [welcome.ru, welcome.uz]) {
      assert.doesNotMatch(text, /вопрос своими словами|savolingizni|продолжаем разговор|davom ettir/i, text);
      assert.doesNotMatch(text, /ChatGPT|OpenAI|\d/, text);
      assert.ok(!text.includes("'"), 'letter apostrophes only');
    }
  }
  // A claimed handoff still says the site conversation stayed on the site.
  assert.match(HANDOFF_WELCOME.ru, /Переписку с сайта я сюда не переношу\./);
  assert.match(HANDOFF_WELCOME.uz, /Saytdagi yozishmalarni bu yerga ko‘chirmayman\./);
});

test('the limit card and the bot it leads to say the same: a reply to a forwarded message, not this chat continued', () => {
  // The card (src/gpt-chat/i18n.ts, AiLimitTelegram) is the only way to
  // HANDOFF_WELCOME; a card that promised to carry on the conversation would
  // meet a bot that says it does not answer ordinary questions.
  const forwarded = { ru: /ответ на сообщение, которое вы ему перешлёте/, uz: /siz uzatgan xabarga javob tayyorlaydi/ };
  const notQuestions = { ru: /На обычные вопросы этот бот не отвечает/, uz: /Bu bot oddiy savollarga javob bermaydi/ };
  const notStraightBack = { ru: /когда там вернутся бесплатные сообщения/, uz: /bepul xabarlar qaytgach/ };
  for (const locale of ['ru', 'uz'] as const) {
    const t = strings(locale);
    for (const text of [t.capTelegramCta, t.capTelegramNote])
      assert.doesNotMatch(text, /Продолжить|продолжить|davom ettir|сразу|hoziroq/, text);
    assert.match(t.capTelegramCta, /Подготовить ответ|javob tayyorlash/);
    assert.match(t.capTelegramNote, forwarded[locale]);
    assert.match(HANDOFF_WELCOME[locale], notQuestions[locale]);
    assert.match(HANDOFF_WELCOME[locale], notStraightBack[locale]);
    for (const text of [t.capTelegramCta, t.capTelegramNote]) assert.ok(!text.includes("'"), 'letter apostrophes only');
  }
});

test('a limit-card arrival is greeted, recorded, and never spends the owner-alert budget', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    const payload = await mint(db, { locale: 'ru', intent: 'daily_limit' });
    await handleUpdate(deps(db), startUpdate(payload));

    assert.equal(toUser(calls)[0].body.text, HANDOFF_WELCOME.ru, 'the person gets the continuation greeting');
    assert.equal(toOwner(calls).length, 0, 'the owner is not pinged for a consumer who ran out of free messages');
    const rows = db.rows<{ event_name: string; payload_json: string }>('SELECT event_name, payload_json FROM gpt_events ORDER BY created_at, rowid');
    assert.deepEqual(rows.map((r) => r.event_name), ['GPTChatHandoffClaimed', 'GPTChatHandoffNotifySkipped']);
    assert.match(rows[1].payload_json, /consumer_intent/);
    assert.equal(
      db.value("SELECT COUNT(*) FROM gpt_rate_limits WHERE action = 'lead_notify'"),
      0,
      'the shared lead_notify/owner ceiling was not touched',
    );
  } finally { restore(); }
});

test('hourly and monthly limit arrivals are skipped the same way; an offer arrival still alerts', async () => {
  for (const intent of ['hourly_limit', 'monthly_limit']) {
    const db = await database();
    const calls: TgCall[] = []; const restore = installFetch(calls);
    try {
      await handleUpdate(deps(db), startUpdate(await mint(db, { locale: 'uz', intent })));
      assert.equal(toOwner(calls).length, 0, intent);
      assert.equal(db.value("SELECT COUNT(*) FROM gpt_events WHERE event_name = 'GPTChatHandoffNotifySkipped' AND payload_json LIKE '%consumer_intent%'"), 1, intent);
    } finally { restore(); }
  }
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    await handleUpdate(deps(db), startUpdate(await mint(db, { locale: 'ru', intent: 'offer' })));
    assert.equal(toOwner(calls).length, 1, 'an explicit offer arrival is a lead and still reaches the owner');
  } finally { restore(); }
});

test('a D1 failure during the claim costs the person nothing', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    const payload = await mint(db, { locale: 'uz' });
    // Everything works except the one read the claim depends on.
    const broken = {
      prepare: (sql: string) => (/FROM gpt_handoffs/.test(sql)
        ? { bind: () => ({ first: async () => { throw new Error('d1 down'); } }) }
        : db.prepare(sql)),
    } as unknown as D1Database;
    await handleUpdate({ ...deps(db), db: broken }, startUpdate(payload));
    assert.equal(toUser(calls)[0].body.text, START.ru);
    assert.equal(toOwner(calls).length, 0);
  } finally { restore(); }
});

// ── Notification behaviour ──────────────────────────────────────────────────

test('with no notification credentials the person is still greeted', async () => {
  const db = await database();
  _resetNotifyWarning();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    const env = { OPENROUTER_API_KEY: 'test', TELEGRAM_ASSISTANT_BOT_TOKEN: 'assistant-token', GPT_HASH_SALT: 'salt' };
    const payload = await mint(db, { locale: 'ru' });
    await handleUpdate({ ...deps(db), env: env as never }, startUpdate(payload));

    assert.equal(toUser(calls)[0].body.text, HANDOFF_WELCOME.ru);
    assert.equal(toOwner(calls).length, 0);
    const rows = db.rows<{ event_name: string; payload_json: string }>('SELECT event_name, payload_json FROM gpt_events');
    assert.ok(rows.some((r) => r.event_name === 'GPTChatHandoffNotifySkipped' && r.payload_json.includes('unconfigured')));
  } finally { restore(); }
});

test('arrivals share the owner-alert ceiling with lead alerts', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    // The lead endpoint has already spent the hour's budget on this phone.
    for (let i = 0; i < 3; i += 1) {
      await consumeRateLimit(db.asD1(), 'lead_notify', 'owner', { limit: 2, windowMs: HOUR_MS });
    }
    const payload = await mint(db, { locale: 'ru' });
    await handleUpdate({ ...deps(db), env: { ...NOTIFY_ENV, GPT_OWNER_NOTIFY_MAX_PER_HOUR: '2' } as never }, startUpdate(payload));

    assert.equal(toUser(calls)[0].body.text, HANDOFF_WELCOME.ru, 'the person is unaffected');
    assert.equal(toOwner(calls).length, 0, 'the phone stays quiet');
    const rows = db.rows<{ payload_json: string }>("SELECT payload_json FROM gpt_events WHERE event_name = 'GPTChatHandoffNotifySkipped'");
    assert.equal(rows.length, 1);
    assert.match(rows[0].payload_json, /muted/);
  } finally { restore(); }
});

// ── Pure rendering ──────────────────────────────────────────────────────────

const ARRIVAL: WebArrival = {
  sessionId: 'sess_1',
  locale: 'ru',
  pageUrl: '/ru/gpt-chat/',
  intent: 'бот для магазина',
  createdAt: '2026-09-04T19:41:07.000Z',
  claimedAt: '2026-09-04T19:44:31.000Z',
  messageCount: 6,
  personMessageCount: 3,
};

test('the owner alert names the source, the volume and how to reply', () => {
  const rendered = buildArrivalAlert(ARRIVAL, IDENTITY);
  assert.match(rendered.text, /перешёл из AI-чата/);
  assert.match(rendered.text, /2026-09-04 19:41 UTC/);
  assert.match(rendered.text, /2026-09-04 19:44 UTC/);
  assert.match(rendered.text, /бот для магазина/);
  assert.match(rendered.text, /Переписку с сайта бот сюда не переносит/);
  assert.deepEqual(rendered.keyboard, [[{ text: 'Написать в Telegram', url: 'https://t.me/azizbek' }]]);
});

test('a person with no username still produces a deliverable alert', () => {
  const rendered = buildArrivalAlert(ARRIVAL, { userId: 42, firstName: 'Aziz', pseudo: 'p' });
  assert.equal(rendered.keyboard, undefined, 'no button rather than an unresolvable one');
  assert.match(rendered.text, /id 42/);
  assert.equal(describeIdentity({ userId: 7, pseudo: 'p' }), 'id 7');
});

test('a hostile display name cannot inject markup into the alert', () => {
  const rendered = buildArrivalAlert(ARRIVAL, {
    userId: 42,
    firstName: '<b>Админ</b><a href="https://evil.example">жми</a>',
    pseudo: 'p',
  });
  assert.ok(!rendered.text.includes('<a href'), 'no injected anchor');
  assert.match(rendered.text, /&lt;b&gt;Админ/);
  assert.equal(rendered.keyboard, undefined);
});

test('a session with no messages reads as such, not as zero', () => {
  const rendered = buildArrivalAlert({ ...ARRIVAL, sessionId: null, messageCount: 0, personMessageCount: 0 }, IDENTITY);
  assert.match(rendered.text, /сессия не передана/);
});

test('message counts survive a missing session and a broken table', async () => {
  const db = await database();
  seedConversation(db, 'sess_counts', [['user', 'a'], ['assistant', 'b'], ['user', 'c']]);
  assert.deepEqual(await countSessionMessages(db.asD1(), 'sess_counts'), { total: 3, fromPerson: 2 });
  assert.deepEqual(await countSessionMessages(db.asD1(), 'sess_missing'), { total: 0, fromPerson: 0 });
  const broken = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('nope'); } }) }) } as unknown as D1Database;
  assert.deepEqual(await countSessionMessages(broken, 'sess_counts'), { total: 0, fromPerson: 0 });
});

// ── After the greeting: the bot answers (plan WP-08) ─────────────────────────
// The greetings promise an answer, voice included. On the production schemas
// (the bot's, the chat's and the billing ones its reply path bootstraps) the
// first question is answered past a cooling model, and a reply that cannot be
// made reaches the owner as an urgent bot alert.

/** Bot API calls are recorded as before; OpenRouter answers with `reply`, or fails. */
function installReplyFetch(calls: TgCall[], models: string[], reply: () => Response): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    if (new URL(url).host === 'openrouter.ai') {
      models.push(String(body.model));
      return reply();
    }
    calls.push({ method: url.split('/').pop() || '', body });
    return new Response(JSON.stringify({ ok: true, result: { message_id: calls.length } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  return () => { globalThis.fetch = original; };
}

test('after a handoff the first question is answered past a cooling model; a reply that cannot be made pages the owner', async () => {
  const db = await database();
  const env = { GPTBOT_DRAFTS_DB: db.asD1() };
  const [head, second] = freeChain(resolveConfig(NOTIFY_ENV as never));
  await ensureBillingSchema(db.asD1());
  db.sqlite
    .prepare("INSERT INTO gpt_model_health(org_id, model, blocked_until, code) VALUES ('gptbot-consumer', ?, ?, 'model_unavailable')")
    .run(head, Date.now() + 3_600_000);
  const calls: TgCall[] = [];
  const models: string[] = [];
  const answer = 'Albatta, ertaga gaplashamiz. Sizga qaysi vaqt qulay?';
  let restore = installReplyFetch(calls, models, () => Response.json({ choices: [{ message: { content: answer } }] }));
  try {
    await handleUpdate(deps(db, env), startUpdate(await mint(db, { locale: 'uz' })));
    calls.length = 0;
    const question = { update_id: 900_001, message: { chat: { id: USER_CHAT, type: 'private' }, from: { id: USER_CHAT, language_code: 'uz' }, text: 'Salom! Uchrashuvni boshqa kunga ko‘chirsak bo‘ladimi?' } } as never;
    assert.equal(await handleUpdate(deps(db, env), question), 'done');
    assert.deepEqual(models, [second], 'the cooling head takes no request');
    assert.ok(toUser(calls).some((c) => c.body.text === answer));
    assert.equal(db.value("SELECT COUNT(*) FROM telegram_events WHERE event = 'javob_reply_generated'"), 1);
  } finally { restore(); }

  // Now every model is cooling: the person hears back, the owner is paged once.
  db.sqlite
    .prepare("INSERT OR REPLACE INTO gpt_model_health(org_id, model, blocked_until, code) SELECT 'gptbot-consumer', value, ?, 'rate_limit' FROM json_each(?)")
    .run(Date.now() + 3_600_000, JSON.stringify(freeChain(resolveConfig(NOTIFY_ENV as never))));
  calls.length = 0;
  models.length = 0;
  restore = installReplyFetch(calls, models, () => new Response('', { status: 500 }));
  try {
    const again = { update_id: 900_002, message: { chat: { id: USER_CHAT, type: 'private' }, from: { id: USER_CHAT, language_code: 'uz' }, text: 'Salom! Ertaga soat nechada gaplashamiz?' } } as never;
    assert.equal(await handleUpdate(deps(db, env), again), 'failed:models_cooling');
    assert.deepEqual(models, []);
    assert.ok(toUser(calls).some((c) => c.body.text === ERR_PROVIDER.uz));
    assert.equal(db.value("SELECT code FROM gpt_service_alerts WHERE code LIKE 'bot_%'"), 'bot_models_cooling');
    const paged = toOwner(calls).map((c) => String(c.body.text));
    assert.equal(paged.length, 1);
    assert.match(paged[0], /bot_models_cooling — бот @gptbotuz_bot/);
    assert.ok(!paged[0].includes('Ertaga'), 'the alert carries no message text');
  } finally { restore(); }
});
