// The chat's limit card holds (plan WP-06, map 03 §3.1): only the server sets
// or lifts a limit, the account view never takes one down (F1), a pack that
// arrives does, the clock only says when to try again, and the limit and the
// refused question survive a reload (F2, F3).
//
// Run: node --import tsx --test tests/gpt-limit-state.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { strings } from '../src/gpt-chat/i18n';
import { limitCard, liftsToday, tashkentTime } from '../src/gpt-chat/limit-card';
import { AiUsageBadge } from '../src/gpt-chat/components/AiUsageBadge';
import {
  LIMIT_TICK_MS,
  canSendNow,
  limitCounts,
  limitReasonOf,
  loadLimit,
  nextUtcMidnight,
  reduceLimit,
  saveLimit,
  type LimitEvent,
  type LimitReason,
  type LimitState,
} from '../src/gpt-chat/limit-state';

// tsx compiles .tsx with the classic transform in tests (as in
// tests/gpt-chat-handoff-link.test.ts).
(globalThis as typeof globalThis & { React: typeof React }).React = React;

const NOW = Date.parse('2026-10-01T10:00:00Z'); // 15:00 in Tashkent
const MIN = 60_000;
const HOUR = 60 * MIN;
const REASONS: LimitReason[] = ['hourly', 'daily', 'pack_daily', 'monthly', 'busy', 'ip'];
const FREE = { daily: 15, hourly: 5 };

function blocked(reason: LimitReason, retryAfterSec: number | null, now = NOW): LimitState {
  return reduceLimit(null, { type: 'blocked', reason, retryAfterSec, limits: FREE, now })!;
}

function account(freeRemaining: number | null, packRemaining: number | null, now = NOW): LimitEvent {
  return { type: 'account', freeRemaining, packRemaining, freeLimits: FREE, now };
}

function memoryStorage(name: 'localStorage' | 'sessionStorage') {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
  });
  return values;
}

