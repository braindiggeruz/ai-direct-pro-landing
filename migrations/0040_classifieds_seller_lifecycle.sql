-- Bormi private seller lifecycle: the operations a seller performs on their own
-- listing after the first submission, and the seller half of an inquiry.
--
-- Additive by design. Migrations 0034-0039 are left byte-identical to the set
-- that was rehearsed against a production-shaped restore, so this file carries
-- every change the lifecycle needs rather than editing a rehearsed migration.

-- 0034 created `market_listing_operations` with the four operations the
-- submit-only foundation could perform. The lifecycle adds resubmission after a
-- rejection, republication after a seller unpublish, and the two seller-side
-- inquiry commands.
--
-- SQLite cannot widen a CHECK in place, so the table is rebuilt. It is empty at
-- this point in the ledger: nothing writes to it until a private listing exists,
-- and a private listing cannot exist before MARKET_PRIVATE_LISTING_ENABLED is
-- turned on, which happens after this migration. The copy is kept anyway so the
-- rebuild is correct if that assumption ever stops holding.
CREATE TABLE market_listing_operations_lifecycle_new (
  seller_profile_id TEXT NOT NULL
    REFERENCES seller_profiles(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  operation TEXT NOT NULL CHECK (operation IN (
    'private.submit', 'private.update', 'private.resubmit',
    'private.unpublish', 'private.republish', 'private.archive'
  )),
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  target_product_id TEXT NOT NULL
    REFERENCES sotuvchi_products(id) ON DELETE RESTRICT,
  result_version INTEGER NOT NULL CHECK (result_version >= 1),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  PRIMARY KEY (seller_profile_id, idempotency_key)
);

INSERT INTO market_listing_operations_lifecycle_new (
  seller_profile_id, idempotency_key, operation, fingerprint,
  target_product_id, result_version, created_at
)
SELECT
  seller_profile_id, idempotency_key, operation, fingerprint,
  target_product_id, result_version, created_at
FROM market_listing_operations;

DROP TABLE market_listing_operations;

ALTER TABLE market_listing_operations_lifecycle_new
  RENAME TO market_listing_operations;

CREATE INDEX idx_market_listing_operations_target
  ON market_listing_operations (target_product_id, created_at);

-- The seller's own lifecycle commands need an audit home. `market_moderation_
-- audit` is that home: it already carries actor type, request id and the state
-- either side of a transition, and it is append-only. 0037 only listed the
-- actions the moderation and report flows perform, so the three seller
-- transitions are added here.
--
-- Same rebuild reasoning as above, with one addition: the append-only triggers
-- are dropped before the table and recreated after it, because a trigger is
-- bound to the table it was declared on and would otherwise be dropped with it
-- and never restored — leaving the audit silently mutable.
DROP TRIGGER market_moderation_audit_no_update;
DROP TRIGGER market_moderation_audit_no_delete;

CREATE TABLE market_moderation_audit_lifecycle_new (
  event_id TEXT PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 120),
  product_id TEXT NOT NULL
    REFERENCES sotuvchi_products(id) ON DELETE RESTRICT,
  report_id TEXT REFERENCES market_listing_reports(id) ON DELETE RESTRICT,
  actor_type TEXT NOT NULL CHECK (actor_type IN (
    'seller', 'reporter', 'moderator', 'system'
  )),
  actor_identity_id TEXT REFERENCES identities(id) ON DELETE RESTRICT,
  -- A moderator is a platform operator authenticated by email, not a Telegram
  -- identity, so `actor_identity_id` cannot name them. Without this column a
  -- moderation decision would record what happened but not who decided it.
  -- Null for sellers and reporters, who are identified by the column above.
  actor_email TEXT CHECK (
    actor_email IS NULL OR length(actor_email) BETWEEN 1 AND 200
  ),
  action TEXT NOT NULL CHECK (action IN (
    'listing.submitted', 'listing.approved', 'listing.rejected',
    'listing.restricted', 'listing.removed', 'listing.appeal_upheld',
    'listing.unpublished', 'listing.republished', 'listing.archived',
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
  )),
  -- A moderator decision is always attributable to an operator, and a seller or
  -- reporter action never is. Enforcing both directions stops an anonymous
  -- moderation row and an operator email attached to a seller's own action.
  CHECK (
    (actor_type = 'moderator' AND actor_email IS NOT NULL)
    OR (actor_type <> 'moderator' AND actor_email IS NULL)
  )
);

INSERT INTO market_moderation_audit_lifecycle_new (
  event_id, product_id, report_id, actor_type, actor_identity_id, actor_email,
  action, reason_code, request_id, idempotency_key, from_state, to_state,
  created_at
)
SELECT
  event_id, product_id, report_id, actor_type, actor_identity_id, NULL,
  action, reason_code, request_id, idempotency_key, from_state, to_state,
  created_at
FROM market_moderation_audit;

DROP TABLE market_moderation_audit;

ALTER TABLE market_moderation_audit_lifecycle_new
  RENAME TO market_moderation_audit;

CREATE INDEX idx_market_moderation_audit_product
  ON market_moderation_audit (product_id, created_at DESC, event_id);

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

-- Closing an inquiry is a distinct command from replying to it, so it needs its
-- own key. Sharing `reply_idempotency_key` would make a reply and a later close
-- collide on the same seller-scoped unique index.
ALTER TABLE market_listing_inquiries
  ADD COLUMN close_idempotency_key TEXT;

CREATE UNIQUE INDEX idx_market_listing_inquiries_close_key
  ON market_listing_inquiries (seller_profile_id, close_idempotency_key)
  WHERE close_idempotency_key IS NOT NULL;

-- The seller's own listing list is ordered by recency across every lifecycle
-- state, which the discovery indexes do not serve: they are all narrowed to
-- published rows.
CREATE INDEX idx_listing_ownership_seller_recent
  ON listing_ownerships (seller_profile_id, status, product_id);
