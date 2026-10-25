"""Education & practice lens: cluster demand, dedupe, jump-floor, seasonality, visit potential.

Run: py -3 -I ep_model.py   (reads files only; writes ep_model.json next to this script)

Sources (in priority order, first hit wins):
  ep_kw1_metrics.json                      - get_keyword_metrics 2026-10-25, 459 new keywords (this lens)
  ../../2026-10-24-growth-audit/l3-data/kw1_metrics.json, kw2_metrics.json
  ../../2026-10-25-roadmap-1000/data/kw3_metrics.json, kw4_metrics.json
Model (roadmap section 1.1 + demand-sizing section 1):
  visits/day = demand/month x CTR x AIO-discount / 30 x 1.5
  pos ~6: CTR 0.613 .. 1.105 % (site's own curve, already measured on AIO SERPs -> no extra discount)
  pos ~3: CTR 3.593 % x 0.533 (AIO at r1) or x0.655 (AIO lower / not measured)
Dedupe: rows with identical volume AND identical 12-month series (volume >= 100) are one Google Ads bucket.
Jump floor: a keyword whose mean(Jul-Sep 2026) / mean(Oct-Nov 2025) >= 5 (and volume >= 500) is "jump-shaped";
  its floor = mean(Oct-Nov 2025). Floor demand = sum of floors (stable keywords keep their Ads average).
"""
import json, os, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = [
    os.path.join(HERE, 'ep_kw1_metrics.json'),
    os.path.join(R, '2026-10-24-growth-audit', 'l3-data', 'kw1_metrics.json'),
    os.path.join(R, '2026-10-24-growth-audit', 'l3-data', 'kw2_metrics.json'),
    os.path.join(R, '2026-10-25-roadmap-1000', 'data', 'kw3_metrics.json'),
    os.path.join(R, '2026-10-25-roadmap-1000', 'data', 'kw4_metrics.json'),
]
DB = {}
for f in SRC:
    d = json.load(open(f, encoding='utf-8'))
    for k in d['keywords']:
        kw = k['keyword']
        if kw in DB:
            continue
        ms = k.get('monthly_searches') or k.get('monthly') or []
        ser = [m.get('search_volume') for m in ms] if ms and isinstance(ms[0], dict) else list(ms)
        DB[kw] = {'vol': k.get('search_volume') or 0, 'ser': ser, 'src': os.path.basename(f)}

CTR6 = (0.00613, 0.01105)
CTR3 = 0.03593
MULT = 1.5
MONTHS = ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01',
          '2025-12', '2025-11', '2025-10']

