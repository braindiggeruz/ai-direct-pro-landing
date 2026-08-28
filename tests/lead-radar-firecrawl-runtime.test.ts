import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

test('Firecrawl native fetch works in actual workerd, with all outbound traffic mocked', async () => {
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
      import { FirecrawlClient } from './functions/platform/lead-radar/firecrawl-client';
      export default { async fetch() {
        const store = {
          completedResults: async () => new Map(), preflight: async () => null,
          reserve: async () => 'fixture-reservation', finish: async () => {},
        };
        const client = new FirecrawlClient({ key: 'fixture-only', mode: 'shadow',
          limits: { dailyCredits: 200, searchCredits: 140, domainCredits: 14, companyCredits: 7 } },
          store, { orgId: 'fixture', jobId: 'fixture', searchId: 'fixture', companyId: 'fixture', leaseOwner: 'fixture', leaseGeneration: 1 });
        try { return Response.json(await client.request('map', 'clinic.invalid', {}, (data) => data.links)); }
        catch (error) { return Response.json({ error: error.code }, { status: 500 }); }
      }};
    ` },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent',
  });
  let requests = 0;
  const runtime = new Miniflare({
    modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-07-28',
    outboundService(request) {
      assert.equal(request.url, 'https://api.firecrawl.dev/v2/map');
      requests++;
      return Response.json({ success: true, links: ['https://clinic.invalid/contacts'] });
    },
  });
  try {
    const response = await runtime.dispatchFetch('http://local/');
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify({ payload, requests }));
    assert.deepEqual(payload, ['https://clinic.invalid/contacts']);
    assert.equal(requests, 1);
  } finally { await runtime.dispose(); }
});
