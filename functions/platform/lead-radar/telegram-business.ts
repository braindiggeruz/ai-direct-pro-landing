import type { LeadRadarTelegramContact } from './types';
import { verifiedResolvedCorporateCompanies } from './contact-resolution';
import { isTelegramPeerRef } from '../../../src/shared/lead-radar-telegram-endpoint';
import {
  LeadRadarTelegramBusinessStore,
  type TelegramBusinessCompanyRow,
  type TelegramBusinessConnectionRow,
  type TelegramBusinessSendEffectRow,
  type TelegramBusinessSendTargetRow,
} from './telegram-business-store';

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });
const MAX_UPDATE_BYTES = 32_768;
const CONNECT_TTL_MS = 15 * 60_000;
const CHAT_ACTIVE_MS = 24 * 60 * 60_000;
const APPROVAL_TTL_MS = 5 * 60_000;
const FUTURE_SKEW_MS = 5 * 60_000;
const BOT_API_TIMEOUT_MS = 8_000;
const MAX_BOT_API_RESPONSE_BYTES = 65_536;
const BOT_API_HOST = 'api.telegram.org';
const USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;
const CONNECT_TOKEN_PATTERN = /^lr_([0-9a-f]{16})_([A-Za-z0-9_-]{32})$/;
const APPROVAL_TOKEN_PATTERN = /^lrap_[A-Za-z0-9_-]{43}$/;

export interface LeadRadarTelegramBusinessEnv {
  GPTBOT_DRAFTS_DB?: D1Database;
  LEAD_RADAR_CONTACT_ENABLED?: string;
  LEAD_RADAR_TELEGRAM_BOT_TOKEN?: string;
  LEAD_RADAR_TELEGRAM_WEBHOOK_SECRET?: string;
  LEAD_RADAR_TELEGRAM_DATA_KEY?: string;
  LEAD_RADAR_TELEGRAM_BOT_USERNAME?: string;
  LEAD_RADAR_CONTACT_DAILY_LIMIT?: string;
  LEAD_RADAR_ALLOWED_ORGS?: string;
}

export type TelegramBusinessErrorCode =
  | 'telegram_business_not_configured'
  | 'telegram_business_paused'
  | 'telegram_business_invalid_input'
  | 'telegram_business_invalid_update'
  | 'telegram_business_update_too_large'
  | 'telegram_business_nonce_expired_or_used'
  | 'telegram_business_nonce_ambiguous'
  | 'telegram_business_connection_unassociated'
  | 'telegram_business_connection_disabled'
  | 'telegram_business_reply_not_allowed'
  | 'telegram_business_company_unmatched'
  | 'telegram_business_company_ambiguous'
  | 'telegram_business_chat_inactive'
  | 'telegram_business_approval_required'
  | 'telegram_business_idempotency_conflict'
  | 'telegram_business_send_in_flight'
  | 'telegram_business_send_ambiguous'
  | 'telegram_business_rate_limited'
  | 'telegram_business_provider_failed'
  | 'telegram_business_org_not_allowed'
  | 'telegram_business_send_canceled';

export class LeadRadarTelegramBusinessError extends Error {
  constructor(readonly code: TelegramBusinessErrorCode) {
    super(code);
    this.name = 'LeadRadarTelegramBusinessError';
  }
}

interface DerivedKeys {
  encryption: CryptoKey;
  digest: CryptoKey;
}

export interface EncryptedTelegramIdentifier {
  ciphertext: string;
  iv: string;
}

export type ParsedTelegramBusinessUpdate =
  | {
    kind: 'start';
    updateId: string;
    token: string;
    lookupKey: string;
    userChatId: string;
  }
  | {
    kind: 'business_connection';
    updateId: string;
    connectionId: string;
    userChatId: string;
    connectedAt: string;
    isEnabled: boolean;
    canReply: boolean;
  }
  | {
    kind: 'business_message';
    updateId: string;
    connectionId: string;
    chatId: string;
    username: string;
    inboundAt: string;
  }
  | { kind: 'ignored'; updateId: string };

export interface TelegramBusinessConnectLink {
  url: string;
  expiresAt: string;
}

export interface TelegramBusinessConnectOperation {
  actorId: string;
  idempotencyKey: string;
}

export interface TelegramBusinessConnectionReadModel {
  status: 'unconfigured' | 'pending' | 'connected' | 'paused' | 'error';
  canReply: boolean;
  connectedAt: string | null;
  activeCompanyChats: number;
}

export interface TelegramBusinessCompanyEligibility {
  bindingId: string | null;
  activeChatEligible: boolean;
  lastInboundAt: string | null;
}

export interface TelegramBusinessApprovalGrant {
  approvalToken: string;
  expiresAt: string;
}

export interface TelegramBusinessSendResult {
  status: 'sent' | 'replayed' | 'ambiguous';
  effectId: string;
}

function fail(code: TelegramBusinessErrorCode): never {
  throw new LeadRadarTelegramBusinessError(code);
}

function bytesToBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/u.test(value)) fail('telegram_business_not_configured');
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return fail('telegram_business_not_configured');
  }
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

function randomHex(length: number): string {
  return [...randomBytes(length)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function entityId(prefix: 'lrtgn_' | 'lrtgc_' | 'lrtgb_' | 'lrtga_' | 'lrtgs_'): string {
  return `${prefix}${randomHex(16)}`;
}

function parseDataKey(value: string): Uint8Array<ArrayBuffer> {
  const bytes = base64ToBytes(value.trim());
  if (bytes.byteLength !== 32) fail('telegram_business_not_configured');
  return bytes;
}

async function deriveKeys(dataKey: string): Promise<DerivedKeys> {
  const root = await crypto.subtle.importKey('raw', parseDataKey(dataKey), 'HKDF', false, ['deriveKey']);
  const salt = TEXT_ENCODER.encode('gptbot.lead-radar.telegram-business.v1');
  const [encryption, digest] = await Promise.all([
    crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info: TEXT_ENCODER.encode('identifier-encryption') },
      root,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    ),
    crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info: TEXT_ENCODER.encode('identifier-digest') },
      root,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign'],
    ),
  ]);
  return { encryption, digest };
}

function containsAsciiControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function validIdentifier(value: string): boolean {
  return value.length >= 1 && value.length <= 256 && !containsAsciiControl(value);
}

async function digestWithKey(key: CryptoKey, purpose: string, value: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    TEXT_ENCODER.encode(`${purpose}\u0000${value}`),
  );
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function telegramIdentifierDigest(
  dataKey: string,
  purpose: string,
  value: string,
): Promise<string> {
  if (value.length < 1 || TEXT_ENCODER.encode(value).byteLength > 32_768 || !validIdentifier(purpose)) {
    fail('telegram_business_invalid_input');
  }
  return digestWithKey((await deriveKeys(dataKey)).digest, purpose, value);
}

