// One production Pages project serves both the public SEO site and Lead Radar.
// A successful upload is not proof that the other product's features survived.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PROJECT = 'ai-direct-pro-landing';
const MANIFEST = 'gptbot-release.json';
export const REQUIRED_RELEASES = [
  ['d629b4bcc471f6310f335af89fc8022b74b9f839', 'Lead Radar audiences, Bridge and sending readiness'],
  ['9cdfff152597a43ba7b3eea89bd3abe23db760d6', 'RU/UZ advertising pages and promotion footer'],
] as const;
export const REQUIRED_FEATURES = [
  ['audience_directory', 'Все Telegram-контакты и кампании'],
  ['mobile_username_selection', 'Мобильный / username'],
  ['bridge_pairing', 'Привязать этот компьютер'],
  ['sending_readiness', 'Готовность выбранных контактов'],
  ['campaign_preflight', '/telegram-campaigns/preflight'],
  ['async_media_check', '/telegram-campaigns/media/check'],
] as const;

interface Artifact {
  path: string;
  sha256: string;
}
export interface PagesRelease {
  schema: 1;
  commit: string;
  artifactSha256: string;
  fileCount: number;
  features: string[];
  probes: Artifact[];
}
const hash = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');

function git(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Git check failed: ${args[0]}`);
  return result.stdout.trim();
}

function runtimeFile(filename: string): boolean {
  return /^(src|functions|workers|tools|content|public|scripts|apps|config)\//.test(filename)
    || /^(package(-lock)?\.json|yarn\.lock|vite\.config\.|tsconfig\.|wrangler)/.test(filename);
}

function assertCleanRuntime(root: string): void {
  const changed = [...git(root, ['diff', '--name-only', 'HEAD']).split('\n'),
    ...git(root, ['ls-files', '--others', '--exclude-standard']).split('\n')].filter(runtimeFile);
  if (changed.length) throw new Error('Uncommitted runtime files: commit the reviewed build inputs before production deployment.');
}

export function assertProductionLineage(
  latestProductionCommit: string,
  isAncestor: (commit: string) => boolean,
): void {
  for (const [commit, label] of REQUIRED_RELEASES) {
    if (!isAncestor(commit)) throw new Error(`Missing released work: ${label}. Merge it; do not overwrite production.`);
  }
  if (!/^[a-f0-9]{40}$/.test(latestProductionCommit)) throw new Error('Production commit is unknown; deployment blocked.');
  if (!isAncestor(latestProductionCommit)) {
    throw new Error('Production contains another release. Fetch/merge that commit before deploying this checkout.');
  }
}

function artifactFiles(dist: string): Artifact[] {
  const files: Artifact[] = [];
  function visit(directory: string): void {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, item.name);
      const relative = path.relative(dist, absolute).split(path.sep).join('/');
      if (item.isSymbolicLink()) throw new Error('Symlink in release artifact; deployment blocked.');
      if (item.isDirectory()) visit(absolute);
      else if (relative !== MANIFEST) files.push({ path: relative, sha256: hash(fs.readFileSync(absolute)) });
    }
  }
  visit(dist);
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export function inspectArtifact(dist: string, commit: string): PagesRelease {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid build commit.');
  const files = artifactFiles(dist);
  // Inspect only code reachable from the served entry point. A leftover new
  // AdminRoot next to an old index.html must not make an old upload look safe.
  const scripts: Array<Artifact & { text: string }> = [];
  const visited = new Set<string>();
  function follow(text: string, from: string): void {
    for (const match of text.matchAll(/["']([\w./-]+\.js)["']/g)) {
      const ref = match[1];
      const filename = path.posix.normalize(ref.startsWith('/') ? ref.slice(1)
        : ref.startsWith('assets/') ? ref : path.posix.join(path.posix.dirname(from), ref));
      if (!/^assets\/[^/]+\.js$/.test(filename) || visited.has(filename)) continue;
      visited.add(filename);
      const file = files.find((item) => item.path === filename);
      if (!file) throw new Error(`Missing referenced script: ${filename}`);
      const code = fs.readFileSync(path.join(dist, filename), 'utf8');
      scripts.push({ ...file, text: code });
      follow(code, filename);
    }
  }
  follow(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), 'index.html');
  const probes: Artifact[] = [];
  for (const [id, marker] of REQUIRED_FEATURES) {
    const file = scripts.find((script) => script.text.includes(marker));
    if (!file) throw new Error(`Missing production feature: ${id}. Old/incomplete admin bundle rejected.`);
    if (!probes.some((probe) => probe.path === file.path)) probes.push({ path: file.path, sha256: file.sha256 });
  }
  const htmlChecks = [
    ['index.html', '/assets/index-'],
    ['admin/index.html', '<div id="root">'],
    ['uz/internet-reklama-toshkent/index.html', 'Reklama xizmatlari'],
    ['ru/internet-reklama-tashkent/index.html', 'Услуги продвижения'],
  ];
  for (const [filename, marker] of htmlChecks) {
    const file = files.find((item) => item.path === filename);
    if (!file || !fs.readFileSync(path.join(dist, filename), 'utf8').includes(marker)) {
      throw new Error(`Missing production page/section: ${filename}`);
    }
    probes.push(file);
  }
  return { schema: 1, commit, artifactSha256: hash(JSON.stringify(files)), fileCount: files.length,
    features: REQUIRED_FEATURES.map(([id]) => id), probes };
}

export function verifyStampedArtifact(dist: string, commit: string): PagesRelease {
  const stamped: PagesRelease = JSON.parse(fs.readFileSync(path.join(dist, MANIFEST), 'utf8'));
  const actual = inspectArtifact(dist, commit);
  if (JSON.stringify(stamped) !== JSON.stringify(actual)) {
    throw new Error('Build stamp is stale or files changed. Rebuild the combined production artifact.');
  }
  return actual;
}

async function productionCommit(): Promise<string> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const credential = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !credential) throw new Error('Cloudflare credentials must be supplied through the environment.');
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${PROJECT}`, {
    headers: { Authorization: `Bearer ${credential}` }, signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Production metadata check failed (HTTP ${response.status}).`);
  const body = await response.json() as { success?: boolean; result?: { canonical_deployment?: {
    environment?: string; latest_stage?: { status?: string }; deployment_trigger?: { metadata?: { commit_hash?: string } };
  } } };
  const deployment = body.result?.canonical_deployment;
  if (!body.success || deployment?.environment !== 'production' || deployment.latest_stage?.status !== 'success') {
    throw new Error('No confirmed successful production deployment; manual investigation required.');
  }
  return deployment.deployment_trigger?.metadata?.commit_hash ?? '';
}

async function checkProduction(root: string): Promise<string> {
  const current = await productionCommit();
  assertProductionLineage(current, (commit) => spawnSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'],
    { cwd: root, stdio: 'ignore', windowsHide: true }).status === 0);
  return current;
}

/**
 * Explain a held lock well enough to decide whether it is stale without
 * spelunking. Breaking the lock automatically is deliberately not offered:
 * two operators uploading at once is the failure this protects against, and a
 * heuristic that guesses wrong does more damage than a message that asks.
 */
function describeLock(lockPath: string): string {
  const header = `Another guarded Pages deployment holds the shared lock: ${lockPath}`;
  let detail: string;
  try {
    const stat = fs.statSync(lockPath);
    const ageSeconds = Math.round((Date.now() - stat.mtimeMs) / 1000);
    detail = ` Lock age ${ageSeconds}s.`;
    if (stat.size > 0) {
      const holder = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid?: number; startedAt?: string };
      if (typeof holder.pid === 'number') {
        let alive = 'not a live process';
        try { process.kill(holder.pid, 0); alive = 'still running'; } catch { /* exited or not ours */ }
        detail += ` Holder pid ${holder.pid} (${alive}), started ${holder.startedAt ?? 'unknown'}.`;
      }
    } else {
      detail += ' The lock is empty, so it predates holder tracking.';
    }
  } catch {
    return `${header} The lock file could not be read; investigate before retrying.`;
  }
  return `${header}.${detail} If nothing is deploying, the previous run was killed and leaked it — remove the file, then redeploy.`;
}

async function deploy(root: string, release: PagesRelease): Promise<void> {
  // All git worktrees share this lock. It protects cooperating deployment
  // commands, not an unrelated raw Wrangler upload or an external CI system.
  const lockPath = path.join(path.resolve(root, git(root, ['rev-parse', '--git-common-dir'])), 'gptbot-pages-production.lock');
  let lock: number;
  try {
    lock = fs.openSync(lockPath, 'wx');
    // Record the holder. An empty 0-byte file tells the next run nothing: a
    // deploy killed mid-upload (sandbox SIGTERM, dropped terminal) skips the
    // finally block and leaks the lock, and the next run then reports a
    // conflict with a process that no longer exists.
    fs.writeSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  } catch {
    throw new Error(describeLock(lockPath));
  }
  try {
    await checkProduction(root);
    const cli = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(process.execPath, [cli, 'pages', 'deploy', 'dist', '--project-name', PROJECT,
        '--branch', 'main', '--commit-hash', release.commit, '--commit-dirty=true'],
      { cwd: root, stdio: 'inherit', windowsHide: true });
      child.on('error', reject); child.on('exit', (code) => resolve(code ?? 1));
    });
    if (exitCode !== 0) throw new Error(`Wrangler deployment failed (${exitCode}).`);
    if (await productionCommit() !== release.commit) throw new Error('Production changed during publication; investigate competing deployment.');
    // Read back the actual custom domain, not only Wrangler's upload result.
    const response = await fetch(`https://gptbot.uz/${MANIFEST}?release=${release.commit}`, {
      cache: 'no-store', signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok || JSON.stringify(await response.json()) !== JSON.stringify(release)) {
      throw new Error('Custom domain does not serve the expected release manifest. Verify CDN/deployment state.');
    }
    console.log(JSON.stringify({ status: 'deployed_and_verified', commit: release.commit, features: release.features }));
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (!['stamp', 'check', 'check-production', 'deploy'].includes(mode)) {
    throw new Error('Usage: pages-production.ts stamp|check|check-production|deploy');
  }
  const commit = git(ROOT, ['rev-parse', 'HEAD']);
  const dist = path.join(ROOT, 'dist');
  assertCleanRuntime(ROOT);
  if (mode === 'stamp') {
    const release = inspectArtifact(dist, commit);
    fs.writeFileSync(path.join(dist, MANIFEST), `${JSON.stringify(release, null, 2)}\n`);
    console.log(JSON.stringify({ status: 'stamped', commit, files: release.fileCount, features: release.features }));
    return;
  }
  const release = verifyStampedArtifact(dist, commit);
  if (mode === 'deploy') await deploy(ROOT, release);
  else console.log(JSON.stringify({ status: 'pass', commit, files: release.fileCount,
    ...(mode === 'check-production' ? { previousProductionCommit: await checkProduction(ROOT) } : {}) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Release check failed.'); process.exitCode = 1; });
}
