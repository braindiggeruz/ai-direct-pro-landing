import type {
  FactSheet,
  Locale,
  RuntimeExactClaim,
  RuntimeResponseDraft,
} from '../../../platform/contracts';
import { StatsValidationError } from './errors';

export const SELLER_STATS_ACTION = 'seller-stats';

const COPY = {
  ru: {
    title: 'Статистика магазина за 7 дней.',
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
    catalogAnswers: 'Ответов по каталогу',
    catalogNoResults: 'Без результата',
    noPayment: 'Деньги и оплата через бота не считаются.',
    orders: 'Заказы',
    handoffs: 'Вопросы',
  },
  uz: {
    title: 'Do‘kon statistikasi, 7 kun.',
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
    catalogAnswers: 'Katalog javoblari',
    catalogNoResults: 'Natijasiz',
    noPayment: 'Bot orqali pul va to‘lov hisoblanmaydi.',
    orders: 'Buyurtmalar',
    handoffs: 'Savollar',
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
    line(copy.catalogAnswers, 'seller.funnel.catalog_answers'),
    line(copy.catalogNoResults, 'seller.funnel.catalog_no_results'),
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
