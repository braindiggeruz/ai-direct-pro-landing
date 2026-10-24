import os, re, json, sys
import sys as _s; _s.stdout.reconfigure(encoding="utf-8")
dist = sys.argv[1]
tot = 0; pages_with = 0; noname = 0; withname = 0
selfdup = []; lastnotcanon = []; multi = []; parse_err = []; nobc = []; noindex = []
for root, dirs, files in os.walk(dist):
    for f in files:
        if f != 'index.html':
            continue
        p = os.path.join(root, f)
        html = open(p, encoding='utf-8', errors='replace').read()
        relp = os.path.relpath(root, dist).replace(os.sep, '/')
        rel = '/' if relp == '.' else '/' + relp + '/'
        if re.search(r'<meta[^>]+name="robots"[^>]+noindex', html, re.I):
            noindex.append(rel)
            continue
        tot += 1
        canon = re.search(r'<link[^>]+rel="canonical"[^>]+href="([^"]+)"', html)
        canon = canon.group(1) if canon else None
        found = []
        for m in re.finditer(r'<script[^>]+application/ld\+json[^>]*>([\s\S]*?)</script>', html):
            try:
                d = json.loads(m.group(1))
            except Exception:
                parse_err.append(rel)
                continue
            nodes = d.get('@graph', [d]) if isinstance(d, dict) else d
            for n in nodes:
                if isinstance(n, dict) and n.get('@type') == 'BreadcrumbList':
                    found.append(n)
        if not found:
            nobc.append(rel)
            continue
        pages_with += 1
        if len(found) > 1:
            multi.append(rel)
        for n in found:
            if 'name' in n:
                withname += 1
            else:
                noname += 1
            items = [i.get('item') for i in n.get('itemListElement', [])]
            if len(items) != len(set(items)):
                selfdup.append((rel, [(i.get('name'), i.get('item')) for i in n['itemListElement']]))
            if canon and items and items[-1] != canon:
                lastnotcanon.append((rel, items[-1], canon))
print(json.dumps(dict(indexable_pages=tot, pages_with_bc=pages_with, bc_noname=noname, bc_withname=withname,
                      multi=multi, selfdup=selfdup, n_lastnotcanon=len(lastnotcanon), lastnotcanon=lastnotcanon[:10],
                      parse_err=parse_err, n_nobc=len(nobc), nobc=nobc[:30], n_noindex=len(noindex), noindex=noindex[:30]),
                 ensure_ascii=False, indent=1))
