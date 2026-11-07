"""Read-only candidate comparison against the saved production predecessor."""
from pathlib import Path
from html.parser import HTMLParser
import hashlib,json,re,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[2]
BEFORE=ROOT.parent/'gptbot-seo-evidence-20261107'/'before-dist'
AFTER=ROOT/'dist'
OUT=Path(__file__).with_name('artifact-comparison.json')
class Head(HTMLParser):
    def __init__(self): super().__init__(); self.items=[]; self.title=False; self.h1=False; self.text=[]
    def handle_starttag(self,t,attrs):
        a=dict(attrs)
        if t in ('title','h1'): self.title=t=='title'; self.h1=t=='h1'; self.text=[]
        if t=='meta' and a.get('name','').lower() in ('description','robots','googlebot'):
            self.items.append((a['name'].lower(),a.get('content','')))
        if t=='link' and (a.get('rel')=='canonical' or 'hreflang' in a):
            self.items.append((a.get('rel',''),a.get('hreflang',''),a.get('href','')))
    def handle_data(self,d):
        if self.title or self.h1: self.text.append(d)
    def handle_endtag(self,t):
        if t=='title' and self.title: self.items.append(('title',''.join(self.text).strip())); self.title=False
        if t=='h1' and self.h1: self.items.append(('h1',''.join(self.text).strip())); self.h1=False
def contract(s):
    p=Head();p.feed(s);return sorted(p.items)
def urls(d):
    ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
    return sorted(n.text for n in ET.parse(d/'sitemap.xml').findall('s:url/s:loc',ns))
def page(d,u): return d/((u.removeprefix('https://gptbot.uz/'))+'index.html')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def assets(d):
    return {p.relative_to(d).as_posix():sha(p) for p in (d/'assets').rglob('*') if p.is_file() and p.suffix in ('.js','.css')}
checks=[];details={}
def check(k,ok,info=None):
    checks.append({'check':k,'pass':bool(ok)})
    if info is not None:details[k]=info
before_urls=urls(BEFORE)
after_urls=urls(AFTER)
check('329 URLs unchanged',before_urls==after_urls and len(after_urls)==329)
metadata=[];gtm=[];ga=[]
for u in after_urls:
    b=page(BEFORE,u).read_text(encoding='utf-8');a=page(AFTER,u).read_text(encoding='utf-8')
    if contract(b)!=contract(a):metadata.append(u)
    if 'GTM-NLR4WFX8' in a:gtm.append(u)
    if 'data-tag="ga"' in b and 'data-tag="ga"' not in a:ga.append(u)
check('all sitemap SEO metadata and H1 unchanged',not metadata,metadata)
check('empty GTM absent from all sitemap HTML',not gtm,gtm)
check('existing direct GA4 bootstraps retained',not ga,ga)
ba,aa=assets(BEFORE),assets(AFTER)
changed=[k for k in ba.keys() & aa.keys() if ba[k]!=aa[k]]
added=sorted(aa.keys()-ba.keys());removed=sorted(ba.keys()-aa.keys())
check('shared JS CSS bytes and filenames unchanged',not changed and not added and not removed,{'before':len(ba),'after':len(aa),'changed':changed,'added':added,'removed':removed})
donors={}
for u in ['https://gptbot.uz/uz/blog/rezyume-tayyorlash/','https://gptbot.uz/uz/blog/tushuntirish-xati-va-ariza-yozish/']:
    text=page(AFTER,u).read_text(encoding='utf-8')
    donors[u]=text.count('href="/uz/blog/tavsifnoma-namuna/"')
check('two contextual tavsifnoma donors built',all(v>=1 for v in donors.values()),donors)
check('converter Ng reference built',all('Ng ng' in page(AFTER,'https://gptbot.uz/'+u).read_text(encoding='utf-8') for u in ['uz/kirill-lotin/','ru/kirillica-v-latinicu/']))
check('no obsolete absolute chat file denial in slayd', 'PPTX yoki PDF fayl yaratmaydi' not in page(AFTER,'https://gptbot.uz/uz/blog/slayd-tayyorlash/').read_text(encoding='utf-8'))
result={'baselineManifest':json.loads((BEFORE/'gptbot-release.json').read_text()),'checks':checks,'details':details,'passed':sum(c['pass'] for c in checks),'failed':sum(not c['pass'] for c in checks)}
OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'report':str(OUT),'passed':result['passed'],'failed':result['failed'],'failures':[c['check'] for c in checks if not c['pass']]},ensure_ascii=False))
raise SystemExit(bool(result['failed']))
