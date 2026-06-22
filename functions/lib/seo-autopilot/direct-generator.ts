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
//   2. Call Cloudflare Workers AI (`env.AI.run(model, …)`) twice — once per
//      locale (ru / uz). Each call returns a strict JSON article matching
//      the existing `validateIncomingBundle` contract (slug, meta_*,
//      body_blocks, faq, internal_links, …).
//   3. Wrap both articles into a bundle (schema_version, source, bundle_id),
//      run `validateIncomingBundle`, then `insertOrReuseDraft`.
//   4. Always lands as status='pending_review' with manual_approval_required
//      forced server-side. No auto-publish, no GitHub commit, no IndexNow.
//
// Safety:
//   * Never throws to the caller — failures return { ok: false, … } so the
//     job row + UI both surface an actionable diagnostic.
//   * Strict JSON parsing with multi-pass salvage so partial model output
//     still produces a usable article when possible.
//   * Cloudflare Workers AI is a same-account binding — no API key is
//     surfaced through env vars, the binding itself is the auth.

import type { Env } from '../../_types';
import type { AiDraftArticle } from '../../../src/shared/ai-drafts';
import { AI_DRAFT_SCHEMA_VERSION } from '../../../src/shared/ai-drafts';
import { ingestRawBundle } from '../ai-drafts/ingest';
import type { IngestResult } from '../ai-drafts/ingest';
import { validateIncomingBundle } from '../ai-drafts/validators';

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const QUALITY_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const FALLBACK_MODEL = '@cf/meta/llama-3.1-70b-instruct';
const DEFAULT_MONEY_PAGE_RU = '/ru/ai-bot-dlya-biznesa/';
const DEFAULT_MONEY_PAGE_UZ = '/uz/biznes-uchun-ai-bot/';
const SITE_URL = 'https://gptbot.uz';
const MAX_OUTPUT_TOKENS = 4500;
const TEMPERATURE = 0.25;

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
 * Generate RU and/or UZ articles directly via Cloudflare Workers AI and
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
  if (!env.AI) {
    return {
      ok: false,
      generation_status: 'failed',
      error_code: 'ai_binding_missing',
      error_message:
        'Cloudflare Workers AI binding "AI" is not configured. Open Cloudflare Pages → ai-direct-pro-landing → Settings → Functions → AI bindings and add a binding named "AI".',
    };
  }

  const locales: Array<'ru' | 'uz'> = resolveTargetLocales(topic);
  const model = env.CF_AI_MODEL || DEFAULT_MODEL;

  // ── 1. Per-locale generation runs in PARALLEL with up to 2 attempts
  //       per locale (retry on parse failure). CF Pages Functions has
  //       a ~95 s edge budget; with the 8b-fast model two locales × two
  //       attempts × ~12-30 s ≈ 24-60 s wall time, fits the budget.
  const settled = await Promise.allSettled(
    locales.map(async (locale) => {
      let lastErr = 'no attempt';
      for (let attempt = 1; attempt <= 2; attempt++) {
        const r = await generateOneArticle(env, model, topic, locale);
        if (r.ok) return r;
        lastErr = r.error;
      }
      return { ok: false as const, error: lastErr };
    }),
  );
  const articles: AiDraftArticle[] = [];
  const perLocaleErrors: Array<{ locale: 'ru' | 'uz'; error: string }> = [];
  for (let i = 0; i < locales.length; i++) {
    const locale = locales[i]!;
    const res = settled[i]!;
    if (res.status === 'fulfilled' && res.value.ok) {
      articles.push(res.value.article);
    } else if (res.status === 'fulfilled') {
      perLocaleErrors.push({ locale, error: res.value.error });
    } else {
      perLocaleErrors.push({ locale, error: `unhandled exception: ${(res.reason as Error)?.message || 'unknown'}` });
    }
  }

  if (articles.length === 0) {
    return {
      ok: false,
      generation_status: 'failed',
      error_code: 'ai_generation_failed',
      error_message: `Workers AI produced no usable article for any requested locale (${locales.join(',')}).`,
      error_detail: { per_locale_errors: perLocaleErrors, model },
      duration_ms: Date.now() - startedAt,
      model,
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
    model,
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
      generated_by: 'cloudflare-workers-ai',
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

interface OneArticleSuccess { ok: true; article: AiDraftArticle }
interface OneArticleFailure { ok: false; error: string }
type OneArticleResult = OneArticleSuccess | OneArticleFailure;

async function generateOneArticle(
  env: Env,
  model: string,
  topic: DirectGenerationTopic,
  locale: 'ru' | 'uz',
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

  // Workers AI binding signature: env.AI.run(model, { messages, max_tokens, temperature, … })
  // We try response_format=json_schema first (newer models honour it); on
  // ANY failure we fall back to messages-only on the fallback model.
  type ChatResponse = {
    response?: string;
    result?: { response?: string; choices?: Array<{ message?: { content?: string } }> };
    choices?: Array<{ message?: { content?: string } }>;
  };
  const ai = env.AI;
  if (!ai) return { ok: false, error: 'AI binding missing at runtime' };

  let raw: ChatResponse | null = null;
  let lastErr: string | null = null;
  let rawTextExcerpt = '';
  const aiRunner = ai as unknown as {
    run: (
      model: string,
      input: {
        messages: Array<{ role: string; content: string }>;
        max_tokens: number;
        temperature: number;
        response_format?: { type: 'json_object' | 'json_schema'; json_schema?: unknown };
      },
    ) => Promise<ChatResponse>;
  };

  // ONE attempt per locale total — CF Pages Functions edge has a hard ~95s
  // request budget. Two locales × 1 attempt × ~25s ≈ 50s, well within
  // the budget. The fallback model is reached only if the primary throws
  // outright (network/model unavailable), not on parse failure.
  for (const candidateModel of [model, FALLBACK_MODEL]) {
    try {
      const input: Parameters<typeof aiRunner.run>[1] = {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: TEMPERATURE,
        response_format: { type: 'json_object' },
      };
      const r = await aiRunner.run(candidateModel, input);
      // With response_format=json_object, some Workers AI models return
      // the response field as an already-parsed object. Detect that and
      // keep `raw` populated; the parse step downstream skips JSON.parse
      // in that case.
      const rawAny: unknown =
        r.response ??
        r.result?.response ??
        r.result?.choices?.[0]?.message?.content ??
        r.choices?.[0]?.message?.content;
      if (rawAny != null) {
        if (typeof rawAny === 'string') {
          rawTextExcerpt = rawAny.slice(0, 600);
        } else if (typeof rawAny === 'object') {
          rawTextExcerpt = JSON.stringify(rawAny).slice(0, 600);
        }
        raw = r;
        // Attach the parsed object hint so we don't re-stringify -> re-parse.
        (raw as ChatResponse & { _parsed?: unknown })._parsed = rawAny;
        break;
      }
      lastErr = `model=${candidateModel} returned empty content`;
    } catch (e) {
      lastErr = `model=${candidateModel} threw: ${(e as Error).message || 'unknown'}`;
    }
  }
  if (!raw) return { ok: false, error: `Workers AI call failed: ${lastErr || 'unknown error'}` };

  // Use already-parsed object if available, else parse the text response.
  const parsedHint = (raw as ChatResponse & { _parsed?: unknown })._parsed;
  let parsed: unknown;
  if (parsedHint && typeof parsedHint === 'object') {
    parsed = parsedHint;
  } else {
    const text =
      (typeof raw.response === 'string' ? raw.response : '') ||
      (typeof raw.result?.response === 'string' ? raw.result.response : '') ||
      (typeof raw.result?.choices?.[0]?.message?.content === 'string' ? raw.result.choices[0]!.message!.content! : '') ||
      (typeof raw.choices?.[0]?.message?.content === 'string' ? raw.choices[0]!.message!.content! : '');
    if (!text) return { ok: false, error: 'Workers AI returned empty content' };
    parsed = parseStrictJson(text);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: `Workers AI output was not parsable JSON | excerpt=${text.slice(0, 400).replace(/\s+/g, ' ')}` };
    }
  }
  const article = coerceArticle(parsed as Record<string, unknown>, locale, {
    planned_title: planned,
    primary_keyword: keyword,
    target_money_page: moneyPage,
  });
  if (!article) {
    return { ok: false, error: `Workers AI output was missing required fields after coercion | keys=${Object.keys(parsed as object).slice(0, 20).join(',')} | excerpt=${rawTextExcerpt.slice(0, 300).replace(/\s+/g, ' ')}` };
  }
  return { ok: true, article };
}

