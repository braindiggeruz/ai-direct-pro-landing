// Supabase data-access layer. All methods are null-safe: when Supabase is not
// configured they degrade (return empty / no-op) so the service still boots
// and the chat can answer (without persistence/quota) — the Cloudflare gateway
// keeps D1 as the durable fallback in that case.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UsageSnapshot } from './plans.js';

export class Store {
  constructor(private db: SupabaseClient | null) {}

  get enabled(): boolean {
    return this.db != null;
  }

  // ── Sessions ─────────────────────────────────────────────
  async createSession(row: {
    user_id: string | null;
    anon_token_hash: string | null;
    hashed_ip: string;
    locale: string;
    source: string;
  }): Promise<string | null> {
    if (!this.db) return null;
    const { data, error } = await this.db
      .from('gpt_sessions')
      .insert({ ...row, status: 'active' })
      .select('id')
      .single();
    if (error || !data) return null;
    return data.id as string;
  }

  async touchSession(id: string): Promise<void> {
    if (!this.db) return;
    await this.db.from('gpt_sessions').update({ last_activity_at: new Date().toISOString() }).eq('id', id);
  }

  async getSessionOwner(id: string): Promise<{ user_id: string | null } | null> {
    if (!this.db) return null;
    const { data } = await this.db.from('gpt_sessions').select('user_id').eq('id', id).is('deleted_at', null).single();
    return data ? { user_id: (data.user_id as string | null) ?? null } : null;
  }

  async setSessionTitleIfEmpty(id: string, title: string): Promise<void> {
    if (!this.db) return;
    await this.db.from('gpt_sessions').update({ title }).eq('id', id).is('title', null);
  }

  async updateSessionSummary(id: string, summary: string): Promise<void> {
    if (!this.db) return;
    await this.db.from('gpt_sessions').update({ summary }).eq('id', id);
  }

  async getSessionMeta(id: string): Promise<{ summary: string | null; user_id: string | null } | null> {
    if (!this.db) return null;
    const { data } = await this.db.from('gpt_sessions').select('summary,user_id').eq('id', id).single();
    return data ? { summary: (data.summary as string | null) ?? null, user_id: (data.user_id as string | null) ?? null } : null;
  }

