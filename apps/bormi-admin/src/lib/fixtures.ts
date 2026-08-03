/**
 * SYNTHETIC data for development only.
 *
 * Every string here is invented and says so. Nothing in this file is a real
 * store, a real listing, a real person or a real number, and none of it can
 * reach production: `FIXTURE_MODE` folds to false in a production build, so
 * this module is dropped from the bundle entirely.
 *
 * It exists for one reason - the panel has to be reviewable at 320px and in
 * dark mode without pointing a browser at a live marketplace.
 */
import type { AuditResponse, OverviewResponse, StoresResponse } from './contracts';

export const SYNTHETIC_NOTICE = 'SYNTHETIC — данные вымышлены, режим разработки';

export function syntheticOverview(): OverviewResponse {
  return {
    generated_at: new Date().toISOString(),
    window_days: 7,
    actor: { email: 'synthetic-owner@example.invalid', role: 'platform_owner' },
    rollout: { admin_v2: true },
    listings: {
      published: 48,
      draft: 6,
      archived: 3,
      total: 57,
      touched_7d: 12,
      quality: { no_photo: 4, no_description: 9, no_category: 2, unavailable: 5 },
    },
    stores: { active: 1, suspended: 0, total: 1 },
    orders: {
      open: 2,
      today: 1,
      last7d: 4,
      by_status: { draft: 1, placed: 2, confirmed: 0, done: 1, cancelled: 0 },
    },
    handoffs: { open: 3, by_status: { open: 3, answered: 5, closed: 11, expired: 1 } },
    access: {
      memberships: 2,
      owners_active: 2,
      disabled: 0,
      telegram_active: 1,
      seller_read: true,
      seller_commands: true,
      binding: {
        global_flag: false,
        ceremony_open: false,
        challenges_total: 1,
        challenges_live: 0,
        challenges_redeemed: 1,
      },
    },
    flags: {
      quick_post: false,
      quick_post_ai: false,
      owner_telegram_binding: false,
      cabinet: true,
      voice_search: true,
      media_upload: true,
      seller_reads: true,
      seller_commands: true,
      admin_v2: true,
    },
    system: {
      build_id: 'synthetic-build',
      migrations: { applied: 32, last: '0032_synthetic.sql' },
      bindings: { d1: true, r2_media: true, ai: true },
      deployment: null,
    },
    activity: {
      listings: [
        {
          id: 'synthetic-1', name: 'SYNTHETIC · пример карточки', status: 'published',
          availability: 'available', price_minor: 4500000, media_count: 3,
          store_name: 'SYNTHETIC Store', updated_at: new Date().toISOString(),
        },
        {
          id: 'synthetic-2', name: 'SYNTHETIC · черновик без фото', status: 'draft',
          availability: 'unavailable', price_minor: 0, media_count: 0,
          store_name: 'SYNTHETIC Store', updated_at: new Date(Date.now() - 3_600_000).toISOString(),
        },
      ],
      orders: [
        {
          reference: 'SYN-0001', status: 'placed', fulfillment: 'none',
          total_minor: 4500000, created_at: new Date(Date.now() - 7_200_000).toISOString(),
        },
      ],
    },
    audit: [
      {
        action: 'store.suspend', target_type: 'store', actor_role: 'platform_owner',
        reason_code: 'policy_violation', created_at: new Date(Date.now() - 86_400_000).toISOString(),
      },
    ],
    attention: [
      { code: 'handoffs_open', severity: 'warning', count: 3 },
      { code: 'listings_without_photo', severity: 'warning', count: 4 },
      { code: 'orders_open', severity: 'info', count: 2 },
    ],
  };
}

export function syntheticStores(): StoresResponse {
  return {
    count: 1,
    stores: [
      {
        id: 'synthetic-store', org_id: 'synthetic-org', name: 'SYNTHETIC Store',
        status: 'active', locale: 'uz', pilot_state: 'active',
        product_count: 57, published_count: 48, open_orders: 2, open_handoffs: 3,
        updated_at: new Date().toISOString(),
      },
    ],
  };
}

export function syntheticAudit(): AuditResponse {
  return {
    append_only: true,
    total: 2,
    events: [
      {
        event_id: 'synthetic-1', created_at: new Date(Date.now() - 86_400_000).toISOString(),
        actor_email: 'synthetic-owner@example.invalid', actor_role: 'platform_owner',
        action: 'store.suspend', target_type: 'store', target_id: 'synthetic-store',
        org_id: 'synthetic-org', reason_code: 'policy_violation', request_id: 'synthetic',
      },
      {
        event_id: 'synthetic-2', created_at: new Date(Date.now() - 172_800_000).toISOString(),
        actor_email: 'synthetic-owner@example.invalid', actor_role: 'platform_owner',
        action: 'seller.bind', target_type: 'store', target_id: 'synthetic-store',
        org_id: 'synthetic-org', reason_code: 'seller_request', request_id: 'synthetic',
      },
    ],
  };
}
