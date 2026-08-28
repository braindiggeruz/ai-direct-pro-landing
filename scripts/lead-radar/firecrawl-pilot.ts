/** Operator-only, one approved 20-company pilot. Uses Cloudflare API authority,
 * not an invented admin JWT. Default/status are read-only; --start reuses the
 * normal admission, idempotency and Queue dispatcher. No campaign methods.
 * Credentials must be supplied through process env, never CLI arguments.
 */
import { enqueueDueLeadRadarJobs, enqueueLeadRadarSearch } from '../../functions/platform/lead-radar/queue';
import { LeadRadarStore } from '../../functions/platform/lead-radar/store';
import { FirecrawlStore } from '../../functions/platform/lead-radar/firecrawl-store';
import { FirecrawlClient, firecrawlConfig } from '../../functions/platform/lead-radar/firecrawl-client';
import { auditLeadRadarD1Schema } from '../../functions/platform/lead-radar/schema-contract';
import { parseSearchInput } from '../../functions/platform/lead-radar/validation';
import { readPublicWebsiteRobots, robotsAllows } from '../../functions/platform/lead-radar/sources';

const ORG = 'owner_8ee98dc3040f160b308166b0';
const DB = '97ef0372-d937-406f-8871-755368d9afff';
const REPAIR = 'firecrawl-runtime-repair-20260828-v1:';
const mode = process.argv[2] ?? '--preflight';
const contactPilot = mode.startsWith('--contact-');
const REQUEST = contactPilot ? 'firecrawl-contact-pilot-20260828-dentistry-20-v2' : 'firecrawl-pilot-20260828-dentistry-20-v1';
if (!['--preflight', '--start', '--status', '--repair-runtime', '--diagnose-page', '--repair-html',
  '--contact-preflight', '--contact-start', '--contact-status', '--contact-dispatch', '--contact-recheck'].includes(mode) || process.argv.length > 3) {
  throw new Error('Use a documented pilot mode; no credentials in arguments');
}
const mutating = ['--start', '--repair-runtime', '--diagnose-page', '--repair-html', '--contact-start', '--contact-dispatch', '--contact-recheck'].includes(mode);

