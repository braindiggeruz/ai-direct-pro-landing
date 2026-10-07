// POST /api/internal/studio-owner-order — mark the owner's own studio
// purchase (spec §9.6, DECISIONS §14 п. 3): owner_test = 1 and GA4 skipped,
// so the order stays out of the reports, the stage gates ("≥ 3 payments not
// by the owner") and any export. It changes no money and no entitlement.
//
// Body {order}: our order number (stu_…) or the payment number of Payme or
// Click (transaction id or document number) of a live order. Answers {ok,
// orderId, state}; 404 not_found. A repeat changes nothing. Operator only:
// Bearer GPT_BILLING_MAINTENANCE_SECRET; not bound to a host or a switch.
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { readJsonLimited } from "../../lib/gpt-chat/http";
import { internalAuthorized } from "../../lib/gpt-chat/internal-auth";
import { fail, json, studioLog } from "../../lib/studio/http";
import { RESTORE_QUERY, ordersFor } from "../../lib/studio/restore";
import { StudioStore, ensureStudioPaidSchema } from "../../lib/studio/store";

const EVENT = "studio_owner_order";

export const onRequestPost: PagesFunction<BillingEnv> = async ({ request, env }) => {
  if (!internalAuthorized(request, env.GPT_BILLING_MAINTENANCE_SECRET)) return fail("unauthorized");
  const body = await readJsonLimited<{ order?: unknown }>(request, 256);
  const query = body.ok ? body.value?.order : undefined;
  if (typeof query !== "string" || !RESTORE_QUERY.test(query)) return fail("invalid");
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return fail("studio_not_configured");
  try {
    await ensureStudioPaidSchema(db);
    const store = new StudioStore(db);
    const [found] = await ordersFor(store, query);
    if (!found) {
      studioLog(EVENT, "not_found");
      return fail("not_found");
    }
    const order = await store.markOwnerTest(found.id);
    studioLog(EVENT, "marked");
    return json({ ok: true, orderId: order.id, state: order.state, ownerTest: true });
  } catch {
    studioLog(EVENT, "studio_busy");
    return fail("studio_busy");
  }
};

export const onRequest: PagesFunction<BillingEnv> = async () => fail("method_not_allowed", {}, { Allow: "POST" });
