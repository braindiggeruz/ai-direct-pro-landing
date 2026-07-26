import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createIdentityStore,
  IdentityValidationError,
  type IdentityStore,
} from '../functions/platform/identity';
import {
  createOrganizationStore,
  createOrganizationsService,
  DuplicateSlugError,
  ensureOrganizationsSchema,
  MembershipRoleError,
  OrganizationValidationError,
  TenantStoreError,
  type OrganizationStore,
} from '../functions/platform/orgs';

interface IdentityRow {
  id: string;
  provider: string;
  external_id: string;
  created_at: string;
  updated_at: string;
}

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

interface FakeTables {
  identities: IdentityRow[];
  organizations: OrganizationRow[];
  memberships: MembershipRow[];
  contacts: ContactRow[];
}

interface FakeStatement {
  sql: string;
  args: unknown[];
  bind(...args: unknown[]): FakeStatement;
  run(): Promise<{ meta: { changes: number } }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
}

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function cloneTables(tables: FakeTables): FakeTables {
  return {
    identities: tables.identities.map((row) => ({ ...row })),
    organizations: tables.organizations.map((row) => ({ ...row })),
    memberships: tables.memberships.map((row) => ({ ...row })),
    contacts: tables.contacts.map((row) => ({ ...row })),
  };
}

function restoreTables(target: FakeTables, snapshot: FakeTables): void {
  target.identities.splice(0, target.identities.length, ...snapshot.identities);
  target.organizations.splice(0, target.organizations.length, ...snapshot.organizations);
  target.memberships.splice(0, target.memberships.length, ...snapshot.memberships);
  target.contacts.splice(0, target.contacts.length, ...snapshot.contacts);
}

