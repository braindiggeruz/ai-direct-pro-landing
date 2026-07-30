// R0.4 n8n retirement regression.
//
// This suite replaces tests/n8n-ingest-security.test.ts, which asserted the
// *fail-closed* behaviour of the legacy n8n ingest endpoint. That endpoint no
// longer exists, so the invariants worth protecting changed shape: the legacy
// producer must stay gone, and no environment variable may bring it back.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { onRequestPost, onRequestGet } from '../functions/api/admin/ai-drafts/index';
import type { Env } from '../functions/_types';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');

const RETIRED_ENV_NAMES = [
  'N8N_INGEST_TOKEN',
  'N8N_INGEST_ENABLED',
  'N8N_WEBHOOK_SECRET',
  'EXTERNAL_AUTOPILOT_TRIGGER_ENABLED',
  'SEO_AUTOPILOT_USE_DIRECT_AI',
] as const;

const DELETED_FILES = [
  'functions/lib/seo-autopilot/launch.ts',
  'functions/lib/seo-autopilot/bridge-worker.ts',
  'functions/lib/seo-autopilot/normalise.ts',
  'functions/api/seo-autopilot/run.ts',
] as const;

// Every file that can end up in a deployed Cloudflare bundle. Documentation,
// governance records and this suite deliberately still name n8n, because the
// retirement has to stay auditable.
function runtimeFiles(): string[] {
  const roots = ['functions', 'workers', 'src'];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  for (const root of roots) walk(path.join(ROOT, root));
  return out;
}

function context(request: Request, env: Partial<Env>) {
  return {
    request,
    env: env as Env,
    params: {},
    data: {},
    functionPath: '/api/admin/ai-drafts',
    waitUntil() {},
    next: async () => new Response(null, { status: 404 }),
  } as unknown as Parameters<typeof onRequestPost>[0];
}

function ingestRequest(body = '{}', authorization?: string): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (authorization !== undefined) headers.set('Authorization', authorization);
  return new Request('https://gptbot.uz/api/admin/ai-drafts', {
    method: 'POST',
    headers,
    body,
  });
}

describe('the legacy n8n ingest endpoint is withdrawn', () => {
  test('POST answers 410 Gone, not 200 and not 404', async () => {
    const db = new SqliteD1();
    const response = await onRequestPost(context(ingestRequest(), {
      GPTBOT_DRAFTS_DB: db.asD1(),
    }));
    assert.equal(response.status, 410);
  });

  test('stale n8n variables cannot re-enable ingestion', async () => {
    const db = new SqliteD1();
    // Every combination the old code branched on, including the exact set that
    // used to produce a 200.
    const revivalAttempts: Partial<Env>[] = [
      { N8N_INGEST_ENABLED: 'true' } as Partial<Env>,
      { N8N_INGEST_ENABLED: 'true', N8N_INGEST_TOKEN: 'synthetic-token' } as Partial<Env>,
      { N8N_INGEST_ENABLED: 'TRUE', N8N_INGEST_TOKEN: 'synthetic-token' } as Partial<Env>,
      { N8N_INGEST_ENABLED: '1', N8N_INGEST_TOKEN: 'synthetic-token' } as Partial<Env>,
    ];
    for (const extra of revivalAttempts) {
      const response = await onRequestPost(context(
        ingestRequest('{}', 'Bearer synthetic-token'),
        { GPTBOT_DRAFTS_DB: db.asD1(), ...extra },
      ));
      assert.equal(response.status, 410, JSON.stringify(extra));
    }
  });

  test('a correct bearer token writes no draft', async () => {
    const db = new SqliteD1();
    db.exec(fs.readFileSync(path.join(ROOT, 'migrations/0001_ai_drafts.sql'), 'utf8'));
    await onRequestPost(context(
      ingestRequest('{"schema_version":"gptbot.article-draft.v1"}', 'Bearer synthetic-token'),
      {
        GPTBOT_DRAFTS_DB: db.asD1(),
        N8N_INGEST_ENABLED: 'true',
        N8N_INGEST_TOKEN: 'synthetic-token',
      } as Partial<Env>,
    ));
    assert.equal(db.value('SELECT COUNT(*) FROM ai_drafts'), 0);
  });

  test('the 410 body leaks no credential and no request payload', async () => {
    const db = new SqliteD1();
    const secret = 'synthetic-token-never-echo';
    const seen: unknown[][] = [];
    const originalError = console.error;
    const originalLog = console.log;
    console.error = (...args: unknown[]) => { seen.push(args); };
    console.log = (...args: unknown[]) => { seen.push(args); };
    try {
      const response = await onRequestPost(context(
        ingestRequest('{"private_prompt":"do not log"}', `Bearer ${secret}`),
        { GPTBOT_DRAFTS_DB: db.asD1(), N8N_INGEST_TOKEN: secret } as Partial<Env>,
      ));
      const output = await response.text();
      assert.ok(!output.includes(secret));
      assert.ok(!output.includes('private_prompt'));
      assert.ok(!JSON.stringify(seen).includes(secret));
      assert.ok(!JSON.stringify(seen).includes('private_prompt'));
    } finally {
      console.error = originalError;
      console.log = originalLog;
    }
  });

  test('the admin list endpoint still requires a JWT', async () => {
    const db = new SqliteD1();
    const response = await onRequestGet(context(
      new Request('https://gptbot.uz/api/admin/ai-drafts', { method: 'GET' }),
      { GPTBOT_DRAFTS_DB: db.asD1() },
    ));
    assert.equal(response.status, 401);
  });
});

