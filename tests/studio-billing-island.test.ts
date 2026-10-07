// The paid stage in the studio island (apps/studio/src/billing/**, main.tsx,
// api.ts; BUILD-PLAN 07.10.2026 stream B; DECISIONS §1(д), §4, §11, §12,
// §13 п. 3): the neutral «Tariflar» section, the checkout window with the
// offer checkbox and its parents' line, the order of calls of a checkout,
// «Mening paketim», the page after payment, the tariffs page's hydration
// and how main.tsx mounts all of it without growing the first load.
//
// No browser: fetch, Turnstile and the session are fakes; React renders to
// strings with the studio's own react-dom/server.
// Run: node --import tsx --test tests/studio-billing-island.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  createStudioApi,
  isPaymentPage,
  type CheckoutBody,
  type Result,
  type StudioApi,
  type StudioMe,
  type StudioPlanOffer,
  type StudioPublicConfig,
} from '../apps/studio/src/api';
import { BILLING_TEXTS, billingMessage, formatSum, tashkentDateTime } from '../apps/studio/src/billing/texts';
import { CHAT_PAGE, PLAN_ORDER, TariffList, Tariffs } from '../apps/studio/src/billing/Tariffs';
import { Checkout, newOrderRequestId } from '../apps/studio/src/billing/Checkout';
import { PackPanel } from '../apps/studio/src/billing/MyPack';
import { returnState, withoutPayReturn } from '../apps/studio/src/billing/PayReturn';
import { sellingProviders, startCheckout, type CheckoutAction, type CheckoutDeps } from '../apps/studio/src/billing/flow';
import { PACK_EVENT, PACK_HINT_KEY, announcePack, onPack, packRemembered, rememberPack, type HintTarget } from '../apps/studio/src/billing/hint';
import { TARIFFS_TOOL, decodeTariffsRoot, encodeTariffsRoot } from '../apps/studio/src/billing/tariffs-root';
import { renderTariffs } from '../apps/studio/src/billing/static';
import { REQUEST_ID } from '../functions/lib/studio/ledger';
import { STUDIO_ERRORS } from '../functions/lib/studio/http';
import { publicPlans } from '../functions/lib/studio/checkout';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'apps/studio/src');
// The studio's own React (apps/studio/node_modules), the one its components use.
const studioRequire = createRequire(path.join(ROOT, 'apps/studio/package.json'));
const { createElement } = studioRequire('react') as typeof import('react');
const { renderToStaticMarkup, renderToString } = studioRequire('react-dom/server') as typeof import('react-dom/server');
const read = (file: string) => fs.readFileSync(path.join(SRC, file), 'utf8');

const EDITION = 'ai-paket-2026-10-v3';
const KUNLIK: StudioPlanOffer = { id: 'kunlik', itemId: 'studio_kunlik', amountTiyin: 590_000, amountUzs: 5_900, duration: { hours: 24 }, presentationFull: 1, photoTask: 5, regenPerUnit: 1 };
const OYLIK: StudioPlanOffer = { id: 'oylik', itemId: 'studio_oylik', amountTiyin: 3_990_000, amountUzs: 39_900, duration: { calendarMonths: 1 }, presentationFull: 10, photoTask: 40, regenPerUnit: 1 };
const DECKS_ONLY: StudioPlanOffer[] = [{ ...KUNLIK, photoTask: 0 }, { ...OYLIK, photoTask: 0 }];

function config(overrides: Partial<StudioPublicConfig> = {}): StudioPublicConfig {
  return {
    tools: { freeDeck: true, fullDeck: true, photo: false },
    payments: { mode: 'live', providers: ['payme'] },
    plans: [KUNLIK, OYLIK],
    free: { presentation: 1, photo: 2, resetsAt: '05:00 Asia/Tashkent' },
    shapes: {
      free: { minSlides: 4, maxSlides: 6, images: 2, notes: false, palettes: 1 },
      full: { minSlides: 6, maxSlides: 15, images: 8, notes: true, palettes: 3 },
    },
    turnstileSiteKey: '0x4AAAAAAAstudioTestKey',
    termsVersion: EDITION,
    terms: { ru: 'https://gptbot.uz/ru/oferta/', uz: 'https://gptbot.uz/uz/ommaviy-oferta/' },
    aiLabel: true,
    ...overrides,
  };
}

