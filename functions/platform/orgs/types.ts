import type { Locale } from '../contracts';

export const ORGANIZATION_STATUSES = ['active', 'suspended', 'archived'] as const;
export const MEMBERSHIP_ROLES = ['owner', 'staff'] as const;
export const MEMBERSHIP_STATUSES = ['active', 'disabled'] as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  defaultLocale: Locale;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  status?: OrganizationStatus;
  defaultLocale: Locale;
}

export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  status?: OrganizationStatus;
  defaultLocale?: Locale;
}

export interface Membership {
  id: string;
  orgId: string;
  identityId: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipResolution {
  status: 'created' | 'existing';
  membership: Membership;
}

export interface Contact {
  id: string;
  orgId: string;
  identityId: string;
  locale: Locale | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
}

export interface ContactResolution {
  status: 'created' | 'existing';
  contact: Contact;
}

export interface OrganizationWithOwner {
  organization: Organization;
  membership: Membership;
}
