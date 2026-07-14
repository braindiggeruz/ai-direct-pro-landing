// Programmatic constraint validators for retarget output.
//
// The LLM is unreliable at actually MOVING an article into a different
// search territory. It often:
//   * keeps the same H1 with minor reword ("AI бот" -> "GPT бот")
//   * keeps the same audience + industry + funnel
//   * keeps the same target_keyword with one stop-word swap
//
// These validators run AFTER the LLM returns and BEFORE we accept the
// attempt. A failure here triggers another iteration with explicit
// feedback about what the previous attempt did wrong.

import type { AiDraftArticle } from '../../../src/shared/ai-drafts';
import type { IntentConflict, IntentFingerprint } from '../../../src/shared/intent-guard';
import { jaccard, trigramSim } from './deterministic';

export interface ConstraintFailure {
  code:
    | 'fingerprint_too_similar'
    | 'title_too_similar'
    | 'h1_too_similar'
    | 'keyword_too_similar'
    | 'headings_too_similar'
    | 'still_conflicts_money_page'
    | 'still_conflicts_top_peer'
    | 'no_unique_entities';
  message: string;
  /** human-readable hint we forward back to the LLM verbatim */
  hint: string;
  measured?: number;
  threshold?: number;
}

export interface ConstraintReport {
  passed: boolean;
  failures: ConstraintFailure[];
  fingerprintDimsChanged: number;
  titleSim: number;
  keywordSim: number;
  headingSim: number;
}

const FP_DIMS_FOR_DELTA: Array<keyof IntentFingerprint> = [
  'search_intent', 'funnel_stage', 'audience', 'industry', 'channel', 'modifier', 'content_type',
];

function tokens(s: string | null | undefined): string[] {
  return (s || '').toLowerCase().split(/\W+/u).filter((w) => w.length > 2);
}

function countDimDelta(a: IntentFingerprint, b: IntentFingerprint): number {
  let delta = 0;
  for (const k of FP_DIMS_FOR_DELTA) {
    if ((a[k] || 'none') !== (b[k] || 'none')) delta++;
  }
  return delta;
}

function headingsOf(a: AiDraftArticle): string[] {
  return (a.body_blocks || [])
    .filter((b) => b.type === 'h2' || b.type === 'h3')
    .map((b) => b.text || '')
    .filter(Boolean);
}

export interface ValidateInput {
  original: AiDraftArticle;
  originalFingerprint: IntentFingerprint;
  optimized: AiDraftArticle;
  optimizedFingerprint: IntentFingerprint;
  conflicts: IntentConflict[];
  /** which iteration we're at — thresholds get stricter on later attempts */
  iteration: number;
}

