// POST /api/gpt/lead — capture a lead from the chat softwall / B2B CTA.
// Requires consent + at least one contact. source = 'gpt_chat'.
//
// This is a public, unauthenticated POST that now reaches the owner's phone,
// so the order of operations matters and is deliberate:
//
//   validate → rate-limit (per hashed IP) → duplicate check → D1 write →
//   respond → notify in the background
//
// The response never waits on Telegram. `waitUntil` keeps the alert alive
// after the browser has been answered, which is the platform's own primitive
// for exactly this and is what the streaming path in chat.ts already uses.
// A Telegram failure is written to gpt_events, not swallowed: an alert that
// silently never arrived is worse than one that visibly failed.
import type { Env } from '../../_types';
import { resolveConfig } from '../../lib/gpt-chat/config';
import { ensureSchema } from '../../lib/gpt-chat/schema';
import { json, fail, readJson, genId } from '../../lib/gpt-chat/http';
import { hashIp, getClientIp } from '../../lib/gpt-chat/hash';
import { normLocale, validateLead, type LeadInput } from '../../lib/gpt-chat/validate';
import { proxyToRailway, relay } from '../../lib/gpt-chat/gateway';
import { resolveBridgeLimits, type BridgeEnv } from '../../lib/gpt-chat/bridge-env';
import { consumeRateLimit, pruneRateLimits, DAY_MS, HOUR_MS } from '../../lib/gpt-chat/rate-limit';
import {
  buildLeadAlert,
  buildMutedNotice,
  loadTranscript,
  sendOwnerAlert,
  type LeadAlert,
} from '../../lib/gpt-chat/notify';

