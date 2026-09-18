# -*- coding: utf-8 -*-
# Live verification of the fire-your-seo-agency release on https://gptbot.uz (no JS, like a crawler).
import re, json, html, io, os, sys, glob, urllib.request, concurrent.futures as cf
import xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))  # repository root
SITE = 'https://gptbot.uz'
UA = {'User-Agent': 'Mozilla/5.0 (compatible; release-verify/1.0)', 'Cache-Control': 'no-cache'}
OUT = io.open(os.path.join(os.path.dirname(__file__), 'live-verification-report.md'), 'w', encoding='utf-8')
def log(s=''): OUT.write(s + '\n')

def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    try:
        r = urllib.request.urlopen(req, timeout=timeout)
        return r.status, dict((k.lower(), v) for k, v in r.headers.items()), r.read().decode('utf-8', 'ignore')
    except urllib.error.HTTPError as e:
        return e.code, dict((k.lower(), v) for k, v in e.headers.items()), ''
    except Exception as e:
        return 0, {}, str(e)

problems = []
def bad(msg): problems.append(msg)

# ---------- 0. manifest, robots, sitemap ----------
st, hd, body = get(f'{SITE}/gptbot-release.json')
manifest = json.loads(body); log(f'manifest commit: {manifest["commit"]} files: {manifest["fileCount"]}')
EXPECTED = '308cf787e01fd371f821af8268d12c93ce60d6d8'
if manifest['commit'] != EXPECTED: bad(f'manifest commit is not {EXPECTED[:7]}')
st, hd, sm = get(f'{SITE}/sitemap.xml'); locs = re.findall(r'<loc>(.*?)</loc>', sm)
log(f'sitemap: HTTP {st}, {len(locs)} URLs')
if len(locs) != 288: bad(f'sitemap has {len(locs)} URLs, expected 288')
st, hd, rb = get(f'{SITE}/robots.txt'); sml = [l for l in rb.splitlines() if l.lower().startswith('sitemap:')]
log(f'robots.txt: HTTP {st}, Sitemap lines: {sml}')
if sml != ['Sitemap: https://gptbot.uz/sitemap.xml']: bad('robots.txt sitemap lines changed')

# ---------- content expectations ----------
def load_docs():
    docs = {}
    for kind in ('pages', 'blog'):
        for f in glob.glob(os.path.join(ROOT, 'content', kind, '*', '*.json')):
            d = json.load(io.open(f, encoding='utf-8'))
            if d.get('status') == 'published' and d.get('robotsIndex') is not False: docs[d['url']] = d
    return docs
docs = load_docs()
twins = set(re.findall(r'https://gptbot\.uz(/[^\s)]*?/)index\.html\.md', io.open(os.path.join(ROOT, 'public', 'llms.txt'), encoding='utf-8').read()))
old_baseline = json.load(io.open(os.path.join(ROOT, 'docs', 'seo', 'evidence', '2026-09-18-release', 'reviewed-protected-pages.json'), encoding='utf-8'))
old_pages = {p['pathname']: p['contract'] for p in old_baseline['pages']}
REWRITTEN = ['/ru/ai-bot-dlya-biznesa/', '/ru/ai-bot-dlya-uchebnogo-tsentra/', '/ru/ai-bot-s-crm-amocrm-bitrix24/', '/ru/ai-menedzher-dlya-instagram/',
  '/ru/kontekstnaya-reklama-tashkent/', '/ru/razrabotka-saytov-tashkent/', '/ru/razrabotka-telegram-bota-tashkent/', '/ru/seo-prodvizhenie-saytov-tashkent/',
  '/ru/whatsapp-bot-dlya-biznesa/', '/uz/amocrm-bitrix24-bilan-ai-bot/', '/uz/biznes-uchun-ai-bot/', '/uz/chat-bot-narxi/', '/uz/klinika-uchun-ai-bot/',
  '/uz/oquv-markazi-uchun-ai-bot/', '/uz/smm-xizmatlari/', '/uz/whatsapp-bot-biznes-uchun/', '/ru/blog/agentstvo-ili-frilanser-uzbekistan/',
  '/ru/blog/keys-cake-city-platforma-kondirterskoy/', '/ru/blog/keys-graver-studio-seo-sayt-b2b/', '/ru/blog/skolko-stoit-internet-reklama-uzbekistan-2026/',
  '/ru/blog/skolko-stoit-sozdat-sayt-tashkent-2026/', '/uz/blog/agentlik-frilanser-yoki-birja-ozbekiston/', '/uz/blog/internet-reklama-narxi-ozbekiston-2026/',
  '/uz/blog/sayt-yaratish-narxi-toshkent-2026/']
