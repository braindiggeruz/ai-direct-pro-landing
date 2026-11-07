-- Genuine public-business first inquiry; never aliases public availability to consent.
-- LOCAL REVIEW REQUIRED: disable all campaign writes/dispatch, export + restore-test
-- the database and inspect all FK dependents before applying this migration.
-- D1 keeps foreign_keys ON. Copy the entire dependent graph, remove children first,
-- rebuild the four CHECK constraints, restore parents first, verify both directions.
-- Existing IDs, ciphertexts, history, indexes and foreign keys retain their meaning.
-- Rollback is a code/flag rollback; do not narrow CHECKs while new-basis rows exist.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE lead_radar_public_inquiry_0081_guard (ok INTEGER NOT NULL CHECK (ok = 1));

-- Refuse an unknown downstream dependency rather than cascade-delete it.
INSERT INTO lead_radar_public_inquiry_0081_guard (ok)
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM sqlite_schema s, pragma_foreign_key_list(s.name) f
  WHERE s.type='table' AND f."table" IN ('lead_radar_tg_campaign_approvals','lead_radar_tg_contact_authorizations','lead_radar_tg_campaign_approval_media','lead_radar_tg_campaigns','lead_radar_audience_campaigns','lead_radar_tg_campaign_media','lead_radar_tg_campaign_operations','lead_radar_tg_campaign_recipients','lead_radar_tg_campaign_safety','lead_radar_tg_campaign_effects','lead_radar_tg_recipient_business_identities','lead_radar_tg_recipient_eligibility')
    AND s.name NOT IN ('lead_radar_tg_campaign_approvals','lead_radar_tg_contact_authorizations','lead_radar_tg_campaign_approval_media','lead_radar_tg_campaigns','lead_radar_audience_campaigns','lead_radar_tg_campaign_media','lead_radar_tg_campaign_operations','lead_radar_tg_campaign_recipients','lead_radar_tg_campaign_safety','lead_radar_tg_campaign_effects','lead_radar_tg_recipient_business_identities','lead_radar_tg_recipient_eligibility')
) THEN 1 ELSE 0 END;


CREATE TABLE lead_radar_tg_campaign_approvals_0081_backup AS SELECT * FROM lead_radar_tg_campaign_approvals;

CREATE TABLE lead_radar_tg_contact_authorizations_0081_backup AS SELECT * FROM lead_radar_tg_contact_authorizations;

CREATE TABLE lead_radar_tg_campaign_approval_media_0081_backup AS SELECT * FROM lead_radar_tg_campaign_approval_media;

CREATE TABLE lead_radar_tg_campaigns_0081_backup AS SELECT * FROM lead_radar_tg_campaigns;

CREATE TABLE lead_radar_audience_campaigns_0081_backup AS SELECT * FROM lead_radar_audience_campaigns;

CREATE TABLE lead_radar_tg_campaign_media_0081_backup AS SELECT * FROM lead_radar_tg_campaign_media;

CREATE TABLE lead_radar_tg_campaign_operations_0081_backup AS SELECT * FROM lead_radar_tg_campaign_operations;

CREATE TABLE lead_radar_tg_campaign_recipients_0081_backup AS SELECT * FROM lead_radar_tg_campaign_recipients;

CREATE TABLE lead_radar_tg_campaign_safety_0081_backup AS SELECT * FROM lead_radar_tg_campaign_safety;

CREATE TABLE lead_radar_tg_campaign_effects_0081_backup AS SELECT * FROM lead_radar_tg_campaign_effects;

CREATE TABLE lead_radar_tg_recipient_business_identities_0081_backup AS SELECT * FROM lead_radar_tg_recipient_business_identities;

CREATE TABLE lead_radar_tg_recipient_eligibility_0081_backup AS SELECT * FROM lead_radar_tg_recipient_eligibility;

DROP TABLE lead_radar_tg_recipient_eligibility;

DROP TABLE lead_radar_tg_recipient_business_identities;

DROP TABLE lead_radar_tg_campaign_effects;

DROP TABLE lead_radar_tg_campaign_safety;

DROP TABLE lead_radar_tg_campaign_recipients;

DROP TABLE lead_radar_tg_campaign_operations;

DROP TABLE lead_radar_tg_campaign_media;

DROP TABLE lead_radar_audience_campaigns;

DROP TABLE lead_radar_tg_campaigns;

DROP TABLE lead_radar_tg_campaign_approval_media;

DROP TABLE lead_radar_tg_contact_authorizations;

DROP TABLE lead_radar_tg_campaign_approvals;

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
      'existing_relationship', 'contractual_relationship', 'public_business_inquiry'
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

