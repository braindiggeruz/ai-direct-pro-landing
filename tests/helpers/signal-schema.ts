/**
 * The complete Signal Radar migration set, in the order production applied it.
 *
 * 0057 builds the module; 0058 repairs its retention cascade so a seven-day
 * post sweep deletes the stranger's text instead of the operator's lead. A
 * fixture that stops at 0057 is testing a schema production no longer has,
 * which is how the bug survived the first test pass.
 *
 * 0059 adds the chats table. It is a separate table on purpose: the 0057
 * funnel scores posts, and a group has no public posts, so a room pushed
 * through it would score zero and be retired within two ticks. Rooms answer a
 * different question — can I write here — and get their own lifecycle.
 *
 * 0060 adds `confidence` to it: whether a room named its trade or merely used
 * one of its words. Twenty of the thirty-seven rooms the first harvest kept
 * were bakeries and taxi dispatch, held up by "заказ" and "buyurtma".
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { SqliteD1 } from './sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

export const SIGNAL_MIGRATIONS = [
  '0057_lead_radar_signal.sql',
  '0058_lead_radar_signal_lead_retention.sql',
  '0059_lead_radar_signal_chats.sql',
  '0060_lead_radar_signal_chat_confidence.sql',
] as const;

export const SIGNAL_MIGRATION_SQL = Object.fromEntries(
  SIGNAL_MIGRATIONS.map((name) => [
    name,
    readFileSync(path.join(ROOT, 'migrations', name), 'utf8'),
  ]),
) as Record<(typeof SIGNAL_MIGRATIONS)[number], string>;

/**
 * Applies every Signal Radar migration and records each in the ledger.
 *
 * Creates the ledger if it is not there yet. Every caller needs it — D1 has
 * one in production, a fresh `SqliteD1` does not — and half of them were
 * creating it by hand before calling this, which meant the other half crashed
 * with "no such table: d1_migrations" for no reason a caller could guess.
 */
export function applySignalMigrations(db: SqliteD1): void {
  db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  for (const name of SIGNAL_MIGRATIONS) {
    db.exec(SIGNAL_MIGRATION_SQL[name]);
    db.exec(`INSERT INTO d1_migrations(name) VALUES ('${name}')`);
  }
}
