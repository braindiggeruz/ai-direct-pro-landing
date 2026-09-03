-- Signal Radar: the chat surface. Where a client can be found, as distinct
-- from what has already been said.
--
-- 0057 modelled `lead_radar_signal_targets` around one assumption: a target is
-- worth keeping only while it hands us posts. That assumption is correct for
-- channels and fatal for groups. Verified live on 2026-09-03:
--
--   `t.me/s/<channel>`  -> server-rendered message history, ~20 posts, free.
--   `t.me/s/<group>`    -> a profile card. Name, description, and
--                          "3 264 members, 240 online". Zero messages.
--
-- The card is everything a group can tell us without a join — and it is also
-- the only honest input to the decision that actually matters here, which is
-- *where to go*. But the 0057 funnel scores posts, so a group entering it
-- scores zero, looks unreadable, and is retired inside two ticks. Eight
-- broadcast channels taught us to distrust a source that pays out nothing;
-- a group would have been discarded by that same rule for the mere crime of
-- being a group.
--
-- So chats get their own table. Different question, different lifecycle:
--
--   targets -> "what was said here, and is it a request?"
--   chats   -> "can a stranger write here, and is anyone listening?"
--
-- The two meet at one boundary only: an approved chat is handed to the join
-- queue as a `lead_radar_signal_targets` row with kind='group'. Everything
-- before that handoff lives here.

CREATE TABLE lead_radar_signal_chats (
  id TEXT PRIMARY KEY CHECK(length(id)=37 AND substr(id,1,5)='lrsc_'),
  org_id TEXT NOT NULL CHECK(length(org_id) BETWEEN 1 AND 80),
  slug TEXT NOT NULL CHECK(length(slug) BETWEEN 5 AND 32 AND slug NOT GLOB '*[^A-Za-z0-9_]*'),
  url TEXT NOT NULL CHECK(length(url) BETWEEN 12 AND 64),
  title TEXT CHECK(title IS NULL OR length(title) BETWEEN 1 AND 200),
  about TEXT CHECK(about IS NULL OR length(about)<=1000),
  -- Only 'group' survives filtering. 'channel' and 'unknown' are kept rather
  -- than deleted so the operator can see what was rejected and why, and so a
  -- source that mislabels everything becomes visible instead of silent.
  kind TEXT NOT NULL DEFAULT 'unknown' CHECK(kind IN ('group','channel','unknown')),
  -- Which topic pack claimed it, e.g. 'ads', 'dev', 'biz'.
  topic TEXT CHECK(topic IS NULL OR length(topic) BETWEEN 1 AND 32),
  members INTEGER CHECK(members IS NULL OR members BETWEEN 0 AND 100000000),
  -- Live presence from the t.me card. For a group this is the only activity
  -- signal that exists without a join, and it is a better one than a last-post
  -- date would be: it says whether anyone is in the room right now.
  online INTEGER CHECK(online IS NULL OR online BETWEEN 0 AND 10000000),
  -- Stored, not derived on read: it is a verdict against a threshold the
  -- operator can change, and re-deriving it under new settings would silently
  -- rewrite what an older harvest decided.
  activity TEXT NOT NULL DEFAULT 'unknown' CHECK(activity IN ('live','slow','unknown')),
  -- Whether a non-admin may write, and where that answer came from:
  --   'api'       — measured by Telegram getChat. Binding.
  --   'heuristic' — inferred from the name and description. A guess the
  --                 operator must be able to see is a guess.
  --   'operator'  — a human looked at the room and said so. Overrides both.
  -- The basis is stored because "can I write here" is the one column the
  -- operator is going to act on, and an answer with no provenance is not an
  -- answer you can spend your account's reputation on.
  can_write TEXT NOT NULL DEFAULT 'unknown' CHECK(can_write IN ('yes','no','unknown')),
  can_write_basis TEXT
    CHECK(can_write_basis IS NULL OR can_write_basis IN ('api','heuristic','operator')),
  relevance INTEGER NOT NULL DEFAULT 0 CHECK(relevance BETWEEN 0 AND 100),
  -- Keywords that matched, so a wrong result can be explained rather than
  -- merely doubted.
  matched_json TEXT NOT NULL DEFAULT '[]'
    CHECK(json_valid(matched_json) AND json_type(matched_json)='array' AND length(matched_json)<=2000),
  -- Why this was filtered out. Null means it survived.
  reject_reason TEXT CHECK(reject_reason IS NULL OR length(reject_reason)<=200),
  source TEXT NOT NULL DEFAULT 'manual' CHECK(length(source) BETWEEN 1 AND 80),
  -- The search query that surfaced it. Makes a harvest reproducible.
  query TEXT CHECK(query IS NULL OR length(query)<=200),
  -- new:      harvested, not yet reviewed
  -- approved: operator or filter says go; eligible for the join queue
  -- queued:   handed to lead_radar_signal_targets, awaiting join
  -- joined:   join confirmed by the transport
  -- rejected: filtered out or dismissed by the operator
  status TEXT NOT NULL DEFAULT 'new'
    CHECK(status IN ('new','approved','queued','joined','rejected')),
  checked_at TEXT,
  created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 1 AND 64),
  updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 1 AND 64),
  UNIQUE(org_id,slug)
);
CREATE INDEX idx_lr_signal_chats_org_status
  ON lead_radar_signal_chats(org_id,status,relevance DESC,members DESC);
CREATE INDEX idx_lr_signal_chats_kind
  ON lead_radar_signal_chats(org_id,kind,status);
CREATE INDEX idx_lr_signal_chats_topic
  ON lead_radar_signal_chats(org_id,topic,relevance DESC);
