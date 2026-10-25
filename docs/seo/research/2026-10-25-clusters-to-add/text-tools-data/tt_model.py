# Text & creative tools lens - demand and visits model (2026-10-25).
# Sources: tt_kw1_metrics.json, tt_kw2_metrics.json (this lens) + already-measured files (reused, not re-bought).
# visits/day = demand x CTR x AIO-discount / 30 x 1.5 ; CTR pos6 0.613-1.105 % (no extra AIO discount),
# pos3 3.593 % x 0.533 (AIO at r1) or x 0.655 (AIO lower / SERP not taken). Ramp: share of pos6 forecast in
# month n = min(1, K1 * n^1.6) (same assumption as education-practice lens).
import json, os, glob, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = r"F:\Claude\gptbot-snippets-translator-20261024\docs\seo\research"

rows = {}
files = [os.path.join(HERE, 'tt_kw1_metrics.json'), os.path.join(HERE, 'tt_kw2_metrics.json')] + \
    glob.glob(BASE + r"\2026-10-24-growth-audit\l3-data\kw*_metrics.json") + \
    glob.glob(BASE + r"\2026-10-25-roadmap-1000\data\kw*_metrics.json") + \
    [f for f in glob.glob(BASE + r"\2026-10-25-clusters-to-add\*-data\*metrics*.json") if 'text-tools-data' not in f]
for f in files:
    for r in json.load(open(f, encoding='utf-8')).get('keywords', []):
        rows.setdefault(r['keyword'].lower(), dict(r, src=os.path.basename(f)))

MONTHS = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
def series(k):
    r = rows.get(k)
    if not r or not r.get('monthly_searches'):
        return None
    m = {f"{x['year']}-{x['month']:02d}": x['search_volume'] for x in r['monthly_searches']}
    return [m.get(x, 0) or 0 for x in MONTHS]
def vol(k):
    r = rows.get(k)
    return (r or {}).get('search_volume') or 0
def floor_val(k):
    s = series(k); v = vol(k)
    if not s or v < 500:
        return v, False
    a = (s[0] + s[1]) / 2; b = (s[9] + s[10] + s[11]) / 3
    if a and b / a >= 5:
        return round(a), True
    return v, False

# cluster spec: low = list of (keyword, weight); high_only = keywords counted only in the upper bound
C = []
def cl(**kw):
    C.append(kw)

cl(id='tabrik_uz', name='Tug‘ilgan kun va bayram tabriklari (UZ lotin + kirill) + generator', aio=0.655, k1=0.06,
   serp_src='снято 24.10 (L3 serp2) «tugilgan kun tabriklari»', serp_weak='weak',
   low=['туғилган кун табриги', 'tugilgan kun tabrigi', 'tugilgan kunga tabrik', 'tugilgan kun tabrik', 'туғилган кун табриклари',
        'туғилган кунингиз билан', 'tugilgan kuning bilan', 'tabrik', 'akamga tabrik', 'singlimga tabrik', "tabrik she'rlar",
        'dugonamga tabrik', 'ustozga tabrik', 'tugilgan kun uchun tabrik', 'onamga tabrik', 'opamga tabrik', 'qizimga tabrik',
        'tugilgan kuningiz bilan', 'туғилган кунинг билан', "to'y tabriklari", 'ukamga tabrik', 'dadamga tabrik',
        'tugilgan kun tabriklari sherlar', 'sevgilimga tabrik', 'toy tabriklari', 'erimga tabrik', 'ayolimga tabrik', 'opaga tabrik',
        'chiroyli tabriklar', 'otaga tabrik', 'akaga tabrik', 'онага табрик', 'онамга табрик', 'дугонамга табрик',
        'tugilgan kun bilan tabriklash', 'tugilgan kun tilaklari', "to'yga tabrik", 'dugonaga tabrik', 'kelinga tabrik', 'rahbarga tabrik',
        'toy tabrigi', 'qisqa tabriklar',
        # seasonal
        '8 март табриклари', 'yangi yil tabrigi', 'янги йил табриклари', 'янги йил табриги', 'yangi yilingiz bilan', '8 mart tabriklari',
        '14 yanvar tabrik', '8 mart tabrik', '8 martga tabrik', '8 mart tabrigi', 'навруз табриклари', 'ustozlar kuniga tabrik',
        'hayit tabriklari', 'qurbon hayit tabriklari', 'yangi yilga tabrik', 'yangi yil tabriklari sherlar', "navro'z bayrami tabrik",
        'navruz tabriklari', "navro'z tabriklari", 'navruz tabrigi', 'ramazon hayit tabriklari', 'ustozlar kuniga tabriklar', 'ustoz tabrik'],
   high_only=[], prior_counted=['tugilgan kun tabriklari', 'tabriklar', 'yangi yil tabriklari', 'табриклар', 'табрик', 'onaga tabrik',
                                'tabrik yozish', 'tabrik matni', "tabrik so'zlari", 'ustozlar kuni tabrik', 'sms tabrik'])

