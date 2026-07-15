// Normalises the n8n SEO Autopilot Respond Success response into the
// gptbot.article-draft.v1 ingestion contract.
//
// n8n returns approximately:
//   {
//     "status": "ready_for_manual_approval" | "manual_approval_required" | "ok",
//     "manual_approval_required": true,
//     "ready_for_publish": false,
//     "ru_article":   { slug, meta_title, meta_description, h1, excerpt,
//                       body_blocks: [{type, text|...}],
//                       faq: [{q|question, a|answer}],
//                       internal_links: [{target|url|href, anchor|text|label}],
//                       target_money_page: "https://gptbot.uz/services" | "/ru/...",
//                       ... },
//     "uz_article":   { ... },
//     "seo_brief":    { ... },
//     "validation":   { passed: boolean, issues: [...] },
//     "execution_id": "<n8n execution id>"
//   }
//
// Each field has multiple naming conventions across SEO Autopilot
// iterations — this module translates them to the canonical names the
// strict validator (`functions/lib/ai-drafts/validators.ts`) accepts.
// The validator itself stays strict; the normaliser only renames /
// rescopes safe inputs.

import type { AiDraftBundle } from '../../../src/shared/ai-drafts';
import { AI_DRAFT_SCHEMA_VERSION } from '../../../src/shared/ai-drafts';

const SITE_ORIGIN = 'https://gptbot.uz';

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function asStr(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }

function pickArticle(payload: Record<string, unknown>, primary: string, ...aliases: string[]): Record<string, unknown> | null {
  for (const key of [primary, ...aliases]) {
    const v = payload[key];
    if (isObj(v)) return v;
  }
  return null;
}

// "paragraph" → "p", "heading_2"/"h_2"/"H2" → "h2", "bullet_list" → "list", etc.
const BODY_TYPE_ALIASES: Record<string, string> = {
  paragraph: 'p',
  para: 'p',
  text: 'p',
  heading: 'h2',
  heading_2: 'h2',
  heading2: 'h2',
  h_2: 'h2',
  H2: 'h2',
  heading_3: 'h3',
  heading3: 'h3',
  h_3: 'h3',
  H3: 'h3',
  bullet_list: 'list',
  bulletlist: 'list',
  ul: 'list',
  ol: 'list',
  unordered_list: 'list',
  ordered_list: 'list',
  call_to_action: 'cta',
  callout: 'cta',
  blockquote: 'quote',
  img: 'image',
};

function normaliseBlockType(rawType: unknown): string {
  const t = typeof rawType === 'string' ? rawType.trim() : '';
  if (!t) return '';
  const lower = t.toLowerCase();
  return BODY_TYPE_ALIASES[t] || BODY_TYPE_ALIASES[lower] || lower;
}

function normaliseBodyBlocks(raw: unknown): unknown[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((b) => {
    if (!isObj(b)) return b;
    const out: Record<string, unknown> = { ...b };
    const t = normaliseBlockType(b.type);
    if (t) out.type = t;
    // Some n8n flows embed the body text under "content" instead of "text".
    if (typeof out.text !== 'string') {
      const alt = (b as Record<string, unknown>).content ?? (b as Record<string, unknown>).body;
      if (typeof alt === 'string') out.text = alt;
    }
    // Items may arrive as `points`, `bullets`, or `entries`.
    if (!Array.isArray(out.items)) {
      const alt = (b as Record<string, unknown>).points
        ?? (b as Record<string, unknown>).bullets
        ?? (b as Record<string, unknown>).entries;
      if (Array.isArray(alt)) out.items = alt;
    }
    // CTA might use `url`/`link` for href.
    if (typeof out.href !== 'string') {
      const alt = (b as Record<string, unknown>).url ?? (b as Record<string, unknown>).link;
      if (typeof alt === 'string') out.href = alt;
    }
    return out;
  });
}

function normaliseFaq(raw: unknown): unknown[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((item) => {
    if (!isObj(item)) return item;
    // Accept {q, a}, {question, answer}, {Q, A}, {q_text, a_text}.
    const q = asStr(item.q) || asStr((item as Record<string, unknown>).question) || asStr((item as Record<string, unknown>).Q) || asStr((item as Record<string, unknown>).q_text) || asStr((item as Record<string, unknown>).query);
    const a = asStr(item.a) || asStr((item as Record<string, unknown>).answer) || asStr((item as Record<string, unknown>).A) || asStr((item as Record<string, unknown>).a_text) || asStr((item as Record<string, unknown>).response);
    return q || a ? { q, a } : item;
  });
}

