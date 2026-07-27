-- GPTBot Agents P1.2: tenant-aware persistent Workflow Engine minimum.
--
-- Rollback notes: this migration is additive and does not backfill or alter
-- legacy/platform tables. Before later stages depend on workflow data, drop
-- workflow_transitions first and workflow_instances second. Git rollback
-- does not remove D1 tables. P1.2 does not apply this migration to production.

CREATE TABLE IF NOT EXISTS workflow_instances (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  workflow_id      TEXT NOT NULL,
  workflow_version INTEGER NOT NULL CHECK (workflow_version >= 1),
  state            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'completed', 'cancelled', 'failed')),
  payload_json     TEXT NOT NULL CHECK (json_valid(payload_json)),
  version          INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  idempotency_key  TEXT NOT NULL,
  wake_at          TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  completed_at     TEXT,
  UNIQUE (org_id, idempotency_key),
  UNIQUE (org_id, id)
);

CREATE TABLE IF NOT EXISTS workflow_transitions (
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL,
  instance_id       TEXT NOT NULL,
  from_state        TEXT NOT NULL,
  to_state          TEXT NOT NULL,
  trigger           TEXT NOT NULL,
  idempotency_key   TEXT NOT NULL,
  instance_version  INTEGER NOT NULL CHECK (instance_version >= 2),
  metadata_json     TEXT NOT NULL DEFAULT '{"instanceStatus":"active","actionStatus":"pending","actionResults":[]}'
                      CHECK (json_valid(metadata_json)),
  created_at        TEXT NOT NULL,
  UNIQUE (org_id, idempotency_key),
  FOREIGN KEY (org_id, instance_id)
    REFERENCES workflow_instances(org_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_org_status
  ON workflow_instances (org_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_workflow_status
  ON workflow_instances (org_id, workflow_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_org_wake
  ON workflow_instances (org_id, status, wake_at);
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_instance
  ON workflow_transitions (org_id, instance_id, created_at, id);
