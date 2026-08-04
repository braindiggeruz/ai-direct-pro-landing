/**
 * The private seller's own view of their listings, and the seller half of an
 * inquiry.
 *
 * Everything here is scoped by `seller_profile_id`, which is always derived
 * server-side from the bearer identity. No projection in this file takes a
 * caller-supplied owner, and no query is reachable without one, so seller A
 * cannot address seller B's rows by guessing an id.
 *
 * The seller sees their own listing in every lifecycle state. Discovery only
 * ever sees published-and-approved rows, so these projections deliberately do
 * not reuse the discovery SELECT: narrowing this to published listings would
 * hide the seller's own drafts and rejections from them.
 */
import type {
  ClassifiedCondition,
  ClassifiedContactMode,
} from './types';

/**
 * The states a seller is shown, as opposed to the two raw columns they are
 * derived from. `sotuvchi_products.status` and `market_listing_moderation.state`
 * are both true at once and neither alone answers "what is happening to my
 * listing" — an approved listing that the seller took down and a listing still
 * waiting for review are both `status='draft'`.
 */
export type SellerListingState =
  | 'draft'
  | 'pending'
  | 'published'
  | 'needs_changes'
  | 'restricted'
  | 'removed'
  | 'unpublished'
  | 'archived';

export type ModerationState =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'restricted'
  | 'removed';

/**
 * Reason codes a seller may be shown. This is the moderation vocabulary from
 * migration 0037; the client maps each to localized prose. The raw code is sent
 * rather than a server-rendered sentence so RU and UZ stay in the Mini App's
 * own copy, and so an unrecognised code renders as a neutral fallback instead
 * of leaking an internal string.
 */
export const MODERATION_REASON_CODES = [
  'new_seller_review',
  'high_risk_category',
  'prohibited_item',
  'suspected_fraud',
  'duplicate_listing',
  'misleading_content',
  'unsafe_contact',
  'personal_data',
  'seller_request',
  'appeal_upheld',
  'other_policy',
] as const;

export type ModerationReasonCode = (typeof MODERATION_REASON_CODES)[number];

