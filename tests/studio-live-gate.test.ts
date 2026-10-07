// Real release guard against isolated filesystem fixtures; no provider calls or secret values.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { assertStudioLiveGate } from '../scripts/release/studio-live-gate';
import { committedRuntimeConfig } from '../scripts/release/live-gate';

const ROOT = path.resolve(import.meta.dirname, '..');
const COMMON = ['GPT_IDENTITY_SECRET', 'STUDIO_TURNSTILE_SECRET_KEY', 'ZAI_API_KEY'];
const SHARED = new Set([...COMMON, 'GPT_CLICK_CREDENTIALS_JSON']);
const STUDIO_PATTERN = /STUDIO_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/;
const CHAT_PATTERN = /GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/;

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-live-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dist = path.join(root, 'dist');
  const toml = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');
  const raw = STUDIO_PATTERN.exec(toml)?.[1];
  assert.ok(raw, 'candidate has a packed Studio config');
  const studio = JSON.parse(raw) as Record<string, string>;
  const chat = committedRuntimeConfig(toml);
  const write = (file: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), body);
  };
  const config = (studioChanges: Record<string, string> = {}, chatChanges: Record<string, string> = {}) => write('wrangler.toml', toml
    .replace(STUDIO_PATTERN, () => `STUDIO_RUNTIME_CONFIG_JSON = '''${JSON.stringify({ ...studio, ...studioChanges })}'''`)
    .replace(CHAT_PATTERN, () => `GPTBOT_RUNTIME_CONFIG_JSON = '''${JSON.stringify({ ...chat, ...chatChanges })}'''`));
  config();
  const offers = Object.fromEntries(['ru', 'uz'].map(locale => {
    const file = `content/pages/${locale}/oferta.json`;
    const body = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const offer = JSON.parse(body) as { url: string; termsVersion: string; status: string; bodyBlocks: unknown[] };
    write(file, body);
    write(`dist${offer.url}index.html`, `<html><main>${offer.termsVersion} Studio</main></html>`);
    return [locale, offer];
  }));
  for (const page of ['uz/tariflar', 'uz/taqdimot-ai', 'ru/prezentatsiya-ai']) write(`dist/${page}/index.html`, '<div id="studio-root"></div>');
  return { root, dist, studio, chat, offers, write, config, check: (names: ReadonlySet<string> | null = SHARED) => assertStudioLiveGate(root, dist, names) };
}

test('Studio live gate: current candidate passes with shared Click names and matching built offers', t => {
  const f = fixture(t);
  assert.equal(f.studio.STUDIO_PAYMENTS, 'live', 'positive test must exercise the live branch');
  assert.equal(f.studio.STUDIO_PAYMENT_PROVIDERS, 'click');
  assert.equal(f.studio.STUDIO_CLICK_USE_CHAT_SERVICE, 'true');
  assert.equal(f.chat.GPT_BILLING_MODE_CLICK, 'live');
  assert.doesNotThrow(() => f.check());
});

test('Studio live gate: shared and separate Click require their own secret names, with no fallback', t => {
  const f = fixture(t);
  for (const shared of [true, false]) {
    f.config({ STUDIO_CLICK_USE_CHAT_SERVICE: String(shared) });
    const required = shared ? 'GPT_CLICK_CREDENTIALS_JSON' : 'STUDIO_CLICK_CREDENTIALS_JSON';
    const wrong = shared ? 'STUDIO_CLICK_CREDENTIALS_JSON' : 'GPT_CLICK_CREDENTIALS_JSON';
    assert.doesNotThrow(() => f.check(new Set([...COMMON, required])));
    assert.throws(() => f.check(new Set([...COMMON, wrong])), new RegExp(`missing production secret name ${required}`));
  }
  f.config();
  for (const name of COMMON) assert.throws(() => f.check(new Set([...SHARED].filter(item => item !== name))), new RegExp(`missing production secret name ${name}`));
});

test('Studio live gate: secret inventory may be deferred offline; substantive live requirements may not', t => {
  const f = fixture(t);
  assert.doesNotThrow(() => f.check(null));
  f.config({ STUDIO_CLICK_AMOUNTS_CONFIRMED: 'false' });
  assert.throws(() => f.check(null), /Studio Click amounts not confirmed/);
});

test('Studio live gate: each delivery switch and an explicit provider are required', t => {
  const f = fixture(t);
  for (const setting of ['STUDIO_API', 'STUDIO_PAID_SERVICE', 'STUDIO_FULL_DECK']) {
    f.config({ [setting]: 'off' });
    assert.throws(() => f.check(), /Studio paid delivery is off/, setting);
  }
  for (const value of ['', 'uzum']) {
    f.config({ STUDIO_PAYMENT_PROVIDERS: value });
    assert.throws(() => f.check(), /Studio has no payment provider/);
  }
});

