import type { LeadRadarInboxClassification } from '../../../src/shared/lead-radar-inbox';
const installedInboxSchemas = new WeakSet<D1Database>();

export interface OutreachInboxRow {
  id: string; org_id: string; account_id: string; campaign_id: string;
  recipient_id: string; company_id: string; outbound_effect_id: string;
  external_event_digest: string; payload_digest: string;
  kind: 'reply' | 'opt_out'; occurred_at: string; received_at: string;
  body_ciphertext: string | null; body_iv: string | null; body_expires_at: string;
  body_present: number; workflow_state: 'pending' | 'applied'; applied_at: string | null;
  classification: LeadRadarInboxClassification; classified_at: string | null;
}
export interface OutreachInboxListRow extends OutreachInboxRow { company_name: string; suppressed: number }

/** All SQL for the inbound ledger lives here. Ingestion never accepts a company id. */
export class OutreachInboxStore {
  constructor(private readonly db: D1Database) {}

  async hasSchema(): Promise<boolean> {
    if (installedInboxSchemas.has(this.db)) return true;
    const present=Boolean(await this.db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='lead_radar_outreach_inbox'").first());
    if(present)installedInboxSchemas.add(this.db);
    return present;
  }

  async get(orgId: string, id: string): Promise<OutreachInboxRow | null> {
    return this.db.prepare('SELECT * FROM lead_radar_outreach_inbox WHERE org_id=? AND id=?').bind(orgId,id).first<OutreachInboxRow>();
  }

  async insert(input: Omit<OutreachInboxRow,'campaign_id'|'recipient_id'|'company_id'|'workflow_state'|'applied_at'|'classification'|'classified_at'>): Promise<boolean> {
    // The whole linkage is verified in the same INSERT SELECT that establishes
    // idempotency and the pending opt-out barrier. Foreign/org/account mismatch
    // cannot leave a row or modify a company.
    const result = await this.db.prepare(`INSERT INTO lead_radar_outreach_inbox (
      id,org_id,account_id,campaign_id,recipient_id,company_id,outbound_effect_id,
      external_event_digest,payload_digest,kind,occurred_at,received_at,
      body_ciphertext,body_iv,body_expires_at,body_present
    ) SELECT ?,e.org_id,c.account_id,c.id,r.id,l.id,e.id,?,?,?,?,?,?,?,?,?
      FROM lead_radar_tg_campaign_effects e
      JOIN lead_radar_tg_campaign_recipients r ON r.org_id=e.org_id AND r.id=e.recipient_id AND r.campaign_id=e.campaign_id
      JOIN lead_radar_tg_campaigns c ON c.org_id=e.org_id AND c.id=e.campaign_id
      JOIN lead_radar_companies l ON l.org_id=r.org_id AND l.id=r.company_id
      WHERE e.org_id=? AND e.id=? AND c.account_id=? AND e.status='sent'
        AND e.provider_message_digest IS NOT NULL AND e.created_at<=?
      ON CONFLICT(org_id,account_id,external_event_digest) DO NOTHING`).bind(
        input.id,input.external_event_digest,input.payload_digest,input.kind,input.occurred_at,input.received_at,
        input.body_ciphertext,input.body_iv,input.body_expires_at,input.body_present,
        // Telegram timestamps have second precision; preserve the provider
        // time while allowing only that rounding delta against our ms clock.
        input.org_id,input.outbound_effect_id,input.account_id,new Date(Date.parse(input.occurred_at)+1000).toISOString(),
      ).run();
    return (result.meta.changes ?? 0) === 1;
  }

  async applyReply(row: OutreachInboxRow, now: string): Promise<void> {
    await this.db.batch([
      this.db.prepare(`UPDATE lead_radar_companies SET lifecycle='replied',updated_at=?
        WHERE org_id=? AND id=? AND suppressed=0 AND lifecycle IN ('new','contacted')
          AND EXISTS (SELECT 1 FROM lead_radar_outreach_inbox WHERE org_id=? AND id=? AND kind='reply' AND workflow_state='pending')`)
        .bind(now,row.org_id,row.company_id,row.org_id,row.id),
      this.db.prepare(`UPDATE lead_radar_outreach_inbox SET workflow_state='applied',applied_at=?
        WHERE org_id=? AND id=? AND kind='reply' AND workflow_state='pending'`).bind(now,row.org_id,row.id),
    ]);
  }

  async finishOptOut(row: OutreachInboxRow, now: string): Promise<boolean> {
    // The durable barrier is removed only after the existing cross-history DNC
    // transaction has suppressed the seed. A crash before this UPDATE is safe:
    // the event remains pending and maintenance/replay repeats suppression.
    await this.db.prepare(`UPDATE lead_radar_outreach_inbox SET workflow_state='applied',applied_at=?
      WHERE org_id=? AND id=? AND kind='opt_out' AND workflow_state='pending'
        AND EXISTS (SELECT 1 FROM lead_radar_companies WHERE org_id=? AND id=? AND suppressed=1 AND lifecycle='do_not_contact')`)
      .bind(now,row.org_id,row.id,row.org_id,row.company_id).run();
    return (await this.get(row.org_id,row.id))?.workflow_state === 'applied';
  }

  async pending(orgId: string, limit: number): Promise<OutreachInboxRow[]> {
    return (await this.db.prepare(`SELECT * FROM lead_radar_outreach_inbox WHERE org_id=? AND workflow_state='pending'
      ORDER BY received_at,id LIMIT ?`).bind(orgId,limit).all<OutreachInboxRow>()).results;
  }

  async list(orgId: string, cursor: {receivedAt:string; id:string} | null, limit: number): Promise<OutreachInboxListRow[]> {
    return (await this.db.prepare(`SELECT i.*,l.name AS company_name,l.suppressed FROM lead_radar_outreach_inbox i
      JOIN lead_radar_companies l ON l.org_id=i.org_id AND l.id=i.company_id
      WHERE i.org_id=? ${cursor ? 'AND (i.received_at<? OR (i.received_at=? AND i.id<?))' : ''}
      ORDER BY i.received_at DESC,i.id DESC LIMIT ?`)
      .bind(orgId,...(cursor ? [cursor.receivedAt,cursor.receivedAt,cursor.id] : []),limit)
      .all<OutreachInboxListRow>()).results;
  }

  async classify(orgId: string, id: string, classification: LeadRadarInboxClassification, now: string): Promise<boolean> {
    // A sales label is not a consent grant, delivery receipt or DNC toggle.
    const result = await this.db.prepare(`UPDATE lead_radar_outreach_inbox SET classification=?,classified_at=?
      WHERE org_id=? AND id=? AND kind='reply' AND workflow_state='applied'`)
      .bind(classification,now,orgId,id).run();
    return (result.meta.changes ?? 0) === 1;
  }

  async purgeExpiredBodies(orgId: string, now: string, limit=100): Promise<number> {
    const result = await this.db.prepare(`UPDATE lead_radar_outreach_inbox SET body_ciphertext=NULL,body_iv=NULL
      WHERE org_id=? AND id IN (SELECT id FROM lead_radar_outreach_inbox WHERE org_id=? AND body_expires_at<=?
        AND body_ciphertext IS NOT NULL ORDER BY body_expires_at,id LIMIT ?)`)
      .bind(orgId,orgId,now,Math.max(1,Math.min(500,Math.floor(limit)))).run();
    return result.meta.changes ?? 0;
  }
}

/** Account-scoped durable barrier. Call immediately before reserving/dispatching.
 * Missing migration is fail-closed; callers may translate storage failure to a
 * paused account. An already-started provider effect cannot be unsent. */
export async function hasPendingOutreachOptOut(db: D1Database, orgId: string, accountId: string, options: {schemaRequired:boolean}={schemaRequired:true}): Promise<boolean> {
  if(!await new OutreachInboxStore(db).hasSchema()) {
    if(options.schemaRequired) throw new Error('outreach_inbox_schema_unavailable');
    return false;
  }
  return Boolean(await db.prepare(`SELECT 1 AS pending FROM lead_radar_outreach_inbox
    WHERE org_id=? AND account_id=? AND kind='opt_out' AND workflow_state='pending' LIMIT 1`)
    .bind(orgId,accountId).first());
}
