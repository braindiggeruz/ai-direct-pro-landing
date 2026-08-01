const verifiedDatabases = new WeakSet<D1Database>();

/**
 * Runtime bootstraps protect fresh and test databases. A production entry
 * point may bypass them only after it has verified its complete migration
 * contract against the exact D1 binding used by the request.
 */
export function markRuntimeSchemaVerified(db: D1Database): void {
  verifiedDatabases.add(db);
}

export function isRuntimeSchemaVerified(db: D1Database): boolean {
  return verifiedDatabases.has(db);
}
