# -*- coding: utf-8 -*-
"""Demand sizing for gptbot.uz, 2026-10-25.

Reads only files already on disk (plus kw3/kw4 pulled 2026-10-25 into ./):
  ../../2026-10-24-growth-audit/l3-data/kw1_metrics.json, kw2_metrics.json   (Google Ads via OpenSEO, loc 2860, 2026-10-24)
  ../../2026-10-24-snippets-translator/translator-market.json                  (2026-10-24)
  ../../../../../content/seo/demand-policy.json                                (only for keywords absent from every other source)
  ./kw3_metrics.json, ./kw4_metrics.json                                        (2026-10-25, this task)
  ../../2026-10-24-growth-audit/raw/gsc_page_query_28d_p0/p1.json              (GSC all countries, 2026-09-24..10-21)
  ../../2026-10-24-growth-audit/raw/gsc_page_query_28d_uzb_p0.json + _p1.tsv  (GSC Uzbekistan)
  ../../2026-10-24-growth-audit/raw/l1_ctr_compute.json                        (site CTR curves)
Writes ../demand-sizing.json and ./tables.md. Run: py -3 -I demand_sizing.py (from this folder).
"""
import json, re, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.normpath(os.path.join(HERE, '..', '..'))            # docs/seo/research
REPO = os.path.normpath(os.path.join(R, '..', '..', '..'))
GA = os.path.join(R, '2026-10-24-growth-audit')
TR = os.path.join(R, '2026-10-24-snippets-translator')

def jl(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)

# ---------------------------------------------------------------- volumes
SRC = {}   # keyword -> dict(volume, series(tuple|None), source, script)

def put(kw, vol, series, source, script=None):
    if kw in SRC:
        return
    SRC[kw] = dict(volume=vol, series=tuple(series) if series else None, source=source, script=script)

for tag, p in [('kw1 (L3, 2026-10-24)', os.path.join(GA, 'l3-data', 'kw1_metrics.json')),
               ('kw2 (L3, 2026-10-24)', os.path.join(GA, 'l3-data', 'kw2_metrics.json'))]:
    for k in jl(p)['keywords']:
        ms = k.get('monthly_searches') or []
        put(k['keyword'], k['search_volume'], [m['search_volume'] for m in ms] if ms else None, tag)
trj = jl(os.path.join(TR, 'translator-market.json'))
for k in trj['keywords']:
    put(k['keyword'], k.get('volume'), None, 'translator-market (2026-10-24)', k.get('script'))
for k in trj['adjacent_demand_out_of_scope']:
    put(k['keyword'], k.get('volume'), None, 'translator-market adjacent (2026-10-24)')
for tag, p in [('kw3 (2026-10-25)', os.path.join(HERE, 'kw3_metrics.json')),
               ('kw4 (2026-10-25)', os.path.join(HERE, 'kw4_metrics.json'))]:
    for k in jl(p)['keywords']:
        ms = k.get('monthly_searches') or k.get('monthly') or []
        if ms and isinstance(ms[0], dict):
            ms = [m['search_volume'] for m in ms]
        put(k['keyword'], k.get('search_volume'), ms or None, tag)
dp = jl(os.path.join(REPO, 'content', 'seo', 'demand-policy.json'))
for k in dp['approvedKeywords']:
    put(k['keyword'], k.get('volumePerMonth'), None, 'demand-policy.json (%s)' % k.get('measuredAt'))

def script_of(kw):
    s = SRC.get(kw, {}).get('script')
    if s:
        return s
    return 'cyrl' if re.search('[а-яёўқғҳ]', kw) else 'latn'

# ---------------------------------------------------------------- CTR (site's own curve, L1-ctr.md §3.3)
cc = jl(os.path.join(GA, 'raw', 'l1_ctr_compute.json'))
qn = cc['curve_query_uzb_nochat']; qa = cc['curve_query_uzb_all']
def cell(c, p):
    return c[str(p)]['clicks'], c[str(p)]['impressions']
c3 = cell(qn, 3); c5 = cell(qn, 5); c6 = cell(qn, 6); c7 = cell(qn, 7); a6 = cell(qa, 6)
CTR = {
    'top3': c3[0] / c3[1],                                     # pos 3, no chats: 324/9018
    'top10_info_low': (c5[0] + c6[0] + c7[0]) / (c5[1] + c6[1] + c7[1]),   # pooled pos 5-7, no chats
    'top10_info_high': c6[0] / c6[1],                          # pos 6 cell, no chats (thin: 1 448 impr.)
    'top10_chat_low': a6[0] / a6[1],                           # pos 6, all pages (chats): 103/23076
}
CTR['top10_chat_high'] = CTR['top10_info_high']
CTR_SRC = {
    'top3': 'L1-ctr.md §3.3, UZ by query, no chats, pos 3: %d/%d' % c3,
    'top10_info_low': 'L1-ctr.md §3.3, pooled pos 5-7, no chats: %d/%d' % (c5[0] + c6[0] + c7[0], c5[1] + c6[1] + c7[1]),
    'top10_info_high': 'L1-ctr.md §3.3, pos 6, no chats: %d/%d (thin cell)' % c6,
    'top10_chat_low': 'L1-ctr.md §3.3, pos 6, all pages incl. chats: %d/%d' % a6,
}
# SERP-feature discount for the top-3 scenario only
F_AIO_R1 = 8 / 15     # Pew Research Center, 2025-07-22: click on a result in 8% of visits with an AI summary vs 15% without
F_AIO = 1 - 0.345     # Ahrefs, 2025-04: AI Overview present -> top-result CTR -34.5%

M = 30.44 / 28        # 28-day window -> average month

# ---------------------------------------------------------------- clusters
# serp: (type, aio, discount, source)
C = []
def cl(**k):
    C.append(k)

cl(id='nav_chatgpt_brand', name='Навигация к ChatGPT (вход, бренд, искажения)', include=False,
   why_excluded='навигационный бренд: человек ищет chatgpt.com/вход в свой аккаунт; честно не выигрывается (SERP: 10/10 органики — chatgpt.com/openai, snippet-data.json c3897348)',
   status='живые чаты получают эти показы сейчас', owners=['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/'],
   serp=('навигационный (chatgpt.com ×10)', 'есть', None, 'snippet-data.json c3897348'),
   kws=['chatgpt', 'chat gpt', 'чат гпт', 'чатгпт', 'chatgpt kirish', 'чачи пити'], ctr='chat')
