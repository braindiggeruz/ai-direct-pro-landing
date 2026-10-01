// RU/UZ copy for the AI-chat island. Brand-safe strings only: the brand is
// «GPTBot.uz», the paid offer is the «AI-пакет» / «AI paket» (plan L16), and
// no line names a subscription tier (tests/gpt-chat-honesty.test.ts).
import type { FreeLimits, Locale } from './types';

export interface PromptChip {
  id: string;
  label: string;
  /** Text prefilled into the composer — never auto-sent. */
  insert: string;
}

export interface ChatStrings {
  premium: {
    eyebrow: string; welcome: string; welcomeAccent: string; intro: string; trust: string;
    /** The pack's name: the header pill and the buttons that open its window. */
    account: string;
    /** The header pill while a pack is active. */
    accountActive: string;
    title: string; price: string; benefits: string;
    /** The pack window's list, one fact per line. */
    packFeatures: string[];
    login: string; loginConsent: string; loginFailed: string; refunded: string;
    unavailable: string; logout: string; close: string; check: string; terms: string; manual: string;
    active: string;
    /** Under the header while a pack is active. */
    activeLine: (left: number) => string;
    expires: string; remaining: string; renew: string; refund: string; refundPending: string;
    failed: string; pending: string; cancelled: string; expired: string; test: string;
    copyFailed: string; partial: string; simpler: string; translate: string; continue: string;
    historyNote: string; savedChats: string;
    answerReady: string; monthlyLimit: string; offer: string;
    scheduled:string; receipt:string; refundReceipt:string; contextTooLarge:string;
    /** Resting screen: the text around the chatgpt.com link, for a visitor who
     *  searched for the official ChatGPT. Lead + link + tail read as one line. */
    officialLead: string; officialTail: string;
    /** The pack window while the account view is being read. */
    checking: string;
    /** Above the composer once the account view failed twice (F11). */
    accountCheck: string;
    termsChanged: string; termsMissing: string;
    /** A pending invoice: going back to it creates no new one. */
    resumeNote: string; resume: string;
  };
  /** RU chat only: the visible way to the Uzbek chat on the first screen —
   *  the header label (`nav`) and the resting-screen link (`page`). The Uzbek
   *  chat has no counterpart, so its header keeps the short «RU». */
  uzEntry?: { nav: string; page: string };
  brand: string;
  inputPlaceholder: string;
  /** Under the composer on every screen size: not OpenAI, and where questions go. */
  inputMicrocopy: string;
  send: string;
  thinking: string;
  errorGeneric: string;
  errorNetwork: string;
  turnstileLoading: string;
  turnstilePrompt: string;
  turnstileVerified: string;
  turnstileRetry: string;
  turnstileError: string;
  stop: string;
  regenerate: string;
  /** The menu's link to the price page this locale's visitor should see. */
  pricingLink: string;
  chips: PromptChip[];
  menuOpen: string;
  menuClose: string;
  sidebarTools: string;
  sidebarLinks: string;
  guideLink: string;
  businessLink: string;
  aboutLink: string;
  collapseMenu: string;
  expandMenu: string;
  telegramCta: string;
  /** Label used when the link goes to the studio's own Telegram, not the bot. */
  contactTelegram: string;
  dismissOffer: string;
  remaining: (n: number) => string;
  lowWarning: (n: number) => string;
  /** The free tier's last messages in the rolling hour (map 03 §3.7). */
  hourWarning: (n: number) => string;
  charsLeft: (n: number) => string;
  emptyPrompt: string;
  /** The honest terms, stated once on the resting screen, with the server's numbers. */
  emptyMeta: (limits: FreeLimits | null) => string;
  disclaimer: string;
  leadName: string;
  leadNameOptional: string;
  leadNamePlaceholder: string;
  leadContact: string;
  leadContactPlaceholder: string;
  leadContactHint: string;
  leadContactError: string;
  leadConsent: string;
  leadConsentError: string;
  leadPrivacy: string;
  leadSubmit: string;
  leadSending: string;
  leadSuccess: string;
  leadSuccessNext: string;
  leadSuccessTelegram: string;
  leadIntro: string;
  leadError: string;
  newChat: string;
  copy: string;
  copied: string;
  retry: string;
  // The B2B offer card (AiOfferCard), after a few answers in the business tool.
  b2bTitle: string;
  b2bDiscuss: string;
  offerBadge: string;
  offerBody: string;
  // The assistant bot route on the limit card (AiLimitTelegram).
  capTelegramCta: string;
  capTelegramNote: string;
  telegramContextNote: string;
  // The limit card (limit-card.ts), one line per reason the server refuses
  // with. The wait line under it is re-read from the clock; the day's lines
  // say "today" or "tomorrow" from when the limit lifts in Tashkent.
  hourlyTitle: string;
  hourlyBody: (hourly: number | null) => string;
  dailyTitle: string;
  dailyBody: (daily: number | null, today: boolean) => string;
  packDailyBody: (daily: number | null, left: number | null, today: boolean) => string;
  busyBody: string;
  ipBody: string;
  limitWait: (minutes: number) => string;
  limitLessMinute: string;
  limitReady: string;
  /** Said only while the refused question is back in the composer. */
  limitDraftKept: string;
  /** Under an answer cut at the length limit, which is never charged. */
  truncated: string;
  leadConsentDetail: string;
  answeredBy: string;
  writing: string;
}

