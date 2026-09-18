#!/usr/bin/env python3
"""
Charts for the GSC audit (matplotlib, PNG). Reads the derived CSVs written by
analysis.py; never reads raw/. One measure per axis (no dual-axis charts),
fixed categorical colour order, thin marks, direct labels only where useful.
Output: docs/seo/gsc-audit-2026-09-17/charts/*.png
"""
from __future__ import annotations

from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent.parent / "docs" / "seo" / "gsc-audit-2026-09-17"
CSV = OUT / "csv"
CH = OUT / "charts"
CH.mkdir(parents=True, exist_ok=True)

# validated default categorical palette (dataviz skill reference instance, light surface)
C = {"blue": "#2a78d6", "orange": "#eb6834", "aqua": "#1baf7a", "yellow": "#eda100", "magenta": "#e87ba4", "green": "#008300", "violet": "#4a3aa7", "red": "#e34948"}
SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e6e5e1"
plt.rcParams.update({"figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "axes.edgecolor": GRID, "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2,
                     "text.color": INK, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6, "axes.spines.top": False, "axes.spines.right": False,
                     "font.size": 10, "axes.titlesize": 12, "axes.titleweight": "bold", "axes.titlelocation": "left", "legend.frameon": False})


def finish(fig, name, note=None):
    if note:
        fig.text(0.01, 0.005, note, fontsize=8, color=INK2)
    fig.tight_layout(rect=(0, 0.03 if note else 0, 1, 1))
    fig.savefig(CH / f"{name}.png", dpi=150)
    plt.close(fig)
    print("  chart", name)


daily = pd.read_csv(CSV / "daily_trend.csv", parse_dates=["date"])
SRC = "Source: GSC Search Analytics, sc-domain:gptbot.uz, final data 2026-05-21..2026-09-14, web search type."

# 1-4 single-measure time series
for col, title, color, name, fmt in (("clicks", "Clicks per day", C["blue"], "01_clicks_daily", "{:.0f}"),
                                     ("impressions", "Impressions per day", C["orange"], "02_impressions_daily", "{:.0f}"),
                                     ("ctr", "CTR per day (clicks / impressions)", C["aqua"], "03_ctr_daily", "{:.1%}"),
                                     ("position", "Average position per day (lower is better)", C["violet"], "04_position_daily", "{:.1f}")):
    fig, ax = plt.subplots(figsize=(11, 3.8))
    ax.plot(daily["date"], daily[col], color=color, linewidth=1.2, alpha=0.55, label="daily")
    roll = daily[col].rolling(7, min_periods=1).mean()
    ax.plot(daily["date"], roll, color=color, linewidth=2.2, label="7-day average")
    if col == "position":
        ax.invert_yaxis()
    ax.set_title(title)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
    ax.legend(loc="upper left")
    last = daily.iloc[-1]
    ax.annotate(fmt.format(last[col]), (last["date"], last[col]), xytext=(6, 0), textcoords="offset points", fontsize=9, color=INK)
    finish(fig, name, SRC)

# 5 brand vs non-brand vs anonymized (stacked, 90 days)
b = pd.read_csv(CSV / "brand_vs_nonbrand_daily.csv", parse_dates=["date"])
fig, ax = plt.subplots(figsize=(11, 4))
ax.stackplot(b["date"], b["clicks_nonbrand"], b["clicks_brand"], b["clicks_anonymized"], colors=[C["blue"], C["orange"], "#c9c8c2"], labels=["non-brand queries", "brand queries", "anonymized (not reported per query)"], linewidth=0)
ax.set_title("Clicks per day: brand vs non-brand vs anonymized, last 90 days")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
ax.legend(loc="upper left")
finish(fig, "05_brand_vs_nonbrand_daily", "Anonymized = property total minus the sum of reported query rows. Brand share is ~1% of clicks.")

