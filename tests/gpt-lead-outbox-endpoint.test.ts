import { test } from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost } from '../functions/api/internal/gpt/lead-outbox';
import { SqliteD1 } from './helpers/sqlite-d1';

function invoke(secret: string | undefined, supplied: string | undefined, db?: SqliteD1) {
  return onRequestPost({
    request: new Request('https://gptbot.uz/api/internal/gpt/lead-outbox', {
      method: 'POST',
      headers: supplied ? { 'X-Internal-Secret': supplied } : {},
    }),
    env: {
      ...(secret ? { GPTBOT_INTERNAL_API_SECRET: secret } : {}),
      ...(db ? { GPTBOT_DRAFTS_DB: db.asD1() } : {}),
    },
  } as never);
}

test('lead outbox drain stays undiscoverable until its internal secret is configured', async () => {
  const response = await invoke(undefined, undefined);
  assert.equal(response.status, 404);
  assert.equal((await response.json() as { code: string }).code, 'not_found');
});

test('lead outbox drain rejects missing and mismatched credentials', async () => {
  const missing = await invoke('internal-fixture-secret', undefined);
  assert.equal(missing.status, 401);
  const wrong = await invoke('internal-fixture-secret', 'wrong-fixture-secret');
  assert.equal(wrong.status, 401);
});

test('authenticated lead outbox drain requires D1 and returns evidence-grade counts', async () => {
  const noStorage = await invoke('internal-fixture-secret', 'internal-fixture-secret');
  assert.equal(noStorage.status, 503);

  const db = new SqliteD1();
  const response = await invoke('internal-fixture-secret', 'internal-fixture-secret', db);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    attempted: 0,
    sent: 0,
    pending: 0,
    blocked: 0,
  });
});