function stripSiteOrigin(value: string): string {
  if (!value) return value;
  if (value.startsWith(SITE_ORIGIN)) return value.slice(SITE_ORIGIN.length) || '/';
  // Tolerate http or www variants.
  const m = value.match(/^https?:\/\/(?:www\.)?gptbot\.uz(\/.*)?$/i);
  if (m) return m[1] || '/';
  return value;
}

function normaliseInternalLinks(raw: unknown, locale: 'ru' | 'uz'): unknown[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((item) => {
    if (typeof item === 'string') {
      const target = stripSiteOrigin(item.trim());
      return { target, anchor: target, locale, type: 'contextual' };
    }
    if (!isObj(item)) return item;
    // Accept {target,anchor}, {url,anchor}, {href,anchor}, {link,label},
    // {url,text}, {target,text}, {href,label}.
    const rawTarget =
      asStr(item.target) ||
      asStr((item as Record<string, unknown>).url) ||
      asStr((item as Record<string, unknown>).href) ||
      asStr((item as Record<string, unknown>).link) ||
      asStr((item as Record<string, unknown>).to);
    const anchor =
      asStr(item.anchor) ||
      asStr((item as Record<string, unknown>).text) ||
      asStr((item as Record<string, unknown>).label) ||
      asStr((item as Record<string, unknown>).title);
    const target = rawTarget ? stripSiteOrigin(rawTarget) : '';
    if (!target && !anchor) return item;
    return {
      target,
      anchor: anchor || target,
      locale,
      type: typeof item.type === 'string' ? item.type : 'contextual',
    };
  });
}

function normaliseMoneyPage(raw: unknown, locale: 'ru' | 'uz'): string {
  const s = asStr(raw);
  if (!s) return s;
  const rel = stripSiteOrigin(s);
  // If it ended up at `/services` or any other locale-agnostic root,
  // scope it under the article's locale so the validator's locale-tree
  // rule still passes.
  if (rel.startsWith('/') && !rel.startsWith(`/${locale}/`) && !rel.startsWith('/ru/') && !rel.startsWith('/uz/')) {
    return `/${locale}${rel}`;
  }
  return rel;
}

function normaliseArticle(raw: Record<string, unknown>, locale: 'ru' | 'uz'): Record<string, unknown> {
  // Pass-through with name normalisation so the validator sees consistent keys.
  return {
    locale,
    slug:              asStr(raw.slug),
    meta_title:        asStr(raw.meta_title) || asStr(raw.title),
    meta_description:  asStr(raw.meta_description) || asStr(raw.description),
    h1:                asStr(raw.h1),
    excerpt:           asStr(raw.excerpt) || asStr(raw.intro),
    target_keyword:    asStr(raw.target_keyword) || asStr((raw as { primary_keyword?: unknown }).primary_keyword),
    target_money_page: normaliseMoneyPage(raw.target_money_page || (raw as { money_page?: unknown }).money_page, locale),
    author:            asStr(raw.author) || 'GPTBot',
    body_blocks:       normaliseBodyBlocks(
                         Array.isArray(raw.body_blocks) ? raw.body_blocks
                         : (Array.isArray(raw.body) ? raw.body : []),
                       ),
    faq:               normaliseFaq(Array.isArray(raw.faq) ? raw.faq : (Array.isArray((raw as { faqs?: unknown }).faqs) ? (raw as { faqs: unknown[] }).faqs : [])),
    internal_links:    normaliseInternalLinks(
                         Array.isArray(raw.internal_links) ? raw.internal_links
                         : (Array.isArray((raw as { internalLinks?: unknown }).internalLinks)
                             ? (raw as { internalLinks: unknown[] }).internalLinks
                             : (Array.isArray((raw as { links?: unknown }).links)
                                 ? (raw as { links: unknown[] }).links
                                 : [])),
                         locale,
                       ),
    schemas:           Array.isArray(raw.schemas) ? raw.schemas : ['Article', 'FAQPage', 'BreadcrumbList'],
    keywords:          Array.isArray(raw.keywords) ? raw.keywords : [],
    og_title:          asStr((raw as { og_title?: unknown }).og_title) || asStr((raw as { ogTitle?: unknown }).ogTitle),
    og_description:    asStr((raw as { og_description?: unknown }).og_description) || asStr((raw as { ogDescription?: unknown }).ogDescription),
    og_image:          asStr((raw as { og_image?: unknown }).og_image) || asStr((raw as { ogImage?: unknown }).ogImage),
  };
}

