import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as leadRadarRoute from '../functions/api/admin/lead-radar/[[path]]';
import {
  completeTelegramUserAccountConnection,
  createTelegramUserAccountPending,
  LeadRadarStore,
  ownerOrgId,
  stageTelegramUserAccountConnection,
} from '../functions/platform/lead-radar';
import {
  beginTelegramAccountConnection,
  beginTelegramAccountPhoneConnection,
  cancelTelegramAccountConnection,
  getTelegramAccountGatewayReadiness,
  PrivateTelegramCampaignSender,
  submitTelegramAccountAuthInput,
  TELEGRAM_ACCOUNT_CONTROL_REQUEST_TIMEOUT_MS,
  TELEGRAM_ACCOUNT_HEALTH_REQUEST_TIMEOUT_MS,
  TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS,
  TelegramAccountServiceError,
} from '../functions/platform/lead-radar/telegram-account-service';
import {
  adminEnv,
  callRoute,
  freshAdminDb,
  OWNER_EMAIL,
  platformToken,
} from './helpers/bormi-admin-fixture';
import { SqliteD1 } from './helpers/sqlite-d1';
import {
  checkCorporateTelegramContact,
} from '../functions/platform/lead-radar/contact-resolution';

const CAMPAIGN_DATA_KEY = Buffer.alloc(32, 19).toString('base64url');
const CAMPAIGN_MEDIA_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const INTERNAL_SERVICE_TOKEN = 't'.repeat(43);
const BRIDGE_DEVICE_ID = `lrtgbd_${'1'.repeat(32)}`;
const BRIDGE_COMMAND_ID = `lrtgbc_${'2'.repeat(32)}`;
const BRIDGE_PASSWORD_COMMAND_ID = `lrtgbc_${'3'.repeat(32)}`;
const BRIDGE_INPUT_COMMAND_ID = `lrtgbc_${'6'.repeat(32)}`;
const BRIDGE_KEY_ID = '4'.repeat(64);
const BRIDGE_SPKI = 'A'.repeat(400);
const QR_ENVELOPE = {
  alg: 'RSA-OAEP-256+A256GCM' as const,
  key_id: '5'.repeat(64),
  wrapped_key: 'A'.repeat(342),
  iv: 'B'.repeat(16),
  ciphertext: 'C'.repeat(64),
};
const PASSWORD_ENVELOPE = {
  alg: 'RSA-OAEP-256+A256GCM' as const,
  key_id: BRIDGE_KEY_ID,
  wrapped_key: 'D'.repeat(342),
  iv: 'E'.repeat(16),
  ciphertext: 'F'.repeat(64),
};

function browserKeyBody(): { browserKey: {
  alg: 'RSA-OAEP-256'; key_id: string; spki: string; expires_at: string;
} } {
  return {
    browserKey: {
      alg: 'RSA-OAEP-256',
      key_id: QR_ENVELOPE.key_id,
      spki: BRIDGE_SPKI,
      expires_at: new Date(Date.now() + 90_000).toISOString(),
    },
  };
}

function challengeEnvelope(
  authId: string,
  state: 'starting' | 'awaiting_qr' | 'awaiting_password',
  reasonCode: string | null = null,
): Record<string, unknown> {
  return {
    schema: 'gptbot.lead-radar.telegram-account-service.v1',
    status: state,
    auth_id: authId,
    bridge_command_id: BRIDGE_COMMAND_ID,
    device_id: BRIDGE_DEVICE_ID,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    qr_envelope: state === 'awaiting_qr' ? QR_ENVELOPE : null,
    password_command_id: state === 'awaiting_password' ? BRIDGE_PASSWORD_COMMAND_ID : null,
    ...(state === 'awaiting_password' ? {
      bridge_encryption_key: {
        alg: 'RSA-OAEP-256',
        key_id: BRIDGE_KEY_ID,
        spki: BRIDGE_SPKI,
      },
    } : {}),
    reason_code: reasonCode,
  };
}

function phoneChallengeEnvelope(
  authId: string,
  state: 'awaiting_phone' | 'awaiting_code',
): Record<string, unknown> {
  return {
    schema: 'gptbot.lead-radar.telegram-account-service.v1',
    status: state,
    auth_id: authId,
    bridge_command_id: BRIDGE_COMMAND_ID,
    device_id: BRIDGE_DEVICE_ID,
    // Match the real Bridge's human-input TTL, not a shorter mock-only TTL.
    expires_at: new Date(Date.now() + 595_000).toISOString(),
    qr_envelope: null,
    input_command_id: BRIDGE_INPUT_COMMAND_ID,
    input_action: state === 'awaiting_phone' ? 'phone' : 'code',
    password_command_id: null,
    bridge_encryption_key: {
      alg: 'RSA-OAEP-256', key_id: BRIDGE_KEY_ID, spki: BRIDGE_SPKI,
    },
    reason_code: null,
  };
}

function abortAwareNeverResolvingService(onSignal: (signal: AbortSignal) => void): Fetcher {
  return {
    fetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const signal = init?.signal;
      assert.ok(signal);
      onSignal(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    },
  } as Fetcher;
}

