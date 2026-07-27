import { KNOWLEDGE_LIMITS } from './constants';
import {
  KnowledgeDuplicateCollectionError,
  KnowledgeNotFoundError,
  KnowledgePersistenceError,
  KnowledgeVersionConflictError,
} from './errors';
import {
  type CreateKnowledgeCollectionInput,
  type KnowledgeCollection,
  type KnowledgeCollectionStatus,
  type KnowledgeItem,
  type KnowledgeItemStatus,
  type KnowledgeNumericFilter,
  type KnowledgeSearchCandidateInput,
  type ListKnowledgeItemsOptions,
  type PersistKnowledgeItemInput,
  type PersistKnowledgeItemUpdate,
} from './types';
import {
  normalizeKnowledgeCollectionName,
  requireKnowledgeAgentId,
  requireKnowledgeCollectionId,
  requireKnowledgeCollectionStatus,
  requireKnowledgeItemId,
  requireKnowledgeItemStatus,
  requireKnowledgeKind,
  requireKnowledgeLimit,
  requireKnowledgeOrgId,
  requireKnowledgeSchemaVersion,
  requireKnowledgeVersion,
  validateMediaReferences,
} from './validation';

const COLLECTION_COLUMNS =
  'id, org_id, agent_id, kind, schema_version, name, status, created_at, updated_at';
const ITEM_COLUMNS =
  'id, org_id, collection_id, status, payload_json, search_text, media_refs_json, '
  + 'numeric_1, numeric_2, numeric_3, version, created_at, updated_at';
const QUALIFIED_ITEM_COLUMNS =
  'i.id, i.org_id, i.collection_id, i.status, i.payload_json, i.search_text, '
  + 'i.media_refs_json, i.numeric_1, i.numeric_2, i.numeric_3, i.version, '
  + 'i.created_at, i.updated_at';

