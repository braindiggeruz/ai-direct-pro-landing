// The demand gate stops the pattern that produced ~140 indexable pages for a
// cluster measuring ~80 searches a month. It only looks at pages created on or
// after the policy date, so everything already published stays untouched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { evaluateDemandGate, type DemandPolicy } from '../src/shared/demand-gate';
import type { Page } from '../src/shared/types';

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');
const policy: DemandPolicy = JSON.parse(
  fs.readFileSync(path.join(CONTENT, 'seo', 'demand-policy.json'), 'utf8'),
);

function readPages(): Page[] {
  const out: Page[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) out.push(JSON.parse(fs.readFileSync(full, 'utf8')) as Page);
    }
  };
  walk(path.join(CONTENT, 'pages'));
  return out;
}

function page(overrides: Partial<Page>): Page {
  return {
    status: 'published',
    locale: 'ru',
    url: '/ru/fixture/',
    slug: 'fixture',
    pageType: 'money',
    title: 'Fixture',
    description: 'Fixture',
    h1: 'Fixture',
    robotsIndex: true,
    robotsFollow: true,
    createdAt: '2026-09-01T00:00:00Z',
    ...overrides,
  } as Page;
}

test('a new page targeting a frozen cluster is rejected', () => {
  const subject = page({ url: '/ru/new-bot-page/', primaryKeyword: 'чат бот для клиники' });

  const violations = evaluateDemandGate([subject], policy);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'frozen-cluster');
  assert.match(violations[0].detail, /bot-services/);
});

test('a new page targeting an unmeasured keyword is rejected', () => {
  const subject = page({ url: '/ru/new-thing/', primaryKeyword: 'некий новый запрос' });

  const violations = evaluateDemandGate([subject], policy);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'unmeasured-keyword');
});

test('a new page targeting a measured keyword passes', () => {
  const subject = page({ url: '/uz/new/', locale: 'uz', primaryKeyword: 'veb sayt yaratish' });

  assert.deepEqual(evaluateDemandGate([subject], policy), []);
});

test('the gate is case-insensitive about the recorded keyword', () => {
  const subject = page({ url: '/uz/new/', locale: 'uz', primaryKeyword: 'Sayt Yaratish' });

  assert.deepEqual(evaluateDemandGate([subject], policy), []);
});

test('pages created before the policy date are grandfathered', () => {
  const subject = page({ url: '/ru/old-bot-page/', primaryKeyword: 'чат бот для бизнеса', createdAt: '2026-05-01T00:00:00Z' });

  assert.deepEqual(evaluateDemandGate([subject], policy), []);
});

test('a draft may target anything — the gate only guards what ships indexable', () => {
  const draft = page({ url: '/ru/draft/', primaryKeyword: 'телеграм бот', status: 'draft' });
  const noindex = page({ url: '/ru/noindex/', primaryKeyword: 'телеграм бот', robotsIndex: false });

  assert.deepEqual(evaluateDemandGate([draft, noindex], policy), []);
});

test('blog articles are out of scope — the gate guards commercial pages', () => {
  const blogLike = page({ url: '/ru/article/', pageType: 'blog', primaryKeyword: 'чат бот' });

  assert.deepEqual(evaluateDemandGate([blogLike], policy), []);
});

test('the current repository passes its own demand gate', () => {
  assert.deepEqual(evaluateDemandGate(readPages(), policy), []);
});