test('a 429 sets the limit with the server time, or a safe default by reason', () => {
  assert.deepEqual(blocked('hourly', 720), { reason: 'hourly', retryAt: NOW + 720_000, since: NOW, limits: FREE });
  const midnight = Date.parse('2026-10-02T00:00:00Z');
  assert.equal(nextUtcMidnight(NOW), midnight);
  // An older server without retryAfterSec, or a value that is no time at all.
  for (const missing of [null, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(blocked('hourly', missing).retryAt, NOW + HOUR);
    assert.equal(blocked('ip', missing).retryAt, NOW + HOUR);
    assert.equal(blocked('daily', missing).retryAt, midnight);
    assert.equal(blocked('pack_daily', missing).retryAt, midnight);
    assert.equal(blocked('busy', missing).retryAt, NOW + 5_000);
    assert.equal(blocked('monthly', missing).retryAt, null);
  }
  assert.equal(blocked('daily', 0).retryAt, NOW, 'zero seconds is a time, not a missing one');
});

test('the account view never takes down a limit the server set (F1)', () => {
  for (const reason of REASONS.filter((r) => r !== 'pack_daily')) {
    const state = blocked(reason, reason === 'monthly' ? null : 1800);
    // A guest's view (nothing counted), a stale cached count, a signed-in
    // free count above zero, a spent pack: none of them lifts the limit.
    for (const event of [account(null, null), account(15, null), account(3, null), account(0, null), account(null, 0)]) {
      assert.equal(reduceLimit(state, event), state, `${reason}: ${JSON.stringify(event)}`);
    }
  }
  // The P0 sequence: a 429, then the refresh after the turn and a window focus.
  let state: LimitState | null = blocked('hourly', 1800);
  for (const at of [NOW + 400, NOW + 5_000, NOW + 60_000]) state = reduceLimit(state, account(null, null, at));
  assert.equal(state?.reason, 'hourly');
  assert.equal(canSendNow(state, NOW + 60_000), false);
});

test('a pack with answers left lifts only the caps a pack removes', () => {
  for (const reason of ['hourly', 'daily', 'monthly'] as const) {
    assert.equal(reduceLimit(blocked(reason, 600), account(null, 300)), null, reason);
  }
  for (const reason of ['pack_daily', 'busy', 'ip'] as const) {
    const state = blocked(reason, 600);
    assert.equal(reduceLimit(state, account(null, 120)), state, reason);
  }
});

test('a pack day cap holds while the pack does and goes with it', () => {
  const state = reduceLimit(null, { type: 'blocked', reason: 'pack_daily', retryAfterSec: 9 * 3600, limits: { daily: 50, hourly: null }, now: NOW })!;
  // Refreshes and focus while the pack still has answers: the cap stands.
  for (const left of [1, 120, 250]) assert.equal(reduceLimit(state, account(null, left)), state, `pack ${left}`);
  // Signed out (a guest view), or signed in with the pack spent or ended: the
  // free tier applies, which the server counts apart; it decides the next turn.
  for (const event of [account(null, null), account(15, null), account(null, 0)]) {
    assert.equal(reduceLimit(state, event), null, JSON.stringify(event));
  }
  // ...unless the server counted that free day to the end as well.
  assert.deepEqual(reduceLimit(state, account(0, null, NOW + MIN)), {
    reason: 'daily', retryAt: nextUtcMidnight(NOW), since: NOW + MIN, limits: FREE,
  });
});

test('the account view sets a day limit only from the server own count, without a pack', () => {
  assert.deepEqual(reduceLimit(null, account(0, null)), {
    reason: 'daily', retryAt: nextUtcMidnight(NOW), since: NOW, limits: FREE,
  });
  assert.equal(reduceLimit(null, account(null, null)), null, 'a guest view counts nothing');
  assert.equal(reduceLimit(null, account(1, null)), null);
  assert.equal(reduceLimit(null, account(0, 12)), null, 'a pack with answers left');
});

test('an admitted turn lifts any limit', () => {
  for (const reason of REASONS) assert.equal(reduceLimit(blocked(reason, 60), { type: 'admitted' }), null);
  assert.equal(reduceLimit(null, { type: 'admitted' }), null);
});

test('the reducer is pure: frozen input, the same answer twice (StrictMode)', () => {
  const state = Object.freeze({ ...blocked('hourly', 900), limits: Object.freeze({ ...FREE }) });
  const events: LimitEvent[] = [
    { type: 'blocked', reason: 'daily', retryAfterSec: 3600, limits: FREE, now: NOW },
    account(0, null), account(null, 20), { type: 'admitted' },
  ];
  for (const event of events) {
    Object.freeze(event);
    assert.deepEqual(reduceLimit(state, event), reduceLimit(state, event));
    assert.deepEqual(reduceLimit(null, event), reduceLimit(null, event));
  }
});

test('the clock gives the send button back at retryAt; a spent pack waits for the server', () => {
  const state = blocked('hourly', 600);
  assert.equal(canSendNow(null, NOW), true);
  assert.equal(canSendNow(state, NOW), false);
  assert.equal(canSendNow(state, NOW + 599_999), false);
  assert.equal(canSendNow(state, NOW + 600_000), true);
  assert.equal(canSendNow(blocked('monthly', null), NOW + 30 * 24 * HOUR), false);
});

test('the card counts down tick by tick, then says the visitor can write again', () => {
  const card = (state: LimitState, at: number, locale: 'ru' | 'uz' = 'uz') =>
    limitCard(locale, state, { billingAvailable: false, paid: false, botHandoff: false, remaining: 10 }, at);
  const t = strings('uz');
  const state = blocked('hourly', 12 * 60);
  // Minutes and the clock in Tashkent (NOW is 15:00 there).
  assert.equal(card(state, NOW).wait, t.limitWaitAt(12, '15:12'));
  assert.equal(card(state, NOW).title, t.hourlyTitle);
  assert.equal(card(state, NOW).body, t.hourlyBody(5));
  // Four ticks later the minute has changed; the text follows the clock.
  assert.equal(card(state, NOW + 4 * LIMIT_TICK_MS).wait, t.limitWaitAt(11, '15:12'));
  assert.equal(card(state, NOW + 11 * MIN + 1).wait, t.limitLessMinute);
  assert.equal(card(state, NOW + 12 * MIN - 1).ready, false);
  const ready = card(state, NOW + 12 * MIN);
  assert.equal(ready.ready, true);
  assert.equal(ready.wait, t.limitReady);
  assert.equal(card(blocked('busy', 5), NOW).wait, t.limitLessMinute);
  assert.equal(card(blocked('monthly', null), NOW).wait, null, 'time does not lift a spent pack');
  assert.match(card(state, NOW, 'ru').wait ?? '', /через 12 мин \(в 15:12\)/);
  assert.match(card(state, NOW).wait ?? '', /12 daqiqadan keyin \(soat 15:12 da\)/);
});

test('the wait says the minutes and the time in Tashkent, the same in a WebView without time-zone data', () => {
  // 41 minutes from 15:00 in Tashkent (10:00 UTC), and across midnight there.
  assert.equal(tashkentTime(NOW + 41 * MIN), '15:41');
  assert.equal(tashkentTime(Date.parse('2026-10-01T19:05:00Z')), '00:05');
  assert.equal(tashkentTime(Number.NaN), null, 'no date, no clock');
  for (const locale of ['ru', 'uz'] as const) {
    const t = strings(locale);
    const card = limitCard(locale, blocked('hourly', 41 * 60), { billingAvailable: false, paid: false, botHandoff: false, remaining: 10 }, NOW);
    assert.equal(card.wait, t.limitWaitAt(41, '15:41'));
    assert.match(card.wait ?? '', locale === 'uz' ? /^41 daqiqadan keyin \(soat 15:41 da\) yana yozasiz\.$/ : /^Снова написать можно через 41 мин \(в 15:41\)\.$/);
    // Every other reason with a time to wait says it the same way.
    assert.equal(limitCard(locale, blocked('ip', 30 * 60), { billingAvailable: false, paid: false, botHandoff: false, remaining: 10 }, NOW).wait, t.limitWaitAt(30, '15:30'));
  }
  assert.ok(!strings('uz').limitWaitAt(5, '15:05').includes("'"));
});

test('the header counts what runs out first: this hour or today, and 0 while the hour is up', () => {
  const uz = strings('uz');
  const badge = (remaining: number, hourLeft: number | null, hourBlocked = false, locale: 'ru' | 'uz' = 'uz') =>
    renderToStaticMarkup(React.createElement(AiUsageBadge, { remaining, hourLeft, hourBlocked, t: strings(locale) }));
  const twoThisHour = badge(10, 2);
  assert.match(twoThisHour, /<span class="sm:hidden" aria-hidden="true">2<\/span>/);
  assert.ok(twoThisHour.includes(`<span class="sr-only" role="status">${uz.hourRemaining(2)}</span>`));
  assert.equal(uz.hourRemaining(2), 'Bu soatda yana 2 ta xabar');
  assert.equal(strings('ru').hourRemaining(2), 'В этот час ещё 2 сообщения');
  assert.match(twoThisHour, /bg-brand-saffron\/\[0\.06\] text-brand-saffron/, 'saffron at 2 left this hour, as the warning');
  // The hourly limit stands: 0, not the day's 10.
  const blockedNow = badge(10, null, true);
  assert.match(blockedNow, /aria-hidden="true">0<\/span>/);
  assert.ok(blockedNow.includes(uz.hourRemaining(0)));
  // The day runs out first: the day's count, saffron from 3.
  assert.ok(badge(3, 5).includes(uz.remaining(3)) && badge(3, 5).includes('text-brand-saffron'));
  assert.ok(!badge(4, null).includes('text-brand-saffron') && badge(4, null).includes(uz.remaining(4)));
  assert.ok(!badge(10, 3).includes('text-brand-saffron'), '3 left this hour is not low yet');
  // No label on a div without a role: the sentence is a status of its own, and the title.
  for (const html of [twoThisHour, blockedNow, badge(7, null)]) {
    assert.match(html, /^<div class="[^"]*" title="[^"]*">/);
    assert.doesNotMatch(html, /aria-label|aria-live/);
  }
  assert.equal(badge(-1, 2), '', 'unknown until the server counts');
});

test('a day limit says today or tomorrow in Tashkent instead of a countdown', () => {
  const at = (iso: string) => Date.parse(iso);
  // The UTC day turns at 05:00 in Tashkent (UTC+5).
  const cases: Array<[string, boolean]> = [
    ['2026-10-01T10:00:00Z', false], // 15:00: tomorrow from 05:00
    ['2026-10-01T18:59:59Z', false], // 23:59:59
    ['2026-10-01T19:00:00Z', true], // 00:00: the same calendar day
    ['2026-10-01T21:00:00Z', true], // 02:00
    ['2026-10-01T23:59:59Z', true], // 04:59:59
  ];
  for (const [iso, today] of cases) {
    const now = at(iso);
    assert.equal(liftsToday(nextUtcMidnight(now), now), today, iso);
    for (const locale of ['ru', 'uz'] as const) {
      const t = strings(locale);
      const state = reduceLimit(null, { type: 'blocked', reason: 'daily', retryAfterSec: null, limits: FREE, now })!;
      const card = limitCard(locale, state, { billingAvailable: false, paid: false, botHandoff: false, remaining: 0 }, now);
      assert.equal(card.title, t.dailyTitle);
      assert.equal(card.body, t.dailyBody(15, today));
      assert.equal(card.wait, null, 'the body already says when');
      assert.match(card.body, locale === 'ru' ? (today ? /сегодня с 05:00/ : /завтра с 05:00/) : (today ? /Bugun soat 05:00/ : /Ertaga soat 05:00/));
      const pack = limitCard(locale, { ...state, reason: 'pack_daily', limits: { daily: 50, hourly: null } },
        { billingAvailable: true, paid: true, botHandoff: true, remaining: 140 }, now);
      assert.equal(pack.body, t.packDailyBody(50, 140, today));
      assert.equal(pack.account, false);
      assert.equal(pack.bot, null);
    }
  }
});

test('one limit in sessionStorage for both chats, dropped once lifted, stale or malformed', () => {
  const values = memoryStorage('sessionStorage');
  const state = blocked('hourly', 900);
  saveLimit(state);
  assert.deepEqual([...values.keys()], ['gptchat_limit'], 'no locale in the key: the server counts one allowance');
  assert.deepEqual(loadLimit(NOW + 1_000), state);
  assert.equal(loadLimit(NOW + 900_000), null, 'lifted');
  saveLimit(blocked('monthly', null));
  assert.equal(loadLimit(NOW + 23 * HOUR)?.reason, 'monthly');
  assert.equal(loadLimit(NOW + 25 * HOUR), null, 'set more than a day ago');
  for (const raw of ['{', '"x"', JSON.stringify({ ...state, reason: 'plus' }), JSON.stringify({ ...state, retryAt: '1' }), JSON.stringify({ ...state, since: null }), JSON.stringify({ ...state, limits: { daily: -1 } })]) {
    values.set('gptchat_limit', raw);
    assert.equal(loadLimit(NOW), null, raw);
  }
  saveLimit(null);
  assert.equal(values.size, 0);
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('denied'); } });
  assert.doesNotThrow(() => saveLimit(state));
  assert.equal(loadLimit(NOW), null);
});

