import { DurableObject } from 'cloudflare:workers';

import {
  createWrappedAccountSeed,
  decryptSnapshot,
  encryptSnapshot,
  parseMasterKey,
  randomOpaqueId,
  sha256Hex,
  tdlibDatabaseKey,
  unwrapAccountSeed,
  wrapAccountSeed,
  type WrappedAccountSeed,
} from './crypto';
import {
  authActionAllowed,
  authMetadataFrom,
  parseDurableAuthMetadata,
} from './auth-metadata';
import {
  decideEffectReservation,
  expiredTerminalEffectKeys,
  recoverExpiredEffect,
  type RetainedEffectLedgerEntry,
} from './idempotency';
import {
  ACCOUNT_REF_PATTERN,
  AUTH_ID_PATTERN,
  hasExactKeys,
  INTERNAL_ACCOUNT_ORIGIN,
  isRecord,
  jsonResponse,
  noContentResponse,
  OPERATION_ID_PATTERN,
  PAYLOAD_DIGEST_PATTERN,
  providerEnvelope,
  readBoundedJson,
  safeErrorResponse,
  SAFE_REASON_PATTERN,
  TDLIB_CONTAINER_SCHEMA,
  TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
  USERNAME_PATTERN,
  validAuthenticationCode,
  validMessage,
  validPassword,
  validPhoneNumber,
  validQrLoginUrl,
  type JsonRecord,
  type SafeProviderEnvelope,
} from './protocol';

const CONTAINER_PORT = 8_080;
const AUTH_TTL_MS = 10 * 60_000;
const MAX_SNAPSHOT_BYTES = 24 * 1024 * 1024;
const EFFECT_LEASE_MS = 60_000;
const EFFECT_RETENTION_MS = 30 * 24 * 60 * 60_000;
const ACCOUNT_STORAGE_KEY = 'account:v1';
const ACTIVE_AUTH_KEY = 'auth:active:v1';
const ACTIVE_EFFECT_KEY = 'effect:active';
const EFFECT_GC_LIMIT = 32;

export interface TelegramAccountGatewayEnv {
  TELEGRAM_ACCOUNTS: DurableObjectNamespace<LeadRadarTelegramAccount>;
  TELEGRAM_SESSION_BUCKET: R2Bucket;
  LEAD_RADAR_TELEGRAM_API_ID: string;
  LEAD_RADAR_TELEGRAM_API_HASH: string;
  LEAD_RADAR_TELEGRAM_ACCOUNT_DATA_KEY: string;
  LEAD_RADAR_TELEGRAM_ACCOUNT_PREVIOUS_DATA_KEYS?: string;
  LEAD_RADAR_TELEGRAM_ACCOUNT_ROUTING_KEY: string;
  LEAD_RADAR_TELEGRAM_ACCOUNT_KEY_VERSION: string;
  LEAD_RADAR_TELEGRAM_TDLIB_SOURCE_COMMIT: string;
  LEAD_RADAR_TELEGRAM_GATEWAY_VERSION: string;
}

type AccountStatus = 'new' | 'connected' | 'restricted' | 'reauth_required' | 'revoked' | 'error';

interface SnapshotRecord {
  objectKey: string;
  generation: string;
  keyVersion: string;
  byteLength: number;
  savedAt: string;
}

interface AccountRecord {
  version: 1;
  accountRef: string;
  status: AccountStatus;
  maskedLabel: string;
  connectedAt: string | null;
  reasonCode: string | null;
  providerBlockedUntil: string | null;
  wrappedSeed: WrappedAccountSeed;
  snapshot: SnapshotRecord | null;
  updatedAt: string;
}

type AuthState =
  | 'starting'
  | 'awaiting_phone'
  | 'awaiting_qr'
  | 'awaiting_code'
  | 'awaiting_password'
  | 'connected'
  | 'restricted'
  | 'reauth_required'
  | 'revoked'
  | 'error';

interface AuthSession {
  authId: string;
  operationId: string;
  mode: 'qr' | 'phone';
  state: AuthState;
  qrCodeDataUrl: string | null;
  qrLoginUrl: string | null;
  expiresAt: string;
  reasonCode: string | null;
  maskedLabel: string | null;
  identityVerifiedAt: string | null;
}

