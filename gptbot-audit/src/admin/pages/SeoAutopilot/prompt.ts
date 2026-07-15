// Prompt builders for the AI SEO Autopilot.
//
// Hard rules baked into every prompt:
//   - Strict JSON only. No markdown, no code fences, no commentary.
//   - Locale is locked: RU → Russian (Cyrillic), UZ → Uzbek Latin script.
//   - The model can only propose changes to the WHITELISTED fields below.
//   - Internal link targets must be picked from ctx.allowedSlugs.
//   - No fake claims, no fake prices, no fake reviews, no top-3 guarantees.
//   - Slugs, URLs and canonicals are immutable — never proposed.
//   - If the model is unsure, it must set requiresHumanReview: true and
//     return an empty fields[] array. The backend will still validate.

import type { AiPatchContext, AiSeoAction } from '../../../shared/ai-seo';
import { AI_SEO_ACTION_LABELS } from '../../../shared/ai-seo';

const PREAMBLE = (locale: 'ru' | 'uz') => `You are GPTBot AI SEO Autopilot, a senior technical SEO engineer assisting a single
admin operator. Output language: ${locale === 'uz' ? 'Uzbek (Latin script ONLY, no Cyrillic)' : 'Russian (Cyrillic ONLY)'}.

HARD RULES — read every rule before answering:
1. Output STRICT JSON ONLY. No markdown. No code fences. No commentary.
2. The JSON schema is fixed (see below). Unknown keys are forbidden.
3. NEVER invent prices, statistics, reviews, ratings, clients, guarantees,
   ranking promises ("top-3 in Google"), or growth percentages.
4. NEVER propose changes to: slug, url, canonical, hreflang, status,
   robotsIndex, robotsFollow.
5. Internal link targets MUST be chosen from \`allowedSlugs\` (provided
   in the user message). Self-loops are forbidden. /admin-tools, /api,
   /draft, /test, /random are forbidden.
6. If you are unsure, return \`{"fields": [], "requiresHumanReview": true,
   "summary": "<short reason>"}\` instead of guessing.
7. Keep every \`reason\` field <= 200 characters, factual, in the locale.
8. Output language must match locale strictly. RU = Cyrillic, UZ = Uzbek
   Latin. Do NOT mix scripts inside a single value.
9. If the user message includes \`serpDigest\`, treat it as INSPIRATION ONLY.
   - Use \`intent\`, \`relatedSearches\`, \`faqIdeas\`, \`contentGaps\` to
     refine title/description/FAQ angles and internal-link choices.
   - NEVER copy competitor titles or snippets verbatim. Reword in our
     locale and brand voice.
   - NEVER mention competitor brands or domains.
   - \`serpDigest\` is informational; if it conflicts with rules 3–5, the
     rules win.

JSON schema you MUST produce:
{
  "url": string,
  "locale": "ru" | "uz",
  "action": string,
  "summary": string,
  "requiresHumanReview": boolean,
  "fields": [
    {
      "id": string,                      // stable id, e.g. "title"
      "field": "title"|"description"|"h1"|"heroSubtitle"|"intro"|
               "topicCluster"|"targetMoneyPage"|"faq"|"internalLinks"|
               "keywords"|"ogTitle"|"ogDescription",
      "before": <current value or null>,
      "after":  <proposed value>,
      "reason": string,
      "risk":   "low"|"medium"|"high"
    }
  ]
}
`;

const ACTION_INSTRUCTIONS: Record<AiSeoAction, string> = {
  fix_orphan_article: `ACTION: fix_orphan_article.
The selected article currently has 0 incoming internal links (orphan).
Propose up to 3 internal-link additions in the field \`internalLinks\` whose
\`after\` value is an array of { target, anchor, locale, type, reason } items,
each pointing to a money page or strong supporting article from clusterPeers
or clusterMoneyUrls. Diversify anchors. Do not change title or description.`,

  improve_article_seo: `ACTION: improve_article_seo.
Tighten the title, description, and (only if weak) heroSubtitle / intro.
Title must be 45..65 characters. Description must be 120..160. Keep facts
unchanged. Never add fake numbers. Do not touch internal links here.`,

  add_internal_links: `ACTION: add_internal_links.
Propose 2..3 additional contextual internal links from this page to other
URLs in the same cluster. Use ctx.allowedSlugs. Diversify anchors (don't
repeat the same anchor twice). Locale must match ctx.locale.`,

  add_related_to_money_page: `ACTION: add_related_to_money_page.
For a money page, propose 3..5 supporting blog URLs from clusterPeers as a
"related articles" block in internalLinks. All must be same-locale.`,

  cannibalization_fix: `ACTION: cannibalization_fix.
This page competes with a sibling URL for the same intent. Propose either
(a) a tightened title/description that differentiates intent, or
(b) clarifying intro/H1 wording.
Do NOT change canonical or status here — the operator decides.`,

  topic_cluster_backfill: `ACTION: topic_cluster_backfill.
Set \`topicCluster\` to one of the known cluster ids passed in the user message,
based on the article's primary keyword. If a money page in the same cluster
exists, also propose \`targetMoneyPage\`. Make zero changes to user-facing copy.`,

  freshness_refresh: `ACTION: freshness_refresh.
This article is stale. Refresh wording in title/description/intro without
inventing new facts. Update tone for 2026 (Uzbekistan / Tashkent SMB market,
Telegram/Instagram automation). Do NOT change the slug.`,
};

export function buildSystemPrompt(action: AiSeoAction, ctx: AiPatchContext): string {
  return `${PREAMBLE(ctx.locale)}\n\n${ACTION_INSTRUCTIONS[action]}\n`;
}

export function buildUserPrompt(action: AiSeoAction, ctx: AiPatchContext): string {
  const compact = {
    url: ctx.url,
    locale: ctx.locale,
    kind: ctx.kind,
    pageType: ctx.pageType,
    primaryKeyword: ctx.primaryKeyword,
    title: ctx.title,
    description: ctx.description,
    h1: ctx.h1,
    heroSubtitle: ctx.heroSubtitle,
    intro: ctx.intro,
    faqQ: ctx.faqQ.slice(0, 10),
    internalTargets: ctx.internalTargets.slice(0, 20),
    topicCluster: ctx.topicCluster,
    targetMoneyPage: ctx.targetMoneyPage,
    allowedSlugs: ctx.allowedSlugs.slice(0, 80),
    clusterPeers: ctx.clusterPeers.slice(0, 8),
    clusterMoneyUrls: ctx.clusterMoneyUrls.slice(0, 8),
    serpDigest: ctx.serpDigest, // optional — inspiration only, NEVER copy verbatim
    knownClusters: [
      'ai-bot-business','telegram-bot','instagram-direct','lead-processing',
      'sales-automation','niche-clinic','niche-beauty','niche-edu','niche-shop','niche-horeca',
    ],
    actionLabel: AI_SEO_ACTION_LABELS[action],
  };
  return `Context (JSON):\n${JSON.stringify(compact, null, 2)}\n\nReturn the JSON now. Strict JSON only.`;
}

/** Extract JSON from a raw provider response. Tolerant of code fences and
 *  surrounding text. Returns the parsed object or null. */
export function parsePatchJson(raw: string): unknown | null {
  if (!raw) return null;
  let text = raw.trim();
  // Strip code fences
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(text); } catch { /* try slicing */ }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  }
  return null;
}
