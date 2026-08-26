import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RELEASE_GATE_SCHEMA = 'gptbot.lead-radar.release-gate.v2' as const;
export const WORKER_OUTDIR_TOKEN = '__LEAD_RADAR_WORKER_OUTDIR__';
export const TELEGRAM_GATEWAY_OUTDIR_TOKEN = '__LEAD_RADAR_TELEGRAM_GATEWAY_OUTDIR__';
export const DEFAULT_REPORT_PATH = 'reports/lead-radar-release-gate.json';

export type ReleaseGateMode = 'plan' | 'execute';
export type ReleaseGateStatus = 'green' | 'red';

export interface GateCommand {
  id:
    | 'app_typecheck'
    | 'functions_typecheck_no_waivers'
    | 'lead_radar_api_worker_ui_typecheck'
    | 'telegram_gateway_typecheck'
    | 'lead_radar_lint'
    | 'lead_radar_tests'
    | 'telegram_windows_bridge_tests'
    | 'secret_scan'
    | 'secret_scan_self_tests'
    | 'cloudflare_pages_build'
    | 'automation_worker_dry_run'
    | 'telegram_gateway_worker_dry_run';
  executable: 'node' | 'npm' | 'npx' | 'python3';
  args: string[];
  cwd: '.';
  safety: 'read_only' | 'local_build' | 'wrangler_dry_run';
}

export interface RunnableGateCommand extends GateCommand {
  args: string[];
}

export interface CommandExecution {
  exitCode: number;
}

export interface CommandRunner {
  run(command: RunnableGateCommand, root: string): Promise<CommandExecution>;
}

export interface GateCommandResult {
  id: GateCommand['id'];
  status: 'planned' | 'pass' | 'fail';
  exit_code: number | null;
  executable: GateCommand['executable'];
  args: string[];
  cwd: '.';
  safety: GateCommand['safety'];
}

export interface HashedFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface ArtifactSet {
  id:
    | 'cloudflare_pages_dist'
    | 'automation_worker_bundle'
    | 'telegram_account_gateway_bundle';
  root:
    | 'dist'
    | 'temporary-worker-dry-run-output'
    | 'temporary-telegram-account-gateway-dry-run-output';
  status: 'hashed' | 'missing' | 'not_run' | 'unsafe';
  sha256: string | null;
  files: HashedFile[];
}

export interface ReleaseGateReport {
  schema: typeof RELEASE_GATE_SCHEMA;
  status: ReleaseGateStatus;
  mode: ReleaseGateMode;
  complete: boolean;
  safety: {
    remote_writes: false;
    deployments: false;
    migrations_applied: false;
    shell_execution: false;
  };
  reasons: string[];
  input_manifest_sha256: string;
  inputs: HashedFile[];
  commands: GateCommandResult[];
  artifact_manifest_sha256: string;
  artifacts: ArtifactSet[];
}

export interface CliOptions {
  mode: ReleaseGateMode;
  reportPath: string;
}

export interface RunReleaseGateOptions {
  root?: string;
  mode?: ReleaseGateMode;
  runner?: CommandRunner;
  temporaryDirectoryFactory?: () => string;
}

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL('../..', import.meta.url)),
);

