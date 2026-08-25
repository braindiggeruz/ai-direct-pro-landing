import type { Env } from '../functions/_types';
import {
  consumeAutomationMessage,
  enqueueDueAutomationJobs,
  type AutomationQueueMessage,
  type AutomationQueueSender,
} from '../functions/platform/automation';
import {
  consumeLeadRadarQueueMessage,
  enqueueDueLeadRadarJobs,
  assertLeadRadarRuntimeSchema,
  hasLeadRadarPersonalDataSchema,
  hasTelegramBusinessTransportSchema,
  isLeadRadarOrganizationAllowed,
  parseLeadRadarQueueMessage,
  parseLeadRadarDispatchLimit,
  parseLeadRadarRetentionDays,
  LeadRadarStore,
  maintainTelegramBusinessTransport,
  type LeadRadarQueueMessage,
  type LeadRadarQueueSender,
} from '../functions/platform/lead-radar';
import {
  createSeoDraftAutomationHandler,
  enqueueScheduledSeoDraftGeneration,
  isFirstPartyAutomationEnabled,
} from '../functions/lib/seo-autopilot/automation';
import {
  getSchedule,
  shouldRunOnDate,
} from '../functions/lib/seo-autopilot/schedule';

interface AutomationWorkerEnv extends Env {
  GPTBOT_DRAFTS_DB: D1Database;
  AUTOMATION_QUEUE: Queue<AutomationQueueMessage | LeadRadarQueueMessage>;
  AUTOMATION_DLQ: Queue<AutomationQueueMessage | LeadRadarQueueMessage>;
}

function isLeadRadarProcessingEnabled(env: AutomationWorkerEnv): boolean {
  return env.LEAD_RADAR_PROCESSING_ENABLED === 'true';
}

function isLeadRadarContactEnabled(env: AutomationWorkerEnv): boolean {
  return env.LEAD_RADAR_CONTACT_ENABLED === 'true';
}

