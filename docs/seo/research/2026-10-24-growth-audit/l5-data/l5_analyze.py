"""L5 step 2: classify inbound links by type, join GSC page + page/query data, rank targets.
Usage: py -3 -I l5_analyze.py <growth_audit_dir> <repo_root>
Reads l5-data/l5_edges.json, l5-data/l5_pages.tsv, raw/gsc_page_query_28d_p0.json, raw/gsc_page_query_28d_p1.json,
<repo>/scripts/seo-protection.ts (PROTECTED_PATHS), <repo>/content/seo/intent-manifest.json.
Writes l5-data/l5_inbound_by_type.tsv, l5-data/l5_targets.tsv, l5-data/l5_top_queries.json, l5-data/l5_donors.tsv
"""
import sys, os, re, json, csv
from collections import defaultdict
from urllib.parse import urlparse

GA = sys.argv[1]
REPO = sys.argv[2]
D = os.path.join(GA, 'l5-data')

LIST_PAGES = {'/', '/uz/', '/ru/blog/', '/uz/blog/'}
RELATED = re.compile(r'^section\[(related-pages|article-related|related-articles|Блог|Решения|GPTBot\.uz blogi \(UZ\)|Biznes uchun yechimlar \(UZ\)|blog-recently-updated)\]$|^nav\[(Foydali sahifalar|Полезные страницы)\]$')
NAVLIKE = re.compile(r'^nav\[(site-nav|article-breadcrumb|Breadcrumb|language-switch)\]$|^section\[blog-grid\]$')


def kind(src, zone, section):
    if zone in ('header', 'footer'):
        return 'nav'
    if src in LIST_PAGES:
        return 'list'
    if NAVLIKE.match(section):
        return 'nav'
    if RELATED.match(section):
        return 'related'
    return 'body'


edges = json.load(open(os.path.join(D, 'l5_edges.json'), encoding='utf-8'))
pages = {r['path']: r for r in csv.DictReader(open(os.path.join(D, 'l5_pages.tsv'), encoding='utf-8'), delimiter='\t')}

prot_src = open(os.path.join(REPO, 'scripts', 'seo-protection.ts'), encoding='utf-8').read()
m = re.search(r'PROTECTED_PATHS\s*=\s*\[(.*?)\]\s*as const', prot_src, re.S)
PROTECTED = set(re.findall(r"'([^']+)'", m.group(1)))

man = json.load(open(os.path.join(REPO, 'content', 'seo', 'intent-manifest.json'), encoding='utf-8'))
must_not = defaultdict(list)
owner_of = {}
for p in man['pairs']:
    for side in ('commercial', 'informational'):
        if side in p and isinstance(p[side], dict):
            u = p[side]['url']
            must_not[u] += p[side].get('mustNotTarget', [])
            owner_of.setdefault(u, []).append(p['id'] + ':' + side)
for c in man['commercialClusters'] + man['clusters']:
    owner_of.setdefault(c['hub'], []).append(c['id'] + ':hub')
    for s in c['spokes']:
        owner_of.setdefault(s['url'], []).append(c['id'] + ':spoke')

inb = defaultdict(lambda: defaultdict(set))
for s, dd in edges.items():
    for d, occ in dd.items():
        kinds = {kind(s, z, sec) for z, sec, _ in occ}
        for k in kinds:
            inb[d][k].add(s)

# GSC query data per page (all countries)
q = defaultdict(list)
for fn in ('gsc_page_query_28d_p0.json', 'gsc_page_query_28d_p1.json'):
    for r in json.load(open(os.path.join(GA, 'raw', fn), encoding='utf-8'))['rows']:
        page, query = r['keys']
        path = urlparse(page).path
        q[path].append({'q': query, 'clicks': r['clicks'], 'impr': r['impressions'], 'pos': r['position']})
for k in q:
    q[k].sort(key=lambda x: -x['impr'])
json.dump({k: v[:12] for k, v in q.items()}, open(os.path.join(D, 'l5_top_queries.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)

donors = {p for p, r in pages.items() if int(r['clicks']) >= 10}
with open(os.path.join(D, 'l5_donors.tsv'), 'w', encoding='utf-8', newline='') as fh:
    w = csv.writer(fh, delimiter='\t')
    w.writerow(['path', 'clicks', 'impr', 'protected', 'out', 'out_body_targets'])
    for p in sorted(donors, key=lambda x: -int(pages[x]['clicks'])):
        body_t = sorted(d for d, occ in edges.get(p, {}).items() if any(kind(p, z, sec) == 'body' for z, sec, _ in occ))
        w.writerow([p, pages[p]['clicks'], pages[p]['impr'], p in PROTECTED, pages[p]['out'], ' '.join(body_t)])

with open(os.path.join(D, 'l5_inbound_by_type.tsv'), 'w', encoding='utf-8', newline='') as fh:
    w = csv.writer(fh, delimiter='\t')
    cols = ['path', 'impr', 'clicks', 'pos', 'in_all', 'in_body', 'in_related', 'in_list', 'in_nav', 'in_from_donors',
            'depth', 'pr_rank', 'protected', 'owner', 'body_sources']
    w.writerow(cols)
    for p, r in sorted(pages.items(), key=lambda x: -int(x[1]['impr'])):
        allsrc = set().union(*inb[p].values()) if inb[p] else set()
        w.writerow([p, r['impr'], r['clicks'], r['pos'], r['in_all'], len(inb[p]['body']), len(inb[p]['related']),
                    len(inb[p]['list']), len(inb[p]['nav']), len(allsrc & donors), r['depth'], r['pr_rank'],
                    p in PROTECTED, ';'.join(owner_of.get(p, [])), ' '.join(sorted(inb[p]['body']))])
print('protected', sorted(PROTECTED))
print('donors', sorted(donors))