function installLeadRadarLedger(db: SqliteD1): void {
  db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )`);
  for (const name of [
    '0036_lead_radar.sql',
    '0041_lead_radar_search_leases.sql',
    '0042_lead_radar_decision_makers.sql',
    '0043_lead_radar_async_funnel.sql',
    '0044_lead_radar_telegram_business.sql',
    '0045_lead_radar_telegram_campaigns.sql',
    '0046_lead_radar_telegram_campaign_safety.sql',
    '0047_lead_radar_telegram_campaign_media.sql',
    '0048_lead_radar_telegram_media_quota.sql',
    '0050_lead_radar_contact_discovery.sql',
    '0054_lead_radar_candidate_pool_resume.sql',
  ]) {
    db.sqlite.prepare('INSERT OR IGNORE INTO d1_migrations(name) VALUES (?)').run(name);
  }
}

class MemoryQueue {
  readonly messages: unknown[] = [];

  async send(message: unknown): Promise<void> {
    this.messages.push(structuredClone(message));
  }
}

interface CampaignMediaR2StoredObject {
  bytes: Uint8Array;
  customMetadata: Record<string, string>;
  httpMetadata: R2HTTPMetadata;
  uploaded: Date;
}

class CampaignMediaR2Fixture {
  readonly objects = new Map<string, CampaignMediaR2StoredObject>();
  deleteCalls = 0;

  private object(key: string, stored: CampaignMediaR2StoredObject): R2Object {
    return {
      key,
      version: 'fixture-version',
      size: stored.bytes.byteLength,
      etag: 'fixture-etag',
      httpEtag: '"fixture-etag"',
      checksums: {},
      uploaded: stored.uploaded,
      httpMetadata: stored.httpMetadata,
      customMetadata: stored.customMetadata,
      range: undefined,
      storageClass: 'Standard',
      writeHttpMetadata(headers: Headers) {
        if (stored.httpMetadata.contentType) {
          headers.set('Content-Type', stored.httpMetadata.contentType);
        }
      },
    } as unknown as R2Object;
  }

  readonly bucket = {
    head: async (key: string) => {
      const stored = this.objects.get(key);
      return stored ? this.object(key, stored) : null;
    },
    get: async (key: string) => {
      const stored = this.objects.get(key);
      if (!stored) return null;
      return {
        ...this.object(key, stored),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(stored.bytes.slice());
            controller.close();
          },
        }),
        bodyUsed: false,
        arrayBuffer: async () => stored.bytes.slice().buffer,
        text: async () => new TextDecoder().decode(stored.bytes),
        json: async <T>() => JSON.parse(new TextDecoder().decode(stored.bytes)) as T,
        blob: async () => new Blob([stored.bytes]),
      } as unknown as R2ObjectBody;
    },
    put: async (key: string, value: ArrayBuffer | ArrayBufferView, options?: R2PutOptions) => {
      if (options?.onlyIf && this.objects.has(key)) return null;
      const bytes = value instanceof ArrayBuffer
        ? new Uint8Array(value.slice(0))
        : new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      const stored: CampaignMediaR2StoredObject = {
        bytes,
        customMetadata: { ...(options?.customMetadata ?? {}) },
        httpMetadata: typeof options?.httpMetadata === 'object' ? options.httpMetadata : {},
        uploaded: new Date(),
      };
      this.objects.set(key, stored);
      return this.object(key, stored);
    },
    delete: async (keys: string | string[]) => {
      this.deleteCalls += 1;
      for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
    },
    list: async () => ({
      objects: [...this.objects.entries()].map(([key, stored]) => this.object(key, stored)),
      truncated: false,
      cursor: undefined,
      delimitedPrefixes: [],
    } as R2Objects),
  } as unknown as R2Bucket;
}

async function callRawCampaignRoute(
  db: SqliteD1,
  token: string,
  bytes: Uint8Array,
  env: Record<string, unknown>,
  idempotencyKey: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const request = new Request('https://gptbot.uz/api/admin/lead-radar/telegram-campaigns/media', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/png',
      'X-File-Name': encodeURIComponent('Макет сайта.png'),
      'Idempotency-Key': idempotencyKey,
    },
    body: bytes,
  });
  const response = await (leadRadarRoute.onRequestPost as (context: unknown) => Promise<Response>)({
    request,
    env: adminEnv(db, env),
    params: { path: 'telegram-campaigns/media' },
  });
  const raw = await response.text();
  return {
    status: response.status,
    body: JSON.parse(raw) as Record<string, unknown>,
  };
}

class TelegramAccountServiceFixture {
  authId = 'auth_fixture_1234567890';
  readonly accountRef = 'account_fixture_1234567890';
  readonly requests: Array<{
    pathname: string;
    method: string;
    idempotencyKey: string | null;
    authorization: string | null;
  }> = [];
  activeAuthId = this.authId;
  connected = false;
  authState: 'starting' | 'awaiting_qr' | 'awaiting_password' = 'awaiting_qr';
  passwordOutcome: 'connected' | 'invalid' | 'rate_limited' = 'connected';
  passwordSubmissions = 0;
  terminalStatus: 'restricted' | 'reauth_required' | 'revoked' | 'error' | null = null;
  activeMissing = true;
  healthUnavailable = false;
  healthMalformed = false;
  healthBlockers: string[] = [];
  gatewayVersion = '1.0.0';
  tdlibCommit = 'd1085f9cebc5a62379991ae1652673954f229c1f';
  routingKeyFingerprint = 'a'.repeat(64);
  connectUnavailable = false;
  deadQrAfterConnectFailure = false;
  disconnectMissing = false;
  disconnectUnavailable = false;
  disconnects = 0;
  privateAccountPresent = true;
  privateAccountStatus:
    | 'not_connected'
    | 'new'
    | 'connected'
    | 'restricted'
    | 'reauth_required'
    | 'revoked'
    | 'error'
    | null = null;
  privateAccountReasonCode: string | null = null;
  privateAccountProviderBlockedUntil: string | null = null;
  privateAccountSnapshotPresent: boolean | null = null;
  lastDisconnectBody: Record<string, unknown> | null = null;
  cancelUnavailable = false;
  cancels = 0;
  adopted = false;
  adopts = 0;
  finalizes = 0;
  finalizeUnavailable = false;
  finalizePending = false;
  beforeCancel: (() => Promise<void>) | null = null;
  mediaValidationOutcome: 'valid' | 'invalid' | 'pending' | 'malformed' | 'unavailable' = 'valid';
  mediaValidationCalls = 0;
  lastMediaValidationBody: Record<string, unknown> | null = null;
  lastPasswordBody: Record<string, unknown> | null = null;
  bridgeStatus: 'unpaired' | 'online' | 'offline' | 'pending_revocation' | 'revoked' = 'online';
  bridgeRevocations = 0;
  connectedAt = new Date().toISOString();

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(String(input));
    this.requests.push({
      pathname: url.pathname,
      method: init?.method ?? 'GET',
      idempotencyKey: new Headers(init?.headers).get('Idempotency-Key'),
      authorization: new Headers(init?.headers).get('Authorization'),
    });
    if (new Headers(init?.headers).get('Authorization') !== `Bearer ${INTERNAL_SERVICE_TOKEN}`) {
      return new Response(null, { status: 401 });
    }
    if (url.pathname === '/v1/health') {
      if (this.healthUnavailable) return new Response(null, { status: 502 });
      if (this.healthMalformed) {
        return Response.json({ configured: true, secret: 'must-not-cross-boundary' });
      }
      const configured = this.healthBlockers.length === 0;
      return Response.json({
        schema: 'gptbot.lead-radar.telegram-account-service.v1',
        status: configured ? 'configured' : 'degraded',
        contract_version: 'v1',
        gateway_version: this.gatewayVersion,
        auth_modes: ['qr', 'phone_code_password'],
        provider: 'local_bridge_telethon',
        tdlib_source_commit: 'not_applicable',
        session_storage: 'local_windows_dpapi',
        public_routes: true,
        bridge_public_origin: 'https://lead-radar-bridge.gptbot.uz',
        configured,
        blockers: this.healthBlockers,
        routing_key_fingerprint: this.healthBlockers.includes('gateway_account_keys_missing')
          ? null
          : this.routingKeyFingerprint,
      }, { status: configured ? 200 : 503 });
    }
    if (url.pathname === '/v1/bridge/status') {
      const paired = this.bridgeStatus !== 'unpaired' && this.bridgeStatus !== 'revoked';
      return Response.json({
        schema: 'gptbot.lead-radar.telegram-account-service.v1',
        status: this.bridgeStatus,
        device_id: paired ? BRIDGE_DEVICE_ID : null,
        label: paired ? 'Lead Radar Windows Bridge' : null,
        version: paired ? '1.0.0' : null,
        last_seen_at: paired ? new Date().toISOString() : null,
        encryption_public_key_spki: paired ? BRIDGE_SPKI : null,
        encryption_key_id: paired ? BRIDGE_KEY_ID : null,
      });
    }
    if (url.pathname === '/v1/bridge/pairings') {
      return Response.json({
        schema: 'gptbot.lead-radar.telegram-account-service.v1',
        status: 'pending',
        pairing_id: `lrtgbp_${'6'.repeat(32)}`,
        expires_at: new Date(Date.now() + 90_000).toISOString(),
      });
    }
    if (url.pathname === '/v1/bridge/revoke') {
      this.bridgeRevocations += 1;
      this.bridgeStatus = 'revoked';
      return Response.json({
        schema: 'gptbot.lead-radar.telegram-account-service.v1',
        status: 'revoked',
      });
    }
    if (url.pathname === '/v1/media/validate' || url.pathname === '/v1/media/check') {
      this.mediaValidationCalls += 1;
      if (this.mediaValidationOutcome === 'unavailable') {
        return new Response(null, { status: 503 });
      }
      const raw = typeof init?.body === 'string' ? init.body : '{}';
      this.lastMediaValidationBody = JSON.parse(raw) as Record<string, unknown>;
      if (this.mediaValidationOutcome === 'pending') {
        return Response.json({
          schema: 'gptbot.lead-radar.telegram-account-service.v1',
          status: 'pending', code: 'media_validation_pending', retry_after_seconds: 3,
        }, { status: 202 });
      }
      if (this.mediaValidationOutcome === 'malformed') {
        return Response.json({ status: 'valid', extra: true });
      }
      if (this.mediaValidationOutcome === 'invalid') {
        return Response.json({
          schema: 'gptbot.lead-radar.telegram-account-service.v1',
          status: 'rejected',
          code: 'media_invalid',
        });
      }
      return Response.json({
        schema: 'gptbot.lead-radar.telegram-account-service.v1',
        status: 'valid',
      });
    }
    if (url.pathname === '/v1/accounts/connect') {
      if (this.connectUnavailable) {
        if (this.deadQrAfterConnectFailure) {
          this.activeMissing = false;
          this.activeAuthId = this.authId;
        }
        return new Response(null, { status: 503 });
      }
      this.activeMissing = false;
      this.activeAuthId = this.authId;
      this.adopted = false;
      return Response.json(challengeEnvelope(this.authId, this.authState));
    }
    if (url.pathname === '/v1/accounts/connect/phone/start') {
      this.activeMissing = false;
      this.activeAuthId = this.authId;
      this.terminalStatus = null;
      this.adopted = false;
      return Response.json(phoneChallengeEnvelope(this.authId, 'awaiting_phone'));
    }
    if (url.pathname === '/v1/accounts/health') {
      const accountStatus = this.privateAccountStatus
        ?? (this.privateAccountPresent ? 'connected' : 'not_connected');
      return Response.json({
        schema: 'gptbot.lead-radar.telegram-account-service.v1',
        status: 'ok',
        account_status: accountStatus,
        reason_code: this.privateAccountReasonCode,
        provider_blocked_until: this.privateAccountProviderBlockedUntil,
        // Production BridgeMailbox keeps the session under local DPAPI and
        // intentionally never publishes a Cloudflare snapshot.
        snapshot_present: this.privateAccountSnapshotPresent ?? false,
        active_effect: false,
        container_running: false,
        bridge_status: this.bridgeStatus,
      });
    }
    if (url.pathname === '/v1/accounts/connect/active') {
      if (this.activeMissing) return new Response(null, { status: 404 });
      if (this.deadQrAfterConnectFailure) return new Response(null, { status: 503 });
      if (this.terminalStatus) {
        return Response.json({
          schema: 'gptbot.lead-radar.telegram-account-service.v1',
          status: this.terminalStatus,
          auth_id: this.activeAuthId,
          reason_code: 'fixture_terminal_auth',
        });
      }
      if (this.connected) {
        return Response.json({
          schema: 'gptbot.lead-radar.telegram-account-service.v1',
          status: 'connected',
          auth_id: this.authId,
          account_ref: this.accountRef,
          masked_label: 'Telegram account',
          connected_at: this.connectedAt,
        });
      }
      return Response.json(challengeEnvelope(this.activeAuthId, this.authState));
    }
    if (url.pathname === '/v1/accounts/connect/password') {
      this.passwordSubmissions += 1;
      this.lastPasswordBody = JSON.parse(
        typeof init?.body === 'string' ? init.body : '{}',
      ) as Record<string, unknown>;
      if (this.passwordOutcome === 'rate_limited') {
        return Response.json({
          schema: 'gptbot.lead-radar.telegram-account-service.v1',
          status: 'error',
          reason_code: 'auth_rate_limited',
        }, { status: 429 });
      }
      if (this.passwordOutcome === 'invalid') {
        this.authState = 'awaiting_password';
        return Response.json(challengeEnvelope(
          this.authId,
          'awaiting_password',
          'password_invalid',
        ));
      }
      this.connected = true;
      return Response.json({
        schema: 'gptbot.lead-radar.telegram-account-service.v1',
        status: 'connected',
        auth_id: this.authId,
        account_ref: this.accountRef,
        masked_label: 'Telegram account',
        connected_at: this.connectedAt,
      });
    }
    if (url.pathname === '/v1/accounts/connect/state') {
      if (this.activeMissing) return new Response(null, { status: 404 });
      if (this.terminalStatus) {
        return Response.json({
          schema: 'gptbot.lead-radar.telegram-account-service.v1',
          status: this.terminalStatus,
          auth_id: this.authId,
          reason_code: 'fixture_terminal_auth',
        });
      }
      if (!this.connected) {
        return Response.json(challengeEnvelope(this.authId, this.authState));
      }
      return Response.json({
        schema: 'gptbot.lead-radar.telegram-account-service.v1',
        status: 'connected',
        auth_id: this.authId,
        account_ref: this.accountRef,
        masked_label: 'Telegram account',
        connected_at: this.connectedAt,
      });
    }
    if (url.pathname === '/v1/accounts/connect/cancel') {
      this.cancels += 1;
      if (this.cancelUnavailable) return new Response(null, { status: 503 });
      if (this.beforeCancel) await this.beforeCancel();
      const raw = typeof init?.body === 'string' ? init.body : '{}';
      const body = JSON.parse(raw) as { auth_id?: string };
      if (this.activeMissing || body.auth_id !== this.activeAuthId) {
        return new Response(null, { status: 404 });
      }
      if (this.adopted) return new Response(null, { status: 409 });
      this.activeMissing = true;
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/v1/accounts/connect/adopt') {
      this.adopts += 1;
      const raw = typeof init?.body === 'string' ? init.body : '{}';
      const body = JSON.parse(raw) as { auth_id?: string };
      if (this.activeMissing || body.auth_id !== this.activeAuthId) {
        return new Response(null, { status: 404 });
      }
      this.adopted = true;
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/v1/accounts/connect/finalize') {
      this.finalizes += 1;
      if (this.finalizeUnavailable) return new Response(null, { status: 503 });
      if (this.finalizePending) return new Response(null, { status: 202 });
      const raw = typeof init?.body === 'string' ? init.body : '{}';
      const body = JSON.parse(raw) as { auth_id?: string };
      if (body.auth_id !== this.authId || !this.connected) {
        return new Response(null, { status: 409 });
      }
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/v1/accounts/disconnect') {
      this.disconnects += 1;
      this.lastDisconnectBody = JSON.parse(
        typeof init?.body === 'string' ? init.body : '{}',
      ) as Record<string, unknown>;
      if (this.disconnectUnavailable) return new Response(null, { status: 503 });
      this.activeMissing = true;
      this.adopted = false;
      if (this.disconnectMissing) return new Response(null, { status: 404 });
      this.privateAccountPresent = false;
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  }
}

async function campaignEnv(
  service?: TelegramAccountServiceFixture,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const orgId = await ownerOrgId(OWNER_EMAIL);
  return {
    LEAD_RADAR_ADMISSION_ENABLED: 'true',
    LEAD_RADAR_PROCESSING_ENABLED: 'true',
    LEAD_RADAR_CONTACT_ENABLED: 'false',
    LEAD_RADAR_TELEGRAM_DISCOVERY_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'false',
    LEAD_RADAR_ALLOWED_ORGS: orgId,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: CAMPAIGN_DATA_KEY,
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'local_bridge',
    LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: INTERNAL_SERVICE_TOKEN,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT: '30',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS: '120',
    ...(service ? { LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE: service } : {}),
    ...overrides,
  };
}

async function seedCorporateLead(db: SqliteD1, suffix = ''): Promise<{ searchId: string; leadId: string }> {
  const now = new Date().toISOString();
  const orgId = await ownerOrgId(OWNER_EMAIL);
  const store = new LeadRadarStore(db.asD1());
  const searchId = await store.createSearch(orgId, {
    niche: 'Стоматологии', city: 'Ташкент', country: 'UZ',
    offer: 'AI-бот', desiredCount: 10, telegramRequired: true, languages: ['ru', 'uz'],
  }, now);
  const leadId = await store.insertLead(orgId, searchId, {
    canonicalKey: `domain:campaign-clinic${suffix}.example.invalid`,
    name: 'Клиника Альфа', category: 'Стоматология', city: 'Ташкент', country: 'UZ',
    address: 'Ташкент', website: `https://campaign-clinic${suffix}.example.invalid`,
    phone: null, genericEmail: null, telegramUrl: `https://t.me/campaign_clinic${suffix}`,
    telegramContact: {
      url: `https://t.me/campaign_clinic${suffix}`, username: `campaign_clinic${suffix}`, type: 'business',
      confidence: 0.98, reason: 'synthetic exact corporate fixture',
      evidenceIds: [`ev-campaign-corporate${suffix}`], verifiedAt: now, messageable: false,
    },
    decisionMakers: [], score: 64, confidence: 0.9, priority: 'P2',
    lifecycle: 'new', suppressed: false, scoreComponents: [], signals: [],
    evidence: [{
      id: `ev-campaign-corporate${suffix}`, fieldPath: 'web.telegram.business',
      value: `@campaign_clinic${suffix}`,
      sourceUrl: `https://campaign-clinic${suffix}.example.invalid/contact`,
      sourceType: 'company_website', observedAt: now, confidence: 0.98,
      classification: 'fact',
    }, {
      id: `ev-campaign-binding${suffix}`, fieldPath: 'web.website',
      value: `https://campaign-clinic${suffix}.example.invalid`,
      sourceUrl: `https://campaign-clinic${suffix}.example.invalid/contact`,
      sourceType: 'company_website', observedAt: now, confidence: 0.98,
      classification: 'fact',
    }],
    enrichmentStatus: 'enriched', enrichmentReason: 'enriched', enrichmentAttempts: 1,
    discoveredAt: now, lastVerifiedAt: now,
  });
  assert.ok(leadId);
  return { searchId, leadId };
}

async function seedConnectedAccount(db: SqliteD1): Promise<string> {
  const orgId = await ownerOrgId(OWNER_EMAIL);
  const pending = await createTelegramUserAccountPending({
    db: db.asD1(), dataKey: CAMPAIGN_DATA_KEY, orgId,
    authRequestReference: 'auth_seed_1234567890',
    idempotencyKey: 'account-seed-idempotency-0001',
  });
  await stageTelegramUserAccountConnection({
    db: db.asD1(), dataKey: CAMPAIGN_DATA_KEY, orgId,
    accountId: pending.account.id, gatewayAccountRef: 'account_seed_1234567890',
    expectedVersion: pending.account.stateVersion, maskedLabel: 'Рабочий аккаунт',
    providerConnectedAt: new Date().toISOString(),
  });
  const connected = await completeTelegramUserAccountConnection({
    db: db.asD1(), dataKey: CAMPAIGN_DATA_KEY, orgId,
    accountId: pending.account.id,
    gatewayAccountRef: 'account_seed_1234567890',
    expectedVersion: pending.account.stateVersion,
    maskedLabel: 'Рабочий аккаунт',
  });
  await bridgeVerifySeededCorporateLeads(db, orgId, connected.id);
  return connected.id;
}

