// Direct AI generation pipeline for SEO Autopilot.
//
// Replaces the previous n8n bridge for end-to-end content generation.
// Single entry point used by:
//   * POST /api/admin/seo-autopilot/run               (manual)
//   * POST /api/internal/seo-autopilot/scheduled-run  (cron)
//   * POST /api/admin/seo/topic-plans/:id/items/:itemId/launch  (single-topic)
//
// Pipeline (server-side, inside Cloudflare Pages Functions):
//   1. Resolve a topic descriptor (title, primary_keyword, locale, money page,
//      industry, channel, intent, etc.) from caller overrides + defaults.
//   2. Call Google Gemini 2.5 Flash via the Emergent integrations proxy
//      (OpenAI-compatible HTTPS endpoint) — once per locale (ru / uz).
//      Each call returns a strict JSON article matching the existing
//      `validateIncomingBundle` contract (slug, meta_*, body_blocks,
//      faq, internal_links, …).
//   3. Wrap both articles into a bundle (schema_version, source, bundle_id),
//      run `validateIncomingBundle`, then `insertOrReuseDraft`.
//   4. Always lands as status='pending_review' with manual_approval_required
//      forced server-side. No auto-publish, no GitHub commit, no IndexNow.
//
// Why Gemini Flash (was Llama 3.1 8b-fast via Workers AI):
//   * Llama produced thin, short articles — paragraphs of 30–50 words,
//     2–3 FAQ items, weak Uzbek Latin. Validation passed but content
//     was not publish-ready.
//   * Gemini 2.5 Flash gives a step change in instruction-following,
//     section depth, Russian fluency, and Uzbek Latin naturalness with
//     the same strict-JSON guarantee (response_format=json_object).
//
// Safety:
//   * Never throws to the caller — failures return { ok: false, … } so the
//     job row + UI both surface an actionable diagnostic.
//   * Strict JSON parsing with multi-pass salvage so partial model output
//     still produces a usable article when possible.
//   * Hard per-call timeout (70 s) so a slow upstream cannot exhaust the
//     ~95 s Cloudflare Pages Functions request budget.

import type { Env } from '../../_types';
import type { AiDraftArticle } from '../../../src/shared/ai-drafts';
import { AI_DRAFT_SCHEMA_VERSION } from '../../../src/shared/ai-drafts';
import { ingestRawBundle } from '../ai-drafts/ingest';
import type { IngestResult } from '../ai-drafts/ingest';
import { validateIncomingBundle } from '../ai-drafts/validators';
import {
  DEFAULT_GEMINI_MODEL,
} from './gemini-client';
import { routeLlmCall } from '../llm/router';
import type { LlmCallMetadata } from '../llm/types';

const DEFAULT_MONEY_PAGE_RU = '/ru/ai-bot-dlya-biznesa/';
const DEFAULT_MONEY_PAGE_UZ = '/uz/biznes-uchun-ai-bot/';
const SITE_URL = 'https://gptbot.uz';
// Gemini 2.5 Flash supports up to 8192 output tokens. We reserve a small
// margin so the model has room to close the JSON cleanly even with the
// long-form structure (≈ 18-28 body blocks).
const MAX_OUTPUT_TOKENS = 8000;
// Temperature 0.4 — coherent and not robotic, but disciplined enough
// for strict JSON. Empirically Gemini Flash starts to drop required
// fields above 0.6.
const TEMPERATURE = 0.4;
// 70s hard wall for a single locale. With two locales in parallel the
// total observed wall time is dominated by max(ru, uz) ≈ 30-50 s, well
// under the 95 s CF Pages budget.
const TIMEOUT_MS = 70_000;

export interface DirectGenerationTopic {
  /** Planned RU/UZ-language title surfaced to the user. */
  planned_title?: string;
  /** Primary search keyword the article should target. */
  primary_keyword?: string;
  /** Locale of the planned topic. */
  locale?: 'ru' | 'uz';
  /** Which locales to actually generate. Defaults to ['ru'] when locale='ru'. */
  target_locales?: Array<'ru' | 'uz'>;
  /** Money page the article must internally link to (must be /<locale>/...). */
  target_money_page?: string | null;
  /** Optional context fields used to shape the prompt. */
  cluster?: string | null;
  funnel_stage?: string | null;
  audience?: string | null;
  industry?: string | null;
  channel?: string | null;
  content_type?: string | null;
  modifier?: string | null;
  intent_key?: string | null;
  plan_id?: string | null;
  plan_item_id?: string | null;
  /** Free-form note appended verbatim to the user prompt. */
  notes?: string;
}

export interface DirectGenerationResult {
  ok: boolean;
  /** ID of the persisted draft (when ok). */
  draft_id?: string;
  bundle_id?: string;
  admin_url?: string;
  /** Stable bundle metadata mirrored into the autopilot job row. */
  generation_status?: 'completed' | 'failed';
  validation_status?: 'passed' | 'failed';
  validation_passed?: boolean;
  validation_issue_count?: number;
  model?: string;
  /** Final LLM provider that produced the bundle (or last-failed). */
  llm_provider?: string;
  /** Final LLM model the bundle was generated on. */
  llm_model?: string;
  /** True when a provider/model other than the primary was used. */
  llm_fallback_used?: boolean;
  duration_ms?: number;
  deduplicated?: boolean;
  /** Failure surface — populated when ok === false. */
  error_code?: string;
  error_message?: string;
  /** Optional structured detail used by the admin diagnostics panel. */
  error_detail?: Record<string, unknown> | null;
  /** Articles included in the ingested bundle (for UI summary). */
  locales?: Array<'ru' | 'uz'>;
}

