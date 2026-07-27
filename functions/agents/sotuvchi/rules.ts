import type { DeterministicRule } from '../../platform/contracts';

export const sotuvchiStorefrontPendingRule: DeterministicRule = {
  id: 'storefront-catalog',
  priority: 10,
  match(input) {
    return input.message.kind === 'action'
      && input.message.actionId === 'storefront-start';
  },
  async execute() {
    return {
      kind: 'tool',
      toolName: 'catalog.list',
      input: { offset: 0 },
    };
  },
};

export const sotuvchiSellerStatusRule: DeterministicRule = {
  id: 'seller-status',
  priority: 20,
  match(input) {
    return input.message.kind === 'action'
      && input.message.actionId === 'seller-status';
  },
  async execute(context) {
    const text = context.org.locale === 'uz'
      ? 'Do‘kon tayyor. Katalog amalini tanlang.'
      : 'Магазин готов. Выберите действие с каталогом.';
    return {
      kind: 'answer',
      response: {
        messages: [{
          text,
          choices: [
            {
              id: 'catalog-add-product',
              label: context.org.locale === 'uz'
                ? 'Mahsulot qo‘shish'
                : 'Добавить товар',
            },
            {
              id: 'catalog-my-products',
              label: context.org.locale === 'uz'
                ? 'Mening mahsulotlarim'
                : 'Мои товары',
            },
            {
              id: 'catalog-categories',
              label: context.org.locale === 'uz'
                ? 'Kategoriyalar'
                : 'Категории',
            },
            {
              id: 'catalog-publish-product',
              label: context.org.locale === 'uz'
                ? 'Nashr qilish'
                : 'Опубликовать товар',
            },
            {
              id: 'catalog-hide-product',
              label: context.org.locale === 'uz'
                ? 'Yashirish'
                : 'Скрыть товар',
            },
          ],
        }],
        claims: [],
      },
      facts: [],
    };
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
      ? 'Do‘kon yaratish avval bekor qilingan.'
      : 'Создание магазина ранее было отменено.';
    return {
      kind: 'answer',
      response: { messages: [{ text }], claims: [] },
      facts: [],
    };
  },
};
