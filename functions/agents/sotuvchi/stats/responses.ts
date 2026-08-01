import type {
  FactSheet,
  Locale,
  RuntimeExactClaim,
  RuntimeResponseDraft,
} from '../../../platform/contracts';
import { StatsValidationError } from './errors';

export const SELLER_STATS_ACTION = 'seller-stats';
export const SELLER_DASHBOARD_ACTION = 'seller-dashboard';

const COPY = {
  ru: {
    title: 'Статистика магазина за сегодня.',
    exactTitle: 'Точные данные:',
    productsPublished: 'Опубликовано товаров сейчас',
    checkoutsStarted: 'Начато оформлений',
    ordersPlaced: 'Заказов оформлено',
    ordersConfirmed: 'Подтверждено',
    ordersCancelled: 'Отменено',
    ordersDone: 'Выполнено',
    handoffsOpen: 'Открытых вопросов сейчас',
    handoffsAnswered: 'Вопросов отвечено',
    funnelTitle: 'Оценка воронки (приблизительно, может быть занижена):',
    buyerStarts: 'Открытий витрины',
    searches: 'Поисковых запросов',
    resultsShown: 'Показов результатов',
    zeroResults: 'Без результата',
    productViews: 'Просмотров товаров',
    comparisons: 'Сравнений',
    noPayment: 'Деньги и оплата через бота не считаются.',
    orders: 'Заказы',
    handoffs: 'Вопросы',
    dashboardTitle: 'Панель магазина.',
    dashboardProducts: 'Опубликовано товаров',
    dashboardOrders: 'Заказов оформлено сегодня',
    dashboardQuestions: 'Открытых вопросов',
    products: 'Мои товары',
    stats: 'Статистика',
    buy: 'Купить товар',
    more: 'Ещё',
  },
  uz: {
    title: 'Do‘konning bugungi statistikasi.',
    exactTitle: 'Aniq ma’lumotlar:',
    productsPublished: 'Hozir nashr qilingan mahsulotlar',
    checkoutsStarted: 'Boshlangan rasmiylashtirishlar',
    ordersPlaced: 'Rasmiylashtirilgan buyurtmalar',
    ordersConfirmed: 'Tasdiqlangan',
    ordersCancelled: 'Bekor qilingan',
    ordersDone: 'Bajarilgan',
    handoffsOpen: 'Hozir ochiq savollar',
    handoffsAnswered: 'Javob berilgan savollar',
    funnelTitle: 'Voronka bahosi (taxminiy, kam ko‘rsatishi mumkin):',
    buyerStarts: 'Vitrina ochilishi',
    searches: 'Qidiruv so‘rovlari',
    resultsShown: 'Natijalar ko‘rsatildi',
    zeroResults: 'Natijasiz',
    productViews: 'Mahsulot ko‘rishlari',
    comparisons: 'Taqqoslashlar',
    noPayment: 'Bot orqali pul va to‘lov hisoblanmaydi.',
    orders: 'Buyurtmalar',
    handoffs: 'Savollar',
    dashboardTitle: 'Do‘kon paneli.',
    dashboardProducts: 'Nashr qilingan mahsulotlar',
    dashboardOrders: 'Bugun rasmiylashtirilgan buyurtmalar',
    dashboardQuestions: 'Ochiq savollar',
    products: 'Mening mahsulotlarim',
    stats: 'Statistika',
    buy: 'Mahsulot xarid qilish',
    more: 'Yana',
  },
} as const;

function claimNumber(
  claims: RuntimeExactClaim[],
  facts: FactSheet,
  key: string,
): number {
  const value = facts.values[key];
  if (typeof value !== 'number') throw new StatsValidationError();
  claims.push({ key, value });
  return value;
}

/**
 * Deterministic RU/UZ report.
 *
 * Every number is claimed from the Facts produced by the trusted query, so
 * strict grounding rejects any figure the database did not return. No ratio,
 * revenue, profit or conversion rate is derived: the schema cannot support one
 * honestly yet.
 */
export function composeStatsResponse(
  facts: FactSheet,
  locale: Locale,
): RuntimeResponseDraft {
  if (facts.values['seller.view'] !== 'seller_stats') {
    throw new StatsValidationError();
  }
  const copy = COPY[locale] ?? COPY.ru;
  const claims: RuntimeExactClaim[] = [];
  const line = (label: string, key: string): string =>
    `${label}: ${claimNumber(claims, facts, key)}`;

  const parts: string[] = [
    copy.title,
    copy.exactTitle,
    line(copy.productsPublished, 'seller.stats.products_published'),
    line(copy.checkoutsStarted, 'seller.stats.checkouts_started'),
    line(copy.ordersPlaced, 'seller.stats.orders_placed'),
    line(copy.ordersConfirmed, 'seller.stats.orders_confirmed'),
    line(copy.ordersCancelled, 'seller.stats.orders_cancelled'),
    line(copy.ordersDone, 'seller.stats.orders_done'),
    line(copy.handoffsOpen, 'seller.stats.handoffs_open'),
    line(copy.handoffsAnswered, 'seller.stats.handoffs_answered'),
    copy.funnelTitle,
    line(copy.buyerStarts, 'seller.funnel.buyer_starts'),
    line(copy.searches, 'seller.funnel.searches'),
    line(copy.resultsShown, 'seller.funnel.results_shown'),
    line(copy.zeroResults, 'seller.funnel.zero_results'),
    line(copy.productViews, 'seller.funnel.product_views'),
    line(copy.comparisons, 'seller.funnel.comparisons'),
    copy.noPayment,
  ];

  return {
    messages: [{
      text: parts.join('\n'),
      choices: [
        { id: 'seller-orders', label: copy.orders },
        { id: 'seller-handoffs', label: copy.handoffs },
      ],
    }],
    claims,
  };
}

/** Compact owner dashboard backed only by the same exact operational query. */
export function composeDashboardResponse(
  facts: FactSheet,
  locale: Locale,
): RuntimeResponseDraft {
  if (facts.values['seller.view'] !== 'seller_dashboard') {
    throw new StatsValidationError();
  }
  const copy = COPY[locale] ?? COPY.ru;
  const claims: RuntimeExactClaim[] = [];
  const line = (label: string, key: string): string =>
    `${label}: ${claimNumber(claims, facts, key)}`;
  return {
    messages: [{
      text: [
        copy.dashboardTitle,
        line(copy.dashboardProducts, 'seller.stats.products_published'),
        line(copy.dashboardOrders, 'seller.stats.orders_placed'),
        line(copy.dashboardQuestions, 'seller.stats.handoffs_open'),
      ].join('\n'),
      choices: [
        { id: 'seller-orders', label: copy.orders },
        { id: 'catalog-my-products', label: copy.products },
        { id: 'seller-handoffs', label: copy.handoffs },
        { id: 'seller-stats', label: copy.stats },
        { id: 'seller-buyer-mode', label: copy.buy },
        { id: 'seller-more', label: copy.more },
      ],
    }],
    claims,
  };
}
