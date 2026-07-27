import type { DeterministicRule } from '../../platform/contracts';

export const sotuvchiStorefrontPendingRule: DeterministicRule = {
  id: 'storefront-pending',
  priority: 10,
  match(input) {
    return input.message.kind === 'action'
      && input.message.actionId === 'storefront-start';
  },
  async execute(context) {
    const text = context.org.locale === 'uz'
      ? 'Vitrina tayyor. Mahsulotlar katalogi keyingi bosqichda qo‘shiladi.'
      : 'Витрина готова. Каталог товаров будет добавлен на следующем этапе.';
    return {
      kind: 'answer',
      response: { messages: [{ text }], claims: [] },
      facts: [],
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
      ? 'Do‘kon allaqachon yaratilgan.'
      : 'Магазин уже создан.';
    return {
      kind: 'answer',
      response: { messages: [{ text }], claims: [] },
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
