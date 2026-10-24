"""Offline crawl of dist/ for every URL in sitemap.xml (no network).
Usage: py -3 -I crawl_dist.py <dist_dir> <out_json>
"""
import sys, os, re, json, html
from html.parser import HTMLParser
from urllib.parse import urlparse, urljoin, unquote
import xml.etree.ElementTree as ET

DIST = sys.argv[1]
OUT = sys.argv[2]
SITE = 'https://gptbot.uz'
NS = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9', 'xhtml': 'http://www.w3.org/1999/xhtml',
      'image': 'http://www.google.com/schemas/sitemap-image/1.1'}


def parse_sitemap(path):
    tree = ET.parse(path)
    out = []
    for u in tree.getroot().findall('sm:url', NS):
        loc = u.find('sm:loc', NS).text.strip()
        lm = u.find('sm:lastmod', NS)
        alts = {a.get('hreflang'): a.get('href') for a in u.findall('xhtml:link', NS)}
        imgs = [i.find('image:loc', NS).text for i in u.findall('image:image', NS)]
        out.append({'loc': loc, 'lastmod': lm.text.strip() if lm is not None else None, 'alts': alts, 'images': imgs})
    return out


class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = None; self._in_title = False; self._tbuf = ''
        self.metas = []; self.links = []; self.h1 = []; self._in_h1 = 0; self._h1buf = ''
        self.imgs = []; self.anchors = []; self.ld = []; self._in_ld = False; self._ldbuf = ''
        self.scripts = []; self.styles = []; self.lang = None; self.h2 = 0
        self.inline_script_bytes = 0; self._in_script = False; self._sbuf = ''
        self.inline_style_bytes = 0; self._in_style = False
        self.itemprops = 0
        self.body_text = []; self._skip = 0
        self.preloads = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'itemprop' in a or 'itemscope' in a:
            self.itemprops += 1
        if tag == 'html':
            self.lang = a.get('lang')
        elif tag == 'title' and self.title is None:
            self._in_title = True; self._tbuf = ''
        elif tag == 'meta':
            self.metas.append(a)
        elif tag == 'link':
            self.links.append(a)
            if (a.get('rel') or '').lower() == 'stylesheet' and a.get('href'):
                self.styles.append(a.get('href'))
            if (a.get('rel') or '').lower() in ('preload', 'modulepreload') and a.get('href'):
                self.preloads.append(a.get('href'))
        elif tag == 'h1':
            self._in_h1 += 1; self._h1buf = ''
        elif tag == 'h2':
            self.h2 += 1
        elif tag == 'img':
            self.imgs.append(a)
        elif tag == 'a':
            if a.get('href') is not None:
                self.anchors.append(a)
        elif tag == 'script':
            t = (a.get('type') or '').lower()
            if t == 'application/ld+json':
                self._in_ld = True; self._ldbuf = ''
            else:
                if a.get('src'):
                    self.scripts.append(a.get('src'))
                else:
                    self._in_script = True; self._sbuf = ''
            self._skip += 1
        elif tag == 'style':
            self._in_style = True; self._skip += 1

    def handle_endtag(self, tag):
        if tag == 'title' and self._in_title:
            self._in_title = False; self.title = self._tbuf.strip()
        elif tag == 'h1' and self._in_h1:
            self._in_h1 -= 1; self.h1.append(re.sub(r'\s+', ' ', self._h1buf).strip())
        elif tag == 'script':
            if self._in_ld:
                self._in_ld = False; self.ld.append(self._ldbuf)
            if self._in_script:
                self._in_script = False; self.inline_script_bytes += len(self._sbuf.encode('utf-8'))
            self._skip = max(0, self._skip - 1)
        elif tag == 'style':
            self._in_style = False; self._skip = max(0, self._skip - 1)

    def handle_data(self, data):
        if self._in_title:
            self._tbuf += data
        if self._in_h1:
            self._h1buf += data
        if self._in_ld:
            self._ldbuf += data
        elif self._in_script:
            self._sbuf += data
        elif self._in_style:
            self.inline_style_bytes += len(data.encode('utf-8'))
        elif not self._skip:
            self.body_text.append(data)


def url_to_file(url):
    p = urlparse(url).path
    p = unquote(p)
    if p.endswith('/'):
        f = os.path.join(DIST, p.lstrip('/'), 'index.html')
    else:
        f = os.path.join(DIST, p.lstrip('/'))
        if not os.path.isfile(f) and os.path.isfile(f + '.html'):
            f = f + '.html'
        elif not os.path.isfile(f) and os.path.isfile(os.path.join(f, 'index.html')):
            f = os.path.join(f, 'index.html')
    return f


