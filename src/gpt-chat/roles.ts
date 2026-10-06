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
    { id: 'translator', label: 'Переводчик', description: 'Русский ↔ Uzbek Latin', instruction: 'Работай как редактор-переводчик русского и узбекского языков. Русский текст переводи на узбекский (только латиницей), узбекский — на русский; если в задаче сказано иначе — следуй задаче.' },
    { id: 'seller', label: 'Продавец', description: 'Ответы клиентам и работа с возражениями', instruction: 'Работай как этичный консультант по продажам. Не дави, не обещай невозможного и сначала уточняй потребность.' },
    { id: 'business', label: 'Бизнес-консультант', description: 'Процессы, заявки, CRM и AI-боты', instruction: 'Работай как бизнес-консультант по автоматизации в Узбекистане. Предлагай измеримый пилот и сохраняй роль человека в процессе.' },
  ],
  uz: [
    { id: 'general', label: 'Universal yordamchi', description: 'Matn, g‘oya va kundalik vazifalar', instruction: 'Universal AI-yordamchi sifatida ishlang.' },
    { id: 'marketer', label: 'Marketolog', description: 'Offer, reklama va pozitsiyalash', instruction: 'O‘zbekiston bozori uchun marketolog sifatida ishlang. Raqam, sharh va kafolatlarni o‘ylab topmang.' },
    { id: 'smm', label: 'SMM mutaxassisi', description: 'Instagram, Telegram va kontent reja', instruction: 'SMM mutaxassisi sifatida ishlang. Kanal, auditoriya, format va CTAni hisobga oling.' },
    { id: 'teacher', label: 'O‘qituvchi', description: 'Tushuntirish, tekshirish va tayyorlanish', instruction: 'Yordamchi o‘qituvchi sifatida tushuntiring. O‘quvchiga tushunishga yordam bering, ko‘chirib olishni rag‘batlantirmang.' },
    { id: 'translator', label: 'Tarjimon', description: 'Rus tili ↔ Uzbek Latin', instruction: 'Rus va o‘zbek tillari muharrir-tarjimoni sifatida ishlang. Ruscha matnni o‘zbek tiliga (faqat lotin yozuvida), o‘zbekcha matnni rus tiliga tarjima qiling; vazifada boshqacha ko‘rsatilgan bo‘lsa, shunga amal qiling.' },
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

/**
 * What reaches the model: the role, the language rule and the task. No
 * language rule for a translation: a translate button names its language,
 * and the translator's role says which way to go («answer in the language
 * of the question» would undo it).
 */
export function applyRole(prompt: string, roleId: RoleId, locale: Locale, opts: { guard?: boolean } = {}): string {
  const role = ROLE_COPY[locale].find((item) => item.id === roleId) ?? ROLE_COPY[locale][0];
  const taskLabel = locale === 'uz' ? 'Vazifa' : 'Задача';
  const guard = opts.guard === false ? '' : `\n${LANGUAGE_GUARD[locale]}`;
  return `${role.instruction}${guard}\n\n${taskLabel}: ${prompt.trim()}`;
}

const CYRILLIC = /[А-Яа-яЁёЎўҚқҒғҲҳ]/g;
const LATIN = /[A-Za-z]/g;
/** Words in Cyrillic script, two letters or more. */
const CYRILLIC_WORD = /[А-Яа-яЁёЎўҚқҒғҲҳ]{2,}/g;
/** Letters only Uzbek writes in Cyrillic script. */
const UZ_CYRILLIC = /[ЎўҚқҒғҲҳ]/;
/** Common Uzbek words in Cyrillic script that need none of those letters. */
const UZ_CYRILLIC_WORDS = /(^|[^а-яё])(менга|учун|нима|билан|керак|беринг|ёрдам|салом|ёзинг|ёзиб|ҳақида|бўйича)(?=$|[^а-яё])/i;
/**
 * o‘ or g‘ inside a word, any apostrophe, before two small letters. Not
 * o'clock (Uzbek writes c only in ch: o‘chir stays), O'Brien or dog's.
 */
const UZ_APOSTROPHE = /[OoGg][‘'ʻ’`](?!c[^h])(?=[a-z]{2})/;
/**
 * q as Uzbek writes it: before a, e, i or o at the start of a word (Qanday),
 * before any small letter but u inside one (maqsad, olmoqchi). Not QA, FAQ,
 * SQL, unique or request; Qatar, Iraqi and Qaeda are taken out first.
 */
const UZ_Q = /(^|[^A-Za-z])[Qq][aeio]|[a-z]q[a-tv-z]/;
const NOT_UZ_Q = /(Qatar|Iraq|Qaeda)[a-z]*/gi;
/** Common Uzbek words; an all-capitals word (VA, EMAS) is an abbreviation. */
const UZ_WORDS = new Set('va uchun nima qanday qaysi menga mening bilan haqida kerak kerakmi bering yozing yozib yoz ber tuzib tuz qil qilib qiling yordam salom mumkin emas nega qachon qanaqa'.split(' '));

/** Uzbek in Latin script: one of the marks above. */
function uzbekLatin(question: string): boolean {
  return UZ_APOSTROPHE.test(question)
    || UZ_Q.test(question.replace(NOT_UZ_Q, ''))
    || (question.match(/[A-Za-z]+/g) ?? []).some((word) => word !== word.toUpperCase() && UZ_WORDS.has(word.toLowerCase()));
}

/**
 * Which language the lines around a question are written in: the
 * question's, when its letters say so clearly, else the page's. The same
 * question with a frame in the other language came back half in that
 * language (a live check on 06.10: a Russian question on the Uzbek page got
 * an Uzbek lead-in and a Russian example), since those lines outweigh a
 * short question. Cyrillic is Russian unless it is Uzbek Cyrillic (then the
 * Uzbek frame asks for Latin script). Two Cyrillic words make a Cyrillic
 * question however much code or English is around them (SQL, Python), unless
 * its Latin part is marked Uzbek. Latin is Uzbek only with Uzbek marks, so
 * an English question keeps the page's frame.
 */
export function frameLocale(question: string, page: Locale): Locale {
  const cyrillic = (question.match(CYRILLIC) ?? []).length;
  const latin = (question.match(LATIN) ?? []).length;
  const uzLatin = latin >= 3 && uzbekLatin(question);
  if ((cyrillic >= 3 && cyrillic > latin) || ((question.match(CYRILLIC_WORD) ?? []).length >= 2 && !uzLatin))
    return UZ_CYRILLIC.test(question) || UZ_CYRILLIC_WORDS.test(question) ? 'uz' : 'ru';
  if (uzLatin && latin > cyrillic) return 'uz';
  return page;
}

/** What applyRole adds around a typed question (the translator's has no language rule): the composer's limit is the server's less this. */
export function rolePrefixLength(roleId: RoleId, locale: Locale): number {
  return applyRole('', roleId, locale, { guard: roleId !== 'translator' }).length;
}

/** The longer of the two: a question may get either language's lines (frameLocale). */
export function maxRolePrefixLength(roleId: RoleId): number {
  return Math.max(rolePrefixLength(roleId, 'uz'), rolePrefixLength(roleId, 'ru'));
}
