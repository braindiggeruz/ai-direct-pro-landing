import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  authActionAllowed,
  authChallengeMayBeCancelled,
  authMetadataFrom,
  parseDurableAuthMetadata,
} from '../workers/lead-radar-telegram-account/auth-metadata.ts';
import {
  accountRefForOrg,
  createWrappedAccountSeed,
  decryptSnapshot,
  encryptSnapshot,
  parseMasterKey,
  routingKeyFingerprint,
  unwrapAccountSeed,
  wrapAccountSeed,
} from '../workers/lead-radar-telegram-account/crypto.ts';
import {
  gatewayConfigurationBlockers,
} from '../workers/lead-radar-telegram-account/configuration.ts';
import {
  decideEffectReservation,
  expiredTerminalEffectKeys,
  recoverExpiredEffect,
  type EffectLedgerEntry,
  type RetainedEffectLedgerEntry,
} from '../workers/lead-radar-telegram-account/idempotency.ts';
import {
  jsonResponse,
  idempotencyHeaderMatches,
  MAX_MEDIA_VALIDATE_REQUEST_BYTES,
  MAX_SEND_REQUEST_BYTES,
  providerEnvelope,
  readBoundedJson,
  TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
  TDLIB_CONTAINER_SCHEMA,
  validAuthenticationCode,
  validMessage,
  validPassword,
  validPhoneNumber,
  validQrLoginUrl,
  validUsername,
} from '../workers/lead-radar-telegram-account/protocol.ts';
import {
  GATEWAY_DO_CONTROL_TIMEOUT_MS,
  GATEWAY_DO_HEALTH_TIMEOUT_MS,
  GATEWAY_DO_RECONCILE_TIMEOUT_MS,
  GATEWAY_DO_SEND_TIMEOUT_MS,
} from '../workers/lead-radar-telegram-account/timeouts.ts';
import {
  bridgeAuthChallengeMayBeCancelled,
  isFinalizedConnectedAuthRecoverable,
} from '../workers/lead-radar-telegram-account/bridge-protocol.ts';
import {
  PrivateTelegramCampaignSender,
  TELEGRAM_ACCOUNT_CONTROL_REQUEST_TIMEOUT_MS,
  TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS,
  validateTelegramCampaignMedia,
} from '../functions/platform/lead-radar/telegram-account-service.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const GATEWAY = path.join(ROOT, 'workers', 'lead-radar-telegram-account');

function key(seed: number): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
}

test('gateway readiness groups missing setup without exposing configuration values', () => {
  const valid = {
    LEAD_RADAR_TELEGRAM_ACCOUNT_DATA_KEY: Buffer.from(key(11)).toString('base64url'),
    LEAD_RADAR_TELEGRAM_ACCOUNT_ROUTING_KEY: Buffer.from(key(21)).toString('base64url'),
    LEAD_RADAR_TELEGRAM_ACCOUNT_KEY_VERSION: 'v1',
    LEAD_RADAR_TELEGRAM_GATEWAY_VERSION: '1.0.0',
    LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: 't'.repeat(43),
    LEAD_RADAR_TELEGRAM_BRIDGE_PUBLIC_ORIGIN: 'https://lead-radar-bridge.gptbot.uz',
    TELEGRAM_ACCOUNTS: {},
    LEAD_RADAR_CAMPAIGN_MEDIA: {},
  };
  assert.deepEqual(gatewayConfigurationBlockers(valid), []);
  assert.deepEqual(gatewayConfigurationBlockers({}), [
    'gateway_internal_token_missing',
    'gateway_account_keys_missing',
    'gateway_storage_missing',
    'gateway_runtime_config_invalid',
  ]);
  assert.deepEqual(gatewayConfigurationBlockers({
    ...valid,
    LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: 'fixture-token-placeholder',
    LEAD_RADAR_CAMPAIGN_MEDIA: undefined,
  }), ['gateway_internal_token_missing', 'gateway_storage_missing']);
});

test('finalized connected custody remains recoverable after the QR ceremony TTL', () => {
  assert.equal(isFinalizedConnectedAuthRecoverable('connected', true), true);
  assert.equal(isFinalizedConnectedAuthRecoverable('connected', false), false);
  assert.equal(isFinalizedConnectedAuthRecoverable('awaiting_password', true), false);
  const source = readFileSync(path.join(GATEWAY, 'bridge-mailbox.ts'), 'utf8');
  const activeStart = source.indexOf('private async activeAuth');
  const activeEnd = source.indexOf('private async authState', activeStart);
  assert.match(source.slice(activeStart, activeEnd), /isFinalizedConnectedAuthRecoverable/u);
  assert.match(source, /beginConnection[\s\S]{0,2600}isFinalizedConnectedAuthRecoverable/u);
});

