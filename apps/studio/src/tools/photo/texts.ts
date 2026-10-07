/**
 * The words of the photo tool (T3.3), Uzbek (Latin, with ‘ in o‘ and g‘ and
 * ’ for the tutuq belgisi, as on the site) and Russian. The page is Uzbek
 * only (/uz/rasmdan-yechim/); the Russian set exists for the island's
 * contract (PhotoIsland takes a locale) and a later Russian page.
 *
 * Honest and careful: the tool «tushuntiradi» (explains), never «yechib
 * beradi» (solves for you); the «sinov rejimi (beta)» mark stands on the
 * form and the answer (DECISIONS 07.10 §13 п. 7); under every answer:
 * «Bu tushuntirish — ko‘chirish uchun emas. Javobni tekshiring.» (spec
 * §8.3). The consent is С-4 with the recipient named (DECISIONS §2(г)):
 * «Rasm faqat tahlil uchun Z.ai (Singapur) AI modeliga yuboriladi va
 * saqlanmaydi.» No tariff word here (cheksiz, безлимит, rasmiy …):
 * tests/studio-photo-island.test.ts checks.
 *
 * Error messages are keyed by the API's coarse codes; a code without its
 * own message falls back to `busy`.
 */
import type { StudioLocale } from '../../api';

export type PhotoStep = 'shrink' | 'check' | 'explain' | 'ready';
export type PhotoModeChoice = 'explain' | 'math';

export type PhotoMessageKey =
  | 'file_type'
  | 'file_large'
  | 'consent_required'
  | 'free_limit'
  | 'ip_ceiling'
  | 'try_later'
  | 'rate_limited'
  | 'unreadable'
  | 'photo_refused'
  | 'job_in_progress'
  | 'turnstile'
  | 'photo_closed'
  | 'no_units'
  | 'regen_used'
  | 'regen_window'
  | 'regen_mismatch'
  | 'connection_lost'
  | 'job_lost'
  | 'busy';

export interface PhotoTexts {
  readonly legend: string;
  readonly pickLabel: string;
  readonly pickHint: string;
  readonly chosen: (name: string) => string;
  readonly modeLabel: string;
  readonly modes: Readonly<Record<PhotoModeChoice, string>>;
  readonly submit: string;
  readonly submitBusy: string;
  readonly freeNote: string;
  readonly beta: string;
  readonly consentTitle: string;
  readonly consentBody: string;
  readonly consentFaces: string;
  readonly consentPolicy: string;
  readonly consentAccept: string;
  readonly consentDecline: string;
  readonly inAppTitle: string;
  readonly inAppBody: string;
  readonly copyLink: string;
  readonly copyShort: string;
  readonly copied: string;
  readonly copyFailed: string;
  readonly steps: Readonly<Record<PhotoStep, string>>;
  readonly progressNote: string;
  readonly seconds: (n: number) => string;
  readonly resultTitle: string;
  readonly given: string;
  readonly solution: string;
  readonly answer: string;
  readonly check: string;
  readonly confidence: Readonly<Record<'high' | 'medium' | 'low', string>>;
  readonly subjects: Readonly<Record<'matematika' | 'fizika' | 'kimyo' | 'ona_tili' | 'ingliz_tili' | 'boshqa', string>>;
  readonly disclaimer: string;
  readonly regenerate: string;
  readonly regenerating: string;
  readonly regenNote: string;
  readonly another: string;
  readonly unitNote: (left: number) => string;
  readonly unitBack: string;
  readonly messages: Readonly<Record<PhotoMessageKey, string>>;
  readonly resetAt: (time: string) => string;
  readonly jobOpenUntil: (time: string) => string;
}

