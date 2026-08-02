import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  MarketHttpError,
  type MarketErrorCode,
} from '../functions/platform/market';
import { CATALOG_LIMITS } from '../functions/agents/sotuvchi/catalog';
import {
  assertVoiceSearchEnabled,
  groundVoiceInterpretation,
  interpretVoiceQuery,
  readVoiceAudio,
  transcribeVoiceSearch,
  voiceSearchAvailable,
  VOICE_AUDIO_LIMITS,
} from '../functions/market/voice';
import {
  AiPolicyResolver,
  AiUnavailableError,
  createAiFacade,
  createLegacyTranscriptionDriver,
} from '../functions/platform/ai';
import { handleMarketRequest } from '../functions/market/router';
import type { Env } from '../functions/_types';

const ROOT = new URL('../', import.meta.url);

function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

function voiceEnv(overrides: Partial<Env> = {}): Env {
  return {
    MARKET_VOICE_SEARCH_ENABLED: 'true',
    GROQ_API_KEY: 'unit-test-only-key',
    ...overrides,
  } as unknown as Env;
}

function audioRequest(
  body: BodyInit | null,
  contentType: string,
  extra: Record<string, string> = {},
): Request {
  return new Request('https://gptbot.uz/api/market/v1/voice/search?durationMs=4200', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...extra },
    body,
  });
}

function errorCode(error: unknown): MarketErrorCode | null {
  return error instanceof MarketHttpError ? error.code : null;
}

test('spoken Russian budget, colour and stock survive as machine constraints', () => {
  const result = interpretVoiceQuery(
    'Нужна бутылка до ста тысяч, желательно чёрная и в наличии',
  );
  assert.equal(result.maxPriceMinor, 100_000);
  assert.equal(result.availability, 'available');
  assert.equal(result.clarification, null);
  assert.equal(result.confidence, 'high');
  assert.match(result.productQuery, /бутылка/);
  assert.match(result.productQuery, /чёрная/);
  assert.doesNotMatch(result.productQuery, /нужна|желательно|наличии|\d/);
  assert.deepEqual(
    result.constraints.filter((item) => item.kind === 'attribute'),
    [{ kind: 'attribute', value: 'black' }],
  );
});

test('Russian hundreds-of-thousands and a trailing currency word are removed', () => {
  const result = interpretVoiceQuery('Покажи power bank до двухсот тысяч сум');
  assert.equal(result.maxPriceMinor, 200_000);
  assert.equal(result.productQuery, 'power bank');
});

test('Uzbek Latin request without a budget keeps the product words only', () => {
  const result = interpretVoiceQuery('Menga ish uchun katta bloknot kerak');
  assert.equal(result.maxPriceMinor, null);
  assert.equal(result.availability, null);
  assert.match(result.productQuery, /bloknot/);
  assert.doesNotMatch(result.productQuery, /menga|kerak|uchun/);
  assert.ok(result.constraints.some(
    (item) => item.kind === 'attribute' && item.value === 'large',
  ));
});

test('Uzbek `minggacha` budget is understood and `bormi` never filters stock', () => {
  const result = interpretVoiceQuery('200 minggacha tez zaryadli powerbank bormi?');
  assert.equal(result.maxPriceMinor, 200_000);
  // "bormi" is a question, not a stock filter: silently hiding preorder rows
  // would hide real catalog rows the speaker did not exclude.
  assert.equal(result.availability, null);
  assert.match(result.productQuery, /powerbank/);
  assert.doesNotMatch(result.productQuery, /bormi|minggacha/);
});

test('mixed Russian and Uzbek in one sentence keeps both product words', () => {
  const result = interpretVoiceQuery('Автодержатель kerak, telefon uchun');
  assert.equal(result.productQuery, 'автодержатель telefon');
  assert.equal(result.clarification, null);
});

test('Uzbek multiplicative hundreds compose into one amount', () => {
  assert.equal(
    interpretVoiceQuery('ikki yuz ming gacha quloqchin').maxPriceMinor,
    200_000,
  );
});

test('a bare number is never silently converted into a price', () => {
  const result = interpretVoiceQuery('powerbank 20000');
  assert.equal(result.maxPriceMinor, null);
  assert.equal(result.ambiguousPriceMinor, 20_000);
  assert.equal(result.clarification, 'budget');
  assert.equal(result.productQuery, 'powerbank');
});

test('an unusable transcript asks one question instead of searching', () => {
  for (const transcript of ['', '   ', 'ну вот', 42 as unknown as string]) {
    const result = interpretVoiceQuery(transcript);
    assert.equal(result.productQuery, '');
    assert.equal(result.clarification, 'empty_query');
    assert.equal(result.confidence, 'low');
  }
});

