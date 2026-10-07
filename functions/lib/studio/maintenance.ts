import type { BillingEnv } from "../gpt-chat/billing-config";
import { parseStudioConfig } from "./config";
import { expireDueJobs } from "./jobs";
import { StudioOperationsStore } from "./operations-store";
import { ensureStudioPaidSchema } from "./store";

export async function maintainStudio(env:BillingEnv,now=Date.now()) {
  const config=parseStudioConfig(env.STUDIO_RUNTIME_CONFIG_JSON);
  if(!config.api&&!config.paidService) return {skipped:true};
  if(!env.GPTBOT_DRAFTS_DB) throw new Error('studio_not_configured');
  await ensureStudioPaidSchema(env.GPTBOT_DRAFTS_DB);
  const expiry=await expireDueJobs(env.GPTBOT_DRAFTS_DB,now);
  if(expiry.failed) throw new Error('studio_expiry_failed');
  const operations=new StudioOperationsStore(env.GPTBOT_DRAFTS_DB);
  return {expiry,...await operations.maintain(now)};
}
