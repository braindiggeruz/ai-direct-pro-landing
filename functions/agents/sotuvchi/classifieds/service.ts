import {
  CatalogAuthorizationError,
  CatalogIdempotencyConflictError,
  CatalogNotFoundError,
  CatalogValidationError,
  normalizeMediaRefs,
  normalizeCatalogQuery,
  normalizePriceMinor,
  normalizeProductDescription,
  normalizeProductName,
  normalizedProductName,
  requireCatalogId,
} from '../catalog';
import { ensureClassifiedsJourneySchema, ensureClassifiedsSchema } from './schema';
import { createClassifiedsStore, type ClassifiedsStore } from './store';
import {
  CLASSIFIED_CONDITIONS,
  type ClassifiedDiscoveryFilter,
  type ClassifiedDiscoveryPage,
  type ClassifiedBuyerInquiry,
  type ClassifiedListing,
  type ListingReportContext,
  type ListingReportReason,
  type ListingReportSubmission,
  type NormalizedClassifiedDiscoveryFilter,
  type PrivateListingSubmission,
  type PrivateSellerContext,
  type PrivateSellerProfile,
  type SubmitPrivateListingInput,
  type SubmitListingReportInput,
  type CreateListingInquiryInput,
} from './types';

const CONDITION_SET = new Set<string>(CLASSIFIED_CONDITIONS);
const AVAILABILITY = new Set<ClassifiedListing['availability']>([
  'available', 'preorder', 'unavailable',
]);
const SELLER_TYPES = new Set(['private', 'store']);
const CONTACT_MODES = new Set(['in_app', 'telegram_relay', 'phone_optional']);
const REPORT_REASONS = new Set<ListingReportReason>([
  'prohibited_item',
  'suspected_fraud',
  'duplicate_listing',
  'misleading_content',
  'unsafe_contact',
  'personal_data',
  'other_policy',
]);
const SAFE_OPERATION_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

interface SellerProfileRow {
  id: string;
  identity_id: string;
  public_display_name: string;
  seller_type: 'private' | 'store';
  verification_state: 'unverified' | 'identity_verified' | 'store_verified';
  status: 'active' | 'restricted' | 'suspended' | 'closed';
  moderation_state: 'clear' | 'under_review' | 'restricted' | 'blocked';
  version: number;
}

interface BuyerInquiryRow {
  id: string;
  product_id: string;
  listing_name: string;
  seller_display_name: string;
  contact_mode: ClassifiedBuyerInquiry['contactMode'];
  message: string;
  reply_text: string | null;
  status: ClassifiedBuyerInquiry['status'];
  version: number;
  created_at: string;
  updated_at: string;
}

function buyerInquiry(row: BuyerInquiryRow): ClassifiedBuyerInquiry {
  return {
    id: row.id,
    listing: { id: row.product_id, name: row.listing_name },
    sellerDisplayName: row.seller_display_name,
    contactMode: row.contact_mode,
    message: row.message,
    reply: row.reply_text,
    status: row.status,
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SotuvchiClassifiedsServiceOptions {
  sellerProfileIdGenerator?: () => string;
  productIdGenerator?: () => string;
  auditEventIdGenerator?: () => string;
  reportIdGenerator?: () => string;
  inquiryIdGenerator?: () => string;
}

function randomId(prefix: 'sp' | 'l' | 'ma' | 'r' | 'i'): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export class ClassifiedsRateLimitError extends Error {
  readonly code = 'rate_limited';

  constructor() {
    super('classifieds rate limit exceeded');
    this.name = 'ClassifiedsRateLimitError';
  }
}

function operationKey(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 180
    || !SAFE_OPERATION_KEY.test(value)
  ) {
    throw new CatalogValidationError('invalid_context');
  }
  return value;
}

function sellerContext(input: PrivateSellerContext): PrivateSellerContext {
  return {
    identityId: requireCatalogId(input.identityId),
    requestId: requireCatalogId(input.requestId),
    idempotencyKey: operationKey(input.idempotencyKey),
  };
}

function profile(row: SellerProfileRow): PrivateSellerProfile {
  if (row.seller_type !== 'private' || row.verification_state === 'store_verified') {
    throw new CatalogAuthorizationError();
  }
  return {
    id: row.id,
    displayName: row.public_display_name,
    sellerType: 'private',
    verificationState: row.verification_state,
    status: row.status,
    moderationState: row.moderation_state,
    version: Number(row.version),
  };
}

function displayName(value: unknown): string {
  if (typeof value !== 'string') throw new CatalogValidationError('invalid_name');
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (
    normalized.length < 2
    || normalized.length > 80
    || [...normalized].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    throw new CatalogValidationError('invalid_name');
  }
  return normalized;
}

function locality(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new CatalogValidationError('invalid_context');
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (
    normalized.length < 1
    || normalized.length > 120
    || [...normalized].some((character) => character.charCodeAt(0) < 32)
  ) {
    throw new CatalogValidationError('invalid_context');
  }
  return normalized;
}

function reportNote(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new CatalogValidationError('invalid_description');
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < 1 || normalized.length > 500) {
    throw new CatalogValidationError('invalid_description');
  }
  return normalized;
}

