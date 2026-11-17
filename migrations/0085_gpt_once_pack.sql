-- The 3-day AI pack (5 000 UZS, 30 answers, 72 hours; owner's order of
-- 17.11.2026; functions/lib/gpt-chat/packs.ts).
-- Additive only. gpt_payment_orders accepts one sum (its CHECK is fixed at
-- 2 000 000 tiyin and SQLite cannot relax a CHECK), so the new pack's orders
-- live in a sibling table, gpt_payment_orders_v2, with the same ledger columns,
-- the Click payment number of 0071 and the pack's sku. Its CHECKs pin the sum
-- of the 3-day pack and the pk_ id prefix the code routes by; another sku may
-- be added later without a third table (1..100 000 000 tiyin).
-- gpt_payment_orders_all2 is the read path across the three order tables. The
-- 0065 view gpt_payment_orders_all is left as it is: the code of the previous
-- release reads it, and after a rollback it still answers.
-- Journal, consents, access periods, outbox and receipts are keyed by the
-- order id and are shared, as they are with Uzum.
-- No personal data: the same columns as gpt_payment_orders.
-- Runtime parity: ONCE_BILLING_DDL in functions/lib/gpt-chat/billing-schema.ts
-- (ensureBillingSchema), tested in tests/gpt-once-pack.test.ts.
-- Order: apply this migration BEFORE deploying the code, previews included (a
-- preview shares the production D1). Every statement is IF NOT EXISTS, so the
-- runtime bootstrap running first does not stop it from being recorded.
-- Rollback: roll the application back; the table and the view stay. The
-- previous code neither reads nor writes them. A pack already paid keeps
-- working: turns read gpt_access_periods, not the order tables. Financial rows
-- are never dropped.
CREATE TABLE IF NOT EXISTS gpt_payment_orders_v2 (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL, id TEXT NOT NULL UNIQUE CHECK(substr(id,1,3)='pk_'),
  user_id TEXT NOT NULL, provider TEXT NOT NULL CHECK(provider IN ('click','payme')),
  mode TEXT NOT NULL CHECK(mode IN ('test','live')), request_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK((sku='once' AND amount=500000) OR (sku<>'once' AND amount>0 AND amount<=100000000)),
  currency TEXT NOT NULL CHECK(currency='UZS'),
  state TEXT NOT NULL CHECK(state IN ('pending','prepared','paid','cancelled','refunded')),
  external_id TEXT, provider_time INTEGER, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  create_time INTEGER NOT NULL DEFAULT 0, perform_time INTEGER NOT NULL DEFAULT 0,
  cancel_time INTEGER NOT NULL DEFAULT 0, reason INTEGER, version INTEGER NOT NULL DEFAULT 0,
  provider_doc_id TEXT,
  UNIQUE(org_id,user_id,request_id), UNIQUE(org_id,provider,mode,external_id));
CREATE INDEX IF NOT EXISTS idx_gpt_orders_v2_user ON gpt_payment_orders_v2(org_id,user_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gpt_orders_v2_pending ON gpt_payment_orders_v2(org_id,user_id,provider,mode) WHERE state IN ('pending','prepared');
CREATE INDEX IF NOT EXISTS idx_gpt_orders_v2_statement ON gpt_payment_orders_v2(org_id,provider,mode,provider_time);
CREATE VIEW IF NOT EXISTS gpt_payment_orders_all2 AS
  SELECT seq,org_id,id,user_id,provider,mode,request_id,amount,currency,state,external_id,provider_time,created_at,expires_at,create_time,perform_time,cancel_time,reason,version FROM gpt_payment_orders
  UNION ALL
  SELECT seq,org_id,id,user_id,provider,mode,request_id,amount,currency,state,external_id,provider_time,created_at,expires_at,create_time,perform_time,cancel_time,reason,version FROM gpt_uzum_orders
  UNION ALL
  SELECT seq,org_id,id,user_id,provider,mode,request_id,amount,currency,state,external_id,provider_time,created_at,expires_at,create_time,perform_time,cancel_time,reason,version FROM gpt_payment_orders_v2;
