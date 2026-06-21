// Unit tests for the SEO Autopilot bridge:
//   - n8n response normaliser (gptbot.article-draft.v1 mapping)
//   - bundle_id determinism (idempotency)
//
// Runs via `tsx scripts/test-seo-autopilot.ts`. Exits non-zero on failure.

import { normaliseN8nResponse } from '../functions/lib/seo-autopilot/normalise';
import { validateIncomingBundle } from '../functions/lib/ai-drafts/validators';

interface T { name: string; passed: boolean; detail?: string }
const results: T[] = [];

function makeRuArticle(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    locale: 'ru',
    slug: 'ai-bot-bridge-test',
    meta_title: 'AI-бот для ресторана: задачи в зале и на доставке',
    meta_description: 'Бронирование столов, типовые вопросы, статус заказа, лояльность: что AI-бот реально закрывает в ресторане, кафе и доставке Ташкента.',
    h1: 'AI-бот для ресторана: реальные задачи',
    excerpt: 'AI-бот в ресторане делает на самом деле: бронирование, FAQ, доставка.',
    target_keyword: 'AI-бот для ресторана',
    target_money_page: '/ru/ai-bot-dlya-horeca/',
    author: 'GPTBot',
    body_blocks: [
      { type: 'p', text: 'AI-бот в ресторане работает в зале и на доставке.' },
      { type: 'h2', text: 'Что бот делает' },
    ],
    faq: [{ q: 'Сколько стоит?', a: 'От 3 000 000 сум в месяц.' }],
    internal_links: [{ target: '/ru/ai-bot-dlya-horeca/', anchor: 'AI-бот HoReCa', type: 'contextual' }],
    schemas: ['Article', 'FAQPage', 'BreadcrumbList'],
    ...over,
  };
}

function makeUzArticle(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    locale: 'uz',
    slug: 'restoran-uchun-ai-bot-bridge-test',
    meta_title: 'Restoran uchun AI-bot: real vazifalar va imkoniyatlar',
    meta_description: "Toshkentdagi restoranlar uchun stol band qilish, FAQ va buyurtma statusi bo'yicha AI-bot real vazifalari.",
    h1: 'Restoran uchun AI-bot',
    excerpt: 'Restoran uchun AI-bot zal va yetkazib berishda ishlaydi.',
    target_keyword: 'restoran uchun AI-bot',
    target_money_page: '/uz/ai-bot-horeca-uchun/',
    author: 'GPTBot',
    body_blocks: [{ type: 'p', text: "AI-bot ikki frontda ishlaydi." }],
    faq: [{ q: 'Narxi qancha?', a: 'Oyiga 3 000 000 sum dan.' }],
    internal_links: [{ target: '/uz/ai-bot-horeca-uchun/', anchor: 'HoReCa AI-bot', type: 'contextual' }],
    schemas: ['Article', 'FAQPage', 'BreadcrumbList'],
    ...over,
  };
}

function expect(name: string, cond: boolean, detail?: string): void {
  results.push({ name, passed: cond, detail });
}

// ----------------------------------------------------------------------------
// 1. Standard n8n shape with separate ru_article / uz_article objects.
{
  const n8nBody = {
    status: 'manual_approval_required',
    manual_approval_required: true,
    ready_for_publish: false,
    execution_id: 'n8n-exec-abc-123',
    ru_article: makeRuArticle(),
    uz_article: makeUzArticle(),
    seo_brief: { topic: 'restoran bot' },
    validation: { passed: true, issues: [] },
  };
  const r = normaliseN8nResponse(n8nBody, { jobId: 'job_test_1', requestId: null });
  expect('normalises ru_article + uz_article', r.ok && r.bundle.articles.length === 2);
  if (r.ok) {
    expect('bundle_id derived from n8n execution_id',
      r.bundle.bundle_id === 'n8n-bridge-n8n-exec-abc-123', r.bundle.bundle_id);
    expect('source is n8n-seo-autopilot-bridge',
      r.bundle.source === 'n8n-seo-autopilot-bridge');
    expect('schema_version is v1', r.bundle.schema_version === 'gptbot.article-draft.v1');
    // Round-trip through validator (full safety check).
    const v = validateIncomingBundle(r.bundle);
    expect('normalised bundle passes the strict ingest validator', v.ok,
      (v.errors || []).map((e) => `${e.path}:${e.message}`).join('; '));
  }
}

