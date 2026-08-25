export interface TelegramBusinessNonceRow {
  id: string;
  org_id: string;
  nonce_hash: string;
  user_chat_digest: string | null;
  start_update_digest: string | null;
  expires_at: string;
  used_at: string | null;
  superseded_at: string | null;
  connection_bound_at: string | null;
}

export interface TelegramBusinessConnectionRow {
  id: string;
  org_id: string;
  connection_digest: string;
  connection_ciphertext: string;
  connection_iv: string;
  user_chat_digest: string;
  user_chat_ciphertext: string;
  user_chat_iv: string;
  is_enabled: number;
  can_reply: number;
  lifecycle_update_id: number;
  lifecycle_event_at: string;
}

export interface TelegramBusinessCompanyRow {
  id: string;
  website: string | null;
  telegram_contact_json: string;
}

export interface TelegramBusinessEvidenceRow {
  id: string;
  org_id: string;
  company_id: string;
  field_path: string;
  value: string;
  source_url: string;
  source_type: string;
  observed_at: string;
  confidence: number;
  classification: string;
}

export interface TelegramBusinessSendTargetRow extends TelegramBusinessConnectionRow {
  binding_id: string;
  company_id: string;
  chat_ciphertext: string;
  chat_iv: string;
  endpoint_digest: string;
  website: string | null;
  telegram_contact_json: string;
  active_until: string;
  last_inbound_at: string;
}

export interface TelegramBusinessSendEffectRow {
  id: string;
  approval_id: string;
  payload_digest: string;
  approval_digest: string;
  status: 'reserved' | 'dispatching' | 'sent' | 'ambiguous' | 'canceled';
}

export interface TelegramBusinessApprovalRow {
  id: string;
  company_id: string;
  binding_id: string;
  token_digest: string;
  payload_digest: string;
  operator_digest: string;
  expires_at: string;
  consumed_at: string | null;
}

export interface TelegramBusinessConnectionStatusRow {
  id: string;
  is_enabled: number;
  can_reply: number;
  connected_at: string;
}

export interface TelegramBusinessEligibilityRow {
  binding_id: string;
  company_id: string;
  endpoint_digest: string;
  website: string | null;
  telegram_contact_json: string;
  is_enabled: number;
  can_reply: number;
  last_inbound_at: string;
  active_until: string;
}

interface D1WriteResult {
  meta?: { changes?: number; rows_written?: number };
}

function changes(result: D1WriteResult): number {
  return Number(result.meta?.changes ?? result.meta?.rows_written ?? 0);
}

/**
 * Tenant-scoped persistence for the Lead Radar Telegram Business adapter.
 * Bootstrap lookups accept only HMAC digests or a random public locator; once
 * they resolve an org, every mutation and subsequent read includes `org_id`.
 */
export class LeadRadarTelegramBusinessStore {
  constructor(private readonly db: D1Database) {}

