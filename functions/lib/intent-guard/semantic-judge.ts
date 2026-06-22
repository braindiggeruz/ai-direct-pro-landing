// Optional OpenRouter semantic judge for the Intent Guard.
//
// Called only after the deterministic shortlist returned at least one
// medium-grade conflict. The judge receives:
//   * the candidate's intent + title + meta + headings + FAQ snapshot
//   * the top 3-5 conflicts (id, url, title, headings, target keyword,
//     source_type)
//   * the deterministic + SERP scores
//
// It returns a strict JSON object validated server-side. Anything that
// doesn't parse falls back to "used:false, risk_score: deterministic".

import type { Env } from '../../_types';
import { optimiseWithOpenRouter, parseStrictJson } from '../ai-drafts/optimizer-client';
import type {
  IntentConflict, IntentFingerprint, SemanticVerdict, IntentRiskLevel,
} from '../../../src/shared/intent-guard';
import { riskLevelFromScore } from '../../../src/shared/intent-guard';

interface JudgeContext {
  locale: 'ru' | 'uz';
  fingerprint: IntentFingerprint;
  meta_title: string;
  h1: string;
  excerpt: string;
  target_keyword: string;
  target_money_page: string | null;
  headings: string[];
  faq_questions: string[];
  conflicts: IntentConflict[];
  deterministic_top_score: number;
  serper_overlap: number;
}

const SYSTEM_PROMPT_RU = `Ты — senior SEO-аналитик GPTBot.uz. Ты определяешь, занимает ли эта статья УНИКАЛЬНЫЙ поисковый интент или каннибализирует другие материалы сайта.
Ответь СТРОГО в JSON по схеме. Не придумывай.
Money page всегда приоритетнее блога. RU и UZ — независимые языки и НЕ конкурируют между собой.

Схема ответа:
{
  "risk_score": 0-100,
  "risk_level": "low" | "medium" | "high",
  "summary": "одно-два предложения по-русски",
  "current_intent": {
    "primary_entity": string, "search_intent": string, "funnel_stage": string,
    "audience": string, "industry": string, "channel": string, "geo": string,
    "modifier": string, "content_type": string
  },
  "conflicts": [{ "id": string, "url": string|null, "reason": string }],
  "recommendation": {
    "action": "keep"|"narrow"|"change_audience"|"change_industry"|"change_channel"|"change_funnel_stage"|"change_modifier"|"change_content_format"|"merge"|"reject",
    "reason": string,
    "recommended_angle": string,
    "recommended_keyword": string,
    "recommended_funnel_stage": string,
    "recommended_target_money_page": string
  }
}

Жёсткие правила:
- НЕ выдумывай несуществующие конфликтующие документы; выбирай только из переданного списка.
- НЕ предлагай менять money page; всегда защищай её коммерческий интент.
- Если статья и money page конкурируют по коммерческому запросу — рекомендуй перевести СТАТЬЮ в informational/middle-funnel.
- Если самостоятельного интента нет — честно предложи "merge" или "reject".
- Не обещай топ-3 в Google.`;

function buildUserPrompt(ctx: JudgeContext): string {
  const conflictsLines = ctx.conflicts.slice(0, 6).map((c, i) => {
    return `${i + 1}. [${c.source_type}] id=${c.id} url=${c.url || '(draft)'} title="${c.title}" target_kw="${c.fingerprint.search_intent}" intent_key=${c.intent_key} det_score=${c.similarity.score}`;
  }).join('\n');
  return [
    `Локаль: ${ctx.locale}`,
    `Текущий fingerprint: ${JSON.stringify(ctx.fingerprint)}`,
    `Meta title: ${ctx.meta_title}`,
    `H1: ${ctx.h1}`,
    `Excerpt: ${ctx.excerpt}`,
    `Target keyword: ${ctx.target_keyword}`,
    `Target money page: ${ctx.target_money_page || '(none)'}`,
    `Headings (≤ 12): ${(ctx.headings || []).slice(0, 12).join(' | ')}`,
    `FAQ questions (≤ 6): ${(ctx.faq_questions || []).slice(0, 6).join(' | ')}`,
    '',
    `Конфликтные документы (deterministic shortlist):`,
    conflictsLines || '(пусто)',
    '',
    `Deterministic max score: ${ctx.deterministic_top_score}`,
    `SERP overlap (Jaccard 0..1): ${ctx.serper_overlap}`,
    '',
    'Верни строгий JSON по схеме без markdown.',
  ].join('\n');
}

