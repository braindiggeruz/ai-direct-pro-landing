import type { Env } from '../_types';
import type {
  CatalogProduct,
  CatalogSearchResult,
  StoreOwnerContext,
} from '../agents/sotuvchi';
import {
  createSotuvchiNotificationDispatcher,
} from '../agents/sotuvchi';
import {
  TelegramClient,
  createTelegramChannelDelivery,
  createTelegramDeliveryPort,
  isProtectedAgentBotUsername,
  normalizeTelegramBotUsername,
} from '../channels/telegram';
import {
  MarketHttpError,
  MarketInitDataError,
  MarketSessionError,
  assertMarketOrigin,
  bearerToken,
  bindMarketLaunch,
  boundedLimit,
  createSotuvchiApplicationServices,
  enforceMarketRateLimit,
  issueMarketSession,
  issueMediaHandle,
  marketError,
  marketFlag,
  marketJson,
  marketRequestId,
  proxyTelegramMedia,
  readMarketJson,
  requireIdempotencyKey,
  resolveMarketAccess,
  verifyMarketSession,
  verifyMediaHandle,
  verifyTelegramInitData,
  type MarketAccessContext,
  type MarketSessionClaims,
  type SotuvchiApplicationServices,
} from '.';
import { reduceSearchQuery } from './search-query';
import {
  assertVoiceSearchEnabled,
  createMarketVoiceFacade,
  interpretVoiceTranscript,
  readVoiceAudio,
  transcribeVoiceSearch,
  voiceSearchAvailable,
} from './voice';

interface MarketConfiguration {
  botToken: string;
  botUsername: string;
  sessionSecret: string;
}

interface RequestContext {
  request: Request;
  env: Env;
  services: SotuvchiApplicationServices;
  config: MarketConfiguration;
  claims: MarketSessionClaims;
  access: MarketAccessContext;
  requestId: string;
  url: URL;
  path: string;
  waitUntil?: (promise: Promise<unknown>) => void;
}

function configuration(env: Env): MarketConfiguration {
  if (!marketFlag(env.MARKET_MINI_APP_ENABLED)) {
    throw new MarketHttpError('feature_disabled', 503);
  }
  const botToken = env.TELEGRAM_AGENTS_BOT_TOKEN ?? '';
  const sessionSecret = env.MARKET_MINI_APP_SESSION_SECRET ?? '';
  let botUsername: string;
  try {
    botUsername = normalizeTelegramBotUsername(
      env.TELEGRAM_AGENTS_BOT_USERNAME ?? '',
    );
  } catch {
    throw new MarketHttpError('feature_disabled', 503);
  }
  if (
    !botToken
    || !sessionSecret
    || new TextEncoder().encode(sessionSecret).byteLength < 32
    || isProtectedAgentBotUsername(botUsername)
  ) {
    throw new MarketHttpError('feature_disabled', 503);
  }
  return { botToken, botUsername, sessionSecret };
}

function currentPath(url: URL): string {
  const prefix = '/api/market/v1';
  const path = url.pathname.startsWith(prefix)
    ? url.pathname.slice(prefix.length)
    : '';
  return path && path !== '/' ? path.replace(/\/$/, '') : '/';
}

function sellerOwner(context: RequestContext): StoreOwnerContext {
  if (!context.access.sellerOrg || !context.access.sellerStore) {
    throw new MarketHttpError('seller_forbidden', 403);
  }
  return {
    identityId: context.claims.sub,
    orgId: context.access.sellerOrg.orgId,
    storeId: context.access.sellerStore.id,
    requestId: context.access.sellerOrg.requestId,
    locale: context.claims.locale,
  };
}

function requireSellerCommands(context: RequestContext): void {
  if (
    !context.access.sellerOrg
    || !context.access.sellerStore
    || !marketFlag(context.env.MARKET_MINI_APP_SELLER_COMMANDS_ENABLED)
  ) {
    throw new MarketHttpError('seller_forbidden', 403);
  }
}

async function productDto(
  product: CatalogProduct,
  categoryName: string | null,
  storeName: string,
  secret: string,
  locale: 'ru' | 'uz',
) {
  return {
    id: product.id,
    categoryId: product.categoryId,
    categoryName,
    sku: product.sku,
    name: product.name,
    description: product.description,
    priceMinor: product.priceMinor,
    currency: product.currency,
    availability: product.availability,
    status: product.status,
    mediaHandles: await Promise.all(product.mediaRefs.map((_, index) =>
      issueMediaHandle(secret, { productId: product.id, index })
    )),
    specifications: product.specifications.map((specification) => ({
      key: specification.key,
      label: locale === 'uz'
        ? specification.labelUz
        : specification.labelRu,
      value: specification.value,
    })),
    version: product.version,
    updatedAt: product.updatedAt,
    storeName,
  };
}

