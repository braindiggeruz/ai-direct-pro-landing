// Проверка собранного one-tap в браузере. Все API и внешняя сеть изолированы.
// После build:production: node --import tsx scripts/one-tap-check.ts [report-dir]
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { chromium, type Page } from 'playwright-core';
import { previewViews, serve } from './pack-window-preview';

const output = path.resolve(process.argv[2] || 'reports/one-tap');
mkdirSync(output, { recursive: true });
const server = serve(0, 'guest').listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const results: Array<{ name: string; posts: number; result: string }> = [];
const until = async (read: () => boolean, message: string) => {
  const end = Date.now() + 10_000;
  while (!read() && Date.now() < end) await new Promise((done) => setTimeout(done, 25));
  assert.ok(read(), message);
};

async function scenario(name: string, options: {
  locale?: 'ru' | 'uz'; member?: boolean; cookies?: boolean; hold?: boolean;
  holdResponse?: boolean; checkout?: boolean;
  action: (s: {
    page: Page; posts: Array<Record<string, unknown>>; view: Record<string, unknown>;
    release: () => void; refresh: () => Promise<void>; failNext: () => void;
    respond: () => void; redirects: string[];
    blockAccount: () => () => void;
  }) => Promise<void>;
}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (options.cookies === false)
    await context.addInitScript('Object.defineProperty(navigator, "cookieEnabled", { value: false });');
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const view = structuredClone(previewViews()[options.member ? 'member' : 'onetap']);
  view.providers = ['click', 'payme'];
  const posts: Array<Record<string, unknown>> = [];
  const redirects: string[] = [];
  let reads = 0;
  let accountHeld = Promise.resolve();
  let releaseAccount = () => {};
  const blockAccount = () => {
    accountHeld = new Promise<void>((done) => { releaseAccount = done; });
    return () => releaseAccount();
  };
  let failed = false;
  let release = () => {};
  const held = new Promise<void>((done) => { release = done; });
  if (!options.hold) release();
  let respond = () => {};
  const responseHeld = new Promise<void>((done) => { respond = done; });
  if (!options.holdResponse) respond();
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      if (route.request().isNavigationRequest()) redirects.push(url.href);
      return route.abort();
    }
    if (/\/chat-account-[^/]+\.js$/.test(url.pathname)) await held;
    if (url.pathname === '/api/gpt/event') return route.fulfill({ json: { ok: true } });
    if (url.pathname === '/api/gpt/account') {
      if (route.request().method() === 'POST') {
        view.payment = null;
        return route.fulfill({ json: { ok: true } });
      }
      reads++;
      await accountHeld;
      return route.fulfill({ json: view });
    }
    if (url.pathname === '/api/gpt/subscribe') {
      posts.push(route.request().postDataJSON());
      await responseHeld;
      if (failed) {
        failed = false;
        return route.fulfill({ status: 503, json: { ok: false, code: 'request_failed' } });
      }
      return route.fulfill({ json: { ok: true, mode: options.checkout ? 'checkout' : 'test',
        attemptId: `pay_${'0'.repeat(31)}1`, checkoutUrl: 'https://my.click.uz/services/pay?fixture=1' } });
    }
    return route.continue();
  });
  try {
    await page.goto(`${origin}/${options.locale === 'uz' ? 'uz/gpt-uzbek-tilida' : 'ru/gpt-chat'}/`);
    await page.getByTestId('ai-account-trigger').waitFor();
    if (options.cookies === false) assert.equal(await page.evaluate(() => navigator.cookieEnabled), false);
    const input = page.locator('textarea').first();
    await input.fill('Сколько будет два плюс два?');
    await input.press('Enter');
    await page.getByTestId('limit-pay').first().waitFor();
    assert.equal(posts.length, 0, 'загрузка account и достижение лимита сами не начинают checkout');
    const refresh = async () => {
      const before = reads;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await until(() => reads > before, 'обновление account выполнено');
      // Дать React применить ответ account до освобождения lazy chunk.
      await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    };
    await options.action({ page, posts, view, release, refresh, respond, redirects, blockAccount, failNext: () => { failed = true; } });
    assert.deepEqual(errors, [], 'ошибки JavaScript');
    await page.screenshot({ path: path.join(output, `${name}.png`) });
    results.push({ name, posts: posts.length, result: 'PASS' });
    console.log(`PASS ${name}: ${posts.length} checkout POST`);
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${name}-FAIL.png`) }).catch(() => {});
    writeFileSync(path.join(output, `${name}-FAIL.txt`), await page.locator('body').innerText());
    throw error;
  } finally {
    release();
    respond();
    releaseAccount();
    await context.close();
  }
}

const tap = (page: Page) => page.getByTestId('limit-pay').filter({ hasText: 'Click' }).click();
const noPayment = async (page: Page, posts: unknown[]) => {
  await page.locator('.gpt-pay-accept').waitFor();
  await page.waitForTimeout(150);
  assert.equal(posts.length, 0, 'заблокированное намерение не создаёт заказ');
};
try {
  for (const locale of ['ru', 'uz'] as const) for (const member of [false, true]) {
    await scenario(`${locale}-${member ? 'member' : 'guest'}-double-tap`, { locale, member,
      action: async ({ page, posts, refresh }) => {
        await page.getByTestId('limit-pay').first().evaluate((button) => { button.click(); button.click(); });
        await until(() => posts.length > 0, 'checkout начался');
        await refresh();
        assert.equal(posts.length, 1);
        assert.equal(posts[0].acceptTerms, true);
        assert.equal(posts[0].termsVersion, 'ai-paket-2026-10-v4');
        assert.equal(posts[0].locale, locale);
        assert.match(String(posts[0].requestId), /^[0-9a-f-]{36}$/);
      },
    });
  }
  for (const changed of ['price', 'identity', 'terms', 'provider', 'pending']) {
    await scenario(`lazy-${changed}`, { hold: true,
      action: async ({ page, posts, view, release, refresh }) => {
        await tap(page);
        if (changed === 'price') view.pack = { ...(view.pack as object), priceUzs: 30000 };
        if (changed === 'identity') view.user = { signedIn: true, storageKey: 'a'.repeat(64) };
        if (changed === 'terms') view.termsVersion = 'ai-paket-2026-10-v5';
        if (changed === 'provider') view.providers = ['payme'];
        if (changed === 'pending') view.payment = { id: `pay_${'1'.repeat(32)}`, state: 'pending', provider: 'click', cancellable: true };
        await refresh();
        release();
        await noPayment(page, posts);
        if (changed === 'pending') {
          await page.locator('[data-testid="ai-pay-open"] .gpt-text-button').click();
          await page.locator('[data-testid="ai-pay-open"]').waitFor({ state: 'detached' });
          await refresh();
          assert.equal(posts.length, 0, 'отмена старого счёта не оживляет нажатие');
        }
      },
    });
  }
  await scenario('close-before-lazy', { hold: true,
    action: async ({ page, posts, release }) => {
      await tap(page);
      await page.locator('[role="dialog"] .gpt-panel-top button').click();
      release();
      await page.getByTestId('ai-account-trigger').click();
      await noPayment(page, posts);
    },
  });
  await scenario('cookies-disabled', { cookies: false,
    action: async ({ page, posts }) => {
      await tap(page);
      await page.locator('[role="dialog"] .gpt-plan-card').waitFor();
      await page.waitForTimeout(150);
      assert.equal(posts.length, 0);
      assert.equal(await page.locator('.gpt-pay-accept').count(), 0);
    },
  });
  await scenario('failed-checkout-reopen-and-manual-retry', {
    action: async ({ page, posts, refresh, failNext }) => {
      failNext();
      await tap(page);
      await page.locator('[role="dialog"] .gpt-error').waitFor();
      assert.equal(posts.length, 1);
      await page.locator('[role="dialog"] .gpt-panel-top button').click();
      await refresh();
      await page.getByTestId('ai-account-trigger').click();
      await page.locator('.gpt-pay-accept').waitFor();
      assert.equal(posts.length, 1, 'повторное открытие не повторяет запрос');
      await page.locator('[role="dialog"] button').filter({ hasText: /Click/ }).click();
      await until(() => posts.length === 2, 'явный повтор запускает запрос');
      assert.equal(posts[0].requestId, posts[1].requestId, 'повтор использует ключ идемпотентности');
    },
  });
  for (const invalidate of ['close', 'identity']) {
    await scenario(`delayed-response-${invalidate}`, { member: true, holdResponse: true, checkout: true,
      action: async ({ page, posts, view, refresh, respond, redirects }) => {
        await tap(page);
        await until(() => posts.length === 1, 'запрос отправлен и ожидает ответа');
        if (invalidate === 'close') await page.locator('[role="dialog"] .gpt-panel-top button').click();
        else { view.user = { signedIn: true, storageKey: 'b'.repeat(64) }; await refresh(); }
        const answered = page.waitForResponse((response) => response.url().endsWith('/api/gpt/subscribe'));
        respond();
        await answered;
        await page.waitForTimeout(250);
        assert.equal(redirects.length, 0, 'устаревший ответ не перенаправляет на оплату');
        assert.equal(posts.length, 1);
      },
    });
  }
  await scenario('checkout-during-account-refresh', {
    action: async ({ page, posts, view, blockAccount }) => {
      const resume = blockAccount();
      const requested = page.waitForRequest((request) => request.url().endsWith('/api/gpt/account'));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await requested;
      await tap(page);
      await page.locator('[role="dialog"] .gpt-plan-card').waitFor();
      view.user = { signedIn: true, storageKey: 'c'.repeat(64) };
      resume();
      await noPayment(page, posts);
    },
  });
  for (const probe of ['saved', 'missing', 'other-order']) {
    await scenario(`guest-cookie-${probe}`, { checkout: true, holdResponse: true,
      action: async ({ page, posts, view, respond, redirects }) => {
        await tap(page);
        await until(() => posts.length === 1, 'гостевой checkout начат');
        if (probe !== 'missing') {
          view.user = { signedIn: true, guest: true, storageKey: 'd'.repeat(64) };
          view.payment = { id: `pay_${probe === 'saved' ? '0'.repeat(31) + '1' : '2'.repeat(32)}`, provider: 'click', state: 'pending' };
        }
        respond();
        if (probe === 'saved') await until(() => redirects.length === 1, 'переход после проверки cookie и заказа');
        else {
          await page.locator('[role="dialog"]').waitFor();
          await page.waitForTimeout(250);
          assert.equal(redirects.length, 0, 'без своего заказа переход запрещён');
        }
        assert.equal(posts.length, 1);
      },
    });
  }
  writeFileSync(path.join(output, 'report.json'), JSON.stringify({ result: 'PASS', scenarios: results }, null, 2));
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
}
