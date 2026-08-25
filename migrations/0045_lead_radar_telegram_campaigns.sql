-- Lead Radar Telegram user-account and campaign delivery foundation.
--
-- Additive and disabled until the corresponding capability/configuration is
-- enabled. The bounded campaign template and recipient endpoints are stored
-- only as application-encrypted ciphertext in D1;
-- approval, idempotency, provider and effect ledgers contain only keyed
-- digests and bounded operational metadata. QR tokens, 2FA passwords, phone
-- numbers, usernames and plaintext message bodies are never stored in D1.
-- TDLib databases/sessions are not stored in D1 at all; the account row
-- contains only an opaque gateway reference.
--
-- Rollback: stop campaign dispatch first, export aggregate audit counts, then
-- drop the six tables below in reverse dependency order. Existing Lead Radar
-- searches, companies, suppressions and Telegram Business transport survive.

CREATE TABLE IF NOT EXISTS lead_radar_tg_user_accounts (
  id TEXT PRIMARY KEY CHECK (
    length(id) = 39
    AND substr(id, 1, 7) = 'lrtgua_'
    AND substr(id, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  gateway_account_ref TEXT CHECK (
    gateway_account_ref IS NULL
    OR (
      length(gateway_account_ref) BETWEEN 16 AND 160
      AND gateway_account_ref NOT GLOB '*[^A-Za-z0-9:_-]*'
    )
  ),
  gateway_account_ref_digest TEXT CHECK (
    gateway_account_ref_digest IS NULL
    OR (
      length(gateway_account_ref_digest) = 64
      AND gateway_account_ref_digest NOT GLOB '*[^0-9a-f]*'
    )
  ),
  masked_label TEXT NOT NULL CHECK (length(masked_label) BETWEEN 1 AND 40),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'connected', 'paused', 'revoked', 'error')
  ),
  auth_request_digest TEXT NOT NULL CHECK (
    length(auth_request_digest) = 64
    AND auth_request_digest NOT GLOB '*[^0-9a-f]*'
  ),
  request_idempotency_digest TEXT NOT NULL CHECK (
    length(request_idempotency_digest) = 64
    AND request_idempotency_digest NOT GLOB '*[^0-9a-f]*'
  ),
  request_fingerprint TEXT NOT NULL CHECK (
    length(request_fingerprint) = 64
    AND request_fingerprint NOT GLOB '*[^0-9a-f]*'
  ),
  connected_at TEXT CHECK (connected_at IS NULL OR length(connected_at) BETWEEN 20 AND 64),
  last_health_at TEXT CHECK (last_health_at IS NULL OR length(last_health_at) BETWEEN 20 AND 64),
  quota_day TEXT NOT NULL DEFAULT '1970-01-01' CHECK (length(quota_day) = 10),
  daily_reserved_count INTEGER NOT NULL DEFAULT 0 CHECK (daily_reserved_count BETWEEN 0 AND 1000),
  next_dispatch_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'
    CHECK (length(next_dispatch_at) BETWEEN 20 AND 64),
  dispatch_lease_campaign_id TEXT CHECK (
    dispatch_lease_campaign_id IS NULL OR length(dispatch_lease_campaign_id) = 39
  ),
  dispatch_lease_digest TEXT CHECK (
    dispatch_lease_digest IS NULL
    OR (
      length(dispatch_lease_digest) = 64
      AND dispatch_lease_digest NOT GLOB '*[^0-9a-f]*'
    )
  ),
  dispatch_lease_expires_at TEXT CHECK (
    dispatch_lease_expires_at IS NULL
    OR length(dispatch_lease_expires_at) BETWEEN 20 AND 64
  ),
  revoked_at TEXT CHECK (revoked_at IS NULL OR length(revoked_at) BETWEEN 20 AND 64),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  state_version INTEGER NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  UNIQUE (org_id, id),
  UNIQUE (org_id, request_idempotency_digest),
  UNIQUE (org_id, gateway_account_ref_digest),
  CHECK (
    (gateway_account_ref IS NULL AND gateway_account_ref_digest IS NULL)
    OR (gateway_account_ref IS NOT NULL AND gateway_account_ref_digest IS NOT NULL
      AND connected_at IS NOT NULL)
  ),
  CHECK (
    (dispatch_lease_campaign_id IS NULL AND dispatch_lease_digest IS NULL
      AND dispatch_lease_expires_at IS NULL)
    OR (dispatch_lease_campaign_id IS NOT NULL AND dispatch_lease_digest IS NOT NULL
      AND dispatch_lease_expires_at IS NOT NULL)
  ),
  CHECK (
    (status = 'pending' AND gateway_account_ref IS NULL AND revoked_at IS NULL)
    OR (status IN ('connected', 'paused') AND gateway_account_ref IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'error' AND revoked_at IS NULL)
    OR (status = 'revoked' AND gateway_account_ref IS NULL AND revoked_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_radar_tg_user_accounts_active_org
  ON lead_radar_tg_user_accounts (org_id)
  WHERE status <> 'revoked';
CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_user_accounts_status
  ON lead_radar_tg_user_accounts (org_id, status, updated_at, id);

CREATE TABLE IF NOT EXISTS lead_radar_tg_campaign_approvals (
  id TEXT PRIMARY KEY CHECK (
    length(id) = 39
    AND substr(id, 1, 7) = 'lrtgap_'
    AND substr(id, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  account_id TEXT NOT NULL CHECK (length(account_id) = 39),
  token_digest TEXT NOT NULL CHECK (
    length(token_digest) = 64
    AND token_digest NOT GLOB '*[^0-9a-f]*'
  ),
  idempotency_key_digest TEXT NOT NULL CHECK (
    length(idempotency_key_digest) = 64
    AND idempotency_key_digest NOT GLOB '*[^0-9a-f]*'
  ),
  selection_digest TEXT NOT NULL CHECK (
    length(selection_digest) = 64
    AND selection_digest NOT GLOB '*[^0-9a-f]*'
  ),
  content_digest TEXT NOT NULL CHECK (
    length(content_digest) = 64
    AND content_digest NOT GLOB '*[^0-9a-f]*'
  ),
  request_fingerprint TEXT NOT NULL CHECK (
    length(request_fingerprint) = 64
    AND request_fingerprint NOT GLOB '*[^0-9a-f]*'
  ),
  operator_digest TEXT NOT NULL CHECK (
    length(operator_digest) = 64
    AND operator_digest NOT GLOB '*[^0-9a-f]*'
  ),
  contact_basis TEXT NOT NULL CHECK (
    contact_basis IN (
      'documented_consent', 'inbound_request',
      'existing_relationship', 'contractual_relationship'
    )
  ),
  recipient_count INTEGER NOT NULL CHECK (recipient_count BETWEEN 1 AND 50),
  expires_at TEXT NOT NULL CHECK (length(expires_at) BETWEEN 20 AND 64),
  consumed_at TEXT CHECK (consumed_at IS NULL OR length(consumed_at) BETWEEN 20 AND 64),
  consumed_campaign_id TEXT CHECK (
    consumed_campaign_id IS NULL OR length(consumed_campaign_id) = 39
  ),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  UNIQUE (org_id, id),
  UNIQUE (org_id, token_digest),
  UNIQUE (org_id, idempotency_key_digest),
  FOREIGN KEY (org_id, account_id)
    REFERENCES lead_radar_tg_user_accounts(org_id, id) ON DELETE CASCADE,
  CHECK (
    (consumed_at IS NULL AND consumed_campaign_id IS NULL)
    OR (consumed_at IS NOT NULL AND consumed_campaign_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_approvals_expiry
  ON lead_radar_tg_campaign_approvals (org_id, expires_at, consumed_at, id);

CREATE TABLE IF NOT EXISTS lead_radar_tg_campaigns (
  id TEXT PRIMARY KEY CHECK (
    length(id) = 39
    AND substr(id, 1, 7) = 'lrtgcp_'
    AND substr(id, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  account_id TEXT NOT NULL CHECK (length(account_id) = 39),
  approval_id TEXT NOT NULL CHECK (length(approval_id) = 39),
  idempotency_key_digest TEXT NOT NULL CHECK (
    length(idempotency_key_digest) = 64
    AND idempotency_key_digest NOT GLOB '*[^0-9a-f]*'
  ),
  request_fingerprint TEXT NOT NULL CHECK (
    length(request_fingerprint) = 64
    AND request_fingerprint NOT GLOB '*[^0-9a-f]*'
  ),
  selection_digest TEXT NOT NULL CHECK (
    length(selection_digest) = 64
    AND selection_digest NOT GLOB '*[^0-9a-f]*'
  ),
  content_digest TEXT NOT NULL CHECK (
    length(content_digest) = 64
    AND content_digest NOT GLOB '*[^0-9a-f]*'
  ),
  operator_digest TEXT NOT NULL CHECK (
    length(operator_digest) = 64
    AND operator_digest NOT GLOB '*[^0-9a-f]*'
  ),
  contact_basis TEXT NOT NULL CHECK (
    contact_basis IN (
      'documented_consent', 'inbound_request',
      'existing_relationship', 'contractual_relationship'
    )
  ),
  template_ciphertext TEXT NOT NULL CHECK (length(template_ciphertext) BETWEEN 23 AND 32768),
  template_iv TEXT NOT NULL CHECK (
    length(template_iv) = 16
    AND template_iv NOT GLOB '*[^A-Za-z0-9_-]*'
  ),
  status TEXT NOT NULL CHECK (
    status IN ('draft', 'approved', 'running', 'paused', 'stopped', 'completed', 'failed')
  ),
  pause_reason TEXT CHECK (
    pause_reason IS NULL
    OR pause_reason IN (
      'operator', 'flood_wait', 'account_restricted',
      'ambiguous_delivery', 'cooldown', 'provider_error'
    )
  ),
  last_error_code TEXT CHECK (
    last_error_code IS NULL OR length(last_error_code) BETWEEN 1 AND 80
  ),
  recipient_count INTEGER NOT NULL CHECK (recipient_count BETWEEN 1 AND 50),
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count BETWEEN 0 AND recipient_count),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count BETWEEN 0 AND recipient_count),
  ambiguous_count INTEGER NOT NULL DEFAULT 0 CHECK (ambiguous_count BETWEEN 0 AND recipient_count),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count BETWEEN 0 AND recipient_count),
  min_interval_seconds INTEGER NOT NULL CHECK (min_interval_seconds BETWEEN 30 AND 3600),
  next_send_at TEXT NOT NULL CHECK (length(next_send_at) BETWEEN 20 AND 64),
  approved_at TEXT CHECK (approved_at IS NULL OR length(approved_at) BETWEEN 20 AND 64),
  started_at TEXT CHECK (started_at IS NULL OR length(started_at) BETWEEN 20 AND 64),
  stopped_at TEXT CHECK (stopped_at IS NULL OR length(stopped_at) BETWEEN 20 AND 64),
  completed_at TEXT CHECK (completed_at IS NULL OR length(completed_at) BETWEEN 20 AND 64),
  failed_at TEXT CHECK (failed_at IS NULL OR length(failed_at) BETWEEN 20 AND 64),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  state_version INTEGER NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  UNIQUE (org_id, id),
  UNIQUE (org_id, idempotency_key_digest),
  UNIQUE (org_id, approval_id),
  FOREIGN KEY (org_id, account_id)
    REFERENCES lead_radar_tg_user_accounts(org_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, approval_id)
    REFERENCES lead_radar_tg_campaign_approvals(org_id, id) ON DELETE RESTRICT,
  CHECK (sent_count + failed_count + ambiguous_count + skipped_count <= recipient_count),
  CHECK (status = 'draft' OR approved_at IS NOT NULL),
  CHECK (
    (status = 'stopped' AND stopped_at IS NOT NULL)
    OR (status <> 'stopped' AND stopped_at IS NULL)
  ),
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  ),
  CHECK (
    (status = 'failed' AND failed_at IS NOT NULL)
    OR (status <> 'failed' AND failed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaigns_status
  ON lead_radar_tg_campaigns (org_id, status, next_send_at, updated_at, id);
CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaigns_account
  ON lead_radar_tg_campaigns (org_id, account_id, status, updated_at, id);

CREATE TABLE IF NOT EXISTS lead_radar_tg_campaign_recipients (
  id TEXT PRIMARY KEY CHECK (
    length(id) = 39
    AND substr(id, 1, 7) = 'lrtgcr_'
    AND substr(id, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  campaign_id TEXT NOT NULL CHECK (length(campaign_id) = 39),
  company_id TEXT NOT NULL CHECK (length(company_id) BETWEEN 1 AND 80),
  sequence_no INTEGER NOT NULL CHECK (sequence_no BETWEEN 1 AND 50),
  endpoint_ciphertext TEXT NOT NULL CHECK (length(endpoint_ciphertext) BETWEEN 23 AND 1024),
  endpoint_iv TEXT NOT NULL CHECK (
    length(endpoint_iv) = 16
    AND endpoint_iv NOT GLOB '*[^A-Za-z0-9_-]*'
  ),
  endpoint_digest TEXT NOT NULL CHECK (
    length(endpoint_digest) = 64
    AND endpoint_digest NOT GLOB '*[^0-9a-f]*'
  ),
  payload_ciphertext TEXT NOT NULL CHECK (length(payload_ciphertext) BETWEEN 23 AND 32768),
  payload_iv TEXT NOT NULL CHECK (
    length(payload_iv) = 16
    AND payload_iv NOT GLOB '*[^A-Za-z0-9_-]*'
  ),
  rendered_content_digest TEXT NOT NULL CHECK (
    length(rendered_content_digest) = 64
    AND rendered_content_digest NOT GLOB '*[^0-9a-f]*'
  ),
  contact_fingerprint TEXT NOT NULL CHECK (
    length(contact_fingerprint) = 64
    AND contact_fingerprint NOT GLOB '*[^0-9a-f]*'
  ),
  status TEXT NOT NULL CHECK (
    status IN (
      'pending', 'claimed', 'dispatching', 'sent', 'failed', 'ambiguous',
      'skipped_dnc', 'skipped_stale', 'stopped'
    )
  ),
  claim_digest TEXT CHECK (
    claim_digest IS NULL
    OR (
      length(claim_digest) = 64
      AND claim_digest NOT GLOB '*[^0-9a-f]*'
    )
  ),
  lease_expires_at TEXT CHECK (
    lease_expires_at IS NULL OR length(lease_expires_at) BETWEEN 20 AND 64
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 1),
  provider_message_digest TEXT CHECK (
    provider_message_digest IS NULL
    OR (
      length(provider_message_digest) = 64
      AND provider_message_digest NOT GLOB '*[^0-9a-f]*'
    )
  ),
  last_error_code TEXT CHECK (
    last_error_code IS NULL OR length(last_error_code) BETWEEN 1 AND 80
  ),
  claimed_at TEXT CHECK (claimed_at IS NULL OR length(claimed_at) BETWEEN 20 AND 64),
  dispatching_at TEXT CHECK (dispatching_at IS NULL OR length(dispatching_at) BETWEEN 20 AND 64),
  sent_at TEXT CHECK (sent_at IS NULL OR length(sent_at) BETWEEN 20 AND 64),
  completed_at TEXT CHECK (completed_at IS NULL OR length(completed_at) BETWEEN 20 AND 64),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  UNIQUE (org_id, id),
  UNIQUE (org_id, campaign_id, sequence_no),
  UNIQUE (org_id, campaign_id, company_id),
  FOREIGN KEY (org_id, campaign_id)
    REFERENCES lead_radar_tg_campaigns(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, company_id)
    REFERENCES lead_radar_companies(org_id, id) ON DELETE RESTRICT,
  CHECK (
    (status IN ('claimed', 'dispatching') AND claim_digest IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status NOT IN ('claimed', 'dispatching') AND claim_digest IS NULL AND lease_expires_at IS NULL)
  ),
  CHECK (
    (status = 'sent' AND sent_at IS NOT NULL AND provider_message_digest IS NOT NULL)
    OR (status <> 'sent' AND sent_at IS NULL AND provider_message_digest IS NULL)
  ),
  CHECK (
    (status IN ('pending', 'claimed', 'dispatching') AND completed_at IS NULL)
    OR (status NOT IN ('pending', 'claimed', 'dispatching') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_recipients_due
  ON lead_radar_tg_campaign_recipients (org_id, campaign_id, status, sequence_no, id);
CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_recipients_lease
  ON lead_radar_tg_campaign_recipients (status, lease_expires_at, org_id, campaign_id, id);

CREATE TABLE IF NOT EXISTS lead_radar_tg_campaign_effects (
  id TEXT PRIMARY KEY CHECK (
    length(id) = 39
    AND substr(id, 1, 7) = 'lrtgce_'
    AND substr(id, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  campaign_id TEXT NOT NULL CHECK (length(campaign_id) = 39),
  recipient_id TEXT NOT NULL CHECK (length(recipient_id) = 39),
  effect_key_digest TEXT NOT NULL CHECK (
    length(effect_key_digest) = 64
    AND effect_key_digest NOT GLOB '*[^0-9a-f]*'
  ),
  payload_digest TEXT NOT NULL CHECK (
    length(payload_digest) = 64
    AND payload_digest NOT GLOB '*[^0-9a-f]*'
  ),
  status TEXT NOT NULL CHECK (
    status IN ('reserved', 'dispatching', 'sent', 'failed', 'ambiguous', 'canceled')
  ),
  provider_message_digest TEXT CHECK (
    provider_message_digest IS NULL
    OR (
      length(provider_message_digest) = 64
      AND provider_message_digest NOT GLOB '*[^0-9a-f]*'
    )
  ),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  completed_at TEXT CHECK (completed_at IS NULL OR length(completed_at) BETWEEN 20 AND 64),
  UNIQUE (org_id, id),
  UNIQUE (org_id, recipient_id),
  UNIQUE (org_id, effect_key_digest),
  FOREIGN KEY (org_id, campaign_id)
    REFERENCES lead_radar_tg_campaigns(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, recipient_id)
    REFERENCES lead_radar_tg_campaign_recipients(org_id, id) ON DELETE CASCADE,
  CHECK (
    (status IN ('reserved', 'dispatching') AND completed_at IS NULL)
    OR (status NOT IN ('reserved', 'dispatching') AND completed_at IS NOT NULL)
  ),
  CHECK (
    (status = 'sent' AND provider_message_digest IS NOT NULL)
    OR (status <> 'sent' AND provider_message_digest IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_effects_status
  ON lead_radar_tg_campaign_effects (org_id, campaign_id, status, updated_at, id);

CREATE TABLE IF NOT EXISTS lead_radar_tg_campaign_operations (
  id TEXT PRIMARY KEY CHECK (
    length(id) = 39
    AND substr(id, 1, 7) = 'lrtgop_'
    AND substr(id, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  campaign_id TEXT NOT NULL CHECK (length(campaign_id) = 39),
  operation_digest TEXT NOT NULL CHECK (
    length(operation_digest) = 64
    AND operation_digest NOT GLOB '*[^0-9a-f]*'
  ),
  request_fingerprint TEXT NOT NULL CHECK (
    length(request_fingerprint) = 64
    AND request_fingerprint NOT GLOB '*[^0-9a-f]*'
  ),
  operator_digest TEXT NOT NULL CHECK (
    length(operator_digest) = 64
    AND operator_digest NOT GLOB '*[^0-9a-f]*'
  ),
  action TEXT NOT NULL CHECK (
    action IN ('start', 'pause', 'resume', 'stop', 'fail')
  ),
  result_status TEXT NOT NULL CHECK (
    result_status IN ('approved', 'running', 'paused', 'stopped', 'completed', 'failed')
  ),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  UNIQUE (org_id, id),
  UNIQUE (org_id, operation_digest),
  FOREIGN KEY (org_id, campaign_id)
    REFERENCES lead_radar_tg_campaigns(org_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_operations_campaign
  ON lead_radar_tg_campaign_operations (org_id, campaign_id, created_at, id);
