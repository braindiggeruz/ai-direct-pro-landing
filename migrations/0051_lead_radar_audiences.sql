-- Independent, versioned audiences; no contact values or message bodies here.
-- The legacy safety.search_id stays a real provenance search, never a synthetic search.
CREATE TABLE IF NOT EXISTS lead_radar_audiences (
  org_id TEXT NOT NULL,
  id TEXT NOT NULL CHECK (length(id) = 36 AND substr(id,1,4) = 'aud_'
    AND substr(id,5) NOT GLOB '*[^0-9a-f]*'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  version INTEGER NOT NULL CHECK (version >= 1),
  company_ids_json TEXT NOT NULL CHECK (json_valid(company_ids_json)
    AND json_type(company_ids_json) = 'array' AND json_array_length(company_ids_json) <= 50),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, id)
);
CREATE INDEX IF NOT EXISTS idx_lead_radar_audiences_updated
  ON lead_radar_audiences (org_id, updated_at, id);

CREATE TABLE IF NOT EXISTS lead_radar_audience_campaigns (
  org_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  audience_id TEXT NOT NULL,
  audience_version INTEGER NOT NULL CHECK (audience_version >= 1),
  company_ids_json TEXT NOT NULL CHECK (json_valid(company_ids_json)
    AND json_type(company_ids_json) = 'array'
    AND json_array_length(company_ids_json) BETWEEN 1 AND 50),
  PRIMARY KEY (org_id, campaign_id),
  FOREIGN KEY (org_id, audience_id) REFERENCES lead_radar_audiences(org_id, id),
  FOREIGN KEY (org_id, campaign_id) REFERENCES lead_radar_tg_campaigns(org_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lead_radar_audience_campaigns_audience
  ON lead_radar_audience_campaigns (org_id, audience_id, campaign_id);
