# -*- coding: utf-8 -*-
"""Merge computed numbers (ep_model.json, ep_ramp.json) with qualitative cluster cards -> ../education-practice.json"""
import json, os, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
M = json.load(open(os.path.join(HERE, 'ep_model.json'), encoding='utf-8'))
RAMP = json.load(open(os.path.join(HERE, 'ep_ramp.json'), encoding='utf-8'))
SERP_MEASURED = json.load(open(os.path.join(HERE, 'ep_serp_top.json'), encoding='utf-8'))['serps']

CARDS = {
    'practice_tests': dict(
        priority=1,
        serp_source='снято 25.10: «informatika test»; прокси из L3 24.10: «test savollari»',
        serp='«informatika test»: o1 Scribd PDF (тест для учителей), AIO r2, o2 infotest.uz (пустая страница), o3/o8 wordwall (пользовательские квизы), o4 educaplay (испанский интерфейс), o5 wayground, o6 informatika.uz (курсы программирования), o7 docx.uz (файлообменник), o9 сербский weebly. «test savollari» (L3): AIO r1, qnb.uz, test.ziyonet.uz, приложения Play, infotest.uz, мусор (tass.ru, магазин падел-ракеток). Ни одного узбекского сайта с оригинальными вопросами и разбором.',
        serp_weakness='weak',
        fit='(a) детерминированный движок квиза (мгновенная проверка, счёт, фильтр по классу) + (c) свой банк вопросов с разбором каждого ответа + (b) кнопка «Mavzu bo‘yicha test» — уже есть пресет study-test в src/gpt-chat/templates.ts',
        build='Хаб /uz/testlar/ + 10 страниц /uz/testlar/{informatika,fizika,matematika,biologiya,ingliz-tili,ona-tili,tarix,geografiya,kimyo,huquq}/ (тип: интерактивный квиз, schema.org Quiz). На каждой 40–60 своих вопросов с разбором, фильтр 5–11 sinf, трек «attestatsiya (o‘qituvchilar)» для informatika/matematika (о1 выдачи — учительский тест). RU-зеркала /ru/testy/{biologiya,istoriya}/ для «биология тест» 8 100 и «тарих тест» 1 600. Подстраницы-тренажёры: /uz/tarix/tarixiy-sanalar/ (квиз по датам), /uz/geografiya/poytaxtlar/. Пилот: informatika + fizika + matematika — проверка спроса по показам GSC за 4 недели.',
        effort='L', honesty_risk='medium',
        honesty_note='Соседство с «test javoblari»/«dtm test javoblari» (исключены). Только свои вопросы и свои ключи с разбором; никаких ключей ДТМ/BSB/ChSB, никаких копий чужих банков. «javoblari bilan» (5 400 + 170 + 90) закрываем собственными ответами с объяснением.',
        caveat='Аномальная форма спроса: у 16 ключей (в т.ч. informatika/fizika/matematika/biologiya/ingliz tili test) рост ×10–100 с декабря 2025. Floor 28 685/мес против Ads 204 640/мес. Отдельно подозрительна корзина «ona tili testlar» 110 000 (у «ona tili test» 1 600) — в расчёт не включена.'),
    'math_formulas_calculators': dict(
        priority=2,
        serp_source='снято 25.10: «qisqa ko‘paytirish formulalari»; прокси L3: «misollar yechish», «masala yechish»',
        serp='AIO r1; o1 Scribd PDF, o2 Instagram reel, o3 oefen.uz (слайды без описания), o4/o9 soff.uz (платные файлы), o5 Scribd, o6 uz.khanacademy (упражнение), o7/o8 YouTube, o10 upraktika.uz. Ни одного интерактивного калькулятора или живой шпаргалки.',
        serp_weakness='weak',
        fit='(a) детерминированные калькуляторы с пошаговым решением + (c) свои шпаргалки формул с примерами и генератором упражнений',
        build='Хаб /uz/matematika/formulalar/ + страницы-инструменты: /uz/matematika/qisqa-kopaytirish-formulalari/ (шпаргалка + генератор примеров), /uz/kalkulyator/tenglamalar-sistemasi/, /uz/kalkulyator/uchburchak-yuzi/ (+ doira yuzi, aylana uzunligi), /uz/kalkulyator/ekub-ekuk/ (+ RU /ru/kalkulyator/nod-i-nok/), /uz/kalkulyator/tub-sonlar/, /uz/kalkulyator/kvadrat-tenglama/ (дискриминант по шагам, RU-зеркало), /uz/kalkulyator/kasr/ (+ /ru/kalkulyator-drobey/), /uz/kalkulyator/foiz/, /uz/kalkulyator/gpa/, /uz/fizika/formulalar/, /uz/olchov-birliklari/. Около 12 страниц, каждая — настоящий инструмент.',
        effort='M', honesty_risk='low', honesty_note='Чистые вычисления; проверять формулы и шаги тестами.',
        caveat='Скачок только у 4 ключей (tenglamalar sistemasi, uchburchak yuzi, ekub va ekuk, o‘lchov birliklari); floor 33 095 — самый устойчивый крупный кластер линзы. AIO на r1 → дисконт ×0,533 в топ-3.'),
    'logic_quiz': dict(
        priority=3,
        serp_source='снято 25.10: «mantiqiy savollar»',
        serp='o1 uzinterbiz.com (блог-список), o2/o6 приложения Play, o3 makepedia.uz (2018), o4 Scribd PDF, o5 audiobook.uz (2020), AIO только на r8, o7 bilimmarkazi.uz, o9 soff.uz (платный файл), o10 wordwall, o13 Facebook-группа, o14 Telegram-канал.',
        serp_weakness='weak',
        fit='(c) свои загадки и логические задачи с ответом под спойлером и разбором + (a) режим квиза со счётом',
        build='/uz/mantiqiy-savollar/ (300+ своих вопросов, темы и уровни, режим «javobni ko‘rsatish»), /uz/topishmoqlar/ (по темам: bolalar uchun, hayvonlar, matematik), /uz/boshqotirmalar/, /uz/zakovat-savollari/ (свои вопросы в формате Zakovat, не копии эфира), /uz/qiziqarli-savollar/. Тип: статическая коллекция + квиз-режим.',
        effort='M', honesty_risk='low',
        honesty_note='Списки в выдаче копируют друг у друга — писать свои; вопросы телеигры «Zakovat» не переносить.',
        caveat='Тренд вниз: «mantiqiy savollar» 22 200–27 100 осенью 2025 → 9 900 в сентябре 2026. Летний провал до ×0,29. «topishmoqlar» может пересечься с линзой детского/развлекательного контента.'),
    'periodic_table_chem': dict(
        priority=4,
        serp_source='снято 25.10: «mendeleyev jadvali»',
        serp='o1 erus.uz (PDF статьи), AIO r2, o2/o4 hilolnashr.uz (магазин плакатов), o3/o8 Scribd, o5/o6 mylab.uz, o7 himmatov.uz (единственная интерактивная таблица, личный сайт), o9 ziyonet PDF, o10 slideshare. RU «таблица менделеева» не снята — там вероятны ptable/Википедия.',
        serp_weakness='weak',
        fit='(a) интерактивная таблица + калькулятор молярной массы + уравнивание реакций (линейная алгебра) + (c) страницы элементов из открытых данных IUPAC',
        build='/uz/kimyo/mendeleyev-jadvali/ (интерактивная, подписи латиница/кириллица), /ru/tablitsa-mendeleeva/, 118 страниц /uz/kimyo/element/{belgi}/ (масса, конфигурация, степени окисления, валентность), /uz/kimyo/molyar-massa/ (парсер формулы), /uz/kimyo/oksidlanish-darajasi/ (правила + калькулятор), /uz/kimyo/reaksiya-tenglash/.',
        effort='M', honesty_risk='low', honesty_note='Факты из IUPAC/NIST; без «решебников».',
        caveat='«kimyo masalalar» 90 500 исключена как аномалия (20 → 165 000 за год, L3 тоже отклонил). Пик сентябрь–октябрь (×1,6–2,0).'),
    'primary_math_grades': dict(
        priority=5,
        serp_source='не снято; прокси L3: «matematika misollar» (Scribd, PDF, ustoz.ai, YouTube, soff.uz)',
        serp='Не снято. Прокси «matematika misollar» (L3): o1 Scribd, o2 ustoz.ai, PDF вузов, YouTube, arxiv.uz, soff.uz, Википедия — слабая. Запросы «matematika N sinf» частью ищут учебник (PDF) — намерение смешанное.',
        serp_weakness='mixed',
        fit='(a) генератор упражнений по классам (печатные листы, столбик, тренажёр таблицы умножения) + (c) короткие объяснения',
        build='Расширение кластера math_examples_generator из roadmap: /uz/matematika/{1..6}-sinf/ (генератор листов по темам программы класса), /uz/karra-jadvali/trenajyor/, /ru/tablitsa-umnozheniya/ (тренажёр, печать), /ru/primery-dlya-1-klassa/, /ru/primery-dlya-2-klassa/.',
        effort='S', honesty_risk='medium',
        honesty_note='Не выкладывать учебники и ответы к ним; страница честно предлагает упражнения, а не учебник.',
        caveat='«matematika 3 sinf» 14 800 — форма скачка (floor 2 150). Ключи предыдущего кластера (matematika misollar, karra jadvali, misollar, ko‘paytirish jadvali) не пересчитаны.'),
    'english_grammar': dict(
        priority=6,
        serp_source='не снято',
        serp='Не снято. Для английских голов «irregular verbs», «present simple» в выдаче UZ ожидаемы глобальные сайты (Cambridge, BBC, EF) — сильная часть; узбекские формулировки («noto‘g‘ri fe’llar», «ingliz tili grammatika») — вероятно слабые.',
        serp_weakness='mixed',
        fit='(c) грамматика по-узбекски с упражнениями + (a) тренажёр неправильных глаголов и тест уровня + (b) пресет «объясни ошибку»',
        build='/uz/ingliz-tili/notogri-feillar/ (таблица 150 глаголов с переводом + тренажёр), /uz/ingliz-tili/present-simple/, /uz/ingliz-tili/present-perfect/, /uz/ingliz-tili/zamonlar/ (12 времён), /uz/ingliz-tili/daraja-testi/ (A1–C1, свои вопросы), /ru/test-na-uroven-angliyskogo/.',
        effort='M', honesty_risk='low', honesty_note='Уровень по тесту — ориентировочный, без «сертификата».',
        caveat='Медленный разгон (K1=0,04): английские головы держат сильные международные сайты.'),
    'exam_prep': dict(
        priority=7,
        serp_source='не снято',
        serp='Не снято. Головы «dtm», «abituriyent», «uzbmb», «milliy sertifikat» — навигация к uzbmb.uz / my.uzbmb.uz (исключены или вынесены в верхнюю границу). Хвосты с предметом (matematika/tarix milliy sertifikat) — вероятно Telegram, YouTube, учебные центры.',
        serp_weakness='mixed',
        fit='(c) страницы формата экзамена по предмету (структура, время, баллы → уровень) + (a) мок-тест на банке из кластера practice_tests + калькулятор баллов',
        build='/uz/milliy-sertifikat/ (хаб: что это, уровни, как считаются баллы — со ссылкой на uzbmb.uz и датой проверки), /uz/milliy-sertifikat/{matematika,tarix,biologiya,ona-tili,fizika,kimyo}/ (формат + 30 своих задач уровня B/A), /uz/dtm-test/ (онлайн мок-тест блоками), /uz/kalkulyator/dtm-ball/ и /uz/kalkulyator/milliy-sertifikat-ball/, /uz/attestatsiya-test/ (учителя, по предметам).',
        effort='L', honesty_risk='medium',
        honesty_note='Не намекать на аффилиацию с UzBMB; формат и пороги — только из официальных документов с датой; никаких «javoblari», «kalit» и утечек.',
        caveat='9 из 12 крупных ключей — форма скачка (floor 21 420 против 52 240). Пики июнь–июль (×1,7–2,0) и сентябрь: страницы должны быть живы к марту–апрелю 2027.'),
    'ona_tili_grammar': dict(
        priority=8,
        serp_source='не снято',
        serp='Не снято. Ожидаемо: ziyouz/ziyonet PDF, arxiv.uz, Scribd, uz.wikipedia, YouTube, imlo.uz (для «imlo»).',
        serp_weakness='mixed',
        fit='(c) правила с примерами и упражнениями с автопроверкой + (b) пресет проверки орфографии в чате',
        build='Хаб /uz/ona-tili/ + ~20 страниц правил: /uz/ona-tili/imlo-qoidalari/, /gap-bolaklari/, /kelishiklar/, /soz-turkumlari/ (ot, sifat, son, olmosh, fe’l, ravish), /fonetika/, /morfologiya/, /sintaksis/, /qoshma-gap/, /tinish-belgilari/, /sinonim-antonim-omonim/, /frazeologizmlar/; /uz/diktant-matnlari/ (свои тексты по классам 2–11).',
        effort='M', honesty_risk='low',
        honesty_note='Писать с U+2018 в o‘/g‘ (конвенция сайта); тексты диктантов — свои.',
        caveat='«imlo lug‘ati» 18 100 исключён (словарь, навигация к imlo.uz); «sifat» и «imlo» вынесены в верхнюю границу (многозначны).'),
    'iq_test': dict(
        priority=9,
        serp_source='не снято',
        serp='Не снято. Ожидаемо: международные iq-тест сайты, узбекские блоги, приложения.',
        serp_weakness='mixed',
        fit='(a) детерминированный тест из своих задач (матрицы, ряды) со счётом и разбором',
        build='/uz/iq-test/ и /ru/test-iq/: 30 своих задач (SVG), таймер, разбор каждой задачи, результат как «mantiqiy fikrlash bali», а не IQ.',
        effort='M', honesty_risk='medium',
        honesty_note='Нормированной выборки нет — нельзя выдавать «ваш IQ = 120»; прямой дисклеймер, никакой психодиагностики.',
        caveat='Стабильный спрос без скачка (15 840).'),
    'number_converters': dict(
        priority=10,
        serp_source='не снято',
        serp='Не снято. «rim raqamlari» вероятно слабая (блоги, PDF); RU «римские цифры», «сумма прописью» — сильные русские инструменты.',
        serp_weakness='mixed',
        fit='(a) конвертеры в обе стороны с пояснением шагов',
        build='/uz/konvertor/rim-raqamlari/ (+ /ru/rimskie-tsifry/), /uz/konvertor/sanoq-sistemalari/ (2/8/10/16 по шагам); смежное: /ru/summa-propisyu/ (12 100/мес, документы, вне школьной линзы).',
        effort='S', honesty_risk='low', honesty_note='Чистые вычисления.',
        caveat='Без «сумма прописью» кластер мал (13 250); рядом с уже живым конвертером латиница↔кириллица.'),
    'ielts_cefr_writing': dict(
        priority=11,
        serp_source='не снято',
        serp='Не снято. Для «ielts writing checker» ожидаемы глобальные AI-сервисы (сильная выдача); «multilevel writing», «cefr writing» — локальные учебные центры и Telegram.',
        serp_weakness='mixed',
        fit='(b) лучший AI-fit линзы: пресет «экзаменатор IELTS/CEFR» — разбор эссе по критериям и ориентировочный диапазон балла',
        build='/uz/ielts-writing-tekshirish/, /uz/cefr-multilevel-writing/ (лендинг + пресет чата + свои Task 2 темы и разборы структуры).',
        effort='S', honesty_risk='medium',
        honesty_note='Балл — ориентировочный, не официальный; не обещать «band 7».',
        caveat='Малый спрос (6 760; с головами cefr/multilevel 18 760), но прямой путь в платный чат.'),
    'olympiad': dict(
        priority=12,
        serp_source='не снято',
        serp='Не снято.',
        serp_weakness='mixed',
        fit='(c) свои олимпиадные задачи с полным решением по классам',
        build='/uz/olimpiada/matematika/ (и informatika) — задачи школьного и районного этапа, решения, таймер.',
        effort='M', honesty_risk='low', honesty_note='Нужен автор-предметник; задачи прошлых олимпиад — только со ссылкой и своим решением.',
        caveat='Очень сезонный: сентябрь–октябрь ×3,6–4,1, февраль ×1,1, остальное ×0,2–0,5.'),
}


