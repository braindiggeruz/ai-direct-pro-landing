import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TODAY = '2026-08-31';
const abs = (file) => path.join(ROOT, file);
const read = (file) => fs.readFileSync(abs(file), 'utf8');
const write = (file, content) => {
  fs.mkdirSync(path.dirname(abs(file)), { recursive: true });
  fs.writeFileSync(abs(file), content, 'utf8');
  console.log(`[gsc-indexation] updated ${file}`);
};
const readJson = (file) => JSON.parse(read(file));
const writeJson = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`);

function replaceOnce(source, from, to, label) {
  const first = typeof from === 'string' ? source.indexOf(from) : source.search(from);
  if (first < 0) throw new Error(`${label}: source marker missing`);
  if (typeof from === 'string' && source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`${label}: source marker is not unique`);
  }
  return source.replace(from, to);
}

function removeRetiredSearchAction() {
  const file = 'index.html';
  let source = read(file);
  const pattern = /          "inLanguage": \["ru", "uz"\],\n          "potentialAction": \{\n            "@type": "SearchAction",\n            "target": \{\n              "@type": "EntryPoint",\n              "urlTemplate": "https:\/\/gptbot\.uz\/ru\/blog\/\?q=\{search_term_string\}"\n            \},\n            "query-input": "required name=search_term_string"\n          \}/;
  source = replaceOnce(
    source,
    pattern,
    '          "inLanguage": ["ru", "uz"]',
    'remove obsolete WebSite SearchAction',
  );
  if (/search_term_string|SearchAction|query-input/.test(source)) {
    throw new Error('index.html still exposes the retired search action');
  }
  write(file, source);
}

function addBlogQueryCanonicalRedirect() {
  const file = 'functions/_middleware.ts';
  let source = read(file);
  if (source.includes('GSC cleanup: the retired WebSite SearchAction')) return;
  const marker = `  const isLoginPage =\n`;
  const block = `  // GSC cleanup: the retired WebSite SearchAction generated literal\n  // /ru/blog/?q={search_term_string} crawl URLs even though the blog has no\n  // search-result page. Strip only the obsolete q parameter and retain any\n  // campaign attribution parameters. This turns the historical alternate\n  // canonical into one permanent hop to the real blog index.\n  const isBlogIndex =\n    url.pathname === '/ru/blog/' || url.pathname === '/ru/blog' ||\n    url.pathname === '/uz/blog/' || url.pathname === '/uz/blog';\n  if (isBlogIndex && url.searchParams.has('q')) {\n    url.searchParams.delete('q');\n    const pathname = url.pathname.endsWith('/') ? url.pathname : \`${'${url.pathname}'}/\`;\n    const query = url.searchParams.toString();\n    return Response.redirect(\`https://gptbot.uz${'${pathname}'}${'${query ? `?${query}` : ``}'}\`, 301);\n  }\n\n`;
  source = replaceOnce(source, marker, `${block}${marker}`, 'middleware blog query insertion');
  write(file, source);
}

function addLegacyRedirects() {
  const file = 'content/seo/redirects.json';
  const redirects = readJson(file);
  const additions = [
    {
      id: 'gsc-legacy-telegram-bot-uzbekistan',
      from: '/ru/telegram-bot-uzbekistan/',
      to: '/ru/telegram-bot-dlya-biznesa/',
      statusCode: 301,
      reason: 'GSC 404 legacy country/channel slug. Consolidate into the existing Telegram-specific commercial owner instead of creating a cannibalising duplicate.',
      createdAt: TODAY,
    },
    {
      id: 'gsc-legacy-gpt-uzbek-unprefixed',
      from: '/gpt-uzbek-tilida/',
      to: '/uz/gpt-uzbek-tilida/',
      statusCode: 301,
      reason: 'GSC 404 legacy unprefixed Uzbek product URL. Preserve discovery signals and send users to the published Uzbek canonical.',
      createdAt: TODAY,
    },
    {
      id: 'gsc-legacy-gpt-chat-unprefixed',
      from: '/gpt-chat/',
      to: '/ru/gpt-chat/',
      statusCode: 301,
      reason: 'GSC 404 legacy unprefixed GPT chat URL. Consolidate into the published Russian product canonical.',
      createdAt: TODAY,
    },
  ];
  for (const addition of additions) {
    const matches = redirects.filter((item) => item.from === addition.from);
    if (matches.length > 1) throw new Error(`duplicate redirect source: ${addition.from}`);
    if (matches.length === 1) Object.assign(matches[0], addition);
    else redirects.push(addition);
  }
  writeJson(file, redirects);
}

