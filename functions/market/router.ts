import type { Env } from '../_types';
import type {
  CatalogProduct,
  CatalogSearchResult,
  ClassifiedCondition,
  ClassifiedListing,
  ClassifiedSellerType,
  ListingReportReason,
  StoreOwnerContext,
} from '../agents/sotuvchi';
import {
  CLASSIFIED_CONDITIONS,
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
  MarketUploadError,
  isStoredMediaReference,
  issueMediaHandle,
  marketError,
  marketFlag,
  marketJson,
  marketRequestId,
  mediaObjectKey,
  newMediaReference,
  proxyTelegramMedia,
  readImageUpload,
  readMarketJson,
  storedMediaResponse,
  requireIdempotencyKey,
  resolveMarketAccess,
  verifyMarketSession,
  verifyMediaHandle,
  verifyTelegramInitData,
  type MarketAccessContext,
  type MarketSessionClaims,
  type SotuvchiApplicationServices,
} from '.';
import {
  SellerBindingError,
  bindingCeremonyOpen,
  inspectSellerBindingChallenge,
  redeemSellerBindingChallenge,
} from '../platform/admin/seller-binding';
import {
  aiSearchAvailable,
  createMarketSearchFacade,
  resolveSearchIntentWithAi,
} from './search-ai';
import {
  buildCatalogVocabulary,
  cachedVocabulary,
  groundQueryInCatalog,
  rememberVocabulary,
} from './search-intent';
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

/**
 * Query bound for the seller's own lists.
 *
 * `boundedLimit` caps at twenty because that is a shopper's result page. The
 * seller is paging through their own queue, so the ceiling is the domain's page
 * size; the domain validates the value again before it reaches SQL.
 */
function sellerLimit(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new MarketHttpError('validation_failed', 400);
  }
  return parsed;
}

function classifiedPrice(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1_000_000_000_000) {
    throw new MarketHttpError('validation_failed', 400);
  }
  return parsed;
}

function classifiedCondition(value: string | null): ClassifiedCondition | undefined {
  if (value === null || value === '') return undefined;
  if (!CLASSIFIED_CONDITIONS.includes(value as ClassifiedCondition)) {
    throw new MarketHttpError('validation_failed', 400);
  }
  return value as ClassifiedCondition;
}

function classifiedSellerType(value: string | null): ClassifiedSellerType | undefined {
  if (value === null || value === '') return undefined;
  if (value !== 'private' && value !== 'store') {
    throw new MarketHttpError('validation_failed', 400);
  }
  return value;
}

function classifiedBody(
  body: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  if (
    Object.keys(body).some((key) => !allowed.has(key))
    || required.some((key) => !Object.hasOwn(body, key))
  ) {
    throw new MarketHttpError('validation_failed', 400);
  }
}

