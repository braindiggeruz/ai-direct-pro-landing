// The Telegram end of signing in on gptbot.uz through the bot (plan WP-16,
// decision L11; map 04 §7 cases 11–21): `/start login_<nonce>`, the number
// buttons `lg:`, «Это не я» `lgx:` and «Выйти на всех устройствах» `lgout:`.
//
// Run: node --import tsx --test tests/telegram-web-login.test.ts
//
// What is pinned: a link binds to the first Telegram account that opens it;
// one press decides; nobody else can press; the person can always sign out
// everywhere; no model is called and no Javob allowance is spent; events and
// the web tables never get the nonce, the number or the Telegram id.
//
// No network: global fetch records the Bot API and fails any model call. D1
// is real SQLite with the production DDL of the bot, the chat and billing
// (like tests/telegram-web-handoff.test.ts): the conditional UPDATEs are the
// security property here, so they run on a real engine. The in-memory Javob
// fake in tests/telegram-assistant.test.ts covers the same routes for the
// handler's other paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { SqliteD1 } from './helpers/sqlite-d1';
import { ensureTelegramSchema } from '../functions/lib/telegram/schema';
import { ensureSchema } from '../functions/lib/gpt-chat/schema';
import { ensureBillingSchema } from '../functions/lib/gpt-chat/billing-schema';
import { handleUpdate } from '../functions/lib/telegram/handler';
import { resolveTelegramConfig } from '../functions/lib/telegram/config';
import { TelegramClient } from '../functions/lib/telegram/client';
import * as C from '../functions/lib/telegram/i18n';
import { isWebLoginCallback, isWebLoginPayload } from '../functions/lib/telegram/web-login';
import { BILLING_ORG } from '../functions/lib/gpt-chat/billing-config';
import { BOT_LOGIN_TTL_MS, BotLoginStore, type BotLoginMode } from '../functions/lib/gpt-chat/bot-login-store';
import { IdentityStore } from '../functions/lib/gpt-chat/identity-store';
import { telegramIdentityHash } from '../functions/lib/gpt-chat/telegram-identity';
import { onRequestPost as assistantPost } from '../functions/api/telegram/assistant';

// ── harness ─────────────────────────────────────────────────────────────────

const SECRET = randomBytes(32).toString('hex');
const PERSON = { id: 555_101, language_code: 'ru' };
const STRANGER = { id: 555_202, language_code: 'ru' };
const BROWSER = 'b'.repeat(64);

const ENV = {
  OPENROUTER_API_KEY: 'test',
  TELEGRAM_ASSISTANT_BOT_TOKEN: 'assistant-token',
  TELEGRAM_ASSISTANT_WEBHOOK_SECRET: 'hook-secret',
  GPT_HASH_SALT: randomBytes(32).toString('hex'),
  GPT_HASH_SALT_SINCE: '2026-01-01T00:00:00Z',
  GPT_IDENTITY_SECRET: SECRET,
};

/** The bot's and the chat's schema; billing (gpt_bot_logins) is the bot's to bootstrap. */
async function database(): Promise<SqliteD1> {
  const db = new SqliteD1();
  await ensureTelegramSchema(db.asD1());
  await ensureSchema(db.asD1());
  return db;
}

interface TgCall {
  method: string;
  body: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- recorded JSON
}

/** Records every Bot API call; a model call fails the test. */
function installFetch(calls: TgCall[]): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes('api.telegram.org')) throw new Error(`unexpected request to ${url}`);
    calls.push({ method: url.split('/').pop() || '', body: JSON.parse(String(init?.body ?? '{}')) });
    return Response.json({ ok: true, result: { message_id: calls.length } });
  }) as typeof globalThis.fetch;
  return () => { globalThis.fetch = original; };
}

function deps(db: SqliteD1, envOver: Record<string, unknown> = {}) {
  const env = { ...ENV, ...envOver } as never;
  return { env, db: db.asD1(), cfg: resolveTelegramConfig(env), tg: new TelegramClient('assistant-token') };
}

