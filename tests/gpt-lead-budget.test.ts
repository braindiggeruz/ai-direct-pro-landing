// The budget a lead form asks for (paid-chat plan WP-20, release R6):
// normalizeLeadBudget keeps one value of a closed list, migrations/0070 adds
// gpt_leads.budget, the runtime bootstrap adds the same column, and the
// owner's alert names the budget in Russian. Real SQLite
// (tests/helpers/sqlite-d1.ts); nothing here touches a remote database.
//
// Run: node --import tsx --test tests/gpt-lead-budget.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SqliteD1 } from './helpers/sqlite-d1';
import { ensureSchema, LEAD_COLUMNS } from '../functions/lib/gpt-chat/schema';
import { normalizeLeadBudget, validateLead } from '../functions/lib/gpt-chat/validate';
import { buildLeadAlert, type LeadAlert } from '../functions/lib/gpt-chat/notify';
import { onRequestPost as leadPost } from '../functions/api/gpt/lead';
import { LEAD_BUDGETS, LEAD_BUDGET_FIELD, LEAD_BUDGET_LABELS } from '../src/shared/lead-budget';

const migration = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const M0070 = migration('0070_gpt_leads_budget.sql');
/** What production has applied to gpt_leads before 0070. */
const BEFORE_0070 = ['0008_gpt_chat.sql', '0061_gpt_chat_lead_delivery.sql'];
const SQL_COMMENT = /^\s*--.*$/gm;

