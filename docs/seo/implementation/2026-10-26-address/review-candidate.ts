import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seoContract, PROTECTED_PATHS } from '../../../../scripts/seo-protection';

// Builds the 2026-10-26-address revision from the local production candidate in
// dist/ (npm run build:production of d7dd4588: TOP-3 step A 812646bc, step B
// cd83c654, review fixes 329294e9 and 6b8a273e, journal d7dd4588 on 00cf97bc =
// production 4b219a0c plus docs).
//
// Owner, chat 26.10.2026, with the order «сделай грамотный фикс всего, что может
// улучшить SEO на сайте согласно роадмапу; действуй полностью автономно и сразу
// деплой»: «Адрес студии. В карточке Google указано «Kichik Xalqa Yo‘li 57».
// The release reads it as the answer to roadmap ROADMAP_TOP3.md §9 item 1 (the
// real studio address is the one in the Google Business card), and step B
// (cd83c654) moves content/global/site.json address, streetAddress and geo to
// that card. On the ten protected pages only the address may change, so the
// script lists every HTML swap it accepts (SWAPS), puts each one back, puts the
// homepage's renamed SPA entry back (src/components/Footer.tsx carries the
// office line), and refuses to write unless the result is the predecessor's
// HTML byte for byte. What it accepts, on all ten:
//  - the footer NAP line: «Yahyo Gulyamov ko‘chasi 35» → «Kichik Xalqa Yo‘li 57»
//    (city, country and hours unchanged);
//  - the Organization #org JSON-LD: PostalAddress streetAddress and geo
//    (41.334 / 69.286 → 41.3364 / 69.2723); name, contactPoint, hours, sameAs
//    unchanged;
//  - on / also the SPA entry name.
// The landing footers' new «Разработка сайтов / Sayt yaratish» link and their
// «Услуги: / Xizmatlar:» label are not on any protected page (the articles,
// the chats and the homepage shell have footers of their own), and the script
// fails if one of them shows up there. Every contract field except
// bodyTextSha256 must stay; the body text change is recorded as text
// replacements that, replayed on the new body text, give the predecessor's body
// text exactly (tests/seo-protection.test.ts replays them).
//
// PREDECESSOR_DIST (required to write) is a build of 4b219a0c (build:fast, the
// admin build and build:studio). Its ten protected pages must hash to the
// predecessor revision; the script then compares every page of the site and
// classifies what changes: main content (TOP-3 steps A/B), address or footer
// only, markup only (JSON-LD address), byte-identical.
// DRY=1 runs every check and prints the result without writing.
const root = process.cwd();
const previousRevision = 'docs/seo/evidence/2026-10-26-contact/reviewed-protected-pages.json';
const target = path.join(root, 'docs/seo/evidence/2026-10-26-address/reviewed-protected-pages.json');
const previousRaw = fs.readFileSync(path.join(root, previousRevision), 'utf8').replace(/\r\n/g, '\n');
const previous = JSON.parse(previousRaw) as {
  pages: Array<{ pathname: string; contract: ReturnType<typeof seoContract>; bodyText: string; htmlSha256: string }>;
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const fail = (message: string): never => { throw new Error(message); };
const bodyTextOf = (html: string) => (html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const OLD_STREET = 'Yahyo Gulyamov ko‘chasi 35';
const NEW_STREET = 'Kichik Xalqa Yo‘li 57';
const STYLESHEET = '/assets/index-B7Z1XlOc.css';
const CHAT_BUNDLE = '/assets/gpt-chat-Cqn8gEiy.js';
const HOME_ENTRY_BEFORE = '/assets/index-DdGlzARk.js';
const CHATS = ['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/'];

type Swap = { surface: string; before: string; after: string };
const JSONLD_STREET: Swap = {
  surface: 'Organization #org JSON-LD: PostalAddress streetAddress',
  before: `"streetAddress":"${OLD_STREET}",`,
  after: `"streetAddress":"${NEW_STREET}",`,
};
const JSONLD_GEO: Swap = {
  surface: 'Organization #org JSON-LD: geo',
  before: '"latitude":41.334,"longitude":69.286}',
  after: '"latitude":41.3364,"longitude":69.2723}',
};
const FOOTER: Swap = {
  surface: 'footer NAP line',
  before: `GPTBot.uz · ${OLD_STREET}, Toshkent, Uzbekistan · `,
  after: `GPTBot.uz · ${NEW_STREET}, Toshkent, Uzbekistan · `,
};
const SWAPS: Array<[Swap, number]> = [[JSONLD_STREET, 1], [JSONLD_GEO, 1], [FOOTER, 1]];

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

let homeEntryAfter = '';
const reviewedChanges = [];
for (const page of pages) {
  const before = previous.pages.find((p) => p.pathname === page.pathname) ?? fail(`${page.pathname}: not in ${previousRevision}`);
  const fields = (Object.keys(page.contract) as Array<keyof typeof page.contract>)
    .filter((k) => JSON.stringify(page.contract[k]) !== JSON.stringify(before.contract[k]));
  if (JSON.stringify(fields) !== JSON.stringify(['bodyTextSha256'])) fail(`${page.pathname}: changed ${JSON.stringify(fields)}; this revision reviews body text only`);
  if (!page.html.includes(`href="${STYLESHEET}"`)) fail(`${page.pathname}: the shared stylesheet is not ${STYLESHEET}`);
  if (page.html.includes('Gulyamov')) fail(`${page.pathname}: the old street is still in the HTML`);
  if (/Разработка сайтов<\/a>|Sayt yaratish<\/a>|aria-label="(Услуги студии|Studiya xizmatlari)"/.test(page.html)) {
    fail(`${page.pathname}: the landing footer's services nav reached a protected page`);
  }

  // Put every reviewed swap back, one occurrence at a time, and record the text it moves.
  let html = page.html;
  const body: Array<{ surface: string; before: string; after: string }> = [];
  for (const [swap, count] of SWAPS) {
    const found = html.split(swap.after).length - 1;
    if (found !== count) fail(`${page.pathname}: «${swap.surface}» expected ${count}×, found ${found}×`);
    for (let i = 0; i < count; i++) {
      const textBefore = bodyTextOf(html);
      html = html.replace(swap.after, () => swap.before);
      const textAfter = bodyTextOf(html);
      if (textBefore !== textAfter) body.push({ surface: swap.surface, ...textStep(textBefore, textAfter) });
    }
  }
  if (html.includes(NEW_STREET)) fail(`${page.pathname}: an address occurrence is not covered by a reviewed swap`);

  // The chats keep the chat bundle; the homepage's SPA entry moves (Footer.tsx).
  if (CHATS.includes(page.pathname) && !html.includes(`src="${CHAT_BUNDLE}"`)) fail(`${page.pathname}: the chat bundle moved`);
  if (page.pathname === '/') {
    const refs = [...new Set(html.match(/\/assets\/index-[\w-]+\.js/g) || [])];
    if (refs.length !== 1) fail(`/: expected one SPA entry reference, found ${JSON.stringify(refs)}`);
    if (refs[0] === HOME_ENTRY_BEFORE) fail('/: the SPA entry was expected to move with src/components/Footer.tsx');
    homeEntryAfter = refs[0];
    html = html.split(refs[0]).join(HOME_ENTRY_BEFORE);
  }
  if (sha(html) !== before.htmlSha256) fail(`${page.pathname}: the HTML differs from the predecessor by more than the reviewed address swaps`);

  // Replaying the recorded text steps on the new body text gives the old one.
  let replay = page.bodyText;
  for (const step of body) {
    if (replay.split(step.after).length !== 2) fail(`${page.pathname}: text step is not unique: ${step.after}`);
    replay = replay.replace(step.after, () => step.before);
  }
  if (replay !== before.bodyText) fail(`${page.pathname}: the recorded text steps do not reproduce the predecessor's body text`);
  if (body.length !== 1 || body[0].surface !== FOOTER.surface) fail(`${page.pathname}: expected exactly one text step, in the footer`);

  reviewedChanges.push({
    pathname: page.pathname,
    fields: ['bodyTextSha256'],
    reason: 'Owner, chat 26.10.2026, with the order to fix everything the TOP-3 roadmap allows and deploy: «Адрес студии. В карточке Google указано «Kichik Xalqa Yo‘li 57»», read as the answer to ROADMAP_TOP3.md §9 item 1: the real studio address is the one in the Google Business card. content/global/site.json moves address, streetAddress and geo to it (step B, cd83c654). On a protected page only the address changes: the footer NAP line and the Organization PostalAddress / geo.',
    change: {
      title: 'unchanged', h1: 'unchanged', description: 'unchanged', robots: 'unchanged', canonical: 'unchanged', hreflang: 'unchanged',
      internalLinks: 'unchanged', dates: 'unchanged (dateModified, datePublished and <time> as before)',
      body,
      bodyTextSha256: `${before.contract.bodyTextSha256} → ${page.contract.bodyTextSha256}`,
      bodyTextLength: `${before.bodyText.length} → ${page.bodyText.length}`,
    },
    nonContract: {
      jsonLd: `Organization #org: address.streetAddress «${OLD_STREET}» → «${NEW_STREET}», geo 41.334 / 69.286 → 41.3364 / 69.2723 (the Google Business card's point, rounded); name, addressLocality, addressCountry, contactPoint, openingHoursSpecification and sameAs unchanged.`,
      ...(page.pathname === '/' ? { asset: `SPA entry ${HOME_ENTRY_BEFORE} → ${homeEntryAfter} (src/components/Footer.tsx office line; the generator puts the old name back)` } : {}),
    },
    htmlSha256: `${before.htmlSha256} → ${page.htmlSha256}`,
  });
}

// The whole site against the predecessor build.
const predecessorDist = process.env.PREDECESSOR_DIST;
type Unprotected = {
  mainContent: string[]; addressOrFooterOnly: string[]; markupOnly: string[]; byteIdentical: string[];
  datesMoved: string[]; internalLinks: Record<string, { added: string[]; removed: string[] }>;
};
let unprotected: Unprotected | null = null;
const sitewide: { identical: string[]; changed: Record<string, string> } = { identical: [], changed: {} };
// The TOP-3 step A/B pages whose main content gained a new section (their own
// updatedAt / dateModified moved to 2026-10-26) and the blog index that lists one.
const DATED = ['/ru/blog/', '/ru/blog/chto-takoe-smm-prodvizhenie/', '/ru/luchshie-razrabotchiki-chat-botov-tashkent/',
  '/ru/razrabotka-saytov-tashkent/', '/ru/targetirovannaya-reklama-tashkent/'];
if (predecessorDist) {
  for (const p of previous.pages) {
    const raw = fs.readFileSync(path.join(predecessorDist, p.pathname.slice(1), 'index.html'), 'utf8');
    if (sha(raw) !== p.htmlSha256) fail(`PREDECESSOR_DIST is not the predecessor build: ${p.pathname} does not hash to ${previousRevision}`);
  }
  const walk = (dir: string, out: string[] = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out); else if (e.name === 'index.html') out.push(p);
    }
    return out;
  };
  const dates = (html: string) => [
    ...html.matchAll(/"(?:dateModified|datePublished|lastReviewed)":"[^"]*"/g),
    ...html.matchAll(/<meta\b[^>]*property="article:(?:modified|published)_time"[^>]*>/g),
    ...html.matchAll(/<time\b[^>]*>[^<]*/g),
  ].map((m) => m[0]);
  // The address and the landing footer's services nav, put back on the new HTML.
  const FOOTER_NAV_LINK = (href: string, label: string) => `\n      <a href="${href}" class="hover:text-brand-cyan transition">${label}</a>`;
  const revertSitewide = (html: string) => html
    .split(NEW_STREET).join(OLD_STREET)
    .split(JSONLD_GEO.after).join(JSONLD_GEO.before)
    .split('aria-label="Услуги студии">').join('aria-label="Услуги продвижения">')
    .split('aria-label="Studiya xizmatlari">').join('aria-label="Reklama xizmatlari">')
    .split('Услуги:</span>').join('Продвижение:</span>')
    .split('Xizmatlar:</span>').join('Reklama:</span>')
    .split(FOOTER_NAV_LINK('/ru/razrabotka-saytov-tashkent/', 'Разработка сайтов')).join('')
    .split(FOOTER_NAV_LINK('/uz/sayt-yaratish/', 'Sayt yaratish')).join('');
  unprotected = { mainContent: [], addressOrFooterOnly: [], markupOnly: [], byteIdentical: [], datesMoved: [], internalLinks: {} };
  const newFiles = new Set(walk(path.join(root, 'dist')).map((f) => path.relative(path.join(root, 'dist'), path.dirname(f)).split(path.sep).join('/')));
  for (const file of walk(predecessorDist)) {
    const rel = path.relative(predecessorDist, path.dirname(file)).split(path.sep).join('/');
    newFiles.delete(rel);
    const url = rel ? `/${rel}/` : '/';
    if ((PROTECTED_PATHS as readonly string[]).includes(url)) continue;
    const next = path.join(root, 'dist', rel, 'index.html');
    if (!fs.existsSync(next)) fail(`${url}: no longer built`);
    const a = fs.readFileSync(file, 'utf8');
    const b = fs.readFileSync(next, 'utf8');
    const ca = seoContract(a); const cb = seoContract(b);
    for (const k of ['title', 'h1', 'description', 'robots', 'googlebot', 'canonical', 'hreflang'] as const) {
      if (JSON.stringify(ca[k]) !== JSON.stringify(cb[k])) fail(`${url}: ${k} changed`);
    }
    if (JSON.stringify(dates(a)) !== JSON.stringify(dates(b))) {
      if (!DATED.includes(url)) fail(`${url}: a date changed`);
      unprotected.datesMoved.push(url);
    }
    if (JSON.stringify(ca.internalLinks) !== JSON.stringify(cb.internalLinks)) {
      unprotected.internalLinks[url] = {
        added: cb.internalLinks.filter((h) => !ca.internalLinks.includes(h)),
        removed: ca.internalLinks.filter((h) => !cb.internalLinks.includes(h)),
      };
    }
    if (a === b) unprotected.byteIdentical.push(url);
    else if (ca.bodyTextSha256 === cb.bodyTextSha256) unprotected.markupOnly.push(url);
    else if (bodyTextOf(revertSitewide(b)) === bodyTextOf(a)) unprotected.addressOrFooterOnly.push(url);
    else unprotected.mainContent.push(url);
  }
  if (newFiles.size) fail(`new pages appeared: ${[...newFiles].join(', ')}`);
  for (const list of [unprotected.mainContent, unprotected.addressOrFooterOnly, unprotected.markupOnly, unprotected.byteIdentical, unprotected.datesMoved]) list.sort();
  for (const offer of ['/ru/oferta/', '/uz/oferta/']) {
    if (!unprotected.byteIdentical.includes(offer)) fail(`${offer}: the approved offer edition must stay byte-identical`);
  }
  if (JSON.stringify(unprotected.datesMoved) !== JSON.stringify(DATED)) fail(`dates moved on ${JSON.stringify(unprotected.datesMoved)}, expected ${JSON.stringify(DATED)}`);
  for (const url of DATED.slice(1)) if (!unprotected.mainContent.includes(url)) fail(`${url}: a moved date without a main-content change`);
  // Removed links are reviewed one by one (step 2.6 replaced the case links by the case sections).
  const removed = Object.entries(unprotected.internalLinks).filter(([, v]) => v.removed.length);
  const REMOVED_OK: Record<string, string[]> = {
    '/ru/razrabotka-saytov-tashkent/': ['/ru/blog/keys-cake-city-platforma-kondirterskoy/', '/ru/blog/keys-graver-studio-seo-sayt-b2b/'],
  };
  for (const [url, v] of removed) {
    if (JSON.stringify([...v.removed].sort()) !== JSON.stringify([...(REMOVED_OK[url] ?? [])].sort())) fail(`${url}: removed links ${JSON.stringify(v.removed)}`);
  }
  for (const f of ['robots.txt', 'uz/blog/feed.xml', '_redirects', '_headers']) {
    if (!fs.readFileSync(path.join(predecessorDist, f)).equals(fs.readFileSync(path.join(root, 'dist', f)))) fail(`${f} changed`);
    sitewide.identical.push(f);
  }
  // sitemap.xml: only the lastmod of the dated pages moves, to 2026-10-26.
  const lastmods = (xml: string) => Object.fromEntries([...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>[\s\S]*?<lastmod>([^<]+)<\/lastmod>/g)].map((m) => [m[1], m[2]]));
  const la = lastmods(fs.readFileSync(path.join(predecessorDist, 'sitemap.xml'), 'utf8'));
  const lb = lastmods(fs.readFileSync(path.join(root, 'dist', 'sitemap.xml'), 'utf8'));
  if (JSON.stringify(Object.keys(la).sort()) !== JSON.stringify(Object.keys(lb).sort())) fail('sitemap.xml: the URL set changed');
  const movedLastmod = Object.keys(lb).filter((u) => la[u] !== lb[u]).map((u) => u.replace('https://gptbot.uz', '')).sort();
  if (JSON.stringify(movedLastmod) !== JSON.stringify(DATED)) fail(`sitemap.xml lastmod moved on ${JSON.stringify(movedLastmod)}`);
  if (movedLastmod.some((u) => lb[`https://gptbot.uz${u}`] !== '2026-10-26')) fail('sitemap.xml: a moved lastmod is not 2026-10-26');
  sitewide.changed['sitemap.xml'] = `lastmod → 2026-10-26 on ${movedLastmod.join(', ')}; the URL set is unchanged`;
  sitewide.changed['sitemap-updates.xml'] = 'lists the four pages with a new section at 2026-10-26 and moves the lastmod of /ru/blog/ to 2026-10-26';
  sitewide.changed['updates/atom.xml, ru/blog/feed.xml'] = 'the same four pages (the RU blog feed: the SMM article) move to the top with updated 2026-10-26';
}

