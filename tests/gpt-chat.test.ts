// Unit tests for the consumer AI-chat pure logic.
// Run: node --import tsx --test tests/gpt-chat.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveConfig, modelChain } from '../functions/lib/gpt-chat/config';
import { decideQuota } from '../functions/lib/gpt-chat/quota';
import { validateMessage, validateLead, normLocale } from '../functions/lib/gpt-chat/validate';
import { buildMessages } from '../functions/lib/gpt-chat/prompt';
import { buildChatBody } from '../functions/lib/gpt-chat/openrouter-chat';
import { hashIp } from '../functions/lib/gpt-chat/hash';
import { renderMarkdown } from '../src/gpt-chat/markdown';
import { latexLite } from '../src/gpt-chat/latex-lite';
import { plainText } from '../src/gpt-chat/plain-text';
import { applyRole, frameLocale, getRoles, maxRolePrefixLength, rolePrefixLength, type RoleId } from '../src/gpt-chat/roles';
import { buildImagePromptRequest, getTemplates } from '../src/gpt-chat/templates';
import { clearSessionId, loadRemaining, saveRemaining, saveSessionId } from '../src/gpt-chat/storage';
import { strings } from '../src/gpt-chat/i18n';
import { EV } from '../src/gpt-chat/analytics';
import { readFileSync } from 'node:fs';

type AnyEnv = Parameters<typeof resolveConfig>[0];

// The previous version of this test pinned the three free slugs by name. When
// OpenRouter retired all three in August 2026 the chat answered provider_error
// in production for weeks and this test stayed green, because a retired slug is
// still the string it always was. Assert the SHAPE the fallback chain must keep
// — free tier, three distinct vendors, no duplicates — and leave the identity of
// the models to tests/openrouter-model-catalogue.test.ts, which checks them
// against the live catalogue.
test('resolveConfig applies defaults from the strategic report', () => {
  const cfg = resolveConfig({} as AnyEnv);
  assert.equal(cfg.freeDailyLimit, 15);
  assert.equal(cfg.freeHourlyLimit, 5);
  assert.equal(cfg.maxInputChars, 3000);

  const freeChain = [cfg.freeModel, ...cfg.freeFallbacks];
  assert.equal(freeChain.length, 3, 'the free chain must keep two fallbacks behind the primary');
  assert.equal(new Set(freeChain).size, 3, 'no model may appear twice in the chain');
  for (const model of freeChain) {
    assert.match(model, /^[a-z0-9-]+\/[a-z0-9._-]+:free$/, `${model} must be a free-tier OpenRouter slug`);
  }
  const vendors = freeChain.map((m) => m.split('/')[0]);
  assert.equal(new Set(vendors).size, 3, `one vendor outage must not empty the chain: ${vendors.join(', ')}`);

  const paidChain = [cfg.paidModel, ...cfg.paidFallbacks];
  assert.equal(paidChain.length, 3, 'the paid chain must keep two fallbacks behind the primary');
  assert.doesNotMatch(paidChain[0], /:free$/, 'paid access prefers its configured paid primary');
  assert.equal(new Set(paidChain).size, 3);
  assert.equal(cfg.paidMonthlyLimit, 300);
  assert.equal(resolveConfig({ GPT_PAID_MONTHLY_LIMIT: '99999' } as AnyEnv).paidMonthlyLimit, 300);
  for (const model of paidChain) assert.ok(buildChatBody(model, [], 900).provider.max_price.completion <= 0.32);
});

