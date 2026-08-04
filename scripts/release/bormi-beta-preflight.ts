import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const RELEASE_BRANCH = 'release/bormi-public-beta-1';
const DEPLOYED_BASELINE = '5a5111f';
const FULL_SHA = /^[0-9a-f]{40}$/;

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

interface Options {
  expectedSha: string;
  productionSource: string;
  backupPath: string;
  backupSha256: string;
  restorePath: string;
}

interface CountRow {
  total: number;
}

function git(args: readonly string[]): { ok: boolean; output: string } {
  const result = spawnSync('git', [...args], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    output: String(result.stdout ?? '').trim(),
  };
}

function fileHash(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function flag(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] ?? '') : '';
}

function parseOptions(args: readonly string[]): Options {
  const options = {
    expectedSha: flag(args, '--expected-sha').toLowerCase(),
    productionSource: flag(args, '--production-source').toLowerCase(),
    backupPath: path.resolve(flag(args, '--backup')),
    backupSha256: flag(args, '--backup-sha256').toLowerCase(),
    restorePath: path.resolve(flag(args, '--restore')),
  };
  if (
    !FULL_SHA.test(options.expectedSha)
    || !FULL_SHA.test(options.productionSource)
    || !/^[0-9a-f]{64}$/.test(options.backupSha256)
    || !flag(args, '--backup')
    || !flag(args, '--restore')
  ) {
    throw new Error(
      'usage: bormi-beta-preflight.ts --expected-sha <40hex> '
      + '--production-source <40hex> --backup <dump.sql> '
      + '--backup-sha256 <64hex> --restore <isolated.sqlite>',
    );
  }
  return options;
}

function gitPath(name: string): string {
  const result = git(['rev-parse', '--git-path', name]);
  return result.ok ? path.resolve(ROOT, result.output) : path.join(ROOT, '.git', name);
}

function referencedAssetsExist(indexPath: string): boolean {
  if (!existsSync(indexPath)) return false;
  const html = readFileSync(indexPath, 'utf8');
  const references = [...html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)]
    .map((match) => match[1]);
  return references.length > 0 && references.every((reference) => {
    const relative = reference.startsWith('/admin/')
      ? reference.slice('/admin/'.length)
      : reference.startsWith('/')
        ? reference.slice(1)
        : reference;
    const root = reference.startsWith('/admin/')
      ? path.join(ROOT, 'dist', 'admin')
      : path.join(ROOT, 'dist');
    return existsSync(path.join(root, relative));
  });
}

function validateRestore(file: string): { ok: boolean; detail: string } {
  if (!existsSync(file)) return { ok: false, detail: 'missing' };
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const quick = db.prepare('PRAGMA quick_check').get() as Record<string, unknown>;
    const integrity = db.prepare('PRAGMA integrity_check').get() as Record<string, unknown>;
    const foreignKeys = db.prepare('PRAGMA foreign_key_check').all().length;
    const ledger = db.prepare(
      'SELECT COUNT(*) AS total FROM d1_migrations',
    ).get() as CountRow;
    const last = db.prepare(
      'SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1',
    ).get() as { name?: string } | undefined;
    const ok = quick.quick_check === 'ok'
      && integrity.integrity_check === 'ok'
      && foreignKeys === 0
      && Number(ledger.total) === 33
      && last?.name === '0033_owner_audit_listing_actions.sql';
    return {
      ok,
      detail: ok ? 'integrity-ok-fk-0-ledger-33' : 'validation-failed',
    };
  } finally {
    db.close();
  }
}