interface EffectRecord {
  version: 1;
  operationId: string;
  payloadDigest: string;
  status: 'in_flight' | 'sent' | 'rejected' | 'ambiguous';
  response: SafeProviderEnvelope | null;
  leaseExpiresAt: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

interface RateWindow {
  version: 1;
  startedAtMs: number;
  count: number;
}

interface ContainerHealth {
  bootId: string;
  clientState: string;
}

class GatewayFault extends Error {
  constructor(
    readonly reasonCode: string,
    readonly status = 503,
  ) {
    super(reasonCode);
    this.name = 'GatewayFault';
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function validKeyVersion(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,40}$/u.test(value);
}

function safeRecord(value: unknown): AccountRecord | null {
  if (!isRecord(value)
    || value.version !== 1
    || typeof value.accountRef !== 'string'
    || !ACCOUNT_REF_PATTERN.test(value.accountRef)
    || !['new', 'connected', 'restricted', 'reauth_required', 'revoked', 'error']
      .includes(String(value.status))
    || typeof value.maskedLabel !== 'string'
    || (value.connectedAt !== null && typeof value.connectedAt !== 'string')
    || (value.reasonCode !== null
      && (typeof value.reasonCode !== 'string' || !SAFE_REASON_PATTERN.test(value.reasonCode)))
    || (value.providerBlockedUntil !== null
      && (typeof value.providerBlockedUntil !== 'string'
        || !Number.isFinite(Date.parse(value.providerBlockedUntil))))
    || !isRecord(value.wrappedSeed)
    || (value.snapshot !== null && !isRecord(value.snapshot))
    || typeof value.updatedAt !== 'string') return null;
  return value as unknown as AccountRecord;
}

function effectStorageKey(operationId: string): string {
  return `effect:v1:${operationId}`;
}

function retainedEffectForGc(value: unknown): RetainedEffectLedgerEntry | null {
  if (!isRecord(value)
    || value.version !== 1
    || typeof value.operationId !== 'string'
    || !OPERATION_ID_PATTERN.test(value.operationId)
    || typeof value.payloadDigest !== 'string'
    || !PAYLOAD_DIGEST_PATTERN.test(value.payloadDigest)
    || !['sent', 'rejected', 'ambiguous'].includes(String(value.status))
    || !isRecord(value.response)
    || value.response.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
    || value.response.status !== value.status
    || typeof value.leaseExpiresAt !== 'string'
    || !Number.isFinite(Date.parse(value.leaseExpiresAt))
    || typeof value.expiresAt !== 'string'
    || !Number.isFinite(Date.parse(value.expiresAt))) return null;
  return {
    operationId: value.operationId,
    payloadDigest: value.payloadDigest,
    response: value.response as unknown as SafeProviderEnvelope,
    leaseExpiresAt: value.leaseExpiresAt,
    expiresAt: value.expiresAt,
  };
}

async function limitedArrayBuffer(response: Response, maximum: number): Promise<ArrayBuffer> {
  const declared = Number(response.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > maximum) {
    throw new GatewayFault('snapshot_too_large');
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maximum) throw new GatewayFault('snapshot_too_large');
  return bytes;
}

function containerAuthState(value: unknown): {
  state: AuthState;
  qrCodeDataUrl: string | null;
  qrLoginUrl: string | null;
  reasonCode: string | null;
  maskedLabel: string | null;
  identityVerifiedAt: string | null;
} | null {
  if (!isRecord(value)
    || value.schema !== TDLIB_CONTAINER_SCHEMA
    || typeof value.status !== 'string') return null;
  const statusMap: Record<string, AuthState> = {
    starting: 'starting',
    awaiting_phone: 'awaiting_phone',
    awaiting_qr: 'awaiting_qr',
    awaiting_code: 'awaiting_code',
    awaiting_password: 'awaiting_password',
    connected: 'connected',
    restricted: 'restricted',
    reauth_required: 'reauth_required',
    revoked: 'revoked',
    error: 'error',
  };
  const state = statusMap[value.status];
  if (!state) return null;
  const qr = value.qr_code_data_url;
  if (qr !== undefined
    && qr !== null
    && (typeof qr !== 'string'
      || qr.length > 350_000
      || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u.test(qr))) return null;
  const qrLoginUrl = value.qr_login_url;
  if (qrLoginUrl !== undefined
    && qrLoginUrl !== null
    && !validQrLoginUrl(qrLoginUrl)) return null;
  const reason = value.reason_code;
  if (reason !== undefined
    && reason !== null
    && (typeof reason !== 'string' || !SAFE_REASON_PATTERN.test(reason))) return null;
  const maskedLabel = value.masked_label;
  if (maskedLabel !== undefined
    && maskedLabel !== null
    && (typeof maskedLabel !== 'string'
      || maskedLabel.length < 1
      || maskedLabel.length > 40
      || /[@+]|https?:|t\.me|\d{5,}/iu.test(maskedLabel))) return null;
  const identityVerifiedAt = value.identity_verified_at;
  if (identityVerifiedAt !== undefined
    && identityVerifiedAt !== null
    && (typeof identityVerifiedAt !== 'string'
      || !Number.isFinite(Date.parse(identityVerifiedAt)))) return null;
  return {
    state,
    qrCodeDataUrl: typeof qr === 'string' ? qr : null,
    qrLoginUrl: typeof qrLoginUrl === 'string' ? qrLoginUrl : null,
    reasonCode: typeof reason === 'string' ? reason : null,
    maskedLabel: typeof maskedLabel === 'string' ? maskedLabel : null,
    identityVerifiedAt: typeof identityVerifiedAt === 'string' ? identityVerifiedAt : null,
  };
}

export class LeadRadarTelegramAccount extends DurableObject<TelegramAccountGatewayEnv> {
  private authSession: AuthSession | null = null;
  private containerBootId: string | null = null;
  private serial: Promise<void> = Promise.resolve();

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.serial;
    let release = (): void => undefined;
    this.serial = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private masterKey(): Uint8Array {
    const key = parseMasterKey(this.env.LEAD_RADAR_TELEGRAM_ACCOUNT_DATA_KEY);
    if (!key) throw new GatewayFault('gateway_not_configured');
    return key;
  }

  private dataKeyForVersion(version: string): Uint8Array {
    if (version === this.keyVersion()) return this.masterKey();
    const raw = this.env.LEAD_RADAR_TELEGRAM_ACCOUNT_PREVIOUS_DATA_KEYS;
    if (!raw || raw.length > 2_048) throw new GatewayFault('snapshot_key_version_unavailable');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new GatewayFault('snapshot_keyring_invalid');
    }
    if (!isRecord(parsed)
      || Object.keys(parsed).length > 3
      || Object.keys(parsed).some((key) => !validKeyVersion(key))) {
      throw new GatewayFault('snapshot_keyring_invalid');
    }
    const keyValue = parsed[version];
    const key = typeof keyValue === 'string' ? parseMasterKey(keyValue) : null;
    if (!key) throw new GatewayFault('snapshot_key_version_unavailable');
    return key;
  }

  private keyVersion(): string {
    const version = this.env.LEAD_RADAR_TELEGRAM_ACCOUNT_KEY_VERSION;
    if (!validKeyVersion(version)) throw new GatewayFault('gateway_not_configured');
    return version;
  }

  private async account(): Promise<AccountRecord | null> {
    return safeRecord(await this.ctx.storage.get(ACCOUNT_STORAGE_KEY));
  }