async function resultDtos(
  results: readonly CatalogSearchResult[],
  context: RequestContext,
) {
  return Promise.all(results.map(async (result) => ({
    ...(await productDto(
      result.product,
      result.categoryName,
      result.storeName,
      context.config.sessionSecret,
      context.claims.locale,
    )),
    relevance: {
      confidence: result.confidence,
      matchedConstraints: result.matchedConstraints,
      unmatchedConstraints: result.unmatchedConstraints,
      reasonCodes: result.reasonCodes,
    },
  })));
}

function parseAvailabilityFilter(value: string | null): CatalogProduct['availability'] | null {
  if (value === null || value === '') return null;
  if (!['available', 'preorder', 'unavailable'].includes(value)) {
    throw new MarketHttpError('validation_failed', 400);
  }
  return value as CatalogProduct['availability'];
}

/**
 * Optional upper bound in integer UZS minor units. Voice supplies it from a
 * spoken budget; typed search may supply it from the filter sheet.
 */
function parseMaxPriceMinor(value: string | null): number | null {
  if (value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new MarketHttpError('validation_failed', 400);
  }
  return parsed;
}

interface CatalogSearchInput {
  query: string;
  availability: CatalogProduct['availability'] | null;
  maxPriceMinor: number | null;
  limit: number;
}

interface CatalogSearchOutcome {
  results: readonly CatalogSearchResult[];
  /** The query the catalog actually received, after intent words were dropped. */
  queryApplied: string;
}

/**
 * The single catalog search path. Typed search and voice search both land
 * here, so voice can never reach products that the typed search would not
 * return: ranking, tenant scope and publication state stay untouched, and the
 * extra constraints are applied to the ranked rows only.
 *
 * The sentence reduction runs here rather than at either caller, which is what
 * keeps that invariant true — a shopper who types «Мне нужен блокнот» and one
 * who says it out loud reach `searchPublishedProducts` with the same query.
 * Re-reducing an already reduced query is a no-op, so the voice route paying
 * for it twice costs nothing and cannot diverge.
 */
async function runCatalogSearch(
  context: RequestContext,
  input: CatalogSearchInput,
): Promise<CatalogSearchOutcome> {
  const queryApplied = input.query ? reduceSearchQuery(input.query).query : '';
  const ranked = queryApplied
    ? await context.services.catalog.searchPublishedProducts(
        context.access.buyer,
        queryApplied,
        input.limit,
      )
    : await context.services.catalog.listPublishedProducts(
        context.access.buyer,
        input.limit,
      );
  let results = ranked;
  if (input.availability) {
    results = results.filter(
      (item) => item.product.availability === input.availability,
    );
  }
  if (input.maxPriceMinor !== null) {
    const ceiling = input.maxPriceMinor;
    results = results.filter((item) => item.product.priceMinor <= ceiling);
  }
  if (results.length > 0 && results.length <= 4) {
    await context.services.catalog.recordStorefrontPresentation({
      botUsername: context.config.botUsername,
      identityId: context.claims.sub,
      context: context.access.buyer,
      requestId: context.requestId,
      results,
    }).catch(() => undefined);
  }
  await context.services.analytics.record({
    orgId: context.access.buyer.orgId,
    storeId: context.access.buyer.storeId,
    requestId: context.requestId,
    event: {
      type: results.length
        ? 'sotuvchi.search_results_shown'
        : 'sotuvchi.zero_results',
      locale: context.claims.locale,
      resultCount: results.length,
      reasonCode: results.length ? 'market_search' : 'market_no_result',
    },
  }).catch(() => undefined);
  return { results, queryApplied };
}

async function bootstrapPayload(context: RequestContext) {
  const [orders, activeCheckout, activeHandoff] = await Promise.all([
    context.services.checkout.listBuyerOrders(context.access.buyerOrg, 5),
    context.services.checkout.getActiveCheckout(context.access.buyerOrg),
    context.services.handoff.getActiveForBuyer(context.access.buyerOrg),
  ]);
  return {
    apiVersion: 'market-v1',
    buildId: context.env.MARKET_MINI_APP_BUILD_ID ?? 'local',
    locale: context.claims.locale,
    navigation: ['home', 'search', 'compare', 'orders'],
    sellerNavigation: context.access.sellerOrg
      ? ['dashboard', 'orders', 'questions', 'products', 'inventory']
      : [],
    flags: {
      buyer: true,
      sellerRead: context.access.sellerOrg !== null,
      sellerCommands:
        context.access.sellerOrg !== null
        && marketFlag(context.env.MARKET_MINI_APP_SELLER_COMMANDS_ENABLED),
      voice: voiceSearchAvailable(context.env),
    },
    storefront: { id: context.access.buyer.storeId, state: 'active' },
    counters: {
      orders: orders.length,
      activeCheckout: activeCheckout !== null,
      activeHandoff: activeHandoff !== null,
    },
  };
}

