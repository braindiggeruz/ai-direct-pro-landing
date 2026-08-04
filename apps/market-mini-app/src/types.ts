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
  /**
   * Server-reported photo upload availability: the switch is on AND a bucket is
   * bound. Optional so a cached pre-upload bootstrap resolves to "no picker"
   * instead of breaking the launch.
   */
  mediaUpload?: boolean;
  /**
   * Server-reported cabinet shell. Optional so a cached pre-cabinet bootstrap
   * resolves to the four-tab layout the device already knows instead of
   * breaking the launch.
   */
  cabinet?: boolean;
  /**
   * Server-reported cabinet root. Optional for the same reason: a bootstrap
   * answered before this shipped resolves to the root the device already knows.
   * A layout switch — it never grants a read, a command or an authority.
   */
  cabinetHomeV2?: boolean;
  /**
   * Server-reported back-gesture spine. Optional and additive like the two
   * above: a bootstrap answered before this shipped leaves every back gesture
   * behaving exactly as it did. It is navigation only — it grants nothing.
   */
  navBack?: boolean;
  /**
   * Server-reported QuickPost composer. Optional and additive: a bootstrap
   * answered before this shipped resolves to the bot handoff the device already
   * knows. It decides which screen "Продать" opens and nothing else — the
   * authority to create a listing stays `sellerCommands`, checked by the server
   * on every command regardless of what this says.
   */
  quickPost?: boolean;
  /**
   * QuickPost's voice and AI lane. False for QP-1A, where the composer is
   * entirely manual: a control that cannot work yet is worse than no control.
   */
  quickPostAi?: boolean;
  /**
   * Whether the owner binding screen is worth offering. Presentation only, and
   * additive like the switches above: a bootstrap answered before this shipped
   * simply has no such row. It decides whether the row can be found — never what
   * the screen may do. Both binding endpoints read the same server switch on
   * every call, so a client that sets this by hand finds the same 404.
   */
  ownerTelegramBinding?: boolean;
  /** Classifieds-first global discovery; remains server flag-closed. */
  classifiedsDiscovery?: boolean;
  /** Private seller profile/listing commands; separate from buyer reads. */
  privateListing?: boolean;
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
  storefront: { id: string; locale: Locale } | null;
}

export interface Bootstrap {
  apiVersion: string;
  buildId: string;
  locale: Locale;
  navigation: string[];
  sellerNavigation: string[];
  flags: Capabilities;
  storefront: { id: string; state: string } | null;
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

export interface ClassifiedVoiceSearchResult {
  transcript: string;
  language: 'ru' | 'uz' | 'other';
  interpretation: VoiceInterpretation;
  items: ClassifiedListing[];
  nextCursor: string | null;
  queryApplied: string | null;
}

export type ClassifiedCondition =
  | 'new'
  | 'like_new'
  | 'good'
  | 'fair'
  | 'for_parts'
  | 'not_applicable';

export interface ClassifiedListing {
  id: string;
  listingScope: 'private' | 'store';
  name: string;
  description: string | null;
  priceMinor: number;
  currency: 'UZS';
  availability: 'available' | 'preorder' | 'unavailable';
  mediaHandles: string[];
  category: { id: string; slug: string; nameRu: string; nameUz: string };
  condition: ClassifiedCondition;
  conditionLabel: { ru: string; uz: string };
  location: {
    countryCode: 'UZ';
    regionId: string;
    regionNameRu: string;
    regionNameUz: string;
    districtId: string;
    districtNameRu: string;
    districtNameUz: string;
    localityText: string | null;
  };
  seller: {
    displayName: string;
    type: 'private' | 'store';
    verificationState: 'unverified' | 'identity_verified' | 'store_verified';
  };
  contactMode: 'in_app' | 'telegram_relay' | 'phone_optional';
  phoneDisclosure: 'not_available' | 'after_buyer_action';
  commerceMode: 'inquiry' | 'store_order';
  store: { id: string; name: string } | null;
  updatedAt: string;
}

export interface ClassifiedCategory {
  id: string;
  slug: string;
  nameRu: string;
  nameUz: string;
  highRisk: boolean;
  allowedConditions: ClassifiedCondition[];
  visibleListingCount: number;
}

export interface ClassifiedLocation {
  countryCode: 'UZ';
  regionId: string;
  regionNameRu: string;
  regionNameUz: string;
  districtId: string;
  districtNameRu: string;
  districtNameUz: string;
}

export interface ClassifiedInquiry {
  id: string;
  listing: { id: string; name: string };
  sellerDisplayName: string;
  contactMode: ClassifiedListing['contactMode'];
  message: string;
  reply: string | null;
  status: 'open' | 'answered' | 'closed';
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * The states a private seller is shown for their own listing.
 *
 * Derived by the server from the product status and the moderation verdict
 * together, because neither alone tells the seller what is happening: an
 * approved listing they took down and one still waiting for review are both
 * "draft" in the database.
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

export type ModerationReasonCode =
  | 'new_seller_review'
  | 'high_risk_category'
  | 'prohibited_item'
  | 'suspected_fraud'
  | 'duplicate_listing'
  | 'misleading_content'
  | 'unsafe_contact'
  | 'personal_data'
  | 'seller_request'
  | 'appeal_upheld'
  | 'other_policy';

export interface SellerProfile {
  id: string;
  displayName: string;
  sellerType: 'private';
  verificationState: 'unverified' | 'identity_verified';
  status: 'active' | 'restricted' | 'suspended' | 'closed';
  moderationState: 'clear' | 'under_review' | 'restricted' | 'blocked';
  version: number;
}

export interface SellerListing {
  id: string;
  state: SellerListingState;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: 'UZS';
  mediaHandles: string[];
  category: { id: string; slug: string; nameRu: string; nameUz: string } | null;
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
  contactMode: ClassifiedListing['contactMode'] | null;
  moderation: {
    state: 'pending' | 'approved' | 'rejected' | 'restricted' | 'removed';
    reasonCode: ModerationReasonCode | null;
    decidedAt: string | null;
  } | null;
  /** Real counts only. There is no view counter because nothing records one. */
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
  /** Raw media references, index-aligned with `mediaHandles`. */
  mediaRefs: string[];
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