test('resolveConfig: model runtime knobs are clamped, the paid primary for free stays off unless "true"', () => {
  const defaults = resolveConfig({} as AnyEnv);
  assert.equal(defaults.maxOutputTokens, 1600);
  assert.equal(defaults.firstContentTimeoutMs, 12_000);
  assert.equal(defaults.freeTierPaidPrimary, false);
  assert.equal(defaults.freePaidDailyUsd, 1);
  assert.equal(defaults.zaiEvalApproved, '');
  const low = resolveConfig({
    GPT_MAX_OUTPUT_TOKENS: '50',
    GPT_FIRST_CONTENT_TIMEOUT_MS: '100',
    GPT_FREE_PAID_DAILY_USD: '-3',
  } as AnyEnv);
  assert.deepEqual([low.maxOutputTokens, low.firstContentTimeoutMs, low.freePaidDailyUsd], [400, 5_000, 0]);
  const high = resolveConfig({
    GPT_MAX_OUTPUT_TOKENS: '99999',
    GPT_FIRST_CONTENT_TIMEOUT_MS: '99999',
    GPT_FREE_PAID_DAILY_USD: '500',
  } as AnyEnv);
  assert.deepEqual([high.maxOutputTokens, high.firstContentTimeoutMs, high.freePaidDailyUsd], [4000, 20_000, 20]);
  assert.equal(resolveConfig({ GPT_FREE_PAID_DAILY_USD: '0.5' } as AnyEnv).freePaidDailyUsd, 0.5);
  assert.equal(resolveConfig({ GPT_FREE_PAID_DAILY_USD: 'lots' } as AnyEnv).freePaidDailyUsd, 1);
  assert.equal(resolveConfig({ GPT_MAX_OUTPUT_TOKENS: 'many' } as AnyEnv).maxOutputTokens, 1600);
  for (const value of ['false', '1', 'yes', ''])
    assert.equal(resolveConfig({ GPT_FREE_TIER_PAID_PRIMARY: value } as AnyEnv).freeTierPaidPrimary, false, value);
  assert.equal(resolveConfig({ GPT_FREE_TIER_PAID_PRIMARY: ' TRUE ' } as AnyEnv).freeTierPaidPrimary, true);
  // The committed config keeps it off until the model probe (release step R1.1).
  const wrangler = readFileSync('wrangler.toml', 'utf8');
  assert.match(wrangler, /^GPT_FREE_TIER_PAID_PRIMARY = "false"$/m);
  assert.match(wrangler, /^GPT_MAX_OUTPUT_TOKENS = "1600"$/m);
  // Stop is charged past 600 delivered characters (decision L4), and the chat
  // can only see Stop with request.signal on (plan WP-04).
  assert.match(wrangler, /^GPT_STOP_CHARGE_MIN_CHARS = "600"$/m);
  assert.match(wrangler, /"GPT_STOP_CHARGE_MIN_CHARS":"600"/);
  assert.match(wrangler, /^compatibility_flags = \[[^\]]*"enable_request_signal"[^\]]*\]$/m);
});

test('resolveConfig parses env overrides + comma lists', () => {
  const cfg = resolveConfig({
    OPENROUTER_MODEL_FREE: 'x/free',
    OPENROUTER_MODEL_FREE_FALLBACKS: 'a/b, c/d ,e/f',
    GPT_FREE_DAILY_LIMIT: '30',
  } as AnyEnv);
  assert.equal(cfg.freeModel, 'x/free');
  assert.deepEqual(cfg.freeFallbacks, ['a/b', 'c/d', 'e/f']);
  assert.equal(cfg.freeDailyLimit, 30);
});

test('modelChain = [primary, ...fallbacks]', () => {
  const cfg = resolveConfig({} as AnyEnv);
  const free = modelChain(cfg, 'free');
  assert.equal(free[0], cfg.freeModel);
  assert.equal(free.length, 3);
  const paid = modelChain(cfg, 'paid');
  assert.equal(paid[0], cfg.paidModel);
});

test('decideQuota: free daily + hourly caps', () => {
  const cfg = resolveConfig({} as AnyEnv);
  assert.deepEqual(decideQuota({ dayCount: 0, hourCount: 0 }, cfg, 'free'), { allowed: true, remaining: 15 });
  const daily = decideQuota({ dayCount: 15, hourCount: 0 }, cfg, 'free');
  assert.equal(daily.allowed, false);
  assert.equal(daily.reason, 'daily');
  assert.equal(daily.remaining, 0);
  const hourly = decideQuota({ dayCount: 6, hourCount: 5 }, cfg, 'free');
  assert.equal(hourly.allowed, false);
  assert.equal(hourly.reason, 'hourly');
  assert.equal(hourly.remaining, 9);
});

test('decideQuota: paid monthly cap', () => {
  const cfg = resolveConfig({} as AnyEnv);
  const ok = decideQuota({ dayCount: 100, hourCount: 0 }, cfg, 'paid');
  assert.equal(ok.allowed, true);
  const over = decideQuota({ dayCount: 600, hourCount: 0 }, cfg, 'paid');
  assert.equal(over.allowed, false);
});

test('validateMessage: rejects empty, too-long; trims', () => {
  assert.equal(validateMessage('', 3000).ok, false);
  assert.equal(validateMessage('   ', 3000).ok, false);
  assert.equal(validateMessage(123 as unknown as string, 3000).ok, false);
  assert.equal(validateMessage('a'.repeat(3001), 3000).ok, false);
  const ok = validateMessage('  hello  ', 3000);
  assert.equal(ok.ok, true);
  assert.equal(ok.value, 'hello');
});

