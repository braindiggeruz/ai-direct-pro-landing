import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CAPTURE_IO_CONTRACT,
  ReleaseManifestInputError,
  canonicalizeLf,
  captureReleaseManifest,
  serializeReleaseManifest,
  sha256Lf,
  writeManifestFile,
  type ReleaseManifestInputV1,
} from '../scripts/lead-radar/capture-release-manifest.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'lead-radar', 'capture-release-manifest.ts');

function readyInput(): ReleaseManifestInputV1 {
  return {
    schema_version: 1,
    captured_at: '2026-08-25T08:30:00.000Z',
    PROD: {
      pages: {
        artifact: 'pages-deploy-001',
        routes: ['/api/admin/lead-radar/*', '/admin-tools/lead-radar'],
        rollback_artifact: 'pages-deploy-000',
      },
      worker: {
        artifact: 'worker-deploy-001',
        rollback_artifact: 'worker-deploy-000',
        bindings: [
          { name: 'LEAD_RADAR_QUEUE', type: 'queue', target: 'queue-target-private-001' },
          { name: 'DB', type: 'd1', target: 'database-production-001' },
        ],
        consumers: ['lead-radar-production|max_batch_size=1|max_retries=3'],
        crons: ['*/1 * * * *'],
      },
      d1: {
        database_id: 'database-production-001',
        ledger: [
          { sequence: 42, name: '0042_lead_radar_decision_makers.sql', sha256: null },
          { sequence: 41, name: '0041_lead_radar_search_leases.sql', sha256: null },
        ],
        physical_schema_snapshot: {
          format: 'd1-schema-json/v1',
          text: '{\r\n  "tables": ["lead_radar_searches"]\r\n}\r\n',
        },
      },
      lead_radar: {
        old_sync_route: 'paused',
        flags: {
          LEAD_RADAR_PROCESSING_ENABLED: false,
          LEAD_RADAR_ADMISSION_ENABLED: false,
          LEAD_RADAR_CONTACT_ENABLED: false,
          LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: false,
          LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: false,
          LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: false,
          LEAD_RADAR_TELEGRAM_DISCOVERY_ENABLED: false,
        },
      },
      pii_locations: [
        {
          location: 'lead_radar_companies.phone_digits',
          data_classes: ['phone'],
          plane: 'research-d1',
          retention_policy: 'lead-radar-corporate-v1',
          control_owner: 'privacy-operations',
        },
      ],
    },
    HEAD: {
      revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      file_snapshots: [
        {
          path: 'wrangler.automation.toml',
          kind: 'config',
          text: 'LEAD_RADAR_PROCESSING_ENABLED=false\r\n',
        },
        {
          path: 'migrations/0042_lead_radar_decision_makers.sql',
          kind: 'migration',
          text: 'migration fixture v42\r\n',
        },
      ],
      pii_locations: [],
    },
    WIP: {
      base_revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      dirty_paths: ['wrangler.automation.toml', 'functions/_types.ts'],
      untracked_paths: ['migrations/0043_lead_radar_async_funnel.sql'],
      file_snapshots: [
        {
          path: 'migrations/0043_lead_radar_async_funnel.sql',
          kind: 'migration',
          text: 'migration fixture v43\r\n',
        },
        {
          path: 'functions/_types.ts',
          kind: 'source',
          text: 'export interface LeadRadarFlags {}\r\n',
        },
      ],
      pii_locations: [],
    },
  };
}

test('release manifest: identical snapshots serialize byte-for-byte deterministically', () => {
  const first = readyInput();
  const reordered = readyInput();
  reordered.PROD.pages.routes?.reverse();
  reordered.PROD.worker.bindings?.reverse();
  reordered.PROD.d1.ledger?.reverse();
  reordered.HEAD.file_snapshots?.reverse();
  reordered.WIP.dirty_paths?.reverse();
  reordered.WIP.file_snapshots?.reverse();
  reordered.PROD.lead_radar.flags = {
    LEAD_RADAR_CONTACT_ENABLED: false,
    LEAD_RADAR_PROCESSING_ENABLED: false,
    LEAD_RADAR_ADMISSION_ENABLED: false,
    LEAD_RADAR_TELEGRAM_DISCOVERY_ENABLED: false,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: false,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: false,
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: false,
  };

  const a = captureReleaseManifest(first);
  const b = captureReleaseManifest(reordered);
  assert.equal(a.status, 'ready');
  assert.equal(b.status, 'ready');
  assert.equal(serializeReleaseManifest(a), serializeReleaseManifest(b));
  assert.equal(a.source_snapshot_sha256, b.source_snapshot_sha256);
  assert.deepEqual(a.unknowns, []);
});

