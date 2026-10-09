// Notify only when production serves the exact release and feed bytes.
// https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { DISCOVERY_FEEDS, hasDiscoveryCachePolicy, WEBSUB_HUB } from './feed-data';
import { SITE_URL } from '../src/shared/site-config';
import type { PagesRelease } from './release/pages-production';

const ROOT = path.resolve(import.meta.dirname, '..');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
type Fetcher = typeof fetch;
type NotificationState = {
  feed: string; hash: string; attempts: number; updatedAt: string;
  status: 'pending' | 'accepted' | 'rejected' | 'unknown'; httpStatus: number | null;
};
export type FeedReceipt = NotificationState & { action: 'posted' | 'skipped' };
interface Options { root: string; release: PagesRelease; stateDir: string; fetcher?: Fetcher }

// Shared across worktrees on this release host; never shipped in the artifact.
export function webSubStateDir(root: string): string {
  const git = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (git.status !== 0) throw new Error('Cannot locate shared WebSub state.');
  return path.join(path.resolve(root, git.stdout.trim()), 'gptbot-websub');
}

function writeState(filename: string, value: NotificationState): void {
  const temp = `${filename}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, filename);
}

async function verifiedFeeds(root: string, release: PagesRelease, fetcher: Fetcher): Promise<Array<{ feed: string; hash: string }>> {
  async function verifyManifest(): Promise<void> {
    const response = await fetcher(`${SITE_URL}/gptbot-release.json?release=${release.commit}`, {
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok || JSON.stringify(await response.json()) !== JSON.stringify(release)) {
      throw new Error('Production manifest differs; no feeds notified.');
    }
  }
  await verifyManifest();
  const feeds = [];
  for (const spec of DISCOVERY_FEEDS) {
    const expected = fs.readFileSync(path.join(root, 'dist', spec.path.slice(1)));
    const feed = `${SITE_URL}${spec.path}`;
    // No query/cache busting: this is the URL the hub will actually fetch.
    const response = await fetcher(feed, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (response.status !== 200 || !(response.headers.get('content-type') || '').startsWith(spec.type)) {
      throw new Error(`Feed unavailable or wrong media type: ${spec.path}`);
    }
    if (!hasDiscoveryCachePolicy(response.headers.get('cache-control')) || /noindex/i.test(response.headers.get('x-robots-tag') || '')) {
      throw new Error(`Feed cache/indexability policy differs: ${spec.path}`);
    }
    const actual = Buffer.from(await response.arrayBuffer());
    if (!expected.equals(actual)) throw new Error(`Production feed is stale or differs: ${spec.path}`);
    feeds.push({ feed, hash: sha256(actual) });
  }
  await verifyManifest(); // Detect a competing release during verification.
  return feeds;
}

export async function notifyWebSub({ root, release, stateDir, fetcher = fetch }: Options): Promise<{
  productionVerified: boolean; results: FeedReceipt[]; error?: string; receiptPath: string;
}> {
  fs.mkdirSync(stateDir, { recursive: true });
  const lockPath = path.join(stateDir, 'publish.lock');
  // Never steal an existing lock: a crashed operator must reconcile it first.
  const lock = fs.openSync(lockPath, 'wx');
  const submittedAt = new Date().toISOString();
  fs.writeSync(lock, JSON.stringify({ pid: process.pid, startedAt: submittedAt }));
  const results: FeedReceipt[] = [];
  let productionVerified = false;
  let error: string | undefined;
  try {
    const feeds = await verifiedFeeds(root, release, fetcher);
    productionVerified = true;
    for (const { feed, hash } of feeds) {
      const stateFile = path.join(stateDir, `${sha256(feed)}-${hash}.json`);
      const previous = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) as NotificationState : undefined;
      // An explicit 429/5xx permits one later retry after a cooldown. Timeout
      // or pending is an unknown outcome. Accepted hashes are never resent.
      const retryable = previous?.status === 'rejected'
        && (previous.httpStatus === 429 || (previous.httpStatus || 0) >= 500)
        && previous.attempts < 2 && Date.now() - Date.parse(previous.updatedAt) >= 300_000;
      if (previous && !retryable) {
        results.push({ ...previous, action: 'skipped' });
        continue;
      }
      const state: NotificationState = { feed, hash, attempts: (previous?.attempts || 0) + 1,
        updatedAt: new Date().toISOString(), status: 'pending', httpStatus: null };
      writeState(stateFile, state); // Persist intent before the external write.
      try {
        const response = await fetcher(WEBSUB_HUB, {
          method: 'POST', redirect: 'error',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ 'hub.mode': 'publish', 'hub.url': feed }).toString(),
          signal: AbortSignal.timeout(15_000),
        });
        state.httpStatus = response.status;
        state.status = response.ok ? 'accepted' : 'rejected';
        await response.body?.cancel().catch(() => undefined);
      } catch {
        state.status = 'unknown'; // Could have reached the hub; do not loop.
      }
      state.updatedAt = new Date().toISOString();
      writeState(stateFile, state);
      results.push({ ...state, action: 'posted' });
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Feed verification failed';
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
  const receiptDir = path.join(root, 'reports', 'websub-receipts');
  fs.mkdirSync(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, `${submittedAt.replace(/[:.]/g, '-')}_${randomUUID().slice(0, 8)}.json`);
  fs.writeFileSync(receiptPath, `${JSON.stringify({ submittedAt, commit: release.commit,
    artifactSha256: release.artifactSha256, hub: WEBSUB_HUB, productionVerified, results, error,
    googleRecrawlConfirmed: false }, null, 2)}\n`, 'utf8');
  return { productionVerified, results, error, receiptPath };
}

/** Discovery failure does not roll back a healthy deploy or retry upload. */
export async function notifyAfterDeployment(root: string, release: PagesRelease): Promise<void> {
  try {
    console.log(`[websub] ${JSON.stringify(await notifyWebSub({ root, release, stateDir: webSubStateDir(root) }))}`);
  } catch (error) {
    console.warn(`[websub] Notification not completed; deployment retained: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

/** Retry only read-only checks while the custom domain propagates. */
export async function verifyLiveRelease(release: PagesRelease, fetcher: Fetcher = fetch, pause: (ms: number) => Promise<unknown> = delay): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(`${SITE_URL}/gptbot-release.json?release=${release.commit}`, {
        redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      });
      if (response.ok && JSON.stringify(await response.json()) === JSON.stringify(release)) return;
    } catch { /* Bounded read-only retry; never another upload. */ }
    if (attempt < 2) await pause(5000);
  }
  throw new Error('Custom domain does not serve the expected release manifest. Verify CDN/deployment state.');
}

async function main(): Promise<void> {
  const { assertCleanRuntime, verifyStampedArtifact } = await import('./release/pages-production');
  const { publishedStudioUrls } = await import('../apps/studio/shared/published-urls');
  assertCleanRuntime(ROOT);
  const stamped = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'gptbot-release.json'), 'utf8')) as PagesRelease;
  const release = verifyStampedArtifact(path.join(ROOT, 'dist'), stamped.commit, publishedStudioUrls(ROOT));
  const result = await notifyWebSub({ root: ROOT, release, stateDir: webSubStateDir(ROOT) });
  console.log(JSON.stringify(result));
  if (!result.productionVerified || result.results.some(r => r.status !== 'accepted')) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'WebSub failed'); process.exitCode = 1; });
}
