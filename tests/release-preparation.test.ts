import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  isUsableSotuvchiBotUsername,
  SOTUVCHI_SELLER_START_PAYLOAD,
} from '../src/shared/sotuvchi-config';
import { scanText, EXEMPT_FILES } from '../scripts/scan-secrets';
import { runTelegramAgentsSetup } from '../scripts/telegram-agents-setup';
import {
  loadEnvironmentContract,
  validateContractStructure,
  validateProductionEnvironment,
} from '../scripts/release/env-contract';
import {
  loadMigrationManifest,
  migrationsContainExecutableDestructiveSql,
  runMigrationRehearsal,
  sha256File,
} from '../scripts/release/migration-rehearsal';
import { runBackupRestoreRehearsal } from '../scripts/release/backup-restore-rehearsal';
import { runDeploymentDryRun } from '../scripts/release/deployment-dry-run';
import { runSmoke } from '../scripts/release/smoke';

const ROOT = path.resolve(import.meta.dirname, '..');
const RELEASE_ROOT = path.join(ROOT, 'docs', 'agents-platform', 'release');
const FORBIDDEN_PATHS = [
  'memory/test_credentials.md',
  'gptbot-audit/memory/test_credentials.md',
  'gptbot-audit/gptbot-audit/memory/test_credentials.md',
  'repo/memory/test_credentials.md',
  'repo/repo/memory/test_credentials.md',
];

test('all five incident credential paths are absent and untracked', () => {
  const tracked = execFileSync('git', ['ls-files'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).split(/\r?\n/);
  for (const relative of FORBIDDEN_PATHS) {
    assert.ok(!fs.existsSync(path.join(ROOT, relative)), relative);
    assert.ok(!tracked.includes(relative), relative);
  }
});

test('the scanner catches the incident shape and returns only redacted metadata', () => {
  const synthetic = ['Qz7Lm2', 'Nr8Vp4', 'Xs6Tk9', 'Ba3Hd5'].join('');
  const findings = scanText(
    ['memory', 'test_' + 'credentials.md'].join('/'),
    ['ADMIN_', 'PASSWORD: '].join('') + synthetic,
  );
  assert.equal(findings.length, 1);
  assert.deepEqual(Object.keys(findings[0]).sort(), [
    'file',
    'line',
    'rule',
    'severity',
  ]);
  assert.ok(!JSON.stringify(findings).includes(synthetic));
});

test('the secret scanner has no broad exemption', () => {
  assert.ok(EXEMPT_FILES.size <= 5);
  for (const [file, reason] of EXEMPT_FILES) {
    assert.ok(!file.includes('*'), file);
    assert.ok(!file.endsWith('/'), file);
    assert.ok(reason.length > 15, file);
  }
});

test('the environment contract is names-only, complete and structurally valid', () => {
  const contract = loadEnvironmentContract();
  const report = validateContractStructure(contract);
  assert.equal(report.status, 'pass');
  assert.equal(contract.value_policy, 'names_only');
  for (const required of [
    'GPTBOT_DRAFTS_DB',
    'ADMIN_PASSWORD_HASH',
    'JWT_SECRET',
    'TURNSTILE_SECRET_KEY',
    'RAILWAY_GPT_API_URL',
    'GPTBOT_INTERNAL_API_SECRET',
    'OPENROUTER_API_KEY',
    'TELEGRAM_AGENTS_BOT_TOKEN',
    'TELEGRAM_AGENTS_WEBHOOK_SECRET',
    'TELEGRAM_AGENTS_BOT_USERNAME',
  ]) {
    assert.ok(contract.variables.some((item) => item.name === required), required);
  }
});

test('secret classification and Telegram product boundaries are explicit', () => {
  const contract = loadEnvironmentContract();
  const byName = new Map(contract.variables.map((item) => [item.name, item]));
  assert.equal(byName.get('ADMIN_PASSWORD_HASH')?.secret, true);
  assert.equal(byName.get('TELEGRAM_AGENTS_BOT_USERNAME')?.secret, false);
  assert.notEqual(
    contract.bot_identities.lead.transport,
    contract.bot_identities.agents.transport,
  );
  assert.notEqual(
    contract.bot_identities.javob.webhook_secret,
    contract.bot_identities.agents.webhook_secret,
  );
  assert.equal(contract.bot_identities.tahlil.shared_transport_with, 'javob');
  assert.notEqual(
    contract.bot_identities.tahlil.business_flow,
    contract.bot_identities.javob.business_flow,
  );
});

test('placeholders, invalid URLs and production plain passwords fail closed', () => {
  const report = validateProductionEnvironment({
    SITE_URL: 'http://example.invalid',
    ADMIN_PASSWORD: 'must-not-exist',
    FIRST_PARTY_AUTOMATION_ENABLED: 'enabled',
    TELEGRAM_AGENTS_BOT_USERNAME: 'aidirectprobot',
  });
  assert.equal(report.status, 'blocked');
  assert.ok(report.checks.some((check) =>
    check.name === 'env:SITE_URL' && !check.ok));
  assert.ok(report.checks.some((check) =>
    check.name === 'env:ADMIN_PASSWORD' && !check.ok));
  assert.ok(report.checks.some((check) =>
    check.name === 'env:FIRST_PARTY_AUTOMATION_ENABLED' && !check.ok));
  assert.ok(report.checks.some((check) =>
    check.name === 'env:agents-identity' && !check.ok));
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes('must-not-exist'));
});

