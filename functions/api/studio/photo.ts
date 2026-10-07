// POST /api/studio/photo — explain a photographed task (spec §6, §8; T3.3).
//
// Body: multipart/form-data with `image` (JPEG, PNG or WebP by its magic
// bytes, ≤ 1 MB after the browser shrank it), `requestId`, `mode`
// ("explain" | "math"), `locale` ("uz" | "ru"), `consent` ("photo-v1"),
// `turnstileToken?` (a free photo), `regenOf?` (a paid regeneration).
// Answer 200 {ok, jobId, source, entitlementId?, answer:{subject, given,
// steps[], answer, check, confidence}, regenAvailable}.
//
// Order, cheapest refusal first:
//   1. switches and host (studioGate): 404 before anything is read; inside,
//      a free photo needs STUDIO_API + STUDIO_PHOTO and a paid one
//      STUDIO_PAID_SERVICE + STUDIO_PHOTO (the photo gate off = dark);
//   2. POST from this origin; the browser identity (__Host-studio_bid) or
//      the Studio account's session cookie, else 401 identity_required;
//   3. D1 and GPT_IDENTITY_SECRET, else 503 studio_not_configured;
//   4. the body: > 1 MB + fields → 413 payload_too_large; not multipart or a
//      missing field → 400 invalid; consent not "photo-v1" → 400
//      consent_required; a picture that is not JPEG/PNG/WebP by its bytes
//      or does not parse → 415 unsupported_media;
//   5. the picture's metadata is cut (image-meta.ts) and only the cleaned
//      bytes go on; input_mac = HMAC(SHA-256 of them). The bytes are never
//      written to D1, R2 or a log (tests/studio-photo.test.ts scans both);
//   6. who pays, «free first» (spec §2.3): the two free photos of the day
//      (the browser's, or the account's without a browser identity), then
//      the account's entitlement that ends soonest. A free photo needs a
//      Turnstile token (action studio_free_photo) unless the account holds
//      a live entitlement with photos; without a token the answer is 403
//      turnstile_required, never a paid unit instead. No free photo left
//      and no entitlement: 429 free_limit {resetsAt} or 402 no_units;
//   7. pace: 6 starts in 10 minutes per person (429), the site's minute
//      read (503), then the start (jobs.ts startJob: one open job, the
//      daily units, the IP ceiling, the ramp, the budget, 5 returns a day);
//   8. the model (lib/studio/photo.ts explainPhoto) under the job's meter;
//      the answer leaves only after the row's bit was written (handOut):
//      200; an unreadable photo or Z.ai's refusal closes the job as refused
//      and answers 422 unreadable / photo_refused WITHOUT any content field;
//      a server fault marks the row (502/503/422 {retry}) and the browser
//      may send the same request id again while the job has calls left.
// A regeneration (regenOf): the buyer's session, the same photo (input_mac,
// else 409 regen_mismatch), no unit, no Turnstile (spec §2.4).
// Logs carry {event, code} only.
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { sameOrigin } from "../../lib/gpt-chat/identity-store";
import { studioGate, studioRequestConfig, type StudioConfig } from "../../lib/studio/config";
import { buyerSubject, entitlementMode, hasBuyerCookie, readBuyer } from "../../lib/studio/full-deck";
import { STUDIO_FREE_DAILY } from "../../lib/studio/plans";
import { FreeUsageStore, freeDay, nextFreeResetAt } from "../../lib/studio/free-usage";
import { fail, json, notFound, studioLog } from "../../lib/studio/http";
import { identityConfigured, readIdentity, type StudioIdentity } from "../../lib/studio/identity";
import { MAX_PHOTO_BYTES, stripImageMetadata, type ImageMime } from "../../lib/studio/image-meta";
import { OUTLINE_BIT, failPart, handOut, isOpen, jobMeter, refuseJob, startJob, type StartJobResult } from "../../lib/studio/jobs";
import { LedgerStore, REQUEST_ID, isJobId, photoInputMac, type LedgerJob } from "../../lib/studio/ledger";
import { paceJobStart, paceSiteJobStart, recordStudioAlerts, siteJobRoom, studioAddress, type StudioAlert } from "../../lib/studio/limits";
import type { StepResult } from "../../lib/studio/llm";
import { PHOTO_CONSENT_VERSION, PHOTO_MODES, PHOTO_TURNSTILE_ACTION, explainPhoto, type PhotoMode, type PhotoStepValue } from "../../lib/studio/photo";
import type { PhotoAnswer } from "../../lib/studio/photo-schema";
import { STUDIO_LOCALES, ensureDeckSchema } from "../../lib/studio/presentation";
import type { StudioLocale } from "../../lib/studio/prompts";
import { studioTurnstileConfigured, verifyStudioTurnstile } from "../../lib/studio/turnstile";

