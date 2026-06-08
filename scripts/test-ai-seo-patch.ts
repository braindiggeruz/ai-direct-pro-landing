// scripts/test-ai-seo-patch.ts
//
// Offline tests for the AI SEO Autopilot validators. No network, no Puter,
// no Gemini calls. Reads /content from disk and exercises the same backend
// validator that runs inside Cloudflare Pages Functions.
//
// Run: yarn tsx scripts/test-ai-seo-patch.ts
//
// Test cases (P0):
//   1. Safe patch with title/description tightening → acceptable, fields not blocked
//   2. Slug change → blocked
//   3. Fake "+50% growth" claim → blocked
//   4. Internal link to /admin-tools or /api → blocked
//   5. Internal link to non-existing URL → blocked
//   6. Cross-locale Cyrillic in UZ description → blocked
//   7. Mojibake in title → blocked
//   8. Duplicate FAQ questions → blocked
//   9. Mock provider produces a parseable patch
//
// Exit code is non-zero if any test fails (so CI can gate deploy).

import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { validatePatch } from '../functions/lib/ai-seo/validators';
import { buildMockPatch, MockProvider } from '../src/admin/lib/aiProviders/mock';
import { parsePatchJson } from '../src/admin/pages/SeoAutopilot/prompt';
import type { AiPatchContext, AiSeoPatchCandidate } from '../src/shared/ai-seo';
import type { Page, BlogArticle } from '../src/shared/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT = path.join(ROOT, 'content');

const pageFiles = fg.sync('pages/**/*.json', { cwd: CONTENT, absolute: true });
const blogFiles = fg.sync('blog/**/*.json', { cwd: CONTENT, absolute: true });
const pages: Page[] = pageFiles.map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')));
const blog: BlogArticle[] = blogFiles.map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')));
const allUrls = [...pages.map((p) => p.url), ...blog.map((b) => b.url)];

const ruBlog = blog.find((b) => b.locale === 'ru');
const uzBlog = blog.find((b) => b.locale === 'uz');
if (!ruBlog || !uzBlog) {
  console.error('FATAL: need at least one RU and one UZ blog article in /content for tests.');
  process.exit(2);
}

function mkCtx(article: BlogArticle): AiPatchContext {
  return {
    url: article.url,
    locale: article.locale,
    kind: 'blog',
    pageType: 'blog',
    primaryKeyword: article.keywords?.[0] || '',
    title: article.title,
    description: article.description,
    h1: article.h1,
    intro: article.intro,
    faqQ: (article.faq || []).map((f) => f.q),
    internalTargets: (article.internalLinks || []).map((l) => l.target),
    topicCluster: article.topicCluster,
    targetMoneyPage: article.targetMoneyPage,
    allowedSlugs: allUrls,
    clusterPeers: blog.filter((b) => b.locale === article.locale && b.url !== article.url).slice(0, 6).map((b) => ({ url: b.url, title: b.title })),
    clusterMoneyUrls: pages.filter((p) => p.pageType === 'money' && p.locale === article.locale).map((p) => p.url),
  };
}

interface Result { name: string; ok: boolean; detail?: string }
const results: Result[] = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// -------------------------------------------------------------------------
// 1. Safe patch accepted
// -------------------------------------------------------------------------
{
  const ctx = mkCtx(ruBlog);
  const candidate: AiSeoPatchCandidate = {
    url: ctx.url, locale: 'ru', action: 'improve_article_seo', provider: 'mock',
    fields: [{
      id: 'title', field: 'title',
      before: ctx.title,
      after: 'AI-бот для бизнеса в Узбекистане — Telegram и Instagram 24/7',
      reason: 'Расширяем title локальным модификатором', risk: 'low',
    }],
  };
  const out = validatePatch(candidate, ctx);
  check('safe title tightening accepted', out.acceptable && !out.fields[0].blocked, out.fields[0].blockReason);
}

// -------------------------------------------------------------------------
// 2. Slug change rejected
// -------------------------------------------------------------------------
{
  const ctx = mkCtx(ruBlog);
  const candidate: AiSeoPatchCandidate = {
    url: ctx.url, locale: 'ru', action: 'improve_article_seo', provider: 'mock',
    fields: [{ id: 'slug', field: 'slug' as never, before: 'a', after: 'b', reason: 'try', risk: 'low' }],
  };
  const out = validatePatch(candidate, ctx);
  check('slug change blocked', !out.acceptable || (out.fields[0]?.blocked === true));
}

// -------------------------------------------------------------------------
// 3. Fake claim rejected
// -------------------------------------------------------------------------
{
  const ctx = mkCtx(ruBlog);
  const candidate: AiSeoPatchCandidate = {
    url: ctx.url, locale: 'ru', action: 'improve_article_seo', provider: 'mock',
    fields: [{
      id: 'description', field: 'description',
      before: ctx.description,
      after: 'AI-бот для бизнеса в Узбекистане — гарантируем 50% рост продаж за месяц для всех клиентов.',
      reason: 'test fake', risk: 'low',
    }],
  };
  const out = validatePatch(candidate, ctx);
  check('fake claim (guarantee + %) blocked', out.fields[0].blocked === true, out.fields[0].blockReason);
}

