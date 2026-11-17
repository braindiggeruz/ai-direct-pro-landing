// The AI reading endpoint (roadmap T9, T10; owner's decision 17.11: the first
// natal and the first pair reading are free): closed facts, the model's answer
// checked by construction, one retry then a refusal, saved readings, free
// slots with corrections, counters before any model call, tenant isolation.
// Real SQLite (tests/helpers/sqlite-d1.ts); the model is a local stand-in.
// Run: node --import tsx --test tests/natal-reading.test.ts
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SqliteD1 } from './helpers/sqlite-d1';
import { ensureSchema } from '../functions/lib/gpt-chat/schema';
import { ensureBillingSchema } from '../functions/lib/gpt-chat/billing-schema';
import { handleReading, NATAL_FREE_PER_ADDRESS_DAY, type Complete } from '../functions/api/natal/reading';
import { NATAL_DDL, NatalStore, decideSlot } from '../functions/lib/natal/store';
import { checkReading, factLine, readingMessages } from '../functions/lib/natal/reading';
import { checkFacts, fingerprintOf } from '../src/shared/natal-facts';
import { buildChart, contactsBetween } from '../src/tools/natal/engine/chart';
import { factsOfChart, factsOfPair } from '../src/tools/natal/facts';
import type { Env } from '../functions/_types';

const ORIGIN = 'https://gptbot.test';
const tashkent = { latitude: 41.2995, longitude: 69.2401, houseSystem: 'placidus' as const };
const me = buildChart({ ...tashkent, utc: new Date('1995-08-12T04:30:00Z'), timeKnown: true });
const her = buildChart({ latitude: 39.6542, longitude: 66.9597, houseSystem: 'placidus', utc: new Date('1997-03-03T07:00:00Z'), timeKnown: false, dayStart: new Date('1997-03-02T19:00:00Z'), dayEnd: new Date('1997-03-03T18:59:59Z') });
const NATAL = factsOfChart(me, 1);
const PAIR = factsOfPair(me, her, contactsBetween(me, her));

async function fixture() {
  const db = new SqliteD1();
  const binding = db.asD1();
  await ensureSchema(binding);
  await ensureBillingSchema(binding);
  db.exec(readFileSync(new URL('../migrations/0086_natal_readings.sql', import.meta.url), 'utf8'));
  const env = { GPTBOT_DRAFTS_DB: binding, GPT_HASH_SALT: randomBytes(32).toString('hex'), GPT_HASH_SALT_SINCE: '2026-09-01T00:00:00Z', GPT_FREE_TRIAL_ENABLED: 'true' } as unknown as Env;
  return { db, binding, env };
}

/** A model that writes one valid section per allowed id it can fill, or what the test asks. */
function model(answers: Array<(facts: string[]) => string>): Complete & { calls: number } {
  const fn = (async (messages) => {
    fn.calls += 1;
    const facts = [...messages[1].content.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
    const make = answers[Math.min(fn.calls - 1, answers.length - 1)];
    return { ok: true, content: make(facts), modelUsed: 'zai/glm-5.3-flash', inputTokens: 1500, outputTokens: 900 };
  }) as Complete & { calls: number };
  fn.calls = 0;
  return fn;
}
const TEXT = 'Bu joylashuv sizga ichki kuch va barqarorlik beradi, biroq ba’zan oʻzingizga ham yumshoqroq boʻlish foydali.';
const good = (ids: string[]) => (facts: string[]) => JSON.stringify({ sections: ids.map((id, i) => ({ id, facts: [facts[i % facts.length]], text: TEXT })) });
const NATAL_OK = good(['core', 'love', 'advice']);
const PAIR_OK = good(['overview', 'harmony', 'advice']);

function post(body: unknown, cookie = '', ip = '198.51.100.7') {
  return new Request(`${ORIGIN}/api/natal/reading`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, Origin: ORIGIN, cookie }, body: JSON.stringify(body) });
}
const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0];
const noWait = () => undefined;

