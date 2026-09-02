-- Signal Radar: demand-side radar that watches Telegram channels and groups for
-- incoming service requests (digital advertising, SEO, bots, sites, apps).
--
-- Independent of the company-centric Lead Radar funnel by design: a warm person
-- asking for a bot is not a company row. Only the org_id ownership boundary and
-- the retention contract are shared. No foreign keys into lead_radar_companies.
--
-- Optional extension: the Lead Radar runtime contract excludes these tables, so
-- installing this migration never invalidates the discovery/sender schema
-- fingerprint.

CREATE TABLE lead_radar_signal_targets (
  id TEXT PRIMARY KEY CHECK(length(id)=37 AND substr(id,1,5)='lrst_'),
  org_id TEXT NOT NULL CHECK(length(org_id) BETWEEN 1 AND 80),
  slug TEXT NOT NULL CHECK(length(slug) BETWEEN 5 AND 32 AND slug NOT GLOB '*[^A-Za-z0-9_]*'),
  url TEXT NOT NULL CHECK(length(url) BETWEEN 12 AND 64),
  -- 'unknown' until reconnaissance resolves it; channels are read without ever
  -- joining, groups are the only kind that consumes the join quota.
  kind TEXT NOT NULL DEFAULT 'unknown' CHECK(kind IN ('channel','group','unknown')),
  title TEXT CHECK(title IS NULL OR length(title) BETWEEN 1 AND 200),
  -- candidate: found on the web, not yet scored enough to watch
  -- watching:  monitored, no join needed (channels) or pending join (groups)
  -- probation: joined, read-only for SIGNAL_PROBATION_DAYS days
  -- active:    survived probation, productive
  -- ignored:   operator rejected
  -- left:      auto-exited after an empty probation
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK(status IN ('candidate','watching','probation','active','ignored','left')),
  score INTEGER NOT NULL DEFAULT 0 CHECK(score BETWEEN 0 AND 100),
  source TEXT NOT NULL DEFAULT 'manual' CHECK(length(source) BETWEEN 1 AND 80),
  members INTEGER CHECK(members IS NULL OR members BETWEEN 0 AND 100000000),
  messages_seen INTEGER NOT NULL DEFAULT 0 CHECK(messages_seen BETWEEN 0 AND 10000000),
  leads_seen INTEGER NOT NULL DEFAULT 0 CHECK(leads_seen BETWEEN 0 AND 1000000),
  -- Join-queue state. next_action_at is the single pacing gate: nothing touches
  -- the Telegram API before it.
  join_attempts INTEGER NOT NULL DEFAULT 0 CHECK(join_attempts BETWEEN 0 AND 20),
  next_action_at TEXT,
  joined_at TEXT,
  probation_until TEXT,
  last_post_at TEXT,
  note TEXT CHECK(note IS NULL OR length(note)<=500),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 1 AND 64),
  -- Composite foreign keys below reference (org_id, id), and SQLite requires a
  -- matching UNIQUE on exactly those columns. Same pattern as 0056.
  UNIQUE(org_id,id),
  UNIQUE(org_id,slug)
);
CREATE INDEX idx_lr_signal_targets_org_status
  ON lead_radar_signal_targets(org_id,status,score DESC,updated_at DESC);
CREATE INDEX idx_lr_signal_targets_kind
  ON lead_radar_signal_targets(org_id,kind,status);
CREATE INDEX idx_lr_signal_targets_join_queue
  ON lead_radar_signal_targets(org_id,status,next_action_at)
  WHERE status IN ('watching','probation');
CREATE UNIQUE INDEX idx_lr_signal_targets_joined_cap
  ON lead_radar_signal_targets(org_id,slug)
  WHERE status IN ('probation','active');

-- Observed messages. Deliberately ephemeral: the raw text of a stranger's post
-- is retained only long enough to triage it and to quote it back in a reply.
CREATE TABLE lead_radar_signal_posts (
  id TEXT PRIMARY KEY CHECK(length(id)=37 AND substr(id,1,5)='lrsp_'),
  org_id TEXT NOT NULL CHECK(length(org_id) BETWEEN 1 AND 80),
  target_id TEXT NOT NULL CHECK(length(target_id)=37),
  external_id TEXT CHECK(external_id IS NULL OR length(external_id) BETWEEN 1 AND 40),
  -- Display name only, already masked by the bridge. Never a phone number.
  author_label TEXT CHECK(author_label IS NULL OR length(author_label)<=120),
  -- Public @handle when the author has one; this is how a reply reaches them.
  author_handle TEXT CHECK(author_handle IS NULL OR length(author_handle) BETWEEN 5 AND 32),
  excerpt TEXT NOT NULL CHECK(length(excerpt) BETWEEN 1 AND 1200),
  -- SHA-256 of normalized text within the same org. Kills cross-post duplicates
  -- from people who paste the same request into five groups.
  dedup_key TEXT NOT NULL CHECK(length(dedup_key)=64),
  occurred_at TEXT NOT NULL CHECK(length(occurred_at) BETWEEN 1 AND 64),
  verdict TEXT NOT NULL DEFAULT 'review'
    CHECK(verdict IN ('lead','review','discard','supply','jobseeker')),
  score INTEGER NOT NULL DEFAULT 0 CHECK(score BETWEEN 0 AND 100),
  service TEXT CHECK(service IS NULL OR length(service) BETWEEN 1 AND 32),
  reasons_json TEXT NOT NULL DEFAULT '[]'
    CHECK(json_valid(reasons_json) AND json_type(reasons_json)='array' AND length(reasons_json)<=2000),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 1 AND 64),
  UNIQUE(org_id,id),
  FOREIGN KEY(org_id,target_id) REFERENCES lead_radar_signal_targets(org_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_lr_signal_posts_dedup ON lead_radar_signal_posts(org_id,dedup_key);
CREATE INDEX idx_lr_signal_posts_target
  ON lead_radar_signal_posts(org_id,target_id,occurred_at DESC);
CREATE INDEX idx_lr_signal_posts_verdict
  ON lead_radar_signal_posts(org_id,verdict,score DESC,occurred_at DESC);
CREATE INDEX idx_lr_signal_posts_retention ON lead_radar_signal_posts(org_id,created_at);

-- Qualified leads. One row per triaged post, never more.
CREATE TABLE lead_radar_signal_leads (
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
  -- the reply feel read rather than blasted.
  quote TEXT NOT NULL CHECK(length(quote) BETWEEN 1 AND 600),
  draft_text TEXT CHECK(draft_text IS NULL OR length(draft_text) BETWEEN 1 AND 2000),
  sent_at TEXT,
  failure_code TEXT CHECK(failure_code IS NULL OR length(failure_code) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 1 AND 64),
  UNIQUE(org_id,post_id),
  FOREIGN KEY(org_id,post_id) REFERENCES lead_radar_signal_posts(org_id,id) ON DELETE CASCADE,
  FOREIGN KEY(org_id,target_id) REFERENCES lead_radar_signal_targets(org_id,id) ON DELETE CASCADE
);
CREATE INDEX idx_lr_signal_leads_state
  ON lead_radar_signal_leads(org_id,state,score DESC,created_at DESC);
CREATE INDEX idx_lr_signal_leads_service
  ON lead_radar_signal_leads(org_id,service,created_at DESC);
