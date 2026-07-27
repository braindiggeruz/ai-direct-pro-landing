import type { Locale } from '../../platform/contracts';

export const STORE_DELIVERY_MODES = ['pickup', 'delivery', 'both'] as const;
export const STORE_PAYMENT_METHODS = [
  'cash',
  'card_transfer',
  'cash_on_delivery',
] as const;
export const STORE_STATUSES = ['draft', 'active', 'suspended'] as const;
export const SOTUVCHI_ONBOARDING_STATUSES = [
  'starting',
  'active',
  'completed',
  'cancelled',
  'failed',
] as const;

export type StoreDeliveryMode = (typeof STORE_DELIVERY_MODES)[number];
export type StorePaymentMethod = (typeof STORE_PAYMENT_METHODS)[number];
export type StoreStatus = (typeof STORE_STATUSES)[number];
export type SotuvchiOnboardingStatus =
  (typeof SOTUVCHI_ONBOARDING_STATUSES)[number];

export interface StoreProfile {
  id: string;
  orgId: string;
  name: string;
  locale: Locale;
  deliveryMode: StoreDeliveryMode;
  paymentMethods: readonly StorePaymentMethod[];
  storefrontCode: string;
  status: StoreStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SotuvchiIdentityContext {
  identityId: string;
  botUsername: string;
  requestId: string;
  locale: Locale;
}

export interface SotuvchiOnboardingDraft {
  storeName: string | null;
  locale: Locale | null;
  deliveryMode: StoreDeliveryMode | null;
  paymentMethods: readonly StorePaymentMethod[];
}

export type SotuvchiOnboardingState =
  | 'start'
  | 'awaiting_name'
  | 'awaiting_locale'
  | 'awaiting_delivery'
  | 'awaiting_payment'
  | 'review'
  | 'completed'
  | 'cancelled';

export interface SotuvchiOnboardingRecord {
  id: string;
  ownerIdentityId: string;
  botUsername: string;
  orgId: string | null;
  workflowInstanceId: string | null;
  status: SotuvchiOnboardingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SotuvchiOnboardingSnapshot {
  record: SotuvchiOnboardingRecord;
  orgId: string;
  workflowInstanceId: string;
  state: SotuvchiOnboardingState;
  version: number;
  status: SotuvchiOnboardingStatus;
  draft: SotuvchiOnboardingDraft;
  store: StoreProfile | null;
}

export interface SotuvchiStorefrontRoute {
  id: string;
  botUsername: string;
  routeCode: string;
  orgId: string;
  agentId: 'sotuvchi';
  ownerIdentityId: string;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedSotuvchiStorefront {
  orgId: string;
  agentId: 'sotuvchi';
  locale: Locale;
  storeId: string;
}

export type SubmitOnboardingStepInput =
  | {
      step: 'name';
      value: string;
      expectedVersion: number;
      idempotencyKey: string;
    }
  | {
      step: 'locale';
      value: Locale;
      expectedVersion: number;
      idempotencyKey: string;
    }
  | {
      step: 'delivery';
      value: StoreDeliveryMode;
      expectedVersion: number;
      idempotencyKey: string;
    }
  | {
      step: 'payment';
      value: readonly StorePaymentMethod[];
      expectedVersion: number;
      idempotencyKey: string;
    };

export interface ConfirmOnboardingResult {
  store: StoreProfile;
  route: SotuvchiStorefrontRoute;
  outcome: 'created' | 'existing';
  workflowStatus: 'completed';
}
