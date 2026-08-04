/**
 * ADMIN-4A read model: what the marketplace is actually doing right now.
 *
 * Two domains, both read-only, both already implemented elsewhere:
 *
 *   Orders     — `sotuvchi_orders`, written by the buyer checkout in
 *                `functions/agents/sotuvchi/checkout` and moved through
 *                confirm/done by the seller. Nothing here writes to it.
 *   Questions  — `sotuvchi_handoffs`, the buyer-to-seller escalation the agent
 *                opens when it cannot answer. Nothing here replies or closes.
 *
 * Three constraints shaped every query below, and they are the same three
 * ADMIN-3A used, because they are the ones that keep an owner screen honest:
 *
 *   **Nothing here identifies a person.** `sotuvchi_orders` holds `buyer_name`,
 *   `buyer_phone` and `buyer_address`, and `sotuvchi_handoffs` holds
 *   `question_text` and `reply_text` and a `buyer_identity_id`. None of those
 *   columns is selected by any statement in this file — not for the list, not
 *   for the detail. The owner needs to know that an order exists, that it is
 *   stuck, and in which store; the buyer's phone number answers none of that.
 *   What the owner does get is a safe reference: `order_number` for an order
 *   and the handoff id for a question.
 *
 *   **Every filter is applied by SQLite.** A control that narrows the twenty-five
 *   rows already in the browser tells the reader it searched the marketplace.
 *
 *   **Every query is one an index can answer, or the gap is written down.** The
 *   plans were taken with `EXPLAIN QUERY PLAN` against the fully migrated
 *   schema and are recorded in BORMI_ADMIN_ORDERS_HANDOFFS_DATA_CONTRACT.md.
 *   The lists scan an index and then sort in a temp B-tree, because both
 *   composite indexes lead with `org_id` and put `created_at` behind `status`.
 *   That is a real cost and it is not hidden: ADMIN-4A ships **one** ordering —
 *   newest first, which is the only order an operations queue has — rather than
 *   a sort control that would multiply a plan nobody measured. The index that
 *   would remove the temp B-tree is named in the data contract; ADMIN-4A adds
 *   no migration for a read.
 */
import { OwnerValidationError, OWNER_LIMITS } from './validation';