/** Russian count agreement: 1 / 21 → one, 2–4 / 22–24 → few, the rest → many. */
function ru(n: number, one: string, few: string, many: string): string {
  const tens = n % 100;
  const units = n % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  return units >= 2 && units <= 4 ? few : many;
}

const RU: ChatStrings = {
  premium: {
    refunded:'Платёжная система подтвердила возврат. Доступ по этому платежу отключён.',
    scheduled:'Следующий период уже оплачен. Начало',receipt:'Фискальный чек',refundReceipt:'Чек возврата',contextTooLarge:'Сообщение слишком длинное для этого запроса. Сократите его или отправьте частями.',
    answerReady:'Ответ готов.',monthlyLimit:'Ответы этого оплаченного периода закончились. Следующий пакет доступен с начала нового периода.',offer:'Пишете часто? AI-пакет: 300 ответов на месяц за 20 000 сум, без автосписаний.',
    eyebrow:'ВАШ AI-ПОМОЩНИК',welcome:'От вопроса —',welcomeAccent:'к понятному ответу.',
    intro:'Написать, перевести или разобраться в теме. Просто спросите на русском или узбекском.',
    trust:'Ничего скачивать не нужно. Работает прямо здесь.',account:'AI-пакет',accountActive:'Мой пакет',title:'AI-пакет: больше ответов в этом чате',price:'20 000 сум · 1 месяц · 300 ответов',
    benefits:'300 ответов на 1 календарный месяц с дня оплаты, до 50 в день. Без автосписаний.',
    packFeatures:[
      'Действует 1 календарный месяц с дня оплаты.',
      '300 ответов, до 50 в день.',
      'Ответы, оборвавшиеся из-за сбоя или на пределе длины, не списываются.',
      'Бесплатный лимит сохраняется: закончится пакет — бесплатный чат продолжит работать.',
    ],
    loginFailed:'Вход не завершён. Попробуйте войти через Telegram ещё раз.',login:'Войти через Telegram',loginConsent:'Согласен на создание аккаунта по идентификатору Telegram. Не запрашиваем телефон, имя и доступ к переписке.',
    unavailable:'Оплата сейчас недоступна. Бесплатный чат работает.',logout:'Выйти',close:'Закрыть',check:'Проверить статус',terms:'Принимаю условия публичной оферты',
    manual:'Без автосписаний: следующий пакет покупаете, только если он нужен.',active:'AI-пакет активен',activeLine:(n) => `AI-пакет · ответов осталось: ${n}`,expires:'Оплачен до',remaining:'ответов осталось в этом периоде',renew:'Период скоро закончится. Можно оплатить следующий месяц.',
    refund:'Запросить возврат',refundPending:'Запрос на возврат принят. Доступ сохраняется до решения.',failed:'Статус не получен. Если уже платили, проверьте статус перед повторной оплатой.',
    pending:'Ожидаем подтверждение оплаты. Возврат с платёжной страницы сам по себе не подтверждает платёж.',cancelled:'Платёж отменён. При списании обратитесь в поддержку провайдера.',expired:'Оплаченный период закончился.',test:'Тестовый режим: реальные деньги не списываются.',
    copyFailed:'Копирование недоступно. Выделите текст и скопируйте вручную.',partial:'Ответ прервался. Сохранённая часть доступна; можно попросить продолжить.',simpler:'Объяснить проще',translate:'Перевести на узбекский',continue:'Продолжить',
    historyNote:'Список разговоров хранится только в этом браузере. Сами сообщения для ответа отправляются на наш сервер и зарубежным AI-провайдерам.',savedChats:'Ваши разговоры',
    officialLead:'Нужен официальный ChatGPT? ',officialTail:' — сайт OpenAI. Здесь — независимый AI-чат GPTBot.uz: пишите по-русски или O‘zbekcha yozing — ответ на языке вопроса.',
    checking:'Проверяем состояние аккаунта…',accountCheck:'Проверьте состояние аккаунта.',
    termsChanged:'Условия оплаты обновились. Не повторяйте ожидающий платёж — сначала проверьте его статус.',termsMissing:'Условия оплаты пока недоступны.',
    resumeNote:'Возврат к существующему счёту. Новый счёт не создаётся.',resume:'Продолжить этот платёж',
  },
  uzEntry: { nav: 'O‘zbekcha', page: 'O‘zbekcha sahifa →' },
  brand: 'GPTBot.uz',
  inputPlaceholder: 'Напишите сообщение…',
  inputMicrocopy: 'Не продукт OpenAI · Вопросы отправляются зарубежным AI-провайдерам — не пишите личные данные',
  send: 'Отправить',
  thinking: 'AI думает…',
  errorGeneric: 'AI-сервис временно недоступен. Попробуйте немного позже.',
  errorNetwork: 'Не удалось получить ответ. Проверьте соединение и попробуйте ещё раз.',
  turnstileLoading: 'Загружаем проверку безопасности…',
  turnstilePrompt: 'Подтвердите, что вы человек, перед отправкой сообщения.',
  turnstileVerified: 'Проверка пройдена. Сообщение можно отправить.',
  turnstileRetry: 'Проверка истекла или уже использована. Выполните её ещё раз.',
  turnstileError: 'Проверка безопасности недоступна. Обновите страницу.',
  stop: 'Остановить',
  regenerate: 'Повторить ответ',
  pricingLink: 'Тарифы AI-чата',
  chips: [
    { id: 'text', label: 'Написать текст', insert: 'Напиши текст. Формат и тема: ' },
    { id: 'translate', label: 'На узбекский', insert: 'Переведи на узбекский латиницей, естественно для аудитории Узбекистана: ' },
    { id: 'offer', label: 'Придумать оффер', insert: 'Придумай 3 варианта рекламного оффера. Продукт: ' },
    { id: 'explain', label: 'Объяснить тему', insert: 'Объясни простыми словами: ' },
  ],
  menuOpen: 'Открыть меню',
  menuClose: 'Закрыть меню',
  sidebarTools: 'Инструменты',
  sidebarLinks: 'Разделы',
  guideLink: 'Гайд по AI-чату',
  businessLink: 'AI для бизнеса',
  aboutLink: 'О сервисе',
  collapseMenu: 'Свернуть меню',
  expandMenu: 'Развернуть меню',
  telegramCta: 'Открыть в Telegram',
  contactTelegram: 'Написать нам в Telegram',
  dismissOffer: 'Скрыть предложение',
  remaining: (n) => `Осталось ${n} сообщений сегодня`,
  lowWarning: (n) => `Осталось ${n} ${n === 1 ? 'сообщение' : 'сообщения'} на сегодня.`,
  hourWarning: (n) => `В этот час можно отправить ещё ${n} ${ru(n, 'сообщение', 'сообщения', 'сообщений')}.`,
  charsLeft: (n) => `${n} символов до лимита`,
  emptyPrompt: 'Что хотите сделать?',
  emptyMeta: (limits) => limits === null
    ? 'Бесплатно, без регистрации.'
    : `Бесплатно, без регистрации: до ${limits.daily} ${ru(limits.daily, 'сообщения', 'сообщений', 'сообщений')} в день и ${limits.hourly} в час.`,
  disclaimer:
    'GPTBot.uz — независимый AI-сервис, не официальный продукт OpenAI или ChatGPT. Отвечают модели сторонних компаний; название модели указано под ответом.',
  leadName: 'Имя',
  leadNameOptional: 'необязательно',
  leadNamePlaceholder: 'Как к вам обращаться',
  leadContact: 'Телефон или Telegram',
  leadContactPlaceholder: '+998 90 123 45 67 или @username',
  leadContactHint: 'Ответим на этот же контакт. Ничего другого мы не собираем.',
  leadContactError: 'Укажите номер в формате +998 90 123 45 67 или Telegram-логин @username.',
  leadConsent: 'Согласен на обработку данных для связи',
  leadConsentError: 'Отметьте согласие — без него мы не сохраняем контакт.',
  leadPrivacy: 'Политика конфиденциальности',
  leadSubmit: 'Оставить заявку',
  leadSending: 'Отправляем…',
  leadSuccess: 'Заявка принята.',
  leadSuccessNext: 'Свяжемся в рабочее время: пн–сб, 10:00–19:00.',
  leadSuccessTelegram: 'Если нужно быстрее — напишите нам в Telegram.',
  leadIntro: 'Нужен такой AI-чат на сайт, в Telegram или CRM? Оставьте контакт.',
  leadError: 'Не удалось отправить заявку. Попробуйте ещё раз или напишите нам в Telegram.',
  newChat: 'Новый чат',
  copy: 'Копировать',
  copied: 'Скопировано',
  retry: 'Повторить',
  b2bTitle: 'Нужен такой AI-чат для сайта, Telegram или CRM?',
  b2bDiscuss: 'Обсудить внедрение',
  offerBadge: 'Для бизнеса',
  offerBody: 'Этот же бот может отвечать вашим клиентам — в Telegram или прямо на вашем сайте.',
  capTelegramCta: 'Продолжить в Telegram-боте',
  capTelegramNote: 'У Telegram-бота свой дневной лимит — продолжить можно сразу. Бесплатные сообщения здесь вернутся позже.',
  telegramContextNote: 'К сообщению добавится короткий код этого разговора — по нему мы поймём, о чём вы спрашивали здесь.',
  hourlyTitle: 'Часовой бесплатный лимит исчерпан',
  hourlyBody: (hourly) => hourly === null
    ? 'Бесплатные сообщения на сайте считаются по часам.'
    : `Лимит бесплатных сообщений в час — ${hourly}.`,
  dailyTitle: 'Дневной бесплатный лимит исчерпан',
  dailyBody: (daily, today) =>
    `${daily === null ? '' : `Лимит бесплатных сообщений в день — ${daily}. `}Снова писать можно ${today ? 'сегодня' : 'завтра'} с 05:00 по Ташкенту.`,
  packDailyBody: (daily, left, today) =>
    `Дневной лимит пакета исчерпан${daily === null ? '' : ` (ответов в день: ${daily})`}. Продолжить можно ${today ? 'сегодня' : 'завтра'} с 05:00 по Ташкенту${left === null ? '' : `; ответов в пакете осталось: ${left}`}.`,
  busyBody: 'Предыдущий ответ ещё готовится.',
  ipBody: 'Из вашей сети слишком много запросов.',
  limitWait: (minutes) => `Снова написать можно через ${minutes} мин.`,
  limitLessMinute: 'Снова написать можно меньше чем через минуту.',
  limitReady: 'Можно писать снова.',
  limitDraftKept: 'Ваш вопрос остался в поле ввода.',
  truncated: 'Ответ остановился на пределе длины и не списан с лимита. Нажмите «Продолжить».',
  leadConsentDetail: 'Отправляем имя, контакт, номер сессии чата и адрес страницы. Текст переписки не передаётся.',
  answeredBy: 'Ответила модель',
  writing: 'Пишет ответ…',
};

