#!/usr/bin/env python3
"""
GSC audit analysis for gptbot.uz (sc-domain:gptbot.uz).

Reads the immutable raw extracts in ../raw/ (Search Analytics via OpenSEO MCP,
public crawl of the live site, URL Inspection samples) and produces the
derived CSV tables and summary.json in docs/seo/gsc-audit-2026-09-17/csv/.

Nothing here touches the raw files. Every derived number in the Markdown
reports must come from these CSVs or summary.json.

Run:  python analysis.py
"""
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = HERE.parent / "raw"
REPO = HERE.parent.parent.parent
OUT = REPO / "docs" / "seo" / "gsc-audit-2026-09-17"
CSV = OUT / "csv"
CSV.mkdir(parents=True, exist_ok=True)

P = json.load(open(RAW / "PERIODS.json", encoding="utf-8"))["periods"]
LAST_FINAL = json.load(open(RAW / "PERIODS.json", encoding="utf-8"))["lastFinalDate"]
SUMMARY: dict = {"lastFinalDate": LAST_FINAL, "periods": P, "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}


def load(name: str) -> pd.DataFrame:
    df = pd.read_csv(RAW / f"{name}.csv", dtype={"query": str, "page": str})
    for c in ("clicks", "impressions"):
        if c in df:
            df[c] = df[c].fillna(0).astype(int)
    return df


def save(df: pd.DataFrame, name: str) -> None:
    df.to_csv(CSV / f"{name}.csv", index=False, encoding="utf-8-sig")
    print(f"  {name:40s} {len(df):6d} rows")


def pct(a, b):
    """Safe percent change; None when the base is zero."""
    a = float(a) if pd.notna(a) else 0.0
    b = float(b) if pd.notna(b) else 0.0
    if b == 0:
        return None
    return round((a - b) / b * 100.0, 1)


# ============================================================ classification
BRAND_EXACT = re.compile(r"^\s*(gpt\s?bots?(\.uz)?|gptbot(\.uz)?|гпт\s?бот|boss\s?digital|босс\s?диджитал|gptbot uz|gpt bot uz)\s*$", re.I)
BRAND_ANY = re.compile(r"gptbot|boss digital|босс диджитал", re.I)

CHATGPT = re.compile(r"chat\s?-?gpt|\bgpt\b|gpt\s?-?\d|jaji|piti|chachi|chaji|chpt|chpjt|chipiti|chachpti|чат\s?жпт|жпт|гпт|джипити|жажипити|чачи|чат\s?гпт|чатгпт|openai|jajipiti|chatgtp|chatgbt|chat gtp", re.I)
UZ_LAT = re.compile(r"\b(yuklab|yuklash|olish|kirish|kirib|ochish|bepul|tilida|tilda|uzbekcha|o.?zbekcha|ozbekcha|o.?zbek|ozbek|uzbek(?!istan)|uzb|tarjim\w*|ilova\w*|uchun|nima|qanday|narx\w*|buyurtma|gaplash\w*|yozish|o.?rnatish|ornatish|qilish|onlayn|ishlaydimi|bilan|orqali|haqida|savol\w*|javob\w*|beruvchi|biznes|talaba\w*|maktab|insho|referat|matn|lug.?at|so.?zlashuv|sun.?iy|suniy|intellekt|dastur\w*|telefon\w*|kompyuter\w*|versiya\w*|yangi|eng|yaxshi|qancha|bo.?ladi|mumkin|qilib|yuklab olish|skachat)\b|jaji|piti|chachi|chaji|chpt|chpjt|chipiti|chachpti|õzbek|oʻzbek|o'zbek|o‘zbek", re.I)
UZ_CYR = re.compile(r"узбекча|тилида|юклаб|кириш|очиш|бепул|учун|нима|қандай|ўзбек|узбек тилида|узбек тилда|жажипити|джипити узбек|жпт узбек|чачи|пити|ўзбекча|узб\b|скачать uzbek|юклаш", re.I)
UKR = re.compile(r"бізнес|майстер|зробити|для сайту|\bяк\b|сайту|бота для", re.I)
CYR = re.compile(r"[а-яёіїєґ]", re.I)
EN_WORDS = re.compile(r"\b(uzbekistan|download|free|login|sign|how|what|best|the|for|with|manager|agent|api|python|app|apps|online|chat|bot|version|latest|use|using|in|on|price|cost|tashkent|kazakhstan|russia)\b", re.I)

SERVICE_HINT = re.compile(r"для бизнеса|biznes uchun|для сайта|sayt uchun|заявк|ariza|crm|менеджер|manager|продавец|sotuvchi|для салона|для клиники|для магазина|для агентства|бот для|bot для|на заказ|разработ|ishlab|yaratish|заказать", re.I)
COMMERCIAL = re.compile(r"narx|стоимост|цена|цены|заказ|buyurtma|услуг|xizmat|разработ|создан|купить|под ключ|агентств|студи|компани|прайс|тариф|скольк|qancha|заказать|yaratish|ishlab chiqish|разработчик|подрядчик|фрилансер|цену|расценк|пакет|стоит", re.I)
LOCAL = re.compile(r"ташкент|tashkent|toshkent|самарканд|samarqand|samarkand|узбекистан|uzbekistan|o.?zbekiston|ozbekiston|бухар|buxoro|наманган|андижан|фергана|farg.?ona|nukus|qarshi|карши|узб\b|\buz\b|\buzb\b", re.I)
INFORMATIONAL = re.compile(r"что такое|как работает|nima|\bэто\b|что значит|кто такой|как сделать|\bкак\b|qanday|почему|nega|зачем|пример|список|чек.?лист|гайд|инструкц|обзор|включает|делается|kerak|определение|значение", re.I)

TOPIC_RULES = [
    ("telegram_ads", re.compile(r"(telegram|телеграм|\btg\b).*(реклам|reklama|\bads\b|таргет|рекламу|рынка рекламы)|(реклам|reklama|\bads\b).*(telegram|телеграм)", re.I)),
    ("telegram_bots", re.compile(r"telegram|телеграм|\btg\b|payme|click", re.I)),
    ("instagram_bots", re.compile(r"instagram|инстаграм|direct|директ", re.I)),
    ("whatsapp_bots", re.compile(r"whatsapp|ватсап|вацап", re.I)),
    # NB: \bбот\w* (not bare "бот") so that "работает"/"обработка" do not match the bot cluster
    ("chatbot_dev", re.compile(r"\bbot\b|\bбот\w*|\brobot|\bробот\w*|chatbot|чат-бот|чатбот|ai manager|ai-менеджер|ai менеджер|ai продавец|ai sotuvchi|ai agent|ai-агент|ии агент|ai bot|ai-bot", re.I)),
    ("leads_automation", re.compile(r"\bлид\w*|\blead\w*|заявк|ariza|автоматиз|avtomat|crm|amocrm|bitrix|битрикс|воронк|обработк", re.I)),
    ("smm", re.compile(r"\bsmm\b|смм", re.I)),
    ("seo", re.compile(r"\bseo\b|сео|продвижен|раскрут|аудит сайта|ключев|семантик|seodrum|позици", re.I)),
    ("webdev", re.compile(r"сайт|sayt|веб|\bweb\b|лендинг|landing|домен|хостинг|domen|hosting|веб-сайт", re.I)),
    ("digital_marketing", re.compile(r"реклам|reklama|маркетинг|marketing|target|таргет|контекст|google ads|яндекс директ|digital|диджитал|бюджет", re.I)),
    ("ai_education", re.compile(r"insho|referat|эссе|сочинени|talaba|студент|maktab|школ|o.?quv|обучен|kurs|курс|dars|урок", re.I)),
    ("ai_general", re.compile(r"\bии\b|\bai\b|sun.?iy intellekt|suniy intellekt|нейросет|искусствен|neural|общение с|поговорить|chat с|чат с|ai chat|ai-чат|ии чат|ии-чат", re.I)),
]
CHATGPT_SUB = [
    ("chatgpt_payment", re.compile(r"оплат|to.?lov|tolov|подписк|obuna|\bplus\b|карт|купить|sotib", re.I)),
    ("chatgpt_download", re.compile(r"yuklab|yuklash|skachat|скачать|o.?rnatish|ornatish|\bapk\b|ilova|download|установ|телефон|kompyuter|компьютер|\bpc\b|android|iphone|ios|windows", re.I)),
    ("chatgpt_login", re.compile(r"kirish|kirib|ochish|login|вход|войти|akkaunt|ro.?yxat|регистр|зайти|аккаунт|ochib", re.I)),
    ("chatgpt_prompts", re.compile(r"prompt|промпт", re.I)),
    ("chatgpt_translate", re.compile(r"tarjim|перевод|переводчик", re.I)),
    ("chatgpt_vpn", re.compile(r"\bvpn\b|впн|ishlaydimi|работает ли|доступ|blok|блок", re.I)),
    ("chatgpt_alternatives", re.compile(r"analog|аналог|claude|gemini|deepseek|\bvs\b|сравн|альтернатив|farq|taqqos|лучш|yaxshi|которые работают|заменит", re.I)),
]


def lang_of(q: str) -> str:
    if UKR.search(q) and not UZ_CYR.search(q):
        return "ukr"
    if UZ_LAT.search(q):
        return "uz"
    if CYR.search(q):
        return "uz" if UZ_CYR.search(q) else "ru"
    if EN_WORDS.search(q):
        return "en"
    return "neutral"


def topic_of(q: str) -> str:
    if BRAND_EXACT.search(q) or BRAND_ANY.search(q):
        return "brand"
    if UKR.search(q) and not UZ_CYR.search(q):
        return "irrelevant_ukr"
    if CHATGPT.search(q) and not SERVICE_HINT.search(q):
        for name, rx in CHATGPT_SUB:
            if rx.search(q):
                return name
        return "chatgpt_online"
    for name, rx in TOPIC_RULES:
        if rx.search(q):
            return name
    if CHATGPT.search(q):
        return "chatbot_dev"
    return "other"


TOPIC_GROUP = {
    "brand": "brand",
    "chatgpt_online": "chatgpt_product", "chatgpt_download": "chatgpt_product", "chatgpt_login": "chatgpt_product",
    "chatgpt_payment": "chatgpt_product", "chatgpt_prompts": "chatgpt_product", "chatgpt_translate": "chatgpt_product",
    "chatgpt_vpn": "chatgpt_product", "chatgpt_alternatives": "chatgpt_product",
    "chatbot_dev": "services_bots", "telegram_bots": "services_bots", "instagram_bots": "services_bots",
    "whatsapp_bots": "services_bots", "leads_automation": "services_bots",
    "telegram_ads": "services_marketing", "smm": "services_marketing", "digital_marketing": "services_marketing",
    "seo": "services_web", "webdev": "services_web",
    "ai_general": "ai_informational", "ai_education": "ai_informational",
    "irrelevant_ukr": "irrelevant", "other": "other",
}
# commercial relevance of a topic to GPTBot.uz revenue (explicit weights used in Opportunity Score)
TOPIC_COMMERCIAL = {
    "brand": 1.0, "chatbot_dev": 1.0, "telegram_bots": 1.0, "instagram_bots": 1.0, "whatsapp_bots": 1.0,
    "leads_automation": 0.9, "smm": 0.9, "telegram_ads": 0.9, "digital_marketing": 0.8, "seo": 0.8, "webdev": 0.8,
    "chatgpt_online": 0.6, "chatgpt_download": 0.5, "chatgpt_login": 0.5, "chatgpt_payment": 0.5,
    "chatgpt_prompts": 0.4, "chatgpt_translate": 0.4, "chatgpt_vpn": 0.4, "chatgpt_alternatives": 0.4,
    "ai_general": 0.3, "ai_education": 0.3, "other": 0.1, "irrelevant_ukr": 0.0,
}
# does an existing page on the site serve this topic (service fit)?
TOPIC_SERVICE_FIT = {
    "brand": 1.0, "chatbot_dev": 1.0, "telegram_bots": 1.0, "instagram_bots": 1.0, "whatsapp_bots": 0.7,
    "leads_automation": 1.0, "smm": 1.0, "telegram_ads": 1.0, "digital_marketing": 1.0, "seo": 1.0, "webdev": 1.0,
    "chatgpt_online": 1.0, "chatgpt_download": 1.0, "chatgpt_login": 1.0, "chatgpt_payment": 1.0,
    "chatgpt_prompts": 1.0, "chatgpt_translate": 0.6, "chatgpt_vpn": 1.0, "chatgpt_alternatives": 1.0,
    "ai_general": 0.7, "ai_education": 0.7, "other": 0.3, "irrelevant_ukr": 0.0,
}


def intent_of(q: str, topic: str) -> str:
    if topic == "brand":
        return "navigational"
    if topic in ("chatgpt_download", "chatgpt_login"):
        return "navigational"
    if topic == "chatgpt_online":
        return "transactional"
    if topic.startswith("chatgpt_"):
        return "informational"
    if topic in ("ai_general", "ai_education"):
        return "informational"
    if TOPIC_GROUP.get(topic, "").startswith("services"):
        if COMMERCIAL.search(q) or LOCAL.search(q):
            return "commercial"
        if INFORMATIONAL.search(q):
            return "informational"
        return "commercial_investigation"
    return "unknown"


def bucket(pos: float) -> str:
    if pd.isna(pos):
        return "n/a"
    if pos <= 3:
        return "1-3"
    if pos <= 10:
        return "4-10"
    if pos <= 20:
        return "11-20"
    if pos <= 50:
        return "21-50"
    return "51+"


def classify(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["topic"] = df["query"].map(topic_of)
    df["topic_group"] = df["topic"].map(TOPIC_GROUP)
    df["language"] = df["query"].map(lang_of)
    df["intent"] = [intent_of(q, t) for q, t in zip(df["query"], df["topic"])]
    df["is_brand"] = df["topic"].eq("brand")
    df["is_local"] = df["query"].map(lambda q: bool(LOCAL.search(q)))
    df["is_commercial_modifier"] = df["query"].map(lambda q: bool(COMMERCIAL.search(q)))
    df["position_bucket"] = df["position"].map(bucket)
    return df


def locale_of(url: str) -> str:
    path = urlsplit(url).path
    if path.startswith("/ru/"):
        return "ru"
    if path.startswith("/uz/"):
        return "uz"
    return "root"


def page_type_of(url: str) -> str:
    path = urlsplit(url).path
    if path in ("/", "/ru/", "/uz/"):
        return "home"
    if "/blog/" in path:
        return "blog_index" if path.rstrip("/").endswith("/blog") else "blog"
    if re.search(r"maxfiylik|privacy|politika|oferta|terms", path):
        return "legal"
    if path.count("/") <= 2 and not path.startswith(("/ru/", "/uz/")):
        return "root_page"
    return "landing"


# ============================================================ compare helper
def compare(cur: pd.DataFrame, prev: pd.DataFrame, key: str, suffix_cur="current", suffix_prev="previous") -> pd.DataFrame:
    c = cur[[key, "clicks", "impressions", "ctr", "position"]].rename(columns={
        "clicks": f"{suffix_cur}_clicks", "impressions": f"{suffix_cur}_impressions", "ctr": f"{suffix_cur}_ctr", "position": f"{suffix_cur}_position"})
    p = prev[[key, "clicks", "impressions", "ctr", "position"]].rename(columns={
        "clicks": f"{suffix_prev}_clicks", "impressions": f"{suffix_prev}_impressions", "ctr": f"{suffix_prev}_ctr", "position": f"{suffix_prev}_position"})
    m = c.merge(p, on=key, how="outer")
    for col in (f"{suffix_cur}_clicks", f"{suffix_cur}_impressions", f"{suffix_prev}_clicks", f"{suffix_prev}_impressions"):
        m[col] = m[col].fillna(0).astype(int)
    m["clicks_change"] = m[f"{suffix_cur}_clicks"] - m[f"{suffix_prev}_clicks"]
    m["clicks_change_pct"] = [pct(a, b) for a, b in zip(m[f"{suffix_cur}_clicks"], m[f"{suffix_prev}_clicks"])]
    m["impressions_change"] = m[f"{suffix_cur}_impressions"] - m[f"{suffix_prev}_impressions"]
    m["impressions_change_pct"] = [pct(a, b) for a, b in zip(m[f"{suffix_cur}_impressions"], m[f"{suffix_prev}_impressions"])]
    m["ctr_change"] = (m[f"{suffix_cur}_ctr"].fillna(0) - m[f"{suffix_prev}_ctr"].fillna(0)).round(4)
    # position_change: negative = improved (moved up). Reported explicitly to avoid sign confusion.
    m["position_change"] = (m[f"{suffix_cur}_position"] - m[f"{suffix_prev}_position"]).round(2)
    m["position_direction"] = np.where(m["position_change"].isna(), "n/a",
                                       np.where(m["position_change"] < -0.5, "improved",
                                                np.where(m["position_change"] > 0.5, "worsened", "stable")))
    m["status"] = np.where((m[f"{suffix_prev}_impressions"] == 0) & (m[f"{suffix_cur}_impressions"] > 0), "new",
                           np.where((m[f"{suffix_cur}_impressions"] == 0) & (m[f"{suffix_prev}_impressions"] > 0), "lost", "both"))
    return m


# ============================================================ 1. totals & anonymized share
print("[1] totals, anonymized share")
date_all = load("date__all16m")
date_all["date"] = pd.to_datetime(date_all["date"])


def period_totals(per: str) -> dict:
    s, e = pd.Timestamp(P[per][0]), pd.Timestamp(P[per][1])
    d = date_all[(date_all["date"] >= s) & (date_all["date"] <= e)]
    clicks, impr = int(d["clicks"].sum()), int(d["impressions"].sum())
    pos = float((d["position"] * d["impressions"]).sum() / impr) if impr else None
    return {"start": P[per][0], "end": P[per][1], "days": int(len(d)), "clicks": clicks, "impressions": impr,
            "ctr": round(clicks / impr, 4) if impr else None, "position": round(pos, 2) if pos else None}


totals = {per: period_totals(per) for per in P}
anon_rows = []
for per in P:
    q = load(f"query__{per}")
    t = totals[per]
    anon_rows.append({"period": per, "start": t["start"], "end": t["end"], "property_clicks": t["clicks"], "property_impressions": t["impressions"],
                      "query_rows": len(q), "query_rows_clicks": int(q["clicks"].sum()), "query_rows_impressions": int(q["impressions"].sum()),
                      "anonymized_clicks": t["clicks"] - int(q["clicks"].sum()), "anonymized_impressions": t["impressions"] - int(q["impressions"].sum()),
                      "anonymized_clicks_share_pct": round((t["clicks"] - int(q["clicks"].sum())) / t["clicks"] * 100, 1) if t["clicks"] else None,
                      "anonymized_impressions_share_pct": round((t["impressions"] - int(q["impressions"].sum())) / t["impressions"] * 100, 1) if t["impressions"] else None})
anon = pd.DataFrame(anon_rows)
save(anon, "anonymized_share")
SUMMARY["totals"] = totals
SUMMARY["anonymized"] = anon.set_index("period").to_dict("index")

# period-over-period headline
for a, b in (("last28", "prev28"), ("last90", "prev90"), ("last7", None)):
    pass
SUMMARY["headline"] = {
    "last28_vs_prev28": {k: {"current": totals["last28"][k], "previous": totals["prev28"][k], "change_pct": pct(totals["last28"][k], totals["prev28"][k])} for k in ("clicks", "impressions")},
    "last90_vs_prev90": {k: {"current": totals["last90"][k], "previous": totals["prev90"][k], "change_pct": pct(totals["last90"][k], totals["prev90"][k])} for k in ("clicks", "impressions")},
    "position_last28_vs_prev28": {"current": totals["last28"]["position"], "previous": totals["prev28"]["position"]},
    "ctr_last28_vs_prev28": {"current": totals["last28"]["ctr"], "previous": totals["prev28"]["ctr"]},
}

# ============================================================ 2. daily / weekly / monthly trends
print("[2] trends")
daily = date_all.copy()
daily["ctr"] = (daily["clicks"] / daily["impressions"].replace(0, np.nan)).round(4)
daily["clicks_7d_avg"] = daily["clicks"].rolling(7, min_periods=1).mean().round(2)
daily["impressions_7d_avg"] = daily["impressions"].rolling(7, min_periods=1).mean().round(1)
daily["position_7d_avg"] = daily["position"].rolling(7, min_periods=1).mean().round(2)
dd = load("date_device__all16m")
dd["date"] = pd.to_datetime(dd["date"])
piv = dd.pivot_table(index="date", columns="device", values=["clicks", "impressions"], aggfunc="sum").fillna(0)
piv.columns = [f"{a}_{b.lower()}" for a, b in piv.columns]
daily = daily.merge(piv.reset_index(), on="date", how="left").fillna(0)
dc = load("date_country__all16m")
dc["date"] = pd.to_datetime(dc["date"])
pivc = dc[dc["country"].isin(["uzb", "rus", "kaz"])].pivot_table(index="date", columns="country", values=["clicks", "impressions"], aggfunc="sum").fillna(0)
pivc.columns = [f"{a}_{b}" for a, b in pivc.columns]
daily = daily.merge(pivc.reset_index(), on="date", how="left").fillna(0)
daily["date"] = daily["date"].dt.strftime("%Y-%m-%d")
daily["is_final"] = True
save(daily, "daily_trend")

wk = date_all.copy()
wk["week_start"] = wk["date"] - pd.to_timedelta(wk["date"].dt.weekday, unit="D")
weekly = wk.groupby("week_start").agg(days=("date", "count"), clicks=("clicks", "sum"), impressions=("impressions", "sum"),
                                     position=("position", lambda s: float((s * wk.loc[s.index, "impressions"]).sum() / max(wk.loc[s.index, "impressions"].sum(), 1)))).reset_index()
weekly["ctr"] = (weekly["clicks"] / weekly["impressions"].replace(0, np.nan)).round(4)
weekly["position"] = weekly["position"].round(2)
weekly["complete_week"] = weekly["days"] == 7
weekly["week_start"] = weekly["week_start"].dt.strftime("%Y-%m-%d")
save(weekly, "weekly_trend")

mo = date_all.copy()
mo["month"] = mo["date"].dt.strftime("%Y-%m")
monthly = mo.groupby("month").agg(days=("date", "count"), clicks=("clicks", "sum"), impressions=("impressions", "sum"),
                                 position=("position", lambda s: float((s * mo.loc[s.index, "impressions"]).sum() / max(mo.loc[s.index, "impressions"].sum(), 1)))).reset_index()
monthly["ctr"] = (monthly["clicks"] / monthly["impressions"].replace(0, np.nan)).round(4)
monthly["position"] = monthly["position"].round(2)
monthly["complete_month"] = [d == pd.Period(m).days_in_month for m, d in zip(monthly["month"], monthly["days"])]
ddm = dd.copy()
ddm["month"] = ddm["date"].dt.strftime("%Y-%m")
pm = ddm.pivot_table(index="month", columns="device", values=["clicks", "impressions"], aggfunc="sum").fillna(0).astype(int)
pm.columns = [f"{a}_{b.lower()}" for a, b in pm.columns]
monthly = monthly.merge(pm.reset_index(), on="month", how="left")
save(monthly, "monthly_trend")
SUMMARY["monthly"] = monthly.to_dict("records")
SUMMARY["weekly"] = weekly.to_dict("records")

# image search sanity
img = load("type_image_date__all16m")
SUMMARY["image_search_16m"] = {"clicks": int(img["clicks"].sum()), "impressions": int(img["impressions"].sum())}

# ============================================================ 3. queries
print("[3] queries")
q28 = classify(load("query__last28"))
qp28 = classify(load("query__prev28"))
q90 = classify(load("query__last90"))
qp90 = classify(load("query__prev90"))
q7 = classify(load("query__last7"))
qall = classify(load("query__all16m"))

# top page per query (28d) for attaching landing URL
qpp = load("query_page__last28")
qpp_top = qpp.sort_values(["query", "impressions"], ascending=[True, False]).drop_duplicates("query")[["query", "page", "impressions"]]
qpp_top = qpp_top.rename(columns={"page": "top_page_28d", "impressions": "top_page_impressions_28d"})
qpp_pages = qpp.groupby("query")["page"].nunique().rename("pages_ranking_28d").reset_index()

qa = compare(q28, qp28, "query", "current", "previous")
qa = qa.merge(q28[["query", "topic", "topic_group", "language", "intent", "is_brand", "is_local", "is_commercial_modifier", "position_bucket"]], on="query", how="left")
missing = qa["topic"].isna()
if missing.any():
    tmp = classify(qa.loc[missing, ["query"]].assign(position=np.nan))
    for c in ("topic", "topic_group", "language", "intent", "is_brand", "is_local", "is_commercial_modifier"):
        qa.loc[missing, c] = tmp[c].values
    qa.loc[missing, "position_bucket"] = qa.loc[missing, "previous_position"].map(bucket)
q90c = q90[["query", "clicks", "impressions", "ctr", "position"]].rename(columns={"clicks": "clicks_90d", "impressions": "impressions_90d", "ctr": "ctr_90d", "position": "position_90d"})
qa = qa.merge(q90c, on="query", how="left")
qallc = qall[["query", "clicks", "impressions", "position"]].rename(columns={"clicks": "clicks_all", "impressions": "impressions_all", "position": "position_all"})
qa = qa.merge(qallc, on="query", how="left").merge(qpp_top, on="query", how="left").merge(qpp_pages, on="query", how="left")
qa["current_period"] = f"{P['last28'][0]}..{P['last28'][1]}"
qa["previous_period"] = f"{P['prev28'][0]}..{P['prev28'][1]}"
qa = qa.sort_values(["current_clicks", "current_impressions"], ascending=False)
cols_first = ["query", "topic", "topic_group", "language", "intent", "is_brand", "is_local", "position_bucket", "top_page_28d", "pages_ranking_28d"]
qa = qa[cols_first + [c for c in qa.columns if c not in cols_first]]
save(qa, "queries_all")
save(qa[qa["is_brand"] == True], "queries_brand")  # noqa: E712
save(qa[qa["is_brand"] != True], "queries_non_brand")  # noqa: E712

# category summary (28d, prev28, 90d)
def cat_summary(df: pd.DataFrame, per: str, col: str) -> pd.DataFrame:
    g = df.groupby(col).agg(queries=("query", "count"), clicks=("clicks", "sum"), impressions=("impressions", "sum"))
    g["ctr"] = (g["clicks"] / g["impressions"].replace(0, np.nan)).round(4)
    g["position"] = df.groupby(col).apply(lambda x: float((x["position"] * x["impressions"]).sum() / max(x["impressions"].sum(), 1))).round(2)
    g["clicks_share_pct"] = (g["clicks"] / max(g["clicks"].sum(), 1) * 100).round(1)
    g["impressions_share_pct"] = (g["impressions"] / max(g["impressions"].sum(), 1) * 100).round(1)
    g["period"] = per
    return g.reset_index()


cat_parts = []
for per, df in (("last28", q28), ("prev28", qp28), ("last90", q90), ("last7", q7)):
    for col in ("topic", "topic_group", "language", "intent", "position_bucket"):
        c = cat_summary(df, per, col).rename(columns={col: "value"})
        c.insert(0, "dimension", col)
        cat_parts.append(c)
cats = pd.concat(cat_parts, ignore_index=True)
save(cats, "query_categories_summary")

# topic 28 vs prev28 dynamics table
t28 = cat_summary(q28, "last28", "topic").set_index("topic")
tp28 = cat_summary(qp28, "prev28", "topic").set_index("topic")
t90 = cat_summary(q90, "last90", "topic").set_index("topic")
dyn = pd.DataFrame({
    "queries_28d": t28["queries"], "clicks_28d": t28["clicks"], "impressions_28d": t28["impressions"], "ctr_28d": t28["ctr"], "position_28d": t28["position"],
    "clicks_share_28d_pct": t28["clicks_share_pct"], "impressions_share_28d_pct": t28["impressions_share_pct"],
    "clicks_prev28": tp28["clicks"], "impressions_prev28": tp28["impressions"], "position_prev28": tp28["position"],
    "queries_90d": t90["queries"], "clicks_90d": t90["clicks"], "impressions_90d": t90["impressions"], "ctr_90d": t90["ctr"], "position_90d": t90["position"],
}).fillna(0)
dyn["clicks_change_28_pct"] = [pct(a, b) for a, b in zip(dyn["clicks_28d"], dyn["clicks_prev28"])]
dyn["impressions_change_28_pct"] = [pct(a, b) for a, b in zip(dyn["impressions_28d"], dyn["impressions_prev28"])]
dyn["topic_group"] = dyn.index.map(TOPIC_GROUP)
dyn = dyn.sort_values("impressions_28d", ascending=False).reset_index()
save(dyn, "topic_dynamics")
SUMMARY["topic_dynamics"] = dyn.to_dict("records")
SUMMARY["brand_vs_nonbrand_28d"] = cat_summary(q28.assign(b=np.where(q28["is_brand"], "brand", "non_brand")), "last28", "b").to_dict("records")
SUMMARY["language_28d"] = cat_summary(q28, "last28", "language").to_dict("records")
SUMMARY["intent_28d"] = cat_summary(q28, "last28", "intent").to_dict("records")
SUMMARY["position_buckets_28d"] = cat_summary(q28, "last28", "position_bucket").to_dict("records")

# position buckets with example queries
pb = []
for b, grp in q28.groupby("position_bucket"):
    top = grp.sort_values("impressions", ascending=False).head(12)
    pb.append({"bucket": b, "queries": len(grp), "clicks": int(grp["clicks"].sum()), "impressions": int(grp["impressions"].sum()),
               "ctr": round(grp["clicks"].sum() / max(grp["impressions"].sum(), 1), 4),
               "top_queries_by_impressions": " | ".join(f"{r.query} ({r.impressions} impr, pos {r.position:.1f}, {r.clicks} clicks)" for r in top.itertuples())})
save(pd.DataFrame(pb), "query_position_buckets")

# growing / declining / new / lost (28 vs prev28)
qa_nb = qa[qa["is_brand"] != True].copy()  # noqa: E712
growing = qa_nb[(qa_nb["status"] == "both") & (qa_nb["clicks_change"] >= 3) & (qa_nb["clicks_change_pct"].fillna(0) >= 50)]
growing = pd.concat([growing, qa_nb[(qa_nb["status"] == "both") & (qa_nb["impressions_change"] >= 300) & (qa_nb["impressions_change_pct"].fillna(0) >= 100)]]).drop_duplicates("query")
save(growing.sort_values("clicks_change", ascending=False), "queries_growing")
declining28 = qa_nb[(qa_nb["status"] == "both") & (((qa_nb["previous_clicks"] >= 5) & (qa_nb["clicks_change_pct"].fillna(0) <= -30)) |
                                                   ((qa_nb["previous_impressions"] >= 150) & (qa_nb["impressions_change_pct"].fillna(0) <= -30)))]
new_q = qa_nb[(qa_nb["status"] == "new") & (qa_nb["current_impressions"] >= 20)].sort_values("current_impressions", ascending=False)
lost_q = qa_nb[(qa_nb["status"] == "lost") & (qa_nb["previous_impressions"] >= 10)].sort_values("previous_impressions", ascending=False)
save(new_q, "queries_new")
save(lost_q, "queries_lost")

# weekly trend per query (from date_query__last90): last7 vs prev7 and last14 vs prev14
dq = load("date_query__last90")
dq["date"] = pd.to_datetime(dq["date"])
END = pd.Timestamp(LAST_FINAL)


def window(df: pd.DataFrame, key: str, days: int, back: int) -> pd.DataFrame:
    s = END - pd.Timedelta(days=days * (back + 1) - 1)
    e = END - pd.Timedelta(days=days * back)
    d = df[(df["date"] >= s) & (df["date"] <= e)]
    g = d.groupby(key).agg(clicks=("clicks", "sum"), impressions=("impressions", "sum"),
                           position=("position", lambda x: float((x * d.loc[x.index, "impressions"]).sum() / max(d.loc[x.index, "impressions"].sum(), 1))))
    g["ctr"] = g["clicks"] / g["impressions"].replace(0, np.nan)
    g["position"] = g["position"].round(2)
    return g.reset_index()


w7 = compare(window(dq, "query", 7, 0), window(dq, "query", 7, 1), "query", "last7", "prev7")
w14 = compare(window(dq, "query", 14, 0), window(dq, "query", 14, 1), "query", "last14", "prev14")
w14 = w14.rename(columns={c: f"w14_{c}" for c in w14.columns if c not in ("query",) and not c.startswith(("last14", "prev14"))})
wq = w7.merge(w14, on="query", how="outer")
wq = wq.merge(q28[["query", "topic", "language", "is_brand"]], on="query", how="left")
wq["last7_period"] = f"{(END - pd.Timedelta(days=6)).date()}..{END.date()}"
wq["prev7_period"] = f"{(END - pd.Timedelta(days=13)).date()}..{(END - pd.Timedelta(days=7)).date()}"
save(wq.sort_values("last7_clicks", ascending=False), "queries_weekly_change")
declining7 = wq[(wq["is_brand"] != True) & ((((wq["prev7_clicks"] >= 5) & (wq["clicks_change_pct"].fillna(0) <= -40))) |  # noqa: E712
                                            ((wq["prev7_impressions"] >= 150) & (wq["impressions_change_pct"].fillna(0) <= -40)))]
declining = declining28.assign(basis="28d_vs_prev28").merge(
    declining7[["query", "last7_clicks", "prev7_clicks", "last7_impressions", "prev7_impressions", "last7_position", "prev7_position"]], on="query", how="outer")
declining["basis"] = declining["basis"].fillna("7d_vs_prev7")
declining = declining.merge(q28[["query", "topic", "language"]].rename(columns={"topic": "topic_", "language": "language_"}), on="query", how="left")
declining["topic"] = declining["topic"].fillna(declining["topic_"])
declining["language"] = declining["language"].fillna(declining["language_"])
declining = declining.drop(columns=["topic_", "language_"])
save(declining.sort_values(["prev7_clicks", "previous_clicks"], ascending=False), "queries_declining")

# no clicks, near top10, CTR opportunities, quick wins
nb28 = q28[q28["is_brand"] != True].copy()  # noqa: E712
no_clicks = nb28[(nb28["clicks"] == 0) & (nb28["impressions"] >= 30)].sort_values("impressions", ascending=False)
save(no_clicks.merge(qpp_top, on="query", how="left"), "queries_no_clicks")

# expected CTR per fine bucket from the site's own non-brand queries with >=60 impressions
def fine_bucket(p):
    if pd.isna(p):
        return "n/a"
    if p <= 3: return "1-3"
    if p <= 6: return "4-6"
    if p <= 10: return "7-10"
    if p <= 15: return "11-15"
    if p <= 20: return "16-20"
    return "21+"


nb28["fine_bucket"] = nb28["position"].map(fine_bucket)
ref = nb28[nb28["impressions"] >= 60]
exp_ctr = ref.groupby("fine_bucket")["ctr"].median().to_dict()
SUMMARY["expected_ctr_by_bucket_site_median"] = {k: round(v, 4) for k, v in exp_ctr.items()}
nb28["expected_ctr_site"] = nb28["fine_bucket"].map(exp_ctr)
nb28["ctr_gap"] = (nb28["expected_ctr_site"] - nb28["ctr"]).round(4)
nb28["ctr_ratio"] = (nb28["ctr"] / nb28["expected_ctr_site"].replace(0, np.nan)).round(2)
nb28["potential_extra_clicks_28d"] = ((nb28["expected_ctr_site"] - nb28["ctr"]).clip(lower=0) * nb28["impressions"]).round(1)


def proximity(p):
    if pd.isna(p): return 0
    if p <= 3: return 0.5
    if p <= 10: return 1.0
    if p <= 15: return 0.7
    if p <= 20: return 0.4
    if p <= 30: return 0.15
    return 0.05


def improvement_prob(row):
    r = row["ctr_ratio"]
    if pd.isna(r): return 0.5
    if r < 0.5: return 0.8
    if r < 1.0: return 0.6
    return 0.4


def difficulty(row):
    p = row["position"]
    if p <= 10 and (row["ctr_ratio"] if pd.notna(row["ctr_ratio"]) else 1) < 1:
        return 1  # snippet / title / description work on an existing ranking page
    if p <= 20:
        return 2  # content section expansion / internal links on existing page
    return 3  # new page or major rewrite


max_impr = max(nb28["impressions"].max(), 1)
nb28["norm_impressions"] = (np.log10(1 + nb28["impressions"]) / np.log10(1 + max_impr)).round(3)
nb28["top10_proximity"] = nb28["position"].map(proximity)
nb28["commercial_relevance"] = nb28["topic"].map(TOPIC_COMMERCIAL)
nb28["service_fit"] = nb28["topic"].map(TOPIC_SERVICE_FIT)
nb28["improvement_probability"] = nb28.apply(improvement_prob, axis=1)
nb28["difficulty"] = nb28.apply(difficulty, axis=1)
nb28["opportunity_score"] = (nb28["norm_impressions"] * nb28["top10_proximity"] * nb28["commercial_relevance"] * nb28["service_fit"] * nb28["improvement_probability"] / nb28["difficulty"] * 100).round(2)
nb28 = nb28.merge(qpp_top, on="query", how="left").merge(qpp_pages, on="query", how="left")

ctr_opp = nb28[(nb28["impressions"] >= 150) & (nb28["position"] <= 20) & (nb28["ctr_ratio"] < 0.6)].sort_values("potential_extra_clicks_28d", ascending=False)
save(ctr_opp, "queries_ctr_opportunities")
near10 = nb28[(nb28["position"] >= 8) & (nb28["position"] <= 20) & (nb28["impressions"] >= 40)].sort_values("impressions", ascending=False)
save(near10, "queries_near_top10")
qw = nb28[(nb28["impressions"] >= 60) & (nb28["position"] >= 4) & (nb28["position"] <= 20) & (~nb28["topic"].isin(["irrelevant_ukr", "other"]))].copy()
qw["quick_win_type"] = np.where(qw["ctr_ratio"] < 0.6, "ctr_gap", np.where(qw["position"] > 10, "near_top10", "volume_pos4_10"))
qw = qw.sort_values("opportunity_score", ascending=False)
save(qw, "queries_quick_wins")
SUMMARY["quick_wins_query_count"] = int(len(qw))

# ============================================================ 4. pages
print("[4] pages")
crawl = json.load(open(RAW / "site_pages.json", encoding="utf-8"))["pages"]
cr = pd.DataFrame([{k: v for k, v in p.items() if k not in ("anchors", "internal_links", "h2", "hreflang", "text_excerpt")} for p in crawl])
cr["jsonld_types"] = cr["jsonld_types"].map(lambda t: "|".join(t) if isinstance(t, list) else "")
links = pd.read_csv(RAW / "site_links.csv")
inbound = links[links["source"] != links["target"]].groupby("target")["source"].nunique().rename("inbound_internal_links").reset_index().rename(columns={"target": "url"})
cr = cr.merge(inbound, on="url", how="left")
cr["inbound_internal_links"] = cr["inbound_internal_links"].fillna(0).astype(int)
insp = json.load(open(RAW / "url_inspection.json", encoding="utf-8"))["results"]
ins = pd.DataFrame(insp)

p28 = load("page__last28"); pp28 = load("page__prev28"); p90 = load("page__last90"); pp90 = load("page__prev90"); pall = load("page__all16m"); p7 = load("page__last7")
pa = compare(p28, pp28, "page", "current", "previous")
pa = pa.merge(p90[["page", "clicks", "impressions", "ctr", "position"]].rename(columns={"clicks": "clicks_90d", "impressions": "impressions_90d", "ctr": "ctr_90d", "position": "position_90d"}), on="page", how="outer")
pa = pa.merge(pp90[["page", "clicks", "impressions"]].rename(columns={"clicks": "clicks_prev90", "impressions": "impressions_prev90"}), on="page", how="left")
pa = pa.merge(pall[["page", "clicks", "impressions", "position"]].rename(columns={"clicks": "clicks_all", "impressions": "impressions_all", "position": "position_all"}), on="page", how="outer")
pa = pa.merge(p7[["page", "clicks", "impressions", "position"]].rename(columns={"clicks": "clicks_7d", "impressions": "impressions_7d", "position": "position_7d"}), on="page", how="left")
for c in ("current_clicks", "current_impressions", "previous_clicks", "previous_impressions", "clicks_90d", "impressions_90d", "clicks_all", "impressions_all", "clicks_7d", "impressions_7d", "clicks_prev90", "impressions_prev90"):
    pa[c] = pa[c].fillna(0).astype(int)
# queries per page (28d)
qpc = classify(load("query_page__last28"))
qcount = qpc.groupby("page").agg(unique_queries_28d=("query", "nunique"), queries_with_clicks_28d=("clicks", lambda s: int((s > 0).sum()))).reset_index()
top_q = qpc.sort_values(["page", "clicks", "impressions"], ascending=[True, False, False]).groupby("page").head(5)
top_q = top_q.groupby("page").apply(lambda g: " | ".join(f"{r.query} ({r.clicks}c/{r.impressions}i/p{r.position:.1f})" for r in g.itertuples())).rename("top_queries_28d").reset_index()
top_qi = qpc.sort_values(["page", "impressions"], ascending=[True, False]).drop_duplicates("page")[["page", "query", "impressions", "position"]].rename(columns={"query": "top_query_by_impressions", "impressions": "top_query_impressions", "position": "top_query_position"})
dom = qpc.groupby(["page", "topic"])["impressions"].sum().reset_index().sort_values(["page", "impressions"], ascending=[True, False]).drop_duplicates("page")[["page", "topic"]].rename(columns={"topic": "dominant_topic_28d"})
domi = qpc.groupby(["page", "intent"])["impressions"].sum().reset_index().sort_values(["page", "impressions"], ascending=[True, False]).drop_duplicates("page")[["page", "intent"]].rename(columns={"intent": "dominant_intent_28d"})
doml = qpc.groupby(["page", "language"])["impressions"].sum().reset_index().sort_values(["page", "impressions"], ascending=[True, False]).drop_duplicates("page")[["page", "language"]].rename(columns={"language": "dominant_query_language_28d"})
pa = pa.merge(qcount, on="page", how="left").merge(top_q, on="page", how="left").merge(top_qi, on="page", how="left").merge(dom, on="page", how="left").merge(domi, on="page", how="left").merge(doml, on="page", how="left")
pa["locale"] = pa["page"].map(locale_of)
pa["page_type"] = pa["page"].map(page_type_of)
pa["in_sitemap"] = pa["page"].isin(set(cr[cr["in_sitemap"] == True]["url"]))  # noqa: E712
cr_cols = ["url", "status", "final_url", "redirected", "noindex", "canonical", "canonical_self", "html_lang", "title", "title_len", "description", "description_len",
           "h1", "h1_count", "h2_count", "word_count", "internal_link_count", "inbound_internal_links", "img_count", "img_missing_alt", "jsonld_types", "jsonld_has_faq",
           "jsonld_has_breadcrumb", "jsonld_has_org", "jsonld_has_service", "jsonld_has_article", "faq_heading", "sitemap_lastmod", "telegram_links"]
pa = pa.merge(cr[cr_cols].rename(columns={"url": "page", "status": "http_status"}), on="page", how="left")
pa = pa.merge(ins[["url", "coverageState", "lastCrawlTime", "googleCanonicalMatches", "inSitemapPerGoogle"]].rename(columns={"url": "page", "coverageState": "gsc_coverage_state", "lastCrawlTime": "gsc_last_crawl", "googleCanonicalMatches": "gsc_canonical_matches", "inSitemapPerGoogle": "gsc_in_sitemap"}), on="page", how="left")
pa["language_mismatch_flag"] = ((pa["locale"] == "ru") & (pa["dominant_query_language_28d"] == "uz")) | ((pa["locale"] == "uz") & (pa["dominant_query_language_28d"] == "ru"))
pa["position_bucket_28d"] = pa["current_position"].map(bucket)
pa = pa.sort_values(["current_clicks", "current_impressions"], ascending=False)
first = ["page", "locale", "page_type", "in_sitemap", "http_status", "gsc_coverage_state", "position_bucket_28d", "dominant_topic_28d", "dominant_intent_28d", "dominant_query_language_28d", "language_mismatch_flag", "unique_queries_28d", "queries_with_clicks_28d", "top_queries_28d"]
pa = pa[first + [c for c in pa.columns if c not in first]]
save(pa, "pages_all")

# page quick wins
pq = pa[(pa["current_impressions"] >= 150) & (pa["current_position"] >= 4) & (pa["current_position"] <= 20) & (pa["http_status"] == 200)].copy()
pq["fine_bucket"] = pq["current_position"].map(fine_bucket)
pref = pa[(pa["current_impressions"] >= 100)].assign(fine_bucket=lambda d: d["current_position"].map(fine_bucket))
pexp = pref.groupby("fine_bucket")["current_ctr"].median().to_dict()
pq["expected_ctr_site_pages"] = pq["fine_bucket"].map(pexp)
pq["ctr_ratio"] = (pq["current_ctr"] / pq["expected_ctr_site_pages"].replace(0, np.nan)).round(2)
pq["potential_extra_clicks_28d"] = ((pq["expected_ctr_site_pages"] - pq["current_ctr"]).clip(lower=0) * pq["current_impressions"]).round(1)
pq["quick_win_type"] = np.where(pq["ctr_ratio"] < 0.6, "ctr_gap", np.where(pq["current_position"] > 10, "near_top10", "volume_pos4_10"))
pq = pq.sort_values(["potential_extra_clicks_28d", "current_impressions"], ascending=False)
save(pq, "pages_quick_wins")

# page weekly change and declining
dp = load("date_page__last180")
dp["date"] = pd.to_datetime(dp["date"])
pw7 = compare(window(dp, "page", 7, 0), window(dp, "page", 7, 1), "page", "last7", "prev7")
pw14 = compare(window(dp, "page", 14, 0), window(dp, "page", 14, 1), "page", "last14", "prev14")
pw14 = pw14.rename(columns={c: f"w14_{c}" for c in pw14.columns if c != "page" and not c.startswith(("last14", "prev14"))})
pw = pw7.merge(pw14, on="page", how="outer")
save(pw.sort_values("last7_clicks", ascending=False), "pages_weekly_change")
pdecl28 = pa[(pa["status"] == "both") & (((pa["previous_clicks"] >= 5) & (pa["clicks_change_pct"].fillna(0) <= -30)) | ((pa["previous_impressions"] >= 150) & (pa["impressions_change_pct"].fillna(0) <= -30)))]
pdecl7 = pw[(((pw["prev7_clicks"] >= 5) & (pw["clicks_change_pct"].fillna(0) <= -40)) | ((pw["prev7_impressions"] >= 200) & (pw["impressions_change_pct"].fillna(0) <= -40)))]
pdecl = pdecl28.assign(basis="28d_vs_prev28")[["page", "basis", "current_clicks", "previous_clicks", "clicks_change_pct", "current_impressions", "previous_impressions", "impressions_change_pct", "current_position", "previous_position", "position_change"]].merge(
    pdecl7[["page", "last7_clicks", "prev7_clicks", "last7_impressions", "prev7_impressions", "last7_position", "prev7_position"]], on="page", how="outer")
pdecl["basis"] = pdecl["basis"].fillna("7d_vs_prev7")
# pages that lost queries: queries with impressions in prev28 but none in last28, per page
qpprev = load("query_page__prev28")
lostq = qpprev.merge(qpp[["query", "page"]].assign(present=1), on=["query", "page"], how="left")
lostq = lostq[lostq["present"].isna() & (lostq["impressions"] >= 5)].groupby("page").agg(lost_queries=("query", "count"), lost_queries_impressions_prev28=("impressions", "sum"), examples=("query", lambda s: " | ".join(list(s)[:6]))).reset_index()
pdecl = pdecl.merge(lostq, on="page", how="outer")
save(pdecl.sort_values(["prev7_clicks", "previous_clicks"], ascending=False), "pages_declining")
save(lostq.sort_values("lost_queries_impressions_prev28", ascending=False), "pages_lost_queries")

# pages with impressions and zero clicks; sitemap pages with zero impressions; GSC pages not in sitemap
save(pa[(pa["current_clicks"] == 0) & (pa["current_impressions"] >= 20)].sort_values("current_impressions", ascending=False), "pages_no_clicks")
zero = cr[(cr["in_sitemap"] == True) & (~cr["url"].isin(set(pall["page"])))][cr_cols]  # noqa: E712
save(zero.merge(ins[["url", "coverageState", "lastCrawlTime"]], on="url", how="left"), "pages_zero_impressions_16m")
notsm = pa[pa["in_sitemap"] == False][["page", "locale", "page_type", "http_status", "final_url", "redirected", "gsc_coverage_state", "current_clicks", "current_impressions", "clicks_all", "impressions_all", "position_all"]]  # noqa: E712
save(notsm.sort_values("impressions_all", ascending=False), "pages_not_in_sitemap")

# duplicate titles / h1 / descriptions on live site
dups = []
for col in ("title", "h1", "description"):
    g = cr[cr["status"] == 200].groupby(col)["url"].agg(list)
    for val, urls in g.items():
        if isinstance(val, str) and len(urls) > 1:
            dups.append({"field": col, "value": val, "count": len(urls), "urls": " | ".join(urls)})
save(pd.DataFrame(dups), "pages_duplicate_meta")
SUMMARY["crawl"] = {
    "sitemap_urls": int((cr["in_sitemap"] == True).sum()), "status_200": int((cr["status"] == 200).sum()),  # noqa: E712
    "noindex": int(cr["noindex"].fillna(False).sum()), "non_self_canonical": int((cr["canonical_self"] == False).sum()),  # noqa: E712
    "missing_description": int(cr["description"].isna().sum()), "missing_h1": int(cr["h1"].isna().sum()),
    "multi_h1": int((cr["h1_count"] > 1).sum()), "title_over_65": int((cr["title_len"] > 65).sum()),
    "desc_over_165": int((cr["description_len"] > 165).sum()), "desc_under_70": int(((cr["description_len"] < 70) & cr["description"].notna()).sum()),
    "word_count_under_300": int((cr["word_count"] < 300).sum()), "img_missing_alt_pages": int((cr["img_missing_alt"] > 0).sum()),
    "pages_with_faq_schema": int(cr["jsonld_has_faq"].fillna(False).sum()), "pages_with_breadcrumb": int(cr["jsonld_has_breadcrumb"].fillna(False).sum()),
    "pages_with_org": int(cr["jsonld_has_org"].fillna(False).sum()), "pages_with_service_schema": int(cr["jsonld_has_service"].fillna(False).sum()),
    "pages_with_article_schema": int(cr["jsonld_has_article"].fillna(False).sum()), "orphan_pages_no_inbound": int((cr["inbound_internal_links"] == 0).sum()),
    "duplicate_titles": int(sum(1 for d in dups if d["field"] == "title")), "duplicate_h1": int(sum(1 for d in dups if d["field"] == "h1")),
    "duplicate_descriptions": int(sum(1 for d in dups if d["field"] == "description")),
    "zero_impression_sitemap_pages_16m": int(len(zero)), "gsc_pages_not_in_sitemap": int(len(notsm)),
}
orph = cr[(cr["inbound_internal_links"] == 0) & (cr["in_sitemap"] == True)][["url", "title", "word_count", "internal_link_count", "sitemap_lastmod"]]  # noqa: E712
save(orph.merge(pall[["page", "clicks", "impressions"]].rename(columns={"page": "url"}), on="url", how="left"), "pages_orphan_no_inbound_links")

# ============================================================ 5. query x page pairs, language mismatch, cannibalization
print("[5] pairs, cannibalization")
qp90df = classify(load("query_page__last90"))
pairs = qpc.merge(qp90df[["query", "page", "clicks", "impressions", "ctr", "position"]].rename(columns={"clicks": "clicks_90d", "impressions": "impressions_90d", "ctr": "ctr_90d", "position": "position_90d"}), on=["query", "page"], how="outer")
pairs = pairs.merge(qpprev[["query", "page", "clicks", "impressions", "position"]].rename(columns={"clicks": "clicks_prev28", "impressions": "impressions_prev28", "position": "position_prev28"}), on=["query", "page"], how="left")
miss = pairs["topic"].isna()
if miss.any():
    tmp = classify(pairs.loc[miss, ["query"]].assign(position=np.nan))
    for c in ("topic", "topic_group", "language", "intent", "is_brand", "is_local", "is_commercial_modifier"):
        pairs.loc[miss, c] = tmp[c].values
pairs["page_locale"] = pairs["page"].map(locale_of)
pairs["page_type"] = pairs["page"].map(page_type_of)
pairs["language_mismatch"] = ((pairs["language"] == "uz") & (pairs["page_locale"] == "ru")) | ((pairs["language"] == "ru") & (pairs["page_locale"] == "uz"))
pairs = pairs.rename(columns={"clicks": "clicks_28d", "impressions": "impressions_28d", "ctr": "ctr_28d", "position": "position_28d"})
for c in ("clicks_28d", "impressions_28d", "clicks_90d", "impressions_90d"):
    pairs[c] = pairs[c].fillna(0).astype(int)
pairs = pairs.sort_values(["clicks_28d", "impressions_28d"], ascending=False)
save(pairs, "query_page_pairs")
lm = pairs[pairs["language_mismatch"] & (pairs["impressions_28d"] >= 10)]
save(lm, "language_mismatch")
SUMMARY["language_mismatch"] = {"pairs": int(len(lm)), "impressions_28d": int(lm["impressions_28d"].sum()), "clicks_28d": int(lm["clicks_28d"].sum())}

redirected = set(cr[cr["redirected"] == True]["url"]) | set(notsm[notsm["http_status"] != 200]["page"])  # noqa: E712
cann = []
for q, g in qp90df.groupby("query"):
    tot = g["impressions"].sum()
    if tot < 30 or len(g) < 2:
        continue
    g = g.sort_values("impressions", ascending=False)
    g["share"] = g["impressions"] / tot
    sig = g[(g["share"] >= 0.10) & (g["impressions"] >= 5)]
    if len(sig) < 2:
        continue
    pages = list(sig["page"])
    locales = {locale_of(p) for p in pages}
    types = {page_type_of(p) for p in pages}
    dom_share = float(sig.iloc[0]["share"])
    g28 = qpc[qpc["query"] == q].sort_values("impressions", ascending=False)
    gprev = qpprev[qpprev["query"] == q].sort_values("impressions", ascending=False)
    dom28 = g28.iloc[0]["page"] if len(g28) else None
    domprev = gprev.iloc[0]["page"] if len(gprev) else None
    if any(p in redirected for p in pages):
        verdict, note = "legacy_redirect_not_cannibalization", "one of the URLs is a 301 legacy URL Google still reports"
    elif len(locales) > 1 and "root" not in locales:
        verdict, note = "language_variant_not_cannibalization", "RU and UZ versions serve different language intents"
    elif dom_share >= 0.85:
        verdict, note = "minor_overlap", "dominant URL holds >=85% of impressions"
    elif "home" in types and len(types) > 1:
        verdict, note = "home_vs_landing_review", "homepage competes with a dedicated page; check internal links and title"
    else:
        verdict, note = "true_candidate", "two same-locale URLs split impressions for the same query"
    intent_same = len({intent_of(q, topic_of(q))}) == 1
    cann.append({
        "query": q, "topic": topic_of(q), "language": lang_of(q), "total_impressions_90d": int(tot), "total_clicks_90d": int(g["clicks"].sum()),
        "competing_urls": len(sig), "urls": " | ".join(sig["page"]),
        "clicks_per_url": " | ".join(str(int(x)) for x in sig["clicks"]), "impressions_per_url": " | ".join(str(int(x)) for x in sig["impressions"]),
        "positions_per_url": " | ".join(f"{x:.1f}" for x in sig["position"]), "dominant_url": sig.iloc[0]["page"], "dominant_share_pct": round(dom_share * 100, 1),
        "dominant_url_last28": dom28, "dominant_url_prev28": domprev, "dominant_url_changed": (dom28 != domprev) if (dom28 and domprev) else None,
        "same_locale": len(locales) == 1, "verdict": verdict, "note": note,
        "likely_primary_url": sig.sort_values(["clicks", "impressions"], ascending=False).iloc[0]["page"],
    })
cann_df = pd.DataFrame(cann).sort_values(["verdict", "total_impressions_90d"], ascending=[True, False]) if cann else pd.DataFrame()
save(cann_df, "cannibalization_candidates")
SUMMARY["cannibalization"] = cann_df["verdict"].value_counts().to_dict() if len(cann_df) else {}

# ============================================================ 6. devices
print("[6] devices")
dev_rows = []
for per in ("last7", "last28", "prev28", "last90", "prev90", "all16m"):
    d = load(f"device__{per}")
    tot_c, tot_i = d["clicks"].sum(), d["impressions"].sum()
    for r in d.itertuples():
        dev_rows.append({"period": per, "start": P[per][0], "end": P[per][1], "device": r.device, "clicks": r.clicks, "impressions": r.impressions, "ctr": round(r.ctr, 4), "position": round(r.position, 2),
                         "clicks_share_pct": round(r.clicks / max(tot_c, 1) * 100, 1), "impressions_share_pct": round(r.impressions / max(tot_i, 1) * 100, 1)})
dev = pd.DataFrame(dev_rows)
d28 = dev[dev["period"] == "last28"].set_index("device"); dp28 = dev[dev["period"] == "prev28"].set_index("device")
devcmp = d28[["clicks", "impressions", "ctr", "position", "clicks_share_pct", "impressions_share_pct"]].rename(columns=lambda c: f"current_{c}").join(
    dp28[["clicks", "impressions", "ctr", "position"]].rename(columns=lambda c: f"previous_{c}"))
devcmp["clicks_change"] = devcmp["current_clicks"] - devcmp["previous_clicks"]
devcmp["clicks_change_pct"] = [pct(a, b) for a, b in zip(devcmp["current_clicks"], devcmp["previous_clicks"])]
devcmp["impressions_change"] = devcmp["current_impressions"] - devcmp["previous_impressions"]
devcmp["impressions_change_pct"] = [pct(a, b) for a, b in zip(devcmp["current_impressions"], devcmp["previous_impressions"])]
devcmp["ctr_change"] = (devcmp["current_ctr"] - devcmp["previous_ctr"]).round(4)
devcmp["position_change"] = (devcmp["current_position"] - devcmp["previous_position"]).round(2)
devcmp = devcmp.reset_index()
save(pd.concat([devcmp, dev.assign(device=dev["device"] + " [" + dev["period"] + "]")[["device", "start", "end", "clicks", "impressions", "ctr", "position", "clicks_share_pct", "impressions_share_pct"]]], ignore_index=True), "device_comparison")
SUMMARY["devices_28d"] = devcmp.to_dict("records")

qd = classify(load("query_device__last28"))
pv = qd.pivot_table(index="query", columns="device", values=["clicks", "impressions", "ctr", "position"], aggfunc="first")
pv.columns = [f"{a}_{b.lower()}" for a, b in pv.columns]
pv = pv.reset_index().merge(q28[["query", "topic", "language"]], on="query", how="left")
for c in ("clicks_mobile", "clicks_desktop", "impressions_mobile", "impressions_desktop"):
    if c in pv:
        pv[c] = pv[c].fillna(0).astype(int)
pv["position_gap_desktop_minus_mobile"] = (pv.get("position_desktop") - pv.get("position_mobile")).round(2)
pv["ctr_gap_mobile_minus_desktop"] = (pv.get("ctr_mobile").fillna(0) - pv.get("ctr_desktop").fillna(0)).round(4)
pv = pv.sort_values("impressions_mobile", ascending=False)
save(pv, "device_query_split")
pdv = load("page_device__last28")
pvp = pdv.pivot_table(index="page", columns="device", values=["clicks", "impressions", "ctr", "position"], aggfunc="first")
pvp.columns = [f"{a}_{b.lower()}" for a, b in pvp.columns]
pvp = pvp.reset_index()
pvp["position_gap_desktop_minus_mobile"] = (pvp.get("position_desktop") - pvp.get("position_mobile")).round(2)
save(pvp.sort_values("impressions_mobile", ascending=False), "device_page_split")
qpd = load("query_page_device__last28")
mm = []
for q, g in qpd.groupby("query"):
    if g["impressions"].sum() < 50:
        continue
    tops = {}
    for dev_name, gg in g.groupby("device"):
        gg = gg.sort_values("impressions", ascending=False)
        tops[dev_name] = (gg.iloc[0]["page"], int(gg.iloc[0]["impressions"]), float(gg.iloc[0]["position"]))
    if "MOBILE" in tops and "DESKTOP" in tops and tops["MOBILE"][0] != tops["DESKTOP"][0] and tops["DESKTOP"][1] >= 5:
        mm.append({"query": q, "mobile_top_page": tops["MOBILE"][0], "mobile_impressions": tops["MOBILE"][1], "mobile_position": round(tops["MOBILE"][2], 1),
                   "desktop_top_page": tops["DESKTOP"][0], "desktop_impressions": tops["DESKTOP"][1], "desktop_position": round(tops["DESKTOP"][2], 1)})
save(pd.DataFrame(mm), "query_device_page_mismatch")
SUMMARY["device_page_mismatch_queries"] = len(mm)

# ============================================================ 7. countries
print("[7] countries")
c_rows = []
for per in ("last7", "last28", "prev28", "last90", "all16m"):
    d = load(f"country__{per}")
    tot_c, tot_i = d["clicks"].sum(), d["impressions"].sum()
    for r in d.itertuples():
        c_rows.append({"period": per, "start": P[per][0], "end": P[per][1], "country": r.country, "clicks": r.clicks, "impressions": r.impressions, "ctr": round(r.ctr, 4), "position": round(r.position, 2),
                       "clicks_share_pct": round(r.clicks / max(tot_c, 1) * 100, 1), "impressions_share_pct": round(r.impressions / max(tot_i, 1) * 100, 1)})
cty = pd.DataFrame(c_rows)
c28 = cty[cty["period"] == "last28"].set_index("country"); cp28 = cty[cty["period"] == "prev28"].set_index("country")
ccmp = c28[["clicks", "impressions", "ctr", "position", "clicks_share_pct", "impressions_share_pct"]].rename(columns=lambda c: f"current_{c}").join(
    cp28[["clicks", "impressions", "ctr", "position"]].rename(columns=lambda c: f"previous_{c}"), how="outer").fillna({"previous_clicks": 0, "previous_impressions": 0})
ccmp["clicks_change"] = ccmp["current_clicks"].fillna(0) - ccmp["previous_clicks"]
ccmp["clicks_change_pct"] = [pct(a, b) for a, b in zip(ccmp["current_clicks"].fillna(0), ccmp["previous_clicks"])]
ccmp["impressions_change"] = ccmp["current_impressions"].fillna(0) - ccmp["previous_impressions"]
ccmp["impressions_change_pct"] = [pct(a, b) for a, b in zip(ccmp["current_impressions"].fillna(0), ccmp["previous_impressions"])]
ccmp["ctr_change"] = (ccmp["current_ctr"] - ccmp["previous_ctr"]).round(4)
ccmp["position_change"] = (ccmp["current_position"] - ccmp["previous_position"]).round(2)
ccmp = ccmp.reset_index().sort_values("current_impressions", ascending=False)
save(ccmp, "country_comparison")
SUMMARY["countries_28d_top"] = ccmp.head(12).to_dict("records")
qc = classify(load("query_country__last28"))
topc = qc[qc["country"].isin(["uzb", "rus", "kaz", "kgz", "tjk", "ukr", "usa"])].sort_values(["country", "impressions"], ascending=[True, False]).groupby("country").head(30)
save(topc, "country_query_top")
pcty = load("page_country__last28")
save(pcty[pcty["country"].isin(["uzb", "rus", "kaz", "kgz", "tjk", "ukr", "usa"])].sort_values(["country", "impressions"], ascending=[True, False]).groupby("country").head(25).assign(locale=lambda d: d["page"].map(locale_of)), "country_page_top")
pvc = qc[qc["country"].isin(["uzb", "rus", "kaz"])].pivot_table(index="query", columns="country", values=["clicks", "impressions", "position", "ctr"], aggfunc="first")
pvc.columns = [f"{a}_{b}" for a, b in pvc.columns]
pvc = pvc.reset_index().merge(q28[["query", "topic", "language"]], on="query", how="left")
gap = pvc[(pvc.get("impressions_uzb", 0).fillna(0) >= 20) & (pvc.get("impressions_rus", 0).fillna(0) >= 10)].copy()
gap["position_gap_rus_minus_uzb"] = (gap["position_rus"] - gap["position_uzb"]).round(2)
save(gap.sort_values("impressions_rus", ascending=False), "query_country_position_gap")
# country x language of query
cl = qc[qc["country"].isin(["uzb", "rus", "kaz", "kgz", "tjk"])].groupby(["country", "language"]).agg(queries=("query", "nunique"), clicks=("clicks", "sum"), impressions=("impressions", "sum")).reset_index()
save(cl, "country_query_language")
SUMMARY["country_query_language_28d"] = cl.to_dict("records")

# ============================================================ 8. brand vs non-brand daily (90d)
print("[8] brand series")
dqc = dq.copy()
dqc["is_brand"] = dqc["query"].map(lambda q: topic_of(q) == "brand")
bd = dqc.groupby(["date", "is_brand"]).agg(clicks=("clicks", "sum"), impressions=("impressions", "sum")).reset_index()
bdp = bd.pivot_table(index="date", columns="is_brand", values=["clicks", "impressions"], aggfunc="sum").fillna(0)
bdp.columns = [f"{a}_{'brand' if b else 'nonbrand'}" for a, b in bdp.columns]
bdp = bdp.reset_index().merge(date_all[["date", "clicks", "impressions"]].rename(columns={"clicks": "clicks_property", "impressions": "impressions_property"}), on="date", how="left")
for c in ("clicks_brand", "clicks_nonbrand", "impressions_brand", "impressions_nonbrand"):
    if c not in bdp:
        bdp[c] = 0
bdp["clicks_anonymized"] = bdp["clicks_property"] - bdp["clicks_brand"] - bdp["clicks_nonbrand"]
bdp["impressions_anonymized"] = bdp["impressions_property"] - bdp["impressions_brand"] - bdp["impressions_nonbrand"]
bdp["date"] = bdp["date"].dt.strftime("%Y-%m-%d")
save(bdp, "brand_vs_nonbrand_daily")

# topic daily (90d) for the top topics chart
dqc["topic"] = dqc["query"].map(topic_of)
td = dqc.groupby(["date", "topic"]).agg(clicks=("clicks", "sum"), impressions=("impressions", "sum")).reset_index()
td["date"] = td["date"].dt.strftime("%Y-%m-%d")
save(td, "topic_daily")

# weekly top queries trend table (top 30 by 28d clicks)
top30 = list(q28.sort_values("clicks", ascending=False).head(30)["query"])
dqw = dqc[dqc["query"].isin(top30)].copy()
dqw["week_start"] = dqw["date"] - pd.to_timedelta(dqw["date"].dt.weekday, unit="D")
tw = dqw.groupby(["query", "week_start"]).agg(clicks=("clicks", "sum"), impressions=("impressions", "sum"), position=("position", "mean")).reset_index()
tw["week_start"] = tw["week_start"].dt.strftime("%Y-%m-%d")
tw["position"] = tw["position"].round(1)
save(tw.sort_values(["query", "week_start"]), "top_queries_weekly")
top20p = list(p28.sort_values("clicks", ascending=False).head(20)["page"])
dpw = dp[dp["page"].isin(top20p)].copy()
dpw["week_start"] = dpw["date"] - pd.to_timedelta(dpw["date"].dt.weekday, unit="D")
tpw = dpw.groupby(["page", "week_start"]).agg(clicks=("clicks", "sum"), impressions=("impressions", "sum"), position=("position", "mean")).reset_index()
tpw["week_start"] = tpw["week_start"].dt.strftime("%Y-%m-%d")
tpw["position"] = tpw["position"].round(1)
save(tpw.sort_values(["page", "week_start"]), "top_pages_weekly")

# ============================================================ 9. summary extras
SUMMARY["rows"] = {"queries_28d": int(len(q28)), "queries_90d": int(len(q90)), "queries_16m": int(len(qall)), "pages_28d": int(len(p28)), "pages_16m": int(len(pall)),
                   "query_page_pairs_28d": int(len(qpc)), "query_page_pairs_90d": int(len(qp90df)), "date_query_rows_90d": int(len(dq)), "date_page_rows_180d": int(len(dp))}
SUMMARY["top_queries_28d"] = q28.sort_values("clicks", ascending=False).head(25)[["query", "clicks", "impressions", "ctr", "position", "topic", "language"]].round(4).to_dict("records")
SUMMARY["top_pages_28d"] = pa.head(25)[["page", "current_clicks", "current_impressions", "current_ctr", "current_position", "previous_clicks", "previous_impressions", "unique_queries_28d", "dominant_topic_28d"]].round(4).to_dict("records")
SUMMARY["pages_share"] = {"top6_clicks_share_28d_pct": round(pa.head(6)["current_clicks"].sum() / max(totals["last28"]["clicks"], 1) * 100, 1),
                           "top10_clicks_share_28d_pct": round(pa.head(10)["current_clicks"].sum() / max(totals["last28"]["clicks"], 1) * 100, 1),
                           "pages_with_clicks_28d": int((pa["current_clicks"] > 0).sum()), "pages_with_impressions_28d": int((pa["current_impressions"] > 0).sum())}
SUMMARY["quick_wins_top"] = qw.head(30)[["query", "topic", "language", "clicks", "impressions", "ctr", "position", "expected_ctr_site", "ctr_ratio", "potential_extra_clicks_28d", "opportunity_score", "quick_win_type", "top_page_28d", "difficulty"]].round(4).to_dict("records")
SUMMARY["page_quick_wins_top"] = pq.head(20)[["page", "current_clicks", "current_impressions", "current_ctr", "current_position", "expected_ctr_site_pages", "ctr_ratio", "potential_extra_clicks_28d", "quick_win_type", "top_query_by_impressions", "title"]].round(4).to_dict("records")
SUMMARY["ctr_opportunities_top"] = ctr_opp.head(20)[["query", "clicks", "impressions", "ctr", "position", "expected_ctr_site", "potential_extra_clicks_28d", "top_page_28d"]].round(4).to_dict("records")
SUMMARY["declining_queries"] = declining.head(30).round(3).where(pd.notna(declining.head(30)), None).to_dict("records")
SUMMARY["declining_pages"] = pdecl.head(30).round(3).where(pd.notna(pdecl.head(30)), None).to_dict("records")
SUMMARY["growing_queries_top"] = growing.sort_values("clicks_change", ascending=False).head(20)[["query", "current_clicks", "previous_clicks", "current_impressions", "previous_impressions", "current_position", "previous_position"]].round(2).to_dict("records")
SUMMARY["new_queries_top"] = new_q.head(20)[["query", "current_clicks", "current_impressions", "current_position", "topic"]].round(2).to_dict("records")
SUMMARY["lost_queries_top"] = lost_q.head(20)[["query", "previous_clicks", "previous_impressions", "previous_position", "topic"]].round(2).to_dict("records")
SUMMARY["no_click_queries_top"] = no_clicks.head(20)[["query", "impressions", "position", "topic"]].round(2).to_dict("records")
SUMMARY["cannibalization_true"] = cann_df[cann_df["verdict"].isin(["true_candidate", "home_vs_landing_review"])].to_dict("records") if len(cann_df) else []
SUMMARY["url_inspection"] = insp
(OUT / "summary.json").write_text(json.dumps(SUMMARY, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
print("summary.json written")
