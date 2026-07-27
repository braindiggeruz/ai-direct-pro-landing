export type SotuvchiOnboardingErrorCode =
  | 'invalid_context'
  | 'invalid_name'
  | 'invalid_locale'
  | 'invalid_delivery'
  | 'invalid_payment'
  | 'invalid_step'
  | 'invalid_version'
  | 'invalid_idempotency_key'
  | 'invalid_storefront_code'
  | 'identity_not_found'
  | 'onboarding_not_found'
  | 'onboarding_conflict'
  | 'onboarding_finished'
  | 'owner_required'
  | 'tenant_mismatch'
  | 'storefront_collision'
  | 'persistence_failed'
  | 'corrupt_row';

export class SotuvchiOnboardingError extends Error {
  constructor(public readonly code: SotuvchiOnboardingErrorCode) {
    super(`sotuvchi onboarding failed: ${code}`);
    this.name = 'SotuvchiOnboardingError';
  }
}