async function bridgeVerifySeededCorporateLeads(
  db: SqliteD1,
  orgId: string,
  accountId: string,
): Promise<void> {
  const rows = db.rows<{ id: string; search_id: string; telegram_contact_json: string }>(
    `SELECT id, search_id, telegram_contact_json FROM lead_radar_companies
     WHERE org_id = ? AND suppressed = 0
       AND json_extract(telegram_contact_json, '$.type') = 'business'`,
    orgId,
  );
  const now = new Date().toISOString();
  for (const row of rows) {
    const saved = JSON.parse(row.telegram_contact_json) as { username?: string | null };
    if (!saved.username) continue;
    const result = await checkCorporateTelegramContact({
      db: db.asD1(), orgId, searchId: row.search_id, companyId: row.id,
      candidateKey: `telegram:https://t.me/${saved.username.toLowerCase()}`,
      accountId, now,
      resolve: async () => ({
        status: 'resolved', username: saved.username ?? null,
        reason: 'regular_user_resolved', retryAfterSeconds: null,
      }),
    });
    assert.equal(result.status, 'resolved', JSON.stringify(result));
  }
}

test('phone connect and code submission use ciphertext-only private contracts', async () => {
  const requests: Array<{ pathname: string; body: Record<string, unknown> }> = [];
  const authId = 'auth_phone_fixture_123456';
  const service = {
    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>;
      requests.push({ pathname: url.pathname, body });
      return Response.json(url.pathname.endsWith('/phone/start')
        ? phoneChallengeEnvelope(authId, 'awaiting_phone')
        : phoneChallengeEnvelope(authId, 'awaiting_code'));
    },
  } as Fetcher;
  const started = await beginTelegramAccountPhoneConnection({
    service,
    internalServiceToken: INTERNAL_SERVICE_TOKEN,
    orgId: 'owner_fixture_org',
    operationId: 'phone-connect-operation-0001',
  });
  assert.equal(started.authState, 'awaiting_phone');
  assert.equal(started.inputAction, 'phone');
  const advanced = await submitTelegramAccountAuthInput({
    service,
    internalServiceToken: INTERNAL_SERVICE_TOKEN,
    orgId: 'owner_fixture_org',
    authId,
    inputCommandId: BRIDGE_INPUT_COMMAND_ID,
    inputAction: 'phone',
    inputEnvelope: PASSWORD_ENVELOPE,
  });
  assert.equal(advanced.status, 'connecting');
  assert.equal(advanced.authState, 'awaiting_code');
  assert.deepEqual(requests.map((request) => request.pathname), [
    '/v1/accounts/connect/phone/start', '/v1/accounts/connect/input',
  ]);
  assert.equal(JSON.stringify(requests).includes('+998'), false);
  assert.equal(Object.hasOwn(requests[1]!.body, 'phone'), false);
  assert.equal(Object.hasOwn(requests[1]!.body, 'code'), false);
  assert.deepEqual(Object.keys(requests[1]!.body).sort(), [
    'auth_id', 'input_action', 'input_command_id', 'input_envelope', 'org_id', 'schema',
  ]);
});

test('contact API negotiates source-limit copy for old tabs without rewriting the stored receipt',async()=>{
  const db=freshAdminDb();installLeadRadarLedger(db);
  const accountId=await seedConnectedAccount(db);
  const {searchId,leadId}=await seedCorporateLead(db);
  const orgId=await ownerOrgId(OWNER_EMAIL);
  const candidateKey='telegram:https://t.me/campaign_clinic';
  // A cached source-limit receipt isolates transport compatibility from OSM.
  await checkCorporateTelegramContact({db:db.asD1(),orgId,searchId,companyId:leadId,accountId,candidateKey,now:new Date().toISOString(),
    resolve:async()=>({status:'limited',username:null,reason:'business_listing_rate_limited',retryAfterSeconds:900})});
  const before=db.rows('SELECT status,result_json,reason,expires_at FROM lead_radar_contact_checks WHERE company_id=?',leadId);
  assert.equal(before.length,1);
  const service=new TelegramAccountServiceFixture();
  const env=await campaignEnv(service),token=await platformToken('platform_owner');
  const invoke=(protocol?:string)=>callRoute(leadRadarRoute.onRequestPost,db,'/api/admin/lead-radar/telegram-account/resolve-contact',{
    method:'POST',token,params:{path:'telegram-account/resolve-contact'},env,
    headers:protocol?{'X-Lead-Radar-Contact-Protocol':protocol}:{},body:{searchId,companyId:leadId,candidateKey}});
  const legacy=await invoke();assert.equal(legacy.status,200,JSON.stringify(legacy.body));
  assert.equal(legacy.body.status,'limited');assert.equal(legacy.body.reason,'business_listing_unavailable');
  const modern=await invoke('2');assert.equal(modern.status,200,JSON.stringify(modern.body));
  assert.equal(modern.body.status,'limited');assert.equal(modern.body.reason,'business_listing_rate_limited');
  assert.equal(modern.body.retryAfterSeconds,legacy.body.retryAfterSeconds);
  assert.deepEqual(db.rows('SELECT status,result_json,reason,expires_at FROM lead_radar_contact_checks WHERE company_id=?',leadId),before);
  assert.equal(service.requests.length,0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaigns'),0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_contact_authorizations'),0);
});

test('read-only preflight separates missing consent, Bridge offline and actual authorization without preparing or sending', async () => {
  const db = freshAdminDb(); installLeadRadarLedger(db);
  const { searchId, leadId } = await seedCorporateLead(db);
  await seedConnectedAccount(db);
  const service = new TelegramAccountServiceFixture();
  const token = await platformToken('platform_owner');
  const env = await campaignEnv(service);
  const inspect = (companyIds = [leadId]) => callRoute(leadRadarRoute.onRequestPost, db,
    '/api/admin/lead-radar/telegram-campaigns/preflight', { method: 'POST', token,
      params: { path: 'telegram-campaigns/preflight' }, env,
      body: { companyIds, contactBasis: 'documented_consent' } });
  const missing = await inspect();
  assert.equal(missing.status, 200, JSON.stringify(missing.body));
  assert.equal((missing.body.selection as { automatic: number }).automatic, 0);
  assert.equal((missing.body.selection as { items: { reasonCode: string }[] }).items[0]?.reasonCode, 'documented_basis_required');
  const granted = await callRoute(leadRadarRoute.onRequestPost, db,
    '/api/admin/lead-radar/telegram-campaigns/eligibility', { method: 'POST', token,
      params: { path: 'telegram-campaigns/eligibility' }, env,
      headers: { 'Idempotency-Key': 'campaign-preflight-basis-0001' },
      body: { searchId, leadId, contactBasis: 'documented_consent', evidenceReference: 'fixture-confirmed-request-2026',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString() } });
  assert.equal(granted.status, 201, JSON.stringify(granted.body));
  const ready = await inspect();
  assert.equal((ready.body.selection as { automatic: number }).automatic, 1);
  // The fixture intentionally has no routing-key adoption and autosend is off.
  // Recipient authorization must not conceal independent infrastructure gates.
  assert.deepEqual(ready.body.blockers, ['gateway_routing_legacy_unbound', 'autosend_paused']);
  const orgId = await ownerOrgId(OWNER_EMAIL);
  const boundAt = new Date().toISOString();
  db.sqlite.prepare(`INSERT INTO lead_radar_tg_routing_key_state (
    org_id, key_fingerprint, established_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?)`)
    .run(orgId, service.routingKeyFingerprint, boundAt, boundAt, boundAt);
  service.privateAccountStatus = 'reauth_required';
  service.privateAccountReasonCode = 'auth_expired';
  const reconnectRequired = await inspect();
  assert.ok((reconnectRequired.body.blockers as string[]).includes('gateway_account_session_missing'));
  assert.ok((reconnectRequired.body.blockers as string[]).includes('account_not_connected'));
  assert.equal((reconnectRequired.body.selection as { automatic: number }).automatic, 1);
  service.privateAccountStatus = null;
  service.privateAccountReasonCode = null;
  service.bridgeStatus = 'offline';
  const offline = await inspect();
  assert.ok((offline.body.blockers as string[]).includes('bridge_offline'));
  assert.equal((offline.body.selection as { automatic: number }).automatic, 1);
  assert.equal((await inspect([leadId, leadId])).status, 400);
  assert.equal((await inspect(Array.from({ length: 51 }, (_, i) => `fixture_${i}`))).status, 400);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_approvals'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaigns'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_effects'), 0);
  assert.ok(service.requests.every((request) => [
    '/v1/health', '/v1/bridge/status', '/v1/accounts/health',
  ].includes(request.pathname)));
});

test('preflight checks 28 candidates with one strict Bridge proof pass and no legacy evidence pass', async (t) => {
  const db = freshAdminDb(); installLeadRadarLedger(db);
  t.after(() => db.sqlite.close());
  const { leadId } = await seedCorporateLead(db, '_cpu');
  await seedConnectedAccount(db);
  const companyIds = [leadId];
  for (let index=0; index<27; index++) {
    const next = await seedCorporateLead(db, `_cpu_unresolved_${index}`);
    db.sqlite.prepare("UPDATE lead_radar_companies SET telegram_contact_json='null',telegram_url=NULL WHERE id=?").run(next.leadId);
    companyIds.push(next.leadId);
  }
  const service = new TelegramAccountServiceFixture();
  const token = await platformToken('platform_owner');
  const env = await campaignEnv(service);
  const statements: string[] = [];
  const originalPrepare = db.prepare.bind(db);
  t.mock.method(db, 'prepare', (sql:string) => { statements.push(sql); return originalPrepare(sql); });
  const result = await callRoute(leadRadarRoute.onRequestPost, db,
    '/api/admin/lead-radar/telegram-campaigns/preflight', { method:'POST', token,
      params:{path:'telegram-campaigns/preflight'}, env, body:{companyIds,contactBasis:null} });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const selection = result.body.selection as {selected:number;verified:number;automatic:number;manual:number;excluded:number};
  assert.deepEqual([selection.selected,selection.verified,selection.automatic,selection.manual,selection.excluded], [28,1,0,1,27]);
  assert.equal(statements.filter(sql => sql.includes("AND status='resolved' AND expires_at>?")).length, 1,
    'one exact receipt check per company set, not two identical passes');
  assert.equal(statements.filter(sql => sql.includes('json_each') && sql.includes('evidenceIds')).length, 0,
    'strict Bridge mode must not run an unused legacy source-only query');
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_approvals'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaigns'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_contact_authorizations'), 0);
});

test('pending media check survives retries without creating campaign effects or premature registration', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const service = new TelegramAccountServiceFixture();
  service.mediaValidationOutcome = 'pending';
  const r2 = new CampaignMediaR2Fixture();
  const token = await platformToken('platform_owner');
  const env = await campaignEnv(service, { LEAD_RADAR_CAMPAIGN_MEDIA: r2.bucket });
  const upload = await callRawCampaignRoute(db, token, CAMPAIGN_MEDIA_PNG, env, 'campaign-media-pending-upload-0001');
  assert.equal(upload.status, 202, JSON.stringify(upload.body));
  assert.equal((upload.body.validation as { status: string }).status, 'pending');
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_media_objects'), 0);
  const check = () => callRoute(leadRadarRoute.onRequestPost, db,
    '/api/admin/lead-radar/telegram-campaigns/media/check', {
      method: 'POST', token, params: { path: 'telegram-campaigns/media/check' }, env,
      body: { mediaId: upload.body.mediaId, mediaDigest: upload.body.mediaDigest },
    });
  assert.equal((await check()).status, 202);
  service.mediaValidationOutcome = 'valid';
  const completed = await check();
  assert.equal(completed.status, 201, JSON.stringify(completed.body));
  assert.equal((completed.body.validation as { status: string }).status, 'valid');
  assert.equal((await check()).status, 201);
  assert.equal(new Set(service.requests.filter((request) => request.pathname === '/v1/media/check')
    .map((request) => request.idempotencyKey)).size, 1);
  assert.equal(r2.objects.size, 1);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_media_objects'), 1);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaigns'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_effects'), 0);
});

test('private preview is owner-only, no-store and never calls Telegram or creates effects', async () => {
  const db = freshAdminDb(); installLeadRadarLedger(db);
  const service = new TelegramAccountServiceFixture();
  const r2 = new CampaignMediaR2Fixture();
  const token = await platformToken('platform_owner');
  const env = await campaignEnv(service, { LEAD_RADAR_CAMPAIGN_MEDIA: r2.bucket });
  const upload = await callRawCampaignRoute(db, token, CAMPAIGN_MEDIA_PNG, env, 'campaign-media-preview-api-0001');
  assert.equal(upload.status, 201);
  const beforeCalls = service.requests.length;
  const preview = (authToken?: string) => callRoute(leadRadarRoute.onRequestPost, db,
    '/api/admin/lead-radar/telegram-campaigns/media/preview', { method: 'POST', token: authToken,
      params: { path: 'telegram-campaigns/media/preview' }, env,
      body: { mediaId: upload.body.mediaId, mediaDigest: upload.body.mediaDigest } });
  const result = await preview(token);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.headers.get('content-type'), 'image/png');
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await preview()).status, 401);
  assert.equal(service.requests.length, beforeCalls);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaigns'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_effects'), 0);
});

