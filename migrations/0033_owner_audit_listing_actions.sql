-- Let the owner audit log record a listing lifecycle action.
--
-- `owner_audit_events` constrains two columns that a listing action cannot
-- satisfy today:
--
--   `action` is a closed list of seven verbs, all of which are about a store, a
--   pilot, an automation job or a seller grant. None of them means "the platform
--   owner published this listing". Recording a publish as `store.suspend` or as
--   `automation.replay` would make the trail actively misleading, which is worse
--   than having no entry — and writing no entry at all is not an option, because
--   an unaudited change to what buyers can see is exactly the thing this table
--   exists to prevent.
--
--   `target_type` is ('store', 'automation_job'). A listing action is performed
--   on a product. `0031` deliberately did not extend this column, and it was
--   right not to: a seller binding grants access *to a store*, so the store is
--   the target. A publish is not performed on a store. Recording it as one would
--   leave `idx_owner_audit_target` unable to answer "what happened to this
--   listing" — the product id would exist only inside `before_json`, which is
--   free-form and unindexed.
--
-- So both lists grow, by exactly what is needed and nothing else.
--
-- `reason_code` is NOT extended. The existing eight already describe why an
-- owner would touch a listing: 'data_quality' for a card that should not be
-- public, 'policy_violation' and 'suspected_abuse' for one that breaks the
-- rules, 'seller_request' when the seller asked, 'operator_error_recovery' when
-- a previous action was wrong. Adding a ninth would be inventing vocabulary for
-- a need that does not exist yet.
--
-- SQLite cannot alter a CHECK in place, so the table is rebuilt. Every column,
-- constraint, default and index is carried across unchanged. The only
-- differences are three more permitted actions and one more permitted target
-- type. No business table is touched.
--
-- Rehearsal: docs/admin/BORMI_ADMIN_AUDIT_ACTION_MIGRATION_REHEARSAL.md
-- Rollback:  see the note at the bottom.

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
      'seller.bind',
      'seller.unbind',
      -- The three transitions the catalogue domain actually implements:
      -- draft -> published, published -> draft, and anything -> archived.
      -- Named after the thing being changed, like every verb above it.
      'listing.publish',
      'listing.unpublish',
      'listing.archive'
    )),
  target_type       TEXT NOT NULL
    CHECK (target_type IN ('store', 'automation_job', 'product')),
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
-- The reverse rebuild — the same table without the three listing verbs and
-- without 'product' — is only valid while no row uses them. Once a listing
-- action has been audited, narrowing the CHECK would either fail on the copy or
-- require deleting the very row that records what the owner did to a seller's
-- listing. Deleting audit history to restore a constraint is not a rollback.
--
-- After a listing action exists, roll back the *action* instead, through the
-- opposite domain transition (publish <-> unpublish; archive has no reverse in
-- the catalogue domain), and leave this schema in place.
