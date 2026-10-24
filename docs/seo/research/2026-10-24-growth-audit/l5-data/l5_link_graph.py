"""L5 internal-link graph of the production build (dist/), joined with GSC page data.

Offline, read-only. Usage:
  py -3 -I l5_link_graph.py <repo_root> <out_dir>

What it computes for every served HTML page in dist/:
  - canonical / robots -> indexable flag; sitemap membership
  - every <a href> to gptbot.uz (relative or absolute), normalised to a path,
    resolved through content/seo/redirects.json, classified by zone:
      header  = inside the site <header> (not inside <main>)
      footer  = inside a <footer> that is not inside <main>
      content = everything else (main, article, aside, related, breadcrumb, faq)
    plus a finer `section` label (data-testid / aria-label of the closest landmark)
  - inbound distinct source pages (all zones / content zone only), outbound distinct targets
  - click depth from "/" by BFS over all followed links (rel=nofollow skipped)
  - click depth by BFS over content-zone links only (what the body copy alone provides)
  - internal PageRank (d=0.85, 60 iterations, distinct edges, all zones)
Joins GSC page rows (l5-data/gsc_page_28d_all.tsv) by path.
"""
import sys, os, re, json, csv
from html.parser import HTMLParser
from urllib.parse import urlparse, unquote
import xml.etree.ElementTree as ET
from collections import defaultdict, deque

ROOT = sys.argv[1]
OUT = sys.argv[2]
DIST = os.path.join(ROOT, 'dist')
SITE = 'https://gptbot.uz'
ASSET_RE = re.compile(r'\.(css|js|mjs|png|jpe?g|webp|avif|gif|svg|ico|xml|txt|md|json|pdf|woff2?|ttf|mp4|webm|pptx|zip)$', re.I)
SKIP_DIRS = {'admin', 'assets', 'images', 'downloads', '.vite', 'lead-radar'}


def file_to_path(rel):
    rel = rel.replace('\\', '/')
    if rel == 'index.html':
        return '/'
    if rel.endswith('/index.html'):
        return '/' + rel[:-len('index.html')]
    return None  # 404.html etc.


