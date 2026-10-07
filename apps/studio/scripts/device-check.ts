/**
 * The device check of the studio, automated (STUDIO-SPEC §14.5): by the
 * owner's decision of 2026-10-07 it replaces the 15-minute phone checklist.
 *
 *   npx tsx apps/studio/scripts/device-check.ts --origin http://127.0.0.1:8788 --out <dir>
 *            [--decks ios-safari,android-chrome,...]   profiles that make a real deck (default: none)
 *            [--pages uz,ru]                           pages to open in every profile
 *
 * --origin is a running site: `wrangler pages dev dist` with STUDIO_LOCAL_DEV
 * (the release rehearsal) or https://gptbot.uz after the deploy. A deck is a
 * real generation (Z.ai, Workers AI) and spends that browser's free deck of
 * the day, so --decks is explicit; without it nothing is generated.
 *
 * Every profile is Chromium (the local Chrome) with the device's user agent,
 * screen, pixel ratio and touch; Telegram's in-app bridge
 * (window.TelegramWebviewProxy) is injected the way its in-app browser has it.
 *
 * For each profile and page:
 *   page     200, the island hydrates, one H1, no sideways scroll, the submit
 *            button on the first screen and at least 44 px high, form fields
 *            at least 16 px (smaller makes iOS zoom in on focus), the
 *            «Brauzerda oching» notice shown exactly in an in-app browser and
 *            before the button, layout shift < 0.05, no console error.
 * For each --decks profile, on its first page:
 *   deck     the real flow: topic, audience, slides, submit, wait (≤150 s);
 *            the result cards hold their text (nothing clipped), the pictures
 *            come from blob: URLs and load, the Uzbek text uses ‘ and ’ (no
 *            ASCII apostrophe in o‘/g‘ and no Cyrillic); the download saves
 *            a .pptx; a second submit the same day shows the limit at once.
 *   pptx     the file unzips; cover, the slides and the AI label slide; the
 *            pictures; every text box laid out in the browser with Arial at
 *            its own size, insets, indents and paragraph gaps fits its box
 *            (what Google Slides and WPS show, which never shrink text);
 *            python-pptx, a third-party reader, opens it (skipped if absent).
 *
 * What it cannot prove: WebKit itself (iOS Safari), the real Instagram and
 * Telegram apps (whether their browsers save a download) and mobile
 * PowerPoint, Google Slides, WPS and Keynote opening the file. The page tells
 * in-app visitors to open the page in a browser first for exactly that reason.
 *
 * Writes <out>/device-check.json and <out>/<profile>-<locale>.pptx; prints a
 * summary. Exit code 1 when any check fails.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { AI_LABEL } from '../src/pptx/build';
import { TEXTS } from '../src/tools/presentation/texts';

type Locale = 'uz' | 'ru';
type InApp = 'instagram' | 'telegram' | null;

export interface DeviceProfile {
  readonly id: string;
  readonly label: string;
  readonly userAgent?: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly deviceScaleFactor: number;
  readonly mobile: boolean;
  readonly inApp: InApp;
  /** Inject window.TelegramWebviewProxy (Telegram's in-app browser has it, whatever its user agent). */
  readonly telegramBridge?: boolean;
  readonly ios?: boolean;
}

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const ANDROID_WEBVIEW = 'Mozilla/5.0 (Linux; Android 14; SM-A145F Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36';

