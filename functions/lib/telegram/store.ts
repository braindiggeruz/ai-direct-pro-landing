// D1 data access for the Telegram assistant. All queries are parameterized;
// no SQL is ever built from AI output. Ownership is enforced on item reads.
import { hashIp } from '../gpt-chat/hash';

export type Locale = 'ru' | 'uz';
export type TgAction = 'reply' | 'explain' | 'summarize' | 'translate';

function shortId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}
function nowIso(): string { return new Date().toISOString(); }
function utcDate(d = new Date()): string { return d.toISOString().slice(0, 10); }

/** Pseudonymous, stable per (user, salt). Analytics NEVER store the raw id. */
export function pseudoUser(userId: number, salt: string): Promise<string> {
  return hashIp(`tg:${userId}`, salt).then((h) => h.slice(0, 32));
}

// ── Updates (dedupe) ─────────────────────────────────────────────────────
/** Returns true if this update_id is NEW (should be processed). */
export async function claimUpdate(db: D1Database, updateId: number): Promise<boolean> {
  const res = await db
    .prepare('INSERT OR IGNORE INTO telegram_updates (update_id, processed_at, status) VALUES (?,?,?)')
    .bind(updateId, nowIso(), 'ok')
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

// ── Users ────────────────────────────────────────────────────────────────
export interface TgUserRow {
  telegram_user_id: number;
  locale: Locale;
  daily_usage_count: number;
  daily_usage_date: string | null;
}

/** Fetch-or-create the user row, refreshing last_seen_at. */
export async function upsertUser(db: D1Database, userId: number, fallbackLocale: Locale): Promise<TgUserRow> {
  const existing = await db
    .prepare('SELECT telegram_user_id, locale, daily_usage_count, daily_usage_date FROM telegram_users WHERE telegram_user_id = ?')
    .bind(userId)
    .first<TgUserRow>();
  if (existing) {
    await db.prepare('UPDATE telegram_users SET last_seen_at = ? WHERE telegram_user_id = ?').bind(nowIso(), userId).run();
    return existing;
  }
  await db
    .prepare('INSERT INTO telegram_users (telegram_user_id, locale, created_at, last_seen_at, daily_usage_count, daily_usage_date, total_actions) VALUES (?,?,?,?,0,?,0)')
    .bind(userId, fallbackLocale, nowIso(), nowIso(), utcDate())
    .run();
  return { telegram_user_id: userId, locale: fallbackLocale, daily_usage_count: 0, daily_usage_date: utcDate() };
}

export async function setLocale(db: D1Database, userId: number, locale: Locale): Promise<void> {
  await db.prepare('UPDATE telegram_users SET locale = ? WHERE telegram_user_id = ?').bind(locale, userId).run();
}

export interface LimitDecision { allowed: boolean; remaining: number; usedToday: number; }

/** Read today's usage, resetting the counter lazily when the date rolled over. */
export async function checkDailyLimit(db: D1Database, userId: number, dailyLimit: number): Promise<LimitDecision> {
  const row = await db
    .prepare('SELECT daily_usage_count, daily_usage_date FROM telegram_users WHERE telegram_user_id = ?')
    .bind(userId)
    .first<{ daily_usage_count: number; daily_usage_date: string | null }>();
  const today = utcDate();
  const usedToday = row && row.daily_usage_date === today ? row.daily_usage_count : 0;
  const remaining = Math.max(0, dailyLimit - usedToday);
  return { allowed: usedToday < dailyLimit, remaining, usedToday };
}

/** Increment today's counter (resetting on a new UTC day) + total_actions. */
export async function recordAction(db: D1Database, userId: number): Promise<void> {
  const today = utcDate();
  await db
    .prepare(
      `UPDATE telegram_users
       SET total_actions = total_actions + 1,
           daily_usage_date = ?,
           daily_usage_count = CASE WHEN daily_usage_date = ? THEN daily_usage_count + 1 ELSE 1 END
       WHERE telegram_user_id = ?`,
    )
    .bind(today, today, userId)
    .run();
}

// ── Items ────────────────────────────────────────────────────────────────
export interface TgItemRow {
  id: string;
  telegram_user_id: number;
  source_type: string;
  source_text: string | null;
  source_language: string | null;
  voice_duration_sec: number | null;
  detected_context?: string | null;
  expires_at: string;
}

export async function createItem(
  db: D1Database,
  userId: number,
  sourceType: 'forward' | 'direct' | 'voice',
  sourceText: string,
  sourceLanguage: string,
  ttlMs: number,
  voiceDurationSec: number | null = null,
): Promise<string> {
  const id = shortId();
  const created = new Date();
  const expires = new Date(created.getTime() + ttlMs);
  await db
    .prepare('INSERT INTO telegram_items (id, telegram_user_id, source_type, source_text, source_language, voice_duration_sec, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id, userId, sourceType, sourceText, sourceLanguage, voiceDurationSec, created.toISOString(), expires.toISOString())
    .run();
  return id;
}

/** Read an item ONLY if it belongs to this user and has not expired. */
export async function getOwnedItem(db: D1Database, itemId: string, userId: number): Promise<TgItemRow | null> {
  if (!itemId || itemId.length > 32) return null;
  const row = await db
    .prepare('SELECT id, telegram_user_id, source_type, source_text, source_language, voice_duration_sec, detected_context, expires_at FROM telegram_items WHERE id = ? AND telegram_user_id = ?')
    .bind(itemId, userId)
    .first<TgItemRow>();
  if (!row) return null;
  if (!row.source_text || new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

/** Store the classified situation / audience context on an item. */
export async function setItemContext(db: D1Database, itemId: string, context: string): Promise<void> {
  try {
    await db.prepare('UPDATE telegram_items SET detected_context = ? WHERE id = ?').bind(context.slice(0, 32), itemId).run();
  } catch { /* column may predate 0010 on a stale isolate — non-fatal */ }
}

// ── Results ──────────────────────────────────────────────────────────────
export async function saveResult(
  db: D1Database,
  itemId: string,
  action: string,
  modifier: string | null,
  resultText: string,
  provider: string,
  model: string | null,
  promptVersion: string,
  outputLanguage?: string,
  latencyMs?: number,
): Promise<string> {
  const id = shortId();
  await db
    .prepare('INSERT INTO telegram_results (id, item_id, action, modifier, result_text, provider, model, prompt_version, created_at, output_language, latency_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, itemId, action, modifier, resultText.slice(0, 8000), provider, model, promptVersion, nowIso(), outputLanguage ?? null, latencyMs ?? null)
    .run();
  return id;
}

export interface TgOwnedResult { id: string; model: string | null; prompt_version: string | null; output_language: string | null }

/** Result row ONLY if its item belongs to this user (feedback ownership). */
export async function getOwnedResult(db: D1Database, resultId: string, userId: number): Promise<TgOwnedResult | null> {
  if (!resultId || resultId.length > 32) return null;
  const row = await db
    .prepare(`SELECT r.id, r.model, r.prompt_version, r.output_language FROM telegram_results r
              JOIN telegram_items i ON i.id = r.item_id
              WHERE r.id = ? AND i.telegram_user_id = ?`)
    .bind(resultId, userId)
    .first<TgOwnedResult>();
  return row || null;
}

export interface TgLastResult { action: string; modifier: string | null; result_text: string; }

/** Most recent result for an item (for modifier follow-ups). */
export async function getLastResult(db: D1Database, itemId: string): Promise<TgLastResult | null> {
  const row = await db
    .prepare('SELECT action, modifier, result_text FROM telegram_results WHERE item_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(itemId)
    .first<TgLastResult>();
  return row && row.result_text ? row : null;
}

// ── Events (pseudonymous, text-free) ─────────────────────────────────────
export async function logEvent(db: D1Database, event: string, pseudo: string | null, meta: Record<string, string | number> = {}): Promise<void> {
  try {
    await db
      .prepare('INSERT INTO telegram_events (id, event, pseudo_user, meta_json, created_at) VALUES (?,?,?,?,?)')
      .bind(shortId(), event, pseudo, JSON.stringify(meta).slice(0, 1000), nowIso())
      .run();
  } catch { /* analytics are best-effort */ }
}

// ── Retention / GDPR ─────────────────────────────────────────────────────
/** Opportunistic cleanup: clear expired source_text + prune old rows. */
export async function cleanupExpired(db: D1Database): Promise<void> {
  const now = nowIso();
  try {
    await db.batch([
      db.prepare('DELETE FROM telegram_results WHERE item_id IN (SELECT id FROM telegram_items WHERE expires_at < ?)').bind(now),
      db.prepare('DELETE FROM telegram_items WHERE expires_at < ?').bind(now),
      db.prepare("DELETE FROM telegram_updates WHERE processed_at < ?").bind(new Date(Date.now() - 7 * 864e5).toISOString()),
    ]);
  } catch { /* best-effort */ }
}

/** /delete_me — wipe this user's rows. Aggregated pseudonymous events stay. */
export async function deleteUserData(db: D1Database, userId: number): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM payment_transactions WHERE payment_order_id IN (SELECT id FROM payment_orders WHERE telegram_user_id = ?)').bind(userId),
    db.prepare('DELETE FROM payment_orders WHERE telegram_user_id = ?').bind(userId),
    db.prepare('DELETE FROM usage_ledger WHERE telegram_user_id = ?').bind(userId),
    db.prepare('DELETE FROM entitlements WHERE telegram_user_id = ?').bind(userId),
    db.prepare('DELETE FROM subscriptions WHERE telegram_user_id = ?').bind(userId),
    db.prepare('DELETE FROM user_preferences WHERE telegram_user_id = ?').bind(userId),
    db.prepare('DELETE FROM referrals WHERE referrer_user_id = ? OR referred_user_id = ?').bind(userId, userId),
    db.prepare('DELETE FROM telegram_results WHERE item_id IN (SELECT id FROM telegram_items WHERE telegram_user_id = ?)').bind(userId),
    db.prepare('DELETE FROM telegram_items WHERE telegram_user_id = ?').bind(userId),
    db.prepare('DELETE FROM telegram_users WHERE telegram_user_id = ?').bind(userId),
  ]);
}

export { shortId };
