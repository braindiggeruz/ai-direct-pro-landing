import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

type Locale = 'ru' | 'uz' | 'neutral';

interface AssetDefinition {
  id: string;
  group: 'buyer-static' | 'buyer-story' | 'buyer-education' | 'seller-kit' | 'telegram' | 'website';
  locale: Locale;
  audience: string;
  stage: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  bullets: readonly string[];
  cta: string;
  source: string;
  truthStatus: string;
  approvalState: string;
  alt: string;
  width?: number;
  height?: number;
  accent?: 'coral' | 'teal' | 'gold';
}

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTPUT = path.join(ROOT, 'public', 'assets', 'market', 'creative');

const RU_SOURCE = 'GPTBot Market truth matrix; synthetic demo only';
const UZ_SOURCE = 'GPTBot Market truth matrix; Uzbek Latin draft; synthetic demo only';

const assets: readonly AssetDefinition[] = [
  {
    id: 'buyer-static-ru-01-find', group: 'buyer-static', locale: 'ru',
    audience: 'Покупатель', stage: 'Awareness', eyebrow: 'GPTBot Market',
    title: 'Напишите, что Вам нужно',
    subtitle: 'GPTBot найдёт подходящие товары в каталогах подключённых магазинов.',
    bullets: ['Цена и наличие — из каталога', 'Сравнение подтверждённых данных'],
    cta: 'Открыть GPTBot', source: RU_SOURCE, truthStatus: 'Approved product truth',
    approvalState: 'Ready; launch not authorized',
    alt: 'Карточка GPTBot Market о поиске товаров по запросу.',
  },
  {
    id: 'buyer-static-ru-02-facts', group: 'buyer-static', locale: 'ru',
    audience: 'Покупатель', stage: 'Consideration', eyebrow: 'Факты, а не догадки',
    title: 'Видно, откуда взялись данные',
    subtitle: 'У каждого варианта указаны магазин, цена, наличие и дата обновления.',
    bullets: ['Без выдуманных скидок', 'Если данных нет — GPTBot скажет об этом'],
    cta: 'Посмотреть демо', source: RU_SOURCE, truthStatus: 'Approved product truth',
    approvalState: 'Ready; launch not authorized',
    alt: 'Карточка о происхождении цены и наличия в GPTBot Market.', accent: 'gold',
  },
  {
    id: 'buyer-static-ru-03-request', group: 'buyer-static', locale: 'ru',
    audience: 'Покупатель', stage: 'Conversion', eyebrow: 'Запрос, не оплата',
    title: 'Сначала заявка продавцу',
    subtitle: 'Продавец подтверждает товар, доставку и способ оплаты напрямую.',
    bullets: ['GPTBot не принимает деньги', 'За товар и выполнение отвечает магазин'],
    cta: 'Найти товар', source: RU_SOURCE, truthStatus: 'Approved product truth',
    approvalState: 'Ready; launch not authorized',
    alt: 'Карточка о том, что оформление в GPTBot является заявкой, а не оплатой.', accent: 'teal',
  },
  {
    id: 'buyer-static-uz-01-find', group: 'buyer-static', locale: 'uz',
    audience: 'Xaridor', stage: 'Awareness', eyebrow: 'GPTBot Market',
    title: 'Sizga nima kerakligini yozing',
    subtitle: 'GPTBot ulangan do‘konlar katalogidan mos mahsulotlarni topadi.',
    bullets: ['Narx va qoldiq — katalogdan', 'Tasdiqlangan ma’lumotlarni solishtirish'],
    cta: 'GPTBotni ochish', source: UZ_SOURCE, truthStatus: 'Product truth; native review pending',
    approvalState: 'Draft ready; native sign-off required',
    alt: 'GPTBot Marketda so‘rov bo‘yicha mahsulot topish kartasi.',
  },
  {
    id: 'buyer-static-uz-02-facts', group: 'buyer-static', locale: 'uz',
    audience: 'Xaridor', stage: 'Consideration', eyebrow: 'Taxmin emas, faktlar',
    title: 'Ma’lumot manbasi ko‘rinadi',
    subtitle: 'Har bir variantda do‘kon, narx, qoldiq va yangilangan sana bor.',
    bullets: ['O‘ylab topilgan chegirma yo‘q', 'Ma’lumot bo‘lmasa, GPTBot buni aytadi'],
    cta: 'Demoni ko‘rish', source: UZ_SOURCE, truthStatus: 'Product truth; native review pending',
    approvalState: 'Draft ready; native sign-off required',
    alt: 'GPTBot Marketdagi narx va qoldiq manbasi haqida karta.', accent: 'gold',
  },
  {
    id: 'buyer-static-uz-03-request', group: 'buyer-static', locale: 'uz',
    audience: 'Xaridor', stage: 'Conversion', eyebrow: 'Ariza, to‘lov emas',
    title: 'Avval sotuvchiga ariza',
    subtitle: 'Sotuvchi mahsulot, yetkazib berish va to‘lov usulini bevosita tasdiqlaydi.',
    bullets: ['GPTBot pul qabul qilmaydi', 'Mahsulot va bajarish uchun do‘kon javob beradi'],
    cta: 'Mahsulot topish', source: UZ_SOURCE, truthStatus: 'Product truth; native review pending',
    approvalState: 'Draft ready; native sign-off required',
    alt: 'GPTBotdagi rasmiylashtirish to‘lov emas, ariza ekanligi haqida karta.', accent: 'teal',
  },
  ...(['ru', 'uz'] as const).flatMap((locale) => {
    const ru = locale === 'ru';
    return [
      {
        id: `buyer-story-${locale}-01-search`, group: 'buyer-story' as const, locale,
        audience: ru ? 'Покупатель' : 'Xaridor', stage: 'Awareness',
        eyebrow: ru ? 'Сценарий • поиск' : 'Ssenariy • qidiruv',
        title: ru ? 'Один запрос вместо долгого каталога' : 'Uzun katalog o‘rniga bitta so‘rov',
        subtitle: ru ? 'Кадр первый: покупатель пишет потребность. Кадр второй: видит grounded shortlist.' : 'Birinchi kadr: xaridor ehtiyojini yozadi. Ikkinchi kadr: tasdiqlangan qisqa ro‘yxatni ko‘radi.',
        bullets: ru ? ['Показать ввод запроса', 'Показать два синтетических товара', 'Закрыть CTA'] : ['So‘rov kiritishni ko‘rsatish', 'Ikkita sintetik mahsulot', 'CTA bilan yakunlash'],
        cta: ru ? 'Попробовать в Telegram' : 'Telegramda sinash',
        source: ru ? RU_SOURCE : UZ_SOURCE, truthStatus: ru ? 'Approved product truth' : 'Product truth; native review pending',
        approvalState: ru ? 'Storyboard ready; production pending' : 'Draft storyboard; native sign-off required',
        alt: ru ? 'Вертикальный storyboard поиска товара.' : 'Mahsulot qidiruvi uchun vertikal storyboard.',
        width: 1080, height: 1920,
      },
      {
        id: `buyer-story-${locale}-02-compare`, group: 'buyer-story' as const, locale,
        audience: ru ? 'Покупатель' : 'Xaridor', stage: 'Consideration',
        eyebrow: ru ? 'Сценарий • сравнение' : 'Ssenariy • solishtirish',
        title: ru ? 'Сравнивайте только подтверждённое' : 'Faqat tasdiqlanganini solishtiring',
        subtitle: ru ? 'Цена, наличие, магазин и известные характеристики — в одной последовательности.' : 'Narx, qoldiq, do‘kon va ma’lum xususiyatlar — bitta ketma-ketlikda.',
        bullets: ru ? ['Цена', 'Наличие', 'Нет данных — так и написано'] : ['Narx', 'Qoldiq', 'Ma’lumot yo‘q — ochiq ko‘rsatiladi'],
        cta: ru ? 'Сравнить варианты' : 'Variantlarni solishtirish',
        source: ru ? RU_SOURCE : UZ_SOURCE, truthStatus: ru ? 'Approved product truth' : 'Product truth; native review pending',
        approvalState: ru ? 'Storyboard ready; production pending' : 'Draft storyboard; native sign-off required',
        alt: ru ? 'Вертикальный storyboard сравнения товаров.' : 'Mahsulotlarni solishtirish uchun vertikal storyboard.',
        width: 1080, height: 1920, accent: 'gold' as const,
      },
      {
        id: `buyer-story-${locale}-03-human`, group: 'buyer-story' as const, locale,
        audience: ru ? 'Покупатель' : 'Xaridor', stage: 'Conversion',
        eyebrow: ru ? 'Сценарий • человек рядом' : 'Ssenariy • inson yordam beradi',
        title: ru ? 'Когда нужен человек — подключается продавец' : 'Inson kerak bo‘lsa, sotuvchi ulanadi',
        subtitle: ru ? 'GPTBot передаёт вопрос. Продавец уточняет товар, доставку и оплату.' : 'GPTBot savolni uzatadi. Sotuvchi mahsulot, yetkazish va to‘lovni aniqlaydi.',
        bullets: ru ? ['Без автоплатежа', 'Без выдуманного срока ответа', 'Понятный следующий шаг'] : ['Avtoto‘lovsiz', 'O‘ylab topilgan javob muddatisiz', 'Aniq keyingi qadam'],
        cta: ru ? 'Задать вопрос' : 'Savol berish',
        source: ru ? RU_SOURCE : UZ_SOURCE, truthStatus: ru ? 'Approved product truth' : 'Product truth; native review pending',
        approvalState: ru ? 'Storyboard ready; production pending' : 'Draft storyboard; native sign-off required',
        alt: ru ? 'Вертикальный storyboard передачи вопроса продавцу.' : 'Savolni sotuvchiga uzatish uchun vertikal storyboard.',
        width: 1080, height: 1920, accent: 'teal' as const,
      },
    ];
  }),
  {
    id: 'buyer-demo-storyboard-20-30s-ru', group: 'buyer-education', locale: 'ru',
    audience: 'Покупатель и партнёр', stage: 'Demo', eyebrow: 'Демо • 20–30 секунд',
    title: 'Запрос → shortlist → заявка',
    subtitle: 'Монтажный лист: потребность, два синтетических результата, сравнение, запрос продавцу, честный финал.',
    bullets: ['0–4 с: потребность', '5–13 с: каталог и факты', '14–20 с: сравнение', '21–30 с: заявка, не оплата'],
    cta: 'Открыть GPTBot', source: RU_SOURCE, truthStatus: 'Synthetic demo; no performance claim',
    approvalState: 'Storyboard ready; video not rendered',
    alt: 'Storyboard короткого правдивого демо GPTBot Market.', width: 1440, height: 900,
  },
  {
    id: 'buyer-knows-does-not-know-ru', group: 'buyer-education', locale: 'ru',
    audience: 'Покупатель', stage: 'Trust', eyebrow: 'Что GPTBot знает',
    title: 'Каталог знает. Неизвестное не придумывает.',
    subtitle: 'Знает: цену, наличие, магазин, сохранённые характеристики. Не знает без продавца: сроки доставки, финальное подтверждение, условия оплаты.',
    bullets: ['Источник указан', 'Пробелы видимы', 'Человек доступен'],
    cta: 'Проверить на демо', source: RU_SOURCE, truthStatus: 'Approved trust truth',
    approvalState: 'Ready; launch not authorized',
    alt: 'Карусель о том, что GPTBot знает и чего не знает.', accent: 'gold',
  },
  {
    id: 'buyer-comparison-creative-ru', group: 'buyer-education', locale: 'ru',
    audience: 'Покупатель', stage: 'Consideration', eyebrow: 'Сравнение',
    title: 'Два варианта. Четыре факта.',
    subtitle: 'Синтетический пример: сравнение цены, наличия, магазина и подтверждённого совпадения.',
    bullets: ['Демо-товар A • 249 000 сум', 'Демо-товар B • 279 000 сум', 'Без рейтингов и «лучшего выбора»'],
    cta: 'Сравнить в GPTBot', source: RU_SOURCE, truthStatus: 'Clearly labelled synthetic example',
    approvalState: 'Ready; launch not authorized',
    alt: 'Синтетическое сравнение двух товаров без рейтингов.', accent: 'teal',
  },
  {
    id: 'buyer-zero-result-ru', group: 'buyer-education', locale: 'ru',
    audience: 'Покупатель', stage: 'Recovery', eyebrow: 'Честный нулевой результат',
    title: 'Подходящего товара нет в каталоге',
    subtitle: 'GPTBot предложит изменить запрос, открыть категории или позвать продавца.',
    bullets: ['Не подменяет результат рекламой', 'Не придумывает похожий товар', 'Сохраняет путь к человеку'],
    cta: 'Изменить запрос', source: RU_SOURCE, truthStatus: 'Approved recovery truth',
    approvalState: 'Ready; launch not authorized',
    alt: 'Карточка честного нулевого результата поиска.',
  },
  {
    id: 'seller-catalog-import-result-ru', group: 'seller-kit', locale: 'ru',
    audience: 'Каталог-менеджер', stage: 'Onboarding', eyebrow: 'Синтетический импорт',
    title: 'Результат импорта виден до публикации',
    subtitle: 'Демо-интерфейс разделяет принятые строки и причины отклонения. Ничего не публикуется автоматически.',
    bullets: ['Принято: [DEMO]', 'Отклонено: нет цены / неверная UZS / duplicate SKU', 'Нужна проверка владельца каталога'],
    cta: 'Открыть отклонения', source: 'Pilot import validator contract', truthStatus: 'Synthetic UI; runtime-backed reject reasons',
    approvalState: 'Ready for owner inputs',
    alt: 'Синтетический результат импорта каталога с причинами отклонения.', width: 1440, height: 900,
  },
  {
    id: 'seller-catalog-preview-signoff-ru', group: 'seller-kit', locale: 'ru',
    audience: 'Владелец каталога', stage: 'Onboarding', eyebrow: 'Проверка перед активацией',
    title: 'Карточки сначала подтверждаются',
    subtitle: 'Демо-превью показывает цену, остаток, media-статус, категорию и дату обновления до финального sign-off.',
    bullets: ['Фото: approved file_id или решение без фото', 'Остаток: подтверждённый baseline', 'Публикация: только после отдельной команды'],
    cta: 'Зафиксировать sign-off', source: 'Catalog and safe-media contracts', truthStatus: 'Synthetic UI; no self-service activation',
    approvalState: 'Ready for owner inputs',
    alt: 'Синтетическое превью товарной карточки перед подтверждением владельцем.', width: 1440, height: 900, accent: 'teal',
  },
  {
    id: 'seller-pilot-one-pager-ru', group: 'seller-kit', locale: 'ru',
    audience: 'Владелец магазина', stage: 'Qualification', eyebrow: 'Sotuvchi by GPTBot',
    title: 'Закрытый пилот для проверенного каталога',
    subtitle: 'GPTBot помогает покупателям находить товары и передаёт магазину запросы, где нужен человек.',
    bullets: ['Подключение только после проверки', 'Оплата и выполнение — у продавца', 'Срок, цена и результат пилота согласуются отдельно'],
    cta: 'Подать заявку на пилот', source: RU_SOURCE, truthStatus: 'Offer without invented fee or guarantee',
    approvalState: 'Ready for owner inputs',
    alt: 'Одностраничное предложение закрытого пилота Sotuvchi.',
  },
  {
    id: 'seller-qualification-checklist-ru', group: 'seller-kit', locale: 'ru',
    audience: 'Владелец магазина', stage: 'Qualification', eyebrow: 'Кому подходит пилот',
    title: 'Проверьте готовность магазина',
    subtitle: 'Низкорисковая категория, понятные SKU, стабильные цены и ответственный продавец.',
    bullets: ['10–30 согласованных товаров', 'Целые цены в UZS и базовый остаток', 'Контакт владельца и назначенные роли'],
    cta: 'Собрать вводные', source: RU_SOURCE, truthStatus: 'Owner gate requirements',
    approvalState: 'Ready for owner inputs',
    alt: 'Чек-лист квалификации магазина для пилота Sotuvchi.', accent: 'gold',
  },
  {
    id: 'seller-prepare-card-ru', group: 'seller-kit', locale: 'ru',
    audience: 'Команда магазина', stage: 'Onboarding', eyebrow: 'Что подготовить',
    title: 'Каталог, остатки, роли',
    subtitle: 'До подключения подготовьте утверждённый источник товарных данных и операционных владельцев.',
    bullets: ['Название, цена, наличие, категория', 'Одобренные фото или решение без фото', 'Support owner, incident lead, daily reviewer'],
    cta: 'Открыть шаблон', source: RU_SOURCE, truthStatus: 'Owner gate requirements',
    approvalState: 'Ready for owner inputs',
    alt: 'Карточка подготовки данных и ролей для пилота Sotuvchi.', accent: 'teal',
  },
  {
    id: 'seller-catalog-quality-guide-ru', group: 'seller-kit', locale: 'ru',
    audience: 'Каталог-менеджер', stage: 'Onboarding', eyebrow: 'Качество каталога',
    title: 'Одна карточка — один проверяемый товар',
    subtitle: 'Импорт отклоняет пропущенную цену, неверную валюту, дубликат SKU и небезопасную media-ссылку.',
    bullets: ['Цена — целое число UZS', 'Наличие — явный статус', 'Характеристики — только подтверждённые'],
    cta: 'Проверить импорт', source: 'Catalog validation contract and pilot import validator', truthStatus: 'Runtime-backed',
    approvalState: 'Ready for owner inputs',
    alt: 'Руководство по качеству товарного каталога.',
  },
  {
    id: 'seller-photo-standard-ru', group: 'seller-kit', locale: 'ru',
    audience: 'Контент-менеджер', stage: 'Onboarding', eyebrow: 'Стандарт фото',
    title: 'Чистый товар, честный цвет, без чужих брендов',
    subtitle: 'Используйте одобренные изображения магазина или зафиксируйте решение работать без фото.',
    bullets: ['Нейтральный фон', 'Товар целиком и без водяных знаков', 'Telegram file_id только после безопасной загрузки'],
    cta: 'Подготовить фото', source: 'Safe media contract and imagery rules', truthStatus: 'Production-safe guidance',
    approvalState: 'Ready for owner inputs',
    alt: 'Стандарт безопасных фотографий товара.', accent: 'gold',
  },
  {
    id: 'seller-verification-explainer-ru', group: 'seller-kit', locale: 'ru',
    audience: 'Владелец магазина', stage: 'Trust', eyebrow: 'Зачем нужна проверка',
    title: 'Проверяется владелец и источник данных',
    subtitle: 'Кнопка интереса не создаёт магазин и не выдаёт роль продавца.',
    bullets: ['Авторизация — только на сервере', 'Каталог связывается с одним tenant', 'Покупатель не может повысить себе права'],
    cta: 'Узнать о подключении', source: 'Authorization and tenant-isolation contracts', truthStatus: 'Runtime-backed',
    approvalState: 'Ready',
    alt: 'Объяснение проверки продавца и каталога.', accent: 'teal',
  },
  {
    id: 'seller-daily-cockpit-guide-ru', group: 'seller-kit', locale: 'ru',
    audience: 'Продавец', stage: 'Operations', eyebrow: 'Ежедневная работа',
    title: 'Сначала исключения, затем счётчики',
    subtitle: 'Открытые вопросы и сегодняшние заявки идут выше общего числа опубликованных товаров.',
    bullets: ['Ответить на вопрос', 'Проверить новую заявку', 'Обновить каталог у утверждённого источника'],
    cta: 'Открыть панель', source: 'Seller dashboard runtime copy', truthStatus: 'Runtime-backed; stale-stock signal pending policy',
    approvalState: 'Ready for verified seller only',
    alt: 'Руководство по ежедневной панели продавца.',
  },
  {
    id: 'seller-response-sla-template-ru', group: 'seller-kit', locale: 'ru',
    audience: 'Pilot owner', stage: 'Operations', eyebrow: 'Шаблон SLA',
    title: 'Срок ответа заполняет владелец пилота',
    subtitle: 'Не публикуйте обещание, пока ответственный и окно работы не подтверждены.',
    bullets: ['Ответственный: [ROLE]', 'Рабочее окно: [OWNER INPUT]', 'Эскалация: [ROLE]'],
    cta: 'Согласовать SLA', source: 'Owner input gate', truthStatus: 'Template; no SLA claimed',
    approvalState: 'Blocked on owner input',
    alt: 'Шаблон карточки SLA без придуманного срока.', accent: 'gold',
  },
  {
    id: 'seller-pilot-result-template-ru', group: 'seller-kit', locale: 'ru',
    audience: 'Pilot owner', stage: 'Review', eyebrow: 'Шаблон результата пилота',
    title: 'Факты, ограничения, решение',
    subtitle: 'Заполняется только после реального пилота. Публичным доказательством сейчас не является.',
    bullets: ['Grounded shortlist → qualified next step', 'Ошибки цены и остатка', 'Продолжить, изменить или остановить'],
    cta: 'Заполнить после пилота', source: 'Metric dictionary template', truthStatus: 'Empty template; no success claim',
    approvalState: 'Template ready; evidence unavailable',
    alt: 'Пустой шаблон отчёта о результате пилота.', accent: 'teal',
  },
  {
    id: 'telegram-buyer-preview-ru', group: 'telegram', locale: 'ru',
    audience: 'Покупатель', stage: 'Public identity', eyebrow: 'Telegram preview',
    title: 'Найдите товар по обычному запросу',
    subtitle: 'Синтетическое превью карточки: фото, цена, наличие, магазин, обновление.',
    bullets: ['Заказать', 'Сравнить', 'Запрос — не оплата'],
    cta: 'Открыть бота', source: RU_SOURCE, truthStatus: 'Synthetic media preview',
    approvalState: 'Ready; BotFather mutation not authorized',
    alt: 'Превью покупательской карточки GPTBot Market.', width: 1200, height: 628,
  },
  {
    id: 'telegram-seller-preview-ru', group: 'telegram', locale: 'ru',
    audience: 'Продавец', stage: 'Public identity', eyebrow: 'Sotuvchi preview',
    title: 'Открытые вопросы — первыми',
    subtitle: 'Синтетический вид ежедневной панели без реального магазина и без выдуманных метрик.',
    bullets: ['Вопросы', 'Заявки сегодня', 'Опубликованные товары'],
    cta: 'Узнать о пилоте', source: RU_SOURCE, truthStatus: 'Synthetic operating preview',
    approvalState: 'Ready; BotFather mutation not authorized',
    alt: 'Синтетическое превью панели продавца Sotuvchi.', width: 1200, height: 628, accent: 'teal',
  },
  {
    id: 'telegram-example-prompt-ru', group: 'telegram', locale: 'ru',
    audience: 'Покупатель', stage: 'Activation', eyebrow: 'Пример запроса',
    title: '«Нужна настольная лампа до 300 000 сум»',
    subtitle: 'Добавьте категорию, характеристику или бюджет — GPTBot покажет только то, что есть в подключённом каталоге.',
    bullets: ['Название или категория', 'Важная характеристика', 'Бюджет в сумах'],
    cta: 'Скопировать идею', source: RU_SOURCE, truthStatus: 'Synthetic prompt example',
    approvalState: 'Ready',
    alt: 'Карточка с примером запроса для GPTBot Market.', accent: 'gold',
  },
  {
    id: 'website-facts-diagram', group: 'website', locale: 'neutral',
    audience: 'Buyer and partner', stage: 'Trust', eyebrow: 'How facts travel',
    title: 'Approved catalog → GPTBot → buyer',
    subtitle: 'Price, availability, specifications and store identity remain grounded in the connected catalog.',
    bullets: ['No catalog fact → no claim', 'Unknown details go to the seller', 'Global analytics excludes raw messages'],
    cta: 'Trust Center', source: 'Catalog grounding and privacy contracts', truthStatus: 'Runtime-backed',
    approvalState: 'Ready',
    alt: 'Diagram of grounded facts moving from approved catalog through GPTBot to buyer.', width: 1440, height: 900,
  },
  {
    id: 'website-request-timeline', group: 'website', locale: 'neutral',
    audience: 'Buyer', stage: 'Conversion', eyebrow: 'Request, not payment',
    title: 'Choose → send request → seller confirms',
    subtitle: 'GPTBot does not take payment. The seller confirms the item, fulfillment and payment method directly.',
    bullets: ['Buyer chooses', 'GPTBot records one request', 'Seller is the next actor'],
    cta: 'See the flow', source: 'Checkout runtime contract', truthStatus: 'Runtime-backed',
    approvalState: 'Ready',
    alt: 'Timeline showing a request being sent to the seller without payment.', width: 1440, height: 900, accent: 'teal',
  },
  {
    id: 'website-trust-illustration', group: 'website', locale: 'neutral',
    audience: 'Buyer and seller', stage: 'Trust', eyebrow: 'Responsibility map',
    title: 'GPTBot explains. The store fulfils.',
    subtitle: 'GPTBot presents catalog facts and routes a request. The store owns the product, confirmation, delivery and payment.',
    bullets: ['GPTBot: discovery and request routing', 'Store: product and fulfilment', 'Buyer: confirms directly with store'],
    cta: 'Read responsibilities', source: 'Trust Center source', truthStatus: 'Approved product truth',
    approvalState: 'Ready',
    alt: 'Responsibility map for GPTBot, the store and the buyer.', width: 1440, height: 900, accent: 'gold',
  },
];

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]!);
}

