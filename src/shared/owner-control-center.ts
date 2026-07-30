// Shared contract for the P3.1 Owner Control Center.
//
// Kept in src/shared so the Pages Functions and the admin SPA agree on one
// vocabulary. Everything here is a projection or a closed list — no field in
// this file can carry a credential, a buyer conversation or raw Telegram
// content, because no endpoint on this surface returns one.

export const PLATFORM_ROLES = ['platform_owner', 'support_readonly'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const OWNER_REASON_CODES = [
  'pilot_onboarding',
  'pilot_paused_by_owner',
  'seller_request',
  'policy_violation',
  'suspected_abuse',
  'data_quality',
  'incident_response',
  'operator_error_recovery',
] as const;
export type OwnerReasonCode = (typeof OWNER_REASON_CODES)[number];

/** Russian labels for the reason selector. The stored value stays the code. */
export const OWNER_REASON_LABELS: Readonly<Record<OwnerReasonCode, string>> = {
  pilot_onboarding: 'Онбординг пилота',
  pilot_paused_by_owner: 'Пилот приостановлен владельцем',
  seller_request: 'Запрос продавца',
  policy_violation: 'Нарушение правил',
  suspected_abuse: 'Подозрение на злоупотребление',
  data_quality: 'Качество данных',
  incident_response: 'Реакция на инцидент',
  operator_error_recovery: 'Исправление ошибки оператора',
};

export const OWNER_AUDIT_ACTIONS = [
  'store.suspend',
  'store.restore',
  'pilot.activate',
  'pilot.pause',
  'automation.replay',
] as const;
export type OwnerAuditAction = (typeof OWNER_AUDIT_ACTIONS)[number];

/** Actions the UI must gate behind retyping the target id. */
export const TYPED_CONFIRMATION_ACTIONS: readonly OwnerAuditAction[] = [
  'store.suspend',
  'pilot.activate',
  'pilot.pause',
  'automation.replay',
];

export interface OwnerActor {
  email: string;
  role: PlatformRole;
}

export interface PlatformOverview {
  stores: { total: number; active: number; suspended: number; other: number };
  pilot: { active: number; paused: number; inactive: number };
  sellers: number;
  products: { total: number; published: number };
  orders: { today: number; last7d: number; placed: number; confirmed: number; done: number; cancelled: number };
  handoffs: { open: number; answered: number; closed: number; expired: number };
  automation: { queued: number; running: number; retry_wait: number; awaiting_review: number; dead_letter: number; completed: number };
  drafts: { pending_review: number; total: number };
  audit_events: number;
}

export interface OwnerOverviewResponse {
  generated_at: string;
  actor: OwnerActor;
  marketplace: { enabled: false; note: string };
  runtime_policy: {
    first_party_automation_enabled: boolean;
    first_party_automation_path: 'sole';
    n8n: 'retired';
    auto_publication: false;
  };
  overview: PlatformOverview;
}

export interface OwnerStoreSummary {
  storeId: string;
  orgId: string;
  name: string;
  locale: string;
  status: string;
  storefrontCode: string;
  onboardingStatus: string;
  pilotState: 'inactive' | 'active' | 'paused';
  products: number;
  publishedProducts: number;
  orders: number;
  openHandoffs: number;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerOrderRow {
  orderId: string;
  orgId: string;
  storeId: string;
  orderNumber: string;
  status: string;
  fulfillmentStatus: string;
  totalMinor: number;
  currency: string;
  items: number;
  createdAt: string;
  placedAt: string | null;
}

export interface OwnerHandoffRow {
  handoffId: string;
  orgId: string;
  storeId: string;
  status: string;
  reason: string;
  hasQuestion: boolean;
  hasReply: boolean;
  sellerNotifyAttempts: number;
  buyerDeliveryAttempts: number;
  createdAt: string;
  answeredAt: string | null;
  closedAt: string | null;
  expiresAt: string | null;
}

export interface OwnerAutomationJobRow {
  jobId: string;
  jobType: string;
  tenantKey: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  availableAt: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  resultRef: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerAuditEvent {
  eventId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  orgId: string | null;
  reasonCode: string;
  requestId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface OwnerPilotRecord {
  orgId: string;
  storeId: string;
  state: 'inactive' | 'active' | 'paused';
  activatedAt: string | null;
  pausedAt: string | null;
  updatedBy: string;
  updatedAt: string;
  version: number;
}

export interface OwnerPage { limit: number; offset: number }

export interface OwnerMutationResult {
  outcome: 'applied' | 'duplicate' | 'unchanged';
  audit_event_id?: string;
  request_id?: string;
}

/** Generate a client-side idempotency key so a double-click replays, not repeats. */
export function newOwnerIdempotencyKey(action: OwnerAuditAction, targetId: string): string {
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
  return `${action.replace('.', '-')}:${targetId}:${random}`;
}

export function requiresTypedConfirmation(action: OwnerAuditAction): boolean {
  return TYPED_CONFIRMATION_ACTIONS.includes(action);
}
