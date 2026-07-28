import type { Locale } from '../../../platform/contracts';

export const HANDOFF_STATUSES = [
  'open',
  'answered',
  'closed',
  'expired',
] as const;

export const HANDOFF_REASONS = [
  'unknown_intent',
  'buyer_requested_human',
  'catalog_no_result',
  'order_question',
  'seller_initiated',
] as const;

export const SELLER_REPLY_STATES = [
  'awaiting_reply',
  'completed',
  'cancelled',
] as const;

export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];
export type HandoffReason = (typeof HANDOFF_REASONS)[number];
export type SellerReplyState = (typeof SELLER_REPLY_STATES)[number];

/**
 * One buyer question escalated to the store owner. Question and reply are the
 * only free-form content the agent ever stores, they are bounded, and they are
 * cleared once `expiresAt` passes — after which `questionText`/`replyText` read
 * as null and no reply is possible.
 */
export interface SotuvchiHandoff {
  id: string;
  orgId: string;
  storeId: string;

  buyerIdentityId: string;
  buyerSessionId: string;
  sellerIdentityId: string | null;

  status: HandoffStatus;
  reason: HandoffReason;

  questionText: string | null;
  replyText: string | null;
  contentCleared: boolean;

  sellerNotifiedAt: string | null;
  buyerDeliveredAt: string | null;

  createdAt: string;
  updatedAt: string;
  answeredAt: string | null;
  closedAt: string | null;
  expiresAt: string;

  version: number;
}

/** Queue row. Never carries the question text. */
export interface HandoffSummary {
  id: string;
  status: HandoffStatus;
  reason: HandoffReason;
  createdAt: string;
  hasReply: boolean;
  contentCleared: boolean;
}

export interface HandoffBuyerSession {
  id: string;
  orgId: string;
  storeId: string;
  identityId: string;
  locale: Locale;
}

export interface SellerReplySession {
  orgId: string;
  storeId: string;
  sellerIdentityId: string;
  handoffId: string;
  workflowInstanceId: string;
  state: SellerReplyState;
  expiresAt: string;
}

export type HandoffOutcome =
  | 'created'
  | 'existing'
  | 'answered'
  | 'closed'
  | 'unchanged';

export interface HandoffSnapshot {
  handoff: SotuvchiHandoff;
  outcome: HandoffOutcome;
}

export interface SellerReplyWorkflowPayload {
  handoffId: string;
}
