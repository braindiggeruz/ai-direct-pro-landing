// The AI pack window's screens (plan WP-17, map 03 §3.2–3.6), rendered as the
// lazy part chat-account renders them: the pack for a guest and sign-in
// through the bot, «Paketim» with the pay step, the way back from a payment
// (checking, paid, still pending, cancelled), the Uzum Bank app code, the test
// mode, a pending invoice. WP-24: two packs side by side, the refund rule's
// sums, and an open invoice resumed, closed or left for another way to pay.
// Every number is the server's, every link goes to an allowed place, and the
// window speaks the visitor's language.
//
// Run: node --import tsx --test tests/gpt-pack-dialog.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Dialog } from '../src/components/ui/dialog';

import { accountPart } from '../src/gpt-chat/lazy-part';
import { strings } from '../src/gpt-chat/i18n';
import { accountStrings, groupDigits } from '../src/gpt-chat/account-strings';
import { checkoutReport, type CheckoutOutcome, type CheckoutWatch } from '../src/gpt-chat/checkout';
import { groupPaymentCode, UZUM_APP_SERVICE } from '../src/gpt-chat/account/UzumCodeScreen';
import type { AccountWindowMemory } from '../src/gpt-chat/account/AccountDialog';
import type { AccountHandle } from '../src/gpt-chat/use-account';
import { validAccountView, type AccountView, type PackTerms } from '../src/gpt-chat/types';
import { previewViews } from '../scripts/pack-window-preview';

// tsx compiles .tsx with the classic transform in tests (as in
// tests/gpt-chat-handoff-link.test.ts).
(globalThis as typeof globalThis & { React: typeof React }).React = React;

const LOCALES = ['ru', 'uz'] as const;
type Locale = (typeof LOCALES)[number];
const read = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const PACK: PackTerms = { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: { percent: 12, includedTiyin: 214286 }, refundDays: 10 };
const ORDER = `pay_${'a'.repeat(32)}`;
const OTHER = `uzm_${'b'.repeat(32)}`;
const ENDS = Date.parse('2026-11-03T09:00:00Z');
const NOW = Date.now();

const guest = (over: Partial<AccountView> = {}): AccountView => ({
  ok: true, loginAvailable: true, loginMethods: ['bot'], mode: 'live', providers: ['click', 'uzum'], user: null,
  terms: { ru: 'https://gptbot.uz/ru/oferta/', uz: 'https://gptbot.uz/uz/oferta/' }, termsVersion: 'ai-paket-2026-10-v1',
  freeLimits: { daily: 15, hourly: 5 }, pack: PACK, uzumFlow: 'checkout', ...over,
});
const member = (over: Partial<AccountView> = {}): AccountView =>
  guest({ user: { signedIn: true, storageKey: 'a'.repeat(64) }, remaining: 7, paymentCode: null, ...over });
const withPack = (over: Partial<AccountView> = {}): AccountView => member({
  access: { order_id: ORDER, ends_at: ENDS, remaining: 120, renewSoon: false, refund_requested_at: null, message_limit: 300, dayRemaining: 37 },
  payment: { id: ORDER, state: 'paid', provider: 'click' },
  ...over,
});
const watchOf = (over: Partial<CheckoutWatch> = {}): CheckoutWatch => ({ provider: 'click', flow: 'redirect', at: NOW, attemptId: ORDER, before: null, ...over });

async function window(
  locale: Locale,
  data: AccountView | null,
  options: { watch?: CheckoutWatch | null; outcome?: CheckoutOutcome | null; memory?: Partial<AccountWindowMemory>; handle?: Partial<AccountHandle> } = {},
): Promise<string> {
  const { AccountDialog } = await accountPart.load();
  const account: AccountHandle = {
    data, error: false, loading: false, refresh: async () => {}, fail: () => {}, forget: () => {}, clearError: () => {}, ...options.handle,
  };
  return renderToStaticMarkup(
    React.createElement(Dialog, { open: true },
      React.createElement(AccountDialog, {
        t: strings(locale), locale, apiBase: '', account, loginFailed: false, onClose: () => {},
        memoryRef: { current: { requestKeys: {}, refusedForTerms: null, paymentCode: null, ...options.memory } },
        checkout: { watch: options.watch ?? null, outcome: options.outcome ?? null, start: () => {}, dismiss: () => {} },
      })),
  );
}

