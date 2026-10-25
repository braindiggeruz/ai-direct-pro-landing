# -*- coding: utf-8 -*-
# Builds ../language-learning.json and ../language-learning.md from ll_clusters_out.json + qualitative notes.
# Run: py -3 -I build_outputs.py   (from this folder, after ll_clusters.py)
import json, os, re, sys
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
d = json.load(open(os.path.join(HERE, 'll_clusters_out.json'), encoding='utf-8'))
by = {c['id']: c for c in d['clusters']}

SERP = {  # get_serp_results 2026-10-25, loc 2860, hl ru, desktop, depth 10 (organic top-8/9)
    "irregular verbs": "AIO r1; esl-lounge, athabascau.ca, pearson PDF, helpingwithverbs, woodwardenglish, YouTube, engvid PDF, scribd",
    "noto'g'ri fe'llar jadvali": "AIO r1; scribd #1 #2 #4 #8, insho.uz #3, Play-приложение #5, studocu #6, ok.ru #7, soff.uz (платный файл) #9",
    "present simple": "AIO r1, картинки, PAA; YouTube #1 #3 #6, blog.bukischool-kz #2, slideshare #4, pinterest #5",
    "pronouns": "AIO r1; merriam-webster, wordvice, en.wikipedia, British Council Kids, BBC Bitesize, wsu.edu, perfect-english-grammar",
    "ielts calculator": "AIO r5; leapscholar, ielts.idp.com, aehelp, edify.pk, facebook-видео, lumetest, gurully, uptodown (APK)",
    "cefr ballari": "AIO r4; uzbmb.uz PDF, testmakon.uz, world.uz, britishcouncil.uz, hasanboy.uz (2021), oliygoh.uz (2023), grantlar.uz (2018), my.gov.uz",
    "multilevel mock test": "AIO r2; studocu #1, YouTube #2, scribd #3 #4 #5 #6 #7 #8",
    "ielts writing task 1": "AIO r2; ielts.idp.com, kanan.co, ielts.org, eng.skillbox.ru, ieltsmaterial, global-exam, ieltsbuddy, ielts.com.au, wordwall",
    "английский алфавит": "AIO r1; ru.wikipedia #1, lingust.ru, yandex-видео, eng.skillbox.ru, pinterest, cambridge.ua, puzzle-english",
    "arab alifbosi": "видео r1, AIO r2; scribd #1 #5, YouTube #2 #3 #4 #7, arabic.uz PDF #6",
    "дни недели на английском": "AIO r1, картинки; online-london (блог), YouTube Shorts, tetran.ru, crazylink, rutube, YouTube, личный блог",
    "узбекский алфавит": "AIO нет; картинки, Shorts, видео; zamin.uz (новость о реформе 2026), livejournal (2013), pinterest, yep.uz (2018), YouTube, kci.go.kr",
    "turkcha so'zlar": "видео r1, AIO r2; lingvanex (переводчик), gulhide.tr (лугат), YouTube #3 #7 #8, scribd #4 #5, lingohut",
    "yapon tilini o'rganish": "видео r1; prep.uz (2020), YouTube #2 #6 #8, uz.wikipedia, talkpal.ai (AI-репетитор), jac-skill, tcj-education; AIO r10",
    "topik test": "AIO r3; topikguide #1 #2, thinkbigtopik, Play, onlinetestpad, learning-korean, topik.go.kr, scribd",
    "rus tilini o'rganish": "Shorts r1, AIO r3; YouTube #1 #2 #3 #5 #7, Play #4 #6, yandex-видео",
}

