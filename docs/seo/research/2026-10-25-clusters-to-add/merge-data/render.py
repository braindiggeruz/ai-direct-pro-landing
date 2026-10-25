# -*- coding: utf-8 -*-
"""Render CLUSTERS_TO_ADD.md and ranked.json from merge-data/merged.json.  Run after merge.py:  py -3 -I render.py"""
import json, os, re, sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.dirname(HERE)
M = json.load(open(os.path.join(HERE, "merged.json"), encoding="utf-8"))
CL = M["clusters"]
BY = {r["id"]: r for r in CL}
SU, SI, TL, BASE = M["sums"], M["site"], M["timeline"], M["base"]
TOP = CL[:20]
REST = CL[20:]


def J(p):
    return json.load(open(os.path.join(B, p), encoding="utf-8"))


def n(x, d=0):
    """Russian number format: space thousands, comma decimals."""
    if x is None:
        return "—"
    if d == 0:
        s = f"{round(x):,}".replace(",", " ")
    else:
        s = f"{x:,.{d}f}".replace(",", " ").replace(".", ",")
    return s


def rng(a, d=0):
    return f"{n(a[0], d)}–{n(a[1], d)}"


MON = {"01": "янв", "02": "фев", "03": "мар", "04": "апр", "05": "май", "06": "июн", "07": "июл", "08": "авг", "09": "сен", "10": "окт", "11": "ноя", "12": "дек"}


def ru_season(s):
    if not s:
        return ""
    s = re.sub(r"(20\d\d)-(\d\d)", lambda m: MON[m.group(2)] + " " + m.group(1)[2:], s)
    s = re.sub(r"×(\d)\.(\d+)", r"×\1,\2", s)
    return s


# ---- lens seasonality strings
SEAS = {}
for f, lens in (("education-practice.json", "ep"), ("docs-career.json", "dc"), ("calculators-utility.json", "cu"), ("text-tools.json", "tt")):
    for c in J(f)["clusters"]:
        SEAS[lens + ":" + c["id"]] = ru_season(c.get("seasonality") or "")
for c in J("language-learning-data/ll_clusters_out.json")["clusters"]:
    s = c["seasonality"]
    SEAS["ll:" + c["id"]] = ru_season(f"пик {s['peak']} ×{s['peak_index']}, минимум {s['low']} ×{s['low_index']}")
for c in J("ru-audience-ai.json")["clusters"]:
    SEAS["ru:" + c["id"]] = f"окт–дек ×{str(c['season']['oct_dec_vs_avg']).replace('.', ',')} к среднему"

BRAND = {0: "нет", 1: "слабо", 2: "да, кнопкой «объяснить / заполнить в чате»", 3: "да, основное действие страницы идёт через чат или переводчик"}
FIT = {"valyuta": "a", "kalkulyator": "a", "sherlar": "c + b", "translator_en_ru": "b", "english_tenses": "c + a + b", "kalendar": "c + a", "logic": "c + a", "practice_tests": "a + c (+ b)", "tabrik_uz": "c + b", "formulas": "a + c", "pozdravleniya": "b + c", "irregular_verbs": "a + c", "alphabets": "c + a", "pdf": "a", "maqollar": "c + a", "english_grammar": "c + a + b", "qr": "a", "mendeleev": "a + c", "ertaklar": "c + b", "converter": "a", "primary_math": "a + c", "topic_vocab": "c + a", "multilevel": "c + a + b", "docs_hub": "c + a (+ b)", "second_langs": "c + b", "ielts_calc": "a", "randomizer": "a", "ismlar": "a + c", "english_level_test": "a + c", "dtm": "c + a", "ona_tili": "c + b", "shriftlar": "a", "amaliyot": "c + a (+ b)", "number_conv": "a", "summa_propisyu": "a", "mumtoz": "c + b", "taymer": "a", "uzbek_for_ru": "c + b", "tez_yozish": "a + c", "obyektivka": "a + c", "tilxat": "c + a", "cv_builder": "a + c (+ b)", "foiz_qqs": "a", "topik": "c + a", "iq": "a", "ielts_writing": "b + c", "faxriy": "a + c", "cyr_ru_docs": "c (+ b)", "olympiad": "c", "sinonimlar": "a + c (+ b)", "sanagich": "a"}
BRAND_SHORT = {0: "нет", 1: "слабо", 2: "да, кнопкой", 3: "да, это чат"}
SERP_RU = {"weak": "слабая", "mixed": "смешанная", "strong": "сильная"}
HON_RU = {"low": "низкий", "medium": "средний"}


def kw_line(r, k=7):
    out = []
    for kw, vol, low in r["top_keywords"][:k]:
        if kw.startswith("topishmoqlar javobi bilan / загадки"):
            out.append("добавка text-tools: topishmoqlar javobi bilan 5 400, загадки 4 400, загадки для детей 1 900 и др. = 13 115")
            continue
        if low >= vol - 1:
            out.append(f"{kw} {n(vol)}")
        elif abs(low - vol * 0.5) < 2:
            out.append(f"{kw} {n(vol)} ×0,5")
        elif abs(low - vol * 0.3) < 2:
            out.append(f"{kw} {n(vol)} ×0,3")
        elif low == 0:
            out.append(f"{kw} {n(vol)} (вес 0)")
        else:
            out.append(f"{kw} {n(vol)} (пол {n(low)})")
    return "; ".join(out)


def demand_cell(r):
    if r["jump_shaped"]:
        return f"{n(r['demand_plan'])} (пол {n(r['demand_floor'])} – Ads {n(r['demand_ads'])})"
    if r["demand_ads"] > r["demand_floor"] * 1.02:
        return f"{n(r['demand_plan'])} (верх {n(r['demand_ads'])})"
    return n(r["demand_plan"])


def wk(r):
    return "не доходит до 5" if r["weeks_to_5"] is None else f"≈{r['weeks_to_5']} нед."


WAVE_RU = {0: "волна 1 (до 15.11)", 0.5: "волна 1 → основная часть в дек", 1: "волна 2 (дек)", 1.5: "пилот в волне 1, полный объём в янв", 2: "волна 3 (до 15.01)", 2.5: "волна 3 (янв–фев)"}