function cleanActiveSourceOfRedirectOwners() {
  {
    const file = 'src/shared/site-config.ts';
    let source = read(file);
    source = source.replace("    '/ru/gpt-bot-dlya-biznesa/',\n", '');
    source = source.replace("    '/ru/bot-dlya-obrabotki-zayavok/',\n", '');
    source = source.replace("  ['/ru/gpt-bot-dlya-biznesa/', '/uz/gpt-bot-biznes-uchun/'],\n", '');
    write(file, source);
  }
  {
    const file = 'src/components/Footer.tsx';
    let source = read(file);
    source = source.replace("  { ru: '/ru/gpt-bot-dlya-biznesa/', uz: '/uz/gpt-bot-biznes-uchun/', ruLabel: 'GPT-бот', uzLabel: 'GPT-bot' },\n", '');
    write(file, source);
  }
  {
    const file = 'src/components/SolutionsGrid.tsx';
    let source = read(file);
    const pattern = /  \{\n    ruUrl: '\/ru\/gpt-bot-dlya-biznesa\/',\n    uzUrl: '\/uz\/gpt-bot-biznes-uchun\/',[\s\S]*?    tag: 'GPT',\n  \},\n/;
    source = replaceOnce(source, pattern, '', 'remove retired GPT solution card');
    write(file, source);
  }
  {
    const file = 'src/shared/booster.ts';
    let source = read(file);
    const oldAi = "  { id: 'ai-bot-business',   label: 'AI/GPT bot for business',  money: { ru: ['/ru/ai-bot-dlya-biznesa/', '/ru/gpt-bot-dlya-biznesa/', '/ru/chat-bot-dlya-biznesa/'], uz: ['/uz/biznes-uchun-ai-bot/', '/uz/gpt-bot-biznes-uchun/'] }, head: '/ru/ai-bot-dlya-biznesa/' },";
    const newAi = "  { id: 'ai-bot-business',   label: 'AI/GPT bot for business',  money: { ru: ['/ru/ai-bot-dlya-biznesa/', '/ru/gpt-dlya-biznesa/', '/ru/chat-bot-dlya-biznesa/'], uz: ['/uz/biznes-uchun-ai-bot/', '/uz/gpt-bot-biznes-uchun/'] }, head: '/ru/ai-bot-dlya-biznesa/' },";
    source = replaceOnce(source, oldAi, newAi, 'AI/GPT booster cluster');
    const oldLead = "  { id: 'lead-processing',   label: 'Lead processing automation', money: { ru: ['/ru/bot-dlya-obrabotki-zayavok/', '/ru/avtomatizatsiya-zayavok/', '/ru/ai-prodavec/'], uz: ['/uz/arizalarni-avtomatlashtirish/'] }, head: '/ru/avtomatizatsiya-zayavok/' },";
    const newLead = "  { id: 'lead-processing',   label: 'Lead processing automation', money: { ru: ['/ru/avtomatizatsiya-zayavok/', '/ru/ai-prodavec/'], uz: ['/uz/arizalarni-avtomatlashtirish/'] }, head: '/ru/avtomatizatsiya-zayavok/' },";
    source = replaceOnce(source, oldLead, newLead, 'lead-processing booster cluster');
    write(file, source);
  }

  for (const file of ['public/llms.txt', 'public/llms-full.txt']) {
    let source = read(file);
    source = source.replaceAll(
      'https://gptbot.uz/ru/gpt-bot-dlya-biznesa/',
      'https://gptbot.uz/ru/gpt-dlya-biznesa/',
    );
    source = source.replace(
      /^.*https:\/\/gptbot\.uz\/ru\/bot-dlya-obrabotki-zayavok\/.*\n/gm,
      '',
    );
    source = source.replaceAll('| Last updated | 2026-07-14 |', `| Last updated | ${TODAY} |`);
    source = source.replaceAll('GPT bot for business (RU): https://gptbot.uz/ru/gpt-dlya-biznesa/', 'AI / GPT for business (RU): https://gptbot.uz/ru/gpt-dlya-biznesa/');
    write(file, source);
  }
}

