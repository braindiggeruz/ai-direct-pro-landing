import type { Locale } from '../../../platform/contracts';
import { HandoffPersistenceError } from './errors';
import type {
  HandoffBuyerSession,
  HandoffReason,
  HandoffSummary,
  SellerReplySession,
  SotuvchiHandoff,
} from './types';
import {
  requireHandoffId,
  requireHandoffReason,
  requireHandoffStatus,
  requireHandoffVersion,
  requireSellerReplyState,
} from './validation';

const HANDOFF_COLUMNS = `
         id, org_id, store_id, buyer_identity_id, buyer_session_id,
         seller_identity_id, status, reason, question_text, reply_text,
         content_cleared_at, seller_notified_at, buyer_delivered_at,
         created_at, updated_at, answered_at, closed_at, expires_at, version`;

interface HandoffRow {
  id: string;
  org_id: string;
  store_id: string;
  buyer_identity_id: string;
  buyer_session_id: string;
  seller_identity_id: string | null;
  status: string;
  reason: string;
  question_text: string | null;
  reply_text: string | null;
  content_cleared_at: string | null;
  seller_notified_at: string | null;
  buyer_delivered_at: string | null;
  created_at: string;
  updated_at: string;
  answered_at: string | null;
  closed_at: string | null;
  expires_at: string;
  version: number;
}

export interface HandoffOperationRecord {
  orgId: string;
  storeId: string;
  idempotencyKey: string;
  operation: string;
  fingerprint: string;
  targetId: string;
  createdAt: string;
}

export interface HandoffOperationInput {
  idempotencyKey: string;
  operation: string;
  fingerprint: string;
  createdAt: string;
}

export interface CreateHandoffInput {
  id: string;
  orgId: string;
  storeId: string;
  buyerIdentityId: string;
  buyerSessionId: string;
  sellerIdentityId: string | null;
  reason: HandoffReason;
  questionText: string;
  createdAt: string;
  expiresAt: string;
}

export interface StartReplySessionInput {
  orgId: string;
  storeId: string;
  sellerIdentityId: string;
  handoffId: string;
  workflowInstanceId: string;
  requestKey: string;
  createdAt: string;
  expiresAt: string;
}

export interface HandoffStore {
  findBuyerSession(
    botUsername: string,
    identityId: string,
  ): Promise<HandoffBuyerSession | null>;
  findStoreOwner(orgId: string, storeId: string): Promise<string | null>;
  findStoreLocale(orgId: string, storeId: string): Promise<Locale | null>;
  findOrderBuyerIdentity(
    orgId: string,
    orderId: string,
  ): Promise<string | null>;
  getOperation(
    orgId: string,
    storeId: string,
    idempotencyKey: string,
  ): Promise<HandoffOperationRecord | null>;
  getHandoff(orgId: string, handoffId: string): Promise<SotuvchiHandoff | null>;
  findActiveForSession(
    orgId: string,
    storeId: string,
    buyerSessionId: string,
  ): Promise<SotuvchiHandoff | null>;
  listHandoffs(
    orgId: string,
    storeId: string,
    limit: number,
  ): Promise<HandoffSummary[]>;
  createHandoff(
    input: CreateHandoffInput,
    operation: HandoffOperationInput,
  ): Promise<readonly number[]>;
  answerHandoff(
    handoff: SotuvchiHandoff,
    sellerIdentityId: string,
    replyText: string,
    now: string,
    operation: HandoffOperationInput,
  ): Promise<readonly number[]>;
  closeHandoff(
    handoff: SotuvchiHandoff,
    sellerIdentityId: string,
    now: string,
    operation: HandoffOperationInput,
  ): Promise<readonly number[]>;
  /** Opportunistic retention sweep scoped to one store. */
  clearExpiredContent(
    orgId: string,
    storeId: string,
    now: string,
  ): Promise<readonly number[]>;
  startReplySession(
    input: StartReplySessionInput,
  ): Promise<number>;
  findReplySession(
    orgId: string,
    storeId: string,
    sellerIdentityId: string,
  ): Promise<SellerReplySession | null>;
  /** Store-agnostic lookup used before the owner store is known. */
  findReplySessionByOwner(
    orgId: string,
    sellerIdentityId: string,
  ): Promise<SellerReplySession | null>;
  settleReplySession(
    orgId: string,
    storeId: string,
    sellerIdentityId: string,
    state: 'completed' | 'cancelled',
    now: string,
  ): Promise<number>;
  listPendingSellerNotifications(
    orgId: string,
    storeId: string,
    limit: number,
  ): Promise<SotuvchiHandoff[]>;
  listPendingBuyerDeliveries(
    orgId: string,
    storeId: string,
    limit: number,
  ): Promise<SotuvchiHandoff[]>;
  claimSellerNotification(
    orgId: string,
    handoffId: string,
    now: string,
  ): Promise<number>;
  markSellerNotified(
    orgId: string,
    handoffId: string,
    now: string,
  ): Promise<number>;
  claimBuyerDelivery(
    orgId: string,
    handoffId: string,
    now: string,
  ): Promise<number>;
  markBuyerDelivered(
    orgId: string,
    handoffId: string,
    now: string,
  ): Promise<number>;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function optionalContent(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new HandoffPersistenceError('corrupt_row');
  }
  return value;
}

