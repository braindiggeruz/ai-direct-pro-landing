// Server-side validator + sanitizer for incoming AI draft bundles.
//
// Hard rules (non-negotiable):
//   - Status is FORCED to 'pending_review' on insert, regardless of input.
//   - manual_approval_required is FORCED to true.
//   - ready_for_publish / published are FORCED to false.
//   - locale must be 'ru' or 'uz'.
//   - slug must match /^[a-z0-9-]{1,80}$/ (existing blog-editor rule).
//   - target_money_page must start with /<locale>/ and may not contain
//     '?', '#', or any blocked prefix (/admin-tools, /api, /draft, /test).
//   - body_blocks may only use types known to the existing Blog Editor.
//   - faq items must have non-empty q + a; max 30 items.
//   - internal_links: target must be a relative path; anchor non-empty.
//
// Anything that fails returns { ok: false, errors: [...] } so the ingestion
// endpoint can respond with HTTP 400.

import type { AiDraftArticle } from '../../../src/shared/ai-drafts';
import { AI_DRAFT_SCHEMA_VERSION } from '../../../src/shared/ai-drafts';
import type { BodyBlock, FaqItem, InternalLink, Locale, SchemaType } from '../../../src/shared/types';
import { hasMojibake } from '../../../src/shared/audit';

export const ALLOWED_BODY_TYPES: BodyBlock['type'][] = ['h2', 'h3', 'p', 'list', 'cta', 'image', 'quote'];
export const ALLOWED_SCHEMA_TYPES: SchemaType[] = ['Organization', 'WebSite', 'BreadcrumbList', 'Service', 'FAQPage', 'Article'];
const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const BLOCKED_PATH_PREFIXES = ['/admin-tools', '/api/', '/api-', '/draft/', '/test/'];
const MAX_BODY_BLOCKS = 80;
const MAX_FAQ = 30;
const MAX_INTERNAL_LINKS = 30;
const MAX_STRING = 8000;
const MAX_TITLE = 220;
const MAX_DESCRIPTION = 320;

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidatedBundle {
  schema_version: string;
  source: string;
  bundle_id: string;
  execution_id: string | null;
  seo_brief: Record<string, unknown> | null;
  validation: {
    passed: boolean;
    issues: Array<{ level?: string; rule?: string; message?: string; field?: string }>;
  };
  articles: AiDraftArticle[];
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function asString(v: unknown, max = MAX_STRING): string {
  if (typeof v !== 'string') return '';
  // Strip control characters except newline/tab.
  // eslint-disable-next-line no-control-regex
  const cleaned = v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();
  return cleaned.slice(0, max);
}

function asOptionalString(v: unknown, max = MAX_STRING): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = asString(v, max);
  return s ? s : undefined;
}

function isAllowedTarget(target: string, locale: Locale): boolean {
  if (typeof target !== 'string' || !target.startsWith('/')) return false;
  for (const p of BLOCKED_PATH_PREFIXES) {
    if (target.startsWith(p)) return false;
  }
  if (target.includes('?') || target.includes('#')) return false;
  // Money page must live in same locale tree.
  if (!target.startsWith(`/${locale}/`)) return false;
  return true;
}

function isAllowedInternalTarget(target: string): boolean {
  if (typeof target !== 'string' || !target.startsWith('/')) return false;
  for (const p of BLOCKED_PATH_PREFIXES) {
    if (target.startsWith(p)) return false;
  }
  if (target.includes('?') || target.includes('#')) return false;
  // Must be either /<locale>/<...> or any future relative path. We only
  // require the slug-shape look; the editor's own validators (and the
  // existing booster) will run again on import.
  return true;
}