export const PROFILES: readonly DeviceProfile[] = [
  { id: 'ios-safari-se', label: 'iPhone SE, Safari (375×667)', userAgent: `${IOS} Version/17.6 Mobile/15E148 Safari/604.1`, viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, mobile: true, inApp: null, ios: true },
  { id: 'ios-safari', label: 'iPhone 14, Safari (390×844)', userAgent: `${IOS} Version/17.6 Mobile/15E148 Safari/604.1`, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, mobile: true, inApp: null, ios: true },
  { id: 'android-chrome', label: 'Samsung A14, Chrome (360×800)', userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, mobile: true, inApp: null },
  { id: 'instagram-ios', label: 'Instagram, iPhone (390×844)', userAgent: `${IOS} Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_6; uz_UZ; uz; scale=3.00; 1170x2532; 614066429)`, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, mobile: true, inApp: 'instagram', ios: true },
  { id: 'instagram-android', label: 'Instagram, Android (360×800)', userAgent: `${ANDROID_WEBVIEW} Instagram 337.0.0.35.102 Android (34/14; 450dpi; 1080x2208; samsung; SM-A145F; a14; mt6769; uz_UZ; 614066429)`, viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, mobile: true, inApp: 'instagram' },
  { id: 'telegram-ios', label: 'Telegram, iPhone (390×844)', userAgent: `${IOS} Mobile/15E148`, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, mobile: true, inApp: 'telegram', telegramBridge: true, ios: true },
  { id: 'telegram-android', label: 'Telegram, Android (360×800)', userAgent: ANDROID_WEBVIEW, viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, mobile: true, inApp: 'telegram', telegramBridge: true },
  { id: 'desktop-chrome', label: 'Desktop Chrome (1366×768)', viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, mobile: false, inApp: null },
];

const PAGES: Record<Locale, string> = { uz: '/uz/taqdimot-ai/', ru: '/ru/prezentatsiya-ai/' };

/** The topic each deck profile asks for (school topics of the 30-topic run). */
export const DECK_TOPICS: Record<string, { locale: Locale; topic: string; audience: 'maktab' | 'talaba' | 'umumiy'; slides: 4 | 5 | 6 }> = {
  'ios-safari': { locale: 'uz', topic: 'Amir Temur davlati', audience: 'maktab', slides: 6 },
  'android-chrome': { locale: 'ru', topic: 'Круговорот воды в природе', audience: 'maktab', slides: 5 },
  'instagram-android': { locale: 'uz', topic: 'Kasrlarni qo‘shish va ayirish', audience: 'maktab', slides: 4 },
  'telegram-ios': { locale: 'uz', topic: 'O‘zbekiston Respublikasi Konstitutsiyasi', audience: 'umumiy', slides: 6 },
  'desktop-chrome': { locale: 'uz', topic: 'Fotosintez', audience: 'talaba', slides: 6 },
  'ios-safari-se': { locale: 'ru', topic: 'Великий шёлковый путь', audience: 'talaba', slides: 6 },
  'instagram-ios': { locale: 'uz', topic: 'Suvning tabiatda aylanishi', audience: 'maktab', slides: 5 },
  'telegram-android': { locale: 'ru', topic: 'Солнечная система', audience: 'maktab', slides: 4 },
};

export const LIMITS = { layoutShift: 0.05, tapTarget: 44, iosFieldFont: 16, deckSeconds: 150 } as const;

export interface PageResult {
  profile: string;
  locale: Locale;
  status: number;
  hydrated: boolean;
  h1: number;
  overflowX: number;
  submitBottom: number;
  submitHeight: number;
  viewportHeight: number;
  minFieldFont: number;
  noticeShown: boolean;
  noticeBeforeSubmit: boolean;
  layoutShift: number;
  failures: string[];
}

export interface BoxFit {
  slide: number;
  text: string;
  boxHeightPt: number;
  contentHeightPt: number;
  sizesPt: number[];
}

export interface DeckResult {
  profile: string;
  locale: Locale;
  topic: string;
  seconds: number | null;
  outcome: string;
  slidesShown: number;
  pictures: number;
  clippedCards: number[];
  asciiApostrophes: string[];
  cyrillicInUz: boolean;
  file: string | null;
  bytes: number;
  pptx: {
    slides: number;
    media: number;
    aiLabelLast: boolean;
    langs: string[];
    overflow: BoxFit[];
    tightest: BoxFit | null;
    pythonPptx: string;
  } | null;
  limitAfter: string;
  failures: string[];
}

function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].filter((candidate): candidate is string => Boolean(candidate));
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('No local Chrome found. Set CHROME_PATH.');
  return found;
}