function inquiryMessage(value: unknown): string {
  if (typeof value !== 'string') throw new CatalogValidationError('invalid_description');
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (
    normalized.length < 2
    || normalized.length > 500
    || [...normalized].some((character) => character.charCodeAt(0) < 32)
  ) {
    throw new CatalogValidationError('invalid_description');
  }
  return normalized;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(stableStringify(value)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function optionalId(value: unknown): string | null {
  return value === undefined || value === null || value === ''
    ? null
    : requireCatalogId(value);
}

function price(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1_000_000_000_000) {
    throw new CatalogValidationError('invalid_price');
  }
  return parsed;
}

function parseCursor(value: unknown): { updatedAt: string; id: string } | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 256) {
    throw new CatalogValidationError('invalid_id');
  }
  const separator = value.indexOf('~');
  if (separator < 1 || separator === value.length - 1) {
    throw new CatalogValidationError('invalid_id');
  }
  let updatedAt: string;
  let id: string;
  try {
    updatedAt = decodeURIComponent(value.slice(0, separator));
    id = requireCatalogId(decodeURIComponent(value.slice(separator + 1)));
  } catch {
    throw new CatalogValidationError('invalid_id');
  }
  if (updatedAt.length < 1 || updatedAt.length > 64 || Number.isNaN(Date.parse(updatedAt))) {
    throw new CatalogValidationError('invalid_id');
  }
  return { updatedAt, id };
}

export function normalizeClassifiedDiscoveryFilter(
  input: ClassifiedDiscoveryFilter,
): NormalizedClassifiedDiscoveryFilter {
  const condition = input.condition ?? null;
  const sellerType = input.sellerType ?? null;
  const availability = input.availability ?? null;
  if (condition !== null && !CONDITION_SET.has(condition)) {
    throw new CatalogValidationError('invalid_context');
  }
  if (sellerType !== null && !SELLER_TYPES.has(sellerType)) {
    throw new CatalogValidationError('invalid_context');
  }
  if (availability !== null && !AVAILABILITY.has(availability)) {
    throw new CatalogValidationError('invalid_context');
  }
  const minPriceMinor = price(input.minPriceMinor);
  const maxPriceMinor = price(input.maxPriceMinor);
  if (minPriceMinor !== null && maxPriceMinor !== null && minPriceMinor > maxPriceMinor) {
    throw new CatalogValidationError('invalid_price');
  }
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new CatalogValidationError('invalid_limit');
  }
  const query = input.query?.trim() ?? '';
  return {
    categoryId: optionalId(input.categoryId),
    regionId: optionalId(input.regionId),
    districtId: optionalId(input.districtId),
    condition,
    sellerType,
    availability,
    storeId: optionalId(input.storeId),
    minPriceMinor,
    maxPriceMinor,
    normalizedQuery: query ? normalizeCatalogQuery(query).normalized : null,
    cursor: parseCursor(input.cursor),
    limit,
  };
}

export class SotuvchiClassifiedsService {
  private readonly store: ClassifiedsStore;
  private readonly sellerProfileIdGenerator: () => string;
  private readonly productIdGenerator: () => string;
  private readonly auditEventIdGenerator: () => string;
  private readonly reportIdGenerator: () => string;
  private readonly inquiryIdGenerator: () => string;

