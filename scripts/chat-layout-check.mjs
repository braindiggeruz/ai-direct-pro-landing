// The chat pages' layout, alignment and overlap check (chat design 2026-10-06
// §9.1; chat UI 2026-10-07 §11, gptbot.uz-audit/raw/chat-openai-2026-10-07/DESIGN-SPEC.md).
//
//   npm run check:chat-layout -- [--dist dist] [--shots <dir>] [--report <file>] [--quick] [--perf-only]
//
// Serves the built dist/ on 127.0.0.1, opens /uz/gpt-uzbek-tilida/ and
// /ru/gpt-chat/ in Chromium (playwright-core) at the sizes the chat is used at
// — five phones (Telegram's in-app browser 360x612 among them), a 768x1024
// tablet and 1366x768, 1440x900 and 1920x1080 desktops — and drives each state through
// the UI: the resting screen, the keyboard open, the menu drawer, a sent
// question answered with a long maths answer (steps, lists, aligned formula
// sheets, a table, a code block, a quote, the answer box, the check line), the
// «⋯» menu, the top of the thread, «AI o‘ylayapti…», a cut answer with
// «Davom ettir», an error, the hourly limit. Every /api/** request is answered
// here (a guest, billing off, no Telegram bot, free limits 15/5); one the
// check does not know fails the run, so nothing reaches production or its
// database. Requests to other hosts are dropped.
//
// Each state is measured in the page (audit): text under the composer, text
// over text, a control over a control, targets under 44x44 (a link inside a
// sentence: under 24px tall), text contrast under WCAG AA against what is
// behind it, a page wider than the screen, the thread running below the
// composer's top, the composer off screen, not in flow or not opaque; and the
// honesty lines: the footnote (not OpenAI, the privacy link) in every state,
// the header's subtitle whole, no pack button, no price and no Telegram bot
// while the server offers none. The answer's maths: the check line and a step
// heading one text block beside the tick or the badge, no LaTeX left as text,
// no answer box that starts with a line break. The limit card in sight.
//
// And the composition (align, chat UI §11.2): A1 one axis — every block of
// the resting screen, the pill grid and the footnote centred on the content
// box ±1px; A2 one content box — the field, the pills, the bubble's right
// edge, the answer's head, body, sheets, code, table, answer box, the limit
// card, the error and the first action glyph on its edges ±1px; A3 four
// one-line pills of equal width, the gap on the axis; A4 the phone's greeting
// in the middle of the free height, the pills 12px over the field, no thread
// scroll; A5 the desktop group centred on the viewport, the docked composer
// in a conversation; A6 a one-line footnote from 360px; A7 one action row of
// 44px that never wraps, icons only beside «Davom ettir» under 640px, the
// model line at the row's right end from 768px; A8 one surface (no header or
// dock fill, border or hairline); A10 the turn rhythm (16 / 28, 36 from 640px);
// A13 the field's border and the send disc's contrast; A16 no control without
// a name; A17 a light system theme renders the dark app, geometry identical;
// A18 the desktop composer's glide; A19 the keyboard's compact first screen;
// A20 «GPTBot.uz» and the model line on every answer.
//
// Then, on their own pages: the «⋯» menu under a one-line answer (it opens
// below) and under a long question (above), every item reachable by a tap;
// a pinch-zoom with the field focused is no keyboard; the way back to an
// article (#entry=); the header with the pack button (billing on) and the
// pack window's price contrast; the prerendered frame against the mounted chat
// (the tops of the mark, the H1, the greeting, the terms, the pills and the
// field, the links row's bottom, the composer's height, the pill rows) at
// every size, since CLS cannot see a DOM swap; classic (non-overlay)
// scrollbars at 1024x768 and 1366x768. Negative controls put production's
// defects back and must be caught: the rejected composer (fixed, a
// transparent gradient), the 06.10 resting screen (left-aligned, a 12px dock,
// two-line pill labels and footnote, 22px gaps), unequal pill columns, a
// wrapping action row, a button without a name. CLS and LCP are read at
// 360x612, 390x844 and 1366x768 under 4x CPU and Fast 3G. Any failure exits 1.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const DIST = resolve(ROOT, arg('dist', 'dist'));
const SHOTS = resolve(arg('shots', join(tmpdir(), 'gptbot-chat-layout-shots')));
// The default report belongs to the current reviewed revision (scripts/seo-protection.ts BASELINE);
// an older revision's report is never rewritten.
const REPORT = resolve(ROOT, arg('report', 'docs/seo/evidence/2026-10-07-chat-ui/layout-report.json'));
const QUICK = process.argv.includes('--quick');
// Only CLS and LCP, e.g. on another build (--dist) to compare with.
const PERF_ONLY = process.argv.includes('--perf-only');
if (!existsSync(join(DIST, 'uz', 'gpt-uzbek-tilida', 'index.html'))) throw new Error(`No chat build in ${DIST}: run npm run build first.`);
mkdirSync(SHOTS, { recursive: true });

const UA = {
  tg: 'Mozilla/5.0 (Linux; Android 13; SM-A145F Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 Telegram-Android/11.2.3 (Samsung SM-A145F; Android 13; SDK 33; AVERAGE)',
  android: 'Mozilla/5.0 (Linux; Android 12; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  tablet: 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
};
// The sizes, each touch size with the height left above an open keyboard.
const SIZES = [
  { w: 320, h: 568, ua: 'android', kb: 300, touch: true },
  { w: 360, h: 612, ua: 'tg', kb: 330, touch: true },
  { w: 360, h: 740, ua: 'android', kb: 420, touch: true },
  { w: 390, h: 844, ua: 'ios', kb: 480, touch: true },
  { w: 412, h: 915, ua: 'android', kb: 530, touch: true },
  { w: 768, h: 1024, ua: 'tablet', kb: 690, touch: true },
  { w: 1366, h: 768, ua: 'desktop', kb: 0, touch: false },
  { w: 1440, h: 900, ua: 'desktop', kb: 0, touch: false },
  { w: 1920, h: 1080, ua: 'desktop', kb: 0, touch: false },
];
// The spec's own numbers (§4.3 phones: the gap above and below the greeting,
// the pills' and the field's tops; §4.5 desktop: the mark's and the field's
// tops; §4.4 the keyboard: header → kicker and provider note → field), ±2px.
const EXPECT = {
  '320x568': { gap: 37, pills: 362, field: 470 },
  '360x612': { gap: 75, pills: 422, field: 530 },
  '360x740': { gap: 139, pills: 550, field: 658 },
  '390x844': { gap: 191, pills: 654, field: 762 },
  '412x915': { gap: 226, pills: 725, field: 833 },
  '768x1024': { mark: 339, field: 619 },
  '1366x768': { mark: 211, field: 491 },
  '1440x900': { mark: 277, field: 557 },
  '1920x1080': { mark: 367, field: 647 },
  '320x300': { kb: [25, 21] },
  '360x330': { kb: [57, 53] },
  '360x420': { kb: [102, 98] },
  '390x480': { kb: [132, 128] },
  '412x530': { kb: [157, 153] },
  '768x690': { kb: [237, 233] },
};
const PAGES = { uz: '/uz/gpt-uzbek-tilida/', ru: '/ru/gpt-chat/' };
const THEMES = QUICK ? ['dark'] : ['dark', 'light'];
const sizeName = (s) => `${s.w}x${s.h}`;

