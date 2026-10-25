# Builds an index of every keyword already measured (any lens, any date) so this lens does not pay twice.
# Output: known_all.json  {keyword_lower: {"vol": int|None, "ms": [...]|None, "src": file}}
import json, glob, os, sys

ROOT = r"F:/Claude/gptbot-snippets-translator-20261024"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "known_all.json")

pats = [
    "docs/seo/research/**/*metrics*.json",
    "docs/seo/research/**/kw*_metrics*.json",
]
files = set()
for p in pats:
    files.update(glob.glob(os.path.join(ROOT, p), recursive=True))
files = sorted(f for f in files if "calculators-utility-data" not in f or f.endswith(("cu_kw1_metrics.json", "cu_kw2_metrics.json")))

known = {}

def add(kw, vol, ms, src):
    k = kw.strip().lower()
    cur = known.get(k)
    if cur is None or (cur["vol"] is None and vol is not None) or (cur["ms"] is None and ms):
        known[k] = {"vol": vol, "ms": ms, "src": os.path.relpath(src, ROOT)}

for f in files:
    try:
        d = json.load(open(f, encoding="utf-8"))
    except Exception:
        continue
    rows = d.get("keywords") if isinstance(d, dict) else d
    if not isinstance(rows, list):
        continue
    for r in rows:
        if isinstance(r, dict) and isinstance(r.get("keyword"), str):
            add(r["keyword"], r.get("search_volume"), r.get("monthly_searches"), f)

dp = json.load(open(os.path.join(ROOT, "content/seo/demand-policy.json"), encoding="utf-8"))
for r in dp.get("approvedKeywords", []):
    add(r["keyword"], r.get("volumePerMonth"), None, os.path.join(ROOT, "content/seo/demand-policy.json"))

json.dump(known, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print(len(files), "files;", len(known), "keywords known")
