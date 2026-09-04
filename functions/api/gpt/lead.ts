// POST /api/gpt/lead — durable, idempotent lead capture for the AI chat.
//
// The edge/D1 path is deliberately canonical. Railway used to return before
// local validation, rate limits, dedupe and owner delivery, so enabling the
// gateway silently removed every funnel safeguard. A successful response now
// means one atomic D1 batch contains the lead, audit event and delivery outbox.
import type { Env } from '../../_types';
import { resolveConfig } from '../../lib/gpt-chat/config';
import { ensureSchema } from '../../lib/gpt-chat/schema';
import { json, fail, readJsonLimited, genId } from '../../lib/gpt-chat/http';
import { hashIp, getClientIp } from '../../lib/gpt-chat/hash';
import { normLocale, validateLead, type LeadInput } from '../../lib/gpt-chat/validate';
import { resolveBridgeLimits, type BridgeEnv } from '../../lib/gpt-chat/bridge-env';
import { consumeRateLimit, pruneRateLimits, DAY_MS, HOUR_MS } from '../../lib/gpt-chat/rate-limit';
import { deliverLeadOutboxItem, drainLeadOutbox } from '../../lib/gpt-chat/lead-outbox';
import { checkTurnstile } from '../../lib/turnstile';

type LeadBody = LeadInput & { locale?: string };

