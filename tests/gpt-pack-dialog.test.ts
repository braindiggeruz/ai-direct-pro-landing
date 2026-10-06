// The AI pack window's screens (plan WP-17, map 03 §3.2–3.6), rendered as the
// lazy part chat-account renders them: the pack for a guest and sign-in
// through the bot, «Paketim» with the pay step, the way back from a payment
// (checking, paid, still pending, cancelled), the Uzum Bank app code, the test
// mode, a pending invoice. WP-24: two packs side by side, and an open invoice
// resumed, closed or left for another way to pay. WP-25: a paid pack is not
// refundable, said beside the price; no refund request, a payment problem goes
// to the studio.
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
const PACK: PackTerms = { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: { percent: 12, includedTiyin: 214286 } };
const ORDER = `pay_${'a'.repeat(32)}`;
const OTHER = `uzm_${'b'.repeat(32)}`;
const ENDS = Date.parse('2026-11-03T09:00:00Z');
const NOW = Date.now();

const guest = (over: Partial<AccountView> = {}): AccountView => ({
  ok: true, loginAvailable: true, loginMethods: ['bot'], mode: 'live', providers: ['click', 'uzum'], user: null,
  terms: { ru: 'https://gptbot.uz/ru/oferta/', uz: 'https://gptbot.uz/uz/oferta/' }, termsVersion: 'ai-paket-2026-10-v2',
  freeLimits: { daily: 15, hourly: 5 }, pack: PACK, uzumFlow: 'checkout', ...over,
});
const member = (over: Partial<AccountView> = {}): AccountView =>
  guest({ user: { signedIn: true, storageKey: 'a'.repeat(64) }, remaining: 7, paymentCode: null, ...over });
