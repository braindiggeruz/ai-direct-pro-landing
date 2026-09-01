import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { LeadRadarCrawlerJobSummary, LeadRadarCrawlerStatus } from '../src/shared/lead-radar-crawler';
import {
  CRAWLER_STATUS_MAX_POLLS, clearCrawlerCreateKey, createCrawlerResultRefresh, crawlerJobCopy, crawlerJobIsActive,
  crawlerPollDelay, crawlerReasonCopy, ensureCrawlerCreateKey, latestCrawlerJob,
  readCrawlerCreateKey, startCrawlerStatusPolling,
} from '../src/admin/components/lead-radar/website-collector-state';

const job: LeadRadarCrawlerJobSummary = { id: 'job-1', companyId: 'company-1', status: 'queued', reason: null,
  availableAt: '2026-08-31T09:00:00Z', updatedAt: '2026-08-31T09:00:00Z', pagesAccepted: 0, contactsFound: 0 };
const status: LeadRadarCrawlerStatus = { enabled: true, ready: true, worker: { online: true, lastSeenAt: '2026-08-31T09:00:00Z' }, jobs: [job] };
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test('collector status is scoped to the company, with no simulated progress or Telegram readiness', () => {
  const another = { ...job, id: 'another', companyId: 'company-2', updatedAt: '2026-09-01T00:00:00Z' };
  const next = { ...job, id: 'job-2', updatedAt: '2026-08-31T10:00:00Z', status: 'completed' as const, contactsFound: 2 };
  assert.equal(latestCrawlerJob({ ...status, jobs: [another, job, next] }, 'company-1'), next);
  assert.equal(latestCrawlerJob(status, 'missing'), null);
  assert.equal(latestCrawlerJob(null, 'company-1'), null);
  for (const state of ['queued', 'running', 'deferred'] as const) assert.equal(crawlerJobIsActive({ ...job, status: state }), true);
  for (const state of ['completed', 'partial', 'failed', 'cancelled'] as const) assert.equal(crawlerJobIsActive({ ...job, status: state }), false);
  assert.match(crawlerJobCopy(status, next).detail, /Проверка Telegram.*отдельно/);
  assert.match(crawlerJobCopy(status, { ...next, contactsFound: 0 }).detail, /не доказывает их отсутствие/);
  assert.match(crawlerJobCopy(status, { ...job, status: 'partial' }).title, /частичный/);
});

test('offline, unconfigured and source-limited states give separate truthful explanations', () => {
  assert.match(crawlerJobCopy({ ...status, worker: { online: false, lastSeenAt: null } }, job).title, /Ожидаем компьютер/);
  assert.match(crawlerJobCopy({ ...status, worker: null }, { ...job, status: 'running' }).title, /Нет связи/);
  assert.match(crawlerJobCopy({ ...status, ready: false, reason: 'crawler_not_configured' }, null).detail, /ещё не подключён/);
  assert.match(crawlerJobCopy({ ...status, ready: false, reason: 'crawler_schema_unavailable' }, null).detail, /Серверная часть/);
  assert.match(crawlerJobCopy(status, { ...job, status: 'deferred', reason: 'source_rate_limited' }).detail, /разрешённой паузы/);
  assert.match(crawlerReasonCopy('robots_disallowed')!, /не разрешил/);
  assert.match(crawlerReasonCopy('non_public_address')!, /безопасности/);
  assert.equal(crawlerReasonCopy('raw secret or internal exception'), null);
});

test('status polling stops for disabled or terminal jobs and uses slower reads while waiting', () => {
  assert.equal(crawlerPollDelay({ ...status, enabled: false }, job.companyId, 0), null);
  assert.equal(crawlerPollDelay({ ...status, jobs: [] }, job.companyId, 0), null);
  assert.equal(crawlerPollDelay({ ...status, jobs: [{ ...job, status: 'completed' }] }, job.companyId, 0), null);
  assert.equal(crawlerPollDelay(status, job.companyId, 0), 5_000);
  assert.equal(crawlerPollDelay({ ...status, worker: null }, job.companyId, 0), 30_000);
  assert.equal(crawlerPollDelay({ ...status, jobs: [{ ...job, status: 'deferred' }] }, job.companyId, 0), 15_000);
  assert.equal(crawlerPollDelay(status, job.companyId, CRAWLER_STATUS_MAX_POLLS), null);
});

