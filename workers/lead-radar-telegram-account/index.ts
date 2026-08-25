import {
  accountRefForOrg,
  parseMasterKey,
  sha256Hex,
} from './crypto';
import {
  LeadRadarTelegramAccount,
  type TelegramAccountGatewayEnv,
} from './account-object';
import {
  ACCOUNT_REF_PATTERN,
  hasExactKeys,
  INTERNAL_ACCOUNT_ORIGIN,
  INTERNAL_SERVICE_ORIGIN,
  jsonResponse,
  ORG_ID_PATTERN,
  readBoundedJson,
  safeErrorResponse,
  TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
  validAccountRef,
  validAuthId,
  validAuthenticationCode,
  validMessage,
  validOperationId,
  validOrgId,
  validPassword,
  validPhoneNumber,
  validSchema,
  validUsername,
  type JsonRecord,
} from './protocol';
import {
  GATEWAY_DO_CONTROL_TIMEOUT_MS,
  GATEWAY_DO_HEALTH_TIMEOUT_MS,
  GATEWAY_DO_RECONCILE_TIMEOUT_MS,
  GATEWAY_DO_SEND_TIMEOUT_MS,
} from './timeouts';

export { LeadRadarTelegramAccount } from './account-object';

const API_HASH_PATTERN = /^[a-f0-9]{32}$/u;
const API_ID_PATTERN = /^[1-9]\d{3,11}$/u;
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,80}$/u;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;

function configured(env: TelegramAccountGatewayEnv): boolean {
  return API_ID_PATTERN.test(env.LEAD_RADAR_TELEGRAM_API_ID ?? '')
    && API_HASH_PATTERN.test(env.LEAD_RADAR_TELEGRAM_API_HASH ?? '')
    && parseMasterKey(env.LEAD_RADAR_TELEGRAM_ACCOUNT_DATA_KEY) !== null
    && parseMasterKey(env.LEAD_RADAR_TELEGRAM_ACCOUNT_ROUTING_KEY) !== null
    && VERSION_PATTERN.test(env.LEAD_RADAR_TELEGRAM_ACCOUNT_KEY_VERSION ?? '')
    && VERSION_PATTERN.test(env.LEAD_RADAR_TELEGRAM_GATEWAY_VERSION ?? '')
    && COMMIT_PATTERN.test(env.LEAD_RADAR_TELEGRAM_TDLIB_SOURCE_COMMIT ?? '')
    && Boolean(env.TELEGRAM_ACCOUNTS)
    && Boolean(env.TELEGRAM_SESSION_BUCKET);
}

async function accountRef(env: TelegramAccountGatewayEnv, orgId: string): Promise<string> {
  const routingKey = parseMasterKey(env.LEAD_RADAR_TELEGRAM_ACCOUNT_ROUTING_KEY);
  if (!routingKey) throw new Error('gateway_not_configured');
  return accountRefForOrg(routingKey, orgId);
}

async function accountStub(
  env: TelegramAccountGatewayEnv,
  reference: string,
): Promise<DurableObjectStub<LeadRadarTelegramAccount>> {
  if (!ACCOUNT_REF_PATTERN.test(reference)) throw new Error('account_ref_invalid');
  return env.TELEGRAM_ACCOUNTS.get(env.TELEGRAM_ACCOUNTS.idFromName(reference));
}