INSERT INTO lead_radar_tg_campaign_approvals SELECT * FROM lead_radar_tg_campaign_approvals_0081_backup;

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
      'existing_relationship', 'contractual_relationship', 'public_business_inquiry'
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

INSERT INTO lead_radar_tg_contact_authorizations SELECT * FROM lead_radar_tg_contact_authorizations_0081_backup;

CREATE TABLE IF NOT EXISTS lead_radar_tg_campaign_approval_media (
  approval_id TEXT NOT NULL CHECK (length(approval_id) = 39),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  media_id TEXT NOT NULL CHECK (
    length(media_id) = 39
    AND substr(media_id, 1, 7) = 'lrtgcm_'
    AND substr(media_id, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  media_digest TEXT NOT NULL CHECK (
    length(media_digest) = 64
    AND media_digest NOT GLOB '*[^0-9a-f]*'
  ),
  PRIMARY KEY (org_id, approval_id),
  FOREIGN KEY (org_id, approval_id)
    REFERENCES lead_radar_tg_campaign_approvals(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, media_id, media_digest)
    REFERENCES lead_radar_tg_media_objects(org_id, media_id, media_digest)
    ON DELETE RESTRICT
);

INSERT INTO lead_radar_tg_campaign_approval_media SELECT * FROM lead_radar_tg_campaign_approval_media_0081_backup;

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
      'existing_relationship', 'contractual_relationship', 'public_business_inquiry'
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

INSERT INTO lead_radar_tg_campaigns SELECT * FROM lead_radar_tg_campaigns_0081_backup;

CREATE TABLE IF NOT EXISTS lead_radar_audience_campaigns (
  org_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  audience_id TEXT NOT NULL,
  audience_version INTEGER NOT NULL CHECK (audience_version >= 1),
  company_ids_json TEXT NOT NULL CHECK (json_valid(company_ids_json)
    AND json_type(company_ids_json) = 'array'
    AND json_array_length(company_ids_json) BETWEEN 1 AND 50),
  PRIMARY KEY (org_id, campaign_id),
  FOREIGN KEY (org_id, audience_id) REFERENCES lead_radar_audiences(org_id, id),
  FOREIGN KEY (org_id, campaign_id) REFERENCES lead_radar_tg_campaigns(org_id, id) ON DELETE CASCADE
);

INSERT INTO lead_radar_audience_campaigns SELECT * FROM lead_radar_audience_campaigns_0081_backup;

CREATE TABLE IF NOT EXISTS lead_radar_tg_campaign_media (
  campaign_id TEXT NOT NULL CHECK (length(campaign_id) = 39),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  media_id TEXT NOT NULL CHECK (
    length(media_id) = 39
    AND substr(media_id, 1, 7) = 'lrtgcm_'
    AND substr(media_id, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  media_digest TEXT NOT NULL CHECK (
    length(media_digest) = 64
    AND media_digest NOT GLOB '*[^0-9a-f]*'
  ),
  PRIMARY KEY (org_id, campaign_id),
  FOREIGN KEY (org_id, campaign_id)
    REFERENCES lead_radar_tg_campaigns(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, media_id, media_digest)
    REFERENCES lead_radar_tg_media_objects(org_id, media_id, media_digest)
    ON DELETE RESTRICT
);

INSERT INTO lead_radar_tg_campaign_media SELECT * FROM lead_radar_tg_campaign_media_0081_backup;

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

INSERT INTO lead_radar_tg_campaign_operations SELECT * FROM lead_radar_tg_campaign_operations_0081_backup;

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

INSERT INTO lead_radar_tg_campaign_recipients SELECT * FROM lead_radar_tg_campaign_recipients_0081_backup;

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

INSERT INTO lead_radar_tg_campaign_safety SELECT * FROM lead_radar_tg_campaign_safety_0081_backup;

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

INSERT INTO lead_radar_tg_campaign_effects SELECT * FROM lead_radar_tg_campaign_effects_0081_backup;

CREATE TABLE IF NOT EXISTS lead_radar_tg_recipient_business_identities (
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  recipient_id TEXT NOT NULL CHECK (length(recipient_id) = 39),
  identity_kind TEXT NOT NULL CHECK (identity_kind IN ('canonical', 'domain', 'phone')),
  identity_digest TEXT NOT NULL CHECK (
    length(identity_digest) = 64
    AND identity_digest NOT GLOB '*[^0-9a-f]*'
  ),
  PRIMARY KEY (org_id, recipient_id, identity_digest),
  UNIQUE (org_id, recipient_id, identity_kind),
  FOREIGN KEY (org_id, recipient_id)
    REFERENCES lead_radar_tg_campaign_recipients(org_id, id) ON DELETE CASCADE
);

INSERT INTO lead_radar_tg_recipient_business_identities SELECT * FROM lead_radar_tg_recipient_business_identities_0081_backup;

CREATE TABLE IF NOT EXISTS lead_radar_tg_recipient_eligibility (
  recipient_id TEXT NOT NULL CHECK (length(recipient_id) = 39),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  campaign_id TEXT NOT NULL CHECK (length(campaign_id) = 39),
  authorization_id TEXT NOT NULL CHECK (length(authorization_id) = 39),
  contact_basis TEXT NOT NULL CHECK (
    contact_basis IN (
      'documented_consent', 'inbound_request',
      'existing_relationship', 'contractual_relationship', 'public_business_inquiry'
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

INSERT INTO lead_radar_tg_recipient_eligibility SELECT * FROM lead_radar_tg_recipient_eligibility_0081_backup;

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_approvals_expiry
  ON lead_radar_tg_campaign_approvals (org_id, expires_at, consumed_at, id);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaigns_status
  ON lead_radar_tg_campaigns (org_id, status, next_send_at, updated_at, id);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaigns_account
  ON lead_radar_tg_campaigns (org_id, account_id, status, updated_at, id);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_recipients_due
  ON lead_radar_tg_campaign_recipients (org_id, campaign_id, status, sequence_no, id);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_recipients_lease
  ON lead_radar_tg_campaign_recipients (status, lease_expires_at, org_id, campaign_id, id);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_effects_status
  ON lead_radar_tg_campaign_effects (org_id, campaign_id, status, updated_at, id);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_operations_campaign
  ON lead_radar_tg_campaign_operations (org_id, campaign_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_safety_search
  ON lead_radar_tg_campaign_safety (org_id, search_id, created_at, campaign_id);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_contact_authorizations_lookup
  ON lead_radar_tg_contact_authorizations (
    org_id, company_id, endpoint_digest, contact_basis, status, expires_at, created_at, id
  );

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_recipient_eligibility_expiry
  ON lead_radar_tg_recipient_eligibility (org_id, campaign_id, expires_at, recipient_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_radar_tg_campaigns_one_non_terminal
  ON lead_radar_tg_campaigns (org_id, account_id)
  WHERE status IN ('draft', 'approved', 'running', 'paused');

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_approval_media_object
  ON lead_radar_tg_campaign_approval_media (org_id, media_id, media_digest, approval_id);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_media_object
  ON lead_radar_tg_campaign_media (org_id, media_id, media_digest, campaign_id);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_recipient_business_identity
  ON lead_radar_tg_recipient_business_identities (org_id, identity_digest, recipient_id);

CREATE INDEX IF NOT EXISTS idx_lead_radar_audience_campaigns_audience
  ON lead_radar_audience_campaigns (org_id, audience_id, campaign_id);

INSERT INTO lead_radar_public_inquiry_0081_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM lead_radar_tg_campaign_approvals) = (SELECT COUNT(*) FROM lead_radar_tg_campaign_approvals_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaign_approvals EXCEPT SELECT * FROM lead_radar_tg_campaign_approvals_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaign_approvals_0081_backup EXCEPT SELECT * FROM lead_radar_tg_campaign_approvals)
 THEN 1 ELSE 0 END;

INSERT INTO lead_radar_public_inquiry_0081_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM lead_radar_tg_contact_authorizations) = (SELECT COUNT(*) FROM lead_radar_tg_contact_authorizations_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_contact_authorizations EXCEPT SELECT * FROM lead_radar_tg_contact_authorizations_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_contact_authorizations_0081_backup EXCEPT SELECT * FROM lead_radar_tg_contact_authorizations)
 THEN 1 ELSE 0 END;

INSERT INTO lead_radar_public_inquiry_0081_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM lead_radar_tg_campaign_approval_media) = (SELECT COUNT(*) FROM lead_radar_tg_campaign_approval_media_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaign_approval_media EXCEPT SELECT * FROM lead_radar_tg_campaign_approval_media_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaign_approval_media_0081_backup EXCEPT SELECT * FROM lead_radar_tg_campaign_approval_media)
 THEN 1 ELSE 0 END;

INSERT INTO lead_radar_public_inquiry_0081_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM lead_radar_tg_campaigns) = (SELECT COUNT(*) FROM lead_radar_tg_campaigns_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaigns EXCEPT SELECT * FROM lead_radar_tg_campaigns_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaigns_0081_backup EXCEPT SELECT * FROM lead_radar_tg_campaigns)
 THEN 1 ELSE 0 END;

INSERT INTO lead_radar_public_inquiry_0081_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM lead_radar_audience_campaigns) = (SELECT COUNT(*) FROM lead_radar_audience_campaigns_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_audience_campaigns EXCEPT SELECT * FROM lead_radar_audience_campaigns_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_audience_campaigns_0081_backup EXCEPT SELECT * FROM lead_radar_audience_campaigns)
 THEN 1 ELSE 0 END;

INSERT INTO lead_radar_public_inquiry_0081_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM lead_radar_tg_campaign_media) = (SELECT COUNT(*) FROM lead_radar_tg_campaign_media_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaign_media EXCEPT SELECT * FROM lead_radar_tg_campaign_media_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaign_media_0081_backup EXCEPT SELECT * FROM lead_radar_tg_campaign_media)
 THEN 1 ELSE 0 END;

INSERT INTO lead_radar_public_inquiry_0081_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM lead_radar_tg_campaign_operations) = (SELECT COUNT(*) FROM lead_radar_tg_campaign_operations_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaign_operations EXCEPT SELECT * FROM lead_radar_tg_campaign_operations_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaign_operations_0081_backup EXCEPT SELECT * FROM lead_radar_tg_campaign_operations)
 THEN 1 ELSE 0 END;

INSERT INTO lead_radar_public_inquiry_0081_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients) = (SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaign_recipients EXCEPT SELECT * FROM lead_radar_tg_campaign_recipients_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaign_recipients_0081_backup EXCEPT SELECT * FROM lead_radar_tg_campaign_recipients)
 THEN 1 ELSE 0 END;

INSERT INTO lead_radar_public_inquiry_0081_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM lead_radar_tg_campaign_safety) = (SELECT COUNT(*) FROM lead_radar_tg_campaign_safety_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaign_safety EXCEPT SELECT * FROM lead_radar_tg_campaign_safety_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaign_safety_0081_backup EXCEPT SELECT * FROM lead_radar_tg_campaign_safety)
 THEN 1 ELSE 0 END;