# ---------------------------------------------------------------- first 10 / waves / dropped (data)
FIRST10 = [
    dict(n=1, cid="kalendar", url="/uz/kalendar-2027/, /ru/kalendar-2027/, /ru/proizvodstvennyy-kalendar-2027-uzbekistan/", ptype="статичный инструмент",
         kws="kalendar 2026 14 800; календарь 2026 14 800; производственный календарь 2026 узбекистан 2 400; выходные дни в узбекистане 2026 1 900; dam olish kunlari 2026 1 600 (спрос по «2026» = прогноз для страниц «2027»)",
         does="Календарь 2027 с праздниками и официальными выходными, номера недель, печать A4, рабочие дни и часы по месяцам, отсчёт «до Нового года». Переносы — только по постановлению.", effort="S", when="до 10.11 (пик дек ×1,49)"),
    dict(n=2, cid="kalkulyator", url="/uz/kalkulyator/, /ru/kalkulyator/", ptype="инструмент (PWA)",
         kws="калькулятор 74 000; kalkulyator 40 500; calculator 40 500; kalkulator 40 500 ×0,5; kalkulyatr 40 500 ×0,5; калькулятор онлайн 3 600",
         does="Обычный и инженерный калькулятор: скобки, история, клавиатура, офлайн; узбекский интерфейс. Позже — режимы процентов и QQS.", effort="S", when="до 10.11"),
    dict(n=3, cid="converter", url="/uz/kirill-lotin/, /ru/kirillica-v-latinicu/, /uz/ozbek-lotin-alifbosi/", ptype="инструмент на готовом модуле",
         kws="lotin krill 4 400; lotin alifbosi 3 600; lotin kirill 1 900; o‘zbek alifbosi 1 600; кириллица в латиницу 1 300; лотин алифбоси 1 300 (+ 12 490 ключей конвертера из roadmap)",
         does="Конвертер в обе стороны с загрузкой .txt/.docx и копированием (модуль src/uz-translit уже есть) + таблица 29 букв, правила o‘/g‘ и тутуқ белгиси.", effort="S", when="до 10.11"),
    dict(n=4, cid="irregular_verbs", url="/uz/notogri-fellar/, /ru/nepravilnye-glagoly/", ptype="инструмент-тренажёр",
         kws="irregular verbs 12 100; irregular verbs list 2 900; noto‘g‘ri fe’llar jadvali 2 400; неправильные глаголы 1 900; noto‘g‘ri fe’llar 1 000",
         does="Таблица V1–V2–V3 на 150–200 глаголов с переводом UZ/RU, поиск, режим «скрыть колонку», тест на 10 глаголов, печать вместо PDF.", effort="S", when="до 15.11"),
    dict(n=5, cid="tabrik_uz", url="/uz/tabriklar/, /uz/tabriklar/yangi-yil/, /uz/tabriklar/tugilgan-kun/ (+ кириллическая версия)", ptype="коллекция + генератор в чате",
         kws="туғилган кун табриги 9 900; tugilgan kun tabrigi 6 600; tugilgan kunga tabrik 4 400; yangi yil tabrigi 1 600; янги йил табриклари 1 300",
         does="Свои поздравления по адресатам + генератор (кому, возраст, тон, длина; латиница или кириллица через конвертер). Гайд /uz/blog/tabrik-yozish/ остаётся владельцем своих 11 ключей.", effort="M", when="до 20.11 (пик дек ×1,96)"),
    dict(n=6, cid="pozdravleniya", url="/ru/pozdravleniya-s-novym-godom/, /ru/pozdravleniya-s-dnem-rozhdeniya/, /ru/pozdravlenie-na-uzbekskom/", ptype="генератор + свои тексты (движок общий с №5)",
         kws="поздравления с днем рождения 18 100; поздравление с днем рождения мужчине 4 400; с днем рождения подруге 4 400; …своими словами 3 600; поздравление с новым годом 1 900",
         does="Генератор поздравления (имя, кому, повод, тон; вариант на узбекском с переводом) + 30 своих текстов. Открытки не обещать — картинок нет.", effort="M", when="до 20.11 (пик дек ×1,43)"),
    dict(n=7, cid="sherlar", url="/uz/sherlar/, /uz/sherlar/qish-haqida/, /uz/sherlar/yangi-yil/, /uz/sherlar/ona-haqida/, /uz/sherlar/bolalar-uchun/", ptype="коллекция + пресет «She’r yozib ber»",
         kws="ona haqida sherlar 5 400; yangi yil sherlari 3 600; bolalar uchun sherlar 3 600; qish haqida sher 2 900; yangi yilga sher 1 900 (хаб под «sherlar» 9 900 и «vatan haqida sher» 18 100 — во второй волне)",
         does="10–20 стихов на страницу: общественное достояние и стихи, написанные для сайта (с подписью, проверка носителем); фильтр «4 qator», копирование, печать; генератор по теме и имени.", effort="M", when="до 25.11 (пик дек ×1,42)"),
    dict(n=8, cid="logic", url="/uz/mantiqiy-savollar/, /uz/topishmoqlar/, /uz/zakovat-savollari/", ptype="коллекция + движок квиза",
         kws="mantiqiy savollar 18 100; zakovat savollari 12 100; topishmoqlar 9 900; topishmoqlar javobi bilan 5 400; загадки 4 400",
         does="300+ своих вопросов и загадок с ответом под спойлером и разбором, режим квиза со счётом. Вопросы Zakovat — свои, в формате передачи, не копии эфира. Движок квиза потом переиспользует №10.", effort="M", when="до 25.11 (ноя–дек ×1,4)"),
    dict(n=9, cid="english_tenses", url="/uz/ingliz-tili-zamonlari/, /present-simple/, /past-simple/, /present-continuous/ (+ /ru/vremena-angliyskogo-yazyka/…)", ptype="объяснение + генератор упражнений",
         kws="present simple 12 100; past simple 8 100; present continuous 6 600 (остальные 9 времён — во второй волне)",
         does="Формула +/−/?, маркеры времени, 10 примеров EN–UZ–RU, генератор 10 заданий с проверкой, кнопка «Chatda tushuntirish» (объяснить мою ошибку).", effort="M", when="до 30.11"),
    dict(n=10, cid="practice_tests", url="/uz/testlar/, /uz/testlar/informatika/, /uz/testlar/fizika/, /uz/testlar/matematika/", ptype="пилот: движок квиза + свой банк",
         kws="informatika test 49 500 (пол 1 750); fizika test 40 500 (пол 520); matematika test 27 100 (пол 2 900)",
         does="40–60 своих вопросов на предмет, мгновенная проверка, разбор каждого ответа, фильтр по классу, кнопка в пресет study-test. Цель пилота — через 4–6 недель сверить показы GSC с Ads: реален ли скачок ×10–100.", effort="M (пилот из L)", when="до 30.11; решение о полном банке — около 10.01"),
]
OPTION_VAL = dict(cid="valyuta", url="/uz/valyuta-kursi/ (+ /dollar/, /rubl/, /yevro/, /tenge/, /yuan/), /uz/valyuta-konvertor/usd-uzs/ …, /ru/kurs-valyut/, /ru/kurs-dollara/",
                  kws="dollar kursi 823 000; курс доллара 550 000; kurs dollar 301 000; usd uzs 201 000; курс доллара к суму 165 000; доллар сум 90 500; 100 долларов в сумах 74 000",
                  does="Курс ЦБ РУз на сегодня по официальному JSON cbu.uz (cron раз в день → KV → пререндер), изменение за день, график 30 дней, конвертер пар; дата и ссылка на cbu.uz на каждой странице, без прогнозов и «где купить».", effort="M")
