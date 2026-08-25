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
  type LeadRadarQueueOutcome,
  type LeadRadarQueueMessage,
  type LeadRadarQueueSender,
} from '../functions/platform/lead-radar';
import {
  consumeTelegramCampaignQueueMessage,
  enqueueDueTelegramCampaignsForOrganization,
  hasTelegramCampaignSchema,
  isTelegramCampaignDataKeyValid,
  parseTelegramCampaignQueueMessage,
  recoverExpiredTelegramCampaignLeasesForOrganization,
  type TelegramCampaignQueueMessage,
  type TelegramCampaignQueueSender,
} from '../functions/platform/lead-radar/telegram-campaign';
import {
  hasPrivateTelegramAccountService,
  PrivateTelegramCampaignSender,
} from '../functions/platform/lead-radar/telegram-account-service';
import {
  createSeoDraftAutomationHandler,
  enqueueScheduledSeoDraftGeneration,
  isFirstPartyAutomationEnabled,
} from '../functions/lib/seo-autopilot/automation';
import {
  getSchedule,
  shouldRunOnDate,
} from '../functions/lib/seo-autopilot/schedule';

type AutomationWorkerQueueMessage =
  | AutomationQueueMessage
  | LeadRadarQueueMessage
  | TelegramCampaignQueueMessage;

interface AutomationWorkerEnv extends Env {
  GPTBOT_DRAFTS_DB: D1Database;
  AUTOMATION_QUEUE: Queue<AutomationWorkerQueueMessage>;
  AUTOMATION_DLQ: Queue<AutomationWorkerQueueMessage>;
}

const TELEGRAM_CAMPAIGN_SCHEMA = 'gptbot.lead-radar.telegram-campaign.v1';
const TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT = 10;
const TELEGRAM_CAMPAIGN_DEFAULT_MIN_INTERVAL_SECONDS = 120;
const TELEGRAM_CAMPAIGN_ORG_PATTERN = /^(?:owner_[a-f0-9]{24}|org_[a-f0-9]{32,64})$/u;

function isLeadRadarProcessingEnabled(env: AutomationWorkerEnv): boolean {
  return env.LEAD_RADAR_PROCESSING_ENABLED === 'true';
}

function isLeadRadarContactEnabled(env: AutomationWorkerEnv): boolean {
  return env.LEAD_RADAR_CONTACT_ENABLED === 'true';
}