test('authoritative private decode rejects upload before D1 registration or campaign effects', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const service = new TelegramAccountServiceFixture();
  service.mediaValidationOutcome = 'invalid';
  const r2 = new CampaignMediaR2Fixture();
  const token = await platformToken('platform_owner');
  const idempotencyKey = 'campaign-media-invalid-upload-0001';
  const env = await campaignEnv(service, { LEAD_RADAR_CAMPAIGN_MEDIA: r2.bucket });

  const rejected = await callRawCampaignRoute(
    db,
    token,
    CAMPAIGN_MEDIA_PNG,
    env,
    idempotencyKey,
  );
  assert.equal(rejected.status, 400, JSON.stringify(rejected.body));
  assert.equal(rejected.body.error, 'telegram_campaign_media_invalid');
  assert.equal(service.mediaValidationCalls, 1, JSON.stringify({
    rejected,
    r2Keys: [...r2.objects.keys()],
    r2Objects: [...r2.objects.values()].map((object) => ({
      bytes: object.bytes.byteLength,
      customMetadata: object.customMetadata,
    })),
  }));
  const validationRequest = service.requests.find(
    (request) => request.pathname === '/v1/media/check',
  );
  assert.match(validationRequest?.idempotencyKey ?? '', /^media-check-lrtgcm_/);
  assert.deepEqual(Object.keys(service.lastMediaValidationBody ?? {}).sort(), [
    'media', 'operation_id', 'org_id', 'schema',
  ]);
  const mediaEnvelope = service.lastMediaValidationBody?.media as Record<string, unknown>;
  assert.equal(mediaEnvelope.mime_type, 'image/png');
  assert.equal(mediaEnvelope.size_bytes, CAMPAIGN_MEDIA_PNG.byteLength);
  assert.deepEqual(Object.keys(mediaEnvelope).sort(), [
    'media_digest', 'media_id', 'mime_type', 'size_bytes', 'source_object_key',
  ]);
  assert.equal('base64' in mediaEnvelope, false);
  assert.equal(
    mediaEnvelope.source_object_key,
    [...r2.objects.keys()][0],
  );
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_media_objects'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_approvals'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaigns'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_effects'), 0);
  assert.equal(service.requests.some((request) => request.pathname.includes('/messages/send')), false);
  // The immutable private object remains an unregistered, unreachable orphan.
  // Deleting here would race a concurrent successful idempotent upload; the
  // bounded retention sweep is the safe physical deletion authority.
  assert.equal(r2.objects.size, 1);
  assert.equal([...r2.objects.keys()].some((key) => /^https?:/u.test(key)), false);
});

test('media delete requires a D1 CAS and deleted idempotency tombstones cannot resurrect', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const service = new TelegramAccountServiceFixture();
  const r2 = new CampaignMediaR2Fixture();
  const token = await platformToken('platform_owner');
  const orgId = await ownerOrgId(OWNER_EMAIL);
  const env = await campaignEnv(service, { LEAD_RADAR_CAMPAIGN_MEDIA: r2.bucket });

  // This models the interval after an immutable upload PUT and before its D1
  // registration. An idempotent DELETE of a missing registry row must not
  // remove the in-flight upload object.
  const inFlightMediaId = `lrtgcm_${'1'.repeat(32)}`;
  const inFlightKey = `lead-radar/campaign-media/${orgId}/${inFlightMediaId}`;
  await r2.bucket.put(inFlightKey, CAMPAIGN_MEDIA_PNG);
  const missingDelete = await callRoute(
    leadRadarRoute.onRequestDelete,
    db,
    `/api/admin/lead-radar/telegram-campaigns/media/${inFlightMediaId}`,
    {
      method: 'DELETE', token,
      params: { path: `telegram-campaigns/media/${inFlightMediaId}` }, env,
    },
  );
  assert.equal(missingDelete.status, 204);
  assert.equal(r2.deleteCalls, 0);
  assert.equal(r2.objects.has(inFlightKey), true);

  const idempotencyKey = 'campaign-media-delete-tombstone-0001';
  const uploaded = await callRawCampaignRoute(
    db,
    token,
    CAMPAIGN_MEDIA_PNG,
    env,
    idempotencyKey,
  );
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  const mediaId = String(uploaded.body.mediaId);
  const deleted = await callRoute(
    leadRadarRoute.onRequestDelete,
    db,
    `/api/admin/lead-radar/telegram-campaigns/media/${mediaId}`,
    {
      method: 'DELETE', token,
      params: { path: `telegram-campaigns/media/${mediaId}` }, env,
    },
  );
  assert.equal(deleted.status, 204);
  assert.equal(r2.deleteCalls, 1);
  assert.equal(db.value(`SELECT status FROM lead_radar_tg_media_objects
    WHERE org_id = ? AND media_id = ?`, orgId, mediaId), 'deleted');

  // Reusing the old idempotency key may create only an unreachable orphan;
  // the permanent D1 tombstone refuses deleted->active, eliminating ABA.
  const replayAfterDelete = await callRawCampaignRoute(
    db,
    token,
    CAMPAIGN_MEDIA_PNG,
    env,
    idempotencyKey,
  );
  assert.equal(replayAfterDelete.status, 409);
  assert.equal(replayAfterDelete.body.error, 'telegram_campaign_media_idempotency_conflict');
  assert.equal(db.value(`SELECT status FROM lead_radar_tg_media_objects
    WHERE org_id = ? AND media_id = ?`, orgId, mediaId), 'deleted');
});

test('prepare revalidates frozen media and creates no approval or recipient on decode failure', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const { searchId, leadId } = await seedCorporateLead(db);
  const accountId = await seedConnectedAccount(db);
  const service = new TelegramAccountServiceFixture();
  const r2 = new CampaignMediaR2Fixture();
  const token = await platformToken('platform_owner');
  const env = await campaignEnv(service, { LEAD_RADAR_CAMPAIGN_MEDIA: r2.bucket });
  const uploaded = await callRawCampaignRoute(
    db,
    token,
    CAMPAIGN_MEDIA_PNG,
    env,
    'campaign-media-valid-upload-0001',
  );
  assert.equal(uploaded.status, 201, JSON.stringify({
    uploaded,
    r2Keys: [...r2.objects.keys()],
    requests: service.requests,
  }));
  assert.equal(service.mediaValidationCalls, 1);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_media_objects'), 1);

  const eligibility = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-campaigns/eligibility',
    {
      method: 'POST', token, params: { path: 'telegram-campaigns/eligibility' }, env,
      headers: { 'Idempotency-Key': 'campaign-media-eligibility-0001' },
      body: {
        searchId,
        leadId,
        contactBasis: 'documented_consent',
        evidenceReference: 'crm-consent-media-preapproval-2026',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
      },
    },
  );
  assert.equal(eligibility.status, 201);

  service.mediaValidationOutcome = 'invalid';
  const prepared = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-campaigns/prepare',
    {
      method: 'POST', token, params: { path: 'telegram-campaigns/prepare' }, env,
      headers: { 'Idempotency-Key': 'campaign-media-prepare-invalid-0001' },
      body: {
        accountId,
        searchId,
        leadIds: [leadId],
        template: 'Здравствуйте, {company_name}! Покажем макет?',
        contactBasis: 'documented_consent',
        attachment: {
          mediaId: uploaded.body.mediaId,
          mediaDigest: uploaded.body.mediaDigest,
        },
      },
    },
  );
  assert.equal(prepared.status, 400);
  assert.equal(prepared.body.error, 'telegram_campaign_media_invalid');
  assert.equal(service.mediaValidationCalls, 2);
  assert.equal(
    service.requests.filter((request) => request.pathname === '/v1/media/check')[1]
      ?.idempotencyKey,
    'campaign-media-prepare-invalid-0001',
  );
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_approvals'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_approval_media'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaigns'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_effects'), 0);
  assert.equal(service.requests.some((request) => request.pathname.includes('/messages/send')), false);
});

test('private account control timeout aborts the binding and maps to gateway unavailable', async (t) => {
  assert.ok(
    TELEGRAM_ACCOUNT_CONTROL_REQUEST_TIMEOUT_MS < TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS,
  );
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null = null;
  const pending = beginTelegramAccountConnection({
    service: abortAwareNeverResolvingService((value) => { signal = value; }),
    internalServiceToken: INTERNAL_SERVICE_TOKEN,
    orgId: 'org_timeout_control',
    operationId: 'timeout_control_0001',
    browserKey: {
      alg: 'RSA-OAEP-256', keyId: QR_ENVELOPE.key_id, spki: BRIDGE_SPKI,
      expiresAt: new Date(Date.now() + 90_000).toISOString(),
    },
  });
  t.mock.timers.tick(TELEGRAM_ACCOUNT_CONTROL_REQUEST_TIMEOUT_MS);
  await assert.rejects(
    pending,
    (error) => error instanceof TelegramAccountServiceError
      && error.code === 'telegram_campaign_gateway_unavailable',
  );
  assert.equal(signal?.aborted, true);
});

test('private readiness probe is bounded and collapses timeout to a safe blocker', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null = null;
  const pending = getTelegramAccountGatewayReadiness(
    abortAwareNeverResolvingService((value) => { signal = value; }),
    INTERNAL_SERVICE_TOKEN,
  );
  t.mock.timers.tick(TELEGRAM_ACCOUNT_HEALTH_REQUEST_TIMEOUT_MS);
  assert.deepEqual(await pending, {
    status: 'blocked',
    blockers: ['gateway_unavailable'],
  });
  assert.equal(signal?.aborted, true);
});

test('configured private health is only probe-required, never runtime-ready', async () => {
  assert.deepEqual(
    await getTelegramAccountGatewayReadiness(
      new TelegramAccountServiceFixture(),
      INTERNAL_SERVICE_TOKEN,
    ),
    { status: 'probe_required', blockers: [] },
  );
});

test('owner pairing is one-use material and explicit Bridge replacement refuses live account custody', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const service = new TelegramAccountServiceFixture();
  service.bridgeStatus = 'unpaired';
  const token = await platformToken('platform_owner');
  const env = await campaignEnv(service);

  const initial = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account/bridge',
    { token, params: { path: 'telegram-account/bridge' }, env },
  );
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.body, {
    status: 'unpaired', deviceId: null, label: null, version: null, lastSeenAt: null,
  });

  const enrollmentCode = 'A'.repeat(22);
  const paired = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/bridge/pairings',
    {
      method: 'POST', token,
      params: { path: 'telegram-account/bridge/pairings' }, env,
      headers: { 'Idempotency-Key': 'bridge-pair-owner-api-0001' },
      body: { label: 'Lead Radar Windows Bridge', enrollmentCode },
    },
  );
  assert.equal(paired.status, 201);
  assert.match(String(paired.body.pairingId), /^lrtgbp_[a-f0-9]{32}$/u);
  assert.equal(JSON.stringify(paired.body).includes(enrollmentCode), false);
  assert.equal(service.requests.at(-1)?.authorization, `Bearer ${INTERNAL_SERVICE_TOKEN}`);

  service.bridgeStatus = 'online';
  const revoked = await callRoute(
    leadRadarRoute.onRequestDelete,
    db,
    '/api/admin/lead-radar/telegram-account/bridge',
    {
      method: 'DELETE', token, params: { path: 'telegram-account/bridge' }, env,
      headers: { 'Idempotency-Key': 'bridge-revoke-owner-api-0001' },
      body: { deviceId: BRIDGE_DEVICE_ID },
    },
  );
  assert.equal(revoked.status, 204);
  assert.equal(service.bridgeRevocations, 1);

  service.bridgeStatus = 'online';
  await seedConnectedAccount(db);
  const blocked = await callRoute(
    leadRadarRoute.onRequestDelete,
    db,
    '/api/admin/lead-radar/telegram-account/bridge',
    {
      method: 'DELETE', token, params: { path: 'telegram-account/bridge' }, env,
      headers: { 'Idempotency-Key': 'bridge-revoke-owner-api-0002' },
      body: { deviceId: BRIDGE_DEVICE_ID },
    },
  );
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error, 'telegram_campaign_account_state_conflict');
  assert.equal(service.bridgeRevocations, 1, 'live custody is never silently replaced');
});

test('private campaign send timeout aborts the binding and is provider-ambiguous', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null = null;
  const sender = new PrivateTelegramCampaignSender(
    abortAwareNeverResolvingService((value) => { signal = value; }),
    INTERNAL_SERVICE_TOKEN,
  );
  const pending = sender.send({
    orgId: 'org_timeout_control',
    accountId: 'lrtgua_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    gatewayAccountRef: 'gateway_account_timeout_0001',
    username: 'TimeoutClinic',
    text: 'Bounded message',
    randomId: 'lrtgce_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    media: null,
  });
  t.mock.timers.tick(TELEGRAM_ACCOUNT_SEND_REQUEST_TIMEOUT_MS);
  assert.deepEqual(await pending, { kind: 'ambiguous' });
  assert.equal(signal?.aborted, true);
});

