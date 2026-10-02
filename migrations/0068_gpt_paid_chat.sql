-- The paid AI chat, release R4 (paid-chat plan WP-14..WP-17). Additive only.
-- WP-14, Click fiscal receipts: gpt_fiscal_receipts becomes a retry queue.
-- A paid Click order gets one PERFORM row (status_code -1 = queued, 0 =
-- printed, -2 = skipped: a test order, or one refunded before its receipt);
-- functions/lib/gpt-chat/fiscal-store.ts leases due rows and prints them
-- through the Click Merchant API (ofd_data). Payme and Uzum rows written
-- before this migration keep provider NULL and are never queued.
-- WP-15, Uzum: the same queue prints the receipts of the Uzum orders whose
-- registration carried no auto-fiscalization cart (Merchant API, or Checkout
-- without auto-fiscalization) through the Uzum Fiscalization API: a PERFORM
-- row when paid, a CANCEL row when the money goes back. operation_id is that
-- receipt's idempotency key, written before the receipt is sent.
-- gpt_uzum_orders gains confirm_requested_at (a Merchant API /confirm
-- arrived) and autofiscal (1 = Uzum prints this order's receipts itself).
-- gpt_payment_codes holds the permanent 9-digit code (Luhn check digit) an
-- account enters in the Uzum Bank app, with the terms version its owner
-- accepted on the site; no phone, name or Telegram data.
-- Runtime parity is tested (tests/gpt-paid-chat-schema.test.ts):
-- FISCAL_RECEIPT_COLUMNS and PAID_CHAT_DDL (ensureBillingSchema), and
-- UZUM_ORDER_COLUMNS and UZUM_PAID_CHAT_DDL (ensureUzumSchema) in
-- functions/lib/gpt-chat/billing-schema.ts.
-- No text and no card data: payment_id is Click's numeric payment id or the
-- Uzum payment uuid, last_error a coarse code such as submit:click_-5 or
-- qr_pending.
-- Order: apply this migration BEFORE deploying the code, previews included (the
-- preview shares the production D1). The runtime bootstrap adds the same columns
-- when they are missing; once it has run, the ALTERs below fail with
-- "duplicate column name" and the migration cannot be recorded. If that happens,
-- apply only the CREATE statements below by hand and record the file in
-- d1_migrations; do not drop anything.
-- Rollback: roll the application back; the columns, the table and the indexes
-- stay. The previous code neither reads nor writes them. Financial rows are
-- never dropped.
ALTER TABLE gpt_fiscal_receipts ADD COLUMN provider TEXT;
ALTER TABLE gpt_fiscal_receipts ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gpt_fiscal_receipts ADD COLUMN next_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gpt_fiscal_receipts ADD COLUMN lease_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gpt_fiscal_receipts ADD COLUMN payment_id TEXT;
ALTER TABLE gpt_fiscal_receipts ADD COLUMN last_error TEXT;
ALTER TABLE gpt_fiscal_receipts ADD COLUMN submitted_at INTEGER;
ALTER TABLE gpt_fiscal_receipts ADD COLUMN operation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_gpt_fiscal_due ON gpt_fiscal_receipts(org_id,provider,status_code,next_at);

ALTER TABLE gpt_uzum_orders ADD COLUMN confirm_requested_at INTEGER;
ALTER TABLE gpt_uzum_orders ADD COLUMN autofiscal INTEGER;

CREATE TABLE IF NOT EXISTS gpt_payment_codes (org_id TEXT NOT NULL, code TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, terms_version TEXT, terms_url TEXT, terms_locale TEXT, terms_accepted_at INTEGER, PRIMARY KEY(org_id,code), UNIQUE(org_id,user_id));

CREATE INDEX IF NOT EXISTS idx_gpt_uzum_orders_state ON gpt_uzum_orders(org_id,api,state);
