/**
 * The device check of the studio, automated (STUDIO-SPEC §14.5): by the
 * owner's decision of 2026-10-07 it replaces the 15-minute phone checklist.
 *
 *   npx tsx apps/studio/scripts/device-check.ts --origin http://127.0.0.1:8788 --out <dir>
 *            [--decks ios-safari,android-chrome,...]   profiles that make a real deck (default: none)
 *            [--pages uz,ru]                           pages to open in every profile
 *            [--schemes light,dark]                    colour schemes each page is opened in (default both)
 *            [--profiles a,b]                          only these profiles (default: all)
 *            [--replay <dir>/<profile>-<locale>.recording.json]
 *                                                      every profile plays a recorded deck (no generation)
 *
 * --origin is a running site: `wrangler pages dev dist` with STUDIO_LOCAL_DEV
 * (the release rehearsal) or https://gptbot.uz after the deploy. A deck is a
 * real generation (Z.ai, Workers AI) and spends that browser's free deck of
 * the day, so --decks is explicit; without it nothing is generated.
 *
 * Each real deck also leaves <out>/<profile>-<locale>.recording.json (and its
 * pictures): the studio API's answers in order. --replay serves those answers
 * to the page instead of the site (Playwright routes every /api/studio/ call,
 * nothing reaches the server), so the result, the download and the limit
 * after it are checked on every screen and in both schemes without spending
 * a deck. The test Turnstile key in a local recording passes on any host.
 *
 * Every profile is Chromium (the local Chrome) with the device's user agent,
 * screen, pixel ratio and touch; Telegram's in-app bridge
 * (window.TelegramWebviewProxy) is injected the way its in-app browser has it.
 *
 * For each profile, page and colour scheme (prefers-color-scheme light and
 * dark: the studio has one dark look, and nothing may half-switch):
 *   page     200, the island hydrates, one H1, no sideways scroll, the submit
 *            button on the first screen and at least 44 px high, form fields
 *            at least 16 px (smaller makes iOS zoom in on focus), the
 *            «Brauzerda oching» notice shown exactly in an in-app browser and
 *            before the button, layout shift < 0.05, no console error;
 *   view     nothing overlaps (the line boxes of the visible text, the form
 *            controls and the pictures; a thing and what it contains do not
 *            count), no text cut off (a select's chosen option, a field's
 *            placeholder, a box that hides its overflow), on a touch screen
 *            every link and control at least 44 × 44 px (a link inside a
 *            sentence excepted, as WCAG 2.5.8 does), and every text at WCAG
 *            AA contrast (axe-core color-contrast; skipped if absent); the
 *            first screen is saved as <out>/shots/<profile>-<locale>-<scheme>.jpg.
 * For each --decks profile, on its first page (with --replay: every profile,
 * every scheme):
 *   deck     the real flow: topic, audience, slides, submit, wait (≤150 s);
 *            the result cards hold their text (nothing clipped), the pictures
 *            come from blob: URLs and load, the Uzbek text uses ‘ and ’ (no
 *            ASCII apostrophe in o‘/g‘ and no Cyrillic); the result passes the
 *            view checks above; the download saves a .pptx; a second submit
 *            the same day shows the limit at once.
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
 * Writes <out>/device-check.json, <out>/<profile>-<locale>.pptx and the
 * screenshots in <out>/shots/; prints a summary. Exit code 1 when any check
 * fails.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { AI_LABEL } from '../src/pptx/build';
import { TEXTS } from '../src/tools/presentation/texts';

type Locale = 'uz' | 'ru';
type InApp = 'instagram' | 'telegram' | null;
type Scheme = 'light' | 'dark';

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

/**
 * The phones and screens of the check. 320 × 568 is the narrowest phone still
 * met; 360 × 612 is what Telegram's in-app browser leaves of a 360 × 800
 * Android screen (status bar, its own title bar, the navigation bar), with
 * the user agent it sends; 768 × 1024 is a tablet held upright.
 */
