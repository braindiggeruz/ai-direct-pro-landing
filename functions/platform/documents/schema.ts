import { DOCUMENT_DDL } from './store';
/** Additive bootstrap; the release must still apply 0079 before enabling the feature. */
export async function ensureDocumentSchema(db: D1Database): Promise<void> {
  await db.batch(DOCUMENT_DDL.map(sql => db.prepare(sql)));
}
