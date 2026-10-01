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
  /** The chat's own lines of the pack: the pack window's copy is account-strings.ts. */
  premium: {
    eyebrow: string; welcome: string; welcomeAccent: string; intro: string; trust: string;
    /** The pack's name: the header pill and the buttons that open its window. */
    account: string;
    /** The header pill while a pack is active. */
    accountActive: string;
    close: string; check: string; manual: string;
    /** Under the header while a pack is active. */
    activeLine: (left: number) => string;
    copyFailed: string; partial: string; simpler: string; translate: string; continue: string;
    historyNote: string; savedChats: string;
    answerReady: string; monthlyLimit: string; offer: string;
    contextTooLarge: string;
    /** Resting screen: the text around the chatgpt.com link, for a visitor who
     *  searched for the official ChatGPT. Lead + link + tail read as one line. */
    officialLead: string; officialTail: string;
    /** Above the composer once the account view failed twice (F11). */
    accountCheck: string;
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
  remaining: (n: number) => string;
  lowWarning: (n: number) => string;
  /** The free tier's last messages in the rolling hour (map 03 §3.7). */
  hourWarning: (n: number) => string;
  charsLeft: (n: number) => string;
  emptyPrompt: string;
  /** The honest terms, stated once on the resting screen, with the server's numbers. */
  emptyMeta: (limits: FreeLimits | null) => string;
  disclaimer: string;
  leadPrivacy: string;
  newChat: string;
  copy: string;
  copied: string;
  retry: string;
  /** A lazy part of the chat (the pack window, the tools) is on its way. */
  partLoading: string;
  /** A lazy part did not arrive: offline, or a new release replaced its file. */
  partFailed: string;
  /** The way out of partFailed: a reload, since the same import fails again. */
  partReload: string;
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
    contextTooLarge:'Сообщение слишком длинное для этого запроса. Сократите его или отправьте частями.',
    answerReady:'Ответ готов.',monthlyLimit:'Ответы этого оплаченного периода закончились. Следующий пакет доступен с начала нового периода.',offer:'Пишете часто? AI-пакет: 300 ответов на месяц за 20 000 сум, без автосписаний.',
    eyebrow:'ВАШ AI-ПОМОЩНИК',welcome:'От вопроса —',welcomeAccent:'к понятному ответу.',
    intro:'Написать, перевести или разобраться в теме. Просто спросите на русском или узбекском.',
    trust:'Ничего скачивать не нужно. Работает прямо здесь.',account:'AI-пакет',accountActive:'Мой пакет',
    close:'Закрыть',check:'Проверить статус',
    manual:'Без автосписаний: следующий пакет покупаете, только если он нужен.',activeLine:(n) => `AI-пакет · ответов осталось: ${n}`,
    copyFailed:'Копирование недоступно. Выделите текст и скопируйте вручную.',partial:'Ответ прервался. Сохранённая часть доступна; можно попросить продолжить.',simpler:'Объяснить проще',translate:'Перевести на узбекский',continue:'Продолжить',
    historyNote:'Список разговоров хранится только в этом браузере. Сами сообщения для ответа отправляются на наш сервер и зарубежным AI-провайдерам.',savedChats:'Ваши разговоры',
    officialLead:'Нужен официальный ChatGPT? ',officialTail:' — сайт OpenAI. Здесь — независимый AI-чат GPTBot.uz: пишите по-русски или O‘zbekcha yozing — ответ на языке вопроса.',
    accountCheck:'Проверьте состояние аккаунта.',
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
  remaining: (n) => `Осталось ${n} ${ru(n, 'сообщение', 'сообщения', 'сообщений')} сегодня`,
  lowWarning: (n) => `Осталось ${n} ${ru(n, 'сообщение', 'сообщения', 'сообщений')} на сегодня.`,
  hourWarning: (n) => `В этот час можно отправить ещё ${n} ${ru(n, 'сообщение', 'сообщения', 'сообщений')}.`,
  charsLeft: (n) => `${n} ${ru(n, 'символ', 'символа', 'символов')} до лимита`,
  emptyPrompt: 'Что хотите сделать?',
  emptyMeta: (limits) => limits === null
    ? 'Бесплатно, без регистрации.'
    : `Бесплатно, без регистрации: до ${limits.daily} ${ru(limits.daily, 'сообщения', 'сообщений', 'сообщений')} в день и ${limits.hourly} в час.`,
  disclaimer:
    'GPTBot.uz — независимый AI-сервис, не официальный продукт OpenAI или ChatGPT. Отвечают модели сторонних компаний; название модели указано под ответом.',
  leadPrivacy: 'Политика конфиденциальности',
  newChat: 'Новый чат',
  copy: 'Копировать',
  copied: 'Скопировано',
  retry: 'Повторить',
  partLoading: 'Загружаем…',
  partFailed: 'Не удалось загрузить этот раздел. Проверьте интернет и обновите страницу.',
  partReload: 'Обновить страницу',
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
  answeredBy: 'Ответила модель',
  writing: 'Пишет ответ…',
};

