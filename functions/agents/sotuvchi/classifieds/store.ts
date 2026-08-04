import type {
  ClassifiedCategoryOption,
  ClassifiedDiscoveryPage,
  ClassifiedListing,
  ClassifiedLocationOption,
  NormalizedClassifiedDiscoveryFilter,
} from './types';

interface ListingRow {
  id: string;
  listing_scope: 'private' | 'store';
  name: string;
  description: string | null;
  price_minor: number;
  currency: 'UZS';
  availability: 'available' | 'unavailable' | 'preorder';
  media_count: number;
  category_id: string;
  category_slug: string;
  category_name_ru: string;
  category_name_uz: string;
  condition: ClassifiedListing['condition'];
  country_code: 'UZ';
  region_id: string;
  region_name_ru: string;
  region_name_uz: string;
  district_id: string;
  district_name_ru: string;
  district_name_uz: string;
  locality_text: string | null;
  seller_display_name: string;
  seller_type: 'private' | 'store';
  verification_state: ClassifiedListing['seller']['verificationState'];
  contact_mode: ClassifiedListing['contactMode'];
  phone_disclosure: ClassifiedListing['phoneDisclosure'];
  commerce_mode: ClassifiedListing['commerceMode'];
  store_id: string | null;
  store_name: string | null;
  updated_at: string;
}

const CONDITION_LABELS: Record<ClassifiedListing['condition'], { ru: string; uz: string }> = {
  new: { ru: 'Новое', uz: 'Yangi' },
  like_new: { ru: 'Как новое', uz: 'Yangidek' },
  good: { ru: 'Хорошее', uz: 'Yaxshi' },
  fair: { ru: 'Удовлетворительное', uz: 'Qoniqarli' },
  for_parts: { ru: 'На запчасти', uz: 'Ehtiyot qismlar uchun' },
  not_applicable: { ru: 'Не применяется', uz: 'Qo‘llanmaydi' },
};

function listing(row: ListingRow): ClassifiedListing {
  return {
    id: row.id,
    listingScope: row.listing_scope,
    name: row.name,
    description: row.description,
    priceMinor: row.price_minor,
    currency: row.currency,
    availability: row.availability,
    mediaCount: row.media_count,
    category: {
      id: row.category_id,
      slug: row.category_slug,
      nameRu: row.category_name_ru,
      nameUz: row.category_name_uz,
    },
    condition: row.condition,
    conditionLabel: CONDITION_LABELS[row.condition],
    location: {
      countryCode: row.country_code,
      regionId: row.region_id,
      regionNameRu: row.region_name_ru,
      regionNameUz: row.region_name_uz,
      districtId: row.district_id,
      districtNameRu: row.district_name_ru,
      districtNameUz: row.district_name_uz,
      localityText: row.locality_text,
    },
    seller: {
      displayName: row.seller_display_name,
      type: row.seller_type,
      verificationState: row.verification_state,
    },
    contactMode: row.contact_mode,
    phoneDisclosure: row.phone_disclosure,
    commerceMode: row.commerce_mode,
    store: row.store_id && row.store_name
      ? { id: row.store_id, name: row.store_name }
      : null,
    updatedAt: row.updated_at,
  };
}

function cursor(updatedAt: string, id: string): string {
  return `${encodeURIComponent(updatedAt)}~${encodeURIComponent(id)}`;
}

