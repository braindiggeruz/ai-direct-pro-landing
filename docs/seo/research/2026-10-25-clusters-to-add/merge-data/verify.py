# -*- coding: utf-8 -*-
"""Adversarial verification of merge.py (2026-10-25). No paid calls.

Run:  py -3 -I verify.py
Reads merge.py and render.py of this folder unchanged, applies the verifier's corrections, writes
  merge-data/merged_verified.json   (merged.json with corrections; merged.json = pre-verification record)
  ../ranked.json                     (re-rendered from merged_verified.json + "verification" block)
CLUSTERS_TO_ADD.md is maintained by hand after verification (render.py would drop the «Проверка» section).

Corrections (see CLUSTERS_TO_ADD.md §9):
  1. translator_en_ru: all four head buckets fall monotonically Oct-25 -> Sep-26 (-45 % on the head, not a season);
     forward demand = Jul-Sep 2026 run-rate = 0.8 x 12-month mean; the "Oct-Dec x1.24" December boost in the
     ranking is the year-ago level, so season factor -> 1.0.
  2. logic: Sep-26 index 0.61 while every other school-content cluster is 1.1-2.3 in Sep; heads -55 % Oct-25 -> Sep-26
     (the lens flagged it but did not apply it). Forward demand = 0.6 x 12-month mean.
  3. obyektivka (#47) and cv_builder (#43) counted keywords that the base (demand-sizing.json,
     docs_rezyume_obyektivka) already counts: obyektivka namuna 2 400, ma'lumotnoma namuna 1 600,
     obyektivka 1 000, obyektivka yozish 20, нейросеть для резюме 10 -> dropped.
  4. uzbek_for_ru (#29) repeated two keywords of other clusters (с днем рождения на узбекском 110 -> pozdravleniya,
     узбекский алфавит латиница 110 -> converter) -> dropped there.
"""
import io, os, sys, json, contextlib

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.dirname(HERE)

TREND = {"translator_en_ru": 0.8, "logic": 0.6}
SEASON_OVERRIDE = {"translator_en_ru": 1.0}
DROP = {
    "obyektivka": ["obyektivka namuna", "obyektivka namunasi", "ma'lumotnoma namuna", "obyektivka", "obyektivka yozish"],
    "cv_builder": ["нейросеть для резюме"],
    "uzbek_for_ru": ["с днем рождения на узбекском", "узбекский алфавит латиница"],
}


def patched(path, pairs):
    txt = open(path, encoding="utf-8").read()
    for a, b in pairs:
        assert a in txt, (path, a[:70])
        txt = txt.replace(a, b)
    return txt


# ---------------------------------------------------------------- merge with corrections
PATCH = (
    "\nTREND = %r\nSEASON_OVERRIDE = %r\nDROP = %r\n"
    "for _c in C:\n"
    "    if _c['id'] in TREND: _c['trend'] = TREND[_c['id']]\n"
    "    if _c['id'] in SEASON_OVERRIDE: _c['season_override'] = SEASON_OVERRIDE[_c['id']]\n"
    "    if _c['id'] in DROP: _c['drop'] = list(_c.get('drop', ())) + DROP[_c['id']]\n"
) % (TREND, SEASON_OVERRIDE, DROP)
merge_txt = patched(os.path.join(HERE, "merge.py"), [
    ('sys.stdout.reconfigure(encoding="utf-8")', 'pass'),
    ('HERE = os.path.dirname(os.path.abspath(__file__))', 'HERE = %r' % HERE),
    ('os.path.join(HERE, "merged.json")', 'os.path.join(HERE, "merged_verified.json")'),
    ('    low = sum(x["low"] for x in g)\n    up = sum(x["up"] for x in g)\n',
     '    low = sum(x["low"] for x in g) * c.get("trend", 1.0)\n    up = sum(x["up"] for x in g) * c.get("trend", 1.0)\n'),
    ('    season = 1.0 if (jump or dec is None) else max(0.8, min(1.25, dec))\n',
     '    season = 1.0 if (jump or dec is None) else max(0.8, min(1.25, dec))\n'
     '    if c.get("season_override") is not None:\n        season = c["season_override"]\n'),
    ('# ---------------------------------------------------------------- compute\n',
     PATCH + '# ---------------------------------------------------------------- compute\n'),
])
with contextlib.redirect_stdout(io.StringIO()):
    exec(compile(merge_txt, "merge.py+verify", "exec"), {"__name__": "merge_verified"})