  async listUserSessions(userId: string, limit: number, offset: number) {
    if (!this.db) return [];
    const { data } = await this.db
      .from('gpt_sessions')
      .select('id,title,summary,locale,created_at,last_activity_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('last_activity_at', { ascending: false })
      .range(offset, offset + limit - 1);
    return data ?? [];
  }

  async renameSession(id: string, userId: string, title: string): Promise<boolean> {
    if (!this.db) return false;
    const { error, count } = await this.db.from('gpt_sessions').update({ title }, { count: 'exact' }).eq('id', id).eq('user_id', userId);
    return !error && (count ?? 0) > 0;
  }

  async softDeleteSession(id: string, userId: string): Promise<boolean> {
    if (!this.db) return false;
    const { error, count } = await this.db
      .from('gpt_sessions')
      .update({ deleted_at: new Date().toISOString(), status: 'deleted' }, { count: 'exact' })
      .eq('id', id)
      .eq('user_id', userId);
    return !error && (count ?? 0) > 0;
  }

  // ── Messages ─────────────────────────────────────────────
  async recentMessages(sessionId: string, limit: number): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    if (!this.db) return [];
    const { data } = await this.db
      .from('gpt_messages')
      .select('role,content,created_at')
      .eq('session_id', sessionId)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []).reverse().map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }));
  }

  async pageMessages(sessionId: string, limit: number, offset: number) {
    if (!this.db) return [];
    const { data } = await this.db
      .from('gpt_messages')
      .select('id,role,content,model_used,created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);
    return data ?? [];
  }

  async saveMessage(row: {
    session_id: string;
    user_id: string | null;
    role: 'user' | 'assistant';
    content: string;
    model_used?: string | null;
    token_in?: number;
    token_out?: number;
    cost_usd?: number;
  }): Promise<string | null> {
    if (!this.db) return null;
    const { data } = await this.db.from('gpt_messages').insert(row).select('id').single();
    return data ? (data.id as string) : null;
  }

  // ── Usage / quota ────────────────────────────────────────
  async readUsage(hashedIp: string, userId: string | null): Promise<UsageSnapshot> {
    if (!this.db) return { dayCount: 0, hourCount: 0, monthCount: 0 };
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const hourAgo = new Date(now.getTime() - 3600_000).toISOString();
    const monthStart = `${day.slice(0, 7)}-01`;

    const dayQ = this.db.from('gpt_usage_daily').select('message_count').eq('date_utc', day);
    const scoped = userId ? dayQ.eq('user_id', userId) : dayQ.eq('hashed_ip', hashedIp);
    const [{ data: dayRows }, { count: hourCount }, { data: monthRows }] = await Promise.all([
      scoped,
      this.db.from('gpt_messages').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', hourAgo).eq(userId ? 'user_id' : 'session_id', userId ?? '__none__'),
      userId ? this.db.from('gpt_usage_daily').select('message_count').gte('date_utc', monthStart).eq('user_id', userId) : Promise.resolve({ data: [] as { message_count: number }[] }),
    ]);
    const dayCount = (dayRows ?? []).reduce((a, r) => a + (r.message_count as number), 0);
    const monthCount = (monthRows ?? []).reduce((a, r) => a + (r.message_count as number), 0);
    return { dayCount, hourCount: hourCount ?? 0, monthCount };
  }

  async recordUsage(row: { hashedIp: string; userId: string | null; sessionId: string; tokIn: number; tokOut: number }): Promise<void> {
    if (!this.db) return;
    const day = new Date().toISOString().slice(0, 10);
    // Upsert-like increment: read then write (Supabase has no atomic incr via JS
    // without an RPC; acceptable for MVP volume — a Postgres function is the
    // production upgrade).
    const { data } = await this.db
      .from('gpt_usage_daily')
      .select('id,message_count,token_in,token_out')
      .eq('date_utc', day)
      .eq('hashed_ip', row.hashedIp)
      .maybeSingle();
    if (data) {
      await this.db.from('gpt_usage_daily').update({
        message_count: (data.message_count as number) + 1,
        token_in: (data.token_in as number) + row.tokIn,
        token_out: (data.token_out as number) + row.tokOut,
      }).eq('id', data.id);
    } else {
      await this.db.from('gpt_usage_daily').insert({
        date_utc: day, hashed_ip: row.hashedIp, user_id: row.userId, session_id: row.sessionId,
        message_count: 1, token_in: row.tokIn, token_out: row.tokOut,
      });
    }
  }

  // ── Leads / events / errors / feedback ───────────────────
  async saveLead(row: Record<string, unknown>): Promise<string | null> {
    if (!this.db) return null;
    const { data } = await this.db.from('gpt_leads').insert(row).select('id').single();
    return data ? (data.id as string) : null;
  }

  async event(name: string, sessionId: string | null, userId: string | null, payload: Record<string, unknown> = {}): Promise<void> {
    if (!this.db) return;
    await this.db.from('gpt_events').insert({ event_name: name, session_id: sessionId, user_id: userId, payload_json: payload });
  }

  async providerError(row: Record<string, unknown>): Promise<void> {
    if (!this.db) return;
    await this.db.from('provider_errors').insert(row);
  }

  async saveFeedback(row: { message_id: string; user_id: string | null; rating: 'up' | 'down'; comment?: string | null }): Promise<boolean> {
    if (!this.db) return false;
    const { error } = await this.db.from('message_feedback').insert(row);
    return !error;
  }

  // ── Subscriptions / payments ─────────────────────────────
  async activeSubscription(userId: string): Promise<{ plan: string; status: string } | null> {
    if (!this.db) return null;
    const { data } = await this.db
      .from('gpt_subscriptions')
      .select('plan,status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? { plan: data.plan as string, status: data.status as string } : null;
  }

  async createPaymentAttempt(row: Record<string, unknown>): Promise<string | null> {
    if (!this.db) return null;
    const { data } = await this.db.from('payment_attempts').insert(row).select('id').single();
    return data ? (data.id as string) : null;
  }

  async webhookAlreadyProcessed(providerCheckoutId: string): Promise<boolean> {
    if (!this.db) return false;
    const { data } = await this.db.from('payment_attempts').select('id,status').eq('provider_checkout_id', providerCheckoutId).eq('status', 'processed').maybeSingle();
    return !!data;
  }
}
