# Readable table of call-2 rows (tt_kw2_metrics.json) grouped by candidates2 groups, plus bucket duplicates
# across tt_kw1 + tt_kw2 + earlier lens files.
import json, os, glob
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = r"F:\Claude\gptbot-snippets-translator-20261024\docs\seo\research"
groups = json.load(open(os.path.join(HERE, 'candidates2.json'), encoding='utf-8'))['groups']
d = json.load(open(os.path.join(HERE, 'tt_kw2_metrics.json'), encoding='utf-8'))
rows = {r['keyword'].lower(): r for r in d['keywords']}
def ser(r):
    return [m['search_volume'] for m in sorted(r.get('monthly_searches') or [], key=lambda m: (m['year'], m['month']))]
def jump(r):
    s = ser(r)
    if len(s) < 12 or not r.get('search_volume'):
        return None
    a = (s[0] + s[1]) / 2; b = (s[9] + s[10] + s[11]) / 3
    return round(b / a, 1) if a else None
out = []
for g in sorted(set(groups.values())):
    out.append(f"\n=== {g} ===")
    lst = sorted([(k, rows.get(k)) for k, gg in groups.items() if gg == g], key=lambda x: -((x[1] or {}).get('search_volume') or 0))
    for k, r in lst:
        if r is None:
            continue
        v = r.get('search_volume')
        if not v:
            out.append(f"    null | {k}"); continue
        out.append(f"{v:>8} | {k} | j={jump(r)} | {' '.join(map(str, ser(r)))}")
open(os.path.join(HERE, 'table2.txt'), 'w', encoding='utf-8').write('\n'.join(out))
# bucket duplicates across all files
allrows = {}
files = [os.path.join(HERE, 'tt_kw1_metrics.json'), os.path.join(HERE, 'tt_kw2_metrics.json')] + glob.glob(BASE + r"\2026-10-24-growth-audit\l3-data\kw*_metrics.json") + glob.glob(BASE + r"\2026-10-25-roadmap-1000\data\kw*_metrics.json") + [f for f in glob.glob(BASE + r"\2026-10-25-clusters-to-add\*-data\*metrics*.json") if 'text-tools-data' not in f]
for f in files:
    for r in json.load(open(f, encoding='utf-8')).get('keywords', []):
        allrows.setdefault(r['keyword'].lower(), r)
b = defaultdict(list)
for k, r in allrows.items():
    if (r.get('search_volume') or 0) >= 100 and r.get('monthly_searches'):
        b[(r['search_volume'], tuple(ser(r)))].append(k)
dups = [v for v in b.values() if len(v) > 1 and any(x in rows for x in v)]
open(os.path.join(HERE, 'buckets2.txt'), 'w', encoding='utf-8').write('\n'.join(' = '.join(v) for v in dups))
print('call2 rows', len(rows), 'with volume', sum(1 for r in rows.values() if r.get('search_volume')), 'dups', len(dups))
