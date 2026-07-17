// GPTBot Tahlil structured transcript analysis + local scientific safety gate.
// P0 analyzes text only. It never uses acoustic/emotion features as evidence.
import type { Env } from '../../_types';
import type { TranscriptSegment } from './transcription';
import { buildAnalysisPrompt, TAHLIL_PROMPT_VERSION } from './analysis-prompt';

export const TAHLIL_CONSENT_VERSION = 'tahlil-consent-v1';

export type FindingConfidence = 'high' | 'medium' | 'low';
export type ClaimKind = 'fact' | 'promise' | 'price' | 'date' | 'availability' | 'other';

export interface AnalysisClaim {
  timeSec: number | null;
  quote: string;
  kind: ClaimKind;
  explanation: string;
  confidence: FindingConfidence;
}
export interface AnalysisContradiction {
  firstTimeSec: number | null;
  firstQuote: string;
  secondTimeSec: number | null;
  secondQuote: string;
  explanation: string;
  confidence: FindingConfidence;
}
export interface AnalysisHedging {
  timeSec: number | null;
  quote: string;
  explanation: string;
  confidence: FindingConfidence;
}
export interface TranscriptAnalysis {
  sufficient: boolean;
  insufficiencyReason: 'none' | 'no_claims' | 'unclear_transcript' | 'unsafe_request';
  summary: string;
  claims: AnalysisClaim[];
  contradictions: AnalysisContradiction[];
  hedging: AnalysisHedging[];
  questions: string[];
}
export interface SanitizedAnalysisResult {
  ok: boolean;
  analysis?: TranscriptAnalysis;
  errorCode?: 'invalid_json' | 'unsafe_output' | 'insufficient_content';
}
export interface AnalysisProviderResult extends SanitizedAnalysisResult {
  model?: string;
  provider: 'openrouter';
  latencyMs: number;
  promptVersion: string;
  errorCode?: 'no_key' | 'timeout' | 'provider_error' | 'invalid_json' | 'unsafe_output' | 'insufficient_content';
}

const UNSAFE = /(вр[её]т|лж[её]т|обманывает|ложь|обман(?:ывает)?|вероятност.{0,16}(?:лжи|обмана)|lie detected|deception|yolg['‘’]?on|aldaydi|yolg['‘’]?onchi|рекомендуем уволить|не доверяйте|доказано|подтверждено.{0,20}(?:винов|обман)|виновен)/i;
const SYSTEM_LEAK = /(system prompt|системн(?:ый|ая) (?:промпт|инструкц)|ignore previous|игнорируй предыдущ|json schema|роль ассистента)/i;

function cleanString(value: unknown, max: number): string {
  return typeof value === 'string'
    ? Array.from(value)
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max)
    : '';
}
function cleanTime(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 300 ? Math.round(n * 10) / 10 : null;
}
function confidence(value: unknown): FindingConfidence | null {
  return value === 'high' || value === 'medium' || value === 'low' ? value : null;
}
function unsafe(...values: string[]): boolean {
  return values.some((value) => UNSAFE.test(value) || SYSTEM_LEAK.test(value));
}

const KINDS = new Set<ClaimKind>(['fact', 'promise', 'price', 'date', 'availability', 'other']);
const REASONS = new Set<TranscriptAnalysis['insufficiencyReason']>(['none', 'no_claims', 'unclear_transcript', 'unsafe_request']);