const revision = {
  schema: 1,
  capturedAt: new Date().toISOString(),
  source: 'Locally generated production candidate (npm run build:production of d7dd4588: 812646bc, cd83c654, 329294e9, 6b8a273e and d7dd4588 on 00cf97bc = production 4b219a0c plus docs) after source review; the predecessor build of 4b219a0c reproduces the predecessor revision\'s ten htmlSha256 byte for byte; actual live verification recorded separately after release',
  previousRevision,
  previousRevisionSha256: sha(previousRaw),
  reviewedChanges,
  invisibleToGate: [
    {
      change: `The Organization #org JSON-LD of all ten: streetAddress «${OLD_STREET}» → «${NEW_STREET}» and geo 41.334 / 69.286 → 41.3364 / 69.2723 (Google Business card, place_id ChIJbev6pAyLrjgReTyM1I3UTNk, 41.3363711 / 69.2723445, rounded to four decimals); name, addressLocality Toshkent, addressCountry UZ, contactPoint, hours and sameAs unchanged, so the footer and the structured data name the same address. The two offers keep the approved edition's address (scripts/contact-card.ts OFFER_EDITION_NAP, edition ai-paket-2026-10-v5) until a new offer edition; the change log records that divergence.`,
      pages: [...PROTECTED_PATHS],
    },
    {
      change: `The homepage's SPA entry moves by name (${HOME_ENTRY_BEFORE} → ${homeEntryAfter}): src/components/Footer.tsx renders the office line of the React landing. The chats keep their bundle ${CHAT_BUNDLE}. The generator puts the old entry name back and requires the predecessor's htmlSha256 after the reviewed swaps are put back too.`,
      pages: ['/'],
    },
    { change: `Every one of the ten keeps the shared stylesheet ${STYLESHEET}. No title, description, H1, canonical, robots, hreflang, internal link, dateModified or <time> moves on any of the ten. The landing footers' new link «Разработка сайтов / Sayt yaratish» and their «Услуги: / Xizmatlar:» label are not on any protected page. The new in-body link to /ru/blog/chatgpt-i-claude-v-uzbekistane/ from /ru/blog/ii-chat-na-russkom-chto-eto-i-kakie-byvayut/ (step 1.5) changes the donor page, not the protected one.` },
    ...(unprotected ? [
      { change: `${sitewide.identical.join(', ')} are byte-identical to the predecessor build. ${Object.entries(sitewide.changed).map(([k, v]) => `${k}: ${v}`).join('. ')}.` },
      { change: `Outside the protected set, ${unprotected.mainContent.length} pages change their main content (TOP-3 steps A/B: lead forms, price and timing sections, case sections, the Smeta block, two in-body links; listed in changedUnprotectedPages.mainContent), ${unprotected.addressOrFooterOnly.length} change by the address and the landing footer's services nav only, ${unprotected.markupOnly.length} by the JSON-LD address only, and ${unprotected.byteIdentical.join(', ')} are byte-identical (the approved offer edition ai-paket-2026-10-v5 keeps its NAP). Title, description, H1, canonical, robots and hreflang of every page of the site are unchanged; dates move only on ${DATED.join(', ')}.` },
    ] : []),
  ],
  measurement: 'Address-only release for the ten: no search-facing field of a protected page moves, and none of them changes outside the footer NAP line and the Organization address. Record the release date as a marker on the open reads: the P-CTR R-S1 read (≈05–07.11; login guide and promptlar), the download guide\'s R-S2 (16.11), the chats\' 28-day window of the 2026-10-24-chat-snippets revision (≈21–25.11) and the 25.10 pages\' read (≈22.11); their titles and descriptions, which a CTR read measures, are unchanged. The address itself is a local signal (Google Business card «Boss Digital» and the site now agree); read it in the card\'s insights and the local pack for agency queries, not in the protected pages\' CTR. No ranking or traffic guarantee.',
  ...(unprotected ? { changedUnprotectedPages: unprotected } : {}),
  pages: pages.map(({ pathname, contract, bodyText, htmlSha256 }) => ({ pathname, contract, bodyText, htmlSha256 })),
};

