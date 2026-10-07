// POST /api/studio/presentations/:job/regenerate — make a full deck once more
// (spec §2.4, §6). :job is the original job.
//
// Body: the same fields as the start, {requestId, topic, locale, audience,
// slides, shape:"full", palette}. Answer 201 like the start, with
// source:"regen" and regenOf; next:"outline". The same request id again
// answers the same job.
//
// One regeneration per spent unit of a paid deck, of the SAME task (its
// input_mac: topic, language, audience, slides, palette), by the same buyer,
// within 24 hours of the result and the entitlement's term, never of a
// regeneration (jobs.ts regenVerdict; the partial unique index keeps it to
// one even for two requests at once). It runs exactly like the first
// generation (the same shape and parts, the proofreading pass for Uzbek)
// and takes no unit, so money never refuses it; the site's pace, the
// returned-attempts cap and the day's paid bucket still apply.
//   another task                    409 regen_mismatch
//   already regenerated / a regen   409 regen_used
//   too late, a free deck, the entitlement over or revoked
//                                   409 regen_window
//   not done (open, released, refused)
//                                   409 job_state
//   not the buyer's job, no session 404
import type { BillingEnv } from "../../../../lib/gpt-chat/billing-config";
import { readJsonLimited } from "../../../../lib/gpt-chat/http";
import { sameOrigin } from "../../../../lib/gpt-chat/identity-store";
import { deckOpen, studioGate, studioRequestConfig } from "../../../../lib/studio/config";
import { accountToken, buyerSubject, readBuyer } from "../../../../lib/studio/full-deck";
import { fail, json, notFound, studioLog } from "../../../../lib/studio/http";
import { identityConfigured } from "../../../../lib/studio/identity";
import { startJob } from "../../../../lib/studio/jobs";
import { LedgerStore, deckInputMac, isJobId } from "../../../../lib/studio/ledger";
import { paceJobStart, paceSiteJobStart, recordStudioAlerts, siteJobRoom } from "../../../../lib/studio/limits";
import { createdAnswer, ensureDeckSchema, readCreateRequest } from "../../../../lib/studio/presentation";

const MAX_BODY_BYTES = 4096;
const EVENT = "studio_regenerate";

export const onRequest: PagesFunction<BillingEnv, "job"> = async ({ request, env, params, waitUntil }) => {
  const closed = studioGate(request, env, "regenerate");
  if (closed) return closed;
  if (request.method !== "POST") return fail("method_not_allowed", {}, { Allow: "POST" });
  if (!sameOrigin(request)) return fail("invalid");
  const jobId = typeof params.job === "string" ? params.job : "";
  if (!isJobId(jobId)) return notFound();
  const config = studioRequestConfig(request, env);
  if (!deckOpen(config, "full")) return notFound();
  const token = accountToken(request);
  if (!token) return notFound();
  const now = Date.now();

  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || !identityConfigured(env)) {
    studioLog(EVENT, "studio_not_configured");
    return fail("studio_not_configured");
  }
  const body = await readJsonLimited<unknown>(request, MAX_BODY_BYTES);
  if (!body.ok) return fail(body.code);
  const create = readCreateRequest(body.value, config);
  if (!create || create.task.shape !== "full") return fail("invalid");
  const { task, requestId } = create;
  const inputMac = await deckInputMac(env, task);
  if (!inputMac) return fail("studio_not_configured");

  let subject: string;
  try {
    await ensureDeckSchema(db);
    const userId = await readBuyer(db, token, now);
    if (!userId) return notFound();
    subject = buyerSubject(userId);
    const earlier = await new LedgerStore(db).byRequest(subject, requestId);
    if (earlier) {
      // A retry of the same regeneration: the job it made.
      const same = earlier.source === "regen" && earlier.regenOf === jobId && earlier.inputMac === inputMac;
      return same ? json({ ...createdAnswer(earlier, task), regenOf: jobId }, 201) : fail("invalid");
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
    source: { kind: "regen", regenOf: jobId },
    now,
    sitePace: () => paceSiteJobStart(db, config, now),
  });
  if (started.alerts.length) waitUntil(recordStudioAlerts(env, started.alerts));
  if (!started.ok) {
    studioLog(EVENT, started.code);
    const headers: Record<string, string> = started.retryAfterSeconds ? { "Retry-After": String(started.retryAfterSeconds) } : {};
    return fail(started.code, started.resetsAt ? { resetsAt: started.resetsAt } : {}, headers);
  }
  // input_mac covers the kind of deck, so the original was a full deck of this very task.
  studioLog(EVENT, started.replay ? "replayed" : "created");
  return json({ ...createdAnswer(started.job, task), regenOf: jobId }, 201);
};
