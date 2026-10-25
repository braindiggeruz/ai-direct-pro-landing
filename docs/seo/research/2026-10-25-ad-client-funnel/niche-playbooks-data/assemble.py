# Writes ../niche-playbooks.json from computed.json plus the method block of this lens.
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
c = json.load(open(os.path.join(HERE, 'computed.json'), encoding='utf-8'))

def cpc_str(o):
    if not o['cpc_weighted']:
        return 'нет данных (CPC null у всех запросов кластера)'
    lo, hi = o['cpc_range']
    if lo == hi:
        return f"{str(o['cpc_weighted']).replace('.', ',')} (один запрос с CPC из {o['keywords_counted']})"
    return (f"взвешенный {str(o['cpc_weighted']).replace('.', ',')}; диапазон {str(lo).replace('.', ',')}–{str(hi).replace('.', ',')} "
            f"({o['cpc_keywords_with_value']} запр. с CPC из {o['keywords_counted']})")

clusters = []
for o in c['clusters']:
    clusters.append(dict(
        priority=o['priority'], id=o['id'], name=o['name'], keywords=o['keywords'],
        demand_month=o['demand_month'], keywords_counted=o['keywords_counted'], keywords_measured=o['keywords_measured'],
        cpc_usd=cpc_str(o), cpc_weighted=o['cpc_weighted'], cpc_range=o['cpc_range'],
        visits_day_pos6=o['visits_day_pos6'], visits_day_pos3=o['visits_day_pos3'],
        existing_url=o['existing_url'], page=o['page'], lead_path=o['lead_path'], effort=o['effort'],
        honesty_risk=o['honesty_risk'], serp=o['serp'], serp_weakness=o['serp_weakness'],
        shared_buckets=o['shared_buckets'], excluded=o['excluded']))

res = dict(
    lens='niche-playbooks', date='2026-10-25', location=2860,
    method=dict(
        sources=[
            'research_keywords x3 seeds (как найти клиентов, маркетинговая стратегия, продвижение ресторана), resultLimit 500, source google_ads',
            'get_keyword_metrics x2 (699 + 386 = 1 085 candidates: 12 niches x RU/UZ-Latin modifiers, UZ Cyrillic spot checks, opening stage, generic growth)',
            "get_serp_results x1 (4 queries, depth 10: o'quv markazi reklama, go'zallik saloni reklama, yatt ochish, бизнес идеи)",
            'get_search_console_performance (free, last 3 months 2026-07-22..2026-10-22; 13 query/page filters)',
            'reuse: existing_lookup.json = 6 187 keywords already measured by sibling lenses (checked before buying; naming / agency / outdoor rows left to their owners)'],
        measured=dict(total=1085, volume_gt_10=111, volume_10=279, zero=78, null=617),
        dedupe=('one Google Ads bucket counted once: phrases differing only by stop-words/word order (для, в, как, на, по, uchun) or listed as plural '
                'variants, with identical volume+CPC+competition, are one bucket (shared_buckets); no keyword counted in two clusters; '
                'keywords owned by other lenses or existing pages are listed in excluded, not counted'),
        caveat_10=('279 of the 1 085 measured phrases sit in the lowest Google Ads bucket (10/mo), and almost every counted phrase of the niche '
                   'clusters is one of them; real demand per phrase is 0-15, so niche totals are an upper-bound sum of a long tail'),
        visits='D x CTR / 30 x 1.5 x AIO; CTR pos6 0.61-1.10 %, pos3 3.59 %; AIO x0.53-0.655 applied to every cluster (4/4 SERPs of this lens had an AI Overview)',
        uz_spelling='UZ Latin sent with ASCII apostrophe (OpenSEO rejects U+2018); apostrophe-less variants measured separately and came back null',
        credits=('own estimate ~508 of 600 (research 3 x ~96 = ~288, metrics 2 x 104 = 208, SERP 4 x depth 10 = ~12); account 19 744 -> 18 834 '
                 'incl. parallel lenses; the last window (metrics #2 + 4 SERP) moved the balance by exactly 116')),
    totals=dict(demand=c['totals']['demand'], niche_playbooks_only=c['totals']['niche_only'],
                visits_day_pos6=c['totals']['visits_day_pos6'], visits_day_pos3=c['totals']['visits_day_pos3']),
    handoffs=[
        {'to': 'prices-tools cluster 5 (business-name generator)', 'what': 'new rows: brend nomlari 390, fast food nomlari 110, kompaniya nomlari 70, firma nomlari 90, kafe nomlari 70, salon nomlari 30'},
        {'to': '/uz/blog/marketing-nima/ (owner of marketing nima / marketing turlari)', 'what': 'маркетинг нима 170 (UZ Cyrillic), marketing turlari 140, raqamli marketing 110 is counted in cluster 8'},
        {'to': '/uz/blog/biznes-reja-tuzish/ (owner of biznes reja)', 'what': 'бизнес режа 140, CPC $1.49 (UZ Cyrillic)'},
        {'to': 'smm-uz cluster (/uz/blog/smm-nima/)', 'what': 'smm marketing 390, CPC $1.71 — check SERP before assigning'},
        {'to': 'UZ ad basics (internet-reklama-toshkent owner)', 'what': 'reklama turlari 170, reklama nima 170, reklama matnlari 70 (reklama matni yozish 210 already in prices-tools)'},
        {'to': 'not counted, needs SERP', 'what': 'ingliz tili reklama 210 (ambiguous), dorixona reklama 70 (medicine ads are legally restricted), telefon reklama 30'},
        {'to': 'agency/local pack (needs Google Business Profile, rejected for SEO by prices-tools)', 'what': 'рекламное агентство 260 ($1.22), рекламное агентство ташкент 90 ($3.38), маркетинговое агентство 90 ($3.11), маркетинговое агентство ташкент 70 ($3.14), reklama agentligi 260 ($0.78)'}],
    gsc_summary=('3 months: no niche-marketing query at all; traces only («сколько стоит лиды для салона красоты» 7 imp pos 26, «ии для салона красоты» 20 imp). '
                 'Niche AI-bot pages: /ru/ai-bot-dlya-salona-krasoty/ 155 imp, /ru/ai-bot-dlya-yurista/ 93 imp pos 4.5, /ru/ai-bot-dlya-kliniki/ 73, '
                 '/ru/ai-bot-dlya-horeca/ 60, /uz/oquv-markazi-uchun-ai-bot/ 15 imp 2 clicks — these are the internal-link sources for the playbooks.'),
    clusters=clusters)
json.dump(res, open(os.path.join(HERE, '..', 'niche-playbooks.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('written', len(clusters))
