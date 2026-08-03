/**
 * GET /api/admin/overview — one bounded read behind the Bormi Admin command centre.
 *
 * The Owner Control Center that shipped before this asked a different question
 * of each screen, and the first screen therefore asked several. A command centre
 * that opens with fifteen parallel D1 reads is a command centre that is slow
 * exactly when something is wrong, so this is one request, and every number in
 * it is counted from a table that exists.
 *
 * Three rules the shape follows, in order of how much trouble breaking them
 * causes:
 *
 *   Nothing is invented. If the platform cannot answer a question - deployment
 *   ids, view counts, revenue, moderation queues - the field is absent and the
 *   screen says so rather than drawing a zero that reads as calm.
 *
 *   Nothing identifies a person. Counts, statuses and store names only. No
 *   Telegram id, no username, no phone, no initData, no session, no raw query.
 *
 *   Nothing here mutates. This is a read, it takes the reader role, and every
 *   command the panel offers goes to the endpoint that already owns it.
 */
import {
  methodNotAllowed,
  ownerJson,
  withOwnerRole,
} from '../../platform/admin';
import { bindingCeremonyOpen, bindingEnabled } from '../../platform/admin/seller-binding';

/** Rows a "recent" list may carry. Small on purpose: this is a glance, not a report. */
const RECENT = 8;
/** How far back the movement counters look. */
const WINDOW_DAYS = 7;

