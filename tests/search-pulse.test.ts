import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SEARCH_PULSE_HARD_CAP,
  selectSearchPulseCandidates,
} from '../src/shared/search-pulse.ts';
import type { BoosterItem } from '../src/shared/booster.ts';
import { submitSitemapToGsc } from '../functions/lib/gsc/sitemap.ts';
import type { Env } from '../functions/_types.ts';

const NOW = Date.parse('2026-07-31T12:00:00.000Z');

function item(
  url: string,
  overrides: Partial<BoosterItem> & {
    scores?: Partial<BoosterItem['scores']>;
    flags?: Partial<BoosterItem['flags']>;
  } = {},
): BoosterItem {
  const scores = {
    indexationPriority: 70,
    moneyPower: null,
    freshness: 100,
    quality: 95,
    ...overrides.scores,
  };
  const flags = {
    canonicalSelf: true,
    canonicalMatchesUrl: true,
    descriptionInRange: true,
    titleInRange: true,
    needsFaq: false,
    pushable: true,
    pushReasons: [],
    ...overrides.flags,
  };
  return {
    kind: 'blog',
    url,
    locale: 'ru',
    pageType: 'blog',
    title: `Article ${url}`,
    h1: `Article ${url}`,
    description: 'A sufficiently complete description for the Search Pulse unit test.',
    primaryKeyword: 'test',
    canonical: `https://gptbot.uz${url}`,
    hreflangPair: undefined,
    hreflangReciprocal: false,
    status: 'published',
    robotsIndex: true,
    inSitemap: true,
    hasSchema: true,
    faqCount: 3,
    outgoingLinks: 3,
    incomingLinks: 1,
    isOrphan: false,
    lastModifiedAt: '2026-07-30T10:00:00.000Z',
    daysSinceUpdate: 1,
    mojibake: false,
    cluster: undefined,
    ...overrides,
    scores,
    flags,
  };
}

describe('selectSearchPulseCandidates', () => {
  test('keeps only safe, fresh, high-quality URLs', () => {
    const result = selectSearchPulseCandidates([
      item('/ru/blog/ready/'),
      item('/ru/blog/low-quality/', { scores: { quality: 79 } }),
      item('/ru/blog/noindex/', { status: 'noindex', flags: { pushable: false } }),
      item('/ru/blog/stale/', {
        lastModifiedAt: '2026-01-01T00:00:00.000Z',
        daysSinceUpdate: 211,
      }),
    ], new Map(), NOW);

    assert.deepEqual(result.ready.map((candidate) => candidate.relativeUrl), ['/ru/blog/ready/']);
    assert.equal(result.qualityBlocked, 1);
    assert.equal(result.unsafeBlocked, 1);
    assert.equal(result.staleBlocked, 1);
  });

  test('skips the current version but includes content changed after a prior success', () => {
    const current = item('/ru/blog/current/', {
      lastModifiedAt: '2026-07-29T10:00:00.000Z',
    });
    const changed = item('/ru/blog/changed/', {
      lastModifiedAt: '2026-07-30T10:00:00.000Z',
    });
    const history = new Map([
      ['https://gptbot.uz/ru/blog/current/', { submittedAt: '2026-07-30T12:00:00.000Z' }],
      ['https://gptbot.uz/ru/blog/changed/', { submittedAt: '2026-07-28T12:00:00.000Z' }],
    ]);

    const result = selectSearchPulseCandidates([current, changed], history, NOW);
    assert.equal(result.alreadyCurrent, 1);
    assert.deepEqual(result.ready.map((candidate) => candidate.relativeUrl), ['/ru/blog/changed/']);
  });

  test('holds a changed URL in the 24-hour cooldown', () => {
    const changed = item('/ru/blog/cooling/', {
      lastModifiedAt: '2026-07-31T10:00:00.000Z',
    });
    const history = new Map([
      ['https://gptbot.uz/ru/blog/cooling/', { submittedAt: '2026-07-31T09:00:00.000Z' }],
    ]);

    const result = selectSearchPulseCandidates([changed], history, NOW);
    assert.equal(result.ready.length, 0);
    assert.equal(result.coolingDown.length, 1);
  });

  test('sorts by priority and applies the hard cap deterministically', () => {
    const items = Array.from({ length: SEARCH_PULSE_HARD_CAP + 3 }, (_, index) =>
      item(`/ru/blog/pulse-${String(index).padStart(3, '0')}/`, {
        scores: { indexationPriority: index },
      }),
    );
    const result = selectSearchPulseCandidates(items, new Map(), NOW);

    assert.equal(result.ready.length, SEARCH_PULSE_HARD_CAP);
    assert.equal(result.deferredCount, 3);
    assert.equal(result.ready[0].priority, SEARCH_PULSE_HARD_CAP + 2);
  });
});

describe('submitSitemapToGsc', () => {
  test('returns a safe setup state when OAuth is not configured', async () => {
    const result = await submitSitemapToGsc({} as Env);
    assert.equal(result.status, 'not_configured');
    assert.equal(result.sitemapUrl, 'https://gptbot.uz/sitemap.xml');
  });

  test('refreshes OAuth and submits the encoded sitemap endpoint', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) {
        return new Response(JSON.stringify({ access_token: 'temporary-access-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 204 });
    };
    const env = {
      GSC_CLIENT_ID: 'fake-client-id',
      GSC_CLIENT_SECRET: 'fake-client-secret',
      GSC_REFRESH_TOKEN: 'fake-refresh-token',
    } as Env;

    const result = await submitSitemapToGsc(env, fetcher);

    assert.equal(result.status, 'success');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
    assert.match(String(calls[0].init?.body), /grant_type=refresh_token/);
    assert.match(calls[1].url, /sc-domain%3Agptbot\.uz/);
    assert.match(calls[1].url, /https%3A%2F%2Fgptbot\.uz%2Fsitemap\.xml/);
    assert.equal(calls[1].init?.method, 'PUT');
    assert.equal(result.message.includes('fake-'), false);
  });
});
