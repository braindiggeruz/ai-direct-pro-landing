-- Resumable contact candidate pool. Additive only: one new column with a
-- default, so existing rows and the stop_reason CHECK stay untouched.
-- resume_count bounds how often a time-limited pool may be re-discovered.
ALTER TABLE lead_radar_candidate_pools
  ADD COLUMN resume_count INTEGER NOT NULL DEFAULT 0;