// 2. n8n returns nested `package` wrapper.
{
  const n8nBody = {
    package: {
      ru_article: makeRuArticle(),
      uz_article: makeUzArticle(),
      validation: { passed: true, issues: [] },
      execution_id: 'wrapped-exec',
    },
  };
  const r = normaliseN8nResponse(n8nBody, { jobId: 'job_test_2', requestId: null });
  expect('unwraps n8n `package` wrapper', r.ok && r.bundle.articles.length === 2);
  if (r.ok) expect('bundle_id picks the inner execution_id', r.bundle.bundle_id === 'n8n-bridge-wrapped-exec');
}

// 3. RU-only bundle.
{
  const r = normaliseN8nResponse({
    ru_article: makeRuArticle(),
    validation: { passed: true, issues: [] },
  }, { jobId: 'job_ru_only', requestId: null });
  expect('RU-only bundle accepted', r.ok && r.bundle.articles.length === 1 && r.bundle.articles[0].locale === 'ru');
}

// 4. UZ-only bundle.
{
  const r = normaliseN8nResponse({
    uz_article: makeUzArticle(),
    validation: { passed: true, issues: [] },
  }, { jobId: 'job_uz_only', requestId: null });
  expect('UZ-only bundle accepted', r.ok && r.bundle.articles.length === 1 && r.bundle.articles[0].locale === 'uz');
}

// 5. Missing articles entirely.
{
  const r = normaliseN8nResponse({ validation: { passed: true, issues: [] } }, { jobId: 'job_x', requestId: null });
  expect('missing articles rejected', !r.ok && (r as { reason: string }).reason.includes('missing both'));
}

// 6. Validation failure flag survives normalisation.
{
  const r = normaliseN8nResponse({
    ru_article: makeRuArticle(),
    validation: { passed: false, issues: [{ rule: 'something', message: 'bad' }] },
  }, { jobId: 'job_v_fail', requestId: null });
  expect('validation.passed=false retained', r.ok && r.meta.validation_passed === false && r.meta.validation_issue_count === 1);
}

// 7. Alternative field names (title vs meta_title).
{
  const r = normaliseN8nResponse({
    ru_article: makeRuArticle({ meta_title: undefined, title: 'AI-бот для ресторана: задачи в зале и на доставке' }),
    validation: { passed: true, issues: [] },
  }, { jobId: 'job_alias', requestId: null });
  expect('accepts title -> meta_title alias', r.ok && (r.bundle.articles[0] as { meta_title: string }).meta_title.includes('задачи'));
}

// 8. Articles array shape (instead of ru_article/uz_article).
{
  const r = normaliseN8nResponse({
    articles: [makeRuArticle(), makeUzArticle()],
    validation: { passed: true, issues: [] },
    execution_id: 'arr-exec',
  }, { jobId: 'job_arr', requestId: null });
  expect('accepts flat articles[] shape', r.ok && r.bundle.articles.length === 2);
}

// 9. Non-object body.
{
  const r = normaliseN8nResponse('hi', { jobId: 'job_str', requestId: null });
  expect('rejects non-object body', !r.ok);
}

