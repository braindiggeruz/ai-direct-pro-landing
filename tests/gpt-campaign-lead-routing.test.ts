// Real SQLite/outbox and endpoint; all external traffic is intercepted.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { onRequestPost as leadPost } from '../functions/api/gpt/lead';
import { onRequestPost as maintenance } from '../functions/api/internal/gpt-billing-maintenance';
import { deliverLeadOutboxItem, drainLeadOutbox } from '../functions/lib/gpt-chat/lead-outbox';
import { resolveOwnerNotify } from '../functions/lib/gpt-chat/notify';
import type { BridgeEnv } from '../functions/lib/gpt-chat/bridge-env';
import { billingFixture } from './helpers/gpt-billing-fixture';

const CAMPAIGN_PATH = '/ru/blog/ii-zahvatit-mir-nachnem-s-zayavok/';
const TARGET_LANDING_PATH = '/uz/instagram-target-yoqish/';
const DELIVERY = { budgetMs: 4_000, timeoutMs: 4_000, maxRetries: 0 };

async function fixture() {
  const f = await billingFixture();
  const env: BridgeEnv = Object.assign(f.env, {
    GPT_BILLING_MODE: 'off',
    GPT_BILLING_MAINTENANCE_SECRET: randomBytes(32).toString('hex'),
    GPT_NOTIFY_CHAT_ID: '424242',
    GPT_CAMPAIGN_NOTIFY_BOT_TOKEN: randomBytes(32).toString('hex'),
    TELEGRAM_ASSISTANT_BOT_TOKEN: randomBytes(32).toString('hex'),
    TELEGRAM_ADMIN_CHAT_ID: '525252',
  });
  return { ...f, env };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Attribution = { source: string | null; pageUrl: string | null; utmJson: string | null };
const campaign: Attribution = {
  source: 'page_form', pageUrl: CAMPAIGN_PATH,
  utmJson: JSON.stringify({ attribution: { service: 'ai-bot' } }),
};

function pendingLead(f: Fixture, overrides: Partial<Attribution> = {}): string {
  const id = randomUUID();
  const at = new Date(Date.now() - 60_000).toISOString();
  const row = { ...campaign, ...overrides };
  f.db.prepare('INSERT INTO gpt_leads(id,contact_type,contact_value,intent,source,page_url,utm_json,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(id, 'telegram', '@offline_fixture', 'Offline routing fixture', row.source, row.pageUrl, row.utmJson, at).runSync();
  const outboxId = `outbox_${id}`;
  f.db.prepare('INSERT INTO gpt_lead_outbox(id,lead_id,available_at,created_at,updated_at) VALUES(?,?,?,?,?)')
    .bind(outboxId, id, at, at, at).runSync();
  return outboxId;
}

function network(t: TestContext, f: Fixture) {
  const calls: Array<{ sender: 'campaign' | 'original'; chatId: unknown }> = [];
  const logs: string[] = [];
  let fail = false;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.host === 'openrouter.ai') return Response.json({ data: { endpoints: [{ pricing: { prompt: '0', completion: '0' } }] } });
    assert.equal(url.host, 'api.telegram.org', 'unexpected offline-test host');
    assert.ok(url.pathname.endsWith('/sendMessage'), 'no webhook or other Bot API operation');
    const sender = url.pathname === `/bot${f.env.GPT_CAMPAIGN_NOTIFY_BOT_TOKEN?.trim()}/sendMessage`
      ? 'campaign' : 'original';
    assert.ok(sender === 'campaign' || url.pathname === `/bot${resolveOwnerNotify(f.env).token}/sendMessage`, 'unexpected sender');
    calls.push({ sender, chatId: JSON.parse(String(init?.body)).chat_id });
    return fail
      ? Response.json({ ok: false, error_code: 403 }, { status: 403 })
      : Response.json({ ok: true, result: { message_id: calls.length } });
  });
  t.mock.method(console, 'warn', (...args: unknown[]) => logs.push(args.join(' ')));
  t.mock.method(console, 'error', (...args: unknown[]) => logs.push(args.join(' ')));
  return { calls, logs, setFailed: (value: boolean) => { fail = value; } };
}

