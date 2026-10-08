// Actual production build, offline fixtures only: no real order or provider charge.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import test from 'node:test';
import {chromium} from 'playwright-core';

const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist');
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
test('contextual purchase: first useful answer, real provider intent, dismissal, paid/off suppression', {skip:!executablePath || !fs.existsSync(path.join(dist,'ru/gpt-chat/index.html'))}, async()=>{
  const server=createServer((req,res)=>{
    const pathname=new URL(req.url??'/','http://local').pathname;
    const file=path.resolve(dist,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if(!file.startsWith(dist+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())return void res.writeHead(404).end();
    const type=({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'} as Record<string,string>)[path.extname(file)];
    res.writeHead(200,{'Content-Type':type??'application/octet-stream'}).end(fs.readFileSync(file));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address && typeof address==='object');
  const origin=`http://127.0.0.1:${address.port}`;
  const browser=await chromium.launch({executablePath,headless:true});
  const evidence:unknown[]=[];
  try {
    for(const scenario of [{locale:'ru',width:390,mode:'live'},{locale:'uz',width:390,mode:'live'},{locale:'uz',width:390,mode:'near'},{locale:'ru',width:1366,mode:'paid'},{locale:'uz',width:390,mode:'off'}] as const){
      const {locale,width,mode}=scenario;
      const ctx=await browser.newContext({viewport:{width,height:width<640?740:900}}),page=await ctx.newPage();
      const errors:string[]=[],events:Array<{type:string;detail:string}>=[],subscribes:Array<Record<string,unknown>>=[];
      let answers=0;
      page.on('pageerror',e=>errors.push(e.message));
      await ctx.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin!==origin)return route.abort();
        if(!url.pathname.startsWith('/api/'))return route.continue();
        const json=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
        if(url.pathname==='/api/auth/config')return json({turnstileRequired:false});
        if(url.pathname==='/api/gpt/account')return json({ok:true,mode:mode==='off'?null:'live',loginAvailable:false,guestCheckout:true,providers:mode==='off'?[]:['click','payme'],user:mode==='paid'?{signedIn:true,storageKey:'a'.repeat(64)}:null,
          freeLimits:{daily:15,hourly:5},terms:{ru:'/ru/oferta/',uz:'/uz/oferta/'},termsVersion:'fixture-current',pack:{priceUzs:20000,messageLimit:300,dailyLimit:50,months:1,vat:null},
          access:mode==='paid'?{order_id:'pay_'+'b'.repeat(32),ends_at:Date.now()+86400000,remaining:299,message_limit:300,dayRemaining:49}:null});
        if(url.pathname==='/api/gpt/session')return json({ok:true,sessionId:'fixture-session'});
        if(url.pathname==='/api/gpt/chat'){answers++;return json({ok:true,answer:locale==='ru'?'Полезный тестовый ответ.':'Foydali sinov javobi.',remaining:mode==='near'?2:14,hourRemaining:mode==='near'?1:4,sessionId:'fixture-session',modelUsed:'fixture'});}
        if(url.pathname==='/api/gpt/event'){events.push(route.request().postDataJSON());return json({ok:true});}
        if(url.pathname==='/api/gpt/subscribe'){
          subscribes.push(route.request().postDataJSON());
          // Verify one-tap intent without issuing an invoice or leaving the test origin.
          return json({ok:false,code:'unavailable'},503);
        }
        return json({ok:false},404);
      });
      const pathname=locale==='ru'?'/ru/gpt-chat/':'/uz/gpt-uzbek-tilida/';
      await page.goto(origin+pathname);
      await page.locator('[data-chat-presentation-open]:not(:disabled)').waitFor();
      assert.equal(await page.locator('[data-testid="chat-pack-prompt"]').count(),0,'no offer before value');
      await page.locator('.gpt-input-surface textarea').fill('Explain gravity');
      await page.locator('.gpt-send-button').click();
      await page.getByText(locale==='ru'?'Полезный тестовый ответ.':'Foydali sinov javobi.',{exact:true}).waitFor();
      assert.equal(answers,1);
      if(mode==='live' || mode==='near'){
        const card=page.locator('[data-testid="chat-pack-prompt"]');await card.waitFor();
        await card.scrollIntoViewIfNeeded();
        await page.waitForFunction(()=>document.querySelector('[data-testid="chat-pack-prompt"]')?.getBoundingClientRect().height);
        await assert.doesNotReject(async()=>{for(let i=0;i<20 && !events.some(e=>e.type==='pack_prompt_viewed');i++)await page.waitForTimeout(50);assert.ok(events.some(e=>e.type==='pack_prompt_viewed' && e.detail===(mode==='near'?'near_limit':'after_answer')));});
        assert.match((await card.innerText()).replace(/\s/g,''),/20000/);
        assert.match(await card.innerText(),/300/);assert.match(await card.innerText(),/50/);
        assert.equal(await card.locator('input[type="checkbox"]').count(),0);
        assert.equal(await card.locator('[data-provider]').count(),2);
        await page.screenshot({path:path.join(root,'reports/chat-studio-workspace-20261008',`conversion-${locale}${mode==='near'?'-near':''}.png`)});
        const provider=locale==='ru'?'click':'payme';
        await card.locator(`[data-provider="${provider}"]`).click();
        for(let i=0;i<60 && !subscribes.length;i++)await page.waitForTimeout(50);
        assert.equal(subscribes.length,1,'one tap initiates one existing checkout');
        assert.equal(subscribes[0].provider,provider);
        assert.equal(subscribes[0].acceptTerms,true);
        assert.equal(subscribes[0].termsVersion,'fixture-current');
        assert.match(String(subscribes[0].requestId),/^[0-9a-f-]{36}$/);
        assert.ok(events.some(e=>e.type==='pack_viewed' && e.detail==='after_value'));
        await page.keyboard.press('Escape');
        await card.locator('.gpt-pack-prompt-close').click();
        assert.equal(await card.count(),0);
        await page.reload();
        await page.locator('[data-chat-presentation-open]:not(:disabled)').waitFor();
        assert.equal(await page.locator('[data-testid="chat-pack-prompt"]').count(),0,'dismissal survives reload');
      }else{
        await page.waitForTimeout(150);
        assert.equal(await page.locator('[data-testid="chat-pack-prompt"]').count(),0,'paid/off visitors receive no misleading offer');
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.deepEqual(errors,[]);
      evidence.push({...scenario,answers,subscribes:subscribes.length,events});
      await ctx.close();
    }
  }finally{
    fs.mkdirSync(path.join(root,'reports/chat-studio-workspace-20261008'),{recursive:true});
    fs.writeFileSync(path.join(root,'reports/chat-studio-workspace-20261008/conversion.json'),JSON.stringify({scenarios:evidence},null,2));
    await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