cl(id='pozdravleniya_ru', name='Поздравления с днём рождения и праздниками (RU) + «на узбекском» + генератор', aio=0.655, k1=0.04,
   serp_src='снято 25.10 «поздравления с днем рождения»', serp_weak='mixed',
   low=['поздравления с днем рождения', 'поздравление с днём рождения', 'поздравление с днем рождения', 'поздравление с днем рождения мужчине',
        'поздравление с днем рождения своими словами', 'поздравление с днем рождения подруге', 'поздравление с днем рождения другу',
        'поздравление с днем рождения женщине', 'с днем рождения поздравления', 'пожелания на день рождения', 'поздравление с днем рождения сестре',
        'поздравление с днем рождения маме', 'поздравление с днем рождения сыну', 'поздравление с днем рождения брату',
        'поздравление с днем рождения девушке', 'поздравление с днем рождения коллеге', 'красивые поздравления с днем рождения',
        'поздравление с днем рождения в прозе', 'поздравление с днем рождения племяннице', 'поздравление маме с днем рождения',
        'поздравление с днем рождения дочери', 'поздравление с днем рождения тете', 'пожелания с днем рождения',
        'поздравление с днем рождения на узбекском языке', 'поздравление с днем рождения папе', 'поздравление с днем рождения мужу',
        'поздравление с днем рождения бабушке', 'поздравление с днем рождения внучке', 'с днем рождения на узбекском', 'поздравление с днем рождения внуку',
        'с днем рождения на узбекском языке', 'поздравление с днем рождения учителю', 'поздравление с днем рождения жене',
        'поздравление с днем рождения на узбекском', 'текст поздравления с днем рождения', 'короткие поздравления с днем рождения',
        'поздравление с днем рождения парню', 'поздравление с днем рождения ребенку', 'поздравление на узбекском языке',
        'что пожелать на день рождения', 'поздравления с днем рождения в стихах',
        # seasonal
        'поздравление с 8 марта', 'поздравления с 8 марта', 'поздравление с новым годом', 'поздравления с новым годом',
        'поздравление с днем учителя', 'поздравление учителю', 'поздравление с днем свадьбы', 'поздравление с навруз', 'поздравление на свадьбу',
        'поздравление с рождением ребенка', 'поздравление с юбилеем', 'поздравление с юбилеем женщине', 'поздравление с курбан хайит'],
   high_only=['с днем рождения', 'поздравление', 'поздравления'], prior_counted=[])

