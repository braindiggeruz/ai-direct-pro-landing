# Lens niche-playbooks: builds the clusters from the measured rows of this lens
# (kw1_metrics_raw.json, kw2_metrics_raw.json, research1_summary.json) and writes computed.json.
# Rules:
#  * every counted keyword must have been measured in this lens (location 2860), otherwise the script stops;
#  * dedupe: one Google Ads bucket counted once. Two phrases are one bucket when they differ only by
#    stop-words / word order (для, в, как, на, по, uchun) or are listed in SHARED below, AND have identical
#    volume + CPC + competition. A phrase repeated in two clusters is counted in the first one only.
#  * visits/day = D x CTR / 30 x 1.5 x AIO; CTR pos6 0.61-1.10 %, pos3 3.59 %; AIO x0.53-0.655 applied to every
#    cluster (all 4 SERPs of this lens and all SERPs of the sibling lenses showed an AI Overview).
import json, os, re
HERE = os.path.dirname(os.path.abspath(__file__))

M = {}
for f in ('kw1_metrics_raw.json', 'kw2_metrics_raw.json'):
    for r in json.load(open(os.path.join(HERE, f), encoding='utf-8'))['keywords']:
        M[r['keyword'].lower()] = (r.get('search_volume'), r.get('cpc'), r.get('competition'))
for seed in json.load(open(os.path.join(HERE, 'research1_summary.json'), encoding='utf-8'))['seeds'].values():
    for k, v, c, comp in seed['kept']:
        M.setdefault(k.lower(), (v, c, comp))

STOP = {'для', 'в', 'как', 'на', 'по', 'uchun'}
SHARED = [("o'quv markazi reklama", "o'quv markazlari reklama"), ("маркетинг стратегия", "маркетинговые стратегии")]

def norm(k):
    return ' '.join(sorted(t for t in k.split() if t not in STOP))