  constructor(
    private readonly db: D1Database,
    options: SotuvchiClassifiedsServiceOptions = {},
  ) {
    this.store = createClassifiedsStore(db);
    this.sellerProfileIdGenerator = options.sellerProfileIdGenerator ?? (() => randomId('sp'));
    this.productIdGenerator = options.productIdGenerator ?? (() => randomId('l'));
    this.auditEventIdGenerator = options.auditEventIdGenerator ?? (() => randomId('ma'));
    this.reportIdGenerator = options.reportIdGenerator ?? (() => randomId('r'));
    this.inquiryIdGenerator = options.inquiryIdGenerator ?? (() => randomId('i'));
  }

  private async ready(): Promise<void> {
    await ensureClassifiedsSchema(this.db);
  }

  private async journeyReady(): Promise<void> {
    await ensureClassifiedsJourneySchema(this.db);
  }

  async discover(input: ClassifiedDiscoveryFilter): Promise<ClassifiedDiscoveryPage> {
    const filter = normalizeClassifiedDiscoveryFilter(input);
    await this.ready();
    return this.store.list(filter);
  }

  async getPublished(id: unknown): Promise<ClassifiedListing> {
    const productId = requireCatalogId(id);
    await this.ready();
    const result = await this.store.get(productId);
    if (!result) throw new CatalogNotFoundError('product');
    return result;
  }

  async listCategories() {
    await this.ready();
    return this.store.categories();
  }

  async listLocations() {
    await this.ready();
    return this.store.locations();
  }

  async createPrivateSellerProfile(
    rawContext: PrivateSellerContext,
    rawDisplayName: unknown,
  ): Promise<PrivateSellerProfile> {
    const context = sellerContext(rawContext);
    const name = displayName(rawDisplayName);
    await this.ready();
    const existing = await this.db.prepare(`
      SELECT id, identity_id, public_display_name, seller_type,
        verification_state, status, moderation_state, version
      FROM seller_profiles WHERE identity_id = ?
    `).bind(context.identityId).first<SellerProfileRow>();
    if (existing) return profile(existing);
    const identity = await this.db.prepare(
      'SELECT COUNT(*) AS n FROM identities WHERE id = ?',
    ).bind(context.identityId).first<{ n: number }>();
    if (Number(identity?.n ?? 0) !== 1) throw new CatalogAuthorizationError();
    const id = requireCatalogId(this.sellerProfileIdGenerator());
    const now = new Date().toISOString();
    await this.db.prepare(`INSERT INTO seller_profiles(
      id, identity_id, public_display_name, seller_type, verification_state,
      status, moderation_state, version, last_operation_key, created_at, updated_at
    ) VALUES (?, ?, ?, 'private', 'unverified', 'active', 'clear', 1, ?, ?, ?)`)
      .bind(id, context.identityId, name, context.idempotencyKey, now, now)
      .run();
    return {
      id,
      displayName: name,
      sellerType: 'private',
      verificationState: 'unverified',
      status: 'active',
      moderationState: 'clear',
      version: 1,
    };
  }