WAVE2 = ["translator_en_ru", "formulas", "alphabets", "maqollar", "qr", "mendeleev", "english_level_test", "topic_vocab", "ielts_calc", "uzbek_for_ru"]
WAVE3 = ["pdf", "english_grammar", "ertaklar", "docs_hub", "multilevel", "primary_math", "second_langs", "mumtoz", "dtm", "faxriy"]

DROPPED = [
    ("Шаблоны договоров (mehnat, ijara, oldi-sotdi, pudrat)", "10 100", "docs-career №12", "Юридический YMYL: готовый договор без юриста может навредить; в выдаче lex.uz, gov.uz, soliq.uz. Максимум — нейтральная статья со ссылками на официальные источники."),
    ("Kredit / ipoteka / omonat kalkulyator", "26 570", "calculators-utility №8", "Финансовый YMYL рядом со ставками банков, сильная выдача (банки, bank.uz, depozit.uz), в чат не ведёт; 8–15 визитов/день на поз. 6. Отложено."),
    ("IMT / BMI kalkulyator", "20 415", "calculators-utility №9", "Медицинский YMYL, вне бренда, 6–11 визитов/день. Калькуляторы беременности и овуляции исключены линзой."),
    ("Русский язык: разбор слова, падежи, морфология", "22 970", "ru-audience-ai", "Модель ошибается в морфологическом и фонетическом разборе — школьник сдаст неверное; выдача сильная. Только с детерминированными правилами и проверкой человеком."),
    ("Avtotest / YHQ (ПДД)", "24 280", "education-practice (вне линзы)", "Нужен свой банк вопросов с картинками ситуаций (L); копия официального банка — запрещённый «copied archive». Отложено."),
    ("Ответы: dtm test javoblari 18 100, test javoblari 8 100, bsb 27 100 (ответы суммативных работ BSB/ChSB)", "53 300", "education-practice", "Утечки ключей и списывание. Свои тесты с разбором разрешены и стоят в ТОП-20 (№8)."),
    ("ГДЗ, Photomath, gdz uz", "8 450", "demand-sizing, education-practice", "Архивы готовых ответов и чужой бренд."),
    ("Навигация к сайтам и брендам: uzbmb 135 000; dtm, abituriyent, ielts — по 27 100; milliy sertifikat 18 100; imlo lug‘ati 18 100; quillbot и wheel of names — по 14 800; excel 12 100; imlo.uz 9 900; grammarly 5 400; prezident maktabi 4 400; lotin.uz 1 300", "≈315 000", "все линзы", "Человек ищет конкретный сайт или бренд, честно такой запрос не выиграть. Навигация к Google и Яндекс-переводчику (6,37 млн) исключена ещё в demand-sizing."),
    ("Стихи авторов под охраной (Zulfiya, Abdulla Oripov, Erkin Vohidov …)", "≈25 000", "text-tools", "Копировать нельзя, а без их текстов запрос не обслужить."),
    ("Открытки, «доброе утро», тексты песен, ребусы и кроссворды с картинками", "≈18 000", "text-tools, ru-audience", "Нужны изображения (генерации нет) или охраняемые тексты."),
    ("Антиплагиат, уникализатор текста", "≈6 000", "text-tools, ru-audience", "Без поискового индекса честно не проверить; «уникализатор» — обход проверки."),
    ("PDF→Word, Word→PDF как полноценная конверсия", "110 000 + 49 500", "calculators-utility", "Без сервера макет не сохраняется — обещание было бы ложным. Честные PDF-инструменты на клиенте остались (№14)."),
    ("Namoz vaqtlari, hijriy taqvim, taqvim 2026", "27 100+", "calculators-utility", "Религиозный график — вне правил. Календарь 2027 показывает Hayit только как официальный выходной."),
    ("Burjlar и гороскопы", "14 800", "calculators-utility", "Гадание и прогнозы. Muchal-таблица без прогнозов (16 270) честна, но ниже порога."),
    ("Прогноз курса, «где выгоднее купить доллар»", "—", "calculators-utility", "Финансовый совет; у банков нет открытого официального источника курсов."),
    ("IELTS/Multilevel Listening", "≈1 600", "language-learning", "Нужно аудио, которого у продукта нет."),
    ("Подозрительные корзины: ona tili testlar 110 000, kimyo masalalar 90 500, amaliyot kundaligi to‘ldirish 110 000", "310 500", "education-practice, docs-career", "Форма ряда неправдоподобна; в суммы не входят. Проверка — пилотом (№10 и amaliyot)."),
    ("Анекдоты, цитаты, статусы (RU)", "≈17 000", "text-tools", "Копипаст-жанр, сильные российские сайты, с продуктом не связано."),
]
MERGED = [
    ("education-practice №6 «Английская грамматика» (40 730)", f"разнесён по кластерам language-learning: времена (№{BY['english_tenses']['rank']}), неправильные глаголы (№{BY['irregular_verbs']['rank']}), грамматика (№{BY['english_grammar']['rank']}), тест уровня (№{BY['english_level_test']['rank']})"),
    ("education-practice №11 «IELTS/CEFR writing» (6 760)", f"слит с IELTS writing/speaking (№{BY['ielts_writing']['rank']}) и Multilevel mock (№{BY['multilevel']['rank']})"),
    ("ru-audience «Английский для русскоязычных» (22 860)", "все ключи уже есть в кластерах language-learning (времена, алфавиты, глаголы, IELTS); RU-страницы — зеркала этих кластеров"),
    ("ru-audience «Поздравления на русском» (55 250)", f"объединён с поздравлениями text-tools (№{BY['pozdravleniya']['rank']}): общий спрос {n(BY['pozdravleniya']['demand_plan'])} без голых «поздравление», «пожелания», «тосты»"),
    ("ru-audience «Сказки и загадки» (15 890)", f"сказки → ertaklar (№{BY['ertaklar']['rank']}), загадки → mantiqiy savollar (№{BY['logic']['rank']}, уже в добавке text-tools), скороговорки → maqollar (№{BY['maqollar']['rank']})"),
    ("ru-audience «Документы на русском» (9 700) и «Резюме на русском» (9 360)", f"покрыты документными кластерами (№{BY['docs_hub']['rank']}, №{BY['cyr_ru_docs']['rank']}) и конструктором CV (№{BY['cv_builder']['rank']}); голые «характеристика», «заявление», «резюме» — неоднозначные головы, в расчёт не входят"),
    ("ru-audience «Конвертер и транслит» (4 060), «Учим узбекский» (3 810), «Текстовые ИИ-инструменты» (9 130)", f"в конвертере (№{BY['converter']['rank']}), узбекском для русскоязычных (№{BY['uzbek_for_ru']['rank']}) и синонимах (№{BY['sinonimlar']['rank']}); «транслит» оставлен только в верхней оценке"),
    ("«ingliz tili test» 14 800 (был и в тестах по предметам, и в тесте уровня)", f"оставлен только в тесте уровня английского (№{BY['english_level_test']['rank']})"),
    ("foiz hisoblash 720, foiz kalkulyator 260 (формулы и QQS)", f"оставлены только в формулах (№{BY['formulas']['rank']})"),
]
QUICK = [
    "Объявить в intent-manifest ключи, которые живые гайды уже обслуживают, но не владеют ими: ariza 4 400, tushuntirish xati namuna 2 400, rezyume namunasi 1 600, rezyume yozish namunasi 1 600, o‘quvchiga tavsifnoma 590 (docs-career). В суммы не входят.",
    "Кириллические блоки образцов прямо в HTML трёх гайдов: «тушунтириш хати» 2 900 (пол 655), «тавсифнома намуна» 720.",
    "Блок «презентация на тему …» на /ru/prezentatsiya-ai/ (ru-audience: 2 460 в месяц).",
]

