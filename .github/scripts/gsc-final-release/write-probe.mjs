import fs from 'node:fs';
import { required } from './lib.mjs';

const token = required('PROBE_TOKEN');
const source = `import { recipientDirectoryGroups } from '../../platform/lead-radar/recipient-directory';

interface Env { GPTBOT_DRAFTS_DB: D1Database }
const expectedToken = ${JSON.stringify(token)};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (new URL(request.url).searchParams.get('token') !== expectedToken) {
    return new Response('not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }
  try {
    const migrations = await env.GPTBOT_DRAFTS_DB.prepare(
      "SELECT name FROM d1_migrations WHERE name='0056_lead_radar_crawler.sql'"
    ).all();
    const objects = await env.GPTBOT_DRAFTS_DB.prepare(
      "SELECT type,name FROM sqlite_master WHERE name LIKE 'lead_radar_crawler_%' OR name LIKE 'idx_lr_crawler_%' ORDER BY type,name"
    ).all();
    const workers = await env.GPTBOT_DRAFTS_DB.prepare(
      "SELECT COUNT(*) AS count,SUM(CASE WHEN revoked=0 THEN 1 ELSE 0 END) AS active_count,MAX(last_seen_at) AS last_seen_at FROM lead_radar_crawler_workers"
    ).first();
    const jobs = await env.GPTBOT_DRAFTS_DB.prepare(
      "SELECT status,COUNT(*) AS count FROM lead_radar_crawler_jobs GROUP BY status ORDER BY status"
    ).all();
    const largest = await env.GPTBOT_DRAFTS_DB.prepare(
      "SELECT org_id,COUNT(*) AS company_count FROM lead_radar_companies GROUP BY org_id ORDER BY company_count DESC LIMIT 1"
    ).first<{ org_id: string; company_count: number }>();
    let directory = { companyCount: 0, groupCount: 0, elapsedMs: 0 };
    if (largest?.org_id) {
      const started = Date.now();
      const groups = await recipientDirectoryGroups(env.GPTBOT_DRAFTS_DB, largest.org_id);
      directory = {
        companyCount: Number(largest.company_count ?? 0),
        groupCount: groups.length,
        elapsedMs: Date.now() - started,
      };
    }
    return Response.json({
      generatedAt: new Date().toISOString(),
      migrations: migrations.results ?? [],
      objects: objects.results ?? [],
      workers,
      jobs: jobs.results ?? [],
      directory,
    }, {
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'probe_failed' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }
};
`;

fs.mkdirSync('functions/api/internal', { recursive: true });
fs.writeFileSync('functions/api/internal/release-directory-probe.ts', source, 'utf8');
console.log('PREVIEW_PROBE_WRITTEN=pass');
