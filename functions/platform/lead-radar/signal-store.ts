/**
 * Signal Radar persistence (migration 0057).
 *
 * The module is optional: 0057 may not be installed yet, and every entry point
 * degrades to "not installed" instead of throwing. That is deliberate — Signal
 * Radar must never take the Lead Radar down with it.
 *
 * Two rules the schema enforces that callers must respect:
 *   - One lead per post (`UNIQUE(org_id,post_id)`). Re-triaging never duplicates.
 *   - One post per normalized text per org (`UNIQUE(org_id,dedup_key)`). Someone
 *     pasting the same request into five groups produces one row, not five.
 */

import type {
  SignalLead,
  SignalLeadState,
  SignalTarget,
  SignalTargetKind,
  SignalTargetStatus,
} from '../../../src/shared/signal-radar';
import type { SignalService, SignalTriage } from './signal-triage';

export interface SignalRadarEnv {
  GPTBOT_DRAFTS_DB?: D1Database;
}

const TARGET_PREFIX = 'lrst_';
const POST_PREFIX = 'lrsp_';
const LEAD_PREFIX = 'lrsl_';
const HEX_BYTES = 16;

function randomHex(bytes = HEX_BYTES): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const newSignalTargetId = (): string => `${TARGET_PREFIX}${randomHex()}`;
export const newSignalPostId = (): string => `${POST_PREFIX}${randomHex()}`;
export const newSignalLeadId = (): string => `${LEAD_PREFIX}${randomHex()}`;

export function signalTargetId(value: string): boolean {
  return new RegExp(`^${TARGET_PREFIX}[a-f0-9]{${HEX_BYTES * 2}}$`).test(value);
}
export function signalLeadId(value: string): boolean {
  return new RegExp(`^${LEAD_PREFIX}[a-f0-9]{${HEX_BYTES * 2}}$`).test(value);
}

const readyBindings = new WeakSet<D1Database>();

