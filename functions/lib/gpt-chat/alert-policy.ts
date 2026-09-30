// Which service alerts reach the owner, how often, and how they read (D6).
//
// Every failure is RECORDED in gpt_service_alerts (billing-maintenance-store.ts
// recordServiceAlert), in every billing mode. Only URGENT codes send a
// Telegram message (deliverServiceAlerts). The rest are background: they never
// page on their own, they appear as context ("фон за час") in the next urgent
// message and they stay visible in D1 for the admin. Without that split the
// chat's ordinary per-turn failures (rate_limit, timeout, provider_error,
// empty) would be ~8 messages a day and the owner would learn to ignore them;
// the watchdog turns a real pattern of them into chat_silence / chat_degraded.
//
// Patterns are SQLite GLOB patterns: an exact code, or a prefix and '*'.
// deliverServiceAlerts claims rows with this same list in SQL, so the
// classifier here and the query cannot disagree. Codes are [a-z0-9_] only.
export const URGENT_ALERT_PATTERNS: readonly string[] = [
  // The chat cannot answer anybody.
  "chat_no_key",
  "chat_account_unavailable",
  // Every candidate of the chain was refused as an unknown model: the chain
  // is stale configuration (the 2026-09-04 outage), not a bad minute.
  "chat_model_unavailable",
  // Every candidate of the chain is cooling down, so no request was even sent;
  // an OpenRouter 402 on a paid model (no credits: only ':free' answers).
  "chat_models_cooling",
  "openrouter_credit_exhausted",
  // Hourly catalogue and key check (billing-operations-store.ts).
  "catalogue_*",
  "openrouter_key_credit_low",
  "openrouter_free_tier_50rpd",
  // Watchdog (watchdog-store.ts). chat_no_turns is the same silence one step
  // earlier (sessions open, no turn is ever reserved: Turnstile or D1), so it
  // pages like chat_silence.
  "chat_silence",
  "chat_degraded",
  "chat_no_turns",
  // Providers and channels a human has to fix.
  "zai_*",
  "bot_*",
  "click_*",
  "uzum_*",
  // POST /api/internal/gpt-billing-maintenance {"drill":true}.
  "drill",
];

/**
 * State alerts: they describe a standing condition that the hourly check
 * re-detects until a human acts (top up OpenRouter). One row per day, not per
 * hour, so the owner is reminded daily instead of paged 24 times.
 */
const DAILY_ALERTS: ReadonlySet<string> = new Set([
  "openrouter_key_credit_low",
  "openrouter_free_tier_50rpd",
]);

function globMatch(pattern: string, code: string): boolean {
  return pattern.endsWith("*")
    ? code.startsWith(pattern.slice(0, -1))
    : code === pattern;
}

export function isUrgentAlert(code: string): boolean {
  return URGENT_ALERT_PATTERNS.some((pattern) => globMatch(pattern, code));
}

/** gpt_service_alerts.id: one row per code per hour, or per day for DAILY_ALERTS. */
export function alertRowId(code: string, now: number): string {
  return DAILY_ALERTS.has(code)
    ? `${code}:d${Math.floor(now / 86_400_000)}`
    : `${code}:${Math.floor(now / 3_600_000)}`;
}

/** Owner-facing explanation. Fixed text only: no user text, key or provider message. */
const ALERT_TEXT: Readonly<Record<string, string>> = {
  chat_no_key: "нет ключа провайдера моделей, чат не отвечает",
  chat_account_unavailable: "провайдер отклонил аккаунт (401/402): ключ или кредиты",
  chat_model_unavailable: "вся цепочка моделей отклонена как неизвестная, проверьте OPENROUTER_MODEL_*",
  chat_models_cooling: "все модели цепочки на паузе после сбоев, чат не отвечает",
  openrouter_credit_exhausted: "OpenRouter: нет кредитов (402), платные модели выключены на 15 минут, отвечают только :free",
  catalogue_model_unavailable: "модель цепочки пропала из OpenRouter или вышла за потолок цены; она выключена на час",
  catalogue_check_failed: "проверка моделей OpenRouter не прошла",
  openrouter_key_credit_low: "OpenRouter: лимит ключа почти исчерпан",
  openrouter_free_tier_50rpd: "OpenRouter: аккаунт на бесплатном уровне, 50 запросов к :free в сутки на всё (чат, бот, AEO)",
  chat_silence: "ходы были, но ни одного ответа за окно сторожа",
  chat_degraded: "за час ответ получили меньше половины ходов",
  chat_no_turns: "сессии открываются, а ходов нет (Turnstile или D1)",
  zai_balance_exhausted: "Z.ai: закончился баланс, ответы идут через OpenRouter",
  zai_auth_failed: "Z.ai: ключ отклонён, ответы идут через OpenRouter",
  drill: "учебный алерт: канал доставки работает",
};

export interface UrgentLine {
  code: string;
  /** Rows claimed for this code: the hours (days for state alerts) it fired in. */
  count: number;
}

/** One plain-text Telegram message for a batch of urgent codes. */
export function renderAlertMessage(urgent: UrgentLine[], background: string[]): string {
  const lines = urgent.map(({ code, count }) => {
    const text = ALERT_TEXT[code];
    return `• ${code}${count > 1 ? ` ×${count}` : ""}${text ? ` — ${text}` : ""}`;
  });
  return [
    "GPTBot.uz AI-чат: срочно",
    ...lines,
    ...(background.length ? [`Фон за час: ${background.join(", ")}`] : []),
    "Проверьте Workers logs, модели и баланс OpenRouter.",
  ].join("\n");
}