function validateBodyBlock(b: unknown, path: string, errors: ValidationError[]): BodyBlock | null {
  if (!isPlainObject(b)) { errors.push({ path, message: 'body block must be an object' }); return null; }
  const type = b.type as string;
  if (typeof type !== 'string' || !ALLOWED_BODY_TYPES.includes(type as BodyBlock['type'])) {
    errors.push({ path: `${path}.type`, message: `unsupported body block type "${String(type)}"` });
    return null;
  }
  const out: BodyBlock = { type: type as BodyBlock['type'] };
  const text = asOptionalString(b.text, MAX_STRING);
  if (text !== undefined) out.text = text;
  if (Array.isArray(b.items)) {
    const items = b.items.map((i) => asString(i)).filter(Boolean);
    if (items.length > 0) out.items = items.slice(0, 30);
  }
  const href = asOptionalString(b.href, 500);
  if (href !== undefined) {
    if (!href.startsWith('/') && !/^https?:\/\//.test(href)) {
      errors.push({ path: `${path}.href`, message: 'href must be relative or http(s)://' });
      return null;
    }
    out.href = href;
  }
  const src = asOptionalString(b.src, 1000);
  if (src !== undefined) {
    if (!src.startsWith('/') && !/^https?:\/\//.test(src)) {
      errors.push({ path: `${path}.src`, message: 'image src must be relative or http(s)://' });
      return null;
    }
    out.src = src;
  }
  const alt = asOptionalString(b.alt, 240);
  if (alt !== undefined) out.alt = alt;
  return out;
}

function validateFaqItem(f: unknown, path: string, errors: ValidationError[]): FaqItem | null {
  if (!isPlainObject(f)) { errors.push({ path, message: 'faq item must be an object' }); return null; }
  const q = asString(f.q, 500);
  const a = asString(f.a, MAX_STRING);
  if (!q || !a) {
    errors.push({ path, message: 'faq item missing q or a' });
    return null;
  }
  return { q, a };
}

function validateInternalLink(l: unknown, path: string, locale: Locale, errors: ValidationError[]): InternalLink | null {
  if (typeof l === 'string') {
    if (!isAllowedInternalTarget(l)) {
      errors.push({ path, message: `internal link target "${l}" blocked` });
      return null;
    }
    return { target: l, anchor: l, locale, type: 'contextual' };
  }
  if (!isPlainObject(l)) {
    errors.push({ path, message: 'internal link must be string or object' });
    return null;
  }
  const target = asString(l.target, 500);
  const anchor = asString(l.anchor, 240);
  if (!target || !anchor) {
    errors.push({ path, message: 'internal link missing target or anchor' });
    return null;
  }
  if (!isAllowedInternalTarget(target)) {
    errors.push({ path: `${path}.target`, message: `target "${target}" blocked` });
    return null;
  }
  const typeRaw = typeof l.type === 'string' ? l.type : 'contextual';
  const type = (['contextual', 'block', 'footer', 'popular', 'breadcrumb'] as const).includes(typeRaw as never)
    ? (typeRaw as InternalLink['type'])
    : 'contextual';
  return { target, anchor, locale, type };
}