/**
 * Generate RU and/or UZ articles directly via Google Gemini Flash and
 * persist as a pending_review draft. Never throws.
 */
export async function generateAndIngestDirectly(
  env: Env,
  topic: DirectGenerationTopic,
  options: { requestedBy: string; source: 'admin' | 'schedule' | 'external'; runId: string },
): Promise<DirectGenerationResult> {
  const startedAt = Date.now();

  if (!env.GPTBOT_DRAFTS_DB) {
    return {
      ok: false,
      generation_status: 'failed',
      error_code: 'storage_missing',
      error_message: 'Draft storage not configured (GPTBOT_DRAFTS_DB).',
    };
  }
  // Router preflight: at least ONE of Gemini / Mistral / Groq / Cerebras /
  // OpenRouter must have a key configured. Each adapter is independent;
  // missing one simply removes it from the route table.
  const hasAnyProvider =
    !!env.GEMINI_API_KEY ||
    !!env.MISTRAL_API_KEY ||
    !!env.GROQ_API_KEY ||
    !!env.CEREBRAS_API_KEY ||
    !!env.OPENROUTER_API_KEY;
  if (!hasAnyProvider) {
    return {
      ok: false,
      generation_status: 'failed',
      error_code: 'llm_provider_missing',
      error_message:
        'No LLM provider configured. Add at least ONE of MISTRAL_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY under Cloudflare Pages → ai-direct-pro-landing → Settings → Environment variables (secret_text). Mistral keys at https://console.mistral.ai/api-keys/; Gemini at https://aistudio.google.com/app/apikey; Groq at https://console.groq.com/keys; Cerebras at https://cloud.cerebras.ai/.',
    };
  }

  const locales: Array<'ru' | 'uz'> = resolveTargetLocales(topic);
  // We no longer pin the model upfront — the router picks per-locale based
  // on registry priority. Keep `model` for the legacy `job_row.model`
  // column for backward compatibility; the new llm_provider/llm_model
  // fields carry the truth.
  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

  // ── 1. Per-locale generation runs through the multi-provider router.
  //       The router's heavy queue serialises heavy calls (concurrency=1)
  //       so RU and UZ run sequentially — this is what stopped the
  //       Gemini 429 burst that 10-topic batches used to trigger. Each
  //       call retries across providers (Mistral → Gemini → Groq) before
  //       giving up. Idempotency keys are scoped to the runId so a
  //       double-clicked launch returns the cached result.
  const settled = await Promise.allSettled(
    locales.map(async (locale) => {
      let lastErr = 'no attempt';
      let lastMeta: LlmCallMetadata | undefined;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const r = await generateOneArticle(env, model, topic, locale, options.runId, attempt);
        if (r.ok) return r;
        lastErr = r.error;
        lastMeta = r.meta;
      }
      return { ok: false as const, error: lastErr, meta: lastMeta };
    }),
  );
  const articles: AiDraftArticle[] = [];
  const perLocaleErrors: Array<{ locale: 'ru' | 'uz'; error: string; provider?: string; model?: string }> = [];
  let chosenMeta: LlmCallMetadata | undefined;
  for (let i = 0; i < locales.length; i++) {
    const locale = locales[i]!;
    const res = settled[i]!;
    if (res.status === 'fulfilled') {
      const v = res.value;
      if (v.ok) {
        articles.push(v.article);
        if (!chosenMeta) chosenMeta = v.meta;
      } else {
        perLocaleErrors.push({ locale, error: v.error, provider: v.meta?.provider, model: v.meta?.model });
      }
    } else {
      perLocaleErrors.push({ locale, error: `unhandled exception: ${(res.reason as Error)?.message || 'unknown'}` });
    }
  }

  if (articles.length === 0) {
    return {
      ok: false,
      generation_status: 'failed',
      error_code: 'ai_generation_failed',
      error_message: `AI router produced no usable article for any requested locale (${locales.join(',')}).`,
      error_detail: { per_locale_errors: perLocaleErrors, model, attempted_providers: perLocaleErrors.map((e) => `${e.locale}:${e.provider}/${e.model}`).filter(Boolean) },
      duration_ms: Date.now() - startedAt,
      model,
      llm_provider: chosenMeta?.provider,
      llm_model: chosenMeta?.model,
      llm_fallback_used: chosenMeta?.fallback_used,
    };
  }

  // ── 2. Wrap into a bundle that the existing validator accepts.
  const bundle = buildBundlePayload({
    articles,
    runId: options.runId,
    source: options.source,
    requestedBy: options.requestedBy,
  });

  // Quick pre-check so we can surface validation issues with field paths
  // before the ingest endpoint repeats the same work.
  const pre = validateIncomingBundle(bundle);
  if (!pre.ok) {
    return {
      ok: false,
      generation_status: 'failed',
      validation_status: 'failed',
      validation_passed: false,
      validation_issue_count: pre.errors.length,
      error_code: 'ai_output_invalid',
      error_message: 'AI output failed strict validation. See per-field issues for the exact contract breach.',
      error_detail: {
        issues: pre.errors.slice(0, 20),
        per_locale_errors: perLocaleErrors,
        model,
      },
      duration_ms: Date.now() - startedAt,
      model,
    };
  }

  // ── 3. Persist via the shared ingest path (forces pending_review,
  //       manual_approval_required, ready_for_publish=false).
  const ingest: IngestResult = await ingestRawBundle(env, bundle);
  if (!ingest.ok) {
    return {
      ok: false,
      generation_status: 'failed',
      validation_status: 'failed',
      validation_passed: false,
      validation_issue_count: ingest.body.issues?.length ?? 0,
      error_code: 'ingest_failed',
      error_message: ingest.body.error,
      error_detail: { issues: ingest.body.issues || null, per_locale_errors: perLocaleErrors, model },
      duration_ms: Date.now() - startedAt,
      model,
    };
  }

  return {
    ok: true,
    draft_id: ingest.record.id,
    bundle_id: ingest.record.bundle_id,
    admin_url: ingest.response.admin_url,
    generation_status: 'completed',
    validation_status: 'passed',
    validation_passed: true,
    validation_issue_count: 0,
    deduplicated: ingest.response.deduplicated,
    locales: articles.map((a) => a.locale),
    duration_ms: Date.now() - startedAt,
    model: chosenMeta?.model || model,
    llm_provider: chosenMeta?.provider,
    llm_model: chosenMeta?.model,
    llm_fallback_used: chosenMeta?.fallback_used,
    error_detail: perLocaleErrors.length > 0
      ? { partial_success: true, per_locale_errors: perLocaleErrors, model }
      : null,
  };
}

