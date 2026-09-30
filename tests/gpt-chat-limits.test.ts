// Limits and an honest 429 (plan WP-05, decisions L3, L5 and L18): the
// precise reason and when a turn fits again; signing in does not reset the
// free tier; a spent or ended pack does not block it; a pack has no hourly
// cap; refusals are counted without text; the visitor reads it in RU or UZ
// with no plan names.
// Run: node --import tsx --test tests/gpt-chat-limits.test.ts
//
// Real SQLite behind the billing fixture; fetch is mocked where a turn is admitted.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { billingFixture } from './helpers/gpt-billing-fixture';
import { resolveConfig } from '../functions/lib/gpt-chat/config';
import { BILLING_ORG } from '../functions/lib/gpt-chat/billing-config';
import { BillingStore, type AccessPeriod } from '../functions/lib/gpt-chat/billing-store';
import { hashIp } from '../functions/lib/gpt-chat/hash';
import { spendDay } from '../functions/lib/gpt-chat/model-spend-store';
import { limitMessage, providerMessage } from '../functions/lib/gpt-chat/chat-copy';
import { PACK_DAILY_LIMIT, TurnStore, type LimitReason } from '../functions/lib/gpt-chat/turn-store';
import { onRequestPost as chat } from '../functions/api/gpt/chat';
import { onRequestGet as account } from '../functions/api/gpt/account';

type Fixture = Awaited<ReturnType<typeof billingFixture>>;
type Row = Record<string, unknown>;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// 10:00 UTC, 15:00 in Tashkent.
const T0 = Date.UTC(2026, 9, 1, 10);
const MIDNIGHT = Date.UTC(2026, 9, 2);
const IP = '203.0.113.44';

async function fixture(extra: Record<string, string> = {}) {
  const f = await billingFixture();
  Object.assign(f.env, { OPENROUTER_API_KEY: randomBytes(24).toString('hex'), ...extra });
  return f;
}

interface Turn {
  subject: string;
  ip: string;
  at: number;
  status?: 'done' | 'reserved' | 'released';
  period?: string | null;
  org?: string;
}

/** Reservations as the chat leaves them (expires_at = created_at + 120 s). */
function seed(f: Fixture, turns: Turn[]) {
  for (const turn of turns)
    f.db
      .prepare(
        'INSERT INTO gpt_turn_reservations(org_id,id,subject,ip_hash,period_id,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .bind(
        turn.org ?? BILLING_ORG,
        crypto.randomUUID(),
        turn.subject,
        turn.ip,
        turn.period ?? null,
        turn.status ?? 'done',
        turn.at,
        turn.at + 120_000,
      )
      .runSync();
}

function times(n: number, at: (i: number) => number, turn: Omit<Turn, 'at'>): Turn[] {
  return Array.from({ length: n }, (_, i) => ({ ...turn, at: at(i) }));
}

/** A pack of `f.user` in mode 'test' (the fixture's billing mode). */
function pack(f: Fixture, order: string, limit: number, { from = T0 - DAY, to = T0 + 20 * DAY } = {}): AccessPeriod {
  f.db
    .prepare(
      "INSERT INTO gpt_access_periods(org_id,order_id,user_id,mode,starts_at,ends_at,message_limit) VALUES(?,?,?,'test',?,?,?)",
    )
    .bind(BILLING_ORG, order, f.user, from, to, limit)
    .runSync();
  return { order_id: order, starts_at: from, ends_at: to, message_limit: limit, refund_requested_at: null };
}

function openrouter(t: TestContext) {
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const host = new URL(input instanceof Request ? input.url : String(input)).host;
    if (host !== 'openrouter.ai') throw new Error(`unexpected host ${host}`);
    return Response.json({
      choices: [{ message: { content: 'Javob' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 40, completion_tokens: 5 },
    });
  });
}

