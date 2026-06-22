-- D1 migration: Intent Guard + Topic Plan for the AI Draft Inbox.
--
-- Adds four new tables that power the anti-cannibalization layer and the
-- "10 unique topics / day" planner. The existing tables (ai_drafts,
-- ai_draft_audit, seo_autopilot_jobs, system_settings) are NOT touched —
-- this migration is additive only.
--
-- Hard rules baked in:
--   * No row in seo_topic_reservations can hold the same active intent
--     twice in the same locale — enforced by the partial unique index
--     `uniq_active_intent`.
--   * intent_guard_analyses snapshots both risk-before and risk-after
--     for audit trail and rollback.
--   * Topic plans are immutable once status='completed' or 'failed'.
--
-- Lifecycle:
--   1. Admin clicks "Собрать 10 уникальных тем" → seo_topic_plans row
--      inserted (status='proposed') + seo_topic_plan_items rows
--      (status='proposed').
--   2. Admin reviews, can replace/delete items.
--   3. Admin clicks "Запустить 10 черновиков" → plan flips to 'launching'.
--      For each item we reserve the intent (seo_topic_reservations),
--      launch n8n via existing launch endpoint, store draft_id, mark
--      item 'generated', then run Intent Guard analysis automatically
--      and write the result into intent_guard_analyses.
--   4. Drafts always land as pending_review in ai_drafts (existing rule).

