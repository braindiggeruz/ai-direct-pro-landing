// RU / Uzbek-Latin copy + inline keyboards for the Telegram assistant.
// Keyboards embed only an action tag + short item id in callback_data —
// never the source text (ownership is verified server-side by item id).
//
// Telegram allows digital goods inside a bot only for Stars, so the bot names
// no price, no paid plan and links to no payment or pricing page (decision
// D11, tested): its limits are free and say when they come back.
import type { FreeAllowance } from './billing';
import type { InlineKeyboard } from './client';
import type { Locale, TgAction } from './store';

export const START: Record<Locale, string> = {
  ru: 'GPTBot Javob превращает текст и голосовые в готовый ответ.\n\nПерешлите сообщение или голосовое из любого Telegram-чата — я покажу расшифровку и подготовлю ответ в нужном тоне и на нужном языке. Для голосового можно открыть Tahlil: утверждения, противоречия и вопросы для проверки. Это не детектор лжи.\n\nПоддерживаются русский и Uzbek Latin. Аудио не хранится.\n\nПопробуйте прямо сейчас ↓',
  uz: 'GPTBot Javob matn va ovozli xabarni tayyor javobga aylantiradi.\n\nIstalgan Telegram chatidan xabar yoki ovozli xabar yuboring — transkript va kerakli ohangdagi javobni tayyorlayman. Ovozli xabar uchun Tahlil bayonotlar, qarama-qarshiliklar va tekshirish savollarini ko‘rsatadi. Bu yolg‘on detektori emas.\n\nRus tili va Uzbek Latin qo‘llab-quvvatlanadi. Audio saqlanmaydi.\n\nHoziroq sinab ko‘ring ↓',
};

export const CHOOSE_LANG: Record<Locale, string> = {
  ru: 'Выберите язык интерфейса:',
  uz: 'Interfeys tilini tanlang:',
};

export const LANG_SET: Record<Locale, string> = {
  ru: 'Готово. Язык интерфейса — русский. Перешлите текст или голосовое.',
  uz: 'Tayyor. Interfeys tili — o‘zbek. Matn yoki ovozli xabar yuboring.',
};

export const ASK_ACTION: Record<Locale, string> = {
  ru: 'Что сделать с этим сообщением?',
  uz: 'Bu xabar bilan nima qilamiz?',
};

export const CHOOSE_TRANSLATE: Record<Locale, string> = {
  ru: 'На какой язык перевести?',
  uz: 'Qaysi tilga tarjima qilamiz?',
};

export const THINKING: Record<Locale, string> = {
  ru: 'Готовлю…',
  uz: 'Tayyorlayapman…',
};

export const ERR_PROVIDER: Record<Locale, string> = {
  ru: 'Сейчас не удалось подготовить результат. Попробуйте ещё раз.',
  uz: 'Hozir natijani tayyorlab bo‘lmadi. Qayta urinib ko‘ring.',
};

export const ERR_STALE: Record<Locale, string> = {
  ru: 'Эта кнопка уже устарела. Перешлите сообщение ещё раз.',
  uz: 'Bu tugma eskirgan. Xabarni qayta yuboring.',
};

export const ERR_TOO_LONG: Record<Locale, (max: number) => string> = {
  ru: (max) => `Текст слишком длинный (лимит ${max} символов). Отправьте его частями.`,
  uz: (max) => `Matn juda uzun (limit ${max} belgi). Uni qismlarga bo‘lib yuboring.`,
};

export const VOICE_TOO_SHORT: Record<Locale, (min: number) => string> = {
  ru: (min) => `Голосовое слишком короткое. Отправьте запись длительностью от ${min} секунд.`,
  uz: (min) => `Ovozli xabar juda qisqa. Kamida ${min} soniyalik yozuv yuboring.`,
};

export const VOICE_TOO_LONG: Record<Locale, string> = {
  ru: 'Пока можно отправлять голосовые длительностью до 5 минут.',
  uz: 'Hozircha 5 daqiqagacha bo‘lgan ovozli xabarlarni yuborish mumkin.',
};

export const VOICE_TOO_LARGE: Record<Locale, string> = {
  ru: 'Аудиофайл слишком большой. Лимит Telegram для бота — 20 МБ.',
  uz: 'Audiofayl juda katta. Telegram bot limiti — 20 MB.',
};

export const VOICE_UNAVAILABLE: Record<Locale, string> = {
  ru: 'Сейчас не удалось обработать голосовое. Попробуйте ещё раз или отправьте текст.',
  uz: 'Hozir ovozli xabarni qayta ishlab bo‘lmadi. Qayta urinib ko‘ring yoki matn yuboring.',
};

