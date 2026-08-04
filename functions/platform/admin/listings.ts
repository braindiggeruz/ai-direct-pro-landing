/**
 * ADMIN-3A read model: the catalogue as the platform owner needs to see it.
 *
 * Read-only by construction. There is no UPDATE, INSERT or DELETE in this file
 * and no endpoint above it offers one — publishing, archiving and editing stay
 * where they already live, which is the seller's own surface. What the owner
 * gets here is visibility: what exists, what is published, what is broken, and
 * where it is.
 *
 * Three constraints shaped every query below, in this order:
 *
 *   Every filter must be one the server actually applies. A control that
 *   narrows only the page already in the browser tells the reader it searched
 *   the catalogue when it searched twenty-five rows.
 *
 *   Every query must be answerable by an index that exists. `EXPLAIN QUERY
 *   PLAN` was run against production D1 for each shape here, and the one that
 *   could not be — ordering by `updated_at` — was removed rather than shipped
 *   behind a small dataset. See BORMI_ADMIN_LISTINGS_DATA_CONTRACT.md.
 *
 *   Nothing identifies a person. Products carry no buyer, no Telegram id and
 *   no session; the only free text that reaches the owner is the seller's own
 *   product copy, and it is never logged.
 */
import { OwnerValidationError, OWNER_LIMITS } from './validation';

