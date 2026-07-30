// Read projections for the Owner Control Center.
//
// Every projection is deliberately narrow. The platform owner runs the
// platform, so they see counts, states and lifecycle timestamps — not buyer
// conversations, not buyer contact details, and never a seller's Telegram
// content. `sotuvchi_orders.buyer_name`, `buyer_phone` and `buyer_address`
// exist and are intentionally NOT selected here; the seller who owns the store
// is the only role that reads them, through the agent runtime.
export interface PlatformOverview {
  stores: { total: number; active: number; suspended: number; other: number };
  pilot: { active: number; paused: number; inactive: number };
  sellers: number;
  products: { total: number; published: number };
  orders: { today: number; last7d: number; placed: number; confirmed: number; done: number; cancelled: number };
  handoffs: { open: number; answered: number; closed: number; expired: number };
  automation: { queued: number; running: number; retry_wait: number; awaiting_review: number; dead_letter: number; completed: number };
  drafts: { pending_review: number; total: number };
  audit_events: number;
}

async function scalar(db: D1Database, sql: string, ...binds: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...binds).first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/**
 * Count rows grouped by a status column, tolerating a missing table so the
 * overview still renders on a database where an optional migration has not run.
 */
async function statusCounts(
  db: D1Database,
  table: string,
  column: string,
): Promise<Record<string, number>> {
  try {
    const rows = await db.prepare(
      `SELECT ${column} AS k, COUNT(*) AS n FROM ${table} GROUP BY ${column}`,
    ).all<{ k: string; n: number }>();
    const out: Record<string, number> = {};
    for (const row of rows.results ?? []) out[String(row.k)] = Number(row.n);
    return out;
  } catch {
    return {};
  }
}

export async function loadPlatformOverview(db: D1Database, now: Date): Promise<PlatformOverview> {
  const dayStart = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const storeStates = await statusCounts(db, 'sotuvchi_stores', 'status');
  const pilotStates = await statusCounts(db, 'owner_pilot_stores', 'state');
  const orderStates = await statusCounts(db, 'sotuvchi_orders', 'status');
  const handoffStates = await statusCounts(db, 'sotuvchi_handoffs', 'status');
  const automationStates = await statusCounts(db, 'automation_jobs', 'status');
  const draftStates = await statusCounts(db, 'ai_drafts', 'status');

  const storeTotal = Object.values(storeStates).reduce((a, b) => a + b, 0);
  const draftTotal = Object.values(draftStates).reduce((a, b) => a + b, 0);

  return {
    stores: {
      total: storeTotal,
      active: storeStates.active ?? 0,
      suspended: storeStates.suspended ?? 0,
      other: storeTotal - (storeStates.active ?? 0) - (storeStates.suspended ?? 0),
    },
    pilot: {
      active: pilotStates.active ?? 0,
      paused: pilotStates.paused ?? 0,
      inactive: pilotStates.inactive ?? 0,
    },
    sellers: await scalar(db, 'SELECT COUNT(DISTINCT owner_identity_id) AS n FROM sotuvchi_onboardings'),
    products: {
      total: await scalar(db, 'SELECT COUNT(*) AS n FROM sotuvchi_products'),
      published: await scalar(db, "SELECT COUNT(*) AS n FROM sotuvchi_products WHERE status = 'published'"),
    },
    orders: {
      today: await scalar(db, 'SELECT COUNT(*) AS n FROM sotuvchi_orders WHERE created_at >= ?', dayStart),
      last7d: await scalar(db, 'SELECT COUNT(*) AS n FROM sotuvchi_orders WHERE created_at >= ?', weekStart),
      placed: orderStates.placed ?? 0,
      confirmed: orderStates.confirmed ?? 0,
      done: orderStates.done ?? 0,
      cancelled: orderStates.cancelled ?? 0,
    },
    handoffs: {
      open: handoffStates.open ?? 0,
      answered: handoffStates.answered ?? 0,
      closed: handoffStates.closed ?? 0,
      expired: handoffStates.expired ?? 0,
    },
    automation: {
      queued: automationStates.queued ?? 0,
      running: (automationStates.running ?? 0) + (automationStates.leased ?? 0),
      retry_wait: automationStates.retry_wait ?? 0,
      awaiting_review: automationStates.awaiting_review ?? 0,
      dead_letter: automationStates.dead_letter ?? 0,
      completed: automationStates.completed ?? 0,
    },
    drafts: {
      pending_review: draftStates.pending_review ?? 0,
      total: draftTotal,
    },
    audit_events: await scalar(db, 'SELECT COUNT(*) AS n FROM owner_audit_events'),
  };
}

