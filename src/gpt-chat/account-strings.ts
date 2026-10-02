// RU/UZ copy of the pack window (lazy part chat-account): it loads with the
// window, not with the chat. Words the chat itself shows — the pill, the
// buttons that open the window, the paid status line — stay in i18n.ts.
// Same rules as there: «AI-пакет» / «AI paket», no subscription tier
// (tests/gpt-chat-honesty.test.ts), o‘ and g‘ with U+2018.
import type { Locale } from './types';

export interface AccountStrings {
  title: string; price: string; benefits: string;
  /** The pack window's list, one fact per line. */
  packFeatures: string[];
  login: string; loginConsent: string; loginFailed: string; refunded: string;
  unavailable: string; logout: string; terms: string;
  active: string;
  expires: string; remaining: string; renew: string; refund: string; refundPending: string;
  failed: string; pending: string; cancelled: string; expired: string; test: string;
  receipt: string; refundReceipt: string;
  /** The pack window while the account view is being read. */
  checking: string;
  termsChanged: string; termsMissing: string;
  /** A pending invoice: going back to it creates no new one. */
  resumeNote: string; resume: string;
  /** Sign-in through the bot (AiBotLogin.tsx). Steps take the bot's @username. */
  botLoginSteps: (bot: string) => string[];
  botLoginCodeSteps: (bot: string) => string[];
  botLoginOpen: string; botLoginCopy: string; botLoginCopied: string; botLoginRestart: string;
  /** Time left as m:ss. */
  botLoginWaiting: (left: string) => string;
  botLoginClaimed: (code: string) => string;
  botLoginCodeClaimed: string; botLoginCodeLabel: string; botLoginCodeSubmit: string;
  botLoginDone: string; botLoginRejected: string; botLoginExpired: string; botLoginWarning: string;
}

const RU: AccountStrings = {
  title: 'AI-пакет: больше ответов в этом чате',
  price: '20 000 сум · 1 месяц · 300 ответов',
  benefits: '300 ответов на 1 календарный месяц с дня оплаты, до 50 в день. Без автосписаний.',
  packFeatures: [
    'Действует 1 календарный месяц с дня оплаты.',
    '300 ответов, до 50 в день.',
    'Ответы, оборвавшиеся из-за сбоя или на пределе длины, не списываются.',
    'Бесплатный лимит сохраняется: закончится пакет — бесплатный чат продолжит работать.',
  ],
  login: 'Войти через Telegram',
  loginConsent: 'Согласен на создание аккаунта по идентификатору Telegram. Не запрашиваем телефон, имя и доступ к переписке.',
  loginFailed: 'Вход не завершён. Попробуйте войти через Telegram ещё раз.',
  refunded: 'Платёжная система подтвердила возврат. Доступ по этому платежу отключён.',
  unavailable: 'Оплата сейчас недоступна. Бесплатный чат работает.',
  logout: 'Выйти',
  terms: 'Принимаю условия публичной оферты',
  active: 'AI-пакет активен',
  expires: 'Оплачен до',
  remaining: 'ответов осталось в этом периоде',
  renew: 'Период скоро закончится. Новый пакет начнёт действовать сразу после оплаты.',
  refund: 'Запросить возврат',
  refundPending: 'Запрос на возврат принят. Доступ сохраняется до решения.',
  failed: 'Статус не получен. Если уже платили, проверьте статус перед повторной оплатой.',
  pending: 'Ожидаем подтверждение оплаты. Возврат с платёжной страницы сам по себе не подтверждает платёж.',
  cancelled: 'Платёж отменён. При списании обратитесь в поддержку провайдера.',
  expired: 'Оплаченный период закончился.',
  test: 'Тестовый режим: реальные деньги не списываются.',
  receipt: 'Фискальный чек',
  refundReceipt: 'Чек возврата',
  checking: 'Проверяем состояние аккаунта…',
  termsChanged: 'Условия оплаты обновились. Не повторяйте ожидающий платёж — сначала проверьте его статус.',
  termsMissing: 'Условия оплаты пока недоступны.',
  resumeNote: 'Возврат к существующему счёту. Новый счёт не создаётся.',
  resume: 'Продолжить этот платёж',
  botLoginSteps: (bot) => [
    `Нажмите «Открыть Telegram» — откроется @${bot}.`,
    'В боте нажмите это число:',
    'Вернитесь на эту страницу — вход завершится сам.',
  ],
  botLoginCodeSteps: (bot) => [
    `Нажмите «Открыть Telegram» — откроется @${bot}.`,
    'Бот пришлёт код из 6 цифр.',
    'Введите его на этой странице — и вы войдёте.',
  ],
  botLoginOpen: 'Открыть Telegram',
  botLoginCopy: 'Скопировать ссылку',
  botLoginCopied: 'Ссылка скопирована',
  botLoginRestart: 'Начать заново',
  botLoginWaiting: (left) => `Ждём подтверждения… ${left}`,
  botLoginClaimed: (code) => `Бот открыт. Нажмите в боте число ${code}.`,
  botLoginCodeClaimed: 'Бот открыт. Введите код из 6 цифр, который он прислал.',
  botLoginCodeLabel: 'Код из бота',
  botLoginCodeSubmit: 'Войти',
  botLoginDone: 'Вы вошли. Выберите способ оплаты.',
  botLoginRejected: 'Вход отклонён: число или код не совпали, или в боте нажали «Это не я». Начните заново.',
  botLoginExpired: 'Ссылка для входа истекла (10 минут). Начните заново.',
  botLoginWarning: 'Подтверждайте, только если сами нажали «Войти» на этой странице. Никому не пересылайте ссылку.',
};

