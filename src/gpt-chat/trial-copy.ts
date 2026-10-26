// What the end of the trial says about the page's own task (monetization
// roadmap 2026-10-25, §5.2: Ш1 the paywall by role, Ш7 «1 ta sinov javobi
// qoldi», the exit survey «Nega hozir emas?»). Only the lazy part
// chat-conversion imports this file, so none of it rides on the chat's start
// bundle (the role-labels.ts pattern). The price, the answers, the period and
// the daily cap come from the server's PackTerms (AGENTS.md §1, §5). The one
// figure written here is the trial's size, «3 ta» / «Три», as on the limit
// card (limit-card.ts): it is the server's FREE_TRIAL_LIMIT (trial-store.ts),
// and tests/chat-trial-paywall.test.ts fails when the two part, so a new
// trial size cannot ship with the old words. Nothing here promises what the
// server does not enforce: a role is set in the browser, so the copy names
// the task, never a rule.
import type { ChatRolePreset } from '../shared/types';
import type { Locale, PackTerms, PaymentProvider } from './types';

/** The page's role as the paywall names it: a preset (data-chat-role), or 'general' on the two main chats. */
export type PaywallRole = ChatRolePreset | 'general';

export function paywallRole(role: ChatRolePreset | undefined): PaywallRole {
  return role ?? 'general';
}

/** Why not now: the survey's closed list (gpt_ui_events trial_exit_reason). */
export const EXIT_REASONS = ['price', 'once', 'no_card', 'later'] as const;
export type ExitReason = (typeof EXIT_REASONS)[number];

interface RoleCopy {
  /** The window's heading: the page's task, as a question. */
  title: string;
  /** One line: the trial is over, and what the pack does on this page. */
  line: string;
}

const ROLE_COPY: Record<Locale, Record<PaywallRole, RoleCopy>> = {
  uz: {
    general: { title: 'Vazifangizni davom ettiramizmi?', line: '3 ta sinov javobi tugadi. Paketni ulang va shu chatda davom eting.' },
    translator: { title: 'Tarjimani davom ettiramizmi?', line: '3 ta sinov javobi tugadi. AI paket bilan xat, e’lon va xabarlarni shu chatda tarjima qilishda davom eting.' },
    teacher: { title: 'Tushuntirishni davom ettiramizmi?', line: '3 ta sinov javobi tugadi. AI paket bilan mavzu va masalalarni shu chatda bosqichma-bosqich tahlil qilishda davom eting.' },
    smm: { title: 'Reklama matnlarini davom ettiramizmi?', line: '3 ta sinov javobi tugadi. AI paket bilan post, e’lon va reklama matnlarini shu chatda yozishda davom eting.' },
    marketer: { title: 'Marketing ishini davom ettiramizmi?', line: '3 ta sinov javobi tugadi. AI paket bilan offer, kontent reja va g‘oyalar ustida shu chatda ishlashda davom eting.' },
    business: { title: 'Biznes vazifasini davom ettiramizmi?', line: '3 ta sinov javobi tugadi. AI paket bilan mijozlarga javob, skript va rejalar ustida shu chatda ishlashda davom eting.' },
    writer: { title: 'Yana variantlar kerakmi?', line: '3 ta sinov javobi tugadi. AI paket bilan tabrik, she’r va post matnlarining yangi variantlarini shu chatda yozing.' },
  },
  ru: {
    general: { title: 'Продолжим вашу задачу?', line: 'Три пробных ответа использованы. Подключите пакет и продолжите в этом же чате.' },
    translator: { title: 'Продолжим перевод?', line: 'Три пробных ответа использованы. С AI-пакетом переводите письма, объявления и сообщения в этом же чате.' },
    teacher: { title: 'Продолжим разбираться?', line: 'Три пробных ответа использованы. С AI-пакетом разбирайте темы и задачи по шагам в этом же чате.' },
    smm: { title: 'Продолжим рекламные тексты?', line: 'Три пробных ответа использованы. С AI-пакетом пишите посты, объявления и рекламные тексты в этом же чате.' },
    marketer: { title: 'Продолжим маркетинг?', line: 'Три пробных ответа использованы. С AI-пакетом работайте над оффером, контент-планом и идеями в этом же чате.' },
    business: { title: 'Продолжим бизнес-задачу?', line: 'Три пробных ответа использованы. С AI-пакетом готовьте ответы клиентам, скрипты и планы в этом же чате.' },
    writer: { title: 'Нужны ещё варианты?', line: 'Три пробных ответа использованы. С AI-пакетом пишите новые варианты поздравлений, стихов и подписей в этом же чате.' },
  },
};

