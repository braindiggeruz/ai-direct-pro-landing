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

function count(db: DatabaseSync, table: string): number {
  const safeTables = new Set([
    'sotuvchi_products', 'sotuvchi_orders', 'sotuvchi_inventory',
    'sotuvchi_carts', 'sotuvchi_cart_items', 'sotuvchi_order_items',
  ]);
  if (!safeTables.has(table)) throw new Error('unapproved aggregate table');
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

function tableExists(db: DatabaseSync, table: string): boolean {
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`,
  ).get(table) as { n: number };
  return row.n === 1;
}

function counts(db: DatabaseSync): Record<string, number> {
  const names = [
    'sotuvchi_products', 'sotuvchi_orders', 'sotuvchi_inventory',
    'sotuvchi_carts', 'sotuvchi_cart_items', 'sotuvchi_order_items',
  ];
  return Object.fromEntries(names.map((name) => [
    name,
    tableExists(db, name) ? count(db, name) : 0,
  ]));
}

function productSnapshot(db: DatabaseSync): string {
  return JSON.stringify(db.prepare(
    `SELECT ${PRODUCT_COLUMNS} FROM sotuvchi_products ORDER BY id`,
  ).all());
}

function apply(db: DatabaseSync, filename: string): void {
  const sql = readFileSync(path.join(ROOT, 'migrations', filename), 'utf8');
  db.exec('BEGIN IMMEDIATE');
  let stage = 'execute';
  try {
    if (filename === '0034_classifieds_seller_ownership.sql') {
      const statements = sql
        .replace(/^\s*--.*$/gm, '')
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const [index, statement] of statements.entries()) {
        const label = statement.split(/\s+/).slice(0, 4).join(' ');
        stage = `statement ${index + 1} (${label})`;
        db.exec(`${statement};`);
      }
    } else {
      db.exec(sql);
    }
    stage = 'ledger';
    db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(filename);
    if (filename === '0034_classifieds_seller_ownership.sql') {
      const violations = db.prepare('PRAGMA foreign_key_check').all() as Array<{
        table: string;
        parent: string;
      }>;
      if (violations.length > 0) {
        const relationships = [...new Set(
          violations.map((row) => `${row.table}->${row.parent}`),
        )].sort().join(',');
        throw new Error(`pre-commit FK violations: ${relationships}`);
      }
    }
    stage = 'commit';
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw new Error(
      `${filename} ${stage}: ${error instanceof Error ? error.message : 'migration failed'}`,
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

function schemaObjects(db: DatabaseSync, type: 'table' | 'index' | 'trigger'): Set<string> {
  const rows = db.prepare('SELECT name FROM sqlite_master WHERE type = ?').all(type) as Array<{
    name: string;
  }>;
  return new Set(rows.map((row) => row.name));
}

function fixtureChecks(db: DatabaseSync): Record<string, boolean> {
  const now = '2026-08-04T00:00:00.000Z';
  const checks: Record<string, boolean> = {};
  db.exec('SAVEPOINT classifieds_fixture');
  try {
    db.prepare(`INSERT INTO identities(
      id, provider, external_id, created_at, updated_at
    ) VALUES (?, 'api', ?, ?, ?), (?, 'api', ?, ?, ?)`)
      .run(
        'identity-classifieds-rehearsal-a', 'classifieds-rehearsal-a', now, now,
        'identity-classifieds-rehearsal-b', 'classifieds-rehearsal-b', now, now,
      );
    db.prepare(`INSERT INTO seller_profiles(
      id, identity_id, public_display_name, seller_type, verification_state,
      status, moderation_state, version, last_operation_key, created_at, updated_at
    ) VALUES (?, ?, ?, 'private', 'identity_verified', 'active', 'clear', 1, ?, ?, ?)`)
      .run(
        'seller-classifieds-rehearsal-a', 'identity-classifieds-rehearsal-a',
        'Synthetic Seller', 'profile-create-a', now, now,
      );
    db.prepare(`INSERT INTO sotuvchi_products(
      id, org_id, store_id, listing_scope, category_id, sku, name,
      normalized_name, description, price_minor, currency, availability,
      status, media_refs_json, search_terms_json, specifications_json, version,
      last_operation_key, created_at, updated_at
    ) VALUES (?, NULL, NULL, 'private', NULL, NULL, ?, ?, ?, 100000, 'UZS',
      'available', 'published', '[]', '[]', '[]', 1, ?, ?, ?)`)
      .run(
        'product-classifieds-rehearsal', 'Synthetic listing',
        'synthetic listing', 'Rehearsal only', 'product-create-a', now, now,
      );
    db.prepare(`INSERT INTO listing_ownerships(
      product_id, seller_profile_id, ownership_type, org_id, store_id, status,
      version, last_operation_key, created_at, updated_at
    ) VALUES (?, ?, 'private', NULL, NULL, 'active', 1, ?, ?, ?)`)
      .run(
        'product-classifieds-rehearsal', 'seller-classifieds-rehearsal-a',
        'ownership-create-a', now, now,
      );
    db.prepare(`INSERT INTO market_listing_taxonomy(
      product_id, global_category_id, condition, version, last_operation_key,
      created_at, updated_at
    ) VALUES (?, 'cat-electronics', 'good', 1, ?, ?, ?)`)
      .run('product-classifieds-rehearsal', 'taxonomy-create-a', now, now);
    db.prepare(`INSERT INTO market_listing_locations(
      product_id, country_code, region_id, district_id, locality_text,
      approximate_only, version, last_operation_key, created_at, updated_at
    ) VALUES (?, 'UZ', 'uz-tashkent-city', 'uz-tashkent-uchtepa', NULL, 1, 1, ?, ?, ?)`)
      .run('product-classifieds-rehearsal', 'location-create-a', now, now);
    db.prepare(`INSERT INTO market_listing_channels(
      product_id, listing_scope, contact_mode, phone_disclosure, commerce_mode,
      version, last_operation_key, created_at, updated_at
    ) VALUES (?, 'private', 'in_app', 'not_available', 'inquiry', 1, ?, ?, ?)`)
      .run('product-classifieds-rehearsal', 'channel-create-a', now, now);
    db.prepare(`INSERT INTO market_listing_moderation(
      product_id, state, reason_code, moderator_identity_id, decision_source,
      submitted_at, decided_at, version, last_operation_key, created_at, updated_at
    ) VALUES (?, 'approved', NULL, NULL, 'deterministic_policy', ?, ?, 1, ?, ?, ?)`)
      .run('product-classifieds-rehearsal', now, now, 'moderation-approve-a', now, now);
    db.prepare(`INSERT INTO market_moderation_audit(
      event_id, product_id, report_id, actor_type, actor_identity_id, action,
      reason_code, request_id, idempotency_key, from_state, to_state, created_at
    ) VALUES (?, ?, NULL, 'system', NULL, 'listing.approved', NULL, ?, ?,
      'pending', 'approved', ?)`)
      .run(
        'audit-classifieds-rehearsal', 'product-classifieds-rehearsal',
        'request-classifieds-rehearsal', 'audit-operation-a', now,
      );

    const visible = db.prepare(`
      SELECT COUNT(*) AS n
      FROM sotuvchi_products AS product
      JOIN listing_ownerships AS ownership
        ON ownership.product_id = product.id AND ownership.status = 'active'
      JOIN seller_profiles AS seller
        ON seller.id = ownership.seller_profile_id AND seller.status = 'active'
      JOIN market_listing_taxonomy AS taxonomy ON taxonomy.product_id = product.id
      JOIN market_global_categories AS category
        ON category.id = taxonomy.global_category_id AND category.status = 'active'
      JOIN market_listing_locations AS location ON location.product_id = product.id
      JOIN market_regions AS region
        ON region.id = location.region_id AND region.status = 'active'
      JOIN market_districts AS district
        ON district.id = location.district_id AND district.status = 'active'
      JOIN market_listing_channels AS channel ON channel.product_id = product.id
      JOIN market_listing_moderation AS moderation
        ON moderation.product_id = product.id AND moderation.state = 'approved'
      WHERE product.status = 'published'
        AND product.id = 'product-classifieds-rehearsal'
    `).get() as { n: number };
    checks.approved_global_discovery = visible.n === 1;

    db.prepare(`INSERT INTO seller_profiles(
      id, identity_id, public_display_name, seller_type, verification_state,
      status, moderation_state, version, last_operation_key, created_at, updated_at
    ) VALUES (?, ?, ?, 'private', 'identity_verified', 'active', 'clear', 1, ?, ?, ?)`)
      .run(
        'seller-classifieds-rehearsal-b', 'identity-classifieds-rehearsal-b',
        'Second Synthetic', 'profile-create-b', now, now,
      );
    checks.one_active_owner = rejected(() => {
      db.prepare(`INSERT INTO listing_ownerships(
        product_id, seller_profile_id, ownership_type, org_id, store_id, status,
        version, last_operation_key, created_at, updated_at
      ) VALUES (?, ?, 'private', NULL, NULL, 'active', 1, ?, ?, ?)`)
        .run(
          'product-classifieds-rehearsal', 'seller-classifieds-rehearsal-b',
          'ownership-create-b', now, now,
        );
    });

    const store = db.prepare(
      'SELECT org_id, id AS store_id FROM sotuvchi_stores ORDER BY id LIMIT 1',
    ).get() as { org_id: string; store_id: string } | undefined;
    checks.private_scope_rejects_store = Boolean(store) && rejected(() => {
      db.prepare(`INSERT INTO sotuvchi_products(
        id, org_id, store_id, listing_scope, category_id, sku, name,
        normalized_name, description, price_minor, currency, availability,
        status, media_refs_json, search_terms_json, specifications_json, version,
        last_operation_key, created_at, updated_at
      ) VALUES (?, ?, ?, 'private', NULL, NULL, 'Invalid', 'invalid', NULL, 1,
        'UZS', 'available', 'draft', '[]', '[]', '[]', 1, ?, ?, ?)`)
        .run('invalid-private-scope', store?.org_id, store?.store_id, 'invalid-op', now, now);
    });
    checks.private_cannot_order = rejected(() => {
      db.prepare(`INSERT INTO market_listing_channels(
        product_id, listing_scope, contact_mode, phone_disclosure, commerce_mode,
        version, last_operation_key, created_at, updated_at
      ) VALUES (?, 'private', 'in_app', 'not_available', 'store_order', 1, ?, ?, ?)`)
        .run('product-classifieds-rehearsal', 'invalid-channel-op', now, now);
    });
    checks.audit_append_only = rejected(() => {
      db.prepare(
        `UPDATE market_moderation_audit SET to_state = 'removed' WHERE event_id = ?`,
      ).run('audit-classifieds-rehearsal');
    }) && rejected(() => {
      db.prepare('DELETE FROM market_moderation_audit WHERE event_id = ?')
        .run('audit-classifieds-rehearsal');
    });
    checks.fixture_foreign_keys = db.prepare('PRAGMA foreign_key_check').all().length === 0;
  } finally {
    db.exec('ROLLBACK TO classifieds_fixture');
    db.exec('RELEASE classifieds_fixture');
  }
  return checks;
}

function main(): void {
  const source = path.resolve(argument('--source'));
  if (!existsSync(source) || path.extname(source).toLowerCase() !== '.sqlite') {
    throw new Error('source must be an existing isolated SQLite restore');
  }
  if (source.startsWith(`${ROOT}${path.sep}`)) {
    throw new Error('source restore must stay outside the Git workspace');
  }

  const tempBase = path.resolve(tmpdir());
  const tempRoot = mkdtempSync(path.join(tempBase, 'bormi-classifieds-'));
  const expectedPrefix = `${tempBase}${path.sep}`.toLowerCase();
  if (!tempRoot.toLowerCase().startsWith(expectedPrefix)) {
    throw new Error('temporary rehearsal directory escaped the OS temp root');
  }
  const copy = path.join(tempRoot, 'production-shaped.sqlite');
  copyFileSync(source, copy);

  const db = new DatabaseSync(copy);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    const beforeCounts = counts(db);
    const beforeProducts = productSnapshot(db);
    const ledgerBefore = countLedger(db);
    for (const migration of MIGRATIONS) apply(db, migration);
    const afterCounts = counts(db);
    const productsPreserved = beforeProducts === productSnapshot(db);
    const ledgerAfter = countLedger(db);
    const tables = schemaObjects(db, 'table');
    const indexes = schemaObjects(db, 'index');
    const triggers = schemaObjects(db, 'trigger');
    const requiredTables = [
      'seller_profiles', 'listing_ownerships', 'market_global_categories',
      'market_store_category_mappings', 'market_listing_taxonomy',
      'market_regions', 'market_districts', 'market_listing_locations',
      'market_listing_channels', 'market_listing_moderation',
      'market_listing_reports', 'market_moderation_audit',
      'market_listing_operations',
    ];
    const requiredIndexes = [
      'idx_listing_ownership_one_active',
      'idx_sotuvchi_products_scope_status_updated',
      'idx_market_listing_taxonomy_discovery',
      'idx_market_listing_location_discovery',
      'idx_market_listing_moderation_queue',
      'idx_market_listing_reports_rate_scope',
      'idx_market_listing_operations_target',
    ];
    const requiredTriggers = [
      'market_moderation_audit_no_update',
      'market_moderation_audit_no_delete',
    ];
    const fixture = fixtureChecks(db);
    const queryPlan = (db.prepare(`EXPLAIN QUERY PLAN
      SELECT product.id
      FROM sotuvchi_products AS product
      JOIN market_listing_moderation AS moderation
        ON moderation.product_id = product.id AND moderation.state = 'approved'
      JOIN listing_ownerships AS ownership
        ON ownership.product_id = product.id AND ownership.status = 'active'
      JOIN market_listing_taxonomy AS taxonomy ON taxonomy.product_id = product.id
      JOIN market_listing_locations AS location ON location.product_id = product.id
      WHERE product.listing_scope IN ('private', 'store')
        AND product.status = 'published'
        AND taxonomy.global_category_id = 'cat-electronics'
        AND location.region_id = 'uz-tashkent-city'
      ORDER BY product.updated_at DESC, product.id
      LIMIT 21`).all() as Array<{ detail: string }>).map((row) => row.detail);
    const checks = {
      ledgerPredecessor: ledgerBefore === 33,
      ledgerAdvancedByFour: ledgerAfter === ledgerBefore + MIGRATIONS.length,
      businessCountsPreserved: JSON.stringify(beforeCounts) === JSON.stringify(afterCounts),
      productRowsPreserved: productsPreserved,
      existingProductsRemainStoreScoped: db.prepare(
        `SELECT COUNT(*) AS n FROM sotuvchi_products
         WHERE listing_scope <> 'store' OR org_id IS NULL OR store_id IS NULL`,
      ).get() as { n: number },
      foreignKeys: db.prepare('PRAGMA foreign_key_check').all().length === 0,
      integrity: (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string })
        .integrity_check === 'ok',
      declaredTables: requiredTables.every((name) => tables.has(name)),
      declaredIndexes: requiredIndexes.every((name) => indexes.has(name)),
      declaredTriggers: requiredTriggers.every((name) => triggers.has(name)),
      discoveryPlanUsesIndex: queryPlan.some((detail) => /USING (?:COVERING )?INDEX/i.test(detail)),
      ...fixture,
    };
    checks.existingProductsRemainStoreScoped =
      checks.existingProductsRemainStoreScoped.n === 0;
    const pass = Object.values(checks).every((value) => value === true);
    console.log(JSON.stringify({
      verdict: pass ? 'PASS' : 'FAIL',
      source: 'isolated-production-shaped-restore',
      migrations: MIGRATIONS,
      beforeCounts,
      afterCounts,
      checks,
      queryPlan,
    }, null, 2));
    if (!pass) process.exitCode = 1;
  } finally {
    db.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function countLedger(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM d1_migrations').get() as { n: number };
  return row.n;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'classifieds rehearsal failed');
  process.exitCode = 1;
}
