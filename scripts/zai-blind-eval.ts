// Blind A/B probe: Z.ai GLM against the model the web chat uses today.
//
//   node --import tsx scripts/zai-blind-eval.ts --dry-run          # validate + plan, no network
//   node --import tsx scripts/zai-blind-eval.ts                    # free: zai/glm-4.7-flash vs OpenRouter free primary
//   node --import tsx scripts/zai-blind-eval.ts --paid             # paid: zai/glm-4.5-air vs mistral-small-3.2
//   node --import tsx scripts/zai-blind-eval.ts --paid --seed=42   # reproducible A/B assignment
//   node --import tsx scripts/zai-blind-eval.ts --baseline=nvidia/nemotron-3-super-120b-a12b:free
//                                                                  # another OpenRouter baseline
//
// Live mode needs ZAI_API_KEY and OPENROUTER_API_KEY in the environment (set
// them in the shell for this one command; they are never printed or written).
// It spends real money only in --paid mode (a few cents at most: 20 prompts,
// ≤900 output tokens each, on models priced in functions/lib/gpt-chat/model-pricing.ts).
//
// It answers the roadmap's question "Z.ai or as is?" with evidence, not taste:
//   - the production system prompt (buildMessages) and the production provider
//     code (chatComplete) with a single-model chain, so the request each model
//     sees is exactly the one the chat would send;
//   - no database: env.GPTBOT_DRAFTS_DB is undefined, so nothing is written to
//     model health and the probe cannot cool a production model down;
//   - sequential, 1500 ms apart (GLM Flash models reportedly allow about one
//     concurrent request);
//   - a seeded shuffle decides, per prompt, which model is "A" and which is
//     "B". The rating sheet shows only A/B; the mapping goes to a separate
//     …-key.json that the rater opens after scoring.
//
// Output: docs/paid-chat/eval/zai-blind-eval-<YYYY-MM-DD>-<tier>.md (rating
// sheet with empty 1–5 columns: correctness, Uzbek/Russian quality,
// usefulness) and docs/paid-chat/eval/zai-blind-eval-<YYYY-MM-DD>-<tier>-key.json.
// The tier is part of the name so a free and a paid run on the same day do
// not overwrite each other.
import fs from 'node:fs';
import path from 'node:path';
import type { Env } from '../functions/_types';
import { resolveConfig } from '../functions/lib/gpt-chat/config';
import { buildMessages } from '../functions/lib/gpt-chat/prompt';
import { chatComplete, type ChatResult } from '../functions/lib/gpt-chat/openrouter-chat';
import { providerOf } from '../functions/lib/gpt-chat/model-provider';

type Lang = 'uz' | 'ru';
type Tier = 'free' | 'paid';

interface EvalPrompt {
  id: string;
  lang: Lang;
  category: string;
  prompt: string;
  reference?: string;
}

interface Fixture {
  version: string;
  prompts: EvalPrompt[];
}

interface Answer {
  model: string;
  ok: boolean;
  content: string;
  errorCode?: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

const ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURE = path.join(ROOT, 'scripts/fixtures/zai-blind-eval-prompts.json');
const OUT_DIR = path.join(ROOT, 'docs/paid-chat/eval');
const REQUIRED_CATEGORIES = ['advice', 'homework', 'instagram', 'translation', 'letter', 'recipe', 'cv', 'code', 'math', 'honesty'];
const GAP_MS = 1500;
const MAX_TOKENS = 900;
const TURN_TIMEOUT_MS = 45_000;
const PAID_BASELINE = 'mistralai/mistral-small-3.2-24b-instruct';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TIER: Tier = args.includes('--paid') ? 'paid' : 'free';
const seedArg = args.find((a) => a.startsWith('--seed='))?.slice('--seed='.length);
const baselineArg = args.find((a) => a.startsWith('--baseline='))?.slice('--baseline='.length).trim();

// ── Fixture validation ──────────────────────────────────────────────────────
function validate(fixture: Fixture): string[] {
  const problems: string[] = [];
  const prompts = Array.isArray(fixture.prompts) ? fixture.prompts : [];
  if (prompts.length !== 20) problems.push(`need exactly 20 prompts, have ${prompts.length}`);
  const ids = new Set<string>();
  for (const p of prompts) {
    if (!p.id || ids.has(p.id)) problems.push(`duplicate or empty id: ${p.id}`);
    ids.add(p.id);
    if (p.lang !== 'uz' && p.lang !== 'ru') problems.push(`${p.id}: lang must be uz or ru`);
    if (!p.prompt?.trim()) problems.push(`${p.id}: empty prompt`);
    if (p.prompt && p.prompt.length > 3000) problems.push(`${p.id}: longer than the chat's 3000-char input limit`);
    // Uzbek prompts must be Latin script (the chat answers Uzbek in Latin only).
    if (p.lang === 'uz' && /[Ѐ-ӿ]/u.test(p.prompt ?? '')) problems.push(`${p.id}: Uzbek prompt contains Cyrillic`);
    if (p.lang === 'ru' && !/[Ѐ-ӿ]/u.test(p.prompt ?? '')) problems.push(`${p.id}: Russian prompt has no Cyrillic`);
  }
  for (const lang of ['uz', 'ru'] as const) {
    const own = prompts.filter((p) => p.lang === lang);
    if (own.length !== 10) problems.push(`need 10 ${lang} prompts, have ${own.length}`);
    for (const category of REQUIRED_CATEGORIES)
      if (!own.some((p) => p.category === category)) problems.push(`${lang}: missing category ${category}`);
  }
  return problems;
}

// ── Seeded shuffle (mulberry32) ─────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(value: string | undefined): number {
  if (value && /^\d{1,9}$/.test(value)) return Number(value);
  // Unpredictable by default so the rater cannot infer the mapping from a
  // habit; the chosen seed is recorded in the key file.
  return Math.floor(Math.random() * 1_000_000_000);
}

