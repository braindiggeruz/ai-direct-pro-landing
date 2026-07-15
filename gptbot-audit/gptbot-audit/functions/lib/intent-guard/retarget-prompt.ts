// System + user prompt for the AI Optimizer in `cannibalization_retarget` mode.
//
// The retarget prompt is a SUPERSET of the existing optimizer prompt — it
// keeps the same article schema (so /apply-optimization can be reused
// later if we want) BUT it asks the model to MOVE the article into a
// different search territory rather than polish the existing copy.
//
// Hard rules baked into the prompt:
//   * NEVER rewrite the money page; only the candidate article.
//   * Pick exactly one of the allowed strategies and explain it.
//   * Return a strict JSON envelope with both the new article + the
//     decision metadata.

import type { AiDraftArticle } from '../../../src/shared/ai-drafts';
import type { IntentConflict, IntentFingerprint } from '../../../src/shared/intent-guard';

const RU_BLOCK = `Локальные правила RU:
- meta_title: 45–65 символов, без шаблонных вступлений.
- meta_description: 120–160 символов, один чёткий CTA.
- H1, H2, H3 — естественная русская речь, без англицизмов вроде "AI боты"; правильно "AI-боты".
- НЕ переводи slug в кириллицу.
- Используй "AI-бот", "GPT-бот". Не используй "ИИ-бот" если оригинал на "AI".
- Подтверждай узбекистанский контекст: Ташкент, Самарканд, локальные сценарии, цены только если уже есть в оригинале.`;

const UZ_BLOCK = `Локальные правила UZ:
- Только Uzbek Latin. Никаких кириллических букв.
- Естественные узбекские формулировки, не калька с русского.
- meta_title 45–65, meta_description 120–160.
- Сохраняй slug.
- Используй "AI-bot", "GPT-bot", "mijozlar", "savdo bo'limi".`;

const ALLOWED_STRATEGIES = [
  'keep', 'narrow', 'change_audience', 'change_industry',
  'change_channel', 'change_funnel_stage', 'change_modifier',
  'change_content_format', 'merge', 'reject',
];

const RESPONSE_SCHEMA = `Верни СТРОГИЙ JSON по схеме:
{
  "decision": "retarget" | "merge" | "reject",
  "reason": string,
  "strategy": "keep" | "narrow" | "change_audience" | "change_industry" | "change_channel" | "change_funnel_stage" | "change_modifier" | "change_content_format" | "merge" | "reject",
  "occupied_intent": {
    "primary_entity": string, "search_intent": string, "funnel_stage": string,
    "audience": string, "industry": string, "channel": string, "geo": string,
    "modifier": string, "content_type": string
  },
  "new_intent": {
    "primary_entity": string, "search_intent": string, "funnel_stage": string,
    "audience": string, "industry": string, "channel": string, "geo": string,
    "modifier": string, "content_type": string
  },
  "optimized_article": {
    "locale": "ru" | "uz",
    "slug": string,
    "meta_title": string,
    "meta_description": string,
    "h1": string,
    "excerpt": string,
    "target_keyword": string,
    "target_money_page": string,
    "author": string,
    "body_blocks": [{
      "type": "h2" | "h3" | "p" | "list" | "cta" | "image" | "quote",
      "text"?: string, "items"?: string[], "href"?: string, "src"?: string, "alt"?: string
    }],
    "faq": [{ "q": string, "a": string }],
    "internal_links": [{ "target": string, "anchor": string, "type"?: "contextual" | "block" | "footer" | "popular" | "breadcrumb" }],
    "schemas": ["Article" | "FAQPage" | "BreadcrumbList" | "Organization" | "WebSite" | "Service"],
    "keywords": string[],
    "og_title"?: string, "og_description"?: string, "og_image"?: string
  },
  "changes": string[],
  "kept": string[],
  "warnings": string[],
  "expected_result": {
    "conflict_resolved": boolean,
    "supports_url": string,
    "new_funnel_role": string
  }
}`;

const HARD_PROHIBITIONS = `Нельзя:
- придумывать статистику, кейсы, клиентов, сертификаты, гарантии, SLA, точные сроки, неподтверждённые интеграции, цены без источника;
- обещать топ-3 в Google;
- менять money page (есть свой коммерческий интент);
- переводить статью на другую локаль;
- ставить internal_links на /admin-tools/*, /api/*, /draft/*, /test/*;
- удалять блок FAQ;
- возвращать поля вне схемы.`;