test('owner account readiness reports only closed-list infrastructure blockers', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const token = await platformToken('platform_owner');

  const local = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    {
      token,
      params: { path: 'telegram-account' },
      env: await campaignEnv(undefined, {
        LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: 'invalid',
      }),
    },
  );
  assert.equal(local.status, 200);
  assert.equal(local.body.status, 'unconfigured');
  assert.deepEqual(local.body.readiness, {
    status: 'blocked',
    blockers: ['campaign_data_key_missing', 'gateway_binding_missing'],
  });

  const service = new TelegramAccountServiceFixture();
  service.healthBlockers = [
    'gateway_account_keys_missing',
    'gateway_storage_missing',
  ];
  const remote = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env: await campaignEnv(service) },
  );
  assert.equal(remote.status, 200);
  assert.deepEqual(remote.body.readiness, {
    status: 'blocked',
    blockers: service.healthBlockers,
  });
  assert.equal(JSON.stringify(remote.body).includes('must-not-cross-boundary'), false);
  const blockedConnect = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' },
      headers: { 'Idempotency-Key': 'account-connect-readiness-blocked-0001' },
      body: browserKeyBody(), env: await campaignEnv(service),
    },
  );
  assert.equal(blockedConnect.status, 503);
  assert.equal(blockedConnect.body.error, 'gateway_account_keys_missing');
  assert.equal(
    service.requests.filter((item) => item.pathname === '/v1/accounts/connect').length,
    0,
  );
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts'), 0);
  const healthCalls = service.requests
    .filter((item) => item.pathname === '/v1/health').length;
  const missingIdempotency = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' },
      body: {}, env: await campaignEnv(service),
    },
  );
  assert.equal(missingIdempotency.status, 400);
  assert.equal(missingIdempotency.body.error, 'lead_radar_idempotency_key_required');
  assert.equal(
    service.requests.filter((item) => item.pathname === '/v1/health').length,
    healthCalls,
  );

  service.healthBlockers = ['gateway_runtime_config_invalid'];
  service.gatewayVersion = 'unconfigured';
  service.tdlibCommit = 'unconfigured';
  const runtime = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env: await campaignEnv(service) },
  );
  assert.deepEqual(runtime.body.readiness, {
    status: 'blocked',
    blockers: ['gateway_runtime_config_invalid'],
  });

  service.healthBlockers = [];
  service.healthMalformed = true;
  const malformed = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env: await campaignEnv(service) },
  );
  assert.deepEqual(malformed.body.readiness, {
    status: 'blocked',
    blockers: ['gateway_unavailable'],
  });
  assert.equal(JSON.stringify(malformed.body).includes('must-not-cross-boundary'), false);
});

test('account readiness blocks legacy-unbound and mismatched campaign data keys', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const token = await platformToken('platform_owner');
  const orgId = await ownerOrgId(OWNER_EMAIL);
  const service = new TelegramAccountServiceFixture();
  const env = await campaignEnv(service);
  const now = '2026-08-25T12:00:00.000Z';
  db.sqlite.prepare(`INSERT INTO lead_radar_tg_data_key_state (
    org_id, key_fingerprint, established_at, created_at, updated_at
  ) VALUES (?, NULL, NULL, ?, ?)`)
    .run(orgId, now, now);

  const legacy = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(legacy.body.status, 'unconfigured');
  assert.deepEqual(legacy.body.readiness, {
    status: 'blocked', blockers: ['legacy_binding_required'],
  });
  const blockedConnect = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'legacy_binding_connect_0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(blockedConnect.status, 503);
  assert.equal(blockedConnect.body.error, 'legacy_binding_required');
  assert.equal(service.requests.filter((request) => request.pathname === '/v1/accounts/connect').length, 0);

  db.sqlite.prepare(`UPDATE lead_radar_tg_data_key_state
    SET key_fingerprint = ?, established_at = ?, updated_at = ? WHERE org_id = ?`)
    .run('0'.repeat(64), now, now, orgId);
  const mismatch = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.deepEqual(mismatch.body.readiness, {
    status: 'blocked', blockers: ['campaign_data_key_mismatch'],
  });
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts'), 0);
});

test('configured gateway remains probe-required and a boot failure persists no account or QR', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const token = await platformToken('platform_owner');
  const service = new TelegramAccountServiceFixture();
  const env = await campaignEnv(service);

  const configured = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(configured.status, 200, JSON.stringify(configured.body));
  assert.equal(configured.body.status, 'disconnected');
  assert.equal(configured.body.qr, null);
  assert.deepEqual(configured.body.readiness, {
    status: 'probe_required',
    blockers: [],
  });
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts'), 0);

  service.connectUnavailable = true;
  const failed = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-boot-failure-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(failed.status, 503);
  assert.equal(failed.body.error, 'telegram_campaign_gateway_unavailable');
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts'), 0);
});

test('a persisted private auth with failed QR generation never becomes an adoptable D1 account', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const token = await platformToken('platform_owner');
  const service = new TelegramAccountServiceFixture();
  service.connectUnavailable = true;
  service.deadQrAfterConnectFailure = true;
  const env = await campaignEnv(service);

  const first = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-dead-qr-first-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(first.status, 503);
  assert.equal(first.body.error, 'telegram_campaign_gateway_unavailable');
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts'), 0);

  const second = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-dead-qr-second-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(second.status, 503);
  assert.equal(second.body.error, 'telegram_campaign_gateway_unavailable');
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts'), 0);
  assert.equal(
    service.requests.filter((item) => item.pathname === '/v1/accounts/connect').length,
    1,
  );
});

test('D1 connect failure leaves only a bounded recoverable private challenge', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  db.exec(`CREATE TRIGGER fixture_reject_account_insert
    BEFORE INSERT ON lead_radar_tg_user_accounts
    BEGIN SELECT RAISE(ABORT, 'fixture account write failure'); END`);
  const token = await platformToken('platform_owner');
  const service = new TelegramAccountServiceFixture();
  const response = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' },
      headers: { 'Idempotency-Key': 'account-connect-d1-rollback-0001' },
      body: browserKeyBody(), env: await campaignEnv(service),
    },
  );
  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'telegram_campaign_storage_conflict');
  assert.equal(response.body.qr, undefined);
  assert.equal(service.cancels, 0);
  assert.equal(service.disconnects, 0);
  assert.equal(service.activeMissing, false);
  assert.equal(
    service.requests.some((item) => item.pathname === '/v1/accounts/connect/cancel'),
    false,
  );
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts'), 0);
});

test('the next explicit connect reconciles a challenge left by a failed D1 write', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  db.exec(`CREATE TRIGGER fixture_reject_account_insert
    BEFORE INSERT ON lead_radar_tg_user_accounts
    BEGIN SELECT RAISE(ABORT, 'fixture account write failure'); END`);
  const token = await platformToken('platform_owner');
  const service = new TelegramAccountServiceFixture();
  const env = await campaignEnv(service);
  const failed = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-d1-uncertain-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(failed.status, 409);
  assert.equal(failed.body.error, 'telegram_campaign_storage_conflict');
  assert.equal(service.activeMissing, false);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts'), 0);

  db.exec('DROP TRIGGER fixture_reject_account_insert');
  const recovered = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-d1-recovery-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(recovered.status, 201);
  assert.equal(recovered.body.status, 'connecting');
  assert.equal(service.cancels, 0);
  assert.equal(service.disconnects, 0);
  assert.equal(
    service.requests.filter((item) => item.pathname === '/v1/accounts/connect').length,
    1,
  );
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts'), 1);
});

test('phone connect skips terminal gateway history and starts a fresh challenge', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const token = await platformToken('platform_owner');
  const service = new TelegramAccountServiceFixture();
  service.activeMissing = false;
  service.activeAuthId = 'auth_revoked_history_1234567890';
  service.terminalStatus = 'revoked';
  service.authId = 'auth_fresh_phone_1234567890';
  const response = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' },
      headers: { 'Idempotency-Key': 'account-connect-after-revoked-history-0001' },
      body: {}, env: await campaignEnv(service),
    },
  );
  assert.equal(response.status, 201);
  assert.equal(response.body.status, 'connecting');
  assert.equal(response.body.authState, 'awaiting_phone');
  assert.equal((response.body.qr as Record<string, unknown>).authId, service.authId);
  assert.equal(service.adopts, 1);
  assert.equal(
    service.requests.filter((item) => item.pathname === '/v1/accounts/connect/phone/start').length,
    1,
  );
  assert.equal(db.value(
    `SELECT COUNT(*) FROM lead_radar_tg_user_accounts WHERE status = 'pending'`,
  ), 1);
});

test('failed writer never cancels a challenge concurrently adopted by another request', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  db.exec(`CREATE TRIGGER fixture_reject_first_account_insert
    BEFORE INSERT ON lead_radar_tg_user_accounts
    BEGIN SELECT RAISE(ABORT, 'fixture account write failure'); END`);
  const token = await platformToken('platform_owner');
  const service = new TelegramAccountServiceFixture();
  const env = await campaignEnv(service);

  const originalPrepare = db.prepare.bind(db);
  let authLookupCount = 0;
  let releaseFirstLookup = (): void => undefined;
  const firstLookupReleased = new Promise<void>((resolve) => {
    releaseFirstLookup = resolve;
  });
  let firstLookupReached = (): void => undefined;
  const firstLookupStarted = new Promise<void>((resolve) => {
    firstLookupReached = resolve;
  });
  db.prepare = ((sql: string) => {
    const statement = originalPrepare(sql);
    if (sql.includes('auth_request_digest = ?')) {
      const originalFirst = statement.first.bind(statement);
      statement.first = (async <T>(): Promise<T | null> => {
        authLookupCount += 1;
        const result = await originalFirst<T>();
        if (authLookupCount === 1) {
          firstLookupReached();
          await firstLookupReleased;
        }
        return result;
      }) as typeof statement.first;
    }
    return statement;
  }) as typeof db.prepare;

  const writerA = callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-cas-writer-a-0001' }, body: browserKeyBody(),
    },
  );
  await firstLookupStarted;
  db.exec('DROP TRIGGER fixture_reject_first_account_insert');
  const writerB = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-cas-writer-b-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(writerB.status, 201);
  assert.equal(writerB.body.status, 'connecting');
  assert.equal(service.adopted, true);
  releaseFirstLookup();

  const resultA = await writerA;
  assert.equal(resultA.status, 409);
  assert.equal(resultA.body.error, 'telegram_campaign_storage_conflict');
  assert.equal(service.cancels, 0);
  assert.equal(service.activeMissing, false);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts'), 1);

  const pollable = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}`,
    { token, params: { path: `telegram-account/connect/${service.authId}` }, env },
  );
  assert.equal(pollable.status, 200);
  assert.equal(pollable.body.status, 'connecting');
});

test('a failed writer never enters the serialized cancel lane before a later winner adopts', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  db.exec(`CREATE TRIGGER fixture_reject_loser_account_insert
    BEFORE INSERT ON lead_radar_tg_user_accounts
    BEGIN SELECT RAISE(ABORT, 'fixture loser write failure'); END`);
  const token = await platformToken('platform_owner');
  const service = new TelegramAccountServiceFixture();
  const env = await campaignEnv(service);
  service.beforeCancel = async () => {
    throw new Error('failed D1 writers must never cancel private auth');
  };

  const loserResult = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-adopt-loser-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(loserResult.status, 409);
  assert.equal(loserResult.body.error, 'telegram_campaign_storage_conflict');
  assert.equal(service.cancels, 0);
  assert.equal(service.activeMissing, false);

  // A later serialized request adopts the same bounded challenge rather than
  // creating a second QR. No cancel/adopt ordering can revoke this winner.
  db.exec('DROP TRIGGER fixture_reject_loser_account_insert');
  const winnerResult = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-adopt-winner-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(winnerResult.status, 201);
  assert.equal(winnerResult.body.status, 'connecting');
  assert.equal(service.cancels, 0);
  assert.equal(service.adopted, true);
  assert.equal(service.activeMissing, false);
  assert.equal(
    service.requests.filter((item) => item.pathname === '/v1/accounts/connect').length,
    1,
  );
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts'), 1);

  const pollable = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}`,
    { token, params: { path: `telegram-account/connect/${service.authId}` }, env },
  );
  assert.equal(pollable.status, 200);
  assert.equal(pollable.body.status, 'connecting');
});

test('auth-id-scoped cancellation is idempotent only for the exact challenge', async () => {
  const service = new TelegramAccountServiceFixture();
  service.activeMissing = false;
  const orgId = await ownerOrgId(OWNER_EMAIL);
  await cancelTelegramAccountConnection({
    service, internalServiceToken: INTERNAL_SERVICE_TOKEN, orgId, authId: service.authId,
  });
  assert.equal(service.cancels, 1);
  assert.equal(service.activeMissing, true);
  await cancelTelegramAccountConnection({
    service, internalServiceToken: INTERNAL_SERVICE_TOKEN, orgId, authId: service.authId,
  });
  assert.equal(service.cancels, 2);
});

