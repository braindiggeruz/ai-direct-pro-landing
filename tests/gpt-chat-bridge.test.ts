// The chat -> owner bridge: owner notification, and the single-use token that
// lets a web conversation continue inside Telegram.
//
// Run: node --import tsx --test tests/gpt-chat-bridge.test.ts
//
// The properties worth testing here are the ones that lose money or leak
// something when they break:
//   - a handoff token is claimable exactly once, and not after it expires;
//   - the /start payload actually fits what Telegram accepts;
//   - the conversation reaches the owner ONLY with the person's consent;
//   - an unset secret skips the alert and still keeps the lead;
//   - the public POST surface is boring to flood.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SqliteD1 } from './helpers/sqlite-d1';
import { ensureSchema } from '../functions/lib/gpt-chat/schema';
import {
  START_PAYLOAD_RE,
  claimHandoff,
  deepLinkFor,
  mintHandoff,
  parseHandoffPayload,
  pruneHandoffs,
  resolveHandoffConfig,
} from '../functions/lib/gpt-chat/handoff';
import {
  _resetNotifyWarning,
  buildLeadAlert,
  clampEscaped,
  loadTranscript,
  resolveOwnerNotify,
  sendOwnerAlert,
  telegramHandleUrl,
  type LeadAlert,
} from '../functions/lib/gpt-chat/notify';
import { consumeRateLimit, peekRateLimit, windowStart, HOUR_MS } from '../functions/lib/gpt-chat/rate-limit';
import { resolveBridgeLimits, type BridgeEnv } from '../functions/lib/gpt-chat/bridge-env';
import { normalizePagePath, validateLead } from '../functions/lib/gpt-chat/validate';
import { onRequestPost as leadPost } from '../functions/api/gpt/lead';
import { onRequestPost as handoffPost } from '../functions/api/gpt/handoff/index';
import { onRequestPost as claimPost } from '../functions/api/gpt/handoff/claim';

// ── harness ─────────────────────────────────────────────────────────────────

async function database(): Promise<SqliteD1> {
  const db = new SqliteD1();
  await ensureSchema(db.asD1());
  return db;
}

interface TgCall {
  method: string;
  body: Record<string, unknown>;
}

interface Stub {
  calls: TgCall[];
  fail?: number;
  /** Let the held Bot API call finish. Only meaningful with `hold: true`. */
  release(): void;
  restore(): void;
}

/**
 * `hold: true` freezes the Bot API mid-call. That is the only way to prove the
 * endpoint answered the browser WITHOUT waiting on Telegram: without a gate,
 * a stub that resolves on the microtask queue completes during the test's own
 * `await`, and the assertion would pass for the wrong reason.
 */
