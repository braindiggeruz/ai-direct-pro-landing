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
  // Javob (@gptbotuz_bot, functions/lib/telegram/handler.ts) records every
  // failed reply as bot_<code>. Like the chat, only what stops every reply
  // pages; a single rate_limit, timeout or validation_failed is background,
  // and the watchdog turns a pattern of them into bot_silent.
  "bot_no_key",
  "bot_account_unavailable",
  "bot_model_unavailable",
  "bot_models_cooling",
  "bot_silent",
  // Signing in on the site through the bot failed on our side (D1): a payer
  // cannot sign in (functions/lib/telegram/web-login.ts).
  "bot_login_failed",
  // Providers and channels a human has to fix.
  "zai_*",
  "click_*",
  "uzum_*",
  // POST /api/internal/gpt-billing-maintenance {"drill":true}.
  "drill",
  // Studio (functions/lib/studio/limits.ts StudioAlert), each code by name,
  // never "studio_*". Each is a state of the UTC day, so it pages once a day
  // (DAILY_ALERTS), never once an hour while it lasts. Spec §2.5, §5.4:
  // "владельцу уходит алерт".
  //   the paid emergency stop: paid generations fail until 05:00 Tashkent;
  "studio_paid_stop",
  //   the free tier is closed for everybody until 05:00 Tashkent;
  "studio_free_budget_spent",
  "studio_ramp_full",
  //   80% of the free budget: new (young) identities are refused from now on;
  "studio_free_budget_80",
  //   the site's free counters passed STUDIO_FREE_ALERT_DECKS / _PHOTOS (only told).
  "studio_free_decks_high",
  "studio_free_photos_high",
];

/**
 * State alerts: they describe a standing condition that the hourly check
 * re-detects until a human acts (top up OpenRouter). One row per day, not per
 * hour, so the owner is reminded daily instead of paged 24 times. The free
 * tier's spent daily budget (model-spend-store.ts) is one too, and only
 * informational (background): ':free' keeps answering until the UTC day ends.
 * So is bot_silent: its window is 24 h, so three failed updates nobody follows
 * up keep it true on every watchdog run of the next day, which hourly rows
 * would turn into a page an hour. So is uzum_receipt_missing: the Uzum step
 * of every tick finds the same receipt missing until Uzum prints it or a
 * person settles it (uzum-maintenance.ts). So are the studio's codes: each
 * describes the UTC day's spend or counters, which stay where they are until
 * the day ends.
 */
const DAILY_ALERTS: ReadonlySet<string> = new Set([
  "openrouter_key_credit_low",
  "openrouter_free_tier_50rpd",
  "free_paid_budget_exhausted",
  "bot_silent",
  "uzum_receipt_missing",
  "studio_paid_stop",
  "studio_free_budget_spent",
  "studio_ramp_full",
  "studio_free_budget_80",
  "studio_free_decks_high",
  "studio_free_photos_high",
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
  bot_no_key: "бот @gptbotuz_bot: нет ключа OpenRouter, бот не отвечает",
  bot_account_unavailable: "бот @gptbotuz_bot: OpenRouter отклонил аккаунт (401/402)",
  bot_model_unavailable: "бот @gptbotuz_bot: вся цепочка моделей отклонена как неизвестная",
  bot_models_cooling: "бот @gptbotuz_bot: все модели на паузе после сбоев, ответ не отправлен",
  bot_silent: "бот @gptbotuz_bot: за сутки 3+ сбоя и ни одного ответа",
  zai_balance_exhausted: "Z.ai: закончился баланс, ответы идут через OpenRouter",
  zai_auth_failed: "Z.ai: ключ отклонён, ответы идут через OpenRouter",
  click_fiscal_failed: "Click: чек ОФД не пробит после 6 попыток или за сутки после оплаты, см. last_error в gpt_fiscal_receipts",
  click_unknown_order: "Click: подписанный запрос о заказе, которого у нас нет в этом режиме (ответ -5); сверьте кабинет Click",
  click_amount_mismatch: "Click: подписанный запрос с другой суммой (ответ -2), доступ не выдан; сверьте кабинет Click",
  uzum_fiscal_failed: "Uzum: чек через Fiscalization API не пробит после 6 попыток или за сутки после оплаты, см. last_error в gpt_fiscal_receipts",
  uzum_receipt_missing: "Uzum: сутки после оплаты картой нет чека автофискализации, проверьте кабинет Uzum",
  uzum_amount_mismatch: "Uzum: сумма или номер заказа в ответе Uzum не совпали, доступ не выдан",
  uzum_paid_after_cancel: "Uzum: деньги списаны по уже закрытому заказу, верните их или выдайте доступ вручную",
  uzum_partial_refund: "Uzum: частичный возврат, доступ не тронут, разберитесь вручную",
  uzum_status_conflict: "Uzum: после оплаты пришёл отказ, доступ не тронут, сверьте с кабинетом",
  uzum_confirm_recovered: "Uzum: оплата в приложении завершена после сбоя подтверждения, сверьте её с кабинетом Uzum",
  uzum_processing: "Uzum: ошибка сервера при обработке уведомления, Uzum повторит запрос",
  drill: "учебный алерт: канал доставки работает",
  studio_paid_stop: "Студия: аварийный стоп платного (STUDIO_PAID_DAILY_USD_STOP), платные генерации отказывают до 05:00 Ташкента",
  studio_free_budget_spent: "Студия: дневной бюджет бесплатного (STUDIO_FREE_DAILY_USD) израсходован, бесплатные презентации закрыты до 05:00 Ташкента",
  studio_ramp_full: "Студия: потолок разгона (STUDIO_RAMP_DECKS_DAILY) достигнут, бесплатные презентации закрыты до 05:00 Ташкента",
  studio_free_budget_80: "Студия: израсходовано 80% бюджета бесплатного, новым посетителям (моложе суток) отказ до 05:00 Ташкента",
  studio_free_decks_high: "Студия: бесплатных презентаций за сутки больше STUDIO_FREE_ALERT_DECKS, проверьте отчёт",
  studio_free_photos_high: "Студия: бесплатных фото за сутки больше STUDIO_FREE_ALERT_PHOTOS, проверьте отчёт",
};

/** The fixed explanation of a code (the admin shows it beside the count), or null. */
export function alertText(code: string): string | null {
  return Object.prototype.hasOwnProperty.call(ALERT_TEXT, code) ? ALERT_TEXT[code] : null;
}

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
