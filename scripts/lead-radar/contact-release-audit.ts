/** Read-only production audit. Credentials are process environment only. */
import { auditLeadRadarD1Schema } from '../../functions/platform/lead-radar/schema-contract';
import { hasRuntimeTelegramCampaignSchema } from '../../functions/platform/lead-radar/telegram-campaign-schema';
import { contactDiscoverySchemaReady } from '../../functions/platform/lead-radar/contact-discovery-store';
import { audienceSchemaReady,AudienceStore } from '../../functions/platform/lead-radar/audiences';
import { resolveLeadRadarCapabilities } from '../../functions/platform/lead-radar/capabilities';
import { contactSourceSchemaReady } from '../../functions/platform/lead-radar/contact-source-store';

async function main() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const args=process.argv.slice(2);
  const audiencesRequired=args.includes('--audiences'), sourcesRequired=args.includes('--contact-sources');
  if (!account || !/^[a-f0-9]{32}$/.test(account) || !token || args.some((arg)=>!['--audiences','--contact-sources'].includes(arg))) throw new Error('audit_credentials_or_arguments');
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/97ef0372-d937-406f-8871-755368d9afff/query`;
  const db = {
    prepare(sql: string) {
      // No raw/global integrity PRAGMA, DDL, mutation or arbitrary SQL input.
      if (!/^\s*(SELECT\b|WITH contacts AS\s*\()/i.test(sql)) throw new Error('audit_read_only_select_required');
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
  const audiences = await audienceSchemaReady(db);
  const contactSources=await contactSourceSchemaReady(db);
  const sourceCounts=sourcesRequired && contactSources ? (await db.prepare('SELECT status,reason,COUNT(*) AS count FROM lead_radar_contact_enrichments GROUP BY status,reason').all()).results : [];
  const directoryCounts:unknown[]=[];
  if (audiencesRequired && audiences) {
    const orgs=await db.prepare('SELECT DISTINCT org_id FROM lead_radar_searches LIMIT 100').all<{org_id:string}>();
    for (const row of orgs.results ?? []) {
      const page=await new AudienceStore(db).directory(row.org_id,{},resolveLeadRadarCapabilities({},row.org_id));
      directoryCounts.push({total:page.total,firstPage:page.rows.length,statusCounts:page.rows.reduce((counts,item)=>({...counts,[item.status]:(counts[item.status]??0)+1}),{} as Record<string,number>)});
    }
  }
  const counts = (await db.prepare(`SELECT 'campaigns' AS kind,status,COUNT(*) AS count FROM lead_radar_tg_campaigns GROUP BY status
    UNION ALL SELECT 'effects',status,COUNT(*) FROM lead_radar_tg_campaign_effects GROUP BY status
    UNION ALL SELECT 'jobs',status,COUNT(*) FROM lead_radar_jobs WHERE status IN ('queued','running','retry_wait') GROUP BY status`).all()).results;
  console.log(JSON.stringify({baseSchema:base.status,campaignSchema:campaigns,contactSchema:contacts,audienceSchema:audiences,contactSourceSchema:contactSources,sourceCounts,directoryCounts,activity:counts,readOnly:true}));
  if (base.status!=='pass' || !campaigns || !contacts || (audiencesRequired && !audiences) || (sourcesRequired && !contactSources)) process.exitCode=1;
}
main().catch(() => {console.error('contact_release_audit_failed');process.exitCode=1;});
