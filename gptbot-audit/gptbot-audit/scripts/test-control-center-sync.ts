// Unit tests for the new sync-await launch path and stale-job watchdog.
//
// Uses a thin in-memory D1 mock so we exercise the real launch.ts /
// bridge-worker.ts / jobs.ts code paths without touching a real database.

import { startSeoAutopilotJob } from '../functions/lib/seo-autopilot/launch';
import { markStaleJobsAsFailed, getJob } from '../functions/lib/seo-autopilot/jobs';

interface T { name: string; passed: boolean; detail?: string }
const results: T[] = [];
const expect = (name: string, cond: boolean, detail?: string): void => {
  results.push({ name, passed: cond, detail });
};

// ─── Tiny in-memory D1 mock ──────────────────────────────────────────────
// Covers exactly the subset of statements used by jobs.ts + launch.ts.

interface Row {
  id: string;
  request_id: string | null;
  status: string;
  n8n_url: string;
  n8n_status: number | null;
  n8n_execution_id: string | null;
  generation_status: string | null;
  validation_status: string | null;
  validation_passed: number | null;
  validation_issue_count: number | null;
  draft_id: string | null;
  bundle_id: string | null;
  admin_url: string | null;
  ingestion_success: number;
  deduplicated: number;
  error_code: string | null;
  error_message: string | null;
  error_detail_json: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  source: string;
  requested_by: string | null;
}

class MockD1 {
  rows: Row[] = [];
  now = '2026-06-21T12:00:00.000Z';
  prepare(sql: string): { bind: (...args: unknown[]) => Statement } {
    const self = this;
    return {
      bind(...args: unknown[]): Statement {
        return new Statement(self, sql, args);
      },
    };
  }
}

class Statement {
  constructor(private db: MockD1, private sql: string, private args: unknown[]) {}
  async run(): Promise<{ meta: { changes: number; rows_written: number } }> {
    const s = this.sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('INSERT INTO seo_autopilot_jobs')) {
      // (id, request_id, status, n8n_url, ingestion_success, deduplicated, created_at, updated_at)
      const [id, request_id, n8n_url, created_at, updated_at] = this.args as [string, string|null, string, string, string];
      this.db.rows.push(makeEmptyRow(id, request_id, n8n_url, created_at, updated_at));
      return { meta: { changes: 1, rows_written: 1 } };
    }

    // Stale watchdog UPDATE (multi-clause, identified by the COALESCE clauses).
    if (s.startsWith('UPDATE seo_autopilot_jobs SET status=\'failed\', error_code = COALESCE')) {
      const ageSeconds = this.args[0] as number;
      const nowMs = Date.parse(this.db.now);
      const cutoff = nowMs - ageSeconds * 1000;
      const targets = this.db.rows.filter((r) =>
        ['pending', 'forwarding', 'normalising', 'ingesting'].includes(r.status) &&
        Date.parse(r.created_at) < cutoff,
      );
      for (const r of targets) {
        r.status = 'failed';
        r.error_code = r.error_code ?? 'bridge_lost';
        r.error_message = r.error_message ?? `Bridge worker terminated before n8n returned. Job auto-marked stale by the watchdog after ${ageSeconds}s.`;
        r.finished_at = r.finished_at ?? this.db.now;
        r.updated_at = this.db.now;
      }
      return { meta: { changes: targets.length, rows_written: targets.length } };
    }

    // source/requested_by single-line UPDATE from launch.ts.
    if (s.startsWith('UPDATE seo_autopilot_jobs SET source = ?')) {
      const [source, requested_by, updated_at, id] = this.args as [string, string, string, string];
      const r = this.db.rows.find((x) => x.id === id);
      if (r) { r.source = source; r.requested_by = requested_by; r.updated_at = updated_at; return { meta: { changes: 1, rows_written: 1 } }; }
      return { meta: { changes: 0, rows_written: 0 } };
    }

