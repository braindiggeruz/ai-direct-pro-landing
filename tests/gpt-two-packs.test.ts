// Two packs in the pack window and on the paywall (chat CRO 2026-11-17, the
// 3-day pack): what the cards do with the account view's `pack.more`. With no
// second pack on offer every card is the one-pack card it always was.
// The server side is tests/gpt-once-pack.test.ts; a real browser drives the
// same screens in tests/gpt-pay-browser.test.ts.
//
// Run: node --import tsx --test tests/gpt-two-packs.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Dialog } from '../src/components/ui/dialog';
import { accountPart } from '../src/gpt-chat/lazy-part';
import { loginPart, payPart, uzumPart } from '../src/gpt-chat/account/pay-part';
import { accountStrings } from '../src/gpt-chat/account-strings';
import { strings } from '../src/gpt-chat/i18n';
import { orderId } from '../src/gpt-chat/checkout';
import { listed, offersOf, perAnswer, type PackOffer } from '../src/gpt-chat/pack-offers';
import { PACK_TEXT, packText, sumOf } from '../src/gpt-chat/pack-text';
import { PayExtras, PayPacks, PayUnpaid, TEXT } from '../src/gpt-chat/parts/pay-screens';
import type { AccountWindowMemory } from '../src/gpt-chat/account/AccountDialog';
import type { AccountHandle } from '../src/gpt-chat/use-account';
import type { CheckoutWatch } from '../src/gpt-chat/checkout';
import type { AccountView, PackTerms } from '../src/gpt-chat/types';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const LOCALES = ['ru', 'uz'] as const;
type Locale = (typeof LOCALES)[number];
const read = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const html = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const has = (page: string, text: string) => page.includes(html(text));
const node = (element: React.ReactElement) => renderToStaticMarkup(React.createElement(Dialog, { open: true }, element));

const ONCE = { sku: 'once', priceUzs: 5000, messageLimit: 30, dailyLimit: 50, hours: 72, vat: null };
const MONTH: PackTerms = { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: { percent: 12, includedTiyin: 214286 } };
const BOTH: PackTerms = { ...MONTH, more: [ONCE] };
const ORDER = `pay_${'a'.repeat(32)}`;

const guest = (over: Partial<AccountView> = {}): AccountView => ({
  ok: true, loginAvailable: true, loginMethods: ['bot'], mode: 'live', providers: ['click', 'payme'], user: null, guestCheckout: true,
  terms: { ru: 'https://gptbot.uz/ru/oferta/', uz: 'https://gptbot.uz/uz/oferta/' }, termsVersion: 'ai-paket-2026-10-v2',
  freeLimits: { daily: 15, hourly: 5 }, pack: BOTH, uzumFlow: 'checkout', ...over,
});
const member = (over: Partial<AccountView> = {}): AccountView =>
  guest({ user: { signedIn: true, storageKey: 'a'.repeat(64), guest: true }, remaining: 7, paymentCode: null, ...over });

async function window(locale: Locale, data: AccountView | null, options: { watch?: CheckoutWatch | null; loading?: boolean } = {}): Promise<string> {
  const { AccountDialog } = await accountPart.load();
  await Promise.all([payPart.load(), uzumPart.load(), loginPart.load()]);
  const account: AccountHandle = { data, error: false, loading: options.loading ?? false, refresh: async () => {}, fail: () => {}, forget: () => {}, clearError: () => {} };
  return renderToStaticMarkup(
    React.createElement(Dialog, { open: true },
      React.createElement(AccountDialog, {
        t: strings(locale), locale, apiBase: '', account, loginFailed: false, onClose: () => {},
        memoryRef: { current: { requestKeys: {}, refusedForTerms: null, paymentCode: null } as AccountWindowMemory },
        checkout: { watch: options.watch ?? null, outcome: null, start: () => {}, dismiss: () => {} },
      })),
  );
}