def season_text(idx):
    if not idx:
        return 'нет ряда'
    s = sorted(idx.items(), key=lambda x: -x[1])
    hi = ', '.join(f"{k} ×{v}" for k, v in s[:3])
    lo = ', '.join(f"{k} ×{v}" for k, v in s[-2:])
    return f"пики: {hi}; провалы: {lo}"


clusters = []
for c in M['clusters']:
    card = CARDS[c['id']]
    r = RAMP[c['id']]
    top = [{'keyword': b['keyword'], 'volume': b['vol'], 'same_bucket_as': b['merged']} for b in c['buckets_core'][:14]]
    clusters.append({
        'id': c['id'], 'priority': card['priority'], 'name': c['name'],
        'top_keywords': top,
        'demand_month_ads_deduped': c['demand_ads_core'],
        'demand_month_floor': c['demand_floor_core'],
        'demand_month_upper_incl_heads': c['demand_upper_incl_heads'],
        'jump_shaped_keywords': [{'keyword': k, 'ads': v, 'oct_nov_2025_mean': f} for k, v, f in c['jump_keywords']],
        'heads_upper_bound_only': c['buckets_head'], 'suspicious_buckets': c['buckets_suspicious'],
        'excluded': c['excluded'],
        'seasonality_index': c['season_index'], 'seasonality': season_text(c['season_index']),
        'serp_source': card['serp_source'], 'serp': card['serp'], 'serp_weakness': card['serp_weakness'],
        'aio_discount_top3': c['aio_discount_top3'],
        'fit': card['fit'], 'build': card['build'], 'effort': card['effort'],
        'honesty_risk': card['honesty_risk'], 'honesty_note': card['honesty_note'], 'caveat': card['caveat'],
        'visits_day_pos6_ads': c['visits_pos6_ads'], 'visits_day_pos6_floor': c['visits_pos6_floor'],
        'visits_day_pos3_ads': c['visits_pos3_ads'], 'visits_day_pos3_floor': c['visits_pos3_floor'],
        'visits_day_pos3_ads_no_aio_discount': r['pos3_no_aio_ads'],
        'ramp': {'k1_month1_share': r['k1'], 'months_to_full_pos6_forecast': r['months_to_full_pos6'],
                 'month1_visits_ads_mid': r['m1_visits_ads_mid'], 'month1_visits_floor_mid': r['m1_visits_floor_mid'],
                 'weeks_to_5_visits_ads': r['weeks_to_5_ads'], 'weeks_to_5_visits_floor': r['weeks_to_5_floor'],
                 'weeks_to_10_visits_ads': r['weeks_to_10_ads'], 'weeks_to_10_visits_floor': r['weeks_to_10_floor']},
    })
