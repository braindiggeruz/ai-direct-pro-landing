const MAX_INIT_DATA_BYTES = 8_192;
const MAX_AUTH_AGE_SECONDS = 300;
const MAX_FUTURE_SKEW_SECONDS = 30;

export type MarketLocale = 'ru' | 'uz';

export interface TelegramWebAppUser {
  id: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  languageCode: string | null;
}

export interface VerifiedTelegramInitData {
  authDate: number;
  queryId: string | null;
  startParam: string | null;
  user: TelegramWebAppUser;
  locale: MarketLocale;
  launchFingerprint: string;
}

export class MarketInitDataError extends Error {
  constructor(
    public readonly code:
      | 'invalid_init_data'
      | 'expired_init_data'
      | 'future_init_data',
  ) {
    super(code);
    this.name = 'MarketInitDataError';
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function hmac(key: Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.slice().buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value)),
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest)).slice(0, 32);
}

function parseUser(value: string | null): TelegramWebAppUser {
  if (!value || value.length > 2_048) throw new MarketInitDataError('invalid_init_data');
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    throw new MarketInitDataError('invalid_init_data');
  }
  if (!raw || typeof raw !== 'object') {
    throw new MarketInitDataError('invalid_init_data');
  }
  const user = raw as Record<string, unknown>;
  const numericId = typeof user.id === 'number' ? user.id : Number.NaN;
  if (!Number.isSafeInteger(numericId) || numericId < 1) {
    throw new MarketInitDataError('invalid_init_data');
  }
  const firstName = typeof user.first_name === 'string'
    ? user.first_name.trim().slice(0, 64)
    : '';
  if (!firstName) throw new MarketInitDataError('invalid_init_data');
  const optional = (key: string, max: number): string | null => {
    const candidate = user[key];
    return typeof candidate === 'string' && candidate.trim()
      ? candidate.trim().slice(0, max)
      : null;
  };
  return {
    id: String(numericId),
    firstName,
    lastName: optional('last_name', 64),
    username: optional('username', 32),
    languageCode: optional('language_code', 16),
  };
}

function localeFrom(user: TelegramWebAppUser): MarketLocale {
  return user.languageCode?.toLowerCase().startsWith('uz') ? 'uz' : 'ru';
}

/** Validate Telegram WebApp initData using the official bot-token HMAC flow. */
export async function verifyTelegramInitData(
  raw: string,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<VerifiedTelegramInitData> {
  if (
    !raw
    || !botToken
    || new TextEncoder().encode(raw).byteLength > MAX_INIT_DATA_BYTES
  ) {
    throw new MarketInitDataError('invalid_init_data');
  }
  const params = new URLSearchParams(raw);
  const seen = new Set<string>();
  for (const [key] of params) {
    if (seen.has(key)) throw new MarketInitDataError('invalid_init_data');
    seen.add(key);
  }
  const suppliedHash = hexToBytes(params.get('hash') ?? '');
  if (!suppliedHash) throw new MarketInitDataError('invalid_init_data');
  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = await hmac(new TextEncoder().encode('WebAppData'), botToken);
  const expectedHash = await hmac(secretKey, dataCheckString);
  if (!sameBytes(suppliedHash, expectedHash)) {
    throw new MarketInitDataError('invalid_init_data');
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isSafeInteger(authDate) || authDate < 1) {
    throw new MarketInitDataError('invalid_init_data');
  }
  if (authDate > nowSeconds + MAX_FUTURE_SKEW_SECONDS) {
    throw new MarketInitDataError('future_init_data');
  }
  if (nowSeconds - authDate > MAX_AUTH_AGE_SECONDS) {
    throw new MarketInitDataError('expired_init_data');
  }
  const user = parseUser(params.get('user'));
  const queryId = params.get('query_id');
  const startParam = params.get('start_param');
  if (
    (queryId !== null && (queryId.length < 1 || queryId.length > 128))
    || (startParam !== null && (startParam.length < 1 || startParam.length > 64))
  ) {
    throw new MarketInitDataError('invalid_init_data');
  }
  return {
    authDate,
    queryId,
    startParam,
    user,
    locale: localeFrom(user),
    launchFingerprint: await sha256(raw),
  };
}

export const TELEGRAM_INIT_DATA_LIMITS = {
  maxBytes: MAX_INIT_DATA_BYTES,
  maxAgeSeconds: MAX_AUTH_AGE_SECONDS,
  maxFutureSkewSeconds: MAX_FUTURE_SKEW_SECONDS,
} as const;
