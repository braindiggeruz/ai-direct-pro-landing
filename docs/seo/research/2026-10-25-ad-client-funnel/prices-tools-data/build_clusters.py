# -*- coding: utf-8 -*-
# Builds prices-tools.json from the measured keyword files in this folder.
# Run: py -3 -I build_clusters.py   (from this folder)
# Inputs: kw1_metrics.json, kw2_metrics.json (get_keyword_metrics, loc 2860),
#         research1_raw.json (research_keywords seeds reklama / smm / контент план).
# Output: ../prices-tools.json and clusters_table.md (table fragment for the .md).
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_JSON = os.path.join(HERE, '..', 'prices-tools.json')
OUT_TABLE = os.path.join(HERE, 'clusters_table.md')

def load_metrics():
    m = {}
    # research first, metrics calls override (they are the explicit measurement)
    r = json.load(open(os.path.join(HERE, 'research1_raw.json'), encoding='utf-8'))
    for res in r['results']:
        for x in res['rows']:
            m[x['keyword'].lower()] = {'vol': x.get('searchVolume'), 'cpc': x.get('cpc'), 'comp': x.get('competition'), 'src': 'research_keywords seed=' + res['seed']}
    for fn in ('kw1_metrics.json', 'kw2_metrics.json'):
        d = json.load(open(os.path.join(HERE, fn), encoding='utf-8'))
        for x in d['keywords']:
            m[x['keyword'].lower()] = {'vol': x.get('search_volume'), 'cpc': x.get('cpc'), 'comp': x.get('competition'), 'src': fn}
    return m

M = load_metrics()

CTR6 = (0.0061, 0.0110)
CTR3 = 0.0359
AIO = (0.53, 0.655)

def visits(demand, aio):
    """aio: True (seen), False (seen absent), None (SERP not checked -> low bound discounted, high bound not)."""
    k = 1.5 / 30
    if aio is True:
        p6 = (demand * CTR6[0] * k * AIO[0], demand * CTR6[1] * k * AIO[1])
        p3 = (demand * CTR3 * k * AIO[0], demand * CTR3 * k * AIO[1])
    elif aio is None:
        p6 = (demand * CTR6[0] * k * AIO[0], demand * CTR6[1] * k)
        p3 = (demand * CTR3 * k * AIO[0], demand * CTR3 * k)
    else:
        p6 = (demand * CTR6[0] * k, demand * CTR6[1] * k)
        p3 = (demand * CTR3 * k, demand * CTR3 * k)
    return p6, p3

def fmt(rng):
    a, b = rng
    f = (lambda v: f"{v:.2f}") if b < 1 else (lambda v: f"{v:.1f}")
    if abs(a - b) < 0.005:
        return f(a)
    return f"{f(a)}–{f(b)}"

