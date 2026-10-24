"""L1 CTR lens, step 2: leave-one-out (LOO) benchmarks.
Why: in the plain page-level curve each position bucket 5-7 is >=95% one page, so comparing a page with
its own bucket returns ~1.0 by construction. LOO removes the page itself (and the two chats) from the curve.
Benchmarks per candidate page P:
  A  UZ page-level curve (country=uzb, as the task asks), all pages incl. chats, P removed
  B  UZ page-level curve, chats removed, P removed
  C  all-country page-level curve (pages >=100 impr; includes anonymised-query clicks), chats removed, P removed
  Q  UZ query-level: expected clicks = sum over P's UZ query rows of impr x CTR_bucket, where the bucket CTR
     comes from all UZ page+query rows except P and the chats (1 352 rows minus those).
Buckets with < 1 000 impressions or < 5 clicks after LOO are flagged 'thin'.
Run: py -3 -I l1_ctr_loo.py <dir>
"""
import json, math, os, sys, collections
sys.stdout.reconfigure(encoding='utf-8')
D = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(D, 'l1_ctr_compute.py'), encoding='utf-8').read().split("res = {}")[0])  # reuse loaders only

def bucket_table(rows, exclude):
    b = collections.defaultdict(lambda: [0, 0])
    for r in rows:
        if r['page'] in exclude:
            continue
        k = rpos(r['position']); b[k][0] += r['clicks']; b[k][1] += r['impressions']
    return b

def loo_ctr(rows, page, extra_ex, k):
    b = bucket_table(rows, set(extra_ex) | {page})
    c, i = b.get(k, [0, 0])
    return (c / i if i else None), c, i

cands = ['/uz/blog/chatgptga-qanday-kirish-mumkin/', '/ru/gpt-vs-chatgpt-sravnenie/', '/ru/blog/chat-gpt-online/',
         '/uz/blog/chatgpt-uzbek-tilida-promptlar/', '/ru/blog/chat-gpt-na-russkom/', '/ru/chto-takoe-gpt-i-kak-polzovatsya/',
         '/ru/blog/chat-s-ii-gde-poobshchatsya-s-iskusstvennym-intellektom/', '/uz/blog/insho-yozish-suniy-intellekt-bilan/',
         '/ru/gde-polzovatsya-gpt-besplatno/', '/ru/blog/gpt-chat-bot-na-russkom-i-uzbekskom-kak-rabotaet/', '/ru/promty-gpt-chatgpt-50-primerov/',
         '/', '/ru/blog/chatgpt-i-claude-v-uzbekistane/', '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/',
         '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/', '/ru/blog/chto-takoe-lid-v-marketinge/',
         '/ru/seo-prodvizhenie-saytov-tashkent/', '/ru/razrabotka-saytov-tashkent/']
out = {}
for p in cands:
    a = next((r for r in AP if r['page'] == p), None)
    u = next((r for r in UP if r['page'] == p), None)
    row = {'page': p, 'all': a, 'uzb': u}
    if u:
        k = rpos(u['position'])
        for name, ex in (('A', ()), ('B', CHATS)):
            c, cc, ii = loo_ctr(UP, p, ex, k)
            cur = u['clicks'] / u['impressions']
            row[name] = dict(bucket=k, curve=c, curve_clicks=cc, curve_impr=ii, thin=(ii < 1000 or cc < 5), cur=cur,
                             ratio=(cur / c if c else None), gap=(u['impressions'] * (c - cur) if c is not None else None))
    if a:
        k = rpos(a['position'])
        c, cc, ii = loo_ctr(AP, p, CHATS, k)
        cur = a['clicks'] / a['impressions']
        row['C'] = dict(bucket=k, curve=c, curve_clicks=cc, curve_impr=ii, thin=(ii < 1000 or cc < 5), cur=cur,
                        ratio=(cur / c if c else None), gap=(a['impressions'] * (c - cur) if c is not None else None))
    # query-level expected (UZ)
    bq = bucket_table(UPQ, CHATS | {p})
    exp = 0.0; act = 0; imp = 0; thin_imp = 0; detail = []
    for r in UPQ:
        if r['page'] != p:
            continue
        k = rpos(r['position']); c, i = bq.get(k, [0, 0]); ctr = c / i if i else 0.0
        exp += r['impressions'] * ctr; act += r['clicks']; imp += r['impressions']
        if i < 1000 or c < 5:
            thin_imp += r['impressions']
        detail.append((r['query'], r['clicks'], r['impressions'], r['position'], round(ctr * 100, 2)))
    row['Q'] = dict(actual=act, expected=round(exp, 1), impr=imp, ratio=(act / exp if exp else None), gap=round(exp - act, 1),
                    thin_share=(thin_imp / imp if imp else None),
                    top=sorted(detail, key=lambda x: -x[2])[:8])
    out[p] = row

qcurve = bucket_table(UPQ, CHATS)
print('UZ query-level curve excl chats (all pages):', {k: (v[0], v[1], round(v[0] / v[1] * 100, 2) if v[1] else None) for k, v in sorted(qcurve.items()) if k <= 12})
for p, r in out.items():
    print('\n###', p)
    print('  all:', r['all'] and (r['all']['clicks'], r['all']['impressions'], r['all']['ctr'], r['all']['position']),
          '| uzb:', r['uzb'] and (r['uzb']['clicks'], r['uzb']['impressions'], r['uzb']['ctr'], r['uzb']['position']))
    for kk in ('A', 'B', 'C'):
        if kk in r:
            v = r[kk]
            print(f"  {kk}: bucket {v['bucket']} curve={None if v['curve'] is None else round(v['curve']*100,2)}% ({v['curve_clicks']}/{v['curve_impr']}{' THIN' if v['thin'] else ''}) cur={round(v['cur']*100,2)}% ratio={None if v['ratio'] is None else round(v['ratio'],2)} gap={None if v['gap'] is None else round(v['gap'],1)}")
    q = r['Q']
    print(f"  Q: actual {q['actual']} vs expected {q['expected']} on {q['impr']} UZ impr; ratio {None if q['ratio'] is None else round(q['ratio'],2)}; gap {q['gap']}; thin-bucket share {None if q['thin_share'] is None else round(q['thin_share'],2)}")
    for t in q['top']:
        print('     ', t)
json.dump(out, open(os.path.join(D, 'l1_ctr_loo.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
