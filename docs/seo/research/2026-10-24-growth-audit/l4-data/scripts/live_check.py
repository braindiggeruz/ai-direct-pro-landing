"""Live check of key gptbot.uz URLs. GET only, desktop Chrome UA, <=2 req/s, no redirect following.
Usage: py -3 -I live_check.py <dist_dir> <out_json>
"""
import sys, os, json, time, re, gzip, hashlib, ssl
import urllib.request, urllib.error
from urllib.parse import urlparse
from html.parser import HTMLParser

DIST = sys.argv[1]; OUT = sys.argv[2]
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
S = 'https://gptbot.uz'
PAGES = ['/', '/uz/', '/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/',
         '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/', '/uz/blog/chatgptga-qanday-kirish-mumkin/',
         '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/', '/ru/blog/chatgpt-i-claude-v-uzbekistane/',
         '/ru/blog/chat-gpt-online/', '/uz/blog/chatgpt-uzbek-tilida-promptlar/', '/ru/gpt-vs-chatgpt-sravnenie/',
         '/ru/prezentatsiya-ai/', '/uz/taqdimot-ai/', '/uz/tariflar/', '/ru/tarify-ai-chat/',
         '/ru/telegram-bot-dlya-biznesa/', '/uz/telegram-bot-biznes-uchun/', '/ru/razrabotka-telegram-bota-tashkent/',
         '/ru/ai-bot-dlya-sayta/', '/uz/sayt-uchun-ai-bot/', '/ru/ai-chat-dlya-sayta/', '/ru/blog/', '/uz/blog/',
         '/ru/razrabotka-saytov-tashkent/', '/ru/seo-prodvizhenie-saytov-tashkent/', '/uz/gpt-uzbek-tilida-ai-chat/',
         '/ru/gpt-na-russkom/', '/ru/avtor-boris-gerasimov/']
VARIANTS = ['http://gptbot.uz/', 'http://gptbot.uz/uz/gpt-uzbek-tilida/', 'https://www.gptbot.uz/uz/gpt-uzbek-tilida/',
            S + '/uz/gpt-uzbek-tilida', S + '/uz/gpt-uzbek-tilida/index.html', S + '/ru/', S + '/ru', S + '/?lang=ru', S + '/?lang=uz',
            S + '/ru/gpt-chat/?utm_source=test', S + '/ru/blog/?q=test', S + '/this-page-does-not-exist-xyz/',
            S + '/UZ/GPT-UZBEK-TILIDA/', S + '/gpt-chat/', S + '/uz/blog/chatgpt-telefon-va-kompyuter-ga-yuklab-olish/',
            S + '/ru/blog/keys-haier-shop-internet-magazin-telegram/', S + '/robots.txt', S + '/sitemap.xml', S + '/sitemap-updates.xml',
            S + '/llms.txt', S + '/llms-full.txt', S + '/llms', S + '/ru/ai-bot-dlya-biznesa/index.html.md', S + '/gptbot-release.json',
            S + '/ru/blog/feed.xml', S + '/updates/atom.xml', S + '/favicon.ico', S + '/admin/', S + '/uz/blog/index.html']


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


opener = urllib.request.build_opener(NoRedirect)


class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = None; self._t = False; self.canon = []; self.robots = []; self.h1 = 0; self.hl = {}; self.ld = 0
    def handle_starttag(self, tag, a):
        a = dict(a)
        if tag == 'title' and self.title is None: self._t = True; self.title = ''
        if tag == 'link' and (a.get('rel') or '').lower() == 'canonical': self.canon.append(a.get('href'))
        if tag == 'link' and (a.get('rel') or '').lower() == 'alternate' and a.get('hreflang'): self.hl[a['hreflang']] = a.get('href')
        if tag == 'meta' and (a.get('name') or '').lower() == 'robots': self.robots.append(a.get('content'))
        if tag == 'h1': self.h1 += 1
        if tag == 'script' and (a.get('type') or '') == 'application/ld+json': self.ld += 1
    def handle_endtag(self, tag):
        if tag == 'title': self._t = False
    def handle_data(self, d):
        if self._t: self.title += d


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
                                               'Accept-Encoding': 'gzip', 'Accept-Language': 'ru,uz;q=0.9,en;q=0.5'})
    t0 = time.time()
    try:
        resp = opener.open(req, timeout=30)
        status = resp.status; hdrs = dict(resp.headers.items()); body = resp.read()
    except urllib.error.HTTPError as e:
        status = e.code; hdrs = dict(e.headers.items()) if e.headers else {}; body = e.read() if hasattr(e, 'read') else b''
    except Exception as e:
        return {'url': url, 'error': str(e)[:200]}
    ttfb = round(time.time() - t0, 3)
    wire = len(body)
    if hdrs.get('Content-Encoding', hdrs.get('content-encoding', '')) == 'gzip':
        try: body = gzip.decompress(body)
        except Exception: pass
    h = {k.lower(): v for k, v in hdrs.items()}
    r = {'url': url, 'status': status, 'location': h.get('location'), 'ttfb_s': ttfb, 'wire_bytes': wire, 'bytes': len(body),
         'content_type': h.get('content-type'), 'cache_control': h.get('cache-control'), 'x_robots': h.get('x-robots-tag'),
         'cf_cache': h.get('cf-cache-status'), 'content_encoding': h.get('content-encoding'), 'server': h.get('server'),
         'link_hdr': h.get('link'), 'sha256': hashlib.sha256(body).hexdigest(), 'vary': h.get('vary'), 'age': h.get('age')}
    if 'html' in (h.get('content-type') or ''):
        p = P(); p.feed(body.decode('utf-8', 'replace'))
        r.update({'title': (p.title or '').strip(), 'canonical': p.canon, 'robots_meta': p.robots, 'h1': p.h1, 'hreflang': p.hl, 'ld_blocks': p.ld})
        path = urlparse(url).path
        f = os.path.join(DIST, path.lstrip('/'), 'index.html') if path.endswith('/') else None
        if f and os.path.isfile(f):
            dist_b = open(f, 'rb').read()
            r['matches_dist'] = hashlib.sha256(dist_b).hexdigest() == r['sha256']
            if not r['matches_dist']:
                r['dist_bytes'] = len(dist_b)
    else:
        r['head'] = body[:300].decode('utf-8', 'replace')
        path = urlparse(url).path
        f = os.path.join(DIST, path.lstrip('/'))
        if os.path.isfile(f):
            r['matches_dist'] = hashlib.sha256(open(f, 'rb').read()).hexdigest() == r['sha256']
    return r


out = []
for u in [S + p for p in PAGES] + VARIANTS:
    out.append(fetch(u))
    time.sleep(0.6)
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for r in out:
    print(r.get('status'), r['url'], '->', r.get('location'), '| dist=', r.get('matches_dist'), '| xr=', r.get('x_robots'), '| cf=', r.get('cf_cache'), '| enc=', r.get('content_encoding'), '| ttfb', r.get('ttfb_s'), r.get('error', ''))
