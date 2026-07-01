// Cross-locale translator for AI Draft articles.
//
// Given a source article in one locale, produces a publish-ready
// equivalent in the other locale. NOT a literal translation — this
// is a localisation step that:
//   * Translates body / FAQ / lists into idiomatic business language
//     of the target locale (UZ = Uzbek Latin only, no Cyrillic, no
//     Russian word order; RU = clean operator-level Russian).
//   * Adapts internal_links targets to the target locale prefix
//     (/ru/... ↔ /uz/...).
//   * Adapts target_money_page to the target locale's canonical money
//     page if the source used the other locale's path.
//   * Transliterates / re-derives the slug for the target locale.
//   * Distinct meta_title, meta_description, h1, excerpt — not a
//     word-by-word translation.
//
// The output schema matches AiDraftArticle exactly so the result can
// be fed straight through `validateArticle` and `addDraftLocaleArticle`.
//
// Implementation choices:
//   * Gemini 2.5 Flash via the existing gemini-client, jsonObject mode,
//     thinkingBudget: 0 (same as the optimiser — the structure is given,
//     the model just needs to render it in the target language).
//   * One pass only (no balanced+aggressive split). Translation has a
//     well-defined target, so the parallel-diverge pattern that helps
//     the optimiser doesn't apply here. Wall ≈ 25-40 s.
//   * Locks slug regeneration to ASCII + kebab + max 80 chars even if
//     the model returns something exotic.
//
// References:
//   functions/api/admin/ai-drafts/[id]/translate-locale.ts (caller)
//   functions/lib/ai-drafts/store.ts                       (addDraftLocaleArticle)

import type { Env } from '../../_types';
import type { AiDraftArticle } from '../../../src/shared/ai-drafts';
import { routeLlmCall } from '../llm/router';
import { validateArticle, type ValidationError } from './validators';
import { parseStrictJson } from './optimizer-client';
import { buildSeoWarnings } from '../seo-validation';

const MAX_OUTPUT_TOKENS = 8000;
const TEMPERATURE = 0.5;
const TIMEOUT_MS = 65_000;

// Default money pages on gptbot.uz — used when the source article
// referenced a money page in its own locale and we need an equivalent
// in the target locale.
const DEFAULT_MONEY_PAGE_RU = '/ru/ai-bot-dlya-biznesa/';
const DEFAULT_MONEY_PAGE_UZ = '/uz/biznes-uchun-ai-bot/';

export interface TranslateRunSuccess {
  ok: true;
  source_locale: 'ru' | 'uz';
  target_locale: 'ru' | 'uz';
  model: string;
  article: AiDraftArticle;
  validation: { passed: boolean; issues: ValidationError[] };
  warnings: string[];
  durationMs: number;
}

export interface TranslateRunFailure {
  ok: false;
  source_locale: 'ru' | 'uz';
  target_locale: 'ru' | 'uz';
  status: 'upstream' | 'validation';
  error: string;
  detail?: string;
}

export type TranslateRunResult = TranslateRunSuccess | TranslateRunFailure;

/**
 * Translate-and-localise a source article into the target locale.
 * Never throws.
 */