export const PROFILES: readonly DeviceProfile[] = [
  { id: 'ios-safari-small', label: 'iPhone SE (1st gen), Safari (320×568)', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.6 Mobile/15E148 Safari/604.1', viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, mobile: true, inApp: null, ios: true },
  { id: 'ios-safari-se', label: 'iPhone SE, Safari (375×667)', userAgent: `${IOS} Version/17.6 Mobile/15E148 Safari/604.1`, viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, mobile: true, inApp: null, ios: true },
  { id: 'ios-safari', label: 'iPhone 14, Safari (390×844)', userAgent: `${IOS} Version/17.6 Mobile/15E148 Safari/604.1`, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, mobile: true, inApp: null, ios: true },
  { id: 'android-chrome', label: 'Samsung A14, Chrome (360×800)', userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, mobile: true, inApp: null },
  { id: 'android-chrome-large', label: 'Android, Chrome (412×915)', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, mobile: true, inApp: null },
  { id: 'instagram-ios', label: 'Instagram, iPhone (390×844)', userAgent: `${IOS} Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_6; uz_UZ; uz; scale=3.00; 1170x2532; 614066429)`, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, mobile: true, inApp: 'instagram', ios: true },
  { id: 'instagram-android', label: 'Instagram, Android (360×800)', userAgent: `${ANDROID_WEBVIEW} Instagram 337.0.0.35.102 Android (34/14; 450dpi; 1080x2208; samsung; SM-A145F; a14; mt6769; uz_UZ; 614066429)`, viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, mobile: true, inApp: 'instagram' },
  { id: 'telegram-ios', label: 'Telegram, iPhone (390×844)', userAgent: `${IOS} Mobile/15E148`, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, mobile: true, inApp: 'telegram', telegramBridge: true, ios: true },
  { id: 'telegram-android', label: 'Telegram, Android (360×612)', userAgent: `${ANDROID_WEBVIEW} Telegram-Android/11.14.1 (Samsung SM-A145F; Android 14; SDK 34; AVERAGE)`, viewport: { width: 360, height: 612 }, deviceScaleFactor: 2, mobile: true, inApp: 'telegram', telegramBridge: true },
  { id: 'ipad-safari', label: 'iPad, Safari (768×1024)', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, mobile: true, inApp: null, ios: true },
  { id: 'desktop-chrome', label: 'Desktop Chrome (1366×768)', viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, mobile: false, inApp: null },
];

const PAGES: Record<Locale, string> = { uz: '/uz/taqdimot-ai/', ru: '/ru/prezentatsiya-ai/' };

export interface DeckPlan {
  readonly locale: Locale;
  readonly topic: string;
  readonly audience: 'maktab' | 'talaba' | 'umumiy';
  readonly slides: 4 | 5 | 6;
}

/** The topic each deck profile asks for (school topics: history, maths, science). */
export const DECK_TOPICS: Record<string, DeckPlan> = {
  'ios-safari': { locale: 'uz', topic: 'Amir Temur davlati', audience: 'maktab', slides: 6 },
  'android-chrome': { locale: 'ru', topic: 'Круговорот воды в природе', audience: 'maktab', slides: 5 },
  'instagram-android': { locale: 'uz', topic: 'Kasrlarni qo‘shish va ayirish', audience: 'maktab', slides: 4 },
  'telegram-ios': { locale: 'uz', topic: 'O‘zbekiston Respublikasi Konstitutsiyasi', audience: 'umumiy', slides: 6 },
  'desktop-chrome': { locale: 'uz', topic: 'Fotosintez', audience: 'talaba', slides: 6 },
  'ios-safari-se': { locale: 'ru', topic: 'Великий шёлковый путь', audience: 'talaba', slides: 6 },
  'instagram-ios': { locale: 'uz', topic: 'Suvning tabiatda aylanishi', audience: 'maktab', slides: 5 },
  'telegram-android': { locale: 'ru', topic: 'Великий шёлковый путь', audience: 'talaba', slides: 6 },
  'ios-safari-small': { locale: 'uz', topic: 'Pifagor teoremasi', audience: 'maktab', slides: 5 },
  'android-chrome-large': { locale: 'ru', topic: 'Квадратные уравнения', audience: 'maktab', slides: 6 },
  'ipad-safari': { locale: 'ru', topic: 'Солнечная система', audience: 'maktab', slides: 4 },
};

export const LIMITS = { layoutShift: 0.05, tapTarget: 44, iosFieldFont: 16, deckSeconds: 150 } as const;

/**
 * tsx compiles this file with esbuild's keepNames, which turns a named function
 * inside page.evaluate into `__name(fn, "name")`; the page has no `__name`
 * ("ReferenceError: __name is not defined"). Every context gets an identity
 * `__name` first, as a string so that it is not compiled itself.
 */
export const NAME_SHIM = 'globalThis.__name = globalThis.__name || ((target) => target);';

/** axe-core's browser build (a dev dependency of the site), or null when it is not installed. */
const AXE_SOURCE: string | null = (() => {
  try {
    return fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
  } catch {
    return null;
  }
})();

/** What the view checks found on one screen. */
export interface ViewAudit {
  /** Pairs of things drawn over each other. */
  overlaps: string[];
  /** Links and controls under 44 × 44 px on a touch screen. */
  smallTargets: string[];
  /** Links inside a sentence, excepted from the target size (WCAG 2.5.8 «inline»). */
  inlineLinks: number;
  /** Text that does not fit where it is shown. */
  clipped: string[];
  /**
   * axe-core color-contrast at WCAG AA, text over the page's gradient worked
   * out here (`gradients`: how many); `incomplete`: what neither could judge.
   * Null when axe-core is absent.
   */
  contrast: { violations: string[]; gradients: number; incomplete: number; incompleteSamples: string[] } | null;
}

export interface PageResult {
  profile: string;
  locale: Locale;
  scheme: Scheme;
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
  view: ViewAudit;
  screenshot: string;
  /**
   * A hash of every drawn element's colours (text, background, gradient,
   * border, color-scheme): the same in both schemes means nothing switched.
   * (Screenshots are not compared: a gradient's dithering differs by a few
   * levels from one paint to the next.)
   */
  styleSha: string;
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
  scheme: Scheme;
  replayed: boolean;
  topic: string;
  seconds: number | null;
  outcome: string;
  slidesShown: number;
  pictures: number;
  clippedCards: number[];
  asciiApostrophes: string[];
  cyrillicInUz: boolean;
  view: ViewAudit | null;
  screenshot: string | null;
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

/** One answer of the studio API, as the page received it. */
export interface RecordedCall {
  method: string;
  /** The path after /api/studio/, the job id written `:job`. */
  path: string;
  /** For a picture: its index in the request. */
  index: number | null;
  status: number;
  contentType: string;
  /** A text answer. */
  body: string | null;
  /** A binary answer (a picture), next to the recording. */
  file: string | null;
}

export interface Recording {
  recordedAt: string;
  origin: string;
  profile: string;
  plan: DeckPlan;
  calls: RecordedCall[];
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
  await context.addInitScript({ content: NAME_SHIM });
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

/** Overlaps, cut-off text and small targets of what the page shows now (runs in the page). */
async function layoutAudit(page: Page, touch: boolean): Promise<Omit<ViewAudit, 'contrast'>> {
  return page.evaluate(({ touch, minTarget }) => {
    const describe = (el: Element): string => {
      const text = (el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || el.textContent || (el as HTMLInputElement).name || '')
        .trim().replace(/\s+/g, ' ').slice(0, 32);
      return `${el.tagName.toLowerCase()}«${text}»`;
    };
    const seen = new Map<Element, boolean>();
    /** Not drawn: display, visibility, opacity, or visually hidden for screen readers only (sr-only). */
    const hidden = (el: Element): boolean => {
      const known = seen.get(el);
      if (known !== undefined) return known;
      let result = !(el as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true });
      for (let node: Element | null = el; !result && node && node !== document.documentElement; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.clipPath.startsWith('inset(50%')) result = true;
        else if (style.position === 'absolute' && style.clip && style.clip !== 'auto') result = true;
        else if (style.position === 'absolute' && style.overflow === 'hidden' && (node.clientWidth <= 1 || node.clientHeight <= 1)) result = true;
      }
      seen.set(el, result);
      return result;
    };

    // What is drawn: the line boxes of the visible text, the controls and the pictures.
    interface Item { el: Element; rect: DOMRect; label: string; box: boolean }
    const items: Item[] = [];
    const NOT_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SELECT', 'OPTION', 'OPTGROUP', 'TEXTAREA', 'TITLE']);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim();
      const parent = node.parentElement;
      if (!text || !parent || NOT_TEXT.has(parent.tagName) || hidden(parent)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width > 0.5 && rect.height > 0.5) items.push({ el: parent, rect, label: `«${text.slice(0, 32)}»`, box: false });
      }
    }
    for (const el of Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea, button, img, svg, iframe, video, canvas'))) {
      // A decorative icon (aria-hidden) sits on its control on purpose.
      if (hidden(el) || el.closest('[aria-hidden="true"]')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width >= 1 && rect.height >= 1) items.push({ el, rect, label: describe(el), box: true });
    }
    const overlaps = new Set<string>();
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        if (a.el === b.el) continue;
        // A control and what it holds (its own text, an icon) are one thing.
        if ((a.box && a.el.contains(b.el)) || (b.box && b.el.contains(a.el))) continue;
        const ix = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const iy = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (ix > 2 && iy > Math.max(2, 0.3 * Math.min(a.rect.height, b.rect.height))) {
          overlaps.add(`${a.label} ↔ ${b.label} at ${Math.round(Math.max(a.rect.left, b.rect.left))},${Math.round(Math.max(a.rect.top, b.rect.top) + window.scrollY)}`);
        }
      }
    }

    // Text that does not fit: every option of a select, a field's placeholder, a box that hides its overflow.
    const clipped: string[] = [];
    const context = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    const width = (text: string, el: Element) => {
      const style = getComputedStyle(el);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return context.measureText(text).width;
    };
    const room = (el: HTMLElement) => {
      const style = getComputedStyle(el);
      return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    };
    for (const select of Array.from(document.querySelectorAll('select'))) {
      if (hidden(select)) continue;
      // A native arrow (appearance: auto) takes about 20 px of the content box.
      const space = room(select) - (getComputedStyle(select).appearance === 'none' ? 0 : 20);
      for (const option of Array.from(select.options)) {
        const need = width(option.text, select);
        if (need > space + 1) clipped.push(`${describe(select)} option «${option.text}»: ${Math.round(need)} > ${Math.round(space)} px`);
      }
    }
    for (const field of Array.from(document.querySelectorAll('input[placeholder], textarea[placeholder]')) as HTMLInputElement[]) {
      if (hidden(field) || !field.placeholder) continue;
      const need = width(field.placeholder, field);
      if (need > room(field) + 1) clipped.push(`${describe(field)} placeholder: ${Math.round(need)} > ${Math.round(room(field))} px`);
    }
    for (const el of Array.from(document.body.querySelectorAll('*')) as HTMLElement[]) {
      if (NOT_TEXT.has(el.tagName) || el.tagName === 'INPUT' || hidden(el)) continue;
      if (!Array.from(el.childNodes).some((child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim())) continue;
      const style = getComputedStyle(el);
      const cutX = style.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1;
      const cutY = style.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 1;
      if (cutX || cutY) clipped.push(`${describe(el)}: ${el.scrollWidth}×${el.scrollHeight} in ${el.clientWidth}×${el.clientHeight}`);
    }

    // Tap targets on a touch screen.
    const smallTargets: string[] = [];
    let inlineLinks = 0;
    if (touch) {
      for (const el of Array.from(document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"]'))) {
        if (hidden(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width >= minTarget - 0.5 && rect.height >= minTarget - 0.5) continue;
        if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') {
          let block = el.parentElement;
          while (block && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement;
          if (block && (block.textContent ?? '').trim().length > (el.textContent ?? '').trim().length + 2) {
            inlineLinks += 1;
            continue;
          }
        }
        smallTargets.push(`${describe(el)} ${Math.round(rect.width)}×${Math.round(rect.height)}`);
      }
    }
    return { overlaps: [...overlaps].slice(0, 20), smallTargets, inlineLinks, clipped };
  }, { touch, minTarget: LIMITS.tapTarget });
}

