// GET /api/studio/me — what this browser has left (spec §6). The free part.
//
// Open while STUDIO_API or STUDIO_PAID_SERVICE is on (studioGate). Without a
// valid __Host-studio_bid the answer needs no D1: identity false and the full
// daily limits. With one:
//   1. the person's own expired jobs are closed by the expiry rules first
//      (jobs.ts expireOwnJobs: one indexed read of ≤ 20 rows, a guarded close
//      only for an expired job), so a unit owed back (a job that faulted,
//      was dropped mid-request or never got its model) is back before it is
//      counted. Until the maintenance sweep runs (T4.3) nothing else gives
//      it back, and the island reads `left` before it ever starts a job;
//   2. the two counters of today (studio_free_usage, two primary-key reads
//      in one batch) give what is left;
//   3. a unit an open job still holds says until when (`openUntil`): the
//      island then says "try again after HH:MM", not "used for today".
// The day is the UTC date, so the units come back at 05:00 in Tashkent.
//
// The paid part (account, entitlements, latest order, receipts) arrives with
// T3.2; until then it answers the empty values of the same shape.
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { studioGate } from "../../lib/studio/config";
import { freeLeft, type FreeLeft } from "../../lib/studio/free-usage";
import { fail, json, studioLog } from "../../lib/studio/http";
import { readIdentity } from "../../lib/studio/identity";
import { expireOwnJobs, type OwnJobs } from "../../lib/studio/jobs";
import { ensureDeckSchema } from "../../lib/studio/presentation";

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
    let own: OwnJobs = { closed: 0, open: [] };
    if (identity && db) {
      // expireOwnJobs settles open reservations too (gpt_model_spend): the deck schema, not only the studio's.
      await ensureDeckSchema(db);
      own = await expireOwnJobs(db, identity.subject, now);
    }
    free = await freeLeft(identity ? db ?? null : null, identity?.subject ?? null, now, own.open);
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
