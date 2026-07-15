-- D1 migration: AI Draft Inbox for GPTBot.uz.
--
-- Stores incoming n8n SEO Autopilot article bundles (RU + UZ) as
-- unpublished drafts pending human review. NEVER auto-publishes.
--
-- Lifecycle:
--   n8n POST /api/admin/ai-drafts (Bearer N8N_INGEST_TOKEN)
--     → row inserted with status='pending_review'
--   Admin opens /admin-tools/ai-drafts
--     → list / detail / import into Blog Editor (status='imported')
--     → mark needs_revision / rejected as required.
--
-- Idempotency is enforced via UNIQUE(bundle_id).

CREATE TABLE IF NOT EXISTS ai_drafts (
  id                TEXT PRIMARY KEY,
  bundle_id         TEXT NOT NULL UNIQUE,
  execution_id     TEXT,
  source            TEXT NOT NULL,                -- 'n8n-seo-autopilot' | 'file-import'
  schema_version    TEXT NOT NULL,                -- e.g. 'gptbot.article-draft.v1'
  status            TEXT NOT NULL DEFAULT 'pending_review',
                                                  -- pending_review | needs_revision | imported | rejected

  -- Article payloads (already validated server-side at ingest).
  ru_article_json   TEXT,                         -- nullable: bundle may carry only one locale
  uz_article_json   TEXT,
  seo_brief_json    TEXT,                         -- optional brief
  validation_json   TEXT,                         -- {passed, issues:[]} as captured upstream
  validation_passed INTEGER NOT NULL DEFAULT 1,   -- 0/1 mirror of validation.passed for fast filtering
  validation_issue_count INTEGER NOT NULL DEFAULT 0,

  -- Convenience flags for list rendering / filtering.
  has_ru            INTEGER NOT NULL DEFAULT 0,
  has_uz            INTEGER NOT NULL DEFAULT 0,
  target_money_page TEXT,                         -- best-effort denormalised (ru first, then uz)
  primary_title     TEXT,                         -- ru title, fallback uz title
  primary_slug      TEXT,                         -- ru slug, fallback uz slug

  -- Per-locale import tracking. Each side can be imported independently.
  ru_imported_at    TEXT,
  uz_imported_at    TEXT,

  -- Lifecycle timestamps.
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  imported_at       TEXT,
  rejected_at       TEXT,

  -- Free-form note from reviewer.
  review_note       TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_drafts_status     ON ai_drafts(status);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_created_at ON ai_drafts(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_money_page ON ai_drafts(target_money_page);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_source     ON ai_drafts(source);

-- Append-only audit log: every status change, import, reject is recorded.
CREATE TABLE IF NOT EXISTS ai_draft_audit (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id     TEXT NOT NULL,
  action       TEXT NOT NULL,                     -- created|status_change|import|reject|delete|note
  actor        TEXT NOT NULL,                     -- 'system:n8n' or admin email
  details_json TEXT,
  created_at   TEXT NOT NULL,
  FOREIGN KEY (draft_id) REFERENCES ai_drafts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_draft_audit_draft_id   ON ai_draft_audit(draft_id);
CREATE INDEX IF NOT EXISTS idx_ai_draft_audit_created_at ON ai_draft_audit(created_at);
