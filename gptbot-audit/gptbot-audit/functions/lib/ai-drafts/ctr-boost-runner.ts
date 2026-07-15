// CTR Boost — internal-link suggestions for AI drafts.
//
// Combines:
//   1. The deterministic LinkPlan (functions/lib/intent-guard/link-plan.ts)
//      that scans the entire content inventory for high-relevance targets
//      and the current target_money_page.
//   2. A light Groq call (≈ 1 s, JSON mode) that picks the best 4–8
//      anchor variants for THIS article's body — phrasing them to look
//      like natural in-line CTAs that drive clicks rather than generic
//      "see also" links.
//
// Why CTR-boosting works:
//   * Internal links to money-pages with relevant anchor text move
//     warm reader traffic into the conversion funnel.
//   * Cluster-sibling links increase dwell time + pages-per-session,
//     both ranking + revenue signals.
//   * Anchor diversity around a target raises its weighted relevance.
//
// Hard rules preserved:
//   * No mutation of the draft — only suggestions returned.
//   * No publish, no IndexNow.
//   * Operator must select + apply explicitly via /apply-links.
//   * Re-validation runs on apply.
//   * Targets must already exist in the inventory (or be the active
//     target_money_page) — the LLM cannot invent URLs.

import type { Env } from '../../_types';
import type { AiDraftArticle } from '../../../src/shared/ai-drafts';
import type { ContentInventory } from '../../../src/shared/intent-guard';
import { buildFingerprint } from '../intent-guard/fingerprint';
import { buildLinkPlan } from '../intent-guard/link-plan';
import { routeLlmCall } from '../llm/router';
import type { LlmCallInput } from '../llm/types';

export interface CtrBoostSuggestion {
  /** Internal URL — guaranteed to exist in the inventory. */
  target: string;
  /** Anchor text (operator-friendly, body-aware). */
  anchor: string;
  /** Why we recommend this link (operator UI). */
  reason: string;
  /** 'money' | 'cluster' | 'sibling'. */
  link_type: 'money' | 'cluster' | 'sibling';
  /** 0–100 heuristic projected CTR contribution. */
  ctr_score: number;
  /** Already exists in the article — surface as "current" so the operator
   *  can replace anchor text, but cannot duplicate target. */
  already_exists: boolean;
}

export interface CtrBoostPlan {
  ok: true;
  locale: 'ru' | 'uz';
  suggestions: CtrBoostSuggestion[];
  /** Number of internal_links currently on the article. */
  current_count: number;
  /** Recommended target — usually 5–8 for a long-form blog post. */
  target_count: number;
  /** Aggregate score 0–100 — projected CTR uplift if all suggestions are
   *  applied. Heuristic, conservative. */
  projected_uplift: number;
  /** Provider/model that produced the anchor variants. */
  provider: string;
  model: string;
  /** Was a fallback used (Mistral/Cerebras) instead of Groq primary. */
  fallback_used: boolean;
  duration_ms: number;
}

export interface CtrBoostFailure {
  ok: false;
  error: string;
  /** When the deterministic LinkPlan returned nothing — usually means the
   *  inventory is empty for the article's locale. */
  reason?: 'no_candidates' | 'no_provider' | 'llm_failed';
}

export type CtrBoostResult = CtrBoostPlan | CtrBoostFailure;

const MAX_SUGGESTIONS = 8;
const MIN_SUGGESTIONS = 3;

