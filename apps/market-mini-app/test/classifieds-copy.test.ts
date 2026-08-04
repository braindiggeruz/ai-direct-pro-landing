/**
 * The classifieds screens say everything in both languages.
 *
 * Bormi launches bilingual, and a half-translated screen is worse than an
 * untranslated one: a person reading Uzbek hits a Russian word in the middle of
 * a form and stops trusting the rest of it. The buyer screen and the seller
 * screen each carry their own `words` object, so parity has to be checked per
 * screen rather than through the shared `i18n` table.
 *
 * These are source-level checks. The alternative — importing the screens — would
 * pull React and the whole component tree into a test whose subject is two
 * object literals, and would still not notice a key that exists in both
 * languages while holding Russian text in the Uzbek one. The apostrophe rule
 * below is what catches that class of mistake.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SCREENS = [
  'src/screens/ClassifiedsBuyer.tsx',
  'src/screens/ClassifiedsSeller.tsx',
] as const;

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

/**
 * The body of one locale block inside a `const words = { ru: {...}, uz: {...} }`
 * literal, found by walking braces rather than by regex: the values contain
 * apostrophes and braces of their own.
 */
function localeBlock(text: string, declaration: string, locale: 'ru' | 'uz'): string {
  const start = text.indexOf(declaration);
  assert.notEqual(start, -1, `${declaration} is missing`);
  const open = text.indexOf(`${locale}: {`, start);
  assert.notEqual(open, -1, `${declaration} has no ${locale} block`);
  let depth = 0;
  for (let index = open + locale.length + 2; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open, index);
    }
  }
  throw new Error(`${declaration}.${locale} is not closed`);
}

/** Top-level keys of one locale block. Nested objects are not copy. */
function keysOf(block: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let token = '';
  for (let index = 0; index < block.length; index += 1) {
    const character = block[index];
    if (quote) {
      if (character === quote && block[index - 1] !== '\\') quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') { quote = character; continue; }
    if (character === '{') { depth += 1; token = ''; continue; }
    if (character === '}') { depth -= 1; token = ''; continue; }
    if (depth !== 1) continue;
    if (character === ':' && token.trim()) { keys.push(token.trim()); token = ''; continue; }
    if (character === ',' || character === '\n') { token = ''; continue; }
    token += character;
  }
  return keys.filter((key) => /^[A-Za-z_$][\w$]*$/.test(key)).sort();
}

test('every classifieds screen says the same things in Russian and Uzbek', () => {
  for (const path of SCREENS) {
    const text = source(path);
    const ru = keysOf(localeBlock(text, 'const words = {', 'ru'));
    const uz = keysOf(localeBlock(text, 'const words = {', 'uz'));
    assert.ok(ru.length > 10, `${path}: the Russian block looks empty`);
    const missingUz = ru.filter((key) => !uz.includes(key));
    const missingRu = uz.filter((key) => !ru.includes(key));
    assert.deepEqual(missingUz, [], `${path}: Uzbek is missing ${missingUz.join(', ')}`);
    assert.deepEqual(missingRu, [], `${path}: Russian is missing ${missingRu.join(', ')}`);
  }
});

test('the seller’s state and reason labels are bilingual to the last one', () => {
  // A seller reads these words at the moment they are told their listing was
  // refused. That is the worst possible place for a missing translation.
  const text = source('src/screens/ClassifiedsSeller.tsx');
  for (const declaration of ['const STATE_LABELS', 'const REASON_LABELS', 'const CONDITION_LABELS']) {
    const start = text.indexOf(declaration);
    assert.notEqual(start, -1, `${declaration} is missing`);
    const end = text.indexOf('\n};', start);
    const block = text.slice(start, end);
    const ru = (block.match(/\bru:\s*'/g) ?? []).length;
    const uz = (block.match(/\buz:\s*'/g) ?? []).length;
    assert.equal(ru, uz, `${declaration}: ${ru} Russian labels against ${uz} Uzbek`);
    assert.ok(ru > 0, `${declaration} carries no copy`);
  }
});

test('Uzbek classifieds copy keeps the project apostrophe convention', () => {
  // o‘ and g‘ take U+2018; the tutuq belgisi takes U+2019. A straight ASCII
  // quote in Uzbek text is the tell-tale of copy pasted from somewhere that did
  // not care, and it renders as a different letter to a reader who does.
  for (const path of SCREENS) {
    const uz = localeBlock(source(path), 'const words = {', 'uz');
    const values = [...uz.matchAll(/:\s*'((?:[^'\\]|\\.)*)'/g)].map((match) => match[1]);
    assert.ok(values.length > 10, `${path}: no Uzbek values were read`);
    for (const value of values) {
      assert.ok(!/[oOgG]'/.test(value), `${path}: "${value}" uses a straight apostrophe after o/g`);
      assert.ok(!/’[oOgG]/.test(value), `${path}: "${value}" uses U+2019 where U+2018 belongs`);
    }
    // Cyrillic in the Uzbek block means a key was translated by copying.
    const cyrillic = values.filter((value) => /[а-яА-ЯёЁ]/.test(value));
    assert.deepEqual(cyrillic, [], `${path}: Uzbek copy still in Russian: ${cyrillic.join(' | ')}`);
  }
});
