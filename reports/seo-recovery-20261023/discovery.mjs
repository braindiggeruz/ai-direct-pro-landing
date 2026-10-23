// Send once only after exact production readback. Unknown outcomes stay pending.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const out=path.resolve('reports/seo-recovery-20261023');
const receiptPath=path.join(out,'INDEXNOW.json');
const verification=JSON.parse(fs.readFileSync(path.join(out,'PRODUCTION_READBACK.json'),'utf8'));
if(!verification.pass)throw new Error('Production acceptance required');
const live=await (await fetch('https://gptbot.uz/gptbot-release.json',{signal:AbortSignal.timeout(20000)})).json();
if(live.commit!==verification.sourceCommit||live.artifactSha256!==verification.artifactSha256)throw new Error('Release changed');
if(fs.existsSync(receiptPath))throw new Error('Receipt exists; reconcile it, never blindly retry');
const urls=JSON.parse(fs.readFileSync(path.join(out,'CHANGED_URLS.json'),'utf8'));
if(!urls.length||urls.length>30||new Set(urls).size!==urls.length||urls.some(u=>new URL(u).origin!=='https://gptbot.uz'))throw new Error('Invalid URL batch');
let key;
for(const file of fs.readdirSync('public')) {
 const stem=file.replace(/\.txt$/,'');
 if(!file.endsWith('.txt')||!/^[-A-Za-z0-9]{8,128}$/.test(stem))continue;
 if(fs.readFileSync(path.join('public',file),'utf8').trim()!==stem)continue;
 const res=await fetch('https://gptbot.uz/'+file,{signal:AbortSignal.timeout(20000)});
 if(res.ok&&(await res.text()).trim()===stem){key=stem;break;}
}
if(!key)throw new Error('Existing public IndexNow key not verified');
const source=fs.readFileSync('functions/lib/indexnow/submit-engine.ts','utf8');
const endpoint=source.match(/export const INDEXNOW_ENDPOINT = '([^']+)'/)?.[1];
if(!endpoint)throw new Error('Existing endpoint missing');
const record={attemptedAt:new Date().toISOString(),release:live.commit,urls,keyValidated:true,keySha256:createHash('sha256').update(key).digest('hex'),status:'pending_unknown',googleRecrawlConfirmed:false};
fs.writeFileSync(receiptPath,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
try {
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:'gptbot.uz',key,keyLocation:'https://gptbot.uz/'+key+'.txt',urlList:urls}),signal:AbortSignal.timeout(40000)});
 record.httpStatus=response.status;
 record.pendingKeyValidation=response.status===202;
 record.status=[200,202].includes(response.status)?'accepted':'rejected';
 record.response=(await response.text()).slice(0,300);
} catch(error){record.error=error.message;}
fs.writeFileSync(receiptPath,JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({release:record.release,status:record.status,httpStatus:record.httpStatus,urlCount:urls.length,googleRecrawlConfirmed:false}));
if(record.status!=='accepted')process.exitCode=1;
