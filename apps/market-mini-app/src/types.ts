export type Locale = 'ru' | 'uz';
export type Role = 'buyer' | 'seller';

export interface Capabilities {
  buyer: boolean;
  sellerRead: boolean;
  sellerCommands: boolean;
  /**
   * Server-reported voice availability: the kill switch is on AND a speech
   * credential is configured. Optional so a cached pre-voice bootstrap simply
   * resolves to "no microphone" instead of breaking the launch.
   */
  voice?: boolean;
}

export type VoiceConstraintKind =
  | 'query'
  | 'budget'
  | 'availability'
  | 'attribute'
  | 'category';

export interface VoiceConstraint {
  kind: VoiceConstraintKind;
  value: string;
}

export interface VoiceInterpretation {
  productQuery: string;
  maxPriceMinor: number | null;
  /** Spoken number with no budget cue — offered once, never auto-applied. */
  ambiguousPriceMinor: number | null;
  availability: 'available' | null;
  category: { id: string; name: string } | null;
  constraints: VoiceConstraint[];
  clarification: 'budget' | 'empty_query' | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface VoiceSearchResult {
  transcript: string;
  language: 'ru' | 'uz' | 'other';
  interpretation: VoiceInterpretation;
  items: Product[];
  queryApplied: string | null;
}

export interface SessionExchange {
  token: string;
  expiresAt: string;
  locale: Locale;
  user: { firstName: string; lastName: string | null; username: string | null };
  capabilities: Capabilities;
  storefront: { id: string; locale: Locale };
}

export interface Bootstrap {
  apiVersion: string;
  buildId: string;
  locale: Locale;
  navigation: string[];
  sellerNavigation: string[];
  flags: Capabilities;
  storefront: { id: string; state: string };
  counters: { orders: number; activeCheckout: boolean; activeHandoff: boolean };
}

export interface CatalogHome {
  categories: Category[];
  products: Product[];
  updatedAt: string;
}

export interface MarketLaunch {
  session: SessionExchange;
  bootstrap: Bootstrap;
  home: CatalogHome;
}

export interface Category {
  id: string;
  name: string;
  productCount: number;
}

export interface Product {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: 'UZS';
  availability: 'available' | 'preorder' | 'unavailable';
  status: 'draft' | 'published' | 'archived';
  mediaHandles: string[];
  specifications: { key: string; label: string; value: string }[];
  version: number;
  updatedAt: string;
  storeName: string;
  relevance?: {
    confidence: 'high' | 'medium' | 'low';
    matchedConstraints: string[];
    unmatchedConstraints: string[];
    reasonCodes: string[];
  };
}

export interface CheckoutSnapshot {
  order: {
    id: string;
    orderNumber: string;
    productId: string;
    productNameSnapshot: string;
    unitPriceMinor: number;
    quantity: number | null;
    totalMinor: number | null;
    buyerName: string | null;
    buyerPhone: string | null;
    buyerAddress: string | null;
    buyerComment: string | null;
    status: string;
  };
  state: string;
  outcome: string;
  priceChanged: boolean;
}

export interface BuyerOrder {
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  storeName: string;
  quantity: number;
  totalMinor: number;
  status: 'placed' | 'confirmed' | 'done' | 'cancelled';
  placedAt: string;
}

export interface SellerOrder {
  orderId: string;
  orderNumber: string;
  status: 'placed' | 'confirmed' | 'cancelled' | 'done';
  productId: string;
  productName: string;
  quantity: number;
  totalMinor: number;
  version: number;
  placedAt: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerComment?: string | null;
  inventoryOnHand?: number | null;
}

export interface Handoff {
  id: string;
  status: 'open' | 'answered' | 'closed' | 'expired';
  reason: string;
  questionText?: string | null;
  replyText?: string | null;
  hasReply?: boolean;
  contentCleared: boolean;
  createdAt: string;
  expiresAt?: string;
  version?: number;
}

export interface Inventory {
  productId: string;
  productName: string;
  onHand: number;
  version: number;
}

/** Owner-only product fields. Present on `/seller/*` payloads, never on a card. */
export interface ProductOwnerFields {
  searchTerms: string[];
  specifications: {
    key: string;
    labelRu: string;
    labelUz: string;
    value: string;
  }[];
}

export interface SellerProduct extends Product {
  owner?: ProductOwnerFields;
}

export interface OrderPage {
  items: SellerOrder[];
  nextCursor: string | null;
}

export type ProductIssue =
  | 'no_media'
  | 'no_description'
  | 'no_specifications'
  | 'no_search_terms';

export interface AttentionGroup<T> {
  count: number;
  /** True when the read hit its scan depth: the count is a floor, not a total. */
  truncated: boolean;
  items: T[];
}

export interface SellerOverview {
  store: { id: string; name: string };
  generatedAt: string;
  slaHours: number;
  attention: {
    newOrders: AttentionGroup<SellerOrder & { ageMinutes: number }>;
    agingOrders: AttentionGroup<SellerOrder & { ageMinutes: number }>;
    openQuestions: AttentionGroup<{
      id: string;
      reason: string;
      createdAt: string;
      ageMinutes: number;
    }>;
    outOfStock: AttentionGroup<{
      productId: string;
      productName: string;
      version: number;
    }>;
    drafts: AttentionGroup<{
      id: string;
      name: string;
      priceMinor: number;
      version: number;
    }>;
    weakProducts: AttentionGroup<{
      id: string;
      name: string;
      version: number;
      issues: ProductIssue[];
    }>;
  };
  stats: Stats;
}

export interface Stats {
  windowDays: number;
  since: string;
  generatedAt: string;
  exact: {
    productsPublished: number;
    checkoutsStarted: number;
    ordersPlaced: number;
    ordersConfirmed: number;
    ordersCancelled: number;
    ordersDone: number;
    handoffsOpen: number;
    handoffsAnswered: number;
  };
  funnel: Record<string, number>;
}
