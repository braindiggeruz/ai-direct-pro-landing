"""Roadmap model for ROADMAP.md (2026-10-25).

Joins the three parallel steps into one visits/day table:
  - demand-sizing.json   -> Google clicks/month per cluster (today, top10_low, top10_high, top3)
  - data/feasibility_model.json -> GA4 ratios (0.79 capture, 0.671 Google share, 0.276 direct)
  - channels-data/channels_compute.out.json + channels.md table 1 -> non-search channels

Run from this folder:  py -3 -I roadmap_model.py   -> writes roadmap_model.json next to it.
Every ramp fraction below is an ASSUMPTION (marked) anchored on:
  K = 0.04 in month 1 (growth-audit synth-data/calibration.json),
  best page plateau at week 6-7 (feasibility.md 3.2),
  translator gate "8 weeks after quota" (feasibility.md 6).
"""
import json
import sys
sys.stdout.reconfigure(encoding="utf-8")
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

demand = json.load(open(os.path.join(ROOT, "demand-sizing.json"), encoding="utf-8"))
feas = json.load(open(os.path.join(HERE, "feasibility_model.json"), encoding="utf-8"))
chan = json.load(open(os.path.join(ROOT, "channels-data", "channels_compute.out.json"), encoding="utf-8"))

DAYS = 30.44
r = feas["ratios"]
# visits (GA4 organic + direct, non-paid) per GSC click
G_SESS = r["ga4_google_sessions_per_gsc_click"]            # 0.79
ORG = G_SESS / r["google_share_of_organic_sessions"]        # organic sessions per click
OTHER_SEARCH = ORG - G_SESS                                 # Yandex + Bing + small engines per click
DIRECT = r["direct_per_organic"] * ORG                      # direct per click
M = G_SESS + OTHER_SEARCH + DIRECT                          # ~1.50

clusters = {c["id"]: c["clicks_month"] for c in demand["clusters"]}
FLAT = demand["summary"]["flat_rows"]["monthly"]            # 417 anonymised + other
WIDGET_LOW = demand["summary"]["sensitivity"]["translator_ru_uz_top10_if_translate_box"]["clicks_month"][0]  # 983

# ---- groups shown in ROADMAP.md table 2 ---------------------------------------
GROUPS = [
    ("Переводчик RU↔UZ", ["translator_ru_uz"], "tool_live"),
    ("Переводчик EN↔UZ + TR/KO/AR↔UZ", ["translator_en_uz", "translator_other_pairs"], "tool_new"),
    ("Конвертер кириллица↔латиница", ["converter_cyr_lat"], "tool_live"),
    ("Чаты: «ChatGPT + язык/бесплатно/онлайн»", ["ai_chat_brand_modifier"], "leader_chat"),
    ("Чаты: ИИ без бренда (ии онлайн, нейросеть)", ["ai_chat_generic"], "tool_live"),
    ("Гайд по скачиванию и how-to", ["chatgpt_howto"], "leader_howto"),
    ("Навигация к ChatGPT (держим, не растёт)", ["nav_chatgpt_brand"], "hold"),
    ("Slayd/prezentatsiya (Studio)", ["school_slayd", "test_generator_teacher"], "tool_live"),
    ("Решатель задач + генератор примеров", ["solver_misol_masala", "math_examples_generator"], "tool_new"),
    ("Тексты и документы (referat, insho, ariza, rezyume, tabrik, sun’iy intellekt…)",
     ["school_referat", "school_insho_esse", "school_kurs_ishi", "docs_ariza_xat", "docs_tavsifnoma",
      "docs_rezyume_obyektivka", "docs_biznes_reja", "tabrik", "ai_basics"], "info"),
    ("B2B (держим, новых страниц не делаем)", ["b2b_bots", "b2b_agency"], "hold"),
    ("Прочие и анонимизированные запросы GSC (держим)", ["__flat__"], "hold"),
]

# ---- ramp: share of the top-10 (pos ~6) value reached at 3/6/12 months (ASSUMPTIONS) ----
H = ["m3", "m6", "m12"]
RAMP = {
    # conservative: no free translator quota, no real links, no new tools; top10_LOW, RU↔UZ with Translate-widget discount
    "cons": {"tool_live": [0.04, 0.10, 0.25], "tool_new": [0, 0, 0], "info": [0.04, 0.10, 0.25]},
    # target: owner decisions taken (quota by 15.12, links, video); range top10_low..top10_high
    "target": {"tool_live": [0.04, 0.50, 1.00], "tool_new": [0, 0.25, 1.00], "info": [0.04, 0.20, 0.50]},
}