/** The rows of packs in a page, as [sku, [providers]] in the order they are drawn. */
const rowsOf = (page: string) => [...page.matchAll(/<section class="gpt-pay-pack" data-sku="(month|once)"[\s\S]*?<\/section>/g)]
  .map((row) => [row[1], [...row[0].matchAll(/<button[^>]*data-provider="(\w+)"[^>]*data-sku="(\w+)"/g)].map((button) => `${button[1]}:${button[2]}`)]);

// ------------------------------------------------------------------ the offers

test('the offers: the monthly pack, and the 3-day pack beside it only as the server states it, whole and well formed', () => {
  assert.deepEqual(offersOf(null), []);
  assert.deepEqual(offersOf(MONTH), [{ sku: 'month', priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1 }]);
  assert.deepEqual(offersOf(BOTH), [
    { sku: 'month', priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1 },
    { sku: 'once', priceUzs: 5000, messageLimit: 30, dailyLimit: 50, hours: 72 },
  ]);
  // Anything malformed is dropped: the cards are then the one-pack cards.
  for (const more of [undefined, null, 'once', {}, [], [null], [{ ...ONCE, sku: 'year' }], [{ ...ONCE, priceUzs: 0 }], [{ ...ONCE, priceUzs: '5000' }], [{ ...ONCE, priceUzs: 5000.5 }],
    [{ ...ONCE, messageLimit: -1 }], [{ ...ONCE, dailyLimit: 0 }], [{ ...ONCE, hours: 0 }], [{ ...ONCE, hours: 30 }], [{ sku: 'once' }]])
    assert.equal(offersOf({ ...MONTH, more }).length, 1, JSON.stringify(more));
  // Someone without a pack sees the small one first; a holder the month.
  const offers = offersOf(BOTH);
  assert.deepEqual(listed(offers, false).map((offer) => offer.sku), ['once', 'month']);
  assert.deepEqual(listed(offers, true).map((offer) => offer.sku), ['month', 'once']);
  assert.deepEqual(listed(offersOf(MONTH), false).map((offer) => offer.sku), ['month']);
  assert.deepEqual(offers.map(perAnswer), [67, 167]);
});

