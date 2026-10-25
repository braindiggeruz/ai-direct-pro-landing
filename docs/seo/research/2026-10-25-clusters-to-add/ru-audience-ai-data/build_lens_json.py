# -*- coding: utf-8 -*-
"""Builds ../ru-audience-ai.json from computed.json + the qualitative judgement below.
Run: py -3 -I build_lens_json.py  (from this folder, after ru_audience_ai.py)."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
comp = json.load(open(os.path.join(HERE, "computed.json"), encoding="utf-8"))
C = {c["id"]: c for c in comp["clusters"]}

Q = {
 "translator_en_ru": dict(
   serp="Снят 25.10: AIO r1; органика — translate.google.com ×2, translate.yandex.ru, deepl.com ×2, context.reverso.net ×2, webtran.ru ×2 (#7–8). 7 из 9 — гиганты; слабый сигнал только один: средний сайт webtran.ru держит 2 места.",
   serp_weakness="strong",
   fit="(b) ИИ-перевод текста — продукт реально переводит; сейчас движок открыт только для RU↔UZ",
   build="Открыть в существующем переводчике пару EN↔RU (общая работа с W3-06 EN↔UZ) и дать отдельные посадочные: /ru/perevodchik-s-angliyskogo-na-russkiy/ (по умолчанию EN→RU), /ru/perevodchik-s-russkogo-na-angliyskiy/; второй волной — турецкий, китайский, корейский, арабский ↔ русский. Тип: инструмент-страница, не статья.",
   effort="M", honesty_risk="low",
   honesty_note="Перевод настоящий. Риск только в обещании «бесплатно»: у переводчика и чата общие 3 пробных ответа.",
   ramp_weeks="16–30+ (сильная выдача; в 1-й месяц при K≈0,04 ≈4–7 визитов/день, если страница вообще попадёт в топ-20)",
   existing_url="https://gptbot.uz/ru/russko-uzbekskiy-perevodchik/ (только RU↔UZ)"),
 "greetings_ru": dict(
   serp="Снят 25.10 «поздравление с днем рождения»: AIO r1, блоки картинок и видео; органика — pozdravok.com ×2, techinsider.ru, ru.pinterest.com ×2, vc.ru (пользовательский блог). 3 из 6 органических мест — слабые сигналы.",
   serp_weakness="mixed",
   fit="(b) ИИ-генератор поздравления (кому, повод, тон, длина, RU/UZ) + (c) свои оригинальные тексты по адресатам и праздникам",
   build="Хаб /ru/pozdravleniya/ с генератором + страницы /ru/pozdravleniya/s-dnem-rozhdeniya/ и адресаты (muzhchine, zhenshchine, podruge, drugu, mame, sestre, svoimi-slovami, korotkie); праздничные /s-novym-godom/ (выпустить до 15.11), /s-8-marta/ (до 01.02), /s-dnem-uchitelya/ (до 01.09), /s-14-yanvarya/, /s-navruzom/. hreflang-пара к /uz/blog/tabrik-yozish/.",
   effort="M", honesty_risk="low",
   honesty_note="Только свои тексты, ничего не копировать с pozdravok/Pinterest; «открытки» (картинки) не обещать — генерации изображений нет.",
   ramp_weeks="6–12 для адресатных страниц; праздничные — за 4–6 недель до пика (НГ: декабрь, 8 марта: март)",
   existing_url="https://gptbot.uz/uz/blog/tabrik-yozish/ (UZ-гайд; RU-страниц нет)"),
 "english_for_ru": dict(
   serp="Снят 25.10 «present simple»: AIO r1, картинки, PAA; органика — YouTube ×3, SlideShare, Pinterest, блог казахстанской школы. Сильной текстовой страницы в топ-6 нет.",
   serp_weakness="weak",
   fit="(c) свои объяснения + оригинальные упражнения с разбором ответов; (a) тренажёр неправильных глаголов; (b) ИИ-проверка эссе IELTS Task 2 по критериям",
   build="/ru/angliyskiy/present-simple/ (правило, таблица, 20+ своих упражнений с объяснениями, поле «проверь своё предложение» через ИИ), /ru/angliyskiy/alfavit/, /ru/angliyskiy/nepravilnye-glagoly/ (таблица + тренажёр), /ru/angliyskiy/vremena/; /ru/ielts-writing-task-2-proverka/ (+ UZ-версия). Страницы двуязычные по примерам — «present simple» ищут и узбекоязычные.",
   effort="M", honesty_risk="low",
   honesty_note="Никаких реальных экзаменационных заданий; проверка IELTS — «разбор по критериям», не официальный балл.",
   ramp_weeks="6–10 (слабая выдача, учебный сезон осень–зима)",
   existing_url=""),
 "rezyume_ru": dict(
   serp="Не снят. Индекс конкуренции Google Ads 0,35–0,71 у «резюме/шаблон/создать резюме» — рекламодатели (конструкторы, hh). Ожидаю сильную выдачу.",
   serp_weakness="strong",
   fit="(a) конструктор: форма → DOCX/PDF; (b) ИИ пишет «о себе», навыки, сопроводительное письмо; (c) 5–7 своих шаблонов",
   build="/ru/rezyume/ (конструктор + шаблоны + ИИ-подсказки), /ru/rezyume/obrazec/, /ru/soprovoditelnoe-pismo/. hreflang к /uz/blog/rezyume-tayyorlash/.",
   effort="M", honesty_risk="low", honesty_note="Нейтральные шаблоны, без «гарантии трудоустройства».",
   ramp_weeks="12–20",
   existing_url="https://gptbot.uz/uz/blog/rezyume-tayyorlash/ (UZ-гайд)"),
 "russian_grammar": dict(
   serp="Не снят. Ожидаю специализированные российские сервисы разбора и учебные порталы — сильная выдача.",
   serp_weakness="strong",
   fit="(c) свои правила, таблицы, диктанты по классам; (b) ИИ-разбор слова/предложения с пометкой «проверь по учебнику»",
   build="/ru/russkiy-yazyk/padezhi/ (таблица + генератор упражнений), /razbor-slova-po-sostavu/, /morfologicheskiy-razbor/, /foneticheskiy-razbor/, /sintaksicheskiy-razbor/, /chasti-rechi/, /spryazhenie-glagolov/, /diktanty/ (свои тексты по классам).",
   effort="L", honesty_risk="medium",
   honesty_note="Модель ошибается в морфологическом и фонетическом разборе — школьник сдаст неверное. Нужны детерминированные правила или проверка человеком.",
   ramp_weeks="12–24 (пик спроса — сентябрь–май)",
   existing_url=""),
 "kids_tales_riddles": dict(
   serp="Снят 25.10 «сказка на ночь»: только нишевые библиотеки сказок (deti-online ×2, mishka-knizhka, domskazki, nukadeti, runruneando, skazkaplus, detskiychas), видео r2, AIO r5. Гигантов и генераторов нет.",
   serp_weakness="mixed",
   fit="(b) ИИ-генератор персональной сказки (имя ребёнка, возраст, герой, мораль; RU/UZ) + (c) свои сказки, загадки и скороговорки с ответами",
   build="/ru/skazka-na-noch/ (генератор + 10 своих сказок), /ru/zagadki-dlya-detey/ (свои загадки по темам, с ответами), /ru/skorogovorki/. UZ-пара: /uz/ertak/. Ребусы и кроссворды не делать — нужны картинки.",
   effort="M", honesty_risk="low",
   honesty_note="Не копировать авторские сказки (Чуковский и т. п. под охраной); фольклор можно пересказывать своими словами.",
   ramp_weeks="8–16",
   existing_url=""),
 "converter_translit_ru": dict(
   serp="Не снят. Узбекская специфика (кириллица↔латиница) — ожидаю слабую выдачу из мелких конвертеров; «транслит» — российские сервисы.",
   serp_weakness="weak",
   fit="(a) детерминированный конвертер уже есть (src/shared/uz-translit.ts) + (c) таблица узбекского алфавита",
   build="Отдельная страница /ru/kirillica-latinica/ на готовом конвертере с русскими заголовками («кириллица в латиницу», «латиница в кириллицу») + таблица алфавита (2 900 «узбекский алфавит»). «Транслит» брать, только если добавить режим русской транслитерации (ГОСТ 7.79 / паспортный ICAO).",
   effort="S", honesty_risk="low", honesty_note="Без модели, всё в браузере.",
   ramp_weeks="3–8",
   existing_url="https://gptbot.uz/ru/russko-uzbekskiy-perevodchik/ (конвертер — секция внутри переводчика)"),
 "learn_uzbek_ru": dict(
   serp="Не снят. Ожидаю слабую выдачу: Википедия, YouTube, мелкие блоги и разговорники.",
   serp_weakness="weak",
   fit="(c) свой разговорник (латиница + кириллица) + (b) ИИ-репетитор «учим узбекский» + переводчик RU→UZ",
   build="Хаб /ru/uzbekskiy-yazyk/ + /dni-nedeli/, /chisla/, /mesyacy/, /privetstviya/ (спасибо, привет, как дела), /razgovornik/; кнопка «перевести свою фразу» ведёт в переводчик.",
   effort="S", honesty_risk="low", honesty_note="Голоса нет — произношение давать текстом.",
   ramp_weeks="4–10",
   existing_url=""),
 "docs_ru": dict(
   serp="Не снят. Ожидаю российские сайты бланков и Scribd-подобные архивы — смешанную выдачу; узбекская привязка (ТК РУз) — наш угол.",
   serp_weakness="mixed",
   fit="(c) нейтральные шаблоны с плейсхолдерами + (b) ИИ-пресет «заполни по моим данным»",
   build="/ru/dokumenty/harakteristika/ (на ученика, студента, с места работы), /obyasnitelnaya/, /zayavlenie/ (на отпуск, на увольнение — без юр. советов), /avtobiografiya/, /kommercheskoe-predlozhenie/, /motivacionnoe-pismo/ (+ EN motivation letter). hreflang к UZ-гайдам tavsifnoma, tushuntirish xati, rasmiy xat.",
   effort="M", honesty_risk="medium",
   honesty_note="Заявления по трудовым вопросам — только шаблон, без советов; доверенность и расписку не брать (юридические последствия).",
   ramp_weeks="8–16",
   existing_url="https://gptbot.uz/uz/blog/tavsifnoma-namuna/ (UZ-аналог)"),
 "presentation_ru": dict(
   serp="Не снят. «Шаблоны» — Canva/Slidesgo-подобные сервисы; «презентация на тему» — обычно старые архивы презентаций. Ожидаю смешанную.",
   serp_weakness="mixed",
   fit="(a)/(b) Studio уже генерирует .pptx",
   build="Расширить /ru/prezentatsiya-ai/ блоком «презентация на тему …» + /ru/shablony-prezentatsiy/ (свои .pptx-шаблоны из Studio).",
   effort="S", honesty_risk="low", honesty_note="",
   ramp_weeks="6–12 (пик спроса ноябрь–декабрь ×1,6)",
   existing_url="https://gptbot.uz/ru/prezentatsiya-ai/"),
 "text_tools_ru": dict(
   serp="Не снят. Ожидаю сильные российские сервисы (словари синонимов, сервисы проверки орфографии и рерайта).",
   serp_weakness="strong",
   fit="(b) ИИ-пресеты: синоним в контексте, перефразировать, исправить ошибки (с подсветкой), сократить; (a) счётчик символов",
   build="/ru/sinonimy/, /ru/perefrazirovat-tekst/, /ru/proverka-orfografii/, /ru/schetchik-simvolov/.",
   effort="M", honesty_risk="medium",
   honesty_note="ИИ-проверка — не гарантированный корректор; «антиплагиат» и «уникализатор» не делать.",
   ramp_weeks="12–20",
   existing_url=""),
 "school_texts_ru": dict(
   serp="Не снят. «Краткое содержание» — сильные литературные порталы; «сочинение на тему» — смешанная; «титульный лист» — шаблоны.",
   serp_weakness="mixed",
   fit="(c) свои краткие содержания классики (общественное достояние) + (a) генератор титульного листа DOCX + (b) план сочинения",
   build="/ru/titulnyy-list/ (генератор DOCX), /ru/sochinenie/ (план + свои примеры), /ru/kratkoe-soderzhanie/<книга>/ для 10 произведений школьной программы.",
   effort="M", honesty_risk="medium",
   honesty_note="Сочинение подавать как план и пример, не как готовую сдачу; пересказы только свои.",
   ramp_weeks="10–16 (сезон ноябрь–декабрь ×1,5)",
   existing_url="https://gptbot.uz/ru/gpt-dlya-ucheby/"),
}

def fmt(a):
    return str(a[0]) if a[0] == a[1] else "%d–%d" % (a[0], a[1])

clusters = []
for cid, q in Q.items():
    c = C[cid]
    top = c["buckets"][:8]
    kw = "; ".join("%s %s%s" % (b["keyword"], "{:,}".format(b["volume"]).replace(",", " "),
                    (" (= " + ", ".join(b["members"][1:]) + ")") if len(b["members"]) > 1 else "") for b in top)
    if c["upper_buckets"]:
        kw += " | неоднозначные головы (только в верхней оценке): " + "; ".join("%s %s" % (b["keyword"], "{:,}".format(b["volume"]).replace(",", " ")) for b in c["upper_buckets"])
    s = c["season"]
    clusters.append({
        "id": cid, "name": c["name"], "keywords": kw,
        "demand_month": c["demand_uz_low"], "demand_month_high": c["demand_uz_high"],
        "demand_kz": [c["demand_kz_low"], c["demand_kz_high"]], "demand_kg": [c["demand_kg_low"], c["demand_kg_high"]],
        "season": {"oct_dec_vs_avg": s["ratio_oct_dec"], "peak_month": s["peak_month"], "peak": s["peak"], "sep_2026": s["sep_2026"], "avg12": s["avg12"]},
        "serp": q["serp"], "serp_weakness": q["serp_weakness"], "fit": q["fit"], "build": q["build"],
        "effort": q["effort"], "honesty_risk": q["honesty_risk"], "honesty_note": q["honesty_note"],
        "visits_day_pos6": fmt(c["visits_day_pos6"]), "visits_day_pos3": fmt(c["visits_day_pos3"]),
        "aio_discount_top3": c["aio_discount_top3"], "ramp_weeks": q["ramp_weeks"], "existing_url": q["existing_url"],
        "buckets": c["buckets"], "upper_buckets": c["upper_buckets"],
    })
clusters.sort(key=lambda x: -x["demand_month"])

res = {
  "lens": "ru-audience-ai",
  "date": "2026-10-25",
  "model": {"visits_day": "demand × CTR / 30 × 1.5", "ctr_pos6": [0.00613, 0.01105], "ctr_pos3": 0.03593,
            "aio_discount": "только в сценарии поз. ~3: ×0.533 (AIO r1) / ×0.655 (AIO ниже или выдача не снята)",
            "demand": "Google Ads, location 2860 (UZ), language ru, 12-мес. среднее; дедупликация: равный объём + равный 12-мес. ряд (≥100) = одна корзина; ключи, уже учтённые в demand-sizing.json, пропущены",
            "low_vs_high": "demand_month = только однозначные ключи; demand_month_high = + неоднозначные головы (с днем рождения, cv, сказка, кроссворд, презентация, английский язык, как пишется, узбекский язык, узбекский алфавит)"},
  "credits": {"cap": 600, "whoami_start": 18834, "after_research": 18730, "after_3_metrics": 18216, "after_serp": 18207,
              "window_total": 627, "own_estimate": 425,
              "note": "research_keywords 104; три get_keyword_metrics по фиксированной цене ≈104 каждый (так было в demand-sizing); SERP 9. Окно 18216←18730 показало 514 вместо ~312 — в это время работали параллельные линзы, разделить списания по whoami нельзя. Верхняя граница 627 выше лимита 600 на 27."},
  "calls": ["research_keywords seed «нейросеть» (ru, 2860)", "get_keyword_metrics 558 ключей UZ 2860 ru (с рядами)",
            "get_keyword_metrics 597 ключей KZ 2398 ru (вернулось 462)", "get_keyword_metrics 597 ключей KG 2417 ru",
            "get_serp_results 4 ключа (2860, ru, depth 10)"],
  "ai_phrasing_check": {"n_phrases": 119, "uz_sum_raw": 2430, "kz_sum_raw": 6220, "kg_sum_raw": 2470,
                        "note": "Все измеренные «нейросеть/ии для …», «генератор текста/эссе/…», «написать текст/сочинение …» вместе (без картинок/видео, без дедупликации, часть презентационных уже в demand-sizing). Спрос сидит в формулировке задачи без слова ИИ."},
  "overlap_note": "Вероятные пересечения с параллельными линзами этой папки: rezyume_ru/docs_ru -> docs-career; english_for_ru/learn_uzbek_ru -> language-learning; text_tools_ru -> text-tools; school_texts_ru/russian_grammar -> education-practice. Их файлы не читались; при сведении дедуплицировать по buckets[].members.",
  "totals": comp["totals"],
  "clusters": clusters,
  "excluded": [
    {"what": "антиплагиат 1 600, антиплагиат онлайн 210, проверка на плагиат 170, уникализатор текста", "why": "продукт не проверяет плагиат; «уникализатор» = обход проверки"},
    {"what": "открытки с днем рождения 8 100", "why": "нужны картинки, генерации изображений нет"},
    {"what": "excel 12 100", "why": "навигация к продукту Microsoft"},
    {"what": "доверенность 1 900, расписка 140 (+образцы)", "why": "юридические последствия, YMYL сверх нейтрального шаблона"},
    {"what": "рекомендация 3 600, анкета 320, проект 1 300, рассказ 1 300, стихи 2 400, пословицы 2 400", "why": "интент неоднозначный или нужен чужой (авторский/архивный) контент"},
    {"what": "таблица умножения 12 100 (KZ 33 100), калькулятор онлайн 3 600, дробей 1 600, процентов 1 300, проценты от числа 720", "why": "не ИИ: детерминированные инструменты — передать линзе инструментов/математики, здесь не суммирую"},
    {"what": "нейросеть для картинок/видео/фото (~700 суммарно в хвосте research)", "why": "генерации изображений и видео нет"}
  ]
}
with open(os.path.join(HERE, "..", "ru-audience-ai.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
print("written", len(clusters))