const withPack = (over: Partial<AccountView> = {}): AccountView => member({
  access: { order_id: ORDER, ends_at: ENDS, remaining: 120, renewSoon: false, message_limit: 300, dayRemaining: 37 },
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
    for (const line of [copy.title, copy.price('20 000', 1, 300), ...copy.packFeatures(1, 300, 50), copy.noRefund, copy.honesty, copy.loginWhy, copy.loginConsent, copy.login, strings(locale).premium.manual])
      assert.ok(has(page, line), `${locale}: ${line}`);
    // Not refundable, said in the price card before anyone signs in or pays (WP-25).
    assert.match(page, new RegExp(`data-slot="card-footer"[^]*<p class="gpt-panel-note" data-testid="ai-pack-no-refund">${html(copy.noRefund)}</p>`));
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
    for (const line of [copy.price('20 000', 1, 300), copy.login, copy.honesty, copy.noRefund]) assert.ok(!has(page, line), `${locale}: ${line}`);
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
    assert.ok(page.includes('gpt-plan-card') && has(page, copy.honesty) && has(page, copy.noRefund));
    assert.deepEqual(payButtons(page), ['click', 'uzum'], 'Click first, as the server lists them');
    assert.ok(has(page, copy.payVia('Click')) && has(page, copy.payVia('Uzum Bank')));
    assert.ok(has(page, copy.payNote(`Click${copy.or}Uzum Bank`)));
    // The offer of this language, in a new tab; the buttons wait for its checkbox.
    assert.match(page, new RegExp(`<a href="https://gptbot\\.uz/${locale}/oferta/" target="_blank" rel="noopener noreferrer">${copy.terms}</a>`));
    assert.match(page, /data-provider="click" disabled=""/);
    assert.ok(page.includes('data-testid="ai-pack-support"') && page.includes('href="mailto:ceo@gptbot.uz"') && page.includes('href="tel:+998505870720"'));
    assert.ok(has(page, `${copy.supportLabel} `), `${locale}: a payment problem goes to the studio`);
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

test('«Paketim»: n / 300, today’s room under the day cap, until when, receipts on allowed hosts; no refund request (WP-25)', async () => {
  for (const locale of LOCALES) {
    const copy = accountStrings(locale);
    const page = await window(locale, withPack({
      receipts: [
        { kind: 'PERFORM', receipt_url: 'https://ofd.soliq.uz/epi?t=EZ1&r=2' },
        { kind: 'PERFORM', receipt_url: 'https://evil.example/receipt' },
        { kind: 'CANCEL', receipt_url: 'https://check.uzumbank.uz/r/1' },
      ],
    }));
    assert.match(page, /<strong>120<span class="gpt-access-size"> \/ 300<\/span><\/strong>/);
    for (const line of [copy.active, copy.remaining, copy.today(37, 50), copy.until(date(locale, ENDS)), copy.receipt, copy.refundReceipt])
      assert.ok(has(page, line), `${locale}: ${line}`);
    assert.ok(page.includes('href="https://ofd.soliq.uz/epi?t=EZ1&amp;r=2"') && page.includes('href="https://check.uzumbank.uz/r/1"'));
    assert.ok(!page.includes('evil.example'), 'a receipt elsewhere is not linked');
    // A paid pack is not refundable: nothing to ask back, one neutral line for a payment problem.
    assert.doesNotMatch(page, /Запросить возврат|Pulni qaytarishni so‘rash|gpt-refund-confirm|ishlatilmagan|неиспользованн/);
    assert.ok(has(page, `${copy.supportLabel} `) && page.includes('href="mailto:ceo@gptbot.uz"'), locale);
    // Over an active pack: no price card, the next pack in one line, not refundable beside it,
    // still the offer and the buttons.
    assert.ok(!page.includes('gpt-plan-card'));
    assert.ok(page.includes(`<p class="gpt-panel-note">${html(copy.price('20 000', 1, 300))}. ${html(strings(locale).premium.manual)}</p><p class="gpt-panel-note" data-testid="ai-pack-no-refund">${html(copy.noRefund)}</p>`), locale);
    assert.deepEqual(payButtons(page), ['click', 'uzum']);
    // Near the end of the pack the panel says a new one starts at once.
    assert.ok(has(await window(locale, withPack({ access: { ...withPack().access!, renewSoon: true } })), copy.renew));
    // A pack that ended is said to have ended; money the Seller returned (a double charge, a
    // payment that started no pack) is said as such, with its refund receipt.
    assert.ok(has(await window(locale, member({ payment: { id: ORDER, state: 'paid', provider: 'click' } })), copy.expired), locale);
    const refunded = await window(locale, member({
      payment: { id: ORDER, state: 'refunded', provider: 'click' },
      receipts: [{ kind: 'CANCEL', receipt_url: 'https://ofd.soliq.uz/epi?t=EZ1&r=3' }],
    }));
    assert.ok(has(refunded, copy.refunded) && has(refunded, copy.refundReceipt) && !has(refunded, copy.expired), locale);
  }
});

test('two packs side by side: the answers of both, the latest end, and which one is spent first (WP-24)', async () => {
  const first = Date.parse('2026-10-20T09:00:00Z');
  for (const locale of LOCALES) {
    const copy = accountStrings(locale);
    const page = await window(locale, withPack({
      remaining: 420,
      access: { order_id: ORDER, ends_at: first, remaining: 420, renewSoon: false, message_limit: 300, dayRemaining: 50, packs: 2, totalLimit: 600, paidThrough: ENDS, firstRemaining: 120 },
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

test('the window never asks a refund: the only account action closes an unseen invoice (WP-25)', () => {
  const ru = accountStrings('ru');
  const uz = accountStrings('uz');
  assert.equal(ru.noRefund, 'Деньги за оплаченный пакет не возвращаются: он начинает действовать сразу после оплаты.');
  assert.equal(uz.noRefund, 'To‘langan paket uchun pul qaytarilmaydi: u to‘lovdan keyin darhol amal qila boshlaydi.');
  assert.equal(ru.supportLabel, 'Проблема с оплатой? Напишите или позвоните:');
  assert.equal(uz.supportLabel, 'To‘lovda muammo bormi? Yozing yoki qo‘ng‘iroq qiling:');
  const dialog = read('src/gpt-chat/account/AccountDialog.tsx');
  const panel = read('src/gpt-chat/account/PackPanel.tsx');
  assert.deepEqual([...dialog.matchAll(/action: "(\w+)"/g)].map((m) => m[1]), ['cancel_invoice']);
  for (const source of [dialog, panel, read('src/gpt-chat/types.ts')])
    assert.doesNotMatch(source, /refund_request|requestRefund|onRefund|\.refundable\b|refundable\?:|refundDays|refund_uzs/);
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

test('Payme in a rehearsal session: its button in the existing classes, its name in the card note, the test notice; Payme is never a guest\'s', async () => {
  const classes = (page: string) => new Set([...page.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)));
  for (const locale of LOCALES) {
    const copy = accountStrings(locale);
    // The committed config offers a rehearsal session Payme alone, in test.
    const page = await window(locale, member({ mode: 'test', providers: ['payme'] }));
    assert.deepEqual(payButtons(page), ['payme']);
    assert.ok(has(page, copy.payVia('Payme')) && has(page, copy.payNote('Payme')) && has(page, copy.test), locale);
    assert.match(page, /<button type="button" class="gpt-primary" data-provider="payme" disabled="">/);
    assert.match(page, /data-provider="payme"[^>]*>[^<]*<span aria-hidden="true">↗<\/span>/);
    // No class the Click window does not already use: the CSS stays as it is.
    const known = classes(await window(locale, member({ mode: 'test', providers: ['click'] })));
    assert.deepEqual([...classes(page)].filter((name) => !known.has(name)), [], locale);
    // Beside Click (a live Payme some day): Click first, both named in the note.
    const both = await window(locale, member({ providers: ['click', 'payme'] }));
    assert.deepEqual(payButtons(both), ['click', 'payme']);
    assert.ok(has(both, copy.payNote(`Click${copy.or}Payme`)), locale);
    // A guest pays with Click alone: Payme waits for the sign-in.
    const guestPage = await window(locale, guest({ providers: ['click', 'payme'], guestCheckout: true }));
    assert.ok(!payButtons(guestPage).includes('payme'), locale);
  }
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
      await window(locale, withPack({ receipts: [{ kind: 'PERFORM', receipt_url: 'https://ofd.soliq.uz/epi?t=1' }, { kind: 'PERFORM', receipt_url: 'javascript:alert(1)' }] })),
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
  assert.deepEqual(Object.keys(views).sort(), ['cancelled', 'code', 'guest', 'member', 'off', 'packs', 'paid', 'pending', 'refunded', 'test', 'unseen']);
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

test('guest checkout: the pack, the offer and Click without signing in; a guest pack is kept through Telegram', async () => {
  for (const locale of LOCALES) {
    const copy = accountStrings(locale);
    const page = await window(locale, guest({ guestCheckout: true }));
    for (const line of [copy.price('20 000', 1, 300), copy.noRefund, copy.honesty, copy.terms, copy.payVia('Click'), copy.guestPayNote, copy.haveAccount])
      assert.ok(has(page, line), `${locale}: ${line}`);
    assert.deepEqual(payButtons(page), ['click'], 'Click alone: Uzum still needs the account');
    assert.ok(!has(page, copy.loginWhy), locale);
    // Paid without signing in in another browser (Telegram's own, say): where
    // the pack is, and who to write to with the Click receipt.
    assert.ok(has(page, copy.otherBrowser), locale);
    assert.match(page, /data-testid="ai-pack-support"/);
    // The offer box is explicit and starts unticked; the button waits for it.
    assert.match(page, /<input type="checkbox"\/>/);
    assert.match(page, /data-provider="click" disabled=""/);
    // The guest's pack: the save line, no sign-out that would leave the pack behind.
    const pack = await window(locale, withPack({ user: { signedIn: true, storageKey: 'b'.repeat(64), guest: true } }));
    for (const line of [copy.saveLine, copy.saveButton]) assert.ok(has(pack, line), `${locale}: ${line}`);
    assert.ok(!has(pack, copy.logout), locale);
    assert.ok(has(await window(locale, withPack()), copy.logout), locale);
    assert.ok(!has(await window(locale, withPack()), copy.saveLine), locale);
    // Paid: the one optional line under the way back to the chat.
    const paid = await window(locale, withPack({ user: { signedIn: true, storageKey: 'b'.repeat(64), guest: true } }), { watch: watchOf(), outcome: 'paid' });
    assert.ok(has(paid, copy.payPaid) && has(paid, copy.saveLine), locale);
  }
});

test('guest checkout waits for a browser that keeps cookies, and a sign-in through the bot carries on after a reload', async () => {
  const nav = globalThis.navigator as Navigator & { cookieEnabled?: boolean };
  Object.defineProperty(nav, 'cookieEnabled', { value: false, configurable: true });
  try {
    for (const locale of LOCALES) {
      const page = await window(locale, guest({ guestCheckout: true }));
      assert.deepEqual(payButtons(page), [], `${locale}: no guest checkout without cookies`);
      assert.ok(has(page, accountStrings(locale).loginWhy), locale);
    }
  } finally {
    delete nav.cookieEnabled;
  }
  // pay(): the guest cookie subscribe set is confirmed before the browser leaves for Click.
  assert.match(read('src/gpt-chat/account/AccountDialog.tsx'),
    /if \(!data\.user\) \{[\s\S]*?if \(\(await probe\.json\(\)\)\?\.user\?\.guest !== true\) \{\s*setCookiesBlocked\(true\);/);
  const kept = withPack({ user: { signedIn: true, storageKey: 'b'.repeat(64), guest: true } });
  for (const locale of LOCALES) assert.ok(!has(await window(locale, kept), accountStrings(locale).loginConsent), 'closed until asked');
  // The tab reloaded while Telegram was in front: the attempt is still in sessionStorage.
  const attempt = { id: '0123456789abcdef', mode: 'pick', code: '47', deepLink: `https://t.me/gptbotuz_bot?start=login_${'ab'.repeat(16)}`, expiresAt: Date.now() + 600_000 };
  const g = globalThis as { sessionStorage?: unknown };
  g.sessionStorage = { getItem: () => JSON.stringify(attempt), setItem: () => {}, removeItem: () => {} };
  try {
    for (const locale of LOCALES) {
      const copy = accountStrings(locale);
      const saving = await window(locale, kept);
      assert.ok(has(saving, copy.loginConsent) && !has(saving, copy.saveButton), `${locale}: the save screen polls on`);
      // BotLoginScreen is mounted on the saved attempt: its number, so its poll runs.
      assert.match(saving, /<strong class="gpt-login-code">47<\/strong>/);
      const paying = await window(locale, guest({ guestCheckout: true }));
      assert.ok(has(paying, copy.loginConsent) && /gpt-login-code">47</.test(paying), `${locale}: so does the guest's sign-in`);
    }
  } finally {
    delete g.sessionStorage;
  }
  // Live, not fixed when the window opened: an account read that fails on
  // the way back from Telegram (storageKey gone) and comes back (storageKey
  // again) re-reads the saved attempt, so the screen that polls it opens
  // again instead of the save button; a finished or ended attempt is cleared
  // before onSignedIn, so the block closes after a sign-in.
  const dialog = read('src/gpt-chat/account/AccountDialog.tsx');
  assert.match(dialog, /const \[signIn, setSignIn\] = useState\(\(\) => loadBotLogin\(\) !== null\);/);
  assert.match(dialog, /useEffect\(\(\) => \{ setSignIn\(loadBotLogin\(\) !== null\); \}, \[data\?\.user\?\.storageKey\]\);/);
  assert.doesNotMatch(dialog, /setSignIn\(false\)|resuming/);
  const screen = read('src/gpt-chat/account/BotLoginScreen.tsx');
  assert.match(screen, /ended\.current = true;\s*saveBotLogin\(null\);[\s\S]*?if \(next === 'done'\) void onSignedIn\(\);/);
});

test('sign-in through the bot: Telegram\'s Start button is named, and a pack that could not move says so', () => {
  for (const locale of LOCALES) {
    const copy = accountStrings(locale);
    // A first visit shows only Telegram's Start / «Запустить»: the bot sends nothing before it.
    const start = locale === 'ru' ? /Если там есть кнопка «Запустить» \(Start\), нажмите её\.$/ : /U yerda «Start» \(«Запустить»\) tugmasi bo‘lsa, uni bosing\.$/;
    assert.match(copy.botLoginSteps('gptbotuz_bot')[0], start, locale);
    assert.match(copy.botLoginCodeSteps('gptbotuz_bot')[0], start, locale);
    assert.match(copy.botLoginWaiting('9:59'), locale === 'ru' ? /^Ждём подтверждения… 9:59\. Бот молчит — нажмите в нём «Запустить» или Start\.$/ : /^Tasdiqlash kutilmoqda… 9:59\. Bot jim bo‘lsa, unda «Start» yoki «Запустить» tugmasini bosing\.$/);
  }
  // status.ts answers "failed" when the guest's pack could not move: the
  // attempt is over, with the sign-in error instead of «link expired».
  const screen = read('src/gpt-chat/account/BotLoginScreen.tsx');
  assert.match(screen, /const STATUSES: readonly string\[\] = \['pending', 'claimed', 'rejected', 'expired', 'done', 'failed'\];/);
  assert.match(screen, /status === 'done' \|\| status === 'rejected' \|\| status === 'expired' \|\| status === 'failed'/);
  assert.match(screen, /status === 'failed' \? copy\.loginFailed : copy\.botLoginExpired/);
});
