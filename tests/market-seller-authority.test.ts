import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  createSotuvchiCatalogService,
  createSotuvchiOnboardingService,
  type SotuvchiIdentityContext,
} from '../functions/agents/sotuvchi';
import { createSotuvchiApplicationServices } from '../functions/market';
import { resolveMarketAccess } from '../functions/market/access';
import type { Env } from '../functions/_types';
import type { MarketSessionClaims } from '../functions/platform/market';
import { createIdentityService } from '../functions/platform/identity';
import { SqliteD1 } from './helpers/sqlite-d1';
import { activatePilotStore } from './helpers/pilot-store';

const ROOT = new URL('../', import.meta.url);
const BOT = 'agents_authority_fixture_bot';
let sequence = 0;

function requestId(prefix = 'authority'): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

/** Telegram external ids are digits; the domain refuses anything else. */
function nextTelegramId(): string {
  sequence += 1;
  return String(900_000 + sequence);
}

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    MARKET_MINI_APP_BUYER_ENABLED: 'true',
    MARKET_MINI_APP_SELLER_READS_ENABLED: 'true',
    MARKET_MINI_APP_SELLER_COMMANDS_ENABLED: 'true',
    ...overrides,
  } as Env;
}

function claimsFor(identityId: string): MarketSessionClaims {
  return {
    sub: identityId,
    telegramId: 'fixture',
    locale: 'ru',
    launch: 'fixture-launch',
    iat: 0,
    exp: 0,
    iss: 'gptbot-market',
    aud: 'market-mini-app',
  } as MarketSessionClaims;
}

interface Store {
  identityId: string;
  orgId: string;
  storeId: string;
}

/**
 * A store built the way a real one was: through onboarding, then activated.
 *
 * Individual tests then take away whatever they are about — the onboarding row,
 * the membership, the store's state — so each one measures a single reason to
 * refuse rather than a pile of them.
 */
async function setupStore(fixture: SqliteD1, label: string): Promise<Store> {
  const db = fixture.asD1();
  const identity = await createIdentityService(db)
    .getOrCreateIdentity('telegram', nextTelegramId());
  const context: SotuvchiIdentityContext = {
    identityId: identity.identity.id,
    botUsername: BOT,
    requestId: requestId('onboarding'),
    locale: 'ru',
  };
  const onboarding = createSotuvchiOnboardingService(db);
  let snapshot = await onboarding.startOnboarding(context);
  for (const [step, value] of [
    ['name', `Do‘kon ${label}`],
    ['locale', 'ru'],
    ['delivery', 'both'],
    ['payment', ['cash']],
  ] as const) {
    snapshot = await onboarding.submitOnboardingStep(
      { ...context, requestId: requestId('onboarding') },
      {
        step,
        value,
        expectedVersion: snapshot.version,
        idempotencyKey: requestId('step'),
      } as never,
    );
  }
  const completed = await onboarding.confirmOnboarding(
    { ...context, requestId: requestId('onboarding') },
    snapshot.version,
  );
  await activatePilotStore(db, completed.store.orgId, completed.store.id);
  await createSotuvchiCatalogService(db).bindStorefrontSession({
    botUsername: BOT,
    identityId: identity.identity.id,
    context: {
      orgId: completed.store.orgId,
      storeId: completed.store.id,
      agentId: 'sotuvchi',
      locale: 'ru',
    },
  });
  return {
    identityId: identity.identity.id,
    orgId: completed.store.orgId,
    storeId: completed.store.id,
  };
}

/** Production's actual shape: a store whose owner is a membership, not a record. */
async function dropOnboarding(fixture: SqliteD1): Promise<void> {
  await fixture.asD1().prepare('DELETE FROM sotuvchi_onboardings').run();
}

async function access(fixture: SqliteD1, identityId: string, overrides: Partial<Env> = {}) {
  const db = fixture.asD1();
  return resolveMarketAccess(
    createSotuvchiApplicationServices(db, BOT),
    env(overrides),
    BOT,
    claimsFor(identityId),
    requestId('access'),
  );
}

