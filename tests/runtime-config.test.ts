import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { onRequest as middleware } from '../functions/_middleware';
import { hydrateRuntimeConfig, RUNTIME_CONFIG_KEYS } from '../functions/lib/runtime-config';

const ROOT = path.resolve(import.meta.dirname, '..');

function wranglerRuntimeConfig(): Record<string, string> {
  const source = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');
  const marker = '[vars.GPTBOT_RUNTIME_CONFIG]';
  const section = source.slice(source.indexOf(marker) + marker.length);
  return Object.fromEntries([...section.matchAll(/^([A-Z][A-Z0-9_]*)\s*=\s*"([^"]*)"\s*$/gmu)]
    .map((match) => [match[1], match[2]]));
}

test('the packed public runtime config is complete and stays within one Cloudflare variable', () => {
  const config = wranglerRuntimeConfig();
  assert.deepEqual(Object.keys(config).sort(), [...RUNTIME_CONFIG_KEYS].sort());

  const source = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');
  const packed = /GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u.exec(source)?.[1];
  assert.ok(packed, 'the deployable text binding is missing');
  assert.ok(Buffer.byteLength(packed, 'utf8') <= 5 * 1024);
  assert.deepEqual(JSON.parse(packed), config);
  assert.equal((source.match(/^\[vars\]\s*$/gmu) ?? []).length, 1);
});

test('runtime config hydrates only allowlisted missing values', () => {
  const env = {
    GPTBOT_RUNTIME_CONFIG_JSON: JSON.stringify({
      AEO_MEASUREMENTS_ENABLED: 'true',
      BUNZY_DEFAULT_LOCALE: 'ru',
      JWT_SECRET: 'must-not-be-promoted',
    }),
    BUNZY_DEFAULT_LOCALE: 'uz',
  };

  hydrateRuntimeConfig(env);

  assert.equal((env as Record<string, unknown>).AEO_MEASUREMENTS_ENABLED, 'true');
  assert.equal(env.BUNZY_DEFAULT_LOCALE, 'uz');
  assert.equal((env as Record<string, unknown>).JWT_SECRET, undefined);
});

test('global middleware hydrates the same env object before downstream routes run', async () => {
  const env = { GPTBOT_RUNTIME_CONFIG_JSON: '{"MARKET_MINI_APP_ENABLED":"true"}' };
  let downstreamValue: unknown;
  const response = await middleware({
    request: new Request('https://gptbot.uz/api/example'),
    env,
    next: async () => {
      downstreamValue = (env as Record<string, unknown>).MARKET_MINI_APP_ENABLED;
      return new Response('ok');
    },
  } as never);

  assert.equal(response.status, 200);
  assert.equal(downstreamValue, 'true');
});

test('invalid packed text fails closed and the typed-object fallback remains supported', () => {
  const invalid = { GPTBOT_RUNTIME_CONFIG_JSON: '{broken' };
  hydrateRuntimeConfig(invalid);
  assert.equal((invalid as Record<string, unknown>).MARKET_MINI_APP_ENABLED, undefined);

  const fallback = { GPTBOT_RUNTIME_CONFIG: { MARKET_MINI_APP_ENABLED: 'true' } };
  hydrateRuntimeConfig(fallback);
  assert.equal((fallback as Record<string, unknown>).MARKET_MINI_APP_ENABLED, 'true');
});