/** Sums keep their thousands together on a narrow screen: a no-break space (texts.ts formatSum). */
const plain = (text: string) => text.replaceAll(' ', ' ');

const ok = <T>(data: T): Result<T> => ({ ok: true, status: 200, data });
const failure = (code: string, extra: Record<string, unknown> = {}): Result<never> => ({ ok: false, status: 400, code, ...extra });

// ── Texts ───────────────────────────────────────────────────────────────────

/** Every line the billing texts can produce, for both kinds of tariff. */
function allLines(locale: 'uz' | 'ru'): string[] {
  const t = BILLING_TEXTS[locale];
  const lines: string[] = [];
  for (const value of Object.values(t)) {
    if (typeof value === 'string') lines.push(value);
    else if (typeof value === 'object') lines.push(...Object.values(value as Record<string, string>));
  }
  for (const plan of [KUNLIK, OYLIK, ...DECKS_ONLY]) lines.push(t.plan(plan.id, plan), t.summary(plan.id, plan));
  lines.push(t.payWith(['payme']), t.payWith(['payme', 'click']), t.left(3, 7, true), t.left(3, 0, false), t.until('14:30, 14.10.2026'), t.testOrder('stu_x'));
  return lines;
}

test('texts: neutral by law: no call to buy, no hurry, nothing that asks a child to ask a parent', () => {
  const pushy = /sotib ol|hoziroq|shoshiling|tezroq|chegirma|aksiya|faqat bugun chegirma|ota-onangizdan so|ota-onangga|so‘rang|купи|успей|скидк|акци|осталось \d+ мест|попроси|родителей попрос|таймер|последний шанс/i;
  for (const locale of ['uz', 'ru'] as const) for (const line of allLines(locale)) assert.doesNotMatch(line, pushy, `${locale}: ${line}`);
  assert.equal(BILLING_TEXTS.uz.heading, 'Tariflar');
});

test('texts: the checkbox with the parents\' line, the refund line and «Obunasiz…» as decided on 07.10', () => {
  assert.equal(BILLING_TEXTS.uz.consent, 'Ommaviy oferta shartlariga roziman. 18 yoshga to‘lmagan bo‘lsam — ota-onam rozi.');
  assert.equal(BILLING_TEXTS.ru.consent, 'Принимаю условия публичной оферты. Если мне нет 18 лет — родители согласны.');
  assert.equal(BILLING_TEXTS.uz.refund, 'Ishlatilmagan birliklar uchun pulni to‘lovdan keyin 14 kun ichida so‘rov bo‘yicha qaytaramiz.');
  assert.equal(BILLING_TEXTS.ru.refund, 'За неиспользованные единицы вернём деньги по заявлению в течение 14 дней после оплаты.');
  assert.equal(`${BILLING_TEXTS.uz.noSubscription} ${BILLING_TEXTS.uz.payWith(['payme'])}`, 'Obunasiz: pul avtomatik yechilmaydi. To‘lov: Payme.');
  assert.equal(BILLING_TEXTS.uz.paused, 'To‘lov vaqtincha to‘xtatilgan.');
  assert.match(BILLING_TEXTS.uz.keepNumber, /^To‘lov raqamini saqlang/);
});

