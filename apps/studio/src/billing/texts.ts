/**
 * The words of the studio's tariffs, checkout, «Mening paketim» and the
 * page after payment, Uzbek (Latin, ‘ in o‘ and g‘, ’ for the tutuq belgisi)
 * and Russian. DECISIONS 07.10.2026 §1(д), §4, §11, §13 п. 3: no lawyer and
 * no native reader will check them; stream F finalises the card lines by the
 * photo gate.
 *
 * Neutral by law (ЗРУ-776 ст. 17, the page is read by schoolchildren): the
 * section is «Tariflar»; no «sotib oling», no timer, no «N places left», no
 * tariff chosen in advance, nothing that asks a child to ask a parent. A
 * neutral price is required (ЗРУ-792 ст. 16), so it is shown even while
 * sales are off, with «To‘lov vaqtincha to‘xtatilgan».
 *
 * Sums are written with a no-break space between thousands (formatSum), so
 * «39 900» never breaks across lines on a narrow phone.
 *
 * Every line follows the plan the server sends (/config `plans`): a tariff
 * without photo tasks never mentions photos.
 */
import type { StudioLocale, StudioPlanId, StudioProvider } from '../api';

/** The plan's contents as /config gives them. */
export interface PlanContents {
  readonly presentationFull: number;
  readonly photoTask: number;
  readonly amountUzs: number;
}

export interface BillingTexts {
  readonly heading: string;
  readonly free: string;
  readonly plan: (plan: StudioPlanId, contents: PlanContents) => string;
  readonly planName: Readonly<Record<StudioPlanId | 'credit', string>>;
  readonly choose: Readonly<Record<StudioPlanId, string>>;
  readonly chatPack: string;
  readonly chatPackLink: string;
  readonly noSubscription: string;
  readonly payWith: (providers: readonly StudioProvider[]) => string;
  readonly refund: string;
  readonly offer: string;
  readonly paused: string;
  readonly summary: (plan: StudioPlanId, contents: PlanContents) => string;
  readonly consent: string;
  readonly providerLabel: string;
  readonly pay: string;
  readonly paying: string;
  readonly close: string;
  readonly testOrder: (orderId: string) => string;
  readonly statusOrder: string;
  readonly orderOpen: string;
  readonly cancelOpen: string;
  readonly messages: Readonly<Record<BillingMessage, string>>;
  readonly myPack: string;
  readonly myPackShow: string;
  readonly myPackEmpty: string;
  readonly left: (presentations: number, photos: number, withPhotos: boolean) => string;
  readonly until: (when: string) => string;
  readonly orderNumber: string;
  readonly paymentNumber: string;
  readonly keepNumber: string;
  readonly receipt: string;
  readonly returnChecking: string;
  readonly returnPaid: string;
  readonly returnPending: string;
  readonly returnCancelled: string;
  readonly returnNone: string;
  readonly orderState: Readonly<Record<'pending' | 'prepared' | 'paid' | 'cancelled' | 'refunded', string>>;
}

export type BillingMessage =
  | 'terms_changed'
  | 'order_open'
  | 'paused'
  | 'rate_limited'
  | 'turnstile'
  | 'consent'
  | 'connection'
  | 'busy';

const PROVIDER_NAME: Readonly<Record<StudioProvider, string>> = { payme: 'Payme', click: 'Click' };