CLUSTERS = [
 dict(id='oquv-markazi-reklama', priority=1,
      name="O‘quv markazi reklamasi: o‘quvchi jalb qilish rejasi (UZ, RU-пара)",
      kw={'uz': ["o'quv markazi reklama", "o'quv markazlari reklama", "o'quv markaz ochish", 'kurs reklama'],
          'ru': ['реклама учебного центра', 'реклама для учебного центра', 'продвижение учебного центра', 'реклама образовательного центра',
                 'реклама курсов', 'реклама образовательных услуг', 'как привлечь учеников в учебный центр', 'маркетинг в образовании',
                 'открыть учебный центр в ташкенте', 'реклама учебного центра текст', 'как открыть учебный центр', 'открыть учебный центр',
                 'бизнес план учебного центра']},
      excluded={'ingliz tili reklama (210)': 'двусмысленно: «реклама на английском» (учебный интент) или реклама курсов английского; без SERP не считаем',
                "o'quv markazi nomlari (20), название для учебного центра (10)": 'нейминг: кластер 5 линзы prices-tools',
                "o'quv markaz reklama, oquv markazi reklama, o'quv markazi reklama matni/video/banner, o'quvchi jalb qilish": 'null (<10/мес): спрос сидит в одной корзине «o‘quv markazi reklama»'},
      existing_url='/uz/oquv-markazi-uchun-ai-bot/',
      page="Новая UZ-статья /uz/blog/oquv-markazi-reklamasi/ (владелец «o‘quv markazi reklama»): сезонность набора (август–сентябрь, январь), "
           "Instagram/Telegram-таргет на родителей и абитуриентов, посевы в районных Telegram-каналах, пробный урок как оффер, "
           "что считать (стоимость заявки, доходимость до пробного, оплата), чек-лист перед запуском. Ссылки из /uz/oquv-markazi-uchun-ai-bot/ "
           "(блок «arizalar kelgach») и на /uz/instagram-target-yoqish/ + /uz/telegram-reklama/. RU-пара /ru/blog/reklama-uchebnogo-tsentra-tashkent/ "
           "для RU-хвоста, ссылка из /ru/ai-bot-dlya-uchebnogo-tsentra/. Инструмент: роль AI-чата «reklama matni o‘quv markazi uchun» (шаблон уже "
           "есть в чате — «реклама для Telegram»).",
      lead='Instagram/Facebook-таргет (/uz/instagram-target-yoqish/), Telegram-реклама (/uz/telegram-reklama/), затем AI-бот для ответов родителям',
      effort='M', honesty='low',
      serp="o‘quv markazi reklama: видео-блок №1 + AIO №2; органика = goldenpages.uz (каталог), YouTube «o‘quv markaz ochish», Yandex Maps, "
           "YouTube-блогер, infoedu.uz (субсидия на открытие, 08.02.2026), schoolup.uz (CRM), scribd (презентация). Статьи «как рекламировать "
           "учебный центр» нет ни одной. Интент владельческий (открытие, субсидия, CRM). RU-хвост: SERP не снят.",
      weak='weak'),
 dict(id='salon-reklama', priority=2,
      name="Go‘zallik saloni va barbershop reklamasi (UZ + RU «реклама салона красоты»)",
      kw={'uz': ["go'zallik saloni reklama", 'salon reklama', 'barbershop reklama', "go'zallik saloni ochish"],
          'ru': ['реклама салона красоты', 'реклама для салона красоты', 'продвижение салона красоты', 'маркетинг для салона красоты',
                 'таргет для салона красоты', 'реклама салона красоты в инстаграм', 'сайт для салона красоты', 'как привлечь клиентов в салон красоты',
                 'акции для салона красоты', 'реклама салона красоты текст', 'как открыть салон красоты', 'открыть салон красоты',
                 'бизнес план салона красоты', 'как найти клиентов в бьюти сфере']},
      excluded={'salon nomlari (30), go‘zallik saloni nomlari (20), слоган для салона красоты (10)': 'нейминг/слоганы: кластер 5 prices-tools',
                'gozallik saloni reklama, go‘zallik saloni reklama matni/video, salon reklama matni, sartaroshxona reklama, manikyur reklama': 'null (<10/мес)'},
      existing_url='/ru/ai-bot-dlya-salona-krasoty/',
      page="Новая UZ-статья /uz/blog/gozallik-saloni-reklamasi/ (go‘zallik saloni, salon, barbershop): портфолио-рилс до/после, "
           "таргет на 3–5 км от салона, онлайн-запись вместо «direktga yozing», карта 2GIS/Yandex/Google, акции без демпинга, что считать. "
           "RU-пара /ru/blog/reklama-salona-krasoty-tashkent/. Ссылки: из /ru/ai-bot-dlya-salona-krasoty/ (самая видимая нишевая страница: 155 показов "
           "за 3 мес.) и /uz/salon-uchun-ai-bot/; наружу на /uz/instagram-target-yoqish/, /ru/targetirovannaya-reklama-tashkent/, /ru/lokalnoe-seo-tashkent/.",
      lead='Instagram-таргет + SMM (/uz/smm-xizmatlari/, /ru/smm-prodvizhenie-tashkent/), локальное SEO, AI-администратор записи',
      effort='M', honesty='low',
      serp="go‘zallik saloni reklama: AIO №1 + видео; органика = Instagram-профили салонов и рилсы, Facebook-страница салона, рилс типографии "
           "(наружная реклама), Pinterest-доска «Реклама салон красоты». Ни одной статьи. GSC уже ловит хвост: «сколько стоит лиды для салона "
           "красоты» 7 показов (поз. 26), «ии для салона красоты» 20.",
      weak='weak'),
 dict(id='restoran-kafe-reklama', priority=4,
      name='Restoran, kafe va fast food reklamasi (RU + UZ)',
      kw={'uz': ['fast food reklama', 'burger reklama', 'pizza reklama', 'kafe reklama', 'restoran marketing', 'restoran instagram'],
          'uzc': ['ресторан реклама', 'кафе реклама'],
          'ru': ['реклама кафе в инстаграм', 'реклама ресторана', 'реклама для ресторана', 'продвижение ресторана', 'маркетинг ресторана',
                 'маркетинг для ресторана', 'реклама кафе', 'продвижение кафе', 'сайт для ресторана', 'раскрутка ресторана',
                 'как привлечь клиентов в ресторан', 'как привлечь клиентов в кафе', 'ресторанный маркетинг', 'реклама кафе примеры', 'реклама кафе текст',
                 'рекламный текст для ресторана', 'акции для ресторана', 'реклама ресторана примеры', 'реклама ресторана текст',
                 'как увеличить продажи в ресторане', 'открыть кафе', 'как открыть кафе', 'как открыть ресторан', 'бизнес план кафе',
                 'продвижение кафе в инстаграм', 'продвижение ресторана в интернете', 'продвижение ресторанного бизнеса']},
      excluded={'fast food nomlari (110), kafe nomlari (70), restoran nomlari (10), название для кафе/ресторана, слоган для кафе': 'нейминг: кластер 5 prices-tools',
                'restoran reklama, restoran uchun reklama, kafe reklamasi, choyxona/oshxona reklama': 'null (<10/мес)'},
      existing_url='/ru/ai-bot-dlya-horeca/',
      page="Новая RU-статья /ru/blog/reklama-kafe-i-restorana-tashkent/ + UZ /uz/blog/restoran-va-kafe-reklamasi/ (с разделом fast food): "
           "рилс с едой, таргет по радиусу и времени обеда/ужина, Telegram-посевы, карточки на картах и отзывы, доставка через агрегаторы "
           "против своего канала, акции и как не убить маржу, что считать (заказ, средний чек, повтор). Ссылки из /ru/ai-bot-dlya-horeca/, "
           "/uz/horeca-uchun-ai-bot/, /ru/ai-bot-dlya-dostavki-edy/.",
      lead='Instagram-таргет и SMM, Telegram Ads/посевы (/ru/telegram-ads-uzbekistan/), локальное SEO',
      effort='M', honesty='low',
      serp='SERP не снят (лимит 4 запроса). Приор: AIO и видео, как во всех 8 снятых выдачах линз. CPC: «реклама ресторана» $2,90.',
      weak='mixed'),
 dict(id='stomatologiya-klinika-reklama', priority=3,
      name='Реклама стоматологии и клиники в Ташкенте (RU, UZ-пара) — самый дорогой клик',
      kw={'ru': ['стоматология реклама', 'реклама стоматологии', 'реклама для стоматологии', 'продвижение стоматологии', 'маркетинг стоматологии',
                 'реклама стоматологической клиники', 'таргет для стоматологии', 'реклама стоматологии в инстаграм', 'продвижение стоматологии в инстаграм',
                 'контекстная реклама для стоматологии', 'сайт для стоматологии', 'как привлечь клиентов в стоматологию', 'маркетинг в стоматологии',
                 'реклама стоматологии примеры', 'реклама стоматологии текст', 'как открыть стоматологию', 'открыть стоматологию', 'бизнес план стоматологии',
                 'реклама клиники', 'реклама для клиники', 'продвижение клиники', 'маркетинг клиники', 'маркетинг для клиники', 'реклама медицинского центра',
                 'продвижение медицинского центра', 'реклама медицинских услуг', 'сайт для клиники', 'раскрутка клиники', 'как привлечь пациентов в клинику',
                 'как привлечь пациентов', 'медицинский маркетинг', 'маркетинг в медицине'],
          'uz': ['klinika reklama', 'klinika marketing']},
      excluded={'dorixona reklama (70)': 'аптеки: реклама лекарств ограничена законом, интент не ясен (вакансии/объявления)',
                'название для стоматологии (10)': 'нейминг',
                'stomatologiya reklama, stomatologiya uchun reklama, tish klinikasi reklama, klinika uchun reklama': 'null (<10/мес): узбекская латиница по медицине пуста'},
      existing_url='/ru/ai-bot-dlya-kliniki/',
      page="Новая RU-статья /ru/blog/reklama-stomatologii-i-kliniki-tashkent/ + UZ /uz/blog/stomatologiya-va-klinika-reklamasi/: каналы "
           "(Google-поиск по услуге и району, карты, Instagram-таргет на конкретную услугу, Telegram), посадочная под услугу, запись и "
           "напоминания, что считать (стоимость первичного пациента, доходимость). Отдельный нейтральный блок «что требует закон о рекламе "
           "для медицинских услуг» со ссылками на lex.uz, без юридических советов и без обещаний результата лечения. Ссылки из /ru/ai-bot-dlya-kliniki/, "
           "/uz/klinika-uchun-ai-bot/ и трёх блог-статей про бота для клиник; наружу на /ru/kontekstnaya-reklama-tashkent/ и /ru/targetirovannaya-reklama-tashkent/.",
      lead='Контекстная реклама Google/Яндекс (/ru/kontekstnaya-reklama-tashkent/), таргет, локальное SEO, AI-бот записи',
      effort='M', honesty='medium',
      serp='SERP не снят. CPC: «реклама стоматологии» $6,68, «маркетинг для клиники» $3,56 — самые дорогие клики линзы: за эти слова в '
           'Google Ads уже борются. Приор: AIO; в Узбекистане по нишевой рекламе в 4 снятых выдачах статей не было.',
      weak='mixed'),
 dict(id='kochmas-mulk-reklama', priority=11,
      name='Реклама недвижимости, ЖК и застройщика (RU)',
      kw={'ru': ['реклама недвижимости', 'продвижение недвижимости', 'маркетинг недвижимости', 'маркетинг для недвижимости', 'реклама застройщика',
                 'реклама жк', 'реклама новостроек', 'реклама агентства недвижимости', 'реклама недвижимости в инстаграм', 'сайт для недвижимости',
                 'маркетинг в недвижимости', 'реклама риэлтора', 'реклама недвижимости примеры', 'реклама недвижимости текст']},
      excluded={'как продать квартиру быстро (10)': 'частный продавец, не бизнес',
                "ko'chmas mulk reklama, uy sotish reklama, quruvchi reklama, yangi uylar reklama": 'все null (<10/мес): узбекского спроса нет'},
      existing_url='/ru/ai-bot-dlya-agentstva-nedvizhimosti/',
      page="Новая RU-статья /ru/blog/reklama-nedvizhimosti-i-zhk-tashkent/: лид-формы против мессенджеров, квиз «район/бюджет/срок», "
           "Telegram-каналы о недвижимости, OLX/uybor как канал, видео-обзоры объектов, квалификация лида до звонка, что считать "
           "(стоимость квалифицированного лида, показ, бронь). Ссылка из /ru/ai-bot-dlya-agentstva-nedvizhimosti/ (40 показов, поз. 8,8) "
           "и /uz/kochmas-mulk-agentligi-uchun-ai-bot/.",
      lead='Таргет с лид-формами + сайт/лендинг ЖК (/ru/razrabotka-saytov-tashkent/), AI-бот квалификации',
      effort='M', honesty='low',
      serp='SERP не снят. Приор: AIO; российские агентства и блоги CRM.',
      weak='mixed'),
 dict(id='kiyim-mebel-dokon-reklama', priority=10,
      name='Реклама магазина одежды и мебели (RU, UZ-пара)',
      kw={'ru': ['реклама магазина одежды', 'реклама для магазина одежды', 'маркетинг для магазина одежды', 'реклама одежды', 'таргет для магазина одежды',
                 'реклама магазина одежды в инстаграм', 'сайт для магазина одежды', 'раскрутка магазина одежды', 'как продвигать магазин одежды',
                 'как раскрутить магазин одежды', 'как продвигать бренд одежды', 'рекламный текст для магазина одежды', 'акции для магазина одежды',
                 'реклама магазина одежды текст', 'как открыть магазин одежды', 'открыть магазин одежды',
                 'реклама мебели', 'реклама для мебели', 'продвижение мебели', 'реклама мебельного магазина', 'реклама мебели в инстаграм',
                 'сайт для мебели', 'как продавать мебель', 'маркетинг мебельного магазина', 'реклама мебели текст'],
          'uz': ["kiyim do'koni ochish", 'mebel instagram']},
      excluded={'brend nomlari (390), название для магазина/бренда одежды': 'нейминг: кластер 5 prices-tools (там brend nomlari ещё не учтён — передать)',
                "kiyim do'koni reklama, kiyim reklama, mebel reklama": 'null (<10/мес)'},
      existing_url='/ru/ai-bot-dlya-magazina/',
      page="Две RU-статьи в одном шаблоне: /ru/blog/reklama-magazina-odezhdy-tashkent/ и /ru/blog/reklama-mebeli-tashkent/: каталог в "
           "Instagram/Telegram, рилс-примерки и интерьерные рилс, таргет с каталогом товаров, ретаргет, ответы «narxi qancha?» за минуты, "
           "доставка и оплата, что считать. UZ-пара — одна статья /uz/blog/kiyim-va-mebel-dokoni-reklamasi/. Ссылки из /ru/ai-bot-dlya-magazina/ "
           "и /uz/dokon-uchun-ai-bot/. Линза marketplaces-social-selling отдала «магазин одежды» этой линзе.",
      lead='Instagram-таргет с каталогом + SMM, сайт-каталог/интернет-магазин',
      effort='M', honesty='low',
      serp='SERP не снят. Приор: AIO; российские агентства/блоги.',
      weak='mixed'),
 dict(id='turizm-reklama', priority=12,
      name='Реклама турагентства (RU + UZ «turizm marketing»)',
      kw={'ru': ['реклама турагентства', 'реклама для турагентства', 'продвижение турагентства', 'реклама туров', 'реклама туристической компании',
                 'продвижение туристической компании', 'сайт для турагентства', 'как привлечь клиентов в турагентство', 'маркетинг в туризме',
                 'реклама в туризме', 'реклама турагентства примеры', 'реклама турагентства текст', 'открыть турагентство', 'маркетинговые стратегии в туризме'],
          'uz': ['turizm marketing']},
      excluded={'как открыть турагентство (10, CPC $16,12)': 'CPC-выброс одного запроса, интент — регистрация, не реклама'},
      existing_url='',
      page="Новая RU-статья /ru/blog/reklama-turagentstva-tashkent/ (умра/хадж — только нейтрально, без религиозных обещаний; "
           "сезонность, горящие туры в Telegram, лид-формы, визовые вопросы как контент) + раздел в UZ-хабе ниш. Нишевой AI-бот-страницы нет.",
      lead='Таргет с лид-формами, Telegram-реклама, SMM',
      effort='M', honesty='low',
      serp='SERP не снят. Приор: AIO.',
      weak='mixed'),
 dict(id='nishalar-hub', priority=5,
      name='Хаб «Реклама по нишам» + короткие разделы: фитнес, автосалон/автосервис, юристы, малый бизнес (RU + UZ)',
      kw={'ru': ['реклама фитнес клуба', 'реклама для фитнес клуба', 'продвижение фитнес клуба', 'маркетинг фитнес клуба', 'реклама спортзала',
                 'реклама фитнес центра', 'сайт для фитнес клуба', 'раскрутка фитнес клуба', 'как привлечь клиентов в фитнес клуб', 'реклама фитнес клуба текст',
                 'как открыть фитнес клуб',
                 'реклама автосалона', 'реклама для автосалона', 'маркетинг автосалона', 'реклама автосервиса', 'как привлечь клиентов в автосервис',
                 'акции для автосервиса', 'реклама автосервиса текст', 'как открыть автосервис', 'открыть автосервис',
                 'реклама юридических услуг', 'реклама юриста', 'реклама адвоката', 'реклама юридической компании', 'сайт для юридических услуг',
                 'маркетинг для юристов', 'как найти клиентов адвокату',
                 'маркетинг для малого бизнеса', 'как рекламировать бизнес', 'как сделать рекламу', 'бесплатная реклама', 'продвижение бизнеса',
                 'продвижение бизнеса в интернете', 'как продвигать бизнес', 'где дать рекламу'],
          'uz': ['fitnes reklama', 'fitnes marketing', 'fitnes instagram', 'avtoservis ochish', 'biznes reklama']},
      excluded={'avtosalon/yurist/fitnes uchun reklama (UZ)': 'null (<10/мес)',
                'реклама для малого бизнеса, продвижение малого бизнеса': 'null'},
      existing_url='/ru/ai-bot-dlya-nishi/',
      page="Хаб /ru/reklama-dlya-biznesa-po-nisham/ + /uz/biznes-uchun-reklama-nishalar-boyicha/ (тип — блог-хаб, не money-страница): "
           "таблица «ниша → где клиенты → какой канал → что считать», ссылки на 7 глубоких плейбуков (кластеры 1–7), короткие разделы с якорями "
           "для фитнеса, авто и юристов. Юристы/адвокаты: нейтральная оговорка о профессиональных ограничениях на рекламу адвокатов со ссылкой "
           "на источник, без советов. Входящие ссылки: /ru/ai-bot-dlya-nishi/, /ru/internet-reklama-tashkent/, /uz/internet-reklama-toshkent/.",
      lead='Все услуги через подбор канала: таргет, контекст, Telegram, SMM, сайт; форма «расскажите нишу — предложим канал»',
      effort='M', honesty='medium',
      serp='SERP не снят. Хвост из запросов по 10 в месяц; хаб нужен для перелинковки и для AI-ассистентов, а не ради объёма.',
      weak='mixed'),
 dict(id='biznes-goyalar', priority=7,
      name="Biznes g‘oyalar / бизнес-идеи в Узбекистане — с планом первых клиентов для каждой идеи",
      kw={'uz': ["biznes g'oyalar", "kichik biznes g'oyalar", "yangi biznes g'oyalar", "biznes g'oyalar 2025", "biznes g'oyalar 2026", 'biznes goyalar',
                 'biznes boshlash', 'biznes qilish', 'biznes sirlari', 'biznes ochish'],
          'uzc': ['бизнес ғоялар'],
          'ru': ['бизнес идеи', 'бизнес идеи в узбекистане', 'бизнес идеи 2026', 'бизнес с нуля', 'идеи для бизнеса', 'бизнес идеи 2025', 'малый бизнес идеи',
                 'бизнес идеи для женщин', 'бизнес идеи с минимальными вложениями', 'бизнес идеи ташкент', 'какой бизнес открыть', 'бизнес идеи узбекистан',
                 'какой бизнес открыть в ташкенте', 'открыть бизнес в узбекистане', 'бизнес в узбекистане', 'бизнес в ташкенте']},
      excluded={'kichik biznes (210), кичик бизнес (40)': 'голый термин: новости, кредиты, госпрограммы',
                'бизнес идеи для женщин и прочие «для россиян»': 'учтены, но SERP — российские листиклы'},
      existing_url='/uz/blog/biznes-reja-tuzish/',
      page="Новая UZ-статья /uz/blog/biznes-goyalar-ozbekiston/ и RU /ru/blog/biznes-idei-v-uzbekistane/: 15–20 идей, по каждой — "
           "кто покупатель, нужен ли сайт, где искать первых клиентов (канал), примерный стартовый маркетинг без обещаний дохода; "
           "каждая идея-ниша ссылается на свой плейбук (кластеры 1–8). Ссылка на /uz/blog/biznes-reja-tuzish/ (владелец «biznes reja»); "
           "не перетягивать «biznes reja». Инструмент: роль AI-чата «biznes g‘oya → birinchi 30 kun marketing rejasi».",
      lead='Стартовый пакет: сайт (/uz/sayt-yaratish/) + SMM/таргет на запуск; через нишевые плейбуки',
      effort='M', honesty='medium',
      serp='бизнес идеи: AIO №2 + PAA + картинки; органика = moedelo.org (2021), Wikipedia, alterainvest.ru, skillzrun.com, YouTube, hf.ru «бизнес '
           'в Узбекистане для россиян», businessmens.ru. Узбекской страницы для местных нет. UZ «biznes g‘oyalar»: SERP не снят.',
      weak='mixed'),
 dict(id='yatt-ochish', priority=6,
      name="YaTT / ИП в Узбекистане: как открыть и где взять первых клиентов",
      kw={'uz': ['yatt ochish', 'yakka tartibdagi tadbirkor', "yatt ro'yxatdan o'tish"],
          'ru': ['как открыть ип в узбекистане', 'открыть ип в узбекистане', 'ип в узбекистане', 'самозанятый узбекистан']},
      excluded={"o'zini o'zi band qilish, yatt bo'lish": 'null'},
      existing_url='',
      page="Новая UZ-статья /uz/blog/yatt-ochish-va-birinchi-mijozlar/ + RU /ru/blog/kak-otkryt-ip-v-uzbekistane-i-nayti-klientov/: "
           "шаги регистрации только по официальным источникам (soliq.uz, my.gov.uz, lex.uz) с датой проверки, без налоговых советов и с "
           "фразой «уточните у налоговой/бухгалтера»; вторая половина — первые 30 дней: карточка на картах, Instagram/Telegram, простой сайт, "
           "первая реклама. Риск E-E-A-T: агентство пишет о регистрации — юридическую часть держать короткой и со ссылками.",
      lead='Стартовый пакет: сайт-визитка/лендинг (/uz/sayt-yaratish/), SMM, первый таргет',
      effort='L', honesty='medium',
      serp='yatt ochish: AIO №1 + видео; органика = 3 видео Soliqpressa в Facebook, soliq.uz (налогообложение ИП), buxgalter.uz (10 шагов, 2022), '
           'kadrovik.uz, info.dt.uz, yaran.uz (2022). Официальный источник + бухгалтерские порталы, тексты 2022 года; о клиентах после '
           'регистрации — никто. RU: SERP не снят.',
      weak='mixed'),
 dict(id='marketing-strategiya', priority=8,
      name='Marketing strategiyasi va reja (UZ) + маркетинговая стратегия/план с примером (RU — расширение)',
      kw={'uz': ['marketing strategiyasi', 'raqamli marketing', 'marketing strategiyasi nima', 'marketing rejasi', 'marketing reja'],
          'uzc': ['маркетинг стратегияси', 'маркетинг стратегия'],
          'ru': ['маркетинговая стратегия', 'маркетинговые стратегии', 'стратегии маркетинга', 'маркетинговый план', 'план маркетинга',
                 'разработка маркетинговой стратегии', 'разработка маркетинговой стратегии цена', 'маркетинговая стратегия компании',
                 'маркетинговая стратегия на год', 'готовая маркетинговая стратегия', 'маркетинговая стратегия пример', 'маркетинговый план пример',
                 'маркетинг план пример', 'стратегия развития бизнеса', 'smm стратегия', 'стратегия продвижения', 'стратегия продвижения в инстаграм']},
      excluded={'marketing turlari (140), маркетинг нима (170)': 'интент владельца /uz/blog/marketing-nima/ — расширять там, не здесь',
                'marketing 4p (90), marketing asoslari (50), marketing kitob (30), marketing kurs (40)': 'учебный интент'},
      existing_url='/ru/blog/digital-strategiya-dlya-biznesa-v-uzbekistane/',
      page="UZ: новая статья /uz/blog/marketing-strategiyasi/ — одностраничный маркетинг-план для малого бизнеса (цель, аудитория, оффер, "
           "каналы, бюджет-сетка, метрики) с примером для вымышленной, явно помеченной кофейни; ссылка из /uz/blog/marketing-nima/ "
           "(раздел «strategiya»), CTA на маркетинговый аудит. RU: не новая страница — расширить /ru/blog/digital-strategiya-dlya-biznesa-v-uzbekistane/ "
           "(уже держит «маркетинговая стратегия Ташкент») блоком «пример маркетингового плана» и связать с /ru/blog/plan-digital-marketinga-na-90-dney/ "
           "(43 показа, поз. 8). Инструмент: роль AI-чата «маркетинг-план на 1 страницу».",
      lead='Маркетинговый аудит (/ru/marketingovyi-audit-tashkent/), digital-стратегия (/ru/digital-strategiya-dlya-biznesa/), далее SMM/таргет',
      effort='S', honesty='low',
      serp='SERP не снят. Приор: UZ — студенческие рефераты и PDF; RU — Unisender/Calltouch/Skillbox-уровень (сильно).',
      weak='mixed'),
 dict(id='sotuv-voronkasi', priority=9,
      name="Воронка продаж и отдел продаж / sotuv voronkasi, biznesni rivojlantirish (RU + UZ)",
      kw={'ru': ['воронка продаж', 'отдел продаж', 'скрипт продаж', 'холодные звонки', 'база клиентов', 'как удержать клиентов', 'как увеличить продажи',
                 'как поднять продажи', 'увеличение продаж', 'как привлечь клиентов', 'привлечение клиентов', 'как найти клиентов',
                 'способы привлечения клиентов', 'методы привлечения клиентов', 'развитие бизнеса', 'как развить бизнес', 'как развивать бизнес',
                 'как найти новых клиентов', 'как найти первых клиентов', 'как найти клиентов в инстаграм'],
          'uz': ['biznesni rivojlantirish', 'biznes rivojlantirish', "sotuv bo'limi", 'sotuv texnikasi', 'sotuv voronkasi', 'sotuv skripti',
                 'sotuvni oshirish', 'savdoni oshirish'],
          'uzc': ['бизнесни ривожлантириш']},
      excluded={'mijoz topish, mijozlarni jalb qilish, mijoz jalb qilish': 'null (<10/мес): узбекский «mijoz topish» в Google не ищут',
                'sotuv menejeri (170)': 'вакансии/соискатели'},
      existing_url='/ru/blog/chto-takoe-lid-v-marketinge/',
      page="RU: новая статья /ru/blog/voronka-prodazh-dlya-malogo-biznesa/ (этапы от рекламы до оплаты, где теряются заявки, скрипт первого "
           "ответа, CRM, что мерить) со ссылкой из /ru/blog/chto-takoe-lid-v-marketinge/ (1 602 показа, поз. 25 — уже собирает «лид в продажах»). "
           "UZ: новая /uz/blog/sotuv-voronkasi-va-biznesni-rivojlantirish/ («biznesni rivojlantirish» 70 + Cyr. 30). CTA: маркетинговый аудит и "
           "автоматизация заявок.",
      lead='Маркетинговый аудит, затем таргет/контекст; автоматизация заявок и AI-бот (/ru/avtomatizatsiya-zayavok/, /uz/arizalarni-avtomatlashtirish/)',
      effort='M', honesty='low',
      serp='SERP не снят. Приор для «воронка продаж»: блоги CRM-вендоров и онлайн-школ (сильно). UZ «biznesni rivojlantirish»: приор слабый.',
      weak='mixed'),
]