cl(id='ai_chat_brand_modifier', name='AI-чат: «ChatGPT» + язык / бесплатно / онлайн (мы — честная альтернатива)', include=True,
   status='живой: два чата + /ru/gpt-na-russkom/', owners=['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/', '/ru/gpt-na-russkom/'],
   serp=('бренд + «аналоги»: chatgpt.com ×6–8, chatgpt.uz #1, textie, mitup #1 (RU)', 'r7–r8', F_AIO, 'serp_l6.json 59a6e29e, serp_l6_hlru.json 8a84033f, snippet-data.json c3897348'),
   kws=['chatgpt uzbekcha', 'chatgpt uzbek tilida', 'chatgpt 4 uzbek tilida', 'chatgpt bepul', 'chatgpt uz', 'chat gpt на русском',
        'чат гпт на русском', 'чат гпт онлайн', 'чат гпт онлайн бесплатно', "chatgpt o'zbekcha", 'чат гпт узбекча', 'chatgpt 5 uzbek tilida',
        'chatgpt tarjimon', 'chatgpt переводчик'], ctr='chat')
cl(id='ai_chat_generic', name='AI-чат без бренда (ИИ онлайн, нейросеть, ai chat)', include=True,
   status='живой: чаты + /uz/blog/ai-chat-nima-…/', owners=['/ru/gpt-chat/', '/uz/blog/ai-chat-nima-va-qanday-turlari-bor/'],
   serp=('не снят', 'приор', F_AIO, 'AIO в 45 из 45 снятых 24.10 выдач рынка (см. §2)'),
   kws=['ии онлайн', 'ии чат', 'нейросеть', 'нейросети', 'ai chat', 'искусственный интеллект онлайн', 'ии бесплатно', 'нейросеть онлайн',
        'нейросеть онлайн бесплатно', 'нейросеть бесплатно', 'искусственный интеллект чат', 'искусственный интеллект бесплатно',
        'ai uzbek tilida', 'ai uzbek', 'нейросеть чат', 'нейросеть на русском', 'нейросеть отвечающая на вопросы', 'ai yordamchi',
        'suniy intellekt bilan gaplashish', 'нейросеть чат gpt'], ctr='info')
cl(id='chatgpt_howto', name='ChatGPT how-to: скачать, открыть, оплатить, что это', include=True,
   status='живой: гайд по скачиванию (лидер), гайд по входу, оплата, sravnenie', owners=['/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/', '/uz/blog/chatgptga-qanday-kirish-mumkin/', '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/', '/ru/gpt-vs-chatgpt-sravnenie/'],
   serp=('смешанный: app-pack #1, chatgpt.com, статья skillbox #3, APK-клоны', 'r4', F_AIO, 'serp_l6.json 59a6e29e, serp_l6_hlru.json 8a84033f'),
   kws=['chatgpt yuklab olish uzbek tilida', 'chatgpt yuklab olish', 'chatgpt ochish', 'chatgpt yuklash', 'chatgpt plus', 'chatgpt nima',
        'как оплатить chatgpt'], ctr='info')
cl(id='translator_ru_uz', name='Переводчик RU↔UZ (парные запросы, без «tarjimon»)', include=True,
   status='бета с 2026-10-24, общий пробный лимит 3 ответа', owners=['/ru/russko-uzbekskiy-perevodchik/', '/uz/rus-ozbek-tarjimon/'],
   serp=('инструменты: Google Translate в топ-10 5/5, tilmoch.ai, sahifa.tj, aibro.io #5', 'r1 в 3 из 5', F_AIO_R1, 'translator-market.md §2'),
   kws=['перевод с русского на узбекский', 'переводчик с русского на узбекский', 'перевод с узбекского на русский', 'переводчик с узбекского на русский',
        'узбекско русский переводчик', 'перевод рус узбек', 'узбек рус перевод', 'русско узбекский переводчик', 'перевод узбек рус',
        'перевод узбекский на русский', 'рус узбек перевод', 'перевод на узбекский', 'переводчик на узбекском', 'узбекский переводчик',
        'перевод на узбекский язык', 'узбекский перевод', 'узбекский язык переводчик', 'переводчик узбекский', 'переводчик с русского на узбекский латиница',
        'перевод текста с узбекского на русский', 'перевод текста с русского на узбекский', 'перевод документов с узбекского на русский', 'ai переводчик',
        'бесплатный переводчик с узбекского на русский', 'точный переводчик с русского на узбекский', 'нейросеть переводчик',
        'бесплатный переводчик с русского на узбекский', 'переводчик онлайн узбекский', 'переводчик с русского на узбекский онлайн',
        'переводчик с русского на узбекский на кириллице', 'ruskiy uzbek perevod',
        'rus uzbek tarjimon', 'uzbek rus tarjimon', 'rus ozbek tarjimon', 'tarjimon rus uzbek', 'tarjimon ruscha', "ruschadan o'zbekchaga tarjima",
        'uzbekcha ruscha tarjimon', 'ozbekchaga tarjima', 'ai tarjimon', "o'zbekchadan ruschaga tarjima", 'o zbekchaga tarjima', 'ruschaga tarjima',
        'ruscha ozbekcha tarjimon', 'ai tarjima', "sun'iy intellekt tarjimon",
        'русча узбекча таржима', 'узбекча русча таржима', 'русча узбекча таржимон', 'узбекча русча таржимон', 'рус узбек таржимон', 'русча таржима'],
   upside_kws=['russian uzbek translator', 'russian to uzbek', 'uzbek to russian'], ctr='info',
   groups=[('перевод с русского на узбекский', 'переводчик с русского на узбекский'), ('rus uzbek tarjimon', 'uzbek rus tarjimon')])
cl(id='converter_cyr_lat', name='Конвертер кириллица↔латиница (бесплатный, без модели)', include=True,
   status='вкладка на страницах переводчика с 2026-10-24, отдельной страницы нет', owners=['/uz/rus-ozbek-tarjimon/', '/ru/russko-uzbekskiy-perevodchik/'],
   serp=('не снят', 'приор', F_AIO, 'AIO в 45 из 45 снятых 24.10 выдач рынка'),
   kws=['лотин кирилл', 'кирилл лотин', 'kirill lotin', 'kirildan lotinga', 'kirill lotin tarjimon', 'кириллица латиница', 'lotin kirill tarjima'], ctr='info')
