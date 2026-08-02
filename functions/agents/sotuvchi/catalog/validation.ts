import {
  normalizeKnowledgeText,
  tokenizeKnowledgeText,
} from '../../../platform/knowledge';
import {
  CATALOG_AVAILABILITIES,
  CATALOG_CATEGORY_STATUSES,
  CATALOG_PRODUCT_STATUSES,
  type CatalogAvailability,
  type CatalogCategoryStatus,
  type CatalogOwnerSeed,
  type CatalogProductSpecification,
  type CatalogProductStatus,
  type CreateCatalogCategoryInput,
  type CreateCatalogProductInput,
  type ListCatalogProductsFilter,
  type StoreOwnerContext,
  type StorefrontContext,
  type UpdateCatalogCategoryInput,
  type UpdateCatalogProductInput,
} from './types';
import { CatalogValidationError } from './errors';

export const CATALOG_LIMITS = Object.freeze({
  idLength: 120,
  nameLength: 120,
  descriptionLength: 600,
  skuLength: 64,
  mediaRefLength: 240,
  mediaRefCount: 5,
  searchTermLength: 60,
  searchTermCount: 12,
  specificationCount: 12,
  specificationLabelLength: 40,
  specificationValueLength: 100,
  priceMinor: 1_000_000_000_000,
  sortOrder: 1_000_000,
  queryLength: 120,
  queryTokens: 8,
  resultLimit: 20,
  productLimit: 100,
});

const CATEGORY_STATUSES = new Set<string>(CATALOG_CATEGORY_STATUSES);
const PRODUCT_STATUSES = new Set<string>(CATALOG_PRODUCT_STATUSES);
const AVAILABILITIES = new Set<string>(CATALOG_AVAILABILITIES);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SAFE_SKU = /^[A-Z0-9][A-Z0-9._/-]*$/;
const SAFE_MEDIA_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SAFE_SPEC_KEY = /^[a-z][a-z0-9_]{0,31}$/;
const CATEGORY_SLUG = /^c-[a-z2-7]{16}$/;
const BOT_USERNAME = /^[a-z][a-z0-9_]{4,31}$/;

const OWNER_SEED_KEYS = new Set([
  'identityId',
  'orgId',
  'requestId',
  'locale',
]);
const OWNER_CONTEXT_KEYS = new Set([
  'identityId',
  'orgId',
  'storeId',
  'requestId',
  'locale',
]);
const STOREFRONT_CONTEXT_KEYS = new Set([
  'orgId',
  'storeId',
  'agentId',
  'locale',
]);
const CATEGORY_CREATE_KEYS = new Set(['name', 'sortOrder']);
const CATEGORY_UPDATE_KEYS = new Set(['name', 'sortOrder']);
const PRODUCT_CREATE_KEYS = new Set([
  'categoryId',
  'sku',
  'name',
  'description',
  'priceMinor',
  'currency',
  'availability',
  'mediaRefs',
  'searchTerms',
  'specifications',
]);
const PRODUCT_UPDATE_KEYS = new Set([
  'categoryId',
  'sku',
  'name',
  'description',
  'priceMinor',
  'currency',
  'availability',
  'mediaRefs',
  'searchTerms',
  'specifications',
]);
const PRODUCT_FILTER_KEYS = new Set(['status', 'categoryId', 'limit']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  return Object.keys(value).length === expected.size
    && hasOnlyKeys(value, expected);
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function normalizedText(
  value: unknown,
  code: 'invalid_name' | 'invalid_description',
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== 'string') throw new CatalogValidationError(code);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (
    normalized.length < minimum
    || normalized.length > maximum
    || hasControlCharacters(normalized)
  ) {
    throw new CatalogValidationError(code);
  }
  return normalized;
}

export function requireCatalogId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new CatalogValidationError('invalid_id');
  }
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > CATALOG_LIMITS.idLength
    || !SAFE_ID.test(normalized)
  ) {
    throw new CatalogValidationError('invalid_id');
  }
  return normalized;
}

function requireLocale(value: unknown): 'ru' | 'uz' {
  if (value !== 'ru' && value !== 'uz') {
    throw new CatalogValidationError('invalid_context');
  }
  return value;
}

export function normalizeCatalogOwnerSeed(
  value: unknown,
): CatalogOwnerSeed {
  if (!isPlainObject(value) || !hasExactKeys(value, OWNER_SEED_KEYS)) {
    throw new CatalogValidationError('invalid_context');
  }
  return {
    identityId: requireCatalogId(value.identityId),
    orgId: requireCatalogId(value.orgId),
    requestId: requireCatalogId(value.requestId),
    locale: requireLocale(value.locale),
  };
}

