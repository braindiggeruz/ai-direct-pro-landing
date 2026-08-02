import fs from 'node:fs/promises';
import path from 'node:path';
import axeCore from 'axe-core';
import { chromium, type Page } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..');
const baseUrl = (process.env.MARKET_MINI_APP_BASE_URL ?? 'http://127.0.0.1:4174')
  .replace(/\/$/, '');
const output = path.join(
  root,
  'docs',
  'agents-platform',
  'mini-app',
  'implementation',
  'evidence',
);

async function axe(page: Page, state: string) {
  await page.addScriptTag({ content: axeCore.source });
  const result = await page.evaluate(async () => {
    const runner = (window as unknown as { axe: typeof axeCore }).axe;
    return runner.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
    });
  });
  return {
    state,
    violations: result.violations.map((item) => ({
      id: item.id,
      impact: item.impact,
      help: item.help,
      nodes: item.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    })),
    passes: result.passes.length,
    incomplete: result.incomplete.map((item) => ({
      id: item.id,
      impact: item.impact,
      help: item.help,
      nodes: item.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
        html: node.html,
      })),
    })),
  };
}

async function geometry(page: Page, width: number, fontScale = 1, height = 844) {
  await page.setViewportSize({ width, height });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main h1');
  if (fontScale !== 1) {
    await page.addStyleTag({ content: `html { font-size: ${fontScale * 100}% !important; }` });
  }
  return page.evaluate(() => {
    const root = document.documentElement;
    const undersized = [...document.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input, select, textarea, a[href]',
    )].map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        name: (element.getAttribute('aria-label') || element.innerText || element.tagName)
          .trim().slice(0, 80),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }).filter((item) => item.width > 1 && item.height > 1
      && (item.width < 44 || item.height < 44));
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      undersized,
    };
  });
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const browserContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    bypassCSP: true,
  });
  const page = await browserContext.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main h1');
  const buyer = await axe(page, 'buyer-home');
  await page.screenshot({ path: path.join(output, 'buyer-home-390x844.png') });

  await page.getByRole('button', { name: 'Язык', exact: true }).click();
  await page.waitForSelector('main h1');
  const buyerUz = await axe(page, 'buyer-home-uz');
  await page.screenshot({ path: path.join(output, 'buyer-home-uz-390x844.png') });
  await page.getByRole('button', { name: 'Til', exact: true }).click();

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  const buyerDark = await axe(page, 'buyer-home-dark');
  await page.screenshot({ path: path.join(output, 'buyer-home-dark-390x844.png') });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });

  await page.getByRole('button', { name: 'Продавец', exact: true }).click();
  await page.waitForSelector('.metric-grid');
  const seller = await axe(page, 'seller-dashboard');
  await page.screenshot({ path: path.join(output, 'seller-dashboard-390x844.png') });

  const geometry320 = await geometry(page, 320);
  const geometry390 = await geometry(page, 390);
  const zoom200 = await geometry(page, 390, 2);
  const landscape844 = await geometry(page, 844, 1, 390);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main h1');
  const reducedMotionDuration = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.product-card');
    return card ? getComputedStyle(card).transitionDuration : 'missing';
  });
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    audits: [buyer, buyerUz, buyerDark, seller],
    geometry: {
      width320: geometry320,
      width390: geometry390,
      zoom200,
      landscape844,
    },
    reducedMotionDuration,
  };
  await fs.writeFile(
    path.join(output, 'a11y-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  await browser.close();
  const serious = [buyer, buyerUz, buyerDark, seller]
    .flatMap((audit) => audit.violations)
    .filter((item) => item.impact === 'critical' || item.impact === 'serious');
  const incomplete = [buyer, buyerUz, buyerDark, seller]
    .flatMap((audit) => audit.incomplete);
  if (
    serious.length
    || incomplete.length
    || geometry320.horizontalOverflow
    || geometry390.horizontalOverflow
    || zoom200.horizontalOverflow
    || landscape844.horizontalOverflow
    || geometry320.undersized.length
    || geometry390.undersized.length
    || landscape844.undersized.length
    || !['0.001ms', '1e-06s'].includes(reducedMotionDuration)
  ) {
    console.error(JSON.stringify({ serious, incomplete, geometry320, geometry390, zoom200 }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({
    buyerViolations: buyer.violations.length,
    buyerUzViolations: buyerUz.violations.length,
    buyerDarkViolations: buyerDark.violations.length,
    sellerViolations: seller.violations.length,
    geometry320,
    geometry390,
    zoom200,
    landscape844,
    reducedMotionDuration,
  }, null, 2));
}

await main();
