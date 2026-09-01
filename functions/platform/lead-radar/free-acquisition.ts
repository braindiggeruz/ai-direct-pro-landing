import { createContactSourceQueueDependencies } from './contact-source-worker';
import type { FirecrawlEnvironment } from './firecrawl-client';
import type { JinaReaderEnvironment } from './jina-reader-client';

/** Owner policy: production Lead Radar acquisition makes no paid-provider calls.
 * Historical provider code/ledgers remain intact, but a configured key or old
 * enabled flag must not silently re-enable spending in this workflow. */
export function createFreeContactAcquisitionDependencies(
  env: FirecrawlEnvironment & JinaReaderEnvironment, db: D1Database, orgId: string,
  deps: Parameters<typeof createContactSourceQueueDependencies>[3] = {},
) {
  return createContactSourceQueueDependencies({ ...env, FIRECRAWL_API_KEY: undefined, JINA_API_KEY: undefined,
    LEAD_RADAR_FIRECRAWL_ENABLED: 'false', LEAD_RADAR_JINA_ENABLED: 'false' }, db, orgId, deps);
}
