import type { Env } from '../functions/_types';
import { configuredLeadRadarSources } from '../functions/platform/lead-radar/discovery-sources';
import { createFreeContactAcquisitionDependencies } from '../functions/platform/lead-radar/free-acquisition';
import { FirecrawlStore } from '../functions/platform/lead-radar/firecrawl-store';
import { ContactDiscoveryStore, contactDiscoverySchemaReady } from '../functions/platform/lead-radar/contact-discovery-store';
import { runSignalScoutTick } from '../functions/platform/lead-radar/signal-scout';
import { createContactResolutionQueueDependencies } from '../functions/platform/lead-radar/contact-resolution-worker';
import {
  consumeAutomationMessage,
  enqueueDueAutomationJobs,
  type AutomationQueueMessage,
  type AutomationQueueSender,
} from '../functions/platform/automation';
import {
  consumeLeadRadarQueueMessage,
  completeTelegramUserAccountConnection,
  enqueueDueLeadRadarJobs,
  resumeStalledLeadRadarSearches,
  getTelegramUserAccountByAuthRequest,
  assertLeadRadarRuntimeSchema,
  hasLeadRadarPersonalDataSchema,
  hasTelegramBusinessTransportSchema,
  isLeadRadarOrganizationAllowed,
  parseLeadRadarQueueMessage,
  parseLeadRadarDispatchLimit,
  parseLeadRadarRetentionDays,
  LeadRadarStore,
  maintainTelegramBusinessTransport,
  revokeTelegramUserAccount,
  setTelegramUserAccountStatus,
  stageTelegramUserAccountConnection,
  type LeadRadarQueueOutcome,
  type LeadRadarQueueMessage,
  type LeadRadarQueueSender,
} from '../functions/platform/lead-radar';
import {
  consumeTelegramCampaignQueueMessage,
  enqueueDueTelegramCampaignsForOrganization,
  hasTelegramCampaignSchema,
  isTelegramCampaignDataKeyValid,
  maintainTelegramCampaigns,
  parseTelegramCampaignQueueMessage,
  recoverExpiredTelegramCampaignLeasesForOrganization,
  type TelegramCampaignQueueMessage,
  type TelegramCampaignQueueSender,
} from '../functions/platform/lead-radar/telegram-campaign';
import {
  finalizeTelegramAccountConnection,
  getTelegramAccountGatewayReadiness,
  hasPrivateTelegramAccountService,
  pollTelegramAccountConnection,
  PrivateTelegramCampaignSender,
} from '../functions/platform/lead-radar/telegram-account-service';
import { LeadRadarTelegramCampaignMediaStore } from '../functions/platform/lead-radar/telegram-campaign-media';
import { LeadRadarTelegramCampaignStore } from '../functions/platform/lead-radar/telegram-campaign-store';
import {
  createSeoDraftAutomationHandler,
  enqueueScheduledSeoDraftGeneration,
  isFirstPartyAutomationEnabled,
} from '../functions/lib/seo-autopilot/automation';
import {
  getSchedule,
  shouldRunOnDate,
} from '../functions/lib/seo-autopilot/schedule';
import {
  LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT,
  parseLeadRadarTelegramCampaignDailyLimit,
  parseLeadRadarTelegramCampaignMinimumIntervalSeconds,
} from '../src/shared/lead-radar-telegram-campaign-policy';
import {
  LEAD_RADAR_TELEGRAM_ACCOUNT_FINALIZATION_RETRY_SECONDS,
  LEAD_RADAR_TELEGRAM_ACCOUNT_FINALIZATION_SCHEMA,
  nextLeadRadarTelegramAccountFinalizationQueueMessage,
  parseLeadRadarTelegramAccountFinalizationQueueMessage,
  type LeadRadarTelegramAccountFinalizationQueueMessage,
} from '../src/shared/lead-radar-telegram-account-finalization';
import {
  SIGNAL_CHAT_QUEUE_SCHEMA,
  SIGNAL_SCAN_QUEUE_SCHEMA,
  parseSignalChatHarvestQueueMessage,
  parseSignalScanQueueMessage,
  type SignalChatHarvestQueueMessage,
  type SignalScanQueueMessage,
} from '../src/shared/signal-radar';
import { runChatHarvest } from '../functions/platform/lead-radar/signal-chat-crawl';

