// The chat pages' layout and overlap check (chat design 2026-10-06 §9.1).
//
//   npm run check:chat-layout -- [--dist dist] [--shots <dir>] [--report <file>] [--quick]
//
// Serves the built dist/ on 127.0.0.1, opens /uz/gpt-uzbek-tilida/ and
// /ru/gpt-chat/ in Chromium (playwright-core) at the phone sizes the chat is
// used at (Telegram's in-app browser 360x612 among them) and drives each
// state through the UI: the resting screen, the keyboard open, a sent
// question answered with a maths answer, the «⋯» menu, the top of the thread,
// «AI o‘ylayapti…», an error, the hourly limit and the menu drawer. Every
// /api/** request is answered here (a guest, billing off, no Telegram bot,
// free limits 15/5); one the check does not know fails the run, so nothing
// reaches production or its database. Requests to other hosts are dropped.
//
// Each state is measured in the page: text under the composer, text over
// text, a control over a control, targets under 44x44 (a link inside a
// sentence: under 24px tall), text contrast under WCAG AA against what is
// behind it, a page wider than the screen, the thread running below the
// composer's top, the composer off screen, not in flow or not opaque; and
// the honesty lines: the footnote (not OpenAI, the privacy link) in every
// state, the header's subtitle whole in every state at every size, no pack
// button, no price and no Telegram bot while the server offers none. The
// answer's maths: the check line and a step heading one text block beside
// the tick or the circle (bold, italic and code inside), no LaTeX left as
// text, no answer box that starts with a line break. The limit card in sight
// at the thread's end, with the keyboard open too, also right after an
// answered question.
//
// Then, on their own pages: the «⋯» menu under a one-line answer (it opens
// below) and under a long question (above), every item reachable by a tap;
// a pinch-zoom with the field focused is no keyboard; the way back to an
// article (#entry=); the header with the pack button (billing on) and the
// pack window's price contrast; and the prerendered frame against the
// mounted chat (the tops of the H1, the greeting and the tasks, the
// composer's height, the task rows) at seven sizes, since CLS cannot see a
// DOM swap. A negative control puts back the rejected composer (fixed, a
// transparent gradient) and must be caught. CLS and LCP are read at 360x612
// and 390x844 under 4x CPU and Fast 3G. Any failure exits 1.
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
const REPORT = resolve(ROOT, arg('report', 'docs/seo/evidence/2026-10-06-chat-design/layout-report.json'));
const QUICK = process.argv.includes('--quick');
// Only CLS and LCP, e.g. on another build (--dist) to compare with.
const PERF_ONLY = process.argv.includes('--perf-only');
if (!existsSync(join(DIST, 'uz', 'gpt-uzbek-tilida', 'index.html'))) throw new Error(`No chat build in ${DIST}: run npm run build first.`);
mkdirSync(SHOTS, { recursive: true });

const UA = {
  tg: 'Mozilla/5.0 (Linux; Android 13; SM-A145F Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 Telegram-Android/11.2.3 (Samsung SM-A145F; Android 13; SDK 33; AVERAGE)',
  android: 'Mozilla/5.0 (Linux; Android 12; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
};
// The five phone sizes, each with the height left above an open keyboard.
const SIZES = [
  { w: 320, h: 568, ua: 'android', kb: 300 },
  { w: 360, h: 612, ua: 'tg', kb: 330 },
  { w: 360, h: 740, ua: 'android', kb: 420 },
  { w: 390, h: 844, ua: 'ios', kb: 480 },
  { w: 412, h: 915, ua: 'android', kb: 530 },
];
const PAGES = { uz: '/uz/gpt-uzbek-tilida/', ru: '/ru/gpt-chat/' };
const THEMES = QUICK ? ['dark'] : ['dark', 'light'];