function request(f: Fixture, body: Record<string, unknown> = {}, init: { cookie?: string; ip?: string } = {}) {
  return f.ctx(
    new Request('https://gpt.test/api/gpt/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': init.ip ?? IP,
        ...(init.cookie ? { cookie: init.cookie } : {}),
      },
      body: JSON.stringify({ message: 'Salom', locale: 'ru', ...body }),
    }),
  ) as unknown as Parameters<typeof chat>[0];
}

async function drain(f: Fixture) {
  for (let i = 0; i < f.background.length; i++) await f.background[i];
}

function limitHits(f: Fixture): Row[] {
  return f.db
    .rows<Row>('SELECT org_id, day, reason, tier, subject, n FROM gpt_limit_hits ORDER BY org_id, day, subject, reason')
    .map((row) => ({ ...row }));
}

test('explain: the free hour is counted by account and by IP hash, and lifts an hour after the limit-th newest turn', async () => {
  const f = await fixture();
  const turns = new TurnStore(f.binding, BILLING_ORG);
  const cfg = resolveConfig(f.env);
  // An account that moved between networks: its own five answers in the hour.
  seed(f, times(5, (i) => T0 - (50 - 10 * i) * MIN, { subject: 'acct_moving', ip: 'ip-home' }).map((turn, i) => ({ ...turn, ip: `ip-${i}` })));
  assert.deepEqual(await turns.explain('acct_moving', 'ip-new', null, cfg, T0), { reason: 'hourly', retryAt: T0 + 10 * MIN, remaining: 10 });
  assert.equal((await turns.reserve('acct_moving', 'ip-new', null, cfg, T0)).limit?.reason, 'hourly');
  // A guest's five answers bind whoever signs in on that address.
  seed(f, times(5, (i) => T0 - (45 - 10 * i) * MIN, { subject: 'guest-hash', ip: 'ip-home' }));
  assert.deepEqual(await turns.explain('acct_fresh', 'ip-home', null, cfg, T0), { reason: 'hourly', retryAt: T0 + 15 * MIN, remaining: 10 });
  // Seven rows on one address (neighbours, rows admitted before this rule):
  // it opens when the fifth newest leaves the hour, not the oldest.
  seed(f, [55, 50, 40, 30, 20, 10, 5].map((m, i) => ({ subject: `neighbour-${i}`, ip: 'ip-cgnat', at: T0 - m * MIN })));
  assert.deepEqual(await turns.explain('guest-new', 'ip-cgnat', null, cfg, T0), { reason: 'hourly', retryAt: T0 + 20 * MIN, remaining: 8 });
  // Released turns (failures, truncations) and expired reservations do not count.
  seed(f, [
    ...times(5, (i) => T0 - i * MIN, { subject: 'unlucky', ip: 'ip-u', status: 'released' }),
    ...times(3, (i) => T0 - (10 + i) * MIN, { subject: 'unlucky', ip: 'ip-u', status: 'reserved' }),
  ]);
  assert.equal(await turns.explain('unlucky', 'ip-u', null, cfg, T0), null);
  assert.ok((await turns.reserve('unlucky', 'ip-u', null, cfg, T0)).id);
});

