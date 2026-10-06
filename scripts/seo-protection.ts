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
// The 2026-10-06-chat-design revision (chat UX plan REV-1…REV-10, REV-13)
// changes no contract field and no body text on any of the ten pages. It is
// a revision because their HTML changes: the shared stylesheet's name on all
// ten (the chat's new rules in premium.css), the landing script's name on /,
// and on both chats the prerendered frame inside #gpt-chat-root (the chat's
// own header, H1, card and composer outlines, no new text), three <head>
// tags (viewport interactive-widget, theme-color, modulepreload) and the
// summary's id="seo-summary". invisibleToGate lists it all with htmlSha256.
export const BASELINE = 'docs/seo/evidence/2026-10-06-chat-design/reviewed-protected-pages.json';
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
