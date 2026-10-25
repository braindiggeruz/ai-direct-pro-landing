# Builds the candidate list for get_keyword_metrics (call 1).
# UZ Latin uses the ASCII apostrophe: OpenSEO rejects U+2018.
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
kw = []
def add(*xs):
    for x in xs:
        x = x.strip().lower()
        if x and x not in kw and len(x) <= 80:
            kw.append(x)

# --- RU niche x modifier ---
ru_niches = {
 'dent':  ['стоматологии', 'стоматологической клиники'],
 'clinic':['клиники', 'медицинского центра', 'медицинских услуг'],
 'edu':   ['учебного центра', 'образовательного центра', 'курсов', 'образовательных услуг'],
 'food':  ['ресторана', 'кафе'],
 'beauty':['салона красоты', 'бьюти мастера'],
 'realty':['недвижимости', 'застройщика', 'жк', 'новостроек', 'агентства недвижимости'],
 'auto':  ['автосалона', 'автосервиса'],
 'fashion':['магазина одежды', 'одежды'],
 'furn':  ['мебели', 'мебельного магазина'],
 'travel':['турагентства', 'туров', 'туристической компании'],
 'fit':   ['фитнес клуба', 'спортзала', 'фитнес центра'],
 'legal': ['юридических услуг', 'юриста', 'адвоката', 'юридической компании'],
}
for k, forms in ru_niches.items():
    add(f'реклама {forms[0]}', f'реклама для {forms[0]}', f'продвижение {forms[0]}', f'маркетинг {forms[0]}', f'маркетинг для {forms[0]}')
    for f in forms[1:]:
        add(f'реклама {f}', f'продвижение {f}')
    f = forms[0]
    add(f'smm для {f}', f'таргет для {f}', f'таргетированная реклама для {f}', f'реклама {f} в инстаграм',
        f'реклама {f} ташкент', f'продвижение {f} ташкент', f'продвижение {f} в инстаграм', f'контекстная реклама для {f}',
        f'реклама {f} в телеграм', f'seo для {f}', f'сайт для {f}', f'раскрутка {f}')
add('как привлечь клиентов в стоматологию', 'как привлечь пациентов в клинику', 'как привлечь пациентов', 'медицинский маркетинг',
    'маркетинг в медицине', 'маркетинг в стоматологии', 'реклама медицинских услуг закон',
    'как набрать учеников', 'как привлечь учеников в учебный центр', 'как набрать учеников в учебный центр', 'маркетинг в образовании',
    'как привлечь клиентов в ресторан', 'как привлечь клиентов в кафе', 'маркетинг ресторана', 'ресторанный маркетинг', 'реклама кафе в инстаграм',
    'как привлечь клиентов в салон красоты', 'как найти клиентов в салон красоты', 'маркетинг салона красоты',
    'как продать квартиру быстро', 'маркетинг в недвижимости', 'лиды на недвижимость', 'реклама риэлтора',
    'как привлечь клиентов в автосервис', 'маркетинг автосервиса',
    'как продвигать магазин одежды', 'как раскрутить магазин одежды', 'как продвигать бренд одежды',
    'как продавать мебель', 'реклама мебели в инстаграм', 'маркетинг мебельного магазина',
    'как привлечь клиентов в турагентство', 'маркетинг в туризме', 'реклама в туризме',
    'как привлечь клиентов в фитнес клуб', 'маркетинг фитнес клуба',
    'как привлечь клиентов юристу', 'маркетинг для юристов', 'реклама юридических услуг в интернете')
# opening stage: owners who are about to need launch marketing
add('открыть кафе', 'открыть кафе в ташкенте', 'как открыть кафе', 'как открыть ресторан', 'открыть ресторан в ташкенте',
    'как открыть учебный центр', 'открыть учебный центр', 'открыть учебный центр в ташкенте', 'как открыть стоматологию',
    'открыть стоматологию', 'как открыть салон красоты', 'открыть салон красоты', 'как открыть магазин одежды', 'открыть магазин одежды',
    'как открыть автосервис', 'открыть автосервис', 'как открыть турагентство', 'открыть турагентство', 'как открыть фитнес клуб',
    'открыть бизнес в узбекистане', 'бизнес в узбекистане', 'бизнес в ташкенте', 'какой бизнес открыть в ташкенте', 'бизнес идеи в узбекистане',
    'бизнес идеи', 'бизнес план кафе', 'бизнес план учебного центра', 'бизнес план салона красоты', 'бизнес план стоматологии')

# --- RU generic ---
add('как привлечь клиентов', 'привлечение клиентов', 'как найти клиентов', 'как увеличить продажи', 'увеличение продаж',
    'как поднять продажи', 'развитие бизнеса', 'как развить бизнес', 'как развивать бизнес', 'маркетинг для малого бизнеса',
    'реклама для малого бизнеса', 'продвижение малого бизнеса', 'маркетинговая стратегия', 'маркетинговый план', 'план маркетинга',
    'как продвигать бизнес', 'продвижение бизнеса в интернете', 'продвижение бизнеса', 'где дать рекламу', 'где дать рекламу в ташкенте',
    'реклама в ташкенте', 'реклама ташкент', 'рекламное агентство ташкент', 'рекламное агентство', 'маркетинговое агентство ташкент',
    'маркетинговое агентство', 'маркетолог ташкент', 'маркетолог', 'услуги маркетолога', 'нанять маркетолога', 'маркетолог на аутсорсе',
    'сколько стоит маркетолог', 'маркетолог вакансии ташкент', 'маркетинг ташкент', 'маркетинговые услуги', 'маркетинговые услуги ташкент',
    'воронка продаж', 'отдел продаж', 'скрипт продаж', 'холодные звонки', 'база клиентов', 'как удержать клиентов', 'сарафанное радио',
    'партизанский маркетинг', 'бесплатная реклама', 'как сделать рекламу', 'как рекламировать бизнес', 'как прорекламировать бизнес',
    'реклама бизнеса в интернете', 'интернет маркетинг', 'digital маркетинг', 'лидогенерация', 'лидогенерация ташкент', 'лиды',
    'стоимость лида', 'целевая аудитория', 'как определить целевую аудиторию', 'анализ конкурентов', 'уникальное торговое предложение',
    'утп', 'позиционирование', 'брендинг', 'брендинг ташкент', 'нейминг', 'фирменный стиль', 'логотип ташкент', 'упаковка бизнеса',
    'упаковка инстаграм', 'аудит инстаграм', 'продающий текст', 'продающий пост', 'оффер')

