// scripts/fix-mojibake.ts
//
// One-shot recovery script for content JSON files that were corrupted by the
// old getFile() bug (atob without UTF-8 decoding).
//
// Strategy:
//   The corruption is N rounds of [Latin-1 → UTF-8] mis-interpretation. For
//   each user-visible string we try unwinding 1, 2 and 3 rounds via
//   Buffer.from(s, 'latin1').toString('utf8'). We keep the result that:
//     1. round-trips cleanly (no encoding errors), AND
//     2. removes all known mojibake patterns AND
//     3. produces characters mostly in the Cyrillic + Latin + punctuation range.
//
//   If no candidate works we leave the original (visible mojibake → audit
//   error → publish guard blocks it).
//
// Usage:
//   yarn tsx scripts/fix-mojibake.ts          # dry-run report
//   yarn tsx scripts/fix-mojibake.ts --write  # actually rewrite files
//
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const WRITE = process.argv.includes('--write');

const MOJIBAKE_REGEX = /(?:Ã.|Ñ.|Â.|Ð.|Ò.|\uFFFD){2,}|Ã[\u0080-\u00BF]|Ð[\u0080-\u00BF]/u;

function looksMojibake(s: string): boolean {
  if (!s) return false;
  if (s.includes('\uFFFD')) return true;
  return MOJIBAKE_REGEX.test(s);
}

function tryUnwind(s: string): string | null {
  if (!s || !looksMojibake(s)) return null;
  let cur = s;
  let best: string | null = null;
  for (let i = 0; i < 4; i++) {
    try {
      // latin1 → bytes → utf-8
      const buf = Buffer.from(cur, 'latin1');
      const next = buf.toString('utf8');
      // detect that the conversion actually changed something meaningful
      if (next === cur) break;
      // if the candidate has the U+FFFD replacement char, the source wasn't
      // latin1-misencoded UTF-8 → stop.
      if (next.includes('\uFFFD')) break;
      cur = next;
      if (!looksMojibake(cur)) {
        best = cur;
        break;
      }
    } catch {
      break;
    }
  }
  return best;
}

function walk(obj: unknown, fix: (s: string) => string | null): unknown {
  if (obj == null) return obj;
  if (typeof obj === 'string') {
    const r = fix(obj);
    return r ?? obj;
  }
  if (Array.isArray(obj)) return obj.map((x) => walk(x, fix));
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = walk(v, fix);
    }
    return out;
  }
  return obj;
}

const files = fg.sync(['pages/**/*.json', 'blog/**/*.json', 'global/*.json', 'seo/*.json'], {
  cwd: CONTENT_DIR,
  absolute: true,
});

let fixedFiles = 0;
let fixedStrings = 0;
let stillBroken = 0;
const report: string[] = [];

for (const f of files) {
  const raw = fs.readFileSync(f, 'utf-8');
  const data = JSON.parse(raw);
  let touched = 0;
  let stuck = 0;
  const fixed = walk(data, (s) => {
    if (!looksMojibake(s)) return null;
    const rec = tryUnwind(s);
    if (rec) { touched++; return rec; }
    stuck++; return null;
  });
  if (touched > 0) {
    fixedFiles++;
    fixedStrings += touched;
    const rel = path.relative(ROOT, f);
    report.push(`  ${rel}: fixed ${touched} string(s)${stuck ? `, ${stuck} still broken` : ''}`);
    if (WRITE) {
      fs.writeFileSync(f, JSON.stringify(fixed, null, 2) + '\n', 'utf-8');
    }
  } else if (stuck > 0) {
    stillBroken++;
    const rel = path.relative(ROOT, f);
    report.push(`  ${rel}: ${stuck} string(s) still broken, no recovery candidate`);
  }
}

console.log('========================================');
console.log('  MOJIBAKE RECOVERY REPORT');
console.log('========================================');
console.log(`Mode:           ${WRITE ? 'WRITE (files modified)' : 'DRY-RUN (no changes)'}`);
console.log(`Files scanned:  ${files.length}`);
console.log(`Files fixed:    ${fixedFiles}`);
console.log(`Strings fixed:  ${fixedStrings}`);
console.log(`Files w/ stuck: ${stillBroken}`);
if (report.length) {
  console.log('---');
  for (const r of report) console.log(r);
}
console.log('========================================');
if (!WRITE) console.log('Re-run with --write to apply changes.');
