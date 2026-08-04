export const CLASSIFIED_CONDITIONS = [
  'new',
  'like_new',
  'good',
  'fair',
  'for_parts',
  'not_applicable',
] as const;

export type ClassifiedCondition = (typeof CLASSIFIED_CONDITIONS)[number];
export type ClassifiedSellerType = 'private' | 'store';
export type ClassifiedContactMode = 'in_app' | 'telegram_relay' | 'phone_optional';
export type ClassifiedCommerceMode = 'inquiry' | 'store_order';

export interface ClassifiedListing {
  id: string;
  listingScope: ClassifiedSellerType;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: 'UZS';
  availability: 'available' | 'unavailable' | 'preorder';
  mediaCount: number;
  category: {
    id: string;
    slug: string;
    nameRu: string;
    nameUz: string;
  };
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
    type: ClassifiedSellerType;
    verificationState: 'unverified' | 'identity_verified' | 'store_verified';
  };
  contactMode: ClassifiedContactMode;
  phoneDisclosure: 'not_available' | 'after_buyer_action';
  commerceMode: ClassifiedCommerceMode;
  store: { id: string; name: string } | null;
  updatedAt: string;
}

export interface ClassifiedDiscoveryFilter {
  categoryId?: string;
  regionId?: string;
  districtId?: string;
  condition?: ClassifiedCondition;
  sellerType?: ClassifiedSellerType;
  availability?: ClassifiedListing['availability'];
  storeId?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  query?: string;
  cursor?: string;
  limit?: number;
}

export interface NormalizedClassifiedDiscoveryFilter {
  categoryId: string | null;
  regionId: string | null;
  districtId: string | null;
  condition: ClassifiedCondition | null;
  sellerType: ClassifiedSellerType | null;
  availability: ClassifiedListing['availability'] | null;
  storeId: string | null;
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
  normalizedQuery: string | null;
  cursor: { updatedAt: string; id: string } | null;
  limit: number;
}

export interface ClassifiedDiscoveryPage {
  items: ClassifiedListing[];
  nextCursor: string | null;
}

export interface ClassifiedCategoryOption {
  id: string;
  slug: string;
  nameRu: string;
  nameUz: string;
  highRisk: boolean;
  allowedConditions: ClassifiedCondition[];
  visibleListingCount: number;
}

export interface ClassifiedLocationOption {
  countryCode: 'UZ';
  regionId: string;
  regionNameRu: string;
  regionNameUz: string;
  districtId: string;
  districtNameRu: string;
  districtNameUz: string;
}

export interface PrivateSellerContext {
  identityId: string;
  requestId: string;
  idempotencyKey: string;
}

export interface PrivateSellerProfile {
  id: string;
  displayName: string;
  sellerType: 'private';
  verificationState: 'unverified' | 'identity_verified';
  status: 'active' | 'restricted' | 'suspended' | 'closed';
  moderationState: 'clear' | 'under_review' | 'restricted' | 'blocked';
  version: number;
}

export interface SubmitPrivateListingInput {
  name: string;
  description?: string | null;
  priceMinor: number;
  currency: 'UZS';
  mediaRefs: readonly string[];
  globalCategoryId: string;
  condition: ClassifiedCondition;
  regionId: string;
  districtId: string;
  localityText?: string | null;
  contactMode: ClassifiedContactMode;
}

export interface PrivateListingSubmission {
  id: string;
  listingScope: 'private';
  status: 'draft';
  moderationState: 'pending';
  version: number;
  commerceMode: 'inquiry';
}

export type ListingReportReason =
  | 'prohibited_item'
  | 'suspected_fraud'
  | 'duplicate_listing'
  | 'misleading_content'
  | 'unsafe_contact'
  | 'personal_data'
  | 'other_policy';

export interface SubmitListingReportInput {
  reason: ListingReportReason;
  note?: string | null;
}

export interface ListingReportContext extends PrivateSellerContext {
  reporterSessionHash: string;
}

export interface ListingReportSubmission {
  id: string;
  listingId: string;
  status: 'open';
  moderationAction: 'none';
}

export interface ClassifiedFavoritePage {
  items: ClassifiedListing[];
  nextCursor: null;
}

export interface CreateListingInquiryInput {
  message: string;
}

export interface ClassifiedBuyerInquiry {
  id: string;
  listing: { id: string; name: string };
  sellerDisplayName: string;
  contactMode: ClassifiedContactMode;
  message: string;
  reply: string | null;
  status: 'open' | 'answered' | 'closed';
  version: number;
  createdAt: string;
  updatedAt: string;
}
