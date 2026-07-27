import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createKnowledgeService,
  ensureKnowledgeSchema,
  KNOWLEDGE_LIMITS,
  KnowledgeDuplicateCollectionError,
  KnowledgeNotFoundError,
  KnowledgePayloadTooLargeError,
  KnowledgeValidationError,
  KnowledgeVersionConflictError,
  normalizeKnowledgeText,
  type KnowledgePayloadSchema,
} from '../functions/platform/knowledge';

interface CollectionRow {
  id: string;
  org_id: string;
  agent_id: string;
  kind: string;
  schema_version: number;
  name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  org_id: string;
  collection_id: string;
  status: string;
  payload_json: string;
  search_text: string;
  media_refs_json: string;
  numeric_1: number | null;
  numeric_2: number | null;
  numeric_3: number | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface FakeTables {
  collections: CollectionRow[];
  items: ItemRow[];
  ddl: string[];
}

interface FakeStatement {
  sql: string;
  args: unknown[];
  bind(...args: unknown[]): FakeStatement;
  run(): Promise<{ meta: { changes: number } }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
}

interface FixturePayload {
  label: string;
  details?: string;
  amount?: number;
  mediaRef?: string;
}

const fixtureSchema: KnowledgePayloadSchema<FixturePayload> = {
  validate(input: unknown) {
    if (
      !input
      || typeof input !== 'object'
      || Array.isArray(input)
      || typeof (input as { label?: unknown }).label !== 'string'
    ) {
      throw new Error('invalid fixture');
    }
    const source = input as FixturePayload;
    if (source.details !== undefined && typeof source.details !== 'string') {
      throw new Error('invalid fixture');
    }
    if (source.amount !== undefined && typeof source.amount !== 'number') {
      throw new Error('invalid fixture');
    }
    if (source.mediaRef !== undefined && typeof source.mediaRef !== 'string') {
      throw new Error('invalid fixture');
    }
    return { ...source };
  },
  toSearchText(value) {
    return [value.label, value.details].filter(Boolean).join(' ');
  },
  toMediaRefs(value) {
    return value.mediaRef
      ? [{ source: 'channel', channel: 'telegram', ref: value.mediaRef }]
      : [];
  },
  toNumericValues(value) {
    return [value.amount];
  },
};

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function asString(value: unknown): string {
  return String(value);
}

function asNullableNumber(value: unknown): number | null {
  return value === null ? null : Number(value);
}

function makeD1() {
  const tables: FakeTables = {
    collections: [],
    items: [],
    ddl: [],
  };
  const organizations = new Set(['org-alpha', 'org-beta', 'org-gamma']);

  function run(sql: string, args: unknown[]): { meta: { changes: number } } {
    const statement = compactSql(sql);
    if (/^CREATE (?:TABLE|INDEX)/.test(statement)) {
      tables.ddl.push(statement);
      return { meta: { changes: 0 } };
    }

    if (/^INSERT INTO knowledge_collections/.test(statement)) {
      const [
        id,
        orgId,
        agentId,
        kind,
        schemaVersion,
        name,
        status,
        createdAt,
        updatedAt,
      ] = args;
      if (!organizations.has(asString(orgId))) throw new Error('fake organization FK');
      if (
        tables.collections.some(
          (row) =>
            row.id === id
            || (
              row.org_id === orgId
              && row.agent_id === agentId
              && row.kind === kind
            ),
        )
      ) {
        throw new Error('fake collection unique constraint');
      }
      tables.collections.push({
        id: asString(id),
        org_id: asString(orgId),
        agent_id: asString(agentId),
        kind: asString(kind),
        schema_version: Number(schemaVersion),
        name: name === null ? null : asString(name),
        status: asString(status),
        created_at: asString(createdAt),
        updated_at: asString(updatedAt),
      });
      return { meta: { changes: 1 } };
    }

    if (/^UPDATE knowledge_collections SET status = 'archived'/.test(statement)) {
      const [updatedAt, orgId, collectionId] = args;
      const row = tables.collections.find(
        (item) =>
          item.org_id === orgId
          && item.id === collectionId
          && item.status === 'active',
      );
      if (!row) return { meta: { changes: 0 } };
      row.status = 'archived';
      row.updated_at = asString(updatedAt);
      return { meta: { changes: 1 } };
    }

    if (/^INSERT INTO knowledge_items/.test(statement)) {
      const [
        id,
        orgId,
        collectionId,
        status,
        payloadJson,
        searchText,
        mediaRefsJson,
        numeric1,
        numeric2,
        numeric3,
        createdAt,
        updatedAt,
      ] = args;
      if (
        !tables.collections.some(
          (row) => row.org_id === orgId && row.id === collectionId,
        )
      ) {
        throw new Error('fake composite collection FK');
      }
      tables.items.push({
        id: asString(id),
        org_id: asString(orgId),
        collection_id: asString(collectionId),
        status: asString(status),
        payload_json: asString(payloadJson),
        search_text: asString(searchText),
        media_refs_json: asString(mediaRefsJson),
        numeric_1: asNullableNumber(numeric1),
        numeric_2: asNullableNumber(numeric2),
        numeric_3: asNullableNumber(numeric3),
        version: 1,
        created_at: asString(createdAt),
        updated_at: asString(updatedAt),
      });
      return { meta: { changes: 1 } };
    }

    if (/^UPDATE knowledge_items SET payload_json = \?/.test(statement)) {
      const [
        payloadJson,
        searchText,
        mediaRefsJson,
        numeric1,
        numeric2,
        numeric3,
        updatedAt,
        orgId,
        itemId,
        expectedVersion,
      ] = args;
      const row = tables.items.find(
        (item) =>
          item.org_id === orgId
          && item.id === itemId
          && item.version === expectedVersion,
      );
      if (!row) return { meta: { changes: 0 } };
      row.payload_json = asString(payloadJson);
      row.search_text = asString(searchText);
      row.media_refs_json = asString(mediaRefsJson);
      row.numeric_1 = asNullableNumber(numeric1);
      row.numeric_2 = asNullableNumber(numeric2);
      row.numeric_3 = asNullableNumber(numeric3);
      row.version += 1;
      row.updated_at = asString(updatedAt);
      return { meta: { changes: 1 } };
    }

    if (/^UPDATE knowledge_items SET status = \?/.test(statement)) {
      const [status, updatedAt, orgId, itemId, expectedVersion] = args;
      const row = tables.items.find(
        (item) =>
          item.org_id === orgId
          && item.id === itemId
          && item.version === expectedVersion,
      );
      if (!row) return { meta: { changes: 0 } };
      row.status = asString(status);
      row.version += 1;
      row.updated_at = asString(updatedAt);
      return { meta: { changes: 1 } };
    }

    throw new Error(`unexpected D1 run statement: ${statement.slice(0, 80)}`);
  }

  function first(sql: string, args: unknown[]): unknown {
    const statement = compactSql(sql);
    if (
      /FROM knowledge_collections WHERE org_id = \? AND agent_id = \? AND kind = \?/.test(
        statement,
      )
    ) {
      return tables.collections.find(
        (row) =>
          row.org_id === args[0]
          && row.agent_id === args[1]
          && row.kind === args[2],
      ) ?? null;
    }
    if (/FROM knowledge_collections WHERE org_id = \? AND id = \?/.test(statement)) {
      return tables.collections.find(
        (row) => row.org_id === args[0] && row.id === args[1],
      ) ?? null;
    }
    if (/FROM knowledge_items WHERE org_id = \? AND id = \?/.test(statement)) {
      return tables.items.find(
        (row) => row.org_id === args[0] && row.id === args[1],
      ) ?? null;
    }
    throw new Error(`unexpected D1 first statement: ${statement.slice(0, 80)}`);
  }

  function all(sql: string, args: unknown[]): { results: unknown[] } {
    const statement = compactSql(sql);
    if (
      /FROM knowledge_items WHERE org_id = \? AND collection_id = \?/.test(
        statement,
      )
    ) {
      const includeInactive = args[2] === 1;
      const limit = Number(args[3]);
      return {
        results: tables.items
          .filter(
            (row) =>
              row.org_id === args[0]
              && row.collection_id === args[1]
              && (includeInactive || row.status === 'active'),
          )
          .sort(
            (left, right) =>
              right.updated_at.localeCompare(left.updated_at)
              || left.id.localeCompare(right.id),
          )
          .slice(0, limit),
      };
    }
    if (/FROM knowledge_items AS i INNER JOIN knowledge_collections AS c/.test(statement)) {
      const [
        orgId,
        agentId,
        kind,
        normalizedQuery,
        ,
        tokensJson,
      ] = args;
      const tokens = JSON.parse(asString(tokensJson)) as string[];
      const bounds = args.slice(6, 18);
      const limit = Number(args[18]);
      function inNumericRange(row: ItemRow, index: 0 | 1 | 2): boolean {
        const value = [row.numeric_1, row.numeric_2, row.numeric_3][index];
        const minimum = bounds[index * 4] as number | null;
        const maximum = bounds[index * 4 + 2] as number | null;
        if (minimum !== null && (value === null || value < minimum)) return false;
        if (maximum !== null && (value === null || value > maximum)) return false;
        return true;
      }
      return {
        results: tables.items
          .filter((row) => {
            const collection = tables.collections.find(
              (candidate) =>
                candidate.id === row.collection_id
                && candidate.org_id === row.org_id,
            );
            return row.org_id === orgId
              && row.status === 'active'
              && collection?.status === 'active'
              && collection.agent_id === agentId
              && collection.kind === kind
              && (
                row.search_text === normalizedQuery
                || tokens.some((token) => row.search_text.includes(token))
              )
              && inNumericRange(row, 0)
              && inNumericRange(row, 1)
              && inNumericRange(row, 2);
          })
          .sort(
            (left, right) =>
              right.updated_at.localeCompare(left.updated_at)
              || left.id.localeCompare(right.id),
          )
          .slice(0, limit),
      };
    }
    throw new Error(`unexpected D1 all statement: ${statement.slice(0, 80)}`);
  }

  function prepare(sql: string): FakeStatement {
    return {
      sql,
      args: [],
      bind(...args: unknown[]): FakeStatement {
        this.args = args;
        return this;
      },
      run() {
        return Promise.resolve(run(this.sql, this.args));
      },
      first<T>() {
        return Promise.resolve(first(this.sql, this.args) as T | null);
      },
      all<T>() {
        return Promise.resolve(all(this.sql, this.args) as { results: T[] });
      },
    };
  }

  return {
    prepare,
    _tables: tables,
  } as unknown as D1Database & { _tables: FakeTables };
}

async function setup() {
  const db = makeD1();
  const knowledge = createKnowledgeService(db);
  await ensureKnowledgeSchema(db);
  return { db, knowledge, tables: db._tables };
}

async function createCollection(
  knowledge: ReturnType<typeof createKnowledgeService>,
  orgId = 'org-alpha',
  kind = 'fixture-entry',
) {
  return knowledge.createCollection(orgId, {
    agentId: 'fixture-agent',
    kind,
    schemaVersion: 1,
    name: 'Fixture Collection',
  });
}

async function createItem(
  knowledge: ReturnType<typeof createKnowledgeService>,
  collectionId: string,
  payload: FixturePayload,
  orgId = 'org-alpha',
) {
  return knowledge.createItem(
    orgId,
    collectionId,
    { payload },
    fixtureSchema,
  );
}

test('runtime bootstrap is idempotent and creates both knowledge tables', async () => {
  const db = makeD1();
  await ensureKnowledgeSchema(db);
  await ensureKnowledgeSchema(db);
  assert.equal(
    db._tables.ddl.filter((sql) => /^CREATE TABLE IF NOT EXISTS knowledge_/.test(sql)).length,
    2,
  );
  assert.equal(
    db._tables.ddl.filter((sql) => /^CREATE INDEX IF NOT EXISTS idx_knowledge_/.test(sql)).length,
    6,
  );
});

test('collection create/get/find normalizes extensible agent and kind codes', async () => {
  const { knowledge } = await setup();
  const created = await knowledge.createCollection('org-alpha', {
    agentId: 'Fixture-Agent',
    kind: 'Service-Card',
    schemaVersion: 2,
    name: '  Fictional   Services  ',
  });
  assert.equal(created.agentId, 'fixture-agent');
  assert.equal(created.kind, 'service-card');
  assert.equal(created.name, 'Fictional Services');
  assert.equal((await knowledge.getCollection('org-alpha', created.id))?.id, created.id);
  assert.equal(
    (await knowledge.findCollection('org-alpha', 'fixture-agent', 'service-card'))?.id,
    created.id,
  );
});

test('duplicate org+agent+kind returns a controlled error', async () => {
  const { knowledge, tables } = await setup();
  await createCollection(knowledge);
  await assert.rejects(() => createCollection(knowledge), KnowledgeDuplicateCollectionError);
  assert.equal(tables.collections.length, 1);
});

test('the same agent and kind are allowed in another organization', async () => {
  const { knowledge } = await setup();
  const first = await createCollection(knowledge, 'org-alpha');
  const second = await createCollection(knowledge, 'org-beta');
  assert.notEqual(first.id, second.id);
});

test('org B cannot read or find an org A collection', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  assert.equal(await knowledge.getCollection('org-beta', collection.id), null);
  assert.equal(
    await knowledge.findCollection('org-beta', collection.agentId, collection.kind),
    null,
  );
});

