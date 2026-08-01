import fs from 'node:fs';
import path from 'node:path';

import axeCore from 'axe-core';
import { chromium, type Browser, type Page } from 'playwright-core';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASE_URL = (process.env.MARKET_BASE_URL ?? 'http://127.0.0.1:4173')
  .replace(/\/$/, '');
const EVIDENCE = path.resolve(
  process.env.MARKET_A11Y_OUTPUT
    ?? path.join(
      ROOT,
      'docs',
      'agents-platform',
      'evidence',
      'gptbot-market-productization-2026-08-01',
    ),
);

interface AxeNodeSummary {
  target: readonly string[];
  html: string;
  failureSummary?: string;
}

interface AxeViolationSummary {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  nodes: readonly AxeNodeSummary[];
}

interface PageAudit {
  path: string;
  viewport: { width: number; height: number };
  violations: readonly AxeViolationSummary[];
  incomplete: readonly { id: string; impact: string | null; nodes: number }[];
  passes: number;
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.MARKET_BROWSER_EXECUTABLE;
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : { channel: 'msedge' }),
  });
}

async function waitForMarket(page: Page, route: string): Promise<void> {
  const response = await page.goto(`${BASE_URL}${route}`, {
    waitUntil: 'networkidle',
  });
  if (!response || response.status() >= 500) {
    throw new Error(`market page unavailable: ${route}`);
  }
  await page.waitForSelector('body');
}

async function axeAudit(
  page: Page,
  route: string,
  viewport: { width: number; height: number },
): Promise<PageAudit> {
  await page.setViewportSize(viewport);
  await waitForMarket(page, route);
  await page.addScriptTag({ content: axeCore.source });
  const result = await page.evaluate(async () => {
    const axe = (window as unknown as {
      axe: {
        run: (
          context: Document,
          options: object,
        ) => Promise<{
          violations: Array<{
            id: string;
            impact: string | null;
            help: string;
            helpUrl: string;
            nodes: Array<{
              target: string[];
              html: string;
              failureSummary?: string;
            }>;
          }>;
          incomplete: Array<{
            id: string;
            impact: string | null;
            nodes: unknown[];
          }>;
          passes: unknown[];
        }>;
      };
    }).axe;
    return axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
      resultTypes: ['violations', 'incomplete', 'passes'],
    });
  });
  return {
    path: route,
    viewport,
    violations: result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        html: node.html.slice(0, 500),
        ...(node.failureSummary
          ? { failureSummary: node.failureSummary.slice(0, 1_000) }
          : {}),
      })),
    })),
    incomplete: result.incomplete.map((item) => ({
      id: item.id,
      impact: item.impact,
      nodes: item.nodes.length,
    })),
    passes: result.passes.length,
  };
}

async function horizontalOverflow(
  page: Page,
  route: string,
  width: number,
): Promise<{ route: string; width: number; clientWidth: number; scrollWidth: number; passed: boolean }> {
  await page.setViewportSize({ width, height: 900 });
  await waitForMarket(page, route);
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  return {
    route,
    width,
    ...metrics,
    passed: metrics.scrollWidth <= metrics.clientWidth + 1,
  };
}

async function keyboardAudit(page: Page): Promise<readonly {
  index: number;
  tag: string;
  text: string;
  focused: boolean;
  visibleFocus: boolean;
  width: number;
  height: number;
}[]> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await waitForMarket(page, '/ru/sotuvchi/');
  await page.locator('body').focus();
  const steps = [];
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab');
    const state = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visibleFocus = style.outlineStyle !== 'none'
        || style.boxShadow !== 'none'
        || Number.parseFloat(style.outlineWidth) > 0;
      return {
        tag: element.tagName.toLowerCase(),
        text: (element.innerText || element.getAttribute('aria-label') || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 100),
        focused: element === document.activeElement,
        visibleFocus,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
    if (state) steps.push({ index: index + 1, ...state });
  }
  await page.screenshot({
    path: path.join(EVIDENCE, 'website-ru-keyboard-focus.png'),
    fullPage: false,
  });
  return steps;
}

