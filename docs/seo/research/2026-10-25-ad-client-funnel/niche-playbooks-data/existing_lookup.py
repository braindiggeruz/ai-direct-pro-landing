# Build a lookup of every keyword already measured by earlier lenses (location 2860), to avoid re-buying.
import json, glob, os, re, sys
base = r"F:/Claude/gptbot-snippets-translator-20261024/docs/seo/research"
files = [f for f in glob.glob(base+"/**/*.json", recursive=True) if re.search(r"(kw|metric|research1_raw)", os.path.basename(f))]
rows = {}
def walk(x, src):
    if isinstance(x, dict):
        if 'keyword' in x and ('search_volume' in x or 'searchVolume' in x):
            k = x['keyword'].lower().strip()
            v = x.get('search_volume', x.get('searchVolume'))
            cpc = x.get('cpc'); comp = x.get('competition')
            if k not in rows or (rows[k]['v'] is None and v is not None):
                rows[k] = {'v': v, 'cpc': cpc, 'comp': comp, 'src': os.path.relpath(src, base)}
        for vv in x.values(): walk(vv, src)
    elif isinstance(x, list):
        for vv in x: walk(vv, src)
for f in files:
    if 'niche-playbooks-data' in f: continue
    try:
        walk(json.load(open(f, encoding='utf-8')), f)
    except Exception as e:
        print("ERR", f, e, file=sys.stderr)
json.dump(rows, open(base+"/2026-10-25-ad-client-funnel/niche-playbooks-data/existing_lookup.json","w",encoding='utf-8'), ensure_ascii=False)
print(len(rows), "keywords from", len(files), "files")
