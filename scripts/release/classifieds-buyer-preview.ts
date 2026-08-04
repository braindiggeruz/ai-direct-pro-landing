import fs from 'node:fs/promises';
import path from 'node:path';
import axeCore from 'axe-core';
import { chromium, type Page } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASE_URL = (process.env.MARKET_MINI_APP_BASE_URL ?? 'http://127.0.0.1:4181')
  .replace(/\/$/, '');
const OUTPUT = path.join(
  ROOT,
  'docs',
  'production-closure',
  '2026-08-04',
  'evidence',
  'classifieds-buyer-synthetic-phase5',
);

interface AxeFinding {
  id: string;
  impact: string | null;
  targets: string[][];
}

async function audit(page: Page): Promise<{
  violations: AxeFinding[];
  incomplete: AxeFinding[];
  passes: number;
}> {
  await page.addScriptTag({ content: axeCore.source });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof axeCore }).axe;
    const result = await axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
    });
    return {
      violations: result.violations.map((item) => ({
        id: item.id,
        impact: item.impact,
        targets: item.nodes.map((node) => node.target),
      })),
      incomplete: result.incomplete.map((item) => ({
        id: item.id,
        impact: item.impact,
        targets: item.nodes.map((node) => node.target),
      })),
      passes: result.passes.length,
    };
  });
}

async function geometry(page: Page) {
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

async function main(): Promise<void> {
  await fs.mkdir(OUTPUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    bypassCSP: true,
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/?classifieds=1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Объявления рядом', exact: true }).waitFor();

  const homeRu = await audit(page);
  await page.screenshot({ path: path.join(OUTPUT, 'buyer-home-390-ru-light.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 720 });
  const width320 = await geometry(page);
  await page.screenshot({ path: path.join(OUTPUT, 'buyer-home-320-ru-light.png'), fullPage: true });

  await page.getByRole('button', { name: 'Поиск', exact: true }).last().click();
  await page.getByRole('heading', { name: 'Поиск', exact: true }).waitFor();
  await page.goBack();
  await page.getByRole('heading', { name: 'Объявления рядом', exact: true }).waitFor();
  const hardwareBackReturnedHome = true;

  await page.getByRole('button', { name: 'Подробнее', exact: true }).first().click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(300);
  const detail = await audit(page);
  await page.screenshot({ path: path.join(OUTPUT, 'buyer-detail-320-ru-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Написать продавцу', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Можно посмотреть вечером?');
  await page.getByRole('dialog').getByRole('button', { name: 'Отправить', exact: true }).click();
  await page.waitForTimeout(500);
  const inquiryDebug = await page.evaluate(() => ({
    dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
    errorVisible: Boolean(document.querySelector('.form-error')),
    headings: [...document.querySelectorAll('h1')]
      .map((heading) => heading.textContent?.trim() ?? ''),
    location: `${window.location.pathname}${window.location.search}`,
    mainVisible: Boolean(document.querySelector('main')),
    bodyText: document.body.innerText.trim().slice(0, 120),
    activityVisible: [...document.querySelectorAll('h1')]
      .some((heading) => heading.textContent?.trim() === 'Запросы'),
  }));
  if (!inquiryDebug.activityVisible) {
    throw new Error(`inquiry preview did not transition: ${JSON.stringify(inquiryDebug)}`);
  }
  await page.getByRole('heading', { name: 'Запросы', exact: true }).waitFor();
  await page.getByText('Можно посмотреть вечером?', { exact: true }).waitFor();
  const inquiryJourney = true;

  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить', exact: true }).first().click();
  await page.getByRole('button', { name: 'Сохранённые', exact: true }).click();
  await page.getByRole('heading', { name: 'Сохранённые', exact: true }).waitFor();
  await page.getByText('Городской велосипед', { exact: true }).first().waitFor();
  const favoriteJourney = true;

  await page.getByRole('button', { name: 'Язык', exact: true }).click();
  await page.getByRole('heading', { name: 'Saqlanganlar', exact: true }).waitFor();
  const savedUz = await audit(page);
  await page.screenshot({ path: path.join(OUTPUT, 'buyer-saved-320-uz-light.png'), fullPage: true });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.screenshot({ path: path.join(OUTPUT, 'buyer-saved-320-uz-dark.png'), fullPage: true });

  const report = {
    verdict: 'PASS',
    synthetic: true,
    viewport: { width: 320, height: 720 },
    journeys: { hardwareBackReturnedHome, inquiryJourney, favoriteJourney },
    geometry: { width320 },
    accessibility: { homeRu, detail, savedUz },
  };
  const serious = [homeRu, detail, savedUz]
    .flatMap((result) => result.violations)
    .filter((finding) => finding.impact === 'critical' || finding.impact === 'serious');
  if (
    serious.length
    || homeRu.incomplete.length
    || detail.incomplete.length
    || savedUz.incomplete.length
    || width320.horizontalOverflow
    || width320.undersized.length
  ) {
    report.verdict = 'FAIL';
    process.exitCode = 1;
  }
  await fs.writeFile(
    path.join(OUTPUT, 'measurements.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  console.log(JSON.stringify({
    verdict: report.verdict,
    synthetic: true,
    seriousViolations: serious.length,
    incomplete: homeRu.incomplete.length + detail.incomplete.length + savedUz.incomplete.length,
    geometry: width320,
    journeys: report.journeys,
  }, null, 2));
  await browser.close();
}

await main();
