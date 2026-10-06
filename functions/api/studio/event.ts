// POST /api/studio/event {id, type, detail, viewId} — one funnel step of the
// studio, counted on the server (spec §6, §10.2) into gpt_ui_events.
//
// Open while STUDIO_API and STUDIO_EVENTS are on (studioGate: 404 before
// anything is read). Type and detail come from the closed lists of
// events.ts; nothing else in the body is read, and nothing about the visitor
// is stored: no IP, identity or account (the address hash keys only the
// rate limit). Answers 204 whether or not a row was written:
//   - a step of a purchase while payments are off: not written;
//   - past 60 events an hour per address, or when the counter cannot be read:
//     not written (spec §5.4);
//   - the same event id again: counted once.
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { readJsonLimited } from "../../lib/gpt-chat/http";
import { sameOrigin } from "../../lib/gpt-chat/identity-store";
import { consumeRateLimit, HOUR_MS } from "../../lib/gpt-chat/rate-limit";
import { ensureSchema } from "../../lib/gpt-chat/schema";
import { studioGate, studioRequestConfig } from "../../lib/studio/config";
import {
  STUDIO_EVENT_RATE_ACTION,
  STUDIO_EVENTS_PER_HOUR,
  STUDIO_PAYMENT_EVENTS,
  StudioEventStore,
  parseStudioEvent,
} from "../../lib/studio/events";
import { STUDIO_NO_STORE, fail, studioLog } from "../../lib/studio/http";
import { studioAddress } from "../../lib/studio/limits";

const MAX_BODY_BYTES = 1024;

/** The answer of every accepted request, written or not. */
function noContent(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": STUDIO_NO_STORE, "X-Robots-Tag": "noindex, nofollow, noarchive" } });
}

export const onRequest: PagesFunction<BillingEnv> = async ({ request, env }) => {
  const closed = studioGate(request, env, "event");
  if (closed) return closed;
  if (request.method !== "POST") return fail("method_not_allowed", {}, { Allow: "POST" });
  if (!sameOrigin(request)) return fail("invalid");
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return fail("studio_not_configured");
  const body = await readJsonLimited<unknown>(request, MAX_BODY_BYTES);
  if (!body.ok) return fail(body.code);
  const event = parseStudioEvent(body.value);
  if (!event) return fail("invalid");
  if (STUDIO_PAYMENT_EVENTS.has(event.type) && studioRequestConfig(request, env).payments === "off") return noContent();
  try {
    await ensureSchema(db);
    await ensureBillingSchema(db);
    const limit = await consumeRateLimit(db, STUDIO_EVENT_RATE_ACTION, await studioAddress(request, env), {
      limit: STUDIO_EVENTS_PER_HOUR,
      windowMs: HOUR_MS,
    });
    if (!limit.allowed || limit.degraded) {
      studioLog("studio_event", "rate_limited");
      return noContent();
    }
    await new StudioEventStore(db).record(event);
    return noContent();
  } catch {
    studioLog("studio_event", "studio_busy");
    return fail("studio_busy");
  }
};