async function profileContext(browser: Browser, profile: DeviceProfile): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
    acceptDownloads: true,
    locale: 'uz-UZ',
    ...(profile.userAgent ? { userAgent: profile.userAgent } : {}),
  });
  if (profile.telegramBridge) {
    await context.addInitScript(() => {
      (window as unknown as { TelegramWebviewProxy: unknown }).TelegramWebviewProxy = { postEvent: () => undefined };
    });
  }
  await context.addInitScript(() => {
    const state = ((window as unknown as { __shift: { value: number } }).__shift = { value: 0 });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
        if (!entry.hadRecentInput) state.value += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  return context;
}

function watchConsole(page: Page, errors: string[]): void {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text().slice(0, 200));
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message.slice(0, 200)}`));
}

async function checkPage(context: BrowserContext, origin: string, profile: DeviceProfile, locale: Locale): Promise<{ result: PageResult; page: Page }> {
  const page = await context.newPage();
  const errors: string[] = [];
  watchConsole(page, errors);
  const response = await page.goto(origin + PAGES[locale], { waitUntil: 'load' });
  const hydrated = await page.waitForSelector('#studio-root[data-island="ready"]', { timeout: 20_000 }).then(() => true, () => false);
  await page.waitForTimeout(1_500);
  const probe = await page.evaluate(() => {
    const submit = document.querySelector('#studio-root button[type="submit"]') as HTMLElement | null;
    const slot = document.querySelector('#studio-root [data-studio-inapp-slot]') as HTMLElement | null;
    const notice = document.querySelector('#studio-root [data-studio-inapp]') as HTMLElement | null;
    const shown = (element: HTMLElement | null) => !!element && element.getBoundingClientRect().height > 0 && getComputedStyle(element).visibility !== 'hidden';
    const fields = Array.from(document.querySelectorAll('#studio-root input, #studio-root select')) as HTMLElement[];
    const rect = submit?.getBoundingClientRect();
    return {
      h1: document.querySelectorAll('h1').length,
      overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      submitBottom: rect ? Math.round(rect.bottom + window.scrollY) : Number.POSITIVE_INFINITY,
      submitHeight: rect ? Math.round(rect.height) : 0,
      viewportHeight: window.innerHeight,
      minFieldFont: Math.min(...fields.map((field) => parseFloat(getComputedStyle(field).fontSize))),
      noticeShown: shown(slot) && shown(notice),
      noticeBeforeSubmit: !!notice && !!submit && (notice.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      layoutShift: Math.round(((window as unknown as { __shift?: { value: number } }).__shift?.value ?? 0) * 10_000) / 10_000,
    };
  });
  const failures: string[] = [];
  const at = `${profile.id} ${PAGES[locale]}`;
  const status = response?.status() ?? 0;
  if (status !== 200) failures.push(`${at}: HTTP ${status}`);
  if (!hydrated) failures.push(`${at}: the island never became ready`);
  if (probe.h1 !== 1) failures.push(`${at}: ${probe.h1} H1`);
  if (probe.overflowX > 1) failures.push(`${at}: the page scrolls sideways by ${probe.overflowX}px`);
  if (!(probe.submitBottom <= probe.viewportHeight)) failures.push(`${at}: the submit button ends at ${probe.submitBottom}px, below the first screen (${probe.viewportHeight}px)`);
  if (profile.mobile && probe.submitHeight < LIMITS.tapTarget) failures.push(`${at}: the submit button is ${probe.submitHeight}px high`);
  if (profile.ios && probe.minFieldFont < LIMITS.iosFieldFont) failures.push(`${at}: a form field is ${probe.minFieldFont}px, iOS zooms in on focus below 16px`);
  if (probe.noticeShown !== (profile.inApp !== null)) failures.push(`${at}: the in-app notice is ${probe.noticeShown ? 'shown' : 'not shown'}`);
  if (profile.inApp && !probe.noticeBeforeSubmit) failures.push(`${at}: the in-app notice is not before the button`);
  if (!(probe.layoutShift < LIMITS.layoutShift)) failures.push(`${at}: layout shift ${probe.layoutShift}`);
  for (const error of errors) failures.push(`${at}: console: ${error}`);
  return { result: { profile: profile.id, locale, status, hydrated, ...probe, failures }, page };
}

/** «o'», «g'» and the tutuq belgisi written with an ASCII or modifier apostrophe instead of ‘ / ’. */
export function asciiApostrophes(text: string): string[] {
  return [...new Set(text.match(/\p{L}*['`ʻʼ]\p{L}*/gu) ?? [])];
}

