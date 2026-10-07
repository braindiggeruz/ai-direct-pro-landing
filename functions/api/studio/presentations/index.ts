// POST /api/studio/presentations — start a deck job (spec §6, §7.1): the
// free deck (STUDIO_API + STUDIO_FREE_DECK) or the full deck
// (STUDIO_PAID_SERVICE + STUDIO_FULL_DECK, a unit of the buyer's
// entitlement; full-deck.ts).
//
// Body: {requestId, topic (3–200), locale "uz"|"ru", audience
// "maktab"|"talaba"|"umumiy", slides (free 4–6; full 6–STUDIO_MAX_SLIDES),
// shape "free"|"full", palette (free 1; full 1–3), turnstileToken (free)}.
// Answer 201 {ok, jobId, source, entitlementId?, shape:{slides, images,
// notes, palette, parts}, next:"slides"|"outline", expiresAt}; the same
// request id again answers the same job, without a second unit or Turnstile.
//
// Order, cheapest refusal first:
//   1. switches and host (studioGate): 404 before anything is read;
//   2. POST from this origin only;
//   3. who asks, without D1: the browser identity (__Host-studio_bid) or the
//      Studio account's session cookie (__Host-studio_account); neither:
//      401 identity_required;
//   4. D1, GPT_IDENTITY_SECRET and the studio's Turnstile secret: else 503
//      studio_not_configured (fail-closed);
//   5. the body (4 KiB): 400 invalid; a deck whose own switches are off: 404.
// The free deck (a browser identity, else 401 identity_required):
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
// The full deck (a Studio account with a live session; none: 402 no_units,
// the island then shows the tariffs). Paid generations go by the buyer's
// session, without Turnstile (spec §5.2):
//   6. the topic, as above (the memory keyed by the account);
//   7. the same request id: the job it made;
//   8. the account's own pace (429) and the site's minute, read (503);
//   9. the unit: the live entitlement of the account in this host's mode
//      that ends soonest and still has a full deck (jobs.ts startJob: 402
//      no_units, 409 job_in_progress, 429 try_later, 503 studio_busy).
// Nothing of the topic is written or logged: the row keeps only input_mac.
import type { BillingEnv } from "../../../lib/gpt-chat/billing-config";
import { readJsonLimited } from "../../../lib/gpt-chat/http";
import { sameOrigin } from "../../../lib/gpt-chat/identity-store";
import { deckOpen, studioGate, studioRequestConfig, type StudioConfig } from "../../../lib/studio/config";
import { accountToken, buyerSubject, entitlementMode, readBuyer } from "../../../lib/studio/full-deck";
import { fail, json, studioLog } from "../../../lib/studio/http";
import { identityConfigured, readIdentity, type StudioIdentity } from "../../../lib/studio/identity";
import { startJob, type StartJobResult } from "../../../lib/studio/jobs";
import { LedgerStore, deckInputMac } from "../../../lib/studio/ledger";
import { paceJobStart, paceSiteJobStart, recordStudioAlerts, siteJobRoom, studioAddress, type StudioAlert } from "../../../lib/studio/limits";
import { createdAnswer, ensureDeckSchema, readCreateRequest, type CreateRequest } from "../../../lib/studio/presentation";
import { refusalKey, screenTopic, topicRefusals } from "../../../lib/studio/safety";
import { studioTurnstileConfigured, verifyStudioTurnstile } from "../../../lib/studio/turnstile";

const MAX_BODY_BYTES = 4096;
const EVENT = "studio_presentation";

type Waiter = (promise: Promise<unknown>) => void;

/** A refused topic costs nobody anything: no unit, no model call, no row. Null: the topic may go on. */
async function refusedTopic(env: BillingEnv, subject: string, topic: string, now: number): Promise<Response | null> {
  const key = await refusalKey(env.GPT_IDENTITY_SECRET as string, subject, topic);
  const remembered = topicRefusals.get(key, now);
  if (remembered) {
    studioLog(EVENT, "topic_refused");
    return fail("topic_refused", { category: remembered });
  }
  const screen = screenTopic(topic);
  if (!screen.ok) {
    topicRefusals.set(key, screen.category, now);
    studioLog(EVENT, "topic_refused");
    return fail("topic_refused", { category: screen.category });
  }
  return null;
}

