import { isCampaignEndpoint } from '../../src/shared/lead-radar-telegram-endpoint';
import {
  BRIDGE_MAILBOX_OBJECT_NAME,
  LeadRadarTelegramBridgeMailbox,
  type TelegramBridgeGatewayEnv,
} from './bridge-mailbox';
import { validBridgeBrowserKey, validBridgeE2eEnvelope } from './bridge-protocol';
import { accountRefForOrg, parseMasterKey, routingKeyFingerprint } from './crypto';
import { gatewayConfigurationBlockers, validGatewayRuntimeVersion } from './configuration';
import {
  ACCOUNT_REF_PATTERN,
  hasExactKeys,
  idempotencyHeaderMatches,
  INTERNAL_ACCOUNT_ORIGIN,
  INTERNAL_SERVICE_ORIGIN,
  jsonResponse,
  MAX_MEDIA_CAPTION_CHARACTERS,
  MAX_MEDIA_VALIDATE_REQUEST_BYTES,
  MAX_SEND_REQUEST_BYTES,
  ORG_ID_PATTERN,
  readBoundedJson,
  safeErrorResponse,
  TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
  validAccountRef,
  validAuthId,
  validMessage,
  validOperationId,
  validOrgId,
  validSchema,
  type JsonRecord,
} from './protocol';
import {
  GATEWAY_DO_CONTROL_TIMEOUT_MS,
  GATEWAY_DO_HEALTH_TIMEOUT_MS,
  GATEWAY_DO_RECONCILE_TIMEOUT_MS,
  GATEWAY_DO_SEND_TIMEOUT_MS,
} from './timeouts';

export { LeadRadarTelegramBridgeMailbox } from './bridge-mailbox';
export { telegramMessagePayloadDigest as gatewayPayloadDigest } from './message-effect';
export { gatewayConfigurationBlockers } from './configuration';
export type { TelegramAccountGatewayConfigurationBlocker } from './configuration';

export type TelegramAccountGatewayEnv = TelegramBridgeGatewayEnv;

const DEFAULT_PUBLIC_ORIGIN =
  'https://gptbot-lead-radar-telegram-account.braindigger-uz.workers.dev';
const INTERNAL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

function configured(env: TelegramAccountGatewayEnv): boolean {
  return gatewayConfigurationBlockers(env).length === 0;
}

async function accountRef(env: TelegramAccountGatewayEnv, orgId: string): Promise<string> {
  const routingKey = parseMasterKey(env.LEAD_RADAR_TELEGRAM_ACCOUNT_ROUTING_KEY);
  if (!routingKey) throw new Error('gateway_not_configured');
  return accountRefForOrg(routingKey, orgId);
}

function mailboxStub(env: TelegramAccountGatewayEnv): DurableObjectStub<LeadRadarTelegramBridgeMailbox> {
  return env.TELEGRAM_ACCOUNTS.get(env.TELEGRAM_ACCOUNTS.idFromName(BRIDGE_MAILBOX_OBJECT_NAME));
}

