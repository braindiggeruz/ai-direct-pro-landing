import type {
  TelegramCampaignProviderResult,
  TelegramCampaignSender,
} from './telegram-campaign';

const INTERNAL_ORIGIN = 'https://lead-radar-telegram-account.internal';
const SERVICE_SCHEMA = 'gptbot.lead-radar.telegram-account-service.v1' as const;
const MAX_RESPONSE_BYTES = 400_000;
// These are outer budgets. The private gateway owns stricter inner budgets
// (75s control / 120s send), leaving time for the Service Binding response to
// propagate while keeping every caller bounded.
export const TELEGRAM_ACCOUNT_CONTROL_REQUEST_TIMEOUT_MS = 80_000;
export const TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS = 125_000;
const AUTH_ID_PATTERN = /^[A-Za-z0-9:_-]{16,160}$/u;
const ACCOUNT_REF_PATTERN = /^[A-Za-z0-9:_-]{16,160}$/u;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9:_-]{8,160}$/u;
const ORG_ID_PATTERN = /^[A-Za-z0-9:_-]{1,80}$/u;
const SAFE_REASON_PATTERN = /^[a-z][a-z0-9_]{2,79}$/u;
const QR_DATA_URL_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u;
const QR_LOGIN_URL_PATTERN = /^tg:\/\/login\?token=[A-Za-z0-9_-]{16,512}={0,2}$/u;

export type TelegramAccountServiceErrorCode =
  | 'telegram_campaign_gateway_unavailable'
  | 'telegram_campaign_gateway_invalid_response'
  | 'telegram_campaign_gateway_not_found'
  | 'telegram_campaign_gateway_conflict';

export class TelegramAccountServiceError extends Error {
  constructor(readonly code: TelegramAccountServiceErrorCode) {
    super(code);
    this.name = 'TelegramAccountServiceError';
  }
}

export interface TelegramAccountConnectChallenge {
  status: 'connecting';
  authId: string;
  qrCodeDataUrl: string | null;
  qrLoginUrl: string | null;
  expiresAt: string;
}

export type TelegramAccountConnectionPoll =
  | TelegramAccountConnectChallenge
  | {
    status: 'connected';
    authId: string;
    accountRef: string;
    maskedLabel: string;
    connectedAt: string;
  }
  | {
    status: 'restricted' | 'reauth_required' | 'revoked' | 'error';
    authId: string;
    reasonCode: string;
  };

interface ServiceEnvelope {
  schema: typeof SERVICE_SCHEMA;
  status: string;
  [key: string]: unknown;
}

function exactRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length
    && actual.every((key, index) => key === sorted[index]);
}

function validIso(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 20
    && value.length <= 64
    && Number.isFinite(Date.parse(value));
}

function validChallengeExpiry(value: unknown): value is string {
  if (!validIso(value)) return false;
  const expiresAt = Date.parse(value);
  const now = Date.now();
  return expiresAt > now - 5_000 && expiresAt <= now + 15 * 60_000;
}

function validMaskedLabel(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length >= 1
    && value.length <= 40
    && !/[@+]|https?:|t\.me|\d{5,}/iu.test(value)
    && ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    });
}

function assertRequestScope(orgId: string, operationId?: string): void {
  if (!ORG_ID_PATTERN.test(orgId)
    || (operationId !== undefined && !OPERATION_ID_PATTERN.test(operationId))) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
}

function configured(service: Fetcher | undefined): service is Fetcher {
  return Boolean(service && typeof service.fetch === 'function');
}

export function hasPrivateTelegramAccountService(service: Fetcher | undefined): service is Fetcher {
  return configured(service);
}

interface ResponseDeadline {
  expiresAt: number;
  controller: AbortController;
  callerSignal?: AbortSignal;
}

const responseDeadlines = new WeakMap<Response, ResponseDeadline>();

class TelegramAccountServiceTimeoutError extends Error {
  constructor() {
    super('telegram_account_service_timeout');
    this.name = 'TelegramAccountServiceTimeoutError';
  }
}

async function fetchWithDeadline(
  service: Fetcher,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let callerAbort: (() => void) | undefined;
  const expiresAt = Date.now() + timeoutMs;
  const aborted = new Promise<never>((_resolve, reject) => {
    const abort = () => {
      controller.abort();
      reject(new TelegramAccountServiceTimeoutError());
    };
    timeoutId = setTimeout(abort, timeoutMs);
    if (callerSignal) {
      callerAbort = abort;
      if (callerSignal.aborted) abort();
      else callerSignal.addEventListener('abort', abort, { once: true });
    }
  });
  try {
    const response = await Promise.race([
      service.fetch(url, { ...init, signal: controller.signal }),
      aborted,
    ]);
    responseDeadlines.set(response, {
      expiresAt,
      controller,
      ...(callerSignal ? { callerSignal } : {}),
    });
    return response;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (callerSignal && callerAbort) {
      callerSignal.removeEventListener('abort', callerAbort);
    }
  }
}

