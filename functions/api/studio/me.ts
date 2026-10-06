// GET /api/studio/me — what this browser has left (spec §6). The free part.
//
// Open while STUDIO_API or STUDIO_PAID_SERVICE is on (studioGate). Without a
// valid __Host-studio_bid the answer needs no D1: identity false and the full
// daily limits. With one, the two counters of today (studio_free_usage, two
// primary-key reads in one batch) give what is left. The day is the UTC date,
// so the units come back at 05:00 in Tashkent.
//
// The paid part (account, entitlements, latest order, receipts) arrives with
// T3.2; until then it answers the empty values of the same shape.
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { studioGate } from "../../lib/studio/config";
import { freeLeft, type FreeLeft } from "../../lib/studio/free-usage";
import { fail, json, studioLog } from "../../lib/studio/http";
import { readIdentity } from "../../lib/studio/identity";
import { ensureStudioSchema } from "../../lib/studio/schema";

export const onRequest: PagesFunction<BillingEnv> = async ({ request, env }) => {
  const closed = studioGate(request, env, "me");
  if (closed) return closed;
  if (request.method !== "GET" && request.method !== "HEAD") return fail("method_not_allowed", {}, { Allow: "GET" });
  const now = Date.now();
  const identity = await readIdentity(request, env, now);
  const db = env.GPTBOT_DRAFTS_DB;
  if (identity && !db) return fail("studio_not_configured");
  let free: FreeLeft;
  try {
    if (identity && db) await ensureStudioSchema(db);
    free = await freeLeft(identity ? db ?? null : null, identity?.subject ?? null, now);
  } catch {
    studioLog("studio_me", "studio_busy");
    return fail("studio_busy");
  }
  return json({
    ok: true,
    identity: identity !== null,
    free,
    account: null,
    entitlements: [],
    latestOrder: null,
    receipts: [],
  });
};