export const PHOTO_TEXTS: Readonly<Record<StudioLocale, PhotoTexts>> = {
  uz: {
    legend: 'Masala rasmi',
    pickLabel: 'Rasmni tanlang yoki suratga oling',
    pickHint: 'JPEG, PNG yoki WebP. Bitta rasm — bitta masala: yorug‘ joyda, to‘g‘ridan, yaqinroqdan suratga oling.',
    chosen: (name) => `Tanlandi: ${name}`,
    modeLabel: 'Javob turi',
    modes: { explain: 'Tushuntirish bilan', math: 'Faqat hisob-kitob' },
    submit: 'Tushuntirish',
    submitBusy: 'Tahlil qilinmoqda…',
    freeNote: 'Bepul: kuniga 2 ta rasm. AI masalani tushuntiradi — tayyor javobni ko‘chirish uchun emas.',
    beta: 'Sinov rejimi (beta)',
    consentTitle: 'Rasmni yuborishdan oldin',
    consentBody:
      'Rasm faqat tahlil uchun Z.ai (Singapur) AI modeliga yuboriladi va saqlanmaydi. Rasmdagi metama’lumotlar (joy, vaqt, qurilma) serverda o‘chiriladi. Daftardagi ism-familiya, maktab va sinf raqamini AI javobga ko‘chirmaydi.',
    consentFaces: 'Odamlarning yuzi tushgan rasmni yubormang.',
    consentPolicy: 'Maxfiylik siyosati',
    consentAccept: 'Roziman, davom etish',
    consentDecline: 'Bekor qilish',
    inAppTitle: 'Brauzerda oching',
    inAppBody:
      'Instagram yoki Telegram ichidagi brauzerda rasm yuklash ishlamasligi mumkin. Havolani nusxalab, Chrome yoki Safari’da oching yoki yuqoridagi ⋮ / … menyusidan «Brauzerda ochish»ni tanlang.',
    copyLink: 'Havolani nusxalash',
    copyShort: 'Nusxalash',
    copied: 'Havola nusxalandi',
    copyFailed: 'Nusxalab bo‘lmadi. Yuqoridagi ⋮ yoki … menyusidan «Brauzerda ochish»ni tanlang.',
    steps: { shrink: 'Rasm tayyorlanmoqda', check: 'Tekshiruv', explain: 'AI rasmni o‘qiyapti va tushuntiryapti', ready: 'Tushuntirish tayyor' },
    progressNote: 'Odatda 6–15 soniya. Sahifani yopmang.',
    seconds: (n) => `${n} soniya`,
    resultTitle: 'Tushuntirish',
    given: 'Berilgan',
    solution: 'Yechish',
    answer: 'Javob',
    check: 'Tekshirish',
    confidence: { high: 'AI ishonchi: yuqori', medium: 'AI ishonchi: o‘rtacha — javobni tekshiring', low: 'AI ishonchi: past — javobni albatta tekshiring' },
    subjects: { matematika: 'Matematika', fizika: 'Fizika', kimyo: 'Kimyo', ona_tili: 'Ona tili', ingliz_tili: 'Ingliz tili', boshqa: 'Boshqa fan' },
    disclaimer: 'Bu tushuntirish — ko‘chirish uchun emas. Javobni tekshiring.',
    regenerate: 'Qayta tushuntirish',
    regenerating: 'Qayta tushuntirilmoqda…',
    regenNote: 'Shu rasm uchun bir marta, 24 soat ichida; birlik yechilmaydi.',
    another: 'Boshqa rasm',
    unitNote: (left) => `Bugungi bepul rasmlar tugadi: tarifdan 1 ta birlik yechiladi (qoldi: ${left})`,
    unitBack: 'Birlik qaytariladi.',
    messages: {
      file_type: 'JPEG, PNG yoki WebP rasm tanlang.',
      file_large: 'Rasmni kichraytirib bo‘lmadi. Boshqa rasm tanlang.',
      consent_required: 'Davom etish uchun rozilik kerak.',
      free_limit: 'Bugungi 2 ta bepul rasm ishlatildi.',
      ip_ceiling: 'Bu tarmoqdan bugun juda ko‘p so‘rov bo‘ldi. Ertaga yoki boshqa tarmoqdan urinib ko‘ring.',
      try_later: 'Bugun urinishlar juda ko‘p bo‘ldi. Ertaga qayta urinib ko‘ring.',
      rate_limited: 'Juda ko‘p urinish. Bir necha daqiqadan so‘ng qayta urinib ko‘ring.',
      unreadable: 'Rasm o‘qilmadi: masala ko‘rinmayapti yoki xira. Yorug‘ joyda, yaqinroqdan qayta suratga oling. Birlik yechilmadi.',
      photo_refused: 'Bu rasmni tushuntira olmaymiz. Birlik yechilmadi.',
      job_in_progress: 'Oldingi so‘rov hali yakunlanmagan. Bir necha daqiqadan so‘ng qayta urinib ko‘ring.',
      turnstile: 'Tekshiruvdan o‘tib bo‘lmadi. Sahifani yangilab, qayta urinib ko‘ring.',
      photo_closed: 'Rasmdan yechim hozir ishlamayapti.',
      no_units: 'Rasm uchun birlik qolmadi.',
      regen_used: 'Bu rasm allaqachon qayta tushuntirilgan.',
      regen_window: 'Qayta tushuntirish muddati tugagan.',
      regen_mismatch: 'Qayta tushuntirish faqat o‘sha rasm uchun.',
      connection_lost: 'Aloqa uzildi. Internetni tekshirib, qayta urinib ko‘ring.',
      job_lost: 'Aloqa uzilgan paytda so‘rov yopildi va uni qayta ochib bo‘lmaydi.',
      busy: 'Vaqtincha ishlamayapti. Birozdan so‘ng qayta urinib ko‘ring.',
    },
    resetAt: (time) => `Yangi bepul rasmlar soat ${time} da (Toshkent vaqti).`,
    jobOpenUntil: (time) => `Oldingi so‘rov hali yakunlanmagan. Soat ${time} dan keyin qayta urinib ko‘ring.`,
  },
  ru: {
    legend: 'Фото задачи',
    pickLabel: 'Выберите фото или снимите',
    pickHint: 'JPEG, PNG или WebP. Одно фото — одна задача: при хорошем свете, прямо, поближе.',
    chosen: (name) => `Выбрано: ${name}`,
    modeLabel: 'Вид ответа',
    modes: { explain: 'С объяснением', math: 'Только вычисления' },
    submit: 'Объяснить',
    submitBusy: 'Разбираем…',
    freeNote: 'Бесплатно: 2 фото в день. AI объясняет задачу — не для списывания готового ответа.',
    beta: 'Тестовый режим (beta)',
    consentTitle: 'Перед отправкой фото',
    consentBody:
      'Фото отправляется только для разбора AI-модели Z.ai (Сингапур) и не сохраняется. Метаданные фото (место, время, устройство) удаляются на сервере. Имя, фамилию, школу и класс из тетради AI в ответ не переписывает.',
    consentFaces: 'Не отправляйте фото с лицами людей.',
    consentPolicy: 'Политика конфиденциальности',
    consentAccept: 'Согласен, продолжить',
    consentDecline: 'Отмена',
    inAppTitle: 'Откройте в браузере',
    inAppBody:
      'Во встроенном браузере Instagram или Telegram загрузка фото может не работать. Скопируйте ссылку и откройте её в Chrome или Safari, либо выберите «Открыть в браузере» в меню ⋮ / … сверху.',
    copyLink: 'Скопировать ссылку',
    copyShort: 'Скопировать',
    copied: 'Ссылка скопирована',
    copyFailed: 'Не удалось скопировать. Выберите «Открыть в браузере» в меню ⋮ или … сверху.',
    steps: { shrink: 'Готовим фото', check: 'Проверка', explain: 'AI читает фото и объясняет', ready: 'Объяснение готово' },
    progressNote: 'Обычно 6–15 секунд. Не закрывайте страницу.',
    seconds: (n) => `${n} сек`,
    resultTitle: 'Объяснение',
    given: 'Дано',
    solution: 'Решение',
    answer: 'Ответ',
    check: 'Проверка',
    confidence: { high: 'Уверенность AI: высокая', medium: 'Уверенность AI: средняя — проверьте ответ', low: 'Уверенность AI: низкая — обязательно проверьте ответ' },
    subjects: { matematika: 'Математика', fizika: 'Физика', kimyo: 'Химия', ona_tili: 'Родной язык', ingliz_tili: 'Английский', boshqa: 'Другой предмет' },
    disclaimer: 'Это объяснение — не для списывания. Проверьте ответ.',
    regenerate: 'Объяснить заново',
    regenerating: 'Объясняем заново…',
    regenNote: 'Один раз для этого фото в течение 24 часов; единица не списывается.',
    another: 'Другое фото',
    unitNote: (left) => `Бесплатные фото на сегодня закончились: спишется 1 единица тарифа (осталось: ${left})`,
    unitBack: 'Единица вернётся.',
    messages: {
      file_type: 'Выберите фото JPEG, PNG или WebP.',
      file_large: 'Не удалось уменьшить фото. Выберите другое.',
      consent_required: 'Чтобы продолжить, нужно согласие.',
      free_limit: 'Два бесплатных фото на сегодня использованы.',
      ip_ceiling: 'С этой сети сегодня слишком много запросов. Попробуйте завтра или из другой сети.',
      try_later: 'Сегодня было слишком много попыток. Попробуйте завтра.',
      rate_limited: 'Слишком много попыток. Попробуйте через несколько минут.',
      unreadable: 'Фото не прочиталось: задачи не видно или она размыта. Снимите заново при хорошем свете, поближе. Единица не списана.',
      photo_refused: 'Это фото мы объяснить не можем. Единица не списана.',
      job_in_progress: 'Предыдущий запрос ещё не завершён. Попробуйте через несколько минут.',
      turnstile: 'Не удалось пройти проверку. Обновите страницу и попробуйте снова.',
      photo_closed: 'Разбор по фото сейчас не работает.',
      no_units: 'Единиц для фото не осталось.',
      regen_used: 'Это фото уже объясняли заново.',
      regen_window: 'Срок, когда можно объяснить заново, прошёл.',
      regen_mismatch: 'Заново — только для того же фото.',
      connection_lost: 'Связь прервалась. Проверьте интернет и попробуйте снова.',
      job_lost: 'Пока связь была потеряна, запрос закрылся, и открыть его снова нельзя.',
      busy: 'Временно не работает. Попробуйте чуть позже.',
    },
    resetAt: (time) => `Новые бесплатные фото в ${time} (по Ташкенту).`,
    jobOpenUntil: (time) => `Предыдущий запрос ещё не завершён. Попробуйте после ${time}.`,
  },
};

