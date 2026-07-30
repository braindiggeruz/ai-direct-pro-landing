import type { DeterministicRule } from '../../platform/contracts';

export const sotuvchiStorefrontPendingRule: DeterministicRule = {
  id: 'storefront-catalog',
  priority: 10,
  match(input) {
    return input.message.kind === 'action'
      && input.message.actionId === 'storefront-start';
  },
  async execute(context) {
    const locale = context.org.locale;
    return {
      kind: 'answer',
      response: {
        messages: [{
          text: locale === 'ru'
            ? 'Тестовый каталог: здесь только синтетические товары, без реальных брендов и клиентских данных.\n\nНапишите, что ищете, или откройте каталог.'
            : 'Sinov katalogi: bu yerda faqat sintetik mahsulotlar bor, haqiqiy brendlar va mijozlar ma’lumotlari ishlatilmaydi.\n\nNima kerakligini yozing yoki katalogni oching.',
          choices: [{
            id: 'buyer-catalog-open',
            label: locale === 'ru' ? 'Открыть каталог' : 'Katalogni ochish',
          }],
        }],
        claims: [],
      },
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
            {
              id: 'seller-orders',
              label: context.org.locale === 'uz'
                ? 'Buyurtmalar'
                : 'Заказы',
            },
            {
              id: 'seller-inventory',
              label: context.org.locale === 'uz'
                ? 'Qoldiqlar'
                : 'Остатки',
            },
            {
              id: 'seller-handoffs',
              label: context.org.locale === 'uz'
                ? 'Savollar'
                : 'Вопросы',
            },
            {
              id: 'seller-stats',
              label: context.org.locale === 'uz'
                ? 'Statistika'
                : 'Статистика',
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