async function responseTextBeforeDeadline(response: Response): Promise<string> {
  const deadline = responseDeadlines.get(response);
  if (!deadline) return response.text();
  const remainingMs = deadline.expiresAt - Date.now();
  if (remainingMs <= 0) {
    deadline.controller.abort();
    responseDeadlines.delete(response);
    throw new TelegramAccountServiceTimeoutError();
  }
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let callerAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      response.text(),
      new Promise<never>((_resolve, reject) => {
        const abort = () => {
          deadline.controller.abort();
          reject(new TelegramAccountServiceTimeoutError());
        };
        timeoutId = setTimeout(abort, remainingMs);
        if (deadline.callerSignal) {
          callerAbort = abort;
          if (deadline.callerSignal.aborted) abort();
          else deadline.callerSignal.addEventListener('abort', abort, { once: true });
        }
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (deadline.callerSignal && callerAbort) {
      deadline.callerSignal.removeEventListener('abort', callerAbort);
    }
    responseDeadlines.delete(response);
  }
}

async function serviceFetch(
  service: Fetcher | undefined,
  pathname: string,
  init: RequestInit,
): Promise<Response> {
  if (!configured(service)) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_unavailable');
  }
  try {
    return await fetchWithDeadline(
      service,
      `${INTERNAL_ORIGIN}${pathname}`,
      init,
      TELEGRAM_ACCOUNT_CONTROL_REQUEST_TIMEOUT_MS,
    );
  } catch {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_unavailable');
  }
}

function statusError(response: Response): never {
  if (response.status === 404) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_not_found');
  }
  if (response.status === 409) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_conflict');
  }
  if (response.status === 429 || response.status >= 500) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_unavailable');
  }
  throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
}

