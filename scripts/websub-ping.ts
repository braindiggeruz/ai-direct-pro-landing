// scripts/websub-ping.ts
//
// WebSub publish ping for the two blog feeds.
//
// Declaring <atom:link rel="hub"> in the feed (scripts/generate-feed.ts) only
// tells a reader where the hub is. Nothing is pushed until the publisher tells
// the hub the feed changed — that is this script, and it must run AFTER the
// deploy, because the hub fetches the feed immediately and would otherwise read
// the previous build.
//
// No key or account is needed: the hub is public and free, and it verifies the
// claim by fetching the feed itself. That also means a ping for an unchanged
// feed is harmless — the hub simply finds nothing new.
//
// Honest scope: this reliably reaches WebSub subscribers and aggregators.
// Whether Google Search treats it as a crawl signal is not documented, so it is
// an extra channel beside the sitemap's lastmod and Search Console, not a
// replacement for either.
//
// Spec: https://www.w3.org/TR/websub/#publishing
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { WEBSUB_HUB } from './generate-feed.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FEEDS = ['https://gptbot.uz/ru/blog/feed.xml', 'https://gptbot.uz/uz/blog/feed.xml'];

type Result = { feed: string; status: number | null; ok: boolean; body: string };

async function publish(feed: string): Promise<Result> {
  try {
    const res = await fetch(WEBSUB_HUB, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 'hub.mode': 'publish', 'hub.url': feed }).toString(),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.text()).slice(0, 300);
    console.log(`[websub-ping] ${feed} → HTTP ${res.status} ${res.statusText}`);
    return { feed, status: res.status, ok: res.ok, body };
  } catch (error) {
    // A hub that is down must not fail a release: the sitemap and Search
    // Console remain the load-bearing discovery paths.
    const body = error instanceof Error ? error.message : String(error);
    console.error(`[websub-ping] ${feed} → failed: ${body}`);
    return { feed, status: null, ok: false, body };
  }
}

const results: Result[] = [];
for (const feed of FEEDS) results.push(await publish(feed));

const submittedAt = new Date().toISOString();
const receiptDir = path.join(ROOT, 'reports', 'websub-receipts');
const receiptPath = path.join(receiptDir, `${submittedAt.replace(/[:.]/g, '-')}_${randomUUID().slice(0, 8)}.json`);
fs.mkdirSync(receiptDir, { recursive: true });
fs.writeFileSync(receiptPath, `${JSON.stringify({ submittedAt, hub: WEBSUB_HUB, results }, null, 2)}\n`, 'utf8');
console.log(`[websub-ping] Receipt: ${path.relative(ROOT, receiptPath)}`);

if (results.every((r) => r.ok)) console.log('[websub-ping] Both feeds accepted by the hub.');
else console.error('[websub-ping] At least one feed was not accepted; the deploy itself is unaffected.');