export async function encryptTelegramIdentifier(
  dataKey: string,
  scope: string,
  value: string,
): Promise<EncryptedTelegramIdentifier> {
  if (!validIdentifier(value) || !validIdentifier(scope)) fail('telegram_business_invalid_input');
  const keys = await deriveKeys(dataKey);
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: TEXT_ENCODER.encode(`lead-radar.telegram-business.v1\u0000${scope}`),
      tagLength: 128,
    },
    keys.encryption,
    TEXT_ENCODER.encode(value),
  );
  return { ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)), iv: bytesToBase64Url(iv) };
}

export async function decryptTelegramIdentifier(
  dataKey: string,
  scope: string,
  encrypted: EncryptedTelegramIdentifier,
): Promise<string> {
  if (!validIdentifier(scope)) fail('telegram_business_invalid_input');
  const iv = base64ToBytes(encrypted.iv);
  const ciphertext = base64ToBytes(encrypted.ciphertext);
  if (iv.byteLength !== 12 || ciphertext.byteLength < 17 || ciphertext.byteLength > 768) {
    fail('telegram_business_invalid_input');
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: TEXT_ENCODER.encode(`lead-radar.telegram-business.v1\u0000${scope}`),
        tagLength: 128,
      },
      (await deriveKeys(dataKey)).encryption,
      ciphertext,
    );
    const value = TEXT_DECODER.decode(plaintext);
    if (!validIdentifier(value)) fail('telegram_business_invalid_input');
    return value;
  } catch (error) {
    if (error instanceof LeadRadarTelegramBusinessError) throw error;
    return fail('telegram_business_invalid_input');
  }
}

