export const IDENTITY_PROVIDERS = ['telegram', 'web', 'email', 'phone', 'api'] as const;

export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];

export interface Identity {
  id: string;
  provider: IdentityProvider;
  externalId: string;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityLookup {
  provider: IdentityProvider;
  externalId: string;
}

export interface IdentityResolution {
  status: 'created' | 'existing';
  identity: Identity;
}
