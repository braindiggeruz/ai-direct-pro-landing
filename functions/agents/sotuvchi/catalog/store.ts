import type { Locale } from '../../../platform/contracts';
import type {
  BuyerCatalogCategory,
  CatalogCategory,
  CatalogComparisonCandidate,
  CatalogPresentation,
  CatalogProduct,
  CatalogProductCandidate,
  CatalogRelevanceReason,
  CatalogProductStatus,
  ListCatalogProductsFilter,
  StorefrontContext,
  StorefrontSelection,
  StorefrontSession,
} from './types';
import { CATALOG_RELEVANCE_REASONS } from './types';
import { CatalogPersistenceError } from './errors';
import {
  normalizeAvailability,
  normalizeCategoryName,
  normalizeCategoryStatus,
  normalizeCurrency,
  normalizeMediaRefs,
  normalizePriceMinor,
  normalizeProductDescription,
  normalizeProductSpecifications,
  normalizedProductName,
  normalizeProductName,
  normalizeProductStatus,
  normalizeSearchTerms,
  normalizeSku,
  normalizeSortOrder,
  requireBotUsername,
  requireCatalogId,
  requireCategorySlug,
  requireProductVersion,
} from './validation';
import { normalizeStoreName } from '../onboarding/validation';

const CATEGORY_COLUMNS =
  'id, org_id, store_id, name, slug, status, sort_order, created_at, updated_at';
const PRODUCT_COLUMNS =
  'id, org_id, store_id, category_id, sku, name, normalized_name, '
  + 'description, price_minor, currency, availability, status, '
  + 'media_refs_json, search_terms_json, specifications_json, '
  + 'version, created_at, updated_at';
const SESSION_COLUMNS =
  'id, bot_username, identity_id, org_id, store_id, status, '
  + 'last_product_id, last_intent, selection_request_key, selected_at, '
  + 'preferred_locale, pending_intent, pending_request_key, pending_at, '
  + 'created_at, updated_at';