console.log(JSON.stringify({
  reviewedChanges: reviewedChanges.map((c) => ({ pathname: c.pathname, body: c.change.body.map((b) => `${b.surface}: «${b.before}» → «${b.after}»`), asset: c.nonContract.asset })),
  unprotected: unprotected && {
    mainContent: unprotected.mainContent, addressOrFooterOnly: unprotected.addressOrFooterOnly.length,
    markupOnly: unprotected.markupOnly, byteIdentical: unprotected.byteIdentical, datesMoved: unprotected.datesMoved,
    internalLinksChanged: Object.keys(unprotected.internalLinks).length,
    addedLinks: Object.entries(Object.values(unprotected.internalLinks).flatMap((v) => v.added).reduce<Record<string, number>>((m, h) => ({ ...m, [h]: (m[h] ?? 0) + 1 }), {})),
  },
  sitewide,
}, null, 2));
if (process.env.DRY) {
  console.log('DRY: every check passed; nothing written.');
} else {
  if (!unprotected) fail('Set PREDECESSOR_DIST to a build of 4b219a0c to write the revision.');
  if (fs.existsSync(target)) fail('Revision already exists; write a new revision instead of replacing reviewed evidence.');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(revision, null, 2) + '\n', { flag: 'wx' });
  console.log(`Wrote ${path.relative(root, target)}`);
}
