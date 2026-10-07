-- Studio payments (the paid studio, DECISIONS 07.10.2026 §12): the orders
-- of the tariffs Kunlik and Oylik, paid through Payme (the chat's cash desk
-- and its one endpoint /api/payments/payme, account field order_id) or
-- through Click (the studio's own service, variant B), and the record of
-- every refund. Additive only.
-- Why a second order table: studio_orders (0073) takes provider 'click'
-- only (its CHECK), and a migration never alters a table. studio_orders
-- stays as it is, empty: the code neither reads nor writes it
-- (tests/studio-d1-budget.test.ts) and it is never dropped.
-- studio_orders_v2 is studio_orders with: provider 'payme' or 'click';
-- service_id (Click's service, NULL for Payme) instead of click_service_id
-- NOT NULL; Payme's create_time; event_id, the journal id of the order's
-- last transition (the guard every batch of functions/lib/studio/store.ts
-- checks); the statement index Payme's GetStatement reads; one open order
-- per buyer and mode, whatever the provider.
-- studio_refunds: one row per refunded order (a second refund of an order
-- is refused), the amount in tiyin, how the money went back, the
-- provider's or the transfer's reference (never a card number), the units
-- unused when the buyer asked, and who prints the refund receipt:
-- 'provider' (Payme or Click print it themselves), 'due' (a transfer: the
-- receipt is ours to print, the owner is alerted), 'printed'.
-- Reused unchanged: studio_entitlements (id = studio_orders_v2.id, or
-- 'stu_…_c<n>' for a returned unit), gpt_payment_journal,
-- gpt_payment_consents, gpt_fiscal_receipts (order_id 'stu_…', provider
-- 'payme' or 'click'), gpt_auth_sessions / gpt_accounts (the studio account).
-- No name, phone, e-mail, card or IP: attribution keeps sanitized ids and
-- tags only, cleared after 93 days (attrib_purged_at).
-- Runtime parity: STUDIO_PAYMENTS_DDL in functions/lib/studio/schema.ts
-- (ensureStudioPaymentsSchema), tested in tests/studio-schema.test.ts.
-- Number: 0075, after 0073 (the studio, applied by the launch R-ST1) and
-- 0074 (Payme's receipts); independent of both.
-- Order: apply BEFORE deploying the code, previews included.
-- Rollback: roll the application back; tables stay; financial rows are never dropped. No DROP.

CREATE TABLE IF NOT EXISTS studio_orders_v2 (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,   -- Click merchant_prepare_id
  org_id TEXT NOT NULL,
  id TEXT NOT NULL UNIQUE,                 -- 'stu_' + 32 hex: Payme account.order_id, Click merchant_trans_id
  user_id TEXT NOT NULL,                   -- gpt_accounts.id, 'acct_studio_…'
  plan TEXT NOT NULL CHECK(plan IN ('kunlik','oylik')),
  plan_version TEXT NOT NULL,              -- quotas of this edition (plans.ts)
  terms_version TEXT NOT NULL,             -- the offer edition accepted
  provider TEXT NOT NULL CHECK(provider IN ('payme','click')),
  service_id TEXT,                         -- Click: the service that takes it; Payme: NULL (one cash desk)
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  request_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0 AND amount <= 100000000),  -- tiyin; the plan's price is enforced in code
  currency TEXT NOT NULL CHECK(currency='UZS'),
  state TEXT NOT NULL CHECK(state IN ('pending','prepared','paid','cancelled','refunded')),
  external_id TEXT,                        -- Payme transaction id, or click_trans_id
  provider_doc_id TEXT,                    -- Payme receipt id, or click_paydoc_id (the number the buyer sees)
  provider_time INTEGER,                   -- Payme's transaction time (GetStatement), or Click's Prepare
  create_time INTEGER NOT NULL DEFAULT 0,  -- when the provider's transaction was created here (Payme create_time)
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  perform_time INTEGER NOT NULL DEFAULT 0, cancel_time INTEGER NOT NULL DEFAULT 0,
  reason INTEGER, version INTEGER NOT NULL DEFAULT 0,
  event_id TEXT,                           -- gpt_payment_journal.id of the last transition
  owner_test INTEGER NOT NULL DEFAULT 0 CHECK(owner_test IN (0,1)),  -- the owner's own purchase: out of reports and GA4
  restored_at INTEGER,                     -- last support restore (at most one per 7 days)
  -- Attribution: sanitized ids and tags only, never a name, phone or e-mail.
  -- Cleared after 93 days (attrib_purged_at).
  touch TEXT CHECK(touch IN ('last','first') OR touch IS NULL),
  gclid TEXT, gbraid TEXT, wbraid TEXT, yclid TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT,
  landing_path TEXT,                       -- path only, never a query string
  referrer_host TEXT, first_seen_at TEXT,
  ga_client_id TEXT, ga_session_id TEXT, ym_client_id TEXT,
  attrib_purged_at INTEGER,
  -- Server-side GA4 purchase / refund outbox (the sender ships later; STUDIO_GA4_MP is off).
  ga4_state TEXT NOT NULL DEFAULT 'none' CHECK(ga4_state IN ('none','pending','sent','failed','skipped')),
  ga4_attempts INTEGER NOT NULL DEFAULT 0, ga4_next_at INTEGER NOT NULL DEFAULT 0, ga4_sent_at INTEGER,
  ga4_refund_state TEXT NOT NULL DEFAULT 'none' CHECK(ga4_refund_state IN ('none','pending','sent','failed','skipped')),
  UNIQUE(org_id,user_id,request_id),
  UNIQUE(org_id,provider,mode,external_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_orders_v2_open ON studio_orders_v2(org_id,user_id,mode) WHERE state IN ('pending','prepared');
CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_user ON studio_orders_v2(org_id,user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_statement ON studio_orders_v2(org_id,provider,mode,provider_time);
CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_report ON studio_orders_v2(org_id,mode,state,perform_time);
CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_due ON studio_orders_v2(org_id,state,expires_at);
CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_ga4 ON studio_orders_v2(org_id,ga4_state,ga4_next_at);
CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_doc ON studio_orders_v2(org_id,provider_doc_id);
CREATE INDEX IF NOT EXISTS idx_studio_orders_v2_attrib ON studio_orders_v2(org_id,attrib_purged_at,created_at);

CREATE TABLE IF NOT EXISTS studio_refunds (
  org_id TEXT NOT NULL,
  id TEXT NOT NULL,                        -- 'sr_' + 32 hex
  order_id TEXT NOT NULL,                  -- studio_orders_v2.id; one refund per order
  amount INTEGER NOT NULL CHECK(amount > 0 AND amount <= 100000000),  -- tiyin; never more than the order (code)
  method TEXT NOT NULL CHECK(method IN ('payme_cancel','click_reversal','click_cabinet','transfer')),
  reference TEXT,                          -- the provider's cancel or the transfer's reference; never a card number
  presentations_unused INTEGER NOT NULL DEFAULT 0 CHECK(presentations_unused >= 0),
  photos_unused INTEGER NOT NULL DEFAULT 0 CHECK(photos_unused >= 0),
  receipt_state TEXT NOT NULL CHECK(receipt_state IN ('provider','due','printed')),
  requested_at INTEGER NOT NULL,           -- when the buyer asked (the 14-day window)
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY(org_id,id),
  UNIQUE(org_id,order_id)
);
CREATE INDEX IF NOT EXISTS idx_studio_refunds_receipt ON studio_refunds(org_id,receipt_state,created_at);
CREATE INDEX IF NOT EXISTS idx_studio_refunds_created ON studio_refunds(org_id,created_at);
