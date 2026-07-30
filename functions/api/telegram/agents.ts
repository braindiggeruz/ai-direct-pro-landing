// POST /api/telegram/agents — isolated transport for GPTBot Agent Runtime.
// It never shares the lead/Javob tokens, secrets, dedup table, handlers or
// Telegram-specific request objects with platform/runtime.
import type { Env } from '../../_types';
import { demoAgentManifest } from '../../agents/demo';
import {
  composeSotuvchiWorkflowPorts,
  createSotuvchiCatalogService,
  createSotuvchiCheckoutDomainPort,
  createSotuvchiCheckoutService,
  createSotuvchiCheckoutWorkflowPort,
  createSotuvchiDomainPort,
  createSotuvchiHandoffDomainPort,
  createSotuvchiHandoffService,
  createSotuvchiHandoffWorkflowPort,
  createSotuvchiNotificationDispatcher,
  createSotuvchiAnalytics,
  createSotuvchiOnboardingService,
  createSotuvchiOrdersDomainPort,
  createSotuvchiOrdersService,
  createSotuvchiStatsDomainPort,
  createSotuvchiStatsService,
  createSotuvchiWorkflowPort,
  isStorefrontCode,
  withSotuvchiAnalytics,
  withSotuvchiCheckoutDomain,
  withSotuvchiHandoffDomain,
  withSotuvchiOrdersDomain,
  withSotuvchiStatsDomain,
  type SotuvchiOnboardingSnapshot,
} from '../../agents/sotuvchi';
import { listAgents } from '../../agents/registry';
import {
  TelegramClient,
  createStaticTelegramAgentContextResolver,
  createTelegramAddressBinder,
  createTelegramAgentUpdateStore,
  createTelegramChannelDelivery,
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
  type TelegramDeliveryPort,
} from '../../channels/telegram';
import {
  createChannelAddressBindingPort,
  createChannelAddressService,
} from '../../platform/channels';
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
  replyWorkflow?: { instanceId: string; expectedVersion: number } | null,
): TelegramAgentContext {
  const active = snapshot.status === 'active';
  const entryActionId = snapshot.status === 'completed'
    ? 'seller-status'
    : snapshot.status === 'cancelled'
      ? 'seller-cancelled'
      : fromStart
        ? 'seller-start'
        : undefined;
  // Onboarding owns the workflow slot while it runs; once the store exists the
  // slot carries the trusted "next message is a handoff reply" binding.
  const workflow = active
    ? {
        instanceId: snapshot.workflowInstanceId,
        expectedVersion: snapshot.version,
      }
    : replyWorkflow ?? undefined;
  return {
    orgId: snapshot.orgId,
    agentId: 'sotuvchi',
    locale: snapshot.draft.locale ?? input.locale,
    ...(entryActionId ? { entryActionId } : {}),
    ...(workflow ? { workflow } : {}),
  };
}