test('org B cannot archive an org A collection', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  await assert.rejects(
    () => knowledge.archiveCollection('org-beta', collection.id),
    KnowledgeNotFoundError,
  );
  assert.equal(
    (await knowledge.getCollection('org-alpha', collection.id))?.status,
    'active',
  );
});

test('archived collection is excluded from default item listing', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  await createItem(knowledge, collection.id, { label: 'Archived fixture' });
  await knowledge.archiveCollection('org-alpha', collection.id);
  assert.equal(
    await knowledge.findCollection(
      'org-alpha',
      collection.agentId,
      collection.kind,
    ),
    null,
  );
  assert.deepEqual(await knowledge.listItems('org-alpha', collection.id), []);
  assert.equal(
    (await knowledge.listItems('org-alpha', collection.id, { includeInactive: true })).length,
    1,
  );
});

test('valid structured payload is accepted and stored as version 1', async () => {
  const { knowledge, tables } = await setup();
  const collection = await createCollection(knowledge);
  const item = await createItem(knowledge, collection.id, {
    label: 'Fictional entry',
    details: 'Safe details',
  });
  assert.equal(item.version, 1);
  assert.deepEqual(item.payload, {
    label: 'Fictional entry',
    details: 'Safe details',
  });
  assert.equal(tables.items.length, 1);
});

