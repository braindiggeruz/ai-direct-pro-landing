import { parseMasterKey } from './crypto';

const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,80}$/u;
const INTERNAL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export function validGatewayRuntimeVersion(value: string | undefined): value is string {
  return value !== undefined && value !== 'unconfigured' && VERSION_PATTERN.test(value);
}

/** Legacy export retained for source-level Container tests only. */
export function validTdlibSourceCommit(value: string | undefined): value is string {
  return value !== undefined && /^[a-f0-9]{40}$/u.test(value);
}

export type TelegramAccountGatewayConfigurationBlocker =
  | 'gateway_internal_token_missing'
  | 'gateway_account_keys_missing'
  | 'gateway_storage_missing'
  | 'gateway_runtime_config_invalid';

export interface TelegramAccountGatewayConfigurationEnv {
  LEAD_RADAR_TELEGRAM_ACCOUNT_DATA_KEY?: string;
  LEAD_RADAR_TELEGRAM_ACCOUNT_ROUTING_KEY?: string;
  LEAD_RADAR_TELEGRAM_ACCOUNT_KEY_VERSION?: string;
  LEAD_RADAR_TELEGRAM_GATEWAY_VERSION?: string;
  LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN?: string;
  LEAD_RADAR_TELEGRAM_BRIDGE_PUBLIC_ORIGIN?: string;
  TELEGRAM_ACCOUNTS?: unknown;
  LEAD_RADAR_CAMPAIGN_MEDIA?: unknown;
}

function validPublicOrigin(value: string | undefined): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.pathname === '/'
      && url.search === ''
      && url.hash === '';
  } catch {
    return false;
  }
}

/** Coarse, non-secret readiness for the Workers Free local Bridge gateway. */
export function gatewayConfigurationBlockers(
  env: TelegramAccountGatewayConfigurationEnv,
): TelegramAccountGatewayConfigurationBlocker[] {
  const blockers: TelegramAccountGatewayConfigurationBlocker[] = [];
  if (!INTERNAL_TOKEN_PATTERN.test(env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN ?? '')) {
    blockers.push('gateway_internal_token_missing');
  }
  if (parseMasterKey(env.LEAD_RADAR_TELEGRAM_ACCOUNT_DATA_KEY) === null
    || parseMasterKey(env.LEAD_RADAR_TELEGRAM_ACCOUNT_ROUTING_KEY) === null) {
    blockers.push('gateway_account_keys_missing');
  }
  if (!env.TELEGRAM_ACCOUNTS || !env.LEAD_RADAR_CAMPAIGN_MEDIA) {
    blockers.push('gateway_storage_missing');
  }
  if (!validGatewayRuntimeVersion(env.LEAD_RADAR_TELEGRAM_ACCOUNT_KEY_VERSION)
    || !validGatewayRuntimeVersion(env.LEAD_RADAR_TELEGRAM_GATEWAY_VERSION)
    || !validPublicOrigin(env.LEAD_RADAR_TELEGRAM_BRIDGE_PUBLIC_ORIGIN)) {
    blockers.push('gateway_runtime_config_invalid');
  }
  return blockers;
}
