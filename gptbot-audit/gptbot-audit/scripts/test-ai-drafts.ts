// Unit tests for the AI Draft Inbox ingestion validator.
//
// Runs via `tsx scripts/test-ai-drafts.ts`. Exits non-zero on any failure.

import { validateIncomingBundle } from '../functions/lib/ai-drafts/validators';

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function makeArticle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    locale: 'ru',
    slug: 'ai-bot-dlya-restorana-test',
    meta_title: 'AI-бот для ресторана: задачи в зале и на доставке',
    meta_description: 'Бронирование столов, типовые вопросы, статус заказа, лояльность: что AI-бот реально закрывает в ресторане, кафе и доставке Ташкента.',
    h1: 'AI-бот для ресторана: реальные задачи',
    excerpt: 'Разбираем, что AI-бот в ресторане делает на самом деле.',
    target_keyword: 'AI-бот для ресторана',
    target_money_page: '/ru/ai-bot-dlya-horeca/',
    author: 'GPTBot',
    body_blocks: [
      { type: 'p', text: 'AI-бот работает в зале и на доставке.' },
      { type: 'h2', text: 'Что бот делает' },
      { type: 'list', items: ['Принимает бронирования', 'Отвечает на вопросы'] },
    ],
    faq: [
      { q: 'Сколько стоит?', a: 'От 3 000 000 сум в месяц в зависимости от объёма.' },
    ],
    internal_links: [
      { target: '/ru/ai-bot-dlya-horeca/', anchor: 'AI-бот HoReCa', type: 'contextual' },
    ],
    schemas: ['Article', 'FAQPage', 'BreadcrumbList'],
    ...overrides,
  };
}

function makeBundle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 'gptbot.article-draft.v1',
    source: 'n8n-seo-autopilot',
    bundle_id: 'n8n-test-bundle-1234',
    execution_id: 'exec-001',
    seo_brief: { topic: 'test' },
    validation: { passed: true, issues: [] },
    articles: [makeArticle()],
    ...overrides,
  };
}

function assert(name: string, cond: boolean, detail?: string): void {
  results.push({ name, passed: cond, detail });
}

// 1. happy path
{
  const r = validateIncomingBundle(makeBundle());
  assert('valid RU-only bundle accepted', r.ok && r.bundle?.articles.length === 1, r.errors.map((e) => `${e.path}:${e.message}`).join('; '));
}

// 2. bilingual
{
  const r = validateIncomingBundle(makeBundle({
    articles: [
      makeArticle({ locale: 'ru' }),
      makeArticle({
        locale: 'uz',
        slug: 'restoran-uchun-ai-bot-test',
        meta_title: 'Restoran uchun AI-bot: real vazifalar va imkoniyatlar',
        meta_description: 'Toshkentdagi restoranlar uchun stol band qilish, FAQ va buyurtma statusi: AI-bot zal va yetkazib berishda qanday ishlaydi.',
        h1: 'Restoran uchun AI-bot',
        excerpt: 'AI-bot zal va yetkazib berishda nima qiladi.',
        target_money_page: '/uz/ai-bot-horeca-uchun/',
        target_keyword: 'restoran uchun AI-bot',
      }),
    ],
  }));
  assert('valid RU+UZ bundle accepted', r.ok && r.bundle?.articles.length === 2);
}

// 3. wrong schema_version
{
  const r = validateIncomingBundle(makeBundle({ schema_version: 'gptbot.article-draft.v0' }));
  assert('wrong schema_version rejected', !r.ok && r.errors.some((e) => e.path === 'schema_version'));
}

// 4. missing bundle_id
{
  const r = validateIncomingBundle(makeBundle({ bundle_id: '' }));
  assert('missing bundle_id rejected', !r.ok && r.errors.some((e) => e.path === 'bundle_id'));
}

// 5. invalid locale
{
  const r = validateIncomingBundle(makeBundle({ articles: [makeArticle({ locale: 'en' })] }));
  assert('invalid locale rejected', !r.ok && r.errors.some((e) => e.path.includes('locale')));
}

// 6. missing slug
{
  const r = validateIncomingBundle(makeBundle({ articles: [makeArticle({ slug: '' })] }));
  assert('missing slug rejected', !r.ok && r.errors.some((e) => e.path.endsWith('.slug')));
}

// 7. unsupported body block
{
  const r = validateIncomingBundle(makeBundle({ articles: [makeArticle({ body_blocks: [{ type: 'iframe', text: 'evil' }] })] }));
  assert('unsupported body block rejected', !r.ok && r.errors.some((e) => e.message.includes('unsupported body block')));
}

// 8. blocked internal link target
{
  const r = validateIncomingBundle(makeBundle({ articles: [makeArticle({ internal_links: [{ target: '/admin-tools/login', anchor: 'evil', type: 'contextual' }] })] }));
  assert('blocked internal link target rejected', !r.ok && r.errors.some((e) => e.message.includes('blocked')));
}

// 9. money page outside locale tree
{
  const r = validateIncomingBundle(makeBundle({ articles: [makeArticle({ target_money_page: '/uz/ai-bot-horeca-uchun/' })] })); // RU article, UZ money page
  assert('money page outside locale rejected', !r.ok && r.errors.some((e) => e.path.endsWith('.target_money_page')));
}

// 10. duplicate locale
{
  const r = validateIncomingBundle(makeBundle({
    articles: [
      makeArticle({ locale: 'ru', slug: 'one' }),
      makeArticle({ locale: 'ru', slug: 'two' }),
    ],
  }));
  assert('duplicate locale rejected', !r.ok && r.errors.some((e) => e.message.includes('duplicate locale')));
}

// 11. status / publish flags ignored (validator is silent on them)
{
  const r = validateIncomingBundle(makeBundle({ status: 'published', ready_for_publish: true, published: true, manual_approval_required: false }));
  assert('publish flags ignored by validator (store forces pending_review)', r.ok);
}

// 12. mojibake rejected
{
  const r = validateIncomingBundle(makeBundle({
    articles: [makeArticle({ meta_title: 'Ð\u0090\u0418-Ð±Ð¾Ñ\u0082 mojibake test' })],
  }));
  assert('mojibake rejected', !r.ok && r.errors.some((e) => e.message.toLowerCase().includes('mojibake')));
}

// 13. faq missing q
{
  const r = validateIncomingBundle(makeBundle({ articles: [makeArticle({ faq: [{ q: '', a: 'lone answer' }] })] }));
  assert('faq missing q rejected', !r.ok && r.errors.some((e) => e.path.startsWith('articles[0].faq')));
}

// 14. internal link missing anchor
{
  const r = validateIncomingBundle(makeBundle({ articles: [makeArticle({ internal_links: [{ target: '/ru/ai-bot-dlya-horeca/', anchor: '' }] })] }));
  assert('internal link missing anchor rejected', !r.ok && r.errors.some((e) => e.path.startsWith('articles[0].internal_links')));
}

// 15. bundle_id pattern
{
  const r = validateIncomingBundle(makeBundle({ bundle_id: 'has spaces!' }));
  assert('bundle_id with invalid chars rejected', !r.ok && r.errors.some((e) => e.path === 'bundle_id'));
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
