// RU/UZ copy for the AI-chat island. Brand-safe strings only.
import type { Locale } from './types';

export interface ChatStrings {
  inputPlaceholder: string;
  send: string;
  thinking: string;
  errorGeneric: string;
  remaining: (n: number) => string;
  unlimitedHint: string;
  emptyTitle: string;
  emptyHint: string;
  disclaimer: string;
  safetyWarning: string;
  promptChips: string[];
  paywallTitle: string;
  paywallBody: string;
  paywallCta: string;
  leadName: string;
  leadContact: string;
  leadConsent: string;
  leadSubmit: string;
  leadSuccess: string;
  leadIntro: string;
  newChat: string;
}

const RU: ChatStrings = {
  inputPlaceholder: 'Напишите сообщение… (Enter — отправить, Shift+Enter — новая строка)',
  send: 'Отправить',
  thinking: 'AI думает…',
  errorGeneric: 'Не удалось получить ответ. Попробуйте ещё раз.',
  remaining: (n) => `Осталось бесплатных сообщений: ${n}`,
  unlimitedHint: 'Бесплатный лимит на сегодня',
  emptyTitle: 'Спросите что угодно',
  emptyHint: 'Тексты, идеи, реклама, учёба, резюме, перевод на узбекский — начните с примера ниже.',
  disclaimer:
    'GPTBot.uz — независимый AI-сервис. Не является официальным продуктом OpenAI, ChatGPT или NVIDIA. Упоминания брендов используются только в описательном контексте.',
  safetyWarning:
    'Не вводите пароли, номера карт, коммерческие тайны, медицинские или юридические документы. AI может ошибаться — проверяйте важные факты.',
  promptChips: [
    'Напиши рекламный оффер',
    'Сделай текст для Instagram',
    'Помоги с резюме',
    'Ответь клиенту в Telegram',
    'Придумай идею для бизнеса',
    'Составь план продаж',
    'Объясни простыми словами',
    'Переведи на узбекский',
  ],
  paywallTitle: 'Лимит бесплатных сообщений исчерпан',
  paywallBody: 'Оформите Plus за $5/мес — больше сообщений, история чатов, шаблоны и приоритетные модели. Или подключите AI-чат для бизнеса.',
  paywallCta: 'Смотреть тарифы',
  leadName: 'Ваше имя',
  leadContact: 'Телефон или Telegram',
  leadConsent: 'Согласен на обработку данных для связи',
  leadSubmit: 'Оставить заявку',
  leadSuccess: 'Заявка принята — мы свяжемся с вами.',
  leadIntro: 'Нужен такой AI-чат на сайт, в Telegram или CRM? Оставьте контакт.',
  newChat: 'Новый чат',
};

const UZ: ChatStrings = {
  inputPlaceholder: 'Xabar yozing… (Enter — yuborish, Shift+Enter — yangi qator)',
  send: 'Yuborish',
  thinking: 'AI o‘ylayapti…',
  errorGeneric: 'Javob olinmadi. Yana urinib ko‘ring.',
  remaining: (n) => `Qolgan bepul xabarlar: ${n}`,
  unlimitedHint: 'Bugungi bepul limit',
  emptyTitle: 'Istalgan narsani so‘rang',
  emptyHint: 'Matn, g‘oya, reklama, o‘qish, rezyume, tarjima — quyidagi misoldan boshlang.',
  disclaimer:
    'GPTBot.uz — mustaqil AI-xizmat. OpenAI, ChatGPT yoki NVIDIA’ning rasmiy mahsuloti emas. Brendlar faqat tavsif uchun eslatiladi.',
  safetyWarning:
    'Parol, karta raqami, tijorat siri, tibbiy yoki yuridik hujjatlarni kiritmang. AI xato qilishi mumkin — muhim faktlarni tekshiring.',
  promptChips: [
    'Reklama offer yozib ber',
    'Instagram uchun matn tayyorla',
    'Rezyumega yordam ber',
    'Telegramda mijozga javob yoz',
    'Biznes uchun g‘oya o‘yla',
    'Sotuv rejasini tuz',
    'Oddiy tilda tushuntir',
    'Rus tiliga tarjima qil',
  ],
  paywallTitle: 'Bepul xabarlar limiti tugadi',
  paywallBody: 'Plus’ni $5/oy’ga oling — ko‘proq xabar, tarix, shablonlar va tez modellar. Yoki biznes uchun AI-chat ulang.',
  paywallCta: 'Tariflarni ko‘rish',
  leadName: 'Ismingiz',
  leadContact: 'Telefon yoki Telegram',
  leadConsent: 'Bog‘lanish uchun ma’lumotlarni qayta ishlashga roziman',
  leadSubmit: 'Ariza qoldirish',
  leadSuccess: 'Ariza qabul qilindi — tez orada bog‘lanamiz.',
  leadIntro: 'Shunday AI-chat sayt, Telegram yoki CRM uchun kerakmi? Kontakt qoldiring.',
  newChat: 'Yangi chat',
};

export function strings(locale: Locale): ChatStrings {
  return locale === 'uz' ? UZ : RU;
}
