// Deterministic conflict scoring for the Intent Guard.
//
// Given:
//   * one "candidate" document (the article we are analysing)
//   * the full content inventory (published pages + blog + AI drafts +
//     active topic reservations)
//
// compute a SHORTLIST of probable conflicts and a per-pair similarity
// score. The shortlist is the only thing we ever forward to SERP / LLM
// — full O(N) Serper calls would blow the wallclock budget.
//
// Hard rules:
//   * Self-exclusion: the candidate is removed from the inventory
//     before comparison (its own id MUST NOT appear in the conflicts).
//   * Locale separation: different locales NEVER conflict here.
//   * Money pages win ties: when two conflicting docs have the same
//     score, the money_page is ranked first (UI shows it on top).

import type {
  ContentInventoryItem, IntentConflict, IntentFingerprint,
} from '../../../src/shared/intent-guard';
import { intentKeyOf, sameIntent } from './fingerprint';

const RUSSIAN_STOPWORDS = new Set([
  'и', 'в', 'не', 'на', 'я', 'быть', 'он', 'с', 'что', 'а',
  'по', 'это', 'она', 'этот', 'к', 'но', 'они', 'мы', 'как',
  'из', 'у', 'который', 'то', 'за', 'свой', 'для', 'же', 'ты',
  'все', 'тот', 'еще', 'или', 'до', 'после', 'над', 'под',
  'про', 'без', 'через', 'между', 'при', 'если', 'когда',
]);

const UZBEK_STOPWORDS = new Set([
  'va', 'bilan', 'uchun', 'lekin', 'ammo', 'yoki', 'agar',
  'ham', 'shu', 'bu', 'biz', 'siz', 'men', 'sen', 'u',
  'ular', 'shuningdek', 'qachon', 'qanday', 'qaysi',
  'qayerda', 'nima', 'kim',
]);