// ── Markdown helpers ────────────────────────────────────────────────────────
function fenced(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}

function describe(answer: Answer): string {
  const seconds = (answer.latencyMs / 1000).toFixed(1);
  const tokens =
    answer.inputTokens !== undefined || answer.outputTokens !== undefined
      ? `${answer.inputTokens ?? '?'} → ${answer.outputTokens ?? '?'} токенов`
      : 'токены: нет данных';
  return answer.ok ? `${seconds} с · ${tokens}` : `${seconds} с · ОШИБКА ${answer.errorCode ?? 'unknown'}`;
}

// ── Main ────────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');

async function ask(env: Env, model: string, prompt: EvalPrompt): Promise<Answer> {
  const cfg = resolveConfig(env);
  const messages = buildMessages([], prompt.prompt, cfg.maxHistoryTurns, prompt.lang);
  const started = Date.now();
  let result: ChatResult;
  try {
    result = await chatComplete(env, cfg, [model], messages, MAX_TOKENS, TURN_TIMEOUT_MS);
  } catch {
    result = { ok: false, errorCode: 'provider_error' };
  }
  return {
    model,
    ok: result.ok,
    content: result.ok ? result.content ?? '' : '',
    errorCode: result.errorCode,
    latencyMs: Date.now() - started,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

async function main(): Promise<number> {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as Fixture;
  const problems = validate(fixture);
  if (problems.length) {
    for (const problem of problems) console.error(`✗ ${problem}`);
    return 1;
  }
  const uz = fixture.prompts.filter((p) => p.lang === 'uz').length;
  console.log(`✓ fixture ${fixture.version}: ${fixture.prompts.length} prompts (uz=${uz}, ru=${fixture.prompts.length - uz})`);

  // Model ids come from the production config (defaults, or the same public
  // env vars the chat reads), never from a key.
  const env = { ...process.env, GPTBOT_DRAFTS_DB: undefined } as unknown as Env;
  const cfg = resolveConfig(env);
  const zaiModel = `zai/${TIER === 'free' ? cfg.zaiModelFree : cfg.zaiModelPaid}`;
  const baseline = baselineArg || (TIER === 'free' ? cfg.freeModel : PAID_BASELINE);
  if (providerOf(baseline) !== 'openrouter' || !/^[a-z0-9._-]+\/[a-z0-9._:-]+$/.test(baseline)) {
    console.error(`✗ baseline ${baseline} is not an OpenRouter model id`);
    return 1;
  }
  // The free tier may only compare $0 models: that is what it would serve.
  if (TIER === 'free' && !baseline.endsWith(':free')) {
    console.error(`✗ the free-tier baseline must be a :free model, got ${baseline}`);
    return 1;
  }
  const date = new Date().toISOString().slice(0, 10);
  const sheet = path.join(OUT_DIR, `zai-blind-eval-${date}-${TIER}.md`);
  const keyFile = path.join(OUT_DIR, `zai-blind-eval-${date}-${TIER}-key.json`);
  const calls = fixture.prompts.length * 2;
  console.log(`plan: tier=${TIER}; models ${zaiModel} vs ${baseline}; ${calls} sequential requests, ${GAP_MS} ms apart (≈${Math.ceil((calls * GAP_MS) / 1000)} s of pauses + answer time)`);
  console.log(`plan: rating sheet → ${rel(sheet)}`);
  console.log(`plan: A/B key     → ${rel(keyFile)}`);

  if (DRY_RUN) {
    console.log('dry run: no network request was made.');
    return 0;
  }
  const missing = ['ZAI_API_KEY', 'OPENROUTER_API_KEY'].filter((name) => !process.env[name]);
  if (missing.length) {
    console.log(`Not run: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set in this shell. Set the key(s) for this command only and run again; nothing was called.`);
    return 0;
  }

  const seed = seedFrom(seedArg);
  const random = mulberry32(seed);
  const rows: Array<{ prompt: EvalPrompt; a: Answer; b: Answer }> = [];
  let first = true;
  for (const prompt of fixture.prompts) {
    const zaiIsA = random() < 0.5;
    const order = zaiIsA ? [zaiModel, baseline] : [baseline, zaiModel];
    const answers: Answer[] = [];
    // Alternate which model goes first so a warm cache never favours one side.
    for (const model of random() < 0.5 ? order : [...order].reverse()) {
      if (!first) await sleep(GAP_MS);
      first = false;
      answers.push(await ask(env, model, prompt));
    }
    const byModel = new Map(answers.map((answer) => [answer.model, answer]));
    rows.push({ prompt, a: byModel.get(order[0])!, b: byModel.get(order[1])! });
    // Progress without the answer text and without any model name.
    console.log(`${prompt.id}: A ${rows.at(-1)!.a.ok ? 'ok' : 'error'}, B ${rows.at(-1)!.b.ok ? 'ok' : 'error'}`);
  }

  const md: string[] = [
    `# Слепая проба Z.ai — ${date} (${TIER === 'free' ? 'бесплатный уровень' : 'платный уровень'})`,
    '',
    'Какая модель — «A», а какая — «B», решено случайно для каждого вопроса. Не открывайте файл-ключ, пока не заполните все оценки.',
    '',
    'Оценки от 1 до 5: **Правильность** (факты, расчёты, код), **Язык** (грамотный узбекский латиницей или русский, без смешения), **Польза** (можно ли сразу использовать ответ).',
    '',
    `Системный промпт — рабочий промпт чата (buildMessages). Лимит ответа ${MAX_TOKENS} токенов. Вопросов: ${rows.length}.`,
    '',
  ];
  for (const [index, row] of rows.entries()) {
    md.push(`## ${index + 1}. ${row.prompt.id} · ${row.prompt.lang.toUpperCase()} · ${row.prompt.category}`, '');
    md.push('**Вопрос**', '', fenced(row.prompt.prompt), '');
    if (row.prompt.reference) md.push(`*Ориентир для оценщика:* ${row.prompt.reference}`, '');
    if (row.prompt.category === 'honesty')
      md.push('*Проверка честности:* ответ не должен называть себя ChatGPT или OpenAI.', '');
    md.push(`**Ответ A** — ${describe(row.a)}`, '', fenced(row.a.ok ? row.a.content : '(нет ответа)'), '');
    md.push(`**Ответ B** — ${describe(row.b)}`, '', fenced(row.b.ok ? row.b.content : '(нет ответа)'), '');
    md.push('| | Правильность (1–5) | Язык UZ/RU (1–5) | Польза (1–5) | Комментарий |', '|---|---|---|---|---|', '| A | | | | |', '| B | | | | |', '');
  }
  md.push('## Итог', '', '| | Сумма: правильность | Сумма: язык | Сумма: польза | Ошибок |', '|---|---|---|---|---|', '| A | | | | |', '| B | | | | |', '');

  const key = {
    date,
    tier: TIER,
    seed,
    fixtureVersion: fixture.version,
    models: [zaiModel, baseline],
    note: 'Open only after every rating is filled in. "A"/"B" differ per prompt.',
    mapping: rows.map((row) => ({
      id: row.prompt.id,
      A: row.a.model,
      B: row.b.model,
      errors: { A: row.a.errorCode ?? null, B: row.b.errorCode ?? null },
    })),
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(sheet, md.join('\n'), 'utf8');
  fs.writeFileSync(keyFile, `${JSON.stringify(key, null, 2)}\n`, 'utf8');
  console.log(`✓ rating sheet → ${rel(sheet)}`);
  console.log(`✓ A/B key     → ${rel(keyFile)}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`✗ ${(error as Error).name}: ${(error as Error).message}`);
    process.exit(1);
  },
);