function launchBootstrapPayload(context: RequestContext) {
  return {
    apiVersion: 'market-v1',
    buildId: context.env.MARKET_MINI_APP_BUILD_ID ?? 'local',
    locale: context.claims.locale,
    navigation: ['home', 'search', 'compare', 'orders'],
    sellerNavigation: [],
    flags: {
      buyer: true,
      sellerRead: false,
      sellerCommands: false,
      voice: voiceSearchAvailable(context.env),
    },
    storefront: { id: context.access.buyer.storeId, state: 'active' },
    counters: {
      orders: 0,
      activeCheckout: false,
      activeHandoff: false,
    },
  };
}

async function catalogHomePayload(context: RequestContext) {
  const [categories, results] = await Promise.all([
    context.services.catalog.listBuyerCategories(context.access.buyer),
    context.services.catalog.listPublishedProducts(context.access.buyer, 12),
  ]);
  return {
    categories,
    products: await resultDtos(results, context),
    updatedAt: new Date().toISOString(),
  };
}

function sessionBody(value: Record<string, unknown>): string {
  const raw = value.initData ?? value.init_data;
  if (typeof raw !== 'string') {
    throw new MarketHttpError('validation_failed', 400);
  }
  return raw;
}

async function exchangeSession(
  request: Request,
  env: Env,
  services: SotuvchiApplicationServices,
  config: MarketConfiguration,
  requestId: string,
  current?: MarketSessionClaims,
  includeLaunch = false,
): Promise<Response> {
  const body = await readMarketJson(request, 9_216);
  const raw = sessionBody(body);
  await enforceMarketRateLimit(
    'exchange',
    `${request.headers.get('CF-Connecting-IP') ?? 'unknown'}:${raw.slice(-96)}`,
  );
  const init = await verifyTelegramInitData(raw, config.botToken);
  if (current && current.telegramId !== init.user.id) {
    throw new MarketHttpError('invalid_session', 401);
  }
  const identity = await services.identities.getOrCreateIdentity(
    'telegram',
    init.user.id,
  );
  if (current && current.sub !== identity.identity.id) {
    throw new MarketHttpError('invalid_session', 401);
  }
  const boundBuyer = await bindMarketLaunch(
    services,
    config.botUsername,
    identity.identity.id,
    init,
  );
  const issued = await issueMarketSession(config.sessionSecret, {
    sub: identity.identity.id,
    telegramId: init.user.id,
    locale: init.locale,
    launch: init.launchFingerprint,
  });
  const access = await resolveMarketAccess(
    services,
    env,
    config.botUsername,
    issued.claims,
    requestId,
    boundBuyer ?? undefined,
    !includeLaunch,
  );
  const session = {
    token: issued.token,
    expiresAt: new Date(issued.claims.exp * 1_000).toISOString(),
    locale: issued.claims.locale,
    user: {
      firstName: init.user.firstName,
      lastName: init.user.lastName,
      username: init.user.username,
    },
    capabilities: {
      buyer: true,
      sellerRead: access.sellerOrg !== null,
      sellerCommands:
        access.sellerOrg !== null
        && marketFlag(env.MARKET_MINI_APP_SELLER_COMMANDS_ENABLED),
    },
    storefront: {
      id: access.buyer.storeId,
      locale: access.buyer.locale,
    },
  };
  if (!includeLaunch) return marketJson(session, requestId, 201);
  const context: RequestContext = {
    request,
    env,
    services,
    config,
    claims: issued.claims,
    access,
    requestId,
    url: new URL(request.url),
    path: '/session/launch',
  };
  const bootstrap = launchBootstrapPayload(context);
  const home = await catalogHomePayload(context);
  return marketJson({ session, bootstrap, home }, requestId, 201);
}

function commandOrg(context: RequestContext, requestKey: string) {
  return { ...context.access.buyerOrg, requestId: requestKey };
}

function sellerCommandOrg(context: RequestContext, requestKey: string) {
  if (!context.access.sellerOrg) {
    throw new MarketHttpError('seller_forbidden', 403);
  }
  return { ...context.access.sellerOrg, requestId: requestKey };
}

function scheduleFlush(context: RequestContext, orgId: string, storeId: string) {
  const delivery = createTelegramDeliveryPort(
    new TelegramClient(context.config.botToken),
  );
  const dispatcher = createSotuvchiNotificationDispatcher({
    handoff: context.services.handoff,
    orders: context.services.orders,
    addresses: context.services.addresses,
    delivery: createTelegramChannelDelivery(
      delivery,
      context.config.botUsername,
    ),
    analytics: context.services.analytics,
  });
  const flush = dispatcher.flush(orgId, storeId).catch(() => undefined);
  if (context.waitUntil) context.waitUntil(flush);
}

