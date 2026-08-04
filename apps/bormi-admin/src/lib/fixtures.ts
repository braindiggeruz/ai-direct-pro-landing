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
  ModerationDetailResponse,
  ModerationQueueResponse,
  ModerationRow,
  ModerationState,
  OperationsSummary,
  OrderDetailResponse,
  OrderRow,
  OrdersResponse,
  OrderStage,
  OverviewResponse,
  QuestionDetailResponse,
  QuestionRow,
  QuestionsResponse,
  QuestionStatus,
  ReportRow,
  ReportsResponse,
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

// ── ADMIN-4A: operations ─────────────────────────────────────────────────────
//
// Order references are invented and look nothing like the real numbering. There
// is no buyer here at all — not an invented one either, because a fixture that
// showed a name where production shows none would make the screenshot lie about
// what the panel can see.

const HOUR = 3_600_000;

function ago(hours: number): string {
  return new Date(Date.now() - hours * HOUR).toISOString();
}

function syntheticOrderRows(): OrderRow[] {
  const rows: {
    reference: string;
    stage: OrderStage;
    hours: number;
    item: string | null;
    total: number | null;
  }[] = [
    { reference: 'SYN-1041', stage: 'placed', hours: 39, item: 'Синтетический товар А', total: 149_000 },
    { reference: 'SYN-1040', stage: 'placed', hours: 5, item: 'Синтетический товар Б', total: 89_000 },
    { reference: 'SYN-1039', stage: 'confirmed', hours: 26, item: 'Синтетический товар В', total: 320_000 },
    { reference: 'SYN-1038', stage: 'done', hours: 52, item: 'Синтетический товар Г', total: 55_000 },
    { reference: 'SYN-1037', stage: 'cancelled', hours: 71, item: 'Синтетический товар Д', total: 210_000 },
    { reference: 'SYN-1036', stage: 'draft', hours: 2, item: null, total: null },
  ];
  return rows.map((row) => ({
    id: `synthetic-order-${row.reference.toLowerCase()}`,
    reference: row.reference,
    stage: row.stage,
    status: row.stage === 'draft' || row.stage === 'cancelled' ? row.stage : 'placed',
    fulfillment: row.stage === 'confirmed' || row.stage === 'done' ? row.stage : 'none',
    store_id: 'synthetic-store',
    store_name: 'Синтетический магазин',
    items: row.item === null ? 0 : 1,
    item_name: row.item,
    total_minor: row.total,
    currency: 'UZS',
    waiting_on: row.stage === 'placed' ? 'seller' : (row.stage === 'draft' ? 'buyer' : 'nobody'),
    attention: row.stage === 'placed' ? (row.hours >= 24 ? 'stalled' : 'waiting') : 'none',
    created_at: ago(row.hours),
    placed_at: row.stage === 'draft' ? null : ago(row.hours),
  }));
}

function syntheticQuestionRows(): QuestionRow[] {
  const rows: {
    status: QuestionStatus;
    reason: string;
    hours: number;
    reply: boolean;
    delivered: boolean;
  }[] = [
    { status: 'open', reason: 'catalog_no_result', hours: 31, reply: false, delivered: false },
    { status: 'open', reason: 'buyer_requested_human', hours: 3, reply: false, delivered: false },
    { status: 'answered', reason: 'order_question', hours: 12, reply: true, delivered: false },
    { status: 'answered', reason: 'unknown_intent', hours: 30, reply: true, delivered: true },
    { status: 'closed', reason: 'seller_initiated', hours: 60, reply: true, delivered: true },
    { status: 'expired', reason: 'unknown_intent', hours: 96, reply: false, delivered: false },
  ];
  return rows.map((row, index) => ({
    id: `synthetic-question-${index + 1}`,
    status: row.status,
    reason: row.reason,
    store_id: 'synthetic-store',
    store_name: 'Синтетический магазин',
    has_question: row.status !== 'expired',
    has_reply: row.reply,
    waiting_on: row.status === 'open'
      ? 'seller'
      : (row.status === 'answered' && !row.delivered ? 'buyer' : 'nobody'),
    attention: row.status === 'open' ? (row.hours >= 24 ? 'stalled' : 'waiting') : 'none',
    created_at: ago(row.hours),
    answered_at: row.reply ? ago(row.hours - 1) : null,
    closed_at: row.status === 'closed' ? ago(row.hours - 2) : null,
    expires_at: ago(row.hours - 72),
  }));
}

function syntheticOperationsSummary(): OperationsSummary {
  const orders = syntheticOrderRows();
  const questions = syntheticQuestionRows();
  return {
    orders_total: orders.length,
    orders_awaiting_seller: orders.filter((row) => row.waiting_on === 'seller').length,
    questions_total: questions.length,
    questions_open: questions.filter((row) => row.status === 'open').length,
  };
}