async function reporterSessionHash(
  secret: string,
  claims: MarketSessionClaims,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${claims.sub}:${claims.iat}:${claims.exp}:${claims.launch}`),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
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

/**
 * Product payload.
 *
 * `owner` carries the two fields the store owner edits but a shopper must never
 * receive: the seller's own search aliases, and specification labels in both
 * languages. It is attached only on `/seller/*` responses вЂ” a buyer card would
 * otherwise leak one store's keyword work to anyone who opens the catalog.
 */
async function productDto(
  product: CatalogProduct,
  categoryName: string | null,
  storeName: string,
  secret: string,
  locale: 'ru' | 'uz',
  owner = false,
) {
  return {
    ...(owner
      ? {
        owner: {
          // The raw references, so the editor can reorder and remove photos and
          // send the list back. Buyers only ever receive signed handles.
          mediaRefs: product.mediaRefs,
          searchTerms: product.searchTerms,
          specifications: product.specifications.map((specification) => ({
            key: specification.key,
            labelRu: specification.labelRu,
            labelUz: specification.labelUz,
            value: specification.value,
          })),
        },
      }
      : {}),
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

async function classifiedDto(
  listing: ClassifiedListing,
  secret: string,
) {
  const mediaCount = Number.isSafeInteger(listing.mediaCount)
    ? Math.min(5, Math.max(0, listing.mediaCount))
    : 0;
  return {
    id: listing.id,
    listingScope: listing.listingScope,
    name: listing.name,
    description: listing.description,
    priceMinor: listing.priceMinor,
    currency: listing.currency,
    availability: listing.availability,
    category: listing.category,
    condition: listing.condition,
    conditionLabel: listing.conditionLabel,
    location: listing.location,
    seller: listing.seller,
    contactMode: listing.contactMode,
    phoneDisclosure: listing.phoneDisclosure,
    commerceMode: listing.commerceMode,
    store: listing.store,
    updatedAt: listing.updatedAt,
    mediaHandles: await Promise.all(Array.from({ length: mediaCount }, (_, index) =>
      issueMediaHandle(secret, { productId: listing.id, index })
    )),
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
  /** The query the catalog actually received, in the catalog's own words. */
  queryApplied: string;
  /** `{ spoken -> catalog }` for every word the stem match rewrote. */
  rewrites: readonly { from: string; to: string }[];
  /** True when the model was asked to interpret the sentence. */
  aiAssisted: boolean;
}

/**
 * Reads the storefront's own vocabulary once per request.
 *
 * A shopper's sentence is grounded against real product names, seller aliases
 * and category names rather than against a hand-written word list, because no
 * such list survives Russian and Uzbek morphology: the catalog stores
 * В«Р‘Р»РѕРєРЅРѕС‚В» and the shopper says В«Р±Р»РѕРєРЅРѕС‚РѕРІВ».
 */
async function storefrontVocabulary(context: RequestContext) {
  const storeId = context.access.buyer.storeId;
  const now = Date.now();
  const cached = cachedVocabulary(storeId, now);
  if (cached) return cached;
  const [entries, categories] = await Promise.all([
    context.services.catalog.listStorefrontVocabulary(context.access.buyer)
      .catch(() => []),
    context.services.catalog.listBuyerCategories(context.access.buyer)
      .catch(() => []),
  ]);
  const vocabulary = buildCatalogVocabulary({
    terms: entries.flatMap((entry) => [entry.name, ...entry.searchTerms]),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
    })),
  });
  if (vocabulary.words.length > 0) rememberVocabulary(storeId, vocabulary, now);
  return vocabulary;
}

/**
 * The single catalog search path. Typed search and voice search both land
 * here, so voice can never reach products that the typed search would not
 * return: ranking, tenant scope and publication state stay untouched, and the
 * extra constraints are applied to the ranked rows only.
 *
 * Understanding happens in two steps, cheapest first:
 *
 * 1. **The catalog's own words.** Each token is matched against real product,
 *    alias and category words by stem, so В«Р±Р»РѕРєРЅРѕС‚РѕРІВ» searches В«Р±Р»РѕРєРЅРѕС‚В» and
 *    В«СЃР»СѓС€Р°Р№, РјРѕР¶РµС€СЊ РґР°С‚СЊВ» disappears вЂ” not because those words are on a list,
 *    but because no product contains them. Most sentences stop here, with no
 *    model call and no added latency.
 * 2. **Meaning.** Only when nothing grounded вЂ” В«С‡С‚Рѕ-РЅРёР±СѓРґСЊ С‡С‚РѕР±С‹ Р·Р°РїРёСЃС‹РІР°С‚СЊВ» вЂ”
 *    is the model asked to map the sentence onto that same vocabulary, and its
 *    answer is intersected with the vocabulary before anything is searched. It
 *    may choose among the store's products; it cannot add to them.
 */
async function runCatalogSearch(
  context: RequestContext,
  input: CatalogSearchInput,
): Promise<CatalogSearchOutcome> {
  let queryApplied = '';
  let rewrites: readonly { from: string; to: string }[] = [];
  let aiAssisted = false;
  let availability = input.availability;
  let maxPriceMinor = input.maxPriceMinor;

  if (input.query) {
    const vocabulary = await storefrontVocabulary(context);
    const grounded = groundQueryInCatalog(input.query, vocabulary);
    queryApplied = grounded.query;
    rewrites = grounded.rewrites;

    if (!grounded.grounded && aiSearchAvailable(context.env)) {
      const intent = await resolveSearchIntentWithAi(
        createMarketSearchFacade(context.env),
        input.query,
        vocabulary,
      );
      if (intent) {
        aiAssisted = true;
        queryApplied = intent.query;
        if (availability === null) availability = intent.availability;
        if (maxPriceMinor === null) maxPriceMinor = intent.maxPriceMinor;
      }
    }

    // Nothing in the catalog and nothing the model could place: search the
    // sentence as reduced. It finds nothing, which is the honest answer вЂ”
    // falling through to a full listing would read as a match.
    if (!queryApplied) queryApplied = reduceSearchQuery(input.query).query;
  }

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
  if (availability) {
    results = results.filter(
      (item) => item.product.availability === availability,
    );
  }
  if (maxPriceMinor !== null) {
    const ceiling = maxPriceMinor;
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
  return { results, queryApplied, rewrites, aiAssisted };
}

/**
 * The tabs the shopper actually gets.
 *
 * Reported rather than assumed, so the two bootstrap payloads and the client
 * cannot drift into describing different shells. The cabinet layout folds the
 * old "orders" tab into "cabinet" and spends the freed slot on the supply side.
 * Comparison stops being a destination: the tray that appears once something is
 * in it still opens the screen, so the tab was the only part that had to go.
 */
function buyerNavigation(env: Env): string[] {
  return marketFlag(env.MARKET_CABINET_ENABLED)
    ? ['home', 'search', 'publish', 'cabinet']
    : ['home', 'search', 'compare', 'orders'];
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
    navigation: buyerNavigation(context.env),
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
      mediaUpload: context.access.sellerOrg !== null
        && marketFlag(context.env.MARKET_MINI_APP_SELLER_COMMANDS_ENABLED)
        && mediaUploadAvailable(context.env),
      cabinet: marketFlag(context.env.MARKET_CABINET_ENABLED),
      cabinetHomeV2: marketFlag(context.env.MARKET_CABINET_HOME_V2),
      navBack: marketFlag(context.env.MARKET_NAV_BACK_ENABLED),
      quickPost: marketFlag(context.env.MARKET_QUICKPOST_ENABLED),
      quickPostAi: marketFlag(context.env.MARKET_QUICKPOST_AI_ENABLED),
      classifiedsDiscovery: marketFlag(context.env.MARKET_CLASSIFIEDS_DISCOVERY_ENABLED),
      privateListing: marketFlag(context.env.MARKET_PRIVATE_LISTING_ENABLED),
      // Whether the binding row is worth offering. Presentation only: it decides
      // whether a person can find the screen, never what the screen may do. Both
      // binding endpoints re-read the same switch, so a client that sets this by
      // hand reaches the same 404 it would have reached anyway.
      ownerTelegramBinding: bindingCeremonyOpen(context.env, new Date()),
    },
    storefront: { id: context.access.buyer.storeId, state: 'active' },
    counters: {
      orders: orders.length,
      activeCheckout: activeCheckout !== null,
      activeHandoff: activeHandoff !== null,
    },
  };
}