cl(id='sherlar_mavzu', name='She’rlar mavzular bo‘yicha (vatan, ustoz, ona, til, fasllar, bolalar) + «She’r yozib ber»', aio=0.655, k1=0.06,
   serp_src='снято 25.10 «vatan haqida sher»', serp_weak='weak',
   low=['vatan haqida sher', 'vatan haqida sherlar', 'ustoz haqida sher', 'ustoz haqida sherlar', 'til haqida sher', 'sherlar', "she'rlar",
        'ona haqida sherlar', 'bahor haqida sher', 'bahor haqida sherlar', 'sevgi haqida sherlar', 'sherlar toplami', "she'rlar to'plami",
        'bolalar uchun sherlar', 'yangi yil sherlari', 'ota haqida sher', 'ota haqida sherlar', 'qish haqida sher', 'qish haqida sherlar',
        'kitob haqida sherlar', 'kuz haqida sher', 'kuz haqida sherlar', 'yangi yilga sher', 'qisqa sherlar', 'tabiat haqida sher',
        'sevgi sherlari', "sevgi she'rlari", "she'r", 'dost haqida sher', 'navruz haqida sherlar', 'tugilgan kun sher', 'tugilgan kunga sher',
        'tugilgan kun sherlari', 'стихи про узбекистан', "ona haqida she'r", "vatan haqida she'r", "vatan haqida she'rlar", "ustoz haqida she'r",
        'hayot haqida sherlar', 'maktab haqida sher', 'maktab haqida sherlar', 'стихи про родину', 'ustozlarga sher', 'ozbekcha sherlar',
        'uzbekcha sherlar', 'bolalar sherlari', "do'stlik haqida she'r", 'ilm haqida sher', 'ilm haqida sherlar', "ota haqida she'r",
        "navro'z haqida she'r", 'gul haqida sher', 'стихи о родине', 'ustozga sher', 'dostlik haqida sher', 'dostlik haqida sherlar',
        'ozbekiston haqida sher', 'ozbekiston haqida sherlar', 'шеърлар', "ma'noli she'rlar", 'manoli sherlar', "bahor haqida she'r",
        "sevgi haqida she'r", 'sherlar sevgi', 'yangi sherlar', 'ustozlar kuniga sher', 'sherlar 4 qator', 'шеър', "qish haqida she'r",
        "maktab haqida she'r", 'ustozga sherlar', 'она ҳақида шеърлар', 'uzbek sherlari', 'onaga sher', "kuz haqida she'r", 'sher yozish',
        'sher yozish qoidalari', "kitob haqida she'r"],
   high_only=['sher', 'стихи', 'стих', 'стихотворение', 'стихи на новый год', 'стихи про осень', 'стихи для детей', 'стихи про маму',
              'стихи про зиму', 'стихи про учителя'], prior_counted=[])

cl(id='mumtoz_sheriyat', name='Mumtoz she’riyat (jamoat mulki): Navoiy, Bobur, g‘azal, ruboiy, aruz — matn + sharh', aio=0.655, k1=0.04,
   serp_src='не снято (ожидаемо ziyouz, kh-davron, Scribd/PDF, Wikipedia)', serp_weak='mixed',
   low=['alisher navoiy sherlari', "bobur g'azallari", "g'azal", 'gazal', "g'azallar", "navoiy g'azallari", 'ruboiylar', 'ruboiy',
        'cholpon sherlari', "cho'lpon she'rlari", 'aruz vazni', 'gafur gulom sherlari', 'barmoq vazni', 'navoiy gazallari', 'ruboiy nima',
        'nodira sherlari', 'qofiya', 'qofiya nima', 'bobur gazallari', 'navoiy hikmatlari', 'navoiy sherlari', "qofiyadosh so'zlar",
        "hamid olimjon she'rlari", 'uvaysiy gazallari', 'навоий ғазаллари', 'mashrab gazallari', 'ogahiy gazallari', 'gazal nima', "bobur she'rlari"],
   high_only=[], prior_counted=[])

cl(id='maqollar', name='Xalq og‘zaki ijodi: maqollar mavzular bo‘yicha + ma’nosi, iboralar, hikmatli so‘zlar, tez aytishlar (+ RU tarjima)', aio=0.655, k1=0.06,
   serp_src='не снято (ожидаемо n.ziyouz.com тематические списки, блоги, Scribd)', serp_weak='mixed',
   low=['maqollar', 'maqol', 'vatan haqida maqol', 'ona haqida maqol', 'kitob haqida maqol', 'odob haqida maqol', 'til haqida maqollar',
        'til haqida maqol', 'mehnat haqida maqol', 'iboralar', 'ozbek xalq maqollari', 'bilim haqida maqol', "hikmatli so'zlar", 'hikmatli sozlar',
        'tabiat haqida maqol', 'hunar haqida maqol', 'xalq maqollari', 'aforizmlar', 'ilm haqida maqol', 'oila haqida maqol', 'ozbek maqollari',
        'hikmatlar', "ibratli so'zlar", 'dostlik haqida maqollar', 'мақоллар', 'matallar', 'frazeologik birliklar', 'мақоллар тўплами',
        'иборалар', 'qisqa maqollar', 'frazeologik iboralar', 'ҳикматли сўзлар', 'мақол', 'iboralar manosi', 'maqollar toplami',
        'узбекские пословицы', 'пословицы на узбекском', 'узбекские пословицы с переводом', 'узбекские поговорки', 'dostlik haqida maqol', 'maqollar manosi',
        'tez aytishlar', 'tez aytish', 'тез айтишлар', 'скороговорки'],
   high_only=['пословицы', 'пословицы о родине', 'пословицы о труде', 'поговорки', 'пословицы о дружбе', 'пословицы и поговорки',
              'пословицы о книге', 'пословицы о знаниях', 'афоризмы'], prior_counted=[])


