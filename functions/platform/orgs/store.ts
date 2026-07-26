import type { Locale } from '../contracts';
import {
  MEMBERSHIP_ROLES,
  MEMBERSHIP_STATUSES,
  ORGANIZATION_STATUSES,
  type Contact,
  type ContactResolution,
  type CreateOrganizationInput,
  type Membership,
  type MembershipResolution,
  type MembershipRole,
  type MembershipStatus,
  type Organization,
  type OrganizationStatus,
  type OrganizationWithOwner,
  type UpdateOrganizationInput,
} from './types';

const ORGANIZATION_COLUMNS =
  'id, name, slug, status, default_locale, created_at, updated_at';
const MEMBERSHIP_COLUMNS =
  'id, org_id, identity_id, role, status, created_at, updated_at';
const CONTACT_COLUMNS =
  'id, org_id, identity_id, locale, created_at, updated_at, last_seen_at';

const ORG_STATUSES = new Set<string>(ORGANIZATION_STATUSES);
const ROLES = new Set<string>(MEMBERSHIP_ROLES);
const MEMBERSHIP_STATE = new Set<string>(MEMBERSHIP_STATUSES);
const LOCALES = new Set<string>(['ru', 'uz']);

const ORGANIZATIONS_DDL = [
  `CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'archived')),
    default_locale TEXT NOT NULL CHECK (default_locale IN ('ru', 'uz')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS memberships (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    identity_id TEXT NOT NULL REFERENCES identities(id) ON DELETE RESTRICT,
    role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
    status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (org_id, identity_id)
  )`,
  `CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    identity_id TEXT NOT NULL REFERENCES identities(id) ON DELETE RESTRICT,
    locale TEXT CHECK (locale IS NULL OR locale IN ('ru', 'uz')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT,
    UNIQUE (org_id, identity_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_memberships_org_status
    ON memberships (org_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_memberships_identity_status
    ON memberships (identity_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_identity
    ON contacts (identity_id)`,
] as const;

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  default_locale: string;
  created_at: string;
  updated_at: string;
}

interface MembershipRow {
  id: string;
  org_id: string;
  identity_id: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ContactRow {
  id: string;
  org_id: string;
  identity_id: string;
  locale: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
}

type OrganizationField = 'id' | 'name' | 'slug' | 'status' | 'defaultLocale' | 'update';

export class OrganizationValidationError extends Error {
  readonly field: OrganizationField;

  constructor(field: OrganizationField) {
    super(`organization rejected: invalid ${field}`);
    this.name = 'OrganizationValidationError';
    this.field = field;
  }
}

export class OrganizationNotFoundError extends Error {
  constructor() {
    super('organization not found');
    this.name = 'OrganizationNotFoundError';
  }
}

export class DuplicateSlugError extends Error {
  constructor() {
    super('organization slug already exists');
    this.name = 'DuplicateSlugError';
  }
}

export class MembershipRoleError extends Error {
  constructor() {
    super('membership rejected: invalid role');
    this.name = 'MembershipRoleError';
  }
}

export class TenantStoreError extends Error {
  readonly code: 'persistence_failed' | 'corrupt_row';

  constructor(code: TenantStoreError['code']) {
    super(`tenant store failed: ${code}`);
    this.name = 'TenantStoreError';
    this.code = code;
  }
}

export interface OrganizationStore {
  createOrganization(input: CreateOrganizationInput): Promise<Organization>;
  createOrganizationWithOwner(
    input: CreateOrganizationInput,
    identityId: string,
  ): Promise<OrganizationWithOwner>;
  getOrganizationById(orgId: string): Promise<Organization | null>;
  getOrganizationBySlug(slug: string): Promise<Organization | null>;
  updateOrganization(
    orgId: string,
    input: UpdateOrganizationInput,
  ): Promise<Organization>;
  addMembership(
    orgId: string,
    identityId: string,
    role: MembershipRole,
  ): Promise<MembershipResolution>;
  getMembership(orgId: string, identityId: string): Promise<Membership | null>;
  listMemberships(orgId: string): Promise<Membership[]>;
  hasRole(orgId: string, identityId: string, role: MembershipRole): Promise<boolean>;
  disableMembership(
    orgId: string,
    identityId: string,
  ): Promise<'disabled' | 'already_disabled' | 'not_found'>;
  getOrCreateContact(
    orgId: string,
    identityId: string,
    locale?: Locale,
  ): Promise<ContactResolution>;
  getContact(orgId: string, contactId: string): Promise<Contact | null>;
  findContactByIdentity(orgId: string, identityId: string): Promise<Contact | null>;
  touchContact(
    orgId: string,
    contactId: string,
    seenAt?: string,
  ): Promise<'touched' | 'not_found'>;
}

function requireId(value: string, field: OrganizationField = 'id'): string {
  if (typeof value !== 'string') throw new OrganizationValidationError(field);
  const normalized = value.trim();
  if (!normalized || normalized.length > 120) throw new OrganizationValidationError(field);
  return normalized;
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function normalizeName(value: string): string {
  if (typeof value !== 'string') throw new OrganizationValidationError('name');
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 120 || hasControlCharacters(normalized)) {
    throw new OrganizationValidationError('name');
  }
  return normalized;
}

function normalizeSlug(value: string): string {
  if (typeof value !== 'string') throw new OrganizationValidationError('slug');
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (
    normalized.length < 3 ||
    normalized.length > 48 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)
  ) {
    throw new OrganizationValidationError('slug');
  }
  return normalized;
}

