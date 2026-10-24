"""Calibration of demand-based click estimates against the site's own new UZ guides.

Inputs (read-only):
  ../l5-data/gsc_page_28d_all.tsv      GSC page rows 2026-09-24..10-21, resultId 7081b224-e5bf-4560-b04f-ac32f2a86aff
  ../../../../../content/seo/demand-policy.json   approvedKeywords (Google Ads loc 2860)
  ../../../../../content/blog/uz/<slug>.json      datePublished
Method (same as L3/L6): predicted_28d = demand_per_month * CTR(pos 6-8) * 0.92,
CTR low = 0.38 %, high = 1.10 % (L1 sec.3.3 site curve without the two chats).
K = realised clicks / predicted low bound.  Exposure = days of the 28-day window the page was live.
"""
import csv, json, os, datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
gsc = {}
with open(os.path.join(HERE, '..', 'l5-data', 'gsc_page_28d_all.tsv'), encoding='utf-8') as f:
    rows = [r for r in f if not r.startswith('#')]
for r in csv.DictReader(rows, delimiter='\t'):
    gsc[r['url'].replace('https://gptbot.uz', '')] = (int(r['clicks']), int(r['impressions']), float(r['position']))
dp = {r['keyword']: r['volumePerMonth'] for r in json.load(open(os.path.join(ROOT, 'content/seo/demand-policy.json'), encoding='utf-8'))['approvedKeywords']}
pages = {
  'insho-yozish-suniy-intellekt-bilan': ['insho yozish', 'esse yozish tartibi', 'esse yozish'],
  'slayd-tayyorlash': ['slayd tayyorlash', 'prezentatsiya tayyorlash', 'taqdimot tayyorlash'],
  'referat-va-mustaqil-ish': ['referat namuna', 'mustaqil ish', 'referat yozish'],
  'rezyume-tayyorlash': ['rezyume tayyorlash', 'rezyume namuna'],
  'kurs-ishi-yozish': ['kurs ishi', 'kurs ishi namuna', 'kurs ishi tayyorlash'],
  'tushuntirish-xati-va-ariza-yozish': ['tushuntirish xati', 'ariza yozish', 'ariza namunasi'],
  'biznes-reja-tuzish': ['biznes reja', 'biznes reja tuzish', 'biznes reja namuna'],
}
W0, W1 = dt.date(2026, 9, 24), dt.date(2026, 10, 21)
out, tot = [], {'demand': 0, 'pred_low_exposed': 0.0, 'clicks': 0, 'impr': 0, 'searches_exposed': 0.0}
for slug, kws in pages.items():
    doc = json.load(open(os.path.join(ROOT, 'content/blog/uz', slug + '.json'), encoding='utf-8'))
    pub = dt.date.fromisoformat(doc['datePublished'][:10])
    days = max(0, (W1 - max(pub, W0)).days + 1)
    demand = sum(dp[k] for k in kws)
    c, i, p = gsc.get('/uz/blog/%s/' % slug, (0, 0, 0.0))
    searches = demand * days / 30.4
    pred_low = searches * 0.0038 * 0.92
    out.append({'page': slug, 'published': str(pub), 'days_in_window': days, 'demand_month': demand,
                'searches_in_window': round(searches), 'impressions': i, 'impression_share_pct': round(100 * i / searches, 2) if searches else None,
                'clicks': c, 'pred_low_clicks': round(pred_low, 1), 'K': round(c / pred_low, 3) if pred_low else None})
    for k, v in (('demand', demand), ('pred_low_exposed', pred_low), ('clicks', c), ('impr', i), ('searches_exposed', searches)):
        tot[k] += v
tot['K_all'] = round(tot['clicks'] / tot['pred_low_exposed'], 3)
tot['impression_share_pct_all'] = round(100 * tot['impr'] / tot['searches_exposed'], 2)
tot['pred_low_exposed'] = round(tot['pred_low_exposed'], 1); tot['searches_exposed'] = round(tot['searches_exposed'])
json.dump({'pages': out, 'total': tot}, open(os.path.join(HERE, 'calibration.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for r in out: print(r)
print(tot)