test('invalid payload fails closed without creating an item', async () => {
  const { knowledge, tables } = await setup();
  const collection = await createCollection(knowledge);
  await assert.rejects(
    () => knowledge.createItem(
      'org-alpha',
      collection.id,
      { payload: { wrong: true } },
      fixtureSchema,
    ),
    (error: unknown) =>
      error instanceof KnowledgeValidationError
      && error.code === 'invalid_payload',
  );
  assert.equal(tables.items.length, 0);
});

test('payload validation errors never echo the rejected value', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const privateFixture = 'private-fixture-should-not-escape';
  await assert.rejects(
    () => knowledge.createItem(
      'org-alpha',
      collection.id,
      { payload: { wrong: privateFixture } },
      fixtureSchema,
    ),
    (error: unknown) => {
      assert.ok(error instanceof KnowledgeValidationError);
      assert.doesNotMatch(error.message, new RegExp(privateFixture));
      return true;
    },
  );
});

test('oversized payload is rejected before persistence', async () => {
  const { knowledge, tables } = await setup();
  const collection = await createCollection(knowledge);
  await assert.rejects(
    () => createItem(knowledge, collection.id, {
      label: 'x'.repeat(KNOWLEDGE_LIMITS.payloadBytes),
    }),
    KnowledgePayloadTooLargeError,
  );
  assert.equal(tables.items.length, 0);
});