# role: core = counted; head = broad/ambiguous/navigational-leaning, shown as upper bound only;
#       susp = anomalous bucket, upper bound only; excl = excluded (listed for transparency)
CLUSTERS = [
    {'id': 'practice_tests', 'name': 'Fanlar bo‘yicha amaliy testlar (o‘z savollari + izoh)', 'aio': 0.655,
     'kw': {'core': ['informatika test', 'informatika testlar', 'fizika test', 'fizika testlar', 'matematika test',
                     'matematika testlar', 'biologiya test', 'biologiya testlar', 'ingliz tili test',
                     'ingliz tili testlar', 'ona tili test', 'tarix test', 'tarix testlar', 'tarix testlari',
                     'geografiya test', 'geografiya testlar', 'kimyo test', 'kimyo testlar', 'adabiyot test',
                     'adabiyot testlar', 'huquq test', 'huquq testlar', 'rus tili test', 'rus tili testlar',
                     'informatika testlari', 'matematika test savollari', 'tarix test savollari',
                     'informatika test savollari', 'matematika online test', 'matematika test 5 sinf',
                     'matematika test 9 sinf', 'matematika test 6 sinf', 'matematika test 7 sinf',
                     'informatika test 5 sinf', 'informatika test 6 sinf', 'informatika online test',
                     'ona tili fanidan test', 'fizika test savollari', 'tarix online test', 'tarix fanidan test',
                     'algebra test', 'биология тест', 'тарих тест', 'математика тест', 'тест по русскому языку',
                     'тест по математике', 'тест по биологии', 'тест по химии', 'тест по истории',
                     'тест по английскому', 'тест по географии', 'тесты онлайн', 'онлайн тест', 'test savollari',
                     'testlar', 'online test', 'test ishlash', 'online test yechish', 'tarixiy sanalar',
                     'poytaxtlar', 'materiklar', 'dunyo davlatlari', 'matematika test javoblari bilan',
                     'informatika test javoblari bilan', 'fizika test javoblari bilan'],
            'susp': ['ona tili testlar'],
            'head': ['test yechish'],
            'excl': ['test javoblari', 'dtm test javoblari', 'test javoblarini topish', 'test javobi',
                     'testlar javoblari bilan', 'test savollari javoblari bilan']}},
    {'id': 'exam_prep', 'name': 'DTM / Milliy sertifikat / attestatsiya: format, mock-test, ball kalkulyatori',
     'aio': 0.655,
     'kw': {'core': ['dtm test', 'дтм тест', 'dtm online test', 'dtm 2026', 'abituriyentlar uchun test',
                     'dtm test ishlash', 'dtm blok test', 'dtm test 2026', 'dtm savollari', 'dtm testlari',
                     'ona tili dtm test', 'ingliz tili dtm test', 'matematika dtm test', 'tarix dtm test',
                     'fizika dtm test', 'kimyo dtm test', 'biologiya dtm test', 'matematika milliy sertifikat',
                     'tarix milliy sertifikat', 'milliy sertifikat matematika', 'milliy sertifikat 2026',
                     'миллий сертификат', 'biologiya milliy sertifikat', 'milliy sertifikat tarix',
                     'fizika milliy sertifikat', 'milliy sertifikat savollari', 'kimyo milliy sertifikat',
                     'milliy sertifikat biologiya', 'milliy sertifikat testlari', 'milliy sertifikat kimyo',
                     'milliy sertifikat test', 'milliy sertifikat fizika', 'milliy sertifikat ball',
                     'milliy sertifikat namuna', 'informatika milliy sertifikat', 'attestatsiya test',
                     'attestatsiya testlari', 'dtm ball hisoblash', 'abituriyent test', 'prezident maktabi test'],
            'head': ['milliy sertifikat', 'attestatsiya'],
            'excl': ['dtm', 'abituriyent', 'uzbmb', 'prezident maktabi', 'bsb', 'bsb test', 'otish ballari',
                     'dtm test javoblari']}},
    {'id': 'math_formulas_calculators', 'name': 'Formulalar + qadamli kalkulyatorlar (matematika, fizika)',
     'aio': 0.533,
     'kw': {'core': ['qisqa kopaytirish formulalari', 'tenglamalar sistemasi', 'uchburchak yuzi', 'ekub va ekuk',
                     'ekuk topish', 'ekuk ekub', 'нод и нок', 'tub sonlar', 'kvadrat tenglama', 'дискриминант',
                     'diskriminant', 'квадратное уравнение', 'kasrlar', 'калькулятор дробей', 'pifagor teoremasi',
                     'hosila', 'integral', 'kvadratlar jadvali', 'таблица квадратов', 'aylana uzunligi',
                     'tengsizliklar', 'doira yuzi', 'logarifm', 'matematika formulalar', 'trigonometriya formulalari',
                     'progressiya', 'formulalar', 'matematika formulalari', 'geometriya formulalari',
                     'формулы по математике', 'foiz hisoblash', 'foiz kalkulyator', 'foizni hisoblash',
                     'gpa calculator', 'gpa hisoblash', 'fizika formulalari', 'fizika formulalar',
                     'формулы по физике', 'olchov birliklari', 'birliklar'],
            'head': ['калькулятор процентов', 'процент от числа'],
            'excl': ['limit', 'tenglama yechish', 'tenglamalar yechish']}},
    {'id': 'logic_quiz', 'name': 'Mantiqiy savollar, boshqotirmalar, topishmoqlar, viktorina', 'aio': 0.655,
     'kw': {'core': ['mantiqiy savollar', 'zakovat savollari', 'boshqotirma', 'boshqotirmalar', 'qiziqarli savollar',
                     'mantiqiy masalalar', 'viktorina', 'viktorina savollari', 'topishmoqlar'],
            'head': ['zakovat', 'savol javob'],
            'excl': []}},
    {'id': 'iq_test', 'name': 'IQ / mantiqiy fikrlash testi (normasiz, o‘yin formatida)', 'aio': 0.655,
     'kw': {'core': ['iq test', 'iq test uzbek tilida', 'тест iq'], 'head': [], 'excl': []}},
    {'id': 'periodic_table_chem', 'name': 'Mendeleyev jadvali (interaktiv) + kimyo ma’lumotnomasi', 'aio': 0.655,
     'kw': {'core': ['mendeleyev jadvali', 'таблица менделеева', 'mendeleev jadvali', 'kimyoviy elementlar jadvali',
                     'менделеев жадвали', 'oksidlanish darajasi', 'kimyoviy reaksiyalar', 'молярная масса',
                     'molyar massa', 'valentlik', 'kimyo formulalar', 'уравнять реакцию'],
            'susp': ['kimyo masalalar'], 'head': [], 'excl': []}},
    {'id': 'ona_tili_grammar', 'name': 'Ona tili: qoidalar, imlo, diktant matnlari + mashqlar', 'aio': 0.655,
     'kw': {'core': ['imlo qoidalari', 'gap bolaklari', 'kelishiklar', 'ravish', 'fonetika', 'tinish belgilari',
                     'olmosh', 'omonimlar', 'manodosh sozlar', 'morfologiya', 'sintaksis', 'qoshma gap', 'fel',
                     'sinonimlar', 'antonimlar', 'soz turkumlari', 'ot soz turkumi', 'frazeologizmlar',
                     'kelishik qoshimchalari', 'diktant', 'diktant 5 sinf', 'diktant 4 sinf', 'diktant 6 sinf'],
            'head': ['sifat', 'imlo'],
            'excl': ["imlo lug'ati"]}},
    {'id': 'english_grammar', 'name': 'Ingliz tili grammatikasi o‘zbekcha + daraja testi', 'aio': 0.655,
     'kw': {'core': ['irregular verbs', 'present simple', 'present perfect', 'неправильные глаголы',
                     "noto'g'ri fe'llar", 'tenses', 'неправильные глаголы английского языка', 'english grammar test',
                     'english test', 'тест на уровень английского', 'ingliz tili grammatika', 'ingliz tili darslari',
                     'определить уровень английского'],
            'head': [], 'excl': ['ingliz tili']}},
    {'id': 'ielts_cefr_writing', 'name': 'IELTS / CEFR / Multilevel writing tekshiruvi (AI) + mock', 'aio': 0.655,
     'kw': {'core': ['ielts writing task 2', 'ielts writing', 'ielts writing checker', 'multilevel writing',
                     'cefr writing', 'cefr test', 'multilevel test', 'ielts test', 'multi level test',
                     'writing tekshirish'],
            'head': ['cefr', 'multilevel'], 'excl': ['ielts']}},
    {'id': 'number_converters', 'name': 'Rim raqamlari, sanoq sistemalari (+ son so‘z bilan)', 'aio': 0.655,
     'kw': {'core': ['rim raqamlari', 'римские цифры', 'sanoq sistemasi', 'sanoq sistemalari',
                     'ikkilik sanoq sistemasi', 'двоичная система счисления'],
            'head': ['сумма прописью'], 'excl': []}},
    {'id': 'primary_math_grades', 'name': 'Boshlang‘ich matematika: sinf bo‘yicha misollar + karra jadvali trenajyori',
     'aio': 0.655,
     'kw': {'core': ['matematika 3 sinf', 'matematika 2 sinf', 'matematika 4 sinf', 'matematika 6 sinf',
                     'matematika 5 sinf', 'matematika 1 sinf', 'математика 1 класс', 'математика 2 класс',
                     'примеры для 1 класса', 'примеры для 2 класса', 'таблица умножения', 'misollar 1 sinf',
                     'misollar 2 sinf', 'примеры по математике', 'тренажер таблица умножения'],
            'head': [], 'excl': ['matematika misollar', 'karra jadvali', "ko'paytirish jadvali", 'misollar']}},
    {'id': 'olympiad', 'name': 'Olimpiada masalalari (o‘z masalalar + yechim)', 'aio': 0.655,
     'kw': {'core': ['olimpiada', 'olimpiada savollari', 'fan olimpiadasi', 'matematika olimpiada',
                     'informatika olimpiada', 'олимпиада по математике'],
            'head': [], 'excl': []}},
]
ADJACENT = [
    {'id': 'driving_theory', 'name': 'Avtotest / YHQ (вне школьной линзы)', 'aio': 0.655,
     'kw': {'core': ['avtotest', 'avto test', 'prava test', 'автотест', 'yol harakati qoidalari test', 'yhq test',
                     'пдд тест', 'pdd test'], 'head': [], 'excl': []}},
]


