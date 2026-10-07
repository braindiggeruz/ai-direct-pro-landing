// POST /api/studio/order/cancel {orderId} — the buyer closes their own open
// order that no payment provider holds yet (spec §6): a pending order
// without a provider transaction. Then the buyer may order another tariff or
// pay another way at once instead of waiting out the order's 12 hours.
//
// Answers {ok, orderId} (closed now, or closed before); 404 not_found (no
// such order of this browser's studio account, or no account at all); 409
// in_progress (a provider holds it, or it is paid). Open while
// STUDIO_PAID_SERVICE is on, on gptbot.uz (studioGate). Logs: {event, code}.
import type { BillingEnv } from "../../../lib/gpt-chat/billing-config";
import { readJsonLimited } from "../../../lib/gpt-chat/http";
import { sameOrigin } from "../../../lib/gpt-chat/identity-store";
import { hasAccountCookie, readStudioAccount } from "../../../lib/studio/account";
import { studioGate } from "../../../lib/studio/config";
import { fail, json, studioLog } from "../../../lib/studio/http";
import { STUDIO_ORDER_ID, StudioStore, ensureStudioPaidSchema } from "../../../lib/studio/store";

const MAX_BODY_BYTES = 512;
const EVENT = "studio_order_cancel";

export const onRequest: PagesFunction<BillingEnv> = async ({ request, env }) => {
  const closed = studioGate(request, env, "orderCancel");
  if (closed) return closed;
  if (request.method !== "POST") return fail("method_not_allowed", {}, { Allow: "POST" });
  if (!sameOrigin(request)) return fail("invalid");
  const body = await readJsonLimited<unknown>(request, MAX_BODY_BYTES);
  if (!body.ok) return fail(body.code);
  const orderId = (body.value as { orderId?: unknown } | null)?.orderId;
  if (typeof orderId !== "string" || !STUDIO_ORDER_ID.test(orderId)) return fail("invalid");
  // No account cookie: no order of this browser, and no D1 read for it.
  if (!hasAccountCookie(request)) return fail("not_found");
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return fail("studio_not_configured");
  try {
    await ensureStudioPaidSchema(db);
    const now = Date.now();
    const account = await readStudioAccount(request, db, now);
    if (!account) return fail("not_found");
    const outcome = await new StudioStore(db).cancelOwn(account.userId, orderId, now);
    studioLog(EVENT, outcome);
    if (outcome === "not_found") return fail("not_found");
    if (outcome === "in_progress") return fail("in_progress");
    return json({ ok: true, orderId });
  } catch {
    studioLog(EVENT, "studio_busy");
    return fail("studio_busy");
  }
};
