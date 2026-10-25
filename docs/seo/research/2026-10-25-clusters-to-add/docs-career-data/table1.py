"""Print dc_kw1_metrics.json as a table: volume | keyword | cluster | trend (Oct-25..Sep-26) | bucket-id (identical volume+trend rows).
Run: py -3 -I table1.py > dc_kw1_table.txt
"""
import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, 'dc_kw1_metrics.json'), encoding='utf-8'))
tags = json.load(open(os.path.join(HERE, 'candidates1.json'), encoding='utf-8'))['tags']
rows = d['keywords']
print('rows returned', len(rows), 'of', len(json.load(open(os.path.join(HERE, 'candidates1.json'), encoding='utf-8'))['to_measure']))
buckets = {}
out = []
for k in rows:
    ms = k.get('monthly_searches') or []
    ms = sorted(ms, key=lambda m: (m['year'], m['month']))
    tr = tuple(m['search_volume'] for m in ms)
    sig = (k.get('search_volume'), tr)
    if (k.get('search_volume') or 0) > 0:
        buckets.setdefault(sig, []).append(k['keyword'])
    out.append((k.get('search_volume') or 0, k['keyword'], tags.get(k['keyword'], '?'), tr, sig, k.get('competition'), k.get('cpc')))
out.sort(key=lambda x: (-x[0], x[2]))
bid = {}
for i, (sig, kws) in enumerate(sorted(buckets.items(), key=lambda x: -(x[0][0] or 0))):
    bid[sig] = 'B%d' % i if len(kws) > 1 else ''
for v, kw, cl, tr, sig, comp, cpc in out:
    if v == 0:
        continue
    print(f"{v:>6} | {kw} | {cl} | {'/'.join(str(x) for x in tr)} | {bid.get(sig,'')} | comp {comp} cpc {cpc}")
zero = [kw for v, kw, *_ in out if v == 0]
print('\nZERO/NULL volume (%d):' % len(zero), '; '.join(zero))