test('release manifest: PROD, HEAD and WIP remain explicit non-overlapping snapshots', () => {
  const manifest = captureReleaseManifest(readyInput());
  assert.deepEqual(Object.keys(manifest.states).sort(), ['HEAD', 'PROD', 'WIP']);
  assert.equal(manifest.states.PROD.pages.artifact, 'pages-deploy-001');
  assert.equal(manifest.states.HEAD.repo.revision, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.deepEqual(manifest.states.WIP.repo.dirty_paths, [
    'functions/_types.ts',
    'wrangler.automation.toml',
  ]);
  assert.equal('dirty_paths' in manifest.states.HEAD.repo, false);
  assert.equal('artifact' in manifest.states.WIP.repo, false);
});

test('release manifest: LF canonicalization makes fixture hashes platform-stable', () => {
  const lf = 'alpha\nbeta\n';
  const crlf = 'alpha\r\nbeta\r\n';
  const cr = 'alpha\rbeta\r';
  const expected = 'e49c81e2d2f84e259d40e2fb8192f3bcd198b355184845d76d8f58807d0d78ee';
  assert.equal(canonicalizeLf(crlf), lf);
  assert.equal(canonicalizeLf(cr), lf);
  assert.equal(sha256Lf(lf), expected);
  assert.equal(sha256Lf(crlf), expected);
  assert.equal(sha256Lf(cr), expected);
});

test('release manifest: raw snapshot text and database or binding ids are never emitted', () => {
  const input = readyInput();
  const rawDatabaseId = input.PROD.d1.database_id as string;
  const rawBindingTarget = input.PROD.worker.bindings?.[0]?.target as string;
  const rawFileText = input.HEAD.file_snapshots?.[0]?.text as string;
  const serialized = serializeReleaseManifest(captureReleaseManifest(input));

  assert.doesNotMatch(serialized, new RegExp(rawDatabaseId));
  assert.doesNotMatch(serialized, new RegExp(rawBindingTarget));
  assert.equal(serialized.includes(rawFileText.trim()), false);
  assert.match(serialized, /"database_fingerprint": "sha256:[a-f0-9]{64}"/);
  assert.match(serialized, /"target_fingerprint": "sha256:[a-f0-9]{64}"/);
});

test('release manifest: secret-shaped snapshot material is rejected without echoing it', () => {
  const input = readyInput();
  const synthetic = ['Q7vL', '3pRm', '8xTk', '2nWs', '5cHd'].join('');
  input.PROD.d1.physical_schema_snapshot = {
    format: 'd1-schema-json/v1',
    text: `ADMIN_PASSWORD=${synthetic}`,
  };

  assert.throws(
    () => captureReleaseManifest(input),
    (error: unknown) => {
      assert.ok(error instanceof ReleaseManifestInputError);
      assert.equal(error.code, 'invalid_input');
      assert.equal(error.message.includes(synthetic), false);
      assert.match(error.message, /secret_material_forbidden/);
      return true;
    },
  );
});

test('release manifest: raw person data is rejected while location metadata is allowed', () => {
  const input = readyInput();
  const rawAddress = ['operator', 'example.test'].join('@');
  input.WIP.file_snapshots = [{
    path: 'work/private-snapshot.txt',
    kind: 'source',
    text: `contact=${rawAddress}`,
  }];

  assert.throws(
    () => captureReleaseManifest(input),
    (error: unknown) => {
      assert.ok(error instanceof ReleaseManifestInputError);
      assert.equal(error.message.includes(rawAddress), false);
      assert.match(error.message, /raw_pii_forbidden/);
      return true;
    },
  );
});

test('release manifest: every required missing snapshot is explicit and blocks release', () => {
  const input = readyInput();
  input.PROD.pages.artifact = null;
  input.PROD.worker.bindings = null;
  input.PROD.d1.physical_schema_snapshot = null;
  input.PROD.lead_radar.flags = {
    LEAD_RADAR_ADMISSION_ENABLED: false,
    LEAD_RADAR_PROCESSING_ENABLED: 'unknown',
  };
  input.WIP.dirty_paths = null;

  const manifest = captureReleaseManifest(input);
  const unknownFields = new Set(manifest.unknowns.map((unknown) => unknown.field));
  assert.equal(manifest.status, 'blocked');
  assert.ok(unknownFields.has('states.PROD.pages.artifact'));
  assert.ok(unknownFields.has('states.PROD.worker.bindings'));
  assert.ok(unknownFields.has('states.PROD.d1.physical_schema'));
  assert.ok(unknownFields.has('states.PROD.lead_radar.flags.LEAD_RADAR_PROCESSING_ENABLED'));
  assert.ok(unknownFields.has('states.PROD.lead_radar.flags.LEAD_RADAR_CONTACT_ENABLED'));
  assert.ok(unknownFields.has('states.PROD.lead_radar.flags.LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED'));
  assert.ok(unknownFields.has('states.PROD.lead_radar.flags.LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED'));
  assert.ok(unknownFields.has('states.PROD.lead_radar.flags.LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED'));
  assert.ok(unknownFields.has('states.PROD.lead_radar.flags.LEAD_RADAR_TELEGRAM_DISCOVERY_ENABLED'));
  assert.ok(unknownFields.has('states.WIP.repo.dirty_paths'));
  assert.ok(manifest.unknowns.every((unknown) => unknown.required_for_release));
});

test('release manifest: binding unknowns point at the deterministic output order', () => {
  const input = readyInput();
  input.PROD.worker.bindings = [
    { name: 'Z_QUEUE', type: 'queue', target: null },
    { name: 'A_DATABASE', type: 'd1', target: 'database-production-001' },
  ];
  const manifest = captureReleaseManifest(input);
  assert.deepEqual(
    manifest.states.PROD.worker.bindings?.map((binding) => binding.name),
    ['A_DATABASE', 'Z_QUEUE'],
  );
  assert.ok(manifest.unknowns.some(
    (unknown) => unknown.field === 'states.PROD.worker.bindings[1].target_fingerprint',
  ));
});

test('release manifest CLI: --release exits nonzero for unknowns and zero for an exact snapshot', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'lead-radar-release-manifest-cli-'));
  const blockedPath = path.join(temp, 'blocked.json');
  const readyPath = path.join(temp, 'ready.json');
  try {
    const blocked = readyInput();
    blocked.PROD.worker.artifact = null;
    await writeFile(blockedPath, JSON.stringify(blocked), 'utf8');
    await writeFile(readyPath, JSON.stringify(readyInput()), 'utf8');

    const blockedRun = spawnSync(
      process.execPath,
      ['--import', 'tsx', SCRIPT, '--input', blockedPath, '--release'],
      { cwd: ROOT, encoding: 'utf8', windowsHide: true },
    );
    assert.equal(blockedRun.status, 1, blockedRun.stderr);
    assert.equal(JSON.parse(blockedRun.stdout).status, 'blocked');

    const readyRun = spawnSync(
      process.execPath,
      ['--import', 'tsx', SCRIPT, '--input', readyPath, '--release'],
      { cwd: ROOT, encoding: 'utf8', windowsHide: true },
    );
    assert.equal(readyRun.status, 0, readyRun.stderr);
    assert.equal(JSON.parse(readyRun.stdout).status, 'ready');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('release manifest: optional output is local, exclusive and cannot escape its report root', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'lead-radar-release-manifest-output-'));
  try {
    const serialized = serializeReleaseManifest(captureReleaseManifest(readyInput()));
    const output = writeManifestFile('reports/lead-radar/candidate.json', serialized, temp);
    assert.equal(await readFile(output, 'utf8'), serialized);
    assert.throws(
      () => writeManifestFile('reports/lead-radar/candidate.json', serialized, temp),
      /EEXIST/,
    );
    assert.throws(
      () => writeManifestFile('reports/lead-radar/../../outside.json', serialized, temp),
      /must_be_new_json_under_reports_lead_radar/,
    );
    assert.throws(
      () => writeManifestFile('reports/lead-radar/nested/candidate.json', serialized, temp),
      /must_be_new_json_under_reports_lead_radar/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('release manifest: capture implementation has no network, command, SQL or external-write capability', async () => {
  assert.deepEqual(CAPTURE_IO_CONTRACT, {
    network: false,
    sql: false,
    external_writes: false,
    local_report_write: true,
  });
  const source = await readFile(SCRIPT, 'utf8');
  assert.doesNotMatch(source, /from ['"]node:(?:child_process|http|https|net|tls|dns)['"]/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\b(?:wrangler|curl|Invoke-WebRequest)\b/i);
  assert.doesNotMatch(
    source,
    /\b(?:CREATE|ALTER|DROP|SELECT|INSERT|UPDATE|DELETE)\s+(?:TABLE|INDEX|INTO|FROM|SET)\b/i,
  );
});