export function createTelegramAgentsRuntimeWiring(
  db: D1Database,
  botUsername: string,
  delivery?: TelegramDeliveryPort,
) {
  const onboarding = createSotuvchiOnboardingService(db);
  const catalog = createSotuvchiCatalogService(db);
  const checkout = createSotuvchiCheckoutService(db, catalog, botUsername);
  const orders = createSotuvchiOrdersService(db, catalog);
  const handoff = createSotuvchiHandoffService(db, catalog, botUsername);
  const addresses = createChannelAddressService(db);
  const analytics = createSotuvchiAnalytics(db);
  const stats = createSotuvchiStatsService(db, catalog, { analytics });
  const demoContexts = createStaticTelegramAgentContextResolver([{
    botUsername,
    routeCode: 'demo',
    orgId: 'org-demo',
    agentId: 'demo',
  }]);

  // Trusted server-side lookup: an active checkout draft owned by this buyer
  // identity. The buyer never supplies a workflow instance or version.
  async function storefrontContext(
    orgId: string,
    agentId: string,
    locale: TelegramAgentContext['locale'],
    identityId: string,
    entryActionId?: string,
  ): Promise<TelegramAgentContext> {
    const active = await checkout.getActiveWorkflowRef(identityId);
    return {
      orgId,
      agentId,
      locale,
      ...(entryActionId ? { entryActionId } : {}),
      ...(active && active.orgId === orgId
        ? {
            workflow: {
              instanceId: active.instanceId,
              expectedVersion: active.expectedVersion,
            },
          }
        : {}),
    };
  }

  const contexts: TelegramAgentContextResolver = {
    async resolve(input) {
      const parsed = parseTelegramStartPayload(input.startPayload);
      const isStartCommand = input.isStartCommand === true;
      if (parsed.status === 'valid' && parsed.routeCode === 'seller') {
        const snapshot = await onboarding.getOnboarding({
          identityId: input.telegramIdentityId,
          botUsername,
          requestId: input.idempotencyKey,
          locale: input.locale,
        });
        if (!snapshot) return null;
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
        // Funnel-only: how often the storefront is opened is the one buyer
        // signal no domain table keeps. Recording is best effort and never
        // affects the turn.
        await analytics.record({
          orgId: storefront.orgId,
          storeId: storefront.storeId,
          requestId: input.idempotencyKey,
          event: {
            type: 'sotuvchi.buyer_started',
            locale: storefront.locale,
            source: 'deep_link',
          },
        });
        return storefrontContext(
          storefront.orgId,
          storefront.agentId,
          storefront.locale,
          input.telegramIdentityId,
          'storefront-start',
        );
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
          return sellerContext(
            snapshot,
            input,
            false,
            await handoff.getActiveReplyWorkflowRef(
              snapshot.orgId,
              input.telegramIdentityId,
            ),
          );
        }
        const storefront = await catalog.resolveStoredStorefrontContext(
          botUsername,
          input.telegramIdentityId,
        );
        if (storefront) {
          return storefrontContext(
            storefront.orgId,
            storefront.agentId,
            storefront.locale,
            input.telegramIdentityId,
            isStartCommand ? 'storefront-start' : undefined,
          );
        }
        // A direct pilot is an explicit owner-controlled canary entry point.
        // Plain text must never create a storefront binding implicitly.
        const directPilot = isStartCommand
          ? await onboarding.resolveDirectPilotStorefront(botUsername)
          : null;
        if (directPilot) {
          const directStorefront = {
            orgId: directPilot.orgId,
            storeId: directPilot.storeId,
            agentId: directPilot.agentId,
            locale: directPilot.locale,
          } as const;
          await catalog.bindStorefrontSession({
            botUsername,
            identityId: input.telegramIdentityId,
            context: directStorefront,
          });
          return storefrontContext(
            directStorefront.orgId,
            directStorefront.agentId,
            directStorefront.locale,
            input.telegramIdentityId,
            'storefront-start',
          );
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
      workflow: composeSotuvchiWorkflowPorts([
        createSotuvchiHandoffWorkflowPort(handoff),
        createSotuvchiCheckoutWorkflowPort(checkout),
        createSotuvchiWorkflowPort(onboarding, botUsername),
      ]),
      // Analytics wraps the composed port from the outside: it observes the
      // Facts a successful operation already produced and can never change,
      // retry or repeat a domain call.
      agentDomain: withSotuvchiAnalytics(
        withSotuvchiStatsDomain(
          withSotuvchiHandoffDomain(
            withSotuvchiOrdersDomain(
              withSotuvchiCheckoutDomain(
                createSotuvchiDomainPort(catalog, botUsername),
                createSotuvchiCheckoutDomainPort(checkout),
              ),
              createSotuvchiOrdersDomainPort(orders),
            ),
            createSotuvchiHandoffDomainPort(handoff),
          ),
          createSotuvchiStatsDomainPort(stats),
        ),
        analytics,
      ),
    },
  });
  // Opportunistic outbound flush. There is no scheduler, so pending intents of
  // the store touched by this turn are delivered right after it; a delivery
  // failure never affects the reply the caller already produced.
  const dispatcher = delivery
    ? createSotuvchiNotificationDispatcher({
        handoff,
        orders,
        addresses,
        delivery: createTelegramChannelDelivery(delivery, botUsername),
      })
    : null;

  async function flush(orgId: unknown): Promise<void> {
    if (!dispatcher || typeof orgId !== 'string' || !orgId) return;
    const store = await catalog
      .resolveStorefrontByOrg(orgId, 'ru')
      .catch(() => null);
    if (!store) return;
    await dispatcher.flush(orgId, store.storeId).catch(() => undefined);
  }

  const dispatchingRuntime = {
    async run(input: unknown) {
      const result = await runtime.run(input);
      const orgId = input && typeof input === 'object'
        ? (input as { orgId?: unknown }).orgId
        : undefined;
      await flush(orgId);
      return result;
    },
  };

  return {
    addresses,
    analytics,
    catalog,
    checkout,
    contexts,
    dispatcher,
    flush,
    handoff,
    onboarding,
    orders,
    runtime: dispatchingRuntime,
    stats,
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

  const delivery = createTelegramDeliveryPort(new TelegramClient(token));
  const wiring = createTelegramAgentsRuntimeWiring(db, botUsername, delivery);

  return handleTelegramAgentsWebhook(
    request,
    {
      botUsername,
      webhookSecret: secret,
      updates: createTelegramAgentUpdateStore(db),
      identities: createTelegramIdentityPort(createIdentityService(db)),
      contexts: wiring.contexts,
      runtime: wiring.runtime,
      delivery,
      addresses: createTelegramAddressBinder(
        createChannelAddressBindingPort(wiring.addresses),
        botUsername,
      ),
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
