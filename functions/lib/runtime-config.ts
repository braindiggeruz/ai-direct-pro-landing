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
] as const;

export type RuntimeConfigKey = (typeof RUNTIME_CONFIG_KEYS)[number];
export type RuntimeConfig = Partial<Record<RuntimeConfigKey, string>>;

export interface RuntimeConfigCarrier {
  GPTBOT_RUNTIME_CONFIG?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hydrateRuntimeConfig<T extends RuntimeConfigCarrier>(env: T): T {
  if (!isRecord(env.GPTBOT_RUNTIME_CONFIG)) return env;

  const target = env as RuntimeConfigCarrier & Record<string, unknown>;
  for (const key of RUNTIME_CONFIG_KEYS) {
    const value = env.GPTBOT_RUNTIME_CONFIG[key];
    if (typeof value === 'string' && target[key] === undefined) target[key] = value;
  }
  return env;
}
