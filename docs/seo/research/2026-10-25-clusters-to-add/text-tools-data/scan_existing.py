import json, glob, os, re, sys
base = r"F:\Claude\gptbot-snippets-translator-20261024\docs\seo\research"
files = glob.glob(base + r"\2026-10-24-growth-audit\l3-data\kw*_metrics.json") + glob.glob(base + r"\2026-10-25-roadmap-1000\data\kw*_metrics.json") + glob.glob(base + r"\2026-10-25-clusters-to-add\*-data\*.json")
d = json.load(open(files[0], encoding='utf-8'))
print(json.dumps(d['keywords'][0], ensure_ascii=False)[:900]); print(d['meta'])
pat = re.compile(r"tabrik|табрик|поздрав|she.?r|шеър|стих|maqol|мақол|послов|topishmoq|топишмоқ|загад|\bism|исм|имен|imlo|имло|орфограф|grammat|граммат|qisqart|парафраз|перефраз|sanash|слов|символ|belgi|lotin|kirill|латин|кирил|hikoya|ҳикоя|рассказ|status|статус|sms|insho|иншо|сочинен|matn|текст|esse|эссе", re.I)
seen = {}
for f in files:
    try:
        d = json.load(open(f, encoding='utf-8'))
    except Exception as e:
        print('ERR', f, e); continue
    kws = d.get('keywords', []) if isinstance(d, dict) else (d if isinstance(d, list) else [])
    for k in kws:
        if not isinstance(k, dict): continue
        kw = k.get('keyword')
        if kw and pat.search(kw):
            seen[kw] = (k.get('searchVolume', k.get('search_volume')), os.path.basename(f))
for kw, v in sorted(seen.items(), key=lambda x: -(x[1][0] or 0)):
    print(v[0], '|', kw, '|', v[1])