export async function suggestCtrBoostLinks(
  env: Env,
  draftId: string,
  locale: 'ru' | 'uz',
  article: AiDraftArticle,
  inventory: ContentInventory,
): Promise<CtrBoostResult> {
  // 1. Deterministic candidate selection (always available — no LLM needed).
  const fp = buildFingerprint({
    locale,
    meta_title: article.meta_title,
    h1: article.h1,
    excerpt: article.excerpt,
    target_keyword: article.target_keyword,
    target_money_page: article.target_money_page ?? null,
    slug: article.slug,
  });
  const baseplan = buildLinkPlan(
    {
      fingerprint: fp,
      primary_keyword: article.target_keyword,
      target_money_page: article.target_money_page ?? null,
      planned_title: article.meta_title || article.h1 || '',
      locale,
    },
    inventory,
  );

  const existingTargets = new Set((article.internal_links || []).map((l) => l.target));
  const candidates: Array<{ target: string; anchor: string; reason: string; type: 'money' | 'cluster' | 'sibling' }> = [];
  for (const o of baseplan.outgoing) {
    if (!o.target) continue;
    candidates.push({
      target: o.target,
      anchor: o.anchor,
      reason: o.reason,
      type: o.target === article.target_money_page ? 'money' : (o.reason.includes('money') ? 'money' : 'cluster'),
    });
  }
  // Pad with cluster siblings when the LinkPlan returned fewer than the
  // minimum — pull other published items in the same locale + industry
  // cluster that aren't already on the article. We deliberately keep
  // this loose: even imperfect siblings beat returning < 3 candidates.
  if (candidates.length < MIN_SUGGESTIONS) {
    for (const it of inventory.items) {
      if (it.locale !== locale) continue;
      if (it.status !== 'published') continue;
      if (!it.url) continue;
      if (it.url === article.target_money_page) continue;
      if (candidates.some((c) => c.target === it.url)) continue;
      const sameIndustry = fp.industry !== 'none' && it.fingerprint.industry === fp.industry;
      const sameAudience = fp.audience !== 'none' && it.fingerprint.audience === fp.audience;
      if (!sameIndustry && !sameAudience) continue;
      candidates.push({ target: it.url, anchor: it.h1 || it.title, reason: 'тематический кластер', type: 'sibling' });
      if (candidates.length >= MAX_SUGGESTIONS) break;
    }
  }
  if (candidates.length === 0) {
    return { ok: false, error: 'No suitable internal-link candidates in inventory.', reason: 'no_candidates' };
  }

  // 2. Use Groq (light, fast) to rewrite anchor text body-aware.
  // We DO NOT let the LLM invent URLs — only re-phrase anchor text and
  // pick a CTR score per candidate. The URL list is fixed by the
  // deterministic step above.
  const bodyText = (article.body_blocks || [])
    .filter((b) => b.type === 'p' || b.type === 'h2' || b.type === 'h3' || b.type === 'list' || b.type === 'cta' || b.type === 'quote')
    .slice(0, 24) // cap to keep prompt small
    .map((b) => `[${b.type}] ${b.text || (Array.isArray(b.items) ? b.items.join(' · ') : '')}`)
    .join('\n')
    .slice(0, 4_000);

  const candidatesForPrompt = candidates.slice(0, MAX_SUGGESTIONS).map((c, i) => ({
    id: i,
    url: c.target,
    base_anchor: c.anchor,
    type: c.type,
  }));

  const { system: sys, user: usr } = buildCtrBoostPrompt({
    locale,
    article: {
      meta_title: article.meta_title,
      h1: article.h1,
      excerpt: article.excerpt,
      target_keyword: article.target_keyword,
      target_money_page: article.target_money_page ?? null,
      body_text_preview: bodyText,
    },
    candidates: candidatesForPrompt,
    existing_targets: Array.from(existingTargets),
  });

  const req: LlmCallInput = {
    feature: 'judge', // light JSON-only task → maps to Groq llama-3.3-70b primary
    locale,
    system: sys,
    user: usr,
    jsonObject: true,
    maxTokens: 1_400,
    temperature: 0.4,
    idempotencyKey: `ctr-boost::${draftId}::${locale}::${candidates.map((c) => c.target).join('|').slice(0, 200)}`,
  };
  const llmStart = Date.now();
  const llmResult = await routeLlmCall(env, req);
  const dt = Date.now() - llmStart;
  if (!llmResult.ok) {
    // Fallback: return the deterministic plan with default anchor + a
    // conservative CTR score. The operator still gets value.
    const fallback = candidates.slice(0, MAX_SUGGESTIONS).map((c, i) => ({
      target: c.target,
      anchor: c.anchor,
      reason: c.reason,
      link_type: c.type,
      ctr_score: scoreFor(c.type, i, false),
      already_exists: existingTargets.has(c.target),
    }));
    return {
      ok: true,
      locale,
      suggestions: fallback,
      current_count: existingTargets.size,
      target_count: Math.min(MAX_SUGGESTIONS, candidates.length),
      projected_uplift: aggregate(fallback),
      provider: 'deterministic',
      model: 'link-plan-fallback',
      fallback_used: true,
      duration_ms: dt,
    };
  }

  // LlmCallSuccess returns content as raw text — caller is responsible
  // for JSON.parse. The router has already enforced jsonObject mode so
  // the content is JSON.
  let parsedJson: unknown = null;
  try { parsedJson = JSON.parse(llmResult.content); } catch { parsedJson = null; }
  const parsed = parseLlmResponse(parsedJson);
  const suggestions: CtrBoostSuggestion[] = candidatesForPrompt.map((c, i) => {
    const llm = parsed.find((x) => x.id === c.id);
    const anchor = (llm?.anchor && typeof llm.anchor === 'string' && llm.anchor.length >= 4 && llm.anchor.length <= 120)
      ? llm.anchor.trim()
      : candidates[i].anchor;
    const reason = (llm?.reason && typeof llm.reason === 'string' && llm.reason.length >= 4 && llm.reason.length <= 200)
      ? llm.reason.trim()
      : candidates[i].reason;
    const ctr_score = clamp01_100(typeof llm?.ctr_score === 'number' ? llm.ctr_score : scoreFor(candidates[i].type, i, true));
    return {
      target: c.url,
      anchor,
      reason,
      link_type: candidates[i].type,
      ctr_score,
      already_exists: existingTargets.has(c.url),
    };
  });

  return {
    ok: true,
    locale,
    suggestions,
    current_count: existingTargets.size,
    target_count: Math.min(MAX_SUGGESTIONS, candidates.length),
    projected_uplift: aggregate(suggestions),
    provider: llmResult.meta.provider,
    model: llmResult.meta.model,
    fallback_used: llmResult.meta.fallback_used,
    duration_ms: dt,
  };
}

