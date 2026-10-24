"""L1 CTR lens - reproducible computation from the raw GSC dumps saved next to this file.
Run: py -3 -I l1_ctr_compute.py  (from this directory, or pass the dir as argv[1]).
Outputs l1_ctr_compute.json + prints tables.
Rounding: position rounded half-up (floor(x+0.5)), so 4.5 -> 5.
"""
import json, math, os, sys, collections
sys.stdout.reconfigure(encoding='utf-8')
D = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
H = 'https://gptbot.uz'
CHATS = {'/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/'}

def strip(u):
    return u[len(H):] if u.startswith(H) else u

def rpos(p):
    return int(math.floor(p + 0.5))

def load_json_rows(name):
    d = json.load(open(os.path.join(D, name), encoding='utf-8'))
    return d, [dict(page=strip(r['keys'][0]), query=r['keys'][1], clicks=r['clicks'], impressions=r['impressions'], position=r['position']) for r in d['rows']]

def load_tsv(name, cols):
    out = []
    for line in open(os.path.join(D, name), encoding='utf-8'):
        if line.startswith('#') or not line.strip():
            continue
        parts = line.rstrip('\n').split('\t')
        if parts[0] == cols[0]:
            continue
        out.append(dict(zip(cols, parts)))
    return out

# all-country page+query
m0, pq0 = load_json_rows('gsc_page_query_28d_p0.json')
m1, pq1 = load_json_rows('gsc_page_query_28d_p1.json')
PQ = pq0 + pq1
# uzb page+query
u0m, upq0 = load_json_rows('gsc_page_query_28d_uzb_p0.json')
upq1 = [dict(page=r['page'], query=r['query'], clicks=int(r['clicks']), impressions=int(r['impressions']), position=float(r['position']))
        for r in load_tsv('gsc_page_query_28d_uzb_p1.tsv', ['page', 'query', 'clicks', 'impressions', 'position'])]
UPQ = upq0 + upq1
# page-level
UP = [dict(page=r['page'], clicks=int(r['clicks']), impressions=int(r['impressions']), ctr=float(r['ctr']), position=float(r['position']))
      for r in load_tsv('gsc_page_28d_uzb.tsv', ['page', 'clicks', 'impressions', 'ctr', 'position'])]
AP = [dict(page=r['page'], clicks=int(r['clicks']), impressions=int(r['impressions']), ctr=float(r['ctr']), position=float(r['position']))
      for r in load_tsv('gsc_page_28d_all_min100.tsv', ['page', 'clicks', 'impressions', 'ctr', 'position'])]

res = {}
res['row_counts'] = dict(all_pq=len(PQ), all_pq_p0_meta=m0['rowCount'], all_pq_p1_meta=m1['rowCount'], uzb_pq=len(UPQ),
                         uzb_pq_p0_meta=u0m['rowCount'], uzb_pq_p1=len(upq1), uzb_page=len(UP), all_page_min100=len(AP))
res['sums'] = dict(
    all_pq=dict(clicks=sum(r['clicks'] for r in PQ), impressions=sum(r['impressions'] for r in PQ)),
    uzb_pq=dict(clicks=sum(r['clicks'] for r in UPQ), impressions=sum(r['impressions'] for r in UPQ)),
    uzb_page=dict(clicks=sum(r['clicks'] for r in UP), impressions=sum(r['impressions'] for r in UP)),
    all_page_min100=dict(clicks=sum(r['clicks'] for r in AP), impressions=sum(r['impressions'] for r in AP)),
)

def curve(rows, exclude=()):
    b = collections.defaultdict(lambda: dict(clicks=0, impressions=0, n=0, pages=[]))
    for r in rows:
        if r['page'] in exclude:
            continue
        k = rpos(r['position'])
        b[k]['clicks'] += r['clicks']; b[k]['impressions'] += r['impressions']; b[k]['n'] += 1
        if 'query' not in r:
            b[k]['pages'].append((r['page'], r['clicks'], r['impressions']))
    out = {}
    for k in sorted(b):
        v = b[k]
        out[k] = dict(clicks=v['clicks'], impressions=v['impressions'], n=v['n'], ctr=(v['clicks'] / v['impressions'] if v['impressions'] else 0),
                      top=sorted(v['pages'], key=lambda x: -x[2])[:4])
    return out

res['curve_page_uzb_all'] = curve(UP)
res['curve_page_uzb_nochat'] = curve(UP, CHATS)
res['curve_query_uzb_all'] = curve(UPQ)
res['curve_query_uzb_nochat'] = curve(UPQ, CHATS)

