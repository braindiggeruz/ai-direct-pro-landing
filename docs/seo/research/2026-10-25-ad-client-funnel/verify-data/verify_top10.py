"""Adversarial re-check of the first-10 build list of AD_CLIENT_FUNNEL.md (2026-10-25).

Run: py -3 -I verify-data/verify_top10.py  (from the ad-client-funnel folder)
Reads ranked.json (pre-verification numbers), applies the corrections documented in
AD_CLIENT_FUNNEL.md section «Проверка», writes verify-data/verify_top10.json and prints
the corrected table rows and totals. Same formula as the lenses:
visits/day = demand x CTR / 30 x 1.5 x AIO (pos6 CTR 0.61-1.10 %, pos3 3.59 %, AIO 0.53-0.655),
leads/month = visits x 30 x conversion, score = visits3_mid x effCPC x directness x SERP / effort,
normalised to the ORIGINAL scale (100 = original Telegram Ads raw score 3.363).
"""
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

CONV = {'price': (0.02, 0.05), 'problem': (0.005, 0.02), 'mixed': (0.002, 0.005)}
BASE = 2.85 * 2.95 * 0.6 * 1.0 / 1.5  # original top raw score (tg-ads-howto) = 3.363


def v6(d):
    return (d * 0.0061 / 30 * 1.5 * 0.53, d * 0.011 / 30 * 1.5 * 0.655)


def v3(d):
    return (d * 0.0359 / 30 * 1.5 * 0.53, d * 0.0359 / 30 * 1.5 * 0.655)


def leads(v, conv):
    return (v[0] * 30 * conv[0], v[1] * 30 * conv[1])


def add(a, b):
    return (a[0] + b[0], a[1] + b[1])


def eff_cpc(cpc, n):
    return (cpc * n + 1.30 * 2) / (n + 2) if n else 1.30


def seg_cluster(segments, cpc_eff, serp, effort, pos3_override=None):
    """segments: list of (demand, conv_key, directness, pos3_mode) ; pos3_mode 'v3' or 'v6cap'."""
    p6 = (0.0, 0.0); p3 = (0.0, 0.0); l6 = (0.0, 0.0); l3 = (0.0, 0.0); dsum = 0.0; wdir = 0.0; dem = 0
    for demand, ck, dr, mode in segments:
        a6 = v6(demand)
        a3 = v3(demand) if mode == 'v3' else v6(demand)
        p6 = add(p6, a6); p3 = add(p3, a3)
        l6 = add(l6, leads(a6, CONV[ck])); l3 = add(l3, leads(a3, CONV[ck]))
        mid = (a3[0] + a3[1]) / 2
        dsum += mid; wdir += mid * dr; dem += demand
    directness = wdir / dsum if dsum else 0
    raw = (p3[0] + p3[1]) / 2 * cpc_eff * directness * serp / effort
    return dict(demand=dem, visits_day_pos6=p6, visits_day_pos3=p3, leads_month_pos6=l6,
                leads_month_pos3=l3, directness=directness, cpc_effective=cpc_eff,
                serp_factor=serp, effort_divisor=effort, score=raw / BASE * 100)


ranked = json.load(open(os.path.join(ROOT, 'ranked.json'), encoding='utf-8'))
by_id = {c['id']: c for c in ranked['clusters']}

corr = {}
# 1 hub-target-uz: DIY half (580) back to the plan's own DIY conversion; targetolog/таргетолог heads (310)
#   = vacancies/profession SERP (A7 + SERP 25.10) -> mixed audience; hire/price rows (190) stay 2-5 %.
corr['hub-target-uz'] = seg_cluster([(580, 'problem', 0.6, 'v3'), (310, 'mixed', 0.3, 'v3'), (190, 'price', 1.0, 'v3')],
                                    1.81, 1.25, 1.0)
