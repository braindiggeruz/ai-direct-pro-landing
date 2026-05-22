// All copy in RU + UZ (Latin). Single source of truth.
export type Lang = 'ru' | 'uz';

export type Dict = {
  nav: { brand: string; cta: string };
  hero: {
    badge: string; h1a: string; h1b: string; sub: string;
    bullets: readonly string[];
    cta: string; ctaSecondary: string; micro: string;
    stats: readonly { k: string; v: string }[];
  };
  pain: { h: string; t: string; cards: readonly string[] };
  solution: {
    h: string; t: string;
    benefits: readonly { t: string; d: string }[];
    cta: string;
  };
  how: { h: string; steps: readonly { n: string; t: string; d: string }[] };
  demo: {
    h: string; sub: string; cta: string; typing: string;
    msgs: { c1: string; a1: string; c2: string; a2: string };
    lead: {
      title: string; name: string; phone: string; source: string;
      status: string; statusVal: string;
    };
  };
  niches: { h: string; sub: string; items: readonly string[] };
  offer: {
    h: string; t: string;
    cards: readonly { t: string; d: string }[];
    cta: string;
  };
  trust: { h: string; t: string; badges: readonly string[] };
  faq: { h: string; items: readonly { q: string; a: string }[] };
  final: { h: string; sub: string; cta: string; micro: string };
  footer: { brand: string; city: string; tag: string; privacy: string; consent: string };
  sticky: string;
};