async function responseEnvelope(response: Response): Promise<ServiceEnvelope> {
  if (!response.ok) statusError(response);
  const declared = Number(response.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  let raw: string;
  try {
    raw = await responseTextBeforeDeadline(response);
  } catch {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_unavailable');
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  if (!exactRecord(parsed)
    || parsed.schema !== SERVICE_SCHEMA
    || typeof parsed.status !== 'string') {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  return parsed as ServiceEnvelope;
}

function challenge(envelope: ServiceEnvelope): TelegramAccountConnectChallenge {
  if (!exactKeys(envelope, [
    'schema', 'status', 'auth_id', 'qr_code_data_url', 'qr_login_url', 'expires_at',
  ])
    || envelope.status !== 'connecting'
    || typeof envelope.auth_id !== 'string'
    || !AUTH_ID_PATTERN.test(envelope.auth_id)
    || (envelope.qr_code_data_url !== null
      && (typeof envelope.qr_code_data_url !== 'string'
        || envelope.qr_code_data_url.length > 350_000
        || !QR_DATA_URL_PATTERN.test(envelope.qr_code_data_url)))
    || (envelope.qr_login_url !== null
      && (typeof envelope.qr_login_url !== 'string'
        || envelope.qr_login_url.length > 531
        || !QR_LOGIN_URL_PATTERN.test(envelope.qr_login_url)))
    || !validChallengeExpiry(envelope.expires_at)) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
  return {
    status: 'connecting',
    authId: envelope.auth_id,
    qrCodeDataUrl: envelope.qr_code_data_url as string | null,
    qrLoginUrl: envelope.qr_login_url as string | null,
    expiresAt: envelope.expires_at,
  };
}

export async function beginTelegramAccountConnection(input: {
  service?: Fetcher;
  orgId: string;
  operationId: string;
}): Promise<TelegramAccountConnectChallenge> {
  assertRequestScope(input.orgId, input.operationId);
  const response = await serviceFetch(input.service, '/v1/accounts/connect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Idempotency-Key': input.operationId,
    },
    body: JSON.stringify({
      schema: SERVICE_SCHEMA,
      org_id: input.orgId,
      operation_id: input.operationId,
    }),
  });
  return challenge(await responseEnvelope(response));
}

export async function getActiveTelegramAccountConnection(input: {
  service?: Fetcher;
  orgId: string;
}): Promise<TelegramAccountConnectChallenge> {
  assertRequestScope(input.orgId);
  const response = await serviceFetch(
    input.service,
    `/v1/accounts/connect/active?org_id=${encodeURIComponent(input.orgId)}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
  );
  return challenge(await responseEnvelope(response));
}

export async function pollTelegramAccountConnection(input: {
  service?: Fetcher;
  orgId: string;
  authId: string;
}): Promise<TelegramAccountConnectionPoll> {
  assertRequestScope(input.orgId);
  if (!AUTH_ID_PATTERN.test(input.authId)) {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_not_found');
  }
  const response = await serviceFetch(input.service, '/v1/accounts/connect/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      schema: SERVICE_SCHEMA,
      org_id: input.orgId,
      auth_id: input.authId,
    }),
  });
  const envelope = await responseEnvelope(response);
  if (envelope.status === 'connecting') return challenge(envelope);
  if (envelope.status === 'connected') {
    if (!exactKeys(envelope, [
      'schema', 'status', 'auth_id', 'account_ref', 'masked_label', 'connected_at',
    ])
      || envelope.auth_id !== input.authId
      || typeof envelope.account_ref !== 'string'
      || !ACCOUNT_REF_PATTERN.test(envelope.account_ref)
      || !validMaskedLabel(envelope.masked_label)
      || !validIso(envelope.connected_at)) {
      throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
    }
    return {
      status: 'connected',
      authId: input.authId,
      accountRef: envelope.account_ref,
      maskedLabel: envelope.masked_label,
      connectedAt: envelope.connected_at,
    };
  }
  if (envelope.status === 'restricted'
    || envelope.status === 'reauth_required'
    || envelope.status === 'revoked'
    || envelope.status === 'error') {
    if (!exactKeys(envelope, ['schema', 'status', 'auth_id', 'reason_code'])
      || envelope.auth_id !== input.authId
      || typeof envelope.reason_code !== 'string'
      || !SAFE_REASON_PATTERN.test(envelope.reason_code)) {
      throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
    }
    return {
      status: envelope.status,
      authId: input.authId,
      reasonCode: envelope.reason_code,
    };
  }
  throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
}

export async function disconnectTelegramAccountService(input: {
  service?: Fetcher;
  orgId: string;
  operationId: string;
}): Promise<void> {
  assertRequestScope(input.orgId, input.operationId);
  const response = await serviceFetch(input.service, '/v1/accounts/disconnect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Idempotency-Key': input.operationId,
    },
    body: JSON.stringify({
      schema: SERVICE_SCHEMA,
      org_id: input.orgId,
      operation_id: input.operationId,
    }),
  });
  // Disconnect is idempotent: a missing private session is already the
  // requested terminal state and must not strand stale D1 account metadata.
  if (response.status === 204 || response.status === 404) return;
  const envelope = await responseEnvelope(response);
  if (!exactKeys(envelope, ['schema', 'status']) || envelope.status !== 'revoked') {
    throw new TelegramAccountServiceError('telegram_campaign_gateway_invalid_response');
  }
}

/**
 * Provider adapter for the private service binding. Once the request crosses
 * this boundary, every transport/parse uncertainty is ambiguous and is never
 * surfaced as a retryable exception.
 */
export class PrivateTelegramCampaignSender implements TelegramCampaignSender {
  constructor(private readonly service: Fetcher) {}

  async send(input: Parameters<TelegramCampaignSender['send']>[0]): Promise<TelegramCampaignProviderResult> {
    let response: Response;
    try {
      response = await fetchWithDeadline(
        this.service,
        `${INTERNAL_ORIGIN}/v1/messages/send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({
            schema: SERVICE_SCHEMA,
            account_ref: input.gatewayAccountRef,
            username: input.username,
            text: input.text,
            random_id: input.randomId,
            paid_message_policy: 'reject',
            allow_paid_floodskip: false,
          }),
        },
        TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS,
      );
    } catch {
      return { kind: 'ambiguous' };
    }
    let envelope: ServiceEnvelope;
    try {
      envelope = await responseEnvelope(response);
    } catch {
      return { kind: 'ambiguous' };
    }
    if (envelope.status === 'sent'
      && exactKeys(envelope, ['schema', 'status', 'provider_message_id'])
      && typeof envelope.provider_message_id === 'string'
      && envelope.provider_message_id.length >= 1
      && envelope.provider_message_id.length <= 256) {
      return { kind: 'sent', providerMessageId: envelope.provider_message_id };
    }
    if (envelope.status === 'ambiguous'
      && exactKeys(envelope, ['schema', 'status'])) {
      return { kind: 'ambiguous' };
    }
    if (envelope.status === 'rejected'
      && (exactKeys(envelope, ['schema', 'status', 'code'])
        || exactKeys(envelope, ['schema', 'status', 'code', 'retry_after_seconds']))
      && typeof envelope.code === 'string') {
      const code = envelope.code;
      if (code === 'peer_invalid' || code === 'privacy_restricted'
        || code === 'account_restricted' || code === 'paid_message_required'
        || code === 'provider_rejected') {
        return { kind: 'rejected', code };
      }
      if ((code === 'flood_wait' || code === 'flood_premium_wait' || code === 'slow_mode')
        && (envelope.retry_after_seconds === undefined
          || (typeof envelope.retry_after_seconds === 'number'
            && Number.isSafeInteger(envelope.retry_after_seconds)
            && envelope.retry_after_seconds >= 1))) {
        return {
          kind: 'rejected',
          code,
          ...(typeof envelope.retry_after_seconds === 'number'
            ? { retryAfterSeconds: envelope.retry_after_seconds }
            : {}),
        };
      }
      // Every unknown provider rejection is terminal and never triggers a
      // second request or a Stars payment.
      return { kind: 'rejected', code: 'provider_rejected' };
    }
    return { kind: 'ambiguous' };
  }
}