/** `wrangler d1 migrations apply` in miniature: a ledger row per file, a recorded file is skipped. */
function apply(db: SqliteD1, name: string, sql: string): 'applied' | 'skipped' {
  db.exec('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)');
  if (db.value('SELECT COUNT(*) FROM d1_migrations WHERE name=?', name)) return 'skipped';
  db.exec('BEGIN');
  try {
    db.exec(sql);
    db.sqlite.prepare("INSERT INTO d1_migrations(name, applied_at) VALUES (?, datetime('now'))").run(name);
    db.exec('COMMIT');
    return 'applied';
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const columns = (db: SqliteD1) =>
  db.rows<{ name: string; type: string }>("PRAGMA table_info('gpt_leads')").map((row) => `${row.name} ${row.type}`);

test('the closed list: five values, labelled in both languages; anything else is null', () => {
  assert.deepEqual([...LEAD_BUDGETS], ['lt1m', '1-2m', '2-5m', 'gt5m', 'unknown']);
  for (const locale of ['ru', 'uz'] as const) {
    assert.deepEqual(Object.keys(LEAD_BUDGET_LABELS[locale]), [...LEAD_BUDGETS], locale);
    for (const label of [...Object.values(LEAD_BUDGET_LABELS[locale]), ...Object.values(LEAD_BUDGET_FIELD[locale])]) {
      assert.ok(label.trim() && !/\u00a0/.test(label), `${locale}: ${label}`);
    }
    // One select, one style: every option starts as its empty first option
    // does, with a capital, or with a digit.
    for (const option of [LEAD_BUDGET_FIELD[locale].empty, ...Object.values(LEAD_BUDGET_LABELS[locale])]) {
      assert.match(option, /^[0-9A-Z\u0410-\u042f\u0401]/, `${locale}: ${option}`);
    }
  }
  for (const value of LEAD_BUDGETS) assert.equal(normalizeLeadBudget(value), value);
  for (const bad of [undefined, null, '', 'LT1M', ' lt1m', '1–2m', '5000000', 2, ['lt1m'], { value: 'lt1m' }, 'toString']) {
    assert.equal(normalizeLeadBudget(bad), null, JSON.stringify(bad));
  }
  const ok = validateLead({ consent: true, phone: '901234567', budget: '2-5m' });
  assert.equal(ok.value?.budget, '2-5m');
  // A bad budget never costs the lead: the contact is what matters.
  const kept = validateLead({ consent: true, phone: '901234567', budget: 'a lot' });
  assert.equal(kept.ok, true);
  assert.equal(kept.value?.budget, null);
  assert.equal(validateLead({ consent: true, phone: '901234567' }).value?.budget, null);
});

test('0070 adds only the column, through the ledger once, and matches the runtime bootstrap', async () => {
  assert.doesNotMatch(M0070.replace(SQL_COMMENT, ''), /\b(DROP|DELETE|UPDATE|INSERT|CREATE)\b/i);
  assert.deepEqual(
    M0070.replace(SQL_COMMENT, '').split(';').map((part) => part.trim()).filter(Boolean),
    ['ALTER TABLE gpt_leads ADD COLUMN budget TEXT'],
  );
  assert.deepEqual(LEAD_COLUMNS.at(-1), ['budget', 'TEXT']);

  // The production shape with a lead in it, then 0070 twice through the ledger.
  const migrated = new SqliteD1();
  for (const file of BEFORE_0070) migrated.exec(migration(file));
  migrated.exec("INSERT INTO gpt_leads (id, contact_type, contact_value, source, created_at) VALUES ('lead_old','phone','+998901234567','gpt_chat','2026-10-01T10:00:00.000Z')");
  const before = columns(migrated);
  assert.equal(apply(migrated, '0070_gpt_leads_budget.sql', M0070), 'applied');
  assert.equal(apply(migrated, '0070_gpt_leads_budget.sql', M0070), 'skipped');
  assert.deepEqual(columns(migrated), [...before, 'budget TEXT'], 'one column, last');
  assert.deepEqual(
    migrated.rows<{ id: string; budget: string | null }>('SELECT id, budget FROM gpt_leads').map((row) => ({ ...row })),
    [{ id: 'lead_old', budget: null }],
  );
  // The bootstrap after the migration changes nothing.
  await ensureSchema(migrated.asD1());
  assert.deepEqual(columns(migrated), [...before, 'budget TEXT']);

  // The bootstrap alone (a fresh database) ends in the same column, last.
  const fresh = new SqliteD1();
  await ensureSchema(fresh.asD1());
  assert.equal(columns(fresh).at(-1), 'budget TEXT');
  assert.deepEqual([...columns(fresh)].sort(), [...columns(migrated)].sort());

  // Code before the migration: the bootstrap adds the column, and then the
  // ALTER cannot run again; the header says to record the file by hand.
  const codeFirst = new SqliteD1();
  for (const file of BEFORE_0070) codeFirst.exec(migration(file));
  await ensureSchema(codeFirst.asD1());
  assert.equal(columns(codeFirst).at(-1), 'budget TEXT');
  assert.throws(() => apply(codeFirst, '0070_gpt_leads_budget.sql', M0070), /duplicate column name/);
  assert.match(M0070, /apply this migration BEFORE deploying the code/);
  assert.match(M0070, /record the file in d1_migrations by hand/);
});

const ALERT: LeadAlert = {
  leadId: 'lead_budget',
  name: null,
  contactType: 'phone',
  contactValue: '+998901234567',
  intent: 'Чат-бот',
  locale: 'uz',
  pageUrl: '/ru/luchshie-razrabotchiki-chat-botov-tashkent/',
  sessionId: null,
  utmJson: null,
  createdAt: '2026-10-03T10:00:00.000Z',
  shareConversation: false,
  source: 'page_form',
  service: 'chat-bot',
};

test('the owner reads the budget in Russian, after the request; no budget, no line', () => {
  for (const value of LEAD_BUDGETS) {
    const { text } = buildLeadAlert({ ...ALERT, budget: value });
    assert.ok(text.includes(`<b>Бюджет:</b> ${LEAD_BUDGET_LABELS.ru[value]}\n`), `${value}: ${text}`);
    assert.ok(text.indexOf('<b>Запрос:') < text.indexOf('<b>Бюджет:'), value);
  }
  assert.doesNotMatch(buildLeadAlert(ALERT).text, /Бюджет/);
  assert.doesNotMatch(buildLeadAlert({ ...ALERT, budget: null }).text, /Бюджет/);
  // A value outside the list (never stored, but the alert is pure) is escaped, not trusted.
  assert.ok(buildLeadAlert({ ...ALERT, budget: '<b>x</b>' }).text.includes('<b>Бюджет:</b> &lt;b&gt;x&lt;/b&gt;'));
});

function stubTelegram(): { texts: string[]; restore(): void } {
  const previous = globalThis.fetch;
  const texts: string[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    assert.ok(String(url).startsWith('https://api.telegram.org/'), `unexpected fetch to ${String(url)}`);
    texts.push(String((JSON.parse(String(init?.body || '{}')) as { text?: string }).text ?? ''));
    return new Response(JSON.stringify({ ok: true, result: { message_id: texts.length } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { texts, restore: () => { globalThis.fetch = previous; } };
}

async function post(db: SqliteD1, body: Record<string, unknown>, ip: string) {
  const pending: Promise<unknown>[] = [];
  const res = await leadPost({
    request: new Request('https://gptbot.uz/api/gpt/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify(body),
    }),
    env: { GPT_NOTIFY_BOT_TOKEN: 'test-bot-token-never-logged', GPT_NOTIFY_CHAT_ID: '4242', GPT_HASH_SALT: 'salt', GPTBOT_DRAFTS_DB: db.asD1() },
    waitUntil: (p: Promise<unknown>) => { pending.push(p); },
  } as never);
  await Promise.all(pending);
  return res;
}

test('through the endpoint: the budget is stored from the closed list and reaches the owner', async () => {
  const db = new SqliteD1();
  // The production shape after 0070, then the code: what R6 runs on.
  for (const file of [...BEFORE_0070, '0070_gpt_leads_budget.sql']) db.exec(migration(file));
  const stub = stubTelegram();
  try {
    const base = { consent: true, source: 'page_form', service: 'chat-bot', pageUrl: '/ru/luchshie-razrabotchiki-chat-botov-tashkent/', locale: 'ru' };
    assert.equal((await post(db, { ...base, contactValue: '901234561', budget: '2-5m', requestId: 'pf_budget_0123456789abcdef' }, '203.0.113.21')).status, 200);
    assert.equal((await post(db, { ...base, contactValue: '901234562', budget: 'a lot', requestId: 'pf_forged_0123456789abcdef' }, '203.0.113.22')).status, 200);
    assert.equal((await post(db, { ...base, contactValue: '901234563', requestId: 'pf_none_00123456789abcdef' }, '203.0.113.23')).status, 200);
    assert.deepEqual(
      db.rows<{ request_id: string; source: string; budget: string | null }>('SELECT request_id, source, budget FROM gpt_leads ORDER BY request_id').map((row) => ({ ...row })),
      [
        { request_id: 'pf_budget_0123456789abcdef', source: 'page_form', budget: '2-5m' },
        { request_id: 'pf_forged_0123456789abcdef', source: 'page_form', budget: null },
        { request_id: 'pf_none_00123456789abcdef', source: 'page_form', budget: null },
      ],
    );
    assert.equal(stub.texts.length, 3);
    assert.ok(stub.texts[0].includes('<b>Бюджет:</b> 2–5 млн сум\n'), stub.texts[0]);
    assert.ok(stub.texts[0].includes('форма на странице · услуга chat-bot · /ru/luchshie-razrabotchiki-chat-botov-tashkent/'), stub.texts[0]);
    for (const text of stub.texts.slice(1)) assert.doesNotMatch(text, /Бюджет/);
  } finally {
    stub.restore();
  }
});
