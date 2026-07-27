// POST /api/telegram/agents — isolated transport for GPTBot Agent Runtime.
// It never shares the lead/Javob tokens, secrets, dedup table, handlers or
// Telegram-specific request objects with platform/runtime.
import type { Env } from '../../_types';
import { demoAgentManifest } from '../../agents/demo';
import {
  createSotuvchiCatalogService,
  createSotuvchiDomainPort,
  createSotuvchiOnboardingService,
  createSotuvchiWorkflowPort,
  isStorefrontCode,
  type SotuvchiOnboardingSnapshot,
} from '../../agents/sotuvchi';
import { listAgents } from '../../agents/registry';
import {
  TelegramClient,
  createStaticTelegramAgentContextResolver,
  createTelegramAgentUpdateStore,
  createTelegramDeliveryPort,
  createTelegramIdentityPort,
  handleTelegramAgentsWebhook,
  isProtectedAgentBotUsername,
  normalizeTelegramBotUsername,
  parseTelegramStartPayload,
  type TelegramAgentContext,
  type TelegramAgentContextInput,
  type TelegramAgentContextResolver,
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

function sellerContext(
  snapshot: SotuvchiOnboardingSnapshot,
  input: TelegramAgentContextInput,
  fromStart: boolean,
): TelegramAgentContext {
  const active = snapshot.status === 'active';
  const entryActionId = snapshot.status === 'completed'
    ? 'seller-status'
    : snapshot.status === 'cancelled'
      ? 'seller-cancelled'
      : fromStart
        ? 'seller-start'
        : undefined;
  return {
    orgId: snapshot.orgId,
    agentId: 'sotuvchi',
    locale: snapshot.draft.locale ?? input.locale,
    ...(entryActionId ? { entryActionId } : {}),
    ...(active
      ? {
          workflow: {
            instanceId: snapshot.workflowInstanceId,
            expectedVersion: snapshot.version,
          },
        }
      : {}),
  };
}

export function createTelegramAgentsRuntimeWiring(
  db: D1Database,
  botUsername: string,
) {
  const onboarding = createSotuvchiOnboardingService(db);
  const catalog = createSotuvchiCatalogService(db);
  const demoContexts = createStaticTelegramAgentContextResolver([{
    botUsername,
    routeCode: 'demo',
    orgId: 'org-demo',
    agentId: 'demo',
  }]);
  const contexts: TelegramAgentContextResolver = {
    async resolve(input) {
      const parsed = parseTelegramStartPayload(input.startPayload);
      if (parsed.status === 'valid' && parsed.routeCode === 'seller') {
        const snapshot = await onboarding.startOnboarding({
          identityId: input.telegramIdentityId,
          botUsername,
          requestId: input.idempotencyKey,
          locale: input.locale,
        });
        return sellerContext(snapshot, input, true);
      }
      if (
        parsed.status === 'valid'
        && isStorefrontCode(parsed.routeCode)
      ) {
        const route = await onboarding.resolveStorefrontRoute(
          botUsername,
          parsed.routeCode,
        );
        if (!route) return null;
        const storefront = {
          orgId: route.orgId,
          storeId: route.storeId,
          agentId: route.agentId,
          locale: route.locale,
        } as const;
        await catalog.bindStorefrontSession({
          botUsername,
          identityId: input.telegramIdentityId,
          context: storefront,
        });
        return {
          orgId: storefront.orgId,
          agentId: storefront.agentId,
          locale: storefront.locale,
          entryActionId: 'storefront-start',
        };
      }
      if (parsed.status === 'none') {
        const snapshot = await onboarding.getOnboarding({
          identityId: input.telegramIdentityId,
          botUsername,
          requestId: input.idempotencyKey,
          locale: input.locale,
        });
        if (snapshot?.status === 'active') {
          return sellerContext(snapshot, input, false);
        }
        if (snapshot?.status === 'completed') {
          return sellerContext(snapshot, input, false);
        }
        const storefront = await catalog.resolveStoredStorefrontContext(
          botUsername,
          input.telegramIdentityId,
        );
        if (storefront) {
          return {
            orgId: storefront.orgId,
            agentId: storefront.agentId,
            locale: storefront.locale,
          };
        }
      }
      return demoContexts.resolve(input);
    },
  };

  const registry = createAgentRegistry([
    demoAgentManifest,
    ...listAgents(),
  ]);
  const runtime = createAgentRuntime({
    registry,
    services: {
      knowledge: createKnowledgeService(db),
      workflow: createSotuvchiWorkflowPort(onboarding, botUsername),
      agentDomain: createSotuvchiDomainPort(catalog, botUsername),
    },
  });
  return { catalog, contexts, onboarding, runtime };
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

  const wiring = createTelegramAgentsRuntimeWiring(db, botUsername);

  return handleTelegramAgentsWebhook(
    request,
    {
      botUsername,
      webhookSecret: secret,
      updates: createTelegramAgentUpdateStore(db),
      identities: createTelegramIdentityPort(createIdentityService(db)),
      contexts: wiring.contexts,
      runtime: wiring.runtime,
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
