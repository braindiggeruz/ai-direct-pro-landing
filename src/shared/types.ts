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
  type: 'h2' | 'h3' | 'p' | 'list' | 'cta' | 'image' | 'quote';
  text?: string;
  items?: string[];
  href?: string;
  src?: string;
  alt?: string;
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

  bodyBlocks: BodyBlock[];
  faq: FaqItem[];
  internalLinks: InternalLink[];
  schemaTypes: SchemaType[];

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
  logo: string;
  phone?: string;
  telegram?: string;
  instagram?: string;
  address?: string;
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
