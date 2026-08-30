import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  assertSafeCommandPlan,
  assertSafePackageScriptGraph,
  assertSafeWranglerDryRunDescriptors,
  createCommandPlan,
  DEFAULT_REPORT_PATH,
  parseCliArgs,
  resolveGateCommandInvocation,
  runReleaseGate,
  serializeReport,
  TELEGRAM_GATEWAY_OUTDIR_TOKEN,
  WORKER_OUTDIR_TOKEN,
  type CommandRunner,
  type GateCommand,
  type RunnableGateCommand,
} from '../scripts/lead-radar/release-gate.ts';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeFixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gptbot-lead-radar-test-'));
  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      private: true,
      scripts: {
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
      },
    }, null, 2) + '\n',
    'apps/bormi-admin/package.json': JSON.stringify({
      private: true,
      scripts: { build: 'tsc -b && vite build' },
    }, null, 2) + '\n',
    'yarn.lock': '# synthetic\n',
    'tsconfig.json': '{}\n',
    'tsconfig.app.json': '{}\n',
    'tsconfig.functions.json': '{}\n',
    'tsconfig.lead-radar.json': '{}\n',
    'wrangler.automation.toml': 'name = "synthetic"\n',
    'workers/automation-worker.ts': 'export default {};\n',
    'workers/lead-radar-telegram-account/tsconfig.json': '{}\n',
    'workers/lead-radar-telegram-account/wrangler.toml': 'name = "synthetic-gateway"\n',
    'workers/lead-radar-telegram-account/index.ts': 'export default {};\n',
    'workers/lead-radar-telegram-account/bridge-mailbox.ts': 'export const mailbox = true;\n',
    'workers/lead-radar-telegram-account/bridge-protocol.ts': 'export const protocol = true;\n',
    'tools/lead-radar-telegram-bridge/pyproject.toml': '[project]\nname="fixture"\n',
    'tools/lead-radar-telegram-bridge/requirements.lock': 'fixture==1 --hash=sha256:fixture\n',
    'tools/lead-radar-telegram-bridge/requirements-ci.lock': 'fixture==1 --hash=sha256:fixture\n',
    'tools/lead-radar-telegram-bridge/lead_radar_bridge/__init__.py': '# package\n',
    'tools/lead-radar-telegram-bridge/lead_radar_bridge/cli.py': '# cli\n',
    'tools/lead-radar-telegram-bridge/lead_radar_bridge/e2e.py': '# e2e\n',
    'tools/lead-radar-telegram-bridge/lead_radar_bridge/installer.py': '# installer\n',
    'tools/lead-radar-telegram-bridge/lead_radar_bridge/ledger.py': '# ledger\n',
    'tools/lead-radar-telegram-bridge/lead_radar_bridge/mailbox.py': '# mailbox\n',
    'tools/lead-radar-telegram-bridge/lead_radar_bridge/protocol.py': '# protocol\n',
    'tools/lead-radar-telegram-bridge/lead_radar_bridge/runtime.py': '# runtime\n',
    'tools/lead-radar-telegram-bridge/lead_radar_bridge/security.py': '# security\n',
    'tools/lead-radar-telegram-bridge/lead_radar_bridge/single_instance.py': '# mutex\n',
    'tools/lead-radar-telegram-bridge/lead_radar_bridge/telegram_adapter.py': '# adapter\n',
    'tools/lead-radar-telegram-bridge/tests/test_bridge_protocol.py': '# protocol tests\n',
    'tools/lead-radar-telegram-bridge/tests/test_bridge_runtime.py': '# runtime tests\n',
    'tools/lead-radar-telegram-bridge/tests/test_bridge_telegram_adapter.py': '# adapter tests\n',
    'tools/lead-radar-telegram-bridge/lead_radar_bridge/__pycache__/cli.pyc': 'generated\n',
    'tools/lead-radar-telegram-bridge/.tmp-bridge-lock': 'generated\n',
    'workers/lead-radar-telegram-account/.wrangler/generated.js': 'secret build path\n',
    'workers/lead-radar-telegram-account/container/__pycache__/server.pyc': 'generated\n',
    'functions/_types.ts': 'export interface Env {}\n',
    'functions/api/admin/lead-radar/[[path]].ts': 'export const safe = true;\n',
    'functions/platform/lead-radar/index.ts': 'export const safe = true;\n',
    'src/admin/lib/api.ts': 'export const api = {};\n',
    'src/admin/pages/LeadRadar.tsx': 'export default function LeadRadar() { return null; }\n',
    'src/shared/lead-radar.ts': 'export interface Lead {}\n',
    'tests/lead-radar.test.ts': '// synthetic base suite\n',
    'tests/lead-radar-schema-manifest.test.ts': '// synthetic schema audit\n',
    'tests/lead-radar-release-gate.test.ts': '// must not recurse\n',
  };
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents, 'utf8');
  }
  return root;
}

