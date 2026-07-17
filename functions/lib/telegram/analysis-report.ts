// Deterministic, localized rendering for GPTBot Tahlil.
// Provider output is sanitized before it reaches this module; no HTML or
// Telegram parse mode is used, so quotes remain inert plain text.
import type { Locale, AnalysisReportRow } from './store';
import type {
  AnalysisClaim,
  AnalysisContradiction,
  AnalysisHedging,
  TranscriptAnalysis,
} from './analysis';
import { sanitizeAnalysis } from './analysis';
import { formatVoiceDuration } from './i18n';

const DISCLAIMER: Record<Locale, string> = {
  ru: 'Важно: это анализ содержания расшифровки, а не детектор лжи. Он не определяет правду, намерения или личность и не является доказательством. Проверяйте важные решения по первичным данным.',
  uz: 'Muhim: bu transkript mazmuni tahlili, yolg‘on detektori emas. U rostlik, niyat yoki shaxsni aniqlamaydi va dalil hisoblanmaydi. Muhim qarorlarni birlamchi ma’lumotlar bilan tekshiring.',
};

function time(value: number | null): string {
  if (value === null) return '—';
  const safe = Math.max(0, Math.floor(value));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function quote(value: string): string {
  return `“${value.replace(/[“”]/g, '"')}”`;
}

function claimLine(item: AnalysisClaim, locale: Locale): string {
  const kind: Record<AnalysisClaim['kind'], Record<Locale, string>> = {
    fact: { ru: 'факт', uz: 'fakt' },
    promise: { ru: 'обещание', uz: 'va’da' },
    price: { ru: 'цена', uz: 'narx' },
    date: { ru: 'дата/срок', uz: 'sana/muddat' },
    availability: { ru: 'наличие', uz: 'mavjudlik' },
    other: { ru: 'утверждение', uz: 'bayonot' },
  };
  const position = item.timeSec === null ? '' : `${time(item.timeSec)} · `;
  return `• ${position}${kind[item.kind][locale]}: ${quote(item.quote)} — ${item.explanation}`;
}

function contradictionLine(item: AnalysisContradiction, locale: Locale): string {
  const separator = locale === 'ru' ? 'против' : 'qarshi';
  const first = item.firstTimeSec === null ? quote(item.firstQuote) : `${time(item.firstTimeSec)} ${quote(item.firstQuote)}`;
  const second = item.secondTimeSec === null ? quote(item.secondQuote) : `${time(item.secondTimeSec)} ${quote(item.secondQuote)}`;
  return `• ${first} ${separator} ${second} — ${item.explanation}`;
}

function hedgingLine(item: AnalysisHedging): string {
  const position = item.timeSec === null ? '' : `${time(item.timeSec)} · `;
  return `• ${position}${quote(item.quote)} — ${item.explanation}`;
}

/** Render a safe Telegram report and always preserve the scientific disclaimer. */
export function formatAnalysisReport(
  analysis: TranscriptAnalysis,
  locale: Locale,
  durationSeconds: number,
  qualityAssessment?: string,
): string {
  const ru = locale === 'ru';
  const lines: string[] = [
    ru ? `🔎 Анализ содержания (${formatVoiceDuration(durationSeconds)})` : `🔎 Mazmun tahlili (${formatVoiceDuration(durationSeconds)})`,
    '',
    ru ? 'Кратко:' : 'Qisqacha:',
    analysis.summary || (ru ? 'В записи обсуждаются конкретные условия, которые стоит проверить.' : 'Yozuvda tekshirish kerak bo‘lgan aniq shartlar muhokama qilinadi.'),
  ];

  if (analysis.claims.length) {
    lines.push('', ru ? 'Что можно проверить:' : 'Nimani tekshirish mumkin:', ...analysis.claims.map((item) => claimLine(item, locale)));
  }
  if (analysis.contradictions.length) {
    lines.push('', ru ? 'Внутренние противоречия:' : 'Ichki qarama-qarshiliklar:', ...analysis.contradictions.map((item) => contradictionLine(item, locale)));
  }
  if (analysis.hedging.length) {
    lines.push('', ru ? 'Неясные или расплывчатые формулировки:' : 'Noaniq yoki mavhum iboralar:', ...analysis.hedging.map(hedgingLine));
  }
  if (!analysis.claims.length && !analysis.contradictions.length && !analysis.hedging.length) {
    lines.push('', ru
      ? 'Явных проверяемых маркеров не найдено. Это не подтверждает и не опровергает сказанное.'
      : 'Aniq tekshiriladigan belgilar topilmadi. Bu aytilgan gapni tasdiqlamaydi ham, inkor etmaydi ham.');
  }

  if (analysis.questions.length) {
    lines.push(
      '',
      ru ? 'Что спросить сначала:' : 'Avval nima so‘rash kerak:',
      ...analysis.questions.slice(0, 2).map((question, index) => `${index + 1}. ${question}`),
    );
  }

  if (qualityAssessment === 'coarse_timestamps') {
    lines.push('', ru
      ? 'Примечание: запись распознана одним крупным фрагментом, поэтому неточные метки 00:00 скрыты.'
      : 'Izoh: yozuv bitta katta bo‘lak sifatida tanildi, shuning uchun noaniq 00:00 belgilari yashirildi.');
  } else if (qualityAssessment === 'transcript_only') {
    lines.push('', ru
      ? 'Примечание: провайдер не вернул таймкоды; анализ выполнен только по тексту.'
      : 'Izoh: provayder taymkodlarni qaytarmadi; tahlil faqat matn bo‘yicha bajarildi.');
  }

  const footer = `\n\n${DISCLAIMER[locale]}`;
  const body = lines.join('\n');
  return `${body.slice(0, Math.max(0, 3900 - footer.length))}${footer}`;
}

/** Re-sanitize retained JSON before displaying a cached report. */
export function analysisFromStored(row: AnalysisReportRow): TranscriptAnalysis | null {
  const parsed = {
    sufficient: true,
    insufficiencyReason: 'none',
    summary: row.summary,
    claims: parseArray(row.claims_json),
    contradictions: parseArray(row.contradictions_json),
    hedging: parseArray(row.hedging_json),
    questions: parseArray(row.questions_json),
  };
  const safe = sanitizeAnalysis(parsed);
  return safe.ok && safe.analysis ? safe.analysis : null;
}

function parseArray(raw: string): unknown[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function formatVerificationQuestions(questions: string[], locale: Locale): string {
  if (!questions.length) {
    return locale === 'ru'
      ? 'Для этой записи уточняющие вопросы не сформированы.'
      : 'Bu yozuv uchun aniqlashtiruvchi savollar tuzilmadi.';
  }
  const heading = locale === 'ru' ? 'Вопросы для проверки:' : 'Tekshirish uchun savollar:';
  return `${heading}\n\n${questions.slice(0, 5).map((question, index) => `${index + 1}. ${question}`).join('\n')}`.slice(0, 3900);
}
