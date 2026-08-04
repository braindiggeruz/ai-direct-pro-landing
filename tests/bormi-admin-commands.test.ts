// ADMIN-3B: the three listing lifecycle commands.
//
// A write surface earns a different kind of test than a read surface. These
// hold the properties that make an owner command safe to exist at all: the
// browser never chooses authority or an outcome, a stale version cannot
// overwrite a fresh one, a retry cannot transition twice, and nothing changes
// without a row in the audit trail written in the same atomic batch.
//
// They also hold the negative space — the commands that were *not* built,
// because the catalogue domain has no transition for them.
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as archiveRoute from '../functions/api/admin/listings/[id]/archive';
import * as publishRoute from '../functions/api/admin/listings/[id]/publish';
import * as unpublishRoute from '../functions/api/admin/listings/[id]/unpublish';
import {
  auditCount,
  callRoute,
  freshAdminDb,
  OTHER_ORG,
  OTHER_STORE,
  OWNER_EMAIL,
  platformToken,
  productStatus,
  productVersion,
  seedProduct,
} from './helpers/bormi-admin-fixture';

const ROOT = new URL('../', import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const LIFECYCLE = 'functions/platform/admin/listing-lifecycle.ts';
const VALIDATION = 'functions/platform/admin/validation.ts';
const AUDIT = 'functions/platform/admin/audit.ts';
const MIGRATION = 'migrations/0033_owner_audit_listing_actions.sql';
const CATALOG_SERVICE = 'functions/agents/sotuvchi/catalog/service.ts';
const CATALOG_STORE = 'functions/agents/sotuvchi/catalog/store.ts';
const DETAIL_PAGE = 'apps/bormi-admin/src/pages/ListingDetail.tsx';
const API = 'apps/bormi-admin/src/lib/api.ts';
const ROUTES = [
  'functions/api/admin/listings/[id]/publish.ts',
  'functions/api/admin/listings/[id]/unpublish.ts',
  'functions/api/admin/listings/[id]/archive.ts',
];

// ── Authority ────────────────────────────────────────────────────────────────

test('commands: every command route is platform_owner only', async () => {
  for (const path of ROUTES) {
    const route = code(await source(path));
    assert.match(route, /withOwnerRole\('platform_owner'/, `${path} is not owner-guarded`);
    assert.doesNotMatch(route, /support_readonly/, `${path} admits support`);
  }
});

test('commands: support, sellers and buyers have no path to these routes', async () => {
  // There is exactly one guard and it is the platform role. No route consults a
  // seller session, a market access context or a Telegram identity.
  const lifecycle = code(await source(LIFECYCLE));
  for (const escape of ['claims', 'initData', 'sellerOrg', 'MarketAccess', 'buyer']) {
    assert.ok(!lifecycle.includes(escape), `the command path touches ${escape}`);
  }
});

test('commands: the rollout flag is not authority', async () => {
  const lifecycle = code(await source(LIFECYCLE));
  assert.doesNotMatch(lifecycle, /BORMI_ADMIN_V2_ENABLED/);
  for (const path of ROUTES) {
    assert.doesNotMatch(code(await source(path)), /BORMI_ADMIN_V2_ENABLED/, path);
  }
});

test('commands: every non-POST method is refused', async () => {
  for (const path of ROUTES) {
    const route = code(await source(path));
    for (const method of ['Get', 'Put', 'Patch', 'Delete']) {
      assert.match(
        route,
        new RegExp(`onRequest${method} = methodNotAllowed\\('POST'\\)`),
        `${path} does not refuse ${method}`,
      );
    }
  }
});

// ── The browser decides nothing ──────────────────────────────────────────────

test('commands: the target is resolved from the id, never sent by the caller', async () => {
  const lifecycle = code(await source(LIFECYCLE));
  // Org, store, status, version and the authorising identity all come from one
  // server-side lookup keyed by the product id.
  assert.match(lifecycle, /async function resolveTarget/);
  assert.match(lifecycle, /WHERE product\.id = \?/);
  // The parsed body has a closed key set; org and store are not in it.
  const validation = code(await source(VALIDATION));
  assert.match(
    validation,
    /MUTATION_KEYS = \['confirmation', 'expected_version', 'idempotency_key', 'reason_code'\]/,
  );
  assert.match(validation, /throw new OwnerValidationError\('unexpected_field'\)/);
});

test('commands: the client never names a target status', async () => {
  const api = code(await source(API));
  const block = api.slice(api.indexOf('runListingCommand'));
  for (const forbidden of ['published', 'archived', "'draft'", 'status:']) {
    assert.ok(!block.includes(forbidden), `the client sends ${forbidden}`);
  }
  // The final status comes from a table in the server module, keyed by the
  // transition the route chose.
  const lifecycle = code(await source(LIFECYCLE));
  assert.match(lifecycle, /nextStatus: 'published'/);
  assert.match(lifecycle, /nextStatus: 'draft'/);
  assert.match(lifecycle, /nextStatus: 'archived'/);
});

test('commands: cross-store mutation is impossible', async () => {
  const lifecycle = code(await source(LIFECYCLE));
  // Both the audit guard and the update are bound to the org and store that the
  // product itself resolved to.
  assert.match(lifecycle, /WHERE id = \? AND org_id = \? AND store_id = \?/);
  assert.match(lifecycle, /target\.orgId, target\.storeId/);
});

// ── The transitions are the domain's, not invented ───────────────────────────

test('commands: the three transitions mirror the catalogue domain exactly', async () => {
  const service = code(await source(CATALOG_SERVICE));
  // The domain implements publish, unpublish and archive, and refuses anything
  // that starts from the wrong status.
  assert.match(service, /transition === 'publish' && current\.status !== 'draft'/);
  assert.match(service, /transition === 'unpublish' && current\.status !== 'published'/);
  assert.match(service, /if \(current\.status === 'archived'\)/);

  const lifecycle = code(await source(LIFECYCLE));
  assert.match(lifecycle, /publish: \{ action: 'listing\.publish', nextStatus: 'published', allowedFrom: \['draft'\] \}/);
  assert.match(lifecycle, /unpublish: \{ action: 'listing\.unpublish', nextStatus: 'draft', allowedFrom: \['published'\] \}/);
  assert.match(lifecycle, /archive: \{ action: 'listing\.archive', nextStatus: 'archived', allowedFrom: \['draft', 'published'\] \}/);
});

test('commands: there is no restore, because the domain has none', async () => {
  const service = code(await source(CATALOG_SERVICE));
  assert.doesNotMatch(service, /restoreProduct|unarchiveProduct/);
  const lifecycle = code(await source(LIFECYCLE));
  assert.doesNotMatch(lifecycle, /restore|unarchive/i);
  const page = code(await source(DETAIL_PAGE));
  assert.ok(!page.includes('Восстановить'), 'the screen offers a restore the domain cannot do');
});

test('commands: unpublish is a real transition, not an alias for archive', async () => {
  const lifecycle = code(await source(LIFECYCLE));
  // Different target status, different audit verb, different route.
  assert.match(lifecycle, /'listing\.unpublish', nextStatus: 'draft'/);
  assert.match(lifecycle, /'listing\.archive', nextStatus: 'archived'/);
  const page = await source(DETAIL_PAGE);
  assert.match(page, /вернётся в черновики/);
});

// ── Version, idempotency, atomicity ──────────────────────────────────────────

test('commands: a missing expected version is refused', async () => {
  const lifecycle = code(await source(LIFECYCLE));
  assert.match(lifecycle, /if \(expected === undefined\) throw new OwnerValidationError\('invalid_expected_version'\)/);
  const validation = code(await source(VALIDATION));
  assert.match(validation, /invalid_expected_version/);
});

test('commands: a stale version is a conflict, never an overwrite', async () => {
  const lifecycle = code(await source(LIFECYCLE));
  assert.match(lifecycle, /if \(expected !== target\.version\)/);
  assert.match(lifecycle, /outcome: 'conflict'/);
  assert.match(lifecycle, /\}, ctx\.requestId, 409\)/);
  // And the update itself is guarded by the same version, so a race that slips
  // past the check still cannot write.
  assert.match(lifecycle, /AND version = \? AND status <> 'archived'/);
});