// ── The answers the check serves ───────────────────────────────────────────
// The reference maths answer of 06.10 §9.1: a cut answer («Davom ettir») here.
const ANSWER = {
  uz: [
    '### 1-qadam. Koeffitsiyentlarni aniqlaymiz',
    'Tenglama \\(x^2 - 4x + 3 = 0\\): a = 1, b = −4, c = 3.',
    '',
    '### 2-qadam. `D` ni hisoblaymiz',
    '$$D = b^{2} - 4ac = (-4)^2 - 4 \\cdot 1 \\cdot 3$$',
    '$$D = 16 - 12 = 4$$',
    '',
    '### 3-qadam. Ildizlarni topamiz',
    '$$x_{1,2} = \\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a} = \\frac{4 \\pm 2}{2}$$',
    '$$x_1 = 3, \\quad x_2 = 1$$',
    '',
    '**Javob:** \\(x_1 = 3\\), \\(x_2 = 1\\)',
    '',
    '**Tekshirish:** x = **3** bo‘lsa, 3² − 4·3 + 3 = 9 − 12 + 3 = 0, ya’ni *tenglik* to‘g‘ri ✓',
  ].join('\n'),
  ru: [
    '### Шаг 1. Находим коэффициенты',
    'Уравнение \\(x^2 - 4x + 3 = 0\\): a = 1, b = −4, c = 3.',
    '',
    '### Шаг 2. Считаем дискриминант `D`',
    '$$D = b^{2} - 4ac = (-4)^2 - 4 \\cdot 1 \\cdot 3$$',
    '$$D = 16 - 12 = 4$$',
    '',
    '### Шаг 3. Находим корни',
    '$$x_{1,2} = \\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a} = \\frac{4 \\pm 2}{2}$$',
    '$$x_1 = 3, \\quad x_2 = 1$$',
    '',
    '**Ответ:** \\(x_1 = 3\\), \\(x_2 = 1\\)',
    '',
    '**Проверка:** при x = **3**: 3² − 4·3 + 3 = 9 − 12 + 3 = 0, то есть *равенство* верно ✓',
  ].join('\n'),
};
// The long answer of chat UI §11.1 (chat-end): steps, a list, two aligned
// sheets, a numbered list, a 3x3 table, a python block, a quote, «JAVOB», the check line.
const LONG = {
  uz: [
    'Kvadrat tenglamani yechish uchun uchta qadam yetarli. Quyida qisqa reja, jadval, kod va tekshiruv bor.',
    '',
    '### 1-qadam. Koeffitsiyentlarni aniqlaymiz',
    'Tenglama \\(x^2 - 4x + 3 = 0\\) ko‘rinishida: bu yerda **a = 1**, **b = −4**, **c = 3**.',
    '',
    '- **a** — bosh koeffitsiyent (nolga teng emas)',
    '- **b** — ikkinchi koeffitsiyent',
    '- **c** — ozod had',
    '',
    '### 2-qadam. Diskriminantni hisoblaymiz',
    '$$',
    'D = b^{2} - 4ac',
    '= (-4)^2 - 4 \\cdot 1 \\cdot 3',
    '= 16 - 12 = 4',
    '$$',
    '',
    '1. Agar D > 0 bo‘lsa — ikkita ildiz bor.',
    '2. Agar D = 0 bo‘lsa — bitta ildiz bor.',
    '3. Agar D < 0 bo‘lsa — haqiqiy ildiz yo‘q.',
    '',
    '| Holat | Ildizlar soni | Misol |',
    '|---|---|---|',
    '| D > 0 | 2 | x² − 4x + 3 = 0 |',
    '| D = 0 | 1 | x² − 2x + 1 = 0 |',
    '| D < 0 | 0 | x² + 1 = 0 |',
    '',
    '### 3-qadam. Ildizlarni topamiz',
    '$$',
    'x_1 = \\frac{4 + 2}{2} = 3',
    'x_2 = \\frac{4 - 2}{2} = 1',
    '$$',
    '',
    '```python',
    'import math',
    'a, b, c = 1, -4, 3',
    'D = b * b - 4 * a * c',
    'print((-b + math.sqrt(D)) / (2 * a), (-b - math.sqrt(D)) / (2 * a))',
    '```',
    '',
    '> Maslahat: avval har doim a, b va c ni alohida yozib oling — xato kamayadi.',
    '',
    '**Javob:** \\(x_1 = 3\\), \\(x_2 = 1\\)',
    '',
    '**Tekshirish:** x = **3** bo‘lsa, 3² − 4·3 + 3 = 9 − 12 + 3 = 0, ya’ni *tenglik* to‘g‘ri ✓',
  ].join('\n'),
  ru: [
    'Чтобы решить квадратное уравнение, хватит трёх шагов. Ниже короткий план, таблица, код и проверка.',
    '',
    '### Шаг 1. Находим коэффициенты',
    'Уравнение \\(x^2 - 4x + 3 = 0\\): здесь **a = 1**, **b = −4**, **c = 3**.',
    '',
    '- **a** — старший коэффициент (не равен нулю)',
    '- **b** — второй коэффициент',
    '- **c** — свободный член',
    '',
    '### Шаг 2. Считаем дискриминант',
    '$$',
    'D = b^{2} - 4ac',
    '= (-4)^2 - 4 \\cdot 1 \\cdot 3',
    '= 16 - 12 = 4',
    '$$',
    '',
    '1. Если D > 0 — два корня.',
    '2. Если D = 0 — один корень.',
    '3. Если D < 0 — действительных корней нет.',
    '',
    '| Случай | Число корней | Пример |',
    '|---|---|---|',
    '| D > 0 | 2 | x² − 4x + 3 = 0 |',
    '| D = 0 | 1 | x² − 2x + 1 = 0 |',
    '| D < 0 | 0 | x² + 1 = 0 |',
    '',
    '### Шаг 3. Находим корни',
    '$$',
    'x_1 = \\frac{4 + 2}{2} = 3',
    'x_2 = \\frac{4 - 2}{2} = 1',
    '$$',
    '',
    '```python',
    'import math',
    'a, b, c = 1, -4, 3',
    'D = b * b - 4 * a * c',
    'print((-b + math.sqrt(D)) / (2 * a), (-b - math.sqrt(D)) / (2 * a))',
    '```',
    '',
    '> Совет: сначала всегда выпишите a, b и c отдельно — ошибок будет меньше.',
    '',
    '**Ответ:** \\(x_1 = 3\\), \\(x_2 = 1\\)',
    '',
    '**Проверка:** при x = **3**: 3² − 4·3 + 3 = 9 − 12 + 3 = 0, то есть *равенство* верно ✓',
  ].join('\n'),
};
const QUESTION = { uz: 'x² − 4x + 3 = 0', ru: 'x² − 4x + 3 = 0' };
// The one-line answer under which «⋯» opens below, and a question long enough that it opens above.
const SHORT = { uz: 'Salom! Qanday yordam bera olaman?', ru: 'Привет! Чем могу помочь?' };
const HELLO = { uz: 'Salom', ru: 'Привет' };
const LONG_QUESTION = {
  uz: 'Salom! Men 9-sinfda o‘qiyman va ertaga algebra bo‘yicha nazorat ishi bor. Kvadrat tenglamalarni yechishni tushunmayapman: diskriminant nima, qachon ildiz bo‘lmaydi, Viet teoremasi qanday ishlaydi? Iltimos, oddiy so‘zlar bilan, misollar bilan tushuntirib ber, keyin menga o‘zim yechishim uchun uchta masala ham ber.',
  ru: 'Привет! Я учусь в 9 классе, и завтра контрольная по алгебре. Не понимаю квадратные уравнения: что такое дискриминант, когда корней нет, как работает теорема Виета? Объясни, пожалуйста, простыми словами и на примерах, а потом дай мне три задачи, чтобы я решил их сам.',
};
const GUEST = { ok: true, loginAvailable: false, mode: null, providers: [], user: null, terms: { ru: null, uz: null }, termsVersion: null, freeLimits: { daily: 15, hourly: 5 }, botHandoff: false };
// Billing on (Click in test mode, a guest may buy): the header's pack button and the pack window.
const BILLING = { ...GUEST, loginAvailable: true, mode: 'live', providers: ['click'], terms: { ru: 'https://gptbot.uz/ru/oferta/', uz: 'https://gptbot.uz/uz/oferta/' }, termsVersion: 'ai-paket-2026-10-v5', guestCheckout: true, pack: { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1 } };
const sse = (locale) => {
  const cut = mode === 'cut' || mode === 'slow-cut';
  const text = mode === 'short' ? SHORT[locale] : cut ? ANSWER[locale] : LONG[locale];
  const parts = text.match(/[\s\S]{1,90}/g);
  return [
    { type: 'meta', sessionId: 'layout-check', model: 'glm-5.3-flash' },
    ...parts.map((part) => ({ type: 'delta', text: part })),
    { type: 'done', remaining: 13, hourRemaining: 3, truncated: cut, charged: !cut, modelUsed: 'glm-5.3-flash' },
  ].map((ev) => `data: ${JSON.stringify(ev)}\n\n`).join('');
};