export function buildRetargetSystemPrompt(locale: 'ru' | 'uz', iteration = 1): string {
  const ITERATION_NOTE = iteration === 1
    ? ''
    : iteration === 2
      ? 'ЭТО ВТОРАЯ ПОПЫТКА. Первая попытка НЕ снизила риск каннибализации. Сейчас необходимо СИЛЬНО изменить угол — недостаточно перефразировать заголовок. Смени минимум 2 оси: audience+industry ИЛИ industry+channel ИЛИ funnel_stage+modifier.'
      : 'ЭТО ТРЕТЬЯ ПОПЫТКА. Предыдущие версии всё ещё конкурируют. Сейчас обязан изменить минимум 3 оси одновременно и предложить уникальный длинный хвост keyword из 4+ слов. Если самостоятельного интента нет — честно верни decision="merge" или "reject".';

  const HARD_OUTPUT_RULES = `ЖЁСТКИЕ ТРЕБОВАНИЯ К ВЫХОДУ (проверяются программно после твоего ответа):
1) Новый fingerprint должен отличаться от старого минимум на ${iteration === 1 ? '1' : iteration === 2 ? '2' : '3'} ось из набора (audience, industry, channel, funnel_stage, modifier, content_type, search_intent).
2) Новый meta_title не должен быть trigram-похож на старый более чем на ${iteration === 1 ? '55' : iteration === 2 ? '45' : '35'}%. То есть это должен быть РАЗНЫЙ заголовок, а не перефразированный.
3) Новый target_keyword не должен пересекаться со старым по словам более чем на ${iteration === 1 ? '45' : iteration === 2 ? '35' : '25'}%. Бери длинный хвост из 3-5 слов с УНИКАЛЬНЫМИ модификаторами.
4) Структура H2/H3 должна быть пересобрана: минимум половина заголовков разделов должна отражать новый угол.
5) Если в конфликте есть money_page и search_intent="commercial-buy" — обязательно переведи статью в informational (informational-howto, informational-list или informational-explain), money page сохраняет коммерческий интент. Статья должна ПОДДЕРЖИВАТЬ money page внутренней ссылкой, а не конкурировать.
6) В optimized_article должны быть ВСЕ поля схемы. body_blocks должен содержать минимум 6 блоков (h2 + p + h3 + p + list + cta).
7) В internal_links обязательно одна ссылка на target_money_page с человекочитаемым anchor (не "тут" / "здесь").

Если ты НЕ можешь выполнить эти требования (например, у статьи нет самостоятельного интента) — честно верни decision="merge" + reason="нет самостоятельного интента, нужно объединить со страницей X" или decision="reject" + reason="нет уникального запроса".`;

  return [
    'Ты — senior SEO-стратег GPTBot.uz и эксперт по разведению поисковых интентов (anti-cannibalization).',
    'Твоя задача: переориентировать переданную статью в собственную смысловую территорию так, чтобы она перестала конкурировать с money page и опубликованными материалами, но при этом усиливала кластер.',
    ITERATION_NOTE,
    locale === 'ru' ? RU_BLOCK : UZ_BLOCK,
    'Доступные стратегии (выбрать ровно одну): ' + ALLOWED_STRATEGIES.join(', ') + '.',
    iteration <= 1
      ? 'Если самостоятельного интента не существует — честно предложи decision="merge" или "reject", а не насильно меняй фразу "AI бот" на "GPT бот". Это НЕ разведение интентов.'
      : 'На этой итерации стратегии "keep" и "narrow" ЗАПРЕЩЕНЫ. Используй change_audience / change_industry / change_channel / change_funnel_stage / change_modifier / change_content_format / merge / reject.',
    'Money page всегда приоритетнее блога. Если возникает конфликт с money page — перевести БЛОГ в informational/middle-funnel и добавить ссылку на money page.',
    HARD_PROHIBITIONS,
    HARD_OUTPUT_RULES,
    'Сохрани slug, локаль и target_money_page если они не противоречат стратегии. Если меняешь target_money_page — оставь его в рамках того же locale-каталога.',
    RESPONSE_SCHEMA,
  ].filter(Boolean).join('\n\n');
}

export interface RetargetUserContext {
  article: AiDraftArticle;
  fingerprint: IntentFingerprint;
  conflicts: IntentConflict[];
  risk_score_before: number;
  recommendation: {
    action: string;
    reason: string;
    recommended_angle?: string;
    recommended_keyword?: string;
    recommended_funnel_stage?: string;
    recommended_target_money_page?: string;
  };
  user_hint?: string;
  /** Optional: feedback from a failed previous iteration's constraint check. */
  previous_failure_feedback?: string;
  /** Optional: list of last attempt summaries to discourage repetition. */
  prior_attempts?: Array<{ meta_title: string; target_keyword: string; fingerprint: IntentFingerprint; risk_score: number }>;
}

export function buildRetargetUserPrompt(ctx: RetargetUserContext): string {
  const conflictsLines = ctx.conflicts.slice(0, 5).map((c, i) => {
    return `${i + 1}. [${c.source_type}] id=${c.id} url=${c.url || '(draft)'} title="${c.title}" det_score=${c.similarity.score} intent_key=${c.intent_key} same_money=${c.similarity.same_target_money_page}`;
  }).join('\n');

  const priorBlock = ctx.prior_attempts && ctx.prior_attempts.length > 0
    ? [
        '',
        'ТВОИ ПРЕДЫДУЩИЕ ПОПЫТКИ (нельзя повторять):',
        ...ctx.prior_attempts.map((p, i) => `  Попытка ${i + 1}: title="${p.meta_title}" keyword="${p.target_keyword}" fp=${JSON.stringify(p.fingerprint)} risk=${p.risk_score}`),
      ].join('\n')
    : '';

  return [
    `Локаль: ${ctx.article.locale}`,
    `Текущий fingerprint: ${JSON.stringify(ctx.fingerprint)}`,
    `Risk score сейчас: ${ctx.risk_score_before}/100`,
    `Рекомендация AI-судьи: action=${ctx.recommendation.action}; reason="${ctx.recommendation.reason}"; angle="${ctx.recommendation.recommended_angle || ''}"; keyword="${ctx.recommendation.recommended_keyword || ''}"; funnel="${ctx.recommendation.recommended_funnel_stage || ''}"; money_page="${ctx.recommendation.recommended_target_money_page || ''}"`,
    ctx.user_hint ? `Подсказка администратора: ${ctx.user_hint}` : '',
    ctx.previous_failure_feedback ? '' : '',
    ctx.previous_failure_feedback || '',
    priorBlock,
    '',
    `Конфликтующие документы (shortlist):`,
    conflictsLines || '(пусто)',
    '',
    'ОРИГИНАЛЬНАЯ СТАТЬЯ (JSON, который нужно переориентировать):',
    JSON.stringify(ctx.article, null, 0),
    '',
    'Верни СТРОГИЙ JSON по схеме. Никакого markdown, никаких code-fence.',
  ].filter(Boolean).join('\n');
}
