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
import { i18n } from '../src/i18n';
import {
  buildOrganizationLd,
  buildWebSiteLd,
  buildServiceLd,
  buildWebPageLd,
  buildAuthorPersonLd,
} from './jsonld-helpers';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const DIST_INDEX = path.join(ROOT, 'dist', 'index.html');

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// For visible element text content. Apostrophes are legitimate in Uzbek Latin and
// must NOT become &#39; — only & and < are unsafe inside text nodes.
function escapeText(s: string): string {
  return (s || '').replace(/[&<]/g, (c) => ({ '&': '&amp;', '<': '&lt;' }[c]!));
}

function load<T>(glob: string): T[] {
  return fg.sync(glob, { cwd: CONTENT_DIR, absolute: true }).map((f) => JSON.parse(fs.readFileSync(f, 'utf-8'))) as T[];
}

// The Russian homepage copy the visitor actually reads. The shell must never
// claim anything the mounted React landing does not say, so every string below
// comes from src/i18n.ts — the same single source the components render.
const RU = i18n.ru;

// Hero visual, mirroring src/components/PremiumImage.tsx byte for byte in the
// candidate it selects: same widths, same `sizes`, same eager/high hints. A
// crawler that does not execute JavaScript saw no <img> at all until now — and
// <link rel="preload" as="image"> in index.html had no element to hand its
// bytes to. Identical srcset + sizes means the browser resolves the shell copy
// and the React copy to one URL, so a real visitor still downloads it once.
const HERO_NAME = 'ai-sales-assistant-workspace';
const HERO_WIDTHS = [480, 800, 1280, 1536] as const;
const HERO_SIZES = '(max-width: 1024px) 90vw, 40vw';
const HERO_ALT =
  'AI-бот GPTBot квалифицирует обращения из Instagram и Telegram и передаёт заявку менеджеру';

function heroSrcSet(extension: 'avif' | 'webp'): string {
  return HERO_WIDTHS.map((w) => `/assets/landing/premium/${HERO_NAME}-${w}.${extension} ${w}w`).join(', ');
}

function heroPicture(): string {
  return `<picture>
      <source type="image/avif" srcset="${escapeHtml(heroSrcSet('avif'))}" sizes="${escapeHtml(HERO_SIZES)}" />
      <source type="image/webp" srcset="${escapeHtml(heroSrcSet('webp'))}" sizes="${escapeHtml(HERO_SIZES)}" />
      <img src="/assets/landing/premium/${HERO_NAME}-800.webp" srcset="${escapeHtml(heroSrcSet('webp'))}" sizes="${escapeHtml(HERO_SIZES)}" alt="${escapeHtml(HERO_ALT)}" width="1536" height="960" loading="eager" decoding="sync" fetchpriority="high" />
    </picture>`;
}

function list(items: readonly string[]): string {
  return `<ul>${items.map((i) => `<li>${escapeText(i)}</li>`).join('')}</ul>`;
}