def jump(ser):
    if len(ser) < 12 or any(v is None for v in ser):
        return False, None
    pre = (ser[10] + ser[11]) / 2
    last3 = sum(ser[0:3]) / 3
    if pre == 0:
        return last3 > 0, 0.0
    return last3 / pre >= 5, pre


def bucketize(kws):
    """Return list of buckets (deduped) with chosen representative."""
    buckets = []
    seen = {}
    for kw in kws:
        r = DB.get(kw)
        if r is None:
            buckets.append({'keyword': kw, 'vol': None, 'ser': [], 'src': 'not measured', 'merged': []})
            continue
        key = (r['vol'], tuple(r['ser'])) if r['vol'] >= 100 and r['ser'] else None
        if key and key in seen:
            seen[key]['merged'].append(kw)
            continue
        b = {'keyword': kw, 'vol': r['vol'], 'ser': r['ser'], 'src': r['src'], 'merged': []}
        if key:
            seen[key] = b
        buckets.append(b)
    return buckets


def agg(cl):
    out = {'id': cl['id'], 'name': cl['name'], 'aio_discount_top3': cl['aio']}
    core = bucketize(cl['kw'].get('core', []))
    head = bucketize(cl['kw'].get('head', []))
    susp = bucketize(cl['kw'].get('susp', []))
    excl = bucketize(cl['kw'].get('excl', []))
    ads = sum(b['vol'] or 0 for b in core)
    floor = 0
    jumped = []
    season = [0] * 12
    for b in core:
        v = b['vol'] or 0
        j, pre = jump(b['ser']) if b['ser'] else (False, None)
        if j and v >= 500:
            floor += pre
            jumped.append((b['keyword'], v, round(pre)))
        else:
            floor += v
        if len(b['ser']) == 12 and all(x is not None for x in b['ser']):
            for i in range(12):
                season[i] += b['ser'][i]
    upper = ads + sum(b['vol'] or 0 for b in head) + sum(b['vol'] or 0 for b in susp)
    mean = sum(season) / 12 if sum(season) else 0
    idx = {MONTHS[i]: round(season[i] / mean, 2) for i in range(12)} if mean else {}

    def v6(d):
        return round(d * CTR6[0] / 30 * MULT), round(d * CTR6[1] / 30 * MULT)

    def v3(d):
        return round(d * CTR3 * cl['aio'] / 30 * MULT)

    out.update({
        'demand_ads_core': ads, 'demand_floor_core': round(floor), 'demand_upper_incl_heads': upper,
        'jump_keywords': jumped,
        'visits_pos6_ads': v6(ads), 'visits_pos6_floor': v6(floor), 'visits_pos3_ads': v3(ads),
        'visits_pos3_floor': v3(floor),
        'clicks_month_pos6_ads': (round(ads * CTR6[0]), round(ads * CTR6[1])),
        'season_index': idx,
        'buckets_core': [{'keyword': b['keyword'], 'vol': b['vol'], 'merged': b['merged'], 'src': b['src'],
                          'series_sep26_to_oct25': b['ser']} for b in sorted(core, key=lambda x: -(x['vol'] or 0))],
        'buckets_head': [{'keyword': b['keyword'], 'vol': b['vol'], 'merged': b['merged']} for b in head],
        'buckets_suspicious': [{'keyword': b['keyword'], 'vol': b['vol'], 'series_sep26_to_oct25': b['ser']} for b in susp],
        'excluded': [{'keyword': b['keyword'], 'vol': b['vol']} for b in excl],
    })
    return out


