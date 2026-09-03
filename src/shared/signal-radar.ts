/**
 * Signal Radar — shared contract between the admin UI and the Pages functions.
 *
 * Signal Radar is the demand side: it watches Telegram channels and groups for
 * people asking for digital services, while Lead Radar is the supply side that
 * goes company -> website -> phone -> decision maker. The two share the org_id
 * ownership boundary and nothing else, so nothing here references companies.
 */

import type { SignalService } from '../../functions/platform/lead-radar/signal-triage';

export const SIGNAL_TARGET_KINDS = ['channel', 'group', 'unknown'] as const;
export type SignalTargetKind = typeof SIGNAL_TARGET_KINDS[number];

export const SIGNAL_TARGET_STATUSES = [
  'candidate', 'watching', 'probation', 'active', 'ignored', 'left',
] as const;
export type SignalTargetStatus = typeof SIGNAL_TARGET_STATUSES[number];

export const SIGNAL_LEAD_STATES = [
  'new', 'drafted', 'approved', 'sent', 'dismissed', 'failed',
] as const;
export type SignalLeadState = typeof SIGNAL_LEAD_STATES[number];

/**
 * How far automation may go on its own.
 *   off      — nothing is added or joined; the operator drives everything
 *   discover — crawl the web, score candidates, join nothing
 *   channels — also start reading channels (free, no join involved)
 *   join     — also join groups, under quota, probation and auto-leave
 * Default is `discover`: it proves the funnel without touching the account.
 */
export const SIGNAL_AUTOJOIN_MODES = ['off', 'discover', 'channels', 'join'] as const;
export type SignalAutojoinMode = typeof SIGNAL_AUTOJOIN_MODES[number];
export const SIGNAL_DEFAULT_AUTOJOIN_MODE: SignalAutojoinMode = 'discover';

export const SIGNAL_TARGET_STATUS_LABELS: Record<SignalTargetStatus, string> = {
  candidate: 'Кандидат',
  watching: 'Наблюдаем',
  probation: 'Испытательный',
  active: 'Активен',
  ignored: 'Пропущен',
  left: 'Вышли',
};

export const SIGNAL_LEAD_STATE_LABELS: Record<SignalLeadState, string> = {
  new: 'Новый',
  drafted: 'Черновик',
  approved: 'Одобрен',
  sent: 'Отправлен',
  dismissed: 'Отклонён',
  failed: 'Ошибка',
};

export const SIGNAL_TARGET_KIND_LABELS: Record<SignalTargetKind, string> = {
  channel: 'Канал',
  group: 'Группа',
  unknown: 'Неизвестно',
};

