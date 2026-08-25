import { auditLeadRadarD1Schema } from './schema-contract';

const personalDataSchema = new WeakMap<D1Database, Promise<boolean>>();
const verifiedRuntimeSchema = new WeakMap<D1Database, Promise<void>>();

export class LeadRadarSchemaUnavailableError extends Error {
  readonly code = 'lead_radar_schema_unavailable';

  constructor() {
    super('lead_radar_schema_unavailable');
    this.name = 'LeadRadarSchemaUnavailableError';
  }
}

/**
 * Exact, read-only production assertion. The canonical audit validates tables,
 * ordered columns, defaults, CHECKs, FKs, indexes, integrity and migration
 * ledger. It is cached only for the exact D1 binding object in this isolate.
 */
export function assertLeadRadarRuntimeSchema(db: D1Database): Promise<void> {
  const existing = verifiedRuntimeSchema.get(db);
  if (existing) return existing;
  const pending = auditLeadRadarD1Schema(db, 'target').then((report) => {
    if (report.status !== 'pass' || report.matchedProfile !== 'target') {
      throw new LeadRadarSchemaUnavailableError();
    }
  });
  verifiedRuntimeSchema.set(db, pending);
  return pending.catch((error) => {
    verifiedRuntimeSchema.delete(db);
    if (error instanceof LeadRadarSchemaUnavailableError) throw error;
    throw new LeadRadarSchemaUnavailableError();
  });
}

/**
 * Minimal read-only privacy contract used by retention while processing is
 * paused. Absence means there cannot be Lead Radar person JSON to purge; a
 * partial shape fails closed and is reported by the Worker without attempting
 * to repair schema at runtime.
 */
export function hasLeadRadarPersonalDataSchema(db: D1Database): Promise<boolean> {
  const existing = personalDataSchema.get(db);
  if (existing) return existing;
  const pending = Promise.all([
    db.prepare(`SELECT name FROM pragma_table_info('lead_radar_companies')
      WHERE name IN ('id','org_id','search_id','telegram_url','telegram_contact_json',
        'decision_makers_json','updated_at') ORDER BY name`).all<{ name: string }>(),
    db.prepare(`SELECT name FROM pragma_table_info('lead_radar_evidence')
      WHERE name IN ('id','org_id','company_id','field_path') ORDER BY name`).all<{ name: string }>(),
  ]).then(([companies, evidence]) => (
    (companies.results ?? []).length === 7 && (evidence.results ?? []).length === 4
  ));
  personalDataSchema.set(db, pending);
  return pending.catch((error) => {
    personalDataSchema.delete(db);
    throw error;
  });
}
