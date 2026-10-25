# Build text-tools.json from tt_model.json + qualitative cluster cards.
import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'text-tools.json')
model = {c['id']: c for c in json.load(open(os.path.join(HERE, 'tt_model.json'), encoding='utf-8'))}

ORDER = ['sherlar_mavzu', 'maqollar', 'tabrik_uz', 'pozdravleniya_ru', 'ertaklar', 'konvertor_alifbo', 'randomayzer',
         'mumtoz_sheriyat', 'ismlar', 'shriftlar_niklar', 'sinonimlar', 'sanagich']
CUT = ['krossvord', 'imlo_tekshirish', 'latifalar']

Q = {
 'sherlar_mavzu': dict(
   serp='«vatan haqida sher» (25.10): o1 sherlari.uz, o2 ilmlar.uz (блоги-подборки), AIO r3, o3 YouTube Shorts, o4 sherlari.uz, o5 kh-davron.uz (личный сайт поэта); дальше abituriyentlar.uz, bilimmarkazi.uz, myfarzand.uz, tavsiyalar.uz, darsuchun.uz, yoshlar.ru, tarbiyachi.uz. Ни одного сильного литературного ресурса в топ-10; подборки копируют стихи живых и недавних авторов без прав.',
   fit='c + b: свои и общественное достояние стихи по темам; пресет чата «She’r yozib ber» (тема, имя, 4/8 строк)',
   build='Хаб /uz/sherlar/ и 17 тематических страниц /uz/sherlar/{vatan-haqida, ustoz-haqida, ona-haqida, til-haqida, bahor-haqida, qish-haqida, kuz-haqida, yangi-yil, kitob-haqida, ota-haqida, sevgi-haqida, tabiat-haqida, dostlik-haqida, navroz-haqida, tugilgan-kun, maktab-haqida, bolalar-uchun}/. На каждой 10–20 стихов: классики в общественном достоянии (Cho‘lpon, Hamid Olimjon, G‘afur G‘ulom, Oybek, Usmon Nosir — статус проверить) + стихи, написанные для сайта (с подписью; AI-черновик только после правки носителем), фильтр «4 qator», кнопки «nusxalash/chop etish», блок генератора. Тип: статическая коллекция + генератор. Первая волна до декабря: qish, yangi-yil, ona, bahor, navroz, bolalar-uchun.',
   effort='L', honesty='medium',
   honesty_note='Не публиковать стихи живых и недавно умерших авторов (Oripov, Vohidov, Zulfiya, Muhammad Yusuf, Iqbol Mirzo): запросы по ним (~25 тыс./мес) исключены. AI-стихи — только с пометкой и правкой носителя. Срок охраны в РУз (по памяти: жизнь + 50 лет) проверить до публикации.',
   caveat='«til haqida sher» 8 100 почти целиком приходится на октябрь (90 500 в окт. 2025, День языка 21.10) — страница должна жить к началу октября. «ustoz haqida sher» и «…sherlar» — разные корзины Ads (9 900 + 9 900), пик 60–74 тыс. в сентябре (День учителя 1.10). «kitob haqida she’r» со скачком 210 → 27 100 взят по полу 345. Летом спрос ×0,24.'),
 'maqollar': dict(
   serp='Не снято. Ожидаемо: n.ziyouz.com (тематические списки мақолов — в выдаче «vatan haqida sher» на o15), блоги-подборки, Scribd/PDF. Тип выдачи как у стихов — слабая/смешанная.',
   fit='c + a: народные пословицы (общественное достояние) + своё объяснение смысла; поиск по слову и теме; колонка с переводом на русский',
   build='Хаб /uz/maqollar/ (поиск) + /uz/maqollar/{vatan, ona, kitob, odob, til, mehnat, bilim-ilm, tabiat, hunar, oila, dostlik}-haqida/; /uz/iboralar/ (iboralar va ma’nosi), /uz/hikmatli-sozlar/, /uz/tez-aytishlar/, /ru/uzbekskie-poslovicy/ (с переводом — уникальный актив). Тип: статическая коллекция + поисковый инструмент.',
   effort='M', honesty='low',
   honesty_note='Пословицы — фольклор, но подборки ziyouz не копировать дословно (свой отбор, свои объяснения). Писать с U+2018 в o‘/g‘ (конвенция сайта).',
   caveat='Пики школьных заданий: октябрь (til/odob haqida maqol до 27 100 в окт. 2025), сентябрь (vatan 27 100), март (mehnat 18 100); летом ×0,27. Русские общие «пословицы» 2 400 и др. — только в верхней оценке.'),
 'tabrik_uz': dict(
   serp='«tugilgan kun tabriklari» (24.10, L3): o1 askinfo.uz, o2 bilimmarkazi.uz, картинки, AIO r4, o3 Telegram-канал, o4 YouTube-плейлист, o5 приложение Play, o6 qogozcha.uz, o7 Instagram, o8 insho.uz, o9 sherlari.ru, o10 ok.ru. Слабая.',
   fit='c + b: свои тексты поздравлений; генератор (кому, возраст, тон, длина; выдача латиницей или кириллицей через готовый конвертер)',
   build='Превратить /uz/blog/tabrik-yozish/ в хаб /uz/tabriklar/ (гайд остаётся) + /uz/tabriklar/tugilgan-kun/ (главная под «tugilgan kun tabrigi» 6 600) с кириллической версией под «туғилган кун табриги» 9 900; по адресату /uz/tabriklar/{onaga, dadaga, akaga, opaga, singlimga, ukamga, dugonaga, ustozga, qizimga, erimga, ayolimga, sevgilimga}/; праздники /uz/tabriklar/{yangi-yil, 8-mart, navroz, 14-yanvar, ustozlar-kuni, hayit, toy}/. Тип: коллекция + генератор.',
   effort='M', honesty='low',
   honesty_note='Тексты свои; хайит — нейтральные поздравления без религиозных предписаний.',
   caveat='Кириллица сильнее латиницы: «туғилган кун табриги» 9 900 против 6 600. Пики: март (8 март табриклари 22 200 в мар. 2026) и декабрь (yangi yil tabrigi 18 100). Из спроса вычтены 11 ключей, которые уже закреплены за /uz/blog/tabrik-yozish/ (4 430/мес в прежней оценке).'),
 'pozdravleniya_ru': dict(
   serp='«поздравления с днем рождения» (25.10): o1 techinsider.ru (листикл 2024), AIO r2, o2 Pinterest, o3 pozdravok.com, картинки, PAA, видео, o4 Instagram, o5 pozdravok.com, o6 vtop-shop.com.ua (блог магазина), o7 Pinterest, o8 nur.kz, o9 YouTube, o10 pozdravok.com; o11 vc.ru, o12 tbank.ru. Смешанная: pozdravok держит 5 мест из 14, но рядом UGC и мусор.',
   fit='b + c: генератор «поздравление своими словами» (имя, кому, возраст, тон; вариант на узбекском с переводом) + свои примеры',
   build='/ru/pozdravleniya-s-dnem-rozhdeniya/ (генератор + 30 своих текстов); по адресату /ru/pozdravleniya-s-dnem-rozhdeniya/{muzhchine, zhenshchine, podruge, drugu, mame, pape, sestre, bratu, synu, docheri, kollege, devushke, muzhu, zhene}/ (сначала 8 крупнейших); /ru/pozdravlenie-na-uzbekskom/ (двуязычные поздравления — уникально для сайта); сезонные /ru/pozdravleniya-s-8-marta/, /ru/pozdravleniya-s-novym-godom/, /ru/pozdravlenie-s-dnem-uchitelya/. Тип: генератор + коллекция.',
   effort='M', honesty='low',
   honesty_note='Тексты свои, не копии pozdravok.',
   caveat='Голова «с днем рождения» 49 500 — только в верхней оценке (там открытки, песни, картинки). «открытки с днем рождения» 8 100 исключены: продукт не делает изображений. Разгон медленнее: российские профильные сайты с большим ссылочным весом.'),
 'ertaklar': dict(
   serp='«ertaklar» (25.10): o1 zakm.uz (PDF), видео r2, AIO r3, o2 YouTube (аудиосказка), o3 ertak.uz (библиотека сказок), o4 n.ziyouz.com, o5 приложение Play; дальше ziyouz.uz, ertak.uz/audio, YouTube, audiobook.uz, bilimlar.uz, ilmlar.uz, PDF natlib. Смешанная: PDF/YouTube/приложение слабые, но ertak.uz и ziyouz устоялись; сильный аудио-интент.',
   fit='c + b: свои пересказы народных сказок (сюжеты в общественном достоянии) + генератор «Ertak to‘qib ber» / «Сказка на ночь» с именем ребёнка и моралью',
   build='/uz/ertaklar/ (30–50 своих пересказов o‘zbek xalq ertaklari), /uz/ertak-toqib-ber/ (генератор; ловит «ertak yozish», «ertak to‘qish»), /uz/ibratli-hikoyalar/, /uz/masallar/ (свои пересказы Эзопа), /ru/skazki-na-noch/ (генератор + 20 своих сказок), /ru/uzbekskie-narodnye-skazki/. Тип: коллекция + генератор.',
   effort='M', honesty='low',
   honesty_note='Не копировать изданные переводы и аудио; AI-сказки помечать; «rivoyat» — только светские притчи.',
   caveat='Аудио-интент (YouTube, audiobook.uz) продукт не закрывает. «hikoyalar» 6 600 и «rivoyat(lar)» взяты с весом 0,5: часть спроса — рассказы современных авторов и религиозные притчи.'),
 'konvertor_alifbo': dict(
   serp='Не снято. По L3 (24.10) lotin.uz — конвертер с режимом новой азбуки (ş, ç, ö, ğ) — стоит на o10 даже по «imlo tekshirish»; ожидаемо: lotin.uz, приложения Play (Muharrir), Google Translate. Смешанная, тип «инструмент».',
   fit='a: детерминированный конвертер — модуль src/uz-translit уже есть (сейчас это блок на страницах переводчика)',
   build='Отдельная страница /uz/kirill-lotin/ (оба направления, загрузка .txt/.docx, копирование) + /ru/kirillica-v-latinicu/ (RU-интерфейс); /uz/ozbek-lotin-alifbosi/ (таблица 29 букв, пары с кириллицей, правила o‘/g‘ и тутуқ белгиси); /uz/kirill-alifbosi/. Режим «yangi alifbo» — только после проверки официально утверждённой таблицы букв.',
   effort='S', honesty='low',
   honesty_note='Новую азбуку не придумывать: только по утверждённому документу.',
   caveat='Прежняя дорожная карта уже посчитала 12 490/мес для того же инструмента (лотин кирилл 6 600, кирилл лотин 3 600, kirill lotin 1 900…). Эти 21 735 — новые ключи сверх них; отдельная страница соберёт оба набора (~34 тыс.). «yangi alifbo» (всплеск 9 900 в июле 2026) взят по полу 55.'),
 'randomayzer': dict(
   serp='Не снято. По «random number generator» и «генератор случайных чисел» Google показывает свой виджет (zero-click); дальше — российские и глобальные генераторы (randomus, wheelofnames). Смешанная/сильная.',
   fit='a: детерминированные генераторы',
   build='/ru/randomajzer/ (числа, список имён, колесо, жеребьёвка, монетка, кубик) + /uz/tasodifiy-son/ + /uz/ism-gildiragi/ (учителю — выбрать ученика; розыгрыши в Telegram/Instagram). Тип: инструмент.',
   effort='S', honesty='low',
   honesty_note='Вне линзы «текст» (генератор), но честный инструмент.',
   caveat='Ключи с виджетом Google взяты с весом 0,5; «wheel of names» 14 800 — навигация к бренду (исключён); «колесо фортуны» 8 100 и «random» 8 100 многозначны (только верхняя оценка).'),
 'mumtoz_sheriyat': dict(
   serp='Не снято. Ожидаемо: ziyouz (сильная библиотека), kh-davron.uz, Scribd/PDF, Википедия. Смешанная.',
   fit='c + b: тексты в общественном достоянии + своё объяснение на современном узбекском (sharh/tabdil); пресет «G‘azalni tushuntir»',
   build='/uz/sherlar/alisher-navoiy/, /uz/sherlar/bobur/, /uz/sherlar/cholpon/, /uz/sherlar/gafur-gulom/ (избранное + разбор), /uz/adabiyot/{gazal-nima, ruboiy, aruz-vazni, barmoq-vazni, qofiya}/. Тип: статьи + тексты.',
   effort='M', honesty='low',
   honesty_note='Брать оригинальные тексты и делать свою транслитерацию; комментарии современных редакторов охраняются.',
   caveat='Февраль ×5,8 (дни рождения Навои 9.02 и Бабура 14.02: по 40 500 в фев. 2026) — публиковать до середины января; летом ×0,14.'),
 'ismlar': dict(
   serp='«ismlar manosi» (25.10): AIO r1, видео, картинки, o1 YouTube, o2 oyina.uz (статья 2023), o3 jdpu.uz (PDF словаря Бегматова, 14 600 имён), o4 uz.wikipedia, o5–o6 приложения Play; веб-базы uzsmart.ru на o7 и ism-manosi.uz на o12. Слабая.',
   fit='a + c: поисковая база имён + проверенные значения',
   build='/uz/ismlar/ (поиск, фильтры qiz / o‘g‘il, происхождение, A–Z), /uz/ismlar/qiz-bolalar/, /uz/ismlar/ogil-bolalar/, программные /uz/ismlar/{ism}/ — только для имён с источником значения; /ru/uzbekskie-imena/ (+ для девочек / мальчиков). Тип: база-инструмент + программные страницы.',
   effort='L', honesty='medium',
   honesty_note='Нельзя копировать словарь Бегматова; нельзя выдумывать этимологию моделью; без религиозных предписаний («qanday ism qo‘yish mumkin emas»).',
   caveat='AIO на r1 (×0,533). Нужен датасет 2–5 тыс. имён с источниками — главный риск и главная стоимость.'),
 'shriftlar_niklar': dict(
   serp='Не снято. Ожидаемо: российские генераторы красивого текста и сайты скачивания шрифтов вперемешку. Смешанная/сильная.',
   fit='a: генератор стилизованного Unicode-текста',
   build='/ru/krasivye-shrifty/ (красивый текст для Instagram/Telegram), /ru/generator-nikov/ (ники для PUBG, Free Fire, игр), /uz/chiroyli-shriftlar/ (+ nik yozish). Тип: инструмент.',
   effort='S', honesty='low',
   honesty_note='Честно писать, что это Unicode-символы, а не устанавливаемые шрифты.',
   caveat='«красивый шрифт / красивые шрифты» частично про скачивание шрифтов — вес 0,5; голова «шрифты» 18 100 только в верхней оценке; далеко от бренда.'),
 'sinonimlar': dict(
   serp='Не снято. RU-выдача ожидаемо сильная (sinonim.org и др.); UZ — PDF словарей и блоги.',
   fit='a + c: словарь синонимов/антонимов с примерами',
   build='/uz/sinonimlar/ (поиск: so‘z → sinonim / antonim + misol), /ru/sinonimy/ (открытые данные Wiktionary/YARN, CC BY-SA, с атрибуцией).',
   effort='L', honesty='medium',
   honesty_note='Узбекские данные собрать и проверить самим (не копировать словарь Хожиева); списки от модели — только после проверки.',
   caveat='Растёт: «sinonimlar lug‘ati» ×4,4, «sinonim so‘zlar» ×2,2 к осени 2025. Пересекается с линзой образования («ma’nodosh so‘zlar» 720).'),
 'sanagich': dict(
   serp='Не снято. Ожидаемо глобальные инструменты (wordcounter.net и др.) по английским ключам. Сильная.',
   fit='a: детерминированный счётчик',
   build='/ru/schetchik-simvolov/ (слова, символы с пробелами и без, предложения, время чтения; интерфейс UZ/RU/EN) + /uz/belgilar-soni/.',
   effort='S', honesty='low',
   honesty_note='',
   caveat='73% спроса — английский «word counter» с глобальной конкуренцией; все узбекские варианты (so‘z sanash, belgilar soni) вернули null.'),
 'krossvord': dict(serp='Не снято.', fit='a: генератор кроссвордов/филвордов из списка слов и вопросов, печать', build='/uz/krossvord-tuzish/ + /ru/sostavit-krossvord/', effort='M', honesty='low', honesty_note='', caveat='Мал и сезонен (летом ×0,3); «кроссворд»/«krossvord» многозначны (вес 0,5); ребусы — картинки, не учтены.'),
 'imlo_tekshirish': dict(serp='«imlo tekshirish» (24.10, L3): PDF словарей, imlo.uz, savodxon.uz, izoh.uz, приложение Muharrir, AIO r2. Смешанная.', fit='b: пресет проверки орфографии в чате', build='/uz/imlo-tekshirish/ (пресет + правила)', effort='S', honesty='medium', honesty_note='Модель может ошибаться в узбекской орфографии — нужна оговорка и тест на выборке.', caveat='«imlo» 5 400 и «imlo uz» 9 900 — навигация к imlo.uz (исключены).'),
 'latifalar': dict(serp='Не снято.', fit='c: фольклор (Насреддин Афанди)', build='/uz/latifalar/', effort='S', honesty='low', honesty_note='', caveat='Мал; русские «анекдоты» 3 600 — сильная выдача, не наш профиль.'),
}

