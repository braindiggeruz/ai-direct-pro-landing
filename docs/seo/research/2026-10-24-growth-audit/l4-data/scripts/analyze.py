import sys, json, os, collections, re
from urllib.parse import urlparse

D = json.load(open(sys.argv[1], encoding='utf-8'))
DIST = sys.argv[2]
OUT = sys.argv[3]
R = D['results']
SITE = 'https://gptbot.uz'
rep = {}

by_url = {r['url']: r for r in R}
paths = {urlparse(r['url']).path for r in R}

rep['missing_files'] = [r['url'] for r in R if not r['exists']]
E = [r for r in R if r['exists']]

# titles
tl = [r['title_len'] for r in E]
rep['title_missing'] = [r['url'] for r in E if not r['title']]
rep['title_short_lt30'] = [(r['url'], r['title_len'], r['title']) for r in E if 0 < r['title_len'] < 30]
rep['title_long_gt65'] = [(r['url'], r['title_len'], r['title']) for r in E if r['title_len'] > 65]
rep['title_gt60_count'] = sum(1 for x in tl if x > 60)
td = collections.defaultdict(list)
for r in E:
    td[(r['title'] or '').strip().lower()].append(r['url'])
rep['title_dupes'] = {k: v for k, v in td.items() if len(v) > 1}
# desc
rep['desc_missing'] = [r['url'] for r in E if not r['desc']]
rep['desc_multi'] = [r['url'] for r in E if r['desc_count'] > 1]
rep['desc_short_lt70'] = [(r['url'], r['desc_len']) for r in E if 0 < r['desc_len'] < 70]
rep['desc_long_gt160'] = [(r['url'], r['desc_len']) for r in E if r['desc_len'] > 160]
dd = collections.defaultdict(list)
for r in E:
    dd[(r['desc'] or '').strip().lower()].append(r['url'])
