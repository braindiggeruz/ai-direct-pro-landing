-- GPTBot Agents P2.1: tenant-aware Sotuvchi store onboarding.
--
-- Additive only. No product/catalog/order data is created by this migration.
-- Runtime bootstrap in functions/agents/sotuvchi/onboarding/schema.ts must
-- remain structurally equivalent.
--
-- Rollback notes (only while the Agents endpoint is disabled):
--   DROP INDEX IF EXISTS idx_telegram_agent_routes_org_status;
--   DROP INDEX IF EXISTS idx_sotuvchi_stores_status;
--   DROP INDEX IF EXISTS idx_sotuvchi_onboardings_status;
--   DROP TABLE IF EXISTS telegram_agent_routes;
--   DROP TABLE IF EXISTS sotuvchi_stores;
--   DROP TABLE IF EXISTS sotuvchi_onboardings;
-- Git rollback does not remove D1 objects. This migration is not applied by
-- the P2.1 code change.

CREATE TABLE IF NOT EXISTS sotuvchi_onboardings (
  id TEXT PRIMARY KEY,
  owner_identity_id TEXT NOT NULL UNIQUE
    REFERENCES identities(id) ON DELETE RESTRICT,
  bot_username TEXT NOT NULL,
  org_id TEXT UNIQUE REFERENCES organizations(id) ON DELETE RESTRICT,
  workflow_instance_id TEXT UNIQUE,
  status TEXT NOT NULL
    CHECK (status IN ('starting', 'active', 'completed', 'cancelled', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (org_id, workflow_instance_id)
    REFERENCES workflow_instances(org_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sotuvchi_stores (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL UNIQUE
    REFERENCES organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('ru', 'uz')),
  delivery_mode TEXT NOT NULL
    CHECK (delivery_mode IN ('pickup', 'delivery', 'both')),
  payment_methods_json TEXT NOT NULL
    CHECK (json_valid(payment_methods_json)
      AND json_type(payment_methods_json) = 'array'),
  storefront_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'suspended')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_agent_routes (
  id TEXT PRIMARY KEY,
  bot_username TEXT NOT NULL,
  route_code TEXT NOT NULL,
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL CHECK (agent_id = 'sotuvchi'),
  owner_identity_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (bot_username, route_code),
  UNIQUE (bot_username, org_id, agent_id),
  FOREIGN KEY (org_id) REFERENCES sotuvchi_stores(org_id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, owner_identity_id)
    REFERENCES memberships(org_id, identity_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sotuvchi_onboardings_status
  ON sotuvchi_onboardings (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_sotuvchi_stores_status
  ON sotuvchi_stores (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_telegram_agent_routes_org_status
  ON telegram_agent_routes (org_id, status);