    // Generic patch UPDATE from updateJob() — parse SET clause.
    const patchMatch = s.match(/^UPDATE seo_autopilot_jobs SET (.+) WHERE id = \?$/);
    if (patchMatch) {
      const setClause = patchMatch[1];
      const cols = setClause.split(',').map((part) => part.trim().split('=')[0].trim());
      const id = this.args[this.args.length - 1] as string;
      const row = this.db.rows.find((r) => r.id === id) as Record<string, unknown> | undefined;
      if (!row) return { meta: { changes: 0, rows_written: 0 } };
      for (let i = 0; i < cols.length; i++) {
        row[cols[i]] = this.args[i];
      }
      return { meta: { changes: 1, rows_written: 1 } };
    }

    return { meta: { changes: 0, rows_written: 0 } };
  }
  async first<R>(): Promise<R | null> {
    const s = this.sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT id FROM seo_autopilot_jobs')) {
      const ageSeconds = this.args.find((v) => typeof v === 'number') as number;
      const nowMs = Date.parse(this.db.now);
      const after = nowMs - ageSeconds * 1000;
      const row = this.db.rows
        .filter((r) => ['pending', 'forwarding', 'normalising', 'ingesting'].includes(r.status) && Date.parse(r.created_at) > after)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
      return (row ? ({ id: row.id } as unknown as R) : null);
    }
    if (s.startsWith('SELECT * FROM seo_autopilot_jobs WHERE id =')) {
      const id = this.args[0] as string;
      const r = this.db.rows.find((x) => x.id === id);
      return (r ? (r as unknown as R) : null);
    }
    return null;
  }
  async all<R>(): Promise<{ results: R[] }> {
    return { results: this.db.rows.slice() as unknown as R[] };
  }
}

function makeEmptyRow(id: string, request_id: string | null, n8n_url: string, created_at: string, updated_at: string): Row {
  return {
    id, request_id, status: 'pending', n8n_url,
    n8n_status: null, n8n_execution_id: null, generation_status: null,
    validation_status: null, validation_passed: null, validation_issue_count: null,
    draft_id: null, bundle_id: null, admin_url: null,
    ingestion_success: 0, deduplicated: 0,
    error_code: null, error_message: null, error_detail_json: null,
    created_at, updated_at, finished_at: null, duration_ms: null,
    source: 'external', requested_by: null,
  };
}

// ─── Stale watchdog ─────────────────────────────────────────────────────
{
  const db = new MockD1();
  db.now = '2026-06-21T12:00:00.000Z';
  // Insert one fresh forwarding job (1 minute ago) and one ancient (30 min ago)
  db.rows.push(makeEmptyRow('job_fresh', 'r-fresh', 'https://n8n', '2026-06-21T11:59:00.000Z', '2026-06-21T11:59:00.000Z'));
  db.rows.find((r) => r.id === 'job_fresh')!.status = 'forwarding';
  db.rows.push(makeEmptyRow('job_stale', 'r-stale', 'https://n8n', '2026-06-21T11:30:00.000Z', '2026-06-21T11:30:00.000Z'));
  db.rows.find((r) => r.id === 'job_stale')!.status = 'forwarding';

  const env = { GPTBOT_DRAFTS_DB: db } as unknown as Parameters<typeof markStaleJobsAsFailed>[0];
  const swept = await markStaleJobsAsFailed(env, 6 * 60 * 1000);
  expect('stale watchdog sweeps only old jobs', swept === 1, `swept=${swept}`);
  const fresh = await getJob(env, 'job_fresh');
  const stale = await getJob(env, 'job_stale');
  expect('fresh job still forwarding', fresh?.status === 'forwarding', String(fresh?.status));
  expect('stale job becomes failed', stale?.status === 'failed', String(stale?.status));
  expect('stale job has error_code=bridge_lost', stale?.error_code === 'bridge_lost', String(stale?.error_code));
  expect('stale job has finished_at set', !!stale?.finished_at);
}