const PROVIDER_NAMES: Record<PaymentProvider, string> = { click: 'Click', payme: 'Payme', uzum: 'Uzum Bank' };

export interface TrialCopy {
  eyebrow: string;
  title: string;
  line: string;
  /** The pack's name above its facts. */
  pack: string;
  /** Answers, period, daily cap and no auto-renewal: the server's terms, one line. */
  facts: string;
  /** A provider's button: its name and the sum, the same for every provider (nothing is preselected). */
  pay: (provider: PaymentProvider) => string;
  fine: string;
  acceptBefore: string;
  acceptLink: string;
  /** Opens the pack window, where a bought pack is found (sign-in or this browser). */
  havePack: string;
  later: string;
  close: string;
  /** Ш7: one trial answer left. */
  lastTitle: string;
  lastFacts: string;
  survey: { title: string; answers: Record<ExitReason, string>; thanks: string; close: string };
}

export function sum(locale: Locale, priceUzs: number): string {
  return `${new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'uz-UZ').format(priceUzs)} ${locale === 'ru' ? 'сум' : 'so‘m'}`;
}

export function trialCopy(locale: Locale, role: PaywallRole, pack: PackTerms): TrialCopy {
  const { title, line } = ROLE_COPY[locale][role] ?? ROLE_COPY[locale].general;
  const price = sum(locale, pack.priceUzs);
  if (locale === 'ru') return {
    eyebrow: 'Вы уже попробовали AI',
    title,
    line,
    pack: 'AI-пакет',
    facts: `${pack.messageLimit} ответов · ${pack.months} календ. мес. · до ${pack.dailyLimit} в день · без автосписаний`,
    pay: (provider) => `${PROVIDER_NAMES[provider]} · ${price}`,
    fine: 'Разовая покупка. Переписка сохранится. Презентации — отдельные пакеты.',
    acceptBefore: 'Оплачивая, принимаете ',
    acceptLink: 'оферту',
    havePack: 'У меня есть пакет',
    later: 'Пока посмотреть переписку',
    close: 'Закрыть и читать переписку',
    lastTitle: 'Остался 1 пробный ответ',
    lastFacts: `AI-пакет: ${pack.messageLimit} ответов · ${pack.months} календ. мес. · до ${pack.dailyLimit} в день`,
    survey: {
      title: 'Почему не сейчас?',
      answers: { price: 'Дорого', once: 'Нужно было один раз', no_card: 'Нет карты', later: 'Позже' },
      thanks: 'Спасибо, ответ учтён.',
      close: 'Закрыть вопрос',
    },
  };
  return {
    eyebrow: 'AI bilan tanishdingiz',
    title,
    line,
    pack: 'AI paket',
    facts: `${pack.messageLimit} ta javob · ${pack.months} kalendar oy · kuniga ${pack.dailyLimit} tagacha · avtomatik yechib olinmaydi`,
    pay: (provider) => `${PROVIDER_NAMES[provider]} · ${price}`,
    fine: 'Bir martalik xarid. Suhbat saqlanadi. Taqdimotlar uchun alohida paketlar.',
    acceptBefore: 'To‘lab, qabul qilasiz: ',
    acceptLink: 'oferta',
    havePack: 'Paketim bor',
    later: 'Hozircha suhbatni ko‘rish',
    close: 'Yopish va suhbatni o‘qish',
    lastTitle: '1 ta sinov javobi qoldi',
    lastFacts: `AI paket: ${pack.messageLimit} ta javob · ${pack.months} kalendar oy · kuniga ${pack.dailyLimit} tagacha`,
    survey: {
      title: 'Nega hozir emas?',
      answers: { price: 'Qimmat', once: 'Faqat bir marta kerak edi', no_card: 'Karta yo‘q', later: 'Keyinroq' },
      thanks: 'Rahmat, javobingiz hisobga olindi.',
      close: 'Savolni yopish',
    },
  };
}
