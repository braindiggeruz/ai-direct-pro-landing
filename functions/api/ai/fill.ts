// Generates a draft (title/description/H1/heroSubtitle/FAQ/anchors) for the operator to review.
// NEVER auto-publishes. Server-side only — the API key never reaches the browser bundle.
//
// Provider: OpenRouter (https://openrouter.ai). OpenAI-compatible chat completions endpoint.
//   - Economy default: openai/gpt-4o-mini   (cheap, stable, native JSON mode, strong RU)
//   - Quality fallback: anthropic/claude-sonnet-4.5 (premium copy quality, RU + Uzbek Latin)
//
// All keys/models come from Cloudflare Pages env vars. If OPENROUTER_API_KEY is not set
// the endpoint returns 503 gracefully — build/deploy do NOT fail.
import type { Env } from '../../_types';
import { requireAuth } from '../../lib/jwt';

interface OpenRouterEnv extends Env {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL_ECONOMY?: string;
  OPENROUTER_MODEL_QUALITY?: string;
  OPENROUTER_SITE_URL?: string;
  OPENROUTER_APP_TITLE?: string;
}

const DEFAULT_ECONOMY = 'openai/gpt-4o-mini';
const DEFAULT_QUALITY = 'anthropic/claude-sonnet-4.5';
const MAX_OUTPUT_TOKENS = 900;
const TEMPERATURE = 0.5;

const SYS = (locale: string) =>
  `You are a senior SEO copywriter for GPTBot — an AI/GPT bot for business in Uzbekistan that
replies to clients in Telegram/Instagram 24/7, collects name + phone + need and forwards
leads to a manager. Output language: ${locale === 'uz' ? 'Uzbek (Latin script)' : 'Russian'}.
Hard rules: NEVER invent fake clients, cases, statistics, prices or guarantees.
NEVER promise top-3 rankings or guaranteed sales growth. Keep it factual.
Respond ONLY with strict JSON: {"title": string (45-65 chars), "description": string (120-160),
"h1": string, "heroSubtitle": string, "faq": [{"q":string,"a":string}] (4-6 items),
"anchors": [string] (5)}`;

function parseDraft(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return { raw: text };
}

interface ChatResp { choices?: { message?: { content?: string } }[] }

async function callOpenRouter(
  env: OpenRouterEnv,
  model: string,
  sys: string,
  user: string,
): Promise<{ ok: true; content: string } | { ok: false; status: number; detail: string }> {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      // OpenRouter recommended attribution headers (public, no secrets)
      'HTTP-Referer': env.OPENROUTER_SITE_URL || 'https://gptbot.uz',
      'X-Title': env.OPENROUTER_APP_TITLE || 'GPTBot SEO Cockpit',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      temperature: TEMPERATURE,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) {
    return { ok: false, status: resp.status, detail: await resp.text() };
  }
  const data = await resp.json() as ChatResp;
  return { ok: true, content: data.choices?.[0]?.message?.content || '' };
}

export const onRequestPost: PagesFunction<OpenRouterEnv> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  if (!env.OPENROUTER_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const body = await request.json().catch(() => null) as null | {
    primaryKeyword?: string; locale?: string; pageType?: string; h1?: string; quality?: boolean;
  };
  if (!body || !body.primaryKeyword) {
    return new Response(JSON.stringify({ error: 'primaryKeyword required' }), { status: 400 });
  }

  const sys = SYS(body.locale || 'ru');
  const userMsg = `Primary keyword: ${body.primaryKeyword}\nPage type: ${body.pageType || 'money'}\nExisting H1: ${body.h1 || '-'}\n\nGenerate the JSON now.`;

  const economy = env.OPENROUTER_MODEL_ECONOMY || DEFAULT_ECONOMY;
  const quality = env.OPENROUTER_MODEL_QUALITY || DEFAULT_QUALITY;

  // If the operator explicitly asked for quality, skip economy.
  const firstModel = body.quality ? quality : economy;
  let attempt = await callOpenRouter(env, firstModel, sys, userMsg);
  let usedModel = firstModel;
  let draft: unknown = null;

  if (attempt.ok) {
    draft = parseDraft(attempt.content);
    const looksBad = !draft || typeof draft !== 'object' || (draft as { raw?: string }).raw !== undefined;
    if (looksBad && firstModel !== quality) {
      // Try quality fallback once.
      const second = await callOpenRouter(env, quality, sys, userMsg);
      if (second.ok) {
        attempt = second;
        usedModel = quality;
        draft = parseDraft(second.content);
      }
    }
  } else if (firstModel !== quality) {
    // Economy unavailable — try quality.
    const second = await callOpenRouter(env, quality, sys, userMsg);
    if (second.ok) {
      attempt = second;
      usedModel = quality;
      draft = parseDraft(second.content);
    }
  }

  if (!attempt.ok) {
    return new Response(
      JSON.stringify({ error: `LLM upstream ${attempt.status}`, detail: attempt.detail.slice(0, 500) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, model: usedModel, draft }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