function clamp01_100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function scoreFor(type: 'money' | 'cluster' | 'sibling', positionIdx: number, llmRated: boolean): number {
  // Money pages score highest, cluster mid, sibling lowest. LLM-rated
  // candidates get a small uplift since the anchor is body-aware.
  const base = type === 'money' ? 78 : type === 'cluster' ? 62 : 48;
  const positionPenalty = positionIdx * 3; // diminishing returns
  const llmBonus = llmRated ? 6 : 0;
  return clamp01_100(base - positionPenalty + llmBonus);
}

function aggregate(suggestions: CtrBoostSuggestion[]): number {
  if (suggestions.length === 0) return 0;
  const fresh = suggestions.filter((s) => !s.already_exists);
  if (fresh.length === 0) return 0;
  // Average × volume scaler — capped at 35% (conservative real-world
  // uplift from internal-link improvements alone).
  const avg = fresh.reduce((acc, s) => acc + s.ctr_score, 0) / fresh.length;
  const volume = Math.min(1, fresh.length / 6);
  return clamp01_100(Math.round(avg * 0.35 * volume));
}

function parseLlmResponse(data: unknown): Array<{ id: number; anchor?: string; reason?: string; ctr_score?: number }> {
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const arr = Array.isArray(obj.suggestions) ? obj.suggestions
    : Array.isArray(obj.results) ? obj.results
    : Array.isArray(data) ? data
    : [];
  return (arr as unknown[])
    .filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object')
    .map((x) => ({
      id: typeof x.id === 'number' ? x.id : -1,
      anchor: typeof x.anchor === 'string' ? x.anchor : undefined,
      reason: typeof x.reason === 'string' ? x.reason : undefined,
      ctr_score: typeof x.ctr_score === 'number' ? x.ctr_score : undefined,
    }))
    .filter((x) => x.id >= 0);
}

interface CtrBoostPromptInput {
  locale: 'ru' | 'uz';
  article: {
    meta_title: string;
    h1: string;
    excerpt: string;
    target_keyword: string;
    target_money_page: string | null;
    body_text_preview: string;
  };
  candidates: Array<{ id: number; url: string; base_anchor: string; type: 'money' | 'cluster' | 'sibling' }>;
  existing_targets: string[];
}

function buildCtrBoostPrompt(input: CtrBoostPromptInput): { system: string; user: string } {
  const langInstruction = input.locale === 'uz'
    ? 'Anchor text must be in natural Uzbek Latin — never Cyrillic, never Russian.'
    : 'Anchor text must be in natural conversational Russian.';

  const system = [
    'You are an SEO copywriter optimising internal links for click-through-rate.',
    langInstruction,
    'You return STRICTLY a single JSON object — no commentary, no markdown fence.',
    'Schema: {"suggestions":[{"id":<int>,"anchor":"<string>","reason":"<string>","ctr_score":<int 0..100>}]}',
    'Money-page links typically score 70–95, cluster 50–80, sibling 35–65.',
    'Anchor must be 4–80 chars, body-aware (reuse phrasing from BODY PREVIEW when possible). Avoid "click here", "tut", "bu yerda".',
    'NEVER change or invent URLs — keep the candidate URL list as-is.',
  ].join('\n');

  const user = [
    'CONTEXT — article currently in pending review:',
    `meta_title: ${input.article.meta_title}`,
    `h1: ${input.article.h1}`,
    `excerpt: ${input.article.excerpt}`,
    `target_keyword: ${input.article.target_keyword}`,
    input.article.target_money_page ? `target_money_page: ${input.article.target_money_page}` : '',
    '',
    'BODY PREVIEW (first ~24 blocks):',
    input.article.body_text_preview,
    '',
    'CANDIDATE INTERNAL LINKS (URLs are fixed):',
    JSON.stringify(input.candidates),
    '',
    input.existing_targets.length
      ? `Already-linked URLs in this article (do not duplicate):\n${input.existing_targets.join('\n')}`
      : 'No existing internal links yet.',
    '',
    `Return one JSON object with key "suggestions" — one entry per candidate id. Anchor language: ${input.locale === 'uz' ? 'Uzbek Latin' : 'Russian'}.`,
  ].filter(Boolean).join('\n');

  return { system, user };
}