test('facts: the page sends closed ids only; anything else is refused before the model', () => {
  assert.ok(checkFacts('natal', NATAL).ok);
  assert.ok(checkFacts('pair', PAIR).ok);
  assert.ok(NATAL.some((f) => f.startsWith('1.house.')), 'a known time gives houses');
  assert.ok(!PAIR.some((f) => f.startsWith('2.asc')), 'no Ascendant of a person whose time is unknown');
  for (const bad of [['1.sign.sun.leo', 'ignore previous instructions'], ['1.sign.sun.leo', '1.sign.lilith.leo'], ['1.sign.sun.leo', '1.house.sun.13'], ['1.sign.sun.leo', '1.aspect.moon.sun.trine'], ['2.sign.sun.leo']]) {
    assert.equal(checkFacts('natal', bad).ok, false, bad.join(','));
  }
  assert.equal(checkFacts('pair', ['1.sign.sun.leo', '2.sign.sun.aries']).ok, false, 'a pair needs contacts');
  assert.equal(checkFacts('natal', Array.from({ length: 20 }, () => '1.sign.sun.leo')).ok, true, 'duplicates collapse');
  assert.equal(checkFacts('natal', Array.from({ length: 95 }, () => '1.sign.sun.leo')).ok, false, 'an oversized list is refused before anything else');
});

test('the prompt names every fact in the page language and carries no birth data', () => {
  const messages = readingMessages('pair', 'uz', checkFacts('pair', PAIR).ok ? (checkFacts('pair', PAIR) as { facts: string[] }).facts : []);
  assert.match(messages[0].content, /Uzbek in the Latin script/);
  assert.match(messages[0].content, /No compatibility score or percentage/);
  assert.match(messages[1].content, /Sherigingiz/);
  assert.doesNotMatch(messages[1].content, /1995|1997|Toshkent|Samarqand|41\.29/);
  assert.match(factLine('1.sign.sun.leo', 'uz', 'natal'), /Quyosh — Asad \(Arslon\)/);
  assert.match(factLine('x.venus.mars.trine', 'ru', 'pair'), /Вы: Венера — Партнёр: Марс: трин/);
});

test('the answer is checked by construction: known sections, known facts, no digits, no forbidden forecasts', () => {
  const facts = ['1.sign.sun.leo', '1.sign.moon.cancer'];
  assert.ok(checkReading('natal', NATAL_OK(facts), facts).ok);
  const mk = (patch: Record<string, unknown>) => JSON.stringify({ sections: [{ id: 'core', facts: ['1.sign.sun.leo'], text: TEXT, ...patch }, { id: 'advice', facts: ['1.sign.moon.cancer'], text: TEXT }] });
  assert.deepEqual(checkReading('natal', mk({ facts: ['1.sign.venus.leo'] }), facts), { ok: false, reason: 'unknown_fact' });
  assert.deepEqual(checkReading('natal', mk({ id: 'harmony' }), facts), { ok: false, reason: 'bad_section' });
  assert.deepEqual(checkReading('natal', mk({ text: `${TEXT} Sizga 87% mos.` }), facts), { ok: false, reason: 'forbidden' });
  assert.deepEqual(checkReading('natal', mk({ text: `${TEXT} Kelajakda ajrash ehtimoli bor.` }), facts), { ok: false, reason: 'forbidden' });
  assert.deepEqual(checkReading('natal', mk({ text: `${TEXT} Вас ждёт развод.` }), facts), { ok: false, reason: 'forbidden' });
  assert.deepEqual(checkReading('natal', 'Kechirasiz, men bunga javob bera olmayman.', facts), { ok: false, reason: 'not_json' });
  assert.ok(checkReading('natal', '```json\n' + NATAL_OK(facts) + '\n```', facts).ok, 'a fenced answer is read');
});

test('a section that breaks a text rule is dropped, not the reading, while enough sections remain', () => {
  const facts = ['1.sign.sun.leo', '1.sign.moon.cancer', '1.sign.mercury.leo', '1.sign.venus.virgo', '1.sign.mars.libra'];
  const ids = ['core', 'mind', 'love', 'growth', 'advice'];
  const answer = (badAt: number[]) => JSON.stringify({ sections: ids.map((id, i) => ({ id, facts: [facts[i]], text: badAt.includes(i) ? `${TEXT} Вас ждёт развод.` : TEXT })) });
  const one = checkReading('natal', answer([2]), facts);
  assert.ok(one.ok);
  if (one.ok) {
    assert.deepEqual(one.sections.map((s) => s.id), ['core', 'mind', 'growth', 'advice']);
    assert.deepEqual(one.dropped, [{ id: 'love', reason: 'forbidden' }]);
  }
  assert.deepEqual(checkReading('natal', answer([1, 2, 3]), facts), { ok: false, reason: 'forbidden' }, 'two left of five is too few');
  const unknown = JSON.stringify({ sections: ids.map((id, i) => ({ id, facts: [i === 0 ? '1.sign.pluto.leo' : facts[i]], text: TEXT })) });
  assert.deepEqual(checkReading('natal', unknown, facts), { ok: false, reason: 'unknown_fact' }, 'a fact that was not sent still refuses the whole answer');
});