const MAX_LEAD_BODY_BYTES = 16 * 1024;

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const parsed = await readJsonLimited<LeadBody>(request, MAX_LEAD_BODY_BYTES);
  if (!parsed.ok) {
    return parsed.code === 'payload_too_large'
      ? fail('payload_too_large', 'Request body is too large', 413)
      : fail('bad_json', 'Invalid JSON body');
  }

  const validation = validateLead(parsed.value);
  if (!validation.ok) return fail('invalid_lead', validation.error || 'invalid lead');
  const lead = validation.value!;
  const locale = normLocale(parsed.value.locale);
  const bridgeEnv = env as BridgeEnv;
  const limits = resolveBridgeLimits(bridgeEnv);
  const cfg = resolveConfig(env);
  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) {
    return fail('store_unavailable', 'Не удалось сохранить заявку. Напишите нам в Telegram.', 503);
  }
  try {
    await ensureSchema(db);
  } catch {
    return fail('store_unavailable', 'Не удалось сохранить заявку. Напишите нам в Telegram.', 503);
  }

  // A retry with the same key returns the original write before spending any
  // rate budget. Reusing a key for different data is a conflict, not dedupe.
  if (lead.requestId) {
    const existing = await db.prepare(
      'SELECT id, contact_value FROM gpt_leads WHERE request_id = ? LIMIT 1',
    ).bind(lead.requestId).first<{ id: string; contact_value: string }>();
    if (existing) {
      if (existing.contact_value !== lead.contactValue) {
        return fail('idempotency_conflict', 'requestId was already used', 409);
      }
      return json({ ok: true, id: existing.id, duplicate: true, idempotent: true });
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const clientIp = getClientIp(request);
  const hashedIp = await hashIp(clientIp, cfg.hashSalt);
  const perHour = await consumeRateLimit(db, 'lead', hashedIp, {
    limit: limits.leadPerHour,
    windowMs: HOUR_MS,
  }, now);
  const perDay = await consumeRateLimit(db, 'lead_day', hashedIp, {
    limit: limits.leadPerDay,
    windowMs: DAY_MS,
  }, now);
  if (perHour.degraded || perDay.degraded) {
    return fail('rate_limit_unavailable', 'Проверка временно недоступна. Попробуйте позже.', 503);
  }
  if (!perHour.allowed || !perDay.allowed) {
    return fail(
      'rate_limited',
      'Мы уже получили вашу заявку. Если нужно срочно — напишите нам в Telegram.',
      429,
      { retryAfterSeconds: perHour.allowed ? perDay.retryAfterSeconds : perHour.retryAfterSeconds },
    );
  }
  if (env.TURNSTILE_SECRET_KEY && perHour.count > limits.leadTurnstileAfter) {
    const supplied = typeof parsed.value.turnstileToken === 'string' && parsed.value.turnstileToken.trim();
    if (!supplied) return fail('turnstile_required', 'Подтвердите, что вы человек.', 403);
    const turnstile = await checkTurnstile(env, supplied, clientIp, {
      expectedAction: 'gpt_lead',
      expectedHostname: new URL(request.url).hostname,
    });
    if (!turnstile.ok) {
      return turnstile.reason === 'unavailable'
        ? fail('turnstile_unavailable', 'Проверка временно недоступна. Попробуйте позже.', 503)
        : fail('turnstile_failed', 'Проверка не пройдена. Выполните её ещё раз.', 403);
    }
  }

  // Normalized contact dedupe collapses formatting variants such as
  // "90 123 45 67" and "+998901234567" into the same lead.
  const since = new Date(now.getTime() - limits.duplicateWindowMs).toISOString();
  const duplicate = await db.prepare(
    `SELECT id FROM gpt_leads WHERE contact_value = ? AND created_at >= ?
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(lead.contactValue, since).first<{ id: string }>();
  if (duplicate) return json({ ok: true, id: duplicate.id, duplicate: true });

  // This independent counter bounds a distributed flood that rotates IPs.
  const global = await consumeRateLimit(db, 'lead_global', 'all', {
    limit: limits.leadGlobalPerHour,
    windowMs: HOUR_MS,
  }, now);
  if (global.degraded) {
    return fail('rate_limit_unavailable', 'Проверка временно недоступна. Попробуйте позже.', 503);
  }
  if (!global.allowed) {
    return fail('rate_limited', 'Приём заявок временно ограничен. Напишите нам в Telegram.', 429, {
      retryAfterSeconds: global.retryAfterSeconds,
    });
  }

  const id = genId('lead');
  const outboxId = genId('lout');
  const sessionId = lead.sessionId ? lead.sessionId.slice(0, 64) : null;
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO gpt_leads
          (id, request_id, session_id, user_id, contact_type, contact_value, name, phone, telegram, intent, utm_json, source, page_url, created_at)
         VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        id, lead.requestId, sessionId, lead.contactType, lead.contactValue,
        lead.name, lead.phone, lead.telegram, lead.intent, lead.utmJson,
        'gpt_chat', lead.pageUrl, nowIso,
      ),
      db.prepare(
        'INSERT INTO gpt_events (id, session_id, user_id, event_name, payload_json, created_at) VALUES (?,?,NULL,?,?,?)',
      ).bind(
        genId('evt'),
        sessionId,
        'GPTChatLeadSubmitted',
        JSON.stringify({ intent: lead.intent, locale, shareConversation: lead.shareConversation }),
        nowIso,
      ),
      db.prepare(
        `INSERT INTO gpt_lead_outbox
          (id, lead_id, locale, share_conversation, status, attempt_count, available_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
      ).bind(outboxId, id, locale, lead.shareConversation ? 1 : 0, nowIso, nowIso, nowIso),
    ]);
  } catch {
    // Concurrent retries can race between the read above and the UNIQUE write.
    if (lead.requestId) {
      const existing = await db.prepare(
        'SELECT id, contact_value FROM gpt_leads WHERE request_id = ? LIMIT 1',
      ).bind(lead.requestId).first<{ id: string; contact_value: string }>();
      if (existing?.contact_value === lead.contactValue) {
        return json({ ok: true, id: existing.id, duplicate: true, idempotent: true });
      }
    }
    return fail('store_failed', 'Не удалось сохранить заявку. Напишите нам в Telegram.', 503);
  }

  waitUntil(
    deliverLeadOutboxItem(bridgeEnv, db, outboxId, limits.ownerAlertsPerHour)
      .then(() => drainLeadOutbox(bridgeEnv, db, limits.ownerAlertsPerHour, 3))
      .then(() => undefined)
      .catch(() => { console.error('gpt-chat: durable lead delivery deferred'); }),
  );
  if (Math.random() < 0.02) waitUntil(pruneRateLimits(db, new Date(now.getTime() - 2 * DAY_MS)));
  return json({ ok: true, id, delivery: 'pending' });
};

export const onRequest: PagesFunction<Env> = async () => fail('method_not_allowed', 'Use POST', 405);