export interface SellerListing {
  id: string;
  state: SellerListingState;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: 'UZS';
  mediaRefs: string[];
  category: {
    id: string;
    slug: string;
    nameRu: string;
    nameUz: string;
  } | null;
  condition: ClassifiedCondition | null;
  location: {
    regionId: string;
    regionNameRu: string;
    regionNameUz: string;
    districtId: string;
    districtNameRu: string;
    districtNameUz: string;
    localityText: string | null;
  } | null;
  contactMode: ClassifiedContactMode | null;
  moderation: {
    state: ModerationState;
    reasonCode: ModerationReasonCode | null;
    decidedAt: string | null;
  } | null;
  /**
   * Real counts only. There is no view counter here because nothing records
   * one: a zero would be honest and a fabricated number would not, and the
   * screen has no way to tell the difference.
   */
  inquiries: { total: number; open: number };
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SellerInquiry {
  id: string;
  listing: { id: string; name: string };
  message: string;
  reply: string | null;
  status: 'open' | 'answered' | 'closed';
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface SellerListingRow {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: 'UZS';
  status: 'draft' | 'published' | 'archived';
  media_refs_json: string;
  version: number;
  created_at: string;
  updated_at: string;
  category_id: string | null;
  category_slug: string | null;
  category_name_ru: string | null;
  category_name_uz: string | null;
  condition: ClassifiedCondition | null;
  region_id: string | null;
  region_name_ru: string | null;
  region_name_uz: string | null;
  district_id: string | null;
  district_name_ru: string | null;
  district_name_uz: string | null;
  locality_text: string | null;
  contact_mode: ClassifiedContactMode | null;
  moderation_state: ModerationState | null;
  moderation_reason: ModerationReasonCode | null;
  moderation_decided_at: string | null;
  inquiry_total: number;
  inquiry_open: number;
}

interface SellerInquiryRow {
  id: string;
  product_id: string;
  listing_name: string;
  message: string;
  reply_text: string | null;
  status: SellerInquiry['status'];
  version: number;
  created_at: string;
  updated_at: string;
}

/**
 * Collapse the two lifecycle columns into the one state the seller is shown.
 *
 * Order matters. A moderation verdict outranks the product status because it is
 * the thing the seller has to act on: a rejected listing is "needs changes"
 * whatever its status column says. Archived outranks everything because it is
 * terminal.
 */
export function sellerListingState(
  status: 'draft' | 'published' | 'archived',
  moderation: ModerationState | null,
): SellerListingState {
  if (status === 'archived') return 'archived';
  if (moderation === 'rejected') return 'needs_changes';
  if (moderation === 'restricted') return 'restricted';
  if (moderation === 'removed') return 'removed';
  if (moderation === 'approved') {
    // The same approval, seen twice: still on the shelf, or taken down by the
    // seller and republishable without a second review.
    return status === 'published' ? 'published' : 'unpublished';
  }
  if (moderation === 'pending') return 'pending';
  return 'draft';
}

function mediaRefs(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

function sellerListing(row: SellerListingRow): SellerListing {
  return {
    id: row.id,
    state: sellerListingState(row.status, row.moderation_state),
    name: row.name,
    description: row.description,
    priceMinor: Number(row.price_minor),
    currency: row.currency,
    mediaRefs: mediaRefs(row.media_refs_json),
    category: row.category_id && row.category_slug
      ? {
          id: row.category_id,
          slug: row.category_slug,
          nameRu: row.category_name_ru ?? '',
          nameUz: row.category_name_uz ?? '',
        }
      : null,
    condition: row.condition,
    location: row.region_id && row.district_id
      ? {
          regionId: row.region_id,
          regionNameRu: row.region_name_ru ?? '',
          regionNameUz: row.region_name_uz ?? '',
          districtId: row.district_id,
          districtNameRu: row.district_name_ru ?? '',
          districtNameUz: row.district_name_uz ?? '',
          localityText: row.locality_text,
        }
      : null,
    contactMode: row.contact_mode,
    moderation: row.moderation_state
      ? {
          state: row.moderation_state,
          reasonCode: row.moderation_reason,
          decidedAt: row.moderation_decided_at,
        }
      : null,
    inquiries: {
      total: Number(row.inquiry_total ?? 0),
      open: Number(row.inquiry_open ?? 0),
    },
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sellerInquiry(row: SellerInquiryRow): SellerInquiry {
  return {
    id: row.id,
    listing: { id: row.product_id, name: row.listing_name },
    message: row.message,
    reply: row.reply_text,
    status: row.status,
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Every optional relation is a LEFT JOIN. A listing is created with all of them
// in one batch, so in practice they are always present — but a projection that
// silently drops the seller's own listing because one relation is missing would
// be worse than one that shows it with a gap the screen can report.
const SELLER_SELECT = `
  SELECT
    product.id,
    product.name,
    product.description,
    product.price_minor,
    product.currency,
    product.status,
    product.media_refs_json,
    product.version,
    product.created_at,
    product.updated_at,
    category.id AS category_id,
    category.slug AS category_slug,
    category.name_ru AS category_name_ru,
    category.name_uz AS category_name_uz,
    taxonomy.condition,
    region.id AS region_id,
    region.name_ru AS region_name_ru,
    region.name_uz AS region_name_uz,
    district.id AS district_id,
    district.name_ru AS district_name_ru,
    district.name_uz AS district_name_uz,
    location.locality_text,
    channel.contact_mode,
    moderation.state AS moderation_state,
    moderation.reason_code AS moderation_reason,
    moderation.decided_at AS moderation_decided_at,
    (
      SELECT COUNT(*) FROM market_listing_inquiries AS total
      WHERE total.product_id = product.id
    ) AS inquiry_total,
    (
      SELECT COUNT(*) FROM market_listing_inquiries AS unanswered
      WHERE unanswered.product_id = product.id AND unanswered.status = 'open'
    ) AS inquiry_open
  FROM listing_ownerships AS ownership
  JOIN sotuvchi_products AS product
    ON product.id = ownership.product_id
    AND product.listing_scope = ownership.ownership_type
  LEFT JOIN market_listing_taxonomy AS taxonomy ON taxonomy.product_id = product.id
  LEFT JOIN market_global_categories AS category ON category.id = taxonomy.global_category_id
  LEFT JOIN market_listing_locations AS location ON location.product_id = product.id
  LEFT JOIN market_regions AS region ON region.id = location.region_id
  LEFT JOIN market_districts AS district ON district.id = location.district_id
  LEFT JOIN market_listing_channels AS channel ON channel.product_id = product.id
  LEFT JOIN market_listing_moderation AS moderation ON moderation.product_id = product.id
`;

export interface SellerListingStore {
  listOwn(sellerProfileId: string, limit: number): Promise<SellerListing[]>;
  getOwn(sellerProfileId: string, productId: string): Promise<SellerListing | null>;
  listInquiries(sellerProfileId: string, limit: number): Promise<SellerInquiry[]>;
  getInquiry(sellerProfileId: string, inquiryId: string): Promise<SellerInquiry | null>;
}

export function createSellerListingStore(db: D1Database): SellerListingStore {
  return {
    async listOwn(sellerProfileId, limit) {
      const result = await db.prepare(`
        ${SELLER_SELECT}
        WHERE ownership.seller_profile_id = ?
          AND ownership.status = 'active'
          AND ownership.ownership_type = 'private'
        ORDER BY product.updated_at DESC, product.id
        LIMIT ?
      `).bind(sellerProfileId, limit).all<SellerListingRow>();
      return (result.results ?? []).map(sellerListing);
    },

    async getOwn(sellerProfileId, productId) {
      // The ownership predicate is part of the lookup, not a check performed
      // after it: a listing the caller does not own is indistinguishable from
      // one that does not exist, which is what conceals it.
      const row = await db.prepare(`
        ${SELLER_SELECT}
        WHERE ownership.seller_profile_id = ?
          AND ownership.product_id = ?
          AND ownership.status = 'active'
          AND ownership.ownership_type = 'private'
        LIMIT 1
      `).bind(sellerProfileId, productId).first<SellerListingRow>();
      return row ? sellerListing(row) : null;
    },

    async listInquiries(sellerProfileId, limit) {
      const result = await db.prepare(`
        SELECT inquiry.id, inquiry.product_id, product.name AS listing_name,
          inquiry.message, inquiry.reply_text, inquiry.status, inquiry.version,
          inquiry.created_at, inquiry.updated_at
        FROM market_listing_inquiries AS inquiry
        JOIN sotuvchi_products AS product ON product.id = inquiry.product_id
        WHERE inquiry.seller_profile_id = ?
        ORDER BY
          CASE inquiry.status WHEN 'open' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END,
          inquiry.updated_at DESC,
          inquiry.id
        LIMIT ?
      `).bind(sellerProfileId, limit).all<SellerInquiryRow>();
      return (result.results ?? []).map(sellerInquiry);
    },

    async getInquiry(sellerProfileId, inquiryId) {
      const row = await db.prepare(`
        SELECT inquiry.id, inquiry.product_id, product.name AS listing_name,
          inquiry.message, inquiry.reply_text, inquiry.status, inquiry.version,
          inquiry.created_at, inquiry.updated_at
        FROM market_listing_inquiries AS inquiry
        JOIN sotuvchi_products AS product ON product.id = inquiry.product_id
        WHERE inquiry.id = ? AND inquiry.seller_profile_id = ?
        LIMIT 1
      `).bind(inquiryId, sellerProfileId).first<SellerInquiryRow>();
      return row ? sellerInquiry(row) : null;
    },
  };
}