/** The picture and a few short fields; the multipart framing takes a little more. */
export const MAX_BODY_BYTES = MAX_PHOTO_BYTES + 16_384;
const EVENT = "studio_photo";

type Waiter = (promise: Promise<unknown>) => void;

export interface PhotoRequest {
  readonly requestId: string;
  readonly mode: PhotoMode;
  readonly locale: StudioLocale;
  readonly turnstileToken: string | null;
  readonly regenOf: string | null;
  readonly mime: ImageMime;
  /** The picture without its metadata. */
  readonly bytes: Uint8Array;
}

type BodyRead =
  | { readonly ok: true; readonly value: PhotoRequest }
  | { readonly ok: false; readonly code: "payload_too_large" | "invalid" | "consent_required" | "unsupported_media" };

/** The body up to MAX_BODY_BYTES, or null past it. */
async function readBodyLimited(request: Request): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      parts.push(value);
    }
  } catch {
    return new Uint8Array();
  }
  const out = new Uint8Array(bytes);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

const text = (form: FormData, name: string): string | null => {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
};

/** The multipart body as a PhotoRequest, with the picture already cleaned, or the refusal. */
export async function readPhotoRequest(request: Request): Promise<BodyRead> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(type)) return { ok: false, code: "invalid" };
  const raw = await readBodyLimited(request);
  if (raw === null) return { ok: false, code: "payload_too_large" };
  let form: FormData;
  try {
    form = await new Response(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, { headers: { "content-type": type } }).formData();
  } catch {
    return { ok: false, code: "invalid" };
  }
  if (text(form, "consent") !== PHOTO_CONSENT_VERSION) return { ok: false, code: "consent_required" };
  const requestId = text(form, "requestId") ?? "";
  if (!REQUEST_ID.test(requestId)) return { ok: false, code: "invalid" };
  const mode = text(form, "mode") ?? "explain";
  if (!(PHOTO_MODES as readonly string[]).includes(mode)) return { ok: false, code: "invalid" };
  const locale = text(form, "locale") ?? "uz";
  if (!(STUDIO_LOCALES as readonly string[]).includes(locale)) return { ok: false, code: "invalid" };
  const turnstileToken = text(form, "turnstileToken");
  const regenOf = text(form, "regenOf");
  if (regenOf !== null && !isJobId(regenOf)) return { ok: false, code: "invalid" };
  const image = form.get("image");
  if (!image || typeof image === "string" || typeof (image as Blob).arrayBuffer !== "function") return { ok: false, code: "invalid" };
  const blob = image as Blob;
  if (blob.size > MAX_PHOTO_BYTES) return { ok: false, code: "payload_too_large" };
  const cleaned = stripImageMetadata(new Uint8Array(await blob.arrayBuffer()));
  if (!cleaned) return { ok: false, code: "unsupported_media" };
  return {
    ok: true,
    value: { requestId, mode: mode as PhotoMode, locale: locale as StudioLocale, turnstileToken, regenOf, mime: cleaned.mime, bytes: cleaned.bytes },
  };
}

/** What the browser gets with a 200. */
export interface PhotoContent {
  readonly jobId: string;
  readonly source: LedgerJob["source"];
  readonly entitlementId?: string;
  readonly answer: PhotoAnswer;
  /** A paid unit may be explained once more within 24 hours with the same photo (spec §2.4). */
  readonly regenAvailable: boolean;
  readonly consentVersion: string;
}

export function photoContent(job: Pick<LedgerJob, "id" | "source" | "entitlementId">, answer: PhotoAnswer): PhotoContent {
  return {
    jobId: job.id,
    source: job.source,
    ...(job.entitlementId ? { entitlementId: job.entitlementId } : {}),
    answer,
    regenAvailable: job.source === "entitlement",
    consentVersion: PHOTO_CONSENT_VERSION,
  };
}

interface Context {
  readonly request: Request;
  readonly env: BillingEnv;
  readonly db: D1Database;
  readonly config: StudioConfig;
  readonly photo: PhotoRequest;
  readonly inputMac: string;
  readonly now: number;
  readonly waitUntil: Waiter;
}

/** A start that did not give a job: its code, reset time and Retry-After. */
function refusedStart(started: StartJobResult & { ok: false }): Response {
  studioLog(EVENT, started.code);
  const headers: Record<string, string> = started.retryAfterSeconds ? { "Retry-After": String(started.retryAfterSeconds) } : {};
  return fail(started.code, started.resetsAt ? { resetsAt: started.resetsAt } : {}, headers);
}