# ---------------------------------------------------------------- markdown
L = []
w = L.append
t20 = SU["top20_without_valyuta"]
val = SU["valyuta"]
rest = SU["rest"]
tl = TL

w("# Какие темы и кластеры добавить на gptbot.uz, чтобы дойти до 1 000–2 000 визитов в день")
w("")
w("2026-10-25. Сведение шести линз (education-practice, language-learning, text-tools, docs-career, calculators-utility, ru-audience-ai) и уже посчитанных AI-кластеров из `2026-10-25-roadmap-1000/demand-sizing.json`. Google Ads, Узбекистан (location 2860). Новых платных замеров нет: все числа взяты из файлов линз. Расчёт: `merge-data/merge.py` → `merge-data/merged.json` → `merge-data/render.py`.")
w("")
w("Визиты в день = спрос в месяц × CTR ÷ 30 × 1,5. CTR взят по кривой сайта: на поз. ~6 — 0,613–1,105 %, на поз. 3 — 3,593 %. Скидка за AI Overview (×0,533 или ×0,655) применяется только к сценарию топ-3. Коэффициент 1,5 — визитов на один клик Google вместе с Яндексом и прямыми заходами (ROADMAP §1.1).")
w("")
w("## 0. Короткий ответ")
w("")
w(f"1. **Большие честные кластеры есть, но почти все они лежат за пределами запросов «про ИИ».** Прошлый потолок AI-кластеров в топ-3 — ≈650 визитов в день. Новые честные кластеры поднимают потолок сайта в топ-3 до **≈{n(SI['pos3_realistic_with_top20'])}** (ТОП-20) и **≈{n(SI['pos3_realistic_with_all'])}** (все честные кластеры). Объём дают инструменты, школьные тесты и «тексты к событию»: калькулятор, стихи, поздравления, календарь, логические вопросы, тесты по предметам, английский.")
w(f"2. **Что строить первым** (раздел 4, 2–3 недели): календарь 2027, калькулятор, отдельная страница конвертера, тренажёр неправильных глаголов, поздравления UZ и RU с генератором, стихи к зиме и Новому году, логические вопросы и загадки, первые времена английского, пилот тестов по информатике, физике и математике.")
w(f"3. **1 000 визитов в день** — не раньше чем через 12 месяцев. В рабочем сценарии к ноябрю 2027 сайт даёт **{rng(tl['M12']['site_working'])}** без курса валют и **{rng(tl['M12']['site_working_with_valyuta'])}** с ним. 1 000 достигается только в верхней половине вилки и при условии, что запущен курс валют или несколько крупных кластеров выходят в топ-3. Через 6 месяцев (май 2027) — {rng(tl['M6']['site_working'])} (с курсом валют {rng(tl['M6']['site_working_with_valyuta'])}).")
w(f"4. **2 000 визитов в день** на бумаге достижимы только в топ-3 почти по всем кластерам: весь сайт в топ-3 — ≈{n(SI['pos3_realistic_with_top20'])}–{n(SI['pos3_realistic_with_all'])}. Это 18–24 месяца и десятки настоящих ссылающихся доменов, а сейчас их 10. В 2027 году ни один сценарий, который можно защитить, до 2 000 не доходит.")
w(f"5. **Самый крупный и быстрый рычаг — курс валют ЦБ** (3,6 млн запросов в месяц). На поз. 6 он дал бы {rng(val['v6_plan'])} визитов в день, но топ-3 держат банки под currency box. Реалистично поз. 10–20 и **+145–290 визитов в день**. В чат курс валют не ведёт. Это решение владельца, а не обязательный пункт.")
w("6. **Решения владельца, которые меняют ответ:** (а) курс валют — да или нет; (б) бесплатная квота переводчика — без неё переводчик EN↔RU (№2, 330 тыс. запросов) бесполезен; (в) пилот тестов: полный банк — только если GSC подтвердит скачок спроса.")
w("")
w("## 1. Потенциал всего сайта (визитов в день)")
w("")
w("| Сценарий | Поз. ~6 | Топ-3 со скидкой за AIO | Топ-3 реалистично* |")
w("|---|---:|---:|---:|")
w(f"| Сейчас (GA4 за 28 дней; модель {BASE['today']}) | ≈93 | — | — |")
w(f"| База: уже посчитанные AI-кластеры (demand-sizing) + прочие каналы 6,6 | {rng(BASE['pos6'])} | {n(BASE['pos3'])} | {n(BASE['pos3'])} |")
w(f"| Прирост от ТОП-20 без курса валют ({t20['n']} кластеров, {n(t20['demand_plan'])} запросов/мес) | +{rng(t20['v6_plan'])} | +{n(t20['v3_plan'])} | +{n(t20['v3_realistic'])} |")
w(f"| **Весь сайт: база + ТОП-20** | **{rng(SI['pos6_with_top20'])}** | **{n(SI['pos3_with_top20'])}** | **{n(SI['pos3_realistic_with_top20'])}** |")
w(f"| Прирост от кластеров №21–{len(CL)} ({rest['n']} шт., {n(rest['demand_plan'])} запросов/мес) | +{rng(rest['v6_plan'])} | +{n(rest['v3_plan'])} | +{n(rest['v3_realistic'])} |")
w(f"| **Весь сайт: все честные кластеры** | **{rng(SI['pos6_with_all'])}** | **{n(SI['pos3_with_all'])}** | **{n(SI['pos3_realistic_with_all'])}** |")
w(f"| Курс валют отдельно (поз. 10–20 реалистично / поз. 6) | +145–290 / +{rng(val['v6_plan'])} | топ-3 нереален | — |")
w("")
w("\\* Кластеры с сильной выдачей (курс валют, переводчик EN↔RU, PDF, IELTS writing, синонимы, счётчик) в топ-3 не поднимаются: для них взято верхнее значение поз. 6.")
w("")
w(f"Чувствительность к спорным рядам Ads. ТОП-20 без курса валют на поз. 6: {rng(t20['v6_floor'])} по «полу» (уровень окт–ноя 2025 для ключей со скачком), {rng(t20['v6_plan'])} по плановому спросу, {rng(t20['v6_ads'])} по Ads как есть. В топ-3 со скидкой: {n(t20['v3_floor'])} / {n(t20['v3_plan'])} / {n(t20['v3_ads'])}. Без скидки за AIO: {n(t20['v3_no_aio'])}.")
w("")
w("## 2. Когда: честный разгон")
w("")
w("Программа стартует, когда первая волна выйдет в прод, около 15.11.2026. Месяц 1 — середина декабря 2026, месяц 3 — февраль 2027, месяц 6 — май 2027, месяц 12 — ноябрь 2027.")
w("")
w("| Весь сайт, визитов в день | Месяц 1 (дек 2026) | Месяц 3 (фев 2027) | Месяц 6 (май 2027) | Месяц 12 (ноя 2027) |")
w("|---|---:|---:|---:|---:|")
w(f"| База по ROADMAP: консервативный / целевой | {tl['M1']['base'][0]} / {tl['M1']['base'][1]} | {tl['M3']['base'][0]} / {tl['M3']['base'][1]}–{tl['M3']['base'][2]} | {tl['M6']['base'][0]} / {tl['M6']['base'][1]}–{tl['M6']['base'][2]} | {tl['M12']['base'][0]} / {tl['M12']['base'][1]}–{tl['M12']['base'][2]} |")
w(f"| + ТОП-20 без курса валют: осторожно / рабоче | +{tl['M1']['top20'][0]} / +{tl['M1']['top20'][1]}–{tl['M1']['top20'][2]} | +{tl['M3']['top20'][0]} / +{tl['M3']['top20'][1]}–{tl['M3']['top20'][2]} | +{tl['M6']['top20'][0]} / +{tl['M6']['top20'][1]}–{tl['M6']['top20'][2]} | +{tl['M12']['top20'][0]} / +{tl['M12']['top20'][1]}–{tl['M12']['top20'][2]} |")
w(f"| **Итого, осторожный сценарий** | **{tl['M1']['site_conservative']}** | **{tl['M3']['site_conservative']}** | **{tl['M6']['site_conservative']}** | **{tl['M12']['site_conservative']}** |")
w(f"| **Итого, рабочий сценарий** | **{rng(tl['M1']['site_working'])}** | **{rng(tl['M3']['site_working'])}** | **{rng(tl['M6']['site_working'])}** | **{rng(tl['M12']['site_working'])}** |")
w(f"| Курс валют: осторожно / рабоче | +{tl['M1']['valyuta'][0]} / +{tl['M1']['valyuta'][1]}–{tl['M1']['valyuta'][2]} | +{tl['M3']['valyuta'][0]} / +{tl['M3']['valyuta'][1]}–{tl['M3']['valyuta'][2]} | +{tl['M6']['valyuta'][0]} / +{tl['M6']['valyuta'][1]}–{tl['M6']['valyuta'][2]} | +{tl['M12']['valyuta'][0]} / +{tl['M12']['valyuta'][1]}–{tl['M12']['valyuta'][2]} |")
w(f"| **Итого, рабочий сценарий с курсом валют** | **{rng(tl['M1']['site_working_with_valyuta'])}** | **{rng(tl['M3']['site_working_with_valyuta'])}** | **{rng(tl['M6']['site_working_with_valyuta'])}** | **{rng(tl['M12']['site_working_with_valyuta'])}** |")
w("")
w("Допущения по разгону:")
w("- **Осторожный** — как консервативный сценарий ROADMAP §2.2. Новая страница набирает 0,02 / 0,04 / 0,10 / 0,25 прогноза поз. 6 через 1 / 3 / 6 / 12 месяцев; считается от «пола» и нижнего CTR. Для смешанной выдачи результат умножается на 0,75, для сильной — на 0,375. Так вели себя школьные гайды: у insho за 54 дня ни одного показа по головным словам.")
w("- **Рабочий** — кривая линз min(1; K1 · n^1,6), умноженная на шанс удержать поз. ~6: 0,8 при слабой выдаче, 0,6 при смешанной, 0,3 при сильной. K1 = 0,08 у инструмента на слабой выдаче, 0,06 у статики и инструментов на смешанной, 0,04 у статей и сильной выдачи. Калибровка K = 0,04 в первый месяц есть, а кривая для 0,06–0,08 не откалибрована. Поэтому это верх, а не прогноз. Ориентир — лучшая страница сайта, гайд по скачиванию: ≈5 кликов в день на 4-й неделе и плато с 6–7-й.")
w("- Волны: первые 10 пунктов — до 15.11, вторая волна — декабрь, третья — январь–февраль (раздел 4). Сезонность в таблицу не входит: это среднегодовой уровень. Школьные кластеры летом теряют 50–75 %, а декабрь, март–май и сентябрь–октябрь выше среднего.")
w("- База — числа ROADMAP: месяц 1 ≈ сегодня, 3 / 6 / 12 месяцев ROADMAP приравнены к нашим месяцам 3 / 6 / 12. Целевой сценарий базы уже включает решения владельца по квоте переводчика и ссылкам.")
w("")
w("**Вердикт.**")
w(f"- **1 000 в день.** За 6 месяцев — нет ни в одном сценарии: максимум {tl['M6']['site_working_with_valyuta'][1]} с курсом валют. За 12 месяцев — только в верхней половине рабочего сценария с курсом валют ({rng(tl['M12']['site_working_with_valyuta'])}), то есть к концу 2027 года. Без курса валют верх в ноябре 2027 — {tl['M12']['site_working'][1]}, и 1 000 появится, только когда 4–5 крупных кластеров (калькулятор, стихи, тесты, переводчик, английский) выйдут в топ-3 — скорее в 2028 году, чем в 2027-м.")
w(f"- **2 000 в день.** Только в топ-3 почти по всему списку: ≈{n(SI['pos3_realistic_with_top20'])} для базы с ТОП-20 и ≈{n(SI['pos3_realistic_with_all'])} со всеми честными кластерами. Либо курс валют на поз. ~6 — по оценке линзы это маловероятно. Нужны 18–24 месяца, десятки тематических ссылающихся доменов и Яндекс.Вебмастер. В 2027 году — нет.")
w("- **От чего зависит, осторожный будет сценарий или рабочий.** Первое — индексация: гайд slayd-tayyorlash уже висит в статусе «Crawled — not indexed», и новые страницы могут застрять так же. Дальше — ссылки на новые страницы с живых лидеров (гайд по скачиванию, оба чата), Яндекс.Вебмастер (O-02) и 10–20 настоящих тематических ссылок. Генераторам (№3, №9, №11, №19) нужна бесплатная квота: при нынешних «3 ответа на всю жизнь» человек уходит после первого текста.")
w("- Без новых кластеров потолок сайта — ≈650 в день (ROADMAP). Новые кластеры не ускоряют первые месяцы, зато втрое поднимают потолок. Поэтому строить их нужно сейчас: эффект приходит через 3–12 месяцев.")
w("")
w("## 3. ТОП-20 кластеров, которые стоит добавить")
w("")
w("Усилие: S — до 2 рабочих дней, M — 3–5 дней, L — от 2 недель вместе с контентом (грубая шкала линз). «В чат» — ведёт ли страница пользователя в AI-чат или переводчик. Тип по правилам: a — детерминированный инструмент в браузере, b — пресет AI-чата, c — свой статичный контент.")
w("")
w("Ранг = визиты на поз. 6 (середина) × шанс удержать поз. 6 × скорость разгона (среднее долей на 3-м и 6-м месяце) × сезон «до декабря» (0,8–1,25) × усилие (S 1 / M 0,85 / L 0,7) × связь с чатом (0,75–1,15) × риск (низкий 1 / средний 0,85). Плановый спрос: если по ключам есть скачок, берётся среднее геометрическое «пола» и Ads, иначе консервативный спрос линзы.")
w("")
w("| № | Кластер | Спрос/мес (план) | Визитов/день, поз. ~6 | Топ-3 (со скидкой) | Выдача | Усилие | В чат | Риск | ≥5 визитов/день |")
w("|---:|---|---:|---:|---:|---|:-:|---|---|---|")
for r in TOP:
    flag = " ⚑" if r.get("owner_flag") else ""
    v3 = n(r["v3_plan"]) if r["serp"] != "strong" else f"нереально ({n(r['v3_plan'])})"
    w(f"| {r['rank']} | {r['name']}{flag} | {demand_cell(r)} | {rng(r['v6_plan'])} | {v3} | {SERP_RU[r['serp']]} | {r['effort']} | {BRAND_SHORT[r['brand']]} | {HON_RU[r['honesty']]} | {wk(r)} |")