/** The message key of an API code: its own, or `busy`. */
export function photoMessageKey(code: string): PhotoMessageKey {
  const keys = Object.keys(PHOTO_TEXTS.uz.messages) as PhotoMessageKey[];
  if ((keys as string[]).includes(code)) return code as PhotoMessageKey;
  if (code === 'turnstile_failed' || code === 'turnstile_required' || code === 'turnstile_unavailable') return 'turnstile';
  if (code === 'not_found') return 'photo_closed';
  if (code === 'network' || code === 'timeout') return 'connection_lost';
  if (code === 'job_state') return 'job_lost';
  if (code === 'payload_too_large' || code === 'unsupported_media') return 'file_type';
  return 'busy';
}

/** Codes that hold until the free day restarts (05:00 Tashkent): the message gets the reset time. */
export const PHOTO_UNTIL_RESET: ReadonlySet<string> = new Set(['free_limit', 'ip_ceiling', 'try_later']);

/** Codes of a server fault once the job existed: the unit comes back (spec §2.3 item 4). */
export const PHOTO_UNIT_BACK: ReadonlySet<string> = new Set(['model_failed', 'model_unavailable', 'studio_busy', 'invalid_output']);

/** HH:MM in Tashkent (UTC+5) of an ISO time, or '' for none. */
export function tashkentClock(iso: string | undefined): string {
  if (!iso) return '';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const local = new Date(at + 5 * 3_600_000);
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
}

/** When the free day restarts after `now`: the next 00:00 UTC (05:00 Tashkent), ISO. */
export function nextFreeReset(now: number): string {
  const day = 86_400_000;
  return new Date((Math.floor(now / day) + 1) * day).toISOString();
}
