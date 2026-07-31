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
  `CREATE TABLE IF NOT EXISTS telegram_agent_update_metrics (
    idempotency_key TEXT PRIMARY KEY,
    bot_username TEXT NOT NULL
      CHECK (length(bot_username) >= 5 AND length(bot_username) <= 32),
    duplicate_count INTEGER NOT NULL DEFAULT 0
      CHECK (duplicate_count >= 0 AND duplicate_count <= 1000000),
    processing_ms INTEGER
      CHECK (processing_ms IS NULL OR (
        processing_ms >= 0 AND processing_ms <= 86400000
      )),
    updated_at TEXT NOT NULL,
    FOREIGN KEY (idempotency_key)
      REFERENCES telegram_agent_updates(idempotency_key) ON DELETE RESTRICT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_telegram_agent_update_metrics_updated
    ON telegram_agent_update_metrics (updated_at, bot_username)`,
  `CREATE TABLE IF NOT EXISTS telegram_agent_rate_limits (
    scope_key TEXT NOT NULL CHECK (length(scope_key) = 64),
    window_started_at TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0
      CHECK (request_count >= 0 AND request_count <= 1000000),
    callback_count INTEGER NOT NULL DEFAULT 0
      CHECK (callback_count >= 0 AND callback_count <= 1000000),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (scope_key, window_started_at)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_telegram_agent_rate_limits_updated
    ON telegram_agent_rate_limits (updated_at)`,
  `CREATE TABLE IF NOT EXISTS telegram_agent_rate_limit_notices (
    scope_key TEXT NOT NULL CHECK (length(scope_key) = 64),
    window_started_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (scope_key, window_started_at),
    FOREIGN KEY (scope_key, window_started_at)
      REFERENCES telegram_agent_rate_limits(scope_key, window_started_at)
        ON DELETE RESTRICT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_telegram_agent_rate_limit_notices_created
    ON telegram_agent_rate_limit_notices (created_at)`,
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
