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
  createTelegramRateLimiter,
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
import { verifyTelegramAgentsRuntimeSchema } from './agents-schema';

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
  completedEntryAction = 'seller-dashboard',
): TelegramAgentContext {
  const active = snapshot.status === 'active';
  const entryActionId = snapshot.status === 'completed'
    ? completedEntryAction
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

export interface TelegramAgentsRuntimeWiringOptions {
  /**
   * Cloudflare lifecycle hook for best-effort analytics and notification
   * dispatch that must not delay the buyer-facing Telegram response.
   */
  schedulePostTurn?: (promise: Promise<unknown>) => void;
}

export function createTelegramAgentsRuntimeWiring(
  db: D1Database,
  botUsername: string,
  delivery?: TelegramDeliveryPort,
  options: TelegramAgentsRuntimeWiringOptions = {},
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

  async function sellerEntryAction(
    snapshot: SotuvchiOnboardingSnapshot,
  ): Promise<'seller-dashboard' | 'seller-paused' | 'seller-suspended'> {
    if (!snapshot.store || snapshot.store.status !== 'active') {
      return 'seller-suspended';
    }
    const active = await catalog.resolveStorefrontContext({
      orgId: snapshot.orgId,
      storeId: snapshot.store.id,
      agentId: 'sotuvchi',
      locale: snapshot.draft.locale ?? snapshot.store.locale,
    }).then(() => true).catch(() => false);
    return active ? 'seller-dashboard' : 'seller-paused';
  }

  async function completedSellerContext(
    snapshot: SotuvchiOnboardingSnapshot,
    input: TelegramAgentContextInput,
  ): Promise<TelegramAgentContext | null> {
    // A checkout remains the active task even for an owner temporarily buying
    // from the storefront. `/start` and seller navigation cannot discard it.
    const checkoutRef = await checkout.getActiveWorkflowRef(
      input.telegramIdentityId,
    );
    if (checkoutRef) {
      const storefront = await catalog.resolveStoredStorefrontContext(
        botUsername,
        input.telegramIdentityId,
      );
      if (storefront?.orgId === checkoutRef.orgId) {
        return storefrontContext(
          storefront.orgId,
          storefront.agentId,
          storefront.locale,
          input.telegramIdentityId,
          'storefront-start',
        );
      }
    }

    const entryAction = await sellerEntryAction(snapshot);
    if (
      input.actionId
      && new Set([
        'seller-dashboard',
        'seller-status',
        'seller-paused',
        'seller-suspended',
      ]).has(input.actionId)
      && input.actionId !== entryAction
      && !(input.actionId === 'seller-status' && entryAction === 'seller-dashboard')
    ) {
      return null;
    }
    if (
      entryAction !== 'seller-dashboard'
      && (
        input.actionId === 'seller-dashboard'
        || input.actionId === 'seller-status'
        || input.actionId === 'seller-more'
      )
    ) {
      return null;
    }
    return sellerContext(
      snapshot,
      input,
      false,
      await handoff.getActiveReplyWorkflowRef(
        snapshot.orgId,
        input.telegramIdentityId,
      ),
      entryAction,
    );
  }

  async function sellerInterestContext(
    input: TelegramAgentContextInput,
  ): Promise<TelegramAgentContext | null> {
    const directPilot = await onboarding.resolveDirectPilotStorefront(
      botUsername,
    );
    if (!directPilot) return null;
    const storefront = {
      orgId: directPilot.orgId,
      storeId: directPilot.storeId,
      agentId: directPilot.agentId,
      locale: input.locale,
    } as const;
    await catalog.bindStorefrontSession({
      botUsername,
      identityId: input.telegramIdentityId,
      context: storefront,
    });
    await analytics.record({
      orgId: storefront.orgId,
      storeId: storefront.storeId,
      requestId: input.idempotencyKey,
      event: {
        type: 'sotuvchi.bot_started',
        locale: storefront.locale,
        source: 'deep_link',
      },
    });
    return storefrontContext(
      storefront.orgId,
      storefront.agentId,
      storefront.locale,
      input.telegramIdentityId,
      'seller-interest',
    );
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
        if (!snapshot) return sellerInterestContext(input);
        if (snapshot.status === 'completed') {
          return completedSellerContext(snapshot, input);
        }
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
          locale: input.locale,
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
            type: 'sotuvchi.bot_started',
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
          return completedSellerContext(snapshot, input);
        }
        if (snapshot?.status === 'cancelled') {
          return sellerContext(snapshot, input, false);
        }
        // Seller callbacks are invitations only when rendered from the buyer
        // menu. They never become authority-bearing dashboard actions.
        if (input.actionId?.startsWith('seller-')) {
          return null;
        }
        let storefront = await catalog.resolveStoredStorefrontContext(
          botUsername,
          input.telegramIdentityId,
        );
        if (storefront) {
          const requestedLocale = input.actionId === 'buyer-locale-uz'
            ? 'uz'
            : input.actionId === 'buyer-locale-ru'
              ? 'ru'
              : null;
          if (requestedLocale) {
            storefront = await catalog.setStoredStorefrontLocale(
              botUsername,
              input.telegramIdentityId,
              requestedLocale,
            );
            await analytics.record({
              orgId: storefront.orgId,
              storeId: storefront.storeId,
              requestId: input.idempotencyKey,
              event: {
                type: 'sotuvchi.language_selected',
                locale: storefront.locale,
                source: 'session',
              },
            });
          }
          if (isStartCommand) {
            await analytics.record({
              orgId: storefront.orgId,
              storeId: storefront.storeId,
              requestId: input.idempotencyKey,
              event: {
                type: 'sotuvchi.bot_started',
                locale: storefront.locale,
                source: 'session',
              },
            });
          }
          if (isStartCommand || input.actionId) {
            await catalog.clearStorefrontPendingBudget({
              botUsername,
              identityId: input.telegramIdentityId,
              context: storefront,
            });
          }
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
            locale: input.locale,
          } as const;
          await catalog.bindStorefrontSession({
            botUsername,
            identityId: input.telegramIdentityId,
            context: directStorefront,
          });
          await analytics.record({
            orgId: directStorefront.orgId,
            storeId: directStorefront.storeId,
            requestId: input.idempotencyKey,
            event: {
              type: 'sotuvchi.bot_started',
              locale: directStorefront.locale,
              source: 'session',
            },
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
      analytics,
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

  function runtimeFact(
    result: Awaited<ReturnType<typeof runtime.run>>,
    key: string,
  ): string | null {
    for (const sheet of result.facts) {
      const value = sheet.values[key];
      if (typeof value === 'string') return value;
    }
    return null;
  }

  async function recordWorkflowAnalytics(
    input: unknown,
    result: Awaited<ReturnType<typeof runtime.run>>,
  ): Promise<void> {
    if (!input || typeof input !== 'object') return;
    const turn = input as {
      orgId?: unknown;
      requestId?: unknown;
      locale?: unknown;
    };
    if (
      typeof turn.orgId !== 'string'
      || typeof turn.requestId !== 'string'
      || (turn.locale !== 'ru' && turn.locale !== 'uz')
    ) {
      return;
    }
    if (runtimeFact(result, 'checkout.view') === 'completed') {
      await analytics.record({
        orgId: turn.orgId,
        requestId: turn.requestId,
        event: {
          type: 'sotuvchi.order_created',
          locale: turn.locale,
          ...(runtimeFact(result, 'checkout.product.ref')
            ? { productId: runtimeFact(result, 'checkout.product.ref')! }
            : {}),
        },
      });
    }
    if (runtimeFact(result, 'seller.view') === 'seller_answered') {
      await analytics.record({
        orgId: turn.orgId,
        requestId: turn.requestId,
        event: {
          type: 'sotuvchi.seller_responded',
          locale: turn.locale,
          reasonCode: 'handoff',
        },
      });
    }
  }

  const dispatchingRuntime = {
    async run(input: unknown) {
      const result = await runtime.run(input);
      const orgId = input && typeof input === 'object'
        ? (input as { orgId?: unknown }).orgId
        : undefined;
      const postTurn = (async () => {
        await recordWorkflowAnalytics(input, result);
        await flush(orgId);
      })();
      if (options.schedulePostTurn) {
        options.schedulePostTurn(postTurn.catch(() => undefined));
      } else {
        await postTurn;
      }
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
  const wiring = createTelegramAgentsRuntimeWiring(
    db,
    botUsername,
    delivery,
    { schedulePostTurn: waitUntil },
  );

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
      schemaReady: () => verifyTelegramAgentsRuntimeSchema(db),
      rateLimiter: createTelegramRateLimiter(db, { hashKey: secret }),
      telemetry: {
        async recordError(input) {
          await wiring.analytics.record({
            orgId: input.orgId,
            requestId: input.requestId,
            event: {
              type: 'sotuvchi.telegram_error',
              locale: input.locale,
              reasonCode: input.reasonCode,
              latencyBucket: input.latencyBucket,
            },
          });
        },
      },
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