export const VOICE_UNCLEAR: Record<Locale, string> = {
  ru: 'Не удалось разобрать речь. Попробуйте запись без шума или отправьте текст.',
  uz: 'Nutqni aniqlab bo‘lmadi. Shovqinsiz yozuv yoki matn yuboring.',
};

export function formatVoiceDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function voiceProcessing(locale: Locale, seconds: number): string {
  const label = locale === 'ru' ? 'Слушаю…' : 'Eshitayapman…';
  return `🎧 ${label} (${formatVoiceDuration(seconds)})`;
}

export function voiceTranscript(locale: Locale, seconds: number, transcript: string): string {
  const title = locale === 'ru' ? 'Расшифровка' : 'Transkript';
  return `📝 ${title} (${formatVoiceDuration(seconds)})\n\n${transcript}`;
}

export const RECOMMENDED_REPLY: Record<Locale, string> = {
  ru: '💬 Рекомендуемый ответ:',
  uz: '💬 Tavsiya etilgan javob:',
};

const LIMIT_REACHED_DAY: Record<Locale, string> = {
  ru: 'Бесплатные ответы на сегодня закончились. Лимит обновится в 00:00 по Ташкенту.',
  uz: 'Bugungi bepul javoblar tugadi. Limit Toshkent vaqti bilan soat 00:00 da yangilanadi.',
};

const LIMIT_REACHED_MONTH: Record<Locale, string> = {
  ru: 'Бесплатные ответы в этом месяце закончились. Лимит обновится 1-го числа в 00:00 по Ташкенту.',
  uz: 'Bu oy uchun bepul javoblar tugadi. Limit keyingi oyning 1-kuni Toshkent vaqti bilan soat 00:00 da yangilanadi.',
};

/** The free replies are spent: when they come back, and nothing to buy. */
export function limitReached(locale: Locale, reason: 'daily' | 'period' | undefined): string {
  return (reason === 'daily' ? LIMIT_REACHED_DAY : LIMIT_REACHED_MONTH)[locale];
}

export const HELP: Record<Locale, string> = {
  ru: 'GPTBot Javob — готовый ответ на любое сообщение.\n\nПерешлите текст или голосовое — я подготовлю ответ. Кнопками можно сделать его короче, мягче, увереннее или сменить язык RU/UZ. Под голосовым есть «Анализ содержания»: он выделяет проверяемые утверждения, внутренние противоречия и вопросы, но не определяет ложь.\n\nКоманды:\n/new — новый запрос\n/lang — язык\n/plans — лимит\n/privacy — конфиденциальность\n/delete_me — удалить мои данные',
  uz: 'GPTBot Javob — istalgan xabarga tayyor javob.\n\nMatn yoki ovozli xabar yuboring — javob tayyorlayman. Tugmalar orqali uni qisqartirish, yumshatish, ishonchliroq qilish yoki RU/UZ tilini almashtirish mumkin. Ovozli xabar ostidagi «Mazmun tahlili» bayonotlar, ichki qarama-qarshiliklar va savollarni ko‘rsatadi, lekin yolg‘onni aniqlamaydi.\n\nBuyruqlar:\n/new — yangi so‘rov\n/lang — til\n/plans — limit\n/privacy — maxfiylik\n/delete_me — ma’lumotlarimni o‘chirish',
};

const PRIVACY_BASE: Record<Locale, string> = {
  ru: 'GPTBot видит только сообщения, которые вы сами отправили или переслали боту. Бот не получает доступ к остальным чатам Telegram.\n\nПересланный текст временно хранится (около суток) для обработки и повторных действий, затем очищается. Не отправляйте данные, на обработку которых у вас нет права.\n\nКоманда /delete_me удаляет ваши данные.',
  uz: 'GPTBot faqat siz yuborgan yoki unga uzatgan xabarlarni ko‘radi. Bot boshqa Telegram chatlaringizga kira olmaydi.\n\nUzatilgan matn qayta ishlash va takroriy amallar uchun vaqtincha (taxminan bir kun) saqlanadi, so‘ng o‘chiriladi. O‘zingizda huquqi bo‘lmagan ma’lumotlarni yubormang.\n\n/delete_me buyrug‘i ma’lumotlaringizni o‘chiradi.',
};

export const PRIVACY: Record<Locale, string> = {
  ru: `${PRIVACY_BASE.ru}\n\nГолосовые и аудиофайлы обрабатываются только в памяти и не сохраняются. Расшифровка, таймкоды и отчёт Tahlil хранятся около суток и могут быть удалены кнопкой в отчёте.`,
  uz: `${PRIVACY_BASE.uz}\n\nOvozli xabar va audiofayl faqat xotirada qayta ishlanadi va saqlanmaydi. Transkript, taymkod va Tahlil hisoboti taxminan bir kun saqlanadi hamda hisobot tugmasi orqali o‘chirilishi mumkin.`,
};