function isTelegramCampaignAutosendEnabled(env: AutomationWorkerEnv): boolean {
  return env.LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED === 'true'
    && env.LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED === 'true'
    && env.LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED === 'true';
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d+$/u.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function telegramCampaignDailyLimit(env: AutomationWorkerEnv): number | null {
  return boundedInteger(
    env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT,
    TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT,
    1,
    100,
  );
}

function telegramCampaignMinimumIntervalSeconds(env: AutomationWorkerEnv): number | null {
  return boundedInteger(
    env.LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS,
    TELEGRAM_CAMPAIGN_DEFAULT_MIN_INTERVAL_SECONDS,
    30,
    3_600,
  );
}

function telegramCampaignOrganizations(env: AutomationWorkerEnv): string[] {
  return [...new Set((env.LEAD_RADAR_ALLOWED_ORGS ?? '')
    .split(',')
    .map((orgId) => orgId.trim())
    .filter((orgId) => TELEGRAM_CAMPAIGN_ORG_PATTERN.test(orgId)))]
    .slice(0, 20);
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

function leadRadarSender(queue: Queue<AutomationWorkerQueueMessage>): LeadRadarQueueSender {
  return queue as unknown as LeadRadarQueueSender;
}

function telegramCampaignQueueSender(
  queue: Queue<AutomationWorkerQueueMessage>,
): TelegramCampaignQueueSender {
  return queue as unknown as TelegramCampaignQueueSender;
}

export function settleLeadRadarRetryWait(
  message: Pick<Message<unknown>, 'ack' | 'retry'>,
  result: Extract<LeadRadarQueueOutcome, { outcome: 'retry_wait' }>,
): void {
  if (result.retryDelivery) {
    // D1 has already persisted available_at/next_dispatch_at. Retrying the
    // same bounded envelope wakes the job at that deadline; observeJobDispatch
    // then marks the outbox sent. Cron remains the loss/reconciliation fallback.
    message.retry({ delaySeconds: result.delaySeconds });
    return;
  }
  // A lease/CAS conflict is a duplicate delivery, not a business retry. ACK it
  // so duplicates cannot form a 30-second hot loop or consume Queue retries.
  message.ack();
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
    const campaignOrganizations = telegramCampaignOrganizations(env);
    if (campaignOrganizations.length > 0) {
      try {
        await assertLeadRadarRuntimeSchema(env.GPTBOT_DRAFTS_DB);
        if (await hasTelegramCampaignSchema(env.GPTBOT_DRAFTS_DB)) {
          // Lease reconciliation is safety work and remains active even when
          // autosend is paused. It never crosses the Telegram provider boundary.
          for (const orgId of campaignOrganizations) {
            await recoverExpiredTelegramCampaignLeasesForOrganization({
              db: env.GPTBOT_DRAFTS_DB,
              orgId,
              now: retentionNow,
            });
          }
          const dataKey = env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY;
          const dailyLimit = telegramCampaignDailyLimit(env);
          const minimumIntervalSeconds = telegramCampaignMinimumIntervalSeconds(env);
          if (isTelegramCampaignAutosendEnabled(env)
            && isTelegramCampaignDataKeyValid(dataKey)
            && dailyLimit !== null
            && minimumIntervalSeconds !== null
            && hasPrivateTelegramAccountService(env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE)) {
            for (const orgId of campaignOrganizations) {
              await enqueueDueTelegramCampaignsForOrganization({
                db: env.GPTBOT_DRAFTS_DB,
                orgId,
                sender: telegramCampaignQueueSender(env.AUTOMATION_QUEUE),
                now: retentionNow,
                limit: Math.min(dailyLimit, 10),
              });
            }
          }
        }
      } catch (error) {
        recordLeadRadarFailure('telegram_campaign_reconcile', error);
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
    batch: MessageBatch<AutomationWorkerQueueMessage>,
    env: AutomationWorkerEnv,
  ): Promise<void> {
    const handlers = {
      seo_draft_generation: createSeoDraftAutomationHandler(env),
    };
    for (const message of batch.messages) {
      const raw = message.body;
      const rawRecord = recordValue(raw);
      const looksLikeTelegramCampaignEnvelope = rawRecord?.schema === TELEGRAM_CAMPAIGN_SCHEMA;
      if (looksLikeTelegramCampaignEnvelope) {
        try {
          const dataKey = env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY;
          const dailyLimit = telegramCampaignDailyLimit(env);
          const minimumIntervalSeconds = telegramCampaignMinimumIntervalSeconds(env);
          const privateService = env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE;
          // These checks happen before parsing against D1 and, critically,
          // before a recipient can be claimed. Missing private infrastructure
          // is an ACK + scheduler-recovery condition, never an ambiguous send.
          if (!isTelegramCampaignAutosendEnabled(env)
            || !isTelegramCampaignDataKeyValid(dataKey)
            || dailyLimit === null
            || minimumIntervalSeconds === null
            || !hasPrivateTelegramAccountService(privateService)) {
            message.ack();
            continue;
          }
          let campaignEnvelope: TelegramCampaignQueueMessage;
          try {
            campaignEnvelope = parseTelegramCampaignQueueMessage(raw);
          } catch {
            message.ack();
            continue;
          }
          if (!isLeadRadarOrganizationAllowed(env, campaignEnvelope.org_id)) {
            message.ack();
            continue;
          }
          await assertLeadRadarRuntimeSchema(env.GPTBOT_DRAFTS_DB);
          if (!await hasTelegramCampaignSchema(env.GPTBOT_DRAFTS_DB)) {
            message.ack();
            continue;
          }
          const result = await consumeTelegramCampaignQueueMessage({
            db: env.GPTBOT_DRAFTS_DB,
            dataKey: dataKey.trim(),
            raw: campaignEnvelope,
            sender: new PrivateTelegramCampaignSender(privateService),
            dailyLimit,
            minimumIntervalSeconds,
          });
          if (result.next) {
            await env.AUTOMATION_QUEUE.send(result.next, {
              delaySeconds: Math.max(1, result.delaySeconds),
            });
          }
          message.ack();
        } catch (error) {
          // D1 remains authoritative. No blind Queue retry is issued here:
          // the scheduler will re-enqueue due work and recover expired claims.
          recordLeadRadarFailure('telegram_campaign_consume', error);
          message.ack();
        }
        continue;
      }
      const leadEnvelope = parseLeadRadarQueueMessage(raw);
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
            settleLeadRadarRetryWait(message, result);
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
} satisfies ExportedHandler<AutomationWorkerEnv, AutomationWorkerQueueMessage>;
