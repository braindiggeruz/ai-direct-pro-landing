import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * The plain `[vars]` of the automation Worker, exactly as a Worker deploy
 * uploads them (a deploy replaces the whole set). Throws when the table is
 * missing so a moved or renamed section cannot pass as "no flags set".
 */
export function automationWorkerVars(): Map<string, string> {
  const lines = fs.readFileSync(path.join(ROOT, 'wrangler.automation.toml'), 'utf8').split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === '[vars]');
  if (start === -1) throw new Error('wrangler.automation.toml has no [vars] table');
  const vars = new Map<string, string>();
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('[')) break;
    const match = /^([A-Z0-9_]+)\s*=\s*"(.*)"$/.exec(line.trim());
    if (match) vars.set(match[1], match[2]);
  }
  return vars;
}
