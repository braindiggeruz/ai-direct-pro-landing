import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { renderLeadDemo } from '../scripts/lead-demo';

const executablePath = [
  process.env.GPTBOT_TEST_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));

function documentHtml(locale: 'ru' | 'uz'): string {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline example</title></head><body style="margin:0;background:#08131a;font-family:Arial,sans-serif"><main>${renderLeadDemo(locale)}<section id="lead-form"><h2>Real form target fixture</h2></section></main></body></html>`;
}

test('SSR explains the teaching example, uses the existing form anchor and collects no personal data', () => {
  for (const locale of ['ru', 'uz'] as const) {
    const html = renderLeadDemo(locale);
    assert.match(html, /id="lead-demo"/);
    assert.match(html, /aria-labelledby="lead-demo-heading"/);
    assert.match(html, locale === 'ru' ? /Учебный пример: данные не отправляются/ : /O‘quv namunasi: ma’lumotlar yuborilmaydi/);
    assert.match(html, locale === 'ru' ? /Запрос на запись — ещё не бронь/ : /hali tasdiqlangan bron emas/);
    assert.match(html, /href="#lead-form"/);
    assert.doesNotMatch(html, /<(?:input|textarea|form|iframe)\b/i);
    assert.doesNotMatch(html, /\bon(?:click|change|submit)\s*=/i);
    assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|generate_lead|gtag)\b/);
    assert.doesNotMatch(html, /\b(?:innerHTML|outerHTML|insertAdjacentHTML|eval)\b/);
    assert.equal((html.match(/<script /g) ?? []).length, 1);
    assert.equal((html.match(/<button /g) ?? []).length, 8);
    assert.equal((html.match(/ disabled>/g) ?? []).length, 8, 'buttons stay inert until the handler is bound');
    assert.ok(Buffer.byteLength(html) < 15000, 'demo stays a small dependency-free page enhancement');
  }
});

test('RU/UZ example works with keyboard at 320px and desktop; resets, rejects injected options, causes no external effects', { skip: !executablePath }, async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    for (const locale of ['ru', 'uz'] as const) for (const width of [320, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const requests: string[] = [];
      const errors: string[] = [];
      page.on('request', (request) => requests.push(request.url()));
      page.on('pageerror', (error) => errors.push(error.message));
      await context.route('**/*', (route) => route.abort());
      await page.evaluate(`(() => {
        const effects = [];
        Object.assign(window, { demoEffects: effects, gtag: () => effects.push('analytics'), ym: () => effects.push('analytics') });
        window.fetch = async () => { effects.push('fetch'); throw new Error('Offline test: unexpected fetch'); };
        XMLHttpRequest.prototype.open = () => { effects.push('xhr'); throw new Error('Offline test: unexpected XHR'); };
        Object.defineProperty(navigator, 'sendBeacon', { value: () => { effects.push('beacon'); return false; } });
        Storage.prototype.setItem = () => { effects.push('storage'); };
      })()`);
      await page.setContent(documentHtml(locale));
      const demo = page.locator('#lead-demo');
      const card = demo.locator('[data-demo-card]');
      const status = demo.locator('[data-demo-status]');
      const booking = demo.locator('[data-demo-value="booking"]');
      const lesson = demo.locator('[data-demo-group="service"]').nth(1);
      const evening = demo.locator('[data-demo-value="evening"]');
      const build = demo.locator('[data-demo-build]');
      assert.equal(await card.isVisible(), false);
      assert.equal(await build.isEnabled(), true);
      await booking.focus();
      await page.keyboard.press('Space');
      assert.equal(await booking.getAttribute('aria-pressed'), 'true');
      assert.match(await demo.locator('[data-demo-note]').innerText(), locale === 'ru' ? /ещё не бронь/ : /hali tasdiqlangan bron emas/);
      await lesson.click();
      await evening.click();
      await build.focus();
      await page.keyboard.press('Enter');
      assert.equal(await card.isVisible(), true);
      assert.equal(await card.locator('[data-demo-field="scenario"]').innerText(), locale === 'ru' ? 'Запросить запись' : 'Yozilish so‘rovi');
      assert.equal(await card.locator('[data-demo-field="service"]').innerText(), locale === 'ru' ? 'Пробное занятие' : 'Sinov darsi');
      assert.match(await card.locator('[data-demo-field="time"]').innerText(), /17:00–19:00/);
      assert.equal(await card.locator('[data-demo-field="status"]').innerText(), locale === 'ru' ? 'Ожидает согласования времени' : 'Vaqtni kelishish kutilmoqda');
      assert.match(await status.innerText(), locale === 'ru' ? /Менеджеру ничего не отправлено/ : /Menejerga hech narsa yuborilmadi/);
      await demo.locator('[data-demo-value="lead"]').click();
      assert.equal(await card.isVisible(), false, 'changing the choices removes the obsolete preview');
      assert.equal(await status.innerText(), '');
      await build.click();
      assert.equal(await card.locator('[data-demo-field="status"]').innerText(), locale === 'ru' ? 'Ожидает связи с менеджером' : 'Menejer bilan bog‘lanish kutilmoqda');
      await demo.locator('[data-demo-reset]').click();
      assert.equal(await card.isVisible(), false);
      assert.equal(await status.isVisible(), false);
      assert.equal(await demo.locator('[data-demo-value="lead"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await demo.locator('[data-demo-value="consultation"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await demo.locator('[data-demo-value="morning"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-demo-value')), 'lead');

      // DOM labels and attributes are never treated as trusted card values or HTML.
      await lesson.evaluate((button) => {
        button.setAttribute('data-demo-value', '<img src=x onerror=alert(1)>');
        button.textContent = '<img src=x onerror=alert(1)>';
      });
      await lesson.click();
      await build.click();
      assert.equal(await card.locator('[data-demo-field="service"]').innerText(), locale === 'ru' ? 'Консультация' : 'Maslahat');
      assert.equal(await demo.locator('img').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${locale} ${width}: horizontal overflow`);
      const targets = await demo.locator('button,a').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
      assert.ok(targets.every((height) => height >= 44), 'keyboard and touch controls stay usable');
      assert.deepEqual(await page.evaluate(() => (window as unknown as { demoEffects: string[] }).demoEffects), []);
      assert.deepEqual(requests, []);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close();
  }
});

test('without JavaScript the disclosure and real form link remain usable and demo controls stay disabled', { skip: !executablePath }, async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 800 } });
    const page = await context.newPage();
    await page.setContent(documentHtml('ru'));
    assert.equal(await page.locator('#lead-demo button:enabled').count(), 0);
    assert.equal(await page.locator('#lead-demo noscript').isVisible(), true);
    assert.equal(await page.locator('#lead-demo a[href="#lead-form"]').isVisible(), true);
    assert.equal(await page.locator('[data-demo-card]').isVisible(), false);
    await context.close();
  } finally {
    await browser.close();
  }
});
