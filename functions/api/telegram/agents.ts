// POST /api/telegram/agents — isolated transport for GPTBot Agent Runtime.
// It never shares the lead/Javob tokens, secrets, dedup table, handlers or
// Telegram-specific request objects with platform/runtime.
import type { Env } from '../../_types';
import { demoAgentManifest } from '../../agents/demo';
import {
  TelegramClient,
  createStaticTelegramAgentContextResolver,
  createTelegramAgentUpdateStore,
  createTelegramDeliveryPort,
  createTelegramIdentityPort,
  handleTelegramAgentsWebhook,
  isProtectedAgentBotUsername,
  normalizeTelegramBotUsername,
  type TelegramAgentsSafeLogCode,
} from '../../channels/telegram';
import { createIdentityService } from '../../platform/identity';
import { createKnowledgeService } from '../../platform/knowledge';
import {
  createAgentRegistry,
  createAgentRuntime,
} from '../../platform/runtime';

function unavailable(): Response {
  return new Response('unavailable', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function safeLogger() {
  return {
    error(code: TelegramAgentsSafeLogCode): void {
      console.error(`tg.agents:${code}`);
    },
  };
}

export const onRequestPost: PagesFunction<Env> = async ({
  request,
  env,
  waitUntil,
}) => {
  const token = env.TELEGRAM_AGENTS_BOT_TOKEN;
  const secret = env.TELEGRAM_AGENTS_WEBHOOK_SECRET;
  const configuredUsername = env.TELEGRAM_AGENTS_BOT_USERNAME;
  const db = env.GPTBOT_DRAFTS_DB;
  if (!token || !secret || !configuredUsername || !db) return unavailable();

  let botUsername: string;
  try {
    botUsername = normalizeTelegramBotUsername(configuredUsername);
  } catch {
    return unavailable();
  }
  if (isProtectedAgentBotUsername(botUsername)) return unavailable();

  // Route-local registration: the offline demo is reachable only through the
  // allowlisted resolver below. The global production registry remains empty.
  const registry = createAgentRegistry([demoAgentManifest]);
  const runtime = createAgentRuntime({
    registry,
    services: { knowledge: createKnowledgeService(db) },
  });
  const contexts = createStaticTelegramAgentContextResolver([{
    botUsername,
    routeCode: 'demo',
    orgId: 'org-demo',
    agentId: 'demo',
  }]);

  return handleTelegramAgentsWebhook(
    request,
    {
      botUsername,
      webhookSecret: secret,
      updates: createTelegramAgentUpdateStore(db),
      identities: createTelegramIdentityPort(createIdentityService(db)),
      contexts,
      runtime,
      delivery: createTelegramDeliveryPort(new TelegramClient(token)),
      logger: safeLogger(),
    },
    waitUntil,
  );
};

const methodNotAllowed: PagesFunction<Env> = async () =>
  new Response('method not allowed', {
    status: 405,
    headers: {
      Allow: 'POST',
      'Cache-Control': 'no-store',
    },
  });

export const onRequestGet = methodNotAllowed;
export const onRequestPut = methodNotAllowed;
export const onRequestDelete = methodNotAllowed;
export const onRequestPatch = methodNotAllowed;
export const onRequestHead = methodNotAllowed;
export const onRequestOptions = methodNotAllowed;
