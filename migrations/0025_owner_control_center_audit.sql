-- P3.1 Owner Control Center audit trail.
--
-- Append-only. Every platform-owner mutation writes exactly one row before the
-- caller gets a success response, and the row is keyed by the caller's
-- idempotency key so a retried request records one event, not two.
--
-- Every column is a bounded reference or a closed-list token. There is
-- deliberately no column that can hold a password, a token, an Authorization
-- header, raw Telegram content, a buyer conversation, full buyer PII or an
-- arbitrary request body. `before_json` and `after_json` hold only the safe
-- metadata the API layer explicitly allowlists, bounded to 2 KB each.

CREATE TABLE IF NOT EXISTS owner_audit_events (
  event_id          TEXT PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 120),
  actor_email       TEXT NOT NULL CHECK (length(actor_email) BETWEEN 1 AND 200),
  actor_role        TEXT NOT NULL
    CHECK (actor_role IN ('platform_owner', 'support_readonly')),
  action            TEXT NOT NULL
    CHECK (action IN (
      'store.suspend',
      'store.restore',
      'pilot.activate',
      'pilot.pause',
      'automation.replay'
    )),
  target_type       TEXT NOT NULL
    CHECK (target_type IN ('store', 'automation_job')),
  target_id         TEXT NOT NULL CHECK (length(target_id) BETWEEN 1 AND 120),
  org_id            TEXT CHECK (org_id IS NULL OR length(org_id) BETWEEN 1 AND 120),
  reason_code       TEXT NOT NULL
    CHECK (reason_code IN (
      'pilot_onboarding',
      'pilot_paused_by_owner',
      'seller_request',
      'policy_violation',
      'suspected_abuse',
      'data_quality',
      'incident_response',
      'operator_error_recovery'
    )),
  request_id        TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 120),
  idempotency_key   TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  before_json       TEXT
    CHECK (before_json IS NULL OR length(CAST(before_json AS BLOB)) <= 2048),
  after_json        TEXT
    CHECK (after_json IS NULL OR length(CAST(after_json AS BLOB)) <= 2048),
  created_at        TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_owner_audit_created
  ON owner_audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_audit_target
  ON owner_audit_events (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_audit_actor
  ON owner_audit_events (actor_email, created_at DESC);

-- Pilot state per store. Kept separate from sotuvchi_stores.status so a pilot
-- pause never has to overload the store lifecycle the agent runtime reads.
CREATE TABLE IF NOT EXISTS owner_pilot_stores (
  org_id       TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 120),
  store_id     TEXT NOT NULL CHECK (length(store_id) BETWEEN 1 AND 120),
  state        TEXT NOT NULL DEFAULT 'inactive'
    CHECK (state IN ('inactive', 'active', 'paused')),
  activated_at TEXT CHECK (activated_at IS NULL OR length(activated_at) BETWEEN 1 AND 64),
  paused_at    TEXT CHECK (paused_at IS NULL OR length(paused_at) BETWEEN 1 AND 64),
  updated_by   TEXT NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 200),
  updated_at   TEXT NOT NULL CHECK (length(updated_at) BETWEEN 1 AND 64),
  version      INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (org_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_owner_pilot_state
  ON owner_pilot_stores (state, updated_at DESC);
