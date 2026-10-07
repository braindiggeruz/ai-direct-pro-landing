/**
 * Runs the photo tool's evaluation set against the real vision chain and
 * scores it (spec §8.3 gate; DECISIONS 07.10.2026 §13 п. 7).
 *
 *   npx tsx apps/studio/scripts/photo-eval.ts --set <dir> [--key-file <path>]
 *        [--concurrency 2] [--models zai/glm-5.3-flash,zai/glm-4.6v-flash]
 *        [--mode explain|math] [--out <results.json>]
 *
 * <dir> holds the pictures and answers.json (photo-eval-set.ts). Every
 * picture goes through exactly the server's path short of HTTP: the
 * metadata cut (image-meta.ts), then lib/studio/photo.ts explainPhoto with
 * the production prompt, chain, limits and retries. At most `concurrency`
 * (2) pictures are in flight, as the plan asks. The key is read from
 * ZAI_API_KEY or `--key-file` into the process only; it is never printed,
 * logged or written. The results file carries the answers and the numbers,
 * never a picture.
 *
 * Scoring, per picture: the outcome (answer, unreadable, refused, a fault),
 * whether every expected token stands in the model's `answer` field
 * (numbers compared without thousands spaces and with . for ,), whether the
 * text is Uzbek in the Latin script, the time, the calls, the shadow cost.
 * Summary: the share of right final answers for printed and «handwritten»
 * pictures, the unreadable ones recognised, p50 / p90 of the time, cost.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseStudioConfig } from '../../../functions/lib/studio/config';
import { stripImageMetadata } from '../../../functions/lib/studio/image-meta';
import { explainPhoto, type PhotoMode } from '../../../functions/lib/studio/photo';
import { uzbekLatinProblem } from '../../../functions/lib/studio/photo-schema';
import { UZS_PER_USD } from '../../../functions/lib/studio/pricing';

export interface EvalAnswerRecord {
  readonly kind: 'printed' | 'handwritten' | 'unreadable';
  readonly subject: string;
  readonly task?: string;
  readonly answer: string;
  readonly answerTokens: readonly string[];
  readonly expectUnreadable?: boolean;
}

export interface EvalRow {
  readonly file: string;
  readonly kind: EvalAnswerRecord['kind'];
  readonly subject: string;
  readonly expected: string;
  readonly outcome: 'answer' | 'unreadable' | 'refused' | 'halted' | `fault:${string}`;
  /** Every expected token stands in the model's `answer` field (or the picture was expected unreadable and is). */
  readonly correct: boolean;
  /** The tokens stand somewhere in the explanation (steps or answer) but not all in `answer`. */
  readonly partial: boolean;
  readonly latin: boolean | null;
  readonly confidence: string | null;
  readonly subjectSeen: string | null;
  readonly model: string | null;
  readonly effort: string | null;
  readonly calls: number;
  readonly ms: number;
  readonly costMicro: number;
  readonly answerText: string | null;
  readonly stepsText: string | null;
  readonly soft: readonly string[];
}

export interface EvalSummary {
  readonly total: number;
  readonly byKind: Record<string, { total: number; correct: number; partial: number; share: number }>;
  readonly unreadableRecognised: { total: number; recognised: number };
  readonly falseUnreadable: number;
  readonly faults: number;
  readonly latinShare: number;
  readonly p50Ms: number;
  readonly p90Ms: number;
  readonly maxMs: number;
  readonly costMicro: number;
  readonly costUzs: number;
  readonly costPerAnswerUzs: number;
  readonly models: Record<string, number>;
  readonly gate: { printed: boolean; handwritten: boolean; unreadable: boolean; p90: boolean; latin: boolean; passed: boolean };
}

/** The thresholds of spec §8.3. */
export const GATE = { printed: 0.8, handwritten: 0.65, p90Ms: 20_000 } as const;

/** Lower case, NFC, one apostrophe sign, numbers without thousands spaces and with a dot. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’ʻʼ`]/g, "'")
    .replace(/−/g, '-')
    .replace(/(?<=\d)[\s  ](?=\d{3}(?!\d))/g, '')
    .replace(/(?<=\d),(?=\d)/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A token stands in `text`: a number as a whole number (not inside another number or fraction), a word as a whole word. */