type AutomationWorkerQueueMessage =
  | AutomationQueueMessage
  | LeadRadarQueueMessage
  | TelegramCampaignQueueMessage
  | LeadRadarTelegramAccountFinalizationQueueMessage
  | SignalScanQueueMessage
  | SignalChatHarvestQueueMessage;

interface AutomationWorkerEnv extends Env {
  GPTBOT_DRAFTS_DB: D1Database;
  AUTOMATION_QUEUE: Queue<AutomationWorkerQueueMessage>;
  AUTOMATION_DLQ: Queue<AutomationWorkerQueueMessage>;
}

const TELEGRAM_CAMPAIGN_SCHEMA = 'gptbot.lead-radar.telegram-campaign.v1';
const TELEGRAM_CAMPAIGN_ORG_PATTERN = /^(?:owner_[a-f0-9]{24}|org_[a-f0-9]{32,64})$/u;
const TELEGRAM_INTERNAL_SERVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

function isLeadRadarProcessingEnabled(env: AutomationWorkerEnv): boolean {
  return env.LEAD_RADAR_PROCESSING_ENABLED === 'true';
}

function isLeadRadarContactEnabled(env: AutomationWorkerEnv): boolean {
  return env.LEAD_RADAR_CONTACT_ENABLED === 'true';
}

function isTelegramCampaignAutosendEnabled(env: AutomationWorkerEnv): boolean {
  return env.LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED === 'true'
    && env.LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED === 'true'
    && env.LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED === 'true'
    && env.LEAD_RADAR_TELEGRAM_TRANSPORT_MODE === 'local_bridge'
    && TELEGRAM_INTERNAL_SERVICE_TOKEN_PATTERN.test(
      env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN ?? '',
    );
}

function telegramCampaignDailyLimit(env: AutomationWorkerEnv): number | null {
  return parseLeadRadarTelegramCampaignDailyLimit(
    env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT,
  );
}

