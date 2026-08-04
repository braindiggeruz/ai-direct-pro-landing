/**
 * The three listing transitions the platform owner may perform.
 *
 * They are not new capabilities. `CatalogService` already implements exactly
 * these three and no others — `publishProduct` (draft to published),
 * `unpublishProduct` (published back to draft) and `archiveProduct` (anything
 * not already archived to archived) — with the same version check and the same
 * refusal of an illegal transition. Nothing here invents a status, and there is
 * no "restore from archive", because the domain has none.
 *
 * ## Why the write is here rather than a call into `CatalogService`
 *
 * `CatalogService.transitionProduct` runs its own `db.batch`. An audit row
 * written outside that batch is a row that can survive a failed transition, or
 * be missing after a successful one — and an unaudited change to what buyers
 * can see is the exact thing `owner_audit_events` exists to prevent.
 *
 * So this follows the pattern `store-lifecycle.ts` already established for the
 * store mutations: the audit insert and the domain update go into **one** D1
 * batch, and the update depends on the event id inserted beside it. A failed
 * transition cannot leave a ghost audit, and a recorded audit cannot describe
 * something that did not happen.
 *
 * The cost of that choice is a coupling: the UPDATE below must carry the same
 * guards `CatalogStore.setProductStatus` carries. All five are reproduced —
 * version match, not-already-archived, active owner membership, active store,
 * and the operation-key write — and a test asserts each one is present. If the
 * domain adds a sixth guard, that test is where it will be noticed.
 *
 * ## Who the platform owner acts as
 *
 * Nobody. The catalogue's authorization predicate is an `EXISTS` over
 * `memberships` for the identity that owns the store; it is a capability check
 * and is **not stored** — `setProductStatus` writes no actor column, and
 * `sotuvchi_catalog_operations` has none. The only record of who acted is
 * `owner_audit_events`, and this writes the platform owner's own email into it.
 * The store's owning identity is resolved server-side from the product's own
 * org and store. It never arrives from a browser.
 */
import {
  ensureOwnerAuditSchema,
  findOwnerAuditReplay,
  prepareOwnerAuditInsert,
  resolveOwnerAuditInsert,
  type OwnerAuditInput,
} from './audit';
import {
  OwnerValidationError,
  parseOwnerMutationBody,
  requireIdentifier,
  requireTypedConfirmation,
  type OwnerAuditAction,
} from './validation';
import {
  firstParam,
  ownerError,
  ownerJson,
  readOwnerBody,
  type OwnerHandlerContext,
} from './http';

export type ListingTransition = 'publish' | 'unpublish' | 'archive';

interface TransitionRule {
  action: Extract<OwnerAuditAction, 'listing.publish' | 'listing.unpublish' | 'listing.archive'>;
  nextStatus: 'published' | 'draft' | 'archived';
  /** Statuses the catalogue domain accepts as a starting point. */
  allowedFrom: readonly string[];
}

/**
 * Mirrors `CatalogService.transitionProduct` exactly:
 *   publish   — only from draft
 *   unpublish — only from published
 *   archive   — from anything except archived
 */
export const LISTING_TRANSITIONS: Readonly<Record<ListingTransition, TransitionRule>> = {
  publish: { action: 'listing.publish', nextStatus: 'published', allowedFrom: ['draft'] },
  unpublish: { action: 'listing.unpublish', nextStatus: 'draft', allowedFrom: ['published'] },
  archive: { action: 'listing.archive', nextStatus: 'archived', allowedFrom: ['draft', 'published'] },
};

interface ProductTarget {
  id: string;
  orgId: string;
  storeId: string;
  status: string;
  version: number;
  categoryId: string | null;
  mediaCount: number;
  storeStatus: string;
  /** The identity whose owner membership authorises a write to this store. */
  ownerIdentityId: string | null;
}

interface Row { [key: string]: unknown }

/**
 * Resolve everything about the target from its id alone.
 *
 * The browser sends a product id and nothing else. Org, store, current status,
 * version and the authorising identity are all derived here, so a caller cannot
 * name a store it does not own or assert a status it would like to be true.
 */
