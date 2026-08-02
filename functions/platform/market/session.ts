import type { MarketLocale } from './init-data';

const SESSION_TTL_SECONDS = 600;
const AUDIENCE = 'gptbot-market';
const ISSUER = 'gptbot.uz';

export interface MarketSessionClaims {
  sub: string;
  telegramId: string;
  locale: MarketLocale;
  launch: string;
  iat: number;
  exp: number;
  iss: typeof ISSUER;
  aud: typeof AUDIENCE;
}

export class MarketSessionError extends Error {
  constructor(public readonly code: 'invalid_session' | 'expired_session') {
    super(code);
    this.name = 'MarketSessionError';
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - value.length % 4) % 4);
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function sessionKey(secret: string): Promise<CryptoKey> {
  if (new TextEncoder().encode(secret).byteLength < 32) {
    throw new MarketSessionError('invalid_session');
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function parseClaims(bytes: Uint8Array): MarketSessionClaims {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new MarketSessionError('invalid_session');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new MarketSessionError('invalid_session');
  }
  const value = parsed as Record<string, unknown>;
  if (
    typeof value.sub !== 'string'
    || !/^[a-z0-9][a-z0-9._-]{0,119}$/.test(value.sub)
    || typeof value.telegramId !== 'string'
    || !/^[1-9][0-9]{0,19}$/.test(value.telegramId)
    || (value.locale !== 'ru' && value.locale !== 'uz')
    || typeof value.launch !== 'string'
    || !/^[0-9a-f]{32}$/.test(value.launch)
    || !Number.isSafeInteger(value.iat)
    || !Number.isSafeInteger(value.exp)
    || value.iss !== ISSUER
    || value.aud !== AUDIENCE
  ) {
    throw new MarketSessionError('invalid_session');
  }
  return value as unknown as MarketSessionClaims;
}

export async function issueMarketSession(
  secret: string,
  input: Pick<MarketSessionClaims, 'sub' | 'telegramId' | 'locale' | 'launch'>,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<{ token: string; claims: MarketSessionClaims }> {
  const header = encodeBase64Url(new TextEncoder().encode(JSON.stringify({
    alg: 'HS256',
    typ: 'JWT',
    kid: 'market-v1',
  })));
  const claims: MarketSessionClaims = {
    ...input,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_TTL_SECONDS,
    iss: ISSUER,
    aud: AUDIENCE,
  };
  const payload = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(claims)),
  );
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    'HMAC',
    await sessionKey(secret),
    new TextEncoder().encode(signingInput),
  );
  return {
    token: `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`,
    claims,
  };
}

export async function verifyMarketSession(
  secret: string,
  token: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<MarketSessionClaims> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new MarketSessionError('invalid_session');
  }
  const [header, payload, encodedSignature] = parts;
  const headerBytes = decodeBase64Url(header);
  const payloadBytes = decodeBase64Url(payload);
  const signature = decodeBase64Url(encodedSignature);
  if (!headerBytes || !payloadBytes || !signature) {
    throw new MarketSessionError('invalid_session');
  }
  let parsedHeader: unknown;
  try {
    parsedHeader = JSON.parse(new TextDecoder().decode(headerBytes));
  } catch {
    throw new MarketSessionError('invalid_session');
  }
  const safeHeader = parsedHeader as Record<string, unknown>;
  if (
    !safeHeader
    || safeHeader.alg !== 'HS256'
    || safeHeader.typ !== 'JWT'
    || safeHeader.kid !== 'market-v1'
  ) {
    throw new MarketSessionError('invalid_session');
  }
  const valid = await crypto.subtle.verify(
    'HMAC',
    await sessionKey(secret),
    signature.slice().buffer as ArrayBuffer,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  if (!valid) throw new MarketSessionError('invalid_session');
  const claims = parseClaims(payloadBytes);
  if (claims.iat > nowSeconds + 30) throw new MarketSessionError('invalid_session');
  if (claims.exp <= nowSeconds) throw new MarketSessionError('expired_session');
  if (claims.exp - claims.iat !== SESSION_TTL_SECONDS) {
    throw new MarketSessionError('invalid_session');
  }
  return claims;
}

export const MARKET_SESSION_TTL_SECONDS = SESSION_TTL_SECONDS;
