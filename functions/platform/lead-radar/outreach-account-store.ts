/** Explicit one-time cutover. The previous account is retained for history. */
export class OutreachAccountStore {
  constructor(private readonly db: D1Database) {}

  async hasCutover(orgId: string, oldAccountId: string, newAccountId: string, requestDigest: string): Promise<boolean> {
    const row = await this.db.prepare(`SELECT 1 AS found FROM lead_radar_outreach_account_cutovers p
      JOIN lead_radar_tg_user_accounts a ON a.org_id=p.org_id AND a.id=p.old_account_id
      WHERE p.org_id=? AND p.old_account_id=? AND p.new_account_id=? AND p.request_digest=?
      AND a.status='revoked' AND a.revoked_at=p.retired_at AND a.state_version=p.old_state_version+1`)
      .bind(orgId,oldAccountId,newAccountId,requestDigest).first<{found:number}>();
    return row?.found === 1;
  }

  async retireUnusedAccount(orgId: string, accountId: string, version: number, newAccountId: string, requestDigest: string, now: string): Promise<boolean> {
    // A single transaction proves the exact idle account/version and archives it.
    // Failed updates roll back the proof; replays only match the original target/key.
    await this.db.batch([
      this.db.prepare(`INSERT INTO lead_radar_outreach_account_cutovers
      (org_id,old_account_id,new_account_id,request_digest,old_state_version,retired_at)
      SELECT a.org_id,a.id,?,?,a.state_version,? FROM lead_radar_tg_user_accounts a
      WHERE a.org_id=? AND a.id=? AND a.state_version=? AND a.id<>? AND a.status IN ('connected','paused','error')
      AND a.dispatch_lease_campaign_id IS NULL AND a.dispatch_lease_digest IS NULL AND a.dispatch_lease_expires_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM lead_radar_tg_campaigns c WHERE c.org_id=a.org_id AND c.account_id=a.id
        AND c.status NOT IN ('completed','stopped','failed'))
      AND NOT EXISTS (SELECT 1 FROM lead_radar_tg_campaign_recipients r JOIN lead_radar_tg_campaigns c
        ON c.org_id=r.org_id AND c.id=r.campaign_id WHERE c.org_id=a.org_id AND c.account_id=a.id
        AND (r.status IN ('claimed','dispatching','ambiguous') OR r.claim_digest IS NOT NULL))
      AND NOT EXISTS (SELECT 1 FROM lead_radar_tg_campaign_effects e JOIN lead_radar_tg_campaigns c
        ON c.org_id=e.org_id AND c.id=e.campaign_id WHERE c.org_id=a.org_id AND c.account_id=a.id
        AND e.status IN ('reserved','dispatching','ambiguous'))
      AND NOT EXISTS (SELECT 1 FROM lead_radar_outreach_inbox i WHERE i.org_id=a.org_id AND i.account_id=a.id
        AND i.kind='opt_out' AND i.workflow_state='pending')
      ON CONFLICT DO NOTHING`)
      .bind(newAccountId,requestDigest,now,orgId,accountId,version,newAccountId),
      this.db.prepare(`UPDATE lead_radar_tg_user_accounts AS a
        SET status='revoked',state_version=state_version+1,updated_at=?,revoked_at=?,gateway_account_ref=NULL,gateway_account_ref_digest=NULL
        WHERE a.org_id=? AND a.id=? AND a.state_version=? AND a.status IN ('connected','paused','error')
        AND EXISTS (SELECT 1 FROM lead_radar_outreach_account_cutovers p WHERE p.org_id=a.org_id AND p.old_account_id=a.id
          AND p.new_account_id=? AND p.request_digest=? AND p.old_state_version=a.state_version AND p.retired_at=?)`)
        .bind(now,now,orgId,accountId,version,newAccountId,requestDigest,now),
    ]);
    return this.hasCutover(orgId,accountId,newAccountId,requestDigest);
  }
}
