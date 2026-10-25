"""Back-of-envelope ceiling model for "1 000-2 000 visits/day" on gptbot.uz.

No API calls. Every input is copied from a cited file; the point is to make the
arithmetic reproducible, not to forecast. Writes feasibility_model.json.

Sources (all relative to docs/seo/research/):
  GA4 28d 2026-09-26..10-23  -> F:/Claude/MONEY_ROBOT_GPTBOT_2026/_work/baseline.md §7.1, §7.5
  GSC 28d 2026-09-24..10-21  -> baseline.md §1, §2
  CTR curve (UZ, no chats)   -> 2026-10-24-growth-audit/L1-ctr.md §3.3
  Demand (Google Ads, 2860)  -> 2026-10-24-snippets-translator/translator-market.md §1.5,
                                2026-10-24-growth-audit/L3-demand-gaps.md §1 p.1,
                                2026-10-25-roadmap-1000/data/seasonality.json
  Backlog expectation        -> 2026-10-24-growth-audit/BACKLOG.md §1, summary.txt
"""
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
D28 = 28 / 30.4

# --- current state -------------------------------------------------------
ga4 = {"organic": 1863, "direct": 514, "total": 2805, "google_organic": 1251, "yandex_rows": 589}
gsc = {"clicks": 1584, "impr": 214911, "chats_clicks": 489 + 280, "chats_impr": 74002 + 94001,
       "download_clicks": 557, "download_impr": 23438}
ga4_per_gsc_click = ga4["google_organic"] / gsc["clicks"]          # 0.79, windows differ by 2 days
google_share_of_organic = ga4["google_organic"] / ga4["organic"]    # 0.67 (Yandex ~0.32)
direct_per_organic = ga4["direct"] / ga4["organic"]                 # 0.28

ctr = {"pos3": 0.0359, "pos4": 0.0218, "pos5": 0.0087, "pos6": 0.0110, "pos7": 0.0038, "pos8": 0.0068}

# --- demand pools (monthly, Uzbekistan only, upper bounds) ---------------
pools = {
    "translator_ru_uz": 90500 + 60500 + 49500 + 27100 + 22200 + 12100 + 1300 + 1000 + 6600 + 4400 + 2900,
    "translator_en_uz_core": 48900,
    "script_converter": 6600 + 3600 + 1900,
    "school_writing": 29190,
    "school_math": 27000,
    "ai_info": 17600,
}


def per_day_from_month(clicks_month):
    return clicks_month / 30.4


def to_visits(google_clicks_day):
    google_sessions = google_clicks_day * ga4_per_gsc_click
    organic = google_sessions / google_share_of_organic
    direct = organic * direct_per_organic
    return {"google_clicks_day": round(google_clicks_day, 1), "organic_sessions_day": round(organic, 1),
            "direct_sessions_day": round(direct, 1), "organic_plus_direct_day": round(organic + direct, 1)}


now = to_visits(gsc["clicks"] / 28)

# What Google clicks/day does 1 000 and 2 000 organic+direct need, at today's mix?
need = {}
for target in (1000, 2000):
    organic = target / (1 + direct_per_organic)
    google_sessions = organic * google_share_of_organic
    google_clicks = google_sessions / ga4_per_gsc_click
    need[target] = {"organic_sessions_day": round(organic), "google_clicks_day": round(google_clicks),
                    "google_clicks_month": round(google_clicks * 30.4),
                    "x_vs_now": round(google_clicks / (gsc["clicks"] / 28), 1),
                    "top3_impressions_month_at_3_59pct": round(google_clicks * 30.4 / ctr["pos3"])}

# Ceiling: every pool at position 3 with the site's own pos-3 CTR (optimistic: pos-3 cell
# is dominated by one page; pos 1-2 cells hold ~100 impressions each and are unusable).
ceiling = {
    "chats_at_pos3": per_day_from_month(gsc["chats_impr"] / D28 * ctr["pos3"]),
    "download_guide_now": gsc["download_clicks"] / 28,
}
for k, v in pools.items():
    ceiling[k + "_at_pos3"] = per_day_from_month(v * ctr["pos3"])
ceiling["rest_of_site_now"] = (gsc["clicks"] - gsc["chats_clicks"] - gsc["download_clicks"]) / 28
ceiling_total = sum(ceiling.values())

# Realistic-ish: translators/converter at pos 6-8 (L3 method), chats stay, backlog lands.
realistic = {
    "today": gsc["clicks"] / 28,
    "backlog_waves_1_3_low": 38 / 28, "backlog_waves_1_3_high": 155 / 28,
    "translator_ru_uz_pos6_8_low": per_day_from_month(pools["translator_ru_uz"] * ctr["pos7"]),
    "translator_ru_uz_pos6_8_high": per_day_from_month(pools["translator_ru_uz"] * ctr["pos6"]),
}
real_low = realistic["today"] + realistic["backlog_waves_1_3_low"] + realistic["translator_ru_uz_pos6_8_low"]
real_high = realistic["today"] + realistic["backlog_waves_1_3_high"] + realistic["translator_ru_uz_pos6_8_high"]

out = {
    "ratios": {"ga4_google_sessions_per_gsc_click": round(ga4_per_gsc_click, 3),
               "google_share_of_organic_sessions": round(google_share_of_organic, 3),
               "direct_per_organic": round(direct_per_organic, 3)},
    "now": now,
    "need": need,
    "pools_month": pools,
    "ceiling_google_clicks_day": {k: round(v, 1) for k, v in ceiling.items()},
    "ceiling_total_google_clicks_day": round(ceiling_total, 1),
    "ceiling_visits": to_visits(ceiling_total),
    "realistic_google_clicks_day": {"low": round(real_low, 1), "high": round(real_high, 1)},
    "realistic_visits": {"low": to_visits(real_low), "high": to_visits(real_high)},
}
(HERE / "feasibility_model.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps(out, ensure_ascii=False, indent=1))
