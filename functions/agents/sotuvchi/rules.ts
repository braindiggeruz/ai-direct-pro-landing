import type { DeterministicRule } from '../../platform/contracts';
import {
  BUYER_COPY,
  homeChoices,
  welcomeResponse,
} from './experience';

function answer(
  _context: Parameters<DeterministicRule['execute']>[0],
  text: string,
  choices: readonly { id: string; label: string }[],
) {
  return {
    kind: 'answer' as const,
    response: { messages: [{ text, choices }], claims: [] },
    facts: [],
  };
}

export const sotuvchiStorefrontPendingRule: DeterministicRule = {
  id: 'storefront-catalog',
  priority: 10,
  match(input) {
    return input.message.kind === 'action'
      && input.message.actionId === 'storefront-start';
  },
  async execute(context) {
    return {
      kind: 'answer',
      response: welcomeResponse(context.org.locale),
      facts: [],
    };
  },
};

export const sotuvchiSellerNavigationRule: DeterministicRule = {
  id: 'seller-navigation',
  priority: 20,
  match(input) {
    return input.message.kind === 'action'
      && new Set([
        'seller-more',
        'seller-buyer-mode',
        'seller-suspended',
        'seller-paused',
        'seller-support',
      ]).has(input.message.actionId);
  },
  async execute(context, input) {
    const locale = context.org.locale;
    const actionId = input.message.kind === 'action'
      ? input.message.actionId
      : 'seller-support';
    if (actionId === 'seller-buyer-mode') {
      const buyer = BUYER_COPY[locale];
      const choices = [
        {
          id: 'seller-dashboard',
          label: locale === 'uz' ? 'Do‘kon paneliga qaytish' : 'Вернуться в магазин',
        },
        ...homeChoices(locale).filter(
          (choice) => choice.id !== 'buyer-seller-mode',
        ),
      ];
      return answer(
        context,
        `${locale === 'uz' ? 'Xaridor rejimi.' : 'Режим покупателя.'}\n\n${buyer.home}\n\n${buyer.syntheticNotice}`,
        choices,
      );
    }
    if (actionId === 'seller-more') {
      return answer(
        context,
        locale === 'uz' ? 'Do‘kon boshqaruvi.' : 'Управление магазином.',
        [
          {
            id: 'catalog-add-product',
            label: locale === 'uz' ? 'Mahsulot qo‘shish' : 'Добавить товар',
          },
          {
            id: 'catalog-categories',
            label: locale === 'uz' ? 'Kategoriyalar' : 'Категории',
          },
          {
            id: 'seller-inventory',
            label: locale === 'uz' ? 'Qoldiqlar' : 'Остатки',
          },
          {
            id: 'seller-dashboard',
            label: locale === 'uz' ? 'Do‘kon paneli' : 'Панель магазина',
          },
        ],
      );
    }
    if (actionId === 'seller-suspended') {
      return answer(
        context,
        locale === 'uz'
          ? 'Do‘kon to‘xtatilgan. Boshqaruv va vitrina hozir ishlamaydi. Yordam uchun do‘konni ulagan administratorga murojaat qiling.'
          : 'Магазин приостановлен. Управление и витрина сейчас недоступны. Для восстановления обратитесь к администратору, который подключал магазин.',
        [
          {
            id: 'seller-support',
            label: locale === 'uz' ? 'Yordam' : 'Помощь',
          },
          {
            id: 'seller-buyer-mode',
            label: locale === 'uz' ? 'Xaridga o‘tish' : 'Перейти к покупкам',
          },
        ],
      );
    }
    if (actionId === 'seller-paused') {
      return answer(
        context,
        locale === 'uz'
          ? 'Do‘konning sinov vitrinasi pauzada. Xaridorlar katalogni ocholmaydi. Qayta yoqish uchun administratorga murojaat qiling.'
          : 'Тестовая витрина магазина на паузе. Покупатели не могут открыть каталог. Для возобновления обратитесь к администратору.',
        [
          {
            id: 'seller-support',
            label: locale === 'uz' ? 'Yordam' : 'Помощь',
          },
          {
            id: 'seller-buyer-mode',
            label: locale === 'uz' ? 'Xaridga o‘tish' : 'Перейти к покупкам',
          },
        ],
      );
    }
    return answer(
      context,
      locale === 'uz'
        ? 'Kirish holatini faqat loyiha administratori o‘zgartiradi. Unga do‘kon nomi bilan murojaat qiling. Bu bot huquq yoki do‘kon yaratmaydi.'
        : 'Статус доступа меняет только администратор проекта. Обратитесь к нему и укажите название магазина. Бот не создаёт магазин и не выдаёт права.',
      [{
        id: 'seller-buyer-mode',
        label: locale === 'uz' ? 'Xaridga o‘tish' : 'Перейти к покупкам',
      }],
    );
  },
};

export const sotuvchiSellerCancelledRule: DeterministicRule = {
  id: 'seller-cancelled',
  priority: 30,
  match(input) {
    return input.message.kind === 'action'
      && input.message.actionId === 'seller-cancelled';
  },
  async execute(context) {
    const text = context.org.locale === 'uz'
      ? 'Do‘kon yaratish avval bekor qilingan. Qayta ulash uchun loyiha administratoriga murojaat qiling.'
      : 'Создание магазина ранее было отменено. Для повторного подключения обратитесь к администратору проекта.';
    return answer(context, text, [{
      id: 'seller-buyer-mode',
      label: context.org.locale === 'uz' ? 'Xaridga o‘tish' : 'Перейти к покупкам',
    }]);
  },
};