Q = {
 'english_tenses': dict(rank=1,
   serp_q=['present simple'], serp_weakness='weak',
   serp_note='Голова — видео, слайдшеры и пинтерест; текстовой страницы на узбекском в топ-6 нет. AIO на 1-м месте.',
   fit='(c) оригинальные объяснения + (a) детерминированный генератор упражнений (подстановка формы, проверка ответа) + (b) роль «ingliz tili o‘qituvchisi» в чате («объясни мою ошибку»)',
   build='Хаб /uz/ingliz-tili-zamonlari/ + 12 страниц /uz/ingliz-tili-zamonlari/present-simple/ … future-perfect-continuous/; RU-зеркало /ru/vremena-angliyskogo-yazyka/<time>/. На каждой: формула (+/−/?), маркеры времени, 10 примеров EN–UZ–RU, генератор 10 заданий с проверкой, кнопка «Chatda tushuntirish». Английские головы (present simple 12 100) берёт UZ-страница с английским H2.',
   effort='M', honesty_risk='low',
   ramp_weeks='8–14', ramp_note='статьи; K≈0,04 в 1-й месяц, генератор упражнений ускоряет поведенческие сигналы'),
 'irregular_verbs': dict(rank=2,
   serp_q=["irregular verbs", "noto'g'ri fe'llar jadvali"], serp_weakness='weak',
   serp_note='По UZ-запросу топ — Scribd ×4, Studocu, ok.ru, Play-приложение, платный файл soff.uz; живая страница одна (insho.uz #3). По английскому — ESL-сайты и PDF, интерактивного тренажёра нет.',
   fit='(a) детерминированный инструмент: таблица V1–V2–V3 с поиском и переводом UZ/RU + тренажёр «скрыть колонку» + печать (c)',
   build='/uz/notogri-fellar/ (H1 «Noto‘g‘ri fe’llar jadvali — irregular verbs V1 V2 V3») и /ru/nepravilnye-glagoly/. 150–200 глаголов, фильтр «топ-50/100», режим теста (10 случайных глаголов, ввод V2/V3, счёт), версия для печати вместо PDF.',
   effort='S', honesty_risk='low',
   ramp_weeks='4–8', ramp_note='инструмент против Scribd/PDF — быстрый разгон'),
 'alphabets': dict(rank=3,
   serp_q=['английский алфавит', 'arab alifbosi'], serp_weakness='mixed',
   serp_note='EN: Википедия #1 и блоги школ (lingust, skillbox, puzzle-english), узбекской страницы нет. Арабский: Scribd и YouTube, живых страниц нет.',
   fit='(c) таблицы букв (название, транскрипция IPA + узбекское/русское приближение, пример слова) + (a) карточки-квиз «узнай букву». Аудио нет — это честно указать (продукт не синтезирует голос)',
   build='/uz/alifbo/ingliz/, /uz/alifbo/rus/, /uz/alifbo/arab/, /uz/alifbo/koreys/ (hangul), /uz/alifbo/yapon/ (hiragana+katakana), /uz/alifbo/turk/; RU: /ru/angliyskiy-alfavit/, /ru/arabskiy-alfavit/, /ru/koreyskiy-alfavit/. Арабский — только лингвистика (буквы, формы, огласовки), без религиозных толкований.',
   effort='M', honesty_risk='low',
   ramp_weeks='6–10', ramp_note='статичные страницы на слабой выдаче'),
 'ielts_cefr_calculator': dict(rank=4,
   serp_q=['ielts calculator', 'cefr ballari'], serp_weakness='mixed',
   serp_note='IELTS: зарубежные калькуляторы (leapscholar, IDP, aehelp, edify.pk), есть facebook-видео и APK; AIO только на 5-м месте. CEFR/Multilevel: PDF uzbmb, тонкие узбекские блоги 2018–2023 и my.gov.uz — калькулятора нет вообще.',
   fit='(a) детерминированный калькулятор: IELTS — сырые баллы Listening/Reading → band по опубликованным таблицам + официальное правило округления overall; Multilevel/CEFR — 4 навыка → балл и уровень B1/B2/C1 по шкале uzbmb',
   build='/uz/ielts-ball-kalkulyator/ и /uz/cefr-multilevel-ball-hisoblash/; RU: /ru/kalkulyator-ballov-ielts/. Таблицы перевода сырых баллов помечены «taxminiy / ориентировочно»; ссылка на источник шкалы (uzbmb PDF). Ниже — «Qaysi bo‘limni ko‘tarish kerak» (что подтянуть до целевого балла).',
   effort='S', honesty_risk='low',
   ramp_weeks='4–8', ramp_note='инструмент; для Multilevel конкурентов-инструментов нет'),
 'multilevel_cefr_practice': dict(rank=5,
   serp_q=['multilevel mock test'], serp_weakness='weak',
   serp_note='Самая слабая выдача линзы: Studocu #1, YouTube, затем шесть документов Scribd подряд. Живого тренажёра нет.',
   fit='(c) оригинальные задания Speaking (part 1/2/3) и Writing (task 1 письмо, task 2 эссе) + (a) таймер и счётчик слов + (b) роль «Multilevel examiner»: разбор написанного ответа по критериям. Listening не обслуживаем (нужно аудио) — вес 0',
   build='Хаб /uz/multilevel-mock-test/ → /speaking/ (банк ≥100 оригинальных вопросов, таймер 30/60/120 с, ответ текстом → AI-разбор), /writing/ (темы писем и эссе, лимит слов, AI-разбор), /reading/ (оригинальные тексты с вопросами — этап 2) + гид /uz/cefr-multilevel-nima/ (формат, шкала, уровни). Нельзя: реальные экзаменационные материалы и «ответы».',
   effort='M', honesty_risk='medium',
   ramp_weeks='6–10', ramp_note='speaking/writing — первыми; reading — по мере наполнения'),
 'english_level_test': dict(rank=6,
   serp_q=[], serp_weakness='mixed',
   serp_note='SERP не снят (лимит кредитов). L3 (24.10) отклонил «ingliz tili test» как «банки тестов» — по правилам этой задачи оригинальный тест с объяснениями разрешён. Заголовок предварительный.',
   fit='(a) детерминированный тест уровня: 40–50 оригинальных заданий (грамматика, лексика, чтение), подсчёт и оценка A1–C1 + (c) разбор каждой ошибки + ссылки на страницы времён/грамматики',
   build='/uz/ingliz-tili-darajasini-aniqlash-testi/ (H1 «Ingliz tili test: darajangizni 15 daqiqada aniqlang») и /ru/test-na-uroven-angliyskogo/ + /ru/urovni-angliyskogo/ (таблица A1–C2 ↔ IELTS ↔ Multilevel).',
   effort='M', honesty_risk='low',
   ramp_weeks='8–12', ramp_note='SERP не проверен; «ingliz tili test» сильно растёт и пикует в мае'),
 'topic_vocabulary': dict(rank=7,
   serp_q=['дни недели на английском'], serp_weakness='weak',
   serp_note='Блоги школ, YouTube/Rutube, личные сайты; AIO на 1-м месте отвечает на простые запросы сам («Monday…») — CTR будет ниже кривой.',
   fit='(c) тематические списки EN–UZ–RU с транскрипцией и примером + (a) карточки и мини-тест на каждой странице',
   build='/uz/inglizcha-sozlar/ хаб + 30–40 тем: hafta-kunlari, oylar, ranglar, mevalar, sabzavotlar, sonlar, kasblar, tana-azolari, fasllar, hayvonlar, kiyimlar, salomlashish, oila…; RU-зеркала /ru/angliyskie-slova/dni-nedeli/, mesyatsy/, tsifry/, privet-i-privetstviya/… Плюс тексты «My family / About myself» как шаблоны с плейсхолдерами.',
   effort='M', honesty_risk='low',
   ramp_weeks='6–12', ramp_note='много мелких страниц; AIO съедает часть кликов'),
 'second_languages_starter': dict(rank=8,
   serp_q=["turkcha so'zlar", "yapon tilini o'rganish"], serp_weakness='weak',
   serp_note='Переводчик lingvanex, лугат gulhide.tr, Scribd, YouTube, старый блог prep.uz (2020); уже есть AI-репетитор talkpal.ai — ниша для AI-роли подтверждена.',
   fit='(c) стартовые страницы: алфавит/письменность, 300–500 частотных слов и фраз с переводом + (b) роль «til o‘qituvchisi» (выбор языка) в чате',
   build='/uz/turk-tili/ (turkcha so‘zlar va gaplar), /uz/yapon-tili/ (hiragana + boshlang‘ich), /uz/xitoy-tili/ (pinyin + HSK 1 so‘zlari), /uz/arab-tili/ (arabcha so‘zlar), /uz/nemis-tili/ (der/die/das + A1). Списки — только после проверки носителем; словари (lug‘at) не делаем — это ветка переводчика.',
   effort='L', honesty_risk='medium',
   ramp_weeks='8–14', ramp_note='рост головы подозрительный (×6 за год) — см. §4'),
 'english_grammar_topics': dict(rank=9,
   serp_q=['pronouns'], serp_weakness='mixed',
   serp_note='«pronouns» — Merriam-Webster, Wikipedia, BBC, British Council: сильно. Остальные темы не снимались; по аналогии с «present simple» RU/UZ-выдачи слабее.',
   fit='(c) объяснения + (a) генератор упражнений + (b) AI-разбор, как у времён',
   build='/uz/ingliz-tili-grammatikasi/ хаб + ~25 тем: passive-voice, conditionals (0/1/2/3/mixed), reported-speech, modal-verbs, there-is-there-are, some-any-much-many, comparatives, prepositions (time/place), pronouns, articles, gerund-infinitive, relative-clauses, question-tags, countable-uncountable, phrasal-verbs; RU-зеркала по топ-10 темам.',
   effort='L', honesty_risk='low',
   ramp_weeks='10–16', ramp_note='сильные англоязычные головы растут медленно, начинать с тем, где выдача видео/блоги'),
 'uzbek_for_russian_speakers': dict(rank=10,
   serp_q=['узбекский алфавит'], serp_weakness='weak',
   serp_note='Новость zamin.uz о реформе, LiveJournal 2013, Pinterest, yep.uz 2018 — живой справочной страницы нет. Реформа алфавита 2026 (28 букв) даёт свежий повод.',
   fit='(c) алфавит латиница ↔ кириллица с отметкой изменений реформы + разговорник; связка с конвертером Cyrillic↔Latin и переводчиком RU↔UZ',
   build='/ru/uzbekskiy-alfavit/ (таблица лат/кир, произношение для русскоязычных, блок «что меняет реформа» с датой и источником, виджет конвертера), /ru/uzbekskiy-razgovornik/ (привет, спасибо, как дела, числа, дни недели, месяцы — с латиницей и кириллицей), /ru/uzbekskiy-yazyk-dlya-nachinayushchih/ + роль чата «учитель узбекского».',
   effort='S', honesty_risk='low',
   ramp_weeks='4–8', ramp_note='очень слабая выдача, тематически ближе всего к сайту'),
 'topik_korean': dict(rank=11,
   serp_q=['topik test'], serp_weakness='mixed',
   serp_note='Нишевые зарубежные сайты (topikguide, thinkbigtopik, learning-korean), Play, onlinetestpad, официальный topik.go.kr; узбекских страниц нет. «topik»/«eps topik» частично навигационные (регистрация, результаты) — вес 0,5.',
   fit='(c) оригинальные задания чтения и лексики формата EPS-TOPIK с объяснениями на узбекском + (a) тест с подсчётом; аудирование не обслуживаем',
   build='/uz/eps-topik-test/ (оригинальные вопросы, разбор, таймер), /uz/topik-test/, /uz/koreys-tili/ (hangul → /uz/alifbo/koreys/, 300 слов для работы). Официальные прошлые варианты не копировать (авторские права NIIED).',
   effort='L', honesty_risk='medium',
   ramp_weeks='10–16', ramp_note='контент на корейском требует проверки носителем'),
 'ielts_writing_speaking': dict(rank=12,
   serp_q=['ielts writing task 1'], serp_weakness='strong',
   serp_note='IDP, ielts.org, ielts.com.au, kanan, ieltsmaterial, ieltsbuddy, skillbox — сильные бренды. Шанс есть только у подзапросов-инструментов («ielts writing checker» 720, «ielts essay checker» 210).',
   fit='(b) роль «IELTS examiner» в чате: оценка эссе/ответа по 4 критериям с пометкой «неофициально» + (c) банк тем Speaking/Writing и шаблоны структуры',
   build='/uz/ielts-writing-checker/ (вставить эссе → AI-разбор по Task Response / Coherence / Lexical / Grammar, ориентировочный band) и /uz/ielts-speaking-savollari/ (банк тем part 1/2/3, ответ текстом → AI-разбор). Без «официального балла».',
   effort='M', honesty_risk='medium',
   ramp_weeks='16–26+', ramp_note='сильная выдача; топ-3 по головам маловероятен'),
}
BELOW_CUT = ['russian_for_uzbeks']
OVERLAP = {  # parallel lens education-practice.md (same folder, 2026-10-25) covers part of the same demand
    'english_tenses': 'полностью — их кластер «Ingliz tili grammatikasi o‘zbekcha + daraja testi»',
    'english_grammar_topics': 'полностью — тот же кластер education-practice',
    'english_level_test': 'полностью — «daraja testi» в том же кластере; «ingliz tili test» есть и в их «Fanlar bo‘yicha amaliy testlar»',
    'irregular_verbs': 'частично — «irregular verbs» упомянут в их грамматическом кластере',
    'ielts_writing_speaking': 'writing — полностью («IELTS / CEFR / Multilevel writing (AI) + mock»); speaking — только здесь',
    'multilevel_cefr_practice': 'writing и mock — частично (тот же кластер); speaking и reading — только здесь',
    'ielts_cefr_calculator': 'частично — у них «ball kalkulyatori» для DTM/Milliy sertifikat; IELTS/Multilevel-калькулятор — только здесь',
}