cl(id='translator_en_uz', name='Переводчик EN↔UZ (W3-06, ещё не построен)', include=True,
   status='не построен; роль translator_en, декабрь (NEXT_RELEASES.md)', owners=['(нет) /uz/ingliz-ozbek-tarjimon/, /ru/perevodchik-s-angliyskogo-na-uzbekskiy/'],
   serp=('инструменты: Google Translate #1–2, Yandex, приложения; verbly.uz #5/#7', 'r1–r2', F_AIO_R1, 'serp1.json 48e0cfbe, serp2.json 7aa3bce8, serp3_table.txt'),
   kws=['английский узбекский переводчик', 'ingliz uzbek tarjimon', 'inglizcha tarjima', 'переводчик с английского на узбекский', 'ingliz tarjima',
        'переводчик с узбекского на английский', 'inglizcha tarjimon', 'ozbekcha inglizcha tarjimon', 'инглизча узбекча переводчик'],
   upside_kws=['english to uzbek', 'uzbek english translator', 'english uzbek translator'], ctr='info',
   groups=[('english to uzbek', 'english uzbek', 'uzbek to english')])
cl(id='translator_other_pairs', name='Другие пары TR/KO/AR↔UZ (W3-10, после EN)', include=True,
   status='не построен', owners=['(нет)'], serp=('не снят', 'приор', F_AIO, 'AIO в 45 из 45 снятых 24.10 выдач рынка'),
   kws=['turkcha ozbekcha tarjima', 'туркча узбекча таржима', "turkcha o'zbekcha tarjimon", "koreyscha o'zbekcha tarjima", 'arabcha tarjima',
        'turk tarjimon', 'koreyscha tarjimon', 'arab tarjimon'], ctr='info')
cl(id='ai_basics', name='Sun’iy intellekt / что такое ИИ / prompt nima', include=True,
   status='страница переработана 2026-10-24 (W1-02)', owners=['/uz/suniy-intellekt/', '/uz/gpt-uzbek-tilida-ai-chat/'],
   serp=('раздробленный: AIO, salom-ai.uz (продукт) #1, Wikipedia, видео, новости', 'r1', F_AIO_R1, 'serp2.json 7aa3bce8, serp_l6.json 59a6e29e'),
   kws=['suniy intellekt', "sun'iy intellekt", 'сунъий интеллект', 'suniy intellekt nima', 'сунъий интеллект нима', "sun'iy intellekt nima",
        'suniy intellekt turlari', 'суний интеллект', 'ai nima', 'suniy intellekt haqida malumot', 'prompt nima', 'suniy intellekt haqida'], ctr='info',
   groups=[('suniy intellekt', "sun'iy intellekt"), ('suniy intellekt nima', "sun'iy intellekt nima")],
   soft_groups=True,
   group_note='«suniy» и «sun’iy» — разные ряды, но Google Ads, похоже, перекладывает спрос между написаниями (L3 §2): в нижней оценке считаю одной корзиной')
cl(id='school_referat', name='Referat / mustaqil ish', include=True,
   status='живой гайд с 2026-10-05', owners=['/uz/blog/referat-va-mustaqil-ish/'],
   serp=('не снят (вероятно образцы/PDF/статьи)', 'приор', F_AIO, 'AIO в 45 из 45 снятых 24.10 выдач рынка'),
   kws=['referat', 'referat namuna', 'mustaqil ish', 'mustaqil ish namuna', 'реферат', 'referat yozish', 'referat yozish namuna', 'referat yozish tartibi',
        'referat tayyorlash', 'referat qanday yoziladi', 'referat ai', 'реферат ии', 'реферат онлайн', 'referat mavzulari', 'реферат намуна',
        'написать реферат', 'написать реферат онлайн', 'referat namunalari', 'referat yozish online', 'нейросеть для реферата', 'написать реферат нейросеть'], ctr='info')
cl(id='school_insho_esse', name='Insho / esse', include=True,
   status='живой гайд с 2026-09-01', owners=['/uz/blog/insho-yozish-suniy-intellekt-bilan/'],
   serp=('не снят (вероятно образцы/статьи)', 'приор', F_AIO, 'AIO в 45 из 45 снятых 24.10 выдач рынка'),
   kws=['esse', 'esse yozish tartibi', 'esse yozish', 'esse namunalari', 'insho', 'insho yozish', 'esse namunasi', 'insho namuna', 'insho namunalari',
        'esse namuna', 'insho mavzulari', 'suniy intellekt haqida esse', 'нейросеть для эссе'], ctr='info')
cl(id='school_kurs_ishi', name='Kurs ishi', include=True, status='живой гайд с 2026-10-07', owners=['/uz/blog/kurs-ishi-yozish/'],
   serp=('не снят', 'приор', F_AIO, 'AIO в 45 из 45 снятых 24.10 выдач рынка'),
   kws=['kurs ishi', 'kurs ishi namuna', 'kurs ishi tayyorlash', 'kurs ishi yozish', 'kurs ishi namunalari', 'нейросеть для курсовой'], ctr='info')
cl(id='school_slayd', name='Slayd / prezentatsiya / taqdimot (Studio .pptx)', include=True,
   status='живой инструмент (Studio) + гайд slayd-tayyorlash — «Crawled, not indexed»', owners=['/uz/taqdimot-ai/', '/ru/prezentatsiya-ai/', '/uz/blog/slayd-tayyorlash/'],
   serp=('не снят; бренд-инструмент gamma ai 60 500 показывает инструментальный спрос', 'приор', F_AIO, 'AIO в 45 из 45 снятых 24.10 выдач рынка'),
   kws=['slayd tayyorlash', 'prezentatsiya tayyorlash', 'taqdimot tayyorlash', 'prezentatsiya', 'taqdimot', 'prezentatsiya ai', 'slayd ai', 'slayd yaratish',
        'ии для презентаций', 'презентация онлайн', 'презентация ии', 'ai presentation', 'сделать презентацию', 'презентация онлайн бесплатно',
        'создать презентацию онлайн', 'сделать презентацию онлайн', 'taqdimot yaratish', 'slayd yasash', 'taqdimot namunalari', 'нейросеть для презентаций',
        'презентация нейросеть', 'slayd qilish', 'сделать презентацию ии', 'slayd tayyorlash ai', 'taqdimot ai', 'презентация тайёрлаш',
        'сделать презентацию онлайн бесплатно', 'ai prezentatsiya', 'slayd namunalari', 'нейросеть для создания презентаций', 'prezentatsiya qilish',
        'prezentatsiya yaratish', 'prezentatsiya yasash', 'taqdimot tayyorlash ai', 'нейросеть для презентаций бесплатно', 'prezentatsiya namunalari',
        'slayd shablonlari', 'taqdimot qilish', 'презентация нейросеть бесплатно', 'suniy intellekt slayd'], ctr='info')
