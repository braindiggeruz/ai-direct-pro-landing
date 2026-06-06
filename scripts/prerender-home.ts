// Build-time homepage SEO injection.
//
// PROBLEM:
//   /dist/index.html (the homepage entry that Cloudflare Pages serves at "/")
//   ships with an empty <body><div id="root"></div></body>. The React landing
//   renders client-side, so Googlebot / Bing / Yandex / social-media crawlers
//   that fetch the raw HTML see zero textual content and zero internal links.
//   That cripples the homepage's PageRank flow into the 25 money pages and
//   16 blog articles even though every leaf page is fully prerendered.
//
// FIX (minimal, safe):
//   Inject a structured SEO content block INSIDE <div id="root"> at build
//   time. React 19's createRoot().render() replaces children on mount, so
//   the visible UI never changes for real users — but every crawler that
//   reads the raw HTML now sees an H1, hero copy, primary CTA, and an
//   indexable link to every published money page + every published blog
//   article. We keep the existing <head> (canonical, hreflang, Org+WebSite
//   JSON-LD, OG/Twitter) untouched.
//
//   NO redesign. NO new components. NO new routes. NO global SPA wildcard.
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { Page, BlogArticle, GlobalSEO } from '../src/shared/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const DIST_INDEX = path.join(ROOT, 'dist', 'index.html');

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function load<T>(glob: string): T[] {
  return fg.sync(glob, { cwd: CONTENT_DIR, absolute: true }).map((f) => JSON.parse(fs.readFileSync(f, 'utf-8'))) as T[];
}

function buildSeoShell(global: GlobalSEO, pages: Page[], blog: BlogArticle[]): string {
  const liveMoney = pages
    .filter((p) => p.status === 'published' && p.robotsIndex !== false && p.locale === 'ru' && p.pageType !== 'homepage')
    .sort((a, b) => a.url.localeCompare(b.url));
  const liveMoneyUz = pages
    .filter((p) => p.status === 'published' && p.robotsIndex !== false && p.locale === 'uz' && p.pageType !== 'homepage')
    .sort((a, b) => a.url.localeCompare(b.url));
  const liveBlog = blog
    .filter((a) => a.status === 'published' && a.robotsIndex !== false && a.locale === 'ru')
    .sort((a, b) => (b.datePublished || '').localeCompare(a.datePublished || ''));
  const liveBlogUz = blog
    .filter((a) => a.status === 'published' && a.robotsIndex !== false && a.locale === 'uz')
    .sort((a, b) => (b.datePublished || '').localeCompare(a.datePublished || ''));

  const moneyList = liveMoney
    .map((p) => `<li><a href="${escapeHtml(p.url)}">${escapeHtml(p.h1 || p.title)}</a></li>`)
    .join('');
  const moneyListUz = liveMoneyUz
    .map((p) => `<li><a href="${escapeHtml(p.url)}" hreflang="uz">${escapeHtml(p.h1 || p.title)}</a></li>`)
    .join('');
  const blogList = liveBlog
    .map((a) => `<li><a href="${escapeHtml(a.url)}">${escapeHtml(a.title || a.h1)}</a></li>`)
    .join('');
  const blogListUz = liveBlogUz
    .map((a) => `<li><a href="${escapeHtml(a.url)}" hreflang="uz">${escapeHtml(a.title || a.h1)}</a></li>`)
    .join('');

  const cta = global.defaultCTA || { label: 'Запустить демо в Telegram', href: 'https://t.me/XGame_changerx' };

  // Single self-contained block. No inline styles that could clash with
  // React-rendered UI (React replaces this entire subtree on mount). Crawlers
  // only need the text + anchors, so we keep it semantically clean.
  return `
<div data-seo-shell="homepage" data-testid="seo-shell">
  <header>
    <a href="/">GPTBot</a>
    <nav aria-label="Primary">
      <a href="/ru/ai-bot-dlya-biznesa/">Решения</a>
      <a href="/ru/ai-bot-dlya-kliniki/">Ниши</a>
      <a href="/ru/blog/">Блог</a>
      <a href="${escapeHtml(cta.href)}">${escapeHtml(cta.label)}</a>
    </nav>
  </header>

  <main>
    <h1>GPTBot — AI-бот для бизнеса в Узбекистане, который не теряет заявки</h1>
    <p>AI/GPT-менеджер для Instagram и Telegram. Отвечает клиентам 24/7, собирает имя и телефон, передаёт горячие заявки вашему менеджеру. Демо под вашу нишу.</p>

    <p><a href="${escapeHtml(cta.href)}" rel="noopener">${escapeHtml(cta.label)}</a></p>

    <section aria-label="Решения">
      <h2>AI-бот для бизнеса — решения по нишам</h2>
      <ul>${moneyList}</ul>
    </section>

    <section aria-label="Блог">
      <h2>Полезные материалы и блог</h2>
      <p><a href="/ru/blog/">Все статьи блога</a></p>
      <ul>${blogList}</ul>
    </section>

    <section aria-label="Biznes uchun yechimlar (UZ)" lang="uz">
      <h2>Biznes uchun yechimlar — O&#8216;zbekiston</h2>
      <p>O&#8216;zbek tilida: <a href="/uz/blog/" hreflang="uz">GPTBot blogi (UZ)</a></p>
      <ul>${moneyListUz}</ul>
    </section>

    <section aria-label="GPTBot blogi (UZ)" lang="uz">
      <h2>GPTBot blogi — o&#8216;zbek tilida</h2>
      <ul>${blogListUz}</ul>
    </section>
  </main>

  <footer>
    <p>GPTBot · ${escapeHtml(global.address || 'Tashkent, Uzbekistan')}</p>
    <p><a href="${escapeHtml(global.telegram || '#')}" rel="noopener">Telegram</a></p>
  </footer>
</div>`;
}

async function main(): Promise<void> {
  if (!fs.existsSync(DIST_INDEX)) {
    console.error(`prerender-home: ${DIST_INDEX} not found — run vite build first.`);
    process.exit(1);
  }
  const global = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'global', 'site.json'), 'utf-8')) as GlobalSEO;
  const pages = load<Page>('pages/**/*.json');
  const blog = load<BlogArticle>('blog/**/*.json');

  const html = fs.readFileSync(DIST_INDEX, 'utf-8');
  const shell = buildSeoShell(global, pages, blog);

  // Replace exactly <div id="root"></div> with <div id="root">{shell}</div>.
  // Be conservative: if the marker is not exactly that, do nothing.
  const marker = '<div id="root"></div>';
  if (!html.includes(marker)) {
    console.warn('prerender-home: marker <div id="root"></div> not found — skipping (no change).');
    return;
  }
  const next = html.replace(marker, `<div id="root">${shell}\n</div>`);
  fs.writeFileSync(DIST_INDEX, next, 'utf-8');
  const liveMoneyCount = pages.filter((p) => p.status === 'published' && p.robotsIndex !== false && p.locale === 'ru' && p.pageType !== 'homepage').length;
  const liveBlogCount = blog.filter((a) => a.status === 'published' && a.robotsIndex !== false && a.locale === 'ru').length;
  console.log(`Homepage SEO shell injected: ${liveMoneyCount} money links + ${liveBlogCount} blog links.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