w("")
w("⚑ — нужно решение владельца. «≥5 визитов/день» — неделя, когда рабочий сценарий даёт 5 визитов в день: прогноз поз. 6 × шанс × кривая K1.")
w("")
w("### 3.1 Карточки ТОП-20")
w("")
for r in TOP:
    w(f"**{r['rank']}. {r['name']}** — {r['lenses']}")
    w(f"- Ключи: {kw_line(r)}.")
    seas = SEAS.get(r["src"][0], "")
    if r["jump_shaped"]:
        seas = (seas + "; " if seas else "") + "у части ключей скачок с дек 2025, сезонность по Ads искажена"
    w(f"- Спрос: {demand_cell(r)} в месяц. Сезонность: {seas or 'нет данных'}.")
    w(f"- Выдача ({SERP_RU[r['serp']]}): {r['serp_txt']}.")
    w(f"- Что строить: {r['url']} — {r['ptype']}. Тип по правилам: {FIT[r['id']]}. Усилие {r['effort']}. В чат: {BRAND[r['brand']]}.")
    t3 = f"топ-3 — {n(r['v3_plan'])} (AIO ×{str(r['aio']).replace('.', ',')})" if r["serp"] != "strong" else f"топ-3 нереален (на бумаге {n(r['v3_plan'])})"
    w(f"- Визитов в день: поз. ~6 — {rng(r['v6_plan'])}, {t3}. Разгон: K1 = {str(r['k1']).replace('.', ',')}, 5 визитов в день — {wk(r)}; {WAVE_RU.get(r['wave'], '')}.")
    extra = []
    if r.get("existing"):
        extra.append("Уже есть: " + r["existing"] + ".")
    extra.append(f"Риск честности: {HON_RU[r['honesty']]}." + (" " + r["note"] if r.get("note") else ""))
    w("- " + " ".join(extra))
    w("")
