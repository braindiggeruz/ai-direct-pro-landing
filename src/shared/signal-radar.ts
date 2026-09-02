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
  mode: SignalAutojoinMode;
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
