import fs from 'node:fs';
import dns from 'node:dns/promises';
import {createHash} from 'node:crypto';
const dir = new URL('./', import.meta.url);
const base = 'https://gptbot.uz';
const addresses = await dns.lookup('gptbot.uz', {all:true});
if(addresses.some(({address:a})=>/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1$|f[cd]|fe80)/i.test(a))) throw Error('Non-public DNS');
const attr=(s,k)=>s.match(new RegExp(`(?:^|\\s)${k}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,'i'))?.slice(1).find(x=>x!==undefined)||'';
const text=s=>s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const tags=(s,t)=>[...s.matchAll(new RegExp(`<${t}\\b[^>]*>`,'gi'))].map(m=>m[0]);
const save=(name,data)=>fs.writeFileSync(new URL(name,dir),JSON.stringify(data,null,2)+'\n');
async function get(url){
 if(new URL(url).origin!==base)throw Error('Off-host URL refused');
 const t=Date.now();
 try{const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'GPTBot-owner-technical-audit/1.0'}});return {url,status:r.status,headers:Object.fromEntries(r.headers),ms:Date.now()-t,body:await r.text()};}
 catch(e){return {url,status:0,error:e.message,ms:Date.now()-t,body:''};}
}
const robots=await get(base+'/robots.txt');
fs.writeFileSync(new URL('robots.txt',dir),robots.body);
const wildcard=robots.body.split(/User-agent:\s*\*/i)[1]||'';
const disallowed=[...wildcard.matchAll(/^Disallow:\s*(\S+)/gm)].map(m=>m[1]);
const allowed=u=>!disallowed.some(p=>new URL(u).pathname.startsWith(p));
const smaps=[];
for(const p of ['/sitemap.xml','/sitemap-new.xml','/sitemap-priority.xml']){const r=await get(base+p);smaps.push({...r,body:undefined,urls:[...r.body.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1])});}
save('sitemaps.json',smaps);
const urls=[...new Set(smaps.flatMap(x=>x.urls))];
if(urls.length>288)throw Error('Scope ceiling exceeded: '+urls.length);
const pages=[];
async function batches(items,fn){for(let i=0;i<items.length;i+=5){await Promise.all(items.slice(i,i+5).map(fn));if(i+5<items.length)await new Promise(r=>setTimeout(r,1000));if(i%50===0)console.log('progress',i,items.length);}}
await batches(urls,async url=>{
 if(!allowed(url)){pages.push({url,blocked:true});return;}
 const r=await get(url),html=r.body,head=html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1]||'',links=tags(head,'link'),metas=tags(head,'meta');
 const meta=n=>metas.filter(s=>attr(s,'name').toLowerCase()===n).map(s=>attr(s,'content'));
 const jsonld=[...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m=>{try{return JSON.parse(m[1])}catch{return {parseError:true}}});
 const anchors=tags(html,'a').map(s=>attr(s,'href')).filter(Boolean);
 const internal=[...new Set(anchors.map(h=>{try{const u=new URL(h,url);if(u.origin===base){u.hash='';return u.href}}catch{}return null}).filter(Boolean))];
 pages.push({url,status:r.status,headers:r.headers,error:r.error,fetchMs:r.ms,bytes:Buffer.byteLength(html),htmlSha256:createHash('sha256').update(html).digest('hex'),title:[...head.matchAll(/<title[^>]*>(.*?)<\/title>/gi)].map(m=>text(m[1])),h1:[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>text(m[1])),description:meta('description'),robots:meta('robots'),viewport:meta('viewport'),canonical:links.filter(s=>attr(s,'rel')==='canonical').map(s=>attr(s,'href')),hreflang:links.filter(s=>attr(s,'hreflang')).map(s=>({lang:attr(s,'hreflang'),href:attr(s,'href')})),textLength:text(html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]||'').length,internal,styles:links.filter(s=>attr(s,'rel')==='stylesheet').map(s=>attr(s,'href')),scripts:tags(html,'script').map(s=>attr(s,'src')).filter(Boolean),images:tags(html,'img').map(s=>({src:attr(s,'src'),width:attr(s,'width'),height:attr(s,'height'),loading:attr(s,'loading'),alt:attr(s,'alt')})),jsonld});
});
pages.sort((a,b)=>a.url.localeCompare(b.url));save('pages.json',pages);
const known=new Set(urls),extra=[...new Set(pages.flatMap(p=>p.internal||[]))].filter(u=>!known.has(u)&&allowed(u));
const assets=[...new Set(pages.flatMap(p=>[...(p.styles||[]),...(p.scripts||[]),...(p.images||[]).map(i=>i.src)]).filter(Boolean).map(s=>new URL(s,base).href))].filter(u=>new URL(u).origin===base&&allowed(u));
const resources=[];
await batches([...new Set([...extra,...assets])],async u=>{const r=await get(u);resources.push({...r,body:undefined,bytes:Buffer.byteLength(r.body),isHtml:/text\/html/.test(r.headers?.['content-type']||'')});});
save('resources.json',resources);
const badPages=pages.filter(p=>p.status!==200||p.canonical?.[0]!==p.url||p.h1?.length!==1||p.title?.length!==1||p.robots?.some(r=>/noindex/.test(r)));
const badResources=resources.filter(r=>r.status!==200||(/\.(css|js|png|webp|svg|jpg)(\?|$)/.test(r.url)&&r.isHtml));
const summary={capturedAt:new Date().toISOString(),scope:'Raw HTTP source; max concurrency 5 and one-second delay between batches',sitemapCounts:smaps.map(s=>({url:s.url,count:s.urls.length,status:s.status})),pages:pages.length,resources:resources.length,badPages:badPages.map(p=>({url:p.url,status:p.status,canonical:p.canonical,h1:p.h1})),badResources,missingViewport:pages.filter(p=>!p.viewport?.length).map(p=>p.url),noStyles:pages.filter(p=>!p.styles?.length).map(p=>p.url),jsonldParseErrors:pages.filter(p=>p.jsonld?.some(s=>s.parseError)).map(p=>p.url)};
save('summary.json',summary);console.log(JSON.stringify(summary,null,2));
