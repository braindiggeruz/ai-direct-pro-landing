import { withOwnerRole, ownerJson, ownerError } from '../../../platform/admin/http';
import { sameOrigin } from '../../../lib/gpt-chat/identity-store';
import { ownerOrgId } from '../../../platform/lead-radar';
import { isLeadRadarOrganizationAllowed } from '../../../platform/lead-radar/capabilities';
import { isTelegramCampaignDataKeyValid } from '../../../platform/lead-radar/telegram-campaign';
import { classifyOutreachInbox, listOutreachInbox, OutreachInboxError } from '../../../platform/lead-radar/outreach-inbox';
import { OutreachInboxStore } from '../../../platform/lead-radar/outreach-inbox-store';
import { readOutreachInboxJson } from '../../../platform/lead-radar/outreach-inbox-http';

export const onRequest=withOwnerRole('platform_owner',async(ctx)=>{
  const orgId=await ownerOrgId(ctx.actor.email);
  if(!isLeadRadarOrganizationAllowed(ctx.env,orgId)) return ownerError('forbidden',ctx.requestId,403);
  try {
    if(ctx.request.method==='GET') {
      const enabled=ctx.env.LEAD_RADAR_OUTREACH_INBOX_ENABLED==='true';
      const configured=isTelegramCampaignDataKeyValid(ctx.env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY)
        && /^[A-Za-z0-9_-]{43}$/u.test(ctx.env.LEAD_RADAR_OUTREACH_INBOX_TOKEN??'');
      const availability=!enabled?'disabled':!configured?'not_configured':'ready';
      if(!await new OutreachInboxStore(ctx.db).hasSchema()) {
        if(enabled) return ownerError('inbox_unavailable',ctx.requestId,503);
        return ownerJson({availability,items:[],nextCursor:null},ctx.requestId);
      }
      return ownerJson({availability,...await listOutreachInbox({db:ctx.db,orgId,dataKey:ctx.env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY,
        cursor:ctx.url.searchParams.get('cursor')??undefined,limit:Number(ctx.url.searchParams.get('limit')??20)})},ctx.requestId);
    }
    if(ctx.request.method==='PATCH') {
      if(!sameOrigin(ctx.request)) return ownerError('origin_not_allowed',ctx.requestId,403);
      const body=await readOutreachInboxJson(ctx.request);
      if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some((key)=>!['id','classification'].includes(key))) throw new OutreachInboxError('inbox_invalid_classification');
      const input=body as Record<string,unknown>;
      return ownerJson(await classifyOutreachInbox({db:ctx.db,orgId,id:input.id,classification:input.classification}),ctx.requestId);
    }
    const response=ownerError('method_not_allowed',ctx.requestId,405);response.headers.set('Allow','GET, PATCH');return response;
  } catch(error) {
    if(error instanceof OutreachInboxError) return ownerError(error.code,ctx.requestId,error.status);
    return ownerError('inbox_unavailable',ctx.requestId,503);
  }
});
