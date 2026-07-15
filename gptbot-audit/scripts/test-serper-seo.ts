/**
 * Offline test harness for Serper SERP Intelligence.
 *
 * Run: yarn tsx scripts/test-serper-seo.ts
 *
 * No real Serper API calls are made — we feed a static raw response into
 * parseSerperResponse and validate every downstream helper:
 *
 *   - parseSerperResponse: organic / related / PAA shapes
 *   - detectIntent: commercial / informational / local / comparison
 *   - detectRank: finds gptbot.uz inside top10
 *   - buildFaqIdeas: dedup + PAA-first ordering
 *   - buildContentGaps: skips terms already in our title/description
 *   - buildDigest:  digest is within 4 KB cap
 *   - cacheKey:    is stable for the same inputs
 *   - countQueriesToday: counts only fresh runs, not cached
 */
import {
  parseSerperResponse,
} from '../functions/lib/serper/client';
import {
  buildContentGaps,
  buildDigest,
  buildFaqIdeas,
  detectIntent,
  detectRank,
  digestWithinCap,
} from '../functions/lib/serper/digest';
import { cacheKey, countQueriesToday } from '../functions/lib/serper/store';
import type { SerpRunLog, SerpSnapshot } from '../src/shared/serp';

let passed = 0; let total = 0;
function check(name: string, ok: boolean, extra?: string) {
  total += 1;
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); }
  else    { console.log(`  ✗ ${name}${extra ? `\n     ${extra}` : ''}`); }
}

console.log('\n=== Serper SERP Intelligence — offline harness ===\n');

// -------------------------------------------------------------------------
// 1. parseSerperResponse: organic / related / PAA shapes
// -------------------------------------------------------------------------
const RAW_OK = {
  organic: [
    { position: 1, link: 'https://gptbot.uz/ru/ai-bot-dlya-biznesa/', title: 'AI-бот для бизнеса в Узбекистане', snippet: 'Подключаем AI-бот к Telegram и Instagram.' },
    { position: 2, link: 'https://competitor.uz/blog/ai-bot/',      title: 'AI-боты для бизнеса — обзор и цены',     snippet: 'Сравниваем AI-боты на рынке Узбекистана.' },
    { position: 3, link: 'https://example.com/ai',                  title: 'AI chatbot 2025 guide',                   snippet: 'Top chatbot tools and pricing.' },
  ],
  relatedSearches: [
    { query: 'AI бот для бизнеса цена' },
    { query: 'как настроить AI бот в телеграм' },
    { query: 'AI бот для инстаграм' },
  ],
  peopleAlsoAsk: [
    { question: 'Сколько стоит AI бот?', snippet: 'Зависит от объёма заявок.' },
    { question: 'Как подключить AI бот к Telegram?', snippet: 'Через webhook и API.' },
  ],
};
const params = { q: 'AI бот для бизнеса Ташкент', locale: 'ru' as const, gl: 'uz', hl: 'ru', num: 10, location: 'Tashkent, Uzbekistan' };
const snap = parseSerperResponse(RAW_OK, params);
check('1. parser: 3 organic items kept', snap.organic.length === 3);
check('1. parser: first result is gptbot.uz', snap.organic[0].domain === 'gptbot.uz');
check('1. parser: related count = 3', snap.related.length === 3);
check('1. parser: PAA count = 2', snap.questions.length === 2);

// -------------------------------------------------------------------------
// 2. detectIntent
// -------------------------------------------------------------------------
check('2. intent: commercial ("купить")', detectIntent('AI бот купить') === 'commercial');
check('2. intent: informational ("гайд")', detectIntent('AI бот гайд') === 'informational');
check('2. intent: local ("Ташкент")', detectIntent('AI бот Ташкент') === 'local');
check('2. intent: comparison ("vs")', detectIntent('chatgpt vs gemini') === 'comparison');

// -------------------------------------------------------------------------
// 3. detectRank
// -------------------------------------------------------------------------
const rank = detectRank(snap, 'gptbot.uz');
check('3. rank: found gptbot.uz at #1', rank.found && rank.position === 1);
const rankMiss = detectRank({ ...snap, organic: snap.organic.slice(1) }, 'gptbot.uz');
check('3. rank: missing if gptbot.uz absent', rankMiss.found === false);

// -------------------------------------------------------------------------
// 4. buildFaqIdeas
// -------------------------------------------------------------------------
const faq = buildFaqIdeas(snap);
check('4. faqIdeas: PAA-first ordering', faq.length >= 2 && faq[0].source === 'paa');

// -------------------------------------------------------------------------
// 5. buildContentGaps
// -------------------------------------------------------------------------
const gaps = buildContentGaps(snap, 'AI-бот для бизнеса Telegram Instagram');
// "instagram" and "telegram" are already in own text → must NOT be a gap.
check('5. gaps: own terms excluded',
  gaps.every((g) => !['instagram', 'telegram', 'бизнеса'].includes(g.topic.toLowerCase())));