async function readRoutes(context: RequestContext): Promise<Response | null> {
  const { path, requestId, services, access, url } = context;
  if (context.request.method !== 'GET') return null;
  await enforceMarketRateLimit(
    path.includes('/seller/orders/') || path.includes('/seller/handoffs/')
      ? 'sensitive'
      : 'read',
    `${context.claims.sub}:${path}`,
  );

  if (path === '/me') {
    return marketJson({
      locale: context.claims.locale,
      capabilities: {
        buyer: true,
        sellerRead: access.sellerOrg !== null,
        sellerCommands:
          access.sellerOrg !== null
          && marketFlag(context.env.MARKET_MINI_APP_SELLER_COMMANDS_ENABLED),
      },
      storefrontId: access.buyer.storeId,
      sellerStore: access.sellerStore,
    }, requestId);
  }
  if (path === '/bootstrap') {
    return marketJson(await bootstrapPayload(context), requestId);
  }
  if (path === '/catalog/home') {
    return marketJson(await catalogHomePayload(context), requestId);
  }
  if (path === '/catalog/categories') {
    return marketJson({
      items: await services.catalog.listBuyerCategories(access.buyer),
      nextCursor: null,
    }, requestId);
  }
  const categoryProducts = /^\/catalog\/categories\/([^/]+)\/products$/.exec(path);
  if (categoryProducts) {
    const limit = boundedLimit(url.searchParams.get('limit'));
    const results = await services.catalog.listPublishedProductsByCategory(
      access.buyer,
      categoryProducts[1],
      limit,
    );
    return marketJson({
      items: await resultDtos(results, context),
      nextCursor: null,
    }, requestId);
  }
  if (path === '/catalog/products') {
    const query = (url.searchParams.get('q') ?? '').trim();
    const maxPriceMinor = parseMaxPriceMinor(url.searchParams.get('maxPriceMinor'));
    const search = await runCatalogSearch(context, {
      query,
      availability: parseAvailabilityFilter(url.searchParams.get('availability')),
      maxPriceMinor,
      limit: boundedLimit(url.searchParams.get('limit')),
    });
    return marketJson({
      items: await resultDtos(search.results, context),
      nextCursor: null,
      // What ran, not what was typed: «Мне нужен блокнот» searches «блокнот».
      queryApplied: search.queryApplied || null,
      maxPriceMinorApplied: maxPriceMinor,
    }, requestId);
  }
  const productMatch = /^\/catalog\/products\/([^/]+)$/.exec(path);
  if (productMatch) {
    const result = await services.catalog.getPublishedProductResult(
      access.buyer,
      productMatch[1],
    );
    await services.analytics.record({
      orgId: access.buyer.orgId,
      storeId: access.buyer.storeId,
      requestId,
      event: {
        type: 'sotuvchi.product_viewed',
        locale: context.claims.locale,
        productId: result.product.id,
      },
    }).catch(() => undefined);
    return marketJson(await productDto(
      result.product,
      result.categoryName,
      result.storeName,
      context.config.sessionSecret,
      context.claims.locale,
    ), requestId);
  }
  if (path === '/comparison') {
    const comparison = await services.catalog.listStorefrontComparison({
      botUsername: context.config.botUsername,
      identityId: context.claims.sub,
      context: access.buyer,
    });
    return marketJson({
      outcome: comparison.outcome,
      items: await resultDtos(comparison.results, context),
    }, requestId);
  }
  if (path === '/checkout/active') {
    return marketJson({
      checkout: await services.checkout.getActiveCheckout(access.buyerOrg),
    }, requestId);
  }
  if (path === '/orders') {
    return marketJson({
      items: await services.checkout.listBuyerOrders(
        access.buyerOrg,
        Math.min(5, boundedLimit(url.searchParams.get('limit'), 5)),
      ),
      nextCursor: null,
    }, requestId);
  }
  const buyerOrder = /^\/orders\/([^/]+)$/.exec(path);
  if (buyerOrder) {
    return marketJson(
      await services.checkout.getBuyerOrder(access.buyerOrg, buyerOrder[1]),
      requestId,
    );
  }
  if (path === '/handoffs/active') {
    return marketJson({
      handoff: await services.handoff.getActiveForBuyer(access.buyerOrg),
    }, requestId);
  }
  const media = /^\/media\/([^/]+)$/.exec(path);
  if (media) {
    const decoded = await verifyMediaHandle(
      context.config.sessionSecret,
      media[1],
    );
    if (!decoded) throw new MarketHttpError('resource_not_found', 404);
    let product: CatalogProduct | null = await services.catalog
      .getPublishedProduct(access.buyer, decoded.productId)
      .catch(() => null);
    if (!product && access.sellerOrg) {
      product = await services.catalog
        .getProduct(sellerOwner(context), decoded.productId)
        .catch(() => null);
    }
    const reference = product?.mediaRefs[decoded.index];
    if (!reference) throw new MarketHttpError('resource_not_found', 404);
    const proxied = await proxyTelegramMedia(context.config.botToken, reference);
    if (!proxied) throw new MarketHttpError('resource_not_found', 404);
    proxied.headers.set('x-request-id', requestId);
    return proxied;
  }

  if (path.startsWith('/seller/')) {
    if (!access.sellerOrg || !access.sellerStore) {
      throw new MarketHttpError('seller_forbidden', 403);
    }
    if (path === '/seller/dashboard') {
      const [stats, orders, handoffs] = await Promise.all([
        services.stats.getStats(access.sellerOrg),
        services.orders.listOrders(access.sellerOrg, 5),
        services.handoff.listHandoffs(access.sellerOrg, 5),
      ]);
      return marketJson({ store: access.sellerStore, stats, orders, handoffs }, requestId);
    }
    if (path === '/seller/stats') {
      return marketJson(await services.stats.getStats(access.sellerOrg), requestId);
    }
    if (path === '/seller/orders') {
      return marketJson({
        items: await services.orders.listOrders(
          access.sellerOrg,
          Math.min(5, boundedLimit(url.searchParams.get('limit'), 5)),
        ),
        nextCursor: null,
      }, requestId);
    }
    const sellerOrder = /^\/seller\/orders\/([^/]+)$/.exec(path);
    if (sellerOrder) {
      return marketJson(
        await services.orders.getOrder(access.sellerOrg, sellerOrder[1]),
        requestId,
      );
    }
    if (path === '/seller/handoffs') {
      return marketJson({
        items: await services.handoff.listHandoffs(
          access.sellerOrg,
          boundedLimit(url.searchParams.get('limit'), 10),
        ),
        nextCursor: null,
      }, requestId);
    }
    const sellerHandoff = /^\/seller\/handoffs\/([^/]+)$/.exec(path);
    if (sellerHandoff) {
      return marketJson(
        await services.handoff.getHandoff(access.sellerOrg, sellerHandoff[1]),
        requestId,
      );
    }
    if (path === '/seller/products') {
      const status = url.searchParams.get('status');
      const products = await services.catalog.listProducts(sellerOwner(context), {
        ...(status ? { status } : {}),
        limit: boundedLimit(url.searchParams.get('limit')),
      });
      return marketJson({
        items: await Promise.all(products.map((product) => productDto(
          product,
          null,
          access.sellerStore!.name,
          context.config.sessionSecret,
          context.claims.locale,
        ))),
        nextCursor: null,
      }, requestId);
    }
    const sellerProduct = /^\/seller\/products\/([^/]+)$/.exec(path);
    if (sellerProduct) {
      const product = await services.catalog.getProduct(
        sellerOwner(context),
        sellerProduct[1],
      );
      const inventory = await services.orders.getInventory(
        access.sellerOrg,
        product.id,
      ).catch(() => null);
      return marketJson({
        product: await productDto(
          product,
          null,
          access.sellerStore.name,
          context.config.sessionSecret,
          context.claims.locale,
        ),
        inventory,
      }, requestId);
    }
    if (path === '/seller/categories') {
      return marketJson({
        items: await services.catalog.listCategories(sellerOwner(context)),
      }, requestId);
    }
    if (path === '/seller/inventory') {
      return marketJson({
        items: await services.orders.listInventory(
          access.sellerOrg,
          boundedLimit(url.searchParams.get('limit')),
        ),
        nextCursor: null,
      }, requestId);
    }
  }
  return null;
}

