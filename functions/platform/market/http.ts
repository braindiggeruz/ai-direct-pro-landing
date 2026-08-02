import type { Env } from '../../_types';

export const MARKET_ERROR_CODES = [
  'feature_disabled',
  'unsupported_environment',
  'cohort_disabled',
  'storefront_unavailable',
  'seller_forbidden',
  'resource_not_found',
  'validation_failed',
  'idempotency_required',
  'idempotency_conflict',
  'version_conflict',
  'rate_limited',
  'invalid_session',
  'expired_session',
  'state_conflict',
  'internal_error',
] as const;

export type MarketErrorCode = (typeof MARKET_ERROR_CODES)[number];

export class MarketHttpError extends Error {
  constructor(
    public readonly code: MarketErrorCode,
    public readonly status: number,
  ) {
    super(code);
    this.name = 'MarketHttpError';
  }
}

export function marketRequestId(): string {
  return `market_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function marketJson(
  value: unknown,
  requestId: string,
  status = 200,
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'x-request-id': requestId,
    },
  });
}

export function marketError(
  code: MarketErrorCode,
  requestId: string,
  status: number,
): Response {
  return marketJson({ error: code, request_id: requestId }, requestId, status);
}

export function marketFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function assertMarketOrigin(request: Request, env: Env): void {
  const origin = request.headers.get('Origin');
  if (!origin) return;
  const allowed = (env.MARKET_MINI_APP_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) {
    throw new MarketHttpError('unsupported_environment', 403);
  }
}

export async function readMarketJson(
  request: Request,
  maxBytes = 16_384,
): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new MarketHttpError('validation_failed', 413);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes || !raw.trim()) {
    throw new MarketHttpError('validation_failed', raw.trim() ? 413 : 400);
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new MarketHttpError('validation_failed', 400);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MarketHttpError('validation_failed', 400);
  }
  return value as Record<string, unknown>;
}

export function requireIdempotencyKey(request: Request): string {
  const value = request.headers.get('Idempotency-Key')?.trim() ?? '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/.test(value)) {
    throw new MarketHttpError('idempotency_required', 400);
  }
  return value;
}

export function bearerToken(request: Request): string {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization);
  if (!match || match[1].length > 2_048) {
    throw new MarketHttpError('invalid_session', 401);
  }
  return match[1];
}

export function boundedLimit(value: string | null, fallback = 12): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
    throw new MarketHttpError('validation_failed', 400);
  }
  return parsed;
}
