import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createSotuvchiCatalogService } from '../functions/agents/sotuvchi';
import {
  loadSyntheticMarketFixture,
  MARKET_SYNTHETIC_FIXTURE_PATH,
  renderSyntheticMarketSql,
  summarizeSyntheticMarketFixture,
  validateSyntheticMarketFixture,
} from '../scripts/market-synthetic-fixture';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');
const ORG_ID = 'org_r11_fixture';
const STORE_ID = 'store_r11_fixture';

function loadRawFixture(): Record<string, unknown> {
  const value: unknown = JSON.parse(
    fs.readFileSync(MARKET_SYNTHETIC_FIXTURE_PATH, 'utf8'),
  );
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return structuredClone(value) as Record<string, unknown>;
}

function rawProducts(
  raw: Record<string, unknown>,
): Array<Record<string, unknown>> {
  assert.ok(Array.isArray(raw.products));
  return raw.products as Array<Record<string, unknown>>;
}

function applyMarketMigrations(db: SqliteD1): void {
  const migrationNames = fs.readdirSync(path.join(ROOT, 'migrations'))
    .filter((name) => (
      /^(001[3-9]|002[0-9]|0030)_.*\.sql$/.test(name)
      || name === '0034_classifieds_seller_ownership.sql'
    ))
    .sort();
  // 0034 is the central listing-record compatibility migration. The R1.1
  // fixture does not need later classifieds relations, but the catalog runtime
  // and its fixture must agree on the canonical sotuvchi_products shape.
  assert.equal(migrationNames.length, 19);
  for (const migrationName of migrationNames) {
    db.exec(fs.readFileSync(
      path.join(ROOT, 'migrations', migrationName),
      'utf8',
    ));
  }
}

function seedStore(db: SqliteD1): void {
  db.exec(`
    INSERT INTO organizations (
      id, name, slug, status, default_locale, created_at, updated_at
    ) VALUES (
      '${ORG_ID}', 'R1.1 Synthetic Store', 'r11-synthetic-store',
      'active', 'ru', '2026-07-31T00:00:00.000Z',
      '2026-07-31T00:00:00.000Z'
    );
    INSERT INTO sotuvchi_stores (
      id, org_id, name, locale, delivery_mode, payment_methods_json,
      storefront_code, status, created_at, updated_at
    ) VALUES (
      '${STORE_ID}', '${ORG_ID}', 'R1.1 Synthetic Store', 'ru', 'both',
      '["cash"]', 'r11-synthetic', 'active',
      '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z'
    );
    INSERT INTO owner_pilot_stores (
      org_id, store_id, state, activated_at, paused_at,
      updated_by, updated_at, version
    ) VALUES (
      '${ORG_ID}', '${STORE_ID}', 'active',
      '2026-07-31T00:00:00.000Z', NULL, 'fixture-test',
      '2026-07-31T00:00:00.000Z', 1
    );
  `);
}

test('R1.1 fixture has the required closed synthetic coverage', () => {
  const fixture = loadSyntheticMarketFixture();
  assert.deepEqual(summarizeSyntheticMarketFixture(fixture), {
    fixtureId: 'r1_1_market_pilot_v1',
    categories: 6,
    products: 36,
    available: 28,
    unavailable: 4,
    preorder: 4,
    lowStock: 4,
    withImage: 11,
    withoutImage: 25,
    withoutOptionalSpecifications: 6,
    minPriceMinor: 18_000,
    maxPriceMinor: 1_000_000,
  });
  assert.deepEqual(
    [...new Set(fixture.products.map((product) => product.priceMinor))]
      .filter((price) => [
        29_999,
        30_000,
        30_001,
        50_000,
        200_000,
        1_000_000,
      ].includes(price))
      .sort((left, right) => left - right),
    [29_999, 30_000, 30_001, 50_000, 200_000, 1_000_000],
  );
  for (const product of fixture.products) {
    assert.match(product.name, /\p{Script=Cyrillic}/u);
    assert.ok(product.searchTerms.length >= 2);
    assert.match(product.description, /sintetik/iu);
    assert.match(product.description, /haqiqiy/iu);
  }
});

