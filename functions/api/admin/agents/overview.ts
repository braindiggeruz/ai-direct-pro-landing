// GET /api/admin/agents/overview — platform overview for the Owner Control Center.
import {
  loadPlatformOverview,
  methodNotAllowed,
  ownerJson,
  withOwnerRole,
} from '../../../platform/admin';

export const onRequestGet = withOwnerRole('support_readonly', async (ctx) => {
  const overview = await loadPlatformOverview(ctx.db, new Date());
  return ownerJson({
    generated_at: new Date().toISOString(),
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    marketplace: {
      // P3.1 has no public listing surface. The placeholder is explicit so the
      // UI never has to guess whether the feature is missing or broken.
      enabled: false,
      note: 'Public marketplace listings arrive in P3.2 with opt-in projection and moderation.',
    },
    runtime_policy: {
      first_party_automation_enabled:
        (ctx.env.FIRST_PARTY_AUTOMATION_ENABLED || 'false').toLowerCase() === 'true',
      first_party_automation_path: 'sole',
      auto_publication: false,
    },
    overview,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');