CREATE TABLE IF NOT EXISTS seo_topic_plans (
  id              TEXT PRIMARY KEY,            -- plan_<22hex>
  name            TEXT,
  requested_count INTEGER NOT NULL DEFAULT 10,
  locale_mode     TEXT NOT NULL DEFAULT 'ru',  -- 'ru' | 'uz' | 'ru+uz'
  params_json     TEXT,                        -- cluster/industry/channel/funnel/money-page filters
  status          TEXT NOT NULL DEFAULT 'proposed',
                                               -- proposed | reviewing | launching | partial | completed | failed | cancelled
  summary_json    TEXT,                        -- aggregate counters
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seo_topic_plans_status     ON seo_topic_plans(status);
CREATE INDEX IF NOT EXISTS idx_seo_topic_plans_created_at ON seo_topic_plans(created_at);

CREATE TABLE IF NOT EXISTS seo_topic_plan_items (
  id                  TEXT PRIMARY KEY,        -- pli_<22hex>
  plan_id             TEXT NOT NULL REFERENCES seo_topic_plans(id) ON DELETE CASCADE,
  position            INTEGER NOT NULL,
  locale              TEXT NOT NULL,           -- ru | uz | ru+uz
  planned_title       TEXT NOT NULL,
  primary_keyword     TEXT NOT NULL,
  intent_key          TEXT NOT NULL,           -- normalised fingerprint hash
  fingerprint_json    TEXT NOT NULL,           -- {locale, entity, intent, funnel, audience, industry, channel, geo, modifier, content_type}
  cluster_key         TEXT,
  funnel_stage        TEXT,
  audience            TEXT,
  industry            TEXT,
  channel             TEXT,
  geo                 TEXT,
  modifier            TEXT,
  content_type        TEXT,
  target_money_page   TEXT,
  reason_unique       TEXT,                    -- short human explanation
  supports_url        TEXT,                    -- which money page this topic supports
  link_plan_json      TEXT,                    -- outgoing + incoming internal-link plan
  risk_score          INTEGER,                 -- 0-100 (deterministic only, pre-launch)
  risk_level          TEXT,                    -- low | medium | high
  status              TEXT NOT NULL DEFAULT 'proposed',
                                               -- proposed | reserved | generating | generated | analyzed
                                               -- | needs_retarget | ready_for_review | failed | released | rejected
  reservation_id      TEXT,                    -- FK to seo_topic_reservations.id (loose)
  draft_id            TEXT,                    -- ai_drafts.id when generated
  source_job_id       TEXT,                    -- seo_autopilot_jobs.id
  error_message       TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seo_topic_plan_items_plan   ON seo_topic_plan_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_seo_topic_plan_items_status ON seo_topic_plan_items(status);
CREATE INDEX IF NOT EXISTS idx_seo_topic_plan_items_draft  ON seo_topic_plan_items(draft_id);

CREATE TABLE IF NOT EXISTS seo_topic_reservations (
  id                 TEXT PRIMARY KEY,         -- res_<22hex>
  locale             TEXT NOT NULL,            -- ru | uz
  intent_key         TEXT NOT NULL,            -- normalised fingerprint
  primary_keyword    TEXT NOT NULL,
  planned_title      TEXT,
  cluster_key        TEXT,
  funnel_stage       TEXT,
  audience           TEXT,
  industry           TEXT,
  channel            TEXT,
  geo                TEXT,
  modifier           TEXT,
  content_type       TEXT,
  target_money_page  TEXT,
  status             TEXT NOT NULL DEFAULT 'reserved',
                                               -- reserved | generating | generated | analyzed
                                               -- | needs_retarget | ready_for_review | published
                                               -- | failed | released | rejected
  plan_id            TEXT,                     -- ref seo_topic_plans
  plan_item_id       TEXT,                     -- ref seo_topic_plan_items
  source_job_id      TEXT,
  draft_id           TEXT,
  reserved_at        TEXT NOT NULL,
  expires_at         TEXT NOT NULL,
  released_at        TEXT,
  release_reason     TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- Only ONE active reservation per (locale, intent_key) at a time.
-- Active = status is not in {released, rejected, published, failed}.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_intent
  ON seo_topic_reservations(locale, intent_key)
  WHERE status IN ('reserved', 'generating', 'generated', 'analyzed', 'needs_retarget', 'ready_for_review');

CREATE INDEX IF NOT EXISTS idx_topic_reservations_status     ON seo_topic_reservations(status);
CREATE INDEX IF NOT EXISTS idx_topic_reservations_plan       ON seo_topic_reservations(plan_id);
CREATE INDEX IF NOT EXISTS idx_topic_reservations_expires_at ON seo_topic_reservations(expires_at);

-- One row per Intent Guard analysis run. Both `analyze` and `recheck`
-- write a row; `apply-retarget` updates the latest row with the applied
-- proposal + recheck result.
CREATE TABLE IF NOT EXISTS intent_guard_analyses (
  id                    TEXT PRIMARY KEY,        -- iga_<22hex>
  target_kind           TEXT NOT NULL,           -- 'draft' | 'plan_item' | 'editor'
  draft_id              TEXT,                    -- ai_drafts.id when target_kind='draft'
  plan_item_id          TEXT,                    -- when target_kind='plan_item'
  locale                TEXT NOT NULL,           -- ru | uz
  intent_key            TEXT,
  fingerprint_json      TEXT NOT NULL,
  deterministic_json    TEXT NOT NULL,           -- shortlisted conflicts + per-pair scores
  serper_json           TEXT,                    -- {used:false} when skipped
  semantic_json         TEXT,                    -- {used:false} when skipped
  conflicts_json        TEXT NOT NULL,           -- normalised list of conflicting docs
  risk_score            INTEGER NOT NULL,
  risk_level            TEXT NOT NULL,           -- low | medium | high
  recommendation_json   TEXT,                    -- AI suggestion to keep/narrow/etc
  retarget_proposal_json TEXT,                   -- nullable until a retarget is run
  applied               INTEGER NOT NULL DEFAULT 0,
  before_risk_score     INTEGER,                 -- the score at the time the proposal was generated
  after_risk_score      INTEGER,                 -- post-apply recheck score
  after_risk_level      TEXT,
  model                 TEXT,
  actor                 TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  applied_at            TEXT
);

CREATE INDEX IF NOT EXISTS idx_intent_guard_target ON intent_guard_analyses(target_kind, draft_id);
CREATE INDEX IF NOT EXISTS idx_intent_guard_created_at ON intent_guard_analyses(created_at);
