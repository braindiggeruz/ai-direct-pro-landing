import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverFreeTopUzContacts, parseTopUzIndex, topUzCategoryPath } from '../functions/platform/lead-radar/top-uz-discovery';
import { readPublicPageHtml } from '../functions/platform/lead-radar/sources';

const observedAt='2026-08-30T12:00:00.000Z';
const identity={name:'Стоматология AksuMed',city:'Ташкент',phone:'+998901234567',address:'Ташкент'};
const robots=async()=>'User-agent: *\nDisallow: */search/\n';
const category='dentist';
const card='<script type="application/ld+json">{"@type":"LocalBusiness","name":"Стоматология AksuMed","telephone":"+998901234567","sameAs":["https://t.me/AksuMedClinic"]}</script>';

test('free directory follows allowed category pages, resumes and checks only a matching entity',async()=>{
  const calls:string[]=[];
  const readPage=async(url:string)=>{
    calls.push(url);
    if(url.includes('/search/'))throw new Error('forbidden search');
    if(url==='https://top.uz/section/stomatologii')return '<a href="/company/other">Other</a><a href="?PAGEN_1=2">Next</a>';
    if(url.includes('PAGEN_1=2'))return '<a href="/company/old-slug">Стоматология AksuMed</a>';
    if(url.endsWith('/company/old-slug'))return card;
    throw new Error('unmatched listing must never be fetched');
  };
  const first=await discoverFreeTopUzContacts({identity,category,observedAt,robots,readPage});
  assert.equal(first.reason,'free_catalog_page_2');assert.equal(first.status,'limited');
  const second=await discoverFreeTopUzContacts({identity,category,observedAt,robots,readPage,previousReason:first.reason});
  assert.equal(second.reason,'public_contact_candidates');
  assert.equal(second.sources[0].candidates[0].ownership,'company');
  assert.equal(calls.length,3);
});

test('free directory keeps provider failures distinct from no-match',async()=>{
  assert.equal((await discoverFreeTopUzContacts({identity,category,observedAt,robots,readPage:async()=>null})).status,'unavailable');
  assert.equal((await discoverFreeTopUzContacts({identity,category,observedAt,robots:async()=>{throw new Error('offline');},readPage:async()=>{throw new Error('must not fetch');}})).reason,'free_catalog_page_1_policy_unavailable');
});

test('free index hints cannot override phone conflicts, bots or directory support accounts',async()=>{
  const readPage=async(url:string)=>url.includes('/section/')?'<a href="/company/aksumed">AksuMed</a>':card.replace('+998901234567','+998909876543');
  const result=await discoverFreeTopUzContacts({identity,category,observedAt,robots,readPage});
  assert.equal(result.sources.length,0);
  const bots=await discoverFreeTopUzContacts({identity,category,observedAt,robots,readPage:async(url)=>url.includes('/section/')?'<a href="/company/aksumed">AksuMed</a>':card.replace('AksuMedClinic','AksuMedBot')});
  assert.ok(bots.sources.every(s=>s.candidates.every(c=>!c.value.toLowerCase().endsWith('bot'))));
});

test('free index rejects foreign origins and reports its bounded coverage honestly',async()=>{
  const index=parseTopUzIndex('<a href="https://evil.example/company/aksumed">AksuMed</a><a href="?PAGEN_1=2">Next</a>',new URL('https://top.uz/section/stomatologii'));
  assert.equal(index.listings.length,0);assert.equal(index.hasNext,true);
  const limit=await discoverFreeTopUzContacts({identity,category,observedAt,robots,previousReason:'free_catalog_page_40',readPage:async()=>'<a href="/company/other">Other</a><a href="?PAGEN_1=41">Next</a>'});
  assert.equal(limit.reason,'free_catalog_page_limit');assert.equal(limit.status,'unavailable');
  assert.equal(topUzCategoryPath('unverified-niche'),null);
});

test('free catalog retries the SAME page after failure and does not follow unapproved redirects',async()=>{
  const failed=await discoverFreeTopUzContacts({identity,category,observedAt,robots,previousReason:'free_catalog_page_7',readPage:async()=>{throw new Error('offline');}});
  assert.equal(failed.reason,'free_catalog_page_7_unavailable');
  const calls:string[]=[];
  await discoverFreeTopUzContacts({identity,category,observedAt,robots,previousReason:failed.reason,readPage:async(url,options)=>{
    calls.push(url);assert.equal(options?.allowRedirects,false);assert.equal(options?.sameOrigin,true);
    return '<a href="/company/other">Other</a>';
  }});
  assert.deepEqual(calls,['https://top.uz/section/stomatologii?PAGEN_1=7']);
  const invalid=await discoverFreeTopUzContacts({identity,category,observedAt,robots,readPage:async()=>'<html>Challenge</html>'});
  assert.equal(invalid.reason,'free_catalog_page_1_unrecognized_index');
});

test('free page reader enforces body limits and never follows a redirect when policy only approved the original URL',async(t)=>{
  const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});
  const targets:string[]=[];
  globalThis.fetch=async(input)=>{
    const url=String(input instanceof Request?input.url:input);
    if(url.startsWith('https://cloudflare-dns.com/dns-query')) return new Response(JSON.stringify({Status:0,Answer:[{type:1,data:'93.184.216.34'}]}));
    targets.push(url);
    if(url.includes('/redirect')) return new Response(null,{status:302,headers:{location:'https://other.example.org/private'}});
    return new Response('x'.repeat(655474),{headers:{'content-type':'text/html'}});
  };
  assert.equal(await readPublicPageHtml('https://fixture.example.org/large'),null);
  assert.equal((await readPublicPageHtml('https://fixture.example.org/large',{maxBytes:900000}))?.length,655474);
  assert.equal(await readPublicPageHtml('https://fixture.example.org/redirect',{allowRedirects:false,sameOrigin:true}),null);
  assert.ok(!targets.some(url=>url.includes('other.example')));
  const before=targets.length;
  assert.equal(await readPublicPageHtml('https://fixture.example.org/large',{maxBytes:900001}),null);
  assert.equal(targets.length,before);
});