test('commands: the audit row and the status move in one atomic batch', async () => {
  const lifecycle = code(await source(LIFECYCLE));
  assert.match(lifecycle, /ctx\.db\.batch\(\[auditPlan\.statement, update, ledger\]\)/);
  // The update cannot apply unless the audit row from this batch exists.
  assert.match(lifecycle, /AND EXISTS \(SELECT 1 FROM owner_audit_events WHERE event_id = \?\)/);
  // And a write that reported no change is a failure, not a silent success.
  assert.match(lifecycle, /listing_atomic_write_failed/);
});

test('commands: a replay returns the first outcome and transitions nothing', async () => {
  const lifecycle = code(await source(LIFECYCLE));
  // Resolved before the state check, or a legitimate retry would read as an
  // illegal transition because the first attempt already moved the status.
  const replayAt = lifecycle.indexOf('findOwnerAuditReplay');
  const stateAt = lifecycle.indexOf('rule.allowedFrom.includes');
  assert.ok(replayAt > 0 && replayAt < stateAt, 'the replay check no longer runs before the state check');
  assert.match(lifecycle, /outcome: 'duplicate'/);
});

test('commands: one logical attempt carries one idempotency key', async () => {
  const page = code(await source(DETAIL_PAGE));
  // Minted when the operator opens a command, not when they press the button,
  // so a retry after a network error replays instead of transitioning twice.
  assert.match(page, /setAttemptKey\(`admin-\$\{listing\.id\}-\$\{command\}-\$\{listing\.version\}-\$\{crypto\.randomUUID\(\)\}`\)/);
  assert.match(page, /idempotencyKey: attemptKey/);
});

