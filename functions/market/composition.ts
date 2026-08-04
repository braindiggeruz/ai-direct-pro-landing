// Shared Sotuvchi application-service composition for Telegram and the Market
// Mini App BFF. Transports own authentication and presentation; this module
// owns the single in-repository domain wiring seam.
import {
  createSotuvchiAnalytics,
  createSotuvchiCatalogService,
  createSotuvchiClassifiedsService,
  createSotuvchiCheckoutService,
  createSotuvchiHandoffService,
  createSotuvchiOnboardingService,
  createSotuvchiOrdersService,
  createSotuvchiStatsService,
} from '../agents/sotuvchi';
import { createChannelAddressService } from '../platform/channels';
import { createIdentityService } from '../platform/identity';

export function createSotuvchiApplicationServices(
  db: D1Database,
  botUsername: string,
) {
  const catalog = createSotuvchiCatalogService(db);
  const analytics = createSotuvchiAnalytics(db);
  return {
    addresses: createChannelAddressService(db),
    analytics,
    catalog,
    classifieds: createSotuvchiClassifiedsService(db),
    checkout: createSotuvchiCheckoutService(db, catalog, botUsername),
    handoff: createSotuvchiHandoffService(db, catalog, botUsername),
    identities: createIdentityService(db),
    onboarding: createSotuvchiOnboardingService(db),
    orders: createSotuvchiOrdersService(db, catalog),
    stats: createSotuvchiStatsService(db, catalog, { analytics }),
  };
}

export type SotuvchiApplicationServices = ReturnType<
  typeof createSotuvchiApplicationServices
>;