test('search text is generated with deterministic punctuation and dash normalization', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const item = await createItem(knowledge, collection.id, {
    label: '  Красная—Сумка!!!  ',
    details: 'Yangi   model',
  });
  assert.equal(item.searchText, 'красная сумка yangi model');
  assert.equal(normalizeKnowledgeText('GʻISHT—красный'), 'gisht красный');
});

test('media references and promoted numeric values serialize safely', async () => {
  const { knowledge, tables } = await setup();
  const collection = await createCollection(knowledge);
  const item = await createItem(knowledge, collection.id, {
    label: 'Media fixture',
    amount: 42,
    mediaRef: 'fixture_media_alpha',
  });
  assert.deepEqual(item.numericValues, [42, null, null]);
  assert.deepEqual(item.mediaRefs, [
    { source: 'channel', channel: 'telegram', ref: 'fixture_media_alpha' },
  ]);
  assert.equal(tables.items[0].media_refs_json.includes('fixture_media_alpha'), true);
});

test('media reference count limit is enforced', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const schema: KnowledgePayloadSchema<{ label: string }> = {
    validate: () => ({ label: 'Bounded media' }),
    toSearchText: (value) => value.label,
    toMediaRefs: () => Array.from(
      { length: KNOWLEDGE_LIMITS.mediaRefCount + 1 },
      (_, index) => ({
        source: 'channel' as const,
        channel: 'fixture',
        ref: `media_${index}`,
      }),
    ),
  };
  await assert.rejects(
    () => knowledge.createItem('org-alpha', collection.id, { payload: {} }, schema),
    (error: unknown) =>
      error instanceof KnowledgeValidationError
      && error.code === 'invalid_media_refs',
  );
});

