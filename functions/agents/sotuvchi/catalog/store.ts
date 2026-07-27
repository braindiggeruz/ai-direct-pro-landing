import type { Locale } from '../../../platform/contracts';
import type {
  CatalogCategory,
  CatalogProduct,
  CatalogProductCandidate,
  CatalogProductStatus,
  ListCatalogProductsFilter,
  StorefrontContext,
  StorefrontSession,
} from './types';
import { CatalogPersistenceError } from './errors';
import {
  normalizeAvailability,
  normalizeCategoryName,
  normalizeCategoryStatus,
  normalizeCurrency,
  normalizeMediaRefs,
  normalizePriceMinor,
  normalizeProductDescription,
  normalizedProductName,
  normalizeProductName,
  normalizeProductStatus,
  normalizeSku,
  normalizeSortOrder,
  requireBotUsername,
  requireCatalogId,
  requireCategorySlug,
  requireProductVersion,
} from './validation';

const CATEGORY_COLUMNS =
  'id, org_id, store_id, name, slug, status, sort_order, created_at, updated_at';
const PRODUCT_COLUMNS =
  'id, org_id, store_id, category_id, sku, name, normalized_name, '
  + 'description, price_minor, currency, availability, status, '
  + 'media_refs_json, version, created_at, updated_at';
const SESSION_COLUMNS =
  'id, bot_username, identity_id, org_id, store_id, status, '
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
  version: number;
  created_at: string;
  updated_at: string;
}

interface CandidateRow extends ProductRow {
  category_name: string | null;
}

interface SessionRow {
  id: string;
  bot_username: string;
  identity_id: string;
  org_id: string;
  store_id: string;
  status: string;
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
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogStore {
  findOwnedActiveStore(
    orgId: string,
    identityId: string,
  ): Promise<CatalogOwnerStore | null>;
  findActiveStoreByOrg(orgId: string): Promise<CatalogOwnerStore | null>;
  findActiveStore(orgId: string, storeId: string): Promise<CatalogOwnerStore | null>;
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
  bindStorefrontSession(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
  }): Promise<StorefrontSession>;
  resolveStorefrontSession(
    botUsername: string,
    identityId: string,
  ): Promise<StorefrontContext | null>;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

