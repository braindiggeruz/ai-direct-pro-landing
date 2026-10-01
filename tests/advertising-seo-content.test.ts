import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import type { BlogArticle, Page } from '../src/shared/types';
import { LEAD_FORM_PAGES } from '../scripts/lead-form';

const articles = [
  'ru/telegram-ads-stoimost-i-zapusk-uzbekistan',
  'ru/skolko-stoit-internet-reklama-uzbekistan-2026',
  'ru/skolko-stoit-smm-i-vedenie-instagram-uzbekistan',
  'ru/skolko-stoit-kontekstnaya-reklama-tashkent-2026',
  'ru/reklamnyy-byudzhet-skolko-protsentov-ot-oborota',
  'ru/google-ads-ili-yandeks-direkt-uzbekistan',
  'uz/internet-reklama-narxi-ozbekiston-2026',
  'uz/smm-xizmati-narxi-ozbekiston-2026',
  'uz/kontekst-reklama-narxi-toshkent-2026',
  'uz/reklama-byudjeti-qancha-bolishi-kerak',
];
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(`content/${file}.json`, 'utf8'));
const published = (page: Page | BlogArticle, expected: string) => {
  assert.equal(page.url, expected);
  assert.equal(new URL(page.canonical!, 'https://gptbot.uz').href, `https://gptbot.uz${expected}`);
  assert.equal(page.status, 'published');
  assert.equal(page.robotsIndex, true);
  assert.equal(page.robotsFollow, true);
};

test('advertising refresh keeps all existing article identities and working commercial paths', () => {
  for (const key of articles) {
    const [locale, slug] = key.split('/');
    const article = read<BlogArticle>(`blog/${key}`);
    published(article, `/${locale}/blog/${slug}/`);
    assert.ok(article.targetMoneyPage);
    assert.ok(article.internalLinks.some(link => link.target === article.targetMoneyPage));
    assert.ok(article.body.some(block => block.type === 'linkp' && block.links?.some(link => link.target?.startsWith(`/${locale}/`) && !link.target.includes('/blog/'))));
    assert.equal(article.cta?.href, 'https://t.me/XGame_changerx');
    assert.equal(article.dateModified, '2026-09-28');
    assert.ok(article.datePublished! < article.dateModified!);
    const ids = article.body.filter(block => block.id).map(block => block.id);
    assert.equal(ids.length, new Set(ids).size);
    for (const block of article.body) {
      if (block.type === 'toc') for (const link of block.links || []) assert.ok(ids.includes(link.target?.slice(1)), `${key}: broken TOC ${link.target}`);
      if (block.type === 'p') assert.doesNotMatch(block.text || '', /\{[a-z]+\}/, `${key}: unresolved link token`);
      if (block.type === 'cta') assert.equal(block.href, 'https://t.me/XGame_changerx');
    }
  }
});