test('a complete synthetic R1 environment passes without values in its report', () => {
  const contract = loadEnvironmentContract();
  const environment: Record<string, string> = {};
  for (const item of contract.variables.filter((entry) => entry.required_for_r1)) {
    switch (item.kind) {
      case 'email':
        environment[item.name] = 'owner@r1.invalid';
        break;
      case 'https_url':
        environment[item.name] = 'https://r1.invalid';
        break;
      case 'https_url_list':
        environment[item.name] = 'https://gptbot.uz';
        break;
      case 'pbkdf2_hash':
        environment[item.name] = [
          'pbkdf2_sha256$100000$',
          'QUFBQUFBQUFBQUFBQUFBQQ==$',
          'QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI=',
        ].join('');
        break;
      case 'telegram_username':
        environment[item.name] = 'gptbot_sotuvchi_bot';
        break;
      case 'telegram_token':
        environment[item.name] = [
          '123456789',
          ':',
          'Aa'.repeat(20),
        ].join('');
        break;
      case 'environment_name':
        environment[item.name] = 'production';
        break;
      case 'boolean_flag':
        environment[item.name] = 'true';
        break;
      case 'model_id':
        environment[item.name] = 'provider/model';
        break;
      default:
        environment[item.name] = [
          'synthetic-r1-',
          'x'.repeat(32),
          String(item.name.length),
        ].join('-');
    }
  }
  const report = validateProductionEnvironment(environment, contract);
  assert.equal(report.status, 'pass', JSON.stringify(
    report.checks.filter((check) => !check.ok),
  ));
  const serialized = JSON.stringify(report);
  for (const value of Object.values(environment)) {
    assert.ok(!serialized.includes(JSON.stringify(value)));
  }
});

test('migration manifest is ordered 0013 through 0024 with exact checksums', () => {
  const entries = loadMigrationManifest().migrations;
  assert.equal(entries.length, 12);
  assert.deepEqual(entries.map((entry) => entry.order), [
    13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
  ]);
  for (const entry of entries) {
    assert.equal(
      sha256File(path.join(ROOT, 'migrations', entry.filename)),
      entry.sha256,
      entry.filename,
    );
    assert.ok(entry.reversibility);
    assert.ok(entry.pii);
    assert.ok(entry.owner);
  }
});

test('migration SQL contains no executable destructive statement', () => {
  assert.equal(migrationsContainExecutableDestructiveSql(), false);
});

test('migration rehearsal covers bootstrap, upgrade, objects and constraints', () => {
  const report = runMigrationRehearsal();
  assert.equal(report.status, 'pass');
  assert.equal(report.database, 'isolated-local-synthetic');
  assert.equal(report.applied.length, 12);
  for (const check of [
    'clean_bootstrap',
    'synthetic_upgrade',
    'declared_tables_indexes',
    'foreign_keys_checks_tenant',
    'application_schema_compatibility',
  ]) {
    assert.equal(report.checks[check], true, check);
  }
});

test('migration failure rolls back and duplicate apply is an explicit no-op', () => {
  const report = runMigrationRehearsal();
  assert.equal(report.checks.failed_migration_rollback, true);
  assert.equal(report.checks.duplicate_apply_policy, true);
  assert.equal(report.duplicate, 'duplicate');
});

test('backup restore rehearsal verifies export, mutation and restored integrity', () => {
  const report = runBackupRestoreRehearsal();
  assert.equal(report.status, 'pass');
  assert.equal(report.mode, 'isolated-local-synthetic');
  assert.deepEqual(Object.values(report.checks), [true, true, true, true, true]);
});

test('deployment validator is read-only and covers both providers and D1', () => {
  const report = runDeploymentDryRun();
  assert.equal(report.status, 'pass');
  assert.equal(report.mode, 'read-only-dry-run');
  assert.deepEqual(report.mutations, []);
  for (const name of [
    'cloudflare:project',
    'cloudflare:d1-binding',
    'cloudflare:function-routes',
    'railway:build',
    'railway:start',
    'railway:health',
  ]) {
    assert.ok(report.checks.some((check) => check.name === name && check.ok), name);
  }
});

test('the Agents webhook setup defaults to no mutation', async () => {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const method = String(input).split('/').pop() ?? '';
    calls.push(method);
    const result = method === 'getMe'
      ? { ok: true, result: { username: 'gptbot_sotuvchi_bot' } }
      : { ok: true, result: {} };
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    await runTelegramAgentsSetup({
      TELEGRAM_AGENTS_BOT_TOKEN: 'synthetic-transport',
      TELEGRAM_AGENTS_WEBHOOK_SECRET: 'synthetic-webhook',
      TELEGRAM_AGENTS_BOT_USERNAME: 'gptbot_sotuvchi_bot',
      SITE_URL: 'https://gptbot.uz',
    }, ['setup']);
    assert.deepEqual(calls, ['getMe']);
  } finally {
    globalThis.fetch = original;
  }
});

