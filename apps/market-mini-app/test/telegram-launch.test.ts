import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  TELEGRAM_LAUNCH_LIMITS,
  telegramInitDataFromUrl,
} from '../src/platform/telegram';

test('Telegram launch data is recovered from the encoded WebView fragment', () => {
  const raw = [
    'auth_date=1785650000',
    'query_id=fixture-query',
    `user=${encodeURIComponent(JSON.stringify({ id: 7, first_name: 'Bormi' }))}`,
    `hash=${'a'.repeat(64)}`,
  ].join('&');
  const url = `https://gptbot-market-mini-app.pages.dev/#tgWebAppData=${encodeURIComponent(raw)}&tgWebAppVersion=9.1`;
  assert.equal(telegramInitDataFromUrl(url), raw);
});

test('Telegram launch fallback rejects missing, malformed and oversized data', () => {
  assert.equal(telegramInitDataFromUrl('not-a-url'), '');
  assert.equal(telegramInitDataFromUrl('https://example.com/#tgWebAppVersion=9.1'), '');
  const oversized = 'x'.repeat(TELEGRAM_LAUNCH_LIMITS.maxInitDataBytes + 1);
  assert.equal(
    telegramInitDataFromUrl(`https://example.com/#tgWebAppData=${oversized}`),
    '',
  );
});

test('first render and visible prices do not wait for the Telegram bridge', async () => {
  const [main, shell] = await Promise.all([
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(main, /await initializeTelegram\(\)/);
  assert.ok(
    main.indexOf('createRoot(') < main.indexOf('void initializeTelegram()'),
  );
  assert.match(shell, /boot-price">349 000 сум/);
  assert.match(shell, /boot-price">229 000 сум/);
});