export function syntheticOrders(
  limit: number,
  offset: number,
  filters: { stage?: string; store?: string } = {},
): OrdersResponse {
  const all = syntheticOrderRows().filter((row) => (
    (!filters.stage || row.stage === filters.stage)
    && (!filters.store || row.store_id === filters.store)
  ));
  const page = all.slice(offset, offset + limit);
  return {
    generated_at: new Date().toISOString(),
    page: { limit, offset },
    total: all.length,
    count: page.length,
    read_only: true,
    sort: 'created_desc',
    filters: {
      stage: (filters.stage as OrderStage | undefined) ?? null,
      store: filters.store ?? null,
    },
    summary: syntheticOperationsSummary(),
    orders: page,
  };
}

export function syntheticOrder(id: string): OrderDetailResponse {
  const row = syntheticOrderRows().find((entry) => entry.id === id) ?? syntheticOrderRows()[0];
  return {
    generated_at: new Date().toISOString(),
    read_only: true,
    order: {
      ...row,
      org_id: 'synthetic-org',
      updated_at: row.created_at,
      item: row.item_name === null ? null : {
        product_id: 'synthetic-product',
        name: row.item_name,
        unit_price_minor: row.total_minor ?? 0,
        currency: 'UZS',
        availability: 'available',
        quantity: 1,
        line_total_minor: row.total_minor,
      },
    },
  };
}

export function syntheticQuestions(
  limit: number,
  offset: number,
  filters: { status?: string; store?: string } = {},
): QuestionsResponse {
  const all = syntheticQuestionRows().filter((row) => (
    (!filters.status || row.status === filters.status)
    && (!filters.store || row.store_id === filters.store)
  ));
  const page = all.slice(offset, offset + limit);
  return {
    generated_at: new Date().toISOString(),
    page: { limit, offset },
    total: all.length,
    count: page.length,
    read_only: true,
    sort: 'created_desc',
    filters: {
      status: (filters.status as QuestionStatus | undefined) ?? null,
      store: filters.store ?? null,
    },
    summary: syntheticOperationsSummary(),
    questions: page,
  };
}

/* ── Classifieds moderation ──────────────────────────────────────────────── */

const SYNTHETIC_ACTOR = { email: 'synthetic-owner@example.invalid', role: 'platform_owner' };

/**
 * Six invented listings across every moderation state.
 *
 * The seller is three public trust facts and an invented display name — the
 * same shape the real projection carries, which has no identity id and no
 * contact detail to invent in the first place.
 */
function syntheticModerationRows(): ModerationRow[] {
  const hour = 3_600_000;
  const now = Date.now();
  const at = (hours: number) => new Date(now - hours * hour).toISOString();
  return [
    {
      listing_id: 'synthetic-mod-1',
      name: 'Велосипед подростковый, синтетическая карточка',
      price_minor: 1_200_000,
      currency: 'UZS',
      media_count: 3,
      state: 'pending',
      reason_code: 'new_seller_review',
      submitted_at: at(2),
      decided_at: null,
      version: 1,
      seller_display_name: 'Вымышленный продавец А',
      seller_type: 'private',
      seller_verification: 'unverified',
      category_name_ru: 'Спорт и хобби',
      district_name_ru: 'Мирзо-Улугбекский район',
      open_reports: 0,
    },
    {
      listing_id: 'synthetic-mod-2',
      name: 'Автозапчасть, синтетическая карточка',
      price_minor: 450_000,
      currency: 'UZS',
      media_count: 1,
      state: 'pending',
      reason_code: 'high_risk_category',
      submitted_at: at(5),
      decided_at: null,
      version: 1,
      seller_display_name: 'Вымышленный продавец Б',
      seller_type: 'private',
      seller_verification: 'identity_verified',
      category_name_ru: 'Запчасти',
      district_name_ru: 'Чиланзарский район',
      open_reports: 2,
    },
    {
      listing_id: 'synthetic-mod-3',
      name: 'Детская коляска, синтетическая карточка',
      price_minor: 900_000,
      currency: 'UZS',
      media_count: 0,
      state: 'pending',
      reason_code: 'new_seller_review',
      submitted_at: at(9),
      decided_at: null,
      version: 1,
      seller_display_name: 'Вымышленный продавец В',
      seller_type: 'private',
      seller_verification: 'unverified',
      category_name_ru: 'Детям',
      district_name_ru: 'Юнусабадский район',
      open_reports: 0,
    },
    {
      listing_id: 'synthetic-mod-4',
      name: 'Ноутбук, синтетическая карточка',
      price_minor: 6_500_000,
      currency: 'UZS',
      media_count: 4,
      state: 'approved',
      reason_code: null,
      submitted_at: at(30),
      decided_at: at(28),
      version: 2,
      seller_display_name: 'Вымышленный продавец Г',
      seller_type: 'private',
      seller_verification: 'identity_verified',
      category_name_ru: 'Электроника',
      district_name_ru: 'Яккасарайский район',
      open_reports: 1,
    },
    {
      listing_id: 'synthetic-mod-5',
      name: 'Услуга, синтетическая карточка',
      price_minor: 300_000,
      currency: 'UZS',
      media_count: 1,
      state: 'rejected',
      reason_code: 'misleading_content',
      submitted_at: at(50),
      decided_at: at(49),
      version: 2,
      seller_display_name: 'Вымышленный продавец Д',
      seller_type: 'private',
      seller_verification: 'unverified',
      category_name_ru: 'Услуги',
      district_name_ru: 'Шайхантахурский район',
      open_reports: 0,
    },
    {
      listing_id: 'synthetic-mod-6',
      name: 'Мебель, синтетическая карточка',
      price_minor: 2_100_000,
      currency: 'UZS',
      media_count: 2,
      state: 'restricted',
      reason_code: 'personal_data',
      submitted_at: at(70),
      decided_at: at(66),
      version: 3,
      seller_display_name: 'Вымышленный продавец Е',
      seller_type: 'private',
      seller_verification: 'unverified',
      category_name_ru: 'Дом и сад',
      district_name_ru: 'Сергелийский район',
      open_reports: 0,
    },
  ];
}

