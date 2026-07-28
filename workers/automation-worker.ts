import type { Env } from '../functions/_types';
import {
  consumeAutomationMessage,
  enqueueDueAutomationJobs,
  type AutomationQueueMessage,
  type AutomationQueueSender,
} from '../functions/platform/automation';
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
  AUTOMATION_QUEUE: Queue<AutomationQueueMessage>;
  AUTOMATION_DLQ: Queue<AutomationQueueMessage>;
}

function sender(queue: Queue<AutomationQueueMessage>): AutomationQueueSender {
  return queue as unknown as AutomationQueueSender;
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
    if (!isFirstPartyAutomationEnabled(env)) return;
    await enqueueDueAutomationJobs(
      env.GPTBOT_DRAFTS_DB,
      sender(env.AUTOMATION_QUEUE),
    );
    const schedule = await getSchedule(env);
    const now = new Date();
    if (shouldRunOnDate(schedule, now)) {
      await enqueueScheduledSeoDraftGeneration(env, now);
    }
  },

  async queue(
    batch: MessageBatch<AutomationQueueMessage>,
    env: AutomationWorkerEnv,
  ): Promise<void> {
    if (!isFirstPartyAutomationEnabled(env)) {
      for (const message of batch.messages) message.retry({ delaySeconds: 300 });
      return;
    }
    const handlers = {
      seo_draft_generation: createSeoDraftAutomationHandler(env),
    };
    for (const message of batch.messages) {
      const result = await consumeAutomationMessage(
        env.GPTBOT_DRAFTS_DB,
        message.body,
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
} satisfies ExportedHandler<AutomationWorkerEnv, AutomationQueueMessage>;
