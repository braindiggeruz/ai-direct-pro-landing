// Platform contract: PII-safe event envelope. TypeScript describes the
// allowed JSON shape; platform/events/pii.ts enforces it at runtime.

export type EventScalar = string | number | boolean | null;
export type EventValue =
  | EventScalar
  | readonly EventValue[]
  | Readonly<{ [key: string]: EventValue }>;
export type PiiSafePayload = Readonly<Record<string, EventValue>>;

export interface PlatformEvent {
  id: string;
  /** namespace.verb in past tense, e.g. 'order.created'. */
  type: string;
  /** ISO-8601. */
  occurredAt: string;
  /** Null for platform-global events (no tenant). */
  orgId: string | null;
  agentId: string | null;
  /** Aggregate reference, e.g. 'conversation:abc123'. */
  aggregate: string;
  payload: PiiSafePayload;
}
