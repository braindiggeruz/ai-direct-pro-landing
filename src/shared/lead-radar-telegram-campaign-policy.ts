/**
 * Public, non-secret policy defaults shared by the Lead Radar campaign UI and
 * both server runtimes. Production configuration is pinned to these values by
 * tests so the operator-facing copy cannot silently drift from enforcement.
 */
export const LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT = 30;
export const LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_MIN_INTERVAL_SECONDS = 120;

function boundedPolicyInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d+$/u.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

/** Missing values use the safe release default; malformed values remain null. */
export function parseLeadRadarTelegramCampaignDailyLimit(value: string | undefined): number | null {
  return boundedPolicyInteger(
    value,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT,
    1,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT,
  );
}

/** Missing values use the safe release default; malformed values remain null. */
export function parseLeadRadarTelegramCampaignMinimumIntervalSeconds(value: string | undefined): number | null {
  return boundedPolicyInteger(
    value,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_MIN_INTERVAL_SECONDS,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_MIN_INTERVAL_SECONDS,
    3_600,
  );
}

export function resolveLeadRadarTelegramCampaignPolicy(input: {
  dailyLimit?: string;
  minimumIntervalSeconds?: string;
}): {
  dailyLimit: number;
  minimumIntervalSeconds: number;
  valid: boolean;
} {
  const dailyLimit = parseLeadRadarTelegramCampaignDailyLimit(input.dailyLimit);
  const minimumIntervalSeconds = parseLeadRadarTelegramCampaignMinimumIntervalSeconds(
    input.minimumIntervalSeconds,
  );
  return {
    dailyLimit: dailyLimit ?? LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT,
    minimumIntervalSeconds: minimumIntervalSeconds
      ?? LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_MIN_INTERVAL_SECONDS,
    valid: dailyLimit !== null && minimumIntervalSeconds !== null,
  };
}