test('explain: the day, a turn in flight and the address ceiling each name their own reason and time', async () => {
  const f = await fixture();
  const turns = new TurnStore(f.binding, BILLING_ORG);
  const cfg = resolveConfig(f.env);
  // Fifteen answers today, none in the last hour: tomorrow 00:00 UTC (05:00 Tashkent).
  seed(f, times(15, (i) => T0 - (9 * HOUR - i * 20 * MIN), { subject: 'daily', ip: 'ip-d' }));
  assert.deepEqual(await turns.explain('daily', 'ip-d', null, cfg, T0), { reason: 'daily', retryAt: MIDNIGHT, remaining: 0 });
  // The same day spent through the address, by a guest who then signs in.
  assert.deepEqual(await turns.explain('acct_after_login', 'ip-d', null, cfg, T0), { reason: 'daily', retryAt: MIDNIGHT, remaining: 0 });
  // Day and hour both refuse: the reason is the one that lifts last.
  seed(f, [
    ...times(10, (i) => T0 - (9 * HOUR - i * 20 * MIN), { subject: 'both', ip: 'ip-b' }),
    ...times(5, (i) => T0 - (50 - 10 * i) * MIN, { subject: 'both', ip: 'ip-b' }),
  ]);
  assert.deepEqual(await turns.explain('both', 'ip-b', null, cfg, T0), { reason: 'daily', retryAt: MIDNIGHT, remaining: 0 });
  // Yesterday's answers are gone at midnight.
  seed(f, times(15, (i) => T0 - DAY + i * MIN, { subject: 'yesterday', ip: 'ip-y' }));
  assert.equal(await turns.explain('yesterday', 'ip-y', null, cfg, T0), null);
  // Two answers in flight: the earlier expiry frees a slot.
  seed(f, [
    { subject: 'busy', ip: 'ip-busy', at: T0 - 30_000, status: 'reserved' },
    { subject: 'busy', ip: 'ip-busy', at: T0 - 10_000, status: 'reserved' },
  ]);
  assert.deepEqual(await turns.explain('busy', 'ip-busy', null, cfg, T0), { reason: 'busy', retryAt: T0 + 90_000, remaining: 13 });
  // 101 requests from one address in the hour, whatever became of them (all
  // released here, so no answer limit applies): the 100th newest lifts it.
  seed(f, times(101, (i) => T0 - 3000_000 + i * 25_000, { subject: 'flood', ip: 'ip-flood', status: 'released' }));
  assert.deepEqual(await turns.explain('guest-flood', 'ip-flood', null, cfg, T0), { reason: 'ip', retryAt: T0 - 2975_000 + HOUR, remaining: 15 });
  // A pack has a ceiling ten times higher on the same address.
  const p = pack(f, 'pack-flood', 300);
  assert.equal(await turns.explain(f.user, 'ip-flood', p, cfg, T0), null);
});

test('a pack: 50 a day, no hourly cap; spent or ended it is "monthly", which time does not lift', async () => {
  const f = await fixture();
  const turns = new TurnStore(f.binding, BILLING_ORG);
  const cfg = resolveConfig(f.env);
  const p = pack(f, 'pack-a', 300);
  // Thirty answers in the last hour: the removed hourly cap (was 20) does not refuse the 31st.
  seed(f, times(30, (i) => T0 - HOUR + (i + 1) * MIN, { subject: f.user, ip: 'ip-p', period: 'pack-a' }));
  const admitted = await turns.reserve(f.user, 'ip-p', p, cfg, T0);
  assert.ok(admitted.id);
  assert.equal(admitted.remaining, 269);
  await turns.finish(admitted.id!, { outcome: 'answered', charged: true });
  seed(f, times(PACK_DAILY_LIMIT - 31, (i) => T0 - 2 * HOUR - i * MIN, { subject: f.user, ip: 'ip-p', period: 'pack-a' }));
  assert.deepEqual(await turns.explain(f.user, 'ip-p', p, cfg, T0), { reason: 'pack_daily', retryAt: MIDNIGHT, remaining: 250 });
  assert.deepEqual((await turns.reserve(f.user, 'ip-p', p, cfg, T0)).limit, { reason: 'pack_daily', retryAt: MIDNIGHT, remaining: 250 });

  const spent = pack(f, 'pack-spent', 3);
  seed(f, times(3, (i) => T0 - DAY - i * MIN, { subject: f.user, ip: 'ip-p', period: 'pack-spent' }));
  assert.deepEqual(await turns.explain(f.user, 'ip-p', spent, cfg, T0), { reason: 'monthly', retryAt: null, remaining: 0 });
  const ended = pack(f, 'pack-ended', 300, { from: T0 - 40 * DAY, to: T0 - 1 });
  assert.deepEqual(await turns.explain(f.user, 'ip-p', ended, cfg, T0), { reason: 'monthly', retryAt: null, remaining: 300 });
  f.db.exec("UPDATE gpt_access_periods SET revoked_at=1 WHERE order_id='pack-a'");
  assert.equal((await turns.explain(f.user, 'ip-p', p, cfg, T0))?.reason, 'monthly');
});