test('R1.1 fixture validator rejects schema drift and coverage regressions', () => {
  const tooFew = loadRawFixture();
  tooFew.products = rawProducts(tooFew).slice(0, 29);
  assert.throws(() => validateSyntheticMarketFixture(tooFew));

  const unknownField = loadRawFixture();
  unknownField.unapproved = true;
  assert.throws(() => validateSyntheticMarketFixture(unknownField));

  const badStock = loadRawFixture();
  const firstAvailable = rawProducts(badStock).find(
    (product) => product.availability === 'available',
  );
  assert.ok(firstAvailable);
  firstAvailable.onHand = null;
  assert.throws(() => validateSyntheticMarketFixture(badStock));

  const missingBoundary = loadRawFixture();
  const boundary = rawProducts(missingBoundary).find(
    (product) => product.priceMinor === 30_001,
  );
  assert.ok(boundary);
  boundary.priceMinor = 30_002;
  assert.throws(() => validateSyntheticMarketFixture(missingBoundary));

  const unsafeDisclosure = loadRawFixture();
  unsafeDisclosure.disclosureRu = 'Настоящий клиентский каталог.';
  assert.throws(() => validateSyntheticMarketFixture(unsafeDisclosure));
});

test('generated fixture SQL is append-only and requires an existing target', () => {
  const fixture = loadSyntheticMarketFixture();
  const sql = renderSyntheticMarketSql(fixture, ORG_ID, STORE_ID);
  const withoutComments = sql.replaceAll(/^--.*$/gm, '');
  const writeStatements = [...withoutComments.matchAll(
    /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE)\b/gmi,
  )];
  assert.ok(writeStatements.length > 0);
  assert.ok(writeStatements.every(
    (match) => match[1]?.toUpperCase() === 'INSERT',
  ));
  assert.doesNotMatch(
    withoutComments,
    /^\s*(?:DROP|ALTER|UPDATE|DELETE|REPLACE)\b/gmi,
  );
  assert.equal(
    writeStatements.length,
    [...withoutComments.matchAll(/^\s*INSERT OR IGNORE\b/gmi)].length,
  );
  assert.match(sql, new RegExp(`WHERE org_id = '${ORG_ID}'`));
  assert.match(sql, new RegExp(`id = '${STORE_ID}'`));

  const missing = new SqliteD1();
  applyMarketMigrations(missing);
  missing.exec(sql);
  assert.equal(missing.value('SELECT COUNT(*) FROM sotuvchi_products'), 0);
  assert.equal(missing.value('SELECT COUNT(*) FROM sotuvchi_categories'), 0);
});

test('fixture applies idempotently and remains searchable and grounded', async () => {
  const fixture = loadSyntheticMarketFixture();
  const db = new SqliteD1();
  applyMarketMigrations(db);
  seedStore(db);
  const sql = renderSyntheticMarketSql(fixture, ORG_ID, STORE_ID);

  db.exec(sql);
  db.exec(sql);

  assert.equal(db.value(
    `SELECT COUNT(*) FROM sotuvchi_categories
     WHERE org_id = ? AND store_id = ?`,
    ORG_ID,
    STORE_ID,
  ), 6);
  assert.equal(db.value(
    `SELECT COUNT(*) FROM sotuvchi_products
     WHERE org_id = ? AND store_id = ?`,
    ORG_ID,
    STORE_ID,
  ), 36);
  assert.equal(db.value(
    `SELECT COUNT(*) FROM sotuvchi_inventory
     WHERE org_id = ? AND store_id = ?`,
    ORG_ID,
    STORE_ID,
  ), 32);
  assert.equal(db.value(
    `SELECT COUNT(*) FROM sotuvchi_inventory_moves
     WHERE org_id = ? AND store_id = ?`,
    ORG_ID,
    STORE_ID,
  ), 32);
  assert.equal(db.value('SELECT COUNT(*) FROM sotuvchi_orders'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM sotuvchi_notifications'), 0);

  const budgetRows = db.rows<{ price_minor: number }>(
    `SELECT price_minor FROM sotuvchi_products
     WHERE org_id = ? AND store_id = ? AND price_minor BETWEEN 29999 AND 30001
     ORDER BY price_minor`,
    ORG_ID,
    STORE_ID,
  );
  assert.deepEqual(
    [...new Set(budgetRows.map((row) => row.price_minor))],
    [29_999, 30_000, 30_001],
  );
  assert.deepEqual(
    [...new Set(budgetRows
      .filter((row) => row.price_minor <= 30_000)
      .map((row) => row.price_minor))],
    [29_999, 30_000],
  );

  const catalog = createSotuvchiCatalogService(db.asD1());
  const results = await catalog.searchPublishedProducts({
    orgId: ORG_ID,
    storeId: STORE_ID,
    agentId: 'sotuvchi',
    locale: 'uz',
  }, 'suv idishi', 5);
  assert.ok(results.length > 0);
  assert.equal(results[0]?.sourceProductId, 'r11-product-water-bottle');
  assert.equal(results[0]?.sourceStoreId, STORE_ID);
});
