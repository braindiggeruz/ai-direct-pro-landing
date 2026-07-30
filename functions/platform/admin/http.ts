// Shared HTTP shell for the P3.1 Owner Control Center endpoints.
//
// Every endpoint answers through here so the whole surface has one error
// vocabulary, one request-id header and one guarantee: an unexpected exception
// becomes a closed-list token plus a request id, never a message derived from
// the thrown value.
import type { Env } from '../../_types';
import { newRequestId, requirePlatformRole, type PlatformActor, type PlatformRole } from './roles';
import { OWNER_LIMITS, OwnerValidationError } from './validation';

export function ownerJson(value: unknown, requestId: string, status = 200): Response {
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

export function ownerError(code: string, requestId: string, status: number): Response {
  return ownerJson({ error: code, request_id: requestId }, requestId, status);
}

/** Read and bound a JSON body. Oversized or malformed input is a 4xx, not a 5xx. */
export async function readOwnerBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > OWNER_LIMITS.bodyBytes) {
    throw new OwnerValidationError('payload_too_large');
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > OWNER_LIMITS.bodyBytes) {
    throw new OwnerValidationError('payload_too_large');
  }
  if (!raw.trim()) throw new OwnerValidationError('invalid_body');
  try {
    return JSON.parse(raw);
  } catch {
    throw new OwnerValidationError('invalid_body');
  }
}

export interface OwnerHandlerContext {
  request: Request;
  env: Env;
  db: D1Database;
  actor: PlatformActor;
  requestId: string;
  url: URL;
  params: Record<string, string | string[]>;
}

/**
 * Wrap an Owner Control Center handler: authorize, resolve storage, run, and
 * convert every failure into a closed-list token.
 */
export function withOwnerRole(
  minimum: PlatformRole,
  handler: (ctx: OwnerHandlerContext) => Promise<Response>,
): PagesFunction<Env> {
  return async ({ request, env, params }) => {
    const requestId = newRequestId();
    const actor = await requirePlatformRole(request, env, minimum, requestId);
    if (actor instanceof Response) return actor;
    if (!env.GPTBOT_DRAFTS_DB) return ownerError('storage_unavailable', requestId, 503);
    try {
      return await handler({
        request,
        env,
        db: env.GPTBOT_DRAFTS_DB,
        actor,
        requestId,
        url: new URL(request.url),
        params: (params ?? {}) as Record<string, string | string[]>,
      });
    } catch (error) {
      if (error instanceof OwnerValidationError) {
        const status = error.code === 'payload_too_large'
          ? 413
          : (
            error.code === 'idempotency_conflict'
            || error.code.endsWith('_conflict')
            || error.code === 'invalid_store_transition'
              ? 409
              : 400
          );
        return ownerError(error.code, requestId, status);
      }
      // Deliberately no detail from the thrown value: the operator gets a
      // request id and the server log keeps the rest.
      console.error(`owner.control-center:internal_error:${requestId}`);
      return ownerError('internal_error', requestId, 500);
    }
  };
}

export function methodNotAllowed(allow: string): PagesFunction<Env> {
  return async () => {
    const requestId = newRequestId();
    const response = ownerError('method_not_allowed', requestId, 405);
    response.headers.set('Allow', allow);
    return response;
  };
}

export function firstParam(params: Record<string, string | string[]>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}
