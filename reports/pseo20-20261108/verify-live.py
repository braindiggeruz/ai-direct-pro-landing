"""Strict public readback of the November 8 pSEO20 release. Read-only HTTP GET."""
from pathlib import Path
import argparse,hashlib,json,urllib.request,xml.etree.ElementTree as ET,concurrent.futures,time
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
ORIGIN='https://gptbot.uz'
EMAIL_OPEN=b'<!--email_off-->'
EMAIL_CLOSE=b'<!--/email_off-->'
BEACON=(b'<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/vce701823e78c4301a35b7e07294d87301792088814092" '
        b'integrity="sha512-UKNk8GbxkABxKcXYuLkO16EleLGUkcvJWtpSNmExE0Too3ZaFAxTscNWEc1OdAv5/BikHawapSCaiD2XCmp+Bw==" '
        b'data-cf-beacon=\'{"version":"2024.11.0","token":"de00c6c17e3545f9b61017bf97fe75e7","r":1,"spa":2}\' crossorigin="anonymous"></script>\n')

def digest(value): return hashlib.sha256(value).hexdigest()
def retained_predecessor_css(path, local, remote):
 # A fresh Windows checkout used CRLF for this immutable, otherwise unchanged
 # asset. The live CDN retains the exact LF bytes of the predecessor and HEAD
 # blob. Accept only this reviewed path/hash pair and byte-exact CRLF removal.
 return (path=='/assets/campaigns/ai-routine/landing-dark.css'
   and digest(local)=='b57152beb7de075997cd1e815fccb0168946bf035a56d02eb1d0a5247a99d8ed'
   and digest(remote)=='c3076b85bbdf43db507e625c2458a9f325f03a03eb56ca891c691420c6c8701a'
   and local.replace(b'\r\n',b'\n')==remote)
def utc(): return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
def rel_path(path):
    if path == '/': return 'index.html'
    return path.lstrip('/') + ('index.html' if path.endswith('/') else '')
def expected_edge_html(local):
    if local.count(b'</body>') != 1 or BEACON in local:
        raise ValueError('Unknown local HTML structure; refusing edge normalization')
    if local.count(EMAIL_OPEN) != local.count(EMAIL_CLOSE):
        raise ValueError('Unbalanced email_off markers; refusing edge normalization')
    return local.replace(EMAIL_OPEN,b'').replace(EMAIL_CLOSE,b'').replace(b'</body>',BEACON+b'</body>',1)

def fetch(path):
 req=urllib.request.Request(ORIGIN+path,headers={'User-Agent':'Mozilla/5.0 GPTBotOwnerReleaseQA/1.0','Accept-Encoding':'identity','Cache-Control':'no-cache'})
 with urllib.request.urlopen(req,timeout=40) as r:return r.status,r.read(),r.geturl()
def check(path):
 try:
  status,body,url=fetch(path)
  local=(ROOT/'dist'/rel_path(path)).read_bytes()
  expected=expected_edge_html(local) if path.endswith('/') else local
  same=body==expected
  retained=retained_predecessor_css(path,local,body)
  return {'path':path,'status':status,'sameUrl':url==ORIGIN+path,'exactExpectedBytes':same,'retainedPredecessorCss':retained,'localSha256':digest(local),'remoteSha256':digest(body),'ok':status==200 and url==ORIGIN+path and (same or retained)}
 except Exception as e:return {'path':path,'ok':False,'error':type(e).__name__+': '+str(e)}
p=argparse.ArgumentParser();p.add_argument('--expected-commit',required=True);p.add_argument('--live',action='store_true');args=p.parse_args()
assert args.live,'Explicit --live required'
manifest=(ROOT/'dist/gptbot-release.json').read_bytes();m=json.loads(manifest)
assert m['commit']==args.expected_commit
status,body,url=fetch('/gptbot-release.json')
assert status==200 and body==manifest,'Production manifest differs from candidate'
ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
paths=[n.text.removeprefix(ORIGIN) for n in ET.parse(ROOT/'dist/sitemap.xml').findall('s:url/s:loc',ns)]
assert len(paths)==350
paths+=['/sitemap.xml','/sitemap-updates.xml','/robots.txt','/ru/blog/feed.xml','/uz/blog/feed.xml','/updates/atom.xml','/llms.txt','/llms-full.txt']
# Check every current root shared JS/CSS asset, not just assets referenced by one page.
paths+=[ '/'+f.relative_to(ROOT/'dist').as_posix() for f in (ROOT/'dist/assets').rglob('*') if f.is_file() and f.suffix in ['.js','.css']]
paths += ['/'+f.relative_to(ROOT/'dist').as_posix() for f in (ROOT/'dist').rglob('index.html.md')]
paths += ['/'+f.relative_to(ROOT/'dist').as_posix() for f in (ROOT/'dist/assets/campaigns/ai-routine').rglob('*') if f.is_file() and f.suffix in ['.webp','.jpg']]
paths += ['/'+f.relative_to(ROOT/'dist').as_posix() for f in (ROOT/'dist/downloads/pseo-20261108').glob('*') if f.is_file()]
assert len(paths) == len(set(paths))
rows=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for row in pool.map(check,paths):
  rows.append(row)
  if not row['ok']:print(json.dumps(row),flush=True)
result={'checkedAt':utc(),'manifestExact':True,'commit':m['commit'],'artifactSha256':m['artifactSha256'],'rows':rows,'passed':sum(r['ok'] for r in rows),'failed':sum(not r['ok'] for r in rows)}
(OUT/'live-readback.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({k:result[k] for k in ['manifestExact','commit','passed','failed']}),flush=True)
raise SystemExit(bool(result['failed']))