test('Studio live gate: unconfirmed tariffs and a shared Click service outside live are rejected', t => {
  const f = fixture(t);
  f.config({ STUDIO_CLICK_AMOUNTS_CONFIRMED: 'false' });
  assert.throws(() => f.check(), /Studio Click amounts not confirmed/);
  for (const mode of ['test', '']) {
    f.config({}, { GPT_BILLING_MODE_CLICK: mode });
    assert.throws(() => f.check(), /Shared Click cash desk is not live/);
  }
});

test('Studio live gate: selecting Payme while its cash desk is test blocks release even with both secret names', t => {
  const f = fixture(t);
  const names = new Set([...COMMON, 'GPT_PAYME_KEY', 'GPT_PAYME_MERCHANT_ID']);
  f.config({ STUDIO_PAYMENT_PROVIDERS: 'payme' }, { GPT_BILLING_MODE_PAYME: 'test' });
  assert.throws(() => f.check(names), /Payme cash desk is not live/);
  f.config({ STUDIO_PAYMENT_PROVIDERS: 'payme' }, { GPT_BILLING_MODE_PAYME: 'live' });
  assert.doesNotThrow(() => f.check(names));
  for (const name of ['GPT_PAYME_KEY', 'GPT_PAYME_MERCHANT_ID']) assert.throws(() => f.check(new Set([...names].filter(item => item !== name))), new RegExp(`missing production secret name ${name}`));
});

test('Studio live gate: every fiscal field and a valid non-future approval date are mandatory', t => {
  const f = fixture(t);
  for (const field of ['GPT_FISCAL_IKPU', 'GPT_FISCAL_PACKAGE_CODE', 'GPT_FISCAL_VAT_PERCENT', 'GPT_FISCAL_TIN']) {
    f.config({}, { [field]: '' });
    assert.throws(() => f.check(), new RegExp(`missing ${field}`));
  }
  for (const date of ['', '2026-02-30', new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10)]) {
    f.config({ STUDIO_TERMS_APPROVED_AT: date });
    assert.throws(() => f.check(), /Studio owner approval date missing\/future/);
  }
});

test('Studio live gate: absent, unsupported and mismatched offer editions cannot sell', t => {
  const f = fixture(t);
  for (const version of ['', 'studio-unreviewed-v99']) {
    f.config({ STUDIO_TERMS_VERSION: version });
    assert.throws(() => f.check(), /Studio\/chat offer editions differ/);
  }
  f.config({}, { GPT_BILLING_TERMS_VERSION: 'chat-old-v1' });
  assert.throws(() => f.check(), /Studio\/chat offer editions differ/);
});

test('Studio live gate: both offers must be published, name Studio, match their URL and appear in the built artifact', t => {
  const f = fixture(t);
  for (const locale of ['ru', 'uz']) {
    const file = `content/pages/${locale}/oferta.json`; const offer = f.offers[locale];
    for (const patch of [{ status: 'draft' }, { termsVersion: 'old-edition' }, { bodyBlocks: [] }]) {
      f.write(file, JSON.stringify({ ...offer, ...patch }));
      assert.throws(() => f.check(), /published Studio terms missing/);
    }
    f.write(file, JSON.stringify({ ...offer, url: `/${locale}/wrong-offer/` }));
    assert.throws(() => f.check(), /offer URL mismatch/);
    f.write(file, JSON.stringify(offer));
    const built = `dist${offer.url}index.html`;
    f.write(built, '<html>old-edition</html>');
    assert.throws(() => f.check(), /built offer edition missing/);
    f.write(built, `<html>${offer.termsVersion}</html>`);
  }
});

test('Studio live gate: missing built delivery pages and unreviewed AI fallback block release', t => {
  const f = fixture(t);
  for (const page of ['uz/tariflar', 'uz/taqdimot-ai', 'ru/prezentatsiya-ai']) {
    const file = `dist/${page}/index.html`;
    fs.unlinkSync(path.join(f.root, file));
    assert.throws(() => f.check(), new RegExp(`missing built ${page}`));
    f.write(file, '<div id="studio-root"></div>');
  }
  f.config({ STUDIO_FREE_TEXT_FALLBACK: 'openrouter:google/gemma-4-31b-it:free' });
  assert.throws(() => f.check(), /unreviewed Studio AI fallback/);
});

test('Studio live gate: stopping live sales remains deployable with missing secrets, terms, fiscal data and built pages', t => {
  const f = fixture(t);
  const absent = path.join(f.root, 'absent-dist');
  for (const locale of ['ru', 'uz']) fs.unlinkSync(path.join(f.root, `content/pages/${locale}/oferta.json`));
  for (const mode of ['off', 'test']) {
    f.config({ STUDIO_PAYMENTS: mode, STUDIO_PAID_SERVICE: 'off', STUDIO_FULL_DECK: 'false', STUDIO_PAYMENT_PROVIDERS: 'payme', STUDIO_TERMS_VERSION: '', STUDIO_TERMS_APPROVED_AT: '' }, { GPT_BILLING_MODE_PAYME: 'test', GPT_FISCAL_IKPU: '' });
    assert.doesNotThrow(() => assertStudioLiveGate(f.root, absent, new Set()));
  }
});
