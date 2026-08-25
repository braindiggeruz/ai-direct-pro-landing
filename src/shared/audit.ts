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
  AuditContext,
  BrokenLink,
  LinkGraphNode,
  Redirect,
} from './types';

/**
 * Routes the app serves that have no file under content/pages/**.
 * Without these, every link to the homepage or a blog index reads as broken.
 */
export const STATIC_ROUTES = ['/', '/ru/blog/', '/uz/blog/'] as const;

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

// ----------------------------------------------------------------------------
// MOJIBAKE DETECTOR
//
// Mojibake = text where UTF-8 bytes were mis-interpreted as Latin-1 (often
// repeatedly), e.g. "AI-Ð…" instead of "AI-бот". This happened on gptbot.uz
// because the old getFile() used atob() without UTF-8 decoding.
//
// We detect by scanning for sequences of "suspicious" characters that
// almost never appear in real RU/UZ Latin/RU Cyrillic copy. The patterns
// below were derived from the brief + observed broken pages in this repo.
// ----------------------------------------------------------------------------
const MOJIBAKE_REGEX = /(?:Ã.|Ñ.|Â.|Ð.|Ò.|\uFFFD){2,}|Ã[\u0080-\u00BF]|Ð[\u0080-\u00BF]/u;

export function hasMojibake(value: unknown): boolean {
  if (typeof value !== 'string' || !value) return false;
  if (value.includes('\uFFFD')) return true;
  return MOJIBAKE_REGEX.test(value);
}

