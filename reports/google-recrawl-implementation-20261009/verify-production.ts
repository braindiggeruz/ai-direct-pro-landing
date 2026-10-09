import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { hasDiscoveryCachePolicy } from '../../scripts/feed-data';
const root=process.cwd(),out=path.join(root,'reports/google-recrawl-implementation-20261009');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const base='https://gptbot.uz';
const feedPaths=['/ru/blog/feed.xml','/uz/blog/feed.xml','/sitemap.xml','/sitemap-updates.xml'];
const before=process.argv.includes('--before');
const rows=[];
if(before){
 for(const pathname of feedPaths){const r=await fetch(base+pathname,{redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,pathname);rows.push({path:pathname,status:r.status,etag:r.headers.get('etag'),cacheControl:r.headers.get('cache-control'),sha256:hash(Buffer.from(await r.arrayBuffer()))});}
 fs.writeFileSync(path.join(out,'discovery-before.json'),JSON.stringify({checkedAt:new Date().toISOString(),rows},null,2)+'\n');console.log(JSON.stringify({before:rows.length}));
}else{
 const expected=JSON.parse(fs.readFileSync(path.join(root,'dist/gptbot-release.json'),'utf8'));
 const response=await fetch(base+'/gptbot-release.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);assert.deepEqual(await response.json(),expected);
 const old=JSON.parse(fs.readFileSync(path.join(out,'discovery-before.json'),'utf8')).rows as Array<{path:string;etag:string|null;sha256:string}>;
 for(const pathname of [...feedPaths,'/updates/atom.xml']){
  const r=await fetch(base+pathname,{redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,pathname);
  const body=Buffer.from(await r.arrayBuffer()),local=fs.readFileSync(path.join(root,'dist',pathname.slice(1)));
  assert.ok(body.equals(local),pathname+' bytes');assert.ok(hasDiscoveryCachePolicy(r.headers.get('cache-control')),pathname+' cache');
  const type=pathname.includes('atom.xml')?'application/atom+xml':pathname.includes('feed.xml')?'application/rss+xml':'application/xml';
  assert.ok((r.headers.get('content-type')||'').startsWith(type),pathname+' type');
  assert.ok(!/noindex/i.test(r.headers.get('x-robots-tag')||''));
  const previous=old.find(x=>x.path===pathname);let oldEtagStatus:number|null=null;
  if(previous?.etag&&previous.sha256!==hash(body)){
   const conditional=await fetch(base+pathname,{headers:{'If-None-Match':previous.etag},signal:AbortSignal.timeout(20000)});
   oldEtagStatus=conditional.status;assert.equal(oldEtagStatus,200,pathname+' stale304');assert.ok(Buffer.from(await conditional.arrayBuffer()).equals(local));
  }
  rows.push({path:pathname,status:200,sha256:hash(body),etag:r.headers.get('etag'),cacheControl:r.headers.get('cache-control'),contentType:r.headers.get('content-type'),oldEtagStatus});
 }
 const pages=['/ru/luchshie-razrabotchiki-chat-botov-tashkent/','/ru/razrabotka-telegram-bota-tashkent/','/ru/stoimost-chat-bota/','/uz/telegram-bot-biznes-uchun/','/uz/arizalarni-qabul-qiluvchi-bot/','/uz/chat-bot-narxi/','/ru/ai-bot-s-crm-amocrm-bitrix24/','/uz/amocrm-bitrix24-bilan-ai-bot/','/ru/razrabotka-saytov-tashkent/','/uz/sayt-yaratish/','/uz/arizalarni-avtomatlashtirish/','/ru/razrabotka-telegram-mini-app-tashkent/',...JSON.parse(fs.readFileSync(path.join(out,'content-changes.json'),'utf8')).map((v:{url:string})=>v.url)];
 const htmlRows=[];
 for(let i=0;i<pages.length;i+=3){htmlRows.push(...await Promise.all(pages.slice(i,i+3).map(async pathname=>{
  const r=await fetch(base+pathname,{redirect:'error',signal:AbortSignal.timeout(20000)});const html=await r.text();assert.equal(r.status,200,pathname);
  assert.ok(html.includes('rel="canonical" href="'+base+pathname+'"'),pathname+' canonical');assert.equal((html.match(/<h1[\s>]/g)||[]).length,1,pathname+' h1');
  assert.ok(!/noindex/i.test((html.match(/<meta name="robots" content="([^"]+)"/)||[])[1]||''));
  assert.ok(!/noindex/i.test(r.headers.get('x-robots-tag')||''));return {path:pathname,status:200,canonical:true,indexable:true};
 })));}
 const report={checkedAt:new Date().toISOString(),manifest:expected,manifestExactMatch:true,discoveryFiles:rows,htmlPages:htmlRows,googleRecrawlConfirmed:false};
 fs.writeFileSync(path.join(out,'production-readback.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({manifestExact:true,discoveryFiles:rows.length,htmlPages:htmlRows.length}));
}