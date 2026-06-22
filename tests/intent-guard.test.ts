// Unit tests for the Intent Guard subsystem.
// Uses Node's built-in test runner so we don't have to drag in vitest.
//
// Run via:
//   yarn test:intent-guard
//
// Coverage:
//   - fingerprint extraction & locale separation
//   - jaccard + trigram helpers
//   - shortlist self-exclusion + locale separation + money-page priority
//   - risk thresholds + money-page boost
//   - topic suggester uniqueness + dedupe
//   - JSON / fingerprint determinism

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildFingerprint, intentKeyOf, sameIntent } from '../functions/lib/intent-guard/fingerprint.ts';
import { jaccard, trigramSim, shortlistConflicts } from '../functions/lib/intent-guard/deterministic.ts';
import { computeRiskScore } from '../functions/lib/intent-guard/risk.ts';
import { riskLevelFromScore } from '../src/shared/intent-guard.ts';
import { proposeTopics, dedupePlanItems } from '../functions/lib/intent-guard/topic-suggester.ts';
import type { ContentInventory, ContentInventoryItem, IntentFingerprint } from '../src/shared/intent-guard.ts';

function inventoryItem(partial: Partial<ContentInventoryItem> & { locale: 'ru' | 'uz'; id: string; title: string }): ContentInventoryItem {
  const fp = partial.fingerprint || {
    locale: partial.locale,
    primary_entity: 'gpt-bot', search_intent: 'commercial-buy', funnel_stage: 'bottom',
    audience: 'small-business', industry: 'b2c', channel: 'web', geo: 'uzbekistan',
    modifier: 'pricing', content_type: 'guide',
  };
  return {
    source_type: partial.source_type || 'blog',
    id: partial.id,
    url: partial.url || `/${partial.locale}/blog/${partial.id}/`,
    locale: partial.locale,
    title: partial.title,
    h1: partial.h1 || partial.title,
    slug: partial.slug || partial.id,
    status: partial.status || 'published',
    target_keyword: partial.target_keyword || 'gpt бот для бизнеса',
    target_money_page: partial.target_money_page ?? null,
    headings: partial.headings || [],
    faq_questions: partial.faq_questions || [],
    internal_link_targets: partial.internal_link_targets || [],
    fingerprint: fp,
    intent_key: intentKeyOf(fp),
  };
}

describe('fingerprint', () => {
  test('extracts audience + industry + channel from RU title', () => {
    const fp = buildFingerprint({
      locale: 'ru',
      meta_title: 'AI-бот для клиники в Telegram — настройка',
      h1: 'AI-бот для клиники в Telegram',
      target_keyword: 'ai бот для клиники',
      target_money_page: '/ru/ai-bot-dlya-biznesa/',
      slug: 'ai-bot-dlya-kliniki-telegram',
    });
    assert.equal(fp.locale, 'ru');
    assert.equal(fp.audience, 'clinic-owner');
    assert.equal(fp.industry, 'clinic');
    assert.equal(fp.channel, 'telegram');
  });
  test('RU and UZ articles NEVER share an intent key', () => {
    const ru = buildFingerprint({ locale: 'ru', meta_title: 'AI бот для бизнеса', target_keyword: 'ai бот для бизнеса' });
    const uz = buildFingerprint({ locale: 'uz', meta_title: 'AI bot biznes uchun', target_keyword: 'ai bot biznes uchun' });
    assert.notEqual(ru.locale, uz.locale);
    assert.equal(sameIntent(ru, uz), false);
    assert.notEqual(intentKeyOf(ru), intentKeyOf(uz));
  });
});

describe('similarity helpers', () => {
  test('jaccard is symmetric and bounded', () => {
    assert.equal(jaccard([], ['a']), 0);
    assert.equal(jaccard(['a','b','c'], ['a','b','c']), 1);
    const j = jaccard(['gpt','bot','клиник'], ['ai','bot','клиник']);
    assert.ok(j > 0 && j < 1);
  });
  test('trigramSim catches near-duplicate titles', () => {
    const s = trigramSim('AI бот для клиники в Telegram', 'AI боты для клиник в Telegram');
    assert.ok(s > 0.6, `expected >0.6, got ${s}`);
  });
});