export const DELETED: Record<Locale, string> = {
  ru: 'Ваши данные удалены. Можете начать заново в любой момент — просто перешлите сообщение.',
  uz: 'Ma’lumotlaringiz o‘chirildi. Istalgan vaqtda qaytadan boshlashingiz mumkin — shunchaki xabar yuboring.',
};

export const GROUP_NOTICE: Record<Locale, string> = {
  ru: 'В MVP GPTBot работает в личном чате. Напишите боту напрямую.',
  uz: 'MVP’da GPTBot shaxsiy chatda ishlaydi. Botga to‘g‘ridan-to‘g‘ri yozing.',
};

/**
 * First message after `/start w_…` — a claimed handoff from the web chat.
 *
 * Three jobs, in order: say this is the same conversation continuing, so the
 * tap did what it promised; say what is actually different here (the bot has
 * its own separate daily allowance — separate, NOT unlimited); and say plainly
 * that the site conversation itself was not carried over, so nobody waits for
 * the bot to "remember" something it was never given.
 *
 * It names nothing the person did not say here: no page, no session, no
 * transcript. The payload is public, so a greeting that quoted stored context
 * would hand it to whoever typed the link.
 */
export const HANDOFF_WELCOME: Record<Locale, string> = {
  ru: 'Продолжаем разговор с сайта gptbot.uz.\n\nЗдесь, в Telegram, у бота свой отдельный дневной лимит — так что можно продолжить прямо сейчас, не дожидаясь, пока обновится лимит на сайте.\n\nПереписку с сайта я сюда не переношу. Напишите вопрос своими словами или перешлите любое сообщение — подготовлю ответ. Голосовые тоже понимаю.',
  uz: 'gptbot.uz saytidagi suhbatni davom ettiramiz.\n\nTelegramda botning alohida kunlik limiti bor — shuning uchun saytdagi limit yangilanishini kutmasdan, hoziroq davom ettirish mumkin.\n\nSaytdagi yozishmalarni bu yerga ko‘chirmayman. Savolingizni o‘z so‘zlaringiz bilan yozing yoki istalgan xabarni yuboring — javob tayyorlayman. Ovozli xabarlarni ham tushunaman.',
};

/**
 * First message after `/start site_ru|site_uz` — the public, contextless link
 * the website's chat uses whenever a session-carrying handoff was not minted.
 *
 * Sent in the SITE's language (the payload says which page the tap came
 * from), not the Telegram client's. It says where the person came from and
 * what is different here — the bot's own daily allowance, separate but not
 * unlimited — and it does NOT say the web conversation was carried over,
 * because on this link it never is.
 */
export const SITE_WELCOME: Record<Locale, string> = {
  ru: 'Вы пришли с сайта gptbot.uz.\n\nЗдесь, в Telegram, у бота свой отдельный дневной лимит — можно продолжать прямо сейчас.\n\nНапишите вопрос своими словами или перешлите любое сообщение — подготовлю ответ. Голосовые тоже понимаю.',
  uz: 'Siz gptbot.uz saytidan keldingiz.\n\nTelegramda botning alohida kunlik limiti bor — hoziroq davom ettirishingiz mumkin.\n\nSavolingizni o‘z so‘zlaringiz bilan yozing yoki istalgan xabarni yuboring — javob tayyorlayman. Ovozli xabarlarni ham tushunaman.',
};

const ACTION_LABELS: Record<Locale, Record<TgAction, string>> = {
  ru: { reply: 'Подготовить ответ', explain: 'Объяснить', summarize: 'Кратко', translate: 'Перевести' },
  uz: { reply: 'Javob tayyorlash', explain: 'Tushuntirish', summarize: 'Qisqartirish', translate: 'Tarjima' },
};

export function langKeyboard(): InlineKeyboard {
  return [[{ text: 'Русский', callback_data: 'lang:ru' }, { text: 'Uzbek Latin', callback_data: 'lang:uz' }]];
}

export function actionKeyboard(locale: Locale, itemId: string): InlineKeyboard {
  const L = ACTION_LABELS[locale];
  return [
    [{ text: L.reply, callback_data: `act:reply:${itemId}` }, { text: L.explain, callback_data: `act:explain:${itemId}` }],
    [{ text: L.summarize, callback_data: `act:summarize:${itemId}` }, { text: L.translate, callback_data: `act:translate:${itemId}` }],
  ];
}

export function translateTargetKeyboard(locale: Locale, itemId: string): InlineKeyboard {
  const ru = locale === 'ru' ? 'На русский' : 'Rus tiliga';
  const uz = locale === 'ru' ? 'Uzbek Latin' : 'Uzbek Latin';
  return [[{ text: ru, callback_data: `tr:ru:${itemId}` }, { text: uz, callback_data: `tr:uz:${itemId}` }]];
}