cl(id='ertaklar', name='Ertaklar va ibratli hikoyalar (o‘z qayta hikoyalari) + «Ertak to‘qib ber» / «сказка на ночь» generatori', aio=0.655, k1=0.04,
   serp_src='снято 25.10 «ertaklar»', serp_weak='mixed',
   low=['ertaklar', ('hikoyalar', 0.5), 'ertak', 'эртаклар', 'ibratli hikoyalar', 'alpomish dostoni', 'qisqa ertaklar', ('rivoyatlar', 0.5),
        'ezop masallari', 'qisqa hikoyalar', 'ozbek xalq ertaklari', 'masal', 'эртак', ('rivoyat', 0.5), 'masallar', 'qiziqarli hikoyalar',
        'ertaklar matni', 'sehrli ertaklar', 'hayotiy hikoyalar', 'rus xalq ertaklari', ('ibratli rivoyatlar', 0.5), 'dostonlar', 'krilov masallari',
        'ertaklar toplami', 'ўзбек халқ эртаклари', 'qisqa ertak', 'болалар учун эртаклар', 'hayvonlar haqida ertak', 'qisqa hikoya',
        'ertak yozish', 'ibratli ertaklar', 'ertak to\'qish', 'ozbek xalq ertagi',
        'сказки', 'сказка', 'сказки на ночь', 'сказка на ночь', 'сказки для детей', 'сказки на ночь для детей', 'узбекские народные сказки',
        'узбекские сказки', 'короткие сказки', 'короткие сказки на ночь', 'сказки на узбекском языке', 'сказка для детей на ночь',
        'узбекская народная сказка', 'придумать сказку', 'сказки на узбекском'],
   high_only=['рассказы', 'рассказы для детей', 'короткие рассказы'], prior_counted=[])

cl(id='ismlar', name='Ismlar ma’nosi: qidiruv bazasi (qiz / o‘g‘il, kelib chiqishi) + RU «узбекские имена»', aio=0.533, k1=0.08,
   serp_src='снято 25.10 «ismlar manosi»', serp_weak='weak',
   low=['ismlar manosi', 'ismlar', 'qiz bola ismlari', 'исмлар маъноси', 'qizlar ismlari', 'islomiy ismlar', 'arabcha ismlar', 'ism manosi',
        'chiroyli ismlar', 'исмлар', "ismlar ma'nosi", "ism ma'nosi", 'ism manolari', 'qiz bolalar ismlari', 'zamonaviy ismlar',
        'ismlar manosi qiz bolalar', 'ismlar manosi qizlar', 'ogil bolalar ismlari', "o'zbek ismlari", 'ozbek ismlari', 'turkcha ismlar',
        "o'zbekcha ismlar", 'ism tanlash', 'qiz ismlari', 'ўғил бола исмлари', 'islomiy ogil bola ismlari', 'чиройли исмлар', 'qiz bolalarga ismlar',
        'yangi ismlar', 'имена для девочек', 'имена для мальчиков', 'мусульманские имена для девочек', 'красивые имена для девочек',
        'мусульманские имена для мальчиков', 'значение имени', 'что означает имя', 'узбекские имена', 'красивые имена', 'редкие имена для девочек',
        'узбекские имена для девочек', 'узбекские женские имена', 'мусульманские имена', 'узбекские мужские имена', 'узбекские имена для мальчиков'],
   high_only=['имя', 'имена'], prior_counted=[])