/** `sotuvchi_orders.status`, as the CHECK constrains it. */
export const ORDER_STATUSES = ['draft', 'placed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** `sotuvchi_orders.fulfillment_status`, added by 0022. */
export const ORDER_FULFILLMENTS = ['none', 'confirmed', 'done'] as const;
export type OrderFulfillment = (typeof ORDER_FULFILLMENTS)[number];

/**
 * The lifecycle a person actually reads, derived from the pair the domain
 * stores. 0022 documents the mapping and this reproduces it exactly; there is
 * no fifth state and none is invented here.
 */
export const ORDER_STAGES = ['draft', 'placed', 'confirmed', 'done', 'cancelled'] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

/** `sotuvchi_handoffs.status`, as the CHECK constrains it. */
export const QUESTION_STATUSES = ['open', 'answered', 'closed', 'expired'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/** `sotuvchi_handoffs.reason`, as the CHECK constrains it. */
export const QUESTION_REASONS = [
  'unknown_intent',
  'buyer_requested_human',
  'catalog_no_result',
  'order_question',
  'seller_initiated',
] as const;

/**
 * Who the row is waiting on.
 *
 * Derived, never stored. `nobody` is not "fine" — it is the honest answer for a
 * closed, cancelled or expired row, where waiting has stopped mattering.
 */
export const WAITING_SIDES = ['seller', 'buyer', 'nobody'] as const;
export type WaitingSide = (typeof WAITING_SIDES)[number];

/**
 * Whether a row deserves the owner's attention, and why.
 *
 * `waiting` is the normal state of an open queue and is not an alarm.
 * `stalled` means the wait has crossed the threshold below. There is no score
 * and no severity beyond these three, because nothing in this data supports one.
 */
export const ATTENTION_STATES = ['none', 'waiting', 'stalled'] as const;
export type AttentionState = (typeof ATTENTION_STATES)[number];

export const OPERATIONS_LIMITS = Object.freeze({
  pageSizeDefault: OWNER_LIMITS.pageSizeDefault,
  pageSizeMax: OWNER_LIMITS.pageSizeMax,
  /**
   * How long a row may wait before it is called stalled. One working day: long
   * enough that a seller asleep at 3am is not an incident, short enough that a
   * buyer waiting since yesterday is.
   */
  stalledAfterHours: 24,
  /** Items described for one order. The domain permits exactly one. */
  itemsMax: 1,
});

interface Row { [key: string]: unknown }

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function hoursBetween(fromIso: string, now: Date): number {
  const started = Date.parse(fromIso);
  if (!Number.isFinite(started)) return 0;
  return (now.getTime() - started) / 3_600_000;
}

// ── Orders ───────────────────────────────────────────────────────────────────

export interface OrderListFilters {
  stage: OrderStage | null;
  storeId: string | null;
}

export interface OrderListQuery extends OrderListFilters {
  limit: number;
  offset: number;
}

export interface AdminOrderRow {
  id: string;
  /** `order_number`, the reference a person can quote. Never the buyer. */
  reference: string;
  stage: OrderStage;
  status: OrderStatus;
  fulfillment: OrderFulfillment;
  store_id: string;
  store_name: string;
  items: number;
  /** The seller's own product name. No buyer copy exists on an order. */
  item_name: string | null;
  total_minor: number | null;
  currency: string;
  waiting_on: WaitingSide;
  attention: AttentionState;
  created_at: string;
  placed_at: string | null;
}

/**
 * The pair the domain stores, collapsed into the single word 0022 defines.
 * A cancelled order always carries `fulfillment_status = 'none'`, so status
 * wins first and fulfilment only refines a placed order.
 */
export function orderStage(status: string, fulfillment: string): OrderStage {
  if (status === 'draft') return 'draft';
  if (status === 'cancelled') return 'cancelled';
  if (fulfillment === 'done') return 'done';
  if (fulfillment === 'confirmed') return 'confirmed';
  return 'placed';
}

/**
 * A placed order that nobody has confirmed is waiting on the seller. A draft is
 * waiting on the buyer, who has not finished checkout. Everything else has
 * stopped waiting.
 */
export function orderWaiting(stage: OrderStage): WaitingSide {
  if (stage === 'placed') return 'seller';
  if (stage === 'draft') return 'buyer';
  return 'nobody';
}

function attentionFor(waiting: WaitingSide, sinceIso: string, now: Date): AttentionState {
  if (waiting !== 'seller') return 'none';
  return hoursBetween(sinceIso, now) >= OPERATIONS_LIMITS.stalledAfterHours
    ? 'stalled'
    : 'waiting';
}

/**
 * The SELECT list, written once so the list and the detail cannot drift into
 * projecting different columns. Every name here is deliberate; the three the
 * table also holds — `buyer_name`, `buyer_phone`, `buyer_address` — are not.
 */
const ORDER_COLUMNS = `
  ordered.id, ordered.order_number, ordered.status, ordered.fulfillment_status,
  ordered.total_minor, ordered.currency, ordered.created_at, ordered.placed_at,
  ordered.store_id, store.name AS store_name,
  item.product_name_snapshot AS item_name,
  CASE WHEN item.id IS NULL THEN 0 ELSE 1 END AS items`;

/**
 * The joins, likewise written once.
 *
 * The store join binds `org_id` as well as `id`: a store is unique per tenant
 * and joining on the id alone would be a cross-tenant read waiting to be
 * introduced. The item join is a LEFT JOIN and cannot multiply rows —
 * `idx_sotuvchi_order_items_single` is UNIQUE on `order_id`, which is the
 * domain rule that one order carries exactly one catalogue item.
 */
const ORDER_FROM = `
  FROM sotuvchi_orders AS ordered
  JOIN sotuvchi_stores AS store
    ON store.org_id = ordered.org_id AND store.id = ordered.store_id
  LEFT JOIN sotuvchi_order_items AS item ON item.order_id = ordered.id`;

function orderWhere(filters: OrderListFilters): { sql: string; binds: unknown[] } {
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (filters.stage) {
    // The filter is expressed in the domain's own two columns rather than in
    // the derived word, so SQLite does the narrowing and the index is usable.
    if (filters.stage === 'draft' || filters.stage === 'cancelled') {
      clauses.push('ordered.status = ?');
      binds.push(filters.stage);
    } else if (filters.stage === 'placed') {
      clauses.push("ordered.status = 'placed' AND ordered.fulfillment_status = 'none'");
    } else {
      clauses.push("ordered.status = 'placed' AND ordered.fulfillment_status = ?");
      binds.push(filters.stage);
    }
  }
  if (filters.storeId) {
    clauses.push('ordered.store_id = ?');
    binds.push(filters.storeId);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', binds };
}

function toOrderRow(row: Row, now: Date): AdminOrderRow {
  const status = text(row.status) as OrderStatus;
  const fulfillment = text(row.fulfillment_status) as OrderFulfillment;
  const stage = orderStage(status, fulfillment);
  const waiting = orderWaiting(stage);
  const createdAt = text(row.created_at);
  return {
    id: text(row.id),
    reference: text(row.order_number),
    stage,
    status,
    fulfillment,
    store_id: text(row.store_id),
    store_name: text(row.store_name),
    items: Number(row.items ?? 0),
    item_name: nullableText(row.item_name),
    total_minor: row.total_minor === null || row.total_minor === undefined
      ? null
      : Number(row.total_minor),
    currency: text(row.currency),
    waiting_on: waiting,
    attention: attentionFor(waiting, text(row.placed_at) || createdAt, now),
    created_at: createdAt,
    placed_at: nullableText(row.placed_at),
  };
}

export async function listOrderRows(
  db: D1Database,
  query: OrderListQuery,
  now: Date,
): Promise<AdminOrderRow[]> {
  const where = orderWhere(query);
  const rows = await db.prepare(
    `SELECT ${ORDER_COLUMNS} ${ORDER_FROM} ${where.sql}
      ORDER BY ordered.created_at DESC, ordered.id ASC
      LIMIT ? OFFSET ?`,
  ).bind(...where.binds, query.limit, query.offset).all<Row>();
  return (rows.results ?? []).map((row) => toOrderRow(row, now));
}

export async function countOrders(db: D1Database, filters: OrderListFilters): Promise<number> {
  const where = orderWhere(filters);
  const row = await db.prepare(
    `SELECT COUNT(*) AS total FROM sotuvchi_orders AS ordered ${where.sql}`,
  ).bind(...where.binds).first<Row>();
  return Number(row?.total ?? 0);
}

export interface AdminOrderDetail extends AdminOrderRow {
  org_id: string;
  updated_at: string;
  /** At most one, by the domain's own unique index. */
  item: {
    product_id: string;
    name: string;
    unit_price_minor: number;
    currency: string;
    availability: string;
    quantity: number | null;
    line_total_minor: number | null;
  } | null;
}

export async function getOrderDetail(
  db: D1Database,
  orderId: string,
  now: Date,
): Promise<AdminOrderDetail | null> {
  const row = await db.prepare(
    `SELECT ${ORDER_COLUMNS}, ordered.org_id, ordered.updated_at,
            item.product_id, item.unit_price_minor, item.availability_snapshot,
            item.quantity, item.line_total_minor
     ${ORDER_FROM}
     WHERE ordered.id = ?`,
  ).bind(orderId).first<Row>();
  if (!row) return null;
  const base = toOrderRow(row, now);
  return {
    ...base,
    org_id: text(row.org_id),
    updated_at: text(row.updated_at),
    item: row.product_id === null || row.product_id === undefined ? null : {
      product_id: text(row.product_id),
      name: text(row.item_name),
      unit_price_minor: Number(row.unit_price_minor ?? 0),
      currency: text(row.currency),
      availability: text(row.availability_snapshot),
      quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
      line_total_minor: row.line_total_minor === null || row.line_total_minor === undefined
        ? null
        : Number(row.line_total_minor),
    },
  };
}

// ── Questions ────────────────────────────────────────────────────────────────

export interface QuestionListFilters {
  status: QuestionStatus | null;
  storeId: string | null;
}

export interface QuestionListQuery extends QuestionListFilters {
  limit: number;
  offset: number;
}

export interface AdminQuestionRow {
  id: string;
  status: QuestionStatus;
  reason: string;
  store_id: string;
  store_name: string;
  /**
   * Whether words exist, never the words. `question_text` and `reply_text` are
   * the only free-form buyer and seller content this marketplace stores, and
   * they are not projected by any statement in this file.
   */
  has_question: boolean;
  has_reply: boolean;
  waiting_on: WaitingSide;
  attention: AttentionState;
  created_at: string;
  answered_at: string | null;
  closed_at: string | null;
  expires_at: string | null;
}

/**
 * `open` means the seller has not replied. `answered` with nothing delivered
 * means the reply is on its way to the buyer. Closed and expired wait on
 * nobody.
 */
export function questionWaiting(status: string, deliveredAt: string | null): WaitingSide {
  if (status === 'open') return 'seller';
  if (status === 'answered') return deliveredAt ? 'nobody' : 'buyer';
  return 'nobody';
}

const QUESTION_COLUMNS = `
  handoff.id, handoff.status, handoff.reason, handoff.store_id, store.name AS store_name,
  CASE WHEN handoff.question_text IS NULL OR handoff.question_text = '' THEN 0 ELSE 1 END
    AS has_question,
  CASE WHEN handoff.reply_text IS NULL OR handoff.reply_text = '' THEN 0 ELSE 1 END
    AS has_reply,
  handoff.buyer_delivered_at, handoff.created_at, handoff.answered_at,
  handoff.closed_at, handoff.expires_at`;

const QUESTION_FROM = `
  FROM sotuvchi_handoffs AS handoff
  JOIN sotuvchi_stores AS store
    ON store.org_id = handoff.org_id AND store.id = handoff.store_id`;

function questionWhere(filters: QuestionListFilters): { sql: string; binds: unknown[] } {
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (filters.status) { clauses.push('handoff.status = ?'); binds.push(filters.status); }
  if (filters.storeId) { clauses.push('handoff.store_id = ?'); binds.push(filters.storeId); }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', binds };
}

function toQuestionRow(row: Row, now: Date): AdminQuestionRow {
  const status = text(row.status) as QuestionStatus;
  const delivered = nullableText(row.buyer_delivered_at);
  const waiting = questionWaiting(status, delivered);
  const createdAt = text(row.created_at);
  return {
    id: text(row.id),
    status,
    reason: text(row.reason),
    store_id: text(row.store_id),
    store_name: text(row.store_name),
    has_question: Number(row.has_question ?? 0) === 1,
    has_reply: Number(row.has_reply ?? 0) === 1,
    waiting_on: waiting,
    attention: attentionFor(waiting, createdAt, now),
    created_at: createdAt,
    answered_at: nullableText(row.answered_at),
    closed_at: nullableText(row.closed_at),
    expires_at: nullableText(row.expires_at),
  };
}

export async function listQuestionRows(
  db: D1Database,
  query: QuestionListQuery,
  now: Date,
): Promise<AdminQuestionRow[]> {
  const where = questionWhere(query);
  const rows = await db.prepare(
    `SELECT ${QUESTION_COLUMNS} ${QUESTION_FROM} ${where.sql}
      ORDER BY handoff.created_at DESC, handoff.id ASC
      LIMIT ? OFFSET ?`,
  ).bind(...where.binds, query.limit, query.offset).all<Row>();
  return (rows.results ?? []).map((row) => toQuestionRow(row, now));
}

export async function countQuestions(
  db: D1Database,
  filters: QuestionListFilters,
): Promise<number> {
  const where = questionWhere(filters);
  const row = await db.prepare(
    `SELECT COUNT(*) AS total FROM sotuvchi_handoffs AS handoff ${where.sql}`,
  ).bind(...where.binds).first<Row>();
  return Number(row?.total ?? 0);
}

export interface AdminQuestionDetail extends AdminQuestionRow {
  org_id: string;
  /**
   * Delivery bookkeeping. Counters, not addresses: the channel a notification
   * went to lives in `channel_addresses` and is never read here.
   */
  seller_notified_at: string | null;
  seller_notify_attempts: number;
  buyer_delivered_at: string | null;
  buyer_delivery_attempts: number;
  content_cleared_at: string | null;
  updated_at: string;
}

export async function getQuestionDetail(
  db: D1Database,
  questionId: string,
  now: Date,
): Promise<AdminQuestionDetail | null> {
  const row = await db.prepare(
    `SELECT ${QUESTION_COLUMNS}, handoff.org_id, handoff.updated_at,
            handoff.seller_notified_at, handoff.seller_notify_attempts,
            handoff.buyer_delivery_attempts, handoff.content_cleared_at
     ${QUESTION_FROM}
     WHERE handoff.id = ?`,
  ).bind(questionId).first<Row>();
  if (!row) return null;
  return {
    ...toQuestionRow(row, now),
    org_id: text(row.org_id),
    seller_notified_at: nullableText(row.seller_notified_at),
    seller_notify_attempts: Number(row.seller_notify_attempts ?? 0),
    buyer_delivered_at: nullableText(row.buyer_delivered_at),
    buyer_delivery_attempts: Number(row.buyer_delivery_attempts ?? 0),
    content_cleared_at: nullableText(row.content_cleared_at),
    updated_at: text(row.updated_at),
  };
}

// ── Summary ──────────────────────────────────────────────────────────────────

export interface OperationsSummary {
  orders_total: number;
  orders_awaiting_seller: number;
  questions_total: number;
  questions_open: number;
}

/**
 * Four counts, each answerable by a covering index, so the header of the screen
 * costs four index scans rather than a second pass over the rows.
 */
export async function operationsSummary(db: D1Database): Promise<OperationsSummary> {
  const [orders, questions] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'placed' AND fulfillment_status = 'none' THEN 1 ELSE 0 END)
                AS awaiting
         FROM sotuvchi_orders`,
    ).first<Row>(),
    db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count
         FROM sotuvchi_handoffs`,
    ).first<Row>(),
  ]);
  return {
    orders_total: Number(orders?.total ?? 0),
    orders_awaiting_seller: Number(orders?.awaiting ?? 0),
    questions_total: Number(questions?.total ?? 0),
    questions_open: Number(questions?.open_count ?? 0),
  };
}

/** A store filter that is not a store is a refusal, never a silent "all". */
export function requireStoreFilter(raw: string | null): string | null {
  if (raw === null || raw === '' || raw === 'all') return null;
  if (raw.length > OWNER_LIMITS.identifierLength || !/^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(raw)) {
    throw new OwnerValidationError('invalid_store');
  }
  return raw;
}