// ── The answers the check serves (the reference maths answer of §9.1) ──────
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
const BILLING = { ...GUEST, loginAvailable: true, mode: 'test', providers: ['click'], terms: { ru: 'https://gptbot.uz/ru/oferta/', uz: 'https://gptbot.uz/uz/oferta/' }, termsVersion: '2026-10-01', guestCheckout: true, pack: { priceUzs: 29000, messageLimit: 300, dailyLimit: 30, months: 1 } };
const sse = (locale) => {
  const text = mode === 'short' ? SHORT[locale] : ANSWER[locale];
  const parts = text.match(/[\s\S]{1,90}/g);
  return [
    { type: 'meta', sessionId: 'layout-check', model: 'glm-5.3-flash' },
    ...parts.map((part) => ({ type: 'delta', text: part })),
    { type: 'done', remaining: 13, hourRemaining: 3, truncated: false, charged: true, modelUsed: 'glm-5.3-flash' },
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
  // (5b) the answer's maths: one text block beside the tick and the circle,
  // whose wrapped lines start at its left edge; no LaTeX left as text; the
  // box's value without a leading break.
  out.answerFormat = [];
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
  if (document.querySelector('[data-testid="ai-account-trigger"], [data-testid="limit-account"]')) out.honesty.push('pack button');
  if (/\d[\d\s ]*\s?(so‘m|сум)/.test(document.querySelector('#gpt-chat-root').textContent)) out.honesty.push('price');
  if (document.querySelector('[data-testid="ai-limit-telegram"]')) out.honesty.push('telegram bot');
  const sub = document.querySelector('.gpt-header-sub');
  out.layout.subtitle = sub ? sub.textContent : null;
  out.layout.subtitleWhole = sub ? sub.scrollWidth <= sub.clientWidth + 0.5 : null;
  out.layout.state = document.querySelector('#gpt-chat-root .gpt-premium')?.getAttribute('data-state');
  out.layout.keyboard = document.querySelector('#gpt-chat-root .gpt-premium')?.getAttribute('data-keyboard') || null;
  return out;
}

// ── Running the states ─────────────────────────────────────────────────────
const browser = await chromium.launch();
const results = [];
const shots = [];
const unexpected = [];
let mode = 'answer';

async function open({ w, h, ua, theme, locale, dpr = 2, init, account = GUEST, hash = '', frame = false }) {
  const phone = w < 700;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: phone, hasTouch: phone, userAgent: UA[ua], colorScheme: theme, locale: locale === 'uz' ? 'uz-UZ' : 'ru-RU' });
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
      if (mode === 'slow') await new Promise((ok) => setTimeout(ok, 4_000));
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

