/**
 * Signal Radar chat persistence (migration 0059).
 *
 * Chats are the *outbound* surface: rooms the operator could write in. They
 * are deliberately not `lead_radar_signal_targets`. A target is judged by the
 * posts it hands us; a group has no posts on the web at all, so in that funnel
 * it scores zero and is retired within two ticks for the crime of being a
 * group. Same words, different question:
 *
 *   targets -> "what was said here, and is it a request?"
 *   chats   -> "could a stranger write here, and is anyone listening?"
 *
 * The two meet at exactly one boundary: an approved chat is handed to the join
 * queue as a target with `kind='group'`. Everything before that lives here.
 *
 * Like every Signal module this one is optional. 0059 may not be applied yet,
 * and every entry point degrades to "not installed" rather than throwing — a
 * missing chat table must never take the radar, or Lead Radar, down with it.
 */

import {
  signalChatConfigKey,
  signalChatHarvestCursorKey,
  type SignalCanWrite,
  type SignalCanWriteBasis,
  type SignalChat,
  type SignalChatActivity,
  type SignalChatConfidence,
  type SignalChatHarvestStatus,
  type SignalChatKind,
  type SignalChatStatus,
} from '../../../src/shared/signal-radar';
import {
  normalizeChatHarvest,
  type ChatHarvestConfig,
} from './signal-chats';

const CHAT_PREFIX = 'lrsc_';
const HEX_BYTES = 16;

function randomHex(bytes = HEX_BYTES): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const newSignalChatId = (): string => `${CHAT_PREFIX}${randomHex()}`;

export function signalChatId(value: string): boolean {
  return new RegExp(`^${CHAT_PREFIX}[a-f0-9]{${HEX_BYTES * 2}}$`).test(value);
}

const readyBindings = new WeakSet<D1Database>();

/**
 * True when the chats schema is complete: 0059's table *and* 0060's column.
 *
 * Only the objects themselves are checked, never `d1_migrations`. That is
 * deliberate: these migrations are applied out of band on a database the
 * deploy token has no D1 rights to, and a ledger that has not caught up yet
 * must not disable a table that is plainly sitting there.
 *
 * The column is checked because the harvest writes it. A table without
 * `confidence` is not an old schema we can write around — it is one where
 * every upsert in the tick would fail, and "the harvest quietly does nothing
 * until someone reads a log" is the failure this function exists to prevent.
 * Reporting not-ready turns that into the one outcome the operator can act on:
 * the UI says the schema is not installed.
 */
export async function chatsSchemaReady(db: D1Database | undefined): Promise<boolean> {
  if (!db) return false;
  if (readyBindings.has(db)) return true;
  try {
    const row = await db.prepare(`SELECT (
        SELECT COUNT(*) FROM sqlite_schema
        WHERE type='table' AND name='lead_radar_signal_chats'
      ) AS tables, (
        SELECT COUNT(*) FROM pragma_table_info('lead_radar_signal_chats')
        WHERE name='confidence'
      ) AS columns`)
      .first<{ tables: number; columns: number }>();
    if (!row || row.tables < 1 || row.columns < 1) return false;
    readyBindings.add(db);
    return true;
  } catch {
    return false;
  }
}

interface ChatRow {
  id: string;
  org_id: string;
  slug: string;
  url: string;
  title: string | null;
  about: string | null;
  kind: string;
  topic: string | null;
  confidence: string | null;
  members: number | null;
  online: number | null;
  activity: string;
  can_write: string;
  can_write_basis: string | null;
  relevance: number;
  matched_json: string;
  reject_reason: string | null;
  source: string;
  query: string | null;
  status: string;
  checked_at: string | null;
  created_at: string;
  updated_at: string;
}

const KIND_VALUES: SignalChatKind[] = ['group', 'channel', 'unknown'];
const ACTIVITY_VALUES: SignalChatActivity[] = ['live', 'slow', 'unknown'];
const CAN_WRITE_VALUES: SignalCanWrite[] = ['yes', 'no', 'unknown'];
const STATUS_VALUES: SignalChatStatus[] = ['new', 'approved', 'queued', 'joined', 'rejected'];
const CONFIDENCE_VALUES: SignalChatConfidence[] = ['confirmed', 'tentative'];

