// Every word of the natal chart widget in Uzbek (Latin) and Russian.
// To be read by a native speaker before launch (roadmap T11).
import type { NatalLocale } from '../../shared/natal-names';

export interface NatalStrings {
  you: string; partner: string;
  date: string; day: string; month: string; year: string;
  time: string; timeUnknown: string; timeHint: string;
  place: string; placeHint: string; placeNone: string; placeLoading: string;
  name: string; nameHint: string;
  build: string; buildPair: string; addPartner: string; editData: string;
  errDate: string; errTime: string; errPlace: string; errEngine: string;
  gap: (before: string, after: string) => string; twice: string; twiceSummer: string; twiceWinter: string;
  bigThree: string; sun: string; moon: string; asc: string; ascUnknown: string;
  wheel: string; table: string; body: string; sign: string; degree: string; house: string; retro: string; uncertain: string;
  aspects: string; balance: string; elements: string; modalities: string;
  how: string; howZone: (zone: string, label: string, summer: boolean) => string; howCoords: (lat: string, lon: string) => string;
  howHouses: (system: string, fellBack: boolean) => string; howVersion: (engine: string, tz: string) => string; howOld: string; howNoTime: string;
  reading: string; readingStart: string; readingWait: string; readingFree: string; readingPairFree: string;
  readingNext: string; readingLimited: string; readingBusy: string; readingFailed: string; readingRetry: string; readingLabel: string;
  pairTitle: string; pairContacts: string; pairHarmony: (n: number) => string; pairTension: (n: number) => string; pairBlend: (n: number) => string; pairNone: string;
  tone: Record<'harmony' | 'tension' | 'blend', string>;
  saved: string; savedNone: string; open: string; remove: string; print: string;
  disclaimer: string; privacy: string; attribution: string;
  systems: Record<'placidus' | 'equal' | 'whole', string>;
  sectionTitle: Record<string, string>;
}

