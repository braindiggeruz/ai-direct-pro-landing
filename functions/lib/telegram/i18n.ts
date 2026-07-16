// RU / Uzbek-Latin copy + inline keyboards for the Telegram assistant.
// Keyboards embed only an action tag + short item id in callback_data —
// never the source text (ownership is verified server-side by item id).
import type { InlineKeyboard } from './client';
import type { Locale, TgAction } from './store';
import type { SituationType } from './classify';

export const START: Record<Locale, string> = {
  ru: 'GPTBot Javob превращает текст и голосовые в готовый ответ.\n\nПерешлите сообщение или голосовое из любого Telegram-чата — я распознаю смысл и подготовлю ответ в нужном тоне и на нужном языке.\n\nПоддерживаются русский и Uzbek Latin. Аудио не хранится.\n\nПопробуйте прямо сейчас ↓',
  uz: 'GPTBot Javob matn va ovozli xabarni tayyor javobga aylantiradi.\n\nIstalgan Telegram chatidan xabar yoki ovozli xabar yuboring — mazmunini aniqlab, kerakli ohang va tilda javob tayyorlayman.\n\nRus tili va Uzbek Latin qo‘llab-quvvatlanadi. Audio saqlanmaydi.\n\nHoziroq sinab ko‘ring ↓',
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

export const LIMIT_REACHED: Record<Locale, string> = {
  ru: 'Бесплатный лимит на сегодня закончился. Продолжить работу можно на тарифе GPTBot.',
  uz: 'Bugungi bepul limit tugadi. GPTBot tarifida davom ettirishingiz mumkin.',
};

export const HELP: Record<Locale, string> = {
  ru: 'GPTBot Javob — готовый ответ на любое сообщение.\n\nПерешлите (или вставьте) сообщение, на которое нужно ответить, — я сразу подготовлю текст ответа. Кнопками можно сделать его короче, мягче, увереннее, получить другой вариант или сменить язык RU/UZ.\n\nКоманды:\n/new — новый запрос\n/lang — язык\n/plans — тарифы\n/privacy — конфиденциальность\n/delete_me — удалить мои данные',
  uz: 'GPTBot Javob — istalgan xabarga tayyor javob.\n\nJavob berish kerak bo‘lgan xabarni yuboring (yoki joylashtiring) — darhol javob matnini tayyorlayman. Tugmalar orqali uni qisqartirish, yumshatish, ishonchliroq qilish, boshqa variant olish yoki RU/UZ tilini almashtirish mumkin.\n\nBuyruqlar:\n/new — yangi so‘rov\n/lang — til\n/plans — tariflar\n/privacy — maxfiylik\n/delete_me — ma’lumotlarimni o‘chirish',
};

const PRIVACY_BASE: Record<Locale, string> = {
  ru: 'GPTBot видит только сообщения, которые вы сами отправили или переслали боту. Бот не получает доступ к остальным чатам Telegram.\n\nПересланный текст временно хранится (около суток) для обработки и повторных действий, затем очищается. Не отправляйте данные, на обработку которых у вас нет права.\n\nКоманда /delete_me удаляет ваши данные.',
  uz: 'GPTBot faqat siz yuborgan yoki unga uzatgan xabarlarni ko‘radi. Bot boshqa Telegram chatlaringizga kira olmaydi.\n\nUzatilgan matn qayta ishlash va takroriy amallar uchun vaqtincha (taxminan bir kun) saqlanadi, so‘ng o‘chiriladi. O‘zingizda huquqi bo‘lmagan ma’lumotlarni yubormang.\n\n/delete_me buyrug‘i ma’lumotlaringizni o‘chiradi.',
};

export const PRIVACY: Record<Locale, string> = {
  ru: `${PRIVACY_BASE.ru}\n\nГолосовые и аудиофайлы обрабатываются только в памяти и не сохраняются. Расшифровка хранится как обычный текст около суток для кнопок-повторов.`,
  uz: `${PRIVACY_BASE.uz}\n\nOvozli xabar va audiofayl faqat xotirada qayta ishlanadi va saqlanmaydi. Tugmalar ishlashi uchun matnli transkript taxminan bir kun saqlanadi.`,
};

export const DELETED: Record<Locale, string> = {
  ru: 'Ваши данные удалены. Можете начать заново в любой момент — просто перешлите сообщение.',
  uz: 'Ma’lumotlaringiz o‘chirildi. Istalgan vaqtda qaytadan boshlashingiz mumkin — shunchaki xabar yuboring.',
};

export const GROUP_NOTICE: Record<Locale, string> = {
  ru: 'В MVP GPTBot работает в личном чате. Напишите боту напрямую.',
  uz: 'MVP’da GPTBot shaxsiy chatda ishlaydi. Botga to‘g‘ridan-to‘g‘ri yozing.',
};

const PRICING_URL: Record<Locale, string> = {
  ru: 'https://gptbot.uz/ru/tarify-ai-chat/',
  uz: 'https://gptbot.uz/uz/chat-bot-narxi/',
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
  ];
}

