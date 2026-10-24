import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seoContract, PROTECTED_PATHS } from '../../../../scripts/seo-protection';

// Builds the 2026-10-24-wave1b revision from the local production candidate in
// dist/ (npm run build:fast of the wave-1b tree, base 13d2da1f = production
// f97295b5 plus its release record). Wave 1b of the growth backlog
// (docs/seo/research/2026-10-24-growth-audit/backlog.json W2-03…W2-07) edits no
// protected content file. The owner's order of 24.10 publishes it now instead
// of after ≈07.11. The homepage shell (scripts/prerender-home.ts) lists every
// published money page by its H1 and every published article by its title, so
// exactly one protected page may change: "/", by four list entries. The script
// refuses to write if anything else moved:
//  - "/": internalLinks gains exactly the three new guide URLs and loses none;
//    the body text differs by exactly their three titles and the new H1 of
//    /uz/telegram-bot-biznes-uchun/ (W2-06) in place of the old one; and the
//    HTML equals the predecessor's byte for byte once the three <li> entries
//    are removed and the hub's old label is put back.
//  - the other nine protected pages, both chats included: HTML byte-identical
//    to the predecessor (htmlSha256 of the wave-1 build, production f97295b5).
// DRY=1 runs every check and prints the result without writing.
const root = process.cwd();
const previousRevision = 'docs/seo/evidence/2026-10-24-wave1/reviewed-protected-pages.json';
const target = path.join(root, 'docs/seo/evidence/2026-10-24-wave1b/reviewed-protected-pages.json');
const previousRaw = fs.readFileSync(path.join(root, previousRevision), 'utf8').replace(/\r\n/g, '\n');
const previous = JSON.parse(previousRaw) as {
  pages: Array<{ pathname: string; contract: ReturnType<typeof seoContract>; bodyText: string; htmlSha256: string }>;
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const fail = (message: string): never => { throw new Error(message); };
// prerender-home.ts escapes & and < only; the contract keeps entities as they are.
const label = (s: string) => s.replace(/[&<]/g, (c) => ({ '&': '&amp;', '<': '&lt;' }[c] as string)).replace(/\s+/g, ' ').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const readDoc = (file: string, url: string) => {
  const doc = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as { status: string; url: string; h1: string; title: string };
  if (doc.status !== 'published' || doc.url !== url) fail(`${file}: not the published ${url}`);
  return doc;
};

// The three new Uzbek guides: the shell lists articles by title (blogUz, newest first).
const GUIDES = [
  { url: '/uz/blog/tavsifnoma-namuna/', file: 'content/blog/uz/tavsifnoma-namuna.json', backlog: 'W2-03', pair: 'C49' },
  { url: '/uz/blog/rasmiy-xat-yozish/', file: 'content/blog/uz/rasmiy-xat-yozish.json', backlog: 'W2-04', pair: 'C50, C52' },
  { url: '/uz/blog/tabrik-yozish/', file: 'content/blog/uz/tabrik-yozish.json', backlog: 'W2-05', pair: 'C51' },
].map((g) => ({ ...g, label: label(readDoc(g.file, g.url).title) }));
// The UZ Telegram hub: the shell lists money pages by H1 (moneyUz); its href is already on "/".
const HUB = { url: '/uz/telegram-bot-biznes-uchun/', file: 'content/pages/uz/telegram-bot-biznes-uchun.json' };
const HUB_OLD_LABEL = 'Telegram bot biznes uchun: savdoni avtomatlashtirish';
const hubNewLabel = label(readDoc(HUB.file, HUB.url).h1);
if (hubNewLabel === HUB_OLD_LABEL) fail(`${HUB.file}: the H1 did not change`);

const pages = PROTECTED_PATHS.map((pathname) => {
  const html = fs.readFileSync(path.join(root, 'dist', pathname.slice(1), 'index.html'), 'utf8');
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const bodyText = (clean.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return { pathname, contract: seoContract(html), bodyText, htmlSha256: sha(html), html };
});

const expected: Record<string, string[]> = { '/': ['bodyTextSha256', 'internalLinks'] };
const changes = [];
for (const page of pages) {
  const before = previous.pages.find((p) => p.pathname === page.pathname) ?? fail(`${page.pathname}: not in ${previousRevision}`);
  const fields = (Object.keys(page.contract) as Array<keyof typeof page.contract>)
    .filter((k) => JSON.stringify(page.contract[k]) !== JSON.stringify(before.contract[k]))
    .sort();
  const want = expected[page.pathname] ?? [];
  if (JSON.stringify(fields) !== JSON.stringify(want)) fail(`${page.pathname}: changed ${JSON.stringify(fields)}, reviewed ${JSON.stringify(want)}`);

  if (page.pathname !== '/') {
    if (page.htmlSha256 !== before.htmlSha256) fail(`${page.pathname}: HTML changed; the nine other protected pages must be byte-identical to the predecessor`);
    continue;
  }

  const added = page.contract.internalLinks.filter((l) => !before.contract.internalLinks.includes(l));
  const dropped = before.contract.internalLinks.filter((l) => !page.contract.internalLinks.includes(l));
  if (JSON.stringify(added) !== JSON.stringify(GUIDES.map((g) => g.url).sort()) || dropped.length) {
    fail(`/: links added ${JSON.stringify(added)}, dropped ${JSON.stringify(dropped)}`);
  }
  if (!page.contract.internalLinks.includes(HUB.url)) fail(`/: no longer links ${HUB.url}`);

  let text = page.bodyText;
  let html = page.html;
  for (const g of GUIDES) {
    if (text.split(`${g.label} `).length !== 2) fail(`/: the title «${g.label}» is not in the body text exactly once`);
    text = text.replace(`${g.label} `, '');
    const item = new RegExp(`<li><a href="${escapeRe(g.url)}" hreflang="uz">${escapeRe(g.label)}</a></li>`, 'g');
    if ((html.match(item) || []).length !== 1) fail(`/: no single <li> for ${g.url}`);
    html = html.replace(item, '');
  }
  if (text.split(hubNewLabel).length !== 2) fail(`/: the new hub label «${hubNewLabel}» is not in the body text exactly once`);
  if (before.bodyText.split(HUB_OLD_LABEL).length !== 2) fail(`/: the old hub label is not in the predecessor's body text exactly once`);
  text = text.replace(hubNewLabel, HUB_OLD_LABEL);
  const hubItem = `<li><a href="${HUB.url}" hreflang="uz">${hubNewLabel}</a></li>`;
  if (html.split(hubItem).length !== 2) fail(`/: no single <li> for ${HUB.url} with its new label`);
  html = html.replace(hubItem, `<li><a href="${HUB.url}" hreflang="uz">${HUB_OLD_LABEL}</a></li>`);
  if (text !== before.bodyText) fail('/: the body text differs by more than the three guide titles and the hub label');
  if (sha(html) !== before.htmlSha256) fail('/: the HTML differs by more than the three guide <li> entries and the hub label');

  changes.push({
    pathname: '/',
    fields,
    reason: 'Owner order of 2026-10-24 (growth backlog, wave 1b, published now instead of after ≈07.11): three new Uzbek guides are published — '
      + GUIDES.map((g) => `«${g.label}» (${g.url}, ${g.backlog}, intent-manifest ${g.pair})`).join(', ')
      + ' — and the Uzbek Telegram hub ' + HUB.url + ' gets the H1 «' + hubNewLabel + '» instead of «' + HUB_OLD_LABEL + '» (W2-06; its title, description, keywords and prices are unchanged). '
      + 'The homepage crawler shell (scripts/prerender-home.ts) lists every published article by its title, newest first, and every published money page by its H1, so the Uzbek blog list gains the three titles at its top and the Uzbek money list shows the hub\'s new H1 under the same href. '
      + 'That is the whole change: internalLinks ' + before.contract.internalLinks.length + ' → ' + page.contract.internalLinks.length
      + ', body text by those four labels only, and the HTML is the predecessor\'s byte for byte without the three <li> entries and with the hub\'s old label. Title, H1, description, canonical, robots, googlebot, hreflang, JSON-LD and <head> of / are unchanged. No other homepage entry is added, dropped, renamed or moved.',
    change: {
      internalLinksAdded: added,
      bodyTextAdded: GUIDES.map((g) => g.label),
      bodyTextReplaced: { url: HUB.url, from: HUB_OLD_LABEL, to: hubNewLabel },
    },
    htmlSha256: `${before.htmlSha256} → ${page.htmlSha256}`,
  });
}

const revision = {
  schema: 1,
  capturedAt: new Date().toISOString(),
  source: 'Locally generated production candidate (npm run build:fast of the wave-1b tree, base 13d2da1f = production f97295b5 plus its release record) after source review; actual live verification recorded separately after release',
  previousRevision,
  previousRevisionSha256: sha(previousRaw),
  reviewedChanges: changes,
  invisibleToGate: [
    { change: 'The nine other protected pages, both chats included, are byte-identical to the predecessor (the wave-1 build, production f97295b5); the generator refuses otherwise. The shared stylesheet keeps its name (/assets/index-B7Z1XlOc.css) on every page: the first candidate build changed it because Tailwind scans scripts/**, and a new identifier in scripts/generate-llm-markdown.ts made it emit one extra utility; the identifier was renamed before this revision was written.' },
    { change: 'llms-full.txt is built as a superset of llms.txt (W2-07, scripts/generate-llm-markdown.ts): the cluster notes of public/llms-full.txt (three sections that llms.txt already carries in full removed), then llms.txt word for word, then an index and the full Markdown of the 28 twins. public/llms.txt gains three intent lines for the new guides. Sitewide files, not part of any page contract.' },
    { change: 'The Markdown twin of the protected article /uz/blog/ai-chat-nima-va-qanday-turlari-bor/ (index.html.md, noindex, text/markdown) no longer links the unpublished /uz/blog/ai-bot-stsenariysini-1-kunda-qanday-yozish/ (404 on the live site): twins now drop links to unpublished articles, as the HTML pages already did. The article\'s HTML is byte-identical.' },
    { change: 'sitemap.xml, sitemap-updates.xml, /updates/atom.xml, the Uzbek blog index and feed list the three new guides (2026-10-24) and the hub\'s new date (2026-10-25). Among the protected URLs only the sitemap lastmod of / moves (2026-10-24 → 2026-10-25, because its list changed); the other nine keep theirs (checked against the live sitemap of f97295b5).' },
    { change: 'Outside the protected set: /uz/telegram-bot-biznes-uchun/ (W2-06) gets the new H1 and heroTitle, a section «O‘zingiz yaratasizmi yoki buyurtma qilasizmi: BotFather, konstruktor yoki dasturchi» with a three-row table and a link to /ru/blog/kak-sozdat-telegram-bota/, and two FAQ; /uz/blog/tushuntirish-xati-va-ariza-yozish/ gains one paragraph linking /uz/blog/rasmiy-xat-yozish/ (anchor «rasmiy xat yozish»). Neither page is protected.' },
  ],
  measurement: 'Wave 1b changes no search-facing field of a protected page except the homepage\'s list (three links, one renamed label). The chats\' 28-day window that opened with the 2026-10-24-chat-snippets revision keeps its baseline and dates: both chats are byte-identical. The download guide stays byte for byte for its P-CTR read (≈06–10.11). The three new guides are fenced from the chat\'s queries (pairs C49–C51) and from each other and the explanatory-letter guide (C52), so impressions of the chat family on /uz/gpt-uzbek-tilida/ should stay with the chat; if a new guide shows up for a chat query in Search Console, record it as a confound of the chat window. Read the guides like C41: at least 100 Uzbekistan impressions within 21 days of a recrawl confirmed with URL Inspection; read «yangi yil tabriklari» in December–January. No ranking or traffic guarantee.',
  pages: pages.map(({ pathname, contract, bodyText, htmlSha256 }) => ({ pathname, contract, bodyText, htmlSha256 })),
};

console.log(JSON.stringify({ reviewedChanges: changes.map(({ pathname, fields, change }) => ({ pathname, fields, change })) }, null, 2));
if (process.env.DRY) {
  console.log('DRY: every check passed; nothing written.');
} else {
  if (fs.existsSync(target)) fail('Revision already exists; write a new revision instead of replacing reviewed evidence.');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(revision, null, 2) + '\n', { flag: 'wx' });
  console.log(`Wrote ${path.relative(root, target)}`);
}