function pick<T extends string>(value: string, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

/** Stored JSON is never trusted: a bad row must degrade, not 500 the table. */
function parseMatched(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 40)
      : [];
  } catch {
    return [];
  }
}

function toChat(row: ChatRow): SignalChat {
  return {
    id: row.id,
    orgId: row.org_id,
    slug: row.slug,
    url: row.url,
    title: row.title,
    about: row.about,
    kind: pick(row.kind, KIND_VALUES, 'unknown'),
    topic: row.topic,
    confidence: row.confidence === null
      ? null
      : pick(row.confidence, CONFIDENCE_VALUES, 'tentative'),
    members: row.members,
    online: row.online,
    activity: pick(row.activity, ACTIVITY_VALUES, 'unknown'),
    canWrite: pick(row.can_write, CAN_WRITE_VALUES, 'unknown'),
    canWriteBasis: row.can_write_basis === 'api'
      || row.can_write_basis === 'heuristic'
      || row.can_write_basis === 'operator'
      ? row.can_write_basis
      : null,
    relevance: row.relevance,
    matched: parseMatched(row.matched_json),
    rejectReason: row.reject_reason,
    source: row.source,
    query: row.query,
    status: pick(row.status, STATUS_VALUES, 'new'),
    checkedAt: row.checked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SignalChatUpsert {
  slug: string;
  url?: string;
  title?: string | null;
  about?: string | null;
  kind: SignalChatKind;
  topic?: string | null;
  confidence?: SignalChatConfidence | null;
  members?: number | null;
  online?: number | null;
  activity?: SignalChatActivity;
  canWrite?: SignalCanWrite;
  canWriteBasis?: 'api' | 'heuristic' | 'operator' | null;
  relevance?: number;
  matched?: string[];
  rejectReason?: string | null;
  source: string;
  query?: string | null;
  status?: SignalChatStatus;
  checkedAt?: string | null;
}

export interface SignalChatListOptions {
  status?: SignalChatStatus | SignalChatStatus[];
  kind?: SignalChatKind;
  topic?: string;
  /** Hide rows the filter dropped. On by default: the table is not a log. */
  excludeRejected?: boolean;
  limit?: number;
  minMembers?: number;
  minRelevance?: number;
}

export class SignalChatStore {
  constructor(private readonly db: D1Database) {}

  /**
   * Insert or refresh a harvested room.
   *
   * A row someone has already ruled on keeps its verdict. A re-harvest that
   * flipped `rejected` back to `new` would resurrect every room the operator
   * ever dismissed, and the dismissal is the whole point of the status column.
   * So the rule is narrow and easy to state: a row still sitting at `new` is
   * ours to rewrite; anything else is a recorded decision, and only a person
   * overturns a decision. Re-harvesting therefore refreshes *measurements*
   * (members, online, relevance, activity) and never *verdicts* (status,
   * reject_reason, an operator's answer on can_write).
   *
   * The consequence is deliberate: a room the filter once rejected stays
   * rejected even if the thresholds later change. Re-running the filter over
   * known rooms is a separate action with its own button, not a side effect of
   * going out to look for new ones.
   */
  async upsertChat(orgId: string, input: SignalChatUpsert, now = new Date().toISOString()): Promise<SignalChat> {
    const id = newSignalChatId();
    const status = input.status ?? (input.rejectReason ? 'rejected' : 'new');
    await this.db.prepare(`INSERT INTO lead_radar_signal_chats
      (id,org_id,slug,url,title,about,kind,topic,confidence,members,online,activity,can_write,
       can_write_basis,relevance,matched_json,reject_reason,source,query,status,checked_at,
       created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?22)
      ON CONFLICT(org_id,slug) DO UPDATE SET
        url=excluded.url,
        title=COALESCE(excluded.title,lead_radar_signal_chats.title),
        about=COALESCE(excluded.about,lead_radar_signal_chats.about),
        kind=CASE WHEN excluded.kind<>'unknown' THEN excluded.kind ELSE lead_radar_signal_chats.kind END,
        topic=COALESCE(excluded.topic,lead_radar_signal_chats.topic),
        -- Confidence only ever rises. A later pass that matched fewer words
        -- must not demote a room an earlier one confirmed, for the same reason
        -- relevance is a MAX: re-scoring under a changed vocabulary must not
        -- silently rewrite what a previous harvest decided.
        confidence=CASE
          WHEN excluded.confidence='confirmed' THEN 'confirmed'
          ELSE COALESCE(lead_radar_signal_chats.confidence,excluded.confidence) END,
        members=COALESCE(excluded.members,lead_radar_signal_chats.members),
        online=COALESCE(excluded.online,lead_radar_signal_chats.online),
        activity=excluded.activity,
        -- An operator who opened the room and answered "can a stranger write
        -- here" outranks a regex that read the description. Always.
        can_write=CASE WHEN lead_radar_signal_chats.can_write_basis='operator'
          THEN lead_radar_signal_chats.can_write ELSE excluded.can_write END,
        can_write_basis=CASE WHEN lead_radar_signal_chats.can_write_basis='operator'
          THEN lead_radar_signal_chats.can_write_basis ELSE excluded.can_write_basis END,
        relevance=MAX(lead_radar_signal_chats.relevance,excluded.relevance),
        -- A later pass that matched nothing must not erase why an earlier one
        -- matched something: the operator reads this column to understand a
        -- verdict, and an empty explanation is worse than a stale one.
        matched_json=CASE WHEN json_array_length(excluded.matched_json)>0
          THEN excluded.matched_json ELSE lead_radar_signal_chats.matched_json END,
        reject_reason=CASE WHEN lead_radar_signal_chats.status='new'
          THEN excluded.reject_reason ELSE lead_radar_signal_chats.reject_reason END,
        query=COALESCE(excluded.query,lead_radar_signal_chats.query),
        checked_at=excluded.checked_at,
        updated_at=excluded.updated_at,
        status=CASE WHEN lead_radar_signal_chats.status='new'
          THEN excluded.status ELSE lead_radar_signal_chats.status END`)
      .bind(
        id, orgId, input.slug, input.url ?? `https://t.me/${input.slug}`,
        input.title ?? null, input.about ? input.about.slice(0, 1000) : null,
        input.kind, input.topic ?? null, input.confidence ?? null,
        input.members ?? null, input.online ?? null,
        input.activity ?? 'unknown', input.canWrite ?? 'unknown', input.canWriteBasis ?? null,
        Math.max(0, Math.min(100, Math.round(input.relevance ?? 0))),
        JSON.stringify((input.matched ?? []).slice(0, 40)).slice(0, 2000),
        input.rejectReason ? input.rejectReason.slice(0, 200) : null,
        input.source.slice(0, 80), input.query ?? null, status, input.checkedAt ?? now, now,
      )
      .run();
    const row = await this.getChatBySlug(orgId, input.slug);
    if (!row) throw new Error('signal_chat_persistence_failed');
    return row;
  }

  async getChatBySlug(orgId: string, slug: string): Promise<SignalChat | null> {
    const row = await this.db.prepare('SELECT * FROM lead_radar_signal_chats WHERE org_id=?1 AND slug=?2')
      .bind(orgId, slug).first<ChatRow>();
    return row ? toChat(row) : null;
  }

  async getChat(orgId: string, id: string): Promise<SignalChat | null> {
    const row = await this.db.prepare('SELECT * FROM lead_radar_signal_chats WHERE org_id=?1 AND id=?2')
      .bind(orgId, id).first<ChatRow>();
    return row ? toChat(row) : null;
  }

  /**
   * Which of these slugs we already know, in at most a few queries.
   *
   * A harvest sees hundreds of candidates; asking one by one is hundreds of
   * round trips. D1 caps bind parameters, so the list is chunked rather than
   * sent whole — a query that fails on size is a query that fails on the
   * largest harvest, which is exactly the one we cannot afford to lose.
   */
  async knownSlugs(orgId: string, slugs: string[]): Promise<Set<string>> {
    const out = new Set<string>();
    const unique = [...new Set(slugs.map((slug) => slug.toLowerCase()))];
    const CHUNK = 50;
    for (let offset = 0; offset < unique.length; offset += CHUNK) {
      const chunk = unique.slice(offset, offset + CHUNK);
      const placeholders = chunk.map(() => '?').join(',');
      try {
        const result = await this.db.prepare(`SELECT slug FROM lead_radar_signal_chats
          WHERE org_id=? AND slug IN (${placeholders})`)
          .bind(orgId, ...chunk).all<{ slug: string }>();
        for (const row of result.results ?? []) out.add(row.slug.toLowerCase());
      } catch {
        // A chunk that will not bind costs us a few duplicate card fetches,
        // not the harvest. Continue rather than aborting the run.
      }
    }
    return out;
  }

  async listChats(orgId: string, options: SignalChatListOptions = {}): Promise<SignalChat[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
    const where: string[] = ['org_id=?'];
    const binds: unknown[] = [orgId];
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      where.push(`status IN (${statuses.map(() => '?').join(',')})`);
      binds.push(...statuses);
    } else if (options.excludeRejected !== false) {
      where.push("status <> 'rejected'");
    }
    if (options.kind) {
      binds.push(options.kind);
      where.push('kind=?');
    }
    if (options.topic) {
      binds.push(options.topic);
      where.push('topic=?');
    }
    if (typeof options.minMembers === 'number') {
      binds.push(options.minMembers);
      where.push('COALESCE(members,0)>=?');
    }
    if (typeof options.minRelevance === 'number') {
      binds.push(options.minRelevance);
      where.push('relevance>=?');
    }
    binds.push(limit);
    // Confirmed rooms first, then by score.
    //
    // The operator reads this table from the top down, and the top has to be
    // the rooms that said what they are. A tentative room is capped at 48 and
    // a confirmed one can reach 60 on size alone, so ordering by relevance
    // puts most guesses below most confirmed rooms anyway — but "most" is not
    // "all", and the one guess that outscores a studio is exactly the row that
    // makes an operator stop trusting the table.
    const result = await this.db.prepare(`SELECT * FROM lead_radar_signal_chats
      WHERE ${where.join(' AND ')}
      ORDER BY CASE WHEN confidence='confirmed' THEN 0 ELSE 1 END,
               relevance DESC, COALESCE(members,0) DESC, updated_at DESC
      LIMIT ?`)
      .bind(...binds).all<ChatRow>();
    return (result.results ?? []).map(toChat);
  }

  /**
   * Rooms that have gone longest without a re-check. Used to refresh a stale
   * table without a harvest: the oldest card is the one whose `online` count
   * has most probably rotted.
   */
  async listStaleChats(orgId: string, limit: number, before: string): Promise<SignalChat[]> {
    const result = await this.db.prepare(`SELECT * FROM lead_radar_signal_chats
      WHERE org_id=?1 AND status <> 'rejected'
        AND (checked_at IS NULL OR checked_at<=?2)
      ORDER BY COALESCE(checked_at,'') ASC LIMIT ?3`)
      .bind(orgId, before, Math.min(Math.max(limit, 1), 100)).all<ChatRow>();
    return (result.results ?? []).map(toChat);
  }

  /**
   * Apply an operator decision. Four columns and no others: a chat has one
   * lifecycle field the operator owns (status), one fact they can correct
   * (can_write, with the basis that fact came from), and one explanation they
   * can clear (reject_reason).
   *
   * The columns are named by an internal allowlist rather than taken from the
   * keys of the patch object. A map of caller-supplied keys to SQL text is a
   * column name waiting to be a table name, and nothing outside this switch
   * belongs in an UPDATE here.
   */
  async updateChat(
    orgId: string,
    id: string,
    patch: {
      status?: SignalChatStatus | null;
      canWrite?: SignalCanWrite | null;
      canWriteBasis?: SignalCanWriteBasis | null;
      rejectReason?: string | null;
    },
    now = new Date().toISOString(),
  ): Promise<SignalChat | null> {
    const assignments: Array<[string, string | null]> = [];
    if (patch.status !== undefined) assignments.push(['status', patch.status]);
    if (patch.canWrite !== undefined) {
      assignments.push(['can_write', patch.canWrite]);
      // Every caller of this method is a human looking at the room, so the
      // basis follows from the fact of the call rather than from the caller
      // remembering to say so. An answer with the wrong provenance is worse
      // than no answer, because it will be trusted as measured.
      assignments.push(['can_write_basis', patch.canWriteBasis ?? (patch.canWrite ? 'operator' : null)]);
    }
    if (patch.rejectReason !== undefined) assignments.push(['reject_reason', patch.rejectReason]);
    if (assignments.length === 0) return null;

    const binds: unknown[] = [orgId, id];
    const sets = assignments.map(([column, value]) => {
      binds.push(value);
      return `${column}=?${binds.length}`;
    });
    binds.push(now);
    const result = await this.db.prepare(`UPDATE lead_radar_signal_chats
      SET ${sets.join(', ')}, updated_at=?${binds.length} WHERE org_id=?1 AND id=?2`)
      .bind(...binds).run();
    if ((result.meta?.changes ?? 0) === 0) return null;
    // Returning the row the caller just wrote, rather than a boolean, saves the
    // API's PATCH handler a second round trip and keeps what it renders in
    // agreement with what it wrote.
    return this.getChat(orgId, id);
  }

  async counts(orgId: string): Promise<{
    total: number;
    groups: number;
    new: number;
    approved: number;
    queued: number;
    joined: number;
    rejected: number;
    writable: number;
  }> {
    const row = await this.db.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN kind='group' THEN 1 ELSE 0 END) AS groups,
      SUM(CASE WHEN status='new' THEN 1 ELSE 0 END) AS fresh,
      SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN status='joined' THEN 1 ELSE 0 END) AS joined,
      SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected,
      SUM(CASE WHEN status<>'rejected' AND can_write='yes' THEN 1 ELSE 0 END) AS writable
      FROM lead_radar_signal_chats WHERE org_id=?1`).bind(orgId)
      .first<Record<string, number | null>>();
    const value = (key: string): number => row?.[key] ?? 0;
    return {
      total: value('total'),
      groups: value('groups'),
      new: value('fresh'),
      approved: value('approved'),
      queued: value('queued'),
      joined: value('joined'),
      rejected: value('rejected'),
      writable: value('writable'),
    };
  }

  /** Why rooms were dropped, most common first. A filter you cannot audit is
   *  a filter you cannot tune. */
  async rejectBreakdown(orgId: string, limit = 12): Promise<Array<{ reason: string; count: number }>> {
    const result = await this.db.prepare(`SELECT reject_reason AS reason, COUNT(*) AS count
      FROM lead_radar_signal_chats
      WHERE org_id=?1 AND status='rejected' AND reject_reason IS NOT NULL
      GROUP BY reject_reason ORDER BY count DESC LIMIT ?2`)
      .bind(orgId, Math.min(Math.max(limit, 1), 50)).all<{ reason: string; count: number }>();
    return result.results ?? [];
  }
}

/* ---------------------------------------------------------------- settings */

interface SettingRow {
  value_json: string;
}

async function readSetting(db: D1Database | undefined, key: string): Promise<unknown> {
  if (!db) return null;
  try {
    const row = await db.prepare('SELECT value_json FROM system_settings WHERE key = ?')
      .bind(key).first<SettingRow>();
    if (!row) return null;
    return JSON.parse(row.value_json);
  } catch {
    // `system_settings` missing, or a row somebody wrote by hand. Either way
    // the caller gets defaults rather than a crash mid-harvest.
    return null;
  }
}

async function writeSetting(db: D1Database, key: string, value: unknown, by: string | null): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO system_settings (key, value_json, updated_at, updated_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by`)
    .bind(key, JSON.stringify(value), now, by).run();
}

