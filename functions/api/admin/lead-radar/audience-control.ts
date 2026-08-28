import { ownerError,ownerJson,readOwnerBody,OwnerValidationError,type OwnerHandlerContext } from '../../../platform/admin';
import { AudienceError,AudienceStore,requireAudienceSchema } from '../../../platform/lead-radar/audiences';
import { assertLeadRadarRuntimeSchema,LeadRadarStore,hasTelegramCampaignSchema } from '../../../platform/lead-radar';
import { redactLead } from '../../../platform/lead-radar/capabilities';
import type { LeadRadarApiCapabilities } from '../../../../src/shared/lead-radar';

export function isAudiencePath(parts: readonly string[]): boolean {
  return parts[0]==='audiences' || parts[0]==='telegram-contacts';
}
export async function handleAudienceRequest(ctx: OwnerHandlerContext,parts: readonly string[],orgId: string,capabilities: LeadRadarApiCapabilities): Promise<Response> {
  try {
    await assertLeadRadarRuntimeSchema(ctx.db);
    await requireAudienceSchema(ctx.db);
    if (!await hasTelegramCampaignSchema(ctx.db)) throw new AudienceError('audience_schema_unavailable',503);
    const store=new AudienceStore(ctx.db);
    if (ctx.request.method==='GET') {
      if (parts.length===1 && parts[0]==='telegram-contacts') {
        const query=new URL(ctx.request.url).searchParams;
        const offset=Number(query.get('offset') ?? '0');
        if (!Number.isSafeInteger(offset) || offset<0) throw new AudienceError('audience_invalid_input');
        return ownerJson(await store.directory(orgId,{q:query.get('q') ?? '',category:query.get('category') ?? '',city:query.get('city') ?? '',offset},capabilities),ctx.requestId);
      }
      if (parts.length===1) return ownerJson({audiences:await store.list(orgId)},ctx.requestId);
      if (parts.length===2) {
        const audience=await store.get(orgId,parts[1]);
        if (!audience) throw new AudienceError('audience_not_found',404);
        const leads=(await new LeadRadarStore(ctx.db).getLeadsByIds(orgId,audience.companyIds))
          .map((lead)=>redactLead(lead,capabilities,Date.now()));
        return ownerJson({audience,leads,missingCompanyIds:audience.companyIds.filter((id)=>!leads.some((lead)=>lead.id===id))},ctx.requestId);
      }
    }
    if (ctx.request.method==='POST' && parts.length===2 && parts[0]==='audiences') {
      const body=await readOwnerBody(ctx.request);
      if (!body || typeof body!=='object' || Array.isArray(body)
        || Object.keys(body).sort().join(',')!=='companyIds,name,version') throw new AudienceError('audience_invalid_input');
      const input=body as {name:string;version:number;companyIds:string[]};
      const audience=await store.save(orgId,{...input,id:parts[1]});
      return ownerJson(audience,ctx.requestId);
    }
    return ownerError('route_not_found',ctx.requestId,404);
  } catch (error) {
    if (error instanceof OwnerValidationError) return ownerError(error.code,ctx.requestId,400);
    if (error instanceof AudienceError) return ownerError(error.code,ctx.requestId,error.status);
    return ownerError('audience_unavailable',ctx.requestId,503);
  }
}