export interface NormaliseSuccess {
  ok: true;
  bundle: AiDraftBundle;
  meta: {
    n8n_execution_id: string | null;
    generation_status: string | null;
    validation_status: 'passed' | 'failed' | null;
    validation_passed: boolean;
    validation_issue_count: number;
  };
}

export interface NormaliseFailure {
  ok: false;
  reason: string;
  detail?: Record<string, unknown>;
}

export type NormaliseResult = NormaliseSuccess | NormaliseFailure;

/**
 * Map an n8n Respond Success body into the ingestion contract.
 *
 * `jobId` is used as a deterministic fallback for `bundle_id` when n8n
 * does not return its own execution_id (or when the response is a retry).
 */
export function normaliseN8nResponse(
  body: unknown,
  ctx: { jobId: string; requestId: string | null },
): NormaliseResult {
  if (!isObj(body)) return { ok: false, reason: 'n8n response is not a JSON object' };

  // Some n8n flows wrap the package one level deep (e.g. body.data.package).
  // Resolve those common shapes before looking up the article keys.
  let payload: Record<string, unknown> = body;
  for (const wrap of ['package', 'result', 'data']) {
    const cand = payload[wrap];
    if (isObj(cand) && (cand.ru_article || cand.uz_article || cand.articles)) {
      payload = cand;
      break;
    }
  }

  // If n8n flattens to articles[], hand off to that shape directly.
  if (Array.isArray(payload.articles) && payload.articles.length > 0) {
    return buildBundleFromArticles(payload, payload.articles, ctx);
  }

  const ru = pickArticle(payload, 'ru_article', 'article_ru', 'ru');
  const uz = pickArticle(payload, 'uz_article', 'article_uz', 'uz');
  if (!ru && !uz) {
    return { ok: false, reason: 'n8n response missing both ru_article and uz_article' };
  }

  const articles: Record<string, unknown>[] = [];
  if (ru) articles.push(normaliseArticle(ru, 'ru'));
  if (uz) articles.push(normaliseArticle(uz, 'uz'));

  return buildBundleFromArticles(payload, articles, ctx);
}

function buildBundleFromArticles(
  payload: Record<string, unknown>,
  rawArticles: unknown[],
  ctx: { jobId: string; requestId: string | null },
): NormaliseResult {
  if (!Array.isArray(rawArticles) || rawArticles.length === 0) {
    return { ok: false, reason: 'no articles to normalise' };
  }

  // Pull n8n execution metadata for deterministic bundle_id when present.
  const executionId =
    asStr((payload as { execution_id?: unknown }).execution_id)
    || asStr((payload as { executionId?: unknown }).executionId)
    || null;

  const bundleId = executionId
    ? `n8n-bridge-${executionId.replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 100)}`
    : `n8n-bridge-${ctx.jobId}`;

  const validationRaw = isObj(payload.validation) ? payload.validation : { passed: true, issues: [] };
  const validation = {
    passed: validationRaw.passed === true,
    issues: Array.isArray(validationRaw.issues) ? validationRaw.issues : [],
  };
  const validationStatus: 'passed' | 'failed' = validation.passed ? 'passed' : 'failed';
  const generationStatus = asStr((payload as { status?: unknown }).status) || null;

  const articles = rawArticles.map((a) => {
    if (isObj(a) && (a.locale === 'ru' || a.locale === 'uz')) return normaliseArticle(a, a.locale);
    if (isObj(a)) return normaliseArticle(a, 'ru'); // n8n is RU-first; fall back if locale missing.
    return null;
  }).filter(Boolean) as Array<Record<string, unknown>>;

  const bundle: AiDraftBundle = {
    schema_version: AI_DRAFT_SCHEMA_VERSION,
    source: 'n8n-seo-autopilot-bridge',
    bundle_id: bundleId,
    execution_id: executionId || ctx.jobId,
    // Forced safe values; never trust upstream.
    status: 'pending_review',
    manual_approval_required: true,
    ready_for_publish: false,
    published: false,
    seo_brief: isObj(payload.seo_brief) ? payload.seo_brief : null,
    validation,
    // Articles are typed loosely here; the downstream validator does the
    // strict typing + sanitisation pass.
    articles: articles as AiDraftBundle['articles'],
  };

  return {
    ok: true,
    bundle,
    meta: {
      n8n_execution_id: executionId,
      generation_status: generationStatus,
      validation_status: validationStatus,
      validation_passed: validation.passed,
      validation_issue_count: validation.issues.length,
    },
  };
}
