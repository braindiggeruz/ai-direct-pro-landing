-- R1.1 buyer experience state.
-- Additive only: existing sessions keep the store locale and no pending intent.

ALTER TABLE sotuvchi_storefront_sessions
  ADD COLUMN preferred_locale TEXT
    CHECK (preferred_locale IS NULL OR preferred_locale IN ('ru', 'uz'));

ALTER TABLE sotuvchi_storefront_sessions
  ADD COLUMN pending_intent TEXT
    CHECK (pending_intent IS NULL OR pending_intent = 'budget');

ALTER TABLE sotuvchi_storefront_sessions
  ADD COLUMN pending_request_key TEXT;

ALTER TABLE sotuvchi_storefront_sessions
  ADD COLUMN pending_at TEXT;

CREATE INDEX IF NOT EXISTS idx_sotuvchi_storefront_pending
  ON sotuvchi_storefront_sessions
    (bot_username, identity_id, pending_intent, status);
