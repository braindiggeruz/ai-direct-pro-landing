import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  issueMediaHandle,
  verifyMediaHandle,
} from '../functions/platform/market';

const ROOT = new URL('../', import.meta.url);

function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

const SECRET = `unit-test-only-${'a'.repeat(40)}`;
const OTHER_SECRET = `unit-test-only-${'b'.repeat(40)}`;

test('the Worker is placed next to D1, not next to the shopper', async () => {
  // The database is in ENAM. A launch makes three dependent D1 queries, so at
  // the edge in Tashkent it paid three trans-continental round trips before the
  // storefront could render. Smart Placement crosses the ocean once instead.
  const config = await source('wrangler.toml');
  assert.match(config, /^\[placement\]$/m);
  assert.match(config, /^mode = "smart"$/m);
});

test('a media handle stays valid however many are issued at once', async () => {
  // One launch signs a handle per image per product on the home screen. The key
  // is now imported once per isolate; every handle must still verify.
  const handles = await Promise.all(
    Array.from({ length: 40 }, (_, index) => issueMediaHandle(SECRET, {
      productId: `p-${index}`,
      index: index % 5,
    })),
  );
  assert.equal(new Set(handles).size, handles.length);
  for (const [index, handle] of handles.entries()) {
    const verified = await verifyMediaHandle(SECRET, handle);
    assert.deepEqual(verified, { productId: `p-${index}`, index: index % 5 });
  }
});

test('the memoized key is bound to its secret and never leaks across one', async () => {
  // The cache is keyed on the secret. A handle signed under one secret must not
  // verify under another, and switching back must still work.
  const first = await issueMediaHandle(SECRET, { productId: 'p-1', index: 0 });
  const second = await issueMediaHandle(OTHER_SECRET, { productId: 'p-1', index: 0 });
  assert.notEqual(first, second);
  assert.equal(await verifyMediaHandle(OTHER_SECRET, first), null);
  assert.equal(await verifyMediaHandle(SECRET, second), null);
  assert.deepEqual(
    await verifyMediaHandle(SECRET, await issueMediaHandle(SECRET, { productId: 'p-2', index: 1 })),
    { productId: 'p-2', index: 1 },
  );
});

test('a tampered handle is still refused after memoization', async () => {
  const handle = await issueMediaHandle(SECRET, { productId: 'p-3', index: 2 });
  const [payload, signature] = handle.split('.');
  assert.equal(await verifyMediaHandle(SECRET, `${payload}x.${signature}`), null);
  assert.equal(await verifyMediaHandle(SECRET, `${payload}.${signature}x`), null);
  assert.equal(await verifyMediaHandle(SECRET, payload), null);
});

test('the launch chain is the shape the placement fix assumes', async () => {
  const router = await source('functions/market/router.ts');
  const wrangler = await source('wrangler.toml');
  // The chain was identity -> storefront binding -> catalog, three round trips
  // each waiting on the previous answer. Two of them still are: binding needs
  // the identity. The third no longer is — which storefront a fresh launch
  // lands on depends on the bot, so it and its shelf are read alongside the
  // identity instead of after the binding.
  assert.match(router, /getOrCreateIdentity\(/);
  assert.match(router, /bindMarketLaunch\(/);
  assert.match(router, /const directAhead = includeLaunch/);
  assert.match(router, /const shelfAhead = directAhead\?\.then/);
  assert.ok(
    router.indexOf('const shelfAhead') < router.indexOf('await services.identities.getOrCreateIdentity'),
    'the speculative read must start before the identity is awaited',
  );
  // The old read stays as the fallback for any storefront that is not the one
  // guessed, so a second store still gets its own shelf.
  assert.match(router, /: await catalogHomePayload\(context\)/);
  // Seller resolution stays off the launch path.
  assert.match(router, /resolveMarketAccess\([\s\S]{0,200}!includeLaunch,/);
  // Placement rationale must state the chain that actually remains.
  assert.match(wrangler, /dependent D1 round trips remain/i);
});
