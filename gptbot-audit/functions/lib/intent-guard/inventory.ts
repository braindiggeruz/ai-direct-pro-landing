// Build the unified content inventory used by every Intent Guard query.
//
// Sources:
//   1. GitHub content/* (money pages + blog) via the existing GraphQL
//      bulk read in functions/lib/github.ts.
//   2. D1 ai_drafts (pending_review + needs_revision drafts).
//   3. D1 seo_topic_reservations (active reservations from other plans).
//   4. Optional in-memory "this draft" for self-exclusion.
//
// The inventory is computed per request. We do NOT cache it: the cost is
// 1 GraphQL subrequest + a handful of D1 reads, well within wallclock,
// and caching would risk reading stale conflict data right after the
// admin just imported a new draft.

import type { Env } from '../../_types';
import type { BlogArticle, Page } from '../../../src/shared/types';
import type { ContentInventory, ContentInventoryItem, IntentFingerprint } from '../../../src/shared/intent-guard';
import { readContentBulk } from '../github';
import { buildFingerprint, intentKeyOf } from './fingerprint';

function headingsFromPage(page: Page): string[] {
  return [
    page.h1,
    ...(page.bodyBlocks || []).filter((b) => b.type === 'h2' || b.type === 'h3').map((b) => b.text || ''),
  ].filter(Boolean);
}

function headingsFromBlog(b: BlogArticle): string[] {
  return [
    b.h1,
    ...(b.body || []).filter((x) => x.type === 'h2' || x.type === 'h3').map((x) => x.text || ''),
  ].filter(Boolean);
}

function faqQuestionsFromPage(p: Page): string[] {
  return (p.faq || []).map((x) => x.q).filter(Boolean);
}

function faqQuestionsFromBlog(b: BlogArticle): string[] {
  return (b.faq || []).map((x) => x.q).filter(Boolean);
}

function targetsFromPage(p: Page): string[] {
  return (p.internalLinks || []).map((l) => l.target).filter(Boolean);
}

function targetsFromBlog(b: BlogArticle): string[] {
  return (b.internalLinks || []).map((l) => l.target).filter(Boolean);
}

function pageToItem(p: Page): ContentInventoryItem {
  const fp: IntentFingerprint = buildFingerprint({
    locale: p.locale,
    meta_title: p.title,
    h1: p.h1,
    excerpt: p.description,
    target_keyword: p.primaryKeyword,
    target_money_page: p.url,
    slug: p.slug,
  });
  return {
    source_type: 'money_page',
    id: p.url,
    url: p.url,
    locale: p.locale,
    title: p.title || '',
    h1: p.h1 || '',
    slug: p.slug,
    status: p.status,
    target_keyword: p.primaryKeyword || '',
    target_money_page: p.url,
    headings: headingsFromPage(p),
    faq_questions: faqQuestionsFromPage(p),
    internal_link_targets: targetsFromPage(p),
    fingerprint: fp,
    intent_key: intentKeyOf(fp),
  };
}

function blogToItem(b: BlogArticle): ContentInventoryItem {
  const fp: IntentFingerprint = buildFingerprint({
    locale: b.locale,
    meta_title: b.title,
    h1: b.h1,
    excerpt: b.intro,
    target_keyword: (b.keywords || [])[0] || b.title || '',
    target_money_page: b.targetMoneyPage,
    slug: b.slug,
  });
  return {
    source_type: 'blog',
    id: b.url || `/${b.locale}/blog/${b.slug}/`,
    url: b.url || `/${b.locale}/blog/${b.slug}/`,
    locale: b.locale,
    title: b.title || '',
    h1: b.h1 || '',
    slug: b.slug,
    status: b.status,
    target_keyword: (b.keywords || [])[0] || '',
    target_money_page: b.targetMoneyPage || null,
    headings: headingsFromBlog(b),
    faq_questions: faqQuestionsFromBlog(b),
    internal_link_targets: targetsFromBlog(b),
    fingerprint: fp,
    intent_key: intentKeyOf(fp),
  };
}

interface DraftRow {
  id: string;
  status: string;
  ru_article_json: string | null;
  uz_article_json: string | null;
  target_money_page: string | null;
}