// ── 5. Prompts -------------------------------------------------------

function buildSystemPrompt(locale: 'ru' | 'uz'): string {
  const langName = locale === 'ru' ? 'Russian (русский)' : 'Uzbek Latin (o\'zbek tilida, lotin yozuvi)';
  return [
    `You are a senior SEO content writer for GPTBot.uz, an AI-bot SaaS for small businesses in Uzbekistan.`,
    `Write a complete blog article in ${langName}. The output MUST be a single strict JSON object (no Markdown, no commentary, no code fences).`,
    `The article must read as a human-written, helpful, fact-checked piece — not a thin SEO doorway page.`,
    ``,
    `STRICT JSON SHAPE (every key required, no extra keys allowed):`,
    `{`,
    `  "locale": "${locale}",`,
    `  "slug": "kebab-case-slug-max-80-chars",   // a-z 0-9 -, must match /^[a-z0-9-]{1,80}$/`,
    `  "meta_title": "string up to 220 chars",`,
    `  "meta_description": "string up to 320 chars",`,
    `  "h1": "string up to 220 chars",`,
    `  "excerpt": "string up to 800 chars (one paragraph, plain text)",`,
    `  "target_keyword": "primary keyword string",`,
    `  "target_money_page": "/${locale}/...",     // absolute path on gptbot.uz, must start with /${locale}/`,
    `  "author": "GPTBot",`,
    `  "body_blocks": [`,
    `    { "type": "h2", "text": "Section heading" },`,
    `    { "type": "p",  "text": "Paragraph ~ 80-160 words" },`,
    `    { "type": "list", "items": ["item one", "item two", "item three"] },`,
    `    { "type": "h3", "text": "Sub-heading" },`,
    `    { "type": "quote", "text": "short pull quote" },`,
    `    { "type": "cta", "text": "Optional call-to-action sentence", "href": "/${locale}/..." }`,
    `  ],`,
    `  "faq": [{ "q": "Question?", "a": "Helpful 1-2 sentence answer." }],`,
    `  "internal_links": [`,
    `    { "target": "/${locale}/blog/...", "anchor": "Anchor text", "type": "contextual" }`,
    `  ],`,
    `  "schemas": ["Article", "FAQPage", "BreadcrumbList"],`,
    `  "keywords": ["primary keyword", "secondary keyword", "..."]`,
    `}`,
    ``,
    `HARD CONSTRAINTS:`,
    `* body_blocks: 12–24 blocks. At least 4 h2 sections, at least one list, no empty blocks.`,
    `* faq: 5–8 items. Questions natural-language, answers 1–2 sentences each.`,
    `* internal_links: 3–6 distinct items. Every target MUST start with /${locale}/ (no http(s)://, no '?' or '#').`,
    `* keywords: 6–12 items, lowercase, comma-free.`,
    `* No mojibake, no Unicode replacement chars, no curly placeholders like {{ … }}.`,
    `* Stay strictly within ${langName}. Do not switch languages mid-sentence.`,
    `* The article must reference and link to the target_money_page at least once via internal_links.`,
    `* Do not invent statistics or laws; speak in concrete operational terms ("AI-bot отвечает в Telegram 24/7", etc.).`,
    `* Output ONLY the JSON object. Do not wrap in code fences. Do not prepend or append any text.`,
  ].join('\n');
}

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
    ? 'Пиши на русском языке. Все заголовки, FAQ и тексты — только на русском.'
    : 'O\'zbek tilida, lotin yozuvida yoz. Barcha sarlavhalar, FAQ va matn faqat lotin yozuvi bilan.';
  const lines: string[] = [
    langDirective,
    ``,
    `TOPIC BRIEF`,
    `* planned_title: ${ctx.planned_title}`,
    `* primary_keyword: ${ctx.primary_keyword}`,
    `* target_money_page: ${ctx.target_money_page}   (must appear in internal_links)`,
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
    `* Tone: confident, practical, no hype. Address the operator who runs the business.`,
    `* Anchor every claim in concrete steps the reader can take within a week.`,
    `* The CTA / final h2 must point readers to ${ctx.target_money_page} via an internal_links entry.`,
    `* Use the slug derived from the planned_title (transliterated to ASCII, kebab-case, no diacritics).`,
    `* Return EXACTLY one JSON object. No prose, no Markdown fences, no leading whitespace.`,
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