function requireOrganizationStatus(value: OrganizationStatus): OrganizationStatus {
  if (!ORG_STATUSES.has(value)) throw new OrganizationValidationError('status');
  return value;
}

function requireLocale(value: Locale, field: OrganizationField = 'defaultLocale'): Locale {
  if (!LOCALES.has(value)) throw new OrganizationValidationError(field);
  return value;
}

function requireRole(value: MembershipRole): MembershipRole {
  if (!ROLES.has(value)) throw new MembershipRoleError();
  return value;
}

function requireSeenAt(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new OrganizationValidationError('update');
  return value;
}

function normalizeOrganizationInput(input: CreateOrganizationInput): {
  name: string;
  slug: string;
  status: OrganizationStatus;
  defaultLocale: Locale;
} {
  return {
    name: normalizeName(input.name),
    slug: normalizeSlug(input.slug),
    status: requireOrganizationStatus(input.status ?? 'active'),
    defaultLocale: requireLocale(input.defaultLocale),
  };
}

function fromOrganizationRow(row: OrganizationRow): Organization {
  if (!ORG_STATUSES.has(row.status) || !LOCALES.has(row.default_locale)) {
    throw new TenantStoreError('corrupt_row');
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as OrganizationStatus,
    defaultLocale: row.default_locale as Locale,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromMembershipRow(row: MembershipRow): Membership {
  if (!ROLES.has(row.role) || !MEMBERSHIP_STATE.has(row.status)) {
    throw new TenantStoreError('corrupt_row');
  }
  return {
    id: row.id,
    orgId: row.org_id,
    identityId: row.identity_id,
    role: row.role as MembershipRole,
    status: row.status as MembershipStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromContactRow(row: ContactRow): Contact {
  if (row.locale !== null && !LOCALES.has(row.locale)) {
    throw new TenantStoreError('corrupt_row');
  }
  return {
    id: row.id,
    orgId: row.org_id,
    identityId: row.identity_id,
    locale: row.locale as Locale | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  };
}

function newId(prefix: 'org' | 'membership' | 'contact'): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function bootstrapOrganizationsStore(db: D1Database): Promise<void> {
  for (const statement of ORGANIZATIONS_DDL) await db.prepare(statement).run();
}

export function createOrganizationStore(db: D1Database): OrganizationStore {
  async function findOrganizationByNormalizedSlug(slug: string): Promise<Organization | null> {
    const row = await db
      .prepare(`SELECT ${ORGANIZATION_COLUMNS} FROM organizations WHERE slug = ?`)
      .bind(slug)
      .first<OrganizationRow>();
    return row ? fromOrganizationRow(row) : null;
  }

  async function findMembership(
    orgId: string,
    identityId: string,
  ): Promise<Membership | null> {
    const row = await db
      .prepare(`SELECT ${MEMBERSHIP_COLUMNS}
                FROM memberships
                WHERE org_id = ? AND identity_id = ?`)
      .bind(orgId, identityId)
      .first<MembershipRow>();
    return row ? fromMembershipRow(row) : null;
  }

  async function findContact(
    orgId: string,
    identityId: string,
  ): Promise<Contact | null> {
    const row = await db
      .prepare(`SELECT ${CONTACT_COLUMNS}
                FROM contacts
                WHERE org_id = ? AND identity_id = ?`)
      .bind(orgId, identityId)
      .first<ContactRow>();
    return row ? fromContactRow(row) : null;
  }

  return {
    async createOrganization(input: CreateOrganizationInput): Promise<Organization> {
      const normalized = normalizeOrganizationInput(input);
      const createdAt = new Date().toISOString();
      const organization: Organization = {
        id: newId('org'),
        ...normalized,
        createdAt,
        updatedAt: createdAt,
      };
      try {
        await db
          .prepare(`INSERT INTO organizations
            (id, name, slug, status, default_locale, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            organization.id,
            organization.name,
            organization.slug,
            organization.status,
            organization.defaultLocale,
            organization.createdAt,
            organization.updatedAt,
          )
          .run();
        return organization;
      } catch {
        if (await findOrganizationByNormalizedSlug(organization.slug)) {
          throw new DuplicateSlugError();
        }
        throw new TenantStoreError('persistence_failed');
      }
    },

    async createOrganizationWithOwner(
      input: CreateOrganizationInput,
      identityId: string,
    ): Promise<OrganizationWithOwner> {
      const normalized = normalizeOrganizationInput(input);
      const ownerIdentityId = requireId(identityId);
      const createdAt = new Date().toISOString();
      const organization: Organization = {
        id: newId('org'),
        ...normalized,
        createdAt,
        updatedAt: createdAt,
      };
      const membership: Membership = {
        id: newId('membership'),
        orgId: organization.id,
        identityId: ownerIdentityId,
        role: 'owner',
        status: 'active',
        createdAt,
        updatedAt: createdAt,
      };
      try {
        await db.batch([
          db.prepare(`INSERT INTO organizations
            (id, name, slug, status, default_locale, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .bind(
              organization.id,
              organization.name,
              organization.slug,
              organization.status,
              organization.defaultLocale,
              organization.createdAt,
              organization.updatedAt,
            ),
          db.prepare(`INSERT INTO memberships
            (id, org_id, identity_id, role, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .bind(
              membership.id,
              membership.orgId,
              membership.identityId,
              membership.role,
              membership.status,
              membership.createdAt,
              membership.updatedAt,
            ),
        ]);
        return { organization, membership };
      } catch {
        const conflict = await findOrganizationByNormalizedSlug(organization.slug);
        if (conflict && conflict.id !== organization.id) throw new DuplicateSlugError();
        throw new TenantStoreError('persistence_failed');
      }
    },

    async getOrganizationById(orgId: string): Promise<Organization | null> {
      const id = requireId(orgId);
      const row = await db
        .prepare(`SELECT ${ORGANIZATION_COLUMNS} FROM organizations WHERE id = ?`)
        .bind(id)
        .first<OrganizationRow>();
      return row ? fromOrganizationRow(row) : null;
    },

    async getOrganizationBySlug(slug: string): Promise<Organization | null> {
      return findOrganizationByNormalizedSlug(normalizeSlug(slug));
    },

    async updateOrganization(
      orgId: string,
      input: UpdateOrganizationInput,
    ): Promise<Organization> {
      const id = requireId(orgId);
      if (
        input.name === undefined &&
        input.slug === undefined &&
        input.status === undefined &&
        input.defaultLocale === undefined
      ) {
        throw new OrganizationValidationError('update');
      }
      const name = input.name === undefined ? null : normalizeName(input.name);
      const slug = input.slug === undefined ? null : normalizeSlug(input.slug);
      const status =
        input.status === undefined ? null : requireOrganizationStatus(input.status);
      const locale =
        input.defaultLocale === undefined ? null : requireLocale(input.defaultLocale);
      const updatedAt = new Date().toISOString();
      try {
        const result = await db
          .prepare(`UPDATE organizations
            SET name = COALESCE(?, name),
                slug = COALESCE(?, slug),
                status = COALESCE(?, status),
                default_locale = COALESCE(?, default_locale),
                updated_at = ?
            WHERE id = ?`)
          .bind(name, slug, status, locale, updatedAt, id)
          .run();
        if ((result.meta?.changes ?? 0) === 0) throw new OrganizationNotFoundError();
      } catch (error) {
        if (error instanceof OrganizationNotFoundError) throw error;
        if (slug) {
          const conflict = await findOrganizationByNormalizedSlug(slug);
          if (conflict && conflict.id !== id) throw new DuplicateSlugError();
        }
        throw new TenantStoreError('persistence_failed');
      }
      const updated = await this.getOrganizationById(id);
      if (!updated) throw new OrganizationNotFoundError();
      return updated;
    },

    async addMembership(
      orgId: string,
      identityId: string,
      role: MembershipRole,
    ): Promise<MembershipResolution> {
      const tenantId = requireId(orgId);
      const memberIdentityId = requireId(identityId);
      const safeRole = requireRole(role);
      const createdAt = new Date().toISOString();
      const membership: Membership = {
        id: newId('membership'),
        orgId: tenantId,
        identityId: memberIdentityId,
        role: safeRole,
        status: 'active',
        createdAt,
        updatedAt: createdAt,
      };
      const result = await db
        .prepare(`INSERT OR IGNORE INTO memberships
          (id, org_id, identity_id, role, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          membership.id,
          membership.orgId,
          membership.identityId,
          membership.role,
          membership.status,
          membership.createdAt,
          membership.updatedAt,
        )
        .run();
      if ((result.meta?.changes ?? 0) > 0) {
        return { status: 'created', membership };
      }
      const existing = await findMembership(tenantId, memberIdentityId);
      if (!existing) throw new TenantStoreError('persistence_failed');
      return { status: 'existing', membership: existing };
    },

    async getMembership(orgId: string, identityId: string): Promise<Membership | null> {
      return findMembership(requireId(orgId), requireId(identityId));
    },

    async listMemberships(orgId: string): Promise<Membership[]> {
      const tenantId = requireId(orgId);
      const rows = await db
        .prepare(`SELECT ${MEMBERSHIP_COLUMNS}
                  FROM memberships
                  WHERE org_id = ?
                  ORDER BY created_at ASC, id ASC`)
        .bind(tenantId)
        .all<MembershipRow>();
      return (rows.results ?? []).map(fromMembershipRow);
    },

    async hasRole(
      orgId: string,
      identityId: string,
      role: MembershipRole,
    ): Promise<boolean> {
      const row = await db
        .prepare(`SELECT id
                  FROM memberships
                  WHERE org_id = ? AND identity_id = ? AND role = ? AND status = 'active'`)
        .bind(requireId(orgId), requireId(identityId), requireRole(role))
        .first<{ id: string }>();
      return Boolean(row);
    },

    async disableMembership(
      orgId: string,
      identityId: string,
    ): Promise<'disabled' | 'already_disabled' | 'not_found'> {
      const tenantId = requireId(orgId);
      const memberIdentityId = requireId(identityId);
      const updatedAt = new Date().toISOString();
      const result = await db
        .prepare(`UPDATE memberships
                  SET status = 'disabled', updated_at = ?
                  WHERE org_id = ? AND identity_id = ? AND status = 'active'`)
        .bind(updatedAt, tenantId, memberIdentityId)
        .run();
      if ((result.meta?.changes ?? 0) > 0) return 'disabled';
      return await findMembership(tenantId, memberIdentityId)
        ? 'already_disabled'
        : 'not_found';
    },

    async getOrCreateContact(
      orgId: string,
      identityId: string,
      locale?: Locale,
    ): Promise<ContactResolution> {
      const tenantId = requireId(orgId);
      const contactIdentityId = requireId(identityId);
      const safeLocale = locale === undefined ? null : requireLocale(locale);
      const createdAt = new Date().toISOString();
      const contact: Contact = {
        id: newId('contact'),
        orgId: tenantId,
        identityId: contactIdentityId,
        locale: safeLocale,
        createdAt,
        updatedAt: createdAt,
        lastSeenAt: null,
      };
      const result = await db
        .prepare(`INSERT OR IGNORE INTO contacts
          (id, org_id, identity_id, locale, created_at, updated_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?, NULL)`)
        .bind(
          contact.id,
          contact.orgId,
          contact.identityId,
          contact.locale,
          contact.createdAt,
          contact.updatedAt,
        )
        .run();
      if ((result.meta?.changes ?? 0) > 0) {
        return { status: 'created', contact };
      }
      const existing = await findContact(tenantId, contactIdentityId);
      if (!existing) throw new TenantStoreError('persistence_failed');
      return { status: 'existing', contact: existing };
    },

    async getContact(orgId: string, contactId: string): Promise<Contact | null> {
      const row = await db
        .prepare(`SELECT ${CONTACT_COLUMNS}
                  FROM contacts
                  WHERE org_id = ? AND id = ?`)
        .bind(requireId(orgId), requireId(contactId))
        .first<ContactRow>();
      return row ? fromContactRow(row) : null;
    },

    async findContactByIdentity(
      orgId: string,
      identityId: string,
    ): Promise<Contact | null> {
      return findContact(requireId(orgId), requireId(identityId));
    },

    async touchContact(
      orgId: string,
      contactId: string,
      seenAt = new Date().toISOString(),
    ): Promise<'touched' | 'not_found'> {
      const result = await db
        .prepare(`UPDATE contacts
                  SET last_seen_at = ?, updated_at = ?
                  WHERE org_id = ? AND id = ?`)
        .bind(
          requireSeenAt(seenAt),
          new Date().toISOString(),
          requireId(orgId),
          requireId(contactId),
        )
        .run();
      return (result.meta?.changes ?? 0) > 0 ? 'touched' : 'not_found';
    },
  };
}
