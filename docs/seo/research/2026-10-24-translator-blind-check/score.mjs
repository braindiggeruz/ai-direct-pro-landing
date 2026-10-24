// Scores a filled blind-check sheet (README.md, step 3).
//   node docs/seo/research/2026-10-24-translator-blind-check/score.mjs <scoring-sheet.csv> [collector-key.csv]
// With a collector key (candidate_code,system,...), only candidates whose
// system is "gptbot" count toward the gate; without one, every scored row does.
// No dependencies, no network.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((cell) => cell.trim()));
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [name.trim(), (cells[index] ?? '').trim()])));
}

const CRITERIA = ['adequacy', 'fluency', 'terminology'];

export function score(rows, key) {
  const gptbot = key ? new Set(key.filter((k) => k.system.toLowerCase() === 'gptbot').map((k) => k.candidate_code)) : null;
  const result = {};
  for (const direction of ['ru-uz', 'uz-ru']) {
    const scored = rows.filter((r) => r.direction === direction && CRITERIA.every((c) => r[c]) && (!gptbot || gptbot.has(r.candidate_code)));
    const means = Object.fromEntries(CRITERIA.map((c) => {
      const values = scored.map((r) => Number(r[c]));
      if (values.some((v) => !Number.isInteger(v) || v < 1 || v > 5)) throw new Error(`${direction}: ${c} must be an integer 1-5`);
      return [c, values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN];
    }));
    const blockers = scored.filter((r) => /^y/i.test(r.names_numbers_changed) || /^y/i.test(r.critical_error)).map((r) => r.item_id);
    const items = new Set(scored.map((r) => r.item_id)).size;
    const pass = items === 20 && CRITERIA.every((c) => means[c] >= 4) && blockers.length === 0;
    result[direction] = { scoredRows: scored.length, items, means, blockers, pass };
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [sheetFile, keyFile] = process.argv.slice(2);
  if (!sheetFile) { console.error('usage: score.mjs <scoring-sheet.csv> [collector-key.csv]'); process.exit(2); }
  const rows = parseCsv(fs.readFileSync(sheetFile, 'utf8'));
  const key = keyFile ? parseCsv(fs.readFileSync(keyFile, 'utf8')) : null;
  const result = score(rows, key);
  for (const [direction, r] of Object.entries(result)) {
    const means = CRITERIA.map((c) => `${c} ${Number.isNaN(r.means[c]) ? '—' : r.means[c].toFixed(2)}`).join(', ');
    console.log(`${direction}: ${r.items}/20 items, ${r.scoredRows} scored rows; ${means}; blockers ${r.blockers.length ? r.blockers.join(' ') : 'none'} → ${r.pass ? 'PASS' : 'FAIL'}`);
  }
  console.log(Object.values(result).every((r) => r.pass) ? 'Gate: PASS in both directions.' : 'Gate: not passed; keep the translator pages as drafts.');
}