/**
 * WCAG AA contrast of every text on the page (axe-core color-contrast), or
 * null without axe-core. axe cannot judge text over a gradient (the site's
 * body has three soft radial glows) and leaves it «incomplete»; for those the
 * worst case is computed here instead: the text against the nearest solid
 * background, against each gradient colour over it, and against all of them
 * stacked (the lightest the glows can make a dark page).
 */
async function contrastAudit(page: Page): Promise<ViewAudit['contrast']> {
  if (!AXE_SOURCE) return null;
  await page.evaluate(AXE_SOURCE);
  return page.evaluate(async () => {
    interface AxeNode { target: string[]; any: Array<{ data?: Record<string, unknown>; message?: string }> }
    interface AxeRule { nodes: AxeNode[] }
    interface Rgba { r: number; g: number; b: number; a: number }
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: AxeRule[]; incomplete: AxeRule[] }> } }).axe;
    const result = await axe.run(document, {
      runOnly: { type: 'rule', values: ['color-contrast'] },
      resultTypes: ['violations', 'incomplete'],
      iframes: false,
    });
    const violations = result.violations.flatMap((rule) => rule.nodes.map((node) => {
      const data = node.any[0]?.data ?? {};
      return `${node.target.join(' ')}: ${String(data.fgColor)} on ${String(data.bgColor)} = ${String(data.contrastRatio)}:1, needs ${String(data.expectedContrastRatio)}`;
    }));
    const colours = (value: string): Rgba[] => [...value.matchAll(/rgba?\(([^)]+)\)/g)].map((match) => {
      const [r, g, b, a] = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a: Number.isFinite(a) ? a : 1 };
    });
    const over = (top: Rgba, bottom: Rgba): Rgba => ({
      r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1,
    });
    const luminance = (c: Rgba) => {
      const channel = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
    };
    const ratio = (x: Rgba, y: Rgba) => {
      const [light, dark] = [luminance(x), luminance(y)].sort((p, q) => q - p);
      return (light + 0.05) / (dark + 0.05);
    };
    const unresolved: AxeNode[] = [];
    let gradients = 0;
    for (const node of result.incomplete.flatMap((rule) => rule.nodes)) {
      const el = node.any[0]?.data?.messageKey === 'bgGradient' ? document.querySelector(node.target.at(-1) ?? '') : null;
      if (!el) {
        unresolved.push(node);
        continue;
      }
      // The see-through layers under the text, top first, down to what hides
      // everything below: a solid colour, or a gradient of solid colours (each
      // of its colours may be the one behind a letter).
      const layers: Rgba[] = [];
      let floor: Rgba[] = [{ r: 255, g: 255, b: 255, a: 1 }];
      for (let at: Element | null = el; at; at = at.parentElement) {
        const style = getComputedStyle(at);
        const image = colours(style.backgroundImage);
        if (image.length && image.every((c) => c.a >= 1)) { floor = image; break; }
        layers.push(...image.filter((c) => c.a > 0));
        const solid = colours(style.backgroundColor)[0];
        if (solid && solid.a >= 1) { floor = [solid]; break; }
        if (solid && solid.a > 0) layers.push(solid);
      }
      const style = getComputedStyle(el);
      const text = colours(style.color)[0];
      const backgrounds = floor.flatMap((base) => [
        base,
        [...layers].reverse().reduce((under, layer) => over(layer, under), base),
        ...layers.map((layer) => over(layer, base)),
      ]);
      const worst = Math.min(...backgrounds.map((background) => ratio(over(text, background), background)));
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      const needs = large ? 3 : 4.5;
      gradients += 1;
      if (worst < needs) violations.push(`${node.target.join(' ')}: ${style.color} over the gradient, worst ${worst.toFixed(2)}:1, needs ${needs}`);
    }
    return {
      violations,
      gradients,
      incomplete: unresolved.length,
      incompleteSamples: unresolved.slice(0, 5).map((node) => `${node.target.join(' ')}: ${String(node.any[0]?.data?.messageKey ?? node.any[0]?.message ?? '')}`),
    };
  });
}

