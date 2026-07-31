// R1.1 synthetic Market fixture validator and SQL renderer.
//
// Default mode is read-only validation. SQL rendering requires an exact org,
// store and typed store confirmation. The generated SQL is append-only:
// INSERT OR IGNORE only, no UPDATE/DELETE/archiving and no production call.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  normalizeCreateCategoryInput,
  normalizeCreateProductInput,
  normalizedProductName,
  requireCatalogId,
  type CatalogAvailability,
  type CatalogProductSpecification,
} from '../functions/agents/sotuvchi/catalog';

const ROOT = path.resolve(import.meta.dirname, '..');
export const MARKET_SYNTHETIC_FIXTURE_PATH = path.join(
  ROOT,
  'fixtures',
  'market',
  'r1_1_synthetic_catalog.json',
);

const KEY = /^[a-z][a-z0-9-]{1,31}$/;
const FIXTURE_ID = /^[a-z][a-z0-9_]{4,63}$/;
const FIXTURE_KEYS = new Set([
  'schemaVersion',
  'fixtureId',
  'disclosureRu',
  'disclosureUz',
  'categories',
  'products',
]);
const CATEGORY_KEYS = new Set([
  'key',
  'name',
  'sortOrder',
]);
const PRODUCT_KEYS = new Set([
  'key',
  'categoryKey',
  'sku',
  'name',
  'priceMinor',
  'availability',
  'onHand',
  'searchTerms',
  'specifications',
  'mediaRefs',
]);
const REQUIRED_BOUNDARIES = [
  29_999,
  30_000,
  30_001,
  50_000,
  200_000,
  1_000_000,
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (
      Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null
    );
}

function exactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size
    && keys.every((key) => expected.has(key));
}

function requiredString(value: unknown, maximum = 600): string {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
    || value.length > maximum
  ) {
    throw new Error('synthetic fixture rejected');
  }
  return value.trim();
}

export interface SyntheticCategory {
  key: string;
  name: string;
  sortOrder: number;
}

export interface SyntheticProduct {
  key: string;
  categoryKey: string;
  sku: string;
  name: string;
  description: string;
  priceMinor: number;
  availability: CatalogAvailability;
  onHand: number | null;
  searchTerms: readonly string[];
  specifications: readonly CatalogProductSpecification[];
  mediaRefs: readonly string[];
}

export interface SyntheticMarketFixture {
  schemaVersion: 1;
  fixtureId: string;
  disclosureRu: string;
  disclosureUz: string;
  categories: readonly SyntheticCategory[];
  products: readonly SyntheticProduct[];
}

export interface SyntheticFixtureSummary {
  fixtureId: string;
  categories: number;
  products: number;
  available: number;
  unavailable: number;
  preorder: number;
  lowStock: number;
  withImage: number;
  withoutImage: number;
  withoutOptionalSpecifications: number;
  minPriceMinor: number;
  maxPriceMinor: number;
}

function parseCategories(
  value: unknown,
): readonly SyntheticCategory[] {
  if (!Array.isArray(value) || value.length < 5 || value.length > 10) {
    throw new Error('synthetic fixture rejected');
  }
  const categories = value.map((item) => {
    if (
      !isObject(item)
      || !exactKeys(item, CATEGORY_KEYS)
      || typeof item.key !== 'string'
      || !KEY.test(item.key)
    ) {
      throw new Error('synthetic fixture rejected');
    }
    const normalized = normalizeCreateCategoryInput({
      name: item.name,
      sortOrder: item.sortOrder,
    });
    return {
      key: item.key,
      name: normalized.name,
      sortOrder: normalized.sortOrder ?? 0,
    };
  });
  if (new Set(categories.map((category) => category.key)).size
    !== categories.length) {
    throw new Error('synthetic fixture rejected');
  }
  return categories;
}