// ─── Sync-await launch path returns final job (no waitUntil) ────────────
{
  const db = new MockD1();
  db.now = '2026-06-21T12:00:00.000Z';
  let waitUntilCalls = 0;
  const env = {
    GPTBOT_DRAFTS_DB: db,
    N8N_WEBHOOK_SECRET: 'test-secret',
  } as unknown as Parameters<typeof startSeoAutopilotJob>[0]['env'];

  // bridge-worker.ts will try to fetch n8n; we stub global fetch so we
  // don't hit the network. Return a basic shape that fails the strict
  // validator (so we exercise the failure path WITHOUT relying on a
  // successful end-to-end ingest, which would need a full sitemap mock).
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    return new Response(JSON.stringify({ status: 'ok', validation: { passed: true, issues: [] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await startSeoAutopilotJob({
      env,
      waitUntil: () => { waitUntilCalls++; },
      source: 'admin',
      requestedBy: 'admin@gptbot.uz',
      rawBody: '{}',
      runableSecret: 'test-secret',
      requestId: 'req-1',
      blockOnOverlap: false,
      awaitCompletion: true,
    });

    expect('sync launch returns ok=true', result.ok);
    if (result.ok && result.awaited) {
      expect('sync launch did NOT call waitUntil', waitUntilCalls === 0, `calls=${waitUntilCalls}`);
      expect('sync launch returns final job row', !!result.job);
      // n8n stub returned valid JSON without articles → normalise should
      // fail → final status=failed with the diagnostic code.
      expect('sync launch surfaces n8n_response_invalid', result.job.status === 'failed' && /missing both/i.test(result.job.error_message || ''),
        `status=${result.job.status} msg=${result.job.error_message}`);
    } else {
      expect('sync launch awaited=true', false, 'awaited path not taken');
    }
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ─── Async launch path still works (legacy schedule + external) ─────────
{
  const db = new MockD1();
  db.now = '2026-06-21T12:00:00.000Z';
  let waitUntilCalls = 0;
  let scheduled: Promise<unknown> | null = null;
  const env = {
    GPTBOT_DRAFTS_DB: db,
    N8N_WEBHOOK_SECRET: 'test-secret',
  } as unknown as Parameters<typeof startSeoAutopilotJob>[0]['env'];

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (): Promise<Response> => {
    // Long-running stub — we don't actually want this to resolve in this
    // assertion (we only check that waitUntil was wired up).
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await startSeoAutopilotJob({
      env,
      waitUntil: (p: Promise<unknown>) => { waitUntilCalls++; scheduled = p; },
      source: 'schedule',
      requestedBy: 'system:schedule',
      rawBody: '{}',
      runableSecret: 'test-secret',
      requestId: 'req-2',
      blockOnOverlap: false,
      // awaitCompletion omitted → legacy waitUntil path
    });

    expect('async launch returns ok=true', result.ok);
    if (result.ok) {
      expect('async launch did call waitUntil exactly once', waitUntilCalls === 1, `calls=${waitUntilCalls}`);
      expect('async launch returns status=pending', result.status === 'pending');
      expect('async launch sets awaited=false', !('awaited' in result) || result.awaited === false);
    }
    // Drain the scheduled promise so no unhandled rejection in the harness.
    if (scheduled) { try { await scheduled; } catch { /* ignore */ } }
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ─── Overlap guard still rejects scheduled runs that stack ─────────────
{
  const db = new MockD1();
  db.now = '2026-06-21T12:00:00.000Z';
  db.rows.push(makeEmptyRow('job_busy', 'r-b', 'https://n8n', '2026-06-21T11:59:00.000Z', '2026-06-21T11:59:00.000Z'));
  db.rows.find((r) => r.id === 'job_busy')!.status = 'forwarding';

  const env = { GPTBOT_DRAFTS_DB: db, N8N_WEBHOOK_SECRET: 's' } as unknown as Parameters<typeof startSeoAutopilotJob>[0]['env'];
  const result = await startSeoAutopilotJob({
    env, waitUntil: () => {}, source: 'schedule', requestedBy: 'system:schedule',
    rawBody: '{}', runableSecret: 's', blockOnOverlap: true, awaitCompletion: false,
  });
  expect('overlap blocks scheduled launch', !result.ok && result.reason === 'overlap_blocked');
}

// ─── Report ───────────────────────────────────────────────────────────
let fail = 0;
for (const r of results) {
  const ok = r.passed ? 'PASS' : 'FAIL';
  console.log(`${ok}  ${r.name}${r.detail && !r.passed ? `  — ${r.detail}` : ''}`);
  if (!r.passed) fail++;
}
console.log(`\nTotal: ${results.length}, passed: ${results.length - fail}, failed: ${fail}`);
if (fail > 0) process.exit(1);