# A cluster lists keyword groups. A group is one Google Ads bucket: its members
# share volume/CPC/competition and are close variants, so the group counts once
# (max volume). Single keywords are one-member groups.
CLUSTERS = [
 {
  'id': 'ai-reklama-matni',
  'name': 'AI-генератор рекламного текста (reklama matni yozish)',
  'groups': [['reklama matni yozish'], ['reklama matni', 'reklama matnlari'], ['reklama yozish'], ["reklama uchun so'zlar"], ['reklama tekst'],
             ['рекламный текст'], ['рекламный текст пример'], ['как написать рекламный текст'], ['генератор постов'], ['нейросеть для рекламы'],
             ['нейросеть для текстов'], ['нейросеть для постов'], ['продающий текст'], ['реклама текст'], ['примеры рекламных текстов'],
             ['генератор описаний'], ['генератор описания товара'], ['описание товара для маркетплейса'], ['post generator'], ['caption generator'], ['ad copy generator']],
  'adjacent_not_counted': {'kopirayting': 170, 'kopirayter': 50, 'копирайтинг/копирайтер (одна корзина)': 320},
  'aio': True,
  'serp': 'reklama matni yozish: AI Overview; 1 kursishlari.uz (платная студ. презентация), 2–3 ilmiyhujjat.uz (то же), 4 adshare.uz/uz/blog «7 qoida» (вышла ~7 дней назад), 5 kursishlari.uz; YouTube на 6. Инструмента в выдаче нет.',
  'serp_weakness': 'weak',
  'existing_url': '/uz/gpt-telegram-instagram-ideya/ (0 показов за 3 мес.) и /ru/gpt-v-marketinge-smm/ (0 показов)',
  'page': 'Перенацелить существующие URL, а не создавать новые: UZ /uz/gpt-telegram-instagram-ideya/ → «Reklama matni yozish: AI generator va 7 qoida» (форма → готовый шаблон чата smm-telegram-ad / smm-instagram-post); RU /ru/gpt-v-marketinge-smm/ → блок «Генератор рекламных текстов». Тип: страница-инструмент поверх уже работающего SMM-инструмента чата.',
  'lead_path': 'Таргет (запуск от 1 990 000 сум) и SMM (от 2 490 000 сум/мес). В чате уже есть детектор бизнес-намерения (тема ads) с предложением помощи студии; на странице — CTA «Matn tayyor — reklamani to‘g‘ri yoqishni biz qilamiz» и существующая форма заявки.',
  'effort': 'S', 'honesty_risk': 'low',
  'honesty_note': 'Шаблон чата уже запрещает выдумывать скидки. Нужна строка про маркировку рекламы — только нейтрально, со ссылкой на закон РУз «О рекламе».',
 },
 {
  'id': 'kontent-reja',
  'name': 'Контент-план: шаблон + AI-генератор (kontent reja / контент-план)',
  'groups': [['kontent plan'], ['kontent plan tuzish'], ['контент план', 'контент-план'], ['контент план шаблон'], ['контент план на месяц'], ['как составить контент план'],
             ['контент план для телеграм канала'], ['контент план для инстаграм'], ['контент план пример'], ['контент план инстаграм'], ['что выложить в инстаграм'],
             ['идеи для сторис'], ['идеи для постов'], ['идеи для рилс'], ['smm контент план'], ['smm план на месяц'], ['готовые контент планы'], ['виды контент плана'],
             ['instagram контент план'], ['готовый контент для инстаграм'], ['content plan'], ['reels ideas']],
  'aio': None,
  'serp': 'Не проверялась (лимит 4 SERP). GSC: по «контент» у сайта 1 строка за 3 месяца — сайт в этой выдаче отсутствует.',
  'serp_weakness': 'mixed',
  'existing_url': '/ru/gpt-v-marketinge-smm/ (secondary «AI контент-план», 0 показов)',
  'page': 'RU: новая страница-инструмент /ru/kontent-plan-instagram-shablon/ (шаблон таблицы для скачивания + запуск шаблона чата smm-plan «7 дней»); у /ru/gpt-v-marketinge-smm/ снять «AI контент-план» из secondaryKeywords, чтобы не было двух владельцев. UZ: раздел «Kontent reja» на той же UZ-странице, что в кластере 1 (UZ-спрос всего 30/мес — отдельный URL не окупается).',
  'lead_path': 'SMM: пакет Start от 2 490 000 сум/мес (CTA «Rejani tuzdingiz — bajarishni bizga topshiring»).',
  'effort': 'M', 'honesty_risk': 'low',
  'honesty_note': 'Шаблон — реальная таблица, не «гарантия охватов».',
 },
 {
  'id': 'targetolog-narxi',
  'name': 'Таргетолог: цена и найм (targetolog / таргетолог цена)',
  'groups': [['targetolog'], ['таргетолог'], ['targetolog kerak'], ['таргетолог ташкент'], ['таргетолог цена'], ['target yoqish narxi'], ['таргет цена'],
             ['сколько стоит таргет'], ['стоимость таргета'], ['стоимость таргетированной рекламы'], ['таргетированная реклама цена'], ['реклама в инстаграм цена'],
             ['реклама инстаграм цена']],
  'owned_not_counted': {'target yoqish': 260, 'instagram target yoqish': 140, 'instagram target': 50, 'facebook target yoqish': 20},
  'aio': True,
  'serp': 'targetolog: AI Overview + видео; 1 skillbox.ru (профессия), 2 instagram.com пост (UZ), 3 m.olx.uz (вакансии и услуги таргетологов, в сниппете 598 415 – 4 787 320 сум), 4 practicum.yandex.ru, 5 instagram.com профиль. Ни одной страницы услуги агентства в топ-5.',
  'serp_weakness': 'mixed',
  'existing_url': '/uz/instagram-target-yoqish/ (hub, 0 показов по «targetolog»); /ru/targetirovannaya-reklama-tashkent/; профессия — /uz/blog/target-reklama-nima/ (уже держит «targetolog kim», «таргет нима» 74 показа, поз. 7,3)',
  'page': 'Расширить, не создавать: в hub /uz/instagram-target-yoqish/ раздел «Targetolog xizmati narxi: frilanser, shtatdagi xodim yoki agentlik» с уже опубликованными ценами (1 990 000 запуск / 1 490 000 ведение) и честным сравнением моделей без чужих цен; то же в /ru/targetirovannaya-reklama-tashkent/ для «таргетолог ташкент/цена». Профессиональный интент («targetolog kim») оставить статье target-reklama-nima.',
  'lead_path': 'Прямо услуга таргета — самый горячий интент кластера (CPC targetolog $2,47, «таргетолог ташкент» $1,33).',
  'effort': 'S', 'honesty_risk': 'low',
  'honesty_note': 'Цены конкурентов с OLX не цитировать как факт рынка без даты и источника; свои — только из тарифной таблицы.',
 },
 {
  'id': 'kontekst-narxi-kalkulyator',
  'name': 'Сколько стоит контекстная реклама: калькулятор бюджета Google Ads / Директ (RU + UZ)',
  'groups': [['контекстная реклама'], ['гугл адс'], ['google adwords'], ['реклама гугл'], ['яндекс реклама'], ['google ads цена'], ['настройка яндекс директ'],
             ['директолог'], ['контекстная реклама цена'], ['стоимость контекстной рекламы'], ['сколько стоит контекстная реклама'], ['гугл реклама цена'],
             ['google реклама цена'], ['реклама гугл цена'], ['яндекс реклама цена']],
  'owned_by_pains_lens_not_counted': {'яндекс директ': 590, 'yandex direct': 390, 'yandex reklama': 70, 'яндекс директ узбекистан': 40, 'яндекс директ цена': 10,
                                      'гугл реклама': 110, 'google реклама': 70, 'google reklama': 30, 'реклама в гугл цена': 10},
  'navigational_not_counted': {'google ads': 4400, 'google ads вход': 50, 'google ads login': 20, 'яндекс директ вход': 10},
  'aio': None,
  'serp': 'Ценовые запросы не проверялись. GSC: /ru/blog/skolko-stoit-kontekstnaya-reklama-tashkent-2026/ уже поз. 4 по «контекстная реклама цена» и 7 по «… стоимость в месяц» (3 клика / 53 показа за 3 мес.) — выдача пробиваемая. Для сравнения, навигационная «yandex direct»: AI Overview и 4 из 5 мест у самого Яндекса (yandex.ru/support, yard.yandex.ru, b2b.yandex.ru ×2) — поэтому DIY-головы отданы линзе «боли».',
  'serp_weakness': 'mixed',
  'existing_url': '/ru/blog/skolko-stoit-kontekstnaya-reklama-tashkent-2026/, /uz/blog/kontekst-reklama-narxi-toshkent-2026/, money /ru/kontekstnaya-reklama-tashkent/ (там уже есть CPL-виджет)',
  'page': 'Расширить ценовые статьи, новых URL не делать: встроить калькулятор бюджета «CPC × клики → бюджет → заявки при вашей конверсии → CPL» в RU-статью и в UZ-статью цены (тот же growthTool-механизм, что на money-странице); добавить «гугл адс», «контекстная реклама цена/стоимость» в их ключи. CPC в калькулятор — только ввод пользователя или ссылка на Планировщик ключевых слов Google, без «средних по рынку» от нас.',
  'lead_path': 'Контекстная реклама: запуск от 1 990 000 сум, ведение от 1 490 000 сум/мес (/ru/kontekstnaya-reklama-tashkent/). Самый дорогой клик в линзе: гугл адс $6,87, реклама гугл $2,54.',
  'effort': 'S', 'honesty_risk': 'low',
  'honesty_note': 'Не выдавать прогноз за обещание; бюджет площадки — отдельно от цены работы (так уже написано на money-странице).',
  'visits_note': '«гугл адс» (140 из 530) частично навигационный.',
 },
 {
  'id': 'marketing-kalkulyator',
  'name': 'Калькулятор маркетолога: ROMI, CPL, ДРР, бюджет (UZ + RU)',
  'groups': [['калькулятор romi'], ['калькулятор roi'], ['расчет romi'], ['как рассчитать romi'], ['как посчитать cpl'], ['юнит экономика калькулятор', 'калькулятор юнит экономики'],
             ['калькулятор конверсии'], ['калькулятор рекламы'], ['roi calculator'], ['roas calculator'], ['roi formula'], ['roi формула'], ['romi formula'],
             ['romi формула', 'формула romi'], ['формула roi'], ['дрр формула'], ['медиаплан'],
             ['romi'], ['ltv'], ['cpl'], ['drr'], ['дрр'], ['konversiya nima'], ['roi nima'], ['ltv nima'], ['lid nima'], ['lead nima'],
             ['cpm калькулятор'], ['калькулятор cpm'], ['cpm calculator'], ['сколько стоит реклама в телеграм канале'], ['стоимость рекламы в телеграм канале'], ['телеграм адс цена']],
  'ambiguous_not_counted': {'roi': 590, 'ctr': 480, 'cpm': 390, 'cpa': 210, 'cpc': 90, 'konversiya/конверсия (одна корзина)': 260},
  'owned_not_counted': {'RU «что такое cpa/cpl/ctr/cpm/cpc/romi/ltv/дрр/конверсия» (11 строк по 10)': 110},
  'aio': None,
  'serp': 'Не проверялась. GSC: RU-статья /ru/blog/cpa-cpm-cpc-cpl-v-reklame/ держит 21 строку по «cp*», но на позициях 27–85; по «калькул» у сайта 0 строк. Спрос на сам «калькулятор» мал (строки по 10), реальный объём — в голых терминах (romi 320, ltv 210, cpl 110).',
  'serp_weakness': 'mixed',
  'existing_url': 'CPL-калькулятор уже живёт как growthTool на /ru/kontekstnaya-reklama-tashkent/; определения — /ru/blog/cpa-cpm-cpc-cpl-v-reklame/; бюджет — /uz/blog/reklama-byudjeti-qancha-bolishi-kerak/, /ru/blog/reklamnyy-byudzhet-skolko-protsentov-ot-oborota/',
  'page': 'Новая страница-инструмент в двух языках: /uz/marketing-kalkulyator/ и /ru/kalkulyator-romi-cpl/ (ROMI, ROI, CPL, CPA, ДРР, предельный CPL, бюджет под план заявок, CPM-модуль «цена поста = CPM × охват / 1000»; код CPL-виджета переиспользуется; CPM-модуль также встраивается в Telegram-страницы, владелец которых — линза «боли»). Определения — коротко на UZ-странице (UZ-владельца нет), на RU — ссылка на существующую статью, чтобы не забрать её интент.',
  'lead_path': 'Маркетинговый аудит (/ru/marketingovyi-audit-tashkent/) и контекст/таргет: экран результата → «media-reja tuzib beramiz» → форма.',
  'effort': 'M', 'honesty_risk': 'low',
  'honesty_note': 'Результат — экономическая граница по данным пользователя, не прогноз площадки (так уже сформулировано в существующем виджете). Аудитория частично — студенты и маркетологи, не владельцы.',
 },
 {
  'id': 'mobilograf-reels',
  'name': 'Мобилограф и Reels для бизнеса: нанять или отдать агентству',
  'groups': [['мобилограф', 'мобилография'], ['mobilograf'], ['мобилограф это'], ['mobilografiya'], ['mobilograf kerak'], ['мобилограф ташкент'], ['videograf'],
             ['видеограф ташкент', 'видеосъемка ташкент'], ['кто такой мобилограф'], ['mobilograf nima'], ['mobilograf xizmati'], ['мобилограф цена'],
             ['рилсмейкер'], ['reelsmaker'], ['съемка рилс'], ['video reklama', 'reklama video'], ['рекламный ролик'], ['съемка рекламы']],
  'excluded_jobs_courses': {'mobilograf ish': 90, 'mobilografiya kursi': 90, 'мобилограф вакансии': 20, 'мобилограф курсы': 10},
  'aio': True,
  'serp': 'mobilograf: AI Overview; 1 m.olx.uz (вакансии «mobilograf kerak» 5–8 млн сум), 2 m.olx.uz (одно объявление услуги), 3 m.olx.uz (вакансии), 4 olx.uz (услуги), 5 m.olx.uz (вакансии); дальше ishkop.uz, cloz.uz, карточка студии в Яндекс Картах.',
  'serp_weakness': 'weak',
  'existing_url': 'нет владельца; Reels уже входят в SMM-пакеты на /ru/smm-prodvizhenie-tashkent/ и /uz/smm-xizmatlari/',
  'page': 'Новая статья-сравнение UZ /uz/blog/mobilograf-yollash-yoki-smm-agentlik/ (+ RU-двойник): кто такой мобилограф, что входит в съёмку, штатный сотрудник vs фрилансер vs пакет агентства; цены — только наши опубликованные пакеты. Ловит работодателей, которые пишут «mobilograf kerak» — это и есть владельцы бизнеса.',
  'lead_path': 'SMM: «Бизнес» от 4 490 000 сум/мес (8 Reels из материалов клиента), «Про» от 7 900 000 сум/мес (съёмочный день, 12 Reels).',
  'effort': 'M', 'honesty_risk': 'medium',
  'honesty_note': 'Не утверждать про штатных мобилографов, если съёмку делает подрядчик; зарплаты из вакансий — только с источником и датой.',
  'visits_note': 'Трафик, не лиды: ~87% спроса информационный («мобилограф это») или от соискателей; заказной хвост ≈ 310/мес (mobilograf kerak, мобилограф ташкент, видеограф ташкент, video reklama, рекламный ролик…).',
 },
 {
  'id': 'agency-narxlar',
  'name': 'Цены агентских услуг одним местом (SMM / сайт / блогер / видео — narxi, цена)',
  'groups': [['smm цена'], ['смм цена'], ['ведение инстаграм цена'], ['ведение инстаграм'], ['стоимость сайта'], ['сколько стоит сайт'], ['сайт цена'],
             ['реклама у блогера цена'], ['сколько стоит реклама у блогера'], ['стоимость рекламы у блогера'], ['реклама у блогеров', 'реклама у блогера'],
             ['реклама у блогеров инстаграм'], ['influencer marketing'], ['инфлюенсер маркетинг'], ['реклама в интернете цены'], ['smm услуги цены'],
             ['услуги смм цена'], ['прайс смм'], ['смм прайс']],
  'owned_not_counted': {'sayt yaratish narxi': 40},
  'unmeasured_uz': 'Все ~60 узбекских «… narxi / нархи» (target narxi, smm narxi, reklama narxi, telegram kanalda reklama narxi, bloger reklama narxi, logo narxi, video reklama narxi, sayt narxi …) вернули null — меньше 10 в месяц у Google Ads.',
  'aio': None,
  'serp': 'Не проверялась. GSC за 3 месяца: 11 UZ-страниц «…narxi» — 1 клик / 201 показ; 19 RU «stoimost/skolko-stoit» — 16 кликов / 1 091 показ. Первая SMM-заявка (07.10) пришла с chatgpt.com, который процитировал страницу с ценами.',
  'serp_weakness': 'mixed',
  'existing_url': '/uz/blog/smm-xizmati-narxi-ozbekiston-2026/, /uz/blog/internet-reklama-narxi-ozbekiston-2026/, /uz/blog/kontekst-reklama-narxi-toshkent-2026/, /uz/blog/sayt-yaratish-narxi-toshkent-2026/, /ru/blog/skolko-stoit-smm-i-vedenie-instagram-uzbekistan/, /ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/ и ещё ~20',
  'page': 'Новых ценовых статей не писать. Сделать одну таблицу всех опубликованных цен (/uz/narxlar/ + /ru/ceny/ или раздел «Narxlar» на boss-digital) как источник для AI-ассистентов и для конверсии; в существующие статьи — блок «Blogerda reklama: narx nimaga bog‘liq» без чужих цифр. Это ставка на цитирование в ChatGPT, а не на Google.',
  'lead_path': 'Все услуги: таблица ведёт на каждую услугу и форму; главный канал — переходы с chatgpt.com.',
  'effort': 'S', 'honesty_risk': 'medium',
  'honesty_note': 'Только цены из тарифных таблиц (SMM 2 490 000 / 4 490 000 / 7 900 000; таргет и контекст 1 990 000 + 1 490 000/мес; сайты 2 990 000 / 6 900 000 / 14 900 000). Цены блогеров и Telegram-каналов не публиковать как свои; владелец решает спор 290k vs 490k по поддержке.',
 },
 {
  'id': 'obunachi-halol',
  'name': 'Как честно набрать подписчиков в Instagram и Telegram (без накрутки)',
  'groups': [["instagram obunachi ko'paytirish"], ["instagramda obunachi ko'paytirish"], ["obunachi ko'paytirish"], ['instagram obunachi'],
             ["telegram obunachi ko'paytirish"], ["instagramda obunachi yig'ish"], ['telegram kanal ochish'], ['telegram kanalni rivojlantirish'], ['instagram rivojlantirish'],
             ['продвижение инстаграма'], ['продвижение инстаграма с нуля'], ['продвижение группы в телеграмме'], ['продвижение в телеграм'], ['телеграм продвижение'], ['telegram продвижение']],
  'excluded_rule_breaking': {'nakrutka': 8100, 'накрутка': 880, 'накрутка подписчиков': 720, 'top smm': 1300, 'smm panel': 260, 'global smm': 260},
  'aio': None,
  'serp': 'Не проверялась. Соседние запросы показывают, что выдачу по росту подписчиков занимают сервисы накрутки (top smm, global smm, smm panel) — им не подражать.',
  'serp_weakness': 'mixed',
  'existing_url': 'нет владельца (/uz/blog/smm-nima/ — про канал в целом)',
  'page': 'Новая статья UZ /uz/blog/instagram-obunachi-kopaytirish/ (+ раздел про Telegram-канал): органика, контент-план, коллаборации, таргет и Telegram Ads как законный платный рост; отдельный раздел «Nakrutka nega zarar» со ссылкой на правила Instagram.',
  'lead_path': 'Таргет (рост через рекламу) и Telegram Ads; SMM для тех, кто не хочет делать сам.',
  'effort': 'M', 'honesty_risk': 'medium',
  'honesty_note': 'Никаких обещаний «+1000 за неделю», никаких ссылок на панели. Накрутка нарушает правила площадки — так и написать.',
 },
 {
  'id': 'biznes-nomi-shior',
  'name': 'Название и слоган для бизнеса: AI-генератор (firma nomlari / название компании)',
  'groups': [['firma nomlari'], ['kompaniya nomlari'], ['kafe nomlari'], ["firma nomlari ro'yxati"], ['firma nomi'], ['salon nomlari'], ['фирма номлари'], ['brend nomi'],
             ["do'kon uchun nomlar"], ['magazin nomlari'], ["go'zallik saloni nomlari"], ['restoran nomlari'], ['nom generator'], ['nom tanlash'], ['reklama shiorlari'],
             ['slogan generator'], ['название компании'], ['название фирмы'], ['business name generator'], ['генератор названий'], ['название для бренда'],
             ['название для магазина'], ['придумать название'], ['слоган для компании'], ['генератор слоганов'], ['придумать слоган'], ['названия для магазина одежды'],
             ['название для кафе'], ['генератор названий для бизнеса']],
  'ambiguous_not_counted': {'shiorlar': 720, 'shior': 320, 'slogan': 170, 'слоган/слоганы': 70, 'шиорлар': 30, 'шиор': 20, 'chiroyli nomlar': 140},
  'aio': None,
  'serp': 'Не проверялась.',
  'serp_weakness': 'mixed',
  'existing_url': 'нет',
  'page': 'Новая страница-инструмент UZ /uz/biznes-nomi-generator/ (+ RU /ru/generator-nazvaniy-dlya-biznesa/): форма «ниша, город, тон» → новый шаблон в бизнес-инструменте чата (название + 5 слоганов) + чек-лист «проверьте товарный знак в Агентстве интеллектуальной собственности и свободный домен .uz».',
  'lead_path': 'Стадия «открываю бизнес» → сайт (лендинг от 2 990 000 сум) и SMM-старт; в результате генерации — «domen va sayt tayyorlab beramiz».',
  'effort': 'S', 'honesty_risk': 'low',
  'honesty_note': 'Не утверждать, что название свободно; проверка знака и домена — на пользователе, со ссылками на официальные реестры.',
 },
 {
  'id': 'heshteg-bio',
  'name': 'Хэштеги и bio для Instagram-профиля бизнеса: AI-генератор',
  'groups': [['hashtag'], ['instagram hashtag'], ['xeshteg'], ['хештег', 'хэштеги'], ['heshteg'], ['instagram uchun heshteglar'], ['hashtag nima'],
             ['хештеги для инстаграм', 'хэштеги для инстаграм'], ['heshteglar'], ['hashtaglar'], ['heshteg nima'], ['hashteg'], ['хештеги'], ['хештег нима'],
             ['hashtag generator'], ['генератор хештегов', 'генератор хэштегов'],
             ['instagram bio'], ['instagram profil'], ['био для инстаграм'], ['био инстаграм'], ['статус для инстаграм'], ['описание для инстаграм'], ['instagram uchun bio'],
             ["bio uchun so'zlar"], ['instagram bio generator'], ['bio generator'], ['шапка профиля инстаграм'], ['шапка инстаграм'], ['описание профиля инстаграм']],
  'aio': None,
  'serp': 'Не проверялась.',
  'serp_weakness': 'mixed',
  'existing_url': 'нет',
  'page': 'Новая страница-инструмент UZ /uz/instagram-bio-va-heshteg/ (+ RU): два шаблона в SMM-инструменте чата — «bio для бизнес-профиля» и «хэштеги по нише и городу» — с честной оговоркой, что хэштеги дают мало охвата в 2026 году.',
  'lead_path': 'Слабый: SMM (оформление профиля входит в пакет). Главная польза — регистрации в AI-чате (основной актив сайта) и ретаргетинг-аудитория.',
  'effort': 'S', 'honesty_risk': 'low',
  'honesty_note': 'Аудитория в основном личные профили и подростки — лидов мало; строить последним.',
  'visits_note': 'Визиты реальны, лиды — нет: это трафик для AI-чата, а не для агентства.',
 },
]