function normalize(s: string | null | undefined): string {
  return (s || '').toString().toLowerCase().replace(/[^a-z0-9а-яёіїєґўҳқғ\s'-]/giu, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(s: string | null | undefined): string[] {
  const n = normalize(s);
  if (!n) return [];
  return n.split(' ').filter((w) => w.length > 2 && !RUSSIAN_STOPWORDS.has(w) && !UZBEK_STOPWORDS.has(w));
}

/** Jaccard similarity over normalised token sets, range 0..1. */
export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let intersection = 0;
  for (const t of sa) if (sb.has(t)) intersection++;
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Character-trigram overlap, robust to small typos. Range 0..1. */
export function trigramSim(a: string, b: string): number {
  const tri = (s: string): Set<string> => {
    const out = new Set<string>();
    const n = normalize(s);
    if (n.length < 3) return out;
    for (let i = 0; i < n.length - 2; i++) out.add(n.slice(i, i + 3));
    return out;
  };
  const sa = tri(a);
  const sb = tri(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const t of sa) if (sb.has(t)) intersection++;
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface DeterministicCandidate {
  locale: ContentInventoryItem['locale'];
  id: string;                  // for self-exclusion
  title: string;
  h1: string;
  slug: string;
  target_keyword: string;
  target_money_page: string | null;
  headings: string[];
  faq_questions: string[];
  internal_link_targets: string[];
  fingerprint: IntentFingerprint;
}

function similarityScore(c: DeterministicCandidate, item: ContentInventoryItem): IntentConflict['similarity'] {
  const titleSim = trigramSim(c.title, item.title);
  const h1Sim    = trigramSim(c.h1, item.h1);
  const slugSim  = trigramSim(c.slug, item.slug);
  const kwOverlap = jaccard(tokens(c.target_keyword), tokens(item.target_keyword));
  const headingOverlap = jaccard(c.headings.flatMap(tokens), item.headings.flatMap(tokens));
  const sameIntentFlag = sameIntent(c.fingerprint, item.fingerprint);
  const sameFunnel = c.fingerprint.funnel_stage === item.fingerprint.funnel_stage;
  const sameAudience = c.fingerprint.audience === item.fingerprint.audience && c.fingerprint.audience !== 'none';
  const sameIndustry = c.fingerprint.industry === item.fingerprint.industry && c.fingerprint.industry !== 'none';
  const sameMoney = !!c.target_money_page && c.target_money_page === item.target_money_page;
  // Weighted score 0..100.
  let score = 0;
  score += titleSim   * 18;
  score += h1Sim      * 18;
  score += slugSim    * 12;
  score += kwOverlap  * 22;
  score += headingOverlap * 10;
  if (sameIntentFlag)  score += 12;
  if (sameFunnel)      score += 4;
  if (sameAudience)    score += 6;
  if (sameIndustry)    score += 4;
  if (sameMoney)       score += 8;
  if (score > 100) score = 100;
  return {
    keyword_overlap: round(kwOverlap),
    title_similarity: round(titleSim),
    h1_similarity: round(h1Sim),
    slug_similarity: round(slugSim),
    heading_overlap: round(headingOverlap),
    same_intent: sameIntentFlag,
    same_funnel: sameFunnel,
    same_audience: sameAudience,
    same_industry: sameIndustry,
    same_target_money_page: sameMoney,
    score: Math.round(score),
  };
}

function round(n: number): number { return Math.round(n * 100) / 100; }

function priorityForSourceType(t: IntentConflict['source_type']): number {
  switch (t) {
    case 'money_page': return 5;
    case 'blog': return 4;
    case 'ai_draft': return 3;
    case 'reserved_topic': return 2;
    case 'plan_item': return 1;
    default: return 0;
  }
}

function explainConflict(sim: IntentConflict['similarity'], item: ContentInventoryItem): string {
  const parts: string[] = [];
  if (sim.same_intent) parts.push('одинаковый поисковый интент');
  if (sim.same_target_money_page) parts.push('одна и та же money page');
  if (sim.same_audience && item.fingerprint.audience !== 'none') parts.push(`та же аудитория (${item.fingerprint.audience})`);
  if (sim.same_industry && item.fingerprint.industry !== 'none') parts.push(`та же отрасль (${item.fingerprint.industry})`);
  if (sim.title_similarity > 0.45) parts.push('заголовки очень похожи');
  if (sim.keyword_overlap > 0.4) parts.push('пересечение ключевых слов');
  if (parts.length === 0) parts.push('пересекаются ключевые слова и структура');
  return parts.join('; ');
}

export interface DeterministicResult {
  fingerprint: IntentFingerprint;
  intent_key: string;
  conflicts: IntentConflict[];
}

const MAX_CANDIDATES = 12;
const KEEP_SCORE_THRESHOLD = 18; // anything weaker than this is noise

export function shortlistConflicts(
  candidate: DeterministicCandidate,
  inventory: ContentInventoryItem[],
): DeterministicResult {
  const fingerprint = candidate.fingerprint;
  const intentKey = intentKeyOf(fingerprint);

  const conflicts: IntentConflict[] = [];
  for (const item of inventory) {
    if (item.id === candidate.id) continue;          // self-exclusion
    if (item.locale !== candidate.locale) continue;  // RU vs UZ is never a conflict
    const sim = similarityScore(candidate, item);
    if (sim.score < KEEP_SCORE_THRESHOLD) continue;
    conflicts.push({
      source_type: item.source_type,
      id: item.id,
      url: item.url,
      title: item.title,
      locale: item.locale,
      intent_key: item.intent_key,
      fingerprint: item.fingerprint,
      similarity: sim,
      reason: explainConflict(sim, item),
    });
  }

  // Sort: score desc, then source priority desc.
  conflicts.sort((a, b) => {
    if (b.similarity.score !== a.similarity.score) return b.similarity.score - a.similarity.score;
    return priorityForSourceType(b.source_type) - priorityForSourceType(a.source_type);
  });

  return {
    fingerprint,
    intent_key: intentKey,
    conflicts: conflicts.slice(0, MAX_CANDIDATES),
  };
}