export async function runTranslateLocale(
  env: Env,
  source: AiDraftArticle,
  targetLocale: 'ru' | 'uz',
): Promise<TranslateRunResult> {
  const sourceLocale = (source.locale === 'ru' || source.locale === 'uz') ? source.locale : 'ru';
  if (sourceLocale === targetLocale) {
    return {
      ok: false,
      source_locale: sourceLocale,
      target_locale: targetLocale,
      status: 'validation',
      error: `Cannot translate to the same locale (${targetLocale}).`,
    };
  }

  // Adapt target_money_page to the target locale. If the source has a
  // money page in the SOURCE locale prefix, swap to the canonical
  // default of the target locale. The translator should not invent a
  // new money page mid-flight.
  let suggestedMoneyPage: string;
  if (source.target_money_page && source.target_money_page.startsWith(`/${targetLocale}/`)) {
    suggestedMoneyPage = source.target_money_page;
  } else {
    suggestedMoneyPage = targetLocale === 'ru' ? DEFAULT_MONEY_PAGE_RU : DEFAULT_MONEY_PAGE_UZ;
  }

  const system = buildSystemPrompt(targetLocale);
  const user = buildUserPrompt(source, sourceLocale, targetLocale, suggestedMoneyPage);

  const r = await routeLlmCall(env, {
    feature: 'translate',
    locale: targetLocale,
    system,
    user,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: TEMPERATURE,
    timeoutMs: TIMEOUT_MS,
    jsonObject: true,
    thinkingBudget: 0,
  });
  if (!r.ok) {
    return {
      ok: false,
      source_locale: sourceLocale,
      target_locale: targetLocale,
      status: 'upstream',
      error: `LLM router failed (provider=${r.meta.provider} model=${r.meta.model}): ${r.error}${r.status ? ` (HTTP ${r.status})` : ''}`,
      detail: r.rawExcerpt?.slice(0, 600),
    };
  }

  const parsed = parseStrictJson(r.content);
  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      source_locale: sourceLocale,
      target_locale: targetLocale,
      status: 'validation',
      error: 'Gemini returned non-JSON content.',
      detail: `len=${r.content.length} | excerpt=${r.content.slice(0, 300).replace(/\s+/g, ' ')}`,
    };
  }
  // The translator returns the article directly (no wrapper) for
  // simplicity. Accept either {article: {…}} or a bare object.
  const rawArticle =
    (parsed as Record<string, unknown>).article ??
    parsed;

  const errors: ValidationError[] = [];
  const article = validateArticle(rawArticle, 'translated', errors);
  if (!article) {
    return {
      ok: false,
      source_locale: sourceLocale,
      target_locale: targetLocale,
      status: 'validation',
      error: 'Translated article failed local schema validation.',
      detail: errors.slice(0, 5).map((e) => `${e.path || '?'}=${e.message}`).join('; ').slice(0, 600),
    };
  }

  // Defence in depth — even if the model wandered, force the basics:
  article.locale = targetLocale;
  // Slug must be ASCII kebab-case ≤ 80 chars. If the model returned
  // something exotic, fall back to a transliterated copy of the source
  // slug with a "-<target>" suffix as a last-ditch unique value.
  if (!/^[a-z0-9-]{1,80}$/.test(article.slug || '')) {
    const safe = transliterateToSlug(source.slug || article.h1 || 'article', targetLocale);
    article.slug = safe;
  }
  // Internal links MUST point at /uz/ when target is uz. The validator
  // also enforces this, but we double-check (and fix) here so a
  // model-emitted /ru/ link on a uz article gets rewritten transparently.
  article.internal_links = (article.internal_links || []).map((l) => {
    if (!l || typeof l !== 'object') return l;
    let target = String((l as { target?: string }).target || '');
    if (target.startsWith(`/${sourceLocale}/`)) {
      target = `/${targetLocale}/` + target.slice(`/${sourceLocale}/`.length);
    }
    return { ...l, target };
  });
  if (article.target_money_page && article.target_money_page.startsWith(`/${sourceLocale}/`)) {
    article.target_money_page = suggestedMoneyPage;
  }

  const warnings: string[] = buildSeoWarnings(article, { locale: targetLocale, asStrings: true, articleJson: JSON.stringify(article) });

  return {
    ok: true,
    source_locale: sourceLocale,
    target_locale: targetLocale,
    model: `${r.meta.provider}/${r.meta.model}`,
    article,
    validation: { passed: errors.length === 0, issues: errors.slice(0, 50) },
    warnings,
    durationMs: r.meta.duration_ms,
  };
}

// ── Prompt --------------------------------------------------------------

function buildSystemPrompt(targetLocale: 'ru' | 'uz'): string {
  const langName = targetLocale === 'ru'
    ? 'Russian (русский)'
    : 'Uzbek Latin (o\'zbek tilida, lotin yozuvi)';
  const localeBlock = targetLocale === 'ru' ? RU_LOCALE_BLOCK : UZ_LOCALE_BLOCK;
  return [
    `You are a senior SEO localisation editor for GPTBot.uz (an AI-chatbot SaaS for Uzbekistan SMBs). Your job is to convert the provided article into ${langName}, producing a publish-ready piece that reads as if it had been written in ${langName} from scratch.`,
    `NOT a literal translation. NOT a calque from the source language. The result must read as a native ${langName} article by an experienced Uzbekistan automation practitioner.`,
    '',
    `STRICT JSON SHAPE (return ONLY this JSON, no markdown, no fences):`,
    '{',
    `  "locale": "${targetLocale}",`,
    `  "slug": "kebab-case-ascii-slug-max-80",`,
    `  "meta_title": "string up to 220 chars",`,
    `  "meta_description": "string up to 320 chars",`,
    `  "h1": "string up to 220 chars",`,
    `  "excerpt": "single paragraph up to 800 chars",`,
    `  "target_keyword": "primary keyword in ${langName}",`,
    `  "target_money_page": "/${targetLocale}/...",`,
    `  "author": "GPTBot",`,
    `  "body_blocks": [ { "type": "h2"|"h3"|"p"|"list"|"cta"|"quote", "text"?: "...", "items"?: ["..."], "href"?: "/${targetLocale}/..." }, ... ],`,
    `  "faq": [{ "q": "...", "a": "..." }],`,
    `  "internal_links": [{ "target": "/${targetLocale}/...", "anchor": "...", "type": "contextual" }],`,
    `  "schemas": ["Article", "FAQPage", "BreadcrumbList"],`,
    `  "keywords": ["..."]`,
    '}',
    '',
    `LOCALISATION RULES:`,
    `* Translate EVERY field — meta_title, meta_description, h1, excerpt, target_keyword, body_blocks (every block: h2, h3, p, list items, cta, quote), faq questions and answers, internal_links anchors, keywords.`,
    `* Preserve the block-by-block STRUCTURE: same number of body_blocks, same types in the same order. Don't add or drop sections — that's the optimiser's job, not yours.`,
    `* slug: derive a fresh ASCII kebab-case slug from the new h1. Pure a-z 0-9 -. Max 80 chars. Do NOT keep the source-locale slug as-is.`,
    `* internal_links targets: every /${targetLocale === 'ru' ? 'uz' : 'ru'}/* path MUST be rewritten to /${targetLocale}/*. Keep the rest of the path intact unless it is plainly tied to a missing landing page.`,
    `* target_money_page: ${targetLocale === 'ru' ? 'must start with /ru/' : 'must start with /uz/'}.`,
    `* keywords: re-derive in ${langName}, lowercase, 6-14 items.`,
    localeBlock,
    '',
    `Output ONLY the JSON object. No prose before or after. No code fences.`,
  ].join('\n');
}