// ── A static server for dist/, compressed as Cloudflare serves it ──────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml', '.md': 'text/markdown' };
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = join(DIST, path);
  if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  const type = TYPES[extname(file)] || 'application/octet-stream';
  let body = readFileSync(file);
  const headers = { 'Content-Type': type };
  if (/text|javascript|json|xml|svg|markdown/.test(type) && /\bbr\b/.test(req.headers['accept-encoding'] || '')) {
    body = compressed.get(file) ?? compressed.set(file, brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } })).get(file);
    headers['Content-Encoding'] = 'br';
  }
  res.writeHead(200, headers).end(body);
});
const compressed = new Map();
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ── The measurement, run in the page ───────────────────────────────────────
function audit() {
  const vw = innerWidth, vh = innerHeight;
  const composer = document.querySelector('#gpt-chat-root .gpt-composer');
  const thread = document.querySelector('#gpt-chat-root .gpt-thread-scroll');
  const dialog = document.querySelector('[role="dialog"]');
  const layer = (el) => !dialog || dialog.contains(el);
  const cRect = composer.getBoundingClientRect();
  const tRect = thread.getBoundingClientRect();
  const out = { scrollY: Math.round(scrollY), textUnderComposer: [], textOverlaps: [], controlOverlaps: [], smallTargets: [], contrast: [], hOverflow: null, honesty: [], layout: {} };
  const clipping = (s) => /(auto|scroll|hidden|clip)/.test(s.overflowX + s.overflowY);
  const clipBox = (el) => {
    let b = { l: 0, t: 0, r: vw, b: vh };
    for (let a = el; a && a !== document.documentElement && a !== document.body; a = a.parentElement) {
      if (clipping(getComputedStyle(a))) {
        const r = a.getBoundingClientRect();
        b = { l: Math.max(b.l, r.left), t: Math.max(b.t, r.top), r: Math.min(b.r, r.right), b: Math.min(b.b, r.bottom) };
      }
    }
    return b;
  };
  const inter = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  const box = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  const name = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  const hidden = (el) => {
    for (let a = el; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0 || a.inert || a.hidden) return true;
    }
    return false;
  };
  // Seen, not covered: the topmost element at the box's centre is the text's own.
  const onTop = (el, b) => {
    const x = (b.l + b.r) / 2, y = (b.t + b.b) / 2;
    if (x < 0 || y < 0 || x >= vw || y >= vh) return false;
    const top = document.elementFromPoint(x, y);
    return !!top && (top === el || el.contains(top) || top.contains(el));
  };
  // Text line boxes.
  const rects = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.trim() ? 1 : 3) });
  let node, id = 0;
  while ((node = walker.nextNode())) {
    const el = node.parentElement;
    if (!el || el.closest('script,style,noscript,template,.sr-only') || hidden(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const clip = clipBox(el);
    const nid = id++;
    // A glyph box taller than its line (Geist's ascent and descent are 1.3em)
    // is measured as its line: lines that only touch are not text over text.
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      const trim = lh && r.height > lh ? (r.height - lh) / 2 : 0;
      const b = inter({ l: r.left, t: r.top + trim, r: r.right, b: r.bottom - trim }, clip);
      if (b.r - b.l < 1 || b.b - b.t < 1) continue;
      rects.push({ nid, el, text: node.nodeValue.trim().slice(0, 48), box: b, inComposer: composer.contains(el), seen: onTop(el, b) });
    }
  }
  out.layout.textBoxes = rects.length;
  // (1) text of the page or the thread under the composer: geometry only, a cover does not excuse it.
  const c = box(cRect);
  for (const x of rects) {
    if (x.inComposer || !layer(x.el) || (dialog && dialog.contains(x.el))) continue;
    const i = inter(x.box, c);
    if (i.r - i.l > 0.5 && i.b - i.t > 0.5) out.textUnderComposer.push({ text: x.text, el: name(x.el) });
  }
  // (2) text over text. Where two boxes meet, the one under counts as hidden
  // only if something opaque between them paints that very spot (a menu over
  // an answer); text that spills out of its own box over other text counts.
  const opaqueAt = (from, upTo, x, y) => {
    for (let a = from; a && !a.contains(upTo); a = a.parentElement) {
      const bg = getComputedStyle(a).backgroundColor.match(/rgba?\(([^)]+)\)/);
      const alpha = bg ? (bg[1].split(/[ ,/]+/).filter(Boolean).map(Number)[3] ?? 1) : 0;
      const r = a.getBoundingClientRect();
      if (alpha >= 0.95 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  };
  const inLayer = rects.filter((x) => layer(x.el));
  for (let i = 0; i < inLayer.length; i++) for (let j = i + 1; j < inLayer.length; j++) {
    const a = inLayer[i], b = inLayer[j];
    if (a.nid === b.nid) continue;
    const k = inter(a.box, b.box);
    if (k.r - k.l <= 1.5 || k.b - k.t <= 1.5) continue;
    const x = (k.l + k.r) / 2, y = (k.t + k.b) / 2;
    const top = document.elementFromPoint(x, y);
    if (top && (a.el.contains(top) || top.contains(a.el)) && opaqueAt(top, b.el, x, y)) continue;
    if (top && (b.el.contains(top) || top.contains(b.el)) && opaqueAt(top, a.el, x, y)) continue;
    if (top && !a.el.contains(top) && !b.el.contains(top) && !top.contains(a.el) && !top.contains(b.el) && opaqueAt(top, a.el, x, y) && opaqueAt(top, b.el, x, y)) continue;
    out.textOverlaps.push({ a: a.text, b: b.text, w: +(k.r - k.l).toFixed(1), h: +(k.b - k.t).toFixed(1) });
  }
  const seen = rects.filter((x) => x.seen && layer(x.el));
  // Nothing of the header spills out of it.
  const header = document.querySelector('#gpt-chat-root .gpt-header');
  const hRect = header.getBoundingClientRect();
  out.layout.headerSpill = [...header.querySelectorAll('*')].filter((el) => {
    if (hidden(el) || el.closest('.sr-only')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && (r.bottom > hRect.bottom + 0.5 || r.top < hRect.top - 0.5 || r.right > hRect.right + 0.5);
  }).map(name).slice(0, 5);
  // (3) controls: over each other, and their size.
  const controls = [...document.querySelectorAll('button, a[href], textarea, input, summary, [role="button"]')].filter((el) => {
    if (el.closest('.sr-only') || hidden(el) || !layer(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const k = inter(box(r), clipBox(el));
    return k.r - k.l > 1 && k.b - k.t > 1;
  });
  // A link inside a sentence: text runs beside it that are rendered (a text
  // node, or an inline element with text); a hidden hint is no sentence.
  const inSentence = (el) => el.tagName === 'A' && [...el.parentElement.childNodes].some((n) => {
    if (n === el || !n.textContent.trim()) return false;
    if (n.nodeType === 3) return true;
    if (n.nodeType !== 1) return false;
    const st = getComputedStyle(n), r = n.getBoundingClientRect();
    return st.display.startsWith('inline') && r.width > 0 && r.height > 0;
  });
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    const need = inSentence(el) ? [1, 24] : [43.5, 43.5];
    if (r.width < need[0] || r.height < need[1]) out.smallTargets.push({ el: name(el), text: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) });
  }
  // A control another layer covers (a menu over a row) is out of reach, not overlapped.
  const reach = (el) => {
    const k = inter(box(el.getBoundingClientRect()), clipBox(el));
    const top = document.elementFromPoint((k.l + k.r) / 2, (k.t + k.b) / 2);
    return !!top && (top === el || el.contains(top));
  };
  // The jump-to-latest button floats over the thread by design (an overlay, z-index 3): it is
  // measured for size, not paired with what scrolls under it.
  const inReach = controls.filter((el) => reach(el) && !el.matches('.gpt-jump-latest'));
  for (let i = 0; i < inReach.length; i++) for (let j = i + 1; j < inReach.length; j++) {
    const a = inReach[i], b = inReach[j];
    if (a.contains(b) || b.contains(a) || (inSentence(a) && inSentence(b))) continue;
    const k = inter(inter(box(a.getBoundingClientRect()), clipBox(a)), inter(box(b.getBoundingClientRect()), clipBox(b)));
    if (k.r - k.l > 1 && k.b - k.t > 1) out.controlOverlaps.push({ a: name(a), b: name(b) });
  }
  // (4) contrast of every text in sight against what is behind it.
  const parse = (v) => { const m = v.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const lum = (v) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(v.r) + 0.7152 * f(v.g) + 0.0722 * f(v.b); };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const bgOf = (el) => {
    const stack = [];
    for (let a = el; a; a = a.parentElement) { const v = parse(getComputedStyle(a).backgroundColor); if (v && v.a > 0) { stack.push(v); if (v.a >= 1) break; } }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    if (!stack.length || stack[stack.length - 1].a < 1) base = parse(getComputedStyle(document.body).backgroundColor) || base;
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  };
  const measured = new Set();
  for (const x of seen) {
    if (measured.has(x.el) || x.el.closest('[disabled]')) continue;
    measured.add(x.el);
    const s = getComputedStyle(x.el);
    let fg = parse(s.color);
    if (!fg) continue;
    let op = 1;
    for (let a = x.el; a; a = a.parentElement) op *= +getComputedStyle(a).opacity;
    const bg = bgOf(x.el);
    fg = over({ ...fg, a: fg.a * op }, bg);
    const ratio = (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
    const size = parseFloat(s.fontSize), weight = +s.fontWeight;
    const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
    if (ratio < need) out.contrast.push({ text: x.text, el: name(x.el), ratio: +ratio.toFixed(2), need });
  }
  // (5) the page and the column.
  if (document.documentElement.scrollWidth > vw + 0.5) out.hOverflow = { scrollWidth: document.documentElement.scrollWidth };
  const cs = getComputedStyle(composer);
  out.layout.threadEndsAboveComposer = tRect.bottom <= cRect.top + 0.5;
  out.layout.composerOnScreen = scrollY > 0 ? null : cRect.top >= 0 && cRect.bottom <= vh + 0.5;
  out.layout.composerPosition = cs.position;
  out.layout.composerOpaque = (parse(cs.backgroundColor) || { a: 0 }).a === 1 && cs.backgroundImage === 'none';
  out.layout.composer = Math.round(cRect.height);
  out.layout.thread = Math.round(tRect.height);
  out.layout.header = Math.round(document.querySelector('#gpt-chat-root .gpt-header').getBoundingClientRect().height);
  // (5b) the answer's maths: one text block beside the tick and the badge,
  // whose wrapped lines start at its left edge; no LaTeX left as text; the
  // box's value without a leading break.
  out.sidebarStyle = [];
  for (const panel of document.querySelectorAll('.gpt-sidebar-dialog, .gpt-premium > aside')) {
    if (hidden(panel)) continue;
    const active = panel.querySelector('button[aria-pressed="true"]');
    if (active && !getComputedStyle(active).boxShadow.includes('inset')) out.sidebarStyle.push('active tool');
    const telegram = panel.querySelector('[data-testid="sidebar-telegram"]');
    if (telegram && (parse(getComputedStyle(telegram).backgroundColor)?.a ?? 1) !== 0) out.sidebarStyle.push('Telegram outline');
  }
  out.answerFormat = [];
  for (const math of document.querySelectorAll('#gpt-chat-root .gpt-math')) {
    if (math.getAttribute('role') !== 'math' || !math.getAttribute('aria-label')?.trim()) out.answerFormat.push({ el: 'gpt-math', accessibleLabel: false });
  }
  for (const line of document.querySelectorAll('#gpt-chat-root .gpt-check-line, #gpt-chat-root .gpt-step-head')) {
    const want = line.classList.contains('gpt-check-line') ? 1 : 2;
    if (line.children.length !== want) { out.answerFormat.push({ el: name(line), children: line.children.length }); continue; }
    const block = line.lastElementChild;
    const left = block.getBoundingClientRect().left;
    // The boxes of its text and inline elements, grouped into lines by their middle.
    const boxes = [];
    const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.nodeType === 3) { const range = document.createRange(); range.selectNodeContents(n); boxes.push(...range.getClientRects()); }
      else if (n.tagName !== 'BR') boxes.push(...n.getClientRects());
    }
    const lines = [];
    for (const r of boxes.filter((x) => x.width >= 1).sort((x, y) => x.top - y.top)) {
      const mid = (r.top + r.bottom) / 2;
      const at = lines.find((l) => Math.abs(l.mid - mid) < 8);
      if (at) at.left = Math.min(at.left, r.left); else lines.push({ mid, left: r.left });
    }
    const off = lines.map((l) => l.left).filter((x) => Math.abs(x - left) > 2);
    if (off.length) out.answerFormat.push({ el: name(line), text: block.textContent.slice(0, 40), lineStartsOff: off.map(Math.round) });
  }
  for (const body of document.querySelectorAll('#gpt-chat-root .gpt-answer-body')) {
    const raw = body.textContent.match(/\\(?:d?frac|sqrt|cdot|pm|left|right)\b|\^\{|_\{/);
    if (raw) out.answerFormat.push({ el: 'gpt-answer-body', raw: raw[0] });
  }
  for (const value of document.querySelectorAll('#gpt-chat-root .gpt-result-value')) {
    if (/^\s*<br/i.test(value.innerHTML)) out.answerFormat.push({ el: 'gpt-result-value', leadingBreak: true });
  }
  // (5c) the limit card at the thread's end: whole in sight, no empty space under it.
  const card = document.querySelector('#gpt-chat-root .gpt-message-content [data-testid="ai-limit-card"]');
  if (card) {
    const v = document.querySelector('#gpt-chat-root .gpt-viewport').getBoundingClientRect();
    const k = card.getBoundingClientRect();
    out.limitCard = { top: Math.round(k.top - v.top), gapBelow: Math.round(v.bottom - k.bottom), ok: k.top >= v.top - 0.5 && v.bottom - k.bottom <= 24 };
  }
  // (6) honesty.
  const note = document.querySelector('[data-testid="ai-input-microcopy"]');
  const privacy = document.querySelector('[data-testid="ai-input-privacy"]');
  if (!note || hidden(note) || parseFloat(getComputedStyle(note).fontSize) < 10 || !/OpenAI mahsuloti emas|Не продукт OpenAI/.test(note.textContent) || !privacy || hidden(privacy)) out.honesty.push('footnote');
  if (document.querySelector('[data-testid="ai-account-trigger"], [data-testid="limit-account"], [data-testid="limit-pay"]')) out.honesty.push('pack button');
  if (/\d[\d\s]*\s?(so‘m|сум)/.test(document.querySelector('#gpt-chat-root').textContent)) out.honesty.push('price');
  if (document.querySelector('[data-testid="ai-limit-telegram"]')) out.honesty.push('telegram bot');
  const sub = document.querySelector('.gpt-header-sub');
  out.layout.subtitle = sub ? sub.textContent : null;
  out.layout.subtitleWhole = sub ? sub.scrollWidth <= sub.clientWidth + 0.5 : null;
  out.layout.state = document.querySelector('#gpt-chat-root .gpt-premium')?.getAttribute('data-state');
  out.layout.keyboard = document.querySelector('#gpt-chat-root .gpt-premium')?.getAttribute('data-keyboard') || null;
  return out;
}

// The composition (chat UI §11.2): one axis, one content box, the vertical
// rule, the pills, the footnote, the action row, one surface, the rhythm, named
// controls, the keyboard's screen and the answer's honesty marks. Returns the
// failures as «Ann: what», the numbers measured, and a geometry signature
// that a light system theme must reproduce exactly (A17).
function align(expect) {
  const fails = [];
  const fail = (id, msg) => fails.push(`${id}: ${msg}`);
  const vw = innerWidth, vh = innerHeight;
  const root = document.querySelector('#gpt-chat-root');
  const app = root.querySelector('.gpt-premium');
  const q = (s, r = root) => r.querySelector(s);
  const qa = (s, r = root) => [...r.querySelectorAll(s)];
  const shown = (el) => {
    if (!el) return false;
    for (let a = el; a && a.nodeType === 1; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  };
  const R = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2 }; };
  const r1 = (n) => Math.round(n * 10) / 10;
  // The rendered lines of an element's text (text nodes only: a link's padding is no line).
  const lines = (el) => {
    const rs = [];
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.textContent.trim() || !shown(n.parentElement) || n.parentElement.closest('.sr-only')) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      rs.push(...[...rg.getClientRects()].filter((x) => x.width > 0.5));
    }
    const out = [];
    for (const x of rs) {
      const ln = out.find((o) => Math.abs((o.t + o.b) / 2 - (x.top + x.bottom) / 2) < 6);
      if (ln) { ln.l = Math.min(ln.l, x.left); ln.r = Math.max(ln.r, x.right); ln.t = Math.min(ln.t, x.top); ln.b = Math.max(ln.b, x.bottom); } else out.push({ l: x.left, r: x.right, t: x.top, b: x.bottom });
    }
    return out;
  };
  const parse = (v) => { const m = v.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const lum = (v) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(v.r) + 0.7152 * f(v.g) + 0.0722 * f(v.b); };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const keyboard = app.getAttribute('data-keyboard') === 'open';
  const state = app.getAttribute('data-state');
  const header = q('.gpt-header'), composer = q('.gpt-composer'), field = q('.gpt-input-surface'), foot = q('.gpt-input-footnote');
  const viewport = q('.gpt-viewport'), column = q('.gpt-column');
  const H = R(header), C = R(composer), F = R(field);
  const ccs = getComputedStyle(column), CR = R(column);
  const box = { l: CR.l + parseFloat(ccs.paddingLeft), r: CR.r - parseFloat(ccs.paddingRight) };
  const axis = (box.l + box.r) / 2;
  const m = { state, keyboard, axis: r1(axis), box: [r1(box.l), r1(box.r)], field: { l: r1(F.l), r: r1(F.r), t: r1(F.t), b: r1(F.b) }, header: r1(H.h), composer: r1(C.h) };
  const desktopGroup = vw >= 768 && vh >= 600 && !keyboard;

  // A2: the field is the content box.
  if (Math.abs(F.l - box.l) > 1 || Math.abs(F.r - box.r) > 1) fail('A2', `field ${r1(F.l)}–${r1(F.r)} vs content box ${r1(box.l)}–${r1(box.r)}`);
  // A6: the footnote, one line from 360px, centred on the axis.
  const fl = lines(foot), FR = R(foot);
  m.footnote = { lines: fl.length, h: r1(FR.h) };
  if (!fl.length || fl.length > (vw < 360 ? 2 : 1)) fail('A6', `footnote ${fl.length} lines at ${vw}px`);
  if (Math.abs(FR.h - Math.max(fl.length * 16, vw < 360 ? 32 : 0)) > 0.5) fail('A6', `footnote box ${r1(FR.h)}px for ${fl.length} lines`);
  if (parseFloat(getComputedStyle(foot).fontSize) < 10) fail('A6', 'footnote under 10px');
  for (const x of fl) if (Math.abs((x.l + x.r) / 2 - axis) > 1) fail('A1', `footnote line centre ${r1((x.l + x.r) / 2)} vs axis ${r1(axis)}`);
  // A8: one surface. The dock is the page's own colour, opaque; header and dock have no fill line or border.
  const dcs = getComputedStyle(composer), hcs = getComputedStyle(header);
  const dbg = parse(dcs.backgroundColor), hbg = parse(hcs.backgroundColor);
  if (!dbg || dbg.a !== 1 || dbg.r !== 5 || dbg.g !== 7 || dbg.b !== 13 || dcs.backgroundImage !== 'none') fail('A8', `composer background ${dcs.backgroundColor} ${dcs.backgroundImage}`);
  if (dcs.boxShadow !== 'none' || parseFloat(dcs.borderTopWidth) > 0) fail('A8', `composer hairline ${dcs.boxShadow}`);
  if ((hbg && hbg.a > 0) || hcs.backgroundImage !== 'none' || parseFloat(hcs.borderBottomWidth) > 0 || hcs.boxShadow !== 'none') fail('A8', `header ${hcs.backgroundColor} border ${hcs.borderBottomWidth}`);
  // A13: the field's border, and the send disc (muted: its arrow; ready: the disc on the field).
  const send = q('.gpt-send-button');
  const fieldBg = parse(getComputedStyle(field).backgroundColor), dockBg = dbg || { r: 5, g: 7, b: 13, a: 1 };
  const fb = parse(getComputedStyle(field).borderTopColor);
  if (fb && ratio(fb, dockBg) < 3) fail('A13', `field border ${ratio(fb, dockBg).toFixed(2)}:1`);
  if (send) {
    const sc = parse(getComputedStyle(send).color), sb = parse(getComputedStyle(send).backgroundColor);
    if (sc && sb && ratio(sc, sb) < 3) fail('A13', `send glyph ${ratio(sc, sb).toFixed(2)}:1`);
    if (send.getAttribute('data-state') === 'ready' && !send.hasAttribute('aria-disabled') && sb && fieldBg && ratio(sb, fieldBg) < 3) fail('A13', `ready send disc ${ratio(sb, fieldBg).toFixed(2)}:1`);
  }
  // A16: every visible link and button has a name.
  const named = (el) => {
    const label = el.getAttribute('aria-label') || '';
    const by = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join('');
    const text = [...el.childNodes].map((n) => (n.nodeType === 3 ? n.textContent : n.nodeType === 1 && n.getAttribute('aria-hidden') !== 'true' ? n.textContent : '')).join('');
    return (label + by + text + (el.getAttribute('title') || '')).trim();
  };
  for (const el of document.querySelectorAll('a[href], button, [role="button"]')) {
    if (!shown(el) || el.closest('.sr-only')) continue;
    if (!named(el)) fail('A16', `unnamed ${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')}`);
  }
  // A15 and A5: the thread ends at the composer, which sits at the bottom in a conversation.
  const T = R(q('.gpt-thread-scroll'));
  if (T.b > C.t + 0.5) fail('A15', `thread ends ${r1(T.b)} under the composer top ${r1(C.t)}`);
  const sig = { header: r1(H.h), composer: [r1(C.t), r1(C.h)], field: [r1(F.l), r1(F.r), r1(F.t)], foot: r1(FR.h) };

  if (state === 'empty') {
    const hello = q('.gpt-hello'), mark = q('.gpt-hello-mark'), kicker = q('.gpt-kicker'), greet = q('.gpt-greet'), meta = q('.gpt-meta'), note = q('.gpt-meta-note'), links = q('.gpt-empty-links'), tasks = q('.gpt-tasks');
    // A1: every block of the hello group on the axis; text blocks centred.
    const centres = {};
    if (shown(mark)) { centres.mark = [r1(R(mark).cx)]; if (Math.abs(R(mark).cx - axis) > 1) fail('A1', `mark centre ${r1(R(mark).cx)} vs axis ${r1(axis)}`); }
    for (const [key, el] of Object.entries({ kicker, greet, meta, links })) {
      if (!shown(el)) continue;
      if (getComputedStyle(el).textAlign !== 'center') fail('A1', `${key} is text-align ${getComputedStyle(el).textAlign}`);
      centres[key] = lines(el).map((x) => r1((x.l + x.r) / 2));
      for (const c of centres[key]) if (Math.abs(c - axis) > 1) fail('A1', `${key} line centre ${c} vs axis ${r1(axis)}`);
    }
    m.centres = centres;
    // A3: the pills.
    if (shown(tasks)) {
      const P = R(tasks), pills = qa('.gpt-task', tasks).filter(shown);
      if (Math.abs(P.l - F.l) > 1 || Math.abs(P.r - F.r) > 1) fail('A2', `pill grid ${r1(P.l)}–${r1(P.r)} vs field ${r1(F.l)}–${r1(F.r)}`);
      if (Math.abs(P.cx - axis) > 1) fail('A1', `pill grid centre ${r1(P.cx)} vs axis ${r1(axis)}`);
      if (pills.length !== 4) fail('A3', `${pills.length} pills`);
      const ws = pills.map((p) => R(p).w);
      if (Math.max(...ws) - Math.min(...ws) > 0.5) fail('A3', `pill widths ${ws.map(r1).join('/')}`);
      for (const p of pills) if (Math.abs(R(p).h - 44) > 0.5) fail('A3', `pill height ${r1(R(p).h)}`);
      const labels = pills.map((p) => { const s = q('span', p); return { text: s.textContent, lines: lines(s).length, h: r1(R(s).h), cut: s.scrollWidth > s.clientWidth + 0.5 }; });
      for (const l of labels) {
        if (l.lines !== 1 || l.h > 20.5) fail('A3', `«${l.text}» ${l.lines} lines, ${l.h}px`);
        if (l.cut) fail('A3', `«${l.text}» ellipsized`);
      }
      const rows = [...new Set(pills.map((p) => Math.round(R(p).t)))];
      if (rows.length !== (vw < 640 ? 2 : 1)) fail('A3', `${rows.length} pill rows at ${vw}px`);
      const first = pills.filter((p) => Math.round(R(p).t) === rows[0]).sort((a, b) => R(a).l - R(b).l);
      const mid = first.length >= 2 ? (first.length === 4 ? (R(first[1]).r + R(first[2]).l) / 2 : (R(first[0]).r + R(first[1]).l) / 2) : null;
      if (mid === null || Math.abs(mid - axis) > 1) fail('A3', `pill gap centre ${mid === null ? '–' : r1(mid)} vs axis ${r1(axis)}`);
      m.pills = { rows: rows.length, w: r1(ws[0] ?? 0), gapCentre: mid === null ? null : r1(mid), labels };
      sig.pills = [r1(P.t), r1(P.h), r1(ws[0] ?? 0)];
    }
    sig.hello = [mark, kicker, greet, meta, links].map((el) => (shown(el) ? [r1(R(el).t), r1(R(el).h)] : null));
    const scroll = viewport.scrollHeight - viewport.clientHeight;
    if (!keyboard && !desktopGroup && shown(tasks) && shown(mark)) {
      // A4: the phone's group in the middle of the free height, the pills 12px over the field, no thread scroll.
      // The pills sit 12px over the dock's content: the field, or a dock note or the way back to an article above it.
      const dock = R(q('.gpt-composer-inner')), plain = Math.abs(dock.t - F.t) < 0.5;
      const above = R(mark).t - H.b, below = R(tasks).t - R(links).b, toDock = dock.t - R(tasks).b;
      m.vertical = { above: r1(above), below: r1(below), toDock: r1(toDock), pillsTop: r1(R(tasks).t), fieldTop: r1(F.t), scroll };
      if (Math.abs(above - below) > 2) fail('A4', `gap above ${r1(above)} vs below ${r1(below)}`);
      if (Math.abs(toDock - 12) > 1) fail('A4', `pills → dock ${r1(toDock)}`);
      if (scroll > 1) fail('A4', `the thread scrolls by ${scroll}px`);
      if (expect?.gap !== undefined && plain) {
        if (Math.abs(above - expect.gap) > 2) fail('A4', `gap ${r1(above)} (spec ${expect.gap})`);
        if (Math.abs(R(tasks).t - expect.pills) > 2) fail('A4', `pills top ${r1(R(tasks).t)} (spec ${expect.pills})`);
        if (Math.abs(F.t - expect.field) > 1) fail('A4', `field top ${r1(F.t)} (spec ${expect.field})`);
      }
    }
    if (desktopGroup && shown(tasks) && shown(mark)) {
      // A5: greeting, pills and composer one group, centred on the viewport.
      const top = R(mark).t, bottom = FR.b, centre = (top + bottom) / 2, toField = F.t - R(tasks).b;
      m.vertical = { markTop: r1(top), fieldTop: r1(F.t), footBottom: r1(bottom), centre: r1(centre), toField: r1(toField), scroll };
      if (Math.abs(centre - vh / 2) > 8) fail('A5', `group centre ${r1(centre)} vs viewport centre ${vh / 2}`);
      if (Math.abs(toField - 12) > 1) fail('A5', `pills → field ${r1(toField)}`);
      if (scroll > 1) fail('A5', `the thread scrolls by ${scroll}px`);
      if (expect?.mark !== undefined) {
        if (Math.abs(top - expect.mark) > 2) fail('A5', `mark top ${r1(top)} (spec ${expect.mark})`);
        if (Math.abs(F.t - expect.field) > 2) fail('A5', `field top ${r1(F.t)} (spec ${expect.field})`);
      }
    }
    if (keyboard) {
      // A19: the keyboard leaves the kicker, the question and the provider note; nothing scrolls.
      for (const [key, el] of Object.entries({ mark, terms: meta?.firstElementChild, links, tasks })) if (shown(el)) fail('A19', `${key} shown with the keyboard open`);
      for (const [key, el] of Object.entries({ kicker, greet, note })) if (!shown(el)) fail('A19', `${key} hidden with the keyboard open`);
      if (scroll > 1) fail('A19', `the thread scrolls by ${scroll}px`);
      if (shown(kicker) && shown(note)) {
        const above = R(kicker).t - H.b, below = F.t - R(note).b;
        m.vertical = { above: r1(above), below: r1(below), scroll };
        if (expect?.kb && (Math.abs(above - expect.kb[0]) > 2 || Math.abs(below - expect.kb[1]) > 2)) fail('A19', `gaps ${r1(above)} / ${r1(below)} (spec ${expect.kb.join(' / ')})`);
      }
    }
  } else {
    const top = viewport.getBoundingClientRect().top - viewport.scrollTop;
    const rel = (el) => r1(R(el).t - top);
    // A5: docked in a conversation.
    if (!keyboard && scrollY === 0 && Math.abs(C.b - vh) > 1) fail('A5', `composer bottom ${r1(C.b)} vs ${vh}`);
    // A2: the bubble's right edge, the answers' left edges.
    const maxPct = vw >= 640 ? 0.7 : 0.8;
    for (const b of qa('.gpt-user-message')) {
      if (Math.abs(R(b).r - F.r) > 1) fail('A2', `bubble right ${r1(R(b).r)} vs field ${r1(F.r)}`);
      if (R(b).w > (box.r - box.l) * maxPct + 0.5) fail('A2', `bubble ${r1(R(b).w)}px over ${maxPct * 100}%`);
      if (getComputedStyle(b).borderBottomRightRadius !== '20px') fail('A2', `bubble corner ${getComputedStyle(b).borderBottomRightRadius}`);
    }
    const left = [];
    for (const a of qa('.gpt-answer')) {
      const parts = [q('.gpt-answer-head', a), q('.gpt-answer-body', a), ...qa('.gpt-answer-body > :is(p, h3, h4, ul, ol, blockquote, .gpt-math, .gpt-code-wrap, pre, .gpt-table-scroll, .gpt-result, .gpt-check-line)', a)];
      for (const el of parts) if (el && shown(el) && Math.abs(R(el).l - F.l) > 1) left.push(`${el.className || el.tagName} ${r1(R(el).l - F.l)}`);
      const glyph = q('.gpt-action-row > .gpt-action:first-child svg', a);
      if (glyph && shown(glyph) && Math.abs(R(glyph).l - F.l) > 1) left.push(`first action glyph ${r1(R(glyph).l - F.l)}`);
    }
    for (const el of qa('.gpt-error-bubble, .gpt-limit-card, .gpt-low-line')) if (shown(el) && Math.abs(R(el).l - F.l) > 1) left.push(`${el.className} ${r1(R(el).l - F.l)}`);
    for (const el of qa('.gpt-limit-card')) if (shown(el) && Math.abs(R(el).r - F.r) > 1) left.push(`limit card right ${r1(R(el).r - F.r)}`);
    for (const x of left) fail('A2', `left edge off the field: ${x}`);
    // A7: one action row, 44px, never on two lines; the model line.
    for (const row of qa('.gpt-action-row').filter(shown)) {
      const buttons = [...row.children].filter((el) => el.matches('.gpt-action') && shown(el));
      const tops = new Set(buttons.map((b) => Math.round(R(b).t)));
      if (tops.size !== 1 || R(row).h > 44.5) fail('A7', `action row ${tops.size} lines, ${r1(R(row).h)}px`);
      if (row.querySelector('.gpt-action-continue') && vw < 640) for (const label of row.querySelectorAll('.gpt-action-label')) if (R(label).w > 1) fail('A7', `«${label.textContent}» shown beside «Davom ettir» at ${vw}px`);
      const foot = row.closest('.gpt-answer-foot'), model = foot && q('.gpt-model', foot);
      if (model) {
        if (vw < 768 && lines(model).length !== 1) fail('A7', `model line ${lines(model).length} lines`);
        if (vw >= 768 && (Math.abs(R(model).r - F.r) > 1 || Math.abs(R(model).cy - R(row).cy) > 2)) fail('A7', `model line not at the row's right end (${r1(R(model).r)} vs ${r1(F.r)})`);
      }
    }
    // A10: the turn rhythm, question → answer 16, answer → next question 28 (36 from 640px).
    const items = qa('.gpt-message-content > [data-slot="message-scroller-item"]');
    const gaps = [];
    for (let i = 1; i < items.length; i++) {
      if (items[i].previousElementSibling !== items[i - 1]) continue;
      const g = R(items[i]).t - R(items[i - 1]).b;
      const user = !!q('.gpt-user-message', items[i]);
      const want = user ? (vw >= 640 ? 36 : 28) : 16;
      gaps.push(`${user ? 'a→q' : 'q→a'} ${r1(g)}`);
      if (Math.abs(g - want) > 1) fail('A10', `${user ? 'answer → question' : 'question → answer'} ${r1(g)} (want ${want})`);
    }
    m.gaps = gaps;
    // A20: «GPTBot.uz» over every answer, the model line under every finished one.
    for (const a of qa('.gpt-answer')) {
      if (!/GPTBot\.uz/.test(q('.gpt-answer-head', a)?.textContent || '')) fail('A20', 'an answer without «GPTBot.uz»');
      if (!q('.gpt-pending', a) && !q('.gpt-streaming', a) && !q('.gpt-model', a)) fail('A20', 'a finished answer without its model line');
    }
    const firstUser = q('.gpt-user-message'), firstBody = q('.gpt-answer-body'), firstRow = q('.gpt-action-row');
    sig.chat = [firstUser && [r1(R(firstUser).l), r1(R(firstUser).r), rel(firstUser)], firstBody && [r1(R(firstBody).l), r1(R(firstBody).r), rel(firstBody), r1(R(firstBody).h)], firstRow && [r1(R(firstRow).l), rel(firstRow)]];
  }
  return { fails, m, sig };
}

