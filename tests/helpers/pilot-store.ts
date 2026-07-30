import { ensureOwnerAuditSchema } from '../../functions/platform/admin/audit';

export async function ensurePilotStoreSchema(db: D1Database): Promise<void> {
  await ensureOwnerAuditSchema(db);
}

export async function activatePilotStore(
  db: D1Database,
  orgId: string,
  storeId: string,
): Promise<void> {
  await ensurePilotStoreSchema(db);
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO owner_pilot_stores (
       org_id, store_id, state, activated_at, paused_at,
       updated_by, updated_at, version
     ) VALUES (?, ?, 'active', ?, NULL, 'test-operator', ?, 1)`,
  ).bind(orgId, storeId, now, now).run();
}

export async function setPilotStoreState(
  db: D1Database,
  orgId: string,
  storeId: string,
  state: 'active' | 'paused',
): Promise<void> {
  const now = new Date().toISOString();
  const result = await db.prepare(
    `UPDATE owner_pilot_stores
     SET state = ?,
         activated_at = CASE WHEN ? = 'active' THEN ? ELSE activated_at END,
         paused_at = CASE WHEN ? = 'paused' THEN ? ELSE paused_at END,
         updated_by = 'test-operator',
         updated_at = ?,
         version = version + 1
     WHERE org_id = ? AND store_id = ?`,
  ).bind(
    state,
    state,
    now,
    state,
    now,
    now,
    orgId,
    storeId,
  ).run();
  if (Number(result.meta?.changes ?? 0) !== 1) {
    throw new Error('pilot fixture state transition failed');
  }
}