def top_kw(c, n=14):
    res = []
    for e in c['keywords'][:n]:
        s = f"{e['keyword']} {e['volume']:,}".replace(',', ' ')
        if e['same_bucket_as']:
            s += ' (= ' + ', '.join(e['same_bucket_as']) + ')'
        if e['weight'] != 1:
            s += f" (вес {e['weight']})"
        if e['jump_floor']:
            s += f" (пол {e['low_value']})"
        res.append(s)
    return '; '.join(res)

def ramp_str(r):
    w5, w10 = r['weeks_to_5'], r['weeks_to_10']
    if w5 is None:
        return f"на поз. ~6 до 5 визитов/день не доходит; только в топ-3 или в пиковый месяц (K1={r['k1']})"
    s = f"≥5 визитов/день через ~{w5} нед."
    s += f", ≥10 — через ~{w10} нед." if w10 else ", 10/день — только ближе к топ-3"
    return s + f" (K1={r['k1']}, полный прогноз поз. 6 за {r['months_to_full_pos6']} мес.)"

clusters = []
for i, cid in enumerate(ORDER + CUT, 1):
    c = model[cid]; q = Q[cid]
    clusters.append({
        'rank': i if cid in ORDER else None, 'below_cut': cid in CUT, 'id': cid, 'name': c['name'],
        'keywords': top_kw(c), 'keywords_full': c['keywords'], 'high_only': c['high_only'],
        'prior_counted_excluded': c['prior_counted_excluded'],
        'demand_month': c['demand_month_low'], 'demand_month_high': c['demand_month_high'],
        'seasonality': c['seasonality'], 'seasonality_index': c['seasonality_index'],
        'serp': q['serp'], 'serp_weakness': c['serp_weakness'], 'serp_source': c['serp_source'], 'aio_discount_top3': c['aio_discount_top3'],
        'fit': q['fit'], 'build': q['build'], 'effort': q['effort'], 'honesty_risk': q['honesty'], 'honesty_note': q['honesty_note'],
        'caveat': q['caveat'],
        'visits_day_pos6': c['visits_day_pos6'], 'visits_day_pos3': c['visits_day_pos3'],
        'visits_day_pos6_high_demand': c['visits_day_pos6_high_demand'], 'visits_day_pos3_high_demand': c['visits_day_pos3_high_demand'],
        'visits_day_pos3_no_aio': c['visits_day_pos3_no_aio'],
        'ramp': c['ramp'], 'ramp_weeks': ramp_str(c['ramp']),
    })