async function reducedMotionAudit(page: Page): Promise<{
  preference: string;
  elementsWithLongMotion: number;
  maxAnimationSeconds: number;
  maxTransitionSeconds: number;
}> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await waitForMarket(page, '/ru/sotuvchi/');
  const result = await page.evaluate(() => {
    let maxAnimationSeconds = 0;
    let maxTransitionSeconds = 0;
    let elementsWithLongMotion = 0;
    for (const element of document.querySelectorAll('.market-shell *')) {
      const style = getComputedStyle(element);
      let animation = 0;
      for (const value of style.animationDuration.split(',')) {
        const item = value.trim();
        const parsed = Number.parseFloat(item);
        if (!Number.isFinite(parsed)) continue;
        animation = Math.max(
          animation,
          item.endsWith('ms') ? parsed / 1_000 : parsed,
        );
      }
      let transition = 0;
      for (const value of style.transitionDuration.split(',')) {
        const item = value.trim();
        const parsed = Number.parseFloat(item);
        if (!Number.isFinite(parsed)) continue;
        transition = Math.max(
          transition,
          item.endsWith('ms') ? parsed / 1_000 : parsed,
        );
      }
      maxAnimationSeconds = Math.max(maxAnimationSeconds, animation);
      maxTransitionSeconds = Math.max(maxTransitionSeconds, transition);
      if (animation > 0.02 || transition > 0.02) elementsWithLongMotion += 1;
    }
    return {
      preference: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'reduce'
        : 'no-preference',
      elementsWithLongMotion,
      maxAnimationSeconds,
      maxTransitionSeconds,
    };
  });
  await page.screenshot({
    path: path.join(EVIDENCE, 'website-ru-reduced-motion.png'),
    fullPage: false,
  });
  return result;
}

async function screenshot(
  page: Page,
  route: string,
  width: number,
  height: number,
  name: string,
  fullPage = true,
): Promise<void> {
  await page.setViewportSize({ width, height });
  const response = await page.goto(`${BASE_URL}${route}`, {
    waitUntil: 'networkidle',
  });
  if (!response || response.status() >= 500) {
    throw new Error(`screenshot route unavailable: ${route}`);
  }
  await page.screenshot({ path: path.join(EVIDENCE, name), fullPage });
}