function definitions(items: readonly { t: string; d: string }[]): string {
  return `<dl>${items.map((i) => `<dt>${escapeText(i.t)}</dt><dd>${escapeText(i.d)}</dd>`).join('')}</dl>`;
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
    .map((p) => `<li><a href="${escapeHtml(p.url)}">${escapeText(p.h1 || p.title)}</a></li>`)
    .join('');
  const moneyListUz = liveMoneyUz
    .map((p) => `<li><a href="${escapeHtml(p.url)}" hreflang="uz">${escapeText(p.h1 || p.title)}</a></li>`)
    .join('');
  const blogList = liveBlog
    .map((a) => `<li><a href="${escapeHtml(a.url)}">${escapeText(a.title || a.h1)}</a></li>`)
    .join('');
  const blogListUz = liveBlogUz
    .map((a) => `<li><a href="${escapeHtml(a.url)}" hreflang="uz">${escapeText(a.title || a.h1)}</a></li>`)
    .join('');

  const cta = global.defaultCTA || { label: 'Запустить демо в Telegram', href: 'https://t.me/XGame_changerx' };

  // Single self-contained fallback block. index.html contains a tiny critical
  // first-paint guard that hides it while JavaScript is enabled; a noscript
  // override keeps this semantic content available when React cannot mount.
  return `
<div data-seo-shell="homepage" data-testid="seo-shell">
  <header>
    <a href="/">GPTBot.uz</a>
    <nav aria-label="Primary">
      <a href="/ru/ai-bot-dlya-biznesa/">Решения</a>
      <a href="/ru/ai-bot-dlya-kliniki/">Ниши</a>
      <a href="/ru/blog/">Блог</a>
      <a href="${escapeHtml(cta.href)}">${escapeText(cta.label)}</a>
    </nav>
  </header>

  <main>
    <h1>GPTBot.uz — AI-бот для бизнеса в Узбекистане, который не теряет заявки</h1>
    <p>AI/GPT-менеджер для Instagram и Telegram. Отвечает клиентам 24/7, собирает имя и телефон, передаёт горячие заявки вашему менеджеру. Демо под вашу нишу.</p>

    ${heroPicture()}

    ${list(RU.hero.bullets)}

    <p><a href="${escapeHtml(cta.href)}" rel="noopener noreferrer">${escapeText(cta.label)}</a></p>

    <section aria-label="Проблема">
      <h2>${escapeText(RU.pain.h)}</h2>
      <p>${escapeText(RU.pain.t)}</p>
      ${list(RU.pain.cards)}
    </section>

    <section aria-label="Решение">
      <h2>${escapeText(RU.solution.h)}</h2>
      <p>${escapeText(RU.solution.t)}</p>
      ${definitions(RU.solution.benefits)}
    </section>

    <section aria-label="Как это работает">
      <h2>${escapeText(RU.how.h)}</h2>
      <ol>${RU.how.steps.map((s) => `<li><strong>${escapeText(s.t)}</strong> — ${escapeText(s.d)}</li>`).join('')}</ol>
    </section>

    <section aria-label="Ниши">
      <h2>${escapeText(RU.niches.h)}</h2>
      <p>${escapeText(RU.niches.sub)}</p>
      ${list(RU.niches.items)}
    </section>

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
      <p>O&#8216;zbek tilida: <a href="/uz/blog/" hreflang="uz">GPTBot.uz blogi (UZ)</a></p>
      <ul>${moneyListUz}</ul>
    </section>

    <section aria-label="GPTBot.uz blogi (UZ)" lang="uz">
      <h2>GPTBot.uz blogi — o&#8216;zbek tilida</h2>
      <ul>${blogListUz}</ul>
    </section>

    <section id="faq" aria-label="${escapeHtml(RU.faq.h)}">
      <h2>${escapeText(RU.faq.h)}</h2>
      ${RU.faq.items.map((f) => `<h3>${escapeText(f.q)}</h3><p>${escapeText(f.a)}</p>`).join('\n      ')}
    </section>
  </main>

  <footer>
    <p>GPTBot.uz · ${escapeHtml(global.address || 'Tashkent, Uzbekistan')}</p>
    <!-- NAP: the phone belongs here too, same as the real footer and the sticky
         bar. This shell is the no-JS / crawler view of the homepage, so it is
         the only NAP a crawler that does not execute JavaScript will ever see.
         No gtag handler on purpose: this block is only visible when JavaScript
         is unavailable, so any onclick here would be dead code. -->
    <p>
      <a data-testid="footer-call-cta" href="tel:+998505870720">+998 50 587 07 20</a>
      ·
      <a href="${escapeHtml(global.telegram || '#')}" rel="noopener noreferrer">Telegram</a>
    </p>
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

  let html = fs.readFileSync(DIST_INDEX, 'utf-8');
  const shell = buildSeoShell(global, pages, blog);

  // 1) Inject the SEO content shell INSIDE <div id="root">.
  const marker = '<div id="root"></div>';
  if (!html.includes(marker)) {
    console.warn('prerender-home: marker <div id="root"></div> not found — skipping shell injection.');
  } else {
    html = html.replace(marker, `<div id="root">${shell}\n</div>`);
  }

  // 2) Replace the minimal homepage JSON-LD with the production-grade
  //    @graph (Organization+ProfessionalService, WebSite, WebPage, Service).
  //    Keeps @id stable across every page so AI/search engines collapse the
  //    triples into a single canonical entity.
  // The homepage declares its share image in index.html, not in content JSON,
  // so WebPage.primaryImageOfPage used to fall back to global.defaultOgImage
  // (/assets/landing/og.jpg) and name a different picture than the og:image
  // meta tag on the same URL. Two representative images for one document is a
  // contradiction a crawler has to resolve by guessing. Read the value that is
  // actually delivered instead; the global default stays as the fallback.
  const declaredOgImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  const homeAuthor = buildAuthorPersonLd(global);
  const richGraph: Record<string, unknown>[] = [
    buildOrganizationLd(global),
    ...(homeAuthor ? [homeAuthor] : []),
    buildWebSiteLd(global),
    buildWebPageLd({
      global,
      url: '/',
      name: global.siteName,
      description: global.defaultDescription,
      locale: 'ru',
      primaryImage: declaredOgImage || global.defaultOgImage,
    }),
    buildServiceLd({
      global,
      url: '/',
      name: 'AI-бот для бизнеса в Узбекистане',
      description: 'AI/GPT-менеджер для Instagram Direct и Telegram, который отвечает клиентам 24/7 на русском и узбекском, собирает имя и телефон и передаёт горячую заявку менеджеру через CRM или Telegram-уведомление.',
      serviceType: 'AI-бот для бизнеса',
      locale: 'ru',
    }),
    // FAQPage. Every landing page has carried one; the homepage — the most
    // linked and most cited document on the domain — did not, because its
    // questions live in the React <FAQ> component and never reached the raw
    // HTML. The five pairs below are the exact strings the visitor reads
    // (src/i18n.ts faq.items, rendered by src/components/FAQ.tsx) and are now
    // also in the crawler shell above, so the markup and the visible text say
    // the same thing.
    {
      '@type': 'FAQPage',
      '@id': `${global.siteUrl}/#faq`,
      inLanguage: 'ru',
      mainEntity: RU.faq.items.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];
  const richLdScript = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': richGraph })}</script>`;
  // Match the exact block emitted by /index.html — start at the marker
  // comment, end at the closing </script> that follows.
  const ldStart = html.indexOf('<!-- JSON-LD:');
  const ldEnd = ldStart === -1 ? -1 : html.indexOf('</script>', ldStart);
  if (ldStart === -1 || ldEnd === -1) {
    console.warn('prerender-home: JSON-LD marker not found in index.html — skipping schema upgrade.');
  } else {
    html = html.slice(0, ldStart)
      + `<!-- JSON-LD: Organization (ProfessionalService), WebSite, WebPage, Service. Upgraded by scripts/prerender-home.ts -->\n    ${richLdScript}`
      + html.slice(ldEnd + '</script>'.length);
  }

  fs.writeFileSync(DIST_INDEX, html, 'utf-8');
  const liveMoneyCount = pages.filter((p) => p.status === 'published' && p.robotsIndex !== false && p.locale === 'ru' && p.pageType !== 'homepage').length;
  const liveBlogCount = blog.filter((a) => a.status === 'published' && a.robotsIndex !== false && a.locale === 'ru').length;
  console.log(`Homepage SEO shell injected: ${liveMoneyCount} money links + ${liveBlogCount} blog links. JSON-LD upgraded to @graph(Organization+WebSite+WebPage+Service).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