function wrap(value: string, max = 34): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (!line || `${line} ${word}`.length <= max) {
      line = line ? `${line} ${word}` : word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textLines(lines: readonly string[], x: number, y: number, size: number, lineHeight: number, weight = 500, fill = '#123b3a'): string {
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join('')}</text>`;
}

function assetSvg(asset: AssetDefinition): string {
  const width = asset.width ?? 1080;
  const height = asset.height ?? 1350;
  const isStory = height >= 1800;
  const isShort = height <= 700;
  const isWide = width >= 1400 && height <= 1000;
  const pad = Math.round(width * 0.075);
  const accent = asset.accent === 'teal'
    ? '#0f6b66'
    : asset.accent === 'gold'
      ? '#d09b3d'
      : '#f26b5b';
  const titleSize = isShort ? 56 : width >= 1400 ? 66 : 64;
  const titleLines = wrap(
    asset.title,
    isShort ? 36 : width >= 1400 ? 38 : 27,
  ).slice(0, isShort ? 2 : 4);
  const subtitleLines = wrap(
    asset.subtitle,
    isShort ? 70 : width >= 1400 ? 70 : 43,
  ).slice(0, isShort ? 2 : 5);
  const titleY = isStory ? 390 : isShort ? 310 : isWide ? 330 : 350;
  const subtitleY = titleY + titleLines.length * (titleSize + 10) + 40;
  const bulletsY = subtitleY + subtitleLines.length * 48 + 60;
  const footerY = height - 105;
  const bulletGap = isStory ? 100 : 82;
  if (isShort) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(asset.title)}</title>
  <desc id="desc">${escapeXml(asset.alt)}</desc>
  <rect width="${width}" height="${height}" rx="36" fill="#f7f1e7"/>
  <circle cx="${width - pad - 26}" cy="${pad}" r="18" fill="${accent}"/>
  <path d="M${pad} ${pad}h84a28 28 0 0 1 28 28v84a28 28 0 0 1-28 28H${pad}z" fill="#123b3a"/>
  <path d="M${pad + 27} ${pad + 39}h58M${pad + 27} ${pad + 66}h42M${pad + 27} ${pad + 93}h53" stroke="#f7f1e7" stroke-width="12" stroke-linecap="round"/>
  ${textLines([asset.eyebrow.toUpperCase()], pad + 140, pad + 66, 24, 30, 700, accent)}
  ${textLines(titleLines, pad, titleY, titleSize, 64, 700)}
  ${textLines(subtitleLines, pad, 440, 26, 34, 400, '#315956')}
  <rect x="${pad}" y="520" width="510" height="72" rx="36" fill="#123b3a"/>
  ${textLines([asset.cta], pad + 44, 566, 26, 32, 700, '#ffffff')}
  ${textLines(['SYNTHETIC / TEMPLATE'], width - pad - 280, 566, 18, 24, 700, '#5b7774')}
</svg>`;
  }
  if (isWide) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(asset.title)}</title>
  <desc id="desc">${escapeXml(asset.alt)}</desc>
  <rect width="${width}" height="${height}" rx="36" fill="#f7f1e7"/>
  <circle cx="${width - pad - 26}" cy="${pad}" r="18" fill="${accent}"/>
  <path d="M${pad} ${pad}h84a28 28 0 0 1 28 28v84a28 28 0 0 1-28 28H${pad}z" fill="#123b3a"/>
  <path d="M${pad + 27} ${pad + 39}h58M${pad + 27} ${pad + 66}h42M${pad + 27} ${pad + 93}h53" stroke="#f7f1e7" stroke-width="12" stroke-linecap="round"/>
  ${textLines([asset.eyebrow.toUpperCase()], pad + 140, pad + 66, 24, 30, 700, accent)}
  ${textLines(titleLines, pad, 360, titleSize, 72, 700)}
  ${textLines(subtitleLines, pad, 485, 34, 46, 400, '#315956')}
  ${asset.bullets.slice(0, 3).map((bullet, index) => `<circle cx="${pad + 13}" cy="${610 + index * 58 - 10}" r="10" fill="${accent}"/>${textLines(wrap(bullet, 62).slice(0, 1), pad + 42, 610 + index * 58, 28, 36, 600)}`).join('')}
  <rect x="${pad}" y="770" width="510" height="80" rx="40" fill="#123b3a"/>
  ${textLines([asset.cta], pad + 44, 821, 26, 32, 700, '#ffffff')}
  ${textLines(['SYNTHETIC / TEMPLATE'], width - pad - 280, 821, 18, 24, 700, '#5b7774')}
