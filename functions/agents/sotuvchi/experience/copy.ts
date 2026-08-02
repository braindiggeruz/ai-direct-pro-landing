import type {
  Locale,
  OutboundChoice,
  RuntimeResponseDraft,
} from '../../../platform/contracts';

/**
 * Reviewed buyer-facing RU/Uzbek Latin product copy.
 *
 * Domain modules project facts; this dictionary owns navigation and
 * explanatory language so button labels and recovery paths cannot drift.
 */
export const BUYER_COPY = {
  ru: {
    home:
      'Bormi? — Bor. Напишите, что Вам нужно, — Bormi найдёт подходящие товары в каталогах подключённых магазинов.',
    syntheticNotice:
      'Сейчас работает тестовый каталог: все товары синтетические.',
    find: 'Найти товар',
    catalog: 'Каталог',
    orders: 'Мои заказы',
    seller: 'Связаться с продавцом',
    sellerMode: 'Я продавец',
    more: 'Ещё',
    language: 'Язык',
    homeButton: 'Главное меню',
    backToCatalog: 'Назад в каталог',
    helpButton: 'Помощь',
    findPrompt:
      'Напишите, что ищете: название, категорию, характеристики или бюджет.',
    categoryPrompt: 'Выберите категорию или покажите все товары.',
    allProducts: 'Все товары',
    showMore: 'Показать ещё',
    resultActions: 'Что сделать дальше?',
    details: 'Подробнее',
    compare: 'Сравнить',
    showComparison: 'Показать сравнение',
    clearComparison: 'Очистить сравнение',
    comparisonTitle: 'Сравнение подтверждённых данных.',
    comparisonWaiting:
      'Товар добавлен. Выберите ещё один товар — сравнить можно до трёх.',
    comparisonDuplicate: 'Этот товар уже добавлен в сравнение.',
    comparisonFull:
      'В сравнении уже три товара. Очистите выбор или выберите один из них.',
    comparisonEmpty: 'Список сравнения пока пуст.',
    comparisonCleared: 'Сравнение очищено.',
    comparisonCheaper: (name: string) => `Дешевле: ${name}.`,
    comparisonPriceTie: 'По цене выбранные товары равны.',
    comparisonCloser: (name: string) => `Ближе к запросу: ${name}.`,
    comparisonRelevanceTie:
      'По подтверждённому совпадению с запросом явного лидера нет.',
    requestMatch: 'Совпадение с запросом',
    matchedRequirements: 'Подтверждено совпадений',
    missingRequirements: 'Нет данных по параметрам',
    noMissingRequirements: 'не выявлено',
    chooseProduct: 'Выбрать этот',
    changeParameters: 'Изменить параметры',
    orderAction: 'Заказать',
    askSeller: 'Спросить продавца',
    similar: 'Похожие',
    store: 'Магазин',
    specifications: 'Характеристики',
    languagePrompt: 'Выберите язык интерфейса.',
    languageChanged: 'Язык интерфейса изменён.',
    russian: 'Русский',
    uzbek: 'O‘zbekcha',
    sellerPrompt:
      'Напишите «позвать продавца» и свой вопрос одним сообщением — я передам его продавцу этого магазина.',
    sellerInterest:
      'Bormi для продавцов помогает магазину показывать проверенный каталог и получать заявки в Telegram.\n\nСейчас магазины подключаются только по приглашению. Это интерес к участию, а не доступ: кнопка не даёт доступ к панели продавца и не создаёт магазин.\n\nДля проверки понадобятся категория магазина, небольшая согласованная подборка товаров, целые цены в UZS, актуальные остатки, контакт владельца и ответственные за согласие и скорость ответа. Команда проверит заявку и свяжется с Вами.',
    sellerHow: 'Как это работает',
    sellerHowText:
      'Администратор проекта проверяет владельца, каталог и источник товарных данных. Это защищает покупателей от неподтверждённых цен и остатков. После одобрения продавцу становятся доступны товары, заявки, вопросы и точная статистика.\n\nСамостоятельно создать магазин или получить права продавца через эту кнопку нельзя. Срок, стоимость и результат пилота ещё не согласованы.',
    backToShopping: 'Вернуться к покупкам',
    help:
      'Можно спросить и сделать: открыть каталог и категории, найти товар по описанию или бюджету, сравнить варианты, оформить заявку и посмотреть свои заказы.',
    humanHint:
      'Нужен человек? Напишите «позвать продавца» и свой вопрос.',
    budgetPrompt:
      'Укажите максимальный бюджет в сумах — можно написать цифрами или словами.',
    budgetConfirm: (amount: string) =>
      `Использовать ${amount} как максимальный бюджет?`,
    budgetUse: 'Да, это бюджет',
    numberSearch: 'Нет, искать как модель',
    noResult:
      'В этом магазине подходящий товар не найден. Измените запрос, откройте категории или позовите продавца.',
    stale:
      'Эта кнопка устарела или уже была использована. Откройте актуальный раздел.',
    runtimeFailure:
      'Сейчас не удалось обработать запрос. Каталог и ваши заказы остаются доступны.',
    orderHistory: 'Ваши последние заказы.',
    orderHistoryEmpty: 'У вас пока нет оформленных заказов.',
    order: 'Заказ',
    product: 'Товар',
    quantity: 'Количество',
    total: 'Сумма',
    status: 'Статус',
    date: 'Дата',
  },
  uz: {
    home:
      'Bormi? — Bor. Sizga nima kerakligini yozing — Bormi ulangan do‘konlar katalogidan mos mahsulotlarni topadi.',
    syntheticNotice:
      'Hozir sinov katalogi ishlayapti: barcha mahsulotlar sintetik.',
    find: 'Mahsulot topish',
    catalog: 'Katalog',
    orders: 'Buyurtmalarim',
    seller: 'Sotuvchi bilan bog‘lanish',
    sellerMode: 'Men sotuvchiman',
    more: 'Yana',
    language: 'Til',
    homeButton: 'Bosh menyu',
    backToCatalog: 'Katalogga qaytish',
    helpButton: 'Yordam',
    findPrompt:
      'Nima kerakligini yozing: nomi, kategoriya, xususiyatlar yoki byudjet.',
    categoryPrompt: 'Kategoriyani tanlang yoki barcha mahsulotlarni ko‘ring.',
    allProducts: 'Barcha mahsulotlar',
    showMore: 'Yana ko‘rsatish',
    resultActions: 'Keyin nima qilamiz?',
    details: 'Batafsil',
    compare: 'Solishtirish',
    showComparison: 'Solishtirishni ko‘rsatish',
    clearComparison: 'Solishtirishni tozalash',
    comparisonTitle: 'Tasdiqlangan ma’lumotlarni solishtirish.',
    comparisonWaiting:
      'Mahsulot qo‘shildi. Yana bitta tanlang — uchtagacha solishtirish mumkin.',
    comparisonDuplicate: 'Bu mahsulot solishtirishga avval qo‘shilgan.',
    comparisonFull:
      'Solishtirishda uchta mahsulot bor. Tanlovni tozalang yoki birini tanlang.',
    comparisonEmpty: 'Solishtirish ro‘yxati hozircha bo‘sh.',
    comparisonCleared: 'Solishtirish tozalandi.',
    comparisonCheaper: (name: string) => `Arzonrog‘i: ${name}.`,
    comparisonPriceTie: 'Tanlangan mahsulotlarning narxi teng.',
    comparisonCloser: (name: string) => `So‘rovga yaqinrog‘i: ${name}.`,
    comparisonRelevanceTie:
      'Tasdiqlangan moslik bo‘yicha aniq yetakchi yo‘q.',
    requestMatch: 'So‘rovga mosligi',
    matchedRequirements: 'Tasdiqlangan mosliklar',
    missingRequirements: 'Parametrlar bo‘yicha ma’lumot yo‘q',
    noMissingRequirements: 'aniqlanmadi',
    chooseProduct: 'Shuni tanlash',
    changeParameters: 'Parametrlarni o‘zgartirish',
    orderAction: 'Buyurtma berish',
    askSeller: 'Sotuvchidan so‘rash',
    similar: 'O‘xshashlar',
    store: 'Do‘kon',
    specifications: 'Xususiyatlar',
    languagePrompt: 'Interfeys tilini tanlang.',
    languageChanged: 'Interfeys tili o‘zgartirildi.',
    russian: 'Русский',
    uzbek: 'O‘zbekcha',
    sellerPrompt:
      '«Sotuvchini chaqir» deb savolingizni bitta xabarda yozing — uni shu do‘kon sotuvchisiga yuboraman.',
    sellerInterest:
      'Bormi sotuvchilar uchun do‘konga tekshirilgan katalogni ko‘rsatish va Telegramda arizalar olishga yordam beradi.\n\nHozir do‘konlar faqat taklif bilan ulanadi. Bu qatnashish istagi, kirish huquqi emas: tugma sotuvchi panelini ochmaydi va do‘kon yaratmaydi.\n\nTekshiruv uchun do‘kon kategoriyasi, kelishilgan kichik mahsulotlar to‘plami, UZSdagi butun narxlar, dolzarb qoldiq, egasi kontakti hamda rozilik va javob tezligi uchun mas’ullar kerak. Jamoa arizani tekshiradi va Siz bilan bog‘lanadi.',
    sellerHow: 'Bu qanday ishlaydi',
    sellerHowText:
      'Loyiha administratori egani, katalogni va mahsulot ma’lumotlari manbasini tekshiradi. Bu xaridorlarni tasdiqlanmagan narx va qoldiqlardan himoya qiladi. Tasdiqlangandan keyin sotuvchiga mahsulotlar, arizalar, savollar va aniq statistika ochiladi.\n\nBu tugma orqali mustaqil do‘kon yaratib yoki sotuvchi huquqini olib bo‘lmaydi. Pilot muddati, narxi va natijasi hali kelishilmagan.',
    backToShopping: 'Xaridga qaytish',
    help:
      'Katalog va kategoriyalarni ko‘rsataman, tavsif yoki byudjet bo‘yicha mahsulot topaman, variantlarni solishtiraman, ariza yuboraman va buyurtmalaringizni ko‘rsataman.',
    humanHint:
      'Odam kerakmi? «Sotuvchini chaqir» deb savolingizni yozing.',
    budgetPrompt:
      'Maksimal byudjetni so‘mda yozing — raqam yoki so‘z bilan yozish mumkin.',
    budgetConfirm: (amount: string) =>
      `${amount}ni maksimal byudjet sifatida ishlataymi?`,
    budgetUse: 'Ha, bu byudjet',
    numberSearch: 'Yo‘q, model sifatida izlash',
    noResult:
      'Bu do‘konda mos mahsulot topilmadi. So‘rovni o‘zgartiring, kategoriyalarni oching yoki sotuvchini chaqiring.',
    stale:
      'Bu tugma eskirgan yoki avval ishlatilgan. Amaldagi bo‘limni oching.',
    runtimeFailure:
      'Hozir so‘rovni bajarib bo‘lmadi. Katalog va buyurtmalaringiz ishlashda davom etadi.',
    orderHistory: 'Oxirgi buyurtmalaringiz.',
    orderHistoryEmpty: 'Hali rasmiylashtirilgan buyurtmangiz yo‘q.',
    order: 'Buyurtma',
    product: 'Mahsulot',
    quantity: 'Miqdor',
    total: 'Summa',
    status: 'Holat',
    date: 'Sana',
  },
} as const;

export function homeChoices(locale: Locale): readonly OutboundChoice[] {
  const copy = BUYER_COPY[locale];
  return [
    { id: 'buyer-find', label: copy.find },
    { id: 'buyer-catalog-open', label: copy.catalog },
    { id: 'buyer-orders', label: copy.orders },
    { id: 'buyer-seller-mode', label: copy.sellerMode },
    { id: 'buyer-more', label: copy.more },
  ];
}

export function recoveryChoices(locale: Locale): readonly OutboundChoice[] {
  const copy = BUYER_COPY[locale];
  return [
    { id: 'buyer-catalog-open', label: copy.catalog },
    { id: 'buyer-home', label: copy.homeButton },
  ];
}

export function homeResponse(locale: Locale): RuntimeResponseDraft {
  const copy = BUYER_COPY[locale];
  return {
    messages: [{
      text: `${copy.home}\n\n${copy.syntheticNotice}`,
      choices: homeChoices(locale),
    }],
    claims: [],
  };
}

export function staleResponse(locale: Locale): RuntimeResponseDraft {
  return {
    messages: [{
      text: BUYER_COPY[locale].stale,
      choices: recoveryChoices(locale),
    }],
    claims: [],
  };
}
