import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { studioOperation } from "../../lib/studio/refund";
import { fail } from "../../lib/studio/http";

export const onRequestPost: PagesFunction<BillingEnv> = ({ request, env }) => studioOperation(request, env, "refund-record");
export const onRequest: PagesFunction<BillingEnv> = async () => fail("method_not_allowed", {}, { Allow: "POST" });
