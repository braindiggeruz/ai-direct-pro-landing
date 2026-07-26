// Platform contract: PII-safe event envelope. The durable outbox and the
// in-process bus arrive in P0.3; this stage defines only the shape.
// Payload values are scalars by type so raw user text cannot be attached.

export type EventScalar = string | number | boolean | null;

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
  payload: Readonly<Record<string, EventScalar>>;
}
