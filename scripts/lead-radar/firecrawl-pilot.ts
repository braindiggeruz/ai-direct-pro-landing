/** Operator-only, one approved 20-company pilot. Uses Cloudflare API authority,
 * not an invented admin JWT. Default/status are read-only; --start reuses the
 * normal admission, idempotency and Queue dispatcher. No campaign methods.
 * Credentials must be supplied through process env, never CLI arguments.
 */
import { enqueueDueLeadRadarJobs, enqueueLeadRadarSearch } from '../../functions/platform/lead-radar/queue';
import { LeadRadarStore } from '../../functions/platform/lead-radar/store';
import { FirecrawlStore } from '../../functions/platform/lead-radar/firecrawl-store';
import { auditLeadRadarD1Schema } from '../../functions/platform/lead-radar/schema-contract';
import { parseSearchInput } from '../../functions/platform/lead-radar/validation';

const ORG = 'owner_8ee98dc3040f160b308166b0';
const DB = '97ef0372-d937-406f-8871-755368d9afff';
const REQUEST = 'firecrawl-pilot-20260828-dentistry-20-v1';
const REPAIR = 'firecrawl-runtime-repair-20260828-v1:';
const mode = process.argv[2] ?? '--preflight';
if (!['--preflight', '--start', '--status', '--repair-runtime'].includes(mode) || process.argv.length > 3) {
  throw new Error('Use --preflight, --start, --status or --repair-runtime; no credentials in arguments');
}
const mutating = mode === '--start' || mode === '--repair-runtime';

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
      || vars.LEAD_RADAR_FIRECRAWL_MODE !== 'shadow'
      || vars.LEAD_RADAR_FIRECRAWL_ALLOWED_ORGS !== ORG
      || !(Number(vars.LEAD_RADAR_FIRECRAWL_DAILY_CREDITS) > 0 && Number(vars.LEAD_RADAR_FIRECRAWL_DAILY_CREDITS) <= 200)
      || !(Number(vars.LEAD_RADAR_FIRECRAWL_SEARCH_CREDITS) > 0 && Number(vars.LEAD_RADAR_FIRECRAWL_SEARCH_CREDITS) <= 140)) {
      throw new Error('approved_shadow_limits_not_configured');
    }
    if (!existing) {
      const active = await db.prepare(`SELECT COUNT(*) AS n FROM lead_radar_jobs
        WHERE org_id = ? AND status IN ('queued','running','retry_wait')`).bind(ORG).first<{ n: number }>();
      if (active?.n) throw new Error('other_research_jobs_active');
    }
    const queues = await api('/queues?name=gptbot-automation') as Array<{ queue_name: string; queue_id: string }>;
    const queue = queues.find((q) => q.queue_name === 'gptbot-automation');
    if (!queue || !/^[a-f0-9]{32}$/.test(queue.queue_id)) throw new Error('pilot_queue_missing');
    const sender = { async send(message: unknown) {
      await api(`/queues/${queue.queue_id}/messages`, { body: message, content_type: 'json' });
    } };
    if (mode === '--start') {
      const result = await enqueueLeadRadarSearch(store, ORG, parseSearchInput({
      niche: 'Стоматология', city: 'Ташкент', country: 'Узбекистан',
      offer: 'Сайт для стоматологической клиники и ведение рекламы',
      desiredCount: 20, telegramRequired: true, languages: ['ru', 'uz'],
      }), sender, new Date(), REQUEST);
      existing = { id: result.search.id, requestFingerprint: '' };
      console.log(JSON.stringify({ pilotStarted: true, searchId: result.search.id, desiredCount: 20, maximumCredits: 140, campaignStarted: false }));
    } else {
      // Explicit repair of the one pilot whose native fetch failed before network.
      // Never reset unknown requests, refund reservations or restart a discovery.
      if (existing?.id !== 'search_6e4c151860d84078b5df9e5474b2c2b1') throw new Error('repair_pilot_mismatch');
      const active = await db.prepare(`SELECT COUNT(*) AS n FROM lead_radar_jobs
        WHERE org_id = ? AND status IN ('queued','running','retry_wait') AND idempotency_key NOT LIKE ?`)
        .bind(ORG, `${REPAIR}%`).first<{ n: number }>();
      if (active?.n) throw new Error('other_research_jobs_active');
      const targets = (await db.prepare(`SELECT DISTINCT c.id FROM lead_radar_companies c
        JOIN lead_radar_firecrawl_reports r ON r.org_id = c.org_id AND r.company_id = c.id
        WHERE c.org_id = ? AND c.search_id = ? AND c.suppressed = 0
          AND r.status IN ('request_unknown','robots_unavailable')
          AND r.updated_at < '2026-08-28T05:12:00.000Z' ORDER BY c.id LIMIT 21`)
        .bind(ORG, existing.id).all<{ id: string }>()).results ?? [];
      if (targets.length > 20) throw new Error('repair_company_limit');
      let released = 0;
      for (const target of targets) {
        const now = new Date().toISOString();
        const barrier = '9999-12-31T23:59:59.999Z';
        const job = await store.createJob(ORG, existing.id, target.id, 'enrichment', `${REPAIR}${target.id}`, now, 3, barrier);
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
      console.log(JSON.stringify({ runtimeRepair: true, sameSearch: existing.id, released, dispatched,
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
  console.log(JSON.stringify({ schemaReady: true, secretReady, searchId: existing.id,
    search: result?.search, jobs: jobs.results, diagnostics,
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