function validateArticle(raw: unknown, path: string, errors: ValidationError[]): AiDraftArticle | null {
  if (!isPlainObject(raw)) { errors.push({ path, message: 'article must be an object' }); return null; }

  const locale = raw.locale === 'ru' || raw.locale === 'uz' ? (raw.locale as Locale) : null;
  if (!locale) { errors.push({ path: `${path}.locale`, message: 'locale must be "ru" or "uz"' }); return null; }

  const slug = asString(raw.slug, 80);
  if (!SLUG_RE.test(slug)) {
    errors.push({ path: `${path}.slug`, message: `slug "${slug}" must match /^[a-z0-9-]{1,80}$/` });
    return null;
  }

  const meta_title = asString(raw.meta_title ?? raw.title, MAX_TITLE);
  const meta_description = asString(raw.meta_description ?? raw.description, MAX_DESCRIPTION);
  const h1 = asString(raw.h1, MAX_TITLE);
  const excerpt = asString(raw.excerpt ?? raw.intro, MAX_STRING);
  const target_keyword = asString(raw.target_keyword, 240);
  const target_money_page = asString(raw.target_money_page, 500);
  const author = asOptionalString(raw.author, 80) || 'GPTBot';

  if (!meta_title) errors.push({ path: `${path}.meta_title`, message: 'meta_title required' });
  if (!meta_description) errors.push({ path: `${path}.meta_description`, message: 'meta_description required' });
  if (!h1) errors.push({ path: `${path}.h1`, message: 'h1 required' });
  if (!excerpt) errors.push({ path: `${path}.excerpt`, message: 'excerpt required' });

  // Mojibake guard. The existing Blog Editor publish-guard catches this on
  // import too, but we reject up-front to give n8n a clearer error.
  const moji = hasMojibake(meta_title) || hasMojibake(meta_description) || hasMojibake(h1) || hasMojibake(excerpt);
  if (moji) errors.push({ path, message: 'mojibake detected in meta/title/h1/excerpt' });

  if (target_money_page && !isAllowedTarget(target_money_page, locale)) {
    errors.push({ path: `${path}.target_money_page`, message: `target_money_page "${target_money_page}" not allowed (must be /${locale}/...)` });
  }

  const bodyRaw = Array.isArray(raw.body_blocks) ? raw.body_blocks : (Array.isArray(raw.body) ? raw.body : []);
  if (bodyRaw.length > MAX_BODY_BLOCKS) {
    errors.push({ path: `${path}.body_blocks`, message: `too many body blocks (max ${MAX_BODY_BLOCKS})` });
  }
  const body_blocks: BodyBlock[] = [];
  for (let i = 0; i < Math.min(bodyRaw.length, MAX_BODY_BLOCKS); i++) {
    const b = validateBodyBlock(bodyRaw[i], `${path}.body_blocks[${i}]`, errors);
    if (b) body_blocks.push(b);
  }

  const faqRaw = Array.isArray(raw.faq) ? raw.faq : [];
  if (faqRaw.length > MAX_FAQ) {
    errors.push({ path: `${path}.faq`, message: `too many faq items (max ${MAX_FAQ})` });
  }
  const faq: FaqItem[] = [];
  for (let i = 0; i < Math.min(faqRaw.length, MAX_FAQ); i++) {
    const item = validateFaqItem(faqRaw[i], `${path}.faq[${i}]`, errors);
    if (item) faq.push(item);
  }

  const linksRaw = Array.isArray(raw.internal_links) ? raw.internal_links : (Array.isArray(raw.internalLinks) ? raw.internalLinks : []);
  if (linksRaw.length > MAX_INTERNAL_LINKS) {
    errors.push({ path: `${path}.internal_links`, message: `too many internal links (max ${MAX_INTERNAL_LINKS})` });
  }
  const internal_links: InternalLink[] = [];
  for (let i = 0; i < Math.min(linksRaw.length, MAX_INTERNAL_LINKS); i++) {
    const l = validateInternalLink(linksRaw[i], `${path}.internal_links[${i}]`, locale, errors);
    if (l) internal_links.push(l);
  }

  const schemasRaw = Array.isArray(raw.schemas) ? raw.schemas : (Array.isArray(raw.schemaTypes) ? raw.schemaTypes : ['Article', 'FAQPage', 'BreadcrumbList']);
  const schemas: SchemaType[] = [];
  for (const s of schemasRaw) {
    if (typeof s === 'string' && ALLOWED_SCHEMA_TYPES.includes(s as SchemaType) && !schemas.includes(s as SchemaType)) {
      schemas.push(s as SchemaType);
    }
  }
  if (schemas.length === 0) {
    schemas.push('Article', 'FAQPage', 'BreadcrumbList');
  }

  // Keywords: array of strings (best effort).
  const keywordsRaw = Array.isArray(raw.keywords) ? raw.keywords : [];
  const keywords = keywordsRaw
    .map((k) => asString(k, 120))
    .filter(Boolean)
    .slice(0, 30);
  if (keywords.length === 0 && target_keyword) keywords.push(target_keyword);

  return {
    locale,
    slug,
    meta_title,
    meta_description,
    h1,
    excerpt,
    target_keyword,
    target_money_page,
    author,
    body_blocks,
    faq,
    internal_links,
    schemas,
    keywords,
    og_title: asOptionalString(raw.og_title ?? raw.ogTitle, MAX_TITLE),
    og_description: asOptionalString(raw.og_description ?? raw.ogDescription, MAX_DESCRIPTION),
    og_image: asOptionalString(raw.og_image ?? raw.ogImage, 1000),
  };
}