export function normalizeStoreOwnerContext(
  value: unknown,
): StoreOwnerContext {
  if (!isPlainObject(value) || !hasExactKeys(value, OWNER_CONTEXT_KEYS)) {
    throw new CatalogValidationError('invalid_context');
  }
  return {
    identityId: requireCatalogId(value.identityId),
    orgId: requireCatalogId(value.orgId),
    storeId: requireCatalogId(value.storeId),
    requestId: requireCatalogId(value.requestId),
    locale: requireLocale(value.locale),
  };
}

export function normalizeStorefrontContext(
  value: unknown,
): StorefrontContext {
  if (
    !isPlainObject(value)
    || !hasExactKeys(value, STOREFRONT_CONTEXT_KEYS)
    || value.agentId !== 'sotuvchi'
  ) {
    throw new CatalogValidationError('invalid_context');
  }
  return {
    orgId: requireCatalogId(value.orgId),
    storeId: requireCatalogId(value.storeId),
    agentId: 'sotuvchi',
    locale: requireLocale(value.locale),
  };
}

export function normalizeCategoryName(value: unknown): string {
  const normalized = normalizedText(
    value,
    'invalid_name',
    2,
    CATALOG_LIMITS.nameLength,
  );
  if (/^(?:https?:\/\/|www\.)\S+$/iu.test(normalized)) {
    throw new CatalogValidationError('invalid_name');
  }
  return normalized;
}

export function requireCategorySlug(value: unknown): string {
  if (typeof value !== 'string' || !CATEGORY_SLUG.test(value)) {
    throw new CatalogValidationError('invalid_slug');
  }
  return value;
}

export function normalizeSortOrder(value: unknown, fallback = 0): number {
  const candidate = value === undefined ? fallback : value;
  if (
    !Number.isInteger(candidate)
    || Number(candidate) < 0
    || Number(candidate) > CATALOG_LIMITS.sortOrder
  ) {
    throw new CatalogValidationError('invalid_sort_order');
  }
  return Number(candidate);
}

export function normalizeCreateCategoryInput(
  value: unknown,
): CreateCatalogCategoryInput {
  if (
    !isPlainObject(value)
    || !hasOnlyKeys(value, CATEGORY_CREATE_KEYS)
    || !Object.hasOwn(value, 'name')
  ) {
    throw new CatalogValidationError('invalid_name');
  }
  return {
    name: normalizeCategoryName(value.name),
    ...(value.sortOrder === undefined
      ? {}
      : { sortOrder: normalizeSortOrder(value.sortOrder) }),
  };
}

export function normalizeUpdateCategoryInput(
  value: unknown,
): UpdateCatalogCategoryInput {
  if (
    !isPlainObject(value)
    || !hasOnlyKeys(value, CATEGORY_UPDATE_KEYS)
    || Object.keys(value).length === 0
  ) {
    throw new CatalogValidationError('invalid_patch');
  }
  return {
    ...(value.name === undefined
      ? {}
      : { name: normalizeCategoryName(value.name) }),
    ...(value.sortOrder === undefined
      ? {}
      : { sortOrder: normalizeSortOrder(value.sortOrder) }),
  };
}

export function normalizeProductName(value: unknown): string {
  const normalized = normalizedText(
    value,
    'invalid_name',
    2,
    CATALOG_LIMITS.nameLength,
  );
  if (/^(?:https?:\/\/|www\.)\S+$/iu.test(normalized)) {
    throw new CatalogValidationError('invalid_name');
  }
  return normalized;
}

export function normalizeProductDescription(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return normalizedText(
    value,
    'invalid_description',
    1,
    CATALOG_LIMITS.descriptionLength,
  );
}

export function normalizePriceMinor(value: unknown): number {
  if (
    !Number.isInteger(value)
    || Number(value) < 0
    || Number(value) > CATALOG_LIMITS.priceMinor
  ) {
    throw new CatalogValidationError('invalid_price');
  }
  return Number(value);
}

export function normalizeCurrency(value: unknown): 'UZS' {
  if (value !== 'UZS') throw new CatalogValidationError('invalid_currency');
  return 'UZS';
}

export function normalizeAvailability(
  value: unknown,
): CatalogAvailability {
  if (typeof value !== 'string' || !AVAILABILITIES.has(value)) {
    throw new CatalogValidationError('invalid_availability');
  }
  return value as CatalogAvailability;
}

