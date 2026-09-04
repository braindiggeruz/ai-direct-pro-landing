import { genId } from './http';
import { buildLeadAlert, buildMutedNotice, loadTranscript, sendOwnerAlert, type LeadAlert } from './notify';
import { consumeRateLimit, HOUR_MS } from './rate-limit';
import type { BridgeEnv } from './bridge-env';

interface PendingLeadRow {
  outbox_id: string;
  lead_id: string;
  session_id: string | null;
  contact_type: string;
  contact_value: string;
  name: string | null;
  intent: string | null;
  page_url: string | null;
  utm_json: string | null;
  created_at: string;
  locale: 'ru' | 'uz';
  share_conversation: number;
  attempt_count: number;
}

export type LeadDeliveryOutcome = 'sent' | 'pending' | 'blocked' | 'missing' | 'busy';

function changes(result: unknown): number {
  return Number((result as { meta?: { changes?: number; rows_written?: number } })?.meta?.changes
    ?? (result as { meta?: { rows_written?: number } })?.meta?.rows_written
    ?? 0);
}

async function record(
  db: D1Database,
  row: PendingLeadRow,
  eventName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await db.prepare(
      'INSERT INTO gpt_events (id, session_id, user_id, event_name, payload_json, created_at) VALUES (?,?,?,?,?,?)',
    ).bind(genId('evt'), row.session_id, null, eventName, JSON.stringify(payload), new Date().toISOString()).run();
  } catch {
    // Delivery state lives in the outbox; the analytics event is secondary.
  }
}

