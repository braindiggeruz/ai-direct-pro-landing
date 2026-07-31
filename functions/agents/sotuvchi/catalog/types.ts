import type { Locale } from '../../../platform/contracts';

export const CATALOG_CATEGORY_STATUSES = ['active', 'archived'] as const;
export const CATALOG_PRODUCT_STATUSES = [
  'draft',
  'published',
  'archived',
] as const;
export const CATALOG_AVAILABILITIES = [
  'available',
  'unavailable',
  'preorder',
] as const;

export type CatalogCategoryStatus =
  (typeof CATALOG_CATEGORY_STATUSES)[number];
export type CatalogProductStatus =
  (typeof CATALOG_PRODUCT_STATUSES)[number];
export type CatalogAvailability =
  (typeof CATALOG_AVAILABILITIES)[number];

export interface CatalogCategory {
  id: string;
  orgId: string;
  storeId: string;
  name: string;
  slug: string;
  status: CatalogCategoryStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogProduct {
  id: string;
  orgId: string;
  storeId: string;
  categoryId: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: 'UZS';
  availability: CatalogAvailability;
  status: CatalogProductStatus;
  mediaRefs: readonly string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoreOwnerContext {
  identityId: string;
  orgId: string;
  storeId: string;
  requestId: string;
  locale: Locale;
}

export interface StorefrontContext {
  orgId: string;
  storeId: string;
  agentId: 'sotuvchi';
  locale: Locale;
}

export interface CatalogOwnerSeed {
  identityId: string;
  orgId: string;
  requestId: string;
  locale: Locale;
}

export interface CreateCatalogCategoryInput {
  name: string;
  sortOrder?: number;
}

export interface UpdateCatalogCategoryInput {
  name?: string;
  sortOrder?: number;
}

export interface CreateCatalogProductInput {
  categoryId?: string | null;
  sku?: string | null;
  name: string;
  description?: string | null;
  priceMinor: number;
  currency: 'UZS';
  availability: CatalogAvailability;
  mediaRefs?: readonly string[];
}

export interface UpdateCatalogProductInput {
  categoryId?: string | null;
  sku?: string | null;
  name?: string;
  description?: string | null;
  priceMinor?: number;
  currency?: 'UZS';
  availability?: CatalogAvailability;
  mediaRefs?: readonly string[];
}

export interface ListCatalogProductsFilter {
  status?: CatalogProductStatus;
  categoryId?: string | null;
  limit?: number;
}

export interface CatalogSearchResult {
  product: CatalogProduct;
  categoryName: string | null;
  score: number;
  matchedTokens: number;
}

export interface CatalogProductCandidate {
  product: CatalogProduct;
  categoryName: string | null;
  normalizedName: string;
}

export interface StorefrontSession {
  id: string;
  botUsername: string;
  identityId: string;
  orgId: string;
  storeId: string;
  status: 'active' | 'disabled';
  lastProductId: string | null;
  lastIntent: string | null;
  selectionRequestKey: string | null;
  selectedAt: string | null;
  preferredLocale: Locale | null;
  pendingIntent: 'budget' | null;
  pendingRequestKey: string | null;
  pendingAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StorefrontSelection {
  context: StorefrontContext;
  productId: string;
  lastIntent: string;
  selectedAt: string;
}