export function runBormiBetaPreflight(options: Options): Check[] {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail });
  };

  const branch = git(['branch', '--show-current']);
  add('git:release-branch', branch.ok && branch.output === RELEASE_BRANCH,
    branch.output || 'unknown');

  const head = git(['rev-parse', 'HEAD']);
  add('git:expected-sha', head.ok && head.output === options.expectedSha,
    head.ok ? (head.output === options.expectedSha ? 'exact' : 'mismatch') : 'unavailable');

  const remote = git(['rev-parse', `origin/${RELEASE_BRANCH}`]);
  add('git:remote-release-sha', remote.ok && remote.output === options.expectedSha,
    remote.ok ? (remote.output === options.expectedSha ? 'exact' : 'mismatch') : 'unavailable');

  const status = git(['status', '--porcelain']);
  add('git:clean', status.ok && status.output === '', status.output === '' ? 'clean' : 'dirty');

  const originAncestor = git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
  add('git:origin-main-lineage', originAncestor.ok, originAncestor.ok ? 'contained' : 'missing');
  const deployedAncestor = git(['merge-base', '--is-ancestor', DEPLOYED_BASELINE, 'HEAD']);
  add('git:deployed-baseline-lineage', deployedAncestor.ok,
    deployedAncestor.ok ? 'contained' : 'missing');
  const productionAncestor = git([
    'merge-base', '--is-ancestor', options.productionSource, 'HEAD',
  ]);
  add('git:production-source-lineage', productionAncestor.ok,
    productionAncestor.ok ? 'contained' : 'missing');

  const stash = git(['stash', 'list']);
  add('git:stash-empty', stash.ok && stash.output === '', stash.output === '' ? 'empty' : 'present');
  const operationState = [
    gitPath('MERGE_HEAD'),
    gitPath('rebase-merge'),
    gitPath('rebase-apply'),
  ].some((candidate) => existsSync(candidate));
  add('git:no-merge-rebase', !operationState, operationState ? 'active' : 'none');

  add('backup:present', existsSync(options.backupPath),
    existsSync(options.backupPath) ? 'present' : 'missing');
  const hashMatches = existsSync(options.backupPath)
    && fileHash(options.backupPath) === options.backupSha256;
  add('backup:sha256', hashMatches, hashMatches ? 'exact' : 'mismatch');
  const restore = validateRestore(options.restorePath);
  add('backup:isolated-restore', restore.ok, restore.detail);

  const packageJson = JSON.parse(
    readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  ) as { scripts?: Record<string, string> };
  const cloudflareBuild = packageJson.scripts?.['build:cf'] ?? '';
  add('build:cloudflare-packages-admin', /&& npm run build:admin$/.test(cloudflareBuild),
    /&& npm run build:admin$/.test(cloudflareBuild) ? 'root-then-admin' : 'admin-missing');

  const rootIndex = path.join(ROOT, 'dist', 'index.html');
  const adminIndex = path.join(ROOT, 'dist', 'admin', 'index.html');
  add('build:root-artifact', referencedAssetsExist(rootIndex),
    referencedAssetsExist(rootIndex) ? 'complete' : 'missing-or-broken');
  add('build:admin-artifact', referencedAssetsExist(adminIndex),
    referencedAssetsExist(adminIndex) ? 'complete' : 'missing-or-broken');
  const adminAssets = path.join(ROOT, 'dist', 'admin', 'assets');
  const adminJs = existsSync(adminAssets)
    ? readdirSync(adminAssets).filter((entry) => entry.endsWith('.js')).length
    : 0;
  add('build:admin-js', adminJs > 0, adminJs > 0 ? `${adminJs}-chunks` : 'missing');

  const routes = JSON.parse(
    readFileSync(path.join(ROOT, 'public', '_routes.json'), 'utf8'),
  ) as { include?: string[]; exclude?: string[] };
  add('routing:admin-shell-function', routes.include?.includes('/admin/*') === true,
    routes.include?.includes('/admin/*') ? 'included' : 'missing');
  add('routing:admin-assets-direct', routes.exclude?.includes('/admin/assets/*') === true,
    routes.exclude?.includes('/admin/assets/*') ? 'excluded' : 'missing');

  return checks;
}

function main(): void {
  const checks = runBormiBetaPreflight(parseOptions(process.argv.slice(2)));
  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.name} ${check.detail}`);
  }
  const pass = checks.every((check) => check.ok);
  console.log(`BORMI_BETA_PREFLIGHT=${pass ? 'PASS' : 'BLOCKED'}`);
  if (!pass) process.exitCode = 1;
}

const direct = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (direct) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'preflight_failed');
    process.exitCode = 1;
  }
}
