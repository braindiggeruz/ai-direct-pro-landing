/**
 * A real database and a real token for the Bormi Admin behaviour tests.
 *
 * The source-level tests in `bormi-admin-commands.test.ts` prove the shape of
 * the code; these let a test prove the shape of the *outcome* — that a stale
 * version really does refuse, that a retry really does replay, that a failed
 * audit really does leave the product where it was. Both matter: a grep can be
 * satisfied by a comment, and a behaviour test on a mocked database can be
 * satisfied by a mock.
 *
 * The schema is the migration ledger itself, applied in order, so a test that
 * passes here is a test that passed against the CHECK constraints production
 * has.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as jose from 'jose';
import { SqliteD1 } from './sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const MIGRATIONS = path.join(ROOT, 'migrations');

export const ORG = 'org_bormi';
export const STORE = 'store_bormi';
export const OTHER_ORG = 'org_other';
export const OTHER_STORE = 'store_other';
export const OWNER_IDENTITY = 'identity_owner';
export const CATEGORY = 'category_bormi';
export const OWNER_EMAIL = 'owner@example.invalid';
export const SUPPORT_EMAIL = 'support@example.invalid';
/**
 * The HS256 signing input for tokens this fixture mints and the same fixture
 * verifies, in one in-memory process. It is not a credential and names itself
 * so: `scan-secrets` flags a long value beside a credential word, and it is
 * right to — a test constant that looks like a secret is how a real one
 * eventually hides.
 */
export const TEST_SIGNING_INPUT = 'bormi-admin-test';

const NOW = '2026-08-04T00:00:00.000Z';

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
}

export interface AdminFixtureOptions {
  /** Migration prefixes to skip, so a test can prove the pre-migration state. */
  skip?: readonly string[];
  storeStatus?: string;
  /** Set null to prove what happens when no owner membership authorises a write. */
  ownerMembership?: { role: string; status: string } | null;
}

