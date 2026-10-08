// Actual built UI; all API/payment/AI responses below are OFFLINE fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..'), dist = path.join(root, 'dist');
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
test('trial UI: third answer finishes before paywall; close, reload, locale, draft and paid unlock', { skip: !executablePath || !fs.existsSync(path.join(dist, 'ru/gpt-chat/index.html')) }, async () => {
  const server = createServer((req, res) => {
    const file = path.join(dist, decodeURIComponent(new URL(req.url!, 'http://localhost').pathname));
    const target = fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file;
    if (!fs.existsSync(target)) { res.writeHead(404).end(); return; }
    res.setHeader('content-type', target.endsWith('.html') ? 'text/html' : target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    res.end(fs.readFileSync(target));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-gpu'] });
  const reports = path.join(root, 'reports/chat-lifetime-trial-20261008'); fs.mkdirSync(reports, { recursive: true });
  try {
    for (const [locale, width] of [['ru', 1366], ['uz', 390], ['ru', 320]] as const) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      let used = 0, paid = false, chatCalls = 0, releaseThird: (() => void) | undefined;
      const events: Array<{ type: string; detail: string }> = [], subscribes: unknown[] = [];
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (url.pathname === '/api/auth/config') return json({ turnstileRequired: false });
        if (url.pathname === '/api/gpt/account') return json({ ok: true, mode: 'live', loginAvailable: false, guestCheckout: true, providers: ['click', 'payme'], user: paid ? { signedIn: true, guest: true, storageKey: 'a'.repeat(64) } : null,
          freeLimits: { daily: 15, hourly: 5, lifetime: 3 }, trial: { limit: 3, used, remaining: 3 - used, available: 3 - used, resets: 'never' }, remaining: paid ? 300 : 3 - used,
          pack: { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1 }, terms: { ru: '/ru/oferta/', uz: '/uz/oferta/' }, termsVersion: 'fixture-trial',
          access: paid ? { order_id: 'pay-fixture', ends_at: Date.now() + 86400000, remaining: 300 } : null });
        if (url.pathname === '/api/gpt/session') return json({ ok: true, sessionId: 'fixture-trial' });
        if (url.pathname === '/api/gpt/event') { events.push(route.request().postDataJSON()); return json({ ok: true }); }
        if (url.pathname === '/api/gpt/subscribe') { subscribes.push(route.request().postDataJSON()); return json({ ok: false, code: 'unavailable' }, 503); }
        if (url.pathname === '/api/gpt/chat') {
          chatCalls++;
          if (!paid && used === 2) await new Promise<void>(resolve => { releaseThird = resolve; });
          if (!paid) used++;
          return json({ ok: true, answer: `Fixture answer ${chatCalls}`, charged: true, remaining: paid ? 300 : 3 - used, hourRemaining: null, sessionId: 'fixture-trial' });
        }
        return json({ ok: false }, 404);
      });
      await page.goto(origin + (locale === 'ru' ? '/ru/gpt-chat/' : '/uz/gpt-uzbek-tilida/'));
      const send = page.locator('.gpt-send-button'), input = page.locator('.gpt-input-surface textarea');
      for (let n = 1; n <= 3; n++) {
        await input.fill(`Question ${n}`); await send.click();
        if (n === 3) {
          for (let i = 0; !releaseThird && i < 100; i++) await page.waitForTimeout(20);
          assert.ok(releaseThird); assert.equal(await page.locator('.gpt-trial-dialog').count(), 0, 'no popup while last reply is in flight'); releaseThird();
        }
        await page.getByText(`Fixture answer ${n}`, { exact: true }).waitFor();
        if (n < 3) assert.equal(await page.locator('.gpt-trial-dialog').count(), 0);
      }
      const dialog = page.locator('.gpt-trial-dialog'); await dialog.waitFor();
      assert.equal(chatCalls, 3); assert.equal(await dialog.locator('[data-provider]').count(), 2);
      assert.match((await dialog.innerText()).replace(/\s/g, ''), /20000/);
      assert.equal(await dialog.locator('input[type="checkbox"]').count(), 0);
      await page.keyboard.press('Tab'); assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)));
      const box = await dialog.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0, 'dialog fits viewport');
      await page.screenshot({ path: path.join(reports, `trial-${locale}-${width}.png`) });
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      assert.equal(await page.getByText('Fixture answer 3', { exact: true }).count(), 1);
      assert.equal(await send.isDisabled(), true);
      await input.fill('Keep my fourth question'); await page.waitForTimeout(550); await page.reload();
      await page.locator('[data-testid="ai-limit-card"]').waitFor();
      assert.equal(await page.locator('.gpt-trial-dialog').count(), 0, 'no repeated fullscreen offer');
      assert.equal(await send.isDisabled(), true);
      assert.equal(await input.inputValue(), 'Keep my fourth question');
      await page.locator(locale === 'ru' ? '[data-testid="lang-uz"]' : '[data-testid="lang-ru"]').click();
      await page.locator('[data-testid="ai-limit-card"]').waitFor();
      assert.equal(await send.isDisabled(), true); assert.equal(chatCalls, 3);
      assert.equal(await page.locator('[data-chat-presentation-panel]').count(), 0, 'locale stays in chat');
      // Pay intent uses the real existing account window, no invoice or charge.
      await page.locator('[data-testid="limit-pay"][data-provider="click"]').click();
      for (let i = 0; !subscribes.length && i < 100; i++) await page.waitForTimeout(30);
      assert.equal(subscribes.length, 1, 'one-tap uses existing checkout');
      // Server rights, never client success, unlock the composer.
      await page.keyboard.press('Escape'); paid = true;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      for (let i = 0; i < 100 && await send.isDisabled(); i++) await page.waitForTimeout(30);
      assert.equal(await send.isDisabled(), false);
      assert.equal(await page.locator('.gpt-trial-dialog').count(), 0);
      assert.equal(errors.length, 0, errors.join('\n'));
      assert.equal(events.filter(e => e.type === 'pack_prompt_viewed' && e.detail === 'trial_exhausted').length, 1);
      await context.close();
    }
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