test('item get/list is tenant scoped', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const item = await createItem(knowledge, collection.id, { label: 'Tenant fixture' });
  assert.equal((await knowledge.getItem('org-alpha', item.id))?.id, item.id);
  assert.equal(await knowledge.getItem('org-beta', item.id), null);
  assert.deepEqual(
    (await knowledge.listItems('org-alpha', collection.id)).map((row) => row.id),
    [item.id],
  );
});

test('org B cannot create an item in an org A collection', async () => {
  const { knowledge, tables } = await setup();
  const collection = await createCollection(knowledge);
  await assert.rejects(
    () => createItem(
      knowledge,
      collection.id,
      { label: 'Cross tenant fixture' },
      'org-beta',
    ),
    KnowledgeNotFoundError,
  );
  assert.equal(tables.items.length, 0);
});

test('successful update increments version and replaces projections', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const item = await createItem(knowledge, collection.id, {
    label: 'Before update',
    amount: 1,
  });
  const updated = await knowledge.updateItem(
    'org-alpha',
    item.id,
    {
      expectedVersion: 1,
      payload: { label: 'After update', amount: 2 },
    },
    fixtureSchema,
  );
  assert.equal(updated.version, 2);
  assert.equal(updated.searchText, 'after update');
  assert.deepEqual(updated.numericValues, [2, null, null]);
});

test('stale expectedVersion is rejected without overwriting', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const item = await createItem(knowledge, collection.id, { label: 'Original fixture' });
  await knowledge.updateItem(
    'org-alpha',
    item.id,
    { expectedVersion: 1, payload: { label: 'Current fixture' } },
    fixtureSchema,
  );
  await assert.rejects(
    () => knowledge.updateItem(
      'org-alpha',
      item.id,
      { expectedVersion: 1, payload: { label: 'Stale fixture' } },
      fixtureSchema,
    ),
    KnowledgeVersionConflictError,
  );
  assert.equal(
    ((await knowledge.getItem('org-alpha', item.id))?.payload as FixturePayload).label,
    'Current fixture',
  );
});