// ────────────────────────────────────────────────────────────────────
// Internals

function resolveTargetLocales(topic: DirectGenerationTopic): Array<'ru' | 'uz'> {
  if (Array.isArray(topic.target_locales) && topic.target_locales.length > 0) {
    const out = topic.target_locales.filter((l): l is 'ru' | 'uz' => l === 'ru' || l === 'uz');
    if (out.length > 0) return Array.from(new Set(out));
  }
  if (topic.locale === 'uz') return ['uz'];
  if (topic.locale === 'ru') return ['ru'];
  // No explicit guidance → produce both. This matches the historical
  // n8n behaviour and the AI Draft Inbox's two-locale assumption.
  return ['ru', 'uz'];
}

function moneyPageFor(locale: 'ru' | 'uz', topic: DirectGenerationTopic): string {
  if (topic.target_money_page && topic.target_money_page.startsWith(`/${locale}/`)) {
    return topic.target_money_page;
  }
  return locale === 'ru' ? DEFAULT_MONEY_PAGE_RU : DEFAULT_MONEY_PAGE_UZ;
}

function buildBundlePayload(input: {
  articles: AiDraftArticle[];
  runId: string;
  source: 'admin' | 'schedule' | 'external';
  requestedBy: string;
}): Record<string, unknown> {
  const bundleId = `gptbot-direct-${input.runId}`;
  return {
    schema_version: AI_DRAFT_SCHEMA_VERSION,
    source: `gptbot-direct:${input.source}`,
    bundle_id: bundleId,
    execution_id: input.runId,
    // The validator FORCES status to 'pending_review' regardless; we still
    // declare it explicitly so anything inspecting the raw payload sees the
    // intent.
    status: 'pending_review',
    manual_approval_required: true,
    ready_for_publish: false,
    published: false,
    seo_brief: {
      requested_by: input.requestedBy,
      source: input.source,
      generated_by: 'multi-provider-llm-router',
      generated_at: new Date().toISOString(),
    },
    validation: {
      passed: true,
      issues: [],
    },
    articles: input.articles,
  };
}

// ── 4. AI call -------------------------------------------------------

interface OneArticleSuccess { ok: true; article: AiDraftArticle; meta: LlmCallMetadata }
interface OneArticleFailure { ok: false; error: string; meta?: LlmCallMetadata }
type OneArticleResult = OneArticleSuccess | OneArticleFailure;

