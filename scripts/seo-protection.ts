import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stylesheetHrefs } from './site-stylesheets';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// The original live capture remains immutable. This revision contains only the
// three reviewed navigation changes and the provider-fact correction documented
// alongside the snapshot. Search metadata and the other seven pages are unchanged.
export const BASELINE = 'docs/seo/evidence/2026-09-06/reviewed-protected-pages.json';
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