/**
 * Javob result keyboard — max 5 actions. The language button adapts the reply
 * to the OTHER language relative to the current output.
 */
export function resultKeyboard(locale: Locale, itemId: string, outputLanguage: 'ru' | 'uz' | 'other', withShare: boolean): InlineKeyboard {
  const L = locale === 'ru'
    ? { shorter: 'Короче', softer: 'Мягче', confident: 'Увереннее', alt: 'Другой' }
    : { shorter: 'Qisqaroq', softer: 'Yumshoqroq', confident: 'Ishonchliroq', alt: 'Boshqacha' };
  const langBtn = outputLanguage === 'uz'
    ? { text: 'RU', callback_data: `jmod:to_ru:${itemId}` }
    : { text: 'UZ', callback_data: `jmod:to_uz:${itemId}` };
  const rows: InlineKeyboard = [
    [{ text: L.shorter, callback_data: `jmod:shorter:${itemId}` }, { text: L.softer, callback_data: `jmod:softer:${itemId}` }, { text: L.confident, callback_data: `jmod:confident:${itemId}` }],
    [{ text: L.alt, callback_data: `jmod:alternative:${itemId}` }, langBtn],
  ];
  if (withShare) rows.push([{ text: locale === 'ru' ? 'Поделиться GPTBot' : 'GPTBot’ni ulashish', callback_data: 'share' }]);
  return rows;
}

/** Voice result keeps only high-intent free edits; no paid alternative CTA. */
export function voiceResultKeyboard(locale: Locale, itemId: string, outputLanguage: 'ru' | 'uz' | 'other'): InlineKeyboard {
  const labels = locale === 'ru'
    ? { shorter: 'Короче', softer: 'Мягче', confident: 'Увереннее' }
    : { shorter: 'Qisqaroq', softer: 'Yumshoqroq', confident: 'Ishonchliroq' };
  const language = outputLanguage === 'uz'
    ? { text: 'RU', callback_data: `jmod:to_ru:${itemId}` }
    : { text: 'UZ', callback_data: `jmod:to_uz:${itemId}` };
  return [
    [
      { text: labels.shorter, callback_data: `jmod:shorter:${itemId}` },
      { text: labels.softer, callback_data: `jmod:softer:${itemId}` },
      { text: labels.confident, callback_data: `jmod:confident:${itemId}` },
    ],
    [language],
    [{ text: locale === 'ru' ? '🔎 Анализ содержания' : '🔎 Mazmun tahlili', callback_data: `analyze:${itemId}` }],
  ];
}

// ── GPTBot Tahlil ─────────────────────────────────────────────────────────

export const ANALYSIS_CONSENT: Record<Locale, string> = {
  ru: '🔎 GPTBot Tahlil\n\nЯ отмечу проверяемые утверждения, внутренние противоречия, неясные обещания и предложу вопросы для уточнения.\n\nЭто НЕ детектор лжи: анализ не определяет правду, намерения, эмоции или личность и не является доказательством. Не используйте его для обвинений, суда или наказания. Результат и расшифровка хранятся около 24 часов, затем удаляются. Аудиофайл не сохраняется.\n\nНажимая «Продолжить», вы подтверждаете, что имеете право анализировать это аудио.',
  uz: '🔎 Transkript mazmunini tahlil qilish\n\nMen tekshiriladigan bayonotlar, ichki qarama-qarshiliklar va noaniq va’dalarni belgilayman hamda aniqlashtiruvchi savollar taklif qilaman.\n\nBu yolg‘on detektori EMAS: tahlil rostlik, niyat, hissiyot yoki shaxsni aniqlamaydi va dalil hisoblanmaydi. Uni ayblash, sud yoki jazolash uchun ishlatmang. Natija va transkript taxminan 24 soat saqlanadi, keyin o‘chiriladi. Audiofayl saqlanmaydi.\n\n«Davom etish»ni bosib, bu audioni tahlil qilish huquqiga ega ekaningizni tasdiqlaysiz.',
};

export function analysisConsentKeyboard(locale: Locale, itemId: string): InlineKeyboard {
  return [[
    { text: locale === 'ru' ? 'Продолжить' : 'Davom etish', callback_data: `analysis_consent:accept:${itemId}` },
    { text: locale === 'ru' ? 'Отмена' : 'Bekor qilish', callback_data: `analysis_consent:cancel:${itemId}` },
  ]];
}

export const ANALYSIS_CANCELED: Record<Locale, string> = {
  ru: 'Анализ отменён. Расшифровка останется доступна для обычных кнопок около суток.',
  uz: 'Tahlil bekor qilindi. Transkript oddiy tugmalar uchun taxminan bir kun mavjud bo‘ladi.',
};

