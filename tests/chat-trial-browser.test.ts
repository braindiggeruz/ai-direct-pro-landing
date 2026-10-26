// Actual built UI; all API/payment/AI responses below are OFFLINE fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
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
  // Screenshots land outside the repository unless GPTBOT_BROWSER_REPORT_DIR names a folder.
  const reports = process.env.GPTBOT_BROWSER_REPORT_DIR || path.join(os.tmpdir(), 'gptbot-chat-trial'); fs.mkdirSync(reports, { recursive: true });
  try {
    // The two main chats, and an AI tool page whose paywall speaks to its task (Ш1).
    for (const [locale, width, start, role, title] of [
      ['ru', 1366, '/ru/gpt-chat/', 'general', 'Продолжим вашу задачу?'],
      ['uz', 390, '/uz/gpt-uzbek-tilida/', 'general', 'Vazifangizni davom ettiramizmi?'],
      ['ru', 320, '/ru/gpt-chat/', 'general', 'Продолжим вашу задачу?'],
      ['uz', 390, '/uz/rus-ozbek-tarjimon/', 'translator', 'Tarjimani davom ettiramizmi?'],
    ] as const) {
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
      const legacyReason = width >= 390 ? 'hourly' : 'daily';
      await context.addInitScript(reason => {
        if (sessionStorage.getItem('trial_legacy_seeded')) return;
        sessionStorage.setItem('trial_legacy_seeded', '1');
        sessionStorage.setItem('gptchat_limit', JSON.stringify({ reason, retryAt: Date.now() + 3600_000,
          since: Date.now(), limits: { daily: 15, hourly: 5 } }));
      }, legacyReason);
      await page.goto(origin + start);
      const send = page.locator('.gpt-send-button'), input = page.locator('.gpt-input-surface textarea');
      await page.waitForFunction(() => {
        const button = document.querySelector<HTMLButtonElement>('.gpt-send-button');
        return button && !button.disabled && !sessionStorage.getItem('gptchat_limit');
      });
      assert.equal(await page.locator('[data-testid="ai-limit-card"]').count(), 0, 'confirmed trial replaces a legacy cached free limit');
      for (let n = 1; n <= 3; n++) {
        await input.fill(`Question ${n}`); await send.click();
        if (n === 3) {
          for (let i = 0; !releaseThird && i < 100; i++) await page.waitForTimeout(20);
          assert.ok(releaseThird); assert.equal(await page.locator('.gpt-trial-dialog').count(), 0, 'no popup while last reply is in flight'); releaseThird();
        }
        await page.getByText(`Fixture answer ${n}`, { exact: true }).waitFor();
        if (n < 3) assert.equal(await page.locator('.gpt-trial-dialog').count(), 0);
        if (n === 1) assert.equal(await page.locator('[data-testid="chat-pack-prompt"]').count(), 0, 'no card while two trial answers are left');
        if (n === 2) {
          // Ш7: one trial answer left — the pack's card with its price, counted as trial_last.
          const last = page.locator('[data-testid="chat-pack-prompt"][data-surface="trial_last"]'); await last.waitFor();
          assert.match(await last.innerText(), locale === 'ru' ? /Остался 1 пробный ответ/ : /1 ta sinov javobi qoldi/);
          assert.match((await last.innerText()).replace(/\s/g, ''), /20000/);
          assert.equal(await last.locator('[data-provider]').count(), 2);
          await last.scrollIntoViewIfNeeded();
          for (let i = 0; i < 40 && !events.some(e => e.type === 'pack_prompt_viewed' && e.detail === 'trial_last'); i++) await page.waitForTimeout(50);
          assert.ok(events.some(e => e.type === 'pack_prompt_viewed' && e.detail === 'trial_last'), 'the card at one answer left is counted');
          assert.match(await page.locator('.gpt-low-line').innerText(), locale === 'ru' ? /Пробных ответов: 1 из 3/ : /Sinov javoblari: 1\/3/, 'the trial line stays as it was');
        }
      }
      const dialog = page.locator('.gpt-trial-dialog'); await dialog.waitFor();
      assert.equal(chatCalls, 3); assert.equal(await dialog.locator('[data-provider]').count(), 2);
      assert.match((await dialog.innerText()).replace(/\s/g, ''), /20000/);
      assert.equal(await dialog.locator('input[type="checkbox"]').count(), 0);
      // Ш1 on a main chat: its own heading, the sum on every provider button, nothing preselected, «Paketim bor».
      assert.equal(await dialog.locator('h2').innerText(), title);
      for (const button of await dialog.locator('[data-provider]').all()) assert.match((await button.innerText()).replace(/\s/g, ''), /^(Click|Payme)·20000(сум|so‘m)↗$/);
      assert.equal(await dialog.locator('[data-testid="trial-have-pack"]').innerText(), locale === 'ru' ? 'У меня есть пакет' : 'Paketim bor');
      assert.doesNotMatch(await dialog.innerText(), /Tavsiya|Рекоменд|Kutishni|ждать/);
      for (let i = 0; i < 40 && !events.some(e => e.type === 'trial_paywall_role'); i++) await page.waitForTimeout(25);
      assert.deepEqual(events.filter(e => e.type === 'trial_paywall_role').map(e => e.detail), [role]);
      await page.keyboard.press('Tab'); assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)));
      const box = await dialog.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0, 'dialog fits viewport');
      await page.screenshot({ path: path.join(reports, `trial-${locale}-${width}-${role}.png`) });
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      // The survey: in the thread under the closed window, four answers, closable; never a text field.
      const survey = page.locator('[data-testid="trial-exit-survey"]'); await survey.waitFor();
      assert.equal(await survey.locator('[data-reason]').count(), 4);
      assert.equal(await survey.locator('input, textarea').count(), 0);
      assert.match(await survey.innerText(), locale === 'ru' ? /Почему не сейчас\?/ : /Nega hozir emas\?/);
      await survey.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(reports, `trial-survey-ask-${locale}-${width}-${role}.png`) });
      if (width === 390) {
        await survey.locator('[data-reason="price"]').click();
        await survey.locator('[role="status"]').waitFor();
        for (let i = 0; i < 40 && !events.some(e => e.type === 'trial_exit_reason'); i++) await page.waitForTimeout(25);
        assert.deepEqual(events.filter(e => e.type === 'trial_exit_reason').map(e => e.detail), ['price']);
        await page.screenshot({ path: path.join(reports, `trial-survey-${locale}-${width}-${role}.png`) });
      } else if (width === 1366) {
        await survey.locator('.gpt-pack-prompt-close').click();
        assert.equal(await survey.count(), 0, 'closed without an answer');
        assert.equal(events.filter(e => e.type === 'trial_exit_reason').length, 0);
      }
      assert.equal(await page.getByText('Fixture answer 3', { exact: true }).count(), 1);
      assert.equal(await send.isDisabled(), true);
      await input.fill('Keep my fourth question'); await page.waitForTimeout(550); await page.reload();
      await page.locator('[data-testid="ai-limit-card"]').waitFor();
      assert.equal(await page.locator('.gpt-trial-dialog').count(), 0, 'no repeated fullscreen offer');
      assert.equal(await page.locator('[data-testid="trial-exit-survey"]').count(), 0, 'the survey asks once per view');
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