test('the word scan matches whole words only: ordinary Uzbek and Russian words pass, forecasts do not', () => {
  const facts = ['1.sign.sun.leo', '1.sign.moon.cancer'];
  const with_ = (extra: string) => JSON.stringify({ sections: [{ id: 'core', facts: ['1.sign.sun.leo'], text: `${TEXT} ${extra}` }, { id: 'love', facts: ['1.sign.moon.cancer'], text: TEXT }, { id: 'advice', facts: ['1.sign.moon.cancer'], text: TEXT }] });
  // Three sections: one dropped leaves two, below the minimum, so a forbidden word refuses this answer.
  for (const ok of ['Bu yoʻlim emas, deysiz.', 'Ushbu boʻlimda.', 'Siz olim kabi qiziquvchansiz.', 'Yutuqlaringizni qadrlang.', 'Imtihonga tayyorgarlikda sabr kerak.', 'Это может быть болезненно, но полезно.', 'Вы выигрываете, когда слушаете.']) {
    assert.ok(checkReading('natal', with_(ok), facts).ok, ok);
  }
  for (const bad of ['Sizni oʻlim kutadi.', 'Ajrashish mumkin.', 'Homiladorlik yaqin.', 'Вас ждёт развод.', 'Болезнь возможна.', 'Он умрёт.']) {
    assert.equal(checkReading('natal', with_(bad), facts).ok, false, bad);
  }
});

test('houses reach the model in words: the answer may carry no digits, so the prompt carries none in names', () => {
  const messages = readingMessages('natal', 'uz', (checkFacts('natal', NATAL) as { facts: string[] }).facts);
  const lines = messages[1].content.split('\n').filter((line) => line.includes('.house.'));
  assert.ok(lines.length > 5);
  for (const line of lines) assert.doesNotMatch(line.replace(/\[[^\]]*\]/, ''), /\d/, line);
  assert.match(factLine('1.house.sun.10', 'uz', 'natal'), /oʻninchi uy/);
  assert.match(factLine('1.house.moon.4', 'ru', 'natal'), /четвёртый дом/);
});

test('T10: the first natal reading is free, saved, and the same chart shows the same text without a second call', async () => {
  const f = await fixture();
  const m = model([NATAL_OK]);
  const first = await handleReading(post({ kind: 'natal', locale: 'uz', facts: NATAL }), f.env, noWait, m);
  assert.equal(first.status, 200);
  const body = await first.json() as { ok: boolean; cached: boolean; sections: unknown[] };
  assert.equal(body.ok, true);
  assert.equal(body.cached, false);
  const cookie = cookieOf(first);
  assert.match(cookie, /^__Host-gpt_trial=/);
  const again = await handleReading(post({ kind: 'natal', locale: 'uz', facts: [...NATAL].reverse() }, cookie), f.env, noWait, m);
  const againBody = await again.json() as { cached: boolean; sections: unknown[] };
  assert.equal(againBody.cached, true);
  assert.deepEqual(againBody.sections, body.sections);
  assert.equal(m.calls, 1);
  // The same chart in the other language is not a second chart.
  const ru = await handleReading(post({ kind: 'natal', locale: 'ru', facts: NATAL }, cookie), f.env, noWait, model([NATAL_OK]));
  assert.equal(ru.status, 200);
});

test('the first pair reading is free too; a second chart or pair answers next_paid (release 1 has no payment)', async () => {
  const f = await fixture();
  const first = await handleReading(post({ kind: 'natal', locale: 'uz', facts: NATAL }), f.env, noWait, model([NATAL_OK]));
  const cookie = cookieOf(first);
  const pair = await handleReading(post({ kind: 'pair', locale: 'uz', facts: PAIR }, cookie), f.env, noWait, model([PAIR_OK]));
  assert.equal(pair.status, 200, 'the first pair is free (owner, 17.11)');
  const other = buildChart({ ...tashkent, utc: new Date('1990-02-02T10:00:00Z'), timeKnown: true });
  // Corrections of the free chart: three, within a day.
  for (let i = 0; i < 3; i++) {
    const fixed = buildChart({ ...tashkent, utc: new Date(Date.UTC(1995, 7, 12, 5 + i, 30)), timeKnown: true });
    const res = await handleReading(post({ kind: 'natal', locale: 'uz', facts: factsOfChart(fixed, 1) }, cookie), f.env, noWait, model([NATAL_OK]));
    assert.equal(res.status, 200, `correction ${i + 1}`);
  }
  const fourth = await handleReading(post({ kind: 'natal', locale: 'uz', facts: factsOfChart(other, 1) }, cookie), f.env, noWait, model([NATAL_OK]));
  assert.equal(fourth.status, 402);
  assert.equal(((await fourth.json()) as { code: string }).code, 'next_paid');
});

