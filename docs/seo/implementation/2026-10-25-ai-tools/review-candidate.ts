import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seoContract, PROTECTED_PATHS } from '../../../../scripts/seo-protection';

// Builds the 2026-10-25-ai-tools revision from the local production candidate in
// dist/ (npm run build:fast of the AI-tools wave A tree, base af0446fe = the
// tool-page platform on top of production 62d8fdb0 and its research docs).
// Wave A (owner order of 25.10: every new page is an AI tool of GPTBot.uz that
// leads into the chat or the agency) edits no protected content file. The
// homepage shell (scripts/prerender-home.ts) lists every published page by its
// H1 and every published article by its title, so exactly one protected page
// may change its contract: "/", by list entries. The script refuses to write if
// anything else moved:
//  - "/": internalLinks gains exactly the nine tool pages and the two Uzum
//    guides and loses none; the body text differs by exactly their eleven labels
//    and the new H1 of /uz/gpt-telegram-instagram-ideya/ (retargeted to «reklama
//    matni yozish», same href) in place of the old one; and the HTML equals the
//    predecessor's byte for byte once the eleven <li> entries are removed and
//    the old label is put back.
//  - the two chats: contract and body text unchanged, and the HTML equals the
//    predecessor's byte for byte once the one chat bundle reference is put back
//    to the predecessor's name (the bundle changed in the platform commit
//    af0446fe; no other asset, attribute or text may move).
//  - the seven protected articles: HTML byte-identical to the predecessor.
// DRY=1 runs every check and prints the result without writing.
const root = process.cwd();
const previousRevision = 'docs/seo/evidence/2026-10-24-wave1b/reviewed-protected-pages.json';
const target = path.join(root, 'docs/seo/evidence/2026-10-25-ai-tools/reviewed-protected-pages.json');
const previousRaw = fs.readFileSync(path.join(root, previousRevision), 'utf8').replace(/\r\n/g, '\n');
const previous = JSON.parse(previousRaw) as {
  pages: Array<{ pathname: string; contract: ReturnType<typeof seoContract>; bodyText: string; htmlSha256: string }>;
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const fail = (message: string): never => { throw new Error(message); };
// prerender-home.ts escapes & and < only; the contract keeps entities as they are.
const label = (s: string) => s.replace(/[&<]/g, (c) => ({ '&': '&amp;', '<': '&lt;' }[c] as string)).replace(/\s+/g, ' ').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
type Doc = { status: string; url: string; h1: string; title: string; robotsIndex?: boolean };
const readDoc = (file: string, url: string) => {
  const doc = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as Doc;
  if (doc.status !== 'published' || doc.url !== url || doc.robotsIndex === false) fail(`${file}: not the published, indexable ${url}`);
  return doc;
};

// The new entries: tool pages by H1 (moneyRu / moneyUz), the two guides by title (blogRu / blogUz).
const NEW = [
  { url: '/ru/generator-pozdravleniy/', file: 'content/pages/ru/generator-pozdravleniy.json', by: 'h1', pairs: 'C57' },
  { url: '/ru/kalkulyator/', file: 'content/pages/ru/kalkulyator.json', by: 'h1', pairs: 'C59, C60' },
  { url: '/ru/kirillica-v-latinicu/', file: 'content/pages/ru/kirillica-v-latinicu.json', by: 'h1', pairs: 'C64' },
  { url: '/ru/nepravilnye-glagoly/', file: 'content/pages/ru/nepravilnye-glagoly.json', by: 'h1', pairs: 'C62' },
  { url: '/uz/ai-sher-yozish/', file: 'content/pages/uz/ai-sher-yozish.json', by: 'h1', pairs: 'C53, C56' },
  { url: '/uz/ai-tabrik-generatori/', file: 'content/pages/uz/ai-tabrik-generatori.json', by: 'h1', pairs: 'C54–C56' },
  { url: '/uz/kalkulyator/', file: 'content/pages/uz/kalkulyator.json', by: 'h1', pairs: 'C58' },
  { url: '/uz/kirill-lotin/', file: 'content/pages/uz/kirill-lotin.json', by: 'h1', pairs: 'C63' },
  { url: '/uz/notogri-fellar/', file: 'content/pages/uz/notogri-fellar.json', by: 'h1', pairs: 'C61' },
  { url: '/ru/blog/kak-stat-prodavcom-na-uzum-market/', file: 'content/blog/ru/kak-stat-prodavcom-na-uzum-market.json', by: 'title', pairs: 'C68' },
  { url: '/uz/blog/uzum-marketda-sotuvchi-bolish/', file: 'content/blog/uz/uzum-marketda-sotuvchi-bolish.json', by: 'title', pairs: 'C67' },
].map((n) => {
  const doc = readDoc(n.file, n.url);
  return { ...n, uz: n.url.startsWith('/uz/'), label: label(n.by === 'h1' ? doc.h1 || doc.title : doc.title || doc.h1) };
});
// The retargeted Uzbek page: same href on "/", new H1.
const RETARGET = { url: '/uz/gpt-telegram-instagram-ideya/', file: 'content/pages/uz/gpt-telegram-instagram-ideya.json' };
const RETARGET_OLD_LABEL = 'GPT Telegram va Instagram uchun: g‘oyalar va reklama matnlari';
const retargetNewLabel = label(readDoc(RETARGET.file, RETARGET.url).h1);
if (retargetNewLabel === RETARGET_OLD_LABEL) fail(`${RETARGET.file}: the H1 did not change`);
// The chat bundle of the predecessor (wave-1b build of production f97295b5 / 62d8fdb0).
const CHAT_BUNDLE_BEFORE = '/assets/gpt-chat-qKkuHbSa.js';
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
  if (!page.contract.internalLinks.includes(RETARGET.url)) fail(`/: no longer links ${RETARGET.url}`);

  let text = page.bodyText;
  let html = page.html;
  for (const n of NEW) {
    if (text.split(`${n.label} `).length !== 2) fail(`/: the label «${n.label}» is not in the body text exactly once`);
    text = text.replace(`${n.label} `, '');
    const item = new RegExp(`<li><a href="${escapeRe(n.url)}"${n.uz ? ' hreflang="uz"' : ''}>${escapeRe(n.label)}</a></li>`, 'g');
    if ((html.match(item) || []).length !== 1) fail(`/: no single <li> for ${n.url}`);
    html = html.replace(item, '');
  }
  if (text.split(retargetNewLabel).length !== 2) fail(`/: the new label «${retargetNewLabel}» is not in the body text exactly once`);
  if (before.bodyText.split(RETARGET_OLD_LABEL).length !== 2) fail(`/: the old label is not in the predecessor's body text exactly once`);
  text = text.replace(retargetNewLabel, RETARGET_OLD_LABEL);
  const retargetItem = `<li><a href="${RETARGET.url}" hreflang="uz">${retargetNewLabel}</a></li>`;
  if (html.split(retargetItem).length !== 2) fail(`/: no single <li> for ${RETARGET.url} with its new label`);
  html = html.replace(retargetItem, `<li><a href="${RETARGET.url}" hreflang="uz">${RETARGET_OLD_LABEL}</a></li>`);
  if (text !== before.bodyText) fail('/: the body text differs by more than the eleven labels and the retargeted H1');
  if (sha(html) !== before.htmlSha256) fail('/: the HTML differs by more than the eleven <li> entries and the retargeted H1');

  changes.push({
    pathname: '/',
    fields,
    reason: 'Owner order of 2026-10-25 (AI-tools wave A: every new page is an AI tool of GPTBot.uz — a result from the chat or a free in-browser tool, then the AI pack or the agency): nine tool pages and two Uzum seller guides are published — '
      + NEW.map((n) => `«${n.label}» (${n.url}, intent-manifest ${n.pairs})`).join(', ')
      + ' — and ' + RETARGET.url + ' is retargeted from «GPT Telegram Instagram» to «reklama matni yozish» (pairs C65, C66) with the H1 «' + retargetNewLabel + '» instead of «' + RETARGET_OLD_LABEL + '» (same URL and href). '
      + 'The homepage crawler shell (scripts/prerender-home.ts) lists every published page by its H1, sorted by URL, and every published article by its title, newest first, so the Russian and Uzbek money lists gain the nine H1s in URL order, each blog list gains its guide at the top, and the Uzbek money list shows the retargeted H1 under the same href. '
      + 'That is the whole change: internalLinks ' + before.contract.internalLinks.length + ' → ' + page.contract.internalLinks.length
      + ', body text by those twelve labels only, and the HTML is the predecessor\'s byte for byte without the eleven <li> entries and with the old label. Title, H1, description, canonical, robots, googlebot, hreflang, JSON-LD and <head> of / are unchanged. No other homepage entry is added, dropped, renamed or moved.',
    change: {
      internalLinksAdded: added,
      bodyTextAdded: NEW.map((n) => n.label),
      bodyTextReplaced: { url: RETARGET.url, from: RETARGET_OLD_LABEL, to: retargetNewLabel },
    },
    htmlSha256: `${before.htmlSha256} → ${page.htmlSha256}`,
  });
}
if (Object.keys(chatHashes).length !== CHATS.length) fail('both chats must be checked');

