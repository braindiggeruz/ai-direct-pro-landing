import {
  SOTUVCHI_ONBOARDING_STATUSES,
  STORE_STATUSES,
  type ResolvedSotuvchiStorefront,
  type SotuvchiOnboardingRecord,
  type SotuvchiOnboardingStatus,
  type SotuvchiStorefrontRoute,
  type StoreProfile,
} from '../types';
import { SotuvchiOnboardingError } from './errors';
import {
  normalizeDeliveryMode,
  normalizePaymentMethods,
  normalizeStoreLocale,
  normalizeStoreName,
  requireStorefrontCode,
} from './validation';

const ONBOARDING_COLUMNS =
  'id, owner_identity_id, bot_username, org_id, workflow_instance_id, '
  + 'status, created_at, updated_at';
const STORE_COLUMNS =
  'id, org_id, name, locale, delivery_mode, payment_methods_json, '
  + 'storefront_code, status, created_at, updated_at';
const ROUTE_COLUMNS =
  'id, bot_username, route_code, org_id, agent_id, owner_identity_id, '
  + 'status, created_at, updated_at';

const ONBOARDING_STATUSES = new Set<string>(SOTUVCHI_ONBOARDING_STATUSES);
const STORE_STATE = new Set<string>(STORE_STATUSES);
const ROUTE_STATUSES = new Set(['active', 'disabled']);