// -------------------------------------------------------------------------
// 4. /admin-tools and /api links rejected
// -------------------------------------------------------------------------
{
  const ctx = mkCtx(ruBlog);
  const candidate: AiSeoPatchCandidate = {
    url: ctx.url, locale: 'ru', action: 'add_internal_links', provider: 'mock',
    fields: [{
      id: 'internalLinks', field: 'internalLinks',
      before: [],
      after: [
        { target: '/admin-tools/seo-booster', anchor: 'Booster', locale: 'ru', type: 'contextual' },
      ],
      reason: 'test', risk: 'low',
    }],
  };
  const out = validatePatch(candidate, ctx);
  check('/admin-tools link blocked', out.fields[0].blocked === true, out.fields[0].blockReason);
}
{
  const ctx = mkCtx(ruBlog);
  const candidate: AiSeoPatchCandidate = {
    url: ctx.url, locale: 'ru', action: 'add_internal_links', provider: 'mock',
    fields: [{
      id: 'internalLinks', field: 'internalLinks',
      before: [], after: [{ target: '/api/seo/booster', anchor: 'x', locale: 'ru', type: 'contextual' }],
      reason: 'test', risk: 'low',
    }],
  };
  const out = validatePatch(candidate, ctx);
  check('/api link blocked', out.fields[0].blocked === true);
}

// -------------------------------------------------------------------------
// 5. Non-existing internal link rejected
// -------------------------------------------------------------------------
{
  const ctx = mkCtx(ruBlog);
  const candidate: AiSeoPatchCandidate = {
    url: ctx.url, locale: 'ru', action: 'add_internal_links', provider: 'mock',
    fields: [{
      id: 'internalLinks', field: 'internalLinks',
      before: [], after: [{ target: '/ru/nonexistent-page-xyz/', anchor: 'x', locale: 'ru', type: 'contextual' }],
      reason: 'test', risk: 'low',
    }],
  };
  const out = validatePatch(candidate, ctx);
  check('non-existing internal target blocked', out.fields[0].blocked === true);
}

// -------------------------------------------------------------------------
// 6. Cross-locale leak rejected (Cyrillic in UZ description)
// -------------------------------------------------------------------------
{
  const ctx = mkCtx(uzBlog);
  const candidate: AiSeoPatchCandidate = {
    url: ctx.url, locale: 'uz', action: 'improve_article_seo', provider: 'mock',
    fields: [{
      id: 'description', field: 'description',
      before: ctx.description,
      after: 'Это полностью русский текст для проверки локали, который должен быть отклонён.',
      reason: 'test', risk: 'low',
    }],
  };
  const out = validatePatch(candidate, ctx);
  check('cross-locale Cyrillic in UZ blocked', out.fields[0].blocked === true, out.fields[0].blockReason);
}

// -------------------------------------------------------------------------
// 7. Mojibake rejected
// -------------------------------------------------------------------------
{
  const ctx = mkCtx(ruBlog);
  const candidate: AiSeoPatchCandidate = {
    url: ctx.url, locale: 'ru', action: 'improve_article_seo', provider: 'mock',
    fields: [{
      id: 'title', field: 'title',
      before: ctx.title,
      after: 'ÐÐ¸-Ð±Ð¾Ñ‚ Ð´Ð»Ñ Ð±Ð¸Ð·Ð½ÐµÑÐ°',
      reason: 'test', risk: 'low',
    }],
  };
  const out = validatePatch(candidate, ctx);
  check('mojibake blocked', out.fields[0].blocked === true);
}

// -------------------------------------------------------------------------
// 8. Duplicate FAQ rejected
// -------------------------------------------------------------------------
{
  const ctx = mkCtx(ruBlog);
  const candidate: AiSeoPatchCandidate = {
    url: ctx.url, locale: 'ru', action: 'improve_article_seo', provider: 'mock',
    fields: [{
      id: 'faq', field: 'faq',
      before: [],
      after: [
        { q: 'Что это?', a: 'Это AI-бот.' },
        { q: 'Что это ?', a: 'Это снова AI-бот.' },
      ],
      reason: 'test', risk: 'low',
    }],
  };
  const out = validatePatch(candidate, ctx);
  check('duplicate FAQ blocked', out.fields[0].blocked === true);
}

// -------------------------------------------------------------------------
// 9. Mock provider yields parseable JSON
// -------------------------------------------------------------------------
{
  const ctx = mkCtx(ruBlog);
  // Force orphan-style context so mock returns non-empty fields.
  ctx.internalTargets = [];
  const mock = await MockProvider.generate({ action: 'fix_orphan_article', ctx, systemPrompt: '', userPrompt: '' });
  const parsed = parsePatchJson(mock.text) as { fields?: unknown[] } | null;
  check('mock provider returns parseable JSON', !!parsed && Array.isArray(parsed.fields));
  if (parsed && Array.isArray(parsed.fields)) {
    const candidate = {
      url: ctx.url, locale: ctx.locale, action: 'fix_orphan_article' as const, provider: 'mock' as const,
      fields: parsed.fields as never,
    };
    const out = validatePatch(candidate, ctx);
    check('mock-generated patch passes validator', out.acceptable || out.fields.length === 0,
      `acceptable=${out.acceptable} blocked=${out.fields.filter((f) => f.blocked).length}/${out.fields.length}`);
  }
}

// -------------------------------------------------------------------------
// 10. buildMockPatch consistency
// -------------------------------------------------------------------------
{
  const ctx = mkCtx(ruBlog);
  ctx.title = 'Короткий'; // < 45
  const { fields } = buildMockPatch('improve_article_seo', ctx);
  check('mock buildMockPatch generates fields for short title', fields.length > 0);
}

// -------------------------------------------------------------------------
// Summary
// -------------------------------------------------------------------------
const passed = results.filter((r) => r.ok).length;
const total = results.length;
console.log(`\n${passed}/${total} tests passed.`);
if (passed !== total) process.exit(1);
