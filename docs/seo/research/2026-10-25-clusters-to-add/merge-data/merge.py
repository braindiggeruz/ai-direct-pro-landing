# -*- coding: utf-8 -*-
"""Merge of six cluster lenses (2026-10-25) into one deduplicated, ranked list.

Run:  py -3 -I merge.py      (reads only files of this folder and ../2026-10-25-roadmap-1000)
Out:  merge-data/merged.json  (all clusters, sums, timeline) — read by render.py
No paid calls: every number below comes from the lens files already on disk.
"""
import json, math, os, sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.dirname(HERE)
RM = os.path.join(os.path.dirname(B), "2026-10-25-roadmap-1000")


def J(p):
    with open(os.path.join(B, p), encoding="utf-8") as f:
        return json.load(f)


def norm(k):
    k = (k or "").lower().strip()
    for a in ("’", "‘", "ʻ", "ʼ", "`", "´"):
        k = k.replace(a, "'")
    return k.replace("ё", "е")


# ---------------------------------------------------------------- model
CTR6 = (0.00613, 0.01105)      # site curve, pos ~6, no chats (demand-sizing meta.ctr)
CTR3 = 0.03593                 # site curve, pos 3
VPC = 1.5                      # 1 Google click ~ 1.5 visits (ROADMAP §1.1)
P_REACH = {"weak": 0.8, "mixed": 0.6, "strong": 0.3}   # judgement prior: chance to hold pos ~6 within 6-9 months
F_EFFORT = {"S": 1.0, "M": 0.85, "L": 0.7}
F_BRAND = {0: 0.75, 1: 0.9, 2: 1.0, 3: 1.15}
F_HONEST = {"low": 1.0, "medium": 0.85}


def v6(d, ab6=1.0):
    return (d * CTR6[0] * ab6 / 30 * VPC, d * CTR6[1] * ab6 / 30 * VPC)


def v3(d, aio):
    return d * CTR3 * aio / 30 * VPC


def k_share(age, k1):
    if age <= 0:
        return 0.0
    return min(1.0, k1 * age ** 1.6)


CONS = [(0, 0.0), (1, 0.02), (3, 0.04), (6, 0.10), (12, 0.25)]   # ROADMAP §2.2 conservative (0.04/0.10/0.25 at 3/6/12 mo)


def cons_share(age):
    if age <= 0:
        return 0.0
    for (a0, s0), (a1, s1) in zip(CONS, CONS[1:]):
        if age <= a1:
            return s0 + (s1 - s0) * (age - a0) / (a1 - a0)
    return CONS[-1][1]


# ---------------------------------------------------------------- bucket loaders
# bucket = {"kws": set, "kw": display, "vol": int, "low": conservative (floor x weight), "up": vol x weight}
LL_ROWS = {}
for f in ("language-learning-data/ll_kw_metrics.json", "language-learning-data/ll_kw_metrics2.json"):
    for r in J(f)["keywords"]:
        if r.get("monthly_searches"):
            LL_ROWS[norm(r["keyword"])] = r
EPM = J("education-practice-data/ep_model.json")
for c in EPM["clusters"]:
    months = [(2026, 9), (2026, 8), (2026, 7), (2026, 6), (2026, 5), (2026, 4), (2026, 3), (2026, 2), (2026, 1), (2025, 12), (2025, 11), (2025, 10)]
    for b in c.get("buckets_core", []):
        s = b.get("series_sep26_to_oct25")
        if s and norm(b["keyword"]) not in LL_ROWS:
            LL_ROWS[norm(b["keyword"])] = {"monthly_searches": [{"year": y, "month": m, "search_volume": v} for (y, m), v in zip(months, s)]}


def jump_floor(vol, row):
    """Same rule as the lenses: vol >= 500 and mean(Jul-Sep 2026) >= 5 x mean(Oct-Nov 2025) -> Oct-Nov 2025 level."""
    if not row or vol < 500:
        return vol, False
    sm = {(x["year"], x["month"]): (x["search_volume"] or 0) for x in row["monthly_searches"]}
    on = (sm.get((2025, 10), 0) + sm.get((2025, 11), 0)) / 2
    js = (sm.get((2026, 7), 0) + sm.get((2026, 8), 0) + sm.get((2026, 9), 0)) / 3
    if js >= 5 * max(on, 1):
        return on, True
    return vol, False


def load(src):
    lens, cid = src.split(":")
    out = []
    if lens == "ep":
        c = [x for x in EPM["clusters"] if x["id"] == cid][0]
        jm = {k: fl for k, v, fl in c["jump_keywords"]}
        for b in c["buckets_core"]:
            out.append({"kws": {norm(b["keyword"])} | {norm(m) for m in b.get("merged", [])}, "kw": b["keyword"],
                        "vol": b["vol"], "low": jm.get(b["keyword"], b["vol"]), "up": b["vol"]})
    elif lens in ("tt", "cu"):
        d = J("text-tools.json" if lens == "tt" else "calculators-utility.json")
        c = [x for x in d["clusters"] if x["id"] == cid][0]
        for b in c["keywords_full"]:
            w = b.get("weight") or 0
            out.append({"kws": {norm(b["keyword"])} | {norm(m) for m in (b.get("same_bucket_as") or [])}, "kw": b["keyword"],
                        "vol": b["volume"], "low": b.get("low_value") or 0, "up": (b["volume"] or 0) * w, "w": w})
    elif lens == "ll":
        d = J("language-learning-data/ll_clusters_out.json")
        c = [x for x in d["clusters"] if x["id"] == cid][0]
        for b in c["buckets"]:
            w = b.get("weight", 1.0)
            row = None
            for k in b["keywords"]:
                row = LL_ROWS.get(norm(k))
                if row:
                    break
            fv, _ = jump_floor(b["volume"], row)
            out.append({"kws": {norm(k) for k in b["keywords"]}, "kw": b["keywords"][0], "vol": b["volume"],
                        "low": fv * w, "up": b["volume"] * w, "w": w})
    elif lens == "dc":
        d = J("docs-career-data/dc_model.json")
        c = [x for x in d["clusters"] if x["id"] == cid][0]
        pairs = c.get("dedup", [])
        for b in c["keywords"]:
            if not b.get("counted"):
                continue
            kws = {norm(b["kw"])}
            for p in pairs:
                if b["kw"] in p:
                    kws |= {norm(x) for x in p}
            out.append({"kws": kws, "kw": b["kw"], "vol": b["vol"], "low": b["floor"], "up": b["vol"]})
    elif lens == "ru":
        d = J("ru-audience-ai.json")
        c = [x for x in d["clusters"] if x["id"] == cid][0]
        for b in c["buckets"]:
            out.append({"kws": {norm(m) for m in b["members"]} | {norm(b["keyword"])}, "kw": b["keyword"],
                        "vol": b["volume"], "low": b["volume"], "up": b["volume"]})
    elif lens == "manual":
        pass
    return out