const FIXED_INPUTS = [
  'package.json',
  'yarn.lock',
  'vite.config.ts',
  'eslint.config.js',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.functions.json',
  'tsconfig.lead-radar.json',
  'wrangler.toml',
  'wrangler.automation.toml',
  '.github/workflows/lead-radar-release-gate.yml',
  'docs/LEAD_RADAR_PRODUCTION_RUNBOOK.md',
  'docs/LEAD_RADAR_TELEGRAM_CAMPAIGNS_ADR.md',
  'apps/bormi-admin/package.json',
  'apps/bormi-admin/package-lock.json',
  'apps/bormi-admin/vite.config.ts',
  'workers/automation-worker.ts',
  'workers/lead-radar-telegram-account/wrangler.toml',
  'workers/lead-radar-telegram-account/index.ts',
  'workers/lead-radar-telegram-account/bridge-mailbox.ts',
  'workers/lead-radar-telegram-account/bridge-protocol.ts',
  'workers/lead-radar-telegram-account/configuration.ts',
  'workers/lead-radar-telegram-account/crypto.ts',
  'workers/lead-radar-telegram-account/protocol.ts',
  'workers/lead-radar-telegram-account/message-effect.ts',
  'tools/lead-radar-telegram-bridge/pyproject.toml',
  'tools/lead-radar-telegram-bridge/requirements.lock',
  'tools/lead-radar-telegram-bridge/requirements-ci.lock',
  'tools/lead-radar-telegram-bridge/lead_radar_bridge/runtime.py',
  'tools/lead-radar-telegram-bridge/lead_radar_bridge/security.py',
  'tools/lead-radar-telegram-bridge/lead_radar_bridge/installer.py',
  'tools/lead-radar-telegram-bridge/lead_radar_bridge/telegram_adapter.py',
  'tools/lead-radar-telegram-bridge/tests/test_bridge_protocol.py',
  'tools/lead-radar-telegram-bridge/tests/test_bridge_runtime.py',
  'tools/lead-radar-telegram-bridge/tests/test_bridge_telegram_adapter.py',
  'tools/lead-radar-telegram-bridge/tests/test_bridge_windows.py',
  'functions/_types.ts',
  'functions/api/admin/lead-radar/[[path]].ts',
  'functions/api/admin/lead-radar/telegram-campaign-control.ts',
  'functions/api/telegram/lead-radar-business.ts',
  'functions/platform/lead-radar/telegram-account-service.ts',
  'functions/platform/lead-radar/telegram-campaign.ts',
  'functions/platform/lead-radar/telegram-campaign-store.ts',
  'functions/platform/lead-radar/telegram-campaign-schema.ts',
  'functions/platform/lead-radar/telegram-campaign-media.ts',
  'src/admin/lib/api.ts',
  'src/admin/components/lead-radar/TelegramBusinessConnectionCard.tsx',
  'src/admin/components/lead-radar/TelegramOutreachActions.tsx',
  'src/admin/components/lead-radar/TelegramAccountCampaignPanel.tsx',
  'src/admin/lib/lead-radar-campaign.ts',
  'src/admin/AdminApp.tsx',
  'src/admin/pages/LeadRadar.tsx',
  'src/shared/lead-radar.ts',
  'src/shared/lead-radar-telegram-campaign-policy.ts',
  'src/shared/lead-radar-telegram-bridge.ts',
  'src/admin/lib/lead-radar-telegram-bridge-crypto.ts',
  'tests/lead-radar.test.ts',
  'tests/lead-radar-telegram-bridge-crypto.test.ts',
  'tests/lead-radar-telegram-media-quota.test.ts',
  'tests/lead-radar-release-gate.test.ts',
  'tests/secret-scan.test.ts',
  'scripts/scan-secrets.ts',
  'scripts/d1/audit-lead-radar-schema.ts',
  'scripts/d1/reconcile-lead-radar-0041.ts',
  'scripts/seo-audit.ts',
  'scripts/prerender.ts',
  'scripts/prerender-blog.ts',
  'scripts/prerender-home.ts',
  'scripts/generate-sitemap.ts',
  'scripts/generate-robots.ts',
  'scripts/generate-llm-markdown.ts',
] as const;

const OPTIONAL_MIGRATIONS = [
  'migrations/0036_lead_radar.sql',
  'migrations/0041_lead_radar_search_leases.sql',
  'migrations/0042_lead_radar_decision_makers.sql',
  'migrations/0043_lead_radar_async_funnel.sql',
  'migrations/0044_lead_radar_telegram_business.sql',
  'migrations/0045_lead_radar_telegram_campaigns.sql',
  'migrations/0046_lead_radar_telegram_campaign_safety.sql',
  'migrations/0047_lead_radar_telegram_campaign_media.sql',
  'migrations/0048_lead_radar_telegram_media_quota.sql',
] as const;

const ALLOWLISTED_ROOT_SCRIPTS = {
  'scan:secrets': 'tsx scripts/scan-secrets.ts',
  'build:cf': [
    'tsx scripts/seo-audit.ts',
    'vite build',
    'tsx scripts/prerender.ts',
    'tsx scripts/prerender-blog.ts',
    'tsx scripts/prerender-home.ts',
    'tsx scripts/generate-sitemap.ts',
    'tsx scripts/generate-robots.ts',
    'tsx scripts/generate-llm-markdown.ts',
    'npm run build:admin',
  ].join(' && '),
  'build:admin': 'npm --prefix apps/bormi-admin ci && npm --prefix apps/bormi-admin run build',
} as const;

const ALLOWLISTED_ADMIN_SCRIPTS = {
  build: 'tsc -b && vite build',
} as const;

