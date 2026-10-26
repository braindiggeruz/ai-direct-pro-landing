import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seoContract, PROTECTED_PATHS } from '../../../../scripts/seo-protection';

// Builds the 2026-10-26-rs1b revision from the local production candidate in
// dist/ (npm run build:production of 1286f7e4: R-S1b d87ceff3 and its review
// fixes 1286f7e4 on 6892b5cd = production 77e54817 plus docs).
//
// Owner, chat 26.10.2026: ship the safe step R-S1b (backlog W2-01; TOP-3
// roadmap ROADMAP_TOP3.md §4.2 step 2.4 and §6 Т-08) now instead of ≈08.11.
// The two chats, the login guide (≈25.11–02.12) and the download guide (R-S2,
// 16.11) stay on their dates and must stay byte for byte as reviewed. On the
// five R-S1b articles the script lists every HTML swap it accepts (SWAPS), puts
// each one back and refuses to write unless the result is the predecessor's
// HTML byte for byte. What it accepts:
//  - all five: the BreadcrumbList JSON-LD gets a top-level name, the page's H1
//    (scripts/jsonld-helpers.ts BREADCRUMB_NAME_HELD loses these five);
//  - the Claude article: one new paragraph linking the payment article;
//  - the payment article: one sentence linking the Claude article and «работайте
//    в» instead of «откройте» before the UZ chat anchor (same anchor and href);
//    the facts re-checked against the OpenAI help center on 26.10 (the app
//    publisher in both stores, «does not» cancel instead of «usually does not»,
//    in the text and the FAQ), the visible «Обновлено» date, dateModified and
//    article:modified_time 2026-07-30 → 2026-10-26, and the «Первичные источники»
//    list (check dates, two moved help-center addresses and their titles);
//  - promptlar: one new paragraph linking the ariza / tushuntirish xati guide and
//    the H-5 anchor «insho va referat yozish» → «insho va esse yozish» (same href).
// The VPN article and ai-chat-nima change by the breadcrumb name only, so their
// contract stays. On the three others internalLinks and bodyTextSha256 change;
// title, H1, description, robots, canonical and hreflang must stay on all ten.
// The body text change is recorded as text replacements that, replayed on the
// new body text, give the predecessor's body text exactly.
//
// PREDECESSOR_DIST (required to write) is a build of 77e54817 (build:fast, the
// admin build and the studio build). Its ten protected pages must hash to the
// predecessor revision; the script then compares every file of the site: every
// HTML page outside the ten and every other file must be byte-identical except
// the reviewed list (blog index, feeds, sitemaps, Markdown twins, llms-full).
// DRY=1 runs every check and prints the result without writing.
const root = process.cwd();
const previousRevision = 'docs/seo/evidence/2026-10-26-address/reviewed-protected-pages.json';
const target = path.join(root, 'docs/seo/evidence/2026-10-26-rs1b/reviewed-protected-pages.json');
const previousRaw = fs.readFileSync(path.join(root, previousRevision), 'utf8').replace(/\r\n/g, '\n');
const previous = JSON.parse(previousRaw) as {
  pages: Array<{ pathname: string; contract: ReturnType<typeof seoContract>; bodyText: string; htmlSha256: string }>;
};
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const fail = (message: string): never => { throw new Error(message); };
const bodyTextOf = (html: string) => (html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const STYLESHEET = '/assets/index-B7Z1XlOc.css';
const CHAT_BUNDLE = '/assets/gpt-chat-Cqn8gEiy.js';
const CLAUDE = '/ru/blog/chatgpt-i-claude-v-uzbekistane/';
const PAY = '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/';
const PROMPTS = '/uz/blog/chatgpt-uzbek-tilida-promptlar/';
const VPN = '/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/';
const AI_CHAT = '/uz/blog/ai-chat-nima-va-qanday-turlari-bor/';
const ARIZA = '/uz/blog/tushuntirish-xati-va-ariza-yozish/';
const R_S1B = [CLAUDE, PAY, PROMPTS, VPN, AI_CHAT];
// Held for their own windows: the download guide (R-S2 16.11), both chats and the
// login guide (≈25.11–02.12); the homepage has no R-S1b change.
const UNTOUCHED = (PROTECTED_PATHS as readonly string[]).filter((p) => !R_S1B.includes(p));
const CHATS = ['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/'];
const LINKP = '<p class="text-base text-white/80 leading-relaxed mb-4">';
const A = (href: string, anchor: string) => `<a href="${href}" class="text-brand-cyan hover:underline">${anchor}</a>`;
// The contract fields each page may change, and the in-body links it gains.
const EXPECTED: Record<string, { fields: string[]; added: string[] }> = {
  [CLAUDE]: { fields: ['internalLinks', 'bodyTextSha256'], added: [PAY] },
  [PAY]: { fields: ['internalLinks', 'bodyTextSha256'], added: [CLAUDE] },
  [PROMPTS]: { fields: ['internalLinks', 'bodyTextSha256'], added: [ARIZA] },
  [VPN]: { fields: [], added: [] },
  [AI_CHAT]: { fields: [], added: [] },
};

type Swap = { surface: string; before: string; after: string };
const breadcrumbName = (h1: string): Swap => {
  if (/["\\<>]/.test(h1)) fail(`H1 needs JSON escaping: ${h1}`);
  return {
    surface: 'BreadcrumbList JSON-LD: name = H1',
    before: '{"@type":"BreadcrumbList","itemListElement":',
    after: `{"@type":"BreadcrumbList","name":"${h1}","itemListElement":`,
  };
};
const help = (slug: string) => `https://help.openai.com/en/articles/${slug}`;
const source = (href: string, title: string, note: string) => `<a href="${href}" rel="noopener noreferrer" class="text-brand-cyan hover:underline font-medium">${title}</a>\n      <p class="mt-2 mb-0 text-sm text-white/65 leading-relaxed">${note}</p>`;
const OLD_CITATION = ['6950777-what-is-chatgpt-plus', '10421635-multi-currency-billing-faq', '7947663-chatgpt-supported-countries',
  '7908378-where-can-i-download-the-openai-chatgpt-ios-app-on-the-apple-app-store'].map(help);
const NEW_CITATION = ['6950777-what-is-chatgpt-plus', '10421635-multicurrency-billing', '7947663-chatgpt-supported-countries',
  '8142208-chatgpt-ios-and-android-app-faq'].map(help);
const SWAPS: Record<string, Swap[]> = {
  [CLAUDE]: [
    {
      surface: 'new paragraph after «Начните с официального checkout…» (section «Как оплатить»): link to the payment article (W2-01)',
      before: '',
      after: `\n${LINKP}Валюта списания, частые причины отказа карты и отмена подписки ChatGPT разобраны отдельно — в статье ${A(PAY, 'оплата ChatGPT из Узбекистана: карты и ошибки')}.</p>`,
    },
  ],
  [PAY]: [
    {
      surface: 'link paragraph (body[24]): new sentence linking the Claude article (W2-01 / L5 W2-02)',
      before: '</a>. Если нужна независимая AI-платформа',
      after: `</a>. Что доступно в обоих сервисах и чем они отличаются, — в ${A(CLAUDE, 'сравнении ChatGPT и Claude для пользователей из Узбекистана')}. Если нужна независимая AI-платформа`,
    },
    {
      surface: 'link paragraph (body[24]): verb before the UZ chat anchor (same anchor and href)',
      before: 'с узбекским интерфейсом, откройте <a href="/uz/gpt-uzbek-tilida/"',
      after: 'с узбекским интерфейсом, работайте в <a href="/uz/gpt-uzbek-tilida/"',
    },
    {
      surface: 'fact (OpenAI iOS and Android app FAQ): the official app\'s publisher in both stores',
      before: 'Устанавливайте только официальное приложение. Для iOS OpenAI отдельно рекомендует проверять, что издатель приложения — OpenAI.',
      after: 'Устанавливайте только официальное приложение. OpenAI рекомендует проверять издателя: в App Store разработчик — OpenAI OpCo, LLC, в Google Play издатель — OpenAI.',
    },
    {
      surface: 'fact (OpenAI «Canceling your ChatGPT subscription»): uninstalling the app does not cancel the subscription',
      before: 'Удаление приложения само по себе обычно не отменяет подписку.',
      after: 'Удаление приложения само по себе не отменяет подписку.',
    },
    {
      surface: 'visible FAQ answer «Удаление приложения отменяет подписку?» (same fact)',
      before: '<p class="faq-a text-white/75 mt-4 leading-relaxed">Обычно нет. Нужно отдельно',
      after: '<p class="faq-a text-white/75 mt-4 leading-relaxed">Нет. Нужно отдельно',
    },
    {
      surface: 'FAQPage JSON-LD answer «Удаление приложения отменяет подписку?» (same fact)',
      before: '"acceptedAnswer":{"@type":"Answer","text":"Обычно нет. Нужно отдельно',
      after: '"acceptedAnswer":{"@type":"Answer","text":"Нет. Нужно отдельно',
    },
    {
      surface: 'visible update date under the byline',
      before: 'Обновлено <time datetime="2026-07-30">2026-07-30</time>',
      after: 'Обновлено <time datetime="2026-10-26">2026-10-26</time>',
    },
    {
      surface: 'BlogPosting JSON-LD dateModified',
      before: '"datePublished":"2026-07-30","dateModified":"2026-07-30"',
      after: '"datePublished":"2026-07-30","dateModified":"2026-10-26"',
    },
    {
      surface: '<meta property="article:modified_time">',
      before: '<meta property="article:modified_time" content="2026-07-30" />',
      after: '<meta property="article:modified_time" content="2026-10-26" />',
    },
    {
      surface: 'BlogPosting JSON-LD citation: the two moved help-center addresses',
      before: `"citation":${JSON.stringify(OLD_CITATION)}`,
      after: `"citation":${JSON.stringify(NEW_CITATION)}`,
    },
    {
      surface: 'source «What is ChatGPT Plus?»: check date',
      before: 'Цена Plus 20 долларов в месяц на дату проверки 2026-07-30; условия могут меняться.',
      after: 'Цена Plus 20 долларов в месяц на дату проверки 2026-10-26; условия могут меняться.',
    },
    {
      surface: 'source «Multi-currency billing»: current address, title and check date',
      before: source(help('10421635-multi-currency-billing-faq'), 'OpenAI Help Center — Multi-currency billing FAQ', 'Карты для web-подписок, биллинг Apple и Google, опубликованный список валют; проверено 2026-07-30.'),
      after: source(help('10421635-multicurrency-billing'), 'OpenAI Help Center — Multi-currency billing', 'Карты для web-подписок, биллинг Apple и Google, опубликованный список валют (UZS в нём нет); проверено 2026-10-26.'),
    },
    {
      surface: 'source «ChatGPT supported countries»: check date',
      before: 'Узбекистан присутствует в списке поддерживаемых стран; проверено 2026-07-30.',
      after: 'Узбекистан присутствует в списке поддерживаемых стран; проверено 2026-10-26.',
    },
    {
      surface: 'source «ChatGPT iOS and Android app FAQ»: current address (the iOS page redirects there), title and check date',
      before: source(help('7908378-where-can-i-download-the-openai-chatgpt-ios-app-on-the-apple-app-store'), 'OpenAI Help Center — official ChatGPT iOS app', 'Проверка официального издателя приложения OpenAI; проверено 2026-07-30.'),
      after: source(help('8142208-chatgpt-ios-and-android-app-faq'), 'OpenAI Help Center — ChatGPT iOS and Android app FAQ', 'Официальное приложение: в App Store разработчик OpenAI OpCo, LLC, в Google Play издатель OpenAI; проверено 2026-10-26.'),
    },
  ],
  [PROMPTS]: [
    {
      surface: 'new paragraph after the work-documents prompts: link to the ariza / tushuntirish xati guide (W2-01)',
      before: '',
      after: `\n${LINKP}Ariza yoki tushuntirish xatining o‘zi kerak bo‘lsa, tuzilma va shartli namunalar ${A(ARIZA, 'ariza va tushuntirish xati namunasi')} qo‘llanmasida.</p>`,
    },
    {
      surface: '«Shuningdek o‘qing» card anchor to the insho/esse guide (H-5, intent manifest C30; same href)',
      before: 'transition-colors">insho va referat yozish</span>',
      after: 'transition-colors">insho va esse yozish</span>',
    },
  ],
  [VPN]: [],
  [AI_CHAT]: [],
};

// The visible text one swap changes, with enough words around it to be unique in
// the text it applies to. Replaying {after → before} in order on the new body
// text gives the predecessor's body text.
const textStep = (newText: string, oldText: string) => {
  let p = 0;
  while (p < newText.length && p < oldText.length && newText[p] === oldText[p]) p++;
  let s = 0;
  while (s < newText.length - p && s < oldText.length - p && newText[newText.length - 1 - s] === oldText[oldText.length - 1 - s]) s++;
  let start = p;
  while (start > 0 && newText[start - 1] !== ' ') start--;
  let endN = newText.length - s;
  let endO = oldText.length - s;
  while (endN < newText.length && newText[endN] !== ' ') { endN++; endO++; }
  for (let words = 2; ; words++) {
    let a = start;
    for (let w = 0; w < words && a > 0; w++) { a--; while (a > 0 && newText[a - 1] !== ' ') a--; }
    let bN = endN; let bO = endO;
    for (let w = 0; w < words && bN < newText.length; w++) {
      bN++; bO++;
      while (bN < newText.length && newText[bN] !== ' ') { bN++; bO++; }
    }
    const after = newText.slice(a, bN);
    const before = oldText.slice(a, bO);
    if (newText.split(after).length === 2 || (a === 0 && bN === newText.length)) return { before, after };
  }
};

const pages = PROTECTED_PATHS.map((pathname) => {
  const html = fs.readFileSync(path.join(root, 'dist', pathname.slice(1), 'index.html'), 'utf8');
  return { pathname, contract: seoContract(html), bodyText: bodyTextOf(html), htmlSha256: sha(html), html };
});

const reviewedChanges = [];
const jsonLdOnly: Record<string, string> = {};
const breadcrumbNames: Record<string, string> = {};
for (const page of pages) {
  const before = previous.pages.find((p) => p.pathname === page.pathname) ?? fail(`${page.pathname}: not in ${previousRevision}`);
  if (!page.html.includes(`href="${STYLESHEET}"`)) fail(`${page.pathname}: the shared stylesheet is not ${STYLESHEET}`);
  if (CHATS.includes(page.pathname) && !page.html.includes(`src="${CHAT_BUNDLE}"`)) fail(`${page.pathname}: the chat bundle moved`);
  if (UNTOUCHED.includes(page.pathname)) {
    if (page.htmlSha256 !== before.htmlSha256) fail(`${page.pathname}: must stay byte for byte as reviewed (its own window)`);
    if (page.pathname !== '/' && !page.html.includes('{"@type":"BreadcrumbList","itemListElement":')) fail(`${page.pathname}: a held page lost its nameless breadcrumb list`);
    continue;
  }
  const expected = EXPECTED[page.pathname];
  const fields = (Object.keys(page.contract) as Array<keyof typeof page.contract>)
    .filter((k) => JSON.stringify(page.contract[k]) !== JSON.stringify(before.contract[k]));
  if (JSON.stringify(fields) !== JSON.stringify(expected.fields)) fail(`${page.pathname}: changed ${JSON.stringify(fields)}, expected ${JSON.stringify(expected.fields)}`);
  const added = page.contract.internalLinks.filter((h) => !before.contract.internalLinks.includes(h));
  const removed = before.contract.internalLinks.filter((h) => !page.contract.internalLinks.includes(h));
  if (JSON.stringify(added) !== JSON.stringify(expected.added) || removed.length) fail(`${page.pathname}: links +${JSON.stringify(added)} -${JSON.stringify(removed)}`);
  if (page.contract.h1.length !== 1) fail(`${page.pathname}: expected one H1`);

  // Put every reviewed swap back, one occurrence each, and record the text it moves.
  let html = page.html;
  const body: Array<{ surface: string; before: string; after: string }> = [];
  const swaps = [breadcrumbName(page.contract.h1[0]), ...SWAPS[page.pathname]];
  for (const swap of swaps) {
    const found = html.split(swap.after).length - 1;
    if (found !== 1) fail(`${page.pathname}: «${swap.surface}» expected 1×, found ${found}×`);
    const textBefore = bodyTextOf(html);
    html = html.replace(swap.after, () => swap.before);
    const textAfter = bodyTextOf(html);
    if (textBefore !== textAfter) body.push({ surface: swap.surface, ...textStep(textBefore, textAfter) });
  }
  if (sha(html) !== before.htmlSha256) fail(`${page.pathname}: the HTML differs from the predecessor by more than the reviewed swaps`);
  breadcrumbNames[page.pathname] = page.contract.h1[0];

  // Replaying the recorded text steps on the new body text gives the old one.
  let replay = page.bodyText;
  for (const step of body) {
    if (replay.split(step.after).length !== 2) fail(`${page.pathname}: text step is not unique: ${step.after}`);
    replay = replay.replace(step.after, () => step.before);
  }
  if (replay !== before.bodyText) fail(`${page.pathname}: the recorded text steps do not reproduce the predecessor's body text`);

  if (!expected.fields.length) {
    if (body.length) fail(`${page.pathname}: a JSON-LD-only page changed its text`);
    jsonLdOnly[page.pathname] = `${before.htmlSha256} → ${page.htmlSha256}`;
    continue;
  }
  const dated = page.pathname === PAY;
  reviewedChanges.push({
    pathname: page.pathname,
    fields: expected.fields,
    reason: 'Owner, chat 26.10.2026: ship the safe step R-S1b (backlog W2-01; ROADMAP_TOP3.md §4.2 step 2.4, §6 Т-08) now instead of ≈08.11, ahead of the P-CTR read ≈05–07.11, which for this article now measures R-S1 + R-S1b together. In-body links between the money-adjacent articles and the H-5 anchor; the two chats, the login guide and the download guide stay on their dates.',
    change: {
      title: 'unchanged', h1: 'unchanged', description: 'unchanged', robots: 'unchanged', canonical: 'unchanged', hreflang: 'unchanged',
      internalLinks: `+${added.join(', +')}; none removed`,
      dates: dated
        ? 'dateModified, article:modified_time and the visible «Обновлено» 2026-07-30 → 2026-10-26 (facts corrected after the re-check); datePublished unchanged'
        : 'unchanged (dateModified, datePublished and <time> as before)',
      body,
      bodyTextSha256: `${before.contract.bodyTextSha256} → ${page.contract.bodyTextSha256}`,
      bodyTextLength: `${before.bodyText.length} → ${page.bodyText.length}`,
    },
    nonContract: {
      jsonLd: dated
        ? `BreadcrumbList gets name «${page.contract.h1[0]}» (the H1); BlogPosting dateModified 2026-07-30 → 2026-10-26 and citation[1], citation[3] → the current help-center addresses; FAQPage answer «Обычно нет.» → «Нет.» (the same corrected fact as the visible FAQ).`
        : `BreadcrumbList gets name «${page.contract.h1[0]}» (the H1); nothing else in the JSON-LD moves.`,
      ...(dated ? { head: '<meta property="article:modified_time"> 2026-07-30 → 2026-10-26; title, description, og/twitter text, canonical and hreflang unchanged.' } : {}),
    },
    htmlSha256: `${before.htmlSha256} → ${page.htmlSha256}`,
  });
}

// The whole site against the predecessor build.
const predecessorDist = process.env.PREDECESSOR_DIST;
type Unprotected = {
  mainContent: string[]; byteIdentical: number; datesMoved: string[];
  internalLinks: Record<string, { added: string[]; removed: string[] }>;
};
let unprotected: Unprotected | null = null;
const sitewide: { identicalFiles: number; identical: string[]; changed: Record<string, string> } = { identicalFiles: 0, identical: [], changed: {} };
// The blog index lists the payment article under «Недавно обновлённые» (its dateModified moved).
const MAIN_CONTENT = ['/ru/blog/'];
// Files outside the HTML pages that may change: what lists or mirrors the three articles.
const CHANGED_FILES = [
  'llms-full.txt', 'ru/blog/feed.xml', 'sitemap-updates.xml', 'sitemap.xml', 'updates/atom.xml',
  'ru/blog/chatgpt-i-claude-v-uzbekistane/index.html.md', 'ru/blog/kak-oplatit-chatgpt-v-uzbekistane/index.html.md',
  'uz/blog/chatgpt-uzbek-tilida-promptlar/index.html.md',
];
if (predecessorDist) {
  for (const p of previous.pages) {
    const raw = fs.readFileSync(path.join(predecessorDist, p.pathname.slice(1), 'index.html'), 'utf8');
    if (sha(raw) !== p.htmlSha256) fail(`PREDECESSOR_DIST is not the predecessor build: ${p.pathname} does not hash to ${previousRevision}`);
  }
  const walk = (dir: string, base = dir, out: string[] = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '.vite') walk(p, base, out); } else out.push(path.relative(base, p).split(path.sep).join('/'));
    }
    return out;
  };
  const dates = (html: string) => [
    ...html.matchAll(/"(?:dateModified|datePublished|lastReviewed)":"[^"]*"/g),
    ...html.matchAll(/<meta\b[^>]*property="article:(?:modified|published)_time"[^>]*>/g),
    ...html.matchAll(/<time\b[^>]*>[^<]*/g),
  ].map((m) => m[0]);
  // The release stamp (scripts/release/pages-production.ts) exists only in a stamped build.
  const IGNORED = new Set(['gptbot-release.json']);
  const before = walk(predecessorDist).filter((f) => !IGNORED.has(f)).sort();
  const after = walk(path.join(root, 'dist')).filter((f) => !IGNORED.has(f)).sort();
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    fail(`the file set changed: +${after.filter((f) => !before.includes(f)).join(', ')} -${before.filter((f) => !after.includes(f)).join(', ')}`);
  }
  unprotected = { mainContent: [], byteIdentical: 0, datesMoved: [], internalLinks: {} };
  const changedFiles: string[] = [];
  for (const rel of before) {
    const a = fs.readFileSync(path.join(predecessorDist, rel));
    const b = fs.readFileSync(path.join(root, 'dist', rel));
    if (a.equals(b)) { if (!rel.endsWith('index.html')) sitewide.identicalFiles += 1; else unprotected.byteIdentical += 1; continue; }
    if (rel.endsWith('/index.html') || rel === 'index.html') {
      const url = rel === 'index.html' ? '/' : `/${rel.slice(0, -'index.html'.length)}`;
      if ((PROTECTED_PATHS as readonly string[]).includes(url)) continue;
      const ha = a.toString('utf8'); const hb = b.toString('utf8');
      const ca = seoContract(ha); const cb = seoContract(hb);
      for (const k of ['title', 'h1', 'description', 'robots', 'googlebot', 'canonical', 'hreflang'] as const) {
        if (JSON.stringify(ca[k]) !== JSON.stringify(cb[k])) fail(`${url}: ${k} changed`);
      }
      if (!MAIN_CONTENT.includes(url)) fail(`${url}: changed outside the reviewed list`);
      unprotected.mainContent.push(url);
      if (JSON.stringify(dates(ha)) !== JSON.stringify(dates(hb))) unprotected.datesMoved.push(url);
      if (JSON.stringify(ca.internalLinks) !== JSON.stringify(cb.internalLinks)) {
        unprotected.internalLinks[url] = {
          added: cb.internalLinks.filter((h) => !ca.internalLinks.includes(h)),
          removed: ca.internalLinks.filter((h) => !cb.internalLinks.includes(h)),
        };
      }
      continue;
    }
    // llms.txt is copied from public/: a checkout with CRLF line ends differs by them only.
    if (rel === 'llms.txt' && a.toString('utf8').replace(/\r\n/g, '\n') === b.toString('utf8').replace(/\r\n/g, '\n')) {
      sitewide.identicalFiles += 1;
      sitewide.changed['llms.txt'] = 'identical in content; only line ends differ when the predecessor checkout has CRLF (public/llms.txt is copied as is)';
      continue;
    }
    changedFiles.push(rel);
  }
  if (JSON.stringify(changedFiles.sort()) !== JSON.stringify([...CHANGED_FILES].sort())) fail(`changed files ${JSON.stringify(changedFiles)}, expected ${JSON.stringify(CHANGED_FILES)}`);
  if (JSON.stringify(unprotected.mainContent) !== JSON.stringify(MAIN_CONTENT)) fail(`changed pages ${JSON.stringify(unprotected.mainContent)}`);
  for (const [url, v] of Object.entries(unprotected.internalLinks)) if (v.removed.length) fail(`${url}: removed links ${JSON.stringify(v.removed)}`);
  for (const f of ['robots.txt', 'uz/blog/feed.xml', '_redirects', '_headers', 'ru/oferta/index.html', 'uz/oferta/index.html',
    STYLESHEET.slice(1), CHAT_BUNDLE.slice(1)]) {
    if (!fs.readFileSync(path.join(predecessorDist, f)).equals(fs.readFileSync(path.join(root, 'dist', f)))) fail(`${f} changed`);
    sitewide.identical.push(f);
  }
  // sitemap.xml: only the payment article's lastmod moves, to 2026-10-26.
  const lastmods = (xml: string) => Object.fromEntries([...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>[\s\S]*?<lastmod>([^<]+)<\/lastmod>/g)].map((m) => [m[1], m[2]]));
  const la = lastmods(fs.readFileSync(path.join(predecessorDist, 'sitemap.xml'), 'utf8'));
  const lb = lastmods(fs.readFileSync(path.join(root, 'dist', 'sitemap.xml'), 'utf8'));
  if (JSON.stringify(Object.keys(la).sort()) !== JSON.stringify(Object.keys(lb).sort())) fail('sitemap.xml: the URL set changed');
  const movedLastmod = Object.keys(lb).filter((u) => la[u] !== lb[u]).map((u) => u.replace('https://gptbot.uz', '')).sort();
  if (JSON.stringify(movedLastmod) !== JSON.stringify([PAY])) fail(`sitemap.xml lastmod moved on ${JSON.stringify(movedLastmod)}`);
  if (lb[`https://gptbot.uz${PAY}`] !== '2026-10-26' || la[`https://gptbot.uz${PAY}`] !== '2026-07-30') fail('sitemap.xml: the payment article\'s lastmod is not 2026-07-30 → 2026-10-26');
  sitewide.changed['sitemap.xml'] = `lastmod 2026-07-30 → 2026-10-26 on ${PAY} only; the URL set is unchanged`;
  const lu = (dir: string) => lastmods(fs.readFileSync(path.join(dir, 'sitemap-updates.xml'), 'utf8'));
  const ua = lu(predecessorDist); const ub = lu(path.join(root, 'dist'));
  const updAdded = Object.keys(ub).filter((u) => !(u in ua));
  if (JSON.stringify(updAdded) !== JSON.stringify([`https://gptbot.uz${PAY}`]) || Object.keys(ua).some((u) => !(u in ub) || ua[u] !== ub[u])
    || ub[`https://gptbot.uz${PAY}`] !== '2026-10-26') fail('sitemap-updates.xml: expected only the payment article added at 2026-10-26');
  for (const [file, tag] of [['ru/blog/feed.xml', 'item'], ['updates/atom.xml', 'entry']] as const) {
    const count = (xml: string) => xml.split(`<${tag}`).length - 1;
    const xa = fs.readFileSync(path.join(predecessorDist, file), 'utf8'); const xb = fs.readFileSync(path.join(root, 'dist', file), 'utf8');
    const entries = (xml: string) => xml.split(`<${tag}`).slice(1).map((e) => e.slice(0, e.indexOf(`</${tag}>`)));
    const eb = entries(xb);
    const at = eb.findIndex((e) => e.includes(`https://gptbot.uz${PAY}<`));
    if (count(xa) !== count(xb) || xa.includes(`https://gptbot.uz${PAY}<`) || at < 0 || at > 1 || !eb[at].includes('2026-10-26T00:00:00Z')
      || eb.slice(0, at).some((e) => !e.includes('2026-10-26T00:00:00Z'))) fail(`${file}: expected the payment article among the 2026-10-26 entries at the top, same entry count`);
  }
  sitewide.changed['sitemap-updates.xml'] = `lists the payment article with lastmod 2026-10-26 (${Object.keys(ua).length} → ${Object.keys(ub).length} URLs); every other entry unchanged`;
  sitewide.changed['ru/blog/feed.xml, updates/atom.xml'] = 'the payment article enters with updated 2026-10-26, second after the SMM article of the same date, and the oldest entry leaves each capped feed (same entry count)';
  sitewide.changed['Markdown twins'] = 'the Claude article, the payment article and promptlar follow their HTML (the new paragraphs and links, the corrected facts and sources, the date); the VPN article and ai-chat-nima twins are unchanged';
  sitewide.changed['llms-full.txt'] = 'carries the three twins\' bodies, so it follows them';
}