describe('shortlistConflicts', () => {
  test('self-exclusion: candidate id never appears in its own conflicts', () => {
    const cand = inventoryItem({ locale: 'ru', id: 'self', title: 'GPT-бот для клиники в Telegram' });
    const inventory = [
      cand,
      inventoryItem({ locale: 'ru', id: 'peer', title: 'GPT-бот для клиники в Telegram — настройка' }),
    ];
    const r = shortlistConflicts({
      locale: 'ru', id: cand.id,
      title: cand.title, h1: cand.h1, slug: cand.slug,
      target_keyword: cand.target_keyword, target_money_page: cand.target_money_page,
      headings: [], faq_questions: [], internal_link_targets: [],
      fingerprint: cand.fingerprint,
    }, inventory);
    assert.equal(r.conflicts.find((c) => c.id === 'self'), undefined);
  });
  test('locale separation: RU candidate never conflicts with UZ items', () => {
    const fpRu: IntentFingerprint = { locale: 'ru', primary_entity: 'gpt-bot', search_intent: 'commercial-buy', funnel_stage: 'bottom', audience: 'small-business', industry: 'b2c', channel: 'telegram', geo: 'uzbekistan', modifier: 'pricing', content_type: 'guide' };
    const fpUz: IntentFingerprint = { ...fpRu, locale: 'uz' };
    const inventory = [
      inventoryItem({ locale: 'uz', id: 'uz-peer', title: 'GPT-bot klinika uchun', target_keyword: 'gpt bot klinika', fingerprint: fpUz }),
    ];
    const r = shortlistConflicts({
      locale: 'ru', id: 'ru-candidate',
      title: 'GPT-бот для клиники в Telegram', h1: 'GPT-бот для клиники',
      slug: 'gpt-bot-klinika', target_keyword: 'gpt бот для клиники',
      target_money_page: '/ru/ai-bot-dlya-biznesa/',
      headings: [], faq_questions: [], internal_link_targets: [],
      fingerprint: fpRu,
    }, inventory);
    assert.equal(r.conflicts.length, 0);
  });
  test('money page priority: money_page outranks blog at the same score', () => {
    const fp: IntentFingerprint = { locale: 'ru', primary_entity: 'gpt-bot', search_intent: 'commercial-buy', funnel_stage: 'bottom', audience: 'small-business', industry: 'clinic', channel: 'telegram', geo: 'uzbekistan', modifier: 'pricing', content_type: 'guide' };
    const inventory = [
      // Identical titles + keywords → identical deterministic similarity score
      // → sort fallback uses source_type priority where money_page > blog.
      inventoryItem({ locale: 'ru', id: 'blog-peer',  title: 'GPT-бот для клиники', target_keyword: 'gpt бот для клиники', source_type: 'blog', fingerprint: fp, slug: 'gpt-bot-klinika' }),
      inventoryItem({ locale: 'ru', id: 'money-peer', title: 'GPT-бот для клиники', target_keyword: 'gpt бот для клиники', source_type: 'money_page', fingerprint: fp, slug: 'gpt-bot-klinika' }),
    ];
    const r = shortlistConflicts({
      locale: 'ru', id: 'cand',
      title: 'GPT-бот для клиники', h1: 'GPT-бот для клиники',
      slug: 'gpt-bot-klinika', target_keyword: 'gpt бот для клиники',
      target_money_page: '/ru/ai-bot-dlya-biznesa/',
      headings: [], faq_questions: [], internal_link_targets: [],
      fingerprint: fp,
    }, inventory);
    assert.equal(r.conflicts[0]?.source_type, 'money_page');
  });
});