def union(sources, minus=(), drop_kw=(), extra=()):
    """Group buckets that share any keyword; one group = one Google Ads bucket (max of members)."""
    minus_kws = set()
    for m in minus:
        for b in load(m):
            minus_kws |= b["kws"]
    drop = {norm(k) for k in drop_kw}
    groups = []
    for s in sources:
        for b in load(s):
            if b["kws"] & minus_kws or b["kws"] & drop:
                continue
            hit = [g for g in groups if g["kws"] & b["kws"]]
            if hit:
                g = hit[0]
                for h in hit[1:]:
                    g["kws"] |= h["kws"]
                    g["low"] = max(g["low"], h["low"]); g["up"] = max(g["up"], h["up"]); g["vol"] = max(g["vol"], h["vol"])
                    groups.remove(h)
                g["kws"] |= b["kws"]
                if b["vol"] > g["vol"]:
                    g["kw"] = b["kw"]
                g["low"] = max(g["low"], b["low"]); g["up"] = max(g["up"], b["up"]); g["vol"] = max(g["vol"], b["vol"])
            else:
                groups.append(dict(b))
    for e in extra:
        groups.append(dict(e))
    return groups


# ---------------------------------------------------------------- merged cluster config
# serp: weak / mixed / strong ; brand: 0 none .. 3 the page's main action is the AI chat / translator
C = []


def add(**kw):
    C.append(kw)


add(id="valyuta", name="Курс валют ЦБ + конвертер пар (dollar kursi, курс доллара, usd uzs)",
    src=["cu:valyuta_kursi_kun", "cu:valyuta_konvertor"], aio=0.533, ab6=0.533, k1=0.04, serp="strong",
    effort="M", brand=0, honesty="medium", wave=0, lenses="calculators-utility №1+№2",
    url="/uz/valyuta-kursi/ (+ /dollar|rubl|yevro|tenge|yuan/), /uz/valyuta-konvertor/usd-uzs/…, /ru/kurs-valyut/, /ru/kurs-dollara/",
    ptype="инструмент на официальном JSON ЦБ (cron → KV → пререндер)",
    serp_txt="currency box на r1; топ-3 — банки (ipotekabank, kapitalbank, xb.uz); o15 dollarkurs.uz — ровно такой же продукт",
    owner_flag=True,
    note="Поз. 3 нереальна (банки + currency box). Реалистично поз. 10–20 за 3–6 мес. → 145–290 визитов/день (оценка линзы). Финансовые данные: дата и ссылка на cbu.uz, без прогнозов; условия повторного использования данных cbu.uz проверить до запуска. В чат не ведёт.")
add(id="kalkulyator", name="Онлайн-калькулятор UZ/RU (oddiy + ilmiy)", src=["cu:kalkulyator"], aio=0.655, k1=0.04,
    serp="mixed", effort="S", brand=0, honesty="low", wave=0, lenses="calculators-utility №3",
    url="/uz/kalkulyator/, /ru/kalkulyator/", ptype="инструмент (PWA, история, скобки)",
    serp_txt="x-calculator.ru, calculator888, desmos, calc.ru + 3 карточки Play; AIO нет; ни одной узбекской страницы (латиница ≈121 тыс./мес)",
    note="Самый большой брендонезависимый объём после валют. В чат не ведёт.")
add(id="sherlar", name="She’rlar по темам + пресет «She’r yozib ber»", src=["tt:sherlar_mavzu"], aio=0.655, k1=0.06,
    serp="weak", effort="L", brand=3, honesty="medium", wave=0.5, lenses="text-tools №1",
    url="/uz/sherlar/ + /uz/sherlar/{qish-haqida,yangi-yil,ona-haqida,vatan-haqida,ustoz-haqida,til-haqida,…}/",
    ptype="коллекция (общественное достояние + свои стихи) + генератор в чате",
    serp_txt="sherlari.uz, ilmlar.uz (подборки), YouTube Shorts, kh-davron.uz; AIO r3; сильных литературных ресурсов нет",
    note="Только общественное достояние и стихи, написанные для сайта; ≈25 тыс./мес по авторам под охраной исключены.")
add(id="translator_en_ru", name="Переводчик EN↔RU (и TR/ZH↔RU) на существующем движке", src=["ru:translator_en_ru"],
    aio=0.533, k1=0.04, serp="strong", effort="M", brand=3, honesty="low", wave=1, lenses="ru-audience-ai №1",
    url="/ru/perevodchik-s-angliyskogo-na-russkiy/, /ru/perevodchik-s-russkogo-na-angliyskiy/",
    ptype="инструмент-страница переводчика", owner_flag=True,
    serp_txt="AIO r1; translate.google ×2, translate.yandex, deepl ×2, reverso ×2; слабый сигнал один — webtran.ru",
    note="Сильная выдача: в первые месяцы реалистично топ-20, не топ-10. Зависит от решения по бесплатной квоте (Этап 1 роадмапа): сейчас 3 ответа на всю жизнь, общие с чатом.")
add(id="english_tenses", name="Ingliz tili zamonlari (времена английского) + генератор упражнений",
    src=["ll:english_tenses"], aio=0.533, k1=0.06, serp="weak", effort="M", brand=3, honesty="low", wave=0.5,
    lenses="language-learning №1 (= часть education-practice №6, ru-audience english_for_ru)",
    url="/uz/ingliz-tili-zamonlari/ + /present-simple/ … (12), /ru/vremena-angliyskogo-yazyka/<время>/",
    ptype="объяснение + генератор заданий + «Chatda tushuntirish»",
    serp_txt="«present simple»: AIO r1; YouTube ×3, slideshare, pinterest, блог казахстанской школы — текстовой узбекской страницы нет")
add(id="kalendar", name="Kalendar 2027: праздники, выходные, производственный календарь", src=["cu:kalendar_2027"],
    aio=0.655, k1=0.06, serp="weak", effort="S", brand=0, honesty="low", wave=0, lenses="calculators-utility №5",
    url="/uz/kalendar-2027/, /ru/kalendar-2027/, /ru/proizvodstvennyy-kalendar-2027-uzbekistan/, /uz/dam-olish-kunlari-2027/",
    ptype="статичный календарь + печать A4 + отсчёт до Нового года",
    serp_txt="хорватский kalender-365.de на o1, одно Play-приложение на 9 местах, Pinterest, timeanddate; узбекских страниц нет",
    note="Пик дек ×1,49, янв ×1,23 → выпустить до 15.11. Переносы выходных — только по постановлению (lex.uz). Namoz taqvimi не делаем.")
