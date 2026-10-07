// RU/UZ copy of the pack window (lazy part chat-account): it loads with the
// window, not with the chat. Words the chat itself shows — the pill, the
// buttons that open the window, the paid status line — stay in i18n.ts.
// Same rules as there: «AI-пакет» / «AI paket», no subscription tier
// (tests/gpt-chat-honesty.test.ts), o‘ and g‘ with U+2018. Every number of
// the pack (price, answers, day cap, months) comes from the server's account
// view and is passed in; none is written here.
import type { Locale } from './types';
import { ru, strings } from './i18n';

export interface AccountStrings {
  title: string;
  /** The window's description for screen readers. */
  benefits: (months: number, messages: number, daily: number) => string;
  price: (sum: string, months: number, messages: number) => string;
  /** The price alone, big: «20 000 сум». The pack's facts follow in i18n premium.packLine. */
  sum: (sum: string) => string;
  /** One muted line for the folded notes (not refundable, not ChatGPT), before «Подробнее». */
  fine: string;
  /** The pack window's list, one fact per line. */
  packFeatures: (months: number, messages: number, daily: number) => string[];
  /** What the pack is and is not: no ChatGPT, no OpenAI. */
  honesty: string;
  /** Beside the price, before paying: a paid pack is not refundable (the offer, section 8). */
  noRefund: string;
  /** Why a guest signs in before paying. */
  loginWhy: string;
  /** Guest checkout: no sign-in, the pack starts in this browser. */
  guestPayNote: string;
  /** Beside guest checkout: a pack bought after signing in is reached by signing in. */
  haveAccount: string;
  /** A guest's pack: keep it through Telegram for any phone. */
  saveLine: string; saveButton: string;
  /** Beside guest checkout: a pack bought without signing in lives in the browser that paid. */
  otherBrowser: string;
  /** The browser did not keep the guest account's cookie: no guest checkout here. */
  cookiesBlocked: string;
  login: string; loginConsent: string; loginFailed: string; refunded: string;
  unavailable: string; logout: string;
  active: string;
  /** "120 / 300", then this. */
  remaining: string;
  /** "420 / 600", then this, when `packs` run side by side. */
  remainingPacks: (packs: number) => string;
  /** Packs side by side: the one turns draw from first, and what is left in it. */
  firstPack: (left: number, date: string) => string;
  today: (left: number, daily: number) => string;
  until: (date: string) => string;
  renew: string;
  noPack: string;
  freeLeft: (left: number) => string;
  /** Before the studio's e-mail and phone: where a payment problem (a double charge) goes. */
  supportLabel: string;
  failed: string; pending: string; cancelled: string; expired: string; test: string;
  receipt: string; refundReceipt: string;
  /** The pack window while the account view is being read. */
  checking: string;
  termsChanged: string; termsMissing: string;
  /** A pending invoice: going back to it creates no new one. */
  resumeNote: string; resume: string;
  /** An open invoice no provider has seen yet: it can be closed to pay another way. */
  cancelInvoice: string;
  cancelInvoiceNote: (provider: string) => string;
  /** An open invoice the provider holds: it closes by itself. */
  invoiceHeld: (provider: string) => string;
  /** The provider took the invoice up while it was being closed. */
  cancelFailed: string;
  /** Back from paying, not paid: return to the invoice or choose another way. */
  payChange: string; payChangeNote: string;
  /** Pay buttons: "Click", "Uzum Bank", "Payme"; the text is i18n premium.payVia, shared with the limit card. */
  payVia: (provider: string) => string;
  /** Uzum through the Merchant API: a code in the Uzum Bank app. */
  payInApp: string;
  /** Providers joined with `or`. */
  payNote: (providers: string) => string;
  or: string;
  payRedirecting: string; payChecking: string; payCheckingNote: string;
  payPaid: string; payPendingLong: string; payBackToChat: string; payTestNoPage: string;
  /** After a cancelled payment: back to the pay buttons. */
  payAgain: string;
  payPendingElsewhere: (provider: string) => string;
  uzumCodeTitle: string;
  /** The app's steps; the code itself follows the second one. */
  uzumCodeSteps: (service: string, sum: string) => string[];
  uzumCodeCopy: string; uzumCodeCopied: string; uzumCodeNote: string;
  /** Sign-in through the bot (BotLoginScreen.tsx). Steps take the bot's @username. */
  botLoginSteps: (bot: string) => string[];
  botLoginCodeSteps: (bot: string) => string[];
  botLoginOpen: string; botLoginCopy: string; botLoginCopied: string; botLoginRestart: string;
  /** Time left as m:ss. */
  botLoginWaiting: (left: string) => string;
  botLoginClaimed: (code: string) => string;
  botLoginCodeClaimed: string; botLoginCodeLabel: string; botLoginCodeSubmit: string;
  botLoginDone: string; botLoginRejected: string; botLoginExpired: string; botLoginWarning: string;
}