test('a refusal whose cause keeps clearing before it is explained is retried once, then read as a turn in flight', async (t) => {
  const f = await fixture();
  const turns = new TurnStore(f.binding, BILLING_ORG);
  const cfg = resolveConfig(f.env);
  seed(f, times(2, (i) => T0 - (i + 1) * 1000, { subject: 'racer', ip: 'ip-r', status: 'reserved' }));
  const inserts: string[] = [];
  const prepare = f.db.prepare.bind(f.db);
  t.mock.method(f.db, 'prepare', (sql: string) => {
    if (sql.includes('INSERT INTO gpt_turn_reservations')) inserts.push(sql);
    return prepare(sql);
  });
  t.mock.method(TurnStore.prototype, 'explain', async () => null);
  assert.deepEqual(await turns.reserve('racer', 'ip-r', null, cfg, T0), {
    id: null,
    limit: { reason: 'busy', retryAt: T0 + 5_000, remaining: 13 },
  });
  assert.equal(inserts.length, 2);
});

test('limits are per org: another tenant neither refuses nor sees this org\'s turns and refusal counts', async () => {
  const f = await fixture();
  const cfg = resolveConfig(f.env);
  const mine = new TurnStore(f.binding, BILLING_ORG);
  const theirs = new TurnStore(f.binding, 'other-org');
  seed(f, times(15, (i) => T0 - (9 * HOUR - i * MIN), { subject: 'guest', ip: 'ip-o', org: 'other-org' }));
  assert.equal((await theirs.explain('guest', 'ip-o', null, cfg, T0))?.reason, 'daily');
  assert.equal(await mine.explain('guest', 'ip-o', null, cfg, T0), null);
  assert.deepEqual(await mine.allowance('guest', 'ip-o', null, cfg, T0), { remaining: 15, hourRemaining: 5 });
  await mine.recordLimitHit('hourly', 'free', 'guest', T0);
  await mine.recordLimitHit('hourly', 'free', 'guest', T0 + MIN);
  await theirs.recordLimitHit('hourly', 'free', 'guest', T0);
  await mine.recordLimitHit('hourly', 'free', 'guest', T0 + DAY);
  assert.deepEqual(limitHits(f), [
    { org_id: BILLING_ORG, day: '2026-10-01', reason: 'hourly', tier: 'free', subject: 'guest', n: 2 },
    { org_id: BILLING_ORG, day: '2026-10-02', reason: 'hourly', tier: 'free', subject: 'guest', n: 1 },
    { org_id: 'other-org', day: '2026-10-01', reason: 'hourly', tier: 'free', subject: 'guest', n: 1 },
  ]);
});

