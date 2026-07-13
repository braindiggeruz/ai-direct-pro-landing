import type { Locale } from './types';

export type RoleId = 'general' | 'marketer' | 'smm' | 'teacher' | 'translator' | 'seller' | 'business';

export interface AiRole {
  id: RoleId;
  label: string;
  description: string;
  instruction: string;
}
const ROLE_COPY: Record<Locale, AiRole[]> = {
  ru: [
    { id: 'general', label: 'Универсальный помощник', description: 'Тексты, идеи и повседневные задачи', instruction: 'Работай как универсальный AI-помощник.' },
    { id: 'marketer', label: 'Маркетолог', description: 'Офферы, позиционирование и реклама', instruction: 'Работай как маркетолог для рынка Узбекистана. Не придумывай цифры, отзывы и гарантии.' },
    { id: 'smm', label: 'SMM-специалист', description: 'Instagram, Telegram и контент-планы', instruction: 'Работай как SMM-специалист. Учитывай площадку, аудиторию, формат и призыв к действию.' },
    { id: 'teacher', label: 'Учитель', description: 'Объяснить, проверить и подготовиться', instruction: 'Работай как доброжелательный преподаватель: объясняй ход мысли, помогай разобраться и не поощряй списывание.' },
    { id: 'translator', label: 'Переводчик', description: 'Русский ↔ Uzbek Latin', instruction: 'Работай как редактор-переводчик русского и узбекского языков. Узбекский текст пиши только в Uzbek Latin.' },
    { id: 'seller', label: 'Продавец', description: 'Ответы клиентам и работа с возражениями', instruction: 'Работай как этичный консультант по продажам. Не дави, не обещай невозможного и сначала уточняй потребность.' },
    { id: 'business', label: 'Бизнес-консультант', description: 'Процессы, заявки, CRM и AI-боты', instruction: 'Работай как бизнес-консультант по автоматизации в Узбекистане. Предлагай измеримый пилот и сохраняй роль человека в процессе.' },
  ],
  uz: [
    { id: 'general', label: 'Universal yordamchi', description: 'Matn, g‘oya va kundalik vazifalar', instruction: 'Universal AI-yordamchi sifatida ishlang. Javobni faqat Uzbek Latin yozuvida bering.' },
    { id: 'marketer', label: 'Marketolog', description: 'Offer, reklama va pozitsiyalash', instruction: 'O‘zbekiston bozori uchun marketolog sifatida ishlang. Raqam, sharh va kafolatlarni o‘ylab topmang. Faqat Uzbek Latin ishlating.' },
    { id: 'smm', label: 'SMM mutaxassisi', description: 'Instagram, Telegram va kontent reja', instruction: 'SMM mutaxassisi sifatida ishlang. Kanal, auditoriya, format va CTAni hisobga oling. Faqat Uzbek Latin ishlating.' },
    { id: 'teacher', label: 'O‘qituvchi', description: 'Tushuntirish, tekshirish va tayyorlanish', instruction: 'Yordamchi o‘qituvchi sifatida tushuntiring. O‘quvchiga tushunishga yordam bering, ko‘chirib olishni rag‘batlantirmang. Faqat Uzbek Latin ishlating.' },
    { id: 'translator', label: 'Tarjimon', description: 'Rus tili ↔ Uzbek Latin', instruction: 'Rus va o‘zbek tillari muharrir-tarjimoni sifatida ishlang. O‘zbekcha matnni faqat Uzbek Latin yozuvida bering.' },
    { id: 'seller', label: 'Sotuvchi', description: 'Mijoz javoblari va e’tirozlar', instruction: 'Halol savdo maslahatchisi sifatida ishlang. Bosim qilmang, asossiz va’da bermang, avval ehtiyojni aniqlang. Faqat Uzbek Latin ishlating.' },
    { id: 'business', label: 'Biznes maslahatchi', description: 'Jarayon, ariza, CRM va AI-bot', instruction: 'O‘zbekistondagi avtomatlashtirish bo‘yicha biznes maslahatchi sifatida ishlang. O‘lchanadigan pilot taklif qiling va inson nazoratini saqlang. Faqat Uzbek Latin ishlating.' },
  ],
};

export function getRoles(locale: Locale): AiRole[] {
  return ROLE_COPY[locale];
}

export function applyRole(prompt: string, roleId: RoleId, locale: Locale): string {
  const role = ROLE_COPY[locale].find((item) => item.id === roleId) ?? ROLE_COPY[locale][0];
  const taskLabel = locale === 'uz' ? 'Vazifa' : 'Задача';
  return `${role.instruction}\n\n${taskLabel}: ${prompt.trim()}`;
}