export interface SignalTarget {
  id: string;
  orgId: string;
  slug: string;
  url: string;
  kind: SignalTargetKind;
  title: string | null;
  status: SignalTargetStatus;
  score: number;
  source: string;
  members: number | null;
  messagesSeen: number;
  leadsSeen: number;
  joinAttempts: number;
  nextActionAt: string | null;
  joinedAt: string | null;
  probationUntil: string | null;
  lastPostAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SignalLead {
  id: string;
  orgId: string;
  postId: string;
  targetId: string;
  /** Which target this came from, denormalised for the inbox list. */
  targetTitle: string | null;
  targetSlug: string | null;
  service: SignalService | null;
  score: number;
  state: SignalLeadState;
  authorLabel: string | null;
  authorHandle: string | null;
  quote: string;
  draftText: string | null;
  sentAt: string | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SignalRadarOverview {
  installed: boolean;
  /** Flat mirror of `modeState.mode` — kept so older clients keep working. */
  mode: SignalAutojoinMode;
  /** Where that mode came from, so the UI can say why a switch did nothing. */
  modeState: SignalModeState;
  /** Manual-scan cooldown window for this operator. */
  scan: SignalScanStatus;
  /** What the deploy can actually do. Lets the UI explain a dead button. */
  runtime: SignalRadarRuntime;
  totals: {
    targets: number;
    watching: number;
    probation: number;
    active: number;
    leadsNew: number;
    leadsSent: number;
    joinQuotaLeft: number;
  };
  targets: SignalTarget[];
  leads: SignalLead[];
}

export const SIGNAL_SERVICE_LIST = [
  'ads', 'seo', 'bots', 'sites', 'apps', 'design', 'crm',
] as const;
export type SignalServiceId = typeof SIGNAL_SERVICE_LIST[number];

export const SIGNAL_SERVICE_LABELS: Record<SignalServiceId, string> = {
  ads: 'Реклама и трафик',
  seo: 'SEO',
  bots: 'Боты и автоматизация',
  sites: 'Сайты',
  apps: 'Приложения',
  design: 'Дизайн',
  crm: 'CRM и интеграции',
};

export function signalServiceLabel(service: string | null): string {
  if (!service) return '—';
  return service in SIGNAL_SERVICE_LABELS
    ? SIGNAL_SERVICE_LABELS[service as SignalServiceId]
    : service;
}

export function signalTargetUrl(slug: string): string {
  return `https://t.me/${slug}`;
}

export function parseSignalTargetStatus(value: unknown): SignalTargetStatus | null {
  return SIGNAL_TARGET_STATUSES.includes(value as SignalTargetStatus)
    ? value as SignalTargetStatus
    : null;
}

export function parseSignalLeadState(value: unknown): SignalLeadState | null {
  return SIGNAL_LEAD_STATES.includes(value as SignalLeadState)
    ? value as SignalLeadState
    : null;
}

export function parseSignalAutojoinMode(value: unknown): SignalAutojoinMode | null {
  return SIGNAL_AUTOJOIN_MODES.includes(value as SignalAutojoinMode)
    ? value as SignalAutojoinMode
    : null;
}

/**
 * Autojoin mode as the operator sees it. `source` matters: the UI has to say
 * whether the switch it is showing comes from the database, from the deploy
 * config, or from the built-in default — otherwise "I changed it and nothing
 * happened" is undebuggable.
 */
export interface SignalModeState {
  mode: SignalAutojoinMode;
  source: 'setting' | 'env' | 'default';
  updatedAt: string | null;
}

/** `system_settings` key holding the runtime mode. Migration 0003 owns it. */
export const SIGNAL_MODE_SETTING_KEY = 'signal_radar_mode';

/** `system_settings` key holding the manual-scan dedup cursor. */
export const SIGNAL_SCAN_CURSOR_SETTING_KEY = 'signal_radar_scan_cursor';

/** Manual scans are rate-limited so a double click cannot burn the quota. */
export const SIGNAL_SCAN_COOLDOWN_MS = 5 * 60 * 1000;

export const SIGNAL_SCAN_QUEUE_SCHEMA = 'gptbot.signal-radar.scan.v1' as const;

const ORG_ID_PATTERN = /^(?:owner_[a-f0-9]{24}|org_[a-f0-9]{32,64})$/u;

export interface SignalScanQueueMessage {
  schema: typeof SIGNAL_SCAN_QUEUE_SCHEMA;
  org_id: string;
  requested_by: string;
  requested_at: string;
}

export interface SignalScanStatus {
  /** True while a request made inside the cooldown window is still counted. */
  queued: boolean;
  lastRequestedAt: string | null;
  nextAvailableAt: string | null;
  cooldownMs: number;
}

export interface SignalScanCursor {
  at: string;
  by: string | null;
}

/**
 * The cursor is per organization: one operator clicking twice must not block
 * another tenant's manual scan, and `system_settings` keys are free-form.
 */
export function signalScanCursorKey(orgId: string): string {
  return `${SIGNAL_SCAN_CURSOR_SETTING_KEY}:${orgId}`;
}

/** Derives what the UI may show and do from the stored cursor alone. */
export function signalScanStatus(
  cursor: SignalScanCursor | null,
  now: number,
): SignalScanStatus {
  const idle: SignalScanStatus = {
    queued: false,
    lastRequestedAt: null,
    nextAvailableAt: null,
    cooldownMs: SIGNAL_SCAN_COOLDOWN_MS,
  };
  if (!cursor) return idle;
  const at = Date.parse(cursor.at);
  if (!Number.isFinite(at)) return idle;
  const next = at + SIGNAL_SCAN_COOLDOWN_MS;
  return {
    queued: now < next,
    lastRequestedAt: cursor.at,
    nextAvailableAt: new Date(next).toISOString(),
    cooldownMs: SIGNAL_SCAN_COOLDOWN_MS,
  };
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isIsoStamp(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 20
    && value.length <= 40
    && Number.isFinite(Date.parse(value));
}

export function parseSignalScanQueueMessage(value: unknown): SignalScanQueueMessage | null {
  const message = plainRecord(value);
  if (!message
    || Object.keys(message).sort().join(',') !== 'org_id,requested_at,requested_by,schema'
    || message.schema !== SIGNAL_SCAN_QUEUE_SCHEMA
    || typeof message.org_id !== 'string'
    || !ORG_ID_PATTERN.test(message.org_id)
    || typeof message.requested_by !== 'string'
    || message.requested_by.length > 320
    || !isIsoStamp(message.requested_at)) return null;
  return message as unknown as SignalScanQueueMessage;
}

export function signalScanQueueMessage(input: {
  orgId: string;
  requestedBy: string;
  requestedAt: string;
}): SignalScanQueueMessage {
  const candidate: SignalScanQueueMessage = {
    schema: SIGNAL_SCAN_QUEUE_SCHEMA,
    org_id: input.orgId,
    requested_by: input.requestedBy,
    requested_at: input.requestedAt,
  };
  if (!parseSignalScanQueueMessage(candidate)) {
    throw new Error('invalid_signal_scan_message');
  }
  return candidate;
}

/**
 * The raw post behind a lead. Kept separate from `SignalLead` because it is
 * the only field carrying a stranger's own words at length, and it is the
 * first thing retention deletes — seven days after the post, `post` is null
 * while the lead itself survives. The UI has to cope with that, not assume it.
 */
export interface SignalRadarPost {
  id: string;
  orgId: string;
  targetId: string;
  excerpt: string;
  authorLabel: string | null;
  authorHandle: string | null;
  occurredAt: string;
  verdict: string;
  score: number;
  service: SignalService | null;
  /** Why triage scored it this way. Shown so the operator can disagree. */
  reasons: string[];
  createdAt: string;
}

export interface SignalLeadDetail {
  lead: SignalLead;
  /** Null once retention has purged the raw text. */
  post: SignalRadarPost | null;
}

export type SignalLanguage = 'ru' | 'uz' | 'unknown';

/**
 * Best-effort language of a request, from its own text.
 *
 * There is no language column anywhere in the Signal schema, and inventing one
 * would mean a migration plus a guess we cannot verify. This is derived on
 * read instead: Cyrillic means Russian, Latin in an Uzbek channel means Uzbek,
 * and a genuine mix returns `unknown` so the UI says nothing rather than lying.
 */
export function detectSignalLanguage(text: string): SignalLanguage {
  const letters = text.replace(/[^А-Яа-яЁёA-Za-z]/g, '');
  if (letters.length < 12) return 'unknown';
  const cyrillic = letters.replace(/[^А-Яа-яЁё]/g, '').length;
  const ratio = cyrillic / letters.length;
  if (ratio >= 0.7) return 'ru';
  if (ratio <= 0.05) return 'uz';
  return 'unknown';
}

export const SIGNAL_LANGUAGE_LABELS: Record<SignalLanguage, string> = {
  ru: 'русский',
  uz: 'узбекский',
  unknown: 'не определён',
};

export interface SignalRadarRuntime {
  /** `LEAD_RADAR_SIGNAL_ENABLED === 'true'`. Without it nothing ever scans. */
  enabled: boolean;
  /** The automation queue binding exists, so a manual scan can be enqueued. */
  queueReady: boolean;
}

export interface SignalModeResponse {
  mode: SignalModeState;
}

export interface SignalScanResponse {
  scan: SignalScanStatus;
}

export function parseSignalScanCursor(value: unknown): SignalScanCursor | null {
  const cursor = plainRecord(value);
  if (!cursor || !isIsoStamp(cursor.at)) return null;
  return {
    at: cursor.at,
    by: typeof cursor.by === 'string' ? cursor.by.slice(0, 320) : null,
  };
}

/**
 * Telegram usernames are 5..32 chars of [A-Za-z0-9_]. Same rule as the CHECK
 * constraint in migration 0057 — the UI rejects early rather than failing on write.
 */
export function isSignalSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_]{5,32}$/.test(value);
}

/** Accepts "@slug", "t.me/slug", "https://t.me/slug" and a bare slug. */
export function normalizeSignalSlug(raw: string): string | null {
  const value = (raw ?? '').trim().replace(/^@/, '');
  const withoutScheme = value.replace(/^https?:\/\//i, '').replace(/^(www\.)?t\.me\//i, '');
  const slug = withoutScheme.replace(/^s\//i, '').split(/[/?#]/)[0] ?? '';
  return isSignalSlug(slug) ? slug : null;
}

/** Up to `limit` unique slugs from a free-form paste, order preserved. */
export function parseSignalSlugList(raw: string, limit = 200): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of (raw ?? '').split(/[\s,;]+/)) {
    const slug = normalizeSignalSlug(token);
    if (slug && !seen.has(slug.toLowerCase())) {
      seen.add(slug.toLowerCase());
      out.push(slug);
    }
    if (out.length >= limit) break;
  }
  return out;
}

/* ------------------------------------------------------------ chat surface */

/**
 * The chat surface: rooms a stranger is allowed to write in, as distinct from
 * the post surface, which is about what has already been said.
 *
 * A channel is a megaphone — half a million readers, not one of whom can
 * answer. A group is a room. The operator's real question is not "who is
 * broadcasting about websites" but "where can I write an offer and be read,
 * and get a reply". Different object, different table, different lifecycle.
 *
 * Verified live 2026-09-03: `t.me/s/<group>` serves a profile card (name,
 * about, "N members, M online") and zero messages, while `t.me/s/<channel>`
 * serves ~20 posts. That single difference is why chats cannot ride the 0057
 * funnel — that funnel scores posts, so a group entering it scores nothing and
 * is retired inside two ticks.
 */

export const SIGNAL_CHAT_KINDS = ['group', 'channel', 'unknown'] as const;
export type SignalChatKind = typeof SIGNAL_CHAT_KINDS[number];

export const SIGNAL_CHAT_STATUSES = [
  'new', 'approved', 'queued', 'joined', 'rejected',
] as const;
export type SignalChatStatus = typeof SIGNAL_CHAT_STATUSES[number];

export const SIGNAL_CAN_WRITE_VALUES = ['yes', 'no', 'unknown'] as const;
export type SignalCanWrite = typeof SIGNAL_CAN_WRITE_VALUES[number];

export const SIGNAL_CAN_WRITE_BASES = ['api', 'heuristic', 'operator'] as const;
export type SignalCanWriteBasis = typeof SIGNAL_CAN_WRITE_BASES[number];

export const SIGNAL_CHAT_ACTIVITIES = ['live', 'slow', 'unknown'] as const;
export type SignalChatActivity = typeof SIGNAL_CHAT_ACTIVITIES[number];

export const SIGNAL_CHAT_CONFIDENCES = ['confirmed', 'tentative'] as const;
export type SignalChatConfidence = typeof SIGNAL_CHAT_CONFIDENCES[number];

export interface SignalChat {
  id: string;
  orgId: string;
  slug: string;
  url: string;
  title: string | null;
  about: string | null;
  kind: SignalChatKind;
  /** Which topic pack claimed it: 'ads', 'dev', 'it', 'biz', 'freelance', 'design'. */
  topic: string | null;
  /**
   * How much the room told us.
   *
   * 'confirmed' — it named the trade, or a catalogue filed it under one.
   * 'tentative' — it used one word anyone might use: "сайт", "дизайн", "it".
   *
   * A tentative room is kept, because a studio that never describes itself is
   * still a studio, but it is sorted after the rooms that earned their place
   * and scored below them. Twenty of the thirty-seven rooms the first harvest
   * kept were bakeries and taxi dispatch; every one of them was confident.
   */
  confidence: SignalChatConfidence | null;
  members: number | null;
  /** People in the room right now. The only liveness signal that exists pre-join. */
  online: number | null;
  activity: SignalChatActivity;
  canWrite: SignalCanWrite;
  /**
   * Where `canWrite` came from. 'api' is a measurement (getChat), 'heuristic'
   * is an inference from the room's own text, 'operator' is a human who looked.
   *
   * Stored because the operator is going to act on this column, and an answer
   * with no provenance is not an answer worth an account.
   */
  canWriteBasis: SignalCanWriteBasis | null;
  relevance: number;
  /** Terms that matched, so a bad result can be explained rather than doubted. */
  matched: string[];
  /** Why the filter dropped it. Null means it survived. */
  rejectReason: string | null;
  source: string;
  query: string | null;
  status: SignalChatStatus;
  checkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const SIGNAL_CHAT_KIND_LABELS: Record<SignalChatKind, string> = {
  group: 'Чат',
  channel: 'Канал',
  unknown: 'Неизвестно',
};

export const SIGNAL_CHAT_STATUS_LABELS: Record<SignalChatStatus, string> = {
  new: 'Новый',
  approved: 'Отобран',
  queued: 'В очереди на вступление',
  joined: 'Вступили',
  rejected: 'Отсеян',
};

export const SIGNAL_CAN_WRITE_LABELS: Record<SignalCanWrite, string> = {
  yes: 'Можно писать',
  no: 'Писать нельзя',
  unknown: 'Не известно',
};

export const SIGNAL_CHAT_ACTIVITY_LABELS: Record<SignalChatActivity, string> = {
  live: 'Живой',
  slow: 'Тихий',
  unknown: 'Нет данных',
};

export function parseSignalChatStatus(value: unknown): SignalChatStatus | null {
  return SIGNAL_CHAT_STATUSES.includes(value as SignalChatStatus)
    ? value as SignalChatStatus
    : null;
}

/* ---------------------------------------------------- chat harvest messages */

export const SIGNAL_CHAT_QUEUE_SCHEMA = 'gptbot.signal-radar.chats.v1' as const;

/**
 * Manual harvests are rate-limited, but far more loosely than a scan is: a
 * harvest is a handful of slow, polite catalogue requests rather than a burst
 * of Telegram reads, and the operator is watching a table fill up row by row.
 */
export const SIGNAL_CHAT_HARVEST_COOLDOWN_MS = 60 * 1000;

export interface SignalChatHarvestQueueMessage {
  schema: typeof SIGNAL_CHAT_QUEUE_SCHEMA;
  org_id: string;
  requested_by: string;
  requested_at: string;
  /** Extra queries on top of the stored topic packs. Bounded, validated. */
  keywords: string[];
}

export interface SignalChatHarvestStatus {
  queued: boolean;
  lastRequestedAt: string | null;
  nextAvailableAt: string | null;
  cooldownMs: number;
}

export function signalChatHarvestCursorKey(orgId: string): string {
  return `signal_radar_chat_harvest:${orgId}`;
}

/** `system_settings` key holding the operator's chat-harvest configuration. */
export function signalChatConfigKey(orgId: string): string {
  return `signal_radar_chat_config:${orgId}`;
}

export function parseSignalChatHarvestQueueMessage(
  value: unknown,
): SignalChatHarvestQueueMessage | null {
  const message = plainRecord(value);
  if (!message
    || Object.keys(message).sort().join(',') !== 'keywords,org_id,requested_at,requested_by,schema'
    || message.schema !== SIGNAL_CHAT_QUEUE_SCHEMA
    || typeof message.org_id !== 'string'
    || !ORG_ID_PATTERN.test(message.org_id)
    || typeof message.requested_by !== 'string'
    || message.requested_by.length > 320
    || !isIsoStamp(message.requested_at)
    || !Array.isArray(message.keywords)) return null;
  const keywords = message.keywords
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 60))
    .filter((item) => item.length > 0)
    .slice(0, 40);
  return {
    schema: SIGNAL_CHAT_QUEUE_SCHEMA,
    org_id: message.org_id,
    requested_by: message.requested_by,
    requested_at: message.requested_at,
    keywords,
  };
}

