// Static artifact only. APIs are mocked and all off-origin requests are aborted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { PSEO_DOCUMENT_SLUGS, PSEO_PRACTICE_PAGES } from '../../src/shared/pseo20.ts';

const root = path.resolve(import.meta.dirname, '../..');
const dist = path.join(root, 'dist');
const out = process.env.PSEO_EVIDENCE;
assert.ok(out, 'Set external PSEO_EVIDENCE directory');
fs.mkdirSync(out, { recursive: true });
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.pdf': 'application/pdf' };
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let target = path.resolve(dist, '.' + pathname);
  if (!target.startsWith(dist + path.sep)) return res.writeHead(403).end();
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return res.writeHead(404).end();
  res.setHeader('content-type', mime[path.extname(target)] || 'application/octet-stream');
  res.end(fs.readFileSync(target));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-gpu'] });
const results = [];
async function fixture(width, js = true) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 500, hasTouch: width < 500, javaScriptEnabled: js, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const api = [], missing = [], errors = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      api.push({ path: url.pathname, method: route.request().method() });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"error":"local_qa_only"}' });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.url().startsWith(origin) && r.status() >= 400) missing.push(r.url()); });
  return { context, page, api, missing, errors };
}
async function run(name, fn) {
  try { results.push({ name, status: 'PASS', detail: await fn() }); }
  catch (e) { results.push({ name, status: 'FAIL', error: e.stack }); }
}
try {
  for (const width of [320, 390, 1440]) {
    const f = await fixture(width);
    try {
      for (const item of PSEO_PRACTICE_PAGES) await run(`${width}px ${item.slug}: layout, answer, restart`, async () => {
        const { page } = f;
        const response = await page.goto(origin + `/uz/${item.slug}/`, { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200);
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.locator('#practice-quiz').count(), 1);
        assert.equal(await page.locator('[data-pq-item]').count(), 12);
        assert.ok(await page.locator('#tool-first').evaluate(el => el.compareDocumentPosition(document.querySelector('#main')) & Node.DOCUMENT_POSITION_FOLLOWING));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const first = page.locator('[data-pq-item]').first();
        const answer = Number(await first.getAttribute('data-answer'));
        await first.locator('.pq-options button').nth(answer).click();
        assert.equal(await first.getAttribute('data-state'), 'right');
        assert.match(await page.locator('[data-pq-score]').innerText(), /1/);
        await page.locator('[data-pq-action="restart"]').click();
        assert.equal(await first.getAttribute('data-state'), null);
        await first.locator('.pq-options button').nth((answer + 1) % 4).click();
        assert.equal(await first.getAttribute('data-state'), 'wrong');
        assert.ok(await first.locator('details').getAttribute('open') !== null);
        const bg = await page.locator('#tool-first').evaluate(el => getComputedStyle(el.parentElement).backgroundColor);
        if (width === 390 && ['karra-jadvali', 'tenglama-yechish', 'biologiya-test'].includes(item.slug)) {
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({ path: path.join(out, `${item.slug}-${width}.png`) });
        }
        return { h1: await page.locator('h1').innerText(), bg };
      });
      for (const slug of PSEO_DOCUMENT_SLUGS) await run(`${width}px ${slug}: visible downloads`, async () => {
        const { page } = f;
        await page.goto(origin + `/uz/blog/${slug}/`, { waitUntil: 'networkidle' });
        assert.equal(await page.locator('h1').count(), 1);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const card = page.locator('[data-pseo-document]');
        assert.equal(await card.count(), 1);
        assert.equal(await card.locator('a[download]').count(), 2);
        for (const ext of ['docx', 'pdf']) {
          const link = card.locator(`a[href$=".${ext}"]`);
          const r = await page.request.get(origin + await link.getAttribute('href'));
          assert.equal(r.status(), 200);
          assert.ok((await r.body()).length > 1000);
        }
        if (width === 390 && slug === 'tarjimai-hol-namuna') await page.screenshot({ path: path.join(out, `${slug}-${width}.png`) });
      });
      assert.deepEqual(f.errors, []); assert.deepEqual(f.missing, []);
      assert.deepEqual(f.api.filter(r => /\/api\/gpt(?:\/chat)?\/?$/.test(r.path) && r.method === 'POST'), []);
    } finally { await f.context.close(); }
  }
  const f = await fixture(390);
  try {
    await run('equation: fractional / decimal / impossible / malformed input stays local', async () => {
      const { page } = f;
      await page.goto(origin + '/uz/tenglama-yechish/', { waitUntil: 'networkidle' });
      for (const [input, expected] of [['3x=1', 'x = 1/3'], ['0.1x+0.2=0.3', 'x = 1'], ['x=x+1', 'Yechim yo‘q.'], ['x=x', 'Har qanday x mos keladi.']]) {
        await page.locator('#linear-equation').fill(input);
        await page.locator('[data-linear-equation] button[type=submit]').click();
        assert.ok((await page.locator('[data-equation-output]').innerText()).includes(expected));
      }
      await page.locator('#linear-equation').fill('<img src=x onerror=alert(1)>');
      await page.locator('[data-linear-equation] button[type=submit]').click();
      assert.equal(await page.locator('#linear-equation').getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('[data-equation-output] img').count(), 0);
      assert.equal(new URL(page.url()).search, '');
      assert.deepEqual(f.api.filter(r => r.method === 'POST'), []);
    });
    await run('multiplication: selection updates product and table', async () => {
      await f.page.goto(origin + '/uz/karra-jadvali/', { waitUntil: 'networkidle' });
      await f.page.locator('#factor-a').selectOption('7');
      await f.page.locator('#factor-b').selectOption('8');
      assert.equal(await f.page.locator('[data-multiplication] output').innerText(), '7 × 8 = 56');
      assert.equal(await f.page.locator('.ps-grid [data-selected]').innerText(), '56');
      assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });
  } finally { await f.context.close(); }
  for (const url of ['/uz/tenglama-yechish/', '/uz/gpt-uzbek-tilida/']) {
    const f = await fixture(390);
    try {
      await run(`phone keyboard retains composer: ${url}`, async () => {
        await f.page.goto(origin + url, { waitUntil: 'networkidle' });
        const input = f.page.locator('#main textarea').first();
        await input.focus();
        await f.page.evaluate(() => { Object.defineProperty(visualViewport, 'height', { value: 500, configurable: true }); visualViewport.dispatchEvent(new Event('resize')); });
        await f.page.waitForFunction(() => document.querySelector('[data-keyboard="open"]'));
        const box = await f.page.locator('#main').boundingBox();
        assert.ok(Math.abs(box.y) < 2, JSON.stringify(box));
        assert.ok(Math.abs(box.height - 500) < 2, JSON.stringify(box));
        const composer = await input.boundingBox();
        assert.ok(composer.y >= 0 && composer.y + composer.height <= 501, JSON.stringify(composer));
        await f.page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
        await f.page.waitForFunction(() => !document.querySelector('[data-keyboard="open"]'));
        assert.deepEqual(f.api.filter(r => r.method === 'POST'), []);
      });
    } finally { await f.context.close(); }
  }
  const nojs = await fixture(390, false);
  try {
    for (const item of PSEO_PRACTICE_PAGES) await run(`no JS: ${item.slug} full answers`, async () => {
      await nojs.page.goto(origin + `/uz/${item.slug}/`);
      assert.equal(await nojs.page.locator('[data-pq-item] details').count(), 12);
      assert.equal(await nojs.page.locator('[data-pq-bar]').isVisible(), false);
      const first = nojs.page.locator('[data-pq-item] details').first();
      await first.locator('summary').click();
      assert.ok(await first.locator('.pq-right').isVisible());
      if (item.slug === 'karra-jadvali') assert.equal(await nojs.page.locator('.ps-grid td').count(), 100);
    });
  } finally { await nojs.context.close(); }
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(out, 'browser-qa.json'), JSON.stringify({ createdAt: new Date().toISOString(), scope: 'local artifact; APIs mocked; no off-origin traffic', results }, null, 2));
}
const failed = results.filter(r => r.status === 'FAIL');
console.log(JSON.stringify({ checks: results.length, passed: results.length - failed.length, failed }, null, 2));
if (failed.length) process.exitCode = 1;
