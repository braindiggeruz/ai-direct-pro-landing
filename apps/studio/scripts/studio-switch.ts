/**
 * The free deck's three switches in wrangler.toml, flipped by one command
 * (the rollback in docs/studio/LAUNCH-RU.md).
 *
 *   npx tsx apps/studio/scripts/studio-switch.ts status
 *   npx tsx apps/studio/scripts/studio-switch.ts off             write the free deck off
 *   npx tsx apps/studio/scripts/studio-switch.ts on              back to the R-ST1 launch values
 *   npx tsx apps/studio/scripts/studio-switch.ts off --commit    and commit wrangler.toml alone
 *
 * Only STUDIO_API, STUDIO_FREE_DECK and STUDIO_EVENTS change; every other key
 * of STUDIO_RUNTIME_CONFIG_JSON (caps, models, the Turnstile site key, the
 * paid switches) and every other byte of the file stay as they are. With the
 * switches off every free /api/studio/* path answers 404 before it reads a
 * body or D1 (functions/lib/studio/config.ts studioGate); the pages stay up,
 * and the form says «Vaqtincha ishlamayapti» / «Временно не работает» after
 * a person acts.
 *
 * Pages reads variables only at deploy time, so this is half of a rollback:
 * then `npm run build:production` and the guarded deploy. `--commit` exists
 * because the guarded deploy refuses uncommitted runtime files
 * (scripts/release/pages-production.ts assertCleanRuntime): it commits
 * wrangler.toml by its path only, with the message from a file.
 *
 * STUDIO_PAID_SERVICE is never touched here: after the first live sale it
 * stays on (STUDIO-SPEC §13.5), and /config and /me keep working with it.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WRANGLER = 'wrangler.toml';

export type SwitchState = 'on' | 'off';

/** The free deck's switches, on (the R-ST1 launch, 2026-10-07) and off (its rollback). */
export const FREE_DECK_SWITCHES = {
  on: { STUDIO_API: 'on', STUDIO_FREE_DECK: 'true', STUDIO_EVENTS: 'true' },
  off: { STUDIO_API: 'off', STUDIO_FREE_DECK: 'false', STUDIO_EVENTS: 'false' },
} as const satisfies Record<SwitchState, Record<string, string>>;

const LINE = /^STUDIO_RUNTIME_CONFIG_JSON = '''(.+?)'''(\r?)$/m;

/** The parsed STUDIO_RUNTIME_CONFIG_JSON of `toml`; throws when it is missing or not a JSON object of strings. */
export function readStudioConfigLine(toml: string): Record<string, string> {
  const found = LINE.exec(toml);
  if (!found) throw new Error(`${WRANGLER} has no STUDIO_RUNTIME_CONFIG_JSON line.`);
  const parsed: unknown = JSON.parse(found[1]);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)
    || !Object.values(parsed).every((value) => typeof value === 'string')) {
    throw new Error('STUDIO_RUNTIME_CONFIG_JSON is not a JSON object of strings.');
  }
  return parsed as Record<string, string>;
}

/** "on" or "off" when all three switches agree; "mixed" otherwise. */
export function switchState(toml: string): SwitchState | 'mixed' {
  const config = readStudioConfigLine(toml);
  for (const state of ['on', 'off'] as const) {
    if (Object.entries(FREE_DECK_SWITCHES[state]).every(([key, value]) => config[key] === value)) return state;
  }
  return 'mixed';
}

/** `toml` with the three switches set to `state`; key order, the other values and the rest of the file unchanged. */
export function setSwitches(toml: string, state: SwitchState): string {
  const config = readStudioConfigLine(toml);
  for (const key of Object.keys(FREE_DECK_SWITCHES[state])) {
    if (!(key in config)) throw new Error(`STUDIO_RUNTIME_CONFIG_JSON has no ${key}.`);
  }
  const next = JSON.stringify({ ...config, ...FREE_DECK_SWITCHES[state] });
  return toml.replace(LINE, (_line, _json: string, cr: string) => `STUDIO_RUNTIME_CONFIG_JSON = '''${next}'''${cr}`);
}

function git(args: string[], file?: string): void {
  const run = spawnSync('git', file ? [...args, file] : args, { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  if (run.status !== 0) throw new Error(`git ${args[0]} failed: ${(run.stderr || run.stdout).trim().slice(0, 500)}`);
}

function commit(state: SwitchState): void {
  const message = state === 'off'
    ? 'fix(studio): switch the free deck off\n\nRollback of the free deck (docs/studio/LAUNCH-RU.md): STUDIO_API,\nSTUDIO_FREE_DECK and STUDIO_EVENTS off; every free /api/studio/* path\nanswers 404 after the next guarded deploy. The pages stay published.\n'
    : 'feat(studio): switch the free deck back on\n\nSTUDIO_API, STUDIO_FREE_DECK and STUDIO_EVENTS back to the R-ST1 launch\nvalues; caps, models and the Turnstile site key unchanged.\n';
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-switch-')), 'message.txt');
  fs.writeFileSync(file, message, 'utf8');
  try {
    git(['add', '--'], WRANGLER);
    git(['commit', '-F', file, '--'], WRANGLER);
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
}

function main(): void {
  const [command, ...flags] = process.argv.slice(2);
  const file = path.join(ROOT, WRANGLER);
  const toml = fs.readFileSync(file, 'utf8');
  if (command === 'status') {
    console.log(JSON.stringify({ freeDeck: switchState(toml) }));
    return;
  }
  if (command !== 'on' && command !== 'off') {
    throw new Error('Usage: studio-switch.ts status | on | off [--commit]');
  }
  const before = switchState(toml);
  if (before === command) {
    console.log(JSON.stringify({ freeDeck: command, changed: false }));
    return;
  }
  fs.writeFileSync(file, setSwitches(toml, command), 'utf8');
  if (flags.includes('--commit')) commit(command);
  console.log(JSON.stringify({
    freeDeck: command,
    was: before,
    changed: true,
    committed: flags.includes('--commit'),
    next: 'npm run build:production, then the guarded deploy (docs/studio/LAUNCH-RU.md)',
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : 'studio-switch failed.');
    process.exitCode = 1;
  }
}
