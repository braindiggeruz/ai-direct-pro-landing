// Tests for the R0.3C secret-prevention gate.
//
// Every credential-shaped string below is SYNTHETIC and non-working: these are
// fixtures written for this test, not values from any real service. The point
// of the suite is to prove the detector fails closed on the shape that the R0.3
// incident actually had — a generic high-entropy value next to a credential
// label, which provider-pattern scanners (including GitHub's) do not flag.
//
// Run: node --import tsx --test tests/secret-scan.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  scanText,
  scanFiles,
  scanTableRow,
  repositoryFiles,
  RULES,
  EXEMPT_FILES,
} from '../scripts/scan-secrets.ts';

// Synthetic, never-issued values. Assembled at runtime so the literals in this
// file do not themselves look like a pasted credential.
const HEX32 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const MIXED = 'Zk8Qn4Wm2Xr7Tb5Yc9Vd3Fg6Hj1Ls0P';

test('generic high-entropy value next to a credential label is detected', () => {
  // This is the exact shape of the R0.3 incident.
  const f = scanText('memory/notes.md', `ADMIN_PASSWORD: ${MIXED}`);
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 'generic_secret_in_credential_context');
  assert.equal(f[0].line, 1);
});

test('the same value without a credential label is not flagged', () => {
  // Build hashes, asset digests and IDs must not fail the gate.
  const f = scanText('src/assets.ts', `export const buildId = '${MIXED}';`);
  assert.deepEqual(f, []);
});

test('a bearer token line is detected regardless of provider shape', () => {
  const f = scanText('docs/x.md', `Authorization: Bearer ${HEX32}${HEX32}`);
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'high');
});

test('provider-shaped credentials are detected as critical', () => {
  const cases: Array<[string, string]> = [
    ['github_pat_classic', `token=ghp_${'A1b2C3d4E5f6G7h8I9j0'}`],
    ['telegram_bot_token', `TELEGRAM_BOT_TOKEN=${'1234567890'}:${'AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw'}`],
    ['openai_style_key', `key: sk-${'aB3dE5gH7jK9lM1nO3pQ5rS7'}`],
    ['aws_access_key_id', `AKIA${'ABCDEFGHIJKLMNOP'}`],
    ['private_key_block', '-----BEGIN RSA PRIVATE KEY-----'],
  ];
  for (const [expected, line] of cases) {
    const f = scanText('config/x.env', line);
    assert.equal(f.length, 1, `no finding for ${expected}`);
    assert.equal(f[0].rule, expected);
    assert.equal(f[0].severity, 'critical');
  }
});

test('placeholders and documentation examples are not flagged', () => {
  for (const line of [
    'ADMIN_PASSWORD=REPLACE_ME',
    'API_KEY=<your-api-key-here>',
    'SECRET=${CLOUDFLARE_SECRET}',
    'token: YOUR_TOKEN_HERE',
    'password: xxxxxxxxxxxx',
    'Authorization: Bearer <N8N_INGEST_TOKEN>',
  ]) {
    assert.deepEqual(scanText('docs/readme.md', line), [], `flagged placeholder: ${line}`);
  }
});

test('findings never carry the matched value, a fragment, a hash or a length', () => {
  const f = scanText('memory/notes.md', `ADMIN_PASSWORD: ${MIXED}`);
  const serialized = JSON.stringify(f);
  assert.ok(!serialized.includes(MIXED), 'value leaked into the finding');
  for (let n = 8; n <= MIXED.length; n += 4) {
    assert.ok(!serialized.includes(MIXED.slice(0, n)), 'value prefix leaked');
    assert.ok(!serialized.includes(MIXED.slice(-n)), 'value suffix leaked');
  }
  assert.ok(!serialized.includes(String(MIXED.length)), 'value length leaked');
  // A finding is exactly rule + severity + file + line.
  assert.deepEqual(Object.keys(f[0]).sort(), ['file', 'line', 'rule', 'severity']);
});

