-- Lead Radar Telegram campaign safety, recovery and eligibility invariants.
--
-- This migration is additive and repeat-safe. It deliberately keeps contact
-- evidence as keyed digests and bounded metadata: no username, phone, message
-- body, QR token or Telegram session is introduced. A public corporate handle
-- remains only an endpoint; every automatic recipient also needs a recorded
-- qualifying contact basis with a bounded validity window.
--
-- Rollback: disable campaign autosend, stop every non-terminal campaign, export
-- aggregate audit counts, drop the unique partial index, then drop the four
-- tables below in reverse dependency order. Existing 0045 campaign records and
-- Telegram Business transport remain intact.

CREATE TABLE IF NOT EXISTS lead_radar_tg_account_safety (
  account_id TEXT NOT NULL CHECK (length(account_id) = 39),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  state TEXT NOT NULL CHECK (
    state IN ('ready', 'cooldown', 'review_required', 'restricted', 'disconnected')
  ),
  reason_code TEXT CHECK (
    reason_code IS NULL
    OR reason_code IN (
      'flood_wait', 'daily_limit', 'ambiguous_delivery',
      'provider_error', 'account_restricted', 'operator_disconnected'
    )
  ),
  blocked_until TEXT CHECK (blocked_until IS NULL OR length(blocked_until) BETWEEN 20 AND 64),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  PRIMARY KEY (org_id, account_id),
  FOREIGN KEY (org_id, account_id)
    REFERENCES lead_radar_tg_user_accounts(org_id, id) ON DELETE CASCADE,
  CHECK (
    (state = 'ready' AND reason_code IS NULL AND blocked_until IS NULL)
    OR (state = 'cooldown' AND reason_code IN ('flood_wait', 'daily_limit')
      AND blocked_until IS NOT NULL)
    OR (state IN ('review_required', 'restricted', 'disconnected')
      AND reason_code IS NOT NULL AND blocked_until IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_account_safety_state
  ON lead_radar_tg_account_safety (org_id, state, blocked_until, account_id);

CREATE TABLE IF NOT EXISTS lead_radar_tg_campaign_safety (
  campaign_id TEXT NOT NULL CHECK (length(campaign_id) = 39),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  search_id TEXT NOT NULL CHECK (length(search_id) BETWEEN 1 AND 80),
  evidence_version TEXT NOT NULL CHECK (length(evidence_version) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  PRIMARY KEY (org_id, campaign_id),
  FOREIGN KEY (org_id, campaign_id)
    REFERENCES lead_radar_tg_campaigns(org_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_safety_search
  ON lead_radar_tg_campaign_safety (org_id, search_id, created_at, campaign_id);

CREATE TABLE IF NOT EXISTS lead_radar_tg_contact_authorizations (
  id TEXT PRIMARY KEY CHECK (
    length(id) = 39
    AND substr(id, 1, 7) = 'lrtgau_'
    AND substr(id, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  company_id TEXT NOT NULL CHECK (length(company_id) BETWEEN 1 AND 80),
  endpoint_digest TEXT NOT NULL CHECK (
    length(endpoint_digest) = 64
    AND endpoint_digest NOT GLOB '*[^0-9a-f]*'
  ),
  contact_basis TEXT NOT NULL CHECK (
    contact_basis IN (
      'documented_consent', 'inbound_request',
      'existing_relationship', 'contractual_relationship'
    )
  ),
  evidence_reference_digest TEXT NOT NULL CHECK (
    length(evidence_reference_digest) = 64
    AND evidence_reference_digest NOT GLOB '*[^0-9a-f]*'
  ),
  reviewer_digest TEXT NOT NULL CHECK (
    length(reviewer_digest) = 64
    AND reviewer_digest NOT GLOB '*[^0-9a-f]*'
  ),
  idempotency_key_digest TEXT NOT NULL CHECK (
    length(idempotency_key_digest) = 64
    AND idempotency_key_digest NOT GLOB '*[^0-9a-f]*'
  ),
  request_fingerprint TEXT NOT NULL CHECK (
    length(request_fingerprint) = 64
    AND request_fingerprint NOT GLOB '*[^0-9a-f]*'
  ),
  evidence_version TEXT NOT NULL CHECK (length(evidence_version) BETWEEN 1 AND 64),
  verified_at TEXT NOT NULL CHECK (length(verified_at) BETWEEN 20 AND 64),
  expires_at TEXT NOT NULL CHECK (length(expires_at) BETWEEN 20 AND 64),
  revoked_at TEXT CHECK (revoked_at IS NULL OR length(revoked_at) BETWEEN 20 AND 64),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  UNIQUE (org_id, id),
  UNIQUE (org_id, idempotency_key_digest),
  FOREIGN KEY (org_id, company_id)
    REFERENCES lead_radar_companies(org_id, id) ON DELETE CASCADE,
  CHECK (expires_at > verified_at),
  CHECK (
    (status = 'active' AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_contact_authorizations_lookup
  ON lead_radar_tg_contact_authorizations (
    org_id, company_id, endpoint_digest, contact_basis, status, expires_at, created_at, id
  );

CREATE TABLE IF NOT EXISTS lead_radar_tg_recipient_eligibility (
  recipient_id TEXT NOT NULL CHECK (length(recipient_id) = 39),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  campaign_id TEXT NOT NULL CHECK (length(campaign_id) = 39),
  authorization_id TEXT NOT NULL CHECK (length(authorization_id) = 39),
  contact_basis TEXT NOT NULL CHECK (
    contact_basis IN (
      'documented_consent', 'inbound_request',
      'existing_relationship', 'contractual_relationship'
    )
  ),
  evidence_digest TEXT NOT NULL CHECK (
    length(evidence_digest) = 64
    AND evidence_digest NOT GLOB '*[^0-9a-f]*'
  ),
  reviewer_digest TEXT NOT NULL CHECK (
    length(reviewer_digest) = 64
    AND reviewer_digest NOT GLOB '*[^0-9a-f]*'
  ),
  evidence_version TEXT NOT NULL CHECK (length(evidence_version) BETWEEN 1 AND 64),
  verified_at TEXT NOT NULL CHECK (length(verified_at) BETWEEN 20 AND 64),
  expires_at TEXT NOT NULL CHECK (length(expires_at) BETWEEN 20 AND 64),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  PRIMARY KEY (org_id, recipient_id),
  UNIQUE (org_id, campaign_id, recipient_id),
  FOREIGN KEY (org_id, campaign_id)
    REFERENCES lead_radar_tg_campaigns(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, recipient_id)
    REFERENCES lead_radar_tg_campaign_recipients(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, authorization_id)
    REFERENCES lead_radar_tg_contact_authorizations(org_id, id) ON DELETE RESTRICT,
  CHECK (expires_at > verified_at)
);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_recipient_eligibility_expiry
  ON lead_radar_tg_recipient_eligibility (org_id, campaign_id, expires_at, recipient_id);

-- One operator-visible campaign per connected account. Queue delivery remains
-- at-least-once, while this database invariant prevents interleaved campaigns
-- from being created by concurrent API requests.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_radar_tg_campaigns_one_non_terminal
  ON lead_radar_tg_campaigns (org_id, account_id)
  WHERE status IN ('draft', 'approved', 'running', 'paused');
