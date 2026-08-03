// Development-only synthetic transport. It is reachable exclusively through
// an import.meta.env.DEV branch and is not included in the production graph.
import type {
  BuyerOrder,
  Category,
  CheckoutSnapshot,
  Handoff,
  Inventory,
  MarketLaunch,
  Product,
  SellerOrder,
  SellerOverview,
  SellerProduct,
  SessionExchange,
  Stats,
} from '../types';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

const now = new Date().toISOString();
const categories: Category[] = [
  { id: 'cat-audio', name: 'Аудио', productCount: 2 },
  { id: 'cat-home', name: 'Для дома', productCount: 2 },
  { id: 'cat-accessories', name: 'Аксессуары', productCount: 2 },
];
const products: SellerProduct[] = [
  ['p-headphones', 'cat-audio', 'Беспроводные наушники AirBeat', 349000, 'available', '40 часов работы'],
  ['p-speaker', 'cat-audio', 'Портативная колонка Mini Sound', 229000, 'preorder', 'Защита IPX6'],
  ['p-lamp', 'cat-home', 'Настольная лампа Warm Light', 189000, 'available', 'Три режима света'],
  ['p-kettle', 'cat-home', 'Электрический чайник Steel 1.7', 299000, 'available', 'Автоотключение'],
  ['p-cable', 'cat-accessories', 'Кабель USB‑C 100W', 79000, 'available', 'Длина 2 метра'],
  ['p-power', 'cat-accessories', 'Power Bank 20 000', 429000, 'unavailable', 'Быстрая зарядка'],
].map(([id, categoryId, name, priceMinor, availability, description], index) => ({
  id: String(id),
  categoryId: String(categoryId),
  categoryName: categories.find((item) => item.id === categoryId)?.name ?? null,
  sku: `SYN-${index + 1}`,
  name: String(name),
  description: String(description),
  priceMinor: Number(priceMinor),
  currency: 'UZS',
  availability: availability as Product['availability'],
  status: 'published',
  mediaHandles: [`fixture-${id}`],
  specifications: [
    { key: 'warranty', label: 'Гарантия', value: '12 месяцев' },
    { key: 'origin', label: 'Наличие', value: availability === 'preorder' ? 'Под заказ' : 'Склад Ташкент' },
  ],
  version: 1,
  updatedAt: now,
  storeName: 'Samarqand Market',
  // Owner-only fields. The fixture leaves the last two products without them so
  // the cabinet's "weak card" path is reachable offline.
  owner: index < 4
    ? {
      mediaRefs: [`fixture-${id}`],
      searchTerms: ['quloqchin', 'гарнитура'],
      specifications: [
        { key: 'warranty', labelRu: 'Гарантия', labelUz: 'Kafolat', value: '12 месяцев' },
      ],
    }
    : { mediaRefs: [], searchTerms: [], specifications: [] },
}));

let syntheticMedia = 0;

let comparison: string[] = [];
let checkout: CheckoutSnapshot | null = null;
const buyerOrders: BuyerOrder[] = [{
  orderId: 'order-demo-1', orderNumber: 'MK-1042', productId: 'p-lamp',
  productName: 'Настольная лампа Warm Light', storeName: 'Samarqand Market',
  quantity: 1, totalMinor: 189000, status: 'confirmed', placedAt: now,
}];
const sellerOrders: SellerOrder[] = [{
  orderId: 'order-demo-2', orderNumber: 'MK-1043', status: 'placed',
  productId: 'p-headphones', productName: 'Беспроводные наушники AirBeat',
  quantity: 2, totalMinor: 698000, version: 1, placedAt: now,
  customerName: 'Aziza', customerPhone: '+998901234567',
  customerAddress: 'Toshkent, Chilonzor 12', customerComment: 'После 18:00',
  inventoryOnHand: 8,
}];
const handoffs: Handoff[] = [{
  id: 'handoff-demo-1', status: 'open', reason: 'order_question',
  questionText: 'Можно забрать на Чиланзаре сегодня?', replyText: null,
  hasReply: false, contentCleared: false, createdAt: now,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(), version: 1,
}];
const inventory: Inventory[] = products.slice(0, 4).map((product, index) => ({
  productId: product.id, productName: product.name, onHand: 8 + index * 4, version: 1,
}));

