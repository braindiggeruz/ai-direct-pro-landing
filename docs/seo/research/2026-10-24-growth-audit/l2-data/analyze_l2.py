"""L2 striking-distance analysis over the transcribed GSC TSVs in this folder.
Usage: py -3 -I analyze_l2.py   (run from anywhere; paths are relative to this file)
Read-only; prints Markdown tables used in L2-striking-distance.md.
"""
import csv
import pathlib
import re
import sys
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8")
HERE = pathlib.Path(__file__).parent
PROTECTED = {
    "/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/", "/uz/gpt-uzbek-tilida/", "/ru/gpt-chat/",
    "/ru/blog/chatgpt-i-claude-v-uzbekistane/", "/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/",
    "/uz/blog/chatgptga-qanday-kirish-mumkin/", "/uz/blog/chatgpt-uzbek-tilida-promptlar/", "/",
    "/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/", "/uz/blog/ai-chat-nima-va-qanday-turlari-bor/",
}
CHATS = {"/ru/gpt-chat/", "/uz/gpt-uzbek-tilida/"}

# Uzbekistan-only values for the top-25 pairs (same window, filter country=uzb, pos 4-20, imp>=50;
# resultIds 03b7f4f1-a5b3-4b06-b199-3a49cedac495 and bbe44d32-e352-489d-ae41-0996a9e0abb6).
# None = the pair has no UZB row inside the position 4-20 filter.
UZB = {
    ("chatgpt kirish", "/uz/gpt-uzbek-tilida/"): (140, 37684, 7.3),
    ("чачи пити", "/ru/gpt-chat/"): (5, 5681, 6.3),
    ("чати пити", "/ru/gpt-chat/"): (4, 3781, 6.3),
    ("chatgpt kirish", "/ru/gpt-chat/"): (17, 10483, 7.0),
    ("chatgpt kirish", "/uz/blog/chatgptga-qanday-kirish-mumkin/"): (25, 7030, 6.8),
    ("chatgpt yozish", "/uz/gpt-uzbek-tilida/"): (26, 7066, 7.0),
    ("jaji piti", "/uz/gpt-uzbek-tilida/"): (28, 6806, 5.0),
    ("чачи пити сайт", "/ru/gpt-chat/"): (1, 648, 5.9),
    ("чачи пити онлайн", "/ru/gpt-chat/"): (5, 691, 5.1),
    ("chatgpt yuklab olish", "/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/"): (41, 3347, 7.7),
    ("chatgpt ochish", "/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/"): (25, 3638, 5.4),
    ("chatgpt bepul", "/ru/gpt-chat/"): (25, 3345, 5.8),
    ("chatgpt kirish uzbek tilida", "/uz/blog/chatgptga-qanday-kirish-mumkin/"): (4, 2527, 8.2),
    ("chatgpt kirish uzbek tilida", "/uz/gpt-uzbek-tilida/"): (24, 2291, 5.1),
    ("chatgpt ilovasini yuklab olish", "/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/"): None,
    ("chatgpt yuklab olish uzbek tilida", "/uz/gpt-uzbek-tilida/"): (12, 2126, 9.0),
    ("chatgpt uzbekcha скачать", "/ru/gpt-chat/"): (13, 1459, 6.1),
    ("chatgpt bepul kirish", "/uz/gpt-uzbek-tilida/"): (17, 1928, 6.3),
    ("чати пити онлайн", "/ru/gpt-chat/"): (14, 571, 4.6),
    ("чача пити", "/ru/gpt-chat/"): (1, 288, 6.9),
    ("jaji piti online", "/uz/gpt-uzbek-tilida/"): (7, 1153, 4.4),
    ("chati piti", "/uz/gpt-uzbek-tilida/"): (27, 999, 7.6),
    ("чат джипити", "/ru/gpt-chat/"): (0, 892, 6.3),
    ("jajipiti", "/uz/gpt-uzbek-tilida/"): (2, 872, 5.2),
    ("chatgpt yozish", "/ru/gpt-chat/"): (0, 814, 7.3),
}


def load(name):
    rows = []
    with open(HERE / name, encoding="utf-8") as f:
        lines = [ln for ln in f if not ln.startswith("#")]
    for r in csv.DictReader(lines, delimiter="\t"):
        rows.append({"q": r["query"], "p": r["page"], "c": int(r["clicks"]), "i": int(r["impressions"]),
                     "pos": float(r["position"])})
    return rows


A = load("gsc_qp_all_pos4-20_imp50.tsv")
B = load("gsc_qp_nonchat_pos4-20_imp20.tsv")