function slash(value: string): string {
  return value.split(path.sep).join('/');
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function resolveGateCommandInvocation(
  executable: GateCommand['executable'],
  platform: NodeJS.Platform = process.platform,
): {
  executable: string;
  prefix: string[];
} {
  if (executable === 'node') return { executable: process.execPath, prefix: [] };
  if (executable === 'python3') {
    return platform === 'win32'
      ? { executable: 'py', prefix: ['-3.12'] }
      : { executable: 'python3', prefix: [] };
  }
  if (platform !== 'win32') return { executable, prefix: [] };

  // Node cannot execute npm.cmd/npx.cmd with shell=false on Windows. Preserve
  // the gate's no-shell guarantee by invoking npm's reviewed JavaScript entry
  // points through the current Node binary instead.
  const currentCli = process.env.npm_execpath;
  if (!currentCli || !path.isAbsolute(currentCli)) {
    return { executable: process.execPath, prefix: ['__npm_cli_unavailable__'] };
  }
  const cliName = executable === 'npm' ? 'npm-cli.js' : 'npx-cli.js';
  const cliPath = path.join(path.dirname(currentCli), cliName);
  if (!fs.existsSync(cliPath) || path.basename(cliPath) !== cliName) {
    return { executable: process.execPath, prefix: ['__npm_cli_unavailable__'] };
  }
  return { executable: process.execPath, prefix: [cliPath] };
}

export class SpawnCommandRunner implements CommandRunner {
  async run(command: RunnableGateCommand, root: string): Promise<CommandExecution> {
    return new Promise((resolve) => {
      const invocation = resolveGateCommandInvocation(command.executable);
      const child = spawn(
        invocation.executable,
        [...invocation.prefix, ...command.args],
        {
          cwd: root,
          env: {
            ...process.env,
            CI: '1',
            MEDIA_VALIDATION_ONLY: '1',
            NO_COLOR: '1',
            PYTHONDONTWRITEBYTECODE: '1',
          },
          shell: false,
          stdio: 'inherit',
          windowsHide: true,
        },
      );
      child.once('error', () => resolve({ exitCode: 1 }));
      child.once('exit', (code) => resolve({ exitCode: code ?? 1 }));
    });
  }
}

function isLeadRadarTestFilename(name: string): boolean {
  return name === 'lead-radar.test.ts'
    || (
      name.startsWith('lead-radar-')
      && name.endsWith('.test.ts')
      && name !== 'lead-radar-release-gate.test.ts'
    );
}

export function discoverLeadRadarTests(root: string): string[] {
  const testsRoot = path.join(root, 'tests');
  const discovered = fs.existsSync(testsRoot)
    ? fs.readdirSync(testsRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isLeadRadarTestFilename(entry.name))
      .map((entry) => `tests/${entry.name}`)
    : [];
  if (!discovered.includes('tests/lead-radar.test.ts')) {
    discovered.push('tests/lead-radar.test.ts');
  }
  return [...new Set(discovered)].sort((left, right) => left.localeCompare(right));
}

export function createCommandPlan(root = REPOSITORY_ROOT): GateCommand[] {
  const leadRadarTests = discoverLeadRadarTests(root);
  return [
    {
      id: 'app_typecheck',
      executable: 'npx',
      args: ['--no-install', 'tsc', '-b', '--pretty', 'false'],
      cwd: '.',
      safety: 'read_only',
    },
    {
      // This intentionally remains a hard gate. The narrow Lead Radar project
      // does not convert pre-existing errors elsewhere in Functions into a
      // production waiver.
      id: 'functions_typecheck_no_waivers',
      executable: 'npx',
      args: [
        '--no-install',
        'tsc',
        '-p',
        'tsconfig.functions.json',
        '--noEmit',
        '--pretty',
        'false',
      ],
      cwd: '.',
      safety: 'read_only',
    },
    {
      // UI is additionally covered by app_typecheck. This project checks the
      // complete Lead Radar UI/API/domain/Worker graph under one strict zero-
      // error contract.
      id: 'lead_radar_api_worker_ui_typecheck',
      executable: 'npx',
      args: [
        '--no-install',
        'tsc',
        '-p',
        'tsconfig.lead-radar.json',
        '--noEmit',
        '--pretty',
        'false',
      ],
      cwd: '.',
      safety: 'read_only',
    },
    {
      id: 'telegram_gateway_typecheck',
      executable: 'npx',
      args: [
        '--no-install',
        'tsc',
        '-p',
        'workers/lead-radar-telegram-account/tsconfig.json',
        '--noEmit',
        '--pretty',
        'false',
      ],
      cwd: '.',
      safety: 'read_only',
    },
    {
      id: 'lead_radar_lint',
      executable: 'npx',
      args: [
        '--no-install',
        'eslint',
        'functions/platform/lead-radar',
        'functions/api/admin/lead-radar',
        'functions/api/telegram/lead-radar-business.ts',
        'src/admin/components/lead-radar',
        'src/admin/pages/LeadRadar.tsx',
        'src/admin/lib/api.ts',
        'src/shared/lead-radar.ts',
        'workers/automation-worker.ts',
        'workers/lead-radar-telegram-account',
        'tests/lead-radar*.test.ts',
        'scripts/lead-radar',
        'scripts/d1/audit-lead-radar-schema.ts',
        'scripts/d1/reconcile-lead-radar-0041.ts',
        '--max-warnings',
        '0',
      ],
      cwd: '.',
      safety: 'read_only',
    },
    {
      id: 'lead_radar_tests',
      executable: 'node',
      args: ['--import', 'tsx', '--test', ...leadRadarTests],
      cwd: '.',
      safety: 'read_only',
    },
    {
      id: 'telegram_windows_bridge_tests',
      executable: 'python3',
      args: [
        '-B', '-m', 'unittest', 'discover',
        '-s', 'tools/lead-radar-telegram-bridge/tests',
        '-p', 'test_*.py',
      ],
      cwd: '.',
      safety: 'read_only',
    },
    {
      id: 'secret_scan',
      executable: 'npm',
      args: ['run', 'scan:secrets'],
      cwd: '.',
      safety: 'read_only',
    },
    {
      id: 'secret_scan_self_tests',
      executable: 'node',
      args: ['--import', 'tsx', '--test', 'tests/secret-scan.test.ts'],
      cwd: '.',
      safety: 'read_only',
    },
    {
      id: 'cloudflare_pages_build',
      executable: 'npm',
      args: ['run', 'build:cf'],
      cwd: '.',
      safety: 'local_build',
    },
    {
      id: 'automation_worker_dry_run',
      executable: 'npx',
      args: [
        '--no-install',
        'wrangler',
        'deploy',
        '--dry-run',
        '--config',
        'wrangler.automation.toml',
        '--outdir',
        WORKER_OUTDIR_TOKEN,
      ],
      cwd: '.',
      safety: 'wrangler_dry_run',
    },
    {
      id: 'telegram_gateway_worker_dry_run',
      executable: 'npx',
      args: [
        '--no-install',
        'wrangler',
        'deploy',
        '--dry-run',
        '--config',
        'workers/lead-radar-telegram-account/wrangler.toml',
        '--outdir',
        TELEGRAM_GATEWAY_OUTDIR_TOKEN,
      ],
      cwd: '.',
      safety: 'wrangler_dry_run',
    },
  ];
}

function sameArgs(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function assertNoShellSyntax(command: GateCommand): void {
  const values = [command.executable, ...command.args];
  if (values.some((value) => /[;&|`$><\r\n\0]/.test(value))) {
    throw new Error(`unsafe_command_plan:${command.id}:shell_syntax`);
  }
}

/**
 * Fail closed if a future edit turns the release gate into a deployment or a
 * migration runner. Commands execute via spawn(shell=false), and every argv is
 * checked against an exact allowlist before the first child process starts.
 */
export function assertSafeCommandPlan(plan: GateCommand[]): void {
  const ids = new Set<string>();
  for (const command of plan) {
    if (ids.has(command.id)) throw new Error(`unsafe_command_plan:${command.id}:duplicate`);
    ids.add(command.id);
    assertNoShellSyntax(command);
    if (command.cwd !== '.') throw new Error(`unsafe_command_plan:${command.id}:cwd`);
    if (command.args.some((arg) => [
      '--apply',
      '--remote',
      '--force',
      '--production',
    ].includes(arg.toLowerCase()))) {
      throw new Error(`unsafe_command_plan:${command.id}:mutating_argument`);
    }

    let valid: boolean;
    switch (command.id) {
      case 'app_typecheck':
        valid = command.executable === 'npx'
          && sameArgs(command.args, ['--no-install', 'tsc', '-b', '--pretty', 'false'])
          && command.safety === 'read_only';
        break;
      case 'functions_typecheck_no_waivers':
        valid = command.executable === 'npx'
          && sameArgs(command.args, [
            '--no-install', 'tsc', '-p', 'tsconfig.functions.json',
            '--noEmit', '--pretty', 'false',
          ])
          && command.safety === 'read_only';
        break;
      case 'lead_radar_api_worker_ui_typecheck':
        valid = command.executable === 'npx'
          && sameArgs(command.args, [
            '--no-install', 'tsc', '-p', 'tsconfig.lead-radar.json',
            '--noEmit', '--pretty', 'false',
          ])
          && command.safety === 'read_only';
        break;
      case 'telegram_gateway_typecheck':
        valid = command.executable === 'npx'
          && sameArgs(command.args, [
            '--no-install', 'tsc', '-p',
            'workers/lead-radar-telegram-account/tsconfig.json',
            '--noEmit', '--pretty', 'false',
          ])
          && command.safety === 'read_only';
        break;
      case 'lead_radar_lint':
        valid = command.executable === 'npx'
          && sameArgs(command.args, [
            '--no-install', 'eslint',
            'functions/platform/lead-radar',
            'functions/api/admin/lead-radar',
            'functions/api/telegram/lead-radar-business.ts',
            'src/admin/components/lead-radar',
            'src/admin/pages/LeadRadar.tsx',
            'src/admin/lib/api.ts',
            'src/shared/lead-radar.ts',
            'workers/automation-worker.ts',
            'workers/lead-radar-telegram-account',
            'tests/lead-radar*.test.ts',
            'scripts/lead-radar',
            'scripts/d1/audit-lead-radar-schema.ts',
            'scripts/d1/reconcile-lead-radar-0041.ts',
            '--max-warnings', '0',
          ])
          && command.safety === 'read_only';
        break;
      case 'lead_radar_tests': {
        const files = command.args.slice(3);
        valid = command.executable === 'node'
          && sameArgs(command.args.slice(0, 3), ['--import', 'tsx', '--test'])
          && files.length > 0
          && files.includes('tests/lead-radar.test.ts')
          && files.every((file) => {
            const name = file.startsWith('tests/') ? file.slice('tests/'.length) : '';
            return isLeadRadarTestFilename(name);
          })
          && command.safety === 'read_only';
        break;
      }
      case 'telegram_windows_bridge_tests':
        valid = command.executable === 'python3'
          && sameArgs(command.args, [
            '-B', '-m', 'unittest', 'discover',
            '-s', 'tools/lead-radar-telegram-bridge/tests',
            '-p', 'test_*.py',
          ])
          && command.safety === 'read_only';
        break;
      case 'secret_scan':
        valid = command.executable === 'npm'
          && sameArgs(command.args, ['run', 'scan:secrets'])
          && command.safety === 'read_only';
        break;
      case 'secret_scan_self_tests':
        valid = command.executable === 'node'
          && sameArgs(command.args, [
            '--import', 'tsx', '--test', 'tests/secret-scan.test.ts',
          ])
          && command.safety === 'read_only';
        break;
      case 'cloudflare_pages_build':
        valid = command.executable === 'npm'
          && sameArgs(command.args, ['run', 'build:cf'])
          && command.safety === 'local_build';
        break;
      case 'automation_worker_dry_run':
        valid = command.executable === 'npx'
          && sameArgs(command.args, [
            '--no-install', 'wrangler', 'deploy', '--dry-run',
            '--config', 'wrangler.automation.toml',
            '--outdir', WORKER_OUTDIR_TOKEN,
          ])
          && command.safety === 'wrangler_dry_run';
        break;
      case 'telegram_gateway_worker_dry_run':
        valid = command.executable === 'npx'
          && sameArgs(command.args, [
            '--no-install', 'wrangler', 'deploy', '--dry-run',
            '--config',
            'workers/lead-radar-telegram-account/wrangler.toml',
            '--outdir', TELEGRAM_GATEWAY_OUTDIR_TOKEN,
          ])
          && command.safety === 'wrangler_dry_run';
        break;
      default: {
        const exhaustive: never = command.id;
        throw new Error(`unsafe_command_plan:unknown:${String(exhaustive)}`);
      }
    }
    if (!valid) throw new Error(`unsafe_command_plan:${command.id}:not_allowlisted`);
  }

  const requiredIds: GateCommand['id'][] = [
    'app_typecheck',
    'functions_typecheck_no_waivers',
    'lead_radar_api_worker_ui_typecheck',
    'telegram_gateway_typecheck',
    'lead_radar_lint',
    'lead_radar_tests',
    'telegram_windows_bridge_tests',
    'secret_scan',
    'secret_scan_self_tests',
    'cloudflare_pages_build',
    'automation_worker_dry_run',
    'telegram_gateway_worker_dry_run',
  ];
  if (plan.length !== requiredIds.length
    || requiredIds.some((id) => !ids.has(id))) {
    throw new Error('unsafe_command_plan:incomplete');
  }
}

function loadPackageScripts(absolute: string): Record<string, string> {
  try {
    const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8')) as {
      scripts?: unknown;
    };
    if (!parsed.scripts || typeof parsed.scripts !== 'object') {
      throw new Error('scripts_missing');
    }
    const result: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed.scripts)) {
      if (typeof value === 'string') result[name] = value;
    }
    return result;
  } catch {
    throw new Error('unsafe_package_script_graph:invalid_package');
  }
}

/**
 * `npm run` expands through a shell, so argv validation alone is insufficient.
 * Pin every transitively invoked project script to a reviewed local-build
 * command. A changed script blocks before any child process is started.
 */
export function assertSafePackageScriptGraph(root: string): void {
  const rootScripts = loadPackageScripts(path.join(root, 'package.json'));
  const adminScripts = loadPackageScripts(
    path.join(root, 'apps', 'bormi-admin', 'package.json'),
  );
  for (const [name, expected] of Object.entries(ALLOWLISTED_ROOT_SCRIPTS)) {
    if (rootScripts[name] !== expected) {
      throw new Error('unsafe_package_script_graph:root_script_changed');
    }
  }
  for (const [name, expected] of Object.entries(ALLOWLISTED_ADMIN_SCRIPTS)) {
    if (adminScripts[name] !== expected) {
      throw new Error('unsafe_package_script_graph:admin_script_changed');
    }
  }
}

const WRANGLER_DRY_RUN_CONFIGS = [
  'wrangler.automation.toml',
  'workers/lead-radar-telegram-account/wrangler.toml',
] as const;

/**
 * Wrangler's outer `--dry-run` is non-deploying, but a descriptor can still
 * define a local shell-backed build hook. Reject those hooks before spawning
 * Wrangler so the report's `shell_execution=false` statement remains true.
 */
export function assertSafeWranglerDryRunDescriptors(root: string): void {
  for (const relative of WRANGLER_DRY_RUN_CONFIGS) {
    const absolute = path.resolve(root, relative);
    const withinRoot = path.relative(path.resolve(root), absolute);
    if (!withinRoot || withinRoot.startsWith('..') || path.isAbsolute(withinRoot)) {
      throw new Error('unsafe_wrangler_descriptor:path');
    }
    let stat: fs.Stats;
    let source: string;
    try {
      stat = fs.lstatSync(absolute);
      source = fs.readFileSync(absolute, 'utf8');
    } catch {
      throw new Error('unsafe_wrangler_descriptor:missing');
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512_000) {
      throw new Error('unsafe_wrangler_descriptor:file');
    }
    const lines = source.replace(/\r\n?/gu, '\n').split('\n');
    if (lines.some((line) => (
      /^\s*\[(?:env\.[A-Za-z0-9_-]+\.)?build(?:\.[^\]]+)?\]\s*(?:#.*)?$/iu.test(line)
      || /^\s*build\s*=\s*\{/iu.test(line)
      || /^\s*(?:[A-Za-z0-9_-]+\.)*build\.command\s*=/iu.test(line)
      || /^\s*command\s*=/iu.test(line)
    ))) {
      throw new Error('unsafe_wrangler_descriptor:build_hook');
    }
  }
}

function walkFiles(absoluteRoot: string): string[] {
  if (!fs.existsSync(absoluteRoot)) return [];
  const rootStat = fs.lstatSync(absoluteRoot);
  if (rootStat.isSymbolicLink()) throw new Error('symlink_root');
  if (rootStat.isFile()) return [absoluteRoot];
  if (!rootStat.isDirectory()) return [];
  const found: string[] = [];
  const visit = (directory: string): void => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error('symlink_entry');
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile()) found.push(absolute);
    }
  };
  visit(absoluteRoot);
  return found;
}

function hashFiles(root: string, absoluteFiles: string[]): HashedFile[] {
  return absoluteFiles
    .map((absolute): HashedFile => {
      const bytes = fs.readFileSync(absolute);
      return {
        path: slash(path.relative(root, absolute)),
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function manifestHash(files: HashedFile[]): string {
  return sha256(files
    .map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`)
    .join(''));
}

function collectInputFiles(root: string): HashedFile[] {
  const absolute = new Set<string>();
  for (const relative of [...FIXED_INPUTS, ...OPTIONAL_MIGRATIONS]) {
    const candidate = path.join(root, relative);
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isFile()) absolute.add(candidate);
  }
  for (const tree of [
    'functions/platform/lead-radar',
    'scripts/lead-radar',
    'tools/lead-radar-telegram-bridge',
    'workers/lead-radar-telegram-account',
  ]) {
    const treeRoot = path.join(root, tree);
    for (const candidate of walkFiles(treeRoot)) {
      const relative = slash(path.relative(treeRoot, candidate));
      if ((tree === 'workers/lead-radar-telegram-account'
          && relative.startsWith('.wrangler/'))
        || relative.startsWith('__pycache__/')
        || relative.includes('/__pycache__/')
        || /\.(?:pyc|pyo)$/u.test(relative)
        || relative.endsWith('/.tmp-bridge-lock')
        || relative === '.tmp-bridge-lock') continue;
      absolute.add(candidate);
    }
  }
  for (const testFile of discoverLeadRadarTests(root)) {
    const candidate = path.join(root, testFile);
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isFile()) absolute.add(candidate);
  }
  return hashFiles(root, [...absolute]);
}

function collectArtifactSet(
  id: ArtifactSet['id'],
  displayRoot: ArtifactSet['root'],
  absoluteRoot: string,
): ArtifactSet {
  if (!fs.existsSync(absoluteRoot)) {
    return { id, root: displayRoot, status: 'missing', sha256: null, files: [] };
  }
  try {
    const files = hashFiles(absoluteRoot, walkFiles(absoluteRoot));
    if (files.length === 0) {
      return { id, root: displayRoot, status: 'missing', sha256: null, files: [] };
    }
    return {
      id,
      root: displayRoot,
      status: 'hashed',
      sha256: manifestHash(files),
      files,
    };
  } catch {
    return { id, root: displayRoot, status: 'unsafe', sha256: null, files: [] };
  }
}

function notRunArtifact(
  id: ArtifactSet['id'],
  root: ArtifactSet['root'],
): ArtifactSet {
  return { id, root, status: 'not_run', sha256: null, files: [] };
}

function artifactManifestHash(artifacts: ArtifactSet[]): string {
  return sha256(artifacts
    .map((artifact) => [
      artifact.id,
      artifact.root,
      artifact.status,
      artifact.sha256 ?? '-',
    ].join('\0'))
    .join('\n'));
}

function assertOwnedTemporaryDirectory(directory: string): void {
  const tempRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(directory);
  const relative = path.relative(tempRoot, resolved);
  if (!relative
    || relative.startsWith('..')
    || path.isAbsolute(relative)
    || !path.basename(resolved).startsWith('gptbot-lead-radar-gate-')) {
    throw new Error('unsafe_temporary_directory');
  }
}

function createTemporaryDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gptbot-lead-radar-gate-'));
}

