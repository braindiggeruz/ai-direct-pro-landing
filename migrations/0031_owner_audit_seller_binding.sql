-- Let the owner audit log record a seller identity binding.
--
-- `owner_audit_events.action` is a CHECK over a closed list of five verbs, none
-- of which is "an owner gave a Telegram identity access to their store". Without
-- this the binding would have to happen unaudited, and an unaudited grant of
-- seller authority is not something that should be possible to perform.
--
-- SQLite cannot alter a CHECK in place, so the table is rebuilt. Every column,
-- constraint and index is carried across unchanged; the only difference is two
-- more permitted values in one list.
--
-- `target_type` is deliberately NOT extended. The thing being granted access to
-- is the store, so a binding is recorded as target_type 'store' with the store's
-- id — which the existing idx_owner_audit_target already indexes. `reason_code`
-- is not extended either: 'seller_request' already describes exactly this.
--
-- Rollback: see the note at the bottom. It is only safe while no row uses the
-- new verbs.

CREATE TABLE owner_audit_events_new (
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
      'automation.replay',
      -- An owner-assisted grant of seller authority to a Telegram identity, and
      -- the withdrawal that reverses it. Paired like pilot.activate/pilot.pause.
      'seller.bind',
      'seller.unbind'
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

INSERT INTO owner_audit_events_new (
  event_id, actor_email, actor_role, action, target_type, target_id, org_id,
  reason_code, request_id, idempotency_key, before_json, after_json, created_at
)
SELECT
  event_id, actor_email, actor_role, action, target_type, target_id, org_id,
  reason_code, request_id, idempotency_key, before_json, after_json, created_at
FROM owner_audit_events;

DROP TABLE owner_audit_events;

ALTER TABLE owner_audit_events_new RENAME TO owner_audit_events;

CREATE INDEX idx_owner_audit_actor
  ON owner_audit_events (actor_email, created_at DESC);

CREATE INDEX idx_owner_audit_created
  ON owner_audit_events (created_at DESC);

CREATE INDEX idx_owner_audit_target
  ON owner_audit_events (target_type, target_id, created_at DESC);

-- Rollback
-- --------
-- The reverse rebuild — same table with the original five verbs — is only valid
-- while no row carries 'seller.bind' or 'seller.unbind'. Once a binding has been
-- audited, narrowing the CHECK would either fail on the copy or, worse, require
-- dropping the very row that records the grant. After a binding exists, reverse
-- the *binding* at the application level instead (membership status 'disabled',
-- recorded as 'seller.unbind') and leave this schema in place. Deleting audit
-- history to restore a constraint is not a rollback.