/** An attempt as POST /api/gpt/auth/bot/start makes it. */
async function attempt(db: SqliteD1, over: { mode?: BotLoginMode; locale?: 'ru' | 'uz'; now?: number; org?: string } = {}) {
  await ensureBillingSchema(db.asD1());
  const nonce = randomBytes(16).toString('hex');
  const created = await new BotLoginStore(db.asD1(), over.org ?? BILLING_ORG).create(
    { nonce, browserHash: BROWSER, mode: over.mode ?? 'pick', locale: over.locale ?? 'uz', client: 'Chrome, Android' },
    over.now,
  );
  assert.ok(created);
  return { nonce, payload: `login_${nonce}`, ...created };
}

let nextUpdate = 10_000;
function start(payload: string, from = PERSON, chatType = 'private') {
  return {
    update_id: nextUpdate++,
    message: { chat: { id: from.id, type: chatType }, from, text: `/start ${payload}` },
  } as never;
}
function press(data: string, from = PERSON, chatType = 'private') {
  return {
    update_id: nextUpdate++,
    callback_query: { id: `cq${nextUpdate}`, from, data, message: { chat: { id: from.id, type: chatType }, message_id: 77 } },
  } as never;
}

const row = (db: SqliteD1, id: string) =>
  db.rows<Record<string, unknown>>('SELECT * FROM gpt_bot_logins WHERE id=?', id)[0];
const sends = (calls: TgCall[]) => calls.filter((c) => c.method === 'sendMessage');
const toasts = (calls: TgCall[]) => calls.filter((c) => c.method === 'answerCallbackQuery').map((c) => c.body.text);
const edits = (calls: TgCall[]) => calls.filter((c) => c.method === 'editMessageText');
const buttons = (call: TgCall) =>
  (call.body.reply_markup?.inline_keyboard ?? []).flat() as Array<{ text: string; callback_data: string }>;

// ── the shape gates ─────────────────────────────────────────────────────────

test('only login_ + 32 lowercase hex is a sign-in payload; lg:, lgx: and lgout: are its buttons', () => {
  assert.equal(isWebLoginPayload(`login_${'a1'.repeat(16)}`), true);
  for (const payload of ['login_XYZ', `login_${'A'.repeat(32)}`, `login_${'a'.repeat(31)}`, `login_${'a'.repeat(33)}`, `login_${'a'.repeat(59)}`, `w_${'a'.repeat(32)}`, 'site_uz', ''])
    assert.equal(isWebLoginPayload(payload), false, payload);
  for (const data of ['lg:47:0123456789abcdef', 'lgx:0123456789abcdef', 'lgout:uz', 'lg:junk'])
    assert.equal(isWebLoginCallback(data), true, data);
  for (const data of ['lang:ru', 'jmod:softer:x', 'restart:x', 'lgo', ''])
    assert.equal(isWebLoginCallback(data), false, data);
});

// ── 11. opening the link ────────────────────────────────────────────────────

test('the first opener holds the link and is asked for the number: no model call, no allowance spent', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    const a = await attempt(db);
    assert.equal(await handleUpdate(deps(db), start(a.payload)), 'done');
    const stored = row(db, a.id);
    assert.equal(stored.status, 'claimed');
    assert.equal(stored.tg_hash, await telegramIdentityHash(SECRET, PERSON.id));
    const [message] = sends(calls);
    assert.equal(sends(calls).length, 1);
    assert.equal(message.body.chat_id, PERSON.id);
    // The site page was Uzbek: the question is too, whatever the client says.
    assert.equal(message.body.text, C.loginPrompt('uz', 'Chrome, Android', stored.created_at as number));
    assert.match(message.body.text, /Brauzer: Chrome, Android/);
    assert.match(message.body.text, /Toshkent vaqti bilan \d{2}:\d{2}/);
    const keys = buttons(message);
    const numbers = keys.filter((key) => key.callback_data.startsWith('lg:'));
    assert.deepEqual(numbers.map((key) => key.callback_data), (stored.choices as string).split(',').map((n) => `lg:${n}:${a.id}`));
    assert.equal(numbers.length, 3);
    assert.equal(new Set(numbers.map((key) => key.text)).size, 3);
    assert.ok(numbers.some((key) => key.text === a.code), 'the right number is one of the three');
    assert.ok(numbers.every((key) => /^[1-9]\d$/.test(key.text)));
    assert.deepEqual(keys.at(-1), { text: 'Bu men emas', callback_data: `lgx:${a.id}` });
    for (const key of keys) assert.ok(Buffer.byteLength(key.callback_data) <= 64);
    // Not Javob: nothing generated, nothing counted, nothing kept.
    assert.equal(db.value('SELECT COUNT(*) FROM usage_ledger'), 0);
    assert.equal(db.value('SELECT COUNT(*) FROM telegram_items'), 0);
    assert.ok(!calls.some((c) => c.method === 'sendChatAction'));
  } finally { restore(); }
});

