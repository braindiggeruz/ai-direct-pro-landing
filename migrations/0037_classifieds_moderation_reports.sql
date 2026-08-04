-- Bormi classifieds foundation: fail-closed moderation, reports and audit.
-- Report notes and reporter references are private and never enter public
-- projections or moderation audit payloads.

CREATE TABLE market_listing_moderation (
  product_id TEXT PRIMARY KEY
    REFERENCES sotuvchi_products(id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK (state IN (
    'pending', 'approved', 'rejected', 'restricted', 'removed'
  )),
  reason_code TEXT CHECK (reason_code IS NULL OR reason_code IN (
    'new_seller_review', 'high_risk_category', 'prohibited_item',
    'suspected_fraud', 'duplicate_listing', 'misleading_content',
    'unsafe_contact', 'personal_data', 'seller_request',
    'appeal_upheld', 'other_policy'
  )),
  moderator_identity_id TEXT REFERENCES identities(id) ON DELETE RESTRICT,
  decision_source TEXT CHECK (
    decision_source IS NULL OR decision_source IN ('deterministic_policy', 'moderator')
  ),
  submitted_at TEXT NOT NULL CHECK (length(submitted_at) BETWEEN 1 AND 64),
  decided_at TEXT CHECK (decided_at IS NULL OR length(decided_at) BETWEEN 1 AND 64),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  last_operation_key TEXT NOT NULL CHECK (length(last_operation_key) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 1 AND 64),
  CHECK (
    (state = 'pending' AND decided_at IS NULL AND decision_source IS NULL)
    OR
    (state <> 'pending' AND decided_at IS NOT NULL AND decision_source IS NOT NULL)
  )
);

CREATE TABLE market_listing_reports (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 120),
  product_id TEXT NOT NULL
    REFERENCES sotuvchi_products(id) ON DELETE RESTRICT,
  reporter_identity_id TEXT REFERENCES identities(id) ON DELETE RESTRICT,
  reporter_session_hash TEXT NOT NULL CHECK (length(reporter_session_hash) = 64),
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'prohibited_item', 'suspected_fraud', 'duplicate_listing',
    'misleading_content', 'unsafe_contact', 'personal_data', 'other_policy'
  )),
  note TEXT CHECK (note IS NULL OR length(note) BETWEEN 1 AND 500),
  status TEXT NOT NULL CHECK (status IN ('open', 'triaged', 'resolved', 'dismissed')),
  moderation_action TEXT NOT NULL CHECK (moderation_action IN (
    'none', 'restricted', 'removed', 'rejected'
  )),
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 1 AND 64)
);

CREATE TABLE market_moderation_audit (
  event_id TEXT PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 120),
  product_id TEXT NOT NULL
    REFERENCES sotuvchi_products(id) ON DELETE RESTRICT,
  report_id TEXT REFERENCES market_listing_reports(id) ON DELETE RESTRICT,
  actor_type TEXT NOT NULL CHECK (actor_type IN (
    'seller', 'reporter', 'moderator', 'system'
  )),
  actor_identity_id TEXT REFERENCES identities(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN (
    'listing.submitted', 'listing.approved', 'listing.rejected',
    'listing.restricted', 'listing.removed', 'listing.appeal_upheld',
    'report.opened', 'report.triaged', 'report.resolved', 'report.dismissed'
  )),
  reason_code TEXT CHECK (reason_code IS NULL OR reason_code IN (
    'new_seller_review', 'high_risk_category', 'prohibited_item',
    'suspected_fraud', 'duplicate_listing', 'misleading_content',
    'unsafe_contact', 'personal_data', 'seller_request',
    'appeal_upheld', 'other_policy'
  )),
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 120),
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  from_state TEXT,
  to_state TEXT,
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  CHECK (from_state IS NULL OR from_state IN (
    'pending', 'approved', 'rejected', 'restricted', 'removed'
  )),
  CHECK (to_state IS NULL OR to_state IN (
    'pending', 'approved', 'rejected', 'restricted', 'removed'
  ))
);

CREATE INDEX idx_market_listing_moderation_queue
  ON market_listing_moderation (state, submitted_at, product_id);
CREATE INDEX idx_market_listing_reports_queue
  ON market_listing_reports (status, created_at, id);
CREATE INDEX idx_market_listing_reports_rate_scope
  ON market_listing_reports (reporter_session_hash, created_at);
CREATE INDEX idx_market_listing_reports_identity_rate_scope
  ON market_listing_reports (reporter_identity_id, created_at);
CREATE INDEX idx_market_listing_reports_product
  ON market_listing_reports (product_id, status, created_at);
CREATE INDEX idx_market_moderation_audit_product
  ON market_moderation_audit (product_id, created_at DESC, event_id);

-- The service checks first so ordinary callers receive a stable 429. The
-- trigger is the concurrency-safe backstop: session refreshes and parallel
-- requests cannot exceed five reports per proven identity in one hour.
CREATE TRIGGER market_listing_reports_identity_rate_limit
BEFORE INSERT ON market_listing_reports
WHEN NEW.reporter_identity_id IS NOT NULL AND (
  SELECT COUNT(*) FROM market_listing_reports
  WHERE reporter_identity_id = NEW.reporter_identity_id
    AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')
) >= 5
BEGIN
  SELECT RAISE(ABORT, 'classifieds_report_rate_limited');
END;

CREATE TRIGGER market_moderation_audit_no_update
BEFORE UPDATE ON market_moderation_audit
BEGIN
  SELECT RAISE(ABORT, 'market_moderation_audit is append-only');
END;

CREATE TRIGGER market_moderation_audit_no_delete
BEFORE DELETE ON market_moderation_audit
BEGIN
  SELECT RAISE(ABORT, 'market_moderation_audit is append-only');
END;
