// GPTBot Javob — quality evaluation harness.
//
//   npx tsx scripts/javob-eval.ts            # offline: case-file integrity + classifier sanity
//   npx tsx scripts/javob-eval.ts --live     # live: generate via OPENROUTER_API_KEY and score
//
// Live mode calls the real provider (costs money, needs OPENROUTER_API_KEY in
// env), runs every case through buildJavobReplyPrompt → chatComplete →
// validateReply + property checks, and prints a pass table plus a markdown
// manual-scoring sheet (fill in: отправил бы без правок / нужна правка /
// не использовал бы). Target: ≥70% of replies sendable without meaningful edits.
import fs from 'node:fs';
import path from 'node:path';
import { buildJavobReplyPrompt, guessLanguage } from '../functions/lib/telegram/prompts';
import { classifyMessage } from '../functions/lib/telegram/classify';
import { validateReply } from '../functions/lib/telegram/validator';
import { resolveConfig, modelChain } from '../functions/lib/gpt-chat/config';
import { chatComplete } from '../functions/lib/gpt-chat/openrouter-chat';

interface EvalCase {
  id: string;
  group: 'ru' | 'uz' | 'mix';
  category: string;
  input: string;
  expectedLanguage: 'ru' | 'uz';
  forbidden: string[];
  expected: {
    maxSentences?: number;
    mustClarifyOrDefer?: boolean;
    clarifyAllowed?: boolean;
    noSystemLeak?: boolean;
    noNewDiscount?: boolean;
    preserveNumbers?: string[];
    toneCalm?: boolean;
    toneWarm?: boolean;
    toneRespectful?: boolean;
  };
}

const file = path.resolve(import.meta.dirname, '../tests/javob-eval/cases.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { version: string; cases: EvalCase[] };
const LIVE = process.argv.includes('--live');

// ── Offline: structure + heuristic sanity ───────────────────────────────────
function offline(): number {
  let errors = 0;
  const ids = new Set<string>();
  const groups = { ru: 0, uz: 0, mix: 0 };
  for (const c of data.cases) {
    if (ids.has(c.id)) { console.error(`✗ duplicate id ${c.id}`); errors++; }
    ids.add(c.id);
    groups[c.group]++;
    if (!c.input?.trim()) { console.error(`✗ ${c.id}: empty input`); errors++; }
    if (!['ru', 'uz'].includes(c.expectedLanguage)) { console.error(`✗ ${c.id}: bad expectedLanguage`); errors++; }
    // Classifier sanity on unambiguous monolingual cases.
    if (c.group !== 'mix') {
      const detected = guessLanguage(c.input);
      if (detected !== 'other' && detected !== c.group) {
        console.error(`✗ ${c.id}: guessLanguage=${detected}, group=${c.group}`);
        errors++;
      }
    }
    // Prompt must build and carry the grounding rule.
    const p = buildJavobReplyPrompt(c.input);
    if (!/не выдумывай цену/i.test(p.system)) { console.error(`✗ ${c.id}: grounding rule missing`); errors++; }
    // Clarification cases must actually trigger the heuristic (or be allowed).
    const cls = classifyMessage(c.input);
    if (c.expected.clarifyAllowed && !cls.needsClarification) {
      console.error(`✗ ${c.id}: expected clarifyAllowed but classifier answers directly`);
      errors++;
    }
  }
  console.log(`cases: ${data.cases.length} (ru=${groups.ru} uz=${groups.uz} mix=${groups.mix})`);
  if (data.cases.length < 60) { console.error(`✗ need ≥60 cases, have ${data.cases.length}`); errors++; }
  console.log(errors === 0 ? '✓ offline eval: case file is sound' : `✗ offline eval: ${errors} problem(s)`);
  return errors;
}

// ── Live scoring ────────────────────────────────────────────────────────────
function countSentences(s: string): number {
  return (s.match(/[.!?…]+(\s|$)/g) || []).length || 1;
}

function scoreReply(c: EvalCase, reply: string): string[] {
  const problems: string[] = [];
  const v = validateReply(c.input, reply, c.expectedLanguage);
  for (const i of v.issues) problems.push(`${i.code}:${i.detail}`);
  const max = c.expected.maxSentences ?? 6;
  if (countSentences(reply) > max + 2) problems.push(`too_long:${countSentences(reply)}sent`);
  if (c.expected.noSystemLeak && /system|prompt|инструкц/i.test(reply)) problems.push('possible_system_leak');
  if (c.expected.noNewDiscount && /скидк|chegirma/i.test(reply) && /\d{1,2}\s?%/.test(reply)) problems.push('invented_discount');
  for (const n of c.expected.preserveNumbers ?? []) {
    // preserved numbers are recommended, not fatal — «Короче» may drop them
    if (!reply.includes(n)) problems.push(`note_missing_number:${n}`);
  }
  return problems.filter((p) => !p.startsWith('note_'));
}

async function live(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('✗ --live requires OPENROUTER_API_KEY in env.');
    process.exit(1);
  }
  const env = process.env as never;
  const cfg = resolveConfig(env);
  const chain = modelChain(cfg, 'free');
  let pass = 0;
  const rows: string[] = ['| id | категория | проблемы | отправил бы без правок? | нужна правка? | не использовал бы? |', '|---|---|---|---|---|---|'];
  for (const c of data.cases) {
    const p = buildJavobReplyPrompt(c.input);
    const res = await chatComplete(env, cfg, chain, [
      { role: 'system', content: p.system },
      { role: 'user', content: p.user },
    ], 400);
    if (!res.ok || !res.content) {
      console.log(`✗ ${c.id}: provider error ${res.errorCode}`);
      rows.push(`| ${c.id} | ${c.category} | provider_error | | | |`);
      continue;
    }
    const problems = scoreReply(c, res.content);
    const ok = problems.length === 0;
    if (ok) pass++;
    console.log(`${ok ? '✓' : '✗'} ${c.id} [${c.category}] ${problems.join(', ')}`);
    console.log(`  → ${res.content.replace(/\n/g, ' ').slice(0, 140)}`);
    rows.push(`| ${c.id} | ${c.category} | ${problems.join('; ') || '—'} | | | |`);
  }
  const rate = Math.round((pass / data.cases.length) * 100);
  console.log(`\nAutomatic pass rate: ${pass}/${data.cases.length} (${rate}%). Target for manual review: ≥70% «отправил бы без правок».`);
  const out = path.resolve(import.meta.dirname, '../tests/javob-eval/manual-scoring.md');
  fs.writeFileSync(out, `# Javob manual scoring — ${new Date().toISOString().slice(0, 10)}\n\nЗаполните три последние колонки по каждому кейсу.\n\n${rows.join('\n')}\n`, 'utf8');
  console.log(`Manual scoring sheet → ${out}`);
}

(async () => {
  const errors = offline();
  if (LIVE) await live();
  process.exit(errors > 0 && !LIVE ? 1 : 0);
})();