// 10. n8n returns publish flags=true — bridge must FORCE them safe.
{
  const r = normaliseN8nResponse({
    ru_article: makeRuArticle(),
    uz_article: makeUzArticle(),
    validation: { passed: true, issues: [] },
    status: 'published',                   // ← attempted override
    manual_approval_required: false,        // ← attempted override
    ready_for_publish: true,                // ← attempted override
    published: true,                        // ← attempted override
  }, { jobId: 'job_override', requestId: null });
  expect('publish overrides ignored by normaliser', r.ok &&
    r.bundle.status === 'pending_review' &&
    r.bundle.manual_approval_required === true &&
    r.bundle.ready_for_publish === false &&
    r.bundle.published === false);
  // And the strict validator must also accept it (it ignores those flags).
  if (r.ok) {
    const v = validateIncomingBundle(r.bundle);
    expect('forced-safe bundle still passes validator', v.ok);
  }
}

// 11. Determinism — same execution_id → same bundle_id (idempotency).
{
  const a = normaliseN8nResponse({ ru_article: makeRuArticle(), validation: { passed: true, issues: [] }, execution_id: 'same-exec' }, { jobId: 'job_a', requestId: null });
  const b = normaliseN8nResponse({ ru_article: makeRuArticle(), validation: { passed: true, issues: [] }, execution_id: 'same-exec' }, { jobId: 'job_b', requestId: null });
  expect('same execution_id → same bundle_id across jobs', a.ok && b.ok && a.bundle.bundle_id === b.bundle.bundle_id);
}

// 12. No execution_id → bundle_id falls back to job_id.
{
  const r = normaliseN8nResponse({ ru_article: makeRuArticle(), validation: { passed: true, issues: [] } }, { jobId: 'job_fallback_xyz', requestId: null });
  expect('fallback bundle_id includes job_id', r.ok && r.bundle.bundle_id === 'n8n-bridge-job_fallback_xyz');
}

// 13. Sanitises bad chars in execution_id.
{
  const r = normaliseN8nResponse({ ru_article: makeRuArticle(), validation: { passed: true, issues: [] }, execution_id: 'has space & weird/chars!' }, { jobId: 'job_clean', requestId: null });
  expect('execution_id sanitised in bundle_id', r.ok && r.bundle.bundle_id === 'n8n-bridge-hasspaceweirdchars');
}

// 14. body_blocks type alias "paragraph" → "p" (real n8n output).
{
  const r = normaliseN8nResponse({
    ru_article: makeRuArticle({ body_blocks: [
      { type: 'paragraph', text: 'AI-бот реально автоматизирует ответы клиентам.' },
      { type: 'heading_2', text: 'Возможности' },
      { type: 'bullet_list', items: ['ответы 24/7', 'crm-интеграция'] },
    ] }),
    validation: { passed: true, issues: [] },
  }, { jobId: 'job_block_alias', requestId: null });
  if (r.ok) {
    const a = r.bundle.articles[0] as Record<string, unknown>;
    const blocks = a.body_blocks as Array<{ type: string }>;
    expect('paragraph → p', blocks[0].type === 'p', JSON.stringify(blocks[0]));
    expect('heading_2 → h2', blocks[1].type === 'h2', JSON.stringify(blocks[1]));
    expect('bullet_list → list', blocks[2].type === 'list', JSON.stringify(blocks[2]));
    // Round-trip through strict validator now passes.
    const v = validateIncomingBundle(r.bundle);
    expect('normalised paragraph blocks pass strict validator', v.ok, (v.errors || []).map((e) => `${e.path}:${e.message}`).join('; '));
  } else {
    expect('paragraph alias normalisation ok', false);
  }
}

