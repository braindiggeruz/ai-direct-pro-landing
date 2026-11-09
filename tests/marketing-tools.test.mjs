import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUtm, roas, numeric } from '../public/assets/marketing-20261109/tools.mjs';
const values = { source: 'telegram', medium: 'paid_placement', campaign: 'Курс & группа', content: '', term: '' };
test('UTM encodes values, keeps fragment and unrelated parameters; replacing removes duplicates and stale optional values', () => {
  const r = buildUtm('https://example.com/p?sku=3&gclid=abc&utm_source=old&utm_source=duplicate&utm_content=stale#price', values);
  const u = new URL(r.url);
  assert.equal(u.hash, '#price'); assert.equal(u.searchParams.get('sku'), '3'); assert.equal(u.searchParams.get('gclid'), 'abc');
  assert.equal(u.searchParams.get('utm_campaign'), 'Курс & группа');
  assert.deepEqual(u.searchParams.getAll('utm_source'), ['telegram']); assert.equal(u.searchParams.has('utm_content'), false);
});
test('preserve option does not silently overwrite existing attribution', () => {
  const u = new URL(buildUtm('https://example.com/?utm_source=google&utm_campaign=old&utm_content=keep', values, false).url);
  assert.equal(u.searchParams.get('utm_source'), 'google'); assert.equal(u.searchParams.get('utm_campaign'), 'old');
  assert.equal(u.searchParams.get('utm_content'), 'keep'); assert.equal(u.searchParams.get('utm_medium'), 'paid_placement');
});
test('UTM rejects script schemes, credentials, absent required fields and malformed addresses', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,a', 'https://user:pass@example.com/', '/relative', 'no url']) assert.throws(() => buildUtm(url, values));
  assert.throws(() => buildUtm('https://example.com', {...values, source:''}));
  assert.throws(() => buildUtm('https://example.com', {...values, source:'a\nb'}));
  assert.equal(buildUtm('https://t.me/examplebot', values).telegram, true);
  assert.equal(buildUtm('https://t.me.example.org/', values).telegram, false);
});
test('ROAS distinguishes revenue return, contribution and margin break-even', () => {
  assert.deepEqual(roas(6000000,2000000,40), {multiple:3,percent:300,threshold:2.5,contribution:400000});
  assert.equal(roas(3000000,1000000,20).contribution,-400000);
  assert.equal(roas(2500000,1000000,40).contribution,0);
  assert.equal(roas(0,1).multiple,0); assert.equal(roas(100,10,0).threshold,null);
  assert.equal(roas(100,10).contribution,null);
  for (const args of [[1,0],[-1,2],[1,-1],[Infinity,1],[1,2,101],[1,2,-1],[NaN,1]]) assert.throws(() => roas(...args));
  assert.throws(() => roas(1e15,1e-308));
});
test('numeric entry supports local decimal commas and spaces but rejects empty and exponent junk', () => {
  assert.equal(numeric('1 200,50'),1200.5);assert.equal(numeric('',true),null);
  for (const s of ['', 'abc', '-1', '1e6', '1,2,3', 'Infinity']) assert.throws(() => numeric(s));
});