export function normalizeCategoryStatus(
  value: unknown,
): CatalogCategoryStatus {
  if (typeof value !== 'string' || !CATEGORY_STATUSES.has(value)) {
    throw new CatalogValidationError('invalid_status');
  }
  return value as CatalogCategoryStatus;
}

export function normalizeProductStatus(
  value: unknown,
): CatalogProductStatus {
  if (typeof value !== 'string' || !PRODUCT_STATUSES.has(value)) {
    throw new CatalogValidationError('invalid_status');
  }
  return value as CatalogProductStatus;
}

export function normalizeSku(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new CatalogValidationError('invalid_sku');
  }
  const normalized = value.trim().toUpperCase();
  if (
    !normalized
    || normalized.length > CATALOG_LIMITS.skuLength
    || !SAFE_SKU.test(normalized)
  ) {
    throw new CatalogValidationError('invalid_sku');
  }
  return normalized;
}

export function normalizeMediaRefs(value: unknown): readonly string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value)
    || value.length > CATALOG_LIMITS.mediaRefCount
  ) {
    throw new CatalogValidationError('invalid_media_refs');
  }
  const refs = value.map((reference) => {
    if (
      typeof reference !== 'string'
      || reference.length === 0
      || reference.length > CATALOG_LIMITS.mediaRefLength
      || !SAFE_MEDIA_REF.test(reference)
    ) {
      throw new CatalogValidationError('invalid_media_refs');
    }
    return reference;
  });
  if (new Set(refs).size !== refs.length) {
    throw new CatalogValidationError('invalid_media_refs');
  }
  return refs;
}

export function normalizeSearchTerms(value: unknown): readonly string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value)
    || value.length > CATALOG_LIMITS.searchTermCount
  ) {
    throw new CatalogValidationError('invalid_patch');
  }
  const terms = value.map((term) =>
    normalizedText(
      term,
      'invalid_description',
      1,
      CATALOG_LIMITS.searchTermLength,
    ));
  const normalized = terms.map((term) => normalizeKnowledgeText(term));
  if (
    normalized.some((term) => !term)
    || new Set(normalized).size !== normalized.length
  ) {
    throw new CatalogValidationError('invalid_patch');
  }
  return terms;
}

export function normalizeProductSpecifications(
  value: unknown,
): readonly CatalogProductSpecification[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value)
    || value.length > CATALOG_LIMITS.specificationCount
  ) {
    throw new CatalogValidationError('invalid_patch');
  }
  const specifications = value.map((item) => {
    if (
      !isPlainObject(item)
      || !hasExactKeys(
        item,
        new Set(['key', 'labelRu', 'labelUz', 'value']),
      )
      || typeof item.key !== 'string'
      || !SAFE_SPEC_KEY.test(item.key)
    ) {
      throw new CatalogValidationError('invalid_patch');
    }
    return {
      key: item.key,
      labelRu: normalizedText(
        item.labelRu,
        'invalid_description',
        1,
        CATALOG_LIMITS.specificationLabelLength,
      ),
      labelUz: normalizedText(
        item.labelUz,
        'invalid_description',
        1,
        CATALOG_LIMITS.specificationLabelLength,
      ),
      value: normalizedText(
        item.value,
        'invalid_description',
        1,
        CATALOG_LIMITS.specificationValueLength,
      ),
    };
  });
  if (
    new Set(specifications.map((specification) => specification.key)).size
      !== specifications.length
  ) {
    throw new CatalogValidationError('invalid_patch');
  }
  return specifications;
}

function optionalCategoryId(value: unknown): string | null {
  return value === undefined || value === null ? null : requireCatalogId(value);
}

export function normalizeCreateProductInput(
  value: unknown,
): CreateCatalogProductInput {
  if (
    !isPlainObject(value)
    || !hasOnlyKeys(value, PRODUCT_CREATE_KEYS)
    || !Object.hasOwn(value, 'name')
    || !Object.hasOwn(value, 'priceMinor')
    || !Object.hasOwn(value, 'currency')
    || !Object.hasOwn(value, 'availability')
  ) {
    throw new CatalogValidationError('invalid_patch');
  }
  return {
    categoryId: optionalCategoryId(value.categoryId),
    sku: normalizeSku(value.sku),
    name: normalizeProductName(value.name),
    description: normalizeProductDescription(value.description),
    priceMinor: normalizePriceMinor(value.priceMinor),
    currency: normalizeCurrency(value.currency),
    availability: normalizeAvailability(value.availability),
    mediaRefs: normalizeMediaRefs(value.mediaRefs),
    searchTerms: normalizeSearchTerms(value.searchTerms),
    specifications: normalizeProductSpecifications(value.specifications),
  };
}

