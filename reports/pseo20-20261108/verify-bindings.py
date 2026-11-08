"""Read-only verification of the reviewed GPTBot production resource bindings."""
from pathlib import Path
import json,re,subprocess,urllib.request,time,hashlib,os
ROOT=Path(__file__).resolve().parents[2]
cfg={}
for line in Path('F:/Claude/.env').read_text(encoding='utf-8-sig').splitlines():
    m=re.match(r'^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$',line)
    if m:cfg[m[1]]=m[2].strip().strip('"\'')
token=cfg.get('CLOUDFLARE_API_TOKEN','')
if not token:
    result=subprocess.run(['node',str(ROOT/'node_modules/wrangler/bin/wrangler.js'),'auth','token','--json'],cwd=ROOT,capture_output=True,text=True)
    auth=json.loads(result.stdout);token=auth.get('token') or auth.get('apiToken') or ''
url='https://api.cloudflare.com/client/v4/accounts/'+cfg['CLOUDFLARE_ACCOUNT_ID']+'/pages/projects/ai-direct-pro-landing'
req=urllib.request.Request(url,headers={'Authorization':'Bearer '+token})
with urllib.request.urlopen(req,timeout=30) as response:prod=json.load(response)['result']['deployment_configs']['production']
expected={'d1_databases':['GPTBOT_DRAFTS_DB'],'kv_namespaces':['LOGIN_ATTEMPTS'],
          'r2_buckets':['DOCUMENT_ARTIFACTS','LEAD_RADAR_CAMPAIGN_MEDIA','MARKET_MEDIA'],
          'services':['LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE'],'ai_bindings':['AI'],'queue_producers':['AUTOMATION_QUEUE']}
for key,names in expected.items():assert sorted(prod.get(key,{}))==sorted(names),key+' differs'
assert prod['d1_databases']['GPTBOT_DRAFTS_DB']['id']=='97ef0372-d937-406f-8871-755368d9afff'
assert prod['compatibility_date']=='2024-09-23'
assert 'enable_request_signal' in prod['compatibility_flags']
for key in ['GPT_CAMPAIGN_NOTIFY_BOT_TOKEN','GPT_NOTIFY_CHAT_ID','TELEGRAM_ASSISTANT_BOT_TOKEN','GPTBOT_RUNTIME_CONFIG_JSON','STUDIO_RUNTIME_CONFIG_JSON']:
    assert key in prod['env_vars'],key+' missing'
source=(ROOT/'wrangler.toml').read_text(encoding='utf-8')
for name in ['GPTBOT_RUNTIME_CONFIG_JSON','STUDIO_RUNTIME_CONFIG_JSON']:
    declared=re.search(name+r"\s*=\s*'''([^']+)'''",source).group(1)
    assert prod['env_vars'][name]['type']=='plain_text'
    assert json.loads(prod['env_vars'][name]['value'])==json.loads(declared),name+' differs from source'
receipt={'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'status':'PASS','bindings':expected,
         'resourceBindings':sum(map(len,expected.values())),'compatibilityDate':prod['compatibility_date'],
         'notifySecretsPreserved':True,'publicRuntimeConfigsMatchSource':True,'secretBindingCount':sum(v.get('type')=='secret_text' for v in prod['env_vars'].values()),'secretValuesRead':False, 'secretBindingNamesSha256':hashlib.sha256(json.dumps(sorted(k for k,v in prod['env_vars'].items() if v.get('type')=='secret_text')).encode()).hexdigest()}
Path(os.environ.get('PSEO_BINDINGS_REPORT', str(Path(__file__).parent/'production-bindings.json'))).write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print(json.dumps(receipt))
