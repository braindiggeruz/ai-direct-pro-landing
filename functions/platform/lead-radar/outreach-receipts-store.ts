import type { TgSenderEffectKey, TgSenderBinding } from './tg-sender-contract';
import { TG_SENDER_SCHEMA } from './tg-sender-contract';
import { normalizeSchemaSql } from './schema-sql';

export interface OutreachReceiptRow {
  org_id: string; effect_id: string; campaign_id: string; recipient_id: string;
  account_id: string; account_ref: string; sender_fingerprint: string; payload_sha256: string;
  state: 'pending' | 'accepted'; check_attempts: number;
}

export const OUTREACH_RECEIPT_SCHEMA_FINGERPRINT = '3c188c06e380e54a720fa7244cc621af901fb8f0257117c5e9945f919c80bc40';
const verifiedSchemas = new WeakSet<D1Database>();

async function inspectOutreachReceiptSchema(db: D1Database): Promise<{fingerprint:string;ledger:boolean}> {
  const rows = (await db.prepare(`SELECT type,name,tbl_name,sql,
    EXISTS(SELECT 1 FROM d1_migrations WHERE name='0082_lead_radar_outreach_receipts.sql') AS ledger
    FROM sqlite_schema WHERE tbl_name='lead_radar_outreach_receipts' AND sql IS NOT NULL ORDER BY type,name`)
    .all<{type:string;name:string;tbl_name:string;sql:string;ledger:number}>()).results ?? [];
  const text = rows.map((row) => [row.type,row.name,row.tbl_name,normalizeSchemaSql(row.sql)].join('\u001f')).join('\u001e');
  const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map((v)=>v.toString(16).padStart(2,'0')).join('');
  return {fingerprint,ledger:rows.length>0 && rows.every((row)=>Number(row.ledger)===1)};
}

export async function outreachReceiptSchemaFingerprint(db:D1Database):Promise<string> {
  return (await inspectOutreachReceiptSchema(db)).fingerprint;
}

/** Required before any remote campaign claim; no automatic schema repair. */
export async function hasOutreachReceiptSchema(db: D1Database): Promise<boolean> {
  if (verifiedSchemas.has(db)) return true;
  try {
    const {fingerprint,ledger}=await inspectOutreachReceiptSchema(db);
    const ready=ledger && fingerprint===OUTREACH_RECEIPT_SCHEMA_FINGERPRINT;
    if(ready)verifiedSchemas.add(db);
    return ready;
  } catch { return false; }
}

export function outreachReceiptKey(row: OutreachReceiptRow): TgSenderEffectKey {
  return {schema:TG_SENDER_SCHEMA,binding:{org_id:row.org_id,account_id:row.account_id,
    account_ref:row.account_ref,sender_fingerprint:row.sender_fingerprint},effect_id:row.effect_id,payload_sha256:row.payload_sha256};
}

export class OutreachReceiptStore {
  constructor(private readonly db: D1Database) {}