  private async seedForAccount(account: AccountRecord): Promise<{
    account: AccountRecord;
    seed: Uint8Array;
  }> {
    const seed = await unwrapAccountSeed({
      master: this.dataKeyForVersion(account.wrappedSeed.keyVersion),
      accountRef: account.accountRef,
      wrapped: account.wrappedSeed,
    });
    if (seed.byteLength !== 32) throw new GatewayFault('snapshot_key_invalid');
    if (account.wrappedSeed.keyVersion === this.keyVersion()) return { account, seed };
    const rewrapped = await wrapAccountSeed({
      master: this.masterKey(),
      accountRef: account.accountRef,
      keyVersion: this.keyVersion(),
      seed,
    });
    const updated: AccountRecord = {
      ...account,
      wrappedSeed: rewrapped,
      updatedAt: nowIso(),
    };
    await this.ctx.storage.put(ACCOUNT_STORAGE_KEY, updated);
    return { account: updated, seed };
  }

  private async ensureAccount(accountRef: string): Promise<AccountRecord> {
    const existing = await this.account();
    if (existing) {
      if (existing.accountRef !== accountRef) throw new GatewayFault('account_scope_conflict', 409);
      return existing;
    }
    const created = await createWrappedAccountSeed({
      master: this.masterKey(),
      accountRef,
      keyVersion: this.keyVersion(),
    });
    const record: AccountRecord = {
      version: 1,
      accountRef,
      status: 'new',
      maskedLabel: 'Telegram account',
      connectedAt: null,
      reasonCode: null,
      providerBlockedUntil: null,
      wrappedSeed: created.wrapped,
      snapshot: null,
      updatedAt: nowIso(),
    };
    await this.ctx.storage.put(ACCOUNT_STORAGE_KEY, record);
    return record;
  }

  private container(): Container {
    if (!this.ctx.container) throw new GatewayFault('container_binding_missing');
    return this.ctx.container;
  }

  private async containerFetch(
    path: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    try {
      return await this.container().getTcpPort(CONTAINER_PORT).fetch(
        `http://tdlib.internal${path}`,
        { ...init, signal: AbortSignal.timeout(timeoutMs) },
      );
    } catch {
      throw new GatewayFault('container_unavailable');
    }
  }