function removeOwnedTemporaryDirectory(directory: string): void {
  assertOwnedTemporaryDirectory(directory);
  fs.rmSync(directory, { recursive: true, force: true });
}

function plannedResult(command: GateCommand): GateCommandResult {
  return {
    id: command.id,
    status: 'planned',
    exit_code: null,
    executable: command.executable,
    args: [...command.args],
    cwd: command.cwd,
    safety: command.safety,
  };
}

function finalStatus(
  mode: ReleaseGateMode,
  commands: GateCommandResult[],
  artifacts: ArtifactSet[],
): { status: ReleaseGateStatus; complete: boolean; reasons: string[] } {
  if (mode === 'plan') {
    return { status: 'red', complete: false, reasons: ['execution_not_requested'] };
  }
  const reasons = [
    ...commands
      .filter((command) => command.status !== 'pass')
      .map((command) => `command_failed:${command.id}`),
    ...artifacts
      .filter((artifact) => artifact.status !== 'hashed')
      .map((artifact) => `artifact_unavailable:${artifact.id}:${artifact.status}`),
  ].sort((left, right) => left.localeCompare(right));
  return {
    status: reasons.length === 0 ? 'green' : 'red',
    complete: true,
    reasons,
  };
}

export async function runReleaseGate(
  options: RunReleaseGateOptions = {},
): Promise<ReleaseGateReport> {
  const root = path.resolve(options.root ?? REPOSITORY_ROOT);
  const mode = options.mode ?? 'plan';
  const runner = options.runner ?? new SpawnCommandRunner();
  const plan = createCommandPlan(root);
  assertSafeCommandPlan(plan);
  assertSafePackageScriptGraph(root);
  assertSafeWranglerDryRunDescriptors(root);
  const inputs = collectInputFiles(root);

  if (mode === 'plan') {
    const commands = plan.map(plannedResult);
    const artifacts = [
      notRunArtifact('cloudflare_pages_dist', 'dist'),
      notRunArtifact('automation_worker_bundle', 'temporary-worker-dry-run-output'),
      notRunArtifact(
        'telegram_account_gateway_bundle',
        'temporary-telegram-account-gateway-dry-run-output',
      ),
    ];
    const state = finalStatus(mode, commands, artifacts);
    return {
      schema: RELEASE_GATE_SCHEMA,
      ...state,
      mode,
      safety: {
        remote_writes: false,
        deployments: false,
        migrations_applied: false,
        shell_execution: false,
      },
      input_manifest_sha256: manifestHash(inputs),
      inputs,
      commands,
      artifact_manifest_sha256: artifactManifestHash(artifacts),
      artifacts,
    };
  }

  const temporaryDirectory = (options.temporaryDirectoryFactory
    ?? createTemporaryDirectory)();
  assertOwnedTemporaryDirectory(temporaryDirectory);
  const automationWorkerOutdir = path.join(temporaryDirectory, 'automation-worker');
  const telegramGatewayOutdir = path.join(temporaryDirectory, 'telegram-account-gateway');
  const commandResults: GateCommandResult[] = [];
  let artifacts: ArtifactSet[];
  try {
    for (const command of plan) {
      const runnable: RunnableGateCommand = {
        ...command,
        args: command.args.map((arg) => (
          arg === WORKER_OUTDIR_TOKEN
            ? automationWorkerOutdir
            : arg === TELEGRAM_GATEWAY_OUTDIR_TOKEN ? telegramGatewayOutdir : arg
        )),
      };
      let exitCode = 1;
      try {
        exitCode = (await runner.run(runnable, root)).exitCode;
      } catch {
        exitCode = 1;
      }
      commandResults.push({
        ...plannedResult(command),
        status: exitCode === 0 ? 'pass' : 'fail',
        exit_code: exitCode,
      });
    }

    const byId = new Map(commandResults.map((result) => [result.id, result]));
    artifacts = [
      byId.get('cloudflare_pages_build')?.status === 'pass'
        ? collectArtifactSet('cloudflare_pages_dist', 'dist', path.join(root, 'dist'))
        : notRunArtifact('cloudflare_pages_dist', 'dist'),
      byId.get('automation_worker_dry_run')?.status === 'pass'
        ? collectArtifactSet(
          'automation_worker_bundle',
          'temporary-worker-dry-run-output',
          automationWorkerOutdir,
        )
        : notRunArtifact(
          'automation_worker_bundle',
          'temporary-worker-dry-run-output',
        ),
      byId.get('telegram_gateway_worker_dry_run')?.status === 'pass'
        ? collectArtifactSet(
          'telegram_account_gateway_bundle',
          'temporary-telegram-account-gateway-dry-run-output',
          telegramGatewayOutdir,
        )
        : notRunArtifact(
          'telegram_account_gateway_bundle',
          'temporary-telegram-account-gateway-dry-run-output',
        ),
    ];
  } finally {
    removeOwnedTemporaryDirectory(temporaryDirectory);
  }

  const state = finalStatus(mode, commandResults, artifacts);
  return {
    schema: RELEASE_GATE_SCHEMA,
    ...state,
    mode,
    safety: {
      remote_writes: false,
      deployments: false,
      migrations_applied: false,
      shell_execution: false,
    },
    input_manifest_sha256: manifestHash(inputs),
    inputs,
    commands: commandResults,
    artifact_manifest_sha256: artifactManifestHash(artifacts),
    artifacts,
  };
}

