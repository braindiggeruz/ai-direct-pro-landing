// AI tool pages: a gpt-chat page with a chatRole may open in one of the
// preset roles, carry its own chips (Page.chatStarters) and show in-browser
// widgets under the chat (Page.widgets), which hand a result to the chat's
// composer through one typed event (src/shared/chat-prefill.ts) and never
// send it. Every other page, the two protected chats first, renders as
// before: no attribute, no block, no script.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { CHAT_ROLE_PRESETS, PAGE_WIDGETS, chatRolePreset, pageWidgetIssues, type Page } from '../src/shared/types';
import { CHAT_STARTER_LIMITS, chatStarterIssues, chatStarters, chatStartersAttribute, type ChatStarter } from '../src/shared/chat-starters';
import { applyRole, maxRolePrefixLength, type RoleId } from '../src/gpt-chat/roles';
import { getRoles } from '../src/gpt-chat/role-labels';
import { CHAT_PREFILL_EVENT, CHAT_PREFILL_MAX, readChatPrefill } from '../src/shared/chat-prefill';
import { pageChips } from '../src/gpt-chat/parts/chat-tool';
import { chatRoleAttributes, renderUzTranslitBlock } from '../scripts/translator-page';
import { STARTERS_STYLE, WIDGET_ENTRY, assertToolPage, chatToolHead, pageWidgets, renderToolWidgets, starterFrame, toolPageIssues, toolWidgetScripts, widgetScriptsFrom } from '../scripts/tool-widgets';
import { CALCULATOR_ANCHOR, renderCalculatorBlock } from '../scripts/widgets/calculator-block';
import { CHAT_TOOL_PART, ENTRIES, dynamicChunk, type ViteManifest } from '../scripts/vite-manifest';
import { PROTECTED_PATHS } from '../scripts/seo-protection';

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const json = <T>(file: string) => JSON.parse(read(file)) as T;

function readPages(): Page[] {
  const out: Page[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) out.push(JSON.parse(fs.readFileSync(full, 'utf8')) as Page);
    }
  };
  walk(path.join(ROOT, 'content', 'pages'));
  return out;
}
const pages = readPages();
const chatRu = json<Page>('content/pages/ru/gpt-chat.json');
const chatUz = json<Page>('content/pages/uz/gpt-uzbek-tilida.json');
const translatorRu = json<Page>('content/pages/ru/russko-uzbekskiy-perevodchik.json');
const translatorUz = json<Page>('content/pages/uz/rus-ozbek-tarjimon.json');

/** A tool page built from the Russian chat: what a content page would declare. */
const toolPage = (extra: Partial<Page>): Page => ({ ...chatRu, url: '/ru/ai-tool-test/', hreflangRu: '/ru/ai-tool-test/', hreflangUz: '/uz/ai-tool-test/', chatRole: 'teacher', ...extra });
const STARTERS: ChatStarter[] = [
  { label: 'Объяснить решение', prompt: 'Объясни по шагам, как решить: ' },
  { label: 'Проверить ответ', prompt: 'Проверь мой ответ и объясни ошибку:\nЗадача: \nМой ответ: ' },
];

// ── Roles ───────────────────────────────────────────────────────────────────

test('the presets are the tool roles, all real roles of the chat, in both languages', () => {
  assert.deepEqual([...CHAT_ROLE_PRESETS], ['translator', 'teacher', 'smm', 'marketer', 'business', 'writer']);
  for (const locale of ['ru', 'uz'] as const) {
    const ids = new Set(getRoles(locale).map((role) => role.id));
    for (const preset of CHAT_ROLE_PRESETS) assert.ok(ids.has(preset), `${locale}: ${preset} is a role of the chat`);
  }
  for (const preset of CHAT_ROLE_PRESETS) assert.equal(chatRolePreset(preset), preset);
  for (const value of ['general', 'seller', 'Writer', 'writer ', '<script>', '', undefined, null, 0, {}]) assert.equal(chatRolePreset(value), undefined, String(value));
});