function fromRow(row: HandoffRow): SotuvchiHandoff {
  try {
    if (
      !validDate(row.created_at)
      || !validDate(row.updated_at)
      || !validDate(row.expires_at)
      || (row.answered_at !== null && !validDate(row.answered_at))
      || (row.closed_at !== null && !validDate(row.closed_at))
    ) {
      throw new HandoffPersistenceError('corrupt_row');
    }
    return {
      id: requireHandoffId(row.id),
      orgId: requireHandoffId(row.org_id),
      storeId: requireHandoffId(row.store_id),
      buyerIdentityId: requireHandoffId(row.buyer_identity_id),
      buyerSessionId: requireHandoffId(row.buyer_session_id),
      sellerIdentityId: row.seller_identity_id === null
        ? null
        : requireHandoffId(row.seller_identity_id),
      status: requireHandoffStatus(row.status),
      reason: requireHandoffReason(row.reason),
      questionText: optionalContent(row.question_text, 1_000),
      replyText: optionalContent(row.reply_text, 1_000),
      contentCleared: row.content_cleared_at !== null,
      sellerNotifiedAt: row.seller_notified_at,
      buyerDeliveredAt: row.buyer_delivered_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      answeredAt: row.answered_at,
      closedAt: row.closed_at,
      expiresAt: row.expires_at,
      version: requireHandoffVersion(row.version),
    };
  } catch (error) {
    if (error instanceof HandoffPersistenceError) throw error;
    throw new HandoffPersistenceError('corrupt_row');
  }
}

function changesOf(results: readonly D1Result<unknown>[]): readonly number[] {
  return results.map((result) => Number(result?.meta?.changes ?? 0));
}

