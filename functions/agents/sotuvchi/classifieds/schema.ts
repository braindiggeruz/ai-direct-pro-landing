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

const JOURNEY_TABLES = [
  'market_listing_favorites',
  'market_listing_inquiries',
] as const;

export class ClassifiedsSchemaError extends Error {
  constructor() {
    super('classifieds_schema_unavailable');
    this.name = 'ClassifiedsSchemaError';
  }
}

const checked = new WeakMap<D1Database, Promise<void>>();
const journeyChecked = new WeakMap<D1Database, Promise<void>>();
const lifecycleChecked = new WeakMap<D1Database, Promise<void>>();

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

/** Buyer write journeys are deployed after the read-only foundation. */
export function ensureClassifiedsJourneySchema(db: D1Database): Promise<void> {
  let pending = journeyChecked.get(db);
  if (!pending) {
    pending = ensureClassifiedsSchema(db).then(async () => {
      const placeholders = JOURNEY_TABLES.map(() => '?').join(', ');
      const tables = await db.prepare(
        `SELECT COUNT(*) AS n FROM sqlite_master
         WHERE type = 'table' AND name IN (${placeholders})`,
      ).bind(...JOURNEY_TABLES).first<{ n: number }>();
      if (Number(tables?.n ?? 0) !== JOURNEY_TABLES.length) {
        throw new ClassifiedsSchemaError();
      }
    }).catch((error) => {
      journeyChecked.delete(db);
      throw error;
    });
    journeyChecked.set(db, pending);
  }
  return pending;
}

/**
 * The seller lifecycle needs migration 0040 on top of the journey tables: the
 * widened operation vocabulary and the inquiry close key.
 *
 * Probed by column rather than by table, because 0040 adds no table. A seller
 * command reaching a database that stopped at 0039 would otherwise fail on a
 * CHECK constraint deep inside a batch instead of closing here.
 */
export function ensureClassifiedsLifecycleSchema(db: D1Database): Promise<void> {
  let pending = lifecycleChecked.get(db);
  if (!pending) {
    pending = ensureClassifiedsJourneySchema(db).then(async () => {
      const [closeKey, operations] = await Promise.all([
        db.prepare(
          `SELECT COUNT(*) AS n FROM pragma_table_info('market_listing_inquiries')
           WHERE name = 'close_idempotency_key'`,
        ).first<{ n: number }>(),
        db.prepare(
          `SELECT sql FROM sqlite_master
           WHERE type = 'table' AND name = 'market_listing_operations'`,
        ).first<{ sql: string | null }>(),
      ]);
      if (
        Number(closeKey?.n ?? 0) !== 1
        || !operations?.sql?.includes('private.resubmit')
      ) {
        throw new ClassifiedsSchemaError();
      }
    }).catch((error) => {
      lifecycleChecked.delete(db);
      throw error;
    });
    lifecycleChecked.set(db, pending);
  }
  return pending;
}