test('account connect fails before D1 mutation when the private service binding is absent', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const response = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token: await platformToken('platform_owner'),
      params: { path: 'telegram-account/connect' },
      headers: { 'Idempotency-Key': 'account-connect-missing-binding-0001' },
      body: browserKeyBody(), env: await campaignEnv(),
    },
  );
  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'gateway_binding_missing');
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts'), 0);
});

test('an expired private QR challenge is read-only until explicit tenant-scoped reconnect', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const service = new TelegramAccountServiceFixture();
  const token = await platformToken('platform_owner');
  const ownerOrg = await ownerOrgId(OWNER_EMAIL);
  const otherOrg = await ownerOrgId('unrelated-owner@example.invalid');
  const env = await campaignEnv(service);

  const first = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-stale-original-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(first.status, 201);
  await createTelegramUserAccountPending({
    db: db.asD1(),
    dataKey: CAMPAIGN_DATA_KEY,
    orgId: otherOrg,
    authRequestReference: 'auth_unrelated_tenant_1234567890',
    idempotencyKey: 'account-connect-unrelated-tenant-0001',
  });

  service.activeMissing = true;
  const expired = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(expired.status, 200);
  assert.equal(expired.body.status, 'error');
  assert.equal(expired.body.reasonCode, 'auth_expired');
  const expiredPoll = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}`,
    {
      token,
      params: { path: `telegram-account/connect/${service.authId}` },
      env,
    },
  );
  assert.equal(expiredPoll.status, 200);
  assert.equal(expiredPoll.body.status, 'error');
  assert.equal(expiredPoll.body.reasonCode, 'auth_expired');
  assert.equal(db.value(
    'SELECT COUNT(*) FROM lead_radar_tg_user_accounts WHERE org_id = ? AND status = ?',
    ownerOrg,
    'pending',
  ), 1);

  service.disconnectUnavailable = true;
  const blockedReplacement = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-stale-replacement-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(blockedReplacement.status, 503);
  assert.equal(db.value(
    'SELECT COUNT(*) FROM lead_radar_tg_user_accounts WHERE org_id = ? AND status = ?',
    ownerOrg,
    'pending',
  ), 1);
  assert.equal(db.value(
    'SELECT COUNT(*) FROM lead_radar_tg_user_accounts WHERE org_id = ? AND status = ?',
    ownerOrg,
    'revoked',
  ), 0);
  assert.equal(
    service.requests.filter((item) => item.pathname === '/v1/accounts/connect').length,
    1,
  );

  service.disconnectUnavailable = false;
  service.authId = 'auth_replacement_1234567890';
  service.activeAuthId = service.authId;
  const replacement = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-stale-replacement-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(replacement.status, 201);
  assert.equal((replacement.body.qr as Record<string, unknown>).authId, service.authId);
  assert.equal(service.disconnects, 2);
  assert.equal(db.value(
    'SELECT COUNT(*) FROM lead_radar_tg_user_accounts WHERE org_id = ? AND status = ?',
    ownerOrg,
    'pending',
  ), 1);
  assert.equal(db.value(
    'SELECT COUNT(*) FROM lead_radar_tg_user_accounts WHERE org_id = ? AND status = ?',
    ownerOrg,
    'revoked',
  ), 1);
  assert.equal(db.value(
    'SELECT COUNT(*) FROM lead_radar_tg_user_accounts WHERE org_id = ? AND status = ?',
    otherOrg,
    'pending',
  ), 1);

  service.activeMissing = false;
  const replay = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-stale-replacement-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(replay.status, 200);
  assert.equal((replay.body.qr as Record<string, unknown>).authId, service.authId);
  assert.equal(
    service.requests.filter((item) => item.pathname === '/v1/accounts/connect').length,
    2,
  );
});

test('QR connect, tenant-scoped poll and disconnect use only the private binding', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const service = new TelegramAccountServiceFixture();
  const token = await platformToken('platform_owner');
  const ownerOrg = await ownerOrgId(OWNER_EMAIL);
  const otherEmail = 'other-owner@example.invalid';
  const otherOrg = await ownerOrgId(otherEmail);
  const env = await campaignEnv(service, {
    LEAD_RADAR_ALLOWED_ORGS: `${ownerOrg},${otherOrg}`,
  });
  const connect = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-private-binding-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(connect.status, 201);
  assert.equal(connect.body.status, 'connecting');
  assert.equal((connect.body.qr as Record<string, unknown>).authId, service.authId);
  const connectQr = connect.body.qr as Record<string, unknown>;
  assert.deepEqual(connectQr.qrEnvelope, QR_ENVELOPE);
  assert.equal('qrLoginUrl' in connectQr, false);
  assert.equal('qrCodeDataUrl' in connectQr, false);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_user_accounts'), 1);
  const stored = db.sqlite.prepare(`SELECT auth_request_digest, gateway_account_ref
    FROM lead_radar_tg_user_accounts`).get() as {
      auth_request_digest: string; gateway_account_ref: string | null;
    };
  assert.match(stored.auth_request_digest, /^[0-9a-f]{64}$/u);
  assert.equal(stored.auth_request_digest.includes(service.authId), false);
  assert.equal(stored.gateway_account_ref, null);

  const replay = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-private-binding-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(replay.status, 200);
  assert.equal((replay.body.qr as Record<string, unknown>).authId, service.authId);
  const pendingWithNewKey = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-private-binding-0002' }, body: browserKeyBody(),
    },
  );
  assert.equal(pendingWithNewKey.status, 200);
  assert.equal(
    service.requests.filter((item) => item.pathname === '/v1/accounts/connect').length,
    1,
  );

  const recoveredAfterReload = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(recoveredAfterReload.status, 200);
  assert.equal(recoveredAfterReload.body.status, 'connecting');
  assert.equal(
    (recoveredAfterReload.body.qr as Record<string, unknown>).authId,
    service.authId,
  );
  assert.equal(
    service.requests.filter((item) => item.pathname.endsWith('/active')).length,
    4,
  );

  service.activeAuthId = 'auth_mismatch_1234567890';
  const mismatchedRecovery = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(mismatchedRecovery.status, 409);
  assert.equal(mismatchedRecovery.body.error, 'telegram_campaign_gateway_conflict');
  service.activeAuthId = service.authId;

  const crossTenant = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}`,
    {
      token: await platformToken('platform_owner', otherEmail),
      params: { path: `telegram-account/connect/${service.authId}` }, env,
    },
  );
  assert.equal(crossTenant.status, 404);
  assert.equal(service.requests.filter((item) => item.pathname.endsWith('/state')).length, 0);

  service.connected = true;
  const poll = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}`,
    { token, params: { path: `telegram-account/connect/${service.authId}` }, env },
  );
  assert.equal(poll.status, 200);
  assert.equal(poll.body.status, 'connected');
  assert.equal(db.value(`SELECT status FROM lead_radar_tg_user_accounts
    WHERE org_id = ?`, ownerOrg), 'connected');
  assert.equal(service.finalizes, 1);

  const connectedReconnect = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-after-connected-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(connectedReconnect.status, 409);
  assert.equal(connectedReconnect.body.error, 'telegram_campaign_account_exists');
  assert.equal(
    service.requests.filter((item) => item.pathname === '/v1/accounts/connect').length,
    1,
  );

  const disconnected = await callRoute(
    leadRadarRoute.onRequestDelete,
    db,
    '/api/admin/lead-radar/telegram-account',
    {
      method: 'DELETE', token, params: { path: 'telegram-account' }, env,
      headers: { 'Idempotency-Key': 'account-disconnect-private-0001' },
    },
  );
  assert.equal(disconnected.status, 200);
  assert.equal(disconnected.body.status, 'revoked');
  assert.equal(service.disconnects, 1);
  const revoked = db.sqlite.prepare(`SELECT status, gateway_account_ref
    FROM lead_radar_tg_user_accounts WHERE org_id = ?`).get(ownerOrg) as {
      status: string; gateway_account_ref: string | null;
    };
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.gateway_account_ref, null);
});

test('routing-key rotation blocks readiness and disconnects only the stored private route', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const service = new TelegramAccountServiceFixture();
  const token = await platformToken('platform_owner');
  const ownerOrg = await ownerOrgId(OWNER_EMAIL);
  const env = await campaignEnv(service);
  const connected = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'routing-sentinel-connect-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(connected.status, 201);
  service.connected = true;
  const poll = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}`,
    { token, params: { path: `telegram-account/connect/${service.authId}` }, env },
  );
  assert.equal(poll.body.status, 'connected');
  assert.equal(db.value(`SELECT key_fingerprint FROM lead_radar_tg_routing_key_state
    WHERE org_id = ?`, ownerOrg), 'a'.repeat(64));

  const healthy = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(healthy.body.status, 'connected');
  assert.deepEqual((healthy.body.readiness as { blockers: string[] }).blockers, []);
  assert.notEqual(healthy.body.lastHealthAt, null);

  service.healthUnavailable = true;
  const gatewayBlocked = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(gatewayBlocked.status, 200);
  assert.equal(gatewayBlocked.body.status, 'connected');
  assert.equal(gatewayBlocked.body.connectionId, poll.body.connectionId);
  assert.equal(gatewayBlocked.body.reasonCode, 'gateway_unavailable');
  assert.deepEqual(gatewayBlocked.body.readiness, {
    status: 'blocked', blockers: ['gateway_unavailable'],
  });
  service.healthUnavailable = false;

  service.bridgeStatus = 'offline';
  const bridgeBlocked = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(bridgeBlocked.body.status, 'connected');
  assert.equal(bridgeBlocked.body.connectionId, poll.body.connectionId);
  assert.equal(bridgeBlocked.body.reasonCode, 'bridge_offline');
  assert.deepEqual(bridgeBlocked.body.readiness, {
    status: 'blocked', blockers: ['bridge_offline'],
  });
  service.bridgeStatus = 'online';

  service.privateAccountStatus = 'reauth_required';
  service.privateAccountReasonCode = 'auth_expired';
  const reconnectRequired = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(reconnectRequired.status, 200);
  assert.equal(reconnectRequired.body.status, 'reauth_required');
  assert.equal(reconnectRequired.body.reasonCode, 'auth_expired');
  assert.deepEqual(reconnectRequired.body.readiness, {
    status: 'blocked', blockers: ['gateway_account_session_missing'],
  });
  service.privateAccountStatus = null;
  service.privateAccountReasonCode = null;
  const healthCalls = service.requests.filter(
    (request) => request.pathname === '/v1/accounts/health',
  ).length;
  assert.equal(healthCalls, 2);

  service.routingKeyFingerprint = 'b'.repeat(64);
  const rotated = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(rotated.status, 200);
  assert.equal(rotated.body.status, 'connected');
  assert.deepEqual((rotated.body.readiness as { blockers: string[] }).blockers, [
    'gateway_routing_key_mismatch',
  ]);
  assert.equal(service.requests.filter(
    (request) => request.pathname === '/v1/accounts/health',
  ).length, healthCalls, 'a mismatched key never probes a newly derived DO');

  service.disconnectMissing = true;
  const unconfirmed = await callRoute(
    leadRadarRoute.onRequestDelete,
    db,
    '/api/admin/lead-radar/telegram-account',
    {
      method: 'DELETE', token, params: { path: 'telegram-account' }, env,
      headers: { 'Idempotency-Key': 'routing-sentinel-disconnect-0001' },
    },
  );
  assert.equal(unconfirmed.status, 404);
  assert.equal(unconfirmed.body.error, 'telegram_campaign_gateway_not_found');
  assert.equal(service.lastDisconnectBody?.account_ref, service.accountRef);
  assert.equal(db.value(`SELECT status FROM lead_radar_tg_user_accounts
    WHERE org_id = ?`, ownerOrg), 'connected');

  service.disconnectMissing = false;
  const revoked = await callRoute(
    leadRadarRoute.onRequestDelete,
    db,
    '/api/admin/lead-radar/telegram-account',
    {
      method: 'DELETE', token, params: { path: 'telegram-account' }, env,
      headers: { 'Idempotency-Key': 'routing-sentinel-disconnect-0002' },
    },
  );
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.status, 'revoked');
  assert.equal(service.lastDisconnectBody?.account_ref, service.accountRef);
  assert.equal(db.value(`SELECT status FROM lead_radar_tg_user_accounts
    WHERE org_id = ?`, ownerOrg), 'revoked');
});

