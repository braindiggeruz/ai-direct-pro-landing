// POST /api/internal/studio-restore-link — support's link for a studio
// buyer who lost the account cookie (restore.ts, spec §5.3, DECISIONS §8).
//
// Body {order, amountUzs, paidDate}: our order number (stu_…) or the
// payment number of Payme or Click (transaction id or document number),
// the amount in so‘m (5 900 / 39 900) and the date paid, YYYY-MM-DD in
// Tashkent (±1 day). All three must match one paid live order.
// Answers {ok, orderId, provider, paymentNumber, url, expiresAt}; the link
// works 48 hours at most, the tariff's end at the latest. 404 not_found (no
// paid order matches), 409 invalid_order (no running tariff: ended or
// refunded), 409 restore_recent (restored less than 7 days ago). It moves
// nothing itself: the buyer's button does (api/studio/restore.ts).
// Operator only: Bearer GPT_BILLING_MAINTENANCE_SECRET. Not bound to a host
// or a switch. Logs: {event, code}; the link is never logged.
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { readJsonLimited } from "../../lib/gpt-chat/http";
import { internalAuthorized } from "../../lib/gpt-chat/internal-auth";
import { fail, json, studioLog } from "../../lib/studio/http";
import { identityConfigured } from "../../lib/studio/identity";
import { RESTORE_QUERY, findRestorable, studioRestoreLink } from "../../lib/studio/restore";
import { StudioStore, ensureStudioPaidSchema } from "../../lib/studio/store";

const EVENT = "studio_restore_link";

export const onRequestPost: PagesFunction<BillingEnv> = async ({ request, env }) => {
  if (!internalAuthorized(request, env.GPT_BILLING_MAINTENANCE_SECRET)) return fail("unauthorized");
  const body = await readJsonLimited<{ order?: unknown; amountUzs?: unknown; paidDate?: unknown }>(request, 512);
  const value = body.ok ? body.value : null;
  const query = value?.order;
  const amountUzs = value?.amountUzs;
  const paidDate = value?.paidDate;
  if (
    typeof query !== "string" ||
    !RESTORE_QUERY.test(query) ||
    typeof amountUzs !== "number" ||
    !Number.isFinite(amountUzs) ||
    amountUzs <= 0 ||
    typeof paidDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(paidDate)
  )
    return fail("invalid");
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db || !identityConfigured(env)) return fail("studio_not_configured");
  try {
    await ensureStudioPaidSchema(db);
    const now = Date.now();
    const lookup = await findRestorable(new StudioStore(db), { query, amountUzs, paidDate }, now);
    if (!lookup.ok) {
      studioLog(EVENT, lookup.code);
      if (lookup.code === "invalid_order") return json({ ok: false, code: "invalid_order", error: "no running tariff" }, 409);
      return fail(lookup.code);
    }
    const link = await studioRestoreLink(env.GPT_IDENTITY_SECRET as string, lookup.target, now);
    studioLog(EVENT, "issued");
    const order = lookup.target.order;
    return json({ ok: true, orderId: order.id, provider: order.provider, paymentNumber: order.provider_doc_id, ...link });
  } catch {
    studioLog(EVENT, "studio_busy");
    return fail("studio_busy");
  }
};

export const onRequest: PagesFunction<BillingEnv> = async () => fail("method_not_allowed", {}, { Allow: "POST" });