async function generateOneArticle(
  env: Env,
  model: string,
  topic: DirectGenerationTopic,
  locale: 'ru' | 'uz',
  runId: string,
  attempt: number,
): Promise<OneArticleResult> {
  const moneyPage = moneyPageFor(locale, topic);
  const planned = sanitisePlannedTitle(topic.planned_title, topic.primary_keyword, locale);
  const keyword = sanitisePrimaryKeyword(topic.primary_keyword, planned, locale);
  const system = buildSystemPrompt(locale);
  const user = buildUserPrompt(locale, {
    planned_title: planned,
    primary_keyword: keyword,
    target_money_page: moneyPage,
    cluster: topic.cluster ?? null,
    funnel_stage: topic.funnel_stage ?? null,
    audience: topic.audience ?? null,
    industry: topic.industry ?? null,
    channel: topic.channel ?? null,
    content_type: topic.content_type ?? null,
    modifier: topic.modifier ?? null,
    notes: topic.notes ?? null,
  });

  // Route through the multi-provider LLM router. Feature is picked based
  // on locale so the registry can prefer Gemini for UZ (best Latin Uzbek)
  // and Mistral for RU (high RU quality + strict JSON). Attempt count
  // produces a distinct idempotency key per parse-retry so the second
  // attempt actually calls upstream instead of returning the cached
  // failure from the first.
  const result = await routeLlmCall(env, {
    feature: locale === 'ru' ? 'ru_article' : 'uz_article',
    locale,
    system,
    user,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: TEMPERATURE,
    timeoutMs: TIMEOUT_MS,
    jsonObject: true,
    idempotencyKey: `direct-${runId}:${locale}:a${attempt}`,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: `LLM router failed (provider=${result.meta.provider} model=${result.meta.model}): ${result.error}${result.status ? ` (HTTP ${result.status})` : ''}${result.rawExcerpt ? ` | excerpt=${result.rawExcerpt.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`,
      meta: result.meta,
    };
  }
  void model; // legacy hint; the router selects the actual wire model

  const parsed = parseStrictJson(result.content);
  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      error: `LLM output was not parsable JSON | provider=${result.meta.provider}/${result.meta.model} | finish=${result.finishReason || 'unknown'} | excerpt=${result.content.slice(0, 300).replace(/\s+/g, ' ')}`,
      meta: result.meta,
    };
  }
  const article = coerceArticle(parsed as Record<string, unknown>, locale, {
    planned_title: planned,
    primary_keyword: keyword,
    target_money_page: moneyPage,
  });
  if (!article) {
    return {
      ok: false,
      error: `LLM output missing required fields after coercion | provider=${result.meta.provider}/${result.meta.model} | keys=${Object.keys(parsed as object).slice(0, 20).join(',')} | excerpt=${result.content.slice(0, 300).replace(/\s+/g, ' ')}`,
      meta: result.meta,
    };
  }
  return { ok: true, article, meta: result.meta };
}

// ── 5. Prompts -------------------------------------------------------
//
// The prompt is the single biggest lever on output quality. The
// previous Llama 8b-fast configuration produced "valid but shallow"
// articles (4-6 short paragraphs, 2-3 FAQ items, weak Uzbek). Gemini
// 2.5 Flash follows long, structured prompts much better — so this
// version is intentionally verbose and demands a deep structure:
//
//   * 18-28 body_blocks, with 6+ distinct h2 sections.
//   * Each h2 must be supported by 2-4 child blocks (p, list, h3, quote).
//   * One h2 must cover Uzbekistan-specific scenarios (Tashkent retail,
//     Samarkand services, etc.). Concrete operator detail, not generic.
//   * One h2 must cover Telegram + Instagram Direct integration.
//   * One h2 must cover lead handling + handoff to a human manager.
//   * One h2 must cover real limitations (where the AI bot will fail).
//   * One h2 must cover common implementation mistakes.
//   * FAQ: 6-10 items, real operator questions, 2-4-sentence answers.
//   * internal_links: 4-7 distinct, anchors in natural language.
//
// The "FORBIDDEN PHRASES" list is the owner's explicit anti-AI-cliché
// requirement. Do not soften it — these phrases trigger immediate
// rejection by a human reviewer.

function buildSystemPrompt(locale: 'ru' | 'uz'): string {
  const langName = locale === 'ru'
    ? 'Russian (русский)'
    : 'Uzbek Latin (o\'zbek tilida, lotin yozuvi)';
  const forbiddenSection = locale === 'ru' ? RU_FORBIDDEN_PHRASES : UZ_FORBIDDEN_PHRASES;
  return [
    `You are a senior SEO content writer and practitioner consultant for GPTBot.uz, an AI-bot SaaS for small and medium businesses in Uzbekistan.`,
    `Write a complete, expert-level blog article in ${langName}. The output MUST be a single strict JSON object — no Markdown, no commentary, no code fences, no leading or trailing text.`,
    `The article must read as a human-written piece by an experienced automation specialist who works with Uzbekistan SMBs every day. Concrete, useful, operator-level — never a thin SEO doorway page.`,
    ``,
    `STRICT JSON SHAPE (every key required, no extra keys allowed):`,
    `{`,
    `  "locale": "${locale}",`,
    `  "slug": "kebab-case-slug-max-80-chars",        // a-z 0-9 -, must match /^[a-z0-9-]{1,80}$/`,
    `  "meta_title": "string up to 220 chars",`,
    `  "meta_description": "string up to 320 chars",`,
    `  "h1": "string up to 220 chars",                 // ONE h1, distinct from meta_title`,
    `  "excerpt": "string up to 800 chars (one paragraph, plain text)",`,
    `  "target_keyword": "primary search keyword",`,
    `  "target_money_page": "/${locale}/...",         // absolute path on gptbot.uz, must start with /${locale}/`,
    `  "author": "GPTBot",`,
    `  "body_blocks": [`,
    `    { "type": "h2", "text": "Section heading" },`,
    `    { "type": "p",  "text": "Paragraph 100-180 words of substantive insight" },`,
    `    { "type": "h3", "text": "Sub-heading" },`,
    `    { "type": "p",  "text": "Supporting paragraph" },`,
    `    { "type": "list", "items": ["concrete operational item 1", "item 2", "item 3"] },`,
    `    { "type": "quote", "text": "short pull quote from a practitioner perspective" },`,
    `    { "type": "cta", "text": "Optional CTA sentence", "href": "/${locale}/..." }`,
    `  ],`,
    `  "faq": [{ "q": "Real operator question?", "a": "Helpful 2-4 sentence answer." }],`,
    `  "internal_links": [`,
    `    { "target": "/${locale}/...", "anchor": "Anchor text in natural language", "type": "contextual" }`,
    `  ],`,
    `  "schemas": ["Article", "FAQPage", "BreadcrumbList"],`,
    `  "keywords": ["primary keyword", "secondary keyword", "..."]`,
    `}`,
    ``,
    `DEPTH REQUIREMENTS (this is the difference between a publish-ready article and another thin draft):`,
    `* body_blocks: 18-28 blocks total. At least 6 distinct h2 sections. Each h2 must be supported by 2-4 child blocks (paragraphs, lists, occasional h3 or quote).`,
    `* Each paragraph: 100-180 words of real insight — no filler, no throat-clearing, no transitions like "перейдём к следующему разделу". Cut every sentence that does not introduce a new fact or recommendation.`,
    `* Lists: items must be concrete, operational, and specific. "Подключить мессенджер" is too generic; "Подключить Telegram Business API через @BotFather и привязать к CRM по webhook" is the right level.`,
    `* At least one h2 must cover REAL Uzbekistan business scenarios — Tashkent retail, Samarkand услуги, Bukhara b2b, regional logistics, local payment habits (наличные при доставке, Click, Payme, Humo). Name actual cities, channels, and behaviours; do NOT invent client names, statistics, or guarantees.`,
    `* At least one h2 must cover Telegram + Instagram Direct integration — these are the dominant messaging channels in Uzbekistan. Cover both, including how each channel is configured and how leads are unified.`,
    `* At least one h2 must cover lead handling: triage logic, escalation criteria, how the AI bot hands a conversation to a human manager, what context it passes along.`,
    `* At least one h2 must cover REAL limitations — where the AI bot will fail (complex disputes, payment reconciliation, kasaba edge cases, multi-step manual quoting, etc.). Be honest; this builds trust with the operator.`,
    `* At least one h2 must cover the most common implementation mistakes operators make in the first month, with the exact correction for each.`,
    `* Final h2 must be a practical implementation CTA pointing readers to target_money_page. The cta block + an internal_links entry both link there.`,
    `* faq: 6-10 items. Real questions an operator actually asks (cost, timeline, integration with CRM, who maintains the bot, what happens if internet drops, etc.). Answers 2-4 sentences each, concrete.`,
    `* internal_links: 4-7 distinct items. Every target MUST start with /${locale}/. Anchors must be natural ${locale === 'ru' ? 'Russian' : 'Uzbek Latin'} phrases — never "click here" or "подробнее". Distinct anchor texts for distinct targets.`,
    `* keywords: 8-14 items, lowercase, comma-free.`,
    `* No empty blocks. No placeholder text. No Lorem ipsum. No "ваш текст здесь".`,
    `* No mojibake, no Unicode replacement chars, no curly placeholders like {{ … }}.`,
    `* Stay strictly within ${langName}. Do not switch languages mid-sentence.`,
    `* Do not invent statistics, client names, market shares, or guarantees. Speak in concrete operational terms.`,
    ``,
    `FORBIDDEN PHRASES (zero tolerance — these instantly mark the text as AI-generated):`,
    forbiddenSection,
    ``,
    `OUTPUT FORMAT:`,
    `* Output ONLY the JSON object. Do not wrap in code fences. Do not prepend "Here is the article" or any other commentary. Do not append anything after the closing brace.`,
    `* The JSON must be valid and parseable by JSON.parse.`,
  ].join('\n');
}

const RU_FORBIDDEN_PHRASES = [
  `* "в современном мире", "в наше время", "в сегодняшнем быстро меняющемся мире"`,
  `* "новая эра автоматизации", "революционное решение", "трансформация бизнеса"`,
  `* "эффективность без компромиссов", "не имеет аналогов", "уникальное решение на рынке"`,
  `* "поднимет ваш бизнес на новый уровень", "позволит вашему бизнесу процветать"`,
  `* "в условиях стремительно растущей конкуренции", "в эпоху цифровой трансформации"`,
  `* Any sentence that starts with "Сегодня", "В современных условиях", "В наши дни"`,
  `* Any vague filler like "очень важно", "необходимо отметить", "следует подчеркнуть"`,
].join('\n');

const UZ_FORBIDDEN_PHRASES = [
  `* "zamonaviy dunyoda", "hozirgi kunda", "bugungi kunda" sifatida ochiluvchi har qanday gap`,
  `* "inqilobiy yechim", "biznesni transformatsiya qiluvchi", "tengsiz samaradorlik"`,
  `* "biznesingizni yangi bosqichga olib chiqadi", "raqamli transformatsiya davrida"`,
  `* "raqobat keskinlashayotgan sharoitda", "AI inqilobi davri"`,
  `* Russian word order or direct calque from Russian — write idiomatic Uzbek Latin.`,
  `* Cyrillic characters anywhere in the output — only Latin letters and standard punctuation.`,
  `* Vague filler: "juda muhim", "ta'kidlash kerak", "shuni unutmaslik kerak"`,
].join('\n');

function buildUserPrompt(
  locale: 'ru' | 'uz',
  ctx: {
    planned_title: string;
    primary_keyword: string;
    target_money_page: string;
    cluster: string | null;
    funnel_stage: string | null;
    audience: string | null;
    industry: string | null;
    channel: string | null;
    content_type: string | null;
    modifier: string | null;
    notes: string | null;
  },
): string {
  const langDirective = locale === 'ru'
    ? 'Пиши на русском языке как опытный специалист по автоматизации SMB в Узбекистане. Тон: уверенный, практичный, без хайпа. Обращайся к оператору, который ведёт бизнес каждый день.'
    : 'O\'zbek tilida, lotin yozuvida yoz. Tajribali O\'zbekiston SMB avtomatlashtirish mutaxassisi sifatida yoz. Ohang: ishonchli, amaliy, hech qanday balandparvozliksiz. Har kuni biznesni boshqaradigan operatorga murojaat qil.';
  const lines: string[] = [
    langDirective,
    ``,
    `TOPIC BRIEF`,
    `* planned_title: ${ctx.planned_title}`,
    `* primary_keyword: ${ctx.primary_keyword}`,
    `* target_money_page: ${ctx.target_money_page}   (must appear in internal_links AND in a cta block)`,
    ctx.cluster        ? `* cluster: ${ctx.cluster}` : '',
    ctx.industry       ? `* industry: ${ctx.industry}` : '',
    ctx.audience       ? `* audience: ${ctx.audience}` : '',
    ctx.channel        ? `* messaging channel: ${ctx.channel}` : '',
    ctx.funnel_stage   ? `* funnel stage: ${ctx.funnel_stage}` : '',
    ctx.content_type   ? `* format: ${ctx.content_type}` : '',
    ctx.modifier       ? `* angle: ${ctx.modifier}` : '',
    ctx.notes          ? `* notes: ${ctx.notes}` : '',
    ``,
    `WRITING DIRECTIVES`,
    `* Open with a concrete problem the reader recognises from the first sentence — not a definition, not a market overview.`,
    `* Anchor every claim in a step the reader can take within a week. If you cannot translate a paragraph into an action item, delete it.`,
    `* Use ${locale === 'ru' ? 'Узбекистан' : "O'zbekiston"}-specific detail: real cities, real channels (Telegram, Instagram Direct, Click, Payme, Humo), real operator habits (наличные при доставке, ручной учёт в Excel, и т.д.). Do NOT invent client names or statistics.`,
    `* Show a concrete end-to-end scenario in one of the sections: from the customer's first message through bot triage to manager handoff, including the exact information the bot collects and passes along.`,
    `* Be honest about limitations: there should be a full h2 about what the bot cannot do. This is non-negotiable.`,
    `* The slug is derived from the planned_title (transliterated to ASCII, kebab-case, no diacritics). Use that slug.`,
    `* The final h2 is the implementation CTA — a short, specific section about taking the next step, with a cta block (href=${ctx.target_money_page}) and a matching internal_links entry.`,
    `* Return EXACTLY one JSON object. No prose before, no prose after, no Markdown fences, no leading whitespace.`,
  ];
  return lines.filter(Boolean).join('\n');
}

// ── 6. JSON salvage + coercion --------------------------------------

function parseStrictJson(text: string): unknown {
  if (typeof text !== 'string') return null;
  let s = text.trim()
    // Strip Markdown code fences.
    .replace(/^```(?:json|JSON)?\s*/, '')
    .replace(/```\s*$/, '')
    .trim();
  // Strip any prefatory commentary the model sometimes prepends
  // ("Here is the JSON:", "Below is your article:", etc.).
  // Cheaper than NLP: find the first '{' or '[' and lop everything before.
  const firstBrace = s.indexOf('{');
  const firstBracket = s.indexOf('[');
  let start = -1;
  if (firstBrace >= 0 && firstBracket >= 0) start = Math.min(firstBrace, firstBracket);
  else if (firstBrace >= 0) start = firstBrace;
  else if (firstBracket >= 0) start = firstBracket;
  if (start > 0) s = s.slice(start);

  try { return JSON.parse(s); } catch { /* fall through to brace-matching */ }

  // Brace-counting: find the longest balanced { ... } block at the start.
  if (s.startsWith('{')) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let endIdx = -1;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      if (escape) { escape = false; continue; }
      if (ch === 92 /* \\ */) { escape = true; continue; }
      if (ch === 34 /* " */) { inString = !inString; continue; }
      if (inString) continue;
      if (ch === 123 /* { */) depth++;
      else if (ch === 125 /* } */) {
        depth--;
        if (depth === 0) { endIdx = i + 1; break; }
      }
    }
    if (endIdx > 0) {
      try { return JSON.parse(s.slice(0, endIdx)); } catch { /* ignore */ }
    }
  }
  // Last-ditch: lastIndex of } pairing.
  const end = s.lastIndexOf('}');
  if (start < 0 && end > 0) {
    try { return JSON.parse(s.slice(0, end + 1)); } catch { /* ignore */ }
  }
  return null;
}

function asStr(v: unknown, max = 8000): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
}

