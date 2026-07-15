// Unit tests for Control Center business logic:
//   - schedule mode → active days mapping
//   - shouldRunOnDate per ISO weekday + mode
//   - buildLaunchPayload protected fields
//
// Runs via `tsx scripts/test-control-center.ts`.

import { defaultSchedule, shouldRunOnDate, isoWeekday } from '../functions/lib/seo-autopilot/schedule';
import { buildLaunchPayload } from '../functions/lib/seo-autopilot/payload';

interface T { name: string; passed: boolean; detail?: string }
const r: T[] = [];
const pass = (name: string, cond: boolean, detail?: string) => r.push({ name, passed: cond, detail });

// --- schedule -----------------------------------------------------------

// ISO weekdays: 1=Mon, 2=Tue, ..., 7=Sun.
const monday    = new Date(Date.UTC(2026, 0, 5));   // 2026-01-05 is Monday
const tuesday   = new Date(Date.UTC(2026, 0, 6));
const thursday  = new Date(Date.UTC(2026, 0, 8));
const sunday    = new Date(Date.UTC(2026, 0, 11));

pass('ISO weekday Mon=1', isoWeekday(monday) === 1);
pass('ISO weekday Tue=2', isoWeekday(tuesday) === 2);
pass('ISO weekday Thu=4', isoWeekday(thursday) === 4);
pass('ISO weekday Sun=7', isoWeekday(sunday) === 7);

const disabled = defaultSchedule();
pass('default schedule is disabled', disabled.mode === 'disabled' && disabled.active_days.length === 0);
pass('disabled never runs (Mon)', shouldRunOnDate(disabled, monday) === false);
pass('disabled never runs (Thu)', shouldRunOnDate(disabled, thursday) === false);

const weekly = { mode: 'weekly' as const, active_days: [1] };
pass('weekly runs on Mon', shouldRunOnDate(weekly, monday) === true);
pass('weekly skips Tue', shouldRunOnDate(weekly, tuesday) === false);
pass('weekly skips Thu', shouldRunOnDate(weekly, thursday) === false);

const twice = { mode: 'twice_weekly' as const, active_days: [1, 4] };
pass('twice_weekly runs on Mon', shouldRunOnDate(twice, monday) === true);
pass('twice_weekly runs on Thu', shouldRunOnDate(twice, thursday) === true);
pass('twice_weekly skips Tue', shouldRunOnDate(twice, tuesday) === false);
pass('twice_weekly skips Sun', shouldRunOnDate(twice, sunday) === false);

// --- payload builder -----------------------------------------------------

const adminPayload = buildLaunchPayload({ source: 'admin', requestedBy: 'admin@gptbot.uz', runId: 'r1' });
pass('admin payload source=gptbot-admin', adminPayload.source === 'gptbot-admin');
pass('admin payload triggered_by=admin email', adminPayload.triggered_by === 'admin@gptbot.uz');
pass('admin payload includes triggered_at ISO', typeof adminPayload.triggered_at === 'string' && adminPayload.triggered_at.endsWith('Z'));
pass('admin payload default locales = ru+uz', Array.isArray(adminPayload.target_locales) && adminPayload.target_locales!.includes('ru') && adminPayload.target_locales!.includes('uz'));

const schedPayload = buildLaunchPayload({ source: 'schedule', requestedBy: 'system:schedule', runId: 'r2' });
pass('schedule payload source=gptbot-schedule', schedPayload.source === 'gptbot-schedule');

// Overrides win except for protected fields.
const override = buildLaunchPayload({
  source: 'admin',
  requestedBy: 'admin@gptbot.uz',
  runId: 'real-run',
  overrides: { source: 'evil', triggered_by: 'attacker', topic_hint: 'restaurants', extra: 1 },
});
pass('overrides cannot rewrite source', override.source === 'gptbot-admin');
pass('overrides cannot rewrite triggered_by', override.triggered_by === 'admin@gptbot.uz');
pass('overrides cannot rewrite run_id', override.run_id === 'real-run');
pass('overrides DO add topic_hint', override.topic_hint === 'restaurants');
pass('overrides DO add extra field', (override as { extra: unknown }).extra === 1);

// --- report --------------------------------------------------------------
let f = 0;
for (const x of r) {
  console.log(`${x.passed ? 'PASS' : 'FAIL'}  ${x.name}${x.detail && !x.passed ? `  — ${x.detail}` : ''}`);
  if (!x.passed) f++;
}
console.log(`\nTotal: ${r.length}, passed: ${r.length - f}, failed: ${f}`);
if (f > 0) process.exit(1);
