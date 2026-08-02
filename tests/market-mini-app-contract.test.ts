import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

test('Market BFF stays on the dedicated agents bot and shared composition seam', async () => {
  const files = await Promise.all([
    source('functions/market/router.ts'),
    source('functions/market/composition.ts'),
    source('functions/market/access.ts'),
  ]);
  const combined = files.join('\n');
  assert.match(combined, /TELEGRAM_AGENTS_BOT_TOKEN/);
  assert.doesNotMatch(combined, /\bTELEGRAM_BOT_TOKEN\b/);
  assert.match(combined, /createSotuvchiApplicationServices/);
  assert.doesNotMatch(combined, /SELECT\s|INSERT\s|UPDATE\s|DELETE\s+FROM/i);
});

test('Market client keeps bearer in memory and excludes production bypasses', async () => {
  const api = await source('apps/market-mini-app/src/lib/api.ts');
  const assetDirectory = new URL('apps/market-mini-app/dist/assets/', ROOT);
  const assets = await readdir(assetDirectory).catch(() => [] as string[]);
  const dist = (await Promise.all(assets
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFile(new URL(file, assetDirectory), 'utf8'))))
    .join('\n');
  assert.match(api, /let sessionToken = ''/);
  assert.doesNotMatch(api, /localStorage|sessionStorage|document\.cookie/);
  if (dist) {
    assert.doesNotMatch(dist, /synthetic-memory-token|MARKET_DEV_BOT_TOKEN|Synthetic route missing/);
  }
});

test('Market API CORS is exact-origin and never wildcarded', async () => {
  const middleware = await source('functions/_middleware.ts');
  assert.match(middleware, /allowed\.includes\(origin\)/);
  assert.match(middleware, /isMarketApi/);
  assert.match(middleware, /headers\.delete\('Access-Control-Allow-Origin'\)/);
});

test('root landing build has no Mini App entry coupling', async () => {
  const vite = await source('vite.config.ts');
  assert.doesNotMatch(vite, /market-mini-app|GPTBot Market/);
});
