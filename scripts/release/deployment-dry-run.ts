import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '../..');

export interface DeploymentCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DeploymentDryRunReport {
  status: 'pass' | 'blocked';
  mode: 'read-only-dry-run';
  mutations: [];
  checks: DeploymentCheck[];
}

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

export function runDeploymentDryRun(): DeploymentDryRunReport {
  const checks: DeploymentCheck[] = [];
  const wrangler = read('wrangler.toml');
  const rootPackage = JSON.parse(read('package.json')) as {
    scripts?: Record<string, string>;
  };
  const railway = JSON.parse(read('apps/gpt-backend/railway.json')) as {
    build?: { buildCommand?: string };
    deploy?: {
      startCommand?: string;
      healthcheckPath?: string;
      restartPolicyType?: string;
    };
  };
  const routes = JSON.parse(read('public/_routes.json')) as {
    include?: string[];
  };
  const manifest = JSON.parse(
    read('docs/agents-platform/release/R0.4_RELEASE_MANIFEST.json'),
  ) as {
    status?: string;
    production_changes_performed?: boolean;
  };

  const add = (name: string, ok: boolean, pass: string, fail: string) => {
    checks.push({ name, ok, detail: ok ? pass : fail });
  };
  add(
    'cloudflare:project',
    /name\s*=\s*"ai-direct-pro-landing"/.test(wrangler),
    'declared',
    'missing',
  );
  add(
    'cloudflare:output',
    /pages_build_output_dir\s*=\s*"dist"/.test(wrangler),
    'dist',
    'invalid',
  );
  add(
    'cloudflare:d1-binding',
    /binding\s*=\s*"GPTBOT_DRAFTS_DB"/.test(wrangler)
      && /database_name\s*=\s*"gptbot-ai-drafts"/.test(wrangler),
    'declared',
    'missing',
  );
  add(
    'cloudflare:build-command',
    Boolean(rootPackage.scripts?.build),
    'declared',
    'missing',
  );
  add(
    'cloudflare:function-routes',
    ['/api/*', '/admin-tools/*', '/robots.txt'].every((route) =>
      routes.include?.includes(route)),
    'declared',
    'incomplete',
  );
  add(
    'railway:build',
    railway.build?.buildCommand === 'npm install && npm run build',
    'declared',
    'invalid',
  );
  add(
    'railway:start',
    railway.deploy?.startCommand === 'npm run start',
    'declared',
    'invalid',
  );
  add(
    'railway:health',
    railway.deploy?.healthcheckPath === '/health',
    '/health',
    'invalid',
  );
  add(
    'railway:restart-policy',
    railway.deploy?.restartPolicyType === 'ON_FAILURE',
    'bounded',
    'invalid',
  );
  add(
    'release:local-only',
    manifest.status === 'prepared_locally_blocked_by_R0.3B'
      && manifest.production_changes_performed === false,
    'no-production-change',
    'invalid-state',
  );

  return {
    status: checks.every((check) => check.ok) ? 'pass' : 'blocked',
    mode: 'read-only-dry-run',
    mutations: [],
    checks,
  };
}

const direct = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (direct) {
  const report = runDeploymentDryRun();
  for (const check of report.checks) {
    console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.name} ${check.detail}`);
  }
  console.log(`DEPLOYMENT_DRY_RUN=${report.status.toUpperCase()}`);
  if (report.status !== 'pass') process.exitCode = 1;
}
