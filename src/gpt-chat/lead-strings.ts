// RU/UZ copy of the business offer card, the business line and their lead
// form (lazy part chat-lead): it loads with them, not with the chat. Lines the
// chat shares with them (the privacy link, the Telegram labels, the Turnstile
// check) stay in i18n.ts; the budget's labels live in src/shared/lead-budget.ts
// with the page forms'.
import type { Locale } from './types';

export interface LeadStrings {
  // The B2B offer card (AiOfferCard), after a few answers in the business tool.
  b2bTitle: string;
  b2bDiscuss: string;
  offerBadge: string;
  offerBody: string;
  dismissOffer: string;
  // The business line (AiBusinessLine), once after a first answer about a bot, a site, ads or a CRM.
  /** Marks the line as the studio's, not part of the model's answer. */
  lineLabel: string;
  lineText: string;
  lineCta: string;
  lineDismiss: string;
  /** The link to the service page, which carries the same form. */
  lineMore: string;
  // The lead form (AiLeadForm).
  leadName: string;
  leadNameOptional: string;
  leadNamePlaceholder: string;
  leadContact: string;
  leadContactPlaceholder: string;
  leadContactHint: string;
  leadContactError: string;
  leadConsent: string;
  leadConsentError: string;
  /** Exactly what leaves the browser, in plain words. */
  leadConsentDetail: string;
  leadSubmit: string;
  leadSending: string;
  leadSuccess: string;
  leadSuccessNext: string;
  /** Leads into the studio contact link (contact.ts studioQuickContact). */
  leadSuccessFaster: string;
  leadIntro: string;
  leadError: string;
}

const RU: LeadStrings = {
  b2bTitle: 'Нужен такой AI-чат для сайта, Telegram или CRM?',
  b2bDiscuss: 'Обсудить внедрение',
  offerBadge: 'Для бизнеса',
  offerBody: 'Этот же бот может отвечать вашим клиентам — в Telegram или прямо на вашем сайте.',
  dismissOffer: 'Скрыть предложение',
  lineLabel: 'Услуга GPTBot.uz',
  lineText: 'Нужен Telegram-бот, сайт или реклама для бизнеса? Специалист бесплатно проконсультирует.',
  lineCta: 'Оставить заявку',
  lineDismiss: 'Скрыть',
  lineMore: 'Об услуге',
  leadName: 'Имя',
  leadNameOptional: 'необязательно',
  leadNamePlaceholder: 'Как к вам обращаться',
  leadContact: 'Телефон или Telegram',
  leadContactPlaceholder: '+998 90 123 45 67 или @username',
  leadContactHint: 'Ответим на этот же контакт. Ничего другого мы не собираем.',
  leadContactError: 'Укажите номер в формате +998 90 123 45 67 или Telegram-логин @username.',
  leadConsent: 'Согласен на обработку данных для связи',
  leadConsentError: 'Отметьте согласие — без него мы не сохраняем контакт.',
  leadConsentDetail: 'Отправляем имя, контакт, бюджет, если вы его выбрали, номер сессии чата и адрес страницы. Текст переписки не передаётся.',
  leadSubmit: 'Оставить заявку',
  leadSending: 'Отправляем…',
  leadSuccess: 'Заявка принята.',
  leadSuccessNext: 'Свяжемся в рабочее время: пн–сб, 10:00–19:00.',
  leadSuccessFaster: 'Если нужно быстрее, свяжитесь с нами:',
  leadIntro: 'Нужен такой AI-чат на сайт, в Telegram или CRM? Оставьте контакт.',
  leadError: 'Не удалось отправить заявку. Попробуйте ещё раз или свяжитесь с нами:',
};

const UZ: LeadStrings = {
  b2bTitle: 'Biznesingiz uchun shunday AI chat kerakmi?',
  b2bDiscuss: 'Joriy etishni muhokama qilish',
  offerBadge: 'Biznes uchun',
  offerBody: 'Xuddi shu bot sizning mijozlaringizga ham javob bera oladi — Telegramda yoki saytingizda.',
  dismissOffer: 'Taklifni yopish',
  lineLabel: 'GPTBot.uz xizmati',
  lineText: 'Biznesingiz uchun Telegram-bot, sayt yoki reklama kerakmi? Mutaxassis bepul maslahat beradi.',
  lineCta: 'Ariza qoldirish',
  lineDismiss: 'Yopish',
  lineMore: 'Xizmat haqida',
  leadName: 'Ism',
  leadNameOptional: 'ixtiyoriy',
  leadNamePlaceholder: 'Sizga qanday murojaat qilaylik',
  leadContact: 'Telefon yoki Telegram',
  leadContactPlaceholder: '+998 90 123 45 67 yoki @username',
  leadContactHint: 'Shu kontaktga javob beramiz. Boshqa ma’lumot yig‘maymiz.',
  leadContactError: 'Raqamni +998 90 123 45 67 ko‘rinishida yoki @username Telegram-loginini kiriting.',
  leadConsent: 'Bog‘lanish uchun ma’lumotlarni qayta ishlashga roziman',
  leadConsentError: 'Rozilikni belgilang — usiz kontaktni saqlamaymiz.',
  leadConsentDetail: 'Ism, kontakt, tanlagan bo‘lsangiz byudjet, chat sessiyasi raqami va sahifa manzili yuboriladi. Yozishmalar matni uzatilmaydi.',
  leadSubmit: 'Ariza qoldirish',
  leadSending: 'Yuborilmoqda…',
  leadSuccess: 'Ariza qabul qilindi.',
  leadSuccessNext: 'Ish vaqtida bog‘lanamiz: dushanba–shanba, 10:00–19:00.',
  leadSuccessFaster: 'Tezroq kerak bo‘lsa, biz bilan bog‘laning:',
  leadIntro: 'Shunday AI-chat sayt, Telegram yoki CRM uchun kerakmi? Kontakt qoldiring.',
  leadError: 'Ariza yuborilmadi. Yana urinib ko‘ring yoki biz bilan bog‘laning:',
};

export function leadStrings(locale: Locale): LeadStrings {
  return locale === 'uz' ? UZ : RU;
}
