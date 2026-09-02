/**
 * Signal Radar — one source of truth for the automation mode.
 *
 * The mode is the master switch for the most dangerous feature in the product,
 * so it is the one knob an operator may turn without a deploy. That makes the
 * *precedence* the safety-critical part: the admin UI and the cron worker must
 * never disagree about what the current mode is, or the operator flips a switch,
 * sees one thing, and the worker does another.
 *
 * Priority, highest first:
 *   1. `system_settings['signal_radar_mode']` — set from the UI
 *   2. `env.LEAD_RADAR_SIGNAL_AUTOJOIN_MODE` — set at deploy time
 *   3. `SIGNAL_JOIN_POLICY.mode`              — built-in default (`discover`)
 *
 * The database read is deliberately fail-open: a missing `system_settings`
 * table (pre-migration 0003), a locked database or a malformed row all fall
 * through to the next level. A mode switch must never take the radar down —
 * it degrades to whatever the deploy config says.
 *
 * This module is separate from `signal-scout.ts` on purpose. The scout is the
 * network half and lives only in the automation Worker; Pages functions must
 * not pull it in. Both halves import this file instead.
 */

import { SIGNAL_JOIN_POLICY } from './signal-join-queue';
import {
  parseSignalAutojoinMode,
  parseSignalScanCursor,
  signalScanCursorKey,
  signalScanStatus,
  SIGNAL_MODE_SETTING_KEY,
  type SignalAutojoinMode,
  type SignalModeState,
  type SignalScanCursor,
  type SignalScanStatus,
} from '../../../src/shared/signal-radar';

export interface SignalModeEnv {
  LEAD_RADAR_SIGNAL_AUTOJOIN_MODE?: string;
}

interface ModeRow {
  value_json: string;
  updated_at: string | null;
  updated_by: string | null;
}

/**
 * Accepts both shapes an operator or an older writer could have left behind:
 * a bare string (`"join"`) and an object (`{"mode":"join"}`). Anything else is
 * treated as absent rather than coerced — a half-valid row must not silently
 * become `discover` when someone meant `off`.
 */
function parseStoredMode(row: ModeRow): SignalAutojoinMode | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value_json);
  } catch {
    return null;
  }
  const raw = typeof parsed === 'string'
    ? parsed
    : parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as { mode?: unknown }).mode
      : null;
  return parseSignalAutojoinMode(raw);
}

async function readModeRow(db: D1Database): Promise<ModeRow | null> {
  return await db
    .prepare(`SELECT value_json, updated_at, updated_by
                FROM system_settings
               WHERE key = ?`)
    .bind(SIGNAL_MODE_SETTING_KEY)
    .first<ModeRow>();
}

/**
 * The single answer to "what mode are we in right now". Call this from every
 * place that reads the mode; never parse the env var inline again.
 */
export async function resolveSignalMode(
  db: D1Database | undefined,
  env: SignalModeEnv,
): Promise<SignalModeState> {
  if (db) {
    try {
      const row = await readModeRow(db);
      const mode = row ? parseStoredMode(row) : null;
      if (row && mode) {
        return {
          mode,
          source: 'setting',
          updatedAt: row.updated_at ?? null,
        };
      }
    } catch {
      // `system_settings` absent, or the database is unhappy. Fall through to
      // the deploy-time default rather than refusing to run.
    }
  }
  const fromEnv = parseSignalAutojoinMode(env.LEAD_RADAR_SIGNAL_AUTOJOIN_MODE);
  if (fromEnv) return { mode: fromEnv, source: 'env', updatedAt: null };
  return { mode: SIGNAL_JOIN_POLICY.mode, source: 'default', updatedAt: null };
}

/** Persists an operator's choice. Returns the state as the UI should show it. */
export async function writeSignalMode(
  db: D1Database,
  mode: SignalAutojoinMode,
  updatedBy: string,
): Promise<SignalModeState> {
  const now = new Date().toISOString();
  await db
    .prepare(`INSERT INTO system_settings (key, value_json, updated_at, updated_by)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by`)
    .bind(SIGNAL_MODE_SETTING_KEY, JSON.stringify({ mode }), now, updatedBy)
    .run();
  return { mode, source: 'setting', updatedAt: now };
}

/**
 * Drops the stored mode so the deploy-time env value takes over again. Used by
 * "вернуть как в конфиге" — without it, a database value set once would shadow
 * the env variable forever with no way back from the UI.
 */
export async function clearSignalMode(db: D1Database): Promise<void> {
  await db
    .prepare('DELETE FROM system_settings WHERE key = ?')
    .bind(SIGNAL_MODE_SETTING_KEY)
    .run();
}

export async function readSignalScanCursor(
  db: D1Database | undefined,
  orgId: string,
): Promise<SignalScanCursor | null> {
  if (!db) return null;
  try {
    const row = await db
      .prepare('SELECT value_json FROM system_settings WHERE key = ?')
      .bind(signalScanCursorKey(orgId))
      .first<{ value_json: string }>();
    if (!row) return null;
    return parseSignalScanCursor(JSON.parse(row.value_json));
  } catch {
    return null;
  }
}

export async function writeSignalScanCursor(
  db: D1Database,
  orgId: string,
  cursor: SignalScanCursor,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(`INSERT INTO system_settings (key, value_json, updated_at, updated_by)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by`)
    .bind(signalScanCursorKey(orgId), JSON.stringify(cursor), now, cursor.by)
    .run();
}

/** Cooldown window for `orgId`, as of `now`. */
export async function signalScanStatusFor(
  db: D1Database | undefined,
  orgId: string,
  now: number,
): Promise<SignalScanStatus> {
  return signalScanStatus(await readSignalScanCursor(db, orgId), now);
}