res = [agg(c) for c in CLUSTERS]
adj = [agg(c) for c in ADJACENT]
tot_ads = sum(r['demand_ads_core'] for r in res)
tot_floor = sum(r['demand_floor_core'] for r in res)
summary = {
    'total_demand_ads_core': tot_ads, 'total_demand_floor_core': tot_floor,
    'total_visits_pos6_ads': (sum(r['visits_pos6_ads'][0] for r in res), sum(r['visits_pos6_ads'][1] for r in res)),
    'total_visits_pos6_floor': (sum(r['visits_pos6_floor'][0] for r in res), sum(r['visits_pos6_floor'][1] for r in res)),
    'total_visits_pos3_ads': sum(r['visits_pos3_ads'] for r in res),
    'total_visits_pos3_floor': sum(r['visits_pos3_floor'] for r in res),
}
json.dump({'meta': {'date': '2026-10-25', 'location': 2860, 'ctr_pos6': CTR6, 'ctr_pos3': CTR3, 'mult': MULT,
                    'sources': [os.path.basename(s) for s in SRC]},
           'clusters': res, 'adjacent': adj, 'summary': summary},
          open(os.path.join(HERE, 'ep_model.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

for r in res + adj:
    print(f"== {r['id']}: ads {r['demand_ads_core']} | floor {r['demand_floor_core']} | upper {r['demand_upper_incl_heads']}"
          f" | pos6 {r['visits_pos6_ads']} (floor {r['visits_pos6_floor']}) | pos3 {r['visits_pos3_ads']} (floor {r['visits_pos3_floor']})")
    print('   jump:', r['jump_keywords'])
    print('   top:', [(b['keyword'], b['vol'], b['merged']) for b in r['buckets_core'][:12]])
    print('   head:', [(b['keyword'], b['vol']) for b in r['buckets_head']], 'susp:',
          [(b['keyword'], b['vol']) for b in r['buckets_suspicious']])
    print('   season:', r['season_index'])
    missing = [b['keyword'] for b in r['buckets_core'] if b['vol'] is None]
    if missing:
        print('   NOT MEASURED:', missing)
print(summary)
