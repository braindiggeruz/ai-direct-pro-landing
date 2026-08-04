import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MIGRATIONS = [
  '0034_classifieds_seller_ownership.sql',
  '0035_classifieds_global_taxonomy.sql',
  '0036_classifieds_location_contact.sql',
  '0037_classifieds_moderation_reports.sql',
  '0038_classifieds_favorites.sql',
  '0039_classifieds_inquiries.sql',
] as const;
const BUSINESS_TABLES = [
  'sotuvchi_products', 'sotuvchi_orders', 'sotuvchi_inventory',
  'sotuvchi_carts', 'sotuvchi_cart_items', 'sotuvchi_order_items',
] as const;
const PRODUCT_COLUMNS = [
  'id', 'org_id', 'store_id', 'category_id', 'sku', 'name', 'normalized_name',
  'description', 'price_minor', 'currency', 'availability', 'status',
  'media_refs_json', 'search_terms_json', 'specifications_json', 'version',
  'last_operation_key', 'created_at', 'updated_at',
].join(', ');

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : '';
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function value(db: DatabaseSync, sql: string, ...params: unknown[]): number {
  return (db.prepare(sql).get(...params) as { n: number }).n;
}

function tableExists(db: DatabaseSync, table: string): boolean {
  return value(
    db,
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?",
    table,
  ) === 1;
}

function counts(db: DatabaseSync): Record<string, number> {
  return Object.fromEntries(BUSINESS_TABLES.map((table) => [
    table,
    tableExists(db, table) ? value(db, `SELECT COUNT(*) AS n FROM ${table}`) : 0,
  ]));
}

function productSnapshot(db: DatabaseSync): string {
  return JSON.stringify(db.prepare(
    `SELECT ${PRODUCT_COLUMNS} FROM sotuvchi_products ORDER BY id`,
  ).all());
}

function applyMigration(db: DatabaseSync, filename: string): void {
  const sql = readFileSync(path.join(ROOT, 'migrations', filename), 'utf8');
  db.exec('BEGIN IMMEDIATE');
  try {
    // Migration 0034 rebuilds the central listing table. Executing each
    // statement separately gives SQLite a stable failure boundary while the
    // surrounding transaction still keeps the rebuild atomic.
    if (filename === '0034_classifieds_seller_ownership.sql') {
      const statements = sql
        .replace(/^\s*--.*$/gm, '')
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) db.exec(`${statement};`);
    } else {
      db.exec(sql);
    }
    db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(filename);
    if (db.prepare('PRAGMA foreign_key_check').all().length > 0) {
      throw new Error('foreign key violation before commit');
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw new Error(
      `${filename}: ${error instanceof Error ? error.message : 'migration failed'}`,
      { cause: error },
    );
  }
}

function rejected(operation: () => void): boolean {
  try {
    operation();
    return false;
  } catch {
    return true;
  }
}

function columnNames(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .map((row) => row.name);
}