def show(name, c, maxk=12):
    print(f'\n== {name} ==')
    print('pos\tpages/rows\tclicks\timpr\tCTR%\ttop pages')
    for k, v in c.items():
        if k > maxk:
            continue
        tops = '; '.join(f'{p} {cl}/{im}' for p, cl, im in v['top'])
        print(f"{k}\t{v['n']}\t{v['clicks']}\t{v['impressions']}\t{v['ctr']*100:.2f}\t{tops}")

show('PAGE-level UZ curve, all pages', res['curve_page_uzb_all'])
show('PAGE-level UZ curve, excl. 2 chats', res['curve_page_uzb_nochat'])
show('QUERY-level UZ curve, all', res['curve_query_uzb_all'])
show('QUERY-level UZ curve, excl. 2 chats', res['curve_query_uzb_nochat'])

# candidates: >=200 impressions in either all-country or uzb page data, not chats
cand = {}
for r in AP:
    if r['impressions'] >= 200 and r['page'] not in CHATS:
        cand.setdefault(r['page'], {})['all'] = r
for r in UP:
    if r['impressions'] >= 200 and r['page'] not in CHATS:
        cand.setdefault(r['page'], {})['uzb'] = r
for p in cand:
    if 'uzb' not in cand[p]:
        cand[p]['uzb'] = next((r for r in UP if r['page'] == p), None)
    if 'all' not in cand[p]:
        cand[p]['all'] = next((r for r in AP if r['page'] == p), None)

def topq(rows, page, n=10):
    qs = [r for r in rows if r['page'] == page]
    return sorted(qs, key=lambda r: (-r['impressions'], -r['clicks']))[:n], dict(rows=len(qs), clicks=sum(r['clicks'] for r in qs), impressions=sum(r['impressions'] for r in qs))

res['candidates'] = {}
print('\n== CANDIDATES (>=200 impr all-country or UZ, excl chats) ==')
for p, v in sorted(cand.items(), key=lambda x: -(x[1]['all']['impressions'] if x[1]['all'] else 0)):
    out = {'all': v['all'], 'uzb': v['uzb']}
    for scope, key in (('uzb', 'curve_page_uzb_nochat'), ('uzb_allpages', 'curve_page_uzb_all')):
        u = v['uzb']
        if u:
            k = rpos(u['position']); c = res[key].get(k, {}).get('ctr')
            out[f'curve_{scope}'] = dict(bucket=k, curve_ctr=c, cur_ctr=u['clicks'] / u['impressions'] if u['impressions'] else 0,
                                         ratio=(u['clicks'] / u['impressions']) / c if c else None,
                                         gap_clicks=u['impressions'] * (c - u['clicks'] / u['impressions']) if c is not None else None)
    a = v['all']
    if a:
        k = rpos(a['position']); c = res['curve_page_uzb_nochat'].get(k, {}).get('ctr')
        out['curve_on_all'] = dict(bucket=k, curve_ctr=c, cur_ctr=a['clicks'] / a['impressions'],
                                   ratio=(a['clicks'] / a['impressions']) / c if c else None,
                                   gap_clicks=a['impressions'] * (c - a['clicks'] / a['impressions']) if c is not None else None)
    tq_all, s_all = topq(PQ, p); tq_uz, s_uz = topq(UPQ, p)
    out['topq_all'] = tq_all; out['topq_all_sum'] = s_all; out['topq_uzb'] = tq_uz; out['topq_uzb_sum'] = s_uz
    res['candidates'][p] = out
    print(f"\n### {p}")
    print('  all:', a, '\n  uzb:', v['uzb'])
    for kk in ('curve_uzb', 'curve_uzb_allpages', 'curve_on_all'):
        if kk in out:
            print('  ', kk, {x: (round(y, 4) if isinstance(y, float) else y) for x, y in out[kk].items()})
    print('  top queries ALL (q | clicks/impr/pos):', s_all)
    for r in tq_all:
        print(f"    {r['query']} | {r['clicks']}/{r['impressions']}/{r['position']}")
    print('  top queries UZB:', s_uz)
    for r in tq_uz[:6]:
        print(f"    {r['query']} | {r['clicks']}/{r['impressions']}/{r['position']}")

json.dump(res, open(os.path.join(D, 'l1_ctr_compute.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
print('\nrow_counts', res['row_counts']); print('sums', res['sums'])
