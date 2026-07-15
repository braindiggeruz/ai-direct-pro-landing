// scripts/indexnow-ping.ts
//
// Optional IndexNow pinger for Bing + Yandex + Seznam + Naver + Yep.
// Submits all URLs from the freshly built dist/sitemap.xml in one batch.
//
// Disabled by default — ONLY runs when INDEXNOW_KEY env var is set.
// Setup:
//   1. Generate a 32-64 hex character random key.
//   2. Save it to /public/<KEY>.txt (vite will copy to /dist/<KEY>.txt → served at https://gptbot.uz/<KEY>.txt).
//   3. Run `INDEXNOW_KEY=<KEY> yarn tsx scripts/indexnow-ping.ts` after a deploy.
//
// Spec: https://www.indexnow.org/documentation
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.INDEXNOW_KEY;
if (!KEY) {
  console.log('[indexnow-ping] INDEXNOW_KEY not set — skipping (this is fine, the pinger is opt-in).');
  process.exit(0);
}
if (!/^[A-Za-z0-9-]{8,64}$/.test(KEY)) {
  console.error('[indexnow-ping] INDEXNOW_KEY must be 8-64 chars [A-Za-z0-9-]. Aborting.');
  process.exit(1);
}

const SITE = 'gptbot.uz';
const ENDPOINT = 'https://api.indexnow.org/IndexNow';
const ROOT = path.resolve(import.meta.dirname, '..');
const SITEMAP = path.join(ROOT, 'dist', 'sitemap.xml');

if (!fs.existsSync(SITEMAP)) {
  console.error('[indexnow-ping] dist/sitemap.xml not found. Run `yarn build` first.');
  process.exit(1);
}

const xml = fs.readFileSync(SITEMAP, 'utf-8');
const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
if (urls.length === 0) {
  console.error('[indexnow-ping] No <loc> entries found in sitemap.');
  process.exit(1);
}

const payload = {
  host: SITE,
  key: KEY,
  keyLocation: `https://${SITE}/${KEY}.txt`,
  urlList: urls,
};

console.log(`[indexnow-ping] Pinging ${urls.length} URLs → ${ENDPOINT}`);

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(payload),
});

console.log(`[indexnow-ping] HTTP ${res.status} ${res.statusText}`);
const body = await res.text();
if (body) console.log('[indexnow-ping] Response:', body.slice(0, 500));
if (res.status >= 400) {
  console.error('[indexnow-ping] Non-2xx response. See https://www.indexnow.org/documentation for status codes.');
  process.exit(1);
}
console.log('[indexnow-ping] OK. Bing/Yandex/Seznam/Naver/Yep have been notified.');