rep['desc_dupes'] = {k: v for k, v in dd.items() if len(v) > 1}
rep['title_len_stats'] = {'min': min(tl), 'max': max(tl), 'median': sorted(tl)[len(tl)//2]}
dl = [r['desc_len'] for r in E]
rep['desc_len_stats'] = {'min': min(dl), 'max': max(dl), 'median': sorted(dl)[len(dl)//2]}
# canonical
rep['canonical_not_one'] = [(r['url'], r['canonical']) for r in E if len(r['canonical']) != 1]
rep['canonical_not_self'] = [(r['url'], r['canonical']) for r in E if len(r['canonical']) == 1 and r['canonical'][0] != r['url']]
rep['og_url_mismatch'] = [(r['url'], r['og_url']) for r in E if r['og_url'] and r['og_url'] != r['url']]
rep['og_image_missing'] = [r['url'] for r in E if not r['og_image']]
# robots
rep['robots_noindex_in_sitemap'] = [(r['url'], r['robots']) for r in E if any('noindex' in (x or '') for x in r['robots'])]
rep['robots_values'] = collections.Counter(tuple(r['robots']) for r in E).most_common()
# h1
rep['h1_not_one'] = [(r['url'], len(r['h1']), r['h1'][:3]) for r in E if len(r['h1']) != 1]
rep['h1_empty'] = [r['url'] for r in E if r['h1'] and not r['h1'][0]]
# lang
def loc_of(u):
    p = urlparse(u).path
    return 'uz' if p.startswith('/uz/') or p == '/uz/' else 'ru'
rep['lang_mismatch'] = [(r['url'], r['lang']) for r in E if (r['lang'] or '')[:2] != loc_of(r['url'])]

# hreflang
hl_issues = []
sm_vs_html = []
for r in E:
    h = r['hreflang']
    s = r['sitemap']['alts']
    if h != s:
        sm_vs_html.append((r['url'], h, s))
    if not h:
        hl_issues.append((r['url'], 'no hreflang in HTML'))
        continue
    me = loc_of(r['url'])
    if h.get(me) != r['url']:
        hl_issues.append((r['url'], 'self hreflang %s -> %s' % (me, h.get(me))))
    if 'x-default' not in h:
        hl_issues.append((r['url'], 'no x-default'))
    for lang, tgt in h.items():
        if lang == 'x-default' or tgt == r['url']:
            continue
        t = by_url.get(tgt)
        if not t:
            hl_issues.append((r['url'], 'alt %s -> %s not in sitemap' % (lang, tgt)))
            continue
        back = t['hreflang'].get(me)
        if back != r['url']:
            hl_issues.append((r['url'], 'non-reciprocal: %s=%s returns %s=%s' % (lang, tgt, me, back)))
rep['hreflang_issues'] = hl_issues
rep['hreflang_sitemap_vs_html_diff'] = sm_vs_html
rep['hreflang_single_lang'] = [r['url'] for r in E if r['hreflang'] and len([k for k in r['hreflang'] if k != 'x-default']) < 2]

# JSON-LD
ld_invalid = []; ld_issues = []; bc_rows = []; types_counter = collections.Counter(); bc_last_mismatch = []
faq_multi = []; review_present = []; app_like = []; no_ld = []; bc_noname = 0; bc_total = 0
for r in E:
    if not r['ld']:
        no_ld.append(r['url'])
    fq = 0
    for b in r['ld']:
        if not b.get('valid'):
            ld_invalid.append((r['url'], b.get('error')))
            continue
        for t in set(b.get('types', [])):
            types_counter[t] += 1
        for i in b.get('issues', []):
            ld_issues.append((r['url'], i))
        for bc in b.get('breadcrumbs', []):
            bc_total += 1
            if not bc['has_name']:
                bc_noname += 1
            last = bc['items'][-1]['item'] if bc['items'] else None
            if last != r['url']:
                bc_last_mismatch.append((r['url'], last))
        fq += len(b.get('faq_counts', []))
        if b.get('app_like'):
            app_like.append((r['url'], b['app_like']))
    if fq > 1:
        faq_multi.append((r['url'], fq))
rep['ld_invalid'] = ld_invalid
rep['ld_issues'] = collections.Counter(i for _, i in ld_issues).most_common()
rep['ld_issue_urls'] = ld_issues[:80]
rep['ld_types_pages'] = types_counter.most_common()
rep['ld_none'] = no_ld
rep['breadcrumb_total'] = bc_total
rep['breadcrumb_without_list_name'] = bc_noname
rep['breadcrumb_last_not_self'] = bc_last_mismatch
rep['faq_multiple_blocks'] = faq_multi
rep['app_like'] = app_like

# lastmod vs dateModified
lm_rows = []
for r in E:
    lm = r['sitemap']['lastmod']
    dms = []
    for b in r['ld']:
        for a in b.get('article', []) or []:
            if a.get('dateModified'): dms.append(a['dateModified'][:10])
        for w in b.get('webpage_dateModified', []) or []:
            dms.append(w[:10])
    dm = max(dms) if dms else None
    lm_rows.append((r['url'], lm, dm))
rep['lastmod_missing'] = [x[0] for x in lm_rows if not x[1]]
rep['lastmod_vs_ld_mismatch'] = [x for x in lm_rows if x[1] and x[2] and x[1] != x[2]]
rep['lastmod_no_ld_date'] = [x[0] for x in lm_rows if not x[2]]
rep['lastmod_distribution'] = collections.Counter(x[1] for x in lm_rows).most_common(15)

# images
rep['img_no_alt'] = [(r['url'], r['img_no_alt']) for r in E if r['img_no_alt']]
rep['img_no_size'] = [(r['url'], r['img_no_size']) for r in E if r['img_no_size']]
rep['img_empty_alt_pages'] = sum(1 for r in E if r['img_empty_alt'])
rep['img_total'] = sum(r['img_total'] for r in E)
rep['img_noalt_total'] = sum(len(r['img_no_alt']) for r in E)
rep['img_nosize_total'] = sum(len(r['img_no_size']) for r in E)

# weight
w = sorted(((r['bytes'], r['js_bytes_local'], r['css_bytes_local'], r['inline_script_bytes'], r['inline_style_bytes'], r['url']) for r in E), reverse=True)
rep['heaviest_html'] = w[:15]
hb = [x[0] for x in w]
rep['html_bytes_stats'] = {'min': min(hb), 'max': max(hb), 'median': sorted(hb)[len(hb)//2], 'over_100k': sum(1 for x in hb if x > 100000)}
rep['missing_assets'] = [(r['url'], r['missing_assets']) for r in E if r['missing_assets']]
rep['ext_scripts'] = collections.Counter(s for r in E for s in r['ext_scripts']).most_common()
rep['thin_pages_lt300w'] = sorted([(r['words'], r['url']) for r in E if r['words'] < 300])

# internal links
def load_redirects():
    rules = []
    for line in open(os.path.join(DIST, '_redirects'), encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#'): continue
        p = line.split()
        rules.append((p[0], p[1], p[2] if len(p) > 2 else '302'))
    return rules
RULES = load_redirects()
def redir(path):
    for s, d, c in RULES:
        if s.startswith('http'): continue
        if s.endswith('*'):
            if path.startswith(s[:-1]): return (s, d, c)
        elif path == s: return (s, d, c)
    return None
def exists(path):
    if path.endswith('/'):
        return os.path.isfile(os.path.join(DIST, path.lstrip('/'), 'index.html'))
    return os.path.isfile(os.path.join(DIST, path.lstrip('/')))
FUNCTION_ROUTES = ['/api/', '/ru/blog', '/uz/blog', '/admin', '/robots.txt']
broken = collections.defaultdict(set); to_redirect = collections.defaultdict(set); no_slash = collections.defaultdict(set)
www_http = collections.defaultdict(set); to_noindex = collections.defaultdict(set); not_in_sitemap = collections.defaultdict(set)
inlinks = collections.Counter()
noindex_paths = set()
for x in D.get('extra_html', []):
    if x['robots'] and any('noindex' in (y or '') for y in x['robots']):
        noindex_paths.add(x['path'])
for r in E:
    seen = set()
    for l in r['internal_links']:
        path = l['path'] or '/'
        if l['netloc'] == 'www.gptbot.uz' or l['abs'].startswith('http://'):
            www_http[l['abs']].add(r['url'])
        rd = redir(path)
        if rd and rd[2] in ('301', '302', '308'):
            to_redirect[(path, rd[1])].add(r['url'])
            continue
        if rd and rd[2] == '404':
            broken[path].add(r['url']); continue
        if exists(path):
            if path in paths:
                if path not in seen:
                    inlinks[path] += 1; seen.add(path)
            else:
                if path.endswith('/') or path.endswith('.html'):
                    not_in_sitemap[path].add(r['url'])
            continue
        if not path.endswith('/') and exists(path + '/'):
            no_slash[path].add(r['url']); continue
        if any(path.startswith(fr) for fr in FUNCTION_ROUTES):
            continue
        broken[path].add(r['url'])
rep['internal_broken'] = {k: sorted(v)[:5] + ['... total %d' % len(v)] for k, v in broken.items()}
rep['internal_to_redirect'] = {'%s -> %s' % k: sorted(v)[:5] + ['... total %d' % len(v)] for k, v in to_redirect.items()}
rep['internal_no_trailing_slash'] = {k: sorted(v)[:5] + ['... total %d' % len(v)] for k, v in no_slash.items()}
rep['internal_www_http'] = {k: sorted(v)[:3] for k, v in www_http.items()}
rep['internal_to_non_sitemap_html'] = {k: sorted(v)[:3] + ['... total %d' % len(v)] for k, v in not_in_sitemap.items()}
orph = sorted([(inlinks.get(p, 0), p) for p in paths])
rep['inlinks_lowest'] = orph[:40]
rep['orphans_zero_inlinks'] = [p for c, p in orph if c == 0]
rep['inlinks_dist'] = {'0': sum(1 for c, _ in orph if c == 0), '1-2': sum(1 for c, _ in orph if 1 <= c <= 2), '3-9': sum(1 for c, _ in orph if 3 <= c <= 9), '10+': sum(1 for c, _ in orph if c >= 10)}
rep['extra_html'] = D.get('extra_html')
rep['updates_count'] = D.get('updates_count')
rep['itemprop_pages'] = [(r['url'], r['itemprops']) for r in E if r['itemprops']]
json.dump(rep, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k, v in rep.items():
    if isinstance(v, (list, dict)):
        print(k, len(v))
    else:
        print(k, v)
