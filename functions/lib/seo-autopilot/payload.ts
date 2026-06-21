// Default payload the GPTBot Control Center sends to n8n on behalf of the
// admin (replacing what Runable used to send).
//
// The existing n8n workflow only requires that the payload look like the
// kind of brief Runable posted. We keep the shape minimal and predictable
// so the SEO Autopilot's "Validate Safety Rules" and "Prepare SEO Autopilot
// Config" nodes still pass.
//
// Custom payload from the admin UI can override any field; the resulting
// object is JSON-stringified into the n8n request body.

export interface AutopilotLaunchPayload {
  source: 'gptbot-admin' | 'gptbot-schedule' | string;
  triggered_at: string;
  triggered_by: string;
  run_id: string;
  // Override hooks — the admin UI can pass overrides; absent fields use
  // the n8n workflow's own defaults.
  topic_hint?: string;
  target_locales?: ('ru' | 'uz')[];
  notes?: string;
  // Free-form extensions for future Runable-style fields.
  [k: string]: unknown;
}

export function buildLaunchPayload(input: {
  source: 'admin' | 'schedule' | 'external';
  requestedBy: string;
  runId: string;
  overrides?: Record<string, unknown>;
}): AutopilotLaunchPayload {
  const base: AutopilotLaunchPayload = {
    source: input.source === 'admin' ? 'gptbot-admin'
          : input.source === 'schedule' ? 'gptbot-schedule'
          : 'gptbot-external',
    triggered_at: new Date().toISOString(),
    triggered_by: input.requestedBy,
    run_id: input.runId,
    target_locales: ['ru', 'uz'],
  };
  if (!input.overrides) return base;
  // Caller-supplied overrides win, but never overwrite source / triggered_*
  // / run_id, which are audit fields the bridge always owns.
  const protected_ = new Set(['source', 'triggered_at', 'triggered_by', 'run_id']);
  const out: AutopilotLaunchPayload = { ...base };
  for (const [k, v] of Object.entries(input.overrides)) {
    if (protected_.has(k)) continue;
    out[k] = v;
  }
  return out;
}
