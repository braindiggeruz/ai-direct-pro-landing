-- GPTBot Agents P0.4: identity, organizations and tenant-scoped relationships.
--
-- Rollback notes: no production data is backfilled by this migration. Before
-- later platform stages depend on these tables, drop contacts, memberships,
-- organizations and identities in that order. Git rollback does not remove
-- D1 tables. This migration is additive and does not alter legacy users or
-- telegram_users.

-- ── Identity (provider-neutral external identities) ─────────────────────
CREATE TABLE IF NOT EXISTS identities (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL CHECK (provider IN ('telegram', 'web', 'email', 'phone', 'api')),
  external_id TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (provider, external_id)
);

-- ── Organizations (tenant roots) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  status         TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'archived')),
  default_locale TEXT NOT NULL CHECK (default_locale IN ('ru', 'uz')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- ── Memberships (owner/staff inside one tenant) ─────────────────────────
CREATE TABLE IF NOT EXISTS memberships (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  identity_id TEXT NOT NULL REFERENCES identities(id) ON DELETE RESTRICT,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  status      TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (org_id, identity_id)
);

-- ── Contacts (the same identity may be separate in every tenant) ────────
-- P0.4 intentionally stores no display name, phone or raw channel profile.
CREATE TABLE IF NOT EXISTS contacts (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  identity_id  TEXT NOT NULL REFERENCES identities(id) ON DELETE RESTRICT,
  locale       TEXT CHECK (locale IS NULL OR locale IN ('ru', 'uz')),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  last_seen_at TEXT,
  UNIQUE (org_id, identity_id)
);

-- UNIQUE constraints above provide indexes for identities(provider,
-- external_id), organizations(slug), memberships(org_id, identity_id) and
-- contacts(org_id, identity_id). These additional indexes cover status and
-- reverse-identity lookups.
CREATE INDEX IF NOT EXISTS idx_memberships_org_status
  ON memberships (org_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_identity_status
  ON memberships (identity_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_identity
  ON contacts (identity_id);