</svg>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(asset.title)}</title>
  <desc id="desc">${escapeXml(asset.alt)}</desc>
  <rect width="${width}" height="${height}" rx="36" fill="#f7f1e7"/>
  <circle cx="${width - pad - 36}" cy="${pad + 18}" r="18" fill="${accent}"/>
  <path d="M${pad} ${pad + 52}h84a28 28 0 0 1 28 28v84a28 28 0 0 1-28 28H${pad}z" fill="#123b3a"/>
  <path d="M${pad + 27} ${pad + 91}h58M${pad + 27} ${pad + 118}h42M${pad + 27} ${pad + 145}h53" stroke="#f7f1e7" stroke-width="12" stroke-linecap="round"/>
  ${textLines([asset.eyebrow.toUpperCase()], pad + 140, pad + 116, 24, 30, 700, accent)}
  ${textLines(titleLines, pad, titleY, titleSize, titleSize + 10, 700)}
  ${textLines(subtitleLines, pad, subtitleY, 34, 48, 400, '#315956')}
  ${asset.bullets.slice(0, 4).map((bullet, index) => {
    const y = bulletsY + index * bulletGap;
    const lines = wrap(bullet, width >= 1400 ? 62 : 36).slice(0, 2);
    return `<circle cx="${pad + 13}" cy="${y - 10}" r="10" fill="${accent}"/>${textLines(lines, pad + 42, y, 30, 40, 600)}`;
  }).join('')}
  <rect x="${pad}" y="${height - 240}" width="${Math.min(width - pad * 2, 510)}" height="92" rx="46" fill="#123b3a"/>
  ${textLines([asset.cta], pad + 44, height - 181, 27, 34, 700, '#ffffff')}
  <line x1="${pad}" y1="${footerY - 44}" x2="${width - pad}" y2="${footerY - 44}" stroke="#d8cfc1" stroke-width="2"/>
  ${textLines(['GPTBot Market  •  SYNTHETIC / TEMPLATE'], pad, footerY, 18, 24, 700, '#5b7774')}
