// RU/UZ copy of the business offer card and its lead form (lazy part
// chat-lead): it loads with the card, not with the chat. Lines the chat shares
// with them (the privacy link, the Telegram labels, the Turnstile check) stay
// in i18n.ts.
import type { Locale } from './types';

export interface LeadStrings {
  // The B2B offer card (AiOfferCard), after a few answers in the business tool.
  b2bTitle: string;
  b2bDiscuss: string;
  offerBadge: string;
  offerBody: string;
  dismissOffer: string;
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
  leadSuccessTelegram: string;
  leadIntro: string;
  leadError: string;
}

const RU: LeadStrings = {
  b2bTitle: 'Нужен такой AI-чат для сайта, Telegram или CRM?',
  b2bDiscuss: 'Обсудить внедрение',
  offerBadge: 'Для бизнеса',
  offerBody: 'Этот же бот может отвечать вашим клиентам — в Telegram или прямо на вашем сайте.',
  dismissOffer: 'Скрыть предложение',
  leadName: 'Имя',
  leadNameOptional: 'необязательно',
  leadNamePlaceholder: 'Как к вам обращаться',
  leadContact: 'Телефон или Telegram',
  leadContactPlaceholder: '+998 90 123 45 67 или @username',
  leadContactHint: 'Ответим на этот же контакт. Ничего другого мы не собираем.',
  leadContactError: 'Укажите номер в формате +998 90 123 45 67 или Telegram-логин @username.',
  leadConsent: 'Согласен на обработку данных для связи',
  leadConsentError: 'Отметьте согласие — без него мы не сохраняем контакт.',
  leadConsentDetail: 'Отправляем имя, контакт, номер сессии чата и адрес страницы. Текст переписки не передаётся.',
  leadSubmit: 'Оставить заявку',
  leadSending: 'Отправляем…',
  leadSuccess: 'Заявка принята.',
  leadSuccessNext: 'Свяжемся в рабочее время: пн–сб, 10:00–19:00.',
  leadSuccessTelegram: 'Если нужно быстрее — напишите нам в Telegram.',
  leadIntro: 'Нужен такой AI-чат на сайт, в Telegram или CRM? Оставьте контакт.',
  leadError: 'Не удалось отправить заявку. Попробуйте ещё раз или напишите нам в Telegram.',
};

const UZ: LeadStrings = {
  b2bTitle: 'Biznesingiz uchun shunday AI chat kerakmi?',
  b2bDiscuss: 'Joriy etishni muhokama qilish',
  offerBadge: 'Biznes uchun',
  offerBody: 'Xuddi shu bot sizning mijozlaringizga ham javob bera oladi — Telegramda yoki saytingizda.',
  dismissOffer: 'Taklifni yopish',
  leadName: 'Ism',
  leadNameOptional: 'ixtiyoriy',
  leadNamePlaceholder: 'Sizga qanday murojaat qilaylik',
  leadContact: 'Telefon yoki Telegram',
  leadContactPlaceholder: '+998 90 123 45 67 yoki @username',
  leadContactHint: 'Shu kontaktga javob beramiz. Boshqa ma’lumot yig‘maymiz.',
  leadContactError: 'Raqamni +998 90 123 45 67 ko‘rinishida yoki @username Telegram-loginini kiriting.',
  leadConsent: 'Bog‘lanish uchun ma’lumotlarni qayta ishlashga roziman',
  leadConsentError: 'Rozilikni belgilang — usiz kontaktni saqlamaymiz.',
  leadConsentDetail: 'Ism, kontakt, chat sessiyasi raqami va sahifa manzili yuboriladi. Yozishmalar matni uzatilmaydi.',
  leadSubmit: 'Ariza qoldirish',
  leadSending: 'Yuborilmoqda…',
  leadSuccess: 'Ariza qabul qilindi.',
  leadSuccessNext: 'Ish vaqtida bog‘lanamiz: dushanba–shanba, 10:00–19:00.',
  leadSuccessTelegram: 'Tezroq kerak bo‘lsa — Telegramda yozing.',
  leadIntro: 'Shunday AI-chat sayt, Telegram yoki CRM uchun kerakmi? Kontakt qoldiring.',
  leadError: 'Ariza yuborilmadi. Yana urinib ko‘ring yoki Telegramda yozing.',
};

export function leadStrings(locale: Locale): LeadStrings {
  return locale === 'uz' ? UZ : RU;
}