async function record(page, run, state, shot) {
  await page.waitForTimeout(250);
  const r = await page.evaluate(audit);
  results.push({ ...run, state, ...r });
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

for (const size of PERF_ONLY ? [] : QUICK ? SIZES.filter((s) => s.w === 360 && s.h === 612) : SIZES) {
  for (const theme of THEMES) for (const locale of ['uz', 'ru']) {
    const run = { size: `${size.w}x${size.h}`, ua: size.ua, theme, locale };
    const kbRun = { ...run, size: `${size.w}x${size.kb}` };
    mode = 'answer';
    const { ctx, page } = await open({ ...size, theme, locale });
    await record(page, run, 'empty', true);
    // The menu drawer.
    await page.click('[data-testid="ai-menu-button"]');
    await page.waitForSelector('.gpt-sidebar-dialog');
    await page.waitForTimeout(300);
    await record(page, run, 'drawer', size.w === 360 && size.h === 612);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.gpt-sidebar-dialog', { state: 'detached' });
    // The keyboard over the resting screen, then back.
    await keyboard(page, size);
    await record(page, kbRun, 'empty-keyboard', true);
    await page.evaluate(() => document.activeElement?.blur());
    await page.setViewportSize({ width: size.w, height: size.h });
    // A task, a question: «AI o‘ylayapti…» before the server has counted anything, then the answer.
    mode = 'slow';
    await page.click('.gpt-task');
    await page.type('.gpt-input-surface textarea', QUESTION[locale]);
    await page.click('.gpt-send-button');
    await page.waitForSelector('.gpt-pending');
    await page.evaluate(() => document.activeElement?.blur());
    await record(page, run, 'thinking-first', size.w === 360 && size.h === 612);
    await page.waitForSelector('.gpt-action-row', { timeout: 15_000 });
    mode = 'answer';
    await page.evaluate(() => document.activeElement?.blur());
    await record(page, run, 'chat-end', true);
    // The «⋯» menu.
    await page.click('.gpt-action-more');
    await page.waitForSelector('.gpt-action-menu');
    await record(page, run, 'menu', size.w === 360 && size.h === 612);
    await page.keyboard.press('Escape');
    // The top of the thread.
    await page.evaluate(() => { const v = document.querySelector('.gpt-viewport'); v.scrollTop = 0; });
    await record(page, run, 'chat-top', size.w === 360 && size.h === 612);
    // The keyboard over a conversation.
    await keyboard(page, size);
    await page.evaluate(() => { const v = document.querySelector('.gpt-viewport'); v.scrollTop = v.scrollHeight; });
    await record(page, kbRun, 'chat-keyboard', size.w === 360 && size.h === 612);
    await page.evaluate(() => document.activeElement?.blur());
    await page.setViewportSize({ width: size.w, height: size.h });
    // «AI o‘ylayapti…».
    mode = 'slow';
    await send(page, locale === 'uz' ? 'Yana bir misol' : 'Ещё один пример');
    await page.waitForSelector('.gpt-pending');
    await record(page, run, 'thinking', size.w === 360 && size.h === 612);
    await page.waitForSelector('.gpt-pending', { state: 'detached', timeout: 15_000 });
    // An error.
    mode = 'error';
    await send(page, locale === 'uz' ? 'Savol' : 'Вопрос');
    await page.waitForSelector('.gpt-error-bubble');
    await record(page, run, 'error', size.w === 360 && size.h === 612);
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
    await keyboard(page, size);
    await page.waitForTimeout(400);
    await record(page, kbRun, 'limit-keyboard', true);
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
const PHONE = { tg: SIZES[1], big: SIZES[4], ios: SIZES[3] };
if (!PERF_ONLY) {
  for (const size of [PHONE.tg, PHONE.big]) for (const locale of ['uz', 'ru']) {
    const run = { size: `${size.w}x${size.h}`, ua: size.ua, theme: 'dark', locale };
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
    const run = { size: `${size.w}x${size.h}`, ua: size.ua, theme: 'dark', locale };
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
    const run = { size: `${PHONE.tg.w}x${PHONE.tg.h}`, ua: PHONE.tg.ua, theme: 'dark', locale };
    const { ctx, page } = await open({ ...PHONE.tg, theme: 'dark', locale, hash });
    await page.waitForSelector('.gpt-entry-context a');
    await record(page, run, 'entry', true);
    await ctx.close();
  }
  // Billing on: the header with the pack button at 320 and 360, and the pack window's price.
  for (const size of [SIZES[0], PHONE.tg]) for (const locale of ['uz', 'ru']) {
    mode = 'answer';
    const run = { size: `${size.w}x${size.h}`, ua: size.ua, theme: 'dark', locale };
    const { ctx, page } = await open({ ...size, theme: 'dark', locale, account: BILLING });
    await page.waitForSelector('[data-testid="ai-account-trigger"]');
    const header = await page.evaluate(audit);
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
      return { text: el.textContent.trim(), ratio: +ratio.toFixed(2), parsed: !!parse(getComputedStyle(el).color) };
    });
    if (size === PHONE.tg) {
      await page.screenshot({ path: join(SHOTS, `${run.size}-${run.ua}-dark-${locale}-pack-window.png`) });
      shots.push(`${run.size}-${run.ua}-dark-${locale}-pack-window.png`);
    }
    billingChecks.push({ ...run, smallTargets: header.smallTargets, headerSpill: header.layout.headerSpill, subtitleWhole: header.layout.subtitleWhole, price });
    await ctx.close();
  }
  // The prerendered frame against the mounted chat: nothing moves when it mounts.
  const GEOMETRY = () => {
    const q = (sel) => document.querySelector(`#gpt-chat-root ${sel}`)?.getBoundingClientRect();
    const r = (b) => (b ? { top: Math.round(b.top * 10) / 10, height: Math.round(b.height * 10) / 10 } : null);
    const rows = new Set([...document.querySelectorAll('#gpt-chat-root .gpt-tasks > li')].map((li) => Math.round(li.getBoundingClientRect().top))).size;
    return { kicker: r(q('.gpt-kicker')), greet: r(q('.gpt-greet')), tasks: r(q('.gpt-tasks')), composer: r(q('.gpt-composer')), footnote: r(q('.gpt-input-footnote')), rows };
  };
  const WIDE = [{ w: 768, h: 1024, ua: 'android', name: 'tablet' }, { w: 1280, h: 800, ua: 'android', name: 'desktop' }];
  for (const size of [...SIZES, ...WIDE]) for (const locale of ['uz', 'ru']) {
    mode = 'answer';
    const framed = await open({ ...size, theme: 'dark', locale, frame: true });
    const before = await framed.page.evaluate(GEOMETRY);
    await framed.ctx.close();
    const mounted = await open({ ...size, theme: 'dark', locale });
    await mounted.page.waitForTimeout(300);
    const after = await mounted.page.evaluate(GEOMETRY);
    if (size.name) {
      const file = `${size.w}x${size.h}-${size.name}-dark-${locale}-empty.png`;
      await mounted.page.screenshot({ path: join(SHOTS, file) });
      shots.push(file);
    }
    await mounted.ctx.close();
    const moved = [];
    for (const key of ['kicker', 'greet', 'tasks']) if (!before[key] || !after[key] || Math.abs(before[key].top - after[key].top) > 1) moved.push(`${key} top ${before[key]?.top} → ${after[key]?.top}`);
    for (const key of ['composer', 'footnote']) if (!before[key] || !after[key] || Math.abs(before[key].height - after[key].height) > 1) moved.push(`${key} height ${before[key]?.height} → ${after[key]?.height}`);
    if (before.rows !== after.rows) moved.push(`task rows ${before.rows} → ${after.rows}`);
    frameChecks.push({ size: `${size.w}x${size.h}`, locale, frame: before, mounted: after, moved });
  }
}

// The negative control: the rejected composer (fixed, a transparent gradient)
// over a conversation at 360x612 must be caught.
let negativeControl = null;
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
  await neg.ctx.close();
  negativeControl = { textUnderComposer: negative.textUnderComposer.length, composerOpaque: negative.layout.composerOpaque, composerPosition: negative.layout.composerPosition, sample: negative.textUnderComposer.slice(0, 3) };
}

