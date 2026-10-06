-- Studio (apps/studio): orders of several tariffs, entitlements, a ledger of
-- generations and the free daily units. Additive only: gpt_payment_orders and
-- gpt_uzum_orders keep CHECK(amount=2000000) and are never touched.
-- Reused unchanged: gpt_payment_journal, gpt_payment_consents,
-- gpt_fiscal_receipts (order_id 'stu_…', provider 'click'), gpt_model_spend
-- (buckets 'studio_free', 'studio_paid'), gpt_rate_limits, gpt_ui_events.
-- Runtime parity: STUDIO_DDL in functions/lib/studio/schema.ts.
-- Order: apply BEFORE deploying the code, previews included.
-- Rollback: roll the application back; tables stay; financial rows are never dropped.

CREATE TABLE IF NOT EXISTS studio_orders (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,   -- Click merchant_prepare_id
  org_id TEXT NOT NULL,
  id TEXT NOT NULL UNIQUE,                 -- 'stu_' + 32 hex, Click merchant_trans_id
  user_id TEXT NOT NULL,                   -- gpt_accounts.id, 'acct_studio_…'
  plan TEXT NOT NULL CHECK(plan IN ('kunlik','oylik')),
  plan_version TEXT NOT NULL,              -- quotas of this edition (plans.ts)
  terms_version TEXT NOT NULL,             -- the offer edition accepted
  provider TEXT NOT NULL CHECK(provider IN ('click')),
  click_service_id TEXT NOT NULL,          -- which Click service takes it (variant A or B)
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  request_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0 AND amount <= 100000000),  -- tiyin; the plan's price is enforced in code
  currency TEXT NOT NULL CHECK(currency='UZS'),
  state TEXT NOT NULL CHECK(state IN ('pending','prepared','paid','cancelled','refunded')),
  external_id TEXT,                        -- click_trans_id
  provider_doc_id TEXT,                    -- click_paydoc_id (the number in the buyer's SMS)
  provider_time INTEGER,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  perform_time INTEGER NOT NULL DEFAULT 0, cancel_time INTEGER NOT NULL DEFAULT 0,
  reason INTEGER, version INTEGER NOT NULL DEFAULT 0,
  owner_test INTEGER NOT NULL DEFAULT 0 CHECK(owner_test IN (0,1)),  -- the owner's own purchase: out of reports and GA4
  restored_at INTEGER,                     -- last support restore (at most one per 7 days)
  -- Attribution: sanitized ids and tags only, never a name, phone or e-mail.
  -- Cleared after 93 days (attrib_purged_at), see maintainStudio.
  touch TEXT CHECK(touch IN ('last','first') OR touch IS NULL),
  gclid TEXT, gbraid TEXT, wbraid TEXT, yclid TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT,
  landing_path TEXT,                       -- path only, never a query string
  referrer_host TEXT, first_seen_at TEXT,
  ga_client_id TEXT, ga_session_id TEXT, ym_client_id TEXT,
  attrib_purged_at INTEGER,
  -- Server-side GA4 purchase / refund outbox (sender ships in weeks 6–7).
  ga4_state TEXT NOT NULL DEFAULT 'none' CHECK(ga4_state IN ('none','pending','sent','failed','skipped')),
  ga4_attempts INTEGER NOT NULL DEFAULT 0, ga4_next_at INTEGER NOT NULL DEFAULT 0, ga4_sent_at INTEGER,
  ga4_refund_state TEXT NOT NULL DEFAULT 'none' CHECK(ga4_refund_state IN ('none','pending','sent','failed','skipped')),
  UNIQUE(org_id,user_id,request_id),
  UNIQUE(org_id,provider,mode,external_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_orders_open ON studio_orders(org_id,user_id,mode) WHERE state IN ('pending','prepared');
CREATE INDEX IF NOT EXISTS idx_studio_orders_user ON studio_orders(org_id,user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_studio_orders_report ON studio_orders(org_id,mode,state,perform_time);
CREATE INDEX IF NOT EXISTS idx_studio_orders_ga4 ON studio_orders(org_id,ga4_state,ga4_next_at);
CREATE INDEX IF NOT EXISTS idx_studio_orders_doc ON studio_orders(org_id,provider_doc_id);
CREATE INDEX IF NOT EXISTS idx_studio_orders_attrib ON studio_orders(org_id,attrib_purged_at,created_at);

CREATE TABLE IF NOT EXISTS studio_entitlements (
  org_id TEXT NOT NULL,
  id TEXT NOT NULL,                        -- = studio_orders.id, or 'stu_…_c<n>' for a returned unit
  order_id TEXT NOT NULL,                  -- the paid order it belongs to
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  plan TEXT NOT NULL CHECK(plan IN ('kunlik','oylik','credit')),
  plan_version TEXT NOT NULL,
  starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
  presentations_limit INTEGER NOT NULL, presentations_used INTEGER NOT NULL DEFAULT 0,
  photos_limit INTEGER NOT NULL, photos_used INTEGER NOT NULL DEFAULT 0,
  extended_ms INTEGER NOT NULL DEFAULT 0,  -- outage time added by studio-extend
  revoked_at INTEGER,                      -- a mistaken charge refunded by the Seller
  PRIMARY KEY(org_id,id),
  CHECK(presentations_used >= 0 AND presentations_used <= presentations_limit),
  CHECK(photos_used >= 0 AND photos_used <= photos_limit)
);
CREATE INDEX IF NOT EXISTS idx_studio_ent_user ON studio_entitlements(org_id,user_id,mode,ends_at);
CREATE INDEX IF NOT EXISTS idx_studio_ent_active ON studio_entitlements(org_id,mode,ends_at);
CREATE INDEX IF NOT EXISTS idx_studio_ent_order ON studio_entitlements(org_id,order_id);

-- One row per generation (a job). Units are counted on studio_entitlements /
-- studio_free_usage; every count change is tied to a guarded state change here.
CREATE TABLE IF NOT EXISTS studio_unit_ledger (
  org_id TEXT NOT NULL,
  id TEXT NOT NULL,                        -- 'sj_' + 32 hex
  request_id TEXT NOT NULL,
  tool TEXT NOT NULL CHECK(tool IN ('presentation','photo')),
  unit TEXT NOT NULL CHECK(unit IN ('presentation_full','presentation_free','photo_task')),
  source TEXT NOT NULL CHECK(source IN ('free','entitlement','regen')),
  entitlement_id TEXT,                     -- NULL for free
  subject TEXT NOT NULL,                   -- 'b:'+HMAC(browser id) | 'a:'+account id
  regen_of TEXT,                           -- the original job of a regeneration
  input_mac TEXT NOT NULL,                 -- HMAC of the normalized input; no content
  consent_version TEXT,                    -- photo consent shown, e.g. 'photo-v1'
  state TEXT NOT NULL CHECK(state IN ('reserved','delivering','done','released','refused')),
  fault TEXT,                              -- last attempt's server fault, cleared by a later success
  reason TEXT,                             -- coarse: topic_refused, unreadable, provider_refused, expired_empty, fault
  parts_total INTEGER NOT NULL DEFAULT 1,
  parts_done INTEGER NOT NULL DEFAULT 0,   -- bitmask: bit 0 outline (or the single part), bits 1..4 slide parts
  steps INTEGER NOT NULL DEFAULT 0, images INTEGER NOT NULL DEFAULT 0,
  shape TEXT,                              -- 'free' | 'full' | 'photo'
  model TEXT, tokens_in INTEGER, tokens_out INTEGER, reasoning_tokens INTEGER,
  cost_micro INTEGER NOT NULL DEFAULT 0,   -- shadow list price, pricing.ts
  reserved_micro INTEGER NOT NULL DEFAULT 0, reserve_day TEXT,  -- open reserve on gpt_model_spend
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, settled_at INTEGER, total_ms INTEGER,
  PRIMARY KEY(org_id,id),
  UNIQUE(org_id,subject,request_id)
);
CREATE INDEX IF NOT EXISTS idx_studio_ledger_ent ON studio_unit_ledger(org_id,entitlement_id,state);
CREATE INDEX IF NOT EXISTS idx_studio_ledger_subject ON studio_unit_ledger(org_id,subject,created_at);
CREATE INDEX IF NOT EXISTS idx_studio_ledger_due ON studio_unit_ledger(org_id,state,expires_at);
CREATE INDEX IF NOT EXISTS idx_studio_ledger_created ON studio_unit_ledger(org_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_ledger_one_regen
  ON studio_unit_ledger(org_id,regen_of) WHERE regen_of IS NOT NULL AND state IN ('reserved','delivering','done');

-- Daily counters. day = UTC date (05:00 Tashkent). subject: 'b:<hmac>' a browser,
-- 'a:<account>' an account without a browser identity, 'ip:<hash>' the ceiling of
-- an address (young identities only), 'all' the site-wide alert counter.
-- unit 'returned' counts released attempts per subject (cap 5 a day).
CREATE TABLE IF NOT EXISTS studio_free_usage (
  org_id TEXT NOT NULL, day TEXT NOT NULL, subject TEXT NOT NULL,
  unit TEXT NOT NULL CHECK(unit IN ('presentation_free','photo_task','returned')),
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(org_id,day,subject,unit)
);
CREATE INDEX IF NOT EXISTS idx_studio_free_day ON studio_free_usage(org_id,day);