/** True when migration 0057 is applied. Cached per D1 binding. */
export async function signalSchemaReady(db: D1Database | undefined): Promise<boolean> {
  if (!db) return false;
  if (readyBindings.has(db)) return true;
  try {
    const row = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM sqlite_schema WHERE type='table'
        AND name IN ('lead_radar_signal_targets','lead_radar_signal_posts','lead_radar_signal_leads')) AS tables,
      (SELECT COUNT(*) FROM d1_migrations WHERE name='0057_lead_radar_signal.sql') AS ledger`)
      .first<{ tables: number; ledger: number }>();
    if (row?.tables !== 3 || row?.ledger !== 1) return false;
    readyBindings.add(db);
    return true;
  } catch {
    return false;
  }
}

interface TargetRow {
  id: string;
  org_id: string;
  slug: string;
  url: string;
  kind: string;
  title: string | null;
  status: string;
  score: number;
  source: string;
  members: number | null;
  messages_seen: number;
  leads_seen: number;
  join_attempts: number;
  next_action_at: string | null;
  joined_at: string | null;
  probation_until: string | null;
  last_post_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface LeadRow {
  id: string;
  org_id: string;
  post_id: string;
  target_id: string;
  target_title: string | null;
  target_slug: string | null;
  service: string | null;
  score: number;
  state: string;
  author_label: string | null;
  author_handle: string | null;
  quote: string;
  draft_text: string | null;
  sent_at: string | null;
  failure_code: string | null;
  created_at: string;
  updated_at: string;
}

const SERVICE_VALUES = new Set<string>(['ads', 'seo', 'bots', 'sites', 'apps', 'design', 'crm']);

function toTarget(row: TargetRow): SignalTarget {
  return {
    id: row.id,
    orgId: row.org_id,
    slug: row.slug,
    url: row.url,
    kind: row.kind as SignalTargetKind,
    title: row.title,
    status: row.status as SignalTargetStatus,
    score: row.score,
    source: row.source,
    members: row.members,
    messagesSeen: row.messages_seen,
    leadsSeen: row.leads_seen,
    joinAttempts: row.join_attempts,
    nextActionAt: row.next_action_at,
    joinedAt: row.joined_at,
    probationUntil: row.probation_until,
    lastPostAt: row.last_post_at,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toLead(row: LeadRow): SignalLead {
  const service = row.service && SERVICE_VALUES.has(row.service) ? row.service as SignalService : null;
  return {
    id: row.id,
    orgId: row.org_id,
    postId: row.post_id,
    targetId: row.target_id,
    targetTitle: row.target_title,
    targetSlug: row.target_slug,
    service,
    score: row.score,
    state: row.state as SignalLeadState,
    authorLabel: row.author_label,
    authorHandle: row.author_handle,
    quote: row.quote,
    draftText: row.draft_text,
    sentAt: row.sent_at,
    failureCode: row.failure_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SignalTargetInput {
  slug: string;
  kind?: SignalTargetKind;
  title?: string | null;
  score?: number;
  source?: string;
  members?: number | null;
  note?: string | null;
  status?: SignalTargetStatus;
  url?: string;
}

export interface SignalPostInput {
  targetId: string;
  externalId: string | null;
  authorLabel: string | null;
  authorHandle: string | null;
  excerpt: string;
  dedupKey: string;
  occurredAt: string;
  triage: SignalTriage;
}

export interface SignalLeadPatch {
  state?: SignalLeadState;
  draftText?: string | null;
  sentAt?: string | null;
  failureCode?: string | null;
}

export interface SignalTargetListOptions {
  status?: SignalTargetStatus | SignalTargetStatus[];
  kind?: SignalTargetKind;
  limit?: number;
  minScore?: number;
}

export class SignalRadarStore {
  constructor(private readonly db: D1Database) {}

  /**
   * Insert or refresh a discovered entity. Never downgrades a status the
   * operator set by hand, and never lowers a score we already have.
   */
  async upsertTarget(orgId: string, input: SignalTargetInput, now = new Date().toISOString()): Promise<SignalTarget> {
    const id = newSignalTargetId();
    const score = clampScore(input.score ?? 0);
    const url = input.url ?? `https://t.me/${input.slug}`;
    await this.db.prepare(`INSERT INTO lead_radar_signal_targets
      (id,org_id,slug,url,kind,title,status,score,source,members,note,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)
      ON CONFLICT(org_id,slug) DO UPDATE SET
        url=excluded.url,
        kind=CASE WHEN excluded.kind<>'unknown' THEN excluded.kind ELSE lead_radar_signal_targets.kind END,
        title=COALESCE(excluded.title,lead_radar_signal_targets.title),
        members=COALESCE(excluded.members,lead_radar_signal_targets.members),
        score=MAX(lead_radar_signal_targets.score,excluded.score),
        updated_at=excluded.updated_at`)
      .bind(
        id, orgId, input.slug, url, input.kind ?? 'unknown', input.title ?? null,
        input.status ?? 'candidate', score, input.source ?? 'manual',
        input.members ?? null, input.note ?? null, now,
      )
      .run();
    return (await this.getTargetBySlug(orgId, input.slug))!;
  }

  async getTargetBySlug(orgId: string, slug: string): Promise<SignalTarget | null> {
    const row = await this.db.prepare(`SELECT * FROM lead_radar_signal_targets WHERE org_id=?1 AND slug=?2`)
      .bind(orgId, slug).first<TargetRow>();
    return row ? toTarget(row) : null;
  }

  async getTarget(orgId: string, id: string): Promise<SignalTarget | null> {
    const row = await this.db.prepare(`SELECT * FROM lead_radar_signal_targets WHERE org_id=?1 AND id=?2`)
      .bind(orgId, id).first<TargetRow>();
    return row ? toTarget(row) : null;
  }

  async listTargets(orgId: string, options: SignalTargetListOptions = {}): Promise<SignalTarget[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const where: string[] = ['org_id=?1'];
    const binds: unknown[] = [orgId];
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      where.push(`status IN (${statuses.map(() => '?').join(',')})`);
      binds.push(...statuses);
    }
    if (options.kind) {
      binds.push(options.kind);
      where.push(`kind=?${binds.length}`);
    }
    if (typeof options.minScore === 'number') {
      binds.push(options.minScore);
      where.push(`score>=?${binds.length}`);
    }
    binds.push(limit);
    const result = await this.db.prepare(`SELECT * FROM lead_radar_signal_targets
      WHERE ${where.join(' AND ')}
      ORDER BY score DESC, updated_at DESC LIMIT ?${binds.length}`)
      .bind(...binds).all<TargetRow>();
    return (result.results ?? []).map(toTarget);
  }

  /** Targets whose next_action_at has arrived — the only join-queue entry point. */
  async claimDueTargets(orgId: string, now: string, limit = 5): Promise<SignalTarget[]> {
    const result = await this.db.prepare(`SELECT * FROM lead_radar_signal_targets
      WHERE org_id=?1 AND status IN ('watching','probation')
        AND (next_action_at IS NULL OR next_action_at<=?2)
      ORDER BY score DESC, next_action_at ASC LIMIT ?3`)
      .bind(orgId, now, limit).all<TargetRow>();
    return (result.results ?? []).map(toTarget);
  }

  async updateTarget(
    orgId: string,
    id: string,
    patch: Partial<Record<
      'kind' | 'title' | 'status' | 'score' | 'members' | 'messages_seen' | 'leads_seen'
      | 'join_attempts' | 'next_action_at' | 'joined_at' | 'probation_until' | 'last_post_at' | 'note',
      string | number | null
    >>,
    now = new Date().toISOString(),
  ): Promise<void> {
    const allowed = [
      'kind', 'title', 'status', 'score', 'members', 'messages_seen', 'leads_seen',
      'join_attempts', 'next_action_at', 'joined_at', 'probation_until', 'last_post_at', 'note',
    ] as const;
    const sets: string[] = [];
    const binds: unknown[] = [orgId, id];
    for (const key of allowed) {
      if (!(key in patch)) continue;
      binds.push(patch[key] ?? null);
      sets.push(`${key}=?${binds.length}`);
    }
    if (sets.length === 0) return;
    binds.push(now);
    await this.db.prepare(`UPDATE lead_radar_signal_targets SET ${sets.join(', ')}, updated_at=?${binds.length}
      WHERE org_id=?1 AND id=?2`).bind(...binds).run();
  }

  /** Returns null when the text was already seen in this org. */
  async insertPost(orgId: string, input: SignalPostInput, now = new Date().toISOString()): Promise<string | null> {
    const id = newSignalPostId();
    const result = await this.db.prepare(`INSERT OR IGNORE INTO lead_radar_signal_posts
      (id,org_id,target_id,external_id,author_label,author_handle,excerpt,dedup_key,occurred_at,verdict,score,service,reasons_json,created_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`)
      .bind(
        id, orgId, input.targetId, input.externalId, input.authorLabel, input.authorHandle,
        input.excerpt.slice(0, 1200), input.dedupKey, input.occurredAt,
        input.triage.verdict, clampScore(input.triage.score), input.triage.service,
        JSON.stringify(input.triage.reasons.slice(0, 40)), now,
      )
      .run();
    const changes = typeof result.meta?.changes === 'number' ? result.meta.changes : 0;
    return changes > 0 ? id : null;
  }

  /** Promote a triaged post to a lead. Idempotent: one lead per post, ever. */
  async upsertLead(
    orgId: string,
    input: { postId: string; targetId: string; service: SignalService | null; score: number; quote: string; authorLabel: string | null; authorHandle: string | null },
    now = new Date().toISOString(),
  ): Promise<string | null> {
    const id = newSignalLeadId();
    const result = await this.db.prepare(`INSERT OR IGNORE INTO lead_radar_signal_leads
      (id,org_id,post_id,target_id,service,score,state,author_label,author_handle,quote,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,'new',?7,?8,?9,?10,?10)`)
      .bind(
        id, orgId, input.postId, input.targetId, input.service, clampScore(input.score),
        input.authorLabel, input.authorHandle, input.quote.slice(0, 600), now,
      )
      .run();
    const changes = typeof result.meta?.changes === 'number' ? result.meta.changes : 0;
    return changes > 0 ? id : null;
  }

  async listLeads(orgId: string, options: { state?: SignalLeadState | SignalLeadState[]; limit?: number } = {}): Promise<SignalLead[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const where = ['l.org_id=?1'];
    const binds: unknown[] = [orgId];
    if (options.state) {
      const states = Array.isArray(options.state) ? options.state : [options.state];
      where.push(`l.state IN (${states.map(() => '?').join(',')})`);
      binds.push(...states);
    }
    binds.push(limit);
    const result = await this.db.prepare(`SELECT l.*, t.title AS target_title, t.slug AS target_slug
      FROM lead_radar_signal_leads l
      LEFT JOIN lead_radar_signal_targets t ON t.org_id=l.org_id AND t.id=l.target_id
      WHERE ${where.join(' AND ')}
      ORDER BY l.score DESC, l.created_at DESC LIMIT ?${binds.length}`)
      .bind(...binds).all<LeadRow>();
    return (result.results ?? []).map(toLead);
  }

  async getLead(orgId: string, id: string): Promise<SignalLead | null> {
    const row = await this.db.prepare(`SELECT l.*, t.title AS target_title, t.slug AS target_slug
      FROM lead_radar_signal_leads l
      LEFT JOIN lead_radar_signal_targets t ON t.org_id=l.org_id AND t.id=l.target_id
      WHERE l.org_id=?1 AND l.id=?2`).bind(orgId, id).first<LeadRow>();
    return row ? toLead(row) : null;
  }

  async updateLead(orgId: string, id: string, patch: SignalLeadPatch, now = new Date().toISOString()): Promise<boolean> {
    const sets: string[] = [];
    const binds: unknown[] = [orgId, id];
    const columns: Array<[string, string | null | undefined]> = [
      ['state', patch.state],
      ['draft_text', patch.draftText],
      ['sent_at', patch.sentAt],
      ['failure_code', patch.failureCode],
    ];
    for (const [column, value] of columns) {
      if (value === undefined) continue;
      binds.push(value ?? null);
      sets.push(`${column}=?${binds.length}`);
    }
    if (sets.length === 0) return false;
    binds.push(now);
    const result = await this.db.prepare(`UPDATE lead_radar_signal_leads SET ${sets.join(', ')}, updated_at=?${binds.length}
      WHERE org_id=?1 AND id=?2`).bind(...binds).run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async counts(orgId: string): Promise<{
    targets: number; watching: number; probation: number; active: number;
    leadsNew: number; leadsSent: number; joined: number;
  }> {
    const row = await this.db.prepare(`SELECT
      COUNT(*) AS targets,
      SUM(CASE WHEN status='watching' THEN 1 ELSE 0 END) AS watching,
      SUM(CASE WHEN status='probation' THEN 1 ELSE 0 END) AS probation,
      SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status IN ('probation','active') THEN 1 ELSE 0 END) AS joined
      FROM lead_radar_signal_targets WHERE org_id=?1`).bind(orgId)
      .first<{ targets: number; watching: number | null; probation: number | null; active: number | null; joined: number | null }>();
    const leads = await this.db.prepare(`SELECT
      SUM(CASE WHEN state='new' THEN 1 ELSE 0 END) AS new,
      SUM(CASE WHEN state='sent' THEN 1 ELSE 0 END) AS sent
      FROM lead_radar_signal_leads WHERE org_id=?1`).bind(orgId)
      .first<{ new: number | null; sent: number | null }>();
    return {
      targets: row?.targets ?? 0,
      watching: row?.watching ?? 0,
      probation: row?.probation ?? 0,
      active: row?.active ?? 0,
      joined: row?.joined ?? 0,
      leadsNew: leads?.new ?? 0,
      leadsSent: leads?.sent ?? 0,
    };
  }

  /** Retention: raw post text is the only personal data we hold. */
  async purgePostsOlderThan(orgId: string, cutoff: string, limit = 500): Promise<number> {
    const result = await this.db.prepare(`DELETE FROM lead_radar_signal_posts
      WHERE id IN (SELECT id FROM lead_radar_signal_posts
        WHERE org_id=?1 AND created_at<?2 LIMIT ?3)`)
      .bind(orgId, cutoff, limit).run();
    return result.meta?.changes ?? 0;
  }
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
