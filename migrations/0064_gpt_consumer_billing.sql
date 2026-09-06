-- Additive consumer billing. Runtime parity is tested.
-- Rollback: disable GPT_BILLING_LIVE_READY to stop NEW checkout; keep callbacks
-- online to reconcile existing orders. Restore the prior application only after
-- pending transactions settle. Preserve these financial tables; do not DROP them.
-- Test and live rows are isolated by mode. Back up D1 before applying in production.
CREATE TABLE IF NOT EXISTS gpt_payment_consents (org_id TEXT NOT NULL, order_id TEXT NOT NULL, user_id TEXT NOT NULL, version TEXT NOT NULL, url TEXT NOT NULL, locale TEXT NOT NULL, accepted_at INTEGER NOT NULL, PRIMARY KEY(org_id,order_id));
CREATE TABLE IF NOT EXISTS gpt_accounts (org_id TEXT NOT NULL, id TEXT NOT NULL, identity_hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, PRIMARY KEY(org_id,id), UNIQUE(org_id,identity_hash));

CREATE TABLE IF NOT EXISTS gpt_auth_sessions (org_id TEXT NOT NULL, token_hash TEXT NOT NULL, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(org_id,token_hash));

CREATE TABLE IF NOT EXISTS gpt_auth_challenges (org_id TEXT NOT NULL, state_hash TEXT NOT NULL, verifier TEXT NOT NULL, locale TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(org_id,state_hash));

CREATE TABLE IF NOT EXISTS gpt_payment_orders (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL, id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL, provider TEXT NOT NULL CHECK(provider IN ('click','payme')),
    mode TEXT NOT NULL CHECK(mode IN ('test','live')), request_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount=2000000), currency TEXT NOT NULL CHECK(currency='UZS'),
    state TEXT NOT NULL CHECK(state IN ('pending','prepared','paid','cancelled','refunded')),
    external_id TEXT, provider_time INTEGER, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    create_time INTEGER NOT NULL DEFAULT 0, perform_time INTEGER NOT NULL DEFAULT 0,
    cancel_time INTEGER NOT NULL DEFAULT 0, reason INTEGER, version INTEGER NOT NULL DEFAULT 0,
    UNIQUE(org_id,user_id,request_id), UNIQUE(org_id,provider,mode,external_id));

CREATE TABLE IF NOT EXISTS gpt_payment_journal (org_id TEXT NOT NULL, id TEXT PRIMARY KEY, order_id TEXT NOT NULL, actor TEXT NOT NULL, method TEXT NOT NULL, from_state TEXT, to_state TEXT NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS gpt_access_periods (org_id TEXT NOT NULL, order_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, mode TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, message_limit INTEGER NOT NULL, revoked_at INTEGER, refund_requested_at INTEGER);

CREATE TABLE IF NOT EXISTS gpt_billing_outbox (org_id TEXT NOT NULL, id TEXT PRIMARY KEY, order_id TEXT NOT NULL, event TEXT NOT NULL, created_at INTEGER NOT NULL, available_at INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0, lease_token TEXT, attempts INTEGER NOT NULL DEFAULT 0, delivered_at INTEGER);

CREATE TABLE IF NOT EXISTS gpt_turn_reservations (org_id TEXT NOT NULL, id TEXT NOT NULL, subject TEXT NOT NULL, ip_hash TEXT NOT NULL, period_id TEXT, status TEXT NOT NULL CHECK(status IN ('reserved','done','released')), created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(org_id,id));

CREATE TABLE IF NOT EXISTS gpt_model_health (org_id TEXT NOT NULL, model TEXT NOT NULL, blocked_until INTEGER NOT NULL, code TEXT NOT NULL, PRIMARY KEY(org_id,model));

CREATE TABLE IF NOT EXISTS gpt_model_attempts (org_id TEXT NOT NULL, id TEXT PRIMARY KEY, period_id TEXT NOT NULL, created_at INTEGER NOT NULL);

CREATE INDEX IF NOT EXISTS idx_gpt_model_attempt_period ON gpt_model_attempts(org_id,period_id);

CREATE TABLE IF NOT EXISTS gpt_service_alerts (org_id TEXT NOT NULL, id TEXT PRIMARY KEY, code TEXT NOT NULL, created_at INTEGER NOT NULL, delivered_at INTEGER, lease_until INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS gpt_fiscal_receipts (org_id TEXT NOT NULL, order_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('PERFORM','CANCEL')), receipt_url TEXT, status_code INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(org_id,order_id,kind));

CREATE TABLE IF NOT EXISTS gpt_billing_ops (org_id TEXT NOT NULL, task TEXT NOT NULL, next_at INTEGER NOT NULL, PRIMARY KEY(org_id,task));

CREATE INDEX IF NOT EXISTS idx_gpt_auth_expiry ON gpt_auth_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_gpt_orders_user ON gpt_payment_orders(org_id,user_id,created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gpt_orders_pending ON gpt_payment_orders(org_id,user_id,provider,mode) WHERE state IN ('pending','prepared');

CREATE INDEX IF NOT EXISTS idx_gpt_orders_statement ON gpt_payment_orders(org_id,provider,mode,provider_time);

CREATE INDEX IF NOT EXISTS idx_gpt_periods_user ON gpt_access_periods(org_id,user_id,mode,ends_at);

CREATE INDEX IF NOT EXISTS idx_gpt_turn_subject ON gpt_turn_reservations(org_id,subject,created_at);

CREATE INDEX IF NOT EXISTS idx_gpt_turn_period ON gpt_turn_reservations(org_id,period_id,status);

CREATE INDEX IF NOT EXISTS idx_gpt_turn_ip ON gpt_turn_reservations(org_id,ip_hash,created_at);

CREATE INDEX IF NOT EXISTS idx_gpt_billing_delivery ON gpt_billing_outbox(org_id,delivered_at,available_at);