test('phone login start returns immediately and lets the owner UI poll Bridge progress', () => {
  const source = readFileSync(path.join(GATEWAY, 'bridge-mailbox.ts'), 'utf8');
  const start = source.indexOf('private async beginPhoneConnection');
  const end = source.indexOf('private async activeAuth', start);
  assert.ok(start >= 0 && end > start);
  const method = source.slice(start, end);
  assert.match(method, /kind: 'connect_phone'/u);
  assert.match(method, /return this\.detailedAuthEnvelope\(auth\)/u);
  const newPhoneCommand = method.slice(method.indexOf("kind: 'connect_phone'"));
  assert.doesNotMatch(newPhoneCommand, /waitTerminal/u);
});

test('an expired adopted phone challenge can be cancelled and replaced', () => {
  const nowMs = Date.parse('2026-08-27T04:10:00.000Z');
  assert.equal(bridgeAuthChallengeMayBeCancelled({
    state: 'awaiting_phone',
    adopted: true,
    finalized: false,
    expiresAt: '2026-08-27T04:09:59.000Z',
    nowMs,
  }), true);
  assert.equal(bridgeAuthChallengeMayBeCancelled({
    state: 'awaiting_phone',
    adopted: true,
    finalized: false,
    expiresAt: '2026-08-27T04:10:01.000Z',
    nowMs,
  }), false);
  assert.equal(bridgeAuthChallengeMayBeCancelled({
    state: 'connected',
    adopted: true,
    finalized: true,
    expiresAt: '2026-08-27T04:09:59.000Z',
    nowMs,
  }), false);
  const source = readFileSync(path.join(GATEWAY, 'bridge-mailbox.ts'), 'utf8');
  const start = source.indexOf('private async beginPhoneConnection');
  const end = source.indexOf('private async activeAuth', start);
  assert.match(source.slice(start, end), /bridgeAuthChallengeMayBeCancelled/u);
  assert.match(source, /private async cancelAuth[\s\S]{0,500}bridgeAuthChallengeMayBeCancelled/u);
});

test('terminal auth history is never exposed or adopted as an active challenge', () => {
  const source = readFileSync(path.join(GATEWAY, 'bridge-mailbox.ts'), 'utf8');
  const activeStart = source.indexOf('private async activeAuth');
  const activeEnd = source.indexOf('private async authState', activeStart);
  const adoptStart = source.indexOf('private async adoptAuth');
  const adoptEnd = source.indexOf('private async finalizeAuth', adoptStart);
  assert.ok(activeStart >= 0 && activeEnd > activeStart);
  assert.ok(adoptStart >= 0 && adoptEnd > adoptStart);
  assert.match(source.slice(activeStart, activeEnd), /\['revoked', 'error'\]\.includes\(auth\.state\)/u);
  assert.match(source.slice(adoptStart, adoptEnd), /\['revoked', 'error'\]\.includes\(auth\.state\)/u);
});

test('Bridge mailbox alarms are monotonic and cleanup is paginated with ciphertext retention', () => {
  const source = readFileSync(path.join(GATEWAY, 'bridge-mailbox.ts'), 'utf8');
  const scheduleStart = source.indexOf('private async scheduleAlarm');
  const scheduleEnd = source.indexOf('private async createPairing', scheduleStart);
  const cleanupStart = source.indexOf('private async cleanup');
  const cleanupEnd = source.indexOf('async alarm()', cleanupStart);
  assert.ok(scheduleStart > 0 && scheduleEnd > scheduleStart);
  assert.ok(cleanupStart > 0 && cleanupEnd > cleanupStart);
  const schedule = source.slice(scheduleStart, scheduleEnd);
  const cleanup = source.slice(cleanupStart, cleanupEnd);
  assert.match(schedule, /getAlarm\(\)/u);
  assert.match(schedule, /scheduled === null \|\| scheduled > desired/u);
  assert.match(cleanup, /CLEANUP_CURSOR_KEY/u);
  assert.match(cleanup, /startAfter/u);
  assert.match(cleanup, /bridge:result-application:/u);
  assert.match(cleanup, /effect, response: null/u);
  assert.match(cleanup, /qrEnvelope: null, relayExpiresAt: null/u);
  assert.match(cleanup, /storage\.delete\(key\)/u);
});