function flag(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

interface Row { [key: string]: unknown }

function num(value: unknown): number {
  return Number(value ?? 0);
}

export const onRequestGet = withOwnerRole('platform_owner', async (ctx) => {
  const now = new Date();
  const nowIso = now.toISOString();
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
  const dayStart = `${nowIso.slice(0, 10)}T00:00:00.000Z`;
  const db = ctx.db;

  // One statement per subject, each one indexed or bounded, none of them a scan
  // of anything a marketplace grows without limit. D1 batches them in a single
  // round trip.
  const [
    listings,
    quality,
    stores,
    orders,
    handoffs,
    access,
    challenges,
    ledger,
    recentListings,
    recentOrders,
    recentAudit,
  ] = await db.batch<Row>([
    db.prepare(
      `SELECT status, COUNT(*) AS n FROM sotuvchi_products GROUP BY status`,
    ),
    db.prepare(
      `SELECT
         SUM(CASE WHEN json_array_length(media_refs_json) = 0 THEN 1 ELSE 0 END) AS no_photo,
         SUM(CASE WHEN description IS NULL OR trim(description) = '' THEN 1 ELSE 0 END) AS no_description,
         SUM(CASE WHEN category_id IS NULL THEN 1 ELSE 0 END) AS no_category,
         SUM(CASE WHEN availability = 'unavailable' THEN 1 ELSE 0 END) AS unavailable,
         SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END) AS touched_7d
       FROM sotuvchi_products
       WHERE status = 'published'`,
    ).bind(since),
    db.prepare(
      `SELECT status, COUNT(*) AS n FROM sotuvchi_stores GROUP BY status`,
    ),
    // An order carries two columns, not one: `status` says whether it exists
    // and `fulfillment_status` says how far it got. Counting only the first
    // reports every confirmed and completed order as merely "placed", which is
    // the kind of wrong that looks right on a dashboard.
    db.prepare(
      `SELECT
         SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
         SUM(CASE WHEN status = 'placed' AND fulfillment_status = 'none' THEN 1 ELSE 0 END) AS placed,
         SUM(CASE WHEN status = 'placed' AND fulfillment_status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
         SUM(CASE WHEN fulfillment_status = 'done' THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
         SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS today,
         SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last7d
       FROM sotuvchi_orders`,
    ).bind(dayStart, since),
    db.prepare(
      `SELECT status, COUNT(*) AS n FROM sotuvchi_handoffs GROUP BY status`,
    ),
    // Access, counted rather than listed. Which identity holds what is a
    // question for the access screen, and it answers it without printing ids.
    db.prepare(
      `SELECT
         COUNT(*) AS memberships,
         SUM(CASE WHEN status = 'active' AND role = 'owner' THEN 1 ELSE 0 END) AS owners_active,
         SUM(CASE WHEN status <> 'active' THEN 1 ELSE 0 END) AS disabled,
         SUM(CASE WHEN identity.provider = 'telegram' AND membership.status = 'active'
                  THEN 1 ELSE 0 END) AS telegram_active
       FROM memberships AS membership
       JOIN identities AS identity ON identity.id = membership.identity_id`,
    ),
    db.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN redeemed_at IS NULL AND expires_at > ? THEN 1 ELSE 0 END) AS live,
         SUM(CASE WHEN redeemed_at IS NOT NULL THEN 1 ELSE 0 END) AS redeemed
       FROM seller_identity_binding_challenges`,
    ).bind(nowIso),
    db.prepare(
      `SELECT COUNT(*) AS applied, MAX(name) AS last FROM d1_migrations`,
    ),
    db.prepare(
      `SELECT product.id, product.name, product.status, product.availability,
              product.price_minor, product.updated_at, store.name AS store_name,
              json_array_length(product.media_refs_json) AS media_count
         FROM sotuvchi_products AS product
         JOIN sotuvchi_stores AS store ON store.id = product.store_id
        ORDER BY product.updated_at DESC
        LIMIT ${RECENT}`,
    ),
    db.prepare(
      `SELECT order_number, status, fulfillment_status, total_minor, created_at
         FROM sotuvchi_orders
        ORDER BY created_at DESC LIMIT ${RECENT}`,
    ),
    // The security trail is deliberately not merged into the activity feed: one
    // is what the marketplace did, the other is what an operator did to it.
    db.prepare(
      `SELECT action, target_type, actor_role, reason_code, created_at
         FROM owner_audit_events
        ORDER BY created_at DESC LIMIT ${RECENT}`,
    ),
  ]).then((results) => results.map((result) => result.results ?? []));

  const byStatus = (rows: Row[], key = 'status') => Object.fromEntries(
    rows.map((row) => [String(row[key]), num(row.n)]),
  ) as Record<string, number>;

  const listingStates = byStatus(listings);
  const storeStates = byStatus(stores);
  const orderRow = orders[0] ?? {};
  const orderStates = {
    draft: num(orderRow.draft),
    placed: num(orderRow.placed),
    confirmed: num(orderRow.confirmed),
    done: num(orderRow.done),
    cancelled: num(orderRow.cancelled),
  };
  const handoffStates = byStatus(handoffs);
  const cards = quality[0] ?? {};
  const accessRow = access[0] ?? {};
  const challengeRow = challenges[0] ?? {};
  const ledgerRow = ledger[0] ?? {};

  const published = listingStates.published ?? 0;
  const noPhoto = num(cards.no_photo);
  const noDescription = num(cards.no_description);
  const noCategory = num(cards.no_category);
  const unavailable = num(cards.unavailable);
  const openHandoffs = handoffStates.open ?? 0;
  const openOrders = orderStates.placed + orderStates.confirmed;
  const suspendedStores = storeStates.suspended ?? 0;
  const liveChallenges = num(challengeRow.live);

  // Attention is a list of things a person could act on, each with the number
  // that makes it worth acting on. An item with a count of zero is not an item.
  const attention = [
    openHandoffs > 0 && { code: 'handoffs_open', severity: 'warning', count: openHandoffs },
    openOrders > 0 && { code: 'orders_open', severity: 'info', count: openOrders },
    noPhoto > 0 && { code: 'listings_without_photo', severity: 'warning', count: noPhoto },
    noDescription > 0 && { code: 'listings_without_description', severity: 'info', count: noDescription },
    noCategory > 0 && { code: 'listings_without_category', severity: 'info', count: noCategory },
    unavailable > 0 && { code: 'listings_unavailable', severity: 'info', count: unavailable },
    suspendedStores > 0 && { code: 'stores_suspended', severity: 'critical', count: suspendedStores },
    liveChallenges > 0 && { code: 'binding_challenge_live', severity: 'critical', count: liveChallenges },
    num(accessRow.telegram_active) === 0 && {
      code: 'no_telegram_seller_access', severity: 'warning', count: 1,
    },
  ].filter(Boolean);

  return ownerJson({
    generated_at: nowIso,
    window_days: WINDOW_DAYS,
    actor: { email: ctx.actor.email, role: ctx.actor.role },
    rollout: { admin_v2: flag(ctx.env.BORMI_ADMIN_V2_ENABLED) },
    listings: {
      published,
      draft: listingStates.draft ?? 0,
      archived: listingStates.archived ?? 0,
      total: Object.values(listingStates).reduce((sum, value) => sum + value, 0),
      touched_7d: num(cards.touched_7d),
      quality: {
        no_photo: noPhoto,
        no_description: noDescription,
        no_category: noCategory,
        unavailable,
      },
    },
    stores: {
      active: storeStates.active ?? 0,
      suspended: suspendedStores,
      total: Object.values(storeStates).reduce((sum, value) => sum + value, 0),
    },
    orders: {
      open: openOrders,
      today: num(orderRow.today),
      last7d: num(orderRow.last7d),
      by_status: orderStates,
    },
    handoffs: { open: openHandoffs, by_status: handoffStates },
    access: {
      memberships: num(accessRow.memberships),
      owners_active: num(accessRow.owners_active),
      disabled: num(accessRow.disabled),
      telegram_active: num(accessRow.telegram_active),
      seller_read: flag(ctx.env.MARKET_MINI_APP_SELLER_READS_ENABLED),
      seller_commands: flag(ctx.env.MARKET_MINI_APP_SELLER_COMMANDS_ENABLED),
      binding: {
        // Whether the ceremony can be reached at all, and by which door. Never
        // the grant, never a code, never a digest.
        global_flag: bindingEnabled(ctx.env),
        ceremony_open: bindingCeremonyOpen(ctx.env, now),
        challenges_total: num(challengeRow.total),
        challenges_live: liveChallenges,
        challenges_redeemed: num(challengeRow.redeemed),
      },
    },
    flags: {
      quick_post: flag(ctx.env.MARKET_QUICKPOST_ENABLED),
      quick_post_ai: flag(ctx.env.MARKET_QUICKPOST_AI_ENABLED),
      owner_telegram_binding: bindingEnabled(ctx.env),
      cabinet: flag(ctx.env.MARKET_CABINET_ENABLED),
      voice_search: flag(ctx.env.MARKET_VOICE_SEARCH_ENABLED),
      media_upload: flag(ctx.env.MARKET_SELLER_MEDIA_UPLOAD_ENABLED),
      seller_reads: flag(ctx.env.MARKET_MINI_APP_SELLER_READS_ENABLED),
      seller_commands: flag(ctx.env.MARKET_MINI_APP_SELLER_COMMANDS_ENABLED),
      admin_v2: flag(ctx.env.BORMI_ADMIN_V2_ENABLED),
    },
    system: {
      build_id: ctx.env.MARKET_MINI_APP_BUILD_ID ?? null,
      migrations: { applied: num(ledgerRow.applied), last: (ledgerRow.last as string) ?? null },
      bindings: {
        d1: Boolean(ctx.env.GPTBOT_DRAFTS_DB),
        r2_media: Boolean(ctx.env.MARKET_MEDIA),
        ai: Boolean(ctx.env.AI),
      },
      // Deployment ids, the service worker version and Smart Placement are
      // facts about the Cloudflare project, not about this Worker. It cannot
      // read them, so it says nothing rather than guessing - the screen shows
      // where they are instead.
      deployment: null,
    },
    activity: {
      listings: recentListings.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        status: String(row.status),
        availability: String(row.availability),
        price_minor: num(row.price_minor),
        media_count: num(row.media_count),
        store_name: String(row.store_name),
        updated_at: String(row.updated_at),
      })),
      orders: recentOrders.map((row) => ({
        // The number the buyer and the seller already say out loud to each
        // other. Not the primary key, which is ours and nobody needs it here.
        reference: String(row.order_number),
        status: String(row.status),
        fulfillment: String(row.fulfillment_status),
        total_minor: row.total_minor === null ? null : num(row.total_minor),
        created_at: String(row.created_at),
      })),
    },
    audit: recentAudit.map((row) => ({
      action: String(row.action),
      target_type: String(row.target_type),
      actor_role: String(row.actor_role),
      reason_code: row.reason_code === null ? null : String(row.reason_code),
      created_at: String(row.created_at),
    })),
    attention,
  }, ctx.requestId);
});

export const onRequestPost = methodNotAllowed('GET');
export const onRequestPut = methodNotAllowed('GET');
export const onRequestPatch = methodNotAllowed('GET');
export const onRequestDelete = methodNotAllowed('GET');