test('org B cannot update an org A item even with its id', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const item = await createItem(knowledge, collection.id, { label: 'Owned fixture' });
  await assert.rejects(
    () => knowledge.updateItem(
      'org-beta',
      item.id,
      { expectedVersion: 1, payload: { label: 'Foreign update' } },
      fixtureSchema,
    ),
    KnowledgeNotFoundError,
  );
  assert.equal((await knowledge.getItem('org-alpha', item.id))?.version, 1);
});

test('org B cannot change an org A item status', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const item = await createItem(knowledge, collection.id, { label: 'Status fixture' });
  await assert.rejects(
    () => knowledge.setItemStatus('org-beta', item.id, 'hidden', 1),
    KnowledgeNotFoundError,
  );
  assert.equal((await knowledge.getItem('org-alpha', item.id))?.status, 'active');
});

test('hidden and archived items are excluded from default list and search', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const hidden = await createItem(knowledge, collection.id, { label: 'Hidden marker' });
  const archived = await createItem(knowledge, collection.id, { label: 'Archived marker' });
  await knowledge.setItemStatus('org-alpha', hidden.id, 'hidden', 1);
  await knowledge.setItemStatus('org-alpha', archived.id, 'archived', 1);
  assert.deepEqual(await knowledge.listItems('org-alpha', collection.id), []);
  assert.equal(
    (await knowledge.listItems(
      'org-alpha',
      collection.id,
      { includeInactive: true },
    )).length,
    2,
  );
  assert.deepEqual(await knowledge.searchItems('org-alpha', {
    agentId: collection.agentId,
    kind: collection.kind,
    query: 'marker',
  }), []);
});

test('exact match ranks above prefix and partial matches', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const exact = await createItem(knowledge, collection.id, { label: 'anor' });
  await createItem(knowledge, collection.id, { label: 'anor sharbat' });
  await createItem(knowledge, collection.id, { label: 'yangi anor' });
  const results = await knowledge.searchItems('org-alpha', {
    agentId: collection.agentId,
    kind: collection.kind,
    query: 'anor',
  });
  assert.equal(results[0].item.id, exact.id);
  assert.equal(results[0].score, 4_000);
});

test('prefix ranks above an all-token non-prefix match', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const prefix = await createItem(knowledge, collection.id, {
    label: 'qizil olma yangi',
  });
  await createItem(knowledge, collection.id, { label: 'yangi qizil olma' });
  const results = await knowledge.searchItems('org-alpha', {
    agentId: collection.agentId,
    kind: collection.kind,
    query: 'qizil olma',
  });
  assert.equal(results[0].item.id, prefix.id);
  assert.equal(results[0].score, 3_000);
});

test('all-token match ranks above a partial-token match', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const allTokens = await createItem(knowledge, collection.id, {
    label: 'yangi qizil olma',
  });
  await createItem(knowledge, collection.id, { label: 'qizil nok' });
  const results = await knowledge.searchItems('org-alpha', {
    agentId: collection.agentId,
    kind: collection.kind,
    query: 'qizil olma',
  });
  assert.equal(results[0].item.id, allTokens.id);
  assert.equal(results[0].matchedTokens, 2);
});

test('deterministic search supports Cyrillic RU', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const item = await createItem(knowledge, collection.id, {
    label: 'Красный чай',
  });
  const results = await knowledge.searchItems('org-alpha', {
    agentId: collection.agentId,
    kind: collection.kind,
    query: 'КРАСНЫЙ, чай!',
  });
  assert.equal(results[0].item.id, item.id);
});

test('deterministic search supports Uzbek Latin apostrophe variants', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const item = await createItem(knowledge, collection.id, {
    label: 'Yangi Oʻzbek non',
  });
  const results = await knowledge.searchItems('org-alpha', {
    agentId: collection.agentId,
    kind: collection.kind,
    query: "o'zbek non",
  });
  assert.equal(results[0].item.id, item.id);
});

