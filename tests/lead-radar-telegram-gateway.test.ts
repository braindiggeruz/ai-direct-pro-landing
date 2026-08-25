import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  authActionAllowed,
  authMetadataFrom,
  parseDurableAuthMetadata,
} from '../workers/lead-radar-telegram-account/auth-metadata.ts';
import {
  accountRefForOrg,
  createWrappedAccountSeed,
  decryptSnapshot,
  encryptSnapshot,
  parseMasterKey,
  unwrapAccountSeed,
  wrapAccountSeed,
} from '../workers/lead-radar-telegram-account/crypto.ts';
import {
  decideEffectReservation,
  expiredTerminalEffectKeys,
  recoverExpiredEffect,
  type EffectLedgerEntry,
  type RetainedEffectLedgerEntry,
} from '../workers/lead-radar-telegram-account/idempotency.ts';
import {
  jsonResponse,
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
  TELEGRAM_ACCOUNT_CONTROL_REQUEST_TIMEOUT_MS,
  TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS,
} from '../functions/platform/lead-radar/telegram-account-service.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const GATEWAY = path.join(ROOT, 'workers', 'lead-radar-telegram-account');
const PINNED_TDLIB_COMMIT = 'd1085f9cebc5a62379991ae1652673954f229c1f';
const PINNED_DEBIAN_DIGEST = 'sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171';

function key(seed: number): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
}

test('routing identity is deterministic, tenant-separated and independent from data keys', async () => {
  const routingKey = key(9);
  const orgA = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const orgB = 'org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const first = await accountRefForOrg(routingKey, orgA);
  assert.equal(first, await accountRefForOrg(routingKey, orgA));
  assert.notEqual(first, await accountRefForOrg(routingKey, orgB));
  assert.match(first, /^lracct_[A-Za-z0-9_-]{43}$/u);

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

test('expired provider leases recover only as terminal ambiguous and unblock later work', () => {
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
  }), { clearActive: false, recoveredEntry: entry, corrupted: false });
  const recovered = recoverExpiredEffect({
    activeOperationId: entry.operationId,
    activeEntry: entry,
    nowMs: Date.parse('2026-08-25T12:00:31.000Z'),
  });
  assert.equal(recovered.clearActive, true);
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
  assert.equal(validMessage(''), false);
  assert.equal(validMessage('x'.repeat(4_097)), false);
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

test('nested gateway deadlines leave an outer-caller margin and stay queue-bounded', () => {
  assert.equal(GATEWAY_DO_CONTROL_TIMEOUT_MS, 75_000);
  assert.equal(GATEWAY_DO_SEND_TIMEOUT_MS, 120_000);
  assert.ok(GATEWAY_DO_HEALTH_TIMEOUT_MS < GATEWAY_DO_CONTROL_TIMEOUT_MS);
  assert.ok(GATEWAY_DO_CONTROL_TIMEOUT_MS < TELEGRAM_ACCOUNT_CONTROL_REQUEST_TIMEOUT_MS);
  assert.ok(GATEWAY_DO_RECONCILE_TIMEOUT_MS < GATEWAY_DO_SEND_TIMEOUT_MS);
  assert.ok(GATEWAY_DO_SEND_TIMEOUT_MS < TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS);
  assert.ok(TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS < 15 * 60_000);
});

test('gateway deployment descriptor is private and supply-chain inputs are pinned', () => {
  const wrangler = readFileSync(path.join(GATEWAY, 'wrangler.toml'), 'utf8');
  const dockerfile = readFileSync(path.join(GATEWAY, 'container', 'Dockerfile'), 'utf8');
  const schema = readFileSync(path.join(GATEWAY, 'container', 'tdlib-schema-contract.txt'), 'utf8');
  assert.match(wrangler, /workers_dev = false/u);
  assert.doesNotMatch(wrangler, /\[\[routes\]\]|route\s*=/u);
  assert.match(wrangler, /new_sqlite_classes = \["LeadRadarTelegramAccount"\]/u);
  assert.match(wrangler, /binding = "TELEGRAM_SESSION_BUCKET"/u);
  assert.match(wrangler, new RegExp(PINNED_TDLIB_COMMIT, 'u'));
  assert.match(dockerfile, new RegExp(`ARG TDLIB_COMMIT=${PINNED_TDLIB_COMMIT}`, 'u'));
  assert.equal((dockerfile.match(new RegExp(PINNED_DEBIAN_DIGEST, 'gu')) ?? []).length, 1);
  assert.match(dockerfile, /snapshot\.debian\.org\/archive\/debian/u);
  assert.match(schema, new RegExp(PINNED_TDLIB_COMMIT, 'u'));
  assert.match(dockerfile, /github\.com\/tdlib\/td\.git/u);
});

test('pinned TDLib JSON payload and acknowledgement contracts are represented exactly', () => {
  const server = readFileSync(path.join(GATEWAY, 'container', 'server.py'), 'utf8');
  const schema = readFileSync(path.join(GATEWAY, 'container', 'tdlib-schema-contract.txt'), 'utf8');
  assert.match(schema, /sendMessage chat_id:int53 topic_id:MessageTopic reply_to:InputMessageReplyTo/u);
  assert.match(schema, /messageSendOptions suggested_post_info:inputSuggestedPostInfo/u);
  assert.match(schema, /phoneNumberAuthenticationSettings .*firebase_authentication_settings/u);
  assert.match(schema, /inputMessageText text:formattedText link_preview_options:linkPreviewOptions clear_draft:Bool/u);
  assert.match(schema, /updateMessageSendSucceeded message:message old_message_id:int53/u);
  assert.match(server, /"topic_id": None/u);
  assert.match(server, /"suggested_post_info": None/u);
  assert.match(server, /"firebase_authentication_settings": None/u);
  assert.match(server, /SAFE_QR_LOGIN_URL = re\.compile/u);
  assert.match(server, /result\["qr_login_url"\] = client\.qr_link/u);
  assert.match(server, /old_message_id = event\.get\("old_message_id"\)/u);
  assert.match(server, /chat_type\.get\("@type"\) != "chatTypePrivate"/u);
  assert.match(server, /user_type\.get\("@type"\) != "userTypeRegular"/u);
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