clusters.sort(key=lambda x: x['priority'])
adj = M['adjacent'][0]
out = {
    'meta': {
        'lens': 'education-practice', 'date': '2026-10-25', 'location': 2860, 'language_of_report': 'ru',
        'model': 'visits/day = demand x CTR x AIO / 30 x 1.5; pos~6 CTR 0.613-1.105% (own curve, no extra AIO discount, as in demand-sizing); pos~3 CTR 3.593% x 0.533 (AIO r1) / 0.655 (AIO lower or not measured)',
        'dedupe': 'identical volume + identical 12-month series (vol>=100) = one Google Ads bucket',
        'floor': 'jump-shaped keyword (mean Jul-Sep 2026 / mean Oct-Nov 2025 >= 5, vol>=500) replaced by its Oct-Nov 2025 mean',
        'ramp_assumption': 'share of pos-6 forecast in month n = min(1, K1 x n^1.6); K1 0.04 articles (site calibration), 0.06 static collections on weak SERP, 0.08 interactive tools/quizzes on weak SERP (assumption)',
        'data_files': ['education-practice-data/ep_kw1_metrics.json', 'education-practice-data/ep_serp_top.json',
                       'education-practice-data/ep_model.json', 'education-practice-data/ep_ramp.json',
                       'education-practice-data/ep_research_note.txt'],
        'reused_measurements': ['l3-data/kw1_metrics.json', 'l3-data/kw2_metrics.json', 'roadmap-1000/data/kw3_metrics.json',
                                'roadmap-1000/data/kw4_metrics.json'],
        'credits': 'own estimate <=724 of 900 cap (metrics <=416, research ~288, SERP ~20); account 22672 -> 21784 incl. parallel lenses',
    },
    'summary': M['summary'],
    'clusters': clusters,
    'adjacent_outside_lens': [{
        'id': adj['id'], 'name': adj['name'], 'demand_month_ads_deduped': adj['demand_ads_core'],
        'top_keywords': [{'keyword': b['keyword'], 'volume': b['vol'], 'same_bucket_as': b['merged']} for b in adj['buckets_core']],
        'visits_day_pos6_ads': adj['visits_pos6_ads'], 'visits_day_pos3_ads': adj['visits_pos3_ads'],
        'note': 'стабильный спрос; SERP не снят; L-объём (картинки ситуаций), только свои вопросы по ПДД — копия официального банка = «copied archive»'},
        {'id': 'summa_propisyu', 'name': 'Сумма прописью (RU, документы)', 'demand_month_ads_deduped': 12100,
         'note': 'стабильно 12 100–14 800; детерминированный инструмент S; вне школьной линзы'}],
    'excluded_in_lens': [
        {'keyword': 'uzbmb', 'volume': 135000, 'why': 'навигация к агентству'},
        {'keyword': 'dtm', 'volume': 27100, 'why': 'навигация'}, {'keyword': 'abituriyent', 'volume': 27100, 'why': 'навигация (июль–август)'},
        {'keyword': 'bsb', 'volume': 27100, 'why': 'спрос на ответы суммативных работ (BSB/ChSB)'},
        {'keyword': 'dtm test javoblari', 'volume': 18100, 'why': 'утечки ключей'}, {'keyword': 'test javoblari', 'volume': 8100, 'why': 'ответы'},
        {'keyword': "imlo lug'ati", 'volume': 18100, 'why': 'словарь, навигация к imlo.uz'},
        {'keyword': 'kimyo masalalar', 'volume': 90500, 'why': 'аномальная корзина 20 → 165 000'},
        {'keyword': 'ona tili testlar', 'volume': 110000, 'why': 'аномальная корзина (у «ona tili test» 1 600) — только верхняя граница'},
        {'keyword': 'ielts', 'volume': 27100, 'why': 'широкая голова/навигация'},
        {'keyword': 'гдз', 'volume': 5400, 'why': 'архивы готовых ответов'},
        {'keyword': 'prezident maktabi', 'volume': 4400, 'why': 'навигация/новости'}],
}
json.dump(out, open(os.path.join(HERE, '..', 'education-practice.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('ok', len(clusters))
