import {
  BILLING_ORG,
  type BillingEnv,
} from "../../../lib/gpt-chat/billing-config";
import {
  IdentityStore,
  authCookie,
  sameOrigin,
} from "../../../lib/gpt-chat/identity-store";
import { fail, json } from "../../../lib/gpt-chat/http";
import { ensureBillingSchema } from '../../../lib/gpt-chat/billing-schema';
export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
}) => {
  if (!sameOrigin(request)) return fail("forbidden", "Forbidden", 403);
  if (!env.GPTBOT_DRAFTS_DB) return fail("unavailable", "Try later", 503);
  try {
    await ensureBillingSchema(env.GPTBOT_DRAFTS_DB);
    await new IdentityStore(env.GPTBOT_DRAFTS_DB, BILLING_ORG).logout(request);
    const response = json({ ok: true }, 200, {
      "Set-Cookie": authCookie("__Host-gpt_account", "", 0),
    });
    response.headers.append('Set-Cookie', authCookie('gpt_sid', '', 0));
    response.headers.append('Set-Cookie', authCookie('gpt_sat', '', 0));
    return response;
  } catch {
    return fail("unavailable", "Try later", 503);
  }
};