async function doFetch(
  env: TelegramAccountGatewayEnv,
  path: string,
  body: JsonRecord,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await mailboxStub(env).fetch(`${INTERNAL_ACCOUNT_ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return safeErrorResponse('gateway_unavailable', 503);
  }
}

async function constantTokenEqual(left: string, right: string): Promise<boolean> {
  if (!INTERNAL_TOKEN_PATTERN.test(left) || !INTERNAL_TOKEN_PATTERN.test(right)) return false;
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: ArrayBufferView, b: ArrayBufferView) => boolean;
  };
  if (subtle.timingSafeEqual) {
    return subtle.timingSafeEqual(new Uint8Array(leftDigest), new Uint8Array(rightDigest));
  }
  const key = await crypto.subtle.importKey(
    'raw', leftDigest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const candidate = await crypto.subtle.importKey(
    'raw', rightDigest, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  );
  const probe = encoder.encode('lead-radar-internal-token-equality-v1');
  return crypto.subtle.verify('HMAC', candidate, await crypto.subtle.sign('HMAC', key, probe), probe);
}

async function internallyAuthorized(request: Request, env: TelegramAccountGatewayEnv): Promise<boolean> {
  const authorization = request.headers.get('Authorization') ?? '';
  return authorization.startsWith('Bearer ')
    && constantTokenEqual(
      authorization.slice(7),
      env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN ?? '',
    );
}

async function connect(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const body = await readBoundedJson(request);
  if (!body
    || !hasExactKeys(body, ['schema', 'org_id', 'operation_id', 'browser_key'])
    || !validSchema(body)
    || !validOrgId(body.org_id)
    || !validOperationId(body.operation_id)
    || !idempotencyHeaderMatches(request, body.operation_id)
    || !validBridgeBrowserKey(body.browser_key)) return safeErrorResponse('invalid_request');
  return doFetch(env, '/internal/accounts/connect/qr', {
    ...body,
    account_ref: await accountRef(env, body.org_id),
  }, GATEWAY_DO_CONTROL_TIMEOUT_MS);
}

async function connectPhone(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const body = await readBoundedJson(request);
  if (!body
    || !hasExactKeys(body, ['schema', 'org_id', 'operation_id'])
    || !validSchema(body)
    || !validOrgId(body.org_id)
    || !validOperationId(body.operation_id)
    || !idempotencyHeaderMatches(request, body.operation_id)) return safeErrorResponse('invalid_request');
  return doFetch(env, '/internal/accounts/connect/phone/start', {
    ...body,
    account_ref: await accountRef(env, body.org_id),
  }, GATEWAY_DO_CONTROL_TIMEOUT_MS);
}

async function activeConnection(url: URL, env: TelegramAccountGatewayEnv): Promise<Response> {
  const orgId = url.searchParams.get('org_id');
  if (!orgId || !ORG_ID_PATTERN.test(orgId)
    || [...url.searchParams.keys()].some((key) => key !== 'org_id')) {
    return safeErrorResponse('invalid_request');
  }
  return doFetch(env, '/internal/accounts/connect/active', {
    schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
    org_id: orgId,
  }, GATEWAY_DO_CONTROL_TIMEOUT_MS);
}

async function authAction(
  request: Request,
  env: TelegramAccountGatewayEnv,
  kind: 'adopt' | 'finalize' | 'cancel' | 'status' | 'state',
): Promise<Response> {
  const body = await readBoundedJson(request);
  if (!body
    || !hasExactKeys(body, ['schema', 'org_id', 'auth_id'])
    || !validSchema(body)
    || !validOrgId(body.org_id)
    || !validAuthId(body.auth_id)) return safeErrorResponse('invalid_request');
  return doFetch(env, `/internal/accounts/connect/${kind}`, body, GATEWAY_DO_CONTROL_TIMEOUT_MS);
}

async function submitPassword(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const body = await readBoundedJson(request);
  if (!body
    || !hasExactKeys(body, [
      'schema', 'org_id', 'auth_id', 'password_command_id', 'password_envelope',
    ])
    || !validSchema(body)
    || !validOrgId(body.org_id)
    || !validAuthId(body.auth_id)
    || typeof body.password_command_id !== 'string'
    || !/^lrtgbc_[a-f0-9]{32}$/u.test(body.password_command_id)
    || !validBridgeE2eEnvelope(body.password_envelope)) return safeErrorResponse('invalid_request');
  return doFetch(env, '/internal/accounts/connect/password', body, GATEWAY_DO_CONTROL_TIMEOUT_MS);
}

async function submitAuthInput(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const body = await readBoundedJson(request);
  if (!body
    || !hasExactKeys(body, [
      'schema', 'org_id', 'auth_id', 'input_command_id', 'input_action', 'input_envelope',
    ])
    || !validSchema(body)
    || !validOrgId(body.org_id)
    || !validAuthId(body.auth_id)
    || typeof body.input_command_id !== 'string'
    || !/^lrtgbc_[a-f0-9]{32}$/u.test(body.input_command_id)
    || !['phone', 'code'].includes(String(body.input_action))
    || !validBridgeE2eEnvelope(body.input_envelope)) return safeErrorResponse('invalid_request');
  return doFetch(env, '/internal/accounts/connect/input', body, GATEWAY_DO_CONTROL_TIMEOUT_MS);
}

async function disconnect(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const body = await readBoundedJson(request);
  if (!body
    || !(hasExactKeys(body, ['schema', 'org_id', 'operation_id'])
      || hasExactKeys(body, ['schema', 'org_id', 'operation_id', 'account_ref']))
    || !validSchema(body)
    || !validOrgId(body.org_id)
    || !validOperationId(body.operation_id)
    || (Object.hasOwn(body, 'account_ref') && !validAccountRef(body.account_ref))
    || !idempotencyHeaderMatches(request, body.operation_id)) return safeErrorResponse('invalid_request');
  return doFetch(env, '/internal/accounts/disconnect', body, GATEWAY_DO_CONTROL_TIMEOUT_MS);
}

function sourceMediaReference(value: unknown, orgId: string): JsonRecord | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const media = value as JsonRecord;
  if (!hasExactKeys(media, [
    'source_object_key', 'media_id', 'media_digest', 'mime_type', 'size_bytes',
  ])
    || typeof media.media_id !== 'string'
    || !/^lrtgcm_[a-f0-9]{32}$/u.test(media.media_id)
    || media.source_object_key !== `lead-radar/campaign-media/${orgId}/${media.media_id}`
    || typeof media.media_digest !== 'string'
    || !/^[a-f0-9]{64}$/u.test(media.media_digest)
    || !['image/jpeg', 'image/png', 'image/webp'].includes(String(media.mime_type))
    || typeof media.size_bytes !== 'number'
    || !Number.isSafeInteger(media.size_bytes)
    || media.size_bytes < 1
    || media.size_bytes > 5_000_000) return null;
  return {
    object_key: media.source_object_key,
    media_id: media.media_id,
    media_digest: media.media_digest,
    mime_type: media.mime_type,
    size_bytes: media.size_bytes,
  };
}

async function validateMedia(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const body = await readBoundedJson(request, MAX_MEDIA_VALIDATE_REQUEST_BYTES);
  if (!body
    || !hasExactKeys(body, ['schema', 'org_id', 'operation_id', 'media'])
    || !validSchema(body)
    || !validOrgId(body.org_id)
    || !validOperationId(body.operation_id)
    || !idempotencyHeaderMatches(request, body.operation_id)) return safeErrorResponse('invalid_request');
  const media = sourceMediaReference(body.media, body.org_id);
  if (!media) return jsonResponse({
    schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
    status: 'rejected',
    code: 'media_invalid',
  });
  const reference = await accountRef(env, body.org_id);
  try {
    return await doFetch(env, '/internal/media/validate', {
      schema: body.schema,
      org_id: body.org_id,
      operation_id: body.operation_id,
      account_ref: reference,
      media_ref: media,
    }, GATEWAY_DO_CONTROL_TIMEOUT_MS);
  } catch {
    return safeErrorResponse('gateway_unavailable', 503);
  }
}

async function sendMessage(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const body = await readBoundedJson(request, MAX_SEND_REQUEST_BYTES);
  const base = [
    'schema', 'org_id', 'account_ref', 'username', 'text', 'random_id',
    'paid_message_policy', 'allow_paid_floodskip',
  ];
  const hasMedia = Boolean(body && Object.hasOwn(body, 'media'));
  const media = hasMedia && body?.media !== null && typeof body?.org_id === 'string'
    ? sourceMediaReference(body.media, body.org_id)
    : null;
  if (!body
    || !(hasExactKeys(body, base) || hasExactKeys(body, [...base, 'media']))
    || !validSchema(body)
    || !validOrgId(body.org_id)
    || !validAccountRef(body.account_ref)
    || !isCampaignEndpoint(body.username)
    || !validMessage(body.text, media ? MAX_MEDIA_CAPTION_CHARACTERS : undefined)
    || !validOperationId(body.random_id)
    || !idempotencyHeaderMatches(request, body.random_id)
    || (hasMedia && body.media !== null && !media)
    || body.paid_message_policy !== 'reject'
    || body.allow_paid_floodskip !== false) return safeErrorResponse('invalid_request');
  try {
    if (await accountRef(env, body.org_id) !== body.account_ref) {
      return safeErrorResponse('routing_conflict', 409);
    }
    const mediaRef = media;
    return await doFetch(env, '/internal/messages/send', {
      schema: body.schema,
      org_id: body.org_id,
      account_ref: body.account_ref,
      username: body.username,
      text: body.text,
      random_id: body.random_id,
      ...(mediaRef ? { media_ref: mediaRef } : {}),
      paid_message_policy: 'reject',
      allow_paid_floodskip: false,
    }, GATEWAY_DO_SEND_TIMEOUT_MS);
  } catch {
    return jsonResponse({ schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'ambiguous' });
  }
}

async function reconcileMessage(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const body = await readBoundedJson(request);
  if (!body
    || !hasExactKeys(body, ['schema', 'org_id', 'account_ref', 'random_id', 'payload_digest'])
    || !validSchema(body)
    || !validOrgId(body.org_id)
    || !validAccountRef(body.account_ref)
    || !validOperationId(body.random_id)
    || !idempotencyHeaderMatches(request, body.random_id)
    || typeof body.payload_digest !== 'string'
    || !/^[a-f0-9]{64}$/u.test(body.payload_digest)) return safeErrorResponse('invalid_request');
  if (await accountRef(env, body.org_id) !== body.account_ref) {
    return safeErrorResponse('routing_conflict', 409);
  }
  return doFetch(env, '/internal/messages/reconcile', body, GATEWAY_DO_RECONCILE_TIMEOUT_MS);
}

async function accountHealth(url: URL, env: TelegramAccountGatewayEnv): Promise<Response> {
  const orgId = url.searchParams.get('org_id');
  const reference = url.searchParams.get('account_ref');
  if (!orgId || !ORG_ID_PATTERN.test(orgId)
    || !reference || !ACCOUNT_REF_PATTERN.test(reference)
    || [...url.searchParams.keys()].some((key) => key !== 'org_id' && key !== 'account_ref')) {
    return safeErrorResponse('invalid_request');
  }
  return doFetch(env, '/internal/accounts/health', {
    schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
    org_id: orgId,
    account_ref: reference,
  }, GATEWAY_DO_HEALTH_TIMEOUT_MS);
}

async function pairing(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const body = await readBoundedJson(request);
  if (!body || !idempotencyHeaderMatches(request, String(body.operation_id ?? ''))) {
    return safeErrorResponse('invalid_request');
  }
  return doFetch(env, '/internal/bridge/pairings', body, GATEWAY_DO_CONTROL_TIMEOUT_MS);
}

async function bridgeStatus(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const body = await readBoundedJson(request);
  return body
    ? doFetch(env, '/internal/bridge/status', body, GATEWAY_DO_HEALTH_TIMEOUT_MS)
    : safeErrorResponse('invalid_request');
}

async function revokeBridge(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const body = await readBoundedJson(request);
  if (!body
    || !hasExactKeys(body, ['schema', 'org_id', 'operation_id', 'device_id'])
    || !validSchema(body)
    || !validOrgId(body.org_id)
    || !validOperationId(body.operation_id)
    || typeof body.device_id !== 'string'
    || !/^lrtgbd_[a-f0-9]{32}$/u.test(body.device_id)
    || !idempotencyHeaderMatches(request, body.operation_id)) {
    return safeErrorResponse('invalid_request');
  }
  return doFetch(env, '/internal/bridge/revoke', body, GATEWAY_DO_CONTROL_TIMEOUT_MS);
}

async function serviceHealth(env: TelegramAccountGatewayEnv): Promise<Response> {
  const blockers = gatewayConfigurationBlockers(env);
  const ready = blockers.length === 0;
  const routingKey = parseMasterKey(env.LEAD_RADAR_TELEGRAM_ACCOUNT_ROUTING_KEY);
  return jsonResponse({
    schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
    status: ready ? 'configured' : 'degraded',
    contract_version: 'v1',
    gateway_version: validGatewayRuntimeVersion(env.LEAD_RADAR_TELEGRAM_GATEWAY_VERSION)
      ? env.LEAD_RADAR_TELEGRAM_GATEWAY_VERSION : 'unconfigured',
    auth_modes: ['qr', 'phone_code_password'],
    provider: 'local_bridge_telethon',
    tdlib_source_commit: 'not_applicable',
    session_storage: 'local_windows_dpapi',
    public_routes: true,
    configured: ready,
    blockers,
    routing_key_fingerprint: routingKey ? await routingKeyFingerprint(routingKey) : null,
    bridge_public_origin: env.LEAD_RADAR_TELEGRAM_BRIDGE_PUBLIC_ORIGIN ?? DEFAULT_PUBLIC_ORIGIN,
  }, ready ? 200 : 503);
}

async function privateRoute(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.origin !== INTERNAL_SERVICE_ORIGIN) return new Response('Not Found', { status: 404 });
  if (!await internallyAuthorized(request, env)) return new Response('Unauthorized', { status: 401 });
  if (request.method === 'GET' && (url.pathname === '/v1/health'
    || url.pathname === '/v1/capabilities')) return serviceHealth(env);
  if (!configured(env)) return safeErrorResponse('gateway_not_configured', 503);
  if (request.method === 'GET' && url.pathname === '/v1/accounts/connect/active') {
    return activeConnection(url, env);
  }
  if (request.method === 'GET' && url.pathname === '/v1/accounts/health') {
    return accountHealth(url, env);
  }
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  switch (url.pathname) {
    case '/v1/bridge/pairings': return pairing(request, env);
    case '/v1/bridge/status': return bridgeStatus(request, env);
    case '/v1/bridge/revoke': return revokeBridge(request, env);
    case '/v1/accounts/connect': return connect(request, env);
    case '/v1/accounts/connect/phone/start': return connectPhone(request, env);
    case '/v1/accounts/connect/input': return submitAuthInput(request, env);
    case '/v1/accounts/connect/password': return submitPassword(request, env);
    case '/v1/accounts/connect/adopt': return authAction(request, env, 'adopt');
    case '/v1/accounts/connect/finalize': return authAction(request, env, 'finalize');
    case '/v1/accounts/connect/cancel': return authAction(request, env, 'cancel');
    case '/v1/accounts/connect/status': return authAction(request, env, 'status');
    case '/v1/accounts/connect/state': return authAction(request, env, 'state');
    case '/v1/accounts/disconnect': return disconnect(request, env);
    case '/v1/media/validate': return validateMedia(request, env);
    case '/v1/contacts/resolve': {
      const body = await readBoundedJson(request);
      if (!body || !idempotencyHeaderMatches(request, String(body.operation_id ?? ''))) return safeErrorResponse('invalid_request');
      return doFetch(env, '/internal/contacts/resolve', body, GATEWAY_DO_CONTROL_TIMEOUT_MS);
    }
    case '/v1/messages/send': return sendMessage(request, env);
    case '/v1/messages/reconcile': return reconcileMessage(request, env);
    default: return new Response('Not Found', { status: 404 });
  }
}

async function route(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const url = new URL(request.url);
  const expectedPublic = env.LEAD_RADAR_TELEGRAM_BRIDGE_PUBLIC_ORIGIN ?? DEFAULT_PUBLIC_ORIGIN;
  if (url.origin === expectedPublic && url.pathname.startsWith('/v1/bridge/')) {
    try {
      return await mailboxStub(env).fetch(request);
    } catch {
      return new Response('Gateway unavailable', { status: 503 });
    }
  }
  return privateRoute(request, env);
}

export default {
  async fetch(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
    try {
      return await route(request, env);
    } catch {
      return safeErrorResponse('gateway_error', 503);
    }
  },
} satisfies ExportedHandler<TelegramAccountGatewayEnv>;
