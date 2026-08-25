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
  website: string | null;
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
  min_interval_seconds: number;
  account_status: TelegramUserAccountStatus;
  gateway_account_ref: string | null;
  company_telegram_contact_json: string;
  company_website: string | null;
  company_suppressed: number;
  company_lifecycle: string;
  effect_id: string;
  effect_status: 'reserved' | 'dispatching' | 'sent' | 'failed' | 'ambiguous' | 'canceled';
  effect_payload_digest: string;
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
  stopped_at, completed_at, failed_at, created_at, updated_at, state_version
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
    const result = await this.db.prepare(`UPDATE lead_radar_tg_user_accounts
      SET gateway_account_ref = ?, gateway_account_ref_digest = ?,
        masked_label = ?, status = 'connected',
        connected_at = COALESCE(connected_at, ?), last_health_at = ?,
        revoked_at = NULL, updated_at = ?, state_version = state_version + 1
      WHERE org_id = ? AND id = ? AND state_version = ?
        AND status IN ('pending', 'error')`)
      .bind(
        input.gatewayAccountRef,
        input.gatewayAccountRefDigest,
        input.maskedLabel,
        input.now,
        input.now,
        input.now,
        orgId,
        input.accountId,
        input.expectedVersion,
      )
      .run() as D1WriteResult;
    return changes(result) === 1;
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
    const result = await this.db.prepare(`UPDATE lead_radar_tg_user_accounts
      SET gateway_account_ref = NULL, gateway_account_ref_digest = NULL,
        dispatch_lease_campaign_id = NULL, dispatch_lease_digest = NULL,
        dispatch_lease_expires_at = NULL, status = 'revoked', revoked_at = ?,
        updated_at = ?, state_version = state_version + 1
      WHERE org_id = ? AND id = ? AND status <> 'revoked'`)
      .bind(now, now, orgId, accountId)
      .run() as D1WriteResult;
    return changes(result) === 1;
  }

  async findCompanies(
    orgId: string,
    companyIds: readonly string[],
  ): Promise<TelegramCampaignCompanyRow[]> {
    if (companyIds.length === 0) return [];
    const placeholders = companyIds.map(() => '?').join(', ');
    const result = await this.db.prepare(`SELECT id, name, website,
      telegram_contact_json, suppressed, lifecycle
    FROM lead_radar_companies
    WHERE org_id = ? AND id IN (${placeholders})
    ORDER BY id`)
      .bind(orgId, ...companyIds)
      .all<TelegramCampaignCompanyRow>();
    return result.results ?? [];
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
  }): Promise<boolean> {
    const result = await this.db.prepare(`INSERT INTO lead_radar_tg_campaign_approvals (
      id, org_id, account_id, token_digest, idempotency_key_digest,
      selection_digest, content_digest,
      request_fingerprint, operator_digest, contact_basis, recipient_count,
      expires_at, created_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    FROM lead_radar_tg_user_accounts account
    WHERE account.org_id = ? AND account.id = ? AND account.status = 'connected'`)
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
      )
      .run() as D1WriteResult;
    return changes(result) === 1;
  }

  async getApprovalByToken(
    orgId: string,
    tokenDigest: string,
  ): Promise<TelegramCampaignApprovalRow | null> {
    return this.db.prepare(`SELECT id, org_id, account_id, token_digest,
      idempotency_key_digest,
      selection_digest, content_digest, request_fingerprint, operator_digest,
      contact_basis, recipient_count, expires_at, consumed_at, consumed_campaign_id
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
      expires_at, consumed_at, consumed_campaign_id
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
      expectedContactJson: string;
      effectId: string;
      effectKeyDigest: string;
      payloadDigest: string;
    }>;
  }): Promise<boolean> {
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`UPDATE lead_radar_tg_campaign_approvals
        SET consumed_at = ?, consumed_campaign_id = ?
        WHERE org_id = ? AND id = ? AND token_digest = ?
          AND account_id = ? AND selection_digest = ? AND content_digest = ?
          AND request_fingerprint = ? AND operator_digest = ? AND contact_basis = ?
          AND recipient_count = ? AND consumed_at IS NULL AND expires_at > ?`)
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
      WHERE approval.org_id = ? AND approval.id = ?
        AND approval.consumed_campaign_id = ? AND approval.consumed_at = ?
        AND account.status = 'connected'`)
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
        ),
    ];
    for (const recipient of input.recipients) {
      statements.push(
        this.db.prepare(`INSERT INTO lead_radar_tg_campaign_recipients (
          id, org_id, campaign_id, company_id, sequence_no,
          endpoint_ciphertext, endpoint_iv, endpoint_digest, payload_ciphertext,
          payload_iv, rendered_content_digest, contact_fingerprint,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, (
          SELECT company.id FROM lead_radar_companies company
          WHERE company.org_id = ? AND company.id = ?
            AND company.suppressed = 0 AND company.lifecycle <> 'do_not_contact'
            AND company.telegram_contact_json = ?
          LIMIT 1
        ), ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
          .bind(
            recipient.id,
            orgId,
            input.id,
            orgId,
            recipient.companyId,
            recipient.expectedContactJson,
            recipient.sequenceNo,
            recipient.endpointCiphertext,
            recipient.endpointIv,
            recipient.endpointDigest,
            recipient.payloadCiphertext,
            recipient.payloadIv,
            recipient.renderedContentDigest,
            recipient.contactFingerprint,
            input.now,
            input.now,
          ),
        this.db.prepare(`INSERT INTO lead_radar_tg_campaign_effects (
          id, org_id, campaign_id, recipient_id, effect_key_digest,
          payload_digest, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'reserved', ?, ?)`)
          .bind(
            recipient.effectId,
            orgId,
            input.id,
            recipient.id,
            recipient.effectKeyDigest,
            recipient.payloadDigest,
            input.now,
            input.now,
          ),
      );
    }
    try {
      const results = await this.db.batch(statements) as D1WriteResult[];
      return changes(results[0]) === 1 && changes(results[1]) === 1;
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
      WHERE campaign.org_id = ?
        AND campaign.status = 'running'
        AND campaign.next_send_at <= ?
        AND account.status = 'connected'
        AND account.next_dispatch_at <= ?
        AND account.dispatch_lease_digest IS NULL
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
      campaign.min_interval_seconds,
      account.status AS account_status,
      account.gateway_account_ref,
      company.telegram_contact_json AS company_telegram_contact_json,
      company.website AS company_website,
      company.suppressed AS company_suppressed,
      company.lifecycle AS company_lifecycle,
      effect.id AS effect_id, effect.status AS effect_status,
      effect.payload_digest AS effect_payload_digest
    FROM lead_radar_tg_campaign_recipients recipient
    JOIN lead_radar_tg_campaigns campaign
      ON campaign.org_id = recipient.org_id AND campaign.id = recipient.campaign_id
    JOIN lead_radar_tg_user_accounts account
      ON account.org_id = campaign.org_id AND account.id = campaign.account_id
    JOIN lead_radar_companies company
      ON company.org_id = recipient.org_id AND company.id = recipient.company_id
    JOIN lead_radar_tg_campaign_effects effect
      ON effect.org_id = recipient.org_id AND effect.recipient_id = recipient.id
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

  async beginDispatch(orgId: string, input: {
    campaignId: string;
    recipientId: string;
    claimDigest: string;
    expectedContactJson: string;
    quotaDay: string;
    dailyLimit: number;
    nextAccountDispatchAt: string;
    now: string;
  }): Promise<'started' | 'quota_exhausted' | 'invalid'> {
    const results = await this.db.batch([
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
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaigns campaign
            JOIN lead_radar_tg_campaign_recipients recipient
              ON recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
            JOIN lead_radar_companies company
              ON company.org_id = recipient.org_id AND company.id = recipient.company_id
            WHERE campaign.org_id = account.org_id AND campaign.account_id = account.id
              AND campaign.id = ? AND campaign.status = 'running'
              AND recipient.id = ? AND recipient.status = 'claimed'
              AND recipient.claim_digest = ? AND recipient.lease_expires_at > ?
              AND company.suppressed = 0 AND company.lifecycle <> 'do_not_contact'
              AND company.telegram_contact_json = ?
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
          input.campaignId,
          input.recipientId,
          input.claimDigest,
          input.now,
          input.expectedContactJson,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients AS recipient
        SET status = 'dispatching', attempt_count = 1,
          dispatching_at = ?, updated_at = ?
        WHERE recipient.org_id = ? AND recipient.campaign_id = ?
          AND recipient.id = ? AND recipient.status = 'claimed'
          AND recipient.claim_digest = ? AND recipient.lease_expires_at > ?
          AND recipient.attempt_count = 0
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaigns campaign
            JOIN lead_radar_tg_user_accounts account
              ON account.org_id = campaign.org_id AND account.id = campaign.account_id
            JOIN lead_radar_companies company
              ON company.org_id = recipient.org_id AND company.id = recipient.company_id
            WHERE campaign.org_id = recipient.org_id AND campaign.id = recipient.campaign_id
              AND campaign.status = 'running' AND account.status = 'connected'
              AND company.suppressed = 0 AND company.lifecycle <> 'do_not_contact'
              AND company.telegram_contact_json = ?
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
          input.expectedContactJson,
          input.claimDigest,
          input.quotaDay,
          input.nextAccountDispatchAt,
        ),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_effects AS effect
        SET status = 'dispatching', updated_at = ?
        WHERE effect.org_id = ? AND effect.campaign_id = ?
          AND effect.recipient_id = ? AND effect.status = 'reserved'
          AND EXISTS (
            SELECT 1 FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = effect.org_id AND recipient.id = effect.recipient_id
              AND recipient.status = 'dispatching' AND recipient.claim_digest = ?
          )`)
        .bind(input.now, orgId, input.campaignId, input.recipientId, input.claimDigest),
    ]) as D1WriteResult[];
    if (changes(results[0]) === 1
      && changes(results[1]) === 1
      && changes(results[2]) === 1) return 'started';
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

  private terminalCountRefreshStatement(
    orgId: string,
    campaignId: string,
    now: string,
    nextSendAt: string,
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
      WHERE campaign.org_id = ? AND campaign.id = ?`)
      .bind(nextSendAt, now, now, orgId, campaignId);
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
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients
        SET status = ?, claim_digest = NULL, lease_expires_at = NULL,
          last_error_code = ?, completed_at = ?, updated_at = ?
        WHERE org_id = ? AND campaign_id = ? AND id = ?
          AND status = 'claimed' AND claim_digest = ?`)
        .bind(
          input.status,
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
      this.terminalCountRefreshStatement(orgId, input.campaignId, input.now, input.now),
    ]) as D1WriteResult[];
    return changes(results[0]) === 1;
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
      this.accountLeaseReleaseStatement(
        orgId,
        input.campaignId,
        input.claimDigest,
        input.now,
      ),
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
      this.accountLeaseReleaseStatement(
        orgId,
        input.campaignId,
        input.claimDigest,
        input.now,
      ),
      this.terminalCountRefreshStatement(orgId, input.campaignId, input.now, input.nextSendAt),
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
  }): Promise<boolean> {
    const campaignUpdate = input.pauseReason === null
      ? this.terminalCountRefreshStatement(orgId, input.campaignId, input.now, input.nextSendAt)
      : this.db.prepare(`UPDATE lead_radar_tg_campaigns AS campaign
          SET failed_count = (
            SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients recipient
            WHERE recipient.org_id = campaign.org_id AND recipient.campaign_id = campaign.id
              AND recipient.status = 'failed'
          ), status = 'paused', pause_reason = ?, last_error_code = ?,
          next_send_at = ?, updated_at = ?, state_version = state_version + 1
          WHERE campaign.org_id = ? AND campaign.id = ? AND campaign.status = 'running'`)
        .bind(
          input.pauseReason,
          input.errorCode,
          input.nextSendAt,
          input.now,
          orgId,
          input.campaignId,
        );
    const results = await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients
        SET status = 'failed', claim_digest = NULL, lease_expires_at = NULL,
          last_error_code = ?, completed_at = ?, updated_at = ?
        WHERE org_id = ? AND campaign_id = ? AND id = ?
          AND status = 'dispatching' AND claim_digest = ?`)
        .bind(
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
      this.accountLeaseReleaseStatement(
        orgId,
        input.campaignId,
        input.claimDigest,
        input.now,
      ),
      campaignUpdate,
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
          last_error_code = 'provider_boundary_ambiguous', completed_at = ?, updated_at = ?
        WHERE org_id = ? AND campaign_id = ? AND id = ?
          AND status = 'dispatching' AND claim_digest = ?`)
        .bind(
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
          AND status = 'dispatching'`)
        .bind(input.now, input.now, orgId, input.campaignId, input.recipientId),
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
        WHERE campaign.org_id = ? AND campaign.id = ?`)
        .bind(input.now, orgId, input.campaignId),
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
  }): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE lead_radar_tg_campaigns
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
      )
      .run() as D1WriteResult;
    return changes(result) === 1;
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
          ON account.org_id = campaign.org_id AND account.id = campaign.account_id`
      : ''}
    WHERE campaign.org_id = ? AND campaign.id = ? AND ${allowed}
      ${input.action === 'start' || input.action === 'resume' ? `AND account.status = 'connected'` : ''}`)
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
        this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients
          SET status = 'stopped', claim_digest = NULL, lease_expires_at = NULL,
            last_error_code = 'campaign_stopped', completed_at = ?, updated_at = ?
          WHERE org_id = ? AND campaign_id = ? AND status IN ('pending', 'claimed')`)
          .bind(input.now, input.now, orgId, input.campaignId),
        this.db.prepare(`UPDATE lead_radar_tg_campaign_effects
          SET status = 'canceled', completed_at = ?, updated_at = ?
          WHERE org_id = ? AND campaign_id = ? AND status = 'reserved'`)
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
      this.db.prepare(`DELETE FROM lead_radar_tg_campaign_approvals
        WHERE org_id = ? AND consumed_at IS NULL AND expires_at <= ?`)
        .bind(orgId, input.approvalBefore),
      this.db.prepare(`DELETE FROM lead_radar_tg_campaign_operations
        WHERE org_id = ? AND created_at <= ?
          AND campaign_id IN (
            SELECT id FROM lead_radar_tg_campaigns
            WHERE org_id = ? AND status IN ('stopped', 'completed', 'failed')
              AND updated_at <= ?
          )`)
        .bind(orgId, input.terminalBefore, orgId, input.terminalBefore),
    ]);
  }
}