test('poller is bounded, sequential and never performs a mutation or source retry', async () => {
  let callback: (() => void) | null = null;
  let reads = 0;
  let paused = false;
  let busy = false;
  const stop = startCrawlerStatusPolling({ companyId: job.companyId,
    read: async () => { assert.equal(busy, true); reads += 1; return status; },
    onStatus: () => {}, onError: () => assert.fail('unexpected read error'),
    onPaused: (value) => { paused = value; }, onBusy: (value) => { busy = value; },
    schedule: (next) => { assert.equal(callback, null); callback = next; return 1 as unknown as ReturnType<typeof setTimeout>; },
    clear: () => { callback = null; },
  });
  await flush();
  while (callback) { const next: () => void = callback; callback = null; next(); await flush(); }
  assert.equal(reads, CRAWLER_STATUS_MAX_POLLS + 1);
  assert.equal(paused, true);
  assert.equal(busy, false);
  stop();
});

test('unmount aborts the request, removes timers and ignores a late response', async () => {
  let resolve!: (value: LeadRadarCrawlerStatus) => void;
  let signal: AbortSignal | null = null;
  let delivered = 0;
  let scheduled = 0;
  const stop = startCrawlerStatusPolling({ companyId: job.companyId,
    read: (nextSignal) => { signal = nextSignal; return new Promise((done) => { resolve = done; }); },
    onStatus: () => { delivered += 1; }, onError: () => { delivered += 1; }, onPaused: () => {}, onBusy: () => {},
    schedule: () => { scheduled += 1; return 1 as unknown as ReturnType<typeof setTimeout>; },
  });
  stop();
  assert.equal(signal!.aborted, true);
  resolve(status);
  await flush();
  assert.equal(delivered, 0);
  assert.equal(scheduled, 0);

  let timerCleared = false;
  const stopScheduled = startCrawlerStatusPolling({ companyId: job.companyId, read: async () => status,
    onStatus: () => {}, onError: () => {}, onPaused: () => {}, onBusy: () => {},
    schedule: () => 42 as unknown as ReturnType<typeof setTimeout>, clear: (timer) => { assert.equal(timer, 42); timerCleared = true; },
  });
  await flush();
  stopScheduled();
  assert.equal(timerCleared, true);
});

test('a status read failure is recoverable without an automatic write or endless polling', async () => {
  let errors = 0;
  let paused = false;
  let busy = true;
  const stop = startCrawlerStatusPolling({ companyId: job.companyId, read: async () => { throw new Error('offline'); },
    onStatus: () => assert.fail('no status'), onError: () => { errors += 1; },
    onPaused: (value) => { paused = value; }, onBusy: (value) => { busy = value; },
    schedule: () => { assert.fail('errors require explicit refresh'); },
  });
  await flush();
  assert.equal(errors, 1);
  assert.equal(paused, true);
  assert.equal(busy, false);
  stop();
});

test('pending create identity survives a timeout and a tab reload, isolated per company', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  let generated = 0;
  const createId = () => `${++generated === 1 ? 'a' : 'b'}0000000-0000-0000-0000-000000000000`;
  const first = ensureCrawlerCreateKey('company-1', storage, createId);
  assert.equal(readCrawlerCreateKey('company-1', storage), first);
  assert.equal(ensureCrawlerCreateKey('company-1', storage, createId), first);
  assert.equal(generated, 1);
  assert.equal(readCrawlerCreateKey('company-2', storage), null);
  clearCrawlerCreateKey('company-1', storage);
  assert.equal(readCrawlerCreateKey('company-1', storage), null);
  assert.notEqual(ensureCrawlerCreateKey('company-1', storage, createId), first);
  const unavailable = { getItem: () => { throw new Error('disabled'); }, setItem: () => { throw new Error('disabled'); }, removeItem: () => { throw new Error('disabled'); } };
  assert.equal(readCrawlerCreateKey('company-1', unavailable), null);
  assert.doesNotThrow(() => ensureCrawlerCreateKey('company-1', unavailable, createId));
  assert.doesNotThrow(() => clearCrawlerCreateKey('company-1', unavailable));
});

