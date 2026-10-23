// Real Chromium, sequential local dist checks. All API calls are mocked;
// every external request is blocked. No provider, production lead or message.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const reportDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(reportDir, '../..');
const dist = path.join(root, 'dist');
const screenshotDir = path.join(reportDir, 'browser-screenshots');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7);
const skipLeads = process.argv.includes('--skip-leads');
const evidenceName = process.argv.find((arg) => arg.startsWith('--evidence='))?.slice(11) || 'browser-qa.json';
assert.match(evidenceName, /^[a-z0-9-]+\.json$/);
fs.mkdirSync(screenshotDir, { recursive: true });
const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  chromium.executablePath(),
].find(fs.existsSync);
assert.ok(executablePath, 'A local Chromium/Chrome executable is required; no download is allowed.');

const routes = [
  { id: 'ru-telegram-service', url: '/ru/razrabotka-telegram-bota-tashkent/', cta: '[data-lead-form] button[type=submit]' },
  { id: 'uz-bot-price', url: '/uz/chat-bot-narxi/', cta: '[data-lead-form] button[type=submit]' },
  { id: 'ru-site-price-article', url: '/ru/blog/skolko-stoit-sozdat-sayt-tashkent-2026/', cta: 'main a[href="/ru/razrabotka-saytov-tashkent/"]' },
  { id: 'uz-site-price-article', url: '/uz/blog/sayt-yaratish-narxi-toshkent-2026/', cta: 'main a[href="/uz/sayt-yaratish/"]' },
  { id: 'uz-chat', url: '/uz/gpt-uzbek-tilida/', cta: '.gpt-input-surface textarea' },
  { id: 'uz-login-guide', url: '/uz/blog/chatgptga-qanday-kirish-mumkin/', cta: 'main a[href="https://chatgpt.com/"]' },
  { id: 'ru-calculator', url: '/ru/kalkulyator-stoimosti-telegram-bota/', cta: '#telegram-cost-calculator-root button.btn-primary' },
];
const expected = new Map();
function readContent(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) readContent(full);
    else if (entry.name.endsWith('.json')) {
      const value = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (value.url) expected.set(value.url, value);
    }
  }
}
readContent(path.join(root, 'content/pages'));
readContent(path.join(root, 'content/blog'));

const evidence = {
  startedAt: new Date().toISOString(), executablePath,
  scope: 'Local built dist; one sequential browser; external requests blocked; every API mocked.',
  accountFixture: 'Synthetic available lifetime trial of 3; live-mode UI with Click/Payme buttons; no purchase calls permitted.',
  widths: [320, 390, 1280], pages: [], leadFlows: [], screenshots: [], failures: [],
};
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return void res.writeHead(405).end('Mock route missing');
  const pathname = decodeURIComponent(new URL(req.url || '/', 'http://local').pathname);
  const file = path.resolve(dist, `.${pathname}${pathname.endsWith('/') ? 'index.html' : ''}`);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end('Not found');
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-extensions', '--disable-background-networking'] });

