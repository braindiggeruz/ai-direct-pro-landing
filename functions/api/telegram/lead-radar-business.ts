// Dedicated Telegram Business webhook for Lead Radar.
//
// This endpoint never shares the live lead-capture bot token, webhook route or
// update ledger. It accepts only a dedicated Bot API secret and stores only
// encrypted/HMAC-bound identifiers through the Lead Radar transport adapter.
import type { Env } from '../../_types';
import {
  assertLeadRadarRuntimeSchema,
  handleTelegramBusinessUpdate,
  isLeadRadarOrganizationAllowed,
  isTelegramBusinessConfigurationValid,
  LeadRadarTelegramBusinessError,
  parseTelegramBusinessUpdate,
  type LeadRadarTelegramBusinessEnv,
  verifyTelegramWebhookSecret,
} from '../../platform/lead-radar';

type TelegramBusinessPagesEnv = Env & LeadRadarTelegramBusinessEnv;

const MAX_BODY_BYTES = 32_768;

function response(status: number, body: string, allow?: string, retryAfter?: string): Response {
  return new Response(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      ...(allow ? { Allow: allow } : {}),
      ...(retryAfter ? { 'Retry-After': retryAfter } : {}),
    },
  });
}

export const onRequestPost: PagesFunction<TelegramBusinessPagesEnv> = async ({ request, env }) => {
  // Paused contact is an intentional drop: ACK so Telegram does not build a
  // retry backlog that could be replayed after an operator re-enables contact.
  if (env.LEAD_RADAR_CONTACT_ENABLED !== 'true') return response(200, 'paused');
  if (!isTelegramBusinessConfigurationValid(env, { requireDatabase: true })) {
    return response(503, 'unavailable', undefined, '300');
  }
  const authenticated = await verifyTelegramWebhookSecret(
    env.LEAD_RADAR_TELEGRAM_WEBHOOK_SECRET ?? '',
    request.headers.get('x-telegram-bot-api-secret-token'),
  );
  if (!authenticated) return response(401, 'forbidden');

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_BODY_BYTES) {
    return response(413, 'payload too large');
  }

  let raw: string;
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_BYTES) return response(413, 'payload too large');
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return response(200, 'ignored');
  }

  try {
    const db = env.GPTBOT_DRAFTS_DB;
    if (!db) return response(503, 'unavailable', undefined, '300');
    await assertLeadRadarRuntimeSchema(db);
    const update = parseTelegramBusinessUpdate(raw);
    await handleTelegramBusinessUpdate({
      db,
      env,
      update,
      isOrgAllowed: (orgId) => isLeadRadarOrganizationAllowed(env, orgId),
    });
    return response(200, 'ok');
  } catch (error) {
    if (error instanceof LeadRadarTelegramBusinessError) {
      return error.code === 'telegram_business_not_configured'
        ? response(503, 'unavailable', undefined, '300')
        : response(200, 'ignored');
    }
    return response(503, 'unavailable', undefined, '30');
  }
};

export const onRequestGet: PagesFunction<TelegramBusinessPagesEnv> = async () =>
  response(405, 'method not allowed', 'POST');