test('the 429 fields are validated before they reach the card', () => {
  for (const reason of REASONS) assert.equal(limitReasonOf(reason), reason);
  for (const odd of [undefined, 'Plus', 'paid_hourly', 42]) assert.equal(limitReasonOf(odd), 'hourly');
  assert.deepEqual(limitCounts({ daily: 50, hourly: null }), { daily: 50, hourly: null });
  assert.deepEqual(limitCounts({ daily: 15, hourly: 5 }), FREE);
  for (const odd of [undefined, null, 'x', {}, { daily: -1, hourly: 1.5 }]) assert.equal(limitCounts(odd), null);
});

test('after a reload the card stands above the composer, which holds the refused question', async (t) => {
  const session = memoryStorage('sessionStorage');
  const local = memoryStorage('localStorage');
  const g = globalThis as Record<string, unknown>;
  t.after(() => { delete g.window; delete g.location; });
  g.window = globalThis;
  g.location = { hash: '', pathname: '/uz/gpt-uzbek-tilida/', href: 'https://gptbot.uz/uz/gpt-uzbek-tilida/' };
  const { AiChatConsole } = await import('../src/gpt-chat/components/AiChatConsole');
  const render = () => renderToStaticMarkup(React.createElement(AiChatConsole, { config: { locale: 'uz', apiBase: '' } }));
  const uz = strings('uz');

  const now = Date.now();
  saveLimit({ reason: 'hourly', retryAt: now + 12 * MIN + 30_000, since: now, limits: FREE });
  local.set('gptchat_draft', JSON.stringify({ text: 'Mening savolim', savedAt: now }));
  const html = render();
  const cardAt = html.indexOf('data-testid="ai-limit-card"');
  const inputAt = html.indexOf('<textarea');
  assert.ok(cardAt > 0 && inputAt > cardAt, 'the card is above the composer, not in its place');
  const textarea = html.slice(inputAt, html.indexOf('</textarea>', inputAt));
  assert.match(textarea, /aria-describedby="ai-limit-card"/);
  assert.match(textarea, />Mening savolim$/, 'the question is back in the composer');
  const card = html.slice(cardAt, inputAt);
  assert.ok(card.includes(uz.hourlyTitle) && card.includes(uz.hourlyBody(5)));
  assert.ok(card.includes(uz.limitDraftKept));
  assert.ok(card.includes(uz.limitWaitAt(13, tashkentTime(now + 12 * MIN + 30_000)!)));
  // Short: the title and the time are seen; why is behind «Batafsil», and said to a screen reader.
  assert.ok(card.includes(`<span class="sr-only">${uz.hourlyBody(5)}</span>`));
  assert.match(card, /<button type="button" class="gpt-text-button" aria-expanded="false">Batafsil<\/button>/);
  assert.ok(!card.includes(uz.retry), 'no retry button: the send button returns by the clock');
  assert.ok(!card.includes('biznes-uchun-ai-bot'), 'no business link on a consumer limit');
  assert.ok(!card.includes('t.me/'), 'no Telegram route unless the server enables the bot');

  // A limit that has lifted while the tab was closed is not shown again.
  session.clear();
  saveLimit({ reason: 'hourly', retryAt: now - 1, since: now - HOUR, limits: FREE });
  assert.ok(!render().includes('data-testid="ai-limit-card"'));
});