cl(id='solver_misol_masala', name='Решатель задач: misol / masala / tenglama / uy vazifasi (фото + текст)', include=True,
   status='черновик rasmdan-yechim, STUDIO_PHOTO=false (решение владельца O-04); текстовый путь — чат с ролью teacher', owners=['(черновик) /uz/misol-yechish/'],
   serp=('ищут решатель: приложения Play, Scribd, новости, khanacademy; uniwork.uz (ИИ) #13; «masala yechish» смешан с robocontest', 'r2 / r8', F_AIO, 'serp1.json 48e0cfbe, serp3_table.txt'),
   kws=['misollar yechish', 'tenglama yechish', 'tenglamalar yechish', 'uyga vazifa', 'masalalar', 'misol yechish', 'masala yechish', 'uy ishi',
        'fizika masalalar yechish', 'rasmga olib misol yechish', 'matematika misollar yechish', 'misol ishlash', 'algebra misollar yechish',
        'решение задач по фото', 'решить задачу по фото', 'misollar ishlash', 'решить пример', 'решение задач', 'uy vazifasi', 'решение уравнений',
        'kimyo masalalar yechish', 'uy vazifasini bajarish', 'решение по фото', 'калькулятор уравнений', 'masala ishlash', 'matematika yechish',
        'решение примеров', 'решить уравнение онлайн', 'matematikadan misollar yechish', 'matematika masalalar yechish', 'matematika masalalar',
        'misol yechuvchi', 'rasmga olib yechish', 'matematika ai', 'matematika masala yechish', 'решить по фото', 'matematika misol ishlash',
        'fizika masala yechish', 'misol yechib berish', 'решение задач по математике', 'решатель задач', 'фото решение задач', 'решение примеров онлайн',
        'matematika misollarni yechish', 'geometriya masalalar yechish', 'misollar yechish online', 'uy vazifalari', 'нейросеть для решения задач',
        'решить задачу нейросеть', 'нейросеть для математики', 'нейросеть для домашнего задания', 'решение задач онлайн'],
   photo_only=['rasmga olib misol yechish', 'rasmga olib yechish', 'решение задач по фото', 'решить задачу по фото', 'решение по фото', 'решить по фото', 'фото решение задач'],
   upside_kws=['math solver'], ctr='info')
cl(id='math_examples_generator', name='Генератор примеров по математике 1–4 кл. (не ИИ, W3-09)', include=True,
   status='не построен; вне ядра продукта, решение владельца', owners=['(нет) /uz/matematika-misollar/'],
   serp=('листы с примерами: Scribd, PDF, YouTube, ustoz.ai, mathnet.uz', 'r9', F_AIO, 'serp1.json 48e0cfbe'),
   kws=['matematika misollar', 'karra jadvali', 'misollar', "ko'paytirish jadvali", 'matematika misollar 1 sinf', 'matematika misollar 2 sinf', 'matematika misollar 3 sinf'], ctr='info')
cl(id='test_generator_teacher', name='Тест для учителя (test tuzish / yaratish)', include=True,
   status='умеет чат; отдельной страницы нет', owners=['(нет)'], serp=('не снят', 'приор', F_AIO, 'AIO в 45 из 45 снятых 24.10 выдач рынка'),
   kws=['test tuzish', 'test yaratish', 'нейросеть для тестов'], ctr='info')
cl(id='docs_ariza_xat', name='Документы: ariza, tushuntirish xati, rasmiy xat', include=True,
   status='живые: гайд ariza/tushuntirish (10-07), rasmiy xat (10-24)', owners=['/uz/blog/tushuntirish-xati-va-ariza-yozish/', '/uz/blog/rasmiy-xat-yozish/'],
   serp=('смешанный: Scribd, prezi, soff.uz, словари; ИИ-генератор promli.com #9', 'r2', F_AIO, 'serp3_table.txt 3b60d615'),
   kws=['ariza yozish', 'ariza yozish namunasi', 'ariza namunasi', 'ariza yozish tartibi', 'tushuntirish xati', 'tushuntirish xati yozish',
        'tushuntirish xati namunasi', 'xat yozish', 'xat namunasi', 'xat yozish namunasi', 'xat yozish namuna', 'xizmat xati namuna'], ctr='info')
cl(id='docs_tavsifnoma', name='Tavsifnoma', include=True, status='живой гайд с 2026-10-24', owners=['/uz/blog/tavsifnoma-namuna/'],
   serp=('очень слабый: Scribd ×6, oriftolib, мелкие блоги', 'r9', F_AIO, 'serp1.json 48e0cfbe'),
   kws=['tavsifnoma namuna', 'tavsifnoma'], ctr='info')
cl(id='docs_rezyume_obyektivka', name='Rezyume + obyektivka (ma’lumotnoma)', include=True,
   status='rezyume — живой гайд; obyektivka — страницы нет (O-05)', owners=['/uz/blog/rezyume-tayyorlash/', '(нет) /uz/blog/obyektivka-namuna/'],
   serp=('obyektivka: генераторы tez-hujjat/obyektivka.uz сверху, затем PDF', 'r4–r6', F_AIO, 'serp1.json 48e0cfbe, serp3_table.txt'),
   kws=['rezyume', 'rezyume tayyorlash', 'rezyume namuna', 'obyektivka namuna', 'obyektivka namunasi', "ma'lumotnoma namuna", 'obyektivka',
        'obyektivka yozish', 'нейросеть для резюме'], ctr='info')
cl(id='docs_biznes_reja', name='Biznes reja', include=True, status='живой гайд с 2026-10-07', owners=['/uz/blog/biznes-reja-tuzish/'],
   serp=('не снят', 'приор', F_AIO, 'AIO в 45 из 45 снятых 24.10 выдач рынка'), kws=['biznes reja', 'biznes reja tuzish', 'biznes reja namuna'], ctr='info')
cl(id='tabrik', name='Tabrik (день рождения, Новый год)', include=True, status='живой гайд с 2026-10-24', owners=['/uz/blog/tabrik-yozish/'],
   serp=('архивы на слабых доменах, Telegram, YouTube', 'r4', F_AIO, 'serp2.json 7aa3bce8'),
   kws=['tugilgan kun tabriklari', 'tabriklar', 'yangi yil tabriklari', 'табриклар', 'табрик', 'onaga tabrik', 'tabrik yozish', 'tabrik matni',
        "tabrik so'zlari", 'ustozlar kuni tabrik', 'sms tabrik'], ctr='info')