PROTECTED_DESC_OVER = {'/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/', '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/'}

PRICE_RE = re.compile(r'(\d{1,3}(?:\s\d{3})+|\d{4,})\s*(?:сум|so[‘’\'ʻ`]m)', re.I)
MONTH_RE = re.compile(r'/\s*мес|в месяц|oyiga|/\s*oy(?![a-z])', re.I)

def parse(url):
    st, hd, s = get(url)
    p = url.replace(SITE, '')
    r = {'url': p, 'status': st, 'xrobots': hd.get('x-robots-tag', ''), 'cache': hd.get('cf-cache-status', '')}
    if st != 200: return r
    g = lambda rx: (lambda m: html.unescape(m.group(1)) if m else None)(re.search(rx, s, re.S))
    r['title'] = g(r'<title>(.*?)</title>'); r['desc'] = g(r'<meta name="description" content="([^"]*)"')
    r['robots'] = g(r'<meta name="robots" content="([^"]*)"'); r['canonical'] = g(r'<link rel="canonical" href="([^"]+)"')
    r['site_name'] = g(r'<meta property="og:site_name" content="([^"]*)"')
    r['h1'] = [html.unescape(re.sub(r'<[^>]+>', '', x)).strip() for x in re.findall(r'<h1[^>]*>(.*?)</h1>', s, re.S)]
    r['rss'] = re.findall(r'<link rel="alternate" type="application/rss\+xml" title="([^"]*)" href="([^"]+)"', s)
    r['md'] = re.findall(r'<link rel="alternate" type="text/markdown" href="([^"]+)"', s)
    r['wordmark'] = g(r'data-testid="back-home">([^<]*)<')
    r['byline'] = re.findall(r'(Проверено командой [^<·]*|[^<·>]* jamoasi tomonidan tekshirilgan)', s)
    r['chips'] = [html.unescape(re.sub(r'<[^>]+>', '', c)) for c in re.findall(r'<li class="px-3 py-1 rounded-full border border-white/10 bg-white/5">(.*?)</li>', s)]
    r['ld_err'] = 0; r['org'] = None; r['website'] = None; r['offers'] = []; r['services'] = 0
    for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        try: j = json.loads(b)
        except Exception: r['ld_err'] += 1; continue
        for n in (j.get('@graph', [j]) if isinstance(j, dict) else []):
            t = n.get('@type')
            if t and 'Organization' in (t if isinstance(t, list) else [t]) and n.get('@id') == f'{SITE}/#org': r['org'] = {'name': n.get('name'), 'alt': n.get('alternateName'), 'sameAs': n.get('sameAs')}
            if t == 'WebSite': r['website'] = {'name': n.get('name'), 'alt': n.get('alternateName')}
            if t == 'Service':
                r['services'] += 1
                if n.get('offers'): r['offers'].append(n['offers'])
    return r

with cf.ThreadPoolExecutor(4) as ex: rows = list(ex.map(parse, locs))
# one sequential retry for transient timeouts
rows = [parse(SITE + r['url']) if r['status'] != 200 else r for r in rows]
by = {r['url']: r for r in rows}

# ---------- 1. crawlability ----------
non200 = [r['url'] for r in rows if r['status'] != 200]
noindex = [r['url'] for r in rows if r['status'] == 200 and ('noindex' in (r['robots'] or '') or 'noindex' in r['xrobots'])]
noncanon = [r['url'] for r in rows if r['status'] == 200 and r['canonical'] != SITE + r['url']]
h1bad = [r['url'] for r in rows if r['status'] == 200 and len(r['h1']) != 1]
lderr = [r['url'] for r in rows if r['status'] == 200 and r['ld_err']]
log(f'\n## Crawlability\n200: {len(rows)-len(non200)}/{len(rows)} | non-200: {non200[:5]} | noindex: {noindex} | non-self-canonical: {noncanon} | h1!=1: {h1bad} | JSON-LD parse errors: {lderr}')
for x, m in ((non200, 'non-200 pages'), (noindex, 'noindex pages'), (noncanon, 'non-self-canonical'), (h1bad, 'h1 count'), (lderr, 'JSON-LD parse errors')):
    if x: bad(f'{m}: {x[:5]}')
cache = {}
for r in rows: cache[r['cache']] = cache.get(r['cache'], 0) + 1
log(f'cf-cache-status distribution: {cache}')