async function makeDeck(page: Page, profile: DeviceProfile, outDir: string): Promise<DeckResult> {
  const plan = DECK_TOPICS[profile.id];
  const texts = TEXTS[plan.locale];
  const failures: string[] = [];
  const at = `${profile.id} deck`;
  const base: DeckResult = {
    profile: profile.id, locale: plan.locale, topic: plan.topic, seconds: null, outcome: 'not started', slidesShown: 0, pictures: 0,
    clippedCards: [], asciiApostrophes: [], cyrillicInUz: false, file: null, bytes: 0, pptx: null, limitAfter: '', failures,
  };
  await page.click('#studio-root input[name="topic"]');
  await page.fill('#studio-root input[name="topic"]', plan.topic);
  await page.selectOption('#studio-root select[name="audience"]', plan.audience);
  await page.selectOption('#studio-root select[name="slides"]', String(plan.slides));
  const started = Date.now();
  await page.click('#studio-root button[type="submit"]');
  const outcome = await Promise.race([
    page.waitForSelector('#studio-root [data-studio-download="idle"]', { timeout: LIMITS.deckSeconds * 1000 }).then(() => 'ready'),
    page.waitForSelector('#studio-root [data-studio-message]', { timeout: LIMITS.deckSeconds * 1000 })
      .then(async (element) => `message: ${(await element.getAttribute('data-studio-message')) ?? ''} «${((await element.textContent()) ?? '').trim()}»`),
  ]).catch(() => 'timeout');
  base.seconds = Math.round((Date.now() - started) / 100) / 10;
  base.outcome = outcome;
  if (outcome !== 'ready') {
    failures.push(`${at}: ${outcome} after ${base.seconds}s`);
    return base;
  }
  // Pictures may still be drawn after the text: the download waits for them (downloadWait).
  await page.waitForFunction(() => !document.querySelector('#studio-root [data-studio-preview]')?.textContent?.match(/Rasm chizilmoqda|Рисуем картинку/), undefined, { timeout: 60_000 }).catch(() => failures.push(`${at}: pictures still loading after 60 s`));
  const dom = await page.evaluate(() => {
    const root = document.getElementById('studio-root') as HTMLElement;
    const cards = Array.from(root.querySelectorAll('[data-studio-preview] li[data-slide]')) as HTMLElement[];
    const clipped = cards.filter((card) => {
      const box = card.getBoundingClientRect();
      const last = card.querySelector('ul li:last-child');
      return card.scrollHeight > card.clientHeight + 1 || (!!last && last.getBoundingClientRect().bottom > box.bottom + 1);
    }).map((card) => Number(card.dataset.slide));
    const pictures = Array.from(root.querySelectorAll('img[data-picture]')) as HTMLImageElement[];
    return {
      slides: cards.length,
      clipped,
      pictures: pictures.length,
      picturesOk: pictures.every((img) => img.src.startsWith('blob:') && img.complete && img.naturalWidth > 0),
      text: (root.querySelector('[data-studio-preview]') as HTMLElement | null)?.innerText ?? '',
      overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    };
  });
  base.slidesShown = dom.slides;
  base.pictures = dom.pictures;
  base.clippedCards = dom.clipped;
  if (dom.slides !== plan.slides) failures.push(`${at}: ${dom.slides} slides shown, asked for ${plan.slides}`);
  if (dom.clipped.length) failures.push(`${at}: cards ${dom.clipped.join(', ')} clip their text`);
  if (!dom.picturesOk) failures.push(`${at}: a picture is not a loaded blob: image`);
  if (dom.overflowX > 1) failures.push(`${at}: the result scrolls sideways by ${dom.overflowX}px`);
  if (plan.locale === 'uz') {
    base.asciiApostrophes = asciiApostrophes(dom.text);
    base.cyrillicInUz = /[\u0400-\u04FF]/.test(dom.text);
    if (base.asciiApostrophes.length) failures.push(`${at}: ASCII apostrophes in ${base.asciiApostrophes.slice(0, 5).join(', ')}`);
    if (base.cyrillicInUz) failures.push(`${at}: Cyrillic letters in the Uzbek deck`);
  }
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.click('#studio-root [data-studio-download] button'),
  ]);
  const file = path.join(outDir, `${profile.id}-${plan.locale}.pptx`);
  await download.saveAs(file);
  base.file = file;
  base.bytes = fs.statSync(file).size;
  if (!/^taqdimot-[a-z0-9-]+\.pptx$/.test(download.suggestedFilename())) failures.push(`${at}: saved as ${download.suggestedFilename()}`);
  const status = await page.waitForSelector('#studio-root [data-studio-download="started"]', { timeout: 15_000 }).then(() => true, () => false);
  if (!status) failures.push(`${at}: the download line never said it started`);
  // A second deck the same day: the limit at once, the first deck stays.
  await page.click('#studio-root button[type="submit"]');
  base.limitAfter = await page.waitForSelector('#studio-root [data-studio-message]', { timeout: 20_000 })
    .then(async (element) => `${(await element.getAttribute('data-studio-message')) ?? ''} «${((await element.textContent()) ?? '').trim()}»`, () => 'none');
  if (!base.limitAfter.startsWith('free_limit') || !base.limitAfter.includes(texts.messages.free_limit)) failures.push(`${at}: the second submit shows ${base.limitAfter}`);
  return base;
}