test('the sixth message in an hour: 429 hourly with retryAt, retryAfterSec, Retry-After and a message in the visitor language', async () => {
  const f = await fixture();
  const now = Date.now();
  const ipHash = await hashIp(IP, '');
  const today = Math.floor(now / DAY) * DAY;
  const seeded = times(5, (i) => now - (50 - 10 * i) * 1000, { subject: ipHash, ip: ipHash });
  seed(f, seeded);
  const remaining = 15 - seeded.filter((turn) => turn.at >= today).length;

  const ru = await chat(request(f));
  await drain(f);
  assert.equal(ru.status, 429);
  const body = (await ru.json()) as Row;
  const retryAt = seeded[0].at + HOUR;
  const retryAfterSec = body.retryAfterSec as number;
  assert.deepEqual({ ...body, retryAfterSec: 0, message: '' }, {
    ok: false,
    code: 'limit_reached',
    reason: 'hourly',
    tier: 'free',
    remaining,
    limits: { daily: 15, hourly: 5 },
    retryAt,
    retryAfterSec: 0,
    message: '',
  });
  assert.ok(retryAfterSec > 3500 && retryAfterSec <= 3600, String(retryAfterSec));
  assert.equal(ru.headers.get('retry-after'), String(retryAfterSec));
  assert.match(ru.headers.get('cache-control')!, /no-store/);
  assert.match(body.message as string, /^Лимит бесплатных сообщений в час — 5\. Снова написать можно через (59|60) мин\.$/);

  const uz = await chat(request(f, { locale: 'uz' }));
  await drain(f);
  assert.equal(uz.status, 429);
  assert.match(((await uz.json()) as Row).message as string, /^Bir soatda 5 ta bepul xabar yozish mumkin\. (59|60) daqiqadan keyin yana yozasiz\.$/);
  // A refusal reserves nothing and is counted once per refusal, without text or address.
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_turn_reservations'), 5);
  assert.deepEqual(limitHits(f), [
    { org_id: BILLING_ORG, day: spendDay(now), reason: 'hourly', tier: 'free', subject: ipHash, n: 2 },
  ]);
});

test('signing in does not reset the free allowance: the account inherits what the address spent', async (t) => {
  const f = await fixture();
  openrouter(t);
  for (let i = 0; i < 5; i++) {
    const response = await chat(request(f));
    assert.equal(((await response.json()) as Row).ok, true, `turn ${i + 1}`);
  }
  await drain(f);
  const guest = (await (await chat(request(f))).json()) as Row;
  const signedIn = await chat(request(f, {}, { cookie: f.cookie }));
  await drain(f);
  assert.equal(signedIn.status, 429);
  const body = (await signedIn.json()) as Row;
  assert.deepEqual([guest.reason, guest.remaining], ['hourly', 10]);
  assert.deepEqual([body.reason, body.tier, body.remaining, body.retryAt], ['hourly', 'free', 10, guest.retryAt]);
  // The account panel shows the same count.
  const view = (await (
    await account(f.ctx(new Request('https://gpt.test/api/gpt/account', { headers: { cookie: f.cookie, 'CF-Connecting-IP': IP } })) as never)
  ).json()) as Row;
  assert.equal(view.remaining, 10);
  assert.deepEqual(view.freeLimits, { daily: 15, hourly: 5 });
  // Another address has its own allowance, and the account has spent nothing itself.
  const elsewhere = await chat(request(f, {}, { cookie: f.cookie, ip: '198.51.100.7' }));
  assert.equal(elsewhere.status, 200);
  assert.equal(((await elsewhere.json()) as Row).ok, true);
});

test('a spent or ended pack does not block the free tier, even when it runs out between access() and the reservation', async (t) => {
  const f = await fixture();
  openrouter(t);
  const now = Date.now();
  const spent = pack(f, 'pack-spent', 2, { from: now - DAY, to: now + 20 * DAY });
  seed(f, times(2, (i) => now - DAY + i * MIN, { subject: f.user, ip: 'ip-then', period: 'pack-spent' }));
  pack(f, 'pack-ended', 300, { from: now - 40 * DAY, to: now - 1000 });
  const periods = () =>
    f.db.rows<{ period_id: string | null }>(
      "SELECT period_id FROM gpt_turn_reservations WHERE status='done' AND created_at>=? ORDER BY created_at",
      now,
    ).map((row) => row.period_id);

  const first = (await (await chat(request(f, {}, { cookie: f.cookie }))).json()) as Row;
  assert.deepEqual([first.ok, first.remaining, first.hourRemaining], [true, 14, 4]);
  // The pack was still readable when access() ran and spent by the reservation.
  t.mock.method(BillingStore.prototype, 'access', async () => spent);
  const raced = (await (await chat(request(f, {}, { cookie: f.cookie }))).json()) as Row;
  await drain(f);
  assert.deepEqual([raced.ok, raced.remaining, raced.hourRemaining], [true, 13, 3]);
  assert.deepEqual(periods(), [null, null]);
  assert.deepEqual(limitHits(f), []);
});