const SELECT = `
  SELECT
    product.id,
    product.listing_scope,
    product.name,
    product.description,
    product.price_minor,
    product.currency,
    product.availability,
    json_array_length(product.media_refs_json) AS media_count,
    category.id AS category_id,
    category.slug AS category_slug,
    category.name_ru AS category_name_ru,
    category.name_uz AS category_name_uz,
    taxonomy.condition,
    location.country_code,
    region.id AS region_id,
    region.name_ru AS region_name_ru,
    region.name_uz AS region_name_uz,
    district.id AS district_id,
    district.name_ru AS district_name_ru,
    district.name_uz AS district_name_uz,
    location.locality_text,
    seller.public_display_name AS seller_display_name,
    seller.seller_type,
    seller.verification_state,
    channel.contact_mode,
    channel.phone_disclosure,
    channel.commerce_mode,
    store.id AS store_id,
    store.name AS store_name,
    product.updated_at
  FROM sotuvchi_products AS product
  JOIN listing_ownerships AS ownership
    ON ownership.product_id = product.id AND ownership.status = 'active'
  JOIN seller_profiles AS seller
    ON seller.id = ownership.seller_profile_id
    AND seller.status = 'active'
    AND seller.moderation_state = 'clear'
  JOIN market_listing_taxonomy AS taxonomy ON taxonomy.product_id = product.id
  JOIN market_global_categories AS category
    ON category.id = taxonomy.global_category_id AND category.status = 'active'
  JOIN market_listing_locations AS location ON location.product_id = product.id
  JOIN market_regions AS region
    ON region.id = location.region_id AND region.status = 'active'
  JOIN market_districts AS district
    ON district.id = location.district_id AND district.status = 'active'
  JOIN market_listing_channels AS channel ON channel.product_id = product.id
  JOIN market_listing_moderation AS moderation
    ON moderation.product_id = product.id AND moderation.state = 'approved'
  LEFT JOIN sotuvchi_stores AS store
    ON store.id = product.store_id AND store.org_id = product.org_id
`;

export interface ClassifiedsStore {
  list(filter: NormalizedClassifiedDiscoveryFilter): Promise<ClassifiedDiscoveryPage>;
  get(id: string): Promise<ClassifiedListing | null>;
  categories(): Promise<ClassifiedCategoryOption[]>;
  locations(): Promise<ClassifiedLocationOption[]>;
  favorites(identityId: string): Promise<ClassifiedDiscoveryPage>;
}