const RU_LOCALE_BLOCK = `RU-specific rules:
* Natural confident Russian. No corporate clichés ("в современном мире", "новая эра", "трансформация бизнеса", "революционное решение").
* Use the brand spelling "AI-бот" (with hyphen), never "AI бот" or "ИИ бот".
* Uzbekistan-specific detail must survive: Ташкент, Самарканд, Бухара, Click, Payme, Humo, AmoCRM, Bitrix24, 1C, наличные при доставке.
* Sentences should read like a practitioner, not a translator. Cut every sentence that doesn't survive the "what action does this enable?" test.`;

const UZ_LOCALE_BLOCK = `UZ-specific rules:
* Latin script ONLY. No Cyrillic characters anywhere. No Russian word order or calque.
* Use natural business Uzbek: "AI-bot", "mijozlar", "ish vaqti 24/7", "savdo bo'limi", "buyurtma", "ma'mur".
* Banned Uzbek clichés to rewrite away from: "zamonaviy dunyoda", "hozirgi kunda", "inqilobiy yechim", "biznesni transformatsiya qiluvchi", "tengsiz samaradorlik", "raqamli transformatsiya davrida".
* Preserve Uzbekistan-specific detail in proper Uzbek phrasing: Toshkent, Samarqand, Buxoro, Click, Payme, Humo, AmoCRM, Bitrix24, 1C, "yetkazib berishda naqd to'lov" / "naqd pul".
* Translate marketing nuance, not literal words. A Russian metaphor that doesn't make sense in Uzbek must be replaced with an equivalent Uzbek idiom, not transliterated.`;

function buildUserPrompt(
  source: AiDraftArticle,
  sourceLocale: 'ru' | 'uz',
  targetLocale: 'ru' | 'uz',
  suggestedMoneyPage: string,
): string {
  const langDirective = targetLocale === 'ru'
    ? 'Переведи и локализуй статью на русский. Каждое поле должно быть переписано в естественной деловой русской речи. Сохрани структуру (количество и типы body_blocks) и SEO-интент. Slug — новый, кебаб-кейс из нового h1.'
    : `O'zbek tiliga (lotin yozuvi) tarjima va lokalizatsiya qil. Har bir maydon tabiiy biznes o'zbek tilida qayta yozilishi kerak. Tuzilmani (body_blocks soni va tartibi) va SEO niyatini saqlab qol. Slug — yangi h1 dan ASCII kebab-case bilan.`;

  return [
    langDirective,
    '',
    `Source locale: ${sourceLocale}`,
    `Target locale: ${targetLocale}`,
    `Suggested target_money_page: ${suggestedMoneyPage}  (use this unless the source already had a /${targetLocale}/ path)`,
    `Source slug (do NOT reuse, derive a new ASCII slug from the new ${targetLocale.toUpperCase()} h1): ${source.slug}`,
    `Source body_blocks count: ${(source.body_blocks || []).length}`,
    `Source FAQ count: ${(source.faq || []).length}`,
    `Source internal_links count: ${(source.internal_links || []).length}`,
    '',
    `SOURCE ARTICLE (JSON to localise into ${targetLocale.toUpperCase()}):`,
    JSON.stringify(source),
    '',
    `Return EXACTLY one JSON article object (no wrapper) matching the schema. The result must read as a native ${targetLocale.toUpperCase()} article, not as a translation.`,
  ].join('\n');
}

// ── Slug fallback -------------------------------------------------------

function transliterateToSlug(input: string, locale: 'ru' | 'uz'): string {
  if (!input) return locale === 'ru' ? 'statya' : 'maqola';
  // Crude Cyrillic → Latin map (sufficient for slug fallback only).
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const flat = input
    .toLowerCase()
    .split('')
    .map((c) => map[c] ?? c)
    .join('')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return flat || (locale === 'ru' ? 'statya' : 'maqola');
}
