export type TelegramUserAccountStatus = 'pending' | 'connected' | 'paused' | 'revoked' | 'error';
export type TelegramCampaignStatus =
  | 'draft'
  | 'approved'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'failed';
export type TelegramCampaignRecipientStatus =
  | 'pending'
  | 'claimed'
  | 'dispatching'
  | 'sent'
  | 'failed'
  | 'ambiguous'
  | 'skipped_dnc'
  | 'skipped_stale'
  | 'stopped';

export interface TelegramUserAccountRow {
  id: string;
  org_id: string;
  gateway_account_ref: string | null;
  gateway_account_ref_digest: string | null;
  masked_label: string;
  status: TelegramUserAccountStatus;
  auth_request_digest: string;
  request_idempotency_digest: string;
  request_fingerprint: string;
  connected_at: string | null;
  last_health_at: string | null;
  quota_day: string;
  daily_reserved_count: number;
  next_dispatch_at: string;
  dispatch_lease_campaign_id: string | null;
  dispatch_lease_digest: string | null;
  dispatch_lease_expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  state_version: number;
}

export interface TelegramCampaignCompanyRow {
  id: string;
  name: string;
  canonical_key: string;
  website: string | null;
  domain: string | null;
  phone_digits: string | null;
  verified_website: number;
  verified_phone: number;
  telegram_contact_json: string;
  suppressed: number;
  lifecycle: string;
}

export interface TelegramCampaignApprovalRow {
  id: string;
  org_id: string;
  account_id: string;
  token_digest: string;
  idempotency_key_digest: string;
  selection_digest: string;
  content_digest: string;
  request_fingerprint: string;
  operator_digest: string;
  contact_basis: TelegramCampaignContactBasis;
  recipient_count: number;
  expires_at: string;
  consumed_at: string | null;
  consumed_campaign_id: string | null;
  attachment_id: string | null;
  attachment_digest: string | null;
}

export interface TelegramCampaignRow {
  id: string;
  org_id: string;
  account_id: string;
  approval_id: string;
  idempotency_key_digest: string;
  request_fingerprint: string;
  selection_digest: string;
  content_digest: string;
  operator_digest: string;
  contact_basis: TelegramCampaignContactBasis;
  template_ciphertext: string;
  template_iv: string;
  status: TelegramCampaignStatus;
  pause_reason: string | null;
  last_error_code: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  ambiguous_count: number;
  skipped_count: number;
  min_interval_seconds: number;
  next_send_at: string;
  approved_at: string | null;
  started_at: string | null;
  stopped_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
  state_version: number;
  attachment_id: string | null;
  attachment_digest: string | null;
}

export interface TelegramCampaignRecipientRow {
  id: string;
  org_id: string;
  campaign_id: string;
  company_id: string;
  sequence_no: number;
  endpoint_ciphertext: string;
  endpoint_iv: string;
  endpoint_digest: string;
  payload_ciphertext: string;
  payload_iv: string;
  rendered_content_digest: string;
  contact_fingerprint: string;
  status: TelegramCampaignRecipientStatus;
  claim_digest: string | null;
  lease_expires_at: string | null;
  attempt_count: number;
  provider_message_digest: string | null;
  last_error_code: string | null;
  claimed_at: string | null;
  dispatching_at: string | null;
  sent_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TelegramCampaignDispatchContextRow extends TelegramCampaignRecipientRow {
  account_id: string;
  campaign_status: TelegramCampaignStatus;
  campaign_template_ciphertext: string;
  campaign_template_iv: string;
  campaign_content_digest: string;
  campaign_contact_basis: TelegramCampaignContactBasis;
  campaign_operator_digest: string;
  campaign_attachment_id: string | null;
  campaign_attachment_digest: string | null;
  min_interval_seconds: number;
  account_status: TelegramUserAccountStatus;
  gateway_account_ref: string | null;
  company_telegram_contact_json: string;
  company_website: string | null;
  company_canonical_key: string;
  company_domain: string | null;
  company_phone_digits: string | null;
  company_verified_website: number;
  company_verified_phone: number;
  business_identity_digests_json: string;
  company_suppressed: number;
  company_lifecycle: string;
  effect_id: string;
  effect_status: 'reserved' | 'dispatching' | 'sent' | 'failed' | 'ambiguous' | 'canceled';
  effect_payload_digest: string;
  eligibility_contact_basis: TelegramCampaignContactBasis;
  eligibility_authorization_id: string;
  eligibility_evidence_digest: string;
  eligibility_reviewer_digest: string;
  eligibility_evidence_version: string;
  eligibility_verified_at: string;
  eligibility_expires_at: string;
}

export interface TelegramContactHistoryRow {
  org_id: string;
  identity_type: 'company' | 'endpoint' | 'business';
  identity_key: string;
  company_id: string;
  endpoint_digest: string;
  state: 'reserved' | 'sent' | 'ambiguous';
  campaign_id: string;
  recipient_id: string;
  effect_id: string;
  created_at: string;
  updated_at: string;
}

export type TelegramCampaignDataKeyState =
  | 'uninitialized'
  | 'ready'
  | 'mismatch'
  | 'legacy_unbound';

export type TelegramCampaignRoutingKeyState = TelegramCampaignDataKeyState;

export type TelegramAccountSafetyState =
  | 'ready'
  | 'cooldown'
  | 'review_required'
  | 'restricted'
  | 'disconnected';

export interface TelegramAccountSafetyRow {
  account_id: string;
  org_id: string;
  state: TelegramAccountSafetyState;
  reason_code: string | null;
  blocked_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface TelegramCampaignRecoveryRows {
  active: TelegramCampaignRow | null;
  latest: TelegramCampaignRow | null;
}

export interface TelegramContactAuthorizationRow {
  id: string;
  org_id: string;
  company_id: string;
  endpoint_digest: string;
  contact_basis: TelegramCampaignContactBasis;
  evidence_reference_digest: string;
  reviewer_digest: string;
  idempotency_key_digest: string;
  request_fingerprint: string;
  evidence_version: string;
  verified_at: string;
  expires_at: string;
  revoked_at: string | null;
  status: 'active' | 'revoked';
  created_at: string;
  updated_at: string;
}

export interface TelegramCampaignOperationRow {
  campaign_id: string;
  request_fingerprint: string;
  action: 'start' | 'pause' | 'resume' | 'stop' | 'fail';
  result_status: Exclude<TelegramCampaignStatus, 'draft'>;
}

export type TelegramCampaignContactBasis =
  | 'documented_consent'
  | 'inbound_request'
  | 'existing_relationship'
  | 'contractual_relationship';

export const TELEGRAM_CAMPAIGN_EVIDENCE_VERSION = 'campaign-contact-eligibility-v1';

const PURGED_CIPHERTEXT = 'purged_________________';
const PURGED_IV = 'purged__________';

interface D1WriteResult {
  meta?: { changes?: number; rows_written?: number };
}

function changes(result: D1WriteResult | undefined): number {
  return Number(result?.meta?.changes ?? result?.meta?.rows_written ?? 0);
}

const CAMPAIGN_SELECT = `SELECT id, org_id, account_id, approval_id,
  idempotency_key_digest, request_fingerprint, selection_digest, content_digest,
  operator_digest, contact_basis, template_ciphertext, template_iv, status, pause_reason,
  last_error_code, recipient_count, sent_count, failed_count, ambiguous_count,
  skipped_count, min_interval_seconds, next_send_at, approved_at, started_at,
  stopped_at, completed_at, failed_at, created_at, updated_at, state_version,
  (SELECT media.media_id FROM lead_radar_tg_campaign_media media
    WHERE media.org_id = lead_radar_tg_campaigns.org_id
      AND media.campaign_id = lead_radar_tg_campaigns.id) AS attachment_id,
  (SELECT media.media_digest FROM lead_radar_tg_campaign_media media
    WHERE media.org_id = lead_radar_tg_campaigns.org_id
      AND media.campaign_id = lead_radar_tg_campaigns.id) AS attachment_digest
FROM lead_radar_tg_campaigns`;

const ACCOUNT_SELECT = `SELECT id, org_id, gateway_account_ref,
  gateway_account_ref_digest, masked_label, status,
  auth_request_digest, request_idempotency_digest, request_fingerprint,
  connected_at, last_health_at, quota_day, daily_reserved_count,
  next_dispatch_at, dispatch_lease_campaign_id, dispatch_lease_digest,
  dispatch_lease_expires_at, revoked_at, created_at, updated_at, state_version
FROM lead_radar_tg_user_accounts`;

/** SQL-only, tenant-scoped persistence for Telegram account campaigns. */
export class LeadRadarTelegramCampaignStore {
  constructor(private readonly db: D1Database) {}

  /**
   * Establishes the tenant's campaign digest-key identity exactly once.
   *
   * Existing pre-migration campaign/account rows are represented by a NULL
   * sentinel and intentionally cannot auto-bind. This makes key replacement
   * fail closed before selection, claim, or any provider boundary.
   */
  async ensureDataKeyFingerprint(
    orgId: string,
    keyFingerprint: string,
    now: string,
  ): Promise<TelegramCampaignDataKeyState> {
    await this.db.prepare(`INSERT INTO lead_radar_tg_data_key_state (
      org_id, key_fingerprint, established_at, created_at, updated_at
    ) SELECT ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM lead_radar_tg_data_key_state WHERE org_id = ?
    ) AND NOT EXISTS (
      SELECT 1 FROM lead_radar_tg_user_accounts WHERE org_id = ?
      UNION ALL SELECT 1 FROM lead_radar_tg_campaign_approvals WHERE org_id = ?
      UNION ALL SELECT 1 FROM lead_radar_tg_campaigns WHERE org_id = ?
      UNION ALL SELECT 1 FROM lead_radar_tg_contact_authorizations WHERE org_id = ?
      UNION ALL SELECT 1 FROM lead_radar_tg_contact_history WHERE org_id = ?
    )
    ON CONFLICT (org_id) DO NOTHING`)
      .bind(
        orgId,
        keyFingerprint,
        now,
        now,
        now,
        orgId,
        orgId,
        orgId,
        orgId,
        orgId,
        orgId,
      )
      .run();
    const state = await this.db.prepare(`SELECT key_fingerprint
      FROM lead_radar_tg_data_key_state WHERE org_id = ? LIMIT 1`)
      .bind(orgId)
      .first<{ key_fingerprint: string | null }>();
    if (!state) return 'uninitialized';
    if (state.key_fingerprint === null) return 'legacy_unbound';
    return state.key_fingerprint === keyFingerprint ? 'ready' : 'mismatch';
  }

  async getDataKeyFingerprintState(
    orgId: string,
    keyFingerprint: string,
  ): Promise<TelegramCampaignDataKeyState> {
    const state = await this.db.prepare(`SELECT key_fingerprint
      FROM lead_radar_tg_data_key_state WHERE org_id = ? LIMIT 1`)
      .bind(orgId)
      .first<{ key_fingerprint: string | null }>();
    if (!state) {
      const legacy = await this.db.prepare(`SELECT 1 AS present FROM (
        SELECT org_id FROM lead_radar_tg_user_accounts WHERE org_id = ?
        UNION ALL SELECT org_id FROM lead_radar_tg_campaign_approvals WHERE org_id = ?
        UNION ALL SELECT org_id FROM lead_radar_tg_campaigns WHERE org_id = ?
        UNION ALL SELECT org_id FROM lead_radar_tg_contact_authorizations WHERE org_id = ?
        UNION ALL SELECT org_id FROM lead_radar_tg_contact_history WHERE org_id = ?
      ) LIMIT 1`)
        .bind(orgId, orgId, orgId, orgId, orgId)
        .first<{ present: number }>();
      return legacy ? 'legacy_unbound' : 'uninitialized';
    }
    if (state.key_fingerprint === null) return 'legacy_unbound';
    return state.key_fingerprint === keyFingerprint ? 'ready' : 'mismatch';
  }

  /**
   * Establishes the non-secret fingerprint of the gateway's stable routing
   * key. A tenant that already owns a routed account can never auto-bind a new
   * key, because that would address a different Durable Object/session.
   */
  async ensureRoutingKeyFingerprint(
    orgId: string,
    keyFingerprint: string,
    now: string,
  ): Promise<TelegramCampaignRoutingKeyState> {
    await this.db.prepare(`INSERT INTO lead_radar_tg_routing_key_state (
      org_id, key_fingerprint, established_at, created_at, updated_at
    ) SELECT ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM lead_radar_tg_routing_key_state WHERE org_id = ?
    ) AND NOT EXISTS (
      SELECT 1 FROM lead_radar_tg_user_accounts
      WHERE org_id = ? AND gateway_account_ref IS NOT NULL
    )
    ON CONFLICT (org_id) DO NOTHING`)
      .bind(orgId, keyFingerprint, now, now, now, orgId, orgId)
      .run();
    return this.getRoutingKeyFingerprintState(orgId, keyFingerprint);
  }

  async getRoutingKeyFingerprintState(
    orgId: string,
    keyFingerprint: string,
  ): Promise<TelegramCampaignRoutingKeyState> {
    const state = await this.db.prepare(`SELECT key_fingerprint
      FROM lead_radar_tg_routing_key_state WHERE org_id = ? LIMIT 1`)
      .bind(orgId)
      .first<{ key_fingerprint: string | null }>();
    if (!state) {
      const routedAccount = await this.db.prepare(`SELECT 1 AS present
        FROM lead_radar_tg_user_accounts
        WHERE org_id = ? AND gateway_account_ref IS NOT NULL LIMIT 1`)
        .bind(orgId)
        .first<{ present: number }>();
      return routedAccount ? 'legacy_unbound' : 'uninitialized';
    }
    if (state.key_fingerprint === null) return 'legacy_unbound';
    return state.key_fingerprint === keyFingerprint ? 'ready' : 'mismatch';
  }

  async getAccount(orgId: string, accountId: string): Promise<TelegramUserAccountRow | null> {
    return this.db.prepare(`${ACCOUNT_SELECT}
      WHERE org_id = ? AND id = ? LIMIT 1`)
      .bind(orgId, accountId)
      .first<TelegramUserAccountRow>();
  }

  async getActiveAccount(orgId: string): Promise<TelegramUserAccountRow | null> {
    return this.db.prepare(`${ACCOUNT_SELECT}
      WHERE org_id = ? AND status <> 'revoked'
      ORDER BY created_at DESC, id LIMIT 1`)
      .bind(orgId)
      .first<TelegramUserAccountRow>();
  }

  async getAccountSafety(
    orgId: string,
    accountId: string,
  ): Promise<TelegramAccountSafetyRow | null> {
    return this.db.prepare(`SELECT account_id, org_id, state, reason_code,
      blocked_until, created_at, updated_at
    FROM lead_radar_tg_account_safety
    WHERE org_id = ? AND account_id = ? LIMIT 1`)
      .bind(orgId, accountId)
      .first<TelegramAccountSafetyRow>();
  }

