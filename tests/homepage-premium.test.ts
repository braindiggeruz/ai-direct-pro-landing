import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

test('homepage uses a resilient responsive image component', () => {
  const image = read('src/components/PremiumImage.tsx');
  assert.match(image, /<picture>/);
  assert.match(image, /type="image\/avif"/);
  assert.match(image, /type="image\/webp"/);
  assert.match(image, /width=\{1536\}/);
  assert.match(image, /height=\{960\}/);
  assert.match(image, /onError=\{\(\) => setFailed\(true\)\}/);
});

test('hero and near-fold images receive the correct loading priority', () => {
  const hero = read('src/components/Hero.tsx');
  const pain = read('src/components/Pain.tsx');
  const offer = read('src/components/Offer.tsx');
  assert.match(hero, /loading="eager"/);
  assert.match(hero, /fetchPriority="high"/);
  assert.match(pain, /loading="eager"/);
  assert.doesNotMatch(offer, /loading="eager"/);
});

test('homepage keeps one main landmark target and an accessible skip link', () => {
  const app = read('src/App.tsx');
  assert.match(app, /href="#main-content"/);
  assert.match(app, /<main id="main-content">/);
  assert.match(app, /Asosiy mazmunga o‘tish/);
  assert.match(app, /Перейти к основному содержанию/);
});

test('generated homepage images are descriptive, responsive and lightweight', () => {
  const directory = 'public/assets/landing/premium';
  const names = [
    'ai-sales-assistant-workspace',
    'unanswered-business-messages-night',
    'tashkent-business-owner-ai-leads',
  ];

  for (const name of names) {
    for (const width of [480, 800, 1280, 1536]) {
      for (const extension of ['avif', 'webp']) {
        const path = join(ROOT, directory, `${name}-${width}.${extension}`);
        assert.ok(existsSync(path), `missing ${path}`);
        assert.ok(statSync(path).size < 100_000, `${path} exceeds 100 KB`);
      }
    }
  }

  const og = join(ROOT, directory, 'gptbot-ai-bot-business-og.jpg');
  assert.ok(existsSync(og));
  assert.ok(statSync(og).size < 200_000);
});

test('homepage SEO intent and share image remain explicit', () => {
  const html = read('index.html');
  assert.match(html, /GPTBot — AI-бот для бизнеса в Узбекистане/);
  assert.match(html, /rel="canonical" href="https:\/\/gptbot\.uz\/"/);
  assert.match(html, /max-image-preview:large/);
  assert.match(html, /premium\/gptbot-ai-bot-business-og\.jpg/);
  assert.match(html, /ai-sales-assistant-workspace-1536\.avif 1536w/);
});

test('the compact lead journey stays in the live product proof', () => {
  const journey = read('src/components/DemoChat.tsx');
  const app = read('src/App.tsx');
  const css = read('src/index.css');
  assert.match(journey, /t\.how\.steps\.map/);
  assert.match(journey, /<ol/);
  assert.match(journey, /data-testid="demo-chat"/);
  assert.doesNotMatch(app, /<HowItWorks/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /transition:\s*all/);
});

test('homepage editorial hierarchy removes repeated above-fold proof', () => {
  const hero = read('src/components/Hero.tsx');
  const app = read('src/App.tsx');
  const niches = read('src/components/Niches.tsx');
  const solutions = read('src/components/SolutionsGrid.tsx');

  assert.match(hero, /bullets\.slice\(0, 2\)/);
  assert.doesNotMatch(hero, /hero-trust-badges|hero-stat-|hero-signal-card--channel/);
  assert.doesNotMatch(app, /<CapabilityRail|<Trust/);
  assert.match(niches, /items\.slice\(0, 4\)/);
  assert.match(niches, /<details/);
  assert.match(solutions, /SOLUTIONS\.slice\(0, 4\)/);
  assert.match(solutions, /<details/);
});