interface ShapeText {
  slide: number;
  cx: number;
  cy: number;
  insets: [number, number, number, number];
  paragraphs: Array<{ marL: number; indent: number; spcAft: number; runs: Array<{ text: string; size: number; bold: boolean }> }>;
}

const EMU_PER_PT = 12_700;
const attr = (xml: string, name: string): string | null => new RegExp(`\\b${name}="([^"]*)"`).exec(xml)?.[1] ?? null;
const unescape = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** The text boxes of a slide's XML, with what their layout needs. */
export function slideShapes(xml: string, slide: number): ShapeText[] {
  const shapes: ShapeText[] = [];
  for (const [shape] of xml.matchAll(/<p:sp(?:\s[^>]*)?>[\s\S]*?<\/p:sp>/g)) {
    const body = /<p:txBody>([\s\S]*?)<\/p:txBody>/.exec(shape)?.[1];
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(shape);
    if (!body || !ext) continue;
    const bodyPr = /<a:bodyPr[^>]*>/.exec(body)?.[0] ?? '';
    const inset = (name: string, fallback: number) => Number(attr(bodyPr, name) ?? fallback) / EMU_PER_PT;
    const paragraphs = [...body.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)].map(([, p]) => {
      const pPr = /<a:pPr[^>]*>/.exec(p)?.[0] ?? '';
      const spcAft = /<a:spcAft><a:spcPts val="(\d+)"/.exec(p)?.[1];
      const runs = [...p.matchAll(/<a:r(?:\s[^>]*)?>([\s\S]*?)<\/a:r>/g)].map(([, r]) => {
        const rPr = /<a:rPr[^>]*>/.exec(r)?.[0] ?? '';
        return {
          text: unescape(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/.exec(r)?.[1] ?? ''),
          size: Number(attr(rPr, 'sz') ?? 1800) / 100,
          bold: attr(rPr, 'b') === '1',
        };
      });
      return {
        marL: Number(attr(pPr, 'marL') ?? 0) / EMU_PER_PT,
        indent: Number(attr(pPr, 'indent') ?? 0) / EMU_PER_PT,
        spcAft: spcAft ? Number(spcAft) / 100 : 0,
        runs,
      };
    }).filter((p) => p.runs.some((run) => run.text.trim()));
    if (!paragraphs.length) continue;
    shapes.push({
      slide,
      cx: Number(ext[1]) / EMU_PER_PT,
      cy: Number(ext[2]) / EMU_PER_PT,
      insets: [inset('tIns', 45_720), inset('rIns', 91_440), inset('bIns', 45_720), inset('lIns', 91_440)],
      paragraphs,
    });
  }
  return shapes;
}

