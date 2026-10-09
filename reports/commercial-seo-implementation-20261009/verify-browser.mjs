import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright-core';
const root=process.cwd(),out=path.join(root,'reports/commercial-seo-implementation-20261009');
const demoPaths=['/ru/luchshie-razrabotchiki-chat-botov-tashkent/','/ru/razrabotka-telegram-bota-tashkent/','/ru/stoimost-chat-bota/','/uz/telegram-bot-biznes-uchun/','/uz/chat-bot-narxi/','/uz/arizalarni-qabul-qiluvchi-bot/'];
const formPaths=[...demoPaths,'/ru/ai-bot-s-crm-amocrm-bitrix24/','/uz/amocrm-bitrix24-bilan-ai-bot/','/ru/razrabotka-saytov-tashkent/','/uz/sayt-yaratish/','/uz/arizalarni-avtomatlashtirish/','/ru/razrabotka-telegram-mini-app-tashkent/'];
const live=process.argv.includes('--live');
let server=null,base='https://gptbot.uz';
if(!live){
const dist=path.join(root,'dist');
server=http.createServer((req,res)=>{
 try{const u=new URL(req.url,'http://localhost');const relative=decodeURIComponent(u.pathname);let file=path.resolve(dist,'.'+relative);if(file!==dist&&!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}if(relative.endsWith('/'))file=path.join(file,'index.html');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime});fs.createReadStream(file).pipe(res);
}catch{res.writeHead(500).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
}
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
assert.ok(executablePath,'A browser is required');
const browser=await chromium.launch({executablePath,headless:true});
const report={checkedAt:new Date().toISOString(),mode:live?'production-readonly-with-intercepted-form':'local-build',productionLeadWrites:0,externalAnalyticsRequests:0,rows:[]};
try{
for(let n=0;n<formPaths.length;n++){
const pathname=formPaths[n],context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
let intercepted=0,blockedPost=0,submitted=null;
await context.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.origin===new URL(base).origin&&url.pathname==='/api/gpt/lead'){
   intercepted++;submitted=request.postDataJSON();
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,id:'lead_browser_verification_'+n,delivery:'pending'})});return;
 }
 if(!['GET','HEAD'].includes(request.method())){blockedPost++;await route.abort();return;}
 if(url.origin!==new URL(base).origin){await route.abort();return;}
 await route.continue();
});
await context.addInitScript(()=>{window.dataLayer=[];window.gtag=function(){window.dataLayer.push(arguments);};});
const page=await context.newPage();
const response=await page.goto(base+pathname,{waitUntil:'domcontentloaded',timeout:30000});
assert.equal(response.status(),200,pathname);
await page.locator('[data-lead-form] button[type=submit]').waitFor({state:'visible'});
assert.equal(await page.locator('h1').count(),1,pathname+' H1');
assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://gptbot.uz'+pathname);
assert.ok(!(await page.locator('meta[name=robots]').getAttribute('content')).includes('noindex'));
assert.equal(await page.locator('#lead-form').count(),1);
const missingFragments=await page.locator('a[href^="#"]').evaluateAll(anchors=>anchors.map(a=>a.getAttribute('href')).filter(h=>h&&h.length>1&&!document.getElementById(decodeURIComponent(h.slice(1)))));
assert.deepEqual(missingFragments,[],pathname+' missing anchors');
const overflows=[];
for(const width of [320,1280]){await page.setViewportSize({width,height:900});await page.waitForTimeout(80);const excess=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);if(excess>1)overflows.push({width,excess});}
assert.deepEqual(overflows,[],pathname+' horizontal overflow');
let demo=false;
if(demoPaths.includes(pathname)){
 assert.equal(await page.locator('#lead-demo').count(),1);
 const demoBlock=page.locator('#lead-demo');
 await demoBlock.locator('button[data-demo-build]').click();
 await page.waitForTimeout(50);
 demo=true;
 const newLeadEvents=await page.evaluate(()=>(window.dataLayer||[]).filter(e=>(e.event||e[1])==='generate_lead').length);
 assert.equal(newLeadEvents,0,'demo must not produce a lead conversion');
 assert.equal(intercepted,0,'demo must not send a lead');
 await page.setViewportSize({width:390,height:844});
 await demoBlock.screenshot({path:path.join(out,'demo-'+(pathname.startsWith('/uz/')?'uz':'ru')+'.png')});
}
await page.locator('[data-lead-form] [name=contact]').fill('@synthetic_qa');
if(await page.locator('[data-lead-form] [name=task]').count())await page.locator('[data-lead-form] [name=task]').fill('Учебная проверка формы, не настоящая заявка');
await page.locator('[data-lead-form] [name=consent]').check();
await page.locator('[data-lead-form] button[type=submit]').click();
await page.waitForFunction(()=>(window.dataLayer||[]).some(e=>(e.event||e[1])==='generate_lead'));
assert.equal(intercepted,1);
assert.equal(submitted.source,'page_form');
assert.equal(new URL(submitted.pageUrl,'https://gptbot.uz').pathname,pathname);
assert.equal(blockedPost,0,'unexpected mutating browser request');
const eventPayload=await page.evaluate(()=>JSON.stringify((window.dataLayer||[]).filter(e=>(e.event||e[1])==='generate_lead').map(e=>Array.from(e))));
assert.ok(!eventPayload.includes('synthetic_qa')&&!eventPayload.includes('Учебная проверка'),'PII in conversion');
assert.equal(new URL(page.url()).search,'','contact must not enter URL');
report.rows.push({pathname,status:response.status(),demo,formAcceptedInStub:true,checkedWidths:[320,1280],missingFragments,productionWrites:0});
await context.close();
}
report.pass=true;
} catch(error){report.pass=false;report.error=String(error);throw error;}
finally{await browser.close();if(server)await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,live?'browser-production.json':'browser-local.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({mode:report.mode,passed:report.rows.length,total:formPaths.length,pass:report.pass,error:report.error,productionWrites:0}));}