const UZ: ChatStrings = {
  premium: {
    contextTooLarge:'Bu so‘rov uchun matn juda uzun. Uni qisqartiring yoki bo‘lib yuboring.',
    answerReady:'Javob tayyor.',monthlyLimit:'Bu davr uchun javoblar tugadi. Yangi to‘plam keyingi davr boshlanganda ochiladi.',offer:'Ko‘p yozasizmi? AI paket: bir oyga 300 ta javob — 20 000 so‘m, avtomatik to‘lovsiz.',
    eyebrow:'SIZNING AI YORDAMCHINGIZ',welcome:'Savolingiz bor?',welcomeAccent:'Birga yechim topamiz.',
    intro:'Matn yozish, tarjima qilish yoki mavzuni tushunish. O‘zbekcha yoki ruscha so‘rang.',
    trust:'Yuklab olish shart emas. Shu yerning o‘zida ishlaydi.',account:'AI paket',accountActive:'Paketim',
    close:'Yopish',check:'Holatni tekshirish',
    manual:'Avtomatik to‘lov yo‘q: keyingi paketni faqat kerak bo‘lsa olasiz.',activeLine:(n) => `AI paket · ${n} ta javob qoldi`,
    copyFailed:'Nusxalab bo‘lmadi. Matnni belgilab, qo‘lda nusxalang.',partial:'Javob uzilib qoldi. Kelgan qismi saqlandi. Davom ettirishni so‘rashingiz mumkin.',simpler:'Oddiyroq tushuntir',translate:'Rus tiliga tarjima',continue:'Davom ettir',
    historyNote:'Suhbatlar ro‘yxati faqat shu brauzerda saqlanadi. Xabarlar javob olish uchun serverimizga va xorijdagi AI-provayderlarga yuboriladi.',savedChats:'Suhbatlaringiz',
    officialLead:'Rasmiy ChatGPT kerakmi? ',officialTail:' — OpenAI sayti. Bu yerda esa GPTBot.uz’ning mustaqil AI-chati: o‘zbekcha yozing, ro‘yxatsiz.',
    accountCheck:'Akkaunt holatini tekshiring.',
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
  leadPrivacy: 'Maxfiylik siyosati',
  newChat: 'Yangi chat',
  copy: 'Nusxalash',
  copied: 'Nusxalandi',
  retry: 'Qayta urinish',
  partLoading: 'Yuklanmoqda…',
  partFailed: 'Bu bo‘limni yuklab bo‘lmadi. Internetni tekshirib, sahifani yangilang.',
  partReload: 'Sahifani yangilash',
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
  answeredBy: 'Javob bergan model',
  writing: 'Javob yozilmoqda…',
};

export function strings(locale: Locale): ChatStrings {
  return locale === 'uz' ? UZ : RU;
}