async function main() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !/^[a-f0-9]{32}$/.test(account) || !token) throw new Error('cloudflare_credentials_missing');
  const root = `https://api.cloudflare.com/client/v4/accounts/${account}`;
  async function api(path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(root + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000), redirect: 'error',
    });
    const envelope = await response.json() as { success?: boolean; result?: unknown; errors?: Array<{ code: number }> };
    if (!response.ok || !envelope.success) throw new Error(`cloudflare_http_${response.status}_${envelope.errors?.[0]?.code ?? 'unknown'}`);
    return envelope.result;
  }
  // Preserve native parameter binding. Batch is deliberately unsupported: this
  // admission path uses atomic statements; never silently emulate transactions.
  const db = {
    prepare(sql: string) {
      let params: unknown[] = [];
      const execute = async () => {
        if (!mutating && !/^\s*(SELECT|PRAGMA)\b/i.test(sql)) throw new Error('read_only_pilot_command');
        const results = await api(`/d1/database/${DB}/query`, { sql, params }) as D1Result<Record<string, unknown>>[];
        if (results.length !== 1 || !results[0].success) throw new Error('invalid_d1_result');
        return results[0];
      };
      const statement = {
        bind(...values: unknown[]) { params = values; return statement; },
        all: execute, run: execute,
        async first(column?: string) {
          const row = (await execute()).results?.[0] ?? null;
          return column ? row?.[column] ?? null : row;
        },
      };
      return statement;
    },
    async batch() { throw new Error('pilot_d1_batch_not_supported'); },
  } as unknown as D1Database;
  const store = new LeadRadarStore(db);
  const provider = new FirecrawlStore(db);
  const settings = await api('/workers/scripts/gptbot-automation/settings') as {
    bindings: Array<{ name: string; type: string; text?: string; id?: string }>;
  };
  const vars = Object.fromEntries(settings.bindings.filter((b) => b.type === 'plain_text').map((b) => [b.name, b.text]));
  const secretReady = settings.bindings.some((b) => b.name === 'FIRECRAWL_API_KEY' && b.type === 'secret_text');
  if (!settings.bindings.some((b) => b.type === 'd1' && b.name === 'GPTBOT_DRAFTS_DB' && b.id === DB)) throw new Error('worker_database_mismatch');
  const schema = await auditLeadRadarD1Schema(db);
  if (schema.status !== 'pass' || !await provider.available()) throw new Error('pilot_schema_not_ready');
  let existing = await store.findSearchByRequest(ORG, REQUEST);
  if (mutating) {
    if (!secretReady || vars.LEAD_RADAR_FIRECRAWL_ENABLED !== 'true'
      || vars.LEAD_RADAR_FIRECRAWL_MODE !== (contactPilot ? 'fallback' : 'shadow')
      || vars.LEAD_RADAR_FIRECRAWL_ALLOWED_ORGS !== ORG
      || !(Number(vars.LEAD_RADAR_FIRECRAWL_DAILY_CREDITS) > 0 && Number(vars.LEAD_RADAR_FIRECRAWL_DAILY_CREDITS) <= 200)
      || !(Number(vars.LEAD_RADAR_FIRECRAWL_SEARCH_CREDITS) > 0 && Number(vars.LEAD_RADAR_FIRECRAWL_SEARCH_CREDITS) <= (contactPilot ? 100 : 140))) {
      throw new Error('approved_pilot_limits_not_configured');
    }
    if (!existing || contactPilot) {
      const active = await db.prepare(`SELECT COUNT(*) AS n FROM lead_radar_jobs
        WHERE org_id = ? AND status IN ('queued','running','retry_wait') AND search_id != ?`)
        .bind(ORG, existing?.id ?? '').first<{ n: number }>();
      if (active?.n) throw new Error('other_research_jobs_active');
    }
    const queues = await api('/queues?name=gptbot-automation') as Array<{ queue_name: string; queue_id: string }>;
    const queue = queues.find((q) => q.queue_name === 'gptbot-automation');
    if (!queue || !/^[a-f0-9]{32}$/.test(queue.queue_id)) throw new Error('pilot_queue_missing');
    const sender = { async send(message: unknown) {
      await api(`/queues/${queue.queue_id}/messages`, { body: message, content_type: 'json' });
    } };
    if (mode === '--start' || mode === '--contact-start') {
      const result = await enqueueLeadRadarSearch(store, ORG, parseSearchInput({
      niche: 'Стоматология', city: 'Ташкент', country: 'Узбекистан',
      offer: 'Сайт для стоматологической клиники и ведение рекламы',
      desiredCount: 20, telegramRequired: true, languages: ['ru', 'uz'],
      ...(contactPilot ? { searchGoal: 'telegram_contacts', maxCandidates: 20 } : {}),
      }), sender, new Date(), REQUEST);
      existing = { id: result.search.id, requestFingerprint: '' };
      console.log(JSON.stringify({ pilotStarted: true, searchId: result.search.id, desiredCount: 20,
        maximumCompanies: contactPilot ? 20 : undefined, maximumCredits: contactPilot ? 100 : 140, campaignStarted: false }));
    } else if (mode === '--contact-recheck') {
      // Four SAME companies inside the approved20. Never alter/retry unknown
      // provider rows; all new requests still consume the original100/search
      // and7/company reservations, even when the earlier result was empty.
      if (existing?.id!=='search_2c026efabc274f7bb1853357ac26910a') throw new Error('contact_pilot_mismatch');
      const targets=['lead_15c9fcd3c19743d2876e8f5e2c6d8e25','lead_a0fee31240f644b794d09b6f7b45f7cb',
        'lead_cebeca5eea014008b9c00e0a8bf72e52','lead_cc64d1cf031547dd8370a85576c3bc94'];
      let released=0;
      for (const companyId of targets) {
        const row=await db.prepare(`SELECT c.id FROM lead_radar_companies c JOIN lead_radar_contact_enrichments e
          ON c.org_id=e.org_id AND c.id=e.company_id WHERE c.org_id=? AND c.search_id=? AND c.id=? AND c.suppressed=0
          AND c.lifecycle<>'do_not_contact' AND e.sources_json='[]' AND e.reason IN ('no_matching_public_contact','result_expired')`)
          .bind(ORG,existing.id,companyId).first();
        if (!row) continue;
        const now=new Date().toISOString(), barrier='9999-12-31T23:59:59.999Z';
        const job=await store.createJob(ORG,existing.id,companyId,'enrichment',`contact-resolve:pilot-quality-v3:${companyId}`,now,3,barrier);
        if (job.status!=='queued' || job.attemptCount!==0 || job.nextDispatchAt!==barrier) continue;
        await db.prepare(`UPDATE lead_radar_contact_enrichments SET expires_at=? WHERE org_id=? AND company_id=?
          AND sources_json='[]' AND reason IN ('no_matching_public_contact','result_expired')`).bind(now,ORG,companyId).run();
        await db.prepare(`UPDATE lead_radar_searches SET status='running',phase='enriching',completed_at=NULL,state_version=state_version+1
          WHERE org_id=? AND id=?`).bind(ORG,existing.id).run();
        await db.prepare(`UPDATE lead_radar_jobs SET next_dispatch_at=?,updated_at=? WHERE org_id=? AND id=? AND status='queued'
          AND attempt_count=0 AND next_dispatch_at=?`).bind(now,now,ORG,job.id,barrier).run();
        released++;
      }
      const dispatched=await enqueueDueLeadRadarJobs(db,sender,new Date(),5,(orgId)=>orgId===ORG);
      console.log(JSON.stringify({searchId:existing.id,released,dispatched,maximumCreditsIncludingEarlierPilotRequests:100,campaignStarted:false}));
    } else if (mode === '--contact-dispatch') {
      if (!existing) throw new Error('contact_pilot_not_started');
      const dispatched = await enqueueDueLeadRadarJobs(db, sender, new Date(), 5, (orgId) => orgId === ORG);
      console.log(JSON.stringify({ searchId: existing.id, dispatched, campaignStarted: false }));
    } else if (mode === '--diagnose-page') {
      // One credit, one existing pilot company, no raw HTML or contacts printed.
      // The ordinary ledger/limits still apply; replay returns the compact result.
      if (existing?.id !== 'search_6e4c151860d84078b5df9e5474b2c2b1') throw new Error('repair_pilot_mismatch');
      const target = await db.prepare(`SELECT id FROM lead_radar_companies WHERE org_id = ? AND search_id = ?
        AND id = 'lead_656c87ff83374cf3928312534953d42b' AND suppressed = 0`)
        .bind(ORG, existing.id).first<{ id: string }>();
      const config = firecrawlConfig({ ...vars, FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY }, ORG);
      if (!target || !config) throw new Error('page_probe_not_ready');
      const policy = await readPublicWebsiteRobots(new URL('https://vipclinic.uz/'));
      if (policy && !robotsAllows(policy, new URL('https://vipclinic.uz/'), 'firecrawl firecrawlbot firecrawlagent')) throw new Error('probe_robots_blocked');
      const now = new Date().toISOString();
      const job = await store.createJob(ORG, existing.id, target.id, 'enrichment', 'firecrawl-response-probe-20260828-v1', now, 1, '9999-12-31T23:59:59.999Z');
      if (job.status === 'completed') {
        console.log(JSON.stringify({ responseProbe: [...(await provider.completedResults({ orgId: ORG, searchId: existing.id,
          companyId: target.id, jobId: job.id, leaseOwner: '', leaseGeneration: 0 }, now)).values()][0], replayed: true }));
        return;
      }
      const claimed = await store.claimJob(ORG, job.id, now, new Date(Date.now() + 120_000).toISOString());
      if (!claimed?.leaseOwner) throw new Error('probe_lease_unavailable');
      try {
        const client = new FirecrawlClient(config, provider, { orgId: ORG, searchId: existing.id, companyId: target.id,
          jobId: job.id, leaseOwner: claimed.leaseOwner, leaseGeneration: claimed.leaseGeneration });
        const responseProbe = await client.request('scrape', 'vipclinic.uz', {
          url: 'https://vipclinic.uz/', formats: ['html', 'rawHtml', 'links'], onlyMainContent: false,
          onlyCleanContent: false, skipTlsVerification: false, maxAge: 0, storeInCache: false, parsers: [], timeout: 30_000,
        }, (response) => {
          const data = response.data as Record<string, unknown>;
          const bytes = (value: unknown) => typeof value === 'string' ? new TextEncoder().encode(value).byteLength : 0;
          return { htmlBytes: bytes(data.html), rawHtmlBytes: bytes(data.rawHtml),
            identical: data.html === data.rawHtml, statusCode: (data.metadata as { statusCode?: unknown })?.statusCode ?? null };
        });
        console.log(JSON.stringify({ responseProbe, campaignStarted: false }));
      } finally {
        await store.completeJob(ORG, job.id, claimed.leaseOwner, new Date().toISOString(), claimed.leaseGeneration);
      }
      return;
    } else {
      // Explicit repair of the one pilot whose native fetch failed before network.
      // Never reset unknown requests, refund reservations or restart a discovery.
      if (existing?.id !== 'search_6e4c151860d84078b5df9e5474b2c2b1') throw new Error('repair_pilot_mismatch');
      const htmlRepair = mode === '--repair-html';
      const repairKey = htmlRepair ? 'firecrawl-html-repair-20260828-v1:' : REPAIR;
      const active = await db.prepare(`SELECT COUNT(*) AS n FROM lead_radar_jobs
        WHERE org_id = ? AND status IN ('queued','running','retry_wait') AND idempotency_key NOT LIKE ?`)
        .bind(ORG, `${repairKey}%`).first<{ n: number }>();
      if (active?.n) throw new Error('other_research_jobs_active');
      const targets = (await db.prepare(`SELECT DISTINCT c.id FROM lead_radar_companies c
        JOIN lead_radar_firecrawl_reports r ON r.org_id = c.org_id AND r.company_id = c.id
        WHERE c.org_id = ? AND c.search_id = ? AND c.suppressed = 0
          AND ((? = 0 AND r.status IN ('request_unknown','robots_unavailable') AND r.updated_at < '2026-08-28T05:12:00.000Z')
            OR (? = 1 AND r.status = 'invalid_page' AND c.id = 'lead_656c87ff83374cf3928312534953d42b'))
          ORDER BY c.id LIMIT 21`)
        .bind(ORG, existing.id, Number(htmlRepair), Number(htmlRepair)).all<{ id: string }>()).results ?? [];
      if (targets.length > 20) throw new Error('repair_company_limit');
      let released = 0;
      for (const target of targets) {
        const now = new Date().toISOString();
        const barrier = '9999-12-31T23:59:59.999Z';
        const job = await store.createJob(ORG, existing.id, target.id, 'enrichment', `${repairKey}${target.id}`, now, 3, barrier);
        // Re-running the operator command cannot regress an active/completed job.
        if (job.status !== 'queued' || job.attemptCount !== 0 || job.nextDispatchAt !== barrier) continue;
        await db.prepare(`UPDATE lead_radar_companies SET enrichment_status = 'queued', enrichment_reason = NULL,
          updated_at = ? WHERE org_id = ? AND search_id = ? AND id = ? AND suppressed = 0`)
          .bind(now, ORG, existing.id, target.id).run();
        await db.prepare(`UPDATE lead_radar_searches SET status = 'running', phase = 'enriching', completed_at = NULL,
          state_version = state_version + 1 WHERE org_id = ? AND id = ?`).bind(ORG, existing.id).run();
        await db.prepare(`UPDATE lead_radar_jobs SET next_dispatch_at = ?, updated_at = ?
          WHERE org_id = ? AND id = ? AND status = 'queued' AND attempt_count = 0 AND next_dispatch_at = ?`)
          .bind(now, now, ORG, job.id, barrier).run();
        released++;
      }
      await store.refreshSearchFunnel(ORG, existing.id, new Date().toISOString());
      const dispatched = await enqueueDueLeadRadarJobs(db, sender, new Date(), 5, (orgId) => orgId === ORG);
      console.log(JSON.stringify({ repair: htmlRepair ? 'html_size' : 'runtime', sameSearch: existing.id, released, dispatched,
        originalLedgerPreserved: true, maximumCreditsIncludingOldReservations: 140, campaignStarted: false }));
    }
  }
  if (!existing) {
    console.log(JSON.stringify({ schemaReady: true, secretReady, mode: vars.LEAD_RADAR_FIRECRAWL_MODE, pilotExists: false }));
    return;
  }
  const result = await store.getSearch(ORG, existing.id);
  const diagnostics = await provider.diagnostics(ORG, existing.id);
  const jobs = await db.prepare(`SELECT status, last_error_code, COUNT(*) AS n FROM lead_radar_jobs
    WHERE org_id = ? AND search_id = ? GROUP BY status, last_error_code`).bind(ORG, existing.id).all();
  const contactSources = contactPilot ? (await db.prepare(`SELECT e.status,e.reason,COUNT(*) AS count,
    SUM(json_array_length(e.sources_json)) AS sources FROM lead_radar_contact_enrichments e
    JOIN lead_radar_companies c ON c.org_id=e.org_id AND c.id=e.company_id
    WHERE c.org_id=? AND c.search_id=? GROUP BY e.status,e.reason`).bind(ORG,existing.id).all()).results : undefined;
  console.log(JSON.stringify({ schemaReady: true, secretReady, searchId: existing.id,
    search: result?.search, jobs: jobs.results, diagnostics, contactSources,
    leads: result?.leads.map((lead) => ({ id: lead.id, name: lead.name, website: lead.website,
      telegram: lead.telegramContact?.type === 'business' ? lead.telegramContact.url : null,
      contactType: lead.telegramContact?.type ?? null, evidenceCount: lead.evidence.length })),
  }));
}

main().catch((error: unknown) => {
  const code = error instanceof Error && /^(?:cloudflare_http_\d+_\d+|[a-z][a-z0-9_]{1,80})$/.test(error.message)
    ? error.message : 'pilot_operation_failed';
  console.log(JSON.stringify({ status: 'blocked', code, campaignStarted: false }));
  process.exitCode = 1;
});