// ── 12. Telegram retries the same update ────────────────────────────────────

test('the same update_id twice through the webhook asks once', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    const a = await attempt(db);
    const update = start(a.payload);
    const waits: Promise<unknown>[] = [];
    const post = () => assistantPost({
      request: new Request('https://gptbot.uz/api/telegram/assistant', {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'hook-secret', 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      }),
      env: { ...ENV, GPTBOT_DRAFTS_DB: db.asD1() },
      waitUntil: (task: Promise<unknown>) => waits.push(task),
    } as never);
    assert.equal((await post()).status, 200);
    assert.equal((await post()).status, 200);
    await Promise.all(waits);
    assert.equal(sends(calls).length, 1);
    assert.equal(db.value('SELECT status FROM telegram_updates WHERE update_id=?', (update as { update_id: number }).update_id), 'done');
  } finally { restore(); }
});

// ── 13. opening again ───────────────────────────────────────────────────────

test('opened again: the same person is asked again; another account is told it is taken and changes nothing', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    const a = await attempt(db, { locale: 'ru' });
    await handleUpdate(deps(db), start(a.payload));
    const first = row(db, a.id);
    await handleUpdate(deps(db), start(a.payload));
    assert.deepEqual(row(db, a.id), first, 'nothing moves');
    const [ask, again] = sends(calls);
    assert.equal(again.body.text, ask.body.text);
    assert.deepEqual(buttons(again), buttons(ask), 'the same three numbers in the same order');

    calls.length = 0;
    await handleUpdate(deps(db), start(a.payload, STRANGER));
    assert.deepEqual(sends(calls).map((c) => [c.body.chat_id, c.body.text]), [[STRANGER.id, C.LOGIN_TAKEN.ru]]);
    assert.deepEqual(row(db, a.id), first);
  } finally { restore(); }
});

// ── 14. hostile and stale payloads ──────────────────────────────────────────

test('a payload that is not a sign-in never reaches the sign-in table; an unknown or expired one is stale', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    for (const payload of ['login_XYZ', `login_${'A'.repeat(32)}`, `login_${'a'.repeat(59)}`]) {
      calls.length = 0;
      assert.equal(await handleUpdate(deps(db), start(payload)), 'done');
      assert.equal(sends(calls)[0].body.text, C.START.ru, 'the shipped greeting');
    }
    assert.equal(db.value("SELECT COUNT(*) FROM sqlite_master WHERE name='gpt_bot_logins'"), 0, 'not even bootstrapped');
    assert.equal(db.value("SELECT COUNT(*) FROM gpt_rate_limits WHERE action='bot_login'"), 0);

    // A well-formed link nobody minted: stale, and still no attempt anywhere.
    calls.length = 0;
    await handleUpdate(deps(db), start(`login_${randomBytes(16).toString('hex')}`));
    assert.deepEqual(sends(calls).map((c) => c.body.text), [C.LOGIN_STALE.ru]);
    assert.equal(db.value('SELECT COUNT(*) FROM gpt_bot_logins'), 0);

    // Past its 10 minutes: stale, and the attempt is not claimed.
    const old = await attempt(db, { now: Date.now() - BOT_LOGIN_TTL_MS - 1_000 });
    calls.length = 0;
    await handleUpdate(deps(db), start(old.payload));
    assert.deepEqual(sends(calls).map((c) => c.body.text), [C.LOGIN_STALE.ru]);
    assert.equal(row(db, old.id).status, 'pending');
    assert.equal(row(db, old.id).tg_hash, null);
  } finally { restore(); }
});

test('without GPT_IDENTITY_SECRET a sign-in link is stale and nothing is claimed', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    const a = await attempt(db);
    await handleUpdate(deps(db, { GPT_IDENTITY_SECRET: 'short' }), start(a.payload));
    assert.deepEqual(sends(calls).map((c) => c.body.text), [C.LOGIN_STALE.ru]);
    assert.equal(row(db, a.id).status, 'pending');
  } finally { restore(); }
});

