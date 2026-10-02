// POST /api/gpt/event — the pack window's funnel counter (plan WP-17). Body
// {id, type, detail, view}: `id` a fresh UUID per event (a request sent twice
// counts once), `type` and `detail` from the closed lists of
// ui-event-store.ts, `view` the tab's random UUID. Nothing else in the body
// is read, and nothing about the visitor is stored: no IP, account or chat
// session (the IP hash only keys the rate limit, as on every gpt route).
//
// 404 before the body and D1 while no payment provider is offered to this
// visitor: the pack window, and so every event it sends, is out of reach then
// (a test provider is offered in a rehearsal session only, rehearsal.ts).
import {
  BILLING_ORG,
  offeredProviders,
  type BillingEnv,
} from "../../lib/gpt-chat/billing-config";
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { getClientIp, hashIp, resolveHashSalt } from "../../lib/gpt-chat/hash";
import { fail, json, readJsonLimited } from "../../lib/gpt-chat/http";
import { sameOrigin } from "../../lib/gpt-chat/identity-store";
import { consumeRateLimit, HOUR_MS } from "../../lib/gpt-chat/rate-limit";
import { viewerMode } from "../../lib/gpt-chat/rehearsal";
import { ensureSchema } from "../../lib/gpt-chat/schema";
import { parseUiEvent, UiEventStore } from "../../lib/gpt-chat/ui-event-store";

/** Events per IP hash and hour: a purchase takes a handful. */
const EVENTS_PER_HOUR = 60;

export const onRequestPost: PagesFunction<BillingEnv> = async ({ request, env }) => {
  if (!sameOrigin(request)) return fail("forbidden", "Forbidden", 403);
  if (!env.GPTBOT_DRAFTS_DB || !offeredProviders(env, await viewerMode(request, env)).length)
    return fail("not_found", "Not found", 404);
  const body = await readJsonLimited<unknown>(request, 1024);
  const event = body.ok ? parseUiEvent(body.value) : null;
  if (!event) return fail("bad_request", "Invalid request");
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    await ensureSchema(db);
    await ensureBillingSchema(db);
    const limit = await consumeRateLimit(
      db,
      "ui_event",
      await hashIp(getClientIp(request), resolveHashSalt(env)),
      { limit: EVENTS_PER_HOUR, windowMs: HOUR_MS },
    );
    if (!limit.allowed || limit.degraded) return fail("try_later", "Try later", 429);
    await new UiEventStore(db, BILLING_ORG).record(event);
    return json({ ok: true });
  } catch {
    return fail("store_unavailable", "Try later", 503);
  }
};

export const onRequest: PagesFunction<BillingEnv> = async () =>
  fail("method_not_allowed", "Use POST", 405);
