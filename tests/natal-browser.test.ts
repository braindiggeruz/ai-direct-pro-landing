// The natal chart and compatibility pages in a real browser, on the built
// site, with the AI reading answered locally (no model is called, no request
// leaves the machine). What it checks: the form, the place search in Uzbek
// and Russian spellings, the chart and «Как посчитано» with the historical
// offset, the time-unknown mode, the pair with its contacts, the free first
// readings and the honest answer for the next one, no sideways scroll, and
// that no birth data is sent anywhere.
// Run (after a build): node --import tsx --test tests/natal-browser.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium, type Page } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const TEXT = 'Bu joylashuv sizga ichki kuch beradi va boshqalar bilan ochiq gaplashishga undaydi; ba’zan sabr qilish foydali.';

async function fillPerson(page: Page, index: number, p: { day: string; month: string; year: string; time?: string; place: string; pick: RegExp }) {
  const form = page.locator('.natal-form').nth(index);
  const inputs = form.locator('.natal-date input');
  await inputs.nth(0).fill(p.day);
  await inputs.nth(1).fill(p.month);
  await inputs.nth(2).fill(p.year);
  if (p.time) await form.locator('.natal-time').fill(p.time);
  else await form.locator('.natal-check input').check();
  await form.locator('[role="combobox"]').fill(p.place);
  const option = form.locator('.natal-option', { hasText: p.pick }).first();
  await option.waitFor({ timeout: 15_000 });
  await option.dispatchEvent('mousedown');
}

test('natal chart and compatibility in a browser: form, places, chart, offsets, pair, free readings', { skip: !executablePath || !fs.existsSync(path.join(dist, 'uz/natal-karta/index.html')), timeout: 300_000 }, async () => {
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
    const file = path.resolve(dist, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end();
    const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' } as Record<string, string>)[path.extname(file)];
    res.writeHead(200, { 'Content-Type': type ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ executablePath, headless: true });
  const shots = process.env.GPTBOT_BROWSER_REPORT_DIR;
  const shot = async (page: Page, name: string) => { if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true }); } };
  const narrow = async (page: Page, what: string) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${what}: no sideways scroll`);
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors: string[] = [];
    const sent: string[] = [];
    let served = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    await ctx.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/api/natal/reading') {
        const body = request.postData() ?? '';
        sent.push(body);
        const parsed = JSON.parse(body) as { kind: string; facts: string[] };
        served += 1;
        // The first natal and the first pair are free; a third reading is the next, paid one.
        if (served > 2) return route.fulfill({ status: 402, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'next_paid' }) });
        const ids = parsed.kind === 'pair' ? ['overview', 'harmony', 'advice'] : ['core', 'love', 'advice'];
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cached: false, sections: ids.map((id, i) => ({ id, facts: [parsed.facts[i]], text: TEXT })) }) });
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
      return route.continue();
    });

    // ---- 1. Uzbek natal page: a Tashkent birth in July 1985 (summer time, UTC+7), found as «Тошкент».
    await page.goto(`${origin}/uz/natal-karta/`);
    await page.locator('.natal-form').first().waitFor({ timeout: 20_000 });
    await fillPerson(page, 0, { day: '12', month: '7', year: '1985', time: '09:30', place: 'Тошкент', pick: /Toshkent/ });
    await page.locator('.natal-actions .natal-button').first().click();
    await page.locator('#natal-result').waitFor({ timeout: 20_000 });
    const big3 = await page.locator('.natal-big3').innerText();
    assert.match(big3, /Saraton \(Qisqichbaqa\)/, 'the Sun in Cancer on 12 July');
    assert.equal(await page.locator('.natal-wheel').count(), 1);
    assert.ok(await page.locator('.natal-cusp').count() >= 12, 'houses are drawn when the time is known');
    await page.locator('.natal-how summary').click();
    const how = await page.locator('.natal-how').innerText();
    assert.match(how, /Asia\/Tashkent, UTC\+7, yozgi vaqt/, 'the summer offset of 1985 is used');
    assert.match(how, /tz 2025b/);
    await narrow(page, 'natal result');
    // The reading: free, then shown with its fact chips.
    await page.getByRole('button', { name: 'AI tahlilini olish' }).click();
    await page.locator('.natal-section').first().waitFor({ timeout: 15_000 });
    assert.equal(await page.locator('.natal-section').count(), 3);
    assert.match(await page.locator('.natal-label-ai').innerText(), /astrolog tahlili emas/);
    await shot(page, 'natal-uz');

    // ---- 2. Compatibility from the natal page: a partner with the time unknown, born in Samarkand.
    await page.getByRole('button', { name: 'Moslikni tekshirish' }).first().click();
    await fillPerson(page, 1, { day: '3', month: '3', year: '1997', place: 'Samarqand', pick: /Samarqand/ });
    await page.locator('.natal-actions .natal-button').first().click();
    await page.locator('.natal-pair').waitFor({ timeout: 20_000 });
    assert.ok(await page.locator('.natal-contact').count() > 3, 'contacts between the charts');
    assert.equal(await page.locator('.natal-wheel').count(), 2);
    assert.match(await page.locator('.natal-pair-counts').innerText(), /uygʻun/);
    assert.doesNotMatch(await page.locator('.natal-pair').innerText(), /%/, 'no percentage');
    await page.getByRole('button', { name: 'AI tahlilini olish' }).click();
    await page.locator('.natal-section').first().waitFor({ timeout: 15_000 });
    await narrow(page, 'pair result');
    await shot(page, 'pair-uz');

    // ---- 3. Nothing personal was sent: no date, year, place or name in any request.
    assert.equal(sent.length, 2);
    for (const body of sent) {
      assert.doesNotMatch(body, /1985|1997|Toshkent|Samarqand|Тошкент|41\.29|69\.24/);
      assert.match(body, /"facts":\[/);
    }

    // ---- 4. Russian compatibility page opens on two forms; the third reading says honestly that it is next and paid.
    const ru = await ctx.newPage();
    ru.on('pageerror', (error) => errors.push(error.message));
    await ru.goto(`${origin}/ru/sovmestimost-po-date-rozhdeniya/`);
    await ru.locator('.natal-form').nth(1).waitFor({ timeout: 20_000 });
    await fillPerson(ru, 0, { day: '1', month: '1', year: '1990', time: '06:00', place: 'Ташкент', pick: /Ташкент|Toshkent/ });
    await fillPerson(ru, 1, { day: '15', month: '6', year: '1992', place: 'Бухара', pick: /Бухара|Buxoro/ });
    await ru.locator('.natal-actions .natal-button').first().click();
    await ru.locator('.natal-pair').waitFor({ timeout: 20_000 });
    await ru.getByRole('button', { name: 'Получить AI-разбор' }).click();
    await ru.getByText('Следующий разбор скоро станет платным (5 000 сум) — пока недоступен.', { exact: false }).waitFor({ timeout: 15_000 });
    await narrow(ru, 'ru pair');
    await shot(ru, 'pair-ru-next');

    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