  async submitPrivateListing(
    rawContext: PrivateSellerContext,
    input: SubmitPrivateListingInput,
  ): Promise<PrivateListingSubmission> {
    const context = sellerContext(rawContext);
    const name = normalizeProductName(input.name);
    const normalizedName = normalizedProductName(name);
    const description = normalizeProductDescription(input.description);
    const priceMinor = normalizePriceMinor(input.priceMinor);
    if (input.currency !== 'UZS') throw new CatalogValidationError('invalid_currency');
    const mediaRefs = normalizeMediaRefs(input.mediaRefs);
    if (mediaRefs.length < 1) throw new CatalogValidationError('invalid_media_refs');
    const globalCategoryId = requireCatalogId(input.globalCategoryId);
    if (!CONDITION_SET.has(input.condition)) {
      throw new CatalogValidationError('invalid_context');
    }
    const regionId = requireCatalogId(input.regionId);
    const districtId = requireCatalogId(input.districtId);
    const localityText = locality(input.localityText);
    if (!CONTACT_MODES.has(input.contactMode)) {
      throw new CatalogValidationError('invalid_context');
    }
    const normalized = {
      name,
      normalizedName,
      description,
      priceMinor,
      currency: 'UZS' as const,
      mediaRefs,
      globalCategoryId,
      condition: input.condition,
      regionId,
      districtId,
      localityText,
      contactMode: input.contactMode,
    };
    const operationFingerprint = await fingerprint(normalized);
    await this.ready();

    const seller = await this.db.prepare(`
      SELECT id, identity_id, public_display_name, seller_type,
        verification_state, status, moderation_state, version
      FROM seller_profiles WHERE identity_id = ?
    `).bind(context.identityId).first<SellerProfileRow>();
    if (
      !seller
      || seller.seller_type !== 'private'
      || seller.status !== 'active'
      || seller.moderation_state !== 'clear'
    ) {
      throw new CatalogAuthorizationError();
    }
    const replay = await this.db.prepare(`
      SELECT operation, fingerprint, target_product_id, result_version
      FROM market_listing_operations
      WHERE seller_profile_id = ? AND idempotency_key = ?
    `).bind(seller.id, context.idempotencyKey).first<{
      operation: string;
      fingerprint: string;
      target_product_id: string;
      result_version: number;
    }>();
    if (replay) {
      if (replay.operation !== 'private.submit' || replay.fingerprint !== operationFingerprint) {
        throw new CatalogIdempotencyConflictError();
      }
      return {
        id: replay.target_product_id,
        listingScope: 'private',
        status: 'draft',
        moderationState: 'pending',
        version: Number(replay.result_version),
        commerceMode: 'inquiry',
      };
    }

    const category = await this.db.prepare(`
      SELECT high_risk, allowed_conditions_json
      FROM market_global_categories WHERE id = ? AND status = 'active'
    `).bind(globalCategoryId).first<{
      high_risk: number;
      allowed_conditions_json: string;
    }>();
    if (!category) throw new CatalogNotFoundError('category');
    const allowed = JSON.parse(category.allowed_conditions_json) as unknown;
    if (!Array.isArray(allowed) || !allowed.includes(input.condition)) {
      throw new CatalogValidationError('invalid_context');
    }
    const locationExists = await this.db.prepare(`
      SELECT COUNT(*) AS n
      FROM market_regions AS region
      JOIN market_districts AS district
        ON district.region_id = region.id AND district.id = ? AND district.status = 'active'
      WHERE region.id = ? AND region.country_code = 'UZ' AND region.status = 'active'
    `).bind(districtId, regionId).first<{ n: number }>();
    if (Number(locationExists?.n ?? 0) !== 1) {
      throw new CatalogValidationError('invalid_context');
    }

    const productId = requireCatalogId(this.productIdGenerator());
    const auditEventId = requireCatalogId(this.auditEventIdGenerator());
    const now = new Date().toISOString();
    const moderationReason = category.high_risk === 1
      ? 'high_risk_category'
      : 'new_seller_review';
    const phoneDisclosure = input.contactMode === 'phone_optional'
      ? 'after_buyer_action'
      : 'not_available';
    await this.db.batch([
      this.db.prepare(`INSERT INTO sotuvchi_products(
        id, org_id, store_id, listing_scope, category_id, sku, name,
        normalized_name, description, price_minor, currency, availability,
        status, media_refs_json, search_terms_json, specifications_json, version,
        last_operation_key, created_at, updated_at
      ) VALUES (?, NULL, NULL, 'private', NULL, NULL, ?, ?, ?, ?, 'UZS',
        'available', 'draft', ?, '[]', '[]', 1, ?, ?, ?)`)
        .bind(
          productId, name, normalizedName, description, priceMinor,
          JSON.stringify(mediaRefs), context.idempotencyKey, now, now,
        ),
      this.db.prepare(`INSERT INTO listing_ownerships(
        product_id, seller_profile_id, ownership_type, org_id, store_id, status,
        version, last_operation_key, created_at, updated_at
      ) VALUES (?, ?, 'private', NULL, NULL, 'active', 1, ?, ?, ?)`)
        .bind(productId, seller.id, context.idempotencyKey, now, now),
      this.db.prepare(`INSERT INTO market_listing_taxonomy(
        product_id, global_category_id, condition, version, last_operation_key,
        created_at, updated_at
      ) VALUES (?, ?, ?, 1, ?, ?, ?)`)
        .bind(productId, globalCategoryId, input.condition, context.idempotencyKey, now, now),
      this.db.prepare(`INSERT INTO market_listing_locations(
        product_id, country_code, region_id, district_id, locality_text,
        approximate_only, version, last_operation_key, created_at, updated_at
      ) VALUES (?, 'UZ', ?, ?, ?, 1, 1, ?, ?, ?)`)
        .bind(
          productId, regionId, districtId, localityText,
          context.idempotencyKey, now, now,
        ),
      this.db.prepare(`INSERT INTO market_listing_channels(
        product_id, listing_scope, contact_mode, phone_disclosure, commerce_mode,
        version, last_operation_key, created_at, updated_at
      ) VALUES (?, 'private', ?, ?, 'inquiry', 1, ?, ?, ?)`)
        .bind(
          productId, input.contactMode, phoneDisclosure,
          context.idempotencyKey, now, now,
        ),
      this.db.prepare(`INSERT INTO market_listing_moderation(
        product_id, state, reason_code, moderator_identity_id, decision_source,
        submitted_at, decided_at, version, last_operation_key, created_at, updated_at
      ) VALUES (?, 'pending', ?, NULL, NULL, ?, NULL, 1, ?, ?, ?)`)
        .bind(productId, moderationReason, now, context.idempotencyKey, now, now),
      this.db.prepare(`INSERT INTO market_moderation_audit(
        event_id, product_id, report_id, actor_type, actor_identity_id, action,
        reason_code, request_id, idempotency_key, from_state, to_state, created_at
      ) VALUES (?, ?, NULL, 'seller', ?, 'listing.submitted', ?, ?, ?, NULL,
        'pending', ?)`)
        .bind(
          auditEventId, productId, context.identityId, moderationReason,
          context.requestId, `audit:${context.idempotencyKey}`, now,
        ),
      this.db.prepare(`INSERT INTO market_listing_operations(
        seller_profile_id, idempotency_key, operation, fingerprint,
        target_product_id, result_version, created_at
      ) VALUES (?, ?, 'private.submit', ?, ?, 1, ?)`)
        .bind(
          seller.id, context.idempotencyKey, operationFingerprint, productId, now,
        ),
    ]);
    return {
      id: productId,
      listingScope: 'private',
      status: 'draft',
      moderationState: 'pending',
      version: 1,
      commerceMode: 'inquiry',
    };
  }