def n(x):
    return f"{x:,.0f}".replace(',', ' ')
def f1(x):
    return f"{x:.1f}".replace('.', ',')

def kw_str(c, k=8):
    parts = []
    for b in c['buckets'][:k]:
        kws = ' = '.join(b['keywords'])
        w = '' if b['weight'] == 1 else f" (вес {str(b['weight']).replace('.', ',')})"
        parts.append(f"{kws} {n(b['volume'])}{w}")
    return '; '.join(parts)

def season_str(c):
    s = c['seasonality']
    if not s:
        return 'нет ряда'
    return (f"пик {s['peak']} (×{str(s['peak_index']).replace('.', ',')}), минимум {s['low']} "
            f"(×{str(s['low_index']).replace('.', ',')}), сентябрь-2026 ×{str(s['last_index']).replace('.', ',')} к среднему")

clusters_json = []
for cid, q in sorted(Q.items(), key=lambda kv: kv[1]['rank']):
    c = by[cid]
    serp_txt = ' | '.join(f"«{k}»: {SERP[k]}" for k in q['serp_q'])
    clusters_json.append(dict(
        rank=q['rank'], id=cid, name=c['name'],
        keywords=kw_str(c, 10),
        top_keywords=[dict(keywords=b['keywords'], volume=b['volume'], weight=b['weight'], source=b['source']) for b in c['buckets'][:15]],
        demand_month=c['demand_month'], demand_raw_dedup=c['demand_raw_dedup'],
        seasonality=season_str(c),
        serp=(serp_txt + ' — ' + q['serp_note']) if serp_txt else q['serp_note'], serp_weakness=q['serp_weakness'],
        aio_factor_top3=c['aio_factor'], aio_note=c['aio_note'],
        fit=q['fit'], build=q['build'], effort=q['effort'], honesty_risk=q['honesty_risk'],
        visits_day_pos6=f"{f1(c['visits_day_pos6'][0])}–{f1(c['visits_day_pos6'][1])}",
        visits_day_pos3=f1(c['visits_day_pos3']),
        ramp_weeks=q['ramp_weeks'], ramp_note=q['ramp_note'],
        excluded=c['excluded'], null_keywords=c['null_keywords'], overlap_with_education_practice=OVERLAP.get(cid, 'нет')))

