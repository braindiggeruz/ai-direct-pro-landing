// POST /api/studio/presentations/:job/slides — write the free deck, or one
// part of a full deck (spec §6, §7.1).
//
// Free deck. Body: the task the job was started with, {topic, locale,
// audience, slides, palette}. The server keeps no text, so the browser sends
// it again; it is accepted only if it hashes to the job's input_mac (else
// 400 invalid). Only the browser's own job (__Host-studio_bid).
//
// Full deck. Body: the task, plus {part (1..P), outline, sig}: the outline
// as POST /:job/outline handed it out and its signature (sign.ts; a changed,
// foreign or unsigned outline is 400 outline_tampered). Only the buyer's own
// job (the session of __Host-studio_account). The part is the plan indexes
// of prompts.ts partIndexes (≤ 4 slides with the talk); the parts run at
// once, each its own request, and only after the outline went out (bit 0).
// A paid Uzbek part then goes through the proofreading pass (proofread.ts):
// its failure leaves the part as written, never the unit. Part 1 also
// carries the cover (title, subtitle), proofread with it.
//
// One model step (llm.ts: glm-5.3-flash, at most 2 calls; the ':free'
// fallback for the free deck only, never for a paid unit), metered on the
// job (jobs.ts jobMeter: the `steps` cap and the studio_free / studio_paid
// bucket). Then:
//   ok       the text is checked (deck-schema.ts) and Uzbek-normalized. The
//            free deck: the image prompts go through the word lists (the
//            first 2 that pass) and ONE Llama Guard call, and the kept ones
//            are signed for this job (sign.ts). The content leaves only after
//            its bit was written (jobs.ts handOut): 200 {ok, part, deck,
//            images (free), done}.
//   fault    the part is marked (jobs.ts failPart); the browser may call
//            once more while the job has calls left, else the unit goes
//            back at once: 502 model_failed / 503 studio_busy /
//            model_unavailable / 422 invalid_output, {retry}.
//   refused  Z.ai refused the content (1301): the job is closed as refused,
//            the unit goes back, and the same topic from the same person is
//            refused for 10 minutes without a model call: 422 topic_refused
//            {category: "provider"}, no content.
// A request the person aborted is not a fault: the job simply expires.
import type { BillingEnv } from "../../../../lib/gpt-chat/billing-config";
import { readJsonLimited } from "../../../../lib/gpt-chat/http";
import { sameOrigin } from "../../../../lib/gpt-chat/identity-store";
import { deckOpen, studioGate, studioRequestConfig, type StudioConfig } from "../../../../lib/studio/config";
import { checkFreeDeck, checkPart, type PartSlide } from "../../../../lib/studio/deck-schema";
import { accountToken, buyerSubject, partContent, partPlan, readBuyer } from "../../../../lib/studio/full-deck";
import { fail, json, notFound, studioLog } from "../../../../lib/studio/http";
import { identityConfigured, readIdentity } from "../../../../lib/studio/identity";
import { screenPicturePrompts } from "../../../../lib/studio/images";
import { OUTLINE_BIT, failPart, handOut, isOpen, jobMeter, refuseJob, slidePartBit } from "../../../../lib/studio/jobs";
import { LedgerStore, deckInputMac, isJobId, type LedgerJob } from "../../../../lib/studio/ledger";
import { recordStudioAlerts, type StudioAlert } from "../../../../lib/studio/limits";
import { runTextStep, type StepResult } from "../../../../lib/studio/llm";
import { DECK_SHAPES } from "../../../../lib/studio/plans";
import { ensureDeckSchema, freeDeckContent, readDeckTask, type DeckTask } from "../../../../lib/studio/presentation";
import { freeMessages, partMessages } from "../../../../lib/studio/prompts";
import { proofreadPart, proofreadWanted, type ProofPart } from "../../../../lib/studio/proofread";
import { aiRunner, pickImagePrompts, refusalKey, topicRefusals } from "../../../../lib/studio/safety";
import { signImagePrompts, signingConfigured, verifyOutline } from "../../../../lib/studio/sign";

