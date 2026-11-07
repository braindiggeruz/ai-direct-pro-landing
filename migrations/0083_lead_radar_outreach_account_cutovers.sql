-- Additive proof of an explicitly confirmed Bridge -> TG Sender transition.
-- No session material or message text is stored. Account and campaign history
-- remain intact. New account has no FK because it is created after retirement.
-- Rollback: disable cutovers first. Retain this ledger while any retry is possible;
-- never un-revoke an account or restore its external session automatically.
CREATE TABLE IF NOT EXISTS lead_radar_outreach_account_cutovers (
  org_id TEXT NOT NULL CHECK (length(org_id) BETWEEN 1 AND 80),
  old_account_id TEXT NOT NULL CHECK (length(old_account_id)=39 AND substr(old_account_id,1,7)='lrtgua_' AND substr(old_account_id,8) NOT GLOB '*[^0-9a-f]*'),
  new_account_id TEXT NOT NULL CHECK (length(new_account_id)=39 AND substr(new_account_id,1,7)='lrtgua_' AND substr(new_account_id,8) NOT GLOB '*[^0-9a-f]*'),
  request_digest TEXT NOT NULL CHECK (length(request_digest)=64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
  old_state_version INTEGER NOT NULL CHECK (old_state_version>=0),
  retired_at TEXT NOT NULL CHECK (length(retired_at) BETWEEN 20 AND 64),
  PRIMARY KEY (org_id,old_account_id),
  UNIQUE (org_id,request_digest),
  CHECK (old_account_id<>new_account_id),
  FOREIGN KEY (org_id,old_account_id) REFERENCES lead_radar_tg_user_accounts(org_id,id) ON DELETE RESTRICT
);
