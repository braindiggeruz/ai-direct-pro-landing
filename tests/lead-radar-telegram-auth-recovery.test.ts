import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../src/admin/lib/api';
import { awaitTelegramPhoneChallenge } from '../src/admin/lib/lead-radar-telegram-auth';
import type { LeadRadarTelegramAccountQr, LeadRadarTelegramAccountState } from '../src/admin/lib/lead-radar-campaign';

function challenge(ready = false): LeadRadarTelegramAccountQr {
  return { authId: 'auth_fixture1234567890', orgId: 'org_fixture', deviceId: `lrtgbd_${'1'.repeat(32)}`, bridgeCommandId: `lrtgbc_${'2'.repeat(32)}`, expiresAt: new Date(Date.now() + 600_000).toISOString(), qrEnvelope: null, inputCommandId: ready ? `lrtgbc_${'3'.repeat(32)}` : null, inputAction: ready ? 'phone' : null, passwordCommandId: null, bridgeEncryptionKey: ready ? { alg: 'RSA-OAEP-256', keyId: '4'.repeat(64), spki: 'A'.repeat(400) } : null };
}
function state(ready = false): LeadRadarTelegramAccountState {
  return { status: 'connecting', connectionId: 'account_fixture', displayName: null, username: null, phoneMasked: null, connectedAt: null, lastHealthAt: null, qr: challenge(ready), authState: ready ? 'awaiting_phone' : 'starting', pendingAction: null, reasonCode: null };
}

test('one explicit click can recover a missing phone channel with read-only polls', async () => {
  let reads = 0;
  const next = await awaitTelegramPhoneChallenge(challenge(), async authId => {
    assert.equal(authId, challenge().authId);
    return state(++reads >= 3);
  }, { signal: new AbortController().signal, intervalMs: 1 });
  assert.equal(reads, 3);
  assert.equal(next.connectionId, 'account_fixture', 'keep the actual server account, not a fabricated replacement');
  assert.equal(next.qr.inputAction, 'phone');
  assert.ok(next.qr.inputCommandId);
});

test('a stalled status read cannot leave phone preparation spinning forever', async () => {
  let requestSignal: AbortSignal | undefined;
  await assert.rejects(awaitTelegramPhoneChallenge(challenge(), async (_authId, signal) => {
    requestSignal = signal;
    return new Promise(() => {});
  }, { signal: new AbortController().signal, timeoutMs: 10 }), { code: 'telegram_bridge_preparation_timeout' });
  assert.equal(requestSignal?.aborted, true);
});

test('unmount/cancel stops pending preparation without sending or retrying anything', async () => {
  const controller = new AbortController();
  const pending = awaitTelegramPhoneChallenge(challenge(), () => new Promise(() => {}), { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { code: 'telegram_auth_cancelled' });
});

test('recovery rejects cross-tenant, cross-device and replaced auth challenges', async () => {
  for (const field of ['orgId', 'deviceId', 'authId'] as const) {
    const next = state(true);
    next.qr![field] = 'different';
    await assert.rejects(awaitTelegramPhoneChallenge(challenge(), async () => next, { signal: new AbortController().signal }), { code: 'telegram_auth_state_changed' });
  }
});

test('an already queued phone submission and a later auth step are never submitted again', async () => {
  for (const changes of [{ pendingAction: 'phone' as const }, { authState: 'awaiting_code' as const }, { status: 'connected' as const }]) {
    await assert.rejects(awaitTelegramPhoneChallenge(challenge(), async () => ({ ...state(true), ...changes }), { signal: new AbortController().signal }), { code: 'telegram_auth_state_changed' });
  }
});

test('expired or malformed challenges cannot release a phone submission', async () => {
  for (const expiresAt of [new Date(Date.now() - 1).toISOString(), 'invalid']) {
    const next = state(true);
    next.qr!.expiresAt = expiresAt;
    await assert.rejects(awaitTelegramPhoneChallenge(challenge(), async () => next, { signal: new AbortController().signal }), { code: 'telegram_auth_expired' });
  }
});

test('API deadline covers a stalled JSON body after HTTP 200 headers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  let signal: AbortSignal | undefined;
  let rejectBody: ((reason: Error) => void) | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    signal = init.signal!;
    return { status: 200, ok: true, json: () => new Promise((_resolve, reject) => {
      rejectBody = reject;
      signal!.addEventListener('abort', () => reject(new Error('body_aborted')), { once: true });
    }) } as Response;
  });
  const request = api.leadRadarTelegramAccountConnectStatus('auth_fixture1234567890');
  // Attach the rejection assertion before advancing the deadline.
  const rejected = assert.rejects(request, /body_aborted/);
  try {
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(signal?.aborted, false);
    t.mock.timers.tick(15_001);
    assert.equal(signal?.aborted, true, 'response body must remain inside the deadline');
    await rejected;
  } finally {
    rejectBody?.(new Error('body_aborted'));
    await rejected;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