# ---------------------------------------------------------------- ranked.json from the verified merge
render_txt = patched(os.path.join(HERE, "render.py"), [
    ('sys.stdout.reconfigure(encoding="utf-8")', 'pass'),
    ('HERE = os.path.dirname(os.path.abspath(__file__))', 'HERE = %r' % HERE),
    ('os.path.join(HERE, "merged.json")', 'os.path.join(HERE, "merged_verified.json")'),
    ('with open(os.path.join(B, "CLUSTERS_TO_ADD.md"), "w", encoding="utf-8") as f:', 'with open(os.devnull, "w", encoding="utf-8") as f:'),
])
with contextlib.redirect_stdout(io.StringIO()):
    exec(compile(render_txt, "render.py+verify", "exec"), {"__name__": "render_verified"})

V = json.load(open(os.path.join(HERE, "merged_verified.json"), encoding="utf-8"))
O = json.load(open(os.path.join(HERE, "merged.json"), encoding="utf-8"))
R = json.load(open(os.path.join(B, "ranked.json"), encoding="utf-8"))
R["verification"] = {
    "date": "2026-10-25",
    "paid_calls": 0,
    "source": "merge-data/verify.py (merge.py + corrections) -> merge-data/merged_verified.json; merged.json = before verification",
    "checked_ok": [
        "volumes of all buckets of the top-10 match the raw Google Ads rows (cu/tt/ep/ll/ru *_metrics*.json, growth-audit l3-data); only 'kalkulyator' 40 500 has no monthly series (from ad-client-funnel prices-tools kw1)",
        "no two counted buckets anywhere in the 51 clusters share an identical volume + 12-month series (no shared Google Ads bucket counted twice); exact-keyword overlaps across clusters: 2 x 110",
        "SERP claims of the top-10 match the snapshot files (serp_top.json, ep_serp_top.json, tt_serp_top.json, serp_4.json, growth-audit serp2_table.txt)",
        "visits formula, AIO discounts, sums, site potential and timeline reproduce exactly from merge.py",
    ],
    "corrections": [
        "translator_en_ru: demand 330 200 -> 264 160 (x0.8 run-rate; heads fall monotonically Oct-25 -> Sep-26, -45 % on 'перевод с английского на русский'); season factor 1.24 -> 1.0; rank 2 -> 5",
        "logic: demand 59 475 -> 35 685 (x0.6; Sep-26 index 0.61 vs 1.1-2.3 in other school clusters); rank 7 -> 11, leaves the top-10",
        "obyektivka #47: -5 020/month already counted in the base (docs_rezyume_obyektivka); cv_builder #43: -10",
        "uzbek_for_ru #29: -220/month counted twice with pozdravleniya and converter",
        "top-10 now: valyuta, sherlar, kalkulyator, english_tenses, translator_en_ru, kalendar, practice_tests, tabrik_uz, formulas, pozdravleniya",
    ],
    "totals_before": {"sums": O["sums"], "site": O["site"], "timeline": O["timeline"]},
    "risks_not_applied": [
        "kalkulyator: Google calculator widget not seen in the DataForSEO snapshot of 'калькулятор'; if it shows in a live UZ browser apply x0.533 at pos 6 (63-113 -> 34-60). Latin SERP ('kalkulyator') never pulled, so 'no Uzbek page' is unverified for Latin. 'kalkulyatr' 40 500 is an implausible misspelling volume (kept at x0.5 by the lens)",
        "translator_en_ru: if Google shows its translate box (as tested for RU-UZ in demand-sizing sensitivity) apply x0.533 at pos 6 (81-146 -> 43-78)",
        "watch list for decline (not applied): english_tenses Sep/Oct 0.62, tabrik_uz birthday heads -28 %, pozdravleniya birthday heads -30 %",
        "practice_tests: x10-100 jump since Dec-2025 of unknown origin; part of it may be pupils seeking answers during BSB/ChSB — a practice page gets impressions but low CTR; keep the GSC pilot gate",
        "base top-3 (656) keeps translator RU-UZ at top-3 (5 760 clicks/month); capped like the new strong-SERP clusters the realistic site top-3 would be ~143 lower",
    ],
}
with open(os.path.join(B, "ranked.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)

print(json.dumps({"sums": V["sums"], "site": V["site"], "timeline": V["timeline"]}, ensure_ascii=False))
for r in V["clusters"][:12]:
    print(r["rank"], r["id"], r["demand_plan"], r["v6_plan"], r["v3_plan"], r["v3_realistic"], r["weeks_to_5"], r["score"])
