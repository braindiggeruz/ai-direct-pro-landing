/**
 * SYNTHETIC data for development only.
 *
 * Every string here is invented and says so. Nothing in this file is a real
 * store, a real listing, a real person or a real number, and none of it can
 * reach production: `FIXTURE_MODE` folds to false in a production build, so
 * this module is dropped from the bundle entirely.
 *
 * It exists for one reason - the panel has to be reviewable at 320px and in
 * dark mode without pointing a browser at a live marketplace.
 */
import type {
  AuditFilters,
  AuditResponse,
  CategoriesResponse,
  CategoryRow,
  ListingDetail,
  ListingDetailResponse,
  ListingFilters,
  ListingQualityReason,
  ListingQualityState,
  ListingRow,
  ListingsResponse,
  OverviewResponse,
  StoresResponse,
} from './contracts';

export const SYNTHETIC_NOTICE = 'SYNTHETIC — данные вымышлены, режим разработки';

export function syntheticOverview(): OverviewResponse {
  return {
    generated_at: new Date().toISOString(),
    window_days: 7,
    actor: { email: 'synthetic-owner@example.invalid', role: 'platform_owner' },
    rollout: { admin_v2: true },
    listings: {
      published: 48,
      draft: 6,
      archived: 3,
      total: 57,
      touched_7d: 12,
      quality: { no_photo: 4, no_description: 9, no_category: 2, unavailable: 5 },
    },
    stores: { active: 1, suspended: 0, total: 1 },
    orders: {
      open: 2,
      today: 1,
      last7d: 4,
      by_status: { draft: 1, placed: 2, confirmed: 0, done: 1, cancelled: 0 },
    },
    handoffs: { open: 3, by_status: { open: 3, answered: 5, closed: 11, expired: 1 } },
    access: {
      memberships: 2,
      owners_active: 2,
      disabled: 0,
      telegram_active: 1,
      seller_read: true,
      seller_commands: true,
      binding: {
        global_flag: false,
        ceremony_open: false,
        challenges_total: 1,
        challenges_live: 0,
        challenges_redeemed: 1,
      },
    },
    flags: {
      quick_post: false,
      quick_post_ai: false,
      owner_telegram_binding: false,
      cabinet: true,
      voice_search: true,
      media_upload: true,
      seller_reads: true,
      seller_commands: true,
      admin_v2: true,
    },
    system: {
      build_id: 'synthetic-build',
      migrations: { applied: 32, last: '0032_synthetic.sql' },
      bindings: { d1: true, r2_media: true, ai: true },
      deployment: null,
    },
    activity: {
      listings: [
        {
          id: 'synthetic-1', name: 'SYNTHETIC · пример карточки', status: 'published',
          availability: 'available', price_minor: 4500000, media_count: 3,
          store_name: 'SYNTHETIC Store', updated_at: new Date().toISOString(),
        },
        {
          id: 'synthetic-2', name: 'SYNTHETIC · черновик без фото', status: 'draft',
          availability: 'unavailable', price_minor: 0, media_count: 0,
          store_name: 'SYNTHETIC Store', updated_at: new Date(Date.now() - 3_600_000).toISOString(),
        },
      ],
      orders: [
        {
          reference: 'SYN-0001', status: 'placed', fulfillment: 'none',
          total_minor: 4500000, created_at: new Date(Date.now() - 7_200_000).toISOString(),
        },
      ],
    },
    audit: [
      {
        action: 'store.suspend', target_type: 'store', actor_role: 'platform_owner',
        reason_code: 'policy_violation', created_at: new Date(Date.now() - 86_400_000).toISOString(),
      },
    ],
    attention: [
      { code: 'handoffs_open', severity: 'warning', count: 3 },
      { code: 'listings_without_photo', severity: 'warning', count: 4 },
      { code: 'orders_open', severity: 'info', count: 2 },
    ],
  };
}

export function syntheticStores(): StoresResponse {
  return {
    count: 1,
    stores: [
      {
        id: 'synthetic-store', org_id: 'synthetic-org', name: 'SYNTHETIC Store',
        status: 'active', locale: 'uz', pilot_state: 'active',
        product_count: 57, published_count: 48, open_orders: 2, open_handoffs: 3,
        updated_at: new Date().toISOString(),
      },
    ],
  };
}

