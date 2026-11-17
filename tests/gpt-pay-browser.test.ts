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
  /** subscribe answers 503 this many times first. */
  refuse: number;
  subscribes: Array<Record<string, unknown>>;
  events: Array<{ type: string; detail: string }>;
  /** Main-frame navigations to another origin, each cancelled as if the browser never left. */
  left: string[];
  errors: string[];
}

async function open(browser: Awaited<ReturnType<typeof chromium.launch>>, origin: string): Promise<{ ctx: BrowserContext; page: Page; f: Fixture }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  const f: Fixture = { ordered: false, paid: false, accountDelay: 0, reading: 0, refuse: 0, subscribes: [], events: [], left: [], errors: [] };
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
      if (f.accountDelay) await sleep(f.accountDelay);
      f.reading--;
      return json({
        ok: true, mode: 'live', loginAvailable: false, guestCheckout: true, providers: ['click', 'payme'],
        user: f.ordered ? { signedIn: true, storageKey: 'c'.repeat(64), guest: true } : null,
        freeLimits: { daily: 15, hourly: 5 }, terms: { ru: '/ru/oferta/', uz: '/uz/oferta/' }, termsVersion: 'fixture-current',
        pack: { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: null },
        access: f.paid ? { order_id: ORDER, ends_at: Date.now() + 86_400_000, remaining: 300, message_limit: 300, dayRemaining: 50 } : null,
        payment: f.ordered ? { id: ORDER, state: f.paid ? 'paid' : 'pending', provider: 'click', cancellable: !f.paid } : null,
      });
    }
    if (url.pathname === '/api/gpt/subscribe') {
      const body = request.postDataJSON() as Record<string, unknown>;
      f.subscribes.push(body);
      if (f.refuse > 0) { f.refuse--; return json({ ok: false, code: 'unavailable' }, 503); }
      f.ordered = true;
      return json({ ok: true, mode: 'checkout', checkoutUrl: LINKS[body.provider === 'payme' ? 'payme' : 'click'], attemptId: ORDER });
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
const narrow = async (page: Page, what: string) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${what}: no sideways scroll`);

test('checkout in a browser: the tap, a browser that never leaves, a tap during a read, the link for someone else, a return that does not blink', { skip: !executablePath || !fs.existsSync(path.join(dist, 'ru/gpt-chat/index.html')), timeout: 240_000 }, async () => {
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
      f.accountDelay = 1_500;
      await until('a read is in flight', () => f.reading > 0, 6_000);
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
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