// 15. FAQ alias {question, answer} → {q, a}.
{
  const r = normaliseN8nResponse({
    ru_article: makeRuArticle({ faq: [
      { question: 'Сколько стоит?', answer: 'От 3 000 000 сум.' },
      { Q: 'Как быстро?', A: 'За неделю.' },
    ] }),
    validation: { passed: true, issues: [] },
  }, { jobId: 'job_faq_alias', requestId: null });
  if (r.ok) {
    const a = r.bundle.articles[0] as Record<string, unknown>;
    const faq = a.faq as Array<{ q: string; a: string }>;
    expect('question/answer → q/a', faq[0].q === 'Сколько стоит?' && faq[0].a === 'От 3 000 000 сум.', JSON.stringify(faq[0]));
    expect('Q/A → q/a', faq[1].q === 'Как быстро?' && faq[1].a === 'За неделю.', JSON.stringify(faq[1]));
    const v = validateIncomingBundle(r.bundle);
    expect('normalised faq passes strict validator', v.ok, (v.errors || []).map((e) => `${e.path}:${e.message}`).join('; '));
  } else {
    expect('faq alias normalisation ok', false);
  }
}

// 16. Internal links alias {url, anchor} / {href, label} / {link, text} → {target, anchor}.
{
  const r = normaliseN8nResponse({
    ru_article: makeRuArticle({ internal_links: [
      { url: '/ru/ai-bot-dlya-horeca/', anchor: 'HoReCa' },
      { href: '/ru/ai-bot-instagram/', label: 'Instagram bot' },
      { link: '/ru/ai-bot-telegram/', text: 'Telegram bot' },
      'https://gptbot.uz/ru/ai-bot-dlya-klinik/',
    ] }),
    validation: { passed: true, issues: [] },
  }, { jobId: 'job_link_alias', requestId: null });
  if (r.ok) {
    const a = r.bundle.articles[0] as Record<string, unknown>;
    const links = a.internal_links as Array<{ target: string; anchor: string }>;
    expect('url/anchor → target/anchor', links[0].target === '/ru/ai-bot-dlya-horeca/' && links[0].anchor === 'HoReCa', JSON.stringify(links[0]));
    expect('href/label → target/anchor', links[1].target === '/ru/ai-bot-instagram/' && links[1].anchor === 'Instagram bot', JSON.stringify(links[1]));
    expect('link/text → target/anchor', links[2].target === '/ru/ai-bot-telegram/' && links[2].anchor === 'Telegram bot', JSON.stringify(links[2]));
    expect('absolute gptbot.uz URL → relative', links[3].target === '/ru/ai-bot-dlya-klinik/', JSON.stringify(links[3]));
    const v = validateIncomingBundle(r.bundle);
    expect('normalised links pass strict validator', v.ok, (v.errors || []).map((e) => `${e.path}:${e.message}`).join('; '));
  } else {
    expect('link alias normalisation ok', false);
  }
}

// 17. target_money_page absolute URL → relative, and locale-rescoping.
{
  const r = normaliseN8nResponse({
    ru_article: makeRuArticle({ target_money_page: 'https://gptbot.uz/services' }),
    uz_article: makeUzArticle({ target_money_page: 'https://gptbot.uz/services' }),
    validation: { passed: true, issues: [] },
  }, { jobId: 'job_mp', requestId: null });
  if (r.ok) {
    const ru = r.bundle.articles[0] as Record<string, unknown>;
    const uz = r.bundle.articles[1] as Record<string, unknown>;
    expect('RU money_page rescoped under /ru/', ru.target_money_page === '/ru/services', String(ru.target_money_page));
    expect('UZ money_page rescoped under /uz/', uz.target_money_page === '/uz/services', String(uz.target_money_page));
    const v = validateIncomingBundle(r.bundle);
    expect('rescoped money_page passes strict validator', v.ok, (v.errors || []).map((e) => `${e.path}:${e.message}`).join('; '));
  } else {
    expect('money_page rescoping ok', false);
  }
}

// ---- report ----------------------------------------------------------------
let fail = 0;
for (const r of results) {
  const ok = r.passed ? 'PASS' : 'FAIL';
  console.log(`${ok}  ${r.name}${r.detail && !r.passed ? `  — ${r.detail}` : ''}`);
  if (!r.passed) fail++;
}
console.log(`\nTotal: ${results.length}, passed: ${results.length - fail}, failed: ${fail}`);
if (fail > 0) process.exit(1);
