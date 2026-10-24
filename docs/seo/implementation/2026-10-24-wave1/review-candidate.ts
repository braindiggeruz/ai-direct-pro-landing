import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seoContract, PROTECTED_PATHS } from '../../../../scripts/seo-protection';

// Builds the 2026-10-24-wave1 revision from the local production candidate in
// dist/ (npm run build:fast of the wave-1 tree). Wave 1 of the growth backlog
// (docs/seo/research/2026-10-24-growth-audit/BACKLOG.md §4) edits no protected
// content file. The owner's order of 24.10 also publishes the RU↔UZ translator
// pages, and the homepage shell (scripts/prerender-home.ts) lists every
// published money page by its H1, so exactly one protected page may change:
// "/", by two list entries. The script refuses to write if anything else moved:
//  - "/": internalLinks gains exactly the two translator URLs and loses none;
//    the body text differs by exactly their two H1 labels; and the HTML equals
//    the predecessor's byte for byte once the two <li> entries are removed.
//  - both chats: contract and body text unchanged; the HTML equals the
//    predecessor's byte for byte once the chat bundle's old name is put back.
//    The bundle changed with the translator merge 1a773ee2 (src/gpt-chat/main.tsx,
//    components/AiChatConsole.tsx, types.ts learned chatRole), not in wave 1.
//  - the seven protected articles: HTML byte-identical to the predecessor
//    (htmlSha256 of the d54d5b61 production build).
// DRY=1 runs every check and prints the result without writing.
const root = process.cwd();
const previousRevision = 'docs/seo/evidence/2026-10-24-chat-snippets/reviewed-protected-pages.json';
const target = path.join(root, 'docs/seo/evidence/2026-10-24-wave1/reviewed-protected-pages.json');
const previousRaw = fs.readFileSync(path.join(root, previousRevision), 'utf8').replace(/\r\n/g, '\n');
const previous = JSON.parse(previousRaw) as {
  pages: Array<{ pathname: string; contract: ReturnType<typeof seoContract>; bodyText: string; htmlSha256: string }>;
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const fail = (message: string): never => { throw new Error(message); };

// The chat bundle of the d54d5b61 production build, which the predecessor's htmlSha256 hashes.
const PREVIOUS_CHAT_BUNDLE = '/assets/gpt-chat-DXmrgoYc.js';
const CHATS = ['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/'];
const TRANSLATORS = [
  { url: '/ru/russko-uzbekskiy-perevodchik/', file: 'content/pages/ru/russko-uzbekskiy-perevodchik.json', list: 'moneyRu' },
  { url: '/uz/rus-ozbek-tarjimon/', file: 'content/pages/uz/rus-ozbek-tarjimon.json', list: 'moneyUz' },
].map((t) => {
  const page = JSON.parse(fs.readFileSync(path.join(root, t.file), 'utf8')) as { status: string; url: string; h1: string };
  if (page.status !== 'published' || page.url !== t.url) fail(`${t.file}: not the published ${t.url}`);
  // prerender-home.ts escapes & and < only; the contract keeps entities as they are.
  return { ...t, label: page.h1.replace(/[&<]/g, (c) => ({ '&': '&amp;', '<': '&lt;' }[c] as string)).replace(/\s+/g, ' ').trim() };
});
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

const pages = PROTECTED_PATHS.map((pathname) => {
  const html = fs.readFileSync(path.join(root, 'dist', pathname.slice(1), 'index.html'), 'utf8');
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const bodyText = (clean.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return { pathname, contract: seoContract(html), bodyText, htmlSha256: sha(html), html };
});

const expected: Record<string, string[]> = { '/': ['bodyTextSha256', 'internalLinks'] };
const htmlChanges: Record<string, string> = {};
let chatBundle = '';
const changes = [];
for (const page of pages) {
  const before = previous.pages.find((p) => p.pathname === page.pathname) ?? fail(`${page.pathname}: not in ${previousRevision}`);
  const fields = (Object.keys(page.contract) as Array<keyof typeof page.contract>)
    .filter((k) => JSON.stringify(page.contract[k]) !== JSON.stringify(before.contract[k]))
    .sort();
  const want = expected[page.pathname] ?? [];
  if (JSON.stringify(fields) !== JSON.stringify(want)) fail(`${page.pathname}: changed ${JSON.stringify(fields)}, reviewed ${JSON.stringify(want)}`);

  if (page.pathname === '/') {
    const added = page.contract.internalLinks.filter((l) => !before.contract.internalLinks.includes(l));
    const dropped = before.contract.internalLinks.filter((l) => !page.contract.internalLinks.includes(l));
    if (JSON.stringify(added) !== JSON.stringify(TRANSLATORS.map((t) => t.url).sort()) || dropped.length) {
      fail(`/: links added ${JSON.stringify(added)}, dropped ${JSON.stringify(dropped)}`);
    }
    let text = page.bodyText;
    let html = page.html;
    for (const t of TRANSLATORS) {
      if (text.split(`${t.label} `).length !== 2) fail(`/: the label «${t.label}» is not in the body text exactly once`);
      text = text.replace(`${t.label} `, '');
      const item = new RegExp(`<li><a href="${escapeRe(t.url)}"(?: hreflang="uz")?>${escapeRe(t.label)}</a></li>`, 'g');
      if ((html.match(item) || []).length !== 1) fail(`/: no single <li> for ${t.url}`);
      html = html.replace(item, '');
    }
    if (text !== before.bodyText) fail('/: the body text differs by more than the two translator labels');
    if (sha(html) !== before.htmlSha256) fail('/: the HTML differs by more than the two translator <li> entries');
    changes.push({
      pathname: '/',
      fields,
      reason: 'Owner order of 2026-10-24 (growth backlog release, wave 1): the RU↔UZ translator pages are published (intent manifest A8, pairs C47 and C48). The homepage crawler shell (scripts/prerender-home.ts) lists every published money page by its H1, so the Russian money list gains «'
        + TRANSLATORS[0].label + '» (' + TRANSLATORS[0].url + ') and the Uzbek money list «' + TRANSLATORS[1].label + '» (' + TRANSLATORS[1].url
        + '), each in its alphabetical place by URL. That is the whole change: internalLinks ' + before.contract.internalLinks.length + ' → ' + page.contract.internalLinks.length
        + ', body text by those two labels only, and the HTML is the predecessor\'s byte for byte without the two <li> entries. Title, H1, description, canonical, robots, googlebot, hreflang, JSON-LD and <head> of / are unchanged. No other homepage entry is added, dropped, renamed or moved: the new title of /uz/suniy-intellekt/ (W1-02) does not reach /, which lists money pages by H1, and its H1 is unchanged.',
      change: { internalLinksAdded: added, bodyTextAdded: TRANSLATORS.map((t) => t.label) },
      htmlSha256: `${before.htmlSha256} → ${page.htmlSha256}`,
    });
  } else if (CHATS.includes(page.pathname)) {
    if (page.bodyText !== before.bodyText) fail(`${page.pathname}: body text changed`);
    const bundles = [...new Set(page.html.match(/\/assets\/gpt-chat-[\w-]+\.js/g) || [])];
    if (bundles.length !== 1) fail(`${page.pathname}: expected one chat bundle, found ${JSON.stringify(bundles)}`);
    if (chatBundle && chatBundle !== bundles[0]) fail('the two chats reference different bundles');
    chatBundle = bundles[0];
    if (page.htmlSha256 !== before.htmlSha256 && sha(page.html.split(chatBundle).join(PREVIOUS_CHAT_BUNDLE)) !== before.htmlSha256) {
      fail(`${page.pathname}: the HTML differs by more than the chat bundle's name`);
    }
    if (page.htmlSha256 !== before.htmlSha256) htmlChanges[page.pathname] = `${before.htmlSha256} → ${page.htmlSha256}`;
  } else if (page.htmlSha256 !== before.htmlSha256) {
    fail(`${page.pathname}: HTML changed; the protected articles must be byte-identical to the predecessor`);
  }
}

const revision = {
  schema: 1,
  capturedAt: new Date().toISOString(),
  source: 'Locally generated production candidate (npm run build:fast of the wave-1 tree, base 1a773ee2) after source review; actual live verification recorded separately after release',
  previousRevision,
  previousRevisionSha256: sha(previousRaw),
  reviewedChanges: changes,
  invisibleToGate: [
    {
      change: `Both chats: the chat bundle's name changes (${PREVIOUS_CHAT_BUNDLE} → ${chatBundle}) and nothing else in their HTML. The bundle changed with the translator merge 1a773ee2, which taught the chat the translator role (src/gpt-chat/main.tsx, components/AiChatConsole.tsx, types.ts); the two main chats render no role, converter or converter script (tests/translator-pages.test.ts). The generator checks that putting the old name back gives the predecessor's htmlSha256.`,
      pages: CHATS,
      htmlSha256: htmlChanges,
    },
    { change: 'The seven protected articles are byte-identical to the predecessor (the d54d5b61 production build); the generator refuses otherwise.' },
    { change: 'BreadcrumbList JSON-LD gains a top-level name (the last crumb) on every page outside PROTECTED_PATHS (W1-14, scripts/jsonld-helpers.ts). The protected pages are excluded on purpose and keep the nameless list they were reviewed with (download guide P-CTR read ≈06–10.11, the chats\' 28-day window from 24.10); / has no BreadcrumbList. /uz/ drops its self-referential BreadcrumbList (content/pages/uz/hub.json). Drop the exclusion only in a later reviewed revision.' },
    { change: 'robots.txt gains one inter-sectional Yandex line, «Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid&fbclid&ysclid» (W1-12, src/shared/robots-policy.ts); no User-agent: Yandex group. Google and Bing ignore it.' },
    { change: '_headers: /llms.txt, /llms-full.txt and /*.md detach the inherited Cache-Control with «! Cache-Control» before their own (W1-13, scripts/generate-robots.ts); public/404.html (noindex) gets the «| GPTBot.uz» title suffix. Sitewide files, not part of any page contract.' },
    { change: 'sitemap.xml, sitemap-updates.xml, /updates/atom.xml, llms.txt and llms-full.txt list the two published translator pages (hreflang pair, x-default the Uzbek member) and the wave-1 dates. Among the protected URLs only the sitemap lastmod of / moves (2026-10-23 → 2026-10-24, because its list changed); the other nine keep theirs (checked against the live sitemap of d54d5b61).' },
  ],
  measurement: 'Wave 1 changes no search-facing field of a protected page except the homepage\'s list (two links). The chats\' 28-day window that opened with the 2026-10-24-chat-snippets revision keeps its baseline and dates: their title, description, H1, body text and links are unchanged, and their HTML differs only by the bundle name. The download guide stays byte for byte for its P-CTR read (≈06–10.11). The two new translator URLs are fenced from the chats\' queries (pairs C47, C48), so impressions of «chatgpt tarjima/tarjimon» on /uz/gpt-uzbek-tilida/ and of «ии чат / чат гпт онлайн» on /ru/gpt-chat/ should stay with the chats; if a translator URL shows up for a chat query in Search Console, record it as a confound of the chat window. Wave-1 items are read in equal 28-day windows from a recrawl confirmed with URL Inspection, Uzbekistan and other countries apart (BACKLOG.md §10.6). No ranking or traffic guarantee.',
  pages: pages.map(({ pathname, contract, bodyText, htmlSha256 }) => ({ pathname, contract, bodyText, htmlSha256 })),
};

console.log(JSON.stringify({ reviewedChanges: changes.map(({ pathname, fields, change }) => ({ pathname, fields, change })), chatBundle, htmlChanges }, null, 2));
if (process.env.DRY) {
  console.log('DRY: every check passed; nothing written.');
} else {
  if (fs.existsSync(target)) fail('Revision already exists; write a new revision instead of replacing reviewed evidence.');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(revision, null, 2) + '\n', { flag: 'wx' });
  console.log(`Wrote ${path.relative(root, target)}`);
}