</svg>`;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const manifest = [];
  for (const asset of assets) {
    const svg = assetSvg(asset);
    const svgName = `${asset.id}.svg`;
    const pngName = `${asset.id}.png`;
    fs.writeFileSync(path.join(OUTPUT, svgName), svg, 'utf8');
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(
      path.join(OUTPUT, pngName),
    );
    manifest.push({
      ...asset,
      editableMaster: `/assets/market/creative/${svgName}`,
      export: `/assets/market/creative/${pngName}`,
      accessibleOutput: 'SVG title/desc; descriptive alt text in manifest',
    });
  }
  fs.writeFileSync(
    path.join(OUTPUT, 'asset-manifest.json'),
    `${JSON.stringify({ generatedAt: '2026-08-01', assets: manifest }, null, 2)}\n`,
    'utf8',
  );
  const thumbWidth = 240;
  const thumbHeight = 300;
  const columns = 5;
  const rows = Math.ceil(assets.length / columns);
  const thumbnails = await Promise.all(assets.map(async (asset, index) => ({
    input: await sharp(path.join(OUTPUT, `${asset.id}.png`))
      .resize(thumbWidth - 20, thumbHeight - 20, {
        fit: 'contain',
        background: '#e9e1d5',
      })
      .png()
      .toBuffer(),
    left: (index % columns) * thumbWidth + 10,
    top: Math.floor(index / columns) * thumbHeight + 10,
  })));
  await sharp({
    create: {
      width: columns * thumbWidth,
      height: rows * thumbHeight,
      channels: 3,
      background: '#e9e1d5',
    },
  }).composite(thumbnails).webp({ quality: 88 }).toFile(
    path.join(OUTPUT, 'creative-contact-sheet.webp'),
  );
  for (const name of [
    'og-market-ru',
    'og-market-uz',
    'og-trust-ru',
    'og-trust-uz',
  ]) {
    await sharp(path.join(ROOT, 'public', 'assets', 'market', `${name}.svg`))
      .png({ compressionLevel: 9 })
      .toFile(path.join(ROOT, 'public', 'assets', 'market', `${name}.png`));
  }
  console.log(`Generated ${assets.length} editable SVG masters and ${assets.length} PNG exports.`);
}

await main();