tot_d = sum(by[k]['demand_month'] for k in Q)
tot6 = [sum(by[k]['visits_day_pos6'][i] for k in Q) for i in (0, 1)]
tot3 = sum(by[k]['visits_day_pos3'] for k in Q)
noaio3 = tot_d * 0.0359 / 30 * 1.5

json.dump(dict(
    lens='language-learning', date='2026-10-25', market='Google, location 2860 (Uzbekistan)',
    model=d['model'],
    totals=dict(demand_month=tot_d, visits_day_pos6=[round(tot6[0]), round(tot6[1])], visits_day_pos3=round(tot3),
                visits_day_pos3_without_aio_discount=round(noaio3)),
    credits=dict(cap=700, whoami_before=22672, whoami_after=21772, delta_upper_bound=900,
                 own_estimate='≈450–500 (research_keywords 2 сида ≈208, get_keyword_metrics ×2 ≈208, get_serp_results 4 вызова × 4 запроса depth 10 ≈40–80); остальное — параллельные линзы на том же аккаунте',
                 steps=[['start', 22672], ['after research_keywords', 22464], ['after metrics #1 (419 kw)', 22360], ['after metrics #2 (284 kw)', 22152], ['after 4× serp (16 q)', 21772]]),
    clusters=clusters_json,
    unique_to_this_lens=dict(ids=[k for k in Q if k not in OVERLAP],
        demand_month=sum(by[k]['demand_month'] for k in Q if k not in OVERLAP),
        visits_day_pos6=[round(sum(by[k]['visits_day_pos6'][i] for k in Q if k not in OVERLAP)) for i in (0, 1)],
        visits_day_pos3=round(sum(by[k]['visits_day_pos3'] for k in Q if k not in OVERLAP)),
        note='без пересечений с education-practice: алфавиты, тематическая лексика, вторые языки, узбекский для русскоязычных, TOPIK'),
    below_cut=[dict(id=k, name=by[k]['name'], demand_month=by[k]['demand_month'], keywords=kw_str(by[k], 8),
                    visits_day_pos6=by[k]['visits_day_pos6'], visits_day_pos3=by[k]['visits_day_pos3'],
                    serp='«rus tilini o\'rganish»: ' + SERP["rus tilini o'rganish"],
                    why='выдача — видео (YouTube ×5) и приложения: текстовая страница берёт мало кликов; спрос ≈9,8 тыс.') for k in BELOW_CUT],
    serp_raw=SERP,
), open(os.path.join(OUT, 'language-learning.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ------------------------------------------------------------------ markdown
L = []
A = L.append
A('# Линза «Изучение языков»: какие кластеры добавить на gptbot.uz')
A('')
A('Дата: 2026-10-25. Рынок: Google, Узбекистан (location 2860). Машиночитаемая версия: `language-learning.json`. Расчёт: `language-learning-data/ll_clusters.py` → `build_outputs.py` (`py -3 -I`). Сырые данные: `language-learning-data/ll_kw_metrics.json`, `ll_kw_metrics2.json`, таблицы `ll_table.txt`, `ll_table2.txt`.')
A('')
A('## 0. Коротко')
A('')
A(f"1. **Языковая тема — большой пласт спроса, но 1 000–2 000 визитов в день одна не даёт.** 12 кластеров ниже — это ≈{n(tot_d)} запросов в месяц после дедупликации и весов. На позиции ~6 это ≈{n(tot6[0])}–{n(tot6[1])} визитов в день, в топ-3 — ≈{n(tot3)} (с AIO-дисконтом; без него ≈{n(noaio3)}). Прошлая оценка всех AI-кластеров в топ-3 — ≈650–1 100 визитов в день, так что эта линза поднимает потолок ещё на ≈35–60%.")
A('2. **Быстрее всего окупятся три инструмента на слабой выдаче:** таблица-тренажёр неправильных глаголов (24 тыс./мес; по UZ-запросу в топе Scribd ×4), калькулятор IELTS + Multilevel/CEFR (≈20 тыс.; для Multilevel калькулятора в выдаче нет вообще) и узбекский алфавит для русскоязычных (≈10 тыс.; конкуренты — новость, LiveJournal 2013 и Pinterest). Каждый — S по трудозатратам, первый трафик через 4–8 недель.')
A('3. **Самый большой объём — грамматика английского:** времена (≈60 тыс.) и темы грамматики (≈52 тыс.). По «present simple» (12 100) в топе YouTube, слайдшер и пинтерест, текстовой страницы на узбекском нет. Но это статьи, разгон 8–16 недель, и AIO стоит на 1-м месте.')
A('4. **Самая слабая выдача — Multilevel mock test:** Studocu #1, YouTube, затем шесть документов Scribd подряд. Оригинальные задания Speaking/Writing с AI-разбором в чате — прямое попадание в продукт. Listening не обслуживаем (нужно аудио), в спрос он не включён.')
A('5. **Предупреждение о данных.** У многих UZ-латинских запросов ряд Google Ads вырос в 5–10 раз с конца 2025 года: «ingliz tili test» 1 900 → 22 200, «turkcha so‘zlar» 70 → 18 100, «yapon tilini o‘rganish» 90 → 27 100 (а у L3-ключа «imlo lug‘ati» 6 600 → 22 200). Это либо реальный рост, либо смена того, как Google Ads собирает узбекские запросы в корзины. Я везде беру среднее за 12 месяцев: если рост реален, текущий спрос кластеров 6 и 8 в 1,2–1,7 раза выше моей оценки; если это артефакт, честная нижняя граница — уровень осени 2025, в 3–6 раз ниже.')
uq = [k for k in Q if k not in OVERLAP]
uq_d = sum(by[k]['demand_month'] for k in uq); uq6 = [sum(by[k]['visits_day_pos6'][i] for k in uq) for i in (0, 1)]; uq3 = sum(by[k]['visits_day_pos3'] for k in uq)
A(f"6. **Пересечение с параллельной линзой `education-practice.md`.** Грамматика, времена, тест уровня и IELTS/Multilevel writing там тоже посчитаны — при сложении линз их нельзя суммировать дважды. Без пересечений эта линза приносит кластеры 3, 7, 8, 10, 11: ≈{n(uq_d)} запросов в месяц, ≈{n(uq6[0])}–{n(uq6[1])} визитов в день на поз. ~6 и ≈{n(uq3)} в топ-3. Плюс Speaking/Reading-часть Multilevel и IELTS/Multilevel-калькулятор, которых у соседей нет.")
A('')
A('## 1. Метод')
A('')
A('- **Спрос:** Google Ads через OpenSEO, `search_volume` = среднее за 12 мес. (2025-10…2026-09). Новые замеры: `get_keyword_metrics` ×2 (419 + 284 ключа), `research_keywords` ×1 (сиды «ingliz tili», «английский язык»; по UZ вернулось 26 строк, по RU 216 — почти всё ≤50). Повторно использованы без покупки: `ingliz tili test`, `ingliz tili grammatika`, `inglizcha so‘zlar`, `ingliz tili mashqlar` из `2026-10-24-growth-audit/l3-data/kw1/kw2_metrics.json`.')
A('- **Дедупликация:** одинаковый объём + одинаковый немонотонный ряд (объём ≥100) = одна корзина (так слились, например, «irregular verbs list» = «list of irregular verbs», «reported speech» = «indirect speech», «eps topik» = «eps-topik», «grammar checker» = «grammar check», «question tags» = «tag questions»). Строки `research_keywords` без ряда сливаются при равном объёме и письме («уровни английского языка» = «уровни английский язык»).')
A('- **Веса:** 0,5 для частично навигационных или неоднозначных голов («pronouns», «grammar», «ielts score», «cefr», «multilevel», «topik», «eps topik», «vocabulary», «hafta kunlari», «как будет на узбекском» и т. п.), 0 для запросов, которые продукт не обслуживает (Listening). Совсем исключены: «milliy sertifikat» 18 100 (навигация к результатам uzbmb), «ielts» 27 100, «articles» 4 400 (неоднозначно), «alphabet» 3 600, словари RU↔UZ и «X o‘zbekcha lug‘at» (владеет ветка переводчика), школьные «rus tili 5/7 sinf» (ищут учебник/ответы).')
A('- **Визиты в день** = спрос × CTR / 30 × 1,5. CTR из кривой сайта: поз. ~6 — 0,61–1,10% (без доп. дисконта, как в `demand-sizing`); поз. ~3 — 3,59% × 0,533 (AIO на 1-м месте) или × 0,655 (AIO ниже или выдача не снята).')
A('- **Разгон:** новые страницы берут ≈4% прогноза в 1-й месяц (K≈0,04). «Первый заметный трафик» ниже = ≈25% от прогноза поз. ~6. Инструменты на слабой выдаче разгоняются быстрее статей.')
A('- **SERP:** 4 вызова `get_serp_results` (16 запросов, hl=ru, desktop, depth 10), таблица — §3.')
A('')
A('## 2. Кластеры по приоритету')
A('')
A('| # | Кластер | Спрос/мес (дедуп) | Выдача | Тип | Усилия | Риск честности | Визитов/день поз. ~6 | поз. ~3 | Разгон, нед. |')
A('|---:|---|---:|---|---|---|---|---:|---:|---|')
for cj in clusters_json:
    typ = '+'.join(sorted(set(re.findall(r'\(([abc])\)', cj['fit']))))
    A(f"| {cj['rank']} | {cj['name']} | {n(cj['demand_month'])} | {cj['serp_weakness']} | {typ} | {cj['effort']} | {cj['honesty_risk']} | {cj['visits_day_pos6']} | {cj['visits_day_pos3']} | {cj['ramp_weeks']} |")
A(f"| | **Итого 12 кластеров** | **{n(tot_d)}** | | | | | **{n(tot6[0])}–{n(tot6[1])}** | **{n(tot3)}** | |")
A('')
for cj in clusters_json:
    A(f"### {cj['rank']}. {cj['name']}")
    A('')
    A(f"- **Ключи (объём/мес):** {cj['keywords']}.")
    A(f"- **Спрос:** {n(cj['demand_month'])}/мес после дедупликации и весов (без весов {n(cj['demand_raw_dedup'])}). Сезонность: {cj['seasonality']}.")
    if cj['excluded']:
        A('- **Не посчитано:** ' + '; '.join(f"«{k}» — {v}" for k, v in cj['excluded'].items()) + '.')
    A(f"- **Выдача ({cj['serp_weakness']}):** {cj['serp']}")
    A(f"- **Что умеет продукт:** {cj['fit']}.")
    A(f"- **Что построить:** {cj['build']}")
    A(f"- **Усилия / риск:** {cj['effort']} / {cj['honesty_risk']}. **Визиты:** поз. ~6 — {cj['visits_day_pos6']} в день; поз. ~3 — {cj['visits_day_pos3']} в день (AIO ×{str(cj['aio_factor_top3']).replace('.', ',')}: {cj['aio_note']}).")
    A(f"- **Разгон:** {cj['ramp_weeks']} недель до первого заметного трафика ({cj['ramp_note']}).")
    if cj['overlap_with_education_practice'] != 'нет':
        A(f"- **Пересечение с education-practice:** {cj['overlap_with_education_practice']}.")
    if cj['null_keywords']:
        A(f"- **Нет корзины в Google Ads (null):** {', '.join(cj['null_keywords'][:12])}{' …' if len(cj['null_keywords']) > 12 else ''}.")
    A('')
A('### Ниже отсечки')
A('')
for b in BELOW_CUT:
    c = by[b]
    A(f"- **{c['name']}** — {n(c['demand_month'])}/мес ({kw_str(c, 6)}). Поз. ~6: {f1(c['visits_day_pos6'][0])}–{f1(c['visits_day_pos6'][1])} в день, поз. ~3: {f1(c['visits_day_pos3'])}. Выдача по «rus tilini o‘rganish»: YouTube ×5, Play ×2 — запрос видео-интентный, текстовая страница возьмёт мало. Имеет смысл как продолжение роли «o‘qituvchi» после кластера 10.")
A('- **Смежное, но не моя линза:** «inglizcha statuslar» 2 400 (растёт), «inglizcha gaplar» 1 600, «hikmatli so‘zlar» — это тексты/поздравления; «grammar checker» 1 900 посчитан в кластере 12 с весом 0,5 — полноценный «проверщик текста» лучше оценивать в линзе текстовых инструментов.')
A('')
A('## 3. Снятые выдачи (2026-10-25, hl=ru, desktop, топ-10)')
A('')
A('| Запрос | Кто в топе | Слабые сигналы |')
A('|---|---|---|')
WEAK = {
    "irregular verbs": 'PDF ×2, Scribd, YouTube; нет тренажёра',
    "noto'g'ri fe'llar jadvali": 'Scribd ×4, Studocu, ok.ru, платный файл',
    "present simple": 'YouTube ×3, slideshare, pinterest',
    "pronouns": '— (сильные словари/BBC)',
    "ielts calculator": 'facebook-видео, APK; зарубежные мелкие тулзы',
    "cefr ballari": 'PDF, блоги 2018–2023',
    "multilevel mock test": 'Scribd ×6, Studocu',
    "ielts writing task 1": '— (сильные бренды)',
    "английский алфавит": 'pinterest, yandex-видео',
    "arab alifbosi": 'Scribd ×2, YouTube ×4, PDF',
    "дни недели на английском": 'Shorts, rutube, личные блоги',
    "узбекский алфавит": 'LiveJournal 2013, pinterest, yep.uz 2018',
    "turkcha so'zlar": 'Scribd ×2, YouTube ×3',
    "yapon tilini o'rganish": 'YouTube ×3, блог 2020',
    "topik test": 'Scribd, Play, onlinetestpad',
    "rus tilini o'rganish": 'видео-интент (YouTube ×5)',
}
for k, v in SERP.items():
    A(f"| {k} | {v} | {WEAK.get(k, '')} |")
A('')
A('AI Overview найден в 14 из 16 выдач (нет в «узбекский алфавит»; в «yapon tilini o‘rganish» — только на 10-м месте).')
A('')
A('## 4. Риски и допущения')
A('')
A('- **Позиция не гарантирована.** У сайта ≈8 доменов-доноров. Языковая тема для него новая: хаб `/uz/ingliz-tili/` надо связать с чатом (роль «o‘qituvchi» уже есть — `src/gpt-chat/roles.ts:16,25`) и со школьными гайдами, иначе тематического веса не будет.')
A('- **Рост UZ-латинских рядов** (см. §0 п. 5) сильнее всего затрагивает кластеры 6 («ingliz tili test») и 8 (turk/yapon/xitoy/arab), слабее — отдельные UZ-ключи кластера 7 («inglizcha so‘zlar»). Поэтому их место в приоритете держится на слабой выдаче, а не на объёме; перед большой контентной работой по кластеру 8 стоит дождаться ещё 2–3 месяцев ряда.')
A('- **AIO на простых вопросах** («дни недели на английском», «английский алфавит») отвечает сам; CTR там, вероятно, ниже кривой сайта. Интерактив (квиз, карточки, генератор) — единственный аргумент кликнуть.')
A('- **Честность.** Только оригинальные задания; никаких реальных вариантов экзаменов, «javoblar», копий Scribd/учебников. AI-оценки (IELTS band, Multilevel) — с пометкой «taxminiy, rasmiy emas». Таблицы перевода сырых баллов IELTS — с источником и пометкой «ориентировочно». Аудио продукт не делает — в Listening не заходим. Арабский — только алфавит и лексика, без религиозных толкований.')
A('- **Пересечения с другими ветками.** Словари RU↔UZ и «X o‘zbekcha lug‘at» — у переводчика; «как будет на узбекском» отдан с весом 0,5 разговорнику, но может уйти на страницу переводчика. Для новых страниц нужны записи в `intent-manifest` и, по L3, ревизия защищённой главной `/`.')
A('- **Кредиты OpenSEO.** Лимит линзы — 700. `whoami`: 22 672 → 21 772 (−900). Это верхняя граница: на том же аккаунте одновременно работали параллельные линзы. Например, 4 SERP-вызова (16 запросов, depth 10) по прайсу стоят ≈40–80, а баланс за это время упал на 380. Собственная оценка — ≈450–500. Когда я увидел расхождение, остановил платные вызовы, поэтому SERP для «ingliz tili test» не снят.')
open(os.path.join(OUT, 'language-learning.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('ok', tot_d, [round(x) for x in tot6], round(tot3), round(noaio3))