function stubTelegram(options: { fail?: number; hold?: boolean } = {}): Stub {
  const previous = globalThis.fetch;
  const calls: TgCall[] = [];
  let open: () => void = () => {};
  const gate = options.hold ? new Promise<void>((resolve) => { open = resolve; }) : Promise.resolve();
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    assert.ok(href.startsWith('https://api.telegram.org/'), `unexpected fetch to ${href}`);
    const method = href.split('/').pop() || '';
    await gate;
    calls.push({ method, body: JSON.parse(String(init?.body || '{}')) });
    if (options.fail) {
      return new Response(JSON.stringify({ ok: false, error_code: options.fail }), {
        status: options.fail,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, result: { message_id: calls.length } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return {
    calls,
    release: () => open(),
    restore() {
      open();
      globalThis.fetch = previous;
    },
  };
}

const NOTIFY_ENV = {
  GPT_NOTIFY_BOT_TOKEN: 'test-bot-token-never-logged',
  GPT_NOTIFY_CHAT_ID: '4242',
  GPT_HANDOFF_BOT_USERNAME: 'gptbot_javob_bot',
  GPT_HASH_SALT: 'salt',
};

function context(db: SqliteD1 | null, body: unknown, envOver: Record<string, unknown> = {}, path = '/api/gpt/lead') {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: {
      request: new Request(`https://gptbot.uz${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7' },
        body: JSON.stringify(body),
      }),
      env: { ...NOTIFY_ENV, ...(db ? { GPTBOT_DRAFTS_DB: db.asD1() } : {}), ...envOver },
      waitUntil: (p: Promise<unknown>) => { pending.push(p); },
    },
    settle: () => Promise.all(pending),
  };
}

const BASE_ALERT: LeadAlert = {
  leadId: 'lead_abc',
  name: 'Ali',
  contactType: 'telegram',
  contactValue: '@alisher',
  intent: 'telegram_bot',
  locale: 'uz',
  pageUrl: '/uz/gpt-uzbek-tilida/',
  sessionId: 'sess_1',
  utmJson: null,
  createdAt: '2026-09-04T19:41:07.000Z',
  shareConversation: false,
};

// ── handoff token lifecycle ─────────────────────────────────────────────────

test('handoff payload obeys Telegram: [A-Za-z0-9_-], at most 64 chars', async () => {
  const db = await database();
  const cfg = resolveHandoffConfig(NOTIFY_ENV as BridgeEnv);
  const minted = await mintHandoff(db.asD1(), cfg, { sessionId: 'sess_1', locale: 'uz', pageUrl: '/uz/', intent: null });
  assert.match(minted.payload, START_PAYLOAD_RE);
  assert.ok(minted.payload.length <= 64, 'payload must fit the /start limit');
  assert.match(minted.payload, /^w_[0-9a-f]{32}$/);
  assert.equal(minted.deepLink, `https://t.me/gptbot_javob_bot?start=${minted.payload}`);
});

test('the session id is never the payload, and the raw token is never stored', async () => {
  const db = await database();
  const cfg = resolveHandoffConfig(NOTIFY_ENV as BridgeEnv);
  const minted = await mintHandoff(db.asD1(), cfg, {
    sessionId: 'sess_guessable',
    locale: 'ru',
    pageUrl: '/ru/',
    intent: null,
  });
  assert.ok(!minted.payload.includes('sess_guessable'));
  const rows = db.rows<{ token_hash: string; session_id: string }>('SELECT token_hash, session_id FROM gpt_handoffs');
  assert.equal(rows.length, 1);
  assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/);
  const token = minted.payload.slice(2);
  assert.notEqual(rows[0].token_hash, token, 'the token itself must not be the stored value');
  assert.equal(rows[0].session_id, 'sess_guessable');
});

test('a handoff is claimable exactly once and carries the session context', async () => {
  const db = await database();
  const cfg = resolveHandoffConfig(NOTIFY_ENV as BridgeEnv);
  const minted = await mintHandoff(db.asD1(), cfg, {
    sessionId: 'sess_1',
    locale: 'uz',
    pageUrl: '/uz/gpt-uzbek-tilida/',
    intent: 'limit_hourly',
  });

  const first = await claimHandoff(db.asD1(), minted.payload, { claimedBy: 'tg_pseudo_9' });
  assert.equal(first.ok, true);
  assert.equal(first.ok && first.sessionId, 'sess_1');
  assert.equal(first.ok && first.locale, 'uz');
  assert.equal(first.ok && first.pageUrl, '/uz/gpt-uzbek-tilida/');
  assert.equal(first.ok && first.intent, 'limit_hourly');

  const second = await claimHandoff(db.asD1(), minted.payload, { claimedBy: 'tg_pseudo_9' });
  assert.equal(second.ok, false);
  assert.equal(second.ok === false && second.reason, 'already_claimed');
  assert.equal(db.value('SELECT claimed_by FROM gpt_handoffs'), 'tg_pseudo_9');
});

test('an expired handoff is refused, and refusal does not consume it', async () => {
  const db = await database();
  const cfg = { ...resolveHandoffConfig(NOTIFY_ENV as BridgeEnv), ttlMs: 5 * 60_000 };
  const mintedAt = new Date('2026-09-04T10:00:00.000Z');
  const minted = await mintHandoff(db.asD1(), cfg, { sessionId: 's', locale: 'ru', pageUrl: null, intent: null }, mintedAt);

  const late = await claimHandoff(db.asD1(), minted.payload, { now: new Date('2026-09-04T10:06:00.000Z') });
  assert.equal(late.ok, false);
  assert.equal(late.ok === false && late.reason, 'expired');
  assert.equal(db.value('SELECT claimed_at FROM gpt_handoffs'), null);

  const inTime = await claimHandoff(db.asD1(), minted.payload, { now: new Date('2026-09-04T10:04:00.000Z') });
  assert.equal(inTime.ok, true);
});

test('a payload Telegram would allow but we never minted is refused, not guessed at', async () => {
  const db = await database();
  for (const bad of ['', 'site_ru', 'w_notavalidhex', 'w_' + 'f'.repeat(31), '../etc', 'w_' + 'F'.repeat(32)]) {
    const claim = await claimHandoff(db.asD1(), bad);
    assert.equal(claim.ok, false, `${bad} must not claim`);
    assert.equal(claim.ok === false && claim.reason, 'invalid');
  }
  const unknown = await claimHandoff(db.asD1(), 'w_' + 'a'.repeat(32));
  assert.equal(unknown.ok === false && unknown.reason, 'not_found');
  assert.equal(parseHandoffPayload('site_uz'), null);
});

test('pruning removes only handoffs whose window closed', async () => {
  const db = await database();
  const cfg = { ...resolveHandoffConfig(NOTIFY_ENV as BridgeEnv), ttlMs: 60_000 };
  await mintHandoff(db.asD1(), cfg, { sessionId: 'old', locale: 'ru', pageUrl: null, intent: null }, new Date('2026-09-04T09:00:00.000Z'));
  await mintHandoff(db.asD1(), cfg, { sessionId: 'new', locale: 'ru', pageUrl: null, intent: null }, new Date('2026-09-04T12:00:00.000Z'));
  await pruneHandoffs(db.asD1(), new Date('2026-09-04T12:00:30.000Z'));
  assert.deepEqual(db.rows<{ session_id: string }>('SELECT session_id FROM gpt_handoffs').map((r) => r.session_id), ['new']);
});

test('an unusable bot username degrades instead of producing a dead link', () => {
  assert.equal(resolveHandoffConfig({} as BridgeEnv).configured, false);
  assert.equal(resolveHandoffConfig({ GPT_HANDOFF_BOT_USERNAME: 'a b' } as BridgeEnv).configured, false);
  const viaAssistant = resolveHandoffConfig({ TELEGRAM_ASSISTANT_BOT_USERNAME: '@gptbot_javob_bot' } as BridgeEnv);
  assert.equal(viaAssistant.configured, true);
  assert.equal(viaAssistant.botUsername, 'gptbot_javob_bot');
  assert.equal(deepLinkFor('gptbot_javob_bot', 'site_uz'), 'https://t.me/gptbot_javob_bot?start=site_uz');
});

// ── owner notification payload ──────────────────────────────────────────────

test('the alert carries who, how, what, where and in which language', () => {
  const { text, keyboard } = buildLeadAlert(BASE_ALERT);
  assert.match(text, /Заявка из AI-чата/);
  assert.match(text, /<b>Имя:<\/b> Ali/);
  assert.match(text, /@alisher \(telegram\)/);
  assert.match(text, /<b>Запрос:<\/b> telegram_bot/);
  assert.match(text, /<b>Язык:<\/b> узбекский/);
  assert.match(text, /\/uz\/gpt-uzbek-tilida\//);
  assert.match(text, /2026-09-04 19:41 UTC/);
  assert.match(text, /lead_abc/);
  assert.deepEqual(keyboard, [[{ text: 'Написать в Telegram', url: 'https://t.me/alisher' }]]);
});

test('without consent the conversation is absent AND the absence is stated', () => {
  const { text } = buildLeadAlert({
    ...BASE_ALERT,
    shareConversation: false,
    transcript: [{ role: 'user', content: 'секретный вопрос про мой бизнес' }],
  });
  assert.ok(!text.includes('секретный вопрос'), 'transcript must not leak without consent');
  assert.match(text, /Переписку передавать не разрешили/);
});

test('with consent the conversation is included, escaped, and attributed', () => {
  const { text } = buildLeadAlert({
    ...BASE_ALERT,
    shareConversation: true,
    transcript: [
      { role: 'user', content: 'Kerak <script>alert(1)</script> bot' },
      { role: 'assistant', content: 'Албатта, ёрдам берамиз' },
    ],
  });
  assert.match(text, /передана с согласия/);
  assert.match(text, /<b>Человек:<\/b> Kerak &lt;script&gt;/);
  assert.match(text, /<b>Бот:<\/b> Албатта/);
  assert.ok(!text.includes('<script>'), 'chat text must never reach Telegram as markup');
});

test('consent with an empty conversation says so rather than pretending', () => {
  const { text } = buildLeadAlert({ ...BASE_ALERT, shareConversation: true, transcript: [] });
  assert.match(text, /сообщений в этой сессии нет/);
});

test('the alert stays inside one Telegram message even for hostile input', () => {
  const { text } = buildLeadAlert({
    ...BASE_ALERT,
    name: '"'.repeat(500),
    utmJson: JSON.stringify({ utm_source: '"'.repeat(400) }),
    shareConversation: true,
    transcript: Array.from({ length: 12 }, () => ({ role: 'user' as const, content: '"'.repeat(1000) })),
  });
  // Under the 3900-char chunking threshold in channels/telegram/api.ts, so the
  // client never splits the message and never cuts one of our tags in half.
  assert.ok(text.length < 3900, `alert grew to ${text.length} chars`);
  assert.ok(!/&[a-z]*$/.test(text), 'must not end mid-entity');
});

test('the t.me button appears only for a handle Telegram would resolve', () => {
  assert.equal(telegramHandleUrl('telegram', '@alisher'), 'https://t.me/alisher');
  assert.equal(telegramHandleUrl('phone', '+998901234567'), null);
  assert.equal(telegramHandleUrl('telegram', '@a b'), null);
  assert.equal(telegramHandleUrl('telegram', '@ab'), null);
});

test('clampEscaped never returns a half-written entity', () => {
  const out = clampEscaped('"'.repeat(100), 20);
  assert.ok(out.length <= 20);
  assert.ok(!/&[a-z]*$/.test(out));
});

// ── graceful degradation when the secrets are unset ─────────────────────────

test('with no credentials the alert is skipped, logs once, and never calls Telegram', async () => {
  _resetNotifyWarning();
  const stub = stubTelegram();
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (m?: unknown) => { warnings.push(String(m)); };
  try {
    const first = await sendOwnerAlert({} as BridgeEnv, buildLeadAlert(BASE_ALERT));
    const second = await sendOwnerAlert({} as BridgeEnv, buildLeadAlert(BASE_ALERT));
    assert.equal(first.status, 'skipped_unconfigured');
    assert.equal(second.status, 'skipped_unconfigured');
    assert.equal(stub.calls.length, 0, 'no Bot API call may be attempted');
    assert.equal(warnings.length, 1, 'one warning per isolate, not one per lead');
    assert.match(warnings[0], /GPT_NOTIFY_BOT_TOKEN/);
  } finally {
    console.warn = warn;
    stub.restore();
  }
});

test('a half-configured pair is treated as unconfigured, not as a bad send', async () => {
  _resetNotifyWarning();
  assert.equal(resolveOwnerNotify({ GPT_NOTIFY_BOT_TOKEN: 't' } as BridgeEnv).configured, false);
  assert.equal(resolveOwnerNotify({ GPT_NOTIFY_CHAT_ID: '1' } as BridgeEnv).configured, false);
  const viaAssistant = resolveOwnerNotify({
    TELEGRAM_ASSISTANT_BOT_TOKEN: 't',
    TELEGRAM_ADMIN_CHAT_ID: '7',
  } as BridgeEnv);
  assert.equal(viaAssistant.configured, true);
  assert.equal(viaAssistant.source, 'assistant');
});

test('a Telegram failure is reported to the caller, not swallowed', async () => {
  _resetNotifyWarning();
  const stub = stubTelegram({ fail: 403 });
  const error = console.error;
  console.error = () => {};
  try {
    const res = await sendOwnerAlert(NOTIFY_ENV as BridgeEnv, buildLeadAlert(BASE_ALERT));
    assert.equal(res.status, 'failed');
    assert.equal(res.errorCode, 403);
  } finally {
    console.error = error;
    stub.restore();
  }
});

test('the bot token never appears in what is sent or logged', async () => {
  _resetNotifyWarning();
  const stub = stubTelegram();
  try {
    await sendOwnerAlert(NOTIFY_ENV as BridgeEnv, buildLeadAlert(BASE_ALERT));
    const serialized = JSON.stringify(stub.calls);
    assert.ok(!serialized.includes(NOTIFY_ENV.GPT_NOTIFY_BOT_TOKEN), 'token must stay in the URL path only');
    assert.equal(stub.calls[0].method, 'sendMessage');
    assert.equal(stub.calls[0].body.chat_id, 4242);
    assert.equal(stub.calls[0].body.parse_mode, 'HTML');
  } finally {
    stub.restore();
  }
});

// ── rate limiting ───────────────────────────────────────────────────────────

test('fixed windows count per subject and roll over on time', async () => {
  const db = await database();
  const rule = { limit: 2, windowMs: HOUR_MS };
  const at = (iso: string) => new Date(iso);
  assert.equal((await consumeRateLimit(db.asD1(), 'lead', 'ip_a', rule, at('2026-09-04T10:00:00Z'))).allowed, true);
  assert.equal((await consumeRateLimit(db.asD1(), 'lead', 'ip_a', rule, at('2026-09-04T10:30:00Z'))).allowed, true);
  const third = await consumeRateLimit(db.asD1(), 'lead', 'ip_a', rule, at('2026-09-04T10:59:00Z'));
  assert.equal(third.allowed, false);
  assert.equal(third.count, 3);
  assert.ok(third.retryAfterSeconds > 0 && third.retryAfterSeconds <= 3600);
  // A different subject is unaffected, and the next window starts clean.
  assert.equal((await consumeRateLimit(db.asD1(), 'lead', 'ip_b', rule, at('2026-09-04T10:59:00Z'))).allowed, true);
  assert.equal((await consumeRateLimit(db.asD1(), 'lead', 'ip_a', rule, at('2026-09-04T11:00:00Z'))).allowed, true);
  assert.equal(windowStart(at('2026-09-04T10:59:00Z'), HOUR_MS), '2026-09-04T10:00:00.000Z');
  assert.equal(await peekRateLimit(db.asD1(), 'lead', 'ip_a', rule, at('2026-09-04T10:10:00Z')), 3);
});

test('a broken counter table fails open rather than dropping enquiries', async () => {
  const broken = { prepare: () => { throw new Error('d1 down'); } } as unknown as D1Database;
  const res = await consumeRateLimit(broken, 'lead', 'ip', { limit: 1, windowMs: HOUR_MS });
  assert.equal(res.allowed, true);
  assert.equal(res.degraded, true);
});

test('limits are bounded in code, so a dashboard typo cannot open the funnel', () => {
  const wild = resolveBridgeLimits({ GPT_LEAD_MAX_PER_HOUR: '99999', GPT_LEAD_MAX_PER_DAY: '0' });
  assert.equal(wild.leadPerHour, 50);
  assert.equal(wild.leadPerDay, 1);
  assert.deepEqual(
    { h: resolveBridgeLimits({}).leadPerHour, d: resolveBridgeLimits({}).leadPerDay },
    { h: 5, d: 20 },
  );
});

// ── validation ──────────────────────────────────────────────────────────────

test('shareConversation is a separate opt-in and defaults to off', () => {
  assert.equal(validateLead({ consent: true, phone: '901234567' }).value?.shareConversation, false);
  assert.equal(
    validateLead({ consent: true, phone: '901234567', shareConversation: true }).value?.shareConversation,
    true,
  );
  // Consent to be contacted is NOT consent to forward the chat.
  assert.equal(
    validateLead({ consent: true, phone: '901234567', shareConversation: 'yes' as unknown as boolean }).value
      ?.shareConversation,
    false,
  );
});

test('the stored page is a same-site path with no query string', () => {
  assert.equal(normalizePagePath('/uz/gpt-uzbek-tilida/?utm_source=x&phone=998901234567'), '/uz/gpt-uzbek-tilida/');
  assert.equal(normalizePagePath('https://gptbot.uz/ru/blog/?q=secret'), '/ru/blog/');
  assert.equal(normalizePagePath('//evil.example/'), null);
  assert.equal(normalizePagePath('javascript:alert(1)'), null);
  assert.equal(normalizePagePath(''), null);
});

// ── the lead endpoint, end to end ───────────────────────────────────────────

test('a lead is stored, answered immediately, and pushed to the owner in the background', async () => {
  const db = await database();
  const stub = stubTelegram({ hold: true });
  try {
    const { ctx, settle } = context(db, {
      consent: true,
      shareConversation: true,
      name: 'Ali',
      telegram: '@alisher',
      intent: 'telegram_bot',
      locale: 'uz',
      sessionId: 'sess_1',
      pageUrl: '/uz/gpt-uzbek-tilida/?utm_source=google',
    });
    db.exec(
      "INSERT INTO gpt_messages (id, session_id, role, content, created_at) VALUES "
      + "('m1','sess_1','user','Menga bot kerak','2026-09-04T19:40:00.000Z'),"
      + "('m2','sess_1','assistant','Albatta','2026-09-04T19:40:05.000Z')",
    );

    const res = await leadPost(ctx as never);
    const payload = await res.json() as { ok: boolean; id: string };
    assert.equal(res.status, 200);
    assert.equal(payload.ok, true);
    // The Bot API is still frozen mid-call and the browser already has its
    // answer: the response genuinely does not wait on Telegram.
    assert.equal(stub.calls.length, 0, 'the response must not wait on the Bot API');

    stub.release();
    await settle();
    assert.equal(stub.calls.length, 1);
    const text = String(stub.calls[0].body.text);
    assert.match(text, /Menga bot kerak/);
    assert.match(text, /\/uz\/gpt-uzbek-tilida\/$/m);
    assert.ok(!text.includes('utm_source=google'), 'the query string must not reach the alert');

    const lead = db.rows<{ page_url: string; contact_value: string }>('SELECT page_url, contact_value FROM gpt_leads');
    assert.equal(lead.length, 1);
    assert.equal(lead[0].page_url, '/uz/gpt-uzbek-tilida/');
    const events = db.rows<{ event_name: string }>('SELECT event_name FROM gpt_events ORDER BY id').map((r) => r.event_name);
    assert.ok(events.includes('GPTChatLeadSubmitted'));
    assert.ok(events.includes('GPTChatLeadNotified'));
  } finally {
    stub.restore();
  }
});

test('without consent to forward the chat, the alert carries the contact only', async () => {
  const db = await database();
  const stub = stubTelegram();
  try {
    db.exec(
      "INSERT INTO gpt_messages (id, session_id, role, content, created_at) VALUES "
      + "('m1','sess_2','user','очень личный вопрос','2026-09-04T19:40:00.000Z')",
    );
    const { ctx, settle } = context(db, {
      consent: true,
      phone: '901234567',
      sessionId: 'sess_2',
      locale: 'ru',
    });
    await leadPost(ctx as never);
    await settle();
    const text = String(stub.calls[0].body.text);
    assert.ok(!text.includes('очень личный вопрос'));
    assert.match(text, /Переписку передавать не разрешили/);
  } finally {
    stub.restore();
  }
});

test('with the secrets unset the lead is still stored and still answered ok', async () => {
  _resetNotifyWarning();
  const db = await database();
  const stub = stubTelegram();
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { ctx, settle } = context(
      db,
      { consent: true, phone: '901234567', locale: 'ru' },
      { GPT_NOTIFY_BOT_TOKEN: undefined, GPT_NOTIFY_CHAT_ID: undefined },
    );
    const res = await leadPost(ctx as never);
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { ok: boolean }).ok, true);
    await settle();
    assert.equal(stub.calls.length, 0);
    assert.equal(db.value('SELECT COUNT(*) FROM gpt_leads'), 1);
    const events = db.rows<{ event_name: string; payload_json: string }>(
      "SELECT event_name, payload_json FROM gpt_events WHERE event_name = 'GPTChatLeadNotifySkipped'",
    );
    assert.equal(events.length, 1);
    assert.match(events[0].payload_json, /unconfigured/);
  } finally {
    console.warn = warn;
    stub.restore();
  }
});

test('a failed send is recorded as an event instead of disappearing', async () => {
  _resetNotifyWarning();
  const db = await database();
  const stub = stubTelegram({ fail: 400 });
  const error = console.error;
  console.error = () => {};
  try {
    const { ctx, settle } = context(db, { consent: true, phone: '901234567', locale: 'ru' });
    await leadPost(ctx as never);
    await settle();
    const rows = db.rows<{ payload_json: string }>(
      "SELECT payload_json FROM gpt_events WHERE event_name = 'GPTChatLeadNotifyFailed'",
    );
    assert.equal(rows.length, 1);
    assert.match(rows[0].payload_json, /"errorCode":400/);
  } finally {
    console.error = error;
    stub.restore();
  }
});

test('flooding the endpoint is boring: capped per IP, and repeats collapse', async () => {
  const db = await database();
  const stub = stubTelegram();
  try {
    // Same contact twice inside the window: one row, one alert.
    for (let i = 0; i < 2; i += 1) {
      const { ctx, settle } = context(db, { consent: true, phone: '901234567', locale: 'ru' });
      const res = await leadPost(ctx as never);
      assert.equal(((await res.json()) as { ok: boolean }).ok, true);
      await settle();
    }
    assert.equal(db.value('SELECT COUNT(*) FROM gpt_leads'), 1);
    assert.equal(stub.calls.length, 1);

    // Distinct contacts from the same address stop at the hourly ceiling of 5.
    const codes: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const { ctx, settle } = context(db, { consent: true, phone: `90123456${i}`, locale: 'ru' });
      const res = await leadPost(ctx as never);
      codes.push(res.status);
      await settle();
    }
    assert.ok(codes.includes(429), 'the per-IP ceiling must eventually refuse');
    const refused = codes.filter((c) => c === 429).length;
    assert.ok(refused >= 2, `expected several refusals, got ${refused}`);
    assert.ok(
      (db.value('SELECT COUNT(*) FROM gpt_leads') as number) <= 5,
      'a refused lead must not be stored',
    );
  } finally {
    stub.restore();
  }
});

