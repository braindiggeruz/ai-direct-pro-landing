// POST /api/studio/presentations/:job/slides — write the free deck (spec §6,
// §7.1). The parts of a full deck ({part, outline, sig}) arrive with T3.1;
// a full job answers 404 until then.
//
// Body: the task the job was started with, {topic, locale, audience, slides,
// palette}. The server keeps no text, so the browser sends it again; it is
// accepted only if it hashes to the job's input_mac (else 400 invalid).
//
// One model step (llm.ts: glm-5.3-flash, at most 2 calls, the ':free'
// fallback for the free deck only), metered on the job (jobs.ts jobMeter:
// the `steps` cap and the studio_free bucket). Then:
//   ok       the deck is checked (deck-schema.ts) and Uzbek-normalized; the
//            image prompts go through the word lists (the first 2 that pass)
//            and ONE Llama Guard call, and the kept ones are signed for this
//            job (sign.ts). The deck leaves only after bit 0 was written
//            (jobs.ts handOut): 200 {ok, part, deck, images, done}.
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
import { deckOpen, studioGate, studioRequestConfig } from "../../../../lib/studio/config";
import { checkFreeDeck } from "../../../../lib/studio/deck-schema";
import { fail, json, notFound, studioLog } from "../../../../lib/studio/http";
import { identityConfigured, readIdentity } from "../../../../lib/studio/identity";
import { screenPicturePrompts } from "../../../../lib/studio/images";
import { OUTLINE_BIT, failPart, handOut, isOpen, jobMeter, loadJob, refuseJob } from "../../../../lib/studio/jobs";
import { deckInputMac, isJobId } from "../../../../lib/studio/ledger";
import { recordStudioAlerts, type StudioAlert } from "../../../../lib/studio/limits";
import { runTextStep } from "../../../../lib/studio/llm";
import { DECK_SHAPES } from "../../../../lib/studio/plans";
import { ensureDeckSchema, freeDeckContent, readDeckTask } from "../../../../lib/studio/presentation";
import { freeMessages } from "../../../../lib/studio/prompts";
import { aiRunner, pickImagePrompts, refusalKey, topicRefusals } from "../../../../lib/studio/safety";
import { signImagePrompts, signingConfigured } from "../../../../lib/studio/sign";

const MAX_BODY_BYTES = 4096;
const EVENT = "studio_slides";

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
  if (!identity) return fail("identity_required");
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || !identityConfigured(env) || !signingConfigured(env)) {
    studioLog(EVENT, "studio_not_configured");
    return fail("studio_not_configured");
  }
  const body = await readJsonLimited<unknown>(request, MAX_BODY_BYTES);
  if (!body.ok) return fail(body.code);

  let job;
  try {
    await ensureDeckSchema(db);
    job = await loadJob(db, jobId, identity.subject);
  } catch {
    studioLog(EVENT, "studio_busy");
    return fail("studio_busy");
  }
  // Another person's job is as good as none. A full deck's parts are T3.1's.
  if (!job || job.tool !== "presentation" || job.shape !== "free" || !deckOpen(config, "free")) return notFound();
  const task = readDeckTask(body.value, config, "free");
  if (!task || (await deckInputMac(env, task)) !== job.inputMac) return fail("invalid");
  if (!isOpen(job, now) || (job.partsDone & OUTLINE_BIT) !== 0) return fail("job_state");

  const alerts: StudioAlert[] = [];
  const flushAlerts = () => {
    if (alerts.length) waitUntil(recordStudioAlerts(env, alerts));
  };
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

  if (!result.ok) {
    flushAlerts();
    studioLog(EVENT, result.kind === "fault" ? result.fault : result.kind);
    if (result.kind === "refused") {
      await refuseJob(db, job, "provider_refused");
      topicRefusals.set(await refusalKey(env.GPT_IDENTITY_SECRET as string, identity.subject, task.topic), "provider");
      return fail("topic_refused", { category: "provider" });
    }
    if (result.kind === "halted") return fail("job_state");
    // The person went away: not a server fault; the job expires on its own.
    if (request.signal?.aborted) return fail(result.code);
    const marked = await failPart(db, job, OUTLINE_BIT, result.fault);
    return fail(result.code, { retry: marked.marked && !marked.released });
  }

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
  flushAlerts();

  const delivered = await handOut(db, job, OUTLINE_BIT, freeDeckContent(result.value, signed), Date.now());
  if (!delivered.ok) {
    studioLog(EVENT, delivered.code);
    return fail(delivered.code);
  }
  studioLog(EVENT, "delivered");
  return json({ ok: true, ...delivered.content, done: delivered.state === "done" });
};
