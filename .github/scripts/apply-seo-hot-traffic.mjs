import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TODAY = '2026-08-31';

function absolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(absolute(relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  fs.writeFileSync(absolute(relativePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  console.log(`[seo-hot-traffic] updated ${relativePath}`);
}

function textOf(block) {
  if (!block || typeof block !== 'object') return '';
  const chunks = [];
  if (typeof block.text === 'string') chunks.push(block.text);
  if (Array.isArray(block.items)) chunks.push(...block.items.filter((item) => typeof item === 'string'));
  if (Array.isArray(block.rows)) {
    for (const row of block.rows) {
      if (Array.isArray(row)) chunks.push(...row.filter((item) => typeof item === 'string'));
    }
  }
  return chunks.join(' ');
}

function replaceBlockAfterHeading(blocks, heading, replacement) {
  const headingIndex = blocks.findIndex(
    (block) => (block.type === 'h2' || block.type === 'h3') && block.text === heading,
  );
  if (headingIndex < 0) throw new Error(`Missing heading: ${heading}`);
  const targetIndex = blocks.findIndex(
    (block, index) => index > headingIndex && !['h2', 'h3'].includes(block.type),
  );
  if (targetIndex < 0) throw new Error(`Missing body block after heading: ${heading}`);
  blocks[targetIndex] = replacement;
}

function insertBeforeHeading(blocks, heading, additions) {
  const index = blocks.findIndex(
    (block) => (block.type === 'h2' || block.type === 'h3') && block.text === heading,
  );
  if (index < 0) throw new Error(`Missing insertion heading: ${heading}`);
  blocks.splice(index, 0, ...additions);
}

function replaceFaq(faq, question, next) {
  const index = faq.findIndex((item) => item.q === question);
  if (index < 0) throw new Error(`Missing FAQ question: ${question}`);
  faq[index] = next;
}

function updateInternetAdvertisingRu() {
  const file = 'content/pages/ru/internet-reklama-tashkent.json';
  const page = readJson(file);

  page.title = 'Интернет-реклама в Ташкенте под заявки | GPTBot.uz';
  page.description =
    'Настройка интернет-рекламы в Ташкенте: Google Ads, Meta и Telegram, посадочная страница, аналитика и передача заявок менеджеру. Получите план запуска.';
  page.ogTitle = 'Интернет-реклама в Ташкенте: от канала до заявки';
  page.ogDescription =
    'Собираем платное привлечение как измеримую систему: канал, оффер, посадочная страница, событие конверсии, передача обращения и обратная связь из продаж.';
  page.heroSubtitle =
    'Проектируем платное привлечение как измеримую систему: выбираем канал под сформированный или новый спрос, готовим оффер и посадочную страницу, фиксируем события конверсии и передаём обращения менеджеру или в CRM.';
  page.heroTrust = [
    'Канал под задачу и спрос',
    'Рекламный бюджет отдельно',
    'UTM и события конверсии',
    'Без гарантий продаж',
  ];

  replaceBlockAfterHeading(page.bodyBlocks, 'Google Ads и контекстная реклама', {
    type: 'linkp',
    text: 'Когда пользователь уже ищет товар или услугу, подходит {context}. На отдельной странице разобраны структура кампаний, семантика, минус-слова, география, посадочная страница и измерение заявок.',
    links: [
      {
        token: 'context',
        target: '/ru/kontekstnaya-reklama-tashkent/',
        anchor: 'контекстная реклама в Ташкенте',
      },
    ],
  });
  replaceBlockAfterHeading(page.bodyBlocks, 'Instagram, Facebook и Meta Ads', {
    type: 'linkp',
    text: 'Для визуальных офферов, нового спроса и тестирования аудиторий используем {target}. Результат зависит от связки креатива, сегмента, первого экрана, события конверсии и скорости обработки обращения.',
    links: [
      {
        token: 'target',
        target: '/ru/targetirovannaya-reklama-tashkent/',
        anchor: 'таргетированную рекламу в Ташкенте',
      },
    ],
  });
  replaceBlockAfterHeading(page.bodyBlocks, 'Telegram Ads и реклама в Telegram', {
    type: 'linkp',
    text: 'Для аудитории внутри Telegram доступны официальный кабинет, посевы и прямые размещения — это разные модели закупки. На странице {telegram} показано, как выбрать формат и связать переход с ботом, сайтом или менеджером.',
    links: [
      {
        token: 'telegram',
        target: '/ru/telegram-ads-uzbekistan/',
        anchor: 'Telegram Ads в Узбекистане',
      },
    ],
  });

  const aiBlock = page.bodyBlocks.find(
    (block) => block.type === 'p' && textOf(block).startsWith('Когда пользователь кликает по рекламе'),
  );
  if (!aiBlock) throw new Error('Missing AI post-click block');
  aiBlock.text =
    'После клика пользователь ожидает быстрый и понятный следующий шаг. AI-бот может начать первичный диалог, задать согласованные вопросы и передать контекст менеджеру. Это сокращает задержку первого ответа, но влияние на конверсию и стоимость квалифицированного обращения нужно проверять по данным конкретного проекта.';

  const crmBlock = page.bodyBlocks.find(
    (block) => block.type === 'p' && textOf(block).startsWith('Все заявки из рекламы должны попадать'),
  );
  if (!crmBlock) throw new Error('Missing CRM transfer block');
  crmBlock.text =
    'Обращения из рекламы стоит передавать в согласованный рабочий контур: Telegram-группу, Google Sheets или CRM. В смете фиксируются обязательные поля, подтверждение доставки, повторные попытки, дедупликация и порядок ручного восстановления — это снижает риск потери обращения, но не заменяет мониторинг и регламент менеджеров.';

  page.bodyBlocks = page.bodyBlocks.filter(
    (block) =>
      !(
        block.type === 'p' &&
        /Рыночные ориентиры по Ташкенту|по открытым данным агентств-конкурентов|минимальном бюджете площадки около 500 €/i.test(
          textOf(block),
        )
      ),
  );

  insertBeforeHeading(page.bodyBlocks, 'Как понять, что реклама работает', [
    {
      type: 'h2',
      text: 'Что входит в смету и что оплачивается отдельно',
    },
    {
      type: 'table',
      headers: ['Контур', 'Что фиксируем до старта', 'Как считается'],
      rows: [
        [
          'Работа команды',
          'Стратегия канала, настройка, запуск, отчётность и оптимизация',
          'Фиксированный объём или ежемесячное ведение',
        ],
        [
          'Рекламный бюджет',
          'Лимит, валюта, владелец кабинета и порядок пополнения',
          'Оплачивается площадке отдельно',
        ],
        [
          'Креативы и контент',
          'Количество форматов, адаптаций и итераций',
          'Включается в scope или считается отдельным пакетом',
        ],
        [
          'Посадочная страница',
          'Новая страница, доработка существующей или переход в мессенджер',
          'По фактическому объёму разработки',
        ],
        [
          'Аналитика и CRM',
          'События, UTM, поля лида, статусы и обратная передача результата',
          'От базовой настройки до отдельной интеграции',
        ],
        [
          'Сторонние сервисы',
          'Коллтрекинг, CRM, коннекторы, реселлерские комиссии',
          'По тарифам поставщиков, если применимо',
        ],
      ],
    },
    {
      type: 'p',
      text: 'Коммерческое предложение должно разделять эти строки. Цена «ведение рекламы» без списка каналов, креативов, посадочных работ, аналитики и исключений не позволяет корректно сравнить подрядчиков.',
    },
  ]);

  insertBeforeHeading(page.bodyBlocks, 'Для каких бизнесов подходит интернет-реклама', [
    {
      type: 'linkp',
      text: 'Когда используются несколько каналов и решение о масштабировании зависит от качества лидов и продаж, нужен {performance}. Если сначала требуется установить причину слабого результата, начните с {audit}.',
      links: [
        {
          token: 'performance',
          target: '/ru/performance-marketing-tashkent/',
          anchor: 'performance-маркетинга с обратной связью из CRM',
        },
        {
          token: 'audit',
          target: '/ru/marketingovyi-audit-tashkent/',
          anchor: 'маркетингового аудита',
        },
      ],
    },
  ]);

  const summary = page.bodyBlocks.find(
    (block) =>
      block.type === 'list' &&
      Array.isArray(block.items) &&
      block.items.some((item) => /подхватывает каждого/i.test(item)),
  );
  if (!summary) throw new Error('Missing advertising summary list');
  summary.items = [
    'Канал выбирается по задаче, состоянию спроса и допустимой экономике теста.',
    'Посадочная страница и сообщение объявления должны обещать одно и то же.',
    'AI-бот может сократить задержку первого ответа и передать контекст менеджеру.',
    'Контактный клик, отправленная заявка, квалифицированный лид и продажа измеряются отдельно.',
    'Влияние на CPL и продажи подтверждается только данными проекта, а не обещанием подрядчика.',
  ];

  replaceFaq(page.faq, 'Сколько стоит настройка и ведение рекламы по рынку Ташкента?', {
    q: 'Что должно входить в смету на интернет-рекламу?',
    a: 'В смете отдельно фиксируются работа по настройке и ведению, рекламный бюджет площадок, число креативов, посадочная страница, события аналитики, CRM-интеграция и сторонние сервисы. Так предложения можно сравнить по одинаковому объёму, а не только по одной итоговой цифре.',
  });
  replaceFaq(page.faq, 'Какой минимальный рекламный бюджет нужен?', {
    q: 'Как определить тестовый рекламный бюджет?',
    a: 'Бюджет рассчитывают от цели, географии, доступного объёма спроса, ожидаемой цены клика, конверсии страницы и допустимой стоимости квалифицированного обращения. До запуска фиксируют срок теста и правило остановки; универсального минимума для всех ниш нет.',
  });

  const clickFaqIndexes = page.faq
    .map((item, index) => (/клики.*нет заявок|клики.*не даёт заявок/i.test(item.q) ? index : -1))
    .filter((index) => index >= 0);
  if (clickFaqIndexes.length > 1) {
    page.faq = page.faq.filter((_, index) => !clickFaqIndexes.slice(1).includes(index));
  }

  page.lastReviewedAt = TODAY;
  page.updatedAt = TODAY;
  writeJson(file, page);
}

function updateReviewsRu() {
  const file = 'content/pages/ru/otzyvy.json';
  const page = readJson(file);

  page.primaryKeyword = 'кейсы AI-ботов для бизнеса';
  page.secondaryKeywords = [
    'сценарии AI-бота для бизнеса',
    'примеры автоматизации заявок',
    'GPTBot кейсы',
    'как проверить работу чат-бота',
  ];
  page.h1 = 'Кейсы AI-ботов и сценарии автоматизации заявок';
  page.title = 'Кейсы AI-ботов для бизнеса | GPTBot.uz';
  page.description =
    'Обезличенные сценарии внедрения AI-ботов: что автоматизировать в клинике, салоне, магазине, учебном центре и как измерить результат проекта.';
  page.ogTitle = 'Кейсы AI-ботов и сценарии внедрения | GPTBot.uz';
  page.ogDescription =
    'Прозрачные обезличенные сценарии без выдуманных отзывов: задача, автоматизация, ограничения и метрика проверки.';
  page.breadcrumbLabel = 'Кейсы';
  page.heroTitle = 'Сценарии внедрения AI-ботов для бизнеса';
  page.heroSubtitle =
    'Ниже — обезличенные составные сценарии из типовых задач бизнеса. Это не публичные верифицированные отзывы и не обещание результата: эффект проверяется по согласованным событиям, качеству обращений и данным CRM.';
  page.ctaPrimaryLabel = 'Получить сценарий под нишу';

  page.bodyBlocks = [
    {
      type: 'p',
      text: 'На этой странице мы не публикуем именные отзывы, оценки или цифры без проверяемого источника и разрешения клиента. Вместо этого показываем типовые сценарии: исходную проблему, роль AI-бота, границы автоматизации и метрику, по которой проект можно принять.',
    },
    {
      type: 'h2',
      text: 'Сценарии по нишам',
    },
    {
      type: 'table',
      headers: ['Ниша', 'Исходная задача', 'Что автоматизирует бот', 'Что измерять'],
      rows: [
        [
          'Клиника',
          'Обращения вечером и повторяющиеся вопросы',
          'Первичный ответ, выбор услуги, сбор контакта, передача администратору',
          'Время первого ответа, доля переданных обращений, запись после контакта',
        ],
        [
          'Салон красоты',
          'Запросы из Direct без структуры',
          'Услуга, филиал, удобное время и контакт по согласованному сценарию',
          'Завершённые диалоги, подтверждённые записи, причины отказа',
        ],
        [
          'Учебный центр',
          'Много вопросов о курсах и расписании',
          'Курс, возраст, уровень, филиал и запрос на пробный урок',
          'Квалифицированные заявки, запись на урок, источник обращения',
        ],
        [
          'Магазин',
          'Повторяющиеся вопросы о товаре и доставке',
          'Поиск по подтверждённому каталогу, сбор состава заказа, эскалация',
          'Точность ответов, переданные корзины, заказы после проверки менеджером',
        ],
        [
          'Недвижимость',
          'Риелтор получает заявку без бюджета и района',
          'Бюджет, район, тип объекта, срок и контакт',
          'Полнота карточки, время до ответа риелтора, назначенные показы',
        ],
        [
          'Доставка и HoReCa',
          'Пиковая нагрузка и потеря контекста',
          'Состав заказа, адрес, время, комментарий и передача оператору',
          'Ошибки передачи, подтверждённые заказы, ручные исправления',
        ],
      ],
    },
    {
      type: 'h2',
      text: 'Как читать эти кейсы',
    },
    {
      type: 'list',
      items: [
        'Это обезличенные составные сценарии, а не дословные отзывы конкретных клиентов.',
        'Бот не заменяет менеджера там, где нужны переговоры, медицинское решение, сложная смета или подтверждение заказа.',
        'Показатели до запуска фиксируются как baseline; после запуска сравниваются одинаковые периоды и одинаковые этапы воронки.',
        'Клик по контакту не считается квалифицированным лидом, а заявка не считается продажей.',
        'Любая интеграция принимается по тестам доставки, дедупликации, ошибок и ручного восстановления.',
      ],
    },
    {
      type: 'h2',
      text: 'Какие доказательства запросить до покупки',
    },
    {
      type: 'list',
      items: [
        'Демо на вашем сценарии с примерами корректного ответа и честного отказа.',
        'Список источников знаний и правило обновления цен, наличия и условий.',
        'Карту данных: какие поля собираются, куда передаются и кто имеет доступ.',
        'Критерии приёмки, включая повторную отправку, недоступность CRM и эскалацию человеку.',
        'Определение бизнес-событий: контакт, заявка, квалификация, встреча, продажа.',
        'Условия поддержки, мониторинга, владения аккаунтами и выгрузки данных при завершении работ.',
      ],
    },
    {
      type: 'h2',
      text: 'Как фиксируем результат проекта',
    },
    {
      type: 'p',
      text: 'До разработки согласуем контрольный сценарий и события воронки. После запуска проверяем не количество сообщений, а полноту собранного контекста, долю корректной передачи, скорость первого ответа, качество квалификации и подтверждённый результат в CRM. Если данных недостаточно, это фиксируется как ограничение, а не заменяется оценкой «стало лучше».',
    },
    {
      type: 'cta',
      text: 'Получить сценарий и критерии приёмки',
      href: 'https://t.me/XGame_changerx',
    },
    {
      type: 'h2',
      text: 'Коротко о главном',
    },
    {
      type: 'list',
      items: [
        'Публичный кейс должен отделять факт, модельный пример и гипотезу.',
        'Результат AI-бота измеряется на конкретном этапе воронки.',
        'Техническая доставка обращения и коммерческое качество лида — разные проверки.',
        'Отзыв, рейтинг или цифра публикуются только при наличии источника и разрешения.',
        'Сценарий под нишу можно проверить на демо до старта разработки.',
      ],
    },
  ];

  page.faq = [
    {
      q: 'Это реальные отзывы клиентов?',
      a: 'Нет. На этой странице размещены обезличенные составные сценарии типовых проектов, а не дословные публичные отзывы. Именной отзыв, рейтинг или измеримый результат может быть опубликован только после подтверждения источника и разрешения клиента.',
    },
    {
      q: 'Можно ли получить контакт клиента для рекомендации?',
      a: 'Только с отдельного согласия клиента. Мы не передаём контакты и коммерческие данные без разрешения. Вместо этого можно проверить демо, критерии приёмки и техническую схему проекта.',
    },
    {
      q: 'Какие метрики показывают пользу AI-бота?',
      a: 'Время первого ответа, доля завершённых сценариев, полнота переданных полей, квалифицированные заявки, ошибки и ручные исправления. Продажи и выручка учитываются отдельно по данным CRM или учётной системы.',
    },
    {
      q: 'Можно ли посмотреть сценарий для моей ниши?',
      a: 'Да. Подготовим демонстрационный маршрут, список вопросов, точки передачи менеджеру и критерии проверки без отправки реальных заявок.',
    },
  ];
  page.schemaTypes = ['Organization', 'WebSite', 'BreadcrumbList', 'FAQPage'];
  page.lastReviewedAt = TODAY;
  page.updatedAt = TODAY;
  writeJson(file, page);
}

function updateReviewsUz() {
  const file = 'content/pages/uz/sharhlar.json';
  const page = readJson(file);

  page.primaryKeyword = 'biznes uchun AI-bot keyslari';
  page.secondaryKeywords = [
    'AI-bot joriy etish ssenariylari',
    'murojaatlarni avtomatlashtirish misollari',
    'GPTBot keyslari',
    'chat-botni qanday tekshirish',
  ];
  page.h1 = 'AI-bot keyslari va murojaatlarni avtomatlashtirish ssenariylari';
  page.title = 'Biznes uchun AI-bot keyslari | GPTBot.uz';
  page.description =
    'Klinika, salon, do‘kon va o‘quv markazi uchun AI-bot ssenariylari: nimani avtomatlashtirish, qayerda menejer kerak va natijani qanday o‘lchash.';
  page.ogTitle = 'AI-bot keyslari va joriy etish ssenariylari | GPTBot.uz';
  page.ogDescription =
    'O‘ylab topilgan sharhlarsiz shaffof ssenariylar: vazifa, avtomatlashtirish, cheklov va tekshiruv metrikasi.';
  page.breadcrumbLabel = 'Keyslar';
  page.heroTitle = 'Biznes uchun AI-bot joriy etish ssenariylari';
  page.heroSubtitle =
    'Quyida biznesdagi odatiy vazifalardan tuzilgan anonim ssenariylar berilgan. Bular ommaviy tasdiqlangan sharhlar ham, natija va’dasi ham emas: ta’sir kelishilgan hodisalar, murojaat sifati va CRM ma’lumotlari bilan tekshiriladi.';
  page.ctaPrimaryLabel = 'Soham uchun ssenariy olish';

  page.bodyBlocks = [
    {
      type: 'p',
      text: 'Bu sahifada tekshiriladigan manba va mijoz ruxsatisiz ism, yulduzli baho yoki natija raqamini e’lon qilmaymiz. Buning o‘rniga boshlang‘ich muammo, AI-bot vazifasi, avtomatlashtirish chegarasi va qabul metrikasini ko‘rsatamiz.',
    },
    {
      type: 'h2',
      text: 'Sohalar bo‘yicha ssenariylar',
    },
    {
      type: 'table',
      headers: ['Soha', 'Boshlang‘ich vazifa', 'Bot nimani avtomatlashtiradi', 'Nimani o‘lchash kerak'],
      rows: [
        ['Klinika', 'Kechki murojaatlar va takroriy savollar', 'Birinchi javob, xizmatni tanlash, kontaktni yig‘ish va administratorga uzatish', 'Birinchi javob vaqti, uzatilgan murojaatlar, kontaktdan keyingi yozuv'],
        ['Go‘zallik saloni', 'Direct’dagi tartibsiz so‘rovlar', 'Xizmat, filial, qulay vaqt va kontaktni kelishilgan ssenariy bo‘yicha yig‘ish', 'Yakunlangan dialoglar, tasdiqlangan yozuvlar, rad etish sabablari'],
        ['O‘quv markazi', 'Kurs va jadval bo‘yicha ko‘p savol', 'Kurs, yosh, daraja, filial va sinov darsiga so‘rov', 'Malakali arizalar, darsga yozuv, murojaat manbasi'],
        ['Do‘kon', 'Tovar va yetkazib berish bo‘yicha takroriy savollar', 'Tasdiqlangan katalog bo‘yicha qidirish, buyurtma tarkibini yig‘ish, eskalatsiya', 'Javob aniqligi, uzatilgan savatlar, menejer tasdiqlagan buyurtmalar'],
        ['Ko‘chmas mulk', 'Rieltor byudjet va tumansiz ariza oladi', 'Byudjet, tuman, obyekt turi, muddat va kontakt', 'Kartochka to‘liqligi, rieltor javob vaqti, belgilangan ko‘riklar'],
        ['Yetkazib berish va HoReCa', 'Yuqori yuklama va kontekst yo‘qolishi', 'Buyurtma tarkibi, manzil, vaqt, izoh va operatorga uzatish', 'Uzatish xatolari, tasdiqlangan buyurtmalar, qo‘lda tuzatishlar'],
      ],
    },
    {
      type: 'h2',
      text: 'Bu keyslarni qanday o‘qish kerak',
    },
    {
      type: 'list',
      items: [
        'Bular aniq mijozning so‘zma-so‘z sharhi emas, anonimlashtirilgan tarkibiy ssenariylardir.',
        'Muzokara, tibbiy qaror, murakkab smeta yoki buyurtmani tasdiqlash kerak bo‘lsa, bot menejerni almashtirmaydi.',
        'Ishga tushirishdan oldin boshlang‘ich ko‘rsatkichlar qayd etiladi; keyin bir xil davr va bir xil voronka bosqichlari solishtiriladi.',
        'Kontaktga bosish malakali lid emas, yuborilgan ariza esa sotuv emas.',
        'Integratsiya yetkazish, takroriy yuborish, deduplikatsiya, xato va qo‘lda tiklash sinovlari bilan qabul qilinadi.',
      ],
    },
    {
      type: 'h2',
      text: 'Xariddan oldin qaysi dalillarni so‘rash kerak',
    },
    {
      type: 'list',
      items: [
        'Sizning ssenariyingiz bo‘yicha to‘g‘ri javob va halol rad etish misollari bilan demo.',
        'Bilim manbalari va narx, mavjudlik hamda shartlarni yangilash qoidasi.',
        'Ma’lumotlar xaritasi: qaysi maydonlar yig‘iladi, qayerga uzatiladi va kim kirish huquqiga ega.',
        'Qabul mezonlari: qayta yuborish, CRM ishlamasligi va inson operatoriga eskalatsiya.',
        'Biznes hodisalari ta’rifi: kontakt, ariza, malaka, uchrashuv va sotuv.',
        'Qo‘llab-quvvatlash, monitoring, akkauntlarga egalik va ish tugaganda ma’lumotlarni chiqarish shartlari.',
      ],
    },
    {
      type: 'h2',
      text: 'Loyiha natijasini qanday qayd etamiz',
    },
    {
      type: 'p',
      text: 'Ishlab chiqishdan oldin nazorat ssenariysi va voronka hodisalarini kelishamiz. Ishga tushgach xabarlar sonini emas, yig‘ilgan kontekst to‘liqligi, to‘g‘ri uzatish ulushi, birinchi javob tezligi, malaka sifati va CRM’dagi tasdiqlangan natijani tekshiramiz. Ma’lumot yetarli bo‘lmasa, “yaxshilandi” degan taxmin bilan almashtirmaymiz.',
    },
    {
      type: 'cta',
      text: 'Ssenariy va qabul mezonlarini olish',
      href: 'https://t.me/XGame_changerx',
    },
    {
      type: 'h2',
      text: 'Asosiy xulosalar',
    },
    {
      type: 'list',
      items: [
        'Ommaviy keys fakt, model misoli va gipotezani ajratishi kerak.',
        'AI-bot natijasi voronkaning aniq bosqichida o‘lchanadi.',
        'Murojaatni texnik yetkazish va lidning tijoriy sifati turli tekshiruvlardir.',
        'Sharh, reyting yoki raqam faqat manba va ruxsat bo‘lsa e’lon qilinadi.',
        'Sohaga mos ssenariyni ishlab chiqishdan oldin demoda tekshirish mumkin.',
      ],
    },
  ];

  page.faq = [
    {
      q: 'Bular real mijozlar sharhlarimi?',
      a: 'Yo‘q. Bu sahifada so‘zma-so‘z ommaviy sharhlar emas, odatiy loyihalardan tuzilgan anonim ssenariylar joylashtirilgan. Ism, reyting yoki o‘lchanadigan natija faqat manba tasdiqlangach va mijoz ruxsat bergach e’lon qilinadi.',
    },
    {
      q: 'Tavsiya uchun mijoz kontaktini olish mumkinmi?',
      a: 'Faqat mijozning alohida roziligi bilan. Kontakt va tijoriy ma’lumotni ruxsatsiz bermaymiz. Buning o‘rniga demo, qabul mezonlari va texnik sxemani tekshirish mumkin.',
    },
    {
      q: 'AI-bot foydasini qaysi metrikalar ko‘rsatadi?',
      a: 'Birinchi javob vaqti, yakunlangan ssenariylar, uzatilgan maydonlar to‘liqligi, malakali arizalar, xatolar va qo‘lda tuzatishlar. Sotuv va tushum CRM yoki hisob tizimi bo‘yicha alohida hisoblanadi.',
    },
    {
      q: 'Soham uchun ssenariyni ko‘rish mumkinmi?',
      a: 'Ha. Haqiqiy ariza yubormasdan namoyish yo‘li, savollar, menejerga uzatish nuqtalari va tekshiruv mezonlarini tayyorlaymiz.',
    },
  ];
  page.schemaTypes = ['Organization', 'WebSite', 'BreadcrumbList', 'FAQPage'];
  page.lastReviewedAt = TODAY;
  page.updatedAt = TODAY;
  writeJson(file, page);
}

function updatePricingPageRu() {
  const file = 'content/pages/ru/stoimost-chat-bota.json';
  const page = readJson(file);
  page.title = 'Стоимость чат-бота: тарифы и состав работ | GPTBot';
  page.description = 'Ориентиры по стоимости чат-бота: Telegram-бот от 990 000 сум. Итоговая смета зависит от сценариев, каналов, CRM, нагрузки и поддержки.';
  page.ogTitle = 'Стоимость чат-бота: тарифы, границы и смета | GPTBot';
  page.ogDescription = 'Стартовые цены, точный состав каждого пакета, отдельные расходы и критерии, по которым сравнивать предложения.';
  page.heroSubtitle = 'Стартовые цены относятся к конкретному ограниченному объёму работ. До запуска фиксируем каналы, сценарии, интеграции, ограничения, поддержку и сторонние расходы.';
  page.heroTrust = ['Стартовая цена ≠ полный проект', 'Scope до оплаты', 'Расходы разделены', 'Без гарантии окупаемости'];

  const short = page.bodyBlocks.find((block) => block.type === 'p' && textOf(block).startsWith('Коротко: чат-бот для бизнеса'));
  if (!short) throw new Error('Missing RU pricing summary');
  short.text = 'Коротко: базовый Telegram-бот в опубликованной тарифной таблице начинается от 990 000 сум, Instagram Direct бот — от 1 190 000 сум, базовая AI-воронка — от 1 990 000 сум. Это стартовые цены для указанного состава, а не обещание полной мультиканальной системы с CRM, оплатой и поддержкой. Финальная смета формируется после брифа и перечисляет всё включённое и исключённое.';

  page.bodyBlocks = page.bodyBlocks.filter((block) => !(block.type === 'p' && /По рынку Ташкента цены стартуют примерно от 3 млн|до 25 млн сум/i.test(textOf(block))));
  insertBeforeHeading(page.bodyBlocks, 'Таблица тарифов на чат-бота 2026', [
    { type: 'h2', text: 'Как читать цену «от»' },
    { type: 'list', items: ['Цена относится только к строке и составу работ, указанным в таблице.', 'Второй канал, CRM, оплата, каталог, миграция данных и сложная база знаний могут считаться отдельно.', 'Тариф внешней платформы, сообщения, AI-модель, хостинг и лицензии указываются отдельной строкой, если применимо.', 'Срок начинается после получения материалов, доступов и согласованного сценария.', 'Любая дополнительная функция добавляется только через обновлённую смету и согласование.'] },
  ]);
  const alwaysHeading = page.bodyBlocks.find((block) => block.type === 'h2' && block.text === 'Что входит в цену всегда');
  if (!alwaysHeading) throw new Error('Missing RU pricing scope heading');
  alwaysHeading.text = 'Что фиксируем в смете до старта';
  replaceBlockAfterHeading(page.bodyBlocks, 'Что фиксируем в смете до старта', { type: 'list', items: ['Канал или каналы запуска и владелец каждого аккаунта.', 'Количество сценариев, языков и объём исходной базы знаний.', 'Интеграции, поля, события, правила дедупликации и точки передачи человеку.', 'Набор тестов и критерии, по которым проект считается принятым.', 'Период поддержки после запуска и время реакции на критичные ошибки.', 'Что не входит: сторонние тарифы, контент, CRM-лицензия, доработки после изменения scope.'] });
  const roi = page.bodyBlocks.find((block) => block.type === 'p' && /Чат-бот окупается за счёт заявок/i.test(textOf(block)));
  if (!roi) throw new Error('Missing RU ROI claim');
  roi.text = 'Окупаемость нельзя гарантировать одной ценой бота. До запуска фиксируют baseline: объём обращений, время первого ответа, долю квалифицированных заявок, конверсию в продажу и стоимость ручной обработки. После запуска сравнивают одинаковые периоды и учитывают расходы на поддержку, AI-модель, сообщения и CRM.';
  const summary = page.bodyBlocks.find((block) => block.type === 'list' && Array.isArray(block.items) && block.items.some((item) => /Базу знаний для AI-бота и админ-панель считаем отдельно/i.test(item)));
  if (summary) summary.items = ['Стартовая цена действует только для указанного объёма работ.', 'Простой одноканальный бот дешевле мультиканальной системы с CRM и оплатой.', 'База знаний, админ-панель, интеграции и сторонние тарифы фиксируются отдельными строками.', 'Цена и срок утверждаются до старта, а изменение scope оформляется отдельно.', 'Начать можно с MVP, если заранее определены данные, тесты и путь расширения.'];
  const hiddenFaq = page.faq.find((item) => /Скрытые платежи|скрытых платеж/i.test(`${item.q} ${item.a}`));
  if (hiddenFaq) hiddenFaq.a = 'В коммерческом предложении отдельно перечисляются работы GPTBot, рекламные или платформенные тарифы, лицензии CRM, стоимость AI-модели и возможные дополнительные интеграции. Изменение объёма оформляется новой согласованной сметой.';
  if (!page.faq.some((item) => /Что означает цена «от»/i.test(item.q))) page.faq.splice(1, 0, { q: 'Что означает цена «от» в таблице?', a: 'Это минимальная стоимость конкретного пакета с указанным составом. Если нужны дополнительные каналы, CRM, оплата, каталог, повышенная нагрузка или расширенная поддержка, они добавляются в смету отдельными строками.' });
  page.lastReviewedAt = TODAY;
  page.updatedAt = TODAY;
  writeJson(file, page);
}

function updatePricingPageUz() {
  const file = 'content/pages/uz/chat-bot-narxi.json';
  const page = readJson(file);
  page.title = 'Chat-bot narxi: tariflar va ish tarkibi | GPTBot';
  page.description = 'Chat-bot narxi bo‘yicha yo‘nalish: Telegram-bot 990 000 so‘mdan. Yakuniy smeta ssenariy, kanal, CRM, yuklama va qo‘llab-quvvatlashga bog‘liq.';
  page.ogTitle = 'Chat-bot narxi: tarif, chegara va smeta | GPTBot';
  page.ogDescription = 'Boshlang‘ich narxlar, har bir paketning aniq tarkibi, alohida xarajatlar va takliflarni solishtirish mezonlari.';
  page.heroSubtitle = 'Boshlang‘ich narx aniq cheklangan ish hajmiga tegishli. Ishga tushirishdan oldin kanal, ssenariy, integratsiya, cheklov, qo‘llab-quvvatlash va tashqi xarajatlarni qayd etamiz.';
  page.heroTrust = ['Boshlang‘ich narx ≠ to‘liq loyiha', 'To‘lovdan oldin scope', 'Xarajatlar alohida', 'Qoplanish kafolatisiz'];
  const short = page.bodyBlocks.find((block) => block.type === 'p' && textOf(block).startsWith('Qisqacha: O‘zbekiston'));
  if (!short) throw new Error('Missing UZ pricing summary');
  short.text = 'Qisqacha: e’lon qilingan tarif jadvalida bazaviy Telegram-bot 990 000 so‘mdan, Instagram Direct bot 1 190 000 so‘mdan, bazaviy AI-voronka 1 990 000 so‘mdan boshlanadi. Bu ko‘rsatilgan tarkib uchun boshlang‘ich narx bo‘lib, CRM, to‘lov, bir nechta kanal va qo‘llab-quvvatlash bilan to‘liq tizim va’dasi emas. Yakuniy smetada kiritilgan va kiritilmagan ishlar alohida yoziladi.';
  page.bodyBlocks = page.bodyBlocks.filter((block) => !(block.type === 'p' && /Toshkent bozorida narxlar taxminan 3 mln|25 mln so‘m/i.test(textOf(block))));
  insertBeforeHeading(page.bodyBlocks, 'Chat-bot tariflari jadvali 2026', [
    { type: 'h2', text: '“Dan boshlab” narxini qanday o‘qish kerak' },
    { type: 'list', items: ['Narx faqat jadvaldagi aniq xizmat va ish tarkibiga tegishli.', 'Ikkinchi kanal, CRM, to‘lov, katalog, ma’lumot ko‘chirish va katta bilim bazasi alohida hisoblanishi mumkin.', 'Platforma tarifi, xabarlar, AI-model, hosting va litsenziya qo‘llansa, alohida satrda ko‘rsatiladi.', 'Muddat material, kirish huquqi va ssenariy tasdiqlangandan keyin boshlanadi.', 'Qo‘shimcha funksiya faqat yangilangan smeta va rozilik bilan qo‘shiladi.'] },
  ]);
  const alwaysHeading = page.bodyBlocks.find((block) => block.type === 'h2' && block.text === 'Narxga doimo nima kiradi');
  if (!alwaysHeading) throw new Error('Missing UZ pricing scope heading');
  alwaysHeading.text = 'Ish boshlanishidan oldin smetada nimani qayd etamiz';
  replaceBlockAfterHeading(page.bodyBlocks, 'Ish boshlanishidan oldin smetada nimani qayd etamiz', { type: 'list', items: ['Ishga tushirish kanali yoki kanallari va har bir akkaunt egasi.', 'Ssenariylar, tillar va boshlang‘ich bilim bazasi hajmi.', 'Integratsiya, maydon, hodisa, deduplikatsiya qoidasi va insonga uzatish nuqtalari.', 'Sinovlar to‘plami va loyihani qabul qilish mezonlari.', 'Ishga tushgandan keyingi qo‘llab-quvvatlash davri va kritik xatoga javob vaqti.', 'Kiritilmagan ishlar: tashqi tarif, kontent, CRM litsenziyasi va scope o‘zgargandan keyingi qo‘shimcha ish.'] });
  const roi = page.bodyBlocks.find((block) => block.type === 'p' && /Chat-bot ilgari yo‘qolib ketgan arizalar hisobiga qoplanadi/i.test(textOf(block)));
  if (!roi) throw new Error('Missing UZ ROI claim');
  roi.text = 'Bot narxining o‘zi qoplanishni kafolatlamaydi. Ishga tushirishdan oldin boshlang‘ich ko‘rsatkichlar qayd etiladi: murojaat hajmi, birinchi javob vaqti, malakali arizalar ulushi, sotuvga konversiya va qo‘lda ishlash xarajati. Keyin bir xil davrlar solishtirilib, qo‘llab-quvvatlash, AI-model, xabar va CRM xarajatlari ham hisobga olinadi.';
  if (!page.faq.some((item) => /“Dan boshlab” narxi nimani anglatadi/i.test(item.q))) page.faq.splice(1, 0, { q: '“Dan boshlab” narxi nimani anglatadi?', a: 'Bu jadvalda ko‘rsatilgan tarkibdagi aniq paketning eng past narxi. Qo‘shimcha kanal, CRM, to‘lov, katalog, yuqori yuklama yoki kengaytirilgan qo‘llab-quvvatlash kerak bo‘lsa, ular smetaga alohida qo‘shiladi.' });
  page.lastReviewedAt = TODAY;
  page.updatedAt = TODAY;
  writeJson(file, page);
}

function updateCrmRu() {
  const file = 'content/pages/ru/ai-bot-s-crm-amocrm-bitrix24.json';
  const page = readJson(file);
  page.title = 'AI-бот с AmoCRM и Bitrix24: передача лидов | GPTBot';
  page.description = 'AI-бот собирает согласованные данные в мессенджере и передаёт лид в AmoCRM или Bitrix24. Scope включает поля, дедупликацию, повторы, мониторинг и восстановление.';
  page.ogTitle = 'AI-бот с AmoCRM и Bitrix24: контролируемая передача лидов';
  page.ogDescription = 'Проектируем поля, статусы, дедупликацию, повторные попытки, мониторинг и ручное восстановление — без абсолютных обещаний «ни один лид не потеряется».';
  page.heroSubtitle = 'AI-бот ведёт первичный диалог, собирает согласованные поля и передаёт контекст в CRM. До запуска фиксируем правила создания сделки, дедупликацию, повторные попытки, мониторинг и ручное восстановление.';
  page.heroTrust = ['Поля и статусы до старта', 'Идемпотентная передача', 'Мониторинг ошибок', 'Ручное восстановление'];
  for (const block of page.bodyBlocks) {
    if (block.type !== 'p') continue;
    if (/Это решает две главные операционные дыры/i.test(block.text || '')) block.text = 'Связка сокращает ручной перенос и риск потери контекста между мессенджером и CRM. Надёжность зависит от API платформы, согласованных полей, подтверждения доставки, повторных попыток, идемпотентности и мониторинга; эти условия фиксируются в техническом задании и проверяются до запуска.';
    if (/Если контакт уже есть в CRM — бот добавляет новую сделку.*без дублей/i.test(block.text || '')) block.text = 'Клиент пишет в Telegram, Instagram Direct или WhatsApp. AI-бот ведёт согласованный сценарий и после подтверждения условий пытается создать или обновить сущность через API AmoCRM или Bitrix24. Сопоставление выполняется по заранее утверждённым идентификаторам; неоднозначные совпадения отправляются на ручную проверку, поэтому абсолютное отсутствие дублей не обещается.';
  }
  const supported = page.bodyBlocks.find((block) => block.type === 'list' && Array.isArray(block.items) && block.items.some((item) => /AmoCRM — полная связка/i.test(item)));
  if (supported) supported.items = ['AmoCRM — согласованный набор действий через доступный API: контакт, сделка, поля, теги, задачи и заметки.', 'Bitrix24 — лиды или сделки, контакты, задачи, статусы и привязка к выбранной воронке.', 'Google Sheets — простой журнал заявок для небольшого процесса без CRM.', '1С и кастомные CRM — только после проверки доступного API, лимитов, модели авторизации и тестовой среды.', 'Фактический объём интеграции перечисляется в смете; название CRM само по себе не означает поддержку всех функций.'];
  insertBeforeHeading(page.bodyBlocks, 'Ограничения и риски, которые важно понимать', [
    { type: 'h2', text: 'Надёжность передачи: что фиксируем в ТЗ' },
    { type: 'table', headers: ['Контроль', 'Что должно быть определено', 'Критерий приёмки'], rows: [['Подтверждение', 'Как система понимает, что CRM приняла запись', 'Успех фиксируется только после подтверждённого ответа API'], ['Повторные попытки', 'Какие ошибки повторяются, интервал и предел', 'Временная ошибка не создаёт бесконечный цикл'], ['Идемпотентность', 'Ключ одной логической заявки и правило обновления', 'Повтор запроса не создаёт вторую сделку'], ['Дедупликация', 'Телефон, email, внешний ID и неоднозначные случаи', 'Конфликт уходит на ручную проверку'], ['Мониторинг', 'События успеха, ошибки, задержки и ответственный', 'Критичная ошибка видна до жалобы клиента'], ['Восстановление', 'Очередь неуспешных операций и ручной replay', 'Заявку можно безопасно восстановить без повторной продажи']] },
    { type: 'p', text: 'Если один из этих пунктов не входит в scope, это явно указывается как ограничение. Недоступность API, изменение тарифа или лимита CRM может задержать передачу; для такого случая нужен видимый статус и ручной маршрут.' },
  ]);
  const limitations = page.bodyBlocks.find((block) => block.type === 'list' && Array.isArray(block.items) && block.items.some((item) => /Интеграция работает в рамках публичного API/i.test(item)));
  if (limitations) limitations.items.push('CRM или канал могут быть временно недоступны: без очереди, повторных попыток и мониторинга передача не считается надёжной.', 'Полная история переписки передаётся только если это разрешено API, политикой обработки данных и согласованным объёмом.');
  const summary = page.bodyBlocks.find((block) => block.type === 'list' && Array.isArray(block.items) && block.items.some((item) => /CRM с AI-бот/i.test(item)));
  if (summary) summary.items = ['AI-бот собирает согласованные поля и передаёт контекст в AmoCRM или Bitrix24.', 'Создание или обновление сделки выполняется по утверждённым правилам и API-возможностям.', 'Повторы, дедупликация, мониторинг и восстановление входят в критерии надёжности.', 'Неоднозначные совпадения и ошибки должны иметь ручной маршрут.', 'Без CRM можно начать с Telegram-уведомления или таблицы, явно учитывая их ограничения.'];
  const serialized = JSON.stringify(page).replaceAll('чтобы ни одно обращение не потерялось', 'чтобы снизить риск потери обращения').replaceAll('лиды больше не теряются', 'снижается риск потери лидов').replaceAll('без дублей', 'с проверкой возможных дублей');
  const next = JSON.parse(serialized);
  next.lastReviewedAt = TODAY;
  next.updatedAt = TODAY;
  writeJson(file, next);
}

function updateCrmUz() {
  const file = 'content/pages/uz/amocrm-bitrix24-bilan-ai-bot.json';
  const page = readJson(file);
  page.title = 'AmoCRM va Bitrix24 bilan AI-bot: lid uzatish | GPTBot';
  page.description = 'AI-bot messenjerda kelishilgan ma’lumotni yig‘ib, lidni AmoCRM yoki Bitrix24’ga uzatadi. Scope maydon, deduplikatsiya, qayta urinish, monitoring va tiklashni belgilaydi.';
  page.ogTitle = 'AmoCRM va Bitrix24 bilan AI-bot: nazoratli lid uzatish';
  page.ogDescription = 'Maydon, status, deduplikatsiya, qayta urinish, monitoring va qo‘lda tiklashni loyihalaymiz — mutlaq “hech bir lid yo‘qolmaydi” va’dasisiz.';
  page.heroSubtitle = 'AI-bot dastlabki dialogni olib boradi, kelishilgan maydonlarni yig‘adi va kontekstni CRM’ga uzatadi. Ishga tushirishdan oldin bitim yaratish, deduplikatsiya, qayta urinish, monitoring va qo‘lda tiklash qoidalarini belgilaymiz.';
  page.heroTrust = ['Maydon va status oldindan', 'Idempotent uzatish', 'Xatolar monitoringi', 'Qo‘lda tiklash'];
  for (const block of page.bodyBlocks) {
    if (block.type !== 'p') continue;
    if (/Bu ikki asosiy operatsion bo‘shliqni yopadi/i.test(block.text || '')) block.text = 'Bu bog‘lanish messenjer va CRM o‘rtasidagi qo‘lda ko‘chirishni hamda kontekst yo‘qolishi xavfini kamaytiradi. Ishonchlilik platforma API’si, kelishilgan maydon, yetkazish tasdig‘i, qayta urinish, idempotentlik va monitoringga bog‘liq; ular texnik topshiriqda yozilib, ishga tushirishdan oldin sinovdan o‘tkaziladi.';
    if (/Agar kontakt CRM’da allaqachon bo‘lsa.*dublikatlarsiz/i.test(block.text || '')) block.text = 'Mijoz Telegram, Instagram Direct yoki WhatsApp’ga yozadi. AI-bot kelishilgan ssenariyni olib boradi va shartlar tasdiqlangach, AmoCRM yoki Bitrix24 API’si orqali mavjud yozuvni yangilash yoki yangi yozuv yaratishga harakat qiladi. Moslashtirish oldindan belgilangan identifikatorlar bo‘yicha bajariladi; noaniq moslik qo‘lda tekshiriladi, shuning uchun dublikatlar mutlaqo bo‘lmaydi deb va’da qilinmaydi.';
  }
  const supported = page.bodyBlocks.find((block) => block.type === 'list' && Array.isArray(block.items) && block.items.some((item) => /AmoCRM — to‘liq ulanish/i.test(item)));
  if (supported) supported.items = ['AmoCRM — mavjud API orqali kelishilgan amallar: kontakt, bitim, maydon, teg, vazifa va izoh.', 'Bitrix24 — lid yoki bitim, kontakt, vazifa, status va tanlangan voronkaga bog‘lash.', 'Google Sheets — CRM’siz kichik jarayon uchun oddiy arizalar jurnali.', '1C va shaxsiy CRM — faqat API, limit, avtorizatsiya modeli va test muhiti tekshirilgach.', 'Integratsiyaning aniq hajmi smetada yoziladi; CRM nomi barcha funksiyalar qo‘llanadi degani emas.'];
  insertBeforeHeading(page.bodyBlocks, 'Tushunish muhim bo‘lgan cheklovlar va xavflar', [
    { type: 'h2', text: 'Uzatish ishonchliligi: texnik topshiriqda nimani belgilaymiz' },
    { type: 'table', headers: ['Nazorat', 'Nima aniqlanadi', 'Qabul mezoni'], rows: [['Tasdiq', 'CRM yozuvni qabul qilganini tizim qanday biladi', 'Muvaffaqiyat faqat API tasdiqlagan javobdan keyin qayd etiladi'], ['Qayta urinish', 'Qaysi xato takrorlanadi, interval va limit', 'Vaqtinchalik xato cheksiz sikl yaratmaydi'], ['Idempotentlik', 'Bitta mantiqiy ariza kaliti va yangilash qoidasi', 'Takroriy so‘rov ikkinchi bitim yaratmaydi'], ['Deduplikatsiya', 'Telefon, email, tashqi ID va noaniq holat', 'Nizo qo‘lda tekshirishga tushadi'], ['Monitoring', 'Muvaffaqiyat, xato, kechikish va mas’ul shaxs', 'Kritik xato mijoz shikoyatidan oldin ko‘rinadi'], ['Tiklash', 'Muvaffaqiyatsiz operatsiyalar navbati va qo‘lda replay', 'Arizani ikkinchi bitimsiz xavfsiz tiklash mumkin']] },
    { type: 'p', text: 'Bu bandlardan biri scope’ga kirmasa, cheklov sifatida ochiq yoziladi. API ishlamasligi, tarif yoki CRM limiti o‘zgarishi uzatishni kechiktirishi mumkin; bunday holat uchun ko‘rinadigan status va qo‘lda ishlash yo‘li kerak.' },
  ]);
  const limitations = page.bodyBlocks.find((block) => block.type === 'list' && Array.isArray(block.items) && block.items.some((item) => /Integratsiya AmoCRM va Bitrix24 ochiq API doirasida/i.test(item)));
  if (limitations) limitations.items.push('CRM yoki kanal vaqtincha ishlamasligi mumkin: navbat, qayta urinish va monitoringsiz uzatish ishonchli hisoblanmaydi.', 'To‘liq yozishmalar tarixi faqat API, ma’lumot siyosati va kelishilgan hajm ruxsat bersa uzatiladi.');
  const summary = page.bodyBlocks.find((block) => block.type === 'list' && Array.isArray(block.items) && block.items.some((item) => /CRM bilan AI-bot/i.test(item)));
  if (summary) summary.items = ['AI-bot kelishilgan maydonlarni yig‘ib, kontekstni AmoCRM yoki Bitrix24’ga uzatadi.', 'Bitim yaratish yoki yangilash tasdiqlangan qoida va API imkoniyati bo‘yicha bajariladi.', 'Qayta urinish, deduplikatsiya, monitoring va tiklash ishonchlilik mezoniga kiradi.', 'Noaniq moslik va xato uchun qo‘lda ishlash yo‘li bo‘lishi kerak.', 'CRM bo‘lmasa, Telegram bildirishnomasi yoki jadvaldan ularning cheklovlarini hisobga olib boshlash mumkin.'];
  const serialized = JSON.stringify(page).replaceAll('dublikatlarsiz', 'ehtimoliy dublikatlarni tekshirish bilan');
  const next = JSON.parse(serialized);
  next.lastReviewedAt = TODAY;
  next.updatedAt = TODAY;
  writeJson(file, next);
}

function stripStaleCompetitorPriceClaims() {
  const files = ['content/pages/ru/kontekstnaya-reklama-tashkent.json', 'content/pages/ru/targetirovannaya-reklama-tashkent.json', 'content/pages/ru/telegram-ads-uzbekistan.json', 'content/pages/ru/smm-prodvizhenie-tashkent.json', 'content/pages/ru/performance-marketing-tashkent.json', 'content/pages/uz/internet-reklama-toshkent.json', 'content/pages/uz/telegram-reklama.json', 'content/pages/uz/smm-xizmatlari.json'];
  const stale = /август 2026|по открытым данным агентств-конкурентов|рыночн\w* ориентир|минимальн\w* бюджет\w*.*500 €|bozor.*(narx|yo‘nalish).*2026|agentlik.*ochiq.*narx/i;
  for (const file of files) {
    if (!fs.existsSync(absolute(file))) { console.warn(`[seo-hot-traffic] optional file missing: ${file}`); continue; }
    const page = readJson(file);
    const beforeBlocks = page.bodyBlocks?.length || 0;
    const beforeFaq = page.faq?.length || 0;
    page.bodyBlocks = (page.bodyBlocks || []).filter((block) => !stale.test(textOf(block)));
    page.faq = (page.faq || []).filter((item) => !stale.test(`${item.q || ''} ${item.a || ''}`));
    if ((page.bodyBlocks?.length || 0) !== beforeBlocks || (page.faq?.length || 0) !== beforeFaq) { page.lastReviewedAt = TODAY; page.updatedAt = TODAY; writeJson(file, page); }
  }
}

function addCommercialClaimsTest() {
  const file = 'tests/seo-commercial-claims.test.ts';
  const content = `import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
function read(relativePath: string) { return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8')); }
function serialized(relativePath: string) { return JSON.stringify(read(relativePath)); }
function linksOf(page: any): Set<string> { const links = new Set<string>(); for (const link of page.internalLinks || []) if (link?.target) links.add(link.target); for (const block of page.bodyBlocks || []) for (const link of block.links || []) if (link?.target) links.add(link.target); return links; }

test('paid-media hub links in body copy to every commercial owner', () => {
  const page = read('content/pages/ru/internet-reklama-tashkent.json');
  const bodyTargets = new Set<string>();
  for (const block of page.bodyBlocks || []) for (const link of block.links || []) if (link?.target) bodyTargets.add(link.target);
  for (const target of ['/ru/kontekstnaya-reklama-tashkent/', '/ru/targetirovannaya-reklama-tashkent/', '/ru/telegram-ads-uzbekistan/', '/ru/performance-marketing-tashkent/', '/ru/marketingovyi-audit-tashkent/']) assert.ok(bodyTargets.has(target), \`internet advertising hub is missing an in-body link to \${target}\`);
  assert.ok(linksOf(page).has('/ru/digital-marketing-tashkent/'));
});

test('reviews pages are transparent scenarios, not fabricated ratings', () => {
  for (const file of ['content/pages/ru/otzyvy.json', 'content/pages/uz/sharhlar.json']) {
    const page = read(file); const text = JSON.stringify(page);
    assert.doesNotMatch(text, /★★★★★|AggregateRating|"Review"/, \`\${file} exposes an unverified rating\`);
    assert.match(text, /обезличенн|составн|anonim|tarkibiy/i, \`\${file} does not explain that the scenarios are anonymised/composite\`);
    assert.ok(!page.schemaTypes?.includes('Review')); assert.ok(!page.schemaTypes?.includes('AggregateRating'));
  }
});

test('commercial pages do not publish stale competitor-price snapshots as current facts', () => {
  const files = ['content/pages/ru/internet-reklama-tashkent.json', 'content/pages/ru/kontekstnaya-reklama-tashkent.json', 'content/pages/ru/targetirovannaya-reklama-tashkent.json', 'content/pages/ru/telegram-ads-uzbekistan.json', 'content/pages/ru/smm-prodvizhenie-tashkent.json', 'content/pages/ru/performance-marketing-tashkent.json', 'content/pages/uz/internet-reklama-toshkent.json', 'content/pages/uz/telegram-reklama.json', 'content/pages/uz/smm-xizmatlari.json'].filter((file) => fs.existsSync(path.join(ROOT, file)));
  for (const file of files) assert.doesNotMatch(serialized(file), /по открытым данным агентств-конкурентов|август 2026|минимальном бюджете площадки около 500 €/i, \`\${file} contains a stale third-party price snapshot\`);
});

test('pricing pages explain scope and do not guarantee payback or zero missed enquiries', () => {
  for (const file of ['content/pages/ru/stoimost-chat-bota.json', 'content/pages/uz/chat-bot-narxi.json']) { const text = serialized(file); assert.match(text, /Как читать цену|qanday o‘qish/i); assert.match(text, /не гарант|kafolatlamaydi/i); assert.doesNotMatch(text, /ноль пропущенных|nol o‘tkazib yuborilgan/i); }
});

test('CRM pages specify delivery reliability and avoid absolute no-loss promises', () => {
  for (const file of ['content/pages/ru/ai-bot-s-crm-amocrm-bitrix24.json', 'content/pages/uz/amocrm-bitrix24-bilan-ai-bot.json']) { const text = serialized(file); assert.match(text, /Идемпотентность|Idempotentlik/); assert.match(text, /Восстановление|Tiklash/); assert.doesNotMatch(text, /чтобы ни одно обращение не потерялось|лиды больше не теряются|lidlar.*yo‘qolmaydi/i); assert.doesNotMatch(text, /без дублей|dublikatlarsiz/i); }
});
`;
  fs.writeFileSync(absolute(file), content, 'utf8');
  console.log(`[seo-hot-traffic] created ${file}`);
}

function updatePackageScripts() {
  const file = 'package.json';
  const pkg = readJson(file);
  const command = 'node --import tsx --test tests/seo-commercial-claims.test.ts';
  pkg.scripts['test:seo-commercial-claims'] = command;
  if (!pkg.scripts.test.includes('tests/seo-commercial-claims.test.ts')) pkg.scripts.test = `${pkg.scripts.test} tests/seo-commercial-claims.test.ts`;
  writeJson(file, pkg);
}

function addReleaseNote() {
  const file = 'docs/seo/RELEASE_2026-08-31_HOT_TRAFFIC_FOUNDATION.md';
  fs.mkdirSync(path.dirname(absolute(file)), { recursive: true });
  const content = `# GPTBot.uz — Hot Traffic SEO Foundation

Date: 2026-08-31  
Scope: commercial content, trust, pricing clarity, CRM reliability claims and regression gates.  
Deployment: **not included**. This release must be merged and deployed only after the checks below pass and the production marker is reconciled.

## Why this release exists

The live marketing surface had three conversion and trust risks:

1. The internet-advertising hub described Google, Meta and Telegram, but the buyer-facing body did not route each intent to its dedicated commercial owner.
2. The reviews pages showed named, dated five-star quotations while the FAQ described them as generalised cases.
3. Pricing and CRM pages mixed narrow starting prices with broader market ranges and used absolute outcome or reliability language.

The release strengthens existing URLs. It does not create another broad marketing page and does not merge pages with distinct intent.

## Changed commercial owners

- \`/ru/internet-reklama-tashkent/\`
- \`/ru/kontekstnaya-reklama-tashkent/\`
- \`/ru/targetirovannaya-reklama-tashkent/\`
- \`/ru/telegram-ads-uzbekistan/\`
- \`/ru/performance-marketing-tashkent/\`
- \`/ru/smm-prodvizhenie-tashkent/\`
- \`/uz/internet-reklama-toshkent/\`
- \`/uz/telegram-reklama/\`
- \`/uz/smm-xizmatlari/\`

The RU paid-media hub now links in visible body copy to contextual advertising, targeted advertising, Telegram Ads, performance marketing and the marketing audit. The estimate section separates service work, media spend, creative production, landing work, analytics/CRM and third-party costs.

Stale third-party price snapshots dated August 2026 are removed from the paid-media cluster. GPTBot's own tariffs are not changed by that cleanup.

## Trust correction

- \`/ru/otzyvy/\`
- \`/uz/sharhlar/\`

Both URLs now present anonymous composite implementation scenarios instead of named five-star reviews. Review and AggregateRating schema remain prohibited unless a source, client permission and visible matching content exist.

**Do not merge PR #32** until every review has a source-and-permission record and the structured-data type is validated against current Google eligibility rules.

## Pricing clarity

- \`/ru/stoimost-chat-bota/\`
- \`/uz/chat-bot-narxi/\`

The pages keep the published starting-price table but now explain that a price “from” applies only to the listed scope. They distinguish extra channels, CRM, payment, data migration, platform fees, AI usage and support. Payback is measured against a baseline and is not guaranteed.

## CRM reliability boundary

- \`/ru/ai-bot-s-crm-amocrm-bitrix24/\`
- \`/uz/amocrm-bitrix24-bilan-ai-bot/\`

The pages no longer promise zero lost leads or zero duplicates. A buyer-facing acceptance matrix now covers API acknowledgement, retry policy, idempotency, deduplication, monitoring and manual recovery.

## Permanent regression gate

\`tests/seo-commercial-claims.test.ts\` blocks unverified ratings, loss of paid-media body links, stale competitor-price snapshots, pricing without scope qualification and CRM pages without idempotency/recovery boundaries. It is included in \`npm test\` and available as \`npm run test:seo-commercial-claims\`.

## Required checks before merge

\`\`\`bash
npm ci --ignore-scripts --no-audit --no-fund
npm run seo:audit
npm run test:seo-commercial-claims
npm run test:seo-links
npm run test:seo-demand
npm run test:seo-intent
npm run test:seo-cluster
npm run test:canonical
npx tsc -b
npm run build
npm run scan:secrets
\`\`\`

## Deployment and observation gate

Before deployment: record the exact merge SHA; build from that SHA; verify preferred-host redirects and canonicals; verify the new body links in rendered HTML; verify that the two scenario pages expose no star quotations or Review/AggregateRating nodes; and verify production content markers against the exact deployment.

After deployment, record the actual production date. Evaluate GSC query × page, CTR and qualified-organic-lead events after complete 28-, 56- and 90-day windows. Do not attribute results to this release before the corresponding data window ends.
`;
  fs.writeFileSync(absolute(file), content, 'utf8');
  console.log(`[seo-hot-traffic] created ${file}`);
}

updateInternetAdvertisingRu();
updateReviewsRu();
updateReviewsUz();
updatePricingPageRu();
updatePricingPageUz();
updateCrmRu();
updateCrmUz();
stripStaleCompetitorPriceClaims();
addCommercialClaimsTest();
updatePackageScripts();
addReleaseNote();
console.log('[seo-hot-traffic] all transformations complete');