cl(id='konvertor_alifbo', name='Kirill↔lotin konvertori (alohida sahifa) + o‘zbek alifbosi jadvali + yangi alifbo', aio=0.655, k1=0.08,
   serp_src='не снято (L3 serp2: lotin.uz — конвертер с новой азбукой — на o10 по «imlo tekshirish»)', serp_weak='mixed',
   low=['lotin krill', 'lotin kirill', 'кириллица в латиницу', 'krill lotin', 'lotin', 'лотин', 'латиница в кириллицу', 'kirilcha lotincha',
        'перевод с кириллицы на латиницу', 'перевод с латиницы на кириллицу', 'кирилл', 'lotindan kirilga', 'лотин кирилл таржима', 'транслитерация',
        'lotincha', 'lotin kirill online', 'kirill', 'lotin kirill tarjimon', 'кирилл лотин таржима', 'kirill lotin tarjima', 'lotin krill tarjima',
        'перевод на латиницу', "kirildan lotinga o'girish", 'транслитерация онлайн', 'kirill lotin online', 'латиница кириллица', 'krill lotin tarjima',
        'lotin alifbosi', "o'zbek alifbosi", 'лотин алифбоси', 'kirill alifbosi', 'ўзбек алифбоси', 'ozbek alifbosi', 'lotin yozuvi',
        'yangi alifbo 2026', 'yangi alifbo', 'новый узбекский алфавит', 'узбекская кириллица', 'узбекский латинский алфавит', 'yangi ozbek alifbosi',
        'yangi alifbo harflari', 'kirill yozuvi'],
   high_only=['транслит', 'alifbo', 'alifbo harflari', 'кириллица', 'латиница'],
   prior_counted=['лотин кирилл', 'кирилл лотин', 'kirill lotin', 'kirildan lotinga', 'kirill lotin tarjimon', 'кириллица латиница', 'lotin kirill tarjima'])

cl(id='shriftlar_niklar', name='Chiroyli shriftlar va niklar generatori (Unicode, Instagram/Telegram/PUBG)', aio=0.655, k1=0.06,
   serp_src='не снято', serp_weak='mixed',
   low=[('красивый шрифт', 0.5), ('красивые шрифты', 0.5), 'шрифты для ников', 'шрифт для инстаграма', 'shriftlar', 'chiroyli yozuvlar',
        'chiroyli shriftlar', 'красивый текст', 'ники для игр', 'красивые ники', 'красивые буквы', 'pubg nik', 'fancy text', 'шрифт для ника',
        'красивые надписи', 'chiroyli harflar', 'генератор шрифтов', 'красивые шрифты для ника', 'шрифты для инстаграм', 'ники для фф',
        'free fire nik', 'niklar', 'ники', 'никнейм', 'chiroyli niklar', 'генератор ников', ('nik', 0.5), ('ник', 0.5), 'shrift yozish',
        'chiroyli nik', 'nik yozish'],
   high_only=['шрифты', 'chiroyli yozuv'], prior_counted=[])

cl(id='randomayzer', name='Randomayzer: tasodifiy son, ism g‘ildiragi, qur’a, tanga (вне линзы: генератор)', aio=0.655, k1=0.06,
   serp_src='не снято (у «random number generator»/«генератор случайных чисел» Google показывает свой виджет)', serp_weak='mixed',
   low=[('random number generator', 0.5), 'рандомайзер', 'spin the wheel', ('рандомайзер чисел', 0.5), ('random number', 0.5), 'жеребьевка',
        ('генератор случайных чисел', 0.5), 'рандом', "g'ildirak", 'колесо фортуны онлайн', 'random name picker', 'монетка', 'жребий',
        'рандомайзер имен', 'случайное число', 'жеребьевка онлайн', 'подбросить монетку', 'колесо удачи', 'рандом число', 'колесо рандома',
        'бросить кубик', 'крутить колесо', 'random son'],
   high_only=['wheel of names', 'random', 'колесо фортуны'], prior_counted=[])