# 6 devices: clicks share and position, 28d vs prev28 (two small multiples, one measure each)
dev = pd.read_csv(CSV / "device_comparison.csv")
dev = dev[dev["device"].isin(["MOBILE", "DESKTOP", "TABLET"])].set_index("device").loc[["MOBILE", "DESKTOP", "TABLET"]]
fig, axes = plt.subplots(1, 3, figsize=(12, 3.8))
x = range(3)
for ax, (cur, prev, title) in zip(axes, (("current_clicks", "previous_clicks", "Clicks"), ("current_impressions", "previous_impressions", "Impressions"), ("current_position", "previous_position", "Avg position (lower = better)"))):
    ax.bar([i - 0.2 for i in x], dev[prev], width=0.38, color="#c9c8c2", label="21 Jul–17 Aug")
    ax.bar([i + 0.2 for i in x], dev[cur], width=0.38, color=C["blue"], label="18 Aug–14 Sep")
    ax.set_xticks(list(x)); ax.set_xticklabels(dev.index)
    ax.set_title(title)
    for i, v in enumerate(dev[cur]):
        ax.annotate(f"{v:,.0f}" if "position" not in cur else f"{v:.1f}", (i + 0.2, v), ha="center", va="bottom", fontsize=8)
axes[0].legend(loc="upper right")
finish(fig, "06_devices_28d_vs_prev28", SRC)

# 7 countries top 8 by impressions (28d)
cty = pd.read_csv(CSV / "country_comparison.csv").head(8)
fig, axes = plt.subplots(1, 2, figsize=(12, 3.8))
axes[0].barh(cty["country"][::-1], cty["current_impressions"][::-1], color=C["orange"], height=0.6)
axes[0].set_title("Impressions by country, 18 Aug–14 Sep")
axes[1].barh(cty["country"][::-1], cty["current_clicks"][::-1], color=C["blue"], height=0.6)
axes[1].set_title("Clicks by country, 18 Aug–14 Sep")
for ax, col in zip(axes, ("current_impressions", "current_clicks")):
    for i, v in enumerate(cty[col][::-1]):
        ax.annotate(f"{v:,.0f}", (v, i), xytext=(4, 0), textcoords="offset points", va="center", fontsize=8)
finish(fig, "07_countries_28d", SRC)

# 8 position distribution of queries (28d)
pb = pd.read_csv(CSV / "query_position_buckets.csv").set_index("bucket").loc[["1-3", "4-10", "11-20", "21-50", "51+"]]
fig, axes = plt.subplots(1, 2, figsize=(12, 3.8))
axes[0].bar(pb.index, pb["queries"], color=C["violet"], width=0.6)
axes[0].set_title("Number of queries by average position bucket, 28 days")
axes[1].bar(pb.index, pb["impressions"], color=C["orange"], width=0.6)
axes[1].set_title("Impressions by position bucket, 28 days")
for ax, col in zip(axes, ("queries", "impressions")):
    for i, v in enumerate(pb[col]):
        ax.annotate(f"{v:,.0f}", (i, v), ha="center", va="bottom", fontsize=8)
finish(fig, "08_position_buckets_28d", "Only reported (non-anonymized) queries. 94% of impressions sit at positions 4–10.")

# 9 topic clusters: impressions and clicks (28d)
td = pd.read_csv(CSV / "topic_dynamics.csv").sort_values("impressions_28d", ascending=True).tail(14)
fig, axes = plt.subplots(1, 2, figsize=(12, 5))
axes[0].barh(td["topic"], td["impressions_28d"], color=C["orange"], height=0.6)
axes[0].set_title("Impressions by topic cluster, 28 days")
axes[0].set_xscale("log")
axes[1].barh(td["topic"], td["clicks_28d"], color=C["blue"], height=0.6)
axes[1].set_title("Clicks by topic cluster, 28 days")
for ax, col in zip(axes, ("impressions_28d", "clicks_28d")):
    for i, v in enumerate(td[col]):
        ax.annotate(f"{v:,.0f}", (max(v, 1), i), xytext=(4, 0), textcoords="offset points", va="center", fontsize=8)
finish(fig, "09_topic_clusters_28d", "Impressions axis is logarithmic: ChatGPT clusters dominate; service clusters have impressions but no clicks.")