def resolve(cl):
    rows, demand, cpcs, missing = [], 0, [], []
    for grp in cl['groups']:
        mem = []
        for kw in grp:
            x = M.get(kw.lower())
            if x is None:
                missing.append(kw); continue
            mem.append((kw, x))
        if not mem:
            continue
        vol = max((x['vol'] or 0) for _, x in mem)
        demand += vol
        for kw, x in mem:
            rows.append({'keyword': kw, 'volume': x['vol'], 'cpc': x['cpc'], 'competition': x['comp'], 'bucket': ' = '.join(grp) if len(grp) > 1 else None})
        # one CPC sample per bucket (the members share it)
        kw0, x0 = mem[0]
        if x0['cpc'] is not None and vol > 0:
            cpcs.append((x0['cpc'], vol, kw0))
        GROUPS_DISPLAY.append((vol, ' = '.join(k for k, _ in mem)))
    return rows, demand, cpcs, missing

out = []
table = ['| # | Кластер | Спрос/мес (дедуп) | CPC, $ | SERP | Визиты/день поз.~6 | поз.~3 | Усилие | Риск |', '|---|---|---:|---|---|---:|---:|---|---|']
allmissing = []
for i, cl in enumerate(CLUSTERS, 1):
    GROUPS_DISPLAY = []
    rows, demand, cpcs, missing = resolve(cl)
    allmissing += missing
    p6, p3 = visits(demand, cl['aio'])
    if cpcs:
        wsum = sum(v for _, v, _ in cpcs)
        wavg = sum(c * v for c, v, _ in cpcs) / wsum if wsum else None
        top = max(cpcs, key=lambda t: t[0])
        cpc_str = f"взвеш. {wavg:.2f}; макс. {top[0]:.2f} («{top[2]}»)"
    else:
        cpc_str = 'нет данных (Google Ads не отдаёт CPC)'
    kws_sorted = sorted(rows, key=lambda r: -(r['volume'] or 0))
    gd = sorted(GROUPS_DISPLAY, key=lambda g: -g[0])
    big = [g for g in gd if g[0] > 10]
    small = [g for g in gd if g[0] <= 10]
    kw_str = ', '.join(f"{name} {vol}" for vol, name in big)
    if small:
        kw_str += f"; по 10 (нижняя корзина Google Ads): " + ', '.join(name for _, name in small)
    aio_note = {True: 'AI Overview есть (скидка ×0,53–0,655)', None: 'SERP не проверялась: нижняя граница со скидкой AIO ×0,53, верхняя без', False: 'AI Overview нет'}[cl['aio']]
    rec = {
        'id': cl['id'], 'name': cl['name'], 'keywords': kw_str, 'keyword_rows': kws_sorted,
        'demand_month': demand, 'cpc_usd': cpc_str, 'serp': cl['serp'], 'serp_weakness': cl['serp_weakness'],
        'ai_overview': cl['aio'], 'ai_overview_note': aio_note,
        'existing_url': cl['existing_url'], 'page': cl['page'], 'lead_path': cl['lead_path'],
        'effort': cl['effort'], 'honesty_risk': cl['honesty_risk'], 'honesty_note': cl['honesty_note'],
        'visits_day_pos6': fmt(p6), 'visits_day_pos3': fmt(p3),
    }
    if cl.get('visits_note'): rec['visits_note'] = cl['visits_note']
    for k in ('adjacent_not_counted', 'owned_not_counted', 'owned_by_pains_lens_not_counted', 'navigational_not_counted', 'ambiguous_not_counted', 'excluded_jobs_courses', 'excluded_rule_breaking', 'unmeasured_uz'):
        if k in cl: rec[k] = cl[k]
    out.append(rec)
    dem = f"{demand:,}".replace(',', ' ')
    table.append(f"| {i} | {cl['name']} | {dem} | {cpc_str} | {cl['serp_weakness']} | {fmt(p6)} | {fmt(p3)} | {cl['effort']} | {cl['honesty_risk']} |")