/**
 * Voice search. One round trip: the recording goes up, the transcript, the
 * constraints Bormi understood and the grounded catalog rows come back
 * together, so the buyer sees what was heard and what it found on the same
 * screen. The transcript is always returned — including when nothing matched —
 * so the client can fall back to ordinary typed search without a re-record.
 */
async function voiceRoutes(context: RequestContext): Promise<Response | null> {
  const { request, path, requestId, services, access } = context;
  if (request.method !== 'POST' || path !== '/voice/search') return null;
  assertVoiceSearchEnabled(context.env);
  await enforceMarketRateLimit('voice', `${context.claims.sub}:voice`);

  const audio = await readVoiceAudio(request);
  const transcription = await transcribeVoiceSearch(
    createMarketVoiceFacade(context.env),
    audio,
  );
  const categories = await services.catalog
    .listBuyerCategories(access.buyer)
    .catch(() => []);
  const interpretation = interpretVoiceTranscript(
    transcription.transcript,
    categories,
  );
  const search = interpretation.productQuery
    ? await runCatalogSearch(context, {
        query: interpretation.productQuery,
        availability: interpretation.availability,
        maxPriceMinor: interpretation.maxPriceMinor,
        limit: boundedLimit(context.url.searchParams.get('limit')),
      })
    : { results: [] as readonly CatalogSearchResult[], queryApplied: '' };
  return marketJson({
    transcript: transcription.transcript,
    language: transcription.language,
    interpretation: {
      productQuery: interpretation.productQuery,
      maxPriceMinor: interpretation.maxPriceMinor,
      ambiguousPriceMinor: interpretation.ambiguousPriceMinor,
      availability: interpretation.availability,
      category: interpretation.category,
      constraints: interpretation.constraints,
      clarification: interpretation.clarification,
      confidence: interpretation.confidence,
    },
    items: await resultDtos(search.results, context),
    nextCursor: null,
    queryApplied: search.queryApplied || null,
  }, requestId);
}

