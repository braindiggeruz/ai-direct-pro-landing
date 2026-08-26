-- Private image references for Lead Radar Telegram account campaigns.
--
-- Image bytes and metadata live only in the private, non-public R2 bucket.
-- D1 freezes only the opaque object id and exact SHA-256 digest into both the
-- short-lived approval and the resulting campaign. This keeps Queue messages
-- content-free and makes an attachment substitution invalidate approval.
--
-- Rollback: disable campaign autosend and media upload/delete, stop every
-- non-terminal campaign, retain/export the no-repeat history, then remove R2
-- objects after the retention window. Drop (in order) campaign_media,
-- approval_media, recipient_business_identities, maintenance_state,
-- media_sweep_state, data_key_state, routing_key_state, contact_history, and media_objects plus
-- their indexes. Existing text-only campaign tables then remain valid. Never
-- drop contact_history while sends made under this migration may be repeated.

-- Cross-storage lifecycle barrier. `active -> deleting -> deleted` is claimed
-- in D1 before any R2 delete, while approval freeze is allowed only from an
-- active row. This closes HEAD/freeze/delete and sweep/freeze races without
-- persisting filenames, bytes, MIME data or URLs.
CREATE TABLE IF NOT EXISTS lead_radar_tg_media_objects (
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
  status TEXT NOT NULL CHECK (status IN ('active', 'deleting', 'deleted')),
  expires_at TEXT NOT NULL CHECK (length(expires_at) BETWEEN 20 AND 64),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  PRIMARY KEY (org_id, media_id),
  UNIQUE (org_id, media_id, media_digest)
);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_media_objects_expiry
  ON lead_radar_tg_media_objects (status, expires_at, org_id, media_id);

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

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_approval_media_object
  ON lead_radar_tg_campaign_approval_media (org_id, media_id, media_digest, approval_id);

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

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_campaign_media_object
  ON lead_radar_tg_campaign_media (org_id, media_id, media_digest, campaign_id);

-- Stable business aliases are frozen as tenant-keyed digests. Canonical key,
-- verified domain and normalized corporate phone remain distinct aliases so a
-- rediscovered business is still blocked if its lead id and Telegram username
-- both change. Names/cities are intentionally excluded to avoid blocking two
-- unrelated businesses that happen to share a common name.
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

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_recipient_business_identity
  ON lead_radar_tg_recipient_business_identities (org_id, identity_digest, recipient_id);

