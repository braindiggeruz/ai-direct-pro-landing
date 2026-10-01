import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertSeoProtection, BASELINE, PROTECTED_PATHS, seoContract } from '../scripts/seo-protection';
import type { BlogArticle, Page } from '../src/shared/types';

function fixture(t: { after: (fn: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gptbot-seo-protection-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pages = PROTECTED_PATHS.map(pathname => {
    const html = `<html><head><title>Useful guide</title><meta name="description" content="A real answer"><meta name="robots" content="index,follow"><link rel="canonical" href="https://gptbot.uz${pathname}"><link rel="alternate" hreflang="uz" href="https://gptbot.uz${pathname}"><link rel="stylesheet" href="/assets/index-before.css"></head><body><h1>Helpful answer</h1><p>Original search content</p><a href="/ru/gpt-chat/">Open chat</a><script>window.build='before'</script></body></html>`;
    const file = path.join(root, pathname.slice(1), 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, html);
    return { pathname, contract: seoContract(html) };
  });
  const baseline = path.join(root, 'baseline.json');
  fs.writeFileSync(baseline, JSON.stringify({ schema: 1, pages }));
  return { root, baseline, file: path.join(root, 'index.html') };
}

test('new JS/CSS builds and HTML whitespace do not masquerade as SEO changes', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, fs.readFileSync(f.file, 'utf8').replaceAll('before', 'after').replace('<p>', '\n<p>\n'));
  assert.doesNotThrow(() => assertSeoProtection(f.root, f.baseline));
});

test('a release rejects deleted pages, overwritten content and indexation regressions', t => {
  const f = fixture(t); const original = fs.readFileSync(f.file, 'utf8');
  const cases = [
    ['Useful guide', 'Wrong intent', 'title'], ['Helpful answer', 'Wrong heading', 'h1'],
    ['A real answer', 'Wrong description', 'description'], ['index,follow', 'noindex,follow', 'robots'],
    ['rel="canonical" href="https://gptbot.uz/"', 'rel="canonical" href="https://gptbot.uz/ru/"', 'canonical'],
    ['Original search content', '', 'bodyTextSha256'], ['hreflang="uz"', 'hreflang="ru"', 'hreflang'],
    ['<a href="/ru/gpt-chat/">', '<a href="/wrong/">', 'internalLinks'],
    ['</head>', '<meta name="googlebot" content="noindex"></head>', 'googlebot'],
  ];
  for (const [from, to, field] of cases) {
    fs.writeFileSync(f.file, original.replace(from, to));
    assert.throws(() => assertSeoProtection(f.root, f.baseline), new RegExp(field));
  }
  fs.unlinkSync(f.file);
  assert.throws(() => assertSeoProtection(f.root, f.baseline), /missing HTML/);
});

test('comments cannot conceal missing metadata and all protected URLs remain mandatory', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, fs.readFileSync(f.file, 'utf8').replace('<h1>Helpful answer</h1>', '<!-- <h1>Helpful answer</h1> -->'));
  assert.throws(() => assertSeoProtection(f.root, f.baseline), /h1/);
  const snapshot = JSON.parse(fs.readFileSync(f.baseline, 'utf8'));
  snapshot.pages.pop();
  fs.writeFileSync(f.baseline, JSON.stringify(snapshot));
  assert.throws(() => assertSeoProtection(f.root, f.baseline), /all ten/);
});

// ── Reviewed revisions ───────────────────────────────────────────────────────
// A revision is a new file under docs/seo/evidence/<date>-<name>/ that names
// its predecessor. The gate itself only compares a build with BASELINE; these
// tests make the revision prove what it changed.

type Revision = {
  schema: 1;
  previousRevision?: string;
  previousRevisionSha256?: string;
  reviewedChanges: Array<{ pathname: string; fields: string[] }>;
  pages: Array<{ pathname: string; contract: Record<string, unknown>; bodyText: string }>;
};
const REPO = path.resolve(import.meta.dirname, '..');
const readRevision = (file: string) => JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8')) as Revision;
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const PAID_CHAT = 'docs/seo/evidence/2026-10-01-paid-chat-honesty/reviewed-protected-pages.json';
const GSC_DRIVEN = 'docs/seo/evidence/2026-09-30-gsc-driven/reviewed-protected-pages.json';