function parseProducts(
  value: unknown,
  categories: readonly SyntheticCategory[],
  description: string,
): readonly SyntheticProduct[] {
  if (!Array.isArray(value) || value.length < 30 || value.length > 50) {
    throw new Error('synthetic fixture rejected');
  }
  const categoryKeys = new Set(categories.map((category) => category.key));
  const products = value.map((item) => {
    if (
      !isObject(item)
      || !exactKeys(item, PRODUCT_KEYS)
      || typeof item.key !== 'string'
      || !KEY.test(item.key)
      || typeof item.categoryKey !== 'string'
      || !categoryKeys.has(item.categoryKey)
      || !/\p{Script=Cyrillic}/u.test(String(item.name ?? ''))
    ) {
      throw new Error('synthetic fixture rejected');
    }
    const normalized = normalizeCreateProductInput({
      categoryId: `r11-cat-${item.categoryKey}`,
      sku: item.sku,
      name: item.name,
      description,
      priceMinor: item.priceMinor,
      currency: 'UZS',
      availability: item.availability,
      mediaRefs: item.mediaRefs,
      searchTerms: item.searchTerms,
      specifications: item.specifications,
    });
    if (
      !Array.isArray(normalized.searchTerms)
      || normalized.searchTerms.length < 2
      || (
        item.onHand !== null
        && (
          !Number.isSafeInteger(item.onHand)
          || Number(item.onHand) < 0
          || Number(item.onHand) > 1_000_000
        )
      )
      || (normalized.availability === 'preorder' && item.onHand !== null)
      || (normalized.availability === 'unavailable' && item.onHand !== 0)
      || (normalized.availability === 'available' && item.onHand === null)
    ) {
      throw new Error('synthetic fixture rejected');
    }
    return {
      key: item.key,
      categoryKey: item.categoryKey,
      sku: normalized.sku!,
      name: normalized.name,
      description,
      priceMinor: normalized.priceMinor,
      availability: normalized.availability,
      onHand: item.onHand === null ? null : Number(item.onHand),
      searchTerms: normalized.searchTerms ?? [],
      specifications: normalized.specifications ?? [],
      mediaRefs: normalized.mediaRefs ?? [],
    };
  });
  for (const unique of [
    products.map((product) => product.key),
    products.map((product) => product.sku),
  ]) {
    if (new Set(unique).size !== unique.length) {
      throw new Error('synthetic fixture rejected');
    }
  }
  for (const category of categories) {
    if (products.filter(
      (product) => product.categoryKey === category.key,
    ).length < 2) {
      throw new Error('synthetic fixture rejected');
    }
  }
  return products;
}

function requireCoverage(fixture: SyntheticMarketFixture): void {
  const prices = new Set(fixture.products.map((product) => product.priceMinor));
  const availabilities = new Set(
    fixture.products.map((product) => product.availability),
  );
  if (
    REQUIRED_BOUNDARIES.some((price) => !prices.has(price))
    || !availabilities.has('available')
    || !availabilities.has('unavailable')
    || !availabilities.has('preorder')
    || !fixture.products.some(
      (product) => product.onHand !== null && product.onHand >= 1
        && product.onHand <= 2,
    )
    || !fixture.products.some((product) => product.mediaRefs.length > 0)
    || !fixture.products.some((product) => product.mediaRefs.length === 0)
    || !fixture.products.some(
      (product) => product.specifications.length === 0,
    )
  ) {
    throw new Error('synthetic fixture rejected');
  }
}

export function validateSyntheticMarketFixture(
  raw: unknown,
): SyntheticMarketFixture {
  if (
    !isObject(raw)
    || !exactKeys(raw, FIXTURE_KEYS)
    || raw.schemaVersion !== 1
    || typeof raw.fixtureId !== 'string'
    || !FIXTURE_ID.test(raw.fixtureId)
  ) {
    throw new Error('synthetic fixture rejected');
  }
  const disclosureRu = requiredString(raw.disclosureRu);
  const disclosureUz = requiredString(raw.disclosureUz);
  if (
    !/синтетическ/iu.test(disclosureRu)
    || !/не является реальным/iu.test(disclosureRu)
    || !/sintetik/iu.test(disclosureUz)
    || !/haqiqiy/iu.test(disclosureUz)
  ) {
    throw new Error('synthetic fixture rejected');
  }
  const categories = parseCategories(raw.categories);
  const description = `${disclosureRu} ${disclosureUz}`;
  const fixture: SyntheticMarketFixture = {
    schemaVersion: 1,
    fixtureId: raw.fixtureId,
    disclosureRu,
    disclosureUz,
    categories,
    products: parseProducts(raw.products, categories, description),
  };
  requireCoverage(fixture);
  return fixture;
}