// CLS and LCP from navigation through mount, the account's numbers and the fonts, 4x CPU and Fast 3G.
const perf = [];
const OBSERVE = () => {
  window.__cls = 0; window.__lcp = null;
  new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  window.__lcps = [];
  new PerformanceObserver((list) => { for (const e of list.getEntries()) { window.__lcp = { t: Math.round(e.startTime), size: e.size, el: e.element ? e.element.tagName.toLowerCase() + '.' + (e.element.className || '') : null }; window.__lcps.push(window.__lcp); } }).observe({ type: 'largest-contentful-paint', buffered: true });
};
for (const size of [SIZES[1], SIZES[3]]) for (const locale of ['uz', 'ru']) {
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA[size.ua], colorScheme: 'dark' });
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
  perf.push({ size: `${size.w}x${size.h}`, locale, ...(await page.evaluate(() => ({ cls: +window.__cls.toFixed(4), lcp: window.__lcp, candidates: window.__lcps }))) });
  await ctx.close();
}
await browser.close();
server.close();

// ── Summary ────────────────────────────────────────────────────────────────
const count = (key) => results.reduce((n, r) => n + (r[key]?.length ?? 0), 0);
// The header's one line, whole: every state, every size.
const SUBTITLE_STATES = ['empty', 'chat-end', 'chat-top', 'thinking-first', 'thinking', 'menu', 'limit', 'limit-keyboard', 'limit-direct', 'limit-direct-keyboard', 'menu-short', 'menu-up', 'entry'];
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
  limitCardOutOfSight: results.filter((r) => r.state.startsWith('limit') && (!r.limitCard || !r.limitCard.ok)).map((r) => `${r.size} ${r.locale} ${r.state}: ${JSON.stringify(r.limitCard ?? null)}`),
  menuUnreachable: menuChecks.filter((m) => !m.open || m.missed.length).map((m) => `${m.size} ${m.locale} ${m.state}: ${m.missed.join(' | ') || 'closed'}`),
  menuDirections: { below: menuChecks.filter((m) => m.below).length, above: menuChecks.filter((m) => m.open && !m.below).length },
  zoom: zoomChecks,
  billing: billingChecks.map((b) => ({ size: b.size, locale: b.locale, smallTargets: b.smallTargets.length, headerSpill: b.headerSpill.length, subtitleWhole: b.subtitleWhole, price: b.price })),
  frameVsMounted: frameChecks.map((f) => ({ size: f.size, locale: f.locale, moved: f.moved, composer: f.mounted.composer?.height, footnote: f.mounted.footnote?.height, rows: f.mounted.rows })),
  keyboardNotDetected: results.filter((r) => r.state.endsWith('keyboard') && r.layout.keyboard !== 'open').length,
  unexpectedApiCalls: [...new Set(unexpected)],
  negativeControl,
  heights: Object.fromEntries(results.filter((r) => r.theme === 'dark' && ['empty', 'empty-keyboard'].includes(r.state)).map((r) => [`${r.size} ${r.locale} ${r.state}`, { header: r.layout.header, thread: r.layout.thread, composer: r.layout.composer }])),
  perf,
};
const failures = results.filter((r) => r.textUnderComposer.length || r.textOverlaps.length || r.controlOverlaps.length || r.smallTargets.length || r.contrast.length || r.honesty.length || r.hOverflow || !r.layout.threadEndsAboveComposer || r.layout.composerOnScreen === false || r.layout.headerSpill.length || r.answerFormat?.length)
  .map(({ size, ua, theme, locale, state, textUnderComposer, textOverlaps, controlOverlaps, smallTargets, contrast, honesty, hOverflow, layout, answerFormat }) => ({ size, ua, theme, locale, state, textUnderComposer, textOverlaps, controlOverlaps, smallTargets, contrast, honesty, hOverflow, headerSpill: layout.headerSpill, answerFormat }));