test('commands: a double tap cannot run the command twice', async () => {
  const page = code(await source(DETAIL_PAGE));
  assert.match(page, /if \(!active \|\| pending\) return;/);
  assert.match(page, /disabled=\{pending/);
});

test('commands: the update carries every guard the catalogue store carries', async () => {
  // The coupling this file documents: the admin writes the product row itself,
  // so it must reproduce the domain's predicates. If the domain gains a sixth,
  // this is where it should be noticed.
  const store = code(await source(CATALOG_STORE));
  const lifecycle = code(await source(LIFECYCLE));
  for (const guard of [
    "status <> 'archived'",
    "membership.role = 'owner'",
    "membership.status = 'active'",
    "store.status = 'active'",
  ]) {
    assert.ok(store.includes(guard), `the catalogue store no longer has: ${guard}`);
    assert.ok(lifecycle.includes(guard), `the admin update is missing: ${guard}`);
  }
  assert.match(lifecycle, /version = version \+ 1/);
  assert.match(lifecycle, /last_operation_key = \?/);
});

test('commands: the owning identity is resolved server-side and never stored as an actor', async () => {
  const lifecycle = code(await source(LIFECYCLE));
  assert.match(lifecycle, /SELECT membership\.identity_id/);
  assert.match(lifecycle, /ownerIdentityId/);
  // It is used only as a predicate binding, never inserted anywhere.
  assert.doesNotMatch(lifecycle, /INSERT[\s\S]{0,400}identity_id/);
  const store = code(await source(CATALOG_STORE));
  // The domain does the same: the identity authorises, it is not recorded.
  assert.match(store, /membership\.identity_id = \?/);
});

// ── Audit ────────────────────────────────────────────────────────────────────

test('commands: nothing changes without an audit row', async () => {
  const lifecycle = code(await source(LIFECYCLE));
  const updateAt = lifecycle.indexOf('UPDATE sotuvchi_products');
  const auditAt = lifecycle.indexOf('prepareOwnerAuditInsert');
  assert.ok(auditAt > 0 && auditAt < updateAt, 'the audit is no longer prepared before the update');
  assert.match(lifecycle, /actorEmail: ctx\.actor\.email/);
  assert.match(lifecycle, /targetType: 'product'/);
});

test('commands: the audit action is exact, not borrowed', async () => {
  const validation = code(await source(VALIDATION));
  for (const verb of ['listing.publish', 'listing.unpublish', 'listing.archive']) {
    assert.match(validation, new RegExp(`'${verb.replace('.', '\\.')}'`), `${verb} is missing`);
  }
  const lifecycle = code(await source(LIFECYCLE));
  // No store or automation verb is reused to describe a listing action.
  for (const borrowed of ['store.suspend', 'store.restore', 'automation.replay', 'pilot.']) {
    assert.ok(!lifecycle.includes(borrowed), `a listing action is recorded as ${borrowed}`);
  }
});

test('commands: the audit metadata carries ids and state, never seller copy', async () => {
  const lifecycle = code(await source(LIFECYCLE));
  const metadata = lifecycle.slice(
    lifecycle.indexOf('function safeMetadata'),
    lifecycle.indexOf('function publishPrecondition'),
  );
  for (const forbidden of ['name', 'description', 'price', 'specifications', 'media_refs']) {
    assert.ok(!metadata.includes(forbidden), `the audit metadata carries ${forbidden}`);
  }
  assert.match(metadata, /product_id/);
  assert.match(metadata, /status/);
  assert.match(metadata, /version/);
});

test('commands: a reason code is required and comes from the closed list', async () => {
  const lifecycle = code(await source(LIFECYCLE));
  assert.match(lifecycle, /reasonCode: body\.reasonCode/);
  const validation = code(await source(VALIDATION));
  assert.match(validation, /requireReasonCode\(record\.reason_code\)/);
  assert.match(validation, /invalid_reason_code/);
  // The screen offers exactly that list and no free text.
  const page = code(await source(DETAIL_PAGE));
  assert.match(page, /Object\.entries\(REASON_CODE\)/);
  assert.ok(!page.includes('placeholder="Причина"'), 'the reason is free text');
});

test('commands: archive requires the id to be retyped, publish does not', async () => {
  const validation = code(await source(VALIDATION));
  const typed = validation.slice(
    validation.indexOf('TYPED_CONFIRMATION_ACTIONS'),
    validation.indexOf('export const OWNER_LIMITS'),
  );
  assert.ok(typed.includes("'listing.archive'"), 'archive is not typed-confirmed');
  assert.ok(!typed.includes("'listing.publish'"), 'publish demands a typed confirmation');
  const lifecycle = code(await source(LIFECYCLE));
  assert.match(lifecycle, /requireTypedConfirmation\(rule\.action, body\.confirmation, target\.id\)/);
});

// ── Migration ────────────────────────────────────────────────────────────────

test('commands: the audit widening migration is unique and only touches the audit table', async () => {
  const migrations = await readdir(new URL('migrations/', ROOT));
  assert.deepEqual(
    migrations.filter((name) => name.includes('owner_audit_listing_actions')),
    ['0033_owner_audit_listing_actions.sql'],
    'the command audit widening must have one canonical migration',
  );
  assert.ok(migrations.includes('0033_owner_audit_listing_actions.sql'));
  const sql = await source(MIGRATION);
  for (const table of ['sotuvchi_products', 'sotuvchi_categories', 'sotuvchi_orders', 'memberships']) {
    assert.ok(!sql.includes(table), `the migration touches ${table}`);
  }
});

test('commands: the migration widens two lists and preserves everything else', async () => {
  const sql = await source(MIGRATION);
  for (const verb of ['listing.publish', 'listing.unpublish', 'listing.archive']) {
    assert.ok(sql.includes(`'${verb}'`), `${verb} is not permitted`);
  }
  assert.match(sql, /target_type IN \('store', 'automation_job', 'product'\)/);
  // Every existing verb survives.
  for (const kept of [
    'store.suspend', 'store.restore', 'pilot.activate', 'pilot.pause',
    'automation.replay', 'seller.bind', 'seller.unbind',
  ]) {
    assert.ok(sql.includes(`'${kept}'`), `${kept} was dropped`);
  }
  // Every index is recreated.
  for (const index of ['idx_owner_audit_actor', 'idx_owner_audit_created', 'idx_owner_audit_target']) {
    assert.ok(sql.includes(index), `${index} was not recreated`);
  }
  assert.match(sql, /UNIQUE \(idempotency_key\)/);
  // The reason list is not widened: the existing eight already fit.
  assert.ok(!sql.includes("'listing_quality'"), 'the migration invents a reason code');
});

test('commands: the runtime bootstrap schema matches the migration', async () => {
  // `ensureOwnerAuditSchema` keeps local runs in parity with production. If it
  // drifts, tests pass against a schema production does not have.
  const audit = code(await source(AUDIT));
  for (const verb of ['listing.publish', 'listing.unpublish', 'listing.archive']) {
    assert.ok(audit.includes(`'${verb}'`), `the bootstrap DDL is missing ${verb}`);
  }
  assert.match(audit, /target_type IN \('store', 'automation_job', 'product'\)/);
});

// ── The screen ───────────────────────────────────────────────────────────────

test('commands: an unavailable action is absent, not disabled', async () => {
  const page = code(await source(DETAIL_PAGE));
  // Filtered by the current status before rendering.
  assert.match(page, /COMMANDS\.filter\(\(command\) => command\.from\.includes\(listing\.status\)\)/);
  assert.match(page, /available\.length === 0/);
  assert.match(page, /Переходов из архива в каталоге нет/);
});

test('commands: the confirmation names the action and its consequence', async () => {
  const page = await source(DETAIL_PAGE);
  assert.match(page, /Опубликовать объявление\?/);
  assert.match(page, /станет доступно покупателям/);
  assert.match(page, /Переместить объявление в архив\?/);
  assert.match(page, /перестанут его видеть/);
  // Never the abstract one.
  assert.ok(!page.includes('Вы уверены'), 'the confirmation is abstract');
});

test('commands: success is never optimistic', async () => {
  const page = code(await source(DETAIL_PAGE));
  // The result shown is the server's answer, and the screen re-reads afterwards
  // rather than patching what it already had.
  assert.match(page, /setResult\(answer\)/);
  assert.match(page, /onDone\(\)/);
  assert.match(page, /onDone=\{detail\.reload\}/);
  // No local status assignment anywhere in the command path.
  assert.doesNotMatch(page, /setListing|listing\.status = /);
});

test('commands: a conflict refreshes and asks again rather than retrying', async () => {
  const page = await source(DETAIL_PAGE);
  assert.match(page, /Объявление изменилось после открытия/);
  assert.match(page, /выберите действие заново/);
  const api = code(await source(API));
  // The 409 conflict body is returned as an outcome, not thrown away.
  assert.match(api, /if \(conflict && conflict\.outcome === 'conflict'\) return conflict;/);
  // Nothing retries on its own.
  assert.doesNotMatch(api, /retry|setTimeout/i);
});

test('commands: every failure has a sentence and none leaks a payload', async () => {
  const text = code(await source('apps/bormi-admin/src/lib/text.ts'));
  for (const token of [
    'listing_not_found', 'invalid_listing_transition', 'store_not_active',
    'listing_without_category', 'confirmation_mismatch', 'idempotency_conflict',
  ]) {
    assert.match(text, new RegExp(token), `${token} has no sentence`);
  }
  const lifecycle = code(await source(LIFECYCLE));
  assert.doesNotMatch(lifecycle, /console\.(log|warn|error)/);
});

test('commands: there are no bulk actions and no category writes', async () => {
  const page = code(await source(DETAIL_PAGE));
  for (const forbidden of ['selectedIds', 'checkbox', 'Выбрать все', 'bulk']) {
    assert.ok(!page.includes(forbidden), `the screen offers ${forbidden}`);
  }
  const listings = code(await source('apps/bormi-admin/src/pages/Listings.tsx'));
  assert.ok(!listings.includes('type="checkbox"'), 'the table offers multi-select');
  // No category mutation route exists.
  const categories = code(await source('functions/api/admin/categories/index.ts'));
  assert.match(categories, /onRequestPost = methodNotAllowed\('GET'\)/);
});

test('commands: fixtures refuse to run a command rather than fake one', async () => {
  const api = code(await source(API));
  assert.match(api, /if \(FIXTURE_MODE\) throw new AdminApiError\('fixture_mode_read_only'/);
});

// ── Behaviour ────────────────────────────────────────────────────────────────
//
// Everything above reads the source. What follows runs it: the real route
// handlers, the real `requirePlatformRole`, and a real SQLite database built
// from the migration ledger, so every CHECK production has is a CHECK these
// assertions passed through. A property that only a grep can see is a property
// that survives being deleted from the implementation.

const owner = () => platformToken('platform_owner');

async function publish(
  db: ReturnType<typeof freshAdminDb>,
  id: string,
  body: Record<string, unknown>,
  token?: string,
) {
  return callRoute(publishRoute.onRequestPost, db, `/api/admin/listings/${id}/publish`, {
    method: 'POST',
    token: token === undefined ? await owner() : token,
    body,
    params: { id },
  });
}

test('behaviour: a publish moves the listing, bumps the version and writes one audit row', async () => {
  const db = freshAdminDb();
  seedProduct(db, { id: 'p1', status: 'draft', version: 1 });

  const answer = await publish(db, 'p1', {
    reason_code: 'data_quality',
    idempotency_key: 'key-publish-1',
    expected_version: 1,
  });

  assert.equal(answer.status, 200);
  assert.equal(answer.body.outcome, 'applied');
  assert.equal(productStatus(db, 'p1'), 'published');
  assert.equal(productVersion(db, 'p1'), 2);
  assert.equal(auditCount(db), 1);

  const row = db.rows<Record<string, unknown>>('SELECT * FROM owner_audit_events')[0];
  assert.equal(row.action, 'listing.publish');
  assert.equal(row.target_type, 'product');
  assert.equal(row.target_id, 'p1');
  assert.equal(row.actor_email, OWNER_EMAIL);
  assert.equal(row.actor_role, 'platform_owner');
});

test('behaviour: the audit snapshots carry ids and lifecycle, never the seller card', async () => {
  const db = freshAdminDb();
  seedProduct(db, { id: 'p1', status: 'draft', version: 1 });
  await publish(db, 'p1', {
    reason_code: 'data_quality', idempotency_key: 'key-1', expected_version: 1,
  });

  const row = db.rows<Record<string, unknown>>('SELECT * FROM owner_audit_events')[0];
  for (const json of [String(row.before_json), String(row.after_json)]) {
    const snapshot = JSON.parse(json) as Record<string, unknown>;
    assert.deepEqual(Object.keys(snapshot).sort(), [
      'has_category', 'media_count', 'org_id', 'product_id', 'status', 'store_id', 'version',
    ]);
    // The product's own name is the seller's copy, and it is not here.
    assert.ok(!json.includes('Товар'), 'the audit snapshot carries the product name');
  }
});

test('behaviour: a stale version is refused and changes nothing', async () => {
  const db = freshAdminDb();
  seedProduct(db, { id: 'p1', status: 'draft', version: 4 });

  const answer = await publish(db, 'p1', {
    reason_code: 'data_quality',
    idempotency_key: 'key-stale',
    expected_version: 3,
  });

  assert.equal(answer.status, 409);
  assert.equal(answer.body.outcome, 'conflict');
  assert.equal(productStatus(db, 'p1'), 'draft');
  assert.equal(productVersion(db, 'p1'), 4);
  assert.equal(auditCount(db), 0, 'a refused command still wrote to the audit trail');
});

test('behaviour: a command with no version at all is refused', async () => {
  const db = freshAdminDb();
  seedProduct(db, { id: 'p1', status: 'draft', version: 1 });

  const answer = await publish(db, 'p1', {
    reason_code: 'data_quality',
    idempotency_key: 'key-noversion',
  });

  assert.equal(answer.status, 400);
  assert.equal(answer.body.error, 'invalid_expected_version');
  assert.equal(productStatus(db, 'p1'), 'draft');
  assert.equal(auditCount(db), 0);
});

test('behaviour: the same key twice transitions once', async () => {
  const db = freshAdminDb();
  seedProduct(db, { id: 'p1', status: 'draft', version: 1 });
  const body = {
    reason_code: 'data_quality',
    idempotency_key: 'key-replay',
    expected_version: 1,
  };

  const first = await publish(db, 'p1', body);
  // The second arrives with the version the operator still has on screen, which
  // is now stale — exactly what a retry after a dropped response looks like.
  const second = await publish(db, 'p1', body);

  assert.equal(first.body.outcome, 'applied');
  assert.equal(second.body.outcome, 'duplicate');
  assert.equal(second.body.audit_event_id, first.body.audit_event_id);
  assert.equal(productVersion(db, 'p1'), 2, 'the retry transitioned a second time');
  assert.equal(auditCount(db), 1);
});

test('behaviour: reusing a key for a different listing is a conflict, not a replay', async () => {
  const db = freshAdminDb();
  seedProduct(db, { id: 'p1', status: 'draft', version: 1 });
  seedProduct(db, { id: 'p2', status: 'draft', version: 1 });

  await publish(db, 'p1', {
    reason_code: 'data_quality', idempotency_key: 'shared', expected_version: 1,
  });
  const answer = await publish(db, 'p2', {
    reason_code: 'data_quality', idempotency_key: 'shared', expected_version: 1,
  });

  assert.equal(answer.status, 409);
  assert.equal(answer.body.error, 'idempotency_conflict');
  assert.equal(productStatus(db, 'p2'), 'draft');
});

test('behaviour: a transition the domain does not have is refused', async () => {
  const db = freshAdminDb();
  seedProduct(db, { id: 'p1', status: 'archived', version: 1 });

  const answer = await publish(db, 'p1', {
    reason_code: 'data_quality', idempotency_key: 'key-archived', expected_version: 1,
  });

  assert.equal(answer.status, 409);
  assert.equal(answer.body.error, 'invalid_listing_transition');
  assert.equal(productStatus(db, 'p1'), 'archived');
  assert.equal(auditCount(db), 0);
});

test('behaviour: a card with no category cannot be published', async () => {
  const db = freshAdminDb();
  seedProduct(db, { id: 'p1', status: 'draft', version: 1, categoryId: null });

  const answer = await publish(db, 'p1', {
    reason_code: 'data_quality', idempotency_key: 'key-nocat', expected_version: 1,
  });

  assert.equal(answer.status, 409);
  assert.equal(answer.body.error, 'listing_without_category');
  assert.equal(productStatus(db, 'p1'), 'draft');
});

test('behaviour: unpublish returns a listing to draft rather than archiving it', async () => {
  const db = freshAdminDb();
  seedProduct(db, { id: 'p1', status: 'published', version: 2 });

  const answer = await callRoute(
    unpublishRoute.onRequestPost, db, '/api/admin/listings/p1/unpublish',
    {
      method: 'POST',
      token: await owner(),
      body: { reason_code: 'data_quality', idempotency_key: 'key-un', expected_version: 2 },
      params: { id: 'p1' },
    },
  );

  assert.equal(answer.body.outcome, 'applied');
  assert.equal(productStatus(db, 'p1'), 'draft');
  const row = db.rows<Record<string, unknown>>('SELECT * FROM owner_audit_events')[0];
  assert.equal(row.action, 'listing.unpublish');
});

test('behaviour: archive demands the id retyped exactly', async () => {
  const db = freshAdminDb();
  seedProduct(db, { id: 'p1', status: 'published', version: 1 });

  async function archive(body: Record<string, unknown>) {
    return callRoute(archiveRoute.onRequestPost, db, '/api/admin/listings/p1/archive', {
      method: 'POST', token: await owner(), body, params: { id: 'p1' },
    });
  }

  const missing = await archive({
    reason_code: 'policy_violation', idempotency_key: 'k1', expected_version: 1,
  });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, 'confirmation_mismatch');

  const wrong = await archive({
    reason_code: 'policy_violation', idempotency_key: 'k2', expected_version: 1,
    confirmation: 'p',
  });
  assert.equal(wrong.body.error, 'confirmation_mismatch');
  assert.equal(productStatus(db, 'p1'), 'published');

  const right = await archive({
    reason_code: 'policy_violation', idempotency_key: 'k3', expected_version: 1,
    confirmation: 'p1',
  });
  assert.equal(right.body.outcome, 'applied');
  assert.equal(productStatus(db, 'p1'), 'archived');
});

test('behaviour: a suspended store cannot have its listings moved', async () => {
  const db = freshAdminDb({ storeStatus: 'suspended' });
  seedProduct(db, { id: 'p1', status: 'draft', version: 1 });

  const answer = await publish(db, 'p1', {
    reason_code: 'data_quality', idempotency_key: 'key-suspended', expected_version: 1,
  });

  assert.equal(answer.status, 409);
  assert.equal(answer.body.error, 'store_not_active');
  assert.equal(productStatus(db, 'p1'), 'draft');
});

test('behaviour: without an active owner membership the write is refused, not forced', async () => {
  const db = freshAdminDb({ ownerMembership: null });
  seedProduct(db, { id: 'p1', status: 'draft', version: 1 });

  const answer = await publish(db, 'p1', {
    reason_code: 'data_quality', idempotency_key: 'key-noowner', expected_version: 1,
  });

  assert.equal(answer.status, 409);
  assert.equal(answer.body.error, 'store_owner_unavailable');
  assert.equal(productStatus(db, 'p1'), 'draft');
  assert.equal(auditCount(db), 0);
});

test('behaviour: one listing moving leaves every other store untouched', async () => {
  const db = freshAdminDb();
  seedProduct(db, { id: 'p1', status: 'draft', version: 1 });
  seedProduct(db, {
    id: 'other', status: 'draft', version: 1, categoryId: null,
    orgId: OTHER_ORG, storeId: OTHER_STORE,
  });

  await publish(db, 'p1', {
    reason_code: 'data_quality', idempotency_key: 'key-scope', expected_version: 1,
  });

  assert.equal(productStatus(db, 'p1'), 'published');
  assert.equal(productStatus(db, 'other'), 'draft');
  assert.equal(productVersion(db, 'other'), 1);
});

test('behaviour: without migration 0033 nothing is published at all', async () => {
  // The exact state production is in if the panel were deployed before the
  // migration: the old CHECK rejects `listing.publish`, `INSERT OR IGNORE`
  // swallows it without a word, and the update — which depends on that very row
  // existing — writes nothing. A publish that could not be audited is a publish
  // that did not happen.
  //
  // The failure is closed and specific rather than a 500: no audit row means no
  // resolved insert, which is the `listing_transition_conflict` branch. The
  // operator is told to refresh, and the listing is exactly where they left it.
  const db = freshAdminDb({ skip: ['0033_'] });
  seedProduct(db, { id: 'p1', status: 'draft', version: 1 });

  const answer = await publish(db, 'p1', {
    reason_code: 'data_quality', idempotency_key: 'key-nomigration', expected_version: 1,
  });

  assert.equal(answer.status, 409);
  assert.equal(answer.body.error, 'listing_transition_conflict');
  assert.equal(productStatus(db, 'p1'), 'draft', 'the listing moved without an audit row');
  assert.equal(auditCount(db), 0);
});

test('behaviour: support cannot run a command, and neither can an unsigned caller', async () => {
  const db = freshAdminDb();
  seedProduct(db, { id: 'p1', status: 'draft', version: 1 });
  const body = {
    reason_code: 'data_quality', idempotency_key: 'key-role', expected_version: 1,
  };

  const support = await publish(db, 'p1', body, await platformToken('support_readonly'));
  assert.equal(support.status, 403);
  assert.equal(support.body.error, 'insufficient_role');

  const anonymous = await publish(db, 'p1', body, null);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error, 'missing_token');

  const seller = await publish(db, 'p1', body, await platformToken('seller'));
  assert.equal(seller.status, 403);
  assert.equal(seller.body.error, 'unknown_role');

  assert.equal(productStatus(db, 'p1'), 'draft');
  assert.equal(auditCount(db), 0);
});

