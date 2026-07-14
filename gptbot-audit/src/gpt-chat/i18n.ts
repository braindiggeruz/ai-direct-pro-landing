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

export interface ChatStrings {
  brand: string;
  online: string;
  inputPlaceholder: string;
  inputMicrocopy: string;
  send: string;
  thinking: string;
  errorGeneric: string;
  remaining: (n: number) => string;
  lowWarning: (n: number) => string;
  charsLeft: (n: number) => string;
  emptyTitle: string;
  emptyHint: string;
  tryFree: string;
  emptyPrompt: string;
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
  leadContact: string;
  leadConsent: string;
  leadSubmit: string;
  leadSuccess: string;
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
}

const RU: ChatStrings = {
  brand: 'GPTBot AI',
  online: 'Online',
  inputPlaceholder: 'Напишите задачу: текст, перевод, реклама, Telegram, учёба…',
  inputMicrocopy: 'Не вводите пароли, карты и секретные данные',
  send: 'Отправить',
  thinking: 'AI думает…',
  errorGeneric: 'Модель временно перегружена, попробуйте ещё раз.',
  remaining: (n) => `Осталось ${n} сообщений сегодня`,
  lowWarning: (n) => `Осталось ${n} ${n === 1 ? 'сообщение' : 'сообщения'} на сегодня. Дальше — тариф Plus.`,
  charsLeft: (n) => `${n} символов до лимита`,
  emptyTitle: 'Спросите AI на русском или узбекском',
  emptyHint: 'Тексты, реклама, Telegram, учёба, продажи и бизнес-идеи — в одном чате',
  tryFree: 'Попробовать бесплатно',
  emptyPrompt: 'Что хотите сделать?',
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
  leadName: 'Ваше имя',
  leadContact: 'Телефон или Telegram',
  leadConsent: 'Согласен на обработку данных для связи',
  leadSubmit: 'Оставить заявку',
  leadSuccess: 'Заявка принята — мы свяжемся с вами.',
  leadIntro: 'Нужен такой AI-чат на сайт, в Telegram или CRM? Оставьте контакт.',
  leadValidation: 'Укажите контакт и подтвердите согласие на обработку данных.',
  leadError: 'Не удалось отправить форму. Попробуйте ещё раз или напишите нам в Telegram.',
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
};

const UZ: ChatStrings = {
  brand: 'GPTBot AI',
  online: 'Online',
  inputPlaceholder: 'Vazifa yozing: matn, tarjima, reklama, Telegram, o‘qish…',
  inputMicrocopy: 'Parol, karta va maxfiy ma’lumotlarni kiritmang',
  send: 'Yuborish',
  thinking: 'AI o‘ylayapti…',
  errorGeneric: 'Model vaqtincha band, yana urinib ko‘ring.',
  remaining: (n) => `Bugun ${n} ta xabar qoldi`,
  lowWarning: (n) => `Bugun ${n} ta xabar qoldi. Keyin — Plus tarifi.`,
  charsLeft: (n) => `Limitgacha ${n} belgi`,
  emptyTitle: 'O‘zbek yoki rus tilida savol bering',
  emptyHint: 'Matn, reklama, Telegram, o‘qish, savdo va biznes g‘oyalari — bitta chatda',
  tryFree: 'Bepul sinab ko‘rish',
  emptyPrompt: 'Nima qilmoqchisiz?',
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
  leadName: 'Ismingiz',
  leadContact: 'Telefon yoki Telegram',
  leadConsent: 'Bog‘lanish uchun ma’lumotlarni qayta ishlashga roziman',
  leadSubmit: 'Ariza qoldirish',
  leadSuccess: 'Ariza qabul qilindi — tez orada bog‘lanamiz.',
  leadIntro: 'Shunday AI-chat sayt, Telegram yoki CRM uchun kerakmi? Kontakt qoldiring.',
  leadValidation: 'Kontaktni kiriting va ma’lumotlarni qayta ishlashga rozilik bering.',
  leadError: 'Forma yuborilmadi. Yana urinib ko‘ring yoki Telegram orqali yozing.',
  newChat: 'Yangi chat',
  history: 'Tarix',
  loginToSave: 'Mehmon tarixi faqat shu brauzerda saqlanadi. Akkaunt va qurilmalararo sinxronlash keyinroq ishga tushadi.',
  copy: 'Nusxa olish',
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
};

export function strings(locale: Locale): ChatStrings {
  return locale === 'uz' ? UZ : RU;
}
