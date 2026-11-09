import type { Env } from '../../_types';
import { TgSenderCampaignSender } from './tg-sender-client';
import { isTgSenderBinding, TG_SENDER_ORIGIN, TG_SENDER_PREFIX, type TgSenderBinding } from './tg-sender-contract';

type TransportEnv = Pick<Env, 'LEAD_RADAR_TELEGRAM_TRANSPORT_MODE' | 'LEAD_RADAR_TG_SENDER_ORIGIN'
  | 'LEAD_RADAR_TG_SENDER_TOKEN' | 'LEAD_RADAR_TG_SENDER_BINDING_JSON' | 'LEAD_RADAR_TG_SENDER_SERVICE'>;

export function tgSenderMode(env: TransportEnv): boolean {
  return env.LEAD_RADAR_TELEGRAM_TRANSPORT_MODE === 'tg_sender';
}

/** Server-owned configuration. The browser cannot supply a host or account binding. */
export function tgSenderConfiguration(env: TransportEnv, orgId?: string): {
  origin: string; token: string; binding: TgSenderBinding;
} | null {
  if (!tgSenderMode(env) || !/^[A-Za-z0-9_-]{43,128}$/u.test(env.LEAD_RADAR_TG_SENDER_TOKEN ?? '')) return null;
  try {
    const url = new URL(env.LEAD_RADAR_TG_SENDER_ORIGIN ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
      || url.pathname !== '/' || (url.hostname !== 'tg-sender-v2.braindigger-uz.workers.dev'
        && !/^[a-z0-9-]+\.up\.railway\.app$/u.test(url.hostname))) return null;
    const binding = JSON.parse(env.LEAD_RADAR_TG_SENDER_BINDING_JSON ?? 'null') as TgSenderBinding;
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)
      || Object.keys(binding).sort().join(',') !== 'account_id,account_ref,org_id,sender_fingerprint'
      || !isTgSenderBinding(binding) || (orgId !== undefined && binding.org_id !== orgId)) return null;
    return {origin: url.origin, token: env.LEAD_RADAR_TG_SENDER_TOKEN!, binding};
  } catch { return null; }
}

export function configuredTgSender(env: TransportEnv, orgId: string, fetcher: typeof fetch = fetch): TgSenderCampaignSender | null {
  const configuration = tgSenderConfiguration(env, orgId);
  if (!configuration) return null;
  return new TgSenderCampaignSender({
    token: configuration.token, binding: configuration.binding, enabled: true,
    onReadinessFailure: stage => console.warn('lead_radar.tg_sender_readiness_failed', {stage}),
    service: {fetch: async (input, init) => {
      const url = new URL(input);
      if (url.origin !== TG_SENDER_ORIGIN || !url.pathname.startsWith(`${TG_SENDER_PREFIX}/`) || url.search || url.hash) {
        throw new Error('tg_sender_route_invalid');
      }
      const target = `${configuration.origin}${url.pathname}`;
      const options = {...init, redirect: 'manual' as const};
      if (env.LEAD_RADAR_TG_SENDER_SERVICE) {
        if (configuration.origin !== 'https://tg-sender-v2.braindigger-uz.workers.dev') {
          throw new Error('tg_sender_binding_origin_mismatch');
        }
        return env.LEAD_RADAR_TG_SENDER_SERVICE.fetch(target, options);
      }
      return fetcher(target, options);
    }},
  });
}