function makeD1(options: { failMembershipInsert?: boolean } = {}) {
  const tables: FakeTables = {
    identities: [],
    organizations: [],
    memberships: [],
    contacts: [],
  };

  function run(sql: string, args: unknown[]): { meta: { changes: number } } {
    const statement = compactSql(sql);
    if (/^CREATE (?:TABLE|INDEX)/.test(statement)) return { meta: { changes: 0 } };

    if (/INSERT OR IGNORE INTO identities/.test(statement)) {
      const [id, provider, externalId, createdAt, updatedAt] = args.map(String);
      if (
        tables.identities.some(
          (row) =>
            row.id === id ||
            (row.provider === provider && row.external_id === externalId),
        )
      ) {
        return { meta: { changes: 0 } };
      }
      tables.identities.push({
        id,
        provider,
        external_id: externalId,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return { meta: { changes: 1 } };
    }

    if (/INSERT INTO organizations/.test(statement)) {
      const [id, name, slug, status, locale, createdAt, updatedAt] = args.map(String);
      if (
        tables.organizations.some((row) => row.id === id || row.slug === slug)
      ) {
        throw new Error('fake unique organization constraint');
      }
      tables.organizations.push({
        id,
        name,
        slug,
        status,
        default_locale: locale,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return { meta: { changes: 1 } };
    }

    if (/UPDATE organizations SET/.test(statement)) {
      const [name, slug, status, locale, updatedAt, id] = args;
      const row = tables.organizations.find((item) => item.id === id);
      if (!row) return { meta: { changes: 0 } };
      if (
        slug !== null &&
        tables.organizations.some((item) => item.id !== id && item.slug === slug)
      ) {
        throw new Error('fake unique organization slug constraint');
      }
      if (name !== null) row.name = String(name);
      if (slug !== null) row.slug = String(slug);
      if (status !== null) row.status = String(status);
      if (locale !== null) row.default_locale = String(locale);
      row.updated_at = String(updatedAt);
      return { meta: { changes: 1 } };
    }

    if (/INSERT(?: OR IGNORE)? INTO memberships/.test(statement)) {
      if (options.failMembershipInsert) throw new Error('fake membership failure');
      const [id, orgId, identityId, role, status, createdAt, updatedAt] = args.map(String);
      if (
        !tables.organizations.some((row) => row.id === orgId) ||
        !tables.identities.some((row) => row.id === identityId)
      ) {
        throw new Error('fake membership foreign key');
      }
      const duplicate = tables.memberships.some(
        (row) =>
          row.id === id ||
          (row.org_id === orgId && row.identity_id === identityId),
      );
      if (duplicate && /OR IGNORE/.test(statement)) return { meta: { changes: 0 } };
      if (duplicate) throw new Error('fake membership unique constraint');
      tables.memberships.push({
        id,
        org_id: orgId,
        identity_id: identityId,
        role,
        status,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return { meta: { changes: 1 } };
    }

    if (/UPDATE memberships SET status = 'disabled'/.test(statement)) {
      const [updatedAt, orgId, identityId] = args;
      const row = tables.memberships.find(
        (item) =>
          item.org_id === orgId &&
          item.identity_id === identityId &&
          item.status === 'active',
      );
      if (!row) return { meta: { changes: 0 } };
      row.status = 'disabled';
      row.updated_at = String(updatedAt);
      return { meta: { changes: 1 } };
    }

    if (/INSERT OR IGNORE INTO contacts/.test(statement)) {
      const [id, orgId, identityId, locale, createdAt, updatedAt] = args;
      if (
        !tables.organizations.some((row) => row.id === orgId) ||
        !tables.identities.some((row) => row.id === identityId)
      ) {
        throw new Error('fake contact foreign key');
      }
      if (
        tables.contacts.some(
          (row) =>
            row.id === id ||
            (row.org_id === orgId && row.identity_id === identityId),
        )
      ) {
        return { meta: { changes: 0 } };
      }
      tables.contacts.push({
        id: String(id),
        org_id: String(orgId),
        identity_id: String(identityId),
        locale: locale === null ? null : String(locale),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
        last_seen_at: null,
      });
      return { meta: { changes: 1 } };
    }

    if (/UPDATE contacts SET last_seen_at/.test(statement)) {
      const [lastSeenAt, updatedAt, orgId, contactId] = args;
      const row = tables.contacts.find(
        (item) => item.org_id === orgId && item.id === contactId,
      );
      if (!row) return { meta: { changes: 0 } };
      row.last_seen_at = String(lastSeenAt);
      row.updated_at = String(updatedAt);
      return { meta: { changes: 1 } };
    }

    throw new Error(`unexpected D1 run statement: ${statement.split(' ')[0]}`);
  }

  function first(sql: string, args: unknown[]): unknown {
    const statement = compactSql(sql);
    if (/FROM identities WHERE provider = \? AND external_id = \?/.test(statement)) {
      return tables.identities.find(
        (row) => row.provider === args[0] && row.external_id === args[1],
      ) ?? null;
    }
    if (/FROM identities WHERE id = \?/.test(statement)) {
      return tables.identities.find((row) => row.id === args[0]) ?? null;
    }
    if (/FROM organizations WHERE slug = \?/.test(statement)) {
      return tables.organizations.find((row) => row.slug === args[0]) ?? null;
    }
    if (/FROM organizations WHERE id = \?/.test(statement)) {
      return tables.organizations.find((row) => row.id === args[0]) ?? null;
    }
    if (
      /SELECT id FROM memberships WHERE org_id = \? AND identity_id = \? AND role = \? AND status = 'active'/.test(
        statement,
      )
    ) {
      const row = tables.memberships.find(
        (item) =>
          item.org_id === args[0] &&
          item.identity_id === args[1] &&
          item.role === args[2] &&
          item.status === 'active',
      );
      return row ? { id: row.id } : null;
    }
    if (/FROM memberships WHERE org_id = \? AND identity_id = \?/.test(statement)) {
      return tables.memberships.find(
        (row) => row.org_id === args[0] && row.identity_id === args[1],
      ) ?? null;
    }
    if (/FROM contacts WHERE org_id = \? AND identity_id = \?/.test(statement)) {
      return tables.contacts.find(
        (row) => row.org_id === args[0] && row.identity_id === args[1],
      ) ?? null;
    }
    if (/FROM contacts WHERE org_id = \? AND id = \?/.test(statement)) {
      return tables.contacts.find(
        (row) => row.org_id === args[0] && row.id === args[1],
      ) ?? null;
    }
    throw new Error(`unexpected D1 first statement: ${statement.split(' ')[0]}`);
  }

  function all(sql: string, args: unknown[]): { results: unknown[] } {
    const statement = compactSql(sql);
    if (/FROM memberships WHERE org_id = \?/.test(statement)) {
      return {
        results: tables.memberships
          .filter((row) => row.org_id === args[0])
          .sort(
            (left, right) =>
              left.created_at.localeCompare(right.created_at) ||
              left.id.localeCompare(right.id),
          ),
      };
    }
    throw new Error(`unexpected D1 all statement: ${statement.split(' ')[0]}`);
  }

  function prepare(sql: string): FakeStatement {
    return {
      sql,
      args: [],
      bind(...args: unknown[]): FakeStatement {
        this.args = args;
        return this;
      },
      run() {
        return Promise.resolve(run(this.sql, this.args));
      },
      first<T>() {
        return Promise.resolve(first(this.sql, this.args) as T | null);
      },
      all<T>() {
        return Promise.resolve(all(this.sql, this.args) as { results: T[] });
      },
    };
  }

  const database = {
    prepare,
    async batch(statements: D1PreparedStatement[]) {
      const snapshot = cloneTables(tables);
      try {
        const results: Array<{ meta: { changes: number } }> = [];
        for (const statement of statements) {
          const fake = statement as unknown as FakeStatement;
          results.push(run(fake.sql, fake.args));
        }
        return results;
      } catch (error) {
        restoreTables(tables, snapshot);
        throw error;
      }
    },
    _tables: tables,
  };
  return database as unknown as D1Database & { _tables: FakeTables };
}

async function setup(options: { failMembershipInsert?: boolean } = {}) {
  const db = makeD1(options);
  await ensureOrganizationsSchema(db);
  return {
    db,
    identities: createIdentityStore(db),
    organizations: createOrganizationStore(db),
    tables: db._tables,
  };
}

async function createIdentity(
  store: IdentityStore,
  externalId = '100000001',
) {
  return (await store.getOrCreateIdentity('telegram', externalId)).identity;
}

async function createOrganization(
  store: OrganizationStore,
  slug: string,
  status: 'active' | 'archived' = 'active',
) {
  return store.createOrganization({
    name: `Test ${slug}`,
    slug,
    status,
    defaultLocale: 'ru',
  });
}

test('identity is created with a provider-neutral domain shape', async () => {
  const { identities, tables } = await setup();
  const result = await identities.getOrCreateIdentity('telegram', '100000001');
  assert.equal(result.status, 'created');
  assert.equal(result.identity.provider, 'telegram');
  assert.equal(tables.identities.length, 1);
});

test('repeated identity getOrCreate is idempotent', async () => {
  const { identities, tables } = await setup();
  const first = await identities.getOrCreateIdentity('telegram', '100000001');
  const second = await identities.getOrCreateIdentity('telegram', '100000001');
  assert.equal(second.status, 'existing');
  assert.equal(second.identity.id, first.identity.id);
  assert.equal(tables.identities.length, 1);
});

test('concurrent identity getOrCreate converges through the unique key', async () => {
  const { identities, tables } = await setup();
  const [first, second] = await Promise.all([
    identities.getOrCreateIdentity('telegram', '100000001'),
    identities.getOrCreateIdentity('telegram', '100000001'),
  ]);
  assert.equal(first.identity.id, second.identity.id);
  assert.equal(tables.identities.length, 1);
});

test('the same external id in different providers creates different identities', async () => {
  const { identities } = await setup();
  const telegram = await identities.getOrCreateIdentity('telegram', '100000001');
  const web = await identities.getOrCreateIdentity('web', '100000001');
  assert.notEqual(telegram.identity.id, web.identity.id);
});

test('empty external identity is rejected without echoing its value', async () => {
  const { identities } = await setup();
  await assert.rejects(
    () => identities.getOrCreateIdentity('web', '   '),
    (error: unknown) =>
      error instanceof IdentityValidationError &&
      error.code === 'invalid_external_id' &&
      !error.message.includes('   '),
  );
});

test('Telegram external id remains an exact string and is never coerced to number', async () => {
  const { identities, tables } = await setup();
  const externalId = '100000001';
  const result = await identities.getOrCreateIdentity('telegram', externalId);
  assert.equal(result.identity.externalId, externalId);
  assert.equal(typeof tables.identities[0].external_id, 'string');
});

test('email and phone identities are minimally normalized', async () => {
  const { identities } = await setup();
  const email = await identities.getOrCreateIdentity('email', ' TEST@example.invalid ');
  const phone = await identities.getOrCreateIdentity('phone', ' +998000000000 ');
  assert.equal(email.identity.externalId, 'test@example.invalid');
  assert.equal(phone.identity.externalId, '+998000000000');
});

test('identity lookup by id and normalized provider key returns the same entity', async () => {
  const { identities } = await setup();
  const created = await identities.getOrCreateIdentity('email', 'TEST@example.invalid');
  assert.equal((await identities.getIdentityById(created.identity.id))?.id, created.identity.id);
  assert.equal(
    (await identities.findIdentity('email', ' test@example.invalid '))?.id,
    created.identity.id,
  );
});

test('runtime tenancy bootstrap is safe when requested repeatedly', async () => {
  const db = makeD1();
  await ensureOrganizationsSchema(db);
  await ensureOrganizationsSchema(db);
  assert.deepEqual(db._tables, {
    identities: [],
    organizations: [],
    memberships: [],
    contacts: [],
  });
});

test('organization is created with normalized safe slug', async () => {
  const { organizations } = await setup();
  const organization = await organizations.createOrganization({
    name: '  Test   Store  ',
    slug: ' Test_Store ',
    defaultLocale: 'uz',
  });
  assert.equal(organization.name, 'Test Store');
  assert.equal(organization.slug, 'test-store');
  assert.equal(organization.status, 'active');
});

test('duplicate organization slug returns a controlled error', async () => {
  const { organizations, tables } = await setup();
  await createOrganization(organizations, 'store-one');
  await assert.rejects(
    () => createOrganization(organizations, 'store-one'),
    DuplicateSlugError,
  );
  assert.equal(tables.organizations.length, 1);
});

test('invalid organization locale and status are rejected', async () => {
  const { organizations } = await setup();
  await assert.rejects(
    () => organizations.createOrganization({
      name: 'Test',
      slug: 'test-locale',
      defaultLocale: 'en' as never,
    }),
    OrganizationValidationError,
  );
  await assert.rejects(
    () => organizations.createOrganization({
      name: 'Test',
      slug: 'test-status',
      status: 'deleted' as never,
      defaultLocale: 'ru',
    }),
    OrganizationValidationError,
  );
});

test('archived organization remains readable with archived status', async () => {
  const { organizations } = await setup();
  const created = await createOrganization(organizations, 'archived-store', 'archived');
  assert.equal((await organizations.getOrganizationById(created.id))?.status, 'archived');
});

test('organization update validates fields and preserves the tenant root', async () => {
  const { organizations } = await setup();
  const created = await createOrganization(organizations, 'update-store');
  const updated = await organizations.updateOrganization(created.id, {
    name: 'Updated Store',
    status: 'suspended',
  });
  assert.equal(updated.id, created.id);
  assert.equal(updated.name, 'Updated Store');
  assert.equal(updated.status, 'suspended');
});

test('owner membership is created and hasRole sees only active role', async () => {
  const { identities, organizations } = await setup();
  const identity = await createIdentity(identities);
  const org = await createOrganization(organizations, 'owner-store');
  const result = await organizations.addMembership(org.id, identity.id, 'owner');
  assert.equal(result.status, 'created');
  assert.equal(await organizations.hasRole(org.id, identity.id, 'owner'), true);
});

test('duplicate membership never replaces owner with staff', async () => {
  const { identities, organizations, tables } = await setup();
  const identity = await createIdentity(identities);
  const org = await createOrganization(organizations, 'member-duplicate');
  await organizations.addMembership(org.id, identity.id, 'owner');
  const duplicate = await organizations.addMembership(org.id, identity.id, 'staff');
  assert.equal(duplicate.status, 'existing');
  assert.equal(duplicate.membership.role, 'owner');
  assert.equal(tables.memberships.length, 1);
});

test('org B cannot read an org A membership', async () => {
  const { identities, organizations } = await setup();
  const identity = await createIdentity(identities);
  const orgA = await createOrganization(organizations, 'member-org-a');
  const orgB = await createOrganization(organizations, 'member-org-b');
  await organizations.addMembership(orgA.id, identity.id, 'staff');
  assert.ok(await organizations.getMembership(orgA.id, identity.id));
  assert.equal(await organizations.getMembership(orgB.id, identity.id), null);
});

test('listMemberships is isolated by its first orgId argument', async () => {
  const { identities, organizations } = await setup();
  const first = await createIdentity(identities, '100000001');
  const second = (
    await identities.getOrCreateIdentity('web', '100000001')
  ).identity;
  const orgA = await createOrganization(organizations, 'list-org-a');
  const orgB = await createOrganization(organizations, 'list-org-b');
  await organizations.addMembership(orgA.id, first.id, 'owner');
  await organizations.addMembership(orgB.id, second.id, 'owner');
  assert.deepEqual(
    (await organizations.listMemberships(orgA.id)).map((row) => row.identityId),
    [first.id],
  );
});

test('disableMembership cannot affect another organization', async () => {
  const { identities, organizations } = await setup();
  const identity = await createIdentity(identities);
  const orgA = await createOrganization(organizations, 'disable-org-a');
  const orgB = await createOrganization(organizations, 'disable-org-b');
  await organizations.addMembership(orgA.id, identity.id, 'owner');
  assert.equal(await organizations.disableMembership(orgB.id, identity.id), 'not_found');
  assert.equal((await organizations.getMembership(orgA.id, identity.id))?.status, 'active');
  assert.equal(await organizations.disableMembership(orgA.id, identity.id), 'disabled');
});

test('invalid membership role is rejected', async () => {
  const { identities, organizations } = await setup();
  const identity = await createIdentity(identities);
  const org = await createOrganization(organizations, 'invalid-role');
  await assert.rejects(
    () => organizations.addMembership(org.id, identity.id, 'admin' as never),
    MembershipRoleError,
  );
});

test('contact is created without profile PII fields', async () => {
  const { identities, organizations, tables } = await setup();
  const identity = await createIdentity(identities);
  const org = await createOrganization(organizations, 'contact-org-a');
  const result = await organizations.getOrCreateContact(org.id, identity.id, 'ru');
  assert.equal(result.status, 'created');
  assert.deepEqual(Object.keys(tables.contacts[0]).sort(), [
    'created_at',
    'id',
    'identity_id',
    'last_seen_at',
    'locale',
    'org_id',
    'updated_at',
  ]);
});

test('one identity has separate contacts in different organizations', async () => {
  const { identities, organizations } = await setup();
  const identity = await createIdentity(identities);
  const orgA = await createOrganization(organizations, 'contact-a');
  const orgB = await createOrganization(organizations, 'contact-b');
  const contactA = await organizations.getOrCreateContact(orgA.id, identity.id, 'ru');
  const contactB = await organizations.getOrCreateContact(orgB.id, identity.id, 'uz');
  assert.notEqual(contactA.contact.id, contactB.contact.id);
  assert.equal(contactA.contact.orgId, orgA.id);
  assert.equal(contactB.contact.orgId, orgB.id);
});

test('org B cannot read an org A contact even with the contact id', async () => {
  const { identities, organizations } = await setup();
  const identity = await createIdentity(identities);
  const orgA = await createOrganization(organizations, 'contact-read-a');
  const orgB = await createOrganization(organizations, 'contact-read-b');
  const contact = await organizations.getOrCreateContact(orgA.id, identity.id);
  assert.ok(await organizations.getContact(orgA.id, contact.contact.id));
  assert.equal(await organizations.getContact(orgB.id, contact.contact.id), null);
});

test('findContactByIdentity is tenant isolated', async () => {
  const { identities, organizations } = await setup();
  const identity = await createIdentity(identities);
  const orgA = await createOrganization(organizations, 'contact-find-a');
  const orgB = await createOrganization(organizations, 'contact-find-b');
  await organizations.getOrCreateContact(orgA.id, identity.id);
  assert.ok(await organizations.findContactByIdentity(orgA.id, identity.id));
  assert.equal(await organizations.findContactByIdentity(orgB.id, identity.id), null);
});

test('touchContact cannot update another organization contact', async () => {
  const { identities, organizations } = await setup();
  const identity = await createIdentity(identities);
  const orgA = await createOrganization(organizations, 'contact-touch-a');
  const orgB = await createOrganization(organizations, 'contact-touch-b');
  const contact = await organizations.getOrCreateContact(orgA.id, identity.id);
  const seenAt = '2026-07-26T12:00:00.000Z';
  assert.equal(
    await organizations.touchContact(orgB.id, contact.contact.id, seenAt),
    'not_found',
  );
  assert.equal(
    (await organizations.getContact(orgA.id, contact.contact.id))?.lastSeenAt,
    null,
  );
  assert.equal(
    await organizations.touchContact(orgA.id, contact.contact.id, seenAt),
    'touched',
  );
  assert.equal(
    (await organizations.getContact(orgA.id, contact.contact.id))?.lastSeenAt,
    seenAt,
  );
});

test('duplicate contact getOrCreate keeps one tenant row', async () => {
  const { identities, organizations, tables } = await setup();
  const identity = await createIdentity(identities);
  const org = await createOrganization(organizations, 'contact-duplicate');
  const first = await organizations.getOrCreateContact(org.id, identity.id);
  const second = await organizations.getOrCreateContact(org.id, identity.id, 'uz');
  assert.equal(second.status, 'existing');
  assert.equal(second.contact.id, first.contact.id);
  assert.equal(tables.contacts.length, 1);
});

test('invalid contact locale is rejected', async () => {
  const { identities, organizations } = await setup();
  const identity = await createIdentity(identities);
  const org = await createOrganization(organizations, 'contact-locale');
  await assert.rejects(
    () => organizations.getOrCreateContact(org.id, identity.id, 'en' as never),
    OrganizationValidationError,
  );
});

test('tenant API exposes orgId as the first business argument', async () => {
  const { organizations } = await setup();
  const getMembership: (
    orgId: string,
    identityId: string,
  ) => ReturnType<OrganizationStore['getMembership']> = organizations.getMembership;
  const getContact: (
    orgId: string,
    contactId: string,
  ) => ReturnType<OrganizationStore['getContact']> = organizations.getContact;
  assert.equal(getMembership.length, 2);
  assert.equal(getContact.length, 2);
});

test('createOrganizationForOwner creates identity, org and active owner', async () => {
  const { db, tables } = await setup();
  const result = await createOrganizationsService(db).createOrganizationForOwner({
    identity: { provider: 'telegram', externalId: '100000001' },
    organization: {
      name: 'Owner Store',
      slug: 'owner-service',
      defaultLocale: 'ru',
    },
  });
  assert.equal(result.membership.orgId, result.organization.id);
  assert.equal(result.membership.identityId, result.identity.id);
  assert.equal(result.membership.role, 'owner');
  assert.equal(tables.organizations.length, 1);
  assert.equal(tables.memberships.length, 1);
});

test('duplicate service slug leaves no new identity or tenant rows', async () => {
  const { db, organizations, tables } = await setup();
  await createOrganization(organizations, 'service-conflict');
  const before = {
    identities: tables.identities.length,
    organizations: tables.organizations.length,
    memberships: tables.memberships.length,
  };
  const externalId = 'test@example.invalid';
  await assert.rejects(
    () => createOrganizationsService(db).createOrganizationForOwner({
      identity: { provider: 'email', externalId },
      organization: {
        name: 'Conflict',
        slug: 'service-conflict',
        defaultLocale: 'ru',
      },
    }),
    (error: unknown) =>
      error instanceof DuplicateSlugError &&
      !error.message.includes(externalId),
  );
  assert.deepEqual(
    {
      identities: tables.identities.length,
      organizations: tables.organizations.length,
      memberships: tables.memberships.length,
    },
    before,
  );
});

test('D1 batch failure rolls back org and owner membership together', async () => {
  const { db, tables } = await setup({ failMembershipInsert: true });
  await assert.rejects(
    () => createOrganizationsService(db).createOrganizationForOwner({
      identity: { provider: 'telegram', externalId: '100000001' },
      organization: {
        name: 'Atomic Store',
        slug: 'atomic-store',
        defaultLocale: 'uz',
      },
    }),
    TenantStoreError,
  );
  assert.equal(tables.identities.length, 1, 'identity is an independent global record');
  assert.equal(tables.organizations.length, 0);
  assert.equal(tables.memberships.length, 0);
});