cl(id='b2b_bots', name='B2B: Telegram/AI-боты для бизнеса', include=True,
   status='заморожен в demand-policy.json (bot-services)', owners=['/uz/biznes-uchun-ai-bot/', '/ru/chat-bot-dlya-biznesa/', '…'],
   serp=('курсы, туториалы, фриланс, объявления', 'r1–r2', F_AIO, 'serp_l6.json 59a6e29e'),
   kws=['чат бот для бизнеса', 'разработка чат бота', 'ии для бизнеса', 'создание ии агента', 'ai консультант', 'ai ассистент', 'чат бот телеграм'],
   bare_kws=['чат бот', 'chat bot', 'telegram bot', 'ai bot'], ctr='info',
   note='коммерческие фразы «telegram bot narxi», «chat bot yaratish», «ai bot biznes uchun», «crm integratsiya» вернули null (L3 §1 п.6)')
cl(id='b2b_agency', name='B2B: агентские услуги (сайт, SMM, таргет, Telegram Ads)', include=True,
   status='живые страницы; вне задачи AI-продукта, для полноты', owners=['/uz/sayt-yaratish/', '/uz/smm-xizmatlari/', '…'],
   serp=('местные агентства, блоги; telegram ads: #1 ads.telegram.org', '—', F_AIO, 'demand-policy.json notes'),
   kws=['sayt yaratish', 'sayt yaratish xizmati', 'web sayt yaratish', 'veb sayt yaratish', 'bepul sayt yaratish', 'sayt yaratish narxi', 'sayt ochish',
        'создание сайтов ташкент', 'разработка сайтов ташкент', 'разработка сайтов в ташкенте', 'smm nima', 'marketing nima', 'target nima',
        'smm xizmatlari', 'telegram ads', 'ads telegram', 'реклама в телеграм', 'telegram reklama', 'target yoqish', 'instagram target yoqish',
        'instagram target', 'seo xizmati'], ctr='info')

# excluded, shown for scale only
EXCL = [
    ('nav_translate', 'Навигация к переводчику Google/Яндекс и голые «tarjimon/переводчик»',
     ['переводчик', 'tarjimon', 'tarjima', 'гугл переводчик', 'tarjima qilish', 'таржимон', 'google tarjimon', 'яндекс переводчик', 'перевод на русский',
      'таржима', 'tarjimon online', 'переводчик онлайн', 'onlayn tarjimon', 'tarjimon google', 'перевод текста', 'таржима килиш', 'tarjimon uz', 'гугл таржимон', 'онлайн таржимон', 'matn tarjima'],
     'навигация к Google Translate / Yandex: в топ-10 «tarjimon» 4 результата Google Translate и 3 Yandex (translator-market.md §2)'),
    ('translate_photo_voice_dict', 'Перевод по фото/голосом, словарь',
     ['google tarjimon rasm orqali', 'переводчик с узбекского на русский по фото', 'словар рус узбек', 'голосовой переводчик с узбекского на русский'],
     'продукт не переводит фото и голос, словаря нет (translator-market.md §1.5 п.4)'),
    ('other_ai_brands', 'Бренды других ИИ', ['gemini', 'gemini ai', 'claude ai', 'deepseek', 'grok', 'chatgpt 4', 'chatgpt 5', 'gamma ai', 'copilot', 'perplexity'],
     'навигация к чужим продуктам (L3 §7); gamma ai — бренд-инструмент презентаций'),
    ('test_banks_answers', 'Банки тестов и «ответы на тесты»',
     ['informatika test', 'fizika test', 'matematika test', 'dtm test', 'dtm test javoblari', 'test savollari', 'test javoblari', 'online test yechish', 'test yechish', 'test ishlash', 'testlar javoblari bilan', 'test javoblarini topish', 'test javobi'],
     'SERP — банки тестов (qnb.uz, ziyonet) и утечки ключей ДТМ; ИИ не знает официальных ответов, сгенерированный «ответ» вредит (L3 §7)'),
    ('gdz_brand_solvers', 'ГДЗ и бренды решателей',
     ['гдз', 'photomath', 'gdz uz', 'гдз по фото', 'гдз узбекистан'],
     'архивы готовых ответов и навигация к приложению Photomath'),
]

# ---------------------------------------------------------------- dedupe + sums
def bucketize(kws, groups=()):
    """Return list of buckets [(rep_kw, volume, series, members)], plus missing list.
    Conservative rule: identical (volume, non-flat 12-month series) = one Google Ads bucket; keywords without series
    and volume >= 100 merge when volume and script are equal (they cannot be told apart); explicit grouped_with pairs merge.
    Flat low series (e.g. 10,10,...,10) and tiny no-series rows stay separate: identical noise is not evidence of one bucket."""
    gmap = {}
    for g in groups:
        for k in g:
            gmap[k] = g[0]
    buckets = collections.OrderedDict(); missing = []
    for k in kws:
        s = SRC.get(k)
        if not s or s['volume'] in (None,):
            missing.append(k); continue
        if k in gmap:
            key = ('grp', gmap[k])
        elif s['series'] and s['volume'] >= 100 and (len(set(s['series'])) > 1 or s['volume'] >= 1000):
            key = ('ser', s['volume'], s['series'])
        elif s['series'] or s['volume'] < 100:
            key = ('one', k)          # flat low series / tiny no-series rows cannot be told apart from noise: keep separate
        else:
            key = ('nos', script_of(k), s['volume'])
        # a no-series keyword whose volume+script equals a series bucket in the same cluster also merges
        if key[0] == 'nos':
            for bk, b in buckets.items():
                if bk[0] == 'ser' and b['volume'] == s['volume'] and script_of(b['rep']) == key[1]:
                    key = bk; break
        b = buckets.setdefault(key, dict(rep=k, volume=s['volume'], series=s['series'], members=[]))
        b['members'].append(k)
        if b['series'] is None and s['series']:
            b['series'] = s['series']
    return list(buckets.values()), missing

def high_sum(kws, groups=()):
    seen = set(); tot = 0
    gm = {k: g[0] for g in groups for k in g}
    for k in kws:
        s = SRC.get(k)
        if not s or s['volume'] is None:
            continue
        key = gm.get(k, k)
        if key in seen:
            continue
        seen.add(key); tot += s['volume']
    return tot

