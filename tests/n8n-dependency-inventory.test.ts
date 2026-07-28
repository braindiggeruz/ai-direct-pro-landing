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

test('unknown production activity remains visible and evidence-backed', () => {
  const inventory = load();
  const unknown = inventory.items.filter((item) =>
    item.status === 'unknown' || item.production_activity === 'unknown');
  assert.ok(unknown.length >= 10);
  assert.ok(unknown.every((item) => item.evidence.length >= 20));
  assert.deepEqual(inventory.status_values, [
    'active',
    'legacy',
    'unknown',
    'dead',
  ]);
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