add(id="logic", name="Mantiqiy savollar, topishmoqlar, zakovat, загадки (квиз)", src=["ep:logic_quiz"],
    extra=[{"kws": {"__tt_add_topishmoq"}, "kw": "topishmoqlar javobi bilan / загадки (+13 115, text-tools)", "vol": 5400, "low": 13115, "up": 13790}],
    aio=0.655, k1=0.06, serp="weak", effort="M", brand=1, honesty="low", wave=0,
    lenses="education-practice №3 + text-tools (добавка 13 115) + загадки из ru-audience",
    url="/uz/mantiqiy-savollar/, /uz/topishmoqlar/, /uz/zakovat-savollari/, /uz/boshqotirmalar/, /ru/zagadki-dlya-detey/",
    ptype="своя коллекция с ответом под спойлером + режим квиза",
    serp_txt="uzinterbiz (блог), Play ×2, makepedia 2018, Scribd, audiobook.uz 2020, soff.uz, Facebook, Telegram; AIO только r8",
    note="Тренд вниз (mantiqiy savollar: 22–27 тыс. осенью 2025 → 9 900 в сен 2026).")
add(id="practice_tests", name="Тренировочные тесты по предметам (свои вопросы с разбором)",
    src=["ep:practice_tests"], minus=["ll:english_level_test"], aio=0.655, k1=0.08, serp="weak", effort="L", brand=2,
    honesty="medium", wave=1.5, lenses="education-practice №1 (без «ingliz tili test» → к тесту уровня)",
    url="/uz/testlar/ + /uz/testlar/{informatika,fizika,matematika,biologiya,ona-tili,tarix,geografiya,kimyo,huquq}/, /ru/testy/biologiya/",
    ptype="движок квиза + свой банк 40–60 вопросов с разбором + пресет study-test",
    serp_txt="«informatika test»: Scribd PDF o1, AIO r2, пустая infotest.uz, wordwall/educaplay/wayground, файлообменник docx.uz, сербский weebly",
    note="Скачок ×10–100 с дек 2025 у 16 ключей: план-спрос — среднее геометрическое пола и Ads. Сначала пилот informatika/fizika/matematika и сверка показов GSC с Ads через 4–6 нед. Никаких «test javoblari» и ключей DTM.")
add(id="tabrik_uz", name="Tabriklar UZ: tug‘ilgan kun, по адресату, праздники + генератор", src=["tt:tabrik_uz"],
    aio=0.655, k1=0.06, serp="weak", effort="M", brand=3, honesty="low", wave=0, lenses="text-tools №3",
    url="/uz/tabriklar/ + /tugilgan-kun/ (+ кириллица), /yangi-yil/, /8-mart/, /onaga/, /dugonaga/ …",
    ptype="свои тексты + генератор (кому, тон, длина; латиница/кириллица)",
    serp_txt="askinfo.uz, bilimmarkazi.uz, Telegram, YouTube, Play, qogozcha.uz, Instagram, ok.ru; AIO r4",
    existing="/uz/blog/tabrik-yozish/ (его 11 ключей не считаются)",
    note="Пик дек ×1,96 и мар ×2,06 → новогодние страницы до 25.11.")
add(id="formulas", name="Формулы и пошаговые калькуляторы (математика, физика)", src=["ep:math_formulas_calculators"],
    aio=0.533, k1=0.08, serp="weak", effort="M", brand=2, honesty="low", wave=1, lenses="education-practice №2",
    url="/uz/matematika/formulalar/, /uz/matematika/qisqa-kopaytirish-formulalari/, /uz/kalkulyator/{tenglamalar-sistemasi,kvadrat-tenglama,ekub-ekuk,kasr,uchburchak-yuzi}/",
    ptype="детерминированные калькуляторы с шагами + шпаргалки",
    serp_txt="AIO r1, Scribd PDF, Instagram reel, oefen.uz, soff.uz (платно), uz.khanacademy, YouTube; ни одного интерактивного калькулятора")
add(id="pozdravleniya", name="Поздравления RU: день рождения, адресаты, праздники + генератор (+ «на узбекском»)",
    src=["tt:pozdravleniya_ru", "ru:greetings_ru"], drop=["поздравление", "пожелания", "тосты", "тост на день рождения"], aio=0.533, k1=0.04, serp="mixed", effort="M", brand=3,
    honesty="low", wave=0, lenses="text-tools №4 ∪ ru-audience greetings_ru",
    url="/ru/pozdravleniya-s-dnem-rozhdeniya/ (+ /muzhchine/, /podruge/, /mame/ …), /ru/pozdravleniya-s-novym-godom/, /ru/pozdravlenie-na-uzbekskom/",
    ptype="генератор + свои тексты",
    serp_txt="AIO r1–r2; pozdravok.com (5 мест из 14), techinsider, Pinterest ×2, Instagram, vc.ru; узбекского ресурса нет",
    note="Новогодняя страница до 15.11 (пик дек ×1,43), 8 марта — до 01.02.")
add(id="irregular_verbs", name="Noto‘g‘ri fe’llar / irregular verbs / неправильные глаголы — таблица-тренажёр",
    src=["ll:irregular_verbs"], aio=0.533, k1=0.08, serp="weak", effort="S", brand=2, honesty="low", wave=0,
    lenses="language-learning №2 (= часть education-practice №6)",
    url="/uz/notogri-fellar/, /ru/nepravilnye-glagoly/", ptype="инструмент: таблица V1–V3 + тест + печать",
    serp_txt="«noto'g'ri fe'llar jadvali»: AIO r1; Scribd ×4, insho.uz, Play, studocu, ok.ru, soff.uz; интерактивного тренажёра нет")
add(id="alphabets", name="Alifbolar: английский, русский, арабский, корейский, японский", src=["ll:alphabets"],
    aio=0.533, k1=0.06, serp="mixed", effort="M", brand=1, honesty="low", wave=1, lenses="language-learning №3",
    url="/uz/alifbo/{ingliz,rus,arab,koreys,yapon}/, /ru/angliyskiy-alfavit/, /ru/arabskiy-alfavit/",
    ptype="таблицы букв + транскрипция + карточки (без аудио)",
    serp_txt="«английский алфавит»: AIO r1, ru.wikipedia, lingust, skillbox; «arab alifbosi»: Scribd ×2, YouTube ×4 — узбекских справочников нет")
