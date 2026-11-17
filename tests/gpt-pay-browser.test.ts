// The checkout in a real browser, on the production build, with offline fixtures only (chat CRO 2026-11-17):
// no real order, no provider request ever leaves the machine (every other origin is aborted).
//
// What static rendering cannot show: the window between the tap and the provider's page, a browser that
// never leaves, a tap made while the account is being read, the link for someone else, and a return page
// that must not blink while the watch reads the account.
//
// Run (after a build): node --import tsx --test tests/gpt-pay-browser.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium, type BrowserContext, type Page } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const ORDER = `pay_${'c'.repeat(32)}`;
/** An order of the 3-day pack (its own id prefix, functions/lib/gpt-chat/packs.ts). */
const SMALL_ORDER = `pk_${'d'.repeat(32)}`;
const LINKS = {
  click: `https://my.click.uz/services/pay?service_id=1&merchant_id=1&amount=20000&transaction_param=${ORDER}`,
  payme: 'https://checkout.paycom.uz/bT1maXh0dXJl',
} as const;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface Fixture {
  /** subscribe answered: the account is a guest with this open order. */
  ordered: boolean;
  paid: boolean;
  /** Every read of the account takes this long. */
  accountDelay: number;
  /** Reads of the account being answered right now. */
  reading: number;
  /** Reads of the account begun so far. */
  started: number;
  /** subscribe answers 503 this many times first. */
  refuse: number;
  /** The server offers the 3-day pack beside the monthly one (pack.more). */
  more: boolean;
  /** Trial answers left of the three (the lifetime trial); null: the visitor is not in the trial. The chat's answer spends one. */
  trialLeft: number | null;
  /** The pack of the open order: what the last subscribe asked for. */
  sku: 'month' | 'once';
  subscribes: Array<Record<string, unknown>>;
  events: Array<{ type: string; detail: string }>;
  /** Main-frame navigations to another origin, each cancelled as if the browser never left. */
  left: string[];
  errors: string[];
}

async function open(browser: Awaited<ReturnType<typeof chromium.launch>>, origin: string): Promise<{ ctx: BrowserContext; page: Page; f: Fixture }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  const f: Fixture = { ordered: false, paid: false, accountDelay: 0, reading: 0, started: 0, refuse: 0, more: false, trialLeft: null, sku: 'month', subscribes: [], events: [], left: [], errors: [] };
  page.on('pageerror', (error) => f.errors.push(error.message));
  await ctx.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      // The provider's page: cancelled, so the page stays where it is (an app took the link, or the browser held it).
      if (request.isNavigationRequest()) { f.left.push(url.href); return route.abort('aborted'); }
      return route.abort();
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/auth/config') return json({ turnstileRequired: false });
    if (url.pathname === '/api/gpt/session') return json({ ok: true, sessionId: 'fixture-session' });
    if (url.pathname === '/api/gpt/event') { f.events.push(request.postDataJSON()); return json({ ok: true }); }
    if (url.pathname === '/api/gpt/account') {
      f.reading++;
      f.started++;
      if (f.accountDelay) await sleep(f.accountDelay);
      f.reading--;
      return json({
        ok: true, mode: 'live', loginAvailable: false, guestCheckout: true, providers: ['click', 'payme'],
        user: f.ordered ? { signedIn: true, storageKey: 'c'.repeat(64), guest: true } : null,
        freeLimits: { daily: 15, hourly: 5, ...(f.trialLeft !== null ? { lifetime: 3 } : {}) }, terms: { ru: '/ru/oferta/', uz: '/uz/oferta/' }, termsVersion: 'fixture-current',
        ...(f.trialLeft !== null ? { trial: { limit: 3, used: 3 - f.trialLeft, remaining: f.trialLeft, available: f.trialLeft, resets: 'never' }, remaining: f.trialLeft } : {}),
        pack: { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: null,
          ...(f.more ? { more: [{ sku: 'once', priceUzs: 5000, messageLimit: 30, dailyLimit: 50, hours: 72, vat: null }] } : {}) },
        access: f.paid ? { order_id: ORDER, ends_at: Date.now() + 86_400_000, remaining: 300, message_limit: 300, dayRemaining: 50 } : null,
        payment: f.ordered ? {
          id: f.sku === 'once' ? SMALL_ORDER : ORDER, state: f.paid ? 'paid' : 'pending', provider: f.subscribes.at(-1)?.provider === 'payme' ? 'payme' : 'click', cancellable: !f.paid,
          sku: f.sku, priceUzs: f.sku === 'once' ? 5000 : 20000, messageLimit: f.sku === 'once' ? 30 : 300,
        } : null,
      });
    }
    if (url.pathname === '/api/gpt/chat') {
      // One answer, and it spends a trial answer.
      if (f.trialLeft !== null) f.trialLeft = Math.max(0, f.trialLeft - 1);
      return json({ ok: true, answer: 'Тестовый ответ.', remaining: f.trialLeft ?? 14, hourRemaining: f.trialLeft === null ? 4 : null, sessionId: 'fixture-session', modelUsed: 'fixture' });
    }
    if (url.pathname === '/api/gpt/subscribe') {
      const body = request.postDataJSON() as Record<string, unknown>;
      f.subscribes.push(body);
      if (f.refuse > 0) { f.refuse--; return json({ ok: false, code: 'unavailable' }, 503); }
      f.ordered = true;
      // The pack by name, as the server reads it: «once», or the monthly pack when no pack is named.
      f.sku = body.sku === 'once' ? 'once' : 'month';
      return json({ ok: true, mode: 'checkout', checkoutUrl: LINKS[body.provider === 'payme' ? 'payme' : 'click'], attemptId: f.sku === 'once' ? SMALL_ORDER : ORDER });
    }
    return json({ ok: false }, 404);
  });
  return { ctx, page, f };
}

