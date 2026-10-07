// Issue a signed browser identity after a single-use Turnstile check.
// Short concurrent Siteverify leases bound flood load; failed challenges
// never accumulate an hour-long debt for everyone behind the same NAT.
// Only verified identities spend the 60/hour issuance counter.
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { readJsonLimited } from "../../lib/gpt-chat/http";
import { sameOrigin } from "../../lib/gpt-chat/identity-store";
import { ensureSchema } from "../../lib/gpt-chat/schema";
import { studioGate } from "../../lib/studio/config";
import { fail, json, studioLog } from "../../lib/studio/http";
import { identityConfigured, mintIdentity, readIdentity } from "../../lib/studio/identity";
import { identityRoom, paceIdentity, studioAddress } from "../../lib/studio/limits";
import { challengeHash, VerificationStore } from "../../lib/studio/verification-store";
import { repeatingLocalTestWidget, studioTurnstileConfigured, verifyStudioTurnstile } from "../../lib/studio/turnstile";

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
  if (typeof token !== "string" || !token.trim() || token.length > 2048) return fail("turnstile_required");

  try {
    // gpt_rate_limits lives in the chat's bootstrap (no migration creates it).
    await ensureSchema(db);
  } catch {
    studioLog("studio_identity", "studio_busy");
    return fail("studio_busy");
  }
  const address = await studioAddress(request, env, now);
  const room = await identityRoom(db, address, now);
  if (!room.ok) {
    studioLog("studio_identity", room.code);
    return fail(room.code, {}, { "Retry-After": String(room.retryAfterSeconds) });
  }
  const verifications = new VerificationStore(db);
  let lease: string | null = null;
  let check: Awaited<ReturnType<typeof verifyStudioTurnstile>>;
  try {
    const verificationToken = repeatingLocalTestWidget(request, env) ? `${token}:${crypto.randomUUID()}` : token;
    lease = await verifications.claim(address, await challengeHash(env.GPT_IDENTITY_SECRET!, verificationToken), now);
    if (!lease) return fail("studio_busy", {}, { "Retry-After": "7" });
    check = await verifyStudioTurnstile(request, env, token, "studio_identity");
  } catch {
    return fail("studio_busy", {}, { "Retry-After": "7" });
  } finally {
    if (lease) await verifications.release(lease).catch(() => undefined);
  }
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
