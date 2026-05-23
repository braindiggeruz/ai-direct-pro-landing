// SEO audit / score computation. Used by:
//  - admin UI (per-field live warnings + page score badge)
//  - Cloudflare Functions /api/audit (cockpit stats)
//  - FastAPI dev mirror /api/audit
//  - build-time `yarn seo:audit` script
//
// Rules taken from "Step 3. SEO COCKPIT" of the brief.

import type {
  Page,
  AuditIssue,
  PageAuditResult,
  CockpitStats,
  GlobalSEO,
} from './types';

export const RULES = {
  titleMin: 45,
  titleMax: 65,
  descriptionMin: 120,
  descriptionMax: 160,
  minOutgoingInternalLinks: 3,
  minIncomingInternalLinksMoney: 2,
  minFaqMoney: 4,
  minFaqBlog: 3,
} as const;

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function auditPage(page: Page, ctx: { allPages?: Page[]; global?: GlobalSEO } = {}): PageAuditResult {
  const issues: AuditIssue[] = [];
  const { allPages = [], global } = ctx;

  // --- Title checks ----------------------------------------------------------
  if (!page.title || !page.title.trim()) {
    issues.push({ level: 'error', rule: 'missing-title', field: 'title', message: 'Title is empty.' });
  } else {
    if (page.title.length < RULES.titleMin) {
      issues.push({ level: 'warning', rule: 'short-title', field: 'title',
        message: `Title is ${page.title.length} chars (recommended ${RULES.titleMin}–${RULES.titleMax}).` });
    } else if (page.title.length > RULES.titleMax) {
      issues.push({ level: 'warning', rule: 'long-title', field: 'title',
        message: `Title is ${page.title.length} chars (recommended ${RULES.titleMin}–${RULES.titleMax}).` });
    }
    if (page.primaryKeyword && !page.title.toLowerCase().includes(page.primaryKeyword.toLowerCase())) {
      issues.push({ level: 'warning', rule: 'title-missing-keyword', field: 'title',
        message: `Title does not contain primary keyword "${page.primaryKeyword}".` });
    }
    const dup = allPages.filter((p) => p.url !== page.url && p.status === 'published' && p.title === page.title);
    if (dup.length > 0) {
      issues.push({ level: 'error', rule: 'duplicate-title', field: 'title',
        message: `Title duplicates ${dup.length} other published page(s).` });
    }
  }

  // --- Description checks ----------------------------------------------------
  if (!page.description || !page.description.trim()) {
    issues.push({ level: 'error', rule: 'missing-description', field: 'description', message: 'Description is empty.' });
  } else {
    if (page.description.length < RULES.descriptionMin) {
      issues.push({ level: 'warning', rule: 'short-description', field: 'description',
        message: `Description is ${page.description.length} chars (recommended ${RULES.descriptionMin}–${RULES.descriptionMax}).` });
    } else if (page.description.length > RULES.descriptionMax) {
      issues.push({ level: 'warning', rule: 'long-description', field: 'description',
        message: `Description is ${page.description.length} chars (recommended ${RULES.descriptionMin}–${RULES.descriptionMax}).` });
    }
    const dup = allPages.filter(
      (p) => p.url !== page.url && p.status === 'published' && p.description === page.description,
    );
    if (dup.length > 0) {
      issues.push({ level: 'error', rule: 'duplicate-description', field: 'description',
        message: `Description duplicates ${dup.length} other published page(s).` });
    }
  }

  // --- H1 ---------------------------------------------------------------------
  if (!page.h1 || !page.h1.trim()) {
    issues.push({ level: 'error', rule: 'missing-h1', field: 'h1', message: 'H1 is empty.' });
  }

  // --- Canonical --------------------------------------------------------------
  if (!page.canonical) {
    issues.push({ level: 'error', rule: 'missing-canonical', field: 'canonical', message: 'Canonical is empty.' });
  } else if (allPages.length && !page.canonical.endsWith(page.url) && page.canonical !== page.url) {
    // canonical must either self-reference or point to a real page
    const canonicalSlug = page.canonical.replace(/^https?:\/\/[^/]+/, '');
    const found = allPages.find((p) => p.url === canonicalSlug);
    if (!found) {
      issues.push({ level: 'warning', rule: 'canonical-target-missing', field: 'canonical',
        message: `Canonical target "${canonicalSlug}" does not match any known page.` });
    }
  }

  // --- hreflang ---------------------------------------------------------------
  if (!page.hreflangRu && !page.hreflangUz) {
    issues.push({ level: 'warning', rule: 'missing-hreflang', field: 'hreflangRu',
      message: 'Both RU and UZ hreflang are empty.' });
  } else if (allPages.length) {
    const pairUrl = page.locale === 'ru' ? page.hreflangUz : page.hreflangRu;
    if (pairUrl) {
      const pair = allPages.find((p) => p.url === pairUrl.replace(/^https?:\/\/[^/]+/, ''));
      if (!pair) {
        issues.push({ level: 'warning', rule: 'hreflang-target-missing',
          message: `hreflang ${page.locale === 'ru' ? 'UZ' : 'RU'} pair "${pairUrl}" not found.` });
      } else {
        const backref = page.locale === 'ru' ? pair.hreflangRu : pair.hreflangUz;
        if (!backref || backref.replace(/^https?:\/\/[^/]+/, '') !== page.url) {
          issues.push({ level: 'warning', rule: 'hreflang-not-bidirectional',
            message: `hreflang pair "${pair.url}" does not point back to this page.` });
        }
      }
    }
  }

  // --- Open Graph -------------------------------------------------------------
  const ogTitle = page.ogTitle || page.title;
  const ogDesc = page.ogDescription || page.description;
  const ogImg = page.ogImage || global?.defaultOgImage;
  if (!ogTitle) issues.push({ level: 'warning', rule: 'missing-og-title', field: 'ogTitle', message: 'OG title missing.' });
  if (!ogDesc) issues.push({ level: 'warning', rule: 'missing-og-description', field: 'ogDescription', message: 'OG description missing.' });
  if (!ogImg) issues.push({ level: 'warning', rule: 'missing-og-image', field: 'ogImage', message: 'OG image missing.' });

  // --- JSON-LD ----------------------------------------------------------------
  if (!page.schemaTypes || page.schemaTypes.length === 0) {
    issues.push({ level: 'warning', rule: 'missing-json-ld',
      message: 'No JSON-LD schema types configured (Organization, WebSite, BreadcrumbList recommended at minimum).' });
  }

  // --- FAQ --------------------------------------------------------------------
  if (page.pageType === 'money' || page.pageType === 'blog') {
    const minFaq = page.pageType === 'money' ? RULES.minFaqMoney : RULES.minFaqBlog;
    if (!page.faq || page.faq.length < minFaq) {
      issues.push({ level: 'warning', rule: 'too-few-faq', field: 'faq',
        message: `Only ${page.faq?.length || 0} FAQ items (recommended ${minFaq}+).` });
    }
  }

  // --- Outgoing internal links ----------------------------------------------
  const outgoing = page.internalLinks?.filter((l) => l.target) || [];
  if (outgoing.length < RULES.minOutgoingInternalLinks) {
    issues.push({ level: 'warning', rule: 'too-few-internal-links', field: 'internalLinks',
      message: `Only ${outgoing.length} outgoing internal links (recommended ${RULES.minOutgoingInternalLinks}+).` });
  }

  // --- Incoming internal links (money only) ---------------------------------
  if (page.pageType === 'money' && allPages.length) {
    const incoming = allPages.filter(
      (p) => p.url !== page.url && (p.internalLinks || []).some((l) => l.target === page.url),
    ).length;
    if (incoming < RULES.minIncomingInternalLinksMoney) {
      issues.push({ level: 'warning', rule: 'too-few-incoming-links',
        message: `Only ${incoming} incoming internal links to this money page (recommended ${RULES.minIncomingInternalLinksMoney}+).` });
    }
  }

  // --- Sitemap sanity --------------------------------------------------------
  if (page.status === 'draft' && page.robotsIndex) {
    issues.push({ level: 'info', rule: 'draft-but-index',
      message: 'Page is draft but marked indexable — it will be excluded from sitemap until status=published.' });
  }
  if (page.status === 'published' && !page.robotsIndex) {
    issues.push({ level: 'info', rule: 'published-but-noindex',
      message: 'Page is published with robotsIndex=false — it will be excluded from sitemap.' });
  }

  // --- Score ------------------------------------------------------------------
  const errorCount = issues.filter((i) => i.level === 'error').length;
  const warnCount = issues.filter((i) => i.level === 'warning').length;
  let score = 100 - errorCount * 15 - warnCount * 5;
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  return {
    url: page.url,
    locale: page.locale,
    pageType: page.pageType,
    status: page.status,
    score,
    issues,
  };
}

