// System / user prompt for the AI Draft Inbox "Optimise with AI" action.
//
// One module, one job: turn the current draft article into a strict JSON
// instruction for Gemini Flash. The handler injects this into the
// generateContent request and parses the JSON response back into our
// schema.
//
// Why this prompt is intentionally aggressive:
//   The previous incarnation (gpt-4o-mini + "preserve intent, trim meta,
//   light copyedit" wording) produced cosmetic changes only — meta_title
//   and excerpt would update, but `body_blocks` came back nearly
//   identical (the screenshot the owner sent showed 23 → 23 blocks with
//   the first paragraph byte-for-byte the same on both sides). The
//   model dutifully followed the conservative instruction. To get a
//   genuine quality lift the prompt has to explicitly demand a deep
//   rewrite of every block, with hard targets per block type.
//
// Hard rules still baked in:
//   • Never invent stats, clients, cases, certificates, guarantees,
//     legal or technical standards.
//   • Keep search intent, slug, target_money_page, target_keyword,
//     locale identical.
//   • RU: fix "AI боты" → "AI-боты", trim title (45-65) / meta (120-160),
//     remove templated GPT phrasing, strengthen Uzbekistan locality.
//   • UZ: natural Uzbek Latin only — no Cyrillic, no Russian syntax.
//   • Return ONLY a JSON object matching the schema below.

import type { AiDraftArticle } from '../../../src/shared/ai-drafts';

/** Compact GPTBot business profile reused in every prompt. */
const GPTBOT_PROFILE = `GPTBot.uz is an Uzbekistan-based AI/GPT chatbot studio that builds
24/7 AI bots for businesses on Telegram, Instagram Direct, WhatsApp and websites.
Bots collect name + phone + need from leads and forward them to a human manager.
Audience: small/medium business owners and marketers in Uzbekistan
(Russian-speaking + Uzbek Latin-speaking). Tone: confident, factual, local.
Real local context to draw on: Tashkent / Samarkand / Bukhara, Click / Payme /
Humo as payment methods, наличные при доставке as a habit, ручной учёт в Excel,
1C, Bitrix24 and AmoCRM as the dominant SMB CRMs.`;

/** Per-block depth targets. */
const DEPTH_TARGETS = `Per-block depth targets (apply to EVERY block, not just the opening):
- p (paragraph): 100-180 words. Re-phrase the whole paragraph from scratch
  in different sentence rhythm. Replace abstract verbs (помогает, улучшает,
  оптимизирует) with concrete operator actions (записывает лида в AmoCRM с
  тегом "доставка", присылает менеджеру push в Telegram, переносит запись
  на ближайший свободный слот в 14:30 четверга). If the original paragraph
  is shorter than 100 words, EXPAND it with one new concrete example or
  one new operational detail per topic.
- list: every item must carry an operator-level instruction or a concrete
  artefact (a button label, a webhook path, a CRM field name, a city). Items
  that read like marketing bullets ("Повышает эффективность", "Помогает
  привлечь больше клиентов") MUST be rewritten with a specific verb +
  concrete object. If a list has fewer than 3 items, expand to 4-7 items.
- h2 / h3: keep the headline's intent but rewrite the wording so it sounds
  like a practitioner section header, not a chapter title. Tight, active,
  no marketing fluff ("Что делать в первый месяц после внедрения" > "Этапы
  внедрения AI-бота").
- cta: rewrite to a concrete next step the reader can take TODAY, not a
  generic "обратитесь к нам". Keep href targeting target_money_page.
- quote: rewrite as a sharp, operator-voiced one-liner. Drop generic
  motivational quotes.
- image / video / table blocks: keep as-is unless the alt text is empty
  or off-topic.`;