test('QR two-factor password is ephemeral, rate-limited and completes through detailed auth state', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const service = new TelegramAccountServiceFixture();
  const token = await platformToken('platform_owner');
  const env = await campaignEnv(service);
  const connect = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-2fa-ephemeral-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(connect.status, 201);
  service.authState = 'awaiting_password';
  const awaiting = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}`,
    { token, params: { path: `telegram-account/connect/${service.authId}` }, env },
  );
  assert.equal(awaiting.status, 200);
  assert.equal(awaiting.body.status, 'connecting');
  assert.equal(awaiting.body.authState, 'awaiting_password');
  const awaitingQr = awaiting.body.qr as Record<string, unknown>;
  assert.equal(awaitingQr.qrEnvelope, null);
  assert.equal(awaitingQr.passwordCommandId, BRIDGE_PASSWORD_COMMAND_ID);
  assert.deepEqual(awaitingQr.bridgeEncryptionKey, {
    alg: 'RSA-OAEP-256', keyId: BRIDGE_KEY_ID, spki: BRIDGE_SPKI,
  });

  const passwordPlaceholder = 'fixture-password-placeholder';
  service.passwordOutcome = 'invalid';
  const invalid = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}/password`,
    {
      method: 'POST', token,
      params: { path: `telegram-account/connect/${service.authId}/password` },
      env, body: {
        passwordCommandId: BRIDGE_PASSWORD_COMMAND_ID,
        passwordEnvelope: PASSWORD_ENVELOPE,
      },
    },
  );
  assert.equal(invalid.status, 200);
  assert.equal(invalid.body.authState, 'awaiting_password');
  assert.equal(invalid.body.reasonCode, 'password_invalid');
  assert.equal(JSON.stringify(invalid.body).includes(passwordPlaceholder), false);
  assert.equal(JSON.stringify(service).includes(passwordPlaceholder), false);
  assert.deepEqual(service.lastPasswordBody, {
    schema: 'gptbot.lead-radar.telegram-account-service.v1',
    org_id: await ownerOrgId(OWNER_EMAIL),
    auth_id: service.authId,
    password_command_id: BRIDGE_PASSWORD_COMMAND_ID,
    password_envelope: PASSWORD_ENVELOPE,
  });
  assert.equal(JSON.stringify(db.rows('SELECT * FROM lead_radar_tg_user_accounts')).includes(passwordPlaceholder), false);

  service.passwordOutcome = 'rate_limited';
  const limited = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}/password`,
    {
      method: 'POST', token,
      params: { path: `telegram-account/connect/${service.authId}/password` },
      env, body: {
        passwordCommandId: BRIDGE_PASSWORD_COMMAND_ID,
        passwordEnvelope: PASSWORD_ENVELOPE,
      },
    },
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error, 'telegram_campaign_auth_rate_limited');
  assert.equal(JSON.stringify(limited.body).includes(passwordPlaceholder), false);

  service.passwordOutcome = 'connected';
  const connected = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}/password`,
    {
      method: 'POST', token,
      params: { path: `telegram-account/connect/${service.authId}/password` },
      env, body: {
        passwordCommandId: BRIDGE_PASSWORD_COMMAND_ID,
        passwordEnvelope: PASSWORD_ENVELOPE,
      },
    },
  );
  assert.equal(connected.status, 200);
  assert.equal(connected.body.status, 'connected');
  assert.equal(connected.body.authState, 'connected');
  assert.equal(service.passwordSubmissions, 3);
  assert.equal(service.finalizes, 1);
  assert.equal(JSON.stringify(service.requests).includes(passwordPlaceholder), false);

  const plaintextRejected = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}/password`,
    {
      method: 'POST', token,
      params: { path: `telegram-account/connect/${service.authId}/password` },
      env, body: { password: passwordPlaceholder },
    },
  );
  assert.equal(plaintextRejected.status, 400);
  assert.equal(service.passwordSubmissions, 3, 'plaintext never reaches the private gateway');

  const malformed = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}/password`,
    {
      method: 'POST', token,
      params: { path: `telegram-account/connect/${service.authId}/password` },
      env, body: { password: '', remember: true },
    },
  );
  assert.equal(malformed.status, 400);
  assert.equal(service.passwordSubmissions, 3);
});

test('staged D1 binding stays pending and reload idempotently recovers private finalization', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const service = new TelegramAccountServiceFixture();
  const token = await platformToken('platform_owner');
  const orgId = await ownerOrgId(OWNER_EMAIL);
  const env = await campaignEnv(service);
  const connect = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-finalize-failure-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(connect.status, 201);
  service.connected = true;
  service.finalizeUnavailable = true;
  const poll = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}`,
    { token, params: { path: `telegram-account/connect/${service.authId}` }, env },
  );
  assert.equal(poll.status, 503);
  assert.equal(service.finalizes, 1);
  assert.equal(db.value(`SELECT status FROM lead_radar_tg_user_accounts
    WHERE org_id = ?`, orgId), 'pending');
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_account_finalizations
    WHERE org_id = ?`, orgId), 1);

  service.finalizeUnavailable = false;
  service.finalizePending = true;
  const pending = await callRoute(
    leadRadarRoute.onRequestGet, db, '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(pending.status, 200);
  assert.equal(pending.body.status, 'connecting');
  assert.equal(pending.body.authState, 'finalizing');
  assert.equal(pending.body.authAttemptId, service.authId);
  assert.equal(db.value('SELECT status FROM lead_radar_tg_user_accounts WHERE org_id = ?', orgId), 'pending');
  service.finalizePending = false;
  const recovered = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.status, 'connected');
  assert.equal(service.finalizes, 3);
  assert.equal(db.value(`SELECT status FROM lead_radar_tg_user_accounts
    WHERE org_id = ?`, orgId), 'connected');
  assert.equal(db.value(`SELECT COUNT(*) FROM lead_radar_tg_account_finalizations
    WHERE org_id = ?`, orgId), 0);
});

test('terminal QR poll leaves no pending challenge for reload recovery', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const service = new TelegramAccountServiceFixture();
  const token = await platformToken('platform_owner');
  const orgId = await ownerOrgId(OWNER_EMAIL);
  const env = await campaignEnv(service);
  const connected = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-connect-terminal-poll-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(connected.status, 201);
  service.terminalStatus = 'reauth_required';
  const terminal = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/telegram-account/connect/${service.authId}`,
    { token, params: { path: `telegram-account/connect/${service.authId}` }, env },
  );
  assert.equal(terminal.status, 200);
  assert.equal(terminal.body.status, 'reauth_required');
  assert.equal(db.value(
    'SELECT status FROM lead_radar_tg_user_accounts WHERE org_id = ?',
    orgId,
  ), 'error');
  const activeCallsBeforeReload = service.requests
    .filter((item) => item.pathname.endsWith('/active')).length;
  const reloaded = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar/telegram-account',
    { token, params: { path: 'telegram-account' }, env },
  );
  assert.equal(reloaded.status, 200);
  assert.equal(reloaded.body.status, 'reauth_required');
  assert.deepEqual(reloaded.body.readiness, {
    status: 'blocked', blockers: ['gateway_account_session_missing'],
  });
  assert.equal(
    service.requests.filter((item) => item.pathname.endsWith('/active')).length,
    activeCallsBeforeReload,
  );
  service.terminalStatus = null;
  service.disconnectMissing = true;
  const reconnected = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-account/connect',
    {
      method: 'POST', token, params: { path: 'telegram-account/connect' }, env,
      headers: { 'Idempotency-Key': 'account-reconnect-after-terminal-0001' }, body: browserKeyBody(),
    },
  );
  assert.equal(reconnected.status, 201);
  assert.equal(reconnected.body.status, 'connecting');
  assert.equal(service.disconnects, 1);
  assert.equal(db.value(
    `SELECT COUNT(*) FROM lead_radar_tg_user_accounts
      WHERE org_id = ? AND status = 'pending'`,
    orgId,
  ), 1);
});

test('audience API prepares and creates across searches, rejects mixed scope and recovers without sending',async()=>{
  const db=freshAdminDb();installLeadRadarLedger(db);
  db.exec("INSERT OR IGNORE INTO d1_migrations(name) VALUES ('0051_lead_radar_audiences.sql')");
  const first=await seedCorporateLead(db),second=await seedCorporateLead(db,'_second');
  const accountId=await seedConnectedAccount(db),token=await platformToken('platform_owner');
  const service=new TelegramAccountServiceFixture(),queue=new MemoryQueue();
  const env=await campaignEnv(service,{AUTOMATION_QUEUE:queue});
  const post=(route:string,body:unknown,key:string)=>callRoute(leadRadarRoute.onRequestPost,db,`/api/admin/lead-radar/${route}`,{
    method:'POST',token,params:{path:route},headers:{'Idempotency-Key':key},body,env});
  for(const lead of [first,second]) {
    const allowed=await post('telegram-campaigns/eligibility',{...lead,contactBasis:'documented_consent',
      evidenceReference:'fixture-owner-consent',expiresAt:new Date(Date.now()+86400_000).toISOString()},`audience-api-eligibility-${lead.leadId}`);
    assert.equal(allowed.status,201,JSON.stringify(allowed.body));
  }
  const audienceId='aud_'+'c'.repeat(32),leadIds=[first.leadId,second.leadId];
  const saved=await post('audiences/'+audienceId,{name:'Mixed search API fixture',version:0,companyIds:leadIds},'audience-api-save');
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  const input={accountId,audienceId,audienceVersion:1,leadIds,template:'Здравствуйте, {company_name}.',contactBasis:'documented_consent'};
  const mixed=await post('telegram-campaigns/prepare',{...input,searchId:first.searchId},'audience-api-mixed');
  assert.equal(mixed.status,400);
  const prepared=await post('telegram-campaigns/prepare',input,'audience-api-prepare');
  assert.equal(prepared.status,201,JSON.stringify(prepared.body));
  assert.deepEqual(prepared.body.summary,{selected:2,automatic:2,manual:0,excluded:0});
  const created=await post('telegram-campaigns',{...input,approvalToken:prepared.body.approvalToken,
    selectionDigest:prepared.body.selectionDigest,contentDigest:prepared.body.contentDigest},'audience-api-create');
  assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(created.body.status,'approved');
  const recovery=await callRoute(leadRadarRoute.onRequestGet,db,`/api/admin/lead-radar/telegram-campaigns?audienceId=${audienceId}`,{
    token,params:{path:'telegram-campaigns'},env});
  assert.equal(recovery.status,200,JSON.stringify(recovery.body));
  assert.equal((recovery.body.active as Record<string,unknown>).id,created.body.id);
  assert.equal(queue.messages.length,0);
  assert.ok(service.requests.length > 0);
  assert.ok(service.requests.every((request) => [
    '/v1/health', '/v1/bridge/status', '/v1/accounts/health',
  ].includes(request.pathname)));
});

test('campaign API freezes exact payload, queues only an opaque envelope, and keeps pause/stop available', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const { searchId, leadId } = await seedCorporateLead(db);
  const accountId = await seedConnectedAccount(db);
  const service = new TelegramAccountServiceFixture();
  const queue = new MemoryQueue();
  const token = await platformToken('platform_owner');
  const template = 'Здравствуйте, {company_name}! Обсудим автоматизацию?';
  const baseEnv = await campaignEnv(service, { AUTOMATION_QUEUE: queue });
  const eligibilityExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
  const eligibility = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-campaigns/eligibility',
    {
      method: 'POST', token, params: { path: 'telegram-campaigns/eligibility' },
      headers: { 'Idempotency-Key': 'campaign-eligibility-api-0001' },
      body: {
        searchId,
        leadId,
        contactBasis: 'documented_consent',
        evidenceReference: 'crm-consent-clinic-alpha-2026',
        expiresAt: eligibilityExpiresAt,
      },
      env: baseEnv,
    },
  );
  assert.equal(eligibility.status, 201);
  assert.equal(eligibility.body.companyId, leadId);
  assert.equal(eligibility.body.reviewer, 'owner_verified');
  const prepareInput = {
    accountId, searchId, leadIds: [leadId], template,
    contactBasis: 'documented_consent',
  };
  service.privateAccountStatus = 'reauth_required';
  service.privateAccountReasonCode = 'auth_expired';
  const blockedPrepare = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-campaigns/prepare',
    {
      method: 'POST', token, params: { path: 'telegram-campaigns/prepare' },
      headers: { 'Idempotency-Key': 'campaign-prepare-reauth-blocked-0001' },
      body: prepareInput, env: baseEnv,
    },
  );
  assert.equal(blockedPrepare.status, 409);
  assert.equal(blockedPrepare.body.error, 'telegram_campaign_account_not_connected');
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_approvals'), 0);
  service.privateAccountStatus = null;
  service.privateAccountReasonCode = null;
  const prepared = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-campaigns/prepare',
    {
      method: 'POST', token, params: { path: 'telegram-campaigns/prepare' },
      headers: { 'Idempotency-Key': 'campaign-prepare-api-0001' },
      body: prepareInput, env: baseEnv,
    },
  );
  assert.equal(prepared.status, 201);
  assert.deepEqual(prepared.body.summary, {
    selected: 1, automatic: 1, manual: 0, excluded: 0,
  });
  assert.deepEqual(
    ((prepared.body.recipients as Array<Record<string, unknown>>)[0]?.authorization),
    {
      basis: 'documented_consent',
      evidenceVersion: 'campaign-contact-eligibility-v1',
      verifiedAt: eligibility.body.verifiedAt,
      expiresAt: eligibilityExpiresAt,
      reviewer: 'owner_verified',
    },
  );
  assert.equal(
    ((prepared.body.previews as Array<Record<string, unknown>>)[0]?.text),
    'Здравствуйте, Клиника Альфа! Обсудим автоматизацию?',
  );
  const prepareGatewayCalls = service.requests.length;
  service.healthUnavailable = true;
  const replay = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-campaigns/prepare',
    {
      method: 'POST', token, params: { path: 'telegram-campaigns/prepare' },
      headers: { 'Idempotency-Key': 'campaign-prepare-api-0001' },
      body: prepareInput, env: baseEnv,
    },
  );
  assert.equal(replay.status, 201);
  assert.equal(replay.body.approvalToken, prepared.body.approvalToken);
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_tg_campaign_approvals'), 1);
  assert.equal(service.requests.length, prepareGatewayCalls,
    'an exact preparation replay never depends on current gateway health');
  service.healthUnavailable = false;

  const created = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    '/api/admin/lead-radar/telegram-campaigns',
    {
      method: 'POST', token, params: { path: 'telegram-campaigns' },
      headers: { 'Idempotency-Key': 'campaign-create-api-0001' }, env: baseEnv,
      body: {
        accountId, searchId, leadIds: [leadId], template,
        contactBasis: 'documented_consent',
        approvalToken: prepared.body.approvalToken,
        selectionDigest: prepared.body.selectionDigest,
        contentDigest: prepared.body.contentDigest,
      },
    },
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'approved');
  const campaignId = String(created.body.id);
  const recovered = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/telegram-campaigns?searchId=${encodeURIComponent(searchId)}`,
    { token, params: { path: 'telegram-campaigns' }, env: baseEnv },
  );
  assert.equal(recovered.status, 200);
  assert.equal((recovered.body.active as Record<string, unknown>).id, campaignId);
  assert.equal((recovered.body.latest as Record<string, unknown>).id, campaignId);
  const encrypted = db.sqlite.prepare(`SELECT template_ciphertext
    FROM lead_radar_tg_campaigns WHERE id = ?`).get(campaignId) as {
      template_ciphertext: string;
    };
  assert.notEqual(encrypted.template_ciphertext, template);
  assert.equal(JSON.stringify(queue.messages).includes(template), false);

  const blockedStart = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-campaigns/${campaignId}/start`,
    {
      method: 'POST', token,
      params: { path: `telegram-campaigns/${campaignId}/start` },
      headers: { 'Idempotency-Key': 'campaign-start-blocked-api-0001' },
      body: {}, env: baseEnv,
    },
  );
  assert.equal(blockedStart.status, 409);
  assert.equal(blockedStart.body.error, 'lead_radar_campaign_autosend_paused');
  assert.equal(queue.messages.length, 0);

  service.privateAccountStatus = 'reauth_required';
  service.privateAccountReasonCode = 'auth_expired';
  const reconnectBlockedStart = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-campaigns/${campaignId}/start`,
    {
      method: 'POST', token,
      params: { path: `telegram-campaigns/${campaignId}/start` },
      headers: { 'Idempotency-Key': 'campaign-start-reauth-blocked-0001' },
      body: {},
      env: { ...baseEnv, LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true' },
    },
  );
  assert.equal(reconnectBlockedStart.status, 409);
  assert.equal(reconnectBlockedStart.body.error, 'telegram_campaign_account_not_connected');
  assert.equal(db.value('SELECT status FROM lead_radar_tg_campaigns WHERE id = ?', campaignId), 'approved');
  assert.equal(queue.messages.length, 0);
  service.privateAccountStatus = null;
  service.privateAccountReasonCode = null;
  const running = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-campaigns/${campaignId}/start`,
    {
      method: 'POST', token,
      params: { path: `telegram-campaigns/${campaignId}/start` },
      headers: { 'Idempotency-Key': 'campaign-start-enabled-api-0001' },
      body: {},
      env: { ...baseEnv, LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true' },
    },
  );
  assert.equal(running.status, 200);
  assert.equal(running.body.status, 'running');
  assert.equal(queue.messages.length, 1);
  assert.deepEqual(Object.keys(queue.messages[0] as Record<string, unknown>).sort(), [
    'campaign_id', 'org_id', 'schema', 'state_version',
  ]);
  assert.equal(JSON.stringify(queue.messages[0]).includes('campaign_clinic'), false);
  assert.equal(JSON.stringify(queue.messages[0]).includes(template), false);

  const startGatewayCalls = service.requests.length;
  service.healthUnavailable = true;
  const runningReplay = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-campaigns/${campaignId}/start`,
    {
      method: 'POST', token,
      params: { path: `telegram-campaigns/${campaignId}/start` },
      headers: { 'Idempotency-Key': 'campaign-start-enabled-api-0001' },
      body: {},
      env: { ...baseEnv, LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true' },
    },
  );
  assert.equal(runningReplay.status, 200);
  assert.equal(runningReplay.body.status, 'running');
  assert.equal(service.requests.length, startGatewayCalls,
    'an exact start replay never depends on current gateway health');
  assert.equal(queue.messages.length, 1, 'a start replay never enqueues a second effect');
  service.healthUnavailable = false;

  const paused = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-campaigns/${campaignId}/pause`,
    {
      method: 'POST', token,
      params: { path: `telegram-campaigns/${campaignId}/pause` },
      headers: { 'Idempotency-Key': 'campaign-pause-api-0001' },
      body: {}, env: baseEnv,
    },
  );
  assert.equal(paused.status, 200);
  assert.equal(paused.body.status, 'paused');

  service.privateAccountStatus = 'reauth_required';
  service.privateAccountReasonCode = 'auth_expired';
  const blockedResume = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-campaigns/${campaignId}/resume`,
    {
      method: 'POST', token,
      params: { path: `telegram-campaigns/${campaignId}/resume` },
      headers: { 'Idempotency-Key': 'campaign-resume-reauth-blocked-0001' },
      body: {},
      env: { ...baseEnv, LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true' },
    },
  );
  assert.equal(blockedResume.status, 409);
  assert.equal(blockedResume.body.error, 'telegram_campaign_account_not_connected');
  assert.equal(db.value('SELECT status FROM lead_radar_tg_campaigns WHERE id = ?', campaignId), 'paused');
  assert.equal(queue.messages.length, 1);

  service.privateAccountStatus = null;
  service.privateAccountReasonCode = null;
  const resumed = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-campaigns/${campaignId}/resume`,
    {
      method: 'POST', token,
      params: { path: `telegram-campaigns/${campaignId}/resume` },
      headers: { 'Idempotency-Key': 'campaign-resume-enabled-api-0001' },
      body: {},
      env: { ...baseEnv, LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true' },
    },
  );
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.status, 'running');
  const queueAfterResume = queue.messages.length;
  const resumeGatewayCalls = service.requests.length;
  service.healthUnavailable = true;
  const resumedReplay = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-campaigns/${campaignId}/resume`,
    {
      method: 'POST', token,
      params: { path: `telegram-campaigns/${campaignId}/resume` },
      headers: { 'Idempotency-Key': 'campaign-resume-enabled-api-0001' },
      body: {},
      env: { ...baseEnv, LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true' },
    },
  );
  assert.equal(resumedReplay.status, 200);
  assert.equal(resumedReplay.body.status, 'running');
  assert.equal(service.requests.length, resumeGatewayCalls,
    'an exact resume replay never depends on current gateway health');
  assert.equal(queue.messages.length, queueAfterResume,
    'a resume replay never enqueues a second effect');
  service.healthUnavailable = false;

  const stopped = await callRoute(
    leadRadarRoute.onRequestPost,
    db,
    `/api/admin/lead-radar/telegram-campaigns/${campaignId}/stop`,
    {
      method: 'POST', token,
      params: { path: `telegram-campaigns/${campaignId}/stop` },
      headers: { 'Idempotency-Key': 'campaign-stop-api-0001' },
      body: {}, env: baseEnv,
    },
  );
  assert.equal(stopped.status, 200);
  assert.equal(stopped.body.status, 'stopped');
});

