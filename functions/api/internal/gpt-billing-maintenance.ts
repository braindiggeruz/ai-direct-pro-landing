import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { maintainBilling } from "../../lib/gpt-chat/billing-maintenance-store";
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { sameSecret } from "../../lib/gpt-chat/payment-protocol";
import { fail, json } from "../../lib/gpt-chat/http";
import {
  inspectBilling,
  checkBillingProviders,
} from "../../lib/gpt-chat/billing-operations-store";
export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
}) => {
  const secret = env.GPT_BILLING_MAINTENANCE_SECRET;
  if (
    !secret ||
    !sameSecret(request.headers.get("authorization") || "", `Bearer ${secret}`)
  )
    return fail("forbidden", "Forbidden", 403);
  if (!env.GPTBOT_DRAFTS_DB) return fail("unavailable", "Unavailable", 503);
  try {
    await ensureBillingSchema(env.GPTBOT_DRAFTS_DB);
    await checkBillingProviders(env);
    return json({
      ok: true,
      ...(await maintainBilling(env)),
      ...(await inspectBilling(env)),
    });
  } catch {
    return fail("maintenance_failed", "Retry", 503);
  }
};