/** The answer of a start: 201 with the job, or the refusal with its reset time and Retry-After. */
function startedAnswer(started: StartJobResult, create: CreateRequest, env: BillingEnv, waitUntil: Waiter): Response {
  const alerts: readonly StudioAlert[] = started.alerts;
  if (alerts.length) waitUntil(recordStudioAlerts(env, alerts));
  if (!started.ok) {
    studioLog(EVENT, started.code);
    const headers: Record<string, string> = started.retryAfterSeconds ? { "Retry-After": String(started.retryAfterSeconds) } : {};
    return fail(started.code, started.resetsAt ? { resetsAt: started.resetsAt } : {}, headers);
  }
  studioLog(EVENT, started.replay ? "replayed" : "created");
  return json(createdAnswer(started.job, create.task), 201);
}

interface StartContext {
  readonly request: Request;
  readonly env: BillingEnv;
  readonly db: D1Database;
  readonly config: StudioConfig;
  readonly create: CreateRequest;
  readonly now: number;
  readonly waitUntil: Waiter;
}

async function startFree(context: StartContext, identity: StudioIdentity): Promise<Response> {
  const { request, env, db, config, create, now } = context;
  const { task, requestId } = create;
  const refused = await refusedTopic(env, identity.subject, task.topic, now);
  if (refused) return refused;

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
  return startedAnswer(started, create, env, context.waitUntil);
}

async function startFull(context: StartContext, token: string | null): Promise<Response> {
  const { env, db, config, create, now } = context;
  const { task, requestId } = create;
  // Never bought (no Studio session): nothing to spend. The island shows the tariffs.
  if (!token) return fail("no_units");
  const inputMac = await deckInputMac(env, task);
  if (!inputMac) return fail("studio_not_configured");

  let userId: string | null;
  try {
    await ensureDeckSchema(db);
    userId = await readBuyer(db, token, now);
  } catch {
    studioLog(EVENT, "studio_busy");
    return fail("studio_busy");
  }
  if (!userId) return fail("no_units");
  const subject = buyerSubject(userId);
  const refused = await refusedTopic(env, subject, task.topic, now);
  if (refused) return refused;

  try {
    const earlier = await new LedgerStore(db).byRequest(subject, requestId);
    if (earlier) {
      const same = earlier.tool === "presentation" && earlier.source === "entitlement" && earlier.shape === "full" && earlier.inputMac === inputMac;
      return same ? json(createdAnswer(earlier, task), 201) : fail("invalid");
    }
  } catch {
    studioLog(EVENT, "studio_busy");
    return fail("studio_busy");
  }

  const own = await paceJobStart(db, subject, now);
  const pace = own.ok ? await siteJobRoom(db, config, now) : own;
  if (!pace.ok) {
    studioLog(EVENT, pace.code);
    return fail(pace.code, {}, { "Retry-After": String(pace.retryAfterSeconds) });
  }

  const started = await startJob(db, {
    config,
    subject,
    requestId,
    tool: "presentation",
    shape: "full",
    slides: task.slides,
    inputMac,
    source: { kind: "entitlement", userId, mode: entitlementMode(config) },
    now,
    sitePace: () => paceSiteJobStart(db, config, now),
  });
  return startedAnswer(started, create, env, context.waitUntil);
}

export const onRequest: PagesFunction<BillingEnv> = async ({ request, env, waitUntil }) => {
  const closed = studioGate(request, env, "presentations");
  if (closed) return closed;
  if (request.method !== "POST") return fail("method_not_allowed", {}, { Allow: "POST" });
  if (!sameOrigin(request)) return fail("invalid");
  const config = studioRequestConfig(request, env);
  const now = Date.now();

  const identity = await readIdentity(request, env, now);
  const token = accountToken(request);
  if (!identity && !token) return fail("identity_required");
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || !identityConfigured(env) || !studioTurnstileConfigured(request, env)) {
    studioLog(EVENT, "studio_not_configured");
    return fail("studio_not_configured");
  }

  const body = await readJsonLimited<unknown>(request, MAX_BODY_BYTES);
  if (!body.ok) return fail(body.code);
  const create = readCreateRequest(body.value, config);
  if (!create) return fail("invalid");
  if (!deckOpen(config, create.task.shape)) return fail("not_found");
  const context: StartContext = { request, env, db, config, create, now, waitUntil };
  if (create.task.shape === "full") return startFull(context, token);
  if (!identity) return fail("identity_required");
  return startFree(context, identity);
};