test('texts: the cards follow the plan the server sends; a tariff without photo tasks never mentions photos', () => {
  const uz = BILLING_TEXTS.uz;
  assert.equal(plain(uz.plan('oylik', OYLIK)), '1 oy: 10 ta taqdimot, 40 ta rasmdagi masala — 39 900 so‘m');
  assert.equal(plain(uz.plan('kunlik', KUNLIK)), 'Faqat bugun kerakmi? 24 soat: 1 ta to‘liq taqdimot + 5 ta rasmdagi masala — 5 900 so‘m');
  assert.equal(plain(uz.plan('oylik', DECKS_ONLY[1])), '1 oy: 10 ta to‘liq taqdimot — 39 900 so‘m');
  assert.equal(plain(uz.plan('kunlik', DECKS_ONLY[0])), 'Faqat bugun kerakmi? 24 soat: 1 ta to‘liq taqdimot — 5 900 so‘m');
  for (const locale of ['uz', 'ru'] as const)
    for (const plan of DECKS_ONLY) assert.doesNotMatch(BILLING_TEXTS[locale].plan(plan.id, plan), /rasm|фото/i);
  assert.equal(formatSum(39_900), '39 900');
  assert.equal(formatSum(5_900), '5 900');
  assert.equal(formatSum(900), '900');
  assert.equal(tashkentDateTime('2026-10-14T09:30:00.000Z'), '14:30, 14.10.2026');
  assert.equal(tashkentDateTime('not a date'), '');
});

test('texts: every server code the checkout maps is a real one; anything else reads as busy', () => {
  for (const code of ['terms_changed', 'order_open', 'checkout_unavailable', 'provider_unavailable', 'rate_limited', 'turnstile_failed', 'turnstile_required', 'try_later', 'not_found'])
    assert.ok(code in STUDIO_ERRORS, code);
  assert.equal(billingMessage('provider_unavailable'), 'paused');
  assert.equal(billingMessage('checkout_unavailable'), 'paused');
  assert.equal(billingMessage('network'), 'connection');
  assert.equal(billingMessage('studio_not_configured'), 'busy');
  assert.equal(billingMessage('anything'), 'busy');
});

// ── The «Tariflar» section ──────────────────────────────────────────────────

const markup = (element: Parameters<typeof renderToStaticMarkup>[0]) => plain(renderToStaticMarkup(element));

test('section: Oylik first, Kunlik below, the free day, the chat pack «faqat chat uchun», refund, offer; nothing chosen in advance', () => {
  assert.deepEqual(PLAN_ORDER, ['oylik', 'kunlik']);
  const html = markup(createElement(TariffList, { locale: 'uz', plans: [KUNLIK, OYLIK], providers: ['payme'], termsUrl: 'https://gptbot.uz/uz/ommaviy-oferta/', onChoose: () => {}, context: 'after_result' }));
  assert.ok(html.indexOf('data-studio-plan="oylik"') < html.indexOf('data-studio-plan="kunlik"'));
  assert.match(html, /<h2[^>]*>Tariflar<\/h2>/);
  assert.ok(html.includes(BILLING_TEXTS.uz.free));
  assert.ok(html.includes('Faqat chat uchun'));
  assert.ok(html.includes(`href="${CHAT_PAGE.uz}"`));
  assert.ok(html.includes('Obunasiz: pul avtomatik yechilmaydi. To‘lov: Payme.'));
  assert.ok(html.includes(BILLING_TEXTS.uz.refund));
  assert.ok(html.includes('href="https://gptbot.uz/uz/ommaviy-oferta/"'));
  assert.doesNotMatch(html, /aria-pressed="true"|checked/);
  assert.equal((html.match(/<button/g) ?? []).length, 2);
});

test('section: sales off → the prices stay, the buttons go, «To‘lov vaqtincha to‘xtatilgan»; providers unknown yet → a neutral line', () => {
  const off = markup(createElement(TariffList, { locale: 'uz', plans: [KUNLIK, OYLIK], providers: [], termsUrl: null, onChoose: () => {}, context: 'limit' }));
  assert.ok(off.includes('39 900 so‘m'));
  assert.ok(off.includes(BILLING_TEXTS.uz.paused));
  assert.doesNotMatch(off, /<button/);
  const unknown = markup(createElement(TariffList, { locale: 'ru', plans: [KUNLIK, OYLIK], providers: null, termsUrl: null, onChoose: () => {}, context: 'page' }));
  assert.ok(unknown.includes(BILLING_TEXTS.ru.noSubscription));
  assert.ok(!unknown.includes(BILLING_TEXTS.ru.paused));
  assert.ok(!unknown.includes(BILLING_TEXTS.ru.payWith(['payme'])));
  assert.equal((unknown.match(/<button/g) ?? []).length, 2);
  // Without onChoose (a static list) there are no buttons at all.
  assert.doesNotMatch(markup(createElement(TariffList, { locale: 'uz', plans: [KUNLIK, OYLIK], providers: ['payme'], termsUrl: null, context: 'page' })), /<button/);
});