function strengthenTelegramOwner() {
  const file = 'content/pages/ru/telegram-bot-dlya-biznesa.json';
  const page = readJson(file);
  page.primaryKeyword = 'Telegram-бот для бизнеса в Узбекистане';
  page.secondaryKeywords = [...new Set([
    'Telegram-бот Узбекистан',
    'разработка Telegram-ботов в Узбекистане',
    ...(page.secondaryKeywords || []),
  ])];
  page.h1 = 'Telegram-бот для бизнеса в Узбекистане';
  page.title = 'Telegram-бот для бизнеса в Узбекистане | GPTBot';
  page.description = 'Разработка Telegram-бота для бизнеса в Узбекистане: заявки, каталог, рассылки, оплата и CRM. Русский и Uzbek Latin, работа по всей стране.';
  page.ogTitle = 'Telegram-бот для бизнеса в Узбекистане | GPTBot';
  page.ogDescription = 'Telegram-бот для заявок, каталога, рассылок, оплаты и CRM. Запуск для бизнеса по всему Узбекистану на русском и Uzbek Latin.';
  page.breadcrumbLabel = 'Telegram-бот в Узбекистане';
  page.heroTitle = 'Telegram-бот для бизнеса в Узбекистане';
  page.heroSubtitle = 'Принимает заявки и заказы, показывает каталог, помогает с оплатой и передаёт контекст менеджеру или в CRM. Запускаем для бизнеса по всей стране на русском и Uzbek Latin.';

  const firstParagraph = page.bodyBlocks?.find((block) => block.type === 'p');
  if (!firstParagraph) throw new Error('Telegram owner has no opening paragraph');
  firstParagraph.text = 'Telegram-бот для бизнеса в Узбекистане — это сценарная система внутри Telegram, которая принимает обращение, собирает согласованные поля и передаёт контекст менеджеру или в CRM. Конкретный состав — каталог, оплата, рассылки, AI-ответы и интеграции — фиксируется в смете.';

  const geoTarget = '/ru/chat-bot-po-uzbekistanu/';
  const developmentTarget = '/ru/razrabotka-telegram-bota-tashkent/';
  const hasGeoBridge = page.bodyBlocks.some((block) =>
    Array.isArray(block.links) && block.links.some((link) => link.target === geoTarget),
  );
  if (!hasGeoBridge) {
    const insertion = page.bodyBlocks.findIndex((block) => block.type === 'h2');
    page.bodyBlocks.splice(insertion, 0, {
      type: 'linkp',
      text: 'Работаем с компаниями по всей стране: региональный формат и языки описаны на странице {geo}. Если нужен отдельный проект с техническим заданием, интеграциями и этапами запуска, смотрите {development}.',
      links: [
        { token: 'geo', target: geoTarget, anchor: 'разработка чат-ботов по Узбекистану' },
        { token: 'development', target: developmentTarget, anchor: 'разработка Telegram-бота в Ташкенте' },
      ],
    });
  }
  page.internalLinks = Array.isArray(page.internalLinks) ? page.internalLinks : [];
  for (const [target, anchor] of [
    [geoTarget, 'чат-боты по всему Узбекистану'],
    [developmentTarget, 'разработка Telegram-бота в Ташкенте'],
  ]) {
    if (!page.internalLinks.some((link) => link.target === target)) {
      page.internalLinks.push({ target, anchor, locale: 'ru', type: 'contextual' });
    }
  }
  page.lastReviewedAt = TODAY;
  page.updatedAt = TODAY;
  writeJson(file, page);
}