const pageChecksOk = PERF_ONLY || (
  !summary.limitCardOutOfSight.length && !summary.menuUnreachable.length && menuChecks.length === 8
  && summary.menuDirections.below >= 1 && summary.menuDirections.above >= 1
  && zoomChecks.length === 2 && zoomChecks.every((z) => z.ok)
  && billingChecks.length === 4 && billingChecks.every((b) => !b.smallTargets.length && !b.headerSpill.length && b.subtitleWhole && b.price.ratio >= 4.5)
  && frameChecks.length === 14 && frameChecks.every((f) => !f.moved.length)
  && results.filter((r) => r.state === 'entry').length === 2);
const ok = failures.length === 0 && summary.composerNotInFlowOrNotOpaque === 0 && !summary.subtitleCut.length && pageChecksOk
  && summary.keyboardNotDetected === 0 && !summary.unexpectedApiCalls.length && (PERF_ONLY || negativeControl.textUnderComposer >= 1)
  && perf.every((p) => p.cls <= 0.1 && (p.lcp?.t ?? Infinity) <= 2_500);
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify({ checkedAt: new Date().toISOString(), dist: DIST, shotsDir: SHOTS, ok, summary, failures, shots }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
console.log(`failures: ${failures.length}; screenshots: ${shots.length} in ${SHOTS}; report: ${REPORT}`);
if (failures.length) console.log(JSON.stringify(failures.slice(0, 10), null, 1));
process.exitCode = ok ? 0 : 1;