function validateReportPath(relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('\0')) {
    throw new Error('unsafe_report_path');
  }
  const segments = relativePath.split(/[\\/]/);
  if (
    !['reports', 'work'].includes(segments[0] ?? '')
    || segments.some((segment) => !segment || segment === '.' || segment === '..')
    || path.extname(relativePath).toLowerCase() !== '.json'
  ) {
    throw new Error('unsafe_report_path');
  }
  return segments.join(path.sep);
}

export function parseCliArgs(args: string[]): CliOptions {
  let mode: ReleaseGateMode = 'plan';
  let modeSeen = false;
  let reportPath = DEFAULT_REPORT_PATH;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--plan' || arg === '--execute') {
      if (modeSeen) throw new Error('unsafe_or_unknown_argument');
      modeSeen = true;
      mode = arg === '--execute' ? 'execute' : 'plan';
      continue;
    }
    if (arg === '--report') {
      const value = args[index + 1];
      if (!value) throw new Error('unsafe_or_unknown_argument');
      reportPath = validateReportPath(value);
      index += 1;
      continue;
    }
    // Do not echo unknown argv: it could itself contain a pasted secret.
    throw new Error('unsafe_or_unknown_argument');
  }
  return { mode, reportPath };
}

export function serializeReport(report: ReleaseGateReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function writeReport(
  root: string,
  relativePath: string,
  report: ReleaseGateReport,
): string {
  const safeRelative = validateReportPath(relativePath);
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, safeRelative);
  const relative = path.relative(absoluteRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('unsafe_report_path');
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, serializeReport(report), 'utf8');
  return absolute;
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const report = await runReleaseGate({ mode: options.mode });
  writeReport(REPOSITORY_ROOT, options.reportPath, report);
  process.stdout.write(serializeReport(report));
  if (options.mode === 'execute' && report.status !== 'green') process.exitCode = 1;
}

const direct = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (direct) {
  main().catch((error: unknown) => {
    const code = error instanceof Error && error.message.startsWith('unsafe_')
      ? error.message
      : 'release_gate_failed';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