AIO = (0.53, 0.655)
def visits(D):
    p6 = (D * 0.0061 / 30 * 1.5 * AIO[0], D * 0.0110 / 30 * 1.5 * AIO[1])
    p3 = (D * 0.0359 / 30 * 1.5 * AIO[0], D * 0.0359 / 30 * 1.5 * AIO[1])
    return p6, p3

def fmt(x):
    return f'{x:.2f}'.replace('.', ',')

seen_global = set()
out = []
missing = []
for c in CLUSTERS:
    rows = []
    for lang, ks in c['kw'].items():
        for k in ks:
            k = k.lower()
            if k not in M:
                missing.append((c['id'], k)); continue
            v, cpc, comp = M[k]
            rows.append(dict(lang=lang, kw=k, v=v or 0, cpc=cpc, comp=comp))
    # bucket assignment
    buckets = {}
    shared_note = []
    for r in rows:
        key = None
        for grp in SHARED:
            if r['kw'] in grp:
                key = ('S', grp[0], r['v'], r['cpc'], r['comp'])
        if key is None:
            key = (norm(r['kw']), r['v'], r['cpc'], r['comp'])
        buckets.setdefault(key, []).append(r)
    D = 0; wsum = 0; wv = 0; cpcs = []
    counted = []
    for key, rs in buckets.items():
        head = max(rs, key=lambda r: r['v'])
        if any(r['kw'] in seen_global for r in rs):
            continue
        for r in rs: seen_global.add(r['kw'])
        if len(rs) > 1:
            shared_note.append(' = '.join(r['kw'] for r in rs))
        D += head['v']
        counted.append((head, rs))
        if head['cpc']:
            wsum += head['cpc'] * head['v']; wv += head['v']; cpcs.append(head['cpc'])
    cpc_w = round(wsum / wv, 2) if wv else None
    p6, p3 = visits(D)
    # keyword string
    parts = []
    names = {'uz': 'UZ лат.', 'uzc': 'UZ кир.', 'ru': 'RU'}
    for lang in ('uz', 'uzc', 'ru'):
        big = [(h, rs) for h, rs in counted if h['lang'] == lang and h['v'] > 10]
        small = [(h, rs) for h, rs in counted if h['lang'] == lang and h['v'] <= 10]
        if not big and not small: continue
        seg = []
        for h, rs in sorted(big, key=lambda x: -x[0]['v']):
            s = f"{h['kw']} {h['v']}"
            if h['cpc']: s += f" (${fmt(h['cpc'])})"
            if len(rs) > 1: s += ' (= ' + ', '.join(r['kw'] for r in rs if r is not h) + ')'
            seg.append(s)
        if small:
            sm = []
            for h, rs in small:
                s = h['kw'] + (f" (${fmt(h['cpc'])})" if h['cpc'] else '')
                if len(rs) > 1: s += ' (= ' + ', '.join(r['kw'] for r in rs if r is not h) + ')'
                sm.append(s)
            seg.append(f'по 10 — {len(small)} запр.: ' + ', '.join(sm))
        parts.append(f"{names[lang]}: " + '; '.join(seg))
    o = dict(priority=c['priority'], id=c['id'], name=c['name'], keywords=' | '.join(parts),
             demand_month=D, keywords_counted=len(counted), keywords_measured=len(rows),
             cpc_weighted=cpc_w, cpc_range=[min(cpcs), max(cpcs)] if cpcs else None, cpc_keywords_with_value=len(cpcs),
             visits_day_pos6=f'{fmt(p6[0])}–{fmt(p6[1])}', visits_day_pos3=f'{fmt(p3[0])}–{fmt(p3[1])}',
             existing_url=c['existing_url'], page=c['page'], lead_path=c['lead'], effort=c['effort'], honesty_risk=c['honesty'],
             serp=c['serp'], serp_weakness=c['weak'], shared_buckets=shared_note, excluded=c['excluded'])
    out.append(o)
out.sort(key=lambda o: o['priority'])

if missing:
    print('MISSING (not measured):', missing)
    raise SystemExit(1)

tot = sum(o['demand_month'] for o in out)
p6, p3 = visits(tot)
res = dict(totals=dict(demand=tot, visits_day_pos6=f'{fmt(p6[0])}–{fmt(p6[1])}', visits_day_pos3=f'{fmt(p3[0])}–{fmt(p3[1])}',
                       niche_only=sum(o['demand_month'] for o in out if o['id'] not in ('yatt-ochish','biznes-goyalar','marketing-strategiya','sotuv-voronkasi'))),
           clusters=out)
json.dump(res, open(os.path.join(HERE, 'computed.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for o in out:
    print(o['priority'], o['id'], o['demand_month'], o['keywords_counted'], '/', o['keywords_measured'], 'cpc', o['cpc_weighted'], o['cpc_range'],
          'p6', o['visits_day_pos6'], 'p3', o['visits_day_pos3'], 'shared', o['shared_buckets'])
print('TOTAL', res['totals'])
