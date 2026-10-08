// The real built chat in Chromium; all APIs/payments/AI are offline fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { publicPlans } from '../functions/lib/studio/checkout';
import { TERMS_PLAN } from '../functions/lib/studio/plans';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const paths = { ru: '/ru/gpt-chat/', uz: '/uz/gpt-uzbek-tilida/' };
const orderId = 'stu_' + 'a'.repeat(32);
const jobId = 'sj_' + 'b'.repeat(32);

test('built RU/UZ workspace: document edits, PPTX, locale regression, reload, mobile focus and exact payment return', { skip: !browserPath || !fs.existsSync(path.join(DIST, 'ru/gpt-chat/index.html')) }, async () => {
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://local').pathname;
    const file = path.resolve(DIST, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const evidence: unknown[] = [];
  const edition = Object.keys(TERMS_PLAN)[0];
  try {
    for (const locale of ['ru', 'uz'] as const) for (const width of [320, 360, 390, 1366]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 640 ? 740 : 900 }, acceptDownloads: true, reducedMotion: width===390?'reduce':'no-preference' });
      const page = await ctx.newPage();
      const errors: string[] = [], requests: string[] = [], unexpected: string[] = [];
      let created = 0, fullCreated = 0, requestedSlides = 6, checkouts = 0, paid = false, returnPath = '';
      const events:Record<string,unknown>[]=[];
      page.on('pageerror', error => errors.push(error.message));
      await ctx.addInitScript({ content: "window.turnstile = { render: function(el, options) { setTimeout(function() { options.callback('offline-fixture'); }, 0); return 'test-widget'; }, remove: function() {}, reset: function() {} };" });
      const me = () => ({ ok: true, identity: true, free: { presentation: { left: 1 - created, limit: 1 }, photo: { left: 0, limit: 0 }, resetsAt: '2026-10-08T00:00:00Z' }, account: { signedIn: paid },
        entitlements: paid ? [{ id: 'fixture', orderId, plan: 'kunlik', startsAt: '2026-10-07T00:00:00Z', endsAt: '2026-10-08T00:00:00Z', presentationsLeft: 1-fullCreated, presentationsLimit: 1, photosLeft: 0, photosLimit: 0, regenAvailable: [] }] : [],
        latestOrder: checkouts ? { id: orderId, state: paid ? 'paid' : 'pending', plan: 'kunlik', provider: locale === 'ru' ? 'click' : 'payme', amountUzs: 5900, createdAt: '2026-10-07T00:00:00Z', paidAt: paid ? '2026-10-07T01:00:00Z' : null, paymentNumber: null, cancellable: !paid } : null, receipts: [] });
      await ctx.route('**/*', async route => {
        const url = new URL(route.request().url());
        requests.push(url.pathname);
        const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        if (url.hostname === 'my.click.uz' || url.hostname === 'checkout.paycom.uz') {
          paid = true;
          return route.fulfill({ status: 302, headers: { Location: origin + returnPath + '?pay=return&product=studio' }, body: '' });
        }
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (url.pathname === '/api/gpt/account') return json({ ok: true, loginAvailable: false, mode: null, providers: [], user: null, terms: { ru: null, uz: null }, termsVersion: null, freeLimits: { daily: 15, hourly: 5 }, botHandoff: false });
        if (url.pathname === '/api/auth/config') return json({ turnstileRequired: false });
        if (url.pathname.endsWith('/event')) { if(url.pathname==='/api/studio/event') events.push(route.request().postDataJSON());return json({ ok: true }); }
        if (url.pathname === '/api/studio/config') return json({ ok: true, tools: { freeDeck: true, fullDeck: true, photo: false }, free: { presentation: 1, photo: 0, resetsAt: '2026-10-08T00:00:00Z' }, shapes: { free: { minSlides: 4, maxSlides: 6, images: 2, notes: false, palettes: 1 }, full: { minSlides: 6, maxSlides: 12, images: 8, notes: true, palettes: 3 } }, payments: { mode: 'live', providers: ['click', 'payme'] }, plans: publicPlans(edition), termsVersion: edition, terms: { ru: '/ru/oferta/', uz: '/uz/oferta/' }, aiLabel: true, turnstileSiteKey: 'fixture' });
        if (url.pathname === '/api/studio/me') return json(me());
        if (url.pathname === '/api/studio/presentations') {
          created++;
          const body=route.request().postDataJSON();
          requestedSlides=body.slides;
          if(body.shape==='full') {
            assert.ok(paid,'paid generation requires server-issued rights');
            fullCreated++;
            return json({ok:true,jobId:'sj_'+'c'.repeat(32),source:'entitlement',shape:{slides:requestedSlides,images:0,notes:true,palette:body.palette,parts:4},next:'outline',expiresAt:'2026-10-10T00:00:00Z'});
          }
          return json({ ok: true, jobId, source: 'free', shape: { slides: 6, images: 0, notes: false, palette: 1, parts: 1 }, next: 'slides', expiresAt: '2026-10-08T00:00:00Z' });
        }
        if(url.pathname.endsWith('/outline')) return json({ok:true,outline:{title:'Full Space',subtitle:'Fixture',slides:Array.from({length:requestedSlides},(_,i)=>({index:i+1,title:`Slide ${i+1}`,point:'A fact'}))},sig:'fixture-outline-signature',images:[],parts:4});
        if(url.pathname.endsWith('/slides') && route.request().postDataJSON().part){
          const part=route.request().postDataJSON().part;
          return json({ok:true,part,deck:{title:'Full Space',subtitle:'Fixture',slides:Array.from({length:requestedSlides},(_,i)=>({index:i+1,title:`Slide ${i+1}`,bullets:['One fact','Another fact'],notes:'Speaker note fixture',layout:'title-bullets'})).slice((part-1)*3,part*3)},images:[],done:true});
        }
        if (url.pathname.endsWith('/slides')) return json({ ok: true, deck: { title: 'Offline Space', subtitle: 'Fixture', slides: Array.from({ length: 6 }, (_, i) => ({ index: i + 1, title: `Slide ${i + 1}`, bullets: ['One test fact', 'Another fact', 'Third fact'], layout: 'title-bullets' })) }, images: [] });
        if (url.pathname === '/api/studio/checkout') {
          checkouts++;
          const body = route.request().postDataJSON();
          returnPath = body.returnPath;
          assert.equal(body.provider, locale === 'ru' ? 'click' : 'payme');
          return json({ ok: true, mode: 'checkout', orderId, provider: body.provider, checkoutUrl: body.provider === 'click' ? 'https://my.click.uz/services/pay/?fixture=1' : 'https://checkout.paycom.uz/fixture' });
        }
        unexpected.push(url.pathname);
        return route.fulfill({ status: 500, body: '{}' });
      });
      await page.goto(origin + paths[locale]);
      await page.locator('[data-chat-presentation-open]:not(:disabled)').waitFor();
      assert.equal(requests.some(url => /chat-presentation|pptxgen|\/api\/studio/.test(url)), false, 'ordinary chat downloads no tool, export or Studio data');
      await page.locator('[data-chat-presentation-open]').first().click();
      await page.locator('[data-chat-artifact]').waitFor();
      const card = page.locator('[data-chat-presentation]:visible');
      const input = page.locator('.gpt-input-surface textarea');
      const tabs = page.locator('.gpt-presentation-tabs');
      await input.fill('Space and planets');
      await page.locator('.gpt-send-button').click();
      await card.locator('.gpt-draft-topic', {hasText:'Space and planets'}).waitFor();
      assert.equal(created,0,'topic confirmation does not start or charge generation');
      const offer=card.locator('[data-studio-offer]');
      await offer.locator('[data-offer-plan="kunlik"] button').waitFor();
      assert.equal(await offer.locator('[data-offer-plan]').first().getAttribute('data-offer-plan'),'kunlik','single-task offer starts with daily price');
      assert.match(await offer.innerText(),/5[\s\u00a0]*900/);
      assert.match(await offer.innerText(),/3[\s\u00a0]*990/);
      await offer.locator('[data-offer-plan="kunlik"] button').click();
      const purchaseSheet=page.locator('dialog[open].gpt-presentation-sheet');
      await purchaseSheet.locator('[data-studio-checkout]').waitFor();
      assert.equal(await purchaseSheet.locator('[data-studio-plan="kunlik"]').getAttribute('aria-pressed'),'true','explicit CTA selects the intended package');
      assert.equal(await purchaseSheet.evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'pricing sheet has no horizontal overflow');
      assert.equal(checkouts,0,'offer viewing and selection do not create an order');
      await purchaseSheet.locator('.gpt-sheet-header .gpt-workspace-icon').click();
      await offer.locator('[aria-expanded]').click();
      await offer.locator('.gpt-offer-example .gpt-slide-canvas').waitFor();
      assert.equal(await offer.locator('.gpt-offer-palettes button').count(),3);
      await offer.locator('.gpt-offer-palettes button').last().click();
      assert.equal(created,0,'example and palette comparison call no AI');
      const offerGeometry=await offer.evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+1,buttons:[...el.querySelectorAll('.gpt-offer-buy,.gpt-offer-secondary,.gpt-offer-palettes button')].map(button=>button.getBoundingClientRect().height)}));
      assert.equal(offerGeometry.overflow,false);assert.ok(offerGeometry.buttons.every(height=>height>=44));
      const contrast=await offer.locator('.gpt-offer-comparison small').first().evaluate(el=>{
        const values=[getComputedStyle(el).color,getComputedStyle(el.parentElement!).backgroundColor].map(color=>{
          const rgb=(color.match(/[\d.]+/g)??[]).slice(0,3).map(Number).map(n=>{const x=n/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});
          return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
        });
        return (Math.max(...values)+.05)/(Math.min(...values)+.05);
      });
      assert.ok(contrast>=4.5,`caption contrast ${contrast} >= WCAG AA`);
      if(width===360||width===1366) { const shotDir=path.join(ROOT,'reports/studio-monetization-20261008');fs.mkdirSync(shotDir,{recursive:true});await offer.locator('.gpt-offer-purchases').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(shotDir,`offer-${locale}-${width}.png`)}); }
      await offer.locator('[aria-expanded]').click();
      await card.locator('.gpt-workspace-footer > .gpt-workspace-primary').click();
      try { await card.locator('.gpt-slide-canvas').waitFor({timeout:10000}); }
      catch { assert.fail(JSON.stringify({step:'free-result',locale,width,created,errors,unexpected,requests,text:await page.locator('[data-chat-presentation]').innerText()})); }
      assert.equal(created,1);
      assert.equal(await card.locator('.gpt-slide-filmstrip button').count(),8,'six content slides, cover, AI label');
      assert.equal(await page.locator('[data-testid="ai-console"]').getAttribute('data-presentation-view'),'slides');
      if(width<1180) assert.equal(await input.isVisible(),false,'no competing composer in Slides');
      else assert.equal(await input.isVisible(),true,'desktop has chat beside document');
      assert.equal(await page.locator('.gpt-account-trigger').isVisible(),false,'text-chat purchase cannot masquerade as Studio');
      // The actual title changes in preview, persisted result and the ZIP export.
      await card.locator('.gpt-slide-navigation .gpt-workspace-button').click();
      const sheet=page.locator('dialog[open].gpt-presentation-sheet');
      await sheet.locator('input').fill('Edited Space');
      await sheet.locator('form button').click();
      await card.locator('h2',{hasText:'Edited Space'}).waitFor();
      await page.waitForFunction(()=>document.activeElement===document.querySelector('[data-chat-presentation]:not([hidden]) .gpt-slide-navigation .gpt-workspace-button'));
      assert.equal(created,1,'local edit makes no provider call');
      const download=page.waitForEvent('download');
      await card.locator('[data-studio-download] button').click();
      const downloaded=await download, file=await downloaded.path();
      assert.ok(file);
      const bytes=fs.readFileSync(file);
      assert.equal(bytes.subarray(0,2).toString(),'PK');
      assert.ok(bytes.length>10000,'real PPTX ZIP from the built browser application');
      const { default: JSZip }=await import('../apps/studio/node_modules/jszip/lib/index.js');
      const zip=await JSZip.loadAsync(bytes);
      assert.match(await zip.file('ppt/slides/slide1.xml')!.async('string'),/Edited Space/);
      const geometry=await card.evaluate(el=>{
        const r=el.getBoundingClientRect(),footer=el.querySelector('.gpt-workspace-footer')!.getBoundingClientRect();
        return {width:r.width,overflow:document.documentElement.scrollWidth>innerWidth,footerBottom:footer.bottom,height:innerHeight};
      });
      assert.equal(geometry.overflow,false,`${locale}/${width}: no horizontal document overflow`);
      assert.ok(geometry.footerBottom<=geometry.height+1,`${locale}/${width}: primary action fits viewport`);
      if(width<1180){
        const h=await tabs.locator('button').first().evaluate(el=>el.getBoundingClientRect().height);
        assert.ok(h>=44,'mobile tabs have 44px touch targets');
        await tabs.locator('button').first().click();
      }
      await input.fill(locale==='ru'?'сократи слайд 3':'3 slaydni qisqartir');
      await page.locator('.gpt-send-button').click();
      await page.waitForFunction(()=>document.querySelector('[data-chat-artifact] small')?.textContent?.includes('3'));
      assert.equal(created,1,'document command neither spends a generation nor a chat response');
      if(width<1180) await tabs.locator('button').last().click();
      // Closing and reload restore references, never automatically expand old forms.
      await card.locator('.gpt-workspace-header .gpt-workspace-icon').click();
      assert.equal(await input.isVisible(),true);
      await page.reload();
      await page.locator('[data-chat-artifact]').waitFor();
      assert.equal(await page.locator('[data-testid="ai-console"]').getAttribute('data-presentation'),null);
      assert.equal(await page.locator('[data-chat-presentation]:visible').count(),0);
      await page.locator('[data-chat-artifact]').first().click();
      await card.locator('h2',{hasText:'Edited Space'}).waitFor();
      await card.locator('.gpt-slide-canvas').waitFor();
      assert.equal(created,1,'reload never regenerates or consumes an additional unit');
      if(width===360 || width===1366){
        const shots=path.join(ROOT,'reports/studio-monetization-20261008');
        fs.mkdirSync(shots,{recursive:true});
        await page.screenshot({path:path.join(shots,`${locale}-${width}.png`)});
      }
      if(width===360){
        await page.locator('[data-testid="studio-account-trigger"]').click();
        await sheet.locator('[data-studio-plan="kunlik"]').click();
        if(locale==='uz') await sheet.locator('[data-studio-checkout] input[value="payme"]').check();
        const navigation=page.waitForURL('**/*pay=return*');
        await sheet.locator('[data-studio-checkout] button[type="submit"]').click();
        try { await navigation; }
        catch { assert.fail(JSON.stringify({step:'checkout-return',locale,width,checkouts,errors,unexpected,text:await sheet.innerText()})); }
        await page.locator('[data-studio-pay-return="paid"]').waitFor();
        assert.equal(returnPath,paths[locale]);
        await card.locator('h2',{hasText:'Edited Space'}).waitFor();
        await page.locator('[data-testid="studio-account-trigger"]',{hasText:locale==='ru'?'Презентации: 1':'Taqdimotlar: 1'}).waitFor();
        assert.equal(checkouts,1);
        assert.equal(created,1,'return restores the file without an automatic paid launch');
        // Rights unlock an explicit upgrade confirmation, never a second checkout.
        await card.locator('.gpt-workspace-footer > .gpt-workspace-button').click();
        await sheet.locator('[data-studio-upgrade-confirm]').waitFor();
        assert.equal(created,1);
        assert.equal(checkouts,1);
        await sheet.locator('[data-studio-upgrade-confirm]').evaluate(el=>{(el as HTMLButtonElement).click();(el as HTMLButtonElement).click();});
        await card.locator('h2',{hasText:'Full Space'}).waitFor();
        assert.equal(fullCreated,1,'double click cannot create two paid jobs');
        assert.equal(created,2,'one free and one explicitly confirmed paid launch');
        assert.equal(await card.locator('.gpt-slide-filmstrip button').count(),14);
        const fullDownload=page.waitForEvent('download');
        await card.locator('[data-studio-download] button').click();
        const fullZip=await JSZip.loadAsync(fs.readFileSync((await (await fullDownload).path())!));
        assert.match(await fullZip.file('ppt/notesSlides/notesSlide2.xml')!.async('string'),/Speaker note fixture/);
      }
      if(width===390){
        await page.goto(origin+paths[locale]+'?tool=presentation');
        await page.waitForFunction(()=>document.querySelectorAll('[data-chat-artifact]').length===2);
        if(width<1180) await page.locator('.gpt-presentation-tabs button').last().click();
        await page.locator('[data-chat-presentation]:visible').waitFor();
        assert.equal(await page.locator('[data-chat-presentation]:visible').count(),1,'one selected editor, two compact references');
        assert.equal(created,1,'advertising entry only opens a draft');
        const repeatedOffer=page.locator('[data-chat-presentation]:visible [data-studio-offer]');
        await repeatedOffer.locator('[data-offer-plan]').first().waitFor();
        assert.equal(await repeatedOffer.locator('[data-offer-plan]').first().getAttribute('data-offer-plan'),'oylik','repeat-project intent recommends monthly');
      }
      // Actual language links both ways with populated presentation history.
      const other=locale==='ru'?'uz':'ru';
      await page.locator(`.gpt-header a[href="${paths[other]}"]`).click();
      await page.locator('[data-chat-presentation-open]:not(:disabled)').waitFor();
      assert.equal(new URL(page.url()).pathname,paths[other]);
      assert.equal(await page.locator('[data-testid="ai-console"]').getAttribute('data-presentation'),null);
      assert.equal(await page.locator('[data-chat-presentation]:visible').count(),0,'language switch opens ordinary chat');
      await page.locator(`.gpt-header a[href="${paths[locale]}"]`).click();
      await page.locator('[data-chat-artifact]').first().waitFor();
      assert.equal(await page.locator('[data-chat-presentation]:visible').count(),0,'returning to locale leaves saved artifacts collapsed');
      assert.deepEqual(unexpected,[]);
      assert.deepEqual(errors,[]);
      assert.equal(requests.includes('/api/gpt/chat'),false,'presentation operations use no ordinary text model');
      assert.ok(events.some(event=>event.type==='studio_mode_entered'));
      assert.ok(events.some(event=>event.type==='studio_upgrade_selected'&&event.detail==='kunlik'));
      assert.ok(events.some(event=>event.type==='studio_upgrade_viewed'));
      assert.ok(events.some(event=>event.type==='studio_download_clicked'));
      assert.equal(events.some(event=>'topic' in event||'userId' in event),false);
      evidence.push({ locale, width, geometry, offerGeometry, created, checkouts, bytes: bytes.length, eventTypes:[...new Set(events.map(event=>event.type))] });
      await ctx.close();
    }
  } finally {
    fs.mkdirSync(path.join(ROOT, 'reports/studio-monetization-20261008'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'reports/studio-monetization-20261008/browser.json'), JSON.stringify({ scenarios: evidence }, null, 2));
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