export async function verifyTelegramWebhookSecret(expected: string, received: string | null): Promise<boolean> {
  if (expected.length < 16 || expected.length > 256 || received === null || received.length > 256) return false;
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', TEXT_ENCODER.encode(expected)),
    crypto.subtle.digest('SHA-256', TEXT_ENCODER.encode(received)),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function telegramString(value: unknown): string | null {
  return typeof value === 'string' && validIdentifier(value) ? value : null;
}

function unixTimestamp(value: unknown): string | null {
  const seconds = safeInteger(value);
  if (seconds === null || seconds > 9_999_999_999) return null;
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function updateId(value: unknown): string | null {
  const parsed = safeInteger(value);
  return parsed === null ? null : String(parsed);
}

export function parseTelegramBusinessUpdate(raw: string | unknown): ParsedTelegramBusinessUpdate {
  let input: unknown = raw;
  if (typeof raw === 'string') {
    if (TEXT_ENCODER.encode(raw).byteLength > MAX_UPDATE_BYTES) fail('telegram_business_update_too_large');
    try { input = JSON.parse(raw) as unknown; } catch { return fail('telegram_business_invalid_update'); }
  }
  const root = record(input);
  const parsedUpdateId = updateId(root?.update_id);
  if (!root || parsedUpdateId === null) fail('telegram_business_invalid_update');

  const present = ['message', 'business_connection', 'business_message']
    .filter((field) => root[field] !== undefined);
  if (present.length > 1) fail('telegram_business_invalid_update');

  const message = record(root.message);
  if (message) {
    const chat = record(message.chat);
    const sender = record(message.from);
    const chatId = safeInteger(chat?.id);
    const senderId = safeInteger(sender?.id);
    const text = typeof message.text === 'string' && message.text.length <= 80 ? message.text : '';
    const match = /^\/start(?:@[A-Za-z0-9_]{5,32})? (lr_[A-Za-z0-9_-]+)$/u.exec(text);
    const tokenMatch = CONNECT_TOKEN_PATTERN.exec(match?.[1] ?? '');
    if (chat?.type !== 'private' || chatId === null || senderId !== chatId || !tokenMatch) {
      return { kind: 'ignored', updateId: parsedUpdateId };
    }
    return {
      kind: 'start',
      updateId: parsedUpdateId,
      token: tokenMatch[0],
      lookupKey: tokenMatch[1] ?? '',
      userChatId: String(chatId),
    };
  }

  const connection = record(root.business_connection);
  if (connection) {
    const connectionId = telegramString(connection.id);
    const userChatId = safeInteger(connection.user_chat_id);
    const connectedAt = unixTimestamp(connection.date);
    const rights = record(connection.rights);
    if (!connectionId || userChatId === null || !connectedAt || typeof connection.is_enabled !== 'boolean') {
      fail('telegram_business_invalid_update');
    }
    return {
      kind: 'business_connection',
      updateId: parsedUpdateId,
      connectionId,
      userChatId: String(userChatId),
      connectedAt,
      isEnabled: connection.is_enabled,
      canReply: rights?.can_reply === true,
    };
  }

  const businessMessage = record(root.business_message);
  if (businessMessage) {
    const chat = record(businessMessage.chat);
    const sender = record(businessMessage.from);
    const chatId = safeInteger(chat?.id);
    const senderId = safeInteger(sender?.id);
    const connectionId = telegramString(businessMessage.business_connection_id);
    const inboundAt = unixTimestamp(businessMessage.date);
    const username = typeof chat?.username === 'string' && USERNAME_PATTERN.test(chat.username)
      ? chat.username
      : null;
    if (chat?.type !== 'private' || chatId === null || senderId !== chatId
      || !connectionId || !inboundAt || !username) {
      fail('telegram_business_invalid_update');
    }
    return {
      kind: 'business_message',
      updateId: parsedUpdateId,
      connectionId,
      chatId: String(chatId),
      username,
      inboundAt,
    };
  }

  return { kind: 'ignored', updateId: parsedUpdateId };
}

function configuredDataKey(env: LeadRadarTelegramBusinessEnv): string {
  const value = env.LEAD_RADAR_TELEGRAM_DATA_KEY;
  if (!value) fail('telegram_business_not_configured');
  return value;
}

function configuredBotUsername(env: LeadRadarTelegramBusinessEnv): string {
  const value = env.LEAD_RADAR_TELEGRAM_BOT_USERNAME?.replace(/^@/u, '') ?? '';
  if (!USERNAME_PATTERN.test(value)) fail('telegram_business_not_configured');
  return value;
}

function assertOrgId(orgId: string): void {
  if (orgId.length < 1 || orgId.length > 80 || containsAsciiControl(orgId)) {
    fail('telegram_business_invalid_input');
  }
}

export function isTelegramBusinessConfigurationValid(
  env: LeadRadarTelegramBusinessEnv,
  options: { requireDatabase?: boolean } = {},
): boolean {
  if (options.requireDatabase === true && !env.GPTBOT_DRAFTS_DB) return false;
  if (!validBotToken(env.LEAD_RADAR_TELEGRAM_BOT_TOKEN ?? '')) return false;
  const webhookSecret = env.LEAD_RADAR_TELEGRAM_WEBHOOK_SECRET ?? '';
  if (webhookSecret.length < 16 || webhookSecret.length > 256 || containsAsciiControl(webhookSecret)) return false;
  try {
    parseDataKey(env.LEAD_RADAR_TELEGRAM_DATA_KEY?.trim() ?? '');
    configuredBotUsername(env);
    return true;
  } catch {
    return false;
  }
}

export async function createTelegramBusinessConnectLink(
  db: D1Database,
  env: LeadRadarTelegramBusinessEnv,
  orgId: string,
  now = new Date(),
  operation?: TelegramBusinessConnectOperation,
): Promise<TelegramBusinessConnectLink> {
  assertOrgId(orgId);
  const dataKey = configuredDataKey(env);
  const botUsername = configuredBotUsername(env);
  let lookupKey: string;
  let secret: string;
  if (operation) {
    if (!validOperatorId(operation.actorId)
      || !/^[A-Za-z0-9:_-]{8,160}$/u.test(operation.idempotencyKey)) {
      fail('telegram_business_invalid_input');
    }
    const operationDigest = await telegramIdentifierDigest(
      dataKey,
      'connect-operation',
      JSON.stringify([
        orgId,
        operation.actorId.trim().toLowerCase(),
        operation.idempotencyKey,
      ]),
    );
    lookupKey = operationDigest.slice(0, 16);
    const secretBytes = new Uint8Array(24);
    for (let index = 0; index < secretBytes.length; index += 1) {
      secretBytes[index] = Number.parseInt(operationDigest.slice(16 + index * 2, 18 + index * 2), 16);
    }
    secret = bytesToBase64Url(secretBytes);
  } else {
    lookupKey = randomHex(8);
    secret = bytesToBase64Url(randomBytes(24));
  }
  const token = `lr_${lookupKey}_${secret}`;
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + CONNECT_TTL_MS).toISOString();
  const nonceHash = await telegramIdentifierDigest(dataKey, 'connect-nonce', token);
  const store = new LeadRadarTelegramBusinessStore(db);
  const existing = await store.findOrgNonceByHash(orgId, nonceHash);
  if (existing) {
    if (existing.used_at !== null || existing.superseded_at !== null
      || existing.connection_bound_at !== null || existing.expires_at <= nowIso) {
      fail('telegram_business_nonce_expired_or_used');
    }
    const url = new URL(`https://t.me/${botUsername}`);
    url.searchParams.set('start', token);
    return { url: url.toString(), expiresAt: existing.expires_at };
  }
  const stored = await store.createConnectNonce({
    id: entityId('lrtgn_'),
    orgId,
    lookupKey,
    nonceHash,
    expiresAt,
    now: nowIso,
  });
  if (!stored || stored.used_at !== null || stored.superseded_at !== null
    || stored.connection_bound_at !== null || stored.expires_at <= nowIso) {
    fail('telegram_business_nonce_expired_or_used');
  }
  const url = new URL(`https://t.me/${botUsername}`);
  url.searchParams.set('start', token);
  return { url: url.toString(), expiresAt: stored.expires_at };
}

export async function getTelegramBusinessConnectionStatus(
  db: D1Database,
  orgId: string,
  now = new Date(),
  env?: LeadRadarTelegramBusinessEnv,
): Promise<TelegramBusinessConnectionReadModel> {
  assertOrgId(orgId);
  const store = new LeadRadarTelegramBusinessStore(db);
  const connections = await store.listOrgConnections(orgId);
  if (connections.length === 0) {
    return {
      status: await store.hasPendingOrgNonce(orgId, now.toISOString()) ? 'pending' : 'unconfigured',
      canReply: false,
      connectedAt: null,
      activeCompanyChats: 0,
    };
  }
  if (connections.length !== 1) {
    return { status: 'error', canReply: false, connectedAt: null, activeCompanyChats: 0 };
  }
  const connection = connections[0];
  if (!connection || !Number.isFinite(Date.parse(connection.connected_at))) {
    return { status: 'error', canReply: false, connectedAt: null, activeCompanyChats: 0 };
  }
  if (connection.is_enabled !== 1) {
    return {
      status: 'paused',
      canReply: false,
      connectedAt: connection.connected_at,
      activeCompanyChats: 0,
    };
  }
  const canReply = connection.can_reply === 1;
  let activeCompanyChats = 0;
  if (canReply && env) {
    const dataKey = configuredDataKey(env);
    for (const row of await store.listActiveCompanyChats(orgId, now.toISOString())) {
      const username = await verifiedBusinessEndpointUsername({
        store,
        orgId,
        companyId: row.company_id,
        website: row.website,
        telegramContactJson: row.telegram_contact_json,
        now,
      });
      if (username !== null
        && await telegramIdentifierDigest(dataKey, 'business-endpoint', username) === row.endpoint_digest) {
        activeCompanyChats += 1;
      }
    }
  }
  return {
    status: 'connected',
    canReply,
    connectedAt: connection.connected_at,
    activeCompanyChats,
  };
}

export async function getTelegramBusinessCompanyEligibility(input: {
  db: D1Database;
  env: LeadRadarTelegramBusinessEnv;
  orgId: string;
  companyId: string;
  now?: Date;
}): Promise<TelegramBusinessCompanyEligibility> {
  assertOrgId(input.orgId);
  if (!/^[A-Za-z0-9:_-]{1,80}$/u.test(input.companyId)) fail('telegram_business_invalid_input');
  const store = new LeadRadarTelegramBusinessStore(input.db);
  const rows = await store.findCompanyEligibilityCandidates(input.orgId, input.companyId);
  if (rows.length !== 1) {
    return { bindingId: null, activeChatEligible: false, lastInboundAt: null };
  }
  const row = rows[0];
  if (!row) return { bindingId: null, activeChatEligible: false, lastInboundAt: null };
  const inboundAt = Date.parse(row.last_inbound_at);
  const activeUntil = Date.parse(row.active_until);
  const lastInboundAt = Number.isFinite(inboundAt) ? row.last_inbound_at : null;
  const now = input.now ?? new Date();
  const username = await verifiedBusinessEndpointUsername({
    store,
    orgId: input.orgId,
    companyId: input.companyId,
    website: row.website,
    telegramContactJson: row.telegram_contact_json,
    now,
  });
  const endpointMatches = username !== null
    && await telegramIdentifierDigest(
      configuredDataKey(input.env),
      'business-endpoint',
      username,
    ) === row.endpoint_digest;
  const eligible = endpointMatches
    && row.is_enabled === 1
    && row.can_reply === 1
    && Number.isFinite(inboundAt)
    && Number.isFinite(activeUntil)
    && inboundAt <= now.getTime() + FUTURE_SKEW_MS
    && now.getTime() - inboundAt <= CHAT_ACTIVE_MS
    && activeUntil > now.getTime();
  return {
    bindingId: eligible ? row.binding_id : null,
    activeChatEligible: eligible,
    lastInboundAt,
  };
}

function exactlyOne<T>(items: T[], code: TelegramBusinessErrorCode): T {
  if (items.length !== 1) fail(code);
  return items[0] as T;
}

function connectionScope(orgId: string): string {
  return `${orgId}:business-connection`;
}

function userChatScope(orgId: string): string {
  return `${orgId}:business-owner-chat`;
}

function companyChatScope(orgId: string, companyId: string): string {
  return `${orgId}:${companyId}:company-chat`;
}

interface ParsedVerifiedBusinessEndpoint {
  username: string;
  evidenceIds: string[];
}

function parsedVerifiedBusinessEndpoint(
  telegramContactJson: string,
  now: Date,
  expectedUsername?: string,
): ParsedVerifiedBusinessEndpoint | null {
  try {
    const value = record(JSON.parse(telegramContactJson) as unknown);
    const peer = value?.reason==='bridge_resolved_corporate' && typeof value.peerRef==='string' && /^lrpeer:[a-f0-9]{32}$/u.test(value.peerRef) ? value.peerRef : null;
    const username = peer ?? (typeof value?.username === 'string' && USERNAME_PATTERN.test(value.username)
      ? value.username.toLowerCase()
      : null);
    const confidence = typeof value?.confidence === 'number' && Number.isFinite(value.confidence)
      ? value.confidence
      : 0;
    const evidenceIds = Array.isArray(value?.evidenceIds)
      ? value.evidenceIds.filter((item): item is string => (
        typeof item === 'string' && /^[A-Za-z0-9_-]{1,80}$/u.test(item)
      ))
      : [];
    const verifiedAt = typeof value?.verifiedAt === 'string' ? Date.parse(value.verifiedAt) : Number.NaN;
    let endpoint: URL | null = null;
    try { endpoint = typeof value?.url === 'string' ? new URL(value.url) : null; } catch { endpoint = null; }
    const segments = endpoint?.pathname.split('/').filter(Boolean) ?? [];
    if (value?.type !== 'business'
      || username === null
      || (expectedUsername !== undefined && username !== expectedUsername.toLowerCase())
      || confidence < 0.8 || confidence > 1
      || evidenceIds.length === 0 || evidenceIds.length > 10
      || new Set(evidenceIds).size !== evidenceIds.length
      || !Number.isFinite(verifiedAt)
      || verifiedAt > now.getTime() + FUTURE_SKEW_MS
      || now.getTime() - verifiedAt > 30 * 24 * 60 * 60_000
      || (!peer && (endpoint?.protocol !== 'https:'
      || !['t.me', 'telegram.me'].includes(endpoint.hostname.toLowerCase())
      || segments.length !== 1
      || segments[0]?.toLowerCase() !== username))) return null;
    return { username, evidenceIds };
  } catch {
    return null;
  }
}

function normalizedHost(value: string | null): string | null {
  if (!value) return null;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return null;
  }
}

