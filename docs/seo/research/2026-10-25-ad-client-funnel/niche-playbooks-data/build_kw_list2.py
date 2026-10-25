# Candidate list for get_keyword_metrics call 2: expands the niche signals found in call 1
# (o'quv markazi reklama 170, go'zallik saloni reklama 70, salon reklama 50, стоматология реклама 40,
#  реклама кафе в инстаграм 40, fast food reklama 30, biznes g'oyalar 170, marketing strategiyasi 110,
#  biznesni rivojlantirish 70) and tests apostrophe-less spellings, ad-text / idea / naming / promo variants
#  and the opening stage (names, YaTT). UZ Latin uses the ASCII apostrophe.
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
done = set(json.load(open(os.path.join(HERE, 'kw_call1_list.json'), encoding='utf-8')))
kw = []
def add(*xs):
    for x in xs:
        x = x.strip().lower()
        if x and x not in kw and x not in done and len(x) <= 80:
            kw.append(x)

# 1. apostrophe-less and alternative spellings of the UZ niche heads
add('oquv markazi reklama', 'oquv markaz reklama', 'uquv markazi reklama', "o'quv markazlari reklama", "o'quv markazlari reklamasi",
    'gozallik saloni reklama', 'gozallik salon reklama', "go'zallik salon reklama", 'salon krasoti reklama', 'kochmas mulk reklama',
    'kiyim dokoni reklama', 'mebel dokoni reklama', 'stomatologiya reklamalari', 'stamatologiya reklama', 'klinika reklamalari',
    'restoran reklamalari', 'kafe reklamasi', 'fastfood reklama', 'fast food reklamasi', 'burger reklama', 'lavash reklama',
    'pizza reklama', 'shashlik reklama', 'barbershop reklamasi', 'sartarosh reklama', 'manikyur reklama', 'kosmetologiya reklama',
    'avtomaktab reklama', 'bog\'cha reklama', 'xususiy maktab reklama', 'repetitor reklama', 'ingliz tili kursi reklama',
    'ingliz tili reklama', 'it kurslar reklama', 'dasturlash kursi reklama', 'turizm reklamasi', 'sayohat reklamasi', 'umra reklama',
    'mebel reklamasi', 'oshxona mebel reklama', 'kiyim reklamasi', 'ayollar kiyimi reklama', 'bolalar kiyimi reklama',
    'atir reklama', 'kosmetika reklama', 'telefon reklama', 'qurilish materiallari reklama', 'uy reklama', 'kvartira sotish reklama',
    'dorixona reklama', 'optika reklama', 'gul reklama', 'tort reklama', 'konditer reklama', 'to\'yxona reklama', 'restoran to\'yxona reklama')
# 2. niche ad text / video / banner / ideas
for n in ["o'quv markazi", "o'quv markaz", "go'zallik saloni", 'salon', 'stomatologiya', 'restoran', 'kafe', 'fast food', 'mebel',
          'kiyim', 'fitnes', 'turizm', 'avtosalon', "ko'chmas mulk", 'barbershop']:
    add(f'{n} reklama matni', f'{n} reklama video', f'{n} reklama banner', f'{n} uchun reklama matni', f'{n} reklama namunasi',
        f"{n} reklama g'oyalari", f'{n} instagram reklama')
add('reklama matni namunalari', 'reklama matni namuna', 'reklama matnlari', 'reklama video', 'reklama banner', "reklama g'oyalari",
    'reklama namunalari', 'reklama shiorlari', 'reklama shiori', 'reklama turlari', 'reklama nima', 'reklama haqida')
# 3. RU ad text / ideas / promos per niche
for n in ['кафе', 'ресторана', 'салона красоты', 'стоматологии', 'учебного центра', 'магазина одежды', 'мебели', 'фитнес клуба',
          'турагентства', 'недвижимости', 'автосервиса', 'клиники']:
    add(f'рекламный текст для {n}', f'идеи рекламы {n}', f'акции для {n}', f'реклама {n} примеры', f'реклама {n} текст')
add('стоматология реклама текст', 'стоматология реклама в инстаграм', 'стоматология instagram', 'стоматология smm',
    'акции для привлечения клиентов', 'идеи акций для привлечения клиентов', 'акция для клиентов', 'идеи для рекламы', 'идеи рекламы',
    'креативная реклама', 'рекламный текст', 'рекламный текст примеры', 'рекламный слоган', 'слоган для кафе', 'слоган для салона красоты',
    "aksiya g'oyalari", 'chegirma aksiya', 'aksiya reklama')
