export const KNOWLEDGE_COLLECTION_STATUSES = ['active', 'archived'] as const;
export const KNOWLEDGE_ITEM_STATUSES = ['active', 'hidden', 'archived'] as const;

export type KnowledgeCollectionStatus =
  (typeof KNOWLEDGE_COLLECTION_STATUSES)[number];
export type KnowledgeItemStatus = (typeof KNOWLEDGE_ITEM_STATUSES)[number];

/**
 * Channel references are opaque and scoped to the connection that created
 * them. In particular, a Telegram file_id is not portable between bots.
 * Knowledge stores the reference; channel/media drivers own delivery.
 */
export type MediaReference =
  | { source: 'channel'; channel: string; ref: string }
  | { source: 'store'; store: string; key: string };

export interface KnowledgePayloadSchema<T> {
  validate(input: unknown): T;
  toSearchText(value: T): string;
  toMediaRefs?(value: T): readonly MediaReference[];
  /** Up to three finite values promoted into indexed numeric columns. */
  toNumericValues?(value: T): readonly (number | null | undefined)[];
}

export interface KnowledgeCollection {
  id: string;
  orgId: string;
  agentId: string;
  kind: string;
  schemaVersion: number;
  name: string | null;
  status: KnowledgeCollectionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeCollectionInput {
  agentId: string;
  kind: string;
  schemaVersion: number;
  name?: string;
  status?: KnowledgeCollectionStatus;
}

export interface KnowledgeItem<T = unknown> {
  id: string;
  orgId: string;
  collectionId: string;
  status: KnowledgeItemStatus;
  payload: T;
  searchText: string;
  mediaRefs: readonly MediaReference[];
  numericValues: readonly [number | null, number | null, number | null];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeItemInput {
  payload: unknown;
  status?: KnowledgeItemStatus;
}

export interface UpdateKnowledgeItemInput {
  expectedVersion: number;
  payload: unknown;
}

export interface ListKnowledgeItemsOptions {
  includeInactive?: boolean;
  limit?: number;
}

export interface KnowledgeNumericFilter {
  index: 1 | 2 | 3;
  min?: number;
  max?: number;
}

export interface SearchKnowledgeItemsInput {
  agentId: string;
  kind: string;
  query: string;
  limit?: number;
  numericFilters?: readonly KnowledgeNumericFilter[];
}

export interface KnowledgeSearchResult {
  item: KnowledgeItem;
  score: number;
  matchedTokens: number;
}

export interface PreparedKnowledgeItem {
  payloadJson: string;
  searchText: string;
  mediaRefsJson: string;
  numericValues: readonly [number | null, number | null, number | null];
}

export interface PersistKnowledgeItemInput extends PreparedKnowledgeItem {
  status: KnowledgeItemStatus;
}

export interface PersistKnowledgeItemUpdate extends PreparedKnowledgeItem {
  expectedVersion: number;
}

export interface KnowledgeSearchCandidateInput {
  agentId: string;
  kind: string;
  normalizedQuery: string;
  tokens: readonly string[];
  limit: number;
  numericFilters: readonly KnowledgeNumericFilter[];
}