/**
 * The trail, narrowed the same way the server narrows it.
 *
 * The fixtures apply the filters rather than ignoring them, because a control
 * that does nothing in the environment the design is reviewed in is a control
 * whose emptiness nobody notices until production.
 */
export function syntheticAudit(filters: AuditFilters = {}): AuditResponse {
  const events: AuditResponse['events'] = [
    {
      event_id: 'synthetic-1', created_at: new Date(Date.now() - 86_400_000).toISOString(),
      actor_email: 'synthetic-owner@example.invalid', actor_role: 'platform_owner',
      action: 'store.suspend', target_type: 'store', target_id: 'synthetic-store',
      org_id: 'synthetic-org', reason_code: 'policy_violation', request_id: 'synthetic',
    },
    {
      event_id: 'synthetic-2', created_at: new Date(Date.now() - 172_800_000).toISOString(),
      actor_email: 'synthetic-owner@example.invalid', actor_role: 'platform_owner',
      action: 'seller.bind', target_type: 'store', target_id: 'synthetic-store',
      org_id: 'synthetic-org', reason_code: 'seller_request', request_id: 'synthetic',
    },
    {
      event_id: 'synthetic-3', created_at: new Date(Date.now() - 259_200_000).toISOString(),
      actor_email: 'synthetic-support@example.invalid', actor_role: 'support_readonly',
      action: 'automation.replay', target_type: 'job', target_id: 'synthetic-job',
      org_id: 'synthetic-org', reason_code: 'operator_error_recovery', request_id: 'synthetic',
    },
    {
      event_id: 'synthetic-4', created_at: new Date(Date.now() - 345_600_000).toISOString(),
      actor_email: 'synthetic-owner@example.invalid', actor_role: 'platform_owner',
      action: 'seller.unbind', target_type: 'store', target_id: 'synthetic-store',
      org_id: 'synthetic-org', reason_code: 'suspected_abuse', request_id: 'synthetic',
    },
    {
      event_id: 'synthetic-5', created_at: new Date(Date.now() - 432_000_000).toISOString(),
      actor_email: 'synthetic-owner@example.invalid', actor_role: 'platform_owner',
      action: 'store.restore', target_type: 'store', target_id: 'synthetic-store',
      org_id: 'synthetic-org', reason_code: 'pilot_onboarding', request_id: 'synthetic',
    },
  ].filter((event) => (
    (!filters.action || event.action === filters.action)
    && (!filters.actorRole || event.actor_role === filters.actorRole)
  ));
  return { append_only: true, total: events.length, events };
}

// ── ADMIN-3A listings ────────────────────────────────────────────────────────

/**
 * Invented catalogue.
 *
 * Every name starts with "Синтетический" so no screenshot of this can ever be
 * mistaken for a real seller's product, and the values are chosen to exercise
 * the layout rather than to look tidy: one name is long enough to wrap at
 * 320px, one carries Uzbek characters, prices span four orders of magnitude,
 * and every quality state and availability appears at least twice.
 */
const SYNTHETIC_CATEGORIES = [
  { id: 'synthetic-cat-1', name: 'Синтетическая категория · Электроника', slug: 'electronics' },
  { id: 'synthetic-cat-2', name: 'Синтетическая категория · Сумки и рюкзаки', slug: 'bags' },
  { id: 'synthetic-cat-3', name: 'Синтетик toifa · Uy‘ jihozlari', slug: 'home' },
  { id: 'synthetic-cat-4', name: 'Синтетическая категория · Пустая витрина', slug: 'empty' },
] as const;

/**
 * Names lead with the noun, not with the word "синтетический".
 *
 * The server searches by prefix against `normalized_name`, so a fixture whose
 * every name began with the same word would make the search box look broken in
 * review — the one filter a reviewer is most likely to try. Each name still
 * carries "синтетический" plainly, and the SYNTHETIC banner is on screen the
 * whole time, so nothing here can be mistaken for a real seller's catalogue.
 */
const SYNTHETIC_NAMES = [
  'Аккумулятор внешний синтетический',
  'Колонка мини синтетическая',
  'Рюкзак учебный синтетический',
  'Chang yutgich sintetik juda uzun nomli sinov kartochkasi uchun namuna',
  'Наушники синтетические',
  'Лампа настольная синтетическая с очень длинным названием для проверки переноса строки',
  'Термокружка синтетическая',
  'Коврик для мыши синтетический',
];