const stats = (): Stats => ({
  windowDays: 1,
  since: new Date(Date.now() - 86_400_000).toISOString(),
  generatedAt: new Date().toISOString(),
  exact: {
    productsPublished: products.filter((item) => item.status === 'published').length,
    checkoutsStarted: 3, ordersPlaced: sellerOrders.filter((item) => item.status === 'placed').length,
    ordersConfirmed: sellerOrders.filter((item) => item.status === 'confirmed').length,
    ordersCancelled: 0, ordersDone: 1,
    handoffsOpen: handoffs.filter((item) => item.status === 'open').length,
    handoffsAnswered: handoffs.filter((item) => item.status === 'answered').length,
  },
  funnel: { buyerStarts: 12, searches: 8, resultsShown: 7, zeroResults: 1, productViews: 14, comparisons: 3 },
});

function bodyOf(options: RequestOptions): Record<string, unknown> {
  return options.body && typeof options.body === 'object'
    ? options.body as Record<string, unknown>
    : {};
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

type OwnerFields = NonNullable<SellerProduct['owner']>;

/** Mirrors the BFF split: aliases and bilingual labels live under `owner`. */
function ownerFields(source: Record<string, unknown>): OwnerFields {
  return {
    mediaRefs: Array.isArray(source.mediaRefs) ? source.mediaRefs as string[] : [],
    searchTerms: Array.isArray(source.searchTerms) ? source.searchTerms as string[] : [],
    specifications: Array.isArray(source.specifications)
      ? source.specifications as OwnerFields['specifications']
      : [],
  };
}

function checkoutBase(product: Product): CheckoutSnapshot {
  return {
    order: {
      id: 'draft-synthetic', orderNumber: 'MK-1044', productId: product.id,
      productNameSnapshot: product.name, unitPriceMinor: product.priceMinor,
      quantity: null, totalMinor: null, buyerName: null, buyerPhone: null,
      buyerAddress: null, buyerComment: null, status: 'draft',
    },
    state: 'awaiting_quantity', outcome: 'started', priceChanged: false,
  };
}

export async function syntheticRequest<T>(rawPath: string, options: RequestOptions = {}): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 90));
  const url = new URL(rawPath, 'https://synthetic.invalid');
  const path = url.pathname;
  const method = options.method ?? 'GET';
  const body = bodyOf(options);
  let result: unknown;

  if (path === '/session/launch') {
    result = {
      session: {
        token: 'synthetic-memory-token', expiresAt: new Date(Date.now() + 600_000).toISOString(),
        locale: 'ru', user: { firstName: 'Aziza', lastName: null, username: 'synthetic' },
        capabilities: { buyer: true, sellerRead: true, sellerCommands: true },
        storefront: { id: 'store-synthetic', locale: 'ru' },
      },
      bootstrap: {
        apiVersion: 'market-v1', buildId: 'synthetic-candidate', locale: 'ru',
        navigation: ['home', 'search', 'publish', 'cabinet'],
        sellerNavigation: ['dashboard', 'orders', 'questions', 'products', 'inventory'],
        flags: { buyer: true, sellerRead: true, sellerCommands: true, voice: true, mediaUpload: true, cabinet: true },
        storefront: { id: 'store-synthetic', state: 'active' },
        counters: { orders: buyerOrders.length, activeCheckout: Boolean(checkout), activeHandoff: handoffs.some((item) => item.status === 'open') },
      },
      home: { categories, products, updatedAt: now },
    } satisfies MarketLaunch;
  } else if (path === '/session/exchange') {
    result = {
      token: 'synthetic-memory-token', expiresAt: new Date(Date.now() + 600_000).toISOString(),
      locale: 'ru', user: { firstName: 'Aziza', lastName: null, username: 'synthetic' },
      capabilities: { buyer: true, sellerRead: true, sellerCommands: true },
      storefront: { id: 'store-synthetic', locale: 'ru' },
    } satisfies SessionExchange;
  } else if (path === '/session/locale') {
    result = { token: 'synthetic-memory-token', locale: body.locale, expiresAt: new Date(Date.now() + 600_000).toISOString() };
  } else if (path === '/bootstrap') {
    result = {
      apiVersion: 'market-v1', buildId: 'synthetic-candidate', locale: 'ru',
      navigation: ['home', 'search', 'publish', 'cabinet'],
      sellerNavigation: ['dashboard', 'orders', 'questions', 'products', 'inventory'],
      flags: { buyer: true, sellerRead: true, sellerCommands: true, voice: true, mediaUpload: true, cabinet: true },
      storefront: { id: 'store-synthetic', state: 'active' },
      counters: { orders: buyerOrders.length, activeCheckout: Boolean(checkout), activeHandoff: handoffs.some((item) => item.status === 'open') },
    };
  } else if (path === '/catalog/home') {
    result = { categories, products, updatedAt: now };
  } else if (path === '/catalog/categories') {
    result = { items: categories, nextCursor: null };
  } else if (/^\/catalog\/categories\/[^/]+\/products$/.test(path)) {
    const id = path.split('/')[3];
    result = { items: products.filter((item) => item.categoryId === id), nextCursor: null };
  } else if (path === '/catalog/products') {
    const query = (url.searchParams.get('q') ?? '').toLowerCase();
    const availability = url.searchParams.get('availability');
    const ceiling = Number(url.searchParams.get('maxPriceMinor') ?? '') || null;
    // Matched per token, not as one substring. Production drops the intent
    // words server-side before ranking, so a fixture that required the whole
    // sentence «мне нужен блокнот» to appear verbatim would show an empty
    // result for a journey that works in production.
    const tokens = query.split(/\s+/).map((token) => token.replace(/[.,!?]+$/, '')).filter(Boolean);
    const vocabulary = products.flatMap((item) =>
      `${item.name} ${item.description}`.toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter(Boolean);
    // Stem match against the fixture's own words, the same shape the BFF uses,
    // so «блокнотов» finds «блокнот» offline too.
    const stem = (token: string) => vocabulary.find((word) =>
      word === token
      || (Math.min(word.length, token.length) >= 4
        && (word.startsWith(token.slice(0, 4)) && token.startsWith(word.slice(0, 4)))));
    const grounded = tokens.map(stem).filter((word): word is string => Boolean(word));
    result = {
      items: products.filter((item) => {
        const haystack = `${item.name} ${item.description}`.toLowerCase();
        return (!grounded.length || grounded.some((token) => haystack.includes(token)))
          && (!availability || item.availability === availability)
          && (ceiling === null || item.priceMinor <= ceiling);
      }),
      nextCursor: null,
      queryApplied: grounded.join(' ') || query || null,
      maxPriceMinorApplied: ceiling,
      aiAssisted: false,
    };
  } else if (path === '/voice/search') {
    // Fixture speech: a fixed RU sentence so the whole voice journey can be
    // exercised offline without a microphone or a speech provider.
    const transcript = 'нужны наушники до 400 тысяч в наличии';
    const items = products.filter((item) =>
      item.name.toLowerCase().includes('наушник')
      && item.priceMinor <= 400_000
      && item.availability === 'available');
    result = {
      transcript,
      language: 'ru',
      interpretation: {
        productQuery: 'наушники',
        maxPriceMinor: 400_000,
        ambiguousPriceMinor: null,
        availability: 'available',
        category: null,
        constraints: [
          { kind: 'query', value: 'наушники' },
          { kind: 'budget', value: '400000' },
          { kind: 'availability', value: 'available' },
        ],
        clarification: null,
        confidence: 'high',
      },
      items,
      nextCursor: null,
      queryApplied: 'наушники',
    };
  } else if (/^\/catalog\/products\/[^/]+$/.test(path)) {
    result = products.find((item) => item.id === path.split('/').at(-1));
  } else if (path === '/comparison' && method === 'GET') {
    result = { items: products.filter((item) => comparison.includes(item.id)) };
  } else if (path === '/comparison/items' && method === 'POST') {
    const id = String(body.productId ?? '');
    if (!comparison.includes(id) && comparison.length < 3) comparison.push(id);
    result = { outcome: 'added', items: products.filter((item) => comparison.includes(item.id)) };
  } else if (/^\/comparison\/items\/[^/]+$/.test(path) && method === 'DELETE') {
    comparison = comparison.filter((id) => id !== path.split('/').at(-1));
    result = { items: products.filter((item) => comparison.includes(item.id)) };
  } else if (path === '/comparison' && method === 'DELETE') {
    comparison = []; result = undefined;
  } else if (path === '/checkout' && method === 'POST') {
    const product = products.find((item) => item.id === body.productId)!;
    checkout = checkoutBase(product); result = checkout;
  } else if (path.startsWith('/checkout/') && checkout) {
    const order = checkout.order;
    if (path === '/checkout/quantity') { order.quantity = Number(body.quantity); order.totalMinor = order.quantity * order.unitPriceMinor; checkout.state = 'awaiting_name'; }
    if (path === '/checkout/name') { order.buyerName = String(body.name); checkout.state = 'awaiting_phone'; }
    if (path === '/checkout/phone') { order.buyerPhone = String(body.phone); checkout.state = 'awaiting_address'; }
    if (path === '/checkout/address') { order.buyerAddress = String(body.address); checkout.state = 'awaiting_comment'; }
    if (path === '/checkout/comment') { order.buyerComment = String(body.comment); checkout.state = 'awaiting_confirmation'; }
    if (path === '/checkout/comment/skip') { order.buyerComment = null; checkout.state = 'awaiting_confirmation'; }
    if (path === '/checkout/confirm') {
      checkout.state = 'completed'; checkout.outcome = 'placed'; checkout.order.status = 'placed';
      buyerOrders.unshift({ orderId: checkout.order.id, orderNumber: checkout.order.orderNumber, productId: checkout.order.productId, productName: checkout.order.productNameSnapshot, storeName: 'Samarqand Market', quantity: checkout.order.quantity!, totalMinor: checkout.order.totalMinor!, status: 'placed', placedAt: new Date().toISOString() });
    }
    if (path === '/checkout/cancel') { checkout = null; result = { checkout: null }; }
    else result = checkout;
  } else if (path === '/orders') {
    result = { items: buyerOrders, nextCursor: null };
  } else if (path === '/handoffs' && method === 'POST') {
    const created: Handoff = { id: `handoff-${handoffs.length + 1}`, status: 'open', reason: String(body.reason), questionText: String(body.question), replyText: null, contentCleared: false, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), version: 1 };
    handoffs.unshift(created); result = { handoff: created, outcome: 'created' };
  } else if (path === '/seller/dashboard') {
    result = { store: { name: 'Samarqand Market' }, stats: stats(), orders: sellerOrders.slice(0, 5), handoffs: handoffs.slice(0, 5) };
  } else if (path === '/seller/overview') {
    const minutes = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
    const group = <T,>(items: T[]) => ({ count: items.length, truncated: false, items: items.slice(0, 5) });
    const stock = new Map(inventory.map((item) => [item.productId, item]));
    result = {
      store: { id: 'store-synthetic', name: 'Samarqand Market' },
      generatedAt: new Date().toISOString(),
      slaHours: 24,
      attention: {
        newOrders: group(sellerOrders
          .filter((order) => order.status === 'placed')
          .map((order) => ({ ...order, ageMinutes: minutes(order.placedAt) }))),
        agingOrders: group([]),
        openQuestions: group(handoffs
          .filter((item) => item.status === 'open')
          .map((item) => ({
            id: item.id,
            reason: item.reason,
            createdAt: item.createdAt,
            ageMinutes: minutes(item.createdAt),
          }))),
        outOfStock: group(products
          .filter((item) => item.status === 'published' && stock.get(item.id)?.onHand === 0)
          .map((item) => ({
            productId: item.id,
            productName: item.name,
            version: stock.get(item.id)!.version,
          }))),
        drafts: group(products
          .filter((item) => item.status === 'draft')
          .map((item) => ({
            id: item.id, name: item.name, priceMinor: item.priceMinor, version: item.version,
          }))),
        weakProducts: group(products
          .filter((item) => item.status === 'published')
          .map((item) => ({
            id: item.id,
            name: item.name,
            version: item.version,
            issues: [
              ...(item.mediaHandles.length === 0 ? ['no_media' as const] : []),
              ...(item.description ? [] : ['no_description' as const]),
              ...((item.owner?.specifications.length ?? 0) === 0 ? ['no_specifications' as const] : []),
              ...((item.owner?.searchTerms.length ?? 0) === 0 ? ['no_search_terms' as const] : []),
            ],
          }))
          .filter((item) => item.issues.length > 0)),
      },
      stats: stats(),
    } satisfies SellerOverview;
  } else if (path === '/seller/orders') {
    const status = url.searchParams.get('status');
    result = {
      items: status ? sellerOrders.filter((order) => order.status === status) : sellerOrders,
      nextCursor: null,
    };
  } else if (/^\/seller\/orders\/[^/]+$/.test(path) && method === 'GET') {
    result = sellerOrders.find((item) => item.orderId === path.split('/').at(-1));
  } else if (/^\/seller\/orders\/[^/]+\/(confirm|cancel|done)$/.test(path)) {
    const parts = path.split('/');
    const order = sellerOrders.find((item) => item.orderId === parts[3])!;
    order.status = parts[4] === 'confirm' ? 'confirmed' : parts[4] as SellerOrder['status'];
    order.version += 1; result = { order };
  } else if (path === '/seller/handoffs') {
    result = { items: handoffs, nextCursor: null };
  } else if (/^\/seller\/handoffs\/[^/]+$/.test(path) && method === 'GET') {
    result = handoffs.find((item) => item.id === path.split('/').at(-1));
  } else if (/^\/seller\/handoffs\/[^/]+\/reply$/.test(path)) {
    const item = handoffs.find((candidate) => candidate.id === path.split('/')[3])!;
    item.replyText = String(body.reply); item.status = 'answered'; item.version = (item.version ?? 1) + 1;
    result = { handoff: item, outcome: 'answered' };
  } else if (path === '/seller/products' && method === 'GET') {
    const status = url.searchParams.get('status');
    result = {
      items: status ? products.filter((item) => item.status === status) : products,
      nextCursor: null,
    };
  } else if (/^\/seller\/products\/[^/]+$/.test(path) && method === 'GET') {
    const item = products.find((candidate) => candidate.id === path.split('/').at(-1));
    result = {
      product: item,
      inventory: inventory.find((candidate) => candidate.productId === item?.id) ?? null,
    };
  } else if (path === '/seller/products' && method === 'POST') {
    const created: SellerProduct = { id: `p-${products.length + 1}`, categoryId: body.categoryId as string | null, categoryName: categories.find((item) => item.id === body.categoryId)?.name ?? null, sku: null, name: String(body.name), description: body.description ? String(body.description) : null, priceMinor: Number(body.priceMinor), currency: 'UZS', availability: body.availability as Product['availability'], status: 'draft', mediaHandles: [], specifications: [], version: 1, updatedAt: new Date().toISOString(), storeName: 'Samarqand Market', owner: ownerFields(body) };
    products.unshift(created); result = created;
  } else if (/^\/seller\/products\/[^/]+$/.test(path) && method === 'PATCH') {
    const item = products.find((candidate) => candidate.id === path.split('/').at(-1))!;
    const patch = bodyOf({ body: body.patch });
    const scalars = Object.fromEntries(Object.entries(patch)
      .filter(([key]) => key !== 'searchTerms' && key !== 'specifications'));
    Object.assign(item, scalars, {
      owner: ownerFields(patch),
      version: item.version + 1,
      updatedAt: new Date().toISOString(),
    });
    result = item;
  } else if (/^\/seller\/products\/[^/]+\/(publish|unpublish|archive)$/.test(path)) {
    const parts = path.split('/'); const item = products.find((candidate) => candidate.id === parts[3])!;
    item.status = parts[4] === 'publish' ? 'published' : parts[4] === 'unpublish' ? 'draft' : 'archived'; item.version += 1; result = item;
  } else if (path === '/seller/media' && method === 'POST') {
    syntheticMedia += 1;
    result = { ref: `r2.fixture${String(syntheticMedia).padStart(8, '0')}`, contentType: 'image/jpeg' };
  } else if (/^\/seller\/media\/[^/]+$/.test(path) && method === 'DELETE') {
    result = undefined;
  } else if (path === '/seller/categories') {
    result = { items: categories };
  } else if (path === '/seller/inventory') {
    result = { items: inventory, nextCursor: null };
  } else if (/^\/seller\/inventory\/[^/]+$/.test(path) && method === 'PUT') {
    const item = inventory.find((candidate) => candidate.productId === path.split('/').at(-1))!;
    item.onHand = Number(body.onHand); item.version += 1; result = { snapshot: item };
  } else {
    throw new Error(`Synthetic route missing: ${method} ${path}`);
  }
  return clone(result) as T;
}