test('routing identity is deterministic, tenant-separated and independent from data keys', async () => {
  const routingKey = key(9);
  const orgA = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const orgB = 'org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const first = await accountRefForOrg(routingKey, orgA);
  assert.equal(first, await accountRefForOrg(routingKey, orgA));
  assert.notEqual(first, await accountRefForOrg(routingKey, orgB));
  assert.match(first, /^lracct_[A-Za-z0-9_-]{43}$/u);
  assert.match(await routingKeyFingerprint(routingKey), /^[a-f0-9]{64}$/u);
  assert.notEqual(await routingKeyFingerprint(routingKey), await routingKeyFingerprint(key(10)));

  const dataKeyA = key(41);
  const dataKeyB = key(77);
  const wrappedA = await createWrappedAccountSeed({
    master: dataKeyA,
    accountRef: first,
    keyVersion: 'v1',
  });
  const rewrapped = await wrapAccountSeed({
    master: dataKeyB,
    accountRef: first,
    keyVersion: 'v2',
    seed: wrappedA.seed,
  });
  assert.deepEqual(
    await unwrapAccountSeed({ master: dataKeyB, accountRef: first, wrapped: rewrapped }),
    wrappedA.seed,
  );
  await assert.rejects(
    unwrapAccountSeed({ master: dataKeyA, accountRef: first, wrapped: rewrapped }),
    /snapshot_key_unwrap_failed/u,
  );
});

