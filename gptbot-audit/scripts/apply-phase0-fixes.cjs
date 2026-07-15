#!/usr/bin/env node
/**
 * Phase 0 — All urgent fixes in one script.
 * Run: node scripts/apply-phase0-fixes.js
 */
const fs = require('fs');
const path = require('path');

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full));
    else results.push(full);
  }
  return results;
}

function replaceInFile(file, replacements) {
  let c = fs.readFileSync(file, 'utf-8');
  let changed = false;
  for (const [from, to] of replacements) {
    if (c.includes(from)) {
      c = c.split(from).join(to);
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(file, c);
  return changed;
}

let fixCount = 0;

// === FIX 1: prerender.ts — internal link bug + noreferrer + favicon ===
const prerenderReplacements = [
  // Internal link bug: line 612 — only add target=_blank for external links
  [`<a data-testid="page-cta-primary" href="${'${escapeHtml(page.ctaPrimaryHref)}'}" rel="nofollow noopener" target="_blank" class="btn-primary text-base w-full sm:w-auto">`,
   `<a data-testid="page-cta-primary" href="${'${escapeHtml(page.ctaPrimaryHref)}'}"${'${(page.ctaPrimaryHref || \'\').startsWith(\'http\') ? \' rel="nofollow noopener noreferrer" target="_blank"\' : \'\'}'} class="btn-primary text-base w-full sm:w-auto">`],
  // Header CTA line 589 — same fix
  [`<a href="${'${escapeHtml(page.ctaPrimaryHref || global.defaultCTA.href)}'}" rel="nofollow noopener" target="_blank" class="bg-grad-cta text-bg-base font-semibold px-4 py-2 rounded-full">`,
   `<a href="${'${escapeHtml(page.ctaPrimaryHref || global.defaultCTA.href)}'}"${'${(page.ctaPrimaryHref || global.defaultCTA.href || \'\').startsWith(\'http\') ? \' rel="nofollow noopener noreferrer" target="_blank"\' : \'\'}'} class="bg-grad-cta text-bg-base font-semibold px-4 py-2 rounded-full">`],
  // Favicon
  ['<link rel="icon" type="image/png" href="/assets/landing/2.png" />', '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />'],
  // noreferrer on all remaining noopener
  ['rel="nofollow noopener"', 'rel="nofollow noopener noreferrer"'],
  ['rel="noopener" target="_blank"', 'rel="noopener noreferrer" target="_blank"'],
];

if (replaceInFile('scripts/prerender.ts', prerenderReplacements)) { fixCount++; console.log('Fixed: scripts/prerender.ts'); }

// === FIX 2: prerender-home.ts — target=_blank + noreferrer ===
const homeReplacements = [
  ['rel="noopener">Telegram</a>', 'rel="noopener noreferrer" target="_blank">Telegram</a>'],
  ['rel="noopener">', 'rel="noopener noreferrer" target="_blank">'],
];
if (replaceInFile('scripts/prerender-home.ts', homeReplacements)) { fixCount++; console.log('Fixed: scripts/prerender-home.ts'); }

// === FIX 3: prerender-blog.ts — noreferrer + favicon ===
const blogReplacements = [
  ['<link rel="icon" type="image/png" href="/assets/landing/2.png" />', '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />'],
  ['rel="nofollow noopener"', 'rel="nofollow noopener noreferrer"'],
];
if (replaceInFile('scripts/prerender-blog.ts', blogReplacements)) { fixCount++; console.log('Fixed: scripts/prerender-blog.ts'); }

// === FIX 4: Header.tsx — useEffect + noreferrer ===
const headerContent = fs.readFileSync('src/components/Header.tsx', 'utf-8');
let headerFixed = headerContent
  .replace("import { useState } from 'react';", "import { useEffect, useState } from 'react';")
  .replace(
    `  if (typeof window !== 'undefined') {\n    window.addEventListener(\n      'scroll',\n      () => setScrolled(window.scrollY > 8),\n      { passive: true, once: false },\n    );\n  }`,
    `  useEffect(() => {\n    const onScroll = () => setScrolled(window.scrollY > 8);\n    window.addEventListener('scroll', onScroll, { passive: true });\n    return () => window.removeEventListener('scroll', onScroll);\n  }, []);`
  )
  .replace('rel="noopener"\n            onClick={() => track(\'click_header_cta\')}', 'rel="noopener noreferrer"\n            onClick={() => track(\'click_header_cta\')}')
  .replace('rel="noopener"\n                data-testid="header-cta-mobile"', 'rel="noopener noreferrer"\n                data-testid="header-cta-mobile"');
if (headerFixed !== headerContent) {
  fs.writeFileSync('src/components/Header.tsx', headerFixed);
  fixCount++; console.log('Fixed: src/components/Header.tsx');
}

// === FIX 5: All React components — add noreferrer ===
const componentFiles = [
  'src/components/Hero.tsx',
  'src/components/StickyCTA.tsx',
  'src/components/FinalCTA.tsx',
  'src/components/Footer.tsx',
  'src/components/Offer.tsx',
  'src/components/Solution.tsx',
  'src/components/DemoChat.tsx',
  'src/gpt-chat/components/AiBusinessUpsell.tsx',
  'src/gpt-chat/components/AiChatLeadForm.tsx',
  'src/gpt-chat/components/AiChatMessageList.tsx',
  'src/gpt-chat/components/BusinessDemoLead.tsx',
  'src/admin/pages/BlogEditor.tsx',
  'src/admin/pages/BlogList.tsx',
];

for (const f of componentFiles) {
  if (!fs.existsSync(f)) continue;
  let c = fs.readFileSync(f, 'utf-8');
  const before = c;
  c = c.replace(/rel="nofollow noopener"/g, 'rel="nofollow noopener noreferrer"');
  c = c.replace(/rel="noopener"/g, 'rel="noopener noreferrer"');
  if (c !== before) {
    fs.writeFileSync(f, c);
    fixCount++; console.log('Fixed: ' + f);
  }
}

// === FIX 6: UZ gpt-chat page CTA ===
const uzPage = 'content/pages/uz/gpt-uzbek-tilida.json';
if (fs.existsSync(uzPage)) {
  let c = fs.readFileSync(uzPage, 'utf-8');
  c = c.replace('"ctaPrimaryLabel": "Biznes uchun AI chat kerak",', '"ctaPrimaryLabel": "AI chatni ochish",');
  c = c.replace('"ctaPrimaryHref": "https://t.me/XGame_changerx",', '"ctaPrimaryHref": "#ai-console",');
  fs.writeFileSync(uzPage, c);
  fixCount++; console.log('Fixed: ' + uzPage);
}

// === FIX 7: index.html — favicon, OG image, preload, JSON-LD logo ===
if (fs.existsSync('index.html')) {
  let c = fs.readFileSync('index.html', 'utf-8');
  c = c.replace('<link rel="icon" type="image/png" href="/assets/landing/2.png" />', '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  c = c.replace(/\/assets\/landing\/og\.jpg/g, '/assets/landing/og.svg');
  c = c.replace('<meta property="og:image:type" content="image/jpeg" />', '<meta property="og:image:type" content="image/svg+xml" />');
  c = c.replace(/type="image\/webp" href="\/assets\/landing\/1-800\.webp" imagesrcset="[^"]*"/, 'type="image/svg+xml" href="/assets/landing/hero.svg"');
  c = c.replace('"url": "https://gptbot.uz/assets/landing/og.jpg",\n            "width": 1200,\n            "height": 630', '"url": "https://gptbot.uz/assets/landing/logo-sq.svg",\n            "width": 64,\n            "height": 64');
  fs.writeFileSync('index.html', c);
  fixCount++; console.log('Fixed: index.html');
}

// === FIX 8: public/404.html — favicon ===
if (fs.existsSync('public/404.html')) {
  replaceInFile('public/404.html', [
    ['<link rel="icon" type="image/png" href="/assets/landing/2.png" />', '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />']
  ]);
  fixCount++; console.log('Fixed: public/404.html');
}

// === FIX 9: Content JSONs — og.jpg → og.svg, logo reference ===
const contentFiles = walk('content').filter(f => f.endsWith('.json'));
let contentFixCount = 0;
for (const f of contentFiles) {
  let c = fs.readFileSync(f, 'utf-8');
  const before = c;
  c = c.replace(/\/assets\/landing\/og\.jpg/g, '/assets/landing/og.svg');
  if (f.endsWith('site.json')) {
    c = c.replace('"logo": "https://gptbot.uz/assets/landing/og.svg"', '"logo": "https://gptbot.uz/assets/landing/logo-sq.svg"');
  }
  if (c !== before) {
    fs.writeFileSync(f, c);
    contentFixCount++;
  }
}
fixCount++; console.log('Fixed: ' + contentFixCount + ' content JSONs (og.jpg → og.svg)');

// === FIX 10: Script files — og.jpg → og.svg ===
const scriptFiles = ['scripts/apply-blog.ts', 'scripts/apply-research.ts', 'scripts/seed-pages.ts'];
for (const f of scriptFiles) {
  if (fs.existsSync(f)) {
    replaceInFile(f, [['/assets/landing/og.jpg', '/assets/landing/og.svg']]);
    fixCount++; console.log('Fixed: ' + f);
  }
}

// === FIX 11: React components — .webp → .svg ===
const webpReplacements = [
  ['/assets/landing/logo-sq.webp', '/assets/landing/logo-sq.svg'],
  ['/assets/landing/1-800.webp', '/assets/landing/hero.svg'],
  ['/assets/landing/8-800.webp', '/assets/landing/cta-bg.svg'],
  ['/assets/landing/3-800.webp', '/assets/landing/pain.svg'],
  ['/assets/landing/4-800.webp', '/assets/landing/solution.svg'],
  ['/assets/landing/5-800.webp', '/assets/landing/howitworks.svg'],
  ['/assets/landing/6-800.webp', '/assets/landing/offer.svg'],
  ['/assets/landing/7-800.webp', '/assets/landing/niches.svg'],
];

const srcFiles = walk('src').filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
let srcFixCount = 0;
for (const f of srcFiles) {
  let c = fs.readFileSync(f, 'utf-8');
  const before = c;
  for (const [from, to] of webpReplacements) {
    c = c.split(from).join(to);
  }
  // Fix srcSet patterns
  c = c.replace(/\/assets\/landing\/1-480\.webp 480w, \/assets\/landing\/hero\.svg 800w, \/assets\/landing\/1\.webp 1000w/g, '/assets/landing/hero.svg 800w');
  c = c.replace(/\/assets\/landing\/8-480\.webp 480w, \/assets\/landing\/cta-bg\.svg 800w, \/assets\/landing\/8\.webp 1000w/g, '/assets/landing/cta-bg.svg 800w');
  c = c.replace(/\/assets\/landing\/3-480\.webp 480w, \/assets\/landing\/pain\.svg 800w, \/assets\/landing\/3\.webp 1000w/g, '/assets/landing/pain.svg 800w');
  c = c.replace(/\/assets\/landing\/4-480\.webp 480w, \/assets\/landing\/solution\.svg 800w, \/assets\/landing\/4\.webp 1000w/g, '/assets/landing/solution.svg 800w');
  c = c.replace(/\/assets\/landing\/5-480\.webp 480w, \/assets\/landing\/howitworks\.svg 800w, \/assets\/landing\/5\.webp 1000w/g, '/assets/landing/howitworks.svg 800w');
  c = c.replace(/\/assets\/landing\/6-480\.webp 480w, \/assets\/landing\/offer\.svg 800w, \/assets\/landing\/6\.webp 1000w/g, '/assets/landing/offer.svg 800w');
  c = c.replace(/\/assets\/landing\/7-480\.webp 480w, \/assets\/landing\/niches\.svg 800w, \/assets\/landing\/7\.webp 1000w/g, '/assets/landing/niches.svg 800w');
  if (c !== before) {
    fs.writeFileSync(f, c);
    srcFixCount++;
  }
}
fixCount++; console.log('Fixed: ' + srcFixCount + ' src files (.webp → .svg)');

// === FIX 12: Content JSONs — .webp → .svg for SEO images ===
for (const f of contentFiles) {
  let c = fs.readFileSync(f, 'utf-8');
  const before = c;
  c = c.replace(/\.webp/g, '.svg');
  if (c !== before) {
    fs.writeFileSync(f, c);
    console.log('Fixed .webp in: ' + f);
  }
}

// === FIX 13: Create SVG placeholder assets ===
function svgPlaceholder(w, h, label) {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
  <defs>
    <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='#08111F'/>
      <stop offset='100%' stop-color='#0C1828'/>
    </linearGradient>
    <radialGradient id='glow' cx='50%' cy='0%' r='70%'>
      <stop offset='0%' stop-color='#229ED9' stop-opacity='0.15'/>
      <stop offset='100%' stop-color='transparent'/>
    </radialGradient>
  </defs>
  <rect width='${w}' height='${h}' fill='url(#g)'/>
  <rect width='${w}' height='${h}' fill='url(#glow)'/>
  <text x='50%' y='50%' font-family='Manrope,sans-serif' font-size='24' font-weight='600' fill='#2FE6D1' text-anchor='middle' dominant-baseline='middle' opacity='0.3'>${label}</text>
</svg>`;
}

function logoSvg() {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'>
  <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#229ED9'/><stop offset='100%' stop-color='#2FE6D1'/></linearGradient></defs>
  <rect width='64' height='64' rx='16' fill='url(#g)'/>
  <text x='32' y='44' font-family='Manrope,sans-serif' font-size='36' font-weight='800' fill='#04101A' text-anchor='middle'>G</text>
</svg>`;
}

function ogSvg() {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630' viewBox='0 0 1200 630'>
  <defs>
    <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#05070D'/><stop offset='50%' stop-color='#08111F'/><stop offset='100%' stop-color='#0C1828'/></linearGradient>
    <linearGradient id='accent' x1='0' y1='0' x2='1' y2='0'><stop offset='0%' stop-color='#229ED9'/><stop offset='100%' stop-color='#2FE6D1'/></linearGradient>
    <radialGradient id='glow1' cx='85%' cy='-10%' r='60%'><stop offset='0%' stop-color='#229ED9' stop-opacity='0.18'/><stop offset='100%' stop-color='transparent'/></radialGradient>
  </defs>
  <rect width='1200' height='630' fill='url(#bg)'/>
  <rect width='1200' height='630' fill='url(#glow1)'/>
  <rect x='80' y='240' width='64' height='64' rx='16' fill='url(#accent)'/>
  <text x='112' y='284' font-family='Manrope,sans-serif' font-size='36' font-weight='800' fill='#04101A' text-anchor='middle'>G</text>
  <text x='170' y='290' font-family='Manrope,sans-serif' font-size='44' font-weight='700' fill='#E6EEF7'>GPTBot.uz</text>
  <text x='80' y='360' font-family='Manrope,sans-serif' font-size='32' font-weight='600' fill='#BFE4F2'>AI-бот для бизнеса в Узбекистане</text>
  <text x='80' y='410' font-family='Manrope,sans-serif' font-size='24' font-weight='400' fill='#8BA3B8'>Telegram · Instagram · WhatsApp · Сайт</text>
  <text x='80' y='450' font-family='Manrope,sans-serif' font-size='24' font-weight='400' fill='#8BA3B8'>24/7 ответы, сбор заявок, передача лидов</text>
</svg>`;
}

// Create landing assets
fs.mkdirSync('public/assets/landing', { recursive: true });
fs.mkdirSync('public/images/seo/website-development', { recursive: true });
fs.mkdirSync('public/images/seo/turnkey-website', { recursive: true });

const landingAssets = {
  'og.svg': ogSvg(),
  'logo-sq.svg': logoSvg(),
  'hero.svg': svgPlaceholder(800, 600, 'GPTBot'),
  'cta-bg.svg': svgPlaceholder(800, 400, 'CTA'),
  'pain.svg': svgPlaceholder(800, 500, 'Pain'),
  'solution.svg': svgPlaceholder(800, 500, 'Solution'),
  'howitworks.svg': svgPlaceholder(800, 500, 'HowItWorks'),
  'offer.svg': svgPlaceholder(800, 500, 'Offer'),
  'niches.svg': svgPlaceholder(800, 800, 'Niches'),
};

for (const [name, content] of Object.entries(landingAssets)) {
  fs.writeFileSync('public/assets/landing/' + name, content);
}
console.log('Created 9 landing SVG assets');

// SEO images for website-development page
const seoDevImages = [
  'website-types-grid-gptbot', 'website-development-process-timeline',
  'website-lead-funnel-ai-crm', 'website-ai-bot-chat-widget',
  'website-consultation-cta', 'website-development-tashkent-hero'
];
for (const name of seoDevImages) {
  fs.writeFileSync(`public/images/seo/website-development/${name}.svg`, svgPlaceholder(800, 500, name.replace(/-/g, ' ')));
}
console.log('Created 6 website-development SEO SVGs');

// SEO images for turnkey-website page
const seoTurnkeyImages = [
  'turnkey-website-hero', 'turnkey-website-full-cycle',
  'turnkey-website-included-checklist', 'domain-hosting-ssl-website-rights',
  'turnkey-website-ai-bot-crm', 'turnkey-website-consultation-cta'
];
for (const name of seoTurnkeyImages) {
  fs.writeFileSync(`public/images/seo/turnkey-website/${name}.svg`, svgPlaceholder(1200, 700, name.replace(/-/g, ' ')));
}
console.log('Created 6 turnkey-website SEO SVGs');

console.log('\n=== Phase 0 complete: ' + fixCount + ' fix groups applied ===');
