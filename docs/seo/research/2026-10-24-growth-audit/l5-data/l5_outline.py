"""Print the block outline of a content JSON (blog `body` or page `bodyBlocks`) with link targets.
Usage: py -3 -I l5_outline.py <repo_root> <url-path> [maxchars]
"""
import sys, os, json, glob

REPO, URL = sys.argv[1], sys.argv[2]
MAX = int(sys.argv[3]) if len(sys.argv) > 3 else 160
sys.stdout.reconfigure(encoding='utf-8')
hit = None
for f in glob.glob(os.path.join(REPO, 'content', '**', '*.json'), recursive=True):
    if os.sep + 'seo' + os.sep in f:
        continue
    try:
        d = json.load(open(f, encoding='utf-8'))
    except Exception:
        continue
    if isinstance(d, dict) and d.get('url') == URL:
        hit = (f, d)
        break
if not hit:
    print('not found', URL)
    sys.exit(1)
f, d = hit
print('FILE', os.path.relpath(f, REPO), '| status', d.get('status'), '| pageType', d.get('pageType'), '| primaryKeyword', d.get('primaryKeyword'))
blocks = d.get('body') or d.get('bodyBlocks') or []
key = 'body' if d.get('body') else 'bodyBlocks'
for i, b in enumerate(blocks):
    t = b.get('type')
    txt = b.get('text') or ''
    if t in ('list', 'ul'):
        txt = ' • '.join(b.get('items', []))
    if t == 'table':
        txt = 'TABLE ' + ' | '.join(b.get('headers', []))
    links = ', '.join(f"{l.get('token')}→{l.get('target')} «{l.get('anchor')}»" for l in b.get('links', []) if l.get('target'))
    extra = f" id={b['id']}" if b.get('id') else ''
    print(f"{key}[{i}] {t}{extra}: {txt[:MAX]}" + (f"  || {links}" if links else '') + (f" -> {b.get('href')}" if b.get('href') else ''))
print('internalLinks:')
for l in d.get('internalLinks', []):
    print('   ', l.get('target'), '«' + str(l.get('anchor')) + '»', l.get('type'), l.get('priority'))
