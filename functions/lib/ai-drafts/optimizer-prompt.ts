// System / user prompt for the AI Draft Inbox "Optimise with AI" action.
//
// One module, one job: turn the current draft article into a strict JSON
// instruction for OpenRouter. The handler injects this into the chat
// completions request and parses the JSON response back into our schema.
//
// Hard rules baked into the system prompt:
//   • Never invent stats, clients, cases, certificates, guarantees,
//     legal or technical standards.
//   • Keep search intent and slug intact unless absolutely necessary.
//   • RU: fix "AI боты" → "AI-боты", trim title (45-65) / meta (120-160),
//     remove templated GPT phrasing, strengthen Uzbekistan locality.
//   • UZ: natural Uzbek Latin only — no Cyrillic, no Russian syntax.
//   • Return ONLY a JSON object matching the schema below.

import type { AiDraftArticle } from '../../../src/shared/ai-drafts';

/** Compact GPTBot business profile reused in every prompt. */
const GPTBOT_PROFILE = `GPTBot.uz is an Uzbekistan-based AI/GPT chatbot studio that builds
24/7 AI bots for businesses on Telegram, Instagram, WhatsApp and websites.
Bots collect name + phone + need from leads and forward them to a human manager.
Audience: small/medium business owners and marketers in Uzbekistan
(Russian-speaking + Uzbek Latin-speaking). Tone: confident, factual, local.`;

const RU_BLOCK = `RU-only fixes you MUST apply when present:
- Trim meta_title to 45-65 chars without losing the primary keyword.
- Trim meta_description to 120-160 chars; keep one clear CTA-like phrase.
- Rewrite weak / templated GPT openings ("В современном мире...", "Сегодня всё больше...").
- Replace bare URLs in body with human anchors (e.g. "узнайте подробнее про AI-ботов для Telegram").
- Fix the brand spelling: "AI боты" → "AI-боты", "ИИ боты" → "AI-боты".
- Remove raw HTML from CTA blocks; keep clean text + relative href.
- Strengthen Uzbekistan locality (Tashkent, Samarkand, real local pain points, prices in UZS only if already present).
- Sharpen H1 / H2 / H3 structure. Avoid stacked H2s with empty paragraphs.
- Keep FAQ items 4-8, short Q, factual A. Remove vague promises.
- internal_links: human anchors, target stays inside /ru/...`;

const UZ_BLOCK = `UZ-only fixes you MUST apply when present:
- Latin script only. No Cyrillic. No Russian word order.
- Use natural business Uzbek: "AI-bot", "mijozlar", "savdo bo'limi", "ish vaqti 24/7".
- Trim meta_title to 45-65 chars; meta_description to 120-160 chars.
- Keep H1 / H2 / H3 in proper Uzbek phrasing.
- internal_links: human anchors, target stays inside /uz/...
- Do NOT translate the slug; keep it identical to the source unless it is plainly broken.`;

const DO_NOT = `Hard prohibitions (do NOT do any of these):
- Do NOT invent statistics, percentages, customer counts, ROI numbers, market shares.
- Do NOT invent clients, case studies, certifications, awards, legal standards.
- Do NOT promise top-3 Google rankings or guaranteed sales growth.
- Do NOT change the slug unless mandatory.
- Do NOT switch language (RU stays RU, UZ stays UZ).
- Do NOT add new internal_links pointing to admin/api/draft/test paths.
- Do NOT remove the FAQ block; only improve it.
- Do NOT emit any field outside the response schema.`;

const RESPONSE_SCHEMA = `Response schema (return ONLY this JSON, no markdown, no comments):
{
  "article": {
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
      "text"?: string,
      "items"?: string[],
      "href"?: string,
      "src"?: string,
      "alt"?: string
    }],
    "faq": [{ "q": string, "a": string }],
    "internal_links": [{ "target": string, "anchor": string, "type"?: "contextual" | "block" | "footer" | "popular" | "breadcrumb" }],
    "schemas": ["Article" | "FAQPage" | "BreadcrumbList" | "Organization" | "WebSite" | "Service"],
    "keywords": string[],
    "og_title"?: string,
    "og_description"?: string,
    "og_image"?: string
  },
  "summary": {
    "changes": string[],
    "kept": string[]
  }
}`;

export function buildSystemPrompt(locale: 'ru' | 'uz'): string {
  return [
    'You are a senior SEO editor for GPTBot.uz. Your job is to optimise the provided draft article while keeping it factual and on-brand.',
    GPTBOT_PROFILE,
    locale === 'ru' ? RU_BLOCK : UZ_BLOCK,
    DO_NOT,
    'Preserve search intent. Do NOT change the topic. Do NOT change the slug unless absolutely necessary.',
    'Localise the article for the Uzbekistan market without inventing facts.',
    'When the validator below flagged issues, fix as many of them as possible — but never invent missing data.',
    'Return ONLY a single JSON object matching the schema. No prose, no markdown, no code fences.',
    RESPONSE_SCHEMA,
  ].join('\n\n');
}

export interface OptimiseUserContext {
  article: AiDraftArticle;
  seoBrief: Record<string, unknown> | null;
  validationIssues: Array<{ level?: string; rule?: string; message?: string; field?: string }>;
}

export function buildUserPrompt(ctx: OptimiseUserContext): string {
  const issuesText = ctx.validationIssues.length
    ? ctx.validationIssues
        .slice(0, 30)
        .map((i) => `- [${i.level || 'warn'}] ${i.rule || 'issue'}${i.field ? ` (${i.field})` : ''}: ${i.message || 'unspecified'}`)
        .join('\n')
    : 'No upstream validator issues recorded — focus on craft, locality, and SEO polish.';

  const briefText = ctx.seoBrief && Object.keys(ctx.seoBrief).length > 0
    ? JSON.stringify(ctx.seoBrief, null, 0).slice(0, 4000)
    : '{}';

  return [
    `Locale: ${ctx.article.locale}`,
    `Target keyword: ${ctx.article.target_keyword || '(none)'}`,
    `Target money page: ${ctx.article.target_money_page || '(none)'}`,
    `Current slug: ${ctx.article.slug}`,
    '',
    'Upstream validator issues to address (when possible):',
    issuesText,
    '',
    'SEO brief (JSON, may be empty):',
    briefText,
    '',
    'CURRENT ARTICLE (JSON to improve):',
    JSON.stringify(ctx.article, null, 0),
    '',
    'Now produce the optimised article + change summary as STRICT JSON per the schema.',
  ].join('\n');
}