ok = [r for r in rows if r['status'] == 200]
# ---------- 2. F01 brand ----------
sn = {}
for r in ok: sn[r['site_name']] = sn.get(r['site_name'], 0) + 1
old_suffix = [r['url'] for r in ok if r['title'] and r['title'].rstrip().endswith('| GPTBot')]
wm = {}
for r in ok: wm[r['wordmark']] = wm.get(r['wordmark'], 0) + 1
bylines_bad = [r['url'] for r in ok if any('GPTBot.uz' not in b for b in r['byline'])]
byl_n = sum(1 for r in ok if r['byline'])
org_pages = [r for r in ok if r['org']]
org_bad = [r['url'] for r in org_pages if r['org']['name'] != 'GPTBot.uz' or r['org']['alt'] != 'GPTBot' or 'https://yandex.ru/maps/org/109235624736' not in (r['org']['sameAs'] or [])]
ws_pages = [r for r in ok if r['website']]
ws_bad = [r['url'] for r in ws_pages if r['website']['name'] != 'GPTBot.uz' or r['website']['alt'] != ['GPTBot', 'gptbot.uz']]
home = by['/']
log(f'\n## F01 brand\nog:site_name: {sn}\ntitles still ending "| GPTBot": {len(old_suffix)} {old_suffix[:5]}\nheader wordmark: {wm}\nbylines: {byl_n} pages, without GPTBot.uz: {bylines_bad[:5]}\nOrganization nodes: {len(org_pages)}, wrong name/alternateName/sameAs: {org_bad[:5]}\nWebSite nodes: {len(ws_pages)}, wrong: {ws_bad[:5]}\nhome title: {home["title"]}\nhome h1: {home["h1"]}\nhome description: {home["desc"]}')
if set(sn) != {'GPTBot.uz'}: bad(f'og:site_name values {sn}')
if old_suffix: bad(f'old title suffix on {len(old_suffix)} pages')
if set(k for k in wm if k) != {'GPTBot.uz'}: bad(f'wordmark values {wm}')
if bylines_bad: bad(f'byline without GPTBot.uz: {bylines_bad[:5]}')
if org_bad: bad(f'Organization wrong on {org_bad[:5]}')
if ws_bad: bad(f'WebSite wrong on {ws_bad[:5]}')
if not home['title'].startswith('GPTBot.uz — ') or not home['h1'][0].startswith('GPTBot.uz — '): bad('home title/h1 not GPTBot.uz')
# React bundle
st, hd, hs = get(SITE + '/')
js = re.findall(r'src="(/assets/index-[^"]+\.js)"', hs)
if js:
    st, hd, jsb = get(SITE + js[0])
    has_new = 'GPTBot.uz — AI-бот для бизнеса' in jsb; has_old = '"GPTBot — ' in jsb or "'GPTBot — " in jsb
    log(f'React bundle {js[0]}: HTTP {st}, new h1 string present: {has_new}, old "GPTBot — " present: {has_old}')
    if not has_new or has_old: bad('React bundle brand strings')
else: bad('no index bundle found on home')

# ---------- 3. F05 offers ----------
with_offers = [r for r in ok if r['offers']]
chip_pages = [r for r in ok if any(PRICE_RE.search(c) for c in r['chips'])]
mism = []
for r in with_offers:
    if len(r['offers']) != 1: mism.append((r['url'], 'multiple offers')); continue
    o = r['offers'][0]; ps = o.get('priceSpecification', {})
    chip = next((c for c in r['chips'] if PRICE_RE.search(c)), None)
    if not chip: mism.append((r['url'], 'offer but no visible price chip')); continue
    price = int(PRICE_RE.search(chip).group(1).replace(' ', '').replace('\u00a0', ''))
    monthly = bool(MONTH_RE.search(chip))
    if ps.get('minPrice') != price: mism.append((r['url'], f'minPrice {ps.get("minPrice")} != chip {price}'))
    if 'price' in o or 'price' in ps: mism.append((r['url'], 'fixed price emitted'))
    if ps.get('priceCurrency') != 'UZS' or o.get('priceCurrency') != 'UZS': mism.append((r['url'], 'currency'))
    if monthly != (ps.get('@type') == 'UnitPriceSpecification' and ps.get('unitCode') == 'MON'): mism.append((r['url'], 'monthly flag'))
    if o.get('url') != SITE + r['url']: mism.append((r['url'], 'offer url'))
missing = [r['url'] for r in chip_pages if not r['offers'] and r['services']]
log(f'\n## F05 offers\nService nodes: {sum(r["services"] for r in ok)} | pages with Offer: {len(with_offers)} | pages with a visible price chip: {len(chip_pages)} | chip-but-no-offer (with Service): {missing} | mismatches: {mism}')
monthly_pages = [r['url'] for r in with_offers if r['offers'][0]['priceSpecification'].get('@type') == 'UnitPriceSpecification']
log(f'monthly offers: {monthly_pages}')
if len(with_offers) != 34: bad(f'offers on {len(with_offers)} pages, expected 34')
if mism or missing: bad(f'offer mismatches {mism[:3]} missing {missing[:3]}')

