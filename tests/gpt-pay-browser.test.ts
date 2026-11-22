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
  /** A signed-in visitor outside the trial whose free day is counted to the end: a limit that time lifts. */
  dayOver: boolean;
  /** A pack was held and has ended: no access, the view says hadPack, the trial long spent. */
  ended: boolean;
  /** The view offers a sign-in (loginAvailable): the paid screen then offers to keep the pack through Telegram. */
  login: boolean;
  subscribes: Array<Record<string, unknown>>;
  /** cancel_invoice requests (POST /api/gpt/account): the order ids, in order. */
  cancels: string[];
  events: Array<{ type: string; detail: string }>;
  /** Main-frame navigations to another origin, each cancelled as if the browser never left. */
  left: string[];
  errors: string[];
}

async function open(browser: Awaited<ReturnType<typeof chromium.launch>>, origin: string): Promise<{ ctx: BrowserContext; page: Page; f: Fixture }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  const f: Fixture = { ordered: false, paid: false, accountDelay: 0, reading: 0, started: 0, refuse: 0, more: false, trialLeft: null, sku: 'month', dayOver: false, ended: false, login: false, subscribes: [], cancels: [], events: [], left: [], errors: [] };
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
      // The account's own unseen invoice closed (BillingStore.cancelInvoice): no open order any more.
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        if (body.action === 'cancel_invoice') { f.cancels.push(String(body.orderId)); f.ordered = false; return json({ ok: true }); }
      }
      f.reading++;
      f.started++;
      if (f.accountDelay) await sleep(f.accountDelay);
      f.reading--;
      return json({
        ok: true, mode: 'live', loginAvailable: f.login, guestCheckout: true, providers: ['click', 'payme'],
        user: f.ordered ? { signedIn: true, storageKey: 'c'.repeat(64), guest: true } : f.dayOver ? { signedIn: true, storageKey: 'd'.repeat(64) } : null,
        ...(f.dayOver ? { remaining: 0 } : {}),
        freeLimits: { daily: 15, hourly: 5, ...(f.trialLeft !== null ? { lifetime: 3 } : {}) }, terms: { ru: '/ru/oferta/', uz: '/uz/oferta/' }, termsVersion: 'fixture-current',
        ...(f.trialLeft !== null ? { trial: { limit: 3, used: 3 - f.trialLeft, remaining: f.trialLeft, available: f.trialLeft, resets: 'never' }, remaining: f.trialLeft } : {}),
        pack: { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: null,
          ...(f.more ? { more: [{ sku: 'once', priceUzs: 5000, messageLimit: 30, dailyLimit: 50, hours: 72, vat: null }] } : {}) },
        access: f.paid && !f.ended ? { order_id: ORDER, ends_at: Date.now() + 86_400_000, remaining: 300, message_limit: 300, dayRemaining: 50 } : null,
        // The server's own word (functions/api/gpt/account.ts): no pack runs, but the account held one.
        ...(f.ended ? { hadPack: true } : {}),
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

test('checkout in a browser: the tap, a browser that never leaves, a tap during a read, the link for someone else, a return that does not blink, two packs, the send button at the wall', { skip: !executablePath || !fs.existsSync(path.join(dist, 'ru/gpt-chat/index.html')), timeout: 600_000 }, async () => {
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
      // C1 (conversion audit 2026-11-22): the live link is counted once per screen, through the 15-second refresh too;
      // a copy is counted as such (the 60-an-hour allowance is shared with the checkout steps).
      await sleep(16_000);
      assert.deepEqual(f.events.filter((event) => event.type === 'pay_share').map((event) => event.detail), ['shown']);
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
      await page.locator('[data-testid="ai-pay-share-copy"]').click();
      await until('the copy is counted', () => f.events.some((event) => event.type === 'pay_share' && event.detail === 'copied'));
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

    // ---- 5b. A card that did not go through on Click (21.11.2026): the other provider is one tap away. The Click
    //      invoice no provider has seen is closed on the way (cancel_invoice), then Payme's order is made; back
    //      from Payme the card offers Click the same way, and the pack window's own row does the same.
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
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      const other = page.locator('[data-testid="ai-pay-switch"]');
      await other.waitFor({ timeout: 15_000 });
      assert.equal((await other.innerText()).trim(), 'Payme orqali to‘lash');
      assert.equal(await page.locator('[data-testid="ai-pay-unpaid"] button.gpt-primary').count(), 1, 'one primary button');
      await narrow(page, 'unpaid with the other provider');
      await shot(page, 'unpaid-switch-uz');
      await other.click();
      await until('the browser is sent to Payme', () => f.left.length === 2);
      assert.equal(f.left[1], LINKS.payme);
      assert.deepEqual(f.cancels, [ORDER], 'the unseen Click invoice is closed first');
      assert.equal(f.subscribes.length, 2);
      assert.deepEqual({ provider: f.subscribes[1].provider, sku: f.subscribes[1].sku }, { provider: 'payme', sku: undefined });
      assert.notEqual(f.subscribes[1].requestId, f.subscribes[0].requestId, 'a new order, its own request key');
      // Back from Payme unpaid: the card offers Click.
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await until('the card offers Click', async () => (await other.count()) === 1 && (await other.innerText()).trim() === 'Click orqali to‘lash', 15_000);
      // «Boshqa usul» back to the pay step: the month's Click row closes the unseen Payme invoice on the way.
      await page.locator('[data-testid="ai-pay-unpaid"] .gpt-pay-unpaid-more button').first().click();
      const row = page.locator('.gpt-pay-pack[data-sku="month"] [data-provider="click"]');
      await row.waitFor();
      await until('the row is live', async () => !(await row.isDisabled()));
      await row.click();
      await until('the browser is sent to Click again', () => f.left.length === 3);
      assert.deepEqual(f.cancels, [ORDER, ORDER], 'the unseen Payme invoice is closed first');
      assert.equal(f.subscribes.length, 3);
      assert.equal(f.subscribes[2].provider, 'click');
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

    // ---- 11. A question typed at the trial's wall (roadmap №2, 2.1): the send button opens the pack window with the
    //          question quoted; nothing is ordered until a provider is tapped; paid, the question is still in the field.
    {
      const { ctx, page, f } = await open(browser, origin);
      f.more = true;
      f.trialLeft = 0;
      await page.goto(`${origin}/ru/gpt-chat/`);
      await page.locator('[data-testid="limit-small-pack"]').waitFor({ timeout: 20_000 });
      const field = page.locator('.gpt-input-surface textarea');
      const send = page.locator('.gpt-send-button');
      // Empty, the button focuses the field and opens nothing (it says aria-disabled, so the tap is forced).
      await send.click({ force: true });
      await sleep(400);
      assert.equal(await page.locator('[data-testid="ai-pay-packs"]').count(), 0, 'an empty field opens nothing');
      const QUESTION = 'Напиши план реферата про Аральское море';
      await field.fill(QUESTION);
      assert.equal(await send.getAttribute('data-state'), 'ready', 'an arrow, not a clock');
      assert.equal(await send.isDisabled(), false);
      await send.click();
      const quoted = page.locator('[data-testid="ai-pay-question"]');
      await quoted.waitFor({ timeout: 20_000 });
      assert.equal((await quoted.innerText()).replace(/\s+/g, ' ').trim(), `Ваш вопрос сохранён на час: «${QUESTION}». После оплаты вернитесь в чат и отправьте его.`);
      assert.equal((await page.locator('[data-testid="ai-pay-seller"]').innerText()).trim(), 'Продавцом там может быть указано ООО «FREEDOM IS HEAVEN» — это компания GPTBot.uz.');
      // Above the rows of the two packs, the small one first.
      assert.ok(await quoted.evaluate((line) => !!(line.compareDocumentPosition(document.querySelector('.gpt-pay-pack')!) & Node.DOCUMENT_POSITION_FOLLOWING)), 'the question first');
      await until('the window is counted as opened from the wall', () => f.events.some((event) => event.type === 'pack_viewed' && event.detail === 'wall'));
      await until('the wall is counted as seen for the first time', () => f.events.some((event) => event.type === 'trial_wall_seen' && event.detail === 'first'));
      assert.equal(f.subscribes.length, 0, 'the send button orders nothing');
      assert.equal(f.left.length, 0);
      assert.ok(!JSON.stringify(f.events).includes('Арал'), 'no event carries the question');
      await narrow(page, 'the window with the question');
      await shot(page, 'wall-question-ru');
      const small = page.locator('.gpt-pay-pack[data-sku="once"] [data-provider="click"]');
      await until('the row is live', async () => !(await small.isDisabled()));
      await small.click();
      await until('one tap pays the small pack', () => f.subscribes.length === 1 && f.left.length === 1, 15_000);
      assert.deepEqual({ provider: f.subscribes[0].provider, sku: f.subscribes[0].sku }, { provider: 'click', sku: 'once' });
      assert.ok(!JSON.stringify(f.subscribes).includes('Арал'), 'the order carries no question');
      // Paid: the pack is active, the question is still in the field, and one tap sends it.
      f.paid = true;
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.locator('[data-testid="ai-pay-result"][data-result="paid"]').waitFor({ timeout: 20_000 });
      await page.getByRole('button', { name: 'Вернуться в чат' }).click();
      assert.equal(await field.inputValue(), QUESTION, 'the question waited');
      await until('the send button is live again', async () => !(await send.isDisabled()), 15_000);
      await send.click();
      await page.getByText('Тестовый ответ.', { exact: true }).waitFor({ timeout: 20_000 });
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }

    // ---- 11b. The same promise across a real trip: the page unloads for the provider's and comes back as a fresh
    //           load at ?pay=return. The field holds the question, one tap sends it, and no second order is made.
    //           The paid screen offers to keep the pack through Telegram with a real button (roadmap №2, 4.1).
    {
      const { ctx, page, f } = await open(browser, origin);
      f.more = true;
      f.trialLeft = 0;
      await page.goto(`${origin}/ru/gpt-chat/`);
      await page.locator('[data-testid="limit-small-pack"]').waitFor({ timeout: 20_000 });
      const QUESTION = 'Составь список вопросов к экзамену по истории';
      await page.locator('.gpt-input-surface textarea').fill(QUESTION);
      await page.locator('.gpt-send-button').click();
      await page.locator('[data-testid="ai-pay-question"]').waitFor({ timeout: 20_000 });
      const small = page.locator('.gpt-pay-pack[data-sku="once"] [data-provider="payme"]');
      await until('the row is live', async () => !(await small.isDisabled()));
      await small.click();
      await until('the browser is sent to Payme', () => f.subscribes.length === 1 && f.left.length === 1, 15_000);
      assert.equal(f.left[0], LINKS.payme);
      // The chat's page is gone: another document took its place, and the payment is made there.
      await page.goto('about:blank');
      f.paid = true;
      f.login = true;
      await page.goto(`${origin}/ru/gpt-chat/?pay=return`);
      await page.locator('[data-testid="ai-pay-result"][data-result="paid"]').waitFor({ timeout: 20_000 });
      const save = page.locator('[data-testid="ai-pack-save"] button');
      await save.waitFor();
      assert.equal((await save.innerText()).trim(), 'Сохранить через Telegram');
      const box = await save.boundingBox();
      assert.ok(box && box.height >= 44 && box.width >= 280, `a real button, not a text link: ${JSON.stringify(box)}`);
      await narrow(page, 'the paid screen with the save button');
      await shot(page, 'paid-save-ru');
      await page.getByRole('button', { name: 'Вернуться в чат' }).click();
      const field = page.locator('.gpt-input-surface textarea');
      assert.equal(await field.inputValue(), QUESTION, 'the question came back with the page');
      const send = page.locator('.gpt-send-button');
      await until('the send button is live', async () => !(await send.isDisabled()) && (await send.getAttribute('data-state')) === 'ready', 15_000);
      await send.click();
      await page.getByText('Тестовый ответ.', { exact: true }).waitFor({ timeout: 20_000 });
      await until('the sent question leaves the field', async () => (await field.inputValue()) === '');
      assert.equal(await page.evaluate(() => localStorage.getItem('gptchat_draft')), null, 'and the draft with it');
      assert.equal(f.subscribes.length, 1, 'no second order');
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }

    // ---- 12. A limit that time lifts keeps its clock: the send button is off and opens nothing.
    {
      const { ctx, page, f } = await open(browser, origin);
      f.more = true;
      f.dayOver = true;
      await page.goto(`${origin}/ru/gpt-chat/`);
      const send = page.locator('.gpt-send-button');
      await until('the day limit stands', async () => (await send.getAttribute('data-state')) === 'limit', 20_000);
      await page.locator('.gpt-input-surface textarea').fill('Вопрос, который подождёт до завтра');
      assert.equal(await send.getAttribute('data-state'), 'limit', 'a clock');
      assert.equal(await send.isDisabled(), true);
      await sleep(400);
      assert.equal(await page.locator('[data-testid="ai-pay-packs"]').count(), 0);
      assert.ok(!f.events.some((event) => event.type === 'pack_viewed' && event.detail === 'wall'));
      assert.ok(!f.events.some((event) => event.type === 'trial_wall_seen'), 'not the trial’s wall');
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }

    // ---- 13. A pack that has ended (roadmap №2, 4.5): the card says the pack is over, not that a trial is spent,
    //          and the send button opens the window like at the trial's wall. The card goes by the server's word
    //          (hadPack), so a new invoice left unpaid does not turn it back into the trial's.
    {
      const { ctx, page, f } = await open(browser, origin);
      f.more = true;
      f.trialLeft = 0;
      f.ordered = true;
      f.paid = true;
      f.ended = true;
      await page.goto(`${origin}/uz/gpt-uzbek-tilida/`);
      await page.locator('[data-testid="limit-small-pack"]').waitFor({ timeout: 20_000 });
      const text = (await page.locator('[data-testid="ai-console"]').innerText()).replace(/\s+/g, ' ');
      assert.match(text, /AI paket tugadi\. Yangisi to‘lovdan so‘ng darhol ishga tushadi\./);
      assert.doesNotMatch(text, /3 ta sinov javobi tugadi/);
      await page.locator('.gpt-input-surface textarea').fill('Insho rejasini tuzib ber');
      const send = page.locator('.gpt-send-button');
      assert.equal(await send.getAttribute('data-state'), 'ready');
      await send.click();
      const quoted = page.locator('[data-testid="ai-pay-question"]');
      await quoted.waitFor({ timeout: 20_000 });
      assert.equal((await quoted.innerText()).replace(/\s+/g, ' ').trim(), 'Savolingiz bir soatga saqlandi: «Insho rejasini tuzib ber». To‘lovdan keyin chatga qaytib, uni yuboring.');
      assert.equal(f.subscribes.length, 0);
      // An ended pack is not the trial's wall: the return counter does not count it.
      await sleep(1_500);
      assert.ok(!f.events.some((event) => event.type === 'trial_wall_seen'));
      await shot(page, 'ended-pack-uz');
      // The ex-holder opened a new invoice and left it unpaid: the newest order is pending, not paid.
      f.paid = false;
      await page.reload();
      const ENDED = /AI paket tugadi\. Yangisi to‘lovdan so‘ng darhol ishga tushadi\./;
      await until('the ended pack’s card stands after an unpaid new invoice', async () => ENDED.test((await page.locator('[data-testid="ai-console"]').innerText()).replace(/\s+/g, ' ')), 20_000);
      assert.doesNotMatch((await page.locator('[data-testid="ai-console"]').innerText()).replace(/\s+/g, ' '), /3 ta sinov javobi tugadi/);
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }

    // ---- 14. The trial's wall met again: the first view is «first», a later one in the same browser «same_day».
    {
      const { ctx, page, f } = await open(browser, origin);
      f.more = true;
      f.trialLeft = 0;
      await page.goto(`${origin}/ru/gpt-chat/`);
      await until('the first meeting is counted', () => f.events.some((event) => event.type === 'trial_wall_seen' && event.detail === 'first'), 20_000);
      await page.reload();
      await until('the second view is a return', () => f.events.some((event) => event.type === 'trial_wall_seen' && event.detail === 'same_day'), 20_000);
      // Eight days on (the stored first meeting moved back): the oldest bucket.
      await page.evaluate(() => localStorage.setItem('gptchat_wall_first', String(Date.now() - 9 * 86_400_000)));
      await page.reload();
      await until('a visit nine days later', () => f.events.some((event) => event.type === 'trial_wall_seen' && event.detail === 'd8_plus'), 20_000);
      assert.equal(f.events.filter((event) => event.type === 'trial_wall_seen').length, 3, 'once per page view');
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }

    // ---- 15. The last trial answer (conversion audit 2026-11-22): the card sells the 3-day pack by name while the server
    //          offers it, and its tap orders that pack; without the offer it is the monthly card it always was.
    {
      const { ctx, page, f } = await open(browser, origin);
      f.more = true;
      f.trialLeft = 2;
      await page.goto(`${origin}/uz/gpt-uzbek-tilida/`);
      await ready(page);
      await ask(page);
      const card = page.locator('[data-testid="chat-pack-prompt"][data-surface="trial_last"]');
      await card.waitFor({ timeout: 20_000 });
      await card.scrollIntoViewIfNeeded();
      assert.match((await card.innerText()).replace(/\s/g, ''), /5000so‘m/);
      assert.doesNotMatch((await card.innerText()).replace(/\s/g, ''), /20000/);
      assert.deepEqual(await card.locator('[data-provider]').evaluateAll((all) => all.map((button) => `${button.getAttribute('data-provider')}:${button.getAttribute('data-sku')}`)), ['click:once', 'payme:once']);
      await shot(page, 'trial-last-uz');
      await card.locator('[data-provider="click"]').click();
      await until('the 3-day pack is ordered', () => f.subscribes.length === 1);
      assert.equal(f.subscribes[0].sku, 'once');
      assert.equal(f.subscribes[0].provider, 'click');
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }
    {
      const { ctx, page, f } = await open(browser, origin);
      f.trialLeft = 2;
      await page.goto(`${origin}/ru/gpt-chat/`);
      await ready(page);
      await ask(page);
      const card = page.locator('[data-testid="chat-pack-prompt"][data-surface="trial_last"]');
      await card.waitFor({ timeout: 20_000 });
      assert.match((await card.innerText()).replace(/\s/g, ''), /20000сум/);
      await card.locator('[data-provider="payme"]').click();
      await until('the monthly pack is ordered', () => f.subscribes.length === 1);
      assert.equal(f.subscribes[0].sku, undefined, 'the monthly pack is the request it always was');
      assert.deepEqual(f.errors, []);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
