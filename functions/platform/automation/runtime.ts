import {
  AutomationStepError,
  type AutomationClock,
  type AutomationJob,
  type AutomationJobHandler,
  type AutomationQueueMessage,
  type AutomationQueueSender,
  type CreateAutomationJobInput,
} from './types';
import {
  failAutomationJob,
  finishAutomationJob,
  getAutomationJobById,
  insertOrReuseAutomationJob,
  leaseAutomationJob,
  listDueAutomationJobs,
  markAutomationJobEnqueued,
  markAutomationJobRunning,
  recoverExpiredAutomationLeases,
  replayDeadLetterJob,
} from './store';
import { parseAutomationQueueMessage } from './validation';

const SYSTEM_CLOCK: AutomationClock = { now: () => new Date() };
const LEASE_MS = 10 * 60 * 1000;

function deliveryId(): string {
  return `delivery_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function messageForJob(job: AutomationJob): AutomationQueueMessage {
  return {
    schema: 'gptbot.automation.job.v1',
    job_id: job.jobId,
    job_type: job.jobType,
    delivery_id: deliveryId(),
  };
}

export async function createAndEnqueueAutomationJob(
  db: D1Database,
  queue: AutomationQueueSender,
  input: CreateAutomationJobInput,
  clock: AutomationClock = SYSTEM_CLOCK,
): Promise<{
  outcome: 'created' | 'duplicate';
  queued: boolean;
  job: AutomationJob;
}> {
  const now = clock.now().toISOString();
  const persisted = await insertOrReuseAutomationJob(db, input, now);
  const shouldSend = persisted.outcome === 'created' || !persisted.job.enqueuedAt;
  if (shouldSend) {
    await queue.send(messageForJob(persisted.job));
    await markAutomationJobEnqueued(db, persisted.job.jobId, now);
  }
  const job = await getAutomationJobById(db, persisted.job.jobId);
  if (!job) throw new Error('automation_job_missing_after_enqueue');
  return { outcome: persisted.outcome, queued: shouldSend, job };
}

export async function enqueueDueAutomationJobs(
  db: D1Database,
  queue: AutomationQueueSender,
  clock: AutomationClock = SYSTEM_CLOCK,
): Promise<number> {
  const now = clock.now().toISOString();
  const jobs = await listDueAutomationJobs(db, now);
  for (const job of jobs) {
    await queue.send(messageForJob(job));
    await markAutomationJobEnqueued(db, job.jobId, now);
  }
  return jobs.length;
}

export async function consumeAutomationMessage(
  db: D1Database,
  rawMessage: unknown,
  handlers: Readonly<Record<string, AutomationJobHandler>>,
  options: {
    leaseOwner?: string;
    clock?: AutomationClock;
    retryDelayMs?: number;
  } = {},
): Promise<
  | { outcome: 'completed' | 'awaiting_review'; job: AutomationJob }
  | { outcome: 'retry_wait' | 'dead_letter'; job: AutomationJob }
  | { outcome: 'duplicate_or_unavailable'; job: AutomationJob | null }
> {
  const message = parseAutomationQueueMessage(rawMessage);
  const clock = options.clock ?? SYSTEM_CLOCK;
  const nowDate = clock.now();
  const now = nowDate.toISOString();
  await recoverExpiredAutomationLeases(db, now);
  const owner = options.leaseOwner
    ?? `consumer_${crypto.randomUUID().replaceAll('-', '')}`;
  const leased = await leaseAutomationJob(db, {
    jobId: message.job_id,
    expectedType: message.job_type,
    leaseOwner: owner,
    now,
    leaseExpiresAt: new Date(nowDate.getTime() + LEASE_MS).toISOString(),
  });
  if (!leased) {
    const existing = await getAutomationJobById(db, message.job_id);
    if (existing?.status === 'dead_letter') {
      return { outcome: 'dead_letter', job: existing };
    }
    return {
      outcome: 'duplicate_or_unavailable',
      job: existing,
    };
  }
  if (!await markAutomationJobRunning(db, leased.jobId, owner, now)) {
    return {
      outcome: 'duplicate_or_unavailable',
      job: await getAutomationJobById(db, leased.jobId),
    };
  }
  const handler = handlers[leased.jobType];
  if (!handler) {
    const disposition = await failAutomationJob(db, {
      jobId: leased.jobId,
      leaseOwner: owner,
      errorCode: 'handler_missing',
      retryable: false,
      now,
      availableAt: now,
    });
    const job = await getAutomationJobById(db, leased.jobId);
    if (!job) throw new Error('automation_job_missing_after_failure');
    return {
      outcome: disposition === 'retry_wait' ? 'retry_wait' : 'dead_letter',
      job,
    };
  }
  try {
    const step = await handler(leased);
    const disposition = await finishAutomationJob(db, {
      jobId: leased.jobId,
      leaseOwner: owner,
      status: step.status,
      resultRef: step.resultRef,
      now: clock.now().toISOString(),
    });
    const job = await getAutomationJobById(db, leased.jobId);
    if (!job) throw new Error('automation_job_missing_after_finish');
    if (disposition !== 'applied') {
      return { outcome: 'duplicate_or_unavailable', job };
    }
    return { outcome: step.status, job };
  } catch (error) {
    const classified = error instanceof AutomationStepError
      ? error
      : new AutomationStepError('handler_failed', true);
    const failureTime = clock.now();
    const disposition = await failAutomationJob(db, {
      jobId: leased.jobId,
      leaseOwner: owner,
      errorCode: classified.code,
      retryable: classified.retryable,
      now: failureTime.toISOString(),
      availableAt: new Date(
        failureTime.getTime() + (options.retryDelayMs ?? 60_000),
      ).toISOString(),
    });
    const job = await getAutomationJobById(db, leased.jobId);
    if (!job) {
      throw new Error('automation_job_missing_after_failure', { cause: error });
    }
    return {
      outcome: disposition === 'retry_wait' ? 'retry_wait' : 'dead_letter',
      job,
    };
  }
}

export async function replayAutomationDeadLetter(
  db: D1Database,
  queue: AutomationQueueSender,
  input: {
    tenantKey: string;
    jobId: string;
    actorRole: 'owner' | 'admin' | 'member';
  },
  clock: AutomationClock = SYSTEM_CLOCK,
): Promise<AutomationJob | null> {
  const now = clock.now().toISOString();
  const job = await replayDeadLetterJob(db, { ...input, now });
  if (!job) return null;
  await queue.send(messageForJob(job));
  await markAutomationJobEnqueued(db, job.jobId, now);
  return getAutomationJobById(db, job.jobId);
}
