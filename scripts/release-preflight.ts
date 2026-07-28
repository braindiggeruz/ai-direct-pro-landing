import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildTelegramAgentsWebhookUrl } from '../functions/channels/telegram/setup';
import { isUsableSotuvchiBotUsername } from '../src/shared/sotuvchi-config';
import { runBackupRestoreRehearsal } from './release/backup-restore-rehearsal';
import { runDeploymentDryRun } from './release/deployment-dry-run';
import {
  validateContractStructure,
  validateProductionEnvironment,
} from './release/env-contract';
import { runMigrationRehearsal } from './release/migration-rehearsal';

const ROOT = path.resolve(import.meta.dirname, '..');
const FORBIDDEN_PATHS = [
  'memory/test_credentials.md',
  'gptbot-audit/memory/test_credentials.md',
  'gptbot-audit/gptbot-audit/memory/test_credentials.md',
  'repo/memory/test_credentials.md',
  'repo/repo/memory/test_credentials.md',
];

export type PreflightPhase = 'r0.4-prep' | 'r1';

export interface PreflightOptions {
  phase?: PreflightPhase;
  deep?: boolean;
  environment?: Readonly<Record<string, string | undefined>>;
}

export interface PreflightCheck {
  name: string;
  ok: boolean;
  blocking: boolean;
  detail: string;
}

export interface PreflightReport {
  status: 'pass' | 'blocked';
  phase: PreflightPhase;
  mode: 'read-only';
  mutations: [];
  checks: PreflightCheck[];
}

function git(args: string[]): { status: number; stdout: string } {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
  };
}

function command(
  executable: string,
  args: string[],
  cwd = ROOT,
): { ok: boolean; output: string } {
  const nodeTools: Record<string, string> = {
    npm: path.join(
      path.dirname(process.execPath),
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    ),
    npx: path.join(
      path.dirname(process.execPath),
      'node_modules',
      'npm',
      'bin',
      'npx-cli.js',
    ),
    corepack: path.join(
      path.dirname(process.execPath),
      'node_modules',
      'corepack',
      'dist',
      'corepack.js',
    ),
  };
  const nodeTool = process.platform === 'win32' ? nodeTools[executable] : undefined;
  const result = spawnSync(nodeTool ? process.execPath : executable, [
    ...(nodeTool ? [nodeTool] : []),
    ...args,
  ], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      NODE_OPTIONS: '--max-old-space-size=1400',
    },
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim(),
  };
}

function safeDetail(output: string): string {
  const lines = output.split(/\r?\n/).filter(Boolean);
  return lines.length === 0 ? 'no-output' : `${lines.length}-output-lines`;
}