interface KnowledgeCollectionRow {
  id: string;
  org_id: string;
  agent_id: string;
  kind: string;
  schema_version: number;
  name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface KnowledgeItemRow {
  id: string;
  org_id: string;
  collection_id: string;
  status: string;
  payload_json: string;
  search_text: string;
  media_refs_json: string;
  numeric_1: number | null;
  numeric_2: number | null;
  numeric_3: number | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeStore {
  createCollection(
    orgId: string,
    input: CreateKnowledgeCollectionInput,
  ): Promise<KnowledgeCollection>;
  getCollection(orgId: string, collectionId: string): Promise<KnowledgeCollection | null>;
  findCollection(
    orgId: string,
    agentId: string,
    kind: string,
  ): Promise<KnowledgeCollection | null>;
  archiveCollection(orgId: string, collectionId: string): Promise<KnowledgeCollection>;
  createItem(
    orgId: string,
    collectionId: string,
    input: PersistKnowledgeItemInput,
  ): Promise<KnowledgeItem>;
  getItem(orgId: string, itemId: string): Promise<KnowledgeItem | null>;
  listItems(
    orgId: string,
    collectionId: string,
    options?: ListKnowledgeItemsOptions,
  ): Promise<KnowledgeItem[]>;
  updateItem(
    orgId: string,
    itemId: string,
    input: PersistKnowledgeItemUpdate,
  ): Promise<KnowledgeItem>;
  setItemStatus(
    orgId: string,
    itemId: string,
    status: KnowledgeItemStatus,
    expectedVersion: number,
  ): Promise<KnowledgeItem>;
  findSearchCandidates(
    orgId: string,
    input: KnowledgeSearchCandidateInput,
  ): Promise<KnowledgeItem[]>;
}

function fromCollectionRow(row: KnowledgeCollectionRow): KnowledgeCollection {
  let status: KnowledgeCollectionStatus;
  try {
    status = requireKnowledgeCollectionStatus(row.status);
    requireKnowledgeSchemaVersion(row.schema_version);
  } catch {
    throw new KnowledgePersistenceError('corrupt_row');
  }
  return {
    id: row.id,
    orgId: row.org_id,
    agentId: row.agent_id,
    kind: row.kind,
    schemaVersion: row.schema_version,
    name: row.name,
    status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromItemRow(row: KnowledgeItemRow): KnowledgeItem {
  let status: KnowledgeItemStatus;
  let payload: unknown;
  let mediaRefs: ReturnType<typeof validateMediaReferences>;
  try {
    status = requireKnowledgeItemStatus(row.status);
    requireKnowledgeVersion(row.version);
    payload = JSON.parse(row.payload_json);
    mediaRefs = validateMediaReferences(JSON.parse(row.media_refs_json));
    for (const numeric of [row.numeric_1, row.numeric_2, row.numeric_3]) {
      if (numeric !== null && !Number.isFinite(numeric)) {
        throw new KnowledgePersistenceError('corrupt_row');
      }
    }
  } catch {
    throw new KnowledgePersistenceError('corrupt_row');
  }
  return {
    id: row.id,
    orgId: row.org_id,
    collectionId: row.collection_id,
    status,
    payload,
    searchText: row.search_text,
    mediaRefs,
    numericValues: [row.numeric_1, row.numeric_2, row.numeric_3],
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function newKnowledgeId(type: 'collection' | 'item'): string {
  return `knowledge_${type}_${crypto.randomUUID()}`;
}

function filterBounds(
  filters: readonly KnowledgeNumericFilter[],
): readonly [
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
] {
  const bounds: [
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
  ] = [null, null, null, null, null, null];
  for (const filter of filters) {
    const offset = (filter.index - 1) * 2;
    bounds[offset] = filter.min ?? null;
    bounds[offset + 1] = filter.max ?? null;
  }
  return bounds;
}

export function createKnowledgeStore(db: D1Database): KnowledgeStore {
  async function findCollectionRow(
    orgId: string,
    agentId: string,
    kind: string,
  ): Promise<KnowledgeCollection | null> {
    const row = await db
      .prepare(`SELECT ${COLLECTION_COLUMNS}
                FROM knowledge_collections
                WHERE org_id = ? AND agent_id = ? AND kind = ?`)
      .bind(orgId, agentId, kind)
      .first<KnowledgeCollectionRow>();
    return row ? fromCollectionRow(row) : null;
  }

  async function getItemRow(orgId: string, itemId: string): Promise<KnowledgeItem | null> {
    const row = await db
      .prepare(`SELECT ${ITEM_COLUMNS}
                FROM knowledge_items
                WHERE org_id = ? AND id = ?`)
      .bind(orgId, itemId)
      .first<KnowledgeItemRow>();
    return row ? fromItemRow(row) : null;
  }

  return {
    async createCollection(
      orgId: string,
      input: CreateKnowledgeCollectionInput,
    ): Promise<KnowledgeCollection> {
      const tenantId = requireKnowledgeOrgId(orgId);
      const agentId = requireKnowledgeAgentId(input.agentId);
      const kind = requireKnowledgeKind(input.kind);
      const createdAt = new Date().toISOString();
      const collection: KnowledgeCollection = {
        id: newKnowledgeId('collection'),
        orgId: tenantId,
        agentId,
        kind,
        schemaVersion: requireKnowledgeSchemaVersion(input.schemaVersion),
        name: normalizeKnowledgeCollectionName(input.name),
        status: requireKnowledgeCollectionStatus(input.status ?? 'active'),
        createdAt,
        updatedAt: createdAt,
      };
      try {
        await db
          .prepare(`INSERT INTO knowledge_collections
            (id, org_id, agent_id, kind, schema_version, name, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            collection.id,
            collection.orgId,
            collection.agentId,
            collection.kind,
            collection.schemaVersion,
            collection.name,
            collection.status,
            collection.createdAt,
            collection.updatedAt,
          )
          .run();
        return collection;
      } catch {
        if (await findCollectionRow(tenantId, agentId, kind)) {
          throw new KnowledgeDuplicateCollectionError();
        }
        throw new KnowledgePersistenceError('persistence_failed');
      }
    },

    async getCollection(
      orgId: string,
      collectionId: string,
    ): Promise<KnowledgeCollection | null> {
      const row = await db
        .prepare(`SELECT ${COLLECTION_COLUMNS}
                  FROM knowledge_collections
                  WHERE org_id = ? AND id = ?`)
        .bind(
          requireKnowledgeOrgId(orgId),
          requireKnowledgeCollectionId(collectionId),
        )
        .first<KnowledgeCollectionRow>();
      return row ? fromCollectionRow(row) : null;
    },

    async findCollection(
      orgId: string,
      agentId: string,
      kind: string,
    ): Promise<KnowledgeCollection | null> {
      const collection = await findCollectionRow(
        requireKnowledgeOrgId(orgId),
        requireKnowledgeAgentId(agentId),
        requireKnowledgeKind(kind),
      );
      return collection?.status === 'active' ? collection : null;
    },

    async archiveCollection(
      orgId: string,
      collectionId: string,
    ): Promise<KnowledgeCollection> {
      const tenantId = requireKnowledgeOrgId(orgId);
      const id = requireKnowledgeCollectionId(collectionId);
      const result = await db
        .prepare(`UPDATE knowledge_collections
                  SET status = 'archived', updated_at = ?
                  WHERE org_id = ? AND id = ? AND status = 'active'`)
        .bind(new Date().toISOString(), tenantId, id)
        .run();
      if ((result.meta?.changes ?? 0) === 0) {
        const existing = await this.getCollection(tenantId, id);
        if (!existing) throw new KnowledgeNotFoundError('collection');
        return existing;
      }
      const archived = await this.getCollection(tenantId, id);
      if (!archived) throw new KnowledgeNotFoundError('collection');
      return archived;
    },

    async createItem(
      orgId: string,
      collectionId: string,
      input: PersistKnowledgeItemInput,
    ): Promise<KnowledgeItem> {
      const tenantId = requireKnowledgeOrgId(orgId);
      const parentId = requireKnowledgeCollectionId(collectionId);
      const collection = await this.getCollection(tenantId, parentId);
      if (!collection || collection.status !== 'active') {
        throw new KnowledgeNotFoundError('collection');
      }
      const createdAt = new Date().toISOString();
      const id = newKnowledgeId('item');
      const status = requireKnowledgeItemStatus(input.status);
      try {
        await db
          .prepare(`INSERT INTO knowledge_items
            (id, org_id, collection_id, status, payload_json, search_text,
             media_refs_json, numeric_1, numeric_2, numeric_3, version,
             created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
          .bind(
            id,
            tenantId,
            parentId,
            status,
            input.payloadJson,
            input.searchText,
            input.mediaRefsJson,
            input.numericValues[0],
            input.numericValues[1],
            input.numericValues[2],
            createdAt,
            createdAt,
          )
          .run();
      } catch {
        throw new KnowledgePersistenceError('persistence_failed');
      }
      const created = await getItemRow(tenantId, id);
      if (!created) throw new KnowledgePersistenceError('persistence_failed');
      return created;
    },

    async getItem(orgId: string, itemId: string): Promise<KnowledgeItem | null> {
      return getItemRow(
        requireKnowledgeOrgId(orgId),
        requireKnowledgeItemId(itemId),
      );
    },

    async listItems(
      orgId: string,
      collectionId: string,
      options: ListKnowledgeItemsOptions = {},
    ): Promise<KnowledgeItem[]> {
      const tenantId = requireKnowledgeOrgId(orgId);
      const parentId = requireKnowledgeCollectionId(collectionId);
      const collection = await this.getCollection(tenantId, parentId);
      if (!collection) throw new KnowledgeNotFoundError('collection');
      if (collection.status !== 'active' && !options.includeInactive) return [];
      const includeInactive = options.includeInactive === true ? 1 : 0;
      const rows = await db
        .prepare(`SELECT ${ITEM_COLUMNS}
                  FROM knowledge_items
                  WHERE org_id = ? AND collection_id = ?
                    AND (? = 1 OR status = 'active')
                  ORDER BY updated_at DESC, id ASC
                  LIMIT ?`)
        .bind(
          tenantId,
          parentId,
          includeInactive,
          requireKnowledgeLimit(options.limit),
        )
        .all<KnowledgeItemRow>();
      return (rows.results ?? []).map(fromItemRow);
    },

    async updateItem(
      orgId: string,
      itemId: string,
      input: PersistKnowledgeItemUpdate,
    ): Promise<KnowledgeItem> {
      const tenantId = requireKnowledgeOrgId(orgId);
      const id = requireKnowledgeItemId(itemId);
      const expectedVersion = requireKnowledgeVersion(input.expectedVersion);
      const result = await db
        .prepare(`UPDATE knowledge_items
                  SET payload_json = ?, search_text = ?, media_refs_json = ?,
                      numeric_1 = ?, numeric_2 = ?, numeric_3 = ?,
                      version = version + 1, updated_at = ?
                  WHERE org_id = ? AND id = ? AND version = ?`)
        .bind(
          input.payloadJson,
          input.searchText,
          input.mediaRefsJson,
          input.numericValues[0],
          input.numericValues[1],
          input.numericValues[2],
          new Date().toISOString(),
          tenantId,
          id,
          expectedVersion,
        )
        .run();
      if ((result.meta?.changes ?? 0) === 0) {
        if (!await getItemRow(tenantId, id)) throw new KnowledgeNotFoundError('item');
        throw new KnowledgeVersionConflictError();
      }
      const updated = await getItemRow(tenantId, id);
      if (!updated) throw new KnowledgeNotFoundError('item');
      return updated;
    },

    async setItemStatus(
      orgId: string,
      itemId: string,
      status: KnowledgeItemStatus,
      expectedVersion: number,
    ): Promise<KnowledgeItem> {
      const tenantId = requireKnowledgeOrgId(orgId);
      const id = requireKnowledgeItemId(itemId);
      const safeStatus = requireKnowledgeItemStatus(status);
      const safeVersion = requireKnowledgeVersion(expectedVersion);
      const result = await db
        .prepare(`UPDATE knowledge_items
                  SET status = ?, version = version + 1, updated_at = ?
                  WHERE org_id = ? AND id = ? AND version = ?`)
        .bind(safeStatus, new Date().toISOString(), tenantId, id, safeVersion)
        .run();
      if ((result.meta?.changes ?? 0) === 0) {
        if (!await getItemRow(tenantId, id)) throw new KnowledgeNotFoundError('item');
        throw new KnowledgeVersionConflictError();
      }
      const updated = await getItemRow(tenantId, id);
      if (!updated) throw new KnowledgeNotFoundError('item');
      return updated;
    },

    async findSearchCandidates(
      orgId: string,
      input: KnowledgeSearchCandidateInput,
    ): Promise<KnowledgeItem[]> {
      const tenantId = requireKnowledgeOrgId(orgId);
      const agentId = requireKnowledgeAgentId(input.agentId);
      const kind = requireKnowledgeKind(input.kind);
      const bounds = filterBounds(input.numericFilters);
      const candidateLimit = Math.max(
        1,
        Math.min(input.limit, KNOWLEDGE_LIMITS.candidateLimit),
      );
      const rows = await db
        .prepare(`SELECT ${QUALIFIED_ITEM_COLUMNS}
                  FROM knowledge_items AS i
                  INNER JOIN knowledge_collections AS c
                    ON c.id = i.collection_id AND c.org_id = i.org_id
                  WHERE i.org_id = ? AND c.agent_id = ? AND c.kind = ?
                    AND c.status = 'active' AND i.status = 'active'
                    AND (
                      i.search_text = ?
                      OR i.search_text LIKE ?
                      OR EXISTS (
                        SELECT 1 FROM json_each(?) AS query_token
                        WHERE i.search_text LIKE '%' || query_token.value || '%'
                      )
                    )
                    AND (? IS NULL OR i.numeric_1 >= ?)
                    AND (? IS NULL OR i.numeric_1 <= ?)
                    AND (? IS NULL OR i.numeric_2 >= ?)
                    AND (? IS NULL OR i.numeric_2 <= ?)
                    AND (? IS NULL OR i.numeric_3 >= ?)
                    AND (? IS NULL OR i.numeric_3 <= ?)
                  ORDER BY i.updated_at DESC, i.id ASC
                  LIMIT ?`)
        .bind(
          tenantId,
          agentId,
          kind,
          input.normalizedQuery,
          `${input.normalizedQuery}%`,
          JSON.stringify(input.tokens),
          bounds[0],
          bounds[0],
          bounds[1],
          bounds[1],
          bounds[2],
          bounds[2],
          bounds[3],
          bounds[3],
          bounds[4],
          bounds[4],
          bounds[5],
          bounds[5],
          candidateLimit,
        )
        .all<KnowledgeItemRow>();
      return (rows.results ?? []).map(fromItemRow);
    },
  };
}
