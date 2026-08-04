/**
 * What the server answers, as this panel expects to read it.
 *
 * These mirror endpoints that already exist and are already guarded; nothing
 * here is a new capability. Fields that can legitimately be absent are typed as
 * absent rather than as zero, because a screen that cannot tell "none" from
 * "not measured" will eventually claim the second when it means the first.
 */

export type Severity = 'critical' | 'warning' | 'info';

export interface AttentionItem {
  code: string;
  severity: Severity;
  count: number;
}

export interface OverviewResponse {
  generated_at: string;
  window_days: number;
  actor: { email: string; role: string };
  rollout: { admin_v2: boolean };
  listings: {
    published: number;
    draft: number;
    archived: number;
    total: number;
    touched_7d: number;
    quality: {
      no_photo: number;
      no_description: number;
      no_category: number;
      unavailable: number;
    };
  };
  stores: { active: number; suspended: number; total: number };
  orders: {
    open: number;
    today: number;
    last7d: number;
    by_status: Record<string, number>;
  };
  handoffs: { open: number; by_status: Record<string, number> };
  access: {
    memberships: number;
    owners_active: number;
    disabled: number;
    telegram_active: number;
    seller_read: boolean;
    seller_commands: boolean;
    binding: {
      global_flag: boolean;
      ceremony_open: boolean;
      challenges_total: number;
      challenges_live: number;
      challenges_redeemed: number;
    };
  };
  flags: Record<string, boolean>;
  system: {
    build_id: string | null;
    migrations: { applied: number; last: string | null };
    bindings: { d1: boolean; r2_media: boolean; ai: boolean };
    /** Null on purpose: a Worker cannot read its own Pages deployment. */
    deployment: null;
  };
  activity: {
    listings: {
      id: string;
      name: string;
      status: string;
      availability: string;
      price_minor: number;
      media_count: number;
      store_name: string;
      updated_at: string;
    }[];
    orders: {
      reference: string;
      status: string;
      fulfillment: string;
      total_minor: number | null;
      created_at: string;
    }[];
  };
  audit: {
    action: string;
    target_type: string;
    actor_role: string;
    reason_code: string | null;
    created_at: string;
  }[];
  attention: AttentionItem[];
}

/** `GET /api/admin/agents/stores` — the shape the Owner Control Center shipped. */
export interface StoreSummary {
  id: string;
  org_id: string;
  name: string;
  status: string;
  locale?: string;
  created_at?: string;
  updated_at?: string;
  pilot_state?: string | null;
  product_count?: number;
  published_count?: number;
  open_orders?: number;
  open_handoffs?: number;
}

export interface StoresResponse {
  stores: StoreSummary[];
  count: number;
}

/** `GET /api/admin/agents/audit` — append-only, and read-only from here. */
export interface AuditEvent {
  event_id: string;
  created_at: string;
  actor_email: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  org_id: string | null;
  reason_code: string | null;
  request_id: string | null;
  idempotency_key?: string | null;
  before_json?: string | null;
  after_json?: string | null;
}

export interface AuditResponse {
  events: AuditEvent[];
  total: number;
  append_only: true;
}

/** `GET /api/admin/listings` — ADMIN-3A, read-only. */
export type ListingQualityState = 'good' | 'needs_attention' | 'incomplete';
export type ListingQualityReason =
  | 'no_photo' | 'no_category' | 'no_description' | 'unavailable';

