import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
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
  assert.match(
    api,
    /PRODUCTION_MARKET_API_BASE_URL[\s\S]*https:\/\/gptbot\.uz\/api\/market\/v1/,
  );
  assert.match(api, /contentType\.includes\('application\/json'\)/);
  assert.match(api, /MarketApiError\('invalid_response', 502/);
  assert.doesNotMatch(api, /localStorage|sessionStorage|document\.cookie/);
  if (dist) {
    assert.doesNotMatch(dist, /synthetic-memory-token|MARKET_DEV_BOT_TOKEN|Synthetic route missing/);
  }
});

test('Market launch retry exposes an in-progress state', async () => {
  const app = await source('apps/market-mini-app/src/App.tsx');
  assert.match(app, /pending=\{launch\.isFetching\}/);
  assert.match(app, /onClick=\{\(\) => void launch\.refetch\(\)\}/);
});

test('Market shell loads the official Telegram bridge under a narrow CSP', async () => {
  const html = await source('apps/market-mini-app/index.html');
  const headers = await source('apps/market-mini-app/public/_headers');
  assert.match(html, /https:\/\/telegram\.org\/js\/telegram-web-app\.js/);
  assert.match(html, /script-src 'self' https:\/\/telegram\.org/);
  assert.match(headers, /script-src 'self' https:\/\/telegram\.org/);
  assert.match(headers, /connect-src 'self' https:\/\/gptbot\.uz/);
  assert.match(
    await source('apps/market-mini-app/src/lib/api.ts'),
    /PRODUCTION_MARKET_API_BASE_URL[\s\S]*https:\/\/gptbot\.uz\/api\/market\/v1/,
  );
  assert.doesNotMatch(`${html}\n${headers}`, /script-src[^;]*\*/);
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

test('Market launch collapses startup data and ships a bounded local demo image set', async () => {
  const [api, app, main, buyer, ui, router, access, shell, worker] = await Promise.all([
    source('apps/market-mini-app/src/lib/api.ts'),
    source('apps/market-mini-app/src/App.tsx'),
    source('apps/market-mini-app/src/main.tsx'),
    source('apps/market-mini-app/src/screens/BuyerApp.tsx'),
    source('apps/market-mini-app/src/components/ui.tsx'),
    source('functions/market/router.ts'),
    source('functions/market/access.ts'),
    source('apps/market-mini-app/index.html'),
    source('apps/market-mini-app/public/sw.js'),
  ]);
  assert.match(api, /request<MarketLaunch>\('\/session\/launch'/);
  assert.match(router, /const bootstrap = launchBootstrapPayload\(context\)/);
  // The shelf still ships inside the launch response; it is now read ahead of
  // the binding when the storefront can be guessed, with the original read kept
  // as the fallback.
  assert.match(router, /return marketJson\(\{ session, bootstrap, home \}/);
  assert.match(router, /: await catalogHomePayload\(context\)/);
  assert.match(router, /const boundBuyer = await bindMarketLaunch/);
  assert.match(router, /boundBuyer \?\? undefined/);
  assert.match(access, /boundBuyer \?\? await services\.catalog\.resolveStoredStorefrontContext/);
  assert.match(access, /const \[verifiedBuyer, onboarding\] = await Promise\.all/);
  assert.match(access, /boundBuyer\s*\? Promise\.resolve/);
  assert.match(app, /initialHome=\{launch\.home\}/);
  assert.match(app, /refetchOnMount: 'always'/);
  assert.match(main, /createRoot\(document\.getElementById\('root'\)!\)\.render/);
  assert.doesNotMatch(main, /prefetchQuery/);
  assert.match(api, /timeoutMs: LAUNCH_TIMEOUT_MS/);
  assert.match(api, /networkMode: 'always'/);
  assert.match(buyer, /initialData: initialHome/);
  assert.match(ui, /enabled: Boolean\(handle\) && !previewSrc/);
  assert.match(shell, /rel="preload" as="image"/);
  assert.match(shell, /<script async src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"><\/script>/);
  assert.doesNotMatch(router, /scheduleMarketMenuSync/);
  assert.match(worker, /caches\.match\(event\.request\).*cached \|\| fetch/s);

  const directory = new URL('apps/market-mini-app/public/assets/catalog-demo/', ROOT);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.webp'));
  assert.equal(files.length, 12);
  const sizes = await Promise.all(files.map((file) => stat(new URL(file, directory))));
  assert.ok(sizes.every((item) => item.size > 5_000 && item.size < 50_000));
  assert.ok(sizes.reduce((sum, item) => sum + item.size, 0) < 260_000);
});
