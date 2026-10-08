-- Lifetime web-chat trial. Additive; no payment or message rows rewritten.
-- Rollback: disable GPT_FREE_TRIAL_ENABLED; retain usage and trial_key to avoid regranting.
ALTER TABLE gpt_turn_reservations ADD COLUMN trial_key TEXT;
CREATE TABLE IF NOT EXISTS gpt_trial_usage (org_id TEXT NOT NULL, identity_key TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0 CHECK(used BETWEEN 0 AND 3), updated_at INTEGER NOT NULL, PRIMARY KEY(org_id,identity_key));
CREATE INDEX IF NOT EXISTS idx_gpt_turn_trial ON gpt_turn_reservations(org_id,trial_key,status,expires_at);
CREATE TRIGGER IF NOT EXISTS gpt_trial_settle AFTER UPDATE OF status ON gpt_turn_reservations
   WHEN OLD.status='reserved' AND NEW.status='done' AND NEW.period_id IS NULL AND NEW.trial_key IS NOT NULL
   BEGIN
     INSERT INTO gpt_trial_usage(org_id,identity_key,used,updated_at) VALUES(NEW.org_id,NEW.trial_key,1,NEW.created_at)
       ON CONFLICT(org_id,identity_key) DO UPDATE SET used=MIN(3,used+1),updated_at=excluded.updated_at;
     INSERT INTO gpt_trial_usage(org_id,identity_key,used,updated_at)
       SELECT NEW.org_id,NEW.subject,1,NEW.created_at WHERE NEW.subject<>NEW.trial_key
       ON CONFLICT(org_id,identity_key) DO UPDATE SET used=MIN(3,used+1),updated_at=excluded.updated_at;
   END;
