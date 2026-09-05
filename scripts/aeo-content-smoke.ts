import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeContent } from '../functions/platform/aeo/analysis';
const files: Record<string,string> = {};
async function walk(dir: string) { for (const entry of await readdir(dir,{withFileTypes:true})) { const p=path.join(dir,entry.name); if(entry.isDirectory()) await walk(p); else if(p.endsWith('.json')) files[p.replaceAll('\\','/')]=await readFile(p,'utf8'); } }
await walk('content');
const ru=await analyzeContent(files,['Сколько стоит разработка сайта?','Как продвигать сайт в Google?','Какие сроки SEO продвижения сайта?'],'ru');
const uz=await analyzeContent(files,['Sayt yaratish qancha turadi?','SEO nima?'],'uz');
await mkdir('docs/aeo/evidence',{recursive:true});
await writeFile('docs/aeo/evidence/current-content-analysis.json',JSON.stringify({source:'local checkout',ru,uz},null,2));
console.log(JSON.stringify({ru:{pages:ru.pages,findings:ru.findings.map(f=>({question:f.question,status:f.status,url:f.url,facts:f.evidence.length}))},uz:{pages:uz.pages,findings:uz.findings.map(f=>({question:f.question,status:f.status,url:f.url,facts:f.evidence.length}))}},null,2));