export function buildCockpit(pages: Page[], global?: GlobalSEO): CockpitStats {
  const results = pages.map((p) => auditPage(p, { allPages: pages, global }));

  const counts = {
    totalPages: pages.length,
    publishedPages: pages.filter((p) => p.status === 'published').length,
    draftPages: pages.filter((p) => p.status === 'draft').length,
    noindexPages: pages.filter((p) => p.status === 'noindex' || !p.robotsIndex).length,
    pagesInSitemap: pages.filter((p) => p.status === 'published' && p.robotsIndex).length,
    missingTitle: pages.filter((p) => !p.title).length,
    missingDescription: pages.filter((p) => !p.description).length,
    missingH1: pages.filter((p) => !p.h1).length,
    duplicateTitle: 0,
    duplicateDescription: 0,
    missingCanonical: pages.filter((p) => !p.canonical).length,
    missingHreflang: pages.filter((p) => !p.hreflangRu || !p.hreflangUz).length,
    missingOg: pages.filter((p) => !p.ogTitle && !p.title).length,
    missingJsonLd: pages.filter((p) => !p.schemaTypes || p.schemaTypes.length === 0).length,
    missingFaq: pages.filter((p) => (p.pageType === 'money' || p.pageType === 'blog') && (!p.faq || p.faq.length === 0)).length,
    orphanPages: 0,
    brokenInternalLinks: 0,
    ruUzPairsOk: 0,
    ruUzPairsMissing: 0,
    avgMoneyScore: 0,
    avgBlogScore: 0,
    pages: results,
  };

  // duplicates
  const titles = pages.filter((p) => p.status === 'published').map((p) => p.title);
  const descs = pages.filter((p) => p.status === 'published').map((p) => p.description);
  counts.duplicateTitle = titles.length - unique(titles).length;
  counts.duplicateDescription = descs.length - unique(descs).length;

  // orphans: published pages with 0 incoming links from any other page
  counts.orphanPages = pages.filter((p) => {
    if (p.status !== 'published' || p.pageType === 'homepage') return false;
    const incoming = pages.filter(
      (q) => q.url !== p.url && (q.internalLinks || []).some((l) => l.target === p.url),
    ).length;
    return incoming === 0;
  }).length;

  // broken internal links: target doesn't exist among known pages
  const urls = new Set(pages.map((p) => p.url));
  counts.brokenInternalLinks = pages.reduce(
    (acc, p) =>
      acc +
      (p.internalLinks || []).filter((l) => l.target.startsWith('/') && !urls.has(l.target)).length,
    0,
  );

  // ru/uz pair status
  const ruPages = pages.filter((p) => p.locale === 'ru');
  for (const p of ruPages) {
    if (p.hreflangUz && pages.find((q) => q.url === p.hreflangUz)) counts.ruUzPairsOk++;
    else counts.ruUzPairsMissing++;
  }

  // avg scores
  const money = results.filter((r) => r.pageType === 'money');
  const blog = results.filter((r) => r.pageType === 'blog');
  counts.avgMoneyScore = money.length ? Math.round(money.reduce((s, r) => s + r.score, 0) / money.length) : 0;
  counts.avgBlogScore = blog.length ? Math.round(blog.reduce((s, r) => s + r.score, 0) / blog.length) : 0;

  return counts;
}