test('known unsupported outcome statistics cannot return in refreshed copy or metadata', () => {
  for (const key of articles) {
    const text = JSON.stringify(read<BlogArticle>(`blog/${key}`));
    assert.doesNotMatch(text, /40[–-]60\s*%|38\s*%|38 foiz|40% обращений|по нашим замерам|Bizning o'lchovlar|с 4-го мес|4-oydan|до 40\s*%|до договора.*цену заявки/i, key);
    assert.doesNotMatch(text, /\$0[,.]|\$3[–-]12|\$5[–-]15|CPL.*kamayadi/i, key);
    assert.match(text, /не гарант|не прогноз|не обещ|не гарантиру|kafolat|prognozi emas/i, key);
  }
});

test('SMM price articles repeat the actual package rows in both languages', () => {
  for (const locale of ['ru', 'uz']) {
    const slug = locale === 'ru' ? 'smm-prodvizhenie-tashkent' : 'smm-xizmatlari';
    const blogSlug = locale === 'ru' ? 'skolko-stoit-smm-i-vedenie-instagram-uzbekistan' : 'smm-xizmati-narxi-ozbekiston-2026';
    const page = read<Page>(`pages/${locale}/${slug}`);
    const article = read<BlogArticle>(`blog/${locale}/${blogSlug}`);
    const packages = page.bodyBlocks.find(block => block.rows?.some(row => row[0] === (locale === 'ru' ? 'Старт' : 'Start')));
    assert.ok(packages);
    assert.deepEqual(article.body.find(block => block.rows?.some(row => row[0] === (locale === 'ru' ? 'Старт' : 'Start'))), packages);
    assert.deepEqual(packages.rows!.map(row => row.at(-1)!.replace(/от | dan/g, '')), ['2 490 000', '4 490 000', '7 900 000']);
    const copy = JSON.stringify(article);
    assert.match(copy, /Медиабюджет не входит|Media byudjet hech bir paketga kirmaydi/);
    assert.doesNotMatch(copy, /полное ведение плюс рекламный бюджет|to'liq yuritish va reklama byudjeti/);
  }
});

test('Telegram article sources the direct-platform boundary instead of a universal reseller deposit', () => {
  const article = read<BlogArticle>('blog/ru/telegram-ads-stoimost-i-zapusk-uzbekistan');
  assert.ok(article.sources?.some(source => source.url === 'https://ads.telegram.org/getting-started'));
  assert.match(JSON.stringify(article), /0,1 Toncoin/);
  assert.match(JSON.stringify(article), /не минимальная цена проекта/);
  assert.match(JSON.stringify(article), /не универсальное правило/);
  assert.doesNotMatch(JSON.stringify(article), /Минимальный бюджет для новых кабинетов — от/);
});

test('commercial briefs preserve a real contact and explicitly distinguish click from sent enquiry', () => {
  for (const key of ['ru/targetirovannaya-reklama-tashkent', 'ru/telegram-ads-uzbekistan', 'uz/telegram-reklama']) {
    const page = read<Page>(`pages/${key}`);
    published(page, `/${key}/`);
    // The page's own lead form, not a personal Telegram account (paid-chat L14).
    assert.equal(page.ctaPrimaryHref, '#lead-form');
    assert.ok(`/${key}/` in LEAD_FORM_PAGES, key);
    assert.equal(page.ctaSecondaryHref, '#brief');
    assert.equal(page.bodyBlocks.filter(block => block.id === 'brief').length, 1);
    assert.ok(page.bodyBlocks.some(block => block.type === 'quote' && block.text?.includes(`gptbot.uz/${key}/`)));
    assert.match(JSON.stringify(page.bodyBlocks), /не означает отправленную заявку|yuborilgan ariza degani emas/);
  }
});

test('budget scenarios label illustrative maths rather than inventing client results', () => {
  for (const key of ['ru/reklamnyy-byudzhet-skolko-protsentov-ot-oborota', 'uz/reklama-byudjeti-qancha-bolishi-kerak']) {
    const article = read<BlogArticle>(`blog/${key}`);
    assert.match(JSON.stringify(article), /Условный учебный пример, не статистика клиента|Shartli o‘quv misoli, mijoz statistikasi emas/);
    const table = article.body.find(block => block.type === 'table' && block.headers?.some(header => header.includes('100 000')));
    assert.ok(table);
    for (const row of table.rows!) {
      const conversion = Number(row[0].match(/\d+/)![0]) / 100;
      const leads = Number(row[1]);
      const budget = Number(row[2].replace(/\D/g, ''));
      assert.equal(leads * conversion, 20);
      assert.equal(budget, leads * 100_000);
    }
  }
});

test('target launch package and diagnostic stage keep their distinct scopes', () => {
  const page = read<Page>('pages/ru/targetirovannaya-reklama-tashkent');
  const tariff = page.bodyBlocks.find(block => block.type === 'table' && block.headers?.includes('Цена (сум)'));
  assert.ok(tariff);
  assert.equal(tariff.rows?.[0][0], 'Запуск');
  assert.match(tariff.rows![0][1], /Аудитории.*первые 2 недели ведения/);
  assert.deepEqual(tariff.rows!.map(row => row.at(-1)), ['от 1 990 000', 'от 1 490 000']);
  const diagnostic = page.bodyBlocks.flatMap(block => block.rows || []).find(row => row[0] === 'Диагностика');
  assert.equal(diagnostic?.[1], 'Продукт, аудитория, прошлые кампании, аналитика');
});

test('compact advertising heroes are opt-in and preserve the full search heading', () => {
  for (const key of ['ru/targetirovannaya-reklama-tashkent', 'ru/telegram-ads-uzbekistan']) {
    const page = read<Page>(`pages/${key}`);
    assert.equal(page.compactHero, true);
    assert.equal(page.designVariant, 'digital-command-center');
  }
  const renderer = fs.readFileSync('scripts/prerender.ts', 'utf8');
  assert.match(renderer, /page\.compactHero \? ' data-compact-hero' : ''/);
  assert.match(renderer, /dc-hero\[data-compact-hero\] h1/);
  assert.match(renderer, /escapeText\(page\.h1\)/);
});