function removeFixtureRoot(root: string): void {
  const resolved = path.resolve(root);
  const tempRoot = path.resolve(os.tmpdir());
  const relative = path.relative(tempRoot, resolved);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  assert.ok(path.basename(resolved).startsWith('gptbot-lead-radar-test-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}

function temporaryWorkerDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gptbot-lead-radar-gate-'));
}

class FixtureRunner implements CommandRunner {
  readonly calls: RunnableGateCommand[] = [];

  constructor(private readonly failingId?: GateCommand['id']) {}

  async run(command: RunnableGateCommand, root: string): Promise<{ exitCode: number }> {
    this.calls.push(command);
    if (command.id === 'cloudflare_pages_build') {
      fs.mkdirSync(path.join(root, 'dist', 'assets'), { recursive: true });
      fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<main>Lead Radar</main>\n');
      fs.writeFileSync(path.join(root, 'dist', 'assets', 'app.js'), 'export const ready=true;\n');
    }
    if (command.id === 'automation_worker_dry_run') {
      const marker = command.args.indexOf('--outdir');
      assert.ok(marker >= 0);
      const outdir = command.args[marker + 1];
      assert.notEqual(outdir, WORKER_OUTDIR_TOKEN);
      fs.mkdirSync(outdir, { recursive: true });
      fs.writeFileSync(path.join(outdir, 'worker.js'), 'export default {fetch(){}};\n');
    }
    if (command.id === 'telegram_gateway_worker_dry_run') {
      const marker = command.args.indexOf('--outdir');
      assert.ok(marker >= 0);
      const outdir = command.args[marker + 1];
      assert.notEqual(outdir, TELEGRAM_GATEWAY_OUTDIR_TOKEN);
      fs.mkdirSync(outdir, { recursive: true });
      fs.writeFileSync(
        path.join(outdir, 'gateway.js'),
        'export default {fetch(){return new Response(null,{status:404})}};\n',
      );
    }
    return { exitCode: command.id === this.failingId ? 2 : 0 };
  }
}

test('the plan is complete, read-only/locally bounded, and discovers schema audits', () => {
  const root = makeFixtureRoot();
  try {
    const plan = createCommandPlan(root);
    assertSafeCommandPlan(plan);
    assert.deepEqual(plan.map((command) => command.id), [
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
    ]);

    const tests = plan.find((command) => command.id === 'lead_radar_tests');
    assert.ok(tests?.args.includes('tests/lead-radar.test.ts'));
    assert.ok(tests?.args.includes('tests/lead-radar-schema-manifest.test.ts'));
    assert.ok(!tests?.args.includes('tests/lead-radar-release-gate.test.ts'));

    const functions = plan.find(
      (command) => command.id === 'functions_typecheck_no_waivers',
    );
    assert.deepEqual(functions?.args, [
      '--no-install',
      'tsc',
      '-p',
      'tsconfig.functions.json',
      '--noEmit',
      '--pretty',
      'false',
    ]);

    const gatewayTypecheck = plan.find(
      (command) => command.id === 'telegram_gateway_typecheck',
    );
    assert.deepEqual(gatewayTypecheck?.args, [
      '--no-install',
      'tsc',
      '-p',
      'workers/lead-radar-telegram-account/tsconfig.json',
      '--noEmit',
      '--pretty',
      'false',
    ]);

    const bridgeTests = plan.find(
      (command) => command.id === 'telegram_windows_bridge_tests',
    );
    assert.equal(bridgeTests?.executable, 'python3');
    assert.deepEqual(bridgeTests?.args, [
      '-B', '-m', 'unittest', 'discover',
      '-s', 'tools/lead-radar-telegram-bridge/tests', '-p', 'test_*.py',
    ]);

    const worker = plan.find((command) => command.id === 'automation_worker_dry_run');
    assert.deepEqual(worker?.args, [
      '--no-install',
      'wrangler',
      'deploy',
      '--dry-run',
      '--config',
      'wrangler.automation.toml',
      '--outdir',
      WORKER_OUTDIR_TOKEN,
    ]);

    const gatewayWorker = plan.find(
      (command) => command.id === 'telegram_gateway_worker_dry_run',
    );
    assert.deepEqual(gatewayWorker?.args, [
      '--no-install',
      'wrangler',
      'deploy',
      '--dry-run',
      '--config',
      'workers/lead-radar-telegram-account/wrangler.toml',
      '--outdir',
      TELEGRAM_GATEWAY_OUTDIR_TOKEN,
    ]);
    assert.equal(plan.some((command) => command.args.includes('--remote')), false);
    assert.equal(plan.some((command) => command.args.includes('--apply')), false);
  } finally {
    removeFixtureRoot(root);
  }
});

test('the logical Python command resolves without npm or a shell on every platform', () => {
  assert.deepEqual(resolveGateCommandInvocation('python3', 'linux', ''), {
    executable: 'python3',
    prefix: [],
  });
  assert.deepEqual(resolveGateCommandInvocation('python3', 'win32', ''), {
    executable: 'py',
    prefix: ['-3.12'],
  });
});

test('Bridge tests can use an explicit isolated Python without accepting a shell command', () => {
  const isolated='C:\\BridgeRuntime\\venv\\Scripts\\python.exe';
  assert.deepEqual(resolveGateCommandInvocation('python3','win32',isolated),{executable:isolated,prefix:[]});
  assert.throws(()=>resolveGateCommandInvocation('python3','win32','python.exe'),/unsafe_bridge_python_path/);
  assert.throws(()=>resolveGateCommandInvocation('python3','win32','C:\\Windows\\cmd.exe'),/unsafe_bridge_python_path/);
  assert.throws(()=>resolveGateCommandInvocation('python3','linux','/usr/bin/python3 -c payload'),/unsafe_bridge_python_path/);
});

test('static validation rejects a deploy without dry-run and every mutating flag', () => {
  const root = makeFixtureRoot();
  try {
    const missingDryRun = structuredClone(createCommandPlan(root));
    const worker = missingDryRun.find(
      (command) => command.id === 'automation_worker_dry_run',
    );
    assert.ok(worker);
    worker.args = worker.args.filter((arg) => arg !== '--dry-run');
    assert.throws(() => assertSafeCommandPlan(missingDryRun), /unsafe_command_plan/);

    const unsafeGatewayRollout = structuredClone(createCommandPlan(root));
    const gatewayWorker = unsafeGatewayRollout.find(
      (command) => command.id === 'telegram_gateway_worker_dry_run',
    );
    assert.ok(gatewayWorker);
    gatewayWorker.args = gatewayWorker.args.filter((arg) => arg !== '--dry-run');
    assert.throws(
      () => assertSafeCommandPlan(unsafeGatewayRollout),
      /unsafe_command_plan/,
    );

    for (const flag of ['--remote', '--apply', '--force', '--production']) {
      const unsafe = structuredClone(createCommandPlan(root));
      unsafe[0].args.push(flag);
      assert.throws(
        () => assertSafeCommandPlan(unsafe),
        /unsafe_command_plan/,
        flag,
      );
    }

    const shellSyntax = structuredClone(createCommandPlan(root));
    shellSyntax[0].args.push('&&');
    assert.throws(() => assertSafeCommandPlan(shellSyntax), /shell_syntax/);
  } finally {
    removeFixtureRoot(root);
  }
});

test('gateway checks are immutable and Bridge discovery cannot be changed', () => {
  const root = makeFixtureRoot();
  try {
    for (const id of [
      'telegram_gateway_typecheck',
      'telegram_windows_bridge_tests',
      'telegram_gateway_worker_dry_run',
    ] satisfies GateCommand['id'][]) {
      const incomplete = createCommandPlan(root).filter((command) => command.id !== id);
      assert.throws(
        () => assertSafeCommandPlan(incomplete),
        /unsafe_command_plan:incomplete/,
        id,
      );
    }

    const alteredDiscovery = structuredClone(createCommandPlan(root));
    const command = alteredDiscovery.find(
      (candidate) => candidate.id === 'telegram_windows_bridge_tests',
    );
    assert.ok(command);
    command.args[command.args.length - 1] = 'test_runtime.py';
    assert.throws(
      () => assertSafeCommandPlan(alteredDiscovery),
      /unsafe_command_plan:telegram_windows_bridge_tests:not_allowlisted/,
    );
  } finally {
    removeFixtureRoot(root);
  }
});

test('transitive npm scripts are pinned and cannot hide a deployment', () => {
  const root = makeFixtureRoot();
  try {
    assert.doesNotThrow(() => assertSafePackageScriptGraph(root));
    const packagePath = path.join(root, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts['build:cf'] = 'vite build && wrangler deploy';
    fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    assert.throws(
      () => assertSafePackageScriptGraph(root),
      /unsafe_package_script_graph/,
    );
  } finally {
    removeFixtureRoot(root);
  }
});

test('Wrangler dry-runs reject transitive shell build hooks before execution', async () => {
  const root = makeFixtureRoot();
  try {
    assert.doesNotThrow(() => assertSafeWranglerDryRunDescriptors(root));
    const gatewayConfig = path.join(
      root,
      'workers',
      'lead-radar-telegram-account',
      'wrangler.toml',
    );
    fs.writeFileSync(gatewayConfig, [
      'name = "synthetic-gateway"',
      '[build]',
      'command = "node scripts/unreviewed-build.js"',
      '',
    ].join('\n'));
    assert.throws(
      () => assertSafeWranglerDryRunDescriptors(root),
      /unsafe_wrangler_descriptor:build_hook/,
    );
    const runner = new FixtureRunner();
    await assert.rejects(
      runReleaseGate({ root, mode: 'execute', runner }),
      /unsafe_wrangler_descriptor:build_hook/,
    );
    assert.equal(runner.calls.length, 0);
  } finally {
    removeFixtureRoot(root);
  }
});

test('CLI accepts only explicit local modes and workspace JSON report paths', () => {
  assert.deepEqual(parseCliArgs([]), {
    mode: 'plan',
    reportPath: DEFAULT_REPORT_PATH,
  });
  assert.deepEqual(parseCliArgs([
    '--execute',
    '--report',
    'work/lead-radar/gate.json',
  ]), {
    mode: 'execute',
    reportPath: path.join('work', 'lead-radar', 'gate.json'),
  });

  for (const args of [
    ['--deploy'],
    ['--apply'],
    ['--remote'],
    ['--execute', '--plan'],
    ['--report', '../outside.json'],
    ['--report', path.resolve(os.tmpdir(), 'outside.json')],
    ['--report', 'reports/not-json.txt'],
  ]) {
    assert.throws(() => parseCliArgs(args), /unsafe_/);
  }
});

test('fake execution produces a deterministic green report with exact hashes', async () => {
  const root = makeFixtureRoot();
  try {
    const firstRunner = new FixtureRunner();
    const first = await runReleaseGate({
      root,
      mode: 'execute',
      runner: firstRunner,
      temporaryDirectoryFactory: temporaryWorkerDirectory,
    });
    const second = await runReleaseGate({
      root,
      mode: 'execute',
      runner: new FixtureRunner(),
      temporaryDirectoryFactory: temporaryWorkerDirectory,
    });

    assert.equal(first.status, 'green');
    assert.equal(first.schema, 'gptbot.lead-radar.release-gate.v2');
    assert.equal(first.complete, true);
    assert.deepEqual(first.reasons, []);
    assert.deepEqual(first, second);
    assert.equal(firstRunner.calls.length, 12);
    for (const id of [
      'telegram_gateway_typecheck',
      'telegram_windows_bridge_tests',
      'telegram_gateway_worker_dry_run',
    ] satisfies GateCommand['id'][]) {
      assert.equal(
        first.commands.find((command) => command.id === id)?.status,
        'pass',
        id,
      );
    }
    assert.equal(first.safety.remote_writes, false);
    assert.equal(first.safety.deployments, false);
    assert.equal(first.safety.migrations_applied, false);
    assert.equal(first.safety.shell_execution, false);
    assert.ok(!serializeReport(first).match(/timestamp|duration|temporary.*[\\/]tmp/i));

    const pages = first.artifacts.find(
      (artifact) => artifact.id === 'cloudflare_pages_dist',
    );
    assert.equal(pages?.status, 'hashed');
    assert.deepEqual(pages?.files.map((file) => file.path), [
      'assets/app.js',
      'index.html',
    ]);
    assert.equal(
      pages?.files.find((file) => file.path === 'index.html')?.sha256,
      sha256('<main>Lead Radar</main>\n'),
    );

    const worker = first.artifacts.find(
      (artifact) => artifact.id === 'automation_worker_bundle',
    );
    assert.equal(worker?.status, 'hashed');
    assert.equal(worker?.files[0]?.path, 'worker.js');
    assert.equal(
      worker?.files[0]?.sha256,
      sha256('export default {fetch(){}};\n'),
    );
    const gateway = first.artifacts.find(
      (artifact) => artifact.id === 'telegram_account_gateway_bundle',
    );
    assert.equal(gateway?.status, 'hashed');
    assert.equal(gateway?.files[0]?.path, 'gateway.js');
    assert.equal(
      gateway?.files[0]?.sha256,
      sha256('export default {fetch(){return new Response(null,{status:404})}};\n'),
    );
    assert.match(first.artifact_manifest_sha256, /^[a-f0-9]{64}$/);
    assert.match(first.input_manifest_sha256, /^[a-f0-9]{64}$/);
    assert.ok(first.inputs.some((input) => (
      input.path === 'workers/lead-radar-telegram-account/index.ts'
    )));
    assert.ok(first.inputs.some((input) => (
      input.path === 'workers/lead-radar-telegram-account/bridge-mailbox.ts'
    )));
    assert.ok(first.inputs.some((input) => (
      input.path === 'tools/lead-radar-telegram-bridge/requirements.lock'
    )));
    assert.ok(first.inputs.some((input) => (
      input.path === 'tools/lead-radar-telegram-bridge/requirements-ci.lock'
    )));
    for (const module of [
      '__init__.py', 'cli.py', 'e2e.py', 'installer.py', 'ledger.py',
      'mailbox.py', 'protocol.py', 'runtime.py', 'security.py',
      'single_instance.py', 'telegram_adapter.py',
    ]) {
      assert.ok(first.inputs.some((input) => (
        input.path === `tools/lead-radar-telegram-bridge/lead_radar_bridge/${module}`
      )), `missing Bridge input: ${module}`);
    }
    assert.equal(first.inputs.some((input) => (
      input.path.includes('/.wrangler/')
        || input.path.includes('/__pycache__/')
        || input.path.endsWith('/.tmp-bridge-lock')
    )), false);
  } finally {
    removeFixtureRoot(root);
  }
});

test('a global Functions error remains an explicit red release blocker', async () => {
  const root = makeFixtureRoot();
  try {
    const report = await runReleaseGate({
      root,
      mode: 'execute',
      runner: new FixtureRunner('functions_typecheck_no_waivers'),
      temporaryDirectoryFactory: temporaryWorkerDirectory,
    });
    assert.equal(report.status, 'red');
    assert.deepEqual(report.reasons, [
      'command_failed:functions_typecheck_no_waivers',
    ]);
    assert.equal(
      report.commands.find(
        (command) => command.id === 'functions_typecheck_no_waivers',
      )?.exit_code,
      2,
    );
    assert.equal(
      report.commands.find(
        (command) => command.id === 'lead_radar_api_worker_ui_typecheck',
      )?.status,
      'pass',
    );
  } finally {
    removeFixtureRoot(root);
  }
});

test('every required gateway command failure makes the report red', async () => {
  const root = makeFixtureRoot();
  try {
    for (const id of [
      'telegram_gateway_typecheck',
      'telegram_windows_bridge_tests',
      'telegram_gateway_worker_dry_run',
    ] satisfies GateCommand['id'][]) {
      const report = await runReleaseGate({
        root,
        mode: 'execute',
        runner: new FixtureRunner(id),
        temporaryDirectoryFactory: temporaryWorkerDirectory,
      });
      assert.equal(report.status, 'red', id);
      assert.equal(report.complete, true, id);
      assert.ok(report.reasons.includes(`command_failed:${id}`), id);
      assert.equal(
        report.commands.find((command) => command.id === id)?.status,
        'fail',
        id,
      );
      assert.equal(
        report.commands.find((command) => command.id === id)?.exit_code,
        2,
        id,
      );
    }
  } finally {
    removeFixtureRoot(root);
  }
});

test('plan mode is machine-readable red and runs no commands', async () => {
  const root = makeFixtureRoot();
  try {
    const runner = new FixtureRunner();
    const report = await runReleaseGate({ root, mode: 'plan', runner });
    assert.equal(report.status, 'red');
    assert.equal(report.complete, false);
    assert.deepEqual(report.reasons, ['execution_not_requested']);
    assert.equal(runner.calls.length, 0);
    assert.ok(report.commands.every((command) => command.status === 'planned'));
    assert.ok(report.artifacts.every((artifact) => artifact.status === 'not_run'));
    assert.doesNotThrow(() => JSON.parse(serializeReport(report)));
  } finally {
    removeFixtureRoot(root);
  }
});
