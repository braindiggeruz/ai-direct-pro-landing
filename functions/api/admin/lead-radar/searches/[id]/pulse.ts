import { ownerError, ownerJson, withOwnerRole } from '../../../../platform/admin';
import { assertLeadRadarRuntimeSchema, ownerOrgId, resolveLeadRadarCapabilities, type LeadRadarQueueSender } from '../../../../platform/lead-radar';
import { resumeSearchPulse } from '../../../../platform/lead-radar/search-pulse';

export const onRequestPost = withOwnerRole('platform_owner', async (ctx) => {
  const searchId = String(ctx.params.id ?? '');
  if (!/^search_[0-9a-f]{32}$/.test(searchId)) return ownerError('search_not_found', ctx.requestId, 404);
  try {
    await assertLeadRadarRuntimeSchema(ctx.db);
  } catch {
    return ownerError('lead_radar_schema_unavailable', ctx.requestId, 503);
  }
  const orgId = await ownerOrgId(ctx.actor.email);
  resolveLeadRadarCapabilities(ctx.env, orgId);
  if (!ctx.env.AUTOMATION_QUEUE) return ownerError('automation_queue_unavailable', ctx.requestId, 503);
  try {
    return ownerJson(await resumeSearchPulse({
      db: ctx.db,
      orgId,
      searchId,
      now: new Date(),
      queue: ctx.env.AUTOMATION_QUEUE as unknown as LeadRadarQueueSender,
      allowOrganization: (candidateOrgId: string) => candidateOrgId === orgId,
    }), ctx.requestId);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'search_not_found') return ownerError('search_not_found', ctx.requestId, 404);
    if (code === 'search_not_running') return ownerError('search_not_running', ctx.requestId, 409);
    return ownerError('lead_radar_pulse_failed', ctx.requestId, 503);
  }
});
