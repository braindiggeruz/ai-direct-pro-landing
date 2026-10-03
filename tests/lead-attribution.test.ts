// Lead source, service and first-touch attribution on POST /api/gpt/lead.
//
// Run: node --import tsx --test tests/lead-attribution.test.ts
//
// Why this file exists: from 2026-09-04 (3ec1c761) the Telegram-bot cost
// calculator sent contactType 'calculator_contact'. validateLead only knows
// phone / telegram / email, so every calculator lead was rejected with
// "contact does not match contactType". The calculator now lets the server
// detect the contact, and says where the lead came from. These tests pin:
//   - the calculator's real payload is accepted (phone and @handle);
//   - an untyped contact is routed by its shape, so digits inside a handle or
//     an e-mail are never stored as somebody's phone number;
//   - the source is whitelisted, and a body that names none is 'unknown'
//     (paid-chat WP-20: it used to be credited to the chat as 'gpt_chat');
//   - bad service / attribution values are dropped, never stored;
//   - attribution can never replace a utm key the client sent;
//   - the owner alert names the source, service and page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { SqliteD1 } from './helpers/sqlite-d1';
import { ensureSchema } from '../functions/lib/gpt-chat/schema';
import {
  buildLeadUtmJson,
  normalizeLeadService,
  normalizeLeadSource,
  sanitizeLeadAttribution,
  validateLead,
  type LeadInput,
} from '../functions/lib/gpt-chat/validate';
import { buildLeadAlert, sourceSummary, type LeadAlert } from '../functions/lib/gpt-chat/notify';
import { serviceFromUtmJson } from '../functions/lib/gpt-chat/lead-outbox';
import { onRequestPost as leadPost } from '../functions/api/gpt/lead';
import { buildEstimateSummary, calculateEstimate, DEFAULT_SELECTION } from '../src/calculator/pricing';

const CALCULATOR_PAGE = '/ru/kalkulyator-stoimosti-telegram-bota/';

/** Exactly the body src/calculator/CalculatorApp.tsx submitLead now posts. */
function calculatorPayload(contactValue: string, over: Partial<LeadInput> = {}): LeadInput & { locale?: string } {
  return {
    requestId: 'calc_0123456789abcdef0123456789abcdef',
    source: 'calculator',
    service: 'telegram-bot',
    name: 'Ali',
    contactValue,
    consent: true,
    intent: buildEstimateSummary(calculateEstimate(DEFAULT_SELECTION)).slice(0, 500),
    pageUrl: CALCULATOR_PAGE,
    attribution: {
      landing: '/uz/telegram-bot-yaratish/',
      referrerHost: 'www.google.com',
      gclid: 'Cj0KCQjw_abc-123.x',
      firstSeenAt: '2026-09-28T08:15:00.000Z',
    },
    utm: {
      tool: 'telegram_cost_calculator',
      utm_source: 'google',
      utm_medium: 'cpc',
      goal: DEFAULT_SELECTION.goalId,
      features: DEFAULT_SELECTION.featureIds.join(','),
      volume: DEFAULT_SELECTION.volumeId,
      readiness: DEFAULT_SELECTION.readinessId,
      estimate_min: '990000',
      estimate_max: '1490000',
    },
    ...over,
  };
}

// ── validateLead ────────────────────────────────────────────────────────────

test('the calculator payload with a phone number is accepted', () => {
  const res = validateLead(calculatorPayload('+998 90 123 45 67'));
  assert.equal(res.ok, true, res.error);
  assert.equal(res.value?.contactType, 'phone');
  assert.equal(res.value?.contactValue, '+998901234567');
  assert.equal(res.value?.source, 'calculator');
  assert.equal(res.value?.service, 'telegram-bot');
  assert.equal(res.value?.pageUrl, CALCULATOR_PAGE);
  assert.equal(res.value?.requestId, 'calc_0123456789abcdef0123456789abcdef');
});

test('the calculator payload with a Telegram handle is accepted', () => {
  for (const handle of ['@alisher_uz', 'alisher_uz', 'https://t.me/alisher_uz']) {
    const res = validateLead(calculatorPayload(handle));
    assert.equal(res.ok, true, `${handle}: ${res.error}`);
    assert.equal(res.value?.contactType, 'telegram');
    assert.equal(res.value?.contactValue, '@alisher_uz');
  }
});

