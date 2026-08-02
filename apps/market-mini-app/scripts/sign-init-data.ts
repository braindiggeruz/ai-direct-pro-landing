import { createHmac } from 'node:crypto';

const token = process.env.MARKET_DEV_BOT_TOKEN;
if (!token || token.length < 20) {
  console.error('Set MARKET_DEV_BOT_TOKEN to a non-production test bot token.');
  process.exit(1);
}
const userId = Number(process.env.MARKET_DEV_TELEGRAM_USER_ID ?? '900000001');
if (!Number.isSafeInteger(userId) || userId < 1) {
  console.error('MARKET_DEV_TELEGRAM_USER_ID must be a positive integer.');
  process.exit(1);
}
const values = new URLSearchParams({
  auth_date: String(Math.floor(Date.now() / 1000)),
  query_id: `dev-${Date.now()}`,
  start_param: process.env.MARKET_DEV_START_PARAM ?? 'agent_seller',
  user: JSON.stringify({
    id: userId,
    first_name: 'Local',
    last_name: 'Tester',
    language_code: process.env.MARKET_DEV_LOCALE === 'uz' ? 'uz' : 'ru',
  }),
});
const check = [...values.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');
const secret = createHmac('sha256', 'WebAppData').update(token).digest();
values.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
console.log(values.toString());