add(id="pdf", name="PDF и фото в браузере: JPG→PDF, объединить, сжать, PDF→JPG, 3×4", src=["cu:pdf_vositalar"],
    aio=0.655, k1=0.04, serp="strong", effort="M", brand=1, honesty="low", wave=2.5, lenses="calculators-utility №4",
    url="/uz/pdf/rasmni-pdf-qilish/, /uz/pdf/birlashtirish/, /uz/pdf/siqish/, /uz/rasm/3x4/, /ru/pdf/foto-v-pdf/",
    ptype="инструменты на клиенте (файлы не уходят с устройства)",
    serp_txt="не снят; приор: iLovePDF, Smallpdf, Adobe, PDF24 по EN/RU; шанс — узбекские формулировки (pdf siqish 8 100, pdf birlashtirish 6 600)",
    note="PDF→Word и Word→PDF не обещать (без сервера макет не сохраняется).")
add(id="maqollar", name="Maqollar по темам + объяснение, tez aytishlar, iboralar (+ RU-перевод)", src=["tt:maqollar"],
    aio=0.655, k1=0.06, serp="mixed", effort="M", brand=1, honesty="low", wave=1, lenses="text-tools №2",
    url="/uz/maqollar/ + /uz/maqollar/{vatan,ona,kitob,odob,til,mehnat}-haqida/, /uz/tez-aytishlar/, /ru/uzbekskie-poslovicy/",
    ptype="коллекция + поиск", serp_txt="не снят; ожидаемо n.ziyouz.com, блоги-подборки, Scribd/PDF",
    note="Школьные пики: окт ×2,77, сен ×1,53; авг ×0,27.")
add(id="english_grammar", name="Грамматика английского: passive, conditionals, reported speech, modal verbs…",
    src=["ll:english_grammar_topics"], aio=0.533, k1=0.04, serp="mixed", effort="L", brand=3, honesty="low", wave=2.5,
    lenses="language-learning №9 (= часть education-practice №6)",
    url="/uz/ingliz-tili-grammatikasi/ + ~25 тем", ptype="объяснение + упражнения + AI-разбор ошибок",
    serp_txt="«pronouns»: merriam-webster, wordvice, wikipedia, British Council, BBC — сильно; остальные темы не сняты")
add(id="qr", name="QR-kod generator (+ сканер)", src=["cu:qr_kod"], aio=0.533, k1=0.06, serp="mixed", effort="S",
    brand=0, honesty="low", wave=1, lenses="calculators-utility №6", url="/uz/qr-kod-yaratish/, /ru/qr-kod-generator/",
    ptype="инструмент на клиенте", serp_txt="stqr.ru o1, AIO r2, orcascan, qrcode-tiger, jotform, Play; страниц на узбекском нет")
add(id="mendeleev", name="Интерактивная таблица Менделеева + 118 страниц элементов", src=["ep:periodic_table_chem"],
    aio=0.655, k1=0.08, serp="weak", effort="M", brand=1, honesty="low", wave=1, lenses="education-practice №4",
    url="/uz/kimyo/mendeleyev-jadvali/, /ru/tablitsa-mendeleeva/, /uz/kimyo/element/{belgi}/, /uz/kimyo/molyar-massa/",
    ptype="интерактивная таблица + программные страницы (данные IUPAC)",
    serp_txt="erus.uz PDF, AIO r2, магазин плакатов hilolnashr ×2, Scribd ×2, mylab.uz; интерактив только у личного himmatov.uz")
add(id="ertaklar", name="Ertaklar и сказки на ночь (свои пересказы) + генератор сказки", src=["tt:ertaklar"],
    aio=0.655, k1=0.04, serp="mixed", effort="M", brand=3, honesty="low", wave=2.5,
    lenses="text-tools №5 ∪ ru-audience kids_tales_riddles (сказки)",
    url="/uz/ertaklar/, /uz/ertak-toqib-ber/, /uz/masallar/, /ru/skazki-na-noch/", ptype="коллекция + генератор",
    serp_txt="PDF zakm.uz, видео r2, AIO r3, YouTube-аудиосказка, ertak.uz, ziyouz, Play; сильный аудио-интент")
add(id="converter", name="Кириллица↔латиница отдельной страницей + таблица алфавита", src=["tt:konvertor_alifbo", "ru:converter_translit_ru"],
    drop=["транслит"], aio=0.655, k1=0.08, serp="mixed", effort="S", brand=2, honesty="low", wave=0,
    lenses="text-tools №6 ∪ ru-audience converter_translit_ru (сверх 12 490 из roadmap)",
    url="/uz/kirill-lotin/, /ru/kirillica-v-latinicu/, /uz/ozbek-lotin-alifbosi/", ptype="инструмент (модуль src/uz-translit уже есть)",
    serp_txt="не снят; по L3 lotin.uz на o10 даже по «imlo tekshirish», приложения Play; выдача инструментов",
    existing="конвертер сейчас вкладкой на /uz/rus-ozbek-tarjimon/ и /ru/russko-uzbekskiy-perevodchik/ (12 490 уже в базе)")
add(id="topic_vocab", name="Тематическая лексика «X ingliz tilida / на английском» + карточки", src=["ll:topic_vocabulary"],
    aio=0.533, k1=0.06, serp="weak", effort="M", brand=2, honesty="low", wave=1, lenses="language-learning №7",
    url="/uz/inglizcha-sozlar/ + 30–40 тем, /ru/angliyskie-slova/<тема>/", ptype="списки EN–UZ–RU + карточки",
    serp_txt="«дни недели на английском»: AIO r1; блоги, YouTube Shorts, rutube — AIO отвечает на простые запросы сам")
add(id="docs_hub", name="Ish qog‘ozlari: хаб + bildirishnoma, dalolatnoma, bayonnoma, kafolat xati, tarjimai hol",
    src=["dc:office_docs", "dc:tarjimai_hol"], aio=0.655, k1=0.06, serp="weak", effort="M", brand=2, honesty="low",
    wave=2.5, lenses="docs-career №1 + №6",
    url="/uz/hujjatlar/ + /uz/hujjatlar/{bildirishnoma,dalolatnoma,bayonnoma,kafolat-xati,raport,elon,tarjimai-hol}-namuna/",
    ptype="шаблоны с плейсхолдерами + общий генератор (латиница/кириллица, печать/.docx)",
    serp_txt="«bildirishnoma»: AIO r3, Scribd, словари, платные kursishlari/soff, урок YouTube; объясняющих страниц-шаблонов нет")
add(id="multilevel", name="Multilevel / CEFR mock: Speaking, Writing, Reading + AI-экзаменатор", src=["ll:multilevel_cefr_practice"],
    aio=0.655, k1=0.06, serp="weak", effort="M", brand=3, honesty="medium", wave=2.5, lenses="language-learning №5",
    url="/uz/multilevel-mock-test/ (+ /speaking/, /writing/, /reading/), /uz/cefr-multilevel-nima/",
    ptype="свои задания + таймер + AI-разбор «taxminiy»",
    serp_txt="«multilevel mock test»: AIO r2; studocu #1, YouTube #2, Scribd #3–#8 — самая слабая выдача линзы")