test('session snapshots are tenant-bound authenticated ciphertext and reject tampering', async () => {
  const seed = key(3);
  const accountRef = await accountRefForOrg(
    key(17),
    'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  );
  const plaintext = new TextEncoder().encode('bounded session fixture').buffer;
  const ciphertext = await encryptSnapshot({
    seed,
    accountRef,
    generation: 'gen_fixture',
    keyVersion: 'v1',
    plaintext,
  });
  assert.notDeepEqual(new Uint8Array(ciphertext), new Uint8Array(plaintext));
  assert.deepEqual(
    new Uint8Array(await decryptSnapshot({
      seed,
      accountRef,
      generation: 'gen_fixture',
      keyVersion: 'v1',
      ciphertext,
    })),
    new Uint8Array(plaintext),
  );
  const tampered = new Uint8Array(ciphertext.slice(0));
  tampered[tampered.length - 1] ^= 1;
  await assert.rejects(decryptSnapshot({
    seed,
    accountRef,
    generation: 'gen_fixture',
    keyVersion: 'v1',
    ciphertext: tampered.buffer,
  }), /snapshot_decrypt_failed/u);
  await assert.rejects(decryptSnapshot({
    seed,
    accountRef,
    generation: 'gen_other',
    keyVersion: 'v1',
    ciphertext,
  }), /snapshot_decrypt_failed/u);
});

test('effect decisions detect request/payload conflicts and never replay an in-flight effect', () => {
  const sent = {
    schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
    status: 'sent' as const,
    provider_message_id: 'message_1',
  };
  const existing: EffectLedgerEntry = {
    operationId: 'effect_12345678',
    payloadDigest: 'a'.repeat(64),
    response: sent,
    leaseExpiresAt: '2026-08-25T12:01:00.000Z',
  };
  assert.deepEqual(decideEffectReservation({
    operationId: existing.operationId,
    payloadDigest: existing.payloadDigest,
    existing,
    activeOperationId: null,
  }), { kind: 'replay', response: sent });
  assert.equal(decideEffectReservation({
    operationId: existing.operationId,
    payloadDigest: 'b'.repeat(64),
    existing,
    activeOperationId: null,
  }).kind, 'payload_conflict');
  assert.equal(decideEffectReservation({
    operationId: 'effect_new_1234',
    payloadDigest: 'c'.repeat(64),
    existing: null,
    activeOperationId: existing.operationId,
  }).kind, 'account_busy');
  assert.equal(decideEffectReservation({
    operationId: 'effect_new_1234',
    payloadDigest: 'c'.repeat(64),
    existing: null,
    activeOperationId: null,
  }).kind, 'reserve');
  const inFlight = { ...existing, response: null };
  assert.deepEqual(decideEffectReservation({
    operationId: inFlight.operationId,
    payloadDigest: inFlight.payloadDigest,
    existing: inFlight,
    activeOperationId: inFlight.operationId,
  }), {
    kind: 'replay',
    response: { schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'ambiguous' },
  });
});

test('expired provider leases terminalize ambiguous and require account restriction before later work', () => {
  const entry: EffectLedgerEntry = {
    operationId: 'effect_expired_1234',
    payloadDigest: 'd'.repeat(64),
    response: null,
    leaseExpiresAt: '2026-08-25T12:00:30.000Z',
  };
  assert.deepEqual(recoverExpiredEffect({
    activeOperationId: entry.operationId,
    activeEntry: entry,
    nowMs: Date.parse('2026-08-25T12:00:20.000Z'),
  }), {
    clearActive: false,
    restrictAccount: false,
    recoveredEntry: entry,
    corrupted: false,
  });
  const recovered = recoverExpiredEffect({
    activeOperationId: entry.operationId,
    activeEntry: entry,
    nowMs: Date.parse('2026-08-25T12:00:31.000Z'),
  });
  assert.equal(recovered.clearActive, true);
  assert.equal(recovered.restrictAccount, true);
  assert.deepEqual(recovered.recoveredEntry?.response, {
    schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
    status: 'ambiguous',
  });
  assert.equal(decideEffectReservation({
    operationId: 'effect_next_12345',
    payloadDigest: 'e'.repeat(64),
    existing: null,
    activeOperationId: recovered.clearActive ? null : entry.operationId,
  }).kind, 'reserve');
  assert.equal(recoverExpiredEffect({
    activeOperationId: entry.operationId,
    activeEntry: null,
    nowMs: Date.parse('2026-08-25T12:00:31.000Z'),
  }).corrupted, true);
  assert.equal(recoverExpiredEffect({
    activeOperationId: entry.operationId,
    activeEntry: {
      ...entry,
      response: {
        schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
        status: 'sent',
        provider_message_id: 'message_reconciled',
      },
    },
    nowMs: Date.parse('2026-08-25T12:00:31.000Z'),
  }).restrictAccount, false);
});

test('effect retention GC is bounded and deletes only expired terminal non-active entries', () => {
  const nowMs = Date.parse('2026-08-25T12:00:00.000Z');
  const entry = (input: Partial<RetainedEffectLedgerEntry> & Pick<RetainedEffectLedgerEntry, 'operationId'>): RetainedEffectLedgerEntry => ({
    operationId: input.operationId,
    payloadDigest: input.payloadDigest ?? 'a'.repeat(64),
    response: Object.hasOwn(input, 'response')
      ? input.response ?? null
      : {
        schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
        status: 'sent',
        provider_message_id: 'message_fixture',
      },
    leaseExpiresAt: input.leaseExpiresAt ?? '2026-08-25T10:00:00.000Z',
    expiresAt: input.expiresAt ?? '2026-08-25T11:59:59.000Z',
  });
  const entries = [
    { key: 'effect:v1:expired_terminal', entry: entry({ operationId: 'expired_terminal' }) },
    {
      key: 'effect:v1:active_terminal',
      entry: entry({ operationId: 'active_terminal' }),
    },
    {
      key: 'effect:v1:future_terminal',
      entry: entry({
        operationId: 'future_terminal',
        expiresAt: '2026-08-25T12:00:01.000Z',
      }),
    },
    {
      key: 'effect:v1:expired_inflight',
      entry: entry({ operationId: 'expired_inflight', response: null }),
    },
  ];
  assert.deepEqual(expiredTerminalEffectKeys({
    entries,
    activeOperationId: 'active_terminal',
    nowMs,
    limit: 32,
  }), ['effect:v1:expired_terminal']);
  assert.deepEqual(expiredTerminalEffectKeys({
    entries,
    activeOperationId: null,
    nowMs,
    limit: 129,
  }), []);
});

test('durable auth recovery stores metadata only and rejects expired or sensitive extensions', () => {
  const nowMs = Date.parse('2026-08-25T12:00:00.000Z');
  const transientSession = {
    authId: 'auth_123456789012345678',
    operationId: 'auth_operation_1234',
    mode: 'qr' as const,
    expiresAt: '2026-08-25T12:10:00.000Z',
    qrCodeDataUrl: 'data:image/png;base64,AAAA',
    qrLoginUrl: 'tg://login?token=ABCDEFGHIJKLMNOP',
    phoneNumber: '+998901234567',
    code: '12345',
    password: 'must-not-survive',
  };
  const metadata = authMetadataFrom(transientSession);
  assert.deepEqual(Object.keys(metadata).sort(), [
    'authId',
    'expiresAt',
    'mode',
    'operationId',
    'version',
  ]);
  assert.deepEqual(parseDurableAuthMetadata(metadata, nowMs), metadata);
  assert.equal(parseDurableAuthMetadata({ ...metadata, qrLoginUrl: transientSession.qrLoginUrl }, nowMs), null);
  assert.equal(parseDurableAuthMetadata({ ...metadata, expiresAt: '2026-08-25T11:59:59.000Z' }, nowMs), null);
  assert.doesNotMatch(
    JSON.stringify(metadata),
    /data:image|tg:\/\/|phoneNumber|"code"|"password"|998901234567|ABCDEFGHIJKLMNOP/iu,
  );
  assert.equal(authActionAllowed({ mode: 'phone', state: 'awaiting_phone', action: 'phone' }), true);
  assert.equal(authActionAllowed({ mode: 'phone', state: 'awaiting_code', action: 'resend' }), true);
  assert.equal(authActionAllowed({ mode: 'qr', state: 'awaiting_code', action: 'code' }), false);
  assert.equal(authActionAllowed({ mode: 'qr', state: 'awaiting_password', action: 'password' }), true);
  assert.equal(authChallengeMayBeCancelled({
    authId: 'auth_123456789012345678',
    adoptedAuthId: undefined,
    state: 'awaiting_qr',
  }), true);
  assert.equal(authChallengeMayBeCancelled({
    authId: 'auth_123456789012345678',
    adoptedAuthId: 'auth_123456789012345678',
    state: 'awaiting_qr',
  }), false);
  assert.equal(authChallengeMayBeCancelled({
    authId: 'auth_123456789012345678',
    adoptedAuthId: undefined,
    state: 'connected',
  }), false);
});

test('service contract validators are exact, bounded and paid-send fail-closed', async () => {
  assert.equal(validPhoneNumber('+998901234567'), true);
  assert.equal(validPhoneNumber('998901234567'), false);
  assert.equal(validAuthenticationCode('12345'), true);
  assert.equal(validPassword('correct horse battery staple'), true);
  assert.equal(validQrLoginUrl('tg://login?token=ABCDEFGHIJKLMNOP'), true);
  assert.equal(validQrLoginUrl('https://t.me/login?token=ABCDEFGHIJKLMNOP'), false);
  assert.equal(validQrLoginUrl('tg://login?token=ABCDEFGHIJKLMNOP&next=evil'), false);
  assert.equal(validUsername('clinic_uz'), true);
  assert.equal(validUsername('@clinic_uz'), false);
  assert.equal(validMessage('Здравствуйте'), true);
  assert.equal(validMessage('  👩‍💻 e\u0301\nстрока\t  '), true);
  assert.equal(validMessage('left\r\nright'), false);
  assert.equal(validMessage(`left${String.fromCharCode(0xd800)}right`), false);
  assert.equal(validMessage('🚀'.repeat(4_096)), true);
  assert.equal(validMessage(''), false);
  assert.equal(validMessage('x'.repeat(4_097)), false);
  assert.equal(validMessage('🚀'.repeat(1_024), 1_024), true);
  assert.equal(validMessage('🚀'.repeat(1_025), 1_024), false);
  const operationId = 'operation_fixture_1234';
  assert.equal(idempotencyHeaderMatches(
    new Request('https://example.invalid'),
    operationId,
  ), false);
  assert.equal(idempotencyHeaderMatches(
    new Request('https://example.invalid', {
      headers: { 'Idempotency-Key': 'operation_fixture_other' },
    }),
    operationId,
  ), false);
  assert.equal(idempotencyHeaderMatches(
    new Request('https://example.invalid', {
      headers: { 'Idempotency-Key': operationId },
    }),
    operationId,
  ), true);
  assert.deepEqual(providerEnvelope({
    schema: TDLIB_CONTAINER_SCHEMA,
    status: 'rejected',
    code: 'paid_message_required',
  }), {
    schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
    status: 'rejected',
    code: 'paid_message_required',
  });
  assert.equal(providerEnvelope({
    schema: TDLIB_CONTAINER_SCHEMA,
    status: 'rejected',
    code: 'unknown_provider_code',
  }), null);
  const oversized = new Request('https://example.invalid', {
    method: 'POST',
    headers: { 'Content-Length': '24001' },
    body: '{}',
  });
  assert.equal(await readBoundedJson(oversized), null);
  assert.equal(jsonResponse({ status: 'ok' }).headers.get('Cache-Control'), 'no-store, max-age=0');
});

test('only exact pre-effect missing account releases provider-boundary reservations', async () => {
  const send = async (response: Response) => new PrivateTelegramCampaignSender({
    async fetch() { return response; },
  } as Fetcher, 't'.repeat(43)).send({
    orgId: 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    accountId: `lrtgua_${'a'.repeat(32)}`,
    gatewayAccountRef: `lracct_${'a'.repeat(43)}`,
    username: 'clinic_fixture',
    text: 'Exact fixture',
    randomId: 'effect_fixture_1234',
    media: null,
  });
  assert.deepEqual(await send(Response.json({
    schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
    status: 'error',
    reason_code: 'account_not_found',
  }, { status: 404 })), {
    kind: 'rejected',
    code: 'account_session_missing',
  });
  assert.deepEqual(await send(Response.json({
    schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
    status: 'error',
    reason_code: 'account_not_found',
    extra: true,
  }, { status: 404 })), { kind: 'ambiguous' });
  assert.deepEqual(await send(new Response(null, { status: 503 })), { kind: 'ambiguous' });
});

test('media preapproval uses one exact bounded private request and closed outcomes', async () => {
  assert.equal(MAX_MEDIA_VALIDATE_REQUEST_BYTES, MAX_SEND_REQUEST_BYTES);
  const bytes = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const media = {
    objectKey: `lead-radar/campaign-media/org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/lrtgcm_${'a'.repeat(32)}`,
    mediaId: `lrtgcm_${'a'.repeat(32)}`,
    mediaDigest: digest,
    filename: 'fixture.png',
    mimeType: 'image/png' as const,
    sizeBytes: bytes.byteLength,
    width: 1,
    height: 1,
    expiresAt: '2026-08-26T12:00:00.000Z',
  };

  const outcomes: Array<'valid' | 'invalid'> = ['valid', 'invalid'];
  for (const outcome of outcomes) {
    let calls = 0;
    const service = {
      async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        calls += 1;
        assert.equal(new URL(String(input)).pathname, '/v1/media/validate');
        assert.equal(init?.method, 'POST');
        assert.equal(new Headers(init?.headers).get('Idempotency-Key'), 'media_validate_fixture_1234');
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        assert.deepEqual(Object.keys(body).sort(), [
          'media', 'operation_id', 'org_id', 'schema',
        ]);
        assert.deepEqual(Object.keys(body.media as object).sort(), [
          'media_digest', 'media_id', 'mime_type', 'size_bytes', 'source_object_key',
        ]);
        return Response.json(outcome === 'valid'
          ? { schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'valid' }
          : {
              schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
              status: 'rejected',
              code: 'media_invalid',
            });
      },
    } as Fetcher;
    assert.equal(await validateTelegramCampaignMedia({
      service,
      orgId: 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      operationId: 'media_validate_fixture_1234',
      media,
      internalServiceToken: 't'.repeat(43),
    }), outcome);
    assert.equal(calls, 1);
  }
});

