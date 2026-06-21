// Default payload the GPTBot Control Center sends to n8n on behalf of the
// admin (replacing what Runable used to send).

export interface AutopilotLaunchPayload {
  task_type: 'gptbot_seo_autopilot';
  site_url: string;
  sitemap_url: string;
  manual_approval_required: boolean;
  do_not_publish_without_approval: boolean;
  do_not_modify_site: boolean;
  source: 'gptbot-admin' | 'gptbot-schedule' | string;
  triggered_at: string;
  triggered_by: string;
  run_id: string;
  topic_hint?: string;
  target_locales?: ('ru' | 'uz')[];
  notes?: string;
  [k: string]: unknown;
}

export function buildLaunchPayload(input: {
  source: 'admin' | 'schedule' | 'external';
  requestedBy: string;
  runId: string;
  overrides?: Record<string, unknown>;
}): AutopilotLaunchPayload {
  const base: AutopilotLaunchPayload = {
    task_type: 'gptbot_seo_autopilot',
    site_url: 'https://gptbot.uz',
    sitemap_url: 'https://gptbot.uz/sitemap.xml',
    manual_approval_required: true,
    do_not_publish_without_approval: true,
    do_not_modify_site: true,
    source: input.source === 'admin' ? 'gptbot-admin'
      : input.source === 'schedule' ? 'gptbot-schedule'
      : 'gptbot-external',
    triggered_at: new Date().toISOString(),
    triggered_by: input.requestedBy,
    run_id: input.runId,
    target_locales: ['ru', 'uz'],
  };

  if (!input.overrides) return base;

  const protectedFields = new Set([
    'task_type',
    'site_url',
    'sitemap_url',
    'manual_approval_required',
    'do_not_publish_without_approval',
    'do_not_modify_site',
    'source',
    'triggered_at',
    'triggered_by',
    'run_id',
  ]);

  const out: AutopilotLaunchPayload = { ...base };
  for (const [key, value] of Object.entries(input.overrides)) {
    if (protectedFields.has(key)) continue;
    out[key] = value;
  }
  return out;
}
