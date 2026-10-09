"""Single authorized IndexNow batch after verified release; preserves existing public key."""
import datetime, hashlib, json, pathlib, re, urllib.request, urllib.error
out=pathlib.Path(__file__).resolve().parent
root=out.parents[1]
base='https://gptbot.uz'
def send(url,data=None):
 req=urllib.request.Request(url,data=data,headers={'User-Agent':'GPTBot-Commercial-Discovery/1.0',**({'Content-Type':'application/json; charset=utf-8'} if data else {})})
 try:response=urllib.request.urlopen(req,timeout=40)
 except urllib.error.HTTPError as error:response=error
 with response:return response.status,response.read()
readback=json.loads((out/'PRODUCTION_READBACK.json').read_text(encoding='utf-8'))
assert readback['pass'] and readback['manifestExactMatch']
assert not (out/'DISCOVERY.json').exists(),'Receipt exists: inspect before repeating submission'
key=None
for file in sorted((root/'public').glob('*.txt')):
 if re.fullmatch('[A-Za-z0-9-]{8,128}',file.stem) and file.read_text(encoding='utf-8-sig').strip()==file.stem:
  code,body=send(base+'/'+file.name)
  if code==200 and body.decode('utf-8-sig').strip()==file.stem:key=file.stem;break
assert key,'No live existing IndexNow key file verified'
urls=json.loads((out/'INDEXNOW_URLS.json').read_text(encoding='utf-8'))
assert len(urls)==12 and len(set(urls))==12 and all(u.startswith(base+'/') for u in urls)
engine=(root/'functions/lib/indexnow/submit-engine.ts').read_text(encoding='utf-8')
endpoint=re.search(r"export const INDEXNOW_ENDPOINT = '([^']+)'",engine).group(1)
request={'host':'gptbot.uz','key':key,'keyLocation':base+'/'+key+'.txt','urlList':urls}
result={'submittedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'manifest':readback['manifest'],'endpoint':endpoint,'urls':urls,'keyFileVerified':True,'keySha256':hashlib.sha256(key.encode()).hexdigest(),'googleNotifiedByIndexNow':False,'indexingConfirmed':False,'status':'attempting'}
(out/'DISCOVERY.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
code,body=send(endpoint,json.dumps(request).encode())
result.update(httpStatus=code,status='accepted' if code in (200,202) else 'rejected',keyValidationPending=code==202,responseExcerpt=body.decode('utf-8','replace')[:350])
(out/'DISCOVERY.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':result['status'],'httpStatus':code,'urls':len(urls),'indexingConfirmed':False,'keyValidationPending':code==202}))
