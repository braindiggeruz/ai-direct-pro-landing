-- Durable transport receipt keys, written before the provider boundary.
-- No text, contact, token or session is stored. No foreign-key cascade may
-- erase the only receipt key after an uncertain provider outcome.
CREATE TABLE lead_radar_outreach_receipts (
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  effect_id TEXT NOT NULL CHECK (length(effect_id)=39 AND substr(effect_id,1,7)='lrtgce_'),
  campaign_id TEXT NOT NULL CHECK (length(campaign_id)=39 AND substr(campaign_id,1,7)='lrtgcp_'),
  recipient_id TEXT NOT NULL CHECK (length(recipient_id)=39 AND substr(recipient_id,1,7)='lrtgcr_'),
  account_id TEXT NOT NULL CHECK (length(account_id)=39 AND substr(account_id,1,7)='lrtgua_'),
  account_ref TEXT NOT NULL CHECK (length(account_ref) BETWEEN 16 AND 160),
  sender_fingerprint TEXT NOT NULL CHECK (length(sender_fingerprint)=64 AND sender_fingerprint NOT GLOB '*[^0-9a-f]*'),
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256)=64 AND payload_sha256 NOT GLOB '*[^0-9a-f]*'),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','accepted')),
  provider_message_digest TEXT CHECK (provider_message_digest IS NULL OR (length(provider_message_digest)=64 AND provider_message_digest NOT GLOB '*[^0-9a-f]*')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  next_check_at TEXT NOT NULL,
  last_checked_at TEXT,
  check_attempts INTEGER NOT NULL DEFAULT 0 CHECK (check_attempts>=0),
  settled_at TEXT,
  settlement_key TEXT CHECK (settlement_key IS NULL OR (length(settlement_key)=32 AND settlement_key NOT GLOB '*[^0-9a-f]*')),
  PRIMARY KEY (org_id,effect_id),
  UNIQUE (org_id,recipient_id),
  CHECK ((state='pending' AND settled_at IS NULL AND provider_message_digest IS NULL AND settlement_key IS NULL)
    OR (state='accepted' AND settled_at IS NOT NULL AND provider_message_digest IS NOT NULL AND settlement_key IS NOT NULL))
);
CREATE INDEX idx_lead_radar_outreach_receipts_due ON lead_radar_outreach_receipts(org_id,state,next_check_at,effect_id);