// ── 15. one press decides ───────────────────────────────────────────────────

test('the right number confirms, a wrong one or «not me» rejects; a second press only gets a toast', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    // Right number.
    const a = await attempt(db);
    await handleUpdate(deps(db), start(a.payload));
    calls.length = 0;
    assert.equal(await handleUpdate(deps(db), press(`lg:${a.code}:${a.id}`)), 'done');
    assert.equal(row(db, a.id).status, 'confirmed');
    assert.deepEqual(toasts(calls), [C.LOGIN_TOAST.uz.confirmed]);
    const [confirmed] = edits(calls);
    assert.equal(confirmed.body.message_id, 77);
    assert.equal(confirmed.body.text, C.LOGIN_CONFIRMED.uz);
    assert.deepEqual(buttons(confirmed), [{ text: 'Barcha qurilmalardan chiqish', callback_data: 'lgout:uz' }]);
    assert.equal(sends(calls).length, 0);
    // The same press again (a double tap, a crafted repeat): a toast, nothing else.
    for (const data of [`lg:${a.code}:${a.id}`, `lgx:${a.id}`]) {
      calls.length = 0;
      await handleUpdate(deps(db), press(data));
      assert.deepEqual(calls.map((c) => c.method), ['answerCallbackQuery']);
      assert.deepEqual(toasts(calls), [C.LOGIN_TOAST.uz.repeat]);
    }
    assert.equal(row(db, a.id).status, 'confirmed');

    // A wrong number: rejected, and the right one afterwards changes nothing.
    const b = await attempt(db, { locale: 'ru' });
    await handleUpdate(deps(db), start(b.payload));
    const wrong = (row(db, b.id).choices as string).split(',').find((n) => n !== b.code)!;
    calls.length = 0;
    await handleUpdate(deps(db), press(`lg:${wrong}:${b.id}`));
    assert.equal(row(db, b.id).status, 'rejected');
    assert.deepEqual(toasts(calls), [C.LOGIN_TOAST.ru.rejected]);
    assert.equal(edits(calls)[0].body.text, C.LOGIN_REJECTED.ru);
    assert.equal(edits(calls)[0].body.reply_markup, undefined, 'the buttons go');
    calls.length = 0;
    await handleUpdate(deps(db), press(`lg:${b.code}:${b.id}`));
    assert.deepEqual(toasts(calls), [C.LOGIN_TOAST.ru.repeat]);
    assert.equal(row(db, b.id).status, 'rejected');

    // «Это не я».
    const c = await attempt(db, { locale: 'ru' });
    await handleUpdate(deps(db), start(c.payload));
    calls.length = 0;
    await handleUpdate(deps(db), press(`lgx:${c.id}`));
    assert.equal(row(db, c.id).status, 'rejected');
    assert.deepEqual(toasts(calls), [C.LOGIN_TOAST.ru.denied]);
    assert.equal(edits(calls)[0].body.text, C.LOGIN_DENIED.ru);

    // Opened again after the number: the outcome and the way out, once more.
    calls.length = 0;
    await handleUpdate(deps(db), start(a.payload));
    assert.equal(sends(calls)[0].body.text, C.LOGIN_CONFIRMED.uz);
    assert.deepEqual(buttons(sends(calls)[0]).map((key) => key.callback_data), ['lgout:uz']);

    // An expired attempt: a stale toast, and its dead buttons go.
    const d = await attempt(db, { locale: 'ru' });
    await handleUpdate(deps(db), start(d.payload));
    db.sqlite.prepare('UPDATE gpt_bot_logins SET expires_at=? WHERE id=?').run(Date.now() - 1, d.id);
    calls.length = 0;
    await handleUpdate(deps(db), press(`lg:${d.code}:${d.id}`));
    assert.deepEqual(toasts(calls), [C.LOGIN_TOAST.ru.stale]);
    assert.equal(edits(calls)[0].body.text, C.LOGIN_STALE.ru);
    assert.equal(row(db, d.id).status, 'claimed');
  } finally { restore(); }
});

// ── 16. strangers and groups ────────────────────────────────────────────────