/** The free deck's task is ≈ 300 bytes; a full part carries the signed outline of ≤ 15 slides (≈ 9 KB in Russian). */
const MAX_BODY_BYTES = 16_384;
const EVENT = "studio_slides";

interface StepContext {
  readonly request: Request;
  readonly env: BillingEnv;
  readonly db: D1Database;
  readonly config: StudioConfig;
  readonly job: LedgerJob;
  readonly subject: string;
  readonly task: DeckTask;
  readonly alerts: StudioAlert[];
  readonly flushAlerts: () => void;
}

/**
 * A step that did not give a value: a refusal closes the job, a fault marks
 * `bit` (and gives the unit back when the job has no call left), a person
 * who went away ends nothing. The answer carries no content.
 */
async function failedStep(context: StepContext, result: Exclude<StepResult<unknown>, { ok: true }>, bit: number): Promise<Response> {
  const { db, job, env } = context;
  context.flushAlerts();
  studioLog(EVENT, result.kind === "fault" ? result.fault : result.kind);
  if (result.kind === "refused") {
    await refuseJob(db, job, "provider_refused");
    topicRefusals.set(await refusalKey(env.GPT_IDENTITY_SECRET as string, context.subject, context.task.topic), "provider");
    return fail("topic_refused", { category: "provider" });
  }
  if (result.kind === "halted") return fail("job_state");
  // The person went away: not a server fault; the job expires on its own.
  if (context.request.signal?.aborted) return fail(result.code);
  const marked = await failPart(db, job, bit, result.fault);
  return fail(result.code, { retry: marked.marked && !marked.released });
}

async function freeSlides(context: StepContext): Promise<Response> {
  const { request, env, db, config, job, task, alerts } = context;
  if (!isOpen(job, Date.now()) || (job.partsDone & OUTLINE_BIT) !== 0) return fail("job_state");
  const meter = jobMeter(db, config, job, "free");
  const result = await runTextStep({
    env,
    config,
    tier: "free",
    step: "free",
    messages: freeMessages(task),
    check: (raw) => checkFreeDeck(raw, { locale: task.locale, topic: task.topic, slides: task.slides }),
    admit: meter.admit,
    signal: request.signal,
  });
  await meter.settle(result.calls);
  alerts.push(...meter.alerts);
  if (!result.ok) return failedStep(context, result, OUTLINE_BIT);

  // The pictures: the first prompts that pass the word lists, one Llama Guard
  // call over them, then a signature each. Any refusal drops the pictures, not the text.
  const picks = pickImagePrompts(
    result.value.slides.map((slide) => ({ index: slide.index, imagePrompt: slide.imagePrompt })),
    DECK_SHAPES.free.images,
  );
  let kept = picks;
  if (picks.length) {
    const screen = await screenPicturePrompts(db, config, job, aiRunner(env), picks.map((pick) => pick.prompt));
    if (!screen.ok) {
      alerts.push(...screen.alerts);
      studioLog(EVENT, `pictures_${screen.reason}`);
      kept = [];
    }
  }
  const signed = (await signImagePrompts(env, job.id, kept)) ?? [];
  context.flushAlerts();

  const delivered = await handOut(db, job, OUTLINE_BIT, freeDeckContent(result.value, signed), Date.now());
  if (!delivered.ok) {
    studioLog(EVENT, delivered.code);
    return fail(delivered.code);
  }
  studioLog(EVENT, "delivered");
  return json({ ok: true, ...delivered.content, done: delivered.state === "done" });
}