for (const route of [
  { pageUrl: CAMPAIGN_PATH, service: 'ai-bot', locale: 'ru' },
  { pageUrl: TARGET_LANDING_PATH, service: 'target', locale: 'uz' },
]) test(`campaign form ${route.pageUrl} uses its sender and explicit owner recipient exactly once`, async (t) => {
  const f = await fixture();
  f.env.GPT_CAMPAIGN_NOTIFY_BOT_TOKEN = ` ${f.env.GPT_CAMPAIGN_NOTIFY_BOT_TOKEN} `;
  f.env.GPT_NOTIFY_CHAT_ID = ' 424242 ';
  const before = resolveOwnerNotify(f.env);
  const net = network(t, f);
  const body = { consent: true, contactValue: '@offline_fixture', requestId: randomUUID(), source: 'page_form', ...route };
  const submit = () => leadPost(f.ctx(new Request('https://gptbot.uz/api/gpt/lead', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })) as never);
  const accepted = await submit();
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json() as { delivery: string }).delivery, 'pending');
  await Promise.all(f.background);
  assert.deepEqual(net.calls, [{ sender: 'campaign', chatId: 424242 }]);
  assert.equal(f.db.value('SELECT status FROM gpt_lead_outbox'), 'sent');
  assert.equal((await (await submit()).json() as { idempotent: boolean }).idempotent, true);
  await Promise.all(f.background);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_leads'), 1);
  assert.equal(net.calls.length, 1);
  assert.deepEqual(resolveOwnerNotify(f.env), before, 'global resolver/environment was not changed');
});

test('other sources, services and stored URL variants keep the original sender', async (t) => {
  const f = await fixture();
  const net = network(t, f);
  const targetAttribution = JSON.stringify({ attribution: { service: 'target' } });
  const variants: Partial<Attribution>[] = [
    { source: 'chat' }, { source: 'calculator' }, { source: null },
    { pageUrl: '/ru/ai-bot-dlya-biznesa/' }, { pageUrl: CAMPAIGN_PATH.slice(0, -1) },
    { pageUrl: `https://gptbot.uz${CAMPAIGN_PATH}` }, { pageUrl: `https://external.example${CAMPAIGN_PATH}` },
    { pageUrl: `//external.example${CAMPAIGN_PATH}` }, { pageUrl: `${CAMPAIGN_PATH}?x=1` },
    { pageUrl: `${CAMPAIGN_PATH}#lead` }, { pageUrl: null },
    { utmJson: JSON.stringify({ attribution: { service: 'crm' } }) },
    { utmJson: JSON.stringify({ service: 'ai-bot' }) }, { utmJson: '{invalid' }, { utmJson: null },
    { pageUrl: TARGET_LANDING_PATH },
    { pageUrl: TARGET_LANDING_PATH, source: 'chat', utmJson: targetAttribution },
    { pageUrl: '/ru/targetirovannaya-reklama-tashkent/', utmJson: targetAttribution },
  ];
  for (const row of variants) {
    const id = pendingLead(f, row);
    assert.equal(await deliverLeadOutboxItem(f.env, f.binding, id, 100, new Date(), DELIVERY), 'sent');
  }
  assert.equal(net.calls.length, variants.length);
  assert.ok(net.calls.every(({ sender, chatId }) => sender === 'original' && chatId === 424242));
});

