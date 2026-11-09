import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { seoContract, PROTECTED_PATHS } from '../../scripts/seo-protection';
import { createHash } from 'node:crypto';
const textOf = (s: string) => (s.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const out = path.resolve('../evidence/marketing-release-20261109');
const prior = JSON.parse(fs.readFileSync(path.join(out, 'before/contracts.json'), 'utf8'));
const plan = JSON.parse(fs.readFileSync('reports/marketing-gap-20261109/PLAN.json','utf8'));
const newUrls: string[] = plan.pages.filter((p: {id:string}) => p.id.startsWith('N')).map((p:{path:string}) => p.path);
const sitemap = [...fs.readFileSync('dist/sitemap.xml','utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>new URL(m[1]).pathname);
assert.equal(sitemap.length,360);assert.equal(new Set(sitemap).size,360);
assert.deepEqual(sitemap.filter(url => !prior.pages.some((p:{url:string}) => p.url===url)).sort(),newUrls.sort());
const changes: unknown[] = [], issues: string[] = [], graphs: unknown[] = [];
const contracts = new Map<string,ReturnType<typeof seoContract>>();
for (const url of sitemap) {
  const html=fs.readFileSync(path.join('dist',url,'index.html'),'utf8');
  const c=seoContract(html);contracts.set(url,c);
  assert.equal(c.title.length,1,url+' title');assert.equal(c.h1.length,1,url+' H1');assert.equal(c.description.length,1,url+' description');
  assert.deepEqual(c.canonical,['https://gptbot.uz'+url]);assert.ok(!c.robots.some(x=>/noindex|none/i.test(x)),url+' noindex');
  for(const m of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) graphs.push(JSON.parse(m[1]));
  const old=prior.pages.find((p:{url:string})=>p.url===url);
  if(old){
    const fields=(Object.keys(c) as Array<keyof typeof c>).filter(k=>JSON.stringify(c[k])!==JSON.stringify(old.contract[k]));
    for(const k of fields) if(!['bodyTextSha256','internalLinks'].includes(k)) issues.push(url+' unexpected metadata change: '+k);
    if(fields.length) changes.push({url,fields,added:c.internalLinks.filter(l=>!old.contract.internalLinks.includes(l)),removed:old.contract.internalLinks.filter((l:string)=>!c.internalLinks.includes(l))});
  }
  if(newUrls.includes(url)) {
    assert.ok(textOf(html).length>2500,url+' substantive content');
    assert.ok(c.title[0].endsWith('| GPTBot.uz'));
    for(const href of c.internalLinks) {
      const pathname=href.split('#')[0].split('?')[0];
      if (!pathname || !pathname.startsWith('/'))continue;
      const file=path.join('dist',pathname,pathname.endsWith('/')?'index.html':'');
      if(!fs.existsSync(file))issues.push(url+' broken internal href: '+href);
    }
    const types=graphs.slice(-1).flatMap((g:any)=>g['@graph']??[g]).map((n:any)=>n['@type']);
    assert.ok(types.includes('BreadcrumbList'),url+' breadcrumb schema');
    assert.ok(types.includes(url.includes('/blog/')?'BlogPosting':'WebApplication'),url+' main schema');
  }
}
const newCoverage=newUrls.map(url=>({url,incoming:sitemap.filter(from=>from!==url && contracts.get(from)!.internalLinks.some(h=>h.split('#')[0]===url))}));
for(const row of newCoverage)assert.ok(row.incoming.length>=2,row.url+' contextual discovery');
const receipt={checkedAt:new Date().toISOString(),predecessor:prior.manifest.commit,sitemapCount:sitemap.length,preservedMetadata:350,newCoverage,changes,issues,jsonLdDocuments:graphs.length};
fs.writeFileSync(path.join(out,'artifact-review.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({sitemap:360,preservedMetadata:350,changes:changes.length,issues},null,2));
assert.equal(issues.length,0,'Review failed; see artifact-review.json');
// The homepage is protected. Prove that removing only the ten newly approved
// list entries restores its complete predecessor contract before revising it.
let strippedHome = fs.readFileSync('dist/index.html','utf8');
for (const url of newUrls) {
  const escaped=url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp(`<li><a href="${escaped}"(?: hreflang="(?:ru|uz)")?>[^<]+<\\/a><\\/li>`,'g');
  assert.equal([...strippedHome.matchAll(re)].length,1,url+' one homepage entry');strippedHome=strippedHome.replace(re,'');
}
assert.deepEqual(seoContract(strippedHome),prior.pages.find((p:{url:string})=>p.url==='/').contract,'Homepage reversal');
const predecessor='docs/seo/evidence/2026-11-08-pseo20/reviewed-protected-pages.json';
const target='docs/seo/evidence/2026-11-09-marketing/reviewed-protected-pages.json';
const previousRaw=fs.readFileSync(predecessor,'utf8').replace(/\r\n/g,'\n');
const previous=JSON.parse(previousRaw);
for(const url of PROTECTED_PATHS) if(url!=='/')assert.deepEqual(contracts.get(url),previous.pages.find((p:{pathname:string})=>p.pathname===url).contract,url+' protected');
if(process.argv.includes('--write-reviewed-revision')) {
  assert.ok(!fs.existsSync(target),'Never replace immutable evidence');fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify({schema:1,capturedAt:new Date().toISOString(),previousRevision:predecessor,previousRevisionSha256:createHash('sha256').update(previousRaw).digest('hex'),source:'Owner-authorized 10 new marketing resources and 10 strengthened owners. All 350 metadata contracts preserved. Removing ten new homepage entries restores the complete predecessor homepage contract.',reviewedChanges:[{pathname:'/',fields:['internalLinks','bodyTextSha256'],addedLinks:newUrls}],invisibleToGate:['Ten existing marketing pages strengthened; 13 other parents gain contextual links; RU/UZ blog listings gain eight articles. No previous URL or link removed.','Two isolated local tools, nine authored CSV worksheets. No backend, payment, bot, webhook, credential or shared chat bundle change.','Crawled-currently-not-indexed UZ target has no confirmed technical block. Index recovery and rankings remain subject to Google processing.'],pages:PROTECTED_PATHS.map(url=>({pathname:url,contract:contracts.get(url),bodyText:textOf(fs.readFileSync(path.join('dist',url,'index.html'),'utf8'))}))},null,2)+'\n',{flag:'wx'});
}
if(fs.existsSync(target))for(const page of JSON.parse(fs.readFileSync(target,'utf8')).pages)assert.deepEqual(contracts.get(page.pathname),page.contract,page.pathname+' reviewed revision');
