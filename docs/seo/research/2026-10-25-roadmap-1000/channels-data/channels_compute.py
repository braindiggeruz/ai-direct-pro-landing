"""Derive per-channel daily rates, trends and the GA4/GSC capture ratio for channels.md.
Input: ga4_gsc_pulls.json (same folder). Run: py -3 channels_compute.py
"""
import json, pathlib, datetime as dt

D = json.loads((pathlib.Path(__file__).with_name("ga4_gsc_pulls.json")).read_text(encoding="utf-8"))
out = {}

def yandex(rows):
    return sum(v for k, v in rows.items() if isinstance(v, (int, float)) and (k.startswith("yandex") or k.startswith("ya.ru")) and "cpc" not in k)

sm = D["ga4_source_medium"]
win = {"Aug (08-02..08-29)": "2026-08-02..2026-08-29", "Sep (08-30..09-26)": "2026-08-30..2026-09-26", "Oct (09-27..10-24)": "2026-09-27..2026-10-24"}
yt = {}
for name, key in win.items():
    r = sm[key]
    y, g = yandex(r), r["google / organic"]
    b = r.get("bing / organic", 0)
    yt[name] = {"yandex": y, "google": g, "bing": b, "yandex_per_day": round(y / 28, 1), "google_per_day": round(g / 28, 1),
                "yandex_share_of_search": round(y / (y + g + b), 3), "yandex_to_google": round(y / g, 2)}
out["yandex_by_28d"] = yt

wk = D["ga4_weekly_source_medium"]
out["weekly"] = {w: {"google": r["google / organic"], "yandex": r["yandex.uz"] + r["yandex.ru"] + r["yandex_other"],
                     "direct": r["(direct)"], "chatgpt": r["chatgpt.com / ai-assistant"], "paid": r["paid"]} for w, r in wk.items()}

clicks = D["gsc_daily_clicks_2026-07-27..2026-10-24"]
assert len(clicks) == 90, len(clicks)
start = dt.date(2026, 7, 27)
def gsc(a, b):
    i, j = (dt.date.fromisoformat(a) - start).days, (dt.date.fromisoformat(b) - start).days
    return sum(clicks[i:j + 1])
cap = {}
for name, key in win.items():
    a, b = key.split("..")
    c = gsc(a, b)
    g = sm[key]["google / organic"]
    cap[name] = {"gsc_clicks": c, "ga4_google_organic": g, "ga4_capture": round(g / c, 2)}
out["ga4_vs_gsc_capture"] = cap
cap_oct = cap["Oct (09-27..10-24)"]["ga4_capture"]
y_oct = yt["Oct (09-27..10-24)"]["yandex"]
out["yandex_oct_if_same_capture_per_day"] = round(y_oct / cap_oct / 28, 1)

cg = D["ga4_channel_group"]
cur, prev = cg["2026-09-27..2026-10-24"], cg["2026-08-30..2026-09-26"]
out["channel_per_day_28d"] = {k: {"now": round(v / 28, 1), "prev": round(prev.get(k, 0) / 28, 1),
                                  "change_pct": (round(100 * (v - prev.get(k, 0)) / prev[k]) if prev.get(k) else None)} for k, v in cur.items()}
tot = sum(cur.values())
out["total_sessions_28d"] = tot
out["total_per_day"] = round(tot / 28, 1)
nonpaid = tot - cur["Paid Social"] - cur["Paid Other"] - 56  # 56 = FB/IG referrals in the paid-burst week
out["nonpaid_per_day"] = round(nonpaid / 28, 1)
r = D["ga4_new_vs_returning_28d"]
out["returning_user_share"] = round(r["returning_users"] / (r["new_users"] + r["returning_users"]), 3)
ai = sm["2026-09-27..2026-10-24"]
ai_sum = sum(ai[k] for k in ["chatgpt.com / ai-assistant", "chatgpt.com / organic", "gemini.google.com / ai-assistant", "gemini / ai-assistant", "perplexity / (not set)", "perplexity.ai / ai-assistant", "copilot.com / (not set)"])
out["ai_assistant_all_sources_28d"] = ai_sum
sc = D["external"]["statcounter_uz_search_share_2026-09"]
out["yandex_over_index_vs_market"] = round(yt["Oct (09-27..10-24)"]["yandex_share_of_search"] / (sc["Yandex"] / 100), 2)
print(json.dumps(out, ensure_ascii=False, indent=1))
(pathlib.Path(__file__).with_name("channels_compute.out.json")).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