test('deterministic search supports mixed RU and Uzbek Latin', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const item = await createItem(knowledge, collection.id, {
    label: 'Красный olma',
  });
  const results = await knowledge.searchItems('org-alpha', {
    agentId: collection.agentId,
    kind: collection.kind,
    query: 'красный OLMA',
  });
  assert.equal(results[0].item.id, item.id);
});

test('punctuation and dash variants normalize to the same tokens', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  const item = await createItem(knowledge, collection.id, {
    label: 'Сумка-красная',
  });
  const results = await knowledge.searchItems('org-alpha', {
    agentId: collection.agentId,
    kind: collection.kind,
    query: 'Сумка—красная!!!',
  });
  assert.equal(results[0].item.id, item.id);
});

test('equal scores and timestamps use id as a stable tie-break', async () => {
  const { knowledge, tables } = await setup();
  const collection = await createCollection(knowledge);
  await createItem(knowledge, collection.id, { label: 'tie marker first' });
  await createItem(knowledge, collection.id, { label: 'tie marker second' });
  tables.items[0].id = 'knowledge_item_b';
  tables.items[1].id = 'knowledge_item_a';
  tables.items[0].updated_at = '2026-01-01T00:00:00.000Z';
  tables.items[1].updated_at = '2026-01-01T00:00:00.000Z';
  const results = await knowledge.searchItems('org-alpha', {
    agentId: collection.agentId,
    kind: collection.kind,
    query: 'tie marker',
  });
  assert.deepEqual(
    results.map((result) => result.item.id),
    ['knowledge_item_a', 'knowledge_item_b'],
  );
});

test('numeric filters are deterministic and tenant scoped', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  await createItem(knowledge, collection.id, { label: 'Amount fixture', amount: 10 });
  const selected = await createItem(knowledge, collection.id, {
    label: 'Amount fixture',
    amount: 20,
  });
  const results = await knowledge.searchItems('org-alpha', {
    agentId: collection.agentId,
    kind: collection.kind,
    query: 'amount',
    numericFilters: [{ index: 1, min: 15, max: 25 }],
  });
  assert.deepEqual(results.map((result) => result.item.id), [selected.id]);
});

test('search never returns an item from another organization', async () => {
  const { knowledge } = await setup();
  const collectionA = await createCollection(knowledge, 'org-alpha');
  const collectionB = await createCollection(knowledge, 'org-beta');
  await createItem(knowledge, collectionA.id, { label: 'Shared marker A' });
  const itemB = await createItem(
    knowledge,
    collectionB.id,
    { label: 'Shared marker B' },
    'org-beta',
  );
  const results = await knowledge.searchItems('org-beta', {
    agentId: collectionB.agentId,
    kind: collectionB.kind,
    query: 'shared marker',
  });
  assert.deepEqual(results.map((result) => result.item.id), [itemB.id]);
});

test('result limit is enforced', async () => {
  const { knowledge } = await setup();
  const collection = await createCollection(knowledge);
  for (let index = 0; index < 3; index += 1) {
    await createItem(knowledge, collection.id, { label: `Limit marker ${index}` });
  }
  const results = await knowledge.searchItems('org-alpha', {
    agentId: collection.agentId,
    kind: collection.kind,
    query: 'limit marker',
    limit: 2,
  });
  assert.equal(results.length, 2);
  await assert.rejects(
    () => knowledge.searchItems('org-alpha', {
      agentId: collection.agentId,
      kind: collection.kind,
      query: 'limit',
      limit: KNOWLEDGE_LIMITS.resultLimit + 1,
    }),
    (error: unknown) =>
      error instanceof KnowledgeValidationError
      && error.code === 'invalid_limit',
  );
});

test('empty search query returns a controlled validation error', async () => {
  const { knowledge } = await setup();
  await assert.rejects(
    () => knowledge.searchItems('org-alpha', {
      agentId: 'fixture-agent',
      kind: 'fixture-entry',
      query: '   ',
    }),
    (error: unknown) =>
      error instanceof KnowledgeValidationError
      && error.code === 'invalid_query',
  );
});
