import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seoContract, PROTECTED_PATHS } from '../../../../scripts/seo-protection';

// Builds the 2026-10-26-monetization revision from the local production
// candidate in dist/ (npm run build:production of the monetization tree: stage A
// c377b572, stage B chat 40fbefbb, Sh2-lite fa309da1, G0-code 87eb2728, stage B
// content bcbd6e7c and its review 4d4c4e74, on 22e60908 = production 61c70ce6
// plus docs). The release edits no protected content file and adds no page, so
// no protected page may change its contract. Two shared script names move, and
// the script refuses to write if anything else did:
//  - the two chats: contract and body text unchanged, exactly one chat bundle
//    reference, and the HTML equals the predecessor's byte for byte once that
//    reference is put back to the predecessor's name (the chat code of
//    c377b572, 40fbefbb, fa309da1 and 4d4c4e74 renames the bundle).
//  - "/": contract and body text unchanged, exactly one SPA entry reference,
//    and the HTML equals the predecessor's byte for byte once that reference is
//    put back to the predecessor's name (the lazy admin chunk of G0-code
//    87eb2728 and 40fbefbb changes, so the entry that imports it is renamed).
//  - the seven protected articles: HTML byte-identical to the predecessor.
//  - every one of the ten keeps the shared stylesheet /assets/index-B7Z1XlOc.css.
// DRY=1 runs every check and prints the result without writing.
const root = process.cwd();
const previousRevision = 'docs/seo/evidence/2026-10-25-ai-tools-b/reviewed-protected-pages.json';
const target = path.join(root, 'docs/seo/evidence/2026-10-26-monetization/reviewed-protected-pages.json');
const previousRaw = fs.readFileSync(path.join(root, previousRevision), 'utf8').replace(/\r\n/g, '\n');
const previous = JSON.parse(previousRaw) as {
  pages: Array<{ pathname: string; contract: ReturnType<typeof seoContract>; bodyText: string; htmlSha256: string }>;
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const fail = (message: string): never => { throw new Error(message); };

// The predecessor's names, read from the wave B build that is production 61c70ce6
// (the live HTML of the three pages differs from that build only by Cloudflare's
// email_off comments).
const CHAT_BUNDLE_BEFORE = '/assets/gpt-chat-cfOqBGh8.js';
const HOME_ENTRY_BEFORE = '/assets/index-yHEMBDvB.js';
const STYLESHEET = '/assets/index-B7Z1XlOc.css';
const CHATS = ['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/'];

const pages = PROTECTED_PATHS.map((pathname) => {
  const html = fs.readFileSync(path.join(root, 'dist', pathname.slice(1), 'index.html'), 'utf8');
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const bodyText = (clean.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return { pathname, contract: seoContract(html), bodyText, htmlSha256: sha(html), html };
});

// Puts one renamed asset back to its predecessor's name and requires the predecessor's bytes.
const renamed = (page: (typeof pages)[number], htmlSha256Before: string, pattern: RegExp, before: string, what: string) => {
  const refs = [...new Set(page.html.match(pattern) || [])];
  if (refs.length !== 1) fail(`${page.pathname}: expected one ${what} reference, found ${JSON.stringify(refs)}`);
  const after = refs[0];
  if (after === before) {
    if (page.htmlSha256 !== htmlSha256Before) fail(`${page.pathname}: same ${what}, yet the HTML changed`);
  } else if (sha(page.html.split(after).join(before)) !== htmlSha256Before) {
    fail(`${page.pathname}: the HTML differs by more than the ${what} name`);
  }
  return after;
};

const chatHashes: Record<string, string> = {};
let chatBundleAfter = '';
let homeEntryAfter = '';
let homeHash = '';
for (const page of pages) {
  const before = previous.pages.find((p) => p.pathname === page.pathname) ?? fail(`${page.pathname}: not in ${previousRevision}`);
  const fields = (Object.keys(page.contract) as Array<keyof typeof page.contract>)
    .filter((k) => JSON.stringify(page.contract[k]) !== JSON.stringify(before.contract[k]));
  if (fields.length) fail(`${page.pathname}: changed ${JSON.stringify(fields)}; this revision reviews no contract change`);
  if (page.bodyText !== before.bodyText) fail(`${page.pathname}: body text changed`);
  if (!page.html.includes(`href="${STYLESHEET}"`)) fail(`${page.pathname}: the shared stylesheet is not ${STYLESHEET}`);

  if (CHATS.includes(page.pathname)) {
    const bundle = renamed(page, before.htmlSha256, /\/assets\/gpt-chat-[\w-]+\.js/g, CHAT_BUNDLE_BEFORE, 'chat bundle');
    if (chatBundleAfter && bundle !== chatBundleAfter) fail(`${page.pathname}: the two chats load different bundles`);
    chatBundleAfter = bundle;
    chatHashes[page.pathname] = `${before.htmlSha256} → ${page.htmlSha256}`;
    continue;
  }
  if (page.pathname === '/') {
    homeEntryAfter = renamed(page, before.htmlSha256, /\/assets\/index-[\w-]+\.js/g, HOME_ENTRY_BEFORE, 'SPA entry');
    homeHash = `${before.htmlSha256} → ${page.htmlSha256}`;
    continue;
  }
  if (page.htmlSha256 !== before.htmlSha256) fail(`${page.pathname}: HTML changed; the seven protected articles must be byte-identical to the predecessor`);
}
if (Object.keys(chatHashes).length !== CHATS.length || !homeHash) fail('both chats and the homepage must be checked');
const chatsMoved = chatBundleAfter !== CHAT_BUNDLE_BEFORE;
const homeMoved = homeEntryAfter !== HOME_ENTRY_BEFORE;

// The unprotected pages this release changes (content/pages and the Studio hub);
// the measurement and the IndexNow list name them.
const CHANGED_UNPROTECTED = {
  nicheLeadForms: [
    '/ru/ai-bot-dlya-agentstva-nedvizhimosti/', '/ru/ai-bot-dlya-avtosalona/', '/ru/ai-bot-dlya-dostavki-edy/', '/ru/ai-bot-dlya-fitnes-kluba/',
    '/ru/ai-bot-dlya-horeca/', '/ru/ai-bot-dlya-kliniki/', '/ru/ai-bot-dlya-magazina/', '/ru/ai-bot-dlya-nishi/', '/ru/ai-bot-dlya-salona-krasoty/',
    '/ru/ai-bot-dlya-sayta/', '/ru/ai-bot-dlya-uchebnogo-tsentra/', '/ru/ai-bot-dlya-yurista/', '/ru/ai-bot-ili-menedzher/',
    '/ru/ai-bot-s-crm-amocrm-bitrix24/', '/ru/kak-sdelat-ai-bota-telegram-instagram/', '/ru/sayt-s-ai-botom/',
    '/uz/ai-bot-yoki-menejer/', '/uz/amocrm-bitrix24-bilan-ai-bot/', '/uz/arizalarni-avtomatlashtirish/', '/uz/avtosalon-uchun-ai-bot/',
    '/uz/dokon-uchun-ai-bot/', '/uz/fitnes-klub-uchun-ai-bot/', '/uz/horeca-uchun-ai-bot/', '/uz/klinika-uchun-ai-bot/',
    '/uz/kochmas-mulk-agentligi-uchun-ai-bot/', '/uz/oquv-markazi-uchun-ai-bot/', '/uz/salon-uchun-ai-bot/', '/uz/sayt-uchun-ai-bot/',
    '/uz/sayt-yaratish/', '/uz/yetkazib-berish-uchun-ai-bot/', '/uz/yurist-uchun-ai-bot/',
  ],
  tariffHubs: ['/ru/tarify-ai-chat/', '/uz/tariflar/'],
  toolPages: [
    '/ru/generator-pozdravleniy/', '/ru/kirillica-v-latinicu/', '/ru/nepravilnye-glagoly/', '/ru/russko-uzbekskiy-perevodchik/',
    '/uz/ai-sher-yozish/', '/uz/ai-tabrik-generatori/', '/uz/gpt-chat-qollanma/', '/uz/gpt-telegram-instagram-ideya/',
    '/uz/gpt-uzbek-tilida-ai-chat/', '/uz/kalkulyator/', '/uz/kirill-lotin/', '/uz/notogri-fellar/', '/uz/past-simple/',
    '/uz/present-continuous/', '/uz/present-simple/', '/uz/rus-ozbek-tarjimon/',
  ],
  teacherPilot: ['/uz/fizika-test/', '/uz/informatika-test/', '/uz/ingliz-tili-zamonlari/', '/uz/matematika-test/', '/uz/onlayn-testlar/'],
};
const changedUnprotected = Object.values(CHANGED_UNPROTECTED).flat();
if (new Set(changedUnprotected).size !== changedUnprotected.length) fail('a changed page is listed twice');
for (const url of changedUnprotected) {
  if ((PROTECTED_PATHS as readonly string[]).includes(url)) fail(`${url} is protected`);
  if (!fs.existsSync(path.join(root, 'dist', url.slice(1), 'index.html'))) fail(`${url}: not built`);
}

const revision = {
  schema: 1,
  capturedAt: new Date().toISOString(),
  source: 'Locally generated production candidate (npm run build:production of the monetization tree: stage A c377b572, stage B chat 40fbefbb, Sh2-lite fa309da1, G0-code 87eb2728, stage B content bcbd6e7c and its review 4d4c4e74, on 22e60908 = production 61c70ce6 plus docs) after source review; actual live verification recorded separately after release',
  previousRevision,
  previousRevisionSha256: sha(previousRaw),
  reviewedChanges: [],
  invisibleToGate: [
    {
      change: chatsMoved
        ? `The two chats keep their contract and body text; their HTML differs from the predecessor by one asset name, the chat bundle ${CHAT_BUNDLE_BEFORE} → ${chatBundleAfter} (the chat code of stage A c377b572: translator and ad-copy starters; stage B 40fbefbb: role paywall, last-trial card, exit survey; Sh2-lite fa309da1: the pack window sends its page as the return path; review 4d4c4e74: «Paket olish» naming and pack copy). The generator puts the old name back and requires the predecessor's htmlSha256. Every new chat surface sits in lazy parts; the start bundle stays under its 110 000 B brotli budget.`
        : `The two chats are byte-identical to the predecessor, including the chat bundle ${CHAT_BUNDLE_BEFORE}.`,
      pages: CHATS,
      htmlSha256: chatHashes,
    },
    {
      change: homeMoved
        ? `The homepage keeps its contract and body text; its HTML differs from the predecessor by one asset name, the SPA entry ${HOME_ENTRY_BEFORE} → ${homeEntryAfter}: the lazy admin chunk it imports changed (the AI-chat admin cards of G0-code 87eb2728 and the «Недели» card of 40fbefbb). The generator puts the old name back and requires the predecessor's htmlSha256. No homepage list entry is added, dropped, renamed or moved: the release publishes no page and renames no H1 or title.`
        : `The homepage is byte-identical to the predecessor, including the SPA entry ${HOME_ENTRY_BEFORE}.`,
      pages: ['/'],
      htmlSha256: { '/': homeHash },
    },
    { change: `The seven protected articles are byte-identical to the predecessor (the wave B build); the generator refuses otherwise. The shared stylesheet keeps its name (${STYLESHEET}) on every page.` },
    { change: 'sitemap.xml keeps its 329 entries; the lastmod of /ru/tarify-ai-chat/ moves 2026-10-08 → 2026-10-26 (its dateModified: the Payme row, the second pack and «Для организаций») and the sitemap lastmod of / moves 2026-10-25 → 2026-10-26 with it (latest site change); the other nine protected URLs keep theirs. sitemap-updates.xml and /updates/atom.xml gain /ru/tarify-ai-chat/. llms.txt, llms-full.txt and robots.txt are byte-identical. Sitewide files, not part of any page contract.' },
    { change: `Outside the protected set, ${changedUnprotected.length} unprotected pages change; their titles, descriptions, H1 and canonicals are kept. The 27 niche AI-bot pages gain the lead form in place of the phone-and-e-mail card, and on them and four form pages (both CRM pages, /uz/arizalarni-avtomatlashtirish/, /uz/sayt-yaratish/) every «#contact» call to action opens «#lead-form» (${CHANGED_UNPROTECTED.nicheLeadForms.length} pages). The two tariff hubs: /ru/tarify-ai-chat/ (Payme beside Click, the second pack, «Для организаций») and /uz/tariflar/ (the UZ hub of every tariff: «AI paket · 1 oy», «Qaysi biri menga kerak», «Tashkilotlar uchun»). ${CHANGED_UNPROTECTED.toolPages.length} chat-tool pages: «AI paket bu sahifada» / «AI-пакет на этой странице» on ten (both translators, which also gain six starters; both converters, the poem tool, both greeting generators, both irregular-verb pages and the ad-copy generator), and on six more only the tariff link moves to the UZ hub (the calculator, the chat guide, the UZ AI-chat guide and the three single-tense pages). «Ustozlar va o‘quv markazlari uchun» with the honest organisations pilot on the tests hub, the three tests and the tenses hub (${CHANGED_UNPROTECTED.teacherPilot.length} pages). Every sum on them comes from the code (PRICE_TIYIN, PAID_MESSAGES, PACK_DAILY_LIMIT, FREE_TRIAL_LIMIT, the live providers, the Studio plans; tests/seo-revenue-claims.test.ts). None of these pages is protected.` },
  ],
  measurement: 'This release changes no search-facing field of a protected page and no homepage list; the ten keep their contracts and body text, and their HTML moves only by the two script names above. The chats\' 28-day window that opened with the 2026-10-24-chat-snippets revision (≈21–25.11) keeps its baseline and dates, and the download guide stays byte for byte for its P-CTR read (≈06–10.11): neither read gains a confound from this release. The changed unprotected pages carry new body text only; read the niche lead forms by lead_submit events per page against the four weeks before (no ranking claim), the tariff hubs by Search Console impressions and clicks after a recrawl confirmed with URL Inspection, and the paywall by the gpt_ui_events trial_paywall_role and trial_exit_reason counts in the admin «Недели» card. No ranking or traffic guarantee.',
  changedUnprotectedPages: CHANGED_UNPROTECTED,
  pages: pages.map(({ pathname, contract, bodyText, htmlSha256 }) => ({ pathname, contract, bodyText, htmlSha256 })),
};

console.log(JSON.stringify({
  reviewedChanges: [],
  chats: chatHashes,
  chatBundle: chatsMoved ? `${CHAT_BUNDLE_BEFORE} → ${chatBundleAfter}` : `${CHAT_BUNDLE_BEFORE} (unchanged)`,
  home: homeHash,
  homeEntry: homeMoved ? `${HOME_ENTRY_BEFORE} → ${homeEntryAfter}` : `${HOME_ENTRY_BEFORE} (unchanged)`,
  changedUnprotectedPages: changedUnprotected.length,
}, null, 2));
if (process.env.DRY) {
  console.log('DRY: every check passed; nothing written.');
} else {
  if (fs.existsSync(target)) fail('Revision already exists; write a new revision instead of replacing reviewed evidence.');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(revision, null, 2) + '\n', { flag: 'wx' });
  console.log(`Wrote ${path.relative(root, target)}`);
}
