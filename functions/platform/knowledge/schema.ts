import { ensureOrganizationsSchema } from '../orgs';

const KNOWLEDGE_DDL = [
  `CREATE TABLE IF NOT EXISTS knowledge_collections (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    agent_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
    name TEXT,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'archived')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (org_id, agent_id, kind),
    UNIQUE (org_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS knowledge_items (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    collection_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'hidden', 'archived')),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    search_text TEXT NOT NULL,
    media_refs_json TEXT NOT NULL DEFAULT '[]'
      CHECK (json_valid(media_refs_json)),
    numeric_1 REAL,
    numeric_2 REAL,
    numeric_3 REAL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (org_id, collection_id)
      REFERENCES knowledge_collections(org_id, id) ON DELETE RESTRICT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_collections_org_status
    ON knowledge_collections (org_id, status, agent_id, kind)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_items_collection_status
    ON knowledge_items (org_id, collection_id, status, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_items_org_search
    ON knowledge_items (org_id, status, search_text)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_items_numeric_1
    ON knowledge_items (org_id, numeric_1)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_items_numeric_2
    ON knowledge_items (org_id, numeric_2)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_items_numeric_3
    ON knowledge_items (org_id, numeric_3)`,
] as const;

const bootstrapped = new WeakMap<D1Database, Promise<void>>();

export function ensureKnowledgeSchema(db: D1Database): Promise<void> {
  let pending = bootstrapped.get(db);
  if (!pending) {
    pending = (async () => {
      await ensureOrganizationsSchema(db);
      for (const statement of KNOWLEDGE_DDL) await db.prepare(statement).run();
    })().catch((error) => {
      bootstrapped.delete(db);
      throw error;
    });
    bootstrapped.set(db, pending);
  }
  return pending;
}