export function validateRetargetConstraints(input: ValidateInput): ConstraintReport {
  const { original, originalFingerprint, optimized, optimizedFingerprint, conflicts, iteration } = input;
  const failures: ConstraintFailure[] = [];

  // Progressively stricter thresholds with each iteration.
  const titleSimMax    = iteration <= 1 ? 0.55 : iteration === 2 ? 0.45 : 0.35;
  const keywordSimMax  = iteration <= 1 ? 0.45 : iteration === 2 ? 0.35 : 0.25;
  const headingSimMax  = iteration <= 1 ? 0.60 : iteration === 2 ? 0.50 : 0.40;
  const dimsDeltaMin   = iteration <= 1 ? 1    : iteration === 2 ? 2    : 3;

  // 1) Fingerprint axis change
  const fingerprintDimsChanged = countDimDelta(originalFingerprint, optimizedFingerprint);
  if (fingerprintDimsChanged < dimsDeltaMin) {
    failures.push({
      code: 'fingerprint_too_similar',
      message: `Fingerprint changed on only ${fingerprintDimsChanged} dimension(s); need ≥ ${dimsDeltaMin}.`,
      hint: `Ты ИЗМЕНИЛ только ${fingerprintDimsChanged} ось. Необходимо сменить минимум ${dimsDeltaMin} оси из набора (audience, industry, channel, funnel_stage, modifier, content_type, search_intent). Старый fingerprint и новый сейчас слишком похожи — выбирай ДРУГУЮ аудиторию ИЛИ ДРУГУЮ индустрию ИЛИ ДРУГОЙ канал.`,
      measured: fingerprintDimsChanged,
      threshold: dimsDeltaMin,
    });
  }

  // 2) Title similarity (trigram, robust to minor edits)
  const titleSim = trigramSim(original.meta_title, optimized.meta_title);
  if (titleSim > titleSimMax) {
    failures.push({
      code: 'title_too_similar',
      message: `meta_title trigram similarity ${(titleSim * 100).toFixed(0)}% > max ${(titleSimMax * 100).toFixed(0)}%.`,
      hint: `Новый meta_title слишком похож на старый ("${original.meta_title}"). Перепиши заголовок ПОЛНОСТЬЮ, используя другие ключевые слова, другую формулировку и другой угол. trigram-similarity должна быть менее ${(titleSimMax * 100).toFixed(0)}%.`,
      measured: titleSim,
      threshold: titleSimMax,
    });
  }

  // 3) H1 similarity (same thresholds)
  const h1Sim = trigramSim(original.h1, optimized.h1);
  if (h1Sim > titleSimMax) {
    failures.push({
      code: 'h1_too_similar',
      message: `H1 trigram similarity ${(h1Sim * 100).toFixed(0)}% > max ${(titleSimMax * 100).toFixed(0)}%.`,
      hint: `Новый H1 слишком похож на старый ("${original.h1}"). Сформулируй H1 заново под ДРУГОЙ интент.`,
      measured: h1Sim,
      threshold: titleSimMax,
    });
  }

  // 4) Target keyword jaccard
  const keywordSim = jaccard(tokens(original.target_keyword), tokens(optimized.target_keyword));
  if (keywordSim > keywordSimMax) {
    failures.push({
      code: 'keyword_too_similar',
      message: `target_keyword token jaccard ${(keywordSim * 100).toFixed(0)}% > max ${(keywordSimMax * 100).toFixed(0)}%.`,
      hint: `target_keyword слишком пересекается со старым ("${original.target_keyword}"). Возьми длинный хвост из 3-5 слов с УНИКАЛЬНЫМИ модификаторами (например: "AI-бот для клиники Telegram ночные заявки" вместо "AI-бот для клиники").`,
      measured: keywordSim,
      threshold: keywordSimMax,
    });
  }

  // 5) Heading structure change
  const origHeadings = headingsOf(original);
  const newHeadings  = headingsOf(optimized);
  let headingSim = 0;
  if (origHeadings.length > 0 && newHeadings.length > 0) {
    headingSim = jaccard(
      origHeadings.flatMap(tokens),
      newHeadings.flatMap(tokens),
    );
  }
  if (headingSim > headingSimMax) {
    failures.push({
      code: 'headings_too_similar',
      message: `H2/H3 jaccard ${(headingSim * 100).toFixed(0)}% > max ${(headingSimMax * 100).toFixed(0)}%.`,
      hint: `Структура H2/H3 слишком повторяет оригинал. Перепиши заголовки разделов так, чтобы они отражали НОВЫЙ угол статьи (см. recommended_angle в задании). Минимум половина H2 должна быть новыми.`,
      measured: headingSim,
      threshold: headingSimMax,
    });
  }

  // 6) Conflict-specific checks. Top conflict must NOT still match the
  //    optimised article on (intent, funnel, audience, industry, money_page).
  const top = conflicts[0];
  if (top) {
    const topTitleSim = trigramSim(optimized.meta_title, top.title);
    if (topTitleSim > titleSimMax) {
      failures.push({
        code: 'still_conflicts_top_peer',
        message: `meta_title still similar to top peer "${top.title}" at ${(topTitleSim * 100).toFixed(0)}%.`,
        hint: `Новый meta_title всё ещё похож на конфликтующую страницу "${top.title}" (${top.url || top.id}). Меняй угол: подставляй уникальную аудиторию, отрасль или сценарий, которого НЕТ в этой странице.`,
        measured: topTitleSim,
        threshold: titleSimMax,
      });
    }
    if (top.source_type === 'money_page' && optimizedFingerprint.search_intent === 'commercial-buy') {
      failures.push({
        code: 'still_conflicts_money_page',
        message: `Money page conflict still on commercial intent.`,
        hint: `Конфликт с money page "${top.url}". Money page всегда забирает коммерческий запрос. Переведи статью в informational (search_intent="informational-howto" или "informational-list") и сделай её поддерживающей, а НЕ конкурирующей.`,
      });
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    fingerprintDimsChanged,
    titleSim,
    keywordSim,
    headingSim,
  };
}

/** Convert failures into a single feedback block for the next LLM call. */
export function failuresAsFeedback(failures: ConstraintFailure[]): string {
  if (failures.length === 0) return '';
  const lines = failures.map((f, i) => `${i + 1}. [${f.code}] ${f.hint}`);
  return [
    'ПРЕДЫДУЩАЯ ПОПЫТКА НЕ ПРОШЛА ПРОВЕРКУ:',
    ...lines,
    '',
    'Учти ВСЕ эти замечания в новой версии. Не повторяй ошибки прошлой итерации.',
  ].join('\n');
}