async function shopper(fixture: SqliteD1, store: Store): Promise<string> {
  const db = fixture.asD1();
  const identity = await createIdentityService(db)
    .getOrCreateIdentity('telegram', nextTelegramId());
  await createSotuvchiCatalogService(db).bindStorefrontSession({
    botUsername: BOT,
    identityId: identity.identity.id,
    context: {
      orgId: store.orgId,
      storeId: store.storeId,
      agentId: 'sotuvchi',
      locale: 'ru',
    },
  });
  return identity.identity.id;
}

// ── Who gets seller authority ─────────────────────────────────────────────────

test('a shopper with no membership is never a seller', async () => {
  const fixture = new SqliteD1();
  {
    const store = await setupStore(fixture, 'authority-owner-1');
    const buyerId = await shopper(fixture, store);
    const granted = await access(fixture, buyerId);
    assert.equal(granted.sellerOrg, null);
    assert.equal(granted.sellerStore, null);
    // The shopper still gets their storefront: refusing seller authority must
    // not take the shop away.
    assert.equal(granted.buyer.storeId, store.storeId);
  }
});

test('an active owner membership over an active store is authority enough', async () => {
  const fixture = new SqliteD1();
  {
    const store = await setupStore(fixture, 'authority-owner-2');
    // Exactly production: the store and its owner exist, the onboarding record
    // does not. Before this path the owner was locked out of their own store.
    await dropOnboarding(fixture);
    const granted = await access(fixture, store.identityId);
    assert.ok(granted.sellerOrg, 'membership owner was refused their own store');
    assert.equal(granted.sellerOrg.orgId, store.orgId);
    assert.equal(granted.sellerStore?.id, store.storeId);
    assert.equal(granted.sellerStore?.status, 'active');
  }
});

test('the onboarding path keeps working exactly as before', async () => {
  const fixture = new SqliteD1();
  {
    const store = await setupStore(fixture, 'authority-owner-3');
    const granted = await access(fixture, store.identityId);
    assert.ok(granted.sellerOrg);
    assert.equal(granted.sellerStore?.id, store.storeId);
  }
});

// ── Who does not ──────────────────────────────────────────────────────────────

test('a disabled membership fails closed', async () => {
  const fixture = new SqliteD1();
  {
    const store = await setupStore(fixture, 'authority-owner-4');
    await dropOnboarding(fixture);
    await fixture.asD1()
      .prepare('UPDATE memberships SET status = ? WHERE identity_id = ?')
      .bind('disabled', store.identityId)
      .run();
    const granted = await access(fixture, store.identityId);
    assert.equal(granted.sellerOrg, null);
    assert.equal(granted.sellerStore, null);
  }
});

test('a staff membership is not a seller membership', async () => {
  const fixture = new SqliteD1();
  {
    const store = await setupStore(fixture, 'authority-owner-5');
    await dropOnboarding(fixture);
    await fixture.asD1()
      .prepare('UPDATE memberships SET role = ? WHERE identity_id = ?')
      .bind('staff', store.identityId)
      .run();
    const granted = await access(fixture, store.identityId);
    assert.equal(granted.sellerOrg, null);
  }
});

test('a suspended store hands out nothing', async () => {
  const fixture = new SqliteD1();
  {
    const store = await setupStore(fixture, 'authority-owner-6');
    await dropOnboarding(fixture);
    await fixture.asD1()
      .prepare('UPDATE sotuvchi_stores SET status = ? WHERE id = ?')
      .bind('suspended', store.storeId)
      .run();
    const granted = await access(fixture, store.identityId).catch(() => null);
    assert.equal(granted?.sellerOrg ?? null, null);
  }
});

test('a suspended organization hands out nothing', async () => {
  const fixture = new SqliteD1();
  {
    const store = await setupStore(fixture, 'authority-owner-7');
    await dropOnboarding(fixture);
    await fixture.asD1()
      .prepare('UPDATE organizations SET status = ? WHERE id = ?')
      .bind('suspended', store.orgId)
      .run();
    const granted = await access(fixture, store.identityId).catch(() => null);
    assert.equal(granted?.sellerOrg ?? null, null);
  }
});

