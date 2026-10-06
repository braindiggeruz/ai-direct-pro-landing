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
    { id: 'general', label: 'Universal yordamchi', description: 'Matn, g‘oya va kundalik vazifalar', instruction: 'Universal AI-yordamchi sifatida ishlang.' },
    { id: 'marketer', label: 'Marketolog', description: 'Offer, reklama va pozitsiyalash', instruction: 'O‘zbekiston bozori uchun marketolog sifatida ishlang. Raqam, sharh va kafolatlarni o‘ylab topmang.' },
    { id: 'smm', label: 'SMM mutaxassisi', description: 'Instagram, Telegram va kontent reja', instruction: 'SMM mutaxassisi sifatida ishlang. Kanal, auditoriya, format va CTAni hisobga oling.' },
    { id: 'teacher', label: 'O‘qituvchi', description: 'Tushuntirish, tekshirish va tayyorlanish', instruction: 'Yordamchi o‘qituvchi sifatida tushuntiring. O‘quvchiga tushunishga yordam bering, ko‘chirib olishni rag‘batlantirmang.' },
    { id: 'translator', label: 'Tarjimon', description: 'Rus tili ↔ Uzbek Latin', instruction: 'Rus va o‘zbek tillari muharrir-tarjimoni sifatida ishlang. O‘zbekcha matnni faqat Uzbek Latin yozuvida bering.' },
    { id: 'seller', label: 'Sotuvchi', description: 'Mijoz javoblari va e’tirozlar', instruction: 'Halol savdo maslahatchisi sifatida ishlang. Bosim qilmang, asossiz va’da bermang, avval ehtiyojni aniqlang.' },
    { id: 'business', label: 'Biznes maslahatchi', description: 'Jarayon, ariza, CRM va AI-bot', instruction: 'O‘zbekistondagi avtomatlashtirish bo‘yicha biznes maslahatchi sifatida ishlang. O‘lchanadigan pilot taklif qiling va inson nazoratini saqlang.' },
  ],
};

export function getRoles(locale: Locale): AiRole[] {
  return ROLE_COPY[locale];
}

/**
 * The answer's language follows the question, not the page: about one first
 * message in seven is in the other language, and the Russian page promises
 * an answer in the language of the question. The page's language decides
 * only when the question's is unclear. Formulas come as plain text, which
 * the chat can show (plan LANG-01, MD-03).
 */
const LANGUAGE_GUARD: Record<Locale, string> = {
  uz: 'Savol qaysi tilda yozilgan bo‘lsa, javobni shu tilda bering; o‘zbekcha javobni faqat lotin yozuvida yozing. Til aniq bo‘lmasa, o‘zbekcha (lotin) javob bering. Formulalarni LaTeX belgilarisiz, oddiy matnda yozing: x², √x, a/b, ×. Inglizcha so‘zlarni faqat API, CRM, SMM kabi odatiy atamalar uchun ishlating.',
  ru: 'Отвечай на языке вопроса; по-узбекски — только латиницей. Если язык неясен — отвечай по-русски. Формулы пиши без LaTeX, обычным текстом: x², √x, a/b, ×. Не смешивай русский с английским, кроме привычных терминов вроде API, CRM и SMM.',
};

/** What reaches the model: the role, the language rule (not for a translation, which names its own language) and the task. */
export function applyRole(prompt: string, roleId: RoleId, locale: Locale, opts: { guard?: boolean } = {}): string {
  const role = ROLE_COPY[locale].find((item) => item.id === roleId) ?? ROLE_COPY[locale][0];
  const taskLabel = locale === 'uz' ? 'Vazifa' : 'Задача';
  const guard = opts.guard === false ? '' : `\n${LANGUAGE_GUARD[locale]}`;
  return `${role.instruction}${guard}\n\n${taskLabel}: ${prompt.trim()}`;
}

const CYRILLIC = /[А-Яа-яЁёЎўҚқҒғҲҳ]/g;
const LATIN = /[A-Za-z]/g;
/** Letters only Uzbek writes in Cyrillic script. */
const UZ_CYRILLIC = /[ЎўҚқҒғҲҳ]/;
/** Common Uzbek words in Cyrillic script that need none of those letters. */
const UZ_CYRILLIC_WORDS = /(^|[^а-яё])(менга|учун|нима|билан|керак|беринг|ёрдам|салом|ёзинг|ёзиб|ҳақида|бўйича)(?=$|[^а-яё])/i;
/**
 * Uzbek in Latin script: o‘ or g‘ (any apostrophe) inside a word, q before
 * a, e, i or o, or a common word. An English possessive (dog's) or an
 * acronym (SQL, FAQ) is not a mark.
 */
const UZ_LATIN = /[og][‘'ʻ’`](?=[a-z]{2})|q(?=[aeio])|(^|[^a-z])(va|uchun|nima|qanday|menga|bilan|haqida|kerak|bering|yozing|yordam|salom)(?=$|[^a-z])/i;

/**
 * Which language the lines around a question are written in: the
 * question's, when its letters say so clearly, else the page's. The same
 * question with a frame in the other language came back half in that
 * language (a live check on 06.10: a Russian question on the Uzbek page got
 * an Uzbek lead-in and a Russian example), since those lines outweigh a
 * short question. Cyrillic is Russian unless it is Uzbek Cyrillic (then the
 * Uzbek frame asks for Latin script); Latin is Uzbek only with Uzbek marks,
 * so an English question keeps the page's frame.
 */
export function frameLocale(question: string, page: Locale): Locale {
  const cyrillic = (question.match(CYRILLIC) ?? []).length;
  const latin = (question.match(LATIN) ?? []).length;
  if (cyrillic >= 3 && cyrillic > latin)
    return UZ_CYRILLIC.test(question) || UZ_CYRILLIC_WORDS.test(question) ? 'uz' : 'ru';
  if (latin >= 3 && latin > cyrillic && UZ_LATIN.test(question)) return 'uz';
  return page;
}

/** What applyRole adds around a question: the composer's limit is the server's less this. */
export function rolePrefixLength(roleId: RoleId, locale: Locale): number {
  return applyRole('', roleId, locale).length;
}

/** The longer of the two: a question may get either language's lines (frameLocale). */
export function maxRolePrefixLength(roleId: RoleId): number {
  return Math.max(rolePrefixLength(roleId, 'uz'), rolePrefixLength(roleId, 'ru'));
}