export function signalChatHarvestQueueMessage(input: {
  orgId: string;
  requestedBy: string;
  requestedAt: string;
  keywords: string[];
}): SignalChatHarvestQueueMessage {
  const candidate: SignalChatHarvestQueueMessage = {
    schema: SIGNAL_CHAT_QUEUE_SCHEMA,
    org_id: input.orgId,
    requested_by: input.requestedBy,
    requested_at: input.requestedAt,
    keywords: [...new Set(input.keywords)].slice(0, 40),
  };
  if (!parseSignalChatHarvestQueueMessage(candidate)) {
    throw new Error('invalid_signal_chat_harvest_message');
  }
  return candidate;
}

/** One topic pack as the UI lists it. Labels live on the server so the packs
 *  themselves stay out of the frontend bundle. */
export interface SignalChatTopic {
  id: string;
  label: string;
}

export interface SignalChatCounts {
  total: number;
  groups: number;
  new: number;
  approved: number;
  queued: number;
  joined: number;
  rejected: number;
  writable: number;
}

/** Everything the chats table needs, in one request. */
export interface SignalChatsResponse {
  /** False when migration 0059 is not applied yet. */
  installed: boolean;
  chats: SignalChat[];
  counts: SignalChatCounts | null;
  /** reject reason -> count, so the filter can be tuned instead of trusted. */
  reasons: Array<{ reason: string; count: number }>;
  config: {
    topics: string[];
    keywords: string[];
    city: string;
    minMembers: number;
    minOnline: number;
    minRelevance: number;
    localOnly: boolean;
    limit: number;
  };
  harvest: SignalChatHarvestStatus;
  topics: SignalChatTopic[];
}

/** Derives what the UI may show and do from the stored cursor alone. */
export function signalChatHarvestStatus(
  cursor: { at: string; by: string | null } | null,
  now: number,
): SignalChatHarvestStatus {
  const idle: SignalChatHarvestStatus = {
    queued: false,
    lastRequestedAt: null,
    nextAvailableAt: null,
    cooldownMs: SIGNAL_CHAT_HARVEST_COOLDOWN_MS,
  };
  if (!cursor) return idle;
  const at = Date.parse(cursor.at);
  if (!Number.isFinite(at)) return idle;
  const next = at + SIGNAL_CHAT_HARVEST_COOLDOWN_MS;
  return {
    queued: now < next,
    lastRequestedAt: cursor.at,
    nextAvailableAt: new Date(next).toISOString(),
    cooldownMs: SIGNAL_CHAT_HARVEST_COOLDOWN_MS,
  };
}