async function comparisonCommands(context: RequestContext): Promise<Response | null> {
  const { request, path, services, access, requestId } = context;
  if (request.method === 'POST' && path === '/comparison/items') {
    requireIdempotencyKey(request);
    const body = await readMarketJson(request);
    const comparison = await services.catalog.addStorefrontComparison({
      botUsername: context.config.botUsername,
      identityId: context.claims.sub,
      context: access.buyer,
      productId: String(body.productId ?? body.product_id ?? ''),
    });
    return marketJson({
      outcome: comparison.outcome,
      items: await resultDtos(comparison.results, context),
    }, requestId, 201);
  }
  if (request.method === 'DELETE' && path === '/comparison') {
    requireIdempotencyKey(request);
    await services.catalog.clearStorefrontComparison({
      botUsername: context.config.botUsername,
      identityId: context.claims.sub,
      context: access.buyer,
    });
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store', 'x-request-id': requestId },
    });
  }
  const remove = /^\/comparison\/items\/([^/]+)$/.exec(path);
  if (request.method === 'DELETE' && remove) {
    requireIdempotencyKey(request);
    const current = await services.catalog.listStorefrontComparison({
      botUsername: context.config.botUsername,
      identityId: context.claims.sub,
      context: access.buyer,
    });
    await services.catalog.clearStorefrontComparison({
      botUsername: context.config.botUsername,
      identityId: context.claims.sub,
      context: access.buyer,
    });
    let rebuilt = await services.catalog.listStorefrontComparison({
      botUsername: context.config.botUsername,
      identityId: context.claims.sub,
      context: access.buyer,
    });
    for (const item of current.results.filter(
      (candidate) => candidate.product.id !== remove[1],
    )) {
      rebuilt = await services.catalog.addStorefrontComparison({
        botUsername: context.config.botUsername,
        identityId: context.claims.sub,
        context: access.buyer,
        productId: item.product.id,
      });
    }
    return marketJson({ items: await resultDtos(rebuilt.results, context) }, requestId);
  }
  return null;
}

async function checkoutCommands(context: RequestContext): Promise<Response | null> {
  const { request, path, services, access, requestId } = context;
  if (request.method !== 'POST') return null;
  const key = requireIdempotencyKey(request);
  const org = commandOrg(context, key);
  if (path === '/checkout') {
    const body = await readMarketJson(request);
    return marketJson(
      await services.checkout.startCheckout(
        org,
        body.productId ?? body.product_id,
      ),
      requestId,
      201,
    );
  }
  const steps: Record<string, (body: Record<string, unknown>) => Promise<unknown>> = {
    '/checkout/quantity': (body) => services.checkout.submitQuantity(org, body.quantity),
    '/checkout/name': (body) => services.checkout.submitName(org, body.name),
    '/checkout/phone': (body) => services.checkout.submitPhone(org, body.phone),
    '/checkout/address': (body) => services.checkout.submitAddress(org, body.address),
    '/checkout/comment': (body) => services.checkout.submitComment(org, body.comment),
  };
  if (steps[path]) {
    return marketJson(await steps[path](await readMarketJson(request)), requestId);
  }
  if (path === '/checkout/comment/skip') {
    return marketJson(await services.checkout.skipComment(org), requestId);
  }
  if (path === '/checkout/confirm') {
    const result = await services.checkout.confirmCheckout(org);
    scheduleFlush(context, access.buyer.orgId, access.buyer.storeId);
    return marketJson(result, requestId);
  }
  if (path === '/checkout/cancel') {
    return marketJson({
      checkout: await services.checkout.cancelCheckout(org),
    }, requestId);
  }
  if (path === '/handoffs') {
    const body = await readMarketJson(request);
    const result = await services.handoff.requestHandoff(
      org,
      body.reason,
      body.question,
    );
    scheduleFlush(context, access.buyer.orgId, access.buyer.storeId);
    return marketJson(result, requestId, 201);
  }
  return null;
}