class LinkParser(HTMLParser):
    LANDMARKS = {'header', 'footer', 'main', 'nav', 'aside', 'article', 'section'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []  # (tag, label)
        self.canonical = None
        self.robots = []
        self.title = None
        self._in_title = False
        self.anchors = []  # dict(href, rel, zone, section, text)
        self._a = None

    def _label(self, tag, a):
        lab = a.get('data-testid') or a.get('aria-label') or a.get('id') or ''
        return f'{tag}[{lab}]' if lab else tag

    def handle_starttag(self, tag, attrs):
        a = {k: (v or '') for k, v in attrs}
        if tag in self.LANDMARKS:
            self.stack.append((tag, self._label(tag, a)))
        if tag == 'link' and 'canonical' in a.get('rel', '').lower().split():
            self.canonical = a.get('href')
        elif tag == 'meta' and a.get('name', '').lower() in ('robots', 'googlebot'):
            self.robots.append(a.get('content', ''))
        elif tag == 'title' and self.title is None:
            self._in_title = True
            self.title = ''
        elif tag == 'a' and a.get('href'):
            tags = [t for t, _ in self.stack]
            in_main = 'main' in tags or 'article' in tags
            if 'header' in tags and not in_main:
                zone = 'header'
            elif 'footer' in tags and not in_main:
                zone = 'footer'
            else:
                zone = 'content'
            section = self.stack[-1][1] if self.stack else 'body'
            self._a = {'href': a['href'], 'rel': a.get('rel', ''), 'zone': zone, 'section': section, 'text': ''}
            self.anchors.append(self._a)

    def handle_endtag(self, tag):
        if tag == 'title':
            self._in_title = False
        if tag == 'a':
            if self._a is not None:
                self._a['text'] = re.sub(r'\s+', ' ', self._a['text']).strip()
            self._a = None
        if tag in self.LANDMARKS:
            for i in range(len(self.stack) - 1, -1, -1):
                if self.stack[i][0] == tag:
                    del self.stack[i:]
                    break

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._a is not None:
            self._a['text'] += data


def norm(href, base_path):
    href = href.strip()
    if not href or href.startswith(('#', 'mailto:', 'tel:', 'javascript:', 'data:')):
        return None
    if href.startswith('//'):
        href = 'https:' + href
    u = urlparse(href)
    if u.scheme and u.scheme not in ('http', 'https'):
        return None
    if u.netloc and u.netloc.lower() not in ('gptbot.uz', 'www.gptbot.uz'):
        return None
    path = unquote(u.path or '')
    if not path:
        return None  # pure query/fragment on same page
    if not path.startswith('/'):
        # relative path
        base = base_path if base_path.endswith('/') else base_path.rsplit('/', 1)[0] + '/'
        path = os.path.normpath(base + path).replace('\\', '/')
    if path.endswith('/index.html'):
        path = path[:-len('index.html')]
    if ASSET_RE.search(path):
        return None
    if not path.endswith('/'):
        path += '/'
    path = re.sub(r'/{2,}', '/', path)
    return path


def load_redirects():
    table = json.load(open(os.path.join(ROOT, 'content', 'seo', 'redirects.json'), encoding='utf-8'))
    exact = {}
    for r in table:
        f, t = r.get('from'), r.get('to')
        if f and t and '*' not in f:
            exact[f if f.endswith('/') else f + '/'] = t if t.endswith('/') else t + '/'
    return exact


def resolve(path, redirects):
    seen = 0
    hopped = False
    while path in redirects and seen < 5:
        path = redirects[path]
        seen += 1
        hopped = True
    return path, hopped


def main():
    os.makedirs(OUT, exist_ok=True)
    redirects = load_redirects()
    # sitemap
    ns = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    sm = set()
    for u in ET.parse(os.path.join(DIST, 'sitemap.xml')).getroot().findall('sm:url', ns):
        loc = u.find('sm:loc', ns).text.strip()
        sm.add(urlparse(loc).path)

    pages = {}
    for dirpath, dirnames, filenames in os.walk(DIST):
        rel_dir = os.path.relpath(dirpath, DIST).replace('\\', '/')
        top = rel_dir.split('/')[0]
        if top in SKIP_DIRS:
            dirnames[:] = []
            continue
        for fn in filenames:
            if fn != 'index.html':
                continue
            rel = fn if rel_dir == '.' else f'{rel_dir}/{fn}'
            path = file_to_path(rel)
            if not path:
                continue
            html = open(os.path.join(dirpath, fn), encoding='utf-8', errors='replace').read()
            p = LinkParser()
            p.feed(html)
            canon_path = urlparse(p.canonical).path if p.canonical else None
            robots = ' '.join(p.robots).lower()
            indexable = (canon_path == path) and ('noindex' not in robots) and ('none' not in robots.split(','))
            pages[path] = {
                'path': path, 'title': (p.title or '').strip(), 'canonical': p.canonical, 'robots': robots,
                'indexable': indexable, 'in_sitemap': path in sm, 'anchors': p.anchors,
            }

    served = set(pages)
    edges = defaultdict(lambda: defaultdict(list))  # src -> dst -> [ (zone, section, text) ]
    via_redirect = []
    broken = []
    for src, pg in pages.items():
        for a in pg['anchors']:
            if 'nofollow' in a['rel'].lower():
                continue
            t = norm(a['href'], src)
            if t is None:
                continue
            t2, hopped = resolve(t, redirects)
            if hopped:
                via_redirect.append((src, t, t2))
            if t2 not in served:
                broken.append((src, a['href'], t2))
                continue
            if t2 == src:
                continue
            edges[src][t2].append((a['zone'], a['section'], a['text']))

    inbound_all = defaultdict(set)
    inbound_content = defaultdict(set)
    inbound_idx_content = defaultdict(set)
    anchors_in = defaultdict(list)
    for s, dsts in edges.items():
        for d, occ in dsts.items():
            inbound_all[d].add(s)
            if any(z == 'content' for z, _, _ in occ):
                inbound_content[d].add(s)
                if pages[s]['indexable']:
                    inbound_idx_content[d].add(s)
            for z, sec, txt in occ:
                anchors_in[d].append({'src': s, 'zone': z, 'section': sec, 'text': txt})

    def bfs(content_only):
        depth = {'/': 0}
        q = deque(['/'])
        while q:
            s = q.popleft()
            for d, occ in edges.get(s, {}).items():
                if content_only and not any(z == 'content' for z, _, _ in occ):
                    continue
                if d not in depth:
                    depth[d] = depth[s] + 1
                    q.append(d)
        return depth

    depth_all = bfs(False)
    depth_content = bfs(True)

    # PageRank over distinct edges among served pages
    nodes = list(served)
    idx = {n: i for i, n in enumerate(nodes)}
    outs = {n: list(edges.get(n, {}).keys()) for n in nodes}
    N = len(nodes)
    pr = {n: 1.0 / N for n in nodes}
    d = 0.85
    for _ in range(60):
        new = {n: (1 - d) / N for n in nodes}
        dangling = sum(pr[n] for n in nodes if not outs[n])
        for n in nodes:
            if outs[n]:
                share = d * pr[n] / len(outs[n])
                for m in outs[n]:
                    new[m] += share
        for n in nodes:
            new[n] += d * dangling / N
        pr = new
    pr_rank = {n: r + 1 for r, (n, _) in enumerate(sorted(pr.items(), key=lambda x: -x[1]))}

    # GSC
    gsc = {}
    with open(os.path.join(OUT, 'gsc_page_28d_all.tsv'), encoding='utf-8') as fh:
        rows = [l.rstrip('\n').split('\t') for l in fh if not l.startswith('#')]
    for r in rows[1:]:
        if len(r) < 4:
            continue
        u = urlparse(r[0])
        if u.netloc != 'gptbot.uz' or u.scheme != 'https':
            continue
        p = u.path if u.path.endswith('/') else u.path + '/'
        g = gsc.setdefault(p, {'clicks': 0, 'impr': 0, 'pos': None})
        g['clicks'] += int(r[1]); g['impr'] += int(r[2]); g['pos'] = float(r[3])

    out_rows = []
    for path, pg in sorted(pages.items()):
        g = gsc.get(path, {'clicks': 0, 'impr': 0, 'pos': None})
        out_rows.append({
            'path': path, 'indexable': pg['indexable'], 'in_sitemap': pg['in_sitemap'],
            'in_all': len(inbound_all[path]), 'in_content': len(inbound_content[path]),
            'in_idx_content': len(inbound_idx_content[path]),
            'out': len(edges.get(path, {})),
            'out_content': sum(1 for dd, occ in edges.get(path, {}).items() if any(z == 'content' for z, _, _ in occ)),
            'depth': depth_all.get(path), 'depth_content': depth_content.get(path),
            'pr': pr[path], 'pr_rank': pr_rank[path],
            'clicks': g['clicks'], 'impr': g['impr'], 'pos': g['pos'], 'title': pg['title'],
        })

    gsc_missing = sorted(p for p in gsc if p not in served)

    with open(os.path.join(OUT, 'l5_pages.tsv'), 'w', encoding='utf-8', newline='') as fh:
        w = csv.writer(fh, delimiter='\t')
        cols = ['path', 'indexable', 'in_sitemap', 'in_all', 'in_content', 'in_idx_content', 'out', 'out_content',
                'depth', 'depth_content', 'pr', 'pr_rank', 'clicks', 'impr', 'pos', 'title']
        w.writerow(cols)
        for r in out_rows:
            w.writerow([r[c] if c != 'pr' else f"{r['pr']:.5f}" for c in cols])

    json.dump({
        'served_pages': len(served),
        'indexable_pages': sum(1 for p in pages.values() if p['indexable']),
        'sitemap_urls': len(sm),
        'sitemap_not_served': sorted(sm - served),
        'indexable_not_in_sitemap': sorted(p for p, v in pages.items() if v['indexable'] and not v['in_sitemap']),
        'edges_distinct': sum(len(v) for v in edges.values()),
        'links_via_redirect': via_redirect[:200], 'links_via_redirect_count': len(via_redirect),
        'broken': broken[:200], 'broken_count': len(broken),
        'gsc_paths_not_in_dist': gsc_missing,
        'unreachable_from_home_all': sorted(p for p, v in pages.items() if v['indexable'] and p not in depth_all),
        'unreachable_from_home_content': sorted(p for p, v in pages.items() if v['indexable'] and p not in depth_content),
    }, open(os.path.join(OUT, 'l5_summary.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    json.dump({d: a for d, a in anchors_in.items()}, open(os.path.join(OUT, 'l5_anchors_in.json'), 'w', encoding='utf-8'),
              ensure_ascii=False)
    json.dump({s: {d: occ for d, occ in dd.items()} for s, dd in edges.items()},
              open(os.path.join(OUT, 'l5_edges.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print('served', len(served), 'indexable', sum(1 for p in pages.values() if p['indexable']), 'edges', sum(len(v) for v in edges.values()))


if __name__ == '__main__':
    main()
