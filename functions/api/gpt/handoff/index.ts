// POST /api/gpt/handoff — hand the current web conversation to Telegram.
//
// Body:  { sessionId?, locale?, pageUrl?, intent? }
// Reply: { ok, configured, linked, deepLink, payload, expiresAt, reason? }
//
// The browser asks for the link instead of building it. That is the whole
// point: if the page could assemble `t.me/<bot>?start=<sessionId>` itself,
// then the session id — a bearer handle to a stored conversation — would be
// the thing that unlocks it, in a string Telegram echoes back as plain text.
// Here the id never leaves the browser; the server mints a separate, opaque,
// single-use token and returns a finished link.
//
// It degrades in two visible steps rather than failing:
//   configured:false          no bot @username is set → no link at all, and
//                             the client falls back to the studio contact.
//   linked:false              the bot is real but this request could not be
//                             given a token (no D1, a write failure, or the
//                             per-IP ceiling). The person still gets a working
//                             link to the bot, just without the context.
import type { Env } from '../../../_types';
import { resolveConfig } from '../../../lib/gpt-chat/config';
import { ensureSchema } from '../../../lib/gpt-chat/schema';
import { json, fail, readJson } from '../../../lib/gpt-chat/http';
import { hashIp, getClientIp } from '../../../lib/gpt-chat/hash';
import { normalizePagePath, normLocale } from '../../../lib/gpt-chat/validate';
import { resolveBridgeLimits, type BridgeEnv } from '../../../lib/gpt-chat/bridge-env';
import { consumeRateLimit, HOUR_MS } from '../../../lib/gpt-chat/rate-limit';
import { deepLinkFor, mintHandoff, pruneHandoffs, resolveHandoffConfig } from '../../../lib/gpt-chat/handoff';

interface HandoffBody {
  sessionId?: string;
  locale?: string;
  pageUrl?: string;
  intent?: string;
}

/** The plain, contextless entry the existing bot already understands. */
function fallbackLink(botUsername: string, locale: 'ru' | 'uz'): string {
  return deepLinkFor(botUsername, locale === 'uz' ? 'site_uz' : 'site_ru');
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const bridgeEnv = env as BridgeEnv;
  const handoff = resolveHandoffConfig(bridgeEnv);
  const body = (await readJson<HandoffBody>(request)) || {};
  const locale = normLocale(body.locale);

  if (!handoff.configured) {
    return json({
      ok: true,
      configured: false,
      linked: false,
      deepLink: null,
      payload: null,
      expiresAt: null,
      reason: 'bot_unconfigured',
    });
  }

  const db = env.GPTBOT_DRAFTS_DB;
  const unlinked = (reason: string) =>
    json({
      ok: true,
      configured: true,
      linked: false,
      deepLink: fallbackLink(handoff.botUsername, locale),
      payload: null,
      expiresAt: null,
      reason,
    });

  if (!db) return unlinked('storage_unavailable');

  const cfg = resolveConfig(env);
  const limits = resolveBridgeLimits(bridgeEnv);
  try {
    await ensureSchema(db);
  } catch {
    return unlinked('storage_unavailable');
  }

  const hashedIp = await hashIp(getClientIp(request), cfg.hashSalt);
  const gate = await consumeRateLimit(db, 'handoff', hashedIp, { limit: limits.handoffPerHour, windowMs: HOUR_MS });
  // Minting is cheap but it writes a row, so it is capped. Being over the cap
  // must not cut somebody off from the only route to a human, so the answer is
  // a working link without context — not a refusal.
  if (!gate.allowed) return unlinked('rate_limited');

  const sessionId = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId.slice(0, 64) : null;
  const intent = typeof body.intent === 'string' ? body.intent.trim().slice(0, 60) || null : null;

  try {
    const minted = await mintHandoff(db, handoff, {
      sessionId,
      locale,
      pageUrl: normalizePagePath(body.pageUrl),
      intent,
    });
    if (Math.random() < 0.05) waitUntil(pruneHandoffs(db));
    return json({
      ok: true,
      configured: true,
      linked: true,
      deepLink: minted.deepLink,
      payload: minted.payload,
      expiresAt: minted.expiresAt,
    });
  } catch {
    return unlinked('mint_failed');
  }
};

export const onRequest: PagesFunction<Env> = async () => fail('method_not_allowed', 'Use POST', 405);
