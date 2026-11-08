// Editorial regression checks for the ten original educational pages. The
// numeric oracles below compute results from separately transcribed givens;
// they do not reuse the answer strings or the browser quiz implementation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { Page } from '../src/shared/types';
import { quizSetIssues } from '../src/tools/quiz/set';
import { QUIZ_SETS } from '../src/tools/quiz/sets';
import { PSEO_QUIZ_SETS } from '../src/tools/quiz/sets/pseo-20261108';
import { practiceQuizJsonLd, practiceQuizPrefillIssues, renderPracticeQuizBlock } from '../scripts/widgets/practice-quiz-block';

const PAGE_SETS = {
  'karra-jadvali': 'uz-karra-jadvali',
  'matematika-misollar-1-sinf': 'uz-matematika-1-sinf',
  'matematika-misollar-2-sinf': 'uz-matematika-2-sinf',
  'matematika-misollar-3-sinf': 'uz-matematika-3-sinf',
  'tenglama-yechish': 'uz-tenglama',
  'biologiya-test': 'uz-biologiya',
  'kimyo-test': 'uz-kimyo',
  'fizika-masalalar': 'uz-fizika-masalalar',
  'kimyo-masalalar': 'uz-kimyo-masalalar',
  'geometriya-masalalar': 'uz-geometriya-masalalar',
} as const;
const pages = Object.entries(PAGE_SETS).map(([slug, setId]) => ({
  page: JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content/pages/uz', `${slug}.json`), 'utf8')) as Page,
  setId,
}));
const questions = PSEO_QUIZ_SETS.flatMap((set) => set.questions);
const byId = new Map(questions.map((q) => [q.id, q]));
const question = (id: string) => {
  const q = byId.get(id);
  assert.ok(q, `missing original question ${id}`);
  return q;
};

type NumericOracle = number | readonly [number, string];
const numeric = new Map<string, NumericOracle>();
function addNumeric(prefix: string, values: readonly (NumericOracle | null)[]) {
  values.forEach((value, index) => {
    if (value !== null) numeric.set(`${prefix}-${String(index + 1).padStart(2, '0')}`, value);
  });
}
addNumeric('karra-jadvali', [2 * 7, 3 * 8, 4 * 6, 5 * 9, 6 * 7, 7 * 8, 8 * 9, 9 * 6, 28 / 4, 36 / 4, 6 * 5, 8 * 5 + 8]);
addNumeric('matematika-1-sinf', [3 + 4, 8 - 5, 6 + 2, 9 - 4, 10 - 7, null, 12 - 1, 9 - 5, 6 + 3, 9 - 2, 6 + 2, null]);
addNumeric('matematika-2-sinf', [27 + 15, 64 - 28, 38 + 26, 70 - 45, 5 * 4, 24 / 3, [5 * 10, 'sm'], [60 + 20, 'minut'], null, 36 - 9 + 5, 53 - 18, [2 * (6 + 3), 'sm']]);
addNumeric('matematika-3-sinf', [246 + 137, 502 - 168, 7 * 8, 84 / 7, 125 * 3, 96 / 4, (36 + 24) / 6, 20 * 3 / 4, [1000 + 250, 'g'], [9 * 4, 'sm²'], 65 / 5, 3 * 18 + 12]);
// SI relations: s=vt, v=s/t, density=m/V, F=ma, W=Fs (parallel),
// power=W/t, pressure=F/A (normal), U=IR. Unit conversions are explicit.
addNumeric('fizika-masalalar', [
  [3 * 8, 'm'], [150 / 30, 'm/s'], [120 / 4, 's'], [72 * 1000 / 3600, 'm/s'],
  [540 / 200, 'g/sm³'], [1.5 * 40, 'g'], [3 * 2, 'N'], [5 * 10, 'N'],
  [12 * 3, 'J'], [180 / 6, 'W'], [60 / 0.2, 'Pa'], [8 * 0.5, 'V'],
]);
// M is in g/mol, n=m/M; mass fraction uses TOTAL solution mass.
addNumeric('kimyo-masalalar', [
  [2 * 1 + 16, 'g/mol'], [12 + 2 * 16, 'g/mol'], [23 + 35.5, 'g/mol'],
  [9 / 18, 'mol'], [0.25 * 44, 'g'], [100 * 10 / 200, '%'], [300 * 4 / 100, 'g'],
  [100 * (100 * 10 / 100) / (100 + 100), '%'], [5.85 / 58.5, 'mol'],
  [100 * 15 / (15 + 85), '%'], [250 - 250 * 8 / 100, 'g'], [3 * (1 + 2), 'ta'],
]);
addNumeric('geometriya-masalalar', [
  [8 * 5, 'sm²'], [2 * (8 + 5), 'sm'], [7 ** 2, 'sm²'], [36 / 4, 'sm'],
  [12 * 5 / 2, 'sm²'], [Math.hypot(6, 8), 'sm'], [180 - 50 - 60, '°'],
  [2 * 3.14 * 3, 'sm'], [10 / 2, 'sm'], [4 ** 3, 'sm³'], [2 * 3 * 5, 'sm³'], [9 * 4, 'sm²'],
]);
numeric.set('kimyo-05', [2 + 1, 'ta']);