describe('no runtime code depends on n8n', () => {
  test('the legacy bridge, normaliser and external trigger are deleted', () => {
    for (const relative of DELETED_FILES) {
      assert.equal(
        fs.existsSync(path.join(ROOT, relative)),
        false,
        `${relative} must not exist`,
      );
    }
  });

  test('no deployable source file reads a retired n8n variable', () => {
    const offenders: string[] = [];
    for (const file of runtimeFiles()) {
      const text = fs.readFileSync(file, 'utf8');
      for (const name of RETIRED_ENV_NAMES) {
        // `_types.ts` carries a do-not-reintroduce comment naming them; a
        // comment is not a read, so only flag an actual property access.
        if (new RegExp(`env\\s*(\\??\\.|\\[\\s*['"\`])\\s*${name}`).test(text)) {
          offenders.push(`${path.relative(ROOT, file)} → ${name}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  test('the Env interface no longer declares a retired n8n variable', () => {
    const text = fs.readFileSync(path.join(ROOT, 'functions/_types.ts'), 'utf8');
    for (const name of RETIRED_ENV_NAMES) {
      assert.equal(
        new RegExp(`^\\s*${name}\\??:`, 'm').test(text),
        false,
        `${name} must not be declared`,
      );
    }
  });

  test('no runtime file contains an n8n webhook URL', () => {
    const offenders: string[] = [];
    for (const file of runtimeFiles()) {
      const text = fs.readFileSync(file, 'utf8');
      if (/n8n\.cloud|x-runable-secret/i.test(text)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    assert.deepEqual(offenders, []);
  });

  test('the automation worker imports nothing n8n-shaped', () => {
    const text = fs.readFileSync(path.join(ROOT, 'workers/automation-worker.ts'), 'utf8');
    assert.equal(/n8n/i.test(text), false);
  });
});

describe('the production environment contract records the retirement', () => {
  const schema = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'config/production-env.schema.json'),
    'utf8',
  )) as {
    variables: Array<{ name: string }>;
    retired_variables?: { names: string[]; release: string };
  };

  test('no retired n8n name remains a contract variable', () => {
    const names = schema.variables.map((v) => v.name);
    for (const name of RETIRED_ENV_NAMES) {
      assert.equal(names.includes(name), false, `${name} must be removed`);
    }
  });

  test('the retired names are recorded as forbidden, not merely deleted', () => {
    assert.ok(schema.retired_variables, 'retired_variables block required');
    assert.equal(schema.retired_variables?.release, 'R0.4');
    for (const name of RETIRED_ENV_NAMES) {
      assert.ok(
        schema.retired_variables?.names.includes(name),
        `${name} must be listed as retired`,
      );
    }
  });

  test('the first-party automation names are still required', () => {
    const names = schema.variables.map((v) => v.name);
    for (const name of ['AUTOMATION_QUEUE', 'AUTOMATION_DLQ', 'FIRST_PARTY_AUTOMATION_ENABLED']) {
      assert.ok(names.includes(name), `${name} must remain in the contract`);
    }
  });
});

describe('the first-party path works without any n8n input', () => {
  test('the single launcher is the direct one and takes no webhook secret', async () => {
    const module = await import('../functions/lib/seo-autopilot/direct-launch');
    assert.equal(typeof module.startSeoAutopilotJobDirect, 'function');
    assert.equal('isDirectAiEnabled' in module, false);
    const text = fs.readFileSync(
      path.join(ROOT, 'functions/lib/seo-autopilot/direct-launch.ts'),
      'utf8',
    );
    assert.equal(/runableSecret|awaitCompletion|webhook_secret_missing/.test(text), false);
  });

  test('every SEO launch caller uses the direct launcher only', () => {
    const callers = [
      'functions/api/admin/seo-autopilot/run.ts',
      'functions/api/internal/seo-autopilot/scheduled-run.ts',
      'functions/api/admin/seo/yandex/quick-launch.ts',
      'functions/api/admin/seo/topic-plans/[id]/items/[itemId]/launch.ts',
    ];
    for (const relative of callers) {
      const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(
        text.includes('startSeoAutopilotJobDirect'),
        `${relative} must call the direct launcher`,
      );
      assert.equal(
        /from '[^']*seo-autopilot\/launch'/.test(text),
        false,
        `${relative} must not import the deleted launcher`,
      );
    }
  });

  test('the automation runtime exposes a closed single-job-type allowlist', async () => {
    const { AUTOMATION_JOB_TYPES } = await import('../functions/platform/automation');
    assert.deepEqual([...AUTOMATION_JOB_TYPES], ['seo_draft_generation']);
  });
});
