// D1 helpers for the `system_settings` key-value store.
//
// Used today for:
//   * `seo_autopilot_schedule` — JSON blob persisting the schedule mode
//     and runtime configuration (see ./schedule.ts).
//
// Each settings row is small (< 4 KB) and read on hot paths, so we don't
// add caching — D1 read of a single row by PK is sub-millisecond.

import type { Env } from '../../_types';

export interface SystemSettingRow {
  key: string;
  value: unknown;
  updated_at: string;
  updated_by: string | null;
}

export async function getSetting<T>(env: Env, key: string): Promise<T | null> {
  if (!env.GPTBOT_DRAFTS_DB) return null;
  const row = await env.GPTBOT_DRAFTS_DB
    .prepare('SELECT value_json FROM system_settings WHERE key = ?')
    .bind(key)
    .first<{ value_json: string }>();
  if (!row) return null;
  try { return JSON.parse(row.value_json) as T; } catch { return null; }
}

export async function putSetting(
  env: Env,
  key: string,
  value: unknown,
  updatedBy: string,
): Promise<void> {
  if (!env.GPTBOT_DRAFTS_DB) throw new Error('GPTBOT_DRAFTS_DB binding missing');
  const now = new Date().toISOString();
  await env.GPTBOT_DRAFTS_DB
    .prepare(
      `INSERT INTO system_settings (key, value_json, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .bind(key, JSON.stringify(value), now, updatedBy)
    .run();
}
