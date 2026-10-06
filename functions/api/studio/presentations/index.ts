// POST /api/studio/presentations — start a deck job (spec §6, §7.1). The free
// deck only: a full deck (STUDIO_PAID_SERVICE + STUDIO_FULL_DECK) arrives with
// T3.1 and answers 404 until then.
//
// Body: {requestId, topic (3–200), locale "uz"|"ru", audience
// "maktab"|"talaba"|"umumiy", slides (free 4–6), shape "free", palette 1,
// turnstileToken}. Answer 201 {ok, jobId, source, shape:{slides, images,
// notes, palette, parts}, next:"slides", expiresAt}; the same request id
// again answers the same job, without a second unit or Turnstile.
//
// Order, cheapest refusal first:
//   1. switches and host (studioGate): 404 before anything is read;
//   2. POST from this origin only;
//   3. the browser identity (__Host-studio_bid, no D1): 401 identity_required;
//   4. D1, GPT_IDENTITY_SECRET and the studio's Turnstile secret: else 503
//      studio_not_configured (fail-closed);
//   5. the body (4 KiB): 400 invalid; a full deck: 404;
//   6. the topic: the narrow refusal list and the 10-minute refusal memory
//      (safety.ts): 422 topic_refused {category}, no unit, no model, no row;
//   7. the same request id: the job it made;
//   8. pace: 6 starts in 10 minutes per person, counted (429); the site's
//      STUDIO_JOB_GLOBAL_PER_MIN only READ (503 when the minute is full).
//      Nothing a request without a valid token does counts for the site,
//      so a few cookies cannot close the free deck for everybody; a D1
//      failure refuses;
//   9. Turnstile, action studio_free_deck (403 / 503);
//  10. the unit (jobs.ts startJob): one open job per person (409
//      job_in_progress + resetsAt, when it expires); the person's own
//      expired jobs closed by the expiry rules (a unit owed back is back);
//      the free day's unit, the IP ceiling of young identities, the ramp,
//      the budget, 5 returns a day (429 free_limit / ip_ceiling / try_later
//      + resetsAt; 503 studio_busy, + resetsAt when it lasts the day); then
//      the start counts for the site (503 studio_busy past the minute's
//      ceiling, the unit back); the ledger row in 'reserved' for 10 minutes.
// Nothing of the topic is written or logged: the row keeps only input_mac.
import type { BillingEnv } from "../../../lib/gpt-chat/billing-config";
import { readJsonLimited } from "../../../lib/gpt-chat/http";
import { sameOrigin } from "../../../lib/gpt-chat/identity-store";
import { deckOpen, studioGate, studioRequestConfig } from "../../../lib/studio/config";
import { fail, json, studioLog } from "../../../lib/studio/http";
import { identityConfigured, readIdentity } from "../../../lib/studio/identity";
import { startJob } from "../../../lib/studio/jobs";
import { LedgerStore, deckInputMac } from "../../../lib/studio/ledger";
import { paceJobStart, paceSiteJobStart, recordStudioAlerts, siteJobRoom, studioAddress, type StudioAlert } from "../../../lib/studio/limits";
import { createdAnswer, ensureDeckSchema, readCreateRequest } from "../../../lib/studio/presentation";
import { refusalKey, screenTopic, topicRefusals } from "../../../lib/studio/safety";
import { studioTurnstileConfigured, verifyStudioTurnstile } from "../../../lib/studio/turnstile";

const MAX_BODY_BYTES = 4096;
const EVENT = "studio_presentation";

export const onRequest: PagesFunction<BillingEnv> = async ({ request, env, waitUntil }) => {
  const closed = studioGate(request, env, "presentations");
  if (closed) return closed;
  if (request.method !== "POST") return fail("method_not_allowed", {}, { Allow: "POST" });
  if (!sameOrigin(request)) return fail("invalid");
  const config = studioRequestConfig(request, env);
  const now = Date.now();

  const identity = await readIdentity(request, env, now);
  if (!identity) return fail("identity_required");
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || !identityConfigured(env) || !studioTurnstileConfigured(request, env)) {
    studioLog(EVENT, "studio_not_configured");
    return fail("studio_not_configured");
  }

  const body = await readJsonLimited<unknown>(request, MAX_BODY_BYTES);
  if (!body.ok) return fail(body.code);
  const create = readCreateRequest(body.value, config);
  if (!create) return fail("invalid");
  const { task, requestId } = create;
  // The full deck is T3.1's; until then it does not exist.
  if (task.shape !== "free" || !deckOpen(config, "free")) return fail("not_found");

  // A refused topic costs nobody anything: no unit, no model call, no row.
  const key = await refusalKey(env.GPT_IDENTITY_SECRET as string, identity.subject, task.topic);
  const remembered = topicRefusals.get(key, now);
  if (remembered) {
    studioLog(EVENT, "topic_refused");
    return fail("topic_refused", { category: remembered });
  }
  const screen = screenTopic(task.topic);
  if (!screen.ok) {
    topicRefusals.set(key, screen.category, now);
    studioLog(EVENT, "topic_refused");
    return fail("topic_refused", { category: screen.category });
  }

  const inputMac = await deckInputMac(env, task);
  if (!inputMac) return fail("studio_not_configured");
  try {
    await ensureDeckSchema(db);
    const earlier = await new LedgerStore(db).byRequest(identity.subject, requestId);
    if (earlier) {
      // A retry of the same start: the job it made, nothing taken twice.
      const same = earlier.tool === "presentation" && earlier.source === "free" && earlier.inputMac === inputMac;
      return same ? json(createdAnswer(earlier, task), 201) : fail("invalid");
    }
  } catch {
    studioLog(EVENT, "studio_busy");
    return fail("studio_busy");
  }

  // The person's own pace is counted (only they can fill it); the site's is
  // only read: it counts after Turnstile and the start's own refusals.
  const own = await paceJobStart(db, identity.subject, now);
  const pace = own.ok ? await siteJobRoom(db, config, now) : own;
  if (!pace.ok) {
    studioLog(EVENT, pace.code);
    return fail(pace.code, {}, { "Retry-After": String(pace.retryAfterSeconds) });
  }
  const check = await verifyStudioTurnstile(request, env, create.turnstileToken, "studio_free_deck");
  if (!check.ok) {
    studioLog(EVENT, check.code);
    return fail(check.code);
  }

  const started = await startJob(db, {
    config,
    subject: identity.subject,
    requestId,
    tool: "presentation",
    shape: "free",
    slides: task.slides,
    inputMac,
    source: { kind: "free", young: identity.young, address: await studioAddress(request, env, now) },
    now,
    sitePace: () => paceSiteJobStart(db, config, now),
  });
  const alerts: readonly StudioAlert[] = started.alerts;
  if (alerts.length) waitUntil(recordStudioAlerts(env, alerts));
  if (!started.ok) {
    studioLog(EVENT, started.code);
    const headers: Record<string, string> = started.retryAfterSeconds ? { "Retry-After": String(started.retryAfterSeconds) } : {};
    return fail(started.code, started.resetsAt ? { resetsAt: started.resetsAt } : {}, headers);
  }
  studioLog(EVENT, started.replay ? "replayed" : "created");
  return json(createdAnswer(started.job, task), 201);
};
