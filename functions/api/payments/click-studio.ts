import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { handleStudioClick } from "../../lib/studio/click-studio";
import { fail } from "../../lib/gpt-chat/http";

export const onRequestPost: PagesFunction<BillingEnv> = ({ request, env, waitUntil }) => handleStudioClick(request, env, waitUntil);
export const onRequest: PagesFunction<BillingEnv> = async () => fail("method_not_allowed", "Method not allowed", 405);
