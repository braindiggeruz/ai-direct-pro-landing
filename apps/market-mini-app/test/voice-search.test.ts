import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { syntheticRequest } from '../src/dev/synthetic';
import { attributeLabel, formatBudget, t } from '../src/lib/i18n';
import {
  VOICE_CAPTURE_LIMITS,
  baseMimeType,
  formatVoiceTimer,
  voiceCaptureSupported,
} from '../src/lib/voice';
import type { Locale, VoiceSearchResult } from '../src/types';

const VOICE_KEYS = [
  'voiceSearch', 'voiceStart', 'voiceIntroTitle', 'voiceIntroBody',
  'voiceExample', 'voiceAllow', 'voiceRecording', 'voiceListening',
  'voiceMaxHint', 'voiceStop', 'voiceProcessing', 'voiceHeard', 'voiceAiNote',
  'voiceApply', 'voiceUnderstood', 'voiceRemoveConstraint', 'voiceRetry',
  'voiceTypeInstead', 'voiceDeniedTitle', 'voiceDeniedBody',
  'voiceUnsupportedTitle', 'voiceUnsupportedBody', 'voiceUnclearTitle',
  'voiceUnclearBody', 'voiceTooShortBody', 'voiceUnavailableTitle',
  'voiceUnavailableBody', 'voiceLimitBody', 'voiceClarifyBudget',
  'voiceClarifyBudgetYes', 'voiceClarifyBudgetNo', 'voiceClarifyEmpty',
  'voiceNoMatch', 'voiceNoMatchBody', 'voiceUpTo', 'priceUpTo', 'unmatched',
] as const;

test('every voice string exists in both Russian and Uzbek Latin', () => {
  for (const locale of ['ru', 'uz'] as const) {
    for (const key of VOICE_KEYS) {
      const value = t(locale, key);
      assert.ok(value.length > 0, `${locale}.${key} is empty`);
    }
  }
  assert.notEqual(t('ru', 'voiceIntroTitle'), t('uz', 'voiceIntroTitle'));
});

test('Uzbek voice copy keeps the project apostrophe convention', async () => {
  const source = await readFile(new URL('../src/lib/i18n.ts', import.meta.url), 'utf8');
  const uzbek = source.slice(source.indexOf('  uz: {'));
  // Turned letters take U+2018; the glottal stop takes U+2019. A straight
  // ASCII apostrophe in Uzbek copy is always a mistake here.
  assert.doesNotMatch(uzbek, /[a-z]'[a-z]/i);
  assert.match(t('uz', 'voiceIntroBody'), /o‘zbek/);
  assert.match(t('uz', 'voiceAiNote'), /bo‘ladi/);
});

test('a spoken budget reads naturally in each locale', () => {
  assert.match(formatBudget(400_000, 'ru'), /^до 400\s?000/);
  assert.match(formatBudget(400_000, 'uz'), /gacha$/);
});

test('understood attributes are shown in the buyer language', () => {
  assert.equal(attributeLabel('black', 'ru'), 'чёрный');
  assert.equal(attributeLabel('black', 'uz'), 'qora');
  // An attribute the client does not know still renders, never blank.
  assert.equal(attributeLabel('titanium', 'ru' as Locale), 'titanium');
});

test('recorder content type is sent without codec parameters', () => {
  assert.equal(baseMimeType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(baseMimeType('audio/mp4'), 'audio/mp4');
  assert.equal(baseMimeType(''), 'audio/webm');
});

test('the recording timer stays inside the documented cap', () => {
  assert.equal(formatVoiceTimer(0), '0:00');
  assert.equal(formatVoiceTimer(9_400), '0:09');
  assert.equal(formatVoiceTimer(VOICE_CAPTURE_LIMITS.maxDurationMs), '0:30');
  assert.ok(
    VOICE_CAPTURE_LIMITS.countdownFromMs < VOICE_CAPTURE_LIMITS.maxDurationMs,
  );
  assert.ok(VOICE_CAPTURE_LIMITS.minDurationMs > 0);
});

test('a WebView without MediaRecorder never offers a microphone', () => {
  // Node has no MediaRecorder, which is exactly the "cannot record here" case
  // the buyer must be protected from: the mic is hidden, typed search remains.
  assert.equal(voiceCaptureSupported(), false);
});

test('a typed sentence finds the product in the offline fixture too', async () => {
  // The owner's journey: the transcript is sent back through ordinary typed
  // search. Production drops the intent words server-side; the fixture must not
  // demand that the whole sentence appear verbatim, or the offline QA run would
  // show an empty result for a flow that works.
  const found = await syntheticRequest<{ items: { name: string }[] }>(
    '/catalog/products?q=' + encodeURIComponent('Мне нужен чайник.'),
  );
  assert.ok(found.items.length > 0, 'a typed sentence returned nothing');
  assert.ok(
    found.items.some((item) => item.name.toLowerCase().includes('чайник')),
    'the sentence did not reach the product it names',
  );
});

test('a rambling, inflected sentence still finds the product', async () => {
  // The owner's second run, shape for shape: filler the fixture has never seen
  // plus a plural and a genitive of the product word.
  const found = await syntheticRequest<{ items: { name: string }[]; queryApplied: string | null }>(
    '/catalog/products?q=' + encodeURIComponent('Слушай, мне нужны чайники, можешь дать чайников'),
  );
  assert.ok(found.items.length > 0, 'the sentence returned nothing');
  assert.ok(
    found.items.every((item) => item.name.toLowerCase().includes('чайник')),
    'the sentence pulled in products it never named',
  );
  assert.ok(
    (found.queryApplied ?? '').includes('чайник'),
    'the applied query did not report the catalog word',
  );
});

test('voice results stay grounded in the catalog fixture', async () => {
  const result = await syntheticRequest<VoiceSearchResult>('/voice/search', {
    method: 'POST',
  });
  const home = await syntheticRequest<{ products: { id: string }[] }>('/catalog/home');
  const known = new Set(home.products.map((item) => item.id));
  assert.ok(result.transcript.length > 0);
  assert.equal(result.interpretation.maxPriceMinor, 400_000);
  assert.equal(result.interpretation.availability, 'available');
  assert.equal(result.interpretation.clarification, null);
  for (const item of result.items) {
    assert.ok(known.has(item.id), `voice returned an unknown product ${item.id}`);
    assert.ok(item.priceMinor <= 400_000);
    assert.equal(item.availability, 'available');
  }
});

test('the buyer screen hides voice unless the server reports the capability', async () => {
  const buyer = await readFile(
    new URL('../src/screens/BuyerApp.tsx', import.meta.url),
    'utf8',
  );
  assert.match(
    buyer,
    /const micAvailable = voiceEnabled && !voiceOffline && voiceCaptureSupported\(\)/,
  );
  assert.match(buyer, /micAvailable \? <button type="button" className="search-field__mic"/);
  // A 503 must switch the microphone off for the rest of the session instead
  // of inviting the buyer to fail again.
  assert.match(buyer, /if \(kind === 'unavailable'\) setVoiceOffline\(true\)/);
});

test('the recording sheet reuses the accessible modal and labels every control', async () => {
  const sheet = await readFile(
    new URL('../src/components/VoiceSearch.tsx', import.meta.url),
    'utf8',
  );
  assert.match(sheet, /<Modal[\s\S]*?sheet\s*\/?>/);
  assert.match(sheet, /className="voice-wave" aria-hidden="true"/);
  assert.match(sheet, /role="status"/);
  assert.match(sheet, /role="alert"/);
  assert.match(sheet, /aria-label=\{`\$\{t\(locale, 'voiceRemoveConstraint'\)\}/);
});
