-- Signal Radar: a lead must outlive the post it came from.
--
-- 0057 declared:
--
--   FOREIGN KEY(org_id,post_id) REFERENCES lead_radar_signal_posts(org_id,id)
--     ON DELETE CASCADE
--
-- That reads as tidy housekeeping and is in fact data loss. Posts are
-- deliberately ephemeral — `purgePostsOlderThan()` deletes every post older
-- than the seven-day retention window on every scout tick. With the cascade in
-- place, the sweep does not just erase a stranger's raw text: it takes the
-- operator's lead with it. A lead that had already been drafted, approved or
-- answered disappeared on day eight, without a trace and without an error,
-- which is the worst kind of deletion there is.
--
-- The cascade contradicts the retention contract it sits next to. The lead
-- carries its own bounded copy of the request (`quote`, ≤600 chars) precisely
-- so that it can be worked after the full text is gone; `getPost()` returning
-- null past retention is the intended, tested behaviour. 0057 wired the two
-- tables together as if the lead were a view over the post. It is not.
--
-- So the posts foreign key is dropped. `post_id` stays as a plain column — it
-- still joins to the post while the post exists, still identifies which message
-- produced the lead, and is still covered by UNIQUE(org_id,post_id) so the
-- one-lead-per-post guarantee is untouched. What changes is only that retention
-- now deletes the text instead of the work.
--
-- The targets foreign key is deliberately kept with its cascade. Deleting a
-- target means the operator rejected that channel, and leaving its posts and
-- leads behind would strand a stranger's text with nothing to attribute it to.
-- Targets are never deleted by the runtime — the join queue moves them between
-- statuses — so that cascade fires only on an explicit operator action.
--
-- SQLite cannot drop a foreign key in place, so the table is rebuilt. Every
-- column, CHECK, default, unique constraint and index is carried across
-- unchanged; the single difference is one removed line.
--
-- Rollback
-- --------
-- The reverse rebuild restores the cascade and is safe to apply at any time,
-- because no lead in production can be older than the retention window while
-- this migration is installed: there is nothing for the restored cascade to
-- delete retroactively. It will, however, start deleting leads again on the
-- next sweep, so rolling back means reverting the retention contract too.
-- Prefer fixing the retention code over reverting this.

CREATE TABLE lead_radar_signal_leads_new (
  id TEXT PRIMARY KEY CHECK(length(id)=37 AND substr(id,1,5)='lrsl_'),
  org_id TEXT NOT NULL CHECK(length(org_id) BETWEEN 1 AND 80),
  post_id TEXT NOT NULL CHECK(length(post_id)=37),
  target_id TEXT NOT NULL CHECK(length(target_id)=37),
  service TEXT NOT NULL CHECK(length(service) BETWEEN 1 AND 32),
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
  -- new -> drafted -> approved -> sent. Dismissed and failed are terminal.
  state TEXT NOT NULL DEFAULT 'new'
    CHECK(state IN ('new','drafted','approved','sent','dismissed','failed')),
  author_label TEXT CHECK(author_label IS NULL OR length(author_label)<=120),
  author_handle TEXT CHECK(author_handle IS NULL OR length(author_handle) BETWEEN 5 AND 32),
  -- Their own words, shown in the UI and echoed in the draft. This is what makes
  -- the reply feel read rather than blasted. This is the copy that survives
  -- retention; the full text behind it does not.
  quote TEXT NOT NULL CHECK(length(quote) BETWEEN 1 AND 600),
  draft_text TEXT CHECK(draft_text IS NULL OR length(draft_text) BETWEEN 1 AND 2000),
  sent_at TEXT,
  failure_code TEXT CHECK(failure_code IS NULL OR length(failure_code) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 1 AND 64),
  UNIQUE(org_id,post_id),
  -- No foreign key to lead_radar_signal_posts: a seven-day retention sweep must
  -- delete the stranger's text, never the operator's lead.
  FOREIGN KEY(org_id,target_id) REFERENCES lead_radar_signal_targets(org_id,id) ON DELETE CASCADE
);

INSERT INTO lead_radar_signal_leads_new (
  id, org_id, post_id, target_id, service, score, state,
  author_label, author_handle, quote, draft_text, sent_at, failure_code,
  created_at, updated_at
)
SELECT
  id, org_id, post_id, target_id, service, score, state,
  author_label, author_handle, quote, draft_text, sent_at, failure_code,
  created_at, updated_at
FROM lead_radar_signal_leads;

DROP TABLE lead_radar_signal_leads;

ALTER TABLE lead_radar_signal_leads_new RENAME TO lead_radar_signal_leads;

CREATE INDEX idx_lr_signal_leads_state
  ON lead_radar_signal_leads(org_id,state,score DESC,created_at DESC);
CREATE INDEX idx_lr_signal_leads_service
  ON lead_radar_signal_leads(org_id,service,created_at DESC);