test('behaviour: a field the contract does not name is refused outright', async () => {
  const db = freshAdminDb();
  seedProduct(db, { id: 'p1', status: 'draft', version: 1 });

  const answer = await publish(db, 'p1', {
    reason_code: 'data_quality',
    idempotency_key: 'key-extra',
    expected_version: 1,
    // A caller trying to name the outcome itself.
    status: 'published',
  });

  assert.equal(answer.status, 400);
  assert.equal(answer.body.error, 'unexpected_field');
  assert.equal(productStatus(db, 'p1'), 'draft');
});

test('behaviour: a reason outside the closed list is refused', async () => {
  const db = freshAdminDb();
  seedProduct(db, { id: 'p1', status: 'draft', version: 1 });

  const answer = await publish(db, 'p1', {
    reason_code: 'because_i_said_so',
    idempotency_key: 'key-reason',
    expected_version: 1,
  });

  assert.equal(answer.status, 400);
  assert.equal(answer.body.error, 'invalid_reason_code');
  assert.equal(auditCount(db), 0);
});

test('behaviour: every command answer forbids caching and indexing', async () => {
  const db = freshAdminDb();
  seedProduct(db, { id: 'p1', status: 'draft', version: 1 });

  const answer = await publish(db, 'p1', {
    reason_code: 'data_quality', idempotency_key: 'key-headers', expected_version: 1,
  });

  assert.equal(answer.headers.get('Cache-Control'), 'no-store');
  assert.match(String(answer.headers.get('X-Robots-Tag')), /noindex/);
  assert.ok(answer.headers.get('x-request-id'), 'the answer carries no request id');
});
