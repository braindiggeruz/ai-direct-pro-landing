import type { Locale } from '../types';

const copy = {
  ru: {
    appName: 'GPTBot Market',
    loading: 'Загружаем магазин…',
    retry: 'Повторить',
    offlineTitle: 'Нет соединения',
    offlineBody: 'Показываем сохранённые данные. Команды станут доступны после подключения.',
    stale: 'Данные могли измениться',
    unsupportedTitle: 'Откройте внутри Telegram',
    unsupportedBody: 'Mini App получает безопасную сессию только из Telegram.',
    unavailableTitle: 'Магазин временно недоступен',
    unavailableBody: 'Вернитесь в бот и попробуйте открыть магазин снова.',
    home: 'Главная', search: 'Поиск', compare: 'Сравнить', orders: 'Заказы',
    seller: 'Продавец', buyer: 'Покупатель',
    categories: 'Категории', featured: 'Товары', all: 'Все',
    searchPlaceholder: 'Например, наушники до 500 000',
    searchAction: 'Найти', filters: 'Фильтры', reset: 'Сбросить', apply: 'Применить',
    available: 'В наличии', preorder: 'Предзаказ', unavailable: 'Недоступен',
    details: 'Подробнее', addCompare: 'В сравнение', remove: 'Убрать', clear: 'Очистить',
    compareEmpty: 'Добавьте 2–3 товара, чтобы сравнить факты.',
    noProducts: 'Подходящих товаров пока нет',
    noProductsBody: 'Измените запрос или откройте другую категорию.',
    order: 'Оформить запрос', requestNotice: 'Это заявка продавцу, не онлайн-оплата.',
    checkout: 'Оформление', quantity: 'Количество', name: 'Имя', phone: 'Телефон',
    address: 'Адрес или ориентир', comment: 'Комментарий', optional: 'необязательно',
    continue: 'Продолжить', skip: 'Пропустить', confirm: 'Отправить заявку', cancel: 'Отменить',
    summary: 'Проверка заявки', total: 'Итого', priceChanged: 'Цена изменилась — проверьте сумму.',
    orderCreated: 'Заявка отправлена', orderCreatedBody: 'Продавец получил уведомление и подтвердит заказ.',
    askSeller: 'Задать вопрос продавцу', question: 'Ваш вопрос', send: 'Отправить',
    handoffOpen: 'Вопрос отправлен', handoffAnswered: 'Продавец ответил',
    ordersEmpty: 'Заявок пока нет',
    placed: 'Ждёт продавца', confirmed: 'Подтверждён', done: 'Выполнен', cancelled: 'Отменён',
    sellerDashboard: 'Рабочий стол', overview: 'Обзор', sellerOrders: 'Заказы', questions: 'Вопросы',
    products: 'Товары', inventory: 'Остатки', today: 'За 24 часа',
    placedCount: 'Новые заявки', openQuestions: 'Открытые вопросы', published: 'Опубликовано',
    noWork: 'Сейчас нет задач', contact: 'Контакт покупателя',
    confirmOrder: 'Подтвердить', doneOrder: 'Отметить выполненным', cancelOrder: 'Отменить заказ',
    reply: 'Ответить', replyPlaceholder: 'Короткий ответ покупателю',
    stock: 'Остаток', save: 'Сохранить', commandsOff: 'Изменения пока доступны только в боте.',
    draft: 'Черновик', publishedStatus: 'Опубликован', archived: 'Архив',
    addProduct: 'Добавить товар', edit: 'Изменить', publish: 'Опубликовать', unpublish: 'Снять с публикации',
    language: 'Язык', role: 'Режим', close: 'Закрыть', back: 'Назад',
    errorTitle: 'Не получилось загрузить', errorBody: 'Попробуйте ещё раз. Если ошибка повторится, вернитесь в бот.',
    pending: 'Сохраняем…', required: 'Заполните это поле', versionConflict: 'Данные уже изменились. Обновите экран.',
  },
  uz: {
    appName: 'GPTBot Market',
    loading: 'Do‘kon yuklanmoqda…',
    retry: 'Qayta urinish',
    offlineTitle: 'Internet yo‘q',
    offlineBody: 'Saqlangan ma’lumotlar ko‘rsatilmoqda. Internet qaytgach amallar ochiladi.',
    stale: 'Ma’lumotlar o‘zgargan bo‘lishi mumkin',
    unsupportedTitle: 'Telegram ichida oching',
    unsupportedBody: 'Mini App xavfsiz seansni faqat Telegram orqali oladi.',
    unavailableTitle: 'Do‘kon vaqtincha ishlamayapti',
    unavailableBody: 'Botga qayting va do‘konni qayta oching.',
    home: 'Bosh sahifa', search: 'Qidiruv', compare: 'Solishtirish', orders: 'Buyurtmalar',
    seller: 'Sotuvchi', buyer: 'Xaridor',
    categories: 'Toifalar', featured: 'Mahsulotlar', all: 'Barchasi',
    searchPlaceholder: 'Masalan, 500 000 gacha quloqchin',
    searchAction: 'Topish', filters: 'Filtrlar', reset: 'Tozalash', apply: 'Qo‘llash',
    available: 'Mavjud', preorder: 'Oldindan buyurtma', unavailable: 'Mavjud emas',
    details: 'Batafsil', addCompare: 'Solishtirishga', remove: 'Olib tashlash', clear: 'Tozalash',
    compareEmpty: 'Faktlarni solishtirish uchun 2–3 mahsulot qo‘shing.',
    noProducts: 'Mos mahsulot topilmadi',
    noProductsBody: 'So‘rovni o‘zgartiring yoki boshqa toifani oching.',
    order: 'So‘rov yuborish', requestNotice: 'Bu sotuvchiga so‘rov, onlayn to‘lov emas.',
    checkout: 'Rasmiylashtirish', quantity: 'Miqdor', name: 'Ism', phone: 'Telefon',
    address: 'Manzil yoki mo‘ljal', comment: 'Izoh', optional: 'ixtiyoriy',
    continue: 'Davom etish', skip: 'O‘tkazib yuborish', confirm: 'So‘rovni yuborish', cancel: 'Bekor qilish',
    summary: 'So‘rovni tekshirish', total: 'Jami', priceChanged: 'Narx o‘zgardi — summani tekshiring.',
    orderCreated: 'So‘rov yuborildi', orderCreatedBody: 'Sotuvchi xabarnoma oldi va buyurtmani tasdiqlaydi.',
    askSeller: 'Sotuvchiga savol', question: 'Savolingiz', send: 'Yuborish',
    handoffOpen: 'Savol yuborildi', handoffAnswered: 'Sotuvchi javob berdi',
    ordersEmpty: 'Hozircha so‘rovlar yo‘q',
    placed: 'Sotuvchini kutmoqda', confirmed: 'Tasdiqlangan', done: 'Bajarilgan', cancelled: 'Bekor qilingan',
    sellerDashboard: 'Ish stoli', overview: 'Ko‘rib chiqish', sellerOrders: 'Buyurtmalar', questions: 'Savollar',
    products: 'Mahsulotlar', inventory: 'Qoldiq', today: '24 soat ichida',
    placedCount: 'Yangi so‘rovlar', openQuestions: 'Ochiq savollar', published: 'E’lon qilingan',
    noWork: 'Hozir vazifalar yo‘q', contact: 'Xaridor kontakti',
    confirmOrder: 'Tasdiqlash', doneOrder: 'Bajarildi deb belgilash', cancelOrder: 'Buyurtmani bekor qilish',
    reply: 'Javob berish', replyPlaceholder: 'Xaridorga qisqa javob',
    stock: 'Qoldiq', save: 'Saqlash', commandsOff: 'O‘zgartirishlar hozircha faqat botda.',
    draft: 'Qoralama', publishedStatus: 'E’lon qilingan', archived: 'Arxiv',
    addProduct: 'Mahsulot qo‘shish', edit: 'O‘zgartirish', publish: 'E’lon qilish', unpublish: 'E’londan olish',
    language: 'Til', role: 'Rejim', close: 'Yopish', back: 'Orqaga',
    errorTitle: 'Yuklab bo‘lmadi', errorBody: 'Qayta urinib ko‘ring. Xato takrorlansa, botga qayting.',
    pending: 'Saqlanmoqda…', required: 'Maydonni to‘ldiring', versionConflict: 'Ma’lumot o‘zgargan. Sahifani yangilang.',
  },
} as const;

export type CopyKey = keyof typeof copy.ru;

export function t(locale: Locale, key: CopyKey): string {
  return copy[locale][key];
}

export function formatPrice(value: number, locale: Locale): string {
  return `${new Intl.NumberFormat(locale === 'uz' ? 'uz-UZ' : 'ru-RU').format(value)} so‘m`;
}

export function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'uz' ? 'uz-UZ' : 'ru-RU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}