const UZ: ChatStrings = {
  premium: {
    refunded:'To‘lov tizimi pul qaytarilganini tasdiqladi. Shu to‘lov bo‘yicha paket o‘chirildi.',
    scheduled:'Keyingi davr uchun to‘langan. Boshlanish sanasi',receipt:'Fiskal chek',refundReceipt:'Pulni qaytarish cheki',contextTooLarge:'Bu so‘rov uchun matn juda uzun. Uni qisqartiring yoki bo‘lib yuboring.',
    answerReady:'Javob tayyor.',monthlyLimit:'Bu davr uchun javoblar tugadi. Yangi to‘plam keyingi davr boshlanganda ochiladi.',offer:'Ko‘p yozasizmi? AI paket: bir oyga 300 ta javob — 20 000 so‘m, avtomatik to‘lovsiz.',
    eyebrow:'SIZNING AI YORDAMCHINGIZ',welcome:'Savolingiz bor?',welcomeAccent:'Birga yechim topamiz.',
    intro:'Matn yozish, tarjima qilish yoki mavzuni tushunish. O‘zbekcha yoki ruscha so‘rang.',
    trust:'Yuklab olish shart emas. Shu yerning o‘zida ishlaydi.',account:'AI paket',accountActive:'Paketim',title:'AI paket: shu chatda ko‘proq javob',price:'20 000 so‘m · 1 oy · 300 ta javob',
    benefits:'To‘lov kunidan boshlab 1 oy davomida 300 ta javob, kuniga 50 tagacha. Avtomatik to‘lov yo‘q.',
    packFeatures:[
      'To‘lov kunidan boshlab 1 kalendar oy amal qiladi.',
      '300 ta javob, kuniga 50 tagacha.',
      'Nosozlik tufayli uzilgan yoki uzunlik chegarasida to‘xtagan javoblar hisoblanmaydi.',
      'Bepul limit ham qoladi: paket tugasa, bepul chat ishlashda davom etadi.',
    ],
    loginFailed:'Kirish yakunlanmadi. Telegram orqali yana kirib ko‘ring.',login:'Telegram orqali kirish',loginConsent:'Telegram identifikatori orqali akkaunt yaratishga roziman. Telefon, ism va yozishmalarga ruxsat so‘ramaymiz.',
    unavailable:'To‘lov hozircha mavjud emas. Bepul chat ishlayapti.',logout:'Chiqish',close:'Yopish',check:'Holatni tekshirish',terms:'Ommaviy oferta shartlariga roziman',
    manual:'Avtomatik to‘lov yo‘q: keyingi paketni faqat kerak bo‘lsa olasiz.',active:'AI paket faol',activeLine:(n) => `AI paket · ${n} ta javob qoldi`,expires:'Amal qilish muddati',remaining:'ta javob shu davr uchun qoldi',renew:'Muddat tugashiga oz qoldi. Keyingi oy uchun to‘lashingiz mumkin.',
    refund:'Pulni qaytarishni so‘rash',refundPending:'So‘rovingiz qabul qilindi. Qaror chiqquncha xizmatdan foydalanasiz.',failed:'Holatni aniqlab bo‘lmadi. To‘lagan bo‘lsangiz, yana to‘lashdan oldin holatni tekshiring.',
    pending:'To‘lov tasdig‘ini kutyapmiz. To‘lov sahifasidan qaytish to‘lov amalga oshganini bildirmaydi.',cancelled:'To‘lov bekor qilindi. Pul yechilgan bo‘lsa, to‘lov xizmati yordam markaziga murojaat qiling.',expired:'To‘langan muddat tugadi.',test:'Sinov rejimi: haqiqiy pul yechilmaydi.',
    copyFailed:'Nusxalab bo‘lmadi. Matnni belgilab, qo‘lda nusxalang.',partial:'Javob uzilib qoldi. Kelgan qismi saqlandi. Davom ettirishni so‘rashingiz mumkin.',simpler:'Oddiyroq tushuntir',translate:'Rus tiliga tarjima',continue:'Davom ettir',
    historyNote:'Suhbatlar ro‘yxati faqat shu brauzerda saqlanadi. Xabarlar javob olish uchun serverimizga va xorijdagi AI-provayderlarga yuboriladi.',savedChats:'Suhbatlaringiz',
    officialLead:'Rasmiy ChatGPT kerakmi? ',officialTail:' — OpenAI sayti. Bu yerda esa GPTBot.uz’ning mustaqil AI-chati: o‘zbekcha yozing, ro‘yxatsiz.',
    checking:'Akkaunt holati tekshirilmoqda…',accountCheck:'Akkaunt holatini tekshiring.',
    termsChanged:'To‘lov shartlari yangilandi. Kutilayotgan to‘lovni takrorlamang — avval holatini tekshiring.',termsMissing:'To‘lov shartlari hali mavjud emas.',
    resumeNote:'Bu mavjud hisobga qaytish. Yangi hisob yaratilmaydi.',resume:'Shu to‘lovni davom ettirish',
  },
  brand: 'GPTBot.uz',
  inputPlaceholder: 'Xabar yozing…',
  inputMicrocopy: 'OpenAI mahsuloti emas · Savollar xorijdagi AI-provayderlarga yuboriladi — shaxsiy ma’lumot yozmang',
  send: 'Yuborish',
  thinking: 'AI o‘ylayapti…',
  errorGeneric: 'AI xizmati vaqtincha ishlamayapti. Birozdan keyin qayta urinib ko‘ring.',
  errorNetwork: 'Javobni olish imkoni bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.',
  turnstileLoading: 'Xavfsizlik tekshiruvi yuklanmoqda…',
  turnstilePrompt: 'Xabar yuborishdan oldin inson ekaningizni tasdiqlang.',
  turnstileVerified: 'Tekshiruv yakunlandi. Xabarni yuborishingiz mumkin.',
  turnstileRetry: 'Tekshiruv muddati tugagan yoki avval ishlatilgan. Qayta bajaring.',
  turnstileError: 'Xavfsizlik tekshiruvi ishlamayapti. Sahifani yangilang.',
  stop: 'To‘xtatish',
  regenerate: 'Javobni qayta yaratish',
  // The Uzbek menu links to the business bot price list, and says so: a
  // visitor of the free chat is not sent to it as «Tariflar» (F10).
  pricingLink: 'Biznes bot narxlari',
  chips: [
    { id: 'text', label: 'Matn yozish', insert: 'Matn yoz. Format va mavzu: ' },
    { id: 'translate', label: 'Rus tiliga tarjima', insert: 'Rus tiliga tabiiy qilib tarjima qil: ' },
    { id: 'offer', label: 'Taklif yaratish', insert: '3 xil reklama taklifini yoz. Mahsulot: ' },
    { id: 'explain', label: 'Mavzuni tushuntirish', insert: 'Oddiy tilda tushuntir: ' },
  ],
  menuOpen: 'Menyuni ochish',
  menuClose: 'Menyuni yopish',
  sidebarTools: 'Vositalar',
  sidebarLinks: 'Bo‘limlar',
  guideLink: 'AI-chat qo‘llanmasi',
  businessLink: 'Biznes uchun AI',
  aboutLink: 'Xizmat haqida',
  collapseMenu: 'Menyuni yig‘ish',
  expandMenu: 'Menyuni yoyish',
  telegramCta: 'Telegramda ochish',
  contactTelegram: 'Telegramda bizga yozing',
  dismissOffer: 'Taklifni yopish',
  remaining: (n) => `Bugun ${n} ta xabar qoldi`,
  lowWarning: (n) => `Bugun ${n} ta xabar qoldi.`,
  hourWarning: (n) => `Bu soat ichida yana ${n} ta xabar yuborishingiz mumkin.`,
  charsLeft: (n) => `Limitgacha ${n} belgi`,
  emptyPrompt: 'Nima qilmoqchisiz?',
  emptyMeta: (limits) => limits === null
    ? 'Bepul, ro‘yxatdan o‘tmasdan.'
    : `Bepul, ro‘yxatdan o‘tmasdan: kuniga ${limits.daily} ta, soatiga ${limits.hourly} tagacha xabar.`,
  disclaimer:
    'GPTBot.uz — mustaqil AI-xizmat, OpenAI yoki ChatGPT’ning rasmiy mahsuloti emas. Javoblarni boshqa kompaniyalarning modellari beradi; model nomi javob ostida yozilgan.',
  leadName: 'Ism',
  leadNameOptional: 'ixtiyoriy',
  leadNamePlaceholder: 'Sizga qanday murojaat qilaylik',
  leadContact: 'Telefon yoki Telegram',
  leadContactPlaceholder: '+998 90 123 45 67 yoki @username',
  leadContactHint: 'Shu kontaktga javob beramiz. Boshqa ma’lumot yig‘maymiz.',
  leadContactError: 'Raqamni +998 90 123 45 67 ko‘rinishida yoki @username Telegram-loginini kiriting.',
  leadConsent: 'Bog‘lanish uchun ma’lumotlarni qayta ishlashga roziman',
  leadConsentError: 'Rozilikni belgilang — usiz kontaktni saqlamaymiz.',
  leadPrivacy: 'Maxfiylik siyosati',
  leadSubmit: 'Ariza qoldirish',
  leadSending: 'Yuborilmoqda…',
  leadSuccess: 'Ariza qabul qilindi.',
  leadSuccessNext: 'Ish vaqtida bog‘lanamiz: dushanba–shanba, 10:00–19:00.',
  leadSuccessTelegram: 'Tezroq kerak bo‘lsa — Telegramda yozing.',
  leadIntro: 'Shunday AI-chat sayt, Telegram yoki CRM uchun kerakmi? Kontakt qoldiring.',
  leadError: 'Ariza yuborilmadi. Yana urinib ko‘ring yoki Telegramda yozing.',
  newChat: 'Yangi chat',
  copy: 'Nusxalash',
  copied: 'Nusxalandi',
  retry: 'Qayta urinish',
  b2bTitle: 'Biznesingiz uchun shunday AI chat kerakmi?',
  b2bDiscuss: 'Joriy etishni muhokama qilish',
  offerBadge: 'Biznes uchun',
  offerBody: 'Xuddi shu bot sizning mijozlaringizga ham javob bera oladi — Telegramda yoki saytingizda.',
  capTelegramCta: 'Telegram-botda davom ettirish',
  capTelegramNote: 'Telegram-botning o‘z kunlik limiti bor — hoziroq davom ettirish mumkin. Bu yerdagi bepul xabarlar keyinroq qaytadi.',
  telegramContextNote: 'Xabarga shu suhbatning qisqa kodi qo‘shiladi — shu orqali nima so‘raganingizni tushunamiz.',
  hourlyTitle: 'Soatlik bepul limit tugadi',
  hourlyBody: (hourly) => hourly === null
    ? 'Saytdagi bepul chat xabarlarni soat bo‘yicha hisoblaydi.'
    : `Bir soatda ${hourly} ta bepul xabar yozish mumkin.`,
  dailyTitle: 'Kunlik bepul limit tugadi',
  dailyBody: (daily, today) =>
    `${daily === null ? '' : `Kuniga ${daily} ta bepul xabar yozish mumkin. `}${today ? 'Bugun' : 'Ertaga'} soat 05:00 dan (Toshkent vaqti bilan) yana yozasiz.`,
  packDailyBody: (daily, left, today) =>
    `Paketning kunlik limiti${daily === null ? '' : ` (${daily} ta javob)`} tugadi. ${today ? 'Bugun' : 'Ertaga'} soat 05:00 dan (Toshkent vaqti bilan) davom ettirasiz${left === null ? '' : `; paketda ${left} ta javob qoldi`}.`,
  busyBody: 'Oldingi javob hali tayyorlanmoqda.',
  ipBody: 'Tarmog‘ingizdan so‘rovlar juda ko‘p.',
  limitWait: (minutes) => `${minutes} daqiqadan keyin yana yozasiz.`,
  limitLessMinute: 'Bir daqiqadan kamroq qoldi.',
  limitReady: 'Endi yana yozishingiz mumkin.',
  limitDraftKept: 'Savolingiz yozish maydonida turibdi.',
  truncated: 'Javob uzunlik chegarasida to‘xtadi va limitdan hisoblanmadi. «Davom ettir»ni bosing.',
  leadConsentDetail: 'Ism, kontakt, chat sessiyasi raqami va sahifa manzili yuboriladi. Yozishmalar matni uzatilmaydi.',
  answeredBy: 'Javob bergan model',
  writing: 'Javob yozilmoqda…',
};

export function strings(locale: Locale): ChatStrings {
  return locale === 'uz' ? UZ : RU;
}
