/** A received provider event is separate from an outbound acceptance receipt. */
export interface LeadRadarInboxEvent {
  schemaVersion: 1;
  orgId: string;
  accountId: string;
  outboundEffectId: string;
  externalEventId: string;
  kind: 'reply' | 'opt_out';
  occurredAt: string;
  text?: string;
}

export type LeadRadarInboxClassification = 'needs_reply' | 'interested' | 'declined' | 'handled';
export interface LeadRadarInboxItem {
  id: string;
  companyId: string;
  companyName: string;
  campaignId: string;
  kind: LeadRadarInboxEvent['kind'];
  occurredAt: string;
  receivedAt: string;
  classification: LeadRadarInboxClassification;
  workflowState: 'pending' | 'applied';
  text: string | null;
  bodyState: 'available' | 'expired' | 'not_provided' | 'unavailable';
  suppressed: boolean;
}

export interface LeadRadarInboxPage {
  availability: 'disabled' | 'not_configured' | 'ready';
  items: LeadRadarInboxItem[];
  nextCursor: string | null;
}