export interface ValidateResult {
  ok: boolean;
  errors: ValidationError[];
  bundle?: ValidatedBundle;
}

const BUNDLE_ID_RE = /^[a-zA-Z0-9._:-]{4,128}$/;

export function validateIncomingBundle(raw: unknown): ValidateResult {
  const errors: ValidationError[] = [];

  if (!isPlainObject(raw)) {
    return { ok: false, errors: [{ path: '', message: 'body must be a JSON object' }] };
  }

  const schema_version = asString(raw.schema_version, 80);
  if (schema_version !== AI_DRAFT_SCHEMA_VERSION) {
    errors.push({ path: 'schema_version', message: `expected "${AI_DRAFT_SCHEMA_VERSION}", got "${schema_version}"` });
  }

  const source = asString(raw.source, 80);
  if (!source) errors.push({ path: 'source', message: 'source required' });

  const bundle_id = asString(raw.bundle_id, 128);
  if (!BUNDLE_ID_RE.test(bundle_id)) {
    errors.push({ path: 'bundle_id', message: 'bundle_id must match /^[a-zA-Z0-9._:-]{4,128}$/' });
  }

  const execution_id = asOptionalString(raw.execution_id, 128) ?? null;

  // articles[] is required and non-empty.
  if (!Array.isArray(raw.articles) || raw.articles.length === 0) {
    errors.push({ path: 'articles', message: 'articles[] must be a non-empty array' });
    return { ok: false, errors };
  }
  if (raw.articles.length > 4) {
    errors.push({ path: 'articles', message: 'too many articles in one bundle (max 4)' });
    return { ok: false, errors };
  }

  const articles: AiDraftArticle[] = [];
  const seenLocale = new Set<string>();
  for (let i = 0; i < raw.articles.length; i++) {
    const a = validateArticle(raw.articles[i], `articles[${i}]`, errors);
    if (a) {
      if (seenLocale.has(a.locale)) {
        errors.push({ path: `articles[${i}].locale`, message: `duplicate locale "${a.locale}" in bundle` });
      } else {
        seenLocale.add(a.locale);
        articles.push(a);
      }
    }
  }

  if (articles.length === 0) {
    return { ok: false, errors };
  }

  // SEO brief is optional; we just clamp it to a serialisable JSON object.
  const seoBrief = isPlainObject(raw.seo_brief) ? raw.seo_brief : null;

  // Validation block from upstream. Keep, but never trust 'passed' as a
  // publish signal — admin still has to review.
  const validation = isPlainObject(raw.validation)
    ? {
        passed: raw.validation.passed === true,
        issues: Array.isArray(raw.validation.issues)
          ? raw.validation.issues.slice(0, 200).filter(isPlainObject).map((x) => ({
              level: asOptionalString((x as Record<string, unknown>).level, 32),
              rule: asOptionalString((x as Record<string, unknown>).rule, 80),
              message: asOptionalString((x as Record<string, unknown>).message, 500),
              field: asOptionalString((x as Record<string, unknown>).field, 80),
            }))
          : [],
      }
    : { passed: true, issues: [] };

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    bundle: {
      schema_version,
      source,
      bundle_id,
      execution_id,
      seo_brief: seoBrief,
      validation,
      articles,
    },
  };
}