const revision = {
  schema: 1,
  capturedAt: new Date().toISOString(),
  source: 'Locally generated production candidate (npm run build:production of 1286f7e4: d87ceff3 and 1286f7e4 on 6892b5cd = production 77e54817 plus docs) after source review; the predecessor build of 77e54817 reproduces the predecessor revision\'s ten htmlSha256 byte for byte; actual live verification recorded separately after release',
  previousRevision,
  previousRevisionSha256: sha(previousRaw),
  reviewedChanges,
  invisibleToGate: [
    {
      change: `The BreadcrumbList JSON-LD of the five R-S1b articles gets a top-level name, the page's H1 (scripts/jsonld-helpers.ts BREADCRUMB_NAME_HELD loses them; Т-08). On the VPN article and ai-chat-nima that is the whole change: their contract and body text stay, their HTML moves (htmlSha256). The download guide, both chats and the login guide stay in the held set and keep their nameless list.`,
      pages: [...R_S1B],
      names: breadcrumbNames,
      htmlSha256: jsonLdOnly,
    },
    {
      change: 'The payment article\'s JSON-LD and <head> follow its corrected body: BlogPosting dateModified and article:modified_time 2026-07-30 → 2026-10-26, citation[1] and citation[3] → the current help-center addresses (…/10421635-multicurrency-billing, …/8142208-chatgpt-ios-and-android-app-faq; the old addresses redirect there), and the FAQPage answer «Удаление приложения отменяет подписку?» «Обычно нет.» → «Нет.». content/blog/ru/kak-oplatit-chatgpt-v-uzbekistane.json also gains lastReviewedAt 2026-10-26, which the blog template does not render yet.',
      pages: [PAY],
    },
    { change: `${UNTOUCHED.join(', ')} are byte-identical to the predecessor (the download guide's R-S2 16.11, the chats' and the login guide's windows ≈25.11–02.12; the homepage has no R-S1b change). Every one of the ten keeps the shared stylesheet ${STYLESHEET}; the chats keep their bundle ${CHAT_BUNDLE}. No title, description, H1, canonical, robots or hreflang moves on any of the ten.` },
    ...(unprotected ? [
      { change: `Across the site against the predecessor build: the file set is unchanged; ${sitewide.identical.join(', ')} are byte-identical, and so are ${unprotected.byteIdentical} of the HTML pages outside the protected set and ${sitewide.identicalFiles} other files (llms.txt by content). ${Object.entries(sitewide.changed).map(([k, v]) => `${k}: ${v}`).join('. ')}.` },
      { change: `Outside the protected set one page changes: ${unprotected.mainContent.join(', ')} lists the payment article under «Недавно обновлённые» (dates move only there). Title, description, H1, canonical, robots and hreflang of every page of the site are unchanged; no internal link is removed anywhere.` },
    ] : []),
  ],
  measurement: 'R-S1b ships on 26.10, before the P-CTR R-S1 read (≈05–07.11): for the payment article, the Claude article and promptlar that read now measures R-S1 + R-S1b together, not R-S1 alone (docs/seo/CHANGE_LOG_2026-10.md, 26.10). The VPN article and ai-chat-nima change in JSON-LD only. Record the release date as a marker on the open reads: the login guide\'s P-CTR (≈05–07.11), the download guide\'s R-S2 (16.11) and the chats\' windows (≈25.11–02.12); none of their HTML moves. The stop rule (ROADMAP_TOP3.md §4.0 rule 3) for the three articles counts from their recrawl after this release; record the 28-day query × page base on the release day. No ranking or traffic guarantee.',
  ...(unprotected ? { changedUnprotectedPages: unprotected } : {}),
  pages: pages.map(({ pathname, contract, bodyText, htmlSha256 }) => ({ pathname, contract, bodyText, htmlSha256 })),
};

console.log(JSON.stringify({
  reviewedChanges: reviewedChanges.map((c) => ({ pathname: c.pathname, links: c.change.internalLinks, body: c.change.body.map((b) => `${b.surface}: «${b.before}» → «${b.after}»`) })),
  jsonLdOnly, breadcrumbNames,
  unprotected, sitewide,
}, null, 2));
if (process.env.DRY) {
  console.log('DRY: every check passed; nothing written.');
} else {
  if (!unprotected) fail('Set PREDECESSOR_DIST to a build of 77e54817 to write the revision.');
  if (fs.existsSync(target)) fail('Revision already exists; write a new revision instead of replacing reviewed evidence.');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(revision, null, 2) + '\n', { flag: 'wx' });
  console.log(`Wrote ${path.relative(root, target)}`);
}
