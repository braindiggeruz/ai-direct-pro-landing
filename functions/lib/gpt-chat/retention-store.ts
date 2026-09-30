// Chat message retention (plan WP-07, D7). Built and OFF: the privacy policy
// says how long a conversation is kept, so a fixed period is switched on only
// on the owner's decision and together with that text (plan WP-18).
//
// GPT_MESSAGES_RETENTION_DAYS empty or 0 keeps everything. Any other number of
// days (clamped 7..3650) lets each maintenance tick delete at most
// PURGE_BATCH rows of every kind older than that, in one D1 batch:
//   gpt_messages              the conversation text itself
//   gpt_sessions.hashed_ip    set to NULL; the session row and its id stay,
//                             so a lead that names the session still resolves
//   gpt_usage_daily           legacy counters keyed by the IP hash
// Every 15 minutes that is up to 48 000 messages a day. Turn telemetry
// (model, tokens, cost) lives in gpt_turn_reservations since migrations/0066,
// so deleting the text loses no economics. Deletion is final; D1 Time Travel
// is the only short-term way back.
import type { Env } from "../../_types";

export const PURGE_BATCH = 500;
export const MIN_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 3650;
const DAY_MS = 86_400_000;

/** Days to keep chat messages, or null when retention is off (the default). */
export function retentionDays(env: Pick<Env, "GPT_MESSAGES_RETENTION_DAYS">): number | null {
  const raw = (env.GPT_MESSAGES_RETENTION_DAYS || "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const days = Number(raw);
  if (days === 0) return null;
  return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, days));
}

export type RetentionRun =
  | { enabled: false }
  | {
      enabled: true;
      days: number;
      /** Rows changed in this tick; counts only, never content. */
      deleted: { messages: number; sessionIps: number; usageDaily: number };
    };

/** One bounded retention pass. Throws only on a D1 failure. */
export async function purgeChatMessages(env: Env, now = Date.now()): Promise<RetentionRun> {
  const days = retentionDays(env);
  const db = env.GPTBOT_DRAFTS_DB;
  if (days === null || !db) return { enabled: false };
  // ISO strings of toISOString() compare in time order.
  const cutoff = new Date(now - days * DAY_MS).toISOString();
  const [messages, sessions, usage] = await db.batch([
    db
      .prepare(
        "DELETE FROM gpt_messages WHERE rowid IN (SELECT rowid FROM gpt_messages WHERE created_at<? LIMIT ?)",
      )
      .bind(cutoff, PURGE_BATCH),
    db
      .prepare(
        "UPDATE gpt_sessions SET hashed_ip=NULL WHERE rowid IN (SELECT rowid FROM gpt_sessions WHERE created_at<? AND hashed_ip IS NOT NULL LIMIT ?)",
      )
      .bind(cutoff, PURGE_BATCH),
    db
      .prepare(
        "DELETE FROM gpt_usage_daily WHERE rowid IN (SELECT rowid FROM gpt_usage_daily WHERE date_utc<? LIMIT ?)",
      )
      .bind(cutoff.slice(0, 10), PURGE_BATCH),
  ]);
  return {
    enabled: true,
    days,
    deleted: {
      messages: messages.meta?.changes ?? 0,
      sessionIps: sessions.meta?.changes ?? 0,
      usageDaily: usage.meta?.changes ?? 0,
    },
  };
}
