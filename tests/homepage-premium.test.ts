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

test('the lead journey is keyboard-native and reduced-motion safe', () => {
  const journey = read('src/components/HowItWorks.tsx');
  const css = read('src/index.css');
  assert.match(journey, /<button/);
  assert.match(journey, /type="button"/);
  assert.match(journey, /aria-pressed=\{activeStep === index\}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.journey-console__stage/);
  assert.doesNotMatch(css, /transition:\s*all/);
});