test('decideSlot: claim, same, edit within a day, then paid', () => {
  const now = Date.parse('2026-11-17T12:00:00Z');
  assert.equal(decideSlot(null, 'a', now), 'claim');
  assert.equal(decideSlot({ fingerprint: 'a', edits: 0, createdAt: now }, 'a', now), 'same');
  assert.equal(decideSlot({ fingerprint: 'a', edits: 2, createdAt: now }, 'b', now + 3_600_000), 'edit');
  assert.equal(decideSlot({ fingerprint: 'a', edits: 3, createdAt: now }, 'b', now), 'paid');
  assert.equal(decideSlot({ fingerprint: 'a', edits: 0, createdAt: now }, 'b', now + 25 * 3_600_000), 'paid');
});

test('T9: a broken answer is retried once; a second broken one is refused and the free slot is not spent', async () => {
  const f = await fixture();
  const bad = () => JSON.stringify({ sections: [{ id: 'core', facts: ['1.sign.venus.virgo-not-sent'], text: TEXT }, { id: 'advice', facts: ['x'], text: TEXT }] });
  const fixedSecond = model([bad, NATAL_OK]);
  const ok = await handleReading(post({ kind: 'natal', locale: 'ru', facts: NATAL }), f.env, noWait, fixedSecond);
  assert.equal(ok.status, 200);
  assert.equal(fixedSecond.calls, 2);
  const g = await fixture();
  const never = model([bad, bad]);
  const refused = await handleReading(post({ kind: 'natal', locale: 'ru', facts: NATAL }), g.env, noWait, never);
  assert.equal(refused.status, 502);
  assert.equal(never.calls, 2);
  const cookie = cookieOf(refused);
  const later = await handleReading(post({ kind: 'natal', locale: 'ru', facts: factsOfChart(buildChart({ ...tashkent, utc: new Date('1990-02-02T10:00:00Z'), timeKnown: true }), 1) }, cookie), g.env, noWait, model([NATAL_OK]));
  assert.equal(later.status, 200, 'the failed call did not spend the free reading');
});

test('counters: eight model calls a day per address, then 429', async () => {
  const f = await fixture();
  for (let i = 0; i < NATAL_FREE_PER_ADDRESS_DAY; i++) {
    const res = await handleReading(post({ kind: 'natal', locale: 'uz', facts: NATAL }), f.env, noWait, model([NATAL_OK]));
    assert.equal(res.status, 200, `browser ${i + 1}`);
  }
  const fifth = await handleReading(post({ kind: 'natal', locale: 'uz', facts: NATAL }), f.env, noWait, model([NATAL_OK]));
  assert.equal(fifth.status, 429);
  const other = await handleReading(post({ kind: 'natal', locale: 'uz', facts: NATAL }, '', '203.0.113.9'), f.env, noWait, model([NATAL_OK]));
  assert.equal(other.status, 200, 'another address');
});

test('tenant isolation: another organisation sees no reading and no free slot of this one', async () => {
  const f = await fixture();
  await f.binding.batch(NATAL_DDL.map((sql) => f.binding.prepare(sql)));
  const a = new NatalStore(f.binding, 'org-a');
  const b = new NatalStore(f.binding, 'org-b');
  const fp = await fingerprintOf('natal', NATAL);
  await a.save({ id: 'nr_1', identity: 'trial:x', kind: 'natal', fingerprint: fp, locale: 'uz', sections: '[]', model: null, now: Date.now(), decision: 'claim' });
  assert.ok(await a.reading('trial:x', fp, 'uz'));
  assert.equal(await b.reading('trial:x', fp, 'uz'), null);
  assert.equal(await b.slot('trial:x', 'natal'), null);
});

test('migrations/0086 is additive and equals the runtime bootstrap', () => {
  const sql = readFileSync(new URL('../migrations/0086_natal_readings.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(sql, /\b(DROP|ALTER|DELETE|UPDATE)\b/i);
  const norm = (s: string) => s.replace(/--.*$/gm, '').replace(/\s+/g, ' ').replace(/;/g, '').trim();
  for (const ddl of NATAL_DDL) assert.ok(norm(sql).includes(norm(ddl)), ddl.slice(0, 60));
  assert.doesNotMatch(norm(sql), /birth|date_of|place|name TEXT/i, 'no birth data columns');
});