# ---------- 4. F06 meta ----------
t65 = [(len(r['title']), r['url']) for r in ok if len(r['title'] or '') > 65]
d160 = [(len(r['desc']), r['url']) for r in ok if len(r['desc'] or '') > 160 and r['url'] not in PROTECTED_DESC_OVER]
diff = []
for u in REWRITTEN:
    r = by.get(u); d = docs.get(u)
    if not r or not d: diff.append((u, 'missing')); continue
    if r['title'] != d['title'] or r['desc'] != d['description']: diff.append((u, 'live != content'))
log(f'\n## F06 meta\ntitle > 65: {t65} | description > 160 (excluding 2 protected leaders): {d160} | rewritten pages live == content: {24-len(diff)}/24 {diff}')
if t65 or d160 or diff: bad('meta lengths / rewritten pages')
# all live titles == content titles (suffix normalisation)
tdiff = [u for u, r in by.items() if u in docs and r['status'] == 200 and r['title'] != docs[u]['title']]
log(f'live title == content title for all sitemap docs: {len(by)-len(tdiff)}/{len(by)} (differences: {tdiff[:5]})')
if tdiff: bad(f'live titles differ from content on {len(tdiff)} pages')

# ---------- 5. protected leaders ----------
lead_bad = []
for pth, c in old_pages.items():
    r = by.get(pth)
    if not r: lead_bad.append((pth, 'not in sitemap')); continue
    if pth == '/':
        exp_t = c['title'][0].replace('GPTBot — ', 'GPTBot.uz — ', 1); exp_h = c['h1'][0].replace('GPTBot — ', 'GPTBot.uz — ', 1)
        if r['title'] != exp_t or r['h1'][0] != exp_h: lead_bad.append((pth, 'title/h1'))
    else:
        if r['title'] != c['title'][0] or r['h1'][0] != c['h1'][0] or r['desc'] != c['description'][0]: lead_bad.append((pth, 'title/h1/description changed'))
    if r['canonical'] != c['canonical'][0]: lead_bad.append((pth, 'canonical'))
log(f'\n## Protected leaders (vs 2026-09-18-release baseline)\n10 leaders checked; title/h1/description/canonical deviations: {lead_bad}')
if lead_bad: bad(f'leaders {lead_bad}')

# ---------- 6. F03 twins + llms ----------
md_bad = []
for r in ok:
    exp = f'{SITE}{r["url"]}index.html.md' if r['url'] in twins else f'{SITE}/llms.txt'
    if r['md'] != [exp]: md_bad.append((r['url'], r['md']))
log(f'\n## F03 markdown twins\nlisted in llms.txt: {len(twins)} | pages whose text/markdown alternate is wrong: {md_bad[:5]}')
if md_bad: bad(f'md alternate wrong on {len(md_bad)} pages')
def twin(u):
    st, hd, b = get(f'{SITE}{u}index.html.md')
    return (u, st, hd.get('content-type', ''), hd.get('x-robots-tag', ''), b.startswith('# '), ('## Частые вопросы' in b or '## Tez-tez' in b), len(b))
with cf.ThreadPoolExecutor(8) as ex: tw = list(ex.map(twin, sorted(twins)))
tw_bad = [t for t in tw if t[1] != 200 or 'text/markdown' not in t[2] or 'noindex' not in t[3] or not t[4]]
log(f'twins fetched: {len(tw)}; 200+text/markdown+noindex+H1: {len(tw)-len(tw_bad)}/{len(tw)}; bad: {tw_bad}')
log('twins without FAQ section: ' + str([t[0] for t in tw if not t[5]]))
for t in tw:
    if t[0].startswith(('/uz/blog/', '/ru/blog/')): log(f'  {t[0]} {t[1]} {t[6]} bytes')