export interface StoreSummary {
  storeId: string;
  orgId: string;
  name: string;
  locale: string;
  status: string;
  storefrontCode: string;
  onboardingStatus: string;
  pilotState: string;
  products: number;
  publishedProducts: number;
  orders: number;
  openHandoffs: number;
  createdAt: string;
  updatedAt: string;
}

export async function listStoreSummaries(
  db: D1Database,
  options: { limit: number; offset: number; status?: string | null; pilotState?: string | null },
): Promise<StoreSummary[]> {
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (options.status) { clauses.push('store.status = ?'); binds.push(options.status); }
  if (options.pilotState) { clauses.push('COALESCE(pilot.state, \'inactive\') = ?'); binds.push(options.pilotState); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = await db.prepare(
    `SELECT store.id, store.org_id, store.name, store.locale, store.status,
            store.storefront_code, store.created_at, store.updated_at,
            COALESCE(pilot.state, 'inactive') AS pilot_state,
            COALESCE((
              SELECT onboarding.status
              FROM sotuvchi_onboardings AS onboarding
              WHERE onboarding.org_id = store.org_id
              ORDER BY onboarding.updated_at DESC, onboarding.id DESC
              LIMIT 1
            ), 'unknown') AS onboarding_status,
            (SELECT COUNT(*) FROM sotuvchi_products p
              WHERE p.org_id = store.org_id AND p.store_id = store.id) AS products,
            (SELECT COUNT(*) FROM sotuvchi_products p
              WHERE p.org_id = store.org_id AND p.store_id = store.id
                AND p.status = 'published') AS published_products,
            (SELECT COUNT(*) FROM sotuvchi_orders o
              WHERE o.org_id = store.org_id AND o.store_id = store.id) AS orders,
            (SELECT COUNT(*) FROM sotuvchi_handoffs h
              WHERE h.org_id = store.org_id AND h.store_id = store.id
                AND h.status = 'open') AS open_handoffs
     FROM sotuvchi_stores AS store
     LEFT JOIN owner_pilot_stores AS pilot
       ON pilot.org_id = store.org_id AND pilot.store_id = store.id
     ${where}
     ORDER BY store.created_at DESC, store.id ASC
     LIMIT ? OFFSET ?`,
  ).bind(...binds, options.limit, options.offset).all<Record<string, unknown>>();

  return (rows.results ?? []).map((row) => ({
    storeId: String(row.id),
    orgId: String(row.org_id),
    name: String(row.name),
    locale: String(row.locale),
    status: String(row.status),
    storefrontCode: String(row.storefront_code),
    onboardingStatus: String(row.onboarding_status),
    pilotState: String(row.pilot_state),
    products: Number(row.products),
    publishedProducts: Number(row.published_products),
    orders: Number(row.orders),
    openHandoffs: Number(row.open_handoffs),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export async function getStoreSummary(
  db: D1Database,
  storeId: string,
): Promise<StoreSummary | null> {
  const rows = await listStoreSummariesById(db, storeId);
  return rows[0] ?? null;
}

async function listStoreSummariesById(db: D1Database, storeId: string): Promise<StoreSummary[]> {
  const rows = await db.prepare(
    `SELECT store.id, store.org_id, store.name, store.locale, store.status,
            store.storefront_code, store.created_at, store.updated_at,
            COALESCE(pilot.state, 'inactive') AS pilot_state,
            COALESCE((
              SELECT onboarding.status
              FROM sotuvchi_onboardings AS onboarding
              WHERE onboarding.org_id = store.org_id
              ORDER BY onboarding.updated_at DESC, onboarding.id DESC
              LIMIT 1
            ), 'unknown') AS onboarding_status,
            (SELECT COUNT(*) FROM sotuvchi_products p
              WHERE p.org_id = store.org_id AND p.store_id = store.id) AS products,
            (SELECT COUNT(*) FROM sotuvchi_products p
              WHERE p.org_id = store.org_id AND p.store_id = store.id
                AND p.status = 'published') AS published_products,
            (SELECT COUNT(*) FROM sotuvchi_orders o
              WHERE o.org_id = store.org_id AND o.store_id = store.id) AS orders,
            (SELECT COUNT(*) FROM sotuvchi_handoffs h
              WHERE h.org_id = store.org_id AND h.store_id = store.id
                AND h.status = 'open') AS open_handoffs
     FROM sotuvchi_stores AS store
     LEFT JOIN owner_pilot_stores AS pilot
       ON pilot.org_id = store.org_id AND pilot.store_id = store.id
     WHERE store.id = ?`,
  ).bind(storeId).all<Record<string, unknown>>();
  return (rows.results ?? []).map((row) => ({
    storeId: String(row.id),
    orgId: String(row.org_id),
    name: String(row.name),
    locale: String(row.locale),
    status: String(row.status),
    storefrontCode: String(row.storefront_code),
    onboardingStatus: String(row.onboarding_status),
    pilotState: String(row.pilot_state),
    products: Number(row.products),
    publishedProducts: Number(row.published_products),
    orders: Number(row.orders),
    openHandoffs: Number(row.open_handoffs),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export interface OrderRow {
  orderId: string;
  orgId: string;
  storeId: string;
  orderNumber: string;
  status: string;
  fulfillmentStatus: string;
  totalMinor: number;
  currency: string;
  items: number;
  createdAt: string;
  placedAt: string | null;
}

/**
 * Orders without buyer identity. buyer_name, buyer_phone and buyer_address are
 * present in the table and deliberately not selected: the platform owner needs
 * volume and lifecycle, not the buyer.
 */
export async function listOrders(
  db: D1Database,
  options: { limit: number; offset: number; status?: string | null; storeId?: string | null },
): Promise<OrderRow[]> {
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (options.status) {
    clauses.push(options.status === 'confirmed' || options.status === 'done'
      ? 'o.fulfillment_status = ?'
      : 'o.status = ?');
    binds.push(options.status);
  }
  if (options.storeId) { clauses.push('o.store_id = ?'); binds.push(options.storeId); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.prepare(
    `SELECT o.id, o.org_id, o.store_id, o.order_number, o.status, o.fulfillment_status,
            o.total_minor, o.currency, o.created_at, o.placed_at,
            (SELECT COUNT(*) FROM sotuvchi_order_items i WHERE i.order_id = o.id) AS items
     FROM sotuvchi_orders AS o
     ${where}
     ORDER BY o.created_at DESC, o.id ASC
     LIMIT ? OFFSET ?`,
  ).bind(...binds, options.limit, options.offset).all<Record<string, unknown>>();
  return (rows.results ?? []).map((row) => ({
    orderId: String(row.id),
    orgId: String(row.org_id),
    storeId: String(row.store_id),
    orderNumber: String(row.order_number),
    status: String(row.status),
    fulfillmentStatus: String(row.fulfillment_status),
    totalMinor: Number(row.total_minor),
    currency: String(row.currency),
    items: Number(row.items),
    createdAt: String(row.created_at),
    placedAt: row.placed_at === null || row.placed_at === undefined ? null : String(row.placed_at),
  }));
}

export interface HandoffRow {
  handoffId: string;
  orgId: string;
  storeId: string;
  status: string;
  reason: string;
  hasQuestion: boolean;
  hasReply: boolean;
  sellerNotifyAttempts: number;
  buyerDeliveryAttempts: number;
  createdAt: string;
  answeredAt: string | null;
  closedAt: string | null;
  expiresAt: string | null;
}

/**
 * Handoff state without any message text. `question_text` and `reply_text` hold
 * buyer and seller words; the owner sees only whether they exist, so a support
 * user reading this screen cannot read a conversation.
 */
export async function listHandoffs(
  db: D1Database,
  options: { limit: number; offset: number; status?: string | null; storeId?: string | null },
): Promise<HandoffRow[]> {
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (options.status) { clauses.push('status = ?'); binds.push(options.status); }
  if (options.storeId) { clauses.push('store_id = ?'); binds.push(options.storeId); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.prepare(
    `SELECT id, org_id, store_id, status, reason,
            question_text IS NOT NULL AND question_text <> '' AS has_question,
            reply_text IS NOT NULL AND reply_text <> '' AS has_reply,
            seller_notify_attempts, buyer_delivery_attempts,
            created_at, answered_at, closed_at, expires_at
     FROM sotuvchi_handoffs
     ${where}
     ORDER BY created_at DESC, id ASC
     LIMIT ? OFFSET ?`,
  ).bind(...binds, options.limit, options.offset).all<Record<string, unknown>>();
  return (rows.results ?? []).map((row) => ({
    handoffId: String(row.id),
    orgId: String(row.org_id),
    storeId: String(row.store_id),
    status: String(row.status),
    reason: String(row.reason),
    hasQuestion: Number(row.has_question) === 1,
    hasReply: Number(row.has_reply) === 1,
    sellerNotifyAttempts: Number(row.seller_notify_attempts),
    buyerDeliveryAttempts: Number(row.buyer_delivery_attempts),
    createdAt: String(row.created_at),
    answeredAt: row.answered_at === null || row.answered_at === undefined ? null : String(row.answered_at),
    closedAt: row.closed_at === null || row.closed_at === undefined ? null : String(row.closed_at),
    expiresAt: row.expires_at === null || row.expires_at === undefined ? null : String(row.expires_at),
  }));
}

export interface AutomationJobRow {
  jobId: string;
  jobType: string;
  tenantKey: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  availableAt: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  resultRef: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listAutomationJobs(
  db: D1Database,
  options: { limit: number; offset: number; status?: string | null },
): Promise<AutomationJobRow[]> {
  const where = options.status ? 'WHERE status = ?' : '';
  const binds: unknown[] = options.status ? [options.status] : [];
  const rows = await db.prepare(
    `SELECT job_id, job_type, tenant_key, status, attempt_count, max_attempts,
            available_at, lease_owner, lease_expires_at, result_ref, last_error_code,
            created_at, updated_at
     FROM automation_jobs
     ${where}
     ORDER BY updated_at DESC, job_id ASC
     LIMIT ? OFFSET ?`,
  ).bind(...binds, options.limit, options.offset).all<Record<string, unknown>>();
  return (rows.results ?? []).map((row) => ({
    jobId: String(row.job_id),
    jobType: String(row.job_type),
    tenantKey: String(row.tenant_key),
    status: String(row.status),
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    availableAt: String(row.available_at),
    leaseOwner: row.lease_owner === null || row.lease_owner === undefined ? null : String(row.lease_owner),
    leaseExpiresAt: row.lease_expires_at === null || row.lease_expires_at === undefined ? null : String(row.lease_expires_at),
    resultRef: row.result_ref === null || row.result_ref === undefined ? null : String(row.result_ref),
    lastErrorCode: row.last_error_code === null || row.last_error_code === undefined ? null : String(row.last_error_code),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}
