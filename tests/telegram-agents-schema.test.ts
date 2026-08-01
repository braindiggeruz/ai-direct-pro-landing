import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  verifyTelegramAgentsRuntimeSchema,
} from '../functions/api/telegram/agents-schema';
import { ensureTelegramAgentUpdateSchema } from '../functions/channels/telegram/schema';
import {
  isRuntimeSchemaVerified,
} from '../functions/platform/storage/runtime-schema';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');

function applyRuntimeMigrations(db: SqliteD1): void {
  const names = fs.readdirSync(path.join(ROOT, 'migrations'))
    .filter((name) => /^(001[3-9]|002[0-9]|0030)_.*\.sql$/.test(name))
    .sort();
  assert.equal(names.length, 18);
  for (const name of names) {
    db.exec(fs.readFileSync(path.join(ROOT, 'migrations', name), 'utf8'));
  }
}

test('verified migrated D1 bypasses repeated runtime DDL probes', async () => {
  const fixture = new SqliteD1();
  applyRuntimeMigrations(fixture);
  const db = fixture.asD1();

  await verifyTelegramAgentsRuntimeSchema(db);
  assert.equal(isRuntimeSchemaVerified(db), true);

  const originalPrepare = fixture.prepare.bind(fixture);
  let preparedAfterVerification = 0;
  fixture.prepare = ((sql: string) => {
    preparedAfterVerification += 1;
    return originalPrepare(sql);
  }) as typeof fixture.prepare;

  await ensureTelegramAgentUpdateSchema(db);
  await verifyTelegramAgentsRuntimeSchema(db);
  assert.equal(preparedAfterVerification, 0);
});

test('incomplete migrated D1 is never marked runtime-ready', async () => {
  const fixture = new SqliteD1();
  applyRuntimeMigrations(fixture);
  fixture.exec('DROP TABLE telegram_agent_rate_limit_notices');
  const db = fixture.asD1();

  await assert.rejects(
    verifyTelegramAgentsRuntimeSchema(db),
    /runtime schema is unavailable/,
  );
  assert.equal(isRuntimeSchemaVerified(db), false);
});

test('a missing correctness-critical unique index fails the contract closed', async () => {
  for (const index of [
    'idx_sotuvchi_stores_org_id',
    'idx_sotuvchi_orders_active_draft',
    'idx_sotuvchi_order_items_single',
    'idx_sotuvchi_inventory_moves_order_type',
    'idx_sotuvchi_handoffs_active',
  ]) {
    const fixture = new SqliteD1();
    applyRuntimeMigrations(fixture);
    fixture.exec(`DROP INDEX ${index}`);
    const db = fixture.asD1();
    await assert.rejects(
      verifyTelegramAgentsRuntimeSchema(db),
      /runtime schema is unavailable/,
      index,
    );
    assert.equal(isRuntimeSchemaVerified(db), false, index);
  }
});

test('a runtime-added column outside the contract fails the contract closed', async () => {
  const fixture = new SqliteD1();
  applyRuntimeMigrations(fixture);
  // Rebuilding without one runtime column is how a partially migrated
  // production database would look to the bypassed catalog bootstrap.
  fixture.exec(
    `ALTER TABLE sotuvchi_storefront_sessions
     DROP COLUMN selection_request_key`,
  );
  const db = fixture.asD1();

  await assert.rejects(
    verifyTelegramAgentsRuntimeSchema(db),
    /runtime schema is unavailable/,
  );
  assert.equal(isRuntimeSchemaVerified(db), false);
});

// ── Contract completeness ──────────────────────────────────────────────────

/** Every schema module that the verification lets a request skip. */
function bypassedSchemaSources(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      const source = fs.readFileSync(full, 'utf8');
      if (!source.includes('if (isRuntimeSchemaVerified(db))')) continue;
      found.push(full);
      // Several modules keep their DDL in a sibling store module.
      const store = path.join(path.dirname(full), 'store.ts');
      if (fs.existsSync(store) && !found.includes(store)) found.push(store);
    }
  };
  walk(path.join(ROOT, 'functions'));
  return found;
}

function matchAll(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

test('the contract covers every table and unique index it lets a request skip', () => {
  const contract = fs.readFileSync(
    path.join(ROOT, 'functions/api/telegram/agents-schema.ts'),
    'utf8',
  );
  const section = (label: string): Set<string> => {
    const block = contract.split(`) AS ${label}`)[0].split('name IN (').at(-1);
    assert.ok(block, label);
    return new Set(matchAll(block!, /'([a-z0-9_]+)'/g));
  };
  const contractTables = section('table_count');
  const contractIndexes = section('unique_index_count');

  const sources = bypassedSchemaSources();
  assert.ok(sources.length >= 13, `bypassed modules: ${sources.length}`);
  const declaredTables = new Set<string>();
  const declaredIndexes = new Set<string>();
  for (const file of sources) {
    const source = fs.readFileSync(file, 'utf8');
    for (const name of matchAll(
      source,
      /CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/g,
    )) {
      declaredTables.add(name);
    }
    for (const name of matchAll(
      source,
      /CREATE UNIQUE INDEX IF NOT EXISTS\s+([a-z0-9_]+)/g,
    )) {
      declaredIndexes.add(name);
    }
  }

  assert.deepEqual(
    [...declaredTables].filter((name) => !contractTables.has(name)),
    [],
    'bypassed table missing from the contract',
  );
  assert.deepEqual(
    [...contractTables].filter((name) => !declaredTables.has(name)),
    [],
    'contract table no longer owned by a bypassed module',
  );
  assert.deepEqual(
    [...declaredIndexes].filter((name) => !contractIndexes.has(name)),
    [],
    'bypassed unique index missing from the contract',
  );
  assert.deepEqual(
    [...contractIndexes].filter((name) => !declaredIndexes.has(name)),
    [],
    'contract unique index no longer owned by a bypassed module',
  );
});

test('the contract covers every runtime-added column it lets a request skip', () => {
  const contract = fs.readFileSync(
    path.join(ROOT, 'functions/api/telegram/agents-schema.ts'),
    'utf8',
  );
  const contractColumns = new Set(
    matchAll(contract, /'([a-z0-9_]+)'/g),
  );
  for (const file of bypassedSchemaSources()) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /ALTER TABLE\s+([a-z0-9_]+)\s+ADD COLUMN\s+([a-z0-9_]+)/g,
    )) {
      assert.ok(
        contractColumns.has(match[2]),
        `${match[1]}.${match[2]} is bypassed but not verified`,
      );
    }
  }
});