async function doFetch(input: {
  env: TelegramAccountGatewayEnv;
  accountRef: string;
  path: string;
  method?: 'GET' | 'POST';
  body?: JsonRecord;
  timeoutMs: number;
}): Promise<Response> {
  const stub = await accountStub(input.env, input.accountRef);
  try {
    return await stub.fetch(`${INTERNAL_ACCOUNT_ORIGIN}${input.path}`, {
      method: input.method ?? 'POST',
      headers: input.body ? { 'Content-Type': 'application/json; charset=utf-8' } : undefined,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch {
    return safeErrorResponse('gateway_unavailable', 503);
  }
}

async function bodyWithAccountRef(
  env: TelegramAccountGatewayEnv,
  body: JsonRecord,
): Promise<{ body: JsonRecord; accountRef: string } | null> {
  if (!validSchema(body) || !validOrgId(body.org_id)) return null;
  const reference = await accountRef(env, body.org_id);
  return { body: { ...body, account_ref: reference }, accountRef: reference };
}

function idempotencyMatches(request: Request, operationId: string): boolean {
  const header = request.headers.get('Idempotency-Key');
  return header === null || header === operationId;
}

async function connect(
  request: Request,
  env: TelegramAccountGatewayEnv,
  mode: 'qr' | 'phone',
): Promise<Response> {
  const body = await readBoundedJson(request);
  if (!body
    || !hasExactKeys(body, ['schema', 'org_id', 'operation_id'])
    || !validSchema(body)
    || !validOrgId(body.org_id)
    || !validOperationId(body.operation_id)
    || !idempotencyMatches(request, body.operation_id)) {
    return safeErrorResponse('invalid_request');
  }
  const routed = await bodyWithAccountRef(env, body);
  if (!routed) return safeErrorResponse('invalid_request');
  return doFetch({
    env,
    accountRef: routed.accountRef,
    path: mode === 'qr'
      ? '/internal/accounts/connect/qr'
      : '/internal/accounts/connect/phone/start',
    body: routed.body,
    timeoutMs: GATEWAY_DO_CONTROL_TIMEOUT_MS,
  });
}

async function authAction(
  request: Request,
  env: TelegramAccountGatewayEnv,
  kind: 'phone' | 'code' | 'resend' | 'password' | 'cancel' | 'status' | 'state',
): Promise<Response> {
  const body = await readBoundedJson(request);
  const keys: Record<typeof kind, string[]> = {
    phone: ['schema', 'org_id', 'auth_id', 'phone_number'],
    code: ['schema', 'org_id', 'auth_id', 'code'],
    resend: ['schema', 'org_id', 'auth_id'],
    password: ['schema', 'org_id', 'auth_id', 'password'],
    cancel: ['schema', 'org_id', 'auth_id'],
    status: ['schema', 'org_id', 'auth_id'],
    state: ['schema', 'org_id', 'auth_id'],
  };
  if (!body
    || !hasExactKeys(body, keys[kind])
    || !validSchema(body)
    || !validOrgId(body.org_id)
    || !validAuthId(body.auth_id)
    || (kind === 'phone' && !validPhoneNumber(body.phone_number))
    || (kind === 'code' && !validAuthenticationCode(body.code))
    || (kind === 'password' && !validPassword(body.password))) {
    return safeErrorResponse('invalid_request');
  }
  const reference = await accountRef(env, body.org_id);
  return doFetch({
    env,
    accountRef: reference,
    path: `/internal/accounts/connect/${kind}`,
    body,
    timeoutMs: GATEWAY_DO_CONTROL_TIMEOUT_MS,
  });
}

async function activeConnection(url: URL, env: TelegramAccountGatewayEnv): Promise<Response> {
  const orgId = url.searchParams.get('org_id');
  if (!orgId || !ORG_ID_PATTERN.test(orgId) || [...url.searchParams.keys()].some((key) => key !== 'org_id')) {
    return safeErrorResponse('invalid_request');
  }
  const reference = await accountRef(env, orgId);
  return doFetch({
    env,
    accountRef: reference,
    path: '/internal/accounts/connect/active',
    body: { schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, org_id: orgId },
    timeoutMs: GATEWAY_DO_CONTROL_TIMEOUT_MS,
  });
}

async function disconnect(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const body = await readBoundedJson(request);
  if (!body
    || !hasExactKeys(body, ['schema', 'org_id', 'operation_id'])
    || !validSchema(body)
    || !validOrgId(body.org_id)
    || !validOperationId(body.operation_id)
    || !idempotencyMatches(request, body.operation_id)) {
    return safeErrorResponse('invalid_request');
  }
  const routed = await bodyWithAccountRef(env, body);
  if (!routed) return safeErrorResponse('invalid_request');
  return doFetch({
    env,
    accountRef: routed.accountRef,
    path: '/internal/accounts/disconnect',
    body: routed.body,
    timeoutMs: GATEWAY_DO_CONTROL_TIMEOUT_MS,
  });
}

async function sendMessage(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const body = await readBoundedJson(request);
  if (!body
    || !hasExactKeys(body, [
      'schema',
      'account_ref',
      'username',
      'text',
      'random_id',
      'paid_message_policy',
      'allow_paid_floodskip',
    ])
    || !validSchema(body)
    || !validAccountRef(body.account_ref)
    || !validUsername(body.username)
    || !validMessage(body.text)
    || !validOperationId(body.random_id)
    || body.paid_message_policy !== 'reject'
    || body.allow_paid_floodskip !== false) {
    return safeErrorResponse('invalid_request');
  }
  return doFetch({
    env,
    accountRef: body.account_ref,
    path: '/internal/messages/send',
    body,
    timeoutMs: GATEWAY_DO_SEND_TIMEOUT_MS,
  });
}

async function reconcileMessage(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const body = await readBoundedJson(request);
  if (!body
    || !hasExactKeys(body, ['schema', 'account_ref', 'random_id', 'payload_digest'])
    || !validSchema(body)
    || !validAccountRef(body.account_ref)
    || !validOperationId(body.random_id)
    || typeof body.payload_digest !== 'string'
    || !/^[a-f0-9]{64}$/u.test(body.payload_digest)) {
    return safeErrorResponse('invalid_request');
  }
  return doFetch({
    env,
    accountRef: body.account_ref,
    path: '/internal/messages/reconcile',
    body,
    timeoutMs: GATEWAY_DO_RECONCILE_TIMEOUT_MS,
  });
}

async function accountHealth(url: URL, env: TelegramAccountGatewayEnv): Promise<Response> {
  const orgId = url.searchParams.get('org_id');
  if (!orgId || !ORG_ID_PATTERN.test(orgId)) return safeErrorResponse('invalid_request');
  const reference = await accountRef(env, orgId);
  return doFetch({
    env,
    accountRef: reference,
    path: '/internal/health',
    method: 'GET',
    timeoutMs: GATEWAY_DO_HEALTH_TIMEOUT_MS,
  });
}

function serviceHealth(env: TelegramAccountGatewayEnv): Response {
  const isConfigured = configured(env);
  return jsonResponse({
    schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
    status: isConfigured ? 'ok' : 'degraded',
    contract_version: 'v1',
    gateway_version: VERSION_PATTERN.test(env.LEAD_RADAR_TELEGRAM_GATEWAY_VERSION ?? '')
      ? env.LEAD_RADAR_TELEGRAM_GATEWAY_VERSION
      : 'unconfigured',
    auth_modes: ['qr', 'phone_code_password'],
    provider: 'official_tdlib',
    tdlib_source_commit: COMMIT_PATTERN.test(env.LEAD_RADAR_TELEGRAM_TDLIB_SOURCE_COMMIT ?? '')
      ? env.LEAD_RADAR_TELEGRAM_TDLIB_SOURCE_COMMIT
      : 'unconfigured',
    session_storage: 'r2_application_encrypted',
    public_routes: false,
    configured: isConfigured,
  }, isConfigured ? 200 : 503);
}

async function route(request: Request, env: TelegramAccountGatewayEnv): Promise<Response> {
  const url = new URL(request.url);
  // The Worker is deployed with workers.dev disabled and no routes. This
  // origin guard adds a second fail-closed layer around the service binding.
  if (url.origin !== INTERNAL_SERVICE_ORIGIN) return new Response('Not Found', { status: 404 });
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
    case '/v1/accounts/connect': return connect(request, env, 'qr');
    case '/v1/accounts/connect/phone/start': return connect(request, env, 'phone');
    case '/v1/accounts/connect/phone': return authAction(request, env, 'phone');
    case '/v1/accounts/connect/code': return authAction(request, env, 'code');
    case '/v1/accounts/connect/resend': return authAction(request, env, 'resend');
    case '/v1/accounts/connect/password': return authAction(request, env, 'password');
    case '/v1/accounts/connect/cancel': return authAction(request, env, 'cancel');
    case '/v1/accounts/connect/status': return authAction(request, env, 'status');
    case '/v1/accounts/connect/state': return authAction(request, env, 'state');
    case '/v1/accounts/disconnect': return disconnect(request, env);
    case '/v1/messages/send': return sendMessage(request, env);
    case '/v1/messages/reconcile': return reconcileMessage(request, env);
    default: return new Response('Not Found', { status: 404 });
  }
}

export function gatewayPayloadDigest(input: {
  accountRef: string;
  username: string;
  text: string;
  randomId: string;
}): Promise<string> {
  return sha256Hex([
    input.accountRef,
    input.username,
    input.text,
    input.randomId,
    'paid:reject',
  ]);
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