/**
 * The same normalisation the catalogue applies before storing `normalized_name`:
 * NFKC, lowercase, punctuation to spaces, collapsed whitespace. Kept in step
 * with `normalizeKnowledgeText` on the server so the fixture's search behaves
 * the way the real one does.
 */
function normalizeFixtureName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʻʼ`´']/g, '')
    .replace(/[‐-―−-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function syntheticQuality(
  mediaCount: number,
  categoryId: string | null,
  description: string | null,
  availability: string,
): { quality: ListingQualityState; quality_reasons: ListingQualityReason[] } {
  const reasons: ListingQualityReason[] = [];
  if (mediaCount === 0) reasons.push('no_photo');
  if (!categoryId) reasons.push('no_category');
  if (!description || description.trim() === '') reasons.push('no_description');
  if (availability === 'unavailable') reasons.push('unavailable');
  const blocking = reasons.includes('no_photo') || reasons.includes('no_category');
  return {
    quality: blocking ? 'incomplete' : (reasons.length > 0 ? 'needs_attention' : 'good'),
    quality_reasons: reasons,
  };
}

/** 57 invented rows, deterministic so a screenshot is reproducible. */
function syntheticCatalogue(): (ListingRow & { description: string | null })[] {
  const statuses = ['published', 'published', 'published', 'draft', 'archived'];
  const availabilities = ['available', 'available', 'preorder', 'unavailable'];
  return Array.from({ length: 57 }, (_, index) => {
    const status = statuses[index % statuses.length];
    const availability = availabilities[index % availabilities.length];
    // Every fourth card has no photo and every seventh has no category, so both
    // blocking reasons are reachable and they overlap on some rows.
    const mediaCount = index % 4 === 0 ? 0 : (index % 3) + 1;
    const categoryId = index % 7 === 0
      ? null
      : SYNTHETIC_CATEGORIES[index % 3].id;
    const description = index % 5 === 0
      ? null
      : 'Синтетическое описание. Этот текст выдуман и существует только для проверки вёрстки.';
    const category = SYNTHETIC_CATEGORIES.find((entry) => entry.id === categoryId) ?? null;
    return {
      id: `synthetic-listing-${String(index + 1).padStart(3, '0')}`,
      name: `${SYNTHETIC_NAMES[index % SYNTHETIC_NAMES.length]} #${index + 1}`,
      status,
      availability,
      price_minor: [12_000, 85_000, 210_000, 280_000, 1_000_000][index % 5],
      currency: 'UZS',
      media_count: mediaCount,
      store_id: 'synthetic-store',
      store_name: 'Синтетический магазин',
      category_id: categoryId,
      category_name: category ? category.name : null,
      updated_at: new Date(Date.now() - index * 3_600_000).toISOString(),
      description,
      ...syntheticQuality(mediaCount, categoryId, description, availability),
    };
  });
}

/**
 * The fixture applies every filter the server applies.
 *
 * This is not decoration. If fixtures filtered less than the server, a review
 * would sign off on a screen whose controls do nothing; if they filtered more,
 * it would sign off on a screen that cannot exist. The predicate list below is
 * the same list `functions/platform/admin/listings.ts` builds in SQL.
 */
