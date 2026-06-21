// Shared types & schema for the AI Draft Inbox.
//
// Drafts arrive from n8n SEO Autopilot via POST /api/admin/ai-drafts.
// They land in the GPTBOT_DRAFTS_DB D1 database as `pending_review` and
// are imported into the existing Blog Editor by a human reviewer.

import type { BodyBlock, FaqItem, InternalLink, Locale, SchemaType } from './types';

export type AiDraftStatus = 'pending_review' | 'needs_revision' | 'imported' | 'rejected';

export const AI_DRAFT_SCHEMA_VERSION = 'gptbot.article-draft.v1';

/**
 * The article payload n8n delivers per locale. Field names map 1:1 to
 * the existing BlogArticle shape used by the Blog Editor.
 */
export interface AiDraftArticle {
  locale: Locale;
  slug: string;
  /** Maps to BlogArticle.title */
  meta_title: string;
  /** Maps to BlogArticle.description */
  meta_description: string;
  h1: string;
  excerpt: string;
  target_keyword: string;
  target_money_page: string;
  author?: string;
  body_blocks: BodyBlock[];
  faq: FaqItem[];
  internal_links: InternalLink[];
  schemas?: SchemaType[];
  /** Optional keywords array (n8n may emit it; otherwise we infer from target_keyword) */
  keywords?: string[];
  /** OG fields (optional). */
  og_title?: string;
  og_description?: string;
  og_image?: string;
}

/**
 * The full bundle n8n posts to /api/admin/ai-drafts.
 * The server forces status, manual_approval_required and ready_for_publish to
 * safe values regardless of what is supplied here.
 */
export interface AiDraftBundle {
  schema_version: string;
  source: string;
  bundle_id: string;
  execution_id?: string;
  status?: string;
  manual_approval_required?: boolean;
  ready_for_publish?: boolean;
  published?: boolean;
  seo_brief?: Record<string, unknown> | null;
  validation?: {
    passed: boolean;
    issues?: Array<{ level?: string; rule?: string; message?: string; field?: string }>;
  } | null;
  articles: AiDraftArticle[];
}

/**
 * Internal row representation used by admin endpoints.
 * `articleRu` / `articleUz` are already parsed.
 */
export interface AiDraftRecord {
  id: string;
  bundle_id: string;
  execution_id: string | null;
  source: string;
  schema_version: string;
  status: AiDraftStatus;

  ru_article: AiDraftArticle | null;
  uz_article: AiDraftArticle | null;
  seo_brief: Record<string, unknown> | null;
  validation: {
    passed: boolean;
    issues: Array<{ level?: string; rule?: string; message?: string; field?: string }>;
  } | null;

  validation_passed: boolean;
  validation_issue_count: number;
  has_ru: boolean;
  has_uz: boolean;
  target_money_page: string | null;
  primary_title: string | null;
  primary_slug: string | null;

  ru_imported_at: string | null;
  uz_imported_at: string | null;

  created_at: string;
  updated_at: string;
  imported_at: string | null;
  rejected_at: string | null;
  review_note: string | null;
}

/** Light row used by the list endpoint. */
export interface AiDraftListRow {
  id: string;
  bundle_id: string;
  source: string;
  status: AiDraftStatus;
  has_ru: boolean;
  has_uz: boolean;
  primary_title: string | null;
  primary_slug: string | null;
  target_money_page: string | null;
  validation_passed: boolean;
  validation_issue_count: number;
  created_at: string;
  updated_at: string;
}

export interface AiDraftAuditEntry {
  id: number;
  draft_id: string;
  action: string;
  actor: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Public-side response from /api/admin/ai-drafts on successful ingestion.
 */
export interface AiDraftIngestResponse {
  success: true;
  draft_id: string;
  bundle_id: string;
  status: AiDraftStatus;
  admin_url: string;
  /** True when the same bundle_id was already stored. The endpoint is idempotent. */
  deduplicated: boolean;
}