export function createClassifiedsStore(db: D1Database): ClassifiedsStore {
  return {
    async list(filter) {
      const where = [
        `product.status = 'published'`,
        'product.listing_scope = ownership.ownership_type',
      ];
      const values: unknown[] = [];
      const add = (sql: string, value: unknown) => {
        where.push(sql);
        values.push(value);
      };
      if (filter.categoryId) add('category.id = ?', filter.categoryId);
      if (filter.regionId) add('region.id = ?', filter.regionId);
      if (filter.districtId) add('district.id = ?', filter.districtId);
      if (filter.condition) add('taxonomy.condition = ?', filter.condition);
      if (filter.sellerType) add('seller.seller_type = ?', filter.sellerType);
      if (filter.availability) add('product.availability = ?', filter.availability);
      if (filter.storeId) add('product.store_id = ?', filter.storeId);
      if (filter.minPriceMinor !== null) add('product.price_minor >= ?', filter.minPriceMinor);
      if (filter.maxPriceMinor !== null) add('product.price_minor <= ?', filter.maxPriceMinor);
      if (filter.normalizedQuery) {
        const escaped = filter.normalizedQuery.replace(/[\\%_]/g, '\\$&');
        const contains = `%${escaped}%`;
        where.push(`(
          product.normalized_name LIKE ? ESCAPE '\\'
          OR lower(COALESCE(product.description, '')) LIKE ? ESCAPE '\\'
          OR lower(category.name_ru) LIKE ? ESCAPE '\\'
          OR lower(category.name_uz) LIKE ? ESCAPE '\\'
          OR EXISTS (
            SELECT 1 FROM json_each(product.search_terms_json) AS term
            WHERE lower(CAST(term.value AS TEXT)) LIKE ? ESCAPE '\\'
          )
        )`);
        values.push(contains, contains, contains, contains, contains);
      }
      if (filter.cursor) {
        where.push(`(
          product.updated_at < ?
          OR (product.updated_at = ? AND product.id > ?)
        )`);
        values.push(filter.cursor.updatedAt, filter.cursor.updatedAt, filter.cursor.id);
      }
      const result = await db.prepare(`
        ${SELECT}
        WHERE ${where.join('\n AND ')}
        ORDER BY product.updated_at DESC, product.id
        LIMIT ?
      `).bind(...values, filter.limit + 1).all<ListingRow>();
      const rows = result.results ?? [];
      const hasMore = rows.length > filter.limit;
      const pageRows = rows.slice(0, filter.limit);
      const last = pageRows.at(-1);
      return {
        items: pageRows.map(listing),
        nextCursor: hasMore && last ? cursor(last.updated_at, last.id) : null,
      };
    },

    async get(id) {
      const row = await db.prepare(`
        ${SELECT}
        WHERE product.id = ?
          AND product.status = 'published'
          AND product.listing_scope = ownership.ownership_type
        LIMIT 1
      `).bind(id).first<ListingRow>();
      return row ? listing(row) : null;
    },

    async categories() {
      const result = await db.prepare(`
        SELECT
          category.id,
          category.slug,
          category.name_ru,
          category.name_uz,
          category.high_risk,
          category.allowed_conditions_json,
          COUNT(channel.product_id) AS visible_listing_count
        FROM market_global_categories AS category
        LEFT JOIN market_listing_taxonomy AS taxonomy
          ON taxonomy.global_category_id = category.id
        LEFT JOIN sotuvchi_products AS product
          ON product.id = taxonomy.product_id AND product.status = 'published'
        LEFT JOIN market_listing_moderation AS moderation
          ON moderation.product_id = product.id AND moderation.state = 'approved'
        LEFT JOIN listing_ownerships AS ownership
          ON ownership.product_id = product.id AND ownership.status = 'active'
        LEFT JOIN seller_profiles AS seller
          ON seller.id = ownership.seller_profile_id
          AND seller.status = 'active'
          AND seller.moderation_state = 'clear'
        LEFT JOIN market_listing_locations AS location
          ON location.product_id = product.id
        LEFT JOIN market_listing_channels AS channel
          ON channel.product_id = product.id
          AND moderation.product_id IS NOT NULL
          AND seller.id IS NOT NULL
          AND location.product_id IS NOT NULL
        WHERE category.status = 'active'
        GROUP BY category.id
        ORDER BY category.sort_order, category.id
      `).all<{
        id: string;
        slug: string;
        name_ru: string;
        name_uz: string;
        high_risk: number;
        allowed_conditions_json: string;
        visible_listing_count: number;
      }>();
      return (result.results ?? []).map((row) => ({
        id: row.id,
        slug: row.slug,
        nameRu: row.name_ru,
        nameUz: row.name_uz,
        highRisk: row.high_risk === 1,
        allowedConditions: JSON.parse(row.allowed_conditions_json),
        visibleListingCount: Number(row.visible_listing_count),
      }));
    },

    async locations() {
      const result = await db.prepare(`
        SELECT
          region.country_code,
          region.id AS region_id,
          region.name_ru AS region_name_ru,
          region.name_uz AS region_name_uz,
          district.id AS district_id,
          district.name_ru AS district_name_ru,
          district.name_uz AS district_name_uz
        FROM market_regions AS region
        JOIN market_districts AS district
          ON district.region_id = region.id AND district.status = 'active'
        WHERE region.status = 'active'
        ORDER BY region.sort_order, district.sort_order, district.id
      `).all<{
        country_code: 'UZ';
        region_id: string;
        region_name_ru: string;
        region_name_uz: string;
        district_id: string;
        district_name_ru: string;
        district_name_uz: string;
      }>();
      return (result.results ?? []).map((row) => ({
        countryCode: row.country_code,
        regionId: row.region_id,
        regionNameRu: row.region_name_ru,
        regionNameUz: row.region_name_uz,
        districtId: row.district_id,
        districtNameRu: row.district_name_ru,
        districtNameUz: row.district_name_uz,
      }));
    },

    async favorites(identityId) {
      const result = await db.prepare(`
        ${SELECT}
        WHERE product.status = 'published'
          AND product.listing_scope = ownership.ownership_type
          AND EXISTS (
            SELECT 1 FROM market_listing_favorites AS favorite
            WHERE favorite.identity_id = ? AND favorite.product_id = product.id
          )
        ORDER BY product.updated_at DESC, product.id
        LIMIT 50
      `).bind(identityId).all<ListingRow>();
      return {
        items: (result.results ?? []).map(listing),
        nextCursor: null,
      };
    },
  };
}
