import type { TelegramHandleKind } from '../../../src/shared/lead-radar-export-contacts';

/**
 * Storage for public Telegram handle verdicts (owner audit 22.11.2026, EX-09).
 *
 * A verdict ("this username is a bot / a channel / a group / does not exist /
 * a regular account") is a public fact about a public username, not tenant
 * data, so it lives in the shared Lead Radar cache table under a namespaced
 * key, like the geocode cache next to it. No schema change: the table already
 * has `cache_key`, a JSON payload, `observed_at` and `expires_at`.
 *
 * Both the free public t.me page check and TG Sender account lookups write
 * here, so one handle is classified once and reused by every export.
 */

const CACHE_PREFIX = 'tg-handle:v1:';
const USERNAME_RE = /^[a-z][a-z0-9_]{4,31}$/;
// A dead-username verdict is the one a markup change could fake, so it is short-lived.
const VERDICT_TTL_DAYS: Record<TelegramHandleKind, number> = { bot: 60, channel: 30, group: 30, not_found: 2, user: 14 };
const KINDS = new Set<TelegramHandleKind>(['user', 'bot', 'channel', 'group', 'not_found']);

export type TelegramHandleVerdictSource = 'public_card' | 'account_lookup';

export function telegramHandleCacheKey(username: string): string {
  return `${CACHE_PREFIX}${username.toLowerCase()}`;
}

export function isCacheableTelegramUsername(username: string): boolean {
  return USERNAME_RE.test(username.toLowerCase());
}

export async function readTelegramHandleVerdicts(
  db: D1Database,
  usernames: readonly string[],
  now = new Date(),
): Promise<Map<string, TelegramHandleKind>> {
  const verdicts = new Map<string, TelegramHandleKind>();
  const unique = [...new Set(usernames.map((name) => name.toLowerCase()))].filter((name) => USERNAME_RE.test(name));
  for (let index = 0; index < unique.length; index += 80) {
    const slice = unique.slice(index, index + 80);
    try {
      const rows = await db.prepare(`SELECT cache_key, bounds_json FROM lead_radar_geocode_cache
        WHERE cache_key IN (SELECT value FROM json_each(?)) AND expires_at > ?`)
        .bind(JSON.stringify(slice.map(telegramHandleCacheKey)), now.toISOString())
        .all<{ cache_key: string; bounds_json: string }>();
      for (const row of rows.results ?? []) {
        try {
          const parsed = JSON.parse(row.bounds_json) as { kind?: unknown };
          if (typeof parsed.kind === 'string' && KINDS.has(parsed.kind as TelegramHandleKind)
            && row.cache_key.startsWith(CACHE_PREFIX)) {
            verdicts.set(row.cache_key.slice(CACHE_PREFIX.length), parsed.kind as TelegramHandleKind);
          }
        } catch { /* a malformed cache row is ignored, never trusted */ }
      }
    } catch {
      // The cache is an optimisation: an unavailable table means "nothing known yet".
      return verdicts;
    }
  }
  return verdicts;
}

export async function writeTelegramHandleVerdict(
  db: D1Database,
  username: string,
  kind: TelegramHandleKind,
  source: TelegramHandleVerdictSource,
  now = new Date(),
): Promise<void> {
  const clean = username.toLowerCase();
  if (!USERNAME_RE.test(clean) || !KINDS.has(kind)) return;
  const expires = new Date(now.getTime() + VERDICT_TTL_DAYS[kind] * 86_400_000).toISOString();
  try {
    await db.prepare(`INSERT INTO lead_radar_geocode_cache (cache_key, bounds_json, observed_at, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET bounds_json = excluded.bounds_json,
        observed_at = excluded.observed_at, expires_at = excluded.expires_at`)
      .bind(telegramHandleCacheKey(clean), JSON.stringify({ kind, source }), now.toISOString(), expires).run();
  } catch { /* a write failure never breaks the caller */ }
}