test('an untyped contact is routed by its shape: digits inside a handle or e-mail never become a phone', () => {
  // Before 2026-09-29 the untyped branch tried the phone parser first, and it
  // kept only the digits: every value below was stored as +998…, a number the
  // visitor never gave. Both untyped surfaces are checked.
  const cases: Array<[string, string, string]> = [
    ['@aziz_93_1234567', 'telegram', '@aziz_93_1234567'],
    ['@aziz901234567', 'telegram', '@aziz901234567'],
    ['@ali901234567', 'telegram', '@ali901234567'],
    ['aziz_901234567', 'telegram', '@aziz_901234567'],
    ['t.me/aziz901234567', 'telegram', '@aziz901234567'],
    ['https://t.me/ali901234567', 'telegram', '@ali901234567'],
    ['aziz901234567@gmail.com', 'email', 'aziz901234567@gmail.com'],
    ['ali901234567@mail.ru', 'email', 'ali901234567@mail.ru'],
    ['+998 90 123 45 67', 'phone', '+998901234567'],
    ['(90) 123-45-67', 'phone', '+998901234567'],
    ['998901234567', 'phone', '+998901234567'],
    ['tel:+998901234567', 'phone', '+998901234567'],
    ['90\u00a0123\u00a045\u00a067', 'phone', '+998901234567'],
  ];
  for (const source of ['calculator', 'page_form'] as const) {
    for (const [raw, type, value] of cases) {
      const res = validateLead(calculatorPayload(raw, { source }));
      assert.equal(res.ok, true, `${source} ${raw}: ${res.error}`);
      assert.equal(res.value?.contactType, type, `${source} ${raw}`);
      assert.equal(res.value?.contactValue, value, `${source} ${raw}`);
    }
  }
  // A value that fails the parser its shape points at is rejected, not re-read
  // as another kind of contact.
  for (const raw of ['@ab', 't.me/+998901234567', 'aziz@gmail', 'позвоните 901234567', '90 123 45', 'aziz 901234567']) {
    const res = validateLead(calculatorPayload(raw));
    assert.equal(res.ok, false, raw);
    assert.equal(res.error, 'at least one contact is required', raw);
  }
  // The same gate protects the typed and the legacy phone paths.
  assert.equal(validateLead({ consent: true, contactType: 'phone', contactValue: '@aziz901234567' }).ok, false);
  assert.equal(validateLead({ consent: true, phone: 'aziz901234567@gmail.com' }).ok, false);
});

