// POST /api/studio/identity {turnstileToken} — issue __Host-studio_bid (spec §5.1, §6).
//
// Order, cheapest refusal first:
//   1. the switch and the host (studioGate): 404 before anything is read;
//   2. POST from this origin only;
//   3. a valid identity cookie already: {ok}, no new cookie, no Turnstile;
//   4. GPT_IDENTITY_SECRET, the studio's Turnstile secret and D1 present,
//      else 503 studio_not_configured (fail-closed);
//   5. the body (4 KiB at most);
//   6. 600 tries an hour per address (studio_identity_try), counted for
//      every request that gets this far, a missing or malformed token
//      included: it keeps Siteverify from being hammered (429);
//   7. the address's identities of the hour (studio_identity, 60) are READ:
//      a full hour is 429 before Siteverify;
//   8. Turnstile, action studio_identity;
//   9. only now the identity counts (studio_identity, 429 past 60): a
//      client without a valid token can never fill it, so one host behind a
//      mobile operator's shared address cannot lock new visitors out;
//  10. a fresh identity in a Set-Cookie. Nothing is written about it: the
//      cookie carries its own signature.
// A D1 failure on either counter refuses (503); it never waves a request through.
// Logs: {event, code} only.
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { readJsonLimited } from "../../lib/gpt-chat/http";
import { sameOrigin } from "../../lib/gpt-chat/identity-store";
import { ensureSchema } from "../../lib/gpt-chat/schema";
import { studioGate } from "../../lib/studio/config";
import { fail, json, studioLog } from "../../lib/studio/http";
import { identityConfigured, mintIdentity, readIdentity } from "../../lib/studio/identity";
import { identityRoom, paceIdentity, paceIdentityTry, studioAddress } from "../../lib/studio/limits";
import { studioTurnstileConfigured, verifyStudioTurnstile } from "../../lib/studio/turnstile";

/** A Turnstile token is at most 2 048 characters; the rest is JSON. */
const MAX_BODY_BYTES = 4096;

export const onRequest: PagesFunction<BillingEnv> = async ({ request, env }) => {
  const closed = studioGate(request, env, "identity");
  if (closed) return closed;
  if (request.method !== "POST") return fail("method_not_allowed", {}, { Allow: "POST" });
  if (!sameOrigin(request)) return fail("invalid");
  const now = Date.now();
  if (await readIdentity(request, env, now)) return json({ ok: true });

  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || !identityConfigured(env) || !studioTurnstileConfigured(request, env)) {
    studioLog("studio_identity", "studio_not_configured");
    return fail("studio_not_configured");
  }
  const body = await readJsonLimited<unknown>(request, MAX_BODY_BYTES);
  if (!body.ok) return fail(body.code);
  if (typeof body.value !== "object" || body.value === null || Array.isArray(body.value)) return fail("bad_json");
  const token = (body.value as { turnstileToken?: unknown }).turnstileToken;

  try {
    // gpt_rate_limits lives in the chat's bootstrap (no migration creates it).
    await ensureSchema(db);
  } catch {
    studioLog("studio_identity", "studio_busy");
    return fail("studio_busy");
  }
  const address = await studioAddress(request, env, now);
  const tried = await paceIdentityTry(db, address, now);
  const room = tried.ok ? await identityRoom(db, address, now) : tried;
  if (!room.ok) {
    studioLog("studio_identity", room.code);
    return fail(room.code, {}, { "Retry-After": String(room.retryAfterSeconds) });
  }
  const check = await verifyStudioTurnstile(request, env, token, "studio_identity");
  if (!check.ok) {
    studioLog("studio_identity", check.code);
    return fail(check.code);
  }
  // Counted only for a request that passed Turnstile.
  const pace = await paceIdentity(db, address, now);
  if (!pace.ok) {
    studioLog("studio_identity", pace.code);
    return fail(pace.code, {}, { "Retry-After": String(pace.retryAfterSeconds) });
  }
  const minted = await mintIdentity(env, now);
  if (!minted) return fail("studio_not_configured");
  studioLog("studio_identity", "issued");
  return json({ ok: true }, 200, { "Set-Cookie": minted.cookie });
};