async function resolveTarget(
  db: D1Database,
  productId: string,
): Promise<ProductTarget | null> {
  const row = await db.prepare(
    `SELECT product.id, product.org_id, product.store_id, product.status,
            product.version, product.category_id,
            json_array_length(product.media_refs_json) AS media_count,
            store.status AS store_status,
            (SELECT membership.identity_id
               FROM memberships AS membership
              WHERE membership.org_id = store.org_id
                AND membership.role = 'owner'
                AND membership.status = 'active'
              ORDER BY membership.identity_id
              LIMIT 1) AS owner_identity_id
       FROM sotuvchi_products AS product
       JOIN sotuvchi_stores AS store ON store.id = product.store_id
      WHERE product.id = ?`,
  ).bind(productId).first<Row>();
  if (!row) return null;
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    storeId: String(row.store_id),
    status: String(row.status),
    version: Number(row.version ?? 0),
    categoryId: row.category_id === null ? null : String(row.category_id),
    mediaCount: Number(row.media_count ?? 0),
    storeStatus: String(row.store_status),
    ownerIdentityId: row.owner_identity_id === null ? null : String(row.owner_identity_id),
  };
}

/** Allowlisted metadata. Ids and lifecycle state only — never seller copy. */
function safeMetadata(target: ProductTarget): Record<string, unknown> {
  return {
    product_id: target.id,
    org_id: target.orgId,
    store_id: target.storeId,
    status: target.status,
    version: target.version,
    has_category: target.categoryId !== null,
    media_count: target.mediaCount,
  };
}

/**
 * Publishing a card the catalogue would refuse is not something to discover
 * after the audit row is written. The domain validates the category on publish;
 * this refuses the same case up front, with a token that names it.
 */
function publishPrecondition(target: ProductTarget): string | null {
  if (target.categoryId === null) return 'listing_without_category';
  return null;
}