  async reserve(key: TgSenderEffectKey, now: string): Promise<boolean> {
    await this.db.prepare(`INSERT OR IGNORE INTO lead_radar_outreach_receipts
      (org_id,effect_id,campaign_id,recipient_id,account_id,account_ref,sender_fingerprint,payload_sha256,
       created_at,updated_at,next_check_at)
      SELECT e.org_id,e.id,c.id,r.id,a.id,?,?,?, ?,?,?
      FROM lead_radar_tg_campaign_effects e
      JOIN lead_radar_tg_campaign_recipients r ON r.org_id=e.org_id AND r.id=e.recipient_id AND r.campaign_id=e.campaign_id
      JOIN lead_radar_tg_campaigns c ON c.org_id=e.org_id AND c.id=e.campaign_id
      JOIN lead_radar_tg_user_accounts a ON a.org_id=c.org_id AND a.id=c.account_id
      WHERE e.org_id=? AND e.id=? AND e.status='dispatching' AND r.status='dispatching'
        AND r.claim_digest IS NOT NULL AND r.lease_expires_at>?
        AND a.id=? AND a.gateway_account_ref=? AND a.status='connected'
        AND a.dispatch_lease_campaign_id=c.id AND a.dispatch_lease_digest=r.claim_digest
        AND a.dispatch_lease_expires_at>?`)
      .bind(key.binding.account_ref,key.binding.sender_fingerprint,key.payload_sha256,now,now,now,
        key.binding.org_id,key.effect_id,now,key.binding.account_id,key.binding.account_ref,now).run();
    // A receipt key is immutable. The live lease must still belong to this send.
    return Boolean(await this.db.prepare(`SELECT 1 FROM lead_radar_outreach_receipts x
      JOIN lead_radar_tg_campaign_effects e ON e.org_id=x.org_id AND e.id=x.effect_id AND e.recipient_id=x.recipient_id
      JOIN lead_radar_tg_campaign_recipients r ON r.org_id=e.org_id AND r.id=e.recipient_id
      JOIN lead_radar_tg_user_accounts a ON a.org_id=x.org_id AND a.id=x.account_id
      WHERE x.org_id=? AND x.effect_id=? AND x.account_id=? AND x.account_ref=? AND x.sender_fingerprint=?
        AND x.payload_sha256=? AND x.state='pending' AND e.status='dispatching' AND r.status='dispatching'
        AND r.lease_expires_at>? AND a.dispatch_lease_digest=r.claim_digest
        AND a.dispatch_lease_campaign_id=x.campaign_id AND a.dispatch_lease_expires_at>?
        AND a.gateway_account_ref=x.account_ref AND a.status='connected'`)
      .bind(key.binding.org_id,key.effect_id,key.binding.account_id,key.binding.account_ref,key.binding.sender_fingerprint,key.payload_sha256,now,now).first());
  }

  async due(orgId: string, now: string, limit: number): Promise<OutreachReceiptRow[]> {
    return (await this.db.prepare(`SELECT x.* FROM lead_radar_outreach_receipts x
      JOIN lead_radar_tg_campaign_effects e ON e.org_id=x.org_id AND e.id=x.effect_id AND e.recipient_id=x.recipient_id
      JOIN lead_radar_tg_campaign_recipients r ON r.org_id=x.org_id AND r.id=x.recipient_id AND r.campaign_id=x.campaign_id
      JOIN lead_radar_tg_user_accounts a ON a.org_id=x.org_id AND a.id=x.account_id
      WHERE x.org_id=? AND x.state='pending' AND x.next_check_at<=?
        AND ((e.status='ambiguous' AND r.status='ambiguous') OR (e.status='sent' AND r.status='sent'))
        AND (r.lease_expires_at IS NULL OR r.lease_expires_at<=?)
        AND a.gateway_account_ref=x.account_ref
        AND (a.dispatch_lease_expires_at IS NULL OR a.dispatch_lease_expires_at<=?)
      ORDER BY x.next_check_at,x.effect_id LIMIT ?`)
      .bind(orgId,now,now,now,Math.max(1,Math.min(2,Math.trunc(limit)))).all<OutreachReceiptRow>()).results ?? [];
  }

  async defer(row: OutreachReceiptRow, now: string): Promise<void> {
    const next = new Date(Date.parse(now)+Math.min(3600,60*2**Math.min(row.check_attempts,6))*1000).toISOString();
    await this.db.prepare(`UPDATE lead_radar_outreach_receipts SET check_attempts=check_attempts+1,
      last_checked_at=?,next_check_at=?,updated_at=? WHERE org_id=? AND effect_id=? AND state='pending'
      AND payload_sha256=?`).bind(now,next,now,row.org_id,row.effect_id,row.payload_sha256).run();
  }

