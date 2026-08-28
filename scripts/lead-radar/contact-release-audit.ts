/** Read-only production audit. Credentials are process environment only. */
import { auditLeadRadarD1Schema } from '../../functions/platform/lead-radar/schema-contract';
import { hasRuntimeTelegramCampaignSchema } from '../../functions/platform/lead-radar/telegram-campaign-schema';
import { contactDiscoverySchemaReady } from '../../functions/platform/lead-radar/contact-discovery-store';

async function main() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !/^[a-f0-9]{32}$/.test(account) || !token || process.argv.length !== 2) throw new Error('audit_credentials_or_arguments');
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/97ef0372-d937-406f-8871-755368d9afff/query`;
  const db = {
    prepare(sql: string) {
      // No raw/global integrity PRAGMA, DDL, mutation or arbitrary SQL input.
      if (!/^\s*SELECT\b/i.test(sql)) throw new Error('audit_read_only_select_required');
      let params: unknown[] = [];
      const execute = async () => {
        const response = await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
          body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30_000),redirect:'error'});
        const envelope = await response.json() as {success:boolean;result:D1Result<Record<string,unknown>>[]};
        if (!response.ok || !envelope.success || envelope.result.length !== 1 || !envelope.result[0].success) throw new Error('audit_d1_response');
        return envelope.result[0];
      };
      const statement = {bind(...values:unknown[]) {params=values;return statement;},all:execute,
        async first(column?:string) {const row=(await execute()).results?.[0]??null;return column ? row?.[column]??null : row;} };
      return statement;
    },
  } as unknown as D1Database;
  const base = await auditLeadRadarD1Schema(db);
  const campaigns = await hasRuntimeTelegramCampaignSchema(db);
  const contacts = await contactDiscoverySchemaReady(db);
  const counts = (await db.prepare(`SELECT 'campaigns' AS kind,status,COUNT(*) AS count FROM lead_radar_tg_campaigns GROUP BY status
    UNION ALL SELECT 'effects',status,COUNT(*) FROM lead_radar_tg_campaign_effects GROUP BY status
    UNION ALL SELECT 'jobs',status,COUNT(*) FROM lead_radar_jobs WHERE status IN ('queued','running','retry_wait') GROUP BY status`).all()).results;
  console.log(JSON.stringify({baseSchema:base.status,campaignSchema:campaigns,contactSchema:contacts,activity:counts,readOnly:true}));
  if (base.status!=='pass' || !campaigns || !contacts) process.exitCode=1;
}
main().catch(() => {console.error('contact_release_audit_failed');process.exitCode=1;});