export function hasToken(text: string, token: string): boolean {
  const needle = normalizeForMatch(token);
  const haystack = normalizeForMatch(text);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const numeric = /^[\d./]+$/.test(needle);
  const pattern = numeric ? `(?<![\\d./,])${escaped}(?![\\d./,])` : `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`;
  return new RegExp(pattern, 'u').test(haystack);
}

function percentile(values: number[], share: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function summarize(rows: readonly EvalRow[]): EvalSummary {
  const byKind: EvalSummary['byKind'] = {};
  for (const kind of ['printed', 'handwritten', 'unreadable'] as const) {
    const of = rows.filter((row) => row.kind === kind);
    const correct = of.filter((row) => row.correct).length;
    byKind[kind] = { total: of.length, correct, partial: of.filter((row) => row.partial).length, share: of.length ? correct / of.length : 0 };
  }
  const unreadable = rows.filter((row) => row.kind === 'unreadable');
  const readable = rows.filter((row) => row.kind !== 'unreadable');
  const latinRows = readable.filter((row) => row.latin !== null);
  const times = rows.map((row) => row.ms);
  const models: Record<string, number> = {};
  for (const row of rows) if (row.model) models[row.model] = (models[row.model] ?? 0) + 1;
  const costMicro = rows.reduce((sum, row) => sum + row.costMicro, 0);
  const answers = rows.filter((row) => row.outcome === 'answer').length;
  const gate = {
    printed: byKind.printed.total > 0 && byKind.printed.share >= GATE.printed,
    handwritten: byKind.handwritten.total > 0 && byKind.handwritten.share >= GATE.handwritten,
    unreadable: unreadable.length > 0 && unreadable.every((row) => row.correct),
    p90: percentile(times, 0.9) <= GATE.p90Ms,
    latin: latinRows.length > 0 && latinRows.every((row) => row.latin === true),
    passed: false,
  };
  gate.passed = gate.printed && gate.handwritten && gate.unreadable && gate.p90 && gate.latin;
  return {
    total: rows.length,
    byKind,
    unreadableRecognised: { total: unreadable.length, recognised: unreadable.filter((row) => row.outcome === 'unreadable').length },
    falseUnreadable: readable.filter((row) => row.outcome === 'unreadable').length,
    faults: rows.filter((row) => row.outcome.startsWith('fault') || row.outcome === 'halted').length,
    latinShare: latinRows.length ? latinRows.filter((row) => row.latin).length / latinRows.length : 0,
    p50Ms: percentile(times, 0.5),
    p90Ms: percentile(times, 0.9),
    maxMs: Math.max(0, ...times),
    costMicro,
    costUzs: (costMicro / 1_000_000) * UZS_PER_USD,
    costPerAnswerUzs: answers ? ((costMicro / 1_000_000) * UZS_PER_USD) / answers : 0,
    models,
    gate,
  };
}

/** The markdown table of the rows, for the report. */
export function markdownTable(rows: readonly EvalRow[]): string {
  const lines = ['| # | Файл | Вид | Предмет | Ожидание | Исход | Верно | Уверенность | Модель | с | сум |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  rows.forEach((row, i) => {
    const got = row.outcome === 'answer' ? (row.answerText ?? '').replace(/\|/g, '/').slice(0, 60) : row.outcome;
    const verdict = row.correct ? '✔' : row.partial ? '≈ (в шагах)' : '✖';
    lines.push(`| ${i + 1} | ${row.file} | ${row.kind} | ${row.subject} | ${row.expected.replace(/\|/g, '/')} | ${got} | ${verdict} | ${row.confidence ?? '—'} | ${(row.model ?? '—').replace('zai/', '')}${row.effort === 'medium' ? ' (medium)' : ''} | ${(row.ms / 1000).toFixed(1)} | ${((row.costMicro / 1_000_000) * UZS_PER_USD).toFixed(1)} |`);
  });
  return lines.join('\n');
}