export function normalizeUpdateProductInput(
  value: unknown,
): UpdateCatalogProductInput {
  if (
    !isPlainObject(value)
    || !hasOnlyKeys(value, PRODUCT_UPDATE_KEYS)
    || Object.keys(value).length === 0
  ) {
    throw new CatalogValidationError('invalid_patch');
  }
  return {
    ...(Object.hasOwn(value, 'categoryId')
      ? { categoryId: optionalCategoryId(value.categoryId) }
      : {}),
    ...(Object.hasOwn(value, 'sku')
      ? { sku: normalizeSku(value.sku) }
      : {}),
    ...(Object.hasOwn(value, 'name')
      ? { name: normalizeProductName(value.name) }
      : {}),
    ...(Object.hasOwn(value, 'description')
      ? { description: normalizeProductDescription(value.description) }
      : {}),
    ...(Object.hasOwn(value, 'priceMinor')
      ? { priceMinor: normalizePriceMinor(value.priceMinor) }
      : {}),
    ...(Object.hasOwn(value, 'currency')
      ? { currency: normalizeCurrency(value.currency) }
      : {}),
    ...(Object.hasOwn(value, 'availability')
      ? { availability: normalizeAvailability(value.availability) }
      : {}),
    ...(Object.hasOwn(value, 'mediaRefs')
      ? { mediaRefs: normalizeMediaRefs(value.mediaRefs) }
      : {}),
    ...(Object.hasOwn(value, 'searchTerms')
      ? { searchTerms: normalizeSearchTerms(value.searchTerms) }
      : {}),
    ...(Object.hasOwn(value, 'specifications')
      ? {
          specifications: normalizeProductSpecifications(
            value.specifications,
          ),
        }
      : {}),
  };
}

export function requireProductVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new CatalogValidationError('invalid_version');
  }
  return Number(value);
}

export function normalizeProductFilter(
  value: unknown,
): ListCatalogProductsFilter {
  if (
    value === undefined
    || !isPlainObject(value)
    || !hasOnlyKeys(value, PRODUCT_FILTER_KEYS)
  ) {
    if (value === undefined) return {};
    throw new CatalogValidationError('invalid_filter');
  }
  return {
    ...(value.status === undefined
      ? {}
      : { status: normalizeProductStatus(value.status) }),
    ...(Object.hasOwn(value, 'categoryId')
      ? { categoryId: optionalCategoryId(value.categoryId) }
      : {}),
    ...(value.limit === undefined
      ? {}
      : { limit: requireCatalogOwnerLimit(value.limit) }),
  };
}

export function requireCatalogLimit(value: unknown, fallback = 10): number {
  const candidate = value === undefined ? fallback : value;
  if (
    !Number.isInteger(candidate)
    || Number(candidate) < 1
    || Number(candidate) > CATALOG_LIMITS.resultLimit
  ) {
    throw new CatalogValidationError('invalid_limit');
  }
  return Number(candidate);
}

/**
 * Listing bound for the store owner's own catalog.
 *
 * A shopper's result page stays at `resultLimit` — twenty ranked rows is a
 * screenful and anything larger is a scraping surface. The owner is reading the
 * inventory they typed in themselves, so the bound is the catalog size instead.
 */
export function requireCatalogOwnerLimit(value: unknown, fallback = 10): number {
  const candidate = value === undefined ? fallback : value;
  if (
    !Number.isInteger(candidate)
    || Number(candidate) < 1
    || Number(candidate) > CATALOG_LIMITS.productLimit
  ) {
    throw new CatalogValidationError('invalid_limit');
  }
  return Number(candidate);
}

export function normalizeCatalogQuery(value: unknown): {
  normalized: string;
  tokens: readonly string[];
} {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > CATALOG_LIMITS.queryLength
  ) {
    throw new CatalogValidationError('invalid_query');
  }
  const normalized = normalizeKnowledgeText(value);
  const tokens = tokenizeKnowledgeText(normalized);
  if (
    !normalized
    || tokens.length === 0
    || tokens.length > CATALOG_LIMITS.queryTokens
  ) {
    throw new CatalogValidationError('invalid_query');
  }
  return { normalized, tokens };
}

export function normalizedProductName(value: string): string {
  const normalized = normalizeKnowledgeText(normalizeProductName(value));
  if (!normalized) throw new CatalogValidationError('invalid_name');
  return normalized;
}

export function requireBotUsername(value: unknown): string {
  if (typeof value !== 'string' || !BOT_USERNAME.test(value)) {
    throw new CatalogValidationError('invalid_context');
  }
  return value;
}