test('normLocale defaults to ru', () => {
  assert.equal(normLocale('uz'), 'uz');
  assert.equal(normLocale('ru'), 'ru');
  assert.equal(normLocale('en'), 'ru');
  assert.equal(normLocale(undefined), 'ru');
});

test('validateLead: consent + at least one contact required', () => {
  assert.equal(validateLead({ consent: false, phone: '998900000000' }).ok, false);
  assert.equal(validateLead({ consent: true }).ok, false);
  const ok = validateLead({ consent: true, phone: '998 90 000 00 00', name: 'Ali' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value?.contactType, 'phone');
  assert.equal(ok.value?.name, 'Ali');
  const tg = validateLead({ consent: true, telegram: '@alisher' });
  assert.equal(tg.value?.contactType, 'telegram');
});

test('buildMessages: system first, trims history window', () => {
  const history = Array.from({ length: 40 }, (_, i) => ({ role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant', content: `m${i}` }));
  const msgs = buildMessages(history, 'new question', 10, 'ru');
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[msgs.length - 1].content, 'new question');
  // system + up to 20 history + 1 user = 22 max
  assert.ok(msgs.length <= 22);
});

test('buildChatBody: no response_format (free-form), carries model + messages', () => {
  const body = buildChatBody('m/x', [{ role: 'user', content: 'hi' }], 900) as Record<string, unknown>;
  assert.equal(body.model, 'm/x');
  assert.equal((body as { response_format?: unknown }).response_format, undefined);
  assert.equal((body.messages as unknown[]).length, 1);
});

// The salted v2 scheme and its switch-over: tests/gpt-hash-salt.test.ts.
test('hashIp: deterministic hex per address without a salt', async () => {
  const cfg = resolveConfig({} as AnyEnv);
  const a = await hashIp('1.2.3.4', cfg);
  const b = await hashIp('1.2.3.4', cfg);
  const c = await hashIp('1.2.3.5', cfg);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('renderMarkdown: escapes HTML (no XSS), keeps bold + lists', () => {
  const html = renderMarkdown('<script>alert(1)</script> **bold**\n- one\n- two');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('<li>one</li>'));
});

// Math is the chat's first topic: steps must count 1, 2, 3 and formulas read
// as text (plan MD-01..03, NOW-06). Every class is one the site's CSS has.
test('renderMarkdown: numbering survives text between items, lists nest, rules, quotes and tables render', () => {
  const split = renderMarkdown('1. A\n\nТекст\n\n2. B');
  assert.ok(split.includes('<ol class="list-decimal"><li>A</li></ol>'));
  assert.ok(split.includes('<ol class="list-decimal" start="2" style="counter-reset:step 1"><li>B</li></ol>'), split);
  // GLM's loose list (a blank line between steps) is one list.
  assert.equal(renderMarkdown('1. A\n\n2. B\n\n3. C'), '<ol class="list-decimal"><li>A</li><li>B</li><li>C</li></ol>');
  const nested = renderMarkdown('1. **Qadam**\n   Izoh satri\n2. Ikkinchi\n   - ichki a\n   - ichki b\n3. Uchinchi');
  assert.equal(nested, '<ol class="list-decimal"><li><strong>Qadam</strong><br>Izoh satri</li><li>Ikkinchi<ul class="list-disc"><li>ichki a</li><li>ichki b</li></ul></li><li>Uchinchi</li></ol>');
  assert.equal(renderMarkdown('---'), '<hr class="my-3 border-white/10">');
  assert.equal(renderMarkdown('* * *'), '<hr class="my-3 border-white/10">');
  assert.equal(renderMarkdown('> q\n> w'), '<blockquote class="border-l-2 border-brand-cyan/25 pl-3 text-white/70">q<br>w</blockquote>');
  assert.match(renderMarkdown('|a|b|\n|--|--|\n|1|2|'), /<table><thead><tr><th scope="col">a<\/th><th scope="col">b<\/th><\/tr><\/thead><tbody><tr><td>1<\/td><td>2<\/td><\/tr><\/tbody><\/table>/);
  assert.equal(renderMarkdown('a\nb\n\nc'), '<p class="mb-2 last:mb-0">a<br>b</p>\n<p class="mb-2 last:mb-0">c</p>');
  assert.equal(renderMarkdown('__b__ ~~d~~ *e*'), '<p class="mb-2 last:mb-0"><strong>b</strong> <del>d</del> <em>e</em></p>');
  assert.doesNotMatch(renderMarkdown('2 * 3 * 4 = 24'), /<em>/);
  // A link stays text with its address (owner decision 4): nothing clickable from a model.
  assert.equal(renderMarkdown('[sayt](https://gptbot.uz)'), '<p class="mb-2 last:mb-0">sayt (https://gptbot.uz)</p>');
  // One pair of parentheses in the address, as Wikipedia writes them.
  assert.equal(renderMarkdown('[Toshkent](https://uz.wikipedia.org/wiki/Toshkent_(shahar))'), '<p class="mb-2 last:mb-0">Toshkent (https://uz.wikipedia.org/wiki/Toshkent_(shahar))</p>');
  assert.equal(plainText('[Toshkent](https://uz.wikipedia.org/wiki/Toshkent_(shahar))'), 'Toshkent (https://uz.wikipedia.org/wiki/Toshkent_(shahar))');
  // A line of unclosed brackets (a pasted log, minified data) stays linear: it runs on every streamed frame.
  for (const line of ['['.repeat(20_000), '[a]('.repeat(5_000), '[a](b('.repeat(4_000), '[a](b(c)'.repeat(3_000)]) {
    const started = performance.now();
    renderMarkdown(line);
    plainText(line);
    assert.ok(performance.now() - started < 200, `${line.slice(0, 8)}… took ${Math.round(performance.now() - started)} ms`);
  }
  // A code block inside a list item stays a code block.
  assert.match(renderMarkdown('1. Step\n   ```\n   code\n   ```\n2. Next'), /<pre class="gpt-code" tabindex="0"><code> {3}code<\/code><\/pre>\n<ol class="list-decimal" start="2" style="counter-reset:step 1">/);
  // The only value in an attribute is a list's first number.
  const hostile = renderMarkdown('7. <img src=x onerror=alert(1)>\n> <script>x</script>\n[a](javascript:alert(1))');
  assert.ok(!hostile.includes('<img') && !hostile.includes('<script') && !hostile.includes('href'));
  assert.ok(hostile.includes('start="7"'));
  // Every class the renderer can write is one the site's stylesheet already has.
  const known = new Set(['px-1', 'py-0.5', 'rounded', 'bg-white/10', 'text-brand-cyan', 'gpt-code', 'gpt-table-scroll', 'list-decimal', 'list-disc',
    'mb-2', 'last:mb-0', 'my-3', 'border-white/10', 'border-l-2', 'border-brand-cyan/25', 'pl-3', 'text-white/70',
    // The answer's maths (chat design §5.5), in the chat's own stylesheet.
    'gpt-step-head', 'gpt-step', 'gpt-math', 'gpt-frac', 'gpt-result', 'gpt-result-label', 'gpt-result-value', 'gpt-check-line', 'gpt-code-wrap', 'gpt-code-copy']);
  const sheet = readFileSync(new URL('../src/gpt-chat/premium.css', import.meta.url), 'utf8');
  for (const name of known) if (name.startsWith('gpt-')) assert.ok(sheet.includes(`.${name}`), name);
  const everything = renderMarkdown('# H\n## 1. Step\n`c`\n```\nx\n```\n|a|b|\n|-|-|\n|1|2|\n---\n> q\n1. a\n   - b\n\np\nq\n\n$$\\frac{1}{2}$$\n\nJavob: 1\n\nTekshirish: ok', 'Nusxalash');
  for (const [, list] of everything.matchAll(/class="([^"]*)"/g)) for (const name of list.split(' ')) assert.ok(known.has(name), name);
});

test('latexLite: formulas read as plain text; code and prices stay as written', () => {
  assert.equal(latexLite('\\(\\frac{a}{b}\\)'), 'a/b');
  assert.equal(latexLite('x^2 + \\sqrt{9}'), 'x² + √9');
  assert.equal(latexLite('$5'), '$5');
  assert.equal(latexLite('$5 va $10'), '$5 va $10');
  assert.equal(latexLite('$x_1 = \\frac{1}{2}$'), 'x_1 = 1/2');
  assert.equal(latexLite('$$x = \\frac{-b \\pm \\sqrt{D}}{2a}$$'), 'x = (-b ± √D)/2a');
  assert.equal(latexLite('10^23 and x^{n+1} and 90^\\circ'), '10^23 and x^(n+1) and 90°');
  assert.equal(latexLite('a \\cdot b \\times c \\le d \\neq e \\approx \\pi \\left( x \\right)'), 'a · b × c ≤ d ≠ e ≈ π ( x )');
  assert.equal(latexLite('`x^2` and x^3'), '`x^2` and x³');
  // In an answer: no raw \(, \frac or $$ is left outside a code block.
  const html = renderMarkdown('Yechim:\n\n$$x = \\frac{-b \\pm \\sqrt{D}}{2a}$$\n\n1. \\(D = b^2 - 4ac = 49\\)\n2. \\(x_1 = \\frac{-5 + 7}{4} = \\frac{1}{2}\\)\n```\n\\frac{a}{b}\n```');
  assert.ok(html.includes('<li>D = b² - 4ac = 49</li><li>x_1 = (-5 + 7)/4 = 1/2</li>'), html);
  assert.ok(html.includes('<code>\\frac{a}{b}</code>'), 'code keeps its LaTeX');
  assert.doesNotMatch(html.replace(/<pre[\s\S]*?<\/pre>/g, ''), /\\\(|\\frac|\$\$/);
});

test('AI cabinet roles are localized and affect the request without user data', () => {
  assert.equal(getRoles('ru').length, 7);
  assert.equal(getRoles('uz').length, 7);
  const prompt = applyRole('Напиши пост', 'smm', 'ru');
  assert.match(prompt, /SMM-специалист/);
  assert.match(prompt, /Задача: Напиши пост/);
  // The answer follows the question's language, not the page's (plan LANG-01).
  assert.match(prompt, /на языке вопроса/);
  assert.doesNotMatch(prompt, /естественном русском языке/);
  const uz = applyRole('Post yoz', 'teacher', 'uz');
  assert.match(uz, /lotin yozuvida/);
  assert.match(uz, /Vazifa: Post yoz/);
  for (const role of getRoles('uz')) assert.doesNotMatch(role.instruction, /faqat Uzbek Latin ishlating|Javobni faqat Uzbek Latin/i, role.id);
  // The translator still writes Uzbek in Latin script: that line is about Uzbek text only.
  assert.match(getRoles('uz').find((role) => role.id === 'translator')!.instruction, /o‘zbek tiliga \(faqat lotin yozuvida\)/);
  assert.match(getRoles('ru').find((role) => role.id === 'translator')!.instruction, /на узбекский \(только латиницей\)/);
});

test('the language line: the question decides, the page only when unclear; formulas without LaTeX; none on a translation', () => {
  const uz = applyRole('Привет', 'general', 'uz');
  assert.match(uz, /Savol qaysi tilda yozilgan bo‘lsa, javobni shu tilda bering/);
  assert.match(uz, /Til aniq bo‘lmasa, o‘zbekcha \(lotin\) javob bering/);
  assert.match(uz, /LaTeX belgilarisiz/);
  const ru = applyRole('Salom', 'general', 'ru');
  assert.match(ru, /по-узбекски — только латиницей/);
  assert.match(ru, /Если язык неясен — отвечай по-русски/);
  assert.match(ru, /без LaTeX/);
  for (const locale of ['ru', 'uz'] as const) {
    const plain = applyRole('Matn', 'general', locale, { guard: false });
    assert.doesNotMatch(plain, /LaTeX/, `${locale}: a translation names its own language`);
    assert.ok(plain.endsWith(locale === 'uz' ? 'Vazifa: Matn' : 'Задача: Matn'));
    assert.ok(!strings(locale).inputCut.includes("'"));
  }
  // The composer's limit is the server's 3000 less what the role adds, for every role.
  for (const locale of ['ru', 'uz'] as const) {
    for (const role of getRoles(locale)) {
      const prefix = rolePrefixLength(role.id as RoleId, locale);
      assert.ok(prefix > 0 && prefix < 600, `${locale}/${role.id}: ${prefix}`);
      // As doSend frames a typed question: the translator gets no language line.
      assert.equal(applyRole('x'.repeat(3000 - prefix), role.id as RoleId, locale, { guard: role.id !== 'translator' }).length, 3000);
    }
  }
  // A question may get either language's lines (frameLocale): the limit leaves room for the longer.
  for (const role of getRoles('uz')) {
    const id = role.id as RoleId;
    const longest = maxRolePrefixLength(id);
    assert.equal(longest, Math.max(rolePrefixLength(id, 'uz'), rolePrefixLength(id, 'ru')));
    for (const locale of ['ru', 'uz'] as const) assert.ok(applyRole('x'.repeat(3000 - longest), id, locale, { guard: id !== 'translator' }).length <= 3000, `${locale}/${id}`);
  }
  const consoleSource = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  assert.match(consoleSource, /maxChars=\{MAX_INPUT - maxRolePrefixLength\(role\)\}/);
  assert.doesNotMatch(consoleSource, /\.slice\(\s*0,\s*MAX_INPUT,?\s*\)/, 'the request is never cut behind the visitor’s back');
  // Nothing over the server's limit is sent: checked on the request itself, before anything is shown or counted.
  const send = consoleSource.slice(consoleSource.indexOf('const doSend = async ('), consoleSource.indexOf('const onStop ='));
  const guard = send.indexOf('if (requestMessage.length > MAX_INPUT) {');
  assert.ok(guard > 0 && guard < send.indexOf('setBusy(true);') && guard < send.indexOf('track(EV.messageSent'), 'refused before busy, the thread and message_sent');
  assert.match(send, /if \(requestMessage\.length > MAX_INPUT\) \{\s*if \(meta\.base && !meta\.request\) setInput\(trimmed\);\s*track\(EV\.aiResponseError, \{ code: "too_long" \}\);\s*focusInput\(\);\s*return;\s*\}/);
});

test('a long question under a role with longer lines is never sent over 3000 characters', () => {
  // Pasted under «Universal yordamchi» (cut to its limit), then «Biznes maslahatchi» is chosen.
  const general = 3000 - maxRolePrefixLength('general');
  const business = 3000 - maxRolePrefixLength('business');
  assert.ok(business < general, `${business} < ${general}`);
  const question = 'x'.repeat(general);
  // The request it would make is over the server's limit on either page…
  for (const locale of ['ru', 'uz'] as const) assert.ok(applyRole(question, 'business', locale).length > 3000, locale);
  // …so doSend refuses it (above), and the composer neither sends nor cuts it: it says by how much.
  // An older draft of 3000 characters is refused the same way, before any fetch.
  for (const locale of ['ru', 'uz'] as const) {
    assert.ok(applyRole('x'.repeat(3000), 'general', locale).length > 3000);
    assert.ok(!strings(locale).charsOver(102).includes("'"));
  }
  assert.equal(strings('ru').charsOver(102), 'Текст длиннее лимита на 102 символа — сократите или отправьте частями');
  assert.equal(strings('uz').charsOver(102), 'Matn limitdan 102 belgiga uzun — qisqartiring yoki qismlarga bo‘lib yuboring');
  // A server that still finds it too long (invalid_message) is said so, never «the AI service is down».
  const consoleSource = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  assert.match(consoleSource, /res\.code === "context_too_large" \|\| res\.code === "invalid_message"\s*\? t\.premium\.contextTooLarge/);
});

test('the lines around a typed question are in its language when its letters say so, else the page’s', () => {
  // Russian on the Uzbek page (the live check of 06.10 came back half Uzbek with an Uzbek frame).
  assert.equal(frameLocale('Как вежливо попросить начальника перенести встречу на завтра?', 'uz'), 'ru');
  assert.equal(frameLocale('Привет', 'ru'), 'ru');
  // Uzbek in Latin script on the Russian page, with o‘/g‘, q or a common word.
  assert.equal(frameLocale('Menga Instagram uchun post yozib ber', 'ru'), 'uz');
  assert.equal(frameLocale('to‘g‘ri javob qaysi', 'ru'), 'uz');
  assert.equal(frameLocale("O'zbekcha reja tuz", 'ru'), 'uz');
  assert.equal(frameLocale('2x² + 5x − 3 = 0 tenglamani yeching', 'uz'), 'uz');
  // Uzbek in Cyrillic script: the Uzbek frame, which asks for Latin script.
  assert.equal(frameLocale('Менга бизнес режа тузиб беринг', 'ru'), 'uz');
  assert.equal(frameLocale('Ўзбекча матн ёзинг', 'uz'), 'uz');
  // English, acronyms, possessives and numbers keep the page's frame.
  assert.equal(frameLocale('Write a short poem about my dog\'s birthday', 'ru'), 'ru');
  assert.equal(frameLocale('Explain SQL and FAQ pages', 'ru'), 'ru');
  assert.equal(frameLocale('2+2', 'ru'), 'ru');
  assert.equal(frameLocale('SMM', 'uz'), 'uz');
  assert.equal(frameLocale('', 'uz'), 'uz');
  // The majority of letters decides a mixed question.
  assert.equal(frameLocale('Instagram uchun post yoz: «Скидка»', 'uz'), 'uz');
  // English with acronyms, names and o'clock keeps the Russian page's frame.
  for (const q of ['Write a QA checklist', 'What is QA testing?', 'Tell me about Qatar', "Meet me at 5 o'clock please", "Explain o'clock usage", 'What is Iraqi cuisine?', 'Iraqi oil prices', "Write a letter to O'Brien", 'Cover letter for a job in Arlington, VA', 'A unique request, frequently asked']) {
    assert.equal(frameLocale(q, 'ru'), 'ru', q);
  }
  // Uzbek Latin without o‘ or g‘: a q, a common word, a suffix-free verb.
  for (const q of ['Salom', 'Qanday?', "o'chirib tashla", 'Qaysi biri yaxshi', 'Biznes reja tuzib ber', 'Mening ismim Ali', 'Rezyume yozib ber', 'Ishga ariza yozib ber', 'olmoqchiman']) {
    assert.equal(frameLocale(q, 'ru'), 'uz', q);
  }
  // A Russian question with code or English terms: two Cyrillic words decide, however much Latin.
  assert.equal(frameLocale('Напиши SQL запрос: SELECT * FROM users WHERE id = 1', 'uz'), 'ru');
  assert.equal(frameLocale('Сравни Python и JavaScript для backend: async/await, event loop, performance', 'uz'), 'ru');
  // …unless the Latin part is marked Uzbek: a Russian title quoted in an Uzbek question.
  assert.equal(frameLocale('Menga «Отчёт о продажах» shablonini yozib ber', 'ru'), 'uz');
  assert.equal(applyRole('Привет', 'general', frameLocale('Привет', 'uz')).startsWith('Работай как универсальный AI-помощник.'), true);
  // A button's instruction and the translator keep the page's frame; a typed question gets its own.
  const consoleSource = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  assert.match(consoleSource, /meta\.request \? meta\.frame \?\? config\.locale : role === "translator" \? config\.locale : frameLocale\(trimmed, config\.locale\)/);
});

test('the translator translates: no «answer in the language of the question», and it says which way to go', () => {
  const direction = {
    uz: 'Ruscha matnni o‘zbek tiliga (faqat lotin yozuvida), o‘zbekcha matnni rus tiliga tarjima qiling; vazifada boshqacha ko‘rsatilgan bo‘lsa, shunga amal qiling.',
    ru: 'Русский текст переводи на узбекский (только латиницей), узбекский — на русский; если в задаче сказано иначе — следуй задаче.',
  };
  for (const locale of ['ru', 'uz'] as const) {
    const sent = applyRole('Привет, как дела?', 'translator', locale, { guard: false });
    assert.doesNotMatch(sent, /shu tilda|на языке вопроса/, locale);
    assert.ok(sent.includes(direction[locale]), locale);
    assert.ok(!direction[locale].includes("'"));
    // Its composer limit counts the lines it really gets, and still fits 3000.
    const room = 3000 - maxRolePrefixLength('translator');
    assert.equal(rolePrefixLength('translator', locale), applyRole('', 'translator', locale, { guard: false }).length);
    assert.ok(applyRole('x'.repeat(room), 'translator', locale, { guard: false }).length <= 3000);
  }
  const consoleSource = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  assert.match(consoleSource, /\{ guard: role !== "translator" && meta\.answerAction !== "uzbek" && meta\.answerAction !== "russian" \}/);
});

test('AI cabinet shares the quota between the RU and UZ chats and clears only the chat session', () => {
  const memory = () => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
  };
  const previous = { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory() });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: memory() });
  try {
    assert.equal(loadRemaining(), -1);
    saveRemaining(14);
    // The UZ chat's answer reports the same server allowance a moment later.
    saveRemaining(8);
    assert.equal(loadRemaining(), 8);
    saveSessionId('session-1', 'ru');
    clearSessionId('ru');
    assert.equal(loadRemaining(), 8);
  } finally {
    for (const name of ['localStorage', 'sessionStorage'] as const) {
      if (previous[name]) Object.defineProperty(globalThis, name, { configurable: true, value: previous[name] });
      else delete (globalThis as Partial<Record<typeof name, Storage>>)[name];
    }
  }
});

test('AI cabinet templates cover SMM, business, study and image prompt MVP', () => {
  assert.ok(getTemplates('smm', 'ru').length >= 4);
  assert.ok(getTemplates('business', 'ru').length >= 7);
  assert.ok(getTemplates('study', 'uz').length >= 6);
  assert.ok(getTemplates('images', 'ru').length >= 3);
  const imagePrompt = buildImagePromptRequest('кофейня в Ташкенте', 'banner', 'ru');
  assert.match(imagePrompt, /Не создавай изображение/);
  assert.match(imagePrompt, /16:9/);
  const uzImagePrompt = buildImagePromptRequest('kafe', 'instagram', 'uz');
  assert.match(uzImagePrompt, /faqat prompt/i);
  assert.doesNotMatch(uzImagePrompt, /[А-Яа-яЁё]/);
});

// First screen of the chat (2026-09-30): honest routing for visitors who
// searched for the official ChatGPT, and a visible way from the Russian chat
// to the Uzbek one. The chat is client-rendered, so none of this reaches the
// prerendered HTML; these tests pin the copy and the wiring instead.
test('chat first screen: the official ChatGPT line is honest, localized and number-free', () => {
  for (const locale of ['ru', 'uz'] as const) {
    const p = strings(locale).premium;
    const line = `${p.officialLead}chatgpt.com${p.officialTail}`;
    assert.match(line, /OpenAI/);
    assert.match(line, /GPTBot\.uz/);
    assert.match(line, locale === 'uz' ? /mustaqil/ : /независим/);
    assert.doesNotMatch(line, /\d/, 'no number may enter the routing line');
    assert.ok(p.officialLead.endsWith(' ') && p.officialTail.startsWith(' '), 'the link keeps a space on both sides');
  }
  assert.ok(!strings('uz').premium.officialTail.includes("'"), 'Uzbek copy uses letter apostrophes');
});

test('chat first screen: only the Russian chat carries the Uzbek entry', () => {
  assert.deepEqual(strings('ru').uzEntry, { nav: 'O‘zbekcha', page: 'O‘zbekcha sahifa →' });
  assert.equal(strings('uz').uzEntry, undefined);
});

test('chat first screen: links, tap targets and events are wired', () => {
  const consoleSource = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  const sidebar = readFileSync(new URL('../src/gpt-chat/components/AiSidebar.tsx', import.meta.url), 'utf8');
  // chatgpt.com opens in a new tab, without an opener or a referrer: from the
  // menu since the chat design release (its line left the first screen).
  assert.match(sidebar, /href="https:\/\/chatgpt\.com\/"\s+target="_blank"\s+rel="noopener noreferrer"\s+onClick=\{onOfficial\}/);
  assert.match(consoleSource, /onOfficial=\{onOfficialClick\}/);
  assert.match(consoleSource, /track\(EV\.officialLinkClicked, \{ surface: "menu" \}\)/);
  // The header switch: the other chat, its hreflang and language, a 44px cell, on every screen.
  const header = consoleSource.slice(consoleSource.indexOf('{uzEntry ? ('), consoleSource.indexOf('<AiAccountPanel'));
  assert.match(header, /href="\/uz\/gpt-uzbek-tilida\/"\s+hrefLang="uz"\s+lang="uz"\s+data-testid="lang-uz"\s+onClick=\{\(\) => onLocaleSwitch\("header"\)\}/);
  assert.match(header, /href="\/ru\/gpt-chat\/"\s+hrefLang="ru"\s+lang="ru"\s+data-testid="lang-ru"/);
  assert.equal((header.match(/min-h-11 min-w-11/g) ?? []).length, 2);
  assert.match(header, /<span className="gpt-lang-full">\{uzEntry\.nav\}<\/span>\s*<span className="gpt-lang-short">UZ<\/span>/);
  // The resting-screen link to the Uzbek chat.
  assert.match(consoleSource, /href="\/uz\/gpt-uzbek-tilida\/"\s+hrefLang="uz"\s+lang="uz"\s+data-testid="gpt-uz-entry"\s+onClick=\{\(\) => onLocaleSwitch\("empty"\)\}/);
  assert.match(consoleSource, /track\(EV\.localeSwitched, \{ from: "ru", surface \}\)/);
  assert.equal(EV.officialLinkClicked, 'official_link_clicked');
  assert.equal(EV.localeSwitched, 'locale_switched');
  const css = readFileSync(new URL('../src/gpt-chat/premium.css', import.meta.url), 'utf8');
  assert.match(css, /\.gpt-official \{[^}]*font-size: 12px/);
  // 12px text: 15px of padding above and below the ~14px inline box is a
  // 44px+ target, and position:relative keeps the next line from taking half of it.
  assert.match(css, /\.gpt-official a \{[^}]*position: relative;[^}]*padding: 15px 2px;/);
});