function evidenceValueMatchesUsername(value: string, username: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === username || normalized === `@${username}`) return true;
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    return url.protocol === 'https:'
      && ['t.me', 'telegram.me'].includes(url.hostname.toLowerCase())
      && segments.length === 1
      && segments[0]?.toLowerCase() === username;
  } catch {
    return false;
  }
}

async function verifiedBusinessEndpointUsername(input: {
  store: LeadRadarTelegramBusinessStore;
  orgId: string;
  companyId: string;
  website: string | null;
  telegramContactJson: string;
  now: Date;
  expectedUsername?: string;
}): Promise<string | null> {
  const endpoint = parsedVerifiedBusinessEndpoint(
    input.telegramContactJson,
    input.now,
    input.expectedUsername,
  );
  if (!endpoint || isTelegramPeerRef(endpoint.username)) return null;
  const rows = await input.store.findCompanyEvidenceByIds(
    input.orgId,
    input.companyId,
    endpoint.evidenceIds,
  );
  if (rows.length !== endpoint.evidenceIds.length) return null;
  const ids = new Set(rows.map((row) => row.id));
  if (endpoint.evidenceIds.some((id) => !ids.has(id))) return null;
  const companyHost = normalizedHost(input.website);
  const oldest = input.now.getTime() - 30 * 24 * 60 * 60_000;
  const newest = input.now.getTime() + FUTURE_SKEW_MS;
  for (const row of rows) {
    const observedAt = Date.parse(row.observed_at);
    const sourceHost = normalizedHost(row.source_url);
    const sourceBound = row.source_type === 'official_open_data'
      || (row.source_type === 'company_website'
        && companyHost !== null && sourceHost === companyHost);
    if (row.org_id !== input.orgId
      || row.company_id !== input.companyId
      || row.classification !== 'fact'
      || Number(row.confidence) < 0.8
      || !/(?:^|\.)telegram(?:\.|$)/iu.test(row.field_path)
      || !evidenceValueMatchesUsername(row.value, endpoint.username)
      || !sourceBound
      || !Number.isFinite(observedAt)
      || observedAt < oldest
      || observedAt > newest) return null;
  }
  return endpoint.username;
}