test('the current revision documents every contract change against its predecessor, which stays untouched', () => {
  const current = readRevision(BASELINE);
  assert.ok(current.previousRevision && current.previousRevision !== BASELINE, 'a revision names its predecessor');
  // Line endings normalised, so a CRLF checkout of the same file passes.
  const raw = fs.readFileSync(path.join(REPO, current.previousRevision!), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(sha256(raw), current.previousRevisionSha256, 'an old revision was edited: write a new one instead');
  const previous = JSON.parse(raw) as Revision;
  assert.deepEqual(current.pages.map((p) => p.pathname), [...PROTECTED_PATHS]);
  for (const page of current.pages) {
    assert.equal(sha256(page.bodyText), page.contract.bodyTextSha256, `${page.pathname}: stored body text is not what was hashed`);
    const before = previous.pages.find((p) => p.pathname === page.pathname)!;
    const changed = Object.keys(page.contract).filter((k) => JSON.stringify(page.contract[k]) !== JSON.stringify(before.contract[k])).sort();
    const documented = current.reviewedChanges.filter((c) => c.pathname === page.pathname).flatMap((c) => c.fields).sort();
    assert.deepEqual(changed, documented, `${page.pathname}: every changed field is reviewed, and only those`);
  }
});

test('the paid-chat revision (WP-12) changes body text only, and the text says what it should', () => {
  const current = readRevision(PAID_CHAT);
  const previous = readRevision(GSC_DRIVEN);
  assert.equal(current.previousRevision, GSC_DRIVEN);
  for (const page of current.pages) {
    const before = previous.pages.find((p) => p.pathname === page.pathname)!;
    for (const key of ['title', 'h1', 'description', 'robots', 'googlebot', 'canonical', 'hreflang', 'internalLinks']) {
      assert.deepEqual(page.contract[key], before.contract[key], `${page.pathname}: ${key} must not change in this revision`);
    }
    // Every footer names the e-mail; no page offers the owner's personal
    // Telegram, and the chat-entry block names the brand as the chat does.
    assert.match(page.bodyText, /ceo@gptbot\.uz/, page.pathname);
    assert.doesNotMatch(page.bodyText, /XGame|напишите нам в Telegram|Telegram’da bizga yozing|Qo‘ng‘iroq qilish yoki Telegram|Позвонить или Telegram|GPTBot AI ·/, page.pathname);
  }
  const body = (pathname: string) => current.pages.find((p) => p.pathname === pathname)!.bodyText;
  // True before and after the paid AI pack opens (plan map 03 §5).
  const uz = body('/uz/gpt-uzbek-tilida/');
  assert.match(uz, /Pullik AI paket ixtiyoriy: u mavjud bo‘lganda, shartlari chatning o‘zida ko‘rsatiladi\./);
  assert.match(uz, /serverimizga va xorijdagi AI-provayderlarga yuboriladi/);
  assert.match(uz, /Biznes bot narxlari/);
  assert.doesNotMatch(uz, /hali ishga tushirilmagan|Suhbat tarixi brauzeringizda|davom ettirish mumkin| Tariflar /);
  const ru = body('/ru/gpt-chat/');
  assert.match(ru, /Платный AI-пакет — по желанию: когда он доступен, его условия показаны в самом чате\./);
  assert.match(ru, /на наш сервер и зарубежным AI-провайдерам/);
  assert.doesNotMatch(ru, /ещё не запущен|История разговора остаётся|можно продолжить в Telegram/);
});

test('protected page sources keep the honest wording outside the HTML too: FAQ, Markdown twin and the login guide link', () => {
  const page = (rel: string) => JSON.parse(fs.readFileSync(path.join(REPO, 'content/pages', rel), 'utf8')) as Page;
  for (const chat of [page('uz/gpt-uzbek-tilida.json'), page('ru/gpt-chat.json')]) {
    const text = JSON.stringify(chat);
    assert.doesNotMatch(text, /hali ishga tushirilmagan|пока не запущен|ещё не запущен|tarixi brauzeringizda|остаётся в вашем браузере|Kutmaslik uchun|Чтобы не ждать|XGame_changerx/, chat.url);
  }
  // The guide that promises the official site links it (roadmap v2 №18).
  const guide = JSON.parse(fs.readFileSync(path.join(REPO, 'content/blog/uz/chatgptga-qanday-kirish-mumkin.json'), 'utf8')) as BlogArticle;
  const official = guide.body.flatMap((b) => b.links || []).filter((l) => l.target === 'https://chatgpt.com/');
  assert.deepEqual(official.map((l) => l.anchor), ['chatgpt.com']);
});