test('research mode keeps corporate Telegram, redacts people, uses company total, and ranks business first', async () => {
  const db = freshAdminDb();
  installLeadRadarLedger(db);
  const now = new Date().toISOString();
  const orgId = await ownerOrgId(OWNER_EMAIL);
  const store = new LeadRadarStore(db.asD1());
  const searchId = await store.createSearch(orgId, {
    niche: 'Клиники', city: 'Ташкент', country: 'UZ', offer: 'AI-бот',
    desiredCount: 10, telegramRequired: true, languages: ['ru', 'uz'],
  }, now);
  const corporateId = await store.insertLead(orgId, searchId, {
    canonicalKey: 'domain:research-business.example.invalid',
    name: 'Бизнес Telegram', category: 'Клиника', city: 'Ташкент', country: 'UZ',
    address: null, website: 'https://research-business.example.invalid',
    phone: null, genericEmail: null, telegramUrl: 'https://t.me/research_business',
    telegramContact: {
      url: 'https://t.me/research_business', username: 'research_business', type: 'business',
      confidence: 0.95, reason: 'synthetic corporate fixture', evidenceIds: ['ev-business'],
      verifiedAt: now, messageable: false,
    },
    decisionMakers: [], score: 30, confidence: 0.7, priority: 'P3',
    lifecycle: 'new', suppressed: false, scoreComponents: [], signals: [],
    evidence: [{
      id: 'ev-business', fieldPath: 'web.telegram.business', value: '@research_business',
      sourceUrl: 'https://research-business.example.invalid/contact',
      sourceType: 'company_website', observedAt: now, confidence: 0.95,
      classification: 'fact',
    }],
    enrichmentStatus: 'enriched', enrichmentReason: 'enriched', enrichmentAttempts: 1,
    discoveredAt: now, lastVerifiedAt: now,
  });
  const personalId = await store.insertLead(orgId, searchId, {
    canonicalKey: 'domain:research-person.example.invalid',
    name: 'Личный Telegram', category: 'Клиника', city: 'Ташкент', country: 'UZ',
    address: null, website: 'https://research-person.example.invalid',
    phone: null, genericEmail: null, telegramUrl: 'https://t.me/research_director',
    telegramContact: {
      url: 'https://t.me/research_director', username: 'research_director', type: 'human',
      confidence: 0.99, reason: 'synthetic human fixture', evidenceIds: ['ev-person'],
      verifiedAt: now, messageable: false,
    },
    decisionMakers: [{
      id: 'dm-research', name: 'Fixture Director', role: 'директор',
      telegramUrl: 'https://t.me/research_director', telegramUsername: 'research_director',
      contactType: 'human', confidence: 0.99, evidenceIds: ['ev-person'],
      sourceUrl: 'https://research-person.example.invalid/team', evidence: 'synthetic',
      verifiedAt: now, sourceClaim: 'official_site_proximity',
      contactReviewStatus: 'approved', contactReviewedAt: now,
    }],
    score: 95, confidence: 0.99, priority: 'P1', lifecycle: 'new', suppressed: false,
    scoreComponents: [], signals: [],
    evidence: [{
      id: 'ev-person', fieldPath: 'web.telegram.human', value: '@research_director',
      sourceUrl: 'https://research-person.example.invalid/team',
      sourceType: 'company_website', observedAt: now, confidence: 0.99,
      classification: 'fact',
    }],
    enrichmentStatus: 'enriched', enrichmentReason: 'enriched', enrichmentAttempts: 1,
    discoveredAt: now, lastVerifiedAt: now,
  });
  assert.ok(corporateId && personalId);
  db.sqlite.prepare(`UPDATE lead_radar_searches SET
    candidate_count = 2, verified_count = 2, p1_count = 1, p3_count = 1,
    telegram_count = 2, raw_discovered_count = 2, processed_count = 2,
    website_count = 2, enriched_count = 2, decision_maker_count = 1,
    company_telegram_count = 1, personal_telegram_count = 1
    WHERE org_id = ? AND id = ?`).run(orgId, searchId);

  const env = await campaignEnv(undefined, {
    LEAD_RADAR_CONTACT_ENABLED: 'false',
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'false',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'false',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'false',
  });
  const token = await platformToken('platform_owner');
  const result = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    `/api/admin/lead-radar/searches/${searchId}`,
    { token, params: { path: `searches/${searchId}` }, env },
  );
  assert.equal(result.status, 200);
  assert.equal((result.body.capabilities as Record<string, unknown>).telegramDiscoveryEnabled, true);
  const search = result.body.search as Record<string, unknown>;
  assert.equal(search.telegramCount, 1);
  assert.equal((search.funnel as Record<string, unknown>).companyTelegramCount, 1);
  assert.equal((search.funnel as Record<string, unknown>).personalTelegramCount, 0);
  const leads = result.body.leads as Array<Record<string, unknown>>;
  assert.equal(leads[0]?.id, corporateId);
  assert.equal((leads[0]?.telegramContact as Record<string, unknown>)?.type, 'business');
  const personal = leads.find((lead) => lead.id === personalId);
  assert.equal(personal?.telegramContact, null);
  assert.equal(personal?.telegramUrl, null);
  assert.deepEqual(personal?.decisionMakers, []);

  const overview = await callRoute(
    leadRadarRoute.onRequestGet,
    db,
    '/api/admin/lead-radar',
    { token, env },
  );
  assert.equal(overview.status, 200);
  assert.equal((overview.body.totals as Record<string, unknown>).telegram, 1);
});
