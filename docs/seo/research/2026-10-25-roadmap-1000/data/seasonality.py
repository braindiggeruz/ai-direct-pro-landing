"""Seasonality of the clusters that matter for the 1000/day question.

Reads the Google Ads monthly series (DataForSEO, loc 2860) already pulled by
L3 (kw1/kw2_metrics.json). No API calls. Writes seasonality.json + .md.
"""
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
R = HERE.parents[1]
SRC = [R / "2026-10-24-growth-audit/l3-data/kw1_metrics.json",
       R / "2026-10-24-growth-audit/l3-data/kw2_metrics.json"]

GROUPS = {
    "chat_access": ["chatgpt kirish", "chatgpt uzbekcha", "chatgpt 4 uzbek tilida", "chatgpt bepul",
                     "ии онлайн", "ии чат", "ai chat", "chatgpt yuklab olish"],
    "translator_ru_uz": ["перевод с русского на узбекский", "перевод с узбекского на русский",
                          "переводчик с узбекского на русский", "узбекско русский переводчик",
                          "русско узбекский переводчик", "rus uzbek tarjimon"],
    "translator_en_uz": ["english to uzbek", "uzbek english translator", "english uzbek translator",
                          "английский узбекский переводчик", "ingliz uzbek tarjimon", "inglizcha tarjima",
                          "переводчик с английского на узбекский"],
    "script_converter": ["лотин кирилл", "кирилл лотин", "kirill lotin"],
    "school_writing": ["esse", "esse yozish", "esse namunalari", "insho", "referat", "referat namuna",
                        "mustaqil ish", "kurs ishi", "rezyume", "ariza yozish", "tushuntirish xati", "biznes reja",
                        "slayd yaratish", "prezentatsiya", "taqdimot"],
    "school_math": ["matematika misollar", "misollar yechish", "karra jadvali", "misollar"],
    "ai_info": ["suniy intellekt", "sun'iy intellekt", "сунъий интеллект", "suniy intellekt nima"],
}


def load():
    rows = {}
    for f in SRC:
        for k in json.loads(f.read_text(encoding="utf-8"))["keywords"]:
            if k.get("monthly_searches") and k["keyword"] not in rows:
                rows[k["keyword"]] = k
    return rows


def main():
    rows = load()
    out = {"source": [str(s.relative_to(R)) for s in SRC], "groups": {}}
    md = ["# Сезонность кластеров (Google Ads, loc 2860; ряды из L3, без новых вызовов)", "",
          "Корзины Google Ads склеивают близкие написания; сумма группы — верхняя граница, не точный спрос.", "",
          "| Группа | Найдено ключей | Сумма 12-мес. среднего | Мин. месяц | Макс. месяц | Макс/мин | Июль 2026 | Сен 2026 |",
          "|---|---:|---:|---|---|---:|---:|---:|"]
    for g, kws in GROUPS.items():
        found = [rows[k] for k in kws if k in rows]
        months = {}
        for k in found:
            for m in k["monthly_searches"]:
                key = (m["year"], m["month"])
                months[key] = months.get(key, 0) + (m["search_volume"] or 0)
        avg = sum(k["search_volume"] or 0 for k in found)
        series = sorted(months.items())
        if not series:
            continue
        lo = min(series, key=lambda x: x[1])
        hi = max(series, key=lambda x: x[1])
        jul = months.get((2026, 7), 0)
        sep = months.get((2026, 9), 0)
        out["groups"][g] = {
            "keywords_found": [k["keyword"] for k in found],
            "missing": [k for k in kws if k not in rows],
            "sum_12m_avg": avg,
            "series": [{"ym": f"{y}-{m:02d}", "v": v} for (y, m), v in series],
            "min": {"ym": f"{lo[0][0]}-{lo[0][1]:02d}", "v": lo[1]},
            "max": {"ym": f"{hi[0][0]}-{hi[0][1]:02d}", "v": hi[1]},
            "max_over_min": round(hi[1] / lo[1], 2) if lo[1] else None,
            "jul_2026": jul, "sep_2026": sep,
        }
        md.append(f"| {g} | {len(found)}/{len(kws)} | {avg} | {lo[0][0]}-{lo[0][1]:02d}: {lo[1]} | "
                  f"{hi[0][0]}-{hi[0][1]:02d}: {hi[1]} | {out['groups'][g]['max_over_min']} | {jul} | {sep} |")
    md.append("")
    md.append("## Помесячные ряды (сумма по группе)")
    for g, d in out["groups"].items():
        md.append(f"- **{g}**: " + ", ".join(f"{s['ym'][2:]} {s['v']}" for s in d["series"]))
        if d["missing"]:
            md.append(f"  - нет ряда в kw1/kw2: {', '.join(d['missing'])}")
    (HERE / "seasonality.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    (HERE / "seasonality.md").write_text("\n".join(md).replace(",", " ") + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