# 4. naming = opening stage
for n in ["o'quv markaz", "o'quv markazi", 'kafe', 'restoran', 'salon', "go'zallik saloni", 'fast food', 'barbershop', 'stomatologiya',
          "kiyim do'koni", "mebel do'koni", 'magazin', "do'kon", 'firma', 'kompaniya', 'brend']:
    add(f'{n} nomlari', f'{n} uchun nom')
add('название для кафе', 'название для салона красоты', 'название для учебного центра', 'название для магазина одежды',
    'название для барбершопа', 'название для стоматологии', 'название для ресторана', 'название для бренда одежды', 'название компании',
    'названия для магазина', 'oquv markaz nomlari', 'kafe nomi', 'salon nomi', 'nom tanlash', 'biznes uchun nom', 'brend nomi')
# 5. business ideas / start
add("biznes g'oyalari", 'biznes goyalar', "biznes g'oyalar 2026", "biznes g'oyalar 2025", "o'zbekistonda biznes g'oyalar",
    "kam pulga biznes g'oyalar", "uyda biznes g'oyalar", "ayollar uchun biznes g'oyalar", "qishloqda biznes g'oyalar",
    'kichik biznes goyalar', "kichik biznes g'oyalari", 'foydali biznes', 'eng foydali biznes', 'qanday biznes qilish mumkin',
    'qanday biznes ochish kerak', 'biznes qilish', "o'z biznesini ochish", 'biznes boshlash uchun', 'biznes sirlari',
    'бизнес идеи 2026', 'бизнес идеи 2025', 'бизнес идеи для женщин', 'бизнес идеи с минимальными вложениями', 'бизнес с нуля',
    'малый бизнес идеи', 'бизнес идеи ташкент', 'какой бизнес открыть', 'идеи для бизнеса', 'бизнес идеи узбекистан',
    'yatt ochish', 'yakka tartibdagi tadbirkor', "yatt ro'yxatdan o'tish", "yatt bo'lish", 'как открыть ип в узбекистане',
    'открыть ип в узбекистане', 'ип в узбекистане', 'самозанятый узбекистан', "o'zini o'zi band qilish")
# 6. marketing strategy / development / sales (UZ + Cyrillic UZ + RU)
add('marketing strategiyasi nima', 'marketing strategiya namuna', 'marketing rejasi namunasi', 'marketing reja namuna',
    'biznes uchun marketing', 'marketing turlari', 'marketing asoslari', 'marketing kitob', 'marketing kurs', "marketing bo'yicha kitob",
    'raqamli marketing', 'digital marketing nima', 'internet marketing nima', 'smm marketing', 'marketing 4p', 'marketing tahlil',
    'маркетинг стратегияси', 'маркетинг режаси', 'маркетинг нима', 'маркетинг турлари',
    'biznesni rivojlantirish uchun', 'biznesni qanday rivojlantirish', 'biznesni kengaytirish', "biznesni o'stirish yo'llari",
    'biznes rivojlantirish', "бизнесни ривожлантириш йўллари", 'кичик бизнес', 'кичик бизнес ғоялари',
    "savdoni oshirish yo'llari", 'sotuvni qanday oshirish', 'sotishni oshirish', 'savdo sirlari', 'sotuv sirlari', 'qanday sotish kerak',
    'mahsulotni qanday sotish', 'tovarni qanday sotish', 'instagramda qanday sotish', 'telegramda sotish', 'sotuvchi bo\'lish',
    'mijozlar bilan ishlash', 'mijozlar bilan muloqot', 'mijozni qanday topish', 'mijoz topish yollari', 'mijozlarni jalb qilish usullari',
    'как привлечь клиентов в бизнес', 'способы привлечения клиентов', 'методы привлечения клиентов', 'как увеличить продажи в магазине',
    'как увеличить продажи в инстаграм', 'как увеличить продажи в кафе', 'как увеличить продажи в ресторане',
    'как увеличить продажи салона красоты', 'как развить малый бизнес', 'стратегия развития бизнеса', 'маркетинг план пример',
    'маркетинговый план пример', 'маркетинговая стратегия пример', 'smm стратегия', 'стратегия продвижения', 'стратегия продвижения в инстаграм')

print(len(kw))
json.dump(kw, open(os.path.join(HERE, 'kw_call2_list.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