export function createSotuvchiHandoffStore(db: D1Database): HandoffStore {
  function operationStatement(
    orgId: string,
    storeId: string,
    operation: HandoffOperationInput,
  ): D1PreparedStatement {
    return db.prepare(`INSERT INTO sotuvchi_handoff_operations
        (org_id, store_id, idempotency_key, operation, fingerprint,
         target_id, result_version, created_at)
        SELECT org_id, store_id, ?, ?, ?, id, version, ?
        FROM sotuvchi_handoffs
        WHERE org_id = ? AND store_id = ? AND last_operation_key = ?`)
      .bind(
        operation.idempotencyKey,
        operation.operation,
        operation.fingerprint,
        operation.createdAt,
        orgId,
        storeId,
        operation.idempotencyKey,
      );
  }

  /** Owner membership plus active store, evaluated inside the write itself. */
  const ownerGuard = `
     AND EXISTS (
       SELECT 1
         FROM sotuvchi_stores AS store
         JOIN memberships AS membership
           ON membership.org_id = store.org_id
          AND membership.identity_id = ?
          AND membership.role = 'owner'
          AND membership.status = 'active'
        WHERE store.org_id = sotuvchi_handoffs.org_id
          AND store.id = sotuvchi_handoffs.store_id
          AND store.status = 'active'
     )`;

  async function readHandoff(
    orgId: string,
    handoffId: string,
  ): Promise<SotuvchiHandoff | null> {
    const row = await db
      .prepare(`SELECT ${HANDOFF_COLUMNS}
                FROM sotuvchi_handoffs
                WHERE org_id = ? AND id = ?`)
      .bind(requireHandoffId(orgId), requireHandoffId(handoffId))
      .first<HandoffRow>();
    return row ? fromRow(row) : null;
  }

  async function readPending(
    sql: string,
    orgId: string,
    storeId: string,
    limit: number,
  ): Promise<SotuvchiHandoff[]> {
    const rows = await db
      .prepare(sql)
      .bind(requireHandoffId(orgId), requireHandoffId(storeId), limit)
      .all<HandoffRow>();
    return (rows.results ?? []).map(fromRow);
  }

  function replySessionFromRow(row: {
    org_id: string;
    store_id: string;
    seller_identity_id: string;
    handoff_id: string;
    workflow_instance_id: string;
    state: string;
    expires_at: string;
  }): SellerReplySession {
    if (!validDate(row.expires_at)) {
      throw new HandoffPersistenceError('corrupt_row');
    }
    return {
      orgId: requireHandoffId(row.org_id),
      storeId: requireHandoffId(row.store_id),
      sellerIdentityId: requireHandoffId(row.seller_identity_id),
      handoffId: requireHandoffId(row.handoff_id),
      workflowInstanceId: requireHandoffId(row.workflow_instance_id),
      state: requireSellerReplyState(row.state),
      expiresAt: row.expires_at,
    };
  }

  const REPLY_SESSION_COLUMNS = `org_id, store_id, seller_identity_id,
    handoff_id, workflow_instance_id, state, expires_at`;

  return {
    async findBuyerSession(botUsername, identityId) {
      const row = await db
        .prepare(`SELECT session.id AS id, session.org_id AS org_id,
                         session.store_id AS store_id,
                         session.identity_id AS identity_id,
                         store.locale AS locale
                  FROM sotuvchi_storefront_sessions AS session
                  JOIN sotuvchi_stores AS store
                    ON store.org_id = session.org_id
                   AND store.id = session.store_id
                   AND store.status = 'active'
                  JOIN telegram_agent_routes AS route
                    ON route.org_id = store.org_id
                   AND route.route_code = store.storefront_code
                   AND route.bot_username = session.bot_username
                   AND route.agent_id = 'sotuvchi'
                   AND route.status = 'active'
                  WHERE session.bot_username = ?
                    AND session.identity_id = ?
                    AND session.status = 'active'`)
        .bind(botUsername, requireHandoffId(identityId))
        .first<{
          id: string;
          org_id: string;
          store_id: string;
          identity_id: string;
          locale: string;
        }>();
      if (!row) return null;
      if (row.locale !== 'ru' && row.locale !== 'uz') {
        throw new HandoffPersistenceError('corrupt_row');
      }
      return {
        id: requireHandoffId(row.id),
        orgId: requireHandoffId(row.org_id),
        storeId: requireHandoffId(row.store_id),
        identityId: requireHandoffId(row.identity_id),
        locale: row.locale,
      };
    },

    async findStoreOwner(orgId, storeId) {
      const row = await db
        .prepare(`SELECT membership.identity_id AS identity_id
                  FROM sotuvchi_stores AS store
                  JOIN memberships AS membership
                    ON membership.org_id = store.org_id
                   AND membership.role = 'owner'
                   AND membership.status = 'active'
                  WHERE store.org_id = ? AND store.id = ?
                    AND store.status = 'active'
                  ORDER BY membership.identity_id ASC
                  LIMIT 1`)
        .bind(requireHandoffId(orgId), requireHandoffId(storeId))
        .first<{ identity_id: string }>();
      return row ? requireHandoffId(row.identity_id) : null;
    },

    async findStoreLocale(orgId, storeId) {
      const row = await db
        .prepare(`SELECT locale FROM sotuvchi_stores
                  WHERE org_id = ? AND id = ? AND status = 'active'`)
        .bind(requireHandoffId(orgId), requireHandoffId(storeId))
        .first<{ locale: string }>();
      if (!row) return null;
      if (row.locale !== 'ru' && row.locale !== 'uz') {
        throw new HandoffPersistenceError('corrupt_row');
      }
      return row.locale;
    },

    /** Recipient lookup for a P2.5 buyer notification intent. */
    async findOrderBuyerIdentity(orgId, orderId) {
      const row = await db
        .prepare(`SELECT session.identity_id AS identity_id
                  FROM sotuvchi_orders AS ordered
                  JOIN sotuvchi_storefront_sessions AS session
                    ON session.id = ordered.buyer_session_id
                   AND session.org_id = ordered.org_id
                  WHERE ordered.org_id = ? AND ordered.id = ?`)
        .bind(requireHandoffId(orgId), requireHandoffId(orderId))
        .first<{ identity_id: string }>();
      return row ? requireHandoffId(row.identity_id) : null;
    },

    async getOperation(orgId, storeId, idempotencyKey) {
      const row = await db
        .prepare(`SELECT org_id, store_id, idempotency_key, operation,
                         fingerprint, target_id, created_at
                  FROM sotuvchi_handoff_operations
                  WHERE org_id = ? AND store_id = ? AND idempotency_key = ?`)
        .bind(
          requireHandoffId(orgId),
          requireHandoffId(storeId),
          requireHandoffId(idempotencyKey),
        )
        .first<{
          org_id: string;
          store_id: string;
          idempotency_key: string;
          operation: string;
          fingerprint: string;
          target_id: string;
          created_at: string;
        }>();
      if (!row) return null;
      if (!validDate(row.created_at)) {
        throw new HandoffPersistenceError('corrupt_row');
      }
      return {
        orgId: requireHandoffId(row.org_id),
        storeId: requireHandoffId(row.store_id),
        idempotencyKey: requireHandoffId(row.idempotency_key),
        operation: row.operation,
        fingerprint: row.fingerprint,
        targetId: requireHandoffId(row.target_id),
        createdAt: row.created_at,
      };
    },

    getHandoff(orgId, handoffId) {
      return readHandoff(orgId, handoffId);
    },

    async findActiveForSession(orgId, storeId, buyerSessionId) {
      const row = await db
        .prepare(`SELECT ${HANDOFF_COLUMNS}
                  FROM sotuvchi_handoffs
                  WHERE org_id = ? AND store_id = ? AND buyer_session_id = ?
                    AND status IN ('open', 'answered')`)
        .bind(
          requireHandoffId(orgId),
          requireHandoffId(storeId),
          requireHandoffId(buyerSessionId),
        )
        .first<HandoffRow>();
      return row ? fromRow(row) : null;
    },

    async listHandoffs(orgId, storeId, limit) {
      const rows = await db
        .prepare(`SELECT id, status, reason, created_at,
                         reply_text IS NOT NULL AS has_reply,
                         content_cleared_at
                  FROM sotuvchi_handoffs
                  WHERE org_id = ? AND store_id = ?
                  ORDER BY created_at DESC, id ASC
                  LIMIT ?`)
        .bind(requireHandoffId(orgId), requireHandoffId(storeId), limit)
        .all<{
          id: string;
          status: string;
          reason: string;
          created_at: string;
          has_reply: number;
          content_cleared_at: string | null;
        }>();
      return (rows.results ?? []).map((row) => {
        if (!validDate(row.created_at)) {
          throw new HandoffPersistenceError('corrupt_row');
        }
        return {
          id: requireHandoffId(row.id),
          status: requireHandoffStatus(row.status),
          reason: requireHandoffReason(row.reason),
          createdAt: row.created_at,
          hasReply: Number(row.has_reply) === 1,
          contentCleared: row.content_cleared_at !== null,
        };
      });
    },

    async createHandoff(input, operation) {
      const results = await db.batch([
        db.prepare(`INSERT INTO sotuvchi_handoffs
            (id, org_id, store_id, buyer_identity_id, buyer_session_id,
             seller_identity_id, status, reason, question_text, reply_text,
             content_cleared_at, seller_notified_at, seller_notify_attempts,
             buyer_delivered_at, buyer_delivery_attempts, last_operation_key,
             created_at, updated_at, answered_at, closed_at, expires_at,
             version)
            SELECT ?, session.org_id, session.store_id, session.identity_id,
                   session.id, ?, 'open', ?, ?, NULL, NULL, NULL, 0, NULL, 0,
                   ?, ?, ?, NULL, NULL, ?, 1
            FROM sotuvchi_storefront_sessions AS session
            JOIN sotuvchi_stores AS store
              ON store.org_id = session.org_id
             AND store.id = session.store_id
             AND store.status = 'active'
            WHERE session.id = ? AND session.org_id = ?
              AND session.store_id = ? AND session.status = 'active'`)
          .bind(
            input.id,
            input.sellerIdentityId,
            input.reason,
            input.questionText,
            operation.idempotencyKey,
            input.createdAt,
            input.createdAt,
            input.expiresAt,
            input.buyerSessionId,
            input.orgId,
            input.storeId,
          ),
        operationStatement(input.orgId, input.storeId, operation),
      ]);
      return changesOf(results);
    },

    async answerHandoff(handoff, sellerIdentityId, replyText, now, operation) {
      const results = await db.batch([
        db.prepare(`UPDATE sotuvchi_handoffs
            SET status = 'answered',
                reply_text = ?,
                seller_identity_id = ?,
                answered_at = ?,
                updated_at = ?,
                last_operation_key = ?,
                version = version + 1
            WHERE org_id = ? AND store_id = ? AND id = ?
              AND status = 'open' AND version = ?
              AND reply_text IS NULL
              AND content_cleared_at IS NULL
              AND expires_at > ?
              ${ownerGuard}`)
          .bind(
            replyText,
            sellerIdentityId,
            now,
            now,
            operation.idempotencyKey,
            handoff.orgId,
            handoff.storeId,
            handoff.id,
            handoff.version,
            now,
            sellerIdentityId,
          ),
        operationStatement(handoff.orgId, handoff.storeId, operation),
      ]);
      return changesOf(results);
    },

    async closeHandoff(handoff, sellerIdentityId, now, operation) {
      const results = await db.batch([
        db.prepare(`UPDATE sotuvchi_handoffs
            SET status = 'closed',
                closed_at = ?,
                updated_at = ?,
                last_operation_key = ?,
                version = version + 1
            WHERE org_id = ? AND store_id = ? AND id = ?
              AND status IN ('open', 'answered') AND version = ?
              ${ownerGuard}`)
          .bind(
            now,
            now,
            operation.idempotencyKey,
            handoff.orgId,
            handoff.storeId,
            handoff.id,
            handoff.version,
            sellerIdentityId,
          ),
        operationStatement(handoff.orgId, handoff.storeId, operation),
      ]);
      return changesOf(results);
    },

    async clearExpiredContent(orgId, storeId, now) {
      const tenantId = requireHandoffId(orgId);
      const store = requireHandoffId(storeId);
      const results = await db.batch([
        db.prepare(`UPDATE sotuvchi_handoffs
            SET status = 'expired',
                question_text = NULL,
                reply_text = NULL,
                content_cleared_at = ?,
                updated_at = ?,
                version = version + 1
            WHERE org_id = ? AND store_id = ?
              AND status IN ('open', 'answered')
              AND expires_at <= ?`)
          .bind(now, now, tenantId, store, now),
        db.prepare(`UPDATE sotuvchi_handoffs
            SET question_text = NULL,
                reply_text = NULL,
                content_cleared_at = ?,
                updated_at = ?
            WHERE org_id = ? AND store_id = ?
              AND status IN ('closed', 'expired')
              AND content_cleared_at IS NULL
              AND expires_at <= ?`)
          .bind(now, now, tenantId, store, now),
      ]);
      return changesOf(results);
    },

    async startReplySession(input) {
      const result = await db
        .prepare(`INSERT INTO sotuvchi_seller_reply_sessions
            (org_id, store_id, seller_identity_id, handoff_id,
             workflow_instance_id, state, request_key,
             created_at, updated_at, expires_at)
            VALUES (?, ?, ?, ?, ?, 'awaiting_reply', ?, ?, ?, ?)
            ON CONFLICT (org_id, store_id, seller_identity_id) DO UPDATE SET
              handoff_id = excluded.handoff_id,
              workflow_instance_id = excluded.workflow_instance_id,
              state = 'awaiting_reply',
              request_key = excluded.request_key,
              updated_at = excluded.updated_at,
              expires_at = excluded.expires_at
            WHERE sotuvchi_seller_reply_sessions.request_key <> excluded.request_key`)
        .bind(
          input.orgId,
          input.storeId,
          input.sellerIdentityId,
          input.handoffId,
          input.workflowInstanceId,
          input.requestKey,
          input.createdAt,
          input.createdAt,
          input.expiresAt,
        )
        .run();
      return Number(result?.meta?.changes ?? 0);
    },

    async findReplySession(orgId, storeId, sellerIdentityId) {
      const row = await db
        .prepare(`SELECT ${REPLY_SESSION_COLUMNS}
                  FROM sotuvchi_seller_reply_sessions
                  WHERE org_id = ? AND store_id = ? AND seller_identity_id = ?`)
        .bind(
          requireHandoffId(orgId),
          requireHandoffId(storeId),
          requireHandoffId(sellerIdentityId),
        )
        .first<Parameters<typeof replySessionFromRow>[0]>();
      return row ? replySessionFromRow(row) : null;
    },

    async findReplySessionByOwner(orgId, sellerIdentityId) {
      const row = await db
        .prepare(`SELECT ${REPLY_SESSION_COLUMNS}
                  FROM sotuvchi_seller_reply_sessions
                  WHERE org_id = ? AND seller_identity_id = ?
                  ORDER BY updated_at DESC, store_id ASC
                  LIMIT 1`)
        .bind(
          requireHandoffId(orgId),
          requireHandoffId(sellerIdentityId),
        )
        .first<Parameters<typeof replySessionFromRow>[0]>();
      return row ? replySessionFromRow(row) : null;
    },

    async settleReplySession(orgId, storeId, sellerIdentityId, state, now) {
      const result = await db
        .prepare(`UPDATE sotuvchi_seller_reply_sessions
                  SET state = ?, updated_at = ?
                  WHERE org_id = ? AND store_id = ? AND seller_identity_id = ?
                    AND state = 'awaiting_reply'`)
        .bind(
          requireSellerReplyState(state),
          now,
          requireHandoffId(orgId),
          requireHandoffId(storeId),
          requireHandoffId(sellerIdentityId),
        )
        .run();
      return Number(result?.meta?.changes ?? 0);
    },

    listPendingSellerNotifications(orgId, storeId, limit) {
      return readPending(
        `SELECT ${HANDOFF_COLUMNS}
         FROM sotuvchi_handoffs
         WHERE org_id = ? AND store_id = ?
           AND status = 'open'
           AND seller_notified_at IS NULL
           AND seller_notify_attempts < 100
         ORDER BY created_at ASC, id ASC
         LIMIT ?`,
        orgId,
        storeId,
        limit,
      );
    },

    listPendingBuyerDeliveries(orgId, storeId, limit) {
      return readPending(
        `SELECT ${HANDOFF_COLUMNS}
         FROM sotuvchi_handoffs
         WHERE org_id = ? AND store_id = ?
           AND status = 'answered'
           AND buyer_delivered_at IS NULL
           AND reply_text IS NOT NULL
           AND buyer_delivery_attempts < 100
         ORDER BY answered_at ASC, id ASC
         LIMIT ?`,
        orgId,
        storeId,
        limit,
      );
    },

    async claimSellerNotification(orgId, handoffId, now) {
      const result = await db
        .prepare(`UPDATE sotuvchi_handoffs
                  SET seller_notify_attempts = seller_notify_attempts + 1,
                      updated_at = ?
                  WHERE org_id = ? AND id = ?
                    AND status = 'open'
                    AND seller_notified_at IS NULL
                    AND seller_notify_attempts < 100`)
        .bind(now, requireHandoffId(orgId), requireHandoffId(handoffId))
        .run();
      return Number(result?.meta?.changes ?? 0);
    },

    async markSellerNotified(orgId, handoffId, now) {
      const result = await db
        .prepare(`UPDATE sotuvchi_handoffs
                  SET seller_notified_at = ?, updated_at = ?
                  WHERE org_id = ? AND id = ? AND seller_notified_at IS NULL`)
        .bind(now, now, requireHandoffId(orgId), requireHandoffId(handoffId))
        .run();
      return Number(result?.meta?.changes ?? 0);
    },

    async claimBuyerDelivery(orgId, handoffId, now) {
      const result = await db
        .prepare(`UPDATE sotuvchi_handoffs
                  SET buyer_delivery_attempts = buyer_delivery_attempts + 1,
                      updated_at = ?
                  WHERE org_id = ? AND id = ?
                    AND status = 'answered'
                    AND buyer_delivered_at IS NULL
                    AND buyer_delivery_attempts < 100`)
        .bind(now, requireHandoffId(orgId), requireHandoffId(handoffId))
        .run();
      return Number(result?.meta?.changes ?? 0);
    },

    /** Successful delivery is what closes the conversation. */
    async markBuyerDelivered(orgId, handoffId, now) {
      const result = await db
        .prepare(`UPDATE sotuvchi_handoffs
                  SET buyer_delivered_at = ?,
                      status = 'closed',
                      closed_at = ?,
                      updated_at = ?,
                      version = version + 1
                  WHERE org_id = ? AND id = ?
                    AND status = 'answered'
                    AND buyer_delivered_at IS NULL`)
        .bind(
          now,
          now,
          now,
          requireHandoffId(orgId),
          requireHandoffId(handoffId),
        )
        .run();
      return Number(result?.meta?.changes ?? 0);
    },
  };
}