/** The model step on `job`, then what leaves: the answer, a refusal without content, or a fault. */
async function explain(context: Context, job: LedgerJob, alerts: StudioAlert[]): Promise<Response> {
  const { request, env, db, config, photo } = context;
  const flush = () => {
    if (alerts.length) context.waitUntil(recordStudioAlerts(env, alerts.splice(0)));
  };
  if (!isOpen(job, Date.now()) || (job.partsDone & OUTLINE_BIT) !== 0) {
    flush();
    return fail("job_state");
  }
  const meter = jobMeter(db, config, job, "photo");
  const result: StepResult<PhotoStepValue> = await explainPhoto({
    env,
    config,
    locale: photo.locale,
    mode: photo.mode,
    mime: photo.mime,
    bytes: photo.bytes,
    admit: meter.admit,
    signal: request.signal,
  });
  await meter.settle(result.calls);
  alerts.push(...meter.alerts);

  if (!result.ok) {
    flush();
    studioLog(EVENT, result.kind === "fault" ? result.fault : result.kind);
    if (result.kind === "refused") {
      await refuseJob(db, job, "photo_refused");
      return fail("photo_refused");
    }
    if (result.kind === "halted") return fail("job_state");
    // The person went away: not a server fault; the job expires on its own.
    if (request.signal?.aborted) return fail(result.code);
    const marked = await failPart(db, job, OUTLINE_BIT, result.fault);
    return fail(result.code, { retry: marked.marked && !marked.released });
  }
  if (result.value.verdict.unreadable) {
    flush();
    studioLog(EVENT, "unreadable");
    await refuseJob(db, job, "unreadable");
    // No field of content: text embedded in the photo must never get a free answer this way (spec §8.1 item 6).
    return fail("unreadable");
  }
  flush();
  if (request.signal?.aborted) return fail("model_failed");
  const delivered = await handOut(db, job, OUTLINE_BIT, photoContent(job, result.value.verdict.answer), Date.now());
  if (!delivered.ok) {
    studioLog(EVENT, delivered.code);
    return fail(delivered.code);
  }
  studioLog(EVENT, "delivered");
  return json({ ok: true, ...delivered.content });
}

/** The same request id again: the job it made, continued if nothing left it yet; otherwise it is over. */
function replayOf(earlier: LedgerJob, context: Context): LedgerJob | Response {
  if (earlier.tool !== "photo" || earlier.inputMac !== context.inputMac) return fail("invalid");
  if (isOpen(earlier, context.now) && earlier.partsDone === 0) return earlier;
  // Delivered (the answer went to the lost request), released or refused: the server keeps no answer.
  return fail("job_state");
}

async function pace(db: D1Database, config: StudioConfig, subject: string, now: number): Promise<Response | null> {
  const own = await paceJobStart(db, subject, now);
  const verdict = own.ok ? await siteJobRoom(db, config, now) : own;
  if (verdict.ok) return null;
  studioLog(EVENT, verdict.code);
  return fail(verdict.code, {}, { "Retry-After": String(verdict.retryAfterSeconds) });
}

