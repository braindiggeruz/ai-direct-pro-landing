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
  charsLeft: (n: number) => string;
  emptyTitle: string;
  emptyHint: string;
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
  newChat: string;
  history: string;
  loginToSave: string;
  copy: string;
  copied: string;
  retry: string;
  planBadge: (plan: string) => string;
  b2bTitle: string;
  b2bDiscuss: string;
  b2bSiteChat: string;
  b2bTelegram: string;
}

const RU: ChatStrings = {
  brand: 'GPTBot AI',
  online: 'Online',
  inputPlaceholder: 'Спросите что угодно…  (Enter — отправить, Shift+Enter — новая строка)',
  inputMicrocopy: 'Не вводите пароли, карты и секретные данные',
  send: 'Отправить',
  thinking: 'AI отвечает',
  errorGeneric: 'Не удалось получить ответ. Попробуйте ещё раз.',
  remaining: (n) => `Осталось ${n} сегодня`,
  charsLeft: (n) => `${n} символов до лимита`,
  emptyTitle: 'Спросите AI на русском или узбекском',
  emptyHint: 'Тексты, реклама, Telegram, учёба, продажи и бизнес-идеи — в одном чате',
  disclaimer:
    'GPTBot.uz — независимый AI-сервис. Не является официальным продуктом OpenAI, ChatGPT или NVIDIA.',
  safetyWarning:
    'AI может ошибаться — проверяйте важные факты. Не вводите пароли, номера карт и коммерческие тайны.',
  quickActions: [
    { label: 'Напиши оффер для рекламы', prompt: 'Напиши цепляющий рекламный оффер для моего бизнеса. Спроси, чего не хватает.' },
    { label: 'Переведи на узбекский', prompt: 'Переведи следующий текст на узбекский язык (o‘zbek tilida): ' },
    { label: 'Составь план Telegram-бота', prompt: 'Составь пошаговый план Telegram-бота для приёма заявок в моём бизнесе.' },
    { label: 'Улучши описание товара', prompt: 'Улучши описание товара, чтобы оно лучше продавало. Вот текущее описание: ' },
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
  paywallBody: 'Оформите Plus за $5/мес и продолжайте без ограничений.',
  paywallCta: 'Хочу Plus',
  paywallBenefits: ['Больше сообщений', 'История чатов', 'Длиннее контекст', 'Приоритетные модели'],
  plusManualNote: 'Оплата скоро будет доступна. Оставьте заявку — подключим тариф вручную.',
  leadName: 'Ваше имя',
  leadContact: 'Телефон или Telegram',
  leadConsent: 'Согласен на обработку данных для связи',
  leadSubmit: 'Оставить заявку',
  leadSuccess: 'Заявка принята — мы свяжемся с вами.',
  leadIntro: 'Нужен такой AI-чат на сайт, в Telegram или CRM? Оставьте контакт.',
  newChat: 'Новый чат',
  history: 'История',
  loginToSave: 'Войдите, чтобы сохранять историю чатов. Скоро будет доступно.',
  copy: 'Копировать',
  copied: 'Скопировано',
  retry: 'Повторить',
  planBadge: (plan) => ({ anonymous_free: 'Гость', registered_free: 'Free', plus: 'Plus', business: 'Business' }[plan] || plan),
  b2bTitle: 'Нужен такой AI-чат для сайта, Telegram или CRM?',
  b2bDiscuss: 'Обсудить внедрение',
  b2bSiteChat: 'AI-чат для сайта',
  b2bTelegram: 'Telegram-бот для бизнеса',
};

const UZ: ChatStrings = {
  brand: 'GPTBot AI',
  online: 'Online',
  inputPlaceholder: 'Istalgan narsani so‘rang…  (Enter — yuborish, Shift+Enter — yangi qator)',
  inputMicrocopy: 'Parol, karta va maxfiy ma’lumotlarni kiritmang',
  send: 'Yuborish',
  thinking: 'AI javob yozmoqda',
  errorGeneric: 'Javob olinmadi. Yana urinib ko‘ring.',
  remaining: (n) => `Bugun ${n} ta qoldi`,
  charsLeft: (n) => `Limitgacha ${n} belgi`,
  emptyTitle: 'O‘zbek yoki rus tilida savol bering',
  emptyHint: 'Reklama, matn, Telegram, o‘qish va biznes g‘oyalari — bitta chatda',
  disclaimer:
    'GPTBot.uz — mustaqil AI-xizmat. OpenAI, ChatGPT yoki NVIDIA’ning rasmiy mahsuloti emas.',
  safetyWarning:
    'AI xato qilishi mumkin — muhim faktlarni tekshiring. Parol, karta raqami va tijorat sirlarini kiritmang.',
  quickActions: [
    { label: 'Reklama uchun offer yoz', prompt: 'Biznesim uchun jozibali reklama offerini yoz. Nima yetishmasligini so‘ra.' },
    { label: 'Rus tiliga tarjima qil', prompt: 'Quyidagi matnni rus tiliga tarjima qil: ' },
    { label: 'Telegram-bot rejasini tuz', prompt: 'Biznesimda arizalarni qabul qilish uchun Telegram-bot rejasini bosqichma-bosqich tuz.' },
    { label: 'Mahsulot tavsifini yaxshila', prompt: 'Mahsulot tavsifini yaxshiroq sotadigan qilib yaxshila. Joriy tavsif: ' },
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
  paywallBody: 'Plus’ni $5/oy’ga oling va cheklovsiz davom eting.',
  paywallCta: 'Plus kerak',
  paywallBenefits: ['Ko‘proq xabar', 'Chat tarixi', 'Uzun kontekst', 'Tez modellar'],
  plusManualNote: 'To‘lov tez orada. Ariza qoldiring — tarifni qo‘lda ulaymiz.',
  leadName: 'Ismingiz',
  leadContact: 'Telefon yoki Telegram',
  leadConsent: 'Bog‘lanish uchun ma’lumotlarni qayta ishlashga roziman',
  leadSubmit: 'Ariza qoldirish',
  leadSuccess: 'Ariza qabul qilindi — tez orada bog‘lanamiz.',
  leadIntro: 'Shunday AI-chat sayt, Telegram yoki CRM uchun kerakmi? Kontakt qoldiring.',
  newChat: 'Yangi chat',
  history: 'Tarix',
  loginToSave: 'Tarixni saqlash uchun kiring. Tez orada ishga tushadi.',
  copy: 'Nusxa olish',
  copied: 'Nusxalandi',
  retry: 'Qayta urinish',
  planBadge: (plan) => ({ anonymous_free: 'Mehmon', registered_free: 'Free', plus: 'Plus', business: 'Business' }[plan] || plan),
  b2bTitle: 'Biznesingiz uchun shunday AI chat kerakmi?',
  b2bDiscuss: 'Joriy etishni muhokama qilish',
  b2bSiteChat: 'Sayt uchun AI-chat',
  b2bTelegram: 'Biznes uchun Telegram-bot',
};

export function strings(locale: Locale): ChatStrings {
  return locale === 'uz' ? UZ : RU;
}