/** Each text box laid out in Chromium with Arial, as a viewer that never shrinks text would show it. */
async function layoutFits(browser: Browser, shapes: ShapeText[]): Promise<BoxFit[]> {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await context.newPage();
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = shapes.map((shape, i) => `<div class="box" data-i="${i}" style="width:${shape.cx}pt;height:${shape.cy}pt;padding:${shape.insets.map((v) => `${v}pt`).join(' ')}">${
    shape.paragraphs.map((p) => `<p style="margin:0 0 ${p.spcAft}pt 0;padding-left:${Math.max(0, p.marL)}pt;text-indent:${Math.max(0, p.indent)}pt">${
      p.runs.map((run) => `<span style="font-size:${run.size}pt;font-weight:${run.bold ? 700 : 400}">${escape(run.text)}</span>`).join('')
    }</p>`).join('')
  }</div>`).join('');
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0} .box{box-sizing:border-box;font-family:Arial;line-height:1.2;overflow:hidden;margin:4pt;display:inline-block;vertical-align:top}
    .box p:last-child{margin-bottom:0!important}
  </style>${html}`);
  const measured = await page.evaluate(() => Array.from(document.querySelectorAll('.box')).map((box) => {
    const element = box as HTMLElement;
    const style = getComputedStyle(element);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    let content = 0;
    for (const child of Array.from(element.children)) content = Math.max(content, (child as HTMLElement).offsetTop + (child as HTMLElement).offsetHeight - element.offsetTop);
    return { box: element.clientHeight, content: content + parseFloat(style.paddingBottom), padding };
  }));
  await context.close();
  const pxToPt = 0.75;
  return shapes.map((shape, i) => ({
    slide: shape.slide,
    text: shape.paragraphs.map((p) => p.runs.map((run) => run.text).join('')).join(' / ').slice(0, 120),
    boxHeightPt: Math.round(measured[i].box * pxToPt * 10) / 10,
    contentHeightPt: Math.round(measured[i].content * pxToPt * 10) / 10,
    sizesPt: [...new Set(shape.paragraphs.flatMap((p) => p.runs.map((run) => run.size)))],
  }));
}

function pythonPptx(file: string): string {
  const run = spawnSync('python', ['-c', 'import sys\nfrom pptx import Presentation\np = Presentation(sys.argv[1])\nprint(len(p.slides), sum(1 for s in p.slides for sh in s.shapes if sh.shape_type == 13))', file], { encoding: 'utf8', windowsHide: true });
  if (run.error || run.status !== 0) return run.error ? 'skipped: no python' : `failed: ${(run.stderr || '').trim().split('\n').at(-1)}`;
  const [slides, pictures] = run.stdout.trim().split(/\s+/).map(Number);
  return `opened: ${slides} slides, ${pictures} pictures`;
}

async function checkPptx(browser: Browser, deck: DeckResult): Promise<void> {
  if (!deck.file) return;
  const { default: JSZip } = await import('jszip');
  const at = `${deck.profile} pptx`;
  try {
    const zip = await JSZip.loadAsync(fs.readFileSync(deck.file));
    const names = Object.keys(zip.files);
    const slideFiles = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => Number(/(\d+)\.xml/.exec(a)![1]) - Number(/(\d+)\.xml/.exec(b)![1]));
    const media = names.filter((name) => name.startsWith('ppt/media/') && !name.endsWith('/'));
    const xml = await Promise.all(slideFiles.map((name) => zip.file(name)!.async('string')));
    const shapes = xml.flatMap((slide, i) => slideShapes(slide, i + 1));
    const fits = await layoutFits(browser, shapes);
    const overflow = fits.filter((fit) => fit.contentHeightPt > fit.boxHeightPt + 0.5);
    const tightest = [...fits].sort((a, b) => b.contentHeightPt / b.boxHeightPt - a.contentHeightPt / a.boxHeightPt)[0] ?? null;
    const langs = [...new Set(xml.flatMap((slide) => [...slide.matchAll(/\blang="([^"]+)"/g)].map((m) => m[1])))];
    const text = xml.map((slide) => [...slide.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => unescape(m[1])).join(' ')).join(' ');
    deck.pptx = {
      slides: slideFiles.length,
      media: media.length,
      aiLabelLast: !!xml.at(-1)?.includes(AI_LABEL[deck.locale]),
      langs,
      overflow,
      tightest,
      pythonPptx: pythonPptx(deck.file),
    };
    if (!zip.file('ppt/presentation.xml') || !zip.file('[Content_Types].xml')) deck.failures.push(`${at}: not a presentation`);
    if (slideFiles.length !== deck.slidesShown + 2) deck.failures.push(`${at}: ${slideFiles.length} slides, expected cover + ${deck.slidesShown} + the AI label`);
    if (media.length !== deck.pictures) deck.failures.push(`${at}: ${media.length} pictures in the file, ${deck.pictures} shown`);
    if (!deck.pptx.aiLabelLast) deck.failures.push(`${at}: the last slide is not the AI label`);
    if (overflow.length) deck.failures.push(`${at}: ${overflow.length} text box(es) overflow: ${overflow.map((fit) => `slide ${fit.slide} «${fit.text.slice(0, 40)}» ${fit.contentHeightPt}/${fit.boxHeightPt}pt`).join('; ')}`);
    if (deck.locale === 'uz' && asciiApostrophes(text).length) deck.failures.push(`${at}: ASCII apostrophes in the file: ${asciiApostrophes(text).slice(0, 5).join(', ')}`);
    if (deck.pptx.pythonPptx.startsWith('failed')) deck.failures.push(`${at}: python-pptx ${deck.pptx.pythonPptx}`);
  } catch (error) {
    deck.failures.push(`${at}: does not unzip (${error instanceof Error ? error.message : 'unknown'})`);
  }
}

function argument(name: string): string | null {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] ?? null : null;
}

async function main(): Promise<void> {
  const origin = (argument('--origin') ?? '').replace(/\/$/, '');
  const outDir = argument('--out');
  if (!/^https?:\/\/[^/]+$/.test(origin) || !outDir) throw new Error('Usage: device-check.ts --origin <http(s)://host[:port]> --out <dir> [--decks a,b] [--pages uz,ru]');
  const deckProfiles = (argument('--decks') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  for (const id of deckProfiles) if (!DECK_TOPICS[id]) throw new Error(`Unknown deck profile ${id}`);
  const locales = (argument('--pages') ?? 'uz,ru').split(',').filter((locale): locale is Locale => locale === 'uz' || locale === 'ru');
  fs.mkdirSync(outDir, { recursive: true });
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
  const pages: PageResult[] = [];
  const decks: DeckResult[] = [];
  try {
    for (const profile of PROFILES) {
      const context = await profileContext(browser, profile);
      const deckPlan = deckProfiles.includes(profile.id) ? DECK_TOPICS[profile.id] : null;
      for (const locale of locales) {
        const { result, page } = await checkPage(context, origin, profile, locale);
        pages.push(result);
        if (deckPlan && deckPlan.locale === locale) {
          const deck = await makeDeck(page, profile, outDir);
          await checkPptx(browser, deck);
          decks.push(deck);
        }
        await page.close();
      }
      if (deckPlan && !locales.includes(deckPlan.locale)) {
        const { result, page } = await checkPage(context, origin, profile, deckPlan.locale);
        pages.push(result);
        const deck = await makeDeck(page, profile, outDir);
        await checkPptx(browser, deck);
        decks.push(deck);
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const failures = [...pages.flatMap((page) => page.failures), ...decks.flatMap((deck) => deck.failures)];
  const report = {
    status: failures.length ? 'fail' : 'pass',
    origin,
    checkedAt: new Date().toISOString(),
    profiles: PROFILES.map(({ id, label }) => ({ id, label })),
    pages,
    decks,
    failures,
  };
  fs.writeFileSync(path.join(outDir, 'device-check.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    status: report.status,
    pages: pages.length,
    decks: decks.map((deck) => ({ profile: deck.profile, topic: deck.topic, seconds: deck.seconds, outcome: deck.outcome, pptx: deck.pptx && { slides: deck.pptx.slides, media: deck.pptx.media, overflow: deck.pptx.overflow.length, python: deck.pptx.pythonPptx } })),
    failures,
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'device-check failed.');
    process.exitCode = 1;
  });
}
