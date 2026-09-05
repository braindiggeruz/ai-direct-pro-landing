import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

test('actual Workers runtime reaches provider, preserves output, and refuses credential redirects', async () => {
  const bundle = await build({
    stdin: {
      contents: `import { observe } from './functions/platform/aeo/observation';
        export default { async fetch() { return Response.json(await observe('Where can I buy cake?', 'nvidia/nemotron-3-super-120b-a12b:free', ' fixture-key ')); } };`,
      resolveDir: process.cwd(),
    },
    bundle: true, format: 'esm', platform: 'browser', write: false,
  });
  let calls = 0;
  let redirect = false;
  const worker = new Miniflare({
    modules: true,
    script: bundle.outputFiles[0].text,
    outboundService: async (request) => {
      calls++;
      assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(request.headers.get('Authorization'), 'Bearer fixture-key');
      const body = await request.json() as { provider: { max_price: unknown }; model: string; reasoning: unknown; max_tokens: number };
      assert.equal(body.model, 'nvidia/nemotron-3-super-120b-a12b:free');
      assert.deepEqual(body.reasoning, { enabled: false, exclude: true });
      assert.equal(body.max_tokens, 4096);
      assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0, request: 0 });
      return redirect
        ? new Response(null, { status: 302, headers: { Location: 'https://untrusted.test/' } })
        : Response.json({ model: 'provider/model:free', choices: [{ finish_reason: 'stop', message: { content: 'A real transport fixture answer.' } }] });
    },
  });
  try {
    const success = await (await worker.dispatchFetch('http://localhost')).json() as { ok: boolean; text: string };
    assert.equal(success.ok, true);
    assert.equal(success.text, 'A real transport fixture answer.');
    assert.equal(calls, 1);
    redirect = true;
    const failed = await (await worker.dispatchFetch('http://localhost')).json() as { ok: boolean; error: string };
    assert.equal(failed.ok, false);
    assert.match(failed.error, /302/);
    assert.equal(calls, 2, 'redirect never triggers a second request');
  } finally { await worker.dispose(); }
});
