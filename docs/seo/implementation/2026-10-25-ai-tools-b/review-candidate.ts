import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seoContract, PROTECTED_PATHS } from '../../../../scripts/seo-protection';

// Builds the 2026-10-25-ai-tools-b revision from the local production candidate
// in dist/ (npm run build:fast of the AI-tools wave B tree: the practice-quiz
// widget 205461eb, the tests pilot 1de4cd78 + 5afc925c and the wave B content
// on top of 07fa6d36 = production 99920cdc + its release record). Wave B (owner
// order of 25.10: every new page is an AI tool of GPTBot.uz that leads into the
// chat or the agency) edits no protected content file. The homepage shell
// (scripts/prerender-home.ts) lists every published page by its H1 and every
// published article by its title, so exactly one protected page may change its
// contract: "/", by list entries. The script refuses to write if anything else
// moved:
//  - "/": internalLinks gains exactly the nine new tool pages (four Uzbek
//    English-tenses pages, the Russian tenses hub, three practice tests and the
//    tests hub) and the four niche ad playbooks, and loses none; the body text
//    differs by exactly their thirteen labels; and the HTML equals the
//    predecessor's byte for byte once the thirteen <li> entries are removed.
//  - the two chats: contract and body text unchanged, and the HTML equals the
//    predecessor's byte for byte; if the chat bundle was renamed, its one
//    reference is put back to the predecessor's name first (no other asset,
//    attribute or text may move).
//  - the seven protected articles: HTML byte-identical to the predecessor.
// DRY=1 runs every check and prints the result without writing.
const root = process.cwd();
const previousRevision = 'docs/seo/evidence/2026-10-25-ai-tools/reviewed-protected-pages.json';
const target = path.join(root, 'docs/seo/evidence/2026-10-25-ai-tools-b/reviewed-protected-pages.json');
const previousRaw = fs.readFileSync(path.join(root, previousRevision), 'utf8').replace(/\r\n/g, '\n');
const previous = JSON.parse(previousRaw) as {
  pages: Array<{ pathname: string; contract: ReturnType<typeof seoContract>; bodyText: string; htmlSha256: string }>;
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const fail = (message: string): never => { throw new Error(message); };
// prerender-home.ts escapes & and < only; the contract keeps entities as they are.
const label = (s: string) => s.replace(/[&<]/g, (c) => ({ '&': '&amp;', '<': '&lt;' }[c] as string)).replace(/\s+/g, ' ').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
type Doc = { status: string; url: string; h1: string; title: string; robotsIndex?: boolean; pageType?: string; chatRole?: string };
const readDoc = (file: string, url: string) => {
  const doc = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as Doc;
  if (doc.status !== 'published' || doc.url !== url || doc.robotsIndex === false) fail(`${file}: not the published, indexable ${url}`);
  return doc;
};

// The new entries: tool pages by H1 (moneyRu / moneyUz), the four playbooks by title (blogRu / blogUz).
const NEW = [
  { url: '/ru/blog/reklama-stomatologii-i-kliniki-tashkent/', file: 'content/blog/ru/reklama-stomatologii-i-kliniki-tashkent.json', by: 'title', pairs: 'C80, C81' },
  { url: '/ru/blog/reklama-uchebnogo-tsentra-tashkent/', file: 'content/blog/ru/reklama-uchebnogo-tsentra-tashkent.json', by: 'title', pairs: 'C86, C87' },
  { url: '/ru/vremena-angliyskogo-yazyka/', file: 'content/pages/ru/vremena-angliyskogo-yazyka.json', by: 'h1', pairs: 'C75' },
  { url: '/uz/blog/oquv-markazi-reklamasi/', file: 'content/blog/uz/oquv-markazi-reklamasi.json', by: 'title', pairs: 'C84, C85' },
  { url: '/uz/blog/stomatologiya-va-klinika-reklamasi/', file: 'content/blog/uz/stomatologiya-va-klinika-reklamasi.json', by: 'title', pairs: 'C82, C83' },
  { url: '/uz/fizika-test/', file: 'content/pages/uz/fizika-test.json', by: 'h1', pairs: 'C78' },
  { url: '/uz/informatika-test/', file: 'content/pages/uz/informatika-test.json', by: 'h1', pairs: 'C77' },
  { url: '/uz/ingliz-tili-zamonlari/', file: 'content/pages/uz/ingliz-tili-zamonlari.json', by: 'h1', pairs: 'C69–C72' },
  { url: '/uz/matematika-test/', file: 'content/pages/uz/matematika-test.json', by: 'h1', pairs: 'C79' },
  { url: '/uz/onlayn-testlar/', file: 'content/pages/uz/onlayn-testlar.json', by: 'h1', pairs: 'C76–C79' },
  { url: '/uz/past-simple/', file: 'content/pages/uz/past-simple.json', by: 'h1', pairs: 'C71, C74' },
  { url: '/uz/present-continuous/', file: 'content/pages/uz/present-continuous.json', by: 'h1', pairs: 'C72, C73' },
  { url: '/uz/present-simple/', file: 'content/pages/uz/present-simple.json', by: 'h1', pairs: 'C70, C73' },
].map((n) => {
  const doc = readDoc(n.file, n.url);
  if (n.by === 'h1' && (doc.pageType !== 'gpt-chat' || !doc.chatRole)) fail(`${n.file}: a wave B tool page must be a gpt-chat page with a chatRole`);
  if ((PROTECTED_PATHS as readonly string[]).includes(n.url)) fail(`${n.url} is protected`);
  return { ...n, uz: n.url.startsWith('/uz/'), label: label(n.by === 'h1' ? doc.h1 || doc.title : doc.title || doc.h1) };
});
// The chat bundle of the predecessor (wave A build of production 99920cdc).
const CHAT_BUNDLE_BEFORE = '/assets/gpt-chat-cfOqBGh8.js';
const CHATS = ['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/'];

const pages = PROTECTED_PATHS.map((pathname) => {
  const html = fs.readFileSync(path.join(root, 'dist', pathname.slice(1), 'index.html'), 'utf8');
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const bodyText = (clean.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return { pathname, contract: seoContract(html), bodyText, htmlSha256: sha(html), html };
});

const expected: Record<string, string[]> = { '/': ['bodyTextSha256', 'internalLinks'] };
const changes = [];
const chatHashes: Record<string, string> = {};
let chatBundleAfter = '';
for (const page of pages) {
  const before = previous.pages.find((p) => p.pathname === page.pathname) ?? fail(`${page.pathname}: not in ${previousRevision}`);
  const fields = (Object.keys(page.contract) as Array<keyof typeof page.contract>)
    .filter((k) => JSON.stringify(page.contract[k]) !== JSON.stringify(before.contract[k]))
    .sort();
  const want = expected[page.pathname] ?? [];
  if (JSON.stringify(fields) !== JSON.stringify(want)) fail(`${page.pathname}: changed ${JSON.stringify(fields)}, reviewed ${JSON.stringify(want)}`);

  if (CHATS.includes(page.pathname)) {
    if (page.bodyText !== before.bodyText) fail(`${page.pathname}: body text changed`);
    const bundles = [...new Set(page.html.match(/\/assets\/gpt-chat-[\w-]+\.js/g) || [])];
    if (bundles.length !== 1) fail(`${page.pathname}: expected one chat bundle reference, found ${JSON.stringify(bundles)}`);
    if (chatBundleAfter && bundles[0] !== chatBundleAfter) fail(`${page.pathname}: the two chats load different bundles`);
    chatBundleAfter = bundles[0];
    if (chatBundleAfter === CHAT_BUNDLE_BEFORE) {
      if (page.htmlSha256 !== before.htmlSha256) fail(`${page.pathname}: same bundle, yet the HTML changed`);
    } else if (sha(page.html.split(chatBundleAfter).join(CHAT_BUNDLE_BEFORE)) !== before.htmlSha256) {
      fail(`${page.pathname}: the HTML differs by more than the chat bundle name`);
    }
    chatHashes[page.pathname] = `${before.htmlSha256} → ${page.htmlSha256}`;
    continue;
  }
  if (page.pathname !== '/') {
    if (page.htmlSha256 !== before.htmlSha256) fail(`${page.pathname}: HTML changed; the seven protected articles must be byte-identical to the predecessor`);
    continue;
  }

  const added = page.contract.internalLinks.filter((l) => !before.contract.internalLinks.includes(l));
  const dropped = before.contract.internalLinks.filter((l) => !page.contract.internalLinks.includes(l));
  if (JSON.stringify(added) !== JSON.stringify(NEW.map((n) => n.url).sort()) || dropped.length) {
    fail(`/: links added ${JSON.stringify(added)}, dropped ${JSON.stringify(dropped)}`);
  }

  let text = page.bodyText;
  let html = page.html;
  for (const n of NEW) {
    if (text.split(`${n.label} `).length !== 2) fail(`/: the label «${n.label}» is not in the body text exactly once`);
    text = text.replace(`${n.label} `, '');
    const item = new RegExp(`<li><a href="${escapeRe(n.url)}"${n.uz ? ' hreflang="uz"' : ''}>${escapeRe(n.label)}</a></li>`, 'g');
    if ((html.match(item) || []).length !== 1) fail(`/: no single <li> for ${n.url}`);
    html = html.replace(item, '');
  }
  if (text !== before.bodyText) fail('/: the body text differs by more than the thirteen labels');
  if (sha(html) !== before.htmlSha256) fail('/: the HTML differs by more than the thirteen <li> entries');

  changes.push({
    pathname: '/',
    fields,
    reason: 'Owner order of 2026-10-25 (AI-tools wave B: every new page is an AI tool of GPTBot.uz — a result from the chat or a free in-browser tool, then the AI pack or the agency): nine tool pages and four niche ad playbooks are published — '
      + NEW.map((n) => `«${n.label}» (${n.url}, intent-manifest ${n.pairs})`).join(', ')
      + '. The homepage crawler shell (scripts/prerender-home.ts) lists every published page by its H1, sorted by URL, and every published article by its title, newest first, so the Russian and Uzbek money lists gain the nine H1s in URL order and each blog list gains its two playbooks at the top. '
      + 'That is the whole change: internalLinks ' + before.contract.internalLinks.length + ' → ' + page.contract.internalLinks.length
      + ', body text by those thirteen labels only, and the HTML is the predecessor\'s byte for byte without the thirteen <li> entries. Title, H1, description, canonical, robots, googlebot, hreflang, JSON-LD and <head> of / are unchanged. No other homepage entry is added, dropped, renamed or moved.',
    change: {
      internalLinksAdded: added,
      bodyTextAdded: NEW.map((n) => n.label),
    },
    htmlSha256: `${before.htmlSha256} → ${page.htmlSha256}`,
  });
}
if (Object.keys(chatHashes).length !== CHATS.length) fail('both chats must be checked');
const chatsUnchanged = chatBundleAfter === CHAT_BUNDLE_BEFORE;

const revision = {
  schema: 1,
  capturedAt: new Date().toISOString(),
  source: 'Locally generated production candidate (npm run build:fast of the AI-tools wave B tree: the practice-quiz widget 205461eb, the tests pilot 1de4cd78 and 5afc925c and the wave B content, on 07fa6d36 = production 99920cdc plus its release record) after source review; actual live verification recorded separately after release',
  previousRevision,
  previousRevisionSha256: sha(previousRaw),
  reviewedChanges: changes,
  invisibleToGate: [
    {
      change: chatsUnchanged
        ? `The two chats are byte-identical to the predecessor: contract, body text and HTML, including the chat bundle ${CHAT_BUNDLE_BEFORE} (the practice-quiz widget 205461eb ships as its own entry and leaves the chat start bundle unchanged). The chats carry no tool field, no chips, no quiz and no lazy tool part (tests/tool-pages.test.ts, tests/practice-quiz.test.ts).`
        : `The two chats keep their contract and body text; their HTML differs from the predecessor by one asset name, the chat bundle ${CHAT_BUNDLE_BEFORE} → ${chatBundleAfter}; the generator puts the old name back and requires the predecessor's htmlSha256.`,
      pages: CHATS,
      htmlSha256: chatHashes,
    },
    { change: 'The seven protected articles are byte-identical to the predecessor (the wave A build); the generator refuses otherwise. The shared stylesheet keeps its name (/assets/index-B7Z1XlOc.css) on every page.' },
    { change: 'public/llms.txt gains nine tool lines in the chat-product list (four Uzbek tenses pages, the Russian tenses hub, the tests hub and three practice tests) and five intent lines (tenses, single tenses, practice tests, the clinic and the learning-centre playbooks); llms-full.txt, built as its superset, follows. Sitewide files, not part of any page contract.' },
    { change: 'sitemap.xml, sitemap-updates.xml, /updates/atom.xml, both blog indexes and feeds list the thirteen new URLs (sitemap 316 → 329 entries); the sitemap lastmod of / stays 2026-10-25 (already so in the predecessor build) and the other nine protected URLs keep theirs.' },
    { change: 'Outside the protected set: nine new gpt-chat tool pages in the teacher role (the tenses hub, Present Simple, Past Simple and Present Continuous in Uzbek, the Russian tenses hub, the tests hub /uz/onlayn-testlar/ and the informatika, fizika and matematika practice tests with the practice-quiz widget, 120 original questions with answers, explanations and one schema.org Quiz node per test page), four niche ad playbooks (clinic and learning centre, RU and UZ), and one contextual paragraph with links to them on fifteen older unprotected pages (/uz/notogri-fellar/, /uz/gpt-chat-qollanma/, /uz/blog/chatgpt-talabalar-uchun/, /uz/kalkulyator/, /uz/gpt-uzbek-tilida-ai-chat/, /ru/nepravilnye-glagoly/, /ru/gpt-dlya-ucheby/, the four AI-bot pages for clinics and learning centres and their four bot articles). None of these pages is protected.' },
  ],
  measurement: 'Wave B changes no search-facing field of a protected page except the homepage\'s lists (thirteen links). The chats\' 28-day window that opened with the 2026-10-24-chat-snippets revision keeps its baseline and dates: their HTML is unchanged. The download guide stays byte for byte for its P-CTR read (≈06–10.11). The new tool pages are fenced from the chat\'s queries (pairs C69, C75, C76), so impressions of the chat families on /uz/gpt-uzbek-tilida/ and /ru/gpt-chat/ should stay with the chats; if a tool page shows up for a chat query in Search Console, record it as a confound of the chat window. Read each new page like C41: at least 100 Uzbekistan impressions within 21 days of a recrawl confirmed with URL Inspection. The tests pilot (decision A10) has its own read: compare Search Console impressions of the three test pages with the Ads volumes after 4–6 weeks (≈10.01.2027) before any further subject; low impressions at a position of 20 or better mean the floor volumes are the real ones. No ranking or traffic guarantee.',
  pages: pages.map(({ pathname, contract, bodyText, htmlSha256 }) => ({ pathname, contract, bodyText, htmlSha256 })),
};

console.log(JSON.stringify({ reviewedChanges: changes.map(({ pathname, fields, change }) => ({ pathname, fields, change })), chats: chatHashes, chatBundle: chatsUnchanged ? `${CHAT_BUNDLE_BEFORE} (unchanged)` : `${CHAT_BUNDLE_BEFORE} → ${chatBundleAfter}` }, null, 2));
if (process.env.DRY) {
  console.log('DRY: every check passed; nothing written.');
} else {
  if (fs.existsSync(target)) fail('Revision already exists; write a new revision instead of replacing reviewed evidence.');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(revision, null, 2) + '\n', { flag: 'wx' });
  console.log(`Wrote ${path.relative(root, target)}`);
}
