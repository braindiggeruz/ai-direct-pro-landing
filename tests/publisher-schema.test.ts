// Current publisher identity is distinct from the historical visible offer.
// Run after prerender. For the full before/after guard, also set
// SEO_PUBLISHER_BASELINE_DIST to the immutable pre-change dist directory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import site from '../content/global/site.json';
import { buildOrganizationLd } from '../scripts/jsonld-helpers';
import type { GlobalSEO } from '../src/shared/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BASELINE = process.env.SEO_PUBLISHER_BASELINE_DIST;
const ORG_ID = `${site.siteUrl}/#org`;
const JSON_LD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

// Exact retired empty-container loader, not an allowlist for arbitrary scripts
// or analytics changes. Preserve every byte outside these two known blocks.
const RETIRED_GTM_SCRIPT = "<script data-tag=\"gtm\">(function(w,d,s,l,i){var h=w.location.hostname||'';if(h==='localhost'||h==='127.0.0.1'||h==='::1'||h==='[::1]'||h==='0.0.0.0'||h.slice(-6)==='.local')return;w[l]=w[l]||[];var started=false;function loadGTM(){if(started)return;started=true;w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);}function idleLoad(){if('requestIdleCallback' in w){w.requestIdleCallback(loadGTM,{timeout:3000});}else{setTimeout(loadGTM,200);}}var evs=['scroll','pointerdown','keydown','touchstart','mousemove'];function onInt(){evs.forEach(function(e){w.removeEventListener(e,onInt)});idleLoad();}evs.forEach(function(e){w.addEventListener(e,onInt,{passive:true,once:true})});if(d.readyState==='complete'){setTimeout(idleLoad,1000);}else{w.addEventListener('load',function(){setTimeout(idleLoad,1000)});}setTimeout(idleLoad,3000);})(window,document,'script','dataLayer','GTM-NLR4WFX8');</script>";
const RETIRED_GTM_NOSCRIPT = '<noscript data-tag="gtm"><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-NLR4WFX8" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>';

function withoutAllowedMetadataChanges(html: string): string {
  let preserved = html.replace(JSON_LD, '');
  for (const block of [RETIRED_GTM_SCRIPT, RETIRED_GTM_NOSCRIPT]) {
    // The renderer removes each complete GTM line. Only that block's own
    // line ending is allowed; never trim or normalize the remaining HTML.
    preserved = preserved.replace(`${block}\r\n`, '').replace(`${block}\n`, '').replace(block, '');
  }
  return preserved;
}

function graphNodes(html: string): Array<Record<string, unknown>> {
  return [...html.matchAll(JSON_LD)].flatMap(([, json]) => {
    const data = JSON.parse(json) as Record<string, unknown>;
    return (data['@graph'] ?? [data]) as Array<Record<string, unknown>>;
  });
}

test('the preservation guard retains visible edits and unrelated script changes', () => {
  const document = '<main>Approved offer</main><script>keep()</script>';
  const allowed = `${RETIRED_GTM_SCRIPT}${document}${RETIRED_GTM_NOSCRIPT}<script type="application/ld+json">{}</script>`;
  assert.equal(withoutAllowedMetadataChanges(allowed), document);
  assert.equal(withoutAllowedMetadataChanges(`${RETIRED_GTM_SCRIPT}\n${document}\n${RETIRED_GTM_NOSCRIPT}\n`), `${document}\n`);
  assert.equal(withoutAllowedMetadataChanges(`${RETIRED_GTM_SCRIPT}\r\n${document}\r\n${RETIRED_GTM_NOSCRIPT}\r\n`), `${document}\r\n`);
  assert.notEqual(withoutAllowedMetadataChanges(`${RETIRED_GTM_SCRIPT}\n\n${document}`), document);
  assert.notEqual(withoutAllowedMetadataChanges(allowed.replace('Approved offer', 'Changed offer')), document);
  assert.notEqual(withoutAllowedMetadataChanges(allowed.replace('keep()', 'changed()')), document);
  assert.notEqual(withoutAllowedMetadataChanges(allowed.replace('GTM-NLR4WFX8', 'GTM-OTHER')), document);
});

for (const locale of ['ru', 'uz']) {
  const relative = `${locale}/oferta/index.html`;
  const builtFile = path.join(DIST, relative);
  const built = fs.existsSync(builtFile);

  test(`${locale} offer: exactly one current global publisher, historical contacts stay visible`, {
    skip: !built && 'no dist/ offer build present',
  }, () => {
    const html = fs.readFileSync(builtFile, 'utf8');
    const publishers = graphNodes(html).filter((node) => node['@id'] === ORG_ID);
    assert.deepEqual(publishers, [buildOrganizationLd(site as unknown as GlobalSEO)]);
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    assert.ok(visible.includes('Yahyo Gulyamov ko‘chasi 35'));
    assert.ok(visible.includes(`href="tel:${site.phone}"`));
    assert.ok(visible.includes('data-terms-version="ai-paket-2026-10-v5"'));
    assert.ok(!visible.includes(site.studioTelegram));
  });

  test(`${locale} offer: HTML outside publisher schema and retired GTM is byte-identical to the baseline`, {
    skip: (!built && 'no dist/ offer build present') || (!BASELINE && 'SEO_PUBLISHER_BASELINE_DIST not supplied'),
  }, () => {
    const before = fs.readFileSync(path.join(BASELINE!, relative), 'utf8');
    const after = fs.readFileSync(builtFile, 'utf8');
    assert.equal(withoutAllowedMetadataChanges(after), withoutAllowedMetadataChanges(before));
    // Ignoring JSON-LD in the HTML comparison must not hide changes to other
    // graph nodes, including WebPage dates, seller facts or offer properties.
    const withoutPublisher = (html: string) => graphNodes(html).filter((node) => node['@id'] !== ORG_ID);
    assert.deepEqual(withoutPublisher(after), withoutPublisher(before));
  });
}
