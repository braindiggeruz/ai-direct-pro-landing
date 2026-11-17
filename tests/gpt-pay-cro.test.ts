// Chat CRO 2026-11-17, the checkout (P1, P2, P4, P5, P6): the lazy part chat-pay
// and what the pack window does with it. Rendered the way the window renders
// (tests/gpt-pack-dialog.test.ts), with a fake fetch for the counted steps.
// No order is made and no provider is called.
//
// Run: node --import tsx --test tests/gpt-pay-cro.test.ts
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
import type { AccountWindowMemory } from '../src/gpt-chat/account/AccountDialog';
import type { AccountHandle } from '../src/gpt-chat/use-account';
import type { CheckoutOutcome, CheckoutWatch } from '../src/gpt-chat/checkout';
import type { AccountView, PackTerms } from '../src/gpt-chat/types';
import {
  ASK_KEY, ORDER_LIFETIME_MS, PayExtras, PayHolderless, PayShare, PayStall, PayUnpaid, TEXT, abortReason, orderRef, clientClass, elapsedBucket, payEvent,
} from '../src/gpt-chat/parts/pay-screens';
import { PAYMENT_TTL_MS } from '../functions/lib/gpt-chat/billing-config';
import { parseUiEvent } from '../functions/lib/gpt-chat/ui-event-store';
import { ABORT_REASONS } from '../src/shared/checkout-events';
import { offersOf } from '../src/gpt-chat/pack-offers';
import { STUDIO_TELEGRAM_URL } from '../src/shared/studio-contact';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const LOCALES = ['ru', 'uz'] as const;
type Locale = (typeof LOCALES)[number];
const read = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const html = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const has = (page: string, text: string) => page.includes(html(text));
const PACK: PackTerms = { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: { percent: 12, includedTiyin: 214286 } };
const ORDER = `pay_${'a'.repeat(32)}`;
const NOW = Date.now();
// Titles belong to a dialog, as in the window.
const node = (element: React.ReactElement) => renderToStaticMarkup(React.createElement(Dialog, { open: true }, element));

const guest = (over: Partial<AccountView> = {}): AccountView => ({
  ok: true, loginAvailable: true, loginMethods: ['bot'], mode: 'live', providers: ['click', 'payme'], user: null,
  terms: { ru: 'https://gptbot.uz/ru/oferta/', uz: 'https://gptbot.uz/uz/oferta/' }, termsVersion: 'ai-paket-2026-10-v2',
  freeLimits: { daily: 15, hourly: 5 }, pack: PACK, uzumFlow: 'checkout', ...over,
});
const member = (over: Partial<AccountView> = {}): AccountView =>
  guest({ user: { signedIn: true, storageKey: 'a'.repeat(64), guest: true }, remaining: 7, paymentCode: null, ...over });
const watchOf = (over: Partial<CheckoutWatch> = {}): CheckoutWatch => ({ provider: 'click', flow: 'redirect', at: NOW, attemptId: ORDER, before: null, ...over });

