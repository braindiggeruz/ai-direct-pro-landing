import { sectionError, sectionOk, type AiChatSection } from '../../../src/shared/ai-chat-admin';
import type { StudioMonetizationData } from '../../../src/shared/studio-admin';
import { FiscalHealthStore } from '../gpt-chat/fiscal-health-store';

const TABLES=['studio_orders_v2','studio_refunds','studio_unit_ledger','studio_entitlements','gpt_ui_events','gpt_fiscal_receipts','gpt_payment_orders'];
/** Aggregates only, bounded 1..30-day window; never bootstraps or mutates schema. */
export class StudioMonetizationStore {
  constructor(readonly db:D1Database) {}
  async report(orgId:string,days:number,now=Date.now()):Promise<AiChatSection<StudioMonetizationData>> {
    if (!Number.isInteger(days)||days<1||days>30) throw new Error('invalid_window');
    const from=now-days*86_400_000;
    try {
      const schema=await this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${TABLES.map(()=>'?').join(',')})`).bind(...TABLES).all<{name:string}>();
      if (new Set(schema.results?.map(r=>r.name)).size!==TABLES.length) return sectionError('schema_pending');
      const rows=await this.db.batch([
        this.db.prepare(`SELECT type AS event,detail,COUNT(*) AS count,COUNT(DISTINCT view_id) AS views FROM gpt_ui_events
          WHERE org_id=? AND created_at>=? AND created_at<=? AND type IN ('studio_mode_entered','studio_tool_started','studio_result_ready','studio_upgrade_viewed','studio_upgrade_selected','studio_tariffs_viewed','studio_checkout_started','studio_checkout_result','studio_download_clicked') GROUP BY type,detail`).bind(orgId,from,now),
        this.db.prepare(`SELECT provider,plan,state,COUNT(*) AS count FROM studio_orders_v2 WHERE org_id=? AND mode='live' AND owner_test=0 AND created_at>=? AND created_at<=? GROUP BY provider,plan,state`).bind(orgId,from,now),
        this.db.prepare(`SELECT CASE WHEN LOWER(utm_source) IN ('instagram','facebook','meta','telegram','google','yandex','direct') THEN LOWER(utm_source) WHEN utm_source IS NULL OR utm_source='' THEN 'unknown' ELSE 'other' END AS source,COUNT(*) AS count,SUM(state IN ('paid','refunded')) AS paid,COALESCE(SUM(CASE WHEN state IN ('paid','refunded') THEN amount ELSE 0 END),0)/100.0 AS grossUzs FROM studio_orders_v2 WHERE org_id=? AND mode='live' AND owner_test=0 AND created_at>=? AND created_at<=? GROUP BY source`).bind(orgId,from,now),
        this.db.prepare(`SELECT COALESCE(SUM(amount),0)/100.0 AS grossUzs FROM studio_orders_v2 WHERE org_id=? AND mode='live' AND owner_test=0 AND state IN ('paid','refunded') AND perform_time>=? AND perform_time<=?`).bind(orgId,from,now),
        this.db.prepare(`SELECT COALESCE(SUM(r.amount),0)/100.0 AS refundsUzs FROM studio_refunds r JOIN studio_orders_v2 o ON o.org_id=r.org_id AND o.id=r.order_id WHERE r.org_id=? AND o.mode='live' AND o.owner_test=0 AND r.created_at>=? AND r.created_at<=?`).bind(orgId,from,now),
        this.db.prepare(`SELECT j.tool,j.source,j.state,COUNT(*) AS count,COALESCE(SUM(j.tool='presentation' AND j.shape='full' AND j.state='done' AND j.parts_done=(1<<j.parts_total)-1),0) AS fullDelivered,COALESCE(SUM(j.cost_micro),0) AS costMicro FROM studio_unit_ledger j LEFT JOIN studio_entitlements e ON e.org_id=j.org_id AND e.id=j.entitlement_id LEFT JOIN studio_orders_v2 o ON o.org_id=e.org_id AND o.id=e.order_id WHERE j.org_id=? AND j.created_at>=? AND j.created_at<=? AND (j.source='free' OR (e.mode='live' AND o.owner_test=0)) GROUP BY j.tool,j.source,j.state`).bind(orgId,from,now),
      ]);
      if(rows.some(r=>!r.success)) return sectionError('query_failed');
      const data=<T>(index:number)=>rows[index].results as T[];
      const grossUzs=Number(data<{grossUzs:number}>(3)[0]?.grossUzs??0), refundsUzs=Number(data<{refundsUzs:number}>(4)[0]?.refundsUzs??0);
      const jobs=data<StudioMonetizationData['jobs'][number]&{costMicro:number}>(5);
      return sectionOk({from,to:now,days,funnel:data(0),orders:data(1),sources:data(2),jobs:jobs.map(row=>({tool:row.tool,source:row.source,state:row.state,count:row.count,fullDelivered:row.fullDelivered})),
        money:{grossUzs,refundsUzs,netReceiptsUzs:grossUzs-refundsUzs,estimatedAiUsd:jobs.reduce((sum,row)=>sum+Number(row.costMicro),0)/1_000_000},
        fiscal:await new FiscalHealthStore(this.db).pending(orgId)});
    } catch { return sectionError('query_failed'); }
  }
}
