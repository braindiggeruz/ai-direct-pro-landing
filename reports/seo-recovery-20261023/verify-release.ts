import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seoContract, BASELINE } from '../../scripts/seo-protection';
const out = path.resolve('reports/seo-recovery-20261023');
const source = JSON.parse(fs.readFileSync('dist/gptbot-release.json', 'utf8'));
const urls: string[] = JSON.parse(fs.readFileSync(path.join(out,'CHANGED_URLS.json'),'utf8'));
const baseline = JSON.parse(fs.readFileSync(BASELINE,'utf8'));
const sha = (x:string)=>createHash('sha256').update(x).digest('hex');
const manifestResponse = await fetch('https://gptbot.uz/gptbot-release.json',{signal:AbortSignal.timeout(20000)});
const live = await manifestResponse.json();
if (JSON.stringify(live) !== JSON.stringify(source)) throw new Error('Live release differs from reviewed artifact; no notification allowed');
const rows = [];
const targets = [...new Set([...urls, ...baseline.pages.map((p:{pathname:string})=>'https://gptbot.uz'+p.pathname)])];
for (const url of targets) {
 const pathname = new URL(url).pathname;
 const response = await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
 const html = await response.text();
 const local = fs.readFileSync(path.join('dist',pathname,'index.html'),'utf8');
 const contract = seoContract(html), expected = seoContract(local);
 rows.push({url,status:response.status,contentType:response.headers.get('content-type'), xRobotsTag:response.headers.get('x-robots-tag'), contractMatches:JSON.stringify(contract)===JSON.stringify(expected),canonical:contract.canonical,emailProtectionLinks:(html.match(/href=["']\/cdn-cgi\/l\/email-protection/g)||[]).length,htmlSha256:sha(html),indexable: !/noindex|none/i.test([...(contract.robots||[]),response.headers.get('x-robots-tag')||''].join(' '))});
 console.log(JSON.stringify(rows.at(-1)));
}
const files = [];
for (const pathname of ['/robots.txt','/sitemap.xml','/sitemap-updates.xml','/updates/atom.xml','/ru/blog/feed.xml','/uz/blog/feed.xml','/downloads/seo-20261023/telegram-bot-brief-ru.txt','/downloads/seo-20261023/telegram-bot-brif-uz.txt']) {
 const response = await fetch('https://gptbot.uz'+pathname,{signal:AbortSignal.timeout(20000)});
 const body = await response.text();
 const local = fs.readFileSync(path.join('dist',pathname),'utf8');
 files.push({pathname,status:response.status,contentType:response.headers.get('content-type'),bodyMatches:body===local,sha256:sha(body)});
}
const pass=rows.every(r=>r.status===200&&r.contentType?.includes('text/html')&&r.contractMatches&&r.indexable&&r.emailProtectionLinks===0)&&files.every(f=>f.status===200&&f.bodyMatches);
const evidence={checkedAt:new Date().toISOString(),sourceCommit:source.commit,manifestStatus:manifestResponse.status,manifestMatches:true,artifactSha256:source.artifactSha256,fileCount:source.fileCount,pass,rows,files};
fs.writeFileSync(path.join(out,'PRODUCTION_READBACK.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({pass,sourceCommit:source.commit,pages:rows.length,files:files.length}));
if(!pass)process.exitCode=1;