test('the Agents webhook setup mutates only with explicit apply', async () => {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const method = String(input).split('/').pop() ?? '';
    calls.push(method);
    const result = method === 'getMe'
      ? { ok: true, result: { username: 'gptbot_sotuvchi_bot' } }
      : method === 'getWebhookInfo'
        ? { ok: true, result: { url: 'https://gptbot.uz/api/telegram/agents' } }
        : { ok: true, result: true };
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    await runTelegramAgentsSetup({
      TELEGRAM_AGENTS_BOT_TOKEN: 'synthetic-transport',
      TELEGRAM_AGENTS_WEBHOOK_SECRET: 'synthetic-webhook',
      TELEGRAM_AGENTS_BOT_USERNAME: 'gptbot_sotuvchi_bot',
      SITE_URL: 'https://gptbot.uz',
    }, ['setup', '--apply']);
    assert.ok(calls.includes('setWebhook'));
    assert.equal(calls.filter((call) => call === 'setMyCommands').length, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test('missing or protected Agents identity blocks R1 and payload stays canonical', () => {
  assert.equal(isUsableSotuvchiBotUsername(null), false);
  assert.equal(isUsableSotuvchiBotUsername('aidirectprobot'), false);
  assert.equal(isUsableSotuvchiBotUsername('gptbot_javob_bot'), false);
  assert.equal(isUsableSotuvchiBotUsername('gptbot_sotuvchi_bot'), true);
  assert.equal(SOTUVCHI_SELLER_START_PAYLOAD, 'agent_seller');
});

test('smoke tooling defaults to predeploy read-only', async () => {
  const report = await runSmoke();
  assert.equal(report.status, 'pass');
  assert.equal(report.mode, 'predeploy');
  assert.equal(report.writesPerformed, false);
});

test('controlled-write smoke requires both flags and creates no order', async () => {
  const missing = await runSmoke({ mode: 'postdeploy-controlled-write' });
  assert.equal(missing.status, 'blocked');
  const explicit = await runSmoke({
    mode: 'postdeploy-controlled-write',
    apply: true,
    testTenant: 'pilot-test-synthetic',
  });
  assert.equal(explicit.status, 'blocked');
  assert.equal(explicit.writesPerformed, false);
  assert.ok(explicit.checks.some((check) =>
    check.name === 'controlled-write:implementation' && !check.ok));
});

test('release manifest keeps blockers, tests and local-only status visible', () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(RELEASE_ROOT, 'R0.4_RELEASE_MANIFEST.json'),
    'utf8',
  )) as {
    status: string;
    production_changes_performed: boolean;
    blockers: string[];
    expected_tests: { full_total: number };
    bot: { canonical_start_payload: string };
  };
  assert.equal(manifest.status, 'prepared_locally_blocked_by_R0.3B');
  assert.equal(manifest.production_changes_performed, false);
  assert.equal(manifest.expected_tests.full_total, 788);
  assert.equal(manifest.bot.canonical_start_payload, 'agent_seller');
  assert.ok(manifest.blockers.length >= 7);
  const auditPolicy = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'config', 'release-audit-policy.json'),
    'utf8',
  )) as {
    advisories: unknown[];
    resolved_advisories: {
      id: string;
      disposition: string;
    }[];
    enforcement: {
      production_audit_requires_zero_findings: boolean;
      temporary_router_exception_allowed: boolean;
    };
  };
  assert.deepEqual(auditPolicy.advisories, []);
  assert.deepEqual(auditPolicy.resolved_advisories.map((entry) => entry.id), [
    'GHSA-qwww-vcr4-c8h2',
  ]);
  assert.equal(
    auditPolicy.resolved_advisories[0].disposition,
    'resolved_by_upgrade',
  );
  assert.equal(auditPolicy.enforcement.production_audit_requires_zero_findings, true);
  assert.equal(auditPolicy.enforcement.temporary_router_exception_allowed, false);
});

test('rollback and R1 checklist are complete but grant no approval', () => {
  const rollback = fs.readFileSync(
    path.join(RELEASE_ROOT, 'ROLLBACK_RUNBOOK.md'),
    'utf8',
  );
  for (const required of [
    'Git',
    'Cloudflare',
    'Railway',
    'webhook',
    'D1',
    'forward fix',
    'Stop conditions',
  ]) {
    assert.ok(rollback.toLowerCase().includes(required.toLowerCase()), required);
  }
  assert.ok(!/\b(?:DROP|TRUNCATE|DELETE FROM)\b/i.test(rollback));
  const checklist = fs.readFileSync(
    path.join(RELEASE_ROOT, 'R1_OWNER_CHECKLIST.md'),
    'utf8',
  );
  assert.ok(checklist.includes('- [ ]'));
  assert.ok(!checklist.includes('- [x]'));
});
