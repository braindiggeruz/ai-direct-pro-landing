import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DatabaseSync,
  type SQLInputValue,
} from 'node:sqlite';

import { createTelegramAgentsRuntimeWiring } from '../functions/api/telegram/agents';
import {
  CatalogAuthorizationError,
  CatalogIdempotencyConflictError,
  CatalogNotFoundError,
  CatalogStateError,
  CatalogValidationError,
  CatalogVersionConflictError,
  createSotuvchiCatalogDomainPort,
  createSotuvchiCatalogService,
  createSotuvchiOnboardingService,
  ensureSotuvchiCatalogSchema,
  formatUzsPrice,
  normalizeAvailability,
  normalizeCategoryName,
  normalizeCreateProductInput,
  normalizeCurrency,
  normalizeMediaRefs,
  normalizePriceMinor,
  normalizeProductDescription,
  normalizeProductName,
  normalizeSku,
  sotuvchiAgentManifest,
  type CatalogProduct,
  type SotuvchiCatalogService,
  type SotuvchiIdentityContext,
  type StoreOwnerContext,
  type StorefrontContext,
} from '../functions/agents/sotuvchi';
import {
  createTelegramAgentUpdateStore,
  createTelegramIdentityPort,
  handleTelegramAgentsWebhook,
  type TelegramAgentsWebhookDependencies,
  type TelegramDeliveryPort,
} from '../functions/channels/telegram';
import { createIdentityService } from '../functions/platform/identity';
import { groundResponse } from '../functions/platform/runtime';

const ROOT = path.resolve(import.meta.dirname, '..');
const BOT = 'agents_catalog_bot';
const SECRET = 'fixture-catalog-webhook-secret';

function sqliteValue(value: unknown): SQLInputValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'bigint'
    || value instanceof Uint8Array
  ) {
    return value;
  }
  throw new Error('unsupported sqlite fixture value');
}

class SqliteD1Statement {
  private bindings: SQLInputValue[] = [];

  constructor(
    private readonly sqlite: DatabaseSync,
    readonly sql: string,
  ) {}

  bind(...values: unknown[]): SqliteD1Statement {
    this.bindings = values.map(sqliteValue);
    return this;
  }

  async run(): Promise<D1Result<unknown>> {
    return this.runSync();
  }

  runSync(): D1Result<unknown> {
    const result = this.sqlite.prepare(this.sql).run(...this.bindings);
    return {
      success: true,
      results: [],
      meta: { changes: Number(result.changes) },
    } as unknown as D1Result<unknown>;
  }

  async first<T>(): Promise<T | null> {
    const row = this.sqlite.prepare(this.sql).get(...this.bindings);
    return (row ?? null) as T | null;
  }

  async all<T>(): Promise<D1Result<T>> {
    const rows = this.sqlite.prepare(this.sql).all(...this.bindings);
    return {
      success: true,
      results: rows as T[],
      meta: { changes: 0 },
    } as unknown as D1Result<T>;
  }
}