describe('risk', () => {
  test('thresholds: 0..29 low, 30..64 medium, 65..100 high', () => {
    assert.equal(riskLevelFromScore(0), 'low');
    assert.equal(riskLevelFromScore(29), 'low');
    assert.equal(riskLevelFromScore(30), 'medium');
    assert.equal(riskLevelFromScore(64), 'medium');
    assert.equal(riskLevelFromScore(65), 'high');
    assert.equal(riskLevelFromScore(100), 'high');
  });
  test('money page conflict gets a meaningful score boost over a blog conflict', () => {
    const blog  = inventoryItem({ locale: 'ru', id: 'b1', title: 'X', source_type: 'blog' });
    const money = inventoryItem({ locale: 'ru', id: 'm1', title: 'X', source_type: 'money_page' });
    // Same-intent path: both conflicts share intent + funnel + audience + industry + money_page,
    // so the money-page direct-commercial boost (+15) applies, blog gets only +6.
    const sim = { keyword_overlap: 0.7, title_similarity: 0.5, h1_similarity: 0.5, slug_similarity: 0.5, heading_overlap: 0.3, same_intent: true, same_funnel: true, same_audience: true, same_industry: true, same_target_money_page: true, score: 60 };
    const blogRisk  = computeRiskScore({ conflicts: [{ ...blog,  similarity: sim, reason: '' }] });
    const moneyRisk = computeRiskScore({ conflicts: [{ ...money, similarity: sim, reason: '' }] });
    assert.ok(moneyRisk.risk_score > blogRisk.risk_score, `money(${moneyRisk.risk_score}) should be > blog(${blogRisk.risk_score})`);
  });
  test('successful retarget — supporting article (different intent + funnel) gets very low score boost', () => {
    // This is the post-retarget scenario: the article now targets a
    // DIFFERENT search intent + funnel than the money page, but still
    // links to it (same_target_money_page=true). The money-page conflict
    // should hardly contribute to risk — the article is supporting, not
    // competing.
    const money = inventoryItem({ locale: 'ru', id: 'm1', title: 'X', source_type: 'money_page' });
    const sim = { keyword_overlap: 0.2, title_similarity: 0.2, h1_similarity: 0.2, slug_similarity: 0.1, heading_overlap: 0.1, same_intent: false, same_funnel: false, same_audience: false, same_industry: false, same_target_money_page: true, score: 30 };
    const r = computeRiskScore({ conflicts: [{ ...money, similarity: sim, reason: '' }] });
    assert.ok(r.risk_score < 40, `expected risk_score < 40 for a supporting article, got ${r.risk_score}`);
    assert.equal(r.risk_level, r.risk_score < 30 ? 'low' : 'medium');
  });
  test('empty conflicts return risk 0/low', () => {
    const r = computeRiskScore({ conflicts: [] });
    assert.equal(r.risk_score, 0);
    assert.equal(r.risk_level, 'low');
  });
});

describe('topic suggester', () => {
  test('returns proposals whose intent_key is unique vs inventory', () => {
    const fpExisting: IntentFingerprint = { locale: 'ru', primary_entity: 'gpt-bot', search_intent: 'informational-howto', funnel_stage: 'middle', audience: 'clinic-owner', industry: 'clinic', channel: 'telegram', geo: 'uzbekistan', modifier: 'integration', content_type: 'how-to' };
    const inventory: ContentInventory = {
      generated_at: new Date().toISOString(),
      items: [inventoryItem({ locale: 'ru', id: 'b1', title: 'AI-бот для клиники Telegram', target_keyword: 'ai бот для клиники', fingerprint: fpExisting })],
      counts: { pages_total: 0, pages_published: 0, blog_total: 1, blog_published: 1, drafts_pending: 0, reservations_active: 0 },
    };
    const proposals = proposeTopics({
      count: 10, locale_mode: 'ru', inventory, reservedActiveIntentKeys: new Set<string>(),
    });
    assert.ok(proposals.length > 0);
    assert.equal(proposals.find((p) => p.intent_key === intentKeyOf(fpExisting)), undefined);
    const seen = new Set<string>();
    for (const p of proposals) {
      assert.equal(seen.has(p.intent_key), false, `duplicate fingerprint among proposals: ${p.intent_key}`);
      seen.add(p.intent_key);
    }
  });
  test('dedupePlanItems removes duplicate locale+intent_key', () => {
    const items = [
      { intent_key: 'a', locale: 'ru' },
      { intent_key: 'a', locale: 'ru' },
      { intent_key: 'a', locale: 'uz' },
      { intent_key: 'b', locale: 'ru' },
    ];
    assert.equal(dedupePlanItems(items).length, 3);
  });
});

