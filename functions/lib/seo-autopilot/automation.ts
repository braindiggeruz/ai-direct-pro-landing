import type { Env } from '../../_types';
import {
  AutomationStepError,
  createAndEnqueueAutomationJob,
  type AutomationJob,
  type AutomationJobHandler,
  type AutomationQueueSender,
} from '../../platform/automation';
import {
  generateAndIngestDirectly,
  type DirectGenerationResult,
  type DirectGenerationTopic,
} from './direct-generator';

export const SEO_AUTOMATION_TENANT = 'platform:gptbot-seo';
const SCHEDULE_REQUEST_REF = 'seo_schedule:default';
const TOPIC_ITEM_PREFIX = 'seo_topic_plan_item:';
const SAFE_ITEM_ID = /^[a-zA-Z0-9_-]{1,120}$/;

function asQueue(env: Env): AutomationQueueSender {
  if (!env.AUTOMATION_QUEUE) {
    throw new AutomationStepError('automation_queue_missing', false);
  }
  return env.AUTOMATION_QUEUE as unknown as AutomationQueueSender;
}

export function isFirstPartyAutomationEnabled(env: Env): boolean {
  return (env.FIRST_PARTY_AUTOMATION_ENABLED ?? 'false').toLowerCase() === 'true';
}

export function topicItemRequestRef(itemId: string): string {
  if (!SAFE_ITEM_ID.test(itemId)) {
    throw new AutomationStepError('invalid_topic_item_ref', false);
  }
  return `${TOPIC_ITEM_PREFIX}${itemId}`;
}

export async function enqueueSeoDraftGeneration(
  env: Env,
  input: {
    idempotencyKey: string;
    requestRef: string;
    maxAttempts?: number;
  },
): Promise<ReturnType<typeof createAndEnqueueAutomationJob> extends Promise<infer T> ? T : never> {
  if (!env.GPTBOT_DRAFTS_DB) {
    throw new AutomationStepError('storage_missing', false);
  }
  if (
    input.requestRef !== SCHEDULE_REQUEST_REF
    && !input.requestRef.startsWith(TOPIC_ITEM_PREFIX)
  ) {
    throw new AutomationStepError('invalid_seo_request_ref', false);
  }
  return createAndEnqueueAutomationJob(
    env.GPTBOT_DRAFTS_DB,
    asQueue(env),
    {
      tenantKey: SEO_AUTOMATION_TENANT,
      jobType: 'seo_draft_generation',
      idempotencyKey: input.idempotencyKey,
      requestRef: input.requestRef,
      maxAttempts: input.maxAttempts ?? 3,
    },
  );
}

export async function enqueueScheduledSeoDraftGeneration(
  env: Env,
  now = new Date(),
): Promise<Awaited<ReturnType<typeof enqueueSeoDraftGeneration>>> {
  const day = now.toISOString().slice(0, 10);
  return enqueueSeoDraftGeneration(env, {
    idempotencyKey: `seo-schedule:${day}`,
    requestRef: SCHEDULE_REQUEST_REF,
  });
}

async function loadTopic(
  env: Env,
  requestRef: string,
): Promise<DirectGenerationTopic> {
  if (requestRef === SCHEDULE_REQUEST_REF) {
    return { target_locales: ['ru', 'uz'] };
  }
  if (!requestRef.startsWith(TOPIC_ITEM_PREFIX)) {
    throw new AutomationStepError('invalid_seo_request_ref', false);
  }
  const itemId = requestRef.slice(TOPIC_ITEM_PREFIX.length);
  if (!SAFE_ITEM_ID.test(itemId) || !env.GPTBOT_DRAFTS_DB) {
    throw new AutomationStepError('invalid_topic_item_ref', false);
  }
  const row = await env.GPTBOT_DRAFTS_DB.prepare(
    `SELECT id, plan_id, locale, planned_title, primary_keyword,
            target_money_page, cluster_key, funnel_stage, audience,
            industry, channel, content_type, intent_key
     FROM seo_topic_plan_items
     WHERE id = ?`,
  ).bind(itemId).first<Record<string, unknown>>();
  if (!row) throw new AutomationStepError('topic_item_not_found', false);
  return {
    planned_title: String(row.planned_title ?? ''),
    primary_keyword: String(row.primary_keyword ?? ''),
    locale: row.locale === 'uz' ? 'uz' : 'ru',
    target_locales: ['ru', 'uz'],
    target_money_page: row.target_money_page ? String(row.target_money_page) : null,
    cluster: row.cluster_key ? String(row.cluster_key) : null,
    funnel_stage: row.funnel_stage ? String(row.funnel_stage) : null,
    audience: row.audience ? String(row.audience) : null,
    industry: row.industry ? String(row.industry) : null,
    channel: row.channel ? String(row.channel) : null,
    content_type: row.content_type ? String(row.content_type) : null,
    intent_key: row.intent_key ? String(row.intent_key) : null,
    plan_id: row.plan_id ? String(row.plan_id) : null,
    plan_item_id: String(row.id),
  };
}

function classifyGenerationFailure(
  result: DirectGenerationResult,
): AutomationStepError {
  const code = result.error_code || 'seo_generation_failed';
  const nonRetryable = new Set([
    'storage_missing',
    'llm_provider_missing',
    'ai_output_invalid',
    'locale_pair_incomplete',
  ]);
  return new AutomationStepError(code, !nonRetryable.has(code));
}

export function createSeoDraftAutomationHandler(
  env: Env,
  generate: typeof generateAndIngestDirectly = generateAndIngestDirectly,
): AutomationJobHandler {
  return async (job: AutomationJob) => {
    if (job.jobType !== 'seo_draft_generation') {
      throw new AutomationStepError('invalid_job_type', false);
    }
    if (job.tenantKey !== SEO_AUTOMATION_TENANT) {
      throw new AutomationStepError('tenant_mismatch', false);
    }
    const topic = await loadTopic(env, job.requestRef);
    const result = await generate(env, topic, {
      requestedBy: 'system:first-party-automation',
      source: job.requestRef === SCHEDULE_REQUEST_REF ? 'schedule' : 'admin',
      runId: job.idempotencyKey,
      requireLocalePair: true,
    });
    if (!result.ok) throw classifyGenerationFailure(result);
    if (
      !result.draft_id
      || !result.locales?.includes('ru')
      || !result.locales.includes('uz')
    ) {
      throw new AutomationStepError('locale_pair_incomplete', false);
    }
    return {
      status: 'awaiting_review',
      resultRef: `ai_draft:${result.draft_id}`,
    };
  };
}
