// POST /api/studio/presentations/:job/images {index, prompt, sig} — one
// picture of a deck as image/jpeg bytes (spec §6, §7.5).
//
// Only a prompt this server signed for this job and slide is drawn (400
// bad_sig), only after the deck's text went out and while the job lives
// (409 job_state), and only under the job's cap of Flux calls, taken with a
// guarded counter so two requests cannot both take the last one (409
// image_cap). Then images.ts paintPicture: the day's budget, Flux, the check
// of the finished picture. A picture that fails is {ok:false, code} with
// image_refused (422) or image_failed (502): the browser redraws the slot
// once, then the slide goes without a picture. A picture never touches the
// unit.
//
// The answer is the bytes with Content-Type image/jpeg, Cache-Control
// no-store and X-Robots-Tag noindex. The browser shows them through
// URL.createObjectURL (never a data: URL, so Webvisor does not record them).
//
// Whose job: a free deck is the browser's (__Host-studio_bid); a full deck
// the buyer's (the session of __Host-studio_account, full-deck.ts). Anyone
// else's job is 404. A full deck draws up to 8 pictures (plans.ts
// DECK_SHAPES.full: 8 + 4 redraws), a free one 2 (+ 2).
import type { BillingEnv } from "../../../../lib/gpt-chat/billing-config";
import { readJsonLimited } from "../../../../lib/gpt-chat/http";
import { sameOrigin } from "../../../../lib/gpt-chat/identity-store";
import { deckOpen, studioGate, studioRequestConfig } from "../../../../lib/studio/config";
import { fail, notFound, studioLog } from "../../../../lib/studio/http";
import { identityConfigured, readIdentity } from "../../../../lib/studio/identity";
import { accountToken, buyerSubject, readBuyer } from "../../../../lib/studio/full-deck";
import { PICTURE_HEADERS, paintPicture } from "../../../../lib/studio/images";
import { LedgerStore, isJobId, type LedgerJob } from "../../../../lib/studio/ledger";
import { recordStudioAlerts } from "../../../../lib/studio/limits";
import { ensureDeckSchema } from "../../../../lib/studio/presentation";
import { aiRunner } from "../../../../lib/studio/safety";
import { checkImageRequest, imageCallCap, signingConfigured, verifyImagePrompt } from "../../../../lib/studio/sign";

/** {index, prompt (≤ 400), sig (22)}: well under 1 KiB. */
const MAX_BODY_BYTES = 2048;
const EVENT = "studio_image";

type DeckJob = LedgerJob & { readonly shape: "free" | "full" };

const isDeck = (job: LedgerJob | null): job is DeckJob =>
  !!job && job.tool === "presentation" && (job.shape === "free" || job.shape === "full");

/** Job `id` if it is the asker's: a free deck the browser's, a full deck the buyer's; else null. */
async function ownDeck(store: LedgerStore, id: string, owners: { readonly browser: string | null; readonly token: string | null }, now: number): Promise<DeckJob | null> {
  const job = await store.get(id);
  if (!isDeck(job)) return null;
  if (job.shape === "free") return job.subject === owners.browser ? job : null;
  const userId = owners.token ? await readBuyer(store.db, owners.token, now) : null;
  return userId && job.subject === buyerSubject(userId) ? job : null;
}

export const onRequest: PagesFunction<BillingEnv, "job"> = async ({ request, env, params, waitUntil }) => {
  const closed = studioGate(request, env, "images");
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
  const owners = { browser: identity?.subject ?? null, token };
  const db = env.GPTBOT_DRAFTS_DB;
  const ai = aiRunner(env);
  if (!db || !ai || !identityConfigured(env) || !signingConfigured(env)) {
    studioLog(EVENT, "studio_not_configured");
    return fail("studio_not_configured");
  }
  const body = await readJsonLimited<unknown>(request, MAX_BODY_BYTES);
  if (!body.ok) return fail(body.code);
  const { index, prompt, sig } = (typeof body.value === "object" && body.value !== null ? body.value : {}) as Record<string, unknown>;
  // No D1 for a forged request: the signature binds job, slide and prompt.
  if (!(await verifyImagePrompt(env, jobId, index, prompt, sig))) {
    studioLog(EVENT, "bad_sig");
    return fail("bad_sig");
  }

  const store = new LedgerStore(db);
  let job: DeckJob | null;
  try {
    await ensureDeckSchema(db);
    job = await ownDeck(store, jobId, owners, now);
  } catch {
    return fail("studio_busy");
  }
  if (!job || !deckOpen(config, job.shape)) return notFound();
  const refusal = checkImageRequest(job, now);
  if (refusal) {
    studioLog(EVENT, refusal);
    return fail(refusal);
  }
  let taken: number | null;
  try {
    taken = await store.takeImageCall(job.id, job.subject, imageCallCap(job.shape), now);
    if (taken === null) {
      // Another request took the last call, or the job closed meanwhile.
      const fresh = await store.get(jobId);
      const code = isDeck(fresh) ? checkImageRequest(fresh, now) ?? "image_cap" : "job_state";
      studioLog(EVENT, code);
      return fail(code);
    }
  } catch {
    return fail("studio_busy");
  }

  const picture = await paintPicture({ db, config, job, ai, env, prompt: prompt as string });
  if (picture.alerts.length) waitUntil(recordStudioAlerts(env, picture.alerts));
  if (!picture.ok) return fail(picture.code);
  return new Response(picture.bytes, { status: 200, headers: { ...PICTURE_HEADERS, "Content-Length": String(picture.bytes.byteLength) } });
};