test('the writer role: original texts, no copying of known authors or archives, respectful, Uzbek in Latin', () => {
  const ru = getRoles('ru').find((role) => role.id === 'writer')!;
  const uz = getRoles('uz').find((role) => role.id === 'writer')!;
  assert.equal(ru.label, 'Автор текстов');
  assert.equal(ru.description, 'Стихи, поздравления, подписи');
  assert.equal(uz.label, 'Ijodkor');
  assert.equal(uz.description, 'She’r, tabrik va matnlar');
  assert.match(ru.instruction, /оригинальные/);
  assert.match(ru.instruction, /Не копируй стихи известных авторов и тексты из архивов/);
  assert.match(ru.instruction, /без политических и религиозных оценок/);
  assert.match(ru.instruction, /латиницей с o‘, g‘ и ’/);
  assert.match(uz.instruction, /original she’r/);
  assert.match(uz.instruction, /ko‘chirmang/);
  assert.match(uz.instruction, /siyosiy va diniy baho bermang/);
  assert.match(uz.instruction, /lotin yozuvida, o‘, g‘ va ’/);
  for (const role of [ru, uz]) {
    const text = `${role.label} ${role.description} ${role.instruction}`;
    assert.doesNotMatch(text, /[A-Za-z]'[A-Za-z]|[ʻʼ`]/, 'no ASCII apostrophe or modifier letter');
  }
  assert.doesNotMatch(uz.instruction + uz.description, /[OoGg]’[a-z]/, 'o’ / g’ with the tutuq is a wrong letter');
  // The writer keeps the language line, and its prefix leaves room in the composer.
  assert.match(applyRole('Tabrik yoz', 'writer', 'uz'), /Savol qaysi tilda yozilgan bo‘lsa/);
  assert.ok(maxRolePrefixLength('writer' as RoleId) < 600);
});

// ── Starters ────────────────────────────────────────────────────────────────

test('starters: a valid list is taken whole, copied field by field', () => {
  assert.deepEqual(chatStarterIssues(STARTERS), []);
  assert.deepEqual(chatStarters(STARTERS), STARTERS);
  assert.notEqual(chatStarters(STARTERS), STARTERS, 'a copy, not the content object');
  const six = Array.from({ length: CHAT_STARTER_LIMITS.count }, (_, i) => ({ label: `Чип ${i + 1}`, prompt: `Задача ${i + 1}: ` }));
  assert.deepEqual(chatStarterIssues(six), []);
});

test('starters: caps, types, duplicates, markup and control characters are refused, and one bad chip refuses the list', () => {
  const bad: Array<[unknown, RegExp]> = [
    ['x', /not an array/],
    [[], /empty/],
    [Array.from({ length: 7 }, (_, i) => ({ label: `L${i}`, prompt: 'p' })), /at most 6/],
    [[{ label: 'a'.repeat(41), prompt: 'p' }], /label has 41 characters, at most 40/],
    [[{ label: 'ok', prompt: 'p'.repeat(401) }], /prompt has 401 characters, at most 400/],
    [[{ label: '', prompt: 'p' }], /label is empty/],
    [[{ label: 'ok', prompt: '   ' }], /prompt is empty/],
    [[{ label: ' ok', prompt: 'p' }], /label has leading or trailing spaces/],
    [[{ label: 'ok', prompt: ' p' }], /prompt has leading or trailing spaces/],
    [[{ label: 'ok', prompt: 'p  ' }], /prompt has leading or trailing spaces/],
    [[{ label: 'ok', prompt: 1 }], /prompt is not a string/],
    [[{ label: 'ok' }], /prompt is not a string/],
    [[null], /is not an object/],
    [[['a', 'b']], /is not an object/],
    [[{ label: 'ok', prompt: 'p', href: '/x' }], /unknown fields: href/],
    [[{ label: 'A', prompt: 'p' }, { label: 'a', prompt: 'q' }], /repeats another chip/],
    [[{ label: 'two\nlines', prompt: 'p' }], /label has a control character or a line break/],
    [[{ label: 'ok', prompt: 'tab\there' }], /prompt has a control character/],
    [[{ label: 'ok', prompt: 'p ' }], /prompt has a control character/],
    [[{ label: '<b>bold</b>', prompt: 'p' }], /label has markup/],
    [[{ label: 'ok', prompt: 'see <img src=x onerror=alert(1)>' }], /prompt has markup/],
    [[{ label: 'ok', prompt: 'a &amp; b' }], /prompt has markup/],
  ];
  for (const [value, issue] of bad) {
    assert.match(chatStarterIssues(value).join('\n'), issue, JSON.stringify(value));
    assert.equal(chatStarters(value), undefined, JSON.stringify(value));
  }
  // Plain text may still hold the signs maths needs, and a trailing space to type after.
  assert.deepEqual(chatStarterIssues([{ label: 'x > 5 & y < 3', prompt: 'Реши: 2 < x < 5 & x ≠ 3 ' }]), []);
  assert.deepEqual(chatStarterIssues([{ label: 'ok', prompt: 'line one\nline two' }]), []);
});

test('data-chat-starters: escaped JSON on #gpt-chat-root, read back whole or not at all', () => {
  const tricky: ChatStarter[] = [{ label: 'Say "hi" & \'bye\'', prompt: 'x > 2 and y < 3: </script><b>' }];
  // Markup in a prompt is refused by the gate, so it never reaches the attribute.
  assert.equal(chatRoleAttributes(toolPage({ chatStarters: tricky })).includes('data-chat-starters'), false);
  const plain: ChatStarter[] = [{ label: 'Say "hi" & \'bye\'', prompt: 'x > 2 and y < 3, then "quote" & done' }];
  const attrs = chatRoleAttributes(toolPage({ chatStarters: plain }));
  const value = attrs.match(/ data-chat-starters="([^"]*)"/)?.[1];
  assert.ok(value, attrs);
  assert.doesNotMatch(value, /[<>"']/, 'no raw quote or angle bracket inside the attribute');
  assert.match(value, /&quot;/);
  assert.match(value, /&amp;/);
  const decoded = value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  assert.deepEqual(chatStartersAttribute(decoded), plain, 'the chat reads back the same chips');
  // What the chat takes from the attribute.
  assert.equal(chatStartersAttribute(undefined), undefined);
  assert.equal(chatStartersAttribute(''), undefined);
  assert.equal(chatStartersAttribute('{not json'), undefined);
  assert.equal(chatStartersAttribute('{"label":"a","prompt":"b"}'), undefined, 'an object is not a list');
  assert.equal(chatStartersAttribute(JSON.stringify([{ label: 'a'.repeat(41), prompt: 'b' }])), undefined);
  assert.equal(chatStartersAttribute('x'.repeat(8001)), undefined);
  // The order of the attributes: role, pair, starters.
  assert.match(attrs, /^ data-chat-role="teacher" data-alt-href="\/uz\/ai-tool-test\/" data-chat-starters="/);
});

test('starters only on a tool page: no role or another page type, no attribute and no frame chips', () => {
  assert.equal(chatRoleAttributes({ ...chatRu, chatStarters: STARTERS }), '', 'no role');
  assert.equal(chatRoleAttributes({ ...toolPage({ chatStarters: STARTERS }), pageType: 'money' }), '', 'not a chat page');
  assert.equal(starterFrame({ ...chatRu, chatStarters: STARTERS }), undefined);
  assert.equal(starterFrame(toolPage({})), undefined, 'a tool page without starters keeps the four empty pills');
  const frame = starterFrame(toolPage({ chatStarters: STARTERS }))!;
  assert.match(frame, /^<ul class="gpt-tasks gpt-starters gpt-shell-tasks" aria-hidden="true">/);
  assert.equal((frame.match(/<li>/g) || []).length, 2);
  assert.match(frame, /<span>Объяснить решение<\/span>/);
  assert.doesNotMatch(frame, /Объясни по шагам/, 'the frame shows labels, never prompts');
  assert.match(starterFrame(toolPage({ chatStarters: [{ label: 'a < b & "c"', prompt: 'p' }] }))!, /a &lt; b &amp; &quot;c&quot;/);
});

// ── Widgets ─────────────────────────────────────────────────────────────────

test('widgets: a closed list, no repeats, each with its own Vite entry built by vite.config.ts', () => {
  assert.deepEqual([...PAGE_WIDGETS], ['uz-translit', 'calculator', 'irregular-verbs', 'practice-quiz']);
  assert.deepEqual(pageWidgetIssues(['calculator', 'irregular-verbs']), []);
  assert.match(pageWidgetIssues('calculator').join(), /not an array/);
  assert.match(pageWidgetIssues([]).join(), /empty/);
  assert.match(pageWidgetIssues(['qr-code']).join(), /not one of/);
  assert.match(pageWidgetIssues(['calculator', 'calculator']).join(), /repeats calculator/);
  const vite = read('vite.config.ts');
  for (const widget of PAGE_WIDGETS) {
    const source = ENTRIES[WIDGET_ENTRY[widget]];
    assert.ok(vite.includes(`here('./${source}')`), `${widget}: ${source} is a Vite input`);
  }
  const manifest: ViteManifest = Object.fromEntries(PAGE_WIDGETS.map((widget, i) => [ENTRIES[WIDGET_ENTRY[widget]], { file: `assets/w${i}-H.js`, isEntry: true }]));
  assert.deepEqual(widgetScriptsFrom(manifest), { 'uz-translit': '/assets/w0-H.js', calculator: '/assets/w1-H.js', 'irregular-verbs': '/assets/w2-H.js', 'practice-quiz': '/assets/w3-H.js' });
  assert.throws(() => widgetScriptsFrom({}), /not in the manifest/, 'a widget without its script stops the build');
});

const SCRIPTS = { 'uz-translit': '/assets/uz-translit-A.js', calculator: '/assets/calculator-widget-B.js', 'irregular-verbs': '/assets/irregular-verbs-C.js' };

test('widgets render in the page’s order, each with its script, only on a tool page', () => {
  const page = toolPage({ widgets: ['irregular-verbs', 'calculator'] });
  const html = renderToolWidgets(page);
  assert.ok(html.indexOf('id="irregular-verbs"') >= 0 && html.indexOf('id="irregular-verbs"') < html.indexOf(`id="${CALCULATOR_ANCHOR}"`), 'in the page’s order');
  assert.doesNotMatch(html, /data-uz-translit/);
  assert.equal(toolWidgetScripts(page, SCRIPTS), '\n<script type="module" src="/assets/irregular-verbs-C.js"></script>\n<script type="module" src="/assets/calculator-widget-B.js"></script>');
  for (const other of [
    { ...chatRu, widgets: ['calculator'] } as Page, // no role
    { ...page, pageType: 'money' } as Page, // not a chat page
    toolPage({}), // a tool page without widgets
    chatRu,
    chatUz,
  ]) {
    assert.equal(renderToolWidgets(other), '', other.url);
    assert.equal(toolWidgetScripts(other, SCRIPTS), '', other.url);
    assert.deepEqual(pageWidgets(other), []);
  }
});

test('the content gate: wrong starters or widgets, or tool fields on another page, stop the build', () => {
  assert.doesNotThrow(() => assertToolPage(toolPage({ chatStarters: STARTERS, widgets: ['calculator'] })));
  for (const page of pages) assert.deepEqual(toolPageIssues(page), [], `${page.url}: ${toolPageIssues(page).join('; ')}`);
  assert.throws(() => assertToolPage({ ...chatRu, widgets: ['calculator'] }), /need pageType gpt-chat and a chatRole/);
  assert.throws(() => assertToolPage({ ...translatorRu, pageType: 'money' }), /need pageType gpt-chat and a chatRole/);
  assert.throws(() => assertToolPage(toolPage({ widgets: ['qr' as never] })), /not one of/);
  assert.throws(() => assertToolPage(toolPage({ chatStarters: [{ label: 'x'.repeat(41), prompt: 'p' }] })), /at most 40/);
  assert.throws(() => assertToolPage({ ...chatRu, chatRole: 'general' as never }), /not one of the presets/);
});

test('every content page with starters or widgets is a tool page with valid fields and site typography', () => {
  for (const page of pages.filter((p) => p.chatStarters !== undefined || p.widgets !== undefined)) {
    assert.equal(page.pageType, 'gpt-chat', page.url);
    assert.ok(chatRolePreset(page.chatRole), `${page.url} has a preset role`);
    if (page.locale === 'uz' && page.chatStarters) {
      const text = JSON.stringify(page.chatStarters);
      assert.doesNotMatch(text, /[A-Za-z]'[A-Za-z]|[ʻʼ`]/, `${page.url}: Uzbek chips use o‘ g‘ (U+2018) and ’ (U+2019)`);
      assert.doesNotMatch(text, /[OoGg]’[a-z]/, `${page.url}: o’ / g’ with the tutuq is a wrong letter`);
    }
  }
});

// The ad-copy generator (monetization roadmap §3.1 #25, Ш9): a ready text in
// the first answer, written from what the visitor filled in, with a
// placeholder where a price, a discount, an address or a phone is missing.
// The SMM role says the same to the model, as the marketer role already
// does for figures; both live on the chat's start bundle (roles.ts).
test('the ad-copy generator: ready text in the first answer, placeholders instead of invented facts', () => {
  const uzRole = applyRole('x', 'smm', 'uz');
  assert.match(uzRole, /Narx, chegirma, manzil, telefon va raqamlarni o‘ylab topmang: o‘rniga \[narx\], \[chegirma\], \[manzil\], \[telefon\] deb yozing\./);
  const ruRole = applyRole('x', 'smm', 'ru');
  assert.match(ruRole, /Не придумывай цены, скидки, адреса, телефоны и цифры: вместо них пиши \[цена\], \[скидка\], \[адрес\], \[телефон\]\./);
  assert.match(applyRole('x', 'marketer', 'uz'), /Raqam, sharh va kafolatlarni o‘ylab topmang/);

  const page = json<Page>('content/pages/uz/gpt-telegram-instagram-ideya.json');
  assert.equal(page.chatRole, 'smm');
  assert.deepEqual(chatStarterIssues(page.chatStarters), []);
  const chips = new Map(page.chatStarters!.map(({ label, prompt }) => [label, prompt]));
  // The chips that write a new text ask for it at once, with no questions back.
  for (const label of ['Telegram reklama matni', 'Instagram posti', 'Uzum uchun mahsulot tavsifi', '5 ta sarlavha varianti']) {
    const prompt = chips.get(label);
    assert.ok(prompt, label);
    assert.match(prompt, /darhol/i, `${label}: not at once`);
    assert.match(prompt, /savol berma/i, `${label}: may ask first`);
    assert.match(prompt, /\[narx\]/, `${label}: no placeholder for a missing price`);
  }
  for (const label of ['Telegram reklama matni', 'Instagram posti']) {
    assert.ok(chips.get(label)!.includes('[narx], [chegirma], [manzil], [telefon]'), label);
  }
  // No chip carries a price, a phone or a figure of its own: only the limits it sets.
  for (const [label, prompt] of chips) {
    assert.doesNotMatch(prompt, /so‘m|сум|\+998|\d{3,}/, label);
  }
});

test('the translator pages: the translator role and the converter, as before, through widgets', () => {
  for (const page of [translatorRu, translatorUz]) {
    assert.deepEqual(page.widgets, ['uz-translit']);
    assert.equal(renderToolWidgets(page), renderUzTranslitBlock(page), 'the widgets are exactly the converter');
    assert.match(renderToolWidgets(page), /^<section id="kirill-lotin" data-uz-translit/);
    assert.equal(toolWidgetScripts(page, SCRIPTS), '\n<script type="module" src="/assets/uz-translit-A.js"></script>', 'the same one line after the chat');
  }
  // Their own six chips since 2026-10-26 (monetization roadmap §3.1 #5–6, Ш9)
  // instead of the general four: a formal letter, a message to a client, a CV
  // line, an announcement, a phrase explained, a translation checked. They
  // only fill the composer.
  for (const page of [translatorRu, translatorUz]) {
    assert.deepEqual(chatStarterIssues(page.chatStarters), [], page.url);
    assert.equal(page.chatStarters!.length, CHAT_STARTER_LIMITS.count, page.url);
    const frame = starterFrame(page)!;
    assert.match(frame, /^<ul class="gpt-tasks gpt-starters gpt-shell-tasks" aria-hidden="true">/, page.url);
    for (const { label } of page.chatStarters!) assert.ok(frame.includes(`<span>${label}</span>`), `${page.url}: ${label}`);
  }
  assert.deepEqual(translatorRu.chatStarters!.map(({ label }) => label), [
    'Перевести официальное письмо', 'Сообщение клиенту на узбекском', 'Строка для резюме',
    'Объявление на двух языках', 'Объяснить узбекскую фразу', 'Проверить мой перевод',
  ]);
  assert.deepEqual(translatorUz.chatStarters!.map(({ label }) => label), [
    'Rasmiy xatni tarjima qilish', 'Mijozga xabarni tarjima qilish', 'Rezyume uchun qator',
    'E’lonni ikki tilda yozish', 'Iborani tushuntirish', 'Tarjimamni tekshirish',
  ]);
  // A tool page in the translator role without the widget has no converter.
  assert.equal(renderUzTranslitBlock({ ...translatorRu, widgets: undefined }), '');
});

test('the protected chats carry no tool field, so their HTML changes by asset names only', () => {
  const protectedPaths = new Set<string>(PROTECTED_PATHS);
  for (const page of pages.filter((p) => protectedPaths.has(p.url))) {
    for (const field of ['chatRole', 'chatStarters', 'widgets', 'quizSet'] as const) assert.equal(page[field], undefined, `${page.url}.${field}`);
  }
  for (const chat of [chatRu, chatUz]) {
    assert.equal(chatRoleAttributes(chat), '');
    assert.equal(renderToolWidgets(chat), '');
    assert.equal(starterFrame(chat), undefined);
  }
});

// ── The calculator block ────────────────────────────────────────────────────

test('the calculator block: static keys and copy in the page’s language, AI button, honest note, no script', () => {
  for (const locale of ['ru', 'uz'] as const) {
    const html = renderCalculatorBlock({ ...toolPage({ widgets: ['calculator'] }), locale });
    assert.match(html, new RegExp(`^<section id="${CALCULATOR_ANCHOR}" data-calculator`));
    assert.doesNotMatch(html, /<h1|<nav|<main|<script|<form/);
    for (const key of ['7', '0', '×', '÷', '−', '+', '√', 'π', 'sin(', 'log(', '^2', '%']) assert.ok(html.includes(`data-calc-key="${key}"`), key);
    for (const action of ['clear', 'back', 'equals', 'ai']) assert.match(html, new RegExp(`data-calc-action="${action}"`));
    assert.match(html, /data-calc-angle="deg" aria-pressed="true"/);
    assert.match(html, /<input id="calc-in" type="text" inputmode="decimal" maxlength="200"/);
    assert.match(html, /data-msg-err-div-zero="/);
    assert.match(html, /<noscript>/);
  }
  const ru = renderCalculatorBlock(toolPage({ widgets: ['calculator'] }));
  const uz = renderCalculatorBlock({ ...toolPage({ widgets: ['calculator'] }), locale: 'uz' });
  assert.match(ru, />Объяснить с AI</);
  assert.match(ru, /data-msg-ai-prompt="Объясни по шагам: \{expression\} = \{result\}"/);
  assert.match(ru, /пробный ответ чата или AI-пакет/);
  assert.match(uz, />AI bilan tushuntirish</);
  assert.match(uz, /data-msg-ai-prompt="Qadamma-qadam tushuntir: \{expression\} = \{result\}"/);
  assert.match(uz, /sinov javobini yoki AI paketni/);
  assert.doesNotMatch(uz.replace(/<style>[\s\S]*?<\/style>/, ''), /[A-Za-z]'[A-Za-z]|&#39;|[ʻʼ]/);
});

// ── The bridge ──────────────────────────────────────────────────────────────

test('the prefill event: one name, text trimmed, line breaks kept, empty or oversized refused', () => {
  assert.equal(CHAT_PREFILL_EVENT, 'gptbot:prefill');
  const event = (detail: unknown) => ({ detail }) as unknown as Event;
  assert.equal(readChatPrefill(event({ text: '  Объясни по шагам: 2 + 2 = 4 ' })), 'Объясни по шагам: 2 + 2 = 4');
  assert.equal(readChatPrefill(event({ text: 'Line one\nline two' })), 'Line one\nline two');
  assert.equal(readChatPrefill(event({ text: 'x'.repeat(CHAT_PREFILL_MAX) }))?.length, CHAT_PREFILL_MAX);
  for (const bad of [undefined, null, 'text', { text: 1 }, { text: '' }, { text: '   ' }, { text: 'x'.repeat(CHAT_PREFILL_MAX + 1) }]) {
    assert.equal(readChatPrefill(event(bad)), null, JSON.stringify(bad));
  }
});

test('the page chips as the chat shows them: ids starter-N, the prompt as the text a chip puts in', () => {
  assert.deepEqual(pageChips(JSON.stringify(STARTERS)), [
    { id: 'starter-1', label: 'Объяснить решение', insert: 'Объясни по шагам, как решить: ' },
    { id: 'starter-2', label: 'Проверить ответ', insert: 'Проверь мой ответ и объясни ошибку:\nЗадача: \nМой ответ: ' },
  ]);
  assert.equal(pageChips(undefined), undefined);
  assert.equal(pageChips('[]'), undefined);
});

test('the chat side: a lazy part on tool pages only, nothing on the start bundle, fills and focuses, never sends', () => {
  // The start bundle (the main chats load it too) carries none of it.
  const start = ['src/gpt-chat/main.tsx', 'src/gpt-chat/components/AiChatConsole.tsx', 'src/gpt-chat/components/AiPromptChips.tsx', 'src/shared/types.ts', 'src/gpt-chat/types.ts'];
  for (const file of start) {
    assert.doesNotMatch(read(file), /^import \{[^}]*\} from '[./]+(?:shared\/)?(?:chat-starters|chat-prefill|parts\/chat-tool)'/m, `${file} imports a tool module at runtime`);
  }
  assert.match(read('src/shared/types.ts'), /^import type \{ ChatStarter \} from '\.\/chat-starters';/m);
  assert.match(read('src/gpt-chat/lazy-part.tsx'), /export const toolPart = part\(\(\) => import\('\.\/parts\/chat-tool'\)\);/);
  const main = read('src/gpt-chat/main.tsx');
  assert.match(main, /const tool = config\.role \? toolPart\.load\(\)\.then\(\(part\) => part\.toolPage\(config, el\)\) : null;/, 'only a page with a role loads the part');
  assert.match(main, /if \(tool && el\.dataset\.chatStarters\) tool\.then\(render, \(\) => render\(config\)\);/, 'with chips the chat waits for them, or mounts with its own');
  const chat = read('src/gpt-chat/components/AiChatConsole.tsx');
  assert.match(chat, /chips=\{config\.starters \|\| t\.chips\}\s*own=\{!!config\.starters\}/);
  assert.match(read('src/gpt-chat/components/AiPromptChips.tsx'), /chips\.slice\(0, own \? 6 : 4\)/);
  // The part: fills the composer as typed text, focuses it, says it took it; refuses while busy or presenting.
  const part = read('src/gpt-chat/parts/chat-tool.ts');
  assert.match(part, /Object\.getOwnPropertyDescriptor\(HTMLTextAreaElement\.prototype, 'value'\)\?\.set/);
  assert.match(part, /field\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
  assert.match(part, /field\.focus\(\{ preventScroll: true \}\)/);
  assert.match(part, /closest\('\[aria-busy="true"\]'\)/);
  assert.match(part, /dataset\.presentation === 'active'/);
  assert.match(part, /detail\.accepted = true/);
  assert.doesNotMatch(part, /doSend|\.click\(\)|requestSubmit|track\(|reachYandexGoal|fetch\(|sendBeacon/, 'nothing is sent, nothing reaches analytics');
  assert.match(read('src/gpt-chat/components/AiChatInput.tsx'), /<div className="gpt-input-surface" aria-busy=\{busy\}>/, 'the busy mark the part reads');
  // The tools: a type-only import of the bridge, the event name checked by the compiler, no request.
  for (const file of ['src/tools/calculator/main.ts', 'src/tools/irregular-verbs/main.ts']) {
    const source = read(file);
    assert.match(source, /import type \{ ChatPrefillDetail, ChatPrefillEventName \} from '\.\.\/\.\.\/shared\/chat-prefill';/, file);
    assert.doesNotMatch(source, /^import \{[^}]*\} from '\.\.\/\.\.\/shared\//m, `${file}: no value import from src/shared (it would share a chunk with the chat)`);
    assert.match(source, /const PREFILL: ChatPrefillEventName = 'gptbot:prefill';/, file);
    assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|sendBeacon|gtag|dataLayer|ym\(/, `${file}: no request, no analytics`);
  }
});

test('a page with chips preloads the lazy part it waits for and styles the chips row; no other page does', () => {
  assert.equal(chatToolHead(toolPage({ chatStarters: STARTERS }), '/assets/chat-tool-X.js'), `\n<link rel="modulepreload" href="/assets/chat-tool-X.js" />\n${STARTERS_STYLE}`);
  for (const page of [toolPage({}), toolPage({ widgets: ['calculator'] }), chatRu, chatUz]) assert.equal(chatToolHead(page, '/assets/chat-tool-X.js'), '', page.url);
  // The translator pages have chips since 2026-10-26, so they wait for the part too.
  for (const page of [translatorRu, translatorUz]) assert.equal(chatToolHead(page, '/assets/chat-tool-X.js'), `\n<link rel="modulepreload" href="/assets/chat-tool-X.js" />\n${STARTERS_STYLE}`, page.url);
  assert.equal(chatToolHead(toolPage({ chatStarters: STARTERS }), null), `\n${STARTERS_STYLE}`);
  // The row's rules: one scrolling line on a phone, wrapped and centred from 640px; never in the chat's own sheet (held to 30 000 B).
  assert.match(STARTERS_STYLE, /^<style>\.gpt-starters\{display:flex;[^}]*overflow-x:auto/);
  assert.match(STARTERS_STYLE, /@media \(min-width:640px\)\{\.gpt-starters\{flex-wrap:wrap;justify-content:center;/);
  assert.doesNotMatch(read('src/gpt-chat/premium.css'), /gpt-starters/);
  assert.equal(dynamicChunk({ [CHAT_TOOL_PART]: { file: 'assets/chat-tool-X.js', isDynamicEntry: true } }, CHAT_TOOL_PART), '/assets/chat-tool-X.js');
  assert.throws(() => dynamicChunk({}, CHAT_TOOL_PART), /not in the manifest/);
  assert.throws(() => dynamicChunk({ [CHAT_TOOL_PART]: { file: 'assets/chat-tool-X.js', isEntry: true } }, CHAT_TOOL_PART), /not in the manifest/, 'an entry is no lazy part');
  assert.match(read('scripts/prerender.ts'), /\$\{chatToolHead\(page, chatToolHref\)\}/);
});

// ── After a build (npm run build:fast) ──────────────────────────────────────
const DIST = path.join(ROOT, 'dist');
const built = (url: string) => path.join(DIST, url.replace(/^\/|\/$/g, ''), 'index.html');
test('built HTML: the main chats have no tool trace; the translator pages keep their one converter script', { skip: !fs.existsSync(built('/ru/gpt-chat/')) && 'no dist/ build present' }, () => {
  for (const url of ['/ru/gpt-chat/', '/uz/gpt-uzbek-tilida/']) {
    const html = fs.readFileSync(built(url), 'utf8');
    assert.doesNotMatch(html, /data-chat-starters|data-calculator|data-irregular-verbs|calculator-widget-|irregular-verbs-|gpt-starters/, url);
  }
  for (const page of [translatorRu, translatorUz]) {
    if (!fs.existsSync(built(page.url))) continue;
    const html = fs.readFileSync(built(page.url), 'utf8');
    assert.equal((html.match(/<script type="module" src="\/assets\/uz-translit-[\w-]+\.js"><\/script>/g) || []).length, 1, page.url);
    assert.doesNotMatch(html, /data-calculator|data-irregular-verbs/, page.url);
    // Their own chips (2026-10-26): on the mount point and in the frame.
    assert.equal((html.match(/ data-chat-starters="/g) || []).length, 1, page.url);
    assert.ok(html.includes('<ul class="gpt-tasks gpt-starters gpt-shell-tasks" aria-hidden="true">'), page.url);
  }
  // Every built tool page loads exactly the scripts of its widgets.
  for (const page of pages.filter((p) => p.widgets && p.status === 'published' && fs.existsSync(built(p.url)))) {
    const html = fs.readFileSync(built(page.url), 'utf8');
    for (const widget of PAGE_WIDGETS) {
      const loads = new RegExp(`src="/assets/${widget === 'calculator' ? 'calculator-widget' : widget}-[\\w-]+\\.js"`).test(html);
      assert.equal(loads, page.widgets!.includes(widget), `${page.url}: ${widget}`);
    }
  }
});
