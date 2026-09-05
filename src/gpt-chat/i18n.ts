// RU/UZ copy for the AI-chat island. Brand-safe strings only.
import type { Locale } from './types';

export interface QuickAction {
  label: string;
  prompt: string;
}
export interface PromptCategory {
  label: string;
  prompts: string[];
}

export interface PromptChip {
  id: string;
  label: string;
  /** Text prefilled into the composer — never auto-sent. */
  insert: string;
}

export interface ChatStrings {
  premium: {
    eyebrow: string; welcome: string; welcomeAccent: string; intro: string; trust: string;
    account: string; title: string; price: string; benefits: string; login: string; loginConsent: string; loginFailed: string; refunded: string;
    unavailable: string; logout: string; close: string; check: string; terms: string; manual: string;
    active: string; expires: string; remaining: string; renew: string; refund: string; refundPending: string;
    failed: string; pending: string; cancelled: string; expired: string; test: string;
    copyFailed: string; partial: string; simpler: string; translate: string; continue: string;
    historyNote: string; savedChats: string; noHistory: string; newChatHint: string; actionCost: string;
    answerReady: string; monthlyLimit: string; pause: string; offer: string;
    scheduled:string; receipt:string; refundReceipt:string; contextTooLarge:string;
  };
  brand: string;
  online: string;
  inputPlaceholder: string;
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
  b2bLine: string;
  telegramCta: string;
  /** Label used when the link goes to the studio's own Telegram, not the bot. */
  contactTelegram: string;
  dismissOffer: string;
  remaining: (n: number) => string;
  lowWarning: (n: number) => string;
  charsLeft: (n: number) => string;
  emptyTitle: string;
  emptyHint: string;
  tryFree: string;
  emptyPrompt: string;
  /** The honest terms, stated once on the resting screen. */
  emptyMeta: string;
  feedbackUp: string;
  feedbackDown: string;
  feedbackThanks: string;
  disclaimer: string;
  safetyWarning: string;
  quickActions: QuickAction[];
  categories: PromptCategory[];
  paywallTitle: string;
  paywallBody: string;
  paywallCta: string;
  paywallBenefits: string[];
  plusManualNote: string;
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
  leadValidation: string;
  leadError: string;
  newChat: string;
  history: string;
  loginToSave: string;
  copy: string;
  copied: string;
  retry: string;
  shorter: string;
  forInstagram: string;
  toUzbekLatin: string;
  botScenario: string;
  implementBot: string;
  moreActions: string;
  lessActions: string;
  actionRunning: string;
  feedbackQuestion: string;
  plusBadge: string;
  planBadge: (plan: string) => string;
  b2bTitle: string;
  b2bDiscuss: string;
  b2bSiteChat: string;
  b2bTelegram: string;
  // Staged commercial offer (funnel stages 2-4): one card, three moments.
  offerBadge: string;
  offerBody: string;
  capTelegramCta: string;
  capTelegramNote: string;
  capLeadCta: string;
  telegramContextNote: string;
  hourlyTitle: string;
  hourlyBody: string;
  hourlyRetry: string;
  hourlyRetryHint: string;
  dailyBody: string;
  leadIntroCap: string;
  leadConsentDetail: string;
  answeredBy: string;
  writing: string;
}

