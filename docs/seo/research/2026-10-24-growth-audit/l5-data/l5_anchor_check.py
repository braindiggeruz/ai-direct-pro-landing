"""Flag internal anchors (content JSON: internalLinks + linkp links) that use a phrase the TARGET must not target
(intent-manifest mustNotTarget) or the banned exact anchors. Usage: py -3 -I l5_anchor_check.py <repo_root>"""
import sys, os, json, glob, re
sys.stdout.reconfigure(encoding='utf-8')
REPO = sys.argv[1]
man = json.load(open(os.path.join(REPO, 'content', 'seo', 'intent-manifest.json'), encoding='utf-8'))
mustnot = {}
for p in man['pairs']:
    for side in ('commercial', 'informational'):
        s = p.get(side)
        if isinstance(s, dict):
            mustnot.setdefault(s['url'], set()).update(x.lower() for x in s.get('mustNotTarget', []))
def norm(s):
    s = (s or '').lower().replace('ʻ', '‘').replace("'", '‘').replace('’', '‘')
    return re.sub(r'\s+', ' ', s).strip()
BANNED = ['chatgpt kirish', 'чат джипити']
out = []
for f in glob.glob(os.path.join(REPO, 'content', '**', '*.json'), recursive=True):
    if os.sep + 'seo' + os.sep in f: continue
    try: d = json.load(open(f, encoding='utf-8'))
    except Exception: continue
    if not isinstance(d, dict) or d.get('status') != 'published': continue
    links = [(l.get('target'), l.get('anchor'), 'internalLinks') for l in d.get('internalLinks', []) or []]
    for b in (d.get('body') or d.get('bodyBlocks') or []):
        for l in b.get('links', []) or []:
            links.append((l.get('target'), l.get('anchor'), 'linkp'))
    for t, a, where in links:
        if not t or not t.startswith('/'): continue
        t = t.split('#')[0]
        na = norm(a)
        for ph in mustnot.get(t, ()):
            if norm(ph) == na or (len(norm(ph)) > 6 and norm(ph) in na):
                out.append((d.get('url'), t, a, where, 'mustNotTarget of target: ' + ph))
        for ph in BANNED:
            if ph == na:
                out.append((d.get('url'), t, a, where, 'banned exact anchor'))
for r in sorted(set(out)): print(' | '.join(r))
print('total', len(set(out)))
