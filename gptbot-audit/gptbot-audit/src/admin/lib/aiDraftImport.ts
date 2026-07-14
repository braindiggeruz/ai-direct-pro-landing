// Client-side helper for the AI Draft Inbox → Blog Editor handoff.
//
// The admin SPA does NOT round-trip the full article through the URL.
// Instead, when the reviewer clicks "Import RU/UZ to Blog Editor":
//
//   1. We POST /api/admin/ai-drafts/<id>/import which writes an audit entry
//      and flips ru/uz_imported_at in D1.
//   2. We persist the article payload in sessionStorage under
//      `aiDraftImport:<draftId>:<locale>`.
//   3. We navigate to /admin-tools/blog/new?aiDraftImport=<draftId>&aiDraftLocale=<locale>.
//   4. The existing BlogEditor reads the handoff in its mount effect,
//      hydrates local state, and shows the existing AI-import banner.
//
// SessionStorage is appropriate because:
//   - It is per-tab and cleared on close, so secrets in the article body
//     don't persist forever.
//   - It is large enough for full bilingual articles (no URL-length cap).

import type { AiDraftArticle } from '../../shared/ai-drafts';

export const AI_DRAFT_IMPORT_SESSION_PREFIX = 'aiDraftImport:';

export interface AiDraftImportHandoff {
  draftId: string;
  bundleId: string;
  locale: 'ru' | 'uz';
  article: AiDraftArticle;
  seoBrief?: Record<string, unknown> | null;
}

function key(draftId: string, locale: 'ru' | 'uz'): string {
  return `${AI_DRAFT_IMPORT_SESSION_PREFIX}${draftId}:${locale}`;
}

export function storeAiDraftHandoff(
  draftId: string,
  locale: 'ru' | 'uz',
  handoff: AiDraftImportHandoff,
): void {
  try {
    sessionStorage.setItem(key(draftId, locale), JSON.stringify(handoff));
  } catch {
    // Storage full or disabled — the editor will show "handoff missing".
  }
}

export function readAiDraftHandoff(
  draftId: string,
  locale: 'ru' | 'uz',
): AiDraftImportHandoff | null {
  try {
    const raw = sessionStorage.getItem(key(draftId, locale));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AiDraftImportHandoff;
    if (parsed?.draftId !== draftId || parsed?.locale !== locale) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAiDraftHandoff(draftId: string, locale: 'ru' | 'uz'): void {
  try { sessionStorage.removeItem(key(draftId, locale)); } catch { /* ignore */ }
}

export function buildBlogEditorImportUrl(
  draftId: string,
  locale: 'ru' | 'uz',
  suggestedSlug?: string,
): string {
  const qs = new URLSearchParams();
  qs.set('aiDraftImport', draftId);
  qs.set('aiDraftLocale', locale);
  if (suggestedSlug) qs.set('aiDraftSlug', suggestedSlug);
  return `/admin-tools/blog/new?${qs.toString()}`;
}