const RU: ChatStrings = {
  premium: {
    refunded:'Платёжная система подтвердила возврат. Доступ по этому платежу отключён.',
    scheduled:'Следующий период уже оплачен. Начало',receipt:'Фискальный чек',refundReceipt:'Чек возврата',contextTooLarge:'Сообщение слишком длинное для этого запроса. Сократите его или отправьте частями.',
    answerReady:'Ответ готов.',monthlyLimit:'Сообщения этого оплаченного периода закончились. Следующий пакет доступен с начала нового периода.',pause:'Сейчас действует ограничение частоты. Повторите позже — остаток сообщений сохранён.',offer:'Пользуетесь часто? Plus: 300 сообщений за 20 000 сум в месяц.',
    eyebrow:'ВАШ AI-ПОМОЩНИК',welcome:'От вопроса —',welcomeAccent:'к понятному ответу.',
    intro:'Написать, перевести или разобраться в теме. Просто спросите на русском или узбекском.',
    trust:'Ничего скачивать не нужно. Работает прямо здесь.',account:'Мой тариф',title:'Больше пространства для вопросов',price:'20 000 сум / месяц',
    benefits:'300 ответов за оплаченный месяц. До 20 в час и 50 в день. Резервные модели при сбоях. Доступ с разных устройств через Telegram.',
    loginFailed:'Вход не завершён. Попробуйте войти через Telegram ещё раз.',login:'Войти через Telegram',loginConsent:'Согласен на создание аккаунта по идентификатору Telegram. Не запрашиваем телефон, имя и доступ к переписке.',
    unavailable:'Оплата пока не подключена. Бесплатный чат доступен.',logout:'Выйти',close:'Закрыть',check:'Проверить статус',terms:'Принимаю условия подписки и возврата',
    manual:'Без автосписаний. Продление оплачиваете сами.',active:'Plus активен',expires:'Оплачен до',remaining:'ответов осталось в этом периоде',renew:'Период скоро закончится. Можно оплатить следующий месяц.',
    refund:'Запросить возврат',refundPending:'Запрос на возврат принят. Доступ сохраняется до решения.',failed:'Статус не получен. Если уже платили, проверьте статус перед повторной оплатой.',
    pending:'Ожидаем подтверждение оплаты. Возврат с платёжной страницы сам по себе не подтверждает платёж.',cancelled:'Платёж отменён. При списании обратитесь в поддержку провайдера.',expired:'Оплаченный период закончился.',test:'Тестовый режим: реальные деньги не списываются.',
    copyFailed:'Копирование недоступно. Выделите текст и скопируйте вручную.',partial:'Ответ прервался. Сохранённая часть доступна; можно попросить продолжить.',simpler:'Объяснить проще',translate:'Перевести на узбекский',continue:'Продолжить',
    historyNote:'История доступна в этом браузере и не синхронизируется. Подписка действует на всех устройствах после входа.',savedChats:'Ваши разговоры',noHistory:'Сохранённых разговоров пока нет.',newChatHint:'Начать новую тему',actionCost:'Продолжение, перевод и упрощение используют по одному сообщению.',
  },
  brand: 'GPTBot AI',
  online: 'Online',
  inputPlaceholder: 'Напишите сообщение…',
  inputMicrocopy: 'AI может ошибаться. Проверяйте важные данные.',
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
  pricingLink: 'Тарифы',
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
  b2bLine: 'Нужен AI-бот для сайта или Telegram?',
  telegramCta: 'Открыть в Telegram',
  contactTelegram: 'Написать нам в Telegram',
  dismissOffer: 'Скрыть предложение',
  remaining: (n) => `Осталось ${n} сообщений сегодня`,
  lowWarning: (n) => `Осталось ${n} ${n === 1 ? 'сообщение' : 'сообщения'} на сегодня.`,
  charsLeft: (n) => `${n} символов до лимита`,
  emptyTitle: 'Чем помочь сегодня?',
  emptyHint: 'Напишите вопрос или выберите пример.',
  tryFree: 'Попробовать бесплатно',
  emptyPrompt: 'Что хотите сделать?',
  emptyMeta: 'Бесплатно, без регистрации — 15 сообщений в день.',
  feedbackUp: 'Полезно',
  feedbackDown: 'Бесполезно',
  feedbackThanks: 'Спасибо за отзыв',
  disclaimer:
    'GPTBot.uz — независимый AI-сервис. Не является официальным продуктом OpenAI, ChatGPT или NVIDIA.',
  safetyWarning:
    'AI может ошибаться — проверяйте важные факты. Не вводите пароли, номера карт и коммерческие тайны.',
  quickActions: [
    { label: 'Напиши оффер для рекламы', prompt: 'Напиши 5 вариантов рекламного оффера для Instagram. Продукт: [укажите продукт]. Аудитория: клиенты в Узбекистане. Стиль: уверенный, без агрессии.' },
    { label: 'Переведи на узбекский', prompt: 'Переведи текст на узбекский Latin и сделай его естественным для аудитории Узбекистана: [вставьте текст].' },
    { label: 'Составь план Telegram-бота', prompt: 'Составь структуру Telegram-бота для бизнеса: приветствие, меню, сбор заявки, ответы на вопросы и передача менеджеру. Ниша: [укажите нишу].' },
    { label: 'Улучши описание товара', prompt: 'Улучши описание товара для сайта или маркетплейса. Сделай текст понятным, продающим и без лишней воды. Товар: [укажите товар].' },
  ],
  categories: [
    { label: 'Маркетинг', prompts: ['Придумай 5 идей рекламных креативов', 'Напиши УТП для моего продукта'] },
    { label: 'Продажи', prompts: ['Составь скрипт ответа на возражение «дорого»', 'Напиши план продаж на неделю'] },
    { label: 'Instagram', prompts: ['Напиши пост для Instagram с призывом к действию', 'Придумай идеи Reels для бизнеса'] },
    { label: 'Telegram', prompts: ['Напиши приветственное сообщение для Telegram-бота', 'Составь воронку заявок в Telegram'] },
    { label: 'Учёба', prompts: ['Объясни тему простыми словами', 'Составь конспект по этому тексту: '] },
    { label: 'Резюме', prompts: ['Усиль моё резюме под вакансию', 'Напиши сопроводительное письмо'] },
    { label: 'Перевод RU/UZ', prompts: ['Переведи на узбекский: ', 'Переведи на русский: '] },
    { label: 'Бизнес', prompts: ['Придумай идею бизнеса в Узбекистане', 'Составь план запуска за 30 дней'] },
  ],
  paywallTitle: 'Free-лимит закончился',
  paywallBody: 'Plus готовится к запуску. Оставьте заявку — сообщим условия и подключим вручную, если тариф доступен.',
  paywallCta: 'Оставить заявку на Plus',
  paywallBenefits: ['Планируется больше сообщений', 'История после запуска аккаунтов', 'Все шаблоны', 'Приоритетная поддержка'],
  plusManualNote: 'Оплата скоро будет доступна. Оставьте заявку — подключим тариф вручную.',
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
  leadSuccessNext: 'Свяжемся в рабочее время: пн–пт, 09:00–18:00.',
  leadSuccessTelegram: 'Если нужно быстрее — напишите нам в Telegram.',
  leadIntro: 'Нужен такой AI-чат на сайт, в Telegram или CRM? Оставьте контакт.',
  leadValidation: 'Укажите контакт и подтвердите согласие на обработку данных.',
  leadError: 'Не удалось отправить заявку. Попробуйте ещё раз или напишите нам в Telegram.',
  newChat: 'Новый чат',
  history: 'История',
  loginToSave: 'Гостевая история хранится только в этом браузере. Аккаунты и синхронизация между устройствами появятся позже.',
  copy: 'Копировать',
  copied: 'Скопировано',
  retry: 'Повторить',
  shorter: 'Сделать короче',
  forInstagram: 'Для Instagram',
  toUzbekLatin: 'На Uzbek Latin',
  botScenario: 'Сценарий бота',
  implementBot: 'Внедрить AI-бота',
  moreActions: 'Ещё',
  lessActions: 'Скрыть',
  actionRunning: 'Выполняется…',
  feedbackQuestion: 'Ответ был полезен?',
  plusBadge: 'Plus · скоро',
  planBadge: (plan) => ({ anonymous_free: 'Гость', registered_free: 'Free', plus: 'Plus', business: 'Business' }[plan] || plan),
  b2bTitle: 'Нужен такой AI-чат для сайта, Telegram или CRM?',
  b2bDiscuss: 'Обсудить внедрение',
  b2bSiteChat: 'AI-чат для сайта',
  b2bTelegram: 'Telegram-бот для бизнеса',
  offerBadge: 'Для бизнеса',
  offerBody: 'Этот же бот может отвечать вашим клиентам — в Telegram или прямо на вашем сайте.',
  capTelegramCta: 'Написать нам в Telegram',
  capTelegramNote: 'Ответит человек из студии, обычно в рабочее время. Бесплатные сообщения в чате вернутся завтра.',
  capLeadCta: 'Оставить контакт',
  telegramContextNote: 'К сообщению добавится короткий код этого разговора — по нему мы поймём, о чём вы спрашивали здесь.',
  hourlyTitle: 'Часовой лимит исчерпан',
  hourlyBody: 'Бесплатный чат на сайте считает сообщения по часам. Дневной лимит ещё не закончился — продолжите в Telegram сейчас или вернитесь сюда позже.',
  hourlyRetry: 'Попробовать снова',
  hourlyRetryHint: 'Если час уже прошёл',
  dailyBody: 'Дневной бесплатный лимит на сайте исчерпан. Продолжить можно в нашем Telegram-боте — или оставьте контакт, и мы свяжемся.',
  leadIntroCap: 'Оставьте контакт — свяжемся и ответим на вопросы.',
  leadConsentDetail: 'Отправляем имя, контакт, номер сессии чата и адрес страницы. Текст переписки не передаётся.',
  answeredBy: 'Ответила модель',
  writing: 'Пишет ответ…',
};

