import concurrent.futures, datetime, hashlib, json, pathlib, re, urllib.request, urllib.error, xml.etree.ElementTree as ET
out=pathlib.Path(__file__).resolve().parent
root=out.parents[1]
base='https://gptbot.uz'
def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'GPTBot-Commercial-Release-Readback/1.0','Cache-Control':'no-cache'})
 try: response=urllib.request.urlopen(req,timeout=35)
 except urllib.error.HTTPError as error: response=error
 with response:return response.status,response.read(),dict(response.headers)
expected=json.loads((root/'dist/gptbot-release.json').read_text(encoding='utf-8'))
code,body,headers=get(base+'/gptbot-release.json')
actual=json.loads(body)
assert code==200 and actual==expected,'Live release manifest differs from stamped artifact'
paths=[r['pathname'] for r in json.loads((out/'browser-local.json').read_text(encoding='utf-8'))['rows']]
def check(p):
 status,raw,h=get(base+p);html=raw.decode('utf-8')
 canonical=re.search(r'<link rel="canonical" href="([^"]+)"',html)
 robots=re.search(r'<meta name="robots" content="([^"]+)"',html)
 row={'url':base+p,'status':status,'canonical':canonical.group(1) if canonical else None,'indexable':bool(robots) and 'noindex' not in robots.group(1) and 'noindex' not in h.get('X-Robots-Tag',''),'h1Count':len(re.findall(r'<h1\b',html)),'formCount':len(re.findall(r'<form data-lead-form\b',html)),'finalDuplicateDetailsGuard':'duplicateDetails' in html and 'requestFor=contact+' in html}
 row['pass']=status==200 and row['canonical']==base+p and row['indexable'] and row['h1Count']==1 and row['formCount']==1 and row['finalDuplicateDetailsGuard']
 return row
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: rows=list(pool.map(check,paths))
assert all(r['pass'] for r in rows),'Commercial live page check failed'
sitemaps=[]
for p in ['/sitemap.xml','/sitemap-updates.xml']:
 status,body,h=get(base+p);assert status==200
 doc=ET.fromstring(body);ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
 mapping={u.find('s:loc',ns).text:u.find('s:lastmod',ns).text for u in doc.findall('s:url',ns)}
 changed={base+p:mapping.get(base+p) for p in paths}
 assert all(v and v.startswith('2026-10-09') for v in changed.values()),changed
 sitemaps.append({'url':base+p,'status':status,'urlCount':len(mapping),'changedLastmod':changed})
account_status,account_body,_=get(base+'/api/gpt/account')
account=json.loads(account_body)
# Guest checkout deliberately exposes the public offer without a login.
# Verify that contract rather than assuming this endpoint always returns401.
assert account_status==200 and account.get('ok') is True and account.get('guestCheckout') is True,'Unexpected public account contract'
result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pass':True,'manifestExactMatch':True,'manifest':actual,'commercialPages':rows,'sitemaps':sitemaps,'accountGetStatus':account_status,'guestOfferAvailable':True,'productionLeadWrites':0}
(out/'PRODUCTION_READBACK.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'INDEXNOW_URLS.json').write_text(json.dumps([base+p for p in paths],indent=2)+'\n',encoding='utf-8')
print(json.dumps({'pass':True,'pages':len(rows),'manifest':actual,'sitemaps':len(sitemaps),'accountStatus':account_status}))
