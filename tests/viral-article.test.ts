import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { BlogArticle } from '../src/shared/types';
import { isViralArticle, renderViralArticle, VIRAL_ARTICLE_URL } from '../scripts/viral-article';
import { LEAD_FORM_ARTICLES, LEAD_FORM_PAGES, leadFormServiceFor } from '../scripts/lead-form';

const root = path.resolve(import.meta.dirname, '..');
const article = JSON.parse(fs.readFileSync(path.join(root, 'content/blog/ru/ii-zahvatit-mir-nachnem-s-zayavok.json'), 'utf8')) as BlogArticle;
const built = path.join(process.env.GPTBOT_TEST_DIST || path.join(root, 'dist'), VIRAL_ARTICLE_URL, 'index.html');

test('campaign renderer and article form are enabled only for the exact canonical article', () => {
  assert.equal(isViralArticle(article.url), true);
  assert.equal(leadFormServiceFor(article), 'ai-bot');
  assert.equal(LEAD_FORM_PAGES[article.url], undefined, 'ordinary commercial page allowlist stays separate');
  assert.deepEqual(LEAD_FORM_ARTICLES, { [VIRAL_ARTICLE_URL]: 'ai-bot' });
  for (const url of [VIRAL_ARTICLE_URL.slice(0, -1), `${VIRAL_ARTICLE_URL}?x=1`, `${VIRAL_ARTICLE_URL}#lead-form`, VIRAL_ARTICLE_URL.replace('/ru/', '/uz/'), '/ru/blog/other-article/']) {
    assert.equal(isViralArticle(url), false, url);
    assert.equal(leadFormServiceFor({ ...article, url }), null, url);
  }
  for (const dir of ['ru', 'uz']) {
    for (const file of fs.readdirSync(path.join(root, 'content/blog', dir)).filter(f => f.endsWith('.json'))) {
      const other = JSON.parse(fs.readFileSync(path.join(root, 'content/blog', dir, file), 'utf8'));
      if (other.url !== VIRAL_ARTICLE_URL) assert.equal(leadFormServiceFor(other), null, `no new form on ${other.url}`);
    }
  }
  assert.equal(leadFormServiceFor({ ...article, pageType: 'gpt-chat' }), null);
});

test('campaign SSR provides one offline demo and one inert-until-bound real form', () => {
  const html = renderViralArticle(article, () => '', '<span>Author fixture</span>');
  for (const [label, pattern] of [
    ['headline', /<h1\b/g], ['demo', /id="lead-demo"/g], ['form target', /id="lead-form"/g], ['real form', /<form\b/g],
  ] as const) assert.equal((html.match(pattern) || []).length, 1, label);
  assert.match(html, /href="#lead-demo"/);
  assert.match(html, /href="#lead-form"/);
  assert.match(html, /data-service="ai-bot"/);
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled/);
  assert.match(html, /Учебный пример: данные не отправляются/);
  assert.match(html, /Запрос на запись — ещё не бронь/);
  assert.match(html, /<noscript>/);
  assert.equal((html.match(/loading="eager"/g) || []).length, 1);
  assert.match(html, /\/assets\/campaigns\/ai-routine\/dark\/hero-640\.webp 640w/);
});

test('campaign illustrations have real WebP payloads within a conservative mobile budget', () => {
  const assets = path.join(root, 'public/assets/campaigns/ai-routine/dark');
  const budgets: Record<string, number> = {
    'hero-640.webp': 60000, 'hero-1200.webp': 120000, 'hero-1600.webp': 180000,
    'c02-late-message-960.webp': 100000, 'c03-three-questions-960.webp': 100000,
    'c04-request-handoff-960.webp': 100000, 'c05-one-scenario-960.webp': 100000, 'og.webp': 120000,
  };
  for (const [file, budget] of Object.entries(budgets)) {
    const data = fs.readFileSync(path.join(assets, file));
    assert.equal(data.subarray(0, 4).toString(), 'RIFF', file);
    assert.equal(data.subarray(8, 12).toString(), 'WEBP', file);
    assert.ok(data.length <= budget, `${file}: ${data.length} exceeds ${budget} bytes`);
  }
});

test('built campaign keeps canonical, social image and unique interactive entry points', { skip: !fs.existsSync(built) }, () => {
  const html = fs.readFileSync(built, 'utf8');
  assert.match(html, new RegExp(`<link rel="canonical" href="https://gptbot\\.uz${VIRAL_ARTICLE_URL}"`));
  assert.match(html, /<meta property="og:image" content="https:\/\/gptbot\.uz\/assets\/campaigns\/ai-routine\/dark\/og\.webp"/);
  for (const pattern of [/<h1\b/g, /id="lead-demo"/g, /id="lead-form"/g, /<form\b/g, /<script data-lead-form-script/g]) {
    assert.equal((html.match(pattern) || []).length, 1, String(pattern));
  }
  assert.match(html, /href="\/assets\/campaigns\/ai-routine\/landing-dark\.css"/);
  assert.doesNotMatch(html, /(?:src|href|content)="(?:https:\/\/gptbot\.uz)?\/assets\/campaigns\/ai-routine\/(?:hero-|c0[2-5]-|og\.webp|landing\.css)/, 'the published light assets remain immutable but are no longer used here');
  assert.match(html, /href="\/ru\/ai-bot-dlya-biznesa\/"/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate IDs would break labels and anchor navigation');
  for (const match of html.matchAll(/href="#([^"\s]+)"/g)) assert.ok(ids.includes(match[1]), `missing target #${match[1]}`);
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => JSON.parse(match[1]));
});