test('section: before /config arrives the live section shows no payment state (never «paused» by mistake)', () => {
  const html = markup(createElement(Tariffs, { locale: 'uz', context: 'after_result' }));
  assert.ok(!html.includes(BILLING_TEXTS.uz.paused));
  assert.ok(html.includes(BILLING_TEXTS.uz.noSubscription));
});

test('the tariffs page: the prerendered section is exactly the island\'s first render, from the root\'s data attributes', () => {
  const plans = publicPlans(EDITION);
  assert.deepEqual(plans, [KUNLIK, OYLIK]);
  assert.deepEqual(publicPlans('ai-paket-2026-10-v2'), []);
  const termsUrl = 'https://gptbot.uz/uz/ommaviy-oferta/';
  const attributes = encodeTariffsRoot(plans, termsUrl);
  assert.match(attributes, new RegExp(`^ data-tool="${TARIFFS_TOOL}" data-plans="[^"<>]*" data-terms="[^"<>]*"$`));
  // The browser reads the attributes back (dataset), as main.tsx does.
  const dataset = Object.fromEntries([...attributes.matchAll(/data-([a-z]+)="([^"]*)"/g)].map(([, key, value]) => [key, value.replaceAll('&quot;', '"').replaceAll('&amp;', '&')]));
  const decoded = decodeTariffsRoot(dataset);
  assert.deepEqual(decoded, { plans, termsUrl });
  const server = renderTariffs('uz', plans, termsUrl);
  const client = renderToString(createElement(Tariffs, { locale: 'uz', context: 'page', initialPlans: decoded.plans, initialTermsUrl: decoded.termsUrl }));
  assert.equal(server, client);
  assert.ok(plain(server).includes('39 900 so‘m'));
  assert.ok(!server.includes(BILLING_TEXTS.uz.paused));
  assert.equal((server.match(/<button/g) ?? []).length, 2);
  // Anything malformed in the attributes gives no plans and no link, never a crash.
  assert.deepEqual(decodeTariffsRoot({ plans: '{bad', terms: 'javascript:alert(1)' }), { plans: [], termsUrl: null });
  assert.deepEqual(decodeTariffsRoot({ plans: JSON.stringify([{ id: 'weekly' }]), terms: 'https://evil.example/' }), { plans: [], termsUrl: null });
});

// ── The checkout window ─────────────────────────────────────────────────────

test('checkout: what is bought, the offer checkbox unticked with the parents\' line and the offer link, refund, no subscription; hidden from Webvisor', () => {
  const html = markup(createElement(Checkout, { locale: 'uz', plan: OYLIK, config: config(), onClose: () => {} }));
  assert.ok(html.includes('Oylik — 39 900 so‘m, 1 oy (kalendar oy)'));
  assert.match(html, /<input[^>]*type="checkbox"[^>]*>/);
  assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
  assert.ok(html.includes(BILLING_TEXTS.uz.consent));
  assert.ok(html.includes('href="https://gptbot.uz/uz/ommaviy-oferta/"'));
  assert.ok(html.includes(BILLING_TEXTS.uz.refund));
  assert.ok(html.includes(BILLING_TEXTS.uz.noSubscription));
  assert.ok(html.includes('To‘lov: Payme.'));
  assert.match(html, /class="ym-hide-content[^"]*"/);
  assert.match(html, /<form class="ym-disable-submit[^"]*"/);
  // Two providers selling: a choice; none: the pause line and a disabled button.
  const two = markup(createElement(Checkout, { locale: 'ru', plan: KUNLIK, config: config({ payments: { mode: 'live', providers: ['payme', 'click'] } }), onClose: () => {} }));
  assert.equal((two.match(/type="radio"/g) ?? []).length, 2);
  const none = markup(createElement(Checkout, { locale: 'uz', plan: KUNLIK, config: config({ payments: { mode: null, providers: [] } }), onClose: () => {} }));
  assert.ok(none.includes(BILLING_TEXTS.uz.paused));
  assert.match(none, /<button type="submit"[^>]*disabled/);
});

test('checkout: an order request id is one the ledger accepts', () => {
  for (let i = 0; i < 20; i++) assert.match(newOrderRequestId(), REQUEST_ID);
});

// ── The order of calls ──────────────────────────────────────────────────────

interface Fakes {
  deps: CheckoutDeps;
  calls: string[];
  bodies: CheckoutBody[];
}

function fakes(options: { config?: Result<StudioPublicConfig>; me?: Result<StudioMe>; answers?: Array<Result<unknown>> } = {}): Fakes {
  const calls: string[] = [];
  const bodies: CheckoutBody[] = [];
  const answers = [...(options.answers ?? [ok({ mode: 'checkout', checkoutUrl: 'https://checkout.paycom.uz/abc', orderId: 'stu_0123456789abcdef0123456789abcdef', provider: 'payme' })])];
  const me = options.me ?? ok<StudioMe>({ identity: true, free: { presentation: { left: 1, limit: 1 }, photo: { left: 2, limit: 2 }, resetsAt: '05:00 Asia/Tashkent' }, account: { signedIn: true } });
  const deps: CheckoutDeps = {
    api: {
      checkout: async (body) => {
        calls.push('checkout');
        bodies.push(body);
        return (answers.shift() ?? failure('studio_busy')) as never;
      },
      identity: async () => {
        calls.push('identity');
        return ok({ ok: true as const });
      },
    },
    session: {
      config: async () => {
        calls.push('config');
        return options.config ?? ok(config());
      },
      me: async () => {
        calls.push('me');
        return me;
      },
      refreshMe: () => calls.push('refreshMe'),
    },
    token: async (action: CheckoutAction) => {
      calls.push(`token:${action}`);
      return { ok: true, token: `token-${action}` };
    },
    requestId: () => 'o_00000000000000000000000000000001',
    attribution: () => ({ attribution: { last: { gclid: 'abc', landing: '/uz/taqdimot-ai/', at: '2026-10-14T09:00:00.000Z' } }, ga: { clientId: '1.2' }, ym: {} }),
  };
  return { deps, calls, bodies };
}

const choice = { plan: 'oylik' as const, provider: null, locale: 'uz' as const, returnPath: '/uz/taqdimot-ai/' };

test('flow: a buyer with an account goes straight to the payment page: no Turnstile, the edition seen, the provider, the page to come back to', async () => {
  const { deps, calls, bodies } = fakes();
  const outcome = await startCheckout(choice, deps);
  assert.deepEqual(outcome, { kind: 'redirect', url: 'https://checkout.paycom.uz/abc', orderId: 'stu_0123456789abcdef0123456789abcdef' });
  assert.deepEqual(calls, ['config', 'me', 'checkout', 'refreshMe']);
  assert.deepEqual(bodies[0], {
    plan: 'oylik', requestId: 'o_00000000000000000000000000000001', locale: 'uz', acceptTerms: true, termsVersion: EDITION, provider: 'payme',
    returnPath: '/uz/taqdimot-ai/', attribution: { last: { gclid: 'abc', landing: '/uz/taqdimot-ai/', at: '2026-10-14T09:00:00.000Z' } }, ga: { clientId: '1.2' }, ym: {},
  });
});

test('flow: a new browser passes Turnstile for its identity, then for the checkout; the server makes the account after that', async () => {
  const { deps, calls, bodies } = fakes({ me: ok<StudioMe>({ identity: false, free: { presentation: { left: 1, limit: 1 }, photo: { left: 2, limit: 2 }, resetsAt: '' }, account: null }) });
  await startCheckout(choice, deps);
  assert.deepEqual(calls, ['config', 'me', 'token:studio_identity', 'identity', 'token:studio_checkout', 'checkout', 'refreshMe']);
  assert.equal(bodies[0].turnstileToken, 'token-studio_checkout');
  const known = fakes({ me: ok<StudioMe>({ identity: true, free: { presentation: { left: 1, limit: 1 }, photo: { left: 2, limit: 2 }, resetsAt: '' }, account: null }) });
  await startCheckout(choice, known.deps);
  assert.deepEqual(known.calls, ['config', 'me', 'token:studio_checkout', 'checkout', 'refreshMe']);
});

test('flow: a lost answer is sent again with the same request id; identity_required and turnstile_required get one more pass', async () => {
  const lost = fakes({ answers: [failure('network'), ok({ mode: 'status', orderId: 'stu_0123456789abcdef0123456789abcdef' })] });
  assert.deepEqual(await startCheckout(choice, lost.deps), { kind: 'status', orderId: 'stu_0123456789abcdef0123456789abcdef' });
  assert.equal(lost.bodies.length, 2);
  assert.equal(lost.bodies[0].requestId, lost.bodies[1].requestId);
  const cookieGone = fakes({ answers: [failure('identity_required'), ok({ mode: 'test', orderId: 'stu_0123456789abcdef0123456789abcdef', amount: 3_990_000, provider: 'payme' })] });
  assert.deepEqual(await startCheckout(choice, cookieGone.deps), { kind: 'test', orderId: 'stu_0123456789abcdef0123456789abcdef', amount: 3_990_000 });
  assert.deepEqual(cookieGone.calls, ['config', 'me', 'checkout', 'token:studio_identity', 'identity', 'token:studio_checkout', 'checkout', 'refreshMe']);
  assert.equal(cookieGone.bodies[0].requestId, cookieGone.bodies[1].requestId);
  const token = fakes({ answers: [failure('turnstile_required'), failure('turnstile_failed')] });
  assert.deepEqual(await startCheckout(choice, token.deps), { kind: 'error', code: 'turnstile_failed' });
  assert.equal(token.bodies.length, 2);
});

test('flow: another open order is offered to be closed; sales off asks nothing but /config', async () => {
  const open = fakes({ answers: [failure('order_open', { orderId: 'stu_ffffffffffffffffffffffffffffffff' })] });
  assert.deepEqual(await startCheckout(choice, open.deps), { kind: 'open', orderId: 'stu_ffffffffffffffffffffffffffffffff' });
  for (const off of [config({ payments: { mode: null, providers: [] } }), config({ payments: { mode: 'live', providers: [] } }), config({ plans: [] }), config({ termsVersion: null })]) {
    const run = fakes({ config: ok(off) });
    assert.deepEqual(await startCheckout(choice, run.deps), { kind: 'error', code: 'checkout_unavailable' });
    assert.deepEqual(run.calls, ['config']);
  }
  assert.deepEqual(sellingProviders(config({ payments: { mode: 'live', providers: ['payme', 'click'] } })), ['payme', 'click']);
  // A provider the person picked that does not sell: the first one that does.
  const picked = fakes();
  await startCheckout({ ...choice, provider: 'click' }, picked.deps);
  assert.equal(picked.bodies[0].provider, 'payme');
});

test('api: a payment page answer is followed only to Payme or Click; anything else is invalid_output', async () => {
  for (const [url, good] of [
    ['https://checkout.paycom.uz/bT0xMjM=', true],
    ['https://test.paycom.uz/bT0xMjM=', true],
    ['https://my.click.uz/services/pay/?service_id=1', true],
    ['https://evil.example/pay', false],
    ['http://checkout.paycom.uz/x', false],
    ['https://checkout.paycom.uz:8443/x', false],
    ['javascript:alert(1)', false],
  ] as const)
    assert.equal(isPaymentPage(url), good, url);
  const api: StudioApi = createStudioApi(async () =>
    Response.json({ ok: true, mode: 'checkout', checkoutUrl: 'https://evil.example/pay', orderId: 'stu_0123456789abcdef0123456789abcdef', provider: 'payme' }));
  const answer = await api.checkout({ plan: 'kunlik', requestId: 'o_x1234567', locale: 'uz', acceptTerms: true, termsVersion: EDITION });
  assert.deepEqual(answer, { ok: false, status: 200, code: 'invalid_output' });
  const cancelled: string[] = [];
  const cancelApi = createStudioApi(async (input, init) => {
    cancelled.push(`${init?.method} ${input} ${init?.body}`);
    return Response.json({ ok: true, orderId: 'stu_0123456789abcdef0123456789abcdef' });
  });
  assert.deepEqual(await cancelApi.cancelOrder('pay_x'), { ok: false, status: 0, code: 'invalid' });
  assert.equal((await cancelApi.cancelOrder('stu_0123456789abcdef0123456789abcdef')).ok, true);
  assert.deepEqual(cancelled, ['POST /api/studio/order/cancel {"orderId":"stu_0123456789abcdef0123456789abcdef"}']);
});

// ── «Mening paketim» and the page after payment ─────────────────────────────

const ME: StudioMe = {
  identity: true,
  free: { presentation: { left: 1, limit: 1 }, photo: { left: 2, limit: 2 }, resetsAt: '05:00 Asia/Tashkent' },
  account: { signedIn: true },
  entitlements: [{ id: 'stu_0123456789abcdef0123456789abcdef', orderId: 'stu_0123456789abcdef0123456789abcdef', plan: 'oylik', startsAt: '2026-10-14T09:30:00.000Z', endsAt: '2026-11-14T09:30:00.000Z', presentationsLeft: 7, presentationsLimit: 10, photosLeft: 0, photosLimit: 0, regenAvailable: [] }],
  latestOrder: { id: 'stu_0123456789abcdef0123456789abcdef', state: 'paid', plan: 'oylik', provider: 'payme', amountUzs: 39_900, createdAt: '2026-10-14T09:28:00.000Z', paidAt: '2026-10-14T09:30:00.000Z', paymentNumber: '6f00a1b2c3d4e5f6a7b8c9d0', cancellable: false },
  receipts: [{ orderId: 'stu_0123456789abcdef0123456789abcdef', kind: 'PERFORM', url: 'https://ofd.soliq.uz/check?t=1' }],
};

test('my pack: each running tariff with its end in Tashkent and what is left, the order and payment numbers to keep, the receipts', () => {
  const html = markup(createElement(PackPanel, { locale: 'uz', me: ME }));
  assert.ok(html.includes('Mening paketim'));
  assert.ok(html.includes('Oylik — 14:30, 14.11.2026 gacha'));
  assert.ok(html.includes('Qoldi: 7 ta taqdimot'));
  assert.ok(!html.includes('rasmdagi masala'));
  assert.ok(html.includes('stu_0123456789abcdef0123456789abcdef'));
  assert.ok(html.includes('6f00a1b2c3d4e5f6a7b8c9d0'));
  assert.ok(html.includes(BILLING_TEXTS.uz.keepNumber));
  assert.match(html, /<a[^>]*href="https:\/\/ofd\.soliq\.uz\/check\?t=1"[^>]*rel="noopener noreferrer"/);
  assert.match(html, /class="ym-hide-content/);
  assert.equal(markup(createElement(PackPanel, { locale: 'uz', me: { ...ME, account: null } })), '');
  const empty = markup(createElement(PackPanel, { locale: 'ru', me: { ...ME, entitlements: [], latestOrder: null, receipts: [] } }));
  assert.ok(empty.includes(BILLING_TEXTS.ru.myPackEmpty));
});

test('after payment: the newest order decides; the query leaves the address', () => {
  assert.equal(returnState(null, false), 'checking');
  assert.equal(returnState(null, true), 'none');
  assert.equal(returnState(ME, false), 'paid');
  const order = ME.latestOrder!;
  for (const [state, final, expected] of [['pending', false, 'checking'], ['prepared', true, 'pending'], ['cancelled', false, 'cancelled'], ['refunded', false, 'cancelled']] as const)
    assert.equal(returnState({ ...ME, latestOrder: { ...order, state } }, final), expected, state);
  assert.equal(withoutPayReturn('https://gptbot.uz/uz/taqdimot-ai/?pay=return&utm_source=x#top'), '/uz/taqdimot-ai/?utm_source=x#top');
  assert.equal(withoutPayReturn('https://gptbot.uz/uz/tariflar/?pay=return'), '/uz/tariflar/');
});

// ── The pack hint (localStorage, a per-viewer convenience) ──────────────────

function hintTarget(options: { throws?: boolean } = {}) {
  const store = new Map<string, string>();
  const events = new EventTarget();
  const target: HintTarget = {
    localStorage: {
      getItem: (key) => {
        if (options.throws) throw new Error('blocked');
        return store.get(key) ?? null;
      },
      setItem: (key, value) => {
        if (options.throws) throw new Error('blocked');
        store.set(key, value);
      },
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  };
  return { target, store };
}

test('hint: a purchase here is remembered and announced; blocked storage is harmless; a /me with an account announces too', () => {
  const { target, store } = hintTarget();
  const heard: string[] = [];
  const stop = onPack(() => heard.push('pack'), target);
  assert.equal(packRemembered(target), false);
  rememberPack(target);
  assert.equal(store.get(PACK_HINT_KEY), '1');
  assert.equal(packRemembered(target), true);
  announcePack(target);
  assert.deepEqual(heard, ['pack', 'pack']);
  stop();
  announcePack(target);
  assert.equal(heard.length, 2);
  assert.equal(PACK_EVENT, 'gptbot-studio-pack');
  const blocked = hintTarget({ throws: true });
  assert.doesNotThrow(() => rememberPack(blocked.target));
  assert.equal(packRemembered(blocked.target), false);
  assert.doesNotThrow(() => rememberPack(null));
  assert.equal(packRemembered(null), false);
});

// ── main.tsx ────────────────────────────────────────────────────────────────

test('main.tsx: the form gets the slots; billing code, the page after payment and the photo island arrive only through import()', () => {
  const main = read('main.tsx');
  const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // Static imports: no billing module but the tiny hint and the tariffs root reader.
  const staticImports = [...code.matchAll(/^import [^;]*? from '([^']+)';/gm)].map((match) => match[1]);
  for (const source of staticImports) assert.ok(!/billing\/(?!hint$|tariffs-root$)/.test(source), `static import of ${source}`);
  assert.ok(!staticImports.some((source) => /tools\/photo/.test(source)), 'the photo island is not statically imported');
  for (const lazy of ['./billing/Tariffs', './billing/MyPack', './billing/PayReturn']) assert.ok(code.includes(`import('${lazy}')`), lazy);
  assert.match(code, /import\.meta\.glob[^(]*\('\.\/tools\/photo\/Island\.tsx'\)/);
  assert.match(code, /<Form locale=\{locale\} slots=\{slots\} \/>/);
  assert.match(code, /get\('pay'\) === 'return'/);
  // Back from a payment the pack shows above the tool, once: the tool's own slot stays empty.
  assert.match(code, /myPack: \(\) => \(returning \? null : <MyPackSlot locale=\{locale\} \/>\)/);
  assert.match(code, /TARIFFS_TOOL/);
  assert.match(code, /hydrateRoot\(/);
});

test('billing never logs, never talks to analytics directly and follows payment pages only through isPaymentPage', () => {
  for (const file of fs.readdirSync(path.join(SRC, 'billing'))) {
    const code = read(`billing/${file}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /console\.|gtag\(|\bym\(|dataLayer|['"`]purchase['"`]/, file);
    assert.doesNotMatch(code, /dangerouslySetInnerHTML|innerHTML/, file);
  }
});