const UZ: AccountStrings = {
  title: 'AI paket: shu chatda ko‘proq javob',
  price: '20 000 so‘m · 1 oy · 300 ta javob',
  benefits: 'To‘lov kunidan boshlab 1 oy davomida 300 ta javob, kuniga 50 tagacha. Avtomatik to‘lov yo‘q.',
  packFeatures: [
    'To‘lov kunidan boshlab 1 kalendar oy amal qiladi.',
    '300 ta javob, kuniga 50 tagacha.',
    'Nosozlik tufayli uzilgan yoki uzunlik chegarasida to‘xtagan javoblar hisoblanmaydi.',
    'Bepul limit ham qoladi: paket tugasa, bepul chat ishlashda davom etadi.',
  ],
  login: 'Telegram orqali kirish',
  loginConsent: 'Telegram identifikatori orqali akkaunt yaratishga roziman. Telefon, ism va yozishmalarga ruxsat so‘ramaymiz.',
  loginFailed: 'Kirish yakunlanmadi. Telegram orqali yana kirib ko‘ring.',
  refunded: 'To‘lov tizimi pul qaytarilganini tasdiqladi. Shu to‘lov bo‘yicha paket o‘chirildi.',
  unavailable: 'To‘lov hozircha mavjud emas. Bepul chat ishlayapti.',
  logout: 'Chiqish',
  terms: 'Ommaviy oferta shartlariga roziman',
  active: 'AI paket faol',
  expires: 'Amal qilish muddati',
  remaining: 'ta javob shu davr uchun qoldi',
  renew: 'Muddat tugashiga oz qoldi. Yangi paket to‘lovdan so‘ng darhol ishga tushadi.',
  refund: 'Pulni qaytarishni so‘rash',
  refundPending: 'So‘rovingiz qabul qilindi. Qaror chiqquncha xizmatdan foydalanasiz.',
  failed: 'Holatni aniqlab bo‘lmadi. To‘lagan bo‘lsangiz, yana to‘lashdan oldin holatni tekshiring.',
  pending: 'To‘lov tasdig‘ini kutyapmiz. To‘lov sahifasidan qaytish to‘lov amalga oshganini bildirmaydi.',
  cancelled: 'To‘lov bekor qilindi. Pul yechilgan bo‘lsa, to‘lov xizmati yordam markaziga murojaat qiling.',
  expired: 'To‘langan muddat tugadi.',
  test: 'Sinov rejimi: haqiqiy pul yechilmaydi.',
  receipt: 'Fiskal chek',
  refundReceipt: 'Pulni qaytarish cheki',
  checking: 'Akkaunt holati tekshirilmoqda…',
  termsChanged: 'To‘lov shartlari yangilandi. Kutilayotgan to‘lovni takrorlamang — avval holatini tekshiring.',
  termsMissing: 'To‘lov shartlari hali mavjud emas.',
  resumeNote: 'Bu mavjud hisobga qaytish. Yangi hisob yaratilmaydi.',
  resume: 'Shu to‘lovni davom ettirish',
  botLoginSteps: (bot) => [
    `«Telegramni ochish»ni bosing — @${bot} ochiladi.`,
    'Botda shu raqamni bosing:',
    'Shu sahifaga qayting — kirish o‘zi yakunlanadi.',
  ],
  botLoginCodeSteps: (bot) => [
    `«Telegramni ochish»ni bosing — @${bot} ochiladi.`,
    'Bot 6 xonali kod yuboradi.',
    'Uni shu sahifada kiriting — shunda kirasiz.',
  ],
  botLoginOpen: 'Telegramni ochish',
  botLoginCopy: 'Havolani nusxalash',
  botLoginCopied: 'Havola nusxalandi',
  botLoginRestart: 'Qaytadan boshlash',
  botLoginWaiting: (left) => `Tasdiqlash kutilmoqda… ${left}`,
  botLoginClaimed: (code) => `Bot ochildi. Endi botda ${code} raqamini bosing.`,
  botLoginCodeClaimed: 'Bot ochildi. U yuborgan 6 xonali kodni kiriting.',
  botLoginCodeLabel: 'Botdan kelgan kod',
  botLoginCodeSubmit: 'Kirish',
  botLoginDone: 'Kirdingiz. Endi to‘lov usulini tanlang.',
  botLoginRejected: 'Kirish rad etildi: raqam yoki kod mos kelmadi yoki botda «Bu men emas» bosildi. Qaytadan boshlang.',
  botLoginExpired: 'Kirish havolasining muddati tugadi (10 daqiqa). Qaytadan boshlang.',
  botLoginWarning: 'Faqat shu sahifada «Kirish»ni o‘zingiz bosgan bo‘lsangiz tasdiqlang. Havolani hech kimga yubormang.',
};

export function accountStrings(locale: Locale): AccountStrings {
  return locale === 'uz' ? UZ : RU;
}