  async createConnectNonce(input: {
    id: string;
    orgId: string;
    lookupKey: string;
    nonceHash: string;
    expiresAt: string;
    now: string;
  }): Promise<TelegramBusinessNonceRow | null> {
    try {
      await this.db.batch([
        this.db.prepare(`UPDATE lead_radar_tg_connect_nonces
          SET superseded_at = ?, updated_at = ?
          WHERE org_id = ? AND nonce_hash <> ?
            AND connection_bound_at IS NULL AND superseded_at IS NULL`)
          .bind(input.now, input.now, input.orgId, input.nonceHash),
        this.db.prepare(`INSERT INTO lead_radar_tg_connect_nonces (
          id, org_id, lookup_key, nonce_hash, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(input.id, input.orgId, input.lookupKey, input.nonceHash, input.expiresAt, input.now, input.now),
      ]);
    } catch {
      // A same-operation race reaches the unique nonce row created by the
      // winner. Any different uniqueness/storage error returns null below;
      // D1 batch atomicity leaves the previous active nonce unsuperseded.
    }
    return this.findOrgNonceByHash(input.orgId, input.nonceHash);
  }

  async findOrgNonceByHash(orgId: string, nonceHash: string): Promise<TelegramBusinessNonceRow | null> {
    return this.db.prepare(`SELECT id, org_id, nonce_hash, user_chat_digest,
      start_update_digest, expires_at, used_at, superseded_at, connection_bound_at
    FROM lead_radar_tg_connect_nonces
    WHERE org_id = ? AND nonce_hash = ?
    LIMIT 1`)
      .bind(orgId, nonceHash)
      .first<TelegramBusinessNonceRow>();
  }

  async findNonceForStart(lookupKey: string, nonceHash: string): Promise<TelegramBusinessNonceRow | null> {
    return this.db.prepare(`SELECT id, org_id, nonce_hash, user_chat_digest,
      start_update_digest, expires_at, used_at, superseded_at, connection_bound_at
    FROM lead_radar_tg_connect_nonces
    WHERE lookup_key = ? AND nonce_hash = ? AND superseded_at IS NULL
    LIMIT 1`)
      .bind(lookupKey, nonceHash)
      .first<TelegramBusinessNonceRow>();
  }

  async claimStartNonce(input: {
    orgId: string;
    id: string;
    nonceHash: string;
    userChatDigest: string;
    startUpdateDigest: string;
    now: string;
  }): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_tg_connect_nonces
      SET user_chat_digest = ?, start_update_digest = ?, used_at = ?, updated_at = ?
      WHERE org_id = ? AND id = ? AND nonce_hash = ?
        AND used_at IS NULL AND superseded_at IS NULL
        AND connection_bound_at IS NULL AND expires_at > ?`)
      .bind(
        input.userChatDigest,
        input.startUpdateDigest,
        input.now,
        input.now,
        input.orgId,
        input.id,
        input.nonceHash,
        input.now,
      )
      .run() as D1WriteResult;
    return changes(result) === 1;
  }

  async findPendingNoncesByUserDigest(
    userChatDigest: string,
    now: string,
  ): Promise<TelegramBusinessNonceRow[]> {
    const result = await this.db.prepare(`SELECT id, org_id, nonce_hash, user_chat_digest,
      start_update_digest, expires_at, used_at, superseded_at, connection_bound_at
    FROM lead_radar_tg_connect_nonces
    WHERE user_chat_digest = ? AND used_at IS NOT NULL
      AND superseded_at IS NULL AND connection_bound_at IS NULL AND expires_at > ?
    ORDER BY used_at DESC, id
    LIMIT 2`)
      .bind(userChatDigest, now)
      .all<TelegramBusinessNonceRow>();
    return result.results ?? [];
  }

  async markNonceConnectionBound(orgId: string, id: string, now: string): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_tg_connect_nonces
      SET connection_bound_at = ?, updated_at = ?
      WHERE org_id = ? AND id = ? AND used_at IS NOT NULL
        AND superseded_at IS NULL AND connection_bound_at IS NULL AND expires_at > ?`)
      .bind(now, now, orgId, id, now)
      .run() as D1WriteResult;
    return changes(result) === 1;
  }

  async findConnectionByDigest(connectionDigest: string): Promise<TelegramBusinessConnectionRow[]> {
    const result = await this.db.prepare(`SELECT id, org_id, connection_digest,
      connection_ciphertext, connection_iv, user_chat_digest,
      user_chat_ciphertext, user_chat_iv, is_enabled, can_reply,
      lifecycle_update_id, lifecycle_event_at
    FROM lead_radar_tg_business_connections
    WHERE connection_digest = ?
    LIMIT 2`)
      .bind(connectionDigest)
      .all<TelegramBusinessConnectionRow>();
    return result.results ?? [];
  }

  async insertConnection(input: TelegramBusinessConnectionRow & {
    connectedAt: string;
    updatedAt: string;
    disabledAt: string | null;
  }): Promise<void> {
    await this.db.prepare(`INSERT INTO lead_radar_tg_business_connections (
      id, org_id, connection_digest, connection_ciphertext, connection_iv,
      user_chat_digest, user_chat_ciphertext, user_chat_iv, is_enabled,
      can_reply, connected_at, lifecycle_update_id, lifecycle_event_at,
      updated_at, disabled_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        input.id,
        input.org_id,
        input.connection_digest,
        input.connection_ciphertext,
        input.connection_iv,
        input.user_chat_digest,
        input.user_chat_ciphertext,
        input.user_chat_iv,
        input.is_enabled,
        input.can_reply,
        input.connectedAt,
        input.lifecycle_update_id,
        input.lifecycle_event_at,
        input.updatedAt,
        input.disabledAt,
      )
      .run();
  }

  async insertConnectionFromNonce(input: TelegramBusinessConnectionRow & {
    nonceId: string;
    connectedAt: string;
    updatedAt: string;
    disabledAt: string | null;
  }): Promise<boolean> {
    try {
      const results = await this.db.batch([
        this.db.prepare(`INSERT INTO lead_radar_tg_business_connections (
          id, org_id, connection_digest, connection_ciphertext, connection_iv,
          user_chat_digest, user_chat_ciphertext, user_chat_iv, is_enabled,
          can_reply, connected_at, lifecycle_update_id, lifecycle_event_at,
          updated_at, disabled_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM lead_radar_tg_connect_nonces
          WHERE org_id = ? AND id = ? AND used_at IS NOT NULL
            AND superseded_at IS NULL AND connection_bound_at IS NULL AND expires_at > ?
        )`).bind(
          input.id,
          input.org_id,
          input.connection_digest,
          input.connection_ciphertext,
          input.connection_iv,
          input.user_chat_digest,
          input.user_chat_ciphertext,
          input.user_chat_iv,
          input.is_enabled,
          input.can_reply,
          input.connectedAt,
          input.lifecycle_update_id,
          input.lifecycle_event_at,
          input.updatedAt,
          input.disabledAt,
          input.org_id,
          input.nonceId,
          input.updatedAt,
        ),
        this.db.prepare(`UPDATE lead_radar_tg_connect_nonces
          SET connection_bound_at = ?, updated_at = ?
          WHERE org_id = ? AND id = ? AND used_at IS NOT NULL
            AND superseded_at IS NULL AND connection_bound_at IS NULL AND expires_at > ?`).bind(
          input.updatedAt,
          input.updatedAt,
          input.org_id,
          input.nonceId,
          input.updatedAt,
        ),
      ]);
      return changes(results[0] as D1WriteResult) === 1
        && changes(results[1] as D1WriteResult) === 1;
    } catch {
      return false;
    }
  }

  async updateConnectionLifecycle(input: {
    orgId: string;
    id: string;
    isEnabled: boolean;
    canReply: boolean;
    updateId: number;
    eventAt: string;
    observedAt: string;
  }): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_tg_business_connections
      SET is_enabled = ?, can_reply = ?, lifecycle_update_id = ?,
        lifecycle_event_at = ?, updated_at = ?, disabled_at = ?
      WHERE org_id = ? AND id = ?
        AND lifecycle_update_id < ?
        AND (lifecycle_event_at < ?
          OR (lifecycle_event_at = ? AND lifecycle_update_id < ?))`)
      .bind(
        input.isEnabled ? 1 : 0,
        input.canReply ? 1 : 0,
        input.updateId,
        input.eventAt,
        input.observedAt,
        input.isEnabled ? null : input.eventAt,
        input.orgId,
        input.id,
        input.updateId,
        input.eventAt,
        input.eventAt,
        input.updateId,
      )
      .run() as D1WriteResult;
    return changes(result) === 1;
  }

  async findBusinessCompaniesByUsername(
    orgId: string,
    normalizedUsername: string,
  ): Promise<TelegramBusinessCompanyRow[]> {
    const result = await this.db.prepare(`SELECT id, website, telegram_contact_json
    FROM lead_radar_companies
    WHERE org_id = ? AND suppressed = 0 AND lifecycle <> 'do_not_contact'
      AND json_valid(telegram_contact_json)
      AND json_extract(telegram_contact_json, '$.type') = 'business'
      AND lower(json_extract(telegram_contact_json, '$.username')) = ?
    ORDER BY id
    LIMIT 2`)
      .bind(orgId, normalizedUsername)
      .all<TelegramBusinessCompanyRow>();
    return result.results ?? [];
  }

  async findCompanyEvidenceByIds(
    orgId: string,
    companyId: string,
    evidenceIds: string[],
  ): Promise<TelegramBusinessEvidenceRow[]> {
    if (evidenceIds.length === 0) return [];
    const result = await this.db.prepare(`SELECT id, org_id, company_id,
      field_path, value, source_url, source_type, observed_at, confidence,
      classification
    FROM lead_radar_evidence
    WHERE org_id = ? AND company_id = ?
      AND id IN (SELECT value FROM json_each(?))
    ORDER BY id`)
      .bind(orgId, companyId, JSON.stringify(evidenceIds))
      .all<TelegramBusinessEvidenceRow>();
    return result.results ?? [];
  }

  async upsertCompanyChat(input: {
    id: string;
    orgId: string;
    connectionId: string;
    companyId: string;
    chatDigest: string;
    chatCiphertext: string;
    chatIv: string;
    endpointDigest: string;
    inboundAt: string;
    activeUntil: string;
    now: string;
  }): Promise<boolean> {
    try {
      const result = await this.db.prepare(`INSERT INTO lead_radar_tg_company_chats (
      id, org_id, connection_id, company_id, chat_digest, chat_ciphertext,
      chat_iv, endpoint_digest, first_inbound_at, last_inbound_at,
      active_until, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (org_id, connection_id, chat_digest) DO UPDATE SET
      chat_ciphertext = excluded.chat_ciphertext,
      chat_iv = excluded.chat_iv,
      endpoint_digest = excluded.endpoint_digest,
      last_inbound_at = CASE
        WHEN excluded.last_inbound_at > last_inbound_at THEN excluded.last_inbound_at
        ELSE last_inbound_at
      END,
      active_until = CASE
        WHEN excluded.active_until > active_until THEN excluded.active_until
        ELSE active_until
      END,
      updated_at = excluded.updated_at
    WHERE company_id = excluded.company_id`)
      .bind(
        input.id,
        input.orgId,
        input.connectionId,
        input.companyId,
        input.chatDigest,
        input.chatCiphertext,
        input.chatIv,
        input.endpointDigest,
        input.inboundAt,
        input.inboundAt,
        input.activeUntil,
        input.now,
      )
        .run() as D1WriteResult;
      return changes(result) === 1;
    } catch {
      return false;
    }
  }

  async claimWebhookUpdate(
    orgId: string,
    updateDigest: string,
    kind: 'start' | 'business_connection' | 'business_message',
    now: string,
  ): Promise<boolean> {
    const result = await this.db.prepare(`INSERT OR IGNORE INTO lead_radar_tg_webhook_updates (
      org_id, update_digest, update_kind, processed_at
    ) VALUES (?, ?, ?, ?)`)
      .bind(orgId, updateDigest, kind, now)
      .run() as D1WriteResult;
    return changes(result) === 1;
  }

  async hasWebhookUpdate(orgId: string, updateDigest: string): Promise<boolean> {
    const row = await this.db.prepare(`SELECT 1 AS present
    FROM lead_radar_tg_webhook_updates
    WHERE org_id = ? AND update_digest = ?
    LIMIT 1`)
      .bind(orgId, updateDigest)
      .first<{ present: number }>();
    return row?.present === 1;
  }

  async getSendTarget(
    orgId: string,
    companyId: string,
    bindingId: string,
  ): Promise<TelegramBusinessSendTargetRow | null> {
    return this.db.prepare(`SELECT
      c.id, c.org_id, c.connection_digest, c.connection_ciphertext,
      c.connection_iv, c.user_chat_digest, c.user_chat_ciphertext,
      c.user_chat_iv, c.is_enabled, c.can_reply,
      c.lifecycle_update_id, c.lifecycle_event_at,
      b.id AS binding_id, b.company_id, b.chat_ciphertext, b.chat_iv,
      b.endpoint_digest, company.website, company.telegram_contact_json,
      b.active_until, b.last_inbound_at
    FROM lead_radar_tg_company_chats b
    JOIN lead_radar_tg_business_connections c
      ON c.org_id = b.org_id AND c.id = b.connection_id
    JOIN lead_radar_companies company
      ON company.org_id = b.org_id AND company.id = b.company_id
    WHERE b.org_id = ? AND b.company_id = ? AND b.id = ?
      AND company.suppressed = 0 AND company.lifecycle <> 'do_not_contact'
    LIMIT 1`)
      .bind(orgId, companyId, bindingId)
      .first<TelegramBusinessSendTargetRow>();
  }

  async listOrgConnections(orgId: string): Promise<TelegramBusinessConnectionStatusRow[]> {
    const result = await this.db.prepare(`SELECT id, is_enabled, can_reply, connected_at
    FROM lead_radar_tg_business_connections
    WHERE org_id = ?
    ORDER BY updated_at DESC, id
    LIMIT 2`)
      .bind(orgId)
      .all<TelegramBusinessConnectionStatusRow>();
    return result.results ?? [];
  }

  async hasPendingOrgNonce(orgId: string, now: string): Promise<boolean> {
    const row = await this.db.prepare(`SELECT 1 AS present
    FROM lead_radar_tg_connect_nonces
    WHERE org_id = ? AND superseded_at IS NULL
      AND connection_bound_at IS NULL AND expires_at > ?
    LIMIT 1`)
      .bind(orgId, now)
      .first<{ present: number }>();
    return row?.present === 1;
  }

  async listActiveCompanyChats(orgId: string, now: string): Promise<TelegramBusinessEligibilityRow[]> {
    const result = await this.db.prepare(`SELECT
      binding.id AS binding_id,
      binding.company_id,
      binding.endpoint_digest,
      company.website,
      company.telegram_contact_json,
      connection.is_enabled,
      connection.can_reply,
      binding.last_inbound_at,
      binding.active_until
    FROM lead_radar_tg_company_chats binding
    JOIN lead_radar_tg_business_connections connection
      ON connection.org_id = binding.org_id AND connection.id = binding.connection_id
    JOIN lead_radar_companies company
      ON company.org_id = binding.org_id AND company.id = binding.company_id
    WHERE binding.org_id = ?
      AND binding.last_inbound_at <= ? AND binding.active_until > ?
      AND connection.is_enabled = 1 AND connection.can_reply = 1
      AND company.suppressed = 0 AND company.lifecycle <> 'do_not_contact'
      AND json_valid(company.telegram_contact_json)
      AND json_extract(company.telegram_contact_json, '$.type') = 'business'
    ORDER BY binding.company_id, binding.id
    LIMIT 101`)
      .bind(orgId, now, now)
      .all<TelegramBusinessEligibilityRow>();
    return result.results ?? [];
  }

  async findCompanyEligibilityCandidates(
    orgId: string,
    companyId: string,
  ): Promise<TelegramBusinessEligibilityRow[]> {
    const result = await this.db.prepare(`SELECT
      binding.id AS binding_id,
      binding.company_id,
      binding.endpoint_digest,
      company.website,
      company.telegram_contact_json,
      connection.is_enabled,
      connection.can_reply,
      binding.last_inbound_at,
      binding.active_until
    FROM lead_radar_tg_company_chats binding
    JOIN lead_radar_tg_business_connections connection
      ON connection.org_id = binding.org_id AND connection.id = binding.connection_id
    JOIN lead_radar_companies company
      ON company.org_id = binding.org_id AND company.id = binding.company_id
    WHERE binding.org_id = ? AND binding.company_id = ?
      AND company.suppressed = 0 AND company.lifecycle <> 'do_not_contact'
    ORDER BY binding.last_inbound_at DESC, binding.id
    LIMIT 2`)
      .bind(orgId, companyId)
      .all<TelegramBusinessEligibilityRow>();
    return result.results ?? [];
  }

  async findSendEffect(
    orgId: string,
    idempotencyKeyDigest: string,
  ): Promise<TelegramBusinessSendEffectRow | null> {
    return this.db.prepare(`SELECT id, approval_id, payload_digest, approval_digest, status
    FROM lead_radar_tg_send_effects
    WHERE org_id = ? AND idempotency_key_digest = ?
    LIMIT 1`)
      .bind(orgId, idempotencyKeyDigest)
      .first<TelegramBusinessSendEffectRow>();
  }

  async hasAmbiguousSendEffect(orgId: string, bindingId: string): Promise<boolean> {
    const row = await this.db.prepare(`SELECT 1 AS present
    FROM lead_radar_tg_send_effects
    WHERE org_id = ? AND binding_id = ? AND status = 'ambiguous'
    LIMIT 1`)
      .bind(orgId, bindingId)
      .first<{ present: number }>();
    return row?.present === 1;
  }

  async createSendApproval(input: {
    id: string;
    orgId: string;
    companyId: string;
    bindingId: string;
    tokenDigest: string;
    payloadDigest: string;
    operatorDigest: string;
    expiresAt: string;
    now: string;
  }): Promise<void> {
    await this.db.prepare(`INSERT INTO lead_radar_tg_send_approvals (
      id, org_id, company_id, binding_id, token_digest, payload_digest,
      operator_digest, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        input.id,
        input.orgId,
        input.companyId,
        input.bindingId,
        input.tokenDigest,
        input.payloadDigest,
        input.operatorDigest,
        input.expiresAt,
        input.now,
      )
      .run();
  }

  async findSendApproval(orgId: string, tokenDigest: string): Promise<TelegramBusinessApprovalRow | null> {
    return this.db.prepare(`SELECT id, company_id, binding_id, token_digest,
      payload_digest, operator_digest, expires_at, consumed_at
    FROM lead_radar_tg_send_approvals
    WHERE org_id = ? AND token_digest = ?
    LIMIT 1`)
      .bind(orgId, tokenDigest)
      .first<TelegramBusinessApprovalRow>();
  }

  async createSendEffect(input: {
    id: string;
    orgId: string;
    companyId: string;
    bindingId: string;
    idempotencyKeyDigest: string;
    payloadDigest: string;
    approvalTokenDigest: string;
    operatorDigest: string;
    now: string;
    dailyWindowStart: string;
    dailyLimit: number;
    cooldownAfter: string;
  }): Promise<boolean> {
    try {
      const results = await this.db.batch([
        this.db.prepare(`INSERT INTO lead_radar_tg_send_effects (
          id, org_id, binding_id, approval_id, idempotency_key_digest,
          payload_digest, approval_digest, status, created_at, updated_at
        ) SELECT ?, ?, binding.id, approval.id, ?, ?, approval.token_digest,
          'reserved', ?, ?
        FROM lead_radar_tg_send_approvals approval
        JOIN lead_radar_tg_company_chats binding
          ON binding.org_id = approval.org_id AND binding.id = approval.binding_id
        JOIN lead_radar_tg_business_connections connection
          ON connection.org_id = binding.org_id AND connection.id = binding.connection_id
        JOIN lead_radar_companies company
          ON company.org_id = binding.org_id AND company.id = binding.company_id
        WHERE approval.org_id = ? AND approval.company_id = ?
          AND approval.binding_id = ? AND approval.token_digest = ?
          AND approval.payload_digest = ? AND approval.operator_digest = ?
          AND approval.consumed_at IS NULL AND approval.expires_at > ?
          AND company.suppressed = 0 AND company.lifecycle <> 'do_not_contact'
          AND json_valid(company.telegram_contact_json)
          AND json_extract(company.telegram_contact_json, '$.type') = 'business'
          AND connection.is_enabled = 1 AND connection.can_reply = 1
          AND binding.last_inbound_at <= ? AND binding.active_until > ?
          AND NOT EXISTS (
            SELECT 1 FROM lead_radar_tg_send_effects unresolved
            WHERE unresolved.org_id = ? AND unresolved.binding_id = ?
              AND unresolved.status = 'ambiguous'
          )
          AND (
            SELECT COUNT(*) FROM lead_radar_tg_send_effects recent
            WHERE recent.org_id = ? AND recent.created_at >= ?
              AND recent.status <> 'canceled'
          ) < ?
          AND NOT EXISTS (
            SELECT 1 FROM lead_radar_tg_send_effects cooldown
            WHERE cooldown.org_id = ? AND cooldown.binding_id = ?
              AND cooldown.created_at > ? AND cooldown.status <> 'canceled'
          )`)
          .bind(
            input.id,
            input.orgId,
            input.idempotencyKeyDigest,
            input.payloadDigest,
            input.now,
            input.now,
            input.orgId,
            input.companyId,
            input.bindingId,
            input.approvalTokenDigest,
            input.payloadDigest,
            input.operatorDigest,
            input.now,
            input.now,
            input.now,
            input.orgId,
            input.bindingId,
            input.orgId,
            input.dailyWindowStart,
            input.dailyLimit,
            input.orgId,
            input.bindingId,
            input.cooldownAfter,
          ),
        this.db.prepare(`UPDATE lead_radar_tg_send_approvals
          SET consumed_at = ?
          WHERE org_id = ? AND token_digest = ? AND consumed_at IS NULL
            AND EXISTS (
              SELECT 1 FROM lead_radar_tg_send_effects effect
              WHERE effect.org_id = ? AND effect.id = ?
                AND effect.approval_id = lead_radar_tg_send_approvals.id
            )`)
          .bind(input.now, input.orgId, input.approvalTokenDigest, input.orgId, input.id),
      ]);
      return changes(results[0] as D1WriteResult) === 1
        && changes(results[1] as D1WriteResult) === 1;
    } catch {
      return false;
    }
  }

  async markSendDispatching(input: {
    orgId: string;
    companyId: string;
    bindingId: string;
    expectedWebsite: string | null;
    expectedTelegramContactJson: string;
    id: string;
    now: string;
  }): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_tg_send_effects AS effect
      SET status = 'dispatching', updated_at = ?
      WHERE effect.org_id = ? AND effect.id = ? AND effect.binding_id = ?
        AND effect.status = 'reserved'
        AND EXISTS (
          SELECT 1 FROM lead_radar_tg_company_chats binding
          JOIN lead_radar_tg_business_connections connection
            ON connection.org_id = binding.org_id AND connection.id = binding.connection_id
          JOIN lead_radar_companies company
            ON company.org_id = binding.org_id AND company.id = binding.company_id
          WHERE binding.org_id = effect.org_id AND binding.id = effect.binding_id
            AND binding.company_id = ?
            AND company.suppressed = 0 AND company.lifecycle <> 'do_not_contact'
            AND company.website IS ?
            AND company.telegram_contact_json = ?
            AND json_valid(company.telegram_contact_json)
            AND json_extract(company.telegram_contact_json, '$.type') = 'business'
            AND connection.is_enabled = 1 AND connection.can_reply = 1
            AND binding.last_inbound_at <= ? AND binding.active_until > ?
        )`)
      .bind(
        input.now,
        input.orgId,
        input.id,
        input.bindingId,
        input.companyId,
        input.expectedWebsite,
        input.expectedTelegramContactJson,
        input.now,
        input.now,
      )
      .run() as D1WriteResult;
    return changes(result) === 1;
  }

  async markSendCanceled(orgId: string, id: string, now: string): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_tg_send_effects
      SET status = 'canceled', updated_at = ?
      WHERE org_id = ? AND id = ? AND status = 'reserved'`)
      .bind(now, orgId, id)
      .run();
  }