w("## 4. План запуска: первые 10 страниц и инструментов (2–3 недели)")
w("")
w("Порядок: сначала то, что быстрее даст трафик (S-инструменты на слабой выдаче и декабрьские пики), потом M-страницы на общих движках. У №5–7 один генератор, у №8 и №10 — один движок квиза. Объём — ≈25–30 рабочих дней. В 2–3 недели это укладывается только в два параллельных потока. Свои стихи, загадки и тесты перед публикацией проверяет носитель языка.")
w("")
w("| № | URL | Тип | Главные ключи (объём/мес) | Что делает | Усилие | Срок |")
w("|---:|---|---|---|---|:-:|---|")
for f in FIRST10:
    w(f"| {f['n']} | {f['url']} | {f['ptype']} | {f['kws']} | {f['does']} | {f['effort']} | {f['when']} |")
w("")
w(f"**Опция владельца (если «да» — встаёт первым номером):** курс валют и конвертер — {OPTION_VAL['url']}. Ключи: {OPTION_VAL['kws']}. {OPTION_VAL['does']} Усилие {OPTION_VAL['effort']}. До запуска проверить условия повторного использования данных cbu.uz.")
w("")
w("**Волна 2 (декабрь 2026):** " + "; ".join(f"№{BY[c]['rank']} {BY[c]['name']}" for c in sorted(WAVE2, key=lambda c: BY[c]['rank'])) + ". Переводчик EN↔RU выпускать вместе с W3-06 (EN↔UZ) и только после решения по квоте.")
w("")
w("**Волна 3 (январь–февраль 2027):** " + "; ".join(f"№{BY[c]['rank']} {BY[c]['name']}" for c in sorted(WAVE3, key=lambda c: BY[c]['rank'])) + ". Классика (Навои, Бабур) — до 15.01, к февральскому пику ×5,8. DTM и faxriy yorliq — до марта, к пикам мая–июля.")
w("")
w("**Без новых страниц (не входит в суммы):**")
for q in QUICK:
    w(f"- {q}")