  async clearExpiredAccountCooldown(
    orgId: string,
    accountId: string,
    now: string,
  ): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_tg_account_safety
        SET state = 'ready', reason_code = NULL, blocked_until = NULL, updated_at = ?
        WHERE org_id = ? AND account_id = ? AND state = 'cooldown'
          AND blocked_until <= ?`)
        .bind(now, orgId, accountId, now),
      this.db.prepare(`UPDATE lead_radar_tg_user_accounts AS account
        SET status = 'connected', updated_at = ?, state_version = state_version + 1
        WHERE account.org_id = ? AND account.id = ? AND account.status = 'paused'
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_account_safety safety
            WHERE safety.org_id = account.org_id AND safety.account_id = account.id
              AND safety.state = 'ready'
          )`)
        .bind(now, orgId, accountId),
    ]) as D1WriteResult[];
    return changes(results[0]) === 1;
  }

  async findAccountByRequest(
    orgId: string,
    requestIdempotencyDigest: string,
  ): Promise<TelegramUserAccountRow | null> {
    return this.db.prepare(`${ACCOUNT_SELECT}
      WHERE org_id = ? AND request_idempotency_digest = ? LIMIT 1`)
      .bind(orgId, requestIdempotencyDigest)
      .first<TelegramUserAccountRow>();
  }

  async findAccountByAuthRequest(
    orgId: string,
    authRequestDigest: string,
  ): Promise<TelegramUserAccountRow | null> {
    return this.db.prepare(`${ACCOUNT_SELECT}
      WHERE org_id = ? AND auth_request_digest = ? AND status <> 'revoked'
      ORDER BY created_at DESC, id LIMIT 1`)
      .bind(orgId, authRequestDigest)
      .first<TelegramUserAccountRow>();
  }

  async createPendingAccount(orgId: string, input: {
    id: string;
    authRequestDigest: string;
    requestIdempotencyDigest: string;
    requestFingerprint: string;
    maskedLabel: string;
    now: string;
  }): Promise<boolean> {
    try {
      const result = await this.db.prepare(`INSERT INTO lead_radar_tg_user_accounts (
        id, org_id, masked_label, status, auth_request_digest,
        request_idempotency_digest, request_fingerprint, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`)
        .bind(
          input.id,
          orgId,
          input.maskedLabel,
          input.authRequestDigest,
          input.requestIdempotencyDigest,
          input.requestFingerprint,
          input.now,
          input.now,
        )
        .run() as D1WriteResult;
      return changes(result) === 1;
    } catch {
      return false;
    }
  }

  async completeAccountConnection(orgId: string, input: {
    accountId: string;
    expectedVersion: number;
    gatewayAccountRef: string;
    gatewayAccountRefDigest: string;
    maskedLabel: string;
    now: string;
  }): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_tg_user_accounts
      SET gateway_account_ref = (
          SELECT finalization.gateway_account_ref
          FROM lead_radar_tg_account_finalizations finalization
          WHERE finalization.org_id = ? AND finalization.account_id = ?
        ),
        gateway_account_ref_digest = (
          SELECT finalization.gateway_account_ref_digest
          FROM lead_radar_tg_account_finalizations finalization
          WHERE finalization.org_id = ? AND finalization.account_id = ?
        ),
        masked_label = (
          SELECT finalization.masked_label
          FROM lead_radar_tg_account_finalizations finalization
          WHERE finalization.org_id = ? AND finalization.account_id = ?
        ),
        status = 'connected',
        connected_at = COALESCE(connected_at, (
          SELECT finalization.provider_connected_at
          FROM lead_radar_tg_account_finalizations finalization
          WHERE finalization.org_id = ? AND finalization.account_id = ?
        )), last_health_at = ?,
        revoked_at = NULL, updated_at = ?, state_version = state_version + 1
      WHERE org_id = ? AND id = ? AND state_version = ?
        AND status = 'pending'
        AND EXISTS (
          SELECT 1 FROM lead_radar_tg_account_finalizations finalization
          WHERE finalization.org_id = ? AND finalization.account_id = ?
            AND finalization.gateway_account_ref = ?
            AND finalization.gateway_account_ref_digest = ?
            AND finalization.masked_label = ?
            AND finalization.account_state_version = ?
        )`)
      .bind(
        orgId,
        input.accountId,
        orgId,
        input.accountId,
        orgId,
        input.accountId,
        orgId,
        input.accountId,
        input.now,
        input.now,
        orgId,
        input.accountId,
        input.expectedVersion,
        orgId,
        input.accountId,
        input.gatewayAccountRef,
        input.gatewayAccountRefDigest,
        input.maskedLabel,
        input.expectedVersion,
      )
      ,
      this.db.prepare(`INSERT INTO lead_radar_tg_account_safety (
        account_id, org_id, state, reason_code, blocked_until, created_at, updated_at
      ) SELECT ?, ?, 'ready', NULL, NULL, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM lead_radar_tg_user_accounts
        WHERE org_id = ? AND id = ? AND status = 'connected'
          AND gateway_account_ref_digest = ? AND state_version = ?
          AND updated_at = ?
      )
      ON CONFLICT (org_id, account_id) DO UPDATE SET
        state = 'ready', reason_code = NULL, blocked_until = NULL,
        updated_at = excluded.updated_at`)
        .bind(
          input.accountId,
          orgId,
          input.now,
          input.now,
          orgId,
          input.accountId,
          input.gatewayAccountRefDigest,
          input.expectedVersion + 1,
          input.now,
        ),
      this.db.prepare(`DELETE FROM lead_radar_tg_account_finalizations
        WHERE org_id = ? AND account_id = ?
          AND gateway_account_ref_digest = ?
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_user_accounts account
            WHERE account.org_id = ? AND account.id = ?
              AND account.status = 'connected'
              AND account.gateway_account_ref_digest = ?
          )`)
        .bind(
          orgId,
          input.accountId,
          input.gatewayAccountRefDigest,
          orgId,
          input.accountId,
          input.gatewayAccountRefDigest,
        ),
    ]) as D1WriteResult[];
    return changes(results[0]) === 1;
  }

  async stageAccountFinalization(orgId: string, input: {
    accountId: string;
    expectedVersion: number;
    gatewayAccountRef: string;
    gatewayAccountRefDigest: string;
    maskedLabel: string;
    providerConnectedAt: string;
    now: string;
  }): Promise<boolean> {
    await this.db.prepare(`INSERT OR IGNORE INTO lead_radar_tg_account_finalizations (
      org_id, account_id, gateway_account_ref, gateway_account_ref_digest,
      masked_label, provider_connected_at, account_state_version,
      created_at, updated_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM lead_radar_tg_user_accounts account
      WHERE account.org_id = ? AND account.id = ?
        AND account.status = 'pending' AND account.state_version = ?
        AND account.gateway_account_ref IS NULL
        AND account.gateway_account_ref_digest IS NULL
    )`)
      .bind(
        orgId,
        input.accountId,
        input.gatewayAccountRef,
        input.gatewayAccountRefDigest,
        input.maskedLabel,
        input.providerConnectedAt,
        input.expectedVersion,
        input.now,
        input.now,
        orgId,
        input.accountId,
        input.expectedVersion,
      )
      .run();
    const staged = await this.db.prepare(`SELECT
      gateway_account_ref, gateway_account_ref_digest, masked_label,
      provider_connected_at, account_state_version
    FROM lead_radar_tg_account_finalizations
    WHERE org_id = ? AND account_id = ? LIMIT 1`)
      .bind(orgId, input.accountId)
      .first<{
        gateway_account_ref: string;
        gateway_account_ref_digest: string;
        masked_label: string;
        provider_connected_at: string;
        account_state_version: number;
      }>();
    return staged?.gateway_account_ref === input.gatewayAccountRef
      && staged.gateway_account_ref_digest === input.gatewayAccountRefDigest
      && staged.masked_label === input.maskedLabel
      && staged.provider_connected_at === input.providerConnectedAt
      && Number(staged.account_state_version) === input.expectedVersion;
  }

  async updateAccountStatus(orgId: string, input: {
    accountId: string;
    expectedVersion: number;
    status: 'connected' | 'paused' | 'error';
    now: string;
    healthy: boolean;
  }): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_tg_user_accounts
      SET status = ?, last_health_at = CASE WHEN ? = 1 THEN ? ELSE last_health_at END,
        updated_at = ?, state_version = state_version + 1
      WHERE org_id = ? AND id = ? AND state_version = ?
        AND (
          (status IN ('connected', 'paused', 'error') AND gateway_account_ref IS NOT NULL)
          OR (status = 'pending' AND ? = 'error' AND gateway_account_ref IS NULL)
        )`)
      .bind(
        input.status,
        input.healthy ? 1 : 0,
        input.now,
        input.now,
        orgId,
        input.accountId,
        input.expectedVersion,
        input.status,
      )
      .run() as D1WriteResult;
    return changes(result) === 1;
  }

  async revokeAccount(orgId: string, accountId: string, now: string): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients AS recipient
        SET status = CASE WHEN status = 'dispatching' THEN 'ambiguous' ELSE 'stopped' END,
          endpoint_ciphertext = ?, endpoint_iv = ?, payload_ciphertext = ?, payload_iv = ?,
          claim_digest = NULL, lease_expires_at = NULL,
          last_error_code = CASE WHEN status = 'dispatching'
            THEN 'account_disconnected_during_dispatch' ELSE 'account_disconnected' END,
          completed_at = ?, updated_at = ?
        WHERE recipient.org_id = ? AND recipient.status IN ('pending', 'claimed', 'dispatching')
          AND recipient.campaign_id IN (
            SELECT campaign.id FROM lead_radar_tg_campaigns campaign
            WHERE campaign.org_id = ? AND campaign.account_id = ?
              AND campaign.status IN ('approved', 'running', 'paused')
          )`)
        .bind(
          PURGED_CIPHERTEXT,
          PURGED_IV,
          PURGED_CIPHERTEXT,
          PURGED_IV,
          now,
          now,
          orgId,
          orgId,
          accountId,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_effects AS effect
        SET status = CASE WHEN status = 'dispatching' THEN 'ambiguous' ELSE 'canceled' END,
          completed_at = ?, updated_at = ?
        WHERE effect.org_id = ? AND effect.status IN ('reserved', 'dispatching')
          AND effect.campaign_id IN (
            SELECT campaign.id FROM lead_radar_tg_campaigns campaign
            WHERE campaign.org_id = ? AND campaign.account_id = ?
              AND campaign.status IN ('approved', 'running', 'paused')
          )`)
        .bind(now, now, orgId, orgId, accountId),
      this.db.prepare(`UPDATE lead_radar_tg_contact_history AS history
        SET state = 'ambiguous', reservation_quota_day = NULL,
          reservation_next_dispatch_at = NULL, updated_at = ?
        WHERE history.org_id = ? AND history.state = 'reserved'
          AND history.campaign_id IN (
            SELECT campaign.id FROM lead_radar_tg_campaigns campaign
            WHERE campaign.org_id = ? AND campaign.account_id = ?
              AND campaign.status IN ('approved', 'running', 'paused')
          )`)
        .bind(now, orgId, orgId, accountId),
      this.db.prepare(`UPDATE lead_radar_tg_campaigns AS campaign
        SET status = 'stopped', pause_reason = NULL,
          last_error_code = 'account_disconnected', stopped_at = ?,
          sent_count = (
            SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
              AND recipient.status = 'sent'
          ),
          failed_count = (
            SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
              AND recipient.status = 'failed'
          ),
          ambiguous_count = (
            SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
              AND recipient.status = 'ambiguous'
          ),
          skipped_count = (
            SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
              AND recipient.status IN ('skipped_dnc', 'skipped_stale', 'stopped')
          ),
          updated_at = ?, state_version = state_version + 1
        WHERE campaign.org_id = ? AND campaign.account_id = ?
          AND campaign.status IN ('approved', 'running', 'paused')`)
        .bind(now, now, orgId, accountId),
      this.db.prepare(`INSERT INTO lead_radar_tg_account_safety (
        account_id, org_id, state, reason_code, blocked_until, created_at, updated_at
      ) VALUES (?, ?, 'disconnected', 'operator_disconnected', NULL, ?, ?)
      ON CONFLICT (org_id, account_id) DO UPDATE SET
        state = 'disconnected', reason_code = 'operator_disconnected',
        blocked_until = NULL, updated_at = excluded.updated_at`)
        .bind(accountId, orgId, now, now),
      this.db.prepare(`UPDATE lead_radar_tg_user_accounts
        SET gateway_account_ref = NULL, gateway_account_ref_digest = NULL,
          dispatch_lease_campaign_id = NULL, dispatch_lease_digest = NULL,
          dispatch_lease_expires_at = NULL, status = 'revoked', revoked_at = ?,
          updated_at = ?, state_version = state_version + 1
        WHERE org_id = ? AND id = ? AND status <> 'revoked'`)
        .bind(now, now, orgId, accountId),
    ]) as D1WriteResult[];
    return changes(results[5]) === 1;
  }

  async findCompanies(
    orgId: string,
    companyIds: readonly string[],
  ): Promise<TelegramCampaignCompanyRow[]> {
    if (companyIds.length === 0) return [];
    const placeholders = companyIds.map(() => '?').join(', ');
    const result = await this.db.prepare(`SELECT company.id, company.name,
      company.canonical_key, company.website, company.domain,
      company.phone_digits, company.telegram_contact_json,
      company.suppressed, company.lifecycle,
      EXISTS (
        SELECT 1 FROM lead_radar_evidence evidence
        WHERE evidence.org_id = company.org_id AND evidence.company_id = company.id
          AND evidence.field_path = 'web.website'
          AND evidence.source_type = 'company_website'
          AND evidence.classification = 'fact' AND evidence.confidence >= 0.7
      ) AS verified_website,
      EXISTS (
        SELECT 1 FROM lead_radar_evidence evidence
        WHERE evidence.org_id = company.org_id AND evidence.company_id = company.id
          AND evidence.field_path = 'company_contacts.phone'
          AND evidence.source_type = 'company_website'
          AND evidence.classification = 'fact' AND evidence.confidence >= 0.7
      ) AS verified_phone
    FROM lead_radar_companies company
    WHERE company.org_id = ? AND company.id IN (${placeholders})
    ORDER BY company.id`)
      .bind(orgId, ...companyIds)
      .all<TelegramCampaignCompanyRow>();
    return result.results ?? [];
  }

  async findContactHistory(
    orgId: string,
    companyId: string,
    endpointDigest: string,
    businessIdentityDigests: readonly string[] = [],
  ): Promise<TelegramContactHistoryRow | null> {
    return this.db.prepare(`SELECT org_id, identity_type, identity_key,
      company_id, endpoint_digest, state,
      campaign_id, recipient_id, effect_id, created_at, updated_at
    FROM lead_radar_tg_contact_history
    WHERE org_id = ? AND (
      (identity_type = 'company' AND identity_key = ?)
      OR (identity_type = 'endpoint' AND identity_key = ?)
      OR (identity_type = 'business' AND identity_key IN (
        SELECT value FROM json_each(?) WHERE type = 'text'
      ))
    )
    ORDER BY CASE state WHEN 'sent' THEN 0 WHEN 'ambiguous' THEN 1 ELSE 2 END,
      identity_type, identity_key LIMIT 1`)
      .bind(orgId, companyId, endpointDigest, JSON.stringify(businessIdentityDigests))
      .first<TelegramContactHistoryRow>();
  }

  async findContactHistoryForSelections(
    orgId: string,
    candidates: ReadonlyArray<{
      companyId: string;
      endpointDigest: string;
      businessIdentityDigests: readonly string[];
    }>,
  ): Promise<Map<string, TelegramContactHistoryRow>> {
    if (candidates.length === 0) return new Map();
    const result = await this.db.prepare(`SELECT
      json_extract(candidate.value, '$.companyId') AS candidate_company_id,
      history.org_id, history.identity_type, history.identity_key,
      history.company_id, history.endpoint_digest, history.state,
      history.campaign_id, history.recipient_id, history.effect_id,
      history.created_at, history.updated_at
    FROM json_each(?) candidate
    JOIN lead_radar_tg_contact_history history
      ON history.org_id = ? AND (
        (history.identity_type = 'company'
          AND history.identity_key = json_extract(candidate.value, '$.companyId'))
        OR (history.identity_type = 'endpoint'
          AND history.identity_key = json_extract(candidate.value, '$.endpointDigest'))
        OR (history.identity_type = 'business' AND history.identity_key IN (
          SELECT value FROM json_each(
            json_extract(candidate.value, '$.businessIdentityDigests')
          ) WHERE type = 'text'
        ))
      )
    ORDER BY candidate_company_id,
      CASE history.state WHEN 'sent' THEN 0 WHEN 'ambiguous' THEN 1 ELSE 2 END,
      history.identity_type, history.identity_key`)
      .bind(JSON.stringify(candidates), orgId)
      .all<TelegramContactHistoryRow & { candidate_company_id: string }>();
    const history = new Map<string, TelegramContactHistoryRow>();
    for (const row of result.results ?? []) {
      if (!history.has(row.candidate_company_id)) history.set(row.candidate_company_id, row);
    }
    return history;
  }

  async getActiveContactAuthorizationsForSelections(
    orgId: string,
    candidates: ReadonlyArray<{ companyId: string; endpointDigest: string }>,
    contactBasis: TelegramCampaignContactBasis,
    now: string,
  ): Promise<Map<string, TelegramContactAuthorizationRow>> {
    if (candidates.length === 0) return new Map();
    const result = await this.db.prepare(`SELECT
      json_extract(candidate.value, '$.companyId') AS candidate_company_id,
      authorization.id, authorization.org_id, authorization.company_id,
      authorization.endpoint_digest, authorization.contact_basis,
      authorization.evidence_reference_digest, authorization.reviewer_digest,
      authorization.idempotency_key_digest, authorization.request_fingerprint,
      authorization.evidence_version, authorization.verified_at,
      authorization.expires_at, authorization.revoked_at,
      authorization.status, authorization.created_at, authorization.updated_at
    FROM json_each(?) candidate
    JOIN lead_radar_tg_contact_authorizations authorization
      ON authorization.org_id = ?
        AND authorization.company_id = json_extract(candidate.value, '$.companyId')
        AND authorization.endpoint_digest =
          json_extract(candidate.value, '$.endpointDigest')
        AND authorization.contact_basis = ?
        AND authorization.status = 'active'
        AND authorization.verified_at <= ? AND authorization.expires_at > ?
    ORDER BY candidate_company_id, authorization.verified_at DESC,
      authorization.created_at DESC, authorization.id`)
      .bind(JSON.stringify(candidates), orgId, contactBasis, now, now)
      .all<TelegramContactAuthorizationRow & { candidate_company_id: string }>();
    const authorizations = new Map<string, TelegramContactAuthorizationRow>();
    for (const row of result.results ?? []) {
      if (!authorizations.has(row.candidate_company_id)) {
        authorizations.set(row.candidate_company_id, row);
      }
    }
    return authorizations;
  }

  async getMediaSweepCursor(orgId: string): Promise<string | null> {
    const row = await this.db.prepare(`SELECT cursor
      FROM lead_radar_tg_media_sweep_state WHERE org_id = ? LIMIT 1`)
      .bind(orgId)
      .first<{ cursor: string | null }>();
    return row?.cursor ?? null;
  }

  async setMediaSweepCursor(orgId: string, cursor: string | null, now: string): Promise<void> {
    await this.db.prepare(`INSERT INTO lead_radar_tg_media_sweep_state (
      org_id, cursor, updated_at
    ) VALUES (?, ?, ?)
    ON CONFLICT (org_id) DO UPDATE SET
      cursor = excluded.cursor, updated_at = excluded.updated_at`)
      .bind(orgId, cursor, now)
      .run();
  }

  async getCampaignMaintenanceCursor(): Promise<string | null> {
    const row = await this.db.prepare(`SELECT cursor
      FROM lead_radar_tg_maintenance_state
      WHERE scope = 'campaign_tenants' LIMIT 1`)
      .first<{ cursor: string | null }>();
    return row?.cursor ?? null;
  }

  async setCampaignMaintenanceCursor(cursor: string | null, now: string): Promise<void> {
    await this.db.prepare(`INSERT INTO lead_radar_tg_maintenance_state (
      scope, cursor, updated_at
    ) VALUES ('campaign_tenants', ?, ?)
    ON CONFLICT (scope) DO UPDATE SET
      cursor = excluded.cursor, updated_at = excluded.updated_at`)
      .bind(cursor, now)
      .run();
  }

  async listCampaignMaintenanceOrganizations(
    afterOrgId: string | null,
    limit = 1,
  ): Promise<{ orgIds: string[]; nextCursor: string | null }> {
    // One tenant per cron keeps reconciliation/retention within the Workers
    // Free D1 budget. The cursor wraps to NULL after the last persisted tenant.
    const bounded = Math.max(1, Math.min(1, Math.trunc(limit)));
    const rows = await this.db.prepare(`SELECT org_id FROM (
        SELECT org_id FROM lead_radar_tg_user_accounts
        UNION SELECT org_id FROM lead_radar_tg_campaign_approvals
        UNION SELECT org_id FROM lead_radar_tg_campaigns
        UNION SELECT org_id FROM lead_radar_tg_contact_authorizations
        UNION SELECT org_id FROM lead_radar_tg_contact_history
      ) persisted
      WHERE (? IS NULL OR org_id > ?)
      ORDER BY org_id LIMIT ?`)
      .bind(afterOrgId, afterOrgId, bounded)
      .all<{ org_id: string }>();
    const orgIds = (rows.results ?? []).map((row) => row.org_id);
    return {
      orgIds,
      nextCursor: orgIds.length === bounded ? orgIds.at(-1) ?? null : null,
    };
  }

  async registerCampaignMediaObject(orgId: string, input: {
    mediaId: string;
    mediaDigest: string;
    expiresAt: string;
    now: string;
  }): Promise<boolean> {
    // `deleted` is a permanent idempotency tombstone. Allowing it to become
    // active again would let an older physical deleter remove a newer object
    // at the same deterministic key (ABA). A replacement upload must use a new
    // owner-generated idempotency key/media id.
    const result = await this.db.prepare(`INSERT INTO lead_radar_tg_media_objects (
      org_id, media_id, media_digest, status, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', ?, ?, ?)
    ON CONFLICT (org_id, media_id) DO UPDATE SET
      status = 'active', expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
    WHERE lead_radar_tg_media_objects.media_digest = excluded.media_digest
      AND lead_radar_tg_media_objects.status = 'active'`)
      .bind(
        orgId,
        input.mediaId,
        input.mediaDigest,
        input.expiresAt,
        input.now,
        input.now,
      )
      .run() as D1WriteResult;
    return changes(result) === 1;
  }

  /**
   * Atomically reserves private-R2 capacity before PutObject. Counting upload,
   * cleanup and active rows means a failed validation cannot be repeated
   * to grow orphan storage for free. The deliberately conservative limits are
   * far below the account allowance and make cost growth bounded per tenant.
   */
  async reserveCampaignMediaQuota(orgId: string, input: {
    mediaId: string;
    mediaDigest: string;
    sizeBytes: number;
    expiresAt: string;
    now: string;
    maxObjects?: number;
    maxBytes?: number;
  }): Promise<'reserved' | 'replayed' | 'quota_exceeded' | 'conflict'> {
    const maxObjects = Math.max(1, Math.min(100, Math.trunc(input.maxObjects ?? 100)));
    const maxBytes = Math.max(
      5_000_000,
      Math.min(250_000_000, Math.trunc(input.maxBytes ?? 250_000_000)),
    );
    const result = await this.db.prepare(`INSERT INTO lead_radar_tg_media_quota_reservations (
        org_id, media_id, media_digest, size_bytes, status,
        expires_at, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, 'reserved', ?, ?, ?
      WHERE (
        SELECT COUNT(*) FROM lead_radar_tg_media_quota_reservations
        WHERE org_id = ? AND status IN ('reserved', 'releasing', 'active')
      ) < ?
        AND COALESCE((
          SELECT SUM(size_bytes) FROM lead_radar_tg_media_quota_reservations
          WHERE org_id = ? AND status IN ('reserved', 'releasing', 'active')
        ), 0) + ? <= ?
      ON CONFLICT (org_id, media_id) DO NOTHING`)
      .bind(
        orgId,
        input.mediaId,
        input.mediaDigest,
        input.sizeBytes,
        input.expiresAt,
        input.now,
        input.now,
        orgId,
        maxObjects,
        orgId,
        input.sizeBytes,
        maxBytes,
      )
      .run() as D1WriteResult;
    if (changes(result) === 1) return 'reserved';
    // Refresh a matching upload lease before the caller touches R2. The CAS
    // makes a retry and the orphan reaper mutually exclusive: once cleanup has
    // changed the row to `releasing`, the retry fails closed and cannot create
    // an object after maintenance observed that the key was absent.
    const replay = await this.db.prepare(`UPDATE lead_radar_tg_media_quota_reservations
      SET updated_at = ?
      WHERE org_id = ? AND media_id = ? AND media_digest = ? AND size_bytes = ?
        AND status = 'reserved'`)
      .bind(input.now, orgId, input.mediaId, input.mediaDigest, input.sizeBytes)
      .run() as D1WriteResult;
    if (changes(replay) === 1) return 'replayed';
    const row = await this.db.prepare(`SELECT media_digest, size_bytes, status
      FROM lead_radar_tg_media_quota_reservations
      WHERE org_id = ? AND media_id = ? LIMIT 1`)
      .bind(orgId, input.mediaId)
      .first<{
        media_digest: string;
        size_bytes: number;
        status: 'reserved' | 'releasing' | 'active' | 'released';
      }>();
    if (!row) return 'quota_exceeded';
    return row.status === 'active'
      && row.media_digest === input.mediaDigest
      && Number(row.size_bytes) === input.sizeBytes
      ? 'replayed'
      : 'conflict';
  }

  async activateCampaignMediaQuota(orgId: string, input: {
    mediaId: string;
    mediaDigest: string;
    sizeBytes: number;
    now: string;
  }): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_tg_media_quota_reservations
      SET status = 'active', updated_at = ?
      WHERE org_id = ? AND media_id = ? AND media_digest = ? AND size_bytes = ?
        AND status IN ('reserved', 'active')`)
      .bind(input.now, orgId, input.mediaId, input.mediaDigest, input.sizeBytes)
      .run() as D1WriteResult;
    return changes(result) === 1;
  }

  async campaignMediaQuotaUsage(orgId: string): Promise<{
    objects: number;
    bytes: number;
  }> {
    const row = await this.db.prepare(`SELECT COUNT(*) AS objects,
        COALESCE(SUM(size_bytes), 0) AS bytes
      FROM lead_radar_tg_media_quota_reservations
      WHERE org_id = ? AND status IN ('reserved', 'releasing', 'active')`)
      .bind(orgId)
      .first<{ objects: number; bytes: number }>();
    return {
      objects: Number(row?.objects ?? 0),
      bytes: Number(row?.bytes ?? 0),
    };
  }

  /**
   * Returns at most one stale upload/cleanup lease. The caller must claim it,
   * verify the deterministic R2 key with HEAD, and only then finalize release.
   * Keeping this globally bounded protects the Workers/D1 Free request budget.
   */
  async listStaleCampaignMediaQuotaReservations(
    before: string,
    limit = 1,
  ): Promise<Array<{ org_id: string; media_id: string; updated_at: string }>> {
    const bounded = Math.max(1, Math.min(1, Math.trunc(limit)));
    const rows = await this.db.prepare(`SELECT org_id, media_id, updated_at
      FROM lead_radar_tg_media_quota_reservations
      WHERE status IN ('reserved', 'releasing') AND updated_at <= ?
      ORDER BY updated_at, org_id, media_id LIMIT ?`)
      .bind(before, bounded)
      .all<{ org_id: string; media_id: string; updated_at: string }>();
    return rows.results ?? [];
  }

  /** Takes an exclusive cleanup lease using the timestamp observed by list. */
  async claimStaleCampaignMediaQuotaReservation(input: {
    orgId: string;
    mediaId: string;
    observedUpdatedAt: string;
    before: string;
    now: string;
  }): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_tg_media_quota_reservations
      SET status = 'releasing', updated_at = ?
      WHERE org_id = ? AND media_id = ?
        AND status IN ('reserved', 'releasing')
        AND updated_at = ? AND updated_at <= ?`)
      .bind(
        input.now,
        input.orgId,
        input.mediaId,
        input.observedUpdatedAt,
        input.before,
      )
      .run() as D1WriteResult;
    return changes(result) === 1;
  }

  /**
   * Removes an orphan reservation only after the caller has proved R2 absence.
   * The registry guard is the final race barrier: a registered object always
   * keeps its quota even if the preceding HEAD was stale.
   */
  async completeStaleCampaignMediaQuotaRelease(input: {
    orgId: string;
    mediaId: string;
    cleanupLeaseAt: string;
  }): Promise<boolean> {
    const result = await this.db.prepare(`DELETE FROM lead_radar_tg_media_quota_reservations
      WHERE org_id = ? AND media_id = ? AND status = 'releasing'
        AND updated_at = ?
        AND NOT EXISTS (
          SELECT 1 FROM lead_radar_tg_media_objects object
          WHERE object.org_id = ? AND object.media_id = ?
        )`)
      .bind(
        input.orgId,
        input.mediaId,
        input.cleanupLeaseAt,
        input.orgId,
        input.mediaId,
      )
      .run() as D1WriteResult;
    return changes(result) === 1;
  }

  async restoreCampaignMediaQuotaReservation(
    orgId: string,
    mediaId: string,
    cleanupLeaseAt: string,
    now: string,
  ): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_tg_media_quota_reservations
      SET status = 'reserved', updated_at = ?
      WHERE org_id = ? AND media_id = ? AND status = 'releasing'
        AND updated_at = ?`)
      .bind(now, orgId, mediaId, cleanupLeaseAt)
      .run();
  }

  async isCampaignMediaActive(
    orgId: string,
    mediaId: string,
    mediaDigest: string,
    now: string,
  ): Promise<boolean> {
    const row = await this.db.prepare(`SELECT 1 AS found
      FROM lead_radar_tg_media_objects
      WHERE org_id = ? AND media_id = ? AND media_digest = ? AND status = 'active'
        AND expires_at > ?
      LIMIT 1`)
      .bind(orgId, mediaId, mediaDigest, now)
      .first<{ found: number }>();
    return Number(row?.found ?? 0) === 1;
  }

  async claimCampaignMediaDeletion(orgId: string, input: {
    mediaId: string;
    mediaDigest?: string;
    expiredBefore?: string;
    now: string;
  }): Promise<'claimed' | 'missing' | 'busy' | 'in_use' | 'digest_mismatch' | 'not_expired'> {
    const result = await this.db.prepare(`UPDATE lead_radar_tg_media_objects AS object
      SET status = 'deleting', updated_at = ?
      WHERE object.org_id = ? AND object.media_id = ? AND object.status = 'active'
        AND (? IS NULL OR object.media_digest = ?)
        AND (? IS NULL OR object.expires_at <= ?)
        AND NOT EXISTS (
          SELECT 1 FROM lead_radar_tg_campaign_approval_media media
          JOIN lead_radar_tg_campaign_approvals approval
            ON approval.org_id = media.org_id AND approval.id = media.approval_id
          WHERE media.org_id = object.org_id AND media.media_id = object.media_id
            AND approval.consumed_at IS NULL AND approval.expires_at > ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM lead_radar_tg_campaign_media media
          JOIN lead_radar_tg_campaigns campaign
            ON campaign.org_id = media.org_id AND campaign.id = media.campaign_id
          WHERE media.org_id = object.org_id AND media.media_id = object.media_id
            AND campaign.status IN ('approved', 'running', 'paused')
        )`)
      .bind(
        input.now,
        orgId,
        input.mediaId,
        input.mediaDigest ?? null,
        input.mediaDigest ?? null,
        input.expiredBefore ?? null,
        input.expiredBefore ?? null,
        input.now,
      )
      .run() as D1WriteResult;
    if (changes(result) === 1) return 'claimed';
    const row = await this.db.prepare(`SELECT media_digest, status, expires_at
      FROM lead_radar_tg_media_objects WHERE org_id = ? AND media_id = ? LIMIT 1`)
      .bind(orgId, input.mediaId)
      .first<{ media_digest: string; status: 'active' | 'deleting' | 'deleted'; expires_at: string }>();
    if (!row || row.status === 'deleted') return 'missing';
    if (row.status === 'deleting') return 'busy';
    if (input.mediaDigest && row.media_digest !== input.mediaDigest) return 'digest_mismatch';
    if (input.expiredBefore && row.expires_at > input.expiredBefore) return 'not_expired';
    return 'in_use';
  }

  async restoreCampaignMediaDeletion(
    orgId: string,
    mediaId: string,
    now: string,
  ): Promise<void> {
    await this.db.prepare(`UPDATE lead_radar_tg_media_objects
      SET status = 'active', updated_at = ?
      WHERE org_id = ? AND media_id = ? AND status = 'deleting'`)
      .bind(now, orgId, mediaId)
      .run();
  }

  async completeCampaignMediaDeletion(
    orgId: string,
    mediaId: string,
    now: string,
  ): Promise<void> {
    await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_tg_media_objects
        SET status = 'deleted', updated_at = ?
        WHERE org_id = ? AND media_id = ? AND status = 'deleting'`)
        .bind(now, orgId, mediaId),
      this.db.prepare(`UPDATE lead_radar_tg_media_quota_reservations
        SET status = 'released', updated_at = ?
        WHERE org_id = ? AND media_id = ? AND status IN ('reserved', 'active')`)
        .bind(now, orgId, mediaId),
    ]);
  }

  async listStaleCampaignMediaDeletions(
    before: string,
    limit = 1,
  ): Promise<Array<{ org_id: string; media_id: string }>> {
    const bounded = Math.max(1, Math.min(1, Math.trunc(limit)));
    const rows = await this.db.prepare(`SELECT org_id, media_id
      FROM lead_radar_tg_media_objects
      WHERE status = 'deleting' AND updated_at <= ?
      ORDER BY updated_at, org_id, media_id LIMIT ?`)
      .bind(before, bounded)
      .all<{ org_id: string; media_id: string }>();
    return rows.results ?? [];
  }

  async isCampaignMediaReferenced(
    orgId: string,
    mediaId: string,
    now: string,
  ): Promise<boolean> {
    const row = await this.db.prepare(`SELECT 1 AS found
    WHERE EXISTS (
      SELECT 1 FROM lead_radar_tg_campaign_approval_media media
      JOIN lead_radar_tg_campaign_approvals approval
        ON approval.org_id = media.org_id AND approval.id = media.approval_id
      WHERE media.org_id = ? AND media.media_id = ?
        AND approval.consumed_at IS NULL AND approval.expires_at > ?
    ) OR EXISTS (
      SELECT 1 FROM lead_radar_tg_campaign_media media
      JOIN lead_radar_tg_campaigns campaign
        ON campaign.org_id = media.org_id AND campaign.id = media.campaign_id
      WHERE media.org_id = ? AND media.media_id = ?
        AND campaign.status IN ('approved', 'running', 'paused')
    ) LIMIT 1`)
      .bind(orgId, mediaId, now, orgId, mediaId)
      .first<{ found: number }>();
    return Number(row?.found ?? 0) === 1;
  }

  async getContactAuthorizationByIdempotency(
    orgId: string,
    idempotencyKeyDigest: string,
  ): Promise<TelegramContactAuthorizationRow | null> {
    return this.db.prepare(`SELECT id, org_id, company_id, endpoint_digest,
      contact_basis, evidence_reference_digest, reviewer_digest,
      idempotency_key_digest, request_fingerprint, evidence_version,
      verified_at, expires_at, revoked_at, status, created_at, updated_at
    FROM lead_radar_tg_contact_authorizations
    WHERE org_id = ? AND idempotency_key_digest = ? LIMIT 1`)
      .bind(orgId, idempotencyKeyDigest)
      .first<TelegramContactAuthorizationRow>();
  }

  async getActiveContactAuthorization(orgId: string, input: {
    companyId: string;
    endpointDigest: string;
    contactBasis: TelegramCampaignContactBasis;
    now: string;
  }): Promise<TelegramContactAuthorizationRow | null> {
    return this.db.prepare(`SELECT id, org_id, company_id, endpoint_digest,
      contact_basis, evidence_reference_digest, reviewer_digest,
      idempotency_key_digest, request_fingerprint, evidence_version,
      verified_at, expires_at, revoked_at, status, created_at, updated_at
    FROM lead_radar_tg_contact_authorizations
    WHERE org_id = ? AND company_id = ? AND endpoint_digest = ?
      AND contact_basis = ? AND status = 'active'
      AND verified_at <= ? AND expires_at > ?
    ORDER BY verified_at DESC, created_at DESC, id DESC LIMIT 1`)
      .bind(
        orgId,
        input.companyId,
        input.endpointDigest,
        input.contactBasis,
        input.now,
        input.now,
      )
      .first<TelegramContactAuthorizationRow>();
  }

  async createContactAuthorization(orgId: string, input: {
    id: string;
    companyId: string;
    endpointDigest: string;
    contactBasis: TelegramCampaignContactBasis;
    evidenceReferenceDigest: string;
    reviewerDigest: string;
    idempotencyKeyDigest: string;
    requestFingerprint: string;
    evidenceVersion: string;
    verifiedAt: string;
    expiresAt: string;
    expectedContactJson: string;
    now: string;
  }): Promise<boolean> {
    try {
      const result = await this.db.prepare(`INSERT INTO lead_radar_tg_contact_authorizations (
        id, org_id, company_id, endpoint_digest, contact_basis,
        evidence_reference_digest, reviewer_digest, idempotency_key_digest,
        request_fingerprint, evidence_version, verified_at, expires_at,
        status, created_at, updated_at
      ) SELECT ?, ?, company.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?
      FROM lead_radar_companies company
      WHERE company.org_id = ? AND company.id = ?
        AND company.suppressed = 0 AND company.lifecycle <> 'do_not_contact'
        AND company.telegram_contact_json = ?`)
        .bind(
          input.id,
          orgId,
          input.endpointDigest,
          input.contactBasis,
          input.evidenceReferenceDigest,
          input.reviewerDigest,
          input.idempotencyKeyDigest,
          input.requestFingerprint,
          input.evidenceVersion,
          input.verifiedAt,
          input.expiresAt,
          input.now,
          input.now,
          orgId,
          input.companyId,
          input.expectedContactJson,
        )
        .run() as D1WriteResult;
      return changes(result) === 1;
    } catch {
      return false;
    }
  }

  async createApproval(orgId: string, input: {
    id: string;
    accountId: string;
    tokenDigest: string;
    idempotencyKeyDigest: string;
    selectionDigest: string;
    contentDigest: string;
    requestFingerprint: string;
    operatorDigest: string;
    contactBasis: TelegramCampaignContactBasis;
    recipientCount: number;
    expiresAt: string;
    now: string;
    attachment: { mediaId: string; mediaDigest: string } | null;
  }): Promise<boolean> {
    const approval = this.db.prepare(`INSERT INTO lead_radar_tg_campaign_approvals (
      id, org_id, account_id, token_digest, idempotency_key_digest,
      selection_digest, content_digest,
      request_fingerprint, operator_digest, contact_basis, recipient_count,
      expires_at, created_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    FROM lead_radar_tg_user_accounts account
    WHERE account.org_id = ? AND account.id = ? AND account.status = 'connected'
      AND (? IS NULL OR EXISTS (
        SELECT 1 FROM lead_radar_tg_media_objects object
        WHERE object.org_id = account.org_id AND object.media_id = ?
          AND object.media_digest = ? AND object.status = 'active'
          AND object.expires_at > ?
      ))`)
      .bind(
        input.id,
        orgId,
        input.accountId,
        input.tokenDigest,
        input.idempotencyKeyDigest,
        input.selectionDigest,
        input.contentDigest,
        input.requestFingerprint,
        input.operatorDigest,
        input.contactBasis,
        input.recipientCount,
        input.expiresAt,
        input.now,
        orgId,
        input.accountId,
        input.attachment?.mediaId ?? null,
        input.attachment?.mediaId ?? null,
        input.attachment?.mediaDigest ?? null,
        input.now,
      );
    if (!input.attachment) {
      return changes(await approval.run() as D1WriteResult) === 1;
    }
    const results = await this.db.batch([
      approval,
      this.db.prepare(`INSERT INTO lead_radar_tg_campaign_approval_media (
        approval_id, org_id, media_id, media_digest
      ) SELECT ?, ?, ?, ?
      FROM lead_radar_tg_campaign_approvals approval
      JOIN lead_radar_tg_media_objects object
        ON object.org_id = approval.org_id AND object.media_id = ?
          AND object.media_digest = ? AND object.status = 'active'
          AND object.expires_at > ?
      WHERE approval.org_id = ? AND approval.id = ?`)
        .bind(
          input.id,
          orgId,
          input.attachment.mediaId,
          input.attachment.mediaDigest,
          input.attachment.mediaId,
          input.attachment.mediaDigest,
          input.now,
          orgId,
          input.id,
        ),
    ]) as D1WriteResult[];
    return results.length === 2 && results.every((result) => changes(result) === 1);
  }

  async getApprovalByToken(
    orgId: string,
    tokenDigest: string,
  ): Promise<TelegramCampaignApprovalRow | null> {
    return this.db.prepare(`SELECT id, org_id, account_id, token_digest,
      idempotency_key_digest,
      selection_digest, content_digest, request_fingerprint, operator_digest,
      contact_basis, recipient_count, expires_at, consumed_at, consumed_campaign_id,
      (SELECT media.media_id FROM lead_radar_tg_campaign_approval_media media
        WHERE media.org_id = lead_radar_tg_campaign_approvals.org_id
          AND media.approval_id = lead_radar_tg_campaign_approvals.id) AS attachment_id,
      (SELECT media.media_digest FROM lead_radar_tg_campaign_approval_media media
        WHERE media.org_id = lead_radar_tg_campaign_approvals.org_id
          AND media.approval_id = lead_radar_tg_campaign_approvals.id) AS attachment_digest
    FROM lead_radar_tg_campaign_approvals
    WHERE org_id = ? AND token_digest = ? LIMIT 1`)
      .bind(orgId, tokenDigest)
      .first<TelegramCampaignApprovalRow>();
  }

  async getApprovalByIdempotency(
    orgId: string,
    idempotencyKeyDigest: string,
  ): Promise<TelegramCampaignApprovalRow | null> {
    return this.db.prepare(`SELECT id, org_id, account_id, token_digest,
      idempotency_key_digest, selection_digest, content_digest,
      request_fingerprint, operator_digest, contact_basis, recipient_count,
      expires_at, consumed_at, consumed_campaign_id,
      (SELECT media.media_id FROM lead_radar_tg_campaign_approval_media media
        WHERE media.org_id = lead_radar_tg_campaign_approvals.org_id
          AND media.approval_id = lead_radar_tg_campaign_approvals.id) AS attachment_id,
      (SELECT media.media_digest FROM lead_radar_tg_campaign_approval_media media
        WHERE media.org_id = lead_radar_tg_campaign_approvals.org_id
          AND media.approval_id = lead_radar_tg_campaign_approvals.id) AS attachment_digest
    FROM lead_radar_tg_campaign_approvals
    WHERE org_id = ? AND idempotency_key_digest = ? LIMIT 1`)
      .bind(orgId, idempotencyKeyDigest)
      .first<TelegramCampaignApprovalRow>();
  }

  async getCampaign(orgId: string, campaignId: string): Promise<TelegramCampaignRow | null> {
    return this.db.prepare(`${CAMPAIGN_SELECT}
      WHERE org_id = ? AND id = ? LIMIT 1`)
      .bind(orgId, campaignId)
      .first<TelegramCampaignRow>();
  }

  async getActiveCampaignForAccount(
    orgId: string,
    accountId: string,
  ): Promise<TelegramCampaignRow | null> {
    return this.db.prepare(`${CAMPAIGN_SELECT}
      WHERE org_id = ? AND account_id = ?
        AND status IN ('draft', 'approved', 'running', 'paused')
      ORDER BY created_at DESC, id DESC LIMIT 1`)
      .bind(orgId, accountId)
      .first<TelegramCampaignRow>();
  }

  async getCampaignRecovery(
    orgId: string,
    searchId: string,
  ): Promise<TelegramCampaignRecoveryRows> {
    const result = await this.db.prepare(`${CAMPAIGN_SELECT}
      WHERE org_id = ? AND id IN (
        SELECT campaign_id FROM lead_radar_tg_campaign_safety
        WHERE org_id = ? AND search_id = ?
      )
      ORDER BY created_at DESC, id DESC`)
      .bind(orgId, orgId, searchId)
      .all<TelegramCampaignRow>();
    const rows = result.results ?? [];
    return {
      active: rows.find((row) => (
        row.status === 'draft'
        || row.status === 'approved'
        || row.status === 'running'
        || row.status === 'paused'
      )) ?? null,
      latest: rows[0] ?? null,
    };
  }

  async findCampaignByIdempotency(
    orgId: string,
    idempotencyKeyDigest: string,
  ): Promise<TelegramCampaignRow | null> {
    return this.db.prepare(`${CAMPAIGN_SELECT}
      WHERE org_id = ? AND idempotency_key_digest = ? LIMIT 1`)
      .bind(orgId, idempotencyKeyDigest)
      .first<TelegramCampaignRow>();
  }

  async createApprovedCampaign(orgId: string, input: {
    id: string;
    accountId: string;
    approval: TelegramCampaignApprovalRow;
    idempotencyKeyDigest: string;
    requestFingerprint: string;
    selectionDigest: string;
    contentDigest: string;
    operatorDigest: string;
    contactBasis: TelegramCampaignContactBasis;
    searchId: string;
    templateCiphertext: string;
    templateIv: string;
    minIntervalSeconds: number;
    now: string;
    recipients: ReadonlyArray<{
      id: string;
      companyId: string;
      sequenceNo: number;
      endpointCiphertext: string;
      endpointIv: string;
      endpointDigest: string;
      payloadCiphertext: string;
      payloadIv: string;
      renderedContentDigest: string;
      contactFingerprint: string;
      businessIdentities: ReadonlyArray<{
        kind: 'canonical' | 'domain' | 'phone';
        digest: string;
      }>;
      expectedContactJson: string;
      effectId: string;
      effectKeyDigest: string;
      payloadDigest: string;
      eligibilityEvidenceDigest: string;
      eligibilityAuthorizationId: string;
      eligibilityReviewerDigest: string;
      eligibilityEvidenceVersion: string;
      eligibilityVerifiedAt: string;
      eligibilityExpiresAt: string;
    }>;
  }): Promise<boolean> {
    const businessIdentityCount = input.recipients.reduce(
      (count, recipient) => count + recipient.businessIdentities.length,
      0,
    );
    if (input.recipients.length < 1
      || input.recipients.length > 50
      || input.recipients.some((recipient) => (
        recipient.businessIdentities.length < 1
        || recipient.businessIdentities.length > 3
        || new Set(recipient.businessIdentities.map((identity) => identity.kind)).size
          !== recipient.businessIdentities.length
        || new Set(recipient.businessIdentities.map((identity) => identity.digest)).size
          !== recipient.businessIdentities.length
        || recipient.businessIdentities.some(
          (identity) => !/^[0-9a-f]{64}$/u.test(identity.digest),
        )
      ))) return false;
    // One bounded JSON binding feeds four set-based INSERTs. This keeps a
    // 50-recipient campaign below the D1 per-invocation statement budget while
    // preserving the enclosing batch transaction and exact change-count proof.
    const recipientsJson = JSON.stringify(input.recipients);
    const approvalMediaGuard = input.approval.attachment_id
      && input.approval.attachment_digest
      ? `EXISTS (
          SELECT 1 FROM lead_radar_tg_campaign_approval_media approval_media
          JOIN lead_radar_tg_media_objects media_object
            ON media_object.org_id = approval_media.org_id
              AND media_object.media_id = approval_media.media_id
              AND media_object.media_digest = approval_media.media_digest
              AND media_object.status = 'active'
              AND media_object.expires_at > ?
          WHERE approval_media.org_id = lead_radar_tg_campaign_approvals.org_id
            AND approval_media.approval_id = lead_radar_tg_campaign_approvals.id
            AND approval_media.media_id = ? AND approval_media.media_digest = ?
        )`
      : `NOT EXISTS (
          SELECT 1 FROM lead_radar_tg_campaign_approval_media approval_media
          WHERE approval_media.org_id = lead_radar_tg_campaign_approvals.org_id
            AND approval_media.approval_id = lead_radar_tg_campaign_approvals.id
        )`;
    const approvalMediaBindings = input.approval.attachment_id
      && input.approval.attachment_digest
      ? [input.now, input.approval.attachment_id, input.approval.attachment_digest]
      : [];
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`UPDATE lead_radar_tg_campaign_approvals
        SET consumed_at = ?, consumed_campaign_id = ?
        WHERE org_id = ? AND id = ? AND token_digest = ?
          AND account_id = ? AND selection_digest = ? AND content_digest = ?
          AND request_fingerprint = ? AND operator_digest = ? AND contact_basis = ?
          AND recipient_count = ? AND consumed_at IS NULL AND expires_at > ?
          AND ${approvalMediaGuard}`)
        .bind(
          input.now,
          input.id,
          orgId,
          input.approval.id,
          input.approval.token_digest,
          input.accountId,
          input.selectionDigest,
          input.contentDigest,
          input.approval.request_fingerprint,
          input.operatorDigest,
          input.contactBasis,
          input.recipients.length,
          input.now,
          ...approvalMediaBindings,
        ),
      this.db.prepare(`INSERT INTO lead_radar_tg_campaigns (
        id, org_id, account_id, approval_id, idempotency_key_digest,
        request_fingerprint, selection_digest, content_digest, operator_digest,
        contact_basis, template_ciphertext, template_iv, status, recipient_count,
        min_interval_seconds, next_send_at, approved_at, created_at, updated_at
      ) SELECT ?, ?, ?, approval.id, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?
      FROM lead_radar_tg_campaign_approvals approval
      JOIN lead_radar_tg_user_accounts account
        ON account.org_id = approval.org_id AND account.id = approval.account_id
      LEFT JOIN lead_radar_tg_account_safety safety
        ON safety.org_id = account.org_id AND safety.account_id = account.id
      WHERE approval.org_id = ? AND approval.id = ?
        AND approval.consumed_campaign_id = ? AND approval.consumed_at = ?
        AND account.status = 'connected'
        AND (safety.account_id IS NULL OR safety.state = 'ready')
        AND ${approvalMediaGuard.replaceAll(
          'lead_radar_tg_campaign_approvals',
          'approval',
        )}`)
        .bind(
          input.id,
          orgId,
          input.accountId,
          input.idempotencyKeyDigest,
          input.requestFingerprint,
          input.selectionDigest,
          input.contentDigest,
          input.operatorDigest,
          input.contactBasis,
          input.templateCiphertext,
          input.templateIv,
          input.recipients.length,
          input.minIntervalSeconds,
          input.now,
          input.now,
          input.now,
          input.now,
          orgId,
          input.approval.id,
          input.id,
          input.now,
          ...approvalMediaBindings,
        ),
      this.db.prepare(`INSERT INTO lead_radar_tg_campaign_safety (
        campaign_id, org_id, search_id, evidence_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(
          input.id,
          orgId,
          input.searchId,
          TELEGRAM_CAMPAIGN_EVIDENCE_VERSION,
          input.now,
          input.now,
        ),
    ];
    if (input.approval.attachment_id && input.approval.attachment_digest) {
      statements.push(
        this.db.prepare(`INSERT INTO lead_radar_tg_campaign_media (
          campaign_id, org_id, media_id, media_digest
        ) SELECT ?, ?, media.media_id, media.media_digest
        FROM lead_radar_tg_campaign_approval_media media
        JOIN lead_radar_tg_media_objects object
          ON object.org_id = media.org_id AND object.media_id = media.media_id
            AND object.media_digest = media.media_digest AND object.status = 'active'
            AND object.expires_at > ?
        WHERE media.org_id = ? AND media.approval_id = ?
          AND media.media_id = ? AND media.media_digest = ?`)
          .bind(
            input.id,
            orgId,
            input.now,
            orgId,
            input.approval.id,
            input.approval.attachment_id,
            input.approval.attachment_digest,
          ),
      );
    }
    statements.push(
      this.db.prepare(`INSERT INTO lead_radar_tg_campaign_recipients (
        id, org_id, campaign_id, company_id, sequence_no,
        endpoint_ciphertext, endpoint_iv, endpoint_digest, payload_ciphertext,
        payload_iv, rendered_content_digest, contact_fingerprint,
        status, created_at, updated_at
      ) SELECT
        json_extract(entry.value, '$.id'), ?, ?, (
          SELECT company.id FROM lead_radar_companies company
          WHERE company.org_id = ?
            AND company.id = json_extract(entry.value, '$.companyId')
            AND company.suppressed = 0 AND company.lifecycle <> 'do_not_contact'
            AND company.telegram_contact_json =
              json_extract(entry.value, '$.expectedContactJson')
          LIMIT 1
        ), CAST(json_extract(entry.value, '$.sequenceNo') AS INTEGER),
        json_extract(entry.value, '$.endpointCiphertext'),
        json_extract(entry.value, '$.endpointIv'),
        json_extract(entry.value, '$.endpointDigest'),
        json_extract(entry.value, '$.payloadCiphertext'),
        json_extract(entry.value, '$.payloadIv'),
        json_extract(entry.value, '$.renderedContentDigest'),
        json_extract(entry.value, '$.contactFingerprint'),
        'pending', ?, ?
      FROM json_each(?) entry
      ORDER BY CAST(json_extract(entry.value, '$.sequenceNo') AS INTEGER)`)
        .bind(orgId, input.id, orgId, input.now, input.now, recipientsJson),
      this.db.prepare(`INSERT INTO lead_radar_tg_recipient_business_identities (
        org_id, recipient_id, identity_kind, identity_digest
      ) SELECT ?, json_extract(recipient.value, '$.id'),
        json_extract(identity.value, '$.kind'),
        json_extract(identity.value, '$.digest')
      FROM json_each(?) recipient
      JOIN json_each(json_extract(recipient.value, '$.businessIdentities')) identity
      WHERE EXISTS (
        SELECT 1 FROM lead_radar_tg_campaign_recipients stored
        WHERE stored.org_id = ? AND stored.campaign_id = ?
          AND stored.id = json_extract(recipient.value, '$.id')
      )`)
        .bind(orgId, recipientsJson, orgId, input.id),
      this.db.prepare(`INSERT INTO lead_radar_tg_recipient_eligibility (
        recipient_id, org_id, campaign_id, authorization_id, contact_basis,
        evidence_digest, reviewer_digest, evidence_version, verified_at,
        expires_at, created_at, updated_at
      ) SELECT json_extract(entry.value, '$.id'), ?, ?,
        json_extract(entry.value, '$.eligibilityAuthorizationId'), ?,
        json_extract(entry.value, '$.eligibilityEvidenceDigest'),
        json_extract(entry.value, '$.eligibilityReviewerDigest'),
        json_extract(entry.value, '$.eligibilityEvidenceVersion'),
        json_extract(entry.value, '$.eligibilityVerifiedAt'),
        json_extract(entry.value, '$.eligibilityExpiresAt'), ?, ?
      FROM json_each(?) entry`)
        .bind(
          orgId,
          input.id,
          input.contactBasis,
          input.now,
          input.now,
          recipientsJson,
        ),
      this.db.prepare(`INSERT INTO lead_radar_tg_campaign_effects (
        id, org_id, campaign_id, recipient_id, effect_key_digest,
        payload_digest, status, created_at, updated_at
      ) SELECT json_extract(entry.value, '$.effectId'), ?, ?,
        json_extract(entry.value, '$.id'),
        json_extract(entry.value, '$.effectKeyDigest'),
        json_extract(entry.value, '$.payloadDigest'), 'reserved', ?, ?
      FROM json_each(?) entry`)
        .bind(orgId, input.id, input.now, input.now, recipientsJson),
    );
    try {
      const results = await this.db.batch(statements) as D1WriteResult[];
      const expectedChanges = [1, 1, 1];
      if (input.approval.attachment_id && input.approval.attachment_digest) {
        expectedChanges.push(1);
      }
      expectedChanges.push(
        input.recipients.length,
        businessIdentityCount,
        input.recipients.length,
        input.recipients.length,
      );
      return results.length === statements.length
        && results.every((result, index) => changes(result) === expectedChanges[index]);
    } catch {
      return false;
    }
  }

  async listRecipients(
    orgId: string,
    campaignId: string,
  ): Promise<TelegramCampaignRecipientRow[]> {
    const result = await this.db.prepare(`SELECT id, org_id, campaign_id,
      company_id, sequence_no, endpoint_ciphertext, endpoint_iv,
      endpoint_digest, payload_ciphertext, payload_iv, rendered_content_digest,
      contact_fingerprint, status, claim_digest,
      lease_expires_at, attempt_count, provider_message_digest,
      last_error_code, claimed_at, dispatching_at, sent_at, completed_at,
      created_at, updated_at
    FROM lead_radar_tg_campaign_recipients
    WHERE org_id = ? AND campaign_id = ?
    ORDER BY sequence_no, id`)
      .bind(orgId, campaignId)
      .all<TelegramCampaignRecipientRow>();
    return result.results ?? [];
  }

  async listDueCampaigns(
    orgId: string,
    now: string,
    limit: number,
  ): Promise<TelegramCampaignRow[]> {
    const boundedLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
    const result = await this.db.prepare(`SELECT campaign.id, campaign.org_id,
      campaign.account_id, campaign.approval_id, campaign.idempotency_key_digest,
      campaign.request_fingerprint, campaign.selection_digest,
      campaign.content_digest, campaign.operator_digest, campaign.contact_basis,
      campaign.template_ciphertext, campaign.template_iv, campaign.status,
      campaign.pause_reason, campaign.last_error_code, campaign.recipient_count,
      campaign.sent_count, campaign.failed_count, campaign.ambiguous_count,
      campaign.skipped_count, campaign.min_interval_seconds, campaign.next_send_at,
      campaign.approved_at, campaign.started_at, campaign.stopped_at,
      campaign.completed_at, campaign.failed_at, campaign.created_at,
      campaign.updated_at, campaign.state_version
    FROM lead_radar_tg_campaigns campaign
      JOIN lead_radar_tg_user_accounts account
        ON account.org_id = campaign.org_id AND account.id = campaign.account_id
      LEFT JOIN lead_radar_tg_account_safety safety
        ON safety.org_id = account.org_id AND safety.account_id = account.id
      WHERE campaign.org_id = ?
        AND campaign.status = 'running'
        AND campaign.next_send_at <= ?
        AND account.status = 'connected'
        AND account.next_dispatch_at <= ?
        AND account.dispatch_lease_digest IS NULL
        AND (safety.account_id IS NULL OR safety.state = 'ready')
        AND EXISTS (
          SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
          WHERE recipient.org_id = campaign.org_id
            AND recipient.campaign_id = campaign.id
            AND recipient.status = 'pending'
        )
      ORDER BY campaign.next_send_at, campaign.updated_at, campaign.id
      LIMIT ?`)
      .bind(orgId, now, now, boundedLimit)
      .all<TelegramCampaignRow>();
    return result.results ?? [];
  }

  async listExpiredLeaseCampaignIds(
    orgId: string,
    now: string,
    limit: number,
  ): Promise<string[]> {
    const boundedLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
    const result = await this.db.prepare(`SELECT dispatch_lease_campaign_id AS campaign_id
      FROM lead_radar_tg_user_accounts
      WHERE org_id = ? AND dispatch_lease_campaign_id IS NOT NULL
        AND dispatch_lease_expires_at <= ?
      ORDER BY dispatch_lease_expires_at, id
      LIMIT ?`)
      .bind(orgId, now, boundedLimit)
      .all<{ campaign_id: string }>();
    return (result.results ?? []).map((row) => row.campaign_id);
  }

  async claimNextRecipient(orgId: string, input: {
    campaignId: string;
    claimDigest: string;
    now: string;
    leaseExpiresAt: string;
  }): Promise<TelegramCampaignRecipientRow | null> {
    const results = await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_tg_user_accounts AS account
        SET dispatch_lease_campaign_id = ?, dispatch_lease_digest = ?,
          dispatch_lease_expires_at = ?, updated_at = ?,
          state_version = state_version + 1
        WHERE account.org_id = ? AND account.status = 'connected'
          AND account.dispatch_lease_digest IS NULL
          AND account.next_dispatch_at <= ?
          AND NOT EXISTS (
            SELECT 1 FROM lead_radar_tg_account_safety safety
            WHERE safety.org_id = account.org_id AND safety.account_id = account.id
              AND safety.state <> 'ready'
          )
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaigns campaign
            JOIN lead_radar_tg_campaign_recipients recipient
              ON recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
            WHERE campaign.org_id = account.org_id AND campaign.account_id = account.id
              AND campaign.id = ? AND campaign.status = 'running'
              AND campaign.next_send_at <= ? AND recipient.status = 'pending'
          )`)
        .bind(
          input.campaignId,
          input.claimDigest,
          input.leaseExpiresAt,
          input.now,
          orgId,
          input.now,
          input.campaignId,
          input.now,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients AS recipient
        SET status = 'claimed', claim_digest = ?, lease_expires_at = ?,
          claimed_at = ?, updated_at = ?
        WHERE recipient.org_id = ? AND recipient.campaign_id = ?
          AND recipient.status = 'pending'
          AND recipient.id = (
            SELECT candidate.id FROM lead_radar_tg_campaign_recipients candidate
            WHERE candidate.org_id = recipient.org_id
              AND candidate.campaign_id = recipient.campaign_id
              AND candidate.status = 'pending'
            ORDER BY candidate.sequence_no, candidate.id LIMIT 1
          )
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaigns campaign
            JOIN lead_radar_tg_user_accounts account
              ON account.org_id = campaign.org_id AND account.id = campaign.account_id
            WHERE campaign.org_id = recipient.org_id AND campaign.id = recipient.campaign_id
              AND campaign.status = 'running' AND account.status = 'connected'
              AND account.dispatch_lease_campaign_id = recipient.campaign_id
              AND account.dispatch_lease_digest = ?
              AND account.dispatch_lease_expires_at = ?
          )`)
        .bind(
          input.claimDigest,
          input.leaseExpiresAt,
          input.now,
          input.now,
          orgId,
          input.campaignId,
          input.claimDigest,
          input.leaseExpiresAt,
        ),
    ]) as D1WriteResult[];
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1) {
      if (changes(results[0]) === 1) {
        await this.releaseAccountDispatchLease(orgId, input.campaignId, input.claimDigest, input.now);
      }
      return null;
    }
    return this.db.prepare(`SELECT id, org_id, campaign_id, company_id,
      sequence_no, endpoint_ciphertext, endpoint_iv, endpoint_digest,
      payload_ciphertext, payload_iv, rendered_content_digest,
      contact_fingerprint, status, claim_digest, lease_expires_at,
      attempt_count, provider_message_digest, last_error_code, claimed_at,
      dispatching_at, sent_at, completed_at, created_at, updated_at
    FROM lead_radar_tg_campaign_recipients
    WHERE org_id = ? AND campaign_id = ? AND claim_digest = ? AND status = 'claimed'
    LIMIT 1`)
      .bind(orgId, input.campaignId, input.claimDigest)
      .first<TelegramCampaignRecipientRow>();
  }

  async getDispatchContext(orgId: string, input: {
    campaignId: string;
    recipientId: string;
    claimDigest: string;
  }): Promise<TelegramCampaignDispatchContextRow | null> {
    return this.db.prepare(`SELECT recipient.id, recipient.org_id,
      recipient.campaign_id, recipient.company_id, recipient.sequence_no,
      recipient.endpoint_ciphertext, recipient.endpoint_iv,
      recipient.endpoint_digest, recipient.payload_ciphertext,
      recipient.payload_iv, recipient.rendered_content_digest,
      recipient.contact_fingerprint,
      recipient.status, recipient.claim_digest, recipient.lease_expires_at,
      recipient.attempt_count, recipient.provider_message_digest,
      recipient.last_error_code, recipient.claimed_at,
      recipient.dispatching_at, recipient.sent_at, recipient.completed_at,
      recipient.created_at, recipient.updated_at,
      campaign.status AS campaign_status,
      campaign.account_id,
      campaign.template_ciphertext AS campaign_template_ciphertext,
      campaign.template_iv AS campaign_template_iv,
      campaign.content_digest AS campaign_content_digest,
      campaign.contact_basis AS campaign_contact_basis,
      campaign.operator_digest AS campaign_operator_digest,
      campaign_media.media_id AS campaign_attachment_id,
      campaign_media.media_digest AS campaign_attachment_digest,
      campaign.min_interval_seconds,
      account.status AS account_status,
      account.gateway_account_ref,
      company.telegram_contact_json AS company_telegram_contact_json,
      company.website AS company_website,
      company.canonical_key AS company_canonical_key,
      company.domain AS company_domain,
      company.phone_digits AS company_phone_digits,
      EXISTS (
        SELECT 1 FROM lead_radar_evidence evidence
        WHERE evidence.org_id = company.org_id AND evidence.company_id = company.id
          AND evidence.field_path = 'web.website'
          AND evidence.source_type = 'company_website'
          AND evidence.classification = 'fact' AND evidence.confidence >= 0.7
      ) AS company_verified_website,
      EXISTS (
        SELECT 1 FROM lead_radar_evidence evidence
        WHERE evidence.org_id = company.org_id AND evidence.company_id = company.id
          AND evidence.field_path = 'company_contacts.phone'
          AND evidence.source_type = 'company_website'
          AND evidence.classification = 'fact' AND evidence.confidence >= 0.7
      ) AS company_verified_phone,
      COALESCE((
        SELECT json_group_array(identity.identity_digest)
        FROM lead_radar_tg_recipient_business_identities identity
        WHERE identity.org_id = recipient.org_id AND identity.recipient_id = recipient.id
      ), '[]') AS business_identity_digests_json,
      company.suppressed AS company_suppressed,
      company.lifecycle AS company_lifecycle,
      effect.id AS effect_id, effect.status AS effect_status,
      effect.payload_digest AS effect_payload_digest,
      eligibility.contact_basis AS eligibility_contact_basis,
      eligibility.authorization_id AS eligibility_authorization_id,
      eligibility.evidence_digest AS eligibility_evidence_digest,
      eligibility.reviewer_digest AS eligibility_reviewer_digest,
      eligibility.evidence_version AS eligibility_evidence_version,
      eligibility.verified_at AS eligibility_verified_at,
      eligibility.expires_at AS eligibility_expires_at
    FROM lead_radar_tg_campaign_recipients recipient
    JOIN lead_radar_tg_campaigns campaign
      ON campaign.org_id = recipient.org_id AND campaign.id = recipient.campaign_id
    JOIN lead_radar_tg_user_accounts account
      ON account.org_id = campaign.org_id AND account.id = campaign.account_id
    JOIN lead_radar_companies company
      ON company.org_id = recipient.org_id AND company.id = recipient.company_id
    JOIN lead_radar_tg_campaign_effects effect
      ON effect.org_id = recipient.org_id AND effect.recipient_id = recipient.id
    JOIN lead_radar_tg_recipient_eligibility eligibility
      ON eligibility.org_id = recipient.org_id
        AND eligibility.campaign_id = recipient.campaign_id
        AND eligibility.recipient_id = recipient.id
    LEFT JOIN lead_radar_tg_campaign_media campaign_media
      ON campaign_media.org_id = campaign.org_id
        AND campaign_media.campaign_id = campaign.id
    WHERE recipient.org_id = ? AND recipient.campaign_id = ?
      AND recipient.id = ? AND recipient.claim_digest = ?
      AND recipient.status = 'claimed'
    LIMIT 1`)
      .bind(orgId, input.campaignId, input.recipientId, input.claimDigest)
      .first<TelegramCampaignDispatchContextRow>();
  }

  private async releaseAccountDispatchLease(
    orgId: string,
    campaignId: string,
    claimDigest: string,
    now: string,
  ): Promise<boolean> {
    const result = await this.accountLeaseReleaseStatement(
      orgId,
      campaignId,
      claimDigest,
      now,
    ).run() as D1WriteResult;
    return changes(result) === 1;
  }

  private accountLeaseReleaseStatement(
    orgId: string,
    campaignId: string,
    claimDigest: string,
    now: string,
  ): D1PreparedStatement {
    return this.db.prepare(`UPDATE lead_radar_tg_user_accounts
      SET dispatch_lease_campaign_id = NULL, dispatch_lease_digest = NULL,
        dispatch_lease_expires_at = NULL, updated_at = ?,
        state_version = state_version + 1
      WHERE org_id = ? AND dispatch_lease_campaign_id = ?
        AND dispatch_lease_digest = ?`)
      .bind(now, orgId, campaignId, claimDigest);
  }

  /**
   * Reverses only a provably pre-provider, partially committed beginDispatch.
   * Both the quota marker and identity guards are scoped to the exact claimed
   * recipient/effect/lease. A dispatching recipient never matches and remains
   * permanently fail-closed for reconciliation.
   */
  private claimedReservationCompensationStatements(orgId: string, input: {
    campaignId: string | null;
    recipientId: string | null;
    claimDigest: string | null;
    requireDnc: boolean;
    now: string;
  }): D1PreparedStatement[] {
    return [
      this.db.prepare(`UPDATE lead_radar_tg_user_accounts AS account
        SET daily_reserved_count = CASE
            WHEN daily_reserved_count > 0 THEN daily_reserved_count - 1 ELSE 0 END,
          next_dispatch_at = ?, updated_at = ?, state_version = state_version + 1
        WHERE account.org_id = ?
          AND account.dispatch_lease_campaign_id IS NOT NULL
          AND account.dispatch_lease_digest IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM lead_radar_tg_campaign_recipients recipient
            JOIN lead_radar_tg_campaign_effects effect
              ON effect.org_id = recipient.org_id
                AND effect.campaign_id = recipient.campaign_id
                AND effect.recipient_id = recipient.id
                AND effect.status = 'reserved'
            JOIN lead_radar_tg_contact_history company_guard
              ON company_guard.org_id = recipient.org_id
                AND company_guard.campaign_id = recipient.campaign_id
                AND company_guard.recipient_id = recipient.id
                AND company_guard.effect_id = effect.id
                AND company_guard.identity_type = 'company'
                AND company_guard.identity_key = recipient.company_id
                AND company_guard.state = 'reserved'
            JOIN lead_radar_tg_contact_history endpoint_guard
              ON endpoint_guard.org_id = recipient.org_id
                AND endpoint_guard.campaign_id = recipient.campaign_id
                AND endpoint_guard.recipient_id = recipient.id
                AND endpoint_guard.effect_id = effect.id
                AND endpoint_guard.identity_type = 'endpoint'
                AND endpoint_guard.identity_key = recipient.endpoint_digest
                AND endpoint_guard.state = 'reserved'
            JOIN lead_radar_companies company
              ON company.org_id = recipient.org_id AND company.id = recipient.company_id
            WHERE recipient.org_id = account.org_id
              AND recipient.campaign_id = account.dispatch_lease_campaign_id
              AND recipient.status = 'claimed' AND recipient.attempt_count = 0
              AND recipient.claim_digest = account.dispatch_lease_digest
              AND (? IS NULL OR recipient.campaign_id = ?)
              AND (? IS NULL OR recipient.id = ?)
              AND (? IS NULL OR recipient.claim_digest = ?)
              AND (? = 0 OR company.suppressed = 1 OR company.lifecycle = 'do_not_contact')
              AND company_guard.reservation_quota_day = account.quota_day
              AND endpoint_guard.reservation_quota_day = account.quota_day
              AND company_guard.reservation_next_dispatch_at = account.next_dispatch_at
              AND endpoint_guard.reservation_next_dispatch_at = account.next_dispatch_at
              AND EXISTS (
                SELECT 1 FROM lead_radar_tg_recipient_business_identities identity
                WHERE identity.org_id = recipient.org_id
                  AND identity.recipient_id = recipient.id
              )
              AND NOT EXISTS (
                SELECT 1 FROM lead_radar_tg_recipient_business_identities identity
                WHERE identity.org_id = recipient.org_id
                  AND identity.recipient_id = recipient.id
                  AND NOT EXISTS (
                    SELECT 1 FROM lead_radar_tg_contact_history business_guard
                    WHERE business_guard.org_id = identity.org_id
                      AND business_guard.effect_id = effect.id
                      AND business_guard.identity_type = 'business'
                      AND business_guard.identity_key = identity.identity_digest
                      AND business_guard.state = 'reserved'
                      AND business_guard.reservation_quota_day = account.quota_day
                      AND business_guard.reservation_next_dispatch_at = account.next_dispatch_at
                  )
              )
          )`)
        .bind(
          input.now,
          input.now,
          orgId,
          input.campaignId,
          input.campaignId,
          input.recipientId,
          input.recipientId,
          input.claimDigest,
          input.claimDigest,
          input.requireDnc ? 1 : 0,
        ),
      this.db.prepare(`DELETE FROM lead_radar_tg_contact_history AS history
        WHERE history.org_id = ? AND history.state = 'reserved'
          AND (? IS NULL OR history.campaign_id = ?)
          AND (? IS NULL OR history.recipient_id = ?)
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
            JOIN lead_radar_tg_campaign_effects effect
              ON effect.org_id = recipient.org_id
                AND effect.campaign_id = recipient.campaign_id
                AND effect.recipient_id = recipient.id
                AND effect.id = history.effect_id
                AND effect.status = 'reserved'
            JOIN lead_radar_tg_user_accounts account
              ON account.org_id = recipient.org_id
                AND account.dispatch_lease_campaign_id = recipient.campaign_id
                AND account.dispatch_lease_digest = recipient.claim_digest
            JOIN lead_radar_companies company
              ON company.org_id = recipient.org_id AND company.id = recipient.company_id
            WHERE recipient.org_id = history.org_id
              AND recipient.campaign_id = history.campaign_id
              AND recipient.id = history.recipient_id
              AND recipient.status = 'claimed' AND recipient.attempt_count = 0
              AND (? IS NULL OR recipient.claim_digest = ?)
              AND (? = 0 OR company.suppressed = 1 OR company.lifecycle = 'do_not_contact')
          )`)
        .bind(
          orgId,
          input.campaignId,
          input.campaignId,
          input.recipientId,
          input.recipientId,
          input.claimDigest,
          input.claimDigest,
          input.requireDnc ? 1 : 0,
        ),
    ];
  }

  private accountSafetyPauseStatements(
    orgId: string,
    campaignId: string,
    state: 'cooldown' | 'review_required' | 'restricted',
    reasonCode: 'flood_wait' | 'daily_limit' | 'ambiguous_delivery' | 'provider_error' | 'account_restricted',
    blockedUntil: string | null,
    now: string,
    guard?: {
      recipientId: string;
      status: 'failed' | 'ambiguous';
      errorCode: string;
    },
  ): D1PreparedStatement[] {
    return [
      this.db.prepare(`INSERT INTO lead_radar_tg_account_safety (
        account_id, org_id, state, reason_code, blocked_until, created_at, updated_at
      ) SELECT campaign.account_id, campaign.org_id, ?, ?, ?, ?, ?
      FROM lead_radar_tg_campaigns campaign
      WHERE campaign.org_id = ? AND campaign.id = ?
        AND (? IS NULL OR EXISTS (
          SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
          WHERE recipient.org_id = campaign.org_id
            AND recipient.campaign_id = campaign.id AND recipient.id = ?
            AND recipient.status = ? AND recipient.last_error_code = ?
            AND recipient.updated_at = ?
        ))
      ON CONFLICT (org_id, account_id) DO UPDATE SET
        state = excluded.state, reason_code = excluded.reason_code,
        blocked_until = excluded.blocked_until, updated_at = excluded.updated_at
      WHERE lead_radar_tg_account_safety.state <> 'disconnected'
        AND NOT (
          lead_radar_tg_account_safety.state = 'restricted'
          AND excluded.state IN ('cooldown', 'review_required')
        )
        AND NOT (
          lead_radar_tg_account_safety.state = 'review_required'
          AND excluded.state = 'cooldown'
        )`)
        .bind(
          state,
          reasonCode,
          blockedUntil,
          now,
          now,
          orgId,
          campaignId,
          guard?.recipientId ?? null,
          guard?.recipientId ?? null,
          guard?.status ?? null,
          guard?.errorCode ?? null,
          now,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_user_accounts AS account
        SET status = 'paused', next_dispatch_at = CASE
          WHEN ? IS NOT NULL THEN ? ELSE next_dispatch_at END,
          dispatch_lease_campaign_id = NULL, dispatch_lease_digest = NULL,
          dispatch_lease_expires_at = NULL, updated_at = ?,
          state_version = state_version + 1
        WHERE account.org_id = ? AND account.status = 'connected'
          AND account.id = (
            SELECT campaign.account_id FROM lead_radar_tg_campaigns campaign
            WHERE campaign.org_id = ? AND campaign.id = ?
          )
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = ? AND recipient.campaign_id = ?
              AND recipient.id = ? AND recipient.status = ?
              AND recipient.last_error_code = ? AND recipient.updated_at = ?
          ))`)
        .bind(
          blockedUntil,
          blockedUntil,
          now,
          orgId,
          orgId,
          campaignId,
          guard?.recipientId ?? null,
          orgId,
          campaignId,
          guard?.recipientId ?? null,
          guard?.status ?? null,
          guard?.errorCode ?? null,
          now,
        ),
    ];
  }

  async beginDispatch(orgId: string, input: {
    campaignId: string;
    recipientId: string;
    companyId: string;
    endpointDigest: string;
    businessIdentityDigests: readonly string[];
    effectId: string;
    claimDigest: string;
    expectedContactJson: string;
    quotaDay: string;
    dailyLimit: number;
    nextAccountDispatchAt: string;
    now: string;
  }): Promise<
    | 'started'
    | 'quota_exhausted'
    | 'contact_already_sent'
    | 'contact_delivery_uncertain'
    | 'invalid'
  > {
    const businessIdentityDigests = [...new Set(input.businessIdentityDigests)].sort();
    if (businessIdentityDigests.length < 1
      || businessIdentityDigests.length > 3
      || businessIdentityDigests.length !== input.businessIdentityDigests.length
      || businessIdentityDigests.some((identity) => !/^[0-9a-f]{64}$/u.test(identity))) {
      return 'invalid';
    }
    const businessIdentityJson = JSON.stringify(businessIdentityDigests);
    const expectedGuardCount = 2 + businessIdentityDigests.length;
    const results = await this.db.batch([
      this.db.prepare(`INSERT OR IGNORE INTO lead_radar_tg_contact_history (
        org_id, identity_type, identity_key, company_id, endpoint_digest,
        state, campaign_id, recipient_id, effect_id, reservation_quota_day,
        reservation_next_dispatch_at, created_at, updated_at
      ) SELECT ?, 'company', ?, ?, ?, 'reserved', ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
        JOIN lead_radar_tg_campaign_effects effect
          ON effect.org_id = recipient.org_id AND effect.recipient_id = recipient.id
        WHERE recipient.org_id = ? AND recipient.campaign_id = ? AND recipient.id = ?
          AND recipient.company_id = ? AND recipient.endpoint_digest = ?
          AND recipient.status = 'claimed' AND recipient.claim_digest = ?
          AND recipient.lease_expires_at > ? AND effect.id = ?
          AND effect.status = 'reserved'
      )`)
        .bind(
          orgId,
          input.companyId,
          input.companyId,
          input.endpointDigest,
          input.campaignId,
          input.recipientId,
          input.effectId,
          input.quotaDay,
          input.nextAccountDispatchAt,
          input.now,
          input.now,
          orgId,
          input.campaignId,
          input.recipientId,
          input.companyId,
          input.endpointDigest,
          input.claimDigest,
          input.now,
          input.effectId,
        ),
      this.db.prepare(`INSERT OR IGNORE INTO lead_radar_tg_contact_history (
        org_id, identity_type, identity_key, company_id, endpoint_digest,
        state, campaign_id, recipient_id, effect_id, reservation_quota_day,
        reservation_next_dispatch_at, created_at, updated_at
      ) SELECT ?, 'endpoint', ?, ?, ?, 'reserved', ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
        JOIN lead_radar_tg_campaign_effects effect
          ON effect.org_id = recipient.org_id AND effect.recipient_id = recipient.id
        WHERE recipient.org_id = ? AND recipient.campaign_id = ? AND recipient.id = ?
          AND recipient.company_id = ? AND recipient.endpoint_digest = ?
          AND recipient.status = 'claimed' AND recipient.claim_digest = ?
          AND recipient.lease_expires_at > ? AND effect.id = ?
          AND effect.status = 'reserved'
      )`)
        .bind(
          orgId,
          input.endpointDigest,
          input.companyId,
          input.endpointDigest,
          input.campaignId,
          input.recipientId,
          input.effectId,
          input.quotaDay,
          input.nextAccountDispatchAt,
          input.now,
          input.now,
          orgId,
          input.campaignId,
          input.recipientId,
          input.companyId,
          input.endpointDigest,
          input.claimDigest,
          input.now,
          input.effectId,
        ),
      this.db.prepare(`INSERT OR IGNORE INTO lead_radar_tg_contact_history (
        org_id, identity_type, identity_key, company_id, endpoint_digest,
        state, campaign_id, recipient_id, effect_id, reservation_quota_day,
        reservation_next_dispatch_at, created_at, updated_at
      ) SELECT ?, 'business', identity.identity_digest, ?, ?, 'reserved',
        ?, ?, ?, ?, ?, ?, ?
      FROM lead_radar_tg_recipient_business_identities identity
      WHERE identity.org_id = ? AND identity.recipient_id = ?
        AND identity.identity_digest IN (
          SELECT value FROM json_each(?) WHERE type = 'text'
        )
        AND ? = (
          SELECT COUNT(*) FROM lead_radar_tg_recipient_business_identities frozen
          WHERE frozen.org_id = identity.org_id AND frozen.recipient_id = identity.recipient_id
        )
        AND EXISTS (
          SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
          JOIN lead_radar_tg_campaign_effects effect
            ON effect.org_id = recipient.org_id AND effect.recipient_id = recipient.id
          WHERE recipient.org_id = ? AND recipient.campaign_id = ? AND recipient.id = ?
            AND recipient.company_id = ? AND recipient.endpoint_digest = ?
            AND recipient.status = 'claimed' AND recipient.claim_digest = ?
            AND recipient.lease_expires_at > ? AND effect.id = ?
            AND effect.status = 'reserved'
        )`)
        .bind(
          orgId,
          input.companyId,
          input.endpointDigest,
          input.campaignId,
          input.recipientId,
          input.effectId,
          input.quotaDay,
          input.nextAccountDispatchAt,
          input.now,
          input.now,
          orgId,
          input.recipientId,
          businessIdentityJson,
          businessIdentityDigests.length,
          orgId,
          input.campaignId,
          input.recipientId,
          input.companyId,
          input.endpointDigest,
          input.claimDigest,
          input.now,
          input.effectId,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_user_accounts AS account
        SET quota_day = ?,
          daily_reserved_count = CASE
            WHEN quota_day = ? THEN daily_reserved_count + 1 ELSE 1
          END,
          next_dispatch_at = ?, updated_at = ?, state_version = state_version + 1
        WHERE org_id = ? AND status = 'connected'
          AND dispatch_lease_campaign_id = ? AND dispatch_lease_digest = ?
          AND dispatch_lease_expires_at > ?
          AND (quota_day <> ? OR daily_reserved_count < ?)
          AND ? = (
            SELECT COUNT(*) FROM lead_radar_tg_contact_history history
            WHERE history.org_id = account.org_id AND history.effect_id = ?
              AND history.campaign_id = ? AND history.recipient_id = ?
              AND history.state = 'reserved'
              AND (
                (history.identity_type = 'company' AND history.identity_key = ?)
                OR (history.identity_type = 'endpoint' AND history.identity_key = ?)
                OR (history.identity_type = 'business' AND EXISTS (
                  SELECT 1 FROM lead_radar_tg_recipient_business_identities identity
                  WHERE identity.org_id = history.org_id
                    AND identity.recipient_id = history.recipient_id
                    AND identity.identity_digest = history.identity_key
                ))
              )
          )
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaigns campaign
            JOIN lead_radar_tg_campaign_recipients recipient
              ON recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
            JOIN lead_radar_companies company
              ON company.org_id = recipient.org_id AND company.id = recipient.company_id
            JOIN lead_radar_tg_recipient_eligibility eligibility
              ON eligibility.org_id = recipient.org_id
                AND eligibility.campaign_id = recipient.campaign_id
                AND eligibility.recipient_id = recipient.id
            JOIN lead_radar_tg_contact_authorizations authorization
              ON authorization.org_id = eligibility.org_id
                AND authorization.id = eligibility.authorization_id
            LEFT JOIN lead_radar_tg_account_safety safety
              ON safety.org_id = account.org_id AND safety.account_id = account.id
            WHERE campaign.org_id = account.org_id AND campaign.account_id = account.id
              AND campaign.id = ? AND campaign.status = 'running'
              AND recipient.id = ? AND recipient.status = 'claimed'
              AND recipient.claim_digest = ? AND recipient.lease_expires_at > ?
              AND company.suppressed = 0 AND company.lifecycle <> 'do_not_contact'
              AND company.telegram_contact_json = ?
              AND (safety.account_id IS NULL OR safety.state = 'ready')
              AND authorization.company_id = recipient.company_id
              AND authorization.endpoint_digest = recipient.endpoint_digest
              AND authorization.contact_basis = campaign.contact_basis
              AND authorization.status = 'active'
              AND authorization.verified_at <= ? AND authorization.expires_at > ?
              AND authorization.evidence_reference_digest = eligibility.evidence_digest
              AND authorization.reviewer_digest = eligibility.reviewer_digest
              AND authorization.evidence_version = eligibility.evidence_version
              AND authorization.verified_at = eligibility.verified_at
              AND authorization.expires_at = eligibility.expires_at
          )`)
        .bind(
          input.quotaDay,
          input.quotaDay,
          input.nextAccountDispatchAt,
          input.now,
          orgId,
          input.campaignId,
          input.claimDigest,
          input.now,
          input.quotaDay,
          input.dailyLimit,
          expectedGuardCount,
          input.effectId,
          input.campaignId,
          input.recipientId,
          input.companyId,
          input.endpointDigest,
          input.campaignId,
          input.recipientId,
          input.claimDigest,
          input.now,
          input.expectedContactJson,
          input.now,
          input.now,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients AS recipient
        SET status = 'dispatching', attempt_count = 1,
          dispatching_at = ?, updated_at = ?
        WHERE recipient.org_id = ? AND recipient.campaign_id = ?
          AND recipient.id = ? AND recipient.status = 'claimed'
          AND recipient.claim_digest = ? AND recipient.lease_expires_at > ?
          AND recipient.attempt_count = 0
          AND ? = (
            SELECT COUNT(*) FROM lead_radar_tg_contact_history history
            WHERE history.org_id = recipient.org_id AND history.effect_id = ?
              AND history.campaign_id = recipient.campaign_id
              AND history.recipient_id = recipient.id AND history.state = 'reserved'
              AND (
                (history.identity_type = 'company'
                  AND history.identity_key = recipient.company_id)
                OR (history.identity_type = 'endpoint'
                  AND history.identity_key = recipient.endpoint_digest)
                OR (history.identity_type = 'business' AND EXISTS (
                  SELECT 1 FROM lead_radar_tg_recipient_business_identities identity
                  WHERE identity.org_id = history.org_id
                    AND identity.recipient_id = history.recipient_id
                    AND identity.identity_digest = history.identity_key
                ))
              )
          )
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaigns campaign
            JOIN lead_radar_tg_user_accounts account
              ON account.org_id = campaign.org_id AND account.id = campaign.account_id
            JOIN lead_radar_companies company
              ON company.org_id = recipient.org_id AND company.id = recipient.company_id
            JOIN lead_radar_tg_recipient_eligibility eligibility
              ON eligibility.org_id = recipient.org_id
                AND eligibility.campaign_id = recipient.campaign_id
                AND eligibility.recipient_id = recipient.id
            JOIN lead_radar_tg_contact_authorizations authorization
              ON authorization.org_id = eligibility.org_id
                AND authorization.id = eligibility.authorization_id
            LEFT JOIN lead_radar_tg_account_safety safety
              ON safety.org_id = account.org_id AND safety.account_id = account.id
            WHERE campaign.org_id = recipient.org_id AND campaign.id = recipient.campaign_id
              AND campaign.status = 'running' AND account.status = 'connected'
              AND company.suppressed = 0 AND company.lifecycle <> 'do_not_contact'
              AND company.telegram_contact_json = ?
              AND (safety.account_id IS NULL OR safety.state = 'ready')
              AND authorization.company_id = recipient.company_id
              AND authorization.endpoint_digest = recipient.endpoint_digest
              AND authorization.contact_basis = campaign.contact_basis
              AND authorization.status = 'active'
              AND authorization.verified_at <= ? AND authorization.expires_at > ?
              AND authorization.evidence_reference_digest = eligibility.evidence_digest
              AND authorization.reviewer_digest = eligibility.reviewer_digest
              AND authorization.evidence_version = eligibility.evidence_version
              AND authorization.verified_at = eligibility.verified_at
              AND authorization.expires_at = eligibility.expires_at
              AND account.dispatch_lease_campaign_id = campaign.id
              AND account.dispatch_lease_digest = ?
              AND account.quota_day = ? AND account.next_dispatch_at = ?
          )`)
        .bind(
          input.now,
          input.now,
          orgId,
          input.campaignId,
          input.recipientId,
          input.claimDigest,
          input.now,
          expectedGuardCount,
          input.effectId,
          input.expectedContactJson,
          input.now,
          input.now,
          input.claimDigest,
          input.quotaDay,
          input.nextAccountDispatchAt,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_effects AS effect
        SET status = 'dispatching', updated_at = ?
        WHERE effect.org_id = ? AND effect.campaign_id = ?
          AND effect.recipient_id = ? AND effect.status = 'reserved'
          AND effect.id = ?
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = effect.org_id AND recipient.id = effect.recipient_id
              AND recipient.status = 'dispatching' AND recipient.claim_digest = ?
          )`)
        .bind(
          input.now,
          orgId,
          input.campaignId,
          input.recipientId,
          input.effectId,
          input.claimDigest,
        ),
    ]) as D1WriteResult[];
    if (changes(results[0]) === 1
      && changes(results[1]) === 1
      && changes(results[2]) === businessIdentityDigests.length
      && changes(results[3]) === 1
      && changes(results[4]) === 1
      && changes(results[5]) === 1) return 'started';
    const guardConflict = changes(results[0]) !== 1
      || changes(results[1]) !== 1
      || changes(results[2]) !== businessIdentityDigests.length;
    await this.compensateIncompleteBeginDispatch(orgId, input, {
      companyGuardChanged: changes(results[0]) === 1,
      endpointGuardChanged: changes(results[1]) === 1,
      businessGuardChanged: changes(results[2]) > 0,
      accountChanged: changes(results[3]) === 1,
      recipientChanged: changes(results[4]) === 1,
      effectChanged: changes(results[5]) === 1,
    });
    if (guardConflict) {
      const history = await this.findContactHistory(
        orgId,
        input.companyId,
        input.endpointDigest,
        businessIdentityDigests,
      );
      if (history?.state === 'sent') return 'contact_already_sent';
      if (history) return 'contact_delivery_uncertain';
    }
    const account = await this.db.prepare(`SELECT quota_day, daily_reserved_count
      FROM lead_radar_tg_user_accounts
      WHERE org_id = ? AND dispatch_lease_campaign_id = ?
        AND dispatch_lease_digest = ? LIMIT 1`)
      .bind(orgId, input.campaignId, input.claimDigest)
      .first<{ quota_day: string; daily_reserved_count: number }>();
    if (account?.quota_day === input.quotaDay
      && Number(account.daily_reserved_count) >= input.dailyLimit) return 'quota_exhausted';
    return 'invalid';
  }

  private async compensateIncompleteBeginDispatch(
    orgId: string,
    input: {
      campaignId: string;
      recipientId: string;
      effectId: string;
      claimDigest: string;
      quotaDay: string;
      nextAccountDispatchAt: string;
      now: string;
    },
    mutations: {
      companyGuardChanged: boolean;
      endpointGuardChanged: boolean;
      businessGuardChanged: boolean;
      accountChanged: boolean;
      recipientChanged: boolean;
      effectChanged: boolean;
    },
  ): Promise<void> {
    // D1 batch is transactional for thrown statement errors, not for a valid
    // statement that affects zero rows. Undo every pre-provider transition
    // explicitly. The final guard delete is itself gated on both effect and
    // recipient being out of dispatching, so a failed compensation remains
    // fail-closed and lease recovery will mark it ambiguous.
    await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_tg_campaign_effects
        SET status = 'reserved', updated_at = ?
        WHERE ? = 1 AND org_id = ? AND campaign_id = ? AND recipient_id = ?
          AND id = ? AND status = 'dispatching'`)
        .bind(
          input.now,
          mutations.effectChanged ? 1 : 0,
          orgId,
          input.campaignId,
          input.recipientId,
          input.effectId,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients
        SET status = 'claimed', attempt_count = 0, dispatching_at = NULL, updated_at = ?
        WHERE ? = 1 AND org_id = ? AND campaign_id = ? AND id = ?
          AND status = 'dispatching' AND claim_digest = ?`)
        .bind(
          input.now,
          mutations.recipientChanged ? 1 : 0,
          orgId,
          input.campaignId,
          input.recipientId,
          input.claimDigest,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_user_accounts
        SET daily_reserved_count = CASE
            WHEN daily_reserved_count > 0 THEN daily_reserved_count - 1 ELSE 0 END,
          next_dispatch_at = ?, updated_at = ?, state_version = state_version + 1
        WHERE ? = 1 AND org_id = ?
          AND dispatch_lease_campaign_id = ? AND dispatch_lease_digest = ?
          AND quota_day = ? AND next_dispatch_at = ?`)
        .bind(
          input.now,
          input.now,
          mutations.accountChanged ? 1 : 0,
          orgId,
          input.campaignId,
          input.claimDigest,
          input.quotaDay,
          input.nextAccountDispatchAt,
        ),
      this.db.prepare(`DELETE FROM lead_radar_tg_contact_history AS history
        WHERE ? = 1 AND history.org_id = ?
          AND history.effect_id = ? AND history.state = 'reserved'
          AND NOT EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = history.org_id AND recipient.id = history.recipient_id
              AND recipient.status = 'dispatching'
          )
          AND NOT EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_effects effect
            WHERE effect.org_id = history.org_id AND effect.id = history.effect_id
              AND effect.status = 'dispatching'
          )`)
        .bind(
          mutations.companyGuardChanged
            || mutations.endpointGuardChanged
            || mutations.businessGuardChanged ? 1 : 0,
          orgId,
          input.effectId,
        ),
    ]);
  }

  async cancelDispatchBeforeProvider(orgId: string, input: {
    campaignId: string;
    recipientId: string;
    claimDigest: string;
    now: string;
  }): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients
        SET status = 'skipped_dnc', claim_digest = NULL, lease_expires_at = NULL,
          endpoint_ciphertext = ?, endpoint_iv = ?, payload_ciphertext = ?, payload_iv = ?,
          last_error_code = 'do_not_contact', completed_at = ?, updated_at = ?
        WHERE org_id = ? AND campaign_id = ? AND id = ?
          AND status = 'dispatching' AND claim_digest = ?`)
        .bind(
          PURGED_CIPHERTEXT,
          PURGED_IV,
          PURGED_CIPHERTEXT,
          PURGED_IV,
          input.now,
          input.now,
          orgId,
          input.campaignId,
          input.recipientId,
          input.claimDigest,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_effects
        SET status = 'canceled', completed_at = ?, updated_at = ?
        WHERE org_id = ? AND campaign_id = ? AND recipient_id = ?
          AND status = 'dispatching'`)
        .bind(input.now, input.now, orgId, input.campaignId, input.recipientId),
      this.db.prepare(`DELETE FROM lead_radar_tg_contact_history
        WHERE org_id = ? AND campaign_id = ? AND recipient_id = ?
          AND state = 'reserved'`)
        .bind(orgId, input.campaignId, input.recipientId),
      this.db.prepare(`UPDATE lead_radar_tg_user_accounts
        SET daily_reserved_count = CASE
          WHEN daily_reserved_count > 0 THEN daily_reserved_count - 1 ELSE 0 END,
          dispatch_lease_campaign_id = NULL, dispatch_lease_digest = NULL,
          dispatch_lease_expires_at = NULL, updated_at = ?, state_version = state_version + 1
        WHERE org_id = ? AND dispatch_lease_campaign_id = ? AND dispatch_lease_digest = ?`)
        .bind(input.now, orgId, input.campaignId, input.claimDigest),
      this.terminalCountRefreshStatement(orgId, input.campaignId, input.now, input.now, {
        recipientId: input.recipientId,
        status: 'skipped_dnc',
      }),
    ]) as D1WriteResult[];
    return changes(results[0]) === 1 && changes(results[1]) === 1;
  }

  private terminalCountRefreshStatement(
    orgId: string,
    campaignId: string,
    now: string,
    nextSendAt: string,
    guard?: {
      recipientId: string;
      status: TelegramCampaignRecipientRow['status'];
    },
  ): D1PreparedStatement {
    return this.db.prepare(`UPDATE lead_radar_tg_campaigns AS campaign
      SET sent_count = (
          SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
          WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
            AND recipient.status = 'sent'
        ),
        failed_count = (
          SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
          WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
            AND recipient.status = 'failed'
        ),
        ambiguous_count = (
          SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
          WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
            AND recipient.status = 'ambiguous'
        ),
        skipped_count = (
          SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
          WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
            AND recipient.status IN ('skipped_dnc', 'skipped_stale', 'stopped')
        ),
        next_send_at = ?,
        status = CASE
          WHEN campaign.status = 'running' AND NOT EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
              AND recipient.status IN ('pending', 'claimed', 'dispatching')
          ) THEN 'completed'
          ELSE campaign.status
        END,
        completed_at = CASE
          WHEN campaign.status = 'running' AND NOT EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
              AND recipient.status IN ('pending', 'claimed', 'dispatching')
          ) THEN ?
          ELSE campaign.completed_at
        END,
        updated_at = ?, state_version = state_version + 1
      WHERE campaign.org_id = ? AND campaign.id = ?
        AND (? IS NULL OR EXISTS (
          SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
          WHERE recipient.org_id = campaign.org_id
            AND recipient.campaign_id = campaign.id AND recipient.id = ?
            AND recipient.status = ? AND recipient.updated_at = ?
        ))`)
      .bind(
        nextSendAt,
        now,
        now,
        orgId,
        campaignId,
        guard?.recipientId ?? null,
        guard?.recipientId ?? null,
        guard?.status ?? null,
        now,
      );
  }

  async markRecipientSkipped(orgId: string, input: {
    campaignId: string;
    recipientId: string;
    claimDigest: string;
    status: 'skipped_dnc' | 'skipped_stale';
    errorCode: string;
    now: string;
  }): Promise<boolean> {
    const results = await this.db.batch([
      ...this.claimedReservationCompensationStatements(orgId, {
        campaignId: input.campaignId,
        recipientId: input.recipientId,
        claimDigest: input.claimDigest,
        requireDnc: input.status === 'skipped_dnc',
        now: input.now,
      }),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients
        SET status = ?, claim_digest = NULL, lease_expires_at = NULL,
          endpoint_ciphertext = ?, endpoint_iv = ?, payload_ciphertext = ?, payload_iv = ?,
          last_error_code = ?, completed_at = ?, updated_at = ?
        WHERE org_id = ? AND campaign_id = ? AND id = ?
          AND status = 'claimed' AND claim_digest = ?`)
        .bind(
          input.status,
          PURGED_CIPHERTEXT,
          PURGED_IV,
          PURGED_CIPHERTEXT,
          PURGED_IV,
          input.errorCode,
          input.now,
          input.now,
          orgId,
          input.campaignId,
          input.recipientId,
          input.claimDigest,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_effects
        SET status = 'canceled', updated_at = ?, completed_at = ?
        WHERE org_id = ? AND campaign_id = ? AND recipient_id = ?
          AND status = 'reserved'`)
        .bind(input.now, input.now, orgId, input.campaignId, input.recipientId),
      this.accountLeaseReleaseStatement(
        orgId,
        input.campaignId,
        input.claimDigest,
        input.now,
      ),
      this.terminalCountRefreshStatement(orgId, input.campaignId, input.now, input.now, {
        recipientId: input.recipientId,
        status: input.status,
      }),
    ]) as D1WriteResult[];
    return changes(results[2]) === 1;
  }

  async releaseClaimBeforeDispatch(orgId: string, input: {
    campaignId: string;
    recipientId: string;
    claimDigest: string;
    now: string;
  }): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients
        SET status = 'pending', claim_digest = NULL, lease_expires_at = NULL,
          claimed_at = NULL, updated_at = ?
        WHERE org_id = ? AND campaign_id = ? AND id = ?
          AND status = 'claimed' AND claim_digest = ?`)
        .bind(input.now, orgId, input.campaignId, input.recipientId, input.claimDigest),
      // A Worker can die after beginDispatch's guard/account statements but
      // before its zero-change compensation. Quota is released only when both
      // identity rows carry this exact effect's reservation markers and the
      // recipient is still provably pre-provider. A dispatching effect never
      // satisfies this predicate and remains fail-closed for reconciliation.
      this.db.prepare(`UPDATE lead_radar_tg_user_accounts AS account
        SET daily_reserved_count = CASE
            WHEN daily_reserved_count > 0 THEN daily_reserved_count - 1 ELSE 0 END,
          next_dispatch_at = ?, updated_at = ?, state_version = state_version + 1
        WHERE account.org_id = ?
          AND account.dispatch_lease_campaign_id = ?
          AND account.dispatch_lease_digest = ?
          AND EXISTS (
            SELECT 1
            FROM lead_radar_tg_contact_history company_guard
            JOIN lead_radar_tg_contact_history endpoint_guard
              ON endpoint_guard.org_id = company_guard.org_id
                AND endpoint_guard.effect_id = company_guard.effect_id
                AND endpoint_guard.identity_type = 'endpoint'
                AND endpoint_guard.identity_key = company_guard.endpoint_digest
                AND endpoint_guard.state = 'reserved'
            JOIN lead_radar_tg_campaign_effects effect
              ON effect.org_id = company_guard.org_id
                AND effect.id = company_guard.effect_id
                AND effect.campaign_id = company_guard.campaign_id
                AND effect.recipient_id = company_guard.recipient_id
                AND effect.status = 'reserved'
            JOIN lead_radar_tg_campaign_recipients recipient
              ON recipient.org_id = company_guard.org_id
                AND recipient.campaign_id = company_guard.campaign_id
                AND recipient.id = company_guard.recipient_id
                AND recipient.status = 'pending'
                AND recipient.attempt_count = 0
                AND recipient.claim_digest IS NULL
            WHERE company_guard.org_id = account.org_id
              AND company_guard.campaign_id = ?
              AND company_guard.recipient_id = ?
              AND company_guard.identity_type = 'company'
              AND company_guard.identity_key = company_guard.company_id
              AND company_guard.state = 'reserved'
              AND company_guard.reservation_quota_day = account.quota_day
              AND endpoint_guard.reservation_quota_day = account.quota_day
              AND company_guard.reservation_next_dispatch_at = account.next_dispatch_at
              AND endpoint_guard.reservation_next_dispatch_at = account.next_dispatch_at
              AND EXISTS (
                SELECT 1 FROM lead_radar_tg_recipient_business_identities identity
                WHERE identity.org_id = recipient.org_id
                  AND identity.recipient_id = recipient.id
              )
              AND NOT EXISTS (
                SELECT 1 FROM lead_radar_tg_recipient_business_identities identity
                WHERE identity.org_id = recipient.org_id
                  AND identity.recipient_id = recipient.id
                  AND NOT EXISTS (
                    SELECT 1 FROM lead_radar_tg_contact_history business_guard
                    WHERE business_guard.org_id = identity.org_id
                      AND business_guard.effect_id = effect.id
                      AND business_guard.identity_type = 'business'
                      AND business_guard.identity_key = identity.identity_digest
                      AND business_guard.state = 'reserved'
                      AND business_guard.reservation_quota_day = account.quota_day
                      AND business_guard.reservation_next_dispatch_at = account.next_dispatch_at
                  )
              )
          )`)
        .bind(
          input.now,
          input.now,
          orgId,
          input.campaignId,
          input.claimDigest,
          input.campaignId,
          input.recipientId,
        ),
      this.accountLeaseReleaseStatement(
        orgId,
        input.campaignId,
        input.claimDigest,
        input.now,
      ),
      this.db.prepare(`DELETE FROM lead_radar_tg_contact_history AS history
        WHERE history.org_id = ? AND history.campaign_id = ?
          AND history.recipient_id = ? AND history.state = 'reserved'
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = history.org_id
              AND recipient.campaign_id = history.campaign_id
              AND recipient.id = history.recipient_id
              AND recipient.status = 'pending' AND recipient.attempt_count = 0
              AND recipient.claim_digest IS NULL
          )
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_effects effect
            WHERE effect.org_id = history.org_id AND effect.id = history.effect_id
              AND effect.campaign_id = history.campaign_id
              AND effect.recipient_id = history.recipient_id
              AND effect.status = 'reserved'
          )`)
        .bind(orgId, input.campaignId, input.recipientId),
    ]) as D1WriteResult[];
    return changes(results[0]) === 1;
  }

  async markRecipientSent(orgId: string, input: {
    campaignId: string;
    recipientId: string;
    claimDigest: string;
    providerMessageDigest: string;
    now: string;
    nextSendAt: string;
  }): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients
        SET status = 'sent', claim_digest = NULL, lease_expires_at = NULL,
          provider_message_digest = ?, sent_at = ?, completed_at = ?, updated_at = ?
        WHERE org_id = ? AND campaign_id = ? AND id = ?
          AND status = 'dispatching' AND claim_digest = ?`)
        .bind(
          input.providerMessageDigest,
          input.now,
          input.now,
          input.now,
          orgId,
          input.campaignId,
          input.recipientId,
          input.claimDigest,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_effects
        SET status = 'sent', provider_message_digest = ?, updated_at = ?, completed_at = ?
        WHERE org_id = ? AND campaign_id = ? AND recipient_id = ?
          AND status = 'dispatching'`)
        .bind(
          input.providerMessageDigest,
          input.now,
          input.now,
          orgId,
          input.campaignId,
          input.recipientId,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_contact_history
        SET state = 'sent', reservation_quota_day = NULL,
          reservation_next_dispatch_at = NULL, updated_at = ?
        WHERE org_id = ? AND campaign_id = ? AND recipient_id = ?
          AND state = 'reserved'`)
        .bind(input.now, orgId, input.campaignId, input.recipientId),
      this.accountLeaseReleaseStatement(
        orgId,
        input.campaignId,
        input.claimDigest,
        input.now,
      ),
      this.terminalCountRefreshStatement(
        orgId,
        input.campaignId,
        input.now,
        input.nextSendAt,
        { recipientId: input.recipientId, status: 'sent' },
      ),
    ]) as D1WriteResult[];
    return changes(results[0]) === 1 && changes(results[1]) === 1;
  }

  async markRecipientFailed(orgId: string, input: {
    campaignId: string;
    recipientId: string;
    claimDigest: string;
    errorCode: string;
    now: string;
    nextSendAt: string;
    pauseReason: 'flood_wait' | 'account_restricted' | 'provider_error' | null;
    compensateQuota?: boolean;
    pauseAccountSafety?: boolean;
  }): Promise<boolean> {
    const campaignUpdate = input.pauseReason === null
      ? this.terminalCountRefreshStatement(
        orgId,
        input.campaignId,
        input.now,
        input.nextSendAt,
        { recipientId: input.recipientId, status: 'failed' },
      )
      : this.db.prepare(`UPDATE lead_radar_tg_campaigns AS campaign
          SET failed_count = (
            SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
              AND recipient.status = 'failed'
          ), status = 'paused', pause_reason = ?, last_error_code = ?,
          next_send_at = ?, updated_at = ?, state_version = state_version + 1
          WHERE campaign.org_id = ? AND campaign.id = ? AND campaign.status = 'running'
            AND EXISTS (
              SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
              WHERE recipient.org_id = campaign.org_id
                AND recipient.campaign_id = campaign.id AND recipient.id = ?
                AND recipient.status = 'failed' AND recipient.last_error_code = ?
                AND recipient.updated_at = ?
            )`)
        .bind(
          input.pauseReason,
          input.errorCode,
          input.nextSendAt,
          input.now,
          orgId,
          input.campaignId,
          input.recipientId,
          input.errorCode,
          input.now,
        );
    const accountSafety = input.pauseReason === 'flood_wait'
      ? this.accountSafetyPauseStatements(
        orgId,
        input.campaignId,
        'cooldown',
        'flood_wait',
        input.nextSendAt,
        input.now,
        {
          recipientId: input.recipientId,
          status: 'failed',
          errorCode: input.errorCode,
        },
      )
      : input.pauseReason === 'account_restricted'
        ? this.accountSafetyPauseStatements(
          orgId,
          input.campaignId,
          'restricted',
          'account_restricted',
          null,
          input.now,
          {
            recipientId: input.recipientId,
            status: 'failed',
            errorCode: input.errorCode,
          },
        )
        : input.pauseReason === 'provider_error' && input.pauseAccountSafety !== false
          ? this.accountSafetyPauseStatements(
            orgId,
            input.campaignId,
            'review_required',
            'provider_error',
            null,
            input.now,
            {
              recipientId: input.recipientId,
              status: 'failed',
              errorCode: input.errorCode,
            },
          )
          : [];
    const accountRelease = input.compensateQuota
      ? this.db.prepare(`UPDATE lead_radar_tg_user_accounts
          SET daily_reserved_count = CASE
              WHEN daily_reserved_count > 0 THEN daily_reserved_count - 1 ELSE 0 END,
            next_dispatch_at = ?, dispatch_lease_campaign_id = NULL,
            dispatch_lease_digest = NULL, dispatch_lease_expires_at = NULL,
            updated_at = ?, state_version = state_version + 1
          WHERE org_id = ? AND dispatch_lease_campaign_id = ?
            AND dispatch_lease_digest = ?`)
        .bind(
          input.now,
          input.now,
          orgId,
          input.campaignId,
          input.claimDigest,
        )
      : this.accountLeaseReleaseStatement(
        orgId,
        input.campaignId,
        input.claimDigest,
        input.now,
      );
    const results = await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients
        SET status = 'failed', claim_digest = NULL, lease_expires_at = NULL,
          endpoint_ciphertext = ?, endpoint_iv = ?, payload_ciphertext = ?, payload_iv = ?,
          last_error_code = ?, completed_at = ?, updated_at = ?
        WHERE org_id = ? AND campaign_id = ? AND id = ?
          AND status = 'dispatching' AND claim_digest = ?`)
        .bind(
          PURGED_CIPHERTEXT,
          PURGED_IV,
          PURGED_CIPHERTEXT,
          PURGED_IV,
          input.errorCode,
          input.now,
          input.now,
          orgId,
          input.campaignId,
          input.recipientId,
          input.claimDigest,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_effects
        SET status = 'failed', updated_at = ?, completed_at = ?
        WHERE org_id = ? AND campaign_id = ? AND recipient_id = ?
          AND status = 'dispatching'`)
        .bind(input.now, input.now, orgId, input.campaignId, input.recipientId),
      this.db.prepare(`DELETE FROM lead_radar_tg_contact_history
        WHERE org_id = ? AND campaign_id = ? AND recipient_id = ?
          AND state = 'reserved'`)
        .bind(orgId, input.campaignId, input.recipientId),
      accountRelease,
      campaignUpdate,
      ...accountSafety,
    ]) as D1WriteResult[];
    return changes(results[0]) === 1 && changes(results[1]) === 1;
  }

  async markRecipientAmbiguous(orgId: string, input: {
    campaignId: string;
    recipientId: string;
    claimDigest: string;
    now: string;
  }): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients
        SET status = 'ambiguous', claim_digest = NULL, lease_expires_at = NULL,
          endpoint_ciphertext = ?, endpoint_iv = ?, payload_ciphertext = ?, payload_iv = ?,
          last_error_code = 'provider_boundary_ambiguous', completed_at = ?, updated_at = ?
        WHERE org_id = ? AND campaign_id = ? AND id = ?
          AND status = 'dispatching' AND claim_digest = ?`)
        .bind(
          PURGED_CIPHERTEXT,
          PURGED_IV,
          PURGED_CIPHERTEXT,
          PURGED_IV,
          input.now,
          input.now,
          orgId,
          input.campaignId,
          input.recipientId,
          input.claimDigest,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_effects
        SET status = 'ambiguous', updated_at = ?, completed_at = ?
        WHERE org_id = ? AND campaign_id = ? AND recipient_id = ?
          AND status IN ('reserved', 'dispatching')`)
        .bind(input.now, input.now, orgId, input.campaignId, input.recipientId),
      this.db.prepare(`UPDATE lead_radar_tg_contact_history
        SET state = 'ambiguous', reservation_quota_day = NULL,
          reservation_next_dispatch_at = NULL, updated_at = ?
        WHERE org_id = ? AND campaign_id = ? AND recipient_id = ?
          AND state = 'reserved'`)
        .bind(input.now, orgId, input.campaignId, input.recipientId),
      this.accountLeaseReleaseStatement(
        orgId,
        input.campaignId,
        input.claimDigest,
        input.now,
      ),
      this.db.prepare(`UPDATE lead_radar_tg_campaigns AS campaign
        SET ambiguous_count = (
          SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
          WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
            AND recipient.status = 'ambiguous'
        ), status = CASE WHEN status = 'running' THEN 'paused' ELSE status END,
        pause_reason = CASE WHEN status = 'running' THEN 'ambiguous_delivery' ELSE pause_reason END,
        last_error_code = 'provider_boundary_ambiguous', updated_at = ?,
        state_version = state_version + 1
        WHERE campaign.org_id = ? AND campaign.id = ?
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = campaign.org_id
              AND recipient.campaign_id = campaign.id AND recipient.id = ?
              AND recipient.status = 'ambiguous'
              AND recipient.last_error_code = 'provider_boundary_ambiguous'
              AND recipient.updated_at = ?
          )`)
        .bind(input.now, orgId, input.campaignId, input.recipientId, input.now),
      ...this.accountSafetyPauseStatements(
        orgId,
        input.campaignId,
        'review_required',
        'ambiguous_delivery',
        null,
        input.now,
        {
          recipientId: input.recipientId,
          status: 'ambiguous',
          errorCode: 'provider_boundary_ambiguous',
        },
      ),
    ]) as D1WriteResult[];
    return changes(results[0]) === 1 && changes(results[1]) === 1;
  }

  async recoverExpiredClaim(orgId: string, input: {
    campaignId: string;
    now: string;
  }): Promise<{ released: number; ambiguous: number }> {
    const claimed = await this.db.prepare(`SELECT id, claim_digest
      FROM lead_radar_tg_campaign_recipients
      WHERE org_id = ? AND campaign_id = ? AND status = 'claimed'
        AND lease_expires_at <= ? AND attempt_count = 0
      ORDER BY sequence_no, id LIMIT 1`)
      .bind(orgId, input.campaignId, input.now)
      .first<{ id: string; claim_digest: string }>();
    const released = claimed && await this.releaseClaimBeforeDispatch(orgId, {
      campaignId: input.campaignId,
      recipientId: claimed.id,
      claimDigest: claimed.claim_digest,
      now: input.now,
    }) ? 1 : 0;
    const dispatching = await this.db.prepare(`SELECT id, claim_digest
      FROM lead_radar_tg_campaign_recipients
      WHERE org_id = ? AND campaign_id = ? AND status = 'dispatching'
        AND lease_expires_at <= ?
      ORDER BY sequence_no, id LIMIT 1`)
      .bind(orgId, input.campaignId, input.now)
      .first<{ id: string; claim_digest: string }>();
    let ambiguous = 0;
    if (dispatching) {
      ambiguous = await this.markRecipientAmbiguous(orgId, {
        campaignId: input.campaignId,
        recipientId: dispatching.id,
        claimDigest: dispatching.claim_digest,
        now: input.now,
      }) ? 1 : 0;
    }
    return { released, ambiguous };
  }

  async pauseCampaignSystem(orgId: string, input: {
    campaignId: string;
    reason: 'flood_wait' | 'account_restricted' | 'ambiguous_delivery' | 'cooldown' | 'provider_error';
    errorCode: string;
    nextSendAt: string;
    now: string;
    accountSafetyReason?: 'daily_limit' | 'provider_error';
  }): Promise<boolean> {
    const accountSafety = input.accountSafetyReason === 'daily_limit'
      ? this.accountSafetyPauseStatements(
        orgId,
        input.campaignId,
        'cooldown',
        'daily_limit',
        input.nextSendAt,
        input.now,
      )
      : input.accountSafetyReason === 'provider_error'
        ? this.accountSafetyPauseStatements(
          orgId,
          input.campaignId,
          'review_required',
          'provider_error',
          null,
          input.now,
        )
        : [];
    const results = await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_tg_campaigns
        SET status = 'paused', pause_reason = ?, last_error_code = ?,
          next_send_at = ?, updated_at = ?, state_version = state_version + 1
        WHERE org_id = ? AND id = ? AND status = 'running'`)
        .bind(
          input.reason,
          input.errorCode,
          input.nextSendAt,
          input.now,
          orgId,
          input.campaignId,
        ),
      ...accountSafety,
    ]) as D1WriteResult[];
    return changes(results[0]) === 1;
  }

  async findOperation(
    orgId: string,
    operationDigest: string,
  ): Promise<TelegramCampaignOperationRow | null> {
    return this.db.prepare(`SELECT campaign_id, request_fingerprint, action, result_status
      FROM lead_radar_tg_campaign_operations
      WHERE org_id = ? AND operation_digest = ? LIMIT 1`)
      .bind(orgId, operationDigest)
      .first<TelegramCampaignOperationRow>();
  }

  async applyTransition(orgId: string, input: {
    operationId: string;
    campaignId: string;
    operationDigest: string;
    requestFingerprint: string;
    operatorDigest: string;
    action: 'start' | 'pause' | 'resume' | 'stop' | 'fail';
    errorCode: string | null;
    now: string;
  }): Promise<boolean> {
    const desired: TelegramCampaignOperationRow['result_status'] = input.action === 'pause'
      ? 'paused'
      : input.action === 'stop'
        ? 'stopped'
        : input.action === 'fail'
          ? 'failed'
          : 'running';
    const allowed = input.action === 'start'
      ? `campaign.status = 'approved'`
      : input.action === 'pause'
        ? `campaign.status = 'running'`
        : input.action === 'resume'
          ? `campaign.status = 'paused'
            AND campaign.pause_reason <> 'ambiguous_delivery'
            AND (campaign.pause_reason NOT IN ('flood_wait', 'cooldown') OR campaign.next_send_at <= ?)`
          : input.action === 'stop'
            ? `campaign.status IN ('approved', 'running', 'paused')`
            : `campaign.status IN ('approved', 'running', 'paused')`;
    const allowedBindings = input.action === 'resume'
      ? [input.now]
      : [];
    const operationInsert = this.db.prepare(`INSERT INTO lead_radar_tg_campaign_operations (
      id, org_id, campaign_id, operation_digest, request_fingerprint,
      operator_digest, action, result_status, created_at
    ) SELECT ?, ?, campaign.id, ?, ?, ?, ?, ?, ?
    FROM lead_radar_tg_campaigns campaign
    ${input.action === 'start' || input.action === 'resume'
      ? `JOIN lead_radar_tg_user_accounts account
          ON account.org_id = campaign.org_id AND account.id = campaign.account_id
        LEFT JOIN lead_radar_tg_account_safety safety
          ON safety.org_id = account.org_id AND safety.account_id = account.id`
      : ''}
    WHERE campaign.org_id = ? AND campaign.id = ? AND ${allowed}
      ${input.action === 'start' || input.action === 'resume'
      ? `AND account.status = 'connected'
        AND (safety.account_id IS NULL OR safety.state = 'ready')`
      : ''}`)
      .bind(
        input.operationId,
        orgId,
        input.operationDigest,
        input.requestFingerprint,
        input.operatorDigest,
        input.action,
        desired,
        input.now,
        orgId,
        input.campaignId,
        ...allowedBindings,
      );
    const campaignUpdate = this.db.prepare(`UPDATE lead_radar_tg_campaigns
      SET status = ?,
        pause_reason = CASE WHEN ? = 'paused' THEN 'operator' ELSE NULL END,
        last_error_code = CASE WHEN ? = 'failed' THEN ? ELSE NULL END,
        started_at = CASE WHEN ? = 'running' THEN COALESCE(started_at, ?) ELSE started_at END,
        stopped_at = CASE WHEN ? = 'stopped' THEN ? ELSE NULL END,
        failed_at = CASE WHEN ? = 'failed' THEN ? ELSE NULL END,
        updated_at = ?, state_version = state_version + 1
      WHERE org_id = ? AND id = ? AND EXISTS (
        SELECT 1 FROM lead_radar_tg_campaign_operations operation
        WHERE operation.org_id = ? AND operation.campaign_id = ?
          AND operation.operation_digest = ? AND operation.result_status = ?
      )`)
      .bind(
        desired,
        desired,
        desired,
        input.errorCode,
        desired,
        input.now,
        desired,
        input.now,
        desired,
        input.now,
        input.now,
        orgId,
        input.campaignId,
        orgId,
        input.campaignId,
        input.operationDigest,
        desired,
      );
    const statements: D1PreparedStatement[] = [operationInsert, campaignUpdate];
    if (input.action === 'stop') {
      statements.push(
        ...this.claimedReservationCompensationStatements(orgId, {
          campaignId: input.campaignId,
          recipientId: null,
          claimDigest: null,
          requireDnc: false,
          now: input.now,
        }),
        this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients
          SET status = 'stopped', claim_digest = NULL, lease_expires_at = NULL,
            endpoint_ciphertext = ?, endpoint_iv = ?, payload_ciphertext = ?, payload_iv = ?,
            last_error_code = 'campaign_stopped', completed_at = ?, updated_at = ?
          WHERE org_id = ? AND campaign_id = ? AND status IN ('pending', 'claimed')`)
          .bind(
            PURGED_CIPHERTEXT,
            PURGED_IV,
            PURGED_CIPHERTEXT,
            PURGED_IV,
            input.now,
            input.now,
            orgId,
            input.campaignId,
          ),
        this.db.prepare(`UPDATE lead_radar_tg_campaign_effects
          SET status = 'canceled', completed_at = ?, updated_at = ?
          WHERE org_id = ? AND campaign_id = ? AND status = 'reserved'
            AND NOT EXISTS (
              SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
              WHERE recipient.org_id = lead_radar_tg_campaign_effects.org_id
                AND recipient.id = lead_radar_tg_campaign_effects.recipient_id
                AND recipient.status = 'dispatching'
            )`)
          .bind(input.now, input.now, orgId, input.campaignId),
        this.db.prepare(`UPDATE lead_radar_tg_user_accounts AS account
          SET dispatch_lease_campaign_id = NULL, dispatch_lease_digest = NULL,
            dispatch_lease_expires_at = NULL, updated_at = ?,
            state_version = state_version + 1
          WHERE account.org_id = ? AND account.dispatch_lease_campaign_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
              WHERE recipient.org_id = account.org_id
                AND recipient.campaign_id = account.dispatch_lease_campaign_id
                AND recipient.status = 'dispatching'
            )`)
          .bind(input.now, orgId, input.campaignId),
        this.terminalCountRefreshStatement(orgId, input.campaignId, input.now, input.now),
      );
    }
    try {
      const results = await this.db.batch(statements) as D1WriteResult[];
      return changes(results[0]) === 1 && changes(results[1]) === 1;
    } catch {
      return false;
    }
  }

  async maintain(orgId: string, input: {
    now: string;
    approvalBefore: string;
    terminalBefore: string;
  }): Promise<void> {
    await this.db.batch([
      // Reconcile the two durable halves of a known successful effect before
      // lease recovery. A crash between the recipient/effect updates must not
      // turn an acknowledged provider message into another provider attempt.
      this.db.prepare(`UPDATE lead_radar_tg_campaign_effects AS effect
        SET status = 'sent',
          provider_message_digest = (
            SELECT recipient.provider_message_digest
            FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = effect.org_id AND recipient.id = effect.recipient_id
              AND recipient.status = 'sent'
          ),
          completed_at = COALESCE(completed_at, ?), updated_at = ?
        WHERE effect.org_id = ? AND effect.status = 'dispatching'
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = effect.org_id AND recipient.id = effect.recipient_id
              AND recipient.status = 'sent' AND recipient.provider_message_digest IS NOT NULL
          )`)
        .bind(input.now, input.now, orgId),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients AS recipient
        SET status = 'sent', claim_digest = NULL, lease_expires_at = NULL,
          provider_message_digest = (
            SELECT effect.provider_message_digest
            FROM lead_radar_tg_campaign_effects effect
            WHERE effect.org_id = recipient.org_id AND effect.recipient_id = recipient.id
              AND effect.status = 'sent'
          ),
          sent_at = COALESCE(sent_at, ?), completed_at = COALESCE(completed_at, ?),
          updated_at = ?
        WHERE recipient.org_id = ? AND recipient.status = 'dispatching'
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_effects effect
            WHERE effect.org_id = recipient.org_id AND effect.recipient_id = recipient.id
              AND effect.status = 'sent' AND effect.provider_message_digest IS NOT NULL
        )`)
        .bind(input.now, input.now, input.now, orgId),
      this.db.prepare(`UPDATE lead_radar_tg_contact_history AS history
        SET state = 'sent', reservation_quota_day = NULL,
          reservation_next_dispatch_at = NULL, updated_at = ?
        WHERE history.org_id = ? AND history.state = 'reserved'
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
            JOIN lead_radar_tg_campaign_effects effect
              ON effect.org_id = recipient.org_id
                AND effect.recipient_id = recipient.id
                AND effect.status = 'sent'
            WHERE recipient.org_id = history.org_id
              AND recipient.campaign_id = history.campaign_id
              AND recipient.id = history.recipient_id
              AND effect.id = history.effect_id
              AND recipient.status = 'sent'
          )`)
        .bind(input.now, orgId),
      ...this.claimedReservationCompensationStatements(orgId, {
        campaignId: null,
        recipientId: null,
        claimDigest: null,
        requireDnc: true,
        now: input.now,
      }),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients AS recipient
        SET status = 'skipped_dnc', claim_digest = NULL, lease_expires_at = NULL,
          endpoint_ciphertext = ?, endpoint_iv = ?, payload_ciphertext = ?, payload_iv = ?,
          last_error_code = 'do_not_contact', completed_at = ?, updated_at = ?
        WHERE recipient.org_id = ? AND recipient.status IN ('pending', 'claimed')
          AND EXISTS (
            SELECT 1 FROM lead_radar_companies company
            WHERE company.org_id = recipient.org_id AND company.id = recipient.company_id
              AND (company.suppressed = 1 OR company.lifecycle = 'do_not_contact')
          )`)
        .bind(
          PURGED_CIPHERTEXT,
          PURGED_IV,
          PURGED_CIPHERTEXT,
          PURGED_IV,
          input.now,
          input.now,
          orgId,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_effects AS effect
        SET status = 'canceled', completed_at = ?, updated_at = ?
        WHERE effect.org_id = ? AND effect.status = 'reserved'
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = effect.org_id AND recipient.id = effect.recipient_id
              AND recipient.status = 'skipped_dnc'
          )`)
        .bind(input.now, input.now, orgId),
      this.db.prepare(`UPDATE lead_radar_tg_user_accounts AS account
        SET dispatch_lease_campaign_id = NULL, dispatch_lease_digest = NULL,
          dispatch_lease_expires_at = NULL, updated_at = ?, state_version = state_version + 1
        WHERE account.org_id = ? AND account.dispatch_lease_campaign_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = account.org_id
              AND recipient.campaign_id = account.dispatch_lease_campaign_id
              AND recipient.status IN ('claimed', 'dispatching')
          )`)
        .bind(input.now, orgId),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients
        SET endpoint_ciphertext = ?, endpoint_iv = ?, payload_ciphertext = ?, payload_iv = ?,
          updated_at = ?
        WHERE org_id = ?
          AND status IN ('failed', 'ambiguous', 'skipped_dnc', 'skipped_stale', 'stopped')
          AND endpoint_ciphertext <> ?`)
        .bind(
          PURGED_CIPHERTEXT,
          PURGED_IV,
          PURGED_CIPHERTEXT,
          PURGED_IV,
          input.now,
          orgId,
          PURGED_CIPHERTEXT,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_campaigns AS campaign
        SET sent_count = (
            SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
              AND recipient.status = 'sent'
          ),
          failed_count = (
            SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
              AND recipient.status = 'failed'
          ),
          ambiguous_count = (
            SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
              AND recipient.status = 'ambiguous'
          ),
          skipped_count = (
            SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
              AND recipient.status IN ('skipped_dnc', 'skipped_stale', 'stopped')
          ),
          status = CASE WHEN campaign.status = 'running' AND NOT EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
              AND recipient.status IN ('pending', 'claimed', 'dispatching')
          ) THEN 'completed' ELSE campaign.status END,
          completed_at = CASE WHEN campaign.status = 'running' AND NOT EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
              AND recipient.status IN ('pending', 'claimed', 'dispatching')
          ) THEN COALESCE(campaign.completed_at, ?) ELSE campaign.completed_at END,
          updated_at = ?, state_version = state_version + 1
        WHERE campaign.org_id = ? AND campaign.status IN ('running', 'paused')
          AND (
            campaign.sent_count <> (
              SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
              WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
                AND recipient.status = 'sent'
            )
            OR campaign.failed_count <> (
              SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
              WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
                AND recipient.status = 'failed'
            )
            OR campaign.ambiguous_count <> (
              SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
              WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
                AND recipient.status = 'ambiguous'
            )
            OR campaign.skipped_count <> (
              SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
              WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
                AND recipient.status IN ('skipped_dnc', 'skipped_stale', 'stopped')
            )
            OR (campaign.status = 'running' AND NOT EXISTS (
              SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
              WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
                AND recipient.status IN ('pending', 'claimed', 'dispatching')
            ))
          )`)
        .bind(input.now, input.now, orgId),
      this.db.prepare(`UPDATE lead_radar_tg_account_safety
        SET state = 'ready', reason_code = NULL, blocked_until = NULL, updated_at = ?
        WHERE org_id = ? AND state = 'cooldown' AND blocked_until <= ?`)
        .bind(input.now, orgId, input.now),
      this.db.prepare(`UPDATE lead_radar_tg_user_accounts AS account
        SET status = 'connected', updated_at = ?, state_version = state_version + 1
        WHERE account.org_id = ? AND account.status = 'paused'
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_account_safety safety
            WHERE safety.org_id = account.org_id AND safety.account_id = account.id
              AND safety.state = 'ready'
          )`)
        .bind(input.now, orgId),
      this.db.prepare(`DELETE FROM lead_radar_tg_campaign_approvals
        WHERE org_id = ? AND consumed_at IS NULL AND expires_at <= ?`)
        .bind(orgId, input.approvalBefore),
      this.db.prepare(`DELETE FROM lead_radar_tg_campaign_operations
        WHERE org_id = ? AND created_at <= ?
          AND campaign_id IN (
            SELECT id FROM lead_radar_tg_campaigns
            WHERE org_id = ? AND status IN ('stopped', 'completed', 'failed')
              AND COALESCE(completed_at, stopped_at, failed_at, created_at) <= ?
          )`)
        .bind(orgId, input.terminalBefore, orgId, input.terminalBefore),
      // Terminal audit/count/idempotency rows survive, but every relation that
      // pins source-search/company PII and every encrypted message payload is
      // removed after the retention horizon. The standalone digest-only
      // contact ledger deliberately has no FK and remains the permanent guard.
      this.db.prepare(`DELETE FROM lead_radar_tg_campaign_media
        WHERE org_id = ? AND campaign_id IN (
          SELECT id FROM lead_radar_tg_campaigns
          WHERE org_id = ? AND status IN ('stopped', 'completed', 'failed')
            AND COALESCE(completed_at, stopped_at, failed_at, created_at) <= ?
        )`)
        .bind(orgId, orgId, input.terminalBefore),
      this.db.prepare(`DELETE FROM lead_radar_tg_campaign_approval_media
        WHERE org_id = ? AND approval_id IN (
          SELECT approval.id FROM lead_radar_tg_campaign_approvals approval
          JOIN lead_radar_tg_campaigns campaign
            ON campaign.org_id = approval.org_id
              AND campaign.id = approval.consumed_campaign_id
          WHERE campaign.org_id = ?
            AND campaign.status IN ('stopped', 'completed', 'failed')
            AND COALESCE(
              campaign.completed_at,
              campaign.stopped_at,
              campaign.failed_at,
              campaign.created_at
            ) <= ?
        )`)
        .bind(orgId, orgId, input.terminalBefore),
      this.db.prepare(`DELETE FROM lead_radar_tg_campaign_safety
        WHERE org_id = ? AND campaign_id IN (
          SELECT id FROM lead_radar_tg_campaigns
          WHERE org_id = ? AND status IN ('stopped', 'completed', 'failed')
            AND COALESCE(completed_at, stopped_at, failed_at, created_at) <= ?
        )`)
        .bind(orgId, orgId, input.terminalBefore),
      this.db.prepare(`DELETE FROM lead_radar_tg_campaign_recipients
        WHERE org_id = ? AND campaign_id IN (
          SELECT id FROM lead_radar_tg_campaigns
          WHERE org_id = ? AND status IN ('stopped', 'completed', 'failed')
            AND COALESCE(completed_at, stopped_at, failed_at, created_at) <= ?
        )`)
        .bind(orgId, orgId, input.terminalBefore),
      this.db.prepare(`DELETE FROM lead_radar_tg_contact_authorizations AS authorization
        WHERE authorization.org_id = ?
          AND COALESCE(authorization.revoked_at, authorization.expires_at) <= ?
          AND NOT EXISTS (
            SELECT 1 FROM lead_radar_tg_recipient_eligibility eligibility
            WHERE eligibility.org_id = authorization.org_id
              AND eligibility.authorization_id = authorization.id
          )`)
        .bind(orgId, input.terminalBefore),
      this.db.prepare(`UPDATE lead_radar_tg_campaigns
        SET template_ciphertext = ?, template_iv = ?, updated_at = ?,
          state_version = state_version + 1
        WHERE org_id = ? AND status IN ('stopped', 'completed', 'failed')
          AND COALESCE(completed_at, stopped_at, failed_at, created_at) <= ?
          AND template_ciphertext <> ?`)
        .bind(
          PURGED_CIPHERTEXT,
          PURGED_IV,
          input.now,
          orgId,
          input.terminalBefore,
          PURGED_CIPHERTEXT,
        ),
    ]);
  }
}
