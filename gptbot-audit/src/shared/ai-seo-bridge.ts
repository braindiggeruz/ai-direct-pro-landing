// Shared helper for the AI SEO Editor Bridge.
//
// Goal: after an admin approves AI patch fields, take the approved-fields
// snapshot (recorded in content/seo/ai-runs.json by apply-patch) and turn it
// into a safe draft patch for either PageEditor or BlogEditor.
//
// Hard rules:
//   - Only fields explicitly listed in P0_SAFE_FIELDS are mapped.
//   - slug, url, canonical, status, robots* are NEVER touched.
//   - If the URL does not belong to the editor entity, the bridge returns
//     `mismatch` and the editor refuses to apply.
//   - Unsupported fields are recorded under `skipped` so the editor can show
//     a warning row.
//
// This module is pure (no React, no env) and is shared between admin SPA and
// the offline test suite (scripts/test-ai-seo-patch.ts).

import type { AiPatchFieldKey } from './ai-seo';

export type EditorTarget = 'page' | 'blog';

export interface EditorRoute {
  target: EditorTarget;
  locale: 'ru' | 'uz';
  slug: string;
  path: string; // navigation path inside /admin-tools/*
}

/**
 * Detect whether a URL belongs to a Page or a Blog article and produce the
 * matching admin editor route.
 *
 * Examples:
 *   /ru/ai-bot-dlya-biznesa/        → page,  /admin-tools/pages/ru/ai-bot-dlya-biznesa
 *   /uz/biznes-uchun-ai-bot/        → page,  /admin-tools/pages/uz/biznes-uchun-ai-bot
 *   /ru/blog/ai-bot-zadachi/        → blog,  /admin-tools/blog/ru/ai-bot-zadachi
 *   /uz/blog/biznes-zadachalar/     → blog,  /admin-tools/blog/uz/biznes-zadachalar
 *
 * Returns null for any URL that is not a content URL the editor can handle
 * (admin/api/random/draft URLs, missing locale, etc).
 */
export function parseEditorRoute(url: string): EditorRoute | null {
  if (typeof url !== 'string' || !url.startsWith('/')) return null;
  // Block dangerous prefixes outright.
  if (
    url.startsWith('/admin-tools') ||
    url.startsWith('/api/') ||
    url.startsWith('/draft/') ||
    url.startsWith('/test/') ||
    url.startsWith('/random/')
  ) return null;

  const trimmed = url.replace(/^\/+/, '').replace(/\/+$/, '');
  const parts = trimmed.split('/');
  if (parts.length < 2) return null;

  const locale = parts[0];
  if (locale !== 'ru' && locale !== 'uz') return null;

  if (parts[1] === 'blog' && parts.length >= 3) {
    const slug = parts[2];
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) return null;
    return {
      target: 'blog',
      locale,
      slug,
      path: `/admin-tools/blog/${locale}/${slug}`,
    };
  }

  // Page URLs are /<locale>/<slug>/  (single segment after locale).
  if (parts.length === 2) {
    const slug = parts[1];
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) return null;
    return {
      target: 'page',
      locale,
      slug,
      path: `/admin-tools/pages/${locale}/${slug}`,
    };
  }

  return null;
}

/**
 * Subset of AI patch fields the Editor Bridge is allowed to forward.
 * Anything not in this set is reported under `skipped` and never applied.
 */
export const P0_BRIDGE_FIELDS = {
  page: new Set<AiPatchFieldKey>([
    'title',
    'description',
    'h1',
    'heroSubtitle',
    'ogTitle',
    'ogDescription',
    'faq',
    'internalLinks',
  ]),
  blog: new Set<AiPatchFieldKey>([
    'title',
    'description',
    'h1',
    'intro',
    'ogTitle',
    'ogDescription',
    'faq',
    'internalLinks',
    'topicCluster',
    'targetMoneyPage',
    'keywords',
  ]),
} as const;

/** Fields explicitly rejected from the bridge even if approved. */
export const BRIDGE_FORBIDDEN_FIELDS = new Set<string>([
  'slug',
  'url',
  'canonical',
  'status',
  'robotsIndex',
  'robotsFollow',
  'hreflangRu',
  'hreflangUz',
]);

export interface BridgeMappingResult {
  /** Safe-to-apply field key → value snapshot. */
  patch: Record<string, unknown>;
  /** Field keys that were dropped (not in allowed set for this target). */
  skipped: string[];
}

/**
 * Map an AI-approved field snapshot to an editor draft patch.
 * Pure function, no side-effects.
 */
export function mapApprovedFieldsToEditorDraft(
  applied: Record<string, unknown> | null | undefined,
  target: EditorTarget,
): BridgeMappingResult {
  const patch: Record<string, unknown> = {};
  const skipped: string[] = [];
  if (!applied || typeof applied !== 'object') {
    return { patch, skipped };
  }
  const allowed = P0_BRIDGE_FIELDS[target];
  for (const [key, value] of Object.entries(applied)) {
    if (BRIDGE_FORBIDDEN_FIELDS.has(key)) {
      skipped.push(key);
      continue;
    }
    if (!allowed.has(key as AiPatchFieldKey)) {
      skipped.push(key);
      continue;
    }
    if (value === undefined || value === null) continue;
    patch[key] = value;
  }
  return { patch, skipped };
}

export interface DraftHandoff {
  runId: string;
  url: string;
  target: EditorTarget;
  locale: 'ru' | 'uz';
  slug: string;
  applied: Record<string, unknown>;
  approvedFields: string[];
  createdAt: string;
}

/** sessionStorage key prefix used for the fallback handoff path. */
export const DRAFT_STORAGE_PREFIX = 'aiSeoDraft:';

export function draftStorageKey(runId: string): string {
  return `${DRAFT_STORAGE_PREFIX}${runId}`;
}
