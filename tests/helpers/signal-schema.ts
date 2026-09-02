/**
 * The complete Signal Radar migration set, in the order production applied it.
 *
 * 0057 builds the module; 0058 repairs its retention cascade so a seven-day
 * post sweep deletes the stranger's text instead of the operator's lead. A
 * fixture that stops at 0057 is testing a schema production no longer has,
 * which is how the bug survived the first test pass.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { SqliteD1 } from './sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

export const SIGNAL_MIGRATIONS = [
  '0057_lead_radar_signal.sql',
  '0058_lead_radar_signal_lead_retention.sql',
] as const;

export const SIGNAL_MIGRATION_SQL = Object.fromEntries(
  SIGNAL_MIGRATIONS.map((name) => [
    name,
    readFileSync(path.join(ROOT, 'migrations', name), 'utf8'),
  ]),
) as Record<(typeof SIGNAL_MIGRATIONS)[number], string>;

/** Applies every Signal Radar migration and records each in the ledger. */
export function applySignalMigrations(db: SqliteD1): void {
  for (const name of SIGNAL_MIGRATIONS) {
    db.exec(SIGNAL_MIGRATION_SQL[name]);
    db.exec(`INSERT INTO d1_migrations(name) VALUES ('${name}')`);
  }
}
