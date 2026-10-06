/**
 * The words of the presentation tool, Uzbek (Latin, with ‘ in o‘ and g‘ and
 * ’ for the tutuq belgisi, as on the site) and Russian. DRAFTS: a native
 * speaker reads them before the pages are published (T2.4).
 *
 * The brand line is honest: GPTBot.uz is an independent AI service, never
 * ChatGPT, OpenAI or "official"; no tariff word here (cheksiz, безлимит,
 * rasmiy …): tests/studio-island.test.ts checks.
 *
 * Error messages are keyed by the API's coarse codes; a code without its own
 * message falls back to `busy` ("Vaqtincha ishlamayapti").
 */
import type { StudioAudience, StudioLocale } from '../../api';

export type Step = 'check' | 'write' | 'images' | 'ready';

export type MessageKey =
  | 'topic_length'
  | 'free_limit'
  | 'ip_ceiling'
  | 'try_later'
  | 'rate_limited'
  | 'topic_refused'
  | 'job_in_progress'
  | 'turnstile'
  | 'busy';

export interface ToolTexts {
  readonly topicLabel: string;
  readonly topicPlaceholder: string;
  readonly topicHint: string;
  readonly audienceLabel: string;
  readonly audience: Readonly<Record<StudioAudience, string>>;
  readonly slidesLabel: string;
  readonly submit: string;
  readonly submitBusy: string;
  readonly freeNote: string;
  readonly inAppTitle: string;
  readonly inAppBody: string;
  readonly copyLink: string;
  readonly copied: string;
  readonly copyFailed: string;
  readonly steps: Readonly<Record<Step, string>>;
  readonly progressNote: string;
  readonly seconds: (n: number) => string;
  readonly resultTitle: string;
  readonly draftNote: string;
  readonly slide: (n: number) => string;
  readonly pictureLoading: string;
  readonly pictureNone: string;
  readonly download: string;
  readonly downloadWait: string;
  readonly building: string;
  readonly saved: string;
  readonly buildFailed: string;
  readonly inAppDownload: string;
  readonly messages: Readonly<Record<MessageKey, string>>;
  readonly resetAt: (time: string) => string;
}