export interface ListingRow {
  id: string;
  name: string;
  status: string;
  availability: string;
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

export interface ListingSummary {
  total: number;
  by_status: { draft: number; published: number; archived: number };
  quality: Record<ListingQualityReason, number>;
  attention: number;
}

export interface ListingsResponse {
  generated_at: string;
  page: { limit: number; offset: number; sort: string };
  /** Rows the filters matched, across the whole catalogue — not this page. */
  total: number;
  count: number;
  read_only: true;
  summary: ListingSummary;
  listings: ListingRow[];
}

/**
 * Every filter the server applies. There is no client-side filter anywhere in
 * this panel: a control that narrowed the loaded page would claim to have
 * searched the catalogue when it searched twenty-five rows.
 */
export interface ListingFilters {
  status?: string;
  availability?: string;
  media?: string;
  quality?: string;
  category?: string;
  store?: string;
  q?: string;
  sort?: string;
}

export interface ListingMedia {
  index: number;
  kind: 'stored' | 'external';
}

export interface ListingDetail extends ListingRow {
  sku: string | null;
  description: string | null;
  version: number;
  created_at: string;
  org_id: string;
  media: ListingMedia[];
  specifications: { key: string; value: string }[];
  search_terms: string[];
  /** Rendered by the buyer's own presenter, not by a second implementation. */
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

export interface ListingDetailResponse {
  generated_at: string;
  read_only: true;
  listing: ListingDetail;
}

/**
 * The three listing transitions the catalogue domain implements. There is no
 * fourth, and in particular there is no way out of `archived`.
 */
export type ListingCommand = 'publish' | 'unpublish' | 'archive';

/**
 * What a command answers.
 *
 * `applied` changed the listing. `duplicate` is the same logical attempt
 * arriving twice — the idempotency key matched an event already recorded, and
 * nothing changed the second time. `unchanged` means it was already in the
 * target state. `conflict` means somebody else moved it first.
 */
export interface ListingCommandResponse {
  outcome: 'applied' | 'duplicate' | 'unchanged' | 'conflict';
  listing: { id: string; status: string; version: number; store_id: string } | null;
  audit_event_id?: string;
  request_id?: string;
}

/**
 * ADMIN-4A: operations.
 *
 * Two read-only surfaces over domains that already exist. Nothing below carries
 * a buyer: `sotuvchi_orders` holds a name, a phone and an address and
 * `sotuvchi_handoffs` holds the words of a conversation, and the server selects
 * none of those columns. What the shapes here can express is deliberately the
 * limit of what the owner may see.
 */
export type OrderStage = 'draft' | 'placed' | 'confirmed' | 'done' | 'cancelled';
export type QuestionStatus = 'open' | 'answered' | 'closed' | 'expired';
/** Who a row is waiting on. Derived by the server, never stored. */
export type WaitingSide = 'seller' | 'buyer' | 'nobody';
/** `waiting` is a queue doing its job; `stalled` is one that has stopped. */
export type AttentionState = 'none' | 'waiting' | 'stalled';

export interface OperationsSummary {
  orders_total: number;
  orders_awaiting_seller: number;
  questions_total: number;
  questions_open: number;
}

export interface OrderRow {
  id: string;
  /** `order_number` — the reference a person can quote. Never the buyer. */
  reference: string;
  stage: OrderStage;
  status: string;
  fulfillment: string;
  store_id: string;
  store_name: string;
  items: number;
  /** The seller's own product name. An order carries no buyer copy. */
  item_name: string | null;
  total_minor: number | null;
  currency: string;
  waiting_on: WaitingSide;
  attention: AttentionState;
  created_at: string;
  placed_at: string | null;
}

export interface OrderDetail extends OrderRow {
  org_id: string;
  updated_at: string;
  item: {
    product_id: string;
    name: string;
    unit_price_minor: number;
    currency: string;
    availability: string;
    quantity: number | null;
    line_total_minor: number | null;
  } | null;
}

export interface OrdersResponse {
  generated_at: string;
  page: { limit: number; offset: number };
  total: number;
  count: number;
  read_only: true;
  sort: 'created_desc';
  filters: { stage: OrderStage | null; store: string | null };
  summary: OperationsSummary;
  orders: OrderRow[];
}

export interface OrderDetailResponse {
  generated_at: string;
  read_only: true;
  order: OrderDetail;
}

export interface QuestionRow {
  id: string;
  status: QuestionStatus;
  reason: string;
  store_id: string;
  store_name: string;
  /** Whether words exist. The words themselves never leave the domain. */
  has_question: boolean;
  has_reply: boolean;
  waiting_on: WaitingSide;
  attention: AttentionState;
  created_at: string;
  answered_at: string | null;
  closed_at: string | null;
  expires_at: string | null;
}

export interface QuestionDetail extends QuestionRow {
  org_id: string;
  seller_notified_at: string | null;
  seller_notify_attempts: number;
  buyer_delivered_at: string | null;
  buyer_delivery_attempts: number;
  content_cleared_at: string | null;
  updated_at: string;
}

export interface QuestionsResponse {
  generated_at: string;
  page: { limit: number; offset: number };
  total: number;
  count: number;
  read_only: true;
  sort: 'created_desc';
  filters: { status: QuestionStatus | null; store: string | null };
  summary: OperationsSummary;
  questions: QuestionRow[];
}

export interface QuestionDetailResponse {
  generated_at: string;
  read_only: true;
  question: QuestionDetail;
}

/** `GET /api/admin/categories` — counts, never a command. */
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
  /** True for the synthetic row collecting products that have no category. */
  uncategorised: boolean;
}

export interface CategoriesResponse {
  generated_at: string;
  read_only: true;
  count: number;
  categories: CategoryRow[];
}

/**
 * The only two things `GET /api/admin/agents/audit` narrows on that a person
 * can pick from a list. `target_id` and `actor_email` are also accepted, but
 * both are free text about a specific record rather than a filter over the
 * trail, and neither belongs in a control bar.
 */
export interface AuditFilters {
  /** One of `OWNER_AUDIT_ACTIONS`, or absent for all of them. */
  action?: string;
  /** One of `PLATFORM_ROLES`, or absent for both. */
  actorRole?: string;
}