# non-search channels that do NOT scale with Google (channels.md table 1; Bing/Yandex/Direct are inside M)
OTHER_CH = {  # (low, high) visits/day
    "AI-ассистенты": {"now": 1.6, "m3": (2, 5), "m6": (3, 10)},
    "Telegram": {"now": 0, "m3": (0, 5), "m6": (0, 15)},
    "YouTube и короткие видео": {"now": 0, "m3": (0, 3), "m6": (0, 10)},
    "Каталоги и рефералы": {"now": 1.0, "m3": (0.5, 3), "m6": (1, 5)},
    "Шеринг (вирусность)": {"now": 0, "m3": (0, 2), "m6": (0, 5)},
    "Неопознанные (шум) + Organic Social без рекламной недели": {"now": 3.5 + (70 - 56) / 28, "m3": (3, 3), "m6": (3, 3)},  # 56 FB/IG referrals of the paid week excluded, as in channels_compute.py:51
}
for v in OTHER_CH.values():
    v["m12"] = v["m6"]  # ASSUMPTION: no channel data beyond 6 months -> hold the 6-month range


def cm(cid, key):
    if cid == "__flat__":
        return FLAT
    return clusters[cid][key]


def group_value(ids, kind, scen, hi):
    """clicks/month per horizon for a group."""
    out = []
    for i, h in enumerate(H):
        tot = 0.0
        for cid in ids:
            today = cm(cid, "today")
            if kind == "hold":
                v = today
            elif kind == "leader_howto":
                v = today if scen == "cons" else cm(cid, "top3")  # R-S2 16.11; top3 = 619 vs 606 today
            elif kind == "leader_chat":
                if scen == "cons":
                    v = today
                else:  # target: windows read 21-25.11, revisions Mar-May (feasibility stage 3)
                    v = [today, cm(cid, "top10_high"), cm(cid, "top3")][i]
            else:
                f = RAMP[scen][kind][i]
                if scen == "cons":
                    base = WIDGET_LOW if cid == "translator_ru_uz" else cm(cid, "top10_low")
                else:
                    base = cm(cid, "top10_high" if hi else "top10_low")
                v = max(today, f * base)
            tot += v
        out.append(tot)
    return out


rows = []
tot = {s: {h: [0.0, 0.0] for h in H} for s in ("cons", "target")}
today_total = 0
for name, ids, kind in GROUPS:
    t = sum(cm(c, "today") for c in ids)
    today_total += t
    c_lo = group_value(ids, kind, "cons", False)
    t_lo = group_value(ids, kind, "target", False)
    t_hi = group_value(ids, kind, "target", True)
    top3 = sum(cm(c, "top3") for c in ids)
    row = {"group": name, "kind": kind, "today_clicks_month": t, "top3_clicks_month": top3,
           "visits_day": {"today": round(t / DAYS * M, 1), "top3_ceiling": round(top3 / DAYS * M, 1)}}
    for i, h in enumerate(H):
        row["visits_day"]["cons_" + h] = round(c_lo[i] / DAYS * M, 1)
        row["visits_day"]["target_" + h] = [round(t_lo[i] / DAYS * M, 1), round(t_hi[i] / DAYS * M, 1)]
        tot["cons"][h][0] += c_lo[i]
        tot["cons"][h][1] += c_lo[i]
        tot["target"][h][0] += t_lo[i]
        tot["target"][h][1] += t_hi[i]
    rows.append(row)

summary = {}
for s in ("cons", "target"):
    for h in H:
        lo_c, hi_c = tot[s][h]
        oc_lo = sum(v[h][0] for v in OTHER_CH.values())
        oc_hi = sum(v[h][1] for v in OTHER_CH.values())
        oc = (oc_lo, oc_lo) if s == "cons" else (oc_lo, oc_hi)
        summary[f"{s}_{h}"] = {
            "google_clicks_day": [round(lo_c / DAYS, 1), round(hi_c / DAYS, 1)],
            "search_direct_visits_day": [round(lo_c / DAYS * M, 1), round(hi_c / DAYS * M, 1)],
            "split_day": {
                "google_ga4": [round(lo_c / DAYS * G_SESS, 1), round(hi_c / DAYS * G_SESS, 1)],
                "yandex_bing_other_search": [round(lo_c / DAYS * OTHER_SEARCH, 1), round(hi_c / DAYS * OTHER_SEARCH, 1)],
                "direct": [round(lo_c / DAYS * DIRECT, 1), round(hi_c / DAYS * DIRECT, 1)],
            },
            "other_channels_day": [round(oc[0], 1), round(oc[1], 1)],
            "total_visits_day": [round(lo_c / DAYS * M + oc[0]), round(hi_c / DAYS * M + oc[1])],
        }

now_other = sum(v["now"] for v in OTHER_CH.values())
today_clicks_day = today_total / DAYS

# Yandex lag sensitivity (channels.md 4.1: elasticity ~0.6 instead of a fixed 0.49 ratio)
def yandex_lag_loss(clicks_day):
    g = clicks_day * G_SESS
    g0, y0 = chan["yandex_by_28d"]["Oct (09-27..10-24)"]["google_per_day"], chan["yandex_by_28d"]["Oct (09-27..10-24)"]["yandex_per_day"]
    y_fixed = y0 / g0 * g
    y_elastic = y0 * (1 + 0.6 * (g / g0 - 1))
    return round(y_fixed - y_elastic, 1)

t12 = summary["target_m12"]["google_clicks_day"]