function articleToItem(
  draftId: string,
  status: string,
  raw: string | null,
  source_type: ContentInventoryItem['source_type'] = 'ai_draft',
): ContentInventoryItem | null {
  if (!raw) return null;
  let a: Record<string, unknown>;
  try { a = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  const locale = (a.locale === 'ru' || a.locale === 'uz') ? (a.locale as 'ru' | 'uz') : 'ru';
  const headings: string[] = Array.isArray(a.body_blocks)
    ? (a.body_blocks as Array<{ type?: string; text?: string }>).filter((b) => b.type === 'h2' || b.type === 'h3').map((b) => b.text || '').filter(Boolean)
    : [];
  const faqQuestions: string[] = Array.isArray(a.faq)
    ? (a.faq as Array<{ q?: string }>).map((f) => f.q || '').filter(Boolean)
    : [];
  const linkTargets: string[] = Array.isArray(a.internal_links)
    ? (a.internal_links as Array<{ target?: string }>).map((l) => l.target || '').filter(Boolean)
    : [];
  const fp = buildFingerprint({
    locale,
    meta_title: String(a.meta_title || a.title || ''),
    h1: String(a.h1 || ''),
    excerpt: String(a.excerpt || a.intro || ''),
    target_keyword: String(a.target_keyword || ''),
    target_money_page: typeof a.target_money_page === 'string' ? a.target_money_page : null,
    slug: String(a.slug || ''),
  });
  return {
    source_type,
    id: `${draftId}#${locale}`,
    url: null,
    locale,
    title: String(a.meta_title || a.title || ''),
    h1: String(a.h1 || ''),
    slug: String(a.slug || ''),
    status,
    target_keyword: String(a.target_keyword || ''),
    target_money_page: typeof a.target_money_page === 'string' ? a.target_money_page : null,
    headings,
    faq_questions: faqQuestions,
    internal_link_targets: linkTargets,
    fingerprint: fp,
    intent_key: intentKeyOf(fp),
  };
}

async function loadDraftItems(env: Env): Promise<ContentInventoryItem[]> {
  if (!env.GPTBOT_DRAFTS_DB) return [];
  const r = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT id, status, ru_article_json, uz_article_json, target_money_page
              FROM ai_drafts
              WHERE status IN ('pending_review','needs_revision')`)
    .all<DraftRow>();
  const out: ContentInventoryItem[] = [];
  for (const row of r.results || []) {
    const ru = articleToItem(row.id, row.status, row.ru_article_json);
    if (ru) out.push(ru);
    const uz = articleToItem(row.id, row.status, row.uz_article_json);
    if (uz) out.push(uz);
  }
  return out;
}

interface ReservationRow {
  id: string; locale: 'ru' | 'uz'; intent_key: string; primary_keyword: string;
  planned_title: string | null; target_money_page: string | null; plan_id: string | null;
  plan_item_id: string | null;
}

async function loadReservationItems(env: Env): Promise<ContentInventoryItem[]> {
  if (!env.GPTBOT_DRAFTS_DB) return [];
  let r: { results?: ReservationRow[] } = { results: [] };
  try {
    r = await env.GPTBOT_DRAFTS_DB
      .prepare(`SELECT id, locale, intent_key, primary_keyword, planned_title, target_money_page, plan_id, plan_item_id
                FROM seo_topic_reservations
                WHERE status IN ('reserved','generating','generated','analyzed','needs_retarget','ready_for_review')`)
      .all<ReservationRow>();
  } catch {
    // Table may not exist yet during the first deploy. Treat as empty.
    return [];
  }
  return (r.results || []).map((row): ContentInventoryItem => {
    const fp = buildFingerprint({
      locale: row.locale,
      meta_title: row.planned_title || row.primary_keyword,
      h1: row.planned_title || row.primary_keyword,
      target_keyword: row.primary_keyword,
      target_money_page: row.target_money_page,
      slug: '',
    });
    return {
      source_type: 'reserved_topic',
      id: row.id,
      url: null,
      locale: row.locale,
      title: row.planned_title || row.primary_keyword,
      h1: row.planned_title || '',
      slug: '',
      status: 'reserved',
      target_keyword: row.primary_keyword,
      target_money_page: row.target_money_page,
      headings: [],
      faq_questions: [],
      internal_link_targets: [],
      fingerprint: fp,
      intent_key: row.intent_key || intentKeyOf(fp),
    };
  });
}

/** Heavy: 1 GraphQL + ≤ 2 D1 reads. ≤ 50 ms typical in production. */
export async function buildContentInventory(env: Env): Promise<ContentInventory> {
  const githubContent = await readContentBulk(env).catch((): Record<string, string> => ({}));
  const pages: Page[] = [];
  const blog: BlogArticle[] = [];
  for (const [path, text] of Object.entries(githubContent)) {
    if (!path.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(text);
      if (path.startsWith('content/pages/')) pages.push(parsed as Page);
      else if (path.startsWith('content/blog/')) blog.push(parsed as BlogArticle);
    } catch { /* skip */ }
  }
  const pageItems = pages.filter((p) => p.status === 'published').map(pageToItem);
  const blogItems = blog.filter((b) => b.status === 'published').map(blogToItem);
  const draftItems = await loadDraftItems(env).catch(() => []);
  const reservationItems = await loadReservationItems(env).catch(() => []);

  return {
    generated_at: new Date().toISOString(),
    items: [...pageItems, ...blogItems, ...draftItems, ...reservationItems],
    counts: {
      pages_total: pages.length,
      pages_published: pages.filter((p) => p.status === 'published').length,
      blog_total: blog.length,
      blog_published: blog.filter((b) => b.status === 'published').length,
      drafts_pending: draftItems.length,
      reservations_active: reservationItems.length,
    },
  };
}
