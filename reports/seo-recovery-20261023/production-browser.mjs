// Run only after the release owner confirms deployment. Public read-only smoke:
// GET https://gptbot.uz only; every /api request, other method and external host
// is blocked before network access. No clicks or form submissions are performed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const reportDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(reportDir, '../..');
const screenshots = path.join(reportDir, 'production-browser-screenshots');
const origin = 'https://gptbot.uz';
const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  chromium.executablePath(),
].find(fs.existsSync);
assert.ok(executablePath, 'Local Chrome/Chromium required; this script never installs a browser.');
const routes = [
  { id: 'ru-telegram-service', pathname: '/ru/razrabotka-telegram-bota-tashkent/', file: 'content/pages/ru/razrabotka-telegram-bota-tashkent.json', control: '[data-lead-form] button[type=submit]' },
  { id: 'uz-bot-price', pathname: '/uz/chat-bot-narxi/', file: 'content/pages/uz/chat-bot-narxi.json', control: '[data-lead-form] button[type=submit]' },
  { id: 'ru-calculator', pathname: '/ru/kalkulyator-stoimosti-telegram-bota/', file: 'content/pages/ru/kalkulyator-stoimosti-telegram-bota.json', control: '#telegram-cost-calculator-root button.btn-primary' },
].map((item) => ({ ...item, source: JSON.parse(fs.readFileSync(path.join(root, item.file), 'utf8')) }));

const report = {
  startedAt: new Date().toISOString(),
  scope: 'Production public HTML/assets, anonymous Chrome, GET only on https://gptbot.uz; all API calls, mutations and external requests blocked. No clicks or submissions.',
  executablePath, widths: [390, 1280], pages: [], failures: [], screenshots: [],
};
fs.mkdirSync(screenshots, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-extensions', '--disable-background-networking'] });

async function inspect(item, width) {
  const context = await browser.newContext({
    viewport: { width, height: width < 640 ? 844 : 900 }, reducedMotion: 'reduce', serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const result = {
    id: item.id, pathname: item.pathname, width, passed: false,
    pageErrors: [], assetErrors: [], allowedGetCount: 0,
    blockedApi: [], blockedMutations: [], blockedExternalOrigins: [],
  };
  const external = new Set();
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && response.status() >= 400) result.assetErrors.push({ path: url.pathname, status: response.status(), type: response.request().resourceType() });
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const api = url.pathname === '/api' || url.pathname.startsWith('/api/');
    if (api) result.blockedApi.push({ host: url.hostname, path: url.pathname, method });
    if (method !== 'GET') result.blockedMutations.push({ host: url.hostname, path: url.pathname, method });
    if (url.origin !== origin) external.add(url.origin);
    if (url.origin !== origin || api || method !== 'GET') return route.abort('blockedbyclient');
    result.allowedGetCount++;
    return route.continue();
  });
  try {
    const response = await page.goto(origin + item.pathname, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    result.httpStatus = response?.status();
    assert.equal(result.httpStatus, 200, 'Public page returns HTTP 200');
    assert.equal(new URL(page.url()).origin, origin, 'Navigation stays on the approved origin');
    const control = page.locator(item.control).filter({ visible: true }).first();
    await control.waitFor({ state: 'visible' });
    await page.waitForFunction((selector) => {
      const nodes = [...document.querySelectorAll(selector)];
      return nodes.some((node) => !node.disabled && node.getBoundingClientRect().height > 0);
    }, item.control);
    await page.waitForTimeout(500);
    result.h1 = await page.locator('h1').allTextContents();
    result.canonical = await page.locator('link[rel=canonical]').evaluateAll((nodes) => nodes.map((node) => node.href));
    assert.equal(result.h1.length, 1, 'Exactly one H1');
    assert.equal(result.h1[0].replace(/\s+/g, ' ').trim(), item.source.h1.replace(/\s+/g, ' ').trim(), 'Production H1 equals committed content');
    assert.deepEqual(result.canonical, [new URL(item.source.canonical || item.pathname, origin).href]);
    const primaryLink = page.locator(`a[href="${item.source.ctaPrimaryHref}"]`).filter({ visible: true }).first();
    assert.equal(await primaryLink.isVisible(), true, 'Primary call to action is visible');
    result.primaryCta = { text: (await primaryLink.textContent())?.trim(), href: await primaryLink.getAttribute('href'), box: await primaryLink.boundingBox() };
    result.interactiveControl = { selector: item.control, visible: await control.isVisible(), enabled: await control.isEnabled(), text: (await control.textContent())?.trim().slice(0, 160) };
    assert.equal(result.interactiveControl.enabled, true, 'Relevant control is enabled after hydration');
    result.layout = await page.evaluate(() => ({
      innerWidth, scrollWidth: document.documentElement.scrollWidth,
      overflowCandidates: [...document.querySelectorAll('body *')].filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && (box.right > innerWidth + 1 || box.left < -1) && getComputedStyle(node).visibility !== 'hidden';
      }).slice(0, 12).map((node) => ({ tag: node.tagName, id: node.id, width: node.getBoundingClientRect().width })),
    }));
    assert.ok(result.layout.scrollWidth <= width + 1, 'No document-level horizontal overflow');
    assert.deepEqual(result.pageErrors, [], 'No uncaught JavaScript errors');
    assert.deepEqual(result.assetErrors, [], 'No failing same-origin assets');
    result.passed = true;
  } catch (error) {
    result.error = error.message;
    report.failures.push(`${item.id} @ ${width}: ${error.message}`);
  } finally {
    result.blockedExternalOrigins = [...external];
    const file = path.join(screenshots, `${item.id}-${width}${result.passed ? '' : '-failure'}.png`);
    try {
      await page.screenshot({ path: file, animations: 'disabled', fullPage: false });
      result.screenshot = file;
      report.screenshots.push(file);
    } catch (error) { result.screenshotError = error.message; }
    report.pages.push(result);
    await context.close();
  }
}

try {
  for (const width of report.widths) for (const item of routes) {
    await inspect(item, width);
    console.log(`${item.id} ${width}: ${report.pages.at(-1).passed ? 'PASS' : 'FAIL'}`);
  }
} finally {
  report.finishedAt = new Date().toISOString();
  report.summary = {
    pagesPassed: report.pages.filter((row) => row.passed).length, pagesTotal: report.pages.length,
    pageErrors: report.pages.reduce((sum, row) => sum + row.pageErrors.length, 0),
    assetErrors: report.pages.reduce((sum, row) => sum + row.assetErrors.length, 0),
    blockedApiRequests: report.pages.reduce((sum, row) => sum + row.blockedApi.length, 0),
    blockedMutationRequests: report.pages.reduce((sum, row) => sum + row.blockedMutations.length, 0),
    failures: report.failures.length,
  };
  fs.writeFileSync(path.join(reportDir, 'production-browser.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify(report.summary));
if (report.failures.length) process.exitCode = 1;
