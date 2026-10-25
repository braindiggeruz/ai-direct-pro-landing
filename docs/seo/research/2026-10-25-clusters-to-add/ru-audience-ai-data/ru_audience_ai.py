# -*- coding: utf-8 -*-
"""Lens ru-audience-ai: cluster sizing for gptbot.uz (2026-10-25).

Run:  py -3 -I ru_audience_ai.py   (from this folder)
Reads: uz_metrics_raw.json, kz_metrics_raw.json, kg_metrics_raw.json (this lens),
       ../../2026-10-24-growth-audit/l3-data/kw1_metrics.json, kw2_metrics.json,
       ../../2026-10-25-roadmap-1000/data/kw3_metrics.json, kw4_metrics.json,
       ../../2026-10-25-roadmap-1000/demand-sizing.json (to avoid double counting).
Writes: computed.json (consumed by ../ru-audience-ai.json and ../ru-audience-ai.md).
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.normpath(os.path.join(HERE, "..", ".."))

def jload(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)

# ---------- volumes + 12-month series (newest first: 2026-09 ... 2025-10) ----------
UZ = {}
def add_rows(rows, src):
    for r in rows:
        k = r["keyword"]
        if k in UZ:
            continue
        ser = None
        if r.get("monthly_searches"):
            ser = tuple(m.get("search_volume") or 0 for m in r["monthly_searches"])
        elif r.get("monthly"):
            ser = tuple(x or 0 for x in r["monthly"])
        UZ[k] = {"v": r.get("search_volume"), "ser": ser, "src": src}

add_rows(jload(os.path.join(HERE, "uz_metrics_raw.json"))["keywords"], "lens-uz-call (2026-10-25)")
for p, s in [("2026-10-24-growth-audit/l3-data/kw1_metrics.json", "kw1"),
             ("2026-10-24-growth-audit/l3-data/kw2_metrics.json", "kw2"),
             ("2026-10-25-roadmap-1000/data/kw3_metrics.json", "kw3"),
             ("2026-10-25-roadmap-1000/data/kw4_metrics.json", "kw4")]:
    add_rows(jload(os.path.join(R, p))["keywords"], s)

KZ = {r["keyword"]: r.get("search_volume") for r in jload(os.path.join(HERE, "kz_metrics_raw.json"))["keywords"]}
KG = {r["keyword"]: r.get("search_volume") for r in jload(os.path.join(HERE, "kg_metrics_raw.json"))["keywords"]}

prior = set()
for c in jload(os.path.join(R, "2026-10-25-roadmap-1000/demand-sizing.json"))["clusters"]:
    for b in c.get("buckets", []):
        prior.update(b.get("members", []))

# ---------- model ----------
CTR6 = (0.00613, 0.01105)
CTR3 = 0.03593
VISITS_PER_CLICK = 1.5
def v6(d):
    return (d * CTR6[0] / 30 * VISITS_PER_CLICK, d * CTR6[1] / 30 * VISITS_PER_CLICK)
def v3(d, disc):
    return tuple(d * CTR3 * x / 30 * VISITS_PER_CLICK for x in disc)

# ---------- clusters ----------
# core = counted; upper = ambiguous heads added only to demand_high; excluded = measured, not counted (reason in md)
CL = [
 {"id": "translator_en_ru", "name": "Переводчик EN↔RU и другие пары на русский",
  "core": ["перевод с английского на русский", "переводчик с английского на русский", "англо русский переводчик",
           "переводчик с русского на английский", "перевод с русского на английский", "русско английский переводчик",
           "английский переводчик", "переводчик английский", "перевод текста с английского на русский",
           "переводчик с китайского на русский", "переводчик с русского на турецкий", "переводчик с турецкого на русский",
           "переводчик с корейского на русский", "переводчик с арабского на русский", "переводчик с немецкого на русский",
           "переводчик с казахского на русский", "переводчик с таджикского на русский", "перевод текста", "перевести текст"],
  "upper": [], "aio": (0.533, 0.533), "serp": "snapped"},
 {"id": "greetings_ru", "name": "Поздравления на русском (день рождения + праздники)",
  "core": ["поздравления с днем рождения", "поздравление с днем рождения", "поздравление с днем рождения мужчине",
           "с днем рождения подруге", "поздравление с днем рождения своими словами", "поздравление с днем рождения подруге",
           "поздравление с днем рождения другу", "поздравление с днем рождения женщине", "с днем рождения маме",
           "поздравление", "поздравления", "с днем рождения поздравления", "пожелания на день рождения",
           "поздравление с днем рождения сестре", "поздравление с днем рождения маме", "поздравление с днем рождения сыну",
           "поздравление с днем рождения брату", "поздравление с днем рождения девушке", "поздравление с днем рождения коллеге",
           "поздравление с днем рождения в прозе", "тосты", "поздравление с днем рождения дочери",
           "поздравление с рождением дочки", "поздравление с рождением сына", "пожелания", "поздравление с днем свадьбы",
           "поздравление с днем рождения папе", "поздравление с днем рождения мужу", "поздравление с днем рождения бабушке",
           "стихи с днем рождения", "поздравление на свадьбу", "поздравление с днем рождения жене",
           "поздравление с днем рождения учителю", "с днем рождения стихи", "поздравление с годовщиной свадьбы",
           "поздравление с рождением ребенка", "поздравление с днем рождения любимому", "тост на день рождения",
           "поздравление с днем рождения ребенка", "поздравление с юбилеем",
           "поздравление с новым годом", "поздравления с новым годом", "новогодние поздравления", "с новым годом поздравления",
           "поздравление с 8 марта", "с 8 марта поздравления", "поздравление с днем учителя", "с днем учителя поздравления",
           "поздравление учителю", "поздравление с 23 февраля", "поздравление с 14 января", "поздравление с навруз",
           "поздравление с днем медика", "поздравление с днем независимости", "поздравление с курбан хайитом"],
  "upper": ["с днем рождения"], "aio": (0.533, 0.533), "serp": "snapped"},
 {"id": "english_for_ru", "name": "Английский для русскоязычных + IELTS Writing",
  "core": ["present simple", "английский алфавит", "неправильные глаголы", "ielts writing task 2", "ielts writing checker",
           "ielts writing", "ielts speaking topics", "английские слова", "английский для начинающих", "времена в английском",
           "тест по английскому", "ielts essay", "учить английский", "английский язык для начинающих",
           "времена английского языка", "таблица времен английского языка", "неправильные глаголы английского языка"],
  "upper": ["английский язык"], "aio": (0.533, 0.533), "serp": "snapped"},
 {"id": "rezyume_ru", "name": "Резюме и CV на русском",
  "core": ["резюме", "резюме шаблон", "резюме образец", "резюме онлайн", "создать резюме", "шаблон резюме", "резюме бланк",
           "резюме на работу", "образец резюме", "как составить резюме", "резюме пример", "пример резюме",
           "как написать резюме", "составить резюме", "cv шаблон", "навыки для резюме", "сопроводительное письмо к резюме",
           "сопроводительное письмо", "написать резюме"],
  "upper": ["cv"], "aio": (0.533, 0.655), "serp": "not snapped"},
 {"id": "russian_grammar", "name": "Русский язык: разбор слова, падежи, диктанты",
  "core": ["падежи", "морфологический разбор", "фонетический разбор слова", "синтаксический разбор предложения",
           "части речи", "спряжение глаголов", "разбор слова по составу", "синтаксический разбор",
           "морфологический разбор слова", "фонетический разбор", "правописание", "склонение существительных",
           "как пишется слово", "морфемный разбор", "проверочное слово", "ударение в слове", "разбор предложения",
           "диктант", "диктант 5 класс", "изложение", "упражнения по русскому языку"],
  "upper": ["как пишется"], "aio": (0.533, 0.655), "serp": "not snapped"},
 {"id": "kids_tales_riddles", "name": "Сказки на ночь (ИИ-генератор) + загадки и скороговорки",
  "core": ["сказка на ночь", "сказки для детей", "загадки", "загадки для детей", "скороговорки", "ребусы",
           "стихи для детей", "викторина", "задачи на логику", "тест на логику", "придумать сказку"],
  "upper": ["сказка", "кроссворд"], "aio": (0.655, 0.655), "serp": "snapped"},
 {"id": "converter_translit_ru", "name": "Кириллица↔латиница и транслит (русские формулировки) + узбекский алфавит",
  "core": ["кириллица в латиницу", "транслит", "латиница в кириллицу", "перевод с кириллицы на латиницу",
           "с кириллицы на латиницу", "с латиницы на кириллицу", "транслитерация", "узбекский алфавит латиница",
           "перевести на латиницу", "конвертер кириллица латиница", "узбекский с кириллицы на латиницу",
           "узбекский латиница кириллица"],
  "upper": ["узбекский алфавит"], "aio": (0.533, 0.655), "serp": "not snapped"},
 {"id": "learn_uzbek_ru", "name": "Узбекский язык для русскоязычных (разговорник + ИИ-репетитор)",
  "core": ["как будет на узбекском", "дни недели на узбекском", "на узбекском языке", "спасибо на узбекском",
           "узбекский язык для начинающих", "узбекские слова", "русско узбекский разговорник", "привет на узбекском",
           "государственный язык узбекистана", "изучение узбекского языка", "учить узбекский язык",
           "уроки узбекского языка", "как сказать на узбекском", "числа на узбекском", "месяцы на узбекском",
           "узбекские фразы", "узбекский разговорник", "разговорник узбекский", "узбекские слова с переводом",
           "как дела на узбекском", "я тебя люблю на узбекском", "узбекская грамматика", "узбекский язык онлайн"],
  "upper": ["узбекский язык"], "aio": (0.533, 0.655), "serp": "not snapped"},
 {"id": "docs_ru", "name": "Документы на русском: характеристика, объяснительная, заявление, автобиография, письма",
  "core": ["характеристика", "характеристика образец", "характеристика на ученика", "характеристика на студента",
           "характеристика на работника", "характеристика с места работы",
           "объяснительная", "объяснительная образец", "объяснительная записка", "объяснительная записка образец",
           "заявление", "заявление на увольнение", "заявление на отпуск", "заявление образец", "заявление на работу",
           "как написать заявление", "автобиография", "автобиография образец", "коммерческое предложение",
           "коммерческое предложение образец", "гарантийное письмо", "рекомендательное письмо",
           "рекомендательное письмо образец", "благодарственное письмо", "мотивационное письмо",
           "мотивационное письмо пример", "мотивационное письмо образец", "motivation letter", "motivation letter example",
           "motivatsion xat", "служебная записка", "докладная записка", "пресс релиз", "деловое письмо",
           "деловое письмо образец", "официальное письмо", "письмо образец", "как написать письмо"],
  "upper": [], "aio": (0.533, 0.655), "serp": "not snapped"},
 {"id": "presentation_ru", "name": "Презентации на русском (Studio .pptx): «презентация на тему», шаблоны",
  "core": ["презентация на тему", "шаблоны для презентаций", "шаблоны презентаций", "создать презентацию",
           "как сделать презентацию", "презентация powerpoint", "создать презентацию онлайн бесплатно",
           "сделать презентацию бесплатно", "презентация по истории", "презентация по биологии", "презентация по географии"],
  "upper": ["презентация"], "aio": (0.533, 0.655), "serp": "not snapped"},
 {"id": "text_tools_ru", "name": "Текстовые ИИ-инструменты RU: синонимы, перефразирование, проверка ошибок, счётчик",
  "core": ["синоним", "синонимы", "антоним", "антонимы", "синоним к слову", "синонимайзер", "перефразирование текста",
           "перефразировать текст", "перефразировать текст онлайн", "краткий пересказ", "пересказать текст", "пересказ текста",
           "рерайт текста", "проверка орфографии", "проверить орфографию", "орфография онлайн", "проверка пунктуации",
           "проверить пунктуацию", "проверить текст на ошибки", "проверка текста на ошибки", "исправить ошибки в тексте",
           "орфографический словарь", "проверка текста", "проверка грамматики", "исправить ошибки",
           "проверка орфографии онлайн", "сократить текст", "счетчик символов", "счетчик слов", "подсчет символов",
           "количество символов", "посчитать количество слов", "что означает слово", "значение слова"],
  "upper": [], "aio": (0.533, 0.655), "serp": "not snapped"},
 {"id": "school_texts_ru", "name": "Школьные тексты RU: сочинение, эссе, доклад, титульный лист + краткое содержание классики",
  "core": ["сочинение", "сочинение на тему", "реферат образец", "титульный лист", "титульный лист реферата", "эссе пример",
           "реферат на тему", "эссе на тему", "доклад образец", "курсовая работа образец", "как написать эссе",
           "напиши сочинение", "сочинение про маму", "список литературы", "написать сочинение", "написать эссе",
           "мертвые души краткое содержание", "герой нашего времени краткое содержание",
           "капитанская дочка краткое содержание", "евгений онегин краткое содержание", "краткое содержание",
           "ревизор краткое содержание", "преступление и наказание краткое содержание", "война и мир краткое содержание",
           "тарас бульба краткое содержание", "дубровский краткое содержание", "муму краткое содержание",
           "станционный смотритель краткое содержание"],
  "upper": [], "aio": (0.533, 0.655), "serp": "not snapped"},
]

def dedupe(keys, vols_uz):
    """Conservative: identical volume + identical 12-month series (vol>=100) => one bucket."""
    buckets = []
    for k in keys:
        if k in prior:
            continue
        r = UZ.get(k)
        if not r or not r["v"]:
            continue
        merged = False
        for b in buckets:
            if (b["v"] == r["v"] and r["v"] >= 100 and r["ser"] and b["ser"] and r["ser"] == b["ser"]):
                b["members"].append(k); merged = True; break
        if not merged:
            buckets.append({"keyword": k, "v": r["v"], "ser": r["ser"], "members": [k], "src": r["src"]})
    return buckets

def geo_sum(buckets, table):
    tot = 0; seen = []
    for b in buckets:
        vals = [table.get(m) for m in b["members"] if table.get(m)]
        if not vals:
            continue
        tot += max(vals)
    return tot

def season(buckets):
    s = [0] * 12; n = 0
    for b in buckets:
        if b["ser"] and len(b["ser"]) == 12:
            s = [a + c for a, c in zip(s, b["ser"])]; n += b["v"]
    if not any(s):
        return None
    months = ["2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02", "2026-01", "2025-12", "2025-11", "2025-10"]
    avg = sum(s) / 12
    od = (s[11] + s[10] + s[9]) / 3
    pk = max(range(12), key=lambda i: s[i])
    return {"avg12": round(avg), "oct_dec_2025": round(od), "ratio_oct_dec": round(od / avg, 2) if avg else None,
            "peak_month": months[pk], "peak": s[pk], "sep_2026": s[0], "series_newest_first": s}

out = []
for c in CL:
    core = dedupe(c["core"], UZ)
    upper = dedupe(c["upper"], UZ)
    d_low = sum(b["v"] for b in core)
    d_high = d_low + sum(b["v"] for b in upper)
    kz_low = geo_sum(core, KZ); kg_low = geo_sum(core, KG)
    kz_high = kz_low + geo_sum(upper, KZ); kg_high = kg_low + geo_sum(upper, KG)
    p6 = v6(d_low); p6h = v6(d_high)
    p3 = v3(d_low, c["aio"]); p3h = v3(d_high, c["aio"])
    out.append({
        "id": c["id"], "name": c["name"], "serp": c["serp"], "aio_discount_top3": c["aio"],
        "demand_uz_low": d_low, "demand_uz_high": d_high,
        "demand_kz_low": kz_low, "demand_kz_high": kz_high, "demand_kg_low": kg_low, "demand_kg_high": kg_high,
        "visits_day_pos6": [round(p6[0]), round(p6h[1])],
        "visits_day_pos3": [round(min(p3)), round(max(p3h))],
        "season": season(core + upper),
        "buckets": [{"keyword": b["keyword"], "volume": b["v"], "members": b["members"], "source": b["src"],
                     "kz": max([KZ.get(m) or 0 for m in b["members"]]), "kg": max([KG.get(m) or 0 for m in b["members"]])}
                    for b in sorted(core, key=lambda x: -x["v"])],
        "upper_buckets": [{"keyword": b["keyword"], "volume": b["v"], "members": b["members"],
                           "kz": max([KZ.get(m) or 0 for m in b["members"]]), "kg": max([KG.get(m) or 0 for m in b["members"]])}
                          for b in upper],
        "skipped_as_prior": [k for k in c["core"] + c["upper"] if k in prior],
    })

# "нейросеть для …" check: every RU "нейросеть/ии для X" text-task phrase measured in UZ
ai_phr = {k: r["v"] for k, r in UZ.items() if (k.startswith("нейросеть ") or k.startswith("ии для ") or k.startswith("ии ")
          or k.startswith("искусственный интеллект ") or k.startswith("генератор ") or k.startswith("ai ")) }
summary_ai = {"n": len(ai_phr), "sum": sum(v or 0 for v in ai_phr.values()),
              "ge100": sorted([(k, v) for k, v in ai_phr.items() if (v or 0) >= 100], key=lambda x: -x[1])}

res = {"clusters": out, "ai_phrasing_check": summary_ai,
       "totals": {"uz_low": sum(c["demand_uz_low"] for c in out), "uz_high": sum(c["demand_uz_high"] for c in out),
                  "kz_low": sum(c["demand_kz_low"] for c in out), "kg_low": sum(c["demand_kg_low"] for c in out),
                  "pos6_low": sum(c["visits_day_pos6"][0] for c in out), "pos6_high": sum(c["visits_day_pos6"][1] for c in out),
                  "pos3_low": sum(c["visits_day_pos3"][0] for c in out), "pos3_high": sum(c["visits_day_pos3"][1] for c in out)}}
with open(os.path.join(HERE, "computed.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)

with open(os.path.join(HERE, "computed_summary.txt"), "w", encoding="utf-8") as f:
    for c in out:
        s = c["season"] or {}
        f.write("%s | UZ %d..%d | KZ %d..%d | KG %d..%d | pos6 %s | pos3 %s | season x%s peak %s %s sep26 %s\n" % (
            c["id"], c["demand_uz_low"], c["demand_uz_high"], c["demand_kz_low"], c["demand_kz_high"],
            c["demand_kg_low"], c["demand_kg_high"], c["visits_day_pos6"], c["visits_day_pos3"],
            s.get("ratio_oct_dec"), s.get("peak_month"), s.get("peak"), s.get("sep_2026")))
        f.write("   top: " + "; ".join("%s %d%s" % (b["keyword"], b["volume"], (" (=" + ", ".join(b["members"][1:]) + ")") if len(b["members"]) > 1 else "") for b in c["buckets"][:10]) + "\n")
        if c["upper_buckets"]:
            f.write("   upper: " + "; ".join("%s %d" % (b["keyword"], b["volume"]) for b in c["upper_buckets"]) + "\n")
        if c["skipped_as_prior"]:
            f.write("   prior-skipped: " + ", ".join(c["skipped_as_prior"]) + "\n")
    f.write("TOTALS %s\n" % res["totals"])
    f.write("AI phrasing: n=%d sum=%d ge100=%s\n" % (summary_ai["n"], summary_ai["sum"], summary_ai["ge100"]))
print("ok")