test('another Telegram account cannot press someone else\'s attempt; a group cannot start or press one', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    const a = await attempt(db);
    await handleUpdate(deps(db), start(a.payload));
    const held = row(db, a.id);
    calls.length = 0;
    for (const data of [`lg:${a.code}:${a.id}`, `lgx:${a.id}`]) await handleUpdate(deps(db), press(data, STRANGER));
    assert.deepEqual(toasts(calls), [C.LOGIN_TOAST.uz.foreign, C.LOGIN_TOAST.uz.foreign]);
    assert.equal(edits(calls).length, 0);
    assert.deepEqual(row(db, a.id), held);

    const b = await attempt(db);
    calls.length = 0;
    await handleUpdate(deps(db), start(b.payload, PERSON, 'group'));
    assert.deepEqual(sends(calls).map((c) => c.body.text), [C.GROUP_NOTICE.ru]);
    assert.equal(row(db, b.id).status, 'pending');
    calls.length = 0;
    await handleUpdate(deps(db), press(`lg:${a.code}:${a.id}`, PERSON, 'group'));
    assert.deepEqual(toasts(calls), [C.LOGIN_TOAST.ru.stale]);
    assert.deepEqual(row(db, a.id), held);
  } finally { restore(); }
});

// ── 17. signing out everywhere ──────────────────────────────────────────────

test('«sign out everywhere» ends only the presser\'s own sessions and attempts; again, nothing more', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    await ensureBillingSchema(db.asD1());
    const identity = new IdentityStore(db.asD1(), BILLING_ORG);
    const mine = (await telegramIdentityHash(SECRET, PERSON.id))!;
    await identity.login(mine);
    await identity.login(mine);
    await identity.login((await telegramIdentityHash(SECRET, STRANGER.id))!);
    const sessions = (hash: string) => db.value(
      'SELECT COUNT(*) FROM gpt_auth_sessions s JOIN gpt_accounts a ON a.org_id=s.org_id AND a.id=s.user_id WHERE a.identity_hash=?', hash);
    const theirs = (await telegramIdentityHash(SECRET, STRANGER.id))!;
    // A confirmed attempt waiting for its browser's poll, and the stranger's own.
    const a = await attempt(db, { locale: 'ru' });
    await handleUpdate(deps(db), start(a.payload));
    await handleUpdate(deps(db), press(`lg:${a.code}:${a.id}`));
    const s = await attempt(db);
    await handleUpdate(deps(db), start(s.payload, STRANGER));

    calls.length = 0;
    assert.equal(await handleUpdate(deps(db), press('lgout:ru')), 'done');
    assert.deepEqual(toasts(calls), [C.LOGIN_TOAST.ru.revoked]);
    assert.equal(edits(calls)[0].body.text, C.LOGIN_REVOKED.ru);
    assert.equal(sessions(mine), 0);
    assert.equal(sessions(theirs), 1);
    assert.equal(row(db, a.id).status, 'rejected', 'the browser that was about to collect it gets nothing');
    assert.equal(row(db, s.id).status, 'claimed');

    calls.length = 0;
    await handleUpdate(deps(db), press('lgout:ru'));
    assert.equal(sessions(theirs), 1);
    assert.deepEqual(toasts(calls), [C.LOGIN_TOAST.ru.revoked]);
    // A malformed sign-in button is stale, never Javob's.
    calls.length = 0;
    await handleUpdate(deps(db), press('lgout:en'));
    assert.deepEqual(toasts(calls), [C.LOGIN_TOAST.ru.stale]);
    assert.equal(sends(calls).length, 0);
  } finally { restore(); }
});

// ── 19. analytics ───────────────────────────────────────────────────────────

