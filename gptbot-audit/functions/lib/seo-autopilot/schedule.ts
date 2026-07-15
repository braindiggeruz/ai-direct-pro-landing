// Schedule configuration for the SEO Autopilot Control Center.
//
// The schedule is persisted in `system_settings` under the key
// `seo_autopilot_schedule`. The GitHub Actions cron worker calls
// /api/internal/seo-autopilot/scheduled-run twice a week (Mon + Thu);
// `shouldRunOnDate()` decides whether to actually fire on a given day
// based on the saved mode.

import type { Env } from '../../_types';
import { getSetting, putSetting } from '../system/settings';

export type ScheduleMode = 'disabled' | 'weekly' | 'twice_weekly';

export interface SeoAutopilotSchedule {
  mode: ScheduleMode;
  // ISO weekday numbers (1=Mon … 7=Sun) when a run is allowed.
  //   weekly       → [1]            (Monday only)
  //   twice_weekly → [1, 4]         (Monday + Thursday)
  //   disabled     → []
  // We store them explicitly so future modes can use any combination
  // without code changes.
  active_days: number[];
  updated_at?: string;
  updated_by?: string;
}

export const SCHEDULE_SETTING_KEY = 'seo_autopilot_schedule';

const DEFAULTS_BY_MODE: Record<ScheduleMode, number[]> = {
  disabled: [],
  weekly: [1],
  twice_weekly: [1, 4],
};

export function defaultSchedule(): SeoAutopilotSchedule {
  return { mode: 'disabled', active_days: [] };
}

export async function getSchedule(env: Env): Promise<SeoAutopilotSchedule> {
  const v = await getSetting<SeoAutopilotSchedule>(env, SCHEDULE_SETTING_KEY);
  return v ?? defaultSchedule();
}

export async function setSchedule(
  env: Env,
  mode: ScheduleMode,
  updatedBy: string,
): Promise<SeoAutopilotSchedule> {
  const schedule: SeoAutopilotSchedule = {
    mode,
    active_days: DEFAULTS_BY_MODE[mode] ?? [],
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };
  await putSetting(env, SCHEDULE_SETTING_KEY, schedule, updatedBy);
  return schedule;
}

/** ISO weekday (1=Mon … 7=Sun) in UTC. */
export function isoWeekday(date: Date): number {
  // JS getUTCDay: 0=Sun..6=Sat → convert to 1..7 (Mon..Sun).
  const d = date.getUTCDay();
  return d === 0 ? 7 : d;
}

/**
 * Returns true if the schedule allows a run on the given day.
 * Used by the cron worker to skip days we don't want a run on, without
 * needing a new GitHub Actions cron expression for every mode change.
 */
export function shouldRunOnDate(schedule: SeoAutopilotSchedule, date: Date): boolean {
  if (schedule.mode === 'disabled') return false;
  return schedule.active_days.includes(isoWeekday(date));
}