type LeadBody = LeadInput & { locale?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const g = await proxyToRailway(env, request, '/v1/gpt/lead');
  if (g.proxied && g.response) return relay(g.response);

  const bridgeEnv = env as BridgeEnv;
  const cfg = resolveConfig(env);
  const limits = resolveBridgeLimits(bridgeEnv);
  const body = await readJson<LeadBody>(request);
  if (!body) return fail('bad_json', 'Invalid JSON body');

  const v = validateLead(body);
  if (!v.ok) return fail('invalid_lead', v.error || 'invalid lead');
  const lead = v.value!;
  const locale = normLocale(body.locale);

  const db = env.GPTBOT_DRAFTS_DB;
  const id = genId('lead');
  const now = new Date();
  const nowIso = now.toISOString();
  const sessionId = lead.sessionId ? lead.sessionId.slice(0, 64) : null;

  if (db) {
    try {
      await ensureSchema(db);
    } catch {
      return json(
        { ok: false, code: 'store_failed', message: 'Не удалось сохранить заявку. Напишите нам в Telegram.' },
        200,
      );
    }

    const hashedIp = await hashIp(getClientIp(request), cfg.hashSalt);
    const perHour = await consumeRateLimit(db, 'lead', hashedIp, { limit: limits.leadPerHour, windowMs: HOUR_MS }, now);
    const perDay = await consumeRateLimit(db, 'lead_day', hashedIp, { limit: limits.leadPerDay, windowMs: DAY_MS }, now);
    if (!perHour.allowed || !perDay.allowed) {
      // Nothing is stored and nobody is paged. The message is honest and
      // offers the route that still works.
      return fail(
        'rate_limited',
        'Мы уже получили вашу заявку. Если нужно срочно — напишите нам в Telegram.',
        429,
        { retryAfterSeconds: perHour.allowed ? perDay.retryAfterSeconds : perHour.retryAfterSeconds },
      );
    }

    // A double-tap, a flaky connection retry and a bored visitor all look the
    // same from here. One row, one alert.
    const since = new Date(now.getTime() - limits.duplicateWindowMs).toISOString();
    let duplicateId: string | null = null;
    try {
      const existing = await db
        .prepare(
          `SELECT id FROM gpt_leads WHERE contact_value = ? AND created_at >= ?
           ORDER BY created_at DESC LIMIT 1`,
        )
        .bind(lead.contactValue, since)
        .first<{ id: string }>();
      duplicateId = existing?.id ?? null;
    } catch {
      /* the dedupe read is an optimisation, never a gate */
    }
    if (duplicateId) return json({ ok: true, id: duplicateId, duplicate: true });

    try {
      await db
        .prepare(
          `INSERT INTO gpt_leads (id, session_id, user_id, contact_type, contact_value, name, phone, telegram, intent, utm_json, source, page_url, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          id, sessionId, null, lead.contactType, lead.contactValue,
          lead.name, lead.phone, lead.telegram, lead.intent, lead.utmJson,
          'gpt_chat', lead.pageUrl, nowIso,
        )
        .run();
      // Fire a server-side event too (dashboards / funnels).
      await db
        .prepare('INSERT INTO gpt_events (id, session_id, user_id, event_name, payload_json, created_at) VALUES (?,?,?,?,?,?)')
        .bind(
          genId('evt'),
          sessionId,
          null,
          'GPTChatLeadSubmitted',
          JSON.stringify({ intent: lead.intent, locale, shareConversation: lead.shareConversation }),
          nowIso,
        )
        .run();
    } catch {
      return json({ ok: false, code: 'store_failed', message: 'Не удалось сохранить заявку. Напишите нам в Telegram.' }, 200);
    }

    // The row is safe. Everything from here runs after the browser is answered.
    waitUntil(
      notifyOwner(bridgeEnv, db, {
        leadId: id,
        name: lead.name,
        contactType: lead.contactType,
        contactValue: lead.contactValue,
        intent: lead.intent,
        locale,
        pageUrl: lead.pageUrl,
        sessionId,
        utmJson: lead.utmJson,
        createdAt: nowIso,
        shareConversation: lead.shareConversation,
      }, limits.ownerAlertsPerHour),
    );
    if (Math.random() < 0.02) waitUntil(pruneRateLimits(db, new Date(now.getTime() - 2 * DAY_MS)));
  }

  return json({ ok: true, id });
};

/**
 * Background half of the endpoint. Loads the transcript only when consent was
 * given, applies the global alert ceiling, sends, and records the outcome as
 * a gpt_events row either way.
 */
async function notifyOwner(
  env: BridgeEnv,
  db: D1Database,
  alert: LeadAlert,
  alertsPerHour: number,
): Promise<void> {
  const record = async (eventName: string, payload: Record<string, unknown>) => {
    try {
      await db
        .prepare('INSERT INTO gpt_events (id, session_id, user_id, event_name, payload_json, created_at) VALUES (?,?,?,?,?,?)')
        .bind(genId('evt'), alert.sessionId, null, eventName, JSON.stringify(payload), new Date().toISOString())
        .run();
    } catch {
      /* the alert outcome is worth recording, not worth failing over */
    }
  };

  const ceiling = await consumeRateLimit(db, 'lead_notify', 'owner', { limit: alertsPerHour, windowMs: HOUR_MS });
  if (!ceiling.allowed) {
    // Say it once per hour, then go quiet. The leads themselves are already
    // stored; this is only about how loud the phone is.
    if (ceiling.count === alertsPerHour + 1) await sendOwnerAlert(env, buildMutedNotice(ceiling.count, alertsPerHour));
    await record('GPTChatLeadNotifySkipped', { leadId: alert.leadId, reason: 'muted', count: ceiling.count });
    return;
  }

  const transcript = alert.shareConversation && alert.sessionId ? await loadTranscript(db, alert.sessionId) : [];
  const result = await sendOwnerAlert(env, buildLeadAlert({ ...alert, transcript }));

  if (result.status === 'sent') {
    await record('GPTChatLeadNotified', { leadId: alert.leadId, source: result.source, withTranscript: transcript.length > 0 });
    return;
  }
  if (result.status === 'skipped_unconfigured') {
    await record('GPTChatLeadNotifySkipped', { leadId: alert.leadId, reason: 'unconfigured' });
    return;
  }
  console.error(`gpt-chat: owner alert failed code=${result.errorCode ?? '?'}`);
  await record('GPTChatLeadNotifyFailed', { leadId: alert.leadId, errorCode: result.errorCode ?? null });
}

export const onRequest: PagesFunction<Env> = async () => fail('method_not_allowed', 'Use POST', 405);