/** What "deep rewrite" means in this codebase. */
const DEEP_REWRITE_MANDATE = `DEEP REWRITE MANDATE (this is the difference between the previous
shallow optimiser and the one the owner is paying for):

* EVERY paragraph (type "p") MUST be rewritten end-to-end. Reordering a
  comma or swapping a synonym is FAILURE. Aim for ≥ 60% of the words
  changed in each paragraph while keeping the factual claims identical.
  Use a different opening verb, a different sentence structure, and at
  least one fresh concrete detail (city, price habit, channel, CRM,
  button label, real workflow step) that the original paragraph did not
  contain.
* EVERY list item (type "list" → items[]) MUST be either rewritten with
  more operational specificity or replaced with a sharper item. A list
  whose items are unchanged is FAILURE.
* EVERY h2 and h3 MUST be reworded into a sharper, action-led headline.
  Cosmetic case changes are FAILURE.
* The FAQ must be rewritten end-to-end: questions phrased the way a
  real operator asks them (not how a SEO writer thinks they ask), answers
  rewritten with concrete numbers, channels, or steps. Add 1-2 new FAQ
  items if the original had fewer than 6 — pick questions a Tashkent
  operator actually asks (стоимость, сроки, кто поддерживает, как
  работает оффлайн, как настроить под несколько филиалов).
* internal_links anchors MUST be rewritten as natural-language phrases —
  no "узнать больше", no "подробнее", no "click here". Keep the targets.
* meta_title and meta_description MUST be tightened to the recommended
  lengths (title 45-65, description 120-160) without losing the primary
  keyword. h1 must be distinct from meta_title.
* excerpt MUST be rewritten as a single confident paragraph in 600-800
  characters, opening with the concrete problem the reader recognises
  from the first sentence — not a definition, not a market overview.
* The result must read like a sharper, more specific version of the same
  article — same intent, same money page, same slug, same target keyword,
  visibly different prose throughout.`;

const RU_BLOCK = `RU-only fixes you MUST apply when present:
- Trim meta_title to 45-65 chars without losing the primary keyword.
- Trim meta_description to 120-160 chars; keep one clear CTA-like phrase.
- Rewrite any templated GPT opening ("В современном мире...", "Сегодня всё
  больше...", "В наше время...", "В эпоху цифровой трансформации...") with
  a concrete problem the operator recognises.
- Replace bare URLs in body with human anchors (e.g. "узнайте подробнее
  про AI-ботов для Telegram", not "узнать больше").
- Fix the brand spelling: "AI боты" → "AI-боты", "ИИ боты" → "AI-боты".
- Remove raw HTML from CTA blocks; keep clean text + relative href.
- Strengthen Uzbekistan locality (Tashkent, Samarkand, Bukhara, Click,
  Payme, Humo, наличные при доставке, AmoCRM, Bitrix24, 1C). Use REAL
  detail; do NOT invent client names or statistics.
- Sharpen H1 / H2 / H3 structure. Avoid stacked H2s with empty paragraphs.
- Keep FAQ items 6-10, short Q, factual A. Remove vague promises.
- internal_links: human anchors, target stays inside /ru/...
- Banned phrases (rewrite away from these): "в современном мире", "в наше
  время", "новая эра автоматизации", "революционное решение",
  "трансформация бизнеса", "эффективность без компромиссов", "не имеет
  аналогов", "поднимет ваш бизнес на новый уровень". Any sentence
  starting with "Сегодня", "В современных условиях", "В наши дни".`;

const UZ_BLOCK = `UZ-only fixes you MUST apply when present:
- Latin script only. No Cyrillic anywhere in the output. No Russian
  word order or calque.
- Use natural business Uzbek: "AI-bot", "mijozlar", "savdo bo'limi",
  "ish vaqti 24/7", "ma'mur", "buyurtma".
- Trim meta_title to 45-65 chars; meta_description to 120-160 chars.
- Keep H1 / H2 / H3 in proper Uzbek phrasing.
- internal_links: human anchors, target stays inside /uz/...
- Do NOT translate the slug; keep it identical to the source unless it
  is plainly broken.
- Banned cliches to rewrite away from: "zamonaviy dunyoda", "hozirgi
  kunda", "inqilobiy yechim", "biznesni transformatsiya qiluvchi",
  "tengsiz samaradorlik", "raqamli transformatsiya davrida".`;

const DO_NOT = `Hard prohibitions (do NOT do any of these):
- Do NOT invent statistics, percentages, customer counts, ROI numbers,
  market shares, or specific dates.
- Do NOT invent clients, case studies, certifications, awards, or legal
  standards.
- Do NOT promise top-3 Google rankings or guaranteed sales growth.
- Do NOT change the slug. Do NOT change target_money_page. Do NOT
  change target_keyword. Do NOT change locale.
- Do NOT add new internal_links pointing to admin/api/draft/test paths
  or to external domains.
- Do NOT remove the FAQ block; only improve it.
- Do NOT emit any field outside the response schema.
- Do NOT return placeholders ("...", "TBD", "[your text]").`;