export function voiceSituationSummary(locale: Locale, situation: SituationType): string {
  const ru: Record<SituationType, string> = {
    question: 'В голосовом — вопрос собеседника.',
    request: 'В голосовом — просьба собеседника.',
    complaint: 'В голосовом — жалоба; лучше ответить спокойно.',
    objection: 'В голосовом — возражение собеседника.',
    offer: 'В голосовом — предложение собеседника.',
    greeting: 'В голосовом — приветствие.',
    confirmation: 'В голосовом — подтверждение договорённости.',
    information: 'В голосовом — информация, на которую нужен ответ.',
  };
  const uz: Record<SituationType, string> = {
    question: 'Ovozli xabarda suhbatdosh savol berdi.',
    request: 'Ovozli xabarda suhbatdosh iltimos bildirdi.',
    complaint: 'Ovozli xabarda shikoyat bor; xotirjam javob ma’qul.',
    objection: 'Ovozli xabarda e’tiroz bildirildi.',
    offer: 'Ovozli xabarda taklif bor.',
    greeting: 'Ovozli xabarda salomlashildi.',
    confirmation: 'Ovozli xabarda kelishuv tasdiqlandi.',
    information: 'Ovozli xabarda javob kerak bo‘lgan ma’lumot bor.',
  };
  return (locale === 'ru' ? ru : uz)[situation];
}

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

export interface PlanDisplay { code: string; name: string; priceUzs: number; limitLine: string }

export function plansText(locale: Locale, plans: Array<{ code: string; name_ru: string; name_uz: string; price_uzs: number; billing_type: string; monthly_limit: number | null; daily_limit: number | null; duration_hours: number | null }>): string {
  const ru = locale === 'ru';
  const lines: string[] = [ru ? 'Тарифы GPTBot Javob:' : 'GPTBot Javob tariflari:', ''];
  for (const p of plans) {
    const name = ru ? p.name_ru : p.name_uz;
    const price = p.price_uzs === 0 ? (ru ? 'бесплатно' : 'bepul')
      : `${p.price_uzs.toLocaleString('ru-RU')} UZS${p.billing_type === 'monthly' ? (ru ? '/мес' : '/oy') : ''}`;
    let limit: string;
    if (p.code === 'free') limit = ru ? `${p.daily_limit} ответа в день, до ${p.monthly_limit} в месяц` : `kuniga ${p.daily_limit} ta javob, oyiga ${p.monthly_limit} tagacha`;
    else if (p.billing_type === 'one_time') limit = ru ? `до ${p.monthly_limit} ответов, ${p.duration_hours} часа` : `${p.monthly_limit} tagacha javob, ${p.duration_hours} soat`;
    else limit = ru ? `до ${p.monthly_limit} ответов в месяц` : `oyiga ${p.monthly_limit} tagacha javob`;
    lines.push(`• ${name} — ${price}\n  ${limit}`);
  }
  lines.push('');
  lines.push(ru ? 'Онлайн-оплата скоро. Подробнее: https://gptbot.uz/ru/tarify-ai-chat/' : 'Onlayn to‘lov tez orada. Batafsil: https://gptbot.uz/uz/chat-bot-narxi/');
  return lines.join('\n');
}

export function limitKeyboard(locale: Locale): InlineKeyboard {
  const label = locale === 'ru' ? 'Посмотреть тарифы' : 'Tariflarni ko‘rish';
  return [[{ text: label, url: PRICING_URL[locale] }]];
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