async function window(
  locale: Locale,
  data: AccountView | null,
  options: { watch?: CheckoutWatch | null; outcome?: CheckoutOutcome | null; memory?: Partial<AccountWindowMemory>; loading?: boolean } = {},
): Promise<string> {
  const { AccountDialog } = await accountPart.load();
  await Promise.all([payPart.load(), uzumPart.load(), loginPart.load()]);
  const account: AccountHandle = {
    data, error: false, loading: options.loading ?? false, refresh: async () => {}, fail: () => {}, forget: () => {}, clearError: () => {},
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

// ------------------------------------------------------------------ P1

test('P1: the client class is two words from closed lists, the time a bucket, the reason one word — never the user agent', () => {
  const telegramAndroid = 'Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36 Telegram-Android/10.9.0';
  const instagramIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/21E236 Instagram 330.0.0.0.0';
  const facebook = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0;]';
  const yandex = 'Mozilla/5.0 (Linux; arm_64; Android 12; M2102) AppleWebKit/537.36 Chrome/118 YaBrowser/23.11 Mobile Safari/537.36';
  const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15';
  assert.deepEqual(clientClass(telegramAndroid, 5, false), { app: 'telegram', os: 'android' });
  assert.deepEqual(clientClass(instagramIos, 5, false), { app: 'instagram', os: 'ios' });
  assert.deepEqual(clientClass(facebook, 5, false), { app: 'facebook', os: 'android' });
  assert.deepEqual(clientClass(yandex, 5, false), { app: 'yandex', os: 'android' });
  assert.deepEqual(clientClass(desktop, 0, false), { app: 'none', os: 'desktop' });
  assert.deepEqual(clientClass(ipad, 5, false), { app: 'none', os: 'ios' }, 'an iPad asks for the desktop site');
  assert.deepEqual(clientClass(ipad, 0, false), { app: 'none', os: 'desktop' });
  assert.deepEqual(clientClass('', 0, true), { app: 'telegram', os: 'desktop' }, "Telegram's own web view announces itself");
  assert.deepEqual(clientClass('', 0, false), { app: 'none', os: 'desktop' });
  for (const [ms, bucket] of [[0, 'lt1'], [999, 'lt1'], [1000, 's1_3'], [2999, 's1_3'], [3000, 's3_8'], [7999, 's3_8'], [8000, 'gt8'], [600_000, 'gt8']] as const)
    assert.equal(elapsedBucket(ms), bucket, String(ms));
  assert.equal(abortReason('terms_changed'), 'terms_changed');
  assert.equal(abortReason('pending_elsewhere'), 'pending_elsewhere');
  assert.equal(abortReason('checkout_unavailable'), 'unavailable');
  assert.equal(abortReason('<script>'), 'other');
  assert.equal(abortReason('pay_' + 'a'.repeat(32)), 'other');
  assert.equal(abortReason('__proto__'), 'other');
});

test('P1: every step the browser sends is accepted by the server and carries nothing else; keepalive, so a step before the redirect survives it', () => {
  const g = globalThis as Record<string, unknown>;
  const sent: { url: string; init: RequestInit }[] = [];
  const saved = { fetch: g.fetch, sessionStorage: g.sessionStorage, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
  g.fetch = (url: string, init: RequestInit) => { sent.push({ url, init }); return Promise.resolve(new Response('{}')); };
  g.sessionStorage = { getItem: () => null, setItem: () => {} };
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Telegram-Android/10.9', maxTouchPoints: 5 }, configurable: true });
  try {
    const since = Date.now() - 2_000;
    payEvent('', 'checkout_created', 'click', since);
    payEvent('', 'checkout_probe_failed', 'payme', since);
    payEvent('', 'checkout_redirect', 'click', Date.now() - 9_000);
    for (const reason of ABORT_REASONS) payEvent('', 'checkout_aborted', 'click', since, reason);
    payEvent('', 'checkout_return_unpaid', 'payme', since, 'none');
    payEvent('', 'checkout_return_unpaid', null, since, 'cancelled');
    assert.equal(sent.length, 3 + ABORT_REASONS.length + 2);
    for (const { url, init } of sent) {
      assert.equal(url, '/api/gpt/event');
      assert.equal(init.keepalive, true, 'survives the navigation that follows');
      const body = JSON.parse(String(init.body)) as Record<string, string>;
      assert.deepEqual(Object.keys(body).sort(), ['detail', 'id', 'type', 'view']);
      assert.ok(parseUiEvent(body), `the server accepts ${body.type} ${body.detail}`);
      assert.doesNotMatch(String(init.body), /Mozilla|Android 14|Telegram-Android|pay_/);
    }
    assert.equal(JSON.parse(String(sent[0].init.body)).detail, 'click.s1_3.telegram.android');
    assert.equal(JSON.parse(String(sent[2].init.body)).detail, 'click.gt8.telegram.android');
    assert.equal(JSON.parse(String(sent.at(-1)!.init.body)).detail, 'cancelled.unknown.s1_3.telegram.android');
  } finally {
    g.fetch = saved.fetch;
    g.sessionStorage = saved.sessionStorage;
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator);
    else delete g.navigator;
  }
});

test('P1: pay() counts its steps in order — created after subscribe, redirect right before location.assign — and every stop is counted', () => {
  const dialog = read('src/gpt-chat/account/AccountDialog.tsx').replace(/\r\n/g, '\n');
  const pay = dialog.slice(dialog.indexOf('const pay = (provider'), dialog.indexOf("// Close the account's own invoice"));
  const order = ['post("/api/gpt/subscribe"', '"checkout_created"', 'allowedCheckoutUrl(result.checkoutUrl)', 'fetch(`${apiBase}/api/gpt/account`', '"checkout_probe_failed"', '"checkout_redirect"', 'location.assign(url)'];
  let at = -1;
  for (const marker of order) {
    const next = pay.indexOf(marker, at + 1);
    assert.ok(next > at, `${marker} comes after the step before it`);
    at = next;
  }
  // The step sent last goes out before the page leaves, and nothing but the tab's own bookkeeping sits between.
  assert.match(pay, /"checkout_redirect", provider, t0\);\s*checkout\.start\(\{ provider, flow: "redirect", at: Date\.now\(\), attemptId, before: null \}\);\s*location\.assign\(url\);/);
  // No bare return after the order exists: every stop counts and speaks.
  const afterOrder = pay.slice(pay.indexOf('"checkout_created"'));
  assert.doesNotMatch(afterOrder, /return;\s*(?:\/\/[^\n]*\n\s*)*if \(!stillCurrent|if \(!stillCurrent\(\)\) return;|if \(!url\) throw/);
  assert.match(afterOrder, /if \(!stillCurrent\(\)\) return stop\("stale"\);/);
  assert.match(afterOrder, /if \(!url\) return stop\("bad_url"\);/);
  assert.match(afterOrder, /stop\("cookies"\);\s*setCookiesBlocked\(true\);/);
  assert.match(pay, /const stop = \(reason: "stale" \| "bad_url" \| "cookies"\) => \{\s*m\?\.payEvent\(apiBase, "checkout_aborted", provider, t0, reason\);\s*if \(reason !== "cookies"\) setStall\(/);
  // A refusal (any code) is counted with its reason word, and a payment failure speaks with a retry instead of the generic error.
  assert.match(dialog, /m\.abortReason\(code\)/);
  assert.match(dialog, /if \(trace\) setStall\(\{ provider: trace\.provider, ask: trace\.ask, sku: trace\.sku, kind: "failed" \}\);\s*else account\.fail\(\);/);
  // The payment never waits for the part: it is loaded beside the request and a failed load is only a missing count.
  assert.match(pay, /const loaded = payPart\.load\(\)\.catch\(\(\) => null\);/);
  // A guest's cookie rule is unchanged: Click is never opened before the cookie is confirmed (tests/gpt-pack-dialog.test.ts pins the probe).
  assert.ok(pay.indexOf('setCookiesBlocked(true)') < pay.indexOf('location.assign(url)'));
});

// ------------------------------------------------------------------ P2

test('P2: while the order is made and the browser leaves, the window says «Открываем страницу Click…» / «Click sahifasi ochilmoqda…»', () => {
  for (const [locale, provider, text] of [['ru', 'Click', 'Открываем страницу Click…'], ['uz', 'Click', 'Click sahifasi ochilmoqda…'], ['ru', 'Payme', 'Открываем страницу Payme…'], ['uz', 'Payme', 'Payme sahifasi ochilmoqda…']] as const)
    assert.equal(accountStrings(locale).payOpening(provider), text);
  const dialog = read('src/gpt-chat/account/AccountDialog.tsx').replace(/\r\n/g, '\n');
  // The state is set at the tap, before the request, and shows the provider's name.
  assert.ok(dialog.indexOf('setLeaving(provider)') < dialog.indexOf('post("/api/gpt/subscribe"'));
  assert.match(dialog, /if \(leaving\)\s*return \(\s*<>\s*<DialogTitle>\{copy\.title\}<\/DialogTitle>\s*<DialogDescription asChild>\s*<p role="status" className="gpt-notice" data-testid="ai-pay-opening">\{copy\.payOpening\(PROVIDER_NAMES\[leaving\]\)\}<\/p>/);
  // It ends with the request unless the browser really leaves (the page cache brings it back).
  assert.match(dialog, /if \(!redirecting\.current\) setLeaving\(null\);/);
  assert.match(dialog, /redirecting\.current = true;/);
});

test('P2: a flow that stopped says so, with a retry, in both languages; the retry is the same order', () => {
  for (const locale of LOCALES) {
    const s = TEXT[locale];
    for (const kind of ['stale', 'bad_url', 'failed'] as const) {
      const page = node(React.createElement(PayStall, { locale, provider: 'payme', kind, busy: false, onRetry: () => {} }));
      assert.match(page, /role="alert"/);
      assert.ok(has(page, s.retry), `${locale}/${kind}: a retry button`);
      assert.ok(page.includes('Payme'), `${locale}/${kind}: names the provider`);
      assert.ok(has(page, kind === 'failed' ? s.stallFailed('Payme') : s.stallOpen('Payme')));
      assert.doesNotMatch(page, /disabled=""/);
    }
    assert.match(node(React.createElement(PayStall, { locale, provider: 'click', kind: 'stale', busy: true, onRetry: () => {} })), /disabled=""/, 'no second tap while one is running');
  }
  const dialog = read('src/gpt-chat/account/AccountDialog.tsx').replace(/\r\n/g, '\n');
  assert.match(dialog, /onRetry=\{\(\) => payWhenRead\(stall\.provider, stall\.ask, stall\.sku\)\}/);
  // The stale-dialog check no longer fires for the guest account subscribe itself made.
  assert.match(dialog, /\(!data\.user \|\| latestAccount\.current\?\.user\?\.storageKey === data\.user\.storageKey\)/);
});

// ------------------------------------------------------------------ P6

test('P6: what happens next, and the price of one answer from the pack facts: «≈ 67 сум за ответ» / «≈ 67 so‘m — bitta javob»', () => {
  const extras = (locale: Locale, pack = PACK, providers: ('click' | 'payme' | 'uzum')[] = ['click', 'payme']) =>
    node(React.createElement(PayExtras, { locale, pack, offers: offersOf(pack), providers, busy: false, termsUrl: `https://gptbot.uz/${locale}/oferta/`, onAsk: () => {} }));
  const ru = extras('ru');
  const uz = extras('uz');
  assert.ok(has(ru, '≈ 67 сум за ответ') && has(uz, '≈ 67 so‘m — bitta javob'));
  assert.ok(has(ru, 'Карту вводите на странице Click или Payme: к нам она не попадает.'));
  assert.ok(has(uz, 'Kartani Click yoki Payme sahifasida kiriting: u bizga kelmaydi.'));
  // The figure is the pack's: another pack, another figure; no literal is written.
  assert.ok(has(extras('ru', { ...PACK, priceUzs: 25000, messageLimit: 400 }), '≈ 63 сум за ответ'));
  assert.ok(has(extras('uz', { ...PACK, priceUzs: 12000, messageLimit: 100 }), '≈ 120 so‘m — bitta javob'));
  assert.doesNotMatch(extras('ru', { ...PACK, messageLimit: 0 }), /за ответ/, 'no division by nothing');
  // Nothing is said about a card page the visitor will not see (Uzum's app code).
  assert.doesNotMatch(extras('ru', PACK, ['uzum']), /Карту вводите/);
  // No comparison, no promise beyond the code.
  for (const page of [ru, uz]) assert.doesNotMatch(page, /ChatGPT|дешевле|arzon|выгод|скидк|chegirma|!/);
  assert.match(read('src/gpt-chat/account-strings.ts'), /Данные карты к нам не попадают/, 'the sentence is the window\'s own note, said where the visitor sees it');
});

// ------------------------------------------------------------------ P4

test('P4: «Попросить оплатить» is a secondary action: one tap opens the line that says creating the link accepts the offer, the second creates it', () => {
  const closed = node(React.createElement(PayExtras, { locale: 'ru', pack: PACK, offers: offersOf(PACK), providers: ['click', 'payme'], busy: false, termsUrl: 'https://gptbot.uz/ru/oferta/', onAsk: () => {} }));
  assert.match(closed, /data-testid="ai-pay-ask"[^>]*>Нет карты\? Попросить оплатить</, 'one quiet text link');
  assert.ok(!/gpt-primary/.test(closed), 'no third big button');
  assert.ok(!closed.includes('ai-pay-ask-box'), 'closed: nothing is created by looking');
  assert.ok(!/data-provider="/.test(closed), 'no provider button is mistaken for a pay button');
  const g = globalThis as Record<string, unknown>;
  const saved = g.sessionStorage;
  g.sessionStorage = { getItem: (key: string) => (key === ASK_KEY ? '1' : null), setItem: () => {}, removeItem: () => {} };
  try {
    for (const locale of LOCALES) {
      const open = node(React.createElement(PayExtras, { locale, pack: PACK, offers: offersOf(PACK), providers: ['click', 'payme'], busy: false, termsUrl: `https://gptbot.uz/${locale}/oferta/`, onAsk: () => {} }));
      assert.ok(open.includes('ai-pay-ask-box'), `${locale}: opened by «нет карты» in the survey`);
      assert.deepEqual([...open.matchAll(/data-provider="(\w+)"/g)].map((m) => m[1]), ['click', 'payme']);
      assert.match(open, new RegExp(`href="https://gptbot\\.uz/${locale}/oferta/"`));
      assert.ok(has(open, TEXT[locale].accept));
    }
  } finally {
    g.sessionStorage = saved;
  }
  // Uzum has no link to send.
  assert.doesNotMatch(node(React.createElement(PayExtras, { locale: 'ru', pack: PACK, offers: offersOf(PACK), providers: ['uzum'], busy: false, termsUrl: null, onAsk: () => {} })), /ai-pay-ask/);
  // The same order and the same consent as the one-tap path: the same subscribe call; only the navigation differs.
  const pay = read('src/gpt-chat/account/AccountDialog.tsx').replace(/\r\n/g, '\n');
  assert.match(pay, /onAsk=\{\(provider, sku\) => payWhenRead\(provider, true, sku\)\}/);
  const body = pay.slice(pay.indexOf('const pay = (provider'), pay.indexOf("// Close the account's own invoice"));
  assert.equal(body.split('post("/api/gpt/subscribe"').length, 2, 'one subscribe call for both paths');
  assert.match(body, /acceptTerms: true,\s*termsVersion: data\.termsVersion,/);
  const ask = body.slice(body.indexOf('if (ask) {'), body.indexOf('started();'));
  assert.doesNotMatch(ask, /location\.|started\(|trackMetaCheckout|checkout_redirect/, 'asking someone else navigates nowhere and starts no checkout of this browser');
  assert.match(ask, /memoryRef\.current\.shared = \{ provider, url, at: Date\.now\(\), id: attemptId, sku, priceUzs: offer\.priceUzs \};/);
  // The existing watch and polling cover it: the same checkout.start, so the page asks the account on its schedule, on every focus and on every load.
  assert.match(ask, /checkout\.start\(\{ provider, flow: "status", at: Date\.now\(\), attemptId, before: null \}\);/);
});

test('P4: the link screen: Telegram share with the encoded link and one line, copy, the sentence that the pack turns on in THIS browser, the order lifetime', () => {
  const url = 'https://my.click.uz/services/pay/?service_id=1&merchant_id=2&amount=20000.00&transaction_param=' + ORDER + '&return_url=https%3A%2F%2Fgptbot.uz%2Fru%2Fgpt-chat%2F%3Fpay%3Dreturn';
  assert.equal(ORDER_LIFETIME_MS, PAYMENT_TTL_MS, 'the lifetime the page states is the lifetime billing-config.ts gives an order');
  assert.equal(ORDER_LIFETIME_MS, 12 * 3_600_000);
  const share = (locale: Locale, over: Record<string, unknown> = {}) =>
    node(React.createElement(PayShare, {
      locale, provider: 'click', url, at: Date.now() - 60_000, orderState: 'pending', priceUzs: 20000, busy: false,
      onCheck: () => {}, onNew: () => {}, onPayMyself: () => {}, onBack: () => {}, ...over,
    }));
  for (const locale of LOCALES) {
    const s = TEXT[locale];
    const page = share(locale);
    const tg = /href="(https:\/\/t\.me\/share\/url\?[^"]+)"/.exec(page)?.[1];
    assert.ok(tg, `${locale}: a Telegram share link`);
    const parsed = new URL(tg.replace(/&amp;/g, '&'));
    assert.equal(parsed.origin + parsed.pathname, 'https://t.me/share/url');
    assert.equal(parsed.searchParams.get('url'), url, 'the link is encoded whole');
    assert.equal(parsed.searchParams.get('text'), s.shareText('20 000'), 'one line');
    assert.doesNotMatch(parsed.searchParams.get('text') ?? '', /\n/);
    assert.ok(has(page, s.tg) && has(page, s.copy) && has(page, s.here) && has(page, s.life));
    assert.match(page, /target="_blank" rel="noopener noreferrer"/);
    assert.ok(page.includes(`value="${html(url)}"`), 'the link in a field to select by hand');
    assert.ok(has(page, s.payMyself) && has(page, s.back));
  }
  assert.match(TEXT.ru.here, /ЭТОМ браузере после оплаты.*сам/);
  assert.match(TEXT.uz.here, /SHU brauzerda yoqiladi.*o‘zi tekshiradi/);
  assert.match(TEXT.ru.life, /12 часов/);
  assert.match(TEXT.uz.life, /12 soat/);
  // An expired or closed order is explained, not shown as a dead link.
  for (const locale of LOCALES) {
    const s = TEXT[locale];
    for (const over of [{ at: Date.now() - ORDER_LIFETIME_MS - 1 }, { orderState: 'cancelled' }, { orderState: 'refunded' }]) {
      const page = share(locale, over);
      assert.ok(has(page, s.expiredTitle) && has(page, s.expired) && has(page, s.renew), `${locale} ${JSON.stringify(over)}`);
      assert.ok(!page.includes('t.me/share') && !page.includes('value='), 'no dead link');
    }
    assert.ok(!has(share(locale, { orderState: 'prepared' }), s.expiredTitle), 'an order the provider holds is still open');
  }
});

test('P4: the return page that cannot see the order\'s holder tells the payer what is true, not that the pack comes in a few minutes', async () => {
  for (const locale of LOCALES) {
    const s = TEXT[locale];
    const copy = accountStrings(locale);
    // Back from the provider in a browser that never made the order: nothing stored (a synthetic watch), the account has no order.
    const watch = watchOf({ provider: null, attemptId: null });
    const page = await window(locale, member({ payment: null }), { watch });
    assert.ok(has(page, s.holderTitle) && has(page, s.holder), locale);
    assert.match(page, /data-result="holderless"/);
    assert.ok(!has(page, copy.payPendingLong), 'the false promise is gone');
    assert.ok(!has(page, copy.payCheckingNote) && !page.includes('gpt-pay-checking'));
    assert.ok(has(page, copy.payBackToChat) && page.includes('data-testid="ai-pack-support"'));
    // While the account is still being read, nothing is claimed.
    const loading = await window(locale, member({ payment: null }), { watch, loading: true });
    assert.ok(!has(loading, s.holder), `${locale}: no verdict before the account answered`);
    // This browser's own order: the usual screens (checking, then paid).
    for (const payment of [{ id: ORDER, state: 'prepared', provider: 'click' as const }]) {
      const own = await window(locale, member({ payment }), { watch });
      assert.ok(!has(own, s.holder), `${locale}: the order's holder is not told it cannot see its order`);
      assert.match(own, /data-result="checking"/);
    }
    // A stored watch with an order id is this browser's own too, even before the account lists it.
    assert.ok(!has(await window(locale, member({ payment: null }), { watch: watchOf() }), s.holder));
  }
  assert.match(TEXT.ru.holder, /засчитывается, когда её подтверждает платёжная система.*в том браузере, где оплату запросили/);
  assert.match(TEXT.uz.holder, /tasdiqlaganda hisobga olinadi.*to‘lov so‘ralgan brauzerda yoqiladi/);
  assert.doesNotMatch(TEXT.ru.holder + TEXT.uz.holder, /несколько минут|bir necha daqiqa/);
  // The same screen, standalone, with the children the window gives it.
  assert.ok(has(node(React.createElement(PayHolderless, { locale: 'ru' }, React.createElement('i', null, 'x'))), TEXT.ru.holder));
});

// ------------------------------------------------------------------ P5

test('P5: «Оплата не завершена»: one compact card with three ways on; continue only when the provider is known; ask only for a link provider', () => {
  const card = (locale: Locale, over: Record<string, unknown> = {}) =>
    node(React.createElement(PayUnpaid, {
      heading: false, orderId: ORDER, locale, apiBase: '', provider: 'click', since: Date.now(), closed: false, busy: false,
      onContinue: () => {}, onOther: () => {}, onAsk: () => {}, ...over,
    }));
  for (const locale of LOCALES) {
    const s = TEXT[locale];
    const open = card(locale);
    assert.ok(has(open, s.unpaidTitle) && has(open, s.unpaidOpen) && has(open, `${s.cont} · Click`) && has(open, s.other) && has(open, s.ask), locale);
    assert.equal((open.match(/gpt-primary/g) ?? []).length, 1, 'exactly one primary button');
    assert.equal([...open.matchAll(/<button/g)].length, 4, 'the primary, the dismiss ×, and two small text links; the Telegram link is the third link');
    assert.ok(open.includes('gpt-pay-unpaid-more'), 'the other actions are small text links in one row');
    assert.ok(open.includes('gpt-pay-unpaid-close') && has(open, s.dismiss), 'the card can be dismissed');
    assert.equal(orderRef(ORDER), 'AAAAAA');
    assert.ok(has(open, s.invoice('AAAAAA')) && open.includes('data-testid="ai-pay-ref"'), 'the reference is on the card as text');
    const link = (page: string) => new URL(/href="(https:\/\/t\.me\/[^"]+)"/.exec(page)![1].replace(/&amp;/g, '&'));
    assert.equal(link(open).origin + link(open).pathname, STUDIO_TELEGRAM_URL);
    assert.equal(link(open).searchParams.get('text'), s.helpText('AAAAAA'));
    assert.ok(has(open, s.writeTg));
    const noRef = card(locale, { orderId: null });
    assert.ok(!noRef.includes('ai-pay-ref') && has(noRef, s.writeTg));
    assert.equal(link(noRef).searchParams.get('text'), s.helpText(''), 'without a reference the text carries no number');
    assert.doesNotMatch(s.helpText('AAAAAA'), /pay_|[0-9a-f]{12}/);
    const closed = card(locale, { closed: true });
    assert.ok(has(closed, s.unpaidClosed) && !has(closed, s.unpaidOpen));
    // The provider is unknown (storage blocked, no order): no continue, no link to make; another way remains.
    const unknown = card(locale, { provider: null, onAsk: null });
    assert.ok(!has(unknown, s.cont) && !has(unknown, s.ask) && has(unknown, s.other));
    assert.ok(has(card(locale, { heading: true }), s.unpaidTitle) && card(locale, { heading: true }).includes('data-slot="dialog-title"'));
  }
  const source = read('src/gpt-chat/account/CheckoutReturn.tsx').replace(/\r\n/g, '\n');
  // A reopened chat with a watched order the provider never touched, and a return that waited out the first moments: the card replaces the wait.
  assert.match(source, /if \(open && payment\?\.state === "pending" && reads > 0 && now - opened >= UNPAID_AFTER_MS\)\s*return card\(false, true\);/);
  assert.match(source, /const UNPAID_AFTER_MS = 5_000;/);
  // An order the provider holds (prepared) is still just checked: never «not completed».
  assert.doesNotMatch(source, /payment\?\.state === "prepared"[^;]*card\(/);
  // Continue = the same pay() as the pack window's own resume (the open order's link again, or a new order when it closed).
  assert.match(source, /onContinue=\{\(\) => \{ if \(provider\) onPay\(provider\); \}\}/);
  assert.match(source, /onAsk=\{provider === "click" \|\| provider === "payme" \? \(\) => onPay\(provider, true\) : null\}/);
});

test('P5: the card counts itself once (checkout_return_unpaid with the outcome), and says nothing about money that may have moved', () => {
  const unpaid = read('src/gpt-chat/parts/pay-screens.tsx');
  assert.match(unpaid, /payEvent\(apiBase, 'checkout_return_unpaid', provider, since, closed \? 'cancelled' : 'none'\);/);
  assert.match(unpaid, /if \(counted\.current\) return;/);
  for (const locale of LOCALES) assert.doesNotMatch(TEXT[locale].unpaidOpen + TEXT[locale].unpaidClosed, /деньги|pul/i);
});

// ------------------------------------------------------------------ the copy

test('the copy of the new screens: o‘ and g‘ with U+2018, the tutuq with U+2019, no ASCII apostrophe, no exclamation, no ChatGPT, one claim per line', () => {
  const all = (value: unknown): string[] => typeof value === 'string' ? [value]
    : typeof value === 'function' ? [(value as (...a: unknown[]) => unknown)('Click', 67)].flatMap(all)
      : value && typeof value === 'object' ? Object.values(value).flatMap(all) : [];
  for (const line of all(TEXT.uz)) assert.doesNotMatch(line, /['`]/, line);
  for (const locale of LOCALES) for (const line of all(TEXT[locale])) assert.doesNotMatch(line, /!|ChatGPT/, line);
  assert.deepEqual(Object.keys(TEXT.ru).sort(), Object.keys(TEXT.uz).sort());
  assert.match(TEXT.uz.askFor('Click') + TEXT.uz.here + TEXT.uz.shareText('20 000'), /o‘|ma’lumot|o‘zi/);
  // The numbers: no price, answer count or hour figure but the order's own twelve hours (everything else comes from the pack).
  for (const locale of LOCALES) assert.doesNotMatch(Object.values(TEXT[locale]).filter((v) => typeof v === 'string').join(' '), /20 ?000|300|\b67\b/);
  assert.ok(Object.keys(ABORT_REASONS).length > 0);
});

test('the survey: «Нет карты» offers «Попросить оплатить», which opens the pack window with the ask line open', () => {
  const copy = read('src/gpt-chat/trial-copy.ts');
  assert.match(copy, /askPay: 'Попросить оплатить'/);
  assert.match(copy, /askPay: 'To‘lovni boshqadan so‘rash'/);
  const conversion = read('src/gpt-chat/parts/chat-conversion.tsx');
  assert.match(conversion, /sessionStorage\.setItem\('gptchat_ask', '1'\)/);
  assert.match(conversion, /reason === 'no_card'/);
  assert.equal(ASK_KEY, 'gptchat_ask');
});

// ------------------------------------------------------------------ no dead ends (review of 2026-11-17)

test('the window never stays on «Открываем…»: a page still here twelve seconds after the redirect, or in view again, goes back to the wait', () => {
  const dialog = read('src/gpt-chat/account/AccountDialog.tsx').replace(/\r\n/g, '\n');
  assert.match(dialog, /const STAYED_MS = 12_000;/);
  // Only a page the browser was really sent away from, and only while it is in view.
  assert.match(dialog, /const stay = \(\) => \{\s*if \(!redirecting\.current \|\| document\.visibilityState === "hidden"\) return;\s*redirecting\.current = false;\s*setLeaving\(null\);\s*\};/);
  assert.match(dialog, /if \(redirecting\.current && \(waited \+= 1_000\) >= STAYED_MS\) stay\(\);/);
  assert.match(dialog, /document\.addEventListener\("visibilitychange", stay\);/);
  assert.match(dialog, /window\.clearInterval\(timer\);\s*document\.removeEventListener\("visibilitychange", stay\);/);
  // The wait that takes its place has the order's watch: checkout.start comes before the browser is sent away.
  assert.ok(dialog.indexOf('checkout.start({ provider, flow: "redirect"') < dialog.indexOf('location.assign(url)'));
});

test('a tap while the account is being read waits for the read; it pays only on the same account, order and offer, and is dropped otherwise', () => {
  const dialog = read('src/gpt-chat/account/AccountDialog.tsx').replace(/\r\n/g, '\n');
  // What a tap was made on: nothing but the account view's own fields.
  assert.match(dialog, /function tapKey\(view: AccountView \| null\): string \| null \{\s*return view && JSON\.stringify\(\[\s*view\.user\?\.storageKey \?\? null, view\.payment\?\.id \?\? null, view\.payment\?\.state \?\? null,\s*view\.mode, view\.termsVersion, view\.pack\?\.priceUzs \?\? null, view\.pack\?\.messageLimit \?\? null,\s*\]\);\s*\}/);
  assert.match(dialog, /const payWhenRead = \(provider: PaymentProvider, ask = false, sku: PackSku = "month"\) => \{\s*if \(!loading \|\| error \|\| !data\) return void pay\(provider, ask, sku\);\s*if \(!ask\) setLeaving\(provider\);\s*setQueued\(\{ provider, ask, sku, seen: tapKey\(data\) \}\);\s*\};/);
  assert.match(dialog, /if \(!queued \|\| loading\) return;\s*setQueued\(null\);\s*if \(memoryRef\.current\.inFlight \|\| error \|\| queued\.seen !== tapKey\(data\)\) \{\s*setLeaving\(null\);\s*return;\s*\}\s*void pay\(queued\.provider, queued\.ask, queued\.sku\);/);
  // pay() itself still starts only when no read is in flight: the queue is the only way past a read.
  assert.match(dialog, /const checkoutReady = startable && !loading;\s*const resumeReady = resumable && !loading;/);
  assert.match(dialog, /const resume = resumeReady && data\?\.payment\?\.provider === provider && openSku === sku;/);
  assert.match(dialog, /const other = resumeReady && openSku !== sku;/);
  assert.match(dialog, /if \(\(!checkoutReady && !resume && !other\) \|\| !data \|\| !offer \|\| !offeredProviders\(data\)\.includes\(provider\)\s*\|\| \(sku === "once" && provider === "uzum"\)/);
  // Every button that pays goes through it; the limit card's one tap keeps its own rule (blocked intents are consumed).
  const taps = [...dialog.matchAll(/void pay\(/g)].length;
  assert.equal(taps, 4, 'pay() is called by payWhenRead (now, or after the read) and by the one-tap intent (the monthly pack, or the 3-day pack by name) only');
  assert.match(dialog, /if \(autoPay\.sku === "once"\) \{\s*void pay\(autoPay\.provider, false, "once"\);\s*return;\s*\}/);
  assert.match(dialog, /void pay\(autoPay\.provider\);/);
  for (const use of [
    'onRetry={() => payWhenRead(stall.provider, stall.ask, stall.sku)}', 'payWhenRead(shared.provider, true, shared.sku)', 'payWhenRead(shared.provider, false, shared.sku)',
    'onPay={(provider, ask) => payWhenRead(provider, ask, data?.payment?.sku ?? "month")}', 'onClick={() => payWhenRead(provider)}',
    'onAsk={(provider, sku) => payWhenRead(provider, true, sku)}', 'payWhenRead(openPayment.provider, false, openPayment.sku ?? "month")',
    'onPay={(provider, sku) => payWhenRead(provider, false, sku)}', 'payWhenRead(unpaidWith, false, "once")',
  ]) assert.ok(dialog.includes(use), use);
  // The buttons stay live through a read (no blink every three seconds); a first read, with no view yet, still holds them.
  assert.match(dialog, /disabled=\{busy \|\| !!queued \|\| !startable\}/);
  assert.match(dialog, /disabled=\{busy \|\| !!queued \|\| !resumable\}/);
});

test('the pay buttons: held until the account answered once, live through a later read', async () => {
  const strip = (page: string) => [...page.matchAll(/<button[^>]*data-provider="(click|payme)"[^>]*>/g)].filter((tag) => tag[0].includes('gpt-primary'));
  for (const locale of LOCALES) {
    // No view yet (the first read): nothing to pay with.
    assert.equal(strip(await window(locale, null, { loading: true })).length, 0, locale);
    // A view and a read in flight: the buttons are there and not disabled.
    const reading = strip(await window(locale, guest({ guestCheckout: true }), { loading: true }));
    assert.equal(reading.length, 2, locale);
    for (const tag of reading) assert.doesNotMatch(tag[0], /disabled/, tag[0]);
  }
});

test('a link made for someone else is watched while the page lives and never stored: a reload does not open the window', () => {
  const dialog = read('src/gpt-chat/account/AccountDialog.tsx').replace(/\r\n/g, '\n');
  assert.match(dialog, /if \(ask\) \{\s*memoryRef\.current\.shared = \{ provider, url, at: Date\.now\(\), id: attemptId, sku, priceUzs: offer\.priceUzs \};\s*setChoosing\(false\);\s*checkout\.start\(\{ provider, flow: "status", at: Date\.now\(\), attemptId, before: null \}\);(?:\s*\/\/[^\n]*)*\s*try \{ localStorage\.removeItem\("gptchat_checkout"\); \} catch \{[^}]*\}\s*return;\s*\}/);
  // The key is checkout.ts's own (the window removes it itself: an export would weigh on the start bundle).
  assert.match(read('src/gpt-chat/checkout.ts'), /const CHECKOUT_KEY = 'gptchat_checkout';/);
  assert.doesNotMatch(dialog, /\bsaveCheckout\b/);
  // The payer's own trip is stored, as before: that is what the way back reads.
  const redirect = dialog.slice(dialog.indexOf('redirecting.current = true;'), dialog.indexOf('location.assign(url)'));
  assert.doesNotMatch(redirect, /removeItem/);
});

test('the return screen says «no payment» only from a read that ended while it was open, and does not blink with each read', () => {
  const screen = read('src/gpt-chat/account/CheckoutReturn.tsx').replace(/\r\n/g, '\n');
  assert.match(screen, /const \[answered\] = useState\(\(\) => !loading && !!data\);/);
  assert.match(screen, /if \(reading\.current && !loading && !error\) setReads\(\(count\) => count \+ 1\);\s*reading\.current = loading;/);
  // A browser with no order at all: no verdict that flips with `loading`.
  assert.match(screen, /if \(!watch\.attemptId && !watch\.provider && !!data && !payment && \(answered \|\| reads > 0\)\)/);
  assert.doesNotMatch(screen, /!!data && !loading && !payment/);
  // «Оплата не завершена» needs a read made here: a page out of the browser's cache remembers «pending».
  assert.match(screen, /if \(open && payment\?\.state === "pending" && reads > 0 && now - opened >= UNPAID_AFTER_MS\)/);
});

test('roadmap №2: the seller as a provider may name it, and the question typed at the wall, in the pay step', () => {
  const entity = JSON.parse(read('content/global/legal-entity.json')) as { shortName: Record<Locale, string> };
  const offers = offersOf({ ...PACK, more: [{ sku: 'once', priceUzs: 5000, messageLimit: 30, dailyLimit: 50, hours: 72 }] } as PackTerms);
  for (const locale of LOCALES) {
    const s = TEXT[locale];
    // «may be named»: only Payme's receipt is confirmed to show the legal name.
    assert.equal(s.seller(entity.shortName[locale]), locale === 'ru'
      ? 'Продавцом там может быть указано ООО «FREEDOM IS HEAVEN» — это компания GPTBot.uz.'
      : 'U yerda sotuvchi «FREEDOM IS HEAVEN» MChJ deb ko‘rsatilishi mumkin — bu GPTBot.uz kompaniyasi.');
    for (const packs of [offers, offers.slice(0, 1)]) {
      const page = node(React.createElement(PayExtras, { locale, pack: PACK, offers: packs, providers: ['click', 'payme'], busy: false, termsUrl: 'https://gptbot.uz/ru/oferta/', onAsk: () => {} }));
      assert.ok(has(page, s.seller(entity.shortName[locale])), `${locale}: the seller line`);
      assert.match(page, /data-testid="ai-pay-seller"/);
      // On the server there is no storage: no question line, and nothing throws.
      assert.doesNotMatch(page, /ai-pay-question/);
    }
    // The line says what is true: the question is kept for an hour, and sending it is the buyer's tap.
    assert.equal(s.saved + '«…».' + s.savedThen, locale === 'ru'
      ? 'Ваш вопрос сохранён на час: «…». После оплаты вернитесь в чат и отправьте его.'
      : 'Savolingiz bir soatga saqlandi: «…». To‘lovdan keyin chatga qaytib, uni yuboring.');
    assert.doesNotMatch(s.saved + s.savedThen, /сам|автомат|o‘zi keladi|avtomatik/i, 'no promise of an answer by itself');
  }
  const source = read('src/gpt-chat/parts/pay-screens.tsx');
  // The requisites stay out of the bundle: the short name alone, by a named JSON import.
  assert.match(source, /import \{ shortName \} from '\.\.\/\.\.\/\.\.\/content\/global\/legal-entity\.json';/);
  // The question is read by the keys storage.ts and limit-state.ts write, for the draft's own hour, at the two walls whose send button opens the window.
  assert.match(read('src/gpt-chat/storage.ts'), /const DRAFT_KEY = "gptchat_draft";/);
  assert.match(read('src/gpt-chat/storage.ts'), /export const DRAFT_TTL_MS = 60 \* 60_000;/);
  assert.match(source, /localStorage\.getItem\('gptchat_draft'\)/);
  assert.match(source, /Date\.now\(\) - draft\.savedAt < 3_600_000/);
  assert.match(source, /if \(limit\?\.reason !== 'trial' && limit\?\.reason !== 'monthly'\) return '';/);
  // It is drawn above the rows of two packs and above the lines of one, never twice, cut at ninety characters, and no event carries it.
  assert.match(source, /<div className="gpt-pay-packs" data-testid="ai-pay-packs">\s*<WallQuestion locale=\{locale\} \/>/);
  assert.match(source, /\{!two && <WallQuestion locale=\{locale\} \/>\}/);
  assert.match(source, /question\.length > 90 \? `\$\{question\.slice\(0, 90\)\}…` : question/);
  const wall = source.slice(source.indexOf('function wallQuestion'), source.indexOf('// ---------------------------------------------------------------- P6 + P4 entry'));
  assert.doesNotMatch(wall, /recordUiEvent|payEvent|fetch\(|track\(/, 'the question goes nowhere');
  // The window is masked in the session recording.
  assert.match(read('src/gpt-chat/components/AiAccountPanel.tsx'), /className="gpt-account-dialog ym-hide-content"/);
});

test('roadmap №2: «Сохранить через Telegram» on a guest’s pack is a button, and «Вернуться в чат» stays the main one', () => {
  const css = read('src/gpt-chat/account/account.css');
  assert.match(css, /\[data-testid="ai-pack-save"\] button \{[^}]*min-height: 44px;[^}]*border: 1px solid var\(--accent-line\);[^}]*text-decoration: none;/);
  const screen = read('src/gpt-chat/account/CheckoutReturn.tsx');
  // After a payment: the way back first, then the save block.
  assert.ok(screen.indexOf('{back(true)}') < screen.indexOf('data-testid="ai-pack-save"'));
  assert.match(screen, /<div className="gpt-panel-note" data-testid="ai-pack-save">\s*<p>\{copy\.saveLine\}<\/p>\s*<button type="button" className="gpt-text-button" onClick=\{onSave\}>\{copy\.saveButton\}<\/button>/);
  // The line promises what signing in does, and no reminders (those need consent and a policy change).
  for (const locale of LOCALES) assert.doesNotMatch(accountStrings(locale).saveLine, /напомн|eslat/i);
});
