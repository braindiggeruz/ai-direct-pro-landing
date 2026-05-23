// Generates a draft (title/description/H1/FAQ/anchors) for the operator to review.
// NEVER auto-publishes. Uses Emergent universal LLM key via OpenAI-compatible endpoint.
//
// The Emergent gateway exposes OpenAI's `/v1/chat/completions` shape so we can call it
// directly with fetch — no Node SDK required.
import type { Env } from '../../_types';
import { requireAuth } from '../../lib/jwt';

interface EmergentEnv extends Env { EMERGENT_LLM_KEY?: string }

const SYS = (locale: string) =>
  `You are a senior SEO copywriter for GPTBot — an AI/GPT bot for business in Uzbekistan that
  replies to clients in Telegram/Instagram 24/7, collects name + phone + need and forwards
  leads to a manager. Output language: ${locale === 'uz' ? 'Uzbek (Latin script)' : 'Russian'}.
  Hard rules: NEVER invent fake clients, cases, statistics, prices or guarantees.
  NEVER promise top-3 rankings or guaranteed sales growth. Keep it factual.
  Respond ONLY with strict JSON: {"title": string (45-65 chars), "description": string (120-160),
  "h1": string, "heroSubtitle": string, "faq": [{"q":string,"a":string}] (4-6 items),
  "anchors": [string] (5)}`;

export const onRequestPost: PagesFunction<EmergentEnv> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const key = env.EMERGENT_LLM_KEY;
  if (!key) return new Response(JSON.stringify({ error: 'EMERGENT_LLM_KEY not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  const body = await request.json().catch(() => null) as null | { primaryKeyword?: string; locale?: string; pageType?: string; h1?: string };
  if (!body || !body.primaryKeyword) return new Response(JSON.stringify({ error: 'primaryKeyword required' }), { status: 400 });

  const userMsg = `Primary keyword: ${body.primaryKeyword}\nPage type: ${body.pageType || 'money'}\nExisting H1: ${body.h1 || '-'}\n\nGenerate the JSON now.`;
  const resp = await fetch('https://integrations.emergentagent.com/llm/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5.2',
      messages: [
        { role: 'system', content: SYS(body.locale || 'ru') },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.4,
    }),
  });
  if (!resp.ok) {
    return new Response(JSON.stringify({ error: `LLM error ${resp.status}`, detail: await resp.text() }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
  const data = await resp.json() as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content || '';
  let draft: unknown;
  try {
    const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    draft = JSON.parse(cleaned);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { draft = JSON.parse(text.slice(start, end + 1)); } catch { draft = { raw: text }; }
    } else { draft = { raw: text }; }
  }
  return new Response(JSON.stringify({ ok: true, draft }), { headers: { 'Content-Type': 'application/json' } });
};