// ── Regressions taken directly from the R0.3 incident shape ───────────────
// The first version of this gate matched only `LABEL: value` on one line and
// therefore caught 0 of the 23 real incident file versions: that document
// keeps credential names and their values on separate lines of prose and
// markdown tables. These tests pin the rules that actually catch it.

test('a credential-named file is flagged for any high-entropy value, on any line', () => {
  const doc = [
    '# Test credentials',
    '',
    'Some prose that does not name a credential on this line.',
    '',
    `    ${MIXED}${HEX32}`,
  ].join('\n');
  const f = scanText('memory/test_credentials.md', doc);
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 'secret_in_credential_file');
  assert.equal(f[0].severity, 'critical');
});

test('credential-named file detection covers the real incident path shapes', () => {
  const doc = `| Value |\n| ${MIXED}${HEX32} |`;
  for (const p of [
    'memory/test_credentials.md',
    'gptbot-audit/memory/test_credentials.md',
    'gptbot-audit/gptbot-audit/memory/test_credentials.md',
    'repo/memory/test_credentials.md',
    '.env.production',
  ]) {
    assert.ok(scanText(p, doc).length > 0, `not flagged for path ${p}`);
  }
});

test('a markdown table row pairing a credential label with a value is flagged', () => {
  assert.equal(scanTableRow(`| ADMIN_PASSWORD | ${MIXED} |`), true);
  assert.equal(scanTableRow(`| Purpose | rotates every 90 days |`), false);
  // Governance tables are full of git object names; those are not secrets.
  assert.equal(scanTableRow('| R0.2 code | a364b45dd9355c4ef432951c4c1e88ef8da3bc81 | secret fix |'), false);
});

test('a TypeScript union type is not mistaken for a markdown table', () => {
  const line =
    '  autopilot: { failed_total: number; n8n_webhook_secret_configured: boolean; schedule_mode: string } | null;';
  assert.equal(scanTableRow(line), false);
  assert.deepEqual(scanText('src/shared/next-actions.ts', line), []);
});

test('the exemption list stays narrow and fully documented', () => {
  assert.ok(EXEMPT_FILES.size <= 5, 'exemption list is growing — review before widening');
  for (const [file, reason] of EXEMPT_FILES) {
    assert.ok(!file.includes('*'), `exemption must not use a wildcard: ${file}`);
    assert.ok(!file.endsWith('/'), `exemption must not be a directory: ${file}`);
    assert.ok(reason.length > 15, `exemption needs a real reason: ${file}`);
  }
});

test('every rule has a distinct name and a severity', () => {
  const names = RULES.map((r) => r.name);
  assert.equal(new Set(names).size, names.length, 'duplicate rule name');
  for (const r of RULES) assert.ok(r.severity === 'critical' || r.severity === 'high');
  assert.ok(
    RULES.some((r) => r.requiresCredentialContext),
    'the generic-secret rule that catches the R0.3 shape must exist',
  );
});

test('the repository itself is clean under the gate', () => {
  const findings = scanFiles(['scripts/scan-secrets.ts', 'tests/secret-scan.test.ts', '.gitignore']);
  assert.deepEqual(findings, [], 'the gate must not flag its own files');
});

test('the scanner source contains no literal NUL byte', () => {
  const source = readFileSync('scripts/scan-secrets.ts', 'utf8');
  assert.ok(!source.includes(String.fromCharCode(0)));
});

test('default repository discovery includes non-ignored untracked files', () => {
  const folder = mkdtempSync(path.join(process.cwd(), 'secret-scan-untracked-test-'));
  const file = path.join(folder, 'probe.txt');
  try {
    writeFileSync(file, 'harmless untracked probe\n', 'utf8');
    const relative = path.relative(process.cwd(), file).replaceAll('\\', '/');
    assert.ok(repositoryFiles().map((candidate) => candidate.replaceAll('\\', '/')).includes(relative));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('the removed incident paths are no longer tracked', async () => {
  const { execFileSync } = await import('node:child_process');
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const hits = tracked.split('\n').filter((p) => p.includes('test_credentials'));
  assert.deepEqual(hits, [], 'a credential note is tracked again');
});
