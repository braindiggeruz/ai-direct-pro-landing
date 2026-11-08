// Local built-page QA only. Every API call is mocked; every off-origin request is aborted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '../..');
const dist = path.resolve(process.env.GPTBOT_TEST_DIST || path.join(root, 'dist'));
const out = path.resolve(process.env.GPTBOT_QA_OUT || path.join(root, 'reports/viral-landing-20261108/qa'));
const urlPath = '/ru/blog/ii-zahvatit-mir-nachnem-s-zayavok/';
const htmlFile = path.join(dist, urlPath, 'index.html');
assert.ok(fs.existsSync(htmlFile), 'Build the campaign page before running local QA.');
fs.mkdirSync(out, { recursive: true });
const report = { createdAt: new Date().toISOString(), scope: 'local built page; API mocks only; no external requests sent', htmlSha256: createHash('sha256').update(fs.readFileSync(htmlFile)).digest('hex'), cssSha256: createHash('sha256').update(fs.readFileSync(path.join(dist, 'assets/campaigns/ai-routine/landing.css'))).digest('hex'), checks: [], screenshots: [] };
const executablePath = [process.env.GPTBOT_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
assert.ok(executablePath, 'A local Chrome/Chromium browser is required.');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
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
const failures = [];
async function check(name, run) {
  try { const detail = await run(); report.checks.push({ name, status: 'PASS', detail }); }
  catch (error) { failures.push(name); report.checks.push({ name, status: 'FAIL', error: error.stack }); }
}
async function fixture(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const events = [], api = [], blockedExternal = [], errors = [], missing = [];
  const state = { outcome: 'failure' };
  await context.exposeBinding('__captureMeasurement', (_source, event) => events.push(event));
  await context.addInitScript(() => {
    for (const vendor of ['gtag', 'fbq', 'ym']) window[vendor] = (...args) => { void window.__captureMeasurement({ vendor, args, route: location.pathname }); };
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { blockedExternal.push(url.origin + url.pathname); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    api.push({ path: url.pathname, method: route.request().method(), body: route.request().postDataJSON() });
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname !== '/api/gpt/lead') return json({ ok: false, error: 'unexpected_local_qa_api' }, 404);
    if (state.outcome === 'failure') return json({ ok: false, code: 'store_unavailable' }, 503);
    if (state.outcome === 'string-true') return json({ ok: 'true', id: 'lead_viral_fixture' });
    return json({ ok: true, id: 'lead_viral_fixture', delivery: 'pending', ...(state.outcome === 'duplicate' ? { duplicate: true } : {}), ...(state.outcome === 'idempotent' ? { duplicate: true, idempotent: true } : {}) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(origin) && response.status() === 404) missing.push(response.url()); });
  await page.goto(origin + urlPath + '?utm_source=meta&utm_medium=paid_social&utm_campaign=ai_routine&utm_content=C01&fbclid=qa_fixture', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const ga = name => events.filter(e => e.vendor === 'gtag' && e.args[0] === 'event' && e.args[1] === name);
  return { context, page, events, api, blockedExternal, errors, missing, state, ga };
}
try {
  for (const [width, height] of [[320, 800], [390, 844], [1440, 1000]]) {
    const f = await fixture(width, height), { page } = f;
    try {
      await check(`${width}px layout, metadata and anchors`, async () => {
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.locator('#lead-demo').count(), 1);
        assert.equal(await page.locator('#lead-form').count(), 1);
        assert.equal(await page.locator('form').count(), 1);
        assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://gptbot.uz' + urlPath);
        assert.equal(await page.locator('meta[property="og:image"]').getAttribute('content'), 'https://gptbot.uz/assets/campaigns/ai-routine/og.webp');
        const layout = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e => ({ tag: e.tagName, id: e.id, class: String(e.className).slice(0, 160), text: e.textContent?.trim().slice(0, 100), right: e.getBoundingClientRect().right })).slice(0, 20), unresolved: [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(href => href.length > 1 && !document.getElementById(href.slice(1))) }));
        await page.screenshot({ path: path.join(out, `viewport-${width}.png`), fullPage: false });
        report.screenshots.push(`viewport-${width}.png`);
        // Visit the lower sections before checking lazy-loaded images and full-page capture.
        for (const img of await page.locator('.vr-article img').all()) {
          await img.scrollIntoViewIfNeeded();
          await img.evaluate(image => image.decode());
        }
        for (const selector of ['#lead-demo', '#lead-form', 'footer']) await page.locator(selector).scrollIntoViewIfNeeded();
        const badImages = await page.locator('.vr-article img').evaluateAll(images => images.filter(img => !img.complete || img.naturalWidth === 0).map(img => img.currentSrc));
        assert.deepEqual(badImages, []);
        await page.screenshot({ path: path.join(out, `full-${width}.png`), fullPage: true });
        report.screenshots.push(`full-${width}.png`);
        if (width === 390) for (const [name, selector] of [['form', '.vr-form-wrap'], ['faq', '[data-testid=article-faq]'], ['related', '[data-testid=article-related]']]) {
          const element = page.locator(selector);
          if (await element.count()) { await element.screenshot({ path: path.join(out, `${name}-${width}.png`) }); report.screenshots.push(`${name}-${width}.png`); }
        }
        assert.ok(layout.scroll <= layout.viewport + 1, JSON.stringify(layout));
        assert.deepEqual(layout.unresolved, []);
        assert.deepEqual(f.errors, []); assert.deepEqual(f.missing, []);
        return layout;
      });
      await check(`${width}px three offline demo variants`, async () => {
        const initialApi = f.api.length, initialLeads = f.ga('generate_lead').length;
        const demo = page.locator('#lead-demo');
        for (const [scenario, service, time] of [['lead', 'consultation', 'morning'], ['booking', 'lesson', 'evening'], ['lead', 'lesson', 'morning']]) {
          for (const [group, value] of [['scenario', scenario], ['service', service], ['time', time]]) await demo.locator(`[data-demo-group="${group}"][data-demo-value="${value}"]`).click();
          await demo.locator('[data-demo-build]').click();
          assert.equal(await demo.locator('[data-demo-card]').isVisible(), true);
          assert.match(await demo.locator('[data-demo-field="status"]').innerText(), scenario === 'booking' ? /Ожидает согласования времени/ : /Ожидает связи с менеджером/);
          assert.match(await demo.locator('[data-demo-status]').innerText(), /Менеджеру ничего не отправлено/);
        }
        await demo.locator('[data-demo-reset]').click();
        assert.equal(await demo.locator('[data-demo-card]').isVisible(), false);
        assert.equal(f.api.length, initialApi, 'demo must not call any backend');
        assert.equal(f.ga('generate_lead').length, initialLeads);
        return { variants: 3, apiRequestsDuringDemo: f.api.length - initialApi };
      });
      await check(`${width}px axe serious/critical`, async () => {
        // Expand real FAQ controls so the check also covers answer text.
        for (const summary of await page.locator('[data-testid=article-faq] details > summary').all()) await summary.click();
        if (width === 390) {
          await page.locator('[data-testid=article-faq]').screenshot({ path: path.join(out, 'faq-expanded-390.png') });
          report.screenshots.push('faq-expanded-390.png');
        }
        await page.addScriptTag({ path: path.join(root, 'node_modules/axe-core/axe.min.js') });
        const result = await page.evaluate(async () => { const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }); return { violations: r.violations, incomplete: r.incomplete }; });
        fs.writeFileSync(path.join(out, `axe-${width}.json`), JSON.stringify(result, null, 2));
        const severe = result.violations.filter(v => ['serious', 'critical'].includes(v.impact));
        assert.deepEqual(severe.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })), []);
        return { violations: result.violations.map(v => ({ id: v.id, impact: v.impact })), seriousCritical: severe.length };
      });
      if (width === 390) await check('form failure, strict acknowledgment, attribution and duplicate conversions', async () => {
        const form = page.locator('[data-lead-form]');
        const fill = async () => { await form.locator('[name=name]').fill('QA fixture'); await form.locator('[name=contact]').fill('@viral_fixture'); await form.locator('[name=task]').fill('Private local QA example'); await form.locator('[name=consent]').check(); };
        const submit = async outcome => {
          f.state.outcome = outcome;
          await form.locator('button[type=submit]').click();
          await page.waitForFunction(() => { const b = document.querySelector('[data-lead-form] button[type=submit]'); return !b?.hasAttribute('aria-busy') || document.querySelector('[data-lead-form]')?.hidden; });
          await page.waitForTimeout(50);
        };
        await fill(); await submit('failure');
        assert.equal(await form.isVisible(), true); assert.equal(f.ga('generate_lead').length, 0);
        assert.equal(await form.locator('[name=task]').inputValue(), 'Private local QA example');
        await submit('string-true');
        assert.equal(await form.isVisible(), true); assert.equal(f.ga('generate_lead').length, 0, 'string true is not acknowledgment');
        await submit('success');
        assert.equal(await form.isVisible(), false); assert.equal(f.ga('generate_lead').length, 1);
        const requests = f.api.filter(r => r.path === '/api/gpt/lead');
        assert.equal(requests.length, 3);
        assert.equal(new Set(requests.map(r => r.body.requestId)).size, 1, 'retries preserve idempotency');
        for (const { body } of requests) {
          assert.equal(body.source, 'page_form'); assert.equal(body.service, 'ai-bot'); assert.equal(body.pageUrl, urlPath);
          assert.equal(body.utm.utm_source, 'meta'); assert.equal(body.utm.utm_campaign, 'ai_routine'); assert.equal(body.utm.utm_content, 'C01');
          assert.equal(body.attribution.landing, urlPath); assert.equal(body.attribution.fbclid, 'qa_fixture');
        }
        await page.reload({ waitUntil: 'networkidle' }); await fill(); await submit('duplicate');
        assert.equal(await form.isVisible(), true); assert.equal(f.ga('generate_lead').length, 1);
        assert.match(await page.locator('[data-lead-form-status]').innerText(), /Предыдущая заявка/);
        await submit('idempotent');
        assert.equal(await form.isVisible(), false); assert.equal(f.ga('generate_lead').length, 1, 'replayed receipt after reload cannot count twice');
        assert.doesNotMatch(JSON.stringify(f.events), /viral_fixture|Private local QA example|QA fixture/);
        assert.deepEqual(f.errors, []);
        return { mockedLeadRequests: f.api.length, generateLeadEvents: f.ga('generate_lead').length, strictLiteralAcknowledgment: true, retriesReuseRequestId: true, noPiiInAnalytics: true };
      });
    } finally { await f.context.close(); }
  }
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
  report.status = failures.length ? 'FAIL' : 'PASS';
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failures, report: path.join(out, 'report.json') }, null, 2));
}
if (failures.length) process.exitCode = 1;