// ── Running the states ─────────────────────────────────────────────────────
const browser = await chromium.launch();
const results = [];
const shots = [];
const unexpected = [];
let mode = 'answer';

async function open({ w, h, ua, touch = w < 700, theme, locale, dpr, init, account = GUEST, hash = '', frame = false, reducedMotion, using = browser }) {
  const ctx = await using.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr ?? (touch ? 2 : 1), isMobile: touch, hasTouch: touch, userAgent: UA[ua], colorScheme: theme, reducedMotion, locale: locale === 'uz' ? 'uz-UZ' : 'ru-RU' });
  await ctx.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    // The prerendered frame alone: no script runs.
    if (frame && route.request().resourceType() === 'script') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/gpt/account') return json(200, account);
    if (url.pathname === '/api/auth/config') return json(200, { turnstileRequired: false, turnstileSiteKey: null });
    if (url.pathname === '/api/gpt/session') return json(200, { ok: true, sessionId: 'layout-check' });
    if (url.pathname === '/api/gpt/event') return json(200, { ok: true });
    if (url.pathname === '/api/gpt/chat') {
      if (mode === 'error') return json(500, { ok: false, code: 'provider_error' });
      if (mode === 'limit') return json(429, { ok: false, code: 'limit_reached', reason: 'hourly', retryAfterSec: 41 * 60, limits: { daily: 15, hourly: 5 }, remaining: 10 });
      if (mode === 'slow' || mode === 'slow-cut') await new Promise((ok) => setTimeout(ok, 4_000));
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(locale) }).catch(() => undefined);
    }
    unexpected.push(url.pathname);
    return json(404, { ok: false });
  });
  const page = await ctx.newPage();
  if (init) await page.addInitScript(init);
  await page.goto(`${ORIGIN}${PAGES[locale]}${hash}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (frame) return { ctx, page };
  await page.waitForSelector('[data-testid="ai-console"]');
  await page.waitForFunction(() => /\d/.test(document.querySelector('.gpt-meta')?.textContent || ''));
  return { ctx, page };
}

async function record(page, run, state, shot, extra = {}) {
  // Long enough for the desktop composer's 380ms glide to end.
  await page.waitForTimeout(run.size.startsWith('1') || run.size.startsWith('768') ? 500 : 250);
  const r = await page.evaluate(audit);
  const a = await page.evaluate(align, EXPECT[run.size] ?? null);
  results.push({ ...run, state, ...r, align: a.fails, metrics: a.m, sig: a.sig, ...extra });
  if (shot) {
    const file = `${run.size}-${run.ua}-${run.theme}-${run.locale}-${state}.png`;
    await page.screenshot({ path: join(SHOTS, file) });
    shots.push(file);
  }
}

async function send(page, text) {
  await page.fill('.gpt-input-surface textarea', text);
  await page.click('.gpt-send-button');
}

async function keyboard(page, size) {
  await page.focus('.gpt-input-surface textarea');
  await page.setViewportSize({ width: size.w, height: size.kb });
  await page.waitForFunction(() => document.querySelector('#gpt-chat-root .gpt-premium')?.getAttribute('data-keyboard') === 'open', null, { timeout: 3_000 }).catch(() => undefined);
}
const toEnd = (page) => page.evaluate(() => { const v = document.querySelector('.gpt-viewport'); v.scrollTop = v.scrollHeight; });

const MAIN = PERF_ONLY ? [] : QUICK ? SIZES.filter((s) => s.w === 360 && s.h === 612) : SIZES;
for (const size of MAIN) {
  for (const theme of THEMES) for (const locale of ['uz', 'ru']) {
    const run = { size: sizeName(size), ua: size.ua, theme, locale };
    const kbRun = { ...run, size: `${size.w}x${size.kb}` };
    const key = size.w === 360 && size.h === 612 || size.w === 1366;
    mode = 'answer';
    const { ctx, page } = await open({ ...size, theme, locale });
    await record(page, run, 'empty', true);
    // The menu drawer (the sidebar from 1024px).
    if (size.w < 1024) {
      await page.click('[data-testid="ai-menu-button"]');
      await page.waitForSelector('.gpt-sidebar-dialog');
      await page.waitForTimeout(300);
      await record(page, run, 'drawer', key || size.w === 768);
      await page.keyboard.press('Escape');
      await page.waitForSelector('.gpt-sidebar-dialog', { state: 'detached' });
    }
    // The keyboard over the resting screen, then back.
    if (size.touch) {
      await keyboard(page, size);
      await record(page, kbRun, 'empty-keyboard', true);
      await page.evaluate(() => document.activeElement?.blur());
      await page.setViewportSize({ width: size.w, height: size.h });
    }
    // A pill, a question: «AI o‘ylayapti…» before the server has counted anything, then the long answer.
    mode = 'slow';
    await page.click('.gpt-task');
    await page.type('.gpt-input-surface textarea', QUESTION[locale]);
    await page.click('.gpt-send-button');
    await page.waitForSelector('.gpt-pending');
    await page.evaluate(() => document.activeElement?.blur());
    await record(page, run, 'thinking-first', key);
    await page.waitForSelector('.gpt-action-row', { timeout: 15_000 });
    mode = 'answer';
    await page.evaluate(() => document.activeElement?.blur());
    await toEnd(page);
    await record(page, run, 'chat-end', true);
    // The «⋯» menu.
    await page.click('.gpt-action-more');
    await page.waitForSelector('.gpt-action-menu');
    await record(page, run, 'menu', key);
    await page.keyboard.press('Escape');
    // The top of the thread.
    await page.evaluate(() => { const v = document.querySelector('.gpt-viewport'); v.scrollTop = 0; });
    await record(page, run, 'chat-top', true);
    // The keyboard over a conversation.
    if (size.touch) {
      await keyboard(page, size);
      await toEnd(page);
      await record(page, kbRun, 'chat-keyboard', key);
      await page.evaluate(() => document.activeElement?.blur());
      await page.setViewportSize({ width: size.w, height: size.h });
    }
    // «AI o‘ylayapti…» under a second question, then a cut answer: «Davom ettir» in the row.
    mode = 'slow-cut';
    await send(page, locale === 'uz' ? 'Yana bir misol' : 'Ещё один пример');
    await page.waitForSelector('.gpt-pending');
    await page.evaluate(() => document.activeElement?.blur());
    await record(page, run, 'thinking', key);
    await page.waitForSelector('.gpt-pending', { state: 'detached', timeout: 15_000 });
    await page.waitForSelector('.gpt-action-continue', { timeout: 15_000 });
    await page.evaluate(() => document.activeElement?.blur());
    await toEnd(page);
    await record(page, run, 'partial', true);
    // An error.
    mode = 'error';
    await send(page, locale === 'uz' ? 'Savol' : 'Вопрос');
    await page.waitForSelector('.gpt-error-bubble');
    await record(page, run, 'error', key);
    // The hourly limit: the card at the end of the thread, the question back in the composer.
    // «Savolni o‘zgartirish»: the question back in the composer, then sent into the limit.
    mode = 'limit';
    await page.click('.gpt-error-actions .gpt-outline-button:last-child');
    await page.click('.gpt-send-button');
    await page.waitForSelector('[data-testid="ai-limit-card"]');
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(500);
    await record(page, run, 'limit', true);
    // The keyboard over the card: the chat keeps it in sight by itself.
    if (size.touch) {
      await keyboard(page, size);
      await page.waitForTimeout(400);
      await record(page, kbRun, 'limit-keyboard', true);
    }
    await ctx.close();
  }
}

// Every item of the open «⋯» menu is what a tap at its centre reaches.
const MENU_REACH = () => {
  const menu = document.querySelector('.gpt-action-menu');
  if (!menu) return { open: false, missed: [] };
  const missed = [menu.querySelector('.gpt-menu-cost'), ...menu.querySelectorAll('.gpt-action')].filter((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    return !(top === el || el.contains(top));
  }).map((el) => el.textContent.trim().slice(0, 30));
  return { open: true, below: menu.hasAttribute('data-below'), missed };
};
const menuChecks = [];
const limitChecks = [];
const zoomChecks = [];
const billingChecks = [];
const frameChecks = [];
const transitionChecks = [];
const scrollbarChecks = [];
const PHONE = { tg: SIZES[1], big: SIZES[4], ios: SIZES[3] };
if (!PERF_ONLY) {
  for (const size of [PHONE.tg, PHONE.big]) for (const locale of ['uz', 'ru']) {
    const run = { size: sizeName(size), ua: size.ua, theme: 'dark', locale };
    // A one-line answer high in the thread: the menu opens below it.
    mode = 'short';
    const { ctx, page } = await open({ ...size, theme: 'dark', locale });
    await send(page, HELLO[locale]);
    await page.waitForSelector('.gpt-action-more');
    await page.evaluate(() => document.activeElement?.blur());
    await page.click('.gpt-action-more');
    await page.waitForSelector('.gpt-action-menu');
    await record(page, run, 'menu-short', size === PHONE.tg);
    menuChecks.push({ ...run, state: 'menu-short', ...(await page.evaluate(MENU_REACH)) });
    await page.keyboard.press('Escape');
    // A long question, the same answer: the menu opens above it, over the question.
    await page.click('[data-testid="ai-header-new-chat"]');
    await page.waitForSelector('.gpt-empty');
    await send(page, LONG_QUESTION[locale]);
    await page.waitForSelector('.gpt-action-more');
    await page.evaluate(() => document.activeElement?.blur());
    await page.click('.gpt-action-more');
    await page.waitForSelector('.gpt-action-menu');
    await record(page, run, 'menu-up', size === PHONE.tg);
    menuChecks.push({ ...run, state: 'menu-up', ...(await page.evaluate(MENU_REACH)) });
    await ctx.close();
  }
  // An answered question, then one refused at the limit: the card in sight, the scroller's spacer gone.
  for (const size of [PHONE.tg, PHONE.ios]) for (const locale of ['uz', 'ru']) {
    const run = { size: sizeName(size), ua: size.ua, theme: 'dark', locale };
    mode = 'answer';
    const { ctx, page } = await open({ ...size, theme: 'dark', locale });
    await send(page, QUESTION[locale]);
    await page.waitForSelector('.gpt-action-row');
    mode = 'limit';
    await send(page, locale === 'uz' ? 'Yana bir savol' : 'Ещё один вопрос');
    await page.waitForSelector('[data-testid="ai-limit-card"]');
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(800);
    await record(page, run, 'limit-direct', size === PHONE.tg);
    await keyboard(page, size);
    await page.waitForTimeout(400);
    await record(page, { ...run, size: `${size.w}x${size.kb}` }, 'limit-direct-keyboard', size === PHONE.tg);
    await ctx.close();
  }
  // A pinch-zoom with the field focused is no keyboard (WCAG 1.4.4).
  for (const locale of ['uz', 'ru']) {
    mode = 'answer';
    const { ctx, page } = await open({ ...PHONE.tg, theme: 'dark', locale });
    await page.focus('.gpt-input-surface textarea');
    const before = await page.evaluate(() => document.getElementById('main')?.style.height ?? '');
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await page.waitForTimeout(600);
    const zoomed = await page.evaluate(() => {
      const tasks = document.querySelector('.gpt-tasks');
      return { keyboard: document.querySelector('#gpt-chat-root .gpt-premium')?.getAttribute('data-keyboard') || null, main: document.getElementById('main')?.style.height ?? '', tasks: !!tasks && getComputedStyle(tasks).display !== 'none' };
    });
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    zoomChecks.push({ locale, before, ...zoomed, ok: zoomed.keyboard === null && zoomed.main === before && zoomed.tasks });
    await ctx.close();
  }
  // From an article: the way back in the composer.
  for (const [locale, hash] of [['uz', '#entry=students'], ['ru', '#entry=compare-ru']]) {
    mode = 'answer';
    const run = { size: sizeName(PHONE.tg), ua: PHONE.tg.ua, theme: 'dark', locale };
    const { ctx, page } = await open({ ...PHONE.tg, theme: 'dark', locale, hash });
    await page.waitForSelector('.gpt-entry-context a');
    await record(page, run, 'entry', true);
    await ctx.close();
  }
  // Billing on, including the 640px gutter and the 700/701px sheet boundary.
  const billingSizes = [SIZES[0], PHONE.tg, PHONE.ios, ...[640, 700, 701].map(w => ({ w, h: 900, ua: 'tablet', touch: true }))];
  for (const size of billingSizes) for (const locale of ['uz', 'ru']) {
    mode = 'answer';
    const run = { size: sizeName(size), ua: size.ua, theme: 'dark', locale };
    const { ctx, page } = await open({ ...size, theme: 'dark', locale, account: BILLING });
    await page.waitForSelector('[data-testid="ai-account-trigger"]');
    await page.waitForTimeout(250);
    const header = await page.evaluate(audit);
    const composition = await page.evaluate(align, EXPECT[run.size] ?? null);
    if (size !== SIZES[0]) {
      const file = `${run.size}-${run.ua}-dark-${locale}-pack.png`;
      await page.screenshot({ path: join(SHOTS, file) });
      shots.push(file);
    }
    await page.click('[data-testid="ai-account-trigger"]');
    await page.waitForSelector('.gpt-account-dialog .gpt-price');
    await page.waitForTimeout(400);
    const price = await page.evaluate(() => {
      const parse = (v) => { const m = v.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
      const lum = (v) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(v.r) + 0.7152 * f(v.g) + 0.0722 * f(v.b); };
      const el = document.querySelector('.gpt-account-dialog .gpt-price');
      // Through a canvas: computed colours may come as lab()/oklch(), which parse() does not read.
      const rgb = (css) => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = '#000'; c.fillStyle = css; c.fillRect(0, 0, 1, 1); const d = c.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; };
      const fg = rgb(getComputedStyle(el).color);
      const bg = rgb(getComputedStyle(el.closest('.gpt-plan-card')).backgroundColor);
      const ratio = (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
      return { text: el.textContent.trim(), amount: Number(el.textContent.replace(/\D/g, '')), providers: [...document.querySelectorAll('.gpt-payment-buttons button')].map(b => b.textContent.trim()), ratio: +ratio.toFixed(2), parsed: !!parse(getComputedStyle(el).color) };
    });
    if (size === PHONE.tg) {
      await page.screenshot({ path: join(SHOTS, `${run.size}-${run.ua}-dark-${locale}-pack-window.png`) });
      shots.push(`${run.size}-${run.ua}-dark-${locale}-pack-window.png`);
    }
    const sheet = await page.evaluate(() => {
      const el = document.querySelector('.gpt-account-dialog');
      const r = el.getBoundingClientRect(), css = getComputedStyle(el);
      const padding = innerWidth < 640 ? 20 : innerWidth <= 700 ? 24 : 28;
      return { padding: parseFloat(css.paddingLeft), ok: parseFloat(css.paddingLeft) === padding && parseFloat(css.paddingRight) === padding && (innerWidth <= 700 ? Math.abs(r.bottom - innerHeight) <= 1 : r.width <= 520 && Math.abs((r.left + r.right) / 2 - innerWidth / 2) <= 1) };
    });
    billingChecks.push({ ...run, sheet, smallTargets: header.smallTargets, headerSpill: header.layout.headerSpill, subtitleWhole: header.layout.subtitleWhole, align: composition.fails, price });
    await ctx.close();
  }
  // The prerendered frame against the mounted chat: nothing moves when it mounts (A11).
  const GEOMETRY = () => {
    const q = (sel) => document.querySelector(`#gpt-chat-root ${sel}`)?.getBoundingClientRect();
    const r = (b) => (b ? { top: Math.round(b.top * 10) / 10, height: Math.round(b.height * 10) / 10, bottom: Math.round(b.bottom * 10) / 10 } : null);
    const rows = new Set([...document.querySelectorAll('#gpt-chat-root .gpt-tasks > li')].map((li) => Math.round(li.getBoundingClientRect().top))).size;
    // The links row: the mounted row, or the frame's bar (2px short of the row's bottom).
    const links = q('.gpt-empty-links') || q('.gpt-shell-links');
    const linksBottom = links ? Math.round((links.bottom + (document.querySelector('#gpt-chat-root .gpt-shell-links') ? 2 : 0)) * 10) / 10 : null;
    return { mark: r(q('.gpt-hello-mark')), kicker: r(q('.gpt-kicker')), greet: r(q('.gpt-greet')), meta: r(q('.gpt-hello > .gpt-meta')), linksBottom, tasks: r(q('.gpt-tasks')), field: r(q('.gpt-input-surface')), composer: r(q('.gpt-composer')), footnote: r(q('.gpt-input-footnote')), rows };
  };
  for (const size of SIZES) for (const locale of ['uz', 'ru']) {
    mode = 'answer';
    const framed = await open({ ...size, theme: 'dark', locale, frame: true });
    const before = await framed.page.evaluate(GEOMETRY);
    if (size.w === 360 && size.h === 612 || size.w === 1366) {
      const file = `${sizeName(size)}-${size.ua}-dark-${locale}-frame.png`;
      await framed.page.screenshot({ path: join(SHOTS, file) });
      shots.push(file);
    }
    await framed.ctx.close();
    const mounted = await open({ ...size, theme: 'dark', locale });
    await mounted.page.waitForTimeout(300);
    const after = await mounted.page.evaluate(GEOMETRY);
    await mounted.ctx.close();
    const moved = [];
    for (const key of ['mark', 'kicker', 'greet', 'meta', 'tasks', 'field']) if (!before[key] || !after[key] || Math.abs(before[key].top - after[key].top) > 1) moved.push(`${key} top ${before[key]?.top} → ${after[key]?.top}`);
    if (before.linksBottom === null || after.linksBottom === null || Math.abs(before.linksBottom - after.linksBottom) > 1) moved.push(`links bottom ${before.linksBottom} → ${after.linksBottom}`);
    for (const key of ['composer', 'footnote']) if (!before[key] || !after[key] || Math.abs(before[key].height - after[key].height) > 1) moved.push(`${key} height ${before[key]?.height} → ${after[key]?.height}`);
    if (before.rows !== after.rows) moved.push(`pill rows ${before.rows} → ${after.rows}`);
    frameChecks.push({ size: sizeName(size), locale, frame: before, mounted: after, moved });
  }
  // A18: the desktop composer's glide from the centred group to the dock, and
  // under reduced motion none. Every animation is paused right after the tap
  // and set to 0, 120, 240 and 400ms, so each frame is measured exactly.
  const GLIDE = async () => {
    const calls = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) { calls.push(args[1]?.duration ?? null); return animate.apply(this, args); };
    const root = document.querySelector('#gpt-chat-root');
    const field = () => root.querySelector('.gpt-input-surface').getBoundingClientRect();
    const before = field().top;
    root.querySelector('.gpt-send-button').click();
    // React commits the tap's update in a microtask; the glide starts in its layout effect.
    await new Promise((ok) => setTimeout(ok, 0));
    // The finite ones: the glide and the bubble's fade (the thinking dots run forever).
    const anims = document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime));
    for (const a of anims) a.pause();
    const frames = [];
    for (const t of [0, 120, 240, 400]) {
      for (const a of anims) a.currentTime = t;
      const f = field();
      const bubble = root.querySelector('.gpt-user-message')?.getBoundingClientRect() ?? null;
      frames.push({ t, fieldTop: Math.round(f.top * 10) / 10, bubble: bubble && { top: Math.round(bubble.top), bottom: Math.round(bubble.bottom), opacity: +getComputedStyle(root.querySelector('.gpt-user-message')).opacity } });
    }
    for (const a of anims) a.finish();
    await new Promise((ok) => setTimeout(ok, 50));
    const end = field().top;
    Element.prototype.animate = animate;
    return { before: Math.round(before * 10) / 10, end: Math.round(end * 10) / 10, frames, calls, vh: innerHeight };
  };
  for (const [size, locale, reducedMotion] of [[SIZES[5], 'uz'], [SIZES[6], 'uz'], [SIZES[6], 'ru'], [SIZES[7], 'ru'], [SIZES[8], 'ru'], [SIZES[6], 'uz', 'reduce']]) {
    mode = 'answer';
    const { ctx, page } = await open({ ...size, touch: false, theme: 'dark', locale, reducedMotion });
    await page.fill('.gpt-input-surface textarea', QUESTION[locale]);
    const glide = await page.evaluate(GLIDE);
    const problems = [];
    const [t0, , , t400] = glide.frames;
    if (!t0.bubble) problems.push('no bubble at t0');
    else if (t0.bubble.bottom > t0.fieldTop + 0.5 || t0.bubble.top < 0) problems.push(`bubble at t0 ${t0.bubble.top}–${t0.bubble.bottom} not above the field ${t0.fieldTop}`);
    if (Math.abs(t400.fieldTop - glide.end) > 1) problems.push(`field at t400 ${t400.fieldTop} vs docked ${glide.end}`);
    if (reducedMotion) {
      if (glide.calls.length) problems.push(`animate() called ${glide.calls.length}x under reduced motion`);
      if (Math.abs(t0.fieldTop - glide.end) > 1) problems.push(`reduced motion: field at t0 ${t0.fieldTop} vs ${glide.end}`);
    } else {
      if (!glide.calls.includes(380)) problems.push(`no 380ms glide (${glide.calls.join(',')})`);
      if (Math.abs(t0.fieldTop - glide.before) > 1) problems.push(`t0 field ${t0.fieldTop} not where it stood (${glide.before})`);
    }
    transitionChecks.push({ size: sizeName(size), locale, reducedMotion: !!reducedMotion, ...glide, problems });
    if (size === SIZES[6] && locale === 'uz' && !reducedMotion) {
      await page.waitForSelector('.gpt-action-row', { timeout: 15_000 });
    }
    await ctx.close();
  }
  // Classic scrollbars (Windows desktops): the thread and the composer keep one content box (A2).
  const classic = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  for (const size of [{ w: 1024, h: 768, ua: 'desktop', touch: false }, SIZES[6]]) for (const locale of ['uz', 'ru']) {
    mode = 'answer';
    const run = { size: sizeName(size), ua: size.ua, theme: 'dark', locale, scrollbars: 'classic' };
    const { ctx, page } = await open({ ...size, touch: false, theme: 'dark', locale, using: classic });
    await record(page, run, 'empty', locale === 'uz');
    await send(page, QUESTION[locale]);
    await page.waitForSelector('.gpt-action-row', { timeout: 15_000 });
    await page.evaluate(() => document.activeElement?.blur());
    await toEnd(page);
    await record(page, run, 'chat-end', locale === 'uz');
    const gutter = await page.evaluate(() => { const v = document.querySelector('.gpt-viewport'); return v.offsetWidth - v.clientWidth; });
    scrollbarChecks.push({ ...run, gutter });
    await ctx.close();
  }
  await classic.close();
}