test('the pack day: 429 pack_daily with the pack tier, limits and what is left in the pack', async () => {
  const f = await fixture();
  const now = Date.now();
  const today = Math.floor(now / DAY) * DAY;
  pack(f, 'pack-live', 300, { from: now - DAY, to: now + 20 * DAY });
  seed(f, times(PACK_DAILY_LIMIT, (i) => Math.max(today, now - (i + 1) * 1000), { subject: f.user, ip: 'ip-p', period: 'pack-live' }));
  const response = await chat(request(f, {}, { cookie: f.cookie }));
  await drain(f);
  assert.equal(response.status, 429);
  const body = (await response.json()) as Row;
  assert.deepEqual([body.reason, body.tier, body.remaining, body.limits, body.retryAt], ['pack_daily', 'paid', 250, { daily: 50, hourly: null }, today + DAY]);
  assert.equal(response.headers.get('retry-after'), String(body.retryAfterSec));
  const untilMidnight = Math.ceil((today + DAY - now) / 1000);
  assert.ok((body.retryAfterSec as number) <= untilMidnight && (body.retryAfterSec as number) >= untilMidnight - 30, String(body.retryAfterSec));
  // 'сегодня' when this runs between 00:00 and 05:00 in Tashkent (pinned by the day-word test below).
  assert.match(body.message as string, /ответов в день: 50.*(сегодня|завтра) с 05:00 по Ташкенту.*осталось: 250\.$/);
  assert.deepEqual(limitHits(f).map((row) => [row.reason, row.tier, row.subject, row.n]), [['pack_daily', 'paid', f.user, 1]]);
});