tot_i = sum(r["i"] for r in A)
tot_c = sum(r["c"] for r in A)
prot_i = sum(r["i"] for r in A if r["p"] in PROTECTED)
chat_i = sum(r["i"] for r in A if r["p"] in CHATS)
print(f"## Totals (A: all countries, pos 4-20, imp>=50): {len(A)} pairs, {tot_c} clicks, {tot_i} impressions, CTR {tot_c/tot_i:.2%}")
print(f"protected share of impressions: {prot_i/tot_i:.1%}; two chats: {chat_i/tot_i:.1%}")
unprot_B = [r for r in B if r["p"] not in PROTECTED]
print(f"unprotected pairs (B, imp>=20): {len(unprot_B)} pairs, {sum(r['c'] for r in unprot_B)} clicks, {sum(r['i'] for r in unprot_B)} impressions")

print("\n## By page (A)")
pg = defaultdict(lambda: [0, 0, 0, 0.0])
for r in A:
    g = pg[r["p"]]
    g[0] += 1; g[1] += r["c"]; g[2] += r["i"]; g[3] += r["pos"] * r["i"]
print("| page | P | pairs | clicks | impressions | CTR | imp-weighted pos |")
print("|---|---|---|---|---|---|---|")
for p, (n, c, i, w) in sorted(pg.items(), key=lambda kv: -kv[1][2]):
    print(f"| `{p}` | {'P' if p in PROTECTED else ''} | {n} | {c} | {i:,} | {c/i:.2%} | {w/i:.1f} |".replace(",", " "))

print("\n## By page (B, unprotected only)")
pg = defaultdict(lambda: [0, 0, 0, 0.0])
for r in unprot_B:
    g = pg[r["p"]]
    g[0] += 1; g[1] += r["c"]; g[2] += r["i"]; g[3] += r["pos"] * r["i"]
print("| page | pairs | clicks | impressions | CTR | imp-weighted pos |")
print("|---|---|---|---|---|---|")
for p, (n, c, i, w) in sorted(pg.items(), key=lambda kv: -kv[1][2]):
    print(f"| `{p}` | {n} | {c} | {i} | {c/i:.2%} | {w/i:.1f} |")

print("\n## Top 25 pairs by impressions (A) with UZB split")
top = sorted(A, key=lambda r: -r["i"])[:25]
print("| # | query | page | clicks | impr | CTR | pos | UZB impr (share) | UZB CTR |")
print("|---|---|---|---|---|---|---|---|---|")
for n, r in enumerate(top, 1):
    u = UZB.get((r["q"], r["p"]), "missing")
    if u is None:
        us, uc = "нет строки в фильтре 4–20", "—"
    elif u == "missing":
        us, uc = "?", "?"
    else:
        us, uc = f"{u[1]:,} ({u[1]/r['i']:.0%})".replace(",", " "), f"{u[0]/u[1]:.2%}"
    print(f"| {n} | {r['q']} | `{r['p']}` | {r['c']} | {r['i']:,} | {r['c']/r['i']:.2%} | {r['pos']} | {us} | {uc} |".replace(",", " ") if False else
          f"| {n} | {r['q']} | `{r['p']}` | {r['c']} | {r['i']} | {r['c']/r['i']:.2%} | {r['pos']} | {us} | {uc} |")
t25_i = sum(r["i"] for r in top)
t25_c = sum(r["c"] for r in top)
print(f"top-25: {t25_c} clicks / {t25_i} impressions = {t25_i/tot_i:.1%} of A; all on protected pages: {all(r['p'] in PROTECTED for r in top)}")

print("\n## RU chat: script of the query (A)")
cyr = re.compile(r"[а-яё]", re.I)
lat_uz = [r for r in A if r["p"] == "/ru/gpt-chat/" and not cyr.search(r["q"])]
mix = [r for r in A if r["p"] == "/ru/gpt-chat/" and cyr.search(r["q"]) and re.search(r"[a-z]", r["q"])]
cyr_only = [r for r in A if r["p"] == "/ru/gpt-chat/" and cyr.search(r["q"]) and not re.search(r"[a-z]", r["q"])]
for name, rs in (("Latin only", lat_uz), ("mixed Latin+Cyrillic", mix), ("Cyrillic only", cyr_only)):
    i = sum(r["i"] for r in rs); c = sum(r["c"] for r in rs)
    print(f"- {name}: {len(rs)} pairs, {c} clicks, {i} impressions, CTR {c/i:.2%}")
    for r in sorted(rs, key=lambda r: -r["i"])[:12]:
        print(f"    {r['q']}: {r['c']}/{r['i']} pos {r['pos']}")

print("\n## GPT-definition family (B rows on the two RU GPT pages)")
for p in ("/ru/gpt-vs-chatgpt-sravnenie/", "/ru/chto-takoe-gpt-i-kak-polzovatsya/"):
    rs = [r for r in B if r["p"] == p]
    print(p, sum(r["c"] for r in rs), "clicks", sum(r["i"] for r in rs), "impressions", len(rs), "pairs")
