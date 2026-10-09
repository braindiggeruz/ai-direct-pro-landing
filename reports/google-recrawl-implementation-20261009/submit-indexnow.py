import json,pathlib,re,datetime,requests,sys
root=pathlib.Path.cwd();out=root/'reports/google-recrawl-implementation-20261009';receipt=out/'indexnow.json'
if receipt.exists(): raise SystemExit('Existing receipt or intent found; reconcile instead of repeating.')
release=json.loads((root/'dist/gptbot-release.json').read_text(encoding='utf8'))['commit']
urls=['https://gptbot.uz'+d['url'] for d in json.loads((out/'content-changes.json').read_text(encoding='utf8'))]+['https://gptbot.uz/ru/blog/','https://gptbot.uz/uz/blog/']
s=requests.Session();s.headers['User-Agent']='Mozilla/5.0 (GPTBot.uz release verification)'
key=None
for f in (root/'public').glob('*.txt'):
 if re.fullmatch(r'[a-f0-9]{32,64}',f.stem) and f.read_text(encoding='utf8').strip()==f.stem:
  r=s.get('https://gptbot.uz/'+f.name,timeout=20)
  if r.status_code==200 and r.text.strip()==f.stem: key=f.stem;break
if not key:raise SystemExit('Live key validation failed.')
for u in urls:
 r=s.get(u,allow_redirects=False,timeout=20)
 assert r.status_code==200 and ('rel="canonical" href="'+u+'"') in r.text,u
 assert 'noindex' not in r.headers.get('x-robots-tag','').lower()
 assert not re.search(r'<meta name="robots" content="[^"]*noindex',r.text)
evidence={'attemptedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'release':release,'urls':urls,'keyValidated':True,'status':'pending','googleRecrawlConfirmed':False}
receipt.write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf8')
try:
 r=s.post('https://api.indexnow.org/IndexNow',json={'host':'gptbot.uz','key':key,'keyLocation':'https://gptbot.uz/'+key+'.txt','urlList':urls},timeout=30)
 evidence.update({'status':'accepted' if r.status_code in [200,202] else 'rejected','httpStatus':r.status_code})
except requests.RequestException:
 evidence['status']='unknown'
receipt.write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf8')
print(json.dumps({'count':len(urls),'status':evidence['status'],'httpStatus':evidence.get('httpStatus')}))
if evidence['status']!='accepted':sys.exit(1)