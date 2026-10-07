import { STUDIO_ORG } from "./schema";
import { REFUND_WINDOW_MS } from "./plans";
import { StudioStore, type StudioEntitlement } from "./store";
import { ensureStudioPaidOperationsSchema } from "./operations-schema";

export interface RefundRequest { presentations_unused: number; photos_unused: number; requested_at: number }
export class StudioOperationError extends Error {}

export class StudioOperationsStore {
  constructor(readonly db: D1Database, readonly org = STUDIO_ORG) {}
  async init(): Promise<void> { await ensureStudioPaidOperationsSchema(this.db); }

  async refundRequest(orderId: string, now = Date.now()): Promise<RefundRequest> {
    await this.init();
    // Snapshot in one statement, once. An operator cannot backdate a request
    // to obtain an earlier quota or extend the 14-day application window.
    await this.db.prepare(`INSERT INTO studio_refund_requests(org_id,order_id,presentations_unused,photos_unused,requested_at)
      SELECT o.org_id,o.id,COALESCE(SUM(e.presentations_limit-e.presentations_used),0),COALESCE(SUM(e.photos_limit-e.photos_used),0),?
      FROM studio_orders_v2 o LEFT JOIN studio_entitlements e ON e.org_id=o.org_id AND e.order_id=o.id
      WHERE o.org_id=? AND o.id=? AND o.state='paid' AND o.perform_time<=? AND o.perform_time>=?
      GROUP BY o.org_id,o.id ON CONFLICT(org_id,order_id) DO NOTHING`).bind(now,this.org,orderId,now,now-REFUND_WINDOW_MS).run();
    const row = await this.db.prepare("SELECT presentations_unused,photos_unused,requested_at FROM studio_refund_requests WHERE org_id=? AND order_id=?").bind(this.org,orderId).first<RefundRequest>();
    if (!row) throw new StudioOperationError("refund_window");
    return row;
  }

  async credit(orderId: string, requestId: string, unit: "presentation_full" | "photo_task", reason: string, now = Date.now()) {
    await this.init();
    // D1 serializes this transaction. A duplicate request keeps its first
    // grant; the cap and the paid parent are checked inside the INSERT.
    await this.db.batch([
      this.db.prepare(`INSERT INTO studio_credit_grants(org_id,order_id,request_id,entitlement_id,unit,reason,created_at)
        SELECT org_id,id,?,id||'_c'||(1+(SELECT COUNT(*) FROM studio_credit_grants WHERE org_id=? AND order_id=?)),?,?,?
        FROM studio_orders_v2 WHERE org_id=? AND id=? AND state='paid'
        AND (SELECT COUNT(*) FROM studio_credit_grants WHERE org_id=? AND order_id=?)<10
        ON CONFLICT(org_id,order_id,request_id) DO NOTHING`).bind(requestId,this.org,orderId,unit,reason,now,this.org,orderId,this.org,orderId),
      this.db.prepare(`INSERT INTO studio_entitlements(org_id,id,order_id,user_id,mode,plan,plan_version,starts_at,ends_at,presentations_limit,photos_limit)
        SELECT g.org_id,g.entitlement_id,o.id,o.user_id,o.mode,'credit',o.plan_version,?,MAX(?,e.ends_at),CASE WHEN g.unit='presentation_full' THEN 1 ELSE 0 END,CASE WHEN g.unit='photo_task' THEN 1 ELSE 0 END
        FROM studio_credit_grants g JOIN studio_orders_v2 o ON o.org_id=g.org_id AND o.id=g.order_id
        JOIN studio_entitlements e ON e.org_id=o.org_id AND e.id=o.id
        WHERE g.org_id=? AND g.order_id=? AND g.request_id=? AND o.state='paid'
        ON CONFLICT(org_id,id) DO NOTHING`).bind(now,now+86_400_000,this.org,orderId,requestId),
    ]);
    const row = await this.db.prepare("SELECT entitlement_id,unit,reason FROM studio_credit_grants WHERE org_id=? AND order_id=? AND request_id=?").bind(this.org,orderId,requestId).first<{entitlement_id:string;unit:string;reason:string}>();
    if (!row) throw new StudioOperationError("credit_cap");
    if (row.unit!==unit || row.reason!==reason) throw new StudioOperationError("conflict");
    return row;
  }

