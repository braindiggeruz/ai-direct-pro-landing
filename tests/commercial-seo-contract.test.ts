import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { collectOutgoingLinks } from '../src/shared/audit';
import type { Page } from '../src/shared/types';

type CommercialCluster = { id: string; hub: string; hubIntent: string; spokes: Array<{ url: string; ownsIntent: string }> };
const manifest = JSON.parse(fs.readFileSync('content/seo/intent-manifest.json','utf8')) as { commercialClusters: CommercialCluster[] };
const pages = new Map<string, Page>();
for (const locale of ['ru','uz']) {
  for (const file of fs.readdirSync(path.join('content/pages',locale))) {
    if (!file.endsWith('.json')) continue;
    const page = JSON.parse(fs.readFileSync(path.join('content/pages',locale,file),'utf8')) as Page;
    pages.set(page.url,page);
  }
}
function targets(page: Page): Set<string> {
  return new Set(collectOutgoingLinks(page).map(link=>link.target.split('#')[0]));
}
test('commercial intent owners reuse published canonical pages and preserve locale',()=>{
  assert.equal(manifest.commercialClusters.length,2);
  for (const cluster of manifest.commercialClusters) {
    const urls=[cluster.hub,...cluster.spokes.map(page=>page.url)];
    assert.equal(new Set(urls).size,urls.length);
    assert.ok(cluster.hubIntent);
    for (const url of urls) {
      const page=pages.get(url);
      assert.ok(page,url);
      assert.equal(page.status,'published');
      assert.notEqual(page.robotsIndex,false);
      assert.ok(!page.canonical||page.canonical===url||page.canonical==='https://gptbot.uz'+url);
      assert.equal(url.split('/')[1],cluster.hub.split('/')[1]);
    }
  }
});
test('each commercial owner has a usable route to the hub and the hub explains the alternatives',()=>{
  for (const cluster of manifest.commercialClusters) {
    const hub=pages.get(cluster.hub)!;
    for (const owner of cluster.spokes) {
      const page=pages.get(owner.url)!;
      assert.ok(owner.ownsIntent,owner.url);
      assert.ok(targets(hub).has(owner.url),cluster.hub+' must link '+owner.url);
      assert.ok(targets(page).has(cluster.hub),owner.url+' must link '+cluster.hub);
    }
  }
});
