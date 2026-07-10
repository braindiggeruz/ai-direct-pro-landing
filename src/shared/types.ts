// Shared content/SEO types used by admin UI, Cloudflare Functions,
// FastAPI dev mirror, and build-time scripts.

export type Locale = 'ru' | 'uz';
export type Status = 'draft' | 'published' | 'noindex';
export type PageType = 'homepage' | 'money' | 'niche' | 'blog' | 'faq' | 'legal';

export interface FaqItem {
  q: string;
  a: string;
}

export interface BodyBlock {
  type: 'h2' | 'h3' | 'p' | 'list' | 'cta' | 'image' | 'figure' | 'quote' | 'table' | 'toc' | 'linkp';
  text?: string;
  items?: string[];
  href?: string;
  src?: string;
  alt?: string;
  /** image/figure: intrinsic pixel dimensions — emitted as width/height to reserve space and prevent CLS. */
  width?: number;
  height?: number;
  /** figure: visible <figcaption> text (real HTML, aids SEO + a11y). */
  caption?: string;
  /** image/figure: 'eager' + fetchpriority=high for above-the-fold; defaults to 'lazy'. */
  loading?: 'lazy' | 'eager';
  /** h2/h3: anchor id for in-page navigation (rendered as id attr). */
  id?: string;
  /** table: column headers */
  headers?: string[];
  /** table: rows of cells */
  rows?: string[][];
  /**
   * toc: in-page anchor nav — items are { anchor, label } linking to heading ids.
   * linkp: contextual in-text links — { token, target, anchor } where each
   * {token} placeholder in `text` is replaced by an <a href="target">anchor</a>.
   * Only trusted, build-time content is used here (no user HTML injection).
   */
  links?: { anchor?: string; label?: string; token?: string; target?: string }[];
}

export interface InternalLink {
  /** Source page url (or null if used as outgoing list on this page) */
  source?: string;
  /** Target page url */
  target: string;
  anchor: string;
  locale: Locale;
  type: 'contextual' | 'block' | 'footer' | 'popular' | 'breadcrumb';
  reason?: string;
  priority?: number;
  status?: 'active' | 'paused';
}

export type SchemaType =
  | 'Organization'
  | 'WebSite'
  | 'BreadcrumbList'
  | 'Service'
  | 'FAQPage'
  | 'Article';

export interface Page {
  // System
  status: Status;
  locale: Locale;
  url: string; // e.g. /ru/ai-bot-dlya-biznesa/
  slug: string; // ai-bot-dlya-biznesa
  pageType: PageType;

  // Keyword targeting
  primaryKeyword: string;
  secondaryKeywords: string[];
  searchIntent?: 'informational' | 'commercial' | 'navigational' | 'transactional';

  // Meta
  h1: string;
  title: string;
  description: string;
  canonical: string;
  hreflangRu?: string;
  hreflangUz?: string;

  // OG
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;

  // Robots
  robotsIndex: boolean;
  robotsFollow: boolean;

  // Layout
  breadcrumbLabel?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  ctaPrimaryLabel?: string;
  ctaPrimaryHref?: string;
  ctaSecondaryLabel?: string;
  ctaSecondaryHref?: string;
  /** Optional hero image rendered beside the H1 (desktop) / below CTA (mobile). */
  heroImage?: { src: string; alt: string; width: number; height: number };
  /** Optional page-scoped trust chips under the primary CTA; falls back to the global default set. */
  heroTrust?: string[];

  bodyBlocks: BodyBlock[];
  faq: FaqItem[];
  internalLinks: InternalLink[];
  schemaTypes: SchemaType[];
  /**
   * Optional page-scoped JSON-LD nodes appended verbatim to the prerendered
   * @graph. Used for entity pages whose main subject is NOT the GPTBot
   * organization itself (e.g. /boss-digital/ describes the Boss Digital
   * agency and links it to the GPTBot org via department). Content-driven;
   * prerender never invents fields.
   */
  extraJsonLd?: Record<string, unknown>[];

  lastReviewedAt?: string; // ISO date
  updatedAt?: string;
  createdAt?: string;
}

export interface BlogArticle {
  status: Status;
  locale: Locale;
  slug: string;
  url: string;
  title: string;
  description: string;
  h1: string;
  topicCluster?: string;
  targetMoneyPage?: string;
  keywords: string[];
  intro: string;
  body: BodyBlock[];
  faq: FaqItem[];
  cta?: { label: string; href: string };
  internalLinks: InternalLink[];
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonical?: string;
  hreflangRu?: string;
  hreflangUz?: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  author?: string;
  datePublished?: string;
  dateModified?: string;
  schemaTypes: SchemaType[];
  updatedAt?: string;
  createdAt?: string;
}

export interface GlobalSEO {
  siteName: string;
  siteUrl: string;
  titleTemplate: string;
  defaultDescription: string;
  defaultOgImage: string;
  organizationName: string;
  /** Legal short name used when the canonical display name carries the .uz TLD. */
  organizationLegalName?: string;
  /** Long-form entity description for Organization.description in JSON-LD and llms.txt. */
  organizationDescription?: string;
  /** Single-sentence variant — used in OG fallbacks and shorter JSON-LD blocks. */
  organizationShortDescription?: string;
  /** Topics the organisation is an expert on — surfaces as Organization.knowsAbout. */
  knowsAbout?: string[];
  logo: string;
  phone?: string;
  /** Named expert/founder used as Article author (Person) for E-E-A-T. */
  authorName?: string;
  /** Public profile URL for the named author (e.g. the About page). */
  authorUrl?: string;
  telegram?: string;
  instagram?: string;
  /** Human-readable single-line address (footer + JSON-LD short form). */
  address?: string;
  /** Locality used in Organization.address.PostalAddress. */
  addressLocality?: string;
  /** ISO 3166-1 alpha-2 country code used in Organization.address.PostalAddress. */
  addressCountry?: string;
  /** Languages the organisation conducts business in (Schema.org Language codes). */
  availableLanguage?: string[];
  /** Geographic regions the organisation serves — drives Organization.areaServed. */
  areaServed?: Array<{ type: 'Country' | 'City' | 'State' | 'AdministrativeArea'; name: string }>;
  sameAs: string[];
  defaultCTA: { label: string; href: string };
}

export interface Redirect {
  id?: string;
  from: string;
  to: string;
  statusCode: 301 | 302;
  reason?: string;
  createdAt?: string;
}

export interface AuditIssue {
  level: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  field?: string;
}

export interface PageAuditResult {
  url: string;
  locale: Locale;
  pageType: PageType;
  status: Status;
  score: number;
  issues: AuditIssue[];
}

export interface CockpitStats {
  totalPages: number;
  publishedPages: number;
  draftPages: number;
  noindexPages: number;
  pagesInSitemap: number;
  mojibakePages: number;
  missingTitle: number;
  missingDescription: number;
  missingH1: number;
  duplicateTitle: number;
  duplicateDescription: number;
  missingCanonical: number;
  missingHreflang: number;
  missingOg: number;
  missingJsonLd: number;
  missingFaq: number;
  orphanPages: number;
  brokenInternalLinks: number;
  ruUzPairsOk: number;
  ruUzPairsMissing: number;
  avgMoneyScore: number;
  avgBlogScore: number;
  pages: PageAuditResult[];
}