test('missing or blank campaign pair blocks durably without using configured global fallbacks', async (t) => {
  const f = await fixture();
  f.env.GPT_NOTIFY_BOT_TOKEN = randomBytes(32).toString('hex');
  const campaignToken = f.env.GPT_CAMPAIGN_NOTIFY_BOT_TOKEN;
  const net = network(t, f);
  for (const missing of ['token_missing', 'token_blank', 'chat_missing', 'chat_blank']) {
    f.env.GPT_CAMPAIGN_NOTIFY_BOT_TOKEN = missing === 'token_missing' ? undefined : missing === 'token_blank' ? '  ' : campaignToken;
    f.env.GPT_NOTIFY_CHAT_ID = missing === 'chat_missing' ? undefined : missing === 'chat_blank' ? '  ' : '424242';
    const id = pendingLead(f);
    assert.equal(await deliverLeadOutboxItem(f.env, f.binding, id, 100, new Date(), DELIVERY), 'blocked');
    assert.equal(f.db.value('SELECT status FROM gpt_lead_outbox WHERE id=?', id), 'blocked');
    assert.equal(f.db.value('SELECT last_error_code FROM gpt_lead_outbox WHERE id=?', id), 'unconfigured');
  }
  assert.equal(net.calls.length, 0);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_leads'), 4, 'all enquiries remain saved');
  f.env.GPT_CAMPAIGN_NOTIFY_BOT_TOKEN = campaignToken;
  f.env.GPT_NOTIFY_CHAT_ID = '424242';
  const afterBackoff = new Date(Date.now() + 61 * 60_000);
  assert.deepEqual(await drainLeadOutbox(f.env, f.binding, 100, 10, afterBackoff, DELIVERY), { attempted: 4, sent: 4, pending: 0, blocked: 0 });
  assert.ok(net.calls.every(({ sender, chatId }) => sender === 'campaign' && chatId === 424242));
});

test('campaign delivery failure stays queued and retry uses the same route without logging credentials or contact', async (t) => {
  const f = await fixture();
  const net = network(t, f);
  const id = pendingLead(f);
  net.setFailed(true);
  assert.equal(await deliverLeadOutboxItem(f.env, f.binding, id, 100, new Date(), DELIVERY), 'pending');
  assert.equal(f.db.value('SELECT status FROM gpt_lead_outbox WHERE id=?', id), 'failed');
  assert.equal(f.db.value('SELECT attempt_count FROM gpt_lead_outbox WHERE id=?', id), 1);
  assert.deepEqual(await drainLeadOutbox(f.env, f.binding, 100, 10, new Date(), DELIVERY), { attempted: 0, sent: 0, pending: 0, blocked: 0 });
  net.setFailed(false);
  assert.deepEqual(await drainLeadOutbox(f.env, f.binding, 100, 10, new Date(Date.now() + 61_000), DELIVERY), { attempted: 1, sent: 1, pending: 0, blocked: 0 });
  assert.deepEqual(net.calls, [{ sender: 'campaign', chatId: 424242 }, { sender: 'campaign', chatId: 424242 }]);
  const logs = net.logs.join('\n');
  for (const privateValue of [f.env.GPT_CAMPAIGN_NOTIFY_BOT_TOKEN!, f.env.TELEGRAM_ASSISTANT_BOT_TOKEN!, '@offline_fixture', 'Offline routing fixture']) {
    assert.ok(!logs.includes(privateValue));
  }
});

test('existing maintenance endpoint uses the Pages campaign binding and never resends a sent row', async (t) => {
  const f = await fixture();
  const net = network(t, f);
  const id = pendingLead(f);
  const tick = () => maintenance(f.ctx(new Request('https://gptbot.uz/api/internal/gpt-billing-maintenance', {
    method: 'POST', headers: { Authorization: `Bearer ${f.env.GPT_BILLING_MAINTENANCE_SECRET}` },
  })) as never);
  const response = await tick();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { leadDelivery: unknown }).leadDelivery, { attempted: 1, sent: 1, pending: 0, blocked: 0 });
  await Promise.all(f.background);
  assert.equal(f.db.value('SELECT status FROM gpt_lead_outbox WHERE id=?', id), 'sent');
  assert.deepEqual((await (await tick()).json() as { leadDelivery: unknown }).leadDelivery, { attempted: 0, sent: 0, pending: 0, blocked: 0 });
  await Promise.all(f.background);
  assert.deepEqual(net.calls, [{ sender: 'campaign', chatId: 424242 }]);
});