meta = {
    'lens': 'prices-tools', 'date': '2026-10-25', 'location': 2860, 'source': 'OpenSEO (DataForSEO, Google Ads data for UZ): research_keywords x3 seeds, get_keyword_metrics x2 (649 keywords), get_serp_results x4; GSC free',
    'formula': 'visits/day = demand x CTR / 30 x 1.5; CTR pos6 0.61-1.10%, pos3 3.59%; AI Overview x0.53-0.655 where present; where SERP not checked the low bound takes x0.53 and the high bound none',
    'dedupe': 'keywords with identical volume+CPC+competition that are close variants in one script are one Google Ads bucket and count once (groups in build_clusters.py); heads owned by existing pages, navigational heads, ambiguous heads, job/course queries and rule-breaking queries are listed per cluster and not counted',
    'credits': 'own spend ~508 of 600 (research 3 seeds ~288, metrics 2 x 104, SERP 4 = 12); whoami 21 772 -> 20 700 account-wide includes parallel lenses',
    'missing_keywords': allmissing,
    'cross_lens_dedupe': 'Checked against ad-platform-pains.json (same folder, written 2026-10-25 09:59). Removed from this lens because pains owns them: Meta Ads Manager / Business Suite (18 610 measured here, pains counts 3 428 after its own discounts), Telegram Ads how-to and channel buying (telegram ads, ads telegram, телеграм адс, telegram ads узбекистан/цена/стоимость/ton, реклама в телеграм каналах ...), Google Ads / Yandex Direct DIY heads (яндекс директ, yandex direct, гугл реклама, google реклама ...), target qilish. Only the CPM sub-tool and 3 Telegram price rows (сколько стоит реклама в телеграм канале, стоимость рекламы в телеграм канале, телеграм адс цена) stay here, inside the marketing calculator.',
    'totals': {'demand_month': sum(r['demand_month'] for r in out)},
}
json.dump({'meta': meta, 'clusters': out}, open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(OUT_TABLE, 'w', encoding='utf-8').write('\n'.join(table) + '\n')
sys.stdout.reconfigure(encoding='utf-8')
print('\n'.join(table))
print('missing:', allmissing)
for r in out:
    print(r['id'], r['demand_month'], r['visits_day_pos6'], r['visits_day_pos3'])
