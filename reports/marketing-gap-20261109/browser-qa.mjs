import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
const root=path.resolve(import.meta.dirname,'../..'), dist=path.join(root,'dist');
const out=path.resolve(root,'../evidence/marketing-release-20261109/browser');fs.mkdirSync(out,{recursive:true});
const plan=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'PLAN.json'),'utf8'));
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json','.csv':'text/csv; charset=utf-8'};
const server=createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');let f=path.resolve(dist,'.'+decodeURIComponent(u.pathname));
  if(!f.startsWith(dist+path.sep))return res.writeHead(403).end();
  if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
  if(!fs.existsSync(f))return res.writeHead(404).end();
  res.setHeader('content-type',mime[path.extname(f)]??'application/octet-stream');res.end(fs.readFileSync(f));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser=await chromium.launch({executablePath,headless:true,args:['--disable-gpu']});
const results=[];
const functionalOnly = process.argv.includes('--functional');
async function fixture(width,js=true){
 const context=await browser.newContext({viewport:{width,height:850},javaScriptEnabled:js,reducedMotion:'reduce',serviceWorkers:'block'});
 const requests=[],errors=[],missing=[];
 await context.route('**/*',route=>{
  requests.push({url:route.request().url(),body:route.request().postData()});
  const u=new URL(route.request().url());
  if(u.origin!==origin)return route.abort();
  if(u.pathname.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:'{"ok":false,"error":"local_qa_only"}'});
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)missing.push(r.url());});
 return {context,page,requests,errors,missing};
}
async function run(name,fn){try{results.push({name,status:'PASS',detail:await fn()});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
try{
 for(const width of functionalOnly ? [] : [360,390,1440]){
  const f=await fixture(width);
  for(const item of plan.pages)await run(`${item.id} ${width}px`,async()=>{
   f.errors.length=0;f.missing.length=0;const r=await f.page.goto(origin+item.path,{waitUntil:'networkidle'});assert.equal(r.status(),200);
   assert.equal(await f.page.locator('h1').count(),1);
   const dim=await f.page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,bg:getComputedStyle(document.body).backgroundColor}));
   assert.ok(dim.scroll<=dim.width+2,JSON.stringify(dim));
   const rgb=dim.bg.match(/\d+/g)?.slice(0,3).map(Number);assert.ok(rgb&&Math.max(...rgb)<90,'Expected shared dark theme: '+dim.bg);
   assert.deepEqual(f.errors,[]);assert.deepEqual(f.missing,[]);
   if(['N04','N10','E01','N05'].includes(item.id)&&width!==390)await f.page.screenshot({path:path.join(out,`${item.id}-${width}.png`),fullPage:false});
   return dim;
  });
  await f.context.close();
 }
 await run('UTM interaction, replacement, validation, clipboard fallback and no input transmission',async()=>{
  const f=await fixture(390);const p=f.page;await p.goto(origin+'/ru/utm-generator/',{waitUntil:'networkidle'});
  await p.locator('[name=address]').fill('https://example.com/course?sku=1&utm_source=old&utm_content=stale#price');
  await p.locator('[name=campaign]').fill('private_qa_marker_916');await p.locator('[name=content]').fill('');
  await p.getByRole('button',{name:'Создать ссылку',exact:true}).click();
  let u=new URL(await p.locator('[data-tool-output]').inputValue());assert.equal(u.hash,'#price');assert.equal(u.searchParams.get('sku'),'1');assert.equal(u.searchParams.get('utm_source'),'facebook');assert.equal(u.searchParams.has('utm_content'),false);
  await f.context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
  await p.getByRole('button',{name:'Скопировать ссылку',exact:true}).click();
  await p.waitForFunction(()=>/скопирована|ручному/.test(document.querySelector('[data-tool-status]').textContent));
  assert.match(await p.locator('[data-tool-status]').innerText(),/скопирована|ручному/);
  await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('QA denied'))}}));
  await p.getByRole('button',{name:'Скопировать ссылку',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('[data-tool-status]').textContent.includes('ручному'));
  await p.locator('[name=replace]').uncheck();assert.equal(await p.locator('[data-tool-output]').inputValue(),'');
  await p.getByRole('button',{name:'Создать ссылку',exact:true}).click();u=new URL(await p.locator('[data-tool-output]').inputValue());assert.equal(u.searchParams.get('utm_source'),'old');
  await p.locator('[name=address]').fill('javascript:alert(1)');await p.getByRole('button',{name:'Создать ссылку',exact:true}).click();assert.equal(await p.locator('[data-tool-output]').inputValue(),'');assert.equal(await p.locator('[data-tool-copy]').isDisabled(),true);
  await p.locator('[name=address]').fill('https://t.me/examplebot');await p.getByRole('button',{name:'Создать ссылку',exact:true}).click();assert.match(await p.locator('[data-tool-status]').innerText(),/не создают аналитику/);
  assert.ok(!JSON.stringify(f.requests).includes('private_qa_marker_916'));assert.deepEqual(f.errors,[]);await f.context.close();
 });
 await run('ROAS browser calculation, zero expense, zero/empty margin',async()=>{
  const f=await fixture(360);const p=f.page;await p.goto(origin+'/ru/roas-kalkulyator/',{waitUntil:'networkidle'});
  await p.getByRole('button',{name:'Рассчитать',exact:true}).click();let v=await p.locator('[data-tool-output]').inputValue();assert.match(v,/300%/);assert.match(v,/400\s000/);
  await p.locator('[name=spend]').fill('0');await p.getByRole('button',{name:'Рассчитать',exact:true}).click();assert.equal(await p.locator('[data-tool-output]').inputValue(),'');assert.match(await p.locator('[data-tool-status]').innerText(),/больше 0/);
  await p.locator('[name=spend]').fill('2000000');await p.locator('[name=margin]').fill('0');await p.getByRole('button',{name:'Рассчитать',exact:true}).click();assert.match(await p.locator('[data-tool-output]').inputValue(),/недостижим/);
  await p.locator('[name=margin]').fill('');await p.getByRole('button',{name:'Рассчитать',exact:true}).click();assert.doesNotMatch(await p.locator('[data-tool-output]').inputValue(),/Порог/);assert.deepEqual(f.errors,[]);await f.context.close();
 });
 for(const url of ['/ru/utm-generator/','/ru/roas-kalkulyator/','/uz/blog/seo-nima/','/ru/blog/kontent-plan-dlya-uchebnogo-tsentra/'])await run('No JavaScript '+url,async()=>{
  const f=await fixture(390,false);await f.page.goto(origin+url);assert.ok((await f.page.locator('body').innerText()).length>3000);
  if(url.includes('/blog/')){const a=f.page.locator('a[download]').first();assert.ok(await a.count());const href=await a.getAttribute('href');const r=await f.context.request.get(origin+href);assert.equal(r.status(),200);assert.ok((await r.body()).length>100);}
  else assert.equal(await f.page.locator('[data-tool-controls]').isVisible(),false);
  await f.context.close();
 });
}finally{await browser.close();server.close();}
fs.writeFileSync(path.join(out,functionalOnly?'results-functional.json':'results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL')},null,2));
if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