  async extend(from: number, to: number, now = Date.now()): Promise<{extended:number;more:boolean}> {
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from<0 || to<=from || to-from>72*3_600_000 || to>now) throw new StudioOperationError("invalid");
    await this.init();
    await this.db.prepare("INSERT INTO studio_extension_windows(org_id,from_at,to_at) VALUES(?,?,?) ON CONFLICT DO NOTHING").bind(this.org,from,to).run();
    const window=await this.db.prepare("SELECT cursor,done FROM studio_extension_windows WHERE org_id=? AND from_at=? AND to_at=?").bind(this.org,from,to).first<{cursor:string;done:number}>();
    if(!window || window.done) return {extended:0,more:false};
    // Read at most 200 candidates BEFORE filtering. The durable cursor also
    // advances over ineligible/revoked rows, and stops repeated full scans.
    const page=await this.db.prepare("SELECT * FROM studio_entitlements WHERE org_id=? AND mode='live' AND id>? ORDER BY id LIMIT 200").bind(this.org,window.cursor).all<StudioEntitlement>();
    const candidates=page.results??[];
    const statements:D1PreparedStatement[]=[];
    for(const row of candidates) {
      if(row.revoked_at!==null || row.starts_at>=to || row.ends_at<=from) continue;
      const delta=Math.min(row.ends_at,to)-Math.max(row.starts_at,from);
      statements.push(
        this.db.prepare("INSERT INTO studio_extensions(org_id,entitlement_id,from_at,to_at,delta_ms,applied_at) VALUES(?,?,?,?,?,0) ON CONFLICT DO NOTHING").bind(this.org,row.id,from,to,delta),
        this.db.prepare("UPDATE studio_entitlements SET ends_at=ends_at+?,extended_ms=extended_ms+? WHERE org_id=? AND id=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM studio_extensions WHERE org_id=? AND entitlement_id=? AND from_at=? AND to_at=? AND applied_at=0)").bind(delta,delta,this.org,row.id,this.org,row.id,from,to),
        this.db.prepare("UPDATE studio_extensions SET applied_at=? WHERE org_id=? AND entitlement_id=? AND from_at=? AND to_at=? AND applied_at=0").bind(now,this.org,row.id,from,to),
      );
    }
    const more=candidates.length===200;
    const cursor=candidates.at(-1)?.id??window.cursor;
    statements.push(this.db.prepare("UPDATE studio_extension_windows SET cursor=MAX(cursor,?),done=MAX(done,?) WHERE org_id=? AND from_at=? AND to_at=?").bind(cursor,more?0:1,this.org,from,to));
    const results=await this.db.batch(statements);
    const extended=results.reduce((total,result,index)=>total+(index%3===1?Number(result.meta.changes??0):0),0);
    return {extended,more};
  }

  async beginReversal(orderId:string,requestId:string,paymentId:string,version:number,now=Date.now()):Promise<boolean> {
    await this.init();
    const row=await this.db.prepare("INSERT INTO studio_reversal_attempts(org_id,order_id,request_id,state,payment_id,created_at,updated_at) SELECT org_id,id,?,'pending',?,?,? FROM studio_orders_v2 WHERE org_id=? AND id=? AND state='paid' AND provider='click' AND mode='live' AND version=? AND NOT EXISTS(SELECT 1 FROM studio_refunds WHERE org_id=? AND order_id=?) ON CONFLICT DO NOTHING RETURNING order_id").bind(requestId,paymentId,now,now,this.org,orderId,version,this.org,orderId).first();
    return !!row;
  }
  async reversalResult(orderId:string,state:'confirmed'|'unknown'|'failed',now=Date.now()):Promise<void> {
    await this.db.prepare("UPDATE studio_reversal_attempts SET state=?,updated_at=? WHERE org_id=? AND order_id=? AND state='pending'").bind(state,now,this.org,orderId).run();
  }

  async report(from:number,to:number) {
    if (!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<from||to-from>31*86_400_000) throw new StudioOperationError('invalid');
    await this.init();
    const orders=await this.db.prepare("SELECT id,plan,plan_version,provider,mode,amount,state,perform_time,cancel_time FROM studio_orders_v2 INDEXED BY idx_studio_orders_v2_budget_report WHERE org_id=? AND owner_test=0 AND created_at>=? AND created_at<=? ORDER BY created_at,id LIMIT 501").bind(this.org,from,to).all();
    const refunds=await this.db.prepare("SELECT r.order_id,r.amount,r.method,r.receipt_state,r.requested_at,r.created_at,o.owner_test FROM (SELECT * FROM studio_refunds WHERE org_id=? AND created_at>=? AND created_at<=? ORDER BY created_at LIMIT 501) r JOIN studio_orders_v2 o ON o.org_id=r.org_id AND o.id=r.order_id").bind(this.org,from,to).all<{owner_test:number;[key:string]:unknown}>();
    const jobs=await this.db.prepare("SELECT j.state,j.reason,j.source,e.mode,o.owner_test FROM (SELECT org_id,state,reason,source,entitlement_id FROM studio_unit_ledger WHERE org_id=? AND created_at>=? AND created_at<=? ORDER BY created_at LIMIT 5001) j LEFT JOIN studio_entitlements e ON e.org_id=j.org_id AND e.id=j.entitlement_id LEFT JOIN studio_orders_v2 o ON o.org_id=e.org_id AND o.id=e.order_id").bind(this.org,from,to).all<{state:string;reason:string|null;source:string;mode:string|null;owner_test:number|null}>();
    const counts=new Map<string,{state:string;reason:string|null;count:number}>();
    for(const job of (jobs.results??[]).slice(0,5000)) {
      if(job.owner_test===1 || (job.source!=='free'&&job.mode!=='live')) continue;
      const key=JSON.stringify([job.state,job.reason]);const count=counts.get(key)??{state:job.state,reason:job.reason,count:0};count.count++;counts.set(key,count);
    }
    return {orders:(orders.results??[]).slice(0,500),refunds:(refunds.results??[]).slice(0,500).filter(row=>row.owner_test===0),truncated:(orders.results?.length??0)>500||(refunds.results?.length??0)>500,jobsTruncated:(jobs.results?.length??0)>5000,jobsScope:'free_and_live_non_owner',jobs:[...counts.values()]};
  }

  async maintain(now:number) {
    await this.init();
    const cutoff=new Date(now); cutoff.setUTCMonth(cutoff.getUTCMonth()-13);
    const attribution=await this.db.prepare(`UPDATE studio_orders_v2 SET touch=NULL,gclid=NULL,gbraid=NULL,wbraid=NULL,yclid=NULL,utm_source=NULL,utm_medium=NULL,utm_campaign=NULL,utm_term=NULL,utm_content=NULL,landing_path=NULL,referrer_host=NULL,first_seen_at=NULL,ga_client_id=NULL,ga_session_id=NULL,ym_client_id=NULL,attrib_purged_at=? WHERE rowid IN(SELECT rowid FROM studio_orders_v2 WHERE org_id=? AND attrib_purged_at IS NULL AND created_at<? LIMIT 200)`).bind(now,this.org,now-93*86_400_000).run();
    const ledger=await this.db.prepare("DELETE FROM studio_unit_ledger WHERE rowid IN(SELECT rowid FROM studio_unit_ledger INDEXED BY idx_studio_ledger_terminal_gc WHERE org_id=? AND created_at<? AND state IN ('done','released','refused') LIMIT 200)").bind(this.org,cutoff.getTime()).run();
    const usage=await this.db.prepare("DELETE FROM studio_free_usage WHERE rowid IN(SELECT rowid FROM studio_free_usage WHERE org_id=? AND day<? LIMIT 200)").bind(this.org,new Date(now-35*86_400_000).toISOString().slice(0,10)).run();
    const store=new StudioStore(this.db,this.org);
    const pending=await this.db.prepare("SELECT id FROM studio_orders_v2 WHERE org_id=? AND state='pending' AND external_id IS NULL AND expires_at<=? LIMIT 50").bind(this.org,now).all<{id:string}>();
    for(const row of pending.results??[]) await store.cancel(row.id,{method:'invoice_expired',from:['pending'],unseen:true,now});
    // Shared maintainBilling already removes closed rate windows after 2 days.
    return {attribution:attribution.meta.changes,ledger:ledger.meta.changes,usage:usage.meta.changes};
  }
}