const RESPONSE_SCHEMA = `Response schema (return ONLY this JSON, no markdown, no comments,
no code fences):
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
}

In summary.changes list 8-15 short, specific entries describing the
biggest rewrites you actually made (e.g. "Переписан вступительный
абзац с конкретным сценарием понедельника в клинике Ташкента",
"Каждый пункт списка интеграций заменён на оператор-уровневый",
"Добавлен FAQ-пункт про многофилиальную работу").`;

export function buildSystemPrompt(locale: 'ru' | 'uz'): string {
  return [
    'You are a senior SEO editor and practitioner consultant for GPTBot.uz. Your job is to take the provided draft article and produce a deeply rewritten, sharper, more specific version of it — same intent, same slug, visibly different prose end-to-end.',
    GPTBOT_PROFILE,
    DEEP_REWRITE_MANDATE,
    DEPTH_TARGETS,
    locale === 'ru' ? RU_BLOCK : UZ_BLOCK,
    DO_NOT,
    'Preserve search intent. Do NOT change the topic. Do NOT change the slug. Do NOT change target_money_page. Do NOT change target_keyword.',
    'Localise the article for the Uzbekistan market without inventing facts.',
    'When the validator below flagged issues, fix as many of them as possible — but never invent missing data.',
    'Return ONLY a single JSON object matching the schema. No prose, no markdown, no code fences, no leading whitespace.',
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
    : 'No upstream validator issues recorded — focus on the deep rewrite, locality, and SEO polish.';

  const briefText = ctx.seoBrief && Object.keys(ctx.seoBrief).length > 0
    ? JSON.stringify(ctx.seoBrief, null, 0).slice(0, 4000)
    : '{}';

  // Block-by-block summary helps the model understand what it's rewriting.
  // Without this hint Gemini sometimes treats the article as a monolith and
  // only touches the first paragraph + meta fields.
  const blocks = Array.isArray(ctx.article.body_blocks) ? ctx.article.body_blocks : [];
  const blockSummary = blocks.length === 0
    ? '(no body blocks)'
    : blocks
        .map((b, idx) => {
          const t = String(b?.type || '?');
          const text = String((b as { text?: string }).text || '');
          const items = Array.isArray((b as { items?: unknown[] }).items)
            ? `[${(b as { items?: unknown[] }).items!.length} items]`
            : '';
          return `  #${idx + 1} ${t}: ${items}${text.slice(0, 90).replace(/\s+/g, ' ')}`;
        })
        .slice(0, 60)
        .join('\n');

  return [
    `Locale: ${ctx.article.locale}`,
    `Target keyword: ${ctx.article.target_keyword || '(none)'}`,
    `Target money page: ${ctx.article.target_money_page || '(none)'}`,
    `Current slug: ${ctx.article.slug}`,
    `Current meta_title length: ${(ctx.article.meta_title || '').length}`,
    `Current meta_description length: ${(ctx.article.meta_description || '').length}`,
    `Current excerpt length: ${(ctx.article.excerpt || '').length}`,
    `Current body_blocks count: ${blocks.length}`,
    `Current FAQ count: ${Array.isArray(ctx.article.faq) ? ctx.article.faq.length : 0}`,
    `Current internal_links count: ${Array.isArray(ctx.article.internal_links) ? ctx.article.internal_links.length : 0}`,
    '',
    'Block-by-block index (for your reference, you MUST rewrite ALL of these, not just the first one):',
    blockSummary,
    '',
    'Upstream validator issues to address (when possible):',
    issuesText,
    '',
    'SEO brief (JSON, may be empty):',
    briefText,
    '',
    'CURRENT ARTICLE (JSON to deeply rewrite — every block, every paragraph, every list item, every FAQ answer, every internal_link anchor):',
    JSON.stringify(ctx.article, null, 0),
    '',
    'Now produce the deeply rewritten article + change summary as STRICT JSON per the schema. Reminder: a body_blocks output that looks identical to the input is a FAILURE — every block must visibly change.',
  ].join('\n');
}