/**
 * The operator's harvest configuration.
 *
 * Normalized on read, never on trust: a half-written row from an older build
 * must degrade to defaults rather than abort a harvest. One bad keyword costs
 * one bad room; a thrown error costs the whole table.
 */
export async function readChatHarvestConfig(
  db: D1Database | undefined,
  orgId: string,
): Promise<ChatHarvestConfig> {
  return normalizeChatHarvest(await readSetting(db, signalChatConfigKey(orgId)));
}

export async function writeChatHarvestConfig(
  db: D1Database,
  orgId: string,
  config: ChatHarvestConfig,
  // Optional because a crawl that resets the config to defaults has no human
  // behind it. Null then, and not a fabricated actor: the point of the column
  // is to be able to tell who changed a threshold.
  by: string | null = null,
): Promise<ChatHarvestConfig> {
  const normalized = normalizeChatHarvest(config);
  await writeSetting(db, signalChatConfigKey(orgId), normalized, by);
  return normalized;
}

/**
 * Where the crawl left off.
 *
 * The cursor is an index into the query list, not a page number. Catalogues
 * paginate differently from each other and none of them documents it, so the
 * only honest resume point is "which query we were on". A rotation also means
 * every query gets its turn: a harvest that always restarted from the top
 * would re-crawl Tashkent forever and never reach the operator's own keywords.
 */
