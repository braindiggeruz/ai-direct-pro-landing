import { KNOWLEDGE_LIMITS } from './constants';
import {
  KnowledgePayloadTooLargeError,
  KnowledgeValidationError,
  type KnowledgeValidationCode,
} from './errors';
import { normalizeKnowledgeText, tokenizeKnowledgeText } from './normalize';
import {
  KNOWLEDGE_COLLECTION_STATUSES,
  KNOWLEDGE_ITEM_STATUSES,
  type KnowledgeCollectionStatus,
  type KnowledgeItemStatus,
  type KnowledgeNumericFilter,
  type KnowledgePayloadSchema,
  type MediaReference,
  type PreparedKnowledgeItem,
} from './types';

const SAFE_CODE = /^[a-z0-9][a-z0-9._-]*$/;
const COLLECTION_STATUSES = new Set<string>(KNOWLEDGE_COLLECTION_STATUSES);
const ITEM_STATUSES = new Set<string>(KNOWLEDGE_ITEM_STATUSES);

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function requireString(
  value: unknown,
  code: KnowledgeValidationCode,
  maxLength: number,
): string {
  if (typeof value !== 'string') throw new KnowledgeValidationError(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || hasControlCharacters(normalized)) {
    throw new KnowledgeValidationError(code);
  }
  return normalized;
}

export function requireKnowledgeOrgId(value: unknown): string {
  return requireString(value, 'invalid_org_id', KNOWLEDGE_LIMITS.idLength);
}

export function requireKnowledgeCollectionId(value: unknown): string {
  return requireString(value, 'invalid_collection_id', KNOWLEDGE_LIMITS.idLength);
}

export function requireKnowledgeItemId(value: unknown): string {
  return requireString(value, 'invalid_item_id', KNOWLEDGE_LIMITS.idLength);
}

function requireSafeCode(
  value: unknown,
  code: KnowledgeValidationCode,
  maxLength: number,
): string {
  const normalized = requireString(value, code, maxLength).toLowerCase();
  if (!SAFE_CODE.test(normalized)) throw new KnowledgeValidationError(code);
  return normalized;
}

export function requireKnowledgeAgentId(value: unknown): string {
  return requireSafeCode(value, 'invalid_agent_id', KNOWLEDGE_LIMITS.agentIdLength);
}

export function requireKnowledgeKind(value: unknown): string {
  return requireSafeCode(value, 'invalid_kind', KNOWLEDGE_LIMITS.kindLength);
}

export function requireKnowledgeSchemaVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 1_000_000) {
    throw new KnowledgeValidationError('invalid_schema_version');
  }
  return Number(value);
}

export function normalizeKnowledgeCollectionName(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = requireString(
    value,
    'invalid_name',
    KNOWLEDGE_LIMITS.collectionNameLength,
  ).replace(/\s+/g, ' ');
  return normalized;
}

export function requireKnowledgeCollectionStatus(
  value: unknown,
): KnowledgeCollectionStatus {
  if (typeof value !== 'string' || !COLLECTION_STATUSES.has(value)) {
    throw new KnowledgeValidationError('invalid_status');
  }
  return value as KnowledgeCollectionStatus;
}

export function requireKnowledgeItemStatus(value: unknown): KnowledgeItemStatus {
  if (typeof value !== 'string' || !ITEM_STATUSES.has(value)) {
    throw new KnowledgeValidationError('invalid_status');
  }
  return value as KnowledgeItemStatus;
}

export function requireKnowledgeVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new KnowledgeValidationError('invalid_version');
  }
  return Number(value);
}

export function requireKnowledgeLimit(value: unknown, fallback = 20): number {
  const candidate = value === undefined ? fallback : value;
  if (
    !Number.isInteger(candidate)
    || Number(candidate) < 1
    || Number(candidate) > KNOWLEDGE_LIMITS.resultLimit
  ) {
    throw new KnowledgeValidationError('invalid_limit');
  }
  return Number(candidate);
}

function requireMediaCode(value: unknown): string {
  return requireSafeCode(
    value,
    'invalid_media_refs',
    KNOWLEDGE_LIMITS.agentIdLength,
  );
}

function requireMediaValue(value: unknown): string {
  return requireString(
    value,
    'invalid_media_refs',
    KNOWLEDGE_LIMITS.mediaRefValueLength,
  );
}

export function validateMediaReferences(
  refs: readonly MediaReference[],
): readonly MediaReference[] {
  if (!Array.isArray(refs) || refs.length > KNOWLEDGE_LIMITS.mediaRefCount) {
    throw new KnowledgeValidationError('invalid_media_refs');
  }
  return refs.map((reference) => {
    if (!reference || typeof reference !== 'object') {
      throw new KnowledgeValidationError('invalid_media_refs');
    }
    if (reference.source === 'channel') {
      return {
        source: 'channel',
        channel: requireMediaCode(reference.channel),
        ref: requireMediaValue(reference.ref),
      };
    }
    if (reference.source === 'store') {
      return {
        source: 'store',
        store: requireMediaCode(reference.store),
        key: requireMediaValue(reference.key),
      };
    }
    throw new KnowledgeValidationError('invalid_media_refs');
  });
}