  async submitListingReport(
    rawContext: ListingReportContext,
    rawListingId: unknown,
    input: SubmitListingReportInput,
  ): Promise<ListingReportSubmission> {
    const context = sellerContext(rawContext);
    if (!/^[a-f0-9]{64}$/.test(rawContext.reporterSessionHash)) {
      throw new CatalogValidationError('invalid_context');
    }
    const listingId = requireCatalogId(rawListingId);
    if (!REPORT_REASONS.has(input.reason)) {
      throw new CatalogValidationError('invalid_context');
    }
    const note = reportNote(input.note);
    const reportFingerprint = await fingerprint({ listingId, reason: input.reason, note });
    await this.ready();

    const replay = await this.db.prepare(`
      SELECT id, product_id, reporter_identity_id, fingerprint, status,
        moderation_action
      FROM market_listing_reports WHERE idempotency_key = ?
    `).bind(context.idempotencyKey).first<{
      id: string;
      product_id: string;
      reporter_identity_id: string | null;
      fingerprint: string;
      status: string;
      moderation_action: string;
    }>();
    if (replay) {
      if (
        replay.product_id !== listingId
        || replay.reporter_identity_id !== context.identityId
        || replay.fingerprint !== reportFingerprint
      ) {
        throw new CatalogIdempotencyConflictError();
      }
      return {
        id: replay.id,
        listingId,
        status: 'open',
        moderationAction: 'none',
      };
    }
    if (!await this.store.get(listingId)) throw new CatalogNotFoundError('product');
    const recent = await this.db.prepare(`
      SELECT COUNT(*) AS n FROM market_listing_reports
      WHERE (reporter_identity_id = ? OR reporter_session_hash = ?)
        AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')
    `).bind(context.identityId, rawContext.reporterSessionHash).first<{ n: number }>();
    if (Number(recent?.n ?? 0) >= 5) throw new ClassifiedsRateLimitError();

    const reportId = requireCatalogId(this.reportIdGenerator());
    const auditEventId = requireCatalogId(this.auditEventIdGenerator());
    const now = new Date().toISOString();
    try {
      await this.db.batch([
        this.db.prepare(`INSERT INTO market_listing_reports(
          id, product_id, reporter_identity_id, reporter_session_hash, reason_code,
          note, status, moderation_action, fingerprint, idempotency_key, version,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'open', 'none', ?, ?, 1, ?, ?)`)
          .bind(
            reportId, listingId, context.identityId, rawContext.reporterSessionHash,
            input.reason, note, reportFingerprint, context.idempotencyKey, now, now,
          ),
        this.db.prepare(`INSERT INTO market_moderation_audit(
          event_id, product_id, report_id, actor_type, actor_identity_id, action,
          reason_code, request_id, idempotency_key, from_state, to_state, created_at
        ) VALUES (?, ?, ?, 'reporter', NULL, 'report.opened', ?, ?, ?, NULL, NULL, ?)`)
          .bind(
            auditEventId, listingId, reportId, input.reason, context.requestId,
            `audit:${context.idempotencyKey}`, now,
          ),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('classifieds_report_rate_limited')) {
        throw new ClassifiedsRateLimitError();
      }
      throw error;
    }
    return {
      id: reportId,
      listingId,
      status: 'open',
      moderationAction: 'none',
    };
  }

  async listFavorites(rawIdentityId: unknown): Promise<ClassifiedDiscoveryPage> {
    const identityId = requireCatalogId(rawIdentityId);
    await this.journeyReady();
    return this.store.favorites(identityId);
  }

  async saveFavorite(
    rawIdentityId: unknown,
    rawListingId: unknown,
  ): Promise<{ listingId: string; saved: true }> {
    const identityId = requireCatalogId(rawIdentityId);
    const listingId = requireCatalogId(rawListingId);
    await this.journeyReady();
    if (!await this.store.get(listingId)) throw new CatalogNotFoundError('product');
    const identity = await this.db.prepare(
      'SELECT COUNT(*) AS n FROM identities WHERE id = ?',
    ).bind(identityId).first<{ n: number }>();
    if (Number(identity?.n ?? 0) !== 1) throw new CatalogAuthorizationError();
    await this.db.prepare(`
      INSERT OR IGNORE INTO market_listing_favorites(identity_id, product_id, created_at)
      VALUES (?, ?, ?)
    `).bind(identityId, listingId, new Date().toISOString()).run();
    return { listingId, saved: true };
  }

  async removeFavorite(
    rawIdentityId: unknown,
    rawListingId: unknown,
  ): Promise<{ listingId: string; saved: false }> {
    const identityId = requireCatalogId(rawIdentityId);
    const listingId = requireCatalogId(rawListingId);
    await this.journeyReady();
    await this.db.prepare(`
      DELETE FROM market_listing_favorites WHERE identity_id = ? AND product_id = ?
    `).bind(identityId, listingId).run();
    return { listingId, saved: false };
  }

  async createInquiry(
    rawContext: PrivateSellerContext,
    rawListingId: unknown,
    input: CreateListingInquiryInput,
  ): Promise<ClassifiedBuyerInquiry> {
    const context = sellerContext(rawContext);
    const listingId = requireCatalogId(rawListingId);
    const message = inquiryMessage(input.message);
    const inquiryFingerprint = await fingerprint({ listingId, message });
    await this.journeyReady();
    const replay = await this.db.prepare(`
      SELECT id, product_id, seller_profile_id, message, status, reply_text,
        fingerprint, version, created_at, updated_at
      FROM market_listing_inquiries
      WHERE buyer_identity_id = ? AND create_idempotency_key = ?
    `).bind(context.identityId, context.idempotencyKey).first<{
      id: string;
      product_id: string;
      seller_profile_id: string;
      message: string;
      status: ClassifiedBuyerInquiry['status'];
      reply_text: string | null;
      fingerprint: string;
      version: number;
      created_at: string;
      updated_at: string;
    }>();
    if (replay) {
      if (replay.product_id !== listingId || replay.fingerprint !== inquiryFingerprint) {
        throw new CatalogIdempotencyConflictError();
      }
      return this.buyerInquiry(context.identityId, replay.id);
    }
    if (!await this.store.get(listingId)) throw new CatalogNotFoundError('product');
    const owner = await this.db.prepare(`
      SELECT seller.id AS seller_profile_id, seller.identity_id
      FROM listing_ownerships AS ownership
      JOIN seller_profiles AS seller ON seller.id = ownership.seller_profile_id
      WHERE ownership.product_id = ? AND ownership.status = 'active'
        AND seller.status = 'active' AND seller.moderation_state = 'clear'
      LIMIT 1
    `).bind(listingId).first<{ seller_profile_id: string; identity_id: string }>();
    if (!owner) throw new CatalogNotFoundError('product');
    if (owner.identity_id === context.identityId) throw new CatalogAuthorizationError();
    const recent = await this.db.prepare(`
      SELECT COUNT(*) AS n FROM market_listing_inquiries
      WHERE buyer_identity_id = ?
        AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')
    `).bind(context.identityId).first<{ n: number }>();
    if (Number(recent?.n ?? 0) >= 10) throw new ClassifiedsRateLimitError();
    const id = requireCatalogId(this.inquiryIdGenerator());
    const now = new Date().toISOString();
    try {
      await this.db.prepare(`INSERT INTO market_listing_inquiries(
        id, product_id, seller_profile_id, buyer_identity_id, message, status,
        reply_text, fingerprint, create_idempotency_key, reply_idempotency_key,
        version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'open', NULL, ?, ?, NULL, 1, ?, ?)`)
        .bind(
          id, listingId, owner.seller_profile_id, context.identityId, message,
          inquiryFingerprint, context.idempotencyKey, now, now,
        ).run();
    } catch (error) {
      if (error instanceof Error && error.message.includes('classifieds_inquiry_rate_limited')) {
        throw new ClassifiedsRateLimitError();
      }
      throw error;
    }
    return this.buyerInquiry(context.identityId, id);
  }

  async listBuyerInquiries(rawIdentityId: unknown): Promise<ClassifiedBuyerInquiry[]> {
    const identityId = requireCatalogId(rawIdentityId);
    await this.journeyReady();
    const result = await this.db.prepare(`
      SELECT inquiry.id, inquiry.product_id, product.name AS listing_name,
        seller.public_display_name AS seller_display_name, channel.contact_mode,
        inquiry.message, inquiry.reply_text, inquiry.status, inquiry.version,
        inquiry.created_at, inquiry.updated_at
      FROM market_listing_inquiries AS inquiry
      JOIN sotuvchi_products AS product ON product.id = inquiry.product_id
      JOIN seller_profiles AS seller ON seller.id = inquiry.seller_profile_id
      JOIN market_listing_channels AS channel ON channel.product_id = inquiry.product_id
      WHERE inquiry.buyer_identity_id = ?
      ORDER BY inquiry.updated_at DESC, inquiry.id
      LIMIT 50
    `).bind(identityId).all<BuyerInquiryRow>();
    return (result.results ?? []).map(buyerInquiry);
  }

  private async buyerInquiry(
    identityId: string,
    inquiryId: string,
  ): Promise<ClassifiedBuyerInquiry> {
    const row = await this.db.prepare(`
      SELECT inquiry.id, inquiry.product_id, product.name AS listing_name,
        seller.public_display_name AS seller_display_name, channel.contact_mode,
        inquiry.message, inquiry.reply_text, inquiry.status, inquiry.version,
        inquiry.created_at, inquiry.updated_at
      FROM market_listing_inquiries AS inquiry
      JOIN sotuvchi_products AS product ON product.id = inquiry.product_id
      JOIN seller_profiles AS seller ON seller.id = inquiry.seller_profile_id
      JOIN market_listing_channels AS channel ON channel.product_id = inquiry.product_id
      WHERE inquiry.id = ? AND inquiry.buyer_identity_id = ?
      LIMIT 1
    `).bind(inquiryId, identityId).first<BuyerInquiryRow>();
    if (!row) throw new CatalogNotFoundError('inquiry');
    return buyerInquiry(row);
  }
}

export function createSotuvchiClassifiedsService(
  db: D1Database,
  options: SotuvchiClassifiedsServiceOptions = {},
) {
  return new SotuvchiClassifiedsService(db, options);
}