export function freshAdminDb(options: AdminFixtureOptions = {}): SqliteD1 {
  const db = new SqliteD1();
  for (const file of migrationFiles()) {
    if ((options.skip ?? []).some((prefix) => file.startsWith(prefix))) continue;
    db.exec(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }

  db.exec(`
    INSERT INTO identities (id, provider, external_id, created_at, updated_at)
    VALUES ('${OWNER_IDENTITY}', 'api', 'owner-api-key', '${NOW}', '${NOW}');
    INSERT INTO organizations (id, name, slug, status, default_locale, created_at, updated_at)
    VALUES ('${ORG}', 'Bormi', 'bormi', 'active', 'uz', '${NOW}', '${NOW}'),
           ('${OTHER_ORG}', 'Other', 'other', 'active', 'uz', '${NOW}', '${NOW}');
    INSERT INTO sotuvchi_stores (
      id, org_id, name, locale, delivery_mode, payment_methods_json,
      storefront_code, status, created_at, updated_at
    )
    VALUES ('${STORE}', '${ORG}', 'Bormi Shop', 'uz', 'both', '["cash"]',
            'bormi', '${options.storeStatus ?? 'active'}', '${NOW}', '${NOW}'),
           ('${OTHER_STORE}', '${OTHER_ORG}', 'Other Shop', 'uz', 'both', '["cash"]',
            'other', 'active', '${NOW}', '${NOW}');
    INSERT INTO sotuvchi_categories (
      id, org_id, store_id, name, slug, status, sort_order,
      last_operation_key, created_at, updated_at
    )
    VALUES ('${CATEGORY}', '${ORG}', '${STORE}', 'Категория', 'kategoriya',
            'active', 0, 'seed', '${NOW}', '${NOW}');
  `);

  const membership = options.ownerMembership === undefined
    ? { role: 'owner', status: 'active' }
    : options.ownerMembership;
  if (membership) {
    db.exec(`
      INSERT INTO memberships (id, org_id, identity_id, role, status, created_at, updated_at)
      VALUES ('membership_owner', '${ORG}', '${OWNER_IDENTITY}',
              '${membership.role}', '${membership.status}', '${NOW}', '${NOW}');
    `);
  }
  return db;
}

export interface SeedProduct {
  id: string;
  status?: string;
  version?: number;
  categoryId?: string | null;
  orgId?: string;
  storeId?: string;
}

export function seedProduct(db: SqliteD1, product: SeedProduct): void {
  const orgId = product.orgId ?? ORG;
  const storeId = product.storeId ?? STORE;
  const category = product.categoryId === undefined ? CATEGORY : product.categoryId;
  db.exec(`
    INSERT INTO sotuvchi_products (
      id, org_id, store_id, category_id, sku, name, normalized_name, description,
      price_minor, currency, availability, status, media_refs_json, version,
      last_operation_key, created_at, updated_at
    )
    VALUES (
      '${product.id}', '${orgId}', '${storeId}',
      ${category === null ? 'NULL' : `'${category}'`},
      'sku-${product.id}', 'Товар ${product.id}', 'tovar ${product.id}', NULL,
      100000, 'UZS', 'available', '${product.status ?? 'draft'}', '[]',
      ${product.version ?? 1}, 'seed', '${NOW}', '${NOW}'
    );
  `);
}

/**
 * The buyer an order or a question hangs off. One identity, and one storefront
 * session per row: `idx_sotuvchi_orders_active_draft` and
 * `idx_sotuvchi_handoffs_active` are unique per session, which is the domain
 * saying a buyer cannot hold two live conversations at once. A fixture that
 * shared one session could not seed two open questions.
 */
export function seedCheckoutPrerequisites(db: SqliteD1): void {
  db.exec(`
    INSERT INTO identities (id, provider, external_id, created_at, updated_at)
    VALUES ('identity_buyer', 'telegram', '700100200', '${NOW}', '${NOW}');
  `);
}

function seedSession(db: SqliteD1, key: string): string {
  const id = `session_${key}`;
  db.exec(`
    INSERT INTO sotuvchi_storefront_sessions (
      id, bot_username, identity_id, org_id, store_id, status, created_at, updated_at
    )
    VALUES ('${id}', 'bormi_bot_${key}', 'identity_buyer', '${ORG}', '${STORE}',
            'active', '${NOW}', '${NOW}');
  `);
  return id;
}

export interface SeedOrder {
  id: string;
  number: string;
  status?: string;
  fulfillment?: string;
  totalMinor?: number | null;
  createdAt?: string;
  placedAt?: string | null;
  item?: { productId: string; name: string; priceMinor: number } | null;
}

export function seedOrder(db: SqliteD1, order: SeedOrder): void {
  const status = order.status ?? 'placed';
  const placedAt = order.placedAt === undefined
    ? (status === 'placed' ? (order.createdAt ?? NOW) : null)
    : order.placedAt;
  const total = order.totalMinor === undefined ? 150000 : order.totalMinor;
  const session = seedSession(db, order.id);
  db.exec(`
    INSERT INTO workflow_instances (
      id, org_id, workflow_id, workflow_version, state, status, payload_json,
      version, idempotency_key, created_at, updated_at
    )
    VALUES ('workflow_${order.id}', '${ORG}', 'sotuvchi.checkout', 1, 'placed',
            'active', '{}', 1, 'key_${order.id}', '${NOW}', '${NOW}');
    INSERT INTO sotuvchi_orders (
      id, org_id, store_id, buyer_session_id, workflow_instance_id, order_number,
      status, buyer_name, buyer_phone, buyer_address, total_minor, currency,
      version, last_operation_key, created_at, updated_at, placed_at,
      fulfillment_status
    )
    VALUES (
      '${order.id}', '${ORG}', '${STORE}', '${session}', 'workflow_${order.id}',
      '${order.number}', '${status}',
      ${status === 'placed' ? "'Покупатель Тест'" : 'NULL'},
      ${status === 'placed' ? "'+998900000000'" : 'NULL'},
      ${status === 'placed' ? "'Тестовый адрес 1'" : 'NULL'},
      ${status === 'placed' ? (total ?? 150000) : (total === null ? 'NULL' : total)},
      'UZS', 1, 'seed', '${order.createdAt ?? NOW}', '${NOW}',
      ${placedAt === null ? 'NULL' : `'${placedAt}'`},
      '${order.fulfillment ?? 'none'}'
    );
  `);
  if (order.item) {
    db.exec(`
      INSERT INTO sotuvchi_order_items (
        id, org_id, store_id, order_id, product_id, product_name_snapshot,
        unit_price_minor, currency, availability_snapshot, quantity,
        line_total_minor, created_at, updated_at
      )
      VALUES ('item_${order.id}', '${ORG}', '${STORE}', '${order.id}',
              '${order.item.productId}', '${order.item.name}',
              ${order.item.priceMinor}, 'UZS', 'available', 1,
              ${order.item.priceMinor}, '${NOW}', '${NOW}');
    `);
  }
}

export interface SeedQuestion {
  id: string;
  status?: string;
  reason?: string;
  question?: string | null;
  reply?: string | null;
  createdAt?: string;
  deliveredAt?: string | null;
}

export function seedQuestion(db: SqliteD1, question: SeedQuestion): void {
  const status = question.status ?? 'open';
  const reply = question.reply === undefined
    ? (status === 'answered' || status === 'closed' ? 'Ответ продавца' : null)
    : question.reply;
  const questionText = question.question === undefined ? 'Вопрос покупателя' : question.question;
  const session = seedSession(db, question.id);
  db.exec(`
    INSERT INTO sotuvchi_handoffs (
      id, org_id, store_id, buyer_identity_id, buyer_session_id, seller_identity_id,
      status, reason, question_text, reply_text, content_cleared_at,
      seller_notified_at, seller_notify_attempts, buyer_delivered_at,
      buyer_delivery_attempts, last_operation_key, created_at, updated_at,
      answered_at, closed_at, expires_at, version
    )
    VALUES (
      '${question.id}', '${ORG}', '${STORE}', 'identity_buyer', '${session}', NULL,
      '${status}', '${question.reason ?? 'unknown_intent'}',
      ${questionText === null ? 'NULL' : `'${questionText}'`},
      ${reply === null ? 'NULL' : `'${reply}'`},
      NULL, '${NOW}', 1,
      ${question.deliveredAt === undefined || question.deliveredAt === null ? 'NULL' : `'${question.deliveredAt}'`},
      0, 'seed', '${question.createdAt ?? NOW}', '${NOW}',
      ${status === 'answered' || status === 'closed' ? `'${NOW}'` : 'NULL'},
      ${status === 'closed' ? `'${NOW}'` : 'NULL'},
      '2026-08-11T00:00:00.000Z', 1
    );
  `);
}

export function productStatus(db: SqliteD1, id: string): string {
  return String(db.value('SELECT status FROM sotuvchi_products WHERE id = ?', id));
}

export function productVersion(db: SqliteD1, id: string): number {
  return Number(db.value('SELECT version FROM sotuvchi_products WHERE id = ?', id));
}

export function auditCount(db: SqliteD1): number {
  return Number(db.value('SELECT COUNT(*) FROM owner_audit_events') ?? 0);
}

/** The env shape the owner endpoints read, and nothing else. */
export function adminEnv(db: SqliteD1, overrides: Record<string, unknown> = {}) {
  return {
    GPTBOT_DRAFTS_DB: db.asD1(),
    JWT_SECRET: TEST_SIGNING_INPUT,
    ...overrides,
  } as unknown as Parameters<PagesFunction>[0]['env'];
}

/** A token the real `requirePlatformRole` will accept, minted the same way. */
export async function platformToken(
  role: 'platform_owner' | 'support_readonly' | 'seller',
  email = role === 'platform_owner' ? OWNER_EMAIL : SUPPORT_EMAIL,
): Promise<string> {
  return new jose.SignJWT({ email, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('gptbot-seo-admin')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(TEST_SIGNING_INPUT));
}

export interface CallOptions {
  method?: string;
  token?: string | null;
  body?: unknown;
  params?: Record<string, string>;
  search?: string;
}

/**
 * Invoke a Pages function the way the runtime does: a real Request, a real env,
 * real route params. Nothing about authorization is stubbed, so a test that
 * says "support is refused" is a test of the guard production runs.
 */
export async function callRoute(
  handler: unknown,
  db: SqliteD1,
  path_: string,
  options: CallOptions = {},
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(options.body);
  }
  const request = new Request(`https://gptbot.uz${path_}${options.search ?? ''}`, init);
  const response = await (handler as (context: unknown) => Promise<Response>)({
    request,
    env: adminEnv(db),
    params: options.params ?? {},
  });
  const text = await response.text();
  let body: Record<string, unknown>;
  try { body = JSON.parse(text) as Record<string, unknown>; } catch { body = { raw: text }; }
  return { status: response.status, body, headers: response.headers };
}
