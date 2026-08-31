import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TODAY = '2026-08-31';

const abs = (file) => path.join(ROOT, file);
const read = (file) => JSON.parse(fs.readFileSync(abs(file), 'utf8'));
const write = (file, value) => {
  fs.writeFileSync(abs(file), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  console.log(`[seo-commercial-review] updated ${file}`);
};

function touch(page) {
  page.lastReviewedAt = TODAY;
  page.updatedAt = TODAY;
}

function sectionIndex(page, id) {
  return page.bodyBlocks.findIndex((block) => block?.type === 'h2' && block.id === id);
}

function replaceSection(page, id, headingText, blocks) {
  const start = sectionIndex(page, id);
  if (start < 0) throw new Error(`Missing section #${id} on ${page.url}`);
  let end = page.bodyBlocks.findIndex(
    (block, index) => index > start && block?.type === 'h2',
  );
  if (end < 0) end = page.bodyBlocks.length;
  page.bodyBlocks.splice(
    start,
    end - start,
    { type: 'h2', id, text: headingText },
    ...blocks,
  );
}

function replaceHeadingSection(page, headingText, nextHeadingText, blocks) {
  const start = page.bodyBlocks.findIndex(
    (block) => block?.type === 'h2' && block.text === headingText,
  );
  if (start < 0) throw new Error(`Missing heading "${headingText}" on ${page.url}`);
  let end = page.bodyBlocks.findIndex(
    (block, index) => index > start && block?.type === 'h2' && (!nextHeadingText || block.text === nextHeadingText),
  );
  if (end < 0) {
    end = page.bodyBlocks.findIndex((block, index) => index > start && block?.type === 'h2');
  }
  if (end < 0) end = page.bodyBlocks.length;
  page.bodyBlocks.splice(start, end - start, ...blocks);
}

function renameToc(page, id, label) {
  const toc = page.bodyBlocks.find((block) => block?.type === 'toc');
  if (!toc?.links) return;
  const link = toc.links.find(
    (item) => item?.anchor === id || item?.target === `#${id}`,
  );
  if (!link) throw new Error(`Missing TOC link for #${id} on ${page.url}`);
  if ('label' in link) link.label = label;
  else link.anchor = label;
}

function findBody(page, predicate) {
  const index = page.bodyBlocks.findIndex(predicate);
  if (index < 0) throw new Error(`Missing expected body block on ${page.url}`);
  return { block: page.bodyBlocks[index], index };
}

function insertAfterBodyIndex(page, index, blocks) {
  page.bodyBlocks.splice(index + 1, 0, ...blocks);
}

function replaceFaq(page, questionPattern, replacement) {
  const index = page.faq.findIndex((item) => questionPattern.test(item.q || ''));
  if (index < 0) throw new Error(`Missing FAQ ${questionPattern} on ${page.url}`);
  page.faq[index] = replacement;
}

function removeFaq(page, pattern) {
  page.faq = page.faq.filter(
    (item) => !pattern.test(`${item.q || ''} ${item.a || ''}`),
  );
}

function upsertFaq(page, questionPattern, item) {
  const index = page.faq.findIndex((entry) => questionPattern.test(entry.q || ''));
  if (index >= 0) page.faq[index] = item;
  else page.faq.push(item);
}

function compareTableRu(rows) {
  return {
    type: 'table',
    headers: ['Строка предложения', 'Что должно быть указано', 'Почему это важно'],
    rows,
  };
}

function compareTableUz(rows) {
  return {
    type: 'table',
    headers: ['Taklif satri', 'Nima aniq yozilishi kerak', 'Nega muhim'],
    rows,
  };
}

function updateRuPaidMediaComparisonSections() {
  const configs = [
    {
      file: 'content/pages/ru/kontekstnaya-reklama-tashkent.json',
      heading: 'Как сравнить сметы на контекстную рекламу',
      intro:
        'Сравнивайте предложения по одинаковому объёму. Низкая итоговая цифра может не включать семантику, посадочную страницу, аналитику или регулярную работу с поисковыми терминами.',
      rows: [
        ['Медиабюджет', 'Лимит, валюта, владелец кабинета и порядок пополнения', 'Деньги площадки нельзя смешивать с оплатой подрядчика'],
        ['Настройка', 'Число направлений, кампаний, география, семантика и минус-слова', 'Определяет фактический объём запуска'],
        ['Ведение', 'Частота проверки терминов, ставок, объявлений и бюджета', 'Слово «ведение» без периодичности ничего не гарантирует'],
        ['Посадочная и аналитика', 'Какие страницы, формы, события, UTM и CRM-статусы входят', 'Без них клики нельзя связать с качеством обращения'],
        ['Сторонние сервисы', 'Коллтрекинг, CRM, коннекторы и их тарифы', 'Исключает скрытые обязательные расходы'],
        ['Доступы и данные', 'Кому принадлежат аккаунт, история и аудитории', 'Бизнес должен сохранить контроль после завершения работ'],
      ],
    },
    {
      file: 'content/pages/ru/targetirovannaya-reklama-tashkent.json',
      heading: 'Как сравнить сметы на таргетированную рекламу',
      intro:
        'Сравнивайте не только стоимость ведения, но и объём тестов. Пакеты с одинаковой ценой могут сильно различаться по числу креативов, аудиторий, языков, посадочных маршрутов и аналитике.',
      rows: [
        ['Медиабюджет', 'Лимит, валюта, владелец аккаунта и правила остановки', 'Позволяет отделить закупку трафика от работы команды'],
        ['Креативная матрица', 'Число гипотез, форматов, языков и итераций', 'Без объёма тестов нельзя сравнить два предложения'],
        ['Производство', 'Сценарий, дизайн, монтаж, съёмка и адаптации', 'Определяет, что включено, а что потребуется отдельно'],
        ['Точка назначения', 'Сайт, лид-форма, Direct, бот и кто их дорабатывает', 'Качество следующего шага влияет на интерпретацию теста'],
        ['Измерение', 'События, UTM, CRM-статусы и качество лидов', 'Дешёвый контакт не равен квалифицированной заявке'],
        ['Доступы', 'Аккаунт, пиксель, аудитории и платёжный профиль принадлежат клиенту', 'Снижает зависимость от подрядчика'],
      ],
    },
    {
      file: 'content/pages/ru/telegram-ads-uzbekistan.json',
      heading: 'Что должно быть в смете на Telegram-рекламу',
      intro:
        'Telegram Ads, прямые посевы и ведение собственного канала — разные закупки. Коммерческое предложение должно разделять формат размещения, медиабюджет, работу команды, точку назначения и измерение.',
      rows: [
        ['Формат закупки', 'Официальный кабинет, прямое размещение или оба формата', 'У них разные правила, документы и метрики'],
        ['Медиабюджет', 'Валюта, лимит, условия кабинета или цена конкретного канала', 'Это расход площадке или владельцу канала, а не тариф ведения'],
        ['Сообщения и размещения', 'Число вариантов, контекстов, каналов и итераций', 'Показывает реальный объём теста'],
        ['Точка назначения', 'Канал, бот или сайт и кто отвечает за готовность', 'Объявление и следующий шаг должны совпадать'],
        ['Аналитика', 'Метки, start-параметры, события и CRM-статусы', 'Разделяет переход, диалог, лид и продажу'],
        ['Доступы и комиссии', 'Владелец кабинета, роль подрядчика и сторонние комиссии', 'Убирает скрытые зависимости и расходы'],
      ],
    },
    {
      file: 'content/pages/ru/smm-prodvizhenie-tashkent.json',
      heading: 'Как сравнить SMM-пакеты',
      intro:
        'Одинаковое слово «ведение» может означать совершенно разный объём. Смета должна показывать не только число публикаций, но и стратегию, производство, модерацию, языки, платное продвижение и измерение обращений.',
      rows: [
        ['Стратегия', 'Аудитория, роль каналов, рубрики и план проверки гипотез', 'Отделяет систему от заполнения календаря'],
        ['Контент', 'Посты, stories, Reels, Telegram, языки и число адаптаций', 'Позволяет сравнить фактический объём'],
        ['Производство', 'Съёмка, сценарии, дизайн, монтаж и выезды', 'Часто это крупнейшая скрытая часть сметы'],
        ['Модерация', 'Часы работы, объём диалогов и правило передачи менеджеру', 'Фиксирует границы ответственности'],
        ['Платная реклама', 'Входит ли настройка и какой медиабюджет оплачивается отдельно', 'SMM и таргет — связанные, но разные услуги'],
        ['Отчётность', 'Контент-сигналы, диалоги, квалифицированные обращения и выводы', 'Объём публикаций сам по себе не доказывает эффект'],
      ],
    },
    {
      file: 'content/pages/ru/performance-marketing-tashkent.json',
      heading: 'Как сравнить предложения по performance-маркетингу',
      intro:
        'Performance-предложение сравнивают по доступным данным и контуру решений, а не по обещанию «оплаты за результат». До старта должны быть определены бизнес-событие, источники данных, каналы, медиабюджет и цикл экспериментов.',
      rows: [
        ['Бизнес-событие', 'Что считается квалифицированным лидом, заказом или продажей', 'Без определения результата оптимизация неоднозначна'],
        ['Каналы и бюджет', 'Какие площадки входят и кто оплачивает медиабюджет', 'Разделяет управление и закупку трафика'],
        ['Данные', 'Теги, формы, звонки, CRM, возврат статусов и ограничения', 'Определяет, какие выводы вообще доступны'],
        ['Эксперименты', 'Число гипотез, креативов, страниц и частота решений', 'Показывает реальную скорость обучения'],
        ['Отчётность', 'Период, уровни воронки, владелец решения и stop-rule', 'Отчёт должен приводить к действию, а не к витрине метрик'],
        ['Сторонние расходы', 'Коллтрекинг, CRM, коннекторы, BI и лицензии', 'Предотвращает недооценку полной стоимости контура'],
      ],
    },
  ];

  for (const config of configs) {
    const page = read(config.file);
    renameToc(page, 'rynok-cen', 'Как сравнить смету');
    replaceSection(page, 'rynok-cen', config.heading, [
      { type: 'p', text: config.intro },
      compareTableRu(config.rows),
      {
        type: 'p',
        text: 'После брифа фиксируются включённые работы, исключения, зависимости от владельца, критерии приёмки и порядок изменения объёма. Универсальный «рыночный пакет» без этих данных не является сопоставимой сметой.',
      },
    ]);
    removeFaq(
      page,
      /по рыночным ориентирам|рыночн\w* цен|рынке Ташкента.*(?:млн|сум)|от\s*[\d,.]+\s*млн\s*сум|2026.{0,20}(?:август|08)/i,
    );
    const minBudget = page.faq.findIndex((item) => /минимальн\w* бюджет/i.test(item.q || ''));
    if (minBudget >= 0) {
      page.faq[minBudget] = {
        q: 'Как определить достаточный бюджет для теста?',
        a: 'Бюджет выводят из цели, доступного спроса или аудитории, ожидаемой стоимости контакта, конверсии следующего шага и допустимой стоимости квалифицированного обращения. До запуска фиксируют срок, лимит расхода и правило остановки; универсальной суммы для всех ниш нет.',
      };
    }
    touch(page);
    write(config.file, page);
  }
}

function updateTelegramRu() {
  const file = 'content/pages/ru/telegram-ads-uzbekistan.json';
  const page = read(file);
  page.description =
    'Стоимость Telegram Ads в Узбекистане: официальный минимальный CPM, состав медиабюджета, требования площадки, бот или сайт и измерение заявок.';

  replaceSection(page, 'budget', 'Сколько стоит реклама в Telegram Ads в Узбекистане', [
    {
      type: 'p',
      text: 'У Telegram Ads нет единого пакетного прайса: объявления участвуют в CPM-аукционе, а рекламодатель задаёт ставку и бюджет конкретного сообщения. Медиабюджет площадки оплачивается отдельно от настройки, ведения, подготовки точки назначения и аналитики.',
    },
    {
      type: 'linkp',
      text: 'В актуальном {guide} минимальный CPM для sponsored message указан как 0,1 Toncoin. В {terms} Telegram сохраняет право менять параметры платформы, включая минимальный CPM, поэтому перед пополнением значение проверяется в текущем интерфейсе и первичном источнике.',
      links: [
        {
          token: 'guide',
          target: 'https://ads.telegram.org/getting-started',
          anchor: 'официальном руководстве Telegram Ads',
        },
        {
          token: 'terms',
          target: 'https://ads.telegram.org/tos',
          anchor: 'условиях платформы',
        },
      ],
    },
    {
      type: 'table',
      headers: ['Часть бюджета', 'Что включает', 'Как фиксируется'],
      rows: [
        ['Медиабюджет Ads', 'Баланс и бюджет конкретных sponsored messages', 'Лимит, валюта, владелец кабинета и stop-rule'],
        ['Прямые посевы', 'Оплата выбранным владельцам каналов', 'Отдельная цена, дата, формат, статистика и подтверждение размещения'],
        ['Работа команды', 'Стратегия, контексты, сообщения, запуск и оптимизация', 'Согласованный объём и период'],
        ['Точка назначения', 'Канал, бот или сайт, контент и техническая готовность', 'Отдельный scope, если требуется доработка'],
        ['Измерение', 'Метки, start-параметры, события и CRM-статусы', 'Что считается переходом, лидом и продажей'],
        ['Сторонние условия', 'Комиссии провайдера, документы и доступные способы оплаты', 'Проверяются для выбранного маршрута перед запуском'],
      ],
    },
    {
      type: 'p',
      text: 'Универсального депозита или стартовой суммы для всех способов доступа нет. Условия конкретного кабинета или провайдера могут отличаться от требований самой платформы и должны быть вынесены в смету отдельной строкой.',
    },
  ]);

  replaceFaq(page, /Сколько стоит реклама в Telegram Ads/i, {
    q: 'Сколько стоит реклама в Telegram Ads?',
    a: 'Telegram Ads работает по CPM-аукциону. Официальное руководство указывает минимальный CPM 0,1 Toncoin, но фактическая ставка и бюджет зависят от выбранных контекстов и аукциона. Медиабюджет, работа команды, точка назначения, аналитика и возможные комиссии указываются отдельно.',
  });
  replaceFaq(page, /депозит 2 миллиона евро/i, {
    q: 'Нужен ли фиксированный крупный депозит для Telegram Ads?',
    a: 'Не существует одного универсального условия для всех маршрутов доступа. Требования прямого кабинета, доступного способа оплаты или стороннего провайдера могут различаться. До запуска проверяются текущий интерфейс Telegram Ads, договорные условия выбранного маршрута и все комиссии.',
  });
  replaceFaq(page, /минимальн\w* бюджет на Telegram Ads/i, {
    q: 'Как определить тестовый бюджет Telegram Ads?',
    a: 'Официальная документация публикует минимальный CPM, но не универсальный бюджет кампании. Тестовый лимит задают по числу контекстов и вариантов сообщения, ожидаемому объёму показов, готовности канала, бота или сайта и заранее определённому правилу остановки.',
  });

  page.sources = [
    {
      title: 'Telegram Ad Platform — Getting Started',
      url: 'https://ads.telegram.org/getting-started',
      note: 'Минимальный CPM 0,1 Toncoin, CPM-аукцион, бюджет объявления и публичные каналы. Проверено 2026-08-31.',
    },
    {
      title: 'Telegram Ad Platform — Terms of Service',
      url: 'https://ads.telegram.org/tos',
      note: 'Платформа может менять параметры услуг, включая минимальный CPM. Проверено 2026-08-31.',
    },
    {
      title: 'Telegram Ads Guidelines',
      url: 'https://ads.telegram.org/guidelines',
      note: 'Требования к объявлению и точке назначения. Проверено 2026-08-31.',
    },
  ];
  touch(page);
  write(file, page);
}

function updateTelegramUz() {
  const file = 'content/pages/uz/telegram-reklama.json';
  const page = read(file);
  page.description =
    'Telegram reklama narxi: rasmiy minimal CPM, media byudjet, platforma talablari, bot yoki sayt va arizalarni o‘lchash.';

  replaceSection(page, 'qancha', 'Telegram Ads narxi qanday hisoblanadi', [
    {
      type: 'p',
      text: 'Telegram Ads uchun yagona paket narxi yo‘q: e’lonlar CPM auksionida qatnashadi, reklama beruvchi esa aniq e’lon stavkasi va byudjetini belgilaydi. Platforma media byudjeti sozlash, yuritish, manzil va analitika xizmatidan alohida to‘lanadi.',
    },
    {
      type: 'linkp',
      text: 'Amaldagi {guide} sponsored message uchun minimal CPM 0,1 Toncoin deb ko‘rsatilgan. {terms} Telegram platforma parametrlarini, jumladan minimal CPM’ni o‘zgartirishi mumkinligini belgilaydi; shuning uchun to‘lovdan oldin qiymat joriy kabinet va birlamchi manbada tekshiriladi.',
      links: [
        {
          token: 'guide',
          target: 'https://ads.telegram.org/getting-started',
          anchor: 'Telegram Ads rasmiy yo‘riqnomasida',
        },
        {
          token: 'terms',
          target: 'https://ads.telegram.org/tos',
          anchor: 'platforma shartlarida',
        },
      ],
    },
    {
      type: 'table',
      headers: ['Byudjet qismi', 'Nimani o‘z ichiga oladi', 'Qanday qayd etiladi'],
      rows: [
        ['Ads media byudjeti', 'Sponsored message balansi va aniq e’lon byudjeti', 'Limit, valyuta, kabinet egasi va stop-rule'],
        ['Kanalda joylashtirish', 'Tanlangan kanal egasiga to‘lov', 'Narx, sana, format, statistika va joylashtirish tasdig‘i'],
        ['Jamoa ishi', 'Strategiya, kontekst, matn, ishga tushirish va optimallashtirish', 'Kelishilgan hajm va davr'],
        ['Manzil', 'Kanal, bot yoki saytning kontenti va texnik tayyorligi', 'Dasturlash kerak bo‘lsa alohida scope'],
        ['O‘lchash', 'Belgi, start-parametr, hodisa va CRM statusi', 'O‘tish, lid va sotuv ta’rifi'],
        ['Tashqi shartlar', 'Provayder komissiyasi, hujjat va to‘lov usuli', 'Tanlangan yo‘l bo‘yicha ishga tushirishdan oldin tekshiriladi'],
      ],
    },
    {
      type: 'p',
      text: 'Barcha kirish yo‘llari uchun bitta universal depozit yoki boshlang‘ich summa yo‘q. Aniq kabinet yoki provayder sharti platformaning o‘z talabidan farq qilishi mumkin va smetada alohida ko‘rsatiladi.',
    },
  ]);

  renameToc(page, 'bozor-narxlari', 'Takliflarni solishtirish');
  replaceSection(page, 'bozor-narxlari', 'Telegram reklama takliflarini qanday solishtirish', [
    {
      type: 'p',
      text: 'Bir xil “Telegram reklama” nomi ostida rasmiy Ads, kanalda joylashtirish yoki ikkalasi bo‘lishi mumkin. Takliflarni faqat format, media byudjet, xabarlar soni, manzil, o‘lchash va tashqi komissiyalar bir xil yozilganda solishtirish mumkin.',
    },
    compareTableUz([
      ['Xarid formati', 'Rasmiy kabinet, kanal joylashtiruvi yoki aralash', 'Qoidalar va metrikalar farq qiladi'],
      ['Media byudjet', 'Valyuta, limit, kabinet yoki kanal narxi', 'Platforma xarajati xizmat haqidan ajraladi'],
      ['Xabar va kontekst', 'Variantlar, mavzular, kanallar va iteratsiyalar soni', 'Sinovning haqiqiy hajmini ko‘rsatadi'],
      ['Manzil', 'Kanal, bot yoki sayt va tayyorlik mas’uli', 'E’lon va keyingi qadam mos bo‘lishi kerak'],
      ['Analitika', 'Start-parametr, hodisa va CRM statusi', 'O‘tish, dialog, lid va sotuvni ajratadi'],
      ['Kirish va komissiya', 'Kabinet egasi, rollar va tashqi to‘lovlar', 'Yashirin xarajat va bog‘liqlikni kamaytiradi'],
    ]),
  ]);

  upsertFaq(page, /Telegram reklama qancha turadi/i, {
    q: 'Telegram reklama qancha turadi?',
    a: 'Telegram Ads CPM auksioni bilan ishlaydi. Rasmiy yo‘riqnomada minimal CPM 0,1 Toncoin deb ko‘rsatilgan, lekin real stavka va byudjet kontekst hamda auksionga bog‘liq. Media byudjet, jamoa ishi, manzil, analitika va mumkin bo‘lgan komissiyalar alohida yoziladi.',
  });
  upsertFaq(page, /2 million|2 mln|katta depozit/i, {
    q: 'Telegram Ads uchun qat’iy katta depozit kerakmi?',
    a: 'Barcha kirish yo‘llari uchun bitta universal talab yo‘q. Telegram Ads joriy kabineti, tanlangan to‘lov yo‘li yoki provayder sharti farq qilishi mumkin. Ishga tushirishdan oldin birlamchi manba, shartnoma va barcha komissiyalar tekshiriladi.',
  });
  upsertFaq(page, /minimal.*byudjet|eng kam.*byudjet/i, {
    q: 'Telegram Ads sinov byudjeti qanday belgilanadi?',
    a: 'Rasmiy hujjat minimal CPM’ni beradi, lekin universal kampaniya byudjetini bermaydi. Limit kontekstlar, xabar variantlari, kutiladigan ko‘rsatuv hajmi, kanal, bot yoki sayt tayyorligi va oldindan belgilangan stop-rule bo‘yicha hisoblanadi.',
  });
  removeFaq(page, /500\s*€|0,01\s*€|0,05\s*€|resseller.*(?:2026|avgust)/i);

  page.sources = [
    {
      title: 'Telegram Ad Platform — Getting Started',
      url: 'https://ads.telegram.org/getting-started',
      note: 'Minimal CPM 0,1 Toncoin, CPM auksioni, e’lon byudjeti va ochiq kanallar. 2026-08-31 da tekshirildi.',
    },
    {
      title: 'Telegram Ad Platform — Terms of Service',
      url: 'https://ads.telegram.org/tos',
      note: 'Platforma xizmat parametrlarini, jumladan minimal CPM’ni o‘zgartirishi mumkin. 2026-08-31 da tekshirildi.',
    },
    {
      title: 'Telegram Ads Guidelines',
      url: 'https://ads.telegram.org/guidelines',
      note: 'E’lon va manzil talablari. 2026-08-31 da tekshirildi.',
    },
  ];
  touch(page);
  write(file, page);
}

function updateInternetHubRu() {
  const file = 'content/pages/ru/internet-reklama-tashkent.json';
  const page = read(file);
  const heading = findBody(
    page,
    (block) => block?.type === 'h2' && block.text === 'AI-бот после рекламы: чтобы не терять клиентов',
  );
  heading.block.text = 'AI-бот после рекламы: быстрый следующий шаг';

  const measurement = findBody(
    page,
    (block) => block?.type === 'p' && /Реклама работает, если бизнес видит/i.test(block.text || ''),
  );
  measurement.block.text =
    'Результат оценивается по уровням воронки: показ и клик, начатый контакт, отправленная заявка, квалифицированный лид, сделка и продажа. CTR, CPC и CPL помогают управлять рекламой, но не заменяют статусы CRM и обратную связь менеджеров. Контактный клик не считается квалифицированным обращением, а заявка не считается подтверждённой продажей.';

  const why = findBody(
    page,
    (block) => block?.type === 'p' && /GPTBot\.uz смотрит на рекламу/i.test(block.text || ''),
  );
  why.block.text =
    'GPTBot.uz рассматривает рекламу как digital-контур обращений: рекламная кампания, сайт или лендинг, AI-бот, Telegram, CRM и аналитика. Цель связки — сократить задержку ответа, сохранить контекст и снизить риск потери обращения после клика. Можно начать с простой схемы и расширять её только по данным.';
  touch(page);
  write(file, page);
}

function updateInternetHubUz() {
  const file = 'content/pages/uz/internet-reklama-toshkent.json';
  const page = read(file);
  page.heroSubtitle =
    'Internet reklama klikdan keyingi yo‘l bilan birga ishlaydi: taklif, qo‘nish sahifasi yoki messenjer, hodisa, menejer va CRM statusi. Har bir bosqich alohida o‘lchanadi; sotuv natijasi reklama kabinetining o‘zi bilan kafolatlanmaydi.';

  const metaParagraph = findBody(
    page,
    (block) => block?.type === 'p' && /Instagram va Facebook reklamasi taklifni/i.test(block.text || ''),
  );
  const bodyHasSmm = page.bodyBlocks.some(
    (block) => Array.isArray(block?.links) && block.links.some((link) => link.target === '/uz/smm-xizmatlari/'),
  );
  if (!bodyHasSmm) {
    insertAfterBodyIndex(page, metaParagraph.index, [
      {
        type: 'linkp',
        text: 'Pullik tarqatish va doimiy sahifa yuritish bir xil xizmat emas. Organik kontent, rubrika, moderatsiya va profil ishonchi uchun {smm} alohida scope sifatida rejalashtiriladi.',
        links: [
          {
            token: 'smm',
            target: '/uz/smm-xizmatlari/',
            anchor: 'Toshkentdagi SMM xizmatlari',
          },
        ],
      },
    ]);
  }

  const funnel = findBody(
    page,
    (block) => block?.type === 'p' && /Shuning uchun reklama tizimi yagona zanjir/i.test(block.text || ''),
  );
  const bodyHasSite = page.bodyBlocks.some(
    (block) => Array.isArray(block?.links) && block.links.some((link) => link.target === '/uz/sayt-yaratish/'),
  );
  if (!bodyHasSite) {
    insertAfterBodyIndex(page, funnel.index + (bodyHasSmm && metaParagraph.index < funnel.index ? 1 : 0), [
      {
        type: 'linkp',
        text: 'Klikdan keyin alohida xizmat sahifasi kerak bo‘lsa, {site} scope’i baholanadi. Birinchi javob va kelishilgan savollarni avtomatlashtirish kerak bo‘lsa, {bot} keyingi qadam bo‘lishi mumkin.',
        links: [
          {
            token: 'site',
            target: '/uz/sayt-yaratish/',
            anchor: 'biznes uchun sayt yaratish',
          },
          {
            token: 'bot',
            target: '/uz/biznes-uchun-ai-bot/',
            anchor: 'biznes uchun AI-bot',
          },
        ],
      },
    ]);
  }

  const stageFour = findBody(
    page,
    (block) => block?.type === 'p' && /Reklamadan keyin ariza kelsa/i.test(block.text || ''),
  );
  stageFour.block.text =
    'Reklamadan keyin foydalanuvchi aniq va tez keyingi qadamni kutadi. AI-bot kelishilgan savollarni berishi, ism, telefon va so‘rovni yig‘ishi hamda kontekstni menejerga uzatishi mumkin. Javob tezligi va malakali arizaga ta’sir faqat loyiha hodisalari va CRM statuslari bilan tekshiriladi.';

  replaceHeadingSection(page, 'Narx qanday shakllanadi', 'Reklama ishlayotganini qanday bilish mumkin', [
    { type: 'h2', text: 'Narx va smeta qanday shakllanadi' },
    compareTableUz([
      ['Jamoa ishi', 'Kanal strategiyasi, sozlash, ishga tushirish, hisobot va optimallashtirish', 'Bir martalik ish yoki oylik yuritish'],
      ['Media byudjet', 'Limit, valyuta, kabinet egasi va to‘ldirish tartibi', 'Platformaga alohida to‘lanadi'],
      ['Kreativ va kontent', 'Formatlar, tillar, moslashtirish va iteratsiyalar soni', 'Scope ichida yoki alohida paket'],
      ['Qo‘nish sahifasi', 'Yangi sahifa, mavjud sahifani yaxshilash yoki messenjer yo‘li', 'Ish hajmiga ko‘ra'],
      ['Analitika va CRM', 'UTM, hodisa, lid maydoni, status va qayta aloqa', 'Bazaviy sozlashdan integratsiyagacha'],
      ['Tashqi servis', 'CRM, call-tracking, konnektor va provayder komissiyasi', 'Ta’minotchi tarifi bo‘yicha alohida'],
    ]),
    {
      type: 'p',
      text: 'Smetada kiritilgan ishlar, istisnolar, egasi, qabul mezoni va scope o‘zgarsa tartib yoziladi. Universal bozor narxi nisha, kanal va tayyorlikni bilmasdan aniq loyiha smetasi bo‘la olmaydi.',
    },
  ]);

  const measurement = findBody(
    page,
    (block) => block?.type === 'p' && /Reklama biznesga shunchaki ko‘rsatuv/i.test(block.text || ''),
  );
  measurement.block.text =
    'Natija voronka bosqichlari bo‘yicha baholanadi: ko‘rsatuv va klik, boshlangan aloqa, yuborilgan ariza, malakali lid, bitim va sotuv. CTR, CPC va CPL reklamani boshqarishga yordam beradi, lekin CRM statusi va menejer qayta aloqasini almashtirmaydi. Kontakt bosilishi malakali ariza, yuborilgan forma esa sotuv emas.';

  const summary = page.bodyBlocks.find(
    (block) => block?.type === 'list' && Array.isArray(block.items) && block.items.some((item) => /Instagram va Telegram reklamasi/i.test(item)),
  );
  if (!summary) throw new Error('Missing UZ internet summary');
  summary.items = [
    'Kanal vazifa, talab holati va sinov iqtisodiga ko‘ra tanlanadi.',
    'E’lon va keyingi sahifa yoki messenjer bir xil va’dani berishi kerak.',
    'AI-bot birinchi javobni tezlashtirishi va kontekstni menejerga uzatishi mumkin.',
    'Kontakt, yuborilgan ariza, malakali lid va sotuv alohida o‘lchanadi.',
    'CPL va sotuvga ta’sir faqat loyiha ma’lumotlari bilan tasdiqlanadi.',
  ];

  replaceFaq(page, /Internet reklama qancha turadi/i, {
    q: 'Internet reklama qancha turadi?',
    a: 'Narx jamoa ishi, media byudjet, kreativlar, qo‘nish sahifasi, analitika, CRM va tashqi servislar bo‘yicha alohida hisoblanadi. Aniq smeta uchun kanal, maqsad, geografiya, tillar va test hajmi brifda belgilanadi.',
  });
  removeFaq(page, /bozorda qancha turadi|Bozor mo‘ljallari|2026-yil avgust|500\s*€|minimal reklama byudjeti/i);
  upsertFaq(page, /Smetada nimalar/i, {
    q: 'Smetada nimalar alohida ko‘rsatiladi?',
    a: 'Jamoa ishi, platforma media byudjeti, kreativ ishlab chiqarish, qo‘nish sahifasi, hodisalar, CRM integratsiyasi va tashqi servislar. Har bir satr uchun hajm, egasi, istisno va qabul mezoni yoziladi.',
  });
  touch(page);
  write(file, page);
}

function updateSmmUz() {
  const file = 'content/pages/uz/smm-xizmatlari.json';
  const page = read(file);
  page.heroSubtitle =
    'Instagram va Telegram uchun strategiya, kontent, nashr va moderatsiyani tashkil qilamiz. Direct murojaatlari uchun javob tartibi, insonga uzatish va o‘lchash hodisalari alohida kelishiladi.';
  page.ogDescription =
    'Strategiya, kontent reja, ishlab chiqarish, moderatsiya va murojaatlarni o‘lchash. Pullik reklama va media byudjet alohida scope.';

  renameToc(page, 'bozor-narxlari', 'Takliflarni solishtirish');
  replaceSection(page, 'bozor-narxlari', 'SMM takliflarini qanday solishtirish', [
    {
      type: 'p',
      text: '“Sahifani yuritish” bir xil nom bilan turli hajmni anglatadi. Taklifda strategiya, kontent formati, suratga olish, til, moderatsiya, pullik reklama va hisobot alohida ko‘rsatilishi kerak.',
    },
    compareTableUz([
      ['Strategiya', 'Auditoriya, kanal roli, rubrika va gipotezalar', 'Tasodifiy kontentdan ajratadi'],
      ['Kontent', 'Post, stories, Reels, Telegram, til va moslashtirish soni', 'Haqiqiy hajmni ko‘rsatadi'],
      ['Ishlab chiqarish', 'Ssenariy, dizayn, montaj, suratga olish va safar', 'Ko‘pincha yashirin katta xarajat'],
      ['Moderatsiya', 'Ish vaqti, dialog hajmi va menejerga uzatish qoidasi', 'Mas’uliyat chegarasini belgilaydi'],
      ['Pullik reklama', 'Sozlash kiradimi va media byudjet qancha', 'SMM va target turli xizmat ekanini ko‘rsatadi'],
      ['Hisobot', 'Kontent signali, dialog, malakali murojaat va xulosa', 'Post soni natija isboti emas'],
    ]),
  ]);

  const heroClaim = page.bodyBlocks.find(
    (block) => block?.type === 'p' && /Obunachi soni oxirgi o‘rinda/i.test(block.text || ''),
  );
  if (heroClaim) {
    heroClaim.text =
      'Obunachi va qamrov yordamchi signallardir. Hisobotda boshlangan dialog, malakali murojaat, javob vaqti, keyingi qadam va CRM statusi alohida ko‘rsatiladi. Sun’iy auditoriya bu metrikalarni buzadi, shuning uchun nakrutka ishlatilmaydi.';
  }

  const promise = page.bodyBlocks.find(
    (block) => block?.type === 'p' && /Biz kafolatlangan sotuv/i.test(block.text || ''),
  );
  if (promise) {
    promise.text =
      'Biz sotuv yoki obunachi o‘sishini kafolatlamaymiz. Kelishilgan kontent hajmi, nashr jarayoni, moderatsiya, hodisalar, hisobot va xatolarni ko‘rib chiqish tartibi uchun javob beramiz. Murojaatni yetkazish bo‘yicha texnik va operatsion cheklovlar smetada ochiq yoziladi.';
  }

  replaceFaq(page, /Birinchi natijani qachon ko‘raman/i, {
    q: 'Birinchi natijani qachon baholash mumkin?',
    a: 'Profil va jarayon o‘zgarishi darhol ko‘rinishi mumkin, lekin biznes xulosasi uchun to‘liq davr va yetarli dialog kerak. Birinchi oy odatda baseline, kontent ritmi va moderatsiyani tekshirishga xizmat qiladi; barqaror o‘sish kafolatlanmaydi.',
  });
  removeFaq(page, /bozorda qancha turadi|Bozor mo‘ljallari|2026-yil avgust|~?5\s*mln|5–12\s*mln|minimal byudjet/i);
  upsertFaq(page, /SMM taklifini qanday solishtirish/i, {
    q: 'SMM taklifini qanday solishtirish kerak?',
    a: 'Kanal va til soni, post, stories va Reels hajmi, suratga olish, dizayn, moderatsiya vaqti, pullik reklama, hisobot va tashqi xarajatlarni bir xil satrlarda solishtiring.',
  });
  touch(page);
  write(file, page);
}

function updateSmmRu() {
  const file = 'content/pages/ru/smm-prodvizhenie-tashkent.json';
  const page = read(file);
  removeFaq(page, /по рынку|рыночн\w* ориентир|2026.{0,20}(?:август|08)|\d+[–-]\d+\s*млн\s*сум|minimal/i);
  upsertFaq(page, /Как сравнить SMM-пакеты/i, {
    q: 'Как сравнить SMM-пакеты?',
    a: 'Сопоставьте число каналов и языков, объём постов, stories и видео, съёмку, дизайн, модерацию, платную рекламу, отчётность и сторонние расходы. Рекламный бюджет площадки должен быть отделён от стоимости ведения.',
  });
  touch(page);
  write(file, page);
}

function strengthenCommercialClaimTests() {
  const file = 'tests/seo-commercial-claims.test.ts';
  let source = fs.readFileSync(abs(file), 'utf8');
  if (source.includes("commercial price guidance is scope-led")) return;
  source += `\n\ntest('commercial price guidance is scope-led and contains no volatile reseller snapshots', () => {\n  const files = [\n    'content/pages/ru/internet-reklama-tashkent.json',\n    'content/pages/ru/kontekstnaya-reklama-tashkent.json',\n    'content/pages/ru/targetirovannaya-reklama-tashkent.json',\n    'content/pages/ru/telegram-ads-uzbekistan.json',\n    'content/pages/ru/smm-prodvizhenie-tashkent.json',\n    'content/pages/ru/performance-marketing-tashkent.json',\n    'content/pages/uz/internet-reklama-toshkent.json',\n    'content/pages/uz/telegram-reklama.json',\n    'content/pages/uz/smm-xizmatlari.json',\n  ];\n  const volatile = /по рыночным ориентирам|Рыночные цены|Bozor narxlari|Bozor mo‘ljallari|eLama|500\\s*€|0,01\\s*€|0,05\\s*€|25[–-]27\\s*mln|2026-yil avgust|август 2026/i;\n  const deterministic = /снижает потери лидов|уменьшает итоговую стоимость лида|уменьшается итоговый CPL|arizalar tunda ham, navbatda ham yo‘qolmaydi|reklama byudjeti bekorga ketmaydi/i;\n  for (const file of files) {\n    const text = serialized(file);\n    assert.doesNotMatch(text, volatile, \`\${file} contains a volatile market/reseller price snapshot\`);\n    assert.doesNotMatch(text, deterministic, \`\${file} contains an unsupported deterministic outcome claim\`);\n  }\n});\n\ntest('Telegram money pages use current primary-source pricing boundaries', () => {\n  for (const file of ['content/pages/ru/telegram-ads-uzbekistan.json', 'content/pages/uz/telegram-reklama.json']) {\n    const page = read(file);\n    const text = JSON.stringify(page);\n    assert.match(text, /0,1 Toncoin/);\n    assert.match(text, /https:\\/\\/ads\\.telegram\\.org\\/getting-started/);\n    assert.match(text, /https:\\/\\/ads\\.telegram\\.org\\/tos/);\n    assert.doesNotMatch(text, /eLama|500\\s*€|0,01\\s*€|2 million|2 миллиона евро/);\n  }\n});\n\ntest('Uzbek internet advertising hub exposes commercial body bridges and funnel semantics', () => {\n  const page = read('content/pages/uz/internet-reklama-toshkent.json');\n  const bodyTargets = new Set<string>();\n  for (const block of page.bodyBlocks || []) for (const link of block.links || []) if (link?.target) bodyTargets.add(link.target);\n  for (const target of ['/uz/telegram-reklama/', '/uz/smm-xizmatlari/', '/uz/seo-xizmati/', '/uz/sayt-yaratish/', '/uz/biznes-uchun-ai-bot/']) assert.ok(bodyTargets.has(target), \`UZ advertising hub is missing body link to \${target}\`);\n  const text = JSON.stringify(page);\n  assert.match(text, /Kontakt.*malakali|Kontakt bosilishi malakali/i);\n  assert.match(text, /yuborilgan ariza.*sotuv/i);\n});\n`;
  fs.writeFileSync(abs(file), source, 'utf8');
  console.log(`[seo-commercial-review] strengthened ${file}`);
}

function updateReleaseNote() {
  const file = 'docs/seo/RELEASE_2026-08-31_HOT_TRAFFIC_FOUNDATION.md';
  let source = fs.readFileSync(abs(file), 'utf8');
  const addition = `\n## Final commercial-claim review\n\nA second review removed residual “market price” headings, reseller-specific thresholds and deterministic CPL/loss claims that survived the first transformation. Every paid-media page now answers price intent through scope, ownership, media-budget separation and acceptance criteria.\n\nThe RU/UZ Telegram pages retain only the current primary-source boundary: Telegram's official Getting Started guide lists a minimum CPM of 0.1 Toncoin, while the Terms allow Telegram to change service parameters including minimum CPM. Reseller deposits, country-specific euro floors and third-party audience estimates are not presented as platform facts. Sources were checked on 2026-08-31.\n\nThe Uzbek internet-advertising hub now has visible body links to Telegram advertising, SMM, SEO, website creation and the AI-bot service. Its funnel copy distinguishes a contact, submitted request, qualified lead and sale.\n`;
  if (!source.includes('## Final commercial-claim review')) {
    source += addition;
    fs.writeFileSync(abs(file), source, 'utf8');
    console.log(`[seo-commercial-review] updated ${file}`);
  }
}

updateRuPaidMediaComparisonSections();
updateTelegramRu();
updateTelegramUz();
updateInternetHubRu();
updateInternetHubUz();
updateSmmUz();
updateSmmRu();
strengthenCommercialClaimTests();
updateReleaseNote();
console.log('[seo-commercial-review] all corrections applied');
