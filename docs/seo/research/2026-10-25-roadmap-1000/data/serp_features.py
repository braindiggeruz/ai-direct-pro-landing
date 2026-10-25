"""Tally click-eating SERP features across SERPs already pulled on 2026-10-24.

No API calls. Sources: L3 serp1/serp2 (depth 20, desktop, hl ru), L6 serp_l6 +
serp_l6_hlru (mobile/desktop), translator-market serp (5 queries). For each
query: AI Overview present and its absolute rank, video block, app pack, and
how many of the top-10 organic results are Google/Yandex translate, YouTube,
Play, Facebook/Instagram video, chatgpt.com/openai.com.
"""
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
R = HERE.parents[1]

PLATFORM = {
    "google_translate": re.compile(r"translate\.google\.|translate\.goog"),
    "yandex": re.compile(r"(translate\.)?yandex\.|ya\.ru"),
    "youtube_social_video": re.compile(r"youtube\.com|youtu\.be|facebook\.com/.*/videos|instagram\.com/reel"),
    "play_app": re.compile(r"play\.google\.com|apps\.apple\.com"),
    "openai": re.compile(r"chatgpt\.com|openai\.com"),
}


def classify(url):
    hits = [k for k, rx in PLATFORM.items() if url and rx.search(url)]
    return hits[0] if hits else "independent"


def from_l3(path, tag):
    out = []
    for r in json.loads(path.read_text(encoding="utf-8"))["results"]:
        items = r.get("items") or []
        out.append(row(r["keyword"], tag, [(i.get("rank"), i.get("organicRank"), i.get("type"), i.get("url")) for i in items]))
    return out


def from_l6(path, tag):
    out = []
    d = json.loads(path.read_text(encoding="utf-8"))
    for kw, v in d["keywords"].items():
        out.append(row(kw, tag, [(x[0], x[1], x[2], x[3]) for x in v["rows"]]))
    return out


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def row(keyword, tag, items):
    items = [(_int(i[0]), _int(i[1]), i[2], i[3]) for i in items]
    aio = [i[0] for i in items if i[2] == "ai_overview"]
    video = [i[0] for i in items if i[2] in ("video", "short_videos")]
    app = [i[0] for i in items if i[2] == "app"]
    organic10 = [i for i in items if i[2] == "organic" and i[1] is not None and i[1] <= 10]
    plat = {}
    for i in organic10:
        c = classify(i[3])
        plat[c] = plat.get(c, 0) + 1
    _org = [i[0] for i in items if i[2] == "organic" and i[0] is not None]
    first_organic_abs = min(_org) if _org else None
    return {
        "keyword": keyword, "set": tag,
        "ai_overview_rank": aio[0] if aio else None,
        "video_rank": video[0] if video else None,
        "app_rank": app[0] if app else None,
        "first_organic_abs_rank": first_organic_abs,
        "top10_by_platform": plat,
        "independent_in_top10": plat.get("independent", 0),
    }


def from_translator(path):
    out = []
    for q in json.loads(path.read_text(encoding="utf-8"))["serp"]:
        feats = " ".join(q.get("features", []))
        m = re.search(r"ai_overview \(rank (\d+)", feats)
        plat = {}
        for t in q["top10"]:
            c = classify("https://" + t["domain"] + "/")
            plat[c] = plat.get(c, 0) + 1
        out.append({"keyword": q["query"], "set": "translator(desktop,hl ru)",
                    "ai_overview_rank": int(m.group(1)) if m else ("present" if "ai_overview" in feats else None),
                    "video_rank": None, "app_rank": None, "first_organic_abs_rank": None,
                    "top10_by_platform": plat, "independent_in_top10": plat.get("independent", 0)})
    return out


def main():
    rows = []
    rows += from_l3(R / "2026-10-24-growth-audit/l3-data/serp1.json", "L3-serp1(desktop,hl ru)")
    rows += from_l3(R / "2026-10-24-growth-audit/l3-data/serp2.json", "L3-serp2(desktop,hl ru)")
    rows += from_l6(R / "2026-10-24-growth-audit/l6-data/serp_l6.json", "L6(mobile,hl by lang)")
    rows += from_l6(R / "2026-10-24-growth-audit/l6-data/serp_l6_hlru.json", "L6-hlru")
    rows += from_translator(R / "2026-10-24-snippets-translator/translator-market.json")
    n = len(rows)
    aio = sum(1 for r in rows if r["ai_overview_rank"] is not None)
    aio_top2 = sum(1 for r in rows if isinstance(r["ai_overview_rank"], int) and r["ai_overview_rank"] <= 2)
    vid = sum(1 for r in rows if r["video_rank"] is not None)
    summary = {"serps": n, "with_ai_overview": aio, "ai_overview_rank_le2": aio_top2, "with_video_block": vid,
               "note": "video/app counted only where the source kept non-organic rows (L3, L6); translator set lists features separately"}
    (HERE / "serp_features.json").write_text(json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
    md = ["| Запрос | Набор | AI Overview (ранг) | Видео (ранг) | App (ранг) | Топ-10 органики: независимых | Платформы в топ-10 |", "|---|---|---|---|---|---:|---|"]
    for r in rows:
        md.append(f"| {r['keyword']} | {r['set']} | {r['ai_overview_rank'] or '—'} | {r['video_rank'] or '—'} | {r['app_rank'] or '—'} | {r['independent_in_top10']} | "
                  + ", ".join(f"{k} {v}" for k, v in sorted(r['top10_by_platform'].items()) if k != 'independent') + " |")
    md.append("")
    md.append(f"Итого SERP: {n}; с AI Overview: {aio}; AI Overview на ранге 1–2: {aio_top2}; с видеоблоком: {vid}.")
    (HERE / "serp_features.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
