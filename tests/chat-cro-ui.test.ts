// Chat CRO 2026-11-17: the first screen asks the page's own question, a chip with a complete prompt sends on one tap,
// the pack button stays an outline until two answers, a trial counter and follow-ups come after an answer, and none of it
// rides on the start bundle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { roleUi } from '../src/gpt-chat/role-ui';
import { AnswerFeedback, TrialCounter } from '../src/gpt-chat/parts/cro';

// The sources use the automatic JSX runtime in the build; the test runner transforms them with the classic one.
(globalThis as { React?: typeof React }).React = React;

const read = (file: string) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const chat = read('src/gpt-chat/components/AiChatConsole.tsx');
const css = read('src/gpt-chat/premium.css');

test('the role lines: four roles, both languages, Uzbek with U+2018 and U+2019 and never an ASCII apostrophe', () => {
  const greets = { uz: ['Qanday matn kerak?', 'Qaysi mavzuni tushuntiray?', 'Nimani tarjima qilay?', 'Qanday post kerak?'], ru: ['Какой текст нужен?', 'Какую тему объяснить?', 'Что перевести?', 'Какой пост нужен?'] };
  for (const locale of ['uz', 'ru'] as const) {
    ['writer', 'teacher', 'translator', 'smm'].forEach((role, i) => {
      const ui = roleUi(role, locale)!;
      assert.equal(ui.greet, greets[locale][i]);
      assert.ok(ui.placeholder.length > 10);
      assert.doesNotMatch(ui.greet + ui.placeholder, /'/, `${locale}/${role}: no ASCII apostrophe`);
    });
    // The main chats and the roles without lines keep the general wording.
    assert.equal(roleUi(undefined, locale), undefined);
    assert.equal(roleUi('marketer', locale), undefined);
  }
  assert.match(roleUi('writer', 'uz')!.placeholder, /she’r/);
});

test('the console takes the role question and example from config.roleUi; the chat-tool part brings them and the prerender writes the same question into the frame', () => {
  assert.match(chat, /const welcome = config\.roleUi\?\.greet \?\? t\.premium\.welcome;/);
  assert.match(read('src/gpt-chat/parts/chat-tool.ts'), /roleUi\(config\.role, config\.locale\)/);
  const prerender = read('scripts/prerender.ts');
  assert.match(prerender, /<p class="gpt-greet gpt-shell-greet"\$\{shellGreet\(page, uz\)\} aria-hidden="true"><\/p>/);
  assert.match(css, /#gpt-chat-root \.gpt-shell-greet\[data-g\]::before \{ content: attr\(data-g\); \}/);
  // The main chats' frame gets no attribute: their prerendered HTML does not change.
  assert.match(prerender, /return greet \? ` data-g="\$\{escapeHtml\(greet\)\}"` : '';/);
});

test('the pack button is an outline until two of the three trial answers are used, then the accent it always had', () => {
  assert.match(read('src/gpt-chat/components/AiAccountPanel.tsx'), /data-quiet=\{\(trial && remaining > 1\) \|\| undefined\}/);
  assert.match(chat, /trial=\{trial\}/);
  assert.match(css, /\.gpt-account-trigger\[data-purchase="true"\]:not\(\[data-quiet\]\) \{ background: var\(--accent\);/);
  assert.doesNotMatch(css, /\.gpt-account-trigger\[data-purchase="true"\] \{/);
});

test('a chip sends on one tap unless its prompt ends a line with a colon: those fill the composer', () => {
  const sends = (insert: string) => !/:\s*$/m.test(insert);
  assert.equal(sends('Реши задачу по шагам: '), false);
  assert.equal(sends('Напиши поздравление.\nИмя: \nВозраст: '), false);
  assert.equal(sends('Yechimimni tekshir. Shart:\nMening yechimim:'), false);
  assert.equal(sends('Составь план, как выучить 50 глаголов за 2 недели: сколько в день и как повторять.'), true);
  assert.match(chat, /if \(!sendDisabled && !\/:\\s\*\$\/m\.test\(chip\.insert\)\) return void doSend\(chip\.insert\);/);
  // The page's chips are at least 44px and one line high.
  assert.match(read('scripts/tool-widgets.ts'), /\.gpt-starters \.gpt-task\{width:auto;padding:0 18px;height:48px;font-size:15px\}/);
});

test('after an answer: three follow-ups of the role that send, two rating buttons, and the trial counter; all in the lazy part', () => {
  const html = (locale: 'uz' | 'ru', send?: (text: string) => void) => renderToStaticMarkup(React.createElement(AnswerFeedback, { locale, followUps: send }));
  for (const locale of ['uz', 'ru'] as const) {
    const withChips = html(locale, () => undefined);
    assert.equal((withChips.match(/class="gpt-followup"/g) ?? []).length, 3);
    assert.equal((withChips.match(/<button/g) ?? []).length, 5, 'three chips, two ratings');
    assert.equal((html(locale).match(/class="gpt-followup"/g) ?? []).length, 0, 'the chips only under the last answer');
  }
  assert.match(html('uz', () => undefined), /Qisqaroq yoz.*Boshqa variant.*Batafsilroq/);
  assert.match(html('ru', () => undefined), /Короче.*Другой вариант.*Подробнее/);
  assert.equal(renderToStaticMarkup(React.createElement(TrialCounter, { left: 2, locale: 'uz' })), '<p class="gpt-trial-counter" data-testid="ai-trial-counter">Bepul javoblar: 2 / 3</p>');
  assert.equal(renderToStaticMarkup(React.createElement(TrialCounter, { left: 2, locale: 'ru' })), '<p class="gpt-trial-counter" data-testid="ai-trial-counter">Бесплатных ответов: 2 из 3</p>');
  assert.equal(renderToStaticMarkup(React.createElement(TrialCounter, { left: 3, locale: 'ru' })), '', 'nothing before the first answer');
  assert.equal(renderToStaticMarkup(React.createElement(TrialCounter, { left: -1, locale: 'ru' })), '', 'nothing while the count is unknown');
  // Not on the start bundle: the chat-answer part exports them, the console reaches them through the part.
  assert.match(read('src/gpt-chat/parts/chat-answer.ts'), /export \{ MessageFoot, TrialCounter \} from '\.\/cro';/);
  for (const file of ['src/gpt-chat/components/AiChatConsole.tsx', 'src/gpt-chat/components/AiChatMessageList.tsx']) {
    assert.doesNotMatch(read(file), /from ['"][./]+(?:parts\/)?cro['"]/, `${file} does not import the part statically`);
  }
});

test('the rating is one closed qualifier, the verdict and the role: no text of the question or the answer', () => {
  const events = read('src/gpt-chat/ui-events.ts');
  assert.match(events, /answer_rating: `\$\{'up' \| 'down'\}_\$\{PaywallRole\}`;/);
  const part = read('src/gpt-chat/parts/cro.tsx');
  assert.match(part, /recordUiEvent\(root\?\.dataset\.apiBase \?\? '', 'answer_rating', `\$\{verdict\}_\$\{role \?\? 'general'\}`\);/);
  assert.doesNotMatch(part, /content|m\.content|innerText|textContent/, 'nothing of the answer is read');
});