w("")
w("**Контрольные точки:** около 01.12 — первые показы волны 1 в GSC; около 10.01 — показы пилота тестов против Ads (решение о полном банке); 01.03 — K первых 10 страниц против 0,04 (если меньше 0,02 — третью волну сократить до инструментов).")
w("")
w(f"## 5. Кластеры №21–{len(CL)} (честные, но ниже по отдаче)")
w("")
w("| № | Кластер | Спрос/мес (план) | Поз. ~6 | Топ-3 | Выдача | Усилие | В чат | Риск |")
w("|---:|---|---:|---:|---:|---|:-:|---|---|")
for r in REST:
    v3 = n(r["v3_plan"]) if r["serp"] != "strong" else f"нереально ({n(r['v3_plan'])})"
    w(f"| {r['rank']} | {r['name']} | {demand_cell(r)} | {rng(r['v6_plan'])} | {v3} | {SERP_RU[r['serp']]} | {r['effort']} | {BRAND_SHORT[r['brand']]} | {HON_RU[r['honesty']]} |")
w("")
w("Ниже порога (меньше ≈5 визитов в день на поз. 6, в таблицы не входят): почтовые индексы 15 700, muchal-таблица 16 270, время в Ташкенте и Москве 22 000, BHM и МРОТ 13 050, конвертер единиц 11 410, калькулятор дат 5 080, генератор паролей 3 060, кроссворды 6 795, imlo tekshirish 3 750, latifalar 2 440, русский для узбеков 9 830 (выдача из видео), школьные тексты RU 7 830, tavsiyanoma 2 960, motivation letter 2 630, тест на профориентацию 1 910.")
w("")
w("## 6. Что выброшено и почему")
w("")
w("### 6.1 Нечестно, вне продукта или YMYL")
w("")
w("| Что | Спрос/мес | Откуда | Причина |")
w("|---|---:|---|---|")
for a, b_, c, d in DROPPED:
    w(f"| {a} | {b_} | {c} | {d} |")
w("")
w("### 6.2 Дубли между линзами (слиты, а не выброшены)")
w("")
w("| Кластер линзы | Куда ушёл |")
w("|---|---|")
for a, b_ in MERGED:
    w(f"| {a} | {b_} |")
