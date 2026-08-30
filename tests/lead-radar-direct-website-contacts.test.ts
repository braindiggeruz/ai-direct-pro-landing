import assert from 'node:assert/strict';
import test from 'node:test';

import { enrichCompanyWebsiteDetailed } from '../functions/platform/lead-radar/sources';

const REAL_FETCH = globalThis.fetch;
const DNS_JSON = {
  Status: 0,
  Answer: [
    { type: 1, data: '93.184.216.34' },
    { type: 28, data: '2606:2800:220:1:248:1893:25c8:1946' },
  ],
};

type Route = { body: string; contentType: string; status?: number };

/** Free Tier-0 crawl (audit-2026-08-30 R1): the company's own website must
 * yield contact facts without any paid provider. Sitemap fallback, contact
 * page ranking and the bounded page budget are all part of that contract. */
function withRoutes(routes: Record<string, Route>, record: string[]): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://cloudflare-dns.com/dns-query')) {
      return new Response(JSON.stringify(DNS_JSON), { headers: { 'Content-Type': 'application/json' } });
    }
    const path = new URL(url).pathname;
    record.push(path);
    const route = routes[path];
    if (!route) return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    return new Response(route.body, {
      status: route.status ?? 200,
      headers: { 'Content-Type': route.contentType },
    });
  }) as typeof globalThis.fetch;
}

const ROBOTS_404 = { body: '', contentType: 'text/plain', status: 404 };

test('detailed enrichment follows sitemap contact pages when the homepage hides its links', async () => {
  const fetched: string[] = [];
  globalThis.fetch = withRoutes({
    '/robots.txt': ROBOTS_404,
    '/': { body: '<html><body><div id="app"></div><script src="/app.js"></script></body></html>', contentType: 'text/html; charset=utf-8' },
    '/sitemap.xml': { body: `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://clinic.uz/</loc></url>
        <url><loc>https://clinic.uz/kontakt</loc></url>
        <url><loc>https://clinic.uz/blog/post-1</loc></url>
        <url><loc>https://clinic.uz/o-kompanii</loc></url>
      </urlset>`, contentType: 'application/xml' },
    '/kontakt': { body: '<html><body><h1>Стоматология AksuMed</h1><p>+998 90 123-45-67</p><a href="https://t.me/DentClinic">Запись</a></body></html>', contentType: 'text/html; charset=utf-8' },
    '/o-kompanii': { body: '<html><body><h1>О компании AksuMed</h1></body></html>', contentType: 'text/html; charset=utf-8' },
  }, fetched);
  try {
    const result = await enrichCompanyWebsiteDetailed('https://clinic.uz/', { name: 'Стоматология AksuMed' });
    assert.equal(result.reason, 'enriched');
    assert.ok(result.facts);
    assert.equal(result.facts.phone, '+998901234567');
    assert.ok(result.facts.evidence.some((item) => item.fieldPath === 'web.company_binding'),
      'name match on the crawled contact page must verify the website binding');
    // Bounded free crawl: robots + home + sitemap + the two contact pages,
    // never the blog or any paid provider.
    assert.deepEqual(fetched.filter((path) => !path.startsWith('/app.js')).sort(), [
      '/', '/kontakt', '/o-kompanii', '/robots.txt', '/sitemap.xml',
    ]);
  } finally {
    globalThis.fetch = REAL_FETCH;
  }
});

test('homepage contact links rank kontakt first and the crawl stays bounded to four pages', async () => {
  const fetched: string[] = [];
  globalThis.fetch = withRoutes({
    '/robots.txt': ROBOTS_404,
    '/': { body: `<html><body>
      <a href="/blog/x">Блог</a><a href="/about">О нас</a><a href="/kontakt">Контакты</a>
      <a href="/team">Врачи</a><a href="/vakansii">Вакансии</a>
    </body></html>`, contentType: 'text/html; charset=utf-8' },
    '/kontakt': { body: '<html><body><h1>Стоматология AksuMed</h1><p>+998 90 123-45-67</p></body></html>', contentType: 'text/html; charset=utf-8' },
    '/about': { body: '<html><body><p>О нас</p></body></html>', contentType: 'text/html; charset=utf-8' },
    '/team': { body: '<html><body><p>Врачи</p></body></html>', contentType: 'text/html; charset=utf-8' },
    '/vakansii': { body: '<html><body><p>Вакансии</p></body></html>', contentType: 'text/html; charset=utf-8' },
  }, fetched);
  try {
    const result = await enrichCompanyWebsiteDetailed('https://clinic.uz/', { name: 'Стоматология AksuMed' });
    assert.equal(result.reason, 'enriched');
    assert.equal(result.facts?.phone, '+998901234567');
    assert.equal(fetched[2], '/kontakt', 'the ranked contact page must be fetched first');
    // Four-page bound reached from homepage links: no sitemap lookup at all.
    assert.ok(!fetched.includes('/sitemap.xml'));
    assert.ok(!fetched.includes('/blog/x'), 'non-contact paths are never fetched');
    assert.equal(fetched.filter((path) => path !== '/robots.txt' && path !== '/' && !path.startsWith('/app')).length, 4);
  } finally {
    globalThis.fetch = REAL_FETCH;
  }
});

test('a broken sitemap never fails the free enrichment', async () => {
  const fetched: string[] = [];
  globalThis.fetch = withRoutes({
    '/robots.txt': ROBOTS_404,
    '/': { body: '<html><body><h1>Стоматология AksuMed</h1><p>+998 90 123-45-67</p></body></html>', contentType: 'text/html; charset=utf-8' },
    '/sitemap.xml': { body: 'boom', contentType: 'text/html', status: 500 },
  }, fetched);
  try {
    const result = await enrichCompanyWebsiteDetailed('https://clinic.uz/', { name: 'Стоматология AksuMed' });
    assert.equal(result.reason, 'enriched');
    assert.equal(result.facts?.phone, '+998901234567');
    assert.ok(!fetched.includes('/kontakt'));
  } finally {
    globalThis.fetch = REAL_FETCH;
  }
});
