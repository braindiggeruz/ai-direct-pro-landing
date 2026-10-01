-- The paid AI chat, release R4 (paid-chat plan WP-14..WP-17). Additive only.
-- WP-14, Click fiscal receipts: gpt_fiscal_receipts becomes a retry queue.
-- A paid Click order gets one PERFORM row (status_code -1 = queued, 0 =
-- printed, -2 = skipped: a test order, or one refunded before its receipt);
-- functions/lib/gpt-chat/fiscal-store.ts leases due rows and prints them
-- through the Click Merchant API (ofd_data). Payme and Uzum rows written
-- before this migration keep provider NULL and are never queued.
-- Runtime parity is tested (tests/gpt-paid-chat-schema.test.ts):
-- FISCAL_RECEIPT_COLUMNS and PAID_CHAT_DDL in functions/lib/gpt-chat/billing-schema.ts.
-- No text and no card data: payment_id is Click's numeric payment id,
-- last_error a coarse code such as submit:click_-5 or qr_pending.
-- Order: apply this migration BEFORE deploying the code, previews included (the
-- preview shares the production D1). The runtime bootstrap adds the same columns
-- when they are missing; once it has run, the ALTERs below fail with
-- "duplicate column name" and the migration cannot be recorded. If that happens,
-- apply only the CREATE statements below by hand and record the file in
-- d1_migrations; do not drop anything.
-- Rollback: roll the application back; the columns and the index stay. The
-- previous code neither reads nor writes them. Financial rows are never dropped.
ALTER TABLE gpt_fiscal_receipts ADD COLUMN provider TEXT;
ALTER TABLE gpt_fiscal_receipts ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gpt_fiscal_receipts ADD COLUMN next_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gpt_fiscal_receipts ADD COLUMN lease_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gpt_fiscal_receipts ADD COLUMN payment_id TEXT;
ALTER TABLE gpt_fiscal_receipts ADD COLUMN last_error TEXT;
ALTER TABLE gpt_fiscal_receipts ADD COLUMN submitted_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_gpt_fiscal_due ON gpt_fiscal_receipts(org_id,provider,status_code,next_at);