# ---------------------------------------------------------------- GSC
def load_rows():
    allr = []
    for f in ['gsc_page_query_28d_p0.json', 'gsc_page_query_28d_p1.json']:
        allr += jl(os.path.join(GA, 'raw', f))['rows']
    uz = list(jl(os.path.join(GA, 'raw', 'gsc_page_query_28d_uzb_p0.json'))['rows'])
    with open(os.path.join(GA, 'raw', 'gsc_page_query_28d_uzb_p1.tsv'), encoding='utf-8') as f:
        for line in f:
            if line.startswith('#') or not line.strip():
                continue
            parts = line.rstrip('\n').split('\t')
            if parts[0] in ('page', 'url'):
                continue
            try:
                uz.append({'keys': [parts[0], parts[1]], 'clicks': float(parts[2]), 'impressions': float(parts[3]), 'position': float(parts[-1])})
            except (ValueError, IndexError):
                pass
    return allr, uz

BRAND = r'(chat ?gpt|чат ?(gpt|гпт|жпт)|чатгпт|чатжпт|\bgpt\b|гпт|джипити|жпт|piti|пити|chachi|chaji|чачи|чача|jaji|жажи|chati|чати|ча ?чи)'
def classify(q):
    q = q.lower()
    if re.search(BRAND, q):
        if re.search(r'(yuklab|yuklash|скача|skachat|tortish|o.?rnatish|ilova|apk|download|установ|программа|dastur|ochish)', q):
            return 'chatgpt_howto'
        if re.search(r'(оплат|plus|to.?lov|расшифр|аббрев|claude|что такое|nima|генератив|transformer|трансформер|сравн|разниц|\bvs\b)', q):
            return 'chatgpt_howto'
        if re.search(r'(tarjim|перев)', q):
            return 'ai_chat_brand_modifier'
        if re.search(r'(uzbek|узбек|o.?zbek|ozbek|uzbekcha|узбекча|tilida|тилида|uzb|русск|по-русски)', q):
            return 'ai_chat_brand_modifier'
        if re.search(r'(kirish|вход|войти|login|sign|sayt|сайт|rasmiy|официал|\.uz|\.com|openai)', q):
            return 'nav_chatgpt_brand'
        if re.search(r'(bepul|бесплат|онлайн|online|onlayn|без регистр|free|yozish|писать|gaplash|uz$|\buz\b)', q):
            return 'ai_chat_brand_modifier'
        return 'nav_chatgpt_brand'
    if re.search(r'(генератив|transformer|трансформер|расшифр)', q):
        return 'chatgpt_howto'
    if re.search(r'(kirill|lotin|кирилл|лотин|латин)', q):
        return 'converter_cyr_lat'
    if re.search(r'(tarjim|таржим|перев|translat)', q):
        if re.search(r'(ingliz|англ|english|инглиз)', q):
            return 'translator_en_uz'
        if re.search(r'(turk|турк|korey|корей|arab|араб)', q):
            return 'translator_other_pairs'
        if re.search(r'(лид|lead)', q):
            return 'b2b_agency'
        return 'translator_ru_uz'
    for cid, rx in [('school_referat', r'(referat|реферат|mustaqil ish)'),
                    ('school_insho_esse', r'(insho|esse|эссе|сочинен|murakkab reja|sodda reja)'),
                    ('school_kurs_ishi', r'(kurs ishi|курсов)'),
                    ('school_slayd', r'(slayd|prezent|презент|taqdimot|pptx)'),
                    ('solver_misol_masala', r'(yech|ishlash|uy vazifa|uyga vazifa|tenglama|решени|решить|задач|уравнен)'),
                    ('math_examples_generator', r'(karra|jadval|matematika misol|misollar)'),
                    ('test_generator_teacher', r'(test tuz|test yarat)'),
                    ('docs_ariza_xat', r'(ariza|tushuntirish|xat yoz|rasmiy xat|xizmat xati)'),
                    ('docs_tavsifnoma', r'(tavsif|тавсиф)'),
                    ('docs_rezyume_obyektivka', r'(rezyume|резюме|obyektiv|ma.?lumotnoma|объектив)'),
                    ('docs_biznes_reja', r'(biznes reja|бизнес[- ]план)'),
                    ('tabrik', r'(tabrik|табрик|поздрав)'),
                    ('ai_basics', r'(intellekt|интеллект нима|сунъий|prompt|промпт|^ai nima)'),
                    ('b2b_bots', r'(\bбот|\bbot|chatbot|crm|\bамо|amocrm|bitrix|битрикс|автоматиз|direct|директ\b|агент|biznes uchun|для бизнеса|для instagram|продав|менеджер)'),
                    ('ai_chat_generic', r'(^ии\b|\bии\b|нейросет|ai chat|ai чат|искусственн|ai bilan|ai yordam|chat ai|\bai\b)'),
                    ('b2b_agency', r'(сайт|sayt|seo|сео|smm|смм|target|таргет|реклам|reklama|marketing|маркетинг|лид|lead|ads|продвиж|landing|лендинг|web)')]:
        if re.search(rx, q):
            return cid
    return 'other'

allr, uzr = load_rows()
G = collections.defaultdict(lambda: dict(clicks=0, impr=0, pos_w=0.0, uz_clicks=0, uz_impr=0, top=collections.Counter()))
for r in allr:
    c = classify(r['keys'][1]); g = G[c]
    g['clicks'] += r['clicks']; g['impr'] += r['impressions']; g['pos_w'] += r['position'] * r['impressions']; g['top'][r['keys'][1]] += r['impressions']
for r in uzr:
    c = classify(r['keys'][1]); g = G[c]
    g['uz_clicks'] += r['clicks']; g['uz_impr'] += r['impressions']
VIS_CLICKS = sum(r['clicks'] for r in allr); VIS_IMPR = sum(r['impressions'] for r in allr)
SITE_CLICKS_28 = 1584; SITE_IMPR_28 = 214911   # GSC sum by date, baseline.md §1
GA4_SESSIONS_28 = 2805                          # GA4 2026-09-26..10-23, baseline.md §0