-- Permanent tenant-scoped no-repeat guard. It stores no username or message:
-- only opaque row ids and tenant-keyed company/endpoint/business digests. It
-- deliberately has no foreign keys: terminal recipient/effect/company rows can
-- be removed under retention while this standalone tombstone remains.
-- `reserved` and `ambiguous` both fail closed because neither permits proving
-- that a previous provider effect did not reach the recipient.
CREATE TABLE IF NOT EXISTS lead_radar_tg_contact_history (
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  identity_type TEXT NOT NULL CHECK (identity_type IN ('company', 'endpoint', 'business')),
  identity_key TEXT NOT NULL CHECK (length(identity_key) BETWEEN 1 AND 80),
  company_id TEXT NOT NULL CHECK (length(company_id) BETWEEN 1 AND 80),
  endpoint_digest TEXT NOT NULL CHECK (
    length(endpoint_digest) = 64
    AND endpoint_digest NOT GLOB '*[^0-9a-f]*'
  ),
  state TEXT NOT NULL CHECK (state IN ('reserved', 'sent', 'ambiguous')),
  campaign_id TEXT NOT NULL CHECK (length(campaign_id) = 39),
  recipient_id TEXT NOT NULL CHECK (length(recipient_id) = 39),
  effect_id TEXT NOT NULL CHECK (length(effect_id) = 39),
  -- Present only for a fresh pre-provider reservation. These non-content
  -- markers let lease recovery compensate an account quota mutation exactly
  -- after a Worker crash without ever weakening an ambiguous/sent guard.
  reservation_quota_day TEXT CHECK (
    reservation_quota_day IS NULL OR length(reservation_quota_day) = 10
  ),
  reservation_next_dispatch_at TEXT CHECK (
    reservation_next_dispatch_at IS NULL
    OR length(reservation_next_dispatch_at) BETWEEN 20 AND 64
  ),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  PRIMARY KEY (org_id, identity_type, identity_key),
  CHECK (
    (identity_type = 'company' AND identity_key = company_id)
    OR (identity_type = 'endpoint' AND identity_key = endpoint_digest)
    OR (identity_type = 'business'
      AND length(identity_key) = 64
      AND identity_key NOT GLOB '*[^0-9a-f]*')
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_radar_tg_contact_history_state
  ON lead_radar_tg_contact_history (org_id, state, updated_at, identity_type, identity_key);

-- Backfill every identity independently. Two rows per historical provider
-- effect avoid the subtle gap where the same company changes endpoint or the
-- same endpoint is later attached to a different company. `INSERT OR IGNORE`
-- is deliberate: collisions preserve the earliest sent/uncertain guard, while
-- the second statement can still protect an otherwise-new endpoint identity.
INSERT OR IGNORE INTO lead_radar_tg_contact_history (
  org_id, identity_type, identity_key, company_id, endpoint_digest, state,
  campaign_id, recipient_id, effect_id, created_at, updated_at
)
SELECT recipient.org_id, 'company', recipient.company_id,
  recipient.company_id, recipient.endpoint_digest,
  CASE WHEN recipient.status = 'sent' OR effect.status = 'sent'
    THEN 'sent' ELSE 'ambiguous' END,
  recipient.campaign_id, recipient.id, effect.id,
  COALESCE(recipient.dispatching_at, recipient.claimed_at, recipient.created_at),
  recipient.updated_at
FROM lead_radar_tg_campaign_recipients recipient
JOIN lead_radar_tg_campaign_effects effect
  ON effect.org_id = recipient.org_id AND effect.recipient_id = recipient.id
WHERE recipient.status IN ('sent', 'ambiguous', 'dispatching')
  OR effect.status IN ('sent', 'ambiguous', 'dispatching')
ORDER BY CASE WHEN recipient.status = 'sent' OR effect.status = 'sent' THEN 0 ELSE 1 END,
  recipient.updated_at, recipient.id;

INSERT OR IGNORE INTO lead_radar_tg_contact_history (
  org_id, identity_type, identity_key, company_id, endpoint_digest, state,
  campaign_id, recipient_id, effect_id, created_at, updated_at
)
SELECT recipient.org_id, 'endpoint', recipient.endpoint_digest,
  recipient.company_id, recipient.endpoint_digest,
  CASE WHEN recipient.status = 'sent' OR effect.status = 'sent'
    THEN 'sent' ELSE 'ambiguous' END,
  recipient.campaign_id, recipient.id, effect.id,
  COALESCE(recipient.dispatching_at, recipient.claimed_at, recipient.created_at),
  recipient.updated_at
FROM lead_radar_tg_campaign_recipients recipient
JOIN lead_radar_tg_campaign_effects effect
  ON effect.org_id = recipient.org_id AND effect.recipient_id = recipient.id
WHERE recipient.status IN ('sent', 'ambiguous', 'dispatching')
  OR effect.status IN ('sent', 'ambiguous', 'dispatching')
ORDER BY CASE WHEN recipient.status = 'sent' OR effect.status = 'sent' THEN 0 ELSE 1 END,
  recipient.updated_at, recipient.id;

-- Stable, tenant-scoped identity for the data key used to derive endpoint
-- digests. A key rotation without an explicit history migration must fail
-- closed, otherwise an already-contacted endpoint would acquire a new digest
-- and bypass the permanent no-repeat guard. NULL is an intentional legacy
-- sentinel: historical campaign state existed when this migration ran, so an
-- operator must bind the verified current fingerprint before dispatch resumes.
CREATE TABLE IF NOT EXISTS lead_radar_tg_data_key_state (
  org_id TEXT PRIMARY KEY CHECK (length(org_id) BETWEEN 1 AND 80),
  key_fingerprint TEXT CHECK (
    key_fingerprint IS NULL OR (
      length(key_fingerprint) = 64
      AND key_fingerprint NOT GLOB '*[^0-9a-f]*'
    )
  ),
  established_at TEXT CHECK (
    established_at IS NULL OR length(established_at) BETWEEN 20 AND 64
  ),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  CHECK (
    (key_fingerprint IS NULL AND established_at IS NULL)
    OR (key_fingerprint IS NOT NULL AND established_at IS NOT NULL)
  )
);

-- SQL cannot prove which secret produced pre-migration keyed digests. Seed a
-- fail-closed legacy sentinel instead of silently trusting whichever key is
-- presented first after deployment.
INSERT OR IGNORE INTO lead_radar_tg_data_key_state (
  org_id, key_fingerprint, established_at, created_at, updated_at
)
SELECT legacy.org_id, NULL, NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (
  SELECT org_id FROM lead_radar_tg_user_accounts
  UNION SELECT org_id FROM lead_radar_tg_campaign_approvals
  UNION SELECT org_id FROM lead_radar_tg_campaigns
  UNION SELECT org_id FROM lead_radar_tg_contact_authorizations
  UNION SELECT org_id FROM lead_radar_tg_contact_history
) AS legacy;

-- The private gateway derives the tenant Durable Object route from a separate
-- stable routing key. Rotating it without an explicit account migration would
-- silently point status/send at an empty object while the real TDLib session
-- remains under the old route. Persist only a non-secret SHA-256 fingerprint;
-- existing routed accounts receive a NULL fail-closed legacy sentinel.
CREATE TABLE IF NOT EXISTS lead_radar_tg_routing_key_state (
  org_id TEXT PRIMARY KEY CHECK (length(org_id) BETWEEN 1 AND 80),
  key_fingerprint TEXT CHECK (
    key_fingerprint IS NULL OR (
      length(key_fingerprint) = 64
      AND key_fingerprint NOT GLOB '*[^0-9a-f]*'
    )
  ),
  established_at TEXT CHECK (
    established_at IS NULL OR length(established_at) BETWEEN 20 AND 64
  ),
  created_at TEXT NOT NULL CHECK (length(created_at) BETWEEN 20 AND 64),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64),
  CHECK (
    (key_fingerprint IS NULL AND established_at IS NULL)
    OR (key_fingerprint IS NOT NULL AND established_at IS NOT NULL)
  )
);

INSERT OR IGNORE INTO lead_radar_tg_routing_key_state (
  org_id, key_fingerprint, established_at, created_at, updated_at
)
SELECT account.org_id, NULL, NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM lead_radar_tg_user_accounts account
WHERE account.gateway_account_ref IS NOT NULL
GROUP BY account.org_id;

-- Opaque R2 pagination cursor only. This makes the orphan sweep bounded and
-- fair across runs without persisting filenames, bytes, URLs or other content.
CREATE TABLE IF NOT EXISTS lead_radar_tg_media_sweep_state (
  org_id TEXT PRIMARY KEY CHECK (length(org_id) BETWEEN 1 AND 80),
  cursor TEXT CHECK (cursor IS NULL OR length(cursor) BETWEEN 1 AND 2048),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64)
);

-- One global opaque cursor makes privacy/safety maintenance independent from
-- the current autosend allowlist. Only one persisted tenant is processed per
-- tick, so offboarding cannot strand ciphertext or leases and cannot create an
-- unbounded cron invocation.
CREATE TABLE IF NOT EXISTS lead_radar_tg_maintenance_state (
  scope TEXT PRIMARY KEY CHECK (scope = 'campaign_tenants'),
  cursor TEXT CHECK (cursor IS NULL OR length(cursor) BETWEEN 1 AND 80),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 64)
);