test('the words of the packs: both languages, every number from the offer, the Uzbek apostrophes typographic', () => {
  const [month, once] = offersOf(BOTH);
  assert.deepEqual([PACK_TEXT.ru.name(once), PACK_TEXT.ru.name(month), PACK_TEXT.uz.name(once), PACK_TEXT.uz.name(month)], ['На 3 дня', 'На месяц', '3 kunga', '1 oyga']);
  assert.deepEqual([PACK_TEXT.ru.sum(once), PACK_TEXT.ru.sum(month), PACK_TEXT.uz.sum(once)], ['5 000 сум', '20 000 сум', '5 000 so‘m']);
  assert.deepEqual([PACK_TEXT.ru.facts(once), PACK_TEXT.ru.facts(month)], ['30 ответов · 3 дня', '300 ответов · до 50 в день']);
  assert.deepEqual([PACK_TEXT.uz.facts(once), PACK_TEXT.uz.facts(month)], ['30 ta javob · 3 kun', '300 ta javob · kuniga 50 tagacha']);
  assert.equal(PACK_TEXT.ru.per(167), '≈ 167 сум за ответ');
  assert.equal(PACK_TEXT.ru.pay(once, 'Click'), 'Оплатить 5 000 сум через Click');
  assert.equal(PACK_TEXT.uz.pay(once, 'Payme'), 'Payme orqali 5 000 so‘m to‘lash');
  assert.equal(PACK_TEXT.ru.cheaper(once), 'Или пакет на 3 дня — 5 000 сум');
  assert.equal(PACK_TEXT.uz.cheaper(once), 'Yoki 3 kunlik paket — 5 000 so‘m');
  assert.equal(PACK_TEXT.ru.link(once, 'Click'), 'Click · 5 000 сум');
  // The days in Russian: 1 день, 2 дня, 5 дней.
  const days = (hours: number) => PACK_TEXT.ru.name({ ...once, hours });
  assert.deepEqual([days(24), days(48), days(120), days(264), days(504)], ['На 1 день', 'На 2 дня', 'На 5 дней', 'На 11 дней', 'На 21 день']);
  assert.equal(sumOf(1234567), '1 234 567');
  assert.equal(packText('uz'), PACK_TEXT.uz);
  assert.deepEqual(Object.keys(PACK_TEXT.ru).sort(), Object.keys(PACK_TEXT.uz).sort());
  for (const key of Object.keys(PACK_TEXT.uz) as Array<keyof typeof PACK_TEXT.uz>) {
    const value = PACK_TEXT.uz[key];
    const line = typeof value === 'string' ? value : (value as (...args: unknown[]) => string)(once, 'Click');
    assert.doesNotMatch(String(line), /['`]/, `${key}: ${line}`);
  }
  // No word that the offer does not use for a pack, no promise.
  for (const locale of LOCALES) for (const offer of [month, once]) assert.doesNotMatch(PACK_TEXT[locale].facts(offer) + PACK_TEXT[locale].name(offer), /ChatGPT|безлимит|cheksiz|!/);
});

// ------------------------------------------------------------------ the window

test('the window with one pack is the window it was: the monthly buttons, the price card, no rows', async () => {
  for (const locale of LOCALES) {
    const copy = accountStrings(locale);
    const page = await window(locale, guest({ pack: MONTH }));
    assert.doesNotMatch(page, /gpt-pay-packs|data-sku=/, locale);
    assert.equal([...page.matchAll(/<button[^>]*class="gpt-primary"[^>]*data-provider="(click|payme)"/g)].length, 2);
    assert.ok(has(page, copy.payVia('Click')) && has(page, copy.payVia('Payme')));
    assert.ok(page.includes('gpt-price'), 'the price card');
    assert.match(page, /data-testid="ai-pay-per"/);
  }
});

test('the window with two packs: a row each with its own buttons, the small one first for someone without a pack, the month first for a holder', async () => {
  for (const locale of LOCALES) {
    const s = packText(locale);
    const [month, once] = offersOf(BOTH);
    const page = await window(locale, guest());
    assert.deepEqual(rowsOf(page), [['once', ['click:once', 'payme:once']], ['month', ['click:month', 'payme:month']]], locale);
    for (const offer of [once, month]) {
      assert.ok(has(page, s.name(offer)) && has(page, s.sum(offer)) && has(page, s.facts(offer)) && has(page, s.per(perAnswer(offer))), `${locale}: ${offer.sku}`);
      for (const provider of ['Click', 'Payme']) assert.ok(page.includes(`aria-label="${html(s.pay(offer, provider))}"`), `${locale}: ${offer.sku} ${provider}`);
    }
    // The mark goes to the cheapest answer, once.
    assert.equal([...page.matchAll(new RegExp(`<em>${s.best}</em>`, 'g'))].length, 1);
    assert.match(page, new RegExp(`data-sku="month"[\\s\\S]*?<em>${s.best}</em>`));
    // The rows carry the prices: no big price of one pack over them, no single «per answer» line; the notes stay.
    assert.ok(!page.includes('gpt-price'), 'no single price card');
    assert.doesNotMatch(page, /data-testid="ai-pay-per"/);
    assert.match(page, /data-testid="ai-pack-no-refund"/);
    assert.match(page, /data-testid="ai-pack-honesty"/);
    // Nothing is preselected and nothing is a form.
    assert.doesNotMatch(page, /type="radio"|type="checkbox" checked|aria-checked="true"/);
    // A holder: the month first; no row is hidden.
    const holder = await window(locale, member({ access: { order_id: ORDER, ends_at: Date.now() + 86_400_000, remaining: 100, renewSoon: false } }));
    assert.deepEqual(rowsOf(holder).map((row) => row[0]), ['month', 'once'], locale);
    // Uzum sells the monthly pack only.
    const uzum = await window(locale, member({ user: { signedIn: true, storageKey: 'a'.repeat(64) }, providers: ['click', 'uzum', 'payme'] }));
    assert.deepEqual(rowsOf(uzum), [['once', ['click:once', 'payme:once']], ['month', ['click:month', 'uzum:month', 'payme:month']]]);
  }
});

test('with an invoice open the other pack can still be chosen; the same pack is resumed as what it is', async () => {
  // An open monthly invoice: the rows stay live (the server closes an unseen invoice, or names the held one).
  const open = await window('ru', member({ payment: { id: ORDER, state: 'pending', provider: 'click', cancellable: true, sku: 'month', priceUzs: 20000, messageLimit: 300 } }));
  const buttons = [...open.matchAll(/<button[^>]*data-provider="\w+"[^>]*data-sku="\w+"[^>]*>/g)].map((tag) => tag[0]);
  assert.equal(buttons.length, 4);
  for (const tag of buttons) assert.doesNotMatch(tag, /disabled/, tag);
  assert.match(open, /data-testid="ai-pay-open"/, 'and the invoice itself can be resumed or closed');
  const dialog = read('src/gpt-chat/account/AccountDialog.tsx');
  assert.match(dialog, /const payable = startable \|\| \(two && resumable\);/);
  assert.match(dialog, /payWhenRead\(openPayment\.provider, false, openPayment\.sku \?\? "month"\)/);
  // With one pack an open invoice holds the buttons, as before.
  const single = await window('ru', member({ pack: MONTH, payment: { id: ORDER, state: 'pending', provider: 'click', cancellable: true } }));
  for (const tag of [...single.matchAll(/<button[^>]*class="gpt-primary"[^>]*data-provider="(click|payme)"[^>]*>/g)].map((match) => match[0])) assert.match(tag, /disabled/, tag);
});

test('the request: the 3-day pack by name and under its own key; the monthly pack is the request it always was', () => {
  const dialog = read('src/gpt-chat/account/AccountDialog.tsx');
  assert.match(dialog, /const pay = \(provider: PaymentProvider, ask = false, sku: PackSku = "month"\) =>/);
  assert.match(dialog, /const key = sku === "once" \? `\$\{provider\}:once` : provider;/);
  assert.match(dialog, /requestId: memoryRef\.current\.requestKeys\[key\],\s*(?:\/\/[^\n]*\n\s*)*\.\.\.\(sku === "once" \? \{ sku \} : \{\}\),/);
  // A pack the server does not offer is never asked for.
  assert.match(dialog, /const offer = offers\.find\(\(entry\) => entry\.sku === sku\);/);
  assert.match(dialog, /\|\| !data \|\| !offer \|\|/);
  // The tap on a card outside the window names its pack in the request itself (no shared state to go stale).
  const panel = read('src/gpt-chat/components/AiAccountPanel.tsx');
  assert.match(panel, /sku\?: "once";/);
  assert.match(panel, /autoPay=\{openRequest\?\.pay \? \{ seq: openRequest\.seq, provider: openRequest\.pay, offerKey: openRequest\.offerKey \?\? null, sku: openRequest\.sku \} : null\}/);
  const console = read('src/gpt-chat/components/AiChatConsole.tsx');
  assert.match(console, /const openAccount = \(from: PackFrom, pay\?: PaymentProvider, sku\?: "once"\) => setAccountOpen\(\(last\) => \(\{\s*seq: \(last\?\.seq \?\? 0\) \+ 1, from, pay, offerKey: pay \? payOffer\?\.offerKey : null, sku,\s*\}\)\);/);
  assert.match(console, /onPay=\{\(provider,sku\)=>openAccount\('limit_card',provider,sku\)\}/);
  // The limit card and the card after an answer sell the monthly pack: their taps carry no pack.
  assert.match(console, /onPay=\{\(provider\) => openAccount\("limit_card", provider\)\}/);
  // An order of the 3-day pack is an order the client knows (the cookie probe compares its id).
  assert.equal(orderId(`pk_${'a'.repeat(32)}`), `pk_${'a'.repeat(32)}`);
  assert.equal(orderId(`pay_${'a'.repeat(32)}`), `pay_${'a'.repeat(32)}`);
  for (const id of [`pk_${'a'.repeat(31)}`, `px_${'a'.repeat(32)}`, `pk_${'A'.repeat(32)}`, 'pk_']) assert.equal(orderId(id), null, id);
  assert.doesNotMatch(read('src/gpt-chat/pack-offers.ts'), /\blet\b/, 'no module state');
});

// ------------------------------------------------------------------ chat-pay

test('the rows, standalone: the mark on the cheapest answer, buttons named for a screen reader, disabled while busy', () => {
  const offers = listed(offersOf(BOTH), false);
  for (const locale of LOCALES) {
    const page = node(React.createElement(PayPacks, { locale, offers, providers: ['click', 'payme'], busy: false, onPay: () => {} }));
    assert.deepEqual(rowsOf(page), [['once', ['click:once', 'payme:once']], ['month', ['click:month', 'payme:month']]]);
    assert.doesNotMatch(page, /disabled/);
    const busy = node(React.createElement(PayPacks, { locale, offers, providers: ['click'], busy: true, onPay: () => {} }));
    assert.equal([...busy.matchAll(/<button[^>]*disabled/g)].length, 2);
  }
  const source = read('src/gpt-chat/parts/pay-screens.tsx');
  assert.match(source, /onClick=\{\(\) => onPay\(provider, offer\.sku\)\}/);
  assert.match(source, /providers\.filter\(\(provider\) => offer\.sku === 'month' \|\| provider !== 'uzum'\)/);
});

test('«Попросить оплатить» with two packs: a link per pack and provider, each with its sum; with one pack the two links it had', () => {
  for (const locale of LOCALES) {
    const s = TEXT[locale];
    const scope = globalThis as unknown as { sessionStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> };
    const before = scope.sessionStorage;
    scope.sessionStorage = { getItem: (key) => (key === 'gptchat_ask' ? '1' : null), setItem: () => {}, removeItem: () => {} };
    try {
      const offers = listed(offersOf(BOTH), false);
      const two = node(React.createElement(PayExtras, { locale, pack: BOTH, offers, providers: ['click', 'payme'], busy: false, termsUrl: null, onAsk: () => {} }));
      assert.deepEqual([...two.matchAll(/<button[^>]*data-provider="(\w+)" data-sku="(\w+)"[^>]*>([^<]*)</g)].map((button) => [button[1], button[2], button[3]]), [
        ['click', 'once', packText(locale).link(offers[0], 'Click')], ['payme', 'once', packText(locale).link(offers[0], 'Payme')],
        ['click', 'month', packText(locale).link(offers[1], 'Click')], ['payme', 'month', packText(locale).link(offers[1], 'Payme')],
      ].map((row) => [row[0], row[1], html(row[2])]), locale);
      assert.doesNotMatch(two, /data-testid="ai-pay-per"/);
      const one = node(React.createElement(PayExtras, { locale, pack: MONTH, offers: offersOf(MONTH), providers: ['click', 'payme'], busy: false, termsUrl: null, onAsk: () => {} }));
      assert.deepEqual([...one.matchAll(/<button[^>]*data-provider="(\w+)" data-sku="(\w+)"[^>]*>([^<]*)</g)].map((button) => [button[1], button[2], button[3]]),
        [['click', 'month', html(s.askFor('Click'))], ['payme', 'month', html(s.askFor('Payme'))]]);
      assert.match(one, /data-testid="ai-pay-per"/);
    } finally { scope.sessionStorage = before; }
  }
});

test('back without a payment for the month: the 3-day pack in one tap with the same provider; never offered over itself', async () => {
  const once = offersOf(BOTH)[1] as PackOffer;
  const card = (locale: Locale, cheaper: { offer: PackOffer; onPay: () => void } | null) => node(React.createElement(PayUnpaid, {
    heading: true, orderId: ORDER, locale, apiBase: '', provider: 'click', since: Date.now(), closed: false, busy: false,
    onContinue: () => {}, onOther: () => {}, onAsk: () => {}, cheaper,
  }));
  for (const locale of LOCALES) {
    const withSmall = card(locale, { offer: once, onPay: () => {} });
    assert.match(withSmall, /data-testid="ai-pay-cheaper"/);
    assert.ok(has(withSmall, `${packText(locale).cheaper(once)} · Click`), locale);
    assert.doesNotMatch(card(locale, null), /ai-pay-cheaper/);
  }
  const dialog = read('src/gpt-chat/account/AccountDialog.tsx');
  assert.match(dialog, /const cheaper = small && \(data\?\.payment\?\.sku \?\? "month"\) === "month" && \(unpaidWith === "click" \|\| unpaidWith === "payme"\)\s*\? \{ offer: small, onPay: \(\) => payWhenRead\(unpaidWith, false, "once"\) \}\s*: null;/);
  // The window: a cancelled monthly order with the small pack on offer shows the line; a cancelled 3-day order does not.
  const watch: CheckoutWatch = { provider: 'click', flow: 'redirect', at: Date.now(), attemptId: ORDER, before: null };
  const month = await window('ru', member({ payment: { id: ORDER, state: 'cancelled', provider: 'click', sku: 'month', priceUzs: 20000, messageLimit: 300 } }), { watch });
  assert.match(month, /data-testid="ai-pay-cheaper"/);
  const small = await window('ru', member({ payment: { id: ORDER, state: 'cancelled', provider: 'click', sku: 'once', priceUzs: 5000, messageLimit: 30 } }), { watch });
  assert.doesNotMatch(small, /ai-pay-cheaper/);
  const single = await window('ru', member({ pack: MONTH, payment: { id: ORDER, state: 'cancelled', provider: 'click' } }), { watch });
  assert.doesNotMatch(single, /ai-pay-cheaper/);
});

// ------------------------------------------------------------------ the paywall

test('the paywall: with two packs a row each, the small one first, the tap names its pack; with one pack the buttons it had', () => {
  const paywall = read('src/gpt-chat/parts/chat-conversion.tsx');
  assert.match(paywall, /const offers = listed\(offersOf\(pack\), false\);/);
  assert.match(paywall, /\{offers\.length > 1 \? \(\s*<div className="gpt-trial-packs" data-testid="trial-packs">/);
  assert.match(paywall, /onPay\(provider, offer\.sku === 'once' \? 'once' : undefined\);/);
  assert.match(paywall, /providers\.filter\(provider => offer\.sku === 'month' \|\| provider !== 'uzum'\)/);
  // One pack: the value line and the buttons with the sum, untouched.
  assert.match(paywall, /\) : <>\s*<div className="gpt-trial-value"><strong>\{c\.pack\}<\/strong><span>\{c\.facts\}<\/span><\/div>\s*<div className="gpt-trial-pay">\{providers\.map\(provider => <button type="button" key=\{provider\} data-provider=\{provider\} onClick=\{\(\) => \{ setOpen\(false\); track\(EV\.packPromptClicked, \{ locale, surface: 'trial_exhausted', provider \}\); onPay\(provider\); \}\}>\{c\.pay\(provider\)\}/);
  // The copy is the same module the window's rows use.
  assert.match(paywall, /import \{ packText \} from '\.\.\/pack-text';/);
  // The start bundle carries neither the offers nor their words.
  for (const file of ['src/gpt-chat/components/AiChatConsole.tsx', 'src/gpt-chat/components/AiAccountPanel.tsx', 'src/gpt-chat/checkout.ts', 'src/gpt-chat/types.ts', 'src/gpt-chat/components/AiLimitPay.tsx'])
    assert.doesNotMatch(read(file), /from ['"][^'"]*pack-(offers|text)['"]/, file);
});