export async function handleTelegramBusinessUpdate(input: {
  db: D1Database;
  env: LeadRadarTelegramBusinessEnv;
  update: ParsedTelegramBusinessUpdate;
  now?: Date;
  isOrgAllowed?: (orgId: string) => boolean;
}): Promise<{ status: 'ignored' | 'processed' | 'replayed'; orgId?: string }> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const dataKey = configuredDataKey(input.env);
  const store = new LeadRadarTelegramBusinessStore(input.db);
  const update = input.update;
  const allowedOrganizations = new Set((input.env.LEAD_RADAR_ALLOWED_ORGS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^(?:owner_[a-f0-9]{24}|org_[a-f0-9]{32,64})$/u.test(value)));
  const orgAllowed = input.isOrgAllowed ?? ((orgId: string) => allowedOrganizations.has(orgId));
  if (update.kind === 'ignored') return { status: 'ignored' };
  const updateDigest = await telegramIdentifierDigest(dataKey, 'webhook-update', update.updateId);

  if (update.kind === 'start') {
    const nonceHash = await telegramIdentifierDigest(dataKey, 'connect-nonce', update.token);
    const nonce = await store.findNonceForStart(update.lookupKey, nonceHash);
    if (!nonce || nonce.expires_at <= nowIso) {
      fail('telegram_business_nonce_expired_or_used');
    }
    if (!orgAllowed(nonce.org_id)) fail('telegram_business_org_not_allowed');
    const userChatDigest = await telegramIdentifierDigest(dataKey, 'user-chat', update.userChatId);
    if (nonce.used_at !== null) {
      if (nonce.user_chat_digest !== userChatDigest || nonce.start_update_digest !== updateDigest) {
        fail('telegram_business_nonce_expired_or_used');
      }
      await store.claimWebhookUpdate(nonce.org_id, updateDigest, update.kind, nowIso);
      return { status: 'replayed', orgId: nonce.org_id };
    }
    const claimed = await store.claimStartNonce({
      orgId: nonce.org_id,
      id: nonce.id,
      nonceHash,
      userChatDigest,
      startUpdateDigest: updateDigest,
      now: nowIso,
    });
    if (!claimed) fail('telegram_business_nonce_expired_or_used');
    await store.claimWebhookUpdate(nonce.org_id, updateDigest, update.kind, nowIso);
    return { status: 'processed', orgId: nonce.org_id };
  }

  const connectionDigest = await telegramIdentifierDigest(dataKey, 'business-connection', update.connectionId);
  const connections = await store.findConnectionByDigest(connectionDigest);

  if (update.kind === 'business_connection') {
    const lifecycleEventTime = Date.parse(update.connectedAt);
    if (!Number.isFinite(lifecycleEventTime)
      || lifecycleEventTime > now.getTime() + FUTURE_SKEW_MS) {
      fail('telegram_business_invalid_update');
    }
    const userChatDigest = await telegramIdentifierDigest(dataKey, 'user-chat', update.userChatId);
    if (connections.length > 1) fail('telegram_business_connection_unassociated');
    const current = connections[0];
    if (current) {
      if (!orgAllowed(current.org_id)) fail('telegram_business_org_not_allowed');
      if (current.user_chat_digest !== userChatDigest) fail('telegram_business_connection_unassociated');
      if (await store.hasWebhookUpdate(current.org_id, updateDigest)) {
        return { status: 'replayed', orgId: current.org_id };
      }
      const updated = await store.updateConnectionLifecycle({
        orgId: current.org_id,
        id: current.id,
        isEnabled: update.isEnabled,
        canReply: update.canReply,
        updateId: Number(update.updateId),
        eventAt: update.connectedAt,
        observedAt: nowIso,
      });
      const fresh = await store.claimWebhookUpdate(current.org_id, updateDigest, update.kind, nowIso);
      if (!fresh) return { status: 'replayed', orgId: current.org_id };
      return { status: updated ? 'processed' : 'replayed', orgId: current.org_id };
    }

    const pending = await store.findPendingNoncesByUserDigest(userChatDigest, nowIso);
    if (pending.length > 1) fail('telegram_business_nonce_ambiguous');
    const nonce = exactlyOne(pending, 'telegram_business_connection_unassociated');
    if (!orgAllowed(nonce.org_id)) fail('telegram_business_org_not_allowed');
    const encryptedConnection = await encryptTelegramIdentifier(
      dataKey,
      connectionScope(nonce.org_id),
      update.connectionId,
    );
    const encryptedUserChat = await encryptTelegramIdentifier(
      dataKey,
      userChatScope(nonce.org_id),
      update.userChatId,
    );
    const bound = await store.insertConnectionFromNonce({
      id: entityId('lrtgc_'),
      org_id: nonce.org_id,
      nonceId: nonce.id,
      connection_digest: connectionDigest,
      connection_ciphertext: encryptedConnection.ciphertext,
      connection_iv: encryptedConnection.iv,
      user_chat_digest: userChatDigest,
      user_chat_ciphertext: encryptedUserChat.ciphertext,
      user_chat_iv: encryptedUserChat.iv,
      is_enabled: update.isEnabled ? 1 : 0,
      can_reply: update.canReply ? 1 : 0,
      lifecycle_update_id: Number(update.updateId),
      lifecycle_event_at: update.connectedAt,
      connectedAt: update.connectedAt,
      updatedAt: nowIso,
      disabledAt: update.isEnabled ? null : nowIso,
    });
    if (!bound) fail('telegram_business_nonce_expired_or_used');
    await store.claimWebhookUpdate(nonce.org_id, updateDigest, update.kind, nowIso);
    return { status: 'processed', orgId: nonce.org_id };
  }

  const connection = exactlyOne(connections, 'telegram_business_connection_unassociated');
  if (!orgAllowed(connection.org_id)) fail('telegram_business_org_not_allowed');
  if (connection.is_enabled !== 1) fail('telegram_business_connection_disabled');
  if (await store.hasWebhookUpdate(connection.org_id, updateDigest)) {
    return { status: 'replayed', orgId: connection.org_id };
  }
  const inboundTime = Date.parse(update.inboundAt);
  if (!Number.isFinite(inboundTime)
    || inboundTime > now.getTime() + FUTURE_SKEW_MS
    || now.getTime() - inboundTime > CHAT_ACTIVE_MS) {
    fail('telegram_business_invalid_update');
  }
  const normalizedUsername = update.username.toLowerCase();
  const matchingCompanies: TelegramBusinessCompanyRow[] = [];
  for (const candidate of await store.findBusinessCompaniesByUsername(
    connection.org_id,
    normalizedUsername,
  )) {
    if (await verifiedBusinessEndpointUsername({
      store,
      orgId: connection.org_id,
      companyId: candidate.id,
      website: candidate.website,
      telegramContactJson: candidate.telegram_contact_json,
      now,
      expectedUsername: normalizedUsername,
    }) !== null) matchingCompanies.push(candidate);
  }
  if (matchingCompanies.length > 1) fail('telegram_business_company_ambiguous');
  const company = exactlyOne(matchingCompanies, 'telegram_business_company_unmatched');
  const encryptedChat = await encryptTelegramIdentifier(
    dataKey,
    companyChatScope(connection.org_id, company.id),
    update.chatId,
  );
  const chatDigest = await telegramIdentifierDigest(dataKey, 'company-chat', update.chatId);
  const endpointDigest = await telegramIdentifierDigest(dataKey, 'business-endpoint', normalizedUsername);
  const bound = await store.upsertCompanyChat({
    id: entityId('lrtgb_'),
    orgId: connection.org_id,
    connectionId: connection.id,
    companyId: company.id,
    chatDigest,
    chatCiphertext: encryptedChat.ciphertext,
    chatIv: encryptedChat.iv,
    endpointDigest,
    inboundAt: update.inboundAt,
    activeUntil: new Date(inboundTime + CHAT_ACTIVE_MS).toISOString(),
    now: nowIso,
  });
  if (!bound) fail('telegram_business_company_ambiguous');
  const fresh = await store.claimWebhookUpdate(connection.org_id, updateDigest, update.kind, nowIso);
  if (!fresh) return { status: 'replayed', orgId: connection.org_id };
  return { status: 'processed', orgId: connection.org_id };
}

function validBotToken(value: string): boolean {
  return value.length >= 20 && value.length <= 160 && !/[\s/\\]/u.test(value);
}

function boundedMessage(value: string): string {
  const characters = [...value];
  if (value.trim().length < 1 || characters.length > 4096 || value.includes(String.fromCharCode(0))) {
    fail('telegram_business_invalid_input');
  }
  return value;
}

function dailySendLimit(value: string | undefined): number {
  const parsed = Number(value ?? '10');
  return Number.isInteger(parsed) ? Math.max(1, Math.min(100, parsed)) : 10;
}

function validOperatorId(value: string): boolean {
  return value.length >= 3 && value.length <= 254 && !containsAsciiControl(value);
}

