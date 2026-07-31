// GET /api/admin/agents/overview — platform overview for the Owner Control Center.
import {
  loadPlatformOverview,
  methodNotAllowed,
  ownerJson,
  withOwnerRole,
} from '../../../platform/admin';

export const onRequestGet = withOwnerRole('support_readonly', async (ctx) => {
  const now = new Date();
  const overview = await loadPlatformOverview(ctx.db, now);
  const configuredUsername = (ctx.env.TELEGRAM_AGENTS_BOT_USERNAME ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
  const username = /^[a-z][a-z0-9_]{4,31}$/.test(configuredUsername)
    ? configuredUsername
    : null;
  const telegramReady = Boolean(
    username
    && ctx.env.TELEGRAM_AGENTS_BOT_TOKEN
    && ctx.env.TELEGRAM_AGENTS_WEBHOOK_SECRET,
  );
  return ownerJson({
    generated_at: now.toISOString(),
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
    telegram_bot: {
      username,
      webhook_endpoint: '/api/telegram/agents',
      configuration_status: telegramReady ? 'ready' : 'incomplete',
    },
    overview,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');