/** The three states `sotuvchi_products.status` is constrained to by CHECK. */
export const LISTING_STATUSES = ['draft', 'published', 'archived'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** The three states `sotuvchi_products.availability` is constrained to. */
export const LISTING_AVAILABILITIES = ['available', 'unavailable', 'preorder'] as const;
export type ListingAvailability = (typeof LISTING_AVAILABILITIES)[number];

/**
 * Card quality, derived and never scored.
 *
 * `incomplete` means the card cannot do its job: a buyer scrolling past a
 * listing with no photo does not open it, and a listing with no category is
 * not reachable by browsing. `needs_attention` means it works but is thin.
 * There is no number, no percentage and no ranking, because nothing here
 * measures how any of it performs — Bormi collects no view or conversion data.
 */
export const LISTING_QUALITY_STATES = ['good', 'needs_attention', 'incomplete'] as const;
export type ListingQualityState = (typeof LISTING_QUALITY_STATES)[number];

/**
 * Every quality reason, and the column that proves it. A reason that cannot
 * name its column does not belong in this list.
 */
export const LISTING_QUALITY_REASONS = [
  'no_photo',
  'no_category',
  'no_description',
  'unavailable',
] as const;
export type ListingQualityReason = (typeof LISTING_QUALITY_REASONS)[number];

/**
 * Sorts the index can answer.
 *
 * `idx_sotuvchi_products_store_status_name` is `(store_id, status,
 * normalized_name, id)`, so ordering by name is either a covering-index search
 * (with store and status pinned) or a covering-index scan (without). Ordering
 * by `updated_at` is `SCAN p` plus a temp B-tree — no index covers it, and
 * ADMIN-3A does not add one. It is therefore not offered.
 */
export const LISTING_SORTS = ['name', 'name_desc'] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

/** Media presence, as a filter a person would actually ask for. */
export const LISTING_MEDIA_FILTERS = ['with', 'without'] as const;
export type ListingMediaFilter = (typeof LISTING_MEDIA_FILTERS)[number];

export const LISTING_LIMITS = Object.freeze({
  /** Rows a page may carry. The shared owner limit, not a new one. */
  pageSizeDefault: OWNER_LIMITS.pageSizeDefault,
  pageSizeMax: OWNER_LIMITS.pageSizeMax,
  /** Longest search a caller may send, after normalisation. */
  queryLength: 80,
  /** Shortest search that is worth running. Below this the filter is ignored. */
  queryMinimum: 2,
  /** Images described in a detail response. A product cannot hold more. */
  mediaMax: 10,
  /** Specification rows a detail response describes. */
  specificationsMax: 40,
  /** Categories the overview screen describes at once. */
  categoriesMax: 200,
});

/** SQL fragments for the four quality reasons. Each names one column. */
const QUALITY_SQL: Record<ListingQualityReason, string> = {
  no_photo: 'json_array_length(product.media_refs_json) = 0',
  no_category: 'product.category_id IS NULL',
  no_description: "(product.description IS NULL OR trim(product.description) = '')",
  unavailable: "product.availability = 'unavailable'",
};

const INCOMPLETE_SQL = `(${QUALITY_SQL.no_photo} OR ${QUALITY_SQL.no_category})`;
const ATTENTION_SQL = `(${QUALITY_SQL.no_description} OR ${QUALITY_SQL.unavailable})`;

export interface ListingFilters {
  status: ListingStatus | null;
  availability: ListingAvailability | null;
  storeId: string | null;
  categoryId: string | null;
  media: ListingMediaFilter | null;
  quality: ListingQualityState | null;
  /** Already normalised with the same function that produced `normalized_name`. */
  query: string | null;
}

export interface ListingQuery extends ListingFilters {
  limit: number;
  offset: number;
  sort: ListingSort;
}

export interface ListingRow {
  id: string;
  name: string;
  status: ListingStatus;
  availability: ListingAvailability;
  price_minor: number;
  currency: string;
  media_count: number;
  store_id: string;
  store_name: string;
  category_id: string | null;
  category_name: string | null;
  updated_at: string;
  quality: ListingQualityState;
  quality_reasons: ListingQualityReason[];
}

interface Row { [key: string]: unknown }

function num(value: unknown): number {
  return Number(value ?? 0);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Resolve the quality of one row from its own columns.
 *
 * Deterministic and total: the same row always produces the same verdict, and
 * every verdict lists the reasons that produced it. A caller can therefore
 * always answer "why" without asking the server again.
 */
export function listingQuality(input: {
  mediaCount: number;
  categoryId: string | null;
  description: string | null;
  availability: string;
}): { state: ListingQualityState; reasons: ListingQualityReason[] } {
  const reasons: ListingQualityReason[] = [];
  if (input.mediaCount === 0) reasons.push('no_photo');
  if (!input.categoryId) reasons.push('no_category');
  if (!input.description || input.description.trim() === '') reasons.push('no_description');
  if (input.availability === 'unavailable') reasons.push('unavailable');

  const blocking = reasons.includes('no_photo') || reasons.includes('no_category');
  const state: ListingQualityState = blocking
    ? 'incomplete'
    : (reasons.length > 0 ? 'needs_attention' : 'good');
  return { state, reasons };
}

/**
 * Build the WHERE clause and its bindings.
 *
 * Every value is bound. The only text interpolated into SQL is a fragment from
 * a frozen constant in this file, never anything a caller supplied.
 */
function where(filters: ListingFilters): { sql: string; binds: unknown[] } {
  const clauses: string[] = [];
  const binds: unknown[] = [];

  if (filters.status) {
    clauses.push('product.status = ?');
    binds.push(filters.status);
  }
  if (filters.storeId) {
    clauses.push('product.store_id = ?');
    binds.push(filters.storeId);
  }
  if (filters.categoryId) {
    // `uncategorised` is a real answer to "which category", and it is the one
    // the owner most often wants, so it is a value of this filter rather than
    // a separate control.
    if (filters.categoryId === 'uncategorised') {
      clauses.push('product.category_id IS NULL');
    } else {
      clauses.push('product.category_id = ?');
      binds.push(filters.categoryId);
    }
  }
  if (filters.availability) {
    clauses.push('product.availability = ?');
    binds.push(filters.availability);
  }
  if (filters.media === 'with') clauses.push('json_array_length(product.media_refs_json) > 0');
  if (filters.media === 'without') clauses.push(QUALITY_SQL.no_photo);

  if (filters.quality === 'incomplete') clauses.push(INCOMPLETE_SQL);
  if (filters.quality === 'needs_attention') {
    clauses.push(`NOT ${INCOMPLETE_SQL} AND ${ATTENTION_SQL}`);
  }
  if (filters.quality === 'good') {
    clauses.push(`NOT ${INCOMPLETE_SQL} AND NOT ${ATTENTION_SQL}`);
  }

  if (filters.query) {
    // Prefix match on the same normalised column the ordering uses, so the
    // search rides the index rather than fighting it. A leading wildcard would
    // not, which is why one is not offered. The wildcards are escaped even
    // though normalisation already strips them: two guarantees cost nothing.
    clauses.push("product.normalized_name LIKE ? ESCAPE '\\'");
    binds.push(`${filters.query.replace(/[%_\\]/g, '\\$&')}%`);
  }

  const sql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return { sql, binds };
}

const ORDER: Record<ListingSort, string> = {
  name: 'ORDER BY product.normalized_name ASC, product.id ASC',
  name_desc: 'ORDER BY product.normalized_name DESC, product.id DESC',
};

/**
 * One bounded page of listings.
 *
 * The ordering is total — `(normalized_name, id)` is unique because `id` is —
 * so a page boundary cannot duplicate or drop a row within a stable catalogue.
 * Labels come from two joins rather than a lookup per row: the store and the
 * category are resolved by SQLite through their primary keys, so a page of
 * twenty-five rows is one statement, not twenty-six.
 */
export async function listListings(
  db: D1Database,
  query: ListingQuery,
): Promise<ListingRow[]> {
  const { sql, binds } = where(query);
  const statement = db.prepare(
    `SELECT product.id,
            product.name,
            product.status,
            product.availability,
            product.price_minor,
            product.currency,
            product.category_id,
            product.store_id,
            product.updated_at,
            product.description,
            json_array_length(product.media_refs_json) AS media_count,
            store.name AS store_name,
            category.name AS category_name
       FROM sotuvchi_products AS product
       JOIN sotuvchi_stores AS store ON store.id = product.store_id
       LEFT JOIN sotuvchi_categories AS category ON category.id = product.category_id
       ${sql}
       ${ORDER[query.sort]}
      LIMIT ? OFFSET ?`,
  ).bind(...binds, query.limit, query.offset);

  const result = await statement.all<Row>();
  return (result.results ?? []).map((row) => {
    const mediaCount = num(row.media_count);
    const categoryId = row.category_id === null ? null : text(row.category_id);
    const description = row.description === null ? null : text(row.description);
    const availability = text(row.availability);
    const verdict = listingQuality({
      mediaCount,
      categoryId,
      description,
      availability,
    });
    return {
      id: text(row.id),
      name: text(row.name),
      status: text(row.status) as ListingStatus,
      availability: availability as ListingAvailability,
      price_minor: num(row.price_minor),
      currency: text(row.currency),
      media_count: mediaCount,
      store_id: text(row.store_id),
      store_name: text(row.store_name),
      category_id: categoryId,
      category_name: row.category_name === null ? null : text(row.category_name),
      updated_at: text(row.updated_at),
      quality: verdict.state,
      quality_reasons: verdict.reasons,
    };
  });
}

/** How many rows the same filters match. No joins: nothing filters on a label. */
export async function countListings(
  db: D1Database,
  filters: ListingFilters,
): Promise<number> {
  const { sql, binds } = where(filters);
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM sotuvchi_products AS product ${sql}`,
  ).bind(...binds).first<Row>();
  return num(row?.n);
}

export interface ListingSummary {
  total: number;
  by_status: Record<ListingStatus, number>;
  quality: Record<ListingQualityReason, number>;
  attention: number;
}

/**
 * The operational summary above the table.
 *
 * Counted over the whole catalogue rather than the current page, because the
 * question it answers — how much of the marketplace is real — is not a
 * question about twenty-five rows. Two statements, batched.
 */
export async function listingSummary(db: D1Database): Promise<ListingSummary> {
  const [statuses, quality] = await db.batch<Row>([
    db.prepare('SELECT status, COUNT(*) AS n FROM sotuvchi_products GROUP BY status'),
    db.prepare(
      `SELECT
         SUM(CASE WHEN ${QUALITY_SQL.no_photo} THEN 1 ELSE 0 END) AS no_photo,
         SUM(CASE WHEN ${QUALITY_SQL.no_category} THEN 1 ELSE 0 END) AS no_category,
         SUM(CASE WHEN ${QUALITY_SQL.no_description} THEN 1 ELSE 0 END) AS no_description,
         SUM(CASE WHEN ${QUALITY_SQL.unavailable} THEN 1 ELSE 0 END) AS unavailable,
         SUM(CASE WHEN ${INCOMPLETE_SQL} OR ${ATTENTION_SQL} THEN 1 ELSE 0 END) AS attention
       FROM sotuvchi_products AS product`,
    ),
  ]).then((results) => results.map((result) => result.results ?? []));

  const byStatus = {
    draft: 0,
    published: 0,
    archived: 0,
  } as Record<ListingStatus, number>;
  for (const row of statuses) {
    const key = text(row.status) as ListingStatus;
    if ((LISTING_STATUSES as readonly string[]).includes(key)) byStatus[key] = num(row.n);
  }
  const cards = quality[0] ?? {};
  return {
    total: byStatus.draft + byStatus.published + byStatus.archived,
    by_status: byStatus,
    quality: {
      no_photo: num(cards.no_photo),
      no_category: num(cards.no_category),
      no_description: num(cards.no_description),
      unavailable: num(cards.unavailable),
    },
    attention: num(cards.attention),
  };
}

export interface ListingMedia {
  index: number;
  /** `stored` is served by this platform; `external` lives in Telegram. */
  kind: 'stored' | 'external';
}

export interface ListingSpecification {
  key: string;
  value: string;
}

export interface ListingDetail extends ListingRow {
  sku: string | null;
  description: string | null;
  version: number;
  created_at: string;
  org_id: string;
  media: ListingMedia[];
  specifications: ListingSpecification[];
  search_terms: string[];
  /** The buyer-facing rendering of the same row, from the buyer's own presenter. */
  preview: {
    title: string;
    price: string;
    availability: string;
    description: string;
    category: string | null;
    store: string;
    media_count: number;
  };
}

function parseJsonArray(raw: unknown): unknown[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** The row behind one listing, addressed by primary key. */
export async function getListingRow(
  db: D1Database,
  id: string,
): Promise<Row | null> {
  return db.prepare(
    `SELECT product.*,
            store.name AS store_name,
            category.name AS category_name
       FROM sotuvchi_products AS product
       JOIN sotuvchi_stores AS store ON store.id = product.store_id
       LEFT JOIN sotuvchi_categories AS category ON category.id = product.category_id
      WHERE product.id = ?`,
  ).bind(id).first<Row>();
}

/**
 * Build the detail DTO.
 *
 * `preview` is produced by the buyer's own presenter functions rather than by
 * a second implementation that happens to look similar: the price string, the
 * availability label and the description bound are the exact ones the Mini App
 * renders, imported from `agents/sotuvchi/buyer/cards`. If the buyer's
 * formatting changes, this changes with it, which is the whole point.
 */
export function toListingDetail(
  row: Row,
  presenter: {
    price: (minor: number) => string;
    // Typed against this module's own union rather than the catalogue's, so
    // `platform` does not import `agents`. The two unions are the same three
    // literals — the CHECK constraint defines both — and the boundary rule is
    // there precisely so a platform module cannot depend on an agent's shape.
    availability: (value: ListingAvailability) => string;
    description: (value: string | null) => string;
  },
): ListingDetail {
  const mediaRefs = parseJsonArray(row.media_refs_json)
    .filter((value): value is string => typeof value === 'string')
    .slice(0, LISTING_LIMITS.mediaMax);
  const description = row.description === null ? null : text(row.description);
  const categoryId = row.category_id === null ? null : text(row.category_id);
  const availability = text(row.availability);
  const verdict = listingQuality({
    mediaCount: mediaRefs.length,
    categoryId,
    description,
    availability,
  });

  const specifications = parseJsonArray(row.specifications_json)
    .slice(0, LISTING_LIMITS.specificationsMax)
    .map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      return { key: text(record.key), value: text(record.value) };
    })
    .filter((entry) => entry.key !== '' || entry.value !== '');

  const searchTerms = parseJsonArray(row.search_terms_json)
    .filter((value): value is string => typeof value === 'string')
    .slice(0, LISTING_LIMITS.specificationsMax);

  const storeName = text(row.store_name);
  const categoryName = row.category_name === null ? null : text(row.category_name);

  return {
    id: text(row.id),
    name: text(row.name),
    status: text(row.status) as ListingStatus,
    availability: availability as ListingAvailability,
    price_minor: num(row.price_minor),
    currency: text(row.currency),
    media_count: mediaRefs.length,
    store_id: text(row.store_id),
    store_name: storeName,
    category_id: categoryId,
    category_name: categoryName,
    updated_at: text(row.updated_at),
    quality: verdict.state,
    quality_reasons: verdict.reasons,
    sku: row.sku === null ? null : text(row.sku),
    description,
    version: num(row.version),
    created_at: text(row.created_at),
    org_id: text(row.org_id),
    // The reference itself never leaves the server: a caller gets an index and
    // a kind, and asks for the bytes by index through the owner-guarded route.
    media: mediaRefs.map((reference, index) => ({
      index,
      kind: /^r2\.[a-z2-7]{16}$/.test(reference) ? 'stored' : 'external',
    })),
    specifications,
    search_terms: searchTerms,
    preview: {
      title: text(row.name),
      price: presenter.price(num(row.price_minor)),
      availability: presenter.availability(availability as ListingAvailability),
      description: presenter.description(description),
      category: categoryName,
      store: storeName,
      media_count: mediaRefs.length,
    },
  };
}

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  sort_order: number;
  store_id: string;
  store_name: string;
  updated_at: string;
  total: number;
  published: number;
  draft: number;
  archived: number;
  no_photo: number;
  /** True for the synthetic row that collects products with no category. */
  uncategorised: boolean;
}

/**
 * Categories with the counts that make them worth a screen.
 *
 * Two statements, never one per category: the aggregate is grouped in SQLite
 * and merged here. The products with no category at all are surfaced as one
 * extra row, marked as synthetic, because "which of my listings are not
 * reachable by browsing" is the question this screen exists to answer and the
 * answer is not in `sotuvchi_categories`.
 */
export async function listCategories(db: D1Database): Promise<CategoryRow[]> {
  const [categories, counts] = await db.batch<Row>([
    db.prepare(
      `SELECT category.id, category.name, category.slug, category.status,
              category.sort_order, category.store_id, category.updated_at,
              store.name AS store_name
         FROM sotuvchi_categories AS category
         JOIN sotuvchi_stores AS store ON store.id = category.store_id
        ORDER BY store.name ASC, category.sort_order ASC, category.name ASC, category.id ASC
        LIMIT ${LISTING_LIMITS.categoriesMax}`,
    ),
    db.prepare(
      `SELECT product.category_id, product.status, COUNT(*) AS n,
              SUM(CASE WHEN ${QUALITY_SQL.no_photo} THEN 1 ELSE 0 END) AS no_photo
         FROM sotuvchi_products AS product
        GROUP BY product.category_id, product.status`,
    ),
  ]).then((results) => results.map((result) => result.results ?? []));

  const tally = new Map<string, {
    total: number; published: number; draft: number; archived: number; no_photo: number;
  }>();
  for (const row of counts) {
    const key = row.category_id === null ? '' : text(row.category_id);
    const bucket = tally.get(key) ?? {
      total: 0, published: 0, draft: 0, archived: 0, no_photo: 0,
    };
    const n = num(row.n);
    bucket.total += n;
    bucket.no_photo += num(row.no_photo);
    const status = text(row.status);
    if (status === 'published') bucket.published += n;
    if (status === 'draft') bucket.draft += n;
    if (status === 'archived') bucket.archived += n;
    tally.set(key, bucket);
  }

  const rows: CategoryRow[] = categories.map((row) => {
    const id = text(row.id);
    const bucket = tally.get(id) ?? {
      total: 0, published: 0, draft: 0, archived: 0, no_photo: 0,
    };
    return {
      id,
      name: text(row.name),
      slug: text(row.slug),
      status: text(row.status),
      sort_order: num(row.sort_order),
      store_id: text(row.store_id),
      store_name: text(row.store_name),
      updated_at: text(row.updated_at),
      uncategorised: false,
      ...bucket,
    };
  });

  const orphans = tally.get('');
  if (orphans && orphans.total > 0) {
    rows.push({
      id: 'uncategorised',
      name: '',
      slug: '',
      status: 'active',
      sort_order: Number.MAX_SAFE_INTEGER,
      store_id: '',
      store_name: '',
      updated_at: '',
      uncategorised: true,
      ...orphans,
    });
  }
  return rows;
}

/**
 * Validate and bound the search term.
 *
 * Normalised with the same function that produced `normalized_name`, so what
 * the reader types is compared against what the column actually holds rather
 * than against the display name. A term shorter than the minimum is dropped
 * rather than run: a one-character prefix matches most of the catalogue and
 * reads like a broken filter.
 */
export function parseListingQuery(
  raw: string | null,
  normalize: (value: string) => string,
): string | null {
  if (raw === null) return null;
  if (raw.length > LISTING_LIMITS.queryLength * 4) {
    throw new OwnerValidationError('invalid_query');
  }
  const normalized = normalize(raw);
  if (normalized.length > LISTING_LIMITS.queryLength) {
    throw new OwnerValidationError('invalid_query');
  }
  if (normalized.length < LISTING_LIMITS.queryMinimum) return null;
  return normalized;
}