function addRegressionTests() {
  const file = 'tests/gsc-indexation-hygiene.test.ts';
  const content = `import assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport path from 'node:path';\nimport test from 'node:test';\nimport { onRequest } from '../functions/_middleware';\nimport { HREFLANG_PAIRS, MONEY_PAGES } from '../src/shared/site-config';\n\nconst ROOT = process.cwd();\nconst RETIRED = ['/ru/gpt-bot-dlya-biznesa/', '/ru/bot-dlya-obrabotki-zayavok/'];\nconst ACTIVE_FILES = [\n  'src/shared/site-config.ts',\n  'src/components/Footer.tsx',\n  'src/components/SolutionsGrid.tsx',\n  'src/shared/booster.ts',\n  'public/llms.txt',\n  'public/llms-full.txt',\n];\n\nfunction read(relative: string): string {\n  return fs.readFileSync(path.join(ROOT, relative), 'utf8');\n}\n\nfunction middleware(url: string): Promise<Response> {\n  return onRequest({\n    request: new Request(url),\n    env: {},\n    next: async () => new Response('next', { status: 200 }),\n  } as never);\n}\n\ntest('the retired sitelinks SearchAction cannot regenerate a crawlable query template', () => {\n  const html = read('index.html');\n  assert.doesNotMatch(html, /SearchAction|search_term_string|query-input/);\n});\n\ntest('blog q parameters permanently collapse to the canonical index', async () => {\n  const template = await middleware('https://gptbot.uz/ru/blog/?q=%7Bsearch_term_string%7D');\n  assert.equal(template.status, 301);\n  assert.equal(template.headers.get('location'), 'https://gptbot.uz/ru/blog/');\n\n  const attributed = await middleware('https://gptbot.uz/uz/blog?q=sinov&utm_source=gsc');\n  assert.equal(attributed.status, 301);\n  assert.equal(attributed.headers.get('location'), 'https://gptbot.uz/uz/blog/?utm_source=gsc');\n});\n\ntest('GSC legacy content URLs resolve in one permanent map to published owners', () => {\n  const redirects = JSON.parse(read('content/seo/redirects.json')) as Array<{ from: string; to: string; statusCode: number }>;\n  const expected = new Map([\n    ['/ru/telegram-bot-uzbekistan/', '/ru/telegram-bot-dlya-biznesa/'],\n    ['/gpt-uzbek-tilida/', '/uz/gpt-uzbek-tilida/'],\n    ['/gpt-chat/', '/ru/gpt-chat/'],\n  ]);\n  for (const [from, to] of expected) {\n    const matches = redirects.filter((item) => item.from === from);\n    assert.equal(matches.length, 1, from);\n    assert.equal(matches[0].to, to);\n    assert.equal(matches[0].statusCode, 301);\n  }\n});\n\ntest('redirect sources are absent from active money, hreflang, UI and LLM sources', () => {\n  const money = [...MONEY_PAGES.ru, ...MONEY_PAGES.uz];\n  const hreflang = HREFLANG_PAIRS.flat();\n  for (const retired of RETIRED) {\n    assert.ok(!money.includes(retired as never), \`money config contains \${retired}\`);\n    assert.ok(!hreflang.includes(retired), \`hreflang config contains \${retired}\`);\n    for (const file of ACTIVE_FILES) assert.ok(!read(file).includes(retired), \`\${file} contains \${retired}\`);\n  }\n});\n\ntest('unknown private-looking routes remain true noindex 404s instead of homepage redirects', () => {\n  const redirects = JSON.parse(read('content/seo/redirects.json')) as Array<{ from: string }>;\n  for (const route of ['/cabinet', '/oauth', '/api', '/callback', '/reset-password', '/auth', '/account']) {\n    assert.ok(!redirects.some((item) => item.from === route || item.from === route + '/'), route);\n  }\n  assert.match(read('public/404.html'), /name="robots" content="noindex, nofollow"/);\n});\n\ntest('the Telegram country legacy URL consolidates into a geographically explicit owner', () => {\n  const page = JSON.parse(read('content/pages/ru/telegram-bot-dlya-biznesa.json')) as Record<string, unknown>;\n  assert.equal(page.url, '/ru/telegram-bot-dlya-biznesa/');\n  assert.match(String(page.title), /Узбекистан/);\n  assert.match(String(page.h1), /Узбекистан/);\n  assert.match(String(page.description), /Узбекистан/);\n  assert.equal(page.robotsIndex, true);\n});\n`;
  write(file, content);
}

