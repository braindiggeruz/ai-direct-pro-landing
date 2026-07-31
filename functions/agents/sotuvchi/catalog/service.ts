import type { Locale } from '../../../platform/contracts';
import { normalizeKnowledgeText } from '../../../platform/knowledge';
import { ensureSotuvchiCatalogSchema } from './schema';
import {
  createSotuvchiCatalogStore,
  type CatalogCategoryWrite,
  type CatalogOperationInput,
  type CatalogOperationRecord,
  type CatalogProductWrite,
  type CatalogStore,
} from './store';
import type {
  CatalogCategory,
  BuyerCatalogCategory,
  CatalogComparisonCandidate,
  CatalogOwnerSeed,
  CatalogPresentation,
  CatalogProduct,
  CatalogRelevanceReason,
  CatalogSearchResult,
  CreateCatalogCategoryInput,
  CreateCatalogProductInput,
  ListCatalogProductsFilter,
  StoreOwnerContext,
  StorefrontContext,
  StorefrontSelection,
  StorefrontSession,
  UpdateCatalogCategoryInput,
  UpdateCatalogProductInput,
} from './types';
import { CATALOG_RELEVANCE_REASONS } from './types';
import {
  CatalogAuthorizationError,
  CatalogIdempotencyConflictError,
  CatalogNotFoundError,
  CatalogPersistenceError,
  CatalogStateError,
  CatalogVersionConflictError,
} from './errors';
import {
  CATALOG_LIMITS,
  normalizeCatalogOwnerSeed,
  normalizeCatalogQuery,
  normalizeCreateCategoryInput,
  normalizeCreateProductInput,
  normalizeProductFilter,
  normalizedProductName,
  normalizeStoreOwnerContext,
  normalizeStorefrontContext,
  normalizeUpdateCategoryInput,
  normalizeUpdateProductInput,
  requireBotUsername,
  requireCatalogId,
  requireCatalogLimit,
  requireCategorySlug,
  requireProductVersion,
} from './validation';

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
const MAX_SLUG_ATTEMPTS = 5;

export interface SotuvchiCatalogServiceOptions {
  categoryIdGenerator?: () => string;
  categorySlugGenerator?: () => string;
  productIdGenerator?: () => string;
  maxCategorySlugAttempts?: number;
}