def load_redirects():
    rules = []
    with open(os.path.join(DIST, '_redirects'), encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split()
            if len(parts) >= 2:
                rules.append((parts[0], parts[1], parts[2] if len(parts) > 2 else '302'))
    return rules


REDIRECTS = load_redirects()


def match_redirect(path):
    for src, dst, code in REDIRECTS:
        if src.startswith('http'):
            continue
        if src.endswith('*'):
            if path.startswith(src[:-1]):
                return (src, dst, code)
        elif path == src:
            return (src, dst, code)
    return None


def asset_size(href):
    if not href or href.startswith('http') and not href.startswith(SITE):
        return None
    p = urlparse(href).path
    f = os.path.join(DIST, unquote(p).lstrip('/'))
    return os.path.getsize(f) if os.path.isfile(f) else -1


def walk_types(node, acc):
    if isinstance(node, dict):
        t = node.get('@type')
        if t:
            acc.append(node)
        for v in node.values():
            walk_types(v, acc)
    elif isinstance(node, list):
        for v in node:
            walk_types(v, acc)


def tlist(n):
    t = n.get('@type')
    return t if isinstance(t, list) else [t]


def analyze(url, fpath):
    r = {'url': url, 'file': os.path.relpath(fpath, DIST), 'exists': os.path.isfile(fpath)}
    if not r['exists']:
        return r
    raw = open(fpath, 'rb').read()
    r['bytes'] = len(raw)
    txt = raw.decode('utf-8', errors='replace')
    p = P(); p.feed(txt)
    r['lang'] = p.lang
    r['title'] = html.unescape(p.title) if p.title else None
    r['title_len'] = len(r['title']) if r['title'] else 0
    md = [m for m in p.metas if (m.get('name') or '').lower() == 'description']
    r['desc_count'] = len(md)
    r['desc'] = md[0].get('content') if md else None
    r['desc_len'] = len(r['desc']) if r['desc'] else 0
    rob = [m.get('content') for m in p.metas if (m.get('name') or '').lower() in ('robots', 'googlebot')]
    r['robots'] = rob
    can = [l.get('href') for l in p.links if (l.get('rel') or '').lower() == 'canonical']
    r['canonical'] = can
    r['hreflang'] = {l.get('hreflang'): l.get('href') for l in p.links if (l.get('rel') or '').lower() == 'alternate' and l.get('hreflang')}
    r['h1'] = p.h1
    r['h2_count'] = p.h2
    og = {m.get('property'): m.get('content') for m in p.metas if m.get('property')}
    r['og_title'] = og.get('og:title'); r['og_image'] = og.get('og:image'); r['og_url'] = og.get('og:url')
    r['itemprops'] = p.itemprops
    # images
    imgs = []
    for im in p.imgs:
        imgs.append({'src': im.get('src'), 'alt': im.get('alt'), 'w': im.get('width'), 'h': im.get('height'),
                     'loading': im.get('loading'), 'fetchpriority': im.get('fetchpriority')})
    r['img_total'] = len(imgs)
    r['img_no_alt'] = [i['src'] for i in imgs if i['alt'] is None]
    r['img_empty_alt'] = [i['src'] for i in imgs if i['alt'] == '']
    r['img_no_size'] = [i['src'] for i in imgs if not (i['w'] and i['h'])]
    r['img_lazy_first'] = (imgs[0]['loading'] if imgs else None)
    # assets
    js = [(s, asset_size(s)) for s in p.scripts]
    css = [(s, asset_size(s)) for s in p.styles]
    r['js'] = js; r['css'] = css
    r['js_bytes_local'] = sum(s for _, s in js if s and s > 0)
    r['css_bytes_local'] = sum(s for _, s in css if s and s > 0)
    r['inline_script_bytes'] = p.inline_script_bytes
    r['inline_style_bytes'] = p.inline_style_bytes
    r['ext_scripts'] = [s for s, _ in js if s and s.startswith('http') and not s.startswith(SITE)]
    r['missing_assets'] = [s for s, sz in js + css if sz == -1]
    # text length
    body = re.sub(r'\s+', ' ', ' '.join(p.body_text)).strip()
    r['text_chars'] = len(body)
    r['words'] = len(body.split())
    # JSON-LD
    ld_res = []
    for block in p.ld:
        entry = {'raw_len': len(block)}
        try:
            data = json.loads(block)
            entry['valid'] = True
            nodes = []
            walk_types(data, nodes)
            entry['types'] = [t for n in nodes for t in tlist(n)]
            issues = []
            for n in nodes:
                ts = tlist(n)
                if 'BreadcrumbList' in ts:
                    items = n.get('itemListElement') or []
                    entry.setdefault('breadcrumbs', []).append({
                        'has_name': 'name' in n,
                        'items': [{'pos': i.get('position'), 'name': i.get('name'),
                                   'item': i.get('item') if not isinstance(i.get('item'), dict) else i.get('item').get('@id')} for i in items]})
                    for i in items:
                        if not i.get('name') and not (isinstance(i.get('item'), dict) and i['item'].get('name')):
                            issues.append('breadcrumb item without name')
                        it = i.get('item')
                        if isinstance(it, str) and not it.startswith('https://'):
                            issues.append('breadcrumb item not absolute: %s' % it)
                if 'FAQPage' in ts:
                    q = n.get('mainEntity') or []
                    entry.setdefault('faq_counts', []).append(len(q))
                if any(t in ts for t in ('Article', 'BlogPosting', 'NewsArticle', 'TechArticle')):
                    hl = n.get('headline') or ''
                    if len(hl) > 110:
                        issues.append('headline >110 chars (%d)' % len(hl))
                    for k in ('datePublished', 'dateModified', 'image', 'author'):
                        if k not in n:
                            issues.append('Article missing %s' % k)
                    entry.setdefault('article', []).append({'headline_len': len(hl), 'dateModified': n.get('dateModified'), 'datePublished': n.get('datePublished')})
                if 'WebPage' in ts or 'CollectionPage' in ts or 'AboutPage' in ts:
                    if n.get('dateModified'):
                        entry.setdefault('webpage_dateModified', []).append(n.get('dateModified'))
                if any(t in ts for t in ('AggregateRating', 'Review')):
                    issues.append('Review/AggregateRating present')
                if 'Product' in ts or 'SoftwareApplication' in ts or 'WebApplication' in ts:
                    entry.setdefault('app_like', []).append({'type': ts, 'offers': bool(n.get('offers')), 'aggregateRating': bool(n.get('aggregateRating'))})
                if 'Service' in ts and n.get('offers'):
                    entry.setdefault('service_offers', []).append(n.get('offers'))
                if 'HowTo' in ts:
                    entry.setdefault('howto', 0)
                    entry['howto'] += 1
            entry['issues'] = issues
        except Exception as e:
            entry['valid'] = False
            entry['error'] = str(e)[:200]
        ld_res.append(entry)
    r['ld'] = ld_res
    # internal links
    links = []
    for a in p.anchors:
        href = a.get('href').strip()
        if href.startswith(('mailto:', 'tel:', 'javascript:', '#', 'sms:', 'viber:', 'whatsapp:')):
            continue
        absu = urljoin(url, href)
        pu = urlparse(absu)
        if pu.netloc not in ('gptbot.uz', 'www.gptbot.uz'):
            continue
        links.append({'href': href, 'abs': absu, 'path': pu.path, 'netloc': pu.netloc, 'rel': a.get('rel'), 'query': pu.query})
    r['internal_links'] = links
    r['external_link_count'] = sum(1 for a in p.anchors if urlparse(urljoin(url, a.get('href'))).netloc not in ('gptbot.uz', 'www.gptbot.uz', ''))
    return r


def main():
    sm = parse_sitemap(os.path.join(DIST, 'sitemap.xml'))
    smu = parse_sitemap(os.path.join(DIST, 'sitemap-updates.xml')) if os.path.isfile(os.path.join(DIST, 'sitemap-updates.xml')) else []
    results = []
    for e in sm:
        f = url_to_file(e['loc'])
        r = analyze(e['loc'], f)
        r['sitemap'] = e
        results.append(r)
    # also every index.html in dist not in sitemap
    sm_paths = {urlparse(e['loc']).path for e in sm}
    extra = []
    for root, dirs, files in os.walk(DIST):
        rel = os.path.relpath(root, DIST).replace('\\', '/')
        if rel.startswith(('admin', 'assets', '.vite', 'downloads', 'images', 'lead-radar')):
            continue
        for fn in files:
            if fn.endswith('.html'):
                path = '/' + ('' if rel == '.' else rel + '/') + ('' if fn == 'index.html' else fn)
                if path not in sm_paths:
                    r = analyze(SITE + path, os.path.join(root, fn))
                    extra.append({'path': path, 'robots': r.get('robots'), 'canonical': r.get('canonical'), 'title': r.get('title'), 'bytes': r.get('bytes')})
    json.dump({'sitemap_count': len(sm), 'updates_count': len(smu), 'updates': smu, 'results': results, 'extra_html': extra}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('done', len(results), 'extra', len(extra))


main()
