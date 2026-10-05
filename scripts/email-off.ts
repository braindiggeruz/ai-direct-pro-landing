// Keeps Cloudflare Email Address Obfuscation away from the studio address.
//
// The zone has Scrape Shield → Email Address Obfuscation on. At the edge it
// rewrites every e-mail address it finds in an HTML body: a mailto: link
// becomes href="/cdn-cgi/l/email-protection#…", a visible address becomes
// <span class="__cf_email__" data-cfemail="…">[email protected]</span>, and
// the page gets the decode script /cdn-cgi/scripts/…/email-decode.min.js.
// The site audit of 2026-10-04 counted 286 pages with a link to
// /cdn-cgi/l/email-protection, which answers 404 to a crawler — the only
// "critical" finding of that audit (seo-2026-10-04 technical/NOTES.md §2).
//
// Cloudflare's documented opt-out is an HTML comment pair around the address:
//   <!--email_off-->contact@example.com<!--/email_off-->
// It does not touch addresses inside <script>, <noscript>, <textarea>, <xmp>
// or <head>, nor in any attribute except the href of <a>
// (https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/,
// checked 2026-10-04). withEmailOff() therefore wraps exactly what the edge
// would rewrite: each <a href="mailto:…">…</a> as one piece (its href and its
// text), and each address in a text node. It never writes inside a tag, a
// comment, a script or the <head>.
//
// The comments are invisible to scripts/seo-protection.ts (seoContract strips
// comments before it fingerprints a page), but they change the bytes of the
// HTML, so every page they reach is a release of that page (roadmap R-S1,
// item 2.6; CHANGE_LOG lists it under invisibleToGate).
//
// EMAIL_OFF_EXCLUDED_PATHS: pages whose HTML must not change in this release.
// The download guide has its own P-CTR window open (release 30.09/01.10, read
// ≈06–10.11); any byte of HTML there, this wrapper included, would leave that
// reading without a verdict. It keeps the obfuscated links until R-S2
// (≈16.11), which removes it from this set in the same revision.
import { PROTECTED_PATHS } from './seo-protection';

export const EMAIL_OFF_EXCLUDED_PATHS: ReadonlySet<string> = new Set([
  '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/',
]);

for (const excluded of EMAIL_OFF_EXCLUDED_PATHS) {
  if (!(PROTECTED_PATHS as readonly string[]).includes(excluded)) {
    throw new Error(`email-off: ${excluded} is not a protected page; only a protected page can be held back.`);
  }
}

export const EMAIL_OFF = '<!--email_off-->';
export const EMAIL_ON = '<!--/email_off-->';

// Regions the edge leaves alone, and that a comment must never be written
// into: comments, <script>, <style>, <noscript>, <textarea>, <xmp>, <template>
// and the whole <head>. `<head\b` does not match `<header`.
const UNTOUCHED = /<!--[\s\S]*?-->|<(script|style|noscript|textarea|xmp|template)\b[\s\S]*?<\/\1\s*>|<head\b[\s\S]*?<\/head\s*>/gi;
const MAILTO_LINK = /<a\b[^>]*?\bhref\s*=\s*(["'])\s*mailto:[^"']*\1[^>]*>[\s\S]*?<\/a\s*>/gi;
const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Wrap addresses that stand in text nodes; tags and their attributes are left as they are. */
function wrapTextNodes(html: string): string {
  return html.replace(/(^|>)([^<]+)/g, (_m, lead: string, text: string) =>
    lead + text.replace(ADDRESS, (address) => `${EMAIL_OFF}${address}${EMAIL_ON}`));
}

function wrapLive(segment: string): string {
  let out = '';
  let last = 0;
  for (const link of segment.matchAll(MAILTO_LINK)) {
    const at = link.index ?? 0;
    out += wrapTextNodes(segment.slice(last, at)) + EMAIL_OFF + link[0] + EMAIL_ON;
    last = at + link[0].length;
  }
  return out + wrapTextNodes(segment.slice(last));
}

const WRAPPED = new RegExp(`${EMAIL_OFF}[\\s\\S]*?${EMAIL_ON}`, 'g');

/**
 * What the edge would still rewrite in a finished page: every mailto: link and
 * every address in a text node that stands outside <!--email_off-->. Empty for
 * a page withEmailOff() has processed; the evidence check and the build-output
 * test run it over dist/.
 */
export function addressesLeftForTheEdge(html: string): string[] {
  const rest = html.replace(WRAPPED, '').replace(UNTOUCHED, '');
  const left: string[] = [];
  for (const link of rest.matchAll(MAILTO_LINK)) left.push(link[0]);
  for (const node of rest.replace(MAILTO_LINK, '').matchAll(/(?:^|>)([^<]+)/g)) {
    left.push(...(node[1].match(ADDRESS) ?? []));
  }
  return left;
}

/**
 * The document with every mailto: link and every visible address wrapped in
 * <!--email_off--> … <!--/email_off-->, or the document unchanged for a page
 * in EMAIL_OFF_EXCLUDED_PATHS. `pathname` is the page URL as content declares
 * it ("/", "/uz/", "/ru/blog/…/").
 */
export function withEmailOff(html: string, pathname: string): string {
  if (EMAIL_OFF_EXCLUDED_PATHS.has(pathname)) return html;
  if (html.includes(EMAIL_OFF)) {
    throw new Error(`email-off: ${pathname} is already wrapped; withEmailOff must run once, at write time.`);
  }
  let out = '';
  let last = 0;
  for (const region of html.matchAll(UNTOUCHED)) {
    const at = region.index ?? 0;
    out += wrapLive(html.slice(last, at)) + region[0];
    last = at + region[0].length;
  }
  return out + wrapLive(html.slice(last));
}