// Independently expanded linear equations ax+b=cx+d, in question order.
const equations: readonly (readonly [number, number, number, number])[] = [
  [1, 17, 0, 42], [1, -28, 0, 19], [6, 0, 0, 54], [1 / 4, 0, 0, 7],
  [3, 5, 0, 26], [5, -9, 0, 31], [2, 8, 0, 22], [7, 3, 4, 30],
  [1 / 3, 4, 0, 10], [4, -8, 3, 7],
];
equations.forEach(([a, b, c, d], index) => numeric.set(`tenglama-${String(index + 1).padStart(2, '0')}`, (d - b) / (a - c)));

// Conceptual facts are reviewed separately from arithmetic. Primary reference
// links are visible on the page: OpenStax Biology/Chemistry and IUPAC. These
// expectations prevent accidental answer-index/distractor edits changing facts.
const concepts: Record<string, string> = {
  'matematika-1-sinf-06': '<',
  'matematika-1-sinf-12': '1 o‘nlik va 3 birlik',
  'matematika-2-sinf-09': '<',
  'tenglama-11': 'Barcha haqiqiy sonlar',
  'tenglama-12': 'Yechim yo‘q',
  'biologiya-01': 'Hujayra',
  'biologiya-02': 'Xloroplast',
  'biologiya-03': 'DNK',
  'biologiya-04': 'Ribosoma',
  'biologiya-05': 'Plazmatik membrana',
  'biologiya-06': 'Ildiz',
  'biologiya-07': 'Ksilema',
  'biologiya-08': 'Changning urug‘chi tumshuqchasiga tushishi',
  'biologiya-09': 'Karbonat angidrid va suv',
  'biologiya-10': 'O‘t',
  'biologiya-11': 'Zamburug‘lar va bakteriyalar',
  'biologiya-12': 'Turlar xilma-xilligi',
  'kimyo-01': 'Yadrodagi protonlar soniga',
  'kimyo-02': 'Protonlar va elektronlar soni',
  'kimyo-03': 'Neytronlar soni bilan',
  'kimyo-04': 'Natriy',
  'kimyo-06': 'Oddiy modda',
  'kimyo-07': 'Kimyoviy birikma',
  'kimyo-08': 'Fizik o‘zgarish',
  'kimyo-09': 'Saqlanadi',
  'kimyo-10': 'Atom raqami',
  'kimyo-11': 'Gazlar aralashmasi',
  'kimyo-12': 'Na⁺',
};

test('ten distinct original sets, twelve questions each, valid and registered once', () => {
  assert.equal(PSEO_QUIZ_SETS.length, 10);
  assert.equal(questions.length, 120);
  assert.equal(byId.size, 120);
  for (const set of PSEO_QUIZ_SETS) {
    assert.equal(set.questions.length, 12, set.id);
    assert.deepEqual(quizSetIssues(set), [], set.id);
    assert.deepEqual(practiceQuizPrefillIssues(set), [], set.id);
    assert.equal(QUIZ_SETS.filter((registered) => registered.id === set.id).length, 1, set.id);
  }
  const all = QUIZ_SETS.flatMap((set) => set.questions.map((q) => q.q.toLocaleLowerCase().trim()));
  assert.equal(new Set(all).size, all.length, 'no duplicated question across existing and new sets');
  assert.deepEqual(new Set([...numeric.keys(), ...Object.keys(concepts)]), new Set(byId.keys()), 'every answer has an editorial oracle');
});

test('92 computed numeric answers and their units are correct; no second option is numerically equivalent', () => {
  assert.equal(numeric.size, 92);
  for (const [id, oracle] of numeric) {
    const q = question(id);
    const [expected, unit] = typeof oracle === 'number' ? [oracle, ''] : oracle;
    const matches = q.options.map((option) => {
      const parts = option.replace('−', '-').match(/^(-?\d+(?:[.,]\d+)?)(.*)$/u);
      return parts !== null && Math.abs(Number(parts[1].replace(',', '.')) - expected) < 1e-9 && parts[2].trim() === unit;
    });
    assert.equal(matches.filter(Boolean).length, 1, `${id}: exactly one computed answer, including the unit`);
    assert.equal(matches[q.answer], true, `${id}: expected ${expected} ${unit}, selected ${q.options[q.answer]}`);
  }
});

