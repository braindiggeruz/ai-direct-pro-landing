-- Uzum Bank payments on the consumer billing ledger of 0064. Additive only.
-- Runtime parity is tested: UZUM_BILLING_DDL in functions/lib/gpt-chat/billing-schema.ts.
-- Sources (public, fetched 2026-09-30): https://developer.uzumbank.uz/en/ ;
-- Uzum Checkout 1.10.3 and Merchant API 1.0.0 (copies in docs/paid-chat/uzum-spec/).
-- Why a sibling table: gpt_payment_orders has CHECK(provider IN ('click','payme')).
-- SQLite cannot alter a CHECK and rebuilding a financial table is not additive, so
-- gpt_uzum_orders repeats its columns and constraints (provider='uzum') and adds the
-- Uzum-only columns. The view gpt_payment_orders_all is the cross-provider read path.
-- Order: apply this migration BEFORE deploying the code that reads the view.
-- Rollback: GPT_BILLING_LIVE_READY=false stops new checkout for every provider while
-- the Uzum callback endpoints stay online. Unsetting UZUM_API or UZUM_CREDENTIALS_JSON
-- stops Uzum entirely (endpoints answer 404), so do that only after pending Uzum orders
-- settle. Never DROP gpt_uzum_orders (financial records). DROP VIEW gpt_payment_orders_all
-- is safe only together with a rollback to the pre-0065 application. Back up D1 first.
CREATE TABLE IF NOT EXISTS gpt_uzum_orders (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL, id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL, provider TEXT NOT NULL CHECK(provider='uzum'),
    mode TEXT NOT NULL CHECK(mode IN ('test','live')), request_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount=2000000), currency TEXT NOT NULL CHECK(currency='UZS'),
    state TEXT NOT NULL CHECK(state IN ('pending','prepared','paid','cancelled','refunded')),
    external_id TEXT, provider_time INTEGER, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    create_time INTEGER NOT NULL DEFAULT 0, perform_time INTEGER NOT NULL DEFAULT 0,
    cancel_time INTEGER NOT NULL DEFAULT 0, reason INTEGER, version INTEGER NOT NULL DEFAULT 0,
    api TEXT NOT NULL DEFAULT 'checkout' CHECK(api IN ('checkout','merchant')),
    redirect_url TEXT, refund_operation_id TEXT, refund_requested_at INTEGER,
    UNIQUE(org_id,user_id,request_id), UNIQUE(org_id,provider,mode,external_id));

CREATE INDEX IF NOT EXISTS idx_gpt_uzum_orders_user ON gpt_uzum_orders(org_id,user_id,created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gpt_uzum_orders_pending ON gpt_uzum_orders(org_id,user_id,provider,mode) WHERE state IN ('pending','prepared');

CREATE INDEX IF NOT EXISTS idx_gpt_uzum_orders_statement ON gpt_uzum_orders(org_id,provider,mode,provider_time);

CREATE VIEW IF NOT EXISTS gpt_payment_orders_all AS
    SELECT seq,org_id,id,user_id,provider,mode,request_id,amount,currency,state,external_id,provider_time,created_at,expires_at,create_time,perform_time,cancel_time,reason,version FROM gpt_payment_orders
    UNION ALL
    SELECT seq,org_id,id,user_id,provider,mode,request_id,amount,currency,state,external_id,provider_time,created_at,expires_at,create_time,perform_time,cancel_time,reason,version FROM gpt_uzum_orders;
