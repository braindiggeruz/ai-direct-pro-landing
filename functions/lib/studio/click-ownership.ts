// One Click cash desk cannot assign a transaction to both a chat order and
// a Studio order. SQLite triggers make ownership atomic with either update.
export const STUDIO_CLICK_OWNERSHIP_DDL = [
  `CREATE TRIGGER IF NOT EXISTS studio_click_chat_owner BEFORE UPDATE OF external_id ON gpt_payment_orders WHEN NEW.provider='click' AND NEW.external_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'click_transaction_owned') WHERE EXISTS(SELECT 1 FROM studio_orders_v2 WHERE org_id=NEW.org_id AND provider='click' AND mode=NEW.mode AND external_id=NEW.external_id); END`,
  `CREATE TRIGGER IF NOT EXISTS studio_click_studio_owner BEFORE UPDATE OF external_id ON studio_orders_v2 WHEN NEW.provider='click' AND NEW.external_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'click_transaction_owned') WHERE EXISTS(SELECT 1 FROM gpt_payment_orders WHERE org_id=NEW.org_id AND provider='click' AND mode=NEW.mode AND external_id=NEW.external_id); END`,
] as const;
const bootstraps=new WeakMap<D1Database,Promise<void>>();
export function ensureStudioClickOwnership(db:D1Database):Promise<void> {
  let p=bootstraps.get(db);
  if(!p) { p=db.batch(STUDIO_CLICK_OWNERSHIP_DDL.map(sql=>db.prepare(sql))).then(()=>undefined).catch((e:unknown)=>{bootstraps.delete(db);throw e;});bootstraps.set(db,p); }
  return p;
}
export function isClickOwnershipConflict(error:unknown):boolean {
  return error instanceof Error && error.message.includes('click_transaction_owned');
}