test('past the global ceiling the owner goes quiet once, and leads keep landing', async () => {
  const db = await database();
  const stub = stubTelegram();
  try {
    const { ctx, settle } = context(
      db,
      { consent: true, phone: '901234567', locale: 'ru' },
      { GPT_OWNER_NOTIFY_MAX_PER_HOUR: '1' },
    );
    // Burn the single allowed alert of this hour.
    await consumeRateLimit(db.asD1(), 'lead_notify', 'owner', { limit: 1, windowMs: HOUR_MS });
    await leadPost(ctx as never);
    await settle();

    assert.equal(db.value('SELECT COUNT(*) FROM gpt_leads'), 1, 'the lead is stored regardless');
    assert.equal(stub.calls.length, 1);
    assert.match(String(stub.calls[0].body.text), /временно не присылаются/);

    const skipped = db.rows<{ payload_json: string }>(
      "SELECT payload_json FROM gpt_events WHERE event_name = 'GPTChatLeadNotifySkipped'",
    );
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].payload_json, /muted/);
  } finally {
    stub.restore();
  }
});

test('an invalid lead is refused before anything is stored or sent', async () => {
  const db = await database();
  const stub = stubTelegram();
  try {
    const { ctx, settle } = context(db, { consent: false, phone: '901234567' });
    const res = await leadPost(ctx as never);
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { code: string }).code, 'invalid_lead');
    await settle();
    assert.equal(db.value('SELECT COUNT(*) FROM gpt_leads'), 0);
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

// ── the handoff endpoints ───────────────────────────────────────────────────

test('POST /api/gpt/handoff returns a finished link the browser could not build', async () => {
  const db = await database();
  const { ctx } = context(db, { sessionId: 'sess_1', locale: 'uz', pageUrl: '/uz/?utm=x' }, {}, '/api/gpt/handoff');
  const res = await handoffPost(ctx as never);
  const body = await res.json() as { linked: boolean; deepLink: string; payload: string; expiresAt: string };
  assert.equal(body.linked, true);
  assert.match(body.payload, /^w_[0-9a-f]{32}$/);
  assert.equal(body.deepLink, `https://t.me/gptbot_javob_bot?start=${body.payload}`);
  assert.ok(Date.parse(body.expiresAt) > Date.now());
  assert.equal(db.value('SELECT page_url FROM gpt_handoffs'), '/uz/');
});

test('no bot username means no link at all, so the client can fall back visibly', async () => {
  const db = await database();
  const { ctx } = context(db, { locale: 'ru' }, { GPT_HANDOFF_BOT_USERNAME: '' }, '/api/gpt/handoff');
  const body = await (await handoffPost(ctx as never)).json() as { configured: boolean; deepLink: null; reason: string };
  assert.equal(body.configured, false);
  assert.equal(body.deepLink, null);
  assert.equal(body.reason, 'bot_unconfigured');
});

test('without storage the person still reaches the bot, just without context', async () => {
  const { ctx } = context(null, { locale: 'uz' }, {}, '/api/gpt/handoff');
  const body = await (await handoffPost(ctx as never)).json() as { linked: boolean; deepLink: string; reason: string };
  assert.equal(body.linked, false);
  assert.equal(body.reason, 'storage_unavailable');
  assert.equal(body.deepLink, 'https://t.me/gptbot_javob_bot?start=site_uz');
});

test('minting is capped per IP, and being capped still returns a working link', async () => {
  const db = await database();
  let last: { linked: boolean; reason?: string } = { linked: true };
  for (let i = 0; i < 21; i += 1) {
    const { ctx } = context(db, { locale: 'ru' }, {}, '/api/gpt/handoff');
    last = await (await handoffPost(ctx as never)).json() as { linked: boolean; reason?: string };
  }
  assert.equal(last.linked, false);
  assert.equal(last.reason, 'rate_limited');
  assert.equal(db.value('SELECT COUNT(*) FROM gpt_handoffs'), 20);
});

test('the claim endpoint is dormant without the internal secret and refuses a wrong one', async () => {
  const db = await database();
  const cfg = resolveHandoffConfig(NOTIFY_ENV as BridgeEnv);
  const minted = await mintHandoff(db.asD1(), cfg, { sessionId: 'sess_1', locale: 'ru', pageUrl: null, intent: null });

  const call = async (secret: string | null, envSecret: string | undefined) => {
    const request = new Request('https://gptbot.uz/api/gpt/handoff/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Internal-Secret': secret } : {}) },
      body: JSON.stringify({ payload: minted.payload, claimedBy: 'tg_pseudo_1' }),
    });
    return claimPost({
      request,
      env: { GPTBOT_DRAFTS_DB: db.asD1(), GPTBOT_INTERNAL_API_SECRET: envSecret },
      waitUntil: () => {},
    } as never);
  };

  assert.equal((await call('anything', undefined)).status, 404);
  assert.equal((await call(null, 'right')).status, 401);
  assert.equal((await call('wrong', 'right')).status, 401);
  assert.equal(db.value('SELECT claimed_at FROM gpt_handoffs'), null, 'a refused call must not consume the token');

  const ok = await call('right', 'right');
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), {
    ok: true,
    sessionId: 'sess_1',
    locale: 'ru',
    pageUrl: null,
    intent: null,
    createdAt: db.value('SELECT created_at FROM gpt_handoffs'),
    claimedAt: db.value('SELECT claimed_at FROM gpt_handoffs'),
  });

  const replay = await call('right', 'right');
  assert.deepEqual(await replay.json(), { ok: false, code: 'already_claimed' });
});

test('loadTranscript returns the tail in chronological order', async () => {
  const db = await database();
  db.exec(
    "INSERT INTO gpt_messages (id, session_id, role, content, created_at) VALUES "
    + "('m1','s','user','one','2026-09-04T10:00:00.000Z'),"
    + "('m2','s','assistant','two','2026-09-04T10:00:01.000Z'),"
    + "('m3','s','user','three','2026-09-04T10:00:02.000Z')",
  );
  const turns = await loadTranscript(db.asD1(), 's', 2);
  assert.deepEqual(turns, [
    { role: 'assistant', content: 'two' },
    { role: 'user', content: 'three' },
  ]);
});
