# Build a readable table of tt_kw1 metrics (+ reused known rows) grouped by candidate group.
import json, os, glob
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = r"F:\Claude\gptbot-snippets-translator-20261024\docs\seo\research"
cand = json.load(open(os.path.join(HERE, 'candidates.json'), encoding='utf-8'))
groups = cand['groups']

def series(row):
    ms = row.get('monthly_searches') or []
    ms = sorted(ms, key=lambda m: (m['year'], m['month']))
    return [(f"{m['year']}-{m['month']:02d}", m['search_volume']) for m in ms]

def sig(row):
    s = series(row)
    return (row.get('search_volume'), tuple(v for _, v in s))

rows = {}
def take(f, tag):
    d = json.load(open(f, encoding='utf-8'))
    for r in d.get('keywords', []):
        kw = r.get('keyword', '').lower()
        if kw and kw not in rows:
            rows[kw] = dict(r, src=tag)

take(os.path.join(HERE, 'tt_kw1_metrics.json'), 'tt_kw1')
for f in glob.glob(BASE + r"\2026-10-24-growth-audit\l3-data\kw*_metrics.json") + glob.glob(BASE + r"\2026-10-25-roadmap-1000\data\kw*_metrics.json") + glob.glob(BASE + r"\2026-10-25-clusters-to-add\*-data\*metrics*.json"):
    if 'text-tools-data' in f:
        continue
    take(f, os.path.basename(f))
extra = os.path.join(HERE, 'tt_kw2_metrics.json')
if os.path.exists(extra):
    d = json.load(open(extra, encoding='utf-8'))
    for r in d.get('keywords', []):
        rows[r['keyword'].lower()] = dict(r, src='tt_kw2')

def jump(row):
    s = dict(series(row))
    on = [s.get('2025-10'), s.get('2025-11')]
    js = [s.get('2026-07'), s.get('2026-08'), s.get('2026-09')]
    if None in on or None in js or not row.get('search_volume'):
        return None
    a = sum(on) / 2; b = sum(js) / 3
    return round(b / a, 1) if a else None

out = []
for g in sorted(set(groups.values())):
    out.append(f"\n=== {g} ===")
    lst = [(k, rows.get(k)) for k, gg in groups.items() if gg == g]
    lst.sort(key=lambda x: -((x[1] or {}).get('search_volume') or 0))
    for k, r in lst:
        if r is None:
            out.append(f"   -- | {k} | not measured"); continue
        v = r.get('search_volume')
        s = series(r)
        tr = ' '.join(str(x[1]) for x in s)
        out.append(f"{v if v is not None else 'null':>8} | {k} | j={jump(r)} | {tr} | {r['src']}")
open(os.path.join(HERE, 'table1.txt'), 'w', encoding='utf-8').write('\n'.join(out))
# also bucket duplicates (same volume + same series, volume>=100)
from collections import defaultdict
b = defaultdict(list)
for k, r in rows.items():
    if k in groups and (r.get('search_volume') or 0) >= 100 and r.get('monthly_searches'):
        b[sig(r)].append(k)
dups = [v for v in b.values() if len(v) > 1]
open(os.path.join(HERE, 'buckets1.txt'), 'w', encoding='utf-8').write('\n'.join(' = '.join(v) for v in dups))
print('rows', len(rows), 'dup buckets', len(dups))