/**
 * Classifieds discovery is global, so a buyer must not need a legacy pilot
 * storefront just to open the public catalogue. This payload is deliberately
 * smaller than the store bootstrap: no synthetic store, seller authority,
 * order counters or media capability are inferred when no store was resolved.
 */
function globalClassifiedsBootstrapPayload(
  env: Env,
  claims: MarketSessionClaims,
) {
  return {
    apiVersion: 'market-v1',
    buildId: env.MARKET_MINI_APP_BUILD_ID ?? 'local',
    locale: claims.locale,
    navigation: ['home', 'search', 'saved', 'activity'],
    sellerNavigation: [],
    flags: {
      buyer: true,
      sellerRead: false,
      sellerCommands: false,
      voice: voiceSearchAvailable(env),
      mediaUpload: false,
      cabinet: marketFlag(env.MARKET_CABINET_ENABLED),
      cabinetHomeV2: marketFlag(env.MARKET_CABINET_HOME_V2),
      navBack: marketFlag(env.MARKET_NAV_BACK_ENABLED),
      quickPost: marketFlag(env.MARKET_QUICKPOST_ENABLED),
      quickPostAi: marketFlag(env.MARKET_QUICKPOST_AI_ENABLED),
      classifiedsDiscovery: marketFlag(env.MARKET_CLASSIFIEDS_DISCOVERY_ENABLED),
      privateListing: marketFlag(env.MARKET_PRIVATE_LISTING_ENABLED),
      ownerTelegramBinding: bindingCeremonyOpen(env, new Date()),
    },
    storefront: null,
    counters: {
      orders: 0,
      activeCheckout: false,
      activeHandoff: false,
    },
  };
}

function globalClassifiedsFallback(error: unknown, env: Env): boolean {
  return marketFlag(env.MARKET_CLASSIFIEDS_DISCOVERY_ENABLED)
    && error instanceof MarketHttpError
    && error.code === 'storefront_unavailable';
}

function launchBootstrapPayload(context: RequestContext) {
  return {
    apiVersion: 'market-v1',
    buildId: context.env.MARKET_MINI_APP_BUILD_ID ?? 'local',
    locale: context.claims.locale,
    navigation: buyerNavigation(context.env),
    sellerNavigation: [],
    flags: {
      buyer: true,
      sellerRead: false,
      sellerCommands: false,
      voice: voiceSearchAvailable(context.env),
      mediaUpload: context.access.sellerOrg !== null
        && marketFlag(context.env.MARKET_MINI_APP_SELLER_COMMANDS_ENABLED)
        && mediaUploadAvailable(context.env),
      cabinet: marketFlag(context.env.MARKET_CABINET_ENABLED),
      cabinetHomeV2: marketFlag(context.env.MARKET_CABINET_HOME_V2),
      navBack: marketFlag(context.env.MARKET_NAV_BACK_ENABLED),
      quickPost: marketFlag(context.env.MARKET_QUICKPOST_ENABLED),
      quickPostAi: marketFlag(context.env.MARKET_QUICKPOST_AI_ENABLED),
      classifiedsDiscovery: marketFlag(context.env.MARKET_CLASSIFIEDS_DISCOVERY_ENABLED),
      privateListing: marketFlag(context.env.MARKET_PRIVATE_LISTING_ENABLED),
      // Whether the binding row is worth offering. Presentation only: it decides
      // whether a person can find the screen, never what the screen may do. Both
      // binding endpoints re-read the same switch, so a client that sets this by
      // hand reaches the same 404 it would have reached anyway.
      ownerTelegramBinding: bindingCeremonyOpen(context.env, new Date()),
    },
    storefront: { id: context.access.buyer.storeId, state: 'active' },
    counters: {
      orders: 0,
      activeCheckout: false,
      activeHandoff: false,
    },
  };
}

/** Rows on the opening shelf. One number, so the speculative read matches it. */
const HOME_PRODUCTS = 12;

