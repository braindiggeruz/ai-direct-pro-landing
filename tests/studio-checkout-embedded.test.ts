// Offline browser regressions for the chat's checkout handoff. No provider or AI calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { publicPlans } from '../functions/lib/studio/checkout';
import { TERMS_PLAN } from '../functions/lib/studio/plans';

const ROOT = path.resolve(import.meta.dirname, '..');
const studioRequire = createRequire(path.join(ROOT, 'apps/studio/package.json'));
const browserPath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .find(file => file && fs.existsSync(file));

test('embedded checkout waits for durable draft, retains one order on retry, and cannot leave after close', { skip: !browserPath }, async () => {
  const edition = Object.keys(TERMS_PLAN)[0];
  const fixture = await build({
    stdin: { resolveDir: ROOT, loader: 'tsx', contents: `
      import { createElement } from ${JSON.stringify(studioRequire.resolve('react'))};
      import { createRoot } from ${JSON.stringify(studioRequire.resolve('react-dom/client'))};
      import { Checkout } from './apps/studio/src/billing/Checkout';
      import { Tariffs } from './apps/studio/src/billing/Tariffs';
      import { createStudioApi } from './apps/studio/src/api';
      const plans = ${JSON.stringify(publicPlans(edition))};
      const config = { plans, payments: { mode: 'live', providers: ['click', 'payme'] },
        termsVersion: ${JSON.stringify(edition)}, terms: { ru: 'https://gptbot.uz/ru/oferta/', uz: 'https://gptbot.uz/uz/oferta/' },
        shapes: { full: { maxSlides: 12 } } };
      let root, resolveFlush, rejectFlush, orders, flushes, navigations, events, bodies, errors;
      window.fixture = {
        mount({ locale = 'ru', tariff = false, hook = true, badUrl = false } = {}) {
          root?.unmount(); orders = 0; flushes = 0; navigations = []; events = []; bodies = []; errors = [];
          sessionStorage.clear(); localStorage.clear();
          const api = createStudioApi(async (url, options) => {
            if (!url.endsWith('/checkout')) throw Error('Unexpected API: ' + url);
            orders++; bodies.push(JSON.parse(options.body)); events.push('checkout');
            return new Response(JSON.stringify({ ok: true, mode: 'checkout', provider: 'click',
              orderId: 'stu_0123456789abcdef0123456789abcdef',
              checkoutUrl: badUrl ? 'https://my.click.uz.evil.example/pay' : 'https://my.click.uz/services/pay/?transaction_param=stu_same'
            }), { headers: { 'Content-Type': 'application/json' } });
          });
          const runtime = { api,
            session: { config: async () => ({ ok: true, data: config }), me: async () => ({ ok: true, data: { account: { signedIn: true } } }), refreshMe() {} },
            funnel: { checkoutStarted: () => events.push('started'), tariffsViewed: () => events.push('view') }
          };
          const props = { locale, runtime, returnPath: locale === 'uz' ? '/uz/gpt-uzbek-tilida/' : '/ru/gpt-chat/',
            beforeNavigate: hook ? () => { flushes++; events.push('flush'); return new Promise((resolve,reject) => { resolveFlush = resolve; rejectFlush = reject; }); } : undefined
          };
          root = createRoot(document.getElementById('root'));
          root.render(tariff ? createElement(Tariffs, { ...props, context: 'after_result' }) : createElement(Checkout, {
            ...props, plan: plans[0], config, onClose: () => root.unmount(), navigate: url => { events.push('navigate'); navigations.push(url); }
          }));
        },
        settle(ok) { events.push(ok ? 'saved' : 'failed'); ok ? resolveFlush() : rejectFlush(Error('Storage quota exceeded')); },
        state: () => ({ orders, flushes, navigations, events, bodies, hint: localStorage.getItem('gptbot_studio_pack_v1') })
      };
    ` },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' }));
    await page.goto('https://gptbot.uz/ru/gpt-chat/');
    await page.addScriptTag({ content: fixture.outputFiles[0].text });
    const mount = async (options: Record<string, unknown> = {}) => {
      await page.evaluate(options => (window as unknown as { fixture: { mount(o: unknown): void } }).fixture.mount(options), options);
      if (!options.tariff) await page.locator('[data-studio-checkout]').waitFor();
    };
    const state = () => page.evaluate(() => (window as unknown as { fixture: { state(): { orders: number; flushes: number; navigations: string[]; events: string[]; bodies: { returnPath: string; requestId: string }[]; hint: string | null } } }).fixture.state());
    const settle = (ok: boolean) => page.evaluate(ok => (window as unknown as { fixture: { settle(ok: boolean): void } }).fixture.settle(ok), ok);
    const waitFlush = (count: number) => page.waitForFunction(count => (window as unknown as { fixture: { state(): { flushes: number } } }).fixture.state().flushes === count, count);
    const submit = () => page.locator('[data-studio-checkout] button[type="submit"]').click();

    await mount();
    await submit();
    await waitFlush(1);
    assert.equal((await state()).orders, 1);
    assert.equal((await state()).bodies[0].returnPath, '/ru/gpt-chat/');
    assert.deepEqual((await state()).navigations, []);
    assert.equal((await state()).hint, null, 'a failed/unsettled flush never marks the payment handoff');
    assert.equal(await page.locator('button[type="submit"]').isDisabled(), true);
    await settle(false);
    await page.locator('[data-studio-checkout-message="draft_failed"]').waitFor();
    assert.match(await page.locator('[role="status"]').innerText(), /Не удалось сохранить диалог/);
    assert.equal(await page.locator('input[type="radio"]:disabled').count(), 2, 'cannot silently change the provider of the pending order');
    await submit();
    await waitFlush(2);
    assert.equal((await state()).orders, 1, 'retrying storage must not create another checkout');
    await settle(true);
    await page.waitForFunction(() => (window as unknown as { fixture: { state(): { navigations: string[] } } }).fixture.state().navigations.length === 1);
    assert.deepEqual((await state()).events, ['started', 'checkout', 'flush', 'failed', 'flush', 'saved', 'navigate']);

    await mount();
    await submit();
    await waitFlush(1);
    await page.locator('[data-studio-checkout] button[type="button"]').last().click();
    await settle(true);
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    assert.deepEqual((await state()).navigations, [], 'late storage completion after closing cannot navigate');
    assert.equal((await state()).hint, null);

    await mount({ hook: false });
    await submit();
    await page.waitForFunction(() => (window as unknown as { fixture: { state(): { navigations: string[] } } }).fixture.state().navigations.length === 1);
    assert.equal((await state()).flushes, 0, 'standalone use needs no hook');

    await mount({ badUrl: true });
    await submit();
    await page.waitForFunction(() => !!document.querySelector('[data-studio-checkout-message]')?.textContent);
    assert.equal((await state()).flushes, 0);
    assert.deepEqual((await state()).navigations, [], 'the API still rejects a malicious provider URL');

    await mount({ tariff: true, locale: 'uz' });
    await page.locator('[data-studio-upgrade] button').first().click();
    await page.locator('[data-studio-plan="kunlik"] button').click();
    await submit();
    await waitFlush(1);
    await settle(false);
    await page.locator('[data-studio-checkout-message="draft_failed"]').waitFor();
    assert.equal((await state()).bodies[0].returnPath, '/uz/gpt-uzbek-tilida/', 'Tariffs forwards the chat return path');
    assert.match(await page.locator('[role="status"]').innerText(), /Suhbatni saqlab bo‘lmadi/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