function telegramCampaignMinimumIntervalSeconds(env: AutomationWorkerEnv): number | null {
  return parseLeadRadarTelegramCampaignMinimumIntervalSeconds(
    env.LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS,
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

function telegramAccountFinalizationConfigured(env: AutomationWorkerEnv): boolean {
  return env.LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED === 'true'
    && env.LEAD_RADAR_TELEGRAM_TRANSPORT_MODE === 'local_bridge'
    && isTelegramCampaignDataKeyValid(env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY)
    && TELEGRAM_INTERNAL_SERVICE_TOKEN_PATTERN.test(
      env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN ?? '',
    )
    && hasPrivateTelegramAccountService(env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE);
}

async function deferTelegramAccountFinalization(
  message: Message<unknown>,
  envelope: LeadRadarTelegramAccountFinalizationQueueMessage,
  env: AutomationWorkerEnv,
): Promise<void> {
  const next = nextLeadRadarTelegramAccountFinalizationQueueMessage(envelope);
  if (!next) {
    message.ack();
    return;
  }
  try {
    await env.AUTOMATION_QUEUE.send(next, {
      delaySeconds: LEAD_RADAR_TELEGRAM_ACCOUNT_FINALIZATION_RETRY_SECONDS,
    });
    message.ack();
  } catch {
    message.retry({
      delaySeconds: LEAD_RADAR_TELEGRAM_ACCOUNT_FINALIZATION_RETRY_SECONDS,
    });
  }
}

async function consumeTelegramAccountFinalization(
  message: Message<unknown>,
  envelope: LeadRadarTelegramAccountFinalizationQueueMessage,
  env: AutomationWorkerEnv,
): Promise<void> {
  if (Date.parse(envelope.not_after) <= Date.now()) {
    message.ack();
    return;
  }
  if (!telegramAccountFinalizationConfigured(env)
    || !isLeadRadarOrganizationAllowed(env, envelope.org_id)) {
    await deferTelegramAccountFinalization(message, envelope, env);
    return;
  }
  try {
    await assertLeadRadarRuntimeSchema(env.GPTBOT_DRAFTS_DB);
    if (!await hasTelegramCampaignSchema(env.GPTBOT_DRAFTS_DB)) {
      await deferTelegramAccountFinalization(message, envelope, env);
      return;
    }
    const dataKey = (env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY ?? '').trim();
    const account = await getTelegramUserAccountByAuthRequest({
      db: env.GPTBOT_DRAFTS_DB,
      dataKey,
      orgId: envelope.org_id,
      authRequestReference: envelope.auth_id,
    });
    if (!account) {
      await deferTelegramAccountFinalization(message, envelope, env);
      return;
    }
    const connection = await pollTelegramAccountConnection({
      service: env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
      internalServiceToken: env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
      orgId: envelope.org_id,
      authId: envelope.auth_id,
    });
    if (connection.status === 'connecting') {
      await deferTelegramAccountFinalization(message, envelope, env);
      return;
    }
    if (connection.status === 'revoked') {
      await revokeTelegramUserAccount({
        db: env.GPTBOT_DRAFTS_DB,
        orgId: envelope.org_id,
        accountId: account.id,
      });
      message.ack();
      return;
    }
    if (connection.status !== 'connected') {
      if (account.status === 'pending') {
        await setTelegramUserAccountStatus({
          db: env.GPTBOT_DRAFTS_DB,
          orgId: envelope.org_id,
          accountId: account.id,
          expectedVersion: account.stateVersion,
          status: 'error',
          healthy: false,
        });
      }
      message.ack();
      return;
    }
    const staged = account.status === 'connected'
      ? account
      : await stageTelegramUserAccountConnection({
        db: env.GPTBOT_DRAFTS_DB,
        dataKey,
        orgId: envelope.org_id,
        accountId: account.id,
        gatewayAccountRef: connection.accountRef,
        expectedVersion: account.stateVersion,
        maskedLabel: connection.maskedLabel,
        providerConnectedAt: connection.connectedAt,
      });
    const finalized = await finalizeTelegramAccountConnection({
      service: env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
      internalServiceToken: env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
      orgId: envelope.org_id,
      authId: envelope.auth_id,
    });
    if (!finalized) {
      await deferTelegramAccountFinalization(message, envelope, env);
      return;
    }
    if (staged.status !== 'connected') {
      await completeTelegramUserAccountConnection({
        db: env.GPTBOT_DRAFTS_DB,
        dataKey,
        orgId: envelope.org_id,
        accountId: staged.id,
        gatewayAccountRef: connection.accountRef,
        expectedVersion: staged.stateVersion,
        maskedLabel: connection.maskedLabel,
      });
    }
    message.ack();
  } catch (error) {
    recordLeadRadarFailure('telegram_account_finalize', error);
    await deferTelegramAccountFinalization(message, envelope, env);
  }
}

export function settleLeadRadarRetryWait(
  message: Pick<Message<unknown>, 'ack' | 'retry'>,
  result: Extract<LeadRadarQueueOutcome, { outcome: 'retry_wait' }>,
): void {
  if (result.retryDelivery) {
    // D1 has already persisted available_at/next_dispatch_at. Retrying the
    // same bounded envelope wakes the job at that deadline; observeJobDispatch
    // then marks the outbox sent. Cron remains the loss/reconciliation fallback.
    // Cloudflare Queues caps delivery delay at 900 s — longer D1 waits are
    // re-dispatched by cron instead of throwing inside message.retry.
    message.retry({ delaySeconds: Math.min(900, Math.max(1, result.delaySeconds)) });
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
      const firecrawlStore = new FirecrawlStore(env.GPTBOT_DRAFTS_DB);
      if (await firecrawlStore.available()) await firecrawlStore.purgeResults(retentionNow.toISOString());
    } catch { recordLeadRadarFailure('firecrawl_retention', new Error('firecrawl_retention_failed')); }
    try {
      if (await contactDiscoverySchemaReady(env.GPTBOT_DRAFTS_DB)) await new ContactDiscoveryStore(env.GPTBOT_DRAFTS_DB).purgeExpired(retentionNow.toISOString());
    } catch { recordLeadRadarFailure('contact_retention', new Error('contact_retention_failed')); }
    try {
      if (await contactDiscoverySchemaReady(env.GPTBOT_DRAFTS_DB)) {
        await resumeStalledLeadRadarSearches(env.GPTBOT_DRAFTS_DB, retentionNow, (orgId) => isLeadRadarOrganizationAllowed(env, orgId));
      }
    } catch { recordLeadRadarFailure('stalled_search_resume', new Error('stalled_search_resume_failed')); }
    try {
      // Audit QR-10/LR-F-11: without an open admin tab nothing finalized
      // interrupted searches; cron now closes them server-side.
      const interruptedStore = new LeadRadarStore(env.GPTBOT_DRAFTS_DB);
      const staleBefore = new Date(retentionNow.getTime() - 60 * 60_000).toISOString();
      for (const orgId of telegramCampaignOrganizations(env)) {
        await interruptedStore.failInterruptedSearches(orgId, staleBefore, retentionNow.toISOString());
      }
    } catch { recordLeadRadarFailure('interrupted_searches', new Error('interrupted_searches_failed')); }
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
    try {
      // Signal Radar reads public Telegram previews over HTTP. It is its own
      // capability: a failure here must never touch the company funnel below,
      // and it does nothing at all unless its switch is exactly "true".
      await runSignalScoutTick(env, env.GPTBOT_DRAFTS_DB, retentionNow);
    } catch (error) {
      recordLeadRadarFailure('signal_scout', error);
    }
    try {
      // The chat harvest is a rotation, not a run: each tick takes a slice of
      // the source list and stops. A tick that does part of the work is normal
      // and expected — the cursor carries the rest into the next one.
      const harvest = await runChatHarvest(env, env.GPTBOT_DRAFTS_DB, retentionNow);
      if (harvest.skipped.length > 0 || harvest.cards > 0) {
        console.log('signal_radar.chat_harvest', {
          sources: harvest.sources.length,
          entries: harvest.entries,
          cards: harvest.cards,
          kept: harvest.kept,
          rejected: harvest.rejected,
          refreshed: harvest.refreshed,
          nextIndex: harvest.nextIndex,
          elapsedMs: harvest.elapsedMs,
          skipped: harvest.skipped.slice(0, 8),
        });
      }
    } catch (error) {
      recordLeadRadarFailure('signal_chat_harvest', error);
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
    try {
      await assertLeadRadarRuntimeSchema(env.GPTBOT_DRAFTS_DB);
      if (await hasTelegramCampaignSchema(env.GPTBOT_DRAFTS_DB)) {
        // Media retention is capability-independent. A single opaque global
        // cursor discovers even an uploaded-only tenant that was subsequently
        // removed from the autosend allowlist.
        if (env.LEAD_RADAR_CAMPAIGN_MEDIA) {
          const campaignStore = new LeadRadarTelegramCampaignStore(env.GPTBOT_DRAFTS_DB);
          const mediaStore = new LeadRadarTelegramCampaignMediaStore(
            env.LEAD_RADAR_CAMPAIGN_MEDIA,
          );
          // Repair at most one deletion whose Worker died after the D1 CAS.
          // If the private object is still present it becomes active again;
          // otherwise the registry is finalized as deleted. This bounded
          // recovery is the crash barrier that makes freeze/delete races safe.
          const staleDeletionBefore = new Date(
            retentionNow.getTime() - 10 * 60_000,
          ).toISOString();
          // Failed HEAD/Put requests leave a fail-closed capacity reservation.
          // Reap one stale reservation per tick, even when autosend is off.
          // The D1 cleanup lease excludes retries while HEAD proves that the
          // deterministic private-R2 key is absent. On uncertainty, restore the
          // reservation so Free-plan storage can never become unaccounted.
          const staleReservations = await campaignStore
            .listStaleCampaignMediaQuotaReservations(staleDeletionBefore, 1);
          for (const stale of staleReservations) {
            const cleanupLeaseAt = retentionNow.toISOString();
            const claimed = await campaignStore.claimStaleCampaignMediaQuotaReservation({
              orgId: stale.org_id,
              mediaId: stale.media_id,
              observedUpdatedAt: stale.updated_at,
              before: staleDeletionBefore,
              now: cleanupLeaseAt,
            });
            if (!claimed) continue;
            try {
              if (await mediaStore.exists(stale.org_id, stale.media_id)) {
                await campaignStore.restoreCampaignMediaQuotaReservation(
                  stale.org_id,
                  stale.media_id,
                  cleanupLeaseAt,
                  retentionNow.toISOString(),
                );
                continue;
              }
              const released = await campaignStore.completeStaleCampaignMediaQuotaRelease({
                orgId: stale.org_id,
                mediaId: stale.media_id,
                cleanupLeaseAt,
              });
              if (!released) {
                await campaignStore.restoreCampaignMediaQuotaReservation(
                  stale.org_id,
                  stale.media_id,
                  cleanupLeaseAt,
                  retentionNow.toISOString(),
                );
              }
            } catch (error) {
              await campaignStore.restoreCampaignMediaQuotaReservation(
                stale.org_id,
                stale.media_id,
                cleanupLeaseAt,
                retentionNow.toISOString(),
              );
              throw error;
            }
          }
          const staleDeletions = await campaignStore.listStaleCampaignMediaDeletions(
            staleDeletionBefore,
            1,
          );
          for (const stale of staleDeletions) {
            if (await mediaStore.exists(stale.org_id, stale.media_id)) {
              await campaignStore.restoreCampaignMediaDeletion(
                stale.org_id,
                stale.media_id,
                retentionNow.toISOString(),
              );
            } else {
              await campaignStore.completeCampaignMediaDeletion(
                stale.org_id,
                stale.media_id,
                retentionNow.toISOString(),
              );
            }
          }
          const cursorScope = '__all_tenants__';
          const cursor = await campaignStore.getMediaSweepCursor(cursorScope);
          const sweep = await mediaStore.sweepExpired({
            cursor,
            now: retentionNow,
            claimDeletion: async (orgId, mediaId, mediaDigest) => {
              const claimed = await campaignStore.claimCampaignMediaDeletion(orgId, {
                mediaId,
                mediaDigest,
                expiredBefore: retentionNow.toISOString(),
                now: retentionNow.toISOString(),
              });
              return claimed === 'claimed'
                ? 'claimed'
                : claimed === 'missing' ? 'missing' : 'skip';
            },
            completeDeletion: (orgId, mediaId) => campaignStore.completeCampaignMediaDeletion(
              orgId,
              mediaId,
              retentionNow.toISOString(),
            ),
            restoreDeletion: (orgId, mediaId) => campaignStore.restoreCampaignMediaDeletion(
              orgId,
              mediaId,
              retentionNow.toISOString(),
            ),
          });
          await campaignStore.setMediaSweepCursor(
            cursorScope,
            sweep.cursor,
            retentionNow.toISOString(),
          );
        }
        // Reconciliation is tenant-custody work, not an autosend feature. A
        // persisted tenant may have been removed from LEAD_RADAR_ALLOWED_ORGS
        // while it still owns leases, authorizations or suppression state.
        // Walk one D1-discovered tenant per tick so offboarding cannot strand
        // that state and the Free-plan query budget remains bounded.
        const campaignStore = new LeadRadarTelegramCampaignStore(env.GPTBOT_DRAFTS_DB);
        const maintenanceCursor = await campaignStore.getCampaignMaintenanceCursor();
        const maintenancePage = await campaignStore.listCampaignMaintenanceOrganizations(
          maintenanceCursor,
          1,
        );
        for (const orgId of maintenancePage.orgIds) {
          await maintainTelegramCampaigns({
            db: env.GPTBOT_DRAFTS_DB,
            orgId,
            now: retentionNow,
          });
          await recoverExpiredTelegramCampaignLeasesForOrganization({
            db: env.GPTBOT_DRAFTS_DB,
            orgId,
            now: retentionNow,
            limit: 1,
          });
        }
        // Advance only after every bounded maintenance action succeeds. A
        // failed tenant is retried at the same cursor on the next cron tick.
        await campaignStore.setCampaignMaintenanceCursor(
          maintenancePage.nextCursor,
          retentionNow.toISOString(),
        );
        if (campaignOrganizations.length > 0) {
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
                limit: Math.min(dailyLimit, LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT),
              });
            }
          }
        }
      }
    } catch (error) {
      recordLeadRadarFailure('telegram_campaign_reconcile', error);
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
      const looksLikeTelegramAccountFinalization =
        rawRecord?.schema === LEAD_RADAR_TELEGRAM_ACCOUNT_FINALIZATION_SCHEMA;
      if (looksLikeTelegramAccountFinalization) {
        const finalizationEnvelope =
          parseLeadRadarTelegramAccountFinalizationQueueMessage(raw);
        if (!finalizationEnvelope) {
          message.ack();
          continue;
        }
        await consumeTelegramAccountFinalization(message, finalizationEnvelope, env);
        continue;
      }
      // ── Signal Radar chat harvest («Найти чаты») ───────────────────────
      // Heavier than a scan — dozens of paced catalogue requests — but still
      // the only message a human is watching a table for, so it runs early.
      const looksLikeChatHarvest = rawRecord?.schema === SIGNAL_CHAT_QUEUE_SCHEMA;
      if (looksLikeChatHarvest) {
        try {
          const harvestEnvelope = parseSignalChatHarvestQueueMessage(raw);
          if (harvestEnvelope && isLeadRadarOrganizationAllowed(env, harvestEnvelope.org_id)) {
            await runChatHarvest(env, env.GPTBOT_DRAFTS_DB, new Date(), {}, {
              manual: true,
              orgId: harvestEnvelope.org_id,
              extraKeywords: harvestEnvelope.keywords,
            });
          }
        } catch (error) {
          // One button press must never become a retry loop against a
          // catalogue. The next cron tick resumes the rotation anyway.
          recordLeadRadarFailure('signal_chat_harvest_consume', error);
        }
        message.ack();
        continue;
      }
      // ── Signal Radar manual scan (operator pressed «Сканировать») ──────
      // Deliberately before every heavy branch: it is the cheapest message in
      // the system and the only one a human is sitting there waiting for.
      const looksLikeSignalScan = rawRecord?.schema === SIGNAL_SCAN_QUEUE_SCHEMA;
      if (looksLikeSignalScan) {
        try {
          const scanEnvelope = parseSignalScanQueueMessage(raw);
          // A malformed or non-allowlisted envelope is acknowledged, never
          // retried: the cooldown cursor has already been spent in D1.
          if (scanEnvelope && isLeadRadarOrganizationAllowed(env, scanEnvelope.org_id)) {
            await runSignalScoutTick(env, env.GPTBOT_DRAFTS_DB, new Date(), {}, {
              force: true,
              orgId: scanEnvelope.org_id,
            });
          }
        } catch (error) {
          // One button press must never become a retry loop against Telegram.
          // The tick contains its own per-target failures, so anything reaching
          // here is infrastructure-level; cron keeps the radar warm regardless.
          recordLeadRadarFailure('signal_scan', error);
        }
        message.ack();
        continue;
      }
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
          // Probe only an exact, allowlisted envelope, still before any D1
          // schema lookup or recipient claim. This is configuration readiness,
          // not a claim that a tenant Container/session can boot; the bounded
          // send remains the first per-account operational probe.
          const gatewayReadiness = await getTelegramAccountGatewayReadiness(
            privateService,
            env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
          );
          if (gatewayReadiness.status === 'blocked'
            || gatewayReadiness.blockers.length > 0) {
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
            sender: new PrivateTelegramCampaignSender(
              privateService,
              env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN,
            ),
            dailyLimit,
            minimumIntervalSeconds,
            mediaReader: env.LEAD_RADAR_CAMPAIGN_MEDIA
              ? new LeadRadarTelegramCampaignMediaStore(env.LEAD_RADAR_CAMPAIGN_MEDIA)
              : undefined,
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
          const store = new LeadRadarStore(env.GPTBOT_DRAFTS_DB);
          const knownJob = await store.getJob(leadEnvelope.job_id);
          if (!knownJob || !isLeadRadarOrganizationAllowed(env, knownJob.orgId)) {
            message.ack();
            continue;
          }
          const contactSources=await createFreeContactAcquisitionDependencies(env,env.GPTBOT_DRAFTS_DB,knownJob.orgId);
          const result = await consumeLeadRadarQueueMessage(
            env.GPTBOT_DRAFTS_DB,
            raw,
            leadRadarSender(env.AUTOMATION_QUEUE),
            {
              personalDataEnabled: isLeadRadarContactEnabled(env),
              ...createContactResolutionQueueDependencies(env, env.GPTBOT_DRAFTS_DB),
              // Extra catalogs are additive: with no 2GIS key configured the
              // list is OSM-only and discovery behaves exactly as before.
              sources: configuredLeadRadarSources(store, env),
              // Acquisition is free-only. The queue's built-in first-party
              // reader handles websites; no paid enrichment dependency is wired.
              ...contactSources,
            },
          );
          if (result.outcome === 'retry_wait') {
            settleLeadRadarRetryWait(message, result);
          } else if (result.outcome === 'dead_letter') {
            // Audit QR-9/LR-F-12: a failed DLQ copy must not be acked away —
            // retry the delivery so the D1 dead_letter path re-attempts the
            // DLQ send instead of losing the observability copy.
            try {
              await env.AUTOMATION_DLQ.send(raw);
              message.ack();
            } catch (dlqError) {
              recordLeadRadarFailure('dlq_send', dlqError);
              message.retry({ delaySeconds: 300 });
            }
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
