// POST /api/admin/ai-drafts/[id]/import
//
// Marks a per-locale article as imported into the Blog Editor.
// The actual editor pre-fill happens client-side via sessionStorage; this
// endpoint records the import in the audit trail and updates timestamps.
//
// The endpoint NEVER:
//   - writes to /content/blog/**
//   - commits to GitHub
//   - calls IndexNow
//
// It only flips a flag inside D1 and writes one audit row.
//
// Body: { locale: 'ru' | 'uz' }
//
// When both available locales of a bundle have been imported, status moves
// to 'imported' and imported_at is set.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { getDraft, markImported } from '../../../../lib/ai-drafts/store';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const id = String(params.id || '');
  if (!id) return json({ error: 'Missing draft id' }, 400);
  if (!env.GPTBOT_DRAFTS_DB) return json({ error: 'Draft storage not configured.' }, 503);

  let body: { locale?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const locale = body.locale === 'ru' ? 'ru' : body.locale === 'uz' ? 'uz' : null;
  if (!locale) return json({ error: 'locale must be "ru" or "uz"' }, 400);

  const draft = await getDraft(env, id);
  if (!draft) return json({ error: 'Draft not found' }, 404);
  if (locale === 'ru' && !draft.has_ru) return json({ error: 'Bundle has no RU article' }, 400);
  if (locale === 'uz' && !draft.has_uz) return json({ error: 'Bundle has no UZ article' }, 400);
  if (draft.status === 'rejected') return json({ error: 'Cannot import a rejected draft. Un-reject first.' }, 409);

  try {
    const updated = await markImported(env, id, locale, auth.email);
    return json({ draft: updated });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
};
