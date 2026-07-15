// Plan definitions, model routing, and quota decisions. PURE — unit-tested,
// no I/O. Consumed by the chat route with usage counts read from Supabase.
import type { BackendConfig } from './env.js';

export type Plan = 'anonymous_free' | 'registered_free' | 'plus' | 'business';

export interface PlanLimits {
  dailyLimit: number;
  hourlyLimit: number;
  monthlyLimit: number | null;
  maxInputChars: number;
  historyTurns: number;
  savedHistory: boolean;
  tier: 'free' | 'paid';
}

export const PLANS: Record<Plan, PlanLimits> = {
  anonymous_free: { dailyLimit: 15, hourlyLimit: 5, monthlyLimit: null, maxInputChars: 3000, historyTurns: 8, savedHistory: false, tier: 'free' },
  registered_free: { dailyLimit: 25, hourlyLimit: 10, monthlyLimit: null, maxInputChars: 3000, historyTurns: 10, savedHistory: true, tier: 'free' },
  plus: { dailyLimit: 50, hourlyLimit: 30, monthlyLimit: 600, maxInputChars: 8000, historyTurns: 16, savedHistory: true, tier: 'paid' },
  business: { dailyLimit: 500, hourlyLimit: 120, monthlyLimit: null, maxInputChars: 12000, historyTurns: 20, savedHistory: true, tier: 'paid' },
};

/** Resolve plan from auth + subscription status. Client-declared plan is IGNORED. */
export function resolvePlan(opts: { authenticated: boolean; subscriptionPlan?: string | null; subscriptionActive?: boolean }): Plan {
  if (opts.subscriptionActive && opts.subscriptionPlan === 'business') return 'business';
  if (opts.subscriptionActive && opts.subscriptionPlan === 'plus') return 'plus';
  if (opts.authenticated) return 'registered_free';
  return 'anonymous_free';
}

export interface UsageSnapshot {
  dayCount: number;
  hourCount: number;
  monthCount?: number;
}

export interface QuotaDecision {
  allowed: boolean;
  remaining: number;
  reason?: 'daily' | 'hourly' | 'monthly';
}

export function decideQuota(usage: UsageSnapshot, plan: Plan): QuotaDecision {
  const l = PLANS[plan];
  if (l.monthlyLimit != null) {
    const remMonth = Math.max(0, l.monthlyLimit - (usage.monthCount ?? 0));
    if ((usage.monthCount ?? 0) >= l.monthlyLimit) return { allowed: false, remaining: 0, reason: 'monthly' };
    if (usage.dayCount >= l.dailyLimit) return { allowed: false, remaining: remMonth, reason: 'daily' };
    return { allowed: true, remaining: Math.min(remMonth, Math.max(0, l.dailyLimit - usage.dayCount)) };
  }
  const remDay = Math.max(0, l.dailyLimit - usage.dayCount);
  if (usage.dayCount >= l.dailyLimit) return { allowed: false, remaining: 0, reason: 'daily' };
  if (usage.hourCount >= l.hourlyLimit) return { allowed: false, remaining: remDay, reason: 'hourly' };
  return { allowed: true, remaining: remDay };
}

/** Model fallback chain for a plan. Anonymous never gets paid fallback unless allowed. */
export function modelChain(cfg: BackendConfig, plan: Plan): string[] {
  const l = PLANS[plan];
  if (l.tier === 'paid') return [cfg.openrouter.modelPaid, ...cfg.openrouter.modelPaidFallbacks];
  const chain = [cfg.openrouter.modelFree, ...cfg.openrouter.modelFreeFallbacks];
  if (plan === 'anonymous_free' && cfg.openrouter.allowPaidFallbackForFree) chain.push(cfg.openrouter.modelPaid);
  return chain;
}

export function planLimitsPublic(plan: Plan) {
  const l = PLANS[plan];
  return { plan, dailyLimit: l.dailyLimit, hourlyLimit: l.hourlyLimit, monthlyLimit: l.monthlyLimit, maxInputChars: l.maxInputChars, savedHistory: l.savedHistory };
}