test('linear equation keys satisfy both sides; degenerate equations are classified correctly', () => {
  equations.forEach(([a, b, c, d], index) => {
    const q = question(`tenglama-${String(index + 1).padStart(2, '0')}`);
    const x = Number(q.options[q.answer].replace('−', '-').replace(',', '.'));
    assert.ok(Number.isFinite(x), q.id);
    assert.ok(Math.abs((a * x + b) - (c * x + d)) < 1e-9, q.id);
    for (const option of q.options.filter((_, n) => n !== q.answer)) {
      const wrong = Number(option.replace('−', '-').replace(',', '.'));
      assert.ok(Number.isFinite(wrong), `${q.id}: numeric distractor ${option}`);
      assert.ok(Math.abs((a * wrong + b) - (c * wrong + d)) > 1e-9, `${q.id}: distractor ${option} also solves equation`);
    }
  });
  for (const x of [-100, -0.5, 0, 3, 123]) {
    assert.equal(Math.abs(0 * x), 0, '0x=0 holds for every real x');
    assert.notEqual(0 * x, 5, '0x=5 has no real solution');
  }
});

test('28 conceptual answer keys preserve the reviewed mathematical and scientific facts', () => {
  assert.equal(Object.keys(concepts).length, 28);
  for (const [id, expected] of Object.entries(concepts)) {
    const q = question(id);
    assert.equal(q.options[q.answer], expected, id);
  }
  // Content constraints behind answers, not just their array position.
  assert.match(question('fizika-masalalar-11').explanation, /Kuchni yuzaga bo‘lamiz/);
  assert.match(question('kimyo-masalalar-01').q, /molyar massalari/);
  assert.match(question('biologiya-03').q, /Hujayralarda/);
});

test('new pages publish unique intent, self canonicals, useful reference content and honest AI terms', () => {
  for (const field of ['primaryKeyword', 'title', 'description', 'h1'] as const) {
    assert.equal(new Set(pages.map(({ page }) => page[field])).size, 10, field);
  }
  for (const { page, setId } of pages) {
    assert.equal(page.status, 'published');
    assert.equal(page.locale, 'uz');
    assert.equal(page.quizSet, setId);
    assert.equal(page.canonical, `https://gptbot.uz${page.url}`);
    assert.equal(page.hreflangUz, page.url);
    assert.equal(page.hreflangRu, undefined, 'no invented translation partner');
    assert.equal(page.robotsIndex, true);
    assert.equal(page.robotsFollow, true);
    assert.match(page.title, /\| GPTBot\.uz$/);
    assert.match(page.h1, /12 ta/);
    assert.ok(page.bodyBlocks.some((b) => b.type === 'table'), `${page.url}: worked reference table`);
    const text = JSON.stringify(page.bodyBlocks);
    assert.match(text, /AI yordamida/);
    assert.match(text, /rasmiy DTM.*emas/);
    assert.match(text, /3 ta.*yangilanmaydi/);
    assert.ok(page.sources && page.sources.length > 0);
    for (const source of page.sources) assert.ok(['openstax.org', 'iupac.org', 'www.bipm.org'].includes(new URL(source.url).hostname), source.url);
    assert.ok(page.internalLinks.some((link) => link.target === '/uz/onlayn-testlar/'));
    assert.ok(page.internalLinks.some((link) => link.target === '/uz/tariflar/'));
    if (/matematika-misollar-[123]-sinf/.test(page.slug)) {
      const broaderMath = page.internalLinks.find((link) => link.target === '/uz/matematika-test/');
      assert.ok(broaderMath, 'grade pages link back to the broader mathematics hub');
      assert.match(broaderMath.anchor, /5–9-sinf/, 'the older hub is labelled for its actual grades');
    }
  }
});

test('all 120 answers and explanations render statically and match Quiz structured data', () => {
  const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  for (const { page, setId } of pages) {
    const set = PSEO_QUIZ_SETS.find((candidate) => candidate.id === setId);
    assert.ok(set);
    const html = renderPracticeQuizBlock(page, set);
    const ld = practiceQuizJsonLd(set, page.canonical);
    const parts = ld.hasPart as Array<{ text: string; acceptedAnswer: { text: string; answerExplanation: { text: string } } }>;
    assert.equal(parts.length, 12);
    for (const [index, q] of set.questions.entries()) {
      assert.ok(html.includes(escaped(q.q)), q.id);
      assert.ok(html.includes(escaped(q.options[q.answer])), q.id);
      assert.ok(html.includes(escaped(q.explanation)), `${q.id}: answer explanation is crawlable without JavaScript`);
      assert.equal(parts[index].text, q.q);
      assert.equal(parts[index].acceptedAnswer.text, q.options[q.answer]);
      assert.equal(parts[index].acceptedAnswer.answerExplanation.text, q.explanation);
    }
  }
});