export function loadSyntheticMarketFixture(
  fixturePath = MARKET_SYNTHETIC_FIXTURE_PATH,
): SyntheticMarketFixture {
  return validateSyntheticMarketFixture(
    JSON.parse(fs.readFileSync(fixturePath, 'utf8')),
  );
}

export function summarizeSyntheticMarketFixture(
  fixture: SyntheticMarketFixture,
): SyntheticFixtureSummary {
  const prices = fixture.products.map((product) => product.priceMinor);
  return {
    fixtureId: fixture.fixtureId,
    categories: fixture.categories.length,
    products: fixture.products.length,
    available: fixture.products.filter(
      (product) => product.availability === 'available',
    ).length,
    unavailable: fixture.products.filter(
      (product) => product.availability === 'unavailable',
    ).length,
    preorder: fixture.products.filter(
      (product) => product.availability === 'preorder',
    ).length,
    lowStock: fixture.products.filter(
      (product) => product.onHand !== null
        && product.onHand >= 1
        && product.onHand <= 2,
    ).length,
    withImage: fixture.products.filter(
      (product) => product.mediaRefs.length > 0,
    ).length,
    withoutImage: fixture.products.filter(
      (product) => product.mediaRefs.length === 0,
    ).length,
    withoutOptionalSpecifications: fixture.products.filter(
      (product) => product.specifications.length === 0,
    ).length,
    minPriceMinor: Math.min(...prices),
    maxPriceMinor: Math.max(...prices),
  };
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function base32Digest(value: string): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  const digest = crypto.createHash('sha256').update(value).digest();
  let bits = 0;
  let buffer = 0;
  let output = '';
  for (const byte of digest) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5 && output.length < 16) {
      output += alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (output.length === 16) break;
  }
  return output;
}