test('media preapproval container is decode-only and destroys validation-only runtime', () => {
  const service = readFileSync(path.join(ROOT, 'functions/platform/lead-radar/telegram-account-service.ts'), 'utf8');
  const gateway = readFileSync(path.join(GATEWAY, 'index.ts'), 'utf8');
  const accountObject = readFileSync(path.join(GATEWAY, 'account-object.ts'), 'utf8');
  const container = readFileSync(path.join(GATEWAY, 'container', 'server.py'), 'utf8');
  assert.match(service, /serviceFetch\(input\.service, '\/v1\/media\/validate'/u);
  assert.match(gateway, /case '\/v1\/media\/validate': return validateMedia/u);
  assert.match(accountObject, /case '\/internal\/media\/validate': return this\.validateMedia/u);
  const methodStart = accountObject.indexOf('private async validateMedia(body: JsonRecord)');
  const methodEnd = accountObject.indexOf('private async reconcileMessage', methodStart);
  assert.ok(methodStart > 0 && methodEnd > methodStart);
  const validationMethod = accountObject.slice(methodStart, methodEnd);
  assert.match(validationMethod, /enableInternet: false/u);
  assert.match(validationMethod, /await container\.destroy\(\)/u);
  assert.doesNotMatch(validationMethod, /ensureClient|saveSnapshot|sendMessage/u);
  assert.match(container, /if self\.path == "\/v1\/media\/validate"/u);
  assert.match(container, /return validate_media_for_preapproval\(value\)/u);
  assert.match(container, /MEDIA_VALIDATION_ONLY/u);
});

test('active QR recovery refreshes provider state and rejects a null challenge', () => {
  const accountObject = readFileSync(path.join(GATEWAY, 'account-object.ts'), 'utf8');
  const hydrateStart = accountObject.indexOf('private async hydrateAuth');
  const hydrateEnd = accountObject.indexOf('private async refreshAuth', hydrateStart);
  const helperStart = accountObject.indexOf('private async refreshPresentableAuth');
  const helperEnd = accountObject.indexOf('private async beginAuth', helperStart);
  const statusStart = accountObject.indexOf('private async authStatus');
  const statusEnd = accountObject.indexOf('private async cancelAuth', statusStart);
  const activeStart = accountObject.indexOf('private async activeConnection');
  const activeEnd = accountObject.indexOf('private async disconnect', activeStart);
  assert.ok(hydrateStart > 0 && hydrateEnd > hydrateStart);
  assert.ok(helperStart > 0 && helperEnd > helperStart);
  assert.ok(statusStart > 0 && statusEnd > statusStart);
  assert.ok(activeStart > 0 && activeEnd > activeStart);
  const hydrate = accountObject.slice(hydrateStart, hydrateEnd);
  const helper = accountObject.slice(helperStart, helperEnd);
  const status = accountObject.slice(statusStart, statusEnd);
  const active = accountObject.slice(activeStart, activeEnd);
  // A same-isolate cached AuthSession must still restore a stopped/replaced
  // Container before any state read. This guards the former early-return bug.
  assert.doesNotMatch(hydrate, /return this\.authSession/u);
  assert.match(hydrate, /await this\.ensureClient\(account\)[\s\S]{0,80}return session/u);
  assert.match(helper, /await this\.refreshAuth\(session\)/u);
  assert.match(helper, /await this\.containerJson\('\/v1\/auth\/qr'/u);
  assert.match(helper, /refreshed\.state === 'awaiting_qr'/u);
  assert.match(helper, /!refreshed\.qrCodeDataUrl[\s\S]{0,100}!refreshed\.qrLoginUrl/u);
  assert.match(helper, /throw new GatewayFault\('qr_unavailable'\)/u);
  // Polling must take the same presentability path so a restarted TDLib client
  // reissues QR, and a failed/null reissue becomes 503 instead of false-ready.
  assert.match(status, /this\.refreshPresentableAuth\(session\)/u);
  assert.match(active, /this\.refreshPresentableAuth\(active\)/u);
});

test('provisional login custody survives abandoned QR flows until D1 finalization', () => {
  const accountObject = readFileSync(path.join(GATEWAY, 'account-object.ts'), 'utf8');
  const gateway = readFileSync(path.join(GATEWAY, 'index.ts'), 'utf8');
  const service = readFileSync(
    path.join(ROOT, 'functions/platform/lead-radar/telegram-account-service.ts'),
    'utf8',
  );
  const beginStart = accountObject.indexOf('private async beginAuth');
  const beginEnd = accountObject.indexOf('private async activeAuth', beginStart);
  const cleanupStart = accountObject.indexOf('private async cleanupExpiredProvisionalAuth');
  const cleanupEnd = accountObject.indexOf('private async hydrateAuth', cleanupStart);
  const finalizeStart = accountObject.indexOf('private async finalizeAuth');
  const finalizeEnd = accountObject.indexOf('private async activeConnection', finalizeStart);
  assert.ok(beginStart > 0 && beginEnd > beginStart);
  assert.ok(cleanupStart > 0 && cleanupEnd > cleanupStart);
  assert.ok(finalizeStart > 0 && finalizeEnd > finalizeStart);
  const begin = accountObject.slice(beginStart, beginEnd);
  const cleanup = accountObject.slice(cleanupStart, cleanupEnd);
  const finalize = accountObject.slice(finalizeStart, finalizeEnd);
  // The alarm marker is durable before a QR/provider action can happen.
  assert.ok(begin.indexOf('ensureProvisionalAuth(session)') < begin.indexOf("containerJson(action"));
  assert.match(accountObject, /override async alarm\(\)[\s\S]{0,120}cleanupExpiredProvisionalAuth/u);
  // Expired custody is released only after confirmed provider logout, runtime
  // destruction and snapshot deletion. Failure retains the marker and alarm.
  assert.ok(cleanup.indexOf("containerJson('/v1/account/disconnect'")
    < cleanup.indexOf('transaction.delete(PROVISIONAL_AUTH_KEY)'));
  assert.ok(cleanup.indexOf('this.container().destroy()')
    < cleanup.indexOf('transaction.delete(PROVISIONAL_AUTH_KEY)'));
  assert.match(cleanup, /retryCount[\s\S]{0,300}setAlarm/u);
  assert.match(finalize, /account\.status !== 'connected'/u);
  assert.match(finalize, /transaction\.put\(ADOPTED_AUTH_KEY, body\.auth_id\)[\s\S]{0,160}transaction\.delete\(PROVISIONAL_AUTH_KEY\)/u);
  assert.match(gateway, /case '\/v1\/accounts\/connect\/finalize': return authAction/u);
  assert.match(service, /serviceFetch\(input\.service, '\/v1\/accounts\/connect\/finalize'/u);
});

test('nested gateway deadlines leave an outer-caller margin and stay queue-bounded', () => {
  assert.equal(GATEWAY_DO_CONTROL_TIMEOUT_MS, 75_000);
  assert.equal(GATEWAY_DO_SEND_TIMEOUT_MS, 120_000);
  assert.ok(GATEWAY_DO_HEALTH_TIMEOUT_MS < GATEWAY_DO_CONTROL_TIMEOUT_MS);
  assert.ok(GATEWAY_DO_CONTROL_TIMEOUT_MS < TELEGRAM_ACCOUNT_CONTROL_REQUEST_TIMEOUT_MS);
  assert.ok(GATEWAY_DO_RECONCILE_TIMEOUT_MS < GATEWAY_DO_SEND_TIMEOUT_MS);
  assert.ok(GATEWAY_DO_SEND_TIMEOUT_MS < TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS);
  assert.ok(TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS < 15 * 60_000);
});

test('gateway deployment descriptor is Workers Free and exposes only authenticated Bridge routes', () => {
  const wrangler = readFileSync(path.join(GATEWAY, 'wrangler.toml'), 'utf8');
  assert.match(wrangler, /workers_dev = true/u);
  assert.match(
    wrangler,
    /LEAD_RADAR_TELEGRAM_BRIDGE_PUBLIC_ORIGIN = "https:\/\/gptbot-lead-radar-telegram-account\.braindigger-uz\.workers\.dev"/u,
  );
  assert.doesNotMatch(wrangler, /\[\[routes\]\]|custom_domain/u);
  assert.match(wrangler, /new_sqlite_classes = \["LeadRadarTelegramBridgeMailbox"\]/u);
  assert.match(wrangler, /binding = "LEAD_RADAR_CAMPAIGN_MEDIA"/u);
  assert.doesNotMatch(wrangler, /\[\[containers\]\]|TELEGRAM_SESSION_BUCKET|TELEGRAM_API_ID|TELEGRAM_API_HASH/u);
});

test('pinned TDLib JSON payload and acknowledgement contracts are represented exactly', () => {
  const server = readFileSync(path.join(GATEWAY, 'container', 'server.py'), 'utf8');
  const schema = readFileSync(path.join(GATEWAY, 'container', 'tdlib-schema-contract.txt'), 'utf8');
  assert.match(schema, /sendMessage chat_id:int53 topic_id:MessageTopic reply_to:InputMessageReplyTo/u);
  assert.match(schema, /messageSendOptions suggested_post_info:inputSuggestedPostInfo/u);
  assert.match(schema, /phoneNumberAuthenticationSettings .*firebase_authentication_settings/u);
  assert.match(schema, /inputMessageText text:formattedText link_preview_options:linkPreviewOptions clear_draft:Bool/u);
  assert.match(schema, /inputPhoto photo:InputFile thumbnail:inputThumbnail video:InputFile added_sticker_file_ids:vector<int32> width:int32 height:int32 = InputPhoto;/u);
  assert.match(schema, /inputMessagePhoto photo:inputPhoto caption:formattedText show_caption_above_media:Bool self_destruct_type:MessageSelfDestructType has_spoiler:Bool = InputMessageContent;/u);
  assert.match(schema, /updateMessageSendSucceeded message:message old_message_id:int53/u);
  assert.match(server, /"topic_id": None/u);
  assert.match(server, /"suggested_post_info": None/u);
  assert.match(server, /"firebase_authentication_settings": None/u);
  assert.match(server, /SAFE_QR_LOGIN_URL = re\.compile/u);
  assert.match(server, /result\["qr_login_url"\] = client\.qr_link/u);
  assert.match(server, /old_message_id = event\.get\("old_message_id"\)/u);
  assert.match(server, /chat_type\.get\("@type"\) != "chatTypePrivate"/u);
  assert.match(server, /user_type\.get\("@type"\) != "userTypeRegular"/u);
  assert.match(server, /"@type": "inputMessagePhoto"[\s\S]{0,500}"@type": "inputPhoto"[\s\S]{0,300}"@type": "inputFileLocal"/u);
  assert.doesNotMatch(server, /allow_paid_broadcast": True|paid_message_star_count": [1-9]/u);
});

test('session custody limits fit the Worker memory budget and credentials stay out of ledgers', () => {
  const objectSource = readFileSync(path.join(GATEWAY, 'account-object.ts'), 'utf8');
  const authMetadataSource = readFileSync(path.join(GATEWAY, 'auth-metadata.ts'), 'utf8');
  const server = readFileSync(path.join(GATEWAY, 'container', 'server.py'), 'utf8');
  assert.match(objectSource, /MAX_SNAPSHOT_BYTES = 24 \* 1024 \* 1024/u);
  assert.match(server, /MAX_ARCHIVE_BYTES = 24 \* 1024 \* 1024/u);
  assert.match(server, /MAX_UNCOMPRESSED_BYTES = 96 \* 1024 \* 1024/u);
  assert.match(server, /MAX_ARCHIVE_MEMBERS = 4_096/u);
  assert.match(objectSource, /ACTIVE_AUTH_KEY = 'auth:active:v1'/u);
  assert.match(objectSource, /storage\.put\(ACTIVE_AUTH_KEY, authMetadataFrom\(session\)\)/u);
  assert.match(objectSource, /storage\.list<unknown>\(\{ prefix: 'effect:v1:', limit: EFFECT_GC_LIMIT \}\)/u);
  const durableAuthInterface = authMetadataSource.slice(
    authMetadataSource.indexOf('export interface DurableAuthMetadata'),
    authMetadataSource.indexOf('export type DurableAuthMode'),
  );
  assert.doesNotMatch(
    durableAuthInterface,
    /\b(?:qrCodeDataUrl|qrLoginUrl|phoneNumber|code|password)\s*:/u,
  );
  const ledgerSchema = server.slice(
    server.indexOf('CREATE TABLE IF NOT EXISTS effects'),
    server.indexOf(') STRICT'),
  );
  assert.doesNotMatch(
    ledgerSchema,
    /\b(?:phone|username|password|message_body|message_text|raw_text)\b/iu,
  );
  assert.match(server, /def log_message\([\s\S]*?return/u);
  assert.doesNotMatch(server, /print\s*\(/u);
  assert.doesNotMatch(`${objectSource}\n${server}`, /TELEGRAM_BOT_TOKEN/u);
});

test('master key parser accepts only 32 bytes', () => {
  const valid = Buffer.alloc(32, 7).toString('base64url');
  assert.equal(parseMasterKey(valid)?.byteLength, 32);
  assert.equal(parseMasterKey(Buffer.alloc(31, 7).toString('base64url')), null);
  assert.equal(parseMasterKey('not-base64!'), null);
});