async function catalogHomePayload(context: RequestContext) {
  const [categories, results] = await Promise.all([
    context.services.catalog.listBuyerCategories(context.access.buyer),
    context.services.catalog.listPublishedProducts(context.access.buyer, HOME_PRODUCTS),
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
  // Phase marks for Server-Timing. Durations only вЂ” no identity, no content.
  const started = Date.now();
  const marks: Record<string, number> = {};
  const mark = (name: string, from: number) => {
    marks[name] = Date.now() - from;
  };
  const body = await readMarketJson(request, 9_216);
  const raw = sessionBody(body);
  await enforceMarketRateLimit(
    'exchange',
    `${request.headers.get('CF-Connecting-IP') ?? 'unknown'}:${raw.slice(-96)}`,
  );
  const verifyStart = Date.now();
  const init = await verifyTelegramInitData(raw, config.botToken);
  mark('verify', verifyStart);
  if (current && current.telegramId !== init.user.id) {
    throw new MarketHttpError('invalid_session', 401);
  }
  // The launch used to cross the ocean three times in a row: create the
  // identity, bind the storefront to it, then read that storefront's shelf.
  // Only the middle step actually needs the identity. Which storefront a fresh
  // launch lands on depends on the bot, and what is on its shelf depends on the
  // storefront вЂ” so both can be read while the identity is still being created.
  //
  // Speculative and discardable: the answer is used only if the storefront the
  // launch really resolved to is the same one, and both promises swallow their
  // own failures so a miss costs the old path and never the request.
  const directAhead = includeLaunch
    ? services.onboarding.resolveDirectPilotStorefront(config.botUsername)
      .catch(() => null)
    : undefined;
  const shelfAhead = directAhead?.then(async (direct) => {
    if (!direct) return null;
    const storefront = {
      orgId: direct.orgId,
      storeId: direct.storeId,
      agentId: 'sotuvchi' as const,
      locale: init.locale,
    };
    const [categories, results] = await Promise.all([
      services.catalog.listBuyerCategories(storefront),
      services.catalog.listPublishedProducts(storefront, HOME_PRODUCTS),
    ]);
    return { orgId: direct.orgId, storeId: direct.storeId, categories, results };
  }).catch(() => null);
  const identityStart = Date.now();
  const identity = await services.identities.getOrCreateIdentity(
    'telegram',
    init.user.id,
  );
  mark('identity', identityStart);
  if (current && current.sub !== identity.identity.id) {
    throw new MarketHttpError('invalid_session', 401);
  }
  const bindStart = Date.now();
  const boundBuyer = await bindMarketLaunch(
    services,
    config.botUsername,
    identity.identity.id,
    init,
    directAhead,
  );
  mark('bind', bindStart);
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
  ).catch((error: unknown) => {
    if (globalClassifiedsFallback(error, env)) return null;
    throw error;
  });
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
      sellerRead: access !== null && access.sellerOrg !== null,
      sellerCommands:
        access !== null
        && access.sellerOrg !== null
        && marketFlag(env.MARKET_MINI_APP_SELLER_COMMANDS_ENABLED),
    },
    storefront: access
      ? { id: access.buyer.storeId, locale: access.buyer.locale }
      : null,
  };
  if (!includeLaunch) return marketJson(session, requestId, 201);
  if (!access) {
    mark('shelf', Date.now());
    mark('total', started);
    const response = marketJson({
      session,
      bootstrap: globalClassifiedsBootstrapPayload(env, issued.claims),
      home: { categories: [], products: [], updatedAt: new Date().toISOString() },
    }, requestId, 201);
    response.headers.set('Server-Timing', [
      ...Object.entries(marks).map(([name, value]) => `${name};dur=${value}`),
      'shelfhit;desc="global"',
    ].join(', '));
    response.headers.set('Access-Control-Expose-Headers', 'Server-Timing, x-request-id');
    return response;
  }
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
  const shelfStart = Date.now();
  const shelf = shelfAhead ? await shelfAhead : null;
  // Reused only when it is the same shelf. Signing the media handles is local
  // work, so it stays here rather than in the speculative read.
  const reusable = shelf
    && shelf.orgId === access.buyer.orgId
    && shelf.storeId === access.buyer.storeId
    ? shelf
    : null;
  const home = reusable
    ? {
      categories: reusable.categories,
      products: await resultDtos(reusable.results, context),
      updatedAt: new Date().toISOString(),
    }
    : await catalogHomePayload(context);
  mark('shelf', shelfStart);
  mark('total', started);
  const response = marketJson({ session, bootstrap, home }, requestId, 201);
  // Durations only, so the owner can say which half is slow instead of "РґРѕР»РіРѕ".
  // Nothing here identifies a person, a store or a query.
  response.headers.set('Server-Timing', [
    ...Object.entries(marks).map(([name, value]) => `${name};dur=${value}`),
    `shelfhit;desc="${reusable ? 'ahead' : 'late'}"`,
  ].join(', '));
  response.headers.set('Access-Control-Expose-Headers', 'Server-Timing, x-request-id');
  return response;
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