const revision = {
  schema: 1,
  capturedAt: new Date().toISOString(),
  source: 'Locally generated production candidate (npm run build:fast of the AI-tools wave A tree, base af0446fe = the tool-page platform on production 62d8fdb0 plus its research docs) after source review; actual live verification recorded separately after release',
  previousRevision,
  previousRevisionSha256: sha(previousRaw),
  reviewedChanges: changes,
  invisibleToGate: [
    {
      change: `The two chats keep their contract and body text; their HTML differs from the predecessor by one asset name, the chat bundle ${CHAT_BUNDLE_BEFORE} → ${chatBundleAfter}, which changed with the tool-page platform commit af0446fe (role presets, page chips, the calculator and irregular-verbs widgets; the chat start bundle stays inside its 110 000 B budget). The generator puts the old name back and requires the predecessor's htmlSha256. The chats carry no tool field, no chips, no chip styles and no lazy tool part (tests/tool-pages.test.ts).`,
      pages: CHATS,
      htmlSha256: chatHashes,
    },
    { change: 'The seven protected articles are byte-identical to the predecessor (the wave-1b build); the generator refuses otherwise. The shared stylesheet keeps its name (/assets/index-B7Z1XlOc.css) on every page.' },
    { change: 'public/llms.txt gains one line per new tool in the chat-product list, two lines for the agency price table on /uz/boss-digital/#narxlar and /boss-digital/#ceny, and seven intent lines (tools, ad copy, Uzum guides); llms-full.txt, built as its superset, follows. Sitewide files, not part of any page contract.' },
    { change: 'sitemap.xml, sitemap-updates.xml, /updates/atom.xml, both blog indexes and feeds list the eleven new URLs (sitemap 305 → 316 entries); the sitemap lastmod of / stays 2026-10-25 (already so in the predecessor build) and the other nine protected URLs keep theirs; nine changed unprotected pages move to 2026-10-25.' },
    { change: 'Outside the protected set: nine new gpt-chat tool pages (chatRole, chatStarters, widgets), two Uzum guides, the retargeted /uz/gpt-telegram-instagram-ideya/, an ad-copy section on /ru/gpt-v-marketinge-smm/, a do-it-yourself and «Targetolog xizmati narxi» section on /uz/instagram-target-yoqish/, a step-by-step section on /ru/blog/telegram-ads-stoimost-i-zapusk-uzbekistan/, price tables on both Boss Digital pages, the /uz/sayt-yaratish/ package table aligned with its title, Uzbek copy of the calculator widget, contextual links to the new pages from nine unprotected pages, and the anchor «калькулятор» → «калькулятор стоимости бота» on /ru/razrabotka-telegram-bota-tashkent/ (pair C60). None of these pages is protected.' },
  ],
  measurement: 'Wave A changes no search-facing field of a protected page except the homepage\'s lists (eleven links, one renamed label). The chats\' 28-day window that opened with the 2026-10-24-chat-snippets revision keeps its baseline and dates: their visible HTML is unchanged and only the script name differs. The download guide stays byte for byte for its P-CTR read (≈06–10.11). The new tool pages are fenced from the chat\'s queries (pairs C53, C54, C57–C59, C61, C62, C65), so impressions of the chat families on /uz/gpt-uzbek-tilida/ and /ru/gpt-chat/ should stay with the chats; if a tool page shows up for a chat query in Search Console, record it as a confound of the chat window. Read each new page like C41: at least 100 Uzbekistan impressions within 21 days of a recrawl confirmed with URL Inspection; read the New Year and 8 March greeting terms in December–March; look at the calculator SERP from Uzbekistan once before reading it (a Google calculator box was not checked). No ranking or traffic guarantee.',
  pages: pages.map(({ pathname, contract, bodyText, htmlSha256 }) => ({ pathname, contract, bodyText, htmlSha256 })),
};

console.log(JSON.stringify({ reviewedChanges: changes.map(({ pathname, fields, change }) => ({ pathname, fields, change })), chats: chatHashes, chatBundle: `${CHAT_BUNDLE_BEFORE} → ${chatBundleAfter}` }, null, 2));
if (process.env.DRY) {
  console.log('DRY: every check passed; nothing written.');
} else {
  if (fs.existsSync(target)) fail('Revision already exists; write a new revision instead of replacing reviewed evidence.');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(revision, null, 2) + '\n', { flag: 'wx' });
  console.log(`Wrote ${path.relative(root, target)}`);
}