export function analysisProcessing(locale: Locale, seconds: number): string {
  return locale === 'ru'
    ? `🔎 Анализирую содержание (${formatVoiceDuration(seconds)})…\nИщу проверяемые утверждения, противоречия и неясные условия.`
    : `🔎 Mazmun tahlil qilinmoqda (${formatVoiceDuration(seconds)})…\nTekshiriladigan bayonotlar, qarama-qarshiliklar va noaniq shartlar izlanmoqda.`;
}

export const ANALYSIS_TOO_SHORT: Record<Locale, string> = {
  ru: 'Для содержательного анализа нужна запись от 10 секунд. Расшифровка и готовый ответ по-прежнему доступны.',
  uz: 'Mazmunli tahlil uchun kamida 10 soniyalik yozuv kerak. Transkript va tayyor javobdan foydalanish mumkin.',
};

export const ANALYSIS_LIMIT: Record<Locale, string> = {
  ru: 'Бесплатный анализ на сегодня уже использован. Завтра снова будет доступен 1 анализ.',
  uz: 'Bugungi bepul tahlil ishlatildi. Ertaga yana 1 ta tahlil mavjud bo‘ladi.',
};

export const ANALYSIS_FAILED: Record<Locale, string> = {
  ru: 'Сейчас не удалось выполнить анализ. Лимит не списан — попробуйте ещё раз позже.',
  uz: 'Hozir tahlilni bajarib bo‘lmadi. Limit sarflanmadi — keyinroq qayta urinib ko‘ring.',
};

export const ANALYSIS_INSUFFICIENT: Record<Locale, string> = {
  ru: 'В записи недостаточно конкретных утверждений для надёжного разбора. Лимит не списан. Это не подтверждает и не опровергает сказанное.',
  uz: 'Yozuvda ishonchli tahlil uchun yetarli aniq bayonot yo‘q. Limit sarflanmadi. Bu aytilgan gapni tasdiqlamaydi ham, inkor etmaydi ham.',
};

export const ANALYSIS_LIE_BOUNDARY: Record<Locale, string> = {
  ru: 'По голосу или тексту нельзя надёжно определить, врёт человек или говорит правду. GPTBot не определяет ложь, намерения и личность. Я могу вместо этого разобрать конкретные утверждения, противоречия и вопросы, которыми их можно проверить.',
  uz: 'Ovoz yoki matndan odam yolg‘on gapiryaptimi, ishonchli aniqlab bo‘lmaydi. GPTBot yolg‘on, niyat yoki shaxsni aniqlamaydi. Buning o‘rniga aniq bayonotlar, qarama-qarshiliklar va ularni tekshirish savollarini tahlil qila olaman.',
};

export function analysisHarmRefusal(locale: Locale, category: 'child' | 'legal' | 'employment' | 'infidelity'): string {
  if (locale === 'uz') {
    if (category === 'legal') return 'Bu tahlildan sud uchun dalil yoki ayblov sifatida foydalanishga yordam bera olmayman. U dalil emas. Yuridik masala bo‘lsa, birlamchi hujjatlar va malakali mutaxassisga tayaning.';
    return 'Bu tahlil bilan odamni ayblash, jazolash yoki unga zarar yetkazishga yordam bera olmayman. U yolg‘on detektori ham, dalil ham emas. Faqat neytral tekshirish savollarini tuzishga yordam beraman.';
  }
  if (category === 'legal') return 'Не могу помогать использовать такой анализ как доказательство для суда или обвинение. Он не является доказательством. Для юридических решений опирайтесь на первичные документы и квалифицированного специалиста.';
  return 'Не могу помогать обвинять, наказывать или причинять вред человеку на основании такого анализа. Это не детектор лжи и не доказательство. Могу помочь только составить нейтральные вопросы для проверки фактов.';
}

export function analysisReportKeyboard(locale: Locale, itemId: string): InlineKeyboard {
  return [
    [{ text: locale === 'ru' ? '❓ Вопросы для проверки' : '❓ Tekshirish savollari', callback_data: `analysis_questions:${itemId}` }],
    [
      { text: locale === 'ru' ? '👍 Полезно' : '👍 Foydali', callback_data: `analysis_feedback:useful:${itemId}` },
      { text: locale === 'ru' ? '👎 Не помогло' : '👎 Yordam bermadi', callback_data: `analysis_feedback:useless:${itemId}` },
    ],
    [{ text: locale === 'ru' ? '🗑 Удалить анализ' : '🗑 Tahlilni o‘chirish', callback_data: `analysis_delete:${itemId}` }],
  ];
}

export const ANALYSIS_FEEDBACK_THANKS: Record<Locale, string> = {
  ru: 'Спасибо за оценку. Она поможет сделать Tahlil точнее и полезнее.',
  uz: 'Baholaganingiz uchun rahmat. Bu Tahlil’ni aniqroq va foydaliroq qilishga yordam beradi.',
};