/** One room a catalogue has named but no harvest has opened yet. */
export interface ChatHarvestPending {
  slug: string;
  /** Label of the source that found it. Geography is the source's to confer. */
  source: string;
  /**
   * Whether that source stated a geography. Carried explicitly rather than
   * looked up from the label, because a `graph:<slug>` label has no entry in
   * the source list to look up — the geography it inherits comes from the room
   * whose description named it.
   */
  local?: boolean;
}

/** How many unopened rooms the cursor carries across ticks. */
export const CHAT_PENDING_LIMIT = 400;

export interface ChatHarvestCursor {
  index: number;
  query: string | null;
  at: string;
  by: string | null;
  /**
   * Rooms already discovered but not yet opened.
   *
   * A catalogue page names about fifty rooms and one harvest opens about
   * twelve of them. Without this the other thirty-eight are thrown away and
   * re-discovered on the next pass through the rotation, which costs another
   * paced directory fetch to learn the same slugs. Measured: twelve rounds of
   * the live rotation produced 133 opened cards out of roughly 3 400 entries
   * seen — a hundred and eleven seconds of waiting per room.
   */
  pending: ChatHarvestPending[];
}

export async function readChatHarvestCursor(
  db: D1Database | undefined,
  orgId: string,
): Promise<ChatHarvestCursor | null> {
  const raw = await readSetting(db, signalChatHarvestCursorKey(orgId));
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as { index?: unknown; query?: unknown; at?: unknown; by?: unknown; pending?: unknown };
  const index = Number(row.index);
  if (!Number.isFinite(index) || index < 0) return null;
  const pending: ChatHarvestPending[] = [];
  if (Array.isArray(row.pending)) {
    for (const item of row.pending.slice(0, CHAT_PENDING_LIMIT)) {
      // A two-element tuple is a room from an older build; it carries no
      // geography, which is the safe default.
      if (!Array.isArray(item)) continue;
      const [slug, source, local] = item;
      if (typeof slug === 'string' && typeof source === 'string') {
        pending.push({
          slug: slug.slice(0, 64),
          source: source.slice(0, 80),
          local: local === 1,
        });
      }
    }
  }
  return {
    index: Math.trunc(index),
    query: typeof row.query === 'string' ? row.query.slice(0, 200) : null,
    at: typeof row.at === 'string' ? row.at : new Date(0).toISOString(),
    by: typeof row.by === 'string' ? row.by.slice(0, 320) : null,
    pending,
  };
}

