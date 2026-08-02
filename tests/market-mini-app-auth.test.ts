import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  MarketInitDataError,
  issueMarketSession,
  issueMediaHandle,
  verifyMarketSession,
  verifyMediaHandle,
  verifyTelegramInitData,
} from '../functions/platform/market';

const BOT_TOKEN = '123456789:TEST_ONLY_TELEGRAM_BOT_TOKEN_abcdefghijklmnopqrstuvwxyz';
const SESSION_SECRET = 'test-only-market-session-secret-0123456789abcdef';
const AUTH_DATE = 1_800_000_000;

function sign(values: Record<string, string>): string {
  const entries = Object.entries(values).sort(([left], [right]) =>
    left.localeCompare(right));
  const check = entries.map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams([...entries, ['hash', hash]]).toString();
}

function vector(overrides: Record<string, string> = {}): string {
  return sign({
    auth_date: String(AUTH_DATE),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    start_param: 'agent_s-market-test',
    user: JSON.stringify({
      id: 987654321,
      first_name: 'Aziza',
      last_name: 'Test',
      username: 'aziza_test',
      language_code: 'uz',
    }),
    ...overrides,
  });
}

test('valid Telegram initData resolves a bounded identity and locale', async () => {
  const verified = await verifyTelegramInitData(
    vector(),
    BOT_TOKEN,
    AUTH_DATE + 120,
  );
  assert.equal(verified.user.id, '987654321');
  assert.equal(verified.user.firstName, 'Aziza');
  assert.equal(verified.locale, 'uz');
  assert.equal(verified.startParam, 'agent_s-market-test');
  assert.match(verified.launchFingerprint, /^[0-9a-f]{32}$/);
});

test('tampered, expired, future and duplicate initData fail closed', async () => {
  const valid = vector();
  const tampered = valid.replace('Aziza', 'Aliza');
  await assert.rejects(
    verifyTelegramInitData(tampered, BOT_TOKEN, AUTH_DATE + 60),
    (error: unknown) => error instanceof MarketInitDataError
      && error.code === 'invalid_init_data',
  );
  await assert.rejects(
    verifyTelegramInitData(valid, BOT_TOKEN, AUTH_DATE + 301),
    (error: unknown) => error instanceof MarketInitDataError
      && error.code === 'expired_init_data',
  );
  await assert.rejects(
    verifyTelegramInitData(valid, BOT_TOKEN, AUTH_DATE - 31),
    (error: unknown) => error instanceof MarketInitDataError
      && error.code === 'future_init_data',
  );
  await assert.rejects(
    verifyTelegramInitData(`${valid}&auth_date=${AUTH_DATE}`, BOT_TOKEN, AUTH_DATE),
    (error: unknown) => error instanceof MarketInitDataError
      && error.code === 'invalid_init_data',
  );
});

test('market bearer is short-lived, audience-bound and tamper evident', async () => {
  const issued = await issueMarketSession(SESSION_SECRET, {
    sub: 'identity_market_test',
    telegramId: '987654321',
    locale: 'ru',
    launch: '0123456789abcdef0123456789abcdef',
  }, AUTH_DATE);
  const verified = await verifyMarketSession(
    SESSION_SECRET,
    issued.token,
    AUTH_DATE + 599,
  );
  assert.equal(verified.sub, 'identity_market_test');
  assert.equal(verified.exp - verified.iat, 600);
  const tail = issued.token.at(-1) === 'a' ? 'b' : 'a';
  await assert.rejects(
    verifyMarketSession(
      SESSION_SECRET,
      `${issued.token.slice(0, -1)}${tail}`,
      AUTH_DATE + 1,
    ),
  );
  await assert.rejects(
    verifyMarketSession(SESSION_SECRET, issued.token, AUTH_DATE + 600),
  );
});

test('media handle is opaque, signed and carries no Telegram file id', async () => {
  const handle = await issueMediaHandle(SESSION_SECRET, {
    productId: 'product_market_test',
    index: 2,
  });
  assert.equal(handle.includes('telegram-file-secret'), false);
  assert.deepEqual(await verifyMediaHandle(SESSION_SECRET, handle), {
    productId: 'product_market_test',
    index: 2,
  });
  assert.equal(
    await verifyMediaHandle(SESSION_SECRET, `${handle}a`),
    null,
  );
});