add(id="ielts_calc", name="Калькулятор баллов IELTS / CEFR (Multilevel)", src=["ll:ielts_cefr_calculator"], aio=0.655, k1=0.08,
    serp="mixed", effort="S", brand=2, honesty="low", wave=1, lenses="language-learning №4",
    url="/uz/ielts-ball-kalkulyator/, /uz/cefr-multilevel-ball-hisoblash/, /ru/kalkulyator-ballov-ielts/",
    ptype="детерминированный калькулятор по опубликованным шкалам",
    serp_txt="«ielts calculator»: leapscholar, ielts.idp, aehelp; «cefr ballari»: PDF uzbmb, блоги — калькулятора для Multilevel нет")
add(id="primary_math", name="Начальная математика по классам + тренажёр таблицы умножения", src=["ep:primary_math_grades"],
    aio=0.655, k1=0.06, serp="mixed", effort="S", brand=1, honesty="medium", wave=2.5, lenses="education-practice №5 (строится вместе с W3-09)",
    url="/uz/matematika/{1..6}-sinf/, /uz/karra-jadvali/trenajyor/, /ru/tablitsa-umnozheniya/, /ru/primery-dlya-1-klassa/",
    ptype="генератор печатных листов + тренажёр",
    serp_txt="не снят; прокси «matematika misollar»: Scribd, PDF вузов, ustoz.ai, YouTube; часть «matematika N sinf» ищет учебник PDF")
add(id="second_langs", name="Турецкий, японский, китайский, арабский, немецкий: стартовая лексика + AI-учитель",
    src=["ll:second_languages_starter"], aio=0.655, k1=0.06, serp="weak", effort="L", brand=3, honesty="medium", wave=2.5,
    lenses="language-learning №8", url="/uz/turk-tili/, /uz/yapon-tili/, /uz/xitoy-tili/, /uz/arab-tili/, /uz/nemis-tili/",
    ptype="стартовые страницы + пресет «til o‘qituvchisi»",
    serp_txt="«turkcha so'zlar»: видео r1, lingvanex, YouTube ×3, Scribd ×2; «yapon tilini o'rganish»: блог 2020, YouTube ×3, wiki",
    note="Ряд вырос ×6–100 за год — возможный артефакт Ads; план-спрос по полу и Ads.")
add(id="randomizer", name="Рандомайзер: число, колесо имён, жеребьёвка, монетка", src=["tt:randomayzer"], aio=0.655, k1=0.06,
    serp="mixed", effort="S", brand=0, honesty="low", wave=2.5, lenses="text-tools №7",
    url="/ru/randomajzer/, /uz/tasodifiy-son/, /uz/ism-gildiragi/", ptype="инструмент",
    serp_txt="не снят; по «random number generator» — виджет Google (zero-click)")
add(id="ismlar", name="Ismlar ma’nosi: база имён (qiz / o‘g‘il) + «узбекские имена»", src=["tt:ismlar"], aio=0.533, k1=0.08,
    serp="weak", effort="L", brand=0, honesty="medium", wave=2.5, lenses="text-tools №9",
    url="/uz/ismlar/, /uz/ismlar/qiz-bolalar/, /uz/ismlar/ogil-bolalar/, /ru/uzbekskie-imena/", ptype="база + программные страницы",
    serp_txt="AIO r1; YouTube, oyina.uz 2023, PDF словаря, uz.wikipedia, Play ×2; веб-базы только на o7 и o12",
    note="Значения только с источником; этимологию моделью не выдумывать; без религиозных предписаний.")
add(id="english_level_test", name="Тест уровня английского (A1–C1) + «уровни английского»", src=["ll:english_level_test"],
    aio=0.655, k1=0.06, serp="mixed", effort="M", brand=2, honesty="low", wave=1, lenses="language-learning №6 (+ «ingliz tili test» из education-practice №1)",
    url="/uz/ingliz-tili-darajasini-aniqlash-testi/, /ru/test-na-uroven-angliyskogo/, /ru/urovni-angliyskogo/",
    ptype="детерминированный тест 40–50 своих заданий + разбор", serp_txt="не снят (лимит кредитов)",
    note="«ingliz tili test» вырос 1 900 → 22 200: план-спрос по полу и Ads.")
add(id="dtm", name="DTM / Milliy sertifikat / attestatsiya: формат, мок-тест, калькулятор баллов (без ответов)",
    src=["ep:exam_prep"], aio=0.655, k1=0.04, serp="mixed", effort="L", brand=2, honesty="medium", wave=2.5,
    lenses="education-practice №7", url="/uz/milliy-sertifikat/ + /{matematika,tarix,…}/, /uz/dtm-test/, /uz/kalkulyator/dtm-ball/",
    ptype="страницы формата + мок-тест на банке тестов + калькулятор",
    serp_txt="не снят; головы uzbmb/dtm/milliy sertifikat — навигация (исключены)",
    note="Пик июн–июл: страницы должны работать к марту–апрелю 2027.")
add(id="ona_tili", name="Ona tili: imlo qoidalari, gap bo‘laklari, kelishiklar, diktant matnlari", src=["ep:ona_tili_grammar"],
    aio=0.655, k1=0.04, serp="mixed", effort="M", brand=3, honesty="low", wave=2.5, lenses="education-practice №8",
    url="/uz/ona-tili/ + ≈20 правил, /uz/diktant-matnlari/", ptype="правила + автопроверка + пресет проверки орфографии",
    serp_txt="не снят; ожидаемо ziyouz/ziyonet PDF, arxiv.uz, Scribd, Википедия, YouTube")
add(id="shriftlar", name="Красивые шрифты и ники (Unicode-генератор)", src=["tt:shriftlar_niklar"], aio=0.655, k1=0.06,
    serp="mixed", effort="S", brand=0, honesty="low", wave=2.5, lenses="text-tools №10",
    url="/ru/krasivye-shrifty/, /ru/generator-nikov/, /uz/chiroyli-shriftlar/", ptype="инструмент", serp_txt="не снят")
add(id="amaliyot", name="Amaliyot kundaligi va hisoboti (пустой шаблон + генератор таблицы)", src=["dc:internship_reports"],
    aio=0.655, k1=0.06, serp="weak", effort="S", brand=2, honesty="medium", wave=2.5, lenses="docs-career №2",
    url="/uz/hujjatlar/amaliyot-kundaligi/, /uz/hujjatlar/amaliyot-hisoboti/", ptype="шаблон + генератор",
    serp_txt="Scribd ×3, платные doclab/soff/diplomishi, arxiv 2023, researchgate; AIO r2",
    note="Аномалия «amaliyot kundaligi to‘ldirish» 110 000/мес в расчёт не входит; без «готовых заполненных дневников».")
