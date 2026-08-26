-- Hard R2 allowance guard for Lead Radar Telegram campaign media.
--
-- Additive migration. Rollback is application-only: disable Telegram campaign
-- uploads and keep this accounting ledger. Dropping it would remove the only
-- atomic bound on private R2 growth.
--
-- Each deterministic media id reserves capacity before PutObject. Failed or
-- orphaned uploads retain capacity until bounded maintenance first takes an
-- exclusive `releasing` lease and then proves the R2 object is absent. Active
-- media uses a permanent `released` tombstone after physical deletion, matching
-- lead_radar_tg_media_objects and preventing an ABA re-upload race.

-- A connected MTProto result crosses two durable systems. Keep the opaque
-- gateway reference in a separate staging row while the D1 account is still
-- pending. Pages can then idempotently finalize local Bridge custody and only
-- afterwards CAS the account to connected. A process crash at either await is
-- recoverable from this row without storing the plaintext auth id.
CREATE TABLE IF NOT EXISTS lead_radar_tg_account_finalizations (
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  account_id TEXT NOT NULL CHECK (
    length(account_id) = 39 AND account_id GLOB 'lrtgua_[0-9a-f]*'
  ),
  gateway_account_ref TEXT NOT NULL CHECK (
    length(gateway_account_ref) BETWEEN 16 AND 160
    AND gateway_account_ref NOT GLOB '*[^A-Za-z0-9:_-]*'
  ),
  gateway_account_ref_digest TEXT NOT NULL CHECK (
    length(gateway_account_ref_digest) = 64
    AND gateway_account_ref_digest NOT GLOB '*[^0-9a-f]*'
  ),
  masked_label TEXT NOT NULL CHECK (length(masked_label) BETWEEN 1 AND 40),
  provider_connected_at TEXT NOT NULL CHECK (
    length(provider_connected_at) BETWEEN 20 AND 64
  ),
  account_state_version INTEGER NOT NULL CHECK (account_state_version >= 0),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  PRIMARY KEY (org_id, account_id),
  UNIQUE (org_id, gateway_account_ref_digest),
  FOREIGN KEY (org_id, account_id)
    REFERENCES lead_radar_tg_user_accounts(org_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_account_finalizations_updated
  ON lead_radar_tg_account_finalizations(updated_at, org_id, account_id);

CREATE TABLE IF NOT EXISTS lead_radar_tg_media_quota_reservations (
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  media_id TEXT NOT NULL CHECK (
    length(media_id) = 39 AND media_id GLOB 'lrtgcm_[0-9a-f]*'
  ),
  media_digest TEXT NOT NULL CHECK (
    length(media_digest) = 64
    AND media_digest NOT GLOB '*[^0-9a-f]*'
  ),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 5000000),
  status TEXT NOT NULL CHECK (
    status IN ('reserved', 'releasing', 'active', 'released')
  ),
  expires_at TEXT NOT NULL CHECK (length(expires_at) BETWEEN 20 AND 64),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  PRIMARY KEY (org_id, media_id)
);

-- Migration cannot recover object sizes without reading R2. Seed every
-- pre-existing non-deleted registry row at the per-object maximum, rather than
-- silently treating unknown bytes as zero. Fresh production currently has no
-- such rows; other environments still fail closed until bounded maintenance
-- reconciles or deletes their legacy objects.
INSERT OR IGNORE INTO lead_radar_tg_media_quota_reservations (
  org_id, media_id, media_digest, size_bytes, status,
  expires_at, created_at, updated_at
)
SELECT
  org_id, media_id, media_digest, 5000000,
  CASE WHEN status = 'active' THEN 'active' ELSE 'reserved' END,
  expires_at, created_at, updated_at
FROM lead_radar_tg_media_objects
WHERE status IN ('active', 'deleting');

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_media_quota_expiry
  ON lead_radar_tg_media_quota_reservations(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_media_quota_lease
  ON lead_radar_tg_media_quota_reservations(status, updated_at);
