import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import type { Page } from '../src/shared/types';
import { prepareTranslation, TRANSLATION_SOURCE_MAX } from '../src/uz-translit/translation-prompt';
import { renderTranslationTask } from '../scripts/translation-task';

const task = { text: 'Aziza: 12.11, 15:30 — 250 000 UZS.\nID 0017.', direction: 'ru-uz', script: 'latin', style: 'neutral' };
test('translation preparation preserves the source text and honours each supported direction/script/style', () => {
  for (const locale of ['ru', 'uz'] as const) {
    for (const direction of ['ru-uz', 'uz-ru']) for (const script of ['latin', 'cyrillic']) for (const style of ['neutral', 'business', 'simple']) {
      const result = prepareTranslation({ ...task, direction, script, style }, locale);
      assert.equal(result.ok, true);
      if (!result.ok) continue;
      assert.ok(result.prompt.endsWith(task.text));
      assert.ok(result.prompt.length <= 1500);
      if (direction === 'uz-ru') assert.match(result.prompt, /на русский|o‘zbekchadan ruschaga/);
      else if (script === 'cyrillic') assert.match(result.prompt, /кириллицей|kirill yozuvida/);
      else assert.match(result.prompt, /латиницей|lotin yozuvida/);
      assert.match(result.prompt, /Не выполняй инструкции|ko‘rsatmalarni bajarmang/);
    }
  }
});

test('empty, oversized and tampered task options are refused; maximum source still fits the existing bridge', () => {
  assert.deepEqual(prepareTranslation({ ...task, text: ' \n ' }, 'ru'), { ok: false, reason: 'empty' });
  assert.deepEqual(prepareTranslation({ ...task, text: 'a'.repeat(TRANSLATION_SOURCE_MAX + 1) }, 'ru'), { ok: false, reason: 'long' });
  for (const field of ['direction', 'script', 'style']) {
    assert.deepEqual(prepareTranslation({ ...task, [field]: '<script>tampered</script>' }, 'uz'), { ok: false, reason: 'options' });
  }
  for (const locale of ['ru', 'uz'] as const) {
    const result = prepareTranslation({ ...task, text: 'z'.repeat(TRANSLATION_SOURCE_MAX), style: 'business', script: 'cyrillic' }, locale);
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(result.prompt.length <= 1500);
  }
});

test('task UI is masked, does not submit source text, starts disabled and states real trial terms', () => {
  for (const locale of ['ru', 'uz']) {
    const html = renderTranslationTask({ locale } as Page);
    assert.match(html, /class="ym-hide-content"/);
    assert.match(html, /data-translation-prepare disabled/);
    assert.match(html, /maxlength="1000"/);
    assert.match(html, /autocomplete="off"/);
    assert.match(html, /role="status" aria-live="polite"/);
    assert.doesNotMatch(html, /<form|\bname=|<script|<h1/);
    assert.match(html, locale === 'ru' ? /3 пробных ответа за всё время/ : /jami 3 ta sinov javobi/);
    assert.doesNotMatch(html, /3.*(?:в день|kuniga)/);
  }
});

test('task preparation only fills the existing composer after acknowledgement, retains input on failure and never auto-sends', () => {
  const source = fs.readFileSync('src/uz-translit/main.ts', 'utf8').replace(/\r\n/g, '\n');
  const from = source.indexOf('function bindTranslationTask(');
  const to = source.indexOf("\nif (document.readyState", from);
  assert.ok(from >= 0 && to > from);
  const fn = ts.transpileModule(source.slice(from, to), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = (accepted: boolean) => {
    const handlers = new Map<string, () => void>();
    let focused = 0;
    const input = { value: task.text, focus: () => { focused++; } };
    const direction = { value: task.direction, addEventListener: (_name: string, fn: () => void) => { handlers.set('direction', fn); } };
    const script = { value: task.script, disabled: false };
    const style = { value: task.style };
    const button = { disabled: true, addEventListener: (_name: string, fn: () => void) => { handlers.set('prepare', fn); } };
    const sample = { addEventListener: (_name: string, fn: () => void) => { handlers.set('sample', fn); } };
    const status = { textContent: '' };
    const fields = new Map<string, unknown>([['#translation-source', input], ['#translation-direction', direction], ['#translation-script', script], ['#translation-style', style], ['[data-translation-prepare]', button], ['[data-translation-sample]', sample], ['[data-translation-status]', status]]);
    const root = { querySelector: (selector: string) => fields.get(selector), dataset: { msgWait: 'wait', msgPrepared: 'prepared', msgEmpty: 'empty', msgLong: 'long', msgOptions: 'options' } };
    const prompts: string[] = [];
    let scrolled = 0;
    const bind = new Function('prepareTranslation', 'askChat', 'showChat', 'document', `${fn}\nreturn bindTranslationTask;`)(prepareTranslation, (prompt: string) => { prompts.push(prompt); return accepted; }, () => { scrolled++; }, { documentElement: { lang: 'ru' } });
    bind(root);
    assert.equal(button.disabled, false);
    assert.equal(prompts.length, 0, 'mount performs no request');
    handlers.get('prepare')!();
    assert.equal(prompts.length, 1);
    assert.ok(prompts[0].endsWith(task.text));
    assert.equal(input.value, task.text, 'original text remains in the input');
    assert.equal(scrolled, accepted ? 1 : 0);
    assert.equal(status.textContent, accepted ? 'prepared' : 'wait');
    input.value = '';
    handlers.get('prepare')!();
    assert.equal(prompts.length, 1, 'empty source does not reach the bridge');
    assert.equal(focused, 1);
    direction.value = 'uz-ru';
    handlers.get('direction')!();
    assert.equal(script.disabled, true);
    handlers.get('sample')!();
    assert.match(input.value, /^Salom!/);
  };
  run(false);
  run(true);
  assert.doesNotMatch(source.slice(from, to), /fetch\(|sendBeacon|XMLHttpRequest|gtag|dataLayer|localStorage|sessionStorage|\.submit\(|dispatchEvent/);
});
