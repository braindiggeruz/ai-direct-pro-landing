import fs from 'node:fs';
import { canonicalOf, request, required, sleep, writeJson } from './lib.mjs';

const releaseSha = required('RELEASE_SHA');
const deploymentId = required('NEW_DEPLOYMENT_ID');
const deploymentUrl = required('NEW_DEPLOYMENT_URL');
const previewUrl = required('PREVIEW_URL');
const probeToken = required('PROBE_TOKEN');
const expected = JSON.parse(fs.readFileSync('dist/gptbot-release.json', 'utf8'));
const pre = JSON.parse(fs.readFileSync('evidence/directory-predeploy-safe.json', 'utf8')).samples.at(-1);
const origins = ['https://gptbot.uz', deploymentUrl];

async function eventually(label, operation, attempts = 12, delayMs = 3_000) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await sleep(delayMs);
    }
  }
  throw new Error(`${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function expectedManifest(origin) {
  return eventually(`${origin} release propagation`, async () => {
    const response = await request(`${origin}/gptbot-release.json?release=${releaseSha}&t=${Date.now()}`);
    if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
    const manifest = await response.json();
    if (JSON.stringify(manifest) !== JSON.stringify(expected)) throw new Error('manifest mismatch');
    return manifest;
  }, 24, 5_000);
}

async function expectRedirect(origin, path, target) {
  return eventually(`${origin}${path} redirect`, async () => {
    const response = await request(`${origin}${path}`, { redirect: 'manual' });
    if (response.status !== 301) throw new Error(`expected 301, got ${response.status}`);
    const location = new URL(response.headers.get('location'), `${origin}${path}`).href;
    if (location !== `${origin}${target}` && location !== `https://gptbot.uz${target}`) {
      throw new Error(`unexpected location ${location}`);
    }
    return { status: response.status, location };
  });
}

async function expect404(origin, path) {
  return eventually(`${origin}${path} 404`, async () => {
    const response = await request(`${origin}${path}?release=${releaseSha}`, { redirect: 'manual' });
    if (response.status !== 404) throw new Error(`expected 404, got ${response.status}`);
    const body = await response.text();
    if (!/noindex\s*,?\s*nofollow/i.test(body)) throw new Error('noindex,nofollow is missing');
    return true;
  });
}