export function runReleasePreflight(
  options: PreflightOptions = {},
): PreflightReport {
  const phase = options.phase ?? 'r1';
  const environment = options.environment ?? process.env;
  const checks: PreflightCheck[] = [];
  const add = (
    name: string,
    ok: boolean,
    detail: string,
    blocking = true,
  ) => checks.push({ name, ok, detail, blocking });

  const branch = git(['branch', '--show-current']);
  add('git:branch', branch.status === 0 && branch.stdout === 'main', branch.stdout || 'unknown');

  const status = git(['status', '--short']);
  const unexpected = status.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.startsWith('?? gptbot.uz-audit/'));
  add('git:clean', status.status === 0 && unexpected.length === 0,
    unexpected.length === 0 ? 'clean' : 'tracked-or-unexpected-change');

  const state = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'docs', 'agents-platform', 'STATE.json'),
    'utf8',
  )) as {
    current_stage?: string;
    stage_status?: string;
    next_stage?: string;
  };
  add(
    'governance:stage',
    state.current_stage === 'R0.3'
      && state.stage_status === 'in_progress'
      && state.next_stage === 'R0.3B',
    `${state.current_stage ?? 'unknown'}/${state.stage_status ?? 'unknown'}`,
  );

  const divergence = git([
    'rev-list',
    '--left-right',
    '--count',
    'origin/main...HEAD',
  ]);
  const [behindText, aheadText] = divergence.stdout.split(/\s+/);
  const behind = Number(behindText);
  const ahead = Number(aheadText);
  add(
    'git:origin-divergence',
    divergence.status === 0 && behind === 0 && Number.isInteger(ahead),
    divergence.status === 0 ? `behind-${behind}-ahead-${ahead}` : 'unavailable',
  );

  const trackedForbidden = git(['ls-files', '--', ...FORBIDDEN_PATHS]);
  const existingForbidden = FORBIDDEN_PATHS.filter((relative) =>
    fs.existsSync(path.join(ROOT, relative)));
  add(
    'security:forbidden-credential-paths',
    trackedForbidden.status === 0
      && trackedForbidden.stdout === ''
      && existingForbidden.length === 0,
    existingForbidden.length === 0 && trackedForbidden.stdout === ''
      ? 'absent'
      : 'present',
  );

  const scan = command('npm', ['run', 'scan:secrets']);
  add('security:secret-scan', scan.ok, scan.ok ? 'clean' : safeDetail(scan.output));
  add(
    'dependencies:lockfiles',
    fs.existsSync(path.join(ROOT, 'yarn.lock'))
      && fs.existsSync(path.join(ROOT, 'package-lock.json'))
      && fs.existsSync(path.join(ROOT, 'apps', 'gpt-backend', 'package-lock.json')),
    'root-and-backend-lockfiles',
  );
  add(
    'dependencies:installed',
    fs.existsSync(path.join(ROOT, 'node_modules'))
      && fs.existsSync(path.join(ROOT, 'apps', 'gpt-backend', 'node_modules')),
    'root-and-backend',
  );

  const environmentReport = phase === 'r1'
    ? validateProductionEnvironment(environment)
    : validateContractStructure();
  add(
    'environment:contract',
    environmentReport.status === 'pass',
    environmentReport.status,
  );

  const migrations = runMigrationRehearsal();
  add('d1:migration-rehearsal', migrations.status === 'pass', migrations.status);
  const backup = runBackupRestoreRehearsal();
  add('d1:backup-restore-rehearsal', backup.status === 'pass', backup.status);
  const deployment = runDeploymentDryRun();
  add('deployment:dry-run', deployment.status === 'pass', deployment.status);

  const agentsUsername = environment.TELEGRAM_AGENTS_BOT_USERNAME;
  add(
    'telegram:agents-username',
    phase === 'r0.4-prep' || isUsableSotuvchiBotUsername(agentsUsername),
    isUsableSotuvchiBotUsername(agentsUsername)
      ? 'approved'
      : phase === 'r0.4-prep'
        ? 'missing-blocks-r1-only'
        : 'missing-or-forbidden',
  );
  const webhookOk = (() => {
    try {
      return buildTelegramAgentsWebhookUrl(
        environment.SITE_URL ?? 'https://gptbot.uz',
      ) === 'https://gptbot.uz/api/telegram/agents';
    } catch {
      return false;
    }
  })();
  add('telegram:webhook-url', webhookOk, webhookOk ? 'canonical' : 'invalid');

  const rollbackFiles = [
    'docs/agents-platform/release/ROLLBACK_RUNBOOK.md',
    'docs/agents-platform/release/R1_OWNER_CHECKLIST.md',
    'docs/agents-platform/release/R0.4_RELEASE_MANIFEST.json',
  ];
  add(
    'rollback:prerequisites',
    rollbackFiles.every((file) => fs.existsSync(path.join(ROOT, file))),
    'manifest-runbook-checklist',
  );

  const outputReady = fs.existsSync(path.join(ROOT, 'dist', 'index.html'));
  add(
    'build:output',
    outputReady,
    outputReady ? 'dist-present' : 'dist-missing',
    options.deep === true,
  );

  if (options.deep) {
    const rootTypecheck = command('npx', ['tsc', '-b']);
    add('deep:root-typecheck', rootTypecheck.ok,
      rootTypecheck.ok ? 'pass' : safeDetail(rootTypecheck.output));
    const rootBuild = command('corepack', ['yarn', 'build']);
    add('deep:root-build', rootBuild.ok,
      rootBuild.ok ? 'pass' : safeDetail(rootBuild.output));
    const rootAudit = command('npm', ['audit', '--omit=dev', '--json']);
    let exactRscOnly = false;
    if (!rootAudit.ok) {
      try {
        const audit = JSON.parse(rootAudit.output) as {
          vulnerabilities?: Record<string, {
            via?: Array<string | { url?: string }>;
          }>;
          metadata?: {
            vulnerabilities?: Record<string, number>;
          };
        };
        const counts = audit.metadata?.vulnerabilities ?? {};
        const routerVia = audit.vulnerabilities?.['react-router']?.via ?? [];
        const policy = JSON.parse(fs.readFileSync(
          path.join(ROOT, 'config', 'release-audit-policy.json'),
          'utf8',
        )) as {
          advisories?: { id?: string; disposition?: string }[];
        };
        const policyMatches = policy.advisories?.some((entry) =>
          entry.id === 'GHSA-qwww-vcr4-c8h2'
          && entry.disposition === 'not_reachable_in_current_build');
        const rscUsage = git([
          'grep',
          '-n',
          '-E',
          'routeRSCServerRequest|RSCStaticRouter|unstable_RSC|react-server',
          '--',
          'src',
          'functions',
        ]);
        exactRscOnly = (
          counts.high === 2
          && counts.critical === 0
          && counts.total === 2
          && Object.keys(audit.vulnerabilities ?? {}).sort().join(',')
            === 'react-router,react-router-dom'
          && routerVia.some((entry) =>
            typeof entry !== 'string'
            && entry.url?.endsWith('GHSA-qwww-vcr4-c8h2'))
          && policyMatches === true
          && rscUsage.status === 1
          && rscUsage.stdout === ''
        );
      } catch {
        exactRscOnly = false;
      }
    }
    const rootAuditAccepted = rootAudit.ok
      || (phase === 'r0.4-prep' && exactRscOnly);
    add(
      'deep:root-audit',
      rootAuditAccepted,
      rootAudit.ok
        ? 'zero-findings'
        : exactRscOnly
          ? '2-high-rsc-only-not-reachable-r1-blocker'
          : safeDetail(rootAudit.output),
    );

    const backend = path.join(ROOT, 'apps', 'gpt-backend');
    const backendAudit = command('npm', ['audit', '--omit=dev'], backend);
    add('deep:backend-audit', backendAudit.ok,
      backendAudit.ok ? 'zero-findings' : safeDetail(backendAudit.output));
    const backendTypecheck = command('npm', ['run', 'typecheck'], backend);
    add('deep:backend-typecheck', backendTypecheck.ok,
      backendTypecheck.ok ? 'pass' : safeDetail(backendTypecheck.output));
    const backendBuild = command('npm', ['run', 'build'], backend);
    add('deep:backend-build', backendBuild.ok,
      backendBuild.ok ? 'pass' : safeDetail(backendBuild.output));

    const functionsTypecheck = command(
      'npx',
      ['tsc', '-p', 'tsconfig.functions.json', '--noEmit'],
    );
    const legacyErrors = functionsTypecheck.output.match(/error TS\d+:/g) ?? [];
    const legacyFiles = new Set(
      [...functionsTypecheck.output.matchAll(/^([^( \r\n]+)\(\d+,\d+\): error TS/gm)]
        .map((match) => match[1]),
    );
    const expectedLegacy = (
      !functionsTypecheck.ok
      && legacyErrors.length === 27
      && legacyFiles.size === 6
    );
    add(
      'deep:functions-typecheck',
      functionsTypecheck.ok || expectedLegacy,
      functionsTypecheck.ok
        ? 'pass'
        : expectedLegacy
          ? '27-known-errors-in-6-legacy-files'
          : `${legacyErrors.length}-errors-in-${legacyFiles.size}-files`,
    );
  }

  const blocked = checks.some((check) => check.blocking && !check.ok);
  return {
    status: blocked ? 'blocked' : 'pass',
    phase,
    mode: 'read-only',
    mutations: [],
    checks,
  };
}

const direct = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (direct) {
  const phase = process.argv.includes('--phase')
    ? process.argv[process.argv.indexOf('--phase') + 1] as PreflightPhase
    : process.argv.find((argument) => argument.startsWith('--phase='))
      ?.slice('--phase='.length) as PreflightPhase | undefined;
  if (phase && !['r0.4-prep', 'r1'].includes(phase)) {
    console.error('Unknown preflight phase.');
    process.exit(2);
  }
  const report = runReleasePreflight({
    phase,
    deep: process.argv.includes('--deep'),
  });
  for (const check of report.checks) {
    console.log(
      `${check.ok ? 'PASS' : check.blocking ? 'BLOCK' : 'WARN'} `
      + `${check.name} ${check.detail}`,
    );
  }
  console.log(`RELEASE_PREFLIGHT=${report.status.toUpperCase()}`);
  if (report.status !== 'pass') process.exitCode = 1;
}
