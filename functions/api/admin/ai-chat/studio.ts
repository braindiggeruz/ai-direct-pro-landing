import { methodNotAllowed,ownerError,ownerJson,withOwnerRole } from '../../../platform/admin';
import { StudioMonetizationStore } from '../../../lib/studio/monetization-store';
import { BILLING_ORG } from '../../../lib/gpt-chat/billing-config';
import { boundedParam } from '../../../../src/shared/ai-chat-admin';
export const onRequestGet=withOwnerRole('platform_owner',async ctx=>{
  const days=boundedParam(ctx.url.searchParams.get('days'),7,30);
  if(days===null) return ownerError('invalid_query',ctx.requestId,400);
  return ownerJson({request_id:ctx.requestId,studio:await new StudioMonetizationStore(ctx.db).report(BILLING_ORG,days)},ctx.requestId);
});
export const onRequestPost=methodNotAllowed('GET');
export const onRequestPut=methodNotAllowed('GET');
export const onRequestPatch=methodNotAllowed('GET');
export const onRequestDelete=methodNotAllowed('GET');