function validateJsonValue(
  value: unknown,
  seen: Set<object>,
  depth = 0,
): void {
  if (depth > 20) throw new KnowledgeValidationError('invalid_payload');
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new KnowledgeValidationError('invalid_payload');
    return;
  }
  if (typeof value !== 'object' || ArrayBuffer.isView(value)) {
    throw new KnowledgeValidationError('invalid_payload');
  }
  if (seen.has(value)) throw new KnowledgeValidationError('invalid_payload');
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) validateJsonValue(item, seen, depth + 1);
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new KnowledgeValidationError('invalid_payload');
    }
    for (const item of Object.values(value as Record<string, unknown>)) {
      validateJsonValue(item, seen, depth + 1);
    }
  }
  seen.delete(value);
}

function serializePayload(value: unknown): string {
  validateJsonValue(value, new Set<object>());
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new KnowledgeValidationError('invalid_payload');
  }
  if (new TextEncoder().encode(serialized).byteLength > KNOWLEDGE_LIMITS.payloadBytes) {
    throw new KnowledgePayloadTooLargeError();
  }
  return serialized;
}

function normalizeNumericValues(
  values: readonly (number | null | undefined)[],
): readonly [number | null, number | null, number | null] {
  if (!Array.isArray(values) || values.length > 3) {
    throw new KnowledgeValidationError('invalid_numeric_values');
  }
  const normalized: [number | null, number | null, number | null] = [
    null,
    null,
    null,
  ];
  values.forEach((value, index) => {
    if (value === undefined || value === null) return;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new KnowledgeValidationError('invalid_numeric_values');
    }
    normalized[index] = value;
  });
  return normalized;
}

export function prepareKnowledgePayload<T>(
  input: unknown,
  schema: KnowledgePayloadSchema<T>,
): { value: T; prepared: PreparedKnowledgeItem } {
  let value: T;
  try {
    value = schema.validate(input);
  } catch {
    throw new KnowledgeValidationError('invalid_payload');
  }
  const payloadJson = serializePayload(value);

  let projectedText: string;
  try {
    projectedText = schema.toSearchText(value);
  } catch {
    throw new KnowledgeValidationError('invalid_search_text');
  }
  if (typeof projectedText !== 'string') {
    throw new KnowledgeValidationError('invalid_search_text');
  }
  const searchText = normalizeKnowledgeText(projectedText);
  if (!searchText || searchText.length > KNOWLEDGE_LIMITS.searchTextLength) {
    throw new KnowledgeValidationError('invalid_search_text');
  }

  let mediaRefs: readonly MediaReference[];
  let numericValues: readonly (number | null | undefined)[];
  try {
    mediaRefs = schema.toMediaRefs?.(value) ?? [];
    numericValues = schema.toNumericValues?.(value) ?? [];
  } catch {
    throw new KnowledgeValidationError('invalid_payload');
  }
  const safeMediaRefs = validateMediaReferences(mediaRefs);
  const safeNumericValues = normalizeNumericValues(numericValues);
  return {
    value,
    prepared: {
      payloadJson,
      searchText,
      mediaRefsJson: JSON.stringify(safeMediaRefs),
      numericValues: safeNumericValues,
    },
  };
}

export function validateKnowledgeQuery(value: unknown): {
  normalized: string;
  tokens: readonly string[];
} {
  if (typeof value !== 'string' || value.length > KNOWLEDGE_LIMITS.queryLength) {
    throw new KnowledgeValidationError('invalid_query');
  }
  const normalized = normalizeKnowledgeText(value);
  const tokens = tokenizeKnowledgeText(normalized);
  if (!normalized || tokens.length === 0 || tokens.length > KNOWLEDGE_LIMITS.queryTokens) {
    throw new KnowledgeValidationError('invalid_query');
  }
  return { normalized, tokens };
}

export function validateNumericFilters(
  filters: readonly KnowledgeNumericFilter[] | undefined,
): readonly KnowledgeNumericFilter[] {
  if (filters === undefined) return [];
  if (!Array.isArray(filters) || filters.length > 3) {
    throw new KnowledgeValidationError('invalid_numeric_values');
  }
  const seen = new Set<number>();
  return filters.map((filter) => {
    if (
      !filter
      || !Number.isInteger(filter.index)
      || filter.index < 1
      || filter.index > 3
      || seen.has(filter.index)
      || (filter.min !== undefined && !Number.isFinite(filter.min))
      || (filter.max !== undefined && !Number.isFinite(filter.max))
      || (filter.min !== undefined
        && filter.max !== undefined
        && filter.min > filter.max)
    ) {
      throw new KnowledgeValidationError('invalid_numeric_values');
    }
    seen.add(filter.index);
    return { ...filter };
  });
}