if tw_bad: bad(f'twins bad {tw_bad}')
st, hd, b = get(f'{SITE}/ru/razrabotka-sayta-pod-klyuch/index.html.md'); log(f'removed twin -> {st}')
st, hd, b = get(f'{SITE}/llms'); log(f'/llms alias -> {st} {hd.get("content-type")}')
st, hd, l1 = get(f'{SITE}/llms.txt'); st2, hd2, l2 = get(f'{SITE}/llms-full.txt')
chk = {'llms Last updated 2026-09-18': '| Last updated | 2026-09-18 |' in l1, 'llms Key articles (UZ)': '### Key articles (UZ)' in l1,
       'llms hubs section': '### Websites, SEO, SMM and advertising' in l1, 'llms feeds': 'feed.xml' in l1, 'llms 25 twins': l1.count('index.html.md') == 25,
       'llms no 404 twin': 'razrabotka-sayta-pod-klyuch' not in l1, 'llms-full UZ cluster': '### ChatGPT in Uzbekistan (UZ cluster)' in l2,
       'llms-full hubs': '### Uzbek commercial hubs (UZ)' in l2, 'llms-full dated': 'Last updated: 2026-09-18' in l2, 'llms-full no 404 twin': 'razrabotka-sayta-pod-klyuch' not in l2}
log('llms checks: ' + json.dumps(chk))
if not all(chk.values()): bad(f'llms checks {chk}')
# every URL named in llms.txt / llms-full.txt resolves 200
urls_in_llms = sorted(set(u.rstrip('.,;') for u in re.findall(r'https://gptbot\.uz/[^\s)>\]]+', l1 + l2)))
def head(u):
    st, hd, b = get(u); return (u, st)
with cf.ThreadPoolExecutor(8) as ex: hu = list(ex.map(head, urls_in_llms))
hbad = [x for x in hu if x[1] != 200]
log(f'URLs referenced in llms.txt + llms-full.txt: {len(hu)}, non-200: {hbad}')
if hbad: bad(f'llms references non-200 {hbad}')

# ---------- 7. F07 feeds ----------
locset = set(locs)
for loc in ('ru', 'uz'):
    st, hd, fx = get(f'{SITE}/{loc}/blog/feed.xml')
    try:
        if '<!DOCTYPE' in fx or '<!ENTITY' in fx: raise ValueError('feed contains a DOCTYPE/ENTITY declaration; refusing to parse')
        root = ET.fromstring(fx.encode('utf-8')); ch = root.find('channel'); items = ch.findall('item')
        links = [i.findtext('link') for i in items]; notmap = [l for l in links if l not in locset]
        selfl = ch.find('{http://www.w3.org/2005/Atom}link'); selfh = selfl.get('href') if selfl is not None else None
        pub = [i.findtext('pubDate') for i in items]
        log(f'feed {loc}: HTTP {st} {hd.get("content-type")} | items {len(items)} | self {selfh} | lang {ch.findtext("language")} | items not in sitemap: {notmap} | first: {items[0].findtext("title")} ({pub[0]})')
        if st != 200 or 'application/rss+xml' not in hd.get('content-type', '') or len(items) != 50 or notmap or selfh != f'{SITE}/{loc}/blog/feed.xml': bad(f'feed {loc}')
    except Exception as e:
        log(f'feed {loc}: PARSE ERROR {e}'); bad(f'feed {loc} parse')
def rss_ok(r):
    if r['url'] == '/': return sorted(h for _, h in r['rss']) == [f'{SITE}/ru/blog/feed.xml', f'{SITE}/uz/blog/feed.xml']
    loc = 'uz' if r['url'].startswith('/uz/') else 'ru'
    return len(r['rss']) == 1 and r['rss'][0][1] == f'{SITE}/{loc}/blog/feed.xml'
rss_bad = [(r['url'], r['rss']) for r in ok if not rss_ok(r)]
log(f'pages with exactly one locale-correct RSS link: {len(ok)-len(rss_bad)}/{len(ok)}; bad: {rss_bad[:5]}')
if rss_bad: bad(f'rss link wrong on {len(rss_bad)} pages')
for u in ('/ru/blog/', '/uz/blog/'):
    st, hd, b = get(SITE + u)
    rss_hrefs = re.findall(r'application/rss\+xml" title="[^"]*" href="([^"]+)"', b)
    sname = re.findall(r'og:site_name" content="([^"]*)"', b)
    log(f'blog index {u}: HTTP {st}, rss links: {rss_hrefs}, og:site_name: {sname}')

# ---------- 8. pages.dev origin parity ----------
st, hd, b = get('https://2f94ba7b.ai-direct-pro-landing.pages.dev/gptbot-release.json')
log(f'\n## Origin parity\npages.dev manifest commit: {json.loads(b)["commit"] if st == 200 else st}')

log('\n## RESULT')
log('ALL CHECKS PASSED' if not problems else 'PROBLEMS:\n- ' + '\n- '.join(problems))
OUT.close()
print('ALL CHECKS PASSED' if not problems else f'PROBLEMS: {len(problems)}')
