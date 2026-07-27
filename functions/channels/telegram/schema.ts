const DDL = [
  `CREATE TABLE IF NOT EXISTS telegram_agent_updates (
    idempotency_key TEXT PRIMARY KEY,
    bot_username TEXT NOT NULL,
    update_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('reserved', 'completed', 'failed')),
    error_code TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    UNIQUE (bot_username, update_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_telegram_agent_updates_status
    ON telegram_agent_updates (status, created_at)`,
] as const;

const bootstrapped = new WeakMap<D1Database, Promise<void>>();

export function ensureTelegramAgentUpdateSchema(
  db: D1Database,
): Promise<void> {
  let pending = bootstrapped.get(db);
  if (!pending) {
    pending = (async () => {
      for (const statement of DDL) await db.prepare(statement).run();
    })().catch((error) => {
      bootstrapped.delete(db);
      throw error;
    });
    bootstrapped.set(db, pending);
  }
  return pending;
}