  return {
    async findOwnedActiveStore(orgId, identityId) {
      const tenantId = requireCatalogId(orgId);
      const actorId = requireCatalogId(identityId);
      const row = await db
        .prepare(`SELECT store.id, store.org_id, store.locale
                  FROM sotuvchi_stores AS store
                  JOIN memberships AS membership
                    ON membership.org_id = store.org_id
                   AND membership.identity_id = ?
                   AND membership.role = 'owner'
                   AND membership.status = 'active'
                  WHERE store.org_id = ? AND store.status = 'active'`)
        .bind(actorId, tenantId)
        .first<{ id: string; org_id: string; locale: string }>();
      if (!row) return null;
      if (row.locale !== 'ru' && row.locale !== 'uz') {
        throw new CatalogPersistenceError('corrupt_row');
      }
      return {
        id: requireCatalogId(row.id),
        orgId: requireCatalogId(row.org_id),
        locale: row.locale,
      };
    },

    async findActiveStore(orgId, storeId) {
      const tenantId = requireCatalogId(orgId);
      const id = requireCatalogId(storeId);
      const row = await db
        .prepare(`SELECT id, org_id, locale
                  FROM sotuvchi_stores
                  WHERE org_id = ? AND id = ? AND status = 'active'`)
        .bind(tenantId, id)
        .first<{ id: string; org_id: string; locale: string }>();
      if (!row) return null;
      if (row.locale !== 'ru' && row.locale !== 'uz') {
        throw new CatalogPersistenceError('corrupt_row');
      }
      return {
        id: requireCatalogId(row.id),
        orgId: requireCatalogId(row.org_id),
        locale: row.locale,
      };
    },

    async findActiveStoreByOrg(orgId) {
      const tenantId = requireCatalogId(orgId);
      const row = await db
        .prepare(`SELECT id, org_id, locale
                  FROM sotuvchi_stores
                  WHERE org_id = ? AND status = 'active'`)
        .bind(tenantId)
        .first<{ id: string; org_id: string; locale: string }>();
      if (!row) return null;
      if (row.locale !== 'ru' && row.locale !== 'uz') {
        throw new CatalogPersistenceError('corrupt_row');
      }
      return {
        id: requireCatalogId(row.id),
        orgId: requireCatalogId(row.org_id),
        locale: row.locale,
      };
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
           media_refs_json, version, last_operation_key, created_at, updated_at)
          SELECT ?, store.org_id, store.id, ?, ?, ?, ?, ?, ?, 'UZS', ?,
                 'draft', ?, 1, ?, ?, ?
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
            ) < 20`)
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

    async findPublishedCandidates(context, normalizedQuery, tokens) {
      const rows = await db
        .prepare(`SELECT ${qualified(PRODUCT_COLUMNS, 'product')},
                         category.name AS category_name
                  FROM sotuvchi_products AS product
                  JOIN sotuvchi_stores AS store
                    ON store.org_id = product.org_id
                   AND store.id = product.store_id
                   AND store.status = 'active'
                  LEFT JOIN sotuvchi_categories AS category
                    ON category.org_id = product.org_id
                   AND category.store_id = product.store_id
                   AND category.id = product.category_id
                  WHERE product.org_id = ? AND product.store_id = ?
                    AND product.status = 'published'
                    AND (product.category_id IS NULL
                      OR category.status = 'active')
                    AND (
                      product.normalized_name = ?
                      OR product.normalized_name LIKE ?
                      OR EXISTS (
                        SELECT 1 FROM json_each(?) AS query_token
                        WHERE product.normalized_name
                          LIKE '%' || query_token.value || '%'
                      )
                    )
                  ORDER BY product.normalized_name ASC, product.id ASC
                  LIMIT 200`)
        .bind(
          context.orgId,
          context.storeId,
          normalizedQuery,
          `${normalizedQuery}%`,
          JSON.stringify(tokens),
        )
        .all<CandidateRow>();
      return (rows.results ?? []).map((row) => ({
        product: fromProductRow(row),
        categoryName: row.category_name === null
          ? null
          : normalizeCategoryName(row.category_name),
        normalizedName: row.normalized_name,
      }));
    },

    async listPublished(context, limit) {
      const rows = await db
        .prepare(`SELECT ${qualified(PRODUCT_COLUMNS, 'product')},
                         category.name AS category_name
                  FROM sotuvchi_products AS product
                  JOIN sotuvchi_stores AS store
                    ON store.org_id = product.org_id
                   AND store.id = product.store_id
                   AND store.status = 'active'
                  LEFT JOIN sotuvchi_categories AS category
                    ON category.org_id = product.org_id
                   AND category.store_id = product.store_id
                   AND category.id = product.category_id
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
        normalizedName: row.normalized_name,
      }));
    },

    async bindStorefrontSession(input) {
      const botUsername = requireBotUsername(input.botUsername);
      const identityId = requireCatalogId(input.identityId);
      const now = new Date().toISOString();
      const sessionId = `sotuvchi_session_${crypto.randomUUID()}`;
      await db
        .prepare(`INSERT INTO sotuvchi_storefront_sessions
          (id, bot_username, identity_id, org_id, store_id, status,
           created_at, updated_at)
          SELECT ?, ?, ?, store.org_id, store.id, 'active', ?, ?
          FROM sotuvchi_stores AS store
          WHERE store.org_id = ? AND store.id = ? AND store.status = 'active'
          ON CONFLICT(bot_username, identity_id) DO UPDATE SET
            org_id = excluded.org_id,
            store_id = excluded.store_id,
            status = 'active',
            updated_at = excluded.updated_at`)
        .bind(
          sessionId,
          botUsername,
          identityId,
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
        .prepare(`SELECT session.org_id, session.store_id, store.locale
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
  };
}