# --- UZ Latin niche x modifier (ASCII apostrophe) ---
uz_niches = {
 'dent':  ['stomatologiya', 'stomatologiya klinikasi', 'tish klinikasi'],
 'clinic':['klinika', 'tibbiyot markazi', 'shifoxona'],
 'edu':   ["o'quv markaz", "o'quv markazi", 'kurs', 'kurslar', "ta'lim markazi"],
 'food':  ['restoran', 'kafe', 'fast food', 'choyxona', 'oshxona'],
 'beauty':["go'zallik saloni", 'salon', 'sartaroshxona', 'barbershop'],
 'realty':["ko'chmas mulk", 'uy sotish', 'kvartira', 'quruvchi', 'qurilish kompaniyasi', 'yangi uylar'],
 'auto':  ['avtosalon', 'avtoservis', 'avtomobil'],
 'fashion':["kiyim do'koni", 'kiyim', 'kiyimlar'],
 'furn':  ['mebel', "mebel do'koni"],
 'travel':['turizm', 'turagentlik', 'turfirma', 'sayohat'],
 'fit':   ['fitnes', 'sport zal', 'fitnes klub'],
 'legal': ['yurist', 'yuridik xizmatlar', 'advokat'],
}
for k, forms in uz_niches.items():
    add(f'{forms[0]} reklama', f'{forms[0]} uchun reklama', f'{forms[0]} reklamasi', f'{forms[0]} marketing')
    for f in forms[1:]:
        add(f'{f} reklama', f'{f} uchun reklama')
    f = forms[0]
    add(f'{f} uchun marketing', f'{f} uchun smm', f'{f} uchun target', f'{f} mijoz topish', f'{f} reklama matni',
        f'{f} ochish', f'{f} biznes reja', f'{f} instagram', f'{f} uchun sayt')
add("o'quv markazga o'quvchi jalb qilish", "o'quvchi jalb qilish", "o'quv markaz ochish uchun nima kerak", 'kafe ochish uchun nima kerak',
    'restoran ochish', 'kafe ochish', "go'zallik saloni ochish", 'salon ochish', 'stomatologiya ochish', 'avtoservis ochish',
    "kiyim do'koni ochish", 'mebel sexi ochish', 'turagentlik ochish', 'fitnes zal ochish', 'uy sotish elon', 'uyni tez sotish',
    'kvartira sotish', 'uyni qanday sotish')

# --- UZ Latin generic ---
add('mijoz topish', 'mijozlarni jalb qilish', 'mijoz jalb qilish', 'mijozlar bazasi', 'mijoz topish usullari', 'mijozlarni qanday topish',
    'sotuvni oshirish', 'savdoni oshirish', "sotuvni ko'paytirish", "savdoni ko'paytirish", 'sotuvni oshirish usullari',
    'biznesni rivojlantirish', "biznesni rivojlantirish yo'llari", 'marketing strategiya', 'marketing strategiyasi', 'marketing rejasi',
    'marketing reja', 'biznesni reklama qilish', 'biznes reklama', 'kichik biznes reklama', 'reklama qanday qilinadi', 'reklama qilish',
    'reklama berish', 'instagramda reklama berish', 'telegramda reklama berish', 'reklama joylashtirish', 'internetda reklama',
    'onlayn biznes', "internet do'kon ochish", "biznes g'oyalar", "kichik biznes g'oyalar", 'biznes ochish', 'biznes boshlash',
    "yangi biznes g'oyalar", "o'zbekistonda biznes", 'toshkentda biznes', 'sotuv voronkasi', "sotuv bo'limi", 'sotuv menejeri',
    'sotuv texnikasi', 'sotuv skriptlari', 'sotuv skripti', 'marketolog', 'marketolog kerak', 'marketolog xizmati', 'marketing agentligi',
    'reklama agentligi', 'reklama agentligi toshkent', 'brending', 'logo yaratish', 'maqsadli auditoriya', 'raqobatchilar tahlili',
    'reklama matni', 'reklama matni yozish', 'sotuvchi matn', 'biznes uchun instagram', 'instagram biznes', 'telegram biznes',
    "biznesni o'stirish", 'daromadni oshirish', 'mijozlarni ushlab qolish', 'kichik biznes', "o'rta biznes")

# --- UZ Cyrillic (spot checks) ---
add('мижоз топиш', 'мижозларни жалб қилиш', 'сотувни ошириш', 'савдони ошириш', 'бизнесни ривожлантириш', 'маркетинг стратегия',
    'реклама қилиш', 'реклама бериш', 'бизнес ғоялар', 'бизнес очиш', 'ўқув маркази реклама', 'стоматология реклама', 'ресторан реклама',
    'кафе реклама', 'мебел реклама', 'кийим реклама', 'реклама матни', 'бизнес режа')

print(len(kw))
json.dump(kw, open(os.path.join(HERE, 'kw_call1_list.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