/**
 * Reports sent before 2026-10 carry a «Подробнее» button that led to a Day
 * Pass offer; that button and the offer's own buttons now get this, with no
 * price and no payment.
 */
export const ANALYSIS_NO_DETAILS: Record<Locale, string> = {
  ru: 'Расширенного разбора пока нет. Отчёт выше — полный: к нему и к вопросам для проверки можно вернуться в течение суток.',
  uz: 'Kengaytirilgan tahlil hozircha yo‘q. Yuqoridagi hisobot to‘liq: unga va tekshirish savollariga bir kun ichida qaytish mumkin.',
};

export const ANALYSIS_DELETED: Record<Locale, string> = {
  ru: 'Анализ и связанная расшифровка удалены. Запись об использованном дневном лимите сохранена без текста.',
  uz: 'Tahlil va unga tegishli transkript o‘chirildi. Ishlatilgan kunlik limit qaydi matnsiz saqlandi.',
};

export const CLARIFY: Record<Locale, string> = {
  ru: 'Кому отвечаем?',
  uz: 'Kimga javob yozamiz?',
};

export function clarifyKeyboard(locale: Locale, itemId: string): InlineKeyboard {
  const L = locale === 'ru'
    ? { client: 'Клиенту', colleague: 'Коллеге', manager: 'Руководителю', personal: 'Личное' }
    : { client: 'Mijozga', colleague: 'Hamkasbga', manager: 'Rahbarga', personal: 'Shaxsiy' };
  return [
    [{ text: L.client, callback_data: `ctx:client:${itemId}` }, { text: L.colleague, callback_data: `ctx:colleague:${itemId}` }],
    [{ text: L.manager, callback_data: `ctx:manager:${itemId}` }, { text: L.personal, callback_data: `ctx:personal:${itemId}` }],
  ];
}

export const FEEDBACK_Q: Record<Locale, string> = {
  ru: 'Насколько полезен был последний ответ?',
  uz: 'Oxirgi javob qanchalik foydali bo‘ldi?',
};

export function feedbackKeyboard(locale: Locale, resultId: string): InlineKeyboard {
  const L = locale === 'ru'
    ? { asis: 'Отправил как есть', edited: 'Немного изменил', unused: 'Не использовал' }
    : { asis: 'O‘zgartirmay yubordim', edited: 'Biroz o‘zgartirdim', unused: 'Ishlatmadim' };
  return [
    [{ text: L.asis, callback_data: `fb:as_is:${resultId}` }],
    [{ text: L.edited, callback_data: `fb:edited:${resultId}` }, { text: L.unused, callback_data: `fb:unused:${resultId}` }],
  ];
}

export const FEEDBACK_THANKS: Record<Locale, string> = {
  ru: 'Спасибо! Это помогает делать ответы лучше.',
  uz: 'Rahmat! Bu javoblarni yaxshilashga yordam beradi.',
};

export const MODIFIER_CAP: Record<Locale, string> = {
  ru: 'Для этого сообщения уже много правок. Перешлите сообщение заново или нажмите «Другой».',
  uz: 'Bu xabar uchun tahrirlar ko‘p bo‘ldi. Xabarni qayta yuboring yoki «Boshqacha» tugmasini bosing.',
};

// 1 ответ, 2 ответа, 5 ответов, 11 ответов, 21 ответ.
function repliesRu(n: number): string {
  const tens = n % 100;
  const ones = n % 10;
  if (tens >= 11 && tens <= 14) return 'ответов';
  if (ones === 1) return 'ответ';
  if (ones >= 2 && ones <= 4) return 'ответа';
  return 'ответов';
}

/**
 * /plans: the free limits and what is left today. A fixed text, not the plan
 * catalogue: no price, no paid plan, no link (decision D11). `limits` is null
 * only when no limit could be read; `remainingToday` is null outside the free
 * tier.
 */
export function plansText(locale: Locale, limits: FreeAllowance | null, remainingToday: number | null): string {
  const ru = locale === 'ru';
  const lines = [ru ? 'Лимит GPTBot Javob' : 'GPTBot Javob limiti', ''];
  if (limits) {
    lines.push(ru
      ? `Бесплатно: ${limits.daily} ${repliesRu(limits.daily)} в день, до ${limits.monthly} в месяц. Лимит обновляется в 00:00 по Ташкенту.`
      : `Bepul: kuniga ${limits.daily} ta javob, oyiga ${limits.monthly} tagacha. Limit Toshkent vaqti bilan soat 00:00 da yangilanadi.`);
  } else {
    lines.push(ru
      ? 'Ответы бесплатные в пределах дневного лимита. Он обновляется в 00:00 по Ташкенту.'
      : 'Javoblar kunlik limit doirasida bepul. Limit Toshkent vaqti bilan soat 00:00 da yangilanadi.');
  }
  if (remainingToday !== null) lines.push(ru ? `Сегодня осталось ответов: ${remainingToday}.` : `Bugun qolgan javoblar: ${remainingToday} ta.`);
  lines.push('', ru
    ? 'В боте ничего не продаётся: оплаты и платных функций здесь нет.'
    : 'Botda hech narsa sotilmaydi: bu yerda to‘lov ham, pullik funksiyalar ham yo‘q.');
  return lines.join('\n');
}