function updatePackage() {
  const file = 'package.json';
  const pkg = readJson(file);
  const testFile = 'tests/gsc-indexation-hygiene.test.ts';
  if (!String(pkg.scripts.test).includes(testFile)) pkg.scripts.test = `${pkg.scripts.test} ${testFile}`;
  pkg.scripts['test:gsc-indexation'] = `node --import tsx --test ${testFile}`;
  writeJson(file, pkg);
}

function addReleaseNote() {
  const file = 'docs/seo/RELEASE_2026-08-31_GSC_INDEXATION_HYGIENE.md';
  const content = `# GPTBot.uz — GSC indexation hygiene release\n\nDate: 2026-08-31  \nBase production: \`e81f65e6c4757f77ed2991ef12b599d956185e55\`  \nScope: historical alternate-canonical, 404 and redirect-source cleanup.\n\n## Evidence\n\nThe live crawl of all 260 sitemap URLs found zero non-200 entries, zero sitemap redirects, zero canonical mismatches, zero missing canonicals, zero noindex URLs and zero raw-HTML internal links through redirects. The GSC screenshots are historical (last update 2026-08-21) and contain three actionable legacy content 404s, several intentional private-route 404s, canonical www variants and a literal retired SearchAction query template.\n\n## Changes\n\n- Removed the obsolete WebSite \`SearchAction\` from the source homepage.\n- Added a 301 cleanup for \`q\` on RU/UZ blog indexes.\n- Added permanent redirects for \`/ru/telegram-bot-uzbekistan/\`, \`/gpt-uzbek-tilida/\` and \`/gpt-chat/\`.\n- Kept generic private-looking paths such as \`/api\`, \`/oauth\`, \`/auth\` and \`/account\` as true noindex 404s.\n- Removed retired redirect sources from money-page configuration, hreflang configuration, homepage UI links, booster clusters and LLM discovery files.\n- Strengthened the existing Telegram commercial owner for the Uzbekistan intent instead of creating a duplicate URL.\n- Added permanent regression tests.\n\n## Acceptance\n\n- every sitemap URL returns 200 with a self-canonical;\n- no redirect source appears in active config, homepage links or LLM files;\n- the three content-like GSC 404s reach a relevant published owner with 301;\n- private/probe routes remain 404 + noindex;\n- the blog search-template URL reaches the clean blog index with 301;\n- no SearchAction/search_term_string survives the production build.\n\nThis release improves crawl efficiency and signal consolidation. It does not guarantee a ranking position or a Top-3 result.\n`;
  write(file, content);
}

removeRetiredSearchAction();
addBlogQueryCanonicalRedirect();
addLegacyRedirects();
cleanActiveSourceOfRedirectOwners();
strengthenTelegramOwner();
addRegressionTests();
updatePackage();
addReleaseNote();
console.log('[gsc-indexation] transformation complete');
