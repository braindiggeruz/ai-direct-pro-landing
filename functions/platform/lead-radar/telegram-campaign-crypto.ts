const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });
const MAX_SECRET_BYTES = 16_384;

export interface TelegramCampaignEncryptedValue {
  ciphertext: string;
  iv: string;
}

function fail(): never {
  throw new Error('telegram_campaign_crypto_invalid');
}

function bytesToBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) fail();
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return fail();
  }
}

function parseDataKey(value: string): Uint8Array<ArrayBuffer> {
  const bytes = base64UrlToBytes(value.trim());
  if (bytes.byteLength !== 32) fail();
  return bytes;
}

async function encryptionKey(dataKey: string): Promise<CryptoKey> {
  const root = await crypto.subtle.importKey(
    'raw',
    parseDataKey(dataKey),
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: TEXT_ENCODER.encode('gptbot.lead-radar.telegram-campaign.v1'),
      info: TEXT_ENCODER.encode('campaign-secret-encryption'),
    },
    root,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function validScope(scope: string): boolean {
  const bytes = TEXT_ENCODER.encode(scope);
  return scope.length > 0
    && bytes.byteLength <= 512
    && ![...scope].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    });
}

/**
 * Encrypts bounded campaign content or an endpoint with a random IV and
 * context-bound AES-GCM additional data. Telegram account sessions/TDLib state
 * are intentionally outside D1 and must never be passed to this helper.
 */
export async function encryptTelegramCampaignSecret(
  dataKey: string,
  scope: string,
  plaintext: string,
  maxBytes = MAX_SECRET_BYTES,
): Promise<TelegramCampaignEncryptedValue> {
  const bytes = TEXT_ENCODER.encode(plaintext);
  if (!validScope(scope)
    || bytes.byteLength < 1
    || bytes.byteLength > Math.min(Math.max(maxBytes, 1), MAX_SECRET_BYTES)) fail();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: TEXT_ENCODER.encode(`lead-radar.telegram-campaign.v1\u0000${scope}`),
      tagLength: 128,
    },
    await encryptionKey(dataKey),
    bytes,
  );
  return {
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    iv: bytesToBase64Url(iv),
  };
}

export async function decryptTelegramCampaignSecret(
  dataKey: string,
  scope: string,
  encrypted: TelegramCampaignEncryptedValue,
  maxBytes = MAX_SECRET_BYTES,
): Promise<string> {
  if (!validScope(scope)) fail();
  const iv = base64UrlToBytes(encrypted.iv);
  const ciphertext = base64UrlToBytes(encrypted.ciphertext);
  const boundedMax = Math.min(Math.max(maxBytes, 1), MAX_SECRET_BYTES);
  if (iv.byteLength !== 12
    || ciphertext.byteLength < 17
    || ciphertext.byteLength > boundedMax + 16) fail();
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: TEXT_ENCODER.encode(`lead-radar.telegram-campaign.v1\u0000${scope}`),
        tagLength: 128,
      },
      await encryptionKey(dataKey),
      ciphertext,
    );
    const bytes = new Uint8Array(plaintext);
    if (bytes.byteLength < 1 || bytes.byteLength > boundedMax) fail();
    return TEXT_DECODER.decode(bytes);
  } catch {
    return fail();
  }
}