const ready = (page: Page) => page.locator('[data-chat-presentation-open]:not(:disabled)').waitFor();
const until = async (what: string, check: () => boolean | Promise<boolean>, ms = 8_000) => {
  for (const end = Date.now() + ms; Date.now() < end;) { if (await check()) return; await sleep(50); }
  assert.fail(`timed out: ${what}`);
};
/** One question and its answer: the last trial answer, after which the paywall opens over the thread. */
const ask = async (page: Page) => {
  await page.locator('.gpt-input-surface textarea').fill('Test');
  await page.locator('.gpt-send-button').click();
  await page.getByText('Тестовый ответ.', { exact: true }).waitFor({ timeout: 20_000 });
};
const narrow = async (page: Page, what: string) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${what}: no sideways scroll`);

test('checkout in a browser: the tap, a browser that never leaves, a tap during a read, the link for someone else, a return that does not blink, two packs', { skip: !executablePath || !fs.existsSync(path.join(dist, 'ru/gpt-chat/index.html')), timeout: 420_000 }, async () => {
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://local').pathname;
    const file = path.resolve(dist, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end();
    const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' } as Record<string, string>)[path.extname(file)];
    res.writeHead(200, { 'Content-Type': type ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ executablePath, headless: true });
  const shots = process.env.GPTBOT_BROWSER_REPORT_DIR;
  const shot = async (page: Page, name: string) => { if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, `${name}.png`) }); } };
  try {
    // ---- 1. The tap, a browser that never leaves, a tap during a read, the payment arriving.
    {
      const { ctx, page, f } = await open(browser, origin);
      await page.goto(`${origin}/ru/gpt-chat/`);
      await ready(page);
      await page.locator('[data-testid="ai-account-trigger"]').click();
      const click = page.locator('.gpt-payment-buttons [data-provider="click"]');
      await click.waitFor();
      await page.locator('[data-testid="ai-pay-extras"]').waitFor();
      await until('the pay button is live', async () => !(await click.isDisabled()));
      assert.match(await page.locator('[data-testid="ai-pay-per"]').innerText(), /≈ 67 сум за ответ/);
      await narrow(page, 'pay step');
      await shot(page, 'pay-step-ru');

      // A refusal first: said, with a retry, and the window is back on the pay step.
      f.refuse = 1;
      await click.click();
      const stall = page.locator('[data-testid="ai-pay-stall"]');
      await stall.waitFor();
      assert.match(await stall.innerText(), /Не получилось создать оплату через Click\. Деньги не списаны\./);
      assert.equal(await page.locator('[data-testid="ai-pay-opening"]').count(), 0, 'the opening line ends with the request');
      assert.equal(f.left.length, 0);
      await shot(page, 'stall-ru');

      // The retry: one tap, the order, the cookie probe, and the browser is sent to Click.
      await stall.locator('button').click();
      const opening = page.locator('[data-testid="ai-pay-opening"]');
      await opening.waitFor();
      assert.equal((await opening.innerText()).trim(), 'Открываем страницу Click…');
      await until('the browser is sent to Click', () => f.left.length === 1);
      assert.equal(f.left[0], LINKS.click);
      assert.equal(f.subscribes.length, 2);
      assert.equal(f.subscribes[1].provider, 'click');
      assert.equal(f.subscribes[1].requestId, f.subscribes[0].requestId, 'the retry is the same request');
      await until('the steps are counted', () => ['checkout_created', 'checkout_started', 'checkout_redirect'].every((type) => f.events.some((event) => event.type === type)));
      const order = f.events.filter((event) => /^checkout_(created|redirect|aborted)$/.test(event.type)).map((event) => event.type);
      assert.deepEqual(order, ['checkout_aborted', 'checkout_created', 'checkout_redirect'], 'the refusal, then the order, then the redirect');
      assert.match(f.events.find((event) => event.type === 'checkout_aborted')!.detail, /^unavailable\.click\.(lt1|s1_3|s3_8|gt8)\.none\.desktop$/);
      assert.match(f.events.find((event) => event.type === 'checkout_redirect')!.detail, /^click\.(lt1|s1_3|s3_8|gt8)\.none\.desktop$/);
      assert.match(await page.evaluate(() => localStorage.getItem('gptchat_checkout') ?? ''), new RegExp(ORDER), 'the trip is stored for the way back');

      // The browser never left (cancelled navigation). In view again: the wait takes the opening line's place.
      await sleep(400);
      assert.equal(await opening.count(), 1, 'still «Открываем…» until the page is seen again');
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.locator('[data-result="checking"]').waitFor();
      assert.equal(await opening.count(), 0);

      // An order nobody touched, a read made here and five seconds on: «Оплата не завершена», with its ways on.
      const unpaid = page.locator('[data-testid="ai-pay-unpaid"]');
      await unpaid.waitFor({ timeout: 15_000 });
      assert.match(await unpaid.innerText(), /Счёт ещё не оплачен/);
      assert.equal((await page.locator('[data-testid="ai-pay-ref"]').innerText()).trim(), `Счёт №${ORDER.slice(-6).toUpperCase()}`);
      assert.match(await page.locator('[data-testid="ai-pay-write"]').getAttribute('href') ?? '', /^https:\/\/t\.me\/XGame_changerx\?text=/);
      await until('the unpaid return is counted', () => f.events.some((event) => event.type === 'checkout_return_unpaid' && /^none\.click\./.test(event.detail)));
      assert.equal(f.events.filter((event) => event.type === 'checkout_return_unpaid').length, 1, 'once');
      await narrow(page, 'unpaid card');
      await shot(page, 'unpaid-ru');
      // The card stays through the watch's reads (it does not go back to «Проверяем…» every three seconds).
      f.accountDelay = 500;
      for (const end = Date.now() + 4_000; Date.now() < end; await sleep(100)) assert.equal(await unpaid.count(), 1, 'the card does not blink');

      // A tap while the account is being read: it waits for the read, then pays once, on the same order.
      // A read begun after this line takes a second and a half: the tap lands inside it, not at the end of an earlier one.
      f.accountDelay = 1_500;
      const begun = f.started;
      await until('a read is in flight', () => f.started > begun && f.reading > 0, 8_000);
      const before = f.subscribes.length;
      await unpaid.locator('button.gpt-primary').click();
      await opening.waitFor({ timeout: 1_000 });
      assert.equal(f.subscribes.length, before, 'nothing is sent while the read is in flight');
      await until('the tap pays after the read', () => f.subscribes.length === before + 1 && f.left.length === 2, 8_000);
      assert.equal(f.subscribes[before].requestId, f.subscribes[0].requestId, 'the same order');
      assert.deepEqual(f.errors, [], 'no failure is shown or thrown for a tap during a read');
      f.accountDelay = 0;

      // Nobody comes back and nothing is pressed: twelve seconds on, the wait is back by itself.
      await until('the opening line gives way by itself', async () => (await opening.count()) === 0, 16_000);
      // The payment arrives: said at once by the watch.
      f.paid = true;
      await page.locator('[data-testid="ai-pay-result"][data-result="paid"]').waitFor({ timeout: 8_000 });
      await shot(page, 'paid-ru');
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }

    // ---- 2. «Попросить оплатить»: a link, not a redirect; nothing stored, so a reload opens no window.
    {
      const { ctx, page, f } = await open(browser, origin);
      await page.goto(`${origin}/uz/gpt-uzbek-tilida/`);
      await ready(page);
      await page.locator('[data-testid="ai-account-trigger"]').click();
      await page.locator('[data-testid="ai-pay-ask"]').click();
      const box = page.locator('[data-testid="ai-pay-ask-box"]');
      await box.waitFor();
      assert.match(await box.innerText(), /ofertani/);
      await shot(page, 'ask-box-uz');
      await box.locator('[data-provider="payme"]').click();
      await page.locator('[data-testid="ai-pay-share"]').waitFor();
      assert.equal(await page.locator('.gpt-pay-link').inputValue(), LINKS.payme);
      const share = new URL(await page.locator('[data-testid="ai-pay-share-telegram"]').getAttribute('href') ?? '');
      assert.equal(share.origin + share.pathname, 'https://t.me/share/url');
      assert.equal(share.searchParams.get('url'), LINKS.payme);
      assert.match(await page.locator('[data-testid="ai-pay-share-here"]').innerText(), /SHU brauzerda/);
      assert.equal(f.left.length, 0, 'the browser is not sent anywhere');
      assert.equal(f.subscribes.length, 1);
      assert.equal(f.subscribes[0].provider, 'payme');
      await until('the order is counted', () => f.events.some((event) => event.type === 'checkout_created'));
      assert.ok(!f.events.some((event) => event.type === 'checkout_redirect' || event.type === 'checkout_started'), 'a link is not a trip to the payment page');
      assert.equal(await page.evaluate(() => localStorage.getItem('gptchat_checkout')), null, 'watched while the page lives, never stored');
      await narrow(page, 'share');
      await shot(page, 'share-uz');
      await page.reload();
      await ready(page);
      await sleep(1_200);
      assert.equal(await page.locator('.gpt-account-dialog').count(), 0, 'a reload opens no window');
      assert.ok(!f.events.some((event) => event.type === 'checkout_return_unpaid'), 'and counts no return');
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }

    // ---- 3. Back from the provider in a browser with no order: said once, and it stays through every read.
    {
      const { ctx, page, f } = await open(browser, origin);
      f.accountDelay = 400;
      await page.goto(`${origin}/ru/gpt-chat/?pay=return`);
      const verdict = page.locator('[data-testid="ai-pay-result"][data-result="holderless"]');
      await verdict.waitFor({ timeout: 10_000 });
      for (const end = Date.now() + 7_000; Date.now() < end; await sleep(100)) assert.equal(await verdict.count(), 1, 'the verdict does not blink with the watch');
      assert.ok(!f.events.some((event) => event.type === 'checkout_return_unpaid'));
      await narrow(page, 'holderless');
      await shot(page, 'holderless-ru');
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }

    // ---- 4. Two packs in the window: a row each, the small one first; one tap on its Payme button pays the 3-day pack by name.
    {
      const { ctx, page, f } = await open(browser, origin);
      f.more = true;
      await page.goto(`${origin}/ru/gpt-chat/`);
      await ready(page);
      await page.locator('[data-testid="ai-account-trigger"]').click();
      const rows = page.locator('[data-testid="ai-pay-packs"] .gpt-pay-pack');
      await rows.first().waitFor();
      assert.deepEqual(await rows.evaluateAll((all) => all.map((row) => row.getAttribute('data-sku'))), ['once', 'month'], 'someone without a pack: the small one first');
      assert.match(await rows.nth(0).innerText(), /На 3 дня[\s\S]*5 000 сум[\s\S]*30 ответов · 3 дня · ≈ 167 сум за ответ/);
      assert.match(await rows.nth(1).innerText(), /На месяц[\s\S]*выгоднее[\s\S]*20 000 сум[\s\S]*300 ответов · до 50 в день · ≈ 67 сум за ответ/);
      assert.equal(await page.locator('.gpt-price').count(), 0, 'no single big price over two packs');
      assert.equal(await page.locator('[data-testid="ai-pack-no-refund"]').count(), 1, 'the notes stay');
      await narrow(page, 'two packs');
      await shot(page, 'packs-ru');
      const small = rows.nth(0).locator('[data-provider="payme"]');
      await until('the row is live', async () => !(await small.isDisabled()));
      await small.click();
      await until('the browser is sent to Payme', () => f.left.length === 1);
      assert.equal(f.left[0], LINKS.payme);
      assert.equal(f.subscribes.length, 1, 'one tap, one order');
      assert.deepEqual({ provider: f.subscribes[0].provider, sku: f.subscribes[0].sku }, { provider: 'payme', sku: 'once' });
      assert.match(await page.evaluate(() => localStorage.getItem('gptchat_checkout') ?? ''), new RegExp(SMALL_ORDER), 'the trip of a pk_ order is stored for the way back');
      // Back without paying the small pack: the card, and no smaller pack to offer over itself.
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      const unpaid = page.locator('[data-testid="ai-pay-unpaid"]');
      await unpaid.waitFor({ timeout: 15_000 });
      assert.equal(await page.locator('[data-testid="ai-pay-cheaper"]').count(), 0);
      assert.equal((await page.locator('[data-testid="ai-pay-ref"]').innerText()).trim(), `Счёт №${SMALL_ORDER.slice(-6).toUpperCase()}`);
      // «Продолжить оплату» resumes the same pack: the request names it again.
      await unpaid.locator('button.gpt-primary').click();
      await until('the same pack again', () => f.subscribes.length === 2 && f.left.length === 2);
      assert.deepEqual({ provider: f.subscribes[1].provider, sku: f.subscribes[1].sku, key: f.subscribes[1].requestId }, { provider: 'payme', sku: 'once', key: f.subscribes[0].requestId });
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }

    // ---- 5. The monthly pack left unpaid: the 3-day pack is one tap away, with the same provider.
    {
      const { ctx, page, f } = await open(browser, origin);
      f.more = true;
      await page.goto(`${origin}/uz/gpt-uzbek-tilida/`);
      await ready(page);
      await page.locator('[data-testid="ai-account-trigger"]').click();
      const month = page.locator('.gpt-pay-pack[data-sku="month"] [data-provider="click"]');
      await month.waitFor();
      await until('the row is live', async () => !(await month.isDisabled()));
      await month.click();
      await until('the browser is sent to Click', () => f.left.length === 1);
      assert.equal(f.subscribes[0].sku, undefined, 'the monthly pack is the request it always was');
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      const cheaper = page.locator('[data-testid="ai-pay-cheaper"]');
      await cheaper.waitFor({ timeout: 15_000 });
      assert.equal((await cheaper.innerText()).trim(), 'Yoki 3 kunlik paket — 5 000 so‘m · Click');
      await narrow(page, 'unpaid with the small pack');
      await shot(page, 'unpaid-cheaper-uz');
      await cheaper.click();
      await until('the small pack is asked for', () => f.subscribes.length === 2 && f.left.length === 2);
      assert.deepEqual({ provider: f.subscribes[1].provider, sku: f.subscribes[1].sku }, { provider: 'click', sku: 'once' });
      assert.notEqual(f.subscribes[1].requestId, f.subscribes[0].requestId, 'its own request key');
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }

    // ---- 6. The paywall after the trial: two rows, and the tap on the small pack pays it in one tap.
    {
      const { ctx, page, f } = await open(browser, origin);
      f.more = true;
      f.trialLeft = 1;
      await page.goto(`${origin}/ru/gpt-chat/`);
      await ready(page);
      await ask(page);
      const packs = page.locator('[data-testid="trial-packs"] .gpt-trial-pack');
      await packs.first().waitFor({ timeout: 20_000 });
      assert.deepEqual(await packs.evaluateAll((all) => all.map((row) => row.getAttribute('data-sku'))), ['once', 'month']);
      assert.match(await packs.nth(0).innerText(), /На 3 дня[\s\S]*5 000 сум[\s\S]*30 ответов · 3 дня/);
      assert.match((await packs.nth(0).innerText()).replace(/\s+/g, ' '), /Оплатить: Click ↗ Payme ↗/);
      // The two buttons of a row stand side by side, each on one line (a 390px phone, and a 360px one below).
      const fits = async () => page.locator('[data-testid="trial-packs"] .gpt-trial-pack button').evaluateAll((all) => all.every((button) => button.getBoundingClientRect().height <= 56)
        && all[0].getBoundingClientRect().top === all[1].getBoundingClientRect().top);
      assert.ok(await fits(), 'buttons on one line at 390px');
      await page.setViewportSize({ width: 360, height: 740 });
      assert.ok(await fits(), 'buttons on one line at 360px');
      await narrow(page, 'paywall at 360px');
      await page.setViewportSize({ width: 390, height: 780 });
      await narrow(page, 'paywall with two packs');
      await shot(page, 'paywall-ru');
      await packs.nth(0).locator('[data-provider="click"]').click();
      await until('one tap pays the small pack', () => f.subscribes.length === 1 && f.left.length === 1, 15_000);
      assert.deepEqual({ provider: f.subscribes[0].provider, sku: f.subscribes[0].sku }, { provider: 'click', sku: 'once' });
      assert.equal(f.left[0], LINKS.click);
      await sleep(800);
      assert.equal(f.subscribes.length, 1, 'and only once');
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }

    // ---- 7. The same paywall, the monthly row: the request carries no pack, as before.
    {
      const { ctx, page, f } = await open(browser, origin);
      f.more = true;
      f.trialLeft = 1;
      await page.goto(`${origin}/uz/gpt-uzbek-tilida/`);
      await ready(page);
      await ask(page);
      const month = page.locator('[data-testid="trial-packs"] .gpt-trial-pack[data-sku="month"] [data-provider="payme"]');
      await month.waitFor({ timeout: 20_000 });
      await month.click();
      await until('one tap pays the month', () => f.subscribes.length === 1 && f.left.length === 1, 15_000);
      assert.deepEqual({ provider: f.subscribes[0].provider, sku: f.subscribes[0].sku }, { provider: 'payme', sku: undefined });
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }

    // ---- 8. One pack on offer and the trial over: the paywall it always was (a sum on each button, no rows).
    {
      const { ctx, page, f } = await open(browser, origin);
      f.trialLeft = 1;
      await page.goto(`${origin}/ru/gpt-chat/`);
      await ready(page);
      await ask(page);
      const pay = page.locator('.gpt-trial-pay [data-provider="click"]');
      await pay.waitFor({ timeout: 20_000 });
      assert.equal(await page.locator('[data-testid="trial-packs"]').count(), 0);
      assert.match(await pay.innerText(), /Click · 20\s000/);
      await pay.click();
      await until('one tap pays', () => f.subscribes.length === 1 && f.left.length === 1, 15_000);
      assert.equal(f.subscribes[0].sku, undefined);
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }

    // ---- 9. Back later with the trial spent: the limit card, with the 3-day pack above the month; one tap pays it.
    {
      const { ctx, page, f } = await open(browser, origin);
      f.more = true;
      f.trialLeft = 0;
      await page.goto(`${origin}/ru/gpt-chat/`);
      const small = page.locator('[data-testid="limit-small-pack"]');
      await small.waitFor({ timeout: 20_000 });
      assert.match((await small.innerText()).replace(/\s+/g, ' '), /5 000 сум · 30 ответов · 3 дня .*Оплатить: ?Click ?↗ ?Payme ?↗.*или на месяц/);
      // The monthly pack's own line and buttons are still there, below it.
      assert.equal(await page.locator('[data-testid="limit-pay"]').count(), 2);
      assert.ok(await small.evaluate((row) => !!(row.compareDocumentPosition(document.querySelector('[data-testid="limit-pay"]')!) & Node.DOCUMENT_POSITION_FOLLOWING)), 'the small pack first');
      await narrow(page, 'limit card with two packs');
      await shot(page, 'limit-card-ru');
      await small.locator('[data-provider="payme"]').click();
      await until('one tap pays the small pack', () => f.subscribes.length === 1 && f.left.length === 1, 15_000);
      assert.deepEqual({ provider: f.subscribes[0].provider, sku: f.subscribes[0].sku }, { provider: 'payme', sku: 'once' });
      await sleep(800);
      assert.equal(f.subscribes.length, 1);
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }

    // ---- 10. The same card with one pack on offer: the monthly buttons only, and their tap carries no pack.
    {
      const { ctx, page, f } = await open(browser, origin);
      f.trialLeft = 0;
      await page.goto(`${origin}/uz/gpt-uzbek-tilida/`);
      const month = page.locator('[data-testid="limit-pay"][data-provider="click"]');
      await month.waitFor({ timeout: 20_000 });
      assert.equal(await page.locator('[data-testid="limit-small-pack"]').count(), 0);
      await month.click();
      await until('one tap pays the month', () => f.subscribes.length === 1 && f.left.length === 1, 15_000);
      assert.equal(f.subscribes[0].sku, undefined);
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
