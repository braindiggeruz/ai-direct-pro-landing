const REQUIRED_TABLES = [
  'seller_profiles',
  'listing_ownerships',
  'market_global_categories',
  'market_store_category_mappings',
  'market_listing_taxonomy',
  'market_regions',
  'market_districts',
  'market_listing_locations',
  'market_listing_channels',
  'market_listing_moderation',
  'market_listing_reports',
  'market_moderation_audit',
  'market_listing_operations',
] as const;

export class ClassifiedsSchemaError extends Error {
  constructor() {
    super('classifieds_schema_unavailable');
    this.name = 'ClassifiedsSchemaError';
  }
}

const checked = new WeakMap<D1Database, Promise<void>>();

/**
 * Classifieds never performs a production migration at request time. The
 * feature remains hidden until the release migration has installed every
 * bounded table and the `listing_scope` discriminator.
 */
export function ensureClassifiedsSchema(db: D1Database): Promise<void> {
  let pending = checked.get(db);
  if (!pending) {
    pending = (async () => {
      const placeholders = REQUIRED_TABLES.map(() => '?').join(', ');
      const [tables, scope] = await Promise.all([
        db.prepare(
          `SELECT COUNT(*) AS n FROM sqlite_master
           WHERE type = 'table' AND name IN (${placeholders})`,
        ).bind(...REQUIRED_TABLES).first<{ n: number }>(),
        db.prepare(
          `SELECT COUNT(*) AS n FROM pragma_table_info('sotuvchi_products')
           WHERE name = 'listing_scope'`,
        ).first<{ n: number }>(),
      ]);
      if (Number(tables?.n ?? 0) !== REQUIRED_TABLES.length || Number(scope?.n ?? 0) !== 1) {
        throw new ClassifiedsSchemaError();
      }
    })().catch((error) => {
      checked.delete(db);
      throw error;
    });
    checked.set(db, pending);
  }
  return pending;
}