// -------------------------------------------------------------------------
// 6. buildDigest within 4 KB cap
// -------------------------------------------------------------------------
const digest = buildDigest({ snapshot: snap, cached: false, ownTitle: 'Our AI bot' });
const sz = digestWithinCap(digest);
check(`6. digest: <= 4 KB (got ${sz.bytes} bytes)`, sz.ok);
check('6. digest: topCompetitors capped at 5', digest.topCompetitors.length <= 5);
check('6. digest: faqIdeas capped at 5', digest.faqIdeas.length <= 5);
check('6. digest: relatedSearches capped at 5', digest.relatedSearches.length <= 5);
check('6. digest: rankSpotCheck filled', digest.rankSpotCheck.found === true);

// -------------------------------------------------------------------------
// 7. cacheKey stability
// -------------------------------------------------------------------------
const k1 = cacheKey({ locale: 'ru', gl: 'uz', hl: 'ru', location: 'Tashkent', query: 'AI бот' });
const k2 = cacheKey({ locale: 'ru', gl: 'uz', hl: 'ru', location: 'Tashkent', query: 'AI бот' });
const k3 = cacheKey({ locale: 'uz', gl: 'uz', hl: 'uz', location: 'Tashkent', query: 'AI bot' });
check('7. cacheKey: stable for same inputs', k1 === k2);
check('7. cacheKey: different locale → different key', k1 !== k3);

// -------------------------------------------------------------------------
// 8. countQueriesToday — only counts non-cached
// -------------------------------------------------------------------------
const today = new Date();
const todayISO = today.toISOString();
const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString();
const runs: SerpRunLog[] = [
  { runId: 'r1', query: 'q', locale: 'ru', gl: 'uz', hl: 'ru', forUrl: null, status: 'queried', cached: false, resultPositions: 10, rankFound: false, createdAt: todayISO,    credits: 1 },
  { runId: 'r2', query: 'q', locale: 'ru', gl: 'uz', hl: 'ru', forUrl: null, status: 'cached',  cached: true,  resultPositions: 10, rankFound: false, createdAt: todayISO,    credits: 0 },
  { runId: 'r3', query: 'q', locale: 'ru', gl: 'uz', hl: 'ru', forUrl: null, status: 'queried', cached: false, resultPositions: 10, rankFound: false, createdAt: yesterday,   credits: 1 },
];
check('8. countQueriesToday: only counts today\'s non-cached', countQueriesToday(runs, today) === 1);

// -------------------------------------------------------------------------
// 9. Snapshot does not retain raw upstream junk
// -------------------------------------------------------------------------
const RAW_NOISY = {
  organic: [{ position: 1, link: 'https://x.com', title: 'X'.repeat(500), snippet: 'Y'.repeat(900) }],
  somethingElse: { foo: 'bar' },
};
const noisy = parseSerperResponse(RAW_NOISY, params);
check('9. parser: long title trimmed to <= 140', noisy.organic[0].title.length <= 140);
check('9. parser: long snippet trimmed to <= 220', noisy.organic[0].snippet.length <= 220);
check('9. parser: ignores unknown top-level keys', !('somethingElse' in noisy));

// -------------------------------------------------------------------------
// 10. parser: empty / malformed input does not throw
// -------------------------------------------------------------------------
const emptySnap: SerpSnapshot = parseSerperResponse({}, params);
check('10. parser: empty raw → empty arrays', emptySnap.organic.length === 0 && emptySnap.related.length === 0 && emptySnap.questions.length === 0);
const nullSnap = parseSerperResponse(null, params);
check('10. parser: null raw safe',  nullSnap.organic.length === 0);

// -------------------------------------------------------------------------
// 11. digest with empty snapshot still valid
// -------------------------------------------------------------------------
const emptyDigest = buildDigest({ snapshot: emptySnap, cached: false });
check('11. digest: empty snapshot has rankSpotCheck.found=false', emptyDigest.rankSpotCheck.found === false);
check('11. digest: empty snapshot within cap', digestWithinCap(emptyDigest).ok);

// -------------------------------------------------------------------------
// 12. /admin-tools and /api never appear in suggestions (safety filter)
// -------------------------------------------------------------------------
const adminContaminated: SerpSnapshot = parseSerperResponse({
  organic: [
    { position: 1, link: 'https://gptbot.uz/admin-tools/seo-booster', title: 'Admin', snippet: 'admin tools' },
    { position: 2, link: 'https://gptbot.uz/api/seo/serper/query', title: 'API', snippet: 'api endpoint' },
  ],
  relatedSearches: [{ query: '/admin-tools' }],
}, params);
const adminDigest = buildDigest({ snapshot: adminContaminated, cached: false });
// The digest itself can legitimately mirror the upstream content (we are
// only inspecting the SERP, not publishing it). What we MUST guarantee:
// the AI Autopilot prompt never instructs the model to *link* to those URLs.
// The prompt builder is the layer that enforces this. We assert here that
// the digest's *contentGaps* never contain the literal admin/api tokens.
check('12. safety: contentGaps never include admin/api tokens',
  adminDigest.contentGaps.every((g) => !g.topic.includes('/admin') && !g.topic.includes('/api')));

// -------------------------------------------------------------------------
console.log(`\n${passed}/${total} tests passed.`);
if (passed !== total) process.exit(1);
