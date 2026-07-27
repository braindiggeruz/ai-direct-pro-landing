import { KNOWLEDGE_LIMITS } from './constants';
import { rankKnowledgeItems } from './search';
import { ensureKnowledgeSchema } from './schema';
import { createKnowledgeStore, type KnowledgeStore } from './store';
import {
  type CreateKnowledgeCollectionInput,
  type CreateKnowledgeItemInput,
  type KnowledgeCollection,
  type KnowledgeItem,
  type KnowledgeItemStatus,
  type KnowledgePayloadSchema,
  type KnowledgeSearchResult,
  type ListKnowledgeItemsOptions,
  type SearchKnowledgeItemsInput,
  type UpdateKnowledgeItemInput,
} from './types';
import {
  prepareKnowledgePayload,
  requireKnowledgeAgentId,
  requireKnowledgeKind,
  requireKnowledgeLimit,
  validateKnowledgeQuery,
  validateNumericFilters,
} from './validation';

function withPayload<T>(item: KnowledgeItem, payload: T): KnowledgeItem<T> {
  return { ...item, payload };
}

export class KnowledgeService {
  private readonly store: KnowledgeStore;

  constructor(private readonly db: D1Database) {
    this.store = createKnowledgeStore(db);
  }

  private async ready(): Promise<void> {
    await ensureKnowledgeSchema(this.db);
  }

  async createCollection(
    orgId: string,
    input: CreateKnowledgeCollectionInput,
  ): Promise<KnowledgeCollection> {
    await this.ready();
    return this.store.createCollection(orgId, input);
  }

  async getCollection(
    orgId: string,
    collectionId: string,
  ): Promise<KnowledgeCollection | null> {
    await this.ready();
    return this.store.getCollection(orgId, collectionId);
  }

  async findCollection(
    orgId: string,
    agentId: string,
    kind: string,
  ): Promise<KnowledgeCollection | null> {
    await this.ready();
    return this.store.findCollection(orgId, agentId, kind);
  }

  async archiveCollection(
    orgId: string,
    collectionId: string,
  ): Promise<KnowledgeCollection> {
    await this.ready();
    return this.store.archiveCollection(orgId, collectionId);
  }

  async createItem<T>(
    orgId: string,
    collectionId: string,
    input: CreateKnowledgeItemInput,
    schema: KnowledgePayloadSchema<T>,
  ): Promise<KnowledgeItem<T>> {
    await this.ready();
    const { value, prepared } = prepareKnowledgePayload(input.payload, schema);
    const item = await this.store.createItem(orgId, collectionId, {
      ...prepared,
      status: input.status ?? 'active',
    });
    return withPayload(item, value);
  }

  async getItem(orgId: string, itemId: string): Promise<KnowledgeItem | null> {
    await this.ready();
    return this.store.getItem(orgId, itemId);
  }

  async listItems(
    orgId: string,
    collectionId: string,
    options?: ListKnowledgeItemsOptions,
  ): Promise<KnowledgeItem[]> {
    await this.ready();
    return this.store.listItems(orgId, collectionId, options);
  }

  async updateItem<T>(
    orgId: string,
    itemId: string,
    input: UpdateKnowledgeItemInput,
    schema: KnowledgePayloadSchema<T>,
  ): Promise<KnowledgeItem<T>> {
    await this.ready();
    const { value, prepared } = prepareKnowledgePayload(input.payload, schema);
    const item = await this.store.updateItem(orgId, itemId, {
      ...prepared,
      expectedVersion: input.expectedVersion,
    });
    return withPayload(item, value);
  }

  async setItemStatus(
    orgId: string,
    itemId: string,
    status: KnowledgeItemStatus,
    expectedVersion: number,
  ): Promise<KnowledgeItem> {
    await this.ready();
    return this.store.setItemStatus(orgId, itemId, status, expectedVersion);
  }

  async searchItems(
    orgId: string,
    input: SearchKnowledgeItemsInput,
  ): Promise<KnowledgeSearchResult[]> {
    await this.ready();
    const agentId = requireKnowledgeAgentId(input.agentId);
    const kind = requireKnowledgeKind(input.kind);
    const limit = requireKnowledgeLimit(input.limit, 10);
    const query = validateKnowledgeQuery(input.query);
    const numericFilters = validateNumericFilters(input.numericFilters);
    const candidates = await this.store.findSearchCandidates(orgId, {
      agentId,
      kind,
      normalizedQuery: query.normalized,
      tokens: query.tokens,
      numericFilters,
      limit: Math.min(
        Math.max(limit * 10, 50),
        KNOWLEDGE_LIMITS.candidateLimit,
      ),
    });
    return rankKnowledgeItems(candidates, query.normalized, query.tokens)
      .slice(0, limit);
  }
}

export function createKnowledgeService(db: D1Database): KnowledgeService {
  return new KnowledgeService(db);
}
