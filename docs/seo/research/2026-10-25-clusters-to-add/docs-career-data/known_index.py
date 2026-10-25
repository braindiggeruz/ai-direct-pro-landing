"""Build an index of every keyword already measured (any lens, any date) so this lens does not pay twice.
Writes known_all.json {keyword: {"v": volume, "src": file, "trend": [..12 months..] or None}}.
Run: py -3 -I known_index.py   (from this folder)
"""
import json, sys, io, glob, os, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
R = 'F:/Claude/gptbot-snippets-translator-20261024/'
OUT = os.path.dirname(os.path.abspath(__file__))
known = {}

def add(kw, v, src, trend=None):
    if not kw:
        return
    kw = kw.strip()
    if kw in known and known[kw]['v'] is not None and known[kw].get('trend'):
        return
    known[kw] = {'v': v, 'src': src, 'trend': trend}

files = glob.glob(R + 'docs/seo/research/**/*.json', recursive=True)
for f in files:
    if os.path.abspath(f).startswith(OUT):
        continue
    try:
        d = json.load(open(f, encoding='utf-8'))
    except Exception:
        continue
    src = f.replace('\\', '/').split('docs/seo/research/')[-1]
    if isinstance(d, dict) and isinstance(d.get('keywords'), list):
        for k in d['keywords']:
            if isinstance(k, dict) and 'keyword' in k:
                tr = k.get('monthly_searches')
                if tr:
                    tr = [(m['year'], m['month'], m['search_volume']) for m in tr]
                add(k['keyword'], k.get('search_volume'), src, tr)
    if isinstance(d, dict) and isinstance(d.get('results'), list):
        for r in d['results']:
            if isinstance(r, dict) and isinstance(r.get('rows'), list):
                for k in r['rows']:
                    if isinstance(k, dict) and 'keyword' in k:
                        add(k['keyword'], k.get('searchVolume'), src + '#research:' + str(r.get('seed')))

dp = json.load(open(R + 'content/seo/demand-policy.json', encoding='utf-8'))
for k in dp['approvedKeywords']:
    add(k['keyword'], k.get('volumePerMonth'), 'content/seo/demand-policy.json')

json.dump(known, open(os.path.join(OUT, 'known_all.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('known keywords:', len(known))

pat = re.compile(sys.argv[1] if len(sys.argv) > 1 else
                 r"(ariza|rezyume|resume|резюме|obyektiv|ob'ektiv|объектив|ma.lumotnoma|malumotnoma|маълумотнома|motivats|мотивац|cover|xat\b|xati|хат|suhbat|собеседован|intervyu|interview|shartnoma|шартнома|договор|buyruq|буйрук|приказ|dalolatnoma|акт |ishonchnoma|доверенност|tavsiyanoma|рекоменд|tavsifnoma|характеристик|заявлени|объяснительн|tushuntirish|образец|namuna|cv\b|cv |ishga|вакан|vakans|ish o|работа|ish e'lon|akt)", re.I)
rows = [(v['v'] or 0, k, v['src']) for k, v in known.items() if pat.search(k)]
rows.sort(key=lambda x: -x[0])
for v, k, s in rows:
    print(v, '|', k, '|', s)