  async markSendSent(
    orgId: string,
    id: string,
    providerMessageDigest: string,
    now: string,
  ): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_tg_send_effects
      SET status = 'sent', provider_message_digest = ?, sent_at = ?, updated_at = ?
      WHERE org_id = ? AND id = ? AND status = 'dispatching'`)
      .bind(providerMessageDigest, now, now, orgId, id)
      .run() as D1WriteResult;
    return changes(result) === 1;
  }

  async markSendAmbiguous(orgId: string, id: string, now: string): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_tg_send_effects
      SET status = 'ambiguous', updated_at = ?
      WHERE org_id = ? AND id = ? AND status = 'dispatching'`)
      .bind(now, orgId, id)
      .run();
  }

  async cancelCompanyOutreachAndDeleteChats(orgId: string, companyId: string, now: string): Promise<void> {
    await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_tg_send_effects
        SET status = CASE WHEN status = 'dispatching' THEN 'ambiguous' ELSE 'canceled' END,
          updated_at = ?
        WHERE org_id = ? AND status IN ('reserved', 'dispatching')
          AND binding_id IN (
            SELECT id FROM lead_radar_tg_company_chats
            WHERE org_id = ? AND company_id = ?
          )`).bind(now, orgId, orgId, companyId),
      this.db.prepare(`DELETE FROM lead_radar_tg_company_chats
        WHERE org_id = ? AND company_id = ?`).bind(orgId, companyId),
    ]);
  }

  async maintainTransport(input: {
    now: string;
    staleReservedBefore: string;
    staleDispatchingBefore: string;
    nonceBefore: string;
    updateBefore: string;
    chatBefore: string;
    terminalEffectBefore: string;
    disabledConnectionBefore: string;
  }): Promise<void> {
    await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_tg_send_effects
        SET status = 'ambiguous', updated_at = ?
        WHERE status = 'dispatching' AND updated_at < ?`)
        .bind(input.now, input.staleDispatchingBefore),
      this.db.prepare(`UPDATE lead_radar_tg_send_effects
        SET status = 'canceled', updated_at = ?
        WHERE status = 'reserved' AND updated_at < ?`)
        .bind(input.now, input.staleReservedBefore),
      this.db.prepare(`DELETE FROM lead_radar_tg_send_effects
        WHERE status IN ('sent', 'ambiguous', 'canceled') AND updated_at < ?`)
        .bind(input.terminalEffectBefore),
      this.db.prepare(`DELETE FROM lead_radar_tg_send_approvals
        WHERE expires_at < ? AND NOT EXISTS (
          SELECT 1 FROM lead_radar_tg_send_effects effect
          WHERE effect.org_id = lead_radar_tg_send_approvals.org_id
            AND effect.approval_id = lead_radar_tg_send_approvals.id
        )`).bind(input.now),
      this.db.prepare(`DELETE FROM lead_radar_tg_company_chats
        WHERE active_until < ?`).bind(input.chatBefore),
      this.db.prepare(`DELETE FROM lead_radar_tg_business_connections
        WHERE is_enabled = 0 AND updated_at < ?`).bind(input.disabledConnectionBefore),
      this.db.prepare(`DELETE FROM lead_radar_tg_connect_nonces
        WHERE expires_at < ? OR superseded_at < ?`).bind(input.nonceBefore, input.nonceBefore),
      this.db.prepare(`DELETE FROM lead_radar_tg_webhook_updates
        WHERE processed_at < ?`).bind(input.updateBefore),
    ]);
  }

  async purgeOrganizationTransport(orgId: string): Promise<void> {
    await this.db.batch([
      this.db.prepare(`DELETE FROM lead_radar_tg_business_connections WHERE org_id = ?`).bind(orgId),
      this.db.prepare(`DELETE FROM lead_radar_tg_connect_nonces WHERE org_id = ?`).bind(orgId),
      this.db.prepare(`DELETE FROM lead_radar_tg_webhook_updates WHERE org_id = ?`).bind(orgId),
    ]);
  }
}