add(id="number_conv", name="Rim raqamlari и системы счисления (конвертеры с шагами)", src=["ep:number_converters"], aio=0.655,
    k1=0.08, serp="mixed", effort="S", brand=1, honesty="low", wave=2.5, lenses="education-practice №10",
    url="/uz/konvertor/rim-raqamlari/, /ru/rimskie-tsifry/, /uz/konvertor/sanoq-sistemalari/", ptype="инструмент", serp_txt="не снят")
add(id="summa_propisyu", name="Сумма прописью / summa so‘z bilan (RU + UZ лат/кир)", src=["cu:summa_propisyu"], aio=0.655, k1=0.06,
    serp="mixed", effort="S", brand=1, honesty="low", wave=2.5, lenses="calculators-utility №10",
    url="/ru/summa-propisyu/, /uz/summani-soz-bilan-yozish/", ptype="инструмент",
    serp_txt="не снят; приор: сильные русские инструменты, но без узбекского текста и so‘m/tiyin")
add(id="mumtoz", name="Классика: Навои, Бабур, Чолпон, ғазал, рубаи, аруз (тексты + свой разбор)", src=["tt:mumtoz_sheriyat"],
    aio=0.655, k1=0.04, serp="mixed", effort="M", brand=2, honesty="low", wave=2, lenses="text-tools №8",
    url="/uz/sherlar/{alisher-navoiy,bobur,cholpon}/, /uz/adabiyot/{gazal-nima,ruboiy,aruz-vazni}/", ptype="тексты + статьи",
    serp_txt="не снят; ожидаемо ziyouz, kh-davron.uz, Scribd, Википедия", note="Фев ×5,8 (9.02 и 14.02) → опубликовать до 15.01.")
add(id="taymer", name="Taymer, sekundomer, Pomodoro", src=["cu:taymer"], aio=0.533, ab6=0.533, k1=0.06, serp="mixed", effort="S",
    brand=0, honesty="low", wave=2.5, lenses="calculators-utility №7", url="/uz/taymer/, /uz/sekundomer/, /uz/pomodoro/, /ru/taymer-onlayn/",
    ptype="инструмент", serp_txt="не снят; виджет Google по «timer/таймер/секундомер»")
add(id="uzbek_for_ru", name="Узбекский для русскоязычных: алфавит (реформа), разговорник", src=["ll:uzbek_for_russian_speakers", "ru:learn_uzbek_ru"],
    aio=0.655, k1=0.08, serp="weak", effort="S", brand=3, honesty="low", wave=1, lenses="language-learning №10 ∪ ru-audience learn_uzbek_ru",
    url="/ru/uzbekskiy-alfavit/, /ru/uzbekskiy-razgovornik/, /ru/uzbekskiy-yazyk-dlya-nachinayushchih/", ptype="справка + конвертер + переводчик",
    serp_txt="«узбекский алфавит»: AIO нет; новость zamin.uz, LiveJournal 2013, Pinterest, yep.uz 2018")
add(id="tez_yozish", name="Tez yozish trenajyori + o‘zbek klaviaturasi", src=["cu:tez_yozish"], aio=0.655, k1=0.06, serp="mixed",
    effort="M", brand=1, honesty="low", wave=2.5, lenses="calculators-utility №11", url="/uz/tez-yozish/, /uz/ozbek-klaviaturasi/",
    ptype="тренажёр", serp_txt="не снят; monkeytype, 10fastfingers, klava.org")
add(id="obyektivka", name="Obyektivka (ma’lumotnoma) — генератор", src=["dc:obyektivka"], aio=0.655, k1=0.06, serp="mixed",
    effort="M", brand=1, honesty="medium", wave=2.5, lenses="docs-career №3", url="/uz/hujjatlar/obyektivka-namuna/",
    ptype="генератор формы (данные не покидают браузер)", serp_txt="три генератора r1–r3 (tez-hujjat, resum.uz, obyektivka.uz)",
    note="Нужно решение владельца O-05.")
add(id="tilxat", name="Tilxat и простая ishonchnoma — нейтральный образец", src=["dc:tilxat_ishonchnoma"], aio=0.655, k1=0.06,
    serp="mixed", effort="S", brand=1, honesty="medium", wave=2.5, lenses="docs-career №5", url="/uz/hujjatlar/tilxat-namuna/, /uz/hujjatlar/ishonchnoma-namuna/",
    ptype="шаблон + генератор", serp_txt="soff, kalki.uz (генератор), YouTube, gov.uz без описания",
    note="Только нейтральный шаблон; доверенности на авто и недвижимость — «нужен нотариус».")
add(id="cv_builder", name="Конструктор CV/rezyume (UZ/RU/EN) + «образец резюме»", src=["dc:cv_builder", "ru:rezyume_ru"],
    minus=["dc:motivation_cover"], drop=["резюме"], aio=0.655, k1=0.04, serp="mixed", effort="L", brand=2, honesty="low", wave=2.5,
    lenses="docs-career №4 ∪ ru-audience rezyume_ru", url="/uz/rezyume-yaratish/, /ru/obrazets-rezyume/, /uz/blog/cv-nima/",
    ptype="конструктор на клиенте", serp_txt="Canva r1, myresume.ru, superjob.uz, resum.uz; «cv nima» — ни одной узбекской страницы",
    existing="/uz/blog/rezyume-tayyorlash/ (его ключи не считаются)")
add(id="foiz_qqs", name="Foiz va QQS kalkulyatori", src=["cu:foiz_qqs"], minus=["ep:math_formulas_calculators"], aio=0.655, k1=0.06,
    serp="mixed", effort="S", brand=1, honesty="low", wave=2.5, lenses="calculators-utility №12", url="/uz/foiz-hisoblash/, /uz/qqs-kalkulyator/, /ru/kalkulyator-nds/",
    ptype="режим хаба калькулятора", serp_txt="не снят")
add(id="topik", name="TOPIK / EPS-TOPIK: свои задания чтения и лексики", src=["ll:topik_korean"], aio=0.655, k1=0.04, serp="mixed",
    effort="L", brand=2, honesty="medium", wave=2.5, lenses="language-learning №11", url="/uz/eps-topik-test/, /uz/topik-test/, /uz/koreys-tili/",
    ptype="тест + основы языка", serp_txt="topikguide ×2, thinkbigtopik, Play, onlinetestpad, topik.go.kr")
add(id="iq", name="Тест логического мышления (без норм IQ)", src=["ep:iq_test"], aio=0.655, k1=0.06, serp="mixed", effort="M", brand=0,
    honesty="medium", wave=2.5, lenses="education-practice №9", url="/uz/iq-test/, /ru/test-iq/", ptype="тест из своих задач", serp_txt="не снят")
