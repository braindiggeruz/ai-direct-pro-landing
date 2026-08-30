import { LeadRadarStore } from './store';
import { enqueueDueLeadRadarJobs } from './queue';
import type { LeadRadarQueueSender } from './types';

export interface SearchPulseResult {
  ok: true;
  /** Queue messages dispatched immediately (bypassing the cron wait). */
  kicked: number;
  /** Pool candidates left after the funnel re-evaluation. */
  remaining: number | null;
  note: string;
}

/** Manual "pulse" (roadmap layer 3): re-evaluates the search funnel right now
 * — the same code the cron watchdog runs — and immediately dispatches every
 * job that just became due, instead of waiting up to 15 minutes for the next
 * cron tick. Pure scheduling: no fetches, no paid calls, no Telegram traffic. */
export async function resumeSearchPulse(input: {
  db: D1Database;
  orgId: string;
  searchId: string;
  now: Date;
  queue: LeadRadarQueueSender;
  allowOrganization: (orgId: string) => boolean;
}): Promise<SearchPulseResult> {
  const store = new LeadRadarStore(input.db);
  const search = await store.getSearch(input.orgId, input.searchId);
  if (!search) throw Object.assign(new Error('search_not_found'), { code: 'search_not_found' });
  if (search.search.status !== 'running') {
    throw Object.assign(new Error('search_not_running'), { code: 'search_not_running' });
  }
  await store.refreshSearchFunnel(input.orgId, input.searchId, input.now.toISOString());
  const kicked = await enqueueDueLeadRadarJobs(
    input.db, input.queue, input.now, 5,
    (orgId: string) => input.allowOrganization(orgId),
  );
  const pool = await store.contactDiscovery.getPool(input.orgId, input.searchId);
  const remaining = pool
    ? Math.max(0, pool.candidate_count - Math.max(0, Number(pool.cursor ?? 0)))
    : null;
  return {
    ok: true,
    kicked,
    remaining,
    note: remaining && remaining > 0
      ? 'Партия отправлена в обработку; нажимайте ещё, чтобы двигаться быстрее.'
      : 'Пул кандидатов обработан; финальные проверки идут в фоне.',
  };
}
