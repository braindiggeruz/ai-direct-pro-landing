-- P2.3 Sotuvchi Buyer Q&A: minimal, content-free follow-up state.
-- Apply after 0019_sotuvchi_catalog.sql. Do not apply from application code.
--
-- Rollback: deploy code that ignores these nullable columns first. SQLite
-- column removal requires a table rebuild, so leaving the nullable columns in
-- place is the safe operational rollback. No raw buyer messages are stored.

ALTER TABLE sotuvchi_storefront_sessions
  ADD COLUMN last_product_id TEXT;

ALTER TABLE sotuvchi_storefront_sessions
  ADD COLUMN last_intent TEXT;

ALTER TABLE sotuvchi_storefront_sessions
  ADD COLUMN selection_request_key TEXT;

ALTER TABLE sotuvchi_storefront_sessions
  ADD COLUMN selected_at TEXT;
