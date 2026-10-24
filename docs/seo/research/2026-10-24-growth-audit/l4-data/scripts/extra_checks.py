import re, sys, os, json
from urllib.parse import urlparse
D = sys.argv[1]
crawl = json.load(open(sys.argv[2], encoding='utf-8'))
md_links = 0; md_missing = []; feeds = {}; llms_link = 0
img_missing = []
for r in crawl['results']:
    f = os.path.join(D, r['file'])
    h = open(f, encoding='utf-8').read()
    for m in re.finditer(r'<link[^>]*type="text/markdown"[^>]*href="([^"]+)"', h):
        md_links += 1
        p = urlparse(m.group(1)).path
        if not os.path.isfile(os.path.join(D, p.lstrip('/'))):
            md_missing.append(r['url'])
    for m in re.finditer(r'<link[^>]*type="application/(rss|atom)\+xml"[^>]*href="([^"]+)"', h):
        feeds[m.group(2)] = feeds.get(m.group(2), 0) + 1
    if 'rel="llms"' in h: llms_link += 1
    for il in r['sitemap']['images']:
        p = urlparse(il).path
        if not os.path.isfile(os.path.join(D, p.lstrip('/'))):
            img_missing.append(il)
print('md alternate links', md_links, 'missing targets', len(md_missing), md_missing[:5])
print('feeds', feeds)
print('rel=llms pages', llms_link)
print('sitemap images', sum(len(r['sitemap']['images']) for r in crawl['results']), 'missing', img_missing[:5], len(img_missing))
for fn in ['llms.txt', 'llms-full.txt']:
    t = open(os.path.join(D, fn), encoding='utf-8').read()
    urls = sorted(set(re.findall(r'https://gptbot\.uz[^\s\)\]>"\'`]*', t)))
    bad = []; notsm = []
    smset = {x['url'] for x in crawl['results']}
    for u in urls:
        u2 = u.rstrip('.,;:')
        p = urlparse(u2).path
        ok = os.path.isfile(os.path.join(D, p.lstrip('/'), 'index.html')) if p.endswith('/') else os.path.isfile(os.path.join(D, p.lstrip('/')))
        if not ok: bad.append(u2)
        elif u2 not in smset and p.endswith('/'): notsm.append(u2)
    print(fn, 'urls', len(urls), 'unresolved', bad[:15], 'not-in-sitemap', notsm[:10])
# sitemap-updates subset
upd = crawl['updates']; sm = {x['url']: x['sitemap']['lastmod'] for x in crawl['results']}
print('updates entries', len(upd), 'not subset', [u['loc'] for u in upd if sm.get(u['loc']) != u['lastmod']][:5])