add(id="ielts_writing", name="IELTS Writing/Speaking: AI-проверка и банк тем", src=["ll:ielts_writing_speaking", "ep:ielts_cefr_writing"],
    minus=["ll:multilevel_cefr_practice"], aio=0.655, k1=0.04, serp="strong", effort="M", brand=3, honesty="medium", wave=2.5,
    lenses="language-learning №12 ∪ education-practice №11", url="/uz/ielts-writing-checker/, /uz/ielts-speaking-savollari/",
    ptype="пресет «экзаменатор» + темы", serp_txt="ielts.idp, ielts.org, kanan, skillbox, ieltsbuddy — сильные бренды")
add(id="faxriy", name="Faxriy yorliq / tashakkurnoma — генератор бланков", src=["dc:certificates"], aio=0.655, k1=0.08, serp="weak",
    effort="M", brand=0, honesty="low", wave=2.5, lenses="docs-career №7", url="/uz/faxriy-yorliq-yaratish/", ptype="вёрстка A4 + печать",
    serp_txt="idum.uz, YouTube, Scribd, docx.uz, soff, Pinterest; инструмента нет", note="Пик май ×3,1 — запуск до марта.")
add(id="cyr_ru_docs", name="Кириллица и RU для действующих документных гайдов (тушунтириш хати, объяснительная…)",
    src=["dc:cyr_ru_mirrors"], aio=0.655, k1=0.04, serp="mixed", effort="M", brand=2, honesty="low", wave=1,
    lenses="docs-career №8 ∪ ru-audience docs_ru", url="кириллические блоки в 3 гайдах; /ru/obrazets-obyasnitelnoy/, /ru/obrazets-zayavleniya/",
    ptype="правка действующих страниц + 3 RU-страницы", serp_txt="не снят",
    existing="/uz/blog/tushuntirish-xati-va-ariza-yozish/, /uz/blog/tavsifnoma-namuna/")
add(id="olympiad", name="Олимпиадные задачи с решениями", src=["ep:olympiad"], aio=0.655, k1=0.04, serp="mixed", effort="M", brand=1,
    honesty="low", wave=2.5, lenses="education-practice №12", url="/uz/olimpiada/matematika/", ptype="задачи + решения", serp_txt="не снят")
add(id="sinonimlar", name="Синонимы и антонимы UZ/RU + AI-перефразирование", src=["tt:sinonimlar", "ru:text_tools_ru"],
    minus=["tt:sanagich", "tt:imlo_tekshirish", "ep:ona_tili_grammar"], aio=0.655, k1=0.04, serp="strong", effort="L", brand=2,
    honesty="medium", wave=2.5, lenses="text-tools №11 ∪ ru-audience text_tools_ru", url="/uz/sinonimlar/, /ru/sinonimy/, /ru/perefrazirovat-tekst/",
    ptype="словарь + пресеты", serp_txt="не снят; RU — сильные словари")
add(id="sanagich", name="Счётчик слов и символов", src=["tt:sanagich"], aio=0.655, k1=0.06, serp="strong", effort="S", brand=0,
    honesty="low", wave=2.5, lenses="text-tools №12", url="/ru/schetchik-simvolov/, /uz/belgilar-soni/", ptype="инструмент",
    serp_txt="не снят; глобальные wordcounter")

# ---------------------------------------------------------------- compute
LENS_SEASON = {}
for f, lens in (("education-practice.json", "ep"), ("docs-career.json", "dc"), ("calculators-utility.json", "cu"), ("text-tools.json", "tt")):
    for c in J(f)["clusters"]:
        LENS_SEASON[lens + ":" + c["id"]] = c.get("seasonality_index")
for c in J("language-learning-data/ll_clusters_out.json")["clusters"]:
    ss = c["seasonality"]["series_sum"]; av = sum(ss) / 12
    LENS_SEASON["ll:" + c["id"]] = {m: v / av for m, v in zip(c["seasonality"]["months"], ss)}
for c in J("ru-audience-ai.json")["clusters"]:
    LENS_SEASON["ru:" + c["id"]] = {"2025-12": c["season"]["oct_dec_vs_avg"]}

rows = []
for c in C:
    g = union(c["src"], c.get("minus", ()), c.get("drop", ()), c.get("extra", ()))
    low = sum(x["low"] for x in g)
    up = sum(x["up"] for x in g)
    jump = low < 0.75 * up
    plan = math.sqrt(low * up) if jump else low
    ab6 = c.get("ab6", 1.0)
    si = LENS_SEASON.get(c["src"][0]) or {}
    dec = si.get("2025-12")
    season = 1.0 if (jump or dec is None) else max(0.8, min(1.25, dec))
    top = sorted(g, key=lambda x: -x["vol"])[:9]
    r = dict(c)
    r.pop("extra", None)
    r.update({
        "demand_floor": round(low), "demand_ads": round(up), "demand_plan": round(plan), "jump_shaped": jump,
        "top_keywords": [[x["kw"], x["vol"], round(x["low"])] for x in top],
        "v6_plan": [round(v, 1) for v in v6(plan, ab6)], "v3_plan": round(v3(plan, c["aio"]), 1),
        "v6_floor": [round(v, 1) for v in v6(low, ab6)], "v3_floor": round(v3(low, c["aio"]), 1),
        "v6_ads": [round(v, 1) for v in v6(up, ab6)], "v3_ads": round(v3(up, c["aio"]), 1),
        "v3_no_aio": round(v3(plan, 1.0), 1),
        "dec_index": None if dec is None else round(dec, 2), "season_factor": round(season, 2),
    })
    v6mid = sum(v6(plan, ab6)) / 2
    speed = (k_share(3, c["k1"]) + k_share(6, c["k1"])) / 2
    r["p_reach"] = P_REACH[c["serp"]]
    r["speed"] = round(speed, 3)
    r["score"] = round(v6mid * P_REACH[c["serp"]] * speed * season * F_EFFORT[c["effort"]] * F_BRAND[c["brand"]] * F_HONEST[c["honesty"]], 2)
    r["expected_full"] = [round(v * P_REACH[c["serp"]], 1) for v in v6(plan, ab6)]   # pos-6 forecast x chance to get there
    # top-3 is not credible against giants: strong-SERP clusters are capped at their pos-6 upper value
    r["v3_realistic"] = r["v3_plan"] if c["serp"] != "strong" else r["v6_plan"][1]
    wk = None
    for w in range(1, 105):
        if v6mid * P_REACH[c["serp"]] * k_share(w / 4.345, c["k1"]) >= 5:
            wk = w
            break
    r["weeks_to_5"] = wk
    rows.append(r)

