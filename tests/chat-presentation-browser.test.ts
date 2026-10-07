// The real built chat in Chromium; all APIs/payments/AI are offline fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { publicPlans } from '../functions/lib/studio/checkout';
import { TERMS_PLAN } from '../functions/lib/studio/plans';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const paths = { ru: '/ru/gpt-chat/', uz: '/uz/gpt-uzbek-tilida/' };
const orderId = 'stu_' + 'a'.repeat(32);
const jobId = 'sj_' + 'b'.repeat(32);

test('built RU/UZ chat: lazy tool, free flow, valid download, reload, inline checkout and exact payment return', { skip: !browserPath || !fs.existsSync(path.join(DIST, 'ru/gpt-chat/index.html')) }, async () => {
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://local').pathname;
    const file = path.resolve(DIST, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const evidence: unknown[] = [];
  const edition = Object.keys(TERMS_PLAN)[0];
  try {
    for (const locale of ['ru', 'uz'] as const) for (const width of [320, 360, 390, 1366]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 640 ? 740 : 900 }, acceptDownloads: true });
      const page = await ctx.newPage();
      const errors: string[] = [], requests: string[] = [], unexpected: string[] = [];
      let created = 0, checkouts = 0, paid = false, returnPath = '';
      page.on('pageerror', error => errors.push(error.message));
      await ctx.addInitScript({ content: "window.turnstile = { render: function(el, options) { setTimeout(function() { options.callback('offline-fixture'); }, 0); return 'test-widget'; }, remove: function() {}, reset: function() {} };" });
      const me = () => ({ ok: true, identity: true, free: { presentation: { left: 1 - created, limit: 1 }, photo: { left: 0, limit: 0 }, resetsAt: '2026-10-08T00:00:00Z' }, account: { signedIn: paid },
        entitlements: paid ? [{ id: 'fixture', orderId, plan: 'kunlik', startsAt: '2026-10-07T00:00:00Z', endsAt: '2026-10-08T00:00:00Z', presentationsLeft: 1, presentationsLimit: 1, photosLeft: 0, photosLimit: 0, regenAvailable: [] }] : [],
        latestOrder: checkouts ? { id: orderId, state: paid ? 'paid' : 'pending', plan: 'kunlik', provider: locale === 'ru' ? 'click' : 'payme', amountUzs: 5900, createdAt: '2026-10-07T00:00:00Z', paidAt: paid ? '2026-10-07T01:00:00Z' : null, paymentNumber: null, cancellable: !paid } : null, receipts: [] });
      await ctx.route('**/*', async route => {
        const url = new URL(route.request().url());
        requests.push(url.pathname);
        const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        if (url.hostname === 'my.click.uz' || url.hostname === 'checkout.paycom.uz') {
          paid = true;
          return route.fulfill({ status: 302, headers: { Location: origin + returnPath + '?pay=return&product=studio' }, body: '' });
        }
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (url.pathname === '/api/gpt/account') return json({ ok: true, loginAvailable: false, mode: null, providers: [], user: null, terms: { ru: null, uz: null }, termsVersion: null, freeLimits: { daily: 15, hourly: 5 }, botHandoff: false });
        if (url.pathname === '/api/auth/config') return json({ turnstileRequired: false });
        if (url.pathname.endsWith('/event')) return json({ ok: true });
        if (url.pathname === '/api/studio/config') return json({ ok: true, tools: { freeDeck: true, fullDeck: true, photo: false }, free: { presentation: 1, photo: 0, resetsAt: '2026-10-08T00:00:00Z' }, shapes: { free: { minSlides: 4, maxSlides: 6, images: 2, notes: false, palettes: 1 }, full: { minSlides: 6, maxSlides: 12, images: 8, notes: true, palettes: 3 } }, payments: { mode: 'live', providers: ['click', 'payme'] }, plans: publicPlans(edition), termsVersion: edition, terms: { ru: '/ru/oferta/', uz: '/uz/oferta/' }, aiLabel: true, turnstileSiteKey: 'fixture' });
        if (url.pathname === '/api/studio/me') return json(me());
        if (url.pathname === '/api/studio/presentations') {
          created++;
          return json({ ok: true, jobId, source: 'free', shape: { slides: 6, images: 0, notes: false, palette: 1, parts: 1 }, next: 'slides', expiresAt: '2026-10-08T00:00:00Z' });
        }
        if (url.pathname.endsWith('/slides')) return json({ ok: true, deck: { title: 'Offline Space', subtitle: 'Fixture', slides: Array.from({ length: 6 }, (_, i) => ({ index: i + 1, title: `Slide ${i + 1}`, bullets: ['One test fact', 'Another fact'], layout: 'title-bullets' })) }, images: [] });
        if (url.pathname === '/api/studio/checkout') {
          checkouts++;
          const body = route.request().postDataJSON();
          returnPath = body.returnPath;
          assert.equal(body.provider, locale === 'ru' ? 'click' : 'payme');
          return json({ ok: true, mode: 'checkout', orderId, provider: body.provider, checkoutUrl: body.provider === 'click' ? 'https://my.click.uz/services/pay/?fixture=1' : 'https://checkout.paycom.uz/fixture' });
        }
        unexpected.push(url.pathname);
        return route.fulfill({ status: 500, body: '{}' });
      });
      await page.goto(origin + paths[locale]);
      await page.locator('[data-chat-presentation-open]:not(:disabled)').waitFor();
      assert.equal(requests.some(url => /chat-presentation|pptxgen|\/api\/studio/.test(url)), false, 'ordinary chat downloads no tool, export or Studio data');
      await page.locator('[data-chat-presentation-open]').first().click();
      const card = page.locator('[data-chat-presentation]');
      await card.locator('input[name="topic"]').fill('Space and planets');
      await card.locator('form button[type="submit"]').click();
      try { await card.locator('[data-studio-preview]').waitFor({ timeout: 10000 }); }
      catch { assert.fail(JSON.stringify({ step: 'free-result', locale, width, created, errors, unexpected, requests, text: await card.innerText() })); }
      assert.equal(created, 1);
      assert.equal(await card.locator('[data-slide]').count(), 6);
      const download = page.waitForEvent('download');
      await card.locator('[data-studio-download] button').click();
      const downloaded = await download;
      const file = await downloaded.path();
      assert.ok(file);
      const bytes = fs.readFileSync(file);
      assert.equal(bytes.subarray(0, 2).toString(), 'PK', 'real PPTX ZIP from the browser');
      assert.ok(bytes.length > 10000);
      await page.reload();
      await page.locator('[data-studio-preview]').waitFor();
      assert.equal(await card.locator('input[name="topic"]').inputValue(), 'Space and planets');
      assert.equal(created, 1, 'reload never regenerates/spends another unit');
      const geometry = await card.evaluate(el => {
        const r = el.getBoundingClientRect();
        const form = el.querySelector('[data-studio-tool]')!;
        const style = getComputedStyle(form);
        return { width: r.width, overflow: document.documentElement.scrollWidth > innerWidth, padding: style.padding, color: style.color };
      });
      assert.equal(geometry.overflow, false, `${locale}/${width}: no horizontal overflow`);
      assert.notEqual(geometry.padding, '0px', 'prefixed Studio CSS was compiled');
      if (width === 360) {
        const shots = 'F:/Claude/gptbot-tools/chat-embedded-shots';
        fs.mkdirSync(shots, { recursive: true });
        await page.locator('.gpt-thread-scroll').evaluate(el => { el.scrollTop = 0; });
        await page.screenshot({ path: `${shots}/${locale}-360.png` });
      }
      if (width === 360) {
        await card.locator('input[value="full"]').evaluate(el => (el as HTMLInputElement).click());
        await card.locator('[data-studio-slot="limit"] [data-studio-plan="kunlik"] button').click();
        if (locale === 'uz') await card.locator('[data-studio-checkout] input[value="payme"]').check();
        const navigation = page.waitForURL('**/*pay=return*');
        await card.locator('[data-studio-checkout] button[type="submit"]').click();
        await navigation;
        await page.locator('[data-studio-pay-return="paid"]').waitFor();
        assert.equal(returnPath, paths[locale]);
        assert.equal(await page.locator('[data-studio-preview]').count(), 1, 'same local result survived payment navigation');
        await page.locator('[data-studio-units="1"]').waitFor();
        assert.equal(await page.locator('input[name="topic"]').inputValue(), 'Space and planets');
        assert.equal(checkouts, 1);
      }
      assert.deepEqual(unexpected, []);
      assert.deepEqual(errors, []);
      assert.equal(requests.some(url => url === '/api/gpt/chat'), false, 'presentation action spends no text-chat response');
      if (width === 390) {
        await page.goto(origin + paths[locale] + '?tool=presentation');
        await page.waitForFunction(() => document.querySelectorAll('[data-chat-presentation]').length === 2);
        assert.equal(created, 1, 'advertising entry opens a draft and never auto-generates');
      }
      evidence.push({ locale, width, geometry, created, checkouts, bytes: bytes.length });
      await ctx.close();
    }
  } finally {
    fs.mkdirSync(path.join(ROOT, 'reports/chat-studio-local'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'reports/chat-studio-local/browser.json'), JSON.stringify({ scenarios: evidence }, null, 2));
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
