import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import assert from 'node:assert/strict';

function migration(name: string): string {
  return readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
}

test('0061 upgrades the existing GPT Chat schema with durable idempotent lead delivery', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(migration('0008_gpt_chat.sql'));
  db.exec(migration('0061_gpt_chat_lead_delivery.sql'));

  const columns = db.prepare("PRAGMA table_info('gpt_leads')").all() as Array<{ name: string }>;
  assert.ok(columns.some((column) => column.name === 'request_id'));
  assert.deepEqual(
    db.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'index' AND name IN ('idx_gpt_leads_request','idx_gpt_lead_outbox_pending')
       ORDER BY name`,
    ).all().map((row) => ({ ...row })),
    [{ name: 'idx_gpt_lead_outbox_pending' }, { name: 'idx_gpt_leads_request' }],
  );

  const outbox = db.prepare("PRAGMA table_info('gpt_lead_outbox')").all() as Array<{ name: string }>;
  assert.deepEqual(
    outbox.map((column) => column.name),
    [
      'id', 'lead_id', 'locale', 'share_conversation', 'status', 'attempt_count',
      'available_at', 'delivered_at', 'last_error_code', 'created_at', 'updated_at',
    ],
  );
});