function randomBase32(prefix: 'c' | 'p'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let buffer = 0;
  let bits = 0;
  let encoded = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += BASE32[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  return `${prefix}-${encoded}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function rankCatalogProducts(
  candidates: readonly {
    product: CatalogProduct;
    categoryName: string | null;
    storeName: string;
    normalizedName: string;
  }[],
  normalizedQuery: string,
  tokens: readonly string[],
): CatalogSearchResult[] {
  const results: CatalogSearchResult[] = [];
  for (const candidate of candidates) {
    const normalizedAliases = candidate.product.searchTerms.map(
      (term) => normalizeKnowledgeText(term),
    );
    const normalizedCategory = candidate.categoryName
      ? normalizeKnowledgeText(candidate.categoryName)
      : '';
    const normalizedSpecs = candidate.product.specifications.flatMap(
      (specification) => [
        normalizeKnowledgeText(specification.labelRu),
        normalizeKnowledgeText(specification.labelUz),
        normalizeKnowledgeText(specification.value),
      ],
    );
    const normalizedDescription = candidate.product.description
      ? normalizeKnowledgeText(candidate.product.description)
      : '';
    const searchDocument = [
      candidate.normalizedName,
      normalizedDescription,
      normalizedCategory,
      ...normalizedAliases,
      ...normalizedSpecs,
    ].filter(Boolean).join(' ');
    const matchedTokens = tokens.filter(
      (token) => searchDocument.includes(token),
    ).length;
    if (matchedTokens === 0) continue;
    let score: number;
    const reasonCodes: string[] = [];
    if (candidate.normalizedName === normalizedQuery) {
      score = 4_000;
      reasonCodes.push('exact_name');
    } else if (normalizedAliases.includes(normalizedQuery)) {
      score = 3_500;
      reasonCodes.push('exact_alias');
    } else if (candidate.normalizedName.startsWith(normalizedQuery)) {
      score = 3_000;
      reasonCodes.push('name_prefix');
    } else if (normalizedCategory === normalizedQuery) {
      score = 2_500;
      reasonCodes.push('category_match');
    } else if (matchedTokens === tokens.length) {
      score = 2_000 + matchedTokens;
      reasonCodes.push('all_tokens');
    } else {
      score = 1_000 + matchedTokens;
      reasonCodes.push('partial_tokens');
    }
    if (candidate.product.availability === 'available') {
      reasonCodes.push('available');
    } else if (candidate.product.availability === 'preorder') {
      reasonCodes.push('preorder');
    } else {
      reasonCodes.push('unavailable');
    }
    const unmatchedConstraints = tokens.filter(
      (token) => !searchDocument.includes(token),
    );
    results.push({
      product: candidate.product,
      categoryName: candidate.categoryName,
      storeName: candidate.storeName,
      score,
      matchedTokens,
      matchedConstraints: ['text'],
      unmatchedConstraints,
      confidence: score >= 3_500
        ? 'high'
        : matchedTokens === tokens.length
          ? 'medium'
          : 'low',
      reasonCodes,
      sourceProductId: candidate.product.id,
      sourceStoreId: candidate.product.storeId,
    });
  }
  return results.sort(
    (left, right) =>
      right.score - left.score
      || availabilityRank(left.product.availability)
        - availabilityRank(right.product.availability)
      || lexicalCompare(right.product.updatedAt, left.product.updatedAt)
      || lexicalCompare(
        normalizedProductName(left.product.name),
        normalizedProductName(right.product.name),
      )
      || lexicalCompare(left.product.id, right.product.id),
  );
}

export interface StorefrontComparisonResult {
  outcome: 'added' | 'duplicate' | 'full' | 'shown' | 'cleared';
  results: readonly CatalogSearchResult[];
}

function availabilityRank(
  availability: CatalogProduct['availability'],
): number {
  return availability === 'available' ? 0 : availability === 'preorder' ? 1 : 2;
}

function comparisonResult(
  candidate: CatalogComparisonCandidate,
): CatalogSearchResult {
  return {
    product: candidate.product,
    categoryName: candidate.categoryName,
    storeName: candidate.storeName,
    score: candidate.relevanceScore,
    matchedTokens: candidate.matchedRequirementCount,
    matchedConstraints: Array.from(
      { length: candidate.matchedRequirementCount },
      () => 'verified_requirement',
    ),
    unmatchedConstraints: Array.from(
      { length: candidate.missingRequirementCount },
      () => 'missing_requirement',
    ),
    confidence: candidate.relevanceScore >= 3_500
      ? 'high'
      : candidate.relevanceScore > 0
        ? 'medium'
        : 'low',
    reasonCodes: [candidate.relevanceReason, 'comparison'],
    sourceProductId: candidate.product.id,
    sourceStoreId: candidate.product.storeId,
  };
}

function presentationFor(
  result: CatalogSearchResult,
): CatalogPresentation {
  const relevanceReason = result.reasonCodes.find((reason) =>
    CATALOG_RELEVANCE_REASONS.includes(reason as CatalogRelevanceReason));
  return {
    productId: result.product.id,
    relevanceScore: Math.min(
      4_000,
      Math.max(0, Number.isInteger(result.score) ? result.score : 0),
    ),
    matchedRequirementCount: Math.min(
      12,
      Math.max(result.matchedTokens, result.matchedConstraints.length),
    ),
    missingRequirementCount: Math.min(
      12,
      result.unmatchedConstraints.length,
    ),
    relevanceReason:
      (relevanceReason as CatalogRelevanceReason | undefined)
      ?? 'catalog_listing',
  };
}

export function formatUzsPrice(priceMinor: number): string {
  const value = String(priceMinor);
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export class SotuvchiCatalogService {
  private readonly store: CatalogStore;
  private readonly categoryIdGenerator: () => string;
  private readonly categorySlugGenerator: () => string;
  private readonly productIdGenerator: () => string;
  private readonly maxSlugAttempts: number;

  constructor(
    private readonly db: D1Database,
    options: SotuvchiCatalogServiceOptions = {},
  ) {
    this.store = createSotuvchiCatalogStore(db);
    this.categoryIdGenerator = options.categoryIdGenerator
      ?? (() => randomBase32('c'));
    this.categorySlugGenerator = options.categorySlugGenerator
      ?? (() => randomBase32('c'));
    this.productIdGenerator = options.productIdGenerator
      ?? (() => randomBase32('p'));
    this.maxSlugAttempts = options.maxCategorySlugAttempts
      ?? MAX_SLUG_ATTEMPTS;
    if (
      !Number.isInteger(this.maxSlugAttempts)
      || this.maxSlugAttempts < 1
      || this.maxSlugAttempts > 10
    ) {
      throw new CatalogStateError('slug_collision');
    }
  }

  private async ready(): Promise<void> {
    await ensureSotuvchiCatalogSchema(this.db);
  }

  async resolveOwnerContext(rawSeed: unknown): Promise<StoreOwnerContext> {
    const seed: CatalogOwnerSeed = normalizeCatalogOwnerSeed(rawSeed);
    await this.ready();
    const store = await this.store.findOwnedActiveStore(
      seed.orgId,
      seed.identityId,
    );
    if (!store) throw new CatalogAuthorizationError();
    return {
      identityId: seed.identityId,
      orgId: seed.orgId,
      storeId: store.id,
      requestId: seed.requestId,
      locale: seed.locale,
    };
  }

  async resolveStorefrontContext(rawContext: unknown): Promise<StorefrontContext> {
    const context = normalizeStorefrontContext(rawContext);
    await this.ready();
    if (
      !await this.store.findActiveStore(context.orgId, context.storeId)
      || !await this.store.isPilotActive(context.orgId, context.storeId)
    ) {
      throw new CatalogNotFoundError('store');
    }
    return context;
  }

  async resolveStorefrontByOrg(
    orgId: unknown,
    locale: Locale,
  ): Promise<StorefrontContext> {
    await this.ready();
    const tenantId = requireCatalogId(orgId);
    const store = await this.store.findActiveStoreByOrg(tenantId);
    if (!store) throw new CatalogNotFoundError('store');
    return {
      orgId: tenantId,
      storeId: store.id,
      agentId: 'sotuvchi',
      locale,
    };
  }

  private async authorizeOwner(
    rawContext: unknown,
  ): Promise<StoreOwnerContext> {
    const context = normalizeStoreOwnerContext(rawContext);
    await this.ready();
    const store = await this.store.findOwnedActiveStore(
      context.orgId,
      context.identityId,
    );
    if (!store || store.id !== context.storeId) {
      throw new CatalogAuthorizationError();
    }
    return context;
  }

  private async operation(
    context: StoreOwnerContext,
    name: string,
    value: unknown,
  ): Promise<CatalogOperationInput> {
    return {
      idempotencyKey: context.requestId,
      operation: name,
      fingerprint: await fingerprint({ name, value }),
      createdAt: new Date().toISOString(),
    };
  }

  private async replay(
    context: StoreOwnerContext,
    operation: CatalogOperationInput,
  ): Promise<CatalogOperationRecord | null> {
    const record = await this.store.getOperation(
      context.orgId,
      context.storeId,
      operation.idempotencyKey,
    );
    if (!record) return null;
    if (
      record.operation !== operation.operation
      || record.fingerprint !== operation.fingerprint
    ) {
      throw new CatalogIdempotencyConflictError();
    }
    return record;
  }

  private async replayCategory(
    context: StoreOwnerContext,
    operation: CatalogOperationInput,
  ): Promise<CatalogCategory | null> {
    const replay = await this.replay(context, operation);
    if (!replay) return null;
    const category = await this.store.getCategory(
      context.orgId,
      context.storeId,
      replay.targetId,
    );
    if (!category) throw new CatalogPersistenceError('corrupt_row');
    return category;
  }

  private async replayProduct(
    context: StoreOwnerContext,
    operation: CatalogOperationInput,
  ): Promise<CatalogProduct | null> {
    const replay = await this.replay(context, operation);
    if (!replay) return null;
    const product = await this.store.getProduct(
      context.orgId,
      context.storeId,
      replay.targetId,
    );
    if (!product) throw new CatalogPersistenceError('corrupt_row');
    return product;
  }

  private async category(
    context: Pick<StoreOwnerContext | StorefrontContext, 'orgId' | 'storeId'>,
    categoryId: string,
  ): Promise<CatalogCategory> {
    const category = await this.store.getCategory(
      context.orgId,
      context.storeId,
      requireCatalogId(categoryId),
    );
    if (!category) throw new CatalogNotFoundError('category');
    return category;
  }

  async createCategory(
    rawContext: unknown,
    rawInput: unknown,
  ): Promise<CatalogCategory> {
    const context = await this.authorizeOwner(rawContext);
    const input: CreateCatalogCategoryInput =
      normalizeCreateCategoryInput(rawInput);
    const operation = await this.operation(
      context,
      'catalog.category.create',
      input,
    );
    const replay = await this.replayCategory(context, operation);
    if (replay) return replay;

    const categoryId = requireCatalogId(this.categoryIdGenerator());
    for (let attempt = 0; attempt < this.maxSlugAttempts; attempt += 1) {
      const slug = requireCategorySlug(this.categorySlugGenerator());
      const now = new Date().toISOString();
      const category: CatalogCategoryWrite = {
        id: categoryId,
        orgId: context.orgId,
        storeId: context.storeId,
        name: input.name,
        slug,
        status: 'active',
        sortOrder: input.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      try {
        const changes = await this.store.createCategory(
          context.identityId,
          category,
          operation,
        );
        if (changes[0] === 1 && changes[1] === 1) {
          const created = await this.store.getCategory(
            context.orgId,
            context.storeId,
            category.id,
          );
          if (!created) throw new CatalogPersistenceError('persistence_failed');
          return created;
        }
      } catch {
        const raced = await this.replayCategory(context, operation);
        if (raced) return raced;
        if (await this.store.categorySlugExists(
          context.orgId,
          context.storeId,
          slug,
        )) {
          continue;
        }
        throw new CatalogPersistenceError('persistence_failed');
      }
      const raced = await this.replayCategory(context, operation);
      if (raced) return raced;
      if (!await this.store.findOwnedActiveStore(
        context.orgId,
        context.identityId,
      )) {
        throw new CatalogAuthorizationError();
      }
      throw new CatalogPersistenceError('persistence_failed');
    }
    throw new CatalogStateError('slug_collision');
  }

  async listCategories(rawContext: unknown): Promise<CatalogCategory[]> {
    const context = await this.authorizeOwner(rawContext);
    return this.store.listCategories(context.orgId, context.storeId, true);
  }

  async updateCategory(
    rawContext: unknown,
    categoryId: unknown,
    rawPatch: unknown,
  ): Promise<CatalogCategory> {
    const context = await this.authorizeOwner(rawContext);
    const id = requireCatalogId(categoryId);
    const patch: UpdateCatalogCategoryInput =
      normalizeUpdateCategoryInput(rawPatch);
    const operation = await this.operation(
      context,
      'catalog.category.update',
      { id, patch },
    );
    const replay = await this.replayCategory(context, operation);
    if (replay) return replay;
    const current = await this.category(context, id);
    if (current.status === 'archived') {
      throw new CatalogStateError('category_archived');
    }
    const updated: CatalogCategoryWrite = {
      ...current,
      name: patch.name ?? current.name,
      sortOrder: patch.sortOrder ?? current.sortOrder,
      updatedAt: new Date().toISOString(),
    };
    try {
      const changes = await this.store.updateCategory(
        context.identityId,
        updated,
        operation,
      );
      if (changes[0] === 1 && changes[1] === 1) {
        return (await this.store.getCategory(
          context.orgId,
          context.storeId,
          id,
        )) ?? (() => { throw new CatalogPersistenceError('persistence_failed'); })();
      }
    } catch {
      const raced = await this.replayCategory(context, operation);
      if (raced) return raced;
      throw new CatalogPersistenceError('persistence_failed');
    }
    const raced = await this.replayCategory(context, operation);
    if (raced) return raced;
    throw new CatalogStateError('category_archived');
  }

  async archiveCategory(
    rawContext: unknown,
    categoryId: unknown,
  ): Promise<CatalogCategory> {
    const context = await this.authorizeOwner(rawContext);
    const id = requireCatalogId(categoryId);
    const operation = await this.operation(
      context,
      'catalog.category.archive',
      { id },
    );
    const replay = await this.replayCategory(context, operation);
    if (replay) return replay;
    const current = await this.category(context, id);
    if (current.status === 'archived') {
      throw new CatalogStateError('category_archived');
    }
    try {
      const changes = await this.store.archiveCategory(
        context.identityId,
        current,
        operation,
      );
      if (changes[0] === 1 && changes[1] === 1) {
        return (await this.store.getCategory(
          context.orgId,
          context.storeId,
          id,
        )) ?? (() => { throw new CatalogPersistenceError('persistence_failed'); })();
      }
    } catch {
      const raced = await this.replayCategory(context, operation);
      if (raced) return raced;
      throw new CatalogPersistenceError('persistence_failed');
    }
    const raced = await this.replayCategory(context, operation);
    if (raced) return raced;
    throw new CatalogStateError('category_archived');
  }

  private async validateProductCategory(
    context: Pick<StoreOwnerContext, 'orgId' | 'storeId'>,
    categoryId: string | null,
    requireActive: boolean,
  ): Promise<void> {
    if (categoryId === null) return;
    const category = await this.category(context, categoryId);
    if (requireActive && category.status !== 'active') {
      throw new CatalogStateError('category_inactive');
    }
  }

  async createProduct(
    rawContext: unknown,
    rawInput: unknown,
  ): Promise<CatalogProduct> {
    const context = await this.authorizeOwner(rawContext);
    const input: CreateCatalogProductInput =
      normalizeCreateProductInput(rawInput);
    await this.validateProductCategory(context, input.categoryId ?? null, false);
    const operation = await this.operation(
      context,
      'catalog.product.create',
      input,
    );
    const replay = await this.replayProduct(context, operation);
    if (replay) return replay;
    if (
      input.sku
      && await this.store.productSkuExists(
        context.orgId,
        context.storeId,
        input.sku,
      )
    ) {
      throw new CatalogStateError('sku_conflict');
    }
    if (
      await this.store.countCurrentProducts(context.orgId, context.storeId)
      >= CATALOG_LIMITS.productLimit
    ) {
      throw new CatalogStateError('catalog_limit');
    }
    const now = new Date().toISOString();
    const product: CatalogProductWrite = {
      id: requireCatalogId(this.productIdGenerator()),
      orgId: context.orgId,
      storeId: context.storeId,
      categoryId: input.categoryId ?? null,
      sku: input.sku ?? null,
      name: input.name,
      normalizedName: normalizedProductName(input.name),
      description: input.description ?? null,
      priceMinor: input.priceMinor,
      currency: 'UZS',
      availability: input.availability,
      status: 'draft',
      mediaRefs: input.mediaRefs ?? [],
      searchTerms: input.searchTerms ?? [],
      specifications: input.specifications ?? [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const changes = await this.store.createProduct(
        context.identityId,
        product,
        operation,
      );
      if (changes[0] === 1 && changes[1] === 1) {
        return (await this.store.getProduct(
          context.orgId,
          context.storeId,
          product.id,
        )) ?? (() => { throw new CatalogPersistenceError('persistence_failed'); })();
      }
    } catch {
      const raced = await this.replayProduct(context, operation);
      if (raced) return raced;
      if (
        input.sku
        && await this.store.productSkuExists(
          context.orgId,
          context.storeId,
          input.sku,
        )
      ) {
        throw new CatalogStateError('sku_conflict');
      }
      throw new CatalogPersistenceError('persistence_failed');
    }
    const raced = await this.replayProduct(context, operation);
    if (raced) return raced;
    if (
      await this.store.countCurrentProducts(context.orgId, context.storeId)
      >= CATALOG_LIMITS.productLimit
    ) {
      throw new CatalogStateError('catalog_limit');
    }
    throw new CatalogAuthorizationError();
  }

  async getProduct(
    rawContext: unknown,
    productId: unknown,
  ): Promise<CatalogProduct> {
    const context = await this.authorizeOwner(rawContext);
    const product = await this.store.getProduct(
      context.orgId,
      context.storeId,
      requireCatalogId(productId),
    );
    if (!product) throw new CatalogNotFoundError('product');
    return product;
  }

  async listProducts(
    rawContext: unknown,
    rawFilter?: unknown,
  ): Promise<CatalogProduct[]> {
    const context = await this.authorizeOwner(rawContext);
    const filter: ListCatalogProductsFilter =
      normalizeProductFilter(rawFilter);
    return this.store.listProducts(context.orgId, context.storeId, filter);
  }

  async updateProduct(
    rawContext: unknown,
    productId: unknown,
    expectedVersion: unknown,
    rawPatch: unknown,
  ): Promise<CatalogProduct> {
    const context = await this.authorizeOwner(rawContext);
    const id = requireCatalogId(productId);
    const version = requireProductVersion(expectedVersion);
    const patch: UpdateCatalogProductInput =
      normalizeUpdateProductInput(rawPatch);
    const operation = await this.operation(
      context,
      'catalog.product.update',
      { id, version, patch },
    );
    const replay = await this.replayProduct(context, operation);
    if (replay) return replay;
    const current = await this.store.getProduct(
      context.orgId,
      context.storeId,
      id,
    );
    if (!current) throw new CatalogNotFoundError('product');
    if (current.status === 'archived') {
      throw new CatalogStateError('product_archived');
    }
    if (current.version !== version) throw new CatalogVersionConflictError();
    const next: CatalogProductWrite = {
      ...current,
      categoryId: patch.categoryId === undefined
        ? current.categoryId
        : patch.categoryId,
      sku: patch.sku === undefined ? current.sku : patch.sku,
      name: patch.name ?? current.name,
      normalizedName: normalizedProductName(patch.name ?? current.name),
      description: patch.description === undefined
        ? current.description
        : patch.description,
      priceMinor: patch.priceMinor ?? current.priceMinor,
      currency: patch.currency ?? current.currency,
      availability: patch.availability ?? current.availability,
      mediaRefs: patch.mediaRefs ?? current.mediaRefs,
      searchTerms: patch.searchTerms ?? current.searchTerms,
      specifications: patch.specifications ?? current.specifications,
      updatedAt: new Date().toISOString(),
    };
    await this.validateProductCategory(
      context,
      next.categoryId,
      current.status === 'published',
    );
    if (
      next.sku
      && await this.store.productSkuExists(
        context.orgId,
        context.storeId,
        next.sku,
        current.id,
      )
    ) {
      throw new CatalogStateError('sku_conflict');
    }
    try {
      const changes = await this.store.updateProduct(
        context.identityId,
        next,
        version,
        operation,
      );
      if (changes[0] === 1 && changes[1] === 1) {
        return (await this.store.getProduct(
          context.orgId,
          context.storeId,
          id,
        )) ?? (() => { throw new CatalogPersistenceError('persistence_failed'); })();
      }
    } catch {
      const raced = await this.replayProduct(context, operation);
      if (raced) return raced;
      const refreshed = await this.store.getProduct(
        context.orgId,
        context.storeId,
        id,
      );
      if (!refreshed) throw new CatalogNotFoundError('product');
      if (refreshed.version !== version) throw new CatalogVersionConflictError();
      throw new CatalogPersistenceError('persistence_failed');
    }
    const raced = await this.replayProduct(context, operation);
    if (raced) return raced;
    const refreshed = await this.store.getProduct(
      context.orgId,
      context.storeId,
      id,
    );
    if (!refreshed) throw new CatalogNotFoundError('product');
    if (refreshed.version !== version) throw new CatalogVersionConflictError();
    throw new CatalogPersistenceError('persistence_failed');
  }

  private async transitionProduct(
    rawContext: unknown,
    productId: unknown,
    expectedVersion: unknown,
    transition: 'publish' | 'unpublish' | 'archive',
  ): Promise<CatalogProduct> {
    const context = await this.authorizeOwner(rawContext);
    const id = requireCatalogId(productId);
    const version = requireProductVersion(expectedVersion);
    const operation = await this.operation(
      context,
      `catalog.product.${transition}`,
      { id, version },
    );
    const replay = await this.replayProduct(context, operation);
    if (replay) return replay;
    const current = await this.store.getProduct(
      context.orgId,
      context.storeId,
      id,
    );
    if (!current) throw new CatalogNotFoundError('product');
    if (current.version !== version) throw new CatalogVersionConflictError();
    if (current.status === 'archived') {
      throw new CatalogStateError('product_archived');
    }
    const target = transition === 'publish'
      ? 'published'
      : transition === 'unpublish'
        ? 'draft'
        : 'archived';
    if (
      transition === 'publish' && current.status !== 'draft'
      || transition === 'unpublish' && current.status !== 'published'
    ) {
      throw new CatalogStateError('invalid_transition');
    }
    if (transition === 'publish') {
      await this.validateProductCategory(context, current.categoryId, true);
    }
    try {
      const changes = await this.store.setProductStatus(
        context.identityId,
        current,
        target,
        version,
        operation,
      );
      if (changes[0] === 1 && changes[1] === 1) {
        return (await this.store.getProduct(
          context.orgId,
          context.storeId,
          id,
        )) ?? (() => { throw new CatalogPersistenceError('persistence_failed'); })();
      }
    } catch {
      const raced = await this.replayProduct(context, operation);
      if (raced) return raced;
      const refreshed = await this.store.getProduct(
        context.orgId,
        context.storeId,
        id,
      );
      if (!refreshed) throw new CatalogNotFoundError('product');
      if (refreshed.version !== version) throw new CatalogVersionConflictError();
      throw new CatalogPersistenceError('persistence_failed');
    }
    const raced = await this.replayProduct(context, operation);
    if (raced) return raced;
    const refreshed = await this.store.getProduct(
      context.orgId,
      context.storeId,
      id,
    );
    if (!refreshed) throw new CatalogNotFoundError('product');
    if (refreshed.version !== version) throw new CatalogVersionConflictError();
    throw new CatalogPersistenceError('persistence_failed');
  }

  publishProduct(
    context: unknown,
    productId: unknown,
    expectedVersion: unknown,
  ): Promise<CatalogProduct> {
    return this.transitionProduct(
      context,
      productId,
      expectedVersion,
      'publish',
    );
  }

  unpublishProduct(
    context: unknown,
    productId: unknown,
    expectedVersion: unknown,
  ): Promise<CatalogProduct> {
    return this.transitionProduct(
      context,
      productId,
      expectedVersion,
      'unpublish',
    );
  }

  archiveProduct(
    context: unknown,
    productId: unknown,
    expectedVersion: unknown,
  ): Promise<CatalogProduct> {
    return this.transitionProduct(
      context,
      productId,
      expectedVersion,
      'archive',
    );
  }

  async searchPublishedProducts(
    rawContext: unknown,
    query: unknown,
    limit?: unknown,
  ): Promise<CatalogSearchResult[]> {
    const context = await this.resolveStorefrontContext(rawContext);
    const safeQuery = normalizeCatalogQuery(query);
    const safeLimit = requireCatalogLimit(limit);
    const candidates = await this.store.findPublishedCandidates(
      context,
      safeQuery.normalized,
      safeQuery.tokens,
    );
    return rankCatalogProducts(
      candidates,
      safeQuery.normalized,
      safeQuery.tokens,
    ).slice(0, safeLimit);
  }

  async listPublishedProducts(
    rawContext: unknown,
    limit?: unknown,
  ): Promise<CatalogSearchResult[]> {
    const context = await this.resolveStorefrontContext(rawContext);
    const candidates = await this.store.listPublished(
      context,
      requireCatalogLimit(limit),
    );
    return candidates.map((candidate) => ({
      product: candidate.product,
      categoryName: candidate.categoryName,
      storeName: candidate.storeName,
      score: 0,
      matchedTokens: 0,
      matchedConstraints: [],
      unmatchedConstraints: [],
      confidence: 'low',
      reasonCodes: ['catalog_listing'],
      sourceProductId: candidate.product.id,
      sourceStoreId: candidate.product.storeId,
    }));
  }

  async listBuyerCategories(
    rawContext: unknown,
  ): Promise<BuyerCatalogCategory[]> {
    const context = await this.resolveStorefrontContext(rawContext);
    return this.store.listBuyerCategories(context);
  }

  async listPublishedProductsByCategory(
    rawContext: unknown,
    categoryId: unknown,
    limit?: unknown,
  ): Promise<CatalogSearchResult[]> {
    const context = await this.resolveStorefrontContext(rawContext);
    const candidates = await this.store.listPublishedByCategory(
      context,
      requireCatalogId(categoryId),
      requireCatalogLimit(limit),
    );
    return candidates.map((candidate) => ({
      product: candidate.product,
      categoryName: candidate.categoryName,
      storeName: candidate.storeName,
      score: 2_500,
      matchedTokens: 0,
      matchedConstraints: ['category'],
      unmatchedConstraints: [],
      confidence: 'high',
      reasonCodes: [
        'category_match',
        candidate.product.availability,
      ],
      sourceProductId: candidate.product.id,
      sourceStoreId: candidate.product.storeId,
    }));
  }

  async getPublishedProduct(
    rawContext: unknown,
    productId: unknown,
  ): Promise<CatalogProduct> {
    const context = await this.resolveStorefrontContext(rawContext);
    const product = await this.store.getProduct(
      context.orgId,
      context.storeId,
      requireCatalogId(productId),
    );
    if (!product || product.status !== 'published') {
      throw new CatalogNotFoundError('product');
    }
    if (product.categoryId) {
      const category = await this.store.getCategory(
        context.orgId,
        context.storeId,
        product.categoryId,
      );
      if (!category || category.status !== 'active') {
        throw new CatalogNotFoundError('product');
      }
    }
    return product;
  }

  async getPublishedProductResult(
    rawContext: unknown,
    productId: unknown,
  ): Promise<CatalogSearchResult> {
    const context = await this.resolveStorefrontContext(rawContext);
    const product = await this.getPublishedProduct(context, productId);
    const category = product.categoryId
      ? await this.store.getCategory(
          context.orgId,
          context.storeId,
          product.categoryId,
        )
      : null;
    const store = await this.store.findActiveStore(
      context.orgId,
      context.storeId,
    );
    if (!store) throw new CatalogNotFoundError('store');
    return {
      product,
      categoryName: category?.name ?? null,
      storeName: store.name,
      score: 4_000,
      matchedTokens: 1,
      matchedConstraints: ['product_reference'],
      unmatchedConstraints: [],
      confidence: 'high',
      reasonCodes: ['exact_product_reference', product.availability],
      sourceProductId: product.id,
      sourceStoreId: product.storeId,
    };
  }

  async recordStorefrontPresentation(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
    requestId: string;
    results: readonly CatalogSearchResult[];
  }): Promise<void> {
    await this.ready();
    if (input.results.length < 1 || input.results.length > 4) {
      throw new CatalogPersistenceError('persistence_failed');
    }
    const context = await this.resolveStorefrontContext(input.context);
    await this.store.recordStorefrontPresentation({
      botUsername: requireBotUsername(input.botUsername),
      identityId: requireCatalogId(input.identityId),
      context,
      requestId: input.requestId,
      presentations: input.results.map(presentationFor),
    });
  }

  async addStorefrontComparison(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
    productId: string;
  }): Promise<StorefrontComparisonResult> {
    await this.ready();
    const context = await this.resolveStorefrontContext(input.context);
    const botUsername = requireBotUsername(input.botUsername);
    const identityId = requireCatalogId(input.identityId);
    const productId = requireCatalogId(input.productId);
    await this.getPublishedProduct(context, productId);
    const outcome = await this.store.addComparisonProduct({
      botUsername,
      identityId,
      context,
      productId,
    });
    if (outcome === 'not_found') throw new CatalogNotFoundError('product');
    const results = await this.store.listComparisonProducts({
      botUsername,
      identityId,
      context,
    });
    return {
      outcome,
      results: results.map(comparisonResult),
    };
  }

  async listStorefrontComparison(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
  }): Promise<StorefrontComparisonResult> {
    await this.ready();
    const context = await this.resolveStorefrontContext(input.context);
    const results = await this.store.listComparisonProducts({
      botUsername: requireBotUsername(input.botUsername),
      identityId: requireCatalogId(input.identityId),
      context,
    });
    return {
      outcome: 'shown',
      results: results.map(comparisonResult),
    };
  }

  async clearStorefrontComparison(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
  }): Promise<StorefrontComparisonResult> {
    await this.ready();
    const context = await this.resolveStorefrontContext(input.context);
    await this.store.clearComparisonProducts({
      botUsername: requireBotUsername(input.botUsername),
      identityId: requireCatalogId(input.identityId),
      context,
    });
    return { outcome: 'cleared', results: [] };
  }

  async bindStorefrontSession(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
  }): Promise<StorefrontSession> {
    await this.ready();
    const context = await this.resolveStorefrontContext(input.context);
    return this.store.bindStorefrontSession({
      botUsername: requireBotUsername(input.botUsername),
      identityId: requireCatalogId(input.identityId),
      context,
    });
  }

  async resolveStoredStorefrontContext(
    botUsername: string,
    identityId: string,
  ): Promise<StorefrontContext | null> {
    await this.ready();
    return this.store.resolveStorefrontSession(
      requireBotUsername(botUsername),
      requireCatalogId(identityId),
    );
  }

  async setStoredStorefrontLocale(
    botUsername: string,
    identityId: string,
    locale: Locale,
  ): Promise<StorefrontContext> {
    await this.ready();
    const safeBot = requireBotUsername(botUsername);
    const safeIdentity = requireCatalogId(identityId);
    const current = await this.store.resolveStorefrontSession(
      safeBot,
      safeIdentity,
    );
    if (!current) throw new CatalogNotFoundError('store');
    const updated = await this.store.setStorefrontLocale({
      botUsername: safeBot,
      identityId: safeIdentity,
      context: current,
      locale,
    });
    if (!updated) throw new CatalogNotFoundError('store');
    return updated;
  }

  async setStorefrontPendingBudget(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
    requestId: string;
  }): Promise<void> {
    await this.ready();
    const context = await this.resolveStorefrontContext(input.context);
    const changed = await this.store.setPendingBudget({
      botUsername: requireBotUsername(input.botUsername),
      identityId: requireCatalogId(input.identityId),
      context,
      requestId: input.requestId,
    });
    if (!changed) throw new CatalogNotFoundError('store');
  }

  async consumeStorefrontPendingBudget(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
  }): Promise<boolean> {
    await this.ready();
    const context = await this.resolveStorefrontContext(input.context);
    return this.store.consumePendingBudget({
      botUsername: requireBotUsername(input.botUsername),
      identityId: requireCatalogId(input.identityId),
      context,
    });
  }

  async clearStorefrontPendingBudget(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
  }): Promise<void> {
    await this.ready();
    const context = await this.resolveStorefrontContext(input.context);
    await this.store.clearPendingBudget({
      botUsername: requireBotUsername(input.botUsername),
      identityId: requireCatalogId(input.identityId),
      context,
    });
  }

  async recordStorefrontSelection(input: {
    botUsername: string;
    identityId: string;
    context: StorefrontContext;
    productId: string;
    intent: string;
    requestId: string;
  }): Promise<StorefrontSession> {
    await this.ready();
    const context = await this.resolveStorefrontContext(input.context);
    await this.getPublishedProduct(context, input.productId);
    return this.store.recordStorefrontSelection({
      botUsername: requireBotUsername(input.botUsername),
      identityId: requireCatalogId(input.identityId),
      context,
      productId: requireCatalogId(input.productId),
      intent: input.intent,
      requestId: input.requestId,
    });
  }

  async resolveStoredProductSelection(
    botUsername: string,
    identityId: string,
  ): Promise<StorefrontSelection | null> {
    await this.ready();
    return this.store.resolveStorefrontSelection(
      requireBotUsername(botUsername),
      requireCatalogId(identityId),
    );
  }
}

export function createSotuvchiCatalogService(
  db: D1Database,
  options: SotuvchiCatalogServiceOptions = {},
): SotuvchiCatalogService {
  return new SotuvchiCatalogService(db, options);
}

export function availabilityLabel(
  availability: CatalogProduct['availability'],
  locale: Locale,
): string {
  const labels = {
    ru: {
      available: 'в наличии',
      unavailable: 'нет в наличии',
      preorder: 'предзаказ',
    },
    uz: {
      available: 'mavjud',
      unavailable: 'mavjud emas',
      preorder: 'oldindan buyurtma',
    },
  } as const;
  return labels[locale][availability];
}
