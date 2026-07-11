// POST /api/gpt/lead — capture a lead from the chat softwall / B2B CTA.
// Requires consent + at least one contact. source = 'gpt_chat'.
import type { Env } from '../../_types';
import { resolveConfig } from '../../lib/gpt-chat/config';
import { ensureSchema } from '../../lib/gpt-chat/schema';
import { json, fail, readJson, genId } from '../../lib/gpt-chat/http';
import { validateLead, type LeadInput } from '../../lib/gpt-chat/validate';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  resolveConfig(env); // reserved for future rate-limiting of lead spam
  const body = await readJson<LeadInput>(request);
  if (!body) return fail('bad_json', 'Invalid JSON body');

  const v = validateLead(body);
  if (!v.ok) return fail('invalid_lead', v.error || 'invalid lead');
  const lead = v.value!;

  const db = env.GPTBOT_DRAFTS_DB;
  const id = genId('lead');
  const nowIso = new Date().toISOString();

  if (db) {
    try {
      await ensureSchema(db);
      await db
        .prepare(
          `INSERT INTO gpt_leads (id, session_id, user_id, contact_type, contact_value, name, phone, telegram, intent, utm_json, source, page_url, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          id, lead.sessionId, null, lead.contactType, lead.contactValue,
          lead.name, lead.phone, lead.telegram, lead.intent, lead.utmJson,
          'gpt_chat', lead.pageUrl, nowIso,
        )
        .run();
      // Fire a server-side event too (dashboards / funnels).
      await db
        .prepare('INSERT INTO gpt_events (id, session_id, user_id, event_name, payload_json, created_at) VALUES (?,?,?,?,?,?)')
        .bind(genId('evt'), lead.sessionId, null, 'GPTChatLeadSubmitted', JSON.stringify({ intent: lead.intent }), nowIso)
        .run();
    } catch {
      return json({ ok: false, code: 'store_failed', message: 'Не удалось сохранить заявку. Напишите нам в Telegram.' }, 200);
    }
  }

  return json({ ok: true, id });
};

export const onRequest: PagesFunction<Env> = async () => fail('method_not_allowed', 'Use POST', 405);