cl(id='krossvord', name='Krossvord va filvord tuzish (generator, chop etish)', aio=0.655, k1=0.06,
   serp_src='не снято', serp_weak='mixed', cut=True,
   low=['krossvord tuzish', 'создать кроссворд', 'krossvord tuzish dasturi', 'кроссворд онлайн', ('krossvord', 0.5), ('кроссворд', 0.5),
        'krossvord yasash', ('krossvordlar', 0.5), 'krossvord yaratish', 'составить кроссворд', 'сделать кроссворд', ('филворд', 0.5),
        ('кроссворд для детей', 0.5), 'составить кроссворд онлайн', 'кроссворд генератор', 'филворд онлайн', 'составить филворд',
        'генератор филвордов', 'кроссворд по информатике', 'кроссворд по биологии', 'кроссворд по истории'],
   high_only=['кроссворды', 'ребусы', 'rebus', 'rebuslar'], prior_counted=[])

# below the cut (computed for completeness)
cl(id='sinonimlar', name='Sinonimlar / antonimlar lug‘ati (UZ + RU)', aio=0.655, k1=0.04, serp_src='не снято', serp_weak='mixed',
   low=["sinonim so'zlar", "sinonimlar lug'ati", 'sinonim', 'sinonimlar', 'antonim', 'antonimlar', 'синоним', 'синонимы', 'антоним', 'антонимы',
        'синоним к слову', 'синонимы к слову'], high_only=['omonim'], prior_counted=[])
cl(id='sanagich', name='So‘z / belgi sanagich (word counter)', aio=0.655, k1=0.06, serp_src='не снято', serp_weak='strong',
   low=['word counter', 'word count', 'count words', 'счетчик слов', 'счетчик символов', 'character counter', 'character count', 'word counter online',
        'подсчет символов', 'подсчет слов', 'заглавные буквы', 'количество символов', 'количество слов', 'сколько слов в тексте',
        'сколько символов в тексте', 'посчитать количество символов', 'letter counter', 'посчитать символы', 'посчитать слова',
        'количество слов в тексте', 'перевернуть текст'], high_only=[], prior_counted=[])
cl(id='imlo_tekshirish', name='Imlo / orfografiya tekshiruvi (AI-пресет)', aio=0.655, k1=0.04,
   serp_src='снято 24.10 (L3 serp2) «imlo tekshirish»', serp_weak='mixed', cut=True,
   low=['imlo tekshirish', 'matn tekshirish', 'imlo xatolarni tekshirish', 'imlo xatolar tekshirish', 'xatolarni tekshirish', 'имло текшириш',
        'matndagi xatolarni tekshirish', 'imloni tekshirish', 'grammatika tekshirish', 'проверка орфографии', 'проверить орфографию',
        'проверка пунктуации', 'проверить текст на ошибки', 'проверка текста на ошибки', 'исправить ошибки в тексте', 'проверка текста',
        'проверка грамматики', 'проверка орфографии онлайн', 'проверка пунктуации онлайн', 'проверка правописания', ('орфография', 0.5)],
   high_only=['imlo'], prior_counted=[])
cl(id='latifalar', name='Latifalar (Nasriddin Afandi, xalq ijodi)', aio=0.655, k1=0.06, serp_src='не снято', serp_weak='mixed', cut=True,
   low=['nasriddin afandi', 'latifalar', 'latifa', 'afandi latifalari', 'afandi', 'латифалар', 'nasriddin afandi latifalari', 'anekdotlar',
        'kulgili latifalar'], high_only=['анекдоты', 'шутки'], prior_counted=[])

def sig(k):
    s = series(k)
    return (vol(k), tuple(s)) if s and vol(k) >= 100 else ('kw', k)

def weeks_to(target, full, k1):
    if full <= 0:
        return None
    for w in range(1, 105):
        n = w / 4.345
        if full * min(1, k1 * n ** 1.6) >= target:
            return w
    return None