export async function judgeSemantic(env: Env, ctx: JudgeContext): Promise<SemanticVerdict> {
  if (!env.OPENROUTER_API_KEY) return defaultVerdict(ctx);
  const system = SYSTEM_PROMPT_RU;
  const user = buildUserPrompt(ctx);
  const llm = await optimiseWithOpenRouter(env, system, user);
  if (!llm.ok) return defaultVerdict(ctx);
  const parsed = parseStrictJson(llm.content) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') return defaultVerdict(ctx);

  const rawScore = Number(parsed.risk_score);
  const score = Number.isFinite(rawScore) ? Math.round(Math.max(0, Math.min(100, rawScore))) : ctx.deterministic_top_score;
  const level: IntentRiskLevel = (parsed.risk_level === 'low' || parsed.risk_level === 'medium' || parsed.risk_level === 'high')
    ? parsed.risk_level
    : riskLevelFromScore(score);

  const fp = (parsed.current_intent && typeof parsed.current_intent === 'object')
    ? { ...ctx.fingerprint, ...(parsed.current_intent as Partial<IntentFingerprint>) }
    : ctx.fingerprint;

  const rec = (parsed.recommendation && typeof parsed.recommendation === 'object')
    ? parsed.recommendation as Record<string, unknown>
    : {};
  const action: SemanticVerdict['recommendation']['action'] =
    typeof rec.action === 'string' && [
      'keep','narrow','change_audience','change_industry','change_channel',
      'change_funnel_stage','change_modifier','change_content_format','merge','reject',
    ].includes(rec.action) ? (rec.action as SemanticVerdict['recommendation']['action']) : 'keep';

  return {
    used: true,
    risk_score: score,
    risk_level: level,
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 600) : '',
    current_intent: fp,
    conflicts: Array.isArray(parsed.conflicts)
      ? (parsed.conflicts as Array<Record<string, unknown>>).slice(0, 8).map((c) => ({
          id: String(c.id || ''),
          url: typeof c.url === 'string' ? c.url : null,
          reason: typeof c.reason === 'string' ? c.reason.slice(0, 280) : '',
        }))
      : [],
    recommendation: {
      action,
      reason: typeof rec.reason === 'string' ? rec.reason.slice(0, 400) : '',
      recommended_angle: typeof rec.recommended_angle === 'string' ? rec.recommended_angle.slice(0, 240) : '',
      recommended_keyword: typeof rec.recommended_keyword === 'string' ? rec.recommended_keyword.slice(0, 240) : '',
      recommended_funnel_stage: typeof rec.recommended_funnel_stage === 'string' ? rec.recommended_funnel_stage.slice(0, 40) : '',
      recommended_target_money_page: typeof rec.recommended_target_money_page === 'string' ? rec.recommended_target_money_page.slice(0, 400) : '',
    },
    model: llm.model,
  };
}

function defaultVerdict(ctx: JudgeContext): SemanticVerdict {
  return {
    used: false,
    risk_score: ctx.deterministic_top_score,
    risk_level: riskLevelFromScore(ctx.deterministic_top_score),
    summary: '',
    current_intent: ctx.fingerprint,
    conflicts: [],
    recommendation: {
      action: 'keep',
      reason: '',
      recommended_angle: '',
      recommended_keyword: '',
      recommended_funnel_stage: '',
      recommended_target_money_page: '',
    },
  };
}