top = [c for c in clusters if not c['below_cut']]
tot = {
  'demand_month_low': sum(c['demand_month'] for c in top), 'demand_month_high': sum(c['demand_month_high'] for c in top),
  'visits_day_pos6': [sum(c['visits_day_pos6'][0] for c in top), sum(c['visits_day_pos6'][1] for c in top)],
  'visits_day_pos3': sum(c['visits_day_pos3'] for c in top), 'visits_day_pos3_high_demand': sum(c['visits_day_pos3_high_demand'] for c in top),
  'visits_day_pos3_no_aio': sum(c['visits_day_pos3_no_aio'] for c in top)}
doc = {
 'lens': 'text-tools', 'date': '2026-10-25', 'market': 'Google Uzbekistan (location 2860), Google Ads volumes (12-month mean Oct 2025 – Sep 2026)',
 'model': {'visits_formula': 'demand × CTR × AIO-discount / 30 × 1.5',
           'ctr_pos6': [0.00613, 0.01105], 'ctr_pos3': 0.03593, 'aio_discount': {'aio_r1': 0.533, 'aio_lower_or_unknown': 0.655},
           'dedup': 'same volume + same 12-month series (vol ≥ 100) = one Ads bucket; weights 0.5 for ambiguous heads; jump-shaped keys (Jul–Sep 2026 ≥ 5× Oct–Nov 2025, vol ≥ 500) taken at the Oct–Nov 2025 floor in demand_month',
           'demand_month': 'conservative (weights + floors); demand_month_high = all distinct phrases incl. ambiguous heads',
           'ramp': 'share of pos-6 forecast in month n = min(1, K1·n^1.6); K1 0.04 articles/strong SERP, 0.06 static collections on weak SERP, 0.08 tools on weak SERP (same assumption as education-practice lens); assumes pos ~6 is reached at all'},
 'credits': {'own_estimate': 420, 'cap': 600, 'calls': 'get_keyword_metrics ×2 (691 + 426 keywords), research_keywords 2 seeds (useless for 2860), get_serp_results 4 queries',
             'whoami': [20700, 19972, 18950], 'note': 'balance is shared with parallel lenses'},
 'totals_top12': tot,
 'clusters': clusters,
 'excluded': [
   {'group': 'Стихи авторов под охраной', 'demand': 25000, 'top': 'zulfiya sherlari 9 900, zulfiya she’rlari 3 600, abdulla oripov sherlari 5 400, erkin vohidov sherlari 4 400, shukur xolmirzayev 1 000, mirtemir sherlari 590', 'why': 'копировать нельзя; честно обслужить запрос по конкретному автору без его текстов невозможно'},
   {'group': 'Бренды-навигация', 'demand': 46200, 'top': 'quillbot 14 800, wheel of names 14 800, imlo uz = imlo.uz 9 900, grammarly 5 400, lotin.uz 1 300', 'why': 'навигация к чужим продуктам'},
   {'group': 'Изображения и песни', 'demand': 17800, 'top': 'открытки с днем рождения 8 100, доброе утро 8 100, текст песни 1 600', 'why': 'продукт не делает картинок; тексты песен охраняются'},
   {'group': 'Антиплагиат', 'demand': 6000, 'top': 'antiplagiat 3 600, антиплагиат 1 600, plagiat tekshirish 320', 'why': 'честно проверить заимствования без поискового индекса нельзя'},
   {'group': 'Цитаты, статусы, анекдоты (RU)', 'demand': 17000, 'top': 'анекдоты 3 600, цитаты 2 900, цитаты про жизнь 2 400, приколы 2 400, цитаты про любовь 1 900, status 1 900, statuslar 1 000', 'why': 'копипаст-жанр, сильные российские сайты, слабая связь с продуктом; узбекские «statuslar» ≈1,2 тыс.'},
   {'group': 'Уже посчитано в прежних оценках', 'demand': None, 'top': 'insho/esse 16 280 (roadmap), конвертер 12 490 (roadmap), tabrik 4 430 (roadmap), topishmoqlar 9 900 (education-practice)', 'why': 'не считать дважды'},
   {'group': 'Скачок без объяснения / чужая линза', 'demand': None, 'top': 'xulosa yozish 8 100 (480 → 18 100), matn yaratish 6 600 (170 → 18 100), xat yozish 3 600 (140 → 9 900)', 'why': 'форма «скачка» как у школьных тестов; это школьные/документные задачи, не линза текстовых инструментов'}],
 'overlap_for_other_lenses': [
   {'lens': 'education-practice (logic_quiz)', 'add': 'topishmoqlar javobi bilan 5 400, загадки 4 400, загадки для детей 1 900, загадки с ответами 720, топишмоқлар 720 (скачок, пол 45), bolalar uchun topishmoqlar 390, сложные загадки 260', 'demand': 13115, 'note': '«topishmoq» = «topishmoqlar» (одна корзина 9 900, уже у education)'}],
}
json.dump(doc, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('written', OUT, tot)
for c in clusters:
    print(c['rank'], c['id'], c['demand_month'], c['visits_day_pos6'], c['visits_day_pos3'], c['ramp_weeks'])