export async function handleListingTransition(
  ctx: OwnerHandlerContext,
  kind: ListingTransition,
): Promise<Response> {
  const rule = LISTING_TRANSITIONS[kind];
  const productId = requireIdentifier(firstParam(ctx.params, 'id'), 'invalid_listing_id');
  const body = parseOwnerMutationBody(await readOwnerBody(ctx.request));

  const target = await resolveTarget(ctx.db, productId);
  if (!target) return ownerError('listing_not_found', ctx.requestId, 404);

  // Archive requires the operator to retype the listing id; publish and
  // unpublish do not, because each undoes the other.
  requireTypedConfirmation(rule.action, body.confirmation, target.id);

  const now = new Date().toISOString();
  const auditInput: OwnerAuditInput = {
    actorEmail: ctx.actor.email,
    actorRole: ctx.actor.role,
    action: rule.action,
    targetType: 'product',
    targetId: target.id,
    orgId: target.orgId,
    reasonCode: body.reasonCode,
    requestId: ctx.requestId,
    idempotencyKey: body.idempotencyKey,
    before: safeMetadata(target),
    after: { ...safeMetadata(target), status: rule.nextStatus, version: target.version + 1 },
  };

  // Resolved before the state is examined. The first request necessarily
  // changed that state, so a retry must not be read as an illegal transition.
  const replay = await findOwnerAuditReplay(ctx.db, auditInput);
  if (replay) {
    return ownerJson({
      outcome: 'duplicate',
      listing: await resolveTarget(ctx.db, productId).then(summary),
      audit_event_id: replay.eventId,
    }, ctx.requestId);
  }

  // Already there is a no-op, not a failure: a double-click should read as
  // "nothing to do" rather than as an error the owner has to interpret.
  if (target.status === rule.nextStatus) {
    return ownerJson({
      outcome: 'unchanged',
      listing: summary(target),
      request_id: ctx.requestId,
    }, ctx.requestId);
  }
  if (!rule.allowedFrom.includes(target.status)) {
    return ownerError('invalid_listing_transition', ctx.requestId, 409);
  }
  if (target.storeStatus !== 'active') {
    return ownerError('store_not_active', ctx.requestId, 409);
  }
  if (!target.ownerIdentityId) {
    // No active owner membership means the catalogue's own predicate would
    // refuse the write. Saying so is better than a failed atomic batch.
    return ownerError('store_owner_unavailable', ctx.requestId, 409);
  }
  if (kind === 'publish') {
    const problem = publishPrecondition(target);
    if (problem) return ownerError(problem, ctx.requestId, 409);
  }

  // The version the caller saw. A stale one is a conflict, never an overwrite.
  const expected = body.expectedVersion;
  if (expected === undefined) throw new OwnerValidationError('invalid_expected_version');
  if (expected !== target.version) {
    return ownerJson({
      outcome: 'conflict',
      listing: summary(target),
      request_id: ctx.requestId,
    }, ctx.requestId, 409);
  }

  await ensureOwnerAuditSchema(ctx.db);
  const auditPlan = prepareOwnerAuditInsert(
    ctx.db,
    auditInput,
    now,
    `EXISTS (
       SELECT 1 FROM sotuvchi_products
       WHERE id = ? AND org_id = ? AND store_id = ? AND status = ? AND version = ?
     )`,
    [target.id, target.orgId, target.storeId, target.status, target.version],
  );

  // Every guard `CatalogStore.setProductStatus` applies, plus the dependency on
  // the audit row inserted in this same batch. D1 batches are atomic, so the
  // status and the record of who changed it move together or not at all.
  const operationKey = `admin:${auditPlan.eventId}`;
  const update = ctx.db.prepare(
    `UPDATE sotuvchi_products
        SET status = ?, version = version + 1,
            last_operation_key = ?, updated_at = ?
      WHERE id = ? AND org_id = ? AND store_id = ?
        AND version = ? AND status <> 'archived'
        AND EXISTS (
          SELECT 1 FROM sotuvchi_stores AS store
          JOIN memberships AS membership
            ON membership.org_id = store.org_id
           AND membership.identity_id = ?
           AND membership.role = 'owner'
           AND membership.status = 'active'
          WHERE store.org_id = ? AND store.id = ? AND store.status = 'active'
        )
        AND EXISTS (SELECT 1 FROM owner_audit_events WHERE event_id = ?)`,
  ).bind(
    rule.nextStatus, operationKey, now,
    target.id, target.orgId, target.storeId,
    target.version,
    target.ownerIdentityId,
    target.orgId, target.storeId,
    auditPlan.eventId,
  );

  // The catalogue's own idempotency ledger, kept in step so a later domain
  // replay sees the same history the admin wrote.
  const ledger = ctx.db.prepare(
    `INSERT OR IGNORE INTO sotuvchi_catalog_operations
       (org_id, store_id, idempotency_key, operation, fingerprint,
        target_id, result_version, created_at)
     SELECT org_id, store_id, ?, ?, ?, id, version, ?
       FROM sotuvchi_products
      WHERE org_id = ? AND store_id = ? AND id = ? AND last_operation_key = ?`,
  ).bind(
    operationKey, `catalog.product.${kind}`, auditPlan.eventId, now,
    target.orgId, target.storeId, target.id, operationKey,
  );

  const results = await ctx.db.batch([auditPlan.statement, update, ledger]);
  const audit = await resolveOwnerAuditInsert(ctx.db, auditPlan, results[0]);
  if (!audit) throw new OwnerValidationError('listing_transition_conflict');
  if (audit.outcome === 'duplicate') {
    return ownerJson({
      outcome: 'duplicate',
      listing: await resolveTarget(ctx.db, productId).then(summary),
      audit_event_id: audit.event.eventId,
    }, ctx.requestId);
  }
  if (Number((results[1] as { meta?: { changes?: number } })?.meta?.changes ?? 0) !== 1) {
    throw new Error('listing_atomic_write_failed');
  }

  return ownerJson({
    outcome: 'applied',
    listing: await resolveTarget(ctx.db, productId).then(summary),
    audit_event_id: audit.event.eventId,
  }, ctx.requestId);
}

/** The small, safe shape a command answers with. No seller copy, no ids beyond the target. */
function summary(target: ProductTarget | null): Record<string, unknown> | null {
  if (!target) return null;
  return {
    id: target.id,
    status: target.status,
    version: target.version,
    store_id: target.storeId,
  };
}