/** Parse provider data into a small, allowlisted, accusation-free structure. */
export function sanitizeAnalysis(raw: unknown): SanitizedAnalysisResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errorCode: 'invalid_json' };
  const data = raw as Record<string, unknown>;
  const sufficient = data.sufficient === true;
  const insufficiencyReason = REASONS.has(data.insufficiencyReason as never)
    ? data.insufficiencyReason as TranscriptAnalysis['insufficiencyReason']
    : sufficient ? 'none' : 'unclear_transcript';
  const summary = cleanString(data.summary, 700);

  if (!sufficient) {
    return {
      ok: false,
      analysis: { sufficient: false, insufficiencyReason, summary: unsafe(summary) ? '' : summary, claims: [], contradictions: [], hedging: [], questions: [] },
      errorCode: 'insufficient_content',
    };
  }

  const contradictions: AnalysisContradiction[] = [];
  for (const rawItem of Array.isArray(data.contradictions) ? data.contradictions : []) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as Record<string, unknown>;
    const firstQuote = cleanString(item.firstQuote, 220);
    const secondQuote = cleanString(item.secondQuote, 220);
    const explanation = cleanString(item.explanation, 300);
    if (confidence(item.confidence) !== 'high' || !firstQuote || !secondQuote || !explanation || unsafe(firstQuote, secondQuote, explanation)) continue;
    contradictions.push({
      firstTimeSec: cleanTime(item.firstTimeSec), firstQuote,
      secondTimeSec: cleanTime(item.secondTimeSec), secondQuote,
      explanation, confidence: 'high',
    });
  }

  const claims: AnalysisClaim[] = [];
  for (const rawItem of Array.isArray(data.claims) ? data.claims : []) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as Record<string, unknown>;
    const quote = cleanString(item.quote, 220);
    const explanation = cleanString(item.explanation, 300);
    const level = confidence(item.confidence);
    const kind = KINDS.has(item.kind as ClaimKind) ? item.kind as ClaimKind : 'other';
    if (level !== 'high' || !quote || !explanation || unsafe(quote, explanation)) continue;
    claims.push({ timeSec: cleanTime(item.timeSec), quote, kind, explanation, confidence: 'high' });
  }

  const hedging: AnalysisHedging[] = [];
  for (const rawItem of Array.isArray(data.hedging) ? data.hedging : []) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as Record<string, unknown>;
    const quote = cleanString(item.quote, 220);
    const explanation = cleanString(item.explanation, 300);
    const level = confidence(item.confidence);
    if ((level !== 'high' && level !== 'medium') || !quote || !explanation || unsafe(quote, explanation)) continue;
    hedging.push({ timeSec: cleanTime(item.timeSec), quote, explanation, confidence: level });
  }

  // At most five total markers: strongest contradictions, grounded claims,
  // then neutral uncertainty wording.
  let remaining = 5;
  const safeContradictions = contradictions.slice(0, remaining); remaining -= safeContradictions.length;
  const safeClaims = claims.slice(0, remaining); remaining -= safeClaims.length;
  const safeHedging = hedging.slice(0, remaining);

  const questions: string[] = [];
  for (const value of Array.isArray(data.questions) ? data.questions : []) {
    const question = cleanString(value, 300);
    if (!question || unsafe(question) || questions.includes(question)) continue;
    questions.push(question);
    if (questions.length === 5) break;
  }

  const safeSummary = unsafe(summary) ? '' : summary;
  if (!safeSummary && safeClaims.length + safeContradictions.length + safeHedging.length === 0 && questions.length === 0) {
    return { ok: false, errorCode: 'unsafe_output' };
  }
  return {
    ok: true,
    analysis: {
      sufficient: true, insufficiencyReason: 'none', summary: safeSummary,
      claims: safeClaims, contradictions: safeContradictions, hedging: safeHedging, questions,
    },
  };
}

export function parseStoredSegments(raw: string | null | undefined): TranscriptSegment[] {
  if (!raw) return [];
  try {
    const values = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return values.slice(0, 500).flatMap((value): TranscriptSegment[] => {
      if (!value || typeof value !== 'object') return [];
      const item = value as Record<string, unknown>;
      const start = Number(item.start); const end = Number(item.end); const text = cleanString(item.text, 600);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end > 301 || !text) return [];
      const result: TranscriptSegment = { start, end, text };
      const avgLogprob = Number(item.avgLogprob); const noSpeechProb = Number(item.noSpeechProb);
      if (Number.isFinite(avgLogprob)) result.avgLogprob = avgLogprob;
      if (Number.isFinite(noSpeechProb)) result.noSpeechProb = noSpeechProb;
      return [result];
    });
  } catch { return []; }
}

