// The AI roles as the menu's picker names them (RoleSelector): the label and
// the line under it, in both languages. Only the picker shows them, so they
// travel in its lazy part (chat-role), not on the chat's start bundle; what a
// role tells the model stays in roles.ts, which every question needs.
import { roleInstructions, type RoleId } from './roles';
import type { Locale } from './types';

export interface AiRole {
  id: RoleId;
  label: string;
  description: string;
  instruction: string;
}

/** [label, description] per role: the type makes a new role in roles.ts name itself here. */
const ROLE_LABELS: Record<Locale, Record<RoleId, readonly [label: string, description: string]>> = {
  ru: {
    general: ['Универсальный помощник', 'Тексты, идеи и повседневные задачи'],
    marketer: ['Маркетолог', 'Офферы, позиционирование и реклама'],
    smm: ['SMM-специалист', 'Instagram, Telegram и контент-планы'],
    teacher: ['Учитель', 'Объяснить, проверить и подготовиться'],
    translator: ['Переводчик', 'Русский ↔ Uzbek Latin'],
    seller: ['Продавец', 'Ответы клиентам и работа с возражениями'],
    business: ['Бизнес-консультант', 'Процессы, заявки, CRM и AI-боты'],
    writer: ['Автор текстов', 'Стихи, поздравления, подписи'],
  },
  uz: {
    general: ['Universal yordamchi', 'Matn, g‘oya va kundalik vazifalar'],
    marketer: ['Marketolog', 'Offer, reklama va pozitsiyalash'],
    smm: ['SMM mutaxassisi', 'Instagram, Telegram va kontent reja'],
    teacher: ['O‘qituvchi', 'Tushuntirish, tekshirish va tayyorlanish'],
    translator: ['Tarjimon', 'Rus tili ↔ Uzbek Latin'],
    seller: ['Sotuvchi', 'Mijoz javoblari va e’tirozlar'],
    business: ['Biznes maslahatchi', 'Jarayon, ariza, CRM va AI-bot'],
    writer: ['Ijodkor', 'She’r, tabrik va matnlar'],
  },
};

const cache: Partial<Record<Locale, AiRole[]>> = {};

/** The roles in the picker's order, named, with what each tells the model. */
export function getRoles(locale: Locale): AiRole[] {
  return (cache[locale] ??= roleInstructions(locale).map((role) => {
    const [label, description] = ROLE_LABELS[locale][role.id];
    return { ...role, label, description };
  }));
}