const html = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const has = (page: string, text: string) => page.includes(html(text));
const date = (locale: Locale, at: number) => new Date(at).toLocaleDateString(locale === 'uz' ? 'uz-UZ' : 'ru-RU');
const payButtons = (page: string) => [...page.matchAll(/data-provider="(\w+)"/g)].map((m) => m[1]);

test('the copy: the pack in plain words, the right Russian forms, o‘ with U+2018, groups of thousands', () => {
  const ru = accountStrings('ru');
  const uz = accountStrings('uz');
  assert.equal(ru.price('20 000', 1, 300), '20 000 сум · 1 месяц · 300 ответов');
  assert.equal(uz.price('20 000', 1, 300), '20 000 so‘m · 1 oy · 300 ta javob');
  assert.equal(ru.packFeatures(1, 300, 50)[0], 'Действует 1 календарный месяц с дня оплаты.');
  assert.equal(ru.packFeatures(1, 301, 50)[1], '301 ответ, до 50 в день.');
  assert.equal(ru.packFeatures(2, 300, 50)[0], 'Действует 2 календарных месяца с дня оплаты.');
  assert.equal(ru.benefits(1, 300, 50), '300 ответов на 1 календарный месяц с дня оплаты, до 50 в день. Без автосписаний.');
  assert.equal(uz.packFeatures(1, 300, 50)[1], '300 ta javob, kuniga 50 tagacha.');
  assert.equal(ru.today(12, 50), 'Сегодня можно ещё 12 (до 50 в день)');
  assert.equal(uz.today(12, 50), 'Bugun yana 12 ta (kuniga 50 tagacha)');
  assert.equal(ru.payNote(['Click', 'Uzum Bank'].join(ru.or)), 'Данные карты к нам не попадают: оплата проходит на стороне Click или Uzum Bank.');
  assert.equal(uz.payVia('Uzum Bank'), 'Uzum Bank orqali to‘lash');
  // What the pack is not, in both languages, without naming a tier.
  assert.match(ru.honesty, /GPTBot\.uz.*не доступ к ChatGPT.*не связан с OpenAI/);
  assert.match(uz.honesty, /GPTBot\.uz.*ChatGPT’ga kirish emas.*OpenAI bilan bog‘liq emas/);
  for (const [n, out] of [[950, '950'], [20000, '20 000'], [1500000, '1 500 000']] as const) assert.equal(groupDigits(n), out);
  // Uzbek: o‘ and g‘ with U+2018, never an ASCII apostrophe or a backtick.
  const all = (value: unknown): string[] => typeof value === 'string' ? [value]
    : typeof value === 'function' ? [(value as (...a: unknown[]) => unknown)('X', 1, 2)].flatMap(all)
      : Array.isArray(value) ? value.flatMap(all) : value && typeof value === 'object' ? Object.values(value).flatMap(all) : [];
  for (const line of all(uz)) assert.doesNotMatch(line, /['`]/, line);
  assert.deepEqual(Object.keys(ru).sort(), Object.keys(uz).sort(), 'the same keys in both languages');
});

test('a guest sees the pack with the server’s numbers, what it is not, and sign-in through the bot — no pay button yet', async () => {
  for (const locale of LOCALES) {
    const copy = accountStrings(locale);
    const page = await window(locale, guest());
    for (const line of [copy.title, copy.price('20 000', 1, 300), ...copy.packFeatures(1, 300, 50), copy.honesty, copy.loginWhy, copy.loginConsent, copy.login, strings(locale).premium.manual])
      assert.ok(has(page, line), `${locale}: ${line}`);
    assert.deepEqual(payButtons(page), [], 'paying waits for the account');
    assert.ok(!has(page, copy.terms), 'the offer is accepted at the pay step');
    // The numbers are the server's: another pack, other numbers, no literal left behind.
    const other = await window(locale, guest({ pack: { ...PACK, priceUzs: 25000, messageLimit: 400, dailyLimit: 60 } }));
    assert.ok(has(other, copy.price('25 000', 1, 400)) && has(other, copy.packFeatures(1, 400, 60)[1]), locale);
    assert.doesNotMatch(other, /20 000|300 (ответов|ta javob)|50 (в день|tagacha)/, locale);
  }
});

test('billing off: no price, no pay button, no sign-in, and the window says the chat is free', async () => {
  for (const locale of LOCALES) {
    const copy = accountStrings(locale);
    const page = await window(locale, guest({ mode: null, providers: [], loginAvailable: false, loginMethods: [] }));
    assert.ok(has(page, copy.unavailable), locale);
    for (const line of [copy.price('20 000', 1, 300), copy.login, copy.honesty]) assert.ok(!has(page, line), `${locale}: ${line}`);
    assert.deepEqual(payButtons(page), []);
    // An older server without the pack sells nothing either.
    assert.deepEqual(payButtons(await window(locale, member({ pack: undefined }))), []);
  }
});

test('signed in without a pack: the free day left, the price, the offer, Click then Uzum, where card data goes', async () => {
  for (const locale of LOCALES) {
    const copy = accountStrings(locale);
    const page = await window(locale, member());
    assert.ok(has(page, `${copy.noPack} ${copy.freeLeft(7)}`), locale);
    assert.ok(page.includes('gpt-plan-card') && has(page, copy.honesty));
    assert.deepEqual(payButtons(page), ['click', 'uzum'], 'Click first, as the server lists them');
    assert.ok(has(page, copy.payVia('Click')) && has(page, copy.payVia('Uzum Bank')));
    assert.ok(has(page, copy.payNote(`Click${copy.or}Uzum Bank`)));
    // The offer of this language, in a new tab; the buttons wait for its checkbox.
    assert.match(page, new RegExp(`<a href="https://gptbot\\.uz/${locale}/oferta/" target="_blank" rel="noopener noreferrer">${copy.terms}</a>`));
    assert.match(page, /data-provider="click" disabled=""/);
    assert.ok(page.includes('data-testid="ai-pack-support"') && page.includes('href="mailto:ceo@gptbot.uz"') && page.includes('href="tel:+998505870720"'));
    assert.ok(has(page, copy.logout));
    // One provider: one button and its name alone.
    const click = await window(locale, member({ providers: ['click'] }));
    assert.deepEqual(payButtons(click), ['click']);
    assert.ok(has(click, copy.payNote('Click')));
    // Uzum through the Merchant API: paid in the Uzum Bank app.
    const app = await window(locale, member({ uzumFlow: 'code' }));
    assert.ok(has(app, copy.payInApp) && !has(app, copy.payVia('Uzum Bank')), locale);
  }
});

test('«Paketim»: n / 300, today’s room under the day cap, until when, receipts on allowed hosts, a refund with a second press', async () => {
  for (const locale of LOCALES) {
    const copy = accountStrings(locale);
    const page = await window(locale, withPack({
      receipts: [
        { kind: 'PERFORM', receipt_url: 'https://ofd.soliq.uz/epi?t=EZ1&r=2' },
        { kind: 'PERFORM', receipt_url: 'https://evil.example/receipt' },
        { kind: 'CANCEL', receipt_url: 'https://check.uzumbank.uz/r/1' },
      ],
      refundable: [
        { order_id: ORDER, starts_at: Date.parse('2026-10-03T09:00:00Z'), ends_at: ENDS, message_limit: 300, refund_requested_at: null, unused: 120, refund_uzs: 8000 },
        { order_id: OTHER, starts_at: Date.parse('2026-09-03T09:00:00Z'), ends_at: ENDS, message_limit: 300, refund_requested_at: Date.parse('2026-09-04T09:00:00Z'), unused: 200, refund_uzs: 13333 },
        // All answers used: nothing to give back, nothing offered.
        { order_id: `pay_${'c'.repeat(32)}`, starts_at: Date.parse('2026-08-03T09:00:00Z'), ends_at: ENDS, message_limit: 300, refund_requested_at: null, unused: 0, refund_uzs: 0 },
      ],
    }));
    assert.match(page, /<strong>120<span class="gpt-access-size"> \/ 300<\/span><\/strong>/);
    for (const line of [copy.active, copy.remaining, copy.today(37, 50), copy.until(date(locale, ENDS)), copy.receipt, copy.refundReceipt])
      assert.ok(has(page, line), `${locale}: ${line}`);
    assert.ok(page.includes('href="https://ofd.soliq.uz/epi?t=EZ1&amp;r=2"') && page.includes('href="https://check.uzumbank.uz/r/1"'));
    assert.ok(!page.includes('evil.example'), 'a receipt elsewhere is not linked');
    // One pack can be asked back (the confirmation comes on the press), the other already was.
    assert.ok(has(page, `${copy.refund} · ${date(locale, Date.parse('2026-10-03T09:00:00Z'))}`));
    assert.ok(has(page, `${copy.refundPending('13 333', 10)} · ${date(locale, Date.parse('2026-09-03T09:00:00Z'))}`));
    assert.ok(!has(page, `${copy.refund} · ${date(locale, Date.parse('2026-08-03T09:00:00Z'))}`), 'a spent pack offers no refund');
    assert.ok(!page.includes('gpt-refund-confirm'));
    // A pack frozen by its refund request is not said to have ended.
    const frozen = await window(locale, member({
      payment: { id: ORDER, state: 'paid', provider: 'click' },
      refundable: [{ order_id: ORDER, starts_at: NOW, ends_at: ENDS, message_limit: 300, refund_requested_at: NOW, unused: 300, refund_uzs: 20000 }],
    }));
    assert.ok(has(frozen, copy.refundPending('20 000', 10)) && !has(frozen, copy.expired), locale);
    assert.ok(has(await window(locale, member({ payment: { id: ORDER, state: 'paid', provider: 'click' } })), copy.expired), locale);
    // Over an active pack: no price card, the next pack in one line, still the offer and the buttons.
    assert.ok(!page.includes('gpt-plan-card'));
    assert.ok(has(page, `${copy.price('20 000', 1, 300)}. ${strings(locale).premium.manual}`));
    assert.deepEqual(payButtons(page), ['click', 'uzum']);
    // Near the end of the pack the panel says a new one starts at once.
    assert.ok(has(await window(locale, withPack({ access: { ...withPack().access!, renewSoon: true } })), copy.renew));
  }
  const panel = read('src/gpt-chat/account/PackPanel.tsx');
  // The refund goes out only from the confirmation's own button.
  assert.match(panel, /onClick=\{\(\) => setConfirming\(period\.order_id\)\}/);
  assert.match(panel, /onClick=\{\(\) => void onRefund\(period\.order_id\)\.finally\(\(\) => setConfirming\(null\)\)\}/);
});

test('two packs side by side: the answers of both, the latest end, and which one is spent first (WP-24)', async () => {
  const first = Date.parse('2026-10-20T09:00:00Z');
  for (const locale of LOCALES) {
    const copy = accountStrings(locale);
    const page = await window(locale, withPack({
      remaining: 420,
      access: { order_id: ORDER, ends_at: first, remaining: 420, renewSoon: false, refund_requested_at: null, message_limit: 300, dayRemaining: 50, packs: 2, totalLimit: 600, paidThrough: ENDS, firstRemaining: 120 },
    }));
    assert.match(page, /<strong>420<span class="gpt-access-size"> \/ 600<\/span><\/strong>/);
    for (const line of [copy.remainingPacks(2), copy.until(date(locale, ENDS)), copy.firstPack(120, date(locale, first)), copy.today(50, 50)])
      assert.ok(has(page, line), `${locale}: ${line}`);
    assert.ok(page.includes(`<p>${html(copy.until(date(locale, ENDS)))}</p>`), `${locale}: paid through the later pack`);
    assert.ok(!page.includes(`<p>${html(copy.until(date(locale, first)))}</p>`), `${locale}: not through the first`);
    // One pack: its own numbers, no line about the order of packs.
    const one = await window(locale, withPack());
    assert.ok(has(one, copy.remaining) && !has(one, copy.firstPack(120, date(locale, ENDS))), locale);
  }
  assert.equal(accountStrings('ru').firstPack(1, '03.11.2026'), 'Сначала тратится пакет до 03.11.2026: в нём остался 1 ответ.');
  assert.equal(accountStrings('ru').firstPack(120, '03.11.2026'), 'Сначала тратится пакет до 03.11.2026: в нём осталось 120 ответов.');
});

test('the refund rule in the window: the sum for the unused answers, the days, the same card (WP-24)', () => {
  const owed = { sum: '13 333', unused: 200, size: 300 };
  assert.equal(
    accountStrings('ru').refundConfirm('03.10.2026', owed, 10),
    'Вернуть неиспользованную часть пакета от 03.10.2026? Не использовано 200 из 300 ответов — вернём 13 333 сум на карту, с которой платили, в течение 10 рабочих дней. Ответы из этого пакета сразу перестанут списываться.',
  );
  assert.equal(
    accountStrings('uz').refundConfirm('03.10.2026', owed, 10),
    '03.10.2026 dagi paketning ishlatilmagan qismi uchun pulni qaytarishni so‘raysizmi? 300 ta javobdan 200 tasi ishlatilmagan — 13 333 so‘mni 10 ish kuni ichida to‘lov qilingan kartaga qaytaramiz. Bu paketdan javoblar darhol yechilmay qoladi.',
  );
  assert.equal(accountStrings('ru').refundPending('20 000', 10), 'Запрос на возврат принят: 20 000 сум вернём на карту, с которой платили, в течение 10 рабочих дней.');
  assert.equal(accountStrings('uz').refundPending('20 000', 10), 'So‘rovingiz qabul qilindi: 20 000 so‘mni 10 ish kuni ichida to‘lov qilingan kartaga qaytaramiz.');
  // An older view without the sum or the days still says something true.
  assert.equal(accountStrings('ru').refundPending(null, null), 'Запрос на возврат принят: неиспользованную часть вернём на карту, с которой платили.');
  assert.doesNotMatch(accountStrings('ru').refundConfirm('03.10.2026', null, null), /null|undefined|NaN/);
  assert.doesNotMatch(accountStrings('uz').refundConfirm('03.10.2026', null, null), /null|undefined|NaN/);
  // The panel takes the sum and the days from the server's view.
  const panel = read('src/gpt-chat/account/PackPanel.tsx');
  assert.match(panel, /const days = data\.pack\?\.refundDays \?\? null;/);
  assert.match(panel, /copy\.refundConfirm\(date\(period\.starts_at\), owed\(period\), days\)/);
  assert.match(panel, /period\.refund_uzs === 0 \? null/);
});

test('an open invoice: resumed, or closed while no provider has seen it, so another way to pay is free (U7, WP-24)', async () => {
  const open = (state: string, cancellable: boolean) => member({ payment: { id: ORDER, state, provider: 'click', cancellable } });
  for (const locale of LOCALES) {
    const copy = accountStrings(locale);
    // Click never saw it: resume it, or close it.
    const unseen = await window(locale, open('pending', true));
    for (const line of [copy.resumeNote, copy.resume, copy.cancelInvoiceNote('Click'), copy.cancelInvoice]) assert.ok(has(unseen, line), `${locale}: ${line}`);
    assert.ok(!has(unseen, copy.invoiceHeld('Click')));
    // Click holds it: resume it, or let it close by itself.
    const held = await window(locale, open('prepared', false));
    assert.ok(has(held, copy.resume) && has(held, copy.invoiceHeld('Click')) && !has(held, copy.cancelInvoice), locale);
    // Back from paying, nothing paid: the way back to the pay step, at once while
    // no provider has the invoice, after the two minutes otherwise.
    const change = (page: string) => page.includes('data-testid="ai-pay-change"') && has(page, copy.payChange);
    assert.ok(change(await window(locale, open('pending', true), { watch: watchOf() })), locale);
    assert.ok(!change(await window(locale, open('prepared', false), { watch: watchOf() })), locale);
    assert.ok(change(await window(locale, open('prepared', false), { watch: watchOf({ at: NOW - 121_000 }) })), locale);
    assert.ok(!change(await window(locale, withPack(), { watch: watchOf() })), 'paid: nothing to change');
    assert.ok(!change(await window(locale, open('pending', true), { watch: watchOf({ attemptId: OTHER }) })), 'another order says nothing of this one');
    // The app code opens no order: another way to pay is one press away.
    const code = await window(locale, member({ uzumFlow: 'code', paymentCode: '123456782' }), { watch: watchOf({ provider: 'uzum', flow: 'code', attemptId: null }) });
    assert.ok(has(code, copy.payChange), locale);
  }
  const dialog = read('src/gpt-chat/account/AccountDialog.tsx');
  assert.match(dialog, /post\("\/api\/gpt\/account", \{ action: "cancel_invoice", orderId: order \}\)/);
  assert.match(dialog, /code === "invoice_in_progress"/);
  // Back at the pay step, a payment that turned out paid is still said.
  assert.match(dialog, /if \(watch && \(!choosing \|\| checkout\.outcome === "paid"\)\)/);
});

test('test mode is said on the window and on the way back; a pending invoice is resumed, not paid twice', async () => {
  for (const locale of LOCALES) {
    const copy = accountStrings(locale);
    assert.ok(has(await window(locale, member({ mode: 'test' })), copy.test), locale);
    const testOrder = await window(locale, member({ mode: 'test', payment: { id: ORDER, state: 'pending', provider: 'click' } }), { watch: watchOf({ flow: 'test' }) });
    assert.ok(has(testOrder, copy.test) && has(testOrder, copy.payTestNoPage), locale);
    const pending = await window(locale, member({ payment: { id: ORDER, state: 'pending', provider: 'click' } }));
    for (const line of [copy.resumeNote, copy.resume, copy.pending]) assert.ok(has(pending, line), `${locale}: ${line}`);
    assert.match(pending, /data-provider="click" disabled=""/);
    assert.match(pending, /data-provider="uzum" disabled=""/);
  }
});

test('back from paying: checking, then paid, still pending after two minutes, or cancelled — as the server says', async () => {
  for (const locale of LOCALES) {
    const copy = accountStrings(locale);
    const result = (page: string) => /data-result="(\w+)"/.exec(page)?.[1];
    const waiting = member({ payment: { id: ORDER, state: 'prepared', provider: 'click' } });
    const checking = await window(locale, waiting, { watch: watchOf() });
    assert.equal(result(checking), 'checking');
    assert.ok(has(checking, copy.payChecking) && has(checking, copy.payCheckingNote) && has(checking, copy.payBackToChat));
    assert.deepEqual(payButtons(checking), [], 'no second payment while the first is being checked');
    // Two minutes on, or the ten-minute watch over: do not pay again, check, ask.
    for (const options of [{ watch: watchOf({ at: NOW - 121_000 }) }, { watch: watchOf(), outcome: 'pending' as const }]) {
      const long = await window(locale, waiting, options);
      assert.equal(result(long), 'pending');
      assert.ok(has(long, copy.payPendingLong) && has(long, strings(locale).premium.check) && long.includes('data-testid="ai-pack-support"'));
    }
    // Paid: the pack, and back to the chat, where the question waits.
    const paid = await window(locale, withPack(), { watch: watchOf() });
    assert.equal(result(paid), 'paid');
    assert.ok(has(paid, copy.payPaid) && has(paid, copy.active) && has(paid, copy.today(37, 50)));
    assert.match(paid, new RegExp(`<button type="button" class="gpt-primary">${html(copy.payBackToChat)}</button>`));
    // Another order paid says nothing about this one.
    assert.equal(result(await window(locale, withPack({ payment: { id: OTHER, state: 'paid', provider: 'uzum' } }), { watch: watchOf() })), 'checking');
    // Cancelled: no pack, try again, where to ask.
    const cancelled = await window(locale, member({ payment: { id: ORDER, state: 'cancelled', provider: 'click' } }), { watch: watchOf() });
    assert.equal(result(cancelled), 'cancelled');
    assert.ok(has(cancelled, copy.cancelled) && has(cancelled, copy.payAgain) && cancelled.includes('href="mailto:ceo@gptbot.uz"'));
    // Back with nothing stored (storage blocked): the newest order decides.
    assert.equal(result(await window(locale, withPack(), { watch: watchOf({ provider: null, attemptId: null }) })), 'paid');
  }
});

test('the Uzum Bank app: the code in groups, the steps with the service and the amount, copy, then the result', async () => {
  assert.equal(groupPaymentCode('123456782'), '1234 5678 2');
  for (const locale of LOCALES) {
    const copy = accountStrings(locale);
    const watch = watchOf({ provider: 'uzum', flow: 'code', attemptId: null, before: null });
    const page = await window(locale, member({ uzumFlow: 'code', paymentCode: '123456782' }), { watch });
    assert.match(page, /<strong class="gpt-login-code gpt-pay-code ym-hide-content" data-testid="ai-uzum-code">1234 5678 2<\/strong>/);
    for (const line of [copy.uzumCodeTitle, ...copy.uzumCodeSteps(UZUM_APP_SERVICE, '20 000'), copy.uzumCodeCopy, copy.uzumCodeNote, copy.payChecking])
      assert.ok(has(page, line), `${locale}: ${line}`);
    // Before the account view carries it, the code subscribe answered with.
    const early = await window(locale, member({ uzumFlow: 'code' }), { watch, memory: { paymentCode: '987654321' } });
    assert.ok(early.includes('9876 5432 1'), locale);
    // Paid in the app: the window says so.
    const paid = await window(locale, withPack({ uzumFlow: 'code', paymentCode: '123456782', payment: { id: OTHER, state: 'paid', provider: 'uzum' } }), { watch, outcome: 'paid' });
    assert.ok(has(paid, copy.payPaid) && !paid.includes('ai-uzum-code'), locale);
  }
});

test('every link on every screen goes to an allowed place, and never to a personal Telegram', async () => {
  const pages: string[] = [];
  for (const locale of LOCALES) {
    pages.push(
      await window(locale, guest()),
      await window(locale, member()),
      await window(locale, withPack({ receipts: [{ kind: 'PERFORM', receipt_url: 'https://ofd.soliq.uz/epi?t=1' }, { kind: 'PERFORM', receipt_url: 'javascript:alert(1)' }], refundable: [{ order_id: ORDER, starts_at: NOW, refund_requested_at: null }] })),
      await window(locale, member({ payment: { id: ORDER, state: 'cancelled', provider: 'click' } }), { watch: watchOf() }),
      await window(locale, member(), { watch: watchOf({ at: NOW - 200_000 }) }),
      await window(locale, member({ uzumFlow: 'code', paymentCode: '123456782' }), { watch: watchOf({ provider: 'uzum', flow: 'code', attemptId: null }) }),
    );
  }
  const allowed = [
    /^https:\/\/gptbot\.uz\/(ru|uz)\/oferta\/$/,
    /^\/ru\/politika-konfidentsialnosti\/$/,
    /^\/uz\/maxfiylik-siyosati\/$/,
    /^mailto:ceo@gptbot\.uz$/,
    /^tel:\+998505870720$/,
    /^https:\/\/ofd\.soliq\.uz\//,
  ];
  const hrefs = pages.flatMap((page) => [...page.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&')));
  assert.ok(hrefs.length > 20);
  for (const href of hrefs) assert.ok(allowed.some((rule) => rule.test(href)), href);
  for (const page of pages) assert.doesNotMatch(page, /XGame|t\.me\/(?!gptbotuz_bot)|javascript:/i);
});

test('one report per ended payment: checkout_result always, a purchase for real money only', () => {
  const live = withPack();
  assert.deepEqual(checkoutReport(live, watchOf(), 'paid'), {
    result: { provider: 'click', status: 'paid', mode: 'live' },
    purchase: { transactionId: ORDER, value: 20000, itemId: 'ai_paket_300', itemName: 'AI paket 300', provider: 'click' },
  });
  assert.equal(checkoutReport({ ...live, mode: 'test' }, watchOf(), 'paid').purchase, null, 'a rehearsal is no revenue');
  assert.equal(checkoutReport(live, watchOf(), 'pending').purchase, null);
  assert.equal(checkoutReport(member({ payment: { id: ORDER, state: 'cancelled', provider: 'click' } }), watchOf(), 'cancelled').purchase, null);
  assert.deepEqual(checkoutReport(null, watchOf({ provider: null }), 'pending').result, { provider: 'unknown', status: 'pending', mode: 'unavailable' });
  // The panel reports it once, from the start bundle, with the window open or not.
  const panel = read('src/gpt-chat/components/AiAccountPanel.tsx');
  assert.equal((panel.match(/track\(EV\.checkoutResult/g) ?? []).length, 1);
  assert.match(panel, /if \(report\.purchase && firstReport\(report\.purchase\.transactionId\)\) trackPurchase\(report\.purchase\);/);
  assert.match(panel, /recordUiEvent\(apiBase, "checkout_result", result\);/);
  // Each GA4 step of the funnel has its server count beside it.
  const sources = [panel, read('src/gpt-chat/account/AccountDialog.tsx'), read('src/gpt-chat/account/BotLoginScreen.tsx')].join('\n');
  for (const [event, step] of [['packViewed', 'pack_viewed'], ['loginStarted', 'login_started'], ['loginResult', 'login_result'], ['checkoutStarted', 'checkout_started'], ['checkoutResult', 'checkout_result']]) {
    const tracked = (sources.match(new RegExp(`track\\(EV\\.${event}\\b`, 'g')) ?? []).length;
    const counted = (sources.match(new RegExp(`recordUiEvent\\(apiBase, "?'?${step}`, 'g')) ?? []).length;
    assert.ok(tracked > 0 && counted === tracked, `${event}: ${tracked} GA4, ${counted} server`);
  }
});

test('the way back: ?pay=return opens the window, leaves the address, and the browser keeps the question', () => {
  const panel = read('src/gpt-chat/components/AiAccountPanel.tsx');
  assert.match(panel, /useState\(\(\) => new URLSearchParams\(window\.location\.search\)\.get\("pay"\) === "return"\)/);
  assert.match(panel, /loadCheckout\(\) \?\? \(payReturn \? \{ provider: null, flow: "redirect"/);
  assert.match(panel, /url\.searchParams\.delete\("pay"\);\s*window\.history\.replaceState\(null, "", url\.href\);/);
  assert.match(panel, /\} else if \(checkout\) openPack\("pay_return"\);/);
  // Polled on the checkout schedule until the payment ends.
  assert.match(panel, /useAccount\(apiBase, onAccount, refreshKey, checkout && !outcome \? checkout\.at : null\)/);
  // Leaving for the payment page or the Uzum Bank app keeps the composer's question (DRAFT_TTL_MS).
  assert.match(panel, /if \(watch\.flow === "redirect" \|\| watch\.flow === "code"\) onLeave\?\.\(\);/);
  const dialog = read('src/gpt-chat/account/AccountDialog.tsx');
  assert.match(dialog, /checkout\.start\(\{ provider, flow: "redirect", at: Date\.now\(\), attemptId, before: null \}\);\s*location\.assign\(url\);/);
  // The server's return address carries the marker (subscribe.ts).
  assert.match(read('functions/api/gpt/subscribe.ts'), /\?pay=return`;/);
});

test('the local preview (scripts/pack-window-preview.ts) answers with views the window accepts', async () => {
  const views = previewViews(NOW);
  assert.deepEqual(Object.keys(views).sort(), ['cancelled', 'code', 'guest', 'member', 'off', 'packs', 'paid', 'pending', 'test', 'unseen']);
  for (const [state, view] of Object.entries(views)) {
    assert.ok(validAccountView(view), state);
    for (const locale of LOCALES) assert.ok((await window(locale, view as unknown as AccountView)).length > 500, `${state}/${locale}`);
  }
  // It loads nothing from elsewhere: no analytics hit leaves the machine.
  assert.match(read('scripts/pack-window-preview.ts'), /script-src 'self'; connect-src 'self'/);
  assert.match(read('scripts/pack-window-preview.ts'), /\.listen\(port, '127\.0\.0\.1'/);
  // Files from dist/ only: not from a sibling such as dist-old/.
  assert.match(read('scripts/pack-window-preview.ts'), /const inside = \(file: string\) => file === dist \|\| file\.startsWith\(dist \+ path\.sep\);/);
  assert.doesNotMatch(read('scripts/pack-window-preview.ts'), /\.startsWith\(dist\)/);
});
