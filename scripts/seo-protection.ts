import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stylesheetHrefs } from './site-stylesheets';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Every reviewed revision keeps its predecessor immutable. The 2026-09-18-fysa
// revision (fire-your-seo-agency audit, F01) writes the brand as GPTBot.uz on
// every page: header wordmark, author byline, footer NAP line, and on the
// homepage also title, H1 and description («GPTBot — …» → «GPTBot.uz — …»).
// The 2026-09-18-fysa-2 revision renames the brand in the article chat-entry
// block on six leaders (body text only). Canonical, robots, hreflang and
// internal links of all ten pages are identical to the 2026-09-18-release
// revision; the nine leaders keep their title, H1 and description.
// The 2026-09-18-home-shell revision changes one field on one page: the
// homepage body text (15 059 → 17 241 characters). scripts/prerender-home.ts
// now writes the hero <picture>, the pain / solution / how / niches copy and
// the five FAQ pairs into the crawler shell, so a crawler that does not run
// JavaScript reads what a visitor sees; every string comes from src/i18n.ts,
// which the React landing renders. The nine leaders are byte-identical, and
// the homepage keeps its title, H1, description, canonical, robots, hreflang
// and internal-link set.
// The 2026-09-29-full-audit revision (full-site audit, owner decisions: office
// hours Mon–Sat 10:00–19:00, /ru/ → 301 to "/") changes body text and links
// only: every footer shows the office hours the Organization schema declares;
// the five Uzbek articles link their logo and breadcrumb to /uz/ instead of the
// Russian homepage and sign the byline in Latin script; the homepage shell no
// longer links /ru/. Title, H1, description, canonical, robots and hreflang of
// all ten pages are unchanged; reviewedChanges in the file lists every diff.
// The 2026-09-30-gsc-driven revision (fresh GSC data, owner mandate 2026-09-29)
// gives each ChatGPT leader one intent: the UZ chat takes the bare «chatgpt
// kirish» with an honest chatgpt.com/independent-chat section first, the login
// article targets the login long tail (new description and first FAQ; its title
// waits for the C22 stage-2 decision), the download article gets a 138-character
// description and FAQ/H2 wording, the RU chat gets a bilingual description, a
// login paragraph and a Telegram-bot link instead of Telegram Ads, and the
// payment article links Russian business pages. The homepage body changes by
// one shell anchor (the H1 of /ru/luchshie-razrabotchiki-chat-botov-tashkent/).
// Both chat pages stop emitting FAQPage JSON-LD for questions their template
// never showed; their visible HTML is unaffected by that.
// Title, canonical, robots, hreflang and all H1s are unchanged; reviewedChanges
// lists every diff, including the JSON-LD, og and keyword edits the gate does
// not see.
// The 2026-10-01-paid-chat-honesty revision is the one revision of release R3
// (paid-chat plan WP-12; owner decision L14: no work Telegram has been named,
// so the owner's personal t.me account leaves the site). It changes body text
// only, on all ten pages: the shared footers name the phone and ceo@gptbot.uz
// instead of the personal Telegram; the two chat pages state their terms so
// they stay true before and after the paid AI pack opens (no «paid plan not
// launched», no «history stays in your browser», no promise to continue in the
// bot), their contact lines and noscript name phone and e-mail, and the Uzbek
// summary nav says «Biznes bot narxlari» (same href); the articles' consultation
// lines name e-mail instead of Telegram, and two articles get the contact card
// for their call to action; the homepage shell's demo links lead to a contact
// section. Title, H1, description, canonical, robots, hreflang and internal
// links of all ten pages are unchanged; reviewedChanges lists every diff and
// invisibleToGate what R1–R3 changed outside the gate (React screens, <head>
// handlers, JSON-LD, the login guide's chatgpt.com link, Markdown twins).
// The 2026-10-03-uzbek-login revision changes only the login article's body and
// internal links: the official route comes first, troubleshooting follows
// current primary sources, and the independent GPTBot guide is linked clearly.
// All search metadata and the other nine contracts stay unchanged. This body
// intervention is recorded separately from the pending C22 ownership decision.
// The 2026-10-12-r-s1 revision is the one revision of release R-S1 (SEO
// roadmap 2026-10-04 §2.2; owner decisions 1, 2, 3 and 5). The two chat pages
// get honest snippets with «muqobil / аналог» first, their H1 moves into the
// chat's first screen (the only <h1> sits in #gpt-chat-root, and the chat
// shows it on its resting screen), and the text under the chat gains a visible
// FAQ, an update date and the published free limits (15 a day, 5 an hour); the
// Uzbek chat also links the new slide guide and the insho/esse guide, the
// Russian chat links /ru/gpt-dlya-ucheby/. The login guide's
// title, description and H1 say chatgpt.com instead of «rasmiy sayt», with its
// sign-in facts re-checked. The homepage shell adds one line to both chats and
// the slide guide to its list; the VPN article's login anchor and business
// line change. Every page except the download guide also gets <!--email_off-->
// around its e-mail addresses (scripts/email-off.ts), which the contract does
// not see; the download guide stays byte for byte as it was, because its own
// P-CTR window is open. reviewedChanges and invisibleToGate list it all.
// The 2026-10-05-school revision adds the Uzbek referat and résumé guides. It
// changes one page: the homepage shell lists them (internalLinks +2, body
// text +2 lines); the other nine protected pages are byte-identical to the
// be2d2955 build, and their chat bridges stay outside the chat's code.
// The 2026-10-06-chat-design revision (the chat design release, owner order
// of 06.10; spec gptbot.uz-audit/raw/chat-design-2026-10-06/DESIGN-SPEC.md)
// changes one contract field on one page: the UZ chat's title (with og:title
// and twitter:title) becomes «ChatGPT o‘zbek tilida? Muqobil AI chat, bepul
// kirish» (strategy 2026-10-06 variant B). Every other field and the body
// text of all ten pages stay. Their HTML changes outside the gate: the
// chat's styles move into a stylesheet of their own that only the two chats
// link, so the shared sheet's name changes on all ten; the landing script's
// name on /; on both chats the prerendered frame inside #gpt-chat-root (the
// resting screen's geometry, its brand, subtitle and greeting drawn by CSS,
// no new text), the viewport's interactive-widget, modulepreload links and
// the summary's id="seo-summary". invisibleToGate lists it all with htmlSha256.
// The 2026-10-06-seo-push revision (owner order of 06.10: push the «ChatGPT
// o‘zbek tilida / uzbekcha» family, honestly; SEO strategy 2026-10-06 §3.2,
// R-S3 items brought forward) changes body text and links only. The UZ chat's
// #chatgpt-yozish grows to four paragraphs with three samples and one honest
// «ChatGPT o‘zbek tilida bormi?» (R3-4), its «Talaba…» section links the
// referat and résumé guides (R3-6); the login guide's clone section gains one
// sentence about domains with «chatgpt» in the name (R3-9); every site header
// names the chat of its language (R3-10, src/shared/site-chat-nav.ts) — on /
// and five protected articles that is the whole text change (the login guide
// also gains the R3-9 sentence). Title, H1, description, robots, canonical
// and hreflang of all ten are unchanged; the download guide (its P-CTR
// window) and the RU chat are byte for byte the same.
// The 2026-10-07-seo-traffic revision (owner order of 07.10 after the first SMM
// lead from chatgpt.com; gptbot.uz-audit/raw/seo-traffic-2026-10-07/
// TRAFFIC-PLAN.md §5) changes one page: the homepage shell lists the new
// Uzbek targeting page (moneyUz, by its H1), the three new Uzbek guides
// (blogUz, by title, newest first) and the new title of the Uzbek SMM price
// article (internalLinks 291 → 295, body text by those lines only). Title, H1,
// description, robots, canonical, hreflang, JSON-LD and <head> of / stay; the
// nine other protected pages, both chats included, are byte-identical to the
// production 5ad00a6c build.
// Production Meta 5bbfc97b + traffic b757615b: all reviewed contracts retained;
// nine protected HTML files are byte-identical to current production. The
// integration evidence records its actual HTML without rewriting old reviews.
// One-tap changes only asset hash references on the two chat pages; all
// contracts and the other eight protected HTML are production-identical.
// Owner's 08.10 product decision: 3 lifetime trial replies. Only two chat
// body fingerprints change; all ten metadata/link contracts stay unchanged.
// Previous revisions remain immutable; comparison records the reviewed diff.
// Recovery 08.10 corrects the two chat descriptions and bodies to the already
// released lifetime trial, separates PPTX mode and uses actual authored dates.
// All ten titles/H1s, canonical/robots/hreflang and link contracts stay. The
// new review records the predecessor hash; the comparator is unchanged.
// Recovery 23.10 separates the UZ product quick start from the official-login
// guide: only their body text and the guide's unrelated sales link change.
// All ten search metadata contracts and the download guide stay unchanged.
// The download guide now receives email_off comments, preventing the live
// edge from replacing contacts with crawler-facing 404 links. The new review
// records that technical intervention separately; old revisions stay immutable.
// The 2026-10-24-chat-snippets revision (owner order of 24.10: the R-S1 freeze
// is lifted for the two chats) changes four contract fields: title and
// description of /ru/gpt-chat/ and /uz/gpt-uzbek-tilida/. GSC showed that R-S1
// broadened RU impressions to KGZ/KAZ/TJK and misspellings at ~0.1% CTR and
// that the UZ chat lost its Uzbek-language queries; the RU title brings back
// «в Узбекистане», the UZ title leads with «ChatGPT uzbekcha». Both keep the
// trial terms and the independence clause. Body text, H1, links, dates and the
// other eight pages are unchanged; og/twitter tags, the WebPage JSON-LD and the
// Atom summary follow outside the gate.
// The 2026-10-24-wave1 revision (owner order of 24.10: growth backlog wave 1
// and the publication of the RU↔UZ translator pages) changes two contract
// fields on one page: the homepage shell lists the two published translator
// pages by H1 (internalLinks +2, body text by those two labels only; the HTML
// is otherwise byte for byte the predecessor's). Wave 1 edits no protected
// content file; the seven protected articles are byte-identical, and the two
// chats differ only by the chat bundle's name (translator merge 1a773ee2).
// BreadcrumbList names (W1-14), Clean-param (W1-12) and the llms/md
// Cache-Control detach (W1-13) stay outside the gate; invisibleToGate lists them.
// The 2026-10-24-wave1b revision (owner order of 24.10: growth backlog wave 1b,
// published now instead of after ≈07.11) changes the same two fields on the
// same page: the homepage shell lists the three new Uzbek guides (tavsifnoma,
// rasmiy xat, tabrik; by title, newest first) and the new H1 of
// /uz/telegram-bot-biznes-uchun/ (same href). internalLinks +3, body text by
// those four labels only; the HTML is otherwise the predecessor's byte for
// byte. The other nine protected pages are byte-identical. The llms-full
// superset (W2-07) and the dropped draft link in one Markdown twin stay outside
// the gate; invisibleToGate lists them.
// The 2026-10-25-ai-tools revision (owner order of 25.10: AI-tools wave A, every
// new page an AI tool of GPTBot.uz) changes the same two fields on the same
// page: the homepage shell lists the nine new tool pages (calculator, irregular
// verbs, Cyrillic-Latin converter in both languages, the Uzbek poem tool and the
// greeting generators; by H1) and the two Uzum seller guides (by title), and the
// retargeted /uz/gpt-telegram-instagram-ideya/ under its new H1 (same href).
// internalLinks +11, body text by those twelve labels only; the HTML is
// otherwise the predecessor's byte for byte. The seven protected articles are
// byte-identical; the two chats differ only by the chat bundle's name (platform
// commit af0446fe), which the generator puts back before it compares hashes.
// The 2026-10-25-ai-tools-b revision (owner order of 25.10: AI-tools wave B,
// every new page an AI tool of GPTBot.uz) changes the same two fields on the
// same page: the homepage shell lists the nine new tool pages (the Uzbek
// English-tenses hub with its Present Simple, Past Simple and Present
// Continuous pages, the Russian tenses hub, the tests hub and the informatika,
// fizika and matematika practice tests; by H1) and the four niche ad playbooks
// (clinic and learning centre, RU and UZ; by title). internalLinks +13, body
// text by those thirteen labels only; the HTML is otherwise the predecessor's
// byte for byte. The seven protected articles and the two chats are
// byte-identical: the practice-quiz widget (205461eb) is its own entry and the
// chat bundle keeps its name.
// The 2026-10-26-monetization revision (owner order of 26.10: the monetization
// roadmap's stages A and B) reviews no contract change: the release publishes
// no page and edits no protected content file, so the ten keep their contract
// and body text and the homepage lists stay as they are. Two shared script
// names move: the chats' bundle (the chat code of c377b572, 40fbefbb, fa309da1
// and 4d4c4e74) and the homepage's SPA entry (its lazy admin chunk changed in
// 87eb2728 and 40fbefbb); the generator puts each old name back and requires
// the predecessor's HTML byte for byte. The seven protected articles are
// byte-identical. The 54 changed unprotected pages, the sitemap lastmod of /
// and /ru/tarify-ai-chat/ and the updates feed stay outside the gate;
// invisibleToGate lists them.
// The 2026-10-26-contact revision (owner order of 26.10: «где мой номер —
// грамотно замени на мой Telegram, чтобы писали, а не звонили»; it supersedes
// decision L14, the owner names his Telegram account, site.json studioTelegram,
// as the public contact) changes one contract field, bodyTextSha256, on all ten, and only in
// contact surfaces: every footer names «Telegram» instead of the phone; the
// business contact lines of four articles and both chats, the #contact card of
// two articles, the chats' noscript line and, on /, the shell's contact line
// and the FAQ answer «Что будет после обращения?» invite to write in Telegram
// or by e-mail instead of calling. Title, H1, description, robots, canonical,
// hreflang, internal links and dates are unchanged on every page of the site.
// The Organization JSON-LD loses telephone and gains contactPoint customer
// support + e-mail + url Telegram; the chat bundle and the SPA entry move by
// name. The generator puts every reviewed swap and both names back and
// requires the predecessor's HTML byte for byte; reviewedChanges records the
// text steps, which replayed on the new body text give the old one.
// The 2026-10-26-address revision (owner, chat 26.10 with the TOP-3 roadmap
// order: «Адрес студии. В карточке Google указано «Kichik Xalqa Yo‘li 57»»,
// read as the answer to ROADMAP_TOP3.md §9 item 1; site.json address,
// streetAddress and geo follow the Google Business card) changes one contract
// field, bodyTextSha256, on all ten, by one text step each: the footer NAP line
// «Yahyo Gulyamov ko‘chasi 35» → «Kichik Xalqa Yo‘li 57». The Organization
// JSON-LD moves streetAddress and geo (41.334 / 69.286 → 41.3364 / 69.2723) and
// the homepage's SPA entry moves by name (Footer.tsx); the chats keep their
// bundle. Title, H1, description, robots, canonical, hreflang, internal links
// and dates of the ten are unchanged, and the landing footers' new «Разработка
// сайтов / Sayt yaratish» link reaches none of them. The generator puts the
// swaps and the entry name back and requires the predecessor's HTML byte for
// byte; across the site it also proves that no title, description, H1,
// canonical, robots or hreflang moves and that dates move only on the four
// TOP-3 pages with a new section and /ru/blog/.
// The 2026-10-26-rs1b revision is the one revision of release R-S1b (backlog
// W2-01; ROADMAP_TOP3.md §4.2 step 2.4 and §6 Т-08), shipped on the owner's
// order of 26.10 instead of ≈08.11. It changes two contract fields,
// internalLinks and bodyTextSha256, on three articles: the Claude article links
// the payment article in a new paragraph; the payment article links the Claude
// article in its link paragraph and, after the re-check against the OpenAI help
// center on 26.10, names the app publisher in both stores, says uninstalling the
// app «does not» cancel the subscription and moves its update date, dateModified
// and sources to 2026-10-26; promptlar links the ariza / tushuntirish xati guide
// in a new paragraph and names the insho/esse guide «insho va esse yozish» (H-5).
// The VPN article and ai-chat-nima change in JSON-LD only: with the three above
// they leave BREADCRUMB_NAME_HELD, so their BreadcrumbList gets a name, the H1.
// Title, H1, description, robots, canonical and hreflang of all ten are
// unchanged; the download guide, both chats, the login guide and the homepage
// are byte for byte the predecessor's (their own windows: R-S2 16.11, the chats
// and the login guide ≈25.11–02.12). The generator puts every reviewed swap back
// and requires the predecessor's HTML byte for byte; across the site it also
// proves that only /ru/blog/ (its «Недавно обновлённые» list) changes outside
// the ten and that every other file but the feeds, sitemaps, Markdown twins and
// llms-full is byte-identical.
export const BASELINE = 'docs/seo/evidence/2026-10-26-rs1b/reviewed-protected-pages.json';
export const PROTECTED_PATHS = [
  '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/',
  '/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/',
  '/ru/blog/chatgpt-i-claude-v-uzbekistane/',
  '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/',
  '/uz/blog/chatgptga-qanday-kirish-mumkin/',
  '/uz/blog/chatgpt-uzbek-tilida-promptlar/', '/',
  '/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/',
  '/uz/blog/ai-chat-nima-va-qanday-turlari-bor/',
] as const;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
const attr = (tag: string, key: string) => {
  const found = tag.match(new RegExp(`(?:^|\\s)${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return found ? found[1] ?? found[2] ?? found[3] : '';
};

/** Extract the stable search-facing contract from this site's generated HTML.
 * Scripts/styles/comments are deliberately excluded from the text fingerprint.
 * This is a regression gate for our prerenderer, not a general HTML validator.
 */
export function seoContract(html: string) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const head = clean.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map(m => m[0]);
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]);
  const textHtml = clean.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const body = textHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '';
  const bodyText = normalize(body.replace(/<[^>]*>/g, ' '));
  const meta = (name: string) => metas.filter(t => attr(t, 'name').toLowerCase() === name).map(t => attr(t, 'content'));
  return {
    title: [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map(m => normalize(m[1])),
    h1: [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => normalize(m[1].replace(/<[^>]*>/g, ' '))),
    description: meta('description'), robots: meta('robots'), googlebot: meta('googlebot'),
    canonical: links.filter(t => attr(t, 'rel').toLowerCase() === 'canonical').map(t => attr(t, 'href')),
    hreflang: links.filter(t => attr(t, 'hreflang')).map(t => `${attr(t, 'hreflang')} ${attr(t, 'href')}`).sort(),
    internalLinks: [...new Set([...body.matchAll(/<a\b[^>]*>/gi)].map(m => attr(m[0], 'href'))
      .filter(href => /^\/(?!\/)|^https:\/\/gptbot\.uz(?:\/|$)/.test(href)))].sort(),
    bodyTextSha256: sha(bodyText),
  };
}
type Contract = ReturnType<typeof seoContract>;
type Snapshot = { schema: 1; capturedAt: string; pages: Array<{ pathname: string; contract: Contract; bodyText: string }> };

export function assertSeoProtection(dist: string, baselineFile = path.join(ROOT, BASELINE)): void {
  const snapshot = JSON.parse(fs.readFileSync(baselineFile, 'utf8')) as Snapshot;
  if (snapshot.schema !== 1 || !Array.isArray(snapshot.pages)
    || snapshot.pages.length !== PROTECTED_PATHS.length
    || new Set(snapshot.pages.map(p => p.pathname)).size !== PROTECTED_PATHS.length
    || PROTECTED_PATHS.some(p => !snapshot.pages.some(row => row.pathname === p))) {
    throw new Error('Invalid protected SEO baseline; all ten traffic leaders are required.');
  }
  const failures: string[] = [];
  for (const page of snapshot.pages) {
    const filename = path.join(dist, page.pathname.slice(1), 'index.html');
    if (!fs.existsSync(filename)) { failures.push(`${page.pathname}: missing HTML`); continue; }
    const current = seoContract(fs.readFileSync(filename, 'utf8'));
    for (const key of Object.keys(current) as Array<keyof Contract>) {
      if (JSON.stringify(current[key]) !== JSON.stringify(page.contract[key])) failures.push(`${page.pathname}: ${key}`);
    }
  }
  if (failures.length) throw new Error(`Protected SEO changed. Review the actual diff and evidence before updating the baseline:\n${failures.join('\n')}`);
}

async function capture(): Promise<void> {
  const target = path.join(ROOT, BASELINE);
  if (fs.existsSync(target)) throw new Error('Baseline already exists; capture never silently replaces reviewed evidence.');
  const pages = [];
  for (const pathname of PROTECTED_PATHS) {
    const url = `https://gptbot.uz${pathname}`;
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (res.status !== 200 || !res.headers.get('content-type')?.includes('text/html')
      || /noindex|none/i.test(res.headers.get('x-robots-tag') || '')) throw new Error(`Unhealthy protected URL: ${pathname}`);
    const html = await res.text();
    const contract = seoContract(html);
    if (contract.title.length !== 1 || contract.h1.length !== 1 || contract.canonical.length !== 1
      || contract.canonical[0] !== url || contract.robots.some(v => /noindex|none/i.test(v))) {
      throw new Error(`Invalid SEO contract: ${pathname}`);
    }
    const styles = stylesheetHrefs(html);
    if (!styles.length) throw new Error(`No public stylesheet: ${pathname}`);
    for (const href of styles) {
      const css = await fetch(new URL(href, url), { signal: AbortSignal.timeout(20000) });
      if (css.status !== 200 || !css.headers.get('content-type')?.includes('text/css') || !(await css.text()).trim()) {
        throw new Error(`Broken stylesheet: ${pathname}`);
      }
    }
    const bodyText = normalize(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]?.replace(/<[^>]*>/g, ' ') ?? '');
    pages.push({ pathname, status: res.status, xRobotsTag: res.headers.get('x-robots-tag'), styles, htmlSha256: sha(html), contract, bodyText });
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({ schema: 1, capturedAt: new Date().toISOString(), source: 'Live HTTP HTML, before JavaScript; GSC top ten pages, last 28 days viewed 2026-09-06', pages }, null, 2) + '\n', { flag: 'wx' });
  console.log(`Captured ${pages.length} protected pages; HTML and CSS return 200.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  (async () => {
    if (process.argv[2] === 'capture') await capture();
    else if (process.argv[2] === 'check') { assertSeoProtection(path.join(ROOT, 'dist')); console.log('Protected SEO: 10/10 unchanged.'); }
    else throw new Error('Usage: seo-protection.ts capture|check');
  })().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'SEO protection failed'); process.exitCode = 1; });
}
