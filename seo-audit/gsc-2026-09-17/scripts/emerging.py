#!/usr/bin/env python3
"""
Emerging-keyword slice: queries whose impressions have only recently started
(first seen inside the 90-day window), are rising, or are visible without clicks.

Input : raw/date_query__last90.csv (date x query, 2026-06-17..2026-09-14, final),
        raw/query_page__last28.csv (top page per query), analysis.py classifiers.
Output: docs/seo/gsc-audit-2026-09-17/csv/queries_emerging.csv,
        queries_emerging_by_cluster.csv, queries_emerging_weekly.csv,
        summary_emerging.json
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = HERE.parent / "raw"
OUT = HERE.parent.parent.parent / "docs" / "seo" / "gsc-audit-2026-09-17"
CSV = OUT / "csv"

# reuse classification rules from analysis.py without re-running it
src = (HERE / "analysis.py").read_text(encoding="utf-8").split("# ============================================================ 1. totals")[0]
ns = {"__file__": str(HERE / "analysis.py")}
exec(src, ns)  # noqa: S102 - local trusted file
topic_of, lang_of, intent_of, bucket = ns["topic_of"], ns["lang_of"], ns["intent_of"], ns["bucket"]
TOPIC_COMMERCIAL, TOPIC_SERVICE_FIT, TOPIC_GROUP = ns["TOPIC_COMMERCIAL"], ns["TOPIC_SERVICE_FIT"], ns["TOPIC_GROUP"]

END = pd.Timestamp(json.load(open(RAW / "PERIODS.json", encoding="utf-8"))["lastFinalDate"])
dq = pd.read_csv(RAW / "date_query__last90.csv", dtype={"query": str})
dq["date"] = pd.to_datetime(dq["date"])
WINDOW_START = dq["date"].min()


def win(days: int, back: int) -> pd.DataFrame:
    s = END - pd.Timedelta(days=days * (back + 1) - 1)
    e = END - pd.Timedelta(days=days * back)
    d = dq[(dq["date"] >= s) & (dq["date"] <= e)]
    g = d.groupby("query").agg(clicks=("clicks", "sum"), impressions=("impressions", "sum"))
    pos = d.groupby("query").apply(lambda x: float((x["position"] * x["impressions"]).sum() / max(x["impressions"].sum(), 1)))
    g["position"] = pos.round(2)
    return g


first = dq[dq["impressions"] > 0].groupby("query")["date"].min().rename("first_seen")
last = dq[dq["impressions"] > 0].groupby("query")["date"].max().rename("last_seen")
days_seen = dq[dq["impressions"] > 0].groupby("query")["date"].nunique().rename("days_with_impressions")
tot = dq.groupby("query").agg(clicks_90d=("clicks", "sum"), impressions_90d=("impressions", "sum"))
w7, p7, w14, p14, w28 = win(7, 0), win(7, 1), win(14, 0), win(14, 1), win(28, 0)

df = tot.join(first).join(last).join(days_seen)
for name, g in (("last7", w7), ("prev7", p7), ("last14", w14), ("prev14", p14), ("last28", w28)):
    df = df.join(g.rename(columns=lambda c: f"{name}_{c}"))
df = df.fillna({c: 0 for c in df.columns if c.endswith(("_clicks", "_impressions"))})
for c in df.columns:
    if c.endswith(("_clicks", "_impressions")):
        df[c] = df[c].astype(int)
df = df.reset_index()

df["topic"] = df["query"].map(topic_of)
df["topic_group"] = df["topic"].map(TOPIC_GROUP)
df["language"] = df["query"].map(lang_of)
df["intent"] = [intent_of(q, t) for q, t in zip(df["query"], df["topic"])]
df["position_bucket_14d"] = df["last14_position"].map(bucket)
df["days_since_first_seen"] = (END - df["first_seen"]).dt.days
df["first_seen"] = df["first_seen"].dt.strftime("%Y-%m-%d")
df["last_seen"] = df["last_seen"].dt.strftime("%Y-%m-%d")
df["impressions_change_14_pct"] = [round((a - b) / b * 100, 1) if b else None for a, b in zip(df["last14_impressions"], df["prev14_impressions"])]
df["position_change_14"] = (df["last14_position"] - df["prev14_position"]).round(2)  # negative = improved
df["ctr_last28"] = (df["last28_clicks"] / df["last28_impressions"].replace(0, np.nan)).round(4)

# top page (28d)
qp = pd.read_csv(RAW / "query_page__last28.csv", dtype={"query": str})
top_page = qp.sort_values(["query", "impressions"], ascending=[True, False]).drop_duplicates("query")[["query", "page"]].rename(columns={"page": "top_page_28d"})
df = df.merge(top_page, on="query", how="left")

# flags
df["is_new_14d"] = df["days_since_first_seen"] <= 13
df["is_new_28d"] = df["days_since_first_seen"] <= 27
df["is_rising"] = (df["last14_impressions"] >= 30) & (df["last14_impressions"] >= 2 * df["prev14_impressions"].clip(lower=1)) & (~df["is_new_14d"])
df["visible_no_clicks"] = (df["last28_impressions"] >= 20) & (df["last28_clicks"] == 0)
df["striking_distance"] = (df["last14_position"] >= 4) & (df["last14_position"] <= 15) & (df["last14_impressions"] >= 20)
df["relevant"] = ~df["topic"].isin(["irrelevant_ukr", "other"])


def proximity(p):
    if pd.isna(p): return 0
    if p <= 3: return 0.5
    if p <= 10: return 1.0
    if p <= 15: return 0.7
    if p <= 20: return 0.4
    if p <= 30: return 0.15
    return 0.05


df["emerging_score"] = (np.log10(1 + df["last14_impressions"]) * df["last14_position"].map(proximity)
                        * df["topic"].map(TOPIC_COMMERCIAL) * df["topic"].map(TOPIC_SERVICE_FIT) * 10).round(2)


def segment(r):
    if r.is_new_14d: return "new_14d"
    if r.is_new_28d: return "new_28d"
    if r.is_rising: return "rising"
    if r.visible_no_clicks: return "visible_no_clicks"
    return "established"


df["segment"] = df.apply(segment, axis=1)
em = df[(df["segment"] != "established") & (df["last28_impressions"] >= 10)].copy()
em = em.sort_values(["segment", "emerging_score", "last14_impressions"], ascending=[True, False, False])
cols = ["query", "segment", "topic", "topic_group", "language", "intent", "relevant", "first_seen", "days_since_first_seen", "days_with_impressions",
        "last7_impressions", "prev7_impressions", "last14_impressions", "prev14_impressions", "impressions_change_14_pct", "last28_impressions", "impressions_90d",
        "last7_clicks", "last14_clicks", "last28_clicks", "clicks_90d", "ctr_last28", "last14_position", "prev14_position", "position_change_14", "position_bucket_14d",
        "striking_distance", "visible_no_clicks", "emerging_score", "top_page_28d"]
em = em[cols]
em.to_csv(CSV / "queries_emerging.csv", index=False, encoding="utf-8-sig")

# cluster summary of emerging set
cs = em.groupby(["segment", "topic"]).agg(queries=("query", "count"), impressions_14d=("last14_impressions", "sum"), impressions_28d=("last28_impressions", "sum"),
                                         clicks_28d=("last28_clicks", "sum"), avg_position_14d=("last14_position", "mean")).reset_index()
cs["avg_position_14d"] = cs["avg_position_14d"].round(1)
cs = cs.sort_values(["segment", "impressions_28d"], ascending=[True, False])
cs.to_csv(CSV / "queries_emerging_by_cluster.csv", index=False, encoding="utf-8-sig")

# weekly matrix for top 40 emerging (by 14d impressions)
top = list(em.sort_values("last14_impressions", ascending=False).head(40)["query"])
w = dq[dq["query"].isin(top)].copy()
w["week_start"] = (w["date"] - pd.to_timedelta(w["date"].dt.weekday, unit="D")).dt.strftime("%Y-%m-%d")
wk = w.groupby(["query", "week_start"]).agg(impressions=("impressions", "sum"), clicks=("clicks", "sum"), position=("position", "mean")).reset_index()
wk["position"] = wk["position"].round(1)
wk.to_csv(CSV / "queries_emerging_weekly.csv", index=False, encoding="utf-8-sig")

summary = {
    "window": {"start": WINDOW_START.strftime("%Y-%m-%d"), "end": END.strftime("%Y-%m-%d")},
    "queries_in_window": int(len(df)),
    "segments": em["segment"].value_counts().to_dict(),
    "segment_totals": em.groupby("segment").agg(impressions_28d=("last28_impressions", "sum"), clicks_28d=("last28_clicks", "sum")).to_dict("index"),
    "new_14d_top": em[em.segment == "new_14d"].sort_values("last14_impressions", ascending=False).head(25)[["query", "topic", "language", "first_seen", "last14_impressions", "last14_clicks", "last14_position", "top_page_28d"]].round(2).to_dict("records"),
    "new_28d_top": em[em.segment == "new_28d"].sort_values("last28_impressions", ascending=False).head(25)[["query", "topic", "language", "first_seen", "last28_impressions", "last28_clicks", "last14_position", "top_page_28d"]].round(2).to_dict("records"),
    "rising_top": em[em.segment == "rising"].sort_values("last14_impressions", ascending=False).head(25)[["query", "topic", "language", "prev14_impressions", "last14_impressions", "impressions_change_14_pct", "last14_clicks", "last14_position", "position_change_14", "top_page_28d"]].round(2).to_dict("records"),
    "visible_no_clicks_top": em[em.segment == "visible_no_clicks"].sort_values("last28_impressions", ascending=False).head(25)[["query", "topic", "language", "last28_impressions", "last14_position", "top_page_28d"]].round(2).to_dict("records"),
    "striking_distance_relevant": em[em.striking_distance & em.relevant].sort_values("emerging_score", ascending=False).head(30)[["query", "segment", "topic", "last14_impressions", "last14_clicks", "last14_position", "emerging_score", "top_page_28d"]].round(2).to_dict("records"),
    "by_cluster": cs.to_dict("records"),
}
(OUT / "summary_emerging.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
print("emerging rows", len(em), em["segment"].value_counts().to_dict())
