-- Studio operations and Payme ownership.
CREATE TABLE IF NOT EXISTS studio_verifications (org_id TEXT NOT NULL,id TEXT NOT NULL,address TEXT NOT NULL,token_hash TEXT NOT NULL,lease_until INTEGER NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(org_id,id),UNIQUE(org_id,token_hash));

CREATE INDEX IF NOT EXISTS idx_studio_verification_active ON studio_verifications(org_id,lease_until,address);

CREATE INDEX IF NOT EXISTS idx_studio_verification_expiry ON studio_verifications(org_id,expires_at);

CREATE TABLE IF NOT EXISTS studio_refund_requests (org_id TEXT NOT NULL,order_id TEXT NOT NULL,presentations_unused INTEGER NOT NULL,photos_unused INTEGER NOT NULL,requested_at INTEGER NOT NULL,PRIMARY KEY(org_id,order_id));

CREATE TABLE IF NOT EXISTS studio_credit_grants (org_id TEXT NOT NULL,order_id TEXT NOT NULL,request_id TEXT NOT NULL,entitlement_id TEXT NOT NULL,unit TEXT NOT NULL CHECK(unit IN ('presentation_full','photo_task')),reason TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(org_id,order_id,request_id),UNIQUE(org_id,entitlement_id));

CREATE TABLE IF NOT EXISTS studio_extensions (org_id TEXT NOT NULL,entitlement_id TEXT NOT NULL,from_at INTEGER NOT NULL,to_at INTEGER NOT NULL,delta_ms INTEGER NOT NULL,applied_at INTEGER NOT NULL,PRIMARY KEY(org_id,entitlement_id,from_at,to_at));

CREATE INDEX IF NOT EXISTS idx_studio_extensions_window ON studio_extensions(org_id,from_at,to_at,entitlement_id);

CREATE INDEX IF NOT EXISTS idx_studio_extensions_pending ON studio_extensions(org_id,from_at,to_at,applied_at,entitlement_id);

CREATE TABLE IF NOT EXISTS studio_extension_windows (org_id TEXT NOT NULL,from_at INTEGER NOT NULL,to_at INTEGER NOT NULL,cursor TEXT NOT NULL DEFAULT '',done INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(org_id,from_at,to_at));

CREATE TABLE IF NOT EXISTS studio_reversal_attempts (org_id TEXT NOT NULL,order_id TEXT NOT NULL,request_id TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','confirmed','unknown','failed')),payment_id TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(org_id,order_id),UNIQUE(org_id,request_id));

CREATE INDEX IF NOT EXISTS idx_studio_ledger_terminal_gc ON studio_unit_ledger(org_id,created_at) WHERE state IN ('done','released','refused');

CREATE INDEX IF NOT EXISTS idx_studio_ent_extension ON studio_entitlements(org_id,mode,ends_at,id);

CREATE INDEX IF NOT EXISTS idx_studio_ent_cursor ON studio_entitlements(org_id,mode,id);

CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_budget_report ON studio_orders_v2(org_id,owner_test,created_at,id);

CREATE TRIGGER IF NOT EXISTS studio_payme_chat_owner BEFORE UPDATE OF external_id ON gpt_payment_orders WHEN NEW.provider='payme' AND NEW.external_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'payme_transaction_owned') WHERE EXISTS(SELECT 1 FROM studio_orders_v2 WHERE org_id=NEW.org_id AND provider='payme' AND mode=NEW.mode AND external_id=NEW.external_id); END;

CREATE TRIGGER IF NOT EXISTS studio_payme_studio_owner BEFORE UPDATE OF external_id ON studio_orders_v2 WHEN NEW.provider='payme' AND NEW.external_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'payme_transaction_owned') WHERE EXISTS(SELECT 1 FROM gpt_payment_orders WHERE org_id=NEW.org_id AND provider='payme' AND mode=NEW.mode AND external_id=NEW.external_id); END;
