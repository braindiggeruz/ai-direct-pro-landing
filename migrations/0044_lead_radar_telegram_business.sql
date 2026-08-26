-- Lead Radar Telegram Business transport foundation.
--
-- This migration is additive and dormant by default. Rolling the application
-- back leaves only encrypted identifiers, keyed digests and bounded transport
-- metadata; it never stores a bot token, Telegram username, message text or a
-- person's name. If a later manual database rollback is required, drop the
-- six tables below in reverse dependency order after exporting audit counts.

CREATE TABLE IF NOT EXISTS lead_radar_tg_connect_nonces (
  id TEXT PRIMARY KEY CHECK (
    length(id) = 38
    AND substr(id, 1, 6) = 'lrtgn_'
    AND substr(id, 7) NOT GLOB '*[^0-9a-f]*'
  ),
  -- Owner-control tenants use a deterministic ownerOrgId and are not rows in
  -- `organizations`; isolation is enforced by every query and the composite
  -- Telegram/Lead-Radar foreign keys below.
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  lookup_key TEXT NOT NULL CHECK (
    length(lookup_key) = 16
    AND lookup_key NOT GLOB '*[^0-9a-f]*'
  ),
  nonce_hash TEXT NOT NULL CHECK (
    length(nonce_hash) = 64
    AND nonce_hash NOT GLOB '*[^0-9a-f]*'
  ),
  user_chat_digest TEXT CHECK (
    user_chat_digest IS NULL
    OR (
      length(user_chat_digest) = 64
      AND user_chat_digest NOT GLOB '*[^0-9a-f]*'
    )
  ),
  start_update_digest TEXT CHECK (
    start_update_digest IS NULL
    OR (
      length(start_update_digest) = 64
      AND start_update_digest NOT GLOB '*[^0-9a-f]*'
    )
  ),
  expires_at TEXT NOT NULL CHECK (length(expires_at) BETWEEN 20 AND 64),
  used_at TEXT CHECK (used_at IS NULL OR length(used_at) BETWEEN 20 AND 64),
  superseded_at TEXT CHECK (
    superseded_at IS NULL OR length(superseded_at) BETWEEN 20 AND 64
  ),
  connection_bound_at TEXT CHECK (
    connection_bound_at IS NULL OR length(connection_bound_at) BETWEEN 20 AND 64
  ),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  UNIQUE (lookup_key),
  UNIQUE (org_id, nonce_hash),
  CHECK (
    (used_at IS NULL AND user_chat_digest IS NULL AND start_update_digest IS NULL)
    OR (used_at IS NOT NULL AND user_chat_digest IS NOT NULL AND start_update_digest IS NOT NULL)
  ),
  CHECK (connection_bound_at IS NULL OR used_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS lead_radar_tg_business_connections (
  id TEXT PRIMARY KEY CHECK (
    length(id) = 38
    AND substr(id, 1, 6) = 'lrtgc_'
    AND substr(id, 7) NOT GLOB '*[^0-9a-f]*'
  ),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  connection_digest TEXT NOT NULL CHECK (
    length(connection_digest) = 64
    AND connection_digest NOT GLOB '*[^0-9a-f]*'
  ),
  connection_ciphertext TEXT NOT NULL CHECK (length(connection_ciphertext) BETWEEN 23 AND 1024),
  connection_iv TEXT NOT NULL CHECK (
    length(connection_iv) = 16
    AND connection_iv NOT GLOB '*[^A-Za-z0-9_-]*'
  ),
  user_chat_digest TEXT NOT NULL CHECK (
    length(user_chat_digest) = 64
    AND user_chat_digest NOT GLOB '*[^0-9a-f]*'
  ),
  user_chat_ciphertext TEXT NOT NULL CHECK (length(user_chat_ciphertext) BETWEEN 23 AND 512),
  user_chat_iv TEXT NOT NULL CHECK (
    length(user_chat_iv) = 16
    AND user_chat_iv NOT GLOB '*[^A-Za-z0-9_-]*'
  ),
  is_enabled INTEGER NOT NULL CHECK (is_enabled IN (0, 1)),
  can_reply INTEGER NOT NULL CHECK (can_reply IN (0, 1)),
  connected_at TEXT NOT NULL CHECK (length(connected_at) BETWEEN 20 AND 64),
  lifecycle_update_id INTEGER NOT NULL CHECK (lifecycle_update_id > 0),
  lifecycle_event_at TEXT NOT NULL CHECK (length(lifecycle_event_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  disabled_at TEXT CHECK (disabled_at IS NULL OR length(disabled_at) BETWEEN 20 AND 64),
  UNIQUE (org_id, id),
  UNIQUE (org_id, connection_digest),
  UNIQUE (org_id, user_chat_digest),
  CHECK (
    (is_enabled = 1 AND disabled_at IS NULL)
    OR (is_enabled = 0 AND disabled_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS lead_radar_tg_company_chats (
  id TEXT PRIMARY KEY CHECK (
    length(id) = 38
    AND substr(id, 1, 6) = 'lrtgb_'
    AND substr(id, 7) NOT GLOB '*[^0-9a-f]*'
  ),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  connection_id TEXT NOT NULL CHECK (length(connection_id) = 38),
  company_id TEXT NOT NULL CHECK (length(company_id) BETWEEN 1 AND 80),
  chat_digest TEXT NOT NULL CHECK (
    length(chat_digest) = 64
    AND chat_digest NOT GLOB '*[^0-9a-f]*'
  ),
  chat_ciphertext TEXT NOT NULL CHECK (length(chat_ciphertext) BETWEEN 23 AND 512),
  chat_iv TEXT NOT NULL CHECK (
    length(chat_iv) = 16
    AND chat_iv NOT GLOB '*[^A-Za-z0-9_-]*'
  ),
  endpoint_digest TEXT NOT NULL CHECK (
    length(endpoint_digest) = 64
    AND endpoint_digest NOT GLOB '*[^0-9a-f]*'
  ),
  first_inbound_at TEXT NOT NULL CHECK (length(first_inbound_at) BETWEEN 20 AND 64),
  last_inbound_at TEXT NOT NULL CHECK (length(last_inbound_at) BETWEEN 20 AND 64),
  active_until TEXT NOT NULL CHECK (length(active_until) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  UNIQUE (org_id, id),
  UNIQUE (org_id, connection_id, chat_digest),
  UNIQUE (org_id, connection_id, company_id),
  FOREIGN KEY (org_id, connection_id)
    REFERENCES lead_radar_tg_business_connections(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, company_id)
    REFERENCES lead_radar_companies(org_id, id) ON DELETE CASCADE,
  CHECK (last_inbound_at >= first_inbound_at),
  CHECK (active_until > last_inbound_at)
);

CREATE TABLE IF NOT EXISTS lead_radar_tg_webhook_updates (
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  update_digest TEXT NOT NULL CHECK (
    length(update_digest) = 64
    AND update_digest NOT GLOB '*[^0-9a-f]*'
  ),
  update_kind TEXT NOT NULL CHECK (
    update_kind IN ('start', 'business_connection', 'business_message')
  ),
  processed_at TEXT NOT NULL CHECK (length(processed_at) BETWEEN 20 AND 64),
  PRIMARY KEY (org_id, update_digest)
);

CREATE TABLE IF NOT EXISTS lead_radar_tg_send_approvals (
  id TEXT PRIMARY KEY CHECK (
    length(id) = 38
    AND substr(id, 1, 6) = 'lrtga_'
    AND substr(id, 7) NOT GLOB '*[^0-9a-f]*'
  ),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  company_id TEXT NOT NULL CHECK (length(company_id) BETWEEN 1 AND 80),
  binding_id TEXT NOT NULL CHECK (length(binding_id) = 38),
  token_digest TEXT NOT NULL CHECK (
    length(token_digest) = 64
    AND token_digest NOT GLOB '*[^0-9a-f]*'
  ),
  payload_digest TEXT NOT NULL CHECK (
    length(payload_digest) = 64
    AND payload_digest NOT GLOB '*[^0-9a-f]*'
  ),
  operator_digest TEXT NOT NULL CHECK (
    length(operator_digest) = 64
    AND operator_digest NOT GLOB '*[^0-9a-f]*'
  ),
  expires_at TEXT NOT NULL CHECK (length(expires_at) BETWEEN 20 AND 64),
  consumed_at TEXT CHECK (consumed_at IS NULL OR length(consumed_at) BETWEEN 20 AND 64),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  UNIQUE (org_id, id),
  UNIQUE (org_id, token_digest),
  FOREIGN KEY (org_id, binding_id)
    REFERENCES lead_radar_tg_company_chats(org_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lead_radar_tg_send_effects (
  id TEXT PRIMARY KEY CHECK (
    length(id) = 38
    AND substr(id, 1, 6) = 'lrtgs_'
    AND substr(id, 7) NOT GLOB '*[^0-9a-f]*'
  ),
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  binding_id TEXT NOT NULL CHECK (length(binding_id) = 38),
  approval_id TEXT NOT NULL CHECK (length(approval_id) = 38),
  idempotency_key_digest TEXT NOT NULL CHECK (
    length(idempotency_key_digest) = 64
    AND idempotency_key_digest NOT GLOB '*[^0-9a-f]*'
  ),
  payload_digest TEXT NOT NULL CHECK (
    length(payload_digest) = 64
    AND payload_digest NOT GLOB '*[^0-9a-f]*'
  ),
  approval_digest TEXT NOT NULL CHECK (
    length(approval_digest) = 64
    AND approval_digest NOT GLOB '*[^0-9a-f]*'
  ),
  status TEXT NOT NULL CHECK (
    status IN ('reserved', 'dispatching', 'sent', 'ambiguous', 'canceled')
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
  sent_at TEXT CHECK (sent_at IS NULL OR length(sent_at) BETWEEN 20 AND 64),
  UNIQUE (org_id, idempotency_key_digest),
  UNIQUE (org_id, approval_id),
  FOREIGN KEY (org_id, binding_id)
    REFERENCES lead_radar_tg_company_chats(org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, approval_id)
    REFERENCES lead_radar_tg_send_approvals(org_id, id) ON DELETE CASCADE,
  CHECK (
    (status = 'sent' AND sent_at IS NOT NULL AND provider_message_digest IS NOT NULL)
    OR (status <> 'sent' AND sent_at IS NULL AND provider_message_digest IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_nonces_expiry
  ON lead_radar_tg_connect_nonces (org_id, connection_bound_at, superseded_at, expires_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_radar_tg_nonces_active_org
  ON lead_radar_tg_connect_nonces (org_id)
  WHERE connection_bound_at IS NULL AND superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_nonces_user_pending
  ON lead_radar_tg_connect_nonces (user_chat_digest, connection_bound_at, superseded_at, expires_at, id);
CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_connections_digest
  ON lead_radar_tg_business_connections (connection_digest, org_id, id);
CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_connections_status
  ON lead_radar_tg_business_connections (org_id, is_enabled, can_reply, updated_at, id);
CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_bindings_chat
  ON lead_radar_tg_company_chats (org_id, connection_id, chat_digest, id);
CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_bindings_active
  ON lead_radar_tg_company_chats (org_id, company_id, active_until, id);
CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_updates_recent
  ON lead_radar_tg_webhook_updates (org_id, processed_at, update_digest);
CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_approvals_expiry
  ON lead_radar_tg_send_approvals (org_id, expires_at, consumed_at, id);
CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_send_status
  ON lead_radar_tg_send_effects (org_id, status, updated_at, id);
