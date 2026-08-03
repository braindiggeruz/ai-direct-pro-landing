-- Single-use challenges for the owner-assisted Telegram seller binding.
--
-- Why a table and not a signed token
-- ----------------------------------
-- A stateless signed token can prove "the owner authorised a binding for this
-- organization before this time". It cannot prove the token has not been used,
-- and that is the property that matters here: the danger is not a forged
-- challenge, it is a real one that leaked — from a screenshot, a forwarded
-- message, a shoulder — and is redeemed by somebody else's Telegram account.
-- Single-use needs somewhere to record the use, so it needs a row.
--
-- What is stored
-- --------------
-- Only a hash. The raw challenge is shown to the owner once, at creation, and
-- never written down by us — so a reader of this table cannot redeem anything.
-- `redeemed_at` is the consumption mark; a row is never deleted on redemption,
-- because when a binding is questioned later the question is "was this
-- challenge used, when, and did it succeed", and a deleted row cannot answer.
--
-- No PII: no Telegram id, no username, no email. The identity that redeemed is
-- recoverable through the audit event and the membership row, both of which
-- already carry the appropriate scoping.

CREATE TABLE IF NOT EXISTS seller_identity_binding_challenges (
  -- SHA-256 of the raw challenge, hex. The primary key, so a duplicate
  -- insertion of the same secret is impossible rather than merely unlikely.
  challenge_hash  TEXT PRIMARY KEY CHECK (length(challenge_hash) = 64),
  org_id          TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 120)
    REFERENCES organizations(id) ON DELETE RESTRICT,
  store_id        TEXT NOT NULL CHECK (length(store_id) BETWEEN 1 AND 120)
    REFERENCES sotuvchi_stores(id) ON DELETE RESTRICT,
  -- Scope. A challenge authorises one action against one organization and
  -- nothing else, so a leaked one cannot be spent on a different door.
  action          TEXT NOT NULL CHECK (action IN ('seller.bind')),
  -- Who minted it, for the audit trail. An owner email, never a seller's.
  created_by      TEXT NOT NULL CHECK (length(created_by) BETWEEN 1 AND 200),
  created_at      TEXT NOT NULL CHECK (length(created_at) BETWEEN 1 AND 64),
  expires_at      TEXT NOT NULL CHECK (length(expires_at) BETWEEN 1 AND 64),
  -- NULL until spent. Set in the same transaction as the membership insert, so
  -- a challenge is consumed if and only if the binding actually happened.
  redeemed_at     TEXT CHECK (redeemed_at IS NULL OR length(redeemed_at) BETWEEN 1 AND 64)
);

-- Finds the live challenge for an organization, which is how "at most one
-- outstanding challenge" is enforced on creation.
CREATE INDEX IF NOT EXISTS idx_seller_binding_challenge_open
  ON seller_identity_binding_challenges (org_id, redeemed_at, expires_at);

-- Rollback
-- --------
-- `DROP TABLE seller_identity_binding_challenges;`
--
-- Safe at any time: nothing references this table, and it holds no business
-- data — only spent and expired challenge hashes. Dropping it does not undo a
-- binding. The binding is reversed by disabling the membership, which is a
-- separate, audited action.