async function main(): Promise<void> {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const browser = await launchBrowser();
  const context = await browser.newContext({
    locale: 'ru-RU',
    colorScheme: 'light',
  });
  const page = await context.newPage();
  const axeCases = [
    ['/ru/sotuvchi/', 1440, 900],
    ['/uz/sotuvchi/', 1440, 900],
    ['/ru/sotuvchi/', 390, 844],
    ['/uz/sotuvchi/', 390, 844],
    ['/ru/market-doverie/', 1440, 900],
    ['/uz/market-ishonch/', 1440, 900],
    ['/404.html', 390, 844],
  ] as const;
  const pageAudits: PageAudit[] = [];
  for (const [route, width, height] of axeCases) {
    pageAudits.push(await axeAudit(page, route, { width, height }));
  }

  const overflow = [];
  for (const route of ['/ru/sotuvchi/', '/uz/sotuvchi/']) {
    for (const width of [320, 360, 390, 430, 768, 1024, 1280, 1440, 1728]) {
      overflow.push(await horizontalOverflow(page, route, width));
    }
  }

  const keyboard = await keyboardAudit(page);
  const reducedMotion = await reducedMotionAudit(page);

  const captures = [
    ['/ru/sotuvchi/', 320, 844, 'website-ru-320.png'],
    ['/ru/sotuvchi/', 360, 844, 'website-ru-360.png'],
    ['/ru/sotuvchi/', 390, 844, 'website-ru-390-final.png'],
    ['/ru/sotuvchi/', 430, 900, 'website-ru-430.png'],
    ['/ru/sotuvchi/', 768, 1024, 'website-ru-tablet-768.png'],
    ['/ru/sotuvchi/', 1024, 900, 'website-ru-1024.png'],
    ['/ru/sotuvchi/', 1280, 900, 'website-ru-1280.png'],
    ['/ru/sotuvchi/', 1440, 900, 'website-ru-1440-final.png'],
    ['/ru/sotuvchi/', 1728, 1000, 'website-ru-wide-1728.png'],
    ['/uz/sotuvchi/', 390, 844, 'website-uz-390-final.png'],
    ['/uz/sotuvchi/', 1440, 900, 'website-uz-1440-final.png'],
    ['/ru/market-doverie/', 390, 844, 'trust-ru-390.png'],
    ['/ru/market-doverie/', 1440, 900, 'trust-ru-1440.png'],
    ['/404.html', 390, 844, 'website-404-390.png'],
    ['/404.html', 1440, 900, 'website-404-1440.png'],
    ['/assets/market/og-market-ru.png', 1200, 630, 'og-market-ru-preview.png'],
  ] as const;
  for (const [route, width, height, name] of captures) {
    await screenshot(page, route, width, height, name);
  }
  await screenshot(
    page,
    '/ru/sotuvchi/',
    360,
    900,
    'website-ru-200pct-reflow.png',
  );

  const contactFiles = [
    ...captures.map((capture) => capture[3]),
    'website-ru-200pct-reflow.png',
    'website-ru-keyboard-focus.png',
    'website-ru-reduced-motion.png',
  ];
  const contactWidth = 260;
  const contactHeight = 360;
  const contactColumns = 5;
  const contactRows = Math.ceil(contactFiles.length / contactColumns);
  const contactTiles = await Promise.all(contactFiles.map(async (file, index) => ({
    input: await sharp(path.join(EVIDENCE, file))
      .resize(contactWidth - 20, contactHeight - 20, {
        fit: 'contain',
        background: '#e9e1d5',
      })
      .png()
      .toBuffer(),
    left: (index % contactColumns) * contactWidth + 10,
    top: Math.floor(index / contactColumns) * contactHeight + 10,
  })));
  await sharp({
    create: {
      width: contactColumns * contactWidth,
      height: contactRows * contactHeight,
      channels: 3,
      background: '#e9e1d5',
    },
  }).composite(contactTiles).webp({ quality: 88 }).toFile(
    path.join(EVIDENCE, 'website-visual-contact-sheet.webp'),
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    tool: `axe-core ${axeCore.version} with playwright-core`,
    standard: 'WCAG 2 A/AA, WCAG 2.1 A/AA, WCAG 2.2 AA automated rules',
    baseUrl: BASE_URL,
    pageAudits,
    overflow,
    keyboard,
    reducedMotion,
    totals: {
      pages: pageAudits.length,
      violations: pageAudits.reduce(
        (total, audit) => total + audit.violations.length,
        0,
      ),
      incomplete: pageAudits.reduce(
        (total, audit) => total + audit.incomplete.length,
        0,
      ),
      axePasses: pageAudits.reduce((total, audit) => total + audit.passes, 0),
      overflowFailures: overflow.filter(({ passed }) => !passed).length,
      keyboardFocusFailures: keyboard.filter(
        ({ focused, visibleFocus }) => !focused || !visibleFocus,
      ).length,
      reducedMotionFailures: reducedMotion.elementsWithLongMotion,
    },
    claimsNotMade: [
      'VoiceOver pass',
      'TalkBack pass',
      'native Uzbek sign-off',
      'legal review',
    ],
  };
  fs.writeFileSync(
    path.join(EVIDENCE, 'market-accessibility-automated.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );
  await browser.close();

  if (
    summary.totals.violations > 0
    || summary.totals.overflowFailures > 0
    || summary.totals.keyboardFocusFailures > 0
    || summary.totals.reducedMotionFailures > 0
  ) {
    throw new Error(`market accessibility audit failed: ${JSON.stringify(summary.totals)}`);
  }
  console.log(JSON.stringify(summary.totals));
}

await main();