export const TEXTS: Readonly<Record<StudioLocale, ToolTexts>> = {
  uz: {
    topicLabel: 'Taqdimot mavzusi',
    topicPlaceholder: 'Masalan: Amir Temur davlati',
    topicHint: '3 tadan 200 tagacha belgi',
    audienceLabel: 'Kim uchun',
    audience: { maktab: 'Maktab o‘quvchisi', talaba: 'Talaba', umumiy: 'Umumiy' },
    slidesLabel: 'Slaydlar soni',
    submit: 'Taqdimot tayyorlash',
    submitBusy: 'Tayyorlanmoqda…',
    freeNote: 'Bepul: kuniga 1 ta taqdimot, 6 slaydgacha, 2 ta rasm. Ro‘yxatdan o‘tish shart emas.',
    inAppTitle: 'Brauzerda oching',
    inAppBody:
      'Instagram yoki Telegram ichidagi brauzer faylni saqlamasligi mumkin — unda bepul taqdimot ham yo‘qoladi. Havolani nusxalab, Chrome yoki Safari’da oching.',
    copyLink: 'Havolani nusxalash',
    copied: 'Havola nusxalandi',
    copyFailed: 'Nusxalab bo‘lmadi. Manzilni brauzer satridan nusxalang.',
    steps: { check: 'Tekshiruv', write: 'Slaydlar yozilmoqda', images: 'Rasmlar chizilmoqda', ready: 'Taqdimot tayyor' },
    progressNote: 'Odatda 30–40 soniya. Sahifani yopmang.',
    seconds: (n) => `${n} soniya`,
    resultTitle: 'Taqdimot tayyor',
    draftNote: 'Bu qoralama: faktlarni tekshiring va o‘zingiz to‘ldiring.',
    slide: (n) => `${n}-slayd`,
    pictureLoading: 'Rasm chizilmoqda…',
    pictureNone: 'Rasmsiz',
    download: 'Yuklab olish (.pptx)',
    downloadWait: 'Rasmlar tayyorlanmoqda…',
    building: 'Fayl tayyorlanmoqda…',
    saved: 'Fayl saqlandi',
    buildFailed: 'Faylni yaratib bo‘lmadi. Qayta urinib ko‘ring.',
    inAppDownload: 'Fayl saqlanmasa, havolani nusxalab, sahifani Chrome yoki Safari’da oching.',
    messages: {
      topic_length: 'Mavzu 3 tadan 200 tagacha belgidan iborat bo‘lsin.',
      free_limit: 'Bugungi bepul taqdimot ishlatildi.',
      ip_ceiling: 'Bu tarmoqdan bugun juda ko‘p so‘rov bo‘ldi. Ertaga yoki boshqa tarmoqdan urinib ko‘ring.',
      try_later: 'Bugun urinishlar juda ko‘p bo‘ldi. Ertaga qayta urinib ko‘ring.',
      rate_limited: 'Juda ko‘p urinish. Bir necha daqiqadan so‘ng qayta urinib ko‘ring.',
      topic_refused: 'Bu mavzuda taqdimot tayyorlay olmaymiz. Boshqa mavzu yozing.',
      job_in_progress: 'Oldingi taqdimot hali tayyorlanmoqda. Bir necha daqiqadan so‘ng qayta urinib ko‘ring.',
      turnstile: 'Tekshiruvdan o‘tib bo‘lmadi. Sahifani yangilab, qayta urinib ko‘ring.',
      busy: 'Vaqtincha ishlamayapti. Birozdan so‘ng qayta urinib ko‘ring.',
    },
    resetAt: (time) => `Yangi bepul taqdimot soat ${time} da (Toshkent vaqti).`,
  },
  ru: {
    topicLabel: 'Тема презентации',
    topicPlaceholder: 'Например: Государство Амира Темура',
    topicHint: 'От 3 до 200 символов',
    audienceLabel: 'Для кого',
    audience: { maktab: 'Школьник', talaba: 'Студент', umumiy: 'Для всех' },
    slidesLabel: 'Слайдов',
    submit: 'Сделать презентацию',
    submitBusy: 'Готовим…',
    freeNote: 'Бесплатно: 1 презентация в день, до 6 слайдов, 2 картинки. Без регистрации.',
    inAppTitle: 'Откройте в браузере',
    inAppBody:
      'Встроенный браузер Instagram или Telegram может не сохранить файл — тогда пропадёт и бесплатная презентация. Скопируйте ссылку и откройте её в Chrome или Safari.',
    copyLink: 'Скопировать ссылку',
    copied: 'Ссылка скопирована',
    copyFailed: 'Не удалось скопировать. Скопируйте адрес из строки браузера.',
    steps: { check: 'Проверка', write: 'Пишем слайды', images: 'Рисуем картинки', ready: 'Презентация готова' },
    progressNote: 'Обычно 30–40 секунд. Не закрывайте страницу.',
    seconds: (n) => `${n} с`,
    resultTitle: 'Презентация готова',
    draftNote: 'Это черновик: проверьте факты и доработайте сами.',
    slide: (n) => `Слайд ${n}`,
    pictureLoading: 'Рисуем картинку…',
    pictureNone: 'Без картинки',
    download: 'Скачать (.pptx)',
    downloadWait: 'Дорисовываем картинки…',
    building: 'Собираем файл…',
    saved: 'Файл сохранён',
    buildFailed: 'Не удалось собрать файл. Попробуйте ещё раз.',
    inAppDownload: 'Если файл не сохранился, скопируйте ссылку и откройте страницу в Chrome или Safari.',
    messages: {
      topic_length: 'Тема — от 3 до 200 символов.',
      free_limit: 'Бесплатная презентация на сегодня уже использована.',
      ip_ceiling: 'Из этой сети сегодня было слишком много запросов. Попробуйте завтра или из другой сети.',
      try_later: 'Сегодня было слишком много попыток. Попробуйте завтра.',
      rate_limited: 'Слишком много попыток. Попробуйте через несколько минут.',
      topic_refused: 'На эту тему презентацию сделать не можем. Напишите другую тему.',
      job_in_progress: 'Предыдущая презентация ещё готовится. Попробуйте через несколько минут.',
      turnstile: 'Не удалось пройти проверку. Обновите страницу и попробуйте снова.',
      busy: 'Временно не работает. Попробуйте чуть позже.',
    },
    resetAt: (time) => `Новая бесплатная презентация — в ${time} по Ташкенту.`,
  },
};

/** The page's language from <html lang>: "ru…" is Russian, anything else Uzbek. */
export function pageLocale(lang: string | null | undefined): StudioLocale {
  return (lang ?? '').toLowerCase().startsWith('ru') ? 'ru' : 'uz';
}

/** The message for an API or form code. */
export function messageKey(code: string): MessageKey {
  switch (code) {
    case 'topic_length':
    case 'free_limit':
    case 'ip_ceiling':
    case 'try_later':
    case 'rate_limited':
    case 'topic_refused':
    case 'job_in_progress':
      return code;
    case 'turnstile_failed':
    case 'turnstile_required':
    case 'turnstile_unavailable':
      return 'turnstile';
    default:
      return 'busy';
  }
}

/** HH:MM of `iso` in Tashkent; "05:00" (the free day's start) when it cannot be read. */
export function tashkentTime(iso: string | undefined): string {
  const time = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(time)) return '05:00';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false }).format(time);
  } catch {
    // UTC+5 all year: Uzbekistan keeps no daylight saving time.
    const date = new Date(time + 5 * 3_600_000);
    return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
  }
}
