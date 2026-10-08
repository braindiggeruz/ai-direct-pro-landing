import type { StudioProvider, StudioPublicConfig } from '../api';

/** Public availability only; the server authorizes the actual checkout. */
export function sellingProviders(config: StudioPublicConfig): readonly StudioProvider[] {
  return config.payments.mode && config.termsVersion && config.plans.length ? config.payments.providers : [];
}