/** Walk an object and report the first mojibake-affected field path + sample. */
export function detectMojibake(obj: unknown, prefix = ''): { field: string; sample: string } | null {
  if (obj == null) return null;
  if (typeof obj === 'string') {
    if (hasMojibake(obj)) return { field: prefix || '(root)', sample: obj.slice(0, 40) };
    return null;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const r = detectMojibake(obj[i], `${prefix}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const r = detectMojibake(v, prefix ? `${prefix}.${k}` : k);
      if (r) return r;
    }
  }
  return null;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

// ----------------------------------------------------------------------------
// INTERNAL LINK GRAPH
//
// The site serves three kinds of URL: content/pages/**, content/blog/** and a
// handful of app routes with no content file (STATIC_ROUTES). A link is only
// broken when it resolves to none of them AND no redirect rescues it.
//
// Before this graph existed the audit indexed content/pages/** alone, so every
// money-page → article link counted as broken (110 of them) while a link to a
// genuinely missing article was indistinguishable from the noise.
// ----------------------------------------------------------------------------

/** Strip the fragment and query so `/ru/x/#faq` is matched against `/ru/x/`. */
export function normalizeLinkTarget(target: string): string {
  return target.split('#')[0].split('?')[0];
}

/** Every outgoing internal link of a node, with a human-readable location. */
export function collectOutgoingLinks(node: LinkGraphNode): BrokenLink[] {
  const out: BrokenLink[] = [];
  const push = (where: string, target: unknown, anchor?: string) => {
    if (typeof target !== 'string' || !target.startsWith('/')) return;
    out.push({ sourceUrl: node.url, where, target: normalizeLinkTarget(target), anchor });
  };
  for (const link of node.internalLinks || []) push('internalLinks', link?.target, link?.anchor);
  (node.bodyBlocks || []).forEach((block, i) => {
    for (const link of block?.links || []) push(`bodyBlocks[${i}].${block.type}`, link?.target, link?.anchor);
    if (block?.type === 'cta') push(`bodyBlocks[${i}].cta`, block.href, block.text);
  });
  return out;
}

/** Resolve a target through the redirect table (exact match, then `/prefix/*`). */
export function resolveRedirect(target: string, redirects: Redirect[]): string | null {
  const exact = redirects.find((r) => r.from === target);
  if (exact) return exact.to;
  for (const r of redirects) {
    if (!r.from.endsWith('/*')) continue;
    const prefix = r.from.slice(0, -1);
    if (target.startsWith(prefix)) return r.to.replace(':splat', target.slice(prefix.length));
  }
  return null;
}

/** URLs the site actually serves, given pages + optional blog/extra routes. */
export function buildKnownUrls(pages: Page[], ctx: AuditContext = {}): Set<string> {
  return new Set<string>([
    ...pages.map((p) => p.url),
    ...(ctx.blog || []).map((b) => b.url),
    ...(ctx.extraUrls ?? STATIC_ROUTES),
  ]);
}

export function auditPage(
  page: Page,
  ctx: {
    allPages?: Page[];
    global?: GlobalSEO;
    /**
     * Every URL the site serves. Supplied only by callers that can see the blog
     * and the static routes — without it the link check would flag valid
     * page → article links, so it is skipped rather than guessed.
     */
    knownUrls?: Set<string>;
    /** Pages and articles that may participate in a reciprocal hreflang pair. */
    hreflangNodes?: LinkGraphNode[];
    redirects?: Redirect[];
  } = {},
): PageAuditResult {
  const issues: AuditIssue[] = [];
  const { allPages = [], global, knownUrls, redirects = [] } = ctx;
  const hreflangNodes = ctx.hreflangNodes || allPages;

  // --- MOJIBAKE CHECK (CRITICAL) ---------------------------------------------
  // If any user-visible string contains mojibake, treat the page as broken:
  // we report an error-level issue and force the score down to 0. This blocks
  // sitemap inclusion and triggers a publish-guard server-side.
  const mojibakeHit = detectMojibake({
    title: page.title,
    description: page.description,
    h1: page.h1,
    heroTitle: page.heroTitle,
    heroSubtitle: page.heroSubtitle,
    breadcrumbLabel: page.breadcrumbLabel,
    primaryKeyword: page.primaryKeyword,
    secondaryKeywords: page.secondaryKeywords,
    ogTitle: page.ogTitle,
    ogDescription: page.ogDescription,
    bodyBlocks: page.bodyBlocks,
    faq: page.faq,
    internalLinks: page.internalLinks,
  });
  if (mojibakeHit) {
    issues.push({
      level: 'error',
      rule: 'mojibake',
      field: mojibakeHit.field.split('.')[0].split('[')[0],
      message: `Encoding issue (mojibake) in "${mojibakeHit.field}": ${mojibakeHit.sample}…`,
    });
  }

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
  } else if (hreflangNodes.length) {
    const pairUrl = page.locale === 'ru' ? page.hreflangUz : page.hreflangRu;
    if (pairUrl) {
      const pair = hreflangNodes.find((p) => p.url === pairUrl.replace(/^https?:\/\/[^/]+/, ''));
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
    const have = page.faq?.length || 0;
    if (page.pageType === 'money' && have === 0) {
      // Money page with NO FAQ at all → critical for ranking.
      issues.push({ level: 'error', rule: 'no-faq-money', field: 'faq',
        message: 'Money page has 0 FAQ items. At least 4 are required for ranking & schema.' });
    } else if (have < minFaq) {
      issues.push({ level: 'warning', rule: 'too-few-faq', field: 'faq',
        message: `Only ${have} FAQ items (recommended ${minFaq}+).` });
    }
  }

  // --- Outgoing internal links ----------------------------------------------
  const outgoing = page.internalLinks?.filter((l) => l.target) || [];
  if (outgoing.length < RULES.minOutgoingInternalLinks) {
    issues.push({ level: 'warning', rule: 'too-few-internal-links', field: 'internalLinks',
      message: `Only ${outgoing.length} outgoing internal links (recommended ${RULES.minOutgoingInternalLinks}+).` });
  }

  // --- Internal link targets --------------------------------------------------
  if (knownUrls) {
    for (const link of collectOutgoingLinks(page)) {
      if (knownUrls.has(link.target)) continue;
      const via = resolveRedirect(link.target, redirects);
      if (via && knownUrls.has(via)) {
        issues.push({ level: 'warning', rule: 'internal-link-via-redirect', field: 'internalLinks',
          message: `Link in ${link.where} points at redirect source "${link.target}" — link "${via}" directly.` });
      } else {
        issues.push({ level: 'error', rule: 'broken-internal-link', field: 'internalLinks',
          message: `Link in ${link.where} points at "${link.target}", which the site does not serve.` });
      }
    }
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
    // A published page that won't end up in the sitemap is almost always a bug.
    issues.push({ level: 'error', rule: 'published-but-not-in-sitemap', field: 'robotsIndex',
      message: 'Page status=published but robotsIndex=false → it will be excluded from sitemap. Either set robotsIndex=true or move back to draft/noindex.' });
  }

  // --- Score ------------------------------------------------------------------
  const errorCount = issues.filter((i) => i.level === 'error').length;
  const warnCount = issues.filter((i) => i.level === 'warning').length;
  let score = 100 - errorCount * 15 - warnCount * 5;
  // Hard cap: any mojibake → score = 0 (page is unpublishable).
  if (issues.some((i) => i.rule === 'mojibake')) score = 0;
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

export function buildCockpit(pages: Page[], global?: GlobalSEO, ctx: AuditContext = {}): CockpitStats {
  const knownUrls = buildKnownUrls(pages, ctx);
  const redirects = ctx.redirects || [];
  const hreflangNodes: LinkGraphNode[] = [...pages, ...(ctx.blog || [])];
  const results = pages.map((p) => auditPage(p, { allPages: pages, global, knownUrls, hreflangNodes, redirects }));

  const counts = {
    totalPages: pages.length,
    publishedPages: pages.filter((p) => p.status === 'published').length,
    draftPages: pages.filter((p) => p.status === 'draft').length,
    noindexPages: pages.filter((p) => p.status === 'noindex' || !p.robotsIndex).length,
    pagesInSitemap: pages.filter((p) => p.status === 'published' && p.robotsIndex).length,
    mojibakePages: results.filter((r) => r.issues.some((i) => i.rule === 'mojibake')).length,
    missingTitle: pages.filter((p) => !p.title).length,
    missingDescription: pages.filter((p) => !p.description).length,
    missingH1: pages.filter((p) => !p.h1).length,
    duplicateTitle: 0,
    duplicateDescription: 0,
    missingCanonical: pages.filter((p) => !p.canonical).length,
    // A page that exists in one locale only is not defective — it simply has no
    // counterpart to declare. The defect is declaring no language at all.
    missingHreflang: pages.filter((p) => !p.hreflangRu && !p.hreflangUz).length,
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
    orphanPageUrls: [] as string[],
    brokenInternalLinkDetails: [] as BrokenLink[],
    linksViaRedirect: 0,
    linksViaRedirectDetails: [] as BrokenLink[],
    singleLocalePages: 0,
  };

  // duplicates
  const titles = pages.filter((p) => p.status === 'published').map((p) => p.title);
  const descs = pages.filter((p) => p.status === 'published').map((p) => p.description);
  counts.duplicateTitle = titles.length - unique(titles).length;
  counts.duplicateDescription = descs.length - unique(descs).length;

  // --- link graph over pages AND blog articles -------------------------------
  // Both directions matter: a page linked only from an article is not an orphan,
  // and an article linking to a dead page is still a broken link.
  const nodes: LinkGraphNode[] = [...pages, ...(ctx.blog || [])];
  const incoming = new Map<string, number>();
  for (const node of nodes) {
    const targets = new Set(collectOutgoingLinks(node).map((l) => l.target));
    for (const target of targets) {
      if (target === node.url) continue;
      incoming.set(target, (incoming.get(target) || 0) + 1);
    }
    for (const link of collectOutgoingLinks(node)) {
      if (knownUrls.has(link.target)) continue;
      const via = resolveRedirect(link.target, redirects);
      if (via && knownUrls.has(via)) {
        counts.linksViaRedirect++;
        counts.linksViaRedirectDetails.push({ ...link, resolvesTo: via });
      } else {
        counts.brokenInternalLinks++;
        counts.brokenInternalLinkDetails.push(link);
      }
    }
  }

  // orphans: published pages nothing links to
  counts.orphanPageUrls = pages
    .filter((p) => p.status === 'published' && p.pageType !== 'homepage' && !incoming.get(p.url))
    .map((p) => p.url);
  counts.orphanPages = counts.orphanPageUrls.length;

  // ru/uz pair status: a declared counterpart that does not exist is the defect.
  // RU pages with no counterpart authored at all are counted separately.
  const ruPages = pages.filter((p) => p.locale === 'ru');
  for (const p of ruPages) {
    if (!p.hreflangUz) counts.singleLocalePages++;
    else if (hreflangNodes.find((q) => q.url === p.hreflangUz!.replace(/^https?:\/\/[^/]+/, ''))) counts.ruUzPairsOk++;
    else counts.ruUzPairsMissing++;
  }

  // avg scores
  const money = results.filter((r) => r.pageType === 'money');
  const blog = results.filter((r) => r.pageType === 'blog');
  counts.avgMoneyScore = money.length ? Math.round(money.reduce((s, r) => s + r.score, 0) / money.length) : 0;
  counts.avgBlogScore = blog.length ? Math.round(blog.reduce((s, r) => s + r.score, 0) / blog.length) : 0;

  return counts;
}
