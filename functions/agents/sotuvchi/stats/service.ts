import type { OrgContext } from '../../../platform/contracts';
import { countEventsByType } from '../../../platform/events';
import type { SotuvchiAnalytics } from '../analytics';
import { CatalogAuthorizationError, type SotuvchiCatalogService } from '../catalog';
import { ensureSotuvchiHandoffSchema } from '../handoff';
import { StatsAuthorizationError } from './errors';
import { createSotuvchiStatsStore, type SotuvchiStatsStore } from './store';
import { STATS_WINDOW_DAYS, type SotuvchiStatsReport } from './types';

const BUYER_STARTED = 'sotuvchi.buyer_started';
const CATALOG_ANSWERED = 'sotuvchi.catalog_answered';
const CATALOG_NO_RESULT = 'sotuvchi.catalog_no_result';

export interface SotuvchiStatsServiceOptions {
  now?: () => Date;
  analytics?: SotuvchiAnalytics;
}

/**
 * Owner-only reporting.
 *
 * Authority comes from the trusted Runtime `OrgContext.actorId` plus an active
 * owner membership and an active store, resolved by the existing catalog
 * service. A buyer, a foreign owner and a revoked membership all fail closed
 * with the same content-free error, so the report never confirms that another
 * store exists.
 */
export class SotuvchiStatsService {
  private readonly store: SotuvchiStatsStore;
  private readonly now: () => Date;

  constructor(
    private readonly db: D1Database,
    private readonly catalog: SotuvchiCatalogService,
    private readonly options: SotuvchiStatsServiceOptions = {},
  ) {
    this.store = createSotuvchiStatsStore(db);
    this.now = options.now ?? (() => new Date());
  }

  async getStats(org: OrgContext): Promise<SotuvchiStatsReport> {
    if (!org.actorId) throw new StatsAuthorizationError();
    let owner;
    try {
      owner = await this.catalog.resolveOwnerContext({
        identityId: org.actorId,
        orgId: org.orgId,
        requestId: org.requestId,
        locale: org.locale,
      });
    } catch (error) {
      if (error instanceof CatalogAuthorizationError) {
        throw new StatsAuthorizationError();
      }
      throw error;
    }
    // The handoff tables are the newest domain tables; make sure the reporting
    // read never fails on a store that has not seen handoff traffic yet.
    await ensureSotuvchiHandoffSchema(this.db);

    const generatedAt = this.now();
    const since = new Date(
      generatedAt.getTime() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const exact = await this.store.readExactStats(
      owner.orgId,
      owner.storeId,
      since,
    );
    const events = await countEventsByType(this.db, {
      orgId: owner.orgId,
      types: [BUYER_STARTED, CATALOG_ANSWERED, CATALOG_NO_RESULT],
      since,
    }).catch(() => null);

    const report: SotuvchiStatsReport = {
      windowDays: STATS_WINDOW_DAYS,
      since,
      generatedAt: generatedAt.toISOString(),
      exact,
      funnel: {
        buyerStarts: events?.[BUYER_STARTED] ?? 0,
        catalogAnswers: events?.[CATALOG_ANSWERED] ?? 0,
        catalogNoResults: events?.[CATALOG_NO_RESULT] ?? 0,
      },
    };

    // Best effort: a failed analytics append never breaks the report.
    await this.options.analytics?.record({
      orgId: owner.orgId,
      storeId: owner.storeId,
      requestId: org.requestId,
      event: {
        type: 'sotuvchi.stats_viewed',
        locale: org.locale,
        windowDays: STATS_WINDOW_DAYS,
      },
    });

    return report;
  }
}

export function createSotuvchiStatsService(
  db: D1Database,
  catalog: SotuvchiCatalogService,
  options: SotuvchiStatsServiceOptions = {},
): SotuvchiStatsService {
  return new SotuvchiStatsService(db, catalog, options);
}
