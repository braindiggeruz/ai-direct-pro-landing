// GET/POST /api/admin/seo-autopilot/schedule
//
//   GET  — return current schedule + recent jobs + system status flags.
//   POST — { mode: 'disabled' | 'weekly' | 'twice_weekly' } updates it.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { getSchedule, setSchedule } from '../../../lib/seo-autopilot/schedule';
import type { ScheduleMode } from '../../../lib/seo-autopilot/schedule';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const ALLOWED_MODES: ScheduleMode[] = ['disabled', 'weekly', 'twice_weekly'];

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  if (!env.GPTBOT_DRAFTS_DB) return json({ error: 'Storage not configured.' }, 503);
  const schedule = await getSchedule(env);
  return json({
    schedule,
    system: {
      n8n_webhook_secret_configured: !!env.N8N_WEBHOOK_SECRET,
      cron_secret_configured: !!env.CRON_SECRET,
      external_trigger_enabled: (env.EXTERNAL_AUTOPILOT_TRIGGER_ENABLED || 'false').toLowerCase() === 'true',
      drafts_db_configured: !!env.GPTBOT_DRAFTS_DB,
    },
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  if (!env.GPTBOT_DRAFTS_DB) return json({ error: 'Storage not configured.' }, 503);
  let body: { mode?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const mode = body.mode as ScheduleMode;
  if (!mode || !ALLOWED_MODES.includes(mode)) {
    return json({ error: `mode must be one of ${ALLOWED_MODES.join(' | ')}` }, 400);
  }
  const schedule = await setSchedule(env, mode, auth.email);
  return json({ schedule });
};