export async function writeChatHarvestCursor(
  db: D1Database,
  orgId: string,
  cursor: ChatHarvestCursor,
): Promise<void> {
  // Tuples rather than objects: the cursor is a row in `system_settings` and
  // four hundred `{"slug":…,"source":…}` pairs would spend more of it on
  // punctuation than on rooms.
  const stored = {
    ...cursor,
    pending: (cursor.pending ?? []).slice(0, CHAT_PENDING_LIMIT)
      .map((item) => [item.slug, item.source, item.local === true ? 1 : 0]),
  };
  await writeSetting(db, signalChatHarvestCursorKey(orgId), stored, cursor.by ?? 'system');
}

export function chatHarvestStatusFromCursor(
  cursor: ChatHarvestCursor | null,
  now: number,
  cooldownMs: number,
): SignalChatHarvestStatus {
  const idle: SignalChatHarvestStatus = {
    queued: false, lastRequestedAt: null, nextAvailableAt: null, cooldownMs,
  };
  if (!cursor) return idle;
  const at = Date.parse(cursor.at);
  if (!Number.isFinite(at)) return idle;
  const next = at + cooldownMs;
  return {
    queued: now < next,
    lastRequestedAt: cursor.at,
    nextAvailableAt: new Date(next).toISOString(),
    cooldownMs,
  };
}
