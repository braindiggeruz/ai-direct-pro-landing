/**
 * GET /api/admin/listings — one bounded page of the catalogue, plus the
 * summary the page is read against.
 *
 * Read-only. There is no POST, PUT, PATCH or DELETE here and no publish,
 * archive or edit anywhere below it: ADMIN-3A is visibility, and every command
 * that changes a listing still belongs to the seller surface that already owns
 * it. The method handlers at the bottom say so with a 405 rather than a 404,
 * so a caller learns the route exists and refuses rather than guessing.
 *
 * Every filter here is applied by SQLite. None narrows only the page already
 * sent, because a control that filters the browser's copy claims to have
 * searched a catalogue it never saw.
 */
import {
  methodNotAllowed,
  ownerJson,
  parseEnumFilter,
  parsePagination,
  requireIdentifier,
  withOwnerRole,
} from '../../../platform/admin';
import {
  countListings,
  listListings,
  listingSummary,
  LISTING_AVAILABILITIES,
  LISTING_MEDIA_FILTERS,
  LISTING_QUALITY_STATES,
  LISTING_SORTS,
  LISTING_STATUSES,
  parseListingQuery,
  type ListingSort,
} from '../../../platform/admin/listings';
import { normalizedProductName } from '../../../agents/sotuvchi/catalog';

/**
 * The catalogue's own normaliser, wrapped so an unusable term is "no filter"
 * rather than a 400. It throws on input that normalises to nothing, which is
 * a legitimate thing for a person to type and not an error worth refusing.
 */
function normalizeSearch(value: string): string {
  try {
    return normalizedProductName(value);
  } catch {
    return '';
  }
}

export const onRequestGet = withOwnerRole('platform_owner', async (ctx) => {
  const page = parsePagination(ctx.url);
  const rawStore = ctx.url.searchParams.get('store');
  const rawCategory = ctx.url.searchParams.get('category');

  const filters = {
    status: parseEnumFilter(ctx.url, 'status', LISTING_STATUSES),
    availability: parseEnumFilter(ctx.url, 'availability', LISTING_AVAILABILITIES),
    media: parseEnumFilter(ctx.url, 'media', LISTING_MEDIA_FILTERS),
    quality: parseEnumFilter(ctx.url, 'quality', LISTING_QUALITY_STATES),
    storeId: rawStore ? requireIdentifier(rawStore, 'invalid_store') : null,
    // `uncategorised` is a value of this filter, not a separate control, and it
    // is the one identifier here that names no row.
    categoryId: rawCategory === 'uncategorised'
      ? 'uncategorised'
      : (rawCategory ? requireIdentifier(rawCategory, 'invalid_category') : null),
    query: parseListingQuery(ctx.url.searchParams.get('q'), normalizeSearch),
  };

  const sort = (parseEnumFilter(ctx.url, 'sort', LISTING_SORTS) ?? 'name') as ListingSort;

  const [listings, total, summary] = await Promise.all([
    listListings(ctx.db, { ...filters, ...page, sort }),
    countListings(ctx.db, filters),
    listingSummary(ctx.db),
  ]);

  return ownerJson({
    generated_at: new Date().toISOString(),
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    page: { ...page, sort },
    // `total` is the filtered count and `summary.total` is the catalogue, and
    // they are named apart because a screen that confuses them tells the owner
    // the marketplace shrank when a filter was applied.
    total,
    count: listings.length,
    read_only: true,
    filters: {
      status: filters.status,
      availability: filters.availability,
      media: filters.media,
      quality: filters.quality,
      store: filters.storeId,
      category: filters.categoryId,
      // The normalised term, echoed so the client can prove the server used
      // what it thinks it sent. It is never logged.
      q: filters.query,
    },
    summary,
    listings,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');