export function errorKeyboard(locale: Locale, itemId?: string): InlineKeyboard {
  const retry = locale === 'ru' ? 'Повторить' : 'Qayta urinish';
  const restart = locale === 'ru' ? 'Сначала' : 'Boshidan';
  if (!itemId) return [];
  return [[{ text: retry, callback_data: `retry:${itemId}` }, { text: restart, callback_data: `restart:${itemId}` }]];
}

export function shareText(locale: Locale, botUsername: string): { url: string } {
  const text = locale === 'ru'
    ? 'GPTBot Javob в Telegram: перешлите сообщение — получите готовый ответ в нужном тоне и на нужном языке.'
    : 'Telegramdagi GPTBot Javob: xabarni yuboring — kerakli ohang va tilda tayyor javob oling.';
  const botUrl = `https://t.me/${botUsername}`;
  return { url: `https://t.me/share/url?url=${encodeURIComponent(botUrl)}&text=${encodeURIComponent(text)}` };
}

// ── Sign-in on gptbot.uz through the bot (web-login.ts, plan WP-16) ────────
// Sent in the language of the site page the person started on. No price, no
// plan, no link: signing in is all that happens here (D11).

/** HH:MM in Tashkent (UTC+5, no daylight saving). */
function tashkentClock(at: number): string {
  const date = new Date(at + 5 * 3600_000);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

/** Which browser asked and when: the person checks it is the one in their hand. */
function loginRequest(locale: Locale, client: string | null, at: number): string {
  return locale === 'ru'
    ? `Браузер: ${client ?? 'не определён'}\nВремя запроса: ${tashkentClock(at)} по Ташкенту`
    : `Brauzer: ${client ?? 'aniqlanmadi'}\nSo‘rov vaqti: Toshkent vaqti bilan ${tashkentClock(at)}`;
}

/** Pick mode: press the number the site shows; one press. */
export function loginPrompt(locale: Locale, client: string | null, at: number): string {
  return locale === 'ru'
    ? `Вход на сайт gptbot.uz\n\n${loginRequest(locale, client, at)}\n\nПодтверждайте, только если сами нажали «Войти» на gptbot.uz. Нажмите число, которое показано на сайте, — попытка одна.`
    : `gptbot.uz saytiga kirish\n\n${loginRequest(locale, client, at)}\n\nFaqat gptbot.uz saytida «Kirish»ni o‘zingiz bosgan bo‘lsangiz tasdiqlang. Saytda ko‘rsatilgan raqamni bosing — urinish bitta.`;
}

/** Code mode (GPT_BOT_LOGIN_MODE=code): the code to type in on the site. */
export function loginCodePrompt(locale: Locale, client: string | null, at: number, code: string): string {
  return locale === 'ru'
    ? `Вход на сайт gptbot.uz\n\n${loginRequest(locale, client, at)}\n\nКод для входа: ${code}\n\nВведите его на сайте, в окне входа. Никому не сообщайте этот код — даже тем, кто называет себя поддержкой. Если вы не нажимали «Войти» на gptbot.uz, нажмите «Это не я».`
    : `gptbot.uz saytiga kirish\n\n${loginRequest(locale, client, at)}\n\nKirish kodi: ${code}\n\nUni saytdagi kirish oynasiga kiriting. Bu kodni hech kimga aytmang — o‘zini yordam xizmati deb tanishtirganlarga ham. gptbot.uz saytida «Kirish»ni bosmagan bo‘lsangiz, «Bu men emas»ni bosing.`;
}

const LOGIN_BUTTONS: Record<Locale, { deny: string; logout: string }> = {
  ru: { deny: 'Это не я', logout: 'Выйти на всех устройствах' },
  uz: { deny: 'Bu men emas', logout: 'Barcha qurilmalardan chiqish' },
};

/** Three numbers (one is right) and «not me»; callback_data stays far below 64 bytes. */
export function loginPickKeyboard(locale: Locale, loginId: string, choices: readonly string[]): InlineKeyboard {
  return [
    choices.map((choice) => ({ text: choice, callback_data: `lg:${choice}:${loginId}` })),
    [{ text: LOGIN_BUTTONS[locale].deny, callback_data: `lgx:${loginId}` }],
  ];
}

/** Code mode: «not me» while the code is unused, and signing out everywhere after. */
export function loginCodeKeyboard(locale: Locale, loginId: string): InlineKeyboard {
  return [
    [{ text: LOGIN_BUTTONS[locale].deny, callback_data: `lgx:${loginId}` }],
    ...loginLogoutKeyboard(locale),
  ];
}

/** «Выйти на всех устройствах»: the locale rides along, the button needs no row. */
export function loginLogoutKeyboard(locale: Locale): InlineKeyboard {
  return [[{ text: LOGIN_BUTTONS[locale].logout, callback_data: `lgout:${locale}` }]];
}

export const LOGIN_CONFIRMED: Record<Locale, string> = {
  ru: 'Вход подтверждён. Вернитесь в браузер — вход завершится сам.\n\nЕсли это были не вы, нажмите «Выйти на всех устройствах».',
  uz: 'Kirish tasdiqlandi. Brauzerga qayting — kirish o‘zi yakunlanadi.\n\nBu siz bo‘lmasangiz, «Barcha qurilmalardan chiqish»ni bosing.',
};

export const LOGIN_REJECTED: Record<Locale, string> = {
  ru: 'Число не совпало, вход отклонён. Если входите вы, начните вход на сайте заново.',
  uz: 'Raqam mos kelmadi, kirish rad etildi. Agar o‘zingiz kirayotgan bo‘lsangiz, saytda qaytadan boshlang.',
};

export const LOGIN_DENIED: Record<Locale, string> = {
  ru: 'Вход отменён: по этой ссылке никто не войдёт. Не пересылайте ссылки для входа другим людям.',
  uz: 'Kirish bekor qilindi: bu havola orqali hech kim kira olmaydi. Kirish havolalarini boshqalarga yubormang.',
};

export const LOGIN_STALE: Record<Locale, string> = {
  ru: 'Ссылка для входа устарела или уже использована. Начните вход на сайте gptbot.uz заново — новая ссылка действует 10 минут.',
  uz: 'Kirish havolasi eskirgan yoki allaqachon ishlatilgan. gptbot.uz saytida kirishni qaytadan boshlang — yangi havola 10 daqiqa amal qiladi.',
};

export const LOGIN_TAKEN: Record<Locale, string> = {
  ru: 'Эту ссылку уже открыл другой аккаунт Telegram, поэтому войти по ней нельзя. Начните вход на сайте заново и не пересылайте ссылку.',
  uz: 'Bu havolani boshqa Telegram akkaunt ochgan, shuning uchun u orqali kirib bo‘lmaydi. Saytda kirishni qaytadan boshlang va havolani hech kimga yubormang.',
};

export const LOGIN_LIMITED: Record<Locale, string> = {
  ru: 'Слишком много попыток входа за час. Попробуйте позже.',
  uz: 'Bir soatda kirishga urinishlar juda ko‘p. Keyinroq urinib ko‘ring.',
};

export const LOGIN_FAILED: Record<Locale, string> = {
  ru: 'Сейчас не получилось обработать вход. Попробуйте ещё раз через минуту.',
  uz: 'Hozir kirishni amalga oshirib bo‘lmadi. Bir daqiqadan keyin qayta urinib ko‘ring.',
};

export const LOGIN_REVOKED: Record<Locale, string> = {
  ru: 'Готово: вы вышли из аккаунта gptbot.uz на всех устройствах. Войти снова можно на сайте.',
  uz: 'Tayyor: barcha qurilmalarda gptbot.uz akkauntidan chiqdingiz. Saytda qaytadan kirishingiz mumkin.',
};

/** The short toast under a pressed login button (answerCallbackQuery, ≤ 200 chars). */
export const LOGIN_TOAST: Record<Locale, Record<'confirmed' | 'rejected' | 'denied' | 'repeat' | 'foreign' | 'stale' | 'revoked' | 'failed', string>> = {
  ru: {
    confirmed: 'Вход подтверждён',
    rejected: 'Вход отклонён',
    denied: 'Вход отменён',
    repeat: 'Уже обработано',
    foreign: 'Эта кнопка не для вашего аккаунта',
    stale: 'Ссылка устарела',
    revoked: 'Вы вышли на всех устройствах',
    failed: 'Не получилось, попробуйте ещё раз',
  },
  uz: {
    confirmed: 'Kirish tasdiqlandi',
    rejected: 'Kirish rad etildi',
    denied: 'Kirish bekor qilindi',
    repeat: 'Allaqachon bajarilgan',
    foreign: 'Bu tugma sizning akkauntingiz uchun emas',
    stale: 'Havola eskirgan',
    revoked: 'Barcha qurilmalardan chiqdingiz',
    failed: 'Bajarilmadi, qayta urinib ko‘ring',
  },
};
