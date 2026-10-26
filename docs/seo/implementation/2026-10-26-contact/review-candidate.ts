import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seoContract, PROTECTED_PATHS } from '../../../../scripts/seo-protection';

// Builds the 2026-10-26-contact revision from the local production candidate in
// dist/ (npm run build:production of the contact tree: 12feefa7, 79a35b97,
// 2b5bc906 and f694838b on 6515fe49 = production 4924c998 plus docs).
//
// Owner order of 26.10.2026 (chat): «на всех формах и вообще где мой номер —
// грамотно замени на мой Telegram, чтобы писали, а не звонили … Только
// аккуратнее, чтобы SEO не нарушилось». It supersedes decision L14: the owner
// names https://t.me/XGame_changerx as the public contact. On the ten protected
// pages only contact surfaces may change, so the script lists every HTML swap
// it accepts (SWAPS), puts each one back, puts the two renamed scripts back,
// and refuses to write unless the result is the predecessor's HTML byte for
// byte. What it accepts:
//  - the footer link of all ten: the phone → «Telegram» (data-contact="studio");
//  - the business contact lines inside the text (four articles, both chats),
//    the #contact card of two articles, the noscript line of both chats, and on
//    "/" the shell's contact line and the FAQ answer «Что будет после
//    обращения?» (visible text and FAQPage acceptedAnswer): «позвонить /
//    qo‘ng‘iroq qilish» → «написать в Telegram / Telegram’da yozish»;
//  - the Organization JSON-LD of all ten: no telephone, contactPoint customer
//    support + e-mail + url Telegram (name, address, hours unchanged);
//  - one HTML comment on "/" and the chat bundle / SPA entry names.
// Every contract field except bodyTextSha256 must stay; the body text change is
// recorded as text replacements that, replayed on the new body text, give the
// predecessor's body text exactly (tests/seo-protection.test.ts replays them).
//
// PREDECESSOR_DIST (required to write) is a build of 6515fe49 (vite build, the
// three prerender scripts, sitemap/robots/llm/feed and the studio prerender).
// Its ten protected pages must hash to the predecessor revision; the script
// then compares every page of the site and records which ones change.
// DRY=1 runs every check and prints the result without writing.
const root = process.cwd();
const previousRevision = 'docs/seo/evidence/2026-10-26-monetization/reviewed-protected-pages.json';
const target = path.join(root, 'docs/seo/evidence/2026-10-26-contact/reviewed-protected-pages.json');
const previousRaw = fs.readFileSync(path.join(root, previousRevision), 'utf8').replace(/\r\n/g, '\n');
const previous = JSON.parse(previousRaw) as {
  pages: Array<{ pathname: string; contract: ReturnType<typeof seoContract>; bodyText: string; htmlSha256: string }>;
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const fail = (message: string): never => { throw new Error(message); };
const bodyTextOf = (html: string) => (html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const TG = 'https://t.me/XGame_changerx';
const STYLESHEET = '/assets/index-B7Z1XlOc.css';
const CHAT_BUNDLE_BEFORE = '/assets/gpt-chat-Dw0ALAyJ.js';
const HOME_ENTRY_BEFORE = '/assets/index-DN-DVHsv.js';
const CHATS = ['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/'];

type Swap = { surface: string; before: string; after: string };
const JSONLD: Swap = {
  surface: 'Organization #org JSON-LD',
  before: '"contactType":"sales","telephone":"+998505870720","email":"ceo@gptbot.uz","availableLanguage":["Russian","Uzbek"]},"telephone":"+998505870720","email":"ceo@gptbot.uz",',
  after: `"contactType":"customer support","email":"ceo@gptbot.uz","url":"${TG}","availableLanguage":["Russian","Uzbek"]},"email":"ceo@gptbot.uz",`,
};
const FOOTER_ARTICLE: Swap = {
  surface: 'footer',
  before: '<a href="tel:+998505870720" class="hover:text-white">+998 50 587 07 20</a>',
  after: `<a data-contact="studio" href="${TG}" rel="nofollow noopener noreferrer" target="_blank" class="hover:text-white">Telegram</a>`,
};
const FOOTER_CHAT: Swap = {
  surface: 'footer',
  before: '<a data-testid="footer-call-cta" href="tel:+998505870720" class="hover:text-white">+998 50 587 07 20</a>',
  after: `<a data-testid="footer-telegram-cta" data-contact="studio" href="${TG}" rel="nofollow noopener noreferrer" target="_blank" class="hover:text-white">Telegram</a>`,
};
const FOOTER_HOME: Swap = {
  surface: 'footer of the crawler shell',
  before: '<a data-testid="footer-call-cta" href="tel:+998505870720">+998 50 587 07 20</a>',
  after: `<a data-contact="studio" href="${TG}" target="_blank" rel="nofollow noopener noreferrer">Telegram</a>`,
};
const inline = (label: string) => `<a href="${TG}" data-contact="studio" rel="nofollow noopener noreferrer" target="_blank" class="text-brand-cyan hover:underline">${label}</a>`;
const mail = (label: string) => `<!--email_off--><a href="mailto:ceo@gptbot.uz" class="text-brand-cyan hover:underline">${label}</a>`;
const CTA_RU: Swap = {
  surface: 'business contact line in the article text (content body.2.links)',
  before: `<a href="tel:+998505870720" class="text-brand-cyan hover:underline">Позвонить</a> или ${mail('написать на e-mail')}`,
  after: `${inline('Напишите в Telegram')} или ${mail('на e-mail')}`,
};
const CTA_UZ: Swap = {
  surface: 'business contact line in the article text',
  before: `<a href="tel:+998505870720" class="text-brand-cyan hover:underline">Qo‘ng‘iroq qilish</a> yoki ${mail('e-mail yozish')}`,
  after: `${inline('Telegram’da')} yoki ${mail('e-mail orqali yozing')}`,
};
const CHAT_RU_LINE: Swap = {
  surface: 'business contact line in the text under the chat',
  before: `<a href="tel:+998505870720" class="text-brand-cyan hover:underline">позвонить нам</a> или ${mail('написать на ceo@gptbot.uz')}`,
  after: `${inline('написать нам в Telegram')} или ${mail('на e-mail ceo@gptbot.uz')}`,
};
const CHAT_UZ_LINE: Swap = {
  surface: 'business contact line in the text under the chat',
  before: '<a href="tel:+998505870720" class="text-brand-cyan hover:underline">bizga qo‘ng‘iroq qiling</a>',
  after: inline('bizga Telegram’da'),
};
const NOSCRIPT_RU: Swap = {
  surface: '<noscript> contact line',
  before: 'или позвоните нам: +998 50 587 07 20.</p></noscript>',
  after: 'или напишите нам в Telegram: @XGame_changerx.</p></noscript>',
};
const NOSCRIPT_UZ: Swap = {
  surface: '<noscript> contact line',
  before: 'yoki bizga qo‘ng‘iroq qiling: +998 50 587 07 20.</p></noscript>',
  after: 'yoki bizga Telegram’da yozing: @XGame_changerx.</p></noscript>',
};
const button = (testid: string, attrs: string, label: string) =>
  `<a data-testid="${testid}" ${attrs} class="btn-primary min-h-[44px] w-full sm:w-auto text-base">${label}</a>`;
const CARD_RU_INTRO: Swap = {
  surface: '#contact card: intro',
  before: '>Позвоните или напишите — ответим в рабочее время, Пн–Сб 10:00–19:00.</p>',
  after: '>Напишите в Telegram @XGame_changerx или на e-mail — ответим в рабочее время, Пн–Сб 10:00–19:00.</p>',
};
const CARD_RU_BUTTON: Swap = {
  surface: '#contact card: button',
  before: button('contact-phone', 'href="tel:+998505870720"', 'Позвонить: +998 50 587 07 20'),
  after: button('contact-telegram', `data-contact="studio" href="${TG}" target="_blank" rel="nofollow noopener noreferrer"`, 'Написать в Telegram'),
};
const CARD_UZ_INTRO: Swap = {
  surface: '#contact card: intro',
  before: '>Qo‘ng‘iroq qiling yoki yozing — ish vaqtida javob beramiz: Du–Sha 10:00–19:00.</p>',
  after: '>Telegram’da (@XGame_changerx) yoki e-mail orqali yozing — ish vaqtida javob beramiz: Du–Sha 10:00–19:00.</p>',
};
const CARD_UZ_BUTTON: Swap = {
  surface: '#contact card: button',
  before: button('contact-phone', 'href="tel:+998505870720"', 'Qo‘ng‘iroq qilish: +998 50 587 07 20'),
  after: button('contact-telegram', `data-contact="studio" href="${TG}" target="_blank" rel="nofollow noopener noreferrer"`, 'Telegram’da yozish'),
};
const HOME_FAQ: Swap = {
  surface: 'FAQ answer «Что будет после обращения?» (src/i18n.ts; visible text and FAQPage acceptedAnswer)',
  before: 'Вы звоните или пишете на e-mail — мы показываем демо и обсуждаем сценарий под вашу нишу.',
  after: 'Вы пишете в Telegram или на e-mail — мы показываем демо и обсуждаем сценарий под вашу нишу.',
};
const HOME_CONTACT: Swap = {
  surface: 'contact section #contact of the crawler shell',
  before: '<a href="tel:+998505870720">Позвонить: +998 50 587 07 20</a>',
  after: `<a data-contact="studio" href="${TG}" target="_blank" rel="nofollow noopener noreferrer">Написать в Telegram</a>`,
};
const HOME_COMMENT: Swap = {
  surface: 'HTML comment above the shell footer (not rendered)',
  before: '<!-- NAP: the phone belongs here too, same as the real footer and the sticky\n         bar. This shell is the no-JS / crawler view of the homepage, so it is\n         the only NAP a crawler that does not execute JavaScript will ever see.\n         No gtag handler on purpose: this block is only visible when JavaScript\n         is unavailable,',
  after: '<!-- NAP: the contacts belong here too, same as the real footer and the\n         sticky bar. This shell is the no-JS / crawler view of the homepage, so\n         it is the only NAP a crawler that does not execute JavaScript will\n         ever see. No gtag handler on purpose: this block is only visible when\n         JavaScript is unavailable,',
};

// [swap, occurrences in the new HTML]
const SWAPS: Record<string, Array<[Swap, number]>> = {
  '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/': [[JSONLD, 1], [CTA_UZ, 2], [FOOTER_ARTICLE, 1]],
  '/uz/gpt-uzbek-tilida/': [[JSONLD, 1], [NOSCRIPT_UZ, 1], [CHAT_UZ_LINE, 1], [FOOTER_CHAT, 1]],
  '/ru/gpt-chat/': [[JSONLD, 1], [NOSCRIPT_RU, 1], [CHAT_RU_LINE, 1], [FOOTER_CHAT, 1]],
  '/ru/blog/chatgpt-i-claude-v-uzbekistane/': [[JSONLD, 1], [CTA_RU, 1], [CARD_RU_INTRO, 1], [CARD_RU_BUTTON, 1], [FOOTER_ARTICLE, 1]],
  '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/': [[JSONLD, 1], [CTA_RU, 1], [FOOTER_ARTICLE, 1]],
  '/uz/blog/chatgptga-qanday-kirish-mumkin/': [[JSONLD, 1], [FOOTER_ARTICLE, 1]],
  '/uz/blog/chatgpt-uzbek-tilida-promptlar/': [[JSONLD, 1], [FOOTER_ARTICLE, 1]],
  '/': [[JSONLD, 1], [HOME_FAQ, 2], [HOME_CONTACT, 1], [HOME_COMMENT, 1], [FOOTER_HOME, 1]],
  '/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/': [[JSONLD, 1], [CTA_UZ, 1], [FOOTER_ARTICLE, 1]],
  '/uz/blog/ai-chat-nima-va-qanday-turlari-bor/': [[JSONLD, 1], [CARD_UZ_INTRO, 1], [CARD_UZ_BUTTON, 1], [FOOTER_ARTICLE, 1]],
};

// The visible text one swap changes, with enough words around it to be unique in
// the text it applies to. Replaying {after → before} in order on the new body
// text gives the predecessor's body text.
const textStep = (newText: string, oldText: string) => {
  let p = 0;
  while (p < newText.length && p < oldText.length && newText[p] === oldText[p]) p++;
  let s = 0;
  while (s < newText.length - p && s < oldText.length - p && newText[newText.length - 1 - s] === oldText[oldText.length - 1 - s]) s++;
  // Widen to whole words, then add context words until the new segment is unique.
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

const assetRenames: Record<string, string> = {};
const reviewedChanges = [];
for (const page of pages) {
  const before = previous.pages.find((p) => p.pathname === page.pathname) ?? fail(`${page.pathname}: not in ${previousRevision}`);
  const fields = (Object.keys(page.contract) as Array<keyof typeof page.contract>)
    .filter((k) => JSON.stringify(page.contract[k]) !== JSON.stringify(before.contract[k]));
  if (JSON.stringify(fields) !== JSON.stringify(['bodyTextSha256'])) fail(`${page.pathname}: changed ${JSON.stringify(fields)}; this revision reviews body text only`);
  if (!page.html.includes(`href="${STYLESHEET}"`)) fail(`${page.pathname}: the shared stylesheet is not ${STYLESHEET}`);

  // The new page: no phone, no tel:, every Telegram link marked and outbound; JSON-LD without telephone.
  if (/505870720|50 587 07 20|href="tel:/i.test(page.html)) fail(`${page.pathname}: the phone or a tel: link is still in the HTML`);
  const tgLinks = [...page.html.matchAll(/<a\b[^>]*href="https:\/\/t\.me\/XGame_changerx"[^>]*>/g)].map((m) => m[0]);
  if (!tgLinks.length) fail(`${page.pathname}: no Telegram link`);
  for (const tag of tgLinks) {
    if (!/data-contact="studio"/.test(tag) || !/rel="nofollow noopener noreferrer"/.test(tag) || !/target="_blank"/.test(tag)) fail(`${page.pathname}: unmarked Telegram link ${tag}`);
  }
  if (/"telephone"/.test(page.html) || !page.html.includes(`"contactType":"customer support","email":"ceo@gptbot.uz","url":"${TG}"`)) fail(`${page.pathname}: Organization JSON-LD is not the reviewed contact`);

  // Put every reviewed swap back, one occurrence at a time, and record the text it moves.
  let html = page.html;
  const body: Array<{ surface: string; before: string; after: string }> = [];
  const markup: string[] = [];
  for (const [swap, count] of SWAPS[page.pathname] ?? fail(`${page.pathname}: no reviewed swaps`)) {
    const found = html.split(swap.after).length - 1;
    if (found !== count) fail(`${page.pathname}: «${swap.surface}» expected ${count}×, found ${found}×`);
    for (let i = 0; i < count; i++) {
      const textBefore = bodyTextOf(html);
      html = html.replace(swap.after, () => swap.before);
      const textAfter = bodyTextOf(html);
      if (textBefore === textAfter) { if (!markup.includes(swap.surface)) markup.push(swap.surface); continue; }
      body.push({ surface: swap.surface, ...textStep(textBefore, textAfter) });
    }
  }
  if (html.includes('XGame_changerx') || /<a\b[^>]*data-contact="studio"/.test(html)) fail(`${page.pathname}: a Telegram link is not covered by a reviewed swap`);

  // Put the renamed scripts back.
  const putBack = (pattern: RegExp, beforeName: string, what: string) => {
    const refs = [...new Set(html.match(pattern) || [])];
    if (refs.length !== 1) fail(`${page.pathname}: expected one ${what} reference, found ${JSON.stringify(refs)}`);
    if (refs[0] !== beforeName) { html = html.split(refs[0]).join(beforeName); assetRenames[page.pathname] = `${beforeName} → ${refs[0]}`; }
  };
  if (CHATS.includes(page.pathname)) putBack(/\/assets\/gpt-chat-[\w-]+\.js/g, CHAT_BUNDLE_BEFORE, 'chat bundle');
  if (page.pathname === '/') putBack(/\/assets\/index-[\w-]+\.js/g, HOME_ENTRY_BEFORE, 'SPA entry');
  if (sha(html) !== before.htmlSha256) fail(`${page.pathname}: the HTML differs from the predecessor by more than the reviewed contact swaps`);

  // Replaying the recorded text steps on the new body text gives the old one.
  let replay = page.bodyText;
  for (const step of body) {
    if (replay.split(step.after).length !== 2) fail(`${page.pathname}: text step is not unique: ${step.after}`);
    replay = replay.replace(step.after, () => step.before);
  }
  if (replay !== before.bodyText) fail(`${page.pathname}: the recorded text steps do not reproduce the predecessor's body text`);

  reviewedChanges.push({
    pathname: page.pathname,
    fields: ['bodyTextSha256'],
    reason: 'Owner order of 2026-10-26 (chat): the owner\'s phone gives way to his Telegram https://t.me/XGame_changerx on every form and public surface, so that visitors write instead of calling, carefully for SEO; it supersedes decision L14 (2026-10-01: the personal account is no public contact). On a protected page only contact surfaces change; each step below names its surface.',
    change: {
      title: 'unchanged', h1: 'unchanged', description: 'unchanged', robots: 'unchanged', canonical: 'unchanged', hreflang: 'unchanged',
      internalLinks: 'unchanged (t.me, tel: and mailto: links are not internal links)',
      body,
      bodyTextSha256: `${before.contract.bodyTextSha256} → ${page.contract.bodyTextSha256}`,
      bodyTextLength: `${before.bodyText.length} → ${page.bodyText.length}`,
    },
    nonContract: {
      markup: `Every Telegram link carries data-contact="studio" (GA4 contact_click, Metrika telegram_cta_studio), rel="nofollow noopener noreferrer" and target="_blank", as the site's other outbound Telegram links; no tel: link and no phone digits remain.${markup.length ? ` Outside the body text: ${markup.join('; ')}.` : ''}`,
      jsonLd: 'Organization #org: telephone removed (node and contactPoint); contactPoint contactType sales → customer support, with email ceo@gptbot.uz, url https://t.me/XGame_changerx and availableLanguage Russian, Uzbek; name, address, geo, hours and sameAs unchanged.',
      ...(assetRenames[page.pathname] ? { asset: `${CHATS.includes(page.pathname) ? 'chat bundle' : 'SPA entry'} ${assetRenames[page.pathname]} (the generator puts the old name back)` } : {}),
    },
    htmlSha256: `${before.htmlSha256} → ${page.htmlSha256}`,
  });
}
if (Object.keys(assetRenames).length !== CHATS.length + 1) fail(`expected the chat bundle and the SPA entry to move, got ${JSON.stringify(assetRenames)}`);

// The whole site against the predecessor build.
const predecessorDist = process.env.PREDECESSOR_DIST;
let changedUnprotectedPages: { bodyText: string[]; htmlOnly: string[]; byteIdentical: string[] } | null = null;
const sitewide: string[] = [];
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
  changedUnprotectedPages = { bodyText: [], htmlOnly: [], byteIdentical: [] };
  // datePublished/dateModified/lastReviewed in JSON-LD, article:*_time metas and <time> tags.
  const dates = (html: string) => [
    ...html.matchAll(/"(?:dateModified|datePublished|lastReviewed)":"[^"]*"/g),
    ...html.matchAll(/<meta\b[^>]*property="article:(?:modified|published)_time"[^>]*>/g),
    ...html.matchAll(/<time\b[^>]*>[^<]*/g),
  ].map((m) => m[0]);
  for (const file of walk(predecessorDist)) {
    const rel = path.relative(predecessorDist, path.dirname(file)).split(path.sep).join('/');
    const url = rel ? `/${rel}/` : '/';
    if ((PROTECTED_PATHS as readonly string[]).includes(url)) continue;
    const next = path.join(root, 'dist', rel, 'index.html');
    if (!fs.existsSync(next)) fail(`${url}: no longer built`);
    const a = fs.readFileSync(file, 'utf8');
    const b = fs.readFileSync(next, 'utf8');
    const ca = seoContract(a); const cb = seoContract(b);
    for (const k of ['title', 'h1', 'description', 'robots', 'googlebot', 'canonical', 'hreflang', 'internalLinks'] as const) {
      if (JSON.stringify(ca[k]) !== JSON.stringify(cb[k])) fail(`${url}: ${k} changed`);
    }
    if (JSON.stringify(dates(a)) !== JSON.stringify(dates(b))) fail(`${url}: a date changed`);
    if (a === b) changedUnprotectedPages.byteIdentical.push(url);
    else if (ca.bodyTextSha256 === cb.bodyTextSha256) changedUnprotectedPages.htmlOnly.push(url);
    else changedUnprotectedPages.bodyText.push(url);
  }
  for (const list of Object.values(changedUnprotectedPages)) list.sort();
  if (JSON.stringify(changedUnprotectedPages.byteIdentical) !== JSON.stringify(['/ru/oferta/', '/uz/oferta/'])) {
    fail(`only the two offers may stay byte-identical: ${JSON.stringify(changedUnprotectedPages.byteIdentical)}`);
  }
  for (const f of ['sitemap.xml', 'sitemap-updates.xml', 'robots.txt', 'updates/atom.xml', 'ru/blog/feed.xml', 'uz/blog/feed.xml', '_redirects', '_headers']) {
    if (!fs.readFileSync(path.join(predecessorDist, f)).equals(fs.readFileSync(path.join(root, 'dist', f)))) fail(`${f} changed`);
    sitewide.push(f);
  }
}

const unprotected = changedUnprotectedPages;
const revision = {
  schema: 1,
  capturedAt: new Date().toISOString(),
  source: 'Locally generated production candidate (npm run build:production of the contact tree: 12feefa7, 79a35b97, 2b5bc906 and f694838b on 6515fe49 = production 4924c998 plus docs) after source review; the predecessor build of 6515fe49 reproduces the predecessor revision\'s ten htmlSha256 byte for byte; actual live verification recorded separately after release',
  previousRevision,
  previousRevisionSha256: sha(previousRaw),
  reviewedChanges,
  invisibleToGate: [
    {
      change: 'The Organization JSON-LD of all ten loses telephone and gets contactPoint customer support with e-mail and url https://t.me/XGame_changerx; name, address, geo, opening hours and sameAs are unchanged, so the NAP name and address stay consistent. The two offers keep the approved edition\'s Organization (telephone, contactPoint sales) until a new offer edition; the change log records that divergence.',
      pages: [...PROTECTED_PATHS],
    },
    {
      change: `Two script names move because their code changed: the chats' bundle (${assetRenames['/ru/gpt-chat/']}; src/gpt-chat/contact.ts, the pack panel's support line and the lead form drop the phone) and the homepage's SPA entry (${assetRenames['/']}; Footer, FinalCTA, StickyCTA and src/i18n.ts). The generator puts each old name back and requires the predecessor's htmlSha256 after the reviewed swaps are put back too.`,
      pages: [...CHATS, '/'],
    },
    { change: `Every one of the ten keeps the shared stylesheet ${STYLESHEET}. No title, description, H1, canonical, robots, hreflang, internal link, updatedAt, dateModified or <time> moves on any page of the site.` },
    ...(unprotected ? [
      { change: `${sitewide.join(', ')} are byte-identical to the predecessor build: no lastmod, feed entry or redirect moves (a contact-only edit is not a substantive update).` },
      { change: `Outside the protected set, ${unprotected.bodyText.length} pages change body text (every footer: the phone → «Telegram»; on the landings, articles and tools also the contact card, the mobile bar «Написать в Telegram / Telegram’da yozish», the lead-form fallback and the call invitations in their text), ${unprotected.htmlOnly.length} change markup only (the GPTBot Market support link gains data-contact="studio"), and ${unprotected.byteIdentical.join(' and ')} are byte-identical (the approved offer edition ai-paket-2026-10-v5 keeps its contacts). Title, description, H1, canonical, robots, hreflang and internal links of all of them are unchanged.` },
    ] : []),
  ],
  measurement: 'Contact-only release: no search-facing field of any page moves. Read the contact signal as GA4 contact_click and the Metrika goal telegram_cta_studio per page against phone_click plus contact_click of the four weeks before (phone_click falls to zero from the release day by design). The chats\' 28-day window of the 2026-10-24-chat-snippets revision (≈21–25.11) and the download guide\'s P-CTR read (≈06–10.11) keep their dates: their titles and descriptions, which a CTR read measures, are unchanged; the download guide\'s HTML changes for the first time since the 2026-10-23 recovery, by two contact lines and the footer, so record the release date as a marker on both reads. No ranking or traffic guarantee.',
  ...(unprotected ? { changedUnprotectedPages: unprotected } : {}),
  pages: pages.map(({ pathname, contract, bodyText, htmlSha256 }) => ({ pathname, contract, bodyText, htmlSha256 })),
};

console.log(JSON.stringify({
  reviewedChanges: reviewedChanges.map((c) => ({ pathname: c.pathname, body: c.change.body.map((b) => `${b.surface}: «${b.before}» → «${b.after}»`), asset: c.nonContract.asset })),
  unprotected: unprotected && { bodyText: unprotected.bodyText.length, htmlOnly: unprotected.htmlOnly, byteIdentical: unprotected.byteIdentical },
}, null, 2));
if (process.env.DRY) {
  console.log('DRY: every check passed; nothing written.');
} else {
  if (!unprotected) fail('Set PREDECESSOR_DIST to a build of 6515fe49 to write the revision.');
  if (fs.existsSync(target)) fail('Revision already exists; write a new revision instead of replacing reviewed evidence.');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(revision, null, 2) + '\n', { flag: 'wx' });
  console.log(`Wrote ${path.relative(root, target)}`);
}