describe('retarget constraints', () => {
  test('title/keyword too similar fails iteration 1', async () => {
    const { validateRetargetConstraints } = await import('../functions/lib/intent-guard/retarget-constraints.ts');
    const original = {
      locale: 'ru' as const, slug: 'x', meta_title: 'AI-бот для клиники в Telegram',
      meta_description: 'desc desc desc desc desc desc desc desc desc desc desc desc desc',
      h1: 'AI-бот для клиники в Telegram', excerpt: '', target_keyword: 'ai бот для клиники telegram',
      target_money_page: '/ru/ai-bot/', author: 'X', body_blocks: [], faq: [], internal_links: [],
      schemas: ['Article'] as ('Article')[], keywords: [],
    };
    const fpOld: IntentFingerprint = { locale: 'ru', primary_entity: 'ai-bot', search_intent: 'commercial-service', funnel_stage: 'middle', audience: 'clinic-owner', industry: 'clinic', channel: 'telegram', geo: 'uzbekistan', modifier: 'integration', content_type: 'how-to' };
    // Optimised article: only renamed AI-бот -> GPT-бот. Title trigram still very high.
    const optimised = { ...original, meta_title: 'GPT-бот для клиники в Telegram', h1: 'GPT-бот для клиники в Telegram', target_keyword: 'gpt бот для клиники telegram' };
    const fpNew: IntentFingerprint = { ...fpOld, primary_entity: 'gpt-bot' };
    const report = validateRetargetConstraints({
      original, originalFingerprint: fpOld, optimized: optimised, optimizedFingerprint: fpNew,
      conflicts: [{
        source_type: 'money_page', id: '/ru/ai-bot/', url: '/ru/ai-bot/',
        title: 'AI-боты для клиники', locale: 'ru' as const, intent_key: '',
        fingerprint: fpOld,
        similarity: { keyword_overlap: 1, title_similarity: 1, h1_similarity: 1, slug_similarity: 1, heading_overlap: 0, same_intent: true, same_funnel: true, same_audience: true, same_industry: true, same_target_money_page: true, score: 100 },
        reason: '',
      }],
      iteration: 1,
    });
    assert.equal(report.passed, false, `expected failure, got passed=${report.passed}`);
    assert.ok(report.failures.find((f) => f.code === 'title_too_similar'), 'expected title_too_similar failure');
  });
  test('iteration 2 with proper change_audience passes the constraint set', async () => {
    const { validateRetargetConstraints } = await import('../functions/lib/intent-guard/retarget-constraints.ts');
    const original = {
      locale: 'ru' as const, slug: 'x', meta_title: 'AI-бот для клиники в Telegram',
      meta_description: 'd', h1: 'AI-бот для клиники в Telegram', excerpt: '',
      target_keyword: 'ai бот для клиники telegram', target_money_page: '/ru/ai-bot/',
      author: 'X',
      body_blocks: [{ type: 'h2', text: 'Запись пациентов' }, { type: 'h2', text: 'Ответы 24/7' }],
      faq: [], internal_links: [], schemas: ['Article'] as ('Article')[], keywords: [],
    };
    const fpOld: IntentFingerprint = { locale: 'ru', primary_entity: 'ai-bot', search_intent: 'commercial-service', funnel_stage: 'middle', audience: 'clinic-owner', industry: 'clinic', channel: 'telegram', geo: 'uzbekistan', modifier: 'integration', content_type: 'how-to' };
    // Properly differentiated: different audience, channel, modifier, content_type, intent.
    const optimised = {
      ...original,
      meta_title: 'Как ресторан использует WhatsApp-бота для приёма заказов',
      h1: 'Ресторанный WhatsApp-бот: 7 сценариев приёма заказов',
      target_keyword: 'whatsapp бот для ресторана сценарии',
      body_blocks: [{ type: 'h2', text: 'Сценарии WhatsApp в ресторане' }, { type: 'h2', text: 'Ночные заказы и доставка' }],
    };
    const fpNew: IntentFingerprint = { locale: 'ru', primary_entity: 'whatsapp-bot', search_intent: 'informational-list', funnel_stage: 'top', audience: 'restaurant-owner', industry: 'restaurant', channel: 'whatsapp', geo: 'uzbekistan', modifier: 'guide', content_type: 'listicle' };
    const report = validateRetargetConstraints({
      original, originalFingerprint: fpOld, optimized: optimised, optimizedFingerprint: fpNew,
      conflicts: [],
      iteration: 2,
    });
    assert.ok(report.fingerprintDimsChanged >= 2, `expected ≥2 dims changed, got ${report.fingerprintDimsChanged}`);
    assert.equal(report.passed, true, `expected passed, got failures: ${JSON.stringify(report.failures)}`);
  });
});

describe('intent key determinism', () => {
  test('intentKeyOf is deterministic and prefixed with locale', () => {
    const fp: IntentFingerprint = {
      locale: 'ru', primary_entity: 'gpt-bot', search_intent: 'informational-howto', funnel_stage: 'middle',
      audience: 'clinic-owner', industry: 'clinic', channel: 'telegram', geo: 'uzbekistan',
      modifier: 'integration', content_type: 'how-to',
    };
    assert.equal(intentKeyOf(fp), intentKeyOf(fp));
    assert.ok(intentKeyOf(fp).startsWith('ru|gpt-bot|informational-howto'));
  });
});
