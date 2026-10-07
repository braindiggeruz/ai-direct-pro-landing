// POST /api/studio/presentations/:job/outline — step 1 of a full deck: the
// plan (spec §6, §7.1; full-deck.ts).
//
// Body: the task the job was started with, {topic, locale, audience, slides,
// palette}. The server keeps no text, so the browser sends it again; it is
// accepted only if it hashes to the job's input_mac (else 400 invalid).
// Only the buyer's own job (the session of __Host-studio_account): any other
// job, or none, is 404.
//
// One model step (llm.ts: glm-5.3-flash, outline 1 300 tokens, at most 2
// calls, never another model for a paid unit), metered on the job (jobs.ts
// jobMeter: the `steps` cap and the studio_paid bucket). Then:
//   ok       the outline is checked (deck-schema.ts checkOutline) and
//            Uzbek-normalized; the first 8 picture prompts that pass the word
//            lists go through ONE Llama Guard call, the kept ones are signed
//            for their slides, the outline (titles and points, no prompts)
//            for the job (sign.ts). It leaves only after bit 0 was written
//            (jobs.ts handOut): 200 {ok, outline, sig, images, parts}. The
//            pictures may start now; the parts carry the outline back.
//   fault    bit 0 is marked (jobs.ts failPart); the browser may call once
//            more while the job has calls left, else the unit goes back at
//            once: 502 model_failed / 503 studio_busy / model_unavailable /
//            422 invalid_output, {retry}.
//   refused  Z.ai refused the content (1301): the job is closed as refused,
//            the unit goes back, and the same topic from the same buyer is
//            refused for 10 minutes without a model call: 422 topic_refused
//            {category: "provider"}, no content.
// A request the person aborted is not a fault: the job simply expires.
import type { BillingEnv } from "../../../../lib/gpt-chat/billing-config";
import { readJsonLimited } from "../../../../lib/gpt-chat/http";
import { sameOrigin } from "../../../../lib/gpt-chat/identity-store";
import { deckOpen, studioGate, studioRequestConfig } from "../../../../lib/studio/config";
import { checkOutline } from "../../../../lib/studio/deck-schema";
import {
  buyerSubject,
  hasBuyerCookie,
  outlinePicturePicks,
  readBuyer,
  signedOutlineOf,
  type OutlineContent,
} from "../../../../lib/studio/full-deck";
import { fail, json, notFound, studioLog } from "../../../../lib/studio/http";
import { identityConfigured } from "../../../../lib/studio/identity";
import { screenPicturePrompts } from "../../../../lib/studio/images";
import { OUTLINE_BIT, failPart, handOut, isOpen, jobMeter, refuseJob } from "../../../../lib/studio/jobs";
import { LedgerStore, deckInputMac, isJobId, type LedgerJob } from "../../../../lib/studio/ledger";
import { recordStudioAlerts, type StudioAlert } from "../../../../lib/studio/limits";
import { runTextStep } from "../../../../lib/studio/llm";
import { ensureDeckSchema, readDeckTask } from "../../../../lib/studio/presentation";
import { outlineMessages } from "../../../../lib/studio/prompts";
import { aiRunner, refusalKey, topicRefusals } from "../../../../lib/studio/safety";
import { signImagePrompts, signOutline, signingConfigured } from "../../../../lib/studio/sign";

const MAX_BODY_BYTES = 4096;
const EVENT = "studio_outline";

export const onRequest: PagesFunction<BillingEnv, "job"> = async ({ request, env, params, waitUntil }) => {
  const closed = studioGate(request, env, "outline");
  if (closed) return closed;
  if (request.method !== "POST") return fail("method_not_allowed", {}, { Allow: "POST" });
  if (!sameOrigin(request)) return fail("invalid");
  const jobId = typeof params.job === "string" ? params.job : "";
  if (!isJobId(jobId)) return notFound();
  if (!hasBuyerCookie(request)) return notFound();
  const config = studioRequestConfig(request, env);
  const now = Date.now();

  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || !identityConfigured(env) || !signingConfigured(env)) {
    studioLog(EVENT, "studio_not_configured");
    return fail("studio_not_configured");
  }
  const body = await readJsonLimited<unknown>(request, MAX_BODY_BYTES);
  if (!body.ok) return fail(body.code);

  let job: LedgerJob | null;
  let subject: string;
  try {
    await ensureDeckSchema(db);
    const userId = await readBuyer(request, db, now);
    if (!userId) return notFound();
    subject = buyerSubject(userId);
    job = await new LedgerStore(db).get(jobId);
  } catch {
    studioLog(EVENT, "studio_busy");
    return fail("studio_busy");
  }
  // Another person's job is as good as none.
  if (!job || job.subject !== subject || job.tool !== "presentation" || job.shape !== "full" || !deckOpen(config, "full")) return notFound();
  const task = readDeckTask(body.value, config, "full");
  if (!task || (await deckInputMac(env, task)) !== job.inputMac) return fail("invalid");
  if (!isOpen(job, now) || (job.partsDone & OUTLINE_BIT) !== 0) return fail("job_state");

  const alerts: StudioAlert[] = [];
  const flushAlerts = () => {
    if (alerts.length) waitUntil(recordStudioAlerts(env, alerts));
  };
  const meter = jobMeter(db, config, job, "outline");
  const result = await runTextStep({
    env,
    config,
    tier: "paid",
    step: "outline",
    messages: outlineMessages(task),
    check: (raw) => checkOutline(raw, { locale: task.locale, topic: task.topic, slides: task.slides }),
    admit: meter.admit,
    signal: request.signal,
  });
  await meter.settle(result.calls);
  alerts.push(...meter.alerts);

  if (!result.ok) {
    flushAlerts();
    studioLog(EVENT, result.kind === "fault" ? result.fault : result.kind);
    if (result.kind === "refused") {
      await refuseJob(db, job, "provider_refused");
      topicRefusals.set(await refusalKey(env.GPT_IDENTITY_SECRET as string, subject, task.topic), "provider");
      return fail("topic_refused", { category: "provider" });
    }
    if (result.kind === "halted") return fail("job_state");
    // The person went away: not a server fault; the job expires on its own.
    if (request.signal?.aborted) return fail(result.code);
    const marked = await failPart(db, job, OUTLINE_BIT, result.fault);
    return fail(result.code, { retry: marked.marked && !marked.released });
  }

  // The pictures: the first 8 prompts that pass the word lists, one Llama
  // Guard call over them, then a signature each. Any refusal drops the
  // pictures, never the deck.
  const picks = outlinePicturePicks(result.value);
  let kept = picks;
  if (picks.length) {
    const screen = await screenPicturePrompts(db, config, job, aiRunner(env), picks.map((pick) => pick.prompt));
    if (!screen.ok) {
      alerts.push(...screen.alerts);
      studioLog(EVENT, `pictures_${screen.reason}`);
      kept = [];
    }
  }
  const outline = signedOutlineOf(result.value);
  const sig = await signOutline(env, job.id, outline);
  const images = (await signImagePrompts(env, job.id, kept)) ?? [];
  flushAlerts();
  if (!sig) return fail("studio_not_configured");

  const content: OutlineContent = { outline, sig, images, parts: job.partsTotal - 1 };
  const delivered = await handOut(db, job, OUTLINE_BIT, content, Date.now());
  if (!delivered.ok) {
    studioLog(EVENT, delivered.code);
    return fail(delivered.code);
  }
  studioLog(EVENT, "delivered");
  return json({ ok: true, ...delivered.content });
};