async function expectWorkerAuth(origin, path) {
  return eventually(`${origin}${path} worker auth`, async () => {
    const response = await request(`${origin}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    const body = await response.json().catch(() => ({}));
    if (response.status !== 401 || body.error !== 'crawler_unauthorized') {
      throw new Error(`expected 401 crawler_unauthorized, got ${response.status} ${body.error ?? ''}`);
    }
    return true;
  });
}

async function crawlSitemap(origin) {
  const sitemapResponse = await request(`${origin}/sitemap.xml?release=${releaseSha}`);
  if (!sitemapResponse.ok) throw new Error(`${origin}: sitemap HTTP ${sitemapResponse.status}`);
  const sitemap = await sitemapResponse.text();
  const urls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim()))];
  if (urls.length !== 260) throw new Error(`${origin}: expected 260 sitemap URLs, got ${urls.length}`);
  for (const retired of ['/ru/telegram-bot-uzbekistan/','/gpt-uzbek-tilida/','/gpt-chat/','/ru/gpt-bot-dlya-biznesa/','/ru/bot-dlya-obrabotki-zayavok/']) {
    if (sitemap.includes(`<loc>https://gptbot.uz${retired}</loc>`)) throw new Error(`${origin}: retired URL remains in sitemap: ${retired}`);
  }
  let cursor = 0;
  const results = new Array(urls.length);
  async function worker() {
    while (cursor < urls.length) {
      const index = cursor++;
      const canonicalUrl = urls[index];
      const fetchUrl = origin.includes('pages.dev') ? canonicalUrl.replace('https://gptbot.uz', origin) : canonicalUrl;
      const response = await request(`${fetchUrl}?release=${releaseSha}`);
      const html = await response.text();
      results[index] = {
        url: canonicalUrl,
        status: response.status,
        canonical: canonicalOf(html),
        noindex: /<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html),
      };
    }
  }
  await Promise.all(Array.from({ length: 10 }, worker));
  const bad = results.filter((item) => item.status !== 200 || item.canonical !== item.url || item.noindex);
  if (bad.length) throw new Error(`${origin}: sitemap validation failed ${JSON.stringify(bad.slice(0, 5))}`);
  return urls.length;
}

const evidence = {
  checkedAt: new Date().toISOString(),
  releaseSha,
  deploymentId,
  deploymentUrl,
  artifactSha256: expected.artifactSha256,
  origins: {},
  crawlerHeartbeat: {},
};

for (const origin of origins) {
  const manifest = await expectedManifest(origin);
  for (const path of [
    '/', '/robots.txt', '/sitemap.xml', '/ru/internet-reklama-tashkent/',
    '/uz/internet-reklama-toshkent/', '/ru/telegram-bot-dlya-biznesa/', '/admin/lead-radar',
  ]) {
    await eventually(`${origin}${path} availability`, async () => {
      const response = await request(`${origin}${path}?release=${releaseSha}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return true;
    });
  }
  const home = await (await request(`${origin}/?release=${releaseSha}`)).text();
  if (/SearchAction|search_term_string|query-input/.test(home)) throw new Error(`${origin}: obsolete SearchAction remains`);
  const admin = manifest.probes.find((item) => /^assets\/AdminRoot-.*\.js$/.test(item.path));
  if (!admin) throw new Error(`${origin}: admin probe missing`);
  const adminText = await (await request(`${origin}/${admin.path}?release=${releaseSha}`)).text();
  for (const marker of [
    'Локальный сборщик', 'Собрать контакты с сайта',
    '/api/admin/lead-radar/crawler/status', '/api/admin/lead-radar/crawler/jobs',
  ]) {
    if (!adminText.includes(marker)) throw new Error(`${origin}: admin marker missing: ${marker}`);
  }
  await eventually(`${origin} owner crawler auth`, async () => {
    const response = await request(`${origin}/api/admin/lead-radar/crawler/status?companyId=test`);
    const body = await response.json().catch(() => ({}));
    if (response.status !== 401 || body.error !== 'missing_token') {
      throw new Error(`expected 401 missing_token, got ${response.status} ${body.error ?? ''}`);
    }
  });
  for (const path of [
    '/api/lead-radar/crawler/jobs', '/api/lead-radar/crawler/claim',
    '/api/lead-radar/crawler/heartbeat', '/api/lead-radar/crawler/receipt',
  ]) await expectWorkerAuth(origin, path);

  await expectRedirect(origin, '/ru/blog/?q=%7Bsearch_term_string%7D', '/ru/blog/');
  await expectRedirect(origin, '/ru/telegram-bot-uzbekistan/', '/ru/telegram-bot-dlya-biznesa/');
  await expectRedirect(origin, '/gpt-uzbek-tilida/', '/uz/gpt-uzbek-tilida/');
  await expectRedirect(origin, '/gpt-chat/', '/ru/gpt-chat/');
  for (const path of ['/cabinet','/oauth','/api','/callback','/reset-password','/auth','/account']) {
    await expect404(origin, path);
  }
  const telegram = await (await request(`${origin}/ru/telegram-bot-dlya-biznesa/?release=${releaseSha}`)).text();
  if (!/Узбекистан/.test(telegram)) throw new Error(`${origin}: Telegram owner lacks Uzbekistan intent`);
  if (canonicalOf(telegram) !== 'https://gptbot.uz/ru/telegram-bot-dlya-biznesa/') {
    throw new Error(`${origin}: Telegram owner canonical mismatch`);
  }
  const sitemapCount = await crawlSitemap(origin);
  evidence.origins[origin] = {
    manifestPass: true,
    publicShellPass: true,
    searchActionAbsent: true,
    redirectsPass: true,
    private404Pass: true,
    sitemapCount,
    sitemapSelfCanonicalPass: true,
    crawlerRoutesAuthFirst: true,
    crawlerUiPass: true,
  };
}

const www = await eventually('www canonical redirect', async () => {
  const response = await request(`https://www.gptbot.uz/uz/chat-bot-narxi/?release=${releaseSha}`, { redirect: 'manual' });
  const location = response.headers.get('location');
  if (response.status !== 301 || !location || new URL(location, 'https://www.gptbot.uz').hostname !== 'gptbot.uz') {
    throw new Error(`status=${response.status} location=${location}`);
  }
  return { status: response.status, location };
});
evidence.wwwCanonicalRedirect = www;

const preSeen = pre.workers?.last_seen_at ? new Date(pre.workers.last_seen_at).valueOf() : NaN;
const preGenerated = pre.generatedAt ? new Date(pre.generatedAt).valueOf() : Date.now();
const preFresh = Number.isFinite(preSeen) && Number.isFinite(preGenerated) && preGenerated - preSeen <= 120_000;
let post = null;
for (let attempt = 0; attempt < (preFresh ? 24 : 1); attempt += 1) {
  const response = await request(
    `${previewUrl}/api/internal/release-directory-probe?token=${encodeURIComponent(probeToken)}&after=${Date.now()}`,
  );
  if (!response.ok) throw new Error(`post-deploy directory probe HTTP ${response.status}`);
  post = await response.json();
  if (post.error) throw new Error(post.error);
  const postSeen = post.workers?.last_seen_at ? new Date(post.workers.last_seen_at).valueOf() : NaN;
  if (!preFresh || (Number.isFinite(postSeen) && postSeen > preSeen)) break;
  await sleep(5_000);
}
const postSeen = post?.workers?.last_seen_at ? new Date(post.workers.last_seen_at).valueOf() : NaN;
if (preFresh && (!Number.isFinite(postSeen) || postSeen <= preSeen)) {
  throw new Error('fresh Local Collector worker stopped heartbeating after deployment');
}
if (!post?.migrations?.some((row) => row.name === '0056_lead_radar_crawler.sql')) {
  throw new Error('crawler migration disappeared after deployment');
}
if (Number(post?.workers?.active_count ?? 0) < 1) throw new Error('no active Local Collector worker after deployment');
if (!Number.isSafeInteger(post?.directory?.elapsedMs) || post.directory.elapsedMs > 20_000) {
  throw new Error(`post-deploy directory projection exceeded safety budget: ${post?.directory?.elapsedMs}`);
}
writeJson('evidence/directory-postdeploy-safe.json', post);
evidence.crawlerHeartbeat = {
  preFresh,
  preLastSeenAt: pre.workers?.last_seen_at ?? null,
  postLastSeenAt: post.workers?.last_seen_at ?? null,
  advanced: preFresh ? postSeen > preSeen : null,
  activeWorkers: Number(post.workers?.active_count ?? 0),
  directory: post.directory,
};
evidence.canary = 'pass';
writeJson('evidence/deployment-evidence.json', evidence);
console.log('PRODUCTION_CANARY=pass');