# ---------------------------------------------------------------- compute
out = []
def season(buckets):
    ser = [b['series'] for b in buckets if b['series'] and len(b['series']) == 12]
    if not ser:
        return None
    tot = [sum(s[i] for s in ser) for i in range(12)]
    avg = sum(b['volume'] for b in buckets if b['series'] and len(b['series']) == 12)
    # index 0 = 2026-09 ... 11 = 2025-10
    okt_dek_2025 = (tot[11] + tot[10] + tot[9]) / 3
    return dict(coverage_volume=avg, oct_dec_2025_avg=round(okt_dek_2025), peak=max(tot), sep_2026=tot[0], aug_2026=tot[1],
                oct_dec_vs_avg=round(okt_dek_2025 / avg, 2) if avg else None)

for c in C:
    buckets, missing = bucketize(c['kws'], c.get('groups', ()))
    d_low = sum(b['volume'] for b in buckets)
    d_high = high_sum(c['kws'], () if c.get('soft_groups') else c.get('groups', ()))
    g = G.get(c['id'], dict(clicks=0, impr=0, pos_w=0, uz_clicks=0, uz_impr=0, top=collections.Counter()))
    uz_impr_month = g['uz_impr'] * M
    demand_basis = 'Google Ads (12-мес. среднее, дедуп.)'
    D = d_low
    gpos = (g['pos_w'] / g['impr']) if g['impr'] else 99
    if uz_impr_month > d_low and gpos <= 10:
        D = round(uz_impr_month); demand_basis = 'GSC-показы UZ ×30,44/28 (выше Ads — сайт уже на 1-й странице; Ads не видит хвост)'
    today = g['clicks'] * M
    if c['ctr'] == 'chat':
        lo, hi = CTR['top10_chat_low'], CTR['top10_chat_high']
    else:
        lo, hi = CTR['top10_info_low'], CTR['top10_info_high']
    f = c['serp'][2] if c['serp'][2] else 1.0
    t10_lo = D * lo; t10_hi = D * hi; t3 = D * CTR['top3'] * f
    rec = dict(id=c['id'], name=c['name'], include=c['include'], status=c['status'], owners=c['owners'],
               serp_type=c['serp'][0], serp_aio=c['serp'][1], top3_discount=round(f, 3), serp_source=c['serp'][3],
               demand_ads_low=d_low, demand_ads_high=d_high, demand_used=D, demand_basis=demand_basis,
               buckets=[dict(keyword=b['rep'], volume=b['volume'], members=b['members'], source=SRC[b['rep']]['source']) for b in sorted(buckets, key=lambda x: -x['volume'])],
               unmeasured=missing, season=season(buckets),
               gsc_28d=dict(clicks=g['clicks'], impressions=g['impr'], position=round(g['pos_w'] / g['impr'], 1) if g['impr'] else None,
                            uz_clicks=g['uz_clicks'], uz_impressions=g['uz_impr'], top_queries=g['top'].most_common(5)),
               impression_share_uz=round(g['uz_impr'] / (d_low * 28 / 30.44), 4) if d_low else None,
               clicks_month=dict(today=round(today), top10_low=round(max(today, t10_lo)), top10_high=round(max(today, t10_hi)), top3=round(max(today, t3))),
               ctr_used=dict(top10_low=round(lo, 5), top10_high=round(hi, 5), top3=round(CTR['top3'], 5)))
    if not c['include']:
        rec['why_excluded'] = c.get('why_excluded')
        rec['clicks_month'].update(top10_low=round(today), top10_high=round(today), top3=round(today))
    for extra in ('upside_kws', 'photo_only', 'bare_kws'):
        if extra in c:
            bk, ms = bucketize(c[extra], c.get('groups', ()))
            rec[extra] = dict(volume=sum(b['volume'] for b in bk), keywords=[(b['rep'], b['volume'], b['members']) for b in bk], unmeasured=ms)
    for extra in ('group_note', 'note'):
        if extra in c:
            rec[extra] = c[extra]
    out.append(rec)

excl = []
for eid, name, kws, why in EXCL:
    bk, ms = bucketize(kws)
    g = G.get(eid)
    excl.append(dict(id=eid, name=name, demand_ads=sum(b['volume'] for b in bk), top=[(b['rep'], b['volume']) for b in sorted(bk, key=lambda x: -x['volume'])[:6]], why=why))

other = G.get('other', dict(clicks=0, impr=0, top=collections.Counter()))
anon_clicks = SITE_CLICKS_28 - VIS_CLICKS
tot = dict(today=0, top10_low=0, top10_high=0, top3=0)
for r in out:
    for k in tot:
        tot[k] += r['clicks_month'][k]
flat = (other['clicks'] + anon_clicks) * M
for k in tot:
    tot[k] = round(tot[k] + flat)
ratio_sessions = GA4_SESSIONS_28 / SITE_CLICKS_28

ser_rank = sorted([r for r in out if r['include']], key=lambda r: -(r['clicks_month']['top3']))
summary = dict(
    totals_clicks_month=tot,
    totals_clicks_day={k: round(v / 30.44) for k, v in tot.items()},
    ga4_sessions_per_gsc_click=round(ratio_sessions, 2),
    visits_day_if_channel_mix_holds={k: round(v / 30.44 * ratio_sessions) for k, v in tot.items()},
    flat_rows=dict(other_visible_clicks_28d=other['clicks'], anonymized_clicks_28d=anon_clicks, monthly=round(flat)),
    top5_by_top3=[(r['id'], r['clicks_month']['top3']) for r in ser_rank[:5]],
    top5_by_top10_high=[(r['id'], r['clicks_month']['top10_high']) for r in sorted(out, key=lambda r: -r['clicks_month']['top10_high']) if r['include']][:5],
)
inc = [r for r in out if r['include']]
summary['top5_by_top3_growth'] = [(r['id'], r['clicks_month']['top3'] - r['clicks_month']['today']) for r in sorted(inc, key=lambda r: -(r['clicks_month']['top3'] - r['clicks_month']['today']))][:5]
summary['top5_by_top10_growth'] = [(r['id'], r['clicks_month']['top10_high'] - r['clicks_month']['today']) for r in sorted(inc, key=lambda r: -(r['clicks_month']['top10_high'] - r['clicks_month']['today']))][:5]
# sensitivities
c2 = cell(qn, 2)
ctr2 = c2[0] / c2[1]
def scen_total(fn):
    t = flat
    for r in out:
        t += fn(r)
    return round(t)