export const onRequest: PagesFunction<BillingEnv> = async ({ request, env, waitUntil }) => {
  const closed = studioGate(request, env, "photo");
  if (closed) return closed;
  if (request.method !== "POST") return fail("method_not_allowed", {}, { Allow: "POST" });
  if (!sameOrigin(request)) return fail("invalid");
  const config = studioRequestConfig(request, env);
  // The photo tool itself is the gate of both paths (DECISIONS §13 п. 8: STUDIO_PHOTO=false keeps it dark).
  const freeOpen = config.api && config.photo;
  const paidOpen = config.paidService && config.photo;
  if (!freeOpen && !paidOpen) return notFound();
  const now = Date.now();

  const identity: StudioIdentity | null = await readIdentity(request, env, now);
  const buyerCookie = hasBuyerCookie(request);
  if (!identity && !buyerCookie) return fail("identity_required");
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || !identityConfigured(env)) {
    studioLog(EVENT, "studio_not_configured");
    return fail("studio_not_configured");
  }

  const body = await readPhotoRequest(request);
  if (!body.ok) return fail(body.code);
  const photo = body.value;
  const inputMac = await photoInputMac(env, photo.bytes);
  if (!inputMac) return fail("studio_not_configured");
  const context: Context = { request, env, db, config, photo, inputMac, now, waitUntil };
  const alerts: StudioAlert[] = [];
  const store = new LedgerStore(db);

  let userId: string | null = null;
  let hasEntitlement = false;
  let earlier: LedgerJob | null = null;
  const mode = entitlementMode(config);
  try {
    await ensureDeckSchema(db);
    if (buyerCookie && paidOpen) {
      userId = await readBuyer(request, db, now);
      if (userId) hasEntitlement = (await store.pickEntitlement(userId, mode, "photo_task", now)) !== null;
    }
  } catch {
    studioLog(EVENT, "studio_busy");
    return fail("studio_busy");
  }

  // ── A regeneration: the buyer's own done job, the same photo, no unit, no Turnstile.
  if (photo.regenOf) {
    if (!paidOpen || !userId) return fail(userId ? "not_found" : "no_units");
    const subject = buyerSubject(userId);
    try {
      earlier = await store.byRequest(subject, photo.requestId);
    } catch {
      return fail("studio_busy");
    }
    let job: LedgerJob;
    if (earlier) {
      const replay = replayOf(earlier, context);
      if (replay instanceof Response) return replay;
      job = replay;
    } else {
      const paced = await pace(db, config, subject, now);
      if (paced) return paced;
      const started = await startJob(db, {
        config,
        subject,
        requestId: photo.requestId,
        tool: "photo",
        shape: "photo",
        inputMac,
        consentVersion: PHOTO_CONSENT_VERSION,
        source: { kind: "regen", regenOf: photo.regenOf },
        now,
        sitePace: () => paceSiteJobStart(db, config, now),
      });
      alerts.push(...started.alerts);
      if (!started.ok) {
        if (alerts.length) waitUntil(recordStudioAlerts(env, alerts.splice(0)));
        return refusedStart(started);
      }
      job = started.job;
    }
    return explain(context, job, alerts);
  }

  // ── Free first (spec §2.3): the person's two photos of the day.
  const freeSubject = freeOpen ? identity?.subject ?? (userId ? buyerSubject(userId) : null) : null;
  let freeLeft = false;
  try {
    if (freeSubject) {
      earlier = await store.byRequest(freeSubject, photo.requestId);
      if (!earlier) {
        const used = await new FreeUsageStore(db).usedFree(freeDay(now), freeSubject);
        freeLeft = used.photo_task < STUDIO_FREE_DAILY.photo_task;
      }
    }
    if (!earlier && userId) earlier = await store.byRequest(buyerSubject(userId), photo.requestId);
  } catch {
    studioLog(EVENT, "studio_busy");
    return fail("studio_busy");
  }
  if (earlier) {
    const replay = replayOf(earlier, context);
    if (replay instanceof Response) return replay;
    return explain(context, replay, alerts);
  }

  if (freeSubject && freeLeft) {
    // A free photo of a person without a live entitlement needs Turnstile; one with it goes without (spec §2.3).
    if (!hasEntitlement && !identity) return fail("identity_required");
    const paced = await pace(db, config, freeSubject, now);
    if (paced) return paced;
    if (!hasEntitlement) {
      if (!studioTurnstileConfigured(request, env)) {
        studioLog(EVENT, "studio_not_configured");
        return fail("studio_not_configured");
      }
      const check = await verifyStudioTurnstile(request, env, photo.turnstileToken, PHOTO_TURNSTILE_ACTION);
      if (!check.ok) {
        studioLog(EVENT, check.code);
        // Never a paid unit instead of the missing token.
        return fail(check.code);
      }
    }
    const started = await startJob(db, {
      config,
      subject: freeSubject,
      requestId: photo.requestId,
      tool: "photo",
      shape: "photo",
      inputMac,
      consentVersion: PHOTO_CONSENT_VERSION,
      source: { kind: "free", young: identity?.young ?? false, address: await studioAddress(request, env, now) },
      now,
      sitePace: () => paceSiteJobStart(db, config, now),
    });
    alerts.push(...started.alerts);
    if (!started.ok) {
      if (alerts.length) waitUntil(recordStudioAlerts(env, alerts.splice(0)));
      return refusedStart(started);
    }
    return explain(context, started.job, alerts);
  }

  // ── Then the entitlement that ends soonest.
  if (paidOpen && userId && hasEntitlement) {
    const subject = buyerSubject(userId);
    const paced = await pace(db, config, subject, now);
    if (paced) return paced;
    const started = await startJob(db, {
      config,
      subject,
      requestId: photo.requestId,
      tool: "photo",
      shape: "photo",
      inputMac,
      consentVersion: PHOTO_CONSENT_VERSION,
      source: { kind: "entitlement", userId, mode },
      now,
      sitePace: () => paceSiteJobStart(db, config, now),
    });
    alerts.push(...started.alerts);
    if (!started.ok) {
      if (alerts.length) waitUntil(recordStudioAlerts(env, alerts.splice(0)));
      return refusedStart(started);
    }
    return explain(context, started.job, alerts);
  }

  // Nothing to spend: the free day is used up (its reset time), or the account has no photos left.
  if (freeSubject) {
    const resetsAt = nextFreeResetAt(now);
    studioLog(EVENT, "free_limit");
    return fail("free_limit", { resetsAt: new Date(resetsAt).toISOString() }, { "Retry-After": String(Math.max(1, Math.ceil((resetsAt - now) / 1000))) });
  }
  return fail(paidOpen ? "no_units" : "not_found");
};
