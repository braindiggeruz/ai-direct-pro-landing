import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const INVENTORY_PATH = path.join(
  ROOT,
  'docs',
  'agents-platform',
  'architecture',
  'N8N_DEPENDENCY_INVENTORY.json',
);

interface Inventory {
  status_values: string[];
  coverage_rules: Array<{ path: string; classification: string }>;
  items: Array<{
    id: string;
    path: string;
    status: string;
    production_activity: string;
    evidence: string;
  }>;
  retirement?: {
    disposition: string;
    release: string;
    evidence: string;
    replacement_proven_before_retirement: boolean;
    removed_files: string[];
    removed_env_names: string[];
  };
}

function expandBraces(pattern: string): string[] {
  const match = pattern.match(/\{([^{}]+)\}/);
  if (!match || match.index === undefined) return [pattern];
  const before = pattern.slice(0, match.index);
  const after = pattern.slice(match.index + match[0].length);
  return match[1].split(',').flatMap((choice) =>
    expandBraces(`${before}${choice}${after}`));
}

function globRegex(pattern: string): RegExp {
  const normalized = pattern.replaceAll('\\', '/');
  let source = '';
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    const next = normalized[index + 1];
    if (character === '*' && next === '*') {
      source += '.*';
      index += 1;
    } else if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += character?.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

function matches(pattern: string, candidate: string): boolean {
  return expandBraces(pattern).some((expanded) =>
    globRegex(expanded).test(candidate));
}

function load(): Inventory {
  return JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8')) as Inventory;
}

test('every tracked literal n8n reference has an inventory classification', () => {
  const inventory = load();
  const patterns = [
    ...inventory.coverage_rules.map((rule) => rule.path),
    ...inventory.items.map((item) => item.path),
  ];
  const files = execFileSync(
    'git',
    ['grep', '-Il', '-E', 'n8n|N8N_', '--', '.'],
    { cwd: ROOT, encoding: 'utf8' },
  ).split(/\r?\n/).filter(Boolean).map((file) => file.replaceAll('\\', '/'));
  const uncovered = files.filter((file) =>
    !patterns.some((pattern) => matches(pattern, file)));
  assert.deepEqual(uncovered, []);
});

test('after retirement the only unknown left is the deliberately unread audit directory', () => {
  const inventory = load();
  const unknown = inventory.items.filter((item) =>
    item.status === 'unknown' || item.production_activity === 'unknown');
  assert.deepEqual(unknown.map((item) => item.id), ['untracked-user-audit']);
  assert.ok(unknown.every((item) => item.evidence.length >= 20));
  assert.deepEqual(inventory.status_values, [
    'active',
    'legacy',
    'unknown',
    'dead',
  ]);
});

test('every item is evidence-backed, not merely classified', () => {
  const inventory = load();
  const thin = inventory.items.filter((item) => item.evidence.length < 20);
  assert.deepEqual(thin.map((item) => item.id), []);
});

test('the executed retirement is recorded with its replacement evidence', () => {
  const inventory = load();
  assert.ok(inventory.retirement, 'retirement block required');
  assert.equal(inventory.retirement?.disposition, 'RETIRED');
  assert.equal(inventory.retirement?.release, 'R0.4');
  assert.equal(inventory.retirement?.replacement_proven_before_retirement, true);
  assert.ok(inventory.retirement?.evidence.endsWith('N8N_RETIREMENT_EVIDENCE.md'));
  for (const name of [
    'N8N_INGEST_TOKEN',
    'N8N_WEBHOOK_SECRET',
    'N8N_INGEST_ENABLED',
    'EXTERNAL_AUTOPILOT_TRIGGER_ENABLED',
    'SEO_AUTOPILOT_USE_DIRECT_AI',
  ]) {
    assert.ok(
      inventory.retirement?.removed_env_names.includes(name),
      `${name} must be recorded as removed`,
    );
  }
});

test('every file the retirement claims to have removed is actually gone', () => {
  const inventory = load();
  for (const relative of inventory.retirement?.removed_files ?? []) {
    assert.equal(
      fs.existsSync(path.join(ROOT, relative)),
      false,
      `${relative} must not exist`,
    );
  }
});

test('every item that describes removed n8n code is classified dead', () => {
  const inventory = load();
  const removedIds = [
    'legacy-ingest-endpoint',
    'legacy-ingest-token',
    'legacy-webhook-bridge-secret',
    'legacy-bridge-launcher',
    'legacy-bridge-worker',
    'legacy-normaliser',
    'deprecated-external-trigger',
  ];
  for (const id of removedIds) {
    const item = inventory.items.find((candidate) => candidate.id === id);
    assert.ok(item, `${id} must stay in the inventory as an audit record`);
    assert.equal(item?.status, 'dead', id);
    assert.equal(item?.production_activity, 'dead', id);
  }
});

test('inventory is names-only and contains no secret material', () => {
  const serialized = fs.readFileSync(INVENTORY_PATH, 'utf8');
  for (const forbidden of [
    /authorization:\s*bearer\s+[a-z0-9_-]{12,}/i,
    /x-runable-secret["'\s:=]+[a-z0-9_-]{12,}/i,
    /N8N_INGEST_TOKEN["'\s:=]+[a-z0-9_-]{12,}/i,
    /(?:password|token|secret)_value/i,
  ]) {
    assert.equal(forbidden.test(serialized), false, String(forbidden));
  }
});