summary['sensitivity'] = dict(
    top3_ctr_pos2_thin_cell_no_discount=dict(ctr=round(ctr2, 4), source='L1 §3.3 pos 2, no chats: %d/%d (thin)' % c2,
        clicks_month=scen_total(lambda r: max(r['clicks_month']['today'], r['demand_used'] * ctr2) if r['include'] else r['clicks_month']['today'])),
    top3_no_aio_discount=dict(clicks_month=scen_total(lambda r: max(r['clicks_month']['today'], r['demand_used'] * CTR['top3']) if r['include'] else r['clicks_month']['today'])),
    translator_ru_uz_top10_if_translate_box=dict(discount=round(F_AIO_R1, 3),
        clicks_month=[round(next(r for r in out if r['id'] == 'translator_ru_uz')['demand_used'] * x * F_AIO_R1) for x in (CTR['top10_info_low'], CTR['top10_info_high'])]),
    math_generator_without_suspect_series=dict(keyword='matematika misollar', series_oct25_to_sep26=list(reversed(SRC['matematika misollar']['series'])),
        demand=next(r for r in out if r['id'] == 'math_examples_generator')['demand_used'] - SRC['matematika misollar']['volume']),
    calibration_first_month_K=0.04,
)
summary['top5_share_of_top3_growth'] = round(sum(v - next(r['clicks_month']['today'] for r in out if r['id'] == i) for i, v in summary['top5_by_top3']) /
                                             max(1, sum(r['clicks_month']['top3'] - r['clicks_month']['today'] for r in out if r['include'])), 3)

res = dict(meta=dict(date='2026-10-25', author='demand-sizing step, roadmap-1000 workflow',
                     gsc_window='2026-09-24..2026-10-21 (last_28_days, all countries for clicks; country=uzb for impression share)',
                     gsc_visible=dict(clicks=VIS_CLICKS, impressions=VIS_IMPR), gsc_site=dict(clicks=SITE_CLICKS_28, impressions=SITE_IMPR_28),
                     month_factor=round(M, 4), ctr=CTR, ctr_sources=CTR_SRC,
                     discounts=dict(aio_rank1=round(F_AIO_R1, 3), aio_present=round(F_AIO, 3),
                                    sources=['Pew Research Center 2025-07-22: users clicked a traditional result in 8% of visits with an AI summary vs 15% without',
                                             'Ahrefs 2025-04 (300k keywords): AI Overview present -> position-1 CTR 34.5% lower']),
                     rules=['scenario = max(today, demand x CTR x discount); discount applies to top-3 only',
                            'excluded clusters and anonymised/other GSC clicks are held flat at today in every scenario',
                            'demand_used = max(deduplicated Google Ads 12-month average, Uzbekistan GSC impressions x 30.44/28)']),
           clusters=out, excluded=excl, summary=summary)
with open(os.path.join(HERE, '..', 'demand-sizing.json'), 'w', encoding='utf-8') as f:
    json.dump(res, f, ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- tables.md
def n(x):
    return f'{x:,.0f}'.replace(',', ' ')
L = []
L.append('| # | Кластер | Спрос/мес (низ…верх Ads) | База спроса | GSC 28д: клики / показы / поз. | Доля показов UZ | SERP | AIO / дисконт топ-3 | Сегодня | Топ-10 (поз.~6) | Топ-3 (поз.~2) |')
L.append('|---|---|---:|---|---|---:|---|---|---:|---:|---:|')
for i, r in enumerate(out, 1):
    g = r['gsc_28d']; cm = r['clicks_month']
    share = '—' if r['impression_share_uz'] is None else ('>100%' if r['impression_share_uz'] > 1 else f"{r['impression_share_uz']*100:.1f}%")
    dem = f"{n(r['demand_used'])}" + (f" ({n(r['demand_ads_low'])}…{n(r['demand_ads_high'])})" if r['demand_ads_high'] != r['demand_ads_low'] or r['demand_used'] != r['demand_ads_low'] else '')
    basis = 'GSC' if r['demand_basis'].startswith('GSC') else 'Ads'
    t10 = f"{n(cm['top10_low'])}–{n(cm['top10_high'])}" if cm['top10_low'] != cm['top10_high'] else n(cm['top10_low'])
    name = r['name'] + ('' if r['include'] else ' **(исключён)**')
    L.append(f"| {i} | {name} | {dem} | {basis} | {n(g['clicks'])} / {n(g['impressions'])} / {g['position'] or '—'} | {share} | {r['serp_type']} | {r['serp_aio']} / ×{r['top3_discount']} | {n(cm['today'])} | {t10} | {n(cm['top3'])} |")
L.append(f"| — | Прочие видимые запросы + анонимизированные клики GSC (держим на сегодняшнем уровне) | — | — | {n(other['clicks'])} + {n(anon_clicks)} аноним. | — | — | — | {n(flat)} | {n(flat)} | {n(flat)} |")
L.append(f"| | **Итого, кликов из Google в месяц** | | | | | | | **{n(tot['today'])}** | **{n(tot['top10_low'])}–{n(tot['top10_high'])}** | **{n(tot['top3'])}** |")
L.append(f"| | **То же в день** | | | | | | | **{n(tot['today']/30.44)}** | **{n(tot['top10_low']/30.44)}–{n(tot['top10_high']/30.44)}** | **{n(tot['top3']/30.44)}** |")
L.append('')
L.append('EXCLUDED')
for e in excl:
    L.append(f"| {e['name']} | {n(e['demand_ads'])} | {', '.join(f'{k} {n(v)}' for k, v in e['top'])} | {e['why']} |")
L.append('')
L.append('SEASON')
for r in out:
    if r['season']:
        s = r['season']
        L.append(f"| {r['id']} | {n(s['coverage_volume'])} | {n(s['oct_dec_2025_avg'])} | ×{s['oct_dec_vs_avg']} | {n(s['peak'])} | {n(s['aug_2026'])} | {n(s['sep_2026'])} |")
L.append('')
L.append('UNMEASURED')
for r in out:
    if r['unmeasured']:
        L.append(f"{r['id']}: {r['unmeasured']}")
for r in out:
    for extra in ('upside_kws', 'photo_only', 'bare_kws'):
        if extra in r:
            L.append(f"{r['id']} {extra}: {r[extra]}")
L.append('')
L.append('SUMMARY ' + json.dumps(summary, ensure_ascii=False))
L.append('CTR ' + json.dumps(CTR) + ' VIS ' + str((VIS_CLICKS, VIS_IMPR)))
with open(os.path.join(HERE, 'tables.md'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(L))
import sys
sys.stdout.buffer.write(('\n'.join(L) + '\n').encode('utf-8'))