export function isLieDetectionQuestion(text: string): boolean {
  const t = text.trim();
  const ru = /(?:^|\b)(?:он|она|они|человек|клиент|муж|жена|как понять|определи|скажи).{0,45}(?:вр[её]т|лж[её]т|говорит правду|обманывает).*(?:\?|или|ли\b|правд)/i;
  const uz = /(?:u|odam|mijoz).{0,40}(?:yolg['‘’]?on|aldayapt|rost gapir).*(?:mi|\?)/i;
  const en = /(?:is (?:he|she)|are they|tell me).{0,30}(?:lying|telling the truth|deceiving)/i;
  return ru.test(t) || uz.test(t) || en.test(t);
}

export type HarmfulUseCategory = 'child' | 'legal' | 'employment' | 'infidelity';
export function harmfulUseCategory(text: string): HarmfulUseCategory | null {
  const t = text.toLowerCase();
  if (/(для суда|в суде|судебн|доказательств.{0,30}суд|sud uchun|sudda)/i.test(t)) return 'legal';
  if (/(реб[её]н|сын|дочь|bola|farzand).{0,50}(проверь|допрос|вр[её]т|лж[её]т|yolg['‘’]?on|alday)/i.test(t)) return 'child';
  if (/(увол|наказ|лишить|ишдан бўшат|ishdan bo['‘’]?shat).{0,50}(вр[её]т|обман|yolg['‘’]?on|alday)/i.test(t)) return 'employment';
  if (/(доказать|проверить|определи|isbot).{0,45}(измен|неверност|xiyonat)/i.test(t)) return 'infidelity';
  return null;
}

const ANALYSIS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    sufficient: { type: 'boolean' },
    insufficiencyReason: { type: 'string', enum: ['none', 'no_claims', 'unclear_transcript', 'unsafe_request'] },
    summary: { type: 'string' },
    claims: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, properties: {
      timeSec: { type: ['number', 'null'] }, quote: { type: 'string' }, kind: { type: 'string', enum: [...KINDS] },
      explanation: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    }, required: ['timeSec', 'quote', 'kind', 'explanation', 'confidence'] } },
    contradictions: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, properties: {
      firstTimeSec: { type: ['number', 'null'] }, firstQuote: { type: 'string' }, secondTimeSec: { type: ['number', 'null'] },
      secondQuote: { type: 'string' }, explanation: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    }, required: ['firstTimeSec', 'firstQuote', 'secondTimeSec', 'secondQuote', 'explanation', 'confidence'] } },
    hedging: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, properties: {
      timeSec: { type: ['number', 'null'] }, quote: { type: 'string' }, explanation: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    }, required: ['timeSec', 'quote', 'explanation', 'confidence'] } },
    questions: { type: 'array', maxItems: 8, items: { type: 'string' } },
  },
  required: ['sufficient', 'insufficiencyReason', 'summary', 'claims', 'contradictions', 'hedging', 'questions'],
} as const;

export async function analyzeTranscript(
  env: Env,
  transcript: string,
  language: 'ru' | 'uz' | 'other',
  segments: TranscriptSegment[],
  timeoutMs: number,
): Promise<AnalysisProviderResult> {
  const startedAt = Date.now();
  if (!env.OPENROUTER_API_KEY) return { ok: false, provider: 'openrouter', latencyMs: 0, promptVersion: TAHLIL_PROMPT_VERSION, errorCode: 'no_key' };
  const prompt = buildAnalysisPrompt(transcript, language, segments);
  const model = env.OPENROUTER_MODEL_ANALYSIS || 'openai/gpt-4o-mini';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(timeoutMs, 1_000), 15_000));
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': (env.SITE_URL || env.OPENROUTER_SITE_URL || 'https://gptbot.uz').replace(/\/+$/, ''),
        'X-Title': 'GPTBot Tahlil',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
        temperature: 0.1,
        max_tokens: 1_800,
        provider: { require_parameters: true },
        response_format: { type: 'json_schema', json_schema: { name: 'tahlil_analysis', strict: true, schema: ANALYSIS_SCHEMA } },
      }),
    });
    if (!response.ok) return { ok: false, provider: 'openrouter', model, latencyMs: Date.now() - startedAt, promptVersion: prompt.promptVersion, errorCode: 'provider_error' };
    const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return { ok: false, provider: 'openrouter', model, latencyMs: Date.now() - startedAt, promptVersion: prompt.promptVersion, errorCode: 'invalid_json' };
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { return { ok: false, provider: 'openrouter', model, latencyMs: Date.now() - startedAt, promptVersion: prompt.promptVersion, errorCode: 'invalid_json' }; }
    const safe = sanitizeAnalysis(parsed);
    return { ...safe, provider: 'openrouter', model, latencyMs: Date.now() - startedAt, promptVersion: prompt.promptVersion };
  } catch (error) {
    return {
      ok: false, provider: 'openrouter', model, latencyMs: Date.now() - startedAt, promptVersion: prompt.promptVersion,
      errorCode: (error as Error).name === 'AbortError' ? 'timeout' : 'provider_error',
    };
  } finally { clearTimeout(timer); }
}