test('the texts: every reason and failure in RU and UZ, no plan names, letter apostrophes, minutes rounded up', () => {
  const reasons: LimitReason[] = ['hourly', 'daily', 'pack_daily', 'monthly', 'busy', 'ip'];
  const facts = { limits: { daily: 15, hourly: 5 }, remaining: 7, retryAfterSec: 61 };
  const texts = [
    ...reasons.flatMap((reason) => (['ru', 'uz'] as const).map((locale) => [locale, limitMessage(reason, locale, facts)])),
    ...[undefined, 'no_key', 'rate_limit', 'model_unavailable', 'timeout', 'provider_error'].flatMap((code) =>
      (['ru', 'uz'] as const).map((locale) => [locale, providerMessage(code, locale)]),
    ),
  ];
  assert.equal(new Set(texts.map(([, text]) => text)).size, texts.length - 2, 'undefined and provider_error share the fallback');
  for (const [locale, text] of texts) {
    assert.doesNotMatch(text, /Plus|obuna|подписк|ChatGPT|OpenAI|AI[ -]?(paket|пакет)|so‘m|сум/i, text);
    if (locale === 'uz') {
      assert.doesNotMatch(text, /[А-Яа-яЁё]|'|[og]’/, text);
    } else assert.match(text, /[А-Яа-я]/, text);
  }
  assert.match(limitMessage('hourly', 'ru', facts), /через 2 мин/);
  assert.match(limitMessage('ip', 'uz', { ...facts, retryAfterSec: 1 }), /^Tarmog‘ingizdan .* 1 daqiqadan keyin/);
  assert.match(limitMessage('daily', 'uz', { ...facts, retryAfterSec: 14 * 3600 }), /^Kunlik 15 ta bepul xabar tugadi\. Ertaga soat 05:00 dan \(Toshkent vaqti bilan\)/);
  assert.match(limitMessage('pack_daily', 'uz', { ...facts, limits: { daily: 50, hourly: null } }), /\(50 ta javob\).* paketda 7 ta javob qoldi\.$/);
  assert.match(providerMessage('rate_limit', 'uz'), /^Hozir so‘rovlar ko‘p\./);
  // The chat endpoint carries no plan names of its own.
  assert.doesNotMatch(readFileSync(new URL('../functions/api/gpt/chat.ts', import.meta.url), 'utf8'), /Plus|оформите/);
});

test('the day lifts at 05:00 in Tashkent: "today" when refused between 00:00 and 05:00 there, "tomorrow" otherwise', () => {
  const tashkentDate = (ms: number) => new Date(ms + 5 * HOUR).toISOString().slice(0, 10);
  // Refusal times in UTC; Tashkent is five hours ahead.
  const cases: Array<[at: number, sameDay: boolean]> = [
    [Date.UTC(2026, 9, 1, 10), false], // 15:00
    [Date.UTC(2026, 9, 1, 18, 59, 59), false], // 23:59:59
    [Date.UTC(2026, 9, 1, 19), true], // 00:00
    [Date.UTC(2026, 9, 1, 21), true], // 02:00
    [Date.UTC(2026, 9, 1, 23, 59, 59), true], // 04:59:59
    [Date.UTC(2026, 9, 2), false], // 05:00, the day has just turned
  ];
  for (const [at, sameDay] of cases) {
    // As the chat sends it: the next UTC midnight, in whole seconds rounded up.
    const retryAt = Math.floor(at / DAY) * DAY + DAY;
    assert.equal(tashkentDate(at) === tashkentDate(retryAt), sameDay, new Date(at).toISOString());
    const facts = { limits: { daily: 15, hourly: 5 }, remaining: 0, retryAfterSec: Math.ceil((retryAt - at) / 1000) };
    const packFacts = { ...facts, limits: { daily: 50, hourly: null }, remaining: 250 };
    const [ru, uz] = sameDay ? ['сегодня', 'Bugun'] : ['завтра', 'Ertaga'];
    assert.match(limitMessage('daily', 'ru', facts), new RegExp(`^Бесплатные сообщения закончились \\(в день — 15\\)\\. Снова писать можно ${ru} с 05:00 по Ташкенту\\.$`));
    assert.match(limitMessage('daily', 'uz', facts), new RegExp(`^Kunlik 15 ta bepul xabar tugadi\\. ${uz} soat 05:00 dan \\(Toshkent vaqti bilan\\) yana yozishingiz mumkin\\.$`));
    assert.match(limitMessage('pack_daily', 'ru', packFacts), new RegExp(`Продолжить можно ${ru} с 05:00 по Ташкенту; ответов в пакете осталось: 250\\.$`));
    assert.match(limitMessage('pack_daily', 'uz', packFacts), new RegExp(`tugadi\\. ${uz} soat 05:00 dan \\(Toshkent vaqti bilan\\) davom ettirasiz;`));
  }
});

test('a failed turn answers in the visitor language', async () => {
  const f = await fixture({ OPENROUTER_API_KEY: '' });
  const uz = (await (await chat(request(f, { locale: 'uz' }))).json()) as Row;
  const ru = (await (await chat(request(f))).json()) as Row;
  await drain(f);
  assert.deepEqual([uz.code, uz.message], ['no_key', providerMessage('no_key', 'uz')]);
  assert.deepEqual([ru.code, ru.message], ['no_key', providerMessage('no_key', 'ru')]);
});

test('a guest account view carries the free limits from the config and still reads no database', async () => {
  let calls = 0;
  const bomb = { prepare() { calls++; throw Error('unavailable'); }, batch() { calls++; throw Error('unavailable'); } };
  const view = async (env: Record<string, unknown>) =>
    (await (await account({ request: new Request('https://gpt.test/api/gpt/account'), env } as never)).json()) as Row;
  assert.deepEqual((await view({ GPTBOT_DRAFTS_DB: bomb })).freeLimits, { daily: 15, hourly: 5 });
  assert.deepEqual((await view({ GPTBOT_DRAFTS_DB: bomb, GPT_FREE_DAILY_LIMIT: '30', GPT_FREE_HOURLY_LIMIT: '8' })).freeLimits, { daily: 30, hourly: 8 });
  assert.equal(calls, 0);
});