# 2 tg-ads-howto: heads telegram ads / ads telegram / ads telegram org (2 412 eff.) not claimable
#   (intent-manifest telegram-ru: bare head unclaimed; GSC 3 mo: 0 impressions for the head) -> tail 270.
tail_cpc = (110 * 6.03 + 40 * 2.6 + 20 * 3.14 + 10 * (2.23 + 1.15 + 1.63 + 2.38 + 1.71 + 2.05 + 2.14)) / 240
corr['tg-ads-howto'] = seg_cluster([(270, 'problem', 0.6, 'v3')], eff_cpc(tail_cpc, 10), 1.0, 1.5)
corr['tg-ads-howto']['cpc_lens'] = tail_cpc
# 3 kontekst-budget-calc: drop 430 of heads (гугл адс nav, контекстная реклама definitional SERP,
#   google adwords nav, яндекс реклама ambiguous, реклама гугл = Google Ads DIY intent) -> 100 price/hire rows;
#   SERP 25.10 has AI Overview -> AIO on both bounds; only CPC left: настройка яндекс директ 0.47 (n=1).
corr['kontekst-budget-calc'] = seg_cluster([(100, 'price', 1.0, 'v3')], eff_cpc(0.47, 1), 1.0, 1.0)
corr['kontekst-budget-calc']['cpc_lens'] = 0.47
# 4 uzum-seller-guide: navigational heads (5 185 eff.) cannot reach pos 3 (Uzum's own domains hold 1-3) ->
#   pos3 scenario = tail 715 at pos3 + heads at pos6.
corr['uzum-seller-guide'] = seg_cluster([(715, 'mixed', 0.3, 'v3'), (5185, 'mixed', 0.3, 'v6cap')], 2.31, 1.0, 2.0)
# 5 tg-channel-checklist: RU rows owned by /ru/telegram-ads-uzbekistan/ (реклама в телеграм, ... каналах; 140)
#   removed; keeps UZ hub rows 80 + TGStat/Telemetr rows 248.
chk_cpc = (80 * ((70 * 2.38 + 10 * 2.18) / 80) + 248 * 2.40) / 328
corr['tg-channel-checklist'] = seg_cluster([(328, 'problem', 0.6, 'v3')], eff_cpc(chk_cpc, 5), 0.8, 1.0)
corr['tg-channel-checklist']['cpc_lens'] = chk_cpc
# 7 reklama-matni-ai: 3 product-description rows (30) belong to kartochka-ai; SERP 25.10: AI tool promli.com #1.
corr['reklama-matni-ai'] = seg_cluster([(520, 'problem', 0.6, 'v3')], 1.04, 1.25, 1.0)
# 6 agency-prices-table: every counted row is owned by an existing price article or unanswerable -> GEO only.
corr['agency-prices-table'] = dict(demand=0, visits_day_pos6=(0, 0), visits_day_pos3=(0, 0), leads_month_pos6=(0, 0),
                                   leads_month_pos3=(0, 0), directness=1.0, cpc_effective=1.02, serp_factor=1.0,
                                   effort_divisor=1.0, score=0.0, note='GEO only, not modelled')
# 10 uzum-external-ads: borrowed CPC 1.55 (target yoqish) replaced by the method default 1.30.
c = by_id['uzum-external-ads']
corr['uzum-external-ads'] = dict(demand=100, visits_day_pos6=tuple(c['visits_day_pos6']),
                                 visits_day_pos3=tuple(c['visits_day_pos3']), leads_month_pos6=tuple(c['leads_month_pos6']),
                                 leads_month_pos3=tuple(c['leads_month_pos3']), directness=1.0, cpc_effective=1.30,
                                 serp_factor=1.5, effort_divisor=1.0,
                                 score=(sum(c['visits_day_pos3']) / 2) * 1.30 * 1.0 * 1.5 / 1.0 / BASE * 100)

out_clusters = []
for c in ranked['clusters']:
    x = corr.get(c['id'])
    row = dict(id=c['id'], rank_before=c['rank'], funnel=c['funnel'], status=c['status'], build_order=c.get('build_order'))
    if x:
        row.update({k: (list(v) if isinstance(v, tuple) else v) for k, v in x.items()})
        row['corrected'] = True
    else:
        row.update(demand=c['demand_month'], visits_day_pos6=c['visits_day_pos6'], visits_day_pos3=c['visits_day_pos3'],
                   leads_month_pos6=c['leads_month_pos6'], leads_month_pos3=c['leads_month_pos3'], score=c['score'],
                   cpc_effective=c['cpc_effective'], corrected=False)
    row['score_before'] = c['score']
    out_clusters.append(row)


def tot(rows):
    s = dict(n=len(rows), demand=sum(r['demand'] for r in rows))
    for k in ('visits_day_pos6', 'visits_day_pos3', 'leads_month_pos6', 'leads_month_pos3'):
        s[k] = [round(sum(r[k][0] for r in rows), 2), round(sum(r[k][1] for r in rows), 2)]
    return s


first10 = [r for r in out_clusters if r['build_order']]
active = [r for r in out_clusters if r['status'] != 'deferred']
funnels = {f: tot([r for r in active if r['funnel'] == f]) for f in ('F1', 'F2', 'F3', 'F4', 'F5')}
result = dict(date='2026-10-25', base_raw_score=BASE, totals=dict(first10=tot(first10), active=tot(active),
              all=tot(out_clusters)), funnels=funnels, clusters=out_clusters)
json.dump(result, open(os.path.join(HERE, 'verify_top10.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def f(v):
    return f'{v[0]:.2f}–{v[1]:.2f}'.replace('.', ',')


for r in sorted(first10, key=lambda r: r['build_order']):
    print(r['build_order'], r['id'], r['demand'], round(r.get('cpc_effective', 0), 2), f(r['visits_day_pos6']), f(r['visits_day_pos3']),
          f(r['leads_month_pos6']), f(r['leads_month_pos3']), round(r['score'], 1), 'before', r['score_before'])
print('FIRST10', json.dumps(result['totals']['first10'], ensure_ascii=False))
print('ACTIVE', json.dumps(result['totals']['active'], ensure_ascii=False))
print('ALL', json.dumps(result['totals']['all'], ensure_ascii=False))
for k, v in funnels.items():
    print(k, json.dumps(v, ensure_ascii=False))
print('tail_cpc', round(tail_cpc, 2), 'chk_cpc', round(chk_cpc, 2))
