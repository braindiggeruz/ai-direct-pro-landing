// Read/write the AI Autopilot runs ledger.
//
// File: content/seo/ai-runs.json
// Shape: { runs: AiSeoRunLog[] }  (newest first, capped to 200 entries)
//
// Why a separate file?
//   - "Publish to GitHub" must remain a manual step on real content/* pages.
//   - The ledger never touches content/pages/** or content/blog/** — so even
//     committing this file to GitHub does NOT alter any live URL.
//   - The admin SPA can show "AI suggestions queued" badges by reading this
//     file via /api/seo/ai/logs.

import type { Env } from '../../_types';
import { getFile, putFile } from '../github';
import type { AiSeoRunLog } from '../../../src/shared/ai-seo';

const LEDGER_PATH = 'content/seo/ai-runs.json';
const MAX_RUNS = 200;

export interface LedgerFile {
  version: 1;
  runs: AiSeoRunLog[];
}

function emptyLedger(): LedgerFile {
  return { version: 1, runs: [] };
}

export async function readLedger(env: Env): Promise<LedgerFile> {
  try {
    const file = await getFile(env, LEDGER_PATH);
    if (!file) return emptyLedger();
    const parsed = JSON.parse(file.content);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.runs)) return emptyLedger();
    return parsed as LedgerFile;
  } catch {
    return emptyLedger();
  }
}

export async function appendRun(env: Env, run: AiSeoRunLog): Promise<void> {
  const ledger = await readLedger(env);
  ledger.runs = [run, ...ledger.runs].slice(0, MAX_RUNS);
  await putFile(env, LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n',
    `chore(ai-seo): ${run.status} ${run.action} ${run.url} via admin`);
}

export function makeRunId(): string {
  // Cloudflare Workers runtime has crypto.randomUUID.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
