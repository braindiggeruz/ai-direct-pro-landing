-- Additive inbound ledger. No ingress/producer is enabled by this migration.
-- Body ciphertext is purged after seven days. Immutable digests remain for
-- idempotency. Pending explicit opt-outs are an account-scoped dispatch barrier
-- until the existing cross-history suppression workflow has completed.
CREATE TABLE IF NOT EXISTS lead_radar_outreach_inbox (
  id TEXT PRIMARY KEY CHECK (length(id) = 38 AND substr(id,1,6) = 'lrinb_'),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  outbound_effect_id TEXT NOT NULL,
  external_event_digest TEXT NOT NULL CHECK (length(external_event_digest) = 64),
  payload_digest TEXT NOT NULL CHECK (length(payload_digest) = 64),
  kind TEXT NOT NULL CHECK (kind IN ('reply','opt_out')),
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  body_ciphertext TEXT CHECK (body_ciphertext IS NULL OR length(body_ciphertext) BETWEEN 23 AND 22000),
  body_iv TEXT CHECK (body_iv IS NULL OR length(body_iv) = 16),
  body_expires_at TEXT NOT NULL,
  body_present INTEGER NOT NULL CHECK (body_present IN (0,1)),
  workflow_state TEXT NOT NULL DEFAULT 'pending' CHECK (workflow_state IN ('pending','applied')),
  applied_at TEXT,
  classification TEXT NOT NULL DEFAULT 'needs_reply' CHECK (classification IN ('needs_reply','interested','declined','handled')),
  classified_at TEXT,
  UNIQUE (org_id,id),
  UNIQUE (org_id,account_id,external_event_digest),
  FOREIGN KEY (org_id,account_id) REFERENCES lead_radar_tg_user_accounts(org_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id,company_id) REFERENCES lead_radar_companies(org_id,id) ON DELETE RESTRICT,
  CHECK ((body_ciphertext IS NULL AND body_iv IS NULL) OR (body_ciphertext IS NOT NULL AND body_iv IS NOT NULL AND body_present=1)),
  CHECK ((workflow_state='pending' AND applied_at IS NULL) OR (workflow_state='applied' AND applied_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_lead_radar_outreach_inbox_page ON lead_radar_outreach_inbox(org_id,received_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_lead_radar_outreach_inbox_pending ON lead_radar_outreach_inbox(org_id,account_id,kind,workflow_state);
CREATE INDEX IF NOT EXISTS idx_lead_radar_outreach_inbox_retention ON lead_radar_outreach_inbox(org_id,body_expires_at) WHERE body_ciphertext IS NOT NULL;