async function sellerCommands(context: RequestContext): Promise<Response | null> {
  const { request, path, services, access, requestId } = context;
  if (!path.startsWith('/seller/')) return null;
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
  if (!mutating) return null;
  requireSellerCommands(context);
  const key = requireIdempotencyKey(request);
  await enforceMarketRateLimit('command', `${context.claims.sub}:${path}`);
  const org = sellerCommandOrg(context, key);

  const orderCommand = /^\/seller\/orders\/([^/]+)\/(confirm|cancel|done)$/.exec(path);
  if (request.method === 'POST' && orderCommand) {
    const body = await readMarketJson(request);
    const current = await services.orders.getOrder(org, orderCommand[1]);
    const expected = body.expectedVersion ?? body.expected_version;
    if (!Number.isInteger(expected) || Number(expected) !== current.version) {
      throw new MarketHttpError('version_conflict', 409);
    }
    const result = orderCommand[2] === 'confirm'
      ? await services.orders.confirmOrder(org, orderCommand[1])
      : orderCommand[2] === 'cancel'
        ? await services.orders.cancelOrder(org, orderCommand[1])
        : await services.orders.completeOrder(org, orderCommand[1]);
    scheduleFlush(context, org.orgId, access.sellerStore!.id);
    return marketJson(result, requestId);
  }
  const reply = /^\/seller\/handoffs\/([^/]+)\/reply$/.exec(path);
  if (request.method === 'POST' && reply) {
    const body = await readMarketJson(request);
    const current = await services.handoff.getHandoff(org, reply[1]);
    const expected = body.expectedVersion ?? body.expected_version;
    if (!Number.isInteger(expected) || Number(expected) !== current.version) {
      throw new MarketHttpError('version_conflict', 409);
    }
    await services.handoff.startReply(
      { ...org, requestId: `${key}:start` },
      reply[1],
    );
    const result = await services.handoff.submitReply(org, body.reply);
    scheduleFlush(context, org.orgId, access.sellerStore!.id);
    return marketJson(result, requestId);
  }
  const inventory = /^\/seller\/inventory\/([^/]+)$/.exec(path);
  if (request.method === 'PUT' && inventory) {
    const body = await readMarketJson(request);
    const current = await services.orders.getInventory(org, inventory[1])
      .catch(() => null);
    const expected = body.expectedVersion ?? body.expected_version;
    if (
      current
      && (!Number.isInteger(expected) || Number(expected) !== current.version)
    ) {
      throw new MarketHttpError('version_conflict', 409);
    }
    return marketJson(
      await services.orders.setInventory(
        org,
        inventory[1],
        body.onHand ?? body.on_hand,
      ),
      requestId,
    );
  }
  if (request.method === 'POST' && path === '/seller/categories') {
    const body = await readMarketJson(request);
    return marketJson(
      await services.catalog.createCategory(
        { ...sellerOwner(context), requestId: key },
        { name: body.name, ...(body.sortOrder === undefined ? {} : { sortOrder: body.sortOrder }) },
      ),
      requestId,
      201,
    );
  }
  const category = /^\/seller\/categories\/([^/]+)$/.exec(path);
  if (request.method === 'PATCH' && category) {
    const body = await readMarketJson(request);
    return marketJson(
      await services.catalog.updateCategory(
        { ...sellerOwner(context), requestId: key },
        category[1],
        body.patch ?? body,
      ),
      requestId,
    );
  }
  if (request.method === 'POST' && path === '/seller/products') {
    const body = await readMarketJson(request);
    const product = await services.catalog.createProduct(
      { ...sellerOwner(context), requestId: key },
      body,
    );
    return marketJson(
      await productDto(
        product,
        null,
        access.sellerStore!.name,
        context.config.sessionSecret,
        context.claims.locale,
      ),
      requestId,
      201,
    );
  }
  const product = /^\/seller\/products\/([^/]+)$/.exec(path);
  if (request.method === 'PATCH' && product) {
    const body = await readMarketJson(request);
    const updated = await services.catalog.updateProduct(
      { ...sellerOwner(context), requestId: key },
      product[1],
      body.expectedVersion ?? body.expected_version,
      body.patch,
    );
    return marketJson(
      await productDto(
        updated,
        null,
        access.sellerStore!.name,
        context.config.sessionSecret,
        context.claims.locale,
      ),
      requestId,
    );
  }
  const productTransition = /^\/seller\/products\/([^/]+)\/(publish|unpublish|archive)$/.exec(path);
  if (request.method === 'POST' && productTransition) {
    const body = await readMarketJson(request);
    const owner = { ...sellerOwner(context), requestId: key };
    const version = body.expectedVersion ?? body.expected_version;
    const result = productTransition[2] === 'publish'
      ? await services.catalog.publishProduct(owner, productTransition[1], version)
      : productTransition[2] === 'unpublish'
        ? await services.catalog.unpublishProduct(owner, productTransition[1], version)
        : await services.catalog.archiveProduct(owner, productTransition[1], version);
    return marketJson(await productDto(
      result,
      null,
      access.sellerStore!.name,
      context.config.sessionSecret,
      context.claims.locale,
    ), requestId);
  }
  return null;
}