class SqliteD1 {
  readonly sqlite = new DatabaseSync(':memory:');

  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys = ON');
  }

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this.sqlite, sql);
  }

  async batch(
    statements: readonly D1PreparedStatement[],
  ): Promise<D1Result<unknown>[]> {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof SqliteD1Statement)) {
          throw new Error('foreign statement in sqlite fixture');
        }
        return statement.runSync();
      });
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  rows<T>(sql: string, ...values: SQLInputValue[]): T[] {
    return this.sqlite.prepare(sql).all(...values) as T[];
  }

  value(sql: string, ...values: SQLInputValue[]): unknown {
    const row = this.sqlite.prepare(sql).get(...values);
    return row ? Object.values(row)[0] : null;
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

let requestSequence = 0;

function requestId(prefix = 'catalog'): string {
  requestSequence += 1;
  return `${prefix}-${requestSequence}`;
}

interface StoreFixture {
  catalog: SotuvchiCatalogService;
  identity: SotuvchiIdentityContext;
  owner: StoreOwnerContext;
  storefront: StorefrontContext;
  storefrontCode: string;
}

async function setupStore(
  fixture: SqliteD1,
  externalId: string,
  locale: 'ru' | 'uz' = 'ru',
): Promise<StoreFixture> {
  const db = fixture.asD1();
  const telegramExternalId = /^\d+$/.test(externalId)
    ? externalId
    : [...externalId]
        .reduce(
          (hash, character) =>
            (hash * 131n + BigInt(character.codePointAt(0) ?? 0)) %
            9_000_000_000_000_000_000n,
          1n,
        )
        .toString();
  const identity = await createIdentityService(db).getOrCreateIdentity(
    'telegram',
    telegramExternalId,
  );
  const context: SotuvchiIdentityContext = {
    identityId: identity.identity.id,
    botUsername: BOT,
    requestId: requestId('onboarding'),
    locale,
  };
  const onboarding = createSotuvchiOnboardingService(db);
  let snapshot = await onboarding.startOnboarding(context);
  snapshot = await onboarding.submitOnboardingStep(
    { ...context, requestId: requestId('onboarding') },
    {
      step: 'name',
      value: locale === 'ru' ? 'Учебный магазин' : 'Sinov do‘koni',
      expectedVersion: snapshot.version,
      idempotencyKey: requestId('step'),
    },
  );
  snapshot = await onboarding.submitOnboardingStep(
    { ...context, requestId: requestId('onboarding') },
    {
      step: 'locale',
      value: locale,
      expectedVersion: snapshot.version,
      idempotencyKey: requestId('step'),
    },
  );
  snapshot = await onboarding.submitOnboardingStep(
    { ...context, requestId: requestId('onboarding') },
    {
      step: 'delivery',
      value: 'both',
      expectedVersion: snapshot.version,
      idempotencyKey: requestId('step'),
    },
  );
  snapshot = await onboarding.submitOnboardingStep(
    { ...context, requestId: requestId('onboarding') },
    {
      step: 'payment',
      value: ['cash'],
      expectedVersion: snapshot.version,
      idempotencyKey: requestId('step'),
    },
  );
  const completed = await onboarding.confirmOnboarding(
    { ...context, requestId: requestId('onboarding') },
    snapshot.version,
  );
  const catalog = createSotuvchiCatalogService(db);
  const owner = await catalog.resolveOwnerContext({
    identityId: context.identityId,
    orgId: completed.store.orgId,
    requestId: requestId('owner'),
    locale,
  });
  return {
    catalog,
    identity: context,
    owner,
    storefront: {
      orgId: completed.store.orgId,
      storeId: completed.store.id,
      agentId: 'sotuvchi',
      locale,
    },
    storefrontCode: completed.store.storefrontCode,
  };
}

function nextOwner(
  owner: StoreOwnerContext,
  prefix = 'owner',
): StoreOwnerContext {
  return { ...owner, requestId: requestId(prefix) };
}

function productInput(
  overrides: Partial<{
    categoryId: string | null;
    sku: string | null;
    name: string;
    description: string | null;
    priceMinor: number;
    currency: 'UZS';
    availability: 'available' | 'unavailable' | 'preorder';
    mediaRefs: readonly string[];
  }> = {},
) {
  return {
    name: 'Olma sharbati',
    description: 'Tabiiy sinov mahsuloti',
    priceMinor: 125_000,
    currency: 'UZS' as const,
    availability: 'available' as const,
    mediaRefs: ['opaque_media_fixture'],
    ...overrides,
  };
}

async function createAndPublish(
  service: SotuvchiCatalogService,
  owner: StoreOwnerContext,
  overrides: Parameters<typeof productInput>[0] = {},
): Promise<CatalogProduct> {
  const draft = await service.createProduct(
    nextOwner(owner, 'create'),
    productInput(overrides),
  );
  return service.publishProduct(
    nextOwner(owner, 'publish'),
    draft.id,
    draft.version,
  );
}

test('category validation accepts Unicode RU and Uzbek Latin names', () => {
  assert.equal(normalizeCategoryName('  Чой O‘rik  '), 'Чой O‘rik');
});

test('category validation rejects short, control and URL-only names', () => {
  for (const value of ['x', 'bad\u0000name', 'https://example.test/category']) {
    assert.throws(() => normalizeCategoryName(value), CatalogValidationError);
  }
});

test('product validation accepts the bounded domain model', () => {
  assert.deepEqual(
    normalizeCreateProductInput(productInput()),
    {
      categoryId: null,
      sku: null,
      ...productInput(),
    },
  );
  assert.equal(normalizeProductName('  Test товар  '), 'Test товар');
  assert.equal(normalizeProductDescription('  plain text  '), 'plain text');
});

test('product validation rejects invalid name and description', () => {
  assert.throws(() => normalizeProductName('x'), CatalogValidationError);
  assert.throws(
    () => normalizeProductDescription(`bad${String.fromCharCode(0)}text`),
    CatalogValidationError,
  );
});

test('price accepts bounded integer UZS and rejects float or negative', () => {
  assert.equal(normalizePriceMinor(100_000), 100_000);
  assert.equal(formatUzsPrice(100_000), '100 000');
  assert.throws(() => normalizePriceMinor(12.5), CatalogValidationError);
  assert.throws(() => normalizePriceMinor(-1), CatalogValidationError);
  assert.throws(
    () => normalizePriceMinor(1_000_000_000_001),
    CatalogValidationError,
  );
});

test('currency and availability are exact allowlists', () => {
  assert.equal(normalizeCurrency('UZS'), 'UZS');
  assert.equal(normalizeAvailability('preorder'), 'preorder');
  assert.throws(() => normalizeCurrency('USD'), CatalogValidationError);
  assert.throws(() => normalizeAvailability('stocked'), CatalogValidationError);
});

test('SKU is optional, bounded, canonical and not a global id', () => {
  assert.equal(normalizeSku(null), null);
  assert.equal(normalizeSku(' sku-01 '), 'SKU-01');
  assert.throws(() => normalizeSku('bad sku'), CatalogValidationError);
});

test('media references are opaque, bounded and duplicate-free', () => {
  assert.deepEqual(normalizeMediaRefs(['opaque_ref-1']), ['opaque_ref-1']);
  assert.throws(
    () => normalizeMediaRefs(['https://example.test/image']),
    CatalogValidationError,
  );
  assert.throws(
    () => normalizeMediaRefs(['same', 'same']),
    CatalogValidationError,
  );
});

test('user-supplied tenant authority is rejected by product input', () => {
  assert.throws(
    () => normalizeCreateProductInput({
      ...productInput(),
      orgId: 'org-override',
    }),
    CatalogValidationError,
  );
});

test('runtime bootstrap is repeatable and creates catalog objects', async () => {
  const fixture = new SqliteD1();
  await ensureSotuvchiCatalogSchema(fixture.asD1());
  await ensureSotuvchiCatalogSchema(fixture.asD1());
  const objects = fixture.rows<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE name LIKE 'sotuvchi_%' OR name LIKE 'idx_sotuvchi_%'`,
  ).map((row) => row.name);
  for (const expected of [
    'sotuvchi_categories',
    'sotuvchi_products',
    'sotuvchi_catalog_operations',
    'sotuvchi_storefront_sessions',
    'idx_sotuvchi_categories_store_status_sort',
    'idx_sotuvchi_categories_org_store',
    'idx_sotuvchi_products_store_status_name',
    'idx_sotuvchi_products_store_category',
    'idx_sotuvchi_products_org_store',
  ]) {
    assert.ok(objects.includes(expected), expected);
  }
});

test('migration and bootstrap keep tables, indexes and constraints in parity', () => {
  const schema = fs.readFileSync(
    path.join(ROOT, 'functions/agents/sotuvchi/catalog/schema.ts'),
    'utf8',
  );
  const migration = fs.readFileSync(
    path.join(ROOT, 'migrations/0019_sotuvchi_catalog.sql'),
    'utf8',
  );
  for (const marker of [
    'sotuvchi_categories',
    'sotuvchi_products',
    'sotuvchi_catalog_operations',
    'sotuvchi_storefront_sessions',
    'idx_sotuvchi_products_store_status_name',
    'idx_sotuvchi_products_store_category',
    'idx_sotuvchi_products_org_store',
    "currency = 'UZS'",
    "status IN ('draft', 'published', 'archived')",
    'UNIQUE (store_id, sku)',
    'FOREIGN KEY (org_id, store_id, category_id)',
  ]) {
    assert.ok(schema.includes(marker), marker);
    assert.ok(migration.includes(marker), marker);
  }
  const executable = migration
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  assert.doesNotMatch(executable, /(?:^|;)\s*(?:DROP|DELETE|ALTER)\b/i);
});

test('category create and sorted owner listing are tenant-scoped', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-1001');
  const later = await setup.catalog.createCategory(
    nextOwner(setup.owner),
    { name: 'Ichimliklar', sortOrder: 20 },
  );
  const first = await setup.catalog.createCategory(
    nextOwner(setup.owner),
    { name: 'Mevalar', sortOrder: 10 },
  );
  assert.equal(first.status, 'active');
  assert.match(first.slug, /^c-[a-z2-7]{16}$/);
  assert.deepEqual(
    (await setup.catalog.listCategories(nextOwner(setup.owner)))
      .map((category) => category.id),
    [first.id, later.id],
  );
});

test('duplicate category create is idempotent', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-1002');
  const owner = nextOwner(setup.owner, 'same-category');
  const first = await setup.catalog.createCategory(owner, { name: 'Non' });
  const duplicate = await setup.catalog.createCategory(owner, { name: 'Non' });
  assert.equal(duplicate.id, first.id);
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_categories'), 1);
});

test('same category idempotency key with different input conflicts', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-1003');
  const owner = nextOwner(setup.owner, 'category-conflict');
  await setup.catalog.createCategory(owner, { name: 'Non' });
  await assert.rejects(
    () => setup.catalog.createCategory(owner, { name: 'Sut' }),
    CatalogIdempotencyConflictError,
  );
});

test('category slug collision retries without duplicating category', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-1004');
  const slugs = [
    'c-aaaaaaaaaaaaaaaa',
    'c-aaaaaaaaaaaaaaaa',
    'c-bbbbbbbbbbbbbbbb',
  ];
  const service = createSotuvchiCatalogService(fixture.asD1(), {
    categorySlugGenerator: () => slugs.shift() ?? 'c-cccccccccccccccc',
  });
  const first = await service.createCategory(
    nextOwner(setup.owner),
    { name: 'Birinchi' },
  );
  const second = await service.createCategory(
    nextOwner(setup.owner),
    { name: 'Ikkinchi' },
  );
  assert.equal(first.slug, 'c-aaaaaaaaaaaaaaaa');
  assert.equal(second.slug, 'c-bbbbbbbbbbbbbbbb');
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_categories'), 2);
});

test('active category can be updated and archived instead of deleted', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-1005');
  const created = await setup.catalog.createCategory(
    nextOwner(setup.owner),
    { name: 'Eski', sortOrder: 2 },
  );
  const updated = await setup.catalog.updateCategory(
    nextOwner(setup.owner),
    created.id,
    { name: 'Yangi', sortOrder: 1 },
  );
  const archived = await setup.catalog.archiveCategory(
    nextOwner(setup.owner),
    updated.id,
  );
  assert.equal(updated.slug, created.slug);
  assert.equal(archived.status, 'archived');
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_categories'), 1);
});

test('cross-store category assignment is rejected', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, 'catalog-1006-a');
  const second = await setupStore(fixture, 'catalog-1006-b');
  const category = await first.catalog.createCategory(
    nextOwner(first.owner),
    { name: 'Foreign' },
  );
  await assert.rejects(
    () => second.catalog.createProduct(
      nextOwner(second.owner),
      productInput({ categoryId: category.id }),
    ),
    CatalogNotFoundError,
  );
});

test('product is created as a versioned draft', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-2001');
  const product = await setup.catalog.createProduct(
    nextOwner(setup.owner),
    productInput({ sku: 'demo-1' }),
  );
  assert.equal(product.status, 'draft');
  assert.equal(product.version, 1);
  assert.equal(product.currency, 'UZS');
  assert.equal(product.sku, 'DEMO-1');
});

test('duplicate product create is idempotent and does not duplicate rows', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-2002');
  const owner = nextOwner(setup.owner, 'same-product');
  const first = await setup.catalog.createProduct(owner, productInput());
  const duplicate = await setup.catalog.createProduct(owner, productInput());
  assert.equal(duplicate.id, first.id);
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_products'), 1);
});

test('owner product listing is store-scoped', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, 'catalog-2003-a');
  const second = await setupStore(fixture, 'catalog-2003-b');
  await first.catalog.createProduct(nextOwner(first.owner), productInput());
  await second.catalog.createProduct(
    nextOwner(second.owner),
    productInput({ name: 'Boshqa mahsulot' }),
  );
  assert.equal(
    (await first.catalog.listProducts(nextOwner(first.owner))).length,
    1,
  );
});

test('product update increments version exactly once', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-2004');
  const draft = await setup.catalog.createProduct(
    nextOwner(setup.owner),
    productInput(),
  );
  const owner = nextOwner(setup.owner, 'update-once');
  const updated = await setup.catalog.updateProduct(
    owner,
    draft.id,
    draft.version,
    { priceMinor: 130_000, availability: 'preorder' },
  );
  const duplicate = await setup.catalog.updateProduct(
    owner,
    draft.id,
    draft.version,
    { priceMinor: 130_000, availability: 'preorder' },
  );
  assert.equal(updated.version, 2);
  assert.equal(duplicate.version, 2);
  assert.equal(updated.priceMinor, 130_000);
});

test('stale product update raises CatalogVersionConflictError', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-2005');
  const draft = await setup.catalog.createProduct(
    nextOwner(setup.owner),
    productInput(),
  );
  await setup.catalog.updateProduct(
    nextOwner(setup.owner),
    draft.id,
    draft.version,
    { name: 'Updated product' },
  );
  await assert.rejects(
    () => setup.catalog.updateProduct(
      nextOwner(setup.owner),
      draft.id,
      draft.version,
      { name: 'Stale product' },
    ),
    CatalogVersionConflictError,
  );
});

test('publish, unpublish and archive enforce lifecycle and versions', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-2006');
  const draft = await setup.catalog.createProduct(
    nextOwner(setup.owner),
    productInput(),
  );
  const published = await setup.catalog.publishProduct(
    nextOwner(setup.owner),
    draft.id,
    draft.version,
  );
  const hidden = await setup.catalog.unpublishProduct(
    nextOwner(setup.owner),
    published.id,
    published.version,
  );
  const archived = await setup.catalog.archiveProduct(
    nextOwner(setup.owner),
    hidden.id,
    hidden.version,
  );
  assert.deepEqual(
    [published.status, hidden.status, archived.status],
    ['published', 'draft', 'archived'],
  );
  assert.deepEqual(
    [published.version, hidden.version, archived.version],
    [2, 3, 4],
  );
});

test('duplicate publish does not increase version twice', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-2007');
  const draft = await setup.catalog.createProduct(
    nextOwner(setup.owner),
    productInput(),
  );
  const owner = nextOwner(setup.owner, 'publish-once');
  const first = await setup.catalog.publishProduct(
    owner,
    draft.id,
    draft.version,
  );
  const duplicate = await setup.catalog.publishProduct(
    owner,
    draft.id,
    draft.version,
  );
  assert.equal(first.version, 2);
  assert.equal(duplicate.version, 2);
});

test('archived product cannot be updated or restored', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-2008');
  const draft = await setup.catalog.createProduct(
    nextOwner(setup.owner),
    productInput(),
  );
  const archived = await setup.catalog.archiveProduct(
    nextOwner(setup.owner),
    draft.id,
    draft.version,
  );
  await assert.rejects(
    () => setup.catalog.updateProduct(
      nextOwner(setup.owner),
      archived.id,
      archived.version,
      { name: 'Restore attempt' },
    ),
    CatalogStateError,
  );
});

test('SKU is unique inside one store', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-2009');
  await setup.catalog.createProduct(
    nextOwner(setup.owner),
    productInput({ sku: 'same-sku' }),
  );
  await assert.rejects(
    () => setup.catalog.createProduct(
      nextOwner(setup.owner),
      productInput({ name: 'Second', sku: 'SAME-SKU' }),
    ),
    CatalogStateError,
  );
});

test('same SKU is allowed in another store', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, 'catalog-2010-a');
  const second = await setupStore(fixture, 'catalog-2010-b');
  await first.catalog.createProduct(
    nextOwner(first.owner),
    productInput({ sku: 'shared' }),
  );
  const product = await second.catalog.createProduct(
    nextOwner(second.owner),
    productInput({ sku: 'shared' }),
  );
  assert.equal(product.sku, 'SHARED');
});

test('published product in archived category is hidden without deletion', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-3001');
  const category = await setup.catalog.createCategory(
    nextOwner(setup.owner),
    { name: 'Hidden category' },
  );
  const product = await createAndPublish(
    setup.catalog,
    setup.owner,
    { categoryId: category.id },
  );
  await setup.catalog.archiveCategory(nextOwner(setup.owner), category.id);
  assert.equal(
    (await setup.catalog.searchPublishedProducts(
      setup.storefront,
      product.name,
    )).length,
    0,
  );
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_products'), 1);
});

test('archived category prevents publication of its draft product', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-3002');
  const category = await setup.catalog.createCategory(
    nextOwner(setup.owner),
    { name: 'Inactive category' },
  );
  const draft = await setup.catalog.createProduct(
    nextOwner(setup.owner),
    productInput({ categoryId: category.id }),
  );
  await setup.catalog.archiveCategory(nextOwner(setup.owner), category.id);
  await assert.rejects(
    () => setup.catalog.publishProduct(
      nextOwner(setup.owner),
      draft.id,
      draft.version,
    ),
    CatalogStateError,
  );
});

test('only published products are visible to buyer', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-3003');
  const draft = await setup.catalog.createProduct(
    nextOwner(setup.owner),
    productInput({ name: 'Draft item' }),
  );
  const published = await createAndPublish(
    setup.catalog,
    setup.owner,
    { name: 'Published item' },
  );
  const archivedDraft = await setup.catalog.createProduct(
    nextOwner(setup.owner),
    productInput({ name: 'Archived item' }),
  );
  await setup.catalog.archiveProduct(
    nextOwner(setup.owner),
    archivedDraft.id,
    archivedDraft.version,
  );
  const listed = await setup.catalog.listPublishedProducts(setup.storefront);
  assert.deepEqual(listed.map((item) => item.product.id), [published.id]);
  await assert.rejects(
    () => setup.catalog.getPublishedProduct(setup.storefront, draft.id),
    CatalogNotFoundError,
  );
});

test('inactive store hides all buyer products and blocks owner mutation', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-3004');
  await createAndPublish(setup.catalog, setup.owner);
  fixture.sqlite.prepare(
    `UPDATE sotuvchi_stores SET status = 'suspended' WHERE id = ?`,
  ).run(setup.owner.storeId);
  await assert.rejects(
    () => setup.catalog.listPublishedProducts(setup.storefront),
    CatalogNotFoundError,
  );
  await assert.rejects(
    () => setup.catalog.createCategory(
      nextOwner(setup.owner),
      { name: 'Blocked' },
    ),
    CatalogAuthorizationError,
  );
});

test('search ranks exact then prefix then all-token matches', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-4001');
  const exact = await createAndPublish(
    setup.catalog,
    setup.owner,
    { name: 'Olma' },
  );
  const prefix = await createAndPublish(
    setup.catalog,
    setup.owner,
    { name: 'Olma sharbati' },
  );
  const allTokens = await createAndPublish(
    setup.catalog,
    setup.owner,
    { name: 'Shirin olma ichimligi' },
  );
  const results = await setup.catalog.searchPublishedProducts(
    setup.storefront,
    'olma',
  );
  assert.deepEqual(
    results.slice(0, 3).map((result) => result.product.id),
    [exact.id, prefix.id, allTokens.id],
  );
  assert.ok(results[0].score > results[1].score);
});

test('search supports partial token matches with deterministic score', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-4002');
  await createAndPublish(
    setup.catalog,
    setup.owner,
    { name: 'Qora choy' },
  );
  const [result] = await setup.catalog.searchPublishedProducts(
    setup.storefront,
    'qora limon',
  );
  assert.equal(result.matchedTokens, 1);
  assert.equal(result.score, 1_001);
});

test('search stable tie-break uses normalized name then id', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-4003');
  await createAndPublish(
    setup.catalog,
    setup.owner,
    { name: 'Choy B' },
  );
  await createAndPublish(
    setup.catalog,
    setup.owner,
    { name: 'Choy A' },
  );
  const results = await setup.catalog.searchPublishedProducts(
    setup.storefront,
    'choy',
  );
  assert.deepEqual(
    results.map((result) => result.product.name),
    ['Choy A', 'Choy B'],
  );
});

test('empty search query is controlled and result limit is enforced', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-4004');
  await assert.rejects(
    () => setup.catalog.searchPublishedProducts(setup.storefront, ''),
    CatalogValidationError,
  );
  await assert.rejects(
    () => setup.catalog.searchPublishedProducts(
      setup.storefront,
      'test',
      21,
    ),
    CatalogValidationError,
  );
});

test('RU punctuation normalization is deterministic', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-4005');
  const product = await createAndPublish(
    setup.catalog,
    setup.owner,
    { name: 'Чай-Мята' },
  );
  const [result] = await setup.catalog.searchPublishedProducts(
    setup.storefront,
    'ЧАЙ мята',
  );
  assert.equal(result.product.id, product.id);
});

test('Uzbek Latin apostrophe normalization is deterministic', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-4006', 'uz');
  const product = await createAndPublish(
    setup.catalog,
    setup.owner,
    { name: 'O‘rik sharbati' },
  );
  const [result] = await setup.catalog.searchPublishedProducts(
    setup.storefront,
    'orik',
  );
  assert.equal(result.product.id, product.id);
});

test('mixed RU and Uzbek Latin query remains deterministic', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-4007');
  const product = await createAndPublish(
    setup.catalog,
    setup.owner,
    { name: 'Olma Чай' },
  );
  const [result] = await setup.catalog.searchPublishedProducts(
    setup.storefront,
    'olma чай',
  );
  assert.equal(result.product.id, product.id);
});

test('buyer Runtime response exposes grounded price and availability Facts', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-5001');
  const product = await createAndPublish(
    setup.catalog,
    setup.owner,
    { name: 'Grounded Olma', priceMinor: 222_000, availability: 'preorder' },
  );
  const wiring = createTelegramAgentsRuntimeWiring(fixture.asD1(), BOT);
  await setup.catalog.bindStorefrontSession({
    botUsername: BOT,
    identityId: setup.identity.identityId,
    context: setup.storefront,
  });
  const result = await wiring.runtime.run({
    requestId: requestId('runtime'),
    orgId: setup.storefront.orgId,
    agentId: 'sotuvchi',
    identityId: setup.identity.identityId,
    locale: 'ru',
    message: { kind: 'text', text: product.name },
  });
  assert.equal(result.status, 'answered');
  assert.equal(result.grounding.status, 'passed');
  const values = result.facts[0]?.values;
  assert.equal(values?.['catalog.product.price_minor'], 222_000);
  assert.equal(values?.['catalog.product.currency'], 'UZS');
  assert.equal(values?.['catalog.product.availability'], 'preorder');
});

test('unsupported buyer price claim fails grounding', () => {
  const grounding = groundResponse(
    {
      messages: [{ text: 'Цена 999 UZS' }],
      claims: [{ key: 'catalog.product.price_minor', value: 999 }],
    },
    [{
      toolName: 'catalog.product.search',
      values: {
        'catalog.product.price_minor': 100,
        'catalog.response.text': 'Цена 100 UZS',
      },
    }],
  );
  assert.equal(grounding.status, 'failed');
});

test('buyer outbound contains Facts projection and no raw product row', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-5002');
  await createAndPublish(
    setup.catalog,
    setup.owner,
    { name: 'Projection product' },
  );
  const port = createSotuvchiCatalogDomainPort(setup.catalog);
  const facts = await port.execute({
    agentId: 'sotuvchi',
    operation: 'catalog.product.search',
    org: {
      orgId: setup.storefront.orgId,
      requestId: requestId('facts'),
      locale: 'ru',
    },
    input: { query: 'Projection product', limit: 5 },
  });
  assert.equal(facts['catalog.product.name'], 'Projection product');
  const serialized = JSON.stringify(facts);
  assert.ok(!serialized.includes('"orgId"'));
  assert.ok(!serialized.includes('"storeId"'));
  assert.ok(!serialized.includes('last_operation_key'));
});

test('org A cannot read product B by id', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, 'catalog-6001-a');
  const second = await setupStore(fixture, 'catalog-6001-b');
  const foreign = await second.catalog.createProduct(
    nextOwner(second.owner),
    productInput(),
  );
  await assert.rejects(
    () => first.catalog.getProduct(nextOwner(first.owner), foreign.id),
    CatalogNotFoundError,
  );
});

test('owner A cannot update product B', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, 'catalog-6002-a');
  const second = await setupStore(fixture, 'catalog-6002-b');
  const foreign = await second.catalog.createProduct(
    nextOwner(second.owner),
    productInput(),
  );
  await assert.rejects(
    () => second.catalog.updateProduct(
      {
        ...second.owner,
        identityId: first.identity.identityId,
        requestId: requestId('forged-owner'),
      },
      foreign.id,
      foreign.version,
      { name: 'Forbidden' },
    ),
    CatalogAuthorizationError,
  );
});

test('buyer storefront A cannot search product B', async () => {
  const fixture = new SqliteD1();
  const first = await setupStore(fixture, 'catalog-6003-a');
  const second = await setupStore(fixture, 'catalog-6003-b');
  await createAndPublish(
    second.catalog,
    second.owner,
    { name: 'Foreign unique product' },
  );
  assert.deepEqual(
    await first.catalog.searchPublishedProducts(
      first.storefront,
      'Foreign unique product',
    ),
    [],
  );
});

test('storefront code cannot act as seller identity authority', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-6004');
  await assert.rejects(
    () => setup.catalog.createProduct(
      {
        ...setup.owner,
        identityId: setup.storefrontCode,
        requestId: requestId('route-owner'),
      },
      productInput(),
    ),
    CatalogAuthorizationError,
  );
});

test('storefront session binds platform identity and resolves trusted store', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, 'catalog-6005-owner');
  const buyer = await createIdentityService(fixture.asD1())
    .getOrCreateIdentity('telegram', '860050002');
  await setup.catalog.bindStorefrontSession({
    botUsername: BOT,
    identityId: buyer.identity.id,
    context: setup.storefront,
  });
  assert.deepEqual(
    await setup.catalog.resolveStoredStorefrontContext(
      BOT,
      buyer.identity.id,
    ),
    setup.storefront,
  );
});

test('manifest exposes catalog closed-list tools with AI mutations disabled', () => {
  assert.deepEqual(
    sotuvchiAgentManifest.capabilities,
    ['store.onboarding', 'store.catalog', 'commerce.order'],
  );
  assert.ok(sotuvchiAgentManifest.tools.length >= 9);
  assert.ok(sotuvchiAgentManifest.tools.every((tool) =>
    tool.name.startsWith('catalog.')
    || tool.name.startsWith('checkout.')
    || tool.name.startsWith('seller.')));
  assert.equal(sotuvchiAgentManifest.policies.aiSelection, 'disabled');
  const names = sotuvchiAgentManifest.tools.map((tool) => tool.name);
  assert.ok(!names.includes('catalog.execute'));
  // Still exactly one buyer checkout entry point. P2.5 added the seller order
  // and inventory tools; payment and handoff remain out of the manifest.
  assert.deepEqual(
    names.filter((name) => name.startsWith('checkout.')),
    ['checkout.start'],
  );
  for (const forbidden of ['payment', 'refund', 'handoff', 'cart']) {
    assert.ok(!names.some((name) => name.includes(forbidden)), forbidden);
  }
});

class MemoryDelivery implements TelegramDeliveryPort {
  readonly sent: Array<{ threadRef: string; text: string; keyboard?: unknown }> = [];
  readonly callbacks: string[] = [];

  async sendText(
    threadRef: string,
    text: string,
    keyboard?: never,
  ): Promise<boolean> {
    this.sent.push({ threadRef, text, ...(keyboard ? { keyboard } : {}) });
    return true;
  }

  async answerCallback(callbackQueryId: string): Promise<boolean> {
    this.callbacks.push(callbackQueryId);
    return true;
  }
}

function telegramMessage(
  updateId: number,
  userId: number,
  text: string,
  languageCode: string,
) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      chat: { id: userId, type: 'private' },
      from: { id: userId, language_code: languageCode },
      text,
    },
  };
}

function telegramHarness(fixture: SqliteD1) {
  const db = fixture.asD1();
  const wiring = createTelegramAgentsRuntimeWiring(db, BOT);
  const delivery = new MemoryDelivery();
  const dependencies: TelegramAgentsWebhookDependencies = {
    botUsername: BOT,
    webhookSecret: SECRET,
    updates: createTelegramAgentUpdateStore(db),
    identities: createTelegramIdentityPort(createIdentityService(db)),
    contexts: wiring.contexts,
    runtime: wiring.runtime,
    delivery,
  };

  async function invoke(raw: unknown) {
    const scheduled: Promise<unknown>[] = [];
    const response = await handleTelegramAgentsWebhook(
      new Request('https://gptbot.uz/api/telegram/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': SECRET,
        },
        body: JSON.stringify(raw),
      }),
      dependencies,
      (promise) => scheduled.push(promise),
    );
    await Promise.all(scheduled);
    return response;
  }
  return { delivery, invoke, wiring };
}

test('Telegram seller creates and publishes product offline', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '7001');
  const harness = telegramHarness(fixture);
  await harness.invoke(
    telegramMessage(
      700_001,
      7001,
      'Товар: Telegram Olma | 145000 | available | Test description',
      'ru',
    ),
  );
  const row = fixture.rows<{ id: string; version: number }>(
    'SELECT id, version FROM sotuvchi_products',
  )[0];
  await harness.invoke(
    telegramMessage(
      700_002,
      7001,
      `Опубликовать: ${row.id} | ${row.version}`,
      'ru',
    ),
  );
  assert.equal(
    fixture.value('SELECT status FROM sotuvchi_products'),
    'published',
  );
  assert.ok(harness.delivery.sent.some((message) =>
    message.text.includes('Товар опубликован')));
  assert.equal(setup.owner.storeId, fixture.value('SELECT store_id FROM sotuvchi_products'));
});

test('duplicate Telegram create update creates no duplicate product', async () => {
  const fixture = new SqliteD1();
  await setupStore(fixture, '7002');
  const harness = telegramHarness(fixture);
  const update = telegramMessage(
    700_101,
    7002,
    'Товар: Duplicate Olma | 100000 | preorder | Test',
    'ru',
  );
  await harness.invoke(update);
  const duplicate = await harness.invoke(update);
  assert.equal(await duplicate.text(), 'duplicate');
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_products'), 1);
});

test('Telegram buyer enters storefront and searches in following message', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '7003');
  await createAndPublish(
    setup.catalog,
    setup.owner,
    { name: 'Buyer Olma', priceMinor: 175_000 },
  );
  const harness = telegramHarness(fixture);
  await harness.invoke(
    telegramMessage(
      700_201,
      7991,
      `/start agent_${setup.storefrontCode}`,
      'ru',
    ),
  );
  await harness.invoke(
    telegramMessage(700_202, 7991, 'сколько стоит Buyer Olma', 'ru'),
  );
  const last = harness.delivery.sent.at(-1)?.text ?? '';
  assert.ok(last.includes('Buyer Olma'));
  assert.ok(last.includes('175 000 сум'));
  assert.equal(
    fixture.value('SELECT COUNT(*) FROM sotuvchi_storefront_sessions'),
    1,
  );
});

test('Telegram buyer never receives unpublished product', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '7004');
  await setup.catalog.createProduct(
    nextOwner(setup.owner),
    productInput({ name: 'Hidden Telegram item' }),
  );
  const harness = telegramHarness(fixture);
  await harness.invoke(
    telegramMessage(
      700_301,
      7992,
      `/start agent_${setup.storefrontCode}`,
      'ru',
    ),
  );
  await harness.invoke(
    telegramMessage(700_302, 7992, 'Hidden Telegram item', 'ru'),
  );
  assert.ok(
    harness.delivery.sent.at(-1)?.text.includes('Не нашёл такой товар'),
  );
});

test('Telegram Uzbek Latin storefront flow is deterministic', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '7005', 'uz');
  await createAndPublish(
    setup.catalog,
    setup.owner,
    { name: 'O‘rik mahsuloti', availability: 'available' },
  );
  const harness = telegramHarness(fixture);
  await harness.invoke(
    telegramMessage(
      700_401,
      7993,
      `/start agent_${setup.storefrontCode}`,
      'uz',
    ),
  );
  await harness.invoke(
    telegramMessage(700_402, 7993, 'orik', 'uz'),
  );
  const last = harness.delivery.sent.at(-1)?.text ?? '';
  assert.ok(last.includes('O‘rik mahsuloti'));
  assert.ok(last.includes('Mavjud'));
});

test('Telegram mixed storefront query stays inside trusted store', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '7006');
  await createAndPublish(
    setup.catalog,
    setup.owner,
    { name: 'Olma Чай mahsuloti' },
  );
  const harness = telegramHarness(fixture);
  await harness.invoke(
    telegramMessage(
      700_501,
      7994,
      `/start agent_${setup.storefrontCode}`,
      'ru',
    ),
  );
  await harness.invoke(
    telegramMessage(700_502, 7994, 'olma чай', 'ru'),
  );
  assert.ok(
    harness.delivery.sent.at(-1)?.text.includes('Olma Чай mahsuloti'),
  );
});

test('Telegram storefront route cannot launch seller mutation', async () => {
  const fixture = new SqliteD1();
  const setup = await setupStore(fixture, '7007');
  const harness = telegramHarness(fixture);
  await harness.invoke(
    telegramMessage(
      700_601,
      7995,
      `/start agent_${setup.storefrontCode}`,
      'ru',
    ),
  );
  await harness.invoke(
    telegramMessage(
      700_602,
      7995,
      'Товар: Forbidden | 100000 | available | Test',
      'ru',
    ),
  );
  assert.equal(fixture.value('SELECT COUNT(*) FROM sotuvchi_products'), 0);
});
