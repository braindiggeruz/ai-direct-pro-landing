// Local birth time to UTC by a zone table that ships with the page
// (public/natal/tz/*.json, built by scripts/natal/build-zones.ts from the tz
// database), never by the phone's own settings: the same input gives the same
// chart on every device (roadmap T7). A local time that never existed (clocks
// moved forward) or existed twice (moved back) is not guessed: the caller
// asks the person (T4).

export interface ZoneTable {
  zone: string;
  /** The tz database release the table was built from (shown in «Как посчитано»). */
  tz: string;
  /** Offset in seconds east of UTC before the first transition. */
  base: number;
  /** Transition instants, UTC seconds, ascending. */
  t: number[];
  /** Offset in seconds from each transition on. */
  o: number[];
  /** 1 where the offset from that transition on is summer time. */
  d: number[];
}

export function offsetAt(table: ZoneTable, utcSeconds: number): number {
  let lo = 0;
  let hi = table.t.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (table.t[mid] <= utcSeconds) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found < 0 ? table.base : table.o[found];
}

export function isSummerAt(table: ZoneTable, utcSeconds: number): boolean {
  let found = -1;
  for (let i = 0; i < table.t.length && table.t[i] <= utcSeconds; i++) found = i;
  return found >= 0 && table.d[found] === 1;
}

export interface LocalTime { year: number; month: number; day: number; hour: number; minute: number }

export type Resolution =
  | { status: 'ok'; utc: Date; offset: number; summer: boolean }
  | { status: 'ambiguous'; options: Array<{ utc: Date; offset: number; summer: boolean }> }
  | { status: 'nonexistent'; before: number; after: number };

/** UTC moment of a local wall-clock time in the zone. */
export function resolveLocal(table: ZoneTable, local: LocalTime): Resolution {
  const wall = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) / 1000;
  const candidates = new Set<number>([offsetAt(table, wall - 2 * 86400), offsetAt(table, wall), offsetAt(table, wall + 2 * 86400)]);
  for (let i = 0; i < table.t.length; i++) if (Math.abs(table.t[i] - wall) < 2 * 86400) candidates.add(table.o[i]);
  const valid = [...candidates]
    .filter((offset) => offsetAt(table, wall - offset) === offset)
    .sort((a, b) => b - a)
    .map((offset) => ({ utc: new Date((wall - offset) * 1000), offset, summer: isSummerAt(table, wall - offset) }));
  if (valid.length === 1) return { status: 'ok', ...valid[0] };
  if (valid.length > 1) return { status: 'ambiguous', options: valid };
  return { status: 'nonexistent', before: offsetAt(table, wall - 2 * 86400), after: offsetAt(table, wall + 2 * 86400) };
}

/** UTC start and end of a local calendar day, and its noon (the chart moment when the time is unknown). */
export function localDay(table: ZoneTable, year: number, month: number, day: number): { start: Date; noon: Date; end: Date } {
  const at = (hour: number, minute: number, second: number) => {
    const wall = Date.UTC(year, month - 1, day, hour, minute, second) / 1000;
    return new Date((wall - offsetAt(table, wall - offsetAt(table, wall))) * 1000);
  };
  return { start: at(0, 0, 0), noon: at(12, 0, 0), end: at(23, 59, 59) };
}

/** «UTC+5», «UTC+4:37:11» (local mean time before 1924). */
export function offsetLabel(offset: number): string {
  const sign = offset < 0 ? '−' : '+';
  const abs = Math.abs(offset);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return `UTC${sign}${h}${m || s ? `:${String(m).padStart(2, '0')}` : ''}${s ? `:${String(s).padStart(2, '0')}` : ''}`;
}