const answers = (n: number) => `${n} ${ru(n, 'ответ', 'ответа', 'ответов')}`;
const months = (n: number) => `${n} ${ru(n, 'календарный месяц', 'календарных месяца', 'календарных месяцев')}`;

const RU: AccountStrings = {
  title: 'AI-пакет: больше ответов в этом чате',
  benefits: (m, n, d) => `${answers(n)} на ${months(m)} с дня оплаты, до ${d} в день. Без автосписаний.`,
  price: (sum, m, n) => `${sum} сум · ${m} ${ru(m, 'месяц', 'месяца', 'месяцев')} · ${answers(n)}`,
  sum: (sum) => `${sum} сум`,
  fine: 'Без возврата после оплаты · не ChatGPT',
  packFeatures: (m, n, d) => [
    `Действует ${months(m)} с дня оплаты.`,
    `${answers(n)}, до ${d} в день.`,
    'Ответы, оборвавшиеся из-за сбоя или на пределе длины, не списываются.',
    'Бесплатный лимит сохраняется: закончится пакет — бесплатный чат продолжит работать.',
  ],
  honesty: 'Это ответы в чате GPTBot.uz, а не доступ к ChatGPT. Сервис не связан с OpenAI.',
  noRefund: 'Деньги за оплаченный пакет не возвращаются: он начинает действовать сразу после оплаты.',
  loginWhy: 'Пакет закрепляется за аккаунтом, поэтому сначала войдите через Telegram.',
  guestPayNote: 'Входить не нужно: пакет заработает в этом браузере сразу после оплаты.',
  haveAccount: 'Уже покупали пакет со входом через Telegram? Войдите — он появится здесь.',
  saveLine: 'Сохраните пакет через Telegram — чтобы он работал в другом браузере и на другом телефоне.',
  saveButton: 'Сохранить через Telegram',
  otherBrowser: 'Оплатили без входа в другом браузере (например, внутри Telegram)? Откройте сайт там и нажмите «Сохранить через Telegram» — или напишите нам и приложите чек Click.',
  cookiesBlocked: 'Браузер не сохраняет cookie — оплата без входа здесь не сработает. Разрешите cookie или войдите через Telegram.',
  login: 'Войти через Telegram',
  loginConsent: 'Согласен на создание аккаунта по идентификатору Telegram. Не запрашиваем телефон, имя и доступ к переписке.',
  loginFailed: 'Вход не завершён. Попробуйте войти через Telegram ещё раз.',
  refunded: 'Платёжная система подтвердила возврат. Доступ по этому платежу отключён.',
  unavailable: 'Оплата сейчас недоступна. Бесплатный чат работает.',
  logout: 'Выйти',
  active: 'AI-пакет активен',
  remaining: 'ответов осталось в пакете',
  remainingPacks: () => 'ответов осталось в пакетах',
  firstPack: (n, date) => `Сначала тратится пакет до ${date}: в нём ${ru(n, 'остался', 'осталось', 'осталось')} ${answers(n)}.`,
  today: (n, d) => `Сегодня можно ещё ${n} (до ${d} в день)`,
  until: (date) => `Действует до ${date}`,
  renew: 'Пакет скоро закончится. Новый можно купить в любой момент — он начнёт действовать сразу.',
  noPack: 'Активного пакета нет.',
  freeLeft: (n) => `Бесплатно на сегодня осталось: ${n}.`,
  supportLabel: 'Проблема с оплатой? Напишите или позвоните:',
  failed: 'Статус не получен. Если уже платили, проверьте статус перед повторной оплатой.',
  pending: 'Ожидаем подтверждение оплаты. Возврат с платёжной страницы сам по себе не подтверждает платёж.',
  cancelled: 'Платёж отменён, пакет не подключён. Если деньги всё же списаны, напишите нам — разберёмся.',
  expired: 'Оплаченный период закончился.',
  test: 'Тестовый режим: реальные деньги не списываются.',
  receipt: 'Фискальный чек',
  refundReceipt: 'Чек возврата',
  checking: 'Проверяем состояние аккаунта…',
  termsChanged: 'Условия оплаты обновились. Не повторяйте ожидающий платёж — сначала проверьте его статус.',
  termsMissing: 'Условия оплаты пока недоступны.',
  resumeNote: 'Возврат к существующему счёту. Новый счёт не создаётся.',
  resume: 'Продолжить этот платёж',
  cancelInvoice: 'Отменить этот счёт',
  cancelInvoiceNote: (provider) => `${provider} ещё не получил этот счёт: его можно отменить и оплатить другим способом.`,
  invoiceHeld: (provider) => `Этот счёт уже открыт в ${provider}. Если вы не оплатили, он закроется сам, и тогда можно выбрать другой способ.`,
  cancelFailed: 'Платёжная система уже приняла этот счёт, отменить его нельзя. Проверьте статус.',
  payChange: 'Продолжить или сменить способ оплаты',
  payChangeNote: 'Не оплатили? Можно вернуться к этому счёту или выбрать другой способ оплаты.',
  payVia: strings('ru').premium.payVia,
  payInApp: 'Оплатить в приложении Uzum Bank',
  payNote: (providers) => `Данные карты к нам не попадают: оплата проходит на стороне ${providers}.`,
  or: ' или ',
  payRedirecting: 'Переходим на страницу оплаты…',
  payChecking: 'Проверяем оплату…',
  payCheckingNote: 'Обычно это занимает до минуты. Не платите повторно.',
  payPaid: 'Оплата получена. AI-пакет активен.',
  payPendingLong: 'Оплата ещё не подтверждена. Если деньги списаны, пакет включится в течение нескольких минут — не платите повторно.',
  payBackToChat: 'Вернуться в чат',
  payTestNoPage: 'Тестовый режим: страница оплаты не открывается.',
  payAgain: 'Попробовать ещё раз',
  payPendingElsewhere: (provider) => `Счёт через ${provider} ещё открыт, второй не создаём. Что с ним можно сделать — ниже.`,
  uzumCodeTitle: 'Оплата в приложении Uzum Bank',
  uzumCodeSteps: (service, sum) => [
    'Откройте приложение Uzum Bank и раздел «Платежи».',
    `Найдите «${service}» и введите код:`,
    `Оплатите ${sum} сум — пакет включится на этой странице сам.`,
  ],
  uzumCodeCopy: 'Скопировать код',
  uzumCodeCopied: 'Код скопирован',
  uzumCodeNote: 'Код закреплён за вашим аккаунтом и не меняется.',
  botLoginSteps: (bot) => [
    `Нажмите «Открыть Telegram» — откроется @${bot}. Если там есть кнопка «Запустить» (Start), нажмите её.`,
    'В боте нажмите это число:',
    'Вернитесь на эту страницу — вход завершится сам.',
  ],
  botLoginCodeSteps: (bot) => [
    `Нажмите «Открыть Telegram» — откроется @${bot}. Если там есть кнопка «Запустить» (Start), нажмите её.`,
    'Бот пришлёт код из 6 цифр.',
    'Введите его на этой странице — и вы войдёте.',
  ],
  botLoginOpen: 'Открыть Telegram',
  botLoginCopy: 'Скопировать ссылку',
  botLoginCopied: 'Ссылка скопирована',
  botLoginRestart: 'Начать заново',
  botLoginWaiting: (left) => `Ждём подтверждения… ${left}. Бот молчит — нажмите в нём «Запустить» или Start.`,
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
  benefits: (m, n, d) => `To‘lov kunidan boshlab ${m} oy davomida ${n} ta javob, kuniga ${d} tagacha. Avtomatik to‘lov yo‘q.`,
  price: (sum, m, n) => `${sum} so‘m · ${m} oy · ${n} ta javob`,
  sum: (sum) => `${sum} so‘m`,
  fine: 'To‘lovdan keyin qaytarilmaydi · ChatGPT emas',
  packFeatures: (m, n, d) => [
    `To‘lov kunidan boshlab ${m} kalendar oy amal qiladi.`,
    `${n} ta javob, kuniga ${d} tagacha.`,
    'Nosozlik tufayli uzilgan yoki uzunlik chegarasida to‘xtagan javoblar hisoblanmaydi.',
    'Bepul limit ham qoladi: paket tugasa, bepul chat ishlashda davom etadi.',
  ],
  honesty: 'Bu GPTBot.uz chatidagi javoblar, ChatGPT’ga kirish emas. Xizmat OpenAI bilan bog‘liq emas.',
  noRefund: 'To‘langan paket uchun pul qaytarilmaydi: u to‘lovdan keyin darhol amal qila boshlaydi.',
  loginWhy: 'Paket akkauntingizga biriktiriladi, shuning uchun avval Telegram orqali kiring.',
  guestPayNote: 'Kirish shart emas: paket to‘lovdan keyin shu brauzerda darhol ishlaydi.',
  haveAccount: 'Paketni avval Telegram orqali kirib sotib olganmisiz? Kiring — u shu yerda ko‘rinadi.',
  saveLine: 'Paketni Telegram orqali saqlang — boshqa brauzer va telefonda ham ishlaydi.',
  saveButton: 'Telegram orqali saqlash',
  otherBrowser: 'Boshqa brauzerda (masalan, Telegram ichida) kirmasdan to‘lagan bo‘lsangiz, saytni o‘sha yerda oching va «Telegram orqali saqlash»ni bosing yoki Click chekini bizga yuboring.',
  cookiesBlocked: 'Brauzer cookie saqlamayapti — bu yerda kirmasdan to‘lab bo‘lmaydi. Cookie’ga ruxsat bering yoki Telegram orqali kiring.',
  login: 'Telegram orqali kirish',
  loginConsent: 'Telegram identifikatori orqali akkaunt yaratishga roziman. Telefon, ism va yozishmalarga ruxsat so‘ramaymiz.',
  loginFailed: 'Kirish yakunlanmadi. Telegram orqali yana kirib ko‘ring.',
  refunded: 'To‘lov tizimi pul qaytarilganini tasdiqladi. Shu to‘lov bo‘yicha paket o‘chirildi.',
  unavailable: 'To‘lov hozircha mavjud emas. Bepul chat ishlayapti.',
  logout: 'Chiqish',
  active: 'AI paket faol',
  remaining: 'ta javob paketda qoldi',
  remainingPacks: (packs) => `ta javob ${packs} ta paketda qoldi`,
  firstPack: (n, date) => `Avval ${date} gacha amal qiladigan paketdan yechiladi: unda ${n} ta javob qoldi.`,
  today: (n, d) => `Bugun yana ${n} ta (kuniga ${d} tagacha)`,
  until: (date) => `${date} gacha amal qiladi`,
  renew: 'Paket muddati tugashiga oz qoldi. Yangisini istalgan payt olishingiz mumkin — u darhol boshlanadi.',
  noPack: 'Faol paket yo‘q.',
  freeLeft: (n) => `Bepul: bugun ${n} ta xabar qoldi.`,
  supportLabel: 'To‘lovda muammo bormi? Yozing yoki qo‘ng‘iroq qiling:',
  failed: 'Holatni aniqlab bo‘lmadi. To‘lagan bo‘lsangiz, yana to‘lashdan oldin holatni tekshiring.',
  pending: 'To‘lov tasdig‘ini kutyapmiz. To‘lov sahifasidan qaytish to‘lov amalga oshganini bildirmaydi.',
  cancelled: 'To‘lov bekor qilindi, paket yoqilmadi. Pul baribir yechilgan bo‘lsa, bizga yozing — hal qilamiz.',
  expired: 'To‘langan muddat tugadi.',
  test: 'Sinov rejimi: haqiqiy pul yechilmaydi.',
  receipt: 'Fiskal chek',
  refundReceipt: 'Pulni qaytarish cheki',
  checking: 'Akkaunt holati tekshirilmoqda…',
  termsChanged: 'To‘lov shartlari yangilandi. Kutilayotgan to‘lovni takrorlamang — avval holatini tekshiring.',
  termsMissing: 'To‘lov shartlari hali mavjud emas.',
  resumeNote: 'Bu mavjud hisobga qaytish. Yangi hisob yaratilmaydi.',
  resume: 'Shu to‘lovni davom ettirish',
  cancelInvoice: 'Bu hisobni bekor qilish',
  cancelInvoiceNote: (provider) => `${provider} bu hisobni hali olmagan: uni bekor qilib, boshqa usulda to‘lash mumkin.`,
  invoiceHeld: (provider) => `Bu hisob ${provider} tomonida allaqachon ochilgan. To‘lamagan bo‘lsangiz, u o‘zi yopiladi, keyin boshqa usulni tanlash mumkin.`,
  cancelFailed: 'To‘lov tizimi bu hisobni allaqachon qabul qilgan, uni bekor qilib bo‘lmaydi. Holatini tekshiring.',
  payChange: 'Davom ettirish yoki to‘lov usulini almashtirish',
  payChangeNote: 'To‘lamadingizmi? Shu hisobga qaytish yoki boshqa to‘lov usulini tanlash mumkin.',
  payVia: strings('uz').premium.payVia,
  payInApp: 'Uzum Bank ilovasida to‘lash',
  payNote: (providers) => `Karta ma’lumotlari bizga kelmaydi: to‘lov ${providers} tomonida amalga oshiriladi.`,
  or: ' yoki ',
  payRedirecting: 'To‘lov sahifasiga o‘tilmoqda…',
  payChecking: 'To‘lov tekshirilmoqda…',
  payCheckingNote: 'Odatda bir daqiqagacha vaqt oladi. Qayta to‘lamang.',
  payPaid: 'To‘lov qabul qilindi. AI paket faollashdi.',
  payPendingLong: 'To‘lov hali tasdiqlanmadi. Pul yechilgan bo‘lsa, paket bir necha daqiqada yoqiladi — qayta to‘lamang.',
  payBackToChat: 'Chatga qaytish',
  payTestNoPage: 'Sinov rejimi: to‘lov sahifasi ochilmaydi.',
  payAgain: 'Qayta urinib ko‘rish',
  payPendingElsewhere: (provider) => `${provider} orqali ochilgan hisob hali yopilmagan, ikkinchisini ochmaymiz. U bilan nima qilish mumkinligi — quyida.`,
  uzumCodeTitle: 'Uzum Bank ilovasida to‘lov',
  uzumCodeSteps: (service, sum) => [
    'Uzum Bank ilovasini oching va «To‘lovlar» bo‘limiga kiring.',
    `«${service}»ni toping va kodni kiriting:`,
    `${sum} so‘m to‘lang — paket shu sahifada o‘zi yoqiladi.`,
  ],
  uzumCodeCopy: 'Kodni nusxalash',
  uzumCodeCopied: 'Kod nusxalandi',
  uzumCodeNote: 'Kod akkauntingizga biriktirilgan va o‘zgarmaydi.',
  botLoginSteps: (bot) => [
    `«Telegramni ochish»ni bosing — @${bot} ochiladi. U yerda «Start» («Запустить») tugmasi bo‘lsa, uni bosing.`,
    'Botda shu raqamni bosing:',
    'Shu sahifaga qayting — kirish o‘zi yakunlanadi.',
  ],
  botLoginCodeSteps: (bot) => [
    `«Telegramni ochish»ni bosing — @${bot} ochiladi. U yerda «Start» («Запустить») tugmasi bo‘lsa, uni bosing.`,
    'Bot 6 xonali kod yuboradi.',
    'Uni shu sahifada kiriting — shunda kirasiz.',
  ],
  botLoginOpen: 'Telegramni ochish',
  botLoginCopy: 'Havolani nusxalash',
  botLoginCopied: 'Havola nusxalandi',
  botLoginRestart: 'Qaytadan boshlash',
  botLoginWaiting: (left) => `Tasdiqlash kutilmoqda… ${left}. Bot jim bo‘lsa, unda «Start» yoki «Запустить» tugmasini bosing.`,
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

/** 20000 → "20 000": a plain space between thousands, in both languages. */
export function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