function transliterateToSlug(input: string): string {
  if (!input) return 'gptbot-article';
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
    'қ': 'q', 'ў': 'o', 'ғ': 'g', 'ҳ': 'h', "'": '',
  };
  const lower = input.toLowerCase();
  let out = '';
  for (const ch of lower) {
    if (map[ch] !== undefined) out += map[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/\s|-|_|\//.test(ch)) out += '-';
    else out += '';
  }
  out = out.replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!out) out = 'gptbot-article';
  return out.slice(0, 80);
}

function sanitisePlannedTitle(t: string | undefined, kw: string | undefined, locale: 'ru' | 'uz'): string {
  const s = asStr(t || kw || '', 220);
  if (s) return s;
  return locale === 'ru'
    ? 'AI-бот для бизнеса: пошаговое руководство'
    : 'Biznes uchun AI-bot: bosqichma-bosqich qo\'llanma';
}

function sanitisePrimaryKeyword(kw: string | undefined, planned: string, locale: 'ru' | 'uz'): string {
  const s = asStr(kw || '', 200);
  if (s) return s;
  if (planned) return planned;
  return locale === 'ru' ? 'AI-бот для бизнеса' : 'biznes uchun AI-bot';
}

function coerceArticle(
  raw: Record<string, unknown>,
  locale: 'ru' | 'uz',
  fallback: { planned_title: string; primary_keyword: string; target_money_page: string },
): AiDraftArticle | null {
  const slugInput = asStr(raw.slug, 80);
  const slug = /^[a-z0-9-]{1,80}$/.test(slugInput) && slugInput.length > 0
    ? slugInput
    : transliterateToSlug(asStr(raw.h1, 200) || asStr(raw.meta_title, 200) || fallback.planned_title);

  const meta_title = asStr(raw.meta_title ?? raw.title, 220) || fallback.planned_title.slice(0, 220);
  const meta_description = asStr(raw.meta_description ?? raw.description, 320) ||
    (locale === 'ru'
      ? `Подробное практическое руководство: ${fallback.planned_title.slice(0, 220)}`
      : `Amaliy qo'llanma: ${fallback.planned_title.slice(0, 220)}`);
  const h1 = asStr(raw.h1, 220) || meta_title.slice(0, 220);
  const excerpt = asStr(raw.excerpt ?? raw.intro, 800) ||
    (locale === 'ru'
      ? 'Разбираем по шагам, как развернуть AI-бота для бизнеса в Узбекистане — от подключения мессенджера до отчётности.'
      : 'O\'zbekistondagi biznes uchun AI-botni qadam-baqadam ishga tushirish — kanalni ulashdan hisobotgacha.');

  const target_keyword = asStr(raw.target_keyword, 240) || fallback.primary_keyword;

  // target_money_page must be /<locale>/... — if the model emitted absolute
  // gptbot.uz/<locale>/... or wandered locale, snap it back.
  let target_money_page = asStr(raw.target_money_page, 500);
  if (target_money_page.startsWith('https://gptbot.uz')) {
    target_money_page = target_money_page.replace(/^https:\/\/gptbot\.uz/, '');
  }
  if (!target_money_page.startsWith(`/${locale}/`)) {
    target_money_page = fallback.target_money_page;
  }
  if (target_money_page.includes('?') || target_money_page.includes('#')) {
    target_money_page = fallback.target_money_page;
  }

  const body_blocks = coerceBodyBlocks(raw.body_blocks ?? raw.body);
  if (body_blocks.length === 0) return null;

  const faq = coerceFaq(raw.faq);
  const internal_links = coerceInternalLinks(raw.internal_links ?? raw.internalLinks, locale, target_money_page);
  const schemas = coerceSchemas(raw.schemas);
  const keywords = coerceKeywords(raw.keywords, target_keyword);

  return {
    locale,
    slug,
    meta_title,
    meta_description,
    h1,
    excerpt,
    target_keyword,
    target_money_page,
    author: asStr(raw.author, 80) || 'GPTBot',
    body_blocks,
    faq,
    internal_links,
    schemas,
    keywords,
    og_title: asStr(raw.og_title, 220) || undefined,
    og_description: asStr(raw.og_description, 320) || undefined,
    og_image: asStr(raw.og_image, 1000) || undefined,
  };
}

