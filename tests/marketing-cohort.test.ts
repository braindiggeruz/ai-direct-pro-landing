import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { collectOutgoingLinks } from '../src/shared/audit';
import { MARKETING_DOWNLOAD_URLS } from '../src/shared/marketing-downloads';
import { isMarketingTool } from '../scripts/marketing-tools';
import type { Page, BlogArticle } from '../src/shared/types';
const plan=JSON.parse(fs.readFileSync('reports/marketing-gap-20261109/PLAN.json','utf8')) as {pages:{id:string;path:string}[]};
const docs=new Map<string,Page|BlogArticle>();
for(const kind of ['pages','blog'])for(const locale of ['ru','uz'])for(const file of fs.readdirSync(`content/${kind}/${locale}`)){
 if(!file.endsWith('.json'))continue;const doc=JSON.parse(fs.readFileSync(`content/${kind}/${locale}/${file}`,'utf8'));docs.set(doc.url,doc);
}
const manifest=JSON.parse(fs.readFileSync('content/seo/intent-manifest.json','utf8')) as {clusters:{hub:string;spokes:{url:string}[]}[];resourceClusters:{hub:string;spokes:{url:string}[]}[]};
test('the bounded marketing cohort contains ten new distinct owners and ten existing upgrades',()=>{
 assert.equal(plan.pages.filter(p=>p.id.startsWith('N')).length,10);assert.equal(plan.pages.filter(p=>p.id.startsWith('E')).length,10);
 assert.equal(new Set(plan.pages.map(p=>p.path)).size,20);
 for(const item of plan.pages){const doc=docs.get(item.path)!;assert.ok(doc);assert.equal(doc.status,'published');assert.equal(doc.robotsIndex,true);assert.equal(new URL(doc.canonical!,'https://gptbot.uz').href,'https://gptbot.uz'+item.path);}
 const clusters=[...manifest.clusters,...manifest.resourceClusters];
 for(const item of plan.pages.filter(p=>p.id.startsWith('N'))){
  assert.equal(clusters.flatMap(c=>c.spokes).filter(s=>s.url===item.path).length,1,item.path+' one declared owner');
  const links=[...docs.values()].filter(d=>d.url!==item.path && collectOutgoingLinks({url:d.url,bodyBlocks:('body' in d?d.body:d.bodyBlocks),internalLinks:d.internalLinks}).some(l=>l.target===item.path));
  assert.ok(links.length>=2,item.path+' at least two contextual source pages');
 }
});
test('tools stay scoped to exactly two pages and never mount chat',()=>{
 const matching=[...docs.values()].filter(d=>isMarketingTool(d as Page));
 assert.deepEqual(matching.map(d=>d.url).sort(),['/ru/roas-kalkulyator/','/ru/utm-generator/']);
 for(const d of matching){const html=fs.readFileSync(path.join('dist',d.url,'index.html'),'utf8');assert.match(html,/data-marketing-tool=/);assert.match(html,/tools\.mjs/);assert.doesNotMatch(html,/id="gpt-chat-root"/);}
 for(const url of ['/ru/gpt-chat/','/uz/gpt-uzbek-tilida/'])assert.doesNotMatch(fs.readFileSync(path.join('dist',url,'index.html'),'utf8'),/marketing-20261109\/tools/);
});
test('all nine authored worksheets are linked and reachable in the published cohort',()=>{
 assert.equal(MARKETING_DOWNLOAD_URLS.length,9);
 const html=plan.pages.map(p=>fs.readFileSync(path.join('dist',p.path,'index.html'),'utf8')).join('\n');
 for(const url of MARKETING_DOWNLOAD_URLS){assert.ok(fs.statSync(path.join('dist',url)).size>100);assert.ok(html.includes(`href="${url}" download`),url);assert.ok(!fs.readFileSync(path.join('public',url)).includes(Buffer.from('\r\r\n')),url+' no doubled Windows line endings');}
 const calendar=fs.readFileSync('public/downloads/marketing-20261109/kontent-plan-uchebnyi-tsentr-30-dney.csv','utf8');assert.equal(calendar.trim().split(/\r?\n/).length,31);
});