function recordLeadRadarFailure(operation: string, error: unknown): void {
  console.error('lead_radar.worker_failure', {
    operation,
    errorType: error instanceof Error ? error.name : 'unknown',
  });
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sender(queue: Queue<AutomationQueueMessage>): AutomationQueueSender {
  return queue as unknown as AutomationQueueSender;
}

function leadRadarSender(queue: Queue<AutomationQueueMessage | LeadRadarQueueMessage>): LeadRadarQueueSender {
  return queue as unknown as LeadRadarQueueSender;
}

export default {
  async fetch(): Promise<Response> {
    // This Worker has no public command endpoint. Pages writes directly to
    // the Queue binding, eliminating another secret-bearing HTTP surface.
    return new Response('Not Found', { status: 404 });
  },

  async scheduled(
    _controller: ScheduledController,
    env: AutomationWorkerEnv,
  ): Promise<void> {
    const retentionNow = new Date();
    try {
      if (await hasLeadRadarPersonalDataSchema(env.GPTBOT_DRAFTS_DB)) {
        const retentionDays = parseLeadRadarRetentionDays(env.LEAD_RADAR_PERSONAL_RETENTION_DAYS);
        await new LeadRadarStore(env.GPTBOT_DRAFTS_DB).purgeExpiredPersonalContacts(
          new Date(retentionNow.getTime() - retentionDays * 24 * 60 * 60_000).toISOString(),
          retentionNow.toISOString(),
        );
      }
    } catch (error) {
      // Privacy failures are observable but never allowed to take the existing
      // SEO scheduler down. Operations must alert on this closed-list event.
      recordLeadRadarFailure('retention', error);
    }
    try {
      if (await hasTelegramBusinessTransportSchema(env.GPTBOT_DRAFTS_DB)) {
        await maintainTelegramBusinessTransport(env.GPTBOT_DRAFTS_DB, retentionNow);
      }
    } catch (error) {
      // Telegram identifiers and send-state retention is privacy/safety work,
      // so it remains independent from every Lead Radar capability switch.
      recordLeadRadarFailure('telegram_retention', error);
    }
    if (isLeadRadarProcessingEnabled(env)) {
      try {
        await assertLeadRadarRuntimeSchema(env.GPTBOT_DRAFTS_DB);
        await enqueueDueLeadRadarJobs(
          env.GPTBOT_DRAFTS_DB,
          leadRadarSender(env.AUTOMATION_QUEUE),
          retentionNow,
          parseLeadRadarDispatchLimit(env.LEAD_RADAR_MAX_DISPATCH_PER_TICK),
          (orgId) => isLeadRadarOrganizationAllowed(env, orgId),
        );
      } catch (error) {
        recordLeadRadarFailure('dispatch', error);
      }
    }
    if (!isFirstPartyAutomationEnabled(env)) return;
    await enqueueDueAutomationJobs(env.GPTBOT_DRAFTS_DB, sender(env.AUTOMATION_QUEUE as Queue<AutomationQueueMessage>));
    const schedule = await getSchedule(env);
    const now = new Date();
    if (shouldRunOnDate(schedule, now)) {
      await enqueueScheduledSeoDraftGeneration(env, now);
    }
  },

  async queue(
    batch: MessageBatch<AutomationQueueMessage | LeadRadarQueueMessage>,
    env: AutomationWorkerEnv,
  ): Promise<void> {
    const handlers = {
      seo_draft_generation: createSeoDraftAutomationHandler(env),
    };
    for (const message of batch.messages) {
      const raw = message.body;
      const leadEnvelope = parseLeadRadarQueueMessage(raw);
      const rawRecord = recordValue(raw);
      const looksLikeLeadEnvelope = Boolean(
        leadEnvelope || rawRecord?.schema === 'gptbot.lead-radar.job.v1',
      );
      if (looksLikeLeadEnvelope) {
        try {
          if (!isLeadRadarProcessingEnabled(env)) {
            // The authoritative DB job remains queued. Acknowledging the delivery
            // avoids burning Queue retries; cron will re-enqueue it after the
            // operator explicitly re-enables Lead Radar.
            message.ack();
            continue;
          }
          if (!leadEnvelope) {
            message.ack();
            continue;
          }
          await assertLeadRadarRuntimeSchema(env.GPTBOT_DRAFTS_DB);
          const knownJob = await new LeadRadarStore(env.GPTBOT_DRAFTS_DB).getJob(leadEnvelope.job_id);
          if (!knownJob || !isLeadRadarOrganizationAllowed(env, knownJob.orgId)) {
            message.ack();
            continue;
          }
          const result = await consumeLeadRadarQueueMessage(
            env.GPTBOT_DRAFTS_DB,
            raw,
            leadRadarSender(env.AUTOMATION_QUEUE),
            { personalDataEnabled: isLeadRadarContactEnabled(env) },
          );
          if (result.outcome === 'retry_wait') {
            // retryJob() has already persisted the authoritative schedule and
            // returned the durable outbox row to pending. Cron is the sole
            // business-retry dispatcher, so this delivery is only ACKed.
            message.ack();
          } else if (result.outcome === 'dead_letter') {
            await env.AUTOMATION_DLQ.send(raw);
            message.ack();
          } else {
            // Malformed and duplicate Lead Radar envelopes are acknowledged so
            // one poison message cannot force a whole batch to retry forever.
            message.ack();
          }
        } catch (error) {
          // D1 remains the source of truth for valid Lead Radar jobs. Acking a
          // failed delivery lets the bounded scheduler recover it and prevents
          // one Lead Radar fault from aborting unrelated SEO messages in batch.
          recordLeadRadarFailure('consume', error);
          message.ack();
        }
        continue;
      }
      if (!isFirstPartyAutomationEnabled(env)) {
        message.retry({ delaySeconds: 300 });
        continue;
      }
      const result = await consumeAutomationMessage(
        env.GPTBOT_DRAFTS_DB,
        raw,
        handlers,
      );
      if (result.outcome === 'retry_wait') {
        message.retry({ delaySeconds: 60 });
      } else if (result.outcome === 'dead_letter') {
        await env.AUTOMATION_DLQ.send(message.body);
        message.ack();
      } else {
        message.ack();
      }
    }
  },
} satisfies ExportedHandler<AutomationWorkerEnv, AutomationQueueMessage | LeadRadarQueueMessage>;