async function fixture(width) {
  const context = await browser.newContext({ viewport: { width, height: width < 640 ? 844 : 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  const state = { errors: [], externalBlocked: new Set(), local404: [], leadRequests: [], leadReplies: [], mockedApis: {} };
  page.on('pageerror', (error) => state.errors.push(error.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && response.status() === 404) state.local404.push(url.pathname);
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) { state.externalBlocked.add(url.origin); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    state.mockedApis[url.pathname] = (state.mockedApis[url.pathname] || 0) + 1;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/gpt/lead') {
      state.leadRequests.push(request.postDataJSON());
      const reply = state.leadReplies.shift();
      if (reply === 'lost') return route.abort('failed');
      return json(reply || { ok: false, code: 'fixture_unplanned_submission' }, reply ? 200 : 503);
    }
    if (url.pathname === '/api/auth/config') return json({ turnstileRequired: false, turnstileSiteKey: null });
    if (url.pathname === '/api/gpt/session') return json({ ok: true, sessionId: 'qa-local-session' });
    if (url.pathname === '/api/gpt/account') return json({
      ok: true, mode: 'live', loginAvailable: true, guestCheckout: true, providers: ['click', 'payme'], user: null,
      freeLimits: { daily: 3, hourly: 3, lifetime: 3 }, remaining: 3,
      trial: { limit: 3, used: 0, remaining: 3, available: 3, resets: 'never' },
      terms: { ru: '/ru/oferta/', uz: '/uz/oferta/' }, termsVersion: 'qa-local',
      pack: { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: null }, access: null,
    });
    if (url.pathname === '/api/gpt/event') return json({ ok: true });
    return json({ ok: false, code: 'fixture_disabled' }, 404);
  });
  return { context, page, state };
}

async function screenshot(page, name) {
  const file = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
  evidence.screenshots.push(file);
  return file;
}

async function inspectPage(item, width) {
  const { page, context, state } = await fixture(width);
  const result = { id: item.id, url: item.url, width, passed: false };
  try {
    const response = await page.goto(origin + item.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    assert.equal(response.status(), 200);
    const cta = page.locator(item.cta).filter({ visible: true }).first();
    await cta.waitFor({ state: 'visible' });
    await page.waitForTimeout(350);
    result.h1 = await page.locator('h1').allTextContents();
    result.canonical = await page.locator('link[rel="canonical"]').evaluateAll((nodes) => nodes.map((node) => node.href));
    assert.equal(result.h1.length, 1, 'Exactly one H1');
    const source = expected.get(item.url);
    assert.ok(source, 'Content source exists');
    assert.equal(result.h1[0].replace(/\s+/g, ' ').trim(), source.h1.replace(/\s+/g, ' ').trim(), 'Built H1 matches content');
    assert.deepEqual(result.canonical, [new URL(source.canonical || item.url, 'https://gptbot.uz').href]);
    result.cta = { selector: item.cta, text: (await cta.textContent())?.trim().slice(0, 160), visible: await cta.isVisible(), enabled: await cta.isEnabled() };
    assert.equal(result.cta.enabled, true, 'CTA usable after hydration');
    result.layout = await page.evaluate(() => ({
      innerWidth, scrollWidth: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll('body *')].filter((node) => {
        const r = node.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(node).visibility !== 'hidden';
      }).slice(0, 12).map((node) => ({ tag: node.tagName, id: node.id, class: typeof node.className === 'string' ? node.className.slice(0, 100) : '', width: node.getBoundingClientRect().width })),
    }));
    assert.ok(result.layout.scrollWidth <= width + 1, `Horizontal overflow: ${result.layout.scrollWidth} > ${width}`);
    if (width === 390 || (width === 320 && ['ru-telegram-service', 'uz-chat'].includes(item.id))) result.screenshot = await screenshot(page, `${item.id}-${width}`);
    assert.deepEqual(state.errors, [], 'No uncaught page errors');
    assert.deepEqual(state.local404, [], 'No missing local resources or unsupported API paths');
    result.passed = true;
  } catch (error) {
    result.error = error.message;
    evidence.failures.push(`${item.id} @ ${width}: ${error.message}`);
    try { result.failureScreenshot = await screenshot(page, `${item.id}-${width}-failure`); } catch {}
  } finally {
    result.pageErrors = state.errors;
    result.local404 = state.local404;
    result.blockedExternalOrigins = [...state.externalBlocked];
    result.mockedApis = state.mockedApis;
    evidence.pages.push(result);
    await context.close();
  }
}

async function prepareForm(page, kind) {
  const url = kind === 'page' ? '/ru/razrabotka-telegram-bota-tashkent/' : '/ru/kalkulyator-stoimosti-telegram-bota/';
  await page.goto(origin + url, { waitUntil: 'domcontentloaded' });
  if (kind === 'calculator') {
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await page.getByRole('button', { name: 'Показать расчёт', exact: true }).click();
  }
  const form = page.locator(kind === 'page' ? '[data-lead-form]' : '#calculator-result form');
  await form.waitFor({ state: 'visible' });
  const name = form.locator(kind === 'page' ? '[name=name]' : '#calculator-name');
  const contact = form.locator(kind === 'page' ? '[name=contact]' : '#calculator-contact');
  await name.fill('Local QA fixture');
  await contact.fill('@local_qa_fixture');
  await form.locator('input[type=checkbox]').check();
  if (kind === 'page') await form.locator('[name=task]').fill('Synthetic local scope; never sent to production.');
  return { form, name, contact, submit: form.locator('button[type=submit]') };
}

async function leadFlow(kind) {
  const { context, page, state } = await fixture(390);
  const result = { kind, passed: false };
  try {
    let controls = await prepareForm(page, kind);
    state.leadReplies = ['lost', { ok: true, id: `qa_${kind}_retry`, duplicate: true, idempotent: true }];
    await controls.submit.click();
    await page.getByText(/Она могла сохраниться/).waitFor();
    assert.equal(await controls.submit.isEnabled(), true);
    await controls.submit.click();
    await page.getByText(kind === 'page' ? /Спасибо! Заявка получена/ : /Заявка принята\. Мы свяжемся/).waitFor();
    assert.equal(state.leadRequests[0].requestId, state.leadRequests[1].requestId, 'Unchanged retry retains key');
    result.retryKeyReused = true;

    controls = await prepareForm(page, kind);
    state.leadReplies = ['lost', { ok: true, id: `qa_${kind}_existing`, duplicate: true }, { ok: true, id: `qa_${kind}_existing`, duplicate: true }];
    await controls.submit.click();
    await page.getByText(/Она могла сохраниться/).waitFor();
    await controls.name.fill('Edited local QA fixture');
    await controls.submit.click();
    await page.getByText(/Предыдущая заявка/).waitFor();
    assert.equal(await controls.form.isVisible(), true);
    assert.equal(await controls.name.inputValue(), 'Edited local QA fixture');
    assert.notEqual(state.leadRequests[2].requestId, state.leadRequests[3].requestId, 'Name edit receives new key');
    if (kind === 'page') await controls.form.locator('[name=budget]').selectOption('2-5m');
    else await page.locator('input[name=volume]').nth(1).locator('..').click();
    await controls.submit.click();
    await page.getByText(/Предыдущая заявка/).waitFor();
    assert.notEqual(state.leadRequests[3].requestId, state.leadRequests[4].requestId, 'Budget/estimate edit receives new key');
    assert.equal(await controls.form.isVisible(), true);
    assert.equal(await controls.contact.inputValue(), '@local_qa_fixture');
    if (kind === 'page') assert.equal(await controls.form.locator('[name=budget]').inputValue(), '2-5m');
    else assert.equal(await page.getByRole('button', { name: 'Скопировать мини-ТЗ', exact: true }).isVisible(), true);
    result.editedNameNewKey = true;
    result.editedBudgetOrEstimateNewKey = true;
    result.duplicateKeepsDetails = true;
    result.requests = state.leadRequests.map(({ requestId, source, service, budget, name, utm }) => ({ requestId, source, service, budget, fixtureName: name, estimateMin: utm?.estimate_min }));
    await controls.form.scrollIntoViewIfNeeded();
    result.screenshot = await screenshot(page, `lead-${kind}-duplicate-390`);
    assert.deepEqual(state.errors, []);
    result.passed = true;
  } catch (error) {
    result.error = error.message;
    evidence.failures.push(`Lead flow ${kind}: ${error.message}`);
    try { result.failureScreenshot = await screenshot(page, `lead-${kind}-failure`); } catch {}
  } finally {
    result.pageErrors = state.errors;
    result.requestCount = state.leadRequests.length;
    evidence.leadFlows.push(result);
    await context.close();
  }
}

try {
  for (const width of evidence.widths) for (const item of routes.filter((item) => !only || item.id === only)) {
    await inspectPage(item, width);
    console.log(`${item.id} ${width}: ${evidence.pages.at(-1).passed ? 'PASS' : 'FAIL'}`);
  }
  for (const kind of skipLeads ? [] : ['page', 'calculator']) {
    await leadFlow(kind);
    console.log(`Lead ${kind}: ${evidence.leadFlows.at(-1).passed ? 'PASS' : 'FAIL'}`);
  }
} finally {
  evidence.finishedAt = new Date().toISOString();
  evidence.summary = { pagesPassed: evidence.pages.filter((row) => row.passed).length, pagesTotal: evidence.pages.length, leadFlowsPassed: evidence.leadFlows.filter((row) => row.passed).length, leadFlowsTotal: evidence.leadFlows.length, failures: evidence.failures.length };
  fs.writeFileSync(path.join(reportDir, evidenceName), JSON.stringify(evidence, null, 2) + '\n');
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(JSON.stringify(evidence.summary));
if (evidence.failures.length) process.exitCode = 1;