w("")
w("Дедупликация: по ключам и по корзинам Ads. Корзины, у которых есть хоть один общий ключ, считаются один раз — по максимуму. С базой (`demand-sizing.json`) ни одна линза не пересеклась: это проверено по всем ключам. Ключи живых гайдов (tabrik-yozish, rezyume-tayyorlash, tushuntirish-xati-va-ariza-yozish, tavsifnoma-namuna, rasmiy-xat-yozish) линзы уже вычли. По `dist/sitemap.xml` (305 URL) ни одна предложенная страница на сайте ещё не существует. Исключение — конвертер: сейчас он вкладкой на страницах переводчика, а его 12 490 запросов уже учтены в базе.")
w("")
w("## 7. Как считали и где можно ошибиться")
w("")
w("- **Формула.** Визиты в день = спрос × CTR ÷ 30 × 1,5. CTR на поз. ~6 — 0,613–1,105 % без скидки за AIO: кривая снята на реальной выдаче, где AIO уже есть. На поз. 3 — 3,593 % × 0,533 (AIO на r1 или answer box) или × 0,655. Для курса валют и таймера скидка ×0,533 стоит и на поз. 6: currency box и виджет Google отвечают прямо в выдаче.")
w("- **Плановый спрос.** У части ключей с декабря 2025 рост в 5–100 раз — у школьных тестов, «amaliyot kundaligi», «tilxat», «turkcha so‘zlar», «ingliz tili test». Это может быть настоящий рост, а может быть перекладка корзин Google Ads. Если консервативный спрос ниже 75 % от Ads, берётся среднее геометрическое; в таблицах видны и «пол», и Ads. Подозрительные корзины в суммы не входят.")
w("- **Шанс удержать поз. ~6** (0,8 / 0,6 / 0,3 по силе выдачи) — экспертное допущение, а не замер. Им ранжируются кластеры и считается рабочий сценарий. Потенциалы в разделе 1 — без него, «если всё встанет на позицию».")
w("- **База** — кластеры из `demand-sizing.json`: клики в день 163–253 на поз. ~6 и 433 в топ-3, × 1,5 + 6,6 визита из прочих каналов. Внутри — переводчик RU↔UZ, чаты, гайды, Studio, решатель и генератор примеров (W3-09). Генератор примеров и кластер «начальная математика» (№21) строятся вместе.")
w("- **Чего нет в расчёте.** Яндекс отдельно (он внутри ×1,5, а сайта нет в Вебмастере), Россия (спрос не мерили), Казахстан и Киргизия (ru-audience их мерил, но CTR сайта оттуда 0,09–0,23 %), англоязычные корзины переводчиков, реклама, Telegram. Нет и стоимости квоты модели для генераторов: бесплатно сейчас 3 ответа на всю жизнь, общие для чата и переводчика.")
w("- **Ссылки.** У сайта ≈10 ссылающихся доменов. На слабых узбекских выдачах это не мешает: salom-ai.uz стоит №1 с двумя доменами. На сильных — калькулятор, PDF, переводчик EN↔RU, курс валют — мешает, отсюда шанс 0,3–0,6.")
w("")
w("## 8. Файлы")
w("")
w("- `CLUSTERS_TO_ADD.md` — этот отчёт; `ranked.json` — тот же рейтинг машиночитаемо (все кластеры, суммы, разгон, первые 10, выброшенное).")
w("- `merge-data/merge.py` → `merge-data/merged.json`: сведение, дедупликация, расчёт; `merge-data/render.py` — этот отчёт и `ranked.json`.")
w("- Линзы: `education-practice.*`, `language-learning.*`, `text-tools.*`, `docs-career.*`, `calculators-utility.*`, `ru-audience-ai.*` и их папки `*-data/`.")
w("- База: `../2026-10-25-roadmap-1000/demand-sizing.json`, `ROADMAP.md`.")
md = "\n".join(L) + "\n"
with open(os.path.join(B, "CLUSTERS_TO_ADD.md"), "w", encoding="utf-8") as f:
    f.write(md)

# ---------------------------------------------------------------- ranked.json
keep = ["rank", "id", "name", "lenses", "src", "demand_plan", "demand_floor", "demand_ads", "jump_shaped", "top_keywords", "serp", "serp_txt", "p_reach",
        "aio", "k1", "effort", "brand", "honesty", "note", "existing", "url", "ptype", "v6_plan", "v3_plan", "v3_realistic", "v3_no_aio", "v6_floor", "v3_floor",
        "v6_ads", "v3_ads", "expected_full", "weeks_to_5", "wave", "season_factor", "dec_index", "score", "owner_flag"]


def slim(r):
    o = {k: r.get(k) for k in keep if k in r}
    o["seasonality"] = SEAS.get(r["src"][0], "")
    o["brand_meaning"] = BRAND[r["brand"]]
    o["fit_abc"] = FIT[r["id"]]
    return o


ranked = {
    "date": "2026-10-25",
    "question": "Какие темы и кластеры добавить, чтобы как можно скорее получить 1 000–2 000 визитов в день",
    "model": M["model"],
    "base_existing_ai_clusters": M["base"],
    "top20": [slim(r) for r in TOP],
    "rest": [slim(r) for r in REST],
    "sums": SU, "site_potential": SI, "timeline": TL,
    "timeline_months": {"M1": "дек 2026", "M3": "фев 2027", "M6": "май 2027", "M12": "ноя 2027"},
    "verdict": {
        "1000_per_day": f"не за 6 мес.; за 12 мес. только в верхней половине рабочего сценария с курсом валют ({rng(TL['M12']['site_working_with_valyuta'])}), без него верх {TL['M12']['site_working'][1]}",
        "2000_per_day": f"только в топ-3 почти по всему списку: {n(SI['pos3_realistic_with_top20'])}–{n(SI['pos3_realistic_with_all'])}; 18–24 мес. и ссылки; в 2027 — нет",
    },
    "first10": [{**f, "rank": BY[f["cid"]]["rank"]} for f in FIRST10],
    "owner_option_valyuta": OPTION_VAL,
    "wave2": WAVE2, "wave3": WAVE3,
    "dropped": [{"what": a, "demand": b_, "lens": c, "why": d} for a, b_, c, d in DROPPED],
    "merged_duplicates": [{"lens_cluster": a, "merged_into": b_} for a, b_ in MERGED],
    "quick_wins_no_new_pages": QUICK,
}
with open(os.path.join(B, "ranked.json"), "w", encoding="utf-8") as f:
    json.dump(ranked, f, ensure_ascii=False, indent=1)
print(md)
