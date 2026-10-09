import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright-core';
const root=process.cwd(),out=path.join(root,'reports/google-recrawl-implementation-20261009'),dist=path.join(root,'dist');
const changes=JSON.parse(fs.readFileSync(path.join(out,'content-changes.json'),'utf8'));
const live=process.argv.includes('--live');
let server,base='https://gptbot.uz';
if(!live){
 server=http.createServer((req,res)=>{
  const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=path.resolve(dist,'.'+p);if(file!==dist&&!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
  if(p.endsWith('/'))file=path.join(file,'index.html');
  const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
  if(!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':mime});fs.createReadStream(file).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
}
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser=await chromium.launch({executablePath,headless:true});
const report={checkedAt:new Date().toISOString(),mode:live?'production':'local',rows:[],externalWrites:0};
try{
 for(const [n,change] of changes.entries()){
  const context=await browser.newContext({viewport:{width:320,height:900},reducedMotion:'reduce'});
  await context.route('**/*',async route=>{const request=route.request();if(new URL(request.url()).origin!==new URL(base).origin||!['GET','HEAD'].includes(request.method())){await route.abort();return;}await route.continue();});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(base+change.url,{waitUntil:'networkidle',timeout:30000});
  assert.equal(response.status(),200);assert.equal(await page.locator('h1').count(),1);
  assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://gptbot.uz'+change.url);
  const marker=['booking-example','format-example','handoff-example'][n];
  assert.equal(await page.locator('#'+marker).count(),1);
  for(const width of [320,1280]){
   await page.setViewportSize({width,height:900});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1,change.url+' overflow '+width);
  }
  const links=await page.locator('a[href*="#lead-demo"]').evaluateAll(a=>a.map(e=>e.getAttribute('href')));assert.ok(links.length>0);
  assert.deepEqual(errors,[]);
  if(n===0){await page.setViewportSize({width:390,height:844});await page.locator('#'+marker).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,live?'article-production.png':'article-local.png')});}
  report.rows.push({url:change.url,status:200,widths:[320,1280],demoLinks:links,scriptErrors:errors});await context.close();
 }report.pass=true;
}catch(e){report.pass=false;report.error=String(e);throw e;}
finally{await browser.close();if(server)await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,live?'browser-production.json':'browser-local.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}