export const STRINGS: Readonly<Record<NatalLocale, NatalStrings>> = {
  uz: {
    you: 'Siz', partner: 'Sherigingiz',
    date: 'Tugʻilgan sana', day: 'Kun', month: 'Oy', year: 'Yil',
    time: 'Tugʻilgan vaqt', timeUnknown: 'Vaqtini bilmayman', timeHint: 'Vaqt aniq boʻlsa, uylar va ascendent ham hisoblanadi.',
    place: 'Tugʻilgan joy', placeHint: 'Shahar yoki qishloq: Toshkent, Samarqand…', placeNone: 'Topilmadi. Boshqacha yozib koʻring.', placeLoading: 'Qidirilmoqda…',
    name: 'Ism (ixtiyoriy)', nameHint: 'Faqat xarita sarlavhasi uchun. Hech qayerga yuborilmaydi.',
    build: 'Natal xaritani tuzish', buildPair: 'Moslikni tekshirish', addPartner: 'Moslikni tekshirish', editData: 'Maʼlumotni oʻzgartirish',
    errDate: 'Sanani toʻliq kiriting (1900–2040).', errTime: 'Vaqtni SS:DD shaklida kiriting yoki «Vaqtini bilmayman» ni belgilang.', errPlace: 'Roʻyxatdan joyni tanlang.', errEngine: 'Hisoblashda xatolik. Sahifani yangilab koʻring.',
    gap: (before, after) => `Bu kuni soat mili oldinga surilgan (${before} → ${after}): bunday vaqt boʻlmagan. Vaqtni tekshiring.`,
    twice: 'Bu kuni soat mili orqaga surilgan: bu vaqt ikki marta boʻlgan. Qaysi biri?', twiceSummer: 'Birinchisi (yozgi vaqt)', twiceWinter: 'Ikkinchisi (qishki vaqt)',
    bigThree: 'Asosiy uchlik', sun: 'Quyosh', moon: 'Oy', asc: 'Ascendent', ascUnknown: 'vaqt nomaʼlum',
    wheel: 'Natal xarita', table: 'Jadval', body: 'Yoritgich', sign: 'Burj', degree: 'Daraja', house: 'Uy', retro: 'retrograd', uncertain: 'aniq emas',
    aspects: 'Aspektlar', balance: 'Muvozanat', elements: 'Unsurlar', modalities: 'Sifatlar',
    how: 'Qanday hisoblandi',
    howZone: (zone, label, summer) => `Vaqt mintaqasi: ${zone}, ${label}${summer ? ', yozgi vaqt' : ''}.`,
    howCoords: (lat, lon) => `Koordinatalar: ${lat}, ${lon}.`,
    howHouses: (system, fellBack) => `Uylar tizimi: ${system}${fellBack ? ' (qutb kengligida Plasidus ishlamaydi — teng uylar)' : ''}.`,
    howVersion: (engine, tz) => `Hisob: ${engine}; vaqt mintaqalari bazasi tz ${tz}. Yoritgichlar aniqligi — 1 yoy daqiqasigacha.`,
    howOld: '1970-yilgacha boʻlgan vaqt mintaqalari maʼlumotlari kamroq ishonchli (tz bazasining oʻz bahosi).',
    howNoTime: 'Vaqt nomaʼlum: xarita tush payti (12:00) uchun, uylar va ascendentsiz.',
    reading: 'AI tahlili', readingStart: 'AI tahlilini olish', readingWait: 'AI tahlil yozmoqda… odatda 20–40 soniya.',
    readingFree: 'Birinchi natal xarita tahlili — bepul.', readingPairFree: 'Birinchi moslik tahlili — bepul.',
    readingNext: 'Keyingi tahlil tez orada pullik boʻladi — hozircha mavjud emas. Xarita va jadval bepul.',
    readingLimited: 'Bugun bu manzildan tahlillar soni tugadi. Ertaga qayta urinib koʻring.', readingBusy: 'Hozir soʻrovlar koʻp. Birozdan keyin urinib koʻring.',
    readingFailed: 'Tahlil olinmadi. Qayta urinib koʻring.', readingRetry: 'Qayta urinish',
    readingLabel: 'Bu matnni AI xaritaning hisoblangan maʼlumotlari asosida yozgan. Bu astrolog tahlili emas.',
    pairTitle: 'Moslik', pairContacts: 'Xaritalar orasidagi aloqalar',
    pairHarmony: (n) => `${n} ta uygʻun`, pairTension: (n) => `${n} ta tarang`, pairBlend: (n) => `${n} ta qoʻshilish`, pairNone: 'Kuchli aloqalar topilmadi.',
    tone: { harmony: 'uygʻun', tension: 'tarang', blend: 'qoʻshilish' },
    saved: 'Mening xaritalarim', savedNone: 'Saqlangan xaritalar yoʻq.', open: 'Ochish', remove: 'Oʻchirish', print: 'Chop etish / PDF',
    disclaimer: 'Astrologiya fan sifatida isbotlanmagan. Xarita — tugʻilgan paytdagi osmonning aniq astronomik tasviri; talqin — anʼanaviy ramzlar, oʻzingizni tahlil qilish uchun.',
    privacy: 'Sana, vaqt va joy faqat shu brauzerda qoladi. AI ga faqat burjlar, uylar va aspektlar yuboriladi.',
    attribution: 'Joy nomlari va koordinatalari: GeoNames (CC BY 4.0).',
    systems: { placidus: 'Plasidus', equal: 'teng uylar', whole: 'butun burjlar' },
    sectionTitle: {
      core: 'Siz kimsiz', mind: 'Fikrlash va muloqot', love: 'Sevgi va intilish', growth: 'Oʻsish va masʼuliyat', generation: 'Avlod belgilari',
      aspects: 'Ichki bogʻlanishlar', balance: 'Muvozanat', advice: 'Maslahat',
      overview: 'Umumiy manzara', harmony: 'Bir-biringizni qoʻllaydigan joylar', tension: 'Tortishuv boʻlishi mumkin boʻlgan joylar', communication: 'Muloqot, hislar va sevgi',
    },
  },
  ru: {
    you: 'Вы', partner: 'Партнёр',
    date: 'Дата рождения', day: 'День', month: 'Месяц', year: 'Год',
    time: 'Время рождения', timeUnknown: 'Не знаю время', timeHint: 'С точным временем считаются ещё дома и асцендент.',
    place: 'Место рождения', placeHint: 'Город или посёлок: Ташкент, Самарканд…', placeNone: 'Не найдено. Попробуйте написать иначе.', placeLoading: 'Ищем…',
    name: 'Имя (по желанию)', nameHint: 'Только для подписи карты. Никуда не отправляется.',
    build: 'Построить натальную карту', buildPair: 'Проверить совместимость', addPartner: 'Проверить совместимость', editData: 'Изменить данные',
    errDate: 'Введите дату полностью (1900–2040).', errTime: 'Введите время как ЧЧ:ММ или отметьте «Не знаю время».', errPlace: 'Выберите место из списка.', errEngine: 'Ошибка расчёта. Обновите страницу.',
    gap: (before, after) => `В этот день часы переводили вперёд (${before} → ${after}): такого времени не было. Проверьте время.`,
    twice: 'В этот день часы переводили назад: это время было дважды. Какое из двух?', twiceSummer: 'Первое (летнее время)', twiceWinter: 'Второе (зимнее время)',
    bigThree: 'Главная тройка', sun: 'Солнце', moon: 'Луна', asc: 'Асцендент', ascUnknown: 'время неизвестно',
    wheel: 'Натальная карта', table: 'Таблица', body: 'Планета', sign: 'Знак', degree: 'Градус', house: 'Дом', retro: 'ретроградно', uncertain: 'неточно',
    aspects: 'Аспекты', balance: 'Баланс', elements: 'Стихии', modalities: 'Кресты',
    how: 'Как посчитано',
    howZone: (zone, label, summer) => `Часовой пояс: ${zone}, ${label}${summer ? ', летнее время' : ''}.`,
    howCoords: (lat, lon) => `Координаты: ${lat}, ${lon}.`,
    howHouses: (system, fellBack) => `Система домов: ${system}${fellBack ? ' (за полярным кругом Плацидус не работает — равнодомная)' : ''}.`,
    howVersion: (engine, tz) => `Расчёт: ${engine}; база часовых поясов tz ${tz}. Точность положений — до 1 угловой минуты.`,
    howOld: 'Данные о поясах до 1970 года менее надёжны (так оценивает их сама база tz).',
    howNoTime: 'Время неизвестно: карта на полдень (12:00), без домов и асцендента.',
    reading: 'AI-разбор', readingStart: 'Получить AI-разбор', readingWait: 'AI пишет разбор… обычно 20–40 секунд.',
    readingFree: 'Разбор первой натальной карты — бесплатно.', readingPairFree: 'Первый разбор совместимости — бесплатно.',
    readingNext: 'Следующий разбор скоро станет платным — пока недоступен. Карта и таблица бесплатны.',
    readingLimited: 'Сегодня разборы с этого адреса закончились. Попробуйте завтра.', readingBusy: 'Сейчас много запросов. Попробуйте чуть позже.',
    readingFailed: 'Разбор не получен. Попробуйте ещё раз.', readingRetry: 'Повторить',
    readingLabel: 'Этот текст написал AI по посчитанным данным карты. Это не разбор астролога.',
    pairTitle: 'Совместимость', pairContacts: 'Связи между картами',
    pairHarmony: (n) => `гармоничных: ${n}`, pairTension: (n) => `напряжённых: ${n}`, pairBlend: (n) => `соединений: ${n}`, pairNone: 'Сильных связей не найдено.',
    tone: { harmony: 'гармония', tension: 'напряжение', blend: 'соединение' },
    saved: 'Мои карты', savedNone: 'Сохранённых карт нет.', open: 'Открыть', remove: 'Удалить', print: 'Печать / PDF',
    disclaimer: 'Астрология не доказана как наука. Карта — точный астрономический снимок неба в момент рождения; толкование — традиционные символы для самоанализа.',
    privacy: 'Дата, время и место остаются только в этом браузере. AI получает только знаки, дома и аспекты.',
    attribution: 'Названия мест и координаты: GeoNames (CC BY 4.0).',
    systems: { placidus: 'Плацидус', equal: 'равнодомная', whole: 'целые знаки' },
    sectionTitle: {
      core: 'Кто вы', mind: 'Мышление и общение', love: 'Любовь и стремления', growth: 'Рост и ответственность', generation: 'Черты поколения',
      aspects: 'Внутренние связи', balance: 'Баланс', advice: 'Совет',
      overview: 'Общая картина', harmony: 'Где вы поддерживаете друг друга', tension: 'Где возможны споры', communication: 'Общение, чувства и любовь',
    },
  },
};
