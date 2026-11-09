import fs from 'node:fs';
import path from 'node:path';
import { seoContract } from '../../scripts/seo-protection';
const output = path.resolve('../evidence/marketing-release-20261109/before');
const manifest = JSON.parse(fs.readFileSync('dist/gptbot-release.json', 'utf8'));
if (manifest.commit !== 'e49675252b1c4acdd1770f7b42fc5aa5a0c42630') throw new Error('Unexpected predecessor');
const urls = [...fs.readFileSync('dist/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname);
if (urls.length !== 350) throw new Error('Unexpected predecessor URL count');
const pages = urls.map(url => {
  const html = fs.readFileSync(path.join('dist', url, 'index.html'), 'utf8');
  const target = path.join(output, 'html', url, 'index.html');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
  return { url, contract: seoContract(html) };
});
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'contracts.json'), JSON.stringify({ manifest, pages }, null, 2));
console.log(`Saved ${pages.length} predecessor contracts to ${output}`);