interface CategoryRow {
  id: string;
  org_id: string;
  store_id: string;
  name: string;
  slug: string;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface ProductRow {
  id: string;
  org_id: string;
  store_id: string;
  category_id: string | null;
  sku: string | null;
  name: string;
  normalized_name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  availability: string;
  status: string;
  media_refs_json: string;
  search_terms_json: string;
  specifications_json: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface CandidateRow extends ProductRow {
  category_name: string | null;
  store_name: string;
}

interface ComparisonCandidateRow extends CandidateRow {
  position: number;
  relevance_score: number;
  matched_requirement_count: number;
  missing_requirement_count: number;
  relevance_reason: string;
}

interface SessionRow {
  id: string;
  bot_username: string;
  identity_id: string;
  org_id: string;
  store_id: string;
  status: string;
  last_product_id: string | null;
  last_intent: string | null;
  selection_request_key: string | null;
  selected_at: string | null;
  preferred_locale: string | null;
  pending_intent: string | null;
  pending_request_key: string | null;
  pending_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CatalogOperationRecord {
  orgId: string;
  storeId: string;
  idempotencyKey: string;
  operation: string;
  fingerprint: string;
  targetId: string;
  resultVersion: number | null;
  createdAt: string;
}

export interface CatalogOwnerStore {
  id: string;
  orgId: string;
  name: string;
  locale: Locale;
}

export interface CatalogOperationInput {
  idempotencyKey: string;
  operation: string;
  fingerprint: string;
  createdAt: string;
}

export interface CatalogCategoryWrite {
  id: string;
  orgId: string;
  storeId: string;
  name: string;
  slug: string;
  status: 'active' | 'archived';
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogProductWrite {
  id: string;
  orgId: string;
  storeId: string;
  categoryId: string | null;
  sku: string | null;
  name: string;
  normalizedName: string;
  description: string | null;
  priceMinor: number;
  currency: 'UZS';
  availability: 'available' | 'unavailable' | 'preorder';
  status: CatalogProductStatus;
  mediaRefs: readonly string[];
  searchTerms: readonly string[];
  specifications: CatalogProduct['specifications'];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type ComparisonAddOutcome =
  | 'added'
  | 'duplicate'
  | 'full'
  | 'not_found';

export interface CatalogStore {
  findOwnedActiveStore(
    orgId: string,
    identityId: string,
  ): Promise<CatalogOwnerStore | null>;
  findActiveStoreByOrg(orgId: string): Promise<CatalogOwnerStore | null>;
  findActiveStore(orgId: string, storeId: string): Promise<CatalogOwnerStore | null>;
  isPilotActive(orgId: string, storeId: string): Promise<boolean>;
  getOperation(
    orgId: string,
    storeId: string,
    idempotencyKey: string,
  ): Promise<CatalogOperationRecord | null>;
  getCategory(
    orgId: string,
    storeId: string,
    categoryId: string,
  ): Promise<CatalogCategory | null>;
  listCategories(
    orgId: string,
    storeId: string,
    includeArchived?: boolean,
  ): Promise<CatalogCategory[]>;
  categorySlugExists(
    orgId: string,
    storeId: string,
    slug: string,
  ): Promise<boolean>;
  createCategory(
    ownerIdentityId: string,
    category: CatalogCategoryWrite,
    operation: CatalogOperationInput,
  ): Promise<readonly [number, number]>;
  updateCategory(
    ownerIdentityId: string,
    category: CatalogCategoryWrite,
    operation: CatalogOperationInput,
  ): Promise<readonly [number, number]>;
  archiveCategory(
    ownerIdentityId: string,
    category: CatalogCategory,
    operation: CatalogOperationInput,
  ): Promise<readonly [number, number]>;
  getProduct(
    orgId: string,
    storeId: string,
    productId: string,
  ): Promise<CatalogProduct | null>;
  listProducts(
    orgId: string,
    storeId: string,
    filter: ListCatalogProductsFilter,
  ): Promise<CatalogProduct[]>;
  productSkuExists(
    orgId: string,
    storeId: string,
    sku: string,
    excludingId?: string,
  ): Promise<boolean>;
  countCurrentProducts(orgId: string, storeId: string): Promise<number>;
  createProduct(
    ownerIdentityId: string,
    product: CatalogProductWrite,
    operation: CatalogOperationInput,
  ): Promise<readonly [number, number]>;
  updateProduct(
    ownerIdentityId: string,
    product: CatalogProductWrite,
    expectedVersion: number,
    operation: CatalogOperationInput,
  ): Promise<readonly [number, number]>;
  setProductStatus(
    ownerIdentityId: string,
    product: CatalogProduct,
    status: CatalogProductStatus,
    expectedVersion: number,
    operation: CatalogOperationInput,
  ): Promise<readonly [number, number]>;
  findPublishedCandidates(
    context: StorefrontContext,
    normalizedQuery: string,
    tokens: readonly string[],
  ): Promise<CatalogProductCandidate[]>;
  listPublished(
    context: StorefrontContext,
    limit: number,
  ): Promise<CatalogProductCandidate[]>;
  listPublishedByCategory(
    context: StorefrontContext,
    categoryId: string,
    limit: number,
  ): Promise<CatalogProductCandidate[]>;
  listBuyerCategories(
    context: StorefrontContext,
  ): Promise<BuyerCatalogCategory[]>;
  recordStorefrontPresentation(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
    requestId: string;
    presentations: readonly CatalogPresentation[];
  }): Promise<void>;
  addComparisonProduct(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
    productId: string;
  }): Promise<ComparisonAddOutcome>;
  listComparisonProducts(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
  }): Promise<CatalogComparisonCandidate[]>;
  clearComparisonProducts(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
  }): Promise<void>;
  bindStorefrontSession(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
  }): Promise<StorefrontSession>;
  resolveStorefrontSession(
    botUsername: string,
    identityId: string,
  ): Promise<StorefrontContext | null>;
  setStorefrontLocale(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
    locale: Locale;
  }): Promise<StorefrontContext | null>;
  setPendingBudget(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
    requestId: string;
  }): Promise<boolean>;
  consumePendingBudget(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
  }): Promise<boolean>;
  clearPendingBudget(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
  }): Promise<void>;
  recordStorefrontSelection(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
    productId: string;
    intent: string;
    requestId: string;
  }): Promise<StorefrontSession>;
  resolveStorefrontSelection(
    botUsername: string,
    identityId: string,
  ): Promise<StorefrontSelection | null>;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function fromCategoryRow(row: CategoryRow): CatalogCategory {
  try {
    if (!validDate(row.created_at) || !validDate(row.updated_at)) {
      throw new Error('invalid date');
    }
    return {
      id: requireCatalogId(row.id),
      orgId: requireCatalogId(row.org_id),
      storeId: requireCatalogId(row.store_id),
      name: normalizeCategoryName(row.name),
      slug: requireCategorySlug(row.slug),
      status: normalizeCategoryStatus(row.status),
      sortOrder: normalizeSortOrder(row.sort_order),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    throw new CatalogPersistenceError('corrupt_row');
  }
}

function fromProductRow(row: ProductRow): CatalogProduct {
  try {
    if (!validDate(row.created_at) || !validDate(row.updated_at)) {
      throw new Error('invalid date');
    }
    const name = normalizeProductName(row.name);
    if (normalizedProductName(name) !== row.normalized_name) {
      throw new Error('invalid normalized name');
    }
    return {
      id: requireCatalogId(row.id),
      orgId: requireCatalogId(row.org_id),
      storeId: requireCatalogId(row.store_id),
      categoryId: row.category_id === null
        ? null
        : requireCatalogId(row.category_id),
      sku: normalizeSku(row.sku),
      name,
      description: normalizeProductDescription(row.description),
      priceMinor: normalizePriceMinor(row.price_minor),
      currency: normalizeCurrency(row.currency),
      availability: normalizeAvailability(row.availability),
      status: normalizeProductStatus(row.status),
      mediaRefs: normalizeMediaRefs(JSON.parse(row.media_refs_json)),
      searchTerms: normalizeSearchTerms(JSON.parse(row.search_terms_json)),
      specifications: normalizeProductSpecifications(
        JSON.parse(row.specifications_json),
      ),
      version: requireProductVersion(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    throw new CatalogPersistenceError('corrupt_row');
  }
}

function fromSessionRow(row: SessionRow): StorefrontSession {
  if (
    row.status !== 'active' && row.status !== 'disabled'
    || !validDate(row.created_at)
    || !validDate(row.updated_at)
    || (row.selected_at !== null && !validDate(row.selected_at))
    || (row.pending_at !== null && !validDate(row.pending_at))
    || (
      (row.last_product_id === null) !== (row.last_intent === null)
      || (row.last_product_id === null) !== (row.selected_at === null)
      || (row.last_product_id === null)
        !== (row.selection_request_key === null)
    )
    || (
      (row.pending_intent === null) !== (row.pending_request_key === null)
      || (row.pending_intent === null) !== (row.pending_at === null)
    )
    || (
      row.preferred_locale !== null
      && row.preferred_locale !== 'ru'
      && row.preferred_locale !== 'uz'
    )
    || (row.pending_intent !== null && row.pending_intent !== 'budget')
  ) {
    throw new CatalogPersistenceError('corrupt_row');
  }
  return {
    id: requireCatalogId(row.id),
    botUsername: requireBotUsername(row.bot_username),
    identityId: requireCatalogId(row.identity_id),
    orgId: requireCatalogId(row.org_id),
    storeId: requireCatalogId(row.store_id),
    status: row.status,
    lastProductId: row.last_product_id === null
      ? null
      : requireCatalogId(row.last_product_id),
    lastIntent: row.last_intent === null
      ? null
      : requireSessionCode(row.last_intent, 48),
    selectionRequestKey: row.selection_request_key === null
      ? null
      : requireSessionCode(row.selection_request_key, 160),
    selectedAt: row.selected_at,
    preferredLocale: row.preferred_locale as Locale | null,
    pendingIntent: row.pending_intent as 'budget' | null,
    pendingRequestKey: row.pending_request_key === null
      ? null
      : requireSessionCode(row.pending_request_key, 160),
    pendingAt: row.pending_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireSessionCode(
  value: unknown,
  maxLength: number,
): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > maxLength
    || !/^[a-zA-Z0-9._:-]+$/.test(value)
  ) {
    throw new CatalogPersistenceError('persistence_failed');
  }
  return value;
}

function requireBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new CatalogPersistenceError('corrupt_row');
  }
  return Number(value);
}

function requireRelevanceReason(value: unknown): CatalogRelevanceReason {
  if (
    typeof value !== 'string'
    || !CATALOG_RELEVANCE_REASONS.includes(
      value as CatalogRelevanceReason,
    )
  ) {
    throw new CatalogPersistenceError('corrupt_row');
  }
  return value as CatalogRelevanceReason;
}

function operationChanges(
  results: readonly D1Result<unknown>[],
): readonly [number, number] {
  return [
    Number(results[0]?.meta?.changes ?? 0),
    Number(results[1]?.meta?.changes ?? 0),
  ];
}

function qualified(columns: string, alias: string): string {
  return columns.split(', ').map((column) => `${alias}.${column}`).join(', ');
}

export function createSotuvchiCatalogStore(db: D1Database): CatalogStore {
  async function productRow(
    orgId: string,
    storeId: string,
    productId: string,
  ): Promise<CatalogProduct | null> {
    const row = await db
      .prepare(`SELECT ${PRODUCT_COLUMNS}
                FROM sotuvchi_products
                WHERE org_id = ? AND store_id = ? AND id = ?`)
      .bind(orgId, storeId, productId)
      .first<ProductRow>();
    return row ? fromProductRow(row) : null;
  }

  async function comparisonCandidates(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
  }): Promise<CatalogComparisonCandidate[]> {
    const rows = await db
      .prepare(`SELECT ${qualified(PRODUCT_COLUMNS, 'product')},
                       category.name AS category_name,
                       store.name AS store_name,
                       comparison.position,
                       comparison.relevance_score,
                       comparison.matched_requirement_count,
                       comparison.missing_requirement_count,
                       comparison.relevance_reason
                FROM sotuvchi_buyer_comparisons AS comparison
                JOIN sotuvchi_storefront_sessions AS session
                  ON session.id = comparison.session_id
                 AND session.org_id = comparison.org_id
                 AND session.store_id = comparison.store_id
                 AND session.status = 'active'
                JOIN sotuvchi_products AS product
                  ON product.org_id = comparison.org_id
                 AND product.store_id = comparison.store_id
                 AND product.id = comparison.product_id
                 AND product.status = 'published'
                JOIN sotuvchi_stores AS store
                  ON store.org_id = product.org_id
                 AND store.id = product.store_id
                 AND store.status = 'active'
                LEFT JOIN sotuvchi_categories AS category
                  ON category.org_id = product.org_id
                 AND category.store_id = product.store_id
                 AND category.id = product.category_id
                JOIN telegram_agent_routes AS route
                  ON route.org_id = store.org_id
                 AND route.route_code = store.storefront_code
                 AND route.bot_username = session.bot_username
                 AND route.agent_id = 'sotuvchi'
                 AND route.status = 'active'
                JOIN owner_pilot_stores AS pilot
                  ON pilot.org_id = store.org_id
                 AND pilot.store_id = store.id
                 AND pilot.state = 'active'
                WHERE session.bot_username = ?
                  AND session.identity_id = ?
                  AND session.org_id = ?
                  AND session.store_id = ?
                  AND (product.category_id IS NULL
                    OR category.status = 'active')
                ORDER BY comparison.position ASC, product.id ASC
                LIMIT 3`)
      .bind(
        requireBotUsername(input.botUsername),
        requireCatalogId(input.identityId),
        input.context.orgId,
        input.context.storeId,
      )
      .all<ComparisonCandidateRow>();
    return (rows.results ?? []).map((row) => ({
      product: fromProductRow(row),
      categoryName: row.category_name === null
        ? null
        : normalizeCategoryName(row.category_name),
      storeName: normalizeStoreName(row.store_name),
      normalizedName: row.normalized_name,
      position: requireBoundedInteger(row.position, 1, 1_000_000),
      relevanceScore: requireBoundedInteger(row.relevance_score, 0, 4_000),
      matchedRequirementCount: requireBoundedInteger(
        row.matched_requirement_count,
        0,
        12,
      ),
      missingRequirementCount: requireBoundedInteger(
        row.missing_requirement_count,
        0,
        12,
      ),
      relevanceReason: requireRelevanceReason(row.relevance_reason),
    }));
  }

  return {
    async findOwnedActiveStore(orgId, identityId) {
      const tenantId = requireCatalogId(orgId);
      const actorId = requireCatalogId(identityId);
      const row = await db
        .prepare(`SELECT store.id, store.org_id, store.name, store.locale
                  FROM sotuvchi_stores AS store
                  JOIN memberships AS membership
                    ON membership.org_id = store.org_id
                   AND membership.identity_id = ?
                   AND membership.role = 'owner'
                   AND membership.status = 'active'
                  WHERE store.org_id = ? AND store.status = 'active'`)
        .bind(actorId, tenantId)
        .first<{ id: string; org_id: string; name: string; locale: string }>();
      if (!row) return null;
      if (row.locale !== 'ru' && row.locale !== 'uz') {
        throw new CatalogPersistenceError('corrupt_row');
      }
      return {
        id: requireCatalogId(row.id),
        orgId: requireCatalogId(row.org_id),
        name: normalizeStoreName(row.name),
        locale: row.locale,
      };
    },

    async findActiveStore(orgId, storeId) {
      const tenantId = requireCatalogId(orgId);
      const id = requireCatalogId(storeId);
      const row = await db
        .prepare(`SELECT id, org_id, name, locale
                  FROM sotuvchi_stores
                  WHERE org_id = ? AND id = ? AND status = 'active'`)
        .bind(tenantId, id)
        .first<{ id: string; org_id: string; name: string; locale: string }>();
      if (!row) return null;
      if (row.locale !== 'ru' && row.locale !== 'uz') {
        throw new CatalogPersistenceError('corrupt_row');
      }
      return {
        id: requireCatalogId(row.id),
        orgId: requireCatalogId(row.org_id),
        name: normalizeStoreName(row.name),
        locale: row.locale,
      };
    },

    async findActiveStoreByOrg(orgId) {
      const tenantId = requireCatalogId(orgId);
      const row = await db
        .prepare(`SELECT id, org_id, name, locale
                  FROM sotuvchi_stores
                  WHERE org_id = ? AND status = 'active'`)
        .bind(tenantId)
        .first<{ id: string; org_id: string; name: string; locale: string }>();
      if (!row) return null;
      if (row.locale !== 'ru' && row.locale !== 'uz') {
        throw new CatalogPersistenceError('corrupt_row');
      }
      return {
        id: requireCatalogId(row.id),
        orgId: requireCatalogId(row.org_id),
        name: normalizeStoreName(row.name),
        locale: row.locale,
      };
    },

    async isPilotActive(orgId, storeId) {
      const row = await db
        .prepare(`SELECT 1 AS active
                  FROM owner_pilot_stores
                  WHERE org_id = ? AND store_id = ? AND state = 'active'`)
        .bind(requireCatalogId(orgId), requireCatalogId(storeId))
        .first<{ active: number }>();
      return row?.active === 1;
    },

    async getOperation(orgId, storeId, idempotencyKey) {
      const row = await db
        .prepare(`SELECT org_id, store_id, idempotency_key, operation,
                         fingerprint, target_id, result_version, created_at
                  FROM sotuvchi_catalog_operations
                  WHERE org_id = ? AND store_id = ? AND idempotency_key = ?`)
        .bind(
          requireCatalogId(orgId),
          requireCatalogId(storeId),
          requireCatalogId(idempotencyKey),
        )
        .first<{
          org_id: string;
          store_id: string;
          idempotency_key: string;
          operation: string;
          fingerprint: string;
          target_id: string;
          result_version: number | null;
          created_at: string;
        }>();
      if (!row) return null;
      if (!validDate(row.created_at)) {
        throw new CatalogPersistenceError('corrupt_row');
      }
      return {
        orgId: requireCatalogId(row.org_id),
        storeId: requireCatalogId(row.store_id),
        idempotencyKey: requireCatalogId(row.idempotency_key),
        operation: requireCatalogId(row.operation),
        fingerprint: requireCatalogId(row.fingerprint),
        targetId: requireCatalogId(row.target_id),
        resultVersion: row.result_version === null
          ? null
          : requireProductVersion(row.result_version),
        createdAt: row.created_at,
      };
    },

    async getCategory(orgId, storeId, categoryId) {
      const row = await db
        .prepare(`SELECT ${CATEGORY_COLUMNS}
                  FROM sotuvchi_categories
                  WHERE org_id = ? AND store_id = ? AND id = ?`)
        .bind(
          requireCatalogId(orgId),
          requireCatalogId(storeId),
          requireCatalogId(categoryId),
        )
        .first<CategoryRow>();
      return row ? fromCategoryRow(row) : null;
    },

    async listCategories(orgId, storeId, includeArchived = false) {
      const rows = await db
        .prepare(`SELECT ${CATEGORY_COLUMNS}
                  FROM sotuvchi_categories
                  WHERE org_id = ? AND store_id = ?
                    AND (? = 1 OR status = 'active')
                  ORDER BY sort_order ASC, name ASC, id ASC`)
        .bind(
          requireCatalogId(orgId),
          requireCatalogId(storeId),
          includeArchived ? 1 : 0,
        )
        .all<CategoryRow>();
      return (rows.results ?? []).map(fromCategoryRow);
    },

    async categorySlugExists(orgId, storeId, slug) {
      const row = await db
        .prepare(`SELECT 1 AS found FROM sotuvchi_categories
                  WHERE org_id = ? AND store_id = ? AND slug = ?`)
        .bind(
          requireCatalogId(orgId),
          requireCatalogId(storeId),
          requireCategorySlug(slug),
        )
        .first<{ found: number }>();
      return row?.found === 1;
    },

    async createCategory(ownerIdentityId, category, operation) {
      const results = await db.batch([
        db.prepare(`INSERT INTO sotuvchi_categories
          (id, org_id, store_id, name, slug, status, sort_order,
           last_operation_key, created_at, updated_at)
          SELECT ?, store.org_id, store.id, ?, ?, 'active', ?, ?, ?, ?
          FROM sotuvchi_stores AS store
          JOIN memberships AS membership
            ON membership.org_id = store.org_id
           AND membership.identity_id = ?
           AND membership.role = 'owner'
           AND membership.status = 'active'
          WHERE store.org_id = ? AND store.id = ? AND store.status = 'active'`)
          .bind(
            category.id,
            category.name,
            category.slug,
            category.sortOrder,
            operation.idempotencyKey,
            category.createdAt,
            category.updatedAt,
            requireCatalogId(ownerIdentityId),
            category.orgId,
            category.storeId,
          ),
        db.prepare(`INSERT INTO sotuvchi_catalog_operations
          (org_id, store_id, idempotency_key, operation, fingerprint,
           target_id, result_version, created_at)
          SELECT org_id, store_id, ?, ?, ?, id, NULL, ?
          FROM sotuvchi_categories
          WHERE org_id = ? AND store_id = ? AND id = ?
            AND last_operation_key = ?`)
          .bind(
            operation.idempotencyKey,
            operation.operation,
            operation.fingerprint,
            operation.createdAt,
            category.orgId,
            category.storeId,
            category.id,
            operation.idempotencyKey,
          ),
      ]);
      return operationChanges(results);
    },

    async updateCategory(ownerIdentityId, category, operation) {
      const results = await db.batch([
        db.prepare(`UPDATE sotuvchi_categories
                    SET name = ?, sort_order = ?, last_operation_key = ?,
                        updated_at = ?
                    WHERE org_id = ? AND store_id = ? AND id = ?
                      AND status = 'active'
                      AND EXISTS (
                        SELECT 1 FROM sotuvchi_stores AS store
                        JOIN memberships AS membership
                          ON membership.org_id = store.org_id
                         AND membership.identity_id = ?
                         AND membership.role = 'owner'
                         AND membership.status = 'active'
                        WHERE store.org_id = ? AND store.id = ?
                          AND store.status = 'active'
                      )`)
          .bind(
            category.name,
            category.sortOrder,
            operation.idempotencyKey,
            category.updatedAt,
            category.orgId,
            category.storeId,
            category.id,
            requireCatalogId(ownerIdentityId),
            category.orgId,
            category.storeId,
          ),
        db.prepare(`INSERT INTO sotuvchi_catalog_operations
          (org_id, store_id, idempotency_key, operation, fingerprint,
           target_id, result_version, created_at)
          SELECT org_id, store_id, ?, ?, ?, id, NULL, ?
          FROM sotuvchi_categories
          WHERE org_id = ? AND store_id = ? AND id = ?
            AND last_operation_key = ?`)
          .bind(
            operation.idempotencyKey,
            operation.operation,
            operation.fingerprint,
            operation.createdAt,
            category.orgId,
            category.storeId,
            category.id,
            operation.idempotencyKey,
          ),
      ]);
      return operationChanges(results);
    },

    async archiveCategory(ownerIdentityId, category, operation) {
      const results = await db.batch([
        db.prepare(`UPDATE sotuvchi_categories
                    SET status = 'archived', last_operation_key = ?,
                        updated_at = ?
                    WHERE org_id = ? AND store_id = ? AND id = ?
                      AND status = 'active'
                      AND EXISTS (
                        SELECT 1 FROM sotuvchi_stores AS store
                        JOIN memberships AS membership
                          ON membership.org_id = store.org_id
                         AND membership.identity_id = ?
                         AND membership.role = 'owner'
                         AND membership.status = 'active'
                        WHERE store.org_id = ? AND store.id = ?
                          AND store.status = 'active'
                      )`)
          .bind(
            operation.idempotencyKey,
            new Date().toISOString(),
            category.orgId,
            category.storeId,
            category.id,
            requireCatalogId(ownerIdentityId),
            category.orgId,
            category.storeId,
          ),
        db.prepare(`INSERT INTO sotuvchi_catalog_operations
          (org_id, store_id, idempotency_key, operation, fingerprint,
           target_id, result_version, created_at)
          SELECT org_id, store_id, ?, ?, ?, id, NULL, ?
          FROM sotuvchi_categories
          WHERE org_id = ? AND store_id = ? AND id = ?
            AND last_operation_key = ?`)
          .bind(
            operation.idempotencyKey,
            operation.operation,
            operation.fingerprint,
            operation.createdAt,
            category.orgId,
            category.storeId,
            category.id,
            operation.idempotencyKey,
          ),
      ]);
      return operationChanges(results);
    },

    async getProduct(orgId, storeId, productId) {
      return productRow(
        requireCatalogId(orgId),
        requireCatalogId(storeId),
        requireCatalogId(productId),
      );
    },

    async listProducts(orgId, storeId, filter) {
      const categoryFilter = Object.hasOwn(filter, 'categoryId') ? 1 : 0;
      const rows = await db
        .prepare(`SELECT ${PRODUCT_COLUMNS}
                  FROM sotuvchi_products
                  WHERE org_id = ? AND store_id = ?
                    AND (? IS NULL OR status = ?)
                    AND (? = 0 OR category_id IS ?)
                  ORDER BY updated_at DESC, id ASC
                  LIMIT ?`)
        .bind(
          requireCatalogId(orgId),
          requireCatalogId(storeId),
          filter.status ?? null,
          filter.status ?? null,
          categoryFilter,
          filter.categoryId ?? null,
          filter.limit ?? 20,
        )
        .all<ProductRow>();
      return (rows.results ?? []).map(fromProductRow);
    },

    async productSkuExists(orgId, storeId, sku, excludingId) {
      const row = await db
        .prepare(`SELECT 1 AS found FROM sotuvchi_products
                  WHERE org_id = ? AND store_id = ? AND sku = ?
                    AND (? IS NULL OR id <> ?)`)
        .bind(
          requireCatalogId(orgId),
          requireCatalogId(storeId),
          normalizeSku(sku),
          excludingId ?? null,
          excludingId ?? null,
        )
        .first<{ found: number }>();
      return row?.found === 1;
    },

    async countCurrentProducts(orgId, storeId) {
      const row = await db
        .prepare(`SELECT COUNT(*) AS total FROM sotuvchi_products
                  WHERE org_id = ? AND store_id = ? AND status <> 'archived'`)
        .bind(requireCatalogId(orgId), requireCatalogId(storeId))
        .first<{ total: number }>();
      return Number(row?.total ?? 0);
    },

    async createProduct(ownerIdentityId, product, operation) {
      const results = await db.batch([
        db.prepare(`INSERT INTO sotuvchi_products
          (id, org_id, store_id, category_id, sku, name, normalized_name,
           description, price_minor, currency, availability, status,
           media_refs_json, search_terms_json, specifications_json,
           version, last_operation_key, created_at, updated_at)
          SELECT ?, store.org_id, store.id, ?, ?, ?, ?, ?, ?, 'UZS', ?,
                 'draft', ?, ?, ?, 1, ?, ?, ?
          FROM sotuvchi_stores AS store
          JOIN memberships AS membership
            ON membership.org_id = store.org_id
           AND membership.identity_id = ?
           AND membership.role = 'owner'
           AND membership.status = 'active'
          WHERE store.org_id = ? AND store.id = ? AND store.status = 'active'
            AND (
              SELECT COUNT(*) FROM sotuvchi_products AS existing
              WHERE existing.org_id = store.org_id
                AND existing.store_id = store.id
                AND existing.status <> 'archived'
            ) < 100`)
          .bind(
            product.id,
            product.categoryId,
            product.sku,
            product.name,
            product.normalizedName,
            product.description,
            product.priceMinor,
            product.availability,
            JSON.stringify(product.mediaRefs),
            JSON.stringify(product.searchTerms),
            JSON.stringify(product.specifications),
            operation.idempotencyKey,
            product.createdAt,
            product.updatedAt,
            requireCatalogId(ownerIdentityId),
            product.orgId,
            product.storeId,
          ),
        db.prepare(`INSERT INTO sotuvchi_catalog_operations
          (org_id, store_id, idempotency_key, operation, fingerprint,
           target_id, result_version, created_at)
          SELECT org_id, store_id, ?, ?, ?, id, version, ?
          FROM sotuvchi_products
          WHERE org_id = ? AND store_id = ? AND id = ?
            AND last_operation_key = ?`)
          .bind(
            operation.idempotencyKey,
            operation.operation,
            operation.fingerprint,
            operation.createdAt,
            product.orgId,
            product.storeId,
            product.id,
            operation.idempotencyKey,
          ),
      ]);
      return operationChanges(results);
    },

    async updateProduct(
      ownerIdentityId,
      product,
      expectedVersion,
      operation,
    ) {
      const results = await db.batch([
        db.prepare(`UPDATE sotuvchi_products
                    SET category_id = ?, sku = ?, name = ?,
                        normalized_name = ?, description = ?, price_minor = ?,
                        currency = 'UZS', availability = ?, media_refs_json = ?,
                        search_terms_json = ?, specifications_json = ?,
                        version = version + 1, last_operation_key = ?,
                        updated_at = ?
                    WHERE org_id = ? AND store_id = ? AND id = ?
                      AND version = ? AND status <> 'archived'
                      AND EXISTS (
                        SELECT 1 FROM sotuvchi_stores AS store
                        JOIN memberships AS membership
                          ON membership.org_id = store.org_id
                         AND membership.identity_id = ?
                         AND membership.role = 'owner'
                         AND membership.status = 'active'
                        WHERE store.org_id = ? AND store.id = ?
                          AND store.status = 'active'
                      )`)
          .bind(
            product.categoryId,
            product.sku,
            product.name,
            product.normalizedName,
            product.description,
            product.priceMinor,
            product.availability,
            JSON.stringify(product.mediaRefs),
            JSON.stringify(product.searchTerms),
            JSON.stringify(product.specifications),
            operation.idempotencyKey,
            product.updatedAt,
            product.orgId,
            product.storeId,
            product.id,
            requireProductVersion(expectedVersion),
            requireCatalogId(ownerIdentityId),
            product.orgId,
            product.storeId,
          ),
        db.prepare(`INSERT INTO sotuvchi_catalog_operations
          (org_id, store_id, idempotency_key, operation, fingerprint,
           target_id, result_version, created_at)
          SELECT org_id, store_id, ?, ?, ?, id, version, ?
          FROM sotuvchi_products
          WHERE org_id = ? AND store_id = ? AND id = ?
            AND last_operation_key = ?`)
          .bind(
            operation.idempotencyKey,
            operation.operation,
            operation.fingerprint,
            operation.createdAt,
            product.orgId,
            product.storeId,
            product.id,
            operation.idempotencyKey,
          ),
      ]);
      return operationChanges(results);
    },

    async setProductStatus(
      ownerIdentityId,
      product,
      status,
      expectedVersion,
      operation,
    ) {
      const results = await db.batch([
        db.prepare(`UPDATE sotuvchi_products
                    SET status = ?, version = version + 1,
                        last_operation_key = ?, updated_at = ?
                    WHERE org_id = ? AND store_id = ? AND id = ?
                      AND version = ? AND status <> 'archived'
                      AND EXISTS (
                        SELECT 1 FROM sotuvchi_stores AS store
                        JOIN memberships AS membership
                          ON membership.org_id = store.org_id
                         AND membership.identity_id = ?
                         AND membership.role = 'owner'
                         AND membership.status = 'active'
                        WHERE store.org_id = ? AND store.id = ?
                          AND store.status = 'active'
                      )`)
          .bind(
            normalizeProductStatus(status),
            operation.idempotencyKey,
            new Date().toISOString(),
            product.orgId,
            product.storeId,
            product.id,
            requireProductVersion(expectedVersion),
            requireCatalogId(ownerIdentityId),
            product.orgId,
            product.storeId,
          ),
        db.prepare(`INSERT INTO sotuvchi_catalog_operations
          (org_id, store_id, idempotency_key, operation, fingerprint,
           target_id, result_version, created_at)
          SELECT org_id, store_id, ?, ?, ?, id, version, ?
          FROM sotuvchi_products
          WHERE org_id = ? AND store_id = ? AND id = ?
            AND last_operation_key = ?`)
          .bind(
            operation.idempotencyKey,
            operation.operation,
            operation.fingerprint,
            operation.createdAt,
            product.orgId,
            product.storeId,
            product.id,
            operation.idempotencyKey,
          ),
      ]);
      return operationChanges(results);
    },

    async findPublishedCandidates(context) {
      const rows = await db
        .prepare(`SELECT ${qualified(PRODUCT_COLUMNS, 'product')},
                         category.name AS category_name,
                         store.name AS store_name
                  FROM sotuvchi_products AS product
                  JOIN sotuvchi_stores AS store
                    ON store.org_id = product.org_id
                   AND store.id = product.store_id
                   AND store.status = 'active'
                   LEFT JOIN sotuvchi_categories AS category
                     ON category.org_id = product.org_id
                    AND category.store_id = product.store_id
                    AND category.id = product.category_id
                   JOIN owner_pilot_stores AS pilot
                     ON pilot.org_id = store.org_id
                    AND pilot.store_id = store.id
                    AND pilot.state = 'active'
                   WHERE product.org_id = ? AND product.store_id = ?
                    AND product.status = 'published'
                    AND (product.category_id IS NULL
                      OR category.status = 'active')
                  ORDER BY product.normalized_name ASC, product.id ASC
                  LIMIT 200`)
        .bind(
          context.orgId,
          context.storeId,
        )
        .all<CandidateRow>();
      return (rows.results ?? []).map((row) => ({
        product: fromProductRow(row),
        categoryName: row.category_name === null
          ? null
          : normalizeCategoryName(row.category_name),
        storeName: normalizeStoreName(row.store_name),
        normalizedName: row.normalized_name,
      }));
    },

    async listPublished(context, limit) {
      const rows = await db
        .prepare(`SELECT ${qualified(PRODUCT_COLUMNS, 'product')},
                         category.name AS category_name,
                         store.name AS store_name
                  FROM sotuvchi_products AS product
                  JOIN sotuvchi_stores AS store
                    ON store.org_id = product.org_id
                   AND store.id = product.store_id
                   AND store.status = 'active'
                   LEFT JOIN sotuvchi_categories AS category
                     ON category.org_id = product.org_id
                    AND category.store_id = product.store_id
                    AND category.id = product.category_id
                   JOIN owner_pilot_stores AS pilot
                     ON pilot.org_id = store.org_id
                    AND pilot.store_id = store.id
                    AND pilot.state = 'active'
                   WHERE product.org_id = ? AND product.store_id = ?
                    AND product.status = 'published'
                    AND (product.category_id IS NULL
                      OR category.status = 'active')
                  ORDER BY product.normalized_name ASC, product.id ASC
                  LIMIT ?`)
        .bind(context.orgId, context.storeId, limit)
        .all<CandidateRow>();
      return (rows.results ?? []).map((row) => ({
        product: fromProductRow(row),
        categoryName: row.category_name === null
          ? null
          : normalizeCategoryName(row.category_name),
        storeName: normalizeStoreName(row.store_name),
        normalizedName: row.normalized_name,
      }));
    },

    async listPublishedByCategory(context, categoryId, limit) {
      const rows = await db
        .prepare(`SELECT ${qualified(PRODUCT_COLUMNS, 'product')},
                         category.name AS category_name,
                         store.name AS store_name
                  FROM sotuvchi_products AS product
                  JOIN sotuvchi_stores AS store
                    ON store.org_id = product.org_id
                   AND store.id = product.store_id
                   AND store.status = 'active'
                  JOIN sotuvchi_categories AS category
                    ON category.org_id = product.org_id
                   AND category.store_id = product.store_id
                   AND category.id = product.category_id
                   AND category.status = 'active'
                  JOIN owner_pilot_stores AS pilot
                    ON pilot.org_id = store.org_id
                   AND pilot.store_id = store.id
                   AND pilot.state = 'active'
                  WHERE product.org_id = ?
                    AND product.store_id = ?
                    AND product.category_id = ?
                    AND product.status = 'published'
                  ORDER BY product.normalized_name ASC, product.id ASC
                  LIMIT ?`)
        .bind(
          context.orgId,
          context.storeId,
          requireCatalogId(categoryId),
          limit,
        )
        .all<CandidateRow>();
      return (rows.results ?? []).map((row) => ({
        product: fromProductRow(row),
        categoryName: normalizeCategoryName(row.category_name),
        storeName: normalizeStoreName(row.store_name),
        normalizedName: row.normalized_name,
      }));
    },

    async listBuyerCategories(context) {
      const rows = await db
        .prepare(`SELECT category.id,
                         category.name,
                         COUNT(product.id) AS product_count
                  FROM sotuvchi_categories AS category
                  JOIN sotuvchi_stores AS store
                    ON store.org_id = category.org_id
                   AND store.id = category.store_id
                   AND store.status = 'active'
                  JOIN owner_pilot_stores AS pilot
                    ON pilot.org_id = store.org_id
                   AND pilot.store_id = store.id
                   AND pilot.state = 'active'
                  JOIN sotuvchi_products AS product
                    ON product.org_id = category.org_id
                   AND product.store_id = category.store_id
                   AND product.category_id = category.id
                   AND product.status = 'published'
                  WHERE category.org_id = ?
                    AND category.store_id = ?
                    AND category.status = 'active'
                  GROUP BY category.id, category.name, category.sort_order
                  ORDER BY category.sort_order ASC, category.name ASC,
                           category.id ASC
                  LIMIT 10`)
        .bind(context.orgId, context.storeId)
        .all<{ id: string; name: string; product_count: number }>();
      return (rows.results ?? []).map((row) => {
        const productCount = Number(row.product_count);
        if (
          !Number.isInteger(productCount)
          || productCount < 1
          || productCount > 100
        ) {
          throw new CatalogPersistenceError('corrupt_row');
        }
        return {
          id: requireCatalogId(row.id),
          name: normalizeCategoryName(row.name),
          productCount,
        };
      });
    },

    async recordStorefrontPresentation(input) {
      const botUsername = requireBotUsername(input.botUsername);
      const identityId = requireCatalogId(input.identityId);
      const orgId = requireCatalogId(input.context.orgId);
      const storeId = requireCatalogId(input.context.storeId);
      const requestId = requireSessionCode(input.requestId, 160);
      if (
        input.presentations.length < 1
        || input.presentations.length > 4
      ) {
        throw new CatalogPersistenceError('persistence_failed');
      }
      const productIds = new Set<string>();
      const presentations = input.presentations.map((presentation) => {
        const productId = requireCatalogId(presentation.productId);
        if (productIds.has(productId)) {
          throw new CatalogPersistenceError('persistence_failed');
        }
        productIds.add(productId);
        return {
          productId,
          relevanceScore: requireBoundedInteger(
            presentation.relevanceScore,
            0,
            4_000,
          ),
          matchedRequirementCount: requireBoundedInteger(
            presentation.matchedRequirementCount,
            0,
            12,
          ),
          missingRequirementCount: requireBoundedInteger(
            presentation.missingRequirementCount,
            0,
            12,
          ),
          relevanceReason: requireRelevanceReason(
            presentation.relevanceReason,
          ),
        };
      });
      const now = new Date().toISOString();
      const results = await db.batch(presentations.map((presentation) =>
        db.prepare(`INSERT INTO sotuvchi_buyer_presentations
          (session_id, org_id, store_id, product_id, relevance_score,
           matched_requirement_count, missing_requirement_count,
           relevance_reason, request_key, presented_at)
          SELECT session.id, session.org_id, session.store_id, product.id,
                 ?, ?, ?, ?, ?, ?
          FROM sotuvchi_storefront_sessions AS session
          JOIN sotuvchi_stores AS store
            ON store.org_id = session.org_id
           AND store.id = session.store_id
           AND store.status = 'active'
          JOIN telegram_agent_routes AS route
            ON route.org_id = store.org_id
           AND route.route_code = store.storefront_code
           AND route.bot_username = session.bot_username
           AND route.agent_id = 'sotuvchi'
           AND route.status = 'active'
          JOIN owner_pilot_stores AS pilot
            ON pilot.org_id = store.org_id
           AND pilot.store_id = store.id
           AND pilot.state = 'active'
          JOIN sotuvchi_products AS product
            ON product.org_id = session.org_id
           AND product.store_id = session.store_id
           AND product.id = ?
           AND product.status = 'published'
          LEFT JOIN sotuvchi_categories AS category
            ON category.org_id = product.org_id
           AND category.store_id = product.store_id
           AND category.id = product.category_id
          WHERE session.bot_username = ?
            AND session.identity_id = ?
            AND session.org_id = ?
            AND session.store_id = ?
            AND session.status = 'active'
            AND (product.category_id IS NULL OR category.status = 'active')
          ON CONFLICT(session_id, product_id) DO UPDATE SET
            org_id = excluded.org_id,
            store_id = excluded.store_id,
            relevance_score = excluded.relevance_score,
            matched_requirement_count = excluded.matched_requirement_count,
            missing_requirement_count = excluded.missing_requirement_count,
            relevance_reason = excluded.relevance_reason,
            request_key = excluded.request_key,
            presented_at = excluded.presented_at`)
          .bind(
            presentation.relevanceScore,
            presentation.matchedRequirementCount,
            presentation.missingRequirementCount,
            presentation.relevanceReason,
            requestId,
            now,
            presentation.productId,
            botUsername,
            identityId,
            orgId,
            storeId,
          )));
      if (
        results.some((result) => Number(result.meta?.changes ?? 0) !== 1)
      ) {
        throw new CatalogPersistenceError('persistence_failed');
      }
    },

    async addComparisonProduct(input) {
      const botUsername = requireBotUsername(input.botUsername);
      const identityId = requireCatalogId(input.identityId);
      const orgId = requireCatalogId(input.context.orgId);
      const storeId = requireCatalogId(input.context.storeId);
      const productId = requireCatalogId(input.productId);
      const now = new Date();
      const recentPresentation = new Date(
        now.getTime() - 30 * 60 * 1000,
      ).toISOString();
      const result = await db
        .prepare(`INSERT INTO sotuvchi_buyer_comparisons
          (session_id, org_id, store_id, product_id, position,
           relevance_score, matched_requirement_count,
           missing_requirement_count, relevance_reason, created_at)
          SELECT session.id, session.org_id, session.store_id, product.id,
                 (SELECT COALESCE(MAX(existing.position), 0) + 1
                  FROM sotuvchi_buyer_comparisons AS existing
                  WHERE existing.session_id = session.id
                    AND existing.org_id = session.org_id
                    AND existing.store_id = session.store_id),
                 COALESCE(presentation.relevance_score, 0),
                 COALESCE(presentation.matched_requirement_count, 0),
                 COALESCE(presentation.missing_requirement_count, 0),
                 COALESCE(
                   presentation.relevance_reason,
                   'catalog_listing'
                 ),
                 ?
          FROM sotuvchi_storefront_sessions AS session
          JOIN sotuvchi_stores AS store
            ON store.org_id = session.org_id
           AND store.id = session.store_id
           AND store.status = 'active'
          JOIN telegram_agent_routes AS route
            ON route.org_id = store.org_id
           AND route.route_code = store.storefront_code
           AND route.bot_username = session.bot_username
           AND route.agent_id = 'sotuvchi'
           AND route.status = 'active'
          JOIN owner_pilot_stores AS pilot
            ON pilot.org_id = store.org_id
           AND pilot.store_id = store.id
           AND pilot.state = 'active'
          JOIN sotuvchi_products AS product
            ON product.org_id = session.org_id
           AND product.store_id = session.store_id
           AND product.id = ?
           AND product.status = 'published'
          LEFT JOIN sotuvchi_categories AS category
            ON category.org_id = product.org_id
           AND category.store_id = product.store_id
           AND category.id = product.category_id
          LEFT JOIN sotuvchi_buyer_presentations AS presentation
            ON presentation.session_id = session.id
           AND presentation.org_id = session.org_id
           AND presentation.store_id = session.store_id
           AND presentation.product_id = product.id
           AND presentation.presented_at >= ?
          WHERE session.bot_username = ?
            AND session.identity_id = ?
            AND session.org_id = ?
            AND session.store_id = ?
            AND session.status = 'active'
            AND (product.category_id IS NULL OR category.status = 'active')
            AND NOT EXISTS (
              SELECT 1
              FROM sotuvchi_buyer_comparisons AS duplicate
              WHERE duplicate.session_id = session.id
                AND duplicate.org_id = session.org_id
                AND duplicate.store_id = session.store_id
                AND duplicate.product_id = product.id
            )
            AND (
              SELECT COUNT(*)
              FROM sotuvchi_buyer_comparisons AS selected
              JOIN sotuvchi_products AS selected_product
                ON selected_product.org_id = selected.org_id
               AND selected_product.store_id = selected.store_id
               AND selected_product.id = selected.product_id
               AND selected_product.status = 'published'
              LEFT JOIN sotuvchi_categories AS selected_category
                ON selected_category.org_id = selected_product.org_id
               AND selected_category.store_id = selected_product.store_id
               AND selected_category.id = selected_product.category_id
              WHERE selected.session_id = session.id
                AND selected.org_id = session.org_id
                AND selected.store_id = session.store_id
                AND (
                  selected_product.category_id IS NULL
                  OR selected_category.status = 'active'
                )
            ) < 3`)
        .bind(
          now.toISOString(),
          productId,
          recentPresentation,
          botUsername,
          identityId,
          orgId,
          storeId,
        )
        .run();
      if (Number(result.meta?.changes ?? 0) === 1) return 'added';
      const current = await comparisonCandidates({
        botUsername,
        identityId,
        context: input.context,
      });
      if (current.some((candidate) => candidate.product.id === productId)) {
        return 'duplicate';
      }
      return current.length >= 3 ? 'full' : 'not_found';
    },

    listComparisonProducts(input) {
      return comparisonCandidates(input);
    },

    async clearComparisonProducts(input) {
      await db
        .prepare(`DELETE FROM sotuvchi_buyer_comparisons
                  WHERE org_id = ?
                    AND store_id = ?
                    AND session_id IN (
                      SELECT session.id
                      FROM sotuvchi_storefront_sessions AS session
                      JOIN sotuvchi_stores AS store
                        ON store.org_id = session.org_id
                       AND store.id = session.store_id
                       AND store.status = 'active'
                      JOIN telegram_agent_routes AS route
                        ON route.org_id = store.org_id
                       AND route.route_code = store.storefront_code
                       AND route.bot_username = session.bot_username
                       AND route.agent_id = 'sotuvchi'
                       AND route.status = 'active'
                      JOIN owner_pilot_stores AS pilot
                        ON pilot.org_id = store.org_id
                       AND pilot.store_id = store.id
                       AND pilot.state = 'active'
                      WHERE session.bot_username = ?
                        AND session.identity_id = ?
                        AND session.org_id = ?
                        AND session.store_id = ?
                        AND session.status = 'active'
                    )`)
        .bind(
          requireCatalogId(input.context.orgId),
          requireCatalogId(input.context.storeId),
          requireBotUsername(input.botUsername),
          requireCatalogId(input.identityId),
          input.context.orgId,
          input.context.storeId,
        )
        .run();
    },

    async bindStorefrontSession(input) {
      const botUsername = requireBotUsername(input.botUsername);
      const identityId = requireCatalogId(input.identityId);
      const now = new Date().toISOString();
      const sessionId = `sotuvchi_session_${crypto.randomUUID()}`;
      await db
        .prepare(`INSERT INTO sotuvchi_storefront_sessions
          (id, bot_username, identity_id, org_id, store_id, status,
           preferred_locale, created_at, updated_at)
           SELECT ?, ?, ?, store.org_id, store.id, 'active', ?, ?, ?
           FROM sotuvchi_stores AS store
           JOIN owner_pilot_stores AS pilot
             ON pilot.org_id = store.org_id
            AND pilot.store_id = store.id
            AND pilot.state = 'active'
           WHERE store.org_id = ? AND store.id = ? AND store.status = 'active'
          ON CONFLICT(bot_username, identity_id) DO UPDATE SET
            last_product_id = CASE
              WHEN org_id = excluded.org_id AND store_id = excluded.store_id
                THEN last_product_id
              ELSE NULL
            END,
            last_intent = CASE
              WHEN org_id = excluded.org_id AND store_id = excluded.store_id
                THEN last_intent
              ELSE NULL
            END,
            selection_request_key = CASE
              WHEN org_id = excluded.org_id AND store_id = excluded.store_id
                THEN selection_request_key
              ELSE NULL
            END,
            selected_at = CASE
              WHEN org_id = excluded.org_id AND store_id = excluded.store_id
                THEN selected_at
              ELSE NULL
            END,
            preferred_locale = CASE
              WHEN org_id = excluded.org_id AND store_id = excluded.store_id
                THEN COALESCE(preferred_locale, excluded.preferred_locale)
              ELSE excluded.preferred_locale
            END,
            pending_intent = NULL,
            pending_request_key = NULL,
            pending_at = NULL,
            org_id = excluded.org_id,
            store_id = excluded.store_id,
            status = 'active',
            updated_at = excluded.updated_at`)
        .bind(
          sessionId,
          botUsername,
          identityId,
          input.context.locale,
          now,
          now,
          input.context.orgId,
          input.context.storeId,
        )
        .run();
      const row = await db
        .prepare(`SELECT ${SESSION_COLUMNS}
                  FROM sotuvchi_storefront_sessions
                  WHERE bot_username = ? AND identity_id = ?`)
        .bind(botUsername, identityId)
        .first<SessionRow>();
      if (!row) throw new CatalogPersistenceError('persistence_failed');
      return fromSessionRow(row);
    },

    async resolveStorefrontSession(botUsername, identityId) {
      const row = await db
        .prepare(`SELECT session.org_id, session.store_id,
                         COALESCE(session.preferred_locale, store.locale)
                           AS locale
                  FROM sotuvchi_storefront_sessions AS session
                  JOIN sotuvchi_stores AS store
                    ON store.org_id = session.org_id
                   AND store.id = session.store_id
                   AND store.status = 'active'
                   JOIN telegram_agent_routes AS route
                     ON route.org_id = store.org_id
                    AND route.route_code = store.storefront_code
                    AND route.bot_username = session.bot_username
                    AND route.agent_id = 'sotuvchi'
                    AND route.status = 'active'
                   JOIN owner_pilot_stores AS pilot
                     ON pilot.org_id = store.org_id
                    AND pilot.store_id = store.id
                    AND pilot.state = 'active'
                   WHERE session.bot_username = ?
                    AND session.identity_id = ?
                    AND session.status = 'active'`)
        .bind(
          requireBotUsername(botUsername),
          requireCatalogId(identityId),
        )
        .first<{ org_id: string; store_id: string; locale: string }>();
      if (!row) return null;
      if (row.locale !== 'ru' && row.locale !== 'uz') {
        throw new CatalogPersistenceError('corrupt_row');
      }
      return {
        orgId: requireCatalogId(row.org_id),
        storeId: requireCatalogId(row.store_id),
        agentId: 'sotuvchi',
        locale: row.locale,
      };
    },

    async setStorefrontLocale(input) {
      const botUsername = requireBotUsername(input.botUsername);
      const identityId = requireCatalogId(input.identityId);
      const locale = input.locale;
      if (locale !== 'ru' && locale !== 'uz') {
        throw new CatalogPersistenceError('corrupt_row');
      }
      const now = new Date().toISOString();
      const result = await db
        .prepare(`UPDATE sotuvchi_storefront_sessions AS session
                  SET preferred_locale = ?, updated_at = ?
                  WHERE session.bot_username = ?
                    AND session.identity_id = ?
                    AND session.org_id = ?
                    AND session.store_id = ?
                    AND session.status = 'active'
                    AND EXISTS (
                      SELECT 1
                      FROM sotuvchi_stores AS store
                      JOIN telegram_agent_routes AS route
                        ON route.org_id = store.org_id
                       AND route.route_code = store.storefront_code
                       AND route.bot_username = session.bot_username
                       AND route.agent_id = 'sotuvchi'
                       AND route.status = 'active'
                      JOIN owner_pilot_stores AS pilot
                        ON pilot.org_id = store.org_id
                       AND pilot.store_id = store.id
                       AND pilot.state = 'active'
                      WHERE store.org_id = session.org_id
                        AND store.id = session.store_id
                        AND store.status = 'active'
                    )`)
        .bind(
          locale,
          now,
          botUsername,
          identityId,
          input.context.orgId,
          input.context.storeId,
        )
        .run();
      if ((result.meta?.changes ?? 0) !== 1) return null;
      return this.resolveStorefrontSession(botUsername, identityId);
    },

    async setPendingBudget(input) {
      const botUsername = requireBotUsername(input.botUsername);
      const identityId = requireCatalogId(input.identityId);
      const requestId = requireSessionCode(input.requestId, 160);
      const now = new Date().toISOString();
      const result = await db
        .prepare(`UPDATE sotuvchi_storefront_sessions AS session
                  SET pending_intent = 'budget',
                      pending_request_key = ?,
                      pending_at = ?,
                      updated_at = ?
                  WHERE session.bot_username = ?
                    AND session.identity_id = ?
                    AND session.org_id = ?
                    AND session.store_id = ?
                    AND session.status = 'active'
                    AND EXISTS (
                      SELECT 1 FROM sotuvchi_stores AS store
                      JOIN owner_pilot_stores AS pilot
                        ON pilot.org_id = store.org_id
                       AND pilot.store_id = store.id
                       AND pilot.state = 'active'
                      WHERE store.org_id = session.org_id
                        AND store.id = session.store_id
                        AND store.status = 'active'
                    )`)
        .bind(
          requestId,
          now,
          now,
          botUsername,
          identityId,
          input.context.orgId,
          input.context.storeId,
        )
        .run();
      return (result.meta?.changes ?? 0) === 1;
    },

    async consumePendingBudget(input) {
      const now = new Date();
      const cutoff = new Date(now.getTime() - 10 * 60_000).toISOString();
      await db
        .prepare(`UPDATE sotuvchi_storefront_sessions
                  SET pending_intent = NULL,
                      pending_request_key = NULL,
                      pending_at = NULL
                  WHERE bot_username = ?
                    AND identity_id = ?
                    AND org_id = ?
                    AND store_id = ?
                    AND pending_intent = 'budget'
                    AND pending_at < ?`)
        .bind(
          requireBotUsername(input.botUsername),
          requireCatalogId(input.identityId),
          input.context.orgId,
          input.context.storeId,
          cutoff,
        )
        .run();
      const result = await db
        .prepare(`UPDATE sotuvchi_storefront_sessions AS session
                  SET pending_intent = NULL,
                      pending_request_key = NULL,
                      pending_at = NULL,
                      updated_at = ?
                  WHERE session.bot_username = ?
                    AND session.identity_id = ?
                    AND session.org_id = ?
                    AND session.store_id = ?
                    AND session.status = 'active'
                    AND session.pending_intent = 'budget'
                    AND session.pending_request_key IS NOT NULL
                    AND session.pending_at >= ?
                    AND EXISTS (
                      SELECT 1 FROM sotuvchi_stores AS store
                      JOIN owner_pilot_stores AS pilot
                        ON pilot.org_id = store.org_id
                       AND pilot.store_id = store.id
                       AND pilot.state = 'active'
                      WHERE store.org_id = session.org_id
                        AND store.id = session.store_id
                        AND store.status = 'active'
                    )`)
        .bind(
          now.toISOString(),
          requireBotUsername(input.botUsername),
          requireCatalogId(input.identityId),
          input.context.orgId,
          input.context.storeId,
          cutoff,
        )
        .run();
      return (result.meta?.changes ?? 0) === 1;
    },

    async clearPendingBudget(input) {
      await db
        .prepare(`UPDATE sotuvchi_storefront_sessions
                  SET pending_intent = NULL,
                      pending_request_key = NULL,
                      pending_at = NULL,
                      updated_at = ?
                  WHERE bot_username = ?
                    AND identity_id = ?
                    AND org_id = ?
                    AND store_id = ?
                    AND status = 'active'`)
        .bind(
          new Date().toISOString(),
          requireBotUsername(input.botUsername),
          requireCatalogId(input.identityId),
          input.context.orgId,
          input.context.storeId,
        )
        .run();
    },

    async recordStorefrontSelection(input) {
      const botUsername = requireBotUsername(input.botUsername);
      const identityId = requireCatalogId(input.identityId);
      const productId = requireCatalogId(input.productId);
      const intent = requireSessionCode(input.intent, 48);
      const requestId = requireSessionCode(input.requestId, 160);
      const now = new Date().toISOString();
      await db
        .prepare(`UPDATE sotuvchi_storefront_sessions AS session
                  SET last_product_id = ?,
                      last_intent = ?,
                      selection_request_key = ?,
                      selected_at = ?,
                      updated_at = ?
                  WHERE session.bot_username = ?
                    AND session.identity_id = ?
                    AND session.org_id = ?
                    AND session.store_id = ?
                    AND session.status = 'active'
                    AND session.selection_request_key IS NOT ?
                    AND EXISTS (
                      SELECT 1
                      FROM sotuvchi_products AS product
                      JOIN sotuvchi_stores AS store
                        ON store.org_id = product.org_id
                       AND store.id = product.store_id
                       AND store.status = 'active'
                      LEFT JOIN sotuvchi_categories AS category
                        ON category.org_id = product.org_id
                       AND category.store_id = product.store_id
                       AND category.id = product.category_id
                       JOIN telegram_agent_routes AS route
                         ON route.org_id = store.org_id
                        AND route.route_code = store.storefront_code
                        AND route.bot_username = session.bot_username
                        AND route.agent_id = 'sotuvchi'
                        AND route.status = 'active'
                       JOIN owner_pilot_stores AS pilot
                         ON pilot.org_id = store.org_id
                        AND pilot.store_id = store.id
                        AND pilot.state = 'active'
                       WHERE product.org_id = session.org_id
                        AND product.store_id = session.store_id
                        AND product.id = ?
                        AND product.status = 'published'
                        AND (product.category_id IS NULL
                          OR category.status = 'active')
                    )`)
        .bind(
          productId,
          intent,
          requestId,
          now,
          now,
          botUsername,
          identityId,
          input.context.orgId,
          input.context.storeId,
          requestId,
          productId,
        )
        .run();
      const row = await db
        .prepare(`SELECT ${SESSION_COLUMNS}
                  FROM sotuvchi_storefront_sessions
                  WHERE bot_username = ? AND identity_id = ?`)
        .bind(botUsername, identityId)
        .first<SessionRow>();
      if (!row) throw new CatalogPersistenceError('persistence_failed');
      const session = fromSessionRow(row);
      if (
        session.orgId !== input.context.orgId
        || session.storeId !== input.context.storeId
        || session.lastProductId !== productId
        || session.lastIntent !== intent
        || session.selectionRequestKey !== requestId
      ) {
        throw new CatalogPersistenceError('persistence_failed');
      }
      return session;
    },

    async resolveStorefrontSelection(botUsername, identityId) {
      const row = await db
        .prepare(`SELECT session.org_id, session.store_id,
                         session.last_product_id, session.last_intent,
                         session.selected_at, store.locale
                  FROM sotuvchi_storefront_sessions AS session
                  JOIN sotuvchi_stores AS store
                    ON store.org_id = session.org_id
                   AND store.id = session.store_id
                   AND store.status = 'active'
                  JOIN sotuvchi_products AS product
                    ON product.org_id = session.org_id
                   AND product.store_id = session.store_id
                   AND product.id = session.last_product_id
                   AND product.status = 'published'
                  LEFT JOIN sotuvchi_categories AS category
                    ON category.org_id = product.org_id
                   AND category.store_id = product.store_id
                   AND category.id = product.category_id
                   JOIN telegram_agent_routes AS route
                     ON route.org_id = store.org_id
                    AND route.route_code = store.storefront_code
                    AND route.bot_username = session.bot_username
                    AND route.agent_id = 'sotuvchi'
                    AND route.status = 'active'
                   JOIN owner_pilot_stores AS pilot
                     ON pilot.org_id = store.org_id
                    AND pilot.store_id = store.id
                    AND pilot.state = 'active'
                   WHERE session.bot_username = ?
                    AND session.identity_id = ?
                    AND session.status = 'active'
                    AND session.last_product_id IS NOT NULL
                    AND session.last_intent IS NOT NULL
                    AND session.selected_at IS NOT NULL
                    AND (product.category_id IS NULL
                      OR category.status = 'active')`)
        .bind(
          requireBotUsername(botUsername),
          requireCatalogId(identityId),
        )
        .first<{
          org_id: string;
          store_id: string;
          last_product_id: string;
          last_intent: string;
          selected_at: string;
          locale: string;
        }>();
      if (!row) return null;
      if (
        (row.locale !== 'ru' && row.locale !== 'uz')
        || !validDate(row.selected_at)
      ) {
        throw new CatalogPersistenceError('corrupt_row');
      }
      return {
        context: {
          orgId: requireCatalogId(row.org_id),
          storeId: requireCatalogId(row.store_id),
          agentId: 'sotuvchi',
          locale: row.locale,
        },
        productId: requireCatalogId(row.last_product_id),
        lastIntent: requireSessionCode(row.last_intent, 48),
        selectedAt: row.selected_at,
      };
    },
  };
}