// The negative controls: the harness must fail each of these, or it proves nothing.
// (1) The rejected composer (fixed, a transparent gradient) over a conversation at 360x612.
let negativeControl = null;
const negatives = [];
if (!PERF_ONLY) {
  mode = 'answer';
  const neg = await open({ ...SIZES[1], theme: 'dark', locale: 'uz', dpr: 1 });
  await neg.page.click('.gpt-task');
  await neg.page.type('.gpt-input-surface textarea', QUESTION.uz);
  await neg.page.click('.gpt-send-button');
  await neg.page.waitForSelector('.gpt-action-row');
  await neg.page.addStyleTag({ content: '#gpt-chat-root .gpt-premium .gpt-composer { position: fixed; bottom: 0; left: 0; right: 0; background: linear-gradient(0deg, var(--bg) 82%, transparent); box-shadow: none; }' });
  await neg.page.waitForTimeout(300);
  await neg.page.evaluate(() => { const v = document.querySelector('.gpt-viewport'); v.scrollTop = v.scrollHeight; });
  await neg.page.waitForTimeout(200);
  const negative = await neg.page.evaluate(audit);
  const composition = await neg.page.evaluate(align, null);
  await neg.ctx.close();
  negativeControl = { textUnderComposer: negative.textUnderComposer.length, composerOpaque: negative.layout.composerOpaque, composerPosition: negative.layout.composerPosition, sample: negative.textUnderComposer.slice(0, 3), align: composition.fails.filter((f) => f.startsWith('A8')).slice(0, 3) };
  negatives.push({ name: 'fixed transparent composer', expected: ['A8'], got: [...new Set(composition.fails.map((f) => f.slice(0, f.indexOf(':'))))], caught: negative.textUnderComposer.length >= 1 && composition.fails.some((f) => f.startsWith('A8')) });

  const ids = (fails) => [...new Set(fails.map((f) => f.slice(0, f.indexOf(':'))))];
  const control = async (name, expected, setup) => {
    mode = 'answer';
    const { ctx, page } = await open({ ...SIZES[1], theme: 'dark', locale: 'uz' });
    const fails = await setup(page);
    await ctx.close();
    const got = ids(fails);
    negatives.push({ name, expected, got, caught: expected.every((id) => got.includes(id)), sample: fails.slice(0, 6) });
  };
  // (2) The 06.10 resting screen and conversation put back: a left-aligned greeting,
  // a 12px dock, the long pill label and the 3-part footnote, 22px gaps, an 86% tailed bubble.
  const DEFECTS = '#gpt-chat-root .gpt-hello { text-align: left; } #gpt-chat-root .gpt-composer { padding-inline: 12px; } #gpt-chat-root .gpt-message-content { gap: 22px; } #gpt-chat-root .gpt-user-message { max-width: 86%; border-radius: 20px 20px 6px 20px; } #gpt-chat-root .gpt-input-footnote { margin-inline: 4px; }';
  const OLD_COPY = () => {
    const labels = document.querySelectorAll('#gpt-chat-root .gpt-task span');
    labels[0].textContent = 'Masalani yechish';
    labels[2].textContent = 'Mavzuni tushuntirish';
    document.querySelector('[data-testid="ai-input-microcopy"]').firstChild.textContent = 'OpenAI mahsuloti emas · Savollar xorijdagi AI-provayderlarga yuboriladi — shaxsiy ma’lumot yozmang · ';
  };
  await control('06.10 resting screen and conversation', ['A1', 'A2', 'A3', 'A6', 'A10'], async (page) => {
    await page.addStyleTag({ content: DEFECTS });
    await page.evaluate(OLD_COPY);
    await page.waitForTimeout(100);
    const empty = await page.evaluate(align, EXPECT['360x612']);
    await send(page, QUESTION.uz);
    await page.waitForSelector('.gpt-action-row');
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(300);
    const chat = await page.evaluate(align, null);
    return [...empty.fails, ...chat.fails];
  });
  // (3) Unequal pill columns: the gap leaves the axis.
  await control('unequal pill columns', ['A3'], async (page) => {
    await page.addStyleTag({ content: '#gpt-chat-root .gpt-tasks { grid-template-columns: max-content 1fr; }' });
    await page.waitForTimeout(100);
    return (await page.evaluate(align, EXPECT['360x612'])).fails;
  });
  // (4) The old desktop set in a row that wraps.
  await control('wrapping action row', ['A7'], async (page) => {
    await send(page, QUESTION.uz);
    await page.waitForSelector('.gpt-action-row');
    await page.evaluate(() => {
      const row = document.querySelector('#gpt-chat-root .gpt-action-row');
      for (const label of ['Oddiyroq tushuntir', 'Rus tiliga tarjima', 'Davom ettir', 'Qayta yozish']) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'gpt-action';
        b.textContent = label;
        row.append(b);
      }
    });
    await page.addStyleTag({ content: '#gpt-chat-root .gpt-action-row { flex-wrap: wrap; }' });
    await page.waitForTimeout(100);
    return (await page.evaluate(align, null)).fails;
  });
  // (5) A visible button without a name.
  await control('unnamed button', ['A16'], async (page) => {
    await page.evaluate(() => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = 'width:44px;height:44px';
      document.querySelector('#gpt-chat-root .gpt-header').append(b);
    });
    return (await page.evaluate(align, EXPECT['360x612'])).fails;
  });
}