async function evaluateOne(dir: string, file: string, record: EvalAnswerRecord, env: { ZAI_API_KEY: string }, models: string, mode: PhotoMode): Promise<EvalRow> {
  const raw = new Uint8Array(fs.readFileSync(path.join(dir, file)));
  const cleaned = stripImageMetadata(raw);
  if (!cleaned) throw new Error(`${file}: not a JPEG/PNG/WebP the server would accept`);
  const config = parseStudioConfig(JSON.stringify({ STUDIO_VISION_MODELS: models }));
  const started = Date.now();
  const result = await explainPhoto({ env, config, locale: 'uz', mode, mime: cleaned.mime, bytes: cleaned.bytes });
  const ms = Date.now() - started;
  const base = { file, kind: record.kind, subject: record.subject, expected: record.answer, ms, calls: result.calls.length, costMicro: result.costMicro };
  if (!result.ok) {
    const outcome: EvalRow['outcome'] = result.kind === 'refused' ? 'refused' : result.kind === 'halted' ? 'halted' : `fault:${result.code}`;
    return { ...base, outcome, correct: false, partial: false, latin: null, confidence: null, subjectSeen: null, model: result.calls.at(-1)?.model ?? null, effort: null, answerText: null, stepsText: null, soft: [] };
  }
  const { verdict, effort } = result.value;
  if (verdict.unreadable) {
    return { ...base, outcome: 'unreadable', correct: record.expectUnreadable === true, partial: false, latin: null, confidence: null, subjectSeen: null, model: result.model, effort, answerText: null, stepsText: null, soft: [...result.soft] };
  }
  const { answer } = verdict;
  const everything = [answer.given, ...answer.steps, answer.answer, answer.check].join(' ');
  const inAnswer = record.answerTokens.every((token) => hasToken(answer.answer, token));
  const anywhere = record.answerTokens.every((token) => hasToken(everything, token));
  return {
    ...base,
    outcome: 'answer',
    correct: record.expectUnreadable ? false : record.answerTokens.length > 0 && inAnswer,
    partial: !record.expectUnreadable && !inAnswer && anywhere,
    latin: uzbekLatinProblem(everything) === null,
    confidence: answer.confidence,
    subjectSeen: answer.subject,
    model: result.model,
    effort,
    answerText: answer.answer,
    stepsText: answer.steps.join(' | '),
    soft: [...result.soft],
  };
}

export interface EvalRun {
  readonly rows: EvalRow[];
  readonly summary: EvalSummary;
}

export async function runEval(dir: string, env: { ZAI_API_KEY: string }, options: { concurrency?: number; models?: string; mode?: PhotoMode; log?: (line: string) => void } = {}): Promise<EvalRun> {
  const answers = JSON.parse(fs.readFileSync(path.join(dir, 'answers.json'), 'utf8')) as Record<string, EvalAnswerRecord>;
  const files = Object.keys(answers).filter((file) => fs.existsSync(path.join(dir, file)));
  const concurrency = Math.max(1, Math.min(2, options.concurrency ?? 2));
  const models = options.models ?? 'zai/glm-5.3-flash,zai/glm-4.6v-flash';
  const mode = options.mode ?? 'explain';
  const rows: EvalRow[] = new Array(files.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= files.length) return;
      const file = files[index];
      const row = await evaluateOne(dir, file, answers[file], env, models, mode);
      rows[index] = row;
      options.log?.(`${row.correct ? 'OK ' : row.partial ? '~  ' : 'XX '} ${file} ${row.outcome} ${(row.ms / 1000).toFixed(1)}s ${row.model ?? ''}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { rows, summary: summarize(rows) };
}

function argument(name: string): string | null {
  const at = process.argv.indexOf(name);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : null;
}

async function main(): Promise<void> {
  const dir = argument('--set');
  if (!dir) throw new Error('Usage: photo-eval.ts --set <dir> [--key-file <path>] [--concurrency 2] [--models …] [--mode explain|math] [--out <results.json>]');
  const keyFile = argument('--key-file');
  const key = (process.env.ZAI_API_KEY || (keyFile ? fs.readFileSync(keyFile, 'utf8') : '')).trim();
  if (!key) throw new Error('No key: set ZAI_API_KEY or pass --key-file.');
  const modeArg = argument('--mode');
  const run = await runEval(path.resolve(dir), { ZAI_API_KEY: key }, {
    concurrency: Number(argument('--concurrency') ?? 2),
    models: argument('--models') ?? undefined,
    mode: modeArg === 'math' ? 'math' : 'explain',
    log: (line) => console.error(line),
  });
  const out = argument('--out');
  if (out) fs.writeFileSync(path.resolve(out), `${JSON.stringify(run, null, 2)}\n`);
  console.log(markdownTable(run.rows));
  console.log('');
  console.log(JSON.stringify(run.summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'photo eval failed.');
    process.exitCode = 1;
  });
}