/** Every view check of the page as it is now; the failures go to `failures`, prefixed with `at`. */
async function auditView(page: Page, profile: DeviceProfile, at: string, failures: string[]): Promise<ViewAudit> {
  const view: ViewAudit = { ...(await layoutAudit(page, profile.mobile)), contrast: await contrastAudit(page) };
  for (const overlap of view.overlaps) failures.push(`${at}: overlap ${overlap}`);
  for (const target of view.smallTargets) failures.push(`${at}: tap target under ${LIMITS.tapTarget} px: ${target}`);
  for (const cut of view.clipped) failures.push(`${at}: text cut off: ${cut}`);
  for (const low of view.contrast?.violations ?? []) failures.push(`${at}: contrast below AA: ${low}`);
  return view;
}

function sha16(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

async function checkPage(
  context: BrowserContext,
  origin: string,
  profile: DeviceProfile,
  locale: Locale,
  scheme: Scheme,
  outDir: string,
  prepare?: (page: Page) => Promise<void>,
): Promise<{ result: PageResult; page: Page }> {
  const page = await context.newPage();
  const errors: string[] = [];
  watchConsole(page, errors);
  await page.emulateMedia({ colorScheme: scheme });
  if (prepare) await prepare(page);
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
  const at = `${profile.id} ${PAGES[locale]} ${scheme}`;
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
  const shotFile = path.join('shots', `${profile.id}-${locale}-${scheme}.jpg`);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  fs.writeFileSync(path.join(outDir, shotFile), await page.screenshot({ type: 'jpeg', quality: 70 }));
  const styles = await page.evaluate(() => Array.from(document.querySelectorAll('html, body, body *')).map((el) => {
    const style = getComputedStyle(el);
    return [el.tagName, style.color, style.backgroundColor, style.backgroundImage, style.borderTopColor, style.colorScheme, style.fill].join('|');
  }).join(' '));
  const view = await auditView(page, profile, at, failures);
  for (const error of errors) failures.push(`${at}: console: ${error}`);
  return { result: { profile: profile.id, locale, scheme, status, hydrated, ...probe, view, screenshot: shotFile.replace(/\\/g, '/'), styleSha: sha16(Buffer.from(styles)), failures }, page };
}

/** «o'», «g'» and the tutuq belgisi written with an ASCII or modifier apostrophe instead of ‘ / ’. */
export function asciiApostrophes(text: string): string[] {
  return [...new Set(text.match(/\p{L}*['`ʻʼ]\p{L}*/gu) ?? [])];
}

/** The path of a studio API URL after /api/studio/, with the job id as `:job`. */
export function apiPath(url: string): string {
  return new URL(url).pathname.replace(/^\/api\/studio\//, '').replace(/sj_[A-Za-z0-9]+/, ':job');
}

function pictureIndex(postData: string | null): number | null {
  try {
    const data: unknown = postData ? JSON.parse(postData) : null;
    const index = (data as { index?: unknown } | null)?.index;
    return typeof index === 'number' ? index : null;
  } catch {
    return null;
  }
}

/** Keeps every studio API answer the page receives, in order; pictures go to `dir`. */
function recordCalls(page: Page, dir: string, name: string): { calls: RecordedCall[]; settled: () => Promise<void> } {
  const calls: RecordedCall[] = [];
  const pending: Array<Promise<void>> = [];
  page.on('response', (response) => {
    if (!response.url().includes('/api/studio/')) return;
    const request = response.request();
    const contentType = response.headers()['content-type'] ?? '';
    const call: RecordedCall = { method: request.method(), path: apiPath(response.url()), index: pictureIndex(request.postData()), status: response.status(), contentType, body: null, file: null };
    calls.push(call);
    pending.push(response.body().then((bytes) => {
      if (contentType.startsWith('image/')) {
        call.file = `${name}-picture-${call.index ?? calls.indexOf(call)}.jpg`;
        fs.writeFileSync(path.join(dir, call.file), bytes);
      } else {
        call.body = bytes.toString('utf8');
      }
    }, () => undefined));
  });
  return { calls, settled: async () => { await Promise.all(pending); } };
}

/** Serves `recording` to the page for every /api/studio/ call: nothing reaches the site. */
async function replayCalls(page: Page, recording: Recording, dir: string): Promise<void> {
  const key = (method: string, apiCall: string, index: number | null) => `${method} ${apiCall}${index === null ? '' : `#${index}`}`;
  const queues = new Map<string, RecordedCall[]>();
  for (const call of recording.calls) {
    const name = key(call.method, call.path, call.index);
    queues.set(name, [...(queues.get(name) ?? []), call]);
  }
  await page.route('**/api/studio/**', async (route) => {
    const request = route.request();
    const queue = queues.get(key(request.method(), apiPath(request.url()), pictureIndex(request.postData())));
    if (!queue?.length) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false,"code":"not_found","error":"not recorded"}' });
      return;
    }
    // In order; the last answer repeats.
    const call = queue.length > 1 ? (queue.shift() as RecordedCall) : queue[0];
    await route.fulfill({
      status: call.status,
      contentType: call.contentType || 'application/json',
      body: call.file ? fs.readFileSync(path.join(dir, call.file)) : call.body ?? '',
    });
  });
}

async function makeDeck(page: Page, profile: DeviceProfile, plan: DeckPlan, scheme: Scheme, outDir: string, replayed: boolean): Promise<DeckResult> {
  const texts = TEXTS[plan.locale];
  const failures: string[] = [];
  const name = replayed ? `${profile.id}-${plan.locale}-${scheme}` : `${profile.id}-${plan.locale}`;
  const at = `${profile.id} deck${replayed ? ` (replay, ${scheme})` : ''}`;
  const base: DeckResult = {
    profile: profile.id, locale: plan.locale, scheme, replayed, topic: plan.topic, seconds: null, outcome: 'not started', slidesShown: 0, pictures: 0,
    clippedCards: [], asciiApostrophes: [], cyrillicInUz: false, view: null, screenshot: null, file: null, bytes: 0, pptx: null, limitAfter: '', failures,
  };
  const recorder = replayed ? null : recordCalls(page, outDir, name);
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
  base.view = await auditView(page, profile, `${at} result`, failures);
  const shotFile = path.join('shots', `result-${name}.jpg`);
  await page.locator('#studio-root').screenshot({ path: path.join(outDir, shotFile), type: 'jpeg', quality: 60 }).then(
    () => { base.screenshot = shotFile.replace(/\\/g, '/'); },
    () => failures.push(`${at}: no screenshot of the result`),
  );
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.click('#studio-root [data-studio-download] button'),
  ]);
  const file = path.join(outDir, `${name}.pptx`);
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
  if (recorder) {
    await recorder.settled();
    const recording: Recording = { recordedAt: new Date().toISOString(), origin: new URL(page.url()).origin, profile: profile.id, plan, calls: recorder.calls };
    fs.writeFileSync(path.join(outDir, `${name}.recording.json`), `${JSON.stringify(recording, null, 2)}\n`);
  }
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
  await context.addInitScript({ content: NAME_SHIM });
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
  const at = `${deck.profile} pptx${deck.replayed ? ` (replay, ${deck.scheme})` : ''}`;
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
  if (!/^https?:\/\/[^/]+$/.test(origin) || !outDir) {
    throw new Error('Usage: device-check.ts --origin <http(s)://host[:port]> --out <dir> [--decks a,b | --replay <recording.json>] [--pages uz,ru] [--schemes light,dark] [--profiles a,b]');
  }
  const deckProfiles = (argument('--decks') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  for (const id of deckProfiles) if (!DECK_TOPICS[id]) throw new Error(`Unknown deck profile ${id}`);
  const replayFile = argument('--replay');
  if (replayFile && deckProfiles.length) throw new Error('--decks makes real decks, --replay plays a recorded one: one or the other.');
  const replay: Recording | null = replayFile ? JSON.parse(fs.readFileSync(replayFile, 'utf8')) as Recording : null;
  const replayDir = replayFile ? path.dirname(replayFile) : '';
  const locales = (argument('--pages') ?? 'uz,ru').split(',').filter((locale): locale is Locale => locale === 'uz' || locale === 'ru');
  const schemes = (argument('--schemes') ?? 'light,dark').split(',').filter((scheme): scheme is Scheme => scheme === 'light' || scheme === 'dark');
  const only = (argument('--profiles') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  for (const id of [...only, ...deckProfiles]) if (!PROFILES.some((profile) => profile.id === id)) throw new Error(`Unknown profile ${id}`);
  const profiles = PROFILES.filter((profile) => (only.length ? only.includes(profile.id) : true) || deckProfiles.includes(profile.id));
  if (!locales.length || !schemes.length) throw new Error('--pages and --schemes need at least one value.');
  fs.mkdirSync(path.join(outDir, 'shots'), { recursive: true });
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
  const pages: PageResult[] = [];
  const decks: DeckResult[] = [];
  try {
    for (const profile of profiles) {
      // One context per profile: one browser identity, so one real deck at most.
      const context = await profileContext(browser, profile);
      const deckPlan = replay ? replay.plan : deckProfiles.includes(profile.id) ? DECK_TOPICS[profile.id] : null;
      const pageLocales = deckPlan && !locales.includes(deckPlan.locale) ? [...locales, deckPlan.locale] : locales;
      for (const locale of pageLocales) {
        for (const [i, scheme] of schemes.entries()) {
          const prepare = replay ? (page: Page) => replayCalls(page, replay, replayDir) : undefined;
          const { result, page } = await checkPage(context, origin, profile, locale, scheme, outDir, prepare);
          pages.push(result);
          if (deckPlan && deckPlan.locale === locale && (replay || i === 0)) {
            const deck = await makeDeck(page, profile, deckPlan, scheme, outDir, replay !== null);
            await checkPptx(browser, deck);
            decks.push(deck);
          }
          await page.close();
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const failures = [...pages.flatMap((page) => page.failures), ...decks.flatMap((deck) => deck.failures)];
  // The studio has one dark look: colours that differ between the schemes mean something switched.
  const schemeDiffs = schemes.length < 2 ? [] : pages
    .filter((page) => page.scheme === schemes[0])
    .filter((page) => pages.some((other) => other.profile === page.profile && other.locale === page.locale && other.scheme !== page.scheme && other.styleSha !== page.styleSha))
    .map((page) => `${page.profile} ${page.locale}`);
  const report = {
    status: failures.length ? 'fail' : 'pass',
    origin,
    checkedAt: new Date().toISOString(),
    replay: replayFile,
    profiles: profiles.map(({ id, label }) => ({ id, label })),
    schemes,
    contrast: AXE_SOURCE ? 'axe-core color-contrast (WCAG AA)' : 'skipped: axe-core not installed',
    schemeDiffs,
    pages,
    decks,
    failures,
  };
  fs.writeFileSync(path.join(outDir, 'device-check.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    status: report.status,
    pages: pages.length,
    contrast: report.contrast,
    schemeDiffs,
    decks: decks.map((deck) => ({
      profile: deck.profile, scheme: deck.scheme, replayed: deck.replayed, topic: deck.topic, seconds: deck.seconds, outcome: deck.outcome,
      pptx: deck.pptx && { slides: deck.pptx.slides, media: deck.pptx.media, overflow: deck.pptx.overflow.length, python: deck.pptx.pythonPptx },
    })),
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