async function sendPayloadDigest(
  dataKey: string,
  orgId: string,
  companyId: string,
  bindingId: string,
  text: string,
): Promise<string> {
  return telegramIdentifierDigest(
    dataKey,
    'send-payload',
    JSON.stringify([orgId, companyId, bindingId, text]),
  );
}

async function requireVerifiedSendTarget(input: {
  store: LeadRadarTelegramBusinessStore;
  dataKey: string;
  orgId: string;
  companyId: string;
  bindingId: string;
  now: Date;
}): Promise<TelegramBusinessSendTargetRow> {
  const target = await input.store.getSendTarget(input.orgId, input.companyId, input.bindingId);
  if (!target) fail('telegram_business_company_unmatched');
  if (target.is_enabled !== 1) fail('telegram_business_connection_disabled');
  if (target.can_reply !== 1) fail('telegram_business_reply_not_allowed');
  const currentUsername = await verifiedBusinessEndpointUsername({
    store: input.store,
    orgId: input.orgId,
    companyId: input.companyId,
    website: target.website,
    telegramContactJson: target.telegram_contact_json,
    now: input.now,
  });
  if (currentUsername === null
    || await telegramIdentifierDigest(input.dataKey, 'business-endpoint', currentUsername) !== target.endpoint_digest) {
    fail('telegram_business_company_unmatched');
  }
  const inboundAt = Date.parse(target.last_inbound_at);
  const activeUntil = Date.parse(target.active_until);
  if (!Number.isFinite(inboundAt) || !Number.isFinite(activeUntil)
    || inboundAt > input.now.getTime() + FUTURE_SKEW_MS
    || input.now.getTime() - inboundAt > CHAT_ACTIVE_MS
    || activeUntil <= input.now.getTime()) {
    fail('telegram_business_chat_inactive');
  }
  return target;
}

async function readBoundedJson(response: Response): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (!Number.isFinite(declaredLength) || declaredLength < 0
    || declaredLength > MAX_BOT_API_RESPONSE_BYTES) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_BOT_API_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return record(JSON.parse(TEXT_DECODER.decode(bytes)) as unknown);
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function callTelegramBusinessSendMessage(input: {
  botToken: string;
  businessConnectionId: string;
  chatId: string;
  text: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<string> {
  if (!validBotToken(input.botToken)
    || !validIdentifier(input.businessConnectionId)
    || !validIdentifier(input.chatId)) {
    fail('telegram_business_not_configured');
  }
  const url = new URL(`https://${BOT_API_HOST}/bot${input.botToken}/sendMessage`);
  if (url.protocol !== 'https:' || url.hostname !== BOT_API_HOST || url.port !== '') {
    fail('telegram_business_not_configured');
  }
  const timeoutMs = Math.min(Math.max(input.timeoutMs ?? BOT_API_TIMEOUT_MS, 1_000), 10_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (input.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_connection_id: input.businessConnectionId,
        chat_id: input.chatId,
        text: input.text,
        link_preview_options: { is_disabled: true },
      }),
      signal: controller.signal,
    });
    const payload = await readBoundedJson(response);
    const result = record(payload?.result);
    const messageId = safeInteger(result?.message_id);
    if (!response.ok || payload?.ok !== true || messageId === null) {
      fail('telegram_business_provider_failed');
    }
    return String(messageId);
  } catch (error) {
    if (error instanceof LeadRadarTelegramBusinessError) throw error;
    return fail('telegram_business_provider_failed');
  } finally {
    clearTimeout(timer);
  }
}

export async function createTelegramBusinessSendApproval(input: {
  db: D1Database;
  env: LeadRadarTelegramBusinessEnv;
  orgId: string;
  companyId: string;
  bindingId: string;
  text: string;
  operatorId: string;
  now?: Date;
}): Promise<TelegramBusinessApprovalGrant> {
  if (input.env.LEAD_RADAR_CONTACT_ENABLED !== 'true') fail('telegram_business_paused');
  assertOrgId(input.orgId);
  if (!/^[A-Za-z0-9:_-]{1,80}$/u.test(input.companyId)
    || !/^lrtgb_[0-9a-f]{32}$/u.test(input.bindingId)
    || !validOperatorId(input.operatorId)) fail('telegram_business_invalid_input');
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const text = boundedMessage(input.text);
  const dataKey = configuredDataKey(input.env);
  if (!validBotToken(input.env.LEAD_RADAR_TELEGRAM_BOT_TOKEN ?? '')) {
    fail('telegram_business_not_configured');
  }
  const store = new LeadRadarTelegramBusinessStore(input.db);
  await requireVerifiedSendTarget({
    store,
    dataKey,
    orgId: input.orgId,
    companyId: input.companyId,
    bindingId: input.bindingId,
    now,
  });
  if (await store.hasAmbiguousSendEffect(input.orgId, input.bindingId)) {
    fail('telegram_business_send_ambiguous');
  }
  const approvalToken = `lrap_${bytesToBase64Url(randomBytes(32))}`;
  const expiresAt = new Date(now.getTime() + APPROVAL_TTL_MS).toISOString();
  const [tokenDigest, payloadDigest, operatorDigest] = await Promise.all([
    telegramIdentifierDigest(dataKey, 'send-approval-token', approvalToken),
    sendPayloadDigest(dataKey, input.orgId, input.companyId, input.bindingId, text),
    telegramIdentifierDigest(dataKey, 'send-operator', input.operatorId.trim().toLowerCase()),
  ]);
  await store.createSendApproval({
    id: entityId('lrtga_'),
    orgId: input.orgId,
    companyId: input.companyId,
    bindingId: input.bindingId,
    tokenDigest,
    payloadDigest,
    operatorDigest,
    expiresAt,
    now: nowIso,
  });
  return { approvalToken, expiresAt };
}

function replayResult(effect: TelegramBusinessSendEffectRow, payloadDigest: string, approvalDigest: string): TelegramBusinessSendResult {
  if (effect.payload_digest !== payloadDigest || effect.approval_digest !== approvalDigest) {
    fail('telegram_business_idempotency_conflict');
  }
  if (effect.status === 'sent') return { status: 'replayed', effectId: effect.id };
  if (effect.status === 'ambiguous') return { status: 'ambiguous', effectId: effect.id };
  if (effect.status === 'canceled') fail('telegram_business_send_canceled');
  return fail('telegram_business_send_in_flight');
}

