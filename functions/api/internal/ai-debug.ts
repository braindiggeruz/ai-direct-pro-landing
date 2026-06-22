// Internal debug endpoint — times a single Workers AI call so we can
// pinpoint per-locale latency without consuming a full pipeline run.
//
// Auth: Bearer ${CRON_SECRET} (same as the scheduled-run trigger).
//
// Method: POST
// Body:   { "model": "<optional model>", "locale": "ru"|"uz", "max_tokens": <int> }
// Returns: { ok, model, duration_ms, output_length, output_excerpt }

import type { Env } from '../../_types';
import { constantTimeEqual } from '../../lib/ai-drafts/store';

interface AiResponse {
  response?: string;
  result?: { response?: string; choices?: Array<{ message?: { content?: string } }> };
  choices?: Array<{ message?: { content?: string } }>;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  const auth = request.headers.get('Authorization') || '';
  const expected = `Bearer ${env.CRON_SECRET || ''}`;
  if (!env.CRON_SECRET || !constantTimeEqual(auth, expected)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  if (!env.AI) {
    return new Response(JSON.stringify({ error: 'AI binding missing at runtime' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  let body: Record<string, unknown> = {};
  try { body = await request.json() as Record<string, unknown>; } catch { /* default */ }

  const model = typeof body.model === 'string' && body.model.trim() ? body.model : (env.CF_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast');
  const max_tokens = typeof body.max_tokens === 'number' ? body.max_tokens : 2000;
  const userPrompt = typeof body.prompt === 'string' && body.prompt ? body.prompt :
    'Reply with a strict JSON object {"ok": true, "echo": "gptbot-test"} and nothing else.';

  const aiRunner = env.AI as unknown as {
    run: (model: string, input: Record<string, unknown>) => Promise<AiResponse>;
  };

  const t0 = Date.now();
  let out = '';
  let errMsg: string | null = null;
  try {
    const r = await aiRunner.run(model, {
      messages: [
        { role: 'system', content: 'Reply ONLY with a strict JSON object. Do not use markdown code fences, do not prepend prose.' },
        { role: 'user', content: userPrompt },
      ],
      max_tokens,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });
    out = String(
      r.response ||
      r.result?.response ||
      r.result?.choices?.[0]?.message?.content ||
      r.choices?.[0]?.message?.content ||
      '',
    );
  } catch (e) {
    errMsg = (e as Error).message || 'AI.run threw';
  }
  const t1 = Date.now();
  return new Response(JSON.stringify({
    ok: !errMsg,
    model,
    duration_ms: t1 - t0,
    output_length: out.length,
    output_excerpt: out.slice(0, 400),
    error: errMsg,
  }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