rows.sort(key=lambda r: -r["score"])
for i, r in enumerate(rows, 1):
    r["rank"] = i
TOP_N = 20
top = rows[:TOP_N]
rest = rows[TOP_N:]


def S(lst, key, idx=None):
    if idx is None:
        return round(sum(r[key] for r in lst), 1)
    return round(sum(r[key][idx] for r in lst), 1)


# ---------------------------------------------------------------- base = existing AI-fit clusters (demand-sizing.json)
DS = json.load(open(os.path.join(RM, "demand-sizing.json"), encoding="utf-8"))
cd = DS["summary"]["totals_clicks_day"]
OTHER = 6.6       # other channels, ROADMAP §1.1
base = {"today": round(cd["today"] * VPC + OTHER), "pos6": [round(cd["top10_low"] * VPC + OTHER), round(cd["top10_high"] * VPC + OTHER)],
        "pos3": round(cd["top3"] * VPC + OTHER), "clicks_day": cd}
# roadmap timeline for the base (ROADMAP §2.2): conservative / target
base_tl = {"M1": (93, 93, 93), "M3": (94, 96, 116), "M6": (100, 161, 254), "M12": (113, 265, 422)}

# ---------------------------------------------------------------- timeline (program start = first wave live ~15.11.2026)
MONTHS = {"M1": 1, "M3": 3, "M6": 6, "M12": 12}


def tl(lst):
    out = {}
    for mk, m in MONTHS.items():
        cons = sum(r["v6_floor"][0] * cons_share(m - r["wave"]) * r["p_reach"] / P_REACH["weak"] for r in lst)
        wl = sum(r["v6_plan"][0] * r["p_reach"] * k_share(m - r["wave"], r["k1"]) for r in lst)
        wh = sum(r["v6_plan"][1] * r["p_reach"] * k_share(m - r["wave"], r["k1"]) for r in lst)
        out[mk] = [round(cons), round(wl), round(wh)]
    return out


top_noval = [r for r in top if r["id"] != "valyuta"]
val = [r for r in rows if r["id"] == "valyuta"]
tl_top = tl(top_noval)
tl_val = tl(val)
tl_rest = tl([r for r in rest])

sums = {
    "top20_without_valyuta": {"n": len(top_noval), "demand_plan": S(top_noval, "demand_plan"), "v6_plan": [S(top_noval, "v6_plan", 0), S(top_noval, "v6_plan", 1)],
                               "v3_plan": S(top_noval, "v3_plan"), "v3_no_aio": S(top_noval, "v3_no_aio"), "v3_realistic": S(top_noval, "v3_realistic"),
                               "v6_floor": [S(top_noval, "v6_floor", 0), S(top_noval, "v6_floor", 1)], "v3_floor": S(top_noval, "v3_floor"),
                               "v6_ads": [S(top_noval, "v6_ads", 0), S(top_noval, "v6_ads", 1)], "v3_ads": S(top_noval, "v3_ads"),
                               "expected_full": [S(top_noval, "expected_full", 0), S(top_noval, "expected_full", 1)]},
    "valyuta": {"demand_plan": val[0]["demand_plan"], "v6_plan": val[0]["v6_plan"], "v3_plan": val[0]["v3_plan"],
                "realistic_pos10_20": [145, 290], "expected_full": val[0]["expected_full"]},
    "rest": {"n": len(rest), "demand_plan": S(rest, "demand_plan"), "v6_plan": [S(rest, "v6_plan", 0), S(rest, "v6_plan", 1)], "v3_plan": S(rest, "v3_plan"), "v3_realistic": S(rest, "v3_realistic"),
             "expected_full": [S(rest, "expected_full", 0), S(rest, "expected_full", 1)]},
}
site = {
    "today": base["today"],
    "base_pos6": base["pos6"], "base_pos3": base["pos3"],
    "pos6_with_top20": [base["pos6"][0] + round(sums["top20_without_valyuta"]["v6_plan"][0]), base["pos6"][1] + round(sums["top20_without_valyuta"]["v6_plan"][1])],
    "pos3_with_top20": base["pos3"] + round(sums["top20_without_valyuta"]["v3_plan"]),
    "pos6_with_all": [base["pos6"][0] + round(sums["top20_without_valyuta"]["v6_plan"][0] + sums["rest"]["v6_plan"][0]),
                      base["pos6"][1] + round(sums["top20_without_valyuta"]["v6_plan"][1] + sums["rest"]["v6_plan"][1])],
    "pos3_with_all": base["pos3"] + round(sums["top20_without_valyuta"]["v3_plan"] + sums["rest"]["v3_plan"]),
    "pos3_realistic_with_top20": base["pos3"] + round(sums["top20_without_valyuta"]["v3_realistic"]),
    "pos3_realistic_with_all": base["pos3"] + round(sums["top20_without_valyuta"]["v3_realistic"] + sums["rest"]["v3_realistic"]),
}
timeline = {}
for mk in MONTHS:
    b = base_tl[mk]
    t = tl_top[mk]; v = tl_val[mk]
    timeline[mk] = {
        "base": b, "top20": t, "valyuta": v,
        "site_conservative": b[0] + t[0],
        "site_working": [b[1] + t[1], b[2] + t[2]],
        "site_working_with_valyuta": [b[1] + t[1] + v[1], b[2] + t[2] + v[2]],
    }

out = {"model": {"ctr6": CTR6, "ctr3": CTR3, "visits_per_click": VPC, "p_reach": P_REACH, "f_effort": F_EFFORT, "f_brand": F_BRAND,
                 "f_honesty": F_HONEST, "k_curve": "min(1, K1*n^1.6)", "conservative_curve": CONS,
                 "plan_demand": "floor if floor >= 0.75*Ads else sqrt(floor*Ads)",
                 "score": "V6mid(plan) x P_reach x speed x season x F_effort x F_brand x F_honesty; speed = mean(share m3, share m6)"},
       "base": base, "base_timeline_roadmap": base_tl, "clusters": rows, "sums": sums, "site": site, "timeline": timeline, "timeline_rest": tl_rest}
with open(os.path.join(HERE, "merged.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

for r in rows:
    print(f"{r['rank']:>2} {r['id']:<18} score {r['score']:>6} plan {r['demand_plan']:>8} (fl {r['demand_floor']:>8} ads {r['demand_ads']:>8}) "
          f"v6 {r['v6_plan']} v3 {r['v3_plan']} dec {r['dec_index']} sf {r['season_factor']} {r['serp']} {r['effort']} b{r['brand']} {r['honesty']}")
print(json.dumps(sums, ensure_ascii=False))
print(json.dumps(site, ensure_ascii=False))
print(json.dumps(timeline, ensure_ascii=False))
print("rest tl", tl_rest)
