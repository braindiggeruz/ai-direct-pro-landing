import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { solveLinearEquation } from '../public/assets/pseo-20261108/practice.js';
import { PSEO_PRACTICE_PAGES } from '../src/shared/pseo20';
import { isPseoPracticePage, renderPseoLearning } from '../scripts/pseo-learning';
import type { Page } from '../src/shared/types';

test('linear solver checks both sides using exact arithmetic, including decimal and fractional answers', () => {
  for (const [input, expected] of [
    ['2x + 3 = 11', '4'], ['2x + 3 = x + 8', '5'], ['-x + 3 = 8', '-5'],
    ['0.1x + 0.2 = 0.3', '1'], ['0,1x+0,2=0,3', '1'], ['3x = 1', '1/3'],
    ['12.5*x-3=4.5*x+5', '1'], ['.5x = 1', '2'], ['−2x=8', '-4'],
    ['100000000x=1', '1/100000000'], ['x + x + 3 = 15', '6'],
  ]) {
    const result = solveLinearEquation(input);
    assert.equal(result.kind, 'one', input); assert.equal(result.value, expected, input);
    assert.match(result.verification, /chap tomon = .+, o‘ng tomon = .+\./);
  }
  assert.equal(solveLinearEquation('2x+3=2x+3').kind, 'all');
  assert.equal(solveLinearEquation('2x+3=2x+4').kind, 'none');
  assert.equal(solveLinearEquation('0x=0').kind, 'all');
});

test('linear solver refuses unsupported input without evaluating or approximating it', () => {
  for (const input of ['', '2x+3', 'x=1=2', 'x*x=4', 'x^2=4', '2(x+1)=8', 'x/2=4', '*x=1',
    'x++1=2', 'x+-1=2', 'x=Infinity', 'x=1e9', 'x=<script>', 'x=NaN', 'x=0.1234567',
    'x=1234567890', '1 2x=24', '1 2=12', '1 .2x=12', '0. 1x=1', 'x=1 , 2', 'x=' + '1'.repeat(170), 'fetch("https://example.com")=x']) {
    assert.throws(() => solveLinearEquation(input), undefined, input);
  }
  const source = fs.readFileSync('public/assets/pseo-20261108/practice.js', 'utf8');
  assert.doesNotMatch(source, /\b(?:eval|fetch|setTimeout|XMLHttpRequest)\s*\(|new Function|(?:local|session)Storage|innerHTML/);
});

test('new practice layouts have one early heading and one complete quiz; old pages never opt in', () => {
  for (const item of PSEO_PRACTICE_PAGES) {
    const page = JSON.parse(fs.readFileSync(`content/pages/uz/${item.slug}.json`, 'utf8')) as Page;
    assert.equal(isPseoPracticePage(page), true);
    const html = renderPseoLearning(page);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.equal((html.match(/id="practice-quiz"/g) || []).length, 1);
    assert.ok(html.indexOf('<h1') < html.indexOf('id="practice-quiz"'));
    assert.doesNotMatch(html, /yuqoridagi chat/);
    assert.match(html, /href="#main"/);
    for (const changed of [{ ...page, locale: 'ru' }, { ...page, url: page.url + '?copy' },
      { ...page, quizSet: 'uz-matematika' }, { ...page, chatRole: 'writer' }]) {
      assert.equal(isPseoPracticePage(changed as Page), false);
    }
    if (item.slug === 'karra-jadvali') {
      assert.equal((html.match(/<td data-mul-a=/g) || []).length, 100);
      for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) {
        assert.ok(html.includes(`<td data-mul-a="${a}" data-mul-b="${b}">${a * b}</td>`));
      }
    }
  }
  for (const slug of ['gpt-uzbek-tilida', 'matematika-test', 'fizika-test', 'onlayn-testlar']) {
    const old = JSON.parse(fs.readFileSync(`content/pages/uz/${slug}.json`, 'utf8')) as Page;
    assert.equal(renderPseoLearning(old), '');
  }
});