async function classifiedsRoutes(context: {
  request: Request;
  env: Env;
  services: SotuvchiApplicationServices;
  config: MarketConfiguration;
  claims: MarketSessionClaims;
  requestId: string;
  url: URL;
  path: string;
}): Promise<Response | null> {
  const { request, env, services, config, claims, requestId, url, path } = context;
  if (!path.startsWith('/classifieds')) return null;
  if (path.startsWith('/classifieds/private')) {
    if (!marketFlag(env.MARKET_PRIVATE_LISTING_ENABLED)) {
      return marketError('resource_not_found', requestId, 404);
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (request.method !== 'POST') return marketError('resource_not_found', requestId, 404);
    await enforceMarketRateLimit('command', `${claims.sub}:${path}`);
    const idempotencyKey = requireIdempotencyKey(request);
    const seller = {
      identityId: claims.sub,
      requestId,
      idempotencyKey,
    };
    const body = await readMarketJson(request);
    if (path === '/classifieds/private/profile') {
      classifiedBody(body, ['displayName']);
      return marketJson({
        profile: await services.classifieds.createPrivateSellerProfile(
          seller,
          body.displayName,
        ),
      }, requestId, 201);
    }
    if (path === '/classifieds/private/listings') {
      classifiedBody(body, [
        'name', 'priceMinor', 'currency', 'mediaRefs', 'globalCategoryId',
        'condition', 'regionId', 'districtId', 'contactMode',
      ], ['description', 'localityText']);
      return marketJson({
        listing: await services.classifieds.submitPrivateListing(seller, {
          name: body.name as string,
          description: body.description as string | null | undefined,
          priceMinor: body.priceMinor as number,
          currency: body.currency as 'UZS',
          mediaRefs: body.mediaRefs as string[],
          globalCategoryId: body.globalCategoryId as string,
          condition: body.condition as ClassifiedCondition,
          regionId: body.regionId as string,
          districtId: body.districtId as string,
          localityText: body.localityText as string | null | undefined,
          contactMode: body.contactMode as ClassifiedListing['contactMode'],
        }),
      }, requestId, 201);
    }
    return marketError('resource_not_found', requestId, 404);
  }
  if (!marketFlag(env.MARKET_CLASSIFIEDS_DISCOVERY_ENABLED)) {
    return marketError('resource_not_found', requestId, 404);
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method === 'POST' && path === '/classifieds/voice/search') {
    assertVoiceSearchEnabled(env);
    await enforceMarketRateLimit('voice', `${claims.sub}:classifieds-voice`);
    const audio = await readVoiceAudio(request);
    const transcription = await transcribeVoiceSearch(
      createMarketVoiceFacade(env),
      audio,
    );
    const categories = await services.classifieds.listCategories();
    const voiceCategories = categories.flatMap((category) => [
      { id: category.id, name: category.nameRu, productCount: category.visibleListingCount },
      { id: category.id, name: category.nameUz, productCount: category.visibleListingCount },
    ]);
    const interpretation = interpretVoiceTranscript(
      transcription.transcript,
      voiceCategories,
    );
    const page = interpretation.productQuery
      ? await services.classifieds.discover({
          query: interpretation.productQuery,
          categoryId: interpretation.category?.id,
          availability: interpretation.availability ?? undefined,
          maxPriceMinor: interpretation.maxPriceMinor ?? undefined,
          limit: boundedLimit(url.searchParams.get('limit')),
        })
      : { items: [] as ClassifiedListing[], nextCursor: null };
    return marketJson({
      transcript: transcription.transcript,
      language: transcription.language,
      interpretation,
      items: await Promise.all(page.items.map((item) =>
        classifiedDto(item, config.sessionSecret)
      )),
      nextCursor: page.nextCursor,
      queryApplied: interpretation.productQuery || null,
    }, requestId);
  }
  const reportMatch = /^\/classifieds\/listings\/([^/]+)\/reports$/.exec(path);
  if (request.method === 'POST' && reportMatch) {
    await enforceMarketRateLimit('command', `${claims.sub}:${path}`);
    const idempotencyKey = requireIdempotencyKey(request);
    const body = await readMarketJson(request);
    classifiedBody(body, ['reason'], ['note']);
    return marketJson({
      report: await services.classifieds.submitListingReport({
        identityId: claims.sub,
        requestId,
        idempotencyKey,
        reporterSessionHash: await reporterSessionHash(config.sessionSecret, claims),
      }, reportMatch[1], {
        reason: body.reason as ListingReportReason,
        note: body.note as string | null | undefined,
      }),
    }, requestId, 201);
  }
  const favoriteMatch = /^\/classifieds\/listings\/([^/]+)\/favorite$/.exec(path);
  if (favoriteMatch && (request.method === 'POST' || request.method === 'DELETE')) {
    await enforceMarketRateLimit('command', `${claims.sub}:classifieds-favorite`);
    if (request.method === 'POST') requireIdempotencyKey(request);
    const favorite = request.method === 'POST'
      ? await services.classifieds.saveFavorite(claims.sub, favoriteMatch[1])
      : await services.classifieds.removeFavorite(claims.sub, favoriteMatch[1]);
    return marketJson({ favorite }, requestId);
  }
  const inquiryMatch = /^\/classifieds\/listings\/([^/]+)\/inquiries$/.exec(path);
  if (request.method === 'POST' && inquiryMatch) {
    await enforceMarketRateLimit('command', `${claims.sub}:classifieds-inquiry`);
    const idempotencyKey = requireIdempotencyKey(request);
    const body = await readMarketJson(request);
    classifiedBody(body, ['message']);
    return marketJson({
      inquiry: await services.classifieds.createInquiry({
        identityId: claims.sub,
        requestId,
        idempotencyKey,
      }, inquiryMatch[1], { message: body.message as string }),
    }, requestId, 201);
  }
  if (request.method !== 'GET') return marketError('resource_not_found', requestId, 404);
  await enforceMarketRateLimit('read', `${claims.sub}:${path}`);

  if (path === '/classifieds/categories') {
    return marketJson({
      items: await services.classifieds.listCategories(),
      nextCursor: null,
    }, requestId);
  }
  if (path === '/classifieds/locations') {
    return marketJson({
      items: await services.classifieds.listLocations(),
      nextCursor: null,
    }, requestId);
  }
  if (path === '/classifieds/listings') {
    const page = await services.classifieds.discover({
      categoryId: url.searchParams.get('categoryId') ?? undefined,
      regionId: url.searchParams.get('regionId') ?? undefined,
      districtId: url.searchParams.get('districtId') ?? undefined,
      condition: classifiedCondition(url.searchParams.get('condition')),
      sellerType: classifiedSellerType(url.searchParams.get('sellerType')),
      availability: parseAvailabilityFilter(url.searchParams.get('availability')) ?? undefined,
      storeId: url.searchParams.get('storeId') ?? undefined,
      minPriceMinor: classifiedPrice(url.searchParams.get('minPriceMinor')),
      maxPriceMinor: classifiedPrice(url.searchParams.get('maxPriceMinor')),
      query: url.searchParams.get('q') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: boundedLimit(url.searchParams.get('limit')),
    });
    return marketJson({
      items: await Promise.all(page.items.map((item) =>
        classifiedDto(item, config.sessionSecret)
      )),
      nextCursor: page.nextCursor,
    }, requestId);
  }
  if (path === '/classifieds/favorites') {
    const page = await services.classifieds.listFavorites(claims.sub);
    return marketJson({
      items: await Promise.all(page.items.map((item) =>
        classifiedDto(item, config.sessionSecret)
      )),
      nextCursor: null,
    }, requestId);
  }
  if (path === '/classifieds/inquiries') {
    return marketJson({
      items: await services.classifieds.listBuyerInquiries(claims.sub),
      nextCursor: null,
    }, requestId);
  }
  const listingMatch = /^\/classifieds\/listings\/([^/]+)$/.exec(path);
  if (listingMatch) {
    const item = await services.classifieds.getPublished(listingMatch[1]);
    return marketJson(await classifiedDto(item, config.sessionSecret), requestId);
  }
  return marketError('resource_not_found', requestId, 404);
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
      // What ran, not what was typed: В«РњРЅРµ РЅСѓР¶РµРЅ Р±Р»РѕРєРЅРѕС‚В» searches В«Р±Р»РѕРєРЅРѕС‚В».
      queryApplied: search.queryApplied || null,
      maxPriceMinorApplied: maxPriceMinor,
      aiAssisted: search.aiAssisted,
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
    if (!reference || !product) throw new MarketHttpError('resource_not_found', 404);
    // A stored image is addressed through the product that owns it, so the key
    // is built from that product's org and store rather than from anything the
    // caller supplied.
    if (isStoredMediaReference(reference)) {
      const key = mediaObjectKey(product.orgId, product.storeId, reference);
      const object = key && context.env.MARKET_MEDIA
        ? await context.env.MARKET_MEDIA.get(key)
        : null;
      if (!object) throw new MarketHttpError('resource_not_found', 404);
      const stored = storedMediaResponse(
        object.body,
        object.httpMetadata?.contentType ?? '',
      );
      stored.headers.set('x-request-id', requestId);
      return stored;
    }
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
    if (path === '/seller/overview') {
      return marketJson(await sellerOverview(context), requestId);
    }
    if (path === '/seller/stats') {
      return marketJson(await services.stats.getStats(access.sellerOrg), requestId);
    }
    if (path === '/seller/orders') {
      const page = await services.orders.listOrderPage(access.sellerOrg, {
        limit: sellerLimit(url.searchParams.get('limit'), 20),
        status: url.searchParams.get('status') ?? undefined,
        cursor: url.searchParams.get('cursor') ?? undefined,
      });
      return marketJson({
        items: page.items,
        nextCursor: page.nextCursor,
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
          sellerLimit(url.searchParams.get('limit'), 10),
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
        limit: sellerLimit(url.searchParams.get('limit'), 50),
      });
      return marketJson({
        items: await Promise.all(products.map((product) => productDto(
          product,
          null,
          access.sellerStore!.name,
          context.config.sessionSecret,
          context.claims.locale,
          true,
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
          true,
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
 * screen. The transcript is always returned вЂ” including when nothing matched вЂ”
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
    : {
        results: [] as readonly CatalogSearchResult[],
        queryApplied: '',
        rewrites: [] as readonly { from: string; to: string }[],
          aiAssisted: false,
      };
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
    aiAssisted: search.aiAssisted,
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

/**
 * Photo upload is available only when the switch is on AND the bucket is bound.
 *
 * Same discipline as the microphone: a control that cannot work must not look
 * like it can, so the capability is reported to the client rather than
 * discovered by the seller when the upload fails.
 */
function mediaUploadAvailable(env: Env): boolean {
  return marketFlag(env.MARKET_SELLER_MEDIA_UPLOAD_ENABLED)
    && Boolean(env.MARKET_MEDIA);
}

/**
 * Stores one seller photo and returns the reference the catalog will hold.
 *
 * The object is written before it belongs to any product: the seller is still
 * filling the form, and a photo that only existed after "Save" would be lost by
 * every abandoned draft. The reference is unguessable and the key is scoped to
 * the store, so an object nobody attaches is unreachable rather than public.
 */
async function sellerMediaUpload(context: RequestContext): Promise<Response> {
  const { request, env, access, requestId } = context;
  requireSellerCommands(context);
  if (!mediaUploadAvailable(env)) {
    throw new MarketHttpError('feature_disabled', 503);
  }
  requireIdempotencyKey(request);
  await enforceMarketRateLimit('command', `${context.claims.sub}:media`);
  let upload;
  try {
    upload = await readImageUpload(request);
  } catch (error) {
    if (error instanceof MarketUploadError) {
      throw new MarketHttpError(
        error.code === 'payload_too_large' ? 'payload_too_large' : 'validation_failed',
        error.code === 'payload_too_large' ? 413 : 400,
      );
    }
    throw error;
  }
  const reference = newMediaReference();
  const key = mediaObjectKey(
    access.sellerOrg!.orgId,
    access.sellerStore!.id,
    reference,
  );
  if (!key) throw new MarketHttpError('validation_failed', 400);
  await env.MARKET_MEDIA!.put(key, upload.bytes, {
    httpMetadata: { contentType: upload.contentType },
    customMetadata: {
      orgId: access.sellerOrg!.orgId,
      storeId: access.sellerStore!.id,
    },
  });
  return marketJson({ ref: reference, contentType: upload.contentType }, requestId, 201);
}

/** A confirmed order older than this has stopped being progress. */
const SELLER_SLA_HOURS = 24;
/** Rows shown inside one attention group; the count above it stays honest. */
const OVERVIEW_PREVIEW = 5;
/** Read depth per group. Anything past it is reported as truncated, not hidden. */
const OVERVIEW_SCAN = 50;

function minutesSince(iso: string, now: number): number {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : Math.max(0, Math.round((now - parsed) / 60_000));
}

/**
 * `truncated` reports the read depth, not the filtered result: a group can be
 * short after filtering and still be incomplete because the scan behind it was
 * full. Reporting it the other way would turn a partial read into a confident
 * "that is all of them".
 */
function attentionGroup<T>(rows: readonly T[], scanned: number, scan: number) {
  return {
    count: rows.length,
    truncated: scanned >= scan,
    items: rows.slice(0, OVERVIEW_PREVIEW),
  };
}

/**
 * The seller's day, ordered by what is going wrong.
 *
 * Every group is derived from the same services the detail screens read, so the
 * home screen can never claim work that the queue behind it does not have. The
 * counts are bounded by an explicit scan depth and each group says whether it
 * hit that depth: a truncated group is stated, never rounded into a smaller
 * number that would read as "all clear".
 */
async function sellerOverview(context: RequestContext) {
  const { services, access } = context;
  const owner = sellerOwner(context);
  const now = Date.now();
  const [stats, placed, confirmed, handoffs, products, inventory] = await Promise.all([
    services.stats.getStats(access.sellerOrg!),
    services.orders.listOrderPage(access.sellerOrg!, {
      limit: OVERVIEW_SCAN,
      status: 'placed',
    }),
    services.orders.listOrderPage(access.sellerOrg!, {
      limit: OVERVIEW_SCAN,
      status: 'confirmed',
    }),
    services.handoff.listHandoffs(access.sellerOrg!, OVERVIEW_SCAN),
    services.catalog.listProducts(owner, { limit: 100 }),
    services.orders.listInventory(access.sellerOrg!, OVERVIEW_SCAN),
  ]);

  const stock = new Map(inventory.map((item) => [item.productId, item]));
  const published = products.filter((product) => product.status === 'published');
  const slaCutoff = now - SELLER_SLA_HOURS * 60 * 60_000;

  const newOrders = placed.items.map((order) => ({
    ...order,
    ageMinutes: minutesSince(order.placedAt, now),
  }));
  const agingOrders = confirmed.items
    .filter((order) => Date.parse(order.placedAt) < slaCutoff)
    .map((order) => ({ ...order, ageMinutes: minutesSince(order.placedAt, now) }));
  const openQuestions = handoffs
    .filter((handoff) => handoff.status === 'open')
    .map((handoff) => ({
      id: handoff.id,
      reason: handoff.reason,
      createdAt: handoff.createdAt,
      ageMinutes: minutesSince(handoff.createdAt, now),
    }));
  const outOfStock = published
    .filter((product) => stock.get(product.id)?.onHand === 0)
    .map((product) => ({
      productId: product.id,
      productName: product.name,
      version: stock.get(product.id)!.version,
    }));
  const drafts = products
    .filter((product) => product.status === 'draft')
    .map((product) => ({
      id: product.id,
      name: product.name,
      priceMinor: product.priceMinor,
      version: product.version,
    }));
  const weakProducts = published
    .map((product) => ({
      id: product.id,
      name: product.name,
      version: product.version,
      issues: [
        ...(product.mediaRefs.length === 0 ? ['no_media'] : []),
        ...(product.description ? [] : ['no_description']),
        ...(product.specifications.length === 0 ? ['no_specifications'] : []),
        ...(product.searchTerms.length === 0 ? ['no_search_terms'] : []),
      ],
    }))
    .filter((product) => product.issues.length > 0);

  return {
    store: { id: access.sellerStore!.id, name: access.sellerStore!.name },
    generatedAt: new Date(now).toISOString(),
    attention: {
      newOrders: attentionGroup(newOrders, placed.items.length, OVERVIEW_SCAN),
      agingOrders: attentionGroup(agingOrders, confirmed.items.length, OVERVIEW_SCAN),
      openQuestions: attentionGroup(openQuestions, handoffs.length, OVERVIEW_SCAN),
      outOfStock: attentionGroup(outOfStock, inventory.length, OVERVIEW_SCAN),
      drafts: attentionGroup(drafts, products.length, 100),
      weakProducts: attentionGroup(weakProducts, products.length, 100),
    },
    slaHours: SELLER_SLA_HOURS,
    stats,
  };
}

/**
 * Spends an owner-minted challenge on the identity that authenticated this call.
 *
 * `POST /identity/seller-binding`
 *
 * The Telegram half of the handshake, and the one route in this file that a
 * person without seller authority is allowed to reach — granting that authority
 * is the entire point, so requiring it first would be a locked door with its key
 * inside. Everything else still holds: the session was built from `initData`
 * Telegram itself signed, and the identity bound is `claims.sub` from that
 * session. Nothing in the body names a person, an organization or a store.
 */
async function bindingCommands(context: RequestContext): Promise<Response | null> {
  const { request, path, env, claims, requestId } = context;
  if (path !== '/identity/seller-binding' && path !== '/identity/seller-binding/inspect') {
    return null;
  }
  if (request.method !== 'POST') return null;
  // Off, the route answers exactly as an unknown path does. Open covers both
  // the global switch and an owner-only canary window; neither of them lets a
  // caller in on its own, because what is behind this door is a challenge that
  // has to be held, not a permission that has to be granted.
  if (!bindingCeremonyOpen(env, new Date())) return null;
  if (!env.GPTBOT_DRAFTS_DB) throw new MarketHttpError('storefront_unavailable', 503);
  // A challenge is 32 random bytes; guessing is not a threat, but grinding the
  // endpoint should still cost something.
  await enforceMarketRateLimit('command', `${claims.sub}:seller-binding`);
  const body = await readMarketJson(request);

  // The look-up half. It answers "what would this code bind me to" so the
  // confirmation can name a store, and it changes nothing: a person who decides
  // not to go through with it still holds an unspent challenge.
  if (path === '/identity/seller-binding/inspect') {
    try {
      const inspected = await inspectSellerBindingChallenge(
        env,
        env.GPTBOT_DRAFTS_DB,
        claims.sub,
        body.challenge,
        new Date(),
      );
      return marketJson({ storeName: inspected.storeName }, requestId);
    } catch (error) {
      if (error instanceof SellerBindingError) throw redeemFailure(error);
      throw error;
    }
  }

  try {
    const result = await redeemSellerBindingChallenge(
      env,
      env.GPTBOT_DRAFTS_DB,
      claims.sub,
      body.challenge,
      requestId,
      new Date(),
    );
    // Capabilities and a store name. No identity id, no org id, no store id.
    return marketJson({
      sellerRead: result.sellerRead,
      sellerCommands: result.sellerCommands,
      storeName: result.storeName,
      alreadyBound: result.alreadyBound,
    }, requestId);
  } catch (error) {
    if (error instanceof SellerBindingError) {
      throw redeemFailure(error);
    }
    throw error;
  }
}

/**
 * Collapse a binding failure into the market's closed error vocabulary.
 *
 * Every challenge outcome answers the same way. Telling the caller apart —
 * unknown, expired, already spent — hands somebody grinding the endpoint a way
 * to learn which codes ever existed, and the person legitimately redeeming has
 * the owner on the other end of the conversation to ask instead.
 */
function redeemFailure(error: SellerBindingError): MarketHttpError {
  switch (error.code) {
    case 'rate_limited':
      return new MarketHttpError('rate_limited', 429);
    case 'store_unavailable':
    case 'store_ambiguous':
      return new MarketHttpError('storefront_unavailable', 409);
    case 'membership_disabled':
    case 'membership_conflict':
    case 'identity_unsupported':
      return new MarketHttpError('state_conflict', 409);
    case 'persistence_failed':
      return new MarketHttpError('internal_error', 500);
    default:
      return new MarketHttpError('validation_failed', 400);
  }
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

  const discard = /^\/seller\/media\/(r2\.[a-z2-7]{16})$/.exec(path);
  if (request.method === 'DELETE' && discard) {
    const key = mediaObjectKey(
      access.sellerOrg!.orgId,
      access.sellerStore!.id,
      discard[1],
    );
    if (key && context.env.MARKET_MEDIA) {
      await context.env.MARKET_MEDIA.delete(key);
    }
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store', 'x-request-id': requestId },
    });
  }

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
        true,
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
        true,
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
      true,
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
  if (name === 'ClassifiedsSchemaError') {
    return new MarketHttpError('feature_disabled', 503);
  }
  if (code === 'idempotency_conflict') {
    return new MarketHttpError('idempotency_conflict', 409);
  }
  if (code === 'rate_limited') {
    return new MarketHttpError('rate_limited', 429);
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
      if (!storefront && !marketFlag(input.env.MARKET_CLASSIFIEDS_DISCOVERY_ENABLED)) {
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
    const classifiedsResponse = await classifiedsRoutes({
      request: input.request,
      env: input.env,
      services,
      config,
      claims,
      requestId,
      url,
      path,
    });
    if (classifiedsResponse) return classifiedsResponse;
    const access = await resolveMarketAccess(
      services,
      input.env,
      config.botUsername,
      claims,
      requestId,
    ).catch((error: unknown) => {
      if (
        input.request.method === 'GET'
        && path === '/bootstrap'
        && globalClassifiedsFallback(error, input.env)
      ) {
        return null;
      }
      throw error;
    });
    if (!access) {
      return marketJson(globalClassifiedsBootstrapPayload(input.env, claims), requestId);
    }
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
      // Raw-body route: it must run before the JSON command dispatch, which
      // would otherwise try to parse an image as a document.
      ?? (input.request.method === 'POST' && path === '/seller/media'
        ? await sellerMediaUpload(context)
        : null)
      // Before the seller dispatch, because this is the one command a person
      // without seller authority is meant to be able to reach.
      ?? await bindingCommands(context)
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