export async function sendApprovedTelegramBusinessMessage(input: {
  db: D1Database;
  env: LeadRadarTelegramBusinessEnv;
  orgId: string;
  companyId: string;
  bindingId: string;
  text: string;
  idempotencyKey: string;
  approvalToken: string;
  operatorId: string;
  now?: Date;
  fetchImpl?: typeof fetch;
  /** Test-only concurrency hook; production callers never provide it. */
  beforeDispatch?: () => void | Promise<void>;
}): Promise<TelegramBusinessSendResult> {
  if (input.env.LEAD_RADAR_CONTACT_ENABLED !== 'true') {
    fail('telegram_business_paused');
  }
  assertOrgId(input.orgId);
  if (!/^[A-Za-z0-9:_-]{1,80}$/u.test(input.companyId)
    || !/^lrtgb_[0-9a-f]{32}$/u.test(input.bindingId)
    || !/^[A-Za-z0-9:_-]{8,160}$/u.test(input.idempotencyKey)
    || !APPROVAL_TOKEN_PATTERN.test(input.approvalToken)
    || !validOperatorId(input.operatorId)) {
    fail('telegram_business_invalid_input');
  }
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const text = boundedMessage(input.text);
  const dataKey = configuredDataKey(input.env);
  const botToken = input.env.LEAD_RADAR_TELEGRAM_BOT_TOKEN ?? '';
  if (!validBotToken(botToken)) fail('telegram_business_not_configured');
  const store = new LeadRadarTelegramBusinessStore(input.db);
  await requireVerifiedSendTarget({
    store,
    dataKey,
    orgId: input.orgId,
    companyId: input.companyId,
    bindingId: input.bindingId,
    now,
  });
  const [idempotencyKeyDigest, payloadDigest, approvalDigest, operatorDigest] = await Promise.all([
    telegramIdentifierDigest(dataKey, 'send-idempotency', input.idempotencyKey),
    sendPayloadDigest(dataKey, input.orgId, input.companyId, input.bindingId, text),
    telegramIdentifierDigest(dataKey, 'send-approval-token', input.approvalToken),
    telegramIdentifierDigest(dataKey, 'send-operator', input.operatorId.trim().toLowerCase()),
  ]);
  const previous = await store.findSendEffect(input.orgId, idempotencyKeyDigest);
  if (previous) return replayResult(previous, payloadDigest, approvalDigest);

  const approval = await store.findSendApproval(input.orgId, approvalDigest);
  if (!approval
    || approval.company_id !== input.companyId
    || approval.binding_id !== input.bindingId
    || approval.payload_digest !== payloadDigest
    || approval.operator_digest !== operatorDigest
    || approval.consumed_at !== null
    || approval.expires_at <= nowIso) fail('telegram_business_approval_required');

  const effectId = entityId('lrtgs_');
  const dailyWindowStart = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const cooldownAfter = new Date(now.getTime() - 30_000).toISOString();
  const created = await store.createSendEffect({
    id: effectId,
    orgId: input.orgId,
    companyId: input.companyId,
    bindingId: input.bindingId,
    idempotencyKeyDigest,
    payloadDigest,
    approvalTokenDigest: approvalDigest,
    operatorDigest,
    now: nowIso,
    dailyWindowStart,
    dailyLimit: dailySendLimit(input.env.LEAD_RADAR_CONTACT_DAILY_LIMIT),
    cooldownAfter,
  });
  if (!created) {
    const concurrent = await store.findSendEffect(input.orgId, idempotencyKeyDigest);
    if (concurrent) return replayResult(concurrent, payloadDigest, approvalDigest);
    await requireVerifiedSendTarget({
      store,
      dataKey,
      orgId: input.orgId,
      companyId: input.companyId,
      bindingId: input.bindingId,
      now,
    });
    const currentApproval = await store.findSendApproval(input.orgId, approvalDigest);
    if (!currentApproval || currentApproval.consumed_at !== null) {
      fail('telegram_business_approval_required');
    }
    if (await store.hasAmbiguousSendEffect(input.orgId, input.bindingId)) {
      fail('telegram_business_send_ambiguous');
    }
    fail('telegram_business_rate_limited');
  }

  let dispatchTarget: TelegramBusinessSendTargetRow;
  try {
    dispatchTarget = await requireVerifiedSendTarget({
      store,
      dataKey,
      orgId: input.orgId,
      companyId: input.companyId,
      bindingId: input.bindingId,
      now,
    });
  } catch (error) {
    await store.markSendCanceled(input.orgId, effectId, nowIso);
    throw error;
  }
  let businessConnectionId: string;
  let chatId: string;
  try {
    [businessConnectionId, chatId] = await Promise.all([
      decryptTelegramIdentifier(dataKey, connectionScope(input.orgId), {
        ciphertext: dispatchTarget.connection_ciphertext,
        iv: dispatchTarget.connection_iv,
      }),
      decryptTelegramIdentifier(dataKey, companyChatScope(input.orgId, input.companyId), {
        ciphertext: dispatchTarget.chat_ciphertext,
        iv: dispatchTarget.chat_iv,
      }),
    ]);
  } catch {
    await store.markSendCanceled(input.orgId, effectId, nowIso);
    fail('telegram_business_send_canceled');
  }
  await input.beforeDispatch?.();
  const dispatching = await store.markSendDispatching({
    orgId: input.orgId,
    companyId: input.companyId,
    bindingId: input.bindingId,
    expectedWebsite: dispatchTarget.website,
    expectedTelegramContactJson: dispatchTarget.telegram_contact_json,
    id: effectId,
    now: nowIso,
  });
  if (!dispatching) {
    await store.markSendCanceled(input.orgId, effectId, nowIso);
    fail('telegram_business_send_canceled');
  }

  let providerMessageId: string;
  try {
    providerMessageId = await callTelegramBusinessSendMessage({
      botToken,
      businessConnectionId,
      chatId,
      text,
      fetchImpl: input.fetchImpl,
    });
  } catch {
    try { await store.markSendAmbiguous(input.orgId, effectId, nowIso); } catch { /* best effort */ }
    return { status: 'ambiguous', effectId };
  }
  let providerMessageDigest: string;
  try {
    providerMessageDigest = await telegramIdentifierDigest(
      dataKey,
      'provider-message',
      providerMessageId,
    );
  } catch {
    try { await store.markSendAmbiguous(input.orgId, effectId, nowIso); } catch { /* best effort */ }
    return { status: 'ambiguous', effectId };
  }
  let recorded = false;
  try {
    recorded = await store.markSendSent(
      input.orgId,
      effectId,
      providerMessageDigest,
      nowIso,
    );
  } catch {
    // Provider acceptance is already possible. Never surface a retryable
    // transport failure after that boundary; reconciliation owns the row.
  }
  if (!recorded) {
    try { await store.markSendAmbiguous(input.orgId, effectId, nowIso); } catch { /* best effort */ }
    return { status: 'ambiguous', effectId };
  }
  return { status: 'sent', effectId };
}

