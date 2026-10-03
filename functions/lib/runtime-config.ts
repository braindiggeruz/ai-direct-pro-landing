/**
 * Public, non-secret runtime configuration is stored in one Cloudflare JSON
 * binding. Workers Free counts every text/secret binding toward a 64-variable
 * limit, so keeping each public flag as a separate binding eventually makes an
 * otherwise valid Pages deployment impossible.
 *
 * The allowlist prevents a value accidentally added to the JSON object from
 * impersonating a secret or a native binding. Explicit top-level bindings win,
 * which keeps local overrides and emergency dashboard overrides predictable.
 */
export const RUNTIME_CONFIG_KEYS = [
  'AEO_MEASUREMENTS_ENABLED',
  'AEO_MEASUREMENT_MODELS',
  'FIRST_PARTY_AUTOMATION_ENABLED',
  'BUNZY_DEFAULT_LOCALE',
  'OPENROUTER_MODEL_FREE',
  'OPENROUTER_MODEL_FREE_FALLBACKS',
  'OPENROUTER_MODEL_PAID',
  'OPENROUTER_MODEL_PAID_FALLBACKS',
  'GPT_HANDOFF_BOT_USERNAME',
  'GPT_HANDOFF_TTL_MINUTES',
  'GPT_LEAD_MAX_PER_HOUR',
  'GPT_LEAD_MAX_PER_DAY',
  'GPT_HANDOFF_MAX_PER_HOUR',
  'GPT_LEAD_GLOBAL_MAX_PER_HOUR',
  'GPT_HANDOFF_GLOBAL_MAX_PER_HOUR',
  'GPT_LEAD_TURNSTILE_AFTER',
  'GPT_OWNER_NOTIFY_MAX_PER_HOUR',
  'LEAD_RADAR_ADMISSION_ENABLED',
  'LEAD_RADAR_PROCESSING_ENABLED',
  'LEAD_RADAR_CRAWLER_ENABLED',
  'LEAD_RADAR_CONTACT_ENABLED',
  'LEAD_RADAR_TELEGRAM_DISCOVERY_ENABLED',
  'LEAD_RADAR_TELEGRAM_TRANSPORT_MODE',
  'LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED',
  'LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED',
  'LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED',
  'LEAD_RADAR_PERSONAL_RETENTION_DAYS',
  'LEAD_RADAR_ALLOWED_ORGS',
  'LEAD_RADAR_MAX_DISPATCH_PER_TICK',
  'LEAD_RADAR_SIGNAL_ENABLED',
  'LEAD_RADAR_SIGNAL_AUTOJOIN_MODE',
  'LEAD_RADAR_SIGNAL_DISCOVERY_ENABLED',
  'LEAD_RADAR_TELEGRAM_BOT_USERNAME',
  'LEAD_RADAR_CONTACT_DAILY_LIMIT',
  'LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT',
  'LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS',
  'TELEGRAM_AGENTS_BOT_USERNAME',
  'MARKET_MINI_APP_ENABLED',
  'MARKET_MINI_APP_BUYER_ENABLED',
  'MARKET_MINI_APP_SELLER_READS_ENABLED',
  'MARKET_MINI_APP_SELLER_COMMANDS_ENABLED',
  'MARKET_MINI_APP_ORIGINS',
  'MARKET_MINI_APP_URL',
  'MARKET_MINI_APP_BUILD_ID',
  'MARKET_VOICE_SEARCH_ENABLED',
  'MARKET_AI_SEARCH_ENABLED',
  'MARKET_SELLER_MEDIA_UPLOAD_ENABLED',
  'MARKET_CABINET_ENABLED',
  'MARKET_CABINET_HOME_V2',
  'MARKET_NAV_BACK_ENABLED',
  'MARKET_QUICKPOST_ENABLED',
  'MARKET_QUICKPOST_AI_ENABLED',
  'MARKET_CLASSIFIEDS_DISCOVERY_ENABLED',
  'MARKET_PRIVATE_LISTING_ENABLED',
  'MARKET_OWNER_TELEGRAM_BINDING_ENABLED',
  'BORMI_ADMIN_V2_ENABLED',
  // Z.ai provider switch for the web chat (functions/lib/gpt-chat/model-provider.ts).
  // Public only; the key itself is the secret ZAI_API_KEY and never listed here.
  'GPT_MODEL_PROVIDER',
  'GPT_ZAI_EVAL_APPROVED',
  'ZAI_MODEL_FREE',
  'ZAI_MODEL_PAID',
  'ZAI_TIERS',
  'ZAI_PREPAID_MODELS',
  'ZAI_TIMEOUT_MS',
  // Uzum Bank payments (functions/lib/gpt-chat/uzum-config.ts). Public only; the
  // terminal/API key and Merchant API login live in the secret UZUM_CREDENTIALS_JSON.
  'UZUM_API',
  'UZUM_CHECKOUT_BASE_URL',
  'UZUM_CHECKOUT_TEST_BASE_URL',
  'UZUM_AUTOFISCAL',
  'UZUM_FISCAL_BASE_URL',
  'UZUM_FISCAL_TEST_BASE_URL',
  // Payments of the AI pack (functions/lib/gpt-chat/billing-config.ts): which
  // providers run, each one's mode, the live switch and the offer. Public
  // only; credentials are the secrets GPT_CLICK_CREDENTIALS_JSON and
  // UZUM_CREDENTIALS_JSON and never listed here.
  'GPT_PAYMENT_PROVIDERS',
  'GPT_BILLING_MODE',
  'GPT_BILLING_MODE_CLICK',
  'GPT_BILLING_MODE_UZUM',
  'GPT_BILLING_LIVE_READY',
  'GPT_BILLING_TERMS_RU',
  'GPT_BILLING_TERMS_UZ',
  'GPT_BILLING_TERMS_VERSION',
  'GPT_BILLING_TERMS_APPROVED_AT',
  // Fiscal receipt parameters shared by Click and Uzum (fiscal-config.ts).
  'GPT_FISCAL_IKPU',
  'GPT_FISCAL_PACKAGE_CODE',
  'GPT_FISCAL_VAT_PERCENT',
  'GPT_FISCAL_TIN',
  // Limit card -> assistant bot button (functions/api/gpt/account.ts botHandoff).
  'GPT_BOT_HANDOFF_ENABLED',
  // Sign-in through the bot: "pick" | "code" (functions/lib/gpt-chat/billing-config.ts).
  'GPT_BOT_LOGIN_MODE',
  // Owner alerts and the silence watchdog (functions/lib/gpt-chat/alert-policy.ts,
  // watchdog-store.ts). The Telegram channel itself stays in GPT_NOTIFY_* secrets.
  'GPT_ALERTS_ENABLED',
  'GPT_ALERTS_MAX_PER_HOUR',
  'GPT_WATCHDOG_WINDOW_MINUTES',
  'GPT_WATCHDOG_MIN_TURNS',
  // Model runtime of the web chat (functions/lib/gpt-chat/config.ts).
  'GPT_MAX_OUTPUT_TOKENS',
  'GPT_FIRST_CONTENT_TIMEOUT_MS',
  'GPT_FREE_TIER_PAID_PRIMARY',
  'GPT_FREE_PAID_DAILY_USD',
  'GPT_STOP_CHARGE_MIN_CHARS',
  // Hash salt switch-over and message retention (functions/lib/gpt-chat/hash.ts,
  // salt-rekey-store.ts, retention-store.ts). The salt itself is the secret
  // GPT_HASH_SALT and never listed here.
  'GPT_HASH_SALT_SINCE',
  'GPT_MESSAGES_RETENTION_DAYS',
  // Javob's free replies a day and a month (functions/lib/telegram/billing.ts).
  'TELEGRAM_FREE_DAILY_LIMIT',
  'TELEGRAM_FREE_MONTHLY_LIMIT',
  // Javob's public @username (functions/lib/telegram/config.ts); was a secret.
  'TELEGRAM_ASSISTANT_BOT_USERNAME',
] as const;