export function renderSyntheticMarketSql(
  fixture: SyntheticMarketFixture,
  orgIdInput: string,
  storeIdInput: string,
): string {
  const orgId = requireCatalogId(orgIdInput);
  const storeId = requireCatalogId(storeIdInput);
  const timestamp = '2026-07-31T00:00:00.000Z';
  const lines = [
    '-- Generated by scripts/market-synthetic-fixture.ts.',
    '-- Append-only synthetic fixture: no update, delete or archive statement.',
    '-- D1 file import manages execution; explicit BEGIN/COMMIT are omitted.',
    'PRAGMA foreign_keys = ON;',
  ];
  for (const category of fixture.categories) {
    const id = `r11-cat-${category.key}`;
    lines.push(
      `INSERT OR IGNORE INTO sotuvchi_categories (`,
      '  id, org_id, store_id, name, slug, status, sort_order,',
      '  last_operation_key, created_at, updated_at',
      `) SELECT ${sqlString(id)}, ${sqlString(orgId)}, ${sqlString(storeId)},`,
      `  ${sqlString(category.name)}, ${sqlString(`c-${base32Digest(category.key)}`)},`,
      `  'active', ${category.sortOrder},`,
      `  ${sqlString(`${fixture.fixtureId}:category:${category.key}`)},`,
      `  ${sqlString(timestamp)}, ${sqlString(timestamp)}`,
      'WHERE EXISTS (',
      '  SELECT 1 FROM sotuvchi_stores',
      `  WHERE org_id = ${sqlString(orgId)} AND id = ${sqlString(storeId)}`,
      ');',
    );
  }
  for (const product of fixture.products) {
    const productId = `r11-product-${product.key}`;
    const categoryId = `r11-cat-${product.categoryKey}`;
    lines.push(
      'INSERT OR IGNORE INTO sotuvchi_products (',
      '  id, org_id, store_id, category_id, sku, name, normalized_name,',
      '  description, price_minor, currency, availability, status,',
      '  media_refs_json, version, last_operation_key, created_at, updated_at,',
      '  search_terms_json, specifications_json',
      `) SELECT ${sqlString(productId)}, ${sqlString(orgId)}, ${sqlString(storeId)},`,
      `  ${sqlString(categoryId)}, ${sqlString(product.sku)}, ${sqlString(product.name)},`,
      `  ${sqlString(normalizedProductName(product.name))}, ${sqlString(product.description)},`,
      `  ${product.priceMinor}, 'UZS', ${sqlString(product.availability)}, 'published',`,
      `  ${sqlString(JSON.stringify(product.mediaRefs))}, 1,`,
      `  ${sqlString(`${fixture.fixtureId}:product:${product.key}`)},`,
      `  ${sqlString(timestamp)}, ${sqlString(timestamp)},`,
      `  ${sqlString(JSON.stringify(product.searchTerms))},`,
      `  ${sqlString(JSON.stringify(product.specifications))}`,
      'WHERE EXISTS (',
      '  SELECT 1 FROM sotuvchi_stores',
      `  WHERE org_id = ${sqlString(orgId)} AND id = ${sqlString(storeId)}`,
      ');',
    );
    if (product.onHand !== null) {
      const movementId = `r11-move-${product.key}`;
      const operationKey = `${fixture.fixtureId}:inventory:${product.key}`;
      lines.push(
        'INSERT OR IGNORE INTO sotuvchi_inventory_moves (',
        '  id, org_id, store_id, product_id, order_id, type, delta,',
        '  balance_after, idempotency_key, created_at',
        `) SELECT ${sqlString(movementId)}, ${sqlString(orgId)},`,
        `  ${sqlString(storeId)}, ${sqlString(productId)}, NULL, 'initial',`,
        `  ${product.onHand}, ${product.onHand}, ${sqlString(operationKey)},`,
        `  ${sqlString(timestamp)}`,
        'WHERE EXISTS (',
        '  SELECT 1 FROM sotuvchi_products',
        `  WHERE org_id = ${sqlString(orgId)} AND store_id = ${sqlString(storeId)}`,
        `    AND id = ${sqlString(productId)}`,
        ') AND NOT EXISTS (',
        '  SELECT 1 FROM sotuvchi_inventory',
        `  WHERE org_id = ${sqlString(orgId)} AND store_id = ${sqlString(storeId)}`,
        `    AND product_id = ${sqlString(productId)}`,
        ');',
        'INSERT OR IGNORE INTO sotuvchi_inventory (',
        '  org_id, store_id, product_id, on_hand, version, created_at, updated_at',
        `) SELECT ${sqlString(orgId)}, ${sqlString(storeId)},`,
        `  ${sqlString(productId)}, ${product.onHand}, 1,`,
        `  ${sqlString(timestamp)}, ${sqlString(timestamp)}`,
        'WHERE EXISTS (',
        '  SELECT 1 FROM sotuvchi_products',
        `  WHERE org_id = ${sqlString(orgId)} AND store_id = ${sqlString(storeId)}`,
        `    AND id = ${sqlString(productId)}`,
        ');',
      );
    }
  }
  lines.push(
    `SELECT ${sqlString(fixture.fixtureId)} AS fixture_id,`,
    '  COUNT(*) AS published_fixture_products',
    'FROM sotuvchi_products',
    `WHERE org_id = ${sqlString(orgId)} AND store_id = ${sqlString(storeId)}`,
    "  AND id LIKE 'r11-product-%' AND status = 'published';",
  );
  return `${lines.join('\n')}\n`;
}

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  const item = process.argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : null;
}

function runCli(): void {
  const fixture = loadSyntheticMarketFixture();
  const summary = summarizeSyntheticMarketFixture(fixture);
  const mode = process.argv[2] ?? 'check';
  if (mode === 'check') {
    console.log(JSON.stringify({ status: 'pass', mode: 'read-only', ...summary }));
    return;
  }
  if (mode !== 'sql') throw new Error('unsupported fixture mode');
  const orgId = argument('org-id') ?? '';
  const storeId = argument('store-id') ?? '';
  const confirmation = argument('confirmation');
  if (!storeId || confirmation !== storeId) {
    throw new Error('exact store confirmation required');
  }
  const sql = renderSyntheticMarketSql(fixture, orgId, storeId);
  const output = argument('output');
  if (output) {
    fs.writeFileSync(path.resolve(output), sql, { encoding: 'utf8', flag: 'wx' });
    console.log(JSON.stringify({
      status: 'pass',
      mode: 'sql-written',
      output: path.resolve(output),
      ...summary,
    }));
    return;
  }
  process.stdout.write(sql);
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli();
}