test('the broken pre-fix payload is still rejected, and the calculator no longer sends it', () => {
  // Existing behaviour is kept: an unknown contactType is a hard error.
  const legacy = validateLead({ ...calculatorPayload('+998901234567'), contactType: 'calculator_contact' });
  assert.equal(legacy.ok, false);
  assert.equal(legacy.error, 'contact does not match contactType');

  const source = readFileSync(path.join(process.cwd(), 'src/calculator/CalculatorApp.tsx'), 'utf8')
    .replace(/\r\n/g, '\n');
  const from = source.indexOf('const submitLead');
  const submit = source
    .slice(from, source.indexOf('\n  };', from))
    .split('\n')
    .filter((row) => !row.trim().startsWith('//'))
    .join('\n');
  assert.ok(from > -1 && submit.length > 200, 'submitLead not found');
  assert.doesNotMatch(submit, /contactType\s*:/, 'the calculator must let the server detect the contact');
  assert.match(submit, /source: 'calculator'/);
  assert.match(submit, /service: 'telegram-bot'/);
  assert.match(submit, /attribution: leadAttribution\(/);
  assert.match(submit, /requestId: requestIdRef\.current/);
});

test('an unknown or missing source is stored as unknown, never credited to the chat', () => {
  assert.equal(normalizeLeadSource(undefined), 'unknown');
  assert.equal(normalizeLeadSource('admin'), 'unknown');
  assert.equal(normalizeLeadSource('CALCULATOR'), 'unknown');
  assert.equal(normalizeLeadSource(' calculator'), 'unknown');
  assert.equal(normalizeLeadSource(['calculator']), 'unknown');
  for (const source of ['gpt_chat', 'chat_b2b', 'calculator', 'page_form', 'unknown'] as const) {
    assert.equal(normalizeLeadSource(source), source);
  }
  assert.equal(validateLead({ consent: true, phone: '901234567' }).value?.source, 'unknown');
  assert.equal(validateLead({ consent: true, phone: '901234567', source: 'telegram' }).value?.source, 'unknown');
  assert.equal(validateLead({ consent: true, phone: '901234567', source: 'chat_b2b' }).value?.source, 'chat_b2b');
});

test('a chat lead without the new fields keeps its utm_json byte for byte', () => {
  const utm = { utm_source: 'yandex', utm_campaign: 'uz' };
  const res = validateLead({ consent: true, phone: '901234567', utm });
  assert.equal(res.value?.utmJson, JSON.stringify(utm));
  assert.equal(res.value?.service, null);
  assert.equal(res.value?.attribution, null);
  assert.equal(validateLead({ consent: true, phone: '901234567' }).value?.utmJson, null);
});

test('a bad service slug is dropped', () => {
  for (const bad of ['Telegram-Bot', 'telegram bot', 'telegram_bot', '', 'a'.repeat(61), '<b>x</b>', 42, null]) {
    assert.equal(normalizeLeadService(bad), null, String(bad));
  }
  assert.equal(normalizeLeadService('boss-digital'), 'boss-digital');
  const res = validateLead(calculatorPayload('+998901234567', { service: 'DROP TABLE' }));
  assert.equal(res.ok, true);
  assert.equal(res.value?.service, null);
  assert.ok(!res.value?.utmJson?.includes('DROP'));
});

test('bad attribution values are dropped and unknown keys never stored', () => {
  const clean = sanitizeLeadAttribution({
    landing: 'https://gptbot.uz/ru/blog/?phone=998901234567#x',
    referrerHost: 'WWW.Google.COM',
    gclid: 'abc_DEF-1.2',
    yclid: '1234567890',
    fbclid: 'IwAR0-x_y',
    firstSeenAt: '2026-09-28T08:15:00.000Z',
    email: 'ali@example.com',
    phone: '+998901234567',
  });
  assert.deepEqual(clean, {
    landing: '/ru/blog/',
    referrerHost: 'www.google.com',
    gclid: 'abc_DEF-1.2',
    yclid: '1234567890',
    fbclid: 'IwAR0-x_y',
    firstSeenAt: '2026-09-28T08:15:00.000Z',
  });

  const dirty = sanitizeLeadAttribution({
    landing: '//evil.example/',
    referrerHost: 'https://google.com/search?q=phone',
    gclid: 'a b',
    yclid: 'x'.repeat(201),
    fbclid: '<script>',
    firstSeenAt: 'yesterday',
  });
  assert.equal(dirty, null);
  assert.equal(sanitizeLeadAttribution(['landing']), null);
  assert.equal(sanitizeLeadAttribution('landing=/ru/'), null);
  assert.equal(sanitizeLeadAttribution({ firstSeenAt: '2026-13-45' }), null);
  assert.equal(sanitizeLeadAttribution({ firstSeenAt: '2026-09-28T08:15:00.000Z'.padEnd(41, '0') }), null);
  assert.equal(sanitizeLeadAttribution({ referrerHost: 'a'.repeat(101) }), null);

  const res = validateLead(calculatorPayload('+998901234567', {
    attribution: { landing: 'javascript:alert(1)', secret: 'x', gclid: 'ok_1' },
  }));
  assert.equal(res.ok, true);
  assert.deepEqual(res.value?.attribution, { gclid: 'ok_1' });
  const stored = JSON.parse(res.value!.utmJson!) as { attribution: Record<string, string> };
  assert.deepEqual(stored.attribution, { service: 'telegram-bot', gclid: 'ok_1' });
});

test('attribution is nested under its own key and never overrides a utm key', () => {
  const res = validateLead(calculatorPayload('+998901234567'));
  const stored = JSON.parse(res.value!.utmJson!) as Record<string, unknown>;
  assert.equal(stored.utm_source, 'google');
  assert.equal(stored.utm_medium, 'cpc');
  assert.equal(stored.tool, 'telegram_cost_calculator');
  assert.equal(stored.estimate_min, '990000');
  assert.deepEqual(stored.attribution, {
    service: 'telegram-bot',
    landing: '/uz/telegram-bot-yaratish/',
    referrerHost: 'www.google.com',
    gclid: 'Cj0KCQjw_abc-123.x',
    firstSeenAt: '2026-09-28T08:15:00.000Z',
  });

  // A client that already used the "attribution" key keeps its own value.
  const own = { utm_source: 'x', attribution: 'client-value' };
  assert.equal(
    buildLeadUtmJson(own, 'smm', { gclid: 'abc' }),
    JSON.stringify(own),
  );
  // An attribution field that shares a utm key's name cannot reach the top level.
  const merged = JSON.parse(buildLeadUtmJson({ utm_source: 'google' }, null, { landing: '/ru/' })!) as Record<string, unknown>;
  assert.equal(merged.utm_source, 'google');
  assert.equal(merged.landing, undefined);
  // No utm at all: attribution alone is still stored.
  assert.deepEqual(
    JSON.parse(buildLeadUtmJson(undefined, 'target', null)!),
    { attribution: { service: 'target' } },
  );
  // Arrays are stored as before and never merged into.
  assert.equal(buildLeadUtmJson(['a'], 'smm', null), '["a"]');
  // A merge that would not fit the column falls back to the legacy form.
  const big = { utm_content: 'x'.repeat(1990) };
  assert.equal(buildLeadUtmJson(big, 'smm', null), JSON.stringify(big).slice(0, 2000));
});

// ── owner alert ─────────────────────────────────────────────────────────────

const ALERT: LeadAlert = {
  leadId: 'lead_calc',
  name: 'Ali',
  contactType: 'phone',
  contactValue: '+998901234567',
  intent: 'Telegram-бот',
  locale: 'ru',
  pageUrl: CALCULATOR_PAGE,
  sessionId: null,
  utmJson: null,
  createdAt: '2026-09-29T10:00:00.000Z',
  shareConversation: false,
};

test('the owner alert names the source, the service and the page', () => {
  const { text } = buildLeadAlert({ ...ALERT, source: 'calculator', service: 'telegram-bot' });
  assert.match(text, /Заявка из калькулятора/);
  assert.ok(
    text.includes(`<b>Источник:</b> калькулятор · услуга telegram-bot · ${CALCULATOR_PAGE}\n`),
    text,
  );
  // A calculator lead has no conversation, so there is nothing to withhold.
  assert.doesNotMatch(text, /Переписку/);
});

test('the chat alert keeps its head and its consent note', () => {
  const { text } = buildLeadAlert({ ...ALERT, source: 'gpt_chat', sessionId: 'sess_1' });
  assert.match(text, /Заявка из AI-чата/);
  assert.match(text, /Источник:<\/b> AI-чат · \/ru\//);
  assert.match(text, /Переписку передавать не разрешили/);
  // Rows written before the source line existed render exactly as before.
  const legacy = buildLeadAlert({ ...ALERT, sessionId: 'sess_1' }).text;
  assert.doesNotMatch(legacy, /Источник/);
  assert.match(legacy, /Заявка из AI-чата/);
});

test('the source line is escaped and an unknown source is shown verbatim', () => {
  assert.equal(sourceSummary({ source: null, service: null, pageUrl: '/ru/' }), null);
  assert.equal(sourceSummary({ source: 'page_form', service: null, pageUrl: null }), 'форма на странице');
  const { text } = buildLeadAlert({ ...ALERT, source: '<i>x</i>', service: null });
  assert.ok(text.includes('&lt;i&gt;x&lt;/i&gt;'));
  assert.equal(sourceSummary({ source: 'constructor', service: null, pageUrl: null }), 'constructor');
});

test('the service is read back from utm_json and re-validated', () => {
  assert.equal(serviceFromUtmJson(JSON.stringify({ attribution: { service: 'internet-reklama' } })), 'internet-reklama');
  assert.equal(serviceFromUtmJson(JSON.stringify({ attribution: { service: '<b>' } })), null);
  assert.equal(serviceFromUtmJson(JSON.stringify({ utm_source: 'x' })), null);
  assert.equal(serviceFromUtmJson('{"broken'), null);
  assert.equal(serviceFromUtmJson(null), null);
});

// ── the endpoint, end to end ────────────────────────────────────────────────

async function database(): Promise<SqliteD1> {
  const db = new SqliteD1();
  await ensureSchema(db.asD1());
  return db;
}

function stubTelegram(): { texts: string[]; restore(): void } {
  const previous = globalThis.fetch;
  const texts: string[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    assert.ok(String(url).startsWith('https://api.telegram.org/'), `unexpected fetch to ${String(url)}`);
    const body = JSON.parse(String(init?.body || '{}')) as { text?: string };
    texts.push(String(body.text ?? ''));
    return new Response(JSON.stringify({ ok: true, result: { message_id: texts.length } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { texts, restore: () => { globalThis.fetch = previous; } };
}

function context(db: SqliteD1, body: unknown) {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: {
      request: new Request('https://gptbot.uz/api/gpt/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
        body: JSON.stringify(body),
      }),
      env: {
        GPT_NOTIFY_BOT_TOKEN: 'test-bot-token-never-logged',
        GPT_NOTIFY_CHAT_ID: '4242',
        GPT_HASH_SALT: 'salt',
        GPTBOT_DRAFTS_DB: db.asD1(),
      },
      waitUntil: (p: Promise<unknown>) => { pending.push(p); },
    },
    settle: () => Promise.all(pending),
  };
}

for (const [label, contact, stored] of [
  ['phone', '90 123 45 67', '+998901234567'],
  ['@telegram', '@alisher_uz', '@alisher_uz'],
] as const) {
  test(`a calculator lead (${label}) is stored with its source and reaches the owner`, async () => {
    const db = await database();
    const stub = stubTelegram();
    try {
      const { ctx, settle } = context(db, { ...calculatorPayload(contact), locale: 'ru' });
      const res = await leadPost(ctx as never);
      const payload = await res.json() as { ok: boolean; code?: string };
      assert.equal(res.status, 200, JSON.stringify(payload));
      assert.equal(payload.ok, true);
      await settle();

      const rows = db.rows<{ source: string; contact_value: string; utm_json: string; page_url: string }>(
        'SELECT source, contact_value, utm_json, page_url FROM gpt_leads',
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].source, 'calculator');
      assert.equal(rows[0].contact_value, stored);
      assert.equal(rows[0].page_url, CALCULATOR_PAGE);
      const utm = JSON.parse(rows[0].utm_json) as { utm_source: string; attribution: { service: string; gclid: string } };
      assert.equal(utm.utm_source, 'google');
      assert.equal(utm.attribution.service, 'telegram-bot');
      assert.equal(utm.attribution.gclid, 'Cj0KCQjw_abc-123.x');

      const event = db.value("SELECT payload_json FROM gpt_events WHERE event_name = 'GPTChatLeadSubmitted'");
      assert.equal((JSON.parse(String(event)) as { source: string }).source, 'calculator');

      assert.equal(stub.texts.length, 1);
      assert.match(stub.texts[0], /Заявка из калькулятора/);
      assert.ok(stub.texts[0].includes(`калькулятор · услуга telegram-bot · ${CALCULATOR_PAGE}`), stub.texts[0]);
    } finally {
      stub.restore();
    }
  });
}

test('a lead that names no known source is stored as unknown and says so to the owner', async () => {
  const db = await database();
  const stub = stubTelegram();
  try {
    const { ctx, settle } = context(db, { consent: true, phone: '901234567', locale: 'uz', source: 'forged' });
    const res = await leadPost(ctx as never);
    assert.equal(res.status, 200);
    await settle();
    assert.equal(db.value('SELECT source FROM gpt_leads'), 'unknown');
    assert.equal(db.value('SELECT utm_json FROM gpt_leads'), null);
    assert.match(stub.texts[0], /Заявка с сайта/);
    assert.match(stub.texts[0], /<b>Источник:<\/b> источник не указан\n/);
    // No chat session came with it: there is no conversation to withhold.
    assert.doesNotMatch(stub.texts[0], /Переписку/);
  } finally {
    stub.restore();
  }
});

test('the chat names its forms: the business card as gpt_chat, the business line as chat_b2b', async () => {
  const db = await database();
  const stub = stubTelegram();
  try {
    for (const [source, requestId] of [['gpt_chat', 'lead_card_0123456789abcdef'], ['chat_b2b', 'lead_line_0123456789abcdef']] as const) {
      const { ctx, settle } = context(db, {
        consent: true, phone: source === 'gpt_chat' ? '901234567' : '901234568', locale: 'ru', source, requestId,
        sessionId: 'sess_b2b', pageUrl: '/ru/gpt-chat/', intent: source === 'chat_b2b' ? 'business_bot' : 'ai_bot_for_business',
      });
      assert.equal((await leadPost(ctx as never)).status, 200);
      await settle();
    }
    assert.deepEqual(
      db.rows<{ source: string; intent: string }>('SELECT source, intent FROM gpt_leads ORDER BY request_id').map((row) => ({ ...row })),
      [{ source: 'gpt_chat', intent: 'ai_bot_for_business' }, { source: 'chat_b2b', intent: 'business_bot' }],
    );
    assert.equal(stub.texts.length, 2);
    const line = stub.texts.find((text) => text.includes('business_bot'))!;
    assert.match(line, /Заявка из AI-чата/);
    assert.match(line, /<b>Источник:<\/b> AI-чат: бизнес-строка · \/ru\/gpt-chat\/\n/);
    // A conversation stands behind the line: without consent its absence is stated.
    assert.match(line, /Переписку передавать не разрешили/);
  } finally {
    stub.restore();
  }
});

test('the pre-fix calculator body is still answered invalid_lead, not stored', async () => {
  const db = await database();
  const { ctx } = context(db, { ...calculatorPayload('+998901234567'), contactType: 'calculator_contact' });
  const res = await leadPost(ctx as never);
  const payload = await res.json() as { ok: boolean; code: string };
  assert.equal(res.status, 400);
  assert.equal(payload.code, 'invalid_lead');
  assert.equal(db.value('SELECT COUNT(*) FROM gpt_leads'), 0);
});