export function syntheticListings(
  limit: number,
  offset: number,
  filters: ListingFilters = {},
): ListingsResponse {
  const all = syntheticCatalogue();
  const matched = all.filter((row) => (
    (!filters.status || row.status === filters.status)
    && (!filters.availability || row.availability === filters.availability)
    && (!filters.store || row.store_id === filters.store)
    && (!filters.category
      || (filters.category === 'uncategorised'
        ? row.category_id === null
        : row.category_id === filters.category))
    && (!filters.media
      || (filters.media === 'with' ? row.media_count > 0 : row.media_count === 0))
    && (!filters.quality || row.quality === filters.quality)
    // Prefix, not substring: the server runs `normalized_name LIKE 'term%'`,
    // and a fixture that matched anywhere in the name would let a reviewer
    // approve a search that finds less than they were shown.
    && (!filters.q
      || normalizeFixtureName(row.name).startsWith(normalizeFixtureName(filters.q)))
  ));
  const sorted = filters.sort === 'name_desc'
    ? [...matched].sort((a, b) => b.name.localeCompare(a.name, 'ru'))
    : [...matched].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const page = sorted.slice(offset, offset + limit);

  const byStatus = { draft: 0, published: 0, archived: 0 };
  const quality = { no_photo: 0, no_category: 0, no_description: 0, unavailable: 0 };
  for (const row of all) {
    if (row.status in byStatus) byStatus[row.status as keyof typeof byStatus] += 1;
    for (const reason of row.quality_reasons) quality[reason] += 1;
  }

  return {
    generated_at: new Date().toISOString(),
    page: { limit, offset, sort: filters.sort ?? 'name' },
    total: matched.length,
    count: page.length,
    read_only: true,
    summary: {
      total: all.length,
      by_status: byStatus,
      quality,
      attention: all.filter((row) => row.quality !== 'good').length,
    },
    // `description` is what the fixture grades quality from; the list contract
    // does not carry it, so it is dropped rather than renamed away.
    listings: page.map((row): ListingRow => ({
      id: row.id,
      name: row.name,
      status: row.status,
      availability: row.availability,
      price_minor: row.price_minor,
      currency: row.currency,
      media_count: row.media_count,
      store_id: row.store_id,
      store_name: row.store_name,
      category_id: row.category_id,
      category_name: row.category_name,
      updated_at: row.updated_at,
      quality: row.quality,
      quality_reasons: row.quality_reasons,
    })),
  };
}

export function syntheticListing(id: string): ListingDetailResponse {
  const row = syntheticCatalogue().find((entry) => entry.id === id)
    ?? syntheticCatalogue()[0];
  const listing: ListingDetail = {
    ...row,
    sku: `SYNTH-${row.id.slice(-3)}`,
    version: 3,
    created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    org_id: 'synthetic-org',
    // Half the invented images claim to live in Telegram, so the fallback that
    // says "not stored here" is reachable in review rather than theoretical.
    media: Array.from({ length: row.media_count }, (_, index) => ({
      index,
      kind: index % 2 === 0 ? 'stored' as const : 'external' as const,
    })),
    specifications: row.description
      ? [
        { key: 'Материал', value: 'Синтетическое значение' },
        { key: 'Гарантия', value: '12 месяцев (выдумано)' },
      ]
      : [],
    search_terms: row.description ? ['синтетика', 'проверка'] : [],
    preview: {
      title: row.name,
      price: `${new Intl.NumberFormat('ru-RU').format(row.price_minor)} сум`,
      availability: {
        available: 'В наличии',
        unavailable: 'Нет в наличии',
        preorder: 'Под заказ',
      }[row.availability] ?? row.availability,
      description: row.description ?? '',
      category: row.category_name,
      store: row.store_name,
      media_count: row.media_count,
    },
  };
  return { generated_at: new Date().toISOString(), read_only: true, listing };
}

export function syntheticCategories(): CategoriesResponse {
  const all = syntheticCatalogue();
  const categories: CategoryRow[] = SYNTHETIC_CATEGORIES.map((entry, index) => {
    const rows = all.filter((row) => row.category_id === entry.id);
    return {
      id: entry.id,
      name: entry.name,
      slug: entry.slug,
      status: index === 3 ? 'archived' : 'active',
      sort_order: index,
      store_id: 'synthetic-store',
      store_name: 'Синтетический магазин',
      updated_at: new Date(Date.now() - index * 86_400_000).toISOString(),
      total: rows.length,
      published: rows.filter((row) => row.status === 'published').length,
      draft: rows.filter((row) => row.status === 'draft').length,
      archived: rows.filter((row) => row.status === 'archived').length,
      no_photo: rows.filter((row) => row.media_count === 0).length,
      uncategorised: false,
    };
  });
  const orphans = all.filter((row) => row.category_id === null);
  if (orphans.length > 0) {
    categories.push({
      id: 'uncategorised',
      name: '',
      slug: '',
      status: 'active',
      sort_order: Number.MAX_SAFE_INTEGER,
      store_id: '',
      store_name: '',
      updated_at: '',
      total: orphans.length,
      published: orphans.filter((row) => row.status === 'published').length,
      draft: orphans.filter((row) => row.status === 'draft').length,
      archived: orphans.filter((row) => row.status === 'archived').length,
      no_photo: orphans.filter((row) => row.media_count === 0).length,
      uncategorised: true,
    });
  }
  return {
    generated_at: new Date().toISOString(),
    read_only: true,
    count: categories.length,
    categories,
  };
}