test('any transcript reduces to a query the catalog search accepts', () => {
  const rambling = 'Пожалуйста покажите мне что нибудь вроде беспроводных '
    + 'наушников чёрных хороших недорогих до пятисот тысяч сум в наличии '
    + 'сегодня если можно';
  const result = interpretVoiceQuery(rambling);
  const tokens = result.productQuery.split(' ').filter(Boolean);
  assert.ok(tokens.length > 0);
  assert.ok(tokens.length <= CATALOG_LIMITS.queryTokens);
  assert.ok(result.productQuery.length <= CATALOG_LIMITS.queryLength);
  assert.equal(result.maxPriceMinor, 500_000);
  assert.equal(result.availability, 'available');
});

test('a transcript longer than the cap is truncated, not rejected', () => {
  const result = interpretVoiceQuery(`наушники ${'очень '.repeat(200)}`);
  assert.match(result.productQuery, /наушники/);
});

test('a category is reported only when its real name was spoken', () => {
  const categories = [
    { id: 'cat-audio', name: 'Аудио', productCount: 4 },
    { id: 'cat-home', name: 'Для дома', productCount: 6 },
  ];
  const spoken = groundVoiceInterpretation(
    interpretVoiceQuery('покажи аудио'),
    categories,
  );
  assert.deepEqual(spoken.category, { id: 'cat-audio', name: 'Аудио' });
  assert.ok(spoken.constraints.some((item) => item.kind === 'category'));

  const invented = groundVoiceInterpretation(
    interpretVoiceQuery('покажи телевизоры'),
    categories,
  );
  assert.equal(invented.category, null);
});

test('voice audio is accepted only as a bounded, allow-listed recording', async () => {
  const ok = await readVoiceAudio(audioRequest(new Uint8Array(1_024), 'audio/webm;codecs=opus'));
  assert.equal(ok.mimeType, 'audio/webm');
  assert.equal(ok.fileName, 'voice.webm');
  assert.equal(ok.durationSeconds, 4.2);

  await assert.rejects(
    readVoiceAudio(audioRequest(new Uint8Array(16), 'application/json')),
    (error: unknown) => errorCode(error) === 'validation_failed',
  );
  await assert.rejects(
    readVoiceAudio(audioRequest(new Uint8Array(0), 'audio/webm')),
    (error: unknown) => errorCode(error) === 'validation_failed',
  );
  await assert.rejects(
    readVoiceAudio(audioRequest(
      new Uint8Array(VOICE_AUDIO_LIMITS.maxBytes + 1),
      'audio/webm',
    )),
    (error: unknown) => errorCode(error) === 'validation_failed',
  );
  await assert.rejects(
    readVoiceAudio(audioRequest(new Uint8Array(16), 'audio/webm', {
      'Content-Length': String(VOICE_AUDIO_LIMITS.maxBytes + 1),
    })),
    (error: unknown) => errorCode(error) === 'validation_failed',
  );
});

test('voice fails closed on the flag and on missing speech credentials', () => {
  assert.equal(voiceSearchAvailable(voiceEnv()), true);
  assert.equal(
    voiceSearchAvailable(voiceEnv({ MARKET_VOICE_SEARCH_ENABLED: 'false' })),
    false,
  );
  assert.equal(
    voiceSearchAvailable(voiceEnv({ GROQ_API_KEY: undefined })),
    false,
  );
  assert.throws(
    () => assertVoiceSearchEnabled(voiceEnv({ MARKET_VOICE_SEARCH_ENABLED: '' })),
    (error: unknown) => errorCode(error) === 'feature_disabled',
  );
  assert.throws(
    () => assertVoiceSearchEnabled(voiceEnv({ GROQ_API_KEY: undefined })),
    (error: unknown) => errorCode(error) === 'voice_unavailable',
  );
});

test('speech provider outages map to the two client-facing voice codes', async () => {
  const audio = {
    bytes: new ArrayBuffer(64),
    mimeType: 'audio/webm',
    fileName: 'voice.webm',
  };
  const facade = (transcribe: () => Promise<never>) => createAiFacade({
    drivers: [{ id: 'stub-speech', transcribe }],
    policy: new AiPolicyResolver([{
      task: 'transcription',
      routes: [{ driver: 'stub-speech' }],
    }]),
  });

  await assert.rejects(
    transcribeVoiceSearch(
      facade(() => Promise.reject(new AiUnavailableError('transcription', 'transcribe'))),
      audio,
    ),
    (error: unknown) => errorCode(error) === 'voice_unavailable',
  );
  await assert.rejects(
    transcribeVoiceSearch(
      facade(() => Promise.reject(new Error('provider exploded'))),
      audio,
    ),
    (error: unknown) => errorCode(error) === 'voice_unclear',
  );
});

