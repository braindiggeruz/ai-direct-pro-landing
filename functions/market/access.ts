import { isStorefrontCode } from '../agents/sotuvchi';
import { parseTelegramStartPayload } from '../channels/telegram';
import type { OrgContext } from '../platform/contracts';
import type { StorefrontContext } from '../agents/sotuvchi';
import type { SotuvchiApplicationServices } from './composition';
import type { MarketSessionClaims, VerifiedTelegramInitData } from '../platform/market';
import { MarketHttpError, marketFlag } from '../platform/market/http';
import type { Env } from '../_types';

export interface MarketAccessContext {
  buyer: StorefrontContext;
  buyerOrg: OrgContext;
  sellerOrg: OrgContext | null;
  sellerStore: {
    id: string;
    name: string;
    status: string;
    locale: 'ru' | 'uz';
  } | null;
}

function orgContext(
  orgId: string,
  claims: MarketSessionClaims,
  requestId: string,
): OrgContext {
  return {
    orgId,
    actorId: claims.sub,
    requestId,
    locale: claims.locale,
  };
}

export async function bindMarketLaunch(
  services: SotuvchiApplicationServices,
  botUsername: string,
  identityId: string,
  launch: VerifiedTelegramInitData,
): Promise<StorefrontContext | null> {
  const parsed = parseTelegramStartPayload(
    launch.startParam === 'seller' ? 'agent_seller' : launch.startParam ?? undefined,
  );
  if (
    parsed.status === 'valid'
    && isStorefrontCode(parsed.routeCode)
  ) {
    const route = await services.onboarding.resolveStorefrontRoute(
      botUsername,
      parsed.routeCode,
    );
    if (route) {
      const context: StorefrontContext = {
        orgId: route.orgId,
        storeId: route.storeId,
        agentId: 'sotuvchi',
        locale: launch.locale,
      };
      await services.catalog.bindStorefrontSession({
        botUsername,
        identityId,
        context,
      });
      return context;
    }
  }
  const stored = await services.catalog.resolveStoredStorefrontContext(
    botUsername,
    identityId,
  );
  if (stored) {
    return stored.locale === launch.locale
      ? stored
      : services.catalog.setStoredStorefrontLocale(
          botUsername,
          identityId,
          launch.locale,
        );
  }
  if (parsed.status === 'valid' && parsed.routeCode === 'seller') {
    const onboarding = await services.onboarding.getOnboarding({
      identityId,
      botUsername,
      requestId: `market_launch_${launch.launchFingerprint}`,
      locale: launch.locale,
    }).catch(() => null);
    if (
      onboarding?.status === 'completed'
      && onboarding.store?.status === 'active'
    ) {
      const context: StorefrontContext = {
        orgId: onboarding.orgId,
        storeId: onboarding.store.id,
        agentId: 'sotuvchi',
        locale: launch.locale,
      };
      await services.catalog.bindStorefrontSession({
        botUsername,
        identityId,
        context,
      });
      return context;
    }
  }
  const direct = await services.onboarding.resolveDirectPilotStorefront(
    botUsername,
  );
  if (!direct) return null;
  const context: StorefrontContext = {
    orgId: direct.orgId,
    storeId: direct.storeId,
    agentId: 'sotuvchi',
    locale: launch.locale,
  };
  await services.catalog.bindStorefrontSession({
    botUsername,
    identityId,
    context,
  });
  return context;
}

export async function resolveMarketAccess(
  services: SotuvchiApplicationServices,
  env: Env,
  botUsername: string,
  claims: MarketSessionClaims,
  requestId: string,
  boundBuyer?: StorefrontContext,
  includeSeller = true,
): Promise<MarketAccessContext> {
  if (!marketFlag(env.MARKET_MINI_APP_BUYER_ENABLED)) {
    throw new MarketHttpError('cohort_disabled', 403);
  }
  const buyer = boundBuyer ?? await services.catalog.resolveStoredStorefrontContext(
    botUsername,
    claims.sub,
  );
  if (!buyer) throw new MarketHttpError('storefront_unavailable', 409);
  const sellerEnabled = includeSeller
    && marketFlag(env.MARKET_MINI_APP_SELLER_READS_ENABLED);
  const [verifiedBuyer, onboarding] = await Promise.all([
    boundBuyer
      ? Promise.resolve({ ...boundBuyer, locale: claims.locale })
      : services.catalog.resolveStorefrontContext({
          ...buyer,
          locale: claims.locale,
        }).catch(() => null),
    sellerEnabled
      ? services.onboarding.getOnboarding({
          identityId: claims.sub,
          botUsername,
          requestId,
          locale: claims.locale,
        }).catch(() => null)
      : Promise.resolve(null),
  ]);
  if (!verifiedBuyer) throw new MarketHttpError('storefront_unavailable', 409);

  let sellerOrg: OrgContext | null = null;
  let sellerStore: MarketAccessContext['sellerStore'] = null;
  if (sellerEnabled) {
    // Two ways to own a store, one way to prove it.
    //
    // The onboarding record is the path a seller who signed up through the bot
    // walks. It is not the only way a store comes to exist — one seeded outside
    // that workflow has an owner in `memberships` and no onboarding row at all,
    // and such an owner was locked out of their own store because the record
    // was missing rather than because anything about their authority was.
    //
    // The membership is the tenant's own answer to "who owns this", which is
    // what `findOwnedActiveStore` has always asked on the bot side. So the
    // candidate may now come from either source, and both are put through the
    // same verification below — nothing is trusted because of where it was
    // found.
    const candidateStore = onboarding?.status === 'completed'
      && onboarding.store?.status === 'active'
      ? {
        orgId: onboarding.orgId,
        id: onboarding.store.id,
        name: onboarding.store.name,
        status: onboarding.store.status,
        locale: onboarding.store.locale,
      }
      : await services.catalog.findOwnedStoreByIdentity(claims.sub)
        .then((store) => store && {
          orgId: store.orgId,
          id: store.id,
          name: store.name,
          status: 'active',
          locale: store.locale,
        })
        .catch(() => null);
    if (candidateStore) {
      const candidate = orgContext(candidateStore.orgId, claims, requestId);
      // The single gate both paths pass: an active `owner` membership over an
      // active store in this exact organization, re-read from the database
      // rather than carried over from whatever produced the candidate.
      const verified = await services.orders.resolveSeller(candidate)
        .then(() => true)
        .catch(() => false);
      if (verified) {
        sellerOrg = candidate;
        sellerStore = {
          id: candidateStore.id,
          name: candidateStore.name,
          status: candidateStore.status,
          locale: candidateStore.locale,
        };
      }
    }
  }
  return {
    buyer: verifiedBuyer,
    buyerOrg: orgContext(verifiedBuyer.orgId, claims, requestId),
    sellerOrg,
    sellerStore,
  };
}
