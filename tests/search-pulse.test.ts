import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SEARCH_PULSE_HARD_CAP,
  selectSearchPulseCandidates,
} from '../src/shared/search-pulse.ts';
import type { BoosterItem } from '../src/shared/booster.ts';
import {
  chunkIndexNowAuditUrls,
  INDEXNOW_AUDIT_LOOKUP_CHUNK_SIZE,
} from '../functions/lib/indexnow/audit.ts';
import { submitSitemapToGsc } from '../functions/lib/gsc/sitemap.ts';
import type { Env } from '../functions/_types.ts';
import {
  cronSecretMatches,
  onRequestPost as dailySearchPulsePost,
  scheduledSearchPulseStatus,
  searchPulseFailureCode,
} from '../functions/api/internal/search-pulse/daily.ts';
import type { SearchPulseEnv } from '../functions/lib/search-pulse/service.ts';

const NOW = Date.parse('2026-07-31T12:00:00.000Z');

test('IndexNow audit lookups stay below the D1 bind-parameter limit', () => {
  const urls = Array.from({ length: 228 }, (_, index) => `https://gptbot.uz/page-${index}/`);
  const chunks = chunkIndexNowAuditUrls(urls);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [80, 80, 68]);
  assert.equal(chunks.flat().length, urls.length);
  assert.equal(chunks.every((chunk) => chunk.length <= INDEXNOW_AUDIT_LOOKUP_CHUNK_SIZE), true);
});

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

describe('daily Search Pulse endpoint auth', () => {
  type DailyHandler = (context: {
    request: Request;
    env: SearchPulseEnv;
  }) => Promise<Response>;
  const handler = dailySearchPulsePost as unknown as DailyHandler;

  test('fails closed when CRON_SECRET is not configured', async () => {
    const response = await handler({
      request: new Request('https://gptbot.uz/api/internal/search-pulse/daily', {
        method: 'POST',
      }),
      env: {} as SearchPulseEnv,
    });
    assert.equal(response.status, 503);
  });

  test('rejects an invalid bearer before any external work', async () => {
    const response = await handler({
      request: new Request('https://gptbot.uz/api/internal/search-pulse/daily', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-secret' },
      }),
      env: { CRON_SECRET: 'correct-secret' } as SearchPulseEnv,
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: 'Unauthorized.' });
  });

  test('normalises a CLI line ending around the configured secret', () => {
    assert.equal(cronSecretMatches('correct-secret', 'correct-secret\r\n'), true);
    assert.equal(cronSecretMatches('wrong-secret', 'correct-secret\r\n'), false);
  });

  test('treats missing optional GSC OAuth as a successful scheduled run', () => {
    assert.equal(scheduledSearchPulseStatus({
      ok: true,
      indexNowConfigured: true,
    }), 200);
  });

  test('keeps a missing or failed IndexNow path fatal', () => {
    assert.equal(scheduledSearchPulseStatus({
      ok: true,
      indexNowConfigured: false,
    }), 424);
    assert.equal(scheduledSearchPulseStatus({
      ok: false,
      indexNowConfigured: true,
    }), 502);
  });

  test('maps runtime failures to a closed diagnostic code list', () => {
    assert.equal(
      searchPulseFailureCode(new Error('GitHub graphql failed: 401 redacted')),
      'content_source_unavailable',
    );
    assert.equal(
      searchPulseFailureCode(new Error('Search Pulse requires the GPTBOT_DRAFTS_DB audit binding.')),
      'audit_store_unavailable',
    );
    assert.equal(
      searchPulseFailureCode(new Error('unexpected failure')),
      'search_pulse_runtime_failure',
    );
  });
});