test('a blank transcription is refused rather than searched', async () => {
  const facade = createAiFacade({
    drivers: [{ id: 'stub-speech', transcribe: async () => ({ text: '   ' }) }],
    policy: new AiPolicyResolver([{
      task: 'transcription',
      routes: [{ driver: 'stub-speech' }],
    }]),
  });
  await assert.rejects(
    transcribeVoiceSearch(facade, {
      bytes: new ArrayBuffer(64),
      mimeType: 'audio/webm',
      fileName: 'voice.webm',
    }),
    (error: unknown) => errorCode(error) === 'voice_unclear',
  );
});

test('the legacy speech driver keeps provider detail behind the AI contract', async () => {
  const driver = createLegacyTranscriptionDriver({} as Env, {
    dependencies: {
      transcribeAudio: async () => ({
        text: 'наушники до 400 тысяч',
        language: 'ru' as const,
        provider: 'groq' as const,
        model: 'whisper-large-v3',
        latencyMs: 812,
        segments: [{ start: 0, end: 1.4, text: 'наушники' }],
      }),
    },
  });
  const result = await driver.transcribe!({
    bytes: new ArrayBuffer(8),
    mimeType: 'audio/webm',
  });
  assert.equal(result.text, 'наушники до 400 тысяч');
  assert.equal(result.language, 'ru');
  assert.deepEqual(result.segments, [
    { startSeconds: 0, endSeconds: 1.4, text: 'наушники' },
  ]);
});

test('the voice route sits behind the same bearer as every other Market read', async () => {
  const response = await handleMarketRequest({
    request: new Request('https://gptbot.uz/api/market/v1/voice/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/webm',
        Origin: 'https://gptbot-market-mini-app.pages.dev',
      },
      body: new Uint8Array(64),
    }),
    env: {
      MARKET_MINI_APP_ENABLED: 'true',
      MARKET_MINI_APP_ORIGINS: 'https://gptbot-market-mini-app.pages.dev',
      MARKET_MINI_APP_SESSION_SECRET: `unit-test-only-${'x'.repeat(40)}`,
      MARKET_VOICE_SEARCH_ENABLED: 'true',
      TELEGRAM_AGENTS_BOT_TOKEN: 'not-a-provider-token',
      TELEGRAM_AGENTS_BOT_USERNAME: 'BormiMarketBot',
      GPTBOT_DRAFTS_DB: {} as D1Database,
    } as unknown as Env,
  });
  assert.equal(response.status, 401);
  assert.equal(
    (await response.json() as { error: string }).error,
    'invalid_session',
  );
});

test('voice and typed search share one grounded catalog path', async () => {
  const router = await source('functions/market/router.ts');
  // Both entry points must call runCatalogSearch: a second query path could
  // return products the typed search would never show.
  assert.equal((router.match(/await runCatalogSearch\(/g) ?? []).length, 2);
  assert.match(router, /interpretation\.productQuery\s*$/m);
  assert.doesNotMatch(
    router,
    /voiceRoutes[\s\S]*?searchPublishedProducts/,
  );
});

test('voice code never logs audio, transcripts or provider payloads', async () => {
  const files = await Promise.all([
    source('functions/market/voice/constraints.ts'),
    source('functions/market/voice/service.ts'),
    source('functions/platform/ai/drivers/legacy.ts'),
    source('apps/market-mini-app/src/lib/voice.ts'),
  ]);
  for (const file of files) {
    assert.doesNotMatch(file, /console\.(log|info|warn|error|debug)/);
    assert.doesNotMatch(file, /localStorage|sessionStorage|indexedDB/);
  }
});

test('the Mini App may use the microphone and still nothing else', async () => {
  const headers = await source('apps/market-mini-app/public/_headers');
  assert.match(headers, /microphone=\(self\)/);
  assert.match(headers, /camera=\(\), microphone=\(self\), geolocation=\(\)/);
  assert.match(headers, /connect-src 'self' https:\/\/gptbot\.uz/);
});

test('the voice kill switch is declared in the authoritative wrangler config', async () => {
  const config = await source('wrangler.toml');
  assert.match(config, /^MARKET_VOICE_SEARCH_ENABLED = "true"$/m);
});