test('owning one store never reaches into another tenant', async () => {
  const fixture = new SqliteD1();
  {
    const first = await setupStore(fixture, 'authority-owner-8');
    const second = await setupStore(fixture, 'authority-owner-9');
    await dropOnboarding(fixture);
    assert.notEqual(first.orgId, second.orgId);
    const granted = await access(fixture, second.identityId);
    assert.ok(granted.sellerOrg);
    // The membership decides the tenant, so the second owner can only ever land
    // on their own organization and their own store.
    assert.equal(granted.sellerOrg.orgId, second.orgId);
    assert.notEqual(granted.sellerOrg.orgId, first.orgId);
    assert.equal(granted.sellerStore?.id, second.storeId);
    assert.notEqual(granted.sellerStore?.id, first.storeId);
  }
});

test('the seller-reads kill switch still closes the whole door', async () => {
  const fixture = new SqliteD1();
  {
    const store = await setupStore(fixture, 'authority-owner-10');
    await dropOnboarding(fixture);
    const granted = await access(fixture, store.identityId, {
      MARKET_MINI_APP_SELLER_READS_ENABLED: 'false',
    });
    assert.equal(granted.sellerOrg, null);
    assert.equal(granted.sellerStore, null);
  }
});

// ── Where authority may and may not come from ─────────────────────────────────

test('reads and commands stay separately gated', async () => {
  const router = await source('functions/market/router.ts');
  // Reading is allowed by having a store; commanding needs its own switch on
  // top, so turning writes off never has to touch who can look.
  assert.match(
    router,
    /sellerCommands:\s*\n?\s*context\.access\.sellerOrg !== null\s*\n?\s*&& marketFlag\(context\.env\.MARKET_MINI_APP_SELLER_COMMANDS_ENABLED\)/,
  );
  assert.match(
    router,
    /function requireSellerCommands[\s\S]{0,400}?marketFlag\(context\.env\.MARKET_MINI_APP_SELLER_COMMANDS_ENABLED\)/,
  );
});

test('nothing the client sends can produce seller authority', async () => {
  const accessSource = await source('functions/market/access.ts');
  // The identity comes from the verified session and from nowhere else.
  assert.match(accessSource, /findOwnedStoreByIdentity\(claims\.sub\)/);
  assert.doesNotMatch(accessSource, /searchParams|headers\.get|body|role|mode/);
  const router = await source('functions/market/router.ts');
  const sellerBranch = /if \(path\.startsWith\('\/seller\/'\)\) \{[\s\S]*?\n {2}\}/.exec(router)?.[0];
  assert.ok(sellerBranch);
  assert.match(sellerBranch, /if \(!access\.sellerOrg \|\| !access\.sellerStore\) \{/);
});

test('the membership lookup is scoped by the identity, not by a supplied tenant', async () => {
  const store = await source('functions/agents/sotuvchi/catalog/store.ts');
  const lookup = /async findOwnedActiveStoreByIdentity\(identityId\) \{[\s\S]*?\n {4}\},/.exec(store)?.[0];
  assert.ok(lookup, 'lookup not found');
  assert.match(lookup, /membership\.role = 'owner'/);
  assert.match(lookup, /membership\.status = 'active'/);
  assert.match(lookup, /store\.status = 'active'/);
  assert.match(lookup, /organization\.status = 'active'/);
  // One bound parameter: the identity. A tenant id cannot be injected into it.
  assert.equal([...lookup.matchAll(/\?/g)].length, 1);
  assert.match(lookup, /\.bind\(actorId\)/);
});

test('the Owner Control Center authority does not leak into the Mini App', async () => {
  const accessSource = await source('functions/market/access.ts');
  assert.doesNotMatch(accessSource, /owner_control|ownerControl|OWNER_CONTROL|admin/i);
});
