import { type BillingEnv } from "../../lib/gpt-chat/billing-config";
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { findOrder, restorable, restoreLink } from "../../lib/gpt-chat/guest-restore";
import { internalAuthorized } from "../../lib/gpt-chat/internal-auth";
import { fail, json, readJsonLimited } from "../../lib/gpt-chat/http";
// Support's restore link for a guest's lost pack (guest-restore.ts), made
// when a buyer asks: body {order} with Click's payment id (from the owner's
// "AI paket: paid" notice and the buyer's receipt) or our pay_ number. The
// link works 48 hours at most, the pack's end at the latest, and only while
// the order is a guest's running pack. It moves nothing itself; the buyer's
// button does (api/gpt/restore.ts). Operator only: the internal Bearer.
export const onRequestPost: PagesFunction<BillingEnv> = async ({ request, env }) => {
  if (!internalAuthorized(request, env.GPT_BILLING_MAINTENANCE_SECRET))
    return fail("forbidden", "Forbidden", 403);
  const body = await readJsonLimited<{ order?: string }>(request, 512);
  const query = body.ok ? body.value?.order : undefined;
  if (typeof query !== "string" || !/^(pay_[0-9a-f]{32}|\d{1,20})$/.test(query))
    return fail("invalid_request", "A pay_ number or a Click payment id required");
  const secret = env.GPT_IDENTITY_SECRET;
  if (!env.GPTBOT_DRAFTS_DB || !secret || secret.length < 32)
    return fail("unavailable", "Unavailable", 503);
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    await ensureBillingSchema(db);
    const now = Date.now();
    const order = await findOrder(db, query);
    if (!order || !restorable(order, now))
      return fail("invalid_order", "Not a running pack bought without signing in", 409);
    const link = await restoreLink(secret, order, now);
    console.log(JSON.stringify({ event: "gpt_guest_restore_link", order: order.id, expiresAt: link.expiresAt }));
    return json({ ok: true, order: order.id, clickId: order.external_id, ...link });
  } catch {
    return fail("link_failed", "Try later", 503);
  }
};