export const i18n: Record<Lang, Dict> = {
  ru: {
    nav: {
      brand: 'AI Direct Pro',
      cta: 'Запустить демо',
    },
    hero: {
      badge: 'AI-сейлз для Instagram и Telegram',
      h1a: 'Ваш Instagram теряет клиентов,',
      h1b: 'пока менеджер молчит?',
      sub: 'AI-менеджер отвечает клиентам 24/7, собирает имя, телефон и передаёт горячие заявки вашему менеджеру.',
      bullets: [
        'Ответ за секунды, даже ночью',
        'RU + UZ общение',
        'Заявки сразу в Telegram / CRM',
        'Демо под вашу нишу',
      ],
      cta: 'Запустить демо в Telegram',
      ctaSecondary: 'Посмотреть, как работает',
      micro: 'Без сложной настройки. Покажем сценарий под вашу нишу.',
      stats: [
        { k: 'Ответ клиенту', v: 'сразу' },
        { k: 'Сбор контактов', v: 'автоматически' },
        { k: 'Передача лида', v: 'менеджеру' },
      ],
    },
    pain: {
      h: 'Проблема не в рекламе. Проблема в скорости ответа.',
      t: 'Вы платите за трафик, клиент пишет в Direct, но если ему ответили через час — он уже у конкурента.',
      cards: [
        'Клиент написал ночью — утром уже передумал.',
        'Менеджер забыл ответить в Direct.',
        'Заявка есть, но телефона нет.',
        'В Instagram и Telegram хаос.',
        'Реклама работает, но лиды теряются.',
      ],
    },
    solution: {
      h: 'AI-менеджер берёт первый контакт на себя',
      t: 'Он не заменяет вашего менеджера. Он делает то, что чаще всего теряется: быстро отвечает, задаёт правильные вопросы, собирает контакты и передаёт готовую заявку человеку.',
      benefits: [
        { t: 'Отвечает 24/7', d: 'Ночь, выходные, обед — клиент получает ответ сразу.' },
        { t: 'Понимает RU и UZ', d: 'Общается на языке вашего клиента.' },
        { t: 'Задаёт уточняющие вопросы', d: 'Доводит диалог до сути за 3–5 сообщений.' },
        { t: 'Собирает имя и телефон', d: 'Структурирует данные ещё до звонка менеджера.' },
        { t: 'Передаёт горячего лида', d: 'Готовая заявка приходит в Telegram или CRM.' },
        { t: 'Первый фильтр продаж', d: 'Отсекает спам и нецелевых, экономит время команды.' },
      ],
      cta: 'Получить AI-менеджера',
    },
    how: {
      h: 'Как это работает за 3 шага',
      steps: [
        { n: '01', t: 'Подключаем каналы', d: 'Instagram Direct, Telegram или другой мессенджер — настраиваем точку входа для заявок.' },
        { n: '02', t: 'AI квалифицирует клиента', d: 'Бот уточняет потребность, услугу, сроки, бюджет и контакт.' },
        { n: '03', t: 'Менеджер получает готовый лид', d: 'Вам приходит структурированная заявка: имя, телефон, интерес и источник.' },
      ],
    },
    demo: {
      h: 'Покажите клиенту скорость, а не ожидание',
      sub: 'Так выглядит первый контакт с AI-менеджером в реальном чате.',
      cta: 'Запустить такое демо',
      msgs: {
        c1: 'Здравствуйте, сколько стоит?',
        a1: 'Здравствуйте! Подскажите, какая услуга вас интересует?',
        c2: 'Хочу записаться / узнать цену',
        a2: 'Отлично. Как вас зовут и какой номер телефона для связи?',
      },
      lead: {
        title: 'Горячий лид',
        name: 'Имя',
        phone: 'Телефон',
        source: 'Источник',
        status: 'Статус',
        statusVal: 'Готов к передаче менеджеру',
      },
      typing: 'AI печатает…',
    },
    niches: {
      h: 'Особенно хорошо работает там, где заявки приходят в Direct',
      sub: 'AI отвечает, уточняет потребность и передаёт заявку.',
      items: [
        'Клиники и стоматологии',
        'Салоны красоты',
        'Учебные центры',
        'Магазины техники',
        'Недвижимость',
        'Туризм',
        'HoReCa',
        'Сервисный бизнес',
      ],
    },
    offer: {
      h: 'Получите демо под вашу нишу',
      t: 'Мы покажем, как AI-менеджер будет отвечать именно вашим клиентам: с вашими услугами, вопросами и логикой продаж.',
      cards: [
        { t: 'Мини-аудит', d: 'Покажем, где теряются заявки в вашей воронке.' },
        { t: 'Демо-сценарий', d: 'AI-диалог, собранный под вашу нишу.' },
        { t: 'Рекомендация', d: 'Как автоматизировать первый контакт уже сейчас.' },
      ],
      cta: 'Получить демо в Telegram',
    },
    trust: {
      h: 'Не магия. Просто быстрый первый контакт.',
      t: 'AI закрывает самую слабую точку воронки: момент между «клиент написал» и «менеджер ответил».',
      badges: [
        'Сценарий под нишу',
        'RU + UZ коммуникация',
        'Передача лида менеджеру',
        'Можно подключить CRM',
        'Telegram / Instagram логика',
        'Подходит для малого бизнеса',
      ],
    },
    faq: {
      h: 'Частые вопросы',
      items: [
        { q: 'Это заменит менеджера?', a: 'Нет. AI берёт первый контакт, отвечает быстро, собирает данные и передаёт горячего клиента человеку.' },
        { q: 'Можно ли на русском и узбекском?', a: 'Да, сценарий можно адаптировать под RU и UZ Latin.' },
        { q: 'Нужен ли сайт?', a: 'Нет. Можно вести клиента из Telegram Ads на этот мини-лендинг и дальше в Telegram-бот.' },
        { q: 'Для каких бизнесов подходит?', a: 'Для тех, кто получает заявки в Instagram Direct, Telegram или WhatsApp: клиники, салоны, обучение, магазины, услуги, недвижимость.' },
        { q: 'Что будет после заявки?', a: 'Вы попадёте в Telegram, где можно посмотреть демо и обсудить сценарий под вашу нишу.' },
      ],
    },
    final: {
      h: 'Пока менеджер думает — клиент уходит',
      sub: 'Запустите AI-сейлза, который отвечает сразу, собирает контакты и не теряет заявки.',
      cta: 'Перейти в Telegram',
      micro: 'Демо займёт 1 минуту.',
    },
    footer: {
      brand: 'AI Direct Pro',
      city: 'Tashkent, Uzbekistan',
      tag: 'Telegram / Instagram AI Sales Automation',
      privacy: 'Политика конфиденциальности',
      consent: 'Оставляя заявку, вы соглашаетесь на обработку данных.',
    },
    sticky: 'Запустить демо',
  },

  uz: {
    nav: {
      brand: 'AI Direct Pro',
      cta: 'Demoni ishga tushirish',
    },
    hero: {
      badge: 'Instagram va Telegram uchun AI-sotuvchi',
      h1a: 'Instagram’da mijozlar',
      h1b: 'yo‘qolayaptimi?',
      sub: 'AI-menejer 24/7 javob beradi, ism va telefonni yig‘adi, issiq lidlarni menejeringizga yuboradi.',
      bullets: [
        'Bir necha soniyada javob beradi',
        'RU + UZ muloqot',
        'Lidlar Telegram / CRM ga keladi',
        'Nishingiz uchun demo',
      ],
      cta: 'Telegram’da demoni ko‘rish',
      ctaSecondary: 'Qanday ishlashini ko‘rish',
      micro: 'Murakkab sozlash kerak emas. Nishingiz uchun ssenariy ko‘rsatamiz.',
      stats: [
        { k: 'Mijozga javob', v: 'darhol' },
        { k: 'Kontakt yig‘ish', v: 'avtomatik' },
        { k: 'Lidni uzatish', v: 'menejerga' },
      ],
    },
    pain: {
      h: 'Muammo reklamada emas. Javob tezligida.',
      t: 'Siz reklama uchun pul to‘laysiz, mijoz yozadi, lekin javob kechiksa — u raqobatchiga ketadi.',
      cards: [
        'Mijoz kechqurun yozdi — ertalab fikri o‘zgardi.',
        'Menejer Direct’da javob berishni unutdi.',
        'Ariza bor, telefon yo‘q.',
        'Instagram va Telegram’da tartib yo‘q.',
        'Reklama ishlaydi, lekin lidlar yo‘qoladi.',
      ],
    },
    solution: {
      h: 'AI-menejer birinchi kontaktni o‘ziga oladi',
      t: 'U sizning menejeringizni almashtirmaydi. U eng ko‘p yo‘qoladigan ishni qiladi: tez javob beradi, to‘g‘ri savol beradi, kontakt yig‘adi va tayyor lidni odamga uzatadi.',
      benefits: [
        { t: '24/7 javob beradi', d: 'Tun, dam olish kuni, tushlik — mijoz darhol javob oladi.' },
        { t: 'RU va UZ tushunadi', d: 'Mijozingizning tilida muloqot qiladi.' },
        { t: 'Aniqlovchi savollar beradi', d: '3–5 xabarda muhimini ochadi.' },
        { t: 'Ism va telefonni yig‘adi', d: 'Qo‘ng‘iroqgacha ma’lumotni tayyorlaydi.' },
        { t: 'Issiq lidni uzatadi', d: 'Tayyor ariza Telegram yoki CRM’ga keladi.' },
        { t: 'Birinchi sotuv filtri', d: 'Spam va nomaqsadlilarni kesadi, vaqtni tejaydi.' },
      ],
      cta: 'AI-menejerni olish',
    },
    how: {
      h: 'Bu 3 qadamda qanday ishlaydi',
      steps: [
        { n: '01', t: 'Kanallarni ulaymiz', d: 'Instagram Direct, Telegram yoki boshqa messenger — kirish nuqtasini sozlaymiz.' },
        { n: '02', t: 'AI mijozni saralaydi', d: 'Bot ehtiyoj, xizmat, muddat, byudjet va kontaktni aniqlaydi.' },
        { n: '03', t: 'Menejer tayyor lid oladi', d: 'Sizga tuzilgan ariza keladi: ism, telefon, qiziqish va manba.' },
      ],
    },
    demo: {
      h: 'Mijozga kutishni emas, tezlikni ko‘rsating',
      sub: 'AI-menejer bilan birinchi kontakt shunday ko‘rinadi.',
      cta: 'Bunday demoni ishga tushirish',
      msgs: {
        c1: 'Assalomu alaykum, narxi qancha?',
        a1: 'Assalomu alaykum! Qaysi xizmat sizni qiziqtiradi?',
        c2: 'Yozilmoqchiman / narxni bilmoqchiman',
        a2: 'Yaxshi. Ismingiz va aloqa uchun telefon raqamingiz?',
      },
      lead: {
        title: 'Issiq lid',
        name: 'Ism',
        phone: 'Telefon',
        source: 'Manba',
        status: 'Holat',
        statusVal: 'Menejerga uzatishga tayyor',
      },
      typing: 'AI yozmoqda…',
    },
    niches: {
      h: 'Direct’dan arizalar kelgan joyda ayniqsa yaxshi ishlaydi',
      sub: 'AI javob beradi, ehtiyojni aniqlaydi va arizani uzatadi.',
      items: [
        'Klinika va stomatologiya',
        'Go‘zallik salonlari',
        'O‘quv markazlari',
        'Texnika do‘konlari',
        'Ko‘chmas mulk',
        'Turizm',
        'HoReCa',
        'Servis biznesi',
      ],
    },
    offer: {
      h: 'Nishingiz uchun demo oling',
      t: 'AI-menejer aynan sizning mijozlaringizga qanday javob berishini ko‘rsatamiz: sizning xizmatlaringiz, savollar va sotuv mantig‘i bilan.',
      cards: [
        { t: 'Mini-audit', d: 'Voronkangizda lidlar qayerda yo‘qolishini ko‘rsatamiz.' },
        { t: 'Demo-ssenariy', d: 'Nishingizga moslangan AI-dialog.' },
        { t: 'Tavsiya', d: 'Birinchi kontaktni qanday avtomatlashtirish.' },
      ],
      cta: 'Telegram’da demo olish',
    },
    trust: {
      h: 'Sehr emas. Shunchaki tez birinchi kontakt.',
      t: 'AI voronkaning eng zaif nuqtasini yopadi: «mijoz yozdi» va «menejer javob berdi» o‘rtasidagi vaqt.',
      badges: [
        'Nishga moslangan ssenariy',
        'RU + UZ kommunikatsiya',
        'Lidni menejerga uzatish',
        'CRM ulanishi mumkin',
        'Telegram / Instagram mantig‘i',
        'Kichik biznes uchun mos',
      ],
    },
    faq: {
      h: 'Tez-tez beriladigan savollar',
      items: [
        { q: 'Bu menejerni almashtiradimi?', a: 'Yo‘q. AI birinchi kontaktni oladi, tez javob beradi, ma’lumot yig‘adi va issiq mijozni odamga uzatadi.' },
        { q: 'Rus va o‘zbek tilida ishlaydimi?', a: 'Ha, ssenariyni RU va UZ Latin uchun moslash mumkin.' },
        { q: 'Sayt kerakmi?', a: 'Yo‘q. Mijozni Telegram Ads’dan ushbu mini-lendingga va keyin Telegram-botga olib borish mumkin.' },
        { q: 'Qaysi biznes uchun mos?', a: 'Instagram Direct, Telegram yoki WhatsApp orqali ariza qabul qiladiganlar uchun: klinika, salon, ta’lim, do‘kon, xizmat, ko‘chmas mulk.' },
        { q: 'Arizadan keyin nima bo‘ladi?', a: 'Siz Telegram’ga o‘tasiz, u yerda demoni ko‘rib, nishingiz uchun ssenariyni muhokama qilamiz.' },
      ],
    },
    final: {
      h: 'Menejer o‘ylab turguncha — mijoz ketadi',
      sub: 'Darhol javob beradigan, kontakt yig‘adigan va lidlarni yo‘qotmaydigan AI-sotuvchini ishga tushiring.',
      cta: 'Telegram’ga o‘tish',
      micro: 'Demo 1 daqiqa oladi.',
    },
    footer: {
      brand: 'AI Direct Pro',
      city: 'Toshkent, O‘zbekiston',
      tag: 'Telegram / Instagram AI Sales Automation',
      privacy: 'Maxfiylik siyosati',
      consent: 'Ariza qoldirib, ma’lumotlarni qayta ishlashga rozilik bildirasiz.',
    },
    sticky: 'Demoni ishga tushirish',
  },
};