const ALLOWED_BLOCK_TYPES: Array<'h2' | 'h3' | 'p' | 'list' | 'cta' | 'image' | 'quote'> =
  ['h2', 'h3', 'p', 'list', 'cta', 'image', 'quote'];

function coerceBodyBlocks(raw: unknown): AiDraftArticle['body_blocks'] {
  if (!Array.isArray(raw)) return [];
  const out: AiDraftArticle['body_blocks'] = [];
  for (const b of raw.slice(0, 80)) {
    if (!b || typeof b !== 'object') continue;
    const obj = b as Record<string, unknown>;
    const type = asStr(obj.type, 32);
    if (!ALLOWED_BLOCK_TYPES.includes(type as typeof ALLOWED_BLOCK_TYPES[number])) continue;
    const block: AiDraftArticle['body_blocks'][number] = {
      type: type as typeof ALLOWED_BLOCK_TYPES[number],
    };
    const text = asStr(obj.text, 8000);
    if (text) block.text = text;
    if (Array.isArray(obj.items)) {
      const items = obj.items.map((it) => asStr(it, 800)).filter(Boolean).slice(0, 30);
      if (items.length > 0) block.items = items;
    }
    const href = asStr(obj.href, 500);
    if (href && (href.startsWith('/') || /^https?:\/\//.test(href))) block.href = href;
    const src = asStr(obj.src, 1000);
    if (src && (src.startsWith('/') || /^https?:\/\//.test(src))) block.src = src;
    const alt = asStr(obj.alt, 240);
    if (alt) block.alt = alt;
    if (!block.text && !block.items && !block.src && !block.href) continue;
    out.push(block);
  }
  return out;
}

function coerceFaq(raw: unknown): AiDraftArticle['faq'] {
  if (!Array.isArray(raw)) return [];
  const out: AiDraftArticle['faq'] = [];
  for (const f of raw.slice(0, 30)) {
    if (!f || typeof f !== 'object') continue;
    const obj = f as Record<string, unknown>;
    const q = asStr(obj.q ?? obj.question, 500);
    const a = asStr(obj.a ?? obj.answer, 8000);
    if (!q || !a) continue;
    out.push({ q, a });
  }
  return out;
}

function coerceInternalLinks(
  raw: unknown,
  locale: 'ru' | 'uz',
  fallbackTarget: string,
): AiDraftArticle['internal_links'] {
  const out: AiDraftArticle['internal_links'] = [];
  if (Array.isArray(raw)) {
    for (const item of raw.slice(0, 30)) {
      if (typeof item === 'string') {
        const target = stripDomain(item);
        if (isValidInternalTarget(target)) {
          out.push({ target, anchor: target, locale, type: 'contextual' });
        }
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const target = stripDomain(asStr(obj.target ?? obj.href ?? obj.url, 500));
      const anchor = asStr(obj.anchor ?? obj.label ?? obj.text, 240);
      if (!isValidInternalTarget(target)) continue;
      if (!anchor) continue;
      const typeRaw = asStr(obj.type, 32);
      const type = (['contextual', 'block', 'footer', 'popular', 'breadcrumb'] as const).includes(typeRaw as never)
        ? (typeRaw as AiDraftArticle['internal_links'][number]['type'])
        : 'contextual';
      out.push({ target, anchor, locale, type });
    }
  }
  // Guarantee at least one money-page link so the validator + Intent Guard
  // recognise the article as supporting the planned money page.
  const hasMoneyPageLink = out.some((l) => l.target === fallbackTarget);
  if (!hasMoneyPageLink) {
    out.unshift({
      target: fallbackTarget,
      anchor: locale === 'ru' ? 'Подключить AI-бота GPTBot' : 'GPTBot AI-botni ulash',
      locale,
      type: 'block',
    });
  }
  return out.slice(0, 30);
}

function stripDomain(s: string): string {
  if (!s) return '';
  if (s.startsWith(`${SITE_URL}/`)) return s.slice(SITE_URL.length);
  if (s.startsWith('https://gptbot.uz/')) return s.slice('https://gptbot.uz'.length);
  return s;
}

function isValidInternalTarget(t: string): boolean {
  if (!t || !t.startsWith('/')) return false;
  if (t.includes('?') || t.includes('#')) return false;
  if (t.startsWith('/admin-tools') || t.startsWith('/api/') || t.startsWith('/draft/') || t.startsWith('/test/')) return false;
  return true;
}

function coerceSchemas(raw: unknown): AiDraftArticle['schemas'] {
  const allowed: NonNullable<AiDraftArticle['schemas']> =
    ['Organization', 'WebSite', 'BreadcrumbList', 'Service', 'FAQPage', 'Article'];
  const out: NonNullable<AiDraftArticle['schemas']> = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const s = asStr(item, 80);
      if (allowed.includes(s as typeof allowed[number]) && !out.includes(s as typeof allowed[number])) {
        out.push(s as typeof allowed[number]);
      }
    }
  }
  if (out.length === 0) return ['Article', 'FAQPage', 'BreadcrumbList'];
  return out;
}

function coerceKeywords(raw: unknown, primary: string): string[] {
  const out: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw.slice(0, 30)) {
      const s = asStr(item, 120);
      if (s) out.push(s);
    }
  }
  if (out.length === 0 && primary) out.push(primary);
  return out;
}
