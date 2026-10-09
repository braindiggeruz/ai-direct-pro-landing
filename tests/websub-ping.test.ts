import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { DISCOVERY_CACHE_CONTROL, DISCOVERY_FEEDS, WEBSUB_HUB } from '../scripts/feed-data';
import { notifyWebSub, verifyLiveRelease } from '../scripts/websub-ping';
import type { PagesRelease } from '../scripts/release/pages-production';

const release: PagesRelease = { schema: 1, commit: 'a'.repeat(40), artifactSha256: 'b'.repeat(64),
  fileCount: 1004, features: [], probes: [] };

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gptbot-websub-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const spec of DISCOVERY_FEEDS) {
    const filename = path.join(root, 'dist', spec.path.slice(1));
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, `<fixture>${spec.path}</fixture>`);
  }
  const calls: Array<{ url: string; method?: string; body?: string }> = [];
  let hubStatus = 204;
  let badFeed = '';
  let badManifest = false;
  let unknown = false;
  let cacheControl = DISCOVERY_CACHE_CONTROL;
  let manifests = 0;
  let switchRelease = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method, body: init?.body as string });
    assert.equal(init?.redirect, 'error');
    if (url === WEBSUB_HUB) {
      if (unknown) throw new Error('response lost');
      return new Response(null, { status: hubStatus });
    }
    if (url.includes('gptbot-release.json')) {
      manifests++;
      return Response.json(badManifest || (switchRelease && manifests % 2 === 0) ? { commit: 'old' } : release);
    }
    const spec = DISCOVERY_FEEDS.find(f => url === `https://gptbot.uz${f.path}`)!;
    assert.ok(spec, 'must fetch canonical URL without cache-busting query');
    return new Response(badFeed === spec.path ? 'stale' : fs.readFileSync(path.join(root, 'dist', spec.path.slice(1))), {
      headers: { 'Content-Type': spec.type, 'Cache-Control': cacheControl },
    });
  };
  const stateDir = path.join(root, 'state');
  return { root, stateDir, calls, run: () => notifyWebSub({ root, stateDir, release, fetcher }),
    set: (values: { hubStatus?: number; badFeed?: string; badManifest?: boolean; unknown?: boolean; cacheControl?: string; switchRelease?: boolean }) => {
      hubStatus = values.hubStatus ?? hubStatus; badFeed = values.badFeed ?? badFeed;
      badManifest = values.badManifest ?? badManifest; unknown = values.unknown ?? unknown;
      cacheControl = values.cacheControl ?? cacheControl; switchRelease = values.switchRelease ?? switchRelease;
    } };
}

test('verified feed hashes publish once, survive process state reload and changed hash alone publishes again', async t => {
  const f = fixture(t);
  f.set({ cacheControl: 'public, must-revalidate, max-age=0, s-maxage=300' });
  const first = await f.run();
  assert.equal(first.productionVerified, true);
  assert.equal(first.results.filter(r => r.status === 'accepted' && r.action === 'posted').length, 3);
  assert.equal(JSON.parse(fs.readFileSync(first.receiptPath, 'utf8')).googleRecrawlConfirmed, false);
  assert.equal((await f.run()).results.filter(r => r.action === 'skipped').length, 3);
  fs.appendFileSync(path.join(f.root, 'dist/updates/atom.xml'), '\n');
  assert.equal((await f.run()).results.filter(r => r.action === 'posted').length, 1);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 4);
  for (const call of f.calls.filter(c => c.method === 'POST')) assert.equal(new URLSearchParams(call.body).get('hub.mode'), 'publish');
});

test('stale manifest or any feed, conflicting cache and concurrent release block all POSTs', async t => {
  for (const condition of [{ badManifest: true }, { badFeed: '/updates/atom.xml' },
    { cacheControl: 'public, max-age=300, s-maxage=3600' }, { switchRelease: true }]) {
    const f = fixture(t); f.set(condition);
    const result = await f.run();
    assert.equal(result.productionVerified, false);
    assert.ok(result.error);
    assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
  }
});

test('ambiguous network outcome is recorded and never automatically retried', async t => {
  const f = fixture(t); f.set({ unknown: true });
  assert.ok((await f.run()).results.every(r => r.status === 'unknown'));
  f.set({ unknown: false });
  assert.ok((await f.run()).results.every(r => r.action === 'skipped'));
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 3);
});

test('explicit transient rejection allows only one later retry, never a tight loop', async t => {
  const f = fixture(t); f.set({ hubStatus: 503 });
  await f.run(); await f.run();
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 3);
  const age = () => {
    for (const name of fs.readdirSync(f.stateDir).filter(n => n.endsWith('.json'))) {
      const filename = path.join(f.stateDir, name);
      const state = JSON.parse(fs.readFileSync(filename, 'utf8'));
      fs.writeFileSync(filename, JSON.stringify({ ...state, updatedAt: '2020-01-01T00:00:00Z' }));
    }
  };
  age(); await f.run(); age(); await f.run();
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 6);
});

test('shared lock is never removed or bypassed by another notification run', async t => {
  const f = fixture(t);
  fs.mkdirSync(f.stateDir); fs.writeFileSync(path.join(f.stateDir, 'publish.lock'), 'another operator');
  await assert.rejects(f.run, /EEXIST/);
  assert.equal(f.calls.length, 0);
  assert.equal(fs.readFileSync(path.join(f.stateDir, 'publish.lock'), 'utf8'), 'another operator');
});

test('custom-domain propagation retries only reads and stops after three attempts', async () => {
  let reads = 0; let pauses = 0;
  const pause = async () => { pauses++; };
  await verifyLiveRelease(release, async () => Response.json(++reads === 2 ? release : {}), pause);
  assert.equal(reads, 2); assert.equal(pauses, 1);
  reads = 0; pauses = 0;
  await assert.rejects(() => verifyLiveRelease(release, async () => { reads++; return Response.json({}); }, pause), /Custom domain/);
  assert.equal(reads, 3); assert.equal(pauses, 2);
});
