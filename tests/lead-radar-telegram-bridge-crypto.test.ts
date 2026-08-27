import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTelegramBridgeBrowserKey,
  createTelegramBridgeEnrollmentCode,
  decryptTelegramBridgeQrEnvelope,
  encryptTelegramBridgeAuthInput,
  encryptTelegramBridgePassword,
  telegramBridgeEnrollmentUri,
} from '../src/admin/lib/lead-radar-telegram-bridge-crypto';
import {
  LEAD_RADAR_TELEGRAM_BRIDGE_SCHEMA,
  type LeadRadarTelegramBridgeE2eEnvelope,
} from '../src/shared/lead-radar-telegram-bridge';

const NOW = new Date('2026-08-26T12:00:00.000Z');
const ORG = 'owner_8ee98dc3040f160b308166b0';
const DEVICE = `lrtgbd_${'1'.repeat(32)}`;
const COMMAND = `lrtgbc_${'2'.repeat(32)}`;
const AUTH = 'auth_local_bridge_1234567890';
const QR_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function fromB64url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

test('pairing material is high entropy and stays in a custom-URI fragment', () => {
  const code = createTelegramBridgeEnrollmentCode();
  assert.match(code, /^[A-Za-z0-9_-]{22}$/u);
  const uri = telegramBridgeEnrollmentUri({
    pairingId: `lrtgbp_${'3'.repeat(32)}`,
    origin: 'https://gptbot.uz',
  });
  assert.match(uri, /^gptbot-lead-radar:\/\/pair#/u);
  assert.equal(uri.includes('?'), false);
  assert.equal(uri.includes(code), false);
  assert.equal(uri.includes('code='), false);
});

test('QR relay decrypts only for the ephemeral browser key and exact context', async () => {
  const browserKey = await createTelegramBridgeBrowserKey(NOW);
  assert.equal(browserKey.privateKey.extractable, false);
  const publicKey = await crypto.subtle.importKey(
    'spki',
    fromB64url(browserKey.publicKey.spki),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const expiresAt = new Date(NOW.getTime() + 60_000).toISOString();
  const plaintext = new TextEncoder().encode(JSON.stringify({
    schema: LEAD_RADAR_TELEGRAM_BRIDGE_SCHEMA,
    purpose: 'qr',
    org_id: ORG,
    device_id: DEVICE,
    command_id: COMMAND,
    auth_id: AUTH,
    expires_at: expiresAt,
    qr_code_data_url: QR_PNG,
    qr_login_url: 'tg://login?token=abcdefghijklmnop1234567890',
  }));
  const aesKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
  const envelope: LeadRadarTelegramBridgeE2eEnvelope = {
    alg: 'RSA-OAEP-256+A256GCM',
    key_id: browserKey.publicKey.key_id,
    wrapped_key: b64url(new Uint8Array(await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' }, publicKey, rawKey,
    ))),
    iv: b64url(iv),
    ciphertext: b64url(new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 }, aesKey, plaintext,
    ))),
  };
  assert.deepEqual(await decryptTelegramBridgeQrEnvelope({
    browserKey,
    envelope,
    orgId: ORG,
    deviceId: DEVICE,
    commandId: COMMAND,
    authId: AUTH,
    now: NOW,
  }), {
    authId: AUTH,
    qrCodeDataUrl: QR_PNG,
    qrLoginUrl: 'tg://login?token=abcdefghijklmnop1234567890',
    expiresAt,
  });
  await assert.rejects(decryptTelegramBridgeQrEnvelope({
    browserKey,
    envelope,
    orgId: ORG,
    deviceId: DEVICE,
    commandId: `lrtgbc_${'9'.repeat(32)}`,
    authId: AUTH,
    now: NOW,
  }), /telegram_bridge_crypto_invalid/u);
});

test('2FA leaves the browser only as contextual hybrid ciphertext', async () => {
  const bridgePair = await crypto.subtle.generateKey({
    name: 'RSA-OAEP',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  }, true, ['encrypt', 'decrypt']);
  const spkiBytes = new Uint8Array(await crypto.subtle.exportKey('spki', bridgePair.publicKey));
  const spki = b64url(spkiBytes);
  const keyId = Buffer.from(await crypto.subtle.digest('SHA-256', spkiBytes)).toString('hex');
  const expiresAt = new Date(NOW.getTime() + 60_000).toISOString();
  const password = 'fixture-password-not-a-secret';
  const envelope = await encryptTelegramBridgePassword({
    bridgePublicKeySpki: spki,
    keyId,
    password,
    orgId: ORG,
    deviceId: DEVICE,
    commandId: COMMAND,
    authId: AUTH,
    expiresAt,
    now: NOW,
  });
  assert.equal(JSON.stringify(envelope).includes(password), false);
  const rawKey = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    bridgePair.privateKey,
    fromB64url(envelope.wrapped_key),
  );
  const aesKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64url(envelope.iv), tagLength: 128 },
    aesKey,
    fromB64url(envelope.ciphertext),
  );
  assert.deepEqual(JSON.parse(new TextDecoder().decode(plaintext)), {
    schema: LEAD_RADAR_TELEGRAM_BRIDGE_SCHEMA,
    purpose: 'password',
    org_id: ORG,
    device_id: DEVICE,
    command_id: COMMAND,
    auth_id: AUTH,
    expires_at: expiresAt,
    password,
  });
});

test('phone and code leave the browser only as Bridge-bound ciphertext', async () => {
  const bridgePair = await crypto.subtle.generateKey({
    name: 'RSA-OAEP', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
  }, true, ['encrypt', 'decrypt']);
  const spkiBytes = new Uint8Array(await crypto.subtle.exportKey('spki', bridgePair.publicKey));
  const spki = b64url(spkiBytes);
  const keyId = Buffer.from(await crypto.subtle.digest('SHA-256', spkiBytes)).toString('hex');
  const expiresAt = new Date(NOW.getTime() + 60_000).toISOString();
  for (const [action, value] of [['phone', '+998901234567'], ['code', '12345']] as const) {
    const envelope = await encryptTelegramBridgeAuthInput({
      bridgePublicKeySpki: spki, keyId, action, value,
      orgId: ORG, deviceId: DEVICE, commandId: COMMAND, authId: AUTH,
      expiresAt, now: NOW,
    });
    assert.equal(JSON.stringify(envelope).includes(value), false);
    const rawKey = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' }, bridgePair.privateKey, fromB64url(envelope.wrapped_key),
    );
    const aesKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64url(envelope.iv), tagLength: 128 },
      aesKey,
      fromB64url(envelope.ciphertext),
    );
    assert.deepEqual(JSON.parse(new TextDecoder().decode(plaintext)), {
      schema: LEAD_RADAR_TELEGRAM_BRIDGE_SCHEMA,
      purpose: action,
      org_id: ORG,
      device_id: DEVICE,
      command_id: COMMAND,
      auth_id: AUTH,
      expires_at: Math.floor(Date.parse(expiresAt) / 1_000),
      value,
    });
  }
});
