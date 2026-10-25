# Language-learning lens: cluster sizing for gptbot.uz (2026-10-25)
# Run: py -3 -I ll_clusters.py   (from this folder)
# Inputs: ll_kw_metrics.json, ll_kw_metrics2.json (this lens, OpenSEO get_keyword_metrics, loc 2860)
#         ../../2026-10-24-growth-audit/l3-data/kw1_metrics.json, kw2_metrics.json (reused, not re-bought)
#         research rows (research_keywords 2026-10-25, no monthly series) hard-coded in RESEARCH below
import json, os, sys
sys.stdout.reconfigure(encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
L3 = os.path.join(HERE, '..', '..', '2026-10-24-growth-audit', 'l3-data')

rows = {}
def load(path, source):
    d = json.load(open(path, encoding='utf-8'))
    for k in d['keywords']:
        kw = k['keyword']
        m = sorted(k.get('monthly_searches') or [], key=lambda x: (x['year'], x['month']))
        rec = dict(kw=kw, vol=k.get('search_volume'), series=[x['search_volume'] for x in m],
                   months=['%d-%02d' % (x['year'], x['month']) for x in m], source=source)
        if kw not in rows or rows[kw]['vol'] is None:
            rows[kw] = rec

load(os.path.join(HERE, 'll_kw_metrics.json'), 'll_kw_metrics.json (2026-10-25)')
load(os.path.join(HERE, 'll_kw_metrics2.json'), 'll_kw_metrics2.json (2026-10-25)')
for f in ('kw1_metrics.json', 'kw2_metrics.json'):
    d = json.load(open(os.path.join(L3, f), encoding='utf-8'))
    for k in d['keywords']:
        kw = k['keyword']
        if kw in rows:
            continue
        m = sorted(k.get('monthly_searches') or [], key=lambda x: (x['year'], x['month']))
        rows[kw] = dict(kw=kw, vol=k.get('search_volume'), series=[x['search_volume'] for x in m],
                        months=['%d-%02d' % (x['year'], x['month']) for x in m], source='l3-data/' + f + ' (2026-10-24, reused)')

RESEARCH = {  # research_keywords 2026-10-25, Google Ads, no series
    'уровни английского': 880, 'уровни английского языка': 480, 'уровни английский язык': 480,
    'уровни англ': 390, 'грамматика английского языка': 390, 'месяц на английском': 590,
    'ingliz alfabeti': 90, '16 времен английского языка': 20, 'все уровни английского языка': 70,
    'уровни знания английского': 50, 'английский уровни': 50, 'английский алфавит с произношением': None,
}
for kw, v in RESEARCH.items():
    if kw not in rows:
        rows[kw] = dict(kw=kw, vol=v, series=[], months=[], source='research_keywords 2026-10-25 (no series)')

# CTR model (task brief / roadmap §1.1, L1-ctr.md §3.3)
CTR6 = (0.0061, 0.0110)
CTR3 = 0.0359
VISITS_PER_CLICK = 1.5
F_AIO_R1 = 8 / 15        # AI Overview at rank 1
F_AIO = 1 - 0.345        # AI Overview present, not rank 1 (or SERP not fetched)

def bucketize(kws, weights):
    """Dedupe Google Ads close-variant buckets: identical volume + identical non-monotonic series (vol>=100)
    -> one bucket. Research rows without series: identical volume + same script -> merge (>=100)."""
    buckets = []
    for kw in kws:
        r = rows.get(kw)
        if r is None:
            continue
        v = r['vol']
        w = weights.get(kw, 1.0)
        placed = False
        if v is not None and v >= 100:
            for b in buckets:
                if b['vol'] == v and (
                    (r['series'] and b['series'] and r['series'] == b['series'] and len(set(r['series'])) > 1) or
                    (not r['series'] and v == b['vol'] and b.get('script') == ('cyr' if any('а' <= c <= 'я' for c in kw) else 'lat') and b.get('noseries'))
                ):
                    b['kws'].append(kw)
                    placed = True
                    break
        if not placed:
            buckets.append(dict(kws=[kw], vol=v, series=r['series'], months=r['months'], w=w, source=r['source'],
                                script=('cyr' if any('а' <= c <= 'я' for c in kw) else 'lat'), noseries=not r['series']))
    return buckets

def season(buckets):
    tot = None
    months = None
    for b in buckets:
        if b['vol'] is None or not b['series'] or len(b['series']) != 12:
            continue
        s = [x * b['w'] for x in b['series']]
        if tot is None:
            tot = s
            months = b['months']
        else:
            tot = [a + c for a, c in zip(tot, s)]
    if not tot:
        return None
    avg = sum(tot) / 12
    hi = max(range(12), key=lambda i: tot[i]); lo = min(range(12), key=lambda i: tot[i])
    return dict(peak=months[hi], peak_index=round(tot[hi] / avg, 2), low=months[lo], low_index=round(tot[lo] / avg, 2),
                last_month=months[-1], last_index=round(tot[-1] / avg, 2), series_sum=[round(x) for x in tot], months=months)

C = []
def cl(**k):
    C.append(k)

cl(id='irregular_verbs', name='Noto‘g‘ri fe’llar / irregular verbs / неправильные глаголы',
   aio=F_AIO_R1, aio_note='AIO r1 в обеих снятых выдачах',
   kws=["irregular verbs", "irregular verbs list", "list of irregular verbs", "noto'g'ri fe'llar jadvali", "неправильные глаголы",
        "noto'g'ri fe'llar", "notogri fellar", "past participle", "regular verbs", "regular and irregular verbs",
        "таблица неправильных глаголов", "irregular verbs table", "ingliz tili noto'g'ri fe'llar", "3 forms of verbs", "v1 v2 v3",
        "irregular verbs test", "verb forms", "неправильные глаголы английского языка", "неправильные глаголы английского языка таблица",
        "3 формы глагола", "формы глаголов английского", "irregular verbs ingliz tili", "fe'lning 3 shakli", "notog'ri fe'llar"])

cl(id='english_tenses', name='Ingliz tili zamonlari: Present/Past/Future + mashqlar',
   aio=F_AIO_R1, aio_note='AIO r1 (present simple)',
   kws=["present simple", "past simple", "present continuous", "present perfect", "past continuous", "present perfect continuous",
        "past perfect", "future simple", "future continuous", "future perfect", "past perfect continuous", "future perfect continuous",
        "present simple tense", "past simple tense", "present perfect tense", "simple past", "present simple exercises",
        "past simple exercises", "present continuous exercises", "present perfect exercises", "tenses", "english tenses",
        "tenses table", "12 tenses", "tenses exercises", "past simple vs present perfect", "present simple vs present continuous",
        "future in the past", "времена английского языка", "таблица времен английского языка", "времена в английском",
        "present simple правило", "present simple упражнения", "present perfect правило", "past simple упражнения",
        "present simple qoidasi", "present simple mashqlar", "ingliz tili zamonlari", "ingliz tilida zamonlar", "zamonlar ingliz tilida",
        "16 zamon", "16 времен английского языка", "used to", "going to", "was were"])

cl(id='english_grammar_topics', name='Ingliz tili grammatikasi: conditionals, passive, reported speech, pronouns, prepositions…',
   aio=F_AIO_R1, aio_note='AIO r1 (pronouns)',
   weights={'grammar': 0.5, 'pronouns': 0.5, 'adjectives': 0.5, 'adverbs': 0.5, 'to be': 0.5, 'prepositions': 0.5},
   kws=["passive voice", "conditionals", "reported speech", "indirect speech", "modal verbs", "there is there are",
        "comparative and superlative", "second conditional", "first conditional", "third conditional", "zero conditional",
        "mixed conditionals", "some any", "much many", "gerund and infinitive", "gerund", "infinitive", "question tags", "tag questions",
        "comparative adjectives", "prepositions", "prepositions of place", "prepositions of time", "pronouns", "possessive pronouns",
        "adjectives", "adverbs", "countable and uncountable nouns", "plural nouns", "relative clauses", "to be", "verb to be",
        "quantifiers", "active and passive voice", "direct and indirect speech", "causative", "have got", "parts of speech",
        "word formation", "suffixes", "a an the", "i wish", "degrees of comparison", "phrasal verbs", "phrasal verbs list",
        "ingliz tili grammatikasi", "ingliz tili grammatika", "grammar", "english grammar", "grammar exercises", "english exercises",
        "артикли в английском", "предлоги в английском", "фразовые глаголы", "модальные глаголы", "passive voice упражнения",
        "упражнения по английскому", "степени сравнения прилагательных в английском", "to be fe'li", "ingliz tili qoidalari",
        "грамматика английского языка", "ingliz tili mashqlar", "ingliz tili grammatika mashqlar"],
   excluded={'articles': 'неоднозначно (4 400, CPC 6.62 — «статьи» вообще), не считаю'})

cl(id='ielts_cefr_calculator', name='IELTS / CEFR (Multilevel) ball kalkulyatori',
   aio=F_AIO, aio_note='AIO r5 (ielts calculator), r4 (cefr ballari)',
   weights={'ielts score': 0.5},
   kws=["ielts calculator", "ielts score", "ielts score calculator", "ielts band score", "ielts listening band score",
        "ielts reading band score", "ielts band score calculator", "ielts listening score calculator", "ielts reading score calculator",
        "ielts overall score calculator", "ielts listening band score calculator", "ielts reading band score calculator",
        "cefr ballari", "cefr calculator", "multilevel score calculator", "multilevel ballari", "cefr ball hisoblash",
        "multilevel ball hisoblash", "multilevel calculator", "ielts ball hisoblash"])

cl(id='multilevel_cefr_practice', name='Multilevel / CEFR: mock-test (speaking, writing, reading) + gid',
   aio=F_AIO, aio_note='AIO r2 (multilevel mock test)',
   weights={'cefr': 0.5, 'multilevel': 0.5, 'multilevel listening': 0.0, 'cefr listening': 0.0},
   kws=["multilevel mock test", "multilevel speaking", "multilevel listening", "multilevel reading", "cefr mock test", "cefr test",
        "cefr speaking", "multilevel writing", "multilevel speaking questions", "multilevel mock", "cefr writing", "multilevel test",
        "multi level", "multilevel speaking part 1", "cefr reading", "multilevel writing task 1", "multilevel speaking part 2",
        "cefr mock", "cefr listening", "multilevel writing task 2", "multilevel speaking part 3", "multilevel test online",
        "multilevel speaking topics", "cefr", "multilevel", "cefr sertifikat", "cefr b2", "cefr c1", "cefr nima", "cefr darajalari",
        "cefr b1", "cefr ingliz tili", "multilevel nima", "multilevel imtihon", "cefr narxi", "multilevel narxi",
        "multilevel ingliz tili", "cefr essay", "multilevel essay", "multilevel letter"],
   excluded={'milliy sertifikat': '18 100 — навигационный (результаты/регистрация uzbmb), не считаю',
             'multilevel listening / cefr listening': 'вес 0: нужен аудиоконтент, продукт его не делает'})

cl(id='ielts_writing_speaking', name='IELTS Writing / Speaking: AI-tekshiruv va mavzular',
   aio=F_AIO, aio_note='AIO r2 (ielts writing task 1)',
   weights={'grammar checker': 0.5, 'essay': 0.5, 'essay writing': 0.5},
   kws=["ielts writing task 1", "ielts speaking questions", "ielts speaking", "ielts writing task 2", "ielts speaking topics",
        "ielts writing", "ielts writing checker", "ielts speaking part 1", "ielts writing task 1 samples", "ielts writing task 2 topics",
        "ielts speaking part 2", "ielts speaking practice", "ielts writing task 2 samples", "ielts essay topics", "ielts essay checker",
        "ielts speaking test", "ielts writing samples", "ielts speaking band descriptors", "ielts essay", "ielts speaking part 3",
        "ielts essay samples", "ielts writing band descriptors", "ielts band descriptors", "ielts speaking cue cards", "ielts cue card",
        "ielts writing task 1 vocabulary", "linking words", "opinion essay", "informal letter", "formal letter", "speaking topics",
        "grammar checker", "grammar check", "проверка грамматики английского", "эссе на английском", "письмо на английском",
        "essay", "essay writing", "english speaking practice", "english conversation", "ielts vocabulary", "ielts vocabulary list",
        "ielts words"],
   excluded={'ielts': '27 100 — общий/навигационный (регистрация, IDP/BC)',
             'ielts listening/reading/mock/practice test': '≈13 300 — нужны аудио и лицензированные тексты; SERP у ielts.org/IDP'})

cl(id='english_level_test', name='Ingliz tili darajasini aniqlash testi (placement / level test)',
   aio=F_AIO, aio_note='SERP не снят (кредиты); приор AIO',
   kws=["ingliz tili test", "english test", "english level test", "уровни английского", "уровни английского языка",
        "уровни английский язык", "уровни англ", "english grammar test", "тест на уровень английского", "level test",
        "placement test", "тест по английскому", "английский тест", "ingliz tili test online", "ingliz tili testlari",
        "тест по английскому языку", "тест на знание английского", "определить уровень английского", "тест уровня английского",
        "ingliz tili darajasini aniqlash", "ingliz tili level test", "все уровни английского языка", "уровни знания английского",
        "английский уровни", "ingliz tili test savollari"])

cl(id='alphabets', name='Alifbolar: ingliz, rus, arab, koreys, yapon (+transkripsiya, kartochkalar)',
   aio=F_AIO_R1, aio_note='AIO r1 (английский алфавит), r2 (arab alifbosi)',
   kws=["english alphabet", "английский алфавит", "алфавит английский", "ingliz alifbosi", "inglizcha alifbo", "английские буквы",
        "inglizcha harflar", "английский алфавит с транскрипцией", "ingliz alfabeti", "ingliz harflari",
        "русский алфавит", "rus alifbosi", "rus tili alifbosi", "ruscha harflar",
        "arab alifbosi", "арабский алфавит", "arab tili alifbosi", "arab harflari", "arab yozuvi", "арабские буквы", "arabcha harflar",
        "корейский алфавит", "koreys tili alifbosi", "korean alphabet", "koreys alifbosi", "hangul", "koreys harflari", "хангыль",
        "koreys tili harflari", "yapon alifbosi", "hiragana", "katakana", "хирагана", "kanji", "turk tili alifbosi", "немецкий алфавит"],
   excluded={'alphabet': '3 600 — неоднозначно (детские песни/Alphabet Inc.), не считаю'})

cl(id='topic_vocabulary', name='Mavzuli so‘zlar: «X ingliz tilida» / «X на английском» + kartochkalar',
   aio=F_AIO_R1, aio_note='AIO r1 (дни недели на английском)',
   weights={'hafta kunlari': 0.5, 'vocabulary': 0.5, 'synonyms': 0.5, 'my family': 0.5, 'about myself': 0.5, 'my hobby': 0.5},
   kws=["дни недели на английском", "hafta kunlari", "mevalar ingliz tilida", "привет на английском", "месяцы на английском",
        "месяц на английском", "ranglar ingliz tilida", "цифры на английском", "kasblar ingliz tilida", "oylar ingliz tilida",
        "sonlar ingliz tilida", "ingliz tilida ranglar", "фрукты на английском", "спасибо на английском", "tana a'zolari ingliz tilida",
        "цвета на английском", "одежда на английском", "fasllar ingliz tilida", "ingliz tilida sonlar", "inglizcha salomlashish",
        "животные на английском", "овощи на английском", "время на английском", "части тела на английском", "профессии на английском",
        "как дела на английском", "числа на английском", "oylar nomi", "ingliz tilida oylar", "семья на английском",
        "погода на английском", "с днем рождения на английском", "еда на английском", "ranglar inglizcha", "hafta kunlari inglizcha",
        "ingliz tilida mevalar", "доброе утро на английском", "ovqatlar ingliz tilida", "hayvonlar inglizcha", "mevalar inglizcha",
        "xona jihozlari ingliz tilida", "ingliz tilida salomlashish", "inglizcha so'zlar", "английские слова", "слова на английском",
        "inglizcha so'zlar tarjimasi", "english words", "english vocabulary", "vocabulary", "английские слова с переводом",
        "inglizcha sozlar", "английские слова для начинающих", "synonyms", "antonyms", "collocations", "idioms", "english idioms",
        "flashcards", "about myself", "my family", "my hobby", "рассказ о себе на английском", "о себе на английском",
        "порядковые числительные английский"])

cl(id='uzbek_for_russian_speakers', name='Узбекский для русскоязычных: алфавит (реформа 2026), разговорник, «как будет на узбекском»',
   aio=F_AIO, aio_note='AIO в топ-10 нет (картинки, видео, PAA); дисконт оставлен консервативно',
   weights={'как будет на узбекском': 0.5, 'по узбекски': 0.5, 'как по узбекски': 0.5, 'как будет по узбекски': 0.5, 'на узбекском языке': 0.5},
   kws=["узбекский алфавит", "как будет на узбекском", "узбекский язык", "дни недели на узбекском", "uzbek language", "по узбекски",
        "uzbek alphabet", "как по узбекски", "на узбекском языке", "как будет по узбекски", "узбекский алфавит кириллица",
        "спасибо на узбекском", "цифры на узбекском", "спасибо по узбекски", "узбекские слова", "узбекский язык для начинающих",
        "русско узбекский разговорник", "узбекский алфавит латиница", "learn uzbek", "с днем рождения на узбекском",
        "привет на узбекском", "слова на узбекском", "мама на узбекском", "числа на узбекском", "учить узбекский язык",
        "уроки узбекского языка", "как дела на узбекском", "месяцы на узбекском", "приветствие на узбекском", "uzbek words",
        "словарь узбекского языка", "фразы на узбекском"],
   excluded={'русско узбекский словарь / узбекско русский словарь': '3 600 / 1 000 — владеет ветка переводчика RU↔UZ'})

cl(id='second_languages_starter', name='Turk, yapon, xitoy, arab, nemis tillari: boshlang‘ich so‘zlar + AI til o‘qituvchisi',
   aio=F_AIO, aio_note='AIO r2 (turkcha so‘zlar), r10 (yapon tilini o‘rganish)',
   kws=["turkcha so'zlar", "yapon tilini o'rganish", "xitoy tili", "arabcha so'zlar", "turk tili", "arab tili", "nemis tili", "hsk",
        "turk tilini o'rganish", "turkcha", "arabcha", "yapon tili", "arab tilini o'rganish", "hsk 1", "nemis tilini o'rganish",
        "fransuz tili", "arab tili grammatikasi", "ispan tili", "xitoycha", "yaponcha", "turkcha so'zlar tarjimasi", "hsk 2", "hsk 3",
        "pinyin", "jlpt", "nemischa", "немецкий язык", "китайский язык", "японский язык", "турецкий язык", "арабский язык",
        "turk tili darslari", "arab tili darslari", "der die das", "немецкие слова", "турецкие слова", "nemis tili 0 dan", "goethe a1",
        "nemis tili test", "turk tili test", "turk tili 0 dan", "turkcha gaplar", "arabcha so'zlar tarjimasi", "italyan tili",
        "hsk test", "jlpt n5"],
   excluded={'turkcha/koreyscha/arabcha/nemischa o‘zbekcha lug‘at': 'словари — ветка переводчика'})

cl(id='topik_korean', name='TOPIK / EPS-TOPIK: amaliy testlar + koreys tili asoslari',
   aio=F_AIO, aio_note='AIO r3 (topik test)',
   weights={'topik': 0.5, 'eps topik': 0.5},
   kws=["topik test", "eps topik test", "topik test online", "topik 1", "topik 2", "eps topik 2026", "topik", "eps topik",
        "koreys tili", "koreys tilini o'rganish", "koreys tili kurslari", "корейский язык", "корейские слова", "korean words",
        "koreyscha", "koreys tili so'zlar", "koreyscha so'zlar", "koreys tili test", "topik imtihon", "koreys tili 0 dan",
        "учить корейский", "корейский язык для начинающих", "koreys tili darslari"])

cl(id='russian_for_uzbeks', name='Rus tili o‘zbeklar uchun: kelishiklar, sonlar, so‘zlar + AI o‘qituvchi',
   aio=F_AIO, aio_note='AIO r3 (rus tilini o‘rganish)',
   weights={'ruscha': 0.5, 'rus tili lug\'at': 0.5},
   kws=["rus tili", "rus tilini o'rganish", "ruscha", "падежи русского языка", "rus tili lug'at", "ruscha sonlar", "rus tili grammatika",
        "rus tili test", "ruscha raqamlar", "rus tilida kelishiklar", "ruscha so'zlar", "ruscha sozlar", "rus tili darslari",
        "ruscha gaplar", "rus tilida gaplar", "rus tili 0 dan", "rus tili sonlar", "rus tilini noldan o'rganish", "rus tilida so'zlar",
        "rus tilida salomlashish", "rus tili mashqlar", "rus tili kelishiklar", "rus tili qoidalari"],
   excluded={'rus tili 5/7 sinf': 'школьные учебники/ответы — не наш интент'})

out = []
for c in C:
    w = c.get('weights', {})
    bs = bucketize(c['kws'], w)
    demand = sum((b['vol'] or 0) * b['w'] for b in bs)
    raw = sum((b['vol'] or 0) for b in bs)
    nulls = [kw for kw in c['kws'] if kw in rows and rows[kw]['vol'] is None]
    missing = [kw for kw in c['kws'] if kw not in rows]
    top = sorted([b for b in bs if b['vol']], key=lambda b: -(b['vol'] * b['w']))
    s = season(bs)
    p6 = [demand * x / 30 * VISITS_PER_CLICK for x in CTR6]
    p3 = demand * CTR3 * c['aio'] / 30 * VISITS_PER_CLICK
    out.append(dict(id=c['id'], name=c['name'], demand_month=round(demand), demand_raw_dedup=raw,
                    buckets=[dict(keywords=b['kws'], volume=b['vol'], weight=b['w'], source=b['source']) for b in top],
                    null_keywords=nulls, not_measured=missing, excluded=c.get('excluded', {}),
                    aio_factor=round(c['aio'], 3), aio_note=c['aio_note'], seasonality=s,
                    visits_day_pos6=[round(p6[0], 1), round(p6[1], 1)], visits_day_pos3=round(p3, 1)))

json.dump(dict(model=dict(ctr_pos6=CTR6, ctr_pos3=CTR3, f_aio_r1=round(F_AIO_R1, 3), f_aio=round(F_AIO, 3),
                          visits_per_click=VISITS_PER_CLICK,
                          formula='visits/day = demand × CTR / 30 × 1.5; top-3 × AIO factor; pos-6 = site curve without extra discount'),
               clusters=out), open(os.path.join(HERE, 'll_clusters_out.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

tot6 = [0, 0]; tot3 = 0; totd = 0
for o in out:
    totd += o['demand_month']; tot6[0] += o['visits_day_pos6'][0]; tot6[1] += o['visits_day_pos6'][1]; tot3 += o['visits_day_pos3']
    s = o['seasonality'] or {}
    print(f"{o['id']:28s} D={o['demand_month']:>7} raw={o['demand_raw_dedup']:>7} pos6={o['visits_day_pos6']} pos3={o['visits_day_pos3']} "
          f"peak={s.get('peak')}({s.get('peak_index')}) low={s.get('low')}({s.get('low_index')}) last={s.get('last_index')}")
    print('    top:', '; '.join(f"{'/'.join(b['keywords'])} {b['volume']}{'×'+str(b['weight']) if b['weight']!=1 else ''}" for b in o['buckets'][:8]))
    if o['not_measured']:
        print('    NOT MEASURED:', o['not_measured'])
print('TOTAL D', totd, 'pos6', [round(x) for x in tot6], 'pos3', round(tot3))