function fixtureChecks(db: DatabaseSync): Record<string, boolean> {
  const checks: Record<string, boolean> = {};
  const now = new Date().toISOString();
  const target = {
    product_id: 'product-journey-rehearsal',
    seller_profile_id: 'seller-journey-rehearsal',
  };

  db.exec('SAVEPOINT classifieds_journey_fixture');
  try {
    db.prepare(`INSERT INTO identities(
      id, provider, external_id, created_at, updated_at
    ) VALUES (?, 'api', ?, ?, ?), (?, 'api', ?, ?, ?), (?, 'api', ?, ?, ?)`)
      .run(
        'identity-journey-rehearsal-seller', 'journey-rehearsal-seller', now, now,
        'identity-journey-rehearsal-a', 'journey-rehearsal-a', now, now,
        'identity-journey-rehearsal-b', 'journey-rehearsal-b', now, now,
      );
    db.prepare(`INSERT INTO seller_profiles(
      id, identity_id, public_display_name, seller_type, verification_state,
      status, moderation_state, version, last_operation_key, created_at, updated_at
    ) VALUES (?, ?, 'Synthetic Seller', 'private', 'identity_verified',
      'active', 'clear', 1, 'journey-profile-create', ?, ?)`)
      .run(target.seller_profile_id, 'identity-journey-rehearsal-seller', now, now);
    db.prepare(`INSERT INTO sotuvchi_products(
      id, org_id, store_id, listing_scope, category_id, sku, name,
      normalized_name, description, price_minor, currency, availability,
      status, media_refs_json, search_terms_json, specifications_json, version,
      last_operation_key, created_at, updated_at
    ) VALUES (?, NULL, NULL, 'private', NULL, NULL, 'Synthetic listing',
      'synthetic listing', 'Rehearsal only', 100000, 'UZS', 'available',
      'published', '[]', '[]', '[]', 1, 'journey-product-create', ?, ?)`)
      .run(target.product_id, now, now);
    db.prepare(`INSERT INTO listing_ownerships(
      product_id, seller_profile_id, ownership_type, org_id, store_id, status,
      version, last_operation_key, created_at, updated_at
    ) VALUES (?, ?, 'private', NULL, NULL, 'active', 1,
      'journey-ownership-create', ?, ?)`)
      .run(target.product_id, target.seller_profile_id, now, now);

    db.prepare(`INSERT INTO market_listing_favorites(
      identity_id, product_id, created_at
    ) VALUES (?, ?, ?)`)
      .run('identity-journey-rehearsal-a', target.product_id, now);
    checks.favorite_identity_scoped = value(
      db,
      `SELECT COUNT(*) AS n FROM market_listing_favorites
       WHERE identity_id = ? AND product_id = ?`,
      'identity-journey-rehearsal-a',
      target.product_id,
    ) === 1 && value(
      db,
      'SELECT COUNT(*) AS n FROM market_listing_favorites WHERE identity_id = ?',
      'identity-journey-rehearsal-b',
    ) === 0;
    checks.favorite_duplicate_rejected = rejected(() => {
      db.prepare(`INSERT INTO market_listing_favorites(
        identity_id, product_id, created_at
      ) VALUES (?, ?, ?)`)
        .run('identity-journey-rehearsal-a', target.product_id, now);
    });

    const insertInquiry = db.prepare(`INSERT INTO market_listing_inquiries(
      id, product_id, seller_profile_id, buyer_identity_id, message, status,
      reply_text, fingerprint, create_idempotency_key, reply_idempotency_key,
      version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'Synthetic inquiry', 'open', NULL, ?, ?, NULL, 1,
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);
    insertInquiry.run(
      'inquiry-journey-rehearsal-a', target.product_id, target.seller_profile_id,
      'identity-journey-rehearsal-a', 'a'.repeat(64), 'inquiry-key-a',
    );
    checks.inquiry_identity_scoped = value(
      db,
      `SELECT COUNT(*) AS n FROM market_listing_inquiries
       WHERE buyer_identity_id = ? AND product_id = ?`,
      'identity-journey-rehearsal-a',
      target.product_id,
    ) === 1 && value(
      db,
      'SELECT COUNT(*) AS n FROM market_listing_inquiries WHERE buyer_identity_id = ?',
      'identity-journey-rehearsal-b',
    ) === 0;
    checks.inquiry_idempotency_enforced = rejected(() => {
      insertInquiry.run(
        'inquiry-journey-rehearsal-conflict', target.product_id,
        target.seller_profile_id, 'identity-journey-rehearsal-a',
        'b'.repeat(64), 'inquiry-key-a',
      );
    });
    for (let index = 0; index < 10; index += 1) {
      insertInquiry.run(
        `inquiry-rate-${index}`, target.product_id, target.seller_profile_id,
        'identity-journey-rehearsal-b', index.toString(16).padStart(64, '0'),
        `inquiry-rate-key-${index}`,
      );
    }
    checks.inquiry_rate_limit_trigger = rejected(() => {
      insertInquiry.run(
        'inquiry-rate-rejected', target.product_id, target.seller_profile_id,
        'identity-journey-rehearsal-b', 'f'.repeat(64), 'inquiry-rate-key-rejected',
      );
    });
    checks.fixture_foreign_keys = db.prepare('PRAGMA foreign_key_check').all().length === 0;
  } finally {
    db.exec('ROLLBACK TO classifieds_journey_fixture');
    db.exec('RELEASE classifieds_journey_fixture');
  }
  return checks;
}

function main(): void {
  const source = path.resolve(argument('--source'));
  if (!existsSync(source) || path.extname(source).toLowerCase() !== '.sqlite') {
    throw new Error('source must be an existing isolated SQLite restore');
  }
  if (source.toLowerCase().startsWith(`${ROOT}${path.sep}`.toLowerCase())) {
    throw new Error('source restore must stay outside the Git workspace');
  }

  const tempBase = path.resolve(tmpdir());
  const tempRoot = mkdtempSync(path.join(tempBase, 'bormi-classifieds-journey-'));
  if (!tempRoot.toLowerCase().startsWith(`${tempBase}${path.sep}`.toLowerCase())) {
    throw new Error('temporary rehearsal directory escaped the OS temp root');
  }
  const copy = path.join(tempRoot, 'production-shaped.sqlite');
  copyFileSync(source, copy);
  const db = new DatabaseSync(copy);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    const ledgerBefore = value(db, 'SELECT COUNT(*) AS n FROM d1_migrations');
    const beforeCounts = counts(db);
    const beforeProducts = productSnapshot(db);
    for (const migration of MIGRATIONS) applyMigration(db, migration);
    const ledgerAfter = value(db, 'SELECT COUNT(*) AS n FROM d1_migrations');
    const afterCounts = counts(db);

    const favoriteColumns = columnNames(db, 'market_listing_favorites');
    const inquiryColumns = columnNames(db, 'market_listing_inquiries');
    const sensitivePattern = /phone|telegram|external|username|contact/i;
    const favoritePlan = (db.prepare(`EXPLAIN QUERY PLAN
      SELECT product_id FROM market_listing_favorites
      WHERE identity_id = 'identity-plan'
      ORDER BY created_at DESC, product_id LIMIT 50`).all() as Array<{ detail: string }>)
      .map((row) => row.detail);
    const inquiryPlan = (db.prepare(`EXPLAIN QUERY PLAN
      SELECT id FROM market_listing_inquiries
      WHERE buyer_identity_id = 'identity-plan'
      ORDER BY updated_at DESC, id LIMIT 50`).all() as Array<{ detail: string }>)
      .map((row) => row.detail);
    const checks = {
      ledgerPredecessor: ledgerBefore === 33,
      ledgerAdvancedBySix: ledgerAfter === ledgerBefore + MIGRATIONS.length,
      businessCountsPreserved: JSON.stringify(beforeCounts) === JSON.stringify(afterCounts),
      productRowsPreserved: beforeProducts === productSnapshot(db),
      foreignKeys: db.prepare('PRAGMA foreign_key_check').all().length === 0,
      integrity: (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string })
        .integrity_check === 'ok',
      favoriteSchemaMinimal:
        JSON.stringify(favoriteColumns) === JSON.stringify(['identity_id', 'product_id', 'created_at'])
        && !favoriteColumns.some((column) => sensitivePattern.test(column)),
      inquirySchemaNoContactCopy: !inquiryColumns.some((column) => sensitivePattern.test(column)),
      favoritePlanUsesIndex: favoritePlan.some((detail) => /USING (?:COVERING )?INDEX/i.test(detail)),
      inquiryPlanUsesIndex: inquiryPlan.some((detail) => /USING (?:COVERING )?INDEX/i.test(detail)),
      inquiryTriggerDeclared: value(
        db,
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name = ?",
        'market_listing_inquiries_identity_rate_limit',
      ) === 1,
      ...fixtureChecks(db),
    };
    const pass = Object.values(checks).every((check) => check === true);
    console.log(JSON.stringify({
      verdict: pass ? 'PASS' : 'FAIL',
      source: 'isolated-production-shaped-restore',
      migrations: MIGRATIONS,
      beforeCounts,
      afterCounts,
      checks,
      queryPlans: { favorites: favoritePlan, inquiries: inquiryPlan },
    }, null, 2));
    if (!pass) process.exitCode = 1;
  } finally {
    db.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'classifieds journey rehearsal failed');
  process.exitCode = 1;
}