  async accept(key: TgSenderEffectKey, providerDigest: string, now: string, settlementKey: string): Promise<boolean> {
    if (!/^[a-f0-9]{32}$/u.test(settlementKey)) return false;
    const b: TgSenderBinding=key.binding;
    const rows = await this.db.batch([
      // This guarded write acquires custody of settlement inside the same batch.
      this.db.prepare(`UPDATE lead_radar_outreach_receipts AS x SET state='accepted',provider_message_digest=?,
        settled_at=?,last_checked_at=?,updated_at=?,settlement_key=? WHERE org_id=? AND effect_id=? AND state='pending'
        AND account_id=? AND account_ref=? AND sender_fingerprint=? AND payload_sha256=?
        AND EXISTS (SELECT 1 FROM lead_radar_tg_campaign_effects e
          JOIN lead_radar_tg_campaign_recipients r ON r.org_id=e.org_id AND r.id=e.recipient_id AND r.campaign_id=e.campaign_id
          JOIN lead_radar_tg_user_accounts a ON a.org_id=x.org_id AND a.id=x.account_id
          WHERE e.org_id=x.org_id AND e.id=x.effect_id AND e.recipient_id=x.recipient_id AND e.campaign_id=x.campaign_id
            AND ((e.status='ambiguous' AND r.status='ambiguous')
              OR (e.status='sent' AND r.status='sent' AND e.provider_message_digest=? AND r.provider_message_digest=?))
            AND (e.provider_message_digest IS NULL OR e.provider_message_digest=?)
            AND (r.provider_message_digest IS NULL OR r.provider_message_digest=?)
            AND (r.lease_expires_at IS NULL OR r.lease_expires_at<=?)
            AND a.gateway_account_ref=x.account_ref
        AND (a.dispatch_lease_expires_at IS NULL OR a.dispatch_lease_expires_at<=?))`)
        .bind(providerDigest,now,now,now,settlementKey,b.org_id,key.effect_id,b.account_id,b.account_ref,b.sender_fingerprint,key.payload_sha256,
          providerDigest,providerDigest,providerDigest,providerDigest,now,now),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_recipients AS r SET status='sent',claim_digest=NULL,lease_expires_at=NULL,
        provider_message_digest=?,sent_at=COALESCE(sent_at,?),completed_at=COALESCE(completed_at,?),updated_at=?,last_error_code=NULL
        WHERE r.org_id=? AND r.status IN ('ambiguous','sent') AND EXISTS (SELECT 1 FROM lead_radar_outreach_receipts x
          WHERE x.org_id=r.org_id AND x.recipient_id=r.id AND x.campaign_id=r.campaign_id AND x.effect_id=?
            AND x.state='accepted' AND x.provider_message_digest=? AND x.settled_at=? AND x.settlement_key=?)`)
        .bind(providerDigest,now,now,now,b.org_id,key.effect_id,providerDigest,now,settlementKey),
      this.db.prepare(`UPDATE lead_radar_tg_campaign_effects AS e SET status='sent',provider_message_digest=?,
        completed_at=COALESCE(completed_at,?),updated_at=? WHERE e.org_id=? AND e.id=? AND e.status IN ('ambiguous','sent')
        AND EXISTS (SELECT 1 FROM lead_radar_outreach_receipts x WHERE x.org_id=e.org_id AND x.effect_id=e.id
          AND x.state='accepted' AND x.provider_message_digest=? AND x.settled_at=? AND x.settlement_key=?)`)
        .bind(providerDigest,now,now,b.org_id,key.effect_id,providerDigest,now,settlementKey),
      this.db.prepare(`UPDATE lead_radar_tg_contact_history AS h SET state='sent',reservation_quota_day=NULL,
        reservation_next_dispatch_at=NULL,updated_at=? WHERE h.org_id=? AND h.effect_id=? AND h.state IN ('reserved','ambiguous')
        AND EXISTS (SELECT 1 FROM lead_radar_outreach_receipts x WHERE x.org_id=h.org_id AND x.effect_id=h.effect_id
          AND x.state='accepted' AND x.provider_message_digest=? AND x.settled_at=? AND x.settlement_key=?)`)
        .bind(now,b.org_id,key.effect_id,providerDigest,now,settlementKey),
      this.db.prepare(`UPDATE lead_radar_tg_campaigns AS c SET sent_count=(SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients r
          WHERE r.org_id=c.org_id AND r.campaign_id=c.id AND r.status='sent'),
        ambiguous_count=(SELECT COUNT(*) FROM lead_radar_tg_campaign_recipients r WHERE r.org_id=c.org_id AND r.campaign_id=c.id AND r.status='ambiguous'),
        updated_at=?,state_version=state_version+1 WHERE c.org_id=? AND EXISTS(SELECT 1 FROM lead_radar_outreach_receipts x
          WHERE x.org_id=c.org_id AND x.campaign_id=c.id AND x.effect_id=? AND x.state='accepted'
            AND x.provider_message_digest=? AND x.settled_at=? AND x.settlement_key=?)`)
        .bind(now,b.org_id,key.effect_id,providerDigest,now,settlementKey),
    ]);
    return Number(rows[0]?.meta?.changes ?? 0)===1;
  }
}