# ---- current-model ceiling: same pages/queries, leaders at top-3, nothing new ----
cur_demand = (today_total - cm("chatgpt_howto", "today") - cm("ai_chat_brand_modifier", "today")
              + cm("chatgpt_howto", "top3") + cm("ai_chat_brand_modifier", "top3")) / DAYS
cur_feas = feas["now"]["google_clicks_day"] + (feas["ceiling_google_clicks_day"]["chats_at_pos3"] - 27.5)

# ---- ceilings ----
top3_disc = demand["summary"]["totals_clicks_day"]["top3"]                                    # 433
top3_nodisc = demand["summary"]["sensitivity"]["top3_no_aio_discount"]["clicks_month"] / DAYS  # ~728
feas_ceiling = feas["ceiling_total_google_clicks_day"]                                         # 732
opt = demand["summary"]["sensitivity"]["top3_ctr_pos2_thin_cell_no_discount"]["clicks_month"] / DAYS

# ---- translator free-quota cost (feasibility 3.4 prices; 3 translations/visit is feasibility's assumption) ----
PRICE_PER_1000 = (0.31, 0.85)   # USD, glm-4.7-flashx .. glm-4.5-air, 1500 in + 500 out tokens
UZS = 11778.45
def quota_cost(visits_day, per_visit=3):
    n = visits_day * per_visit * DAYS
    return [round(n / 1000 * p, 1) for p in PRICE_PER_1000]

tr_ids = ["translator_ru_uz", "translator_en_uz", "translator_other_pairs"]
tr_t12 = [sum(max(cm(c, "today"), cm(c, k)) for c in tr_ids) / DAYS * M for k in ("top10_low", "top10_high")]
tr_top3 = sum(cm(c, "top3") for c in tr_ids) / DAYS * M
tr_rows = [rw for rw in rows if rw["group"].startswith("Переводчик")]
tr_t6 = [sum(rw["visits_day"]["target_m6"][j] for rw in tr_rows) for j in (0, 1)]

out = {
    "multiplier_visits_per_gsc_click": round(M, 3),
    "split_per_click": {"google_ga4": round(G_SESS, 3), "yandex_bing_other": round(OTHER_SEARCH, 3), "direct": round(DIRECT, 3)},
    "now": {"google_clicks_day": round(today_clicks_day, 1), "search_direct_visits_day": round(today_clicks_day * M, 1),
            "other_channels_day": round(now_other, 1), "total_nonpaid_model": round(today_clicks_day * M + now_other, 1),
            "total_nonpaid_ga4_channels": chan["nonpaid_per_day"], "total_ga4_channels": chan["total_per_day"]},
    "need": {str(v): {"google_clicks_day_no_other": round(v / M), "google_clicks_day_with_other_6m_high": round((v - 48) / M)} for v in (1000, 2000)},
    "current_model_ceiling": {"demand_sizing_google_clicks_day": round(cur_demand, 1), "visits_day": round(cur_demand * M + now_other),
                              "feasibility_chats_top3_google_clicks_day": round(cur_feas, 1), "visits_day_feas": round(cur_feas * M + now_other)},
    "ceilings": {"top3_aio_discount": {"clicks_day": top3_disc, "visits_day": round(top3_disc * M)},
                 "top3_no_discount": {"clicks_day": round(top3_nodisc), "visits_day": round(top3_nodisc * M)},
                 "feasibility_all_pos3": {"clicks_day": feas_ceiling, "visits_day": round(feas_ceiling * M)},
                 "optimistic_thin_cell_pos2": {"clicks_day": round(opt), "visits_day": round(opt * M)}},
    "rows": rows,
    "summary": summary,
    "yandex_lag_loss_target_m12_visits_day": [yandex_lag_loss(t12[0]), yandex_lag_loss(t12[1])],
    "translator_quota_cost": {
        "target_m12_translator_visits_day": [round(x, 1) for x in tr_t12],
        "target_m12_usd_month": [quota_cost(x) for x in tr_t12],
        "target_m6_translator_visits_day": [round(x, 1) for x in tr_t6],
        "target_m6_usd_month": [quota_cost(x) for x in tr_t6],
        "translator_top3_visits_day": round(tr_top3, 1), "top3_usd_month": quota_cost(tr_top3),
        "site_1000_visits_usd_month": quota_cost(1000),
        "site_1000_uzs_month": [round(x * UZS / 1000) * 1000 for x in quota_cost(1000)],
        "revenue_ga4_28d_uzs": 2 * 20000,
    },
    "ramp_assumptions": RAMP,
    "other_channels": OTHER_CH,
}
json.dump(out, open(os.path.join(HERE, "roadmap_model.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps({k: out[k] for k in ("multiplier_visits_per_gsc_click", "split_per_click", "now", "need", "current_model_ceiling", "ceilings", "yandex_lag_loss_target_m12_visits_day", "translator_quota_cost")}, ensure_ascii=False, indent=1))
for k, v in summary.items():
    print(k, v)
for rw in rows:
    print(rw["group"], rw["visits_day"])
