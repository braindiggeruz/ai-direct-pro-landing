import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seoContract } from '../../scripts/seo-protection';

const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Pass the verified predecessor dist and external evidence directory');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'gptbot-release.json'), 'utf8'));
if (manifest.commit !== 'e85da915a070acc71b7d9b76b5a7a92b1ac08fe4') throw new Error('Unexpected predecessor');
const urls = [...fs.readFileSync(path.join(source, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
if (urls.length !== 330) throw new Error('Expected all 330 published predecessor URLs');
const pages = urls.map((url) => {
  const html = fs.readFileSync(path.join(source, url, 'index.html'), 'utf8');
  const target = path.join(output, 'html', url, 'index.html');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
  return { url, contract: seoContract(html), htmlSha256: createHash('sha256').update(html).digest('hex') };
});
fs.writeFileSync(path.join(output, 'contracts.json'), JSON.stringify({ capturedAt: new Date().toISOString(), manifest, pages }, null, 2));
console.log(JSON.stringify({ predecessor: manifest.commit, urls: pages.length }));