out = []
for c in C:
    seen = {}
    kws = []
    season = [0.0] * 12
    missing = []
    for item in c['low']:
        k, w = (item if isinstance(item, tuple) else (item, 1.0))
        if k not in rows:
            missing.append(k); continue
        v_low, jumped = floor_val(k)
        v_high = vol(k)
        s = sig(k)
        if s in seen:
            seen[s]['same_bucket_as'].append(k); continue
        e = {'keyword': k, 'volume': v_high, 'weight': w, 'low_value': round(v_low * w), 'jump_floor': jumped, 'same_bucket_as': [], 'src': rows[k]['src']}
        seen[s] = e; kws.append(e)
        ser = series(k)
        if ser and v_high:
            scale = (v_low * w) / v_high if v_high else 0
            for i in range(12):
                season[i] += ser[i] * scale
    hi_extra = []
    for k in c['high_only']:
        if k in rows and vol(k):
            s = sig(k)
            if s in seen:
                continue
            hi_extra.append({'keyword': k, 'volume': vol(k)})
            seen[s] = {'same_bucket_as': []}
    d_low = sum(e['low_value'] for e in kws)
    d_high = sum(e['volume'] for e in kws) + sum(e['volume'] for e in hi_extra)
    avg = sum(season) / 12 if sum(season) else 0
    sidx = {MONTHS[i]: round(season[i] / avg, 2) for i in range(12)} if avg else {}
    peaks = sorted(sidx.items(), key=lambda x: -x[1])[:3]
    troughs = sorted(sidx.items(), key=lambda x: x[1])[:2]
    p6 = [round(d_low * 0.00613 / 30 * 1.5), round(d_low * 0.01105 / 30 * 1.5)]
    p6_hi = [round(d_high * 0.00613 / 30 * 1.5), round(d_high * 0.01105 / 30 * 1.5)]
    p3 = round(d_low * 0.03593 * c['aio'] / 30 * 1.5)
    p3_hi = round(d_high * 0.03593 * c['aio'] / 30 * 1.5)
    mid = sum(p6) / 2
    r = {'id': c['id'], 'name': c['name'], 'cut': c.get('cut', False), 'demand_month_low': d_low, 'demand_month_high': d_high,
         'keywords': sorted(kws, key=lambda e: -e['low_value']), 'high_only': hi_extra, 'prior_counted_excluded': c['prior_counted'],
         'missing_rows': missing, 'seasonality_index': sidx,
         'seasonality': 'пики: ' + ', '.join(f"{m} ×{v}" for m, v in peaks) + '; провалы: ' + ', '.join(f"{m} ×{v}" for m, v in troughs),
         'serp_source': c['serp_src'], 'serp_weakness': c['serp_weak'], 'aio_discount_top3': c['aio'],
         'visits_day_pos6': p6, 'visits_day_pos6_high_demand': p6_hi, 'visits_day_pos3': p3, 'visits_day_pos3_high_demand': p3_hi,
         'visits_day_pos3_no_aio': round(d_low * 0.03593 / 30 * 1.5),
         'ramp': {'k1': c['k1'], 'months_to_full_pos6': round((1 / c['k1']) ** (1 / 1.6), 1), 'm1_visits_mid': round(mid * c['k1'], 1),
                  'weeks_to_5': weeks_to(5, mid, c['k1']), 'weeks_to_10': weeks_to(10, mid, c['k1'])}}
    out.append(r)
    print(f"{c['id']:<18} low {d_low:>7} high {d_high:>7} pos6 {p6} pos3 {p3} (hi {p3_hi}) ramp5 {r['ramp']['weeks_to_5']}w ramp10 {r['ramp']['weeks_to_10']}w  missing={missing}")
    print('    ', r['seasonality'])
top = [r for r in out if not r['cut']]
print('TOP total low', sum(r['demand_month_low'] for r in top), 'high', sum(r['demand_month_high'] for r in top),
      'pos6', [sum(r['visits_day_pos6'][0] for r in top), sum(r['visits_day_pos6'][1] for r in top)],
      'pos3', sum(r['visits_day_pos3'] for r in top), 'pos3 hi', sum(r['visits_day_pos3_high_demand'] for r in top),
      'pos3 no-aio', sum(r['visits_day_pos3_no_aio'] for r in top))
json.dump(out, open(os.path.join(HERE, 'tt_model.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
