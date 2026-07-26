// Platform contract: request-scoped tenant context.
// Every tenant-aware operation in the platform receives an OrgContext; the
// repository layer uses ctx.orgId in every WHERE clause (AGENTS.md §3).
// Deliberately minimal — add fields only when a stage actually needs them.

export type Locale = 'ru' | 'uz';

export interface OrgContext {
  /** Tenant boundary. Never optional: platform code without an org is a bug. */
  orgId: string;
  /** Acting person (member/contact) when known; absent for system actions. */
  actorId?: string;
  /** Correlation id for logs/events within one inbound request. */
  requestId: string;
  locale: Locale;
}
