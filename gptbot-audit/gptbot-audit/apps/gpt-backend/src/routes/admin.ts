import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { getSupabase } from '../supabase.js';
import { isAdmin, adminHeader } from '../auth.js';

export function adminRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/v1/admin/analytics', async (req, reply) => {
    if (!isAdmin(adminHeader(req), ctx.cfg.adminKey)) return reply.code(401).send({ ok: false, code: 'unauthorized' });
    const db = getSupabase(ctx.cfg);
    if (!db) return reply.send({ ok: true, supabase: false, note: 'Supabase not configured' });

    const day = new Date().toISOString().slice(0, 10);
    const dayStart = `${day}T00:00:00.000Z`;
    const count = async (table: string, build?: (q: any) => any) => {
      let q = db.from(table).select('id', { count: 'exact', head: true });
      if (build) q = build(q);
      const { count } = await q;
      return count ?? 0;
    };

    const [sessionsToday, messagesToday, leadsToday, registeredSessions, limitReached, providerErrors, subscribeIntents] = await Promise.all([
      count('gpt_sessions', (q) => q.gte('created_at', dayStart)),
      count('gpt_messages', (q) => q.gte('created_at', dayStart).eq('role', 'user')),
      count('gpt_leads', (q) => q.gte('created_at', dayStart)),
      count('gpt_sessions', (q) => q.gte('created_at', dayStart).not('user_id', 'is', null)),
      count('gpt_events', (q) => q.gte('created_at', dayStart).eq('event_name', 'GPTChatLimitReached')),
      count('provider_errors', (q) => q.gte('created_at', dayStart)),
      count('gpt_events', (q) => q.gte('created_at', dayStart).eq('event_name', 'GPTChatSubscribeIntent')),
    ]);

    // Model usage + estimated cost (day).
    const { data: msgRows } = await db.from('gpt_messages').select('model_used,cost_usd').gte('created_at', dayStart).eq('role', 'assistant');
    const modelUsage: Record<string, number> = {};
    let estimatedCost = 0;
    for (const r of msgRows ?? []) {
      const m = (r.model_used as string) || 'unknown';
      modelUsage[m] = (modelUsage[m] ?? 0) + 1;
      estimatedCost += Number(r.cost_usd ?? 0);
    }

    const anonymousSessions = Math.max(0, sessionsToday - registeredSessions);
    const conversionChatToLead = messagesToday > 0 ? +(leadsToday / messagesToday).toFixed(4) : 0;

    return reply.send({
      ok: true, supabase: true, date: day,
      sessionsToday, messagesToday, leadsToday,
      anonymousSessions, registeredSessions,
      limitReached, providerErrors, subscribeIntents,
      modelUsage, estimatedCostUsd: +estimatedCost.toFixed(4),
      conversionChatToLead,
    });
  });

  // Cleanup old anonymous data. NEVER touches registered-user history.
  app.post('/v1/jobs/cleanup', async (req, reply) => {
    if (!isAdmin(adminHeader(req), ctx.cfg.adminKey)) return reply.code(401).send({ ok: false, code: 'unauthorized' });
    const db = getSupabase(ctx.cfg);
    if (!db) return reply.send({ ok: true, supabase: false });
    const cutoff = new Date(Date.now() - 30 * 24 * 3600_000).toISOString(); // 30 days
    // Only anonymous (user_id IS NULL) + inactive sessions.
    const { data: stale } = await db.from('gpt_sessions').select('id').is('user_id', null).lt('last_activity_at', cutoff).limit(500);
    const ids = (stale ?? []).map((r) => r.id as string);
    let deleted = 0;
    if (ids.length) {
      await db.from('gpt_messages').delete().in('session_id', ids);
      const { count } = await db.from('gpt_sessions').delete({ count: 'exact' }).in('id', ids);
      deleted = count ?? ids.length;
    }
    // Old anonymous events.
    await db.from('gpt_events').delete().is('user_id', null).lt('created_at', cutoff);
    return reply.send({ ok: true, deletedSessions: deleted });
  });
}