test('partial findings refresh immediately and a terminal update is not lost during a slow read', async () => {
  const reads: Array<() => void> = [];
  let recovered = 0;
  const refresh = createCrawlerResultRefresh({ refresh: () => new Promise<void>((resolve) => { reads.push(resolve); }),
    onError: () => assert.fail('unexpected error'), onRecovered: () => { recovered += 1; } });
  refresh.accept(job);
  assert.equal(reads.length, 0, 'zero accepted pages is not a result');
  refresh.accept({ ...job, status: 'deferred', pagesAccepted: 1 });
  assert.equal(reads.length, 1);
  refresh.accept({ ...job, status: 'completed', pagesAccepted: 3 });
  refresh.accept({ ...job, status: 'deferred', pagesAccepted: 2 });
  assert.equal(reads.length, 1, 'card reads are serialized');
  reads[0](); await flush();
  assert.equal(reads.length, 2, 'terminal findings still trigger a fresh card read');
  reads[1](); await flush();
  refresh.accept({ ...job, status: 'completed', pagesAccepted: 3 });
  assert.equal(reads.length, 2, 'unchanged snapshots do not refetch');
  assert.equal(recovered, 2);
  refresh.stop();
});

test('a failed card refresh can retry the same accepted result, with no post-unmount updates', async () => {
  let attempts = 0;
  let errors = 0;
  let recovered = 0;
  const refresh = createCrawlerResultRefresh({ refresh: async () => { if (++attempts === 1) throw new Error('network'); },
    onError: () => { errors += 1; }, onRecovered: () => { recovered += 1; } });
  const result = { ...job, status: 'partial' as const, pagesAccepted: 1 };
  refresh.accept(result); await flush();
  assert.equal(errors, 1);
  refresh.accept(result); await flush();
  assert.equal(attempts, 2);
  assert.equal(recovered, 1);
  refresh.stop();
  refresh.accept({ ...result, pagesAccepted: 2 });
  assert.equal(attempts, 2);
});

test('card uses the authenticated API, respects feature gating, and does not touch campaign state', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const card = readFileSync(path.join(root, 'src/admin/components/lead-radar/WebsiteCollectorCard.tsx'), 'utf8');
  const page = readFileSync(path.join(root, 'src/admin/pages/LeadRadar.tsx'), 'utf8');
  assert.match(card, /snapshot\?\.enabled === false\) return null/);
  assert.match(card, /api\.leadRadarCrawlerStatus\(companyId, signal\)/);
  assert.match(card, /api\.leadRadarCreateCrawlerJob\(companyId, key, controller.signal\)/);
  assert.match(card, /api\.leadRadarCancelCrawlerJob\(jobId, controller.signal\)/);
  assert.match(card, /createCrawlerResultRefresh/);
  assert.match(card, /role="status" aria-live="polite"/);
  assert.match(card, /min-h-12/);
  assert.doesNotMatch(card, /fetch\(|getToken|Authorization|leadRadarPrepare|leadRadarSend|leadRadarResolveContact|dangerouslySetInnerHTML|setInterval/);
  const refresh = page.slice(page.indexOf('async function refreshCollectedContacts'), page.indexOf('async function updateLifecycle'));
  assert.match(refresh, /requestSequence.current !== sequence/);
  assert.match(refresh, /current\?\.search.id === searchId/);
  assert.doesNotMatch(refresh, /openSearch|setDraftInput|setSelectedLeadId|setMobileDetailOpen|setLoading|setAudience/);
  assert.match(page, /<WebsiteCollectorCard key=\{lead.id\} companyId=\{lead.id\}/);
});
