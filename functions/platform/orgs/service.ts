import {
  createIdentityService,
  type Identity,
  type IdentityProvider,
} from '../identity';
import { ensureOrganizationsSchema } from './schema';
import {
  createOrganizationStore,
  DuplicateSlugError,
  type OrganizationStore,
} from './store';
import type {
  CreateOrganizationInput,
  Membership,
  Organization,
} from './types';

export interface CreateOrganizationForOwnerInput {
  identity: {
    provider: IdentityProvider;
    externalId: string;
  };
  organization: CreateOrganizationInput;
}

export interface OrganizationOwnerResult {
  identityStatus: 'created' | 'existing';
  identity: Identity;
  organization: Organization;
  membership: Membership;
}

export class OrganizationsService {
  private readonly store: OrganizationStore;

  constructor(private readonly db: D1Database) {
    this.store = createOrganizationStore(db);
  }

  async createOrganizationForOwner(
    input: CreateOrganizationForOwnerInput,
  ): Promise<OrganizationOwnerResult> {
    await ensureOrganizationsSchema(this.db);

    // Validate and reject an existing slug before creating a new identity.
    // A concurrent slug race remains safe because the final org+membership
    // D1 batch is transactional and the store maps the conflict.
    if (await this.store.getOrganizationBySlug(input.organization.slug)) {
      throw new DuplicateSlugError();
    }

    const identityResult = await createIdentityService(this.db).getOrCreateIdentity(
      input.identity.provider,
      input.identity.externalId,
    );
    const result = await this.store.createOrganizationWithOwner(
      input.organization,
      identityResult.identity.id,
    );
    return {
      identityStatus: identityResult.status,
      identity: identityResult.identity,
      organization: result.organization,
      membership: result.membership,
    };
  }
}

export function createOrganizationsService(db: D1Database): OrganizationsService {
  return new OrganizationsService(db);
}