// CLS and LCP from navigation through mount, the account's numbers and the fonts, 4x CPU and Fast 3G:
// gated at the spec's 360x612, 390x844 and 1366x768 (A14); 320x568, where the H1 takes two lines and
// is the largest text, is measured and reported, not gated.
const PERF_GATED = ['360x612', '390x844', '1366x768'];
const perf = [];
const OBSERVE = () => {
  window.__cls = 0; window.__lcp = null;
  new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  window.__lcps = [];
  new PerformanceObserver((list) => { for (const e of list.getEntries()) { window.__lcp = { t: Math.round(e.startTime), size: e.size, el: e.element ? e.element.tagName.toLowerCase() + '.' + (e.element.className || '') : null }; window.__lcps.push(window.__lcp); } }).observe({ type: 'largest-contentful-paint', buffered: true });
};
for (const size of [SIZES[0], SIZES[1], SIZES[3], SIZES[6]]) for (const locale of ['uz', 'ru']) {
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: size.touch ? 2 : 1, isMobile: size.touch, hasTouch: size.touch, userAgent: UA[size.ua], colorScheme: 'dark' });
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/api/gpt/account') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GUEST) });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"turnstileRequired":false}' });
    return route.continue();
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 562.5, downloadThroughput: 1_440_000 / 8, uploadThroughput: 675_000 / 8 });
  await page.addInitScript(OBSERVE);
  await page.goto(`${ORIGIN}${PAGES[locale]}`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForSelector('[data-testid="ai-console"]', { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(3_000);
  perf.push({ size: sizeName(size), locale, ...(await page.evaluate(() => ({ cls: +window.__cls.toFixed(4), lcp: window.__lcp, candidates: window.__lcps }))) });
  await ctx.close();
}
await browser.close();
server.close();

// ── A17: a light system theme renders the dark app, geometry identical ─────
const lightChecks = [];
for (const r of results.filter((x) => x.theme === 'light' && ['empty', 'empty-keyboard', 'chat-top', 'chat-end', 'partial'].includes(x.state))) {
  const dark = results.find((x) => x.theme === 'dark' && x.size === r.size && x.locale === r.locale && x.state === r.state && !x.scrollbars);
  const same = !!dark && JSON.stringify(dark.sig) === JSON.stringify(r.sig);
  lightChecks.push({ size: r.size, locale: r.locale, state: r.state, same, ...(same ? {} : { dark: dark?.sig, light: r.sig }) });
}

// ── Summary ────────────────────────────────────────────────────────────────
const count = (key) => results.reduce((n, r) => n + (r[key]?.length ?? 0), 0);
// The header's one line, whole: every state, every size.
const SUBTITLE_STATES = ['empty', 'chat-end', 'chat-top', 'thinking-first', 'thinking', 'partial', 'menu', 'limit', 'limit-keyboard', 'limit-direct', 'limit-direct-keyboard', 'menu-short', 'menu-up', 'entry'];
const byCheck = {};
for (const r of results) for (const f of r.align) { const id = f.slice(0, f.indexOf(':')); byCheck[id] = (byCheck[id] ?? 0) + 1; }
const summary = {
  pages: Object.values(PAGES),
  runs: results.length,
  sizes: [...new Set(results.map((r) => r.size))],
  states: [...new Set(results.map((r) => r.state))],
  textUnderComposer: count('textUnderComposer'),
  textOverlaps: count('textOverlaps'),
  controlOverlaps: count('controlOverlaps'),
  smallTargets: count('smallTargets'),
  contrastFails: count('contrast'),
  honesty: count('honesty'),
  horizontalOverflowRuns: results.filter((r) => r.hOverflow).length,
  threadBelowComposerTop: results.filter((r) => !r.layout.threadEndsAboveComposer).length,
  headerSpill: results.filter((r) => r.layout.headerSpill.length).length,
  composerOffScreen: results.filter((r) => r.layout.composerOnScreen === false).length,
  composerNotInFlowOrNotOpaque: results.filter((r) => !['relative', 'static'].includes(r.layout.composerPosition) || !r.layout.composerOpaque).length,
  subtitleCut: results.filter((r) => SUBTITLE_STATES.includes(r.state) && r.layout.subtitleWhole === false).map((r) => `${r.size} ${r.locale} ${r.state}: ${r.layout.subtitle}`),
  answerFormat: count('answerFormat'),
  sidebarStyle: count('sidebarStyle'),
  composition: { failures: Object.values(byCheck).reduce((a, b) => a + b, 0), byCheck },
  limitCardOutOfSight: results.filter((r) => r.state.startsWith('limit') && (!r.limitCard || !r.limitCard.ok)).map((r) => `${r.size} ${r.locale} ${r.state}: ${JSON.stringify(r.limitCard ?? null)}`),
  menuUnreachable: menuChecks.filter((m) => !m.open || m.missed.length).map((m) => `${m.size} ${m.locale} ${m.state}: ${m.missed.join(' | ') || 'closed'}`),
  menuDirections: { below: menuChecks.filter((m) => m.below).length, above: menuChecks.filter((m) => m.open && !m.below).length },
  zoom: zoomChecks,
  billing: billingChecks.map((b) => ({ size: b.size, locale: b.locale, smallTargets: b.smallTargets.length, headerSpill: b.headerSpill.length, subtitleWhole: b.subtitleWhole, align: b.align, price: b.price, sheet: b.sheet })),
  frameVsMounted: frameChecks.map((f) => ({ size: f.size, locale: f.locale, moved: f.moved, composer: f.mounted.composer?.height, footnote: f.mounted.footnote?.height, rows: f.mounted.rows })),
  transition: transitionChecks.map((t) => ({ size: t.size, locale: t.locale, reducedMotion: t.reducedMotion, before: t.before, end: t.end, frames: t.frames.map((f) => `${f.t}ms field ${f.fieldTop}${f.bubble ? ` bubble ${f.bubble.top}–${f.bubble.bottom}` : ''}`), problems: t.problems })),
  classicScrollbars: scrollbarChecks,
  lightRendersDark: { compared: lightChecks.length, different: lightChecks.filter((l) => !l.same) },
  keyboardNotDetected: results.filter((r) => r.state.endsWith('keyboard') && r.layout.keyboard !== 'open').length,
  unexpectedApiCalls: [...new Set(unexpected)],
  negativeControl,
  negativeControls: negatives,
  heights: Object.fromEntries(results.filter((r) => r.theme === 'dark' && !r.scrollbars && ['empty', 'empty-keyboard'].includes(r.state)).map((r) => [`${r.size} ${r.locale} ${r.state}`, { header: r.layout.header, thread: r.layout.thread, composer: r.layout.composer, vertical: r.metrics.vertical ?? null }])),
  perf,
};
const failures = results.filter((r) => r.textUnderComposer.length || r.textOverlaps.length || r.controlOverlaps.length || r.smallTargets.length || r.contrast.length || r.honesty.length || r.hOverflow || !r.layout.threadEndsAboveComposer || r.layout.composerOnScreen === false || r.layout.headerSpill.length || r.answerFormat?.length || r.sidebarStyle?.length || r.align.length)
  .map(({ size, ua, theme, locale, state, scrollbars, textUnderComposer, textOverlaps, controlOverlaps, smallTargets, contrast, honesty, hOverflow, layout, answerFormat, sidebarStyle, align }) => ({ size, ua, theme, locale, state, scrollbars, textUnderComposer, textOverlaps, controlOverlaps, smallTargets, contrast, honesty, hOverflow, headerSpill: layout.headerSpill, answerFormat, sidebarStyle, align }));
const pageChecksOk = PERF_ONLY || (
  !summary.limitCardOutOfSight.length && !summary.menuUnreachable.length && menuChecks.length === 8
  && summary.menuDirections.below >= 1 && summary.menuDirections.above >= 1
  && zoomChecks.length === 2 && zoomChecks.every((z) => z.ok)
  && billingChecks.length === 12 && billingChecks.every((b) => !b.smallTargets.length && !b.headerSpill.length && b.subtitleWhole && !b.align.length && b.price.ratio >= 4.5 && b.price.amount === 20000 && b.price.providers.length === 1 && b.price.providers.some(p => /Click/.test(p)) && b.sheet.ok)
  && frameChecks.length === SIZES.length * 2 && frameChecks.every((f) => !f.moved.length)
  && transitionChecks.length === 6 && transitionChecks.every((t) => !t.problems.length)
  && scrollbarChecks.length === 4 && scrollbarChecks.every((s) => s.gutter > 0)
  && (QUICK || lightChecks.length > 0) && lightChecks.every((l) => l.same)
  && negatives.length === 5 && negatives.every((n) => n.caught)
  && results.filter((r) => r.state === 'entry').length === 2);
const ok = failures.length === 0 && summary.composerNotInFlowOrNotOpaque === 0 && !summary.subtitleCut.length && pageChecksOk
  && summary.keyboardNotDetected === 0 && !summary.unexpectedApiCalls.length && (PERF_ONLY || negativeControl.textUnderComposer >= 1)
  && perf.filter((p) => PERF_GATED.includes(p.size)).every((p) => p.cls <= 0.05 && (p.lcp?.t ?? Infinity) <= 2_500);
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify({ checkedAt: new Date().toISOString(), dist: DIST, shotsDir: SHOTS, ok, summary, failures, shots }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
console.log(`failures: ${failures.length}; screenshots: ${shots.length} in ${SHOTS}; report: ${REPORT}`);
if (failures.length) console.log(JSON.stringify(failures.slice(0, 10), null, 1));
process.exitCode = ok ? 0 : 1;