test('events name the outcome and the locale only: no nonce, number, code or Telegram id', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    const a = await attempt(db);
    await handleUpdate(deps(db), start(a.payload));
    await handleUpdate(deps(db), press(`lg:${a.code}:${a.id}`));
    const c = await attempt(db, { mode: 'code' });
    await handleUpdate(deps(db), start(c.payload));
    await handleUpdate(deps(db), press(`lgx:${c.id}`));
    await handleUpdate(deps(db), press('lgout:uz'));
    await handleUpdate(deps(db), start(`login_${randomBytes(16).toString('hex')}`, STRANGER));
    const events = db.rows<{ event: string; pseudo_user: string; meta_json: string }>(
      "SELECT event, pseudo_user, meta_json FROM telegram_events WHERE event LIKE 'web_login_%' ORDER BY rowid");
    assert.deepEqual(events.map((e) => e.event), [
      'web_login_opened', 'web_login_confirmed', 'web_login_opened', 'web_login_denied', 'web_login_revoked', 'web_login_stale',
    ]);
    for (const event of events) assert.deepEqual(Object.keys(JSON.parse(event.meta_json)), ['locale']);
    const everything = JSON.stringify(db.rows('SELECT * FROM telegram_events'));
    for (const secret of [a.nonce, c.nonce, c.code, String(PERSON.id), String(STRANGER.id)])
      assert.ok(!everything.includes(secret), `leaked ${secret}`);
    // The web tables: the HMAC identity, never the Telegram id.
    assert.ok(!JSON.stringify(db.rows('SELECT * FROM gpt_bot_logins')).includes(String(PERSON.id)));
    assert.ok(!JSON.stringify(db.rows('SELECT * FROM gpt_bot_logins')).includes(a.nonce));
  } finally { restore(); }
});

// ── 20. flood ───────────────────────────────────────────────────────────────

test('the eleventh opening within an hour is refused, even of a real link', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    for (let i = 0; i < 10; i++) await handleUpdate(deps(db), start(`login_${randomBytes(16).toString('hex')}`));
    assert.deepEqual(new Set(sends(calls).map((c) => c.body.text)), new Set([C.LOGIN_STALE.ru]));
    const a = await attempt(db);
    calls.length = 0;
    await handleUpdate(deps(db), start(a.payload));
    assert.deepEqual(sends(calls).map((c) => c.body.text), [C.LOGIN_LIMITED.ru]);
    assert.equal(row(db, a.id).status, 'pending');
    // Another person's hour is their own.
    calls.length = 0;
    await handleUpdate(deps(db), start(a.payload, STRANGER));
    assert.equal(row(db, a.id).status, 'claimed');
  } finally { restore(); }
});

// ── code mode ───────────────────────────────────────────────────────────────

test('code mode: the bot sends the code with «not me» and «sign out everywhere», and no numbers to press', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    const a = await attempt(db, { mode: 'code', locale: 'ru' });
    assert.match(a.code, /^[1-9]\d{5}$/);
    await handleUpdate(deps(db), start(a.payload));
    const [message] = sends(calls);
    assert.equal(message.body.text, C.loginCodePrompt('ru', 'Chrome, Android', row(db, a.id).created_at as number, a.code));
    assert.match(message.body.text, new RegExp(`Код для входа: ${a.code}`));
    assert.deepEqual(buttons(message).map((key) => key.callback_data), [`lgx:${a.id}`, 'lgout:ru']);
    // A number press cannot confirm a code attempt.
    calls.length = 0;
    await handleUpdate(deps(db), press(`lg:${a.code.slice(0, 2)}:${a.id}`));
    assert.equal(row(db, a.id).status, 'claimed');
  } finally { restore(); }
});

// ── failures ────────────────────────────────────────────────────────────────

test('a D1 failure on the way: the person is told, the update is a failure, nothing half-done', async () => {
  const db = await database();
  const calls: TgCall[] = []; const restore = installFetch(calls);
  try {
    const a = await attempt(db);
    const broken = {
      prepare: (sql: string) => {
        if (/^\s*UPDATE gpt_bot_logins/.test(sql)) throw new Error('d1 down');
        return db.prepare(sql);
      },
      batch: (statements: never[]) => db.batch(statements),
    };
    const failing = { ...deps(db), db: broken as unknown as D1Database };
    assert.equal(await handleUpdate(failing, start(a.payload)), 'failed:login_failed');
    assert.deepEqual(sends(calls).map((c) => c.body.text), [C.LOGIN_FAILED.ru]);
    assert.equal(row(db, a.id).status, 'pending');
    calls.length = 0;
    assert.equal(await handleUpdate(failing, press(`lg:${a.code}:${a.id}`)), 'failed:login_failed');
    assert.deepEqual(toasts(calls), [C.LOGIN_TOAST.ru.failed]);
  } finally { restore(); }
});