export type RuntimeConfigKey = (typeof RUNTIME_CONFIG_KEYS)[number];
export type RuntimeConfig = Partial<Record<RuntimeConfigKey, string>>;

export interface RuntimeConfigCarrier {
  GPTBOT_RUNTIME_CONFIG?: unknown;
  GPTBOT_RUNTIME_CONFIG_JSON?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hydrateRuntimeConfig<T extends RuntimeConfigCarrier>(env: T): T {
  let config: Record<string, unknown> | null = null;
  if (typeof env.GPTBOT_RUNTIME_CONFIG_JSON === 'string') {
    try {
      const parsed: unknown = JSON.parse(env.GPTBOT_RUNTIME_CONFIG_JSON);
      if (isRecord(parsed)) config = parsed;
    } catch {
      // Invalid configuration fails closed: no public feature flag is enabled.
    }
  }
  if (!config && isRecord(env.GPTBOT_RUNTIME_CONFIG)) config = env.GPTBOT_RUNTIME_CONFIG;
  if (!config) return env;

  const target = env as RuntimeConfigCarrier & Record<string, unknown>;
  for (const key of RUNTIME_CONFIG_KEYS) {
    const value = config[key];
    if (typeof value === 'string' && target[key] === undefined) target[key] = value;
  }
  return env;
}