  private async waitForContainer(): Promise<ContainerHealth> {
    for (let attempt = 0; attempt < 7; attempt += 1) {
      try {
        const response = await this.containerFetch('/v1/health', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }, 2_000);
        const parsed = await response.json() as unknown;
        if (response.ok
          && isRecord(parsed)
          && parsed.schema === TDLIB_CONTAINER_SCHEMA
          && parsed.status === 'ok'
          && typeof parsed.boot_id === 'string'
          && /^[A-Za-z0-9_-]{16,80}$/u.test(parsed.boot_id)
          && typeof parsed.client_state === 'string') {
          return { bootId: parsed.boot_id, clientState: parsed.client_state };
        }
      } catch {
        // Readiness is bounded below; no body or upstream error is logged.
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(1_000, 100 * 2 ** attempt)));
    }
    throw new GatewayFault('container_not_ready');
  }

  private async startContainer(account: AccountRecord, seed: Uint8Array): Promise<ContainerHealth> {
    const container = this.container();
    if (!container.running) {
      container.start({
        enableInternet: true,
        env: {
          TELEGRAM_API_ID: this.env.LEAD_RADAR_TELEGRAM_API_ID,
          TELEGRAM_API_HASH: this.env.LEAD_RADAR_TELEGRAM_API_HASH,
          TDLIB_DATABASE_KEY: await tdlibDatabaseKey(seed, account.accountRef),
          TDLIB_SOURCE_COMMIT: this.env.LEAD_RADAR_TELEGRAM_TDLIB_SOURCE_COMMIT,
          GATEWAY_VERSION: this.env.LEAD_RADAR_TELEGRAM_GATEWAY_VERSION,
        },
        labels: {
          component: 'lead-radar-telegram-account',
          contract: 'v1',
        },
      });
    }
    return this.waitForContainer();
  }

  private async restoreSnapshot(account: AccountRecord, seed: Uint8Array): Promise<void> {
    if (!account.snapshot) return;
    const object = await this.env.TELEGRAM_SESSION_BUCKET.get(account.snapshot.objectKey);
    if (!object) throw new GatewayFault('snapshot_missing');
    const ciphertext = await limitedArrayBuffer(
      new Response(object.body, { headers: object.httpMetadata?.contentType
        ? { 'Content-Type': object.httpMetadata.contentType }
        : undefined }),
      MAX_SNAPSHOT_BYTES + 64,
    );
    const plaintext = await decryptSnapshot({
      seed,
      accountRef: account.accountRef,
      generation: account.snapshot.generation,
      keyVersion: account.snapshot.keyVersion,
      ciphertext,
    });
    const response = await this.containerFetch('/v1/session/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: plaintext,
    }, 20_000);
    if (!response.ok) throw new GatewayFault('snapshot_restore_failed');
  }

  private async ensureClient(account: AccountRecord): Promise<void> {
    const current = await this.seedForAccount(account);
    const health = await this.startContainer(current.account, current.seed);
    if (health.bootId !== this.containerBootId) {
      // A JavaScript isolate may be evicted while its attached Container and
      // TDLib client stay alive. Trust that live client instead of importing
      // an older snapshot over an in-progress authorization session.
      if (health.clientState === 'not_started') {
        await this.restoreSnapshot(current.account, current.seed);
        const response = await this.containerFetch('/v1/auth/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ schema: TDLIB_CONTAINER_SCHEMA }),
        }, 15_000);
        if (!response.ok) throw new GatewayFault('tdlib_start_failed');
      }
      this.containerBootId = health.bootId;
    }
  }

  private async saveSnapshot(account: AccountRecord): Promise<AccountRecord> {
    const response = await this.containerFetch('/v1/session/export', {
      method: 'POST',
      headers: { Accept: 'application/octet-stream' },
    }, 30_000);
    if (!response.ok || response.headers.get('Content-Type') !== 'application/octet-stream') {
      throw new GatewayFault('snapshot_export_failed');
    }
    const plaintext = await limitedArrayBuffer(response, MAX_SNAPSHOT_BYTES);
    const current = await this.seedForAccount(account);
    account = current.account;
    const seed = current.seed;
    const generation = randomOpaqueId('gen_', 12);
    const keyVersion = account.wrappedSeed.keyVersion;
    const ciphertext = await encryptSnapshot({
      seed,
      accountRef: account.accountRef,
      generation,
      keyVersion,
      plaintext,
    });
    const objectKey = `telegram-sessions/v1/${account.accountRef}/${generation}.bin`;
    await this.env.TELEGRAM_SESSION_BUCKET.put(objectKey, ciphertext, {
      httpMetadata: { contentType: 'application/octet-stream' },
    });
    const previous = account.snapshot?.objectKey ?? null;
    const updated: AccountRecord = {
      ...account,
      snapshot: {
        objectKey,
        generation,
        keyVersion,
        byteLength: ciphertext.byteLength,
        savedAt: nowIso(),
      },
      updatedAt: nowIso(),
    };
    try {
      await this.ctx.storage.put(ACCOUNT_STORAGE_KEY, updated);
    } catch (error) {
      await this.env.TELEGRAM_SESSION_BUCKET.delete(objectKey);
      throw error;
    }
    if (previous && previous !== objectKey) {
      await this.env.TELEGRAM_SESSION_BUCKET.delete(previous);
    }
    // Export closes TDLib for a consistent archive. The next operation starts
    // it from the still-mounted database or from the encrypted R2 snapshot.
    this.containerBootId = null;
    return updated;
  }

  private async rateLimit(bucket: string, maximum: number, windowMs: number): Promise<boolean> {
    const key = `rate:v1:${bucket}`;
    const now = Date.now();
    return this.ctx.storage.transaction(async (transaction) => {
      const current = await transaction.get<RateWindow>(key);
      const active = current?.version === 1 && current.startedAtMs + windowMs > now
        ? current
        : { version: 1 as const, startedAtMs: now, count: 0 };
      if (active.count >= maximum) return false;
      await transaction.put(key, { ...active, count: active.count + 1 });
      return true;
    });
  }

  private async containerJson(path: string, body: JsonRecord, timeoutMs = 15_000): Promise<JsonRecord> {
    const response = await this.containerFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    }, timeoutMs);
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new GatewayFault('container_invalid_response');
    }
    if (!response.ok || !isRecord(parsed) || parsed.schema !== TDLIB_CONTAINER_SCHEMA) {
      throw new GatewayFault('container_invalid_response');
    }
    return parsed;
  }

  private authExpiry(): string {
    return new Date(Date.now() + AUTH_TTL_MS).toISOString();
  }

  private authChallenge(session: AuthSession): Response {
    return jsonResponse({
      schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
      status: 'connecting',
      auth_id: session.authId,
      qr_code_data_url: session.qrCodeDataUrl,
      qr_login_url: session.qrLoginUrl,
      expires_at: session.expiresAt,
    });
  }

  private detailedAuthState(session: AuthSession): Response {
    return jsonResponse({
      schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
      status: session.state,
      auth_id: session.authId,
      expires_at: session.expiresAt,
      qr_code_data_url: session.qrCodeDataUrl,
      qr_login_url: session.qrLoginUrl,
      reason_code: session.reasonCode,
    });
  }

  private async clearAuthMetadata(): Promise<void> {
    this.authSession = null;
    await this.ctx.storage.delete(ACTIVE_AUTH_KEY);
  }

  private async hydrateAuth(): Promise<AuthSession | null> {
    const now = Date.now();
    if (this.authSession && Date.parse(this.authSession.expiresAt) > now) {
      return this.authSession;
    }
    this.authSession = null;
    const raw = await this.ctx.storage.get<unknown>(ACTIVE_AUTH_KEY);
    if (raw === undefined) return null;
    const metadata = parseDurableAuthMetadata(raw, now);
    if (!metadata) {
      await this.ctx.storage.delete(ACTIVE_AUTH_KEY);
      return null;
    }
    const account = await this.account();
    if (!account) {
      await this.ctx.storage.delete(ACTIVE_AUTH_KEY);
      return null;
    }
    await this.ensureClient(account);
    let session: AuthSession = {
      authId: metadata.authId,
      operationId: metadata.operationId,
      mode: metadata.mode,
      state: 'starting',
      qrCodeDataUrl: null,
      qrLoginUrl: null,
      expiresAt: metadata.expiresAt,
      reasonCode: null,
      maskedLabel: null,
      identityVerifiedAt: null,
    };
    this.authSession = session;
    session = await this.refreshAuth(session);
    // If the attached Container restarted, QR mode must be requested again;
    // the short-lived URL and PNG are rebuilt from TDLib and never persisted.
    if (metadata.mode === 'qr' && session.state === 'awaiting_phone') {
      await this.containerJson('/v1/auth/qr', { schema: TDLIB_CONTAINER_SCHEMA });
      session = await this.refreshAuth(session);
    }
    return session;
  }

  private async refreshAuth(session: AuthSession): Promise<AuthSession> {
    if (Date.parse(session.expiresAt) <= Date.now()) {
      await this.clearAuthMetadata();
      throw new GatewayFault('auth_expired', 404);
    }
    const parsed = await this.containerJson('/v1/auth/state', {
      schema: TDLIB_CONTAINER_SCHEMA,
    });
    const state = containerAuthState(parsed);
    if (!state) throw new GatewayFault('container_invalid_response');
    const refreshed: AuthSession = {
      ...session,
      state: state.state,
      qrCodeDataUrl: state.qrCodeDataUrl,
      qrLoginUrl: state.qrLoginUrl,
      reasonCode: state.reasonCode,
      maskedLabel: state.maskedLabel,
      identityVerifiedAt: state.identityVerifiedAt,
    };
    this.authSession = refreshed;
    return refreshed;
  }

  private async beginAuth(body: JsonRecord, mode: 'qr' | 'phone'): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'org_id', 'operation_id', 'account_ref'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.operation_id !== 'string'
      || !OPERATION_ID_PATTERN.test(body.operation_id)
      || typeof body.account_ref !== 'string'
      || !ACCOUNT_REF_PATTERN.test(body.account_ref)) {
      return safeErrorResponse('invalid_request');
    }
    if (!await this.rateLimit('auth_begin', 5, 60 * 60_000)) {
      return safeErrorResponse('auth_rate_limited', 429);
    }
    const existing = await this.account();
    if (existing?.status === 'connected') {
      await this.clearAuthMetadata();
      return safeErrorResponse('account_already_connected', 409);
    }
    const active = await this.hydrateAuth();
    if (active) {
      if (active.operationId !== body.operation_id || active.mode !== mode) {
        return safeErrorResponse('auth_in_progress', 409);
      }
      return this.authChallenge(active);
    }
    const account = await this.ensureAccount(body.account_ref);
    await this.ensureClient(account);
    const authId = randomOpaqueId('auth_', 18);
    const session: AuthSession = {
      authId,
      operationId: body.operation_id,
      mode,
      state: mode === 'qr' ? 'awaiting_qr' : 'awaiting_phone',
      qrCodeDataUrl: null,
      qrLoginUrl: null,
      expiresAt: this.authExpiry(),
      reasonCode: null,
      maskedLabel: null,
      identityVerifiedAt: null,
    };
    this.authSession = session;
    await this.ctx.storage.put(ACTIVE_AUTH_KEY, authMetadataFrom(session));
    const action = mode === 'qr' ? '/v1/auth/qr' : '/v1/auth/phone/start';
    await this.containerJson(action, { schema: TDLIB_CONTAINER_SCHEMA });
    return this.authChallenge(await this.refreshAuth(session));
  }

  private async activeAuth(authId: unknown): Promise<AuthSession> {
    const active = await this.hydrateAuth();
    if (typeof authId !== 'string'
      || !AUTH_ID_PATTERN.test(authId)
      || !active
      || active.authId !== authId) {
      throw new GatewayFault('auth_not_found', 404);
    }
    return active;
  }

  private async authAction(
    body: JsonRecord,
    kind: 'phone' | 'code' | 'resend' | 'password',
  ): Promise<Response> {
    const keys: Record<typeof kind, string[]> = {
      phone: ['schema', 'org_id', 'auth_id', 'phone_number'],
      code: ['schema', 'org_id', 'auth_id', 'code'],
      resend: ['schema', 'org_id', 'auth_id'],
      password: ['schema', 'org_id', 'auth_id', 'password'],
    };
    if (!hasExactKeys(body, keys[kind]) || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA) {
      return safeErrorResponse('invalid_request');
    }
    const session = await this.activeAuth(body.auth_id);
    if (!authActionAllowed({ mode: session.mode, state: session.state, action: kind })) {
      return safeErrorResponse('auth_state_conflict', 409, session.authId);
    }
    const limits = {
      phone: { maximum: 3, window: 15 * 60_000 },
      code: { maximum: 5, window: 15 * 60_000 },
      resend: { maximum: 3, window: 60 * 60_000 },
      password: { maximum: 5, window: 15 * 60_000 },
    }[kind];
    if (!await this.rateLimit(`auth_${kind}:${session.authId}`, limits.maximum, limits.window)) {
      return safeErrorResponse('auth_rate_limited', 429, session.authId);
    }
    if (kind === 'phone' && !validPhoneNumber(body.phone_number)) {
      return safeErrorResponse('phone_invalid', 400, session.authId);
    }
    if (kind === 'code' && !validAuthenticationCode(body.code)) {
      return safeErrorResponse('code_invalid', 400, session.authId);
    }
    if (kind === 'password' && !validPassword(body.password)) {
      return safeErrorResponse('password_invalid', 400, session.authId);
    }
    await this.containerJson(`/v1/auth/${kind}`, {
      schema: TDLIB_CONTAINER_SCHEMA,
      ...(kind === 'phone' ? { phone_number: body.phone_number } : {}),
      ...(kind === 'code' ? { code: body.code } : {}),
      ...(kind === 'password' ? { password: body.password } : {}),
    });
    return this.detailedAuthState(await this.refreshAuth(session));
  }

  private async authStatus(body: JsonRecord, detailed: boolean): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'org_id', 'auth_id'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA) {
      return safeErrorResponse('invalid_request');
    }
    if (!await this.rateLimit('auth_poll', 120, 60_000)) {
      return safeErrorResponse('auth_rate_limited', 429);
    }
    const session = await this.activeAuth(body.auth_id);
    const refreshed = await this.refreshAuth(session);
    if (refreshed.state === 'connected') {
      const account = await this.account();
      if (!account) throw new GatewayFault('account_not_found', 404);
      let saved: AccountRecord;
      try {
        saved = await this.saveSnapshot(account);
      } catch {
        await this.ctx.storage.put(ACCOUNT_STORAGE_KEY, {
          ...account,
          status: 'error',
          reasonCode: 'snapshot_save_failed',
          updatedAt: nowIso(),
        } satisfies AccountRecord);
        return safeErrorResponse('snapshot_save_failed', 503, refreshed.authId);
      }
      if (!refreshed.maskedLabel || !refreshed.identityVerifiedAt) {
        return safeErrorResponse('identity_verification_failed', 503, refreshed.authId);
      }
      const connectedAt = refreshed.identityVerifiedAt;
      const connected: AccountRecord = {
        ...saved,
        status: 'connected',
        maskedLabel: refreshed.maskedLabel,
        connectedAt,
        reasonCode: null,
        providerBlockedUntil: null,
        updatedAt: nowIso(),
      };
      await this.ctx.storage.transaction(async (transaction) => {
        await transaction.put(ACCOUNT_STORAGE_KEY, connected);
        await transaction.delete(ACTIVE_AUTH_KEY);
      });
      this.authSession = null;
      return jsonResponse({
        schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
        status: 'connected',
        auth_id: refreshed.authId,
        account_ref: connected.accountRef,
        masked_label: connected.maskedLabel,
        connected_at: connectedAt,
      });
    }
    if (refreshed.state === 'restricted'
      || refreshed.state === 'reauth_required'
      || refreshed.state === 'revoked'
      || refreshed.state === 'error') {
      return jsonResponse({
        schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
        status: refreshed.state,
        auth_id: refreshed.authId,
        reason_code: refreshed.reasonCode ?? 'authorization_failed',
      });
    }
    return detailed ? this.detailedAuthState(refreshed) : this.authChallenge(refreshed);
  }

  private async cancelAuth(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'org_id', 'auth_id'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA) {
      return safeErrorResponse('invalid_request');
    }
    const session = await this.activeAuth(body.auth_id);
    try {
      await this.containerJson('/v1/auth/cancel', { schema: TDLIB_CONTAINER_SCHEMA }, 10_000);
    } catch {
      return safeErrorResponse('remote_revoke_unconfirmed', 503, session.authId);
    }
    await this.clearAuthMetadata();
    this.containerBootId = null;
    await this.container().destroy();
    const account = await this.account();
    if (account?.snapshot) {
      await this.env.TELEGRAM_SESSION_BUCKET.delete(account.snapshot.objectKey);
    }
    await this.ctx.storage.delete(ACCOUNT_STORAGE_KEY);
    return noContentResponse();
  }

  private async activeConnection(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'org_id'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA) return safeErrorResponse('invalid_request');
    const active = await this.hydrateAuth();
    if (active) return this.authChallenge(active);
    return safeErrorResponse('auth_not_found', 404);
  }

  private async disconnect(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'org_id', 'operation_id', 'account_ref'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.operation_id !== 'string'
      || !OPERATION_ID_PATTERN.test(body.operation_id)) {
      return safeErrorResponse('invalid_request');
    }
    const account = await this.account();
    if (!account) {
      await this.clearAuthMetadata();
      return noContentResponse();
    }
    const operationKey = `disconnect:v1:${body.operation_id}`;
    const prior = await this.ctx.storage.get<string>(operationKey);
    if (prior === 'revoked') {
      await this.clearAuthMetadata();
      return noContentResponse();
    }
    const revoked: AccountRecord = {
      ...account,
      status: 'revoked',
      reasonCode: 'owner_revoked',
      updatedAt: nowIso(),
    };
    await this.ctx.storage.put(ACCOUNT_STORAGE_KEY, revoked);
    try {
      await this.ensureClient(revoked);
      await this.containerJson('/v1/account/disconnect', {
        schema: TDLIB_CONTAINER_SCHEMA,
      }, 20_000);
    } catch {
      await this.ctx.storage.put(ACCOUNT_STORAGE_KEY, {
        ...revoked,
        status: 'error',
        reasonCode: 'remote_revoke_unconfirmed',
        updatedAt: nowIso(),
      } satisfies AccountRecord);
      return safeErrorResponse('remote_revoke_unconfirmed', 503);
    }
    await this.container().destroy();
    this.containerBootId = null;
    await this.clearAuthMetadata();
    if (account.snapshot) {
      await this.env.TELEGRAM_SESSION_BUCKET.delete(account.snapshot.objectKey);
    }
    await this.ctx.storage.delete(ACTIVE_EFFECT_KEY);
    await this.ctx.storage.delete(ACCOUNT_STORAGE_KEY);
    await this.ctx.storage.put(operationKey, 'revoked');
    return noContentResponse();
  }

  private async recoverActiveEffect(nowMs: number): Promise<void> {
    await this.ctx.storage.transaction(async (transaction) => {
      const active = await transaction.get<string>(ACTIVE_EFFECT_KEY);
      if (!active) return;
      const activeKey = effectStorageKey(active);
      const activeRecord = await transaction.get<EffectRecord>(activeKey);
      const recovered = recoverExpiredEffect({
        activeOperationId: active,
        activeEntry: activeRecord
          ? {
            operationId: activeRecord.operationId,
            payloadDigest: activeRecord.payloadDigest,
            response: activeRecord.response,
            leaseExpiresAt: activeRecord.leaseExpiresAt,
          }
          : null,
        nowMs,
      });
      if (recovered.corrupted) throw new GatewayFault('effect_ledger_conflict', 409);
      if (recovered.recoveredEntry?.response && activeRecord && !activeRecord.response) {
        await transaction.put(activeKey, {
          ...activeRecord,
          status: 'ambiguous',
          response: recovered.recoveredEntry.response,
          updatedAt: new Date(nowMs).toISOString(),
        } satisfies EffectRecord);
      }
      if (recovered.clearActive) await transaction.delete(ACTIVE_EFFECT_KEY);
    });
  }

  private async garbageCollectEffects(nowMs: number): Promise<number> {
    const [activeOperationId, stored] = await Promise.all([
      this.ctx.storage.get<string>(ACTIVE_EFFECT_KEY),
      this.ctx.storage.list<unknown>({ prefix: 'effect:v1:', limit: EFFECT_GC_LIMIT }),
    ]);
    const entries: Array<{ key: string; entry: RetainedEffectLedgerEntry }> = [];
    for (const [key, value] of stored) {
      const entry = retainedEffectForGc(value);
      if (entry && key === effectStorageKey(entry.operationId)) entries.push({ key, entry });
    }
    const expiredKeys = expiredTerminalEffectKeys({
      entries,
      activeOperationId: activeOperationId ?? null,
      nowMs,
      limit: EFFECT_GC_LIMIT,
    });
    if (expiredKeys.length > 0) await this.ctx.storage.delete(expiredKeys);
    return expiredKeys.length;
  }

  private async reserveEffect(input: {
    operationId: string;
    payloadDigest: string;
  }): Promise<{ kind: 'reserved' } | { kind: 'replay'; response: SafeProviderEnvelope } | { kind: 'conflict' }> {
    const key = effectStorageKey(input.operationId);
    const now = new Date();
    await this.recoverActiveEffect(now.getTime());
    await this.garbageCollectEffects(now.getTime());
    return this.ctx.storage.transaction(async (transaction) => {
      const existing = await transaction.get<EffectRecord>(key);
      const active = await transaction.get<string>(ACTIVE_EFFECT_KEY);
      const decision = decideEffectReservation({
        operationId: input.operationId,
        payloadDigest: input.payloadDigest,
        existing: existing
          ? {
            operationId: existing.operationId,
            payloadDigest: existing.payloadDigest,
            response: existing.response,
            leaseExpiresAt: existing.leaseExpiresAt,
          }
          : null,
        activeOperationId: active ?? null,
      });
      if (decision.kind === 'payload_conflict' || decision.kind === 'account_busy') {
        return { kind: 'conflict' as const };
      }
      if (decision.kind === 'replay') {
        return { kind: 'replay' as const, response: decision.response };
      }
      const record: EffectRecord = {
        version: 1,
        operationId: input.operationId,
        payloadDigest: input.payloadDigest,
        status: 'in_flight',
        response: null,
        leaseExpiresAt: new Date(now.getTime() + EFFECT_LEASE_MS).toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + EFFECT_RETENTION_MS).toISOString(),
      };
      await transaction.put({ [key]: record, [ACTIVE_EFFECT_KEY]: input.operationId });
      return { kind: 'reserved' as const };
    });
  }

  private async finishEffect(
    operationId: string,
    payloadDigest: string,
    response: SafeProviderEnvelope,
  ): Promise<void> {
    const key = effectStorageKey(operationId);
    await this.ctx.storage.transaction(async (transaction) => {
      const record = await transaction.get<EffectRecord>(key);
      if (!record || record.payloadDigest !== payloadDigest) {
        throw new GatewayFault('effect_ledger_conflict', 409);
      }
      const status = response.status === 'sent'
        ? 'sent'
        : response.status === 'rejected' ? 'rejected' : 'ambiguous';
      await transaction.put(key, {
        ...record,
        status,
        response,
        updatedAt: nowIso(),
      } satisfies EffectRecord);
      const active = await transaction.get<string>(ACTIVE_EFFECT_KEY);
      if (active === operationId) await transaction.delete(ACTIVE_EFFECT_KEY);
    });
  }

  private async sendMessage(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, [
      'schema',
      'account_ref',
      'username',
      'text',
      'random_id',
      'paid_message_policy',
      'allow_paid_floodskip',
    ])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.account_ref !== 'string'
      || !ACCOUNT_REF_PATTERN.test(body.account_ref)
      || typeof body.username !== 'string'
      || !USERNAME_PATTERN.test(body.username)
      || !validMessage(body.text)
      || typeof body.random_id !== 'string'
      || !OPERATION_ID_PATTERN.test(body.random_id)
      || body.paid_message_policy !== 'reject'
      || body.allow_paid_floodskip !== false) {
      return safeErrorResponse('invalid_request');
    }
    let account = await this.account();
    if (!account || account.accountRef !== body.account_ref) {
      return safeErrorResponse('account_not_found', 404);
    }
    if (account.status === 'restricted'
      && account.providerBlockedUntil
      && Date.parse(account.providerBlockedUntil) <= Date.now()
      && (account.reasonCode === 'flood_wait'
        || account.reasonCode === 'flood_premium_wait'
        || account.reasonCode === 'slow_mode')) {
      account = {
        ...account,
        status: 'connected',
        reasonCode: null,
        providerBlockedUntil: null,
        updatedAt: nowIso(),
      };
      await this.ctx.storage.put(ACCOUNT_STORAGE_KEY, account);
    }
    if (account.status !== 'connected') {
      if (account.status === 'restricted'
        && account.providerBlockedUntil
        && Date.parse(account.providerBlockedUntil) > Date.now()
        && (account.reasonCode === 'flood_wait'
          || account.reasonCode === 'flood_premium_wait'
          || account.reasonCode === 'slow_mode')) {
        const remaining = Math.max(
          1,
          Math.ceil((Date.parse(account.providerBlockedUntil) - Date.now()) / 1_000),
        );
        return jsonResponse({
          schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
          status: 'rejected',
          code: account.reasonCode,
          retry_after_seconds: remaining,
        });
      }
      const rejected: SafeProviderEnvelope = {
        schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
        status: 'rejected',
        code: 'account_restricted',
      };
      return jsonResponse(rejected);
    }
    const payloadDigest = await sha256Hex([
      account.accountRef,
      body.username,
      body.text,
      body.random_id,
      'paid:reject',
    ]);
    const reservation = await this.reserveEffect({
      operationId: body.random_id,
      payloadDigest,
    });
    if (reservation.kind === 'conflict') return safeErrorResponse('effect_conflict', 409);
    if (reservation.kind === 'replay') return jsonResponse(reservation.response);

    let outcome: SafeProviderEnvelope = {
      schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
      status: 'ambiguous',
    };
    try {
      await this.ensureClient(account);
      const containerResponse = await this.containerJson('/v1/messages/send', {
        schema: TDLIB_CONTAINER_SCHEMA,
        operation_id: body.random_id,
        payload_digest: payloadDigest,
        username: body.username,
        text: body.text,
        paid_message_policy: 'reject',
        allow_paid_floodskip: false,
      }, 35_000);
      outcome = providerEnvelope(containerResponse) ?? outcome;
    } catch {
      outcome = { schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA, status: 'ambiguous' };
    }
    await this.finishEffect(body.random_id, payloadDigest, outcome);
    let snapshotted: AccountRecord;
    try {
      snapshotted = await this.saveSnapshot(account);
    } catch {
      await this.ctx.storage.put(ACCOUNT_STORAGE_KEY, {
        ...account,
        status: 'error',
        reasonCode: 'snapshot_save_failed',
        providerBlockedUntil: null,
        updatedAt: nowIso(),
      } satisfies AccountRecord);
      return jsonResponse(outcome);
    }
    if (outcome.status === 'ambiguous') {
      await this.ctx.storage.put(ACCOUNT_STORAGE_KEY, {
        ...snapshotted,
        status: 'restricted',
        reasonCode: 'ambiguous_effect_pending',
        providerBlockedUntil: null,
        updatedAt: nowIso(),
      } satisfies AccountRecord);
    } else if (outcome.status === 'rejected'
      && (outcome.code === 'flood_wait'
        || outcome.code === 'flood_premium_wait'
        || outcome.code === 'slow_mode')) {
      const waitSeconds = outcome.retry_after_seconds ?? 24 * 60 * 60;
      await this.ctx.storage.put(ACCOUNT_STORAGE_KEY, {
        ...snapshotted,
        status: 'restricted',
        reasonCode: outcome.code,
        providerBlockedUntil: new Date(Date.now() + waitSeconds * 1_000).toISOString(),
        updatedAt: nowIso(),
      } satisfies AccountRecord);
    } else if (outcome.status === 'rejected' && outcome.code === 'account_restricted') {
      await this.ctx.storage.put(ACCOUNT_STORAGE_KEY, {
        ...snapshotted,
        status: 'reauth_required',
        reasonCode: 'account_restricted',
        providerBlockedUntil: null,
        updatedAt: nowIso(),
      } satisfies AccountRecord);
    }
    return jsonResponse(outcome);
  }

  private async reconcileMessage(body: JsonRecord): Promise<Response> {
    if (!hasExactKeys(body, ['schema', 'account_ref', 'random_id', 'payload_digest'])
      || body.schema !== TELEGRAM_ACCOUNT_SERVICE_SCHEMA
      || typeof body.account_ref !== 'string'
      || !ACCOUNT_REF_PATTERN.test(body.account_ref)
      || typeof body.random_id !== 'string'
      || !OPERATION_ID_PATTERN.test(body.random_id)
      || typeof body.payload_digest !== 'string'
      || !PAYLOAD_DIGEST_PATTERN.test(body.payload_digest)) {
      return safeErrorResponse('invalid_request');
    }
    const nowMs = Date.now();
    await this.recoverActiveEffect(nowMs);
    await this.garbageCollectEffects(nowMs);
    const record = await this.ctx.storage.get<EffectRecord>(effectStorageKey(body.random_id));
    if (!record) return safeErrorResponse('effect_not_found', 404);
    if (record.payloadDigest !== body.payload_digest) return safeErrorResponse('effect_conflict', 409);
    if (record.response) return jsonResponse(record.response);
    let outcome: SafeProviderEnvelope = {
      schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
      status: 'ambiguous',
    };
    try {
      const account = await this.account();
      if (account) {
        await this.ensureClient(account);
        const containerResponse = await this.containerJson('/v1/messages/reconcile', {
          schema: TDLIB_CONTAINER_SCHEMA,
          operation_id: body.random_id,
          payload_digest: body.payload_digest,
        }, 15_000);
        outcome = providerEnvelope(containerResponse) ?? outcome;
      }
    } catch {
      // An uncertain reconciliation remains ambiguous and is never resent.
    }
    await this.finishEffect(body.random_id, body.payload_digest, outcome);
    return jsonResponse(outcome);
  }

  private async health(): Promise<Response> {
    const nowMs = Date.now();
    await this.recoverActiveEffect(nowMs);
    await this.garbageCollectEffects(nowMs);
    const account = await this.account();
    const activeEffect = await this.ctx.storage.get<string>(ACTIVE_EFFECT_KEY);
    return jsonResponse({
      schema: TELEGRAM_ACCOUNT_SERVICE_SCHEMA,
      status: 'ok',
      account_status: account?.status ?? 'not_connected',
      reason_code: account?.reasonCode ?? null,
      provider_blocked_until: account?.providerBlockedUntil ?? null,
      snapshot_present: Boolean(account?.snapshot),
      active_effect: Boolean(activeEffect),
      container_running: Boolean(this.ctx.container?.running),
    });
  }

  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.origin !== INTERNAL_ACCOUNT_ORIGIN) return new Response('Not Found', { status: 404 });
    if (request.method === 'GET' && url.pathname === '/internal/health') return this.health();
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const body = await readBoundedJson(request);
    if (!body) return safeErrorResponse('invalid_request');
    switch (url.pathname) {
      case '/internal/accounts/connect/qr': return this.beginAuth(body, 'qr');
      case '/internal/accounts/connect/phone/start': return this.beginAuth(body, 'phone');
      case '/internal/accounts/connect/phone': return this.authAction(body, 'phone');
      case '/internal/accounts/connect/code': return this.authAction(body, 'code');
      case '/internal/accounts/connect/resend': return this.authAction(body, 'resend');
      case '/internal/accounts/connect/password': return this.authAction(body, 'password');
      case '/internal/accounts/connect/status': return this.authStatus(body, false);
      case '/internal/accounts/connect/state': return this.authStatus(body, true);
      case '/internal/accounts/connect/cancel': return this.cancelAuth(body);
      case '/internal/accounts/connect/active': return this.activeConnection(body);
      case '/internal/accounts/disconnect': return this.disconnect(body);
      case '/internal/messages/send': return this.sendMessage(body);
      case '/internal/messages/reconcile': return this.reconcileMessage(body);
      default: return new Response('Not Found', { status: 404 });
    }
  }

  override async fetch(request: Request): Promise<Response> {
    return this.exclusive(async () => {
      try {
        return await this.route(request);
      } catch (error) {
        if (error instanceof GatewayFault) {
          return safeErrorResponse(error.reasonCode, error.status);
        }
        return safeErrorResponse('gateway_error', 503);
      }
    });
  }
}