const UZ: ChatStrings = {
  premium: {
    refunded:'To‘lov tizimi pulni qaytarishni tasdiqladi. Shu to‘lov bo‘yicha obuna o‘chirildi.',
    scheduled:'Keyingi davr uchun to‘langan. Boshlanish sanasi',receipt:'Fiskal chek',refundReceipt:'Pulni qaytarish cheki',contextTooLarge:'Bu so‘rov uchun matn juda uzun. Uni qisqartiring yoki bo‘lib yuboring.',
    answerReady:'Javob tayyor.',monthlyLimit:'Bu davr uchun xabarlar tugadi. Yangi to‘plam keyingi davr boshlanganda ochiladi.',pause:'Hozircha so‘rovlar soni cheklangan. Keyinroq qayta urining — qolgan xabarlaringiz saqlanadi.',offer:'Tez-tez foydalanasizmi? Plus: oyiga 20 000 so‘mga 300 ta xabar.',
    eyebrow:'SIZNING AI YORDAMCHINGIZ',welcome:'Savolingiz bor?',welcomeAccent:'Birga yechim topamiz.',
    intro:'Matn yozish, tarjima qilish yoki mavzuni tushunish. O‘zbekcha yoki ruscha so‘rang.',
    trust:'Yuklab olish shart emas. Shu yerning o‘zida ishlaydi.',account:'Mening tarifim',title:'Savollaringiz uchun ko‘proq imkoniyat',price:'Oyiga 20 000 so‘m',
    benefits:'To‘langan oy davomida 300 ta javob. Soatiga 20 ta, kuniga 50 tagacha. Model ishlamasa, zaxira modelga o‘tamiz. Telegram orqali boshqa qurilmada ham foydalanasiz.',
    loginFailed:'Kirish yakunlanmadi. Telegram orqali yana kirib ko‘ring.',login:'Telegram orqali kirish',loginConsent:'Telegram identifikatori orqali akkaunt yaratishga roziman. Telefon, ism va yozishmalarga ruxsat so‘ramaymiz.',
    unavailable:'To‘lov hali ulanmagan. Bepul chatdan foydalanishingiz mumkin.',logout:'Chiqish',close:'Yopish',check:'Holatni tekshirish',terms:'Obuna va pulni qaytarish shartlariga roziman',
    manual:'Avtomatik yechib olish yo‘q. Keyingi oy uchun o‘zingiz to‘laysiz.',active:'Plus faol',expires:'Amal qilish muddati',remaining:'ta javob shu davr uchun qoldi',renew:'Muddat tugashiga oz qoldi. Keyingi oy uchun to‘lashingiz mumkin.',
    refund:'Pulni qaytarishni so‘rash',refundPending:'So‘rovingiz qabul qilindi. Qaror chiqquncha xizmatdan foydalanasiz.',failed:'Holatni aniqlab bo‘lmadi. To‘lagan bo‘lsangiz, yana to‘lashdan oldin holatni tekshiring.',
    pending:'To‘lov tasdig‘ini kutyapmiz. To‘lov sahifasidan qaytish to‘lov amalga oshganini bildirmaydi.',cancelled:'To‘lov bekor qilindi. Pul yechilgan bo‘lsa, to‘lov xizmati yordam markaziga murojaat qiling.',expired:'To‘langan muddat tugadi.',test:'Sinov rejimi: haqiqiy pul yechilmaydi.',
    copyFailed:'Nusxalab bo‘lmadi. Matnni belgilab, qo‘lda nusxalang.',partial:'Javob uzilib qoldi. Kelgan qismi saqlandi. Davom ettirishni so‘rashingiz mumkin.',simpler:'Oddiyroq tushuntir',translate:'Rus tiliga tarjima',continue:'Davom ettir',
    historyNote:'Tarix shu brauzerda ko‘rinadi va sinxronlanmaydi. Obuna akkauntga kirgan barcha qurilmalarda ishlaydi.',savedChats:'Suhbatlaringiz',noHistory:'Hozircha saqlangan suhbat yo‘q.',newChatHint:'Yangi mavzu boshlash',actionCost:'Davom ettirish, tarjima va soddalashtirish uchun bittadan xabar sarflanadi.',
  },
  brand: 'GPTBot AI',
  online: 'Online',
  inputPlaceholder: 'Xabar yozing…',
  inputMicrocopy: 'AI xato qilishi mumkin. Muhim ma’lumotlarni tekshiring.',
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
  pricingLink: 'Tariflar',
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
  b2bLine: 'Sayt yoki Telegram uchun AI-bot kerakmi?',
  telegramCta: 'Telegramda ochish',
  contactTelegram: 'Telegramda bizga yozing',
  dismissOffer: 'Taklifni yopish',
  remaining: (n) => `Bugun ${n} ta xabar qoldi`,
  lowWarning: (n) => `Bugun ${n} ta xabar qoldi.`,
  charsLeft: (n) => `Limitgacha ${n} belgi`,
  emptyTitle: 'Bugun sizga qanday yordam beray?',
  emptyHint: 'Savolingizni yozing yoki misolni tanlang.',
  tryFree: 'Bepul sinab ko‘rish',
  emptyPrompt: 'Nima qilmoqchisiz?',
  emptyMeta: 'Bepul, ro‘yxatdan o‘tmasdan — kuniga 15 ta xabar.',
  feedbackUp: 'Foydali',
  feedbackDown: 'Foydasiz',
  feedbackThanks: 'Fikr uchun rahmat',
  disclaimer:
    'GPTBot.uz — mustaqil AI-xizmat. OpenAI, ChatGPT yoki NVIDIA’ning rasmiy mahsuloti emas.',
  safetyWarning:
    'AI xato qilishi mumkin — muhim faktlarni tekshiring. Parol, karta raqami va tijorat sirlarini kiritmang.',
  quickActions: [
    { label: 'Reklama uchun offer yoz', prompt: 'Instagram uchun 5 xil reklama offerini yoz. Mahsulot: [mahsulotni kiriting]. Auditoriya: O‘zbekistondagi mijozlar. Uslub: ishonchli, tajovuzsiz.' },
    { label: 'Rus tiliga tarjima qil', prompt: 'Matnni rus tiliga tarjima qil va O‘zbekiston auditoriyasi uchun tabiiy qil: [matnni kiriting].' },
    { label: 'Telegram-bot rejasini tuz', prompt: 'Biznes uchun Telegram-bot tuzilishini tuz: salomlashuv, menyu, ariza yig‘ish, savollarga javob va menejerga uzatish. Nisha: [nishani kiriting].' },
    { label: 'Mahsulot tavsifini yaxshila', prompt: 'Sayt yoki marketpleys uchun mahsulot tavsifini yaxshila. Matnni tushunarli, sotadigan va ortiqcha suvsiz qil. Mahsulot: [mahsulotni kiriting].' },
  ],
  categories: [
    { label: 'Marketing', prompts: ['5 ta reklama krieativ g‘oyasini o‘yla', 'Mahsulotim uchun UTP yoz'] },
    { label: 'Sotuv', prompts: ['«Qimmat» e’tiroziga javob skriptini tuz', 'Haftalik sotuv rejasini yoz'] },
    { label: 'Instagram', prompts: ['Instagram uchun harakatga chaqiruvli post yoz', 'Biznes uchun Reels g‘oyalari'] },
    { label: 'Telegram', prompts: ['Telegram-bot uchun salomlashuv xabarini yoz', 'Telegramda arizalar voronkasini tuz'] },
    { label: 'O‘qish', prompts: ['Mavzuni oddiy tilda tushuntir', 'Ushbu matndan konspekt tuz: '] },
    { label: 'Rezyume', prompts: ['Rezyumeimni vakansiyaga moslashtir', 'Motivatsion xat yoz'] },
    { label: 'Tarjima RU/UZ', prompts: ['Rus tiliga tarjima qil: ', 'O‘zbek tiliga tarjima qil: '] },
    { label: 'Biznes', prompts: ['O‘zbekistonda biznes g‘oyasini o‘yla', '30 kunlik ishga tushirish rejasi'] },
  ],
  paywallTitle: 'Bepul limit tugadi',
  paywallBody: 'Plus ishga tushirishga tayyorlanmoqda. Ariza qoldiring — tarif mavjud bo‘lsa, shartlarni aytamiz va qo‘lda ulaymiz.',
  paywallCta: 'Plus uchun ariza',
  paywallBenefits: ['Ko‘proq xabar rejalashtirilgan', 'Akkauntdan keyin chat tarixi', 'Barcha shablonlar', 'Ustuvor yordam'],
  plusManualNote: 'To‘lov tez orada. Ariza qoldiring — tarifni qo‘lda ulaymiz.',
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
  leadSuccessNext: 'Ish vaqtida bog‘lanamiz: dushanba–juma, 09:00–18:00.',
  leadSuccessTelegram: 'Tezroq kerak bo‘lsa — Telegramda yozing.',
  leadIntro: 'Shunday AI-chat sayt, Telegram yoki CRM uchun kerakmi? Kontakt qoldiring.',
  leadValidation: 'Kontaktni kiriting va ma’lumotlarni qayta ishlashga rozilik bering.',
  leadError: 'Ariza yuborilmadi. Yana urinib ko‘ring yoki Telegramda yozing.',
  newChat: 'Yangi chat',
  history: 'Tarix',
  loginToSave: 'Mehmon tarixi faqat shu brauzerda saqlanadi. Akkaunt va qurilmalararo sinxronlash keyinroq ishga tushadi.',
  copy: 'Nusxalash',
  copied: 'Nusxalandi',
  retry: 'Qayta urinish',
  shorter: 'Qisqartirish',
  forInstagram: 'Instagram uchun',
  toUzbekLatin: 'Uzbek Latin',
  botScenario: 'Bot ssenariysi',
  implementBot: 'AI-botni joriy etish',
  moreActions: 'Yana',
  lessActions: 'Yopish',
  actionRunning: 'Bajarilmoqda…',
  feedbackQuestion: 'Javob foydali bo‘ldimi?',
  plusBadge: 'Plus · tez orada',
  planBadge: (plan) => ({ anonymous_free: 'Mehmon', registered_free: 'Free', plus: 'Plus', business: 'Business' }[plan] || plan),
  b2bTitle: 'Biznesingiz uchun shunday AI chat kerakmi?',
  b2bDiscuss: 'Joriy etishni muhokama qilish',
  b2bSiteChat: 'Sayt uchun AI-chat',
  b2bTelegram: 'Biznes uchun Telegram-bot',
  offerBadge: 'Biznes uchun',
  offerBody: 'Xuddi shu bot sizning mijozlaringizga ham javob bera oladi — Telegramda yoki saytingizda.',
  capTelegramCta: 'Telegramda yozish',
  capTelegramNote: 'Studiyadan odam javob beradi, odatda ish vaqtida. Chatdagi bepul xabarlar ertaga qaytadi.',
  capLeadCta: 'Kontakt qoldirish',
  telegramContextNote: 'Xabarga shu suhbatning qisqa kodi qo‘shiladi — shu orqali nima so‘raganingizni tushunamiz.',
  hourlyTitle: 'Soatlik limit tugadi',
  hourlyBody: 'Saytdagi bepul chat xabarlarni soat bo‘yicha hisoblaydi. Kunlik limit hali tugagani yo‘q — hozir Telegramda davom ettiring yoki keyinroq shu yerga qayting.',
  hourlyRetry: 'Qayta urinib ko‘rish',
  hourlyRetryHint: 'Agar bir soat o‘tgan bo‘lsa',
  dailyBody: 'Saytdagi kunlik bepul limit tugadi. Telegram-botimizda davom ettirishingiz mumkin — yoki kontakt qoldiring, o‘zimiz bog‘lanamiz.',
  leadIntroCap: 'Kontakt qoldiring — bog‘lanamiz va savollaringizga javob beramiz.',
  leadConsentDetail: 'Ism, kontakt, chat sessiyasi raqami va sahifa manzili yuboriladi. Yozishmalar matni uzatilmaydi.',
  answeredBy: 'Javob bergan model',
  writing: 'Javob yozilmoqda…',
};

export function strings(locale: Locale): ChatStrings {
  return locale === 'uz' ? UZ : RU;
}