interface OnboardingRow {
  id: string;
  owner_identity_id: string;
  bot_username: string;
  org_id: string | null;
  workflow_instance_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface StoreRow {
  id: string;
  org_id: string;
  name: string;
  locale: string;
  delivery_mode: string;
  payment_methods_json: string;
  storefront_code: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface RouteRow {
  id: string;
  bot_username: string;
  route_code: string;
  org_id: string;
  agent_id: string;
  owner_identity_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CompleteStoreInput {
  name: string;
  locale: 'ru' | 'uz';
  deliveryMode: 'pickup' | 'delivery' | 'both';
  paymentMethods: readonly (
    'cash' | 'card_transfer' | 'cash_on_delivery'
  )[];
  storefrontCode: string;
  botUsername: string;
}

export type CompleteStoreResult =
  | {
      outcome: 'created' | 'existing';
      store: StoreProfile;
      route: SotuvchiStorefrontRoute;
    }
  | { outcome: 'collision' };

export interface SotuvchiOnboardingStore {
  claimOnboarding(
    ownerIdentityId: string,
    botUsername: string,
  ): Promise<{ outcome: 'created' | 'existing'; record: SotuvchiOnboardingRecord }>;
  getOnboardingByIdentity(
    ownerIdentityId: string,
  ): Promise<SotuvchiOnboardingRecord | null>;
  attachOrganization(
    onboardingId: string,
    ownerIdentityId: string,
    orgId: string,
  ): Promise<SotuvchiOnboardingRecord>;
  attachWorkflow(
    onboardingId: string,
    ownerIdentityId: string,
    workflowInstanceId: string,
  ): Promise<SotuvchiOnboardingRecord>;
  setOnboardingStatus(
    onboardingId: string,
    ownerIdentityId: string,
    status: SotuvchiOnboardingStatus,
  ): Promise<SotuvchiOnboardingRecord>;
  getOwnedStore(
    orgId: string,
    ownerIdentityId: string,
  ): Promise<StoreProfile | null>;
  getRouteForStore(
    orgId: string,
    storeId: string,
  ): Promise<SotuvchiStorefrontRoute | null>;
  completeStoreWithRoute(
    orgId: string,
    ownerIdentityId: string,
    input: CompleteStoreInput,
  ): Promise<CompleteStoreResult>;
  resolveStorefrontRoute(
    botUsername: string,
    storefrontCode: string,
  ): Promise<ResolvedSotuvchiStorefront | null>;
}

function requireId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new SotuvchiOnboardingError('persistence_failed');
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > 120) {
    throw new SotuvchiOnboardingError('persistence_failed');
  }
  return normalized;
}

function requireBotUsername(value: unknown): string {
  if (
    typeof value !== 'string'
    || !/^[a-z][a-z0-9_]{4,31}$/.test(value)
  ) {
    throw new SotuvchiOnboardingError('persistence_failed');
  }
  return value;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function fromOnboardingRow(row: OnboardingRow): SotuvchiOnboardingRecord {
  if (
    !ONBOARDING_STATUSES.has(row.status)
    || !validDate(row.created_at)
    || !validDate(row.updated_at)
  ) {
    throw new SotuvchiOnboardingError('corrupt_row');
  }
  return {
    id: requireId(row.id),
    ownerIdentityId: requireId(row.owner_identity_id),
    botUsername: requireBotUsername(row.bot_username),
    orgId: row.org_id === null ? null : requireId(row.org_id),
    workflowInstanceId: row.workflow_instance_id === null
      ? null
      : requireId(row.workflow_instance_id),
    status: row.status as SotuvchiOnboardingStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromStoreRow(row: StoreRow): StoreProfile {
  if (
    !STORE_STATE.has(row.status)
    || !validDate(row.created_at)
    || !validDate(row.updated_at)
  ) {
    throw new SotuvchiOnboardingError('corrupt_row');
  }
  let payments: unknown;
  try {
    payments = JSON.parse(row.payment_methods_json);
  } catch {
    throw new SotuvchiOnboardingError('corrupt_row');
  }
  return {
    id: requireId(row.id),
    orgId: requireId(row.org_id),
    name: normalizeStoreName(row.name),
    locale: normalizeStoreLocale(row.locale),
    deliveryMode: normalizeDeliveryMode(row.delivery_mode),
    paymentMethods: normalizePaymentMethods(payments),
    storefrontCode: requireStorefrontCode(row.storefront_code),
    status: row.status as StoreProfile['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromRouteRow(row: RouteRow): SotuvchiStorefrontRoute {
  if (
    row.agent_id !== 'sotuvchi'
    || !ROUTE_STATUSES.has(row.status)
    || !validDate(row.created_at)
    || !validDate(row.updated_at)
  ) {
    throw new SotuvchiOnboardingError('corrupt_row');
  }
  return {
    id: requireId(row.id),
    botUsername: requireBotUsername(row.bot_username),
    routeCode: requireStorefrontCode(row.route_code),
    orgId: requireId(row.org_id),
    agentId: 'sotuvchi',
    ownerIdentityId: requireId(row.owner_identity_id),
    status: row.status as SotuvchiStorefrontRoute['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function newId(kind: 'onboarding' | 'store' | 'route'): string {
  return `sotuvchi_${kind}_${crypto.randomUUID()}`;
}

export function createSotuvchiOnboardingStore(
  db: D1Database,
): SotuvchiOnboardingStore {
  async function findOnboarding(
    ownerIdentityId: string,
  ): Promise<SotuvchiOnboardingRecord | null> {
    const row = await db
      .prepare(`SELECT ${ONBOARDING_COLUMNS}
                FROM sotuvchi_onboardings
                WHERE owner_identity_id = ?`)
      .bind(ownerIdentityId)
      .first<OnboardingRow>();
    return row ? fromOnboardingRow(row) : null;
  }

  async function findOwnedStore(
    orgId: string,
    ownerIdentityId: string,
  ): Promise<StoreProfile | null> {
    const row = await db
      .prepare(`SELECT store.${STORE_COLUMNS.replaceAll(', ', ', store.')}
                FROM sotuvchi_stores AS store
                JOIN memberships AS membership
                  ON membership.org_id = store.org_id
                 AND membership.identity_id = ?
                 AND membership.role = 'owner'
                 AND membership.status = 'active'
                WHERE store.org_id = ?`)
      .bind(ownerIdentityId, orgId)
      .first<StoreRow>();
    return row ? fromStoreRow(row) : null;
  }

  async function findStoreByCode(
    storefrontCode: string,
  ): Promise<StoreProfile | null> {
    const row = await db
      .prepare(`SELECT ${STORE_COLUMNS}
                FROM sotuvchi_stores
                WHERE storefront_code = ?`)
      .bind(storefrontCode)
      .first<StoreRow>();
    return row ? fromStoreRow(row) : null;
  }

  async function findRouteForStore(
    orgId: string,
    storeId: string,
  ): Promise<SotuvchiStorefrontRoute | null> {
    const row = await db
      .prepare(`SELECT route.${ROUTE_COLUMNS.replaceAll(', ', ', route.')}
                FROM telegram_agent_routes AS route
                JOIN sotuvchi_stores AS store
                  ON store.org_id = route.org_id
                 AND store.id = ?
                JOIN memberships AS membership
                  ON membership.org_id = route.org_id
                 AND membership.identity_id = route.owner_identity_id
                 AND membership.role = 'owner'
                 AND membership.status = 'active'
                WHERE route.org_id = ?`)
      .bind(storeId, orgId)
      .first<RouteRow>();
    return row ? fromRouteRow(row) : null;
  }

  return {
    async claimOnboarding(ownerIdentityId, botUsername) {
      const identityId = requireId(ownerIdentityId);
      const bot = requireBotUsername(botUsername);
      const createdAt = new Date().toISOString();
      const record: SotuvchiOnboardingRecord = {
        id: newId('onboarding'),
        ownerIdentityId: identityId,
        botUsername: bot,
        orgId: null,
        workflowInstanceId: null,
        status: 'starting',
        createdAt,
        updatedAt: createdAt,
      };
      const result = await db
        .prepare(`INSERT OR IGNORE INTO sotuvchi_onboardings
          (id, owner_identity_id, bot_username, org_id, workflow_instance_id,
           status, created_at, updated_at)
          VALUES (?, ?, ?, NULL, NULL, 'starting', ?, ?)`)
        .bind(
          record.id,
          record.ownerIdentityId,
          record.botUsername,
          record.createdAt,
          record.updatedAt,
        )
        .run();
      if ((result.meta?.changes ?? 0) > 0) {
        return { outcome: 'created', record };
      }
      const existing = await findOnboarding(identityId);
      if (!existing) throw new SotuvchiOnboardingError('persistence_failed');
      return { outcome: 'existing', record: existing };
    },

    async getOnboardingByIdentity(ownerIdentityId) {
      return findOnboarding(requireId(ownerIdentityId));
    },

    async attachOrganization(onboardingId, ownerIdentityId, orgId) {
      const id = requireId(onboardingId);
      const identityId = requireId(ownerIdentityId);
      const tenantId = requireId(orgId);
      await db
        .prepare(`UPDATE sotuvchi_onboardings
                  SET org_id = ?, updated_at = ?
                  WHERE id = ? AND owner_identity_id = ?
                    AND (org_id IS NULL OR org_id = ?)`)
        .bind(
          tenantId,
          new Date().toISOString(),
          id,
          identityId,
          tenantId,
        )
        .run();
      const updated = await findOnboarding(identityId);
      if (!updated || updated.id !== id || updated.orgId !== tenantId) {
        throw new SotuvchiOnboardingError('onboarding_conflict');
      }
      return updated;
    },

    async attachWorkflow(
      onboardingId,
      ownerIdentityId,
      workflowInstanceId,
    ) {
      const id = requireId(onboardingId);
      const identityId = requireId(ownerIdentityId);
      const instanceId = requireId(workflowInstanceId);
      await db
        .prepare(`UPDATE sotuvchi_onboardings
                  SET workflow_instance_id = ?, updated_at = ?
                  WHERE id = ? AND owner_identity_id = ? AND org_id IS NOT NULL
                    AND (workflow_instance_id IS NULL
                      OR workflow_instance_id = ?)`)
        .bind(
          instanceId,
          new Date().toISOString(),
          id,
          identityId,
          instanceId,
        )
        .run();
      const updated = await findOnboarding(identityId);
      if (
        !updated
        || updated.id !== id
        || updated.workflowInstanceId !== instanceId
      ) {
        throw new SotuvchiOnboardingError('onboarding_conflict');
      }
      return updated;
    },

    async setOnboardingStatus(
      onboardingId,
      ownerIdentityId,
      status,
    ) {
      if (!ONBOARDING_STATUSES.has(status)) {
        throw new SotuvchiOnboardingError('persistence_failed');
      }
      const id = requireId(onboardingId);
      const identityId = requireId(ownerIdentityId);
      await db
        .prepare(`UPDATE sotuvchi_onboardings
                  SET status = ?, updated_at = ?
                  WHERE id = ? AND owner_identity_id = ?`)
        .bind(status, new Date().toISOString(), id, identityId)
        .run();
      const updated = await findOnboarding(identityId);
      if (!updated || updated.id !== id || updated.status !== status) {
        throw new SotuvchiOnboardingError('persistence_failed');
      }
      return updated;
    },

    async getOwnedStore(orgId, ownerIdentityId) {
      return findOwnedStore(requireId(orgId), requireId(ownerIdentityId));
    },

    async getRouteForStore(orgId, storeId) {
      return findRouteForStore(requireId(orgId), requireId(storeId));
    },

    async completeStoreWithRoute(orgId, ownerIdentityId, rawInput) {
      const tenantId = requireId(orgId);
      const identityId = requireId(ownerIdentityId);
      const input: CompleteStoreInput = {
        name: normalizeStoreName(rawInput.name),
        locale: normalizeStoreLocale(rawInput.locale),
        deliveryMode: normalizeDeliveryMode(rawInput.deliveryMode),
        paymentMethods: normalizePaymentMethods(rawInput.paymentMethods),
        storefrontCode: requireStorefrontCode(rawInput.storefrontCode),
        botUsername: requireBotUsername(rawInput.botUsername),
      };
      const existing = await findOwnedStore(tenantId, identityId);
      if (existing) {
        const route = await findRouteForStore(tenantId, existing.id);
        if (!route) throw new SotuvchiOnboardingError('corrupt_row');
        return { outcome: 'existing', store: existing, route };
      }

      const createdAt = new Date().toISOString();
      const store: StoreProfile = {
        id: newId('store'),
        orgId: tenantId,
        name: input.name,
        locale: input.locale,
        deliveryMode: input.deliveryMode,
        paymentMethods: input.paymentMethods,
        storefrontCode: input.storefrontCode,
        status: 'active',
        createdAt,
        updatedAt: createdAt,
      };
      const route: SotuvchiStorefrontRoute = {
        id: newId('route'),
        botUsername: input.botUsername,
        routeCode: input.storefrontCode,
        orgId: tenantId,
        agentId: 'sotuvchi',
        ownerIdentityId: identityId,
        status: 'active',
        createdAt,
        updatedAt: createdAt,
      };

      try {
        const results = await db.batch([
          db.prepare(`INSERT INTO sotuvchi_stores
            (id, org_id, name, locale, delivery_mode, payment_methods_json,
             storefront_code, status, created_at, updated_at)
            SELECT ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?
            FROM memberships
            WHERE org_id = ? AND identity_id = ?
              AND role = 'owner' AND status = 'active'`)
            .bind(
              store.id,
              store.orgId,
              store.name,
              store.locale,
              store.deliveryMode,
              JSON.stringify(store.paymentMethods),
              store.storefrontCode,
              store.createdAt,
              store.updatedAt,
              tenantId,
              identityId,
            ),
          db.prepare(`INSERT INTO telegram_agent_routes
            (id, bot_username, route_code, org_id, agent_id,
             owner_identity_id, status, created_at, updated_at)
            SELECT ?, ?, ?, store.org_id, 'sotuvchi', ?, 'active', ?, ?
            FROM sotuvchi_stores AS store
            JOIN memberships AS membership
              ON membership.org_id = store.org_id
             AND membership.identity_id = ?
             AND membership.role = 'owner'
             AND membership.status = 'active'
            WHERE store.org_id = ? AND store.id = ?`)
            .bind(
              route.id,
              route.botUsername,
              route.routeCode,
              route.ownerIdentityId,
              route.createdAt,
              route.updatedAt,
              identityId,
              tenantId,
              store.id,
            ),
        ]);
        if (
          (results[0]?.meta?.changes ?? 0) === 1
          && (results[1]?.meta?.changes ?? 0) === 1
        ) {
          return { outcome: 'created', store, route };
        }
      } catch {
        const raced = await findOwnedStore(tenantId, identityId);
        if (raced) {
          const racedRoute = await findRouteForStore(tenantId, raced.id);
          if (!racedRoute) throw new SotuvchiOnboardingError('corrupt_row');
          return { outcome: 'existing', store: raced, route: racedRoute };
        }
        if (await findStoreByCode(input.storefrontCode)) {
          return { outcome: 'collision' };
        }
        throw new SotuvchiOnboardingError('persistence_failed');
      }
      if (await findStoreByCode(input.storefrontCode)) {
        return { outcome: 'collision' };
      }
      throw new SotuvchiOnboardingError('owner_required');
    },

    async resolveStorefrontRoute(botUsername, storefrontCode) {
      const bot = requireBotUsername(botUsername);
      const routeCode = requireStorefrontCode(storefrontCode);
      const row = await db
        .prepare(`SELECT route.org_id, route.agent_id, store.locale, store.id
                  FROM telegram_agent_routes AS route
                  JOIN sotuvchi_stores AS store
                    ON store.org_id = route.org_id
                   AND store.storefront_code = route.route_code
                   AND store.status = 'active'
                  JOIN memberships AS membership
                    ON membership.org_id = route.org_id
                   AND membership.identity_id = route.owner_identity_id
                   AND membership.role = 'owner'
                   AND membership.status = 'active'
                  WHERE route.bot_username = ? AND route.route_code = ?
                    AND route.status = 'active'
                    AND route.agent_id = 'sotuvchi'`)
        .bind(bot, routeCode)
        .first<{
          org_id: string;
          agent_id: string;
          locale: string;
          id: string;
        }>();
      if (!row) return null;
      if (row.agent_id !== 'sotuvchi') {
        throw new SotuvchiOnboardingError('corrupt_row');
      }
      return {
        orgId: requireId(row.org_id),
        agentId: 'sotuvchi',
        locale: normalizeStoreLocale(row.locale),
        storeId: requireId(row.id),
      };
    },
  };
}