INSERT INTO lead_radar_public_inquiry_0081_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM lead_radar_tg_campaign_effects) = (SELECT COUNT(*) FROM lead_radar_tg_campaign_effects_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaign_effects EXCEPT SELECT * FROM lead_radar_tg_campaign_effects_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_campaign_effects_0081_backup EXCEPT SELECT * FROM lead_radar_tg_campaign_effects)
 THEN 1 ELSE 0 END;

INSERT INTO lead_radar_public_inquiry_0081_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM lead_radar_tg_recipient_business_identities) = (SELECT COUNT(*) FROM lead_radar_tg_recipient_business_identities_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_recipient_business_identities EXCEPT SELECT * FROM lead_radar_tg_recipient_business_identities_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_recipient_business_identities_0081_backup EXCEPT SELECT * FROM lead_radar_tg_recipient_business_identities)
 THEN 1 ELSE 0 END;

INSERT INTO lead_radar_public_inquiry_0081_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM lead_radar_tg_recipient_eligibility) = (SELECT COUNT(*) FROM lead_radar_tg_recipient_eligibility_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_recipient_eligibility EXCEPT SELECT * FROM lead_radar_tg_recipient_eligibility_0081_backup)
 AND NOT EXISTS (SELECT * FROM lead_radar_tg_recipient_eligibility_0081_backup EXCEPT SELECT * FROM lead_radar_tg_recipient_eligibility)
 THEN 1 ELSE 0 END;

INSERT INTO lead_radar_public_inquiry_0081_guard (ok) SELECT 0 FROM pragma_foreign_key_check LIMIT 1;

DROP TABLE lead_radar_tg_recipient_eligibility_0081_backup;

DROP TABLE lead_radar_tg_recipient_business_identities_0081_backup;

DROP TABLE lead_radar_tg_campaign_effects_0081_backup;

DROP TABLE lead_radar_tg_campaign_safety_0081_backup;

DROP TABLE lead_radar_tg_campaign_recipients_0081_backup;

DROP TABLE lead_radar_tg_campaign_operations_0081_backup;

DROP TABLE lead_radar_tg_campaign_media_0081_backup;

DROP TABLE lead_radar_audience_campaigns_0081_backup;

DROP TABLE lead_radar_tg_campaigns_0081_backup;

DROP TABLE lead_radar_tg_campaign_approval_media_0081_backup;

DROP TABLE lead_radar_tg_contact_authorizations_0081_backup;

DROP TABLE lead_radar_tg_campaign_approvals_0081_backup;

DROP TABLE lead_radar_public_inquiry_0081_guard;
PRAGMA defer_foreign_keys = OFF;