function mapUnknownError(error: unknown): MarketHttpError {
  if (error instanceof MarketHttpError) return error;
  if (error instanceof MarketInitDataError) {
    return new MarketHttpError('invalid_session', 401);
  }
  if (error instanceof MarketSessionError) {
    return new MarketHttpError(
      error.code === 'expired_session' ? 'expired_session' : 'invalid_session',
      401,
    );
  }
  const candidate = error as { name?: unknown; code?: unknown };
  const name = typeof candidate?.name === 'string' ? candidate.name : '';
  const code = typeof candidate?.code === 'string' ? candidate.code : '';
  if (code === 'idempotency_conflict') {
    return new MarketHttpError('idempotency_conflict', 409);
  }
  if (code === 'version_conflict') {
    return new MarketHttpError('version_conflict', 409);
  }
  if (code === 'not_found' || name.includes('NotFound')) {
    return new MarketHttpError('resource_not_found', 404);
  }
  if (code === 'authorization_failed' || name.includes('Authorization')) {
    return new MarketHttpError('seller_forbidden', 403);
  }
  if (name.includes('Validation')) {
    return new MarketHttpError('validation_failed', 400);
  }
  if (
    name.includes('State')
    || name.includes('Conflict')
    || name.includes('Expired')
    || name.includes('Inventory')
  ) {
    return new MarketHttpError('state_conflict', 409);
  }
  return new MarketHttpError('internal_error', 500);
}

export async function handleMarketRequest(input: {
  request: Request;
  env: Env;
  waitUntil?: (promise: Promise<unknown>) => void;
}): Promise<Response> {
  const requestId = marketRequestId();
  try {
    assertMarketOrigin(input.request, input.env);
    const config = configuration(input.env);
    const db = input.env.GPTBOT_DRAFTS_DB;
    if (!db) throw new MarketHttpError('feature_disabled', 503);
    const services = createSotuvchiApplicationServices(db, config.botUsername);
    const url = new URL(input.request.url);
    const path = currentPath(url);

    if (
      input.request.method === 'POST'
      && (path === '/session/exchange' || path === '/session/launch')
    ) {
      return await exchangeSession(
        input.request,
        input.env,
        services,
        config,
        requestId,
        undefined,
        path === '/session/launch',
      );
    }
    if (input.request.method === 'POST' && path === '/session/refresh') {
      const current = await verifyMarketSession(
        config.sessionSecret,
        bearerToken(input.request),
      );
      return await exchangeSession(
        input.request,
        input.env,
        services,
        config,
        requestId,
        current,
      );
    }
    const claims = await verifyMarketSession(
      config.sessionSecret,
      bearerToken(input.request),
    );
    if (input.request.method === 'POST' && path === '/session/locale') {
      requireIdempotencyKey(input.request);
      const body = await readMarketJson(input.request);
      if (body.locale !== 'ru' && body.locale !== 'uz') {
        throw new MarketHttpError('validation_failed', 400);
      }
      const storefront = await services.catalog.setStoredStorefrontLocale(
        config.botUsername,
        claims.sub,
        body.locale,
      ).catch(() => null);
      if (!storefront) {
        throw new MarketHttpError('storefront_unavailable', 409);
      }
      const issued = await issueMarketSession(config.sessionSecret, {
        sub: claims.sub,
        telegramId: claims.telegramId,
        locale: body.locale,
        launch: claims.launch,
      });
      return marketJson({
        token: issued.token,
        locale: body.locale,
        expiresAt: new Date(issued.claims.exp * 1_000).toISOString(),
      }, requestId);
    }
    if (input.request.method === 'DELETE' && path === '/session') {
      return new Response(null, {
        status: 204,
        headers: { 'Cache-Control': 'no-store', 'x-request-id': requestId },
      });
    }
    const access = await resolveMarketAccess(
      services,
      input.env,
      config.botUsername,
      claims,
      requestId,
    );
    const context: RequestContext = {
      request: input.request,
      env: input.env,
      services,
      config,
      claims,
      access,
      requestId,
      url,
      path,
      waitUntil: input.waitUntil,
    };
    const response = await readRoutes(context)
      ?? await voiceRoutes(context)
      ?? await comparisonCommands(context)
      ?? await checkoutCommands(context)
      ?? await sellerCommands(context);
    if (response) return response;
    if (input.request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }
    return marketError('resource_not_found', requestId, 404);
  } catch (error) {
    const mapped = mapUnknownError(error);
    if (mapped.status >= 500) {
      console.error(`market.api:internal_error:${requestId}`);
    }
    return marketError(mapped.code, requestId, mapped.status);
  }
}
