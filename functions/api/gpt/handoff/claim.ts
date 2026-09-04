// POST /api/gpt/handoff/claim — redeem a /start payload, once.
//
// The Telegram side of this bridge lives in the SAME Functions bundle, so the
// direct call is the preferred one:
//
//     import { claimHandoff } from '../../lib/gpt-chat/handoff';
//     const claim = await claimHandoff(db, startPayload, { claimedBy: pseudoId });
//
// This endpoint exists for the out-of-process consumer — the Railway backend,
// or a bot worker deployed separately — and is authenticated with the existing
// GPTBOT_INTERNAL_API_SECRET, the same secret the Railway gateway already uses.
//
// It is NOT a public surface. When that secret is unset the route answers 404
// as though it were never deployed, so a half-configured environment cannot
// leave a token oracle exposed on the open internet.
//
// Body:  { payload: string, claimedBy?: string }
// Reply: { ok: true, sessionId, locale, pageUrl, intent, createdAt, claimedAt }
//        { ok: false, code: 'invalid'|'not_found'|'expired'|'already_claimed' }
//
// Both shapes are HTTP 200: a replayed or stale link is a normal thing for a
// bot to handle (greet without context), not a transport error.
import type { Env } from '../../../_types';
import { ensureSchema } from '../../../lib/gpt-chat/schema';
import { json, fail, readJson } from '../../../lib/gpt-chat/http';
import { claimHandoff } from '../../../lib/gpt-chat/handoff';

interface ClaimBody {
  payload?: string;
  claimedBy?: string;
}

/** Length-independent comparison so the secret cannot be probed byte by byte. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const expected = env.GPTBOT_INTERNAL_API_SECRET;
  if (!expected) return fail('not_found', 'Not found', 404);
  if (!secretMatches(request.headers.get('X-Internal-Secret'), expected)) {
    return fail('unauthorized', 'Unauthorized', 401);
  }

  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return fail('storage_unavailable', 'Storage unavailable', 503);

  const body = (await readJson<ClaimBody>(request)) || {};
  try {
    await ensureSchema(db);
  } catch {
    return fail('storage_unavailable', 'Storage unavailable', 503);
  }

  const claim = await claimHandoff(db, body.payload, {
    claimedBy: typeof body.claimedBy === 'string' ? body.claimedBy : null,
  });
  if (!claim.ok) return json({ ok: false, code: claim.reason });

  return json({
    ok: true,
    sessionId: claim.sessionId,
    locale: claim.locale,
    pageUrl: claim.pageUrl,
    intent: claim.intent,
    createdAt: claim.createdAt,
    claimedAt: claim.claimedAt,
  });
};

export const onRequest: PagesFunction<Env> = async () => fail('method_not_allowed', 'Use POST', 405);
