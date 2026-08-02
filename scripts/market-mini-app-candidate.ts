import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const app = path.join(root, 'apps', 'market-mini-app');
const dist = path.join(app, 'dist');
const evidence = path.join(
  root,
  'docs',
  'agents-platform',
  'mini-app',
  'implementation',
  'evidence',
);

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

async function sha256(file: string): Promise<string> {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

async function collect(directory: string): Promise<Array<{
  path: string;
  bytes: number;
  sha256: string;
}>> {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await collect(absolute));
    else {
      const stat = await fs.stat(absolute);
      output.push({
        path: path.relative(app, absolute).replaceAll('\\', '/'),
        bytes: stat.size,
        sha256: await sha256(absolute),
      });
    }
  }
  return output.sort((left, right) => left.path.localeCompare(right.path));
}

await fs.mkdir(evidence, { recursive: true });
const files = await collect(dist);
const manifest = {
  generatedAt: new Date().toISOString(),
  branch: git('branch', '--show-current'),
  sourceCommit: git('rev-parse', 'HEAD'),
  productionOperationsPerformed: false,
  migrationsAdded: false,
  flagsDefaultOff: [
    'MARKET_MINI_APP_ENABLED',
    'MARKET_MINI_APP_BUYER_ENABLED',
    'MARKET_MINI_APP_SELLER_READS_ENABLED',
    'MARKET_MINI_APP_SELLER_COMMANDS_ENABLED',
  ],
  artifact: {
    directory: 'apps/market-mini-app/dist',
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  },
  requiredOwnerGates: [
    'non-production BotFather bot/menu and token',
    'preview DNS/origin and session secret',
    'native Telegram iOS/Android RU verification',
    'native Uzbek Latin sign-off',
    'real seller/data/PII authorization',
    'public cutover approval',
  ],
};
await fs.writeFile(
  path.join(evidence, 'candidate-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);
console.log(JSON.stringify({
  files: files.length,
  totalBytes: manifest.artifact.totalBytes,
  sourceCommit: manifest.sourceCommit,
}, null, 2));