async function fullPart(context: StepContext, body: Record<string, unknown>): Promise<Response> {
  const { request, env, db, config, job, task, alerts } = context;
  const plan = partPlan(job, task.slides, body.part);
  if (!plan) return fail("invalid");
  const verified = await verifyOutline(env, job.id, body.outline, body.sig);
  if (!verified.ok) return fail(verified.code);
  const { outline } = verified;
  if (outline.slides.length !== task.slides) return fail("outline_tampered");
  const bit = slidePartBit(plan.part);
  // A part only after the outline went out, and only once.
  if (!isOpen(job, Date.now()) || (job.partsDone & OUTLINE_BIT) === 0 || (job.partsDone & bit) !== 0) return fail("job_state");

  const meter = jobMeter(db, config, job, "part");
  const checkContext = { locale: task.locale, topic: task.topic };
  const result = await runTextStep({
    env,
    config,
    tier: "paid",
    step: "part",
    messages: partMessages(task, outline, plan.indexes),
    check: (raw) => checkPart(raw, { ...checkContext, indexes: plan.indexes }),
    admit: meter.admit,
    signal: request.signal,
  });
  await meter.settle(result.calls);
  alerts.push(...meter.alerts);
  if (!result.ok) return failedStep(context, result, bit);

  let part: ProofPart = {
    ...(plan.part === 1 ? { title: outline.title, subtitle: outline.subtitle } : {}),
    slides: result.value.slides,
  };
  if (proofreadWanted(config, task.locale, job.source)) {
    const proof = await proofreadPart({ env, config, db, job, context: checkContext, part, signal: request.signal });
    alerts.push(...proof.alerts);
    part = proof.part;
  }
  context.flushAlerts();
  // The person went away while the part was read again: nothing goes out to nobody.
  if (request.signal?.aborted) return fail("model_failed");

  const slides: readonly PartSlide[] = part.slides;
  const cover = plan.part === 1 ? { title: part.title ?? outline.title, subtitle: part.subtitle ?? outline.subtitle } : undefined;
  const delivered = await handOut(db, job, bit, partContent(plan.part, slides, cover), Date.now());
  if (!delivered.ok) {
    studioLog(EVENT, delivered.code);
    return fail(delivered.code);
  }
  studioLog(EVENT, "delivered");
  return json({ ok: true, ...delivered.content, done: delivered.state === "done" });
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export const onRequest: PagesFunction<BillingEnv, "job"> = async ({ request, env, params, waitUntil }) => {
  const closed = studioGate(request, env, "slides");
  if (closed) return closed;
  if (request.method !== "POST") return fail("method_not_allowed", {}, { Allow: "POST" });
  if (!sameOrigin(request)) return fail("invalid");
  const jobId = typeof params.job === "string" ? params.job : "";
  if (!isJobId(jobId)) return notFound();
  const config = studioRequestConfig(request, env);
  const now = Date.now();

  const identity = await readIdentity(request, env, now);
  const token = accountToken(request);
  if (!identity && !token) return fail("identity_required");
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || !identityConfigured(env) || !signingConfigured(env)) {
    studioLog(EVENT, "studio_not_configured");
    return fail("studio_not_configured");
  }
  const body = await readJsonLimited<unknown>(request, MAX_BODY_BYTES);
  if (!body.ok) return fail(body.code);

  let job: LedgerJob | null;
  let subject: string | null = null;
  try {
    await ensureDeckSchema(db);
    job = await new LedgerStore(db).get(jobId);
    if (job?.shape === "full" && token) {
      const userId = await readBuyer(db, token, now);
      subject = userId ? buyerSubject(userId) : null;
    } else if (job?.shape === "free") {
      subject = identity?.subject ?? null;
    }
  } catch {
    studioLog(EVENT, "studio_busy");
    return fail("studio_busy");
  }
  // Another person's job is as good as none; so is a deck whose switches are off.
  if (!job || !subject || job.subject !== subject || job.tool !== "presentation") return notFound();
  if ((job.shape !== "free" && job.shape !== "full") || !deckOpen(config, job.shape)) return notFound();
  const task = readDeckTask(body.value, config, job.shape);
  if (!task || (await deckInputMac(env, task)) !== job.inputMac) return fail("invalid");

  const alerts: StudioAlert[] = [];
  const context: StepContext = {
    request,
    env,
    db,
    config,
    job,
    subject,
    task,
    alerts,
    flushAlerts: () => {
      if (alerts.length) waitUntil(recordStudioAlerts(env, alerts.splice(0)));
    },
  };
  return job.shape === "free" ? freeSlides(context) : fullPart(context, isRecord(body.value) ? body.value : {});
};