/** 39900 → "39 900" with a no-break space (U+00A0) between thousands. */
export function formatSum(amount: number): string {
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const providerList = (providers: readonly StudioProvider[]) => providers.map((provider) => PROVIDER_NAME[provider]).join(', ');

export const BILLING_TEXTS: Readonly<Record<StudioLocale, BillingTexts>> = {
  uz: {
    heading: 'Tariflar',
    free: 'Bepul: kuniga 1 ta taqdimot (6 slayd, 2 rasm).',
    plan: (plan, c) =>
      plan === 'oylik'
        ? c.photoTask > 0
          ? `1 oy: ${c.presentationFull} ta taqdimot, ${c.photoTask} ta rasmdagi masala — ${formatSum(c.amountUzs)} so‘m`
          : `1 oy: ${c.presentationFull} ta to‘liq taqdimot — ${formatSum(c.amountUzs)} so‘m`
        : c.photoTask > 0
          ? `Faqat bugun kerakmi? 24 soat: ${c.presentationFull} ta to‘liq taqdimot + ${c.photoTask} ta rasmdagi masala — ${formatSum(c.amountUzs)} so‘m`
          : `Faqat bugun kerakmi? 24 soat: ${c.presentationFull} ta to‘liq taqdimot — ${formatSum(c.amountUzs)} so‘m`,
    planName: { kunlik: 'Kunlik', oylik: 'Oylik', credit: 'Qaytarilgan birlik' },
    choose: { oylik: 'Oylikni tanlash', kunlik: 'Kunlikni tanlash' },
    chatPack: 'Faqat chat uchun: 300 javob, kuniga 50 tagacha, 1 oy — 20 000 so‘m.',
    chatPackLink: 'AI chat',
    noSubscription: 'Obunasiz: pul avtomatik yechilmaydi.',
    payWith: (providers) => `To‘lov: ${providerList(providers)}.`,
    refund: 'Ishlatilmagan birliklar uchun pulni to‘lovdan keyin 14 kun ichida so‘rov bo‘yicha qaytaramiz.',
    offer: 'Ommaviy oferta',
    paused: 'To‘lov vaqtincha to‘xtatilgan.',
    summary: (plan, c) =>
      plan === 'oylik'
        ? `Oylik — ${formatSum(c.amountUzs)} so‘m, 1 oy (kalendar oy)`
        : `Kunlik — ${formatSum(c.amountUzs)} so‘m, 24 soat`,
    consent: '«To‘lovga o‘tish» tugmasini bosib, ommaviy oferta shartlarini qabul qilaman. 18 yoshga to‘lmagan bo‘lsam — ota-onam rozi.',
    providerLabel: 'To‘lov usuli',
    pay: 'To‘lovga o‘tish',
    paying: 'Kuting…',
    close: 'Yopish',
    testOrder: (orderId) => `Sinov buyurtmasi yaratildi: ${orderId}`,
    statusOrder: 'Bu buyurtma bo‘yicha to‘lov allaqachon boshlangan. Holatini «Mening paketim»da ko‘ring.',
    orderOpen: 'Sizda boshqa ochiq buyurtma bor.',
    cancelOpen: 'Uni bekor qilish',
    messages: {
      terms_changed: 'Oferta yangilandi. Sahifani yangilab, qayta tanlang.',
      order_open: 'Sizda boshqa ochiq buyurtma bor.',
      paused: 'To‘lov vaqtincha to‘xtatilgan.',
      rate_limited: 'Urinishlar juda ko‘p. Birozdan keyin qayta urinib ko‘ring.',
      turnstile: 'Tekshiruvdan o‘tilmadi. Qayta urinib ko‘ring.',
      consent: 'Davom etish uchun oferta shartlariga rozilikni belgilang.',
      connection: 'Internet bilan aloqa uzildi. Qayta urinib ko‘ring.',
      busy: 'Vaqtincha ishlamayapti. Birozdan keyin qayta urinib ko‘ring.',
    },
    myPack: 'Mening paketim',
    myPackShow: 'Mening paketimni ko‘rish',
    myPackEmpty: 'Bu brauzerda faol tarif yo‘q.',
    left: (presentations, photos, withPhotos) =>
      withPhotos ? `Qoldi: ${presentations} ta taqdimot, ${photos} ta rasmdagi masala` : `Qoldi: ${presentations} ta taqdimot`,
    until: (when) => `${when} gacha`,
    orderNumber: 'Buyurtma raqami',
    paymentNumber: 'To‘lov raqami',
    keepNumber: 'To‘lov raqamini saqlang: brauzer tozalansa, tarifni u bilan tiklaymiz.',
    receipt: 'Chek',
    returnChecking: 'To‘lov tekshirilmoqda…',
    returnPaid: 'To‘lov qabul qilindi. Tarif faol.',
    returnPending: 'To‘lov hali tasdiqlanmadi. Bir necha daqiqadan keyin sahifani yangilang.',
    returnCancelled: 'To‘lov bekor qilindi. Pul yechilgan bo‘lsa, qaytariladi.',
    returnNone: 'Bu brauzerda buyurtma topilmadi.',
    orderState: {
      pending: 'to‘lov kutilmoqda',
      prepared: 'to‘lov jarayonda',
      paid: 'to‘langan',
      cancelled: 'bekor qilingan',
      refunded: 'pul qaytarilgan',
    },
  },
  ru: {
    heading: 'Тарифы',
    free: 'Бесплатно: 1 презентация в день (6 слайдов, 2 картинки).',
    plan: (plan, c) =>
      plan === 'oylik'
        ? c.photoTask > 0
          ? `1 месяц: ${c.presentationFull} презентаций, ${c.photoTask} задач по фото — ${formatSum(c.amountUzs)} сум`
          : `1 месяц: ${c.presentationFull} полных презентаций — ${formatSum(c.amountUzs)} сум`
        : c.photoTask > 0
          ? `Нужно только сегодня? 24 часа: ${c.presentationFull} полная презентация + ${c.photoTask} задач по фото — ${formatSum(c.amountUzs)} сум`
          : `Нужно только сегодня? 24 часа: ${c.presentationFull} полная презентация — ${formatSum(c.amountUzs)} сум`,
    planName: { kunlik: 'Kunlik (сутки)', oylik: 'Oylik (месяц)', credit: 'Возвращённая единица' },
    choose: { oylik: 'Выбрать Oylik', kunlik: 'Выбрать Kunlik' },
    chatPack: 'Только для чата: 300 ответов, до 50 в день, 1 месяц — 20 000 сум.',
    chatPackLink: 'AI-чат',
    noSubscription: 'Без подписки: деньги не списываются автоматически.',
    payWith: (providers) => `Оплата: ${providerList(providers)}.`,
    refund: 'За неиспользованные единицы вернём деньги по заявлению в течение 14 дней после оплаты.',
    offer: 'Публичная оферта',
    paused: 'Оплата временно приостановлена.',
    summary: (plan, c) =>
      plan === 'oylik'
        ? `Oylik — ${formatSum(c.amountUzs)} сум, 1 календарный месяц`
        : `Kunlik — ${formatSum(c.amountUzs)} сум, 24 часа`,
    consent: 'Нажимая «Перейти к оплате», принимаю условия публичной оферты. Если мне нет 18 лет — родители согласны.',
    providerLabel: 'Способ оплаты',
    pay: 'Перейти к оплате',
    paying: 'Подождите…',
    close: 'Закрыть',
    testOrder: (orderId) => `Тестовый заказ создан: ${orderId}`,
    statusOrder: 'Оплата этого заказа уже начата. Состояние — в «Мой пакет».',
    orderOpen: 'У вас есть другой открытый заказ.',
    cancelOpen: 'Отменить его',
    messages: {
      terms_changed: 'Оферта обновилась. Обновите страницу и выберите тариф снова.',
      order_open: 'У вас есть другой открытый заказ.',
      paused: 'Оплата временно приостановлена.',
      rate_limited: 'Слишком много попыток. Попробуйте чуть позже.',
      turnstile: 'Проверка не пройдена. Попробуйте ещё раз.',
      consent: 'Чтобы продолжить, отметьте согласие с условиями оферты.',
      connection: 'Нет связи с интернетом. Попробуйте ещё раз.',
      busy: 'Временно не работает. Попробуйте чуть позже.',
    },
    myPack: 'Мой пакет',
    myPackShow: 'Показать мой пакет',
    myPackEmpty: 'В этом браузере нет действующего тарифа.',
    left: (presentations, photos, withPhotos) =>
      withPhotos ? `Осталось: презентаций — ${presentations}, задач по фото — ${photos}` : `Осталось презентаций: ${presentations}`,
    until: (when) => `до ${when}`,
    orderNumber: 'Номер заказа',
    paymentNumber: 'Номер платежа',
    keepNumber: 'Сохраните номер платежа: если браузер очистится, по нему мы восстановим тариф.',
    receipt: 'Чек',
    returnChecking: 'Проверяем оплату…',
    returnPaid: 'Оплата получена. Тариф действует.',
    returnPending: 'Оплата ещё не подтверждена. Обновите страницу через несколько минут.',
    returnCancelled: 'Оплата отменена. Если деньги списались, они вернутся.',
    returnNone: 'В этом браузере заказ не найден.',
    orderState: {
      pending: 'ожидает оплаты',
      prepared: 'оплата в процессе',
      paid: 'оплачен',
      cancelled: 'отменён',
      refunded: 'деньги возвращены',
    },
  },
};

/** The message of a checkout failure code (the server's closed list, or the browser's own). */
export function billingMessage(code: string): BillingMessage {
  switch (code) {
    case 'terms_changed':
      return 'terms_changed';
    case 'order_open':
      return 'order_open';
    case 'checkout_unavailable':
    case 'provider_unavailable':
    case 'not_found':
      return 'paused';
    case 'rate_limited':
    case 'try_later':
      return 'rate_limited';
    case 'turnstile_failed':
    case 'turnstile_required':
    case 'turnstile_unavailable':
      return 'turnstile';
    case 'network':
    case 'timeout':
      return 'connection';
    default:
      return 'busy';
  }
}

/** "HH:MM, DD.MM.YYYY" in Tashkent (UTC+5 all year), for an ISO time. */
export function tashkentDateTime(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const d = new Date(at + 5 * 3_600_000);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}, ${two(d.getUTCDate())}.${two(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** The page's locale from <html lang>. */
export function billingLocale(lang: string | null | undefined): StudioLocale {
  return lang === 'ru' ? 'ru' : 'uz';
}
