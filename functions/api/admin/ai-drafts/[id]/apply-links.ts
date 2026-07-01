// POST /api/admin/ai-drafts/:id/apply-links
//
// Persists accepted CTR-boost suggestions into the article's
// internal_links list. Re-validates the article via the existing
// strict schema before committing.
//
// Body:
//   { locale: 'ru'|'uz',
//     accepted: Array<{ target: string; anchor: string; type?: string }> }
//
// Behaviour:
//   * JWT auth required.
//   * Targets MUST already exist in the inventory (or be the article's
//     current target_money_page) — the server defends against invented
//     URLs even though the suggest-links endpoint already filters.
//   * Existing internal_links are kept; new ones are appended deduped
//     by target.
//   * Status STAYS pending_review.
//   * Audit row written with action='ctr_boost_apply'.
//   * No auto publish, no IndexNow.

import type { Env } from '../../../../_types';
import { requireAuth } from '../../../../lib/jwt';
import { getDraft, replaceDraftArticle } from '../../../../lib/ai-drafts/store';
import { buildContentInventory } from '../../../../lib/intent-guard/inventory';
import { validateArticle, type ValidationError } from '../../../../lib/ai-drafts/validators';
import type { InternalLink } from '../../../../../src/shared/types';
import { jsonResponse } from '../../../../lib/api-errors';
import { buildSeoWarnings } from '../../../../lib/seo-validation';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const id = String(params.id || '');
  if (!id) return jsonResponse({ error: 'Missing draft id' }, 400);
  if (!env.GPTBOT_DRAFTS_DB) return jsonResponse({ error: 'Draft storage not configured.' }, 503);

  const body = (await request.json().catch(() => null)) as null | {
    locale?: string;
    accepted?: Array<{ target?: unknown; anchor?: unknown; type?: unknown }>;
  };
  const locale = body?.locale === 'ru' || body?.locale === 'uz' ? body.locale : null;
  if (!locale) return jsonResponse({ error: 'locale must be "ru" or "uz"' }, 400);
  if (!Array.isArray(body?.accepted) || body.accepted.length === 0) {
    return jsonResponse({ error: 'accepted[] required (at least 1 link).' }, 400);
  }
  if (body.accepted.length > 12) {
    return jsonResponse({ error: 'too many links (max 12).' }, 400);
  }

  const draft = await getDraft(env, id);
  if (!draft) return jsonResponse({ error: 'Draft not found' }, 404);
  if (draft.status === 'rejected' || draft.status === 'imported') {
    return jsonResponse({ error: `Draft is ${draft.status} — cannot apply CTR boost.` }, 409);
  }
  const article = locale === 'ru' ? draft.ru_article : draft.uz_article;
  if (!article) return jsonResponse({ error: `Draft does not contain a ${locale.toUpperCase()} article.` }, 400);

  // Build the set of allowed targets (inventory URLs + current money page).
  const inventory = await buildContentInventory(env);
  const allowedTargets = new Set<string>();
  for (const it of inventory.items) if (it.url) allowedTargets.add(it.url);
  if (article.target_money_page) allowedTargets.add(article.target_money_page);

  // Sanitise + dedupe accepted suggestions. The UI passes a 'type' field
  // ('money'/'cluster'/'sibling') for display logic — we ignore it on
  // persist because InternalLink.type only allows the strict
  // contextual|block|footer|popular|breadcrumb enum. Body-aware CTR
  // boost links are always 'contextual'.
  const incoming: InternalLink[] = [];
  const seen = new Set<string>((article.internal_links || []).map((l) => l.target));
  for (const raw of body.accepted) {
    const target = typeof raw.target === 'string' ? raw.target.trim() : '';
    const anchor = typeof raw.anchor === 'string' ? raw.anchor.trim() : '';
    if (!target || !anchor) continue;
    if (anchor.length < 4 || anchor.length > 120) continue;
    if (!allowedTargets.has(target)) continue; // defence against invented URLs
    if (seen.has(target)) continue;
    seen.add(target);
    incoming.push({ target, anchor, locale, type: 'contextual' });
  }
  if (incoming.length === 0) {
    return jsonResponse({ error: 'No valid links accepted (all duplicates, unknown URLs, or malformed).' }, 422);
  }

  // Build the candidate article + re-validate end-to-end.
  const candidate = {
    ...article,
    internal_links: [...(article.internal_links || []), ...incoming],
  };
  const errors: ValidationError[] = [];
  const validated = validateArticle(candidate, 'article', errors);
  if (!validated) {
    return jsonResponse({ error: 'Validation failed after merge.', validation_errors: errors.slice(0, 50) }, 422);
  }
  // Force locale and slug — never let the merge change either.
  validated.locale = locale;
  validated.slug = article.slug;

  const issues = buildSeoWarnings(validated, { locale });
  const validation = { passed: issues.length === 0, issues };

  try {
    const updated = await replaceDraftArticle(
      env,
      id,
      locale,
      validated,
      validation,
      auth.email,
      {
        action: 'ctr_boost_apply',
        added_links: incoming.length,
        targets: incoming.map((l) => l.target),
      },
      'ctr_boost_apply',
    );
    if (!updated) return jsonResponse({ error: 'Draft vanished mid-update.' }, 404);
    return jsonResponse({ ok: true, draft: updated, added: incoming.length });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message || 'apply failed' }, 500);
  }
};
