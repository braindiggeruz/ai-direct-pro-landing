import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
R='F:/Claude/gptbot-snippets-translator-20261024/'
files=[R+'docs/seo/research/2026-10-25-roadmap-1000/data/kw3_metrics.json',R+'docs/seo/research/2026-10-25-roadmap-1000/data/kw4_metrics.json',R+'docs/seo/research/2026-10-24-growth-audit/l3-data/kw1_metrics.json',R+'docs/seo/research/2026-10-24-growth-audit/l3-data/kw2_metrics.json']
known={}
for f in files:
    d=json.load(open(f,encoding='utf-8'))
    for k in d['keywords']:
        kw=k.get('keyword')
        if kw not in known: known[kw]=(k.get('search_volume'), f.split('/')[-1])
dp=json.load(open(R+'content/seo/demand-policy.json',encoding='utf-8'))
for k in dp['approvedKeywords']:
    kw=k['keyword']
    if kw not in known: known[kw]=(k.get('volumePerMonth'),'demand-policy')
print(len(known))
for kw,(v,src) in sorted(known.items(), key=lambda x:-(x[1][0] or 0)):
    print(v, '|', kw, '|', src)
json.dump({k:v[0] for k,v in known.items()}, open(R+'docs/seo/research/2026-10-25-clusters-to-add/education-practice-data/known_keywords.json','w',encoding='utf-8'), ensure_ascii=False)
