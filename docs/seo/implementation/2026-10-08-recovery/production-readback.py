"""Read-only public release verification; one empty login request exits before auth/DB."""
import concurrent.futures, hashlib, json, re, urllib.request, urllib.error
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone
from html.parser import HTMLParser

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
BASE = 'https://gptbot.uz'
EXPECTED = '5de9e3850468e1915d99729e4930b8750adcf433'

def fetch(url, data=None):
    req = urllib.request.Request(url, data=data, headers={'User-Agent':'GPTBot-SEO-Release-Verification/1.0', 'Cache-Control':'no-cache', **({'Content-Type':'application/json'} if data is not None else {})})
    try:
        response = urllib.request.urlopen(req, timeout=35)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.read(), {k.lower():v for k,v in response.headers.items()}, response.url

class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(); self.canonical=[]; self.robots=[]; self.h1=0; self.feed(html)
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='link' and a.get('rel')=='canonical': self.canonical.append(a.get('href'))
        if tag=='meta' and a.get('name') in ('robots','googlebot'): self.robots.append(a.get('content',''))
        if tag=='h1': self.h1+=1

def page_check(url):
    try:
        status, body, headers, final = fetch(url)
        p=Page(body.decode('utf-8'))
        result={'url':url,'status':status,'finalUrl':final,'canonical':p.canonical,'h1':p.h1,'robots':p.robots,'xRobotsTag':headers.get('x-robots-tag'), 'sha256':hashlib.sha256(body).hexdigest()}
        result['pass']=status==200 and final==url and p.canonical==[url] and p.h1==1 and 'noindex' not in (','.join(p.robots)+str(result['xRobotsTag'])).lower()
        return result
    except Exception as error:
        return {'url':url,'pass':False,'error':str(error)}

local=json.loads((ROOT/'dist/gptbot-release.json').read_text(encoding='utf-8'))
status, raw, headers, _=fetch(BASE+'/gptbot-release.json?release='+EXPECTED)
live=json.loads(raw)
if status!=200 or live!=local or live['commit']!=EXPECTED:
    raise SystemExit('Release manifest mismatch; no crawl or discovery performed')
(OUT/'PRODUCTION_MANIFEST.json').write_bytes(raw)
maps={}
for name in ('sitemap.xml','sitemap-updates.xml','ru/blog/feed.xml','uz/blog/feed.xml','robots.txt'):
    status, raw, headers, final=fetch(BASE+'/'+name)
    expected=(ROOT/'dist'/name).read_bytes()
    maps[name]={'status':status,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'equalsArtifact':raw==expected,'finalUrl':final}
    if name=='sitemap.xml':
        urls=[e.text for e in ET.fromstring(raw).findall('{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
    (OUT/'RAW'/('production-'+name.replace('/','-'))).write_bytes(raw)
(OUT/'INDEXNOW_URLS.json').write_text(json.dumps(urls,indent=2),encoding='utf-8')
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    rows=list(pool.map(page_check,urls))
# A transport exception is inconclusive: retry only those once, never successful probes.
rows=[page_check(row['url']) if 'error' in row else row for row in rows]
private=[]
for path,data,want in [('/api/auth/me',None,401),('/api/auth/login',b'{}',400)]:
    status,raw,headers,final=fetch(BASE+path,data)
    private.append({'path':path,'method':'POST' if data is not None else 'GET','status':status,'cacheControl':headers.get('cache-control'),'xRobotsTag':headers.get('x-robots-tag'),'body':raw.decode('utf-8'),'pass':status==want and 'no-store' in headers.get('cache-control','') and 'noindex' in headers.get('x-robots-tag','')})
result={'checkedAt':datetime.now(timezone.utc).isoformat(),'sourceCommit':EXPECTED,'manifestExactMatch':True,'manifest':{k:v for k,v in live.items() if k!='files'},'discoveryFiles':maps,'crawl':{'total':len(rows),'passed':sum(r['pass'] for r in rows),'failed':[r for r in rows if not r['pass']], 'rows':rows},'privateResponses':private}
result['pass']=all(r['pass'] for r in rows) and all(r['pass'] for r in private) and all(r['status']==200 and r['equalsArtifact'] for r in maps.values())
(OUT/'PRODUCTION_READBACK.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'pass':result['pass'],'sourceCommit':EXPECTED,'crawlTotal':len(rows),'crawlPassed':result['crawl']['passed'],'failed':result['crawl']['failed'],'discoveryFiles':maps,'privateResponses':private},ensure_ascii=False))