export function syntheticModerationQueue(
  limit: number,
  offset: number,
  state: string,
): ModerationQueueResponse {
  const all = syntheticModerationRows();
  // `all` is the server's own word for "no filter", so the fixture reads it the
  // same way rather than inventing a seventh state.
  const filtered = state === 'all' ? all : all.filter((row) => row.state === state);
  const page = filtered.slice(offset, offset + limit);
  const summary: Record<string, number> = {
    pending: 0, approved: 0, rejected: 0, restricted: 0, removed: 0,
  };
  for (const row of all) summary[row.state] += 1;
  summary.open_reports = all.reduce((total, row) => total + row.open_reports, 0);
  return {
    generated_at: new Date().toISOString(),
    actor: SYNTHETIC_ACTOR,
    page: { limit, offset },
    filters: { state: state === 'all' ? null : (state as ModerationState) },
    total: filtered.length,
    count: page.length,
    summary,
    listings: page,
  };
}

export function syntheticModerationDetail(id: string): ModerationDetailResponse {
  const rows = syntheticModerationRows();
  const row = rows.find((entry) => entry.listing_id === id) ?? rows[0];
  return {
    generated_at: new Date().toISOString(),
    actor: SYNTHETIC_ACTOR,
    listing: {
      ...row,
      description: 'Вымышленное описание для проверки вёрстки. Реального товара '
        + 'за этой карточкой нет, и ни одна строка здесь не принадлежит человеку.',
      // Opaque references of the right shape. There are no bytes behind them:
      // under fixtures the media route is never called.
      media_refs: Array.from(
        { length: row.media_count },
        (_, index) => `r2.synthetic${String(index).padStart(8, '0')}`,
      ),
      condition: 'good',
      region_name_ru: 'Город Ташкент',
      locality_text: null,
      contact_mode: 'in_app',
      product_status: row.state === 'approved' ? 'published' : 'draft',
      history: [
        {
          action: 'listing.submitted',
          actor_type: 'seller',
          reason_code: row.reason_code,
          from_state: null,
          to_state: 'pending',
          created_at: row.submitted_at,
        },
        ...(row.decided_at ? [{
          action: `listing.${row.state}` as string,
          actor_type: 'moderator',
          reason_code: row.reason_code,
          from_state: 'pending',
          to_state: row.state as string,
          created_at: row.decided_at,
        }] : []),
      ],
      reports: Array.from({ length: row.open_reports }, (_, index) => ({
        id: `synthetic-report-${row.listing_id}-${index}`,
        reason_code: index === 0 ? 'misleading_content' : 'suspected_fraud',
        status: 'open',
        created_at: row.submitted_at,
      })),
    },
  };
}

export function syntheticReports(
  limit: number,
  offset: number,
  status: string,
): ReportsResponse {
  const rows = syntheticModerationRows();
  const all: ReportRow[] = rows.flatMap((row) => Array.from(
    { length: row.open_reports },
    (_, index): ReportRow => ({
      id: `synthetic-report-${row.listing_id}-${index}`,
      product_id: row.listing_id,
      listing_name: row.name,
      reason_code: index === 0 ? 'misleading_content' : 'suspected_fraud',
      status: 'open',
      moderation_action: 'none',
      version: 1,
      created_at: row.submitted_at,
      listing_state: row.state,
    }),
  ));
  const filtered = status === 'all' ? all : all.filter((row) => row.status === status);
  const page = filtered.slice(offset, offset + limit);
  return {
    generated_at: new Date().toISOString(),
    actor: SYNTHETIC_ACTOR,
    page: { limit, offset },
    filters: { status: status === 'all' ? null : status },
    count: page.length,
    reports: page,
  };
}

export function syntheticQuestion(id: string): QuestionDetailResponse {
  const row = syntheticQuestionRows().find((entry) => entry.id === id)
    ?? syntheticQuestionRows()[0];
  return {
    generated_at: new Date().toISOString(),
    read_only: true,
    question: {
      ...row,
      org_id: 'synthetic-org',
      seller_notified_at: row.created_at,
      seller_notify_attempts: row.status === 'open' ? 2 : 1,
      buyer_delivered_at: row.waiting_on === 'buyer' ? null : row.answered_at,
      buyer_delivery_attempts: row.has_reply ? 1 : 0,
      content_cleared_at: row.status === 'expired' ? row.created_at : null,
      updated_at: row.created_at,
    },
  };
}