export function buildTelegramCorporateDraftLink(
  contact: LeadRadarTelegramContact,
  draft: string,
  now = new Date(),
): string | null {
  if (contact.type !== 'business'
    || !USERNAME_PATTERN.test(contact.username)
    || contact.confidence < 0.8
    || contact.evidenceIds.length === 0) return null;
  let endpoint: URL;
  try { endpoint = new URL(contact.url); } catch { return null; }
  const pathUsername = endpoint.pathname.split('/').filter(Boolean)[0] ?? '';
  if (endpoint.protocol !== 'https:'
    || !['t.me', 'telegram.me'].includes(endpoint.hostname.toLowerCase())
    || endpoint.pathname.split('/').filter(Boolean).length !== 1
    || pathUsername.toLowerCase() !== contact.username.toLowerCase()) return null;
  const verifiedAt = Date.parse(contact.verifiedAt);
  if (!Number.isFinite(verifiedAt)
    || verifiedAt > now.getTime() + FUTURE_SKEW_MS
    || now.getTime() - verifiedAt > 30 * 24 * 60 * 60_000) return null;
  const text = draft;
  if (text.trim().length === 0 || [...text].length > 4096 || text.includes('\u0000')) return null;
  const url = new URL(`https://t.me/${contact.username}`);
  url.searchParams.set('text', text);
  return url.toString();
}

export async function buildVerifiedTelegramCorporateDraftLink(input: {
  db: D1Database;
  orgId: string;
  companyId: string;
  website: string | null;
  contact: LeadRadarTelegramContact;
  draft: string;
  now?: Date;
}): Promise<string | null> {
  const now = input.now ?? new Date();
  if ((await verifiedResolvedCorporateCompanies({ db: input.db, orgId: input.orgId,
    companies: [{ companyId: input.companyId, contact: input.contact }], now })).has(input.companyId)) {
    return buildTelegramCorporateDraftLink(input.contact, input.draft, now);
  }
  const username = await verifiedBusinessEndpointUsername({
    store: new LeadRadarTelegramBusinessStore(input.db),
    orgId: input.orgId,
    companyId: input.companyId,
    website: input.website,
    telegramContactJson: JSON.stringify(input.contact),
    now,
  });
  return username === null ? null : buildTelegramCorporateDraftLink(input.contact, input.draft, now);
}

/**
 * Campaign selection variant of the same corporate-endpoint proof. All
 * evidence for up to 50 candidates is read in one bounded D1 query, then the
 * exact per-row source/recency/value checks above are applied in memory.
 */
export async function verifiedTelegramCampaignBusinessCompanyIds(input: {
  db: D1Database;
  orgId: string;
  companies: ReadonlyArray<{
    companyId: string;
    website: string | null;
    contact: LeadRadarTelegramContact;
  }>;
  now?: Date;
}): Promise<Set<string>> {
  const now = input.now ?? new Date();
  const parsed = input.companies.flatMap((company) => {
    const endpoint = parsedVerifiedBusinessEndpoint(
      JSON.stringify(company.contact),
      now,
    );
    return endpoint ? [{ ...company, endpoint }] : [];
  });
  const evidenceRows = await new LeadRadarTelegramBusinessStore(input.db)
    .findCompanyEvidenceForCampaignSelection(
      input.orgId,
      parsed.map((company) => ({
        companyId: company.companyId,
        evidenceIds: company.endpoint.evidenceIds,
      })),
    );
  const byCompany = new Map<string, typeof evidenceRows>();
  for (const row of evidenceRows) {
    const current = byCompany.get(row.company_id) ?? [];
    current.push(row);
    byCompany.set(row.company_id, current);
  }
  const verified = await verifiedResolvedCorporateCompanies({ db: input.db, orgId: input.orgId, companies: parsed, now });
  const oldest = now.getTime() - 30 * 24 * 60 * 60_000;
  const newest = now.getTime() + FUTURE_SKEW_MS;
  for (const company of parsed) {
    // An opaque handle is valid only through fresh, account-bound Bridge proof.
    if (isTelegramPeerRef(company.endpoint.username)) continue;
    const rows = byCompany.get(company.companyId) ?? [];
    const ids = new Set(rows.map((row) => row.id));
    const companyHost = normalizedHost(company.website);
    if (rows.length !== company.endpoint.evidenceIds.length
      || company.endpoint.evidenceIds.some((id) => !ids.has(id))) continue;
    const valid = rows.every((row) => {
      const observedAt = Date.parse(row.observed_at);
      const sourceHost = normalizedHost(row.source_url);
      const sourceBound = row.source_type === 'official_open_data'
        || (row.source_type === 'company_website'
          && companyHost !== null && sourceHost === companyHost);
      return row.org_id === input.orgId
        && row.company_id === company.companyId
        && row.classification === 'fact'
        && Number(row.confidence) >= 0.8
        && /(?:^|\.)telegram(?:\.|$)/iu.test(row.field_path)
        && evidenceValueMatchesUsername(row.value, company.endpoint.username)
        && sourceBound
        && Number.isFinite(observedAt)
        && observedAt >= oldest
        && observedAt <= newest;
    });
    if (valid) verified.add(company.companyId);
  }
  return verified;
}

export async function hasTelegramBusinessTransportSchema(db: D1Database): Promise<boolean> {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM sqlite_schema
    WHERE type = 'table' AND name IN (
      'lead_radar_tg_connect_nonces',
      'lead_radar_tg_business_connections',
      'lead_radar_tg_company_chats',
      'lead_radar_tg_webhook_updates',
      'lead_radar_tg_send_approvals',
      'lead_radar_tg_send_effects'
    )`).first<{ count: number }>();
  return Number(row?.count ?? 0) === 6;
}

export async function maintainTelegramBusinessTransport(
  db: D1Database,
  now = new Date(),
): Promise<void> {
  const before = (milliseconds: number) => new Date(now.getTime() - milliseconds).toISOString();
  await new LeadRadarTelegramBusinessStore(db).maintainTransport({
    now: now.toISOString(),
    staleReservedBefore: before(10 * 60_000),
    staleDispatchingBefore: before(2 * 60_000),
    nonceBefore: before(24 * 60 * 60_000),
    updateBefore: before(7 * 24 * 60 * 60_000),
    // The encrypted chat id has no purpose after Telegram's 24-hour business
    // reply window closes, so delete it immediately at `active_until`.
    chatBefore: now.toISOString(),
    terminalEffectBefore: before(30 * 24 * 60 * 60_000),
    disabledConnectionBefore: before(30 * 24 * 60 * 60_000),
  });
}

export async function purgeTelegramBusinessCompanyContact(
  db: D1Database,
  orgId: string,
  companyId: string,
  now = new Date(),
): Promise<void> {
  assertOrgId(orgId);
  if (!/^[A-Za-z0-9:_-]{1,80}$/u.test(companyId)) fail('telegram_business_invalid_input');
  await new LeadRadarTelegramBusinessStore(db)
    .cancelCompanyOutreachAndDeleteChats(orgId, companyId, now.toISOString());
}

export async function purgeTelegramBusinessOrganization(
  db: D1Database,
  orgId: string,
): Promise<void> {
  assertOrgId(orgId);
  await new LeadRadarTelegramBusinessStore(db).purgeOrganizationTransport(orgId);
}

export function telegramBusinessConnectionIsReplyCapable(connection: TelegramBusinessConnectionRow): boolean {
  return connection.is_enabled === 1 && connection.can_reply === 1;
}