# 10 top pages: clicks 28d vs prev28
pa = pd.read_csv(CSV / "pages_all.csv").head(12)
lab = pa["page"].str.replace("https://gptbot.uz", "", regex=False)
fig, ax = plt.subplots(figsize=(11, 5))
y = range(len(pa))
ax.barh([i + 0.2 for i in y], pa["previous_clicks"][::1], height=0.38, color="#c9c8c2", label="21 Jul–17 Aug")
ax.barh([i - 0.2 for i in y], pa["current_clicks"], height=0.38, color=C["blue"], label="18 Aug–14 Sep")
ax.set_yticks(list(y)); ax.set_yticklabels(lab, fontsize=8); ax.invert_yaxis()
ax.set_title("Top pages by clicks: last 28 days vs previous 28 days")
for i, v in enumerate(pa["current_clicks"]):
    ax.annotate(f"{v:.0f}", (v, i - 0.2), xytext=(4, 0), textcoords="offset points", va="center", fontsize=8)
ax.legend(loc="lower right")
finish(fig, "10_top_pages_growth", SRC)

# 11 page potential: impressions vs CTR for pages with >=150 impressions, position 4-20
pq = pd.read_csv(CSV / "pages_all.csv")
pq = pq[(pq["current_impressions"] >= 150)]
fig, ax = plt.subplots(figsize=(11, 5))
col = [C["blue"] if 4 <= p <= 10 else (C["orange"] if p <= 20 else "#c9c8c2") for p in pq["current_position"]]
ax.scatter(pq["current_impressions"], pq["current_ctr"], s=36, c=col, edgecolors=SURFACE, linewidths=1.2)
ax.set_xscale("log")
ax.set_title("Pages with >=150 impressions (28d): impressions vs CTR; blue = pos 4–10, orange = 11–20, grey = other")
ax.set_xlabel("impressions (log)"); ax.set_ylabel("CTR")
for r in pq.head(8).itertuples():
    ax.annotate(r.page.replace("https://gptbot.uz", ""), (r.current_impressions, r.current_ctr), xytext=(5, 4), textcoords="offset points", fontsize=7, color=INK2)
finish(fig, "11_pages_potential_scatter", "Large impressions with low CTR at positions 4–10 = snippet/intent work; positions 11–20 = content work.")

# 12 weekly clicks by topic (90 days)
tdly = pd.read_csv(CSV / "topic_daily.csv", parse_dates=["date"])
tdly["week"] = tdly["date"] - pd.to_timedelta(tdly["date"].dt.weekday, unit="D")
top_topics = ["chatgpt_download", "chatgpt_login", "chatgpt_online", "chatgpt_payment", "chatgpt_alternatives"]
w = tdly[tdly["topic"].isin(top_topics)].groupby(["week", "topic"])["clicks"].sum().unstack().fillna(0)
fig, ax = plt.subplots(figsize=(11, 4))
for t, colr in zip(top_topics, (C["blue"], C["orange"], C["aqua"], C["yellow"], C["magenta"])):
    if t in w:
        ax.plot(w.index, w[t], color=colr, linewidth=2, marker="o", markersize=4, label=t)
ax.set_title("Weekly clicks by ChatGPT topic cluster, last 90 days (reported queries only)")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
ax.legend(loc="upper left")
finish(fig, "12_weekly_clicks_by_topic", "Last week (14 Sep) is a single day and is excluded from trend reading.")

# 13 monthly
mo = pd.read_csv(CSV / "monthly_trend.csv")
fig, axes = plt.subplots(1, 2, figsize=(12, 3.8))
axes[0].bar(mo["month"], mo["clicks"], color=[C["blue"] if c else "#9fbde6" for c in mo["complete_month"]], width=0.6)
axes[0].set_title("Clicks per month (light = partial month)")
axes[1].bar(mo["month"], mo["impressions"], color=[C["orange"] if c else "#f5b89f" for c in mo["complete_month"]], width=0.6)
axes[1].set_title("Impressions per month (light = partial month)")
for ax, col in zip(axes, ("clicks", "impressions")):
    for i, v in enumerate(mo[col]):
        ax.annotate(f"{v:,.0f}", (i, v), ha="center", va="bottom", fontsize=8)
finish(fig, "13_monthly", "May 2026 covers 21–31 May; September covers 1–14 Sep.")
print("charts done")