function retryAt(now: Date, attemptCount: number): string {
  const seconds = Math.min(60 * 60, 30 * (2 ** Math.min(7, Math.max(0, attemptCount))));
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

async function release(
  db: D1Database,
  id: string,
  status: 'pending' | 'failed' | 'blocked',
  availableAt: string,
  errorCode: string | null,
  nowIso: string,
): Promise<void> {
  await db.prepare(
    `UPDATE gpt_lead_outbox
     SET status = ?, available_at = ?, last_error_code = ?, updated_at = ?
     WHERE id = ? AND status = 'sending'`,
  ).bind(status, availableAt, errorCode, nowIso, id).run();
}

/**
 * Claim and deliver one durable notification. The lease prevents two requests
 * from sending the same Telegram alert concurrently; stale leases recover
 * after five minutes if an isolate dies mid-flight.
 */
export async function deliverLeadOutboxItem(
  env: BridgeEnv,
  db: D1Database,
  outboxId: string,
  alertsPerHour: number,
  now = new Date(),
): Promise<LeadDeliveryOutcome> {
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - 5 * 60_000).toISOString();
  const claimed = await db.prepare(
    `UPDATE gpt_lead_outbox
     SET status = 'sending', updated_at = ?
     WHERE id = ? AND available_at <= ?
       AND (status IN ('pending','failed','blocked') OR (status = 'sending' AND updated_at <= ?))`,
  ).bind(nowIso, outboxId, nowIso, staleBefore).run();
  if (changes(claimed) !== 1) return 'busy';

  const row = await db.prepare(
    `SELECT o.id AS outbox_id, o.lead_id, o.locale, o.share_conversation,
            o.attempt_count, l.session_id, l.contact_type, l.contact_value,
            l.name, l.intent, l.page_url, l.utm_json, l.created_at
     FROM gpt_lead_outbox o
     JOIN gpt_leads l ON l.id = o.lead_id
     WHERE o.id = ?`,
  ).bind(outboxId).first<PendingLeadRow>();
  if (!row) {
    await db.prepare(
      `UPDATE gpt_lead_outbox
       SET status = 'failed', attempt_count = attempt_count + 1,
           available_at = ?, last_error_code = 'lead_missing', updated_at = ?
       WHERE id = ? AND status = 'sending'`,
    ).bind(retryAt(now, 7), nowIso, outboxId).run();
    return 'missing';
  }

  const ceiling = await consumeRateLimit(db, 'lead_notify', 'owner', {
    limit: alertsPerHour,
    windowMs: HOUR_MS,
  }, now);
  if (ceiling.degraded) {
    await release(db, outboxId, 'pending', retryAt(now, row.attempt_count), 'rate_limit_unavailable', nowIso);
    await record(db, row, 'GPTChatLeadNotifyDeferred', { leadId: row.lead_id, reason: 'rate_limit_unavailable' });
    return 'pending';
  }
  if (!ceiling.allowed) {
    const availableAt = new Date(now.getTime() + ceiling.retryAfterSeconds * 1000).toISOString();
    await release(db, outboxId, 'pending', availableAt, 'muted', nowIso);
    if (ceiling.count === alertsPerHour + 1) {
      await sendOwnerAlert(env, buildMutedNotice(ceiling.count, alertsPerHour));
    }
    await record(db, row, 'GPTChatLeadNotifySkipped', { leadId: row.lead_id, reason: 'muted' });
    return 'pending';
  }

  const transcript = row.share_conversation && row.session_id
    ? await loadTranscript(db, row.session_id)
    : [];
  const alert: LeadAlert = {
    leadId: row.lead_id,
    name: row.name,
    contactType: row.contact_type,
    contactValue: row.contact_value,
    intent: row.intent,
    locale: row.locale,
    pageUrl: row.page_url,
    sessionId: row.session_id,
    utmJson: row.utm_json,
    createdAt: row.created_at,
    shareConversation: row.share_conversation === 1,
    transcript,
  };
  const result = await sendOwnerAlert(env, buildLeadAlert(alert));
  if (result.status === 'sent') {
    await db.prepare(
      `UPDATE gpt_lead_outbox
       SET status = 'sent', attempt_count = attempt_count + 1,
           delivered_at = ?, last_error_code = NULL, updated_at = ?
       WHERE id = ? AND status = 'sending'`,
    ).bind(nowIso, nowIso, outboxId).run();
    await record(db, row, 'GPTChatLeadNotified', {
      leadId: row.lead_id,
      source: result.source,
      withTranscript: transcript.length > 0,
    });
    return 'sent';
  }

  if (result.status === 'skipped_unconfigured') {
    await release(db, outboxId, 'blocked', retryAt(now, 7), 'unconfigured', nowIso);
    await record(db, row, 'GPTChatLeadNotifySkipped', { leadId: row.lead_id, reason: 'unconfigured' });
    return 'blocked';
  }

  const rawErrorCode = result.errorCode ?? 'provider_error';
  const errorCode = String(rawErrorCode).slice(0, 80);
  console.error(`gpt-chat: owner alert failed code=${errorCode}`);
  await db.prepare(
    `UPDATE gpt_lead_outbox
     SET status = 'failed', attempt_count = attempt_count + 1,
         available_at = ?, last_error_code = ?, updated_at = ?
     WHERE id = ? AND status = 'sending'`,
  ).bind(retryAt(now, row.attempt_count + 1), errorCode, nowIso, outboxId).run();
  await record(db, row, 'GPTChatLeadNotifyFailed', { leadId: row.lead_id, errorCode: rawErrorCode });
  return 'pending';
}

/** Drain a small bounded batch for an authenticated cron/manual retry. */
export async function drainLeadOutbox(
  env: BridgeEnv,
  db: D1Database,
  alertsPerHour: number,
  limit = 10,
  now = new Date(),
): Promise<{ attempted: number; sent: number; pending: number; blocked: number }> {
  const rows = await db.prepare(
    `SELECT id FROM gpt_lead_outbox
     WHERE available_at <= ? AND status IN ('pending','failed','blocked','sending')
     ORDER BY created_at ASC LIMIT ?`,
  ).bind(now.toISOString(), Math.max(1, Math.min(25, limit))).all<{ id: string }>();
  let sent = 0;
  let pending = 0;
  let blocked = 0;
  for (const row of rows.results ?? []) {
    const outcome = await deliverLeadOutboxItem(env, db, row.id, alertsPerHour, now);
    if (outcome === 'sent') sent += 1;
    else if (outcome === 'blocked') blocked += 1;
    else if (outcome === 'pending') pending += 1;
  }
  return { attempted: (rows.results ?? []).length, sent, pending, blocked };
}